import { createAudioFeatureState } from "./audioFeatureState.js";
import {
  buildCurrentAudioFeatureAnalysisResult,
  updateAudioFeatureChromaState,
  updateAudioFeatureFastSignalState,
  updateAudioFeatureStructuralState,
} from "./audioFeatureAnalysis.js";
import { composeAudioFeatureFrame } from "./buildFeatureFrame.js";
import { createAudioFeatureCompositionState } from "./audioFeatureFrameSignals.js";
import { prepareAudioFeatureFrameInputs } from "./audioFeatureInputPreparation.js";
import { updateAudioFeatureTempoState } from "./tempoTracking.js";
import {
  buildDrivePacket,
  buildTopologyPacket,
} from "./audioFeaturePacketCodec.js";
import { normalizeAudioFeatureRuntimeSettings } from "./audioFeatureEngineShared.js";
import {
  FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  createFastModalDriveEstimator,
  selectFastModalProbeModeIndices,
} from "./fastModalDriveEstimator.js";
import {
  applyFastModalDriveToStructuralState,
  buildFastCommittedModesFromTopology,
  captureFastModalOscillatorState,
  restoreFastModalOscillatorState,
} from "./fastModalStructuralDrive.js";
import { computeModalInputEnergyScale } from "./modalResponse.js";
import { AUDIO_SOURCE_KINDS } from "../../core/audio/audioSourceSession.js";
import {
  applyTopologyDriveProjection,
  createTopologyDriveProjection,
  refreshTopologyDriveProjection,
} from "./topologyDriveProjection.js";

function getWorkerNow() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function collectTransferables(value, transferables = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return transferables;
  }
  seen.add(value);
  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    transferables.push(value.buffer);
    return transferables;
  }
  for (const nestedValue of Object.values(value)) {
    collectTransferables(nestedValue, transferables, seen);
  }
  return transferables;
}

function postMessageWithTransfers(message, transferValue = null) {
  const transferables = transferValue
    ? collectTransferables(transferValue)
    : [];
  if (transferables.length) {
    /** @type {any} */ (self).postMessage(message, transferables);
  } else {
    self.postMessage(message);
  }
}

function createPerfEntry() {
  return { averageMs: 0, lastMs: 0, maxMs: 0, sampleCount: 0 };
}

function recordPerf(entry, durationMs) {
  if (!Number.isFinite(durationMs)) {
    return;
  }
  const value = Math.max(0, durationMs);
  entry.lastMs = value;
  entry.maxMs = Math.max(entry.maxMs, value);
  entry.sampleCount += 1;
  entry.averageMs += (value - entry.averageMs) / entry.sampleCount;
}

export function createFeatureWorkerState() {
  return {
    settings: normalizeAudioFeatureRuntimeSettings(),
    sourceGeneration: 0,
    workerGeneration: 0,
    configuration: {},
    featureState: null,
    compositionState: createAudioFeatureCompositionState(),
    latestStructuralState: null,
    latestAnalysisResult: null,
    latestTopologyFrame: null,
    latestDriveTopology: null,
    topologyDriveProjection: null,
    drivePacketBuffers: null,
    drivePacketBufferAllocationCount: 0,
    latestTopologyFingerprint: null,
    topologyRevision: 0,
    committedModes: [],
    fastEstimator: null,
    fastEstimatorSignature: null,
    lastFastFrameAtMs: Number.NEGATIVE_INFINITY,
    lastChromaUpdateAtMs: Number.NEGATIVE_INFINITY,
    lastTempoUpdateAtMs: Number.NEGATIVE_INFINITY,
    processedFrameCount: 0,
    topologyPublishCount: 0,
    drivePublishCount: 0,
    perf: {
      fastLane: createPerfEntry(),
      structuralLane: createPerfEntry(),
      goertzel: createPerfEntry(),
      composition: createPerfEntry(),
    },
  };
}

