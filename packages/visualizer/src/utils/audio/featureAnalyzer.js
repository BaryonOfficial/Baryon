import FeatureAnalyzerWorker from "./featureAnalyzer.worker?worker";

const MEL_BIN_COUNT = 64;
const HINT_WINDOW_SIZE = 32;
const MODEL_INPUT_SIZE = 10;
const LOW_BAND_LIMIT_HZ = 240;
const EPSILON = 1e-6;
const DEFAULT_MODEL_URL = new URL(
  "./assets/bootstrap-audio-hints.onnx",
  import.meta.url,
).toString();

export const DEFAULT_FEATURE_ANALYSIS_SETTINGS = Object.freeze({
  mode: "hybrid",
  runtime: "worker-wasm",
  hintCadenceMs: 32,
  maxHintAgeMs: 96,
  modelUrl: DEFAULT_MODEL_URL,
  modelVersion: "bootstrap-audio-hints-v1",
});

const MEL_FILTER_CACHE = new Map();

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hzToMel(frequency) {
  return 2595 * Math.log10(1 + frequency / 700);
}

function melToHz(mel) {
  return 700 * (10 ** (mel / 2595) - 1);
}

function createMelFilterbank(sampleRate, fftSize, binCount) {
  const key = `${sampleRate}:${fftSize}:${binCount}`;
  const cached = MEL_FILTER_CACHE.get(key);
  if (cached) {
    return cached;
  }

  const nyquist = sampleRate * 0.5;
  const minMel = hzToMel(20);
  const maxMel = hzToMel(Math.max(2000, nyquist));
  const melPoints = new Float32Array(binCount + 2);
  const hzPoints = new Float32Array(binCount + 2);
  const fftBins = new Uint16Array(binCount + 2);

  for (let index = 0; index < melPoints.length; index += 1) {
    melPoints[index] =
      minMel + ((maxMel - minMel) * index) / (melPoints.length - 1);
    hzPoints[index] = melToHz(melPoints[index]);
    fftBins[index] = Math.max(
      0,
      Math.min(
        fftSize / 2 - 1,
        Math.round(
          (hzPoints[index] / Math.max(1, nyquist)) * (fftSize / 2 - 1),
        ),
      ),
    );
  }

  const filters = Array.from({ length: binCount }, (_, index) => {
    const start = fftBins[index];
    const center = Math.max(start + 1, fftBins[index + 1]);
    const end = Math.max(center + 1, fftBins[index + 2]);
    return { start, center, end };
  });

  MEL_FILTER_CACHE.set(key, filters);
  return filters;
}

export function buildAnalysisSessionKey(status) {
  const inputMode = status?.isLiveInputActive
    ? status?.liveInputKind === "system"
      ? "system"
      : "live"
    : status?.isPlaying
      ? "file"
      : (status?.audioInputMode ?? "idle");

  if (inputMode === "file") {
    return `file:${status?.playbackSessionId ?? "none"}`;
  }

  if (inputMode === "live") {
    return "live";
  }

  if (inputMode === "system") {
    return "system";
  }

  return "idle";
}

function computeLowBandEnergy(fftMagnitudes, sampleRate, fftSize) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize) {
    return 0;
  }

  const nyquist = sampleRate * 0.5;
  let total = 0;
  let count = 0;
  for (let index = 0; index < fftMagnitudes.length; index += 1) {
    const frequency = (index / Math.max(1, fftMagnitudes.length - 1)) * nyquist;
    if (frequency > LOW_BAND_LIMIT_HZ) {
      break;
    }
    total += fftMagnitudes[index] ?? 0;
    count += 1;
  }

  return clamp01(total / Math.max(1, count));
}

