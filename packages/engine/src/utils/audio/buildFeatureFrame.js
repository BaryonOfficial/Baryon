import { EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS } from "./liveInputNoiseGate.js";
import { projectAudioFeatureModalField } from "./audioFeatureModalProjection.js";
import { DEFAULT_LIVE_INPUT_ANALYSIS_CLASS } from "../../core/audio/liveInputAnalysis.js";
import { buildAudioFeatureDebugSnapshot } from "./audioFeatureDebug.js";
import { composeAudioFeatureFrameSignals } from "./audioFeatureFrameSignals.js";

export function composeAudioFeatureFrame({
  preparedInputs,
  analysisResult,
  compositionState = null,
  topologyFrame = null,
  topologyOnly = false,
}) {
  const sourceCoupledState =
    analysisResult.sourceCoupledStateSummary ??
    analysisResult.sourceCoupledState;
  const resonantState =
    analysisResult.resonantStateSummary ?? analysisResult.resonantState;
  const modalProjection = projectAudioFeatureModalField({
    preparedInputs,
    analysisResult,
    topologyFrame,
    topologyOnly,
  });
  if (topologyOnly) {
    return modalProjection.topologyFrame;
  }

  const {
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown,
    pulseSignal,
    modeCoherence,
    timbreSpread,
    spectralNovelty,
    bassSalience,
    modalVisibilitySummary,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
  } = composeAudioFeatureFrameSignals({
    preparedInputs,
    analysisResult,
    modalProjection,
    sourceCoupledState,
    resonantState,
    compositionState,
  });

  const {
    fieldState,
    hasModalField,
    renderAuthority,
    energyLedger,
    sourceEvidence,
    projectedModalRenderEnergy,
    retainedModalCoefficientEnergy,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy,
    observationEnergy,
    modalPhaseAuthority,
    modalPhaseAnchorAngularVelocityRadPerSec,
    modalObservationCoherence,
    modalObservationConfidence,
    modalFieldContinuityDiagnostics,
    modalDescriptor,
    sourceMode,
  } = modalProjection;
  const {
    candidateForcingSlots: renderSourceCoupledSlots,
    candidateResponseSlots: renderResonantSlots,
    sourceCoupledSpectralMoment: renderSourceCoupledSpectralMoment,
    resonantSpectralMoment: renderResonantSpectralMoment,
    modeSlots: renderModeSlots,
    referenceModeSlots: renderReferenceModeSlots,
    bandEnergies: renderBandEnergies,
  } = modalProjection.renderSources;
  const lineFeedProgramActive = preparedInputs.lineFeedProgramActive === true;
  const modalResponseRenderRawEnergy = renderAuthority
    ? (analysisResult.structuralMetrics?.modalResponseRenderRawEnergy ??
      projectedModalRenderEnergy)
    : 0;
  const modalResponseCurrentRenderSourceEvidence = Boolean(
    analysisResult.structuralMetrics?.modalResponseCurrentRenderSourceEvidence,
  );
  const debug = buildAudioFeatureDebugSnapshot({
    auditSettings: preparedInputs.resolvedAuditSettings,
    sourceKind: preparedInputs.sourceKind,
    analysisInputMode: preparedInputs.analysisInputMode,
    sourceEvidence: analysisResult.sourceEvidence,
    pitchSource: analysisResult.pitchSource,
    analysisEngine: analysisResult.analysisEngine,
    fieldState,
    renderAuthority,
    soundActive: analysisResult.soundActive,
    micActive: analysisResult.micActive,
    lineFeedProgramActive,
    lineFeedProgramExcitation: preparedInputs.lineFeedProgramExcitation ?? 0,
    liveInputNoiseGateActive: analysisResult.liveInputNoiseGateActive,
    liveInputHardSilenceActive: analysisResult.liveInputHardSilenceActive,
    liveInputCalibrationActive: analysisResult.liveInputCalibrationActive,
    liveInputCalibrationInvalid: analysisResult.liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason:
      analysisResult.liveInputCalibrationInvalidReason,
    liveInputGateDiagnostics:
      analysisResult.liveInputGateDiagnostics ??
      EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
    liveInputAnalysisClass:
      preparedInputs.status?.liveInputAnalysisClass ??
      DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
    resolvedLiveInputAnalysisClass:
      preparedInputs.resolvedLiveInputAnalysisClass,
    liveInputAcousticIntent:
      analysisResult.liveInputAcousticIntent ??
      analysisResult.bandState?.liveInputPolicy ??
      null,
    liveInputPolicy:
      analysisResult.liveInputPolicy ??
      analysisResult.bandState?.liveInputPolicy ??
      null,
    liveInputBaselineRms:
      analysisResult.liveInputBaselineRms ??
      analysisResult.bandState?.liveInputBaselineRms ??
      0,
    liveInputBaselinePeak:
      analysisResult.liveInputBaselinePeak ??
      analysisResult.bandState?.liveInputBaselinePeak ??
      0,
    sourceCoupledState,
    resonantState,
    dominantFrequency: analysisResult.dominantFrequency,
    dominantAmplitude: analysisResult.dominantAmplitude,
    avgAmplitude: analysisResult.avgAmplitude,
    analyserRms: analysisResult.analyserRms,
    spectralCandidates: analysisResult.spectralCandidates ?? [],
    fftLinearAmplitudes: analysisResult.fftLinearAmplitudes ?? null,
    spectralEffectiveBinCount: analysisResult.spectralEffectiveBinCount ?? null,
    candidateForcingSlots: renderSourceCoupledSlots,
    candidateResponseSlots: renderResonantSlots,
    sourceCoupledSpectralMoment: renderSourceCoupledSpectralMoment,
    resonantSpectralMoment: renderResonantSpectralMoment,
    modeSlots: renderModeSlots,
    referenceModeSlots: renderReferenceModeSlots,
    bandEnergies: renderBandEnergies,
    transientEnergy: analysisResult.transientEnergy,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralSpread: analysisResult.spectralSpread,
    spectralFlatness: analysisResult.spectralFlatness,
    spectralFlux: analysisResult.spectralFlux,
    structureSignal,
    energySignal,
    modalCoefficientEnergy: projectedModalRenderEnergy,
    retainedModalCoefficientEnergy,
    observationEnergy,
    modalVisibilityEnergy,
    modalVisibilitySummary,
    modalPhaseAuthority,
    modalObservationCoherence,
    modalObservationConfidence,
    modalResponseEnergy,
    modalResponseRenderEnergy: energyLedger.projectedRenderEnergy,
    modalResponseRenderRawEnergy,
    modalResponseCurrentRenderSourceEvidence,
    modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy,
    energyLedger,
    timbreSpread,
    spectralNovelty,
    changeSignal,
    changeBreakdown,
    pulseSignal,
    beatDetected: analysisResult.beatDetected,
    beatPulseId: analysisResult.beatPulseId,
    beatStrength: analysisResult.beatStrength,
    beatConfidence: analysisResult.beatConfidence,
    beatLowBandEnergy: analysisResult.beatLowBandEnergy,
    beatOnsetDriver: analysisResult.beatOnsetDriver,
    beatThreshold: analysisResult.beatThreshold,
    sampleRate: preparedInputs.sampleRate,
    fftSize: preparedInputs.fftSize,
    structuralMetrics: analysisResult.structuralMetrics,
    fftPeakAmplitude: analysisResult.fftPeakAmplitude,
    referencePitchBinAmplitude:
      analysisResult.referencePitchBinAmplitude ?? null,
    sourceNormalization: analysisResult.sourceNormalization,
    requestedCavityGeometry: preparedInputs.requestedCavityGeometry,
    effectiveCavityGeometry: preparedInputs.effectiveCavityGeometry,
  });

  if (preparedInputs.auditState) {
    preparedInputs.auditState.frame += 1;
    preparedInputs.auditState.lastSnapshot = debug;
  }

  return {
    fieldState,
    hasModalField,
    renderAuthority,
    diagnosticControlState: {
      auditEnabled: preparedInputs.resolvedAuditSettings.enabled === true,
      freezeModeSlots:
        preparedInputs.resolvedAuditSettings.freezeModeSlots === true,
      injectTestTone:
        preparedInputs.resolvedAuditSettings.injectTestTone === true,
      suppressPlaybackTelemetry:
        preparedInputs.resolvedAuditSettings.suppressPlaybackTelemetry === true,
    },
    energyLedger,
    projectedRenderEnergy: energyLedger.projectedRenderEnergy,
    sourceEvidence,
    isLiveInputActive: preparedInputs.status?.isLiveInputActive === true,
    soundActive: analysisResult.soundActive,
    micActive: analysisResult.micActive,
    averageAmplitude: analysisResult.avgAmplitude,
    fftLinearAmplitudes: analysisResult.fftLinearAmplitudes,
    activeModeCount: modalDescriptor.counts.modalFieldModeCount,
    activeModalFieldModeCount: modalDescriptor.counts.modalFieldModeCount,
    modalFieldContinuity: modalFieldContinuityDiagnostics,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalPhaseAnchorAngularVelocityRadPerSec,
    modalFieldSpectralMomentSlots:
      modalDescriptor.slotViews.modalFieldSpectralMomentSlots,
    modalFieldSpectralSeedDirection:
      analysisResult.modalFieldSpectralSeedDirection,
    modalFieldMetadataSlots: modalDescriptor.slotViews.modalFieldMetadataSlots,
    bandEnergies: renderBandEnergies,
    spectralBandEnergies: analysisResult.spectralBandEnergies,
    trebleBroadbandEnergy: analysisResult.trebleBroadbandEnergy,
    trebleTonalEnergy: analysisResult.trebleTonalEnergy,
    transientEnergy: analysisResult.transientEnergy,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralSpread: analysisResult.spectralSpread,
    spectralFlatness: analysisResult.spectralFlatness,
    spectralFlux: analysisResult.spectralFlux,
    structureSignal,
    energySignal,
    modalCoefficientEnergy: projectedModalRenderEnergy,
    retainedModalCoefficientEnergy,
    modalResponseEnergy,
    modalResponseBudgetScale:
      analysisResult.structuralMetrics?.modalResponseBudgetScale ?? 0,
    modalResponseRawEnergy:
      analysisResult.structuralMetrics?.modalResponseRawEnergy ?? 0,
    modalResponseAverageDampingEnvelope:
      analysisResult.structuralMetrics?.modalResponseAverageDampingEnvelope ??
      0,
    modalResponseAverageCouplingStrength:
      analysisResult.structuralMetrics?.modalResponseAverageCouplingStrength ??
      0,
    modalResponseAveragePhaseConfidence:
      analysisResult.structuralMetrics?.modalResponseAveragePhaseConfidence ??
      0,
    modalResponseAveragePersistence:
      analysisResult.structuralMetrics?.modalResponseAveragePersistence ?? 0,
    modalResponseRenderEnergy: energyLedger.projectedRenderEnergy,
    modalResponseRenderSourceCoupledEnergy: modalResponseSourceCoupledEnergy,
    modalResponseRenderResonantEnergy: modalResponseResonantEnergy,
    modalResponseRenderRawEnergy,
    modalResponseCurrentRenderSourceEvidence,
    observationEnergy,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalPhaseAuthority,
    modalObservationCoherence,
    modalObservationConfidence,
    changeSignal,
    changeBreakdown: changeBreakdown ? { ...changeBreakdown } : null,
    pulseSignal,
    modeCoherence,
    beatDetected: analysisResult.beatDetected,
    beatPulseId: analysisResult.beatPulseId,
    beatStrength: analysisResult.beatStrength,
    beatConfidence: analysisResult.beatConfidence,
    estimatedTempo: analysisResult.estimatedTempo,
    tempoConfidence: analysisResult.tempoConfidence,
    beatPhase: analysisResult.beatPhase,
    rhythmicDensity: analysisResult.rhythmicDensity,
    keyTonic: analysisResult.keyTonic,
    keyMode: analysisResult.keyMode,
    keyConfidence: analysisResult.keyConfidence,
    keyTonicHue: analysisResult.keyTonicHue,
    bassSalience,
    timbreSpread,
    spectralNovelty,
    referenceModeSlots: renderReferenceModeSlots,
    sourceMode,
    debug,
    audit: preparedInputs.resolvedAuditSettings,
  };
}