function clearSemanticState(state) {
  state.featureState = null;
  state.compositionState = createAudioFeatureCompositionState();
  state.latestStructuralState = null;
  state.latestAnalysisResult = null;
  state.latestTopologyFrame = null;
  state.latestDriveTopology = null;
  state.topologyDriveProjection = null;
  state.drivePacketBuffers = null;
  state.latestTopologyFingerprint = null;
  state.topologyRevision = 0;
  state.committedModes = [];
  state.fastEstimator = null;
  state.fastEstimatorSignature = null;
  state.lastFastFrameAtMs = Number.NEGATIVE_INFINITY;
  state.lastChromaUpdateAtMs = Number.NEGATIVE_INFINITY;
  state.lastTempoUpdateAtMs = Number.NEGATIVE_INFINITY;
}

function ensureFeatureState(state, capacity) {
  const resolvedCapacity = Math.max(1, Math.floor(capacity ?? 12));
  if (!state.featureState || state.featureState.capacity !== resolvedCapacity) {
    state.featureState = createAudioFeatureState(resolvedCapacity);
    state.compositionState = createAudioFeatureCompositionState();
  }
  return state.featureState;
}

function buildPreparedInputs({
  state,
  snapshot,
  status,
  frameTimeMs,
  configuration,
  fallbackFftSize = null,
}) {
  const fftSize =
    snapshot?.timeData?.length ??
    (snapshot?.fftLinearAmplitudes?.length
      ? snapshot.fftLinearAmplitudes.length * 2
      : (fallbackFftSize ?? status?.fftSize));
  return prepareAudioFeatureFrameInputs({
    analysisSnapshot: snapshot,
    featureState: ensureFeatureState(state, status?.capacity),
    radius: configuration?.radius,
    cavityAcousticScale: configuration?.cavityAcousticScale,
    boundaryMode: configuration?.boundaryMode,
    cavityGeometry: configuration?.cavityGeometry,
    status: {
      ...status,
      fftSize,
    },
    auditSettings: configuration?.auditSettings,
    beatSettings: configuration?.beatSettings,
    frameTimeMs,
    liveInputAnalysisSettings: configuration?.liveInputAnalysisSettings,
  });
}

function buildFastEstimatorSignature(
  committedModes,
  sampleRate,
  probeModeIndices,
) {
  return `${sampleRate}|${committedModes
    .map((mode) => `${mode.modeKey}@${mode.naturalFrequencyHz}`)
    .join("|")}|${Array.from(probeModeIndices).join(",")}`;
}

function rebuildFastEstimator(state, preparedInputs, topologyFrame) {
  const modalExcitationState =
    preparedInputs?.featureState?.analysis?.modalExcitationState;
  const committedModes = buildFastCommittedModesFromTopology(
    topologyFrame,
    state.latestStructuralState,
    modalExcitationState,
    {
      acousticScale: preparedInputs.cavityAcousticScale,
      boundaryMode: preparedInputs.boundaryMode,
    },
  );
  // Probe selection already drops modes this sample rate cannot measure, so
  // the estimator only ever sees a probeable set.
  const probeModeIndices = selectFastModalProbeModeIndices(
    committedModes,
    undefined,
    preparedInputs.sampleRate,
  );
  const signature = buildFastEstimatorSignature(
    committedModes,
    preparedInputs.sampleRate,
    probeModeIndices,
  );
  if (!committedModes.length) {
    state.committedModes = committedModes;
    state.fastEstimator = null;
    state.fastEstimatorSignature = null;
    return;
  }
  if (state.fastEstimator && state.fastEstimatorSignature === signature) {
    state.committedModes = committedModes;
    state.fastEstimator.updateCommittedModes(committedModes);
    return;
  }
  // The committed set is published only once its estimator exists, so a
  // rejected topology cannot leave the worker describing modes it cannot drive.
  const fastEstimator = createFastModalDriveEstimator({
    committedModes,
    sampleRate: preparedInputs.sampleRate,
    probeModeIndices,
  });
  state.committedModes = committedModes;
  state.fastEstimator = fastEstimator;
  state.fastEstimatorSignature = signature;
}