function computeMelFrame(fftMagnitudes, sampleRate, fftSize) {
  const melFrame = new Float32Array(MEL_BIN_COUNT);
  if (!fftMagnitudes?.length || !sampleRate || !fftSize) {
    return melFrame;
  }

  const filters = createMelFilterbank(sampleRate, fftSize, MEL_BIN_COUNT);
  for (let filterIndex = 0; filterIndex < filters.length; filterIndex += 1) {
    const { start, center, end } = filters[filterIndex];
    let energy = 0;
    for (let binIndex = start; binIndex < center; binIndex += 1) {
      const weight = (binIndex - start) / Math.max(1, center - start);
      energy += (fftMagnitudes[binIndex] ?? 0) * weight;
    }
    for (let binIndex = center; binIndex <= end; binIndex += 1) {
      const weight = 1 - (binIndex - center) / Math.max(1, end - center);
      energy += (fftMagnitudes[binIndex] ?? 0) * Math.max(0, weight);
    }
    melFrame[filterIndex] = clamp01(Math.log1p(energy * 8) / Math.log(9));
  }

  return melFrame;
}

export function buildCompactAnalyzerFrame({
  analysisSnapshot,
  status,
  frameTimeMs,
  frameId = 0,
}) {
  const fftMagnitudes = analysisSnapshot?.fftMagnitudes;
  const fftSize = status?.fftSize ?? analysisSnapshot?.timeData?.length ?? 0;
  const sampleRate = status?.sampleRate ?? 44100;
  if (!fftMagnitudes?.length || !(fftSize > 0)) {
    return null;
  }

  const mel64 = computeMelFrame(fftMagnitudes, sampleRate, fftSize);
  return {
    frameId,
    frameTimeMs,
    inputMode: status?.audioInputMode ?? "idle",
    playbackSessionId: status?.playbackSessionId ?? null,
    sessionKey: buildAnalysisSessionKey(status),
    mel64,
    rms: clamp01(analysisSnapshot?.rms ?? 0),
    avgAmplitude: clamp01((analysisSnapshot?.avgAmplitude ?? 0) / 100),
    spectralCentroid: clamp01(analysisSnapshot?.spectralCentroid ?? 0),
    spectralFlux: clamp01(analysisSnapshot?.spectralFlux ?? 0),
    lowBandEnergy: computeLowBandEnergy(fftMagnitudes, sampleRate, fftSize),
  };
}

function normalizeHintPayload(status, hint, settings, frameTimeMs) {
  const ageMs =
    Number.isFinite(frameTimeMs) && Number.isFinite(hint?.frameTimeMs)
      ? Math.max(0, frameTimeMs - hint.frameTimeMs)
      : null;
  const sessionKey = buildAnalysisSessionKey(status);
  const active =
    Boolean(hint) &&
    hint.sessionKey === sessionKey &&
    ageMs != null &&
    ageMs <= settings.maxHintAgeMs;

  return {
    active,
    hintSource: active ? "onnx-worker" : "none",
    workerState: hint?.workerState ?? "none",
    workerStatus: hint?.workerStatus ?? null,
    ageMs,
    analysisLatencyMs: hint?.analysisLatencyMs ?? 0,
    pitchConfidence: active ? clamp01(hint?.pitchConfidence ?? 0) : 0,
    harmonicity: active ? clamp01(hint?.harmonicity ?? 0) : 0,
    transientSalience: active ? clamp01(hint?.transientSalience ?? 0) : 0,
    bassSalience: active ? clamp01(hint?.bassSalience ?? 0) : 0,
    novelty: active ? clamp01(hint?.novelty ?? 0) : 0,
    textureSpread: active ? clamp01(hint?.textureSpread ?? 0) : 0,
    voicingProbability: active ? clamp01(hint?.voicingProbability ?? 0) : 0,
    releaseBias: active ? clamp01(hint?.releaseBias ?? 0) : 0,
  };
}

export function normalizeFeatureAnalysisSettings(settings = {}) {
  return Object.freeze({
    ...DEFAULT_FEATURE_ANALYSIS_SETTINGS,
    ...settings,
    hintCadenceMs: Math.max(
      16,
      Math.round(
        settings?.hintCadenceMs ??
          DEFAULT_FEATURE_ANALYSIS_SETTINGS.hintCadenceMs,
      ),
    ),
    maxHintAgeMs: Math.max(
      32,
      Math.round(
        settings?.maxHintAgeMs ??
          DEFAULT_FEATURE_ANALYSIS_SETTINGS.maxHintAgeMs,
      ),
    ),
    modelUrl: settings?.modelUrl ?? DEFAULT_FEATURE_ANALYSIS_SETTINGS.modelUrl,
    modelVersion:
      settings?.modelVersion ?? DEFAULT_FEATURE_ANALYSIS_SETTINGS.modelVersion,
  });
}

