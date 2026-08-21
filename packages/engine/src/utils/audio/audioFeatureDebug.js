import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
} from "../../core/cavityGeometry.js";
import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
} from "../../core/audio/liveInputAnalysis.js";
import { sampleFFTAmplitudeForFrequency } from "../cavityModes.js";
import { clamp01 } from "../math.js";
import {
  EMPTY_LIVE_INPUT_EVIDENCE_UNITS,
  EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
} from "./liveInputNoiseGate.js";
import { MAX_STACK_SLOTS, countActiveSlots } from "./modalStack.js";
import { AUDIO_ANALYSIS_POLICY, SPECTRAL_MODAL_POLICY } from "./policy.js";
import { computeSpectralEffectiveBinCount } from "./spectralEvidence.js";
import { FIELD_STATES } from "./types.js";

const { requestedPitchSource: REQUESTED_PITCH_SOURCE } = AUDIO_ANALYSIS_POLICY;
const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;

/** @typedef {import("../../core/cavityGeometry.js").CavityGeometry} CavityGeometry */

function shouldIncludeDetailedDebug(auditSettings) {
  return Boolean(auditSettings?.enabled);
}

function resolveAnalysisSourceUsed(sourceKind, analysisInputMode) {
  if (sourceKind === "system") {
    return analysisInputMode === "live" ? "live" : "system";
  }
  if (sourceKind === "file") {
    return "file";
  }
  return "none";
}

