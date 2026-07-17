import { createAudioFeatureState } from "./modalStack.js";
import {
  buildCurrentAudioFeatureAnalysisResult,
  composeAudioFeatureFrame,
  prepareAudioFeatureFrameInputs,
  updateAudioFeatureChromaState,
  updateAudioFeatureFastSignalState,
  updateAudioFeatureStructuralState,
  updateAudioFeatureTempoState,
} from "./buildFeatureFrame.js";
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
import { computeModalInputExposure } from "./modalResponse.js";
import {
  computePhaseAnchorAngularVelocityRadPerSec,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";

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
    latestStructuralState: null,
    latestAnalysisResult: null,
    latestFeatureFrame: null,
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
    bandwidthLimitedTopologyRetentionCount: 0,
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
  state.latestStructuralState = null;
  state.latestAnalysisResult = null;
  state.latestFeatureFrame = null;
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
    includeSpectralLight: configuration?.includeSpectralLight,
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
  );
  const probeModeIndices = selectFastModalProbeModeIndices(committedModes);
  const signature = buildFastEstimatorSignature(
    committedModes,
    preparedInputs.sampleRate,
    probeModeIndices,
  );
  state.committedModes = committedModes;
  if (!committedModes.length) {
    state.fastEstimator = null;
    state.fastEstimatorSignature = null;
    return;
  }
  if (state.fastEstimator && state.fastEstimatorSignature === signature) {
    state.fastEstimator.updateCommittedModes(committedModes);
    return;
  }
  state.fastEstimator = createFastModalDriveEstimator({
    committedModes,
    sampleRate: preparedInputs.sampleRate,
    probeModeIndices,
  });
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

function shouldRetainCommittedTopology(state, candidateTopologyFrame) {
  const committedFieldAuthority =
    state.latestTopologyFrame?.modalDescriptor?.fieldAuthority;
  return (
    candidateTopologyFrame?.modalDescriptor?.fieldAuthority ===
      "bandwidth-limited" &&
    (committedFieldAuthority === "complete" ||
      committedFieldAuthority === "capacity-limited") &&
    (state.latestDriveTopology?.activeModeCount ?? 0) > 0 &&
    state.committedModes.length > 0 &&
    state.fastEstimator !== null
  );
}

function runExactFastDrive(state, preparedFast, fastSignalState) {
  if (!state.fastEstimator || !state.latestStructuralState) {
    return;
  }
  const timeDomainData = preparedFast.snapshot?.timeData;
  if (!(timeDomainData instanceof Float32Array)) {
    return;
  }
  const hardSilence = preparedFast.liveInputHardSilenceActive === true;
  const inputExposure = hardSilence
    ? 0
    : computeModalInputExposure({
        inputRms: preparedFast.analyserRms,
      });
  const goertzelStartedAt = getWorkerNow();
  const exactDriveResult = state.fastEstimator.evaluate(
    timeDomainData,
    inputExposure,
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
    fftLinearAmplitudes: fastSignalState.fftLinearAmplitudes,
    timeDomainData,
    sampleRate: preparedFast.sampleRate,
    deltaMs,
    inputRms: preparedFast.analyserRms,
    hardSilence,
    coherence: Math.max(0, 1 - (fastSignalState.trebleBroadbandEnergy ?? 0)),
    frameTimeMs: preparedFast.currentFrameAtMs,
  });
}