function runStructuralLane(state, frame, fastSignalState) {
  const workerOwnedTestToneBootstrap =
    frame.structuralRequested === true &&
    state.configuration?.auditSettings?.injectTestTone === true;
  if (!frame.structuralPayload && !workerOwnedTestToneBootstrap) {
    return null;
  }
  const startedAt = getWorkerNow();
  const previousOscillatorState = captureFastModalOscillatorState(
    state.featureState?.analysis?.modalExcitationState,
  );
  const preparedStructural = buildPreparedInputs({
    state,
    snapshot: frame.structuralPayload,
    status: frame.status,
    frameTimeMs: frame.captureTimestampMs,
    configuration: state.configuration,
    fallbackFftSize: frame.status?.fftSize,
  });
  if (preparedStructural.silentFeatureFrame) {
    state.latestStructuralState = null;
    state.committedModes = [];
    state.fastEstimator = null;
    state.fastEstimatorSignature = null;
    recordPerf(state.perf.structuralLane, getWorkerNow() - startedAt);
    return {
      previousOscillatorState,
      preparedStructural,
      structuralState: null,
    };
  }
  const structuralFastSignalState =
    updateAudioFeatureFastSignalState(preparedStructural);
  const structuralState = updateAudioFeatureStructuralState(
    preparedStructural,
    structuralFastSignalState ?? fastSignalState,
  );
  recordPerf(state.perf.structuralLane, getWorkerNow() - startedAt);
  return {
    previousOscillatorState,
    preparedStructural,
    structuralFastSignalState,
    structuralState,
  };
}

function runExactFastDrive(state, preparedFast, fastSignalState) {
  if (!state.fastEstimator || !state.latestStructuralState) {
    return;
  }
  const timeDomainData =
    preparedFast.waterAcousticDrive?.timeDomainData ??
    preparedFast.snapshot?.timeData;
  if (!(timeDomainData instanceof Float32Array)) {
    return;
  }
  const hardSilence = preparedFast.liveInputHardSilenceActive === true;
  const inputEnergyScale = hardSilence
    ? 0
    : computeModalInputEnergyScale({
        inputRms: preparedFast.analyserRms,
        normalizedInputAmplitude:
          fastSignalState.sourceNormalization?.normalizedRms,
      });
  const goertzelStartedAt = getWorkerNow();
  const exactDriveResult = state.fastEstimator.evaluate(
    timeDomainData,
    inputEnergyScale,
    hardSilence,
  );
  recordPerf(state.perf.goertzel, getWorkerNow() - goertzelStartedAt);

  const deltaMs = Number.isFinite(state.lastFastFrameAtMs)
    ? Math.max(0, preparedFast.currentFrameAtMs - state.lastFastFrameAtMs)
    : state.settings.fastCadenceMs;
  applyFastModalDriveToStructuralState({
    structuralState: state.latestStructuralState,
    modalExcitationState:
      preparedFast.featureState.analysis.modalExcitationState,
    committedModes: state.committedModes,
    exactDriveResult,
    fftLinearAmplitudes:
      preparedFast.waterAcousticDrive?.fftLinearAmplitudes ??
      fastSignalState.fftLinearAmplitudes,
    timeDomainData,
    sampleRate: preparedFast.sampleRate,
    deltaMs,
    inputRms: preparedFast.analyserRms,
    normalizedInputAmplitude:
      fastSignalState.sourceNormalization?.normalizedRms,
    hardSilence,
    coherence: Math.max(0, 1 - (fastSignalState.trebleBroadbandEnergy ?? 0)),
    frameTimeMs: preparedFast.currentFrameAtMs,
  });
}

