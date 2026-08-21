import { buildModalExcitationStructuralState } from "./modalExcitation.js";
import {
  buildAudioFeatureStructuralFingerprint,
  materializeAudioFeatureProposalSnapshot,
  materializeAudioFeatureStructuralSnapshot,
} from "./audioFeatureStructuralProjection.js";
import { computeSpectralEffectiveBinCount } from "./spectralEvidence.js";
import {
  buildChromaVector,
  smoothChromaInPlace,
  detectKeyFromChroma,
} from "./chromaAnalysis.js";
import { pitchClassToHue } from "./pitch.js";
import {
  deriveAudioSourceNormalization,
  updateAudioFeatureBandSignals,
} from "./audioFeatureSignals.js";

const CHROMA_EMA_ALPHA = 0.1;
const CACHED_PROJECTION_BUFFER_KEYS = Object.freeze([
  "candidateForcingSlots",
  "candidateResponseSlots",
  "sourceCoupledPhaseSlots",
  "resonantPhaseSlots",
  "modeSlots",
  "referenceModeSlots",
  "sourceCoupledSpectralMoment",
  "resonantSpectralMoment",
  "modalFieldSpectralSeedDirection",
]);
const EMPTY_SPECTRAL_LAYER = Object.freeze({
  spectralMomentSlots: null,
});

function ensureAnalysisFftBuffer(preparedInputs) {
  const { analysisMemory, featureState, fftLinearAmplitudesSource } =
    preparedInputs;

  let fftLinearAmplitudes = analysisMemory.fftLinearAmplitudes;
  if (
    !fftLinearAmplitudes ||
    fftLinearAmplitudes.length !== fftLinearAmplitudesSource.length
  ) {
    fftLinearAmplitudes = new Float32Array(fftLinearAmplitudesSource.length);
    if (featureState?.analysis) {
      featureState.analysis.fftLinearAmplitudes = fftLinearAmplitudes;
    }
  }
  fftLinearAmplitudes.set(fftLinearAmplitudesSource);
  return fftLinearAmplitudes;
}

function getAudioPerfNow() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

export function updateAudioFeatureFastSignalState(preparedInputs) {
  const {
    analysisMemory,
    sampleRate,
    fftSize,
    analyserRms,
    currentFrameAtMs,
    beatSettings,
    analysisInputMode,
    bandState,
  } = preparedInputs;
  const fftLinearAmplitudes = ensureAnalysisFftBuffer(preparedInputs);
  const bandMetrics = updateAudioFeatureBandSignals({
    analysisMemory,
    fftLinearAmplitudes,
    sampleRate,
    fftSize,
    rms: analyserRms,
    currentFrameAtMs,
    beatSettings,
    suppressBeat: preparedInputs.liveInputNoiseGateActive === true,
  });
  const sourceNormalization = deriveAudioSourceNormalization({
    inputMode: analysisInputMode,
    analyserRms,
    spectralCentroid: bandMetrics.spectralCentroid,
    bandState,
  });

  return {
    fftLinearAmplitudes,
    spectralEffectiveBinCount: Number.isFinite(
      preparedInputs.spectralEffectiveBinCount,
    )
      ? preparedInputs.spectralEffectiveBinCount
      : computeSpectralEffectiveBinCount(fftLinearAmplitudes),
    sourceNormalization,
    ...bandMetrics,
  };
}

export function updateAudioFeatureStructuralState(
  preparedInputs,
  fastSignalState,
) {
  const structuralState = buildModalExcitationStructuralState({
    preparedInputs,
    fastSignalState,
    existingState: preparedInputs.modalExcitationState,
    performanceNow: getAudioPerfNow,
  });
  structuralState.structuralFingerprint =
    buildAudioFeatureStructuralFingerprint({
      preparedInputs,
      structuralState,
      activeSourceCoupledModeCount:
        structuralState.activeSourceCoupledModeCount,
      activeResonantModeCount: structuralState.activeResonantModeCount,
      activeModeCount: structuralState.activeModeCount,
    });
  return structuralState;
}