export function createNoopAudioFeatureAnalyzer(settings = {}) {
  const normalizedSettings = normalizeFeatureAnalysisSettings(settings);
  return {
    settings: normalizedSettings,
    enqueueAnalysisFrame() {},
    /** @param {{ status?: string, frameTimeMs?: number }} [hints] */
    readHints({ status, frameTimeMs } = {}) {
      return normalizeHintPayload(
        status,
        {
          workerState: "none",
          workerStatus: null,
          frameTimeMs,
        },
        normalizedSettings,
        frameTimeMs,
      );
    },
    getStatus() {
      return {
        workerState: "none",
        workerStatus: null,
      };
    },
    dispose() {},
  };
}

export function createAudioFeatureAnalyzer(settings = {}, dependencies = {}) {
  const normalizedSettings = normalizeFeatureAnalysisSettings(settings);
  const workerFactory =
    dependencies.createWorker ?? (() => new FeatureAnalyzerWorker());

  if (
    normalizedSettings.mode !== "hybrid" ||
    normalizedSettings.runtime !== "worker-wasm"
  ) {
    return createNoopAudioFeatureAnalyzer(normalizedSettings);
  }

  let disposed = false;
  let frameId = 0;
  let latestHint = null;
  let workerState = "loading";
  let workerStatus = {
    state: "loading",
    reason: "initializing",
  };
  let worker = null;

  try {
    worker = workerFactory();
  } catch {
    return createNoopAudioFeatureAnalyzer(normalizedSettings);
  }

  const setWorkerStatus = (state, reason = null, error = null) => {
    workerState = state;
    workerStatus = {
      state,
      reason,
      error:
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : null,
    };
  };

  worker.addEventListener("message", (event) => {
    const payload = event?.data ?? {};
    if (payload.type === "status") {
      setWorkerStatus(
        payload.state ?? "none",
        payload.reason ?? null,
        payload.error,
      );
      return;
    }

    if (payload.type === "hint") {
      latestHint = {
        ...payload.hint,
        workerState,
        workerStatus,
      };
    }
  });

  worker.addEventListener("error", (event) => {
    setWorkerStatus("failed", "worker-error", event?.message ?? null);
  });

  worker.postMessage({
    type: "init",
    settings: {
      hintCadenceMs: normalizedSettings.hintCadenceMs,
      modelUrl: normalizedSettings.modelUrl,
      modelVersion: normalizedSettings.modelVersion,
      windowSize: HINT_WINDOW_SIZE,
      modelInputSize: MODEL_INPUT_SIZE,
    },
  });

  return {
    settings: normalizedSettings,
    enqueueAnalysisFrame({ analysisSnapshot, status, frameTimeMs }) {
      if (disposed || !worker || status?.audioInputMode === "idle") {
        return;
      }

      const compactFrame = buildCompactAnalyzerFrame({
        analysisSnapshot,
        status,
        frameTimeMs,
        frameId: frameId + 1,
      });
      if (!compactFrame) {
        return;
      }

      frameId += 1;
      const transfer = compactFrame.mel64?.buffer
        ? [compactFrame.mel64.buffer]
        : [];
      worker.postMessage(
        {
          type: "frame",
          frame: compactFrame,
        },
        transfer,
      );
    },
    /** @param {{ status?: string, frameTimeMs?: number }} [hints] */
    readHints({ status, frameTimeMs } = {}) {
      return normalizeHintPayload(
        status,
        latestHint,
        normalizedSettings,
        frameTimeMs,
      );
    },
    getStatus() {
      return {
        workerState,
        workerStatus,
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      worker?.terminate?.();
      worker = null;
      latestHint = null;
      setWorkerStatus("terminated", "disposed");
    },
  };
}

export { EPSILON, HINT_WINDOW_SIZE, MEL_BIN_COUNT };