function buildCurrentFeatureFrame(state, preparedFast, fastSignalState) {
  const frameTimeMs = preparedFast.currentFrameAtMs;
  const chromaDue =
    !Number.isFinite(state.lastChromaUpdateAtMs) ||
    frameTimeMs - state.lastChromaUpdateAtMs >= state.settings.chromaCadenceMs;
  const tempoDue =
    !Number.isFinite(state.lastTempoUpdateAtMs) ||
    frameTimeMs - state.lastTempoUpdateAtMs >= state.settings.tempoCadenceMs;
  const chromaState = chromaDue
    ? updateAudioFeatureChromaState(preparedFast, fastSignalState)
    : null;
  if (chromaDue) {
    state.lastChromaUpdateAtMs = frameTimeMs;
  }
  const tempoState = tempoDue
    ? updateAudioFeatureTempoState({
        bandState: preparedFast.bandState,
        beatConfidence: fastSignalState.beatConfidence,
        currentFrameAtMs: fastSignalState.currentFrameAtMs,
        deltaMs: fastSignalState.deltaMs,
      })
    : null;
  if (tempoDue) {
    state.lastTempoUpdateAtMs = frameTimeMs;
  }

  const analysisResult = applyTopologyDriveProjection(
    state,
    buildCurrentAudioFeatureAnalysisResult({
      preparedInputs: preparedFast,
      previousAnalysisResult: state.latestAnalysisResult,
      fastSignalState,
      structuralState: state.latestStructuralState,
      chromaState,
      tempoState,
      materializeStructuralProjection: true,
      materializeSignalProjection: true,
    }),
  );
  state.latestAnalysisResult = analysisResult;
  const compositionStartedAt = getWorkerNow();
  const featureFrame = composeAudioFeatureFrame({
    preparedInputs: preparedFast,
    analysisResult,
    compositionState: state.compositionState,
    topologyFrame: state.latestTopologyFrame,
  });
  recordPerf(state.perf.composition, getWorkerNow() - compositionStartedAt);
  return featureFrame;
}

function ensureDrivePacketBuffers(state, committedModeCount) {
  const modeCount = Math.max(0, Math.floor(committedModeCount ?? 0));
  const existing = state.drivePacketBuffers;
  if (
    existing?.modalCoefficients?.length === modeCount &&
    existing?.phaseSlots?.length === modeCount * 4 &&
    existing?.bandEnergies?.length === 4 &&
    existing?.spectralBandEnergies?.length === 4
  ) {
    return existing;
  }
  const buffers = {
    modalCoefficients: new Float32Array(modeCount),
    phaseSlots: new Float32Array(modeCount * 4),
    bandEnergies: new Float32Array(4),
    spectralBandEnergies: new Float32Array(4),
  };
  state.drivePacketBuffers = buffers;
  state.drivePacketBufferAllocationCount += 1;
  return buffers;
}

function buildWorkerStatus(state, reason) {
  return {
    sourceGeneration: state.sourceGeneration,
    workerGeneration: state.workerGeneration,
    state: "ready",
    reason,
    processedFrameCount: state.processedFrameCount,
    topologyPublishCount: state.topologyPublishCount,
    drivePublishCount: state.drivePublishCount,
    drivePacketBufferAllocationCount: state.drivePacketBufferAllocationCount,
    workerFastLaneMs: state.perf.fastLane.averageMs,
    workerFastLaneLastMs: state.perf.fastLane.lastMs,
    workerFastLaneMaxMs: state.perf.fastLane.maxMs,
    workerStructuralLaneMs: state.perf.structuralLane.averageMs,
    workerStructuralLaneLastMs: state.perf.structuralLane.lastMs,
    workerStructuralLaneMaxMs: state.perf.structuralLane.maxMs,
    workerGoertzelMs: state.perf.goertzel.averageMs,
    workerGoertzelLastMs: state.perf.goertzel.lastMs,
    workerGoertzelMaxMs: state.perf.goertzel.maxMs,
    workerCompositionMs: state.perf.composition.averageMs,
    workerCompositionLastMs: state.perf.composition.lastMs,
    workerCompositionMaxMs: state.perf.composition.maxMs,
  };
}