export function updateAudioFeatureChromaState(preparedInputs, fastSignalState) {
  const chromaState = preparedInputs.featureState.analysis.chromaState;
  const rawChroma = buildChromaVector(
    fastSignalState.fftLinearAmplitudes,
    preparedInputs.sampleRate,
    preparedInputs.fftSize,
  );
  smoothChromaInPlace(chromaState.smoothedChroma, rawChroma, CHROMA_EMA_ALPHA);
  const keyResult = detectKeyFromChroma(chromaState.smoothedChroma);
  chromaState.keyTonic = keyResult.tonic;
  chromaState.keyMode = keyResult.mode;
  chromaState.keyConfidence = keyResult.confidence;
  chromaState.keyTonicHue = pitchClassToHue(keyResult.tonic);

  return {
    keyTonic: chromaState.keyTonic,
    keyMode: chromaState.keyMode,
    keyConfidence: chromaState.keyConfidence,
    keyTonicHue: chromaState.keyTonicHue,
  };
}

function readStructuralPerf(structuralPerf) {
  const perf = structuralPerf ?? {};

  return {
    peakScanMs: perf.peakScanMs ?? 0,
    modalResolveMs: perf.modalResolveMs ?? 0,
    projectionMs: perf.projectionMs ?? 0,
  };
}

function readCachedProjection(preparedInputs, previousAnalysisResult) {
  const cached = previousAnalysisResult ?? {};
  const projection = {};

  for (const key of CACHED_PROJECTION_BUFFER_KEYS) {
    projection[key] = cached[key] ?? preparedInputs[key];
  }

  return {
    ...projection,
    signalModeSlots:
      cached.signalModeSlots ??
      cached.modeSlots ??
      preparedInputs.signalModeSlots,
    signalReferenceModeSlots:
      cached.signalReferenceModeSlots ??
      cached.referenceModeSlots ??
      preparedInputs.signalReferenceModeSlots,
  };
}

function readPreviousStructuralState(
  preparedInputs,
  previousAnalysisResult,
  previousStructuralState,
) {
  const cached = previousAnalysisResult ?? {};

  return {
    ...previousStructuralState,
    ...readCachedProjection(preparedInputs, cached),
    structuralFingerprint:
      previousStructuralState.structuralFingerprint ??
      cached.structuralFingerprint ??
      null,
    structuralPerf: readStructuralPerf(previousStructuralState.structuralPerf),
    structuralMetrics: previousStructuralState.structuralMetrics ?? null,
  };
}

function buildInitialStructuralState(preparedInputs) {
  const { sourceCoupledState, resonantState } = preparedInputs;
  const sourceCoupledSpectral = sourceCoupledState ?? EMPTY_SPECTRAL_LAYER;
  const resonantSpectral = resonantState ?? EMPTY_SPECTRAL_LAYER;

  return {
    candidateForcingSlotsSource: sourceCoupledState.slots,
    candidateResponseSlotsSource: resonantState.slots,
    sourceCoupledPhaseSlotsSource: preparedInputs.sourceCoupledPhaseSlots,
    resonantPhaseSlotsSource: preparedInputs.resonantPhaseSlots,
    referenceSourceCoupledSlotsSource: sourceCoupledState.referenceSlots,
    referenceResonantSlotsSource: resonantState.referenceSlots,
    sourceCoupledSpectralMomentSource:
      sourceCoupledSpectral.spectralMomentSlots,
    resonantSpectralMomentSource: resonantSpectral.spectralMomentSlots,
    modalFieldSpectralSeedDirection:
      preparedInputs.modalFieldSpectralSeedDirection,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    candidateForcingSlots: preparedInputs.candidateForcingSlots,
    candidateResponseSlots: preparedInputs.candidateResponseSlots,
    sourceCoupledPhaseSlots: preparedInputs.sourceCoupledPhaseSlots,
    resonantPhaseSlots: preparedInputs.resonantPhaseSlots,
    modeSlots: preparedInputs.modeSlots,
    signalModeSlots: preparedInputs.signalModeSlots,
    referenceModeSlots: preparedInputs.referenceModeSlots,
    signalReferenceModeSlots: preparedInputs.signalReferenceModeSlots,
    sourceCoupledSpectralMoment: preparedInputs.sourceCoupledSpectralMoment,
    resonantSpectralMoment: preparedInputs.resonantSpectralMoment,
    activeSourceCoupledModeCount: 0,
    activeResonantModeCount: 0,
    activeModeCount: 0,
    dominantFrequency: 0,
    dominantAmplitude: 0,
    analysisEngine:
      sourceCoupledState.analysisEngine !== "none"
        ? sourceCoupledState.analysisEngine
        : resonantState.analysisEngine,
    pitchSource: "none",
    spectralCandidates: [],
    usedDecay: false,
    sourceMode: preparedInputs.sourceMode,
    sourceCoupledStateSource: sourceCoupledState,
    resonantStateSource: resonantState,
    structuralFingerprint: null,
    structuralPerf: readStructuralPerf(),
    structuralMetrics: null,
  };
}