function createTopologyDriveProjection(
  topologyPacket,
  committedModes,
  previousProjection = null,
) {
  const committedModeCount = committedModes.length;
  const visibleModeCount = Math.min(
    committedModeCount,
    Math.max(0, Math.floor(topologyPacket.activeModeCount ?? 0)),
  );
  const sourceCommittedIndices = Uint16Array.from(
    committedModes
      .map((mode, index) =>
        index < visibleModeCount && mode.layer !== "resonant" ? index : -1,
      )
      .filter((index) => index >= 0),
  );
  const resonantCommittedIndices = Uint16Array.from(
    committedModes
      .map((mode, index) =>
        index < visibleModeCount && mode.layer === "resonant" ? index : -1,
      )
      .filter((index) => index >= 0),
  );
  const sourceSlots = new Float32Array(sourceCommittedIndices.length * 4);
  const resonantSlots = new Float32Array(resonantCommittedIndices.length * 4);
  const sourcePhaseSlots = new Float32Array(sourceSlots.length);
  const resonantPhaseSlots = new Float32Array(resonantSlots.length);
  const committedDisplaySlots = new Float32Array(committedModeCount * 4);
  const committedSignalSlots = new Float32Array(committedModeCount * 4);
  const committedDisplayReferenceSlots = new Float32Array(
    committedModeCount * 4,
  );
  const committedSignalReferenceSlots = new Float32Array(
    committedModeCount * 4,
  );
  const committedPhaseSlots = new Float32Array(committedModeCount * 4);
  const previousDisplayAmplitudeByModeKey = new Map();
  const previousSignalAmplitudeByModeKey = new Map();
  for (
    let index = 0;
    index < (previousProjection?.committedModeCount ?? 0);
    index += 1
  ) {
    const offset = index * 4;
    const modeKey = `${previousProjection.committedDisplaySlots[offset]}:${previousProjection.committedDisplaySlots[offset + 1]}:${previousProjection.committedDisplaySlots[offset + 2]}`;
    previousDisplayAmplitudeByModeKey.set(
      modeKey,
      previousProjection.committedDisplaySlots[offset + 3],
    );
    previousSignalAmplitudeByModeKey.set(
      modeKey,
      previousProjection.committedSignalSlots[offset + 3],
    );
  }
  for (let index = 0; index < committedModeCount; index += 1) {
    const mode = committedModes[index];
    const offset = index * 4;
    for (let component = 0; component < 3; component += 1) {
      const identity =
        component === 0 ? mode.u : component === 1 ? mode.v : mode.w;
      committedDisplaySlots[offset + component] = identity;
      committedSignalSlots[offset + component] = identity;
      committedDisplayReferenceSlots[offset + component] = identity;
      committedSignalReferenceSlots[offset + component] = identity;
    }
    committedDisplayReferenceSlots[offset + 3] =
      previousDisplayAmplitudeByModeKey.get(mode.modeKey) ?? 0;
    committedSignalReferenceSlots[offset + 3] =
      previousSignalAmplitudeByModeKey.get(mode.modeKey) ?? 0;
  }
  const initializeLayerIdentities = (target, committedIndices) => {
    for (
      let layerIndex = 0;
      layerIndex < committedIndices.length;
      layerIndex += 1
    ) {
      const committedOffset = committedIndices[layerIndex] * 4;
      const layerOffset = layerIndex * 4;
      for (let component = 0; component < 3; component += 1) {
        target[layerOffset + component] =
          committedDisplaySlots[committedOffset + component];
      }
    }
  };
  initializeLayerIdentities(sourceSlots, sourceCommittedIndices);
  initializeLayerIdentities(resonantSlots, resonantCommittedIndices);
  return {
    sourceSlots,
    resonantSlots,
    sourcePhaseSlots,
    resonantPhaseSlots,
    sourceCommittedIndices,
    resonantCommittedIndices,
    committedDisplaySlots,
    committedSignalSlots,
    committedDisplayReferenceSlots,
    committedSignalReferenceSlots,
    committedPhaseSlots,
    visibleDisplaySlots: committedDisplaySlots.subarray(
      0,
      visibleModeCount * 4,
    ),
    visibleSignalSlots: committedSignalSlots.subarray(0, visibleModeCount * 4),
    visibleDisplayReferenceSlots: committedDisplayReferenceSlots.subarray(
      0,
      visibleModeCount * 4,
    ),
    visibleSignalReferenceSlots: committedSignalReferenceSlots.subarray(
      0,
      visibleModeCount * 4,
    ),
    activeSourceCoupledModeCount: sourceCommittedIndices.length,
    activeResonantModeCount: resonantCommittedIndices.length,
    activeModeCount: visibleModeCount,
    visibleModeCount,
    committedModeCount,
  };
}