function buildWorkerTopologyPacket(
  state,
  frame,
  featureFrame,
  inputSignature = null,
) {
  const fastProbeModeIndices =
    state.fastEstimator?.result?.probeModeIndices ?? new Uint16Array(0);
  const topologyPacket = buildTopologyPacket({
    featureFrame,
    sourceGeneration: state.sourceGeneration,
    workerGeneration: state.workerGeneration,
    topologyRevision: state.topologyRevision + 1,
    sessionKey: frame.status?.sessionKey,
    inputSignature:
      inputSignature ??
      state.latestAnalysisResult?.preparedInputs?.analysisInputsSignature,
    captureTimestampMs: frame.captureTimestampMs,
    fastProbeModeIndices,
    committedModes: state.committedModes,
    structuralFingerprint:
      state.latestStructuralState?.structuralFingerprint ?? null,
    structuralDiagnostics:
      state.latestStructuralState?.structuralMetrics ?? null,
  });
  const topologyDriveProjection = createTopologyDriveProjection(
    topologyPacket,
    state.committedModes,
    state.topologyDriveProjection,
  );
  if (topologyPacket.topologyFingerprint === state.latestTopologyFingerprint) {
    // Identity can remain stable while the topology handoff envelope advances.
    // Refresh the worker-side projection even when no new topology packet must
    // cross the thread boundary.
    state.topologyDriveProjection = topologyDriveProjection;
    return null;
  }

  state.latestTopologyFingerprint = topologyPacket.topologyFingerprint;
  state.topologyRevision = topologyPacket.topologyRevision;
  // Published topology buffers transfer to the main thread and detach here.
  // Keep a separate, setup-only identity order for subsequent fast drives.
  state.latestDriveTopology = {
    activeModeCount: topologyPacket.activeModeCount,
    modalIdentitySlots: new Float32Array(topologyPacket.modalIdentitySlots),
  };
  state.topologyDriveProjection = topologyDriveProjection;
  state.topologyPublishCount += 1;
  return topologyPacket;
}

export function processFeatureWorkerFrame(state, frame) {
  const startedAt = getWorkerNow();
  const preparedFast = buildPreparedInputs({
    state,
    snapshot: frame.fastPayload,
    status: frame.status,
    frameTimeMs: frame.captureTimestampMs,
    configuration: state.configuration,
    fallbackFftSize:
      frame.status?.fastFftSize ?? FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  });
  let topologyPacket = null;
  let featureFrame = preparedFast.silentFeatureFrame;
  if (preparedFast.silentFeatureFrame) {
    state.latestStructuralState = null;
    state.latestAnalysisResult = null;
    state.compositionState = createAudioFeatureCompositionState();
    state.latestTopologyFrame = preparedFast.silentFeatureFrame;
    state.topologyDriveProjection = null;
    state.committedModes = [];
    state.fastEstimator = null;
    state.fastEstimatorSignature = null;
  } else {
    const fastSignalState = updateAudioFeatureFastSignalState(preparedFast);
    const structuralUpdate = runStructuralLane(state, frame, fastSignalState);
    let drivePreparedInputs = preparedFast;
    let driveFastSignalState = fastSignalState;
    if (structuralUpdate) {
      // Structural analysis advances only the topology compositor. Its FFT
      // amplitudes never become the previous live frame or smoothing state.
      const topologyAnalysisResult = buildCurrentAudioFeatureAnalysisResult({
        preparedInputs: structuralUpdate.preparedStructural,
        fastSignalState:
          structuralUpdate.structuralFastSignalState ?? fastSignalState,
        structuralState: structuralUpdate.structuralState,
        materializeStructuralProjection: true,
        materializeSignalProjection: true,
      });
      const topologyFeatureFrame = composeAudioFeatureFrame({
        preparedInputs: structuralUpdate.preparedStructural,
        analysisResult: topologyAnalysisResult,
        topologyOnly: true,
      });
      state.latestStructuralState = structuralUpdate.structuralState;
      state.latestTopologyFrame = topologyFeatureFrame;
      rebuildFastEstimator(
        state,
        structuralUpdate.preparedStructural,
        topologyFeatureFrame,
      );
      topologyPacket = buildWorkerTopologyPacket(
        state,
        frame,
        topologyFeatureFrame,
        structuralUpdate.preparedStructural.analysisInputsSignature,
      );
      restoreFastModalOscillatorState({
        modalExcitationState:
          preparedFast.featureState.analysis.modalExcitationState,
        committedModes: state.committedModes,
        previousOscillatorState: structuralUpdate.previousOscillatorState,
      });
      if (
        structuralUpdate.preparedStructural?.sourceEvidence?.transport
          ?.preparationOnly === true &&
        structuralUpdate.structuralFastSignalState
      ) {
        // A loaded file is a static preparation source. Its structural window
        // owns the cache seed because the shorter fast window can legitimately
        // begin in silence even when the decoded file already contains modal
        // evidence. Live playback returns to the fast window below.
        drivePreparedInputs = structuralUpdate.preparedStructural;
        driveFastSignalState = structuralUpdate.structuralFastSignalState;
      }
    }
    runExactFastDrive(state, drivePreparedInputs, driveFastSignalState);
    refreshTopologyDriveProjection(state);
    featureFrame = buildCurrentFeatureFrame(
      state,
      drivePreparedInputs,
      driveFastSignalState,
    );
  }
  state.lastFastFrameAtMs = frame.captureTimestampMs;
  state.processedFrameCount += 1;
  recordPerf(state.perf.fastLane, getWorkerNow() - startedAt);

  if (!state.latestDriveTopology) {
    topologyPacket = buildWorkerTopologyPacket(state, frame, featureFrame);
  }
  const drivePacket = buildDrivePacket({
    featureFrame,
    topologyPacket: state.latestDriveTopology,
    committedDriveSlots:
      state.topologyDriveProjection?.committedDisplaySlots ?? null,
    committedPhaseSlots:
      state.topologyDriveProjection?.committedPhaseSlots ?? null,
    buffers: ensureDrivePacketBuffers(
      state,
      state.topologyDriveProjection?.committedModeCount ??
        state.latestDriveTopology?.activeModeCount ??
        0,
    ),
    sourceGeneration: state.sourceGeneration,
    workerGeneration: state.workerGeneration,
    topologyRevision: state.topologyRevision,
    frameId: frame.frameId,
    captureTimestampMs: frame.captureTimestampMs,
    processingTimestampMs: getWorkerNow(),
    observationTimeSeconds: frame.status?.observationTimeSeconds,
    observationAdvancing: frame.status?.observationAdvancing === true,
    observationPaused: frame.status?.observationPaused === true,
    observationSourceKey: frame.status?.sourceKey ?? null,
    observationSessionKey: frame.status?.sessionKey ?? null,
    observationTimelineRevision:
      frame.status?.sourceSession?.kind === AUDIO_SOURCE_KINDS.file
        ? frame.status.sourceSession.timelineRevision ?? 0
        : 0,
  });
  state.drivePublishCount += 1;
  return { topologyPacket, drivePacket };
}

