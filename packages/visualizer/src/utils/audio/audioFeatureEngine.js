import {
  FAST_SIGNAL_PATCH_ANALYSIS_KEYS,
  normalizeAudioFeatureEngineSettings,
} from "./audioFeatureEngineShared.js";
import { buildAnalysisSessionKey } from "./analysisSession.js";
import {
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../../core/cavityGeometry.js";
import {
  CAVITY_ACOUSTIC_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../../defaults.js";

export {
  DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS,
  normalizeAudioFeatureEngineSettings,
} from "./audioFeatureEngineShared.js";

const WORKER_PERF_STATUS_BASES = Object.freeze([
  "FastSignal",
  "Structural",
  "PeakScan",
  "ModalResolve",
  "Projection",
  "Chroma",
  "Tempo",
]);
const WORKER_PERF_STATUS_SUFFIXES = Object.freeze(["Ms", "LastMs", "MaxMs"]);

function createDefaultWorkerPerfStatus() {
  const status = {};
  for (const base of WORKER_PERF_STATUS_BASES) {
    for (const suffix of WORKER_PERF_STATUS_SUFFIXES) {
      status[`worker${base}${suffix}`] = 0;
    }
  }
  return status;
}

function cloneArray(values) {
  if (values instanceof Float32Array) {
    return new Float32Array(values);
  }
  if (values instanceof Uint8Array) {
    return new Uint8Array(values);
  }
  if (values instanceof Uint16Array) {
    return new Uint16Array(values);
  }
  if (values instanceof Uint32Array) {
    return new Uint32Array(values);
  }
  if (values instanceof Float64Array) {
    return new Float64Array(values);
  }
  return values ?? null;
}

function shouldIncludeTransportTimeData({ timeData }) {
  // Modal excitation always needs time-domain data for resonator excitation
  // regardless of input source.
  return Boolean(timeData?.length);
}

function collectTransferables(value, transferables = []) {
  if (!value || typeof value !== "object") {
    return transferables;
  }

  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    transferables.push(value.buffer);
    return transferables;
  }

  for (const nestedValue of Object.values(value)) {
    collectTransferables(nestedValue, transferables);
  }

  return transferables;
}

function resolveTransportFrameId(frameId, nextFrameId) {
  return Number.isFinite(frameId) && frameId > 0 ? frameId : nextFrameId;
}

export function buildAudioFeatureTransportFrame({
  analysisSnapshot,
  status,
  frameTimeMs,
  frameId = null,
  radius,
  includeSpectralLight = true,
  auditSettings = null,
  beatSettings = null,
  liveInputAnalysisSettings = null,
  cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS,
  boundaryMode = SIMULATION_DEFAULTS.boundaryMode,
  cavityGeometry = DEFAULT_REQUESTED_CAVITY_GEOMETRY,
}) {
  const audioInputMode = status?.audioInputMode ?? "idle";
  const liveInputDeviceKind =
    status?.liveInputDeviceKind ?? status?.liveInputKind ?? null;
  const liveInputAnalysisClass = status?.liveInputAnalysisClass ?? null;
  const liveInputAcousticIntent = status?.liveInputAcousticIntent ?? null;
  const fftMagnitudes = cloneArray(analysisSnapshot?.fftMagnitudes);
  const timeData = shouldIncludeTransportTimeData({
    timeData: analysisSnapshot?.timeData,
  })
    ? cloneArray(analysisSnapshot?.timeData)
    : null;

  return {
    frameId,
    frameTimeMs,
    sessionKey: buildAnalysisSessionKey(status),
    audioInputMode,
    isPlaying: Boolean(status?.isPlaying),
    isLiveInputActive: Boolean(status?.isLiveInputActive),
    playbackSessionId: status?.playbackSessionId ?? null,
    sampleRate: status?.sampleRate ?? null,
    fftSize: status?.fftSize ?? null,
    capacity: status?.capacity ?? null,
    liveInputKind: status?.liveInputKind ?? null,
    liveInputDeviceKind,
    liveInputCalibrationVersion: status?.liveInputCalibrationVersion ?? 0,
    liveInputAnalysisClass,
    liveInputAcousticIntent,
    radius,
    cavityAcousticScale: cavityAcousticScale
      ? { ...cavityAcousticScale }
      : CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode,
    cavityGeometry: normalizeCavityGeometry(cavityGeometry),
    includeSpectralLight: Boolean(includeSpectralLight),
    sourceMode: analysisSnapshot?.sourceMode ?? null,
    avgAmplitude: analysisSnapshot?.avgAmplitude ?? 0,
    rms: analysisSnapshot?.rms ?? 0,
    spectralCentroid: analysisSnapshot?.spectralCentroid ?? 0,
    spectralFlux: analysisSnapshot?.spectralFlux ?? 0,
    fftMagnitudes,
    timeData,
    auditSettings: auditSettings ? { ...auditSettings } : null,
    beatSettings: beatSettings ? { ...beatSettings } : null,
    liveInputAnalysisSettings: liveInputAnalysisSettings
      ? { ...liveInputAnalysisSettings }
      : null,
  };
}

function createDefaultEngineStatus(state = "none", reason = null) {
  return {
    state,
    reason,
    queueDepth: 0,
    publishCount: 0,
    droppedFrameCount: 0,
    transportDropCount: 0,
    publishSkipCount: 0,
    fastSignalPatchCount: 0,
    fastSignalUpdateCount: 0,
    structuralUpdateCount: 0,
    chromaUpdateCount: 0,
    tempoUpdateCount: 0,
    latestProcessedFrameId: 0,
    latestPublishedFrameId: 0,
    latestSnapshotFrameTimeMs: null,
    latestSnapshotAgeMs: null,
    ...createDefaultWorkerPerfStatus(),
  };
}

function cloneFastSignalPatchValue(value) {
  if (ArrayBuffer.isView(value)) {
    return cloneArray(value);
  }
  if (value && typeof value === "object") {
    return { ...value };
  }
  return value;
}

export function mergeFastSignalPatchIntoSnapshot(snapshot, patch) {
  if (
    !snapshot ||
    !patch ||
    snapshot.analysisSessionKey !== patch.analysisSessionKey ||
    snapshot.analysisInputsSignature !== patch.analysisInputsSignature
  ) {
    return snapshot ?? null;
  }

  const patchAnalysis = patch.analysisResult ?? {};
  const analysisResult = {
    ...(snapshot.analysisResult ?? {}),
  };

  for (const key of FAST_SIGNAL_PATCH_ANALYSIS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patchAnalysis, key)) {
      continue;
    }
    analysisResult[key] = cloneFastSignalPatchValue(patchAnalysis[key]);
  }

  return {
    ...snapshot,
    frameTimeMs: Number.isFinite(patch.frameTimeMs)
      ? patch.frameTimeMs
      : snapshot.frameTimeMs,
    fastSignalPatchCount:
      patch.fastSignalPatchCount ?? snapshot.fastSignalPatchCount ?? 0,
    latestFastSignalPatchFrameTimeMs:
      patch.frameTimeMs ?? snapshot.latestFastSignalPatchFrameTimeMs ?? null,
    analysisResult,
  };
}

