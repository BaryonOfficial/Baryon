import { AUDIT_DEFAULTS, AUDIO_DEFAULTS } from "../../defaults.js";
import { sampleFFTAmplitudeForFrequency } from "../normalModes.js";
import {
  MAX_STACK_SLOTS,
  createAudioFeatureState,
  clearModalStack,
  decayModalStack,
  copyFloatArray,
  countActiveSlots,
} from "./modalStack.js";
import {
  buildModalSlotsFromFundamental,
  buildModalSlotsFromSpectralPeaks,
} from "./modalResolvers.js";
import { deriveFieldState } from "./fieldState.js";
import { AUDIO_ANALYSIS_POLICY } from "./policy.js";
import { FIELD_STATES } from "./types.js";

const {
  minPeakClarity: MIN_PEAK_CLARITY,
  micSilenceAvgAmplitude: MIC_SILENCE_AVG_AMPLITUDE,
  micSilenceRms: MIC_SILENCE_RMS,
  requestedPitchSource: REQUESTED_PITCH_SOURCE,
} = AUDIO_ANALYSIS_POLICY;

export { createAudioFeatureState, FIELD_STATES };

function getAnalysisMemory(featureState, capacity) {
  if (featureState?.analysis) {
    return featureState.analysis;
  }

  return createAudioFeatureState(capacity).analysis;
}

function getFrameTimestamp() {
  return performance.now();
}

export function buildSilentFeatureFrame({
  featureState,
  inputMode,
  soundActive,
  micActive,
  modeSlots,
  referenceModeSlots,
  modalStackState,
  fftSize,
}) {
  modeSlots.fill(0);
  referenceModeSlots.fill(0);
  clearModalStack(modalStackState);

  let silentFft = featureState?.analysis?.fftMagnitudes;
  if (!silentFft?.length) {
    silentFft = new Float32Array((fftSize ?? 0) / 2);
  }
  silentFft.fill(0);

  if (featureState?.analysis) {
    featureState.analysis.fftMagnitudes = silentFft;
  }

  return {
    fieldState: FIELD_STATES.idle,
    hasModalField: false,
    soundActive,
    micActive,
    averageAmplitude: 0,
    fftMagnitudes: silentFft,
    modeSlots,
    referenceModeSlots,
    sourceMode: "silent",
    debug: {
      audioInputMode: inputMode,
      pitchSource: "none",
      requestedPitchSource: REQUESTED_PITCH_SOURCE,
      analysisEngine: "none",
      fieldState: FIELD_STATES.idle,
      workerState: "none",
      pitchFrameAge: null,
      workerStatus: null,
      fileActive: soundActive,
      micActive,
      analysisSourceUsed: inputMode === "idle" ? "none" : inputMode,
      fundamentalFrequency: 0,
      fundamentalConfidence: 0,
      dominantFrequency: 0,
      dominantAmplitude: 0,
      avgAmplitude: 0,
      harmonicSupport: Array.from(modalStackState.harmonicSupport),
      uniqueModeCount: 0,
      nonZeroFFTBinCount: 0,
      modeSlotCount: 0,
      currentModeSlots: Array.from(modeSlots),
      referenceModeSlots: Array.from(referenceModeSlots),
      slotAmplitudeDeltas: Array.from(referenceModeSlots),
    },
  };
}

export function applyTestToneToSnapshot({
  analysisSnapshot,
  auditSettings,
  fftSize,
  sampleRate,
}) {
  const snapshot = analysisSnapshot ?? {
    sourceMode: "test",
    avgAmplitude: 0,
    fftMagnitudes: new Float32Array(fftSize / 2),
    timeData: null,
    rms: 0,
  };
  const fftMagnitudes = snapshot.fftMagnitudes?.length
    ? snapshot.fftMagnitudes
    : new Float32Array(fftSize / 2);

  fftMagnitudes.fill(0);
  const testBinAmplitude = Math.max(
    0,
    Math.min(1, auditSettings.testToneAmplitude),
  );
  const bin = Math.round(
    (auditSettings.testToneHz / (sampleRate * 0.5)) *
      (fftMagnitudes.length - 1),
  );
  const index = Math.max(0, Math.min(fftMagnitudes.length - 1, bin));
  fftMagnitudes[index] = testBinAmplitude;

  return {
    ...snapshot,
    sourceMode: "test",
    avgAmplitude: testBinAmplitude * 255,
    fftMagnitudes,
    rms: snapshot.rms ?? 0,
  };
}

export function detectMicNoiseGate({
  injectTestTone,
  inputMode,
  avgAmplitude,
  rms,
}) {
  return (
    !injectTestTone &&
    inputMode === "mic" &&
    avgAmplitude < MIC_SILENCE_AVG_AMPLITUDE &&
    rms < MIC_SILENCE_RMS
  );
}

