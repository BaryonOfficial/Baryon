import {
  AUDIT_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  BEAT_DEFAULTS,
} from "../../defaults.js";
import { createModalFieldContinuityState } from "../../core/modalFieldContinuity.js";
import { createBlendableLayerState } from "./blendState.js";
import { createModalExcitationState } from "./modalExcitationState.js";
import { SPECTRAL_MODAL_POLICY } from "./policy.js";
import { BAND_BUCKET_COUNT } from "./signalSpectrumMetrics.js";
import { BEAT_HISTORY_SIZE } from "./tempoTracking.js";

const MODAL_SLOT_STRIDE = 4;
const MODAL_HARMONIC_SUPPORT_COUNT =
  SPECTRAL_MODAL_POLICY.harmonicOrders.length;

function createModalSlotArray(capacity) {
  return new Float32Array(capacity * MODAL_SLOT_STRIDE);
}

function createModalTargetBuild(capacity) {
  return {
    slots: createModalSlotArray(capacity),
    referenceSlots: createModalSlotArray(capacity),
    spectralMomentSlots: createModalSlotArray(capacity),
    harmonicSupport: new Float32Array(MODAL_HARMONIC_SUPPORT_COUNT),
    uniqueModeCount: 0,
    peaks: [],
    components: [],
    _mergeScratch: new Map(),
  };
}

function createModalLayerState(capacity) {
  return {
    ...createBlendableLayerState(capacity),
    harmonicSupport: new Float32Array(MODAL_HARMONIC_SUPPORT_COUNT),
    fundamental: 0,
    fundamentalConfidence: 0,
    analysisEngine: "none",
    uniqueModeCount: 0,
    lastStableAt: 0,
    latchedFundamentalHz: 0,
    latchedFundamentalConfidence: 0,
    latchHoldFrames: 0,
    latchLowSupportFrames: 0,
    driverFrequency: 0,
    candidateFrequency: 0,
    candidateConfidence: 0,
    candidateFrames: 0,
    candidatePeriodicity: 0,
    candidateHarmonicSupport: 0,
    candidateDirectSupport: 0,
    candidateLowEnergy: false,
    voicingActive: false,
    highCandidateRejected: false,
    rejectionReason: "none",
    slotAgeFrames: new Uint16Array(capacity),
    slotConfidence: new Float32Array(capacity),
    slotDisagreementCounts: new Uint8Array(capacity),
    slotLastConfirmedFrames: new Uint32Array(capacity),
    _slotMetricMap: new Map(),
  };
}

function createBandState() {
  return {
    bandEnergies: new Float32Array(BAND_BUCKET_COUNT),
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    previousRms: 0,
    lowBandEnergy: 0,
    lowBandEnergyEma: 0,
    previousLowBandEnergy: 0,
    onsetDriver: 0,
    onsetThresholdEma: 0,
    previousBeatAtMs: Number.NEGATIVE_INFINITY,
    previousFrameAtMs: 0,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    beatTimestamps: new Float64Array(BEAT_HISTORY_SIZE),
    beatTimestampWriteIdx: 0,
    beatTimestampCount: 0,
    estimatedTempo: 0,
    tempoEma: 0,
    tempoConfidence: 0,
    beatPhase: 0,
    onsetDensityEma: 0,
    beatSensitivity: BEAT_DEFAULTS.beatSensitivity,
    liveInputMode: "idle",
    liveInputPolicy: "ambient",
    liveInputGateState: "closed",
    liveInputCalibrationActive: false,
    liveInputCalibrationStartedAtMs: Number.NEGATIVE_INFINITY,
    liveInputCalibrationVersion: 0,
    liveInputCalibrationInvalid: false,
    liveInputCalibrationInvalidReason: "none",
    liveInputPreviousFrameAtMs: 0,
    liveInputBaselineRms: 0,
    liveInputBaselinePeak: 0,
    liveInputBaselineCentroid: 0,
    liveInputOpenFrames: 0,
    liveInputQuietFrames: 0,
  };
}

function createChromaState() {
  return {
    smoothedChroma: new Float32Array(12),
    keyTonic: 0,
    keyMode: "major",
    keyConfidence: 0,
    keyTonicHue: 0,
  };
}

function createAnalysisMemory(capacity) {
  return {
    frameId: 0,
    candidateForcingSlots: createModalSlotArray(capacity),
    candidateResponseSlots: createModalSlotArray(capacity),
    sourceCoupledPhaseSlots: createModalSlotArray(capacity),
    resonantPhaseSlots: createModalSlotArray(capacity),
    modeSlots: createModalSlotArray(capacity),
    signalModeSlots: createModalSlotArray(capacity),
    sourceCoupledSpectralMoment: createModalSlotArray(capacity),
    resonantSpectralMoment: createModalSlotArray(capacity),
    modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
    referenceSourceCoupledSlots: createModalSlotArray(capacity),
    referenceResonantSlots: createModalSlotArray(capacity),
    referenceModeSlots: createModalSlotArray(capacity),
    signalReferenceModeSlots: createModalSlotArray(capacity),
    bandEnergies: new Float32Array(BAND_BUCKET_COUNT),
    fftLinearAmplitudes: new Float32Array(0),
    sourceCoupledState: createModalLayerState(capacity),
    resonantState: createModalLayerState(capacity),
    bandState: createBandState(),
    chromaState: createChromaState(),
    previousSpectrum: new Float32Array(0),
    zeroSourceCoupledTargetSlots: createModalSlotArray(capacity),
    zeroResonantTargetSlots: createModalSlotArray(capacity),
    nonAcousticSourceCoupledTarget: createModalTargetBuild(capacity),
    nonAcousticResonantTarget: createModalTargetBuild(capacity),
    nonAcousticPeakDriverScratch: createModalTargetBuild(capacity),
    acousticSourceCoupledTarget: createModalTargetBuild(capacity),
    acousticResonantTarget: createModalTargetBuild(capacity),
    modalExcitationState: createModalExcitationState(capacity),
    modalFieldContinuityState: createModalFieldContinuityState(),
    modalDescriptorAuthorityState: {
      previousFieldAuthority: null,
    },
  };
}

function createAuditState(capacity) {
  return {
    frame: 0,
    frozenProjectionCaptured: false,
    frozenSourceCoupledSlots: createModalSlotArray(capacity),
    frozenResonantSlots: createModalSlotArray(capacity),
    frozenSourceCoupledPhaseSlots: createModalSlotArray(capacity),
    frozenResonantPhaseSlots: createModalSlotArray(capacity),
    frozenReferenceSourceCoupledSlots: createModalSlotArray(capacity),
    frozenReferenceResonantSlots: createModalSlotArray(capacity),
    frozenModeSlots: createModalSlotArray(capacity),
    frozenSourceCoupledSpectralMoment: createModalSlotArray(capacity),
    frozenResonantSpectralMoment: createModalSlotArray(capacity),
    frozenModalFieldSpectralSeedDirection: new Float32Array([1, 0]),
    lastSnapshot: null,
    settings: { ...AUDIT_DEFAULTS },
  };
}

export function createAudioFeatureState(capacity = AUDIO_SLOT_CAPACITY) {
  return {
    capacity,
    analysis: createAnalysisMemory(capacity),
    audit: createAuditState(capacity),
    frameId: 0,
  };
}