function readSnapshotMetadata(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      frameTimeMs: null,
      publishCount: null,
    };
  }

  return {
    frameTimeMs: snapshot.frameTimeMs ?? null,
    publishCount: snapshot.publishCount ?? null,
  };
}

export function createNoopAudioFeatureEngine(settings = {}) {
  const normalizedSettings = normalizeAudioFeatureEngineSettings(settings);
  return {
    settings: normalizedSettings,
    enqueueTransportFrame() {},
    readLatestSnapshot() {
      return null;
    },
    getStatus() {
      return createDefaultEngineStatus("none", "disabled");
    },
    reset() {},
    resetMetrics(reason = "manual-reset-metrics") {
      void reason;
    },
    dispose() {},
  };
}

export function createAudioFeatureEngine(settings = {}, dependencies = {}) {
  const normalizedSettings = normalizeAudioFeatureEngineSettings(settings);
  const workerFactory =
    dependencies.createWorker ??
    (() =>
      new Worker(new URL("./audioFeatureEngine.worker.js", import.meta.url), {
        type: "module",
      }));

  if (normalizedSettings.runtime !== "worker") {
    return createNoopAudioFeatureEngine(normalizedSettings);
  }

  let worker = null;
  try {
    worker = workerFactory();
  } catch {
    return createNoopAudioFeatureEngine(normalizedSettings);
  }

  let disposed = false;
  let frameId = 0;
  let latestSnapshot = null;
  let latestStatus = createDefaultEngineStatus("loading", "initializing");

  const updateStatus = (nextStatus = {}) => {
    latestStatus = {
      ...latestStatus,
      ...nextStatus,
    };
  };

  worker.addEventListener("message", (event) => {
    const payload = event?.data ?? {};
    if (payload.type === "status") {
      updateStatus(payload.status ?? {});
      return;
    }

    if (payload.type === "snapshot") {
      latestSnapshot = payload.snapshot ?? null;
      const snapshotMetadata = readSnapshotMetadata(payload.snapshot);
      updateStatus({
        state: "ready",
        reason: payload.snapshot ? "published" : "cleared",
        latestSnapshotFrameTimeMs: snapshotMetadata.frameTimeMs,
        publishCount:
          snapshotMetadata.publishCount ?? latestStatus.publishCount ?? 0,
      });
      return;
    }

    if (payload.type === "fast-signal-patch") {
      const nextSnapshot = mergeFastSignalPatchIntoSnapshot(
        latestSnapshot,
        payload.patch,
      );
      if (nextSnapshot === latestSnapshot) {
        return;
      }
      latestSnapshot = nextSnapshot;
      updateStatus({
        state: "ready",
        reason: "fast-signal-patched",
        latestSnapshotFrameTimeMs: latestSnapshot?.frameTimeMs ?? null,
        latestFastSignalPatchFrameTimeMs:
          latestSnapshot?.latestFastSignalPatchFrameTimeMs ?? null,
        fastSignalPatchCount:
          latestSnapshot?.fastSignalPatchCount ??
          latestStatus.fastSignalPatchCount ??
          0,
      });
    }
  });

  worker.addEventListener("error", (event) => {
    updateStatus({
      state: "failed",
      reason: "worker-error",
      error: event?.message ?? null,
    });
  });

  worker.postMessage({
    type: "init",
    settings: normalizedSettings,
  });

  return {
    settings: normalizedSettings,
    enqueueTransportFrame(frame) {
      if (disposed || !worker || !frame) {
        return;
      }

      frameId += 1;
      const nextFrame = {
        ...frame,
        frameId: resolveTransportFrameId(frame.frameId, frameId),
      };
      worker.postMessage(
        {
          type: "frame",
          frame: nextFrame,
        },
        collectTransferables(nextFrame),
      );
    },
    readLatestSnapshot(options = {}) {
      if (!latestSnapshot) {
        return null;
      }

      const frameTimeMs = options?.frameTimeMs;
      const latestSnapshotAgeMs =
        Number.isFinite(frameTimeMs) &&
        Number.isFinite(latestSnapshot.frameTimeMs)
          ? Math.max(0, frameTimeMs - latestSnapshot.frameTimeMs)
          : null;

      updateStatus({
        latestSnapshotAgeMs,
      });
      return latestSnapshot;
    },
    getStatus() {
      return {
        ...latestStatus,
      };
    },
    resetMetrics(reason = "manual-reset-metrics") {
      latestStatus = {
        ...createDefaultEngineStatus(latestStatus.state ?? "ready", reason),
        latestSnapshotFrameTimeMs: latestSnapshot?.frameTimeMs ?? null,
      };
      worker?.postMessage({
        type: "reset-metrics",
        reason,
      });
    },
    reset(reason = "manual-reset") {
      latestSnapshot = null;
      updateStatus({
        reason,
        latestSnapshotFrameTimeMs: null,
        latestSnapshotAgeMs: null,
      });
      worker?.postMessage({
        type: "reset",
        reason,
      });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      latestSnapshot = null;
      updateStatus({
        state: "terminated",
        reason: "disposed",
      });
      worker?.terminate?.();
      worker = null;
    },
  };
}