function commitModalStack(
  modalStackState,
  stackBuild,
  fundamental,
  confidence,
  analysisEngine,
) {
  copyFloatArray(modalStackState.slots, stackBuild.slots);
  copyFloatArray(modalStackState.referenceSlots, stackBuild.referenceSlots);
  modalStackState.harmonicSupport.set(stackBuild.harmonicSupport);
  modalStackState.fundamental = fundamental;
  modalStackState.fundamentalConfidence = confidence;
  modalStackState.analysisEngine = analysisEngine;
  modalStackState.uniqueModeCount = stackBuild.uniqueModeCount;
  modalStackState.lastStableAt = getFrameTimestamp();
}

export function resolveSpectralModalStack({
  analysisSnapshot,
  status,
  modalStackState,
  radius,
  capacity,
  micNoiseGateActive,
  auditSettings,
}) {
  let selectedFrequency = 0;
  let selectedConfidence = 0;
  let analysisEngine = "none";
  let pitchSource = "none";
  let spectralCandidates = [];
  let usedDecay = false;

  if (auditSettings.injectTestTone) {
    selectedFrequency = auditSettings.testToneHz;
    selectedConfidence = 1;
    analysisEngine = "test";
    pitchSource = "test";
  } else if (!micNoiseGateActive && analysisSnapshot?.fftMagnitudes) {
    const spectralStack = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes: analysisSnapshot.fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity,
    });
    spectralCandidates = spectralStack.peaks;

    if (spectralStack.uniqueModeCount > 0) {
      commitModalStack(
        modalStackState,
        spectralStack,
        spectralCandidates[0]?.frequency ?? 0,
        spectralCandidates[0]?.amplitude ?? 0,
        "spectral",
      );
      analysisEngine = "spectral";
      pitchSource = "spectral";
    }
  }

  if (selectedFrequency > 0 && selectedConfidence >= MIN_PEAK_CLARITY) {
    const stackBuild = buildModalSlotsFromFundamental({
      frequency: selectedFrequency,
      confidence: selectedConfidence,
      fftMagnitudes:
        analysisSnapshot?.fftMagnitudes ?? new Float32Array(status.fftSize / 2),
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity,
    });
    commitModalStack(
      modalStackState,
      stackBuild,
      selectedFrequency,
      selectedConfidence,
      analysisEngine,
    );
  } else if (
    analysisEngine !== "spectral" &&
    status.audioInputMode !== "idle" &&
    !micNoiseGateActive &&
    modalStackState.analysisEngine !== "none"
  ) {
    decayModalStack(modalStackState);
    usedDecay = true;
  } else if (analysisEngine !== "spectral") {
    clearModalStack(modalStackState);
  }

  return {
    analysisEngine,
    pitchSource,
    spectralCandidates,
    usedDecay,
  };
}

