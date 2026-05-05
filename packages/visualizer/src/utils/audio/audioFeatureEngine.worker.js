import { createAudioFeatureState } from "./modalStack.js";
import {
  buildAudioFeatureAnalysisSnapshot,
  buildCurrentAudioFeatureAnalysisResult,
  prepareAudioFeatureFrameInputs,
  updateAudioFeatureChromaState,
  updateAudioFeatureFastSignalState,
  updateAudioFeatureStructuralState,
  updateAudioFeatureTempoState,
} from "./buildFeatureFrame.js";
import {
  DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS,
  normalizeAudioFeatureEngineSettings,
} from "./audioFeatureEngineShared.js";

const FLOAT_EPSILON = 0.01;
const SLOT_EPSILON = 0.02;
const TEMPO_EPSILON = 0.5;
const PHASE_EPSILON = 0.03;
const CONFIDENCE_EPSILON = 0.04;
const STRUCTURAL_FINGERPRINT_KEYS = [
  "activeBackboneModeCount",
  "activeDetailModeCount",
  "activeModeCount",
  "dominantFrequency",
  "dominantAmplitude",
  "analysisEngine",
  "pitchSource",
  "usedDecay",
  "sourceMode",
  "backboneSignature",
  "detailSignature",
  "referenceBackboneSignature",
  "referenceDetailSignature",
  "backboneColorSignature",
  "detailColorSignature",
];

function postStatus(status = {}) {
  self.postMessage({
    type: "status",
    status,
  });
}

export function createEngineState(
  settings = DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS,
) {
  return {
    settings,
    featureState: null,
    latestFrame: null,
    processing: false,
    queueDepth: 0,
    publishCount: 0,
    droppedFrameCount: 0,
    publishSkipCount: 0,
    fastSignalUpdateCount: 0,
    structuralUpdateCount: 0,
    chromaUpdateCount: 0,
    tempoUpdateCount: 0,
    latestSnapshot: null,
    latestAnalysisResult: null,
    latestStructuralState: null,
    latestProcessedFrameId: 0,
    latestPublishedFrameId: 0,
    lastAnalysisSessionKey: null,
    lastAnalysisInputsSignature: null,
    lastStructuralUpdateAtMs: Number.NEGATIVE_INFINITY,
    lastChromaUpdateAtMs: Number.NEGATIVE_INFINITY,
    lastTempoUpdateAtMs: Number.NEGATIVE_INFINITY,
    lastPublishedAtMs: Number.NEGATIVE_INFINITY,
    workerPerf: {
      fastSignalMs: 0,
      structuralMs: 0,
      peakScanMs: 0,
      modalResolveMs: 0,
      projectionMs: 0,
      chromaMs: 0,
      tempoMs: 0,
    },
  };
}

function buildEngineStatus(engineState, overrides = {}) {
  return {
    state: "ready",
    reason: null,
    queueDepth: engineState.queueDepth,
    publishCount: engineState.publishCount,
    droppedFrameCount: engineState.droppedFrameCount,
    transportDropCount: engineState.droppedFrameCount,
    publishSkipCount: engineState.publishSkipCount,
    fastSignalUpdateCount: engineState.fastSignalUpdateCount,
    structuralUpdateCount: engineState.structuralUpdateCount,
    chromaUpdateCount: engineState.chromaUpdateCount,
    tempoUpdateCount: engineState.tempoUpdateCount,
    latestProcessedFrameId: engineState.latestProcessedFrameId,
    latestPublishedFrameId: engineState.latestPublishedFrameId,
    latestSnapshotFrameTimeMs: engineState.latestSnapshot?.frameTimeMs ?? null,
    workerFastSignalMs: engineState.workerPerf.fastSignalMs,
    workerStructuralMs: engineState.workerPerf.structuralMs,
    workerPeakScanMs: engineState.workerPerf.peakScanMs,
    workerModalResolveMs: engineState.workerPerf.modalResolveMs,
    workerProjectionMs: engineState.workerPerf.projectionMs,
    workerChromaMs: engineState.workerPerf.chromaMs,
    workerTempoMs: engineState.workerPerf.tempoMs,
    ...overrides,
  };
}

function ensureFeatureState(engineState, capacity) {
  if (
    !engineState.featureState ||
    engineState.featureState.capacity !== capacity
  ) {
    engineState.featureState = createAudioFeatureState(capacity);
  }

  return engineState.featureState;
}