function readCurrentStructuralState(
  preparedInputs,
  previousAnalysisResult = null,
  structuralState = null,
) {
  const previousStructuralState =
    structuralState ?? previousAnalysisResult?.structuralState ?? null;

  return previousStructuralState
    ? readPreviousStructuralState(
        preparedInputs,
        previousAnalysisResult,
        previousStructuralState,
      )
    : buildInitialStructuralState(preparedInputs);
}

function materializeCurrentStructuralState({
  preparedInputs,
  currentStructural,
  materializeStructuralProjection,
  materializeSignalProjection,
}) {
  const shouldMaterializeSignalProjection =
    materializeStructuralProjection || materializeSignalProjection;
  const signalProjection = shouldMaterializeSignalProjection
    ? materializeAudioFeatureProposalSnapshot(preparedInputs, currentStructural)
    : null;

  if (!materializeStructuralProjection) {
    return signalProjection
      ? { ...currentStructural, ...signalProjection }
      : currentStructural;
  }

  const projectionStartedAt = getAudioPerfNow();
  const structuralProjection = materializeAudioFeatureStructuralSnapshot(
    preparedInputs,
    currentStructural,
  );

  return {
    ...currentStructural,
    ...structuralProjection,
    ...(signalProjection ?? {}),
    structuralPerf: {
      ...readStructuralPerf(currentStructural.structuralPerf),
      projectionMs: getAudioPerfNow() - projectionStartedAt,
    },
  };
}

function readCurrentChromaState(preparedInputs, chromaState) {
  return (
    chromaState ?? {
      keyTonic: preparedInputs.featureState.analysis.chromaState.keyTonic,
      keyMode: preparedInputs.featureState.analysis.chromaState.keyMode,
      keyConfidence:
        preparedInputs.featureState.analysis.chromaState.keyConfidence,
      keyTonicHue: preparedInputs.featureState.analysis.chromaState.keyTonicHue,
    }
  );
}

function readCurrentTempoState(preparedInputs, tempoState) {
  return (
    tempoState ?? {
      estimatedTempo: preparedInputs.bandState.estimatedTempo,
      tempoConfidence: preparedInputs.bandState.tempoConfidence,
      beatPhase: preparedInputs.bandState.beatPhase,
      rhythmicDensity: preparedInputs.bandState.onsetDensityEma,
    }
  );
}