function buildDebugSummary({
  sourceKind,
  analysisInputMode,
  sourceEvidence = null,
  soundActive,
  micActive,
  lineFeedProgramActive = false,
  lineFeedProgramExcitation = 0,
  pitchSource = "none",
  analysisEngine = "none",
  fieldState = FIELD_STATES.idle,
  renderAuthority = false,
  liveInputNoiseGateActive = false,
  liveInputHardSilenceActive = false,
  liveInputCalibrationActive = false,
  liveInputCalibrationInvalid = false,
  liveInputCalibrationInvalidReason = "none",
  liveInputGateDiagnostics = EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
  liveInputAnalysisClass = DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  resolvedLiveInputAnalysisClass = DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  liveInputAcousticIntent = DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  liveInputPolicy = DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  liveInputBaselineRms = 0,
  liveInputBaselinePeak = 0,
  sourceCoupledState,
  resonantState,
  dominantFrequency = 0,
  dominantAmplitude = 0,
  avgAmplitude = 0,
  analyserRms = 0,
  fftLinearAmplitudes,
  spectralEffectiveBinCount = null,
  candidateForcingSlots,
  candidateResponseSlots,
  modeSlots,
  transientEnergy = 0,
  spectralCentroid = 0,
  spectralSpread = 0,
  spectralFlatness = 0,
  spectralFlux = 0,
  structureSignal = 0,
  energySignal = 0,
  modalCoefficientEnergy = 0,
  retainedModalCoefficientEnergy = 0,
  observationEnergy = 0,
  modalVisibilityEnergy = 0,
  modalVisibilitySummary = null,
  timbreSpread = 0,
  spectralNovelty = 0,
  changeSignal = 0,
  changeBreakdown = null,
  pulseSignal = 0,
  beatDetected = false,
  beatPulseId = 0,
  beatStrength = 0,
  beatConfidence = 0,
  beatLowBandEnergy = 0,
  beatOnsetDriver = 0,
  beatThreshold = 0,
  sampleRate = 0,
  fftSize = 0,
  structuralMetrics = null,
  fftPeakAmplitude = 0,
  referencePitchBinAmplitude = null,
  sourceNormalization = undefined,
  modalPhaseAuthority = 0,
  modalObservationCoherence = 0,
  modalObservationConfidence = 0,
  modalResponseEnergy = 0,
  modalResponseRenderEnergy = 0,
  modalResponseRenderRawEnergy = 0,
  modalResponseCurrentRenderSourceEvidence = false,
  modalResponseSourceCoupledEnergy = 0,
  modalResponseResonantEnergy = 0,
  energyLedger = null,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  const sourceCoupledModeCount = countActiveSlots(
    candidateForcingSlots,
    MAX_STACK_SLOTS,
  );
  const resonantModeCount = countActiveSlots(
    candidateResponseSlots,
    MAX_STACK_SLOTS,
  );
  const modeSlotCount = countActiveSlots(modeSlots, MAX_STACK_SLOTS);
  const resolvedModalVisibilitySummary = modalVisibilitySummary ?? {};
  const modalVisibilityDriveEnergy = clamp01(
    structuralMetrics?.modalDriveEnergy ?? 0,
  );
  const modalObserverVisibilityEnergy =
    resolvedModalVisibilitySummary.observableModalEnergy ?? 0;
  const gateDiagnostics =
    liveInputGateDiagnostics ?? EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS;

  return {
    sourceKind,
    analysisInputMode,
    pitchSource,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    requestedPitchSource: REQUESTED_PITCH_SOURCE,
    analysisEngine,
    fieldState,
    renderAuthority,
    workerState: "none",
    pitchFrameAge: null,
    workerStatus: null,
    fileActive: soundActive,
    micActive,
    lineFeedProgramActive,
    lineFeedProgramExcitation,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputEvidenceUnits: {
      ...(gateDiagnostics.evidenceUnits ?? EMPTY_LIVE_INPUT_EVIDENCE_UNITS),
    },
    liveInputEvidenceSupports: {
      ...(gateDiagnostics.evidenceSupports ?? EMPTY_LIVE_INPUT_EVIDENCE_UNITS),
    },
    liveInputSourceConfidence: gateDiagnostics.sourceConfidence ?? 0,
    liveInputConfidenceOpenThreshold:
      gateDiagnostics.confidenceOpenThreshold ?? 0,
    liveInputConfidenceCloseThreshold:
      gateDiagnostics.confidenceCloseThreshold ?? 0,
    liveInputHumPenalty: gateDiagnostics.humPenalty ?? 0,
    liveInputAmbientResonanceSupport:
      gateDiagnostics.ambientResonanceSupport ?? 0,
    liveInputBaselineRmsSpread: gateDiagnostics.baselineRmsSpread ?? 0,
    liveInputBaselinePeakSpread: gateDiagnostics.baselinePeakSpread ?? 0,
    liveInputBaselineCentroidSpread:
      gateDiagnostics.baselineCentroidSpread ?? 0,
    liveInputOpenFramesRequired: gateDiagnostics.openFrames ?? 0,
    liveInputReleaseFrames: gateDiagnostics.releaseFrames ?? 0,
    liveInputAnalysisClass,
    resolvedLiveInputAnalysisClass,
    liveInputAcousticIntent,
    liveInputPolicy,
    liveInputBaselineRms,
    liveInputBaselinePeak,
    sourceEvidence,
    analysisSourceUsed: resolveAnalysisSourceUsed(
      sourceKind,
      analysisInputMode,
    ),
    fundamentalFrequency: sourceCoupledState?.fundamental ?? 0,
    fundamentalConfidence: sourceCoupledState?.fundamentalConfidence ?? 0,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    uniqueModeCount:
      (sourceCoupledState?.uniqueModeCount ?? 0) +
      (resonantState?.uniqueModeCount ?? 0),
    spectralEffectiveBinCount:
      spectralEffectiveBinCount ??
      computeSpectralEffectiveBinCount(fftLinearAmplitudes),
    fftPeakAmplitude,
    modeSlotCount,
    sourceCoupledModeCount,
    resonantModeCount,
    transientEnergy,
    spectralCentroid,
    spectralSpread,
    spectralFlatness,
    spectralFlux,
    structureSignal,
    energySignal,
    modalCoefficientEnergy,
    retainedModalCoefficientEnergy,
    observationEnergy,
    modalVisibilityEnergy,
    modalVisibilityProjectedEnergy:
      resolvedModalVisibilitySummary.projectedModalEnergy ?? 0,
    modalVisibilitySlotEnergy:
      resolvedModalVisibilitySummary.averageProjectedSlotEnergy ?? 0,
    modalVisibilityPeakSlotEnergy:
      resolvedModalVisibilitySummary.peakProjectedSlotEnergy ?? 0,
    modalVisibilityUpperSlotEnergy:
      resolvedModalVisibilitySummary.upperProjectedSlotEnergy ?? 0,
    modalObserverVisibilityEnergy,
    modalVisibilityActiveModeCount: modeSlotCount,
    modalVisibilityDriveEnergy,
    changeSignal,
    changeBreakdown: changeBreakdown ? { ...changeBreakdown } : null,
    pulseSignal,
    beatDetected,
    beatPulseId,
    beatStrength,
    beatConfidence,
    hintSource: "none",
    analysisLatencyMs: 0,
    timbreSpread: clamp01(timbreSpread),
    spectralNovelty: clamp01(spectralNovelty),
    beatLowBandEnergy,
    beatOnsetDriver,
    beatThreshold,
    referencePitchBinAmplitude:
      referencePitchBinAmplitude ??
      (dominantFrequency
        ? sampleFFTAmplitudeForFrequency(
            dominantFrequency,
            fftLinearAmplitudes,
            sampleRate,
            fftSize,
          )
        : 0),
    driverFrequency: sourceCoupledState?.driverFrequency ?? dominantFrequency,
    driverLocked: sourceCoupledModeCount > 0,
    candidateFrequency: sourceCoupledState?.candidateFrequency ?? 0,
    candidateConfidence: sourceCoupledState?.candidateConfidence ?? 0,
    candidateFrames: sourceCoupledState?.candidateFrames ?? 0,
    periodicity: sourceCoupledState?.candidatePeriodicity ?? 0,
    candidateHarmonicSupport: sourceCoupledState?.candidateHarmonicSupport ?? 0,
    candidateDirectSupport: sourceCoupledState?.candidateDirectSupport ?? 0,
    candidateLowEnergy: sourceCoupledState?.candidateLowEnergy ?? false,
    voicingActive: sourceCoupledState?.voicingActive ?? false,
    highCandidateRejected: sourceCoupledState?.highCandidateRejected ?? false,
    rejectionReason: sourceCoupledState?.rejectionReason ?? "none",
    latchHoldFrames: sourceCoupledState?.latchHoldFrames ?? 0,
    latchLowSupportFrames: sourceCoupledState?.latchLowSupportFrames ?? 0,
    excitedModeCount: structuralMetrics?.excitedModeCount ?? 0,
    distributedExcitation: structuralMetrics?.distributedExcitation ?? 0,
    sourceCoupledModalEnergy: structuralMetrics?.sourceCoupledModalEnergy ?? 0,
    resonantModalEnergy: structuralMetrics?.resonantModalEnergy ?? 0,
    observedModalModeCount: structuralMetrics?.observedModalModeCount ?? 0,
    sourceCoupledObservedModeCount:
      structuralMetrics?.sourceCoupledObservedModeCount ?? 0,
    // Serialized debug compatibility boundary. Historical packet keys retain
    // `*ObservedEnergy`; the semantic core carries measurement confidence.
    sourceCoupledObservedEnergy:
      structuralMetrics?.sourceCoupledObservationConfidence ?? 0,
    sourceCoupledObservedDrive:
      structuralMetrics?.sourceCoupledObservedDrive ?? 0,
    sourceCoupledObservedSnr: structuralMetrics?.sourceCoupledObservedSnr ?? 0,
    sourceCoupledObservedCoherence:
      structuralMetrics?.sourceCoupledObservedCoherence ?? 0,
    resonantObservedModeCount:
      structuralMetrics?.resonantObservedModeCount ?? 0,
    resonantObservedEnergy:
      structuralMetrics?.resonantObservationConfidence ?? 0,
    resonantRingSupport: structuralMetrics?.resonantRingSupport ?? 0,
    resonantObservedDrive: structuralMetrics?.resonantObservedDrive ?? 0,
    resonantObservedSnr: structuralMetrics?.resonantObservedSnr ?? 0,
    resonantObservedCoherence:
      structuralMetrics?.resonantObservedCoherence ?? 0,
    resonantObservedNoiseFloor:
      structuralMetrics?.resonantObservedNoiseFloor ?? 0,
    resonantSparseEvidence: structuralMetrics?.resonantSparseEvidence ?? 0,
    resonantProjectionLoad: structuralMetrics?.resonantProjectionLoad ?? 0,
    modalPhaseAuthority,
    modalObservationCoherence,
    modalObservationConfidence,
    resonantPhaseAuthority: structuralMetrics?.resonantPhaseAuthority ?? 0,
    sourceCoupledPhaseAuthority:
      structuralMetrics?.sourceCoupledPhaseAuthority ?? 0,
    modalPhaseCoherentFieldModeCount:
      structuralMetrics?.modalPhaseCoherentFieldModeCount ?? 0,
    modalPersistence: structuralMetrics?.modalPersistence ?? 0,
    modalDriveEnergy: structuralMetrics?.modalDriveEnergy ?? 0,
    modalResponseEnergy,
    modalResponseRenderEnergy,
    modalResponseRenderRawEnergy,
    modalResponseCurrentRenderSourceEvidence,
    modalResponseInputEnergy: structuralMetrics?.modalResponseInputEnergy ?? 0,
    modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy,
    modalResponseModeCount: structuralMetrics?.modalResponseModeCount ?? 0,
    modalResponseBudgetScale: structuralMetrics?.modalResponseBudgetScale ?? 0,
    modalResponseRawEnergy: structuralMetrics?.modalResponseRawEnergy ?? 0,
    modalResponseAverageDampingEnvelope:
      structuralMetrics?.modalResponseAverageDampingEnvelope ?? 0,
    modalResponseAverageCouplingStrength:
      structuralMetrics?.modalResponseAverageCouplingStrength ?? 0,
    modalResponseAveragePhaseConfidence:
      structuralMetrics?.modalResponseAveragePhaseConfidence ?? 0,
    modalResponseAveragePersistence:
      structuralMetrics?.modalResponseAveragePersistence ?? 0,
    modalResponseBudgetScaleSourceCoupled:
      structuralMetrics?.modalResponseBudgetScaleSourceCoupled ?? 0,
    modalResponseBudgetScaleResonant:
      structuralMetrics?.modalResponseBudgetScaleResonant ?? 0,
    energyLedger,
    driveSource: structuralMetrics?.driveSource ?? "none",
    waterAcousticNonlinearityActive:
      structuralMetrics?.waterAcousticNonlinearityActive === true,
    waterAcousticGeneratedEnergyFraction:
      structuralMetrics?.waterAcousticGeneratedEnergyFraction ?? 0,
    waterAcousticIncidentPeakPressurePascal:
      structuralMetrics?.waterAcousticIncidentPeakPressurePascal ?? 0,
    waterAcousticFullScaleCharacteristicDistortion:
      structuralMetrics?.waterAcousticFullScaleCharacteristicDistortion ?? 0,
    projectionRawEnergySourceCoupled:
      structuralMetrics?.projectionRawEnergySourceCoupled ?? 0,
    projectionRawEnergyResonant:
      structuralMetrics?.projectionRawEnergyResonant ?? 0,
    projectionOverlapPressureSourceCoupled:
      structuralMetrics?.projectionOverlapPressureSourceCoupled ?? 0,
    projectionOverlapPressureResonant:
      structuralMetrics?.projectionOverlapPressureResonant ?? 0,
    projectionLoad: structuralMetrics?.projectionLoad ?? 0,
    projectionResonantProtection:
      structuralMetrics?.projectionResonantProtection ?? 0,
    sourceNormalization: sourceNormalization ?? {
      normalizedRms: 0,
      normalizedCentroid: 0,
    },
  };
}

export function buildZeroAudioFeatureDebugSnapshot({
  sourceKind,
  analysisInputMode,
  soundActive,
  micActive,
  referenceModeSlots,
  bandEnergies,
  candidateForcingSlots,
  candidateResponseSlots,
  modeSlots,
  sourceCoupledSpectralMoment,
  resonantSpectralMoment,
  structuralMetrics = null,
  auditSettings,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  const energyLedger = structuralMetrics?.energyLedger ?? null;
  const debug = buildDebugSummary({
    sourceKind,
    analysisInputMode,
    soundActive,
    micActive,
    sourceCoupledState: null,
    resonantState: null,
    fftLinearAmplitudes: null,
    candidateForcingSlots,
    candidateResponseSlots,
    modeSlots,
    structuralMetrics,
    energyLedger,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  });

  if (!shouldIncludeDetailedDebug(auditSettings)) {
    return debug;
  }

  return {
    ...debug,
    harmonicSupport: Array.from(new Float32Array(HARMONIC_ORDERS.length)),
    spectralCandidates: [],
    currentModeSlots: Array.from(modeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    modalFieldSlots: Array.from(modeSlots),
    modalFieldSpectralMomentSlots: Array.from(sourceCoupledSpectralMoment),
    candidateForcingSlots: Array.from(candidateForcingSlots),
    candidateResponseSlots: Array.from(candidateResponseSlots),
    sourceCoupledSpectralMoment: Array.from(sourceCoupledSpectralMoment),
    resonantSpectralMoment: Array.from(resonantSpectralMoment),
    bandEnergies: Array.from(bandEnergies),
    slotAmplitudeDeltas: Array.from(new Float32Array(MAX_STACK_SLOTS)),
  };
}

/**
 * @param {Parameters<typeof buildDebugSummary>[0] & {
 *   auditSettings?: { enabled?: boolean },
 *   spectralCandidates: Array<{ frequency: number, amplitude: number }>,
 *   sourceCoupledSpectralMoment: Float32Array | number[],
 *   resonantSpectralMoment: Float32Array | number[],
 *   referenceModeSlots: Float32Array | number[],
 *   bandEnergies: Float32Array | number[],
 * }} inputs
 */
export function buildAudioFeatureDebugSnapshot(inputs) {
  const debug = buildDebugSummary(inputs);

  if (!shouldIncludeDetailedDebug(inputs.auditSettings)) {
    return debug;
  }

  const { modeSlots, sourceCoupledState } = inputs;
  const slotAmplitudeDeltas = new Float32Array(
    Math.min(MAX_STACK_SLOTS, modeSlots.length / 4),
  );
  const slotLimit = Math.min(
    slotAmplitudeDeltas.length,
    modeSlots.length / 4,
    inputs.referenceModeSlots.length / 4,
  );
  for (let index = 0; index < slotLimit; index += 1) {
    slotAmplitudeDeltas[index] =
      modeSlots[index * 4 + 3] - inputs.referenceModeSlots[index * 4 + 3];
  }

  return {
    ...debug,
    harmonicSupport: Array.from(sourceCoupledState.harmonicSupport),
    spectralCandidates: inputs.spectralCandidates.map(
      ({ frequency, amplitude }) => ({
        frequency,
        amplitude,
      }),
    ),
    currentModeSlots: Array.from(modeSlots),
    referenceModeSlots: Array.from(inputs.referenceModeSlots),
    modalFieldSlots: Array.from(modeSlots),
    modalFieldSpectralMomentSlots: Array.from(
      inputs.sourceCoupledSpectralMoment,
    ),
    candidateForcingSlots: Array.from(inputs.candidateForcingSlots),
    candidateResponseSlots: Array.from(inputs.candidateResponseSlots),
    sourceCoupledSpectralMoment: Array.from(
      inputs.sourceCoupledSpectralMoment,
    ),
    resonantSpectralMoment: Array.from(inputs.resonantSpectralMoment),
    bandEnergies: Array.from(inputs.bandEnergies),
    slotAmplitudeDeltas: Array.from(slotAmplitudeDeltas),
  };
}