function clearEngineState(engineState, reason = "reset") {
  engineState.latestFrame = null;
  engineState.queueDepth = 0;
  engineState.latestSnapshot = null;
  engineState.latestAnalysisResult = null;
  engineState.latestStructuralState = null;
  engineState.latestProcessedFrameId = 0;
  engineState.latestPublishedFrameId = 0;
  engineState.lastAnalysisSessionKey = null;
  engineState.lastAnalysisInputsSignature = null;
  engineState.lastStructuralUpdateAtMs = Number.NEGATIVE_INFINITY;
  engineState.lastChromaUpdateAtMs = Number.NEGATIVE_INFINITY;
  engineState.lastTempoUpdateAtMs = Number.NEGATIVE_INFINITY;
  engineState.lastPublishedAtMs = Number.NEGATIVE_INFINITY;
  engineState.workerPerf.peakScanMs = 0;
  engineState.workerPerf.modalResolveMs = 0;
  engineState.workerPerf.projectionMs = 0;
  if (engineState.featureState?.analysis) {
    engineState.featureState.analysis.lastComposedFrameAtMs = 0;
  }
  postStatus(
    buildEngineStatus(engineState, {
      reason,
      latestSnapshotFrameTimeMs: null,
    }),
  );
  self.postMessage({
    type: "snapshot",
    snapshot: null,
  });
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

function toPreparedInputsFrame(frame) {
  return {
    analysisSnapshot:
      frame.fftMagnitudes || frame.timeData
        ? {
            sourceMode: frame.sourceMode ?? null,
            avgAmplitude: frame.avgAmplitude ?? 0,
            fftMagnitudes: frame.fftMagnitudes ?? null,
            timeData: frame.timeData ?? null,
            rms: frame.rms ?? 0,
            spectralCentroid: frame.spectralCentroid ?? 0,
            spectralFlux: frame.spectralFlux ?? 0,
          }
        : null,
    featureState: null,
    radius: frame.radius,
    cavityGeometry: frame.cavityGeometry,
    status: {
      audioInputMode: frame.audioInputMode ?? "idle",
      isPlaying: Boolean(frame.isPlaying),
      isLiveInputActive: Boolean(frame.isLiveInputActive),
      playbackSessionId: frame.playbackSessionId ?? null,
      sampleRate: frame.sampleRate ?? null,
      fftSize: frame.fftSize ?? null,
      capacity: frame.capacity ?? null,
      liveInputKind: frame.liveInputKind ?? null,
      liveInputDeviceKind: frame.liveInputDeviceKind ?? frame.liveInputKind,
      liveInputCalibrationVersion: frame.liveInputCalibrationVersion ?? 0,
      liveInputAnalysisClass: frame.liveInputAnalysisClass ?? null,
      liveInputAcousticIntent: frame.liveInputAcousticIntent ?? null,
    },
    auditSettings: frame.auditSettings,
    beatSettings: frame.beatSettings,
    frameTimeMs: frame.frameTimeMs,
    liveInputAnalysisSettings: frame.liveInputAnalysisSettings,
    includeChromesthesia: frame.includeChromesthesia,
    analysisHints: frame.analysisHints,
  };
}

function valuesDiffer(left, right, epsilon = FLOAT_EPSILON) {
  if (left === right) {
    return false;
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return left !== right;
  }
  return Math.abs(left - right) > epsilon;
}

function arraysDiffer(leftValues, rightValues, epsilon = SLOT_EPSILON) {
  if (leftValues === rightValues) {
    return false;
  }
  if (!leftValues || !rightValues || leftValues.length !== rightValues.length) {
    return true;
  }

  for (let index = 0; index < leftValues.length; index += 1) {
    if (Math.abs(leftValues[index] - rightValues[index]) > epsilon) {
      return true;
    }
  }

  return false;
}

function getSnapshotAgeMs(engineState, currentFrameAtMs) {
  return Number.isFinite(engineState.lastPublishedAtMs)
    ? Math.max(0, currentFrameAtMs - engineState.lastPublishedAtMs)
    : Number.POSITIVE_INFINITY;
}

function shouldForceLaneUpdates(engineState, preparedInputs) {
  const snapshotAgeMs = getSnapshotAgeMs(
    engineState,
    preparedInputs.currentFrameAtMs,
  );

  return (
    !engineState.latestSnapshot ||
    !engineState.latestAnalysisResult ||
    engineState.lastAnalysisSessionKey !== preparedInputs.analysisSessionKey ||
    engineState.lastAnalysisInputsSignature !==
      preparedInputs.analysisInputsSignature ||
    snapshotAgeMs >= engineState.settings.maxSnapshotAgeMs
  );
}

export function buildLaneRunDecisions(engineState, preparedInputs) {
  const currentFrameAtMs = preparedInputs.currentFrameAtMs;
  const forced = shouldForceLaneUpdates(engineState, preparedInputs);

  const shouldRunLane = (lastUpdatedAtMs, cadenceMs) =>
    forced ||
    !Number.isFinite(lastUpdatedAtMs) ||
    currentFrameAtMs - lastUpdatedAtMs >= cadenceMs;

  return {
    forced,
    fastSignal: true,
    structural: shouldRunLane(
      engineState.lastStructuralUpdateAtMs,
      engineState.settings.structuralCadenceMs,
    ),
    chroma: shouldRunLane(
      engineState.lastChromaUpdateAtMs,
      engineState.settings.chromaCadenceMs,
    ),
    tempo: shouldRunLane(
      engineState.lastTempoUpdateAtMs,
      engineState.settings.tempoCadenceMs,
    ),
  };
}

function hasMeaningfulFastSignalDelta(previousResult, nextResult) {
  if (!previousResult) {
    return true;
  }

  return (
    arraysDiffer(previousResult.bandEnergies, nextResult.bandEnergies, 0.015) ||
    valuesDiffer(
      previousResult.transientEnergy,
      nextResult.transientEnergy,
      0.02,
    ) ||
    valuesDiffer(
      previousResult.spectralCentroid,
      nextResult.spectralCentroid,
      0.01,
    ) ||
    valuesDiffer(previousResult.spectralFlux, nextResult.spectralFlux, 0.015) ||
    previousResult.beatDetected !== nextResult.beatDetected ||
    previousResult.beatPulseId !== nextResult.beatPulseId ||
    valuesDiffer(previousResult.beatStrength, nextResult.beatStrength, 0.025) ||
    valuesDiffer(
      previousResult.beatConfidence,
      nextResult.beatConfidence,
      CONFIDENCE_EPSILON,
    ) ||
    valuesDiffer(
      previousResult.beatLowBandEnergy,
      nextResult.beatLowBandEnergy,
      0.015,
    ) ||
    valuesDiffer(
      previousResult.beatOnsetDriver,
      nextResult.beatOnsetDriver,
      0.015,
    ) ||
    valuesDiffer(previousResult.beatThreshold, nextResult.beatThreshold, 0.01)
  );
}

function hasMeaningfulStructuralDelta(previousResult, nextResult) {
  if (!previousResult) {
    return true;
  }

  const previousFingerprint = previousResult.structuralFingerprint ?? null;
  const nextFingerprint = nextResult.structuralFingerprint ?? null;
  if (!previousFingerprint || !nextFingerprint) {
    return true;
  }

  for (const key of STRUCTURAL_FINGERPRINT_KEYS) {
    const previousValue = previousFingerprint[key];
    const nextValue = nextFingerprint[key];
    if (typeof previousValue === "number" || typeof nextValue === "number") {
      if (valuesDiffer(previousValue, nextValue, 0.001)) {
        return true;
      }
      continue;
    }

    if (previousValue !== nextValue) {
      return true;
    }
  }

  return false;
}

function hasMeaningfulChromaDelta(previousResult, nextResult) {
  if (!previousResult) {
    return true;
  }

  return (
    previousResult.keyTonic !== nextResult.keyTonic ||
    previousResult.keyMode !== nextResult.keyMode ||
    valuesDiffer(
      previousResult.keyConfidence,
      nextResult.keyConfidence,
      CONFIDENCE_EPSILON,
    ) ||
    valuesDiffer(previousResult.keyTonicHue, nextResult.keyTonicHue, 0.01)
  );
}

function hasMeaningfulTempoDelta(previousResult, nextResult) {
  if (!previousResult) {
    return true;
  }

  return (
    valuesDiffer(
      previousResult.estimatedTempo,
      nextResult.estimatedTempo,
      TEMPO_EPSILON,
    ) ||
    valuesDiffer(
      previousResult.tempoConfidence,
      nextResult.tempoConfidence,
      CONFIDENCE_EPSILON,
    ) ||
    valuesDiffer(
      previousResult.beatPhase,
      nextResult.beatPhase,
      PHASE_EPSILON,
    ) ||
    valuesDiffer(
      previousResult.rhythmicDensity,
      nextResult.rhythmicDensity,
      0.025,
    )
  );
}

export function deriveDirtyState(
  previousSnapshot,
  nextAnalysisResult,
  laneDecisions,
) {
  const previousResult = previousSnapshot?.analysisResult ?? null;

  return {
    fastSignal:
      laneDecisions.fastSignal &&
      hasMeaningfulFastSignalDelta(previousResult, nextAnalysisResult),
    structural:
      laneDecisions.structural &&
      hasMeaningfulStructuralDelta(previousResult, nextAnalysisResult),
    chroma:
      laneDecisions.chroma &&
      hasMeaningfulChromaDelta(previousResult, nextAnalysisResult),
    tempo:
      laneDecisions.tempo &&
      hasMeaningfulTempoDelta(previousResult, nextAnalysisResult),
  };
}

export function shouldPublishDirtySnapshot(
  engineState,
  dirtyState,
  forced,
  currentFrameAtMs,
) {
  if (forced || !engineState.latestSnapshot) {
    return true;
  }

  const publishAgeMs = Number.isFinite(engineState.lastPublishedAtMs)
    ? Math.max(0, currentFrameAtMs - engineState.lastPublishedAtMs)
    : Number.POSITIVE_INFINITY;
  const hasDirtyLane =
    dirtyState.fastSignal ||
    dirtyState.structural ||
    dirtyState.chroma ||
    dirtyState.tempo;

  return (
    hasDirtyLane &&
    publishAgeMs >= engineState.settings.snapshotPublishCadenceMs
  );
}

function recordLaneDuration(engineState, key, durationMs) {
  if (!Number.isFinite(durationMs)) {
    return;
  }
  engineState.workerPerf[key] = Math.max(0, durationMs);
}

function getWorkerNow() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

function processLatestFrame(engineState) {
  if (engineState.processing || !engineState.latestFrame) {
    return;
  }

  engineState.processing = true;

  try {
    const frame = engineState.latestFrame;
    engineState.latestFrame = null;
    engineState.queueDepth = 0;
    const capacity = Math.max(1, Math.round(frame?.capacity ?? 12));
    const featureState = ensureFeatureState(engineState, capacity);
    engineState.latestProcessedFrameId = frame.frameId ?? 0;

    if (featureState.audit?.settings && frame.auditSettings) {
      Object.assign(featureState.audit.settings, frame.auditSettings);
    }

    const preparedInputs = prepareAudioFeatureFrameInputs({
      ...toPreparedInputsFrame(frame),
      featureState,
    });

    if (preparedInputs.silentFeatureFrame) {
      clearEngineState(engineState, "silent-frame");
      return;
    }

    const laneDecisions = buildLaneRunDecisions(engineState, preparedInputs);

    const fastSignalStartedAt = getWorkerNow();
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    engineState.fastSignalUpdateCount += 1;
    recordLaneDuration(
      engineState,
      "fastSignalMs",
      getWorkerNow() - fastSignalStartedAt,
    );

    let structuralState = engineState.latestStructuralState;
    if (laneDecisions.structural) {
      const structuralStartedAt = getWorkerNow();
      structuralState = updateAudioFeatureStructuralState(
        preparedInputs,
        fastSignalState,
      );
      engineState.latestStructuralState = structuralState;
      engineState.structuralUpdateCount += 1;
      engineState.lastStructuralUpdateAtMs = preparedInputs.currentFrameAtMs;
      recordLaneDuration(
        engineState,
        "structuralMs",
        getWorkerNow() - structuralStartedAt,
      );
      recordLaneDuration(
        engineState,
        "peakScanMs",
        structuralState.structuralPerf?.peakScanMs ?? 0,
      );
      recordLaneDuration(
        engineState,
        "modalResolveMs",
        structuralState.structuralPerf?.modalResolveMs ?? 0,
      );
      recordLaneDuration(engineState, "projectionMs", 0);
    }

    let chromaState = null;
    if (laneDecisions.chroma) {
      const chromaStartedAt = getWorkerNow();
      chromaState = updateAudioFeatureChromaState(
        preparedInputs,
        fastSignalState,
      );
      engineState.chromaUpdateCount += 1;
      engineState.lastChromaUpdateAtMs = preparedInputs.currentFrameAtMs;
      recordLaneDuration(
        engineState,
        "chromaMs",
        getWorkerNow() - chromaStartedAt,
      );
    }

    let tempoState = null;
    if (laneDecisions.tempo) {
      const tempoStartedAt = getWorkerNow();
      tempoState = updateAudioFeatureTempoState({
        bandState: preparedInputs.bandState,
        beatConfidence: fastSignalState.beatConfidence,
        currentFrameAtMs: fastSignalState.currentFrameAtMs,
        deltaMs: fastSignalState.deltaMs,
      });
      engineState.tempoUpdateCount += 1;
      engineState.lastTempoUpdateAtMs = preparedInputs.currentFrameAtMs;
      recordLaneDuration(
        engineState,
        "tempoMs",
        getWorkerNow() - tempoStartedAt,
      );
    }

    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      previousAnalysisResult: engineState.latestAnalysisResult,
      fastSignalState,
      structuralState,
      chromaState,
      tempoState,
      materializeStructuralProjection: false,
    });
    const dirtyState = deriveDirtyState(
      engineState.latestSnapshot,
      analysisResult,
      laneDecisions,
    );
    engineState.lastAnalysisSessionKey = preparedInputs.analysisSessionKey;
    engineState.lastAnalysisInputsSignature =
      preparedInputs.analysisInputsSignature;

    if (
      !shouldPublishDirtySnapshot(
        engineState,
        dirtyState,
        laneDecisions.forced,
        preparedInputs.currentFrameAtMs,
      )
    ) {
      engineState.latestAnalysisResult = analysisResult;
      engineState.publishSkipCount += 1;
      postStatus(
        buildEngineStatus(engineState, {
          reason: "lane-updated",
        }),
      );
      return;
    }

    const publishedAnalysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      previousAnalysisResult: analysisResult,
      fastSignalState,
      structuralState: engineState.latestStructuralState,
      chromaState,
      tempoState,
      materializeStructuralProjection: true,
    });
    recordLaneDuration(
      engineState,
      "projectionMs",
      publishedAnalysisResult.structuralPerf?.projectionMs ?? 0,
    );
    engineState.latestAnalysisResult = publishedAnalysisResult;

    const nextSnapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult: publishedAnalysisResult,
      publishCount: engineState.publishCount + 1,
    });

    engineState.publishCount += 1;
    nextSnapshot.publishCount = engineState.publishCount;
    engineState.latestSnapshot = nextSnapshot;
    engineState.latestPublishedFrameId = frame.frameId ?? 0;
    engineState.lastPublishedAtMs = preparedInputs.currentFrameAtMs;

    postStatus(
      buildEngineStatus(engineState, {
        reason: "published",
        latestSnapshotFrameTimeMs: engineState.latestSnapshot.frameTimeMs,
      }),
    );
    /** @type {any} */ (self).postMessage(
      {
        type: "snapshot",
        snapshot: engineState.latestSnapshot,
      },
      collectTransferables(engineState.latestSnapshot),
    );
  } finally {
    engineState.processing = false;
    if (engineState.latestFrame) {
      queueMicrotask(() => processLatestFrame(engineState));
    }
  }
}

const engineState = createEngineState();

if (
  typeof self !== "undefined" &&
  typeof self.addEventListener === "function"
) {
  self.addEventListener("message", (event) => {
    const payload = event?.data ?? {};
    if (payload.type === "init") {
      engineState.settings = normalizeAudioFeatureEngineSettings(
        payload.settings ?? {},
      );
      postStatus(
        buildEngineStatus(engineState, {
          reason: "initialized",
          latestSnapshotFrameTimeMs: null,
        }),
      );
      return;
    }

    if (payload.type === "reset") {
      clearEngineState(engineState, payload.reason ?? "reset");
      return;
    }

    if (payload.type !== "frame" || !payload.frame) {
      return;
    }

    if (engineState.latestFrame) {
      engineState.droppedFrameCount += 1;
    }
    engineState.latestFrame = payload.frame;
    engineState.queueDepth = 1;
    processLatestFrame(engineState);
  });
}