export function buildCurrentAudioFeatureAnalysisResult({
  preparedInputs,
  previousAnalysisResult = null,
  fastSignalState,
  structuralState = null,
  chromaState = null,
  tempoState = null,
  materializeStructuralProjection = true,
  materializeSignalProjection = true,
}) {
  const currentStructural = readCurrentStructuralState(
    preparedInputs,
    previousAnalysisResult,
    structuralState,
  );
  const resolvedStructural = materializeCurrentStructuralState({
    preparedInputs,
    currentStructural,
    materializeStructuralProjection,
    materializeSignalProjection,
  });
  const currentChroma = readCurrentChromaState(preparedInputs, chromaState);
  const currentTempo = readCurrentTempoState(preparedInputs, tempoState);
  const resolvedSourceCoupledState =
    resolvedStructural.sourceCoupledStateSource ??
    preparedInputs.sourceCoupledState;
  const resolvedResonantState =
    resolvedStructural.resonantStateSource ?? preparedInputs.resonantState;
  const resolvedUsedDecay = resolvedStructural.usedDecay;
  const spectralEffectiveBinCount =
    fastSignalState.spectralEffectiveBinCount ??
    computeSpectralEffectiveBinCount(fastSignalState.fftLinearAmplitudes);
  const structuralMetrics = resolvedStructural.structuralMetrics ?? null;
  const structuralPerf = readStructuralPerf(resolvedStructural.structuralPerf);

  return {
    preparedInputs,
    soundActive: preparedInputs.soundActive,
    micActive: preparedInputs.micActive,
    fftLinearAmplitudes: fastSignalState.fftLinearAmplitudes,
    spectralEffectiveBinCount,
    candidateForcingSlots: resolvedStructural.candidateForcingSlots,
    candidateResponseSlots: resolvedStructural.candidateResponseSlots,
    sourceCoupledPhaseSlots: resolvedStructural.sourceCoupledPhaseSlots,
    resonantPhaseSlots: resolvedStructural.resonantPhaseSlots,
    activeSourceCoupledModeCount:
      resolvedStructural.activeSourceCoupledModeCount,
    activeResonantModeCount: resolvedStructural.activeResonantModeCount,
    sourceCoupledSpectralMoment:
      resolvedStructural.sourceCoupledSpectralMoment,
    resonantSpectralMoment: resolvedStructural.resonantSpectralMoment,
    modalFieldSpectralSeedDirection:
      resolvedStructural.modalFieldSpectralSeedDirection,
    bandEnergies: fastSignalState.bandEnergies,
    spectralBandEnergies: fastSignalState.spectralBandEnergies,
    trebleBroadbandEnergy: fastSignalState.trebleBroadbandEnergy,
    trebleTonalEnergy: fastSignalState.trebleTonalEnergy,
    transientEnergy: fastSignalState.transientEnergy,
    spectralCentroid: fastSignalState.spectralCentroid,
    spectralSpread: fastSignalState.spectralSpread,
    spectralFlatness: fastSignalState.spectralFlatness,
    spectralFlux: fastSignalState.spectralFlux,
    beatDetected: fastSignalState.beatDetected,
    beatPulseId: fastSignalState.beatPulseId,
    beatStrength: fastSignalState.beatStrength,
    beatConfidence: fastSignalState.beatConfidence,
    estimatedTempo: currentTempo.estimatedTempo,
    tempoConfidence: currentTempo.tempoConfidence,
    beatPhase: currentTempo.beatPhase,
    rhythmicDensity: currentTempo.rhythmicDensity,
    keyTonic: currentChroma.keyTonic,
    keyMode: currentChroma.keyMode,
    keyConfidence: currentChroma.keyConfidence,
    keyTonicHue: currentChroma.keyTonicHue,
    modeSlots: resolvedStructural.modeSlots,
    signalModeSlots: resolvedStructural.signalModeSlots,
    referenceModeSlots: resolvedStructural.referenceModeSlots,
    signalReferenceModeSlots: resolvedStructural.signalReferenceModeSlots,
    sourceMode: resolvedStructural.sourceMode,
    sourceEvidence: preparedInputs.sourceEvidence,
    sourceCoupledState: resolvedSourceCoupledState,
    resonantState: resolvedResonantState,
    bandState: preparedInputs.bandState,
    avgAmplitude: preparedInputs.avgAmplitude,
    analyserRms: preparedInputs.analyserRms,
    dominantFrequency: resolvedStructural.dominantFrequency,
    dominantAmplitude: resolvedStructural.dominantAmplitude,
    analysisEngine: resolvedStructural.analysisEngine,
    pitchSource: resolvedStructural.pitchSource,
    spectralCandidates: resolvedStructural.spectralCandidates,
    usedDecay: resolvedUsedDecay,
    sourceNormalization: fastSignalState.sourceNormalization,
    liveInputNoiseGateActive: preparedInputs.liveInputNoiseGateActive,
    liveInputHardSilenceActive: preparedInputs.liveInputHardSilenceActive,
    liveInputCalibrationInvalid: preparedInputs.liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason:
      preparedInputs.liveInputCalibrationInvalidReason,
    liveInputGateDiagnostics: preparedInputs.liveInputGateDiagnostics,
    liveInputCalibrationActive: Boolean(
      preparedInputs.bandState.liveInputCalibrationActive,
    ),
    beatLowBandEnergy: fastSignalState.beatLowBandEnergy,
    beatOnsetDriver: fastSignalState.beatOnsetDriver,
    beatThreshold: fastSignalState.beatThreshold,
    fftPeakAmplitude: preparedInputs.fftPeakAmplitude,
    activeModeCount: resolvedStructural.activeModeCount,
    structuralFingerprint: resolvedStructural.structuralFingerprint,
    structuralMetrics,
    structuralState: {
      ...currentStructural,
    },
    structuralPerf,
  };
}