const engineState = createFeatureWorkerState();

if (
  typeof self !== "undefined" &&
  typeof self.addEventListener === "function"
) {
  self.addEventListener("message", (event) => {
    const payload = event?.data ?? {};
    if (payload.type === "init") {
      engineState.settings = normalizeAudioFeatureRuntimeSettings(
        payload.settings,
      );
      engineState.sourceGeneration = payload.sourceGeneration;
      engineState.workerGeneration = payload.workerGeneration;
      engineState.configuration = payload.configuration ?? {};
      clearSemanticState(engineState);
      self.postMessage({
        type: "status",
        status: buildWorkerStatus(engineState, "initialized"),
      });
      return;
    }
    if (payload.type === "configure") {
      if (
        payload.sourceGeneration === engineState.sourceGeneration &&
        payload.workerGeneration === engineState.workerGeneration
      ) {
        engineState.configuration = payload.configuration ?? {};
      }
      return;
    }
    if (payload.type !== "analysis-input" || !payload.frame) {
      return;
    }
    const frame = payload.frame;
    if (
      frame.sourceGeneration !== engineState.sourceGeneration ||
      frame.workerGeneration !== engineState.workerGeneration
    ) {
      return;
    }

    try {
      const { topologyPacket, drivePacket } = processFeatureWorkerFrame(
        engineState,
        frame,
      );
      if (topologyPacket) {
        postMessageWithTransfers(
          { type: "topology-packet", packet: topologyPacket },
          topologyPacket,
        );
      }
      // Drive buffers are compact and worker-owned. Structured clone gives
      // the main thread an immutable packet copy while keeping these backing
      // stores attached for allocation-free reuse on the next fast tick.
      self.postMessage({ type: "drive-packet", packet: drivePacket });
      self.postMessage({
        type: "status",
        status: buildWorkerStatus(engineState, "frame-processed"),
      });
    } catch (error) {
      self.postMessage({
        type: "status",
        status: {
          ...buildWorkerStatus(engineState, "frame-processing-failed"),
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      self.postMessage({
        type: "analysis-input-ack",
        sourceGeneration: engineState.sourceGeneration,
        workerGeneration: engineState.workerGeneration,
        frameId: frame.frameId,
      });
    }
  });
}