function readTopologyDriveEntry(modalExcitationState, slots, offset) {
  const modeKey = `${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`;
  return (
    modalExcitationState?.observedModes?.get?.(modeKey) ??
    modalExcitationState?.activeModes?.get?.(modeKey) ??
    modalExcitationState?.modalCandidateState?.get?.(modeKey) ??
    null
  );
}

function refreshTopologyDriveProjection(state) {
  const projection = state.topologyDriveProjection;
  const modalExcitationState =
    state.featureState?.analysis?.modalExcitationState;
  if (!projection || !modalExcitationState) {
    return;
  }
  for (
    let offset = 0;
    offset < projection.committedDisplaySlots.length;
    offset += 4
  ) {
    projection.committedDisplayReferenceSlots[offset + 3] =
      projection.committedDisplaySlots[offset + 3];
    projection.committedSignalReferenceSlots[offset + 3] =
      projection.committedSignalSlots[offset + 3];
    const entry = readTopologyDriveEntry(
      modalExcitationState,
      projection.committedDisplaySlots,
      offset,
    );
    projection.committedDisplaySlots[offset + 3] = Math.max(
      0,
      entry?.displayAmplitude ??
        entry?.amplitude ??
        Math.sqrt(Math.max(0, entry?.modalResponseEnergy ?? 0)),
    );
    projection.committedSignalSlots[offset + 3] = Math.sqrt(
      Math.max(
        0,
        Math.min(
          entry?.modalResponseEnergy ?? 0,
          entry?.modalResponseDrive ?? 0,
        ),
      ),
    );
  }
  const copyLayerCoefficients = (target, committedIndices) => {
    for (
      let layerIndex = 0;
      layerIndex < committedIndices.length;
      layerIndex += 1
    ) {
      target[layerIndex * 4 + 3] =
        projection.committedDisplaySlots[committedIndices[layerIndex] * 4 + 3];
    }
  };
  copyLayerCoefficients(
    projection.sourceSlots,
    projection.sourceCommittedIndices,
  );
  copyLayerCoefficients(
    projection.resonantSlots,
    projection.resonantCommittedIndices,
  );
  const phaseAnchorAngularVelocityRadPerSec =
    computePhaseAnchorAngularVelocityRadPerSec({
      slotSets: [
        {
          visibleSlots: projection.visibleDisplaySlots,
          capacity: projection.visibleModeCount,
        },
      ],
      activeModes: modalExcitationState.activeModes,
      observedModes: modalExcitationState.observedModes,
    });
  writePhaseSlotsForVisibleModes({
    target: projection.committedPhaseSlots,
    visibleSlots: projection.committedDisplaySlots,
    capacity: projection.committedModeCount,
    activeModes: modalExcitationState.activeModes,
    observedModes: modalExcitationState.observedModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
  });
  const copyLayerPhases = (target, committedIndices) => {
    for (
      let layerIndex = 0;
      layerIndex < committedIndices.length;
      layerIndex += 1
    ) {
      const committedOffset = committedIndices[layerIndex] * 4;
      const layerOffset = layerIndex * 4;
      for (let component = 0; component < 4; component += 1) {
        target[layerOffset + component] =
          projection.committedPhaseSlots[committedOffset + component];
      }
    }
  };
  copyLayerPhases(
    projection.sourcePhaseSlots,
    projection.sourceCommittedIndices,
  );
  copyLayerPhases(
    projection.resonantPhaseSlots,
    projection.resonantCommittedIndices,
  );
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function buildVisibleStructuralMetrics(state, baseMetrics) {
  const projection = state.topologyDriveProjection;
  const modalExcitationState =
    state.featureState?.analysis?.modalExcitationState;
  if (!projection || !baseMetrics) {
    return baseMetrics;
  }

  let sourceEnergy = 0;
  let resonantEnergy = 0;
  let sourceCurrentSignalEnergy = 0;
  let resonantCurrentSignalEnergy = 0;
  let rawEnergy = 0;
  let modalDriveEnergy = 0;
  let dampingEnvelope = 0;
  let couplingStrength = 0;
  let phaseConfidence = 0;
  let persistence = 0;
  let entryCount = 0;
  for (let index = 0; index < projection.visibleModeCount; index += 1) {
    const offset = index * 4;
    const mode = state.committedModes[index];
    const entry = readTopologyDriveEntry(
      modalExcitationState,
      projection.committedDisplaySlots,
      offset,
    );
    const retainedEnergy = clampUnit(
      (projection.committedDisplaySlots[offset + 3] ?? 0) ** 2,
    );
    const currentSignalEnergy = clampUnit(
      (projection.committedSignalSlots[offset + 3] ?? 0) ** 2,
    );
    if (mode?.layer === "resonant") {
      resonantEnergy += retainedEnergy;
      resonantCurrentSignalEnergy += currentSignalEnergy;
    } else {
      sourceEnergy += retainedEnergy;
      sourceCurrentSignalEnergy += currentSignalEnergy;
    }
    rawEnergy += clampUnit(
      entry?.modalResponseRawEnergy ?? entry?.modalResponseEnergy ?? 0,
    );
    modalDriveEnergy += clampUnit(entry?.modalResponseDrive ?? 0);
    dampingEnvelope += clampUnit(entry?.dampingEnvelope ?? 0);
    couplingStrength += clampUnit(entry?.couplingStrength ?? 0);
    phaseConfidence += clampUnit(entry?.phaseConfidence ?? 0);
    persistence += clampUnit(entry?.persistence ?? 0);
    entryCount += 1;
  }

  sourceEnergy = clampUnit(sourceEnergy);
  resonantEnergy = clampUnit(resonantEnergy);
  const modalResponseEnergy = clampUnit(sourceEnergy + resonantEnergy);
  sourceCurrentSignalEnergy = clampUnit(sourceCurrentSignalEnergy);
  resonantCurrentSignalEnergy = clampUnit(resonantCurrentSignalEnergy);
  const currentSignalEnergy = clampUnit(
    sourceCurrentSignalEnergy + resonantCurrentSignalEnergy,
  );
  const average = (value) => (entryCount > 0 ? value / entryCount : 0);

  return {
    ...baseMetrics,
    modalDriveEnergy: clampUnit(average(modalDriveEnergy)),
    currentSignalEnergy,
    currentSignalAmplitude: Math.sqrt(currentSignalEnergy),
    modalResponseCurrentSignalEnergy: currentSignalEnergy,
    modalResponseSourceCoupledCurrentSignalEnergy: sourceCurrentSignalEnergy,
    modalResponseResonantCurrentSignalEnergy: resonantCurrentSignalEnergy,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy: sourceEnergy,
    modalResponseResonantEnergy: resonantEnergy,
    modalResponseModeCount: entryCount,
    modalResponseRawEnergy: clampUnit(rawEnergy),
    modalResponseAverageDampingEnvelope: clampUnit(average(dampingEnvelope)),
    modalResponseAverageCouplingStrength: clampUnit(average(couplingStrength)),
    modalResponseAveragePhaseConfidence: clampUnit(average(phaseConfidence)),
    modalResponseAveragePersistence: clampUnit(average(persistence)),
    modalResponseCurrentRenderSourceEvidence: currentSignalEnergy > 0,
    modalResponseFreshCouplingEvidence: currentSignalEnergy > 0,
    modalResponseRenderPreviewEnergy: modalResponseEnergy,
    modalResponseRenderEnergy: modalResponseEnergy,
    modalResponseRenderPreviewSourceCoupledEnergy: sourceEnergy,
    modalResponseRenderPreviewResonantEnergy: resonantEnergy,
    modalResponseRenderSourceCoupledEnergy: sourceEnergy,
    modalResponseRenderResonantEnergy: resonantEnergy,
    modalResponseRenderPreviewRawEnergy: clampUnit(rawEnergy),
    modalResponseRenderRawEnergy: clampUnit(rawEnergy),
  };
}

function applyTopologyDriveProjection(state, analysisResult) {
  const projection = state.topologyDriveProjection;
  if (!projection) {
    return analysisResult;
  }
  analysisResult.candidateForcingSlots = projection.sourceSlots;
  analysisResult.candidateResponseSlots = projection.resonantSlots;
  analysisResult.sourceCoupledPhaseSlots = projection.sourcePhaseSlots;
  analysisResult.resonantPhaseSlots = projection.resonantPhaseSlots;
  // Hidden committed modes remain in the oscillator state and full-width
  // drive packet, but only the topology's visible prefix may own render
  // signals, energy-ledger authority, or field state.
  analysisResult.modeSlots = projection.visibleDisplaySlots;
  analysisResult.signalModeSlots = projection.visibleSignalSlots;
  analysisResult.referenceModeSlots = projection.visibleDisplayReferenceSlots;
  analysisResult.signalReferenceModeSlots =
    projection.visibleSignalReferenceSlots;
  analysisResult.activeSourceCoupledModeCount =
    projection.activeSourceCoupledModeCount;
  analysisResult.activeResonantModeCount = projection.activeResonantModeCount;
  analysisResult.activeModeCount = projection.activeModeCount;
  analysisResult.structuralMetrics = buildVisibleStructuralMetrics(
    state,
    analysisResult.structuralMetrics,
  );
  return analysisResult;
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
    previousFrame: state.latestFeatureFrame,
    smoothFromPreviousFrame: Boolean(state.latestFeatureFrame),
    topologyFrame: state.latestTopologyFrame,
  });
  recordPerf(state.perf.composition, getWorkerNow() - compositionStartedAt);
  state.latestFeatureFrame = featureFrame;
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
    bandwidthLimitedTopologyRetentionCount:
      state.bandwidthLimitedTopologyRetentionCount,
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
  if (topologyPacket.topologyFingerprint === state.latestTopologyFingerprint) {
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
  state.topologyDriveProjection = createTopologyDriveProjection(
    topologyPacket,
    state.committedModes,
    state.topologyDriveProjection,
  );
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
  if (preparedFast.silentFeatureFrame) {
    state.latestStructuralState = null;
    state.latestAnalysisResult = null;
    state.latestFeatureFrame = preparedFast.silentFeatureFrame;
    state.latestTopologyFrame = preparedFast.silentFeatureFrame;
    state.topologyDriveProjection = null;
    state.committedModes = [];
    state.fastEstimator = null;
    state.fastEstimatorSignature = null;
  } else {
    const fastSignalState = updateAudioFeatureFastSignalState(preparedFast);
    const structuralUpdate = runStructuralLane(state, frame, fastSignalState);
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
      const previousDescriptorAuthority =
        preparedFast.featureState.analysis.modalDescriptorAuthorityState
          ?.previousFieldAuthority;
      const topologyFeatureFrame = composeAudioFeatureFrame({
        preparedInputs: structuralUpdate.preparedStructural,
        analysisResult: topologyAnalysisResult,
        topologyOnly: true,
      });
      const retainCommittedTopology = shouldRetainCommittedTopology(
        state,
        topologyFeatureFrame,
      );
      if (retainCommittedTopology) {
        state.bandwidthLimitedTopologyRetentionCount += 1;
        if (preparedFast.featureState.analysis.modalDescriptorAuthorityState) {
          preparedFast.featureState.analysis.modalDescriptorAuthorityState.previousFieldAuthority =
            previousDescriptorAuthority;
        }
      } else {
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
      }
      restoreFastModalOscillatorState({
        modalExcitationState:
          preparedFast.featureState.analysis.modalExcitationState,
        committedModes: state.committedModes,
        previousOscillatorState: structuralUpdate.previousOscillatorState,
      });
    }
    runExactFastDrive(state, preparedFast, fastSignalState);
    refreshTopologyDriveProjection(state);
    buildCurrentFeatureFrame(state, preparedFast, fastSignalState);
  }
  state.lastFastFrameAtMs = frame.captureTimestampMs;
  state.processedFrameCount += 1;
  recordPerf(state.perf.fastLane, getWorkerNow() - startedAt);

  const featureFrame = state.latestFeatureFrame;
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