export function finalizeFeatureDebugSnapshot({
  inputMode,
  pitchSource,
  analysisEngine,
  fieldState,
  soundActive,
  micActive,
  micNoiseGateActive,
  modalStackState,
  dominantFrequency,
  dominantAmplitude,
  avgAmplitude,
  analyserRms,
  spectralCandidates,
  fftMagnitudes,
  activeModeCount,
  returnedModeSlots,
  referenceModeSlots,
  slotAmplitudeDeltas,
  sampleRate,
  fftSize,
}) {
  return {
    audioInputMode: inputMode,
    pitchSource,
    requestedPitchSource: REQUESTED_PITCH_SOURCE,
    analysisEngine,
    fieldState,
    workerState: "none",
    pitchFrameAge: null,
    workerStatus: null,
    fileActive: soundActive,
    micActive,
    micNoiseGateActive,
    analysisSourceUsed: inputMode === "idle" ? "none" : inputMode,
    fundamentalFrequency: modalStackState.fundamental,
    fundamentalConfidence: modalStackState.fundamentalConfidence,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    harmonicSupport: Array.from(modalStackState.harmonicSupport),
    spectralCandidates: spectralCandidates.map((peak) => ({
      frequency: peak.frequency,
      amplitude: peak.amplitude,
    })),
    uniqueModeCount: modalStackState.uniqueModeCount,
    nonZeroFFTBinCount: fftMagnitudes.reduce(
      (count, value) => count + (value > 0.001 ? 1 : 0),
      0,
    ),
    modeSlotCount: activeModeCount,
    currentModeSlots: Array.from(returnedModeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    slotAmplitudeDeltas: Array.from(slotAmplitudeDeltas),
    referencePitchBinAmplitude: dominantFrequency
      ? sampleFFTAmplitudeForFrequency(
          dominantFrequency,
          fftMagnitudes,
          sampleRate,
          fftSize,
        )
      : 0,
  };
}

export function buildAudioFeatureFrame({
  analysisSnapshot,
  featureState,
  radius,
  status,
  auditSettings = undefined,
}) {
  const capacity = featureState?.capacity ?? AUDIO_DEFAULTS.capacity;
  const analysisMemory = getAnalysisMemory(featureState, capacity);
  const modeSlots = analysisMemory.modeSlots ?? new Float32Array(capacity * 4);
  const referenceModeSlots =
    analysisMemory.referenceModeSlots ?? new Float32Array(capacity * 4);
  const auditState = featureState?.audit;
  const resolvedAuditSettings = auditSettings ??
    auditState?.settings ?? {
      ...AUDIT_DEFAULTS,
    };
  const sampleRate = status?.sampleRate ?? 44100;
  const fftSize = status?.fftSize ?? 4096;
  const inputMode = status?.audioInputMode ?? "idle";
  const soundActive = Boolean(status?.isPlaying);
  const micActive = Boolean(status?.isMicActive);
  const currentFrame = (analysisMemory.frameId ?? 0) + 1;
  const modalStackState =
    analysisMemory.modalStackState ??
    createAudioFeatureState(capacity).analysis.modalStackState;

  if (featureState?.analysis) {
    featureState.analysis.frameId = currentFrame;
    featureState.analysis.modalStackState = modalStackState;
  }

  let sourceMode =
    inputMode === "file" ? "file" : inputMode === "mic" ? "mic" : "silent";
  if (resolvedAuditSettings.injectTestTone) sourceMode = "test";

  if (!analysisSnapshot && !resolvedAuditSettings.injectTestTone) {
    return buildSilentFeatureFrame({
      featureState,
      inputMode,
      soundActive,
      micActive,
      modeSlots,
      referenceModeSlots,
      modalStackState,
      fftSize,
    });
  }

  const snapshot = resolvedAuditSettings.injectTestTone
    ? applyTestToneToSnapshot({
        analysisSnapshot,
        auditSettings: resolvedAuditSettings,
        fftSize,
        sampleRate,
      })
    : analysisSnapshot;

  const avgAmplitude = snapshot?.avgAmplitude ?? 0;
  const analyserRms = snapshot?.rms ?? 0;
  const fftMagnitudesSource =
    snapshot?.fftMagnitudes ?? new Float32Array(fftSize / 2);

  const micNoiseGateActive = detectMicNoiseGate({
    injectTestTone: resolvedAuditSettings.injectTestTone,
    inputMode,
    avgAmplitude,
    rms: analyserRms,
  });

  const { analysisEngine, pitchSource, spectralCandidates, usedDecay } =
    resolveSpectralModalStack({
      analysisSnapshot: snapshot,
      status: {
        ...status,
        sampleRate,
        fftSize,
      },
      modalStackState,
      radius,
      capacity,
      micNoiseGateActive,
      auditSettings: resolvedAuditSettings,
    });

  copyFloatArray(modeSlots, modalStackState.slots);
  copyFloatArray(referenceModeSlots, modalStackState.referenceSlots);

  let returnedModeSlots = modeSlots;
  if (resolvedAuditSettings.freezeModeSlots && auditState) {
    if (auditState.frozenModeSlots.every((value) => value === 0)) {
      auditState.frozenModeSlots.set(modeSlots);
    }
    returnedModeSlots = auditState.frozenModeSlots;
  } else if (auditState) {
    auditState.frozenModeSlots.fill(0);
  }

  let fftMagnitudes = analysisMemory.fftMagnitudes;
  if (!fftMagnitudes || fftMagnitudes.length !== fftMagnitudesSource.length) {
    fftMagnitudes = new Float32Array(fftMagnitudesSource.length);
    if (featureState?.analysis) {
      featureState.analysis.fftMagnitudes = fftMagnitudes;
    }
  }
  fftMagnitudes.set(fftMagnitudesSource);

  const slotAmplitudeDeltas = new Float32Array(
    Math.min(capacity, MAX_STACK_SLOTS),
  );
  const slotLimit = Math.min(
    slotAmplitudeDeltas.length,
    returnedModeSlots.length / 4,
  );
  for (let i = 0; i < slotLimit; i++) {
    slotAmplitudeDeltas[i] =
      returnedModeSlots[i * 4 + 3] - referenceModeSlots[i * 4 + 3];
  }

  const dominantFrequency = modalStackState.fundamental;
  const dominantAmplitude = dominantFrequency
    ? sampleFFTAmplitudeForFrequency(
        dominantFrequency,
        fftMagnitudes,
        sampleRate,
        fftSize,
      )
    : 0;

  const activeModeCount = countActiveSlots(returnedModeSlots, capacity);
  const { fieldState, hasModalField } = deriveFieldState({
    injectTestTone: resolvedAuditSettings.injectTestTone,
    activeModeCount,
    usedDecay,
  });
  if (
    fieldState === FIELD_STATES.idle &&
    !resolvedAuditSettings.injectTestTone
  ) {
    sourceMode = "silent";
  }

  const debug = finalizeFeatureDebugSnapshot({
    inputMode,
    pitchSource,
    analysisEngine,
    fieldState,
    soundActive,
    micActive,
    micNoiseGateActive,
    modalStackState,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    spectralCandidates,
    fftMagnitudes,
    activeModeCount,
    returnedModeSlots,
    referenceModeSlots,
    slotAmplitudeDeltas,
    sampleRate,
    fftSize,
  });

  if (auditState) {
    auditState.frame += 1;
    auditState.lastSnapshot = debug;
  }

  return {
    fieldState,
    hasModalField,
    soundActive,
    micActive,
    averageAmplitude: avgAmplitude,
    fftMagnitudes,
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    sourceMode,
    debug,
    audit: resolvedAuditSettings,
  };
}
