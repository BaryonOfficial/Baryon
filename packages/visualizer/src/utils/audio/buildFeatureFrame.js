import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  BEAT_DEFAULTS,
  CAVITY_ACOUSTIC_DEFAULTS,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
  SIMULATION_DEFAULTS,
} from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
  resolveEffectiveCavityGeometry,
} from "../../core/cavityGeometry.js";
import {
  getCavityModeFrequency,
  sampleFFTAmplitudeForFrequency,
} from "../cavityModes.js";
import { binIndexToFrequencyHz, frequencyToBinIndex } from "./binFrequency.js";
import {
  MAX_STACK_SLOTS,
  BAND_BUCKET_COUNT,
  clearModalStack,
  combineModalLayers,
  copyFloatArray,
  countActiveSlots,
  createAudioFeatureState,
  createModalTargetBuild,
} from "./modalStack.js";
import { buildModalExcitationStructuralState } from "./modalExcitation.js";
import {
  resetLineFeedProgramActivityState,
  resolveLineFeedProgramActivity,
} from "./lineFeedProgramActivity.js";
import { createModalExcitationState } from "./modalExcitationState.js";
import {
  findSpectralPeakFrequencies,
  HARMONIC_ORDERS,
} from "./modalResolvers.js";
import { deriveFieldState } from "./fieldState.js";
import { AUDIO_ANALYSIS_POLICY, SPECTRAL_MODAL_POLICY } from "./policy.js";
import { FIELD_STATES } from "./types.js";
import {
  buildChromaVector,
  smoothChromaInPlace,
  detectKeyFromChroma,
} from "./chromaAnalysis.js";
import { pitchClassToHue } from "./pitch.js";
import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  LIVE_INPUT_ACOUSTIC_INTENTS,
  LIVE_INPUT_ANALYSIS_CLASSES,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisClass,
  normalizeResolvedLiveInputAnalysisClass,
} from "../../core/audio/liveInputAnalysis.js";
import {
  isAcousticLiveInputDeviceKind,
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "../../core/audio/inputDeviceSemantics.js";
import { buildCanonicalFullModalDescriptor } from "../../core/modalDescriptor.js";
import { MODAL_BASIS_ATLAS_PAGE_CAPACITY } from "../../core/modalBudgets.js";
import {
  countNonZeroFftBins,
  deriveHighQSparseResonatorAuthority,
} from "./highQSparseResonatorAuthority.js";
import {
  buildModalEnergyLedger,
  hasProjectedRenderAuthority,
} from "./modalEnergyLedger.js";
import {
  buildAudioSourceEvidenceFrame,
  collectAudioSourceEvidenceInputs,
  resolveAudioRenderBoundary,
} from "./audioSourceEvidence.js";

/** @typedef {import("../../core/cavityGeometry.js").CavityGeometry} CavityGeometry */

const {
  liveInputSilenceAvgAmplitude: LIVE_INPUT_SILENCE_AVG_AMPLITUDE,
  liveInputSignalPeakAmplitude: LIVE_INPUT_SIGNAL_PEAK_AMPLITUDE,
  requestedPitchSource: REQUESTED_PITCH_SOURCE,
} = AUDIO_ANALYSIS_POLICY;
const TEST_TONE_HARMONIC_ATTENUATION =
  SPECTRAL_MODAL_POLICY.harmonicAttenuation;

const LIVE_INPUT_NORMALIZATION_TARGET = 0.65;
const LIVE_INPUT_NORMALIZATION_MAX_GAIN = 6.0;
const LIVE_INPUT_NORMALIZATION_MIN_SIGNAL = 0.03;
const LIVE_INPUT_NORMALIZATION_MAX_RAW_PEAK = 0.16;
const LIVE_INPUT_INVALID_BASELINE_PEAK = 0.94;
const LIVE_INPUT_INVALID_COMPRESSED_BASELINE_PEAK = 0.82;
const LIVE_INPUT_INVALID_COMPRESSED_BASELINE_RMS = 0.0085;
const LIVE_INPUT_INVALID_CURRENT_SATURATED_PEAK = 0.98;
const LIVE_INPUT_INVALID_CURRENT_WEAK_RMS = 0.012;
const LIVE_INPUT_INVALID_CURRENT_WEAK_AVG = 10;
const RENDER_ENERGY_EPSILON = 1e-6;
const BAND_LIMITS_HZ = [140, 600, 2400, 8000];
const SPECTRAL_BAND_6_LIMITS_HZ = [140, 400, 1200, 3200, 6400, 12000];
const SPECTRAL_BAND_6_COUNT = 6;
const TREBLE_FLATNESS_MIN_HZ = 3200;
const TREBLE_FLATNESS_MAX_HZ = 10000;
const DEFAULT_LIVE_INPUT_POLICY = DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT;
const LIVE_INPUT_CALIBRATION_WINDOW_MS = 1100;
const LIVE_INPUT_CALIBRATION_SMOOTHING_MS = 320;
const MODAL_VISIBILITY_SLOT_ENERGY_START =
  SPECTRAL_MODAL_POLICY.modalRenderLivenessFloor;
const MODAL_VISIBILITY_SLOT_ENERGY_END = 0.18;
const MODAL_VISIBILITY_DRIVE_START = 0.025;
const MODAL_VISIBILITY_DRIVE_END = 0.12;
const MODAL_VISIBILITY_COHERENCE_START = 0.18;
const MODAL_VISIBILITY_COHERENCE_END = 0.58;
const MODAL_VISIBILITY_PERSISTENCE_START = 0.03;
const MODAL_VISIBILITY_PERSISTENCE_END = 0.2;
const MODAL_VISIBILITY_DISTRIBUTED_REDUCTION = 0.25;
const MODAL_VISIBILITY_HIGH_Q_ENERGY_START = 0.003;
const MODAL_VISIBILITY_HIGH_Q_ENERGY_END = 0.009;
const MODAL_VISIBILITY_HIGH_Q_MAX = 0.5;
const MODAL_VISIBILITY_HIGH_Q_OBSERVER_ENERGY_START = 0.006;
const MODAL_VISIBILITY_HIGH_Q_OBSERVER_ENERGY_END = 0.04;
const MODAL_VISIBILITY_HIGH_Q_OBSERVER_SUPPORT_START = 0.02;
const MODAL_VISIBILITY_HIGH_Q_OBSERVER_SUPPORT_END = 0.18;
const MODAL_VISIBILITY_HIGH_Q_OBSERVER_MIN_SUPPORT_WEIGHT = 0.42;
const MODAL_VISIBILITY_HIGH_Q_RETAINED_MAX = 0.28;
const MODAL_OBSERVER_HIGH_Q_ENERGY_START = 0.0015;
const MODAL_OBSERVER_HIGH_Q_ENERGY_END = 0.018;
const MODAL_OBSERVER_HIGH_Q_SUPPORT_START = 0.015;
const MODAL_OBSERVER_HIGH_Q_SUPPORT_END = 0.22;
const MODAL_OBSERVER_HIGH_Q_MAX = 0.46;
const MODAL_OBSERVER_LOW_Q_ENERGY_START = 0.01;
const MODAL_OBSERVER_LOW_Q_ENERGY_END = 0.12;
const MODAL_OBSERVER_LOW_Q_MAX = 0.22;
const MODAL_OBSERVER_RESONANT_SLOT_FLOOR_TOTAL_MAX = 0.018;
const MODAL_FIELD_Q_FALLBACK_BASE = 4;
const MODAL_FIELD_Q_FALLBACK_GAIN = 28;
const MODAL_FIELD_Q_FREQUENCY_REFERENCE_HZ = 1800;
const MODAL_FIELD_Q_ORDER_REFERENCE = 26;
const MODAL_FIELD_Q_MIN = 0.1;
const MODAL_FIELD_Q_MAX = 128;
const MODAL_OBSERVER_SOURCE_COUPLED_SLOT_FLOOR_TOTAL_MAX = 0.012;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_START = 0.006;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_END = 0.075;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_COHERENCE_START = 0.22;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_COHERENCE_END = 0.58;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_SNR_START = 0.08;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_SNR_END = 0.45;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_SOURCE_START = 0.018;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_SOURCE_END = 0.12;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_SNR_FLOOR = 0.32;
const LOW_Q_SOURCE_COUPLED_DIRECT_SNR_ENERGY_START = 0.18;
const LOW_Q_SOURCE_COUPLED_DIRECT_SNR_ENERGY_END = 0.42;
const LOW_Q_SOURCE_COUPLED_DIRECT_SNR_COHERENCE_START = 0.58;
const LOW_Q_SOURCE_COUPLED_DIRECT_SNR_COHERENCE_END = 0.82;
const LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_MAX = 0.18;
const LOW_Q_SOURCE_COUPLED_TOPOLOGY_FLOOR_MAX = 0.18;
const EMPTY_LOW_Q_SOURCE_COUPLED_VISIBILITY = Object.freeze({
  lowQSourceCoupledVisibilityAuthority: 0,
  lowQSourceCoupledVisibilityEnergy: 0,
  lowQSourceCoupledTopologyFloor: 0,
  lowQSourceCoupledSourceSupport: 0,
  lowQSourceCoupledVisibilityRejected: false,
});

const EMPTY_MODAL_OBSERVER_VISIBILITY = Object.freeze({
  modalObserverVisibilityEnergy: 0,
  highQObserverVisibilityEnergy: 0,
  lowQObserverVisibilityEnergy: 0,
  modalObserverTopologyFloor: 0,
  resonantSlotFloorTotal: 0,
  sourceCoupledSlotFloorTotal: 0,
  ...EMPTY_LOW_Q_SOURCE_COUPLED_VISIBILITY,
  highQSparseResonatorAuthority: 0,
  highQProjectionLoad: 0,
  highQRetainedVisibilityRejected: false,
});
const LIVE_INPUT_ACOUSTIC_INTENT_CONFIGS = Object.freeze({
  ambient: Object.freeze({
    absoluteAvgAmplitude: Math.max(2.2, LIVE_INPUT_SILENCE_AVG_AMPLITUDE * 0.3),
    absoluteRmsFloor: 0.0065,
    absolutePeakFloor: 0.075,
    absoluteCentroidFloor: 0.006,
    openFrames: 1,
    closeFrames: 4,
    rmsOpenMultiplier: 1.04,
    rmsOpenOffset: 0.00008,
    peakOpenMultiplier: 1.1,
    peakOpenOffset: 0.01,
    centroidOpenMultiplier: 1,
    centroidOpenOffset: 0.0008,
    lowBandOpenMultiplier: 1.08,
    lowBandOpenOffset: 0.0006,
    rmsCloseMultiplier: 0.98,
    rmsCloseOffset: 0.00005,
    peakCloseMultiplier: 1.02,
    peakCloseOffset: 0.006,
    minPeakClarity: 0.14,
    hardSilenceRmsMultiplier: 1.02,
    hardSilenceRmsOffset: 0.00005,
    hardSilencePeakMultiplier: 1.02,
    hardSilencePeakOffset: 0.004,
    hardSilenceAvgMultiplier: 0.28,
    hardSilenceAvgOffset: 0.2,
    latchHoldFrames: 5,
    pitchMinHz: 70,
    pitchMaxHz: 1400,
    pitchAutocorrelationMaxHz: 650,
    pitchConfidence: 0.22,
    pitchLatchConfidence: 0.16,
    pitchLowEnergyRms: 0.014,
    pitchStrongPeriodicity: 0.5,
    highPitchMinHz: 650,
    highPitchMinConfidence: 0.28,
    highPitchMinPeriodicity: 0.48,
    highPitchMinHarmonicSupport: 0.18,
    highPitchMinSupportSources: 2,
    highPitchStableFrames: 2,
    highPitchStableConfidence: 0.28,
    spectralPeakMaxHz: 8000,
  }),
  vocal: Object.freeze({
    absoluteAvgAmplitude: Math.max(2.2, LIVE_INPUT_SILENCE_AVG_AMPLITUDE * 0.3),
    absoluteRmsFloor: 0.0065,
    absolutePeakFloor: 0.075,
    absoluteCentroidFloor: 0.006,
    openFrames: 1,
    closeFrames: 4,
    rmsOpenMultiplier: 1.04,
    rmsOpenOffset: 0.00008,
    peakOpenMultiplier: 1.1,
    peakOpenOffset: 0.01,
    centroidOpenMultiplier: 1,
    centroidOpenOffset: 0.0008,
    lowBandOpenMultiplier: 1.08,
    lowBandOpenOffset: 0.0006,
    rmsCloseMultiplier: 0.98,
    rmsCloseOffset: 0.00005,
    peakCloseMultiplier: 1.02,
    peakCloseOffset: 0.006,
    minPeakClarity: 0.14,
    hardSilenceRmsMultiplier: 1.02,
    hardSilenceRmsOffset: 0.00005,
    hardSilencePeakMultiplier: 1.02,
    hardSilencePeakOffset: 0.004,
    hardSilenceAvgMultiplier: 0.28,
    hardSilenceAvgOffset: 0.2,
    latchHoldFrames: 5,
    pitchMinHz: 70,
    pitchMaxHz: 1400,
    pitchAutocorrelationMaxHz: 650,
    pitchConfidence: 0.24,
    pitchLatchConfidence: 0.18,
    pitchLowEnergyRms: 0.014,
    pitchStrongPeriodicity: 0.52,
    highPitchMinHz: 650,
    highPitchMinConfidence: 0.3,
    highPitchMinPeriodicity: 0.5,
    highPitchMinHarmonicSupport: 0.2,
    highPitchMinSupportSources: 2,
    highPitchStableFrames: 2,
    highPitchStableConfidence: 0.3,
    spectralPeakMaxHz: 8000,
  }),
});
const LOW_BAND_PRIMARY_WEIGHT = 0.7;
const LOW_BAND_SECONDARY_WEIGHT = 0.3;
const BEAT_LOW_BAND_RISE_WEIGHT = 0.5;
const BEAT_SPECTRAL_FLUX_WEIGHT = 0.35;
const BEAT_RMS_DELTA_WEIGHT = 0.15;
const MIN_BEAT_THRESHOLD = 0.024;
const DEFAULT_FRAME_TIME_MS = 1000 / 60;
const BEAT_HISTORY_SIZE_LOCAL = 8;
const ONSET_DENSITY_WINDOW_MS = 4000;
const ONSET_DENSITY_MAX_BEATS = 8; // matches BEAT_HISTORY_SIZE_LOCAL; 8 beats in 4s = 2 BPS
const ONSET_DENSITY_SMOOTHING_MS = 8000;
// Minimum harmonic salience for a peak to drive the ambient source-coupled field.
// Prevents isolated noise peaks (fricatives, room noise, broadband bursts)
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;
const MIN_IBI_MS = 60000 / MAX_TEMPO_BPM; // 250ms
const MAX_IBI_MS = 60000 / MIN_TEMPO_BPM; // 1500ms
const TEMPO_EMA_FAST = 0.35;
const TEMPO_EMA_SLOW = 0.1;
const CHROMA_EMA_ALPHA = 0.1;
const LIVE_INPUT_STRUCTURE_RESPONSE_SCALE = 0.8;
const LIVE_INPUT_ENERGY_RESPONSE_SCALE = 0.55;
const LIVE_INPUT_CHANGE_RESPONSE_SCALE = 0.45;
const LIVE_INPUT_PULSE_RESPONSE_SCALE = 0.9;
const LIVE_INPUT_RESONANCE_PEAK_COUNT = 4;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_PEAK = 0.03;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_CLARITY = 0.42;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_AVG = 0.9;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_CENTROID = 0.006;

export { createAudioFeatureState };

function getAnalysisMemory(featureState, capacity) {
  if (featureState?.analysis) {
    return featureState.analysis;
  }

  return createAudioFeatureState(capacity).analysis;
}

function ensureArrayField(container, key, length) {
  let value = container[key];
  if (!(value instanceof Float32Array) || value.length !== length) {
    value = new Float32Array(length);
    container[key] = value;
  }
  return value;
}

function ensureTargetBuildField(container, key, capacity) {
  let value = container[key];
  if (!value) {
    value = createModalTargetBuild(capacity);
    container[key] = value;
    return value;
  }

  const slotLength = capacity * 4;
  value.slots = ensureArrayField(value, "slots", slotLength);
  value.referenceSlots = ensureArrayField(value, "referenceSlots", slotLength);
  value.colorSlots = ensureArrayField(value, "colorSlots", slotLength);
  value.harmonicSupport = ensureArrayField(
    value,
    "harmonicSupport",
    HARMONIC_ORDERS.length,
  );
  if (!(value._mergeScratch instanceof Map)) {
    value._mergeScratch = new Map();
  }
  if (!Array.isArray(value.peaks)) {
    value.peaks = [];
  }
  if (!Array.isArray(value.components)) {
    value.components = [];
  }
  if (!Number.isFinite(value.uniqueModeCount)) {
    value.uniqueModeCount = 0;
  }

  return value;
}

function ensureAnalysisMemoryShape(featureState, analysisMemory, capacity) {
  const slotLength = capacity * 4;
  const candidateForcingSlots = ensureArrayField(
    analysisMemory,
    "candidateForcingSlots",
    slotLength,
  );
  const candidateResponseSlots = ensureArrayField(
    analysisMemory,
    "candidateResponseSlots",
    slotLength,
  );
  const sourceCoupledPhaseSlots = ensureArrayField(
    analysisMemory,
    "sourceCoupledPhaseSlots",
    slotLength,
  );
  const resonantPhaseSlots = ensureArrayField(
    analysisMemory,
    "resonantPhaseSlots",
    slotLength,
  );
  const modeSlots = ensureArrayField(analysisMemory, "modeSlots", slotLength);
  const signalModeSlots = ensureArrayField(
    analysisMemory,
    "signalModeSlots",
    slotLength,
  );
  const sourceCoupledColorSlots = ensureArrayField(
    analysisMemory,
    "sourceCoupledColorSlots",
    slotLength,
  );
  const resonantColorSlots = ensureArrayField(
    analysisMemory,
    "resonantColorSlots",
    slotLength,
  );
  const referenceSourceCoupledSlots = ensureArrayField(
    analysisMemory,
    "referenceSourceCoupledSlots",
    slotLength,
  );
  const referenceResonantSlots = ensureArrayField(
    analysisMemory,
    "referenceResonantSlots",
    slotLength,
  );
  const referenceModeSlots = ensureArrayField(
    analysisMemory,
    "referenceModeSlots",
    slotLength,
  );
  const signalReferenceModeSlots = ensureArrayField(
    analysisMemory,
    "signalReferenceModeSlots",
    slotLength,
  );
  const bandEnergies = ensureArrayField(
    analysisMemory,
    "bandEnergies",
    BAND_BUCKET_COUNT,
  );
  const zeroSourceCoupledTargetSlots = ensureArrayField(
    analysisMemory,
    "zeroSourceCoupledTargetSlots",
    slotLength,
  );
  const zeroResonantTargetSlots = ensureArrayField(
    analysisMemory,
    "zeroResonantTargetSlots",
    slotLength,
  );
  const nonAcousticSourceCoupledTarget = ensureTargetBuildField(
    analysisMemory,
    "nonAcousticSourceCoupledTarget",
    capacity,
  );
  const nonAcousticResonantTarget = ensureTargetBuildField(
    analysisMemory,
    "nonAcousticResonantTarget",
    capacity,
  );
  const nonAcousticPeakDriverScratch = ensureTargetBuildField(
    analysisMemory,
    "nonAcousticPeakDriverScratch",
    capacity,
  );
  const acousticSourceCoupledTarget = ensureTargetBuildField(
    analysisMemory,
    "acousticSourceCoupledTarget",
    capacity,
  );
  const acousticResonantTarget = ensureTargetBuildField(
    analysisMemory,
    "acousticResonantTarget",
    capacity,
  );
  if (!analysisMemory.sourceCoupledState || !analysisMemory.resonantState) {
    const replacement = createAudioFeatureState(capacity).analysis;
    analysisMemory.sourceCoupledState = replacement.sourceCoupledState;
    analysisMemory.resonantState = replacement.resonantState;
    analysisMemory.bandState = replacement.bandState;
    analysisMemory.previousSpectrum = replacement.previousSpectrum;
  }
  if (
    !(analysisMemory.previousSpectrum instanceof Float32Array) ||
    analysisMemory.previousSpectrum.length < 0
  ) {
    analysisMemory.previousSpectrum = new Float32Array(0);
  }
  if (!analysisMemory.bandState) {
    analysisMemory.bandState =
      createAudioFeatureState(capacity).analysis.bandState;
  }
  if (!Number.isFinite(analysisMemory.bandState.lowBandEnergy)) {
    const replacement = createAudioFeatureState(capacity).analysis.bandState;
    analysisMemory.bandState = {
      ...replacement,
      ...analysisMemory.bandState,
      bandEnergies:
        analysisMemory.bandState.bandEnergies ?? replacement.bandEnergies,
    };
  }
  if (
    !analysisMemory.modalExcitationState ||
    analysisMemory.modalExcitationState.capacity !== capacity
  ) {
    analysisMemory.modalExcitationState = createModalExcitationState(capacity);
  }

  if (featureState?.analysis) {
    featureState.analysis = analysisMemory;
  }

  return {
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    signalModeSlots,
    sourceCoupledColorSlots,
    resonantColorSlots,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroSourceCoupledTargetSlots,
    zeroResonantTargetSlots,
    nonAcousticSourceCoupledTarget,
    nonAcousticResonantTarget,
    nonAcousticPeakDriverScratch,
    acousticSourceCoupledTarget,
    acousticResonantTarget,
    modalExcitationState: analysisMemory.modalExcitationState,
    sourceCoupledState: analysisMemory.sourceCoupledState,
    resonantState: analysisMemory.resonantState,
    bandState: analysisMemory.bandState,
    previousSpectrum: analysisMemory.previousSpectrum,
  };
}

function getFrameTimestamp() {
  return performance.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function averageArray(values) {
  if (!values?.length) return 0;

  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i] ?? 0;
  }

  return total / values.length;
}

function getSourceNormalization({
  inputMode,
  avgAmplitude,
  analyserRms,
  spectralCentroid,
  bandState,
}) {
  if (inputMode === "live") {
    const baselineRms = Math.max(0, bandState?.liveInputBaselineRms ?? 0);
    const baselineCentroid = Math.max(
      0,
      bandState?.liveInputBaselineCentroid ?? 0,
    );
    return {
      normalizedRms: clamp01(
        baselineRms > 0
          ? (analyserRms - baselineRms * 0.75) /
              Math.max(0.003, baselineRms * 12)
          : analyserRms / 0.028,
      ),
      normalizedAmplitude: clamp01(avgAmplitude / 72),
      normalizedCentroid: clamp01(
        baselineCentroid > 0
          ? spectralCentroid / Math.max(0.02, baselineCentroid * 1.8)
          : spectralCentroid / 0.25,
      ),
    };
  }

  return {
    normalizedRms: clamp01(analyserRms * 2.8),
    normalizedAmplitude: clamp01(avgAmplitude / 96),
    normalizedCentroid: clamp01(spectralCentroid * 1.25),
  };
}

function deriveSourceEnergyAuthority(sourceNormalization) {
  return clamp01(
    Math.max(
      sourceNormalization?.normalizedRms ?? 0,
      sourceNormalization?.normalizedAmplitude ?? 0,
    ),
  );
}

function deriveReusedAnalysisSourceAuthorityScale({
  preparedInputs,
  analysisResult,
}) {
  const reusedAuthority = deriveSourceEnergyAuthority(
    analysisResult?.sourceNormalization,
  );
  if (!(reusedAuthority > 0)) {
    return 1;
  }

  const currentNormalization = getSourceNormalization({
    inputMode: preparedInputs.analysisInputMode,
    avgAmplitude: preparedInputs.avgAmplitude,
    analyserRms: preparedInputs.analyserRms,
    spectralCentroid: analysisResult?.spectralCentroid ?? 0,
    bandState: preparedInputs.bandState,
  });
  const currentAuthority = deriveSourceEnergyAuthority(currentNormalization);

  return clamp01(currentAuthority / reusedAuthority);
}

function getFrameDeltaMs(previousFrameAtMs, currentFrameAtMs) {
  if (!Number.isFinite(previousFrameAtMs) || previousFrameAtMs <= 0) {
    return DEFAULT_FRAME_TIME_MS;
  }

  return Math.max(1, currentFrameAtMs - previousFrameAtMs);
}

function computeEmaAlpha(deltaMs, smoothingMs) {
  if (!(deltaMs > 0) || !(smoothingMs > 0)) {
    return 1;
  }

  return 1 - Math.exp(-deltaMs / smoothingMs);
}

/**
 * @param {any} bandState
 * @param {{
 *   inputMode?: string,
 *   policy?: "line-feed" | "ambient" | "vocal",
 *   calibrationVersion?: number,
 *   invalid?: boolean,
 *   invalidReason?: string,
 * }=} options
 */
function resetLiveInputGateState(
  bandState,
  {
    inputMode = "idle",
    policy = DEFAULT_LIVE_INPUT_POLICY,
    calibrationVersion = bandState.liveInputCalibrationVersion ?? 0,
    invalid = false,
    invalidReason = "none",
  } = {},
) {
  bandState.liveInputMode = inputMode;
  bandState.liveInputPolicy = policy;
  bandState.liveInputGateState = "closed";
  bandState.liveInputCalibrationActive = false;
  bandState.liveInputCalibrationStartedAtMs = Number.NEGATIVE_INFINITY;
  bandState.liveInputCalibrationVersion = calibrationVersion;
  bandState.liveInputCalibrationInvalid = invalid;
  bandState.liveInputCalibrationInvalidReason = invalidReason;
  bandState.liveInputPreviousFrameAtMs = 0;
  bandState.liveInputBaselineRms = 0;
  bandState.liveInputBaselinePeak = 0;
  bandState.liveInputBaselineCentroid = 0;
  bandState.liveInputBaselineLowBandEnergy = 0;
  bandState.liveInputOpenFrames = 0;
  bandState.liveInputQuietFrames = 0;
}

/**
 * @param {any} bandState
 * @param {number} currentFrameAtMs
 * @param {"ambient" | "vocal"} acousticIntent
 * @param {{
 *   calibrationVersion?: number,
 *   invalid?: boolean,
 *   invalidReason?: string,
 * }=} options
 */
function beginLiveInputCalibration(
  bandState,
  currentFrameAtMs,
  acousticIntent,
  {
    calibrationVersion = bandState.liveInputCalibrationVersion ?? 0,
    invalid = false,
    invalidReason = "none",
  } = {},
) {
  resetLiveInputGateState(bandState, {
    inputMode: "live",
    policy: acousticIntent,
    calibrationVersion,
    invalid,
    invalidReason,
  });
  bandState.liveInputGateState = "calibrating";
  bandState.liveInputCalibrationActive = true;
  bandState.liveInputCalibrationStartedAtMs = currentFrameAtMs;
  bandState.liveInputPreviousFrameAtMs = currentFrameAtMs;
}

/**
 * @param {{ analysisClass?: unknown, acousticIntent?: unknown } | undefined} [settings]
 * @returns {{ analysisClass: import("../../core/audio/liveInputAnalysis.js").LiveInputAnalysisClass, acousticIntent: import("../../core/audio/liveInputAnalysis.js").LiveInputAcousticIntent }}
 */
function normalizeLiveInputAnalysisSettings(settings = undefined) {
  return {
    analysisClass: normalizeLiveInputAnalysisClass(settings?.analysisClass),
    acousticIntent: normalizeLiveInputAcousticIntent(settings?.acousticIntent),
  };
}

/**
 * @param {unknown} [policy=DEFAULT_LIVE_INPUT_POLICY]
 */
function getLiveInputAcousticIntentConfig(policy = DEFAULT_LIVE_INPUT_POLICY) {
  const normalizedIntent = normalizeLiveInputAcousticIntent(policy);
  return (
    LIVE_INPUT_ACOUSTIC_INTENT_CONFIGS[normalizedIntent] ??
    LIVE_INPUT_ACOUSTIC_INTENT_CONFIGS[DEFAULT_LIVE_INPUT_POLICY]
  );
}

function resolveFeatureFrameLiveInputAnalysisClass(status, settings) {
  const resolvedFromStatus = normalizeResolvedLiveInputAnalysisClass(
    status?.resolvedLiveInputAnalysisClass,
  );
  if (
    status?.audioInputMode === "system" ||
    isLoopbackLiveInputDeviceKind(
      status?.liveInputDeviceKind ?? status?.liveInputKind,
    )
  ) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }
  if (status?.audioInputMode !== "live") {
    return resolvedFromStatus;
  }

  return normalizeResolvedLiveInputAnalysisClass(
    status?.resolvedLiveInputAnalysisClass ??
      settings?.analysisClass ??
      DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  );
}

function resolveFeatureFrameLiveInputPolicy({
  inputMode,
  resolvedLiveInputAnalysisClass,
  settings,
}) {
  if (resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }

  if (inputMode === "live" || inputMode === "system") {
    return normalizeLiveInputAcousticIntent(settings?.acousticIntent);
  }

  return normalizeLiveInputAcousticIntent(settings?.acousticIntent);
}

function getFrameTimeMs(frameTimeMs) {
  return Number.isFinite(frameTimeMs) && frameTimeMs >= 0
    ? frameTimeMs
    : getFrameTimestamp();
}

function resetBeatTrackingState(analysisMemory) {
  const bandState = analysisMemory.bandState;
  bandState.bandEnergies.fill(0);
  bandState.transientEnergy = 0;
  bandState.spectralCentroid = 0;
  bandState.spectralFlux = 0;
  bandState.previousRms = 0;
  bandState.lowBandEnergy = 0;
  bandState.lowBandEnergyEma = 0;
  bandState.previousLowBandEnergy = 0;
  bandState.onsetDriver = 0;
  bandState.onsetThresholdEma = 0;
  bandState.previousBeatAtMs = Number.NEGATIVE_INFINITY;
  bandState.previousFrameAtMs = 0;
  bandState.beatPulseId = 0;
  bandState.beatStrength = 0;
  bandState.beatConfidence = 0;
  bandState.onsetDensityEma = 0;
  resetLiveInputGateState(bandState, {
    inputMode: bandState.liveInputMode ?? "idle",
    policy: bandState.liveInputPolicy ?? DEFAULT_LIVE_INPUT_POLICY,
  });
  if (analysisMemory.previousSpectrum instanceof Float32Array) {
    analysisMemory.previousSpectrum.fill(0);
  }
}

function emptyFrozenLayers(auditState) {
  auditState.frozenSourceCoupledSlots.fill(0);
  auditState.frozenResonantSlots.fill(0);
  auditState.frozenModeSlots.fill(0);
  auditState.frozenSourceCoupledColorSlots.fill(0);
  auditState.frozenResonantColorSlots.fill(0);
}

function shouldBuildResonantedDebug(auditSettings) {
  return Boolean(auditSettings?.enabled);
}

function countNonZeroFFTBinCount(fftMagnitudes) {
  return countNonZeroFftBins(fftMagnitudes);
}

function computeBasicFftSummary(fftMagnitudes, sampleRate) {
  const summary = {
    peakMagnitude: 0,
    nonZeroBinCount: 0,
    spectralCentroid: 0,
  };
  if (!fftMagnitudes?.length) return summary;

  const nyquist = sampleRate ? sampleRate * 0.5 : 0;
  let weightedFrequency = 0;
  let amplitudeTotal = 0;
  for (let i = 0; i < fftMagnitudes.length; i += 1) {
    const amplitude = fftMagnitudes[i] ?? 0;
    if (amplitude > summary.peakMagnitude) {
      summary.peakMagnitude = amplitude;
    }
    if (amplitude > 0.001) {
      summary.nonZeroBinCount += 1;
    }
    if (amplitude > 0 && sampleRate) {
      const frequency = binIndexToFrequencyHz(
        i,
        fftMagnitudes.length,
        sampleRate,
      );
      weightedFrequency += frequency * amplitude;
      amplitudeTotal += amplitude;
    }
  }

  if (amplitudeTotal > 1e-6) {
    summary.spectralCentroid = Math.min(
      1,
      weightedFrequency / amplitudeTotal / Math.max(1, nyquist),
    );
  }

  return summary;
}

function findPeakFftMagnitude(fftMagnitudes) {
  if (!fftMagnitudes?.length) return 0;

  let peak = 0;
  for (let i = 0; i < fftMagnitudes.length; i++) {
    peak = Math.max(peak, fftMagnitudes[i] ?? 0);
  }

  return peak;
}

function scaleFftMagnitudes(fftMagnitudes, gain) {
  if (!(gain > 1) || !fftMagnitudes?.length) {
    return fftMagnitudes;
  }

  const scaled = new Float32Array(fftMagnitudes.length);
  for (let index = 0; index < fftMagnitudes.length; index += 1) {
    scaled[index] = Math.min(1, (fftMagnitudes[index] ?? 0) * gain);
  }
  return scaled;
}

function cloneFloat32Array(values) {
  return values instanceof Float32Array ? new Float32Array(values) : null;
}

function cloneSpectralLightComponents(components) {
  if (!Array.isArray(components) || components.length === 0) {
    return [];
  }

  return components.map((component) => ({ ...component }));
}

function buildSourceCoupledStateSummary(sourceCoupledState) {
  if (!sourceCoupledState) {
    return null;
  }

  return {
    uniqueModeCount: sourceCoupledState.uniqueModeCount ?? 0,
    harmonicSupport: cloneFloat32Array(sourceCoupledState.harmonicSupport),
    fundamental: sourceCoupledState.fundamental ?? 0,
    fundamentalConfidence: sourceCoupledState.fundamentalConfidence ?? 0,
    driverFrequency: sourceCoupledState.driverFrequency ?? 0,
    candidateFrequency: sourceCoupledState.candidateFrequency ?? 0,
    candidateConfidence: sourceCoupledState.candidateConfidence ?? 0,
    candidateFrames: sourceCoupledState.candidateFrames ?? 0,
    candidatePeriodicity: sourceCoupledState.candidatePeriodicity ?? 0,
    candidateHarmonicSupport: sourceCoupledState.candidateHarmonicSupport ?? 0,
    candidateDirectSupport: sourceCoupledState.candidateDirectSupport ?? 0,
    candidateLowEnergy: sourceCoupledState.candidateLowEnergy ?? false,
    voicingActive: sourceCoupledState.voicingActive ?? false,
    highCandidateRejected: sourceCoupledState.highCandidateRejected ?? false,
    rejectionReason: sourceCoupledState.rejectionReason ?? "none",
    latchHoldFrames: sourceCoupledState.latchHoldFrames ?? 0,
    latchLowSupportFrames: sourceCoupledState.latchLowSupportFrames ?? 0,
  };
}

function buildResonantStateSummary(resonantState) {
  if (!resonantState) {
    return null;
  }

  return {
    uniqueModeCount: resonantState.uniqueModeCount ?? 0,
  };
}

function deriveModalObservationEnergy(
  modalCoefficientEnergy,
  modalResponseEnergy,
) {
  return clamp01(Math.max(modalCoefficientEnergy, modalResponseEnergy));
}

function readModalResponseRenderEnergy(structuralMetrics, fallbackEnergy = 0) {
  return clamp01(
    structuralMetrics?.modalResponseRenderEnergy ?? fallbackEnergy,
  );
}

function readModalResponseRenderSourceCoupledEnergy(
  structuralMetrics,
  fallbackEnergy = 0,
) {
  return clamp01(
    structuralMetrics?.modalResponseRenderSourceCoupledEnergy ?? fallbackEnergy,
  );
}

function readModalResponseRenderResonantEnergy(
  structuralMetrics,
  fallbackEnergy = 0,
) {
  return clamp01(
    structuralMetrics?.modalResponseRenderResonantEnergy ?? fallbackEnergy,
  );
}

function hasFeatureFrameRenderAuthority({
  fieldState,
  hasModalField,
  activeModeCount,
  modalCoefficientEnergy,
  observationEnergy,
  modalVisibilityEnergy,
  modalObserverVisibilityEnergy,
}) {
  if (fieldState === FIELD_STATES.test) {
    return true;
  }

  return (
    hasModalField &&
    (activeModeCount > 0 ||
      modalCoefficientEnergy > RENDER_ENERGY_EPSILON ||
      observationEnergy > RENDER_ENERGY_EPSILON ||
      modalVisibilityEnergy > RENDER_ENERGY_EPSILON ||
      modalObserverVisibilityEnergy > RENDER_ENERGY_EPSILON)
  );
}

function buildDebugSummary({
  inputMode,
  analysisInputMode = inputMode,
  sourceEvidence = null,
  soundActive,
  micActive,
  pitchSource = "none",
  analysisEngine = "none",
  fieldState = FIELD_STATES.idle,
  renderAuthority = false,
  liveInputNoiseGateActive = false,
  liveInputHardSilenceActive = false,
  liveInputCalibrationActive = false,
  liveInputCalibrationInvalid = false,
  liveInputCalibrationInvalidReason = "none",
  liveInputAnalysisClass = DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  resolvedLiveInputAnalysisClass = DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  liveInputAcousticIntent = DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  liveInputPolicy = DEFAULT_LIVE_INPUT_POLICY,
  liveInputBaselineRms = 0,
  liveInputBaselinePeak = 0,
  sourceCoupledState,
  resonantState,
  dominantFrequency = 0,
  dominantAmplitude = 0,
  avgAmplitude = 0,
  analyserRms = 0,
  fftMagnitudes,
  nonZeroFFTBinCount = null,
  candidateForcingSlots,
  candidateResponseSlots,
  modeSlots,
  bandEnergies = null,
  spectralLightComponents = [],
  transientEnergy = 0,
  spectralCentroid = 0,
  spectralFlux = 0,
  structureSignal = 0,
  energySignal = 0,
  modalVisibilityEnergy = 0,
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
  micFftNormGain = 1,
  preModalFftPeak = 0,
  postNormalizationFftPeak = preModalFftPeak,
  referencePitchBinAmplitude = null,
  sourceNormalization = undefined,
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
  const modalVisibilitySummary = deriveModalVisibilityComponents({
    modeSlots,
    modeCapacity: MAX_STACK_SLOTS,
    structuralMetrics,
    hardSilent: liveInputHardSilenceActive,
    sourceNormalization,
    bandEnergies,
    activeSourceCoupledModeCount: sourceCoupledModeCount,
    nonZeroFFTBinCount:
      nonZeroFFTBinCount ?? countNonZeroFFTBinCount(fftMagnitudes),
    periodicity: sourceCoupledState?.candidatePeriodicity ?? 0,
  });
  const modalVisibilityDriveEnergy = clamp01(
    structuralMetrics?.modalDriveEnergy ?? 0,
  );
  const modalObserverVisibilityEnergy =
    modalVisibilitySummary.modalObserverVisibilityEnergy ?? 0;
  const retainedModalCoefficientEnergy = clamp01(
    sumSlotAmplitudeTotal(modeSlots, MAX_STACK_SLOTS),
  );
  const retainedModalResponseSourceCoupledEnergy = clamp01(
    structuralMetrics?.modalResponseSourceCoupledEnergy ?? 0,
  );
  const retainedModalResponseResonantEnergy = clamp01(
    structuralMetrics?.modalResponseResonantEnergy ?? 0,
  );
  const modalCoefficientEnergy = readModalResponseRenderEnergy(
    structuralMetrics,
    retainedModalCoefficientEnergy,
  );
  const modalResponseSourceCoupledEnergy =
    readModalResponseRenderSourceCoupledEnergy(
      structuralMetrics,
      retainedModalResponseSourceCoupledEnergy,
    );
  const modalResponseResonantEnergy = readModalResponseRenderResonantEnergy(
    structuralMetrics,
    retainedModalResponseResonantEnergy,
  );
  const modalResponseEnergy = modalCoefficientEnergy;
  const observationEnergy = deriveModalObservationEnergy(
    modalCoefficientEnergy,
    modalResponseEnergy,
  );

  return {
    audioInputMode: inputMode,
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
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputAnalysisClass,
    resolvedLiveInputAnalysisClass,
    liveInputAcousticIntent,
    liveInputPolicy,
    liveInputBaselineRms,
    liveInputBaselinePeak,
    sourceEvidence,
    analysisSourceUsed: inputMode === "idle" ? "none" : analysisInputMode,
    fundamentalFrequency: sourceCoupledState?.fundamental ?? 0,
    fundamentalConfidence: sourceCoupledState?.fundamentalConfidence ?? 0,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    uniqueModeCount:
      (sourceCoupledState?.uniqueModeCount ?? 0) +
      (resonantState?.uniqueModeCount ?? 0),
    nonZeroFFTBinCount:
      nonZeroFFTBinCount ?? countNonZeroFFTBinCount(fftMagnitudes),
    micFftNormGain,
    preModalFftPeak,
    postNormalizationFftPeak,
    modeSlotCount,
    sourceCoupledModeCount,
    resonantModeCount,
    transientEnergy,
    spectralCentroid,
    spectralFlux,
    structureSignal,
    energySignal,
    modalCoefficientEnergy,
    retainedModalCoefficientEnergy,
    observationEnergy,
    modalVisibilityEnergy,
    modalVisibilitySlotEnergy: modalVisibilitySummary.averageSlotEnergy,
    modalVisibilityPeakSlotEnergy: modalVisibilitySummary.peakSlotEnergy,
    modalVisibilityUpperSlotEnergy: modalVisibilitySummary.upperSlotEnergy,
    modalVisibilityDistributedEnergy:
      modalVisibilitySummary.distributedModalVisibility,
    modalVisibilityDominantEnergy:
      modalVisibilitySummary.dominantModalVisibility,
    modalObserverVisibilityEnergy,
    modalObserverTopologyFloor:
      modalVisibilitySummary.modalObserverTopologyFloor,
    highQObserverVisibilityEnergy:
      modalVisibilitySummary.highQObserverVisibilityEnergy,
    lowQObserverVisibilityEnergy:
      modalVisibilitySummary.lowQObserverVisibilityEnergy,
    lowQSourceCoupledVisibilityAuthority:
      modalVisibilitySummary.lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledVisibilityEnergy:
      modalVisibilitySummary.lowQSourceCoupledVisibilityEnergy,
    lowQSourceCoupledTopologyFloor:
      modalVisibilitySummary.lowQSourceCoupledTopologyFloor,
    lowQSourceCoupledSourceSupport:
      modalVisibilitySummary.lowQSourceCoupledSourceSupport,
    lowQSourceCoupledVisibilityRejected:
      modalVisibilitySummary.lowQSourceCoupledVisibilityRejected,
    modalVisibilityRetainedHighQEnergy:
      modalVisibilitySummary.retainedHighQModalVisibility,
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
            fftMagnitudes,
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
    lowOrderModalEnergy: structuralMetrics?.lowOrderModalEnergy ?? 0,
    highOrderModalEnergy: structuralMetrics?.highOrderModalEnergy ?? 0,
    observedModalModeCount: structuralMetrics?.observedModalModeCount ?? 0,
    lowQSourceCoupledModeCount:
      structuralMetrics?.lowQSourceCoupledModeCount ?? 0,
    lowQSourceCoupledEnergy: structuralMetrics?.lowQSourceCoupledEnergy ?? 0,
    lowQObservedDrive: structuralMetrics?.lowQObservedDrive ?? 0,
    lowQObservedSnr: structuralMetrics?.lowQObservedSnr ?? 0,
    lowQObservedCoherence: structuralMetrics?.lowQObservedCoherence ?? 0,
    highQResonantModeCount: structuralMetrics?.highQResonantModeCount ?? 0,
    highQResonantEnergy: structuralMetrics?.highQResonantEnergy ?? 0,
    highQRingSupport: structuralMetrics?.highQRingSupport ?? 0,
    highQObservedDrive: structuralMetrics?.highQObservedDrive ?? 0,
    highQObservedSnr: structuralMetrics?.highQObservedSnr ?? 0,
    highQObservedCoherence: structuralMetrics?.highQObservedCoherence ?? 0,
    highQObservedNoiseFloor: structuralMetrics?.highQObservedNoiseFloor ?? 0,
    highQSparseResonatorAuthority:
      modalVisibilitySummary.highQSparseResonatorAuthority ??
      structuralMetrics?.highQSparseResonatorAuthority ??
      0,
    highQProjectionLoad:
      modalVisibilitySummary.highQProjectionLoad ??
      structuralMetrics?.highQProjectionLoad ??
      0,
    highQRetainedVisibilityRejected: Boolean(
      modalVisibilitySummary.highQRetainedVisibilityRejected ??
      structuralMetrics?.highQRetainedVisibilityRejected,
    ),
    modalPhaseAuthority: structuralMetrics?.modalPhaseAuthority ?? 0,
    highQPhaseAuthority: structuralMetrics?.highQPhaseAuthority ?? 0,
    lowQPhaseAuthority: structuralMetrics?.lowQPhaseAuthority ?? 0,
    modalPhaseCoherentFieldModeCount:
      structuralMetrics?.modalPhaseCoherentFieldModeCount ?? 0,
    modalPersistence: structuralMetrics?.modalPersistence ?? 0,
    modalDriveEnergy: structuralMetrics?.modalDriveEnergy ?? 0,
    modalResponseEnergy: structuralMetrics?.modalResponseEnergy ?? 0,
    modalResponseRenderEnergy:
      structuralMetrics?.modalResponseRenderEnergy ?? modalCoefficientEnergy,
    modalResponseRenderRawEnergy:
      structuralMetrics?.modalResponseRenderRawEnergy ?? modalCoefficientEnergy,
    modalResponseCurrentRenderSourceEvidence: Boolean(
      structuralMetrics?.modalResponseCurrentRenderSourceEvidence,
    ),
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
    energyLedger: structuralMetrics?.energyLedger ?? null,
    driveSource: structuralMetrics?.driveSource ?? "none",
    resonantSignalAuthoritative:
      structuralMetrics?.resonantSignalAuthoritative ?? false,
    resonantSignalAuthoritativeReason:
      structuralMetrics?.resonantSignalAuthoritativeReason ?? "none",
    resonantSignalAuthoritativeCoverage:
      structuralMetrics?.resonantSignalAuthoritativeCoverage ?? false,
    resonantSignalAuthoritativeFreshSignal:
      structuralMetrics?.resonantSignalAuthoritativeFreshSignal ?? false,
    resonantSignalAuthoritativeFastAssist:
      structuralMetrics?.resonantSignalAuthoritativeFastAssist ?? false,
    resonantSignalAuthoritativeHighQ:
      structuralMetrics?.resonantSignalAuthoritativeHighQ ?? false,
    resonantShiftReleaseOverrideCount:
      structuralMetrics?.resonantShiftReleaseOverrideCount ?? 0,
    resonantShiftTrackingOverrideCount:
      structuralMetrics?.resonantShiftTrackingOverrideCount ?? 0,
    projectionEnergyBudgetSourceCoupled:
      structuralMetrics?.projectionEnergyBudgetSourceCoupled ?? 0,
    projectionEnergyBudgetResonant:
      structuralMetrics?.projectionEnergyBudgetResonant ?? 0,
    projectionEnergyUsedSourceCoupled:
      structuralMetrics?.projectionEnergyUsedSourceCoupled ?? 0,
    projectionEnergyUsedResonant:
      structuralMetrics?.projectionEnergyUsedResonant ?? 0,
    projectionRawEnergySourceCoupled:
      structuralMetrics?.projectionRawEnergySourceCoupled ?? 0,
    projectionRawEnergyResonant:
      structuralMetrics?.projectionRawEnergyResonant ?? 0,
    projectionAllocatedEnergySourceCoupled:
      structuralMetrics?.projectionAllocatedEnergySourceCoupled ?? 0,
    projectionAllocatedEnergyResonant:
      structuralMetrics?.projectionAllocatedEnergyResonant ?? 0,
    projectionEnergyScaleSourceCoupled:
      structuralMetrics?.projectionEnergyScaleSourceCoupled ?? 0,
    projectionEnergyScaleResonant:
      structuralMetrics?.projectionEnergyScaleResonant ?? 0,
    projectionOverlapPressureSourceCoupled:
      structuralMetrics?.projectionOverlapPressureSourceCoupled ?? 0,
    projectionOverlapPressureResonant:
      structuralMetrics?.projectionOverlapPressureResonant ?? 0,
    projectionCompetitionReduction:
      structuralMetrics?.projectionCompetitionReduction ?? 0,
    projectionLoad: structuralMetrics?.projectionLoad ?? 0,
    projectionHighQProtection:
      structuralMetrics?.projectionHighQProtection ?? 0,
    projectionEnergyNormalizationApplied:
      structuralMetrics?.projectionEnergyNormalizationApplied === true,
    sourceNormalization: sourceNormalization ?? {
      normalizedRms: 0,
      normalizedAmplitude: 0,
      normalizedCentroid: 0,
    },
    spectralLightComponents,
  };
}

function buildZeroDebugSnapshot({
  inputMode,
  soundActive,
  micActive,
  pitchSource = "none",
  analysisEngine = "none",
  fieldState = FIELD_STATES.idle,
  referenceModeSlots,
  bandEnergies,
  candidateForcingSlots,
  candidateResponseSlots,
  modeSlots,
  sourceCoupledColorSlots,
  resonantColorSlots,
  structuralMetrics = null,
  auditSettings,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  const debug = buildDebugSummary({
    inputMode,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    liveInputNoiseGateActive: false,
    liveInputHardSilenceActive: false,
    sourceCoupledState: null,
    resonantState: null,
    fftMagnitudes: null,
    candidateForcingSlots,
    candidateResponseSlots,
    modeSlots,
    structuralMetrics,
    spectralLightComponents: [],
    beatDetected: false,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    beatLowBandEnergy: 0,
    beatOnsetDriver: 0,
    beatThreshold: 0,
    structureSignal: 0,
    energySignal: 0,
    modalVisibilityEnergy: 0,
    changeSignal: 0,
    pulseSignal: 0,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  });

  if (!shouldBuildResonantedDebug(auditSettings)) {
    return debug;
  }

  return {
    ...debug,
    harmonicSupport: Array.from(new Float32Array(HARMONIC_ORDERS.length)),
    spectralCandidates: [],
    currentModeSlots: Array.from(modeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    modalFieldSlots: Array.from(modeSlots),
    modalFieldColorSlots: Array.from(sourceCoupledColorSlots),
    candidateForcingSlots: Array.from(candidateForcingSlots),
    candidateResponseSlots: Array.from(candidateResponseSlots),
    sourceCoupledColorSlots: Array.from(sourceCoupledColorSlots),
    resonantColorSlots: Array.from(resonantColorSlots),
    bandEnergies: Array.from(bandEnergies),
    slotAmplitudeDeltas: Array.from(new Float32Array(MAX_STACK_SLOTS)),
  };
}

/**
 * @param {{
 *   generation?: number,
 *   maxTotalModes?: number,
 *   modalFieldSlots?: Float32Array | number[],
 *   modalFieldPhaseSlots?: Float32Array | number[],
 *   modalFieldColorSlots?: Float32Array | number[],
 *   modalFieldMetadataSlots?: Float32Array | number[],
 * }} [options]
 */
function buildEmptyModalFieldDescriptor({
  generation = 0,
  maxTotalModes = AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldColorSlots,
  modalFieldMetadataSlots,
} = {}) {
  const slotLength = Math.max(
    modalFieldSlots?.length ?? 0,
    modalFieldPhaseSlots?.length ?? 0,
    modalFieldColorSlots?.length ?? 0,
    modalFieldMetadataSlots?.length ?? 0,
  );
  const emptySlots = new Float32Array(slotLength);

  return buildCanonicalFullModalDescriptor({
    generation,
    maxTotalModes,
    basisAtlasPageCapacity: MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    modalFieldSlots: modalFieldSlots ?? emptySlots,
    modalFieldPhaseSlots: modalFieldPhaseSlots ?? emptySlots,
    modalFieldColorSlots: modalFieldColorSlots ?? emptySlots,
    modalFieldMetadataSlots: modalFieldMetadataSlots ?? emptySlots,
    activeModalFieldModeCount: 0,
    observerCandidateModeCount: 0,
    observedModalModeCount: 0,
    phaseAuthorityModeCount: 0,
    modeIdentityRetentionRatio: 0,
  });
}

function buildSilentFeatureFrame({
  featureState,
  inputMode,
  soundActive,
  micActive,
  isLiveInputActive,
  sourceEvidence = null,
  candidateForcingSlots,
  candidateResponseSlots,
  sourceCoupledPhaseSlots,
  resonantPhaseSlots,
  modeSlots,
  referenceModeSlots,
  sourceCoupledColorSlots,
  resonantColorSlots,
  bandEnergies,
  sourceCoupledState,
  resonantState,
  fftSize,
  auditSettings,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  candidateForcingSlots.fill(0);
  candidateResponseSlots.fill(0);
  sourceCoupledPhaseSlots.fill(0);
  resonantPhaseSlots.fill(0);
  modeSlots.fill(0);
  referenceModeSlots.fill(0);
  sourceCoupledColorSlots.fill(0);
  resonantColorSlots.fill(0);
  bandEnergies.fill(0);
  clearModalStack(sourceCoupledState);
  clearModalStack(resonantState);

  let silentFft = featureState?.analysis?.fftMagnitudes;
  if (!silentFft?.length) {
    silentFft = new Float32Array((fftSize ?? 0) / 2);
  }
  silentFft.fill(0);

  if (featureState?.analysis) {
    featureState.analysis.fftMagnitudes = silentFft;
  }

  const modalDescriptor = buildEmptyModalFieldDescriptor({
    generation: featureState?.audit?.frame ?? 0,
    maxTotalModes: Math.min(
      MAX_STACK_SLOTS,
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    ),
    modalFieldSlots: modeSlots,
    modalFieldPhaseSlots: sourceCoupledPhaseSlots,
    modalFieldColorSlots: sourceCoupledColorSlots,
    modalFieldMetadataSlots: new Float32Array(modeSlots.length),
  });
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy: sourceEvidence?.sourceEnergy ?? 0,
    sourceBoundaryState:
      sourceEvidence?.sourceBoundaryState ??
      (soundActive || micActive || isLiveInputActive ? "zero" : "absent"),
    modalResponse: null,
    candidateForcingSlots,
    candidateResponseSlots,
    capacity: MAX_STACK_SLOTS,
  });

  return {
    fieldState: FIELD_STATES.idle,
    hasModalField: false,
    renderAuthority: false,
    energyLedger,
    projectedRenderEnergy: energyLedger.projectedRenderEnergy,
    sourceEvidence,
    isLiveInputActive,
    soundActive,
    micActive,
    averageAmplitude: 0,
    fftMagnitudes: silentFft,
    activeModeCount: 0,
    activeModalFieldModeCount: 0,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalFieldColorSlots: modalDescriptor.slotViews.modalFieldColorSlots,
    modalFieldMetadataSlots: modalDescriptor.slotViews.modalFieldMetadataSlots,
    bandEnergies,
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    structureSignal: 0,
    energySignal: 0,
    modalCoefficientEnergy: 0,
    retainedModalCoefficientEnergy: 0,
    modalResponseEnergy: 0,
    modalResponseRenderEnergy: 0,
    modalResponseRenderRawEnergy: 0,
    modalResponseCurrentRenderSourceEvidence: false,
    observationEnergy: 0,
    modalVisibilityEnergy: 0,
    modalObserverVisibilityEnergy: 0,
    modalVisibilityRetainedHighQEnergy: 0,
    modalPhaseAuthority: 0,
    changeSignal: 0,
    pulseSignal: 0,
    beatDetected: false,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    estimatedTempo: 0,
    tempoConfidence: 0,
    beatPhase: 0,
    rhythmicDensity: 0,
    keyTonic: 0,
    keyMode: "major",
    keyConfidence: 0,
    keyTonicHue: 0,
    bassSalience: 0,
    timbreSpread: 0,
    spectralNovelty: 0,
    referenceModeSlots,
    sourceMode: "silent",
    debug: buildZeroDebugSnapshot({
      inputMode,
      soundActive,
      micActive,
      referenceModeSlots,
      bandEnergies,
      candidateForcingSlots,
      candidateResponseSlots,
      modeSlots,
      sourceCoupledColorSlots,
      resonantColorSlots,
      structuralMetrics: { energyLedger },
      auditSettings,
      requestedCavityGeometry,
      effectiveCavityGeometry,
    }),
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
  const nyquist = sampleRate * 0.5;
  const writeHarmonicBin = (frequency, amplitude) => {
    const index = frequencyToBinIndex(
      frequency,
      fftMagnitudes.length,
      sampleRate,
    );
    fftMagnitudes[index] = Math.max(fftMagnitudes[index] ?? 0, amplitude);
    if (index > 0) {
      fftMagnitudes[index - 1] = Math.max(
        fftMagnitudes[index - 1] ?? 0,
        amplitude * 0.35,
      );
    }
    if (index < fftMagnitudes.length - 1) {
      fftMagnitudes[index + 1] = Math.max(
        fftMagnitudes[index + 1] ?? 0,
        amplitude * 0.35,
      );
    }
  };
  const baseFrequency = Math.max(
    0,
    Math.min(nyquist, auditSettings.testToneHz),
  );

  writeHarmonicBin(baseFrequency, testBinAmplitude);

  for (let i = 0; i < HARMONIC_ORDERS.length; i++) {
    const harmonicFrequency = baseFrequency * HARMONIC_ORDERS[i];
    if (i === 0 || harmonicFrequency <= 0 || harmonicFrequency > nyquist) {
      continue;
    }

    const attenuation =
      TEST_TONE_HARMONIC_ATTENUATION[i] ??
      TEST_TONE_HARMONIC_ATTENUATION[
        TEST_TONE_HARMONIC_ATTENUATION.length - 1
      ] ??
      1;
    writeHarmonicBin(harmonicFrequency, testBinAmplitude * attenuation);
  }

  const timeData = new Float32Array(fftSize);
  if (baseFrequency > 0 && testBinAmplitude > 0) {
    for (let index = 0; index < timeData.length; index += 1) {
      const t = index / sampleRate;
      let sample = 0;
      for (
        let harmonicIndex = 0;
        harmonicIndex < HARMONIC_ORDERS.length;
        harmonicIndex += 1
      ) {
        const harmonicOrder = HARMONIC_ORDERS[harmonicIndex];
        const harmonicFrequency = baseFrequency * harmonicOrder;
        if (harmonicFrequency <= 0 || harmonicFrequency > nyquist) {
          continue;
        }
        const attenuation =
          TEST_TONE_HARMONIC_ATTENUATION[harmonicIndex] ??
          TEST_TONE_HARMONIC_ATTENUATION[
            TEST_TONE_HARMONIC_ATTENUATION.length - 1
          ] ??
          1;
        sample +=
          Math.sin(2 * Math.PI * harmonicFrequency * t + harmonicIndex * 0.37) *
          attenuation;
      }
      timeData[index] = sample;
    }

    let rmsAccumulator = 0;
    for (let index = 0; index < timeData.length; index += 1) {
      rmsAccumulator += timeData[index] * timeData[index];
    }
    const rawRms = Math.sqrt(rmsAccumulator / Math.max(1, timeData.length));
    const targetRms = testBinAmplitude / Math.SQRT2;
    const rmsScale = rawRms > 1e-6 ? targetRms / rawRms : 0;
    for (let index = 0; index < timeData.length; index += 1) {
      timeData[index] = Math.max(-1, Math.min(1, timeData[index] * rmsScale));
    }
  }

  // Pure sine RMS = amplitude / sqrt(2); scale to 0-255 range like real analyser output.
  const syntheticRms = testBinAmplitude / Math.SQRT2;
  const syntheticAvgAmplitude = syntheticRms * 255;

  return {
    ...snapshot,
    sourceMode: "test",
    avgAmplitude: syntheticAvgAmplitude,
    fftMagnitudes,
    timeData,
    rms: syntheticRms,
  };
}

function computeLiveInputMetrics({
  avgAmplitude,
  rms,
  fftMagnitudes,
  sampleRate,
  fftSize,
  peakAmplitude: providedPeakAmplitude = null,
  spectralCentroid: providedSpectralCentroid = null,
}) {
  const spectrum = fftMagnitudes ?? new Float32Array(0);
  const peaks = findSpectralPeakFrequencies(
    spectrum,
    sampleRate,
    fftSize,
    LIVE_INPUT_RESONANCE_PEAK_COUNT,
  );
  let peakAmplitude = Number.isFinite(providedPeakAmplitude)
    ? Math.max(0, providedPeakAmplitude)
    : 0;
  if (!Number.isFinite(providedPeakAmplitude)) {
    for (let i = 0; i < spectrum.length; i++) {
      peakAmplitude = Math.max(peakAmplitude, spectrum[i] ?? 0);
    }
  }
  const totalPeakAmplitude = peaks.reduce(
    (sum, peak) => sum + (peak?.amplitude ?? 0),
    0,
  );
  const peakClarity =
    peakAmplitude > 0
      ? peakAmplitude / Math.max(peakAmplitude, totalPeakAmplitude)
      : 0;
  const bandEnergies = computeBandEnergies(spectrum, sampleRate, fftSize);
  const lowBandEnergy =
    (bandEnergies[0] ?? 0) * LOW_BAND_PRIMARY_WEIGHT +
    (bandEnergies[1] ?? 0) * LOW_BAND_SECONDARY_WEIGHT;

  return {
    avgAmplitude,
    rms,
    peakAmplitude,
    peakClarity,
    spectralCentroid: Number.isFinite(providedSpectralCentroid)
      ? clamp01(providedSpectralCentroid)
      : computeSpectralCentroid(spectrum, sampleRate),
    lowBandEnergy,
  };
}

function detectLiveInputHardSilence(metrics, thresholds) {
  return (
    metrics.avgAmplitude <= thresholds.hardSilenceAvg &&
    metrics.rms <= thresholds.hardSilenceRms &&
    metrics.peakAmplitude <= thresholds.hardSilencePeak
  );
}

export function detectLiveInputNoiseGate({
  injectTestTone,
  inputMode,
  avgAmplitude,
  rms,
  fftMagnitudes,
  sampleRate = DEFAULT_SAMPLE_RATE,
  fftSize = DEFAULT_FFT_SIZE,
  micAnalysisSettings = undefined,
  liveInputAnalysisSettings = undefined,
}) {
  const { acousticIntent } = normalizeLiveInputAnalysisSettings(
    micAnalysisSettings ?? liveInputAnalysisSettings,
  );
  const config = getLiveInputAcousticIntentConfig(acousticIntent);
  const metrics = computeLiveInputMetrics({
    avgAmplitude,
    rms,
    fftMagnitudes,
    sampleRate,
    fftSize,
  });
  const thresholds = {
    hardSilenceAvg: config.absoluteAvgAmplitude,
    hardSilenceRms: config.absoluteRmsFloor,
    hardSilencePeak: config.absolutePeakFloor,
  };

  return (
    !injectTestTone &&
    inputMode === "live" &&
    detectLiveInputHardSilence(metrics, thresholds) &&
    metrics.spectralCentroid < config.absoluteCentroidFloor
  );
}

function updateLiveInputCalibrationBaseline(bandState, metrics, deltaMs) {
  const alpha = computeEmaAlpha(deltaMs, LIVE_INPUT_CALIBRATION_SMOOTHING_MS);
  if (
    !(bandState.liveInputBaselineRms > 0) &&
    !(bandState.liveInputBaselinePeak > 0) &&
    !(bandState.liveInputBaselineCentroid > 0) &&
    !(bandState.liveInputBaselineLowBandEnergy > 0)
  ) {
    bandState.liveInputBaselineRms = metrics.rms;
    bandState.liveInputBaselinePeak = metrics.peakAmplitude;
    bandState.liveInputBaselineCentroid = metrics.spectralCentroid;
    bandState.liveInputBaselineLowBandEnergy = metrics.lowBandEnergy;
    return;
  }

  bandState.liveInputBaselineRms +=
    (metrics.rms - bandState.liveInputBaselineRms) * alpha;
  bandState.liveInputBaselinePeak +=
    (metrics.peakAmplitude - bandState.liveInputBaselinePeak) * alpha;
  bandState.liveInputBaselineCentroid +=
    (metrics.spectralCentroid - bandState.liveInputBaselineCentroid) * alpha;
  bandState.liveInputBaselineLowBandEnergy +=
    (metrics.lowBandEnergy - bandState.liveInputBaselineLowBandEnergy) * alpha;
}

function classifyLiveInputCalibrationInvalid(bandState, metrics) {
  const baselinePeak = Math.max(0, bandState?.liveInputBaselinePeak ?? 0);
  const baselineRms = Math.max(0, bandState?.liveInputBaselineRms ?? 0);

  if (baselinePeak >= LIVE_INPUT_INVALID_BASELINE_PEAK) {
    return "baseline-clipping";
  }

  if (
    baselinePeak >= LIVE_INPUT_INVALID_COMPRESSED_BASELINE_PEAK &&
    baselineRms <= LIVE_INPUT_INVALID_COMPRESSED_BASELINE_RMS &&
    metrics.peakAmplitude >= LIVE_INPUT_INVALID_CURRENT_SATURATED_PEAK &&
    metrics.rms <= LIVE_INPUT_INVALID_CURRENT_WEAK_RMS &&
    metrics.avgAmplitude <= LIVE_INPUT_INVALID_CURRENT_WEAK_AVG
  ) {
    return "compressed-baseline";
  }

  return "none";
}

function deriveLiveInputThresholds(bandState, profileConfig) {
  return {
    openRms: Math.max(
      profileConfig.absoluteRmsFloor * 0.2,
      bandState.liveInputBaselineRms * profileConfig.rmsOpenMultiplier +
        profileConfig.rmsOpenOffset,
    ),
    closeRms: Math.max(
      profileConfig.absoluteRmsFloor * 0.15,
      bandState.liveInputBaselineRms * profileConfig.rmsCloseMultiplier +
        profileConfig.rmsCloseOffset,
    ),
    openPeak: profileConfig.absolutePeakFloor,
    closePeak: Math.max(
      LIVE_INPUT_SIGNAL_PEAK_AMPLITUDE * 0.7,
      profileConfig.absolutePeakFloor * 0.85,
    ),
    openCentroid:
      bandState.liveInputBaselineCentroid *
        profileConfig.centroidOpenMultiplier +
      profileConfig.centroidOpenOffset,
    openLowBand:
      bandState.liveInputBaselineLowBandEnergy *
        profileConfig.lowBandOpenMultiplier +
      profileConfig.lowBandOpenOffset,
    hardSilenceRms: Math.max(
      profileConfig.absoluteRmsFloor * 0.8,
      bandState.liveInputBaselineRms * profileConfig.hardSilenceRmsMultiplier +
        profileConfig.hardSilenceRmsOffset,
    ),
    hardSilencePeak: Math.max(
      profileConfig.absolutePeakFloor * 0.4,
      bandState.liveInputBaselinePeak *
        profileConfig.hardSilencePeakMultiplier +
        profileConfig.hardSilencePeakOffset,
    ),
    hardSilenceAvg:
      profileConfig.absoluteAvgAmplitude *
        profileConfig.hardSilenceAvgMultiplier +
      profileConfig.hardSilenceAvgOffset,
  };
}

function qualifiesLiveInputOpen(
  metrics,
  thresholds,
  acousticIntent,
  acousticIntentConfig,
) {
  if (acousticIntent === LIVE_INPUT_ACOUSTIC_INTENTS.ambient) {
    return (
      metrics.rms >= thresholds.openRms ||
      metrics.peakAmplitude >= thresholds.openPeak ||
      metrics.lowBandEnergy >= thresholds.openLowBand
    );
  }

  return (
    metrics.rms >= thresholds.openRms &&
    metrics.peakAmplitude >= thresholds.openPeak &&
    (metrics.spectralCentroid >= thresholds.openCentroid ||
      metrics.peakClarity >= acousticIntentConfig.minPeakClarity)
  );
}

function qualifiesLiveInputHold(metrics, thresholds, acousticIntent) {
  if (acousticIntent === LIVE_INPUT_ACOUSTIC_INTENTS.ambient) {
    return (
      metrics.rms >= thresholds.closeRms ||
      metrics.peakAmplitude >= thresholds.closePeak ||
      metrics.lowBandEnergy >= thresholds.openLowBand * 0.8 ||
      hasAmbientResonancePresence(metrics, thresholds)
    );
  }

  return (
    metrics.rms >= thresholds.closeRms ||
    metrics.peakAmplitude >= thresholds.closePeak
  );
}

function hasAmbientResonancePresence(metrics, thresholds) {
  return (
    metrics.avgAmplitude >=
      Math.max(
        thresholds.hardSilenceAvg * 1.1,
        LIVE_INPUT_AMBIENT_RESONANCE_MIN_AVG,
      ) &&
    metrics.peakAmplitude >= LIVE_INPUT_AMBIENT_RESONANCE_MIN_PEAK &&
    metrics.peakClarity >= LIVE_INPUT_AMBIENT_RESONANCE_MIN_CLARITY &&
    metrics.spectralCentroid >= LIVE_INPUT_AMBIENT_RESONANCE_MIN_CENTROID
  );
}

function resolveLiveInputNoiseGate({
  analysisMemory,
  injectTestTone,
  inputMode,
  avgAmplitude,
  rms,
  fftMagnitudes,
  sampleRate,
  fftSize,
  preModalFftPeak = null,
  spectralCentroidHint = null,
  currentFrameAtMs,
  calibrationVersion = 0,
  micAnalysisSettings,
}) {
  const bandState = analysisMemory.bandState;
  const { acousticIntent } =
    normalizeLiveInputAnalysisSettings(micAnalysisSettings);
  if (injectTestTone || inputMode !== "live") {
    resetLiveInputGateState(bandState, {
      inputMode,
      policy: acousticIntent,
      calibrationVersion,
    });
    return {
      active: false,
      hardSilence: false,
      invalid: false,
      invalidReason: "none",
    };
  }

  if (
    bandState.liveInputCalibrationVersion !== calibrationVersion ||
    bandState.liveInputMode !== "live" ||
    bandState.liveInputPolicy !== acousticIntent ||
    currentFrameAtMs < (bandState.liveInputPreviousFrameAtMs ?? 0)
  ) {
    beginLiveInputCalibration(bandState, currentFrameAtMs, acousticIntent, {
      calibrationVersion,
    });
  }

  const acousticIntentConfig = getLiveInputAcousticIntentConfig(acousticIntent);
  const metrics = computeLiveInputMetrics({
    avgAmplitude,
    rms,
    fftMagnitudes,
    sampleRate,
    fftSize,
    peakAmplitude: preModalFftPeak,
    spectralCentroid: spectralCentroidHint,
  });
  const deltaMs = getFrameDeltaMs(
    bandState.liveInputPreviousFrameAtMs,
    currentFrameAtMs,
  );
  bandState.liveInputMode = "live";
  bandState.liveInputPolicy = acousticIntent;
  bandState.liveInputPreviousFrameAtMs = currentFrameAtMs;

  if (bandState.liveInputCalibrationActive) {
    updateLiveInputCalibrationBaseline(bandState, metrics, deltaMs);
    if (
      currentFrameAtMs - bandState.liveInputCalibrationStartedAtMs <
      LIVE_INPUT_CALIBRATION_WINDOW_MS
    ) {
      return {
        active: true,
        hardSilence: true,
        invalid: bandState.liveInputCalibrationInvalid,
        invalidReason: bandState.liveInputCalibrationInvalidReason ?? "none",
      };
    }

    const calibrationInvalidReason = classifyLiveInputCalibrationInvalid(
      bandState,
      metrics,
    );
    if (calibrationInvalidReason !== "none") {
      beginLiveInputCalibration(bandState, currentFrameAtMs, acousticIntent, {
        calibrationVersion,
        invalid: true,
        invalidReason: calibrationInvalidReason,
      });
      return {
        active: true,
        hardSilence: true,
        invalid: true,
        invalidReason: calibrationInvalidReason,
      };
    }

    bandState.liveInputCalibrationActive = false;
    bandState.liveInputGateState = "closed";
    bandState.liveInputOpenFrames = 0;
    bandState.liveInputQuietFrames = 0;
    bandState.liveInputCalibrationInvalid = false;
    bandState.liveInputCalibrationInvalidReason = "none";
  }

  const invalidCalibrationReason = classifyLiveInputCalibrationInvalid(
    bandState,
    metrics,
  );
  if (invalidCalibrationReason !== "none") {
    beginLiveInputCalibration(bandState, currentFrameAtMs, acousticIntent, {
      calibrationVersion,
      invalid: true,
      invalidReason: invalidCalibrationReason,
    });
    return {
      active: true,
      hardSilence: true,
      invalid: true,
      invalidReason: invalidCalibrationReason,
    };
  }

  const hardGateActive =
    !injectTestTone &&
    inputMode === "live" &&
    detectLiveInputHardSilence(metrics, {
      hardSilenceAvg: acousticIntentConfig.absoluteAvgAmplitude,
      hardSilenceRms: acousticIntentConfig.absoluteRmsFloor,
      hardSilencePeak: acousticIntentConfig.absolutePeakFloor,
    }) &&
    metrics.spectralCentroid < acousticIntentConfig.absoluteCentroidFloor;
  const thresholds = deriveLiveInputThresholds(bandState, acousticIntentConfig);
  const hardSilence = detectLiveInputHardSilence(metrics, thresholds);

  if (hardSilence) {
    bandState.liveInputGateState = "closed";
    bandState.liveInputQuietFrames = 0;
    bandState.liveInputOpenFrames = 0;
    return {
      active: true,
      hardSilence: true,
      invalid: false,
      invalidReason: "none",
    };
  }

  if (bandState.liveInputGateState === "open") {
    if (
      !hardGateActive &&
      qualifiesLiveInputHold(metrics, thresholds, acousticIntent)
    ) {
      bandState.liveInputQuietFrames = 0;
      return {
        active: false,
        hardSilence: false,
        invalid: false,
        invalidReason: "none",
      };
    }

    bandState.liveInputQuietFrames += 1;
    if (bandState.liveInputQuietFrames < acousticIntentConfig.closeFrames) {
      return {
        active: false,
        hardSilence: false,
        invalid: false,
        invalidReason: "none",
      };
    }

    bandState.liveInputGateState = "closed";
    bandState.liveInputQuietFrames = 0;
    bandState.liveInputOpenFrames = 0;
    return {
      active: true,
      hardSilence: false,
      invalid: false,
      invalidReason: "none",
    };
  }

  if (
    !hardGateActive &&
    qualifiesLiveInputOpen(
      metrics,
      thresholds,
      acousticIntent,
      acousticIntentConfig,
    )
  ) {
    bandState.liveInputOpenFrames += 1;
    if (bandState.liveInputOpenFrames >= acousticIntentConfig.openFrames) {
      bandState.liveInputGateState = "open";
      bandState.liveInputOpenFrames = 0;
      bandState.liveInputQuietFrames = 0;
      return {
        active: false,
        hardSilence: false,
      };
    }
    return {
      active: true,
      hardSilence: false,
    };
  }

  bandState.liveInputOpenFrames = 0;
  return {
    active: true,
    hardSilence: false,
    invalid: false,
    invalidReason: "none",
  };
}

function computeBandEnergies(fftMagnitudes, sampleRate, fftSize) {
  const bands = new Float32Array(BAND_BUCKET_COUNT);
  if (!fftMagnitudes?.length || !sampleRate || !fftSize) {
    return bands;
  }

  const sums = new Float32Array(BAND_BUCKET_COUNT);
  const squareSums = new Float32Array(BAND_BUCKET_COUNT);
  const peaks = new Float32Array(BAND_BUCKET_COUNT);
  const counts = new Float32Array(BAND_BUCKET_COUNT);

  for (let i = 0; i < fftMagnitudes.length; i++) {
    const frequency = binIndexToFrequencyHz(
      i,
      fftMagnitudes.length,
      sampleRate,
    );
    const amplitude = fftMagnitudes[i] ?? 0;
    let bandIndex = BAND_BUCKET_COUNT - 1;
    for (let j = 0; j < BAND_LIMITS_HZ.length; j++) {
      if (frequency <= BAND_LIMITS_HZ[j]) {
        bandIndex = j;
        break;
      }
    }
    sums[bandIndex] += amplitude;
    squareSums[bandIndex] += amplitude * amplitude;
    peaks[bandIndex] = Math.max(peaks[bandIndex], amplitude);
    counts[bandIndex] += 1;
  }

  for (let i = 0; i < BAND_BUCKET_COUNT; i++) {
    if (counts[i] <= 0) {
      bands[i] = 0;
      continue;
    }

    const mean = sums[i] / counts[i];
    const rms = Math.sqrt(squareSums[i] / counts[i]);
    bands[i] = Math.min(1, Math.max(mean, rms * 0.55, peaks[i] * 0.18));
  }

  return bands;
}

function computeSpectralCentroid(fftMagnitudes, sampleRate) {
  if (!fftMagnitudes?.length || !sampleRate) return 0;

  const nyquist = sampleRate * 0.5;
  let weightedFrequency = 0;
  let amplitudeTotal = 0;
  for (let i = 0; i < fftMagnitudes.length; i++) {
    const amplitude = fftMagnitudes[i] ?? 0;
    if (amplitude <= 0) continue;
    const frequency = binIndexToFrequencyHz(
      i,
      fftMagnitudes.length,
      sampleRate,
    );
    weightedFrequency += frequency * amplitude;
    amplitudeTotal += amplitude;
  }

  if (amplitudeTotal <= 1e-6) return 0;
  return Math.min(1, weightedFrequency / amplitudeTotal / Math.max(1, nyquist));
}

function computeSignalSpectrumMetrics({
  fftMagnitudes,
  previousSpectrum,
  sampleRate,
  fftSize,
}) {
  const bandEnergies = new Float32Array(BAND_BUCKET_COUNT);
  const spectralBandEnergies = new Float32Array(SPECTRAL_BAND_6_COUNT);
  const empty = {
    bandEnergies,
    spectralBandEnergies,
    trebleBroadbandEnergy: 0,
    trebleTonalEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
  };
  if (!fftMagnitudes?.length) {
    return empty;
  }

  const hasFrequencyDomain = Boolean(sampleRate);
  const hasBandEnergyDomain = hasFrequencyDomain && Boolean(fftSize);
  const bandSums = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const bandSquareSums = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const bandPeaks = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const bandCounts = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const spectralSums = hasFrequencyDomain
    ? new Float32Array(SPECTRAL_BAND_6_COUNT)
    : null;
  const spectralCounts = hasFrequencyDomain
    ? new Float32Array(SPECTRAL_BAND_6_COUNT)
    : null;
  const fluxLimit = previousSpectrum?.length
    ? Math.min(fftMagnitudes.length, previousSpectrum.length)
    : 0;
  const nyquist = hasFrequencyDomain ? sampleRate * 0.5 : 0;
  let weightedFrequency = 0;
  let amplitudeTotal = 0;
  let positiveDelta = 0;
  let trebleSum = 0;
  let trebleLogSum = 0;
  let trebleCount = 0;
  let treblePeakEnergy = 0;

  for (let i = 0; i < fftMagnitudes.length; i += 1) {
    const amplitude = fftMagnitudes[i] ?? 0;

    if (i < fluxLimit) {
      const delta = amplitude - (previousSpectrum[i] ?? 0);
      if (delta > 0) positiveDelta += delta;
    }

    if (!hasFrequencyDomain) {
      continue;
    }

    const frequency = binIndexToFrequencyHz(
      i,
      fftMagnitudes.length,
      sampleRate,
    );
    if (amplitude > 0) {
      weightedFrequency += frequency * amplitude;
      amplitudeTotal += amplitude;
    }

    if (hasBandEnergyDomain) {
      let bandIndex = BAND_BUCKET_COUNT - 1;
      for (let j = 0; j < BAND_LIMITS_HZ.length; j += 1) {
        if (frequency <= BAND_LIMITS_HZ[j]) {
          bandIndex = j;
          break;
        }
      }
      bandSums[bandIndex] += amplitude;
      bandSquareSums[bandIndex] += amplitude * amplitude;
      bandPeaks[bandIndex] = Math.max(bandPeaks[bandIndex], amplitude);
      bandCounts[bandIndex] += 1;
    }

    let spectralBandIndex = SPECTRAL_BAND_6_COUNT - 1;
    for (let j = 0; j < SPECTRAL_BAND_6_LIMITS_HZ.length; j += 1) {
      if (frequency <= SPECTRAL_BAND_6_LIMITS_HZ[j]) {
        spectralBandIndex = j;
        break;
      }
    }
    spectralSums[spectralBandIndex] += amplitude;
    spectralCounts[spectralBandIndex] += 1;

    if (
      frequency >= TREBLE_FLATNESS_MIN_HZ &&
      frequency <= TREBLE_FLATNESS_MAX_HZ
    ) {
      trebleSum += amplitude;
      trebleLogSum += Math.log(Math.max(amplitude, 1e-8));
      trebleCount += 1;
      if (amplitude > treblePeakEnergy) treblePeakEnergy = amplitude;
    }
  }

  if (fluxLimit > 0) {
    empty.spectralFlux = Math.min(1, positiveDelta / Math.max(1, fluxLimit));
  }

  if (hasBandEnergyDomain) {
    for (let i = 0; i < BAND_BUCKET_COUNT; i += 1) {
      if (bandCounts[i] <= 0) {
        bandEnergies[i] = 0;
        continue;
      }

      const mean = bandSums[i] / bandCounts[i];
      const rms = Math.sqrt(bandSquareSums[i] / bandCounts[i]);
      bandEnergies[i] = Math.min(
        1,
        Math.max(mean, rms * 0.55, bandPeaks[i] * 0.18),
      );
    }
  }

  if (hasFrequencyDomain) {
    for (let i = 0; i < SPECTRAL_BAND_6_COUNT; i += 1) {
      spectralBandEnergies[i] =
        spectralCounts[i] > 0
          ? Math.min(1, spectralSums[i] / spectralCounts[i])
          : 0;
    }

    if (amplitudeTotal > 1e-6) {
      empty.spectralCentroid = Math.min(
        1,
        weightedFrequency / amplitudeTotal / Math.max(1, nyquist),
      );
    }

    let trebleFlatness = 0;
    let trebleMean = 0;
    if (trebleCount > 0) {
      trebleMean = trebleSum / trebleCount;
      const trebleGeometricMean = Math.exp(trebleLogSum / trebleCount);
      trebleFlatness =
        trebleMean > 1e-8 ? Math.min(1, trebleGeometricMean / trebleMean) : 0;
    }
    empty.trebleBroadbandEnergy = clamp01(trebleMean * trebleFlatness * 6);
    empty.trebleTonalEnergy = clamp01(
      treblePeakEnergy * (1 - trebleFlatness) * 4,
    );
  }

  return empty;
}

function deriveModeDeltaMetrics(modeSlots, referenceModeSlots, capacity) {
  const slotCount = Math.min(
    capacity,
    Math.floor((modeSlots?.length ?? 0) / 4),
    Math.floor((referenceModeSlots?.length ?? 0) / 4),
  );
  if (slotCount <= 0) {
    return {
      averageDelta: 0,
      turnoverRatio: 0,
    };
  }

  let deltaTotal = 0;
  let turnoverCount = 0;
  for (let i = 0; i < slotCount; i++) {
    const amplitude = modeSlots[i * 4 + 3] ?? 0;
    const referenceAmplitude = referenceModeSlots[i * 4 + 3] ?? 0;
    const delta = Math.abs(amplitude - referenceAmplitude);
    deltaTotal += delta;
    if (delta > 0.08 || amplitude > 0 !== referenceAmplitude > 0) {
      turnoverCount += 1;
    }
  }

  return {
    averageDelta: clamp01(deltaTotal / slotCount),
    turnoverRatio: clamp01(turnoverCount / slotCount),
  };
}

function summarizeActiveSlotAmplitudes(modeSlots, capacity) {
  const slotCount = Math.min(
    capacity,
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  if (slotCount <= 0) {
    return {
      activeModeCount: 0,
      averageSlotEnergy: 0,
      peakSlotEnergy: 0,
      upperSlotEnergy: 0,
    };
  }

  let activeCount = 0;
  let amplitudeTotal = 0;
  const amplitudes = [];
  for (let i = 0; i < slotCount; i += 1) {
    const amplitude = clamp01(modeSlots[i * 4 + 3] ?? 0);
    if (amplitude <= 0) {
      continue;
    }
    activeCount += 1;
    amplitudeTotal += amplitude;
    amplitudes.push(amplitude);
  }

  if (activeCount <= 0) {
    return {
      activeModeCount: 0,
      averageSlotEnergy: 0,
      peakSlotEnergy: 0,
      upperSlotEnergy: 0,
    };
  }

  amplitudes.sort((left, right) => right - left);
  const upperCount = Math.min(3, Math.max(1, Math.ceil(activeCount * 0.25)));
  let upperTotal = 0;
  for (let index = 0; index < upperCount; index += 1) {
    upperTotal += amplitudes[index] ?? 0;
  }

  return {
    activeModeCount: activeCount,
    averageSlotEnergy: clamp01(amplitudeTotal / activeCount),
    peakSlotEnergy: amplitudes[0] ?? 0,
    upperSlotEnergy: clamp01(upperTotal / upperCount),
  };
}

function sumSlotAmplitudeTotal(modeSlots, capacity) {
  const slotCount = Math.min(
    capacity,
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    total += Math.max(0, modeSlots[index * 4 + 3] ?? 0);
  }
  return total;
}

function scaleSlotAmplitudes(modeSlots, capacity, scale) {
  if (!(modeSlots instanceof Float32Array) || scale >= 1) {
    return;
  }

  const slotCount = Math.min(
    capacity,
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4 + 3;
    modeSlots[offset] = (modeSlots[offset] ?? 0) * scale;
  }
}

function buildModalFieldFrequencyOptions({
  radius,
  cavityAcousticScale,
  boundaryMode,
}) {
  return {
    acousticScale:
      cavityAcousticScale && typeof cavityAcousticScale === "object"
        ? cavityAcousticScale
        : { radiusMeters: radius },
    radiusMeters: radius,
    boundaryMode,
  };
}

function inferContinuousQualityFactor({ naturalFrequencyHz, u, v, w }) {
  const frequencyRatio =
    naturalFrequencyHz > 0
      ? naturalFrequencyHz / MODAL_FIELD_Q_FREQUENCY_REFERENCE_HZ
      : 0;
  const orderRatio = Math.hypot(u, v, w) / MODAL_FIELD_Q_ORDER_REFERENCE;
  const x = Math.max(0, frequencyRatio, orderRatio);
  const qualityFactor =
    MODAL_FIELD_Q_FALLBACK_BASE + (MODAL_FIELD_Q_FALLBACK_GAIN * x) / (1 + x);
  return clamp(
    Number.isFinite(qualityFactor)
      ? qualityFactor
      : MODAL_FIELD_Q_FALLBACK_BASE,
    MODAL_FIELD_Q_MIN,
    MODAL_FIELD_Q_MAX,
  );
}

function buildModalFieldMetadataSlot({
  sourceSlots,
  sourcePhaseSlots,
  sourceMetadataSlots,
  sourceOffset,
  frequencyOptions,
}) {
  const u = sourceSlots?.[sourceOffset] ?? 0;
  const v = sourceSlots?.[sourceOffset + 1] ?? 0;
  const w = sourceSlots?.[sourceOffset + 2] ?? 0;
  const coefficient = clamp01(sourceSlots?.[sourceOffset + 3] ?? 0);
  const explicitFrequency = sourceMetadataSlots?.[sourceOffset];
  const naturalFrequencyHz =
    Number.isFinite(explicitFrequency) && explicitFrequency > 0
      ? explicitFrequency
      : getCavityModeFrequency(u, v, w, frequencyOptions);
  const explicitQualityFactor = sourceMetadataSlots?.[sourceOffset + 1];
  const qualityFactor =
    Number.isFinite(explicitQualityFactor) && explicitQualityFactor > 0
      ? clamp(explicitQualityFactor, MODAL_FIELD_Q_MIN, MODAL_FIELD_Q_MAX)
      : inferContinuousQualityFactor({ naturalFrequencyHz, u, v, w });
  const explicitDampingRatio = sourceMetadataSlots?.[sourceOffset + 2];
  const dampingRatio =
    Number.isFinite(explicitDampingRatio) && explicitDampingRatio > 0
      ? explicitDampingRatio
      : 1 / (2 * qualityFactor);
  const phaseEvidence =
    clamp01(sourcePhaseSlots?.[sourceOffset + 2] ?? 0) *
    clamp01(sourcePhaseSlots?.[sourceOffset + 3] ?? 0);
  const explicitObservedSupport = sourceMetadataSlots?.[sourceOffset + 3];
  const observedSupport = clamp01(
    Math.max(
      coefficient,
      phaseEvidence,
      Number.isFinite(explicitObservedSupport) ? explicitObservedSupport : 0,
    ),
  );

  return {
    naturalFrequencyHz,
    qualityFactor,
    dampingRatio,
    observedSupport,
  };
}

function writeModalFieldCandidates({
  targetSlots,
  targetPhaseSlots,
  targetColorSlots,
  targetMetadataSlots,
  writeIndex,
  sourceSlots,
  sourcePhaseSlots,
  sourceColorSlots,
  sourceMetadataSlots,
  validCount,
  frequencyOptions,
}) {
  const slotCount = Math.floor((sourceSlots?.length ?? 0) / 4);
  const targetCount = Math.floor((targetSlots?.length ?? 0) / 4);
  const validLimit = Math.max(0, Math.floor(validCount ?? 0));
  let written = writeIndex;
  let seen = 0;

  for (
    let sourceIndex = 0;
    sourceIndex < slotCount && seen < validLimit && written < targetCount;
    sourceIndex += 1
  ) {
    const sourceOffset = sourceIndex * 4;
    const coefficient = sourceSlots?.[sourceOffset + 3] ?? 0;
    if (!(coefficient > 0)) {
      continue;
    }
    seen += 1;
    const targetOffset = written * 4;
    targetSlots[targetOffset] = sourceSlots?.[sourceOffset] ?? 0;
    targetSlots[targetOffset + 1] = sourceSlots?.[sourceOffset + 1] ?? 0;
    targetSlots[targetOffset + 2] = sourceSlots?.[sourceOffset + 2] ?? 0;
    targetSlots[targetOffset + 3] = coefficient;

    targetPhaseSlots[targetOffset] = sourcePhaseSlots?.[sourceOffset] ?? 0;
    targetPhaseSlots[targetOffset + 1] =
      sourcePhaseSlots?.[sourceOffset + 1] ?? 0;
    targetPhaseSlots[targetOffset + 2] =
      sourcePhaseSlots?.[sourceOffset + 2] ?? 0;
    targetPhaseSlots[targetOffset + 3] =
      sourcePhaseSlots?.[sourceOffset + 3] ?? 0;

    targetColorSlots[targetOffset] = sourceColorSlots?.[sourceOffset] ?? 0;
    targetColorSlots[targetOffset + 1] =
      sourceColorSlots?.[sourceOffset + 1] ?? 0;
    targetColorSlots[targetOffset + 2] =
      sourceColorSlots?.[sourceOffset + 2] ?? 0;
    targetColorSlots[targetOffset + 3] =
      sourceColorSlots?.[sourceOffset + 3] ?? 0;

    const metadata = buildModalFieldMetadataSlot({
      sourceSlots,
      sourcePhaseSlots,
      sourceMetadataSlots,
      sourceOffset,
      frequencyOptions,
    });
    targetMetadataSlots[targetOffset] = metadata.naturalFrequencyHz;
    targetMetadataSlots[targetOffset + 1] = metadata.qualityFactor;
    targetMetadataSlots[targetOffset + 2] = metadata.dampingRatio;
    targetMetadataSlots[targetOffset + 3] = metadata.observedSupport;
    written += 1;
  }

  return written;
}

function buildModalFieldDescriptorSource({
  candidateForcingSlots,
  candidateResponseSlots,
  sourceCoupledPhaseSlots,
  resonantPhaseSlots,
  sourceCoupledColorSlots,
  resonantColorSlots,
  sourceCoupledMetadataSlots = null,
  resonantMetadataSlots = null,
  activeSourceCoupledModeCount,
  activeResonantModeCount,
  radius,
  cavityAcousticScale,
  boundaryMode,
}) {
  const candidateCount =
    Math.max(0, Math.floor(activeSourceCoupledModeCount ?? 0)) +
    Math.max(0, Math.floor(activeResonantModeCount ?? 0));
  const slotLength = candidateCount * 4;
  const modalFieldSlots = new Float32Array(slotLength);
  const modalFieldPhaseSlots = new Float32Array(slotLength);
  const modalFieldColorSlots = new Float32Array(slotLength);
  const modalFieldMetadataSlots = new Float32Array(slotLength);
  const frequencyOptions = buildModalFieldFrequencyOptions({
    radius,
    cavityAcousticScale,
    boundaryMode,
  });
  let activeModalFieldModeCount = 0;

  activeModalFieldModeCount = writeModalFieldCandidates({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetColorSlots: modalFieldColorSlots,
    targetMetadataSlots: modalFieldMetadataSlots,
    writeIndex: activeModalFieldModeCount,
    sourceSlots: candidateForcingSlots,
    sourcePhaseSlots: sourceCoupledPhaseSlots,
    sourceColorSlots: sourceCoupledColorSlots,
    sourceMetadataSlots: sourceCoupledMetadataSlots,
    validCount: activeSourceCoupledModeCount,
    frequencyOptions,
  });
  activeModalFieldModeCount = writeModalFieldCandidates({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetColorSlots: modalFieldColorSlots,
    targetMetadataSlots: modalFieldMetadataSlots,
    writeIndex: activeModalFieldModeCount,
    sourceSlots: candidateResponseSlots,
    sourcePhaseSlots: resonantPhaseSlots,
    sourceColorSlots: resonantColorSlots,
    sourceMetadataSlots: resonantMetadataSlots,
    validCount: activeResonantModeCount,
    frequencyOptions,
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldColorSlots,
    modalFieldMetadataSlots,
    activeModalFieldModeCount,
  };
}

function emptyLowQSourceCoupledVisibility({ rejected = false } = {}) {
  return rejected
    ? {
        ...EMPTY_LOW_Q_SOURCE_COUPLED_VISIBILITY,
        lowQSourceCoupledVisibilityRejected: true,
      }
    : EMPTY_LOW_Q_SOURCE_COUPLED_VISIBILITY;
}

function deriveLowQSourceCoupledVisibilityAuthority({
  structuralMetrics = null,
  hardSilent = false,
  sourceNormalization = undefined,
  bandEnergies = null,
  activeSourceCoupledModeCount = 0,
} = {}) {
  const lowQSourceCoupledModeCount =
    structuralMetrics?.lowQSourceCoupledModeCount ?? 0;
  const lowQSourceCoupledEnergy = clamp01(
    structuralMetrics?.lowQSourceCoupledEnergy ?? 0,
  );
  const hasLowQSourceCoupledCandidate =
    lowQSourceCoupledModeCount > 0 ||
    lowQSourceCoupledEnergy > 0 ||
    activeSourceCoupledModeCount > 0;

  if (hardSilent || !structuralMetrics) {
    return emptyLowQSourceCoupledVisibility({
      rejected: hasLowQSourceCoupledCandidate,
    });
  }

  const modeCoherence = clamp01(structuralMetrics.modeCoherence ?? 0);
  const lowQObservedCoherence = clamp01(
    structuralMetrics.lowQObservedCoherence ?? 0,
  );
  const lowQCoherence = Math.max(lowQObservedCoherence, modeCoherence * 0.65);
  const lowQObservedSnr = clamp01(structuralMetrics.lowQObservedSnr ?? 0);
  const lowQObservedDrive = clamp01(structuralMetrics.lowQObservedDrive ?? 0);
  const normalizedRms = clamp01(sourceNormalization?.normalizedRms ?? 0);
  const normalizedAmplitude = clamp01(
    sourceNormalization?.normalizedAmplitude ?? 0,
  );
  const lowBandEnergy = clamp01(
    Math.max(bandEnergies?.[0] ?? 0, (bandEnergies?.[1] ?? 0) * 0.5),
  );
  const sourceSupport = Math.max(
    0.75 * lowBandEnergy,
    0.55 * normalizedRms,
    0.32 * normalizedAmplitude,
    0.8 * lowQObservedDrive,
  );
  const admittedLowQObservedMode =
    lowQSourceCoupledModeCount > 0 && lowQSourceCoupledEnergy > 0;
  const observedSnrGate = smoothstep(
    LOW_Q_SOURCE_COUPLED_VISIBILITY_SNR_START,
    LOW_Q_SOURCE_COUPLED_VISIBILITY_SNR_END,
    lowQObservedSnr,
  );
  const lowQEnergyGate = smoothstep(
    LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_START,
    LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_END,
    lowQSourceCoupledEnergy,
  );
  const lowQCoherenceGate = smoothstep(
    LOW_Q_SOURCE_COUPLED_VISIBILITY_COHERENCE_START,
    LOW_Q_SOURCE_COUPLED_VISIBILITY_COHERENCE_END,
    lowQCoherence,
  );
  const sourceSupportGate = smoothstep(
    LOW_Q_SOURCE_COUPLED_VISIBILITY_SOURCE_START,
    LOW_Q_SOURCE_COUPLED_VISIBILITY_SOURCE_END,
    sourceSupport,
  );
  const directSourceSnrGate = admittedLowQObservedMode
    ? sourceSupportGate *
      smoothstep(
        LOW_Q_SOURCE_COUPLED_DIRECT_SNR_ENERGY_START,
        LOW_Q_SOURCE_COUPLED_DIRECT_SNR_ENERGY_END,
        lowQSourceCoupledEnergy,
      ) *
      smoothstep(
        LOW_Q_SOURCE_COUPLED_DIRECT_SNR_COHERENCE_START,
        LOW_Q_SOURCE_COUPLED_DIRECT_SNR_COHERENCE_END,
        lowQCoherence,
      )
    : 0;
  const snrGate = admittedLowQObservedMode
    ? Math.max(
        LOW_Q_SOURCE_COUPLED_VISIBILITY_SNR_FLOOR,
        observedSnrGate,
        directSourceSnrGate,
      )
    : observedSnrGate;
  const authority = clamp01(
    lowQEnergyGate *
      lowQCoherenceGate *
      snrGate *
      sourceSupportGate *
      smoothstep(0, 2, activeSourceCoupledModeCount),
  );

  return {
    lowQSourceCoupledVisibilityAuthority: authority,
    lowQSourceCoupledVisibilityEnergy:
      LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_MAX * authority,
    lowQSourceCoupledTopologyFloor:
      LOW_Q_SOURCE_COUPLED_TOPOLOGY_FLOOR_MAX * authority,
    lowQSourceCoupledSourceSupport: sourceSupport,
    lowQSourceCoupledVisibilityRejected: Boolean(
      hasLowQSourceCoupledCandidate && authority <= 0,
    ),
  };
}

function deriveModalObserverVisibilityComponents({
  structuralMetrics = null,
  hardSilent = false,
  sourceNormalization = undefined,
  bandEnergies = null,
  activeSourceCoupledModeCount = 0,
  nonZeroFFTBinCount = 0,
  periodicity = 0,
} = {}) {
  if (hardSilent || !structuralMetrics) {
    return EMPTY_MODAL_OBSERVER_VISIBILITY;
  }

  const modeCoherence = clamp01(structuralMetrics.modeCoherence ?? 0);
  const modalPersistence = clamp01(structuralMetrics.modalPersistence ?? 0);
  const highQResonantModeCount = structuralMetrics.highQResonantModeCount ?? 0;
  const highQResonantEnergy = clamp01(
    structuralMetrics.highQResonantEnergy ?? 0,
  );
  const highQRingSupport = clamp01(structuralMetrics.highQRingSupport ?? 0);
  const highQObservedCoherence = clamp01(
    structuralMetrics.highQObservedCoherence ?? modeCoherence,
  );
  const highQObservedSnr = clamp01(structuralMetrics.highQObservedSnr ?? 0);
  const highQAuthority = deriveHighQSparseResonatorAuthority({
    highQObservedSnr,
    highQObservedCoherence,
    highQObservedDrive: structuralMetrics.highQObservedDrive ?? 0,
    highQRingSupport,
    highQResonantEnergy,
    distributedExcitation: structuralMetrics.distributedExcitation ?? 0,
    periodicity,
    nonZeroFFTBinCount,
    modeCoherence,
  });
  const highQSignalSupport = Math.max(
    highQRingSupport,
    highQObservedSnr * 0.18,
    highQObservedCoherence * 0.08,
  );
  const highQEnergyGate = smoothstep(
    MODAL_OBSERVER_HIGH_Q_ENERGY_START,
    MODAL_OBSERVER_HIGH_Q_ENERGY_END,
    highQResonantEnergy,
  );
  const highQSupportGate = smoothstep(
    MODAL_OBSERVER_HIGH_Q_SUPPORT_START,
    MODAL_OBSERVER_HIGH_Q_SUPPORT_END,
    highQSignalSupport,
  );
  const highQCountGate = smoothstep(1, 4, highQResonantModeCount);
  const highQQuality = Math.max(
    highQObservedCoherence,
    modeCoherence * 0.75,
    modalPersistence * 0.45,
  );
  const highQObserverVisibilityEnergy = clamp01(
    highQEnergyGate *
      highQSupportGate *
      highQCountGate *
      highQQuality *
      highQAuthority.highQSparseResonatorAuthority *
      MODAL_OBSERVER_HIGH_Q_MAX,
  );

  const lowQSourceCoupledModeCount =
    structuralMetrics.lowQSourceCoupledModeCount ?? 0;
  const lowQSourceCoupledEnergy = clamp01(
    structuralMetrics.lowQSourceCoupledEnergy ?? 0,
  );
  const lowQObservedCoherence = clamp01(
    structuralMetrics.lowQObservedCoherence ?? modeCoherence,
  );
  const lowQObservedSnr = clamp01(structuralMetrics.lowQObservedSnr ?? 0);
  const lowQSignalSupport = Math.max(0.35, lowQObservedSnr);
  const lowQEnergyGate = smoothstep(
    MODAL_OBSERVER_LOW_Q_ENERGY_START,
    MODAL_OBSERVER_LOW_Q_ENERGY_END,
    lowQSourceCoupledEnergy,
  );
  const lowQCountGate = smoothstep(0, 3, lowQSourceCoupledModeCount);
  const lowQQuality = Math.max(
    lowQObservedCoherence,
    modeCoherence * 0.65,
    modalPersistence * 0.35,
  );
  const lowQObserverVisibilityEnergy = clamp01(
    lowQEnergyGate *
      lowQCountGate *
      lowQSignalSupport *
      lowQQuality *
      MODAL_OBSERVER_LOW_Q_MAX,
  );
  const lowQSourceCoupledVisibility =
    deriveLowQSourceCoupledVisibilityAuthority({
      structuralMetrics,
      hardSilent,
      sourceNormalization,
      bandEnergies,
      activeSourceCoupledModeCount,
    });

  const resonantSlotFloorTotal = Math.min(
    MODAL_OBSERVER_RESONANT_SLOT_FLOOR_TOTAL_MAX,
    highQObserverVisibilityEnergy * 0.055,
  );
  const lowQObserverSourceCoupledSlotFloorTotal = Math.min(
    MODAL_OBSERVER_SOURCE_COUPLED_SLOT_FLOOR_TOTAL_MAX,
    lowQObserverVisibilityEnergy * 0.045,
  );
  const sourceCoupledSlotFloorTotal = Math.max(
    lowQObserverSourceCoupledSlotFloorTotal,
    lowQSourceCoupledVisibility.lowQSourceCoupledTopologyFloor,
  );
  const modalObserverTopologyFloor = Math.max(
    resonantSlotFloorTotal,
    sourceCoupledSlotFloorTotal,
  );

  return {
    modalObserverVisibilityEnergy: clamp01(
      Math.max(
        highQObserverVisibilityEnergy,
        lowQObserverVisibilityEnergy,
        lowQSourceCoupledVisibility.lowQSourceCoupledVisibilityEnergy,
      ),
    ),
    highQObserverVisibilityEnergy,
    lowQObserverVisibilityEnergy,
    modalObserverTopologyFloor,
    resonantSlotFloorTotal,
    sourceCoupledSlotFloorTotal,
    ...lowQSourceCoupledVisibility,
    ...highQAuthority,
  };
}

function deriveModalVisibilityComponents({
  modeSlots,
  modeCapacity,
  structuralMetrics = null,
  hardSilent = false,
  sourceNormalization = undefined,
  bandEnergies = null,
  activeSourceCoupledModeCount = 0,
  nonZeroFFTBinCount = 0,
  periodicity = 0,
}) {
  const emptySummary = {
    activeModeCount: 0,
    averageSlotEnergy: 0,
    peakSlotEnergy: 0,
    upperSlotEnergy: 0,
    distributedModalVisibility: 0,
    dominantModalVisibility: 0,
    modalVisibilityEnergy: 0,
    modalObserverVisibilityEnergy: 0,
    highQObserverVisibilityEnergy: 0,
    lowQObserverVisibilityEnergy: 0,
    modalObserverTopologyFloor: 0,
    ...EMPTY_LOW_Q_SOURCE_COUPLED_VISIBILITY,
    retainedHighQModalVisibility: 0,
    highQSparseResonatorAuthority: 0,
    highQProjectionLoad: 0,
    highQRetainedVisibilityRejected: false,
  };

  if (hardSilent) {
    return emptySummary;
  }

  const slotSummary = summarizeActiveSlotAmplitudes(modeSlots, modeCapacity);
  const activeModeCount = slotSummary.activeModeCount;
  if (activeModeCount <= 0) {
    return emptySummary;
  }
  const hasRenderAuthoritativeEnergy =
    structuralMetrics?.modalResponseRenderEnergy != null;
  const renderAuthoritativeEnergy = hasRenderAuthoritativeEnergy
    ? clamp01(structuralMetrics.modalResponseRenderEnergy)
    : null;
  if (hasRenderAuthoritativeEnergy && renderAuthoritativeEnergy <= 0) {
    return {
      ...emptySummary,
      ...slotSummary,
    };
  }

  const observerVisibility = deriveModalObserverVisibilityComponents({
    structuralMetrics,
    hardSilent,
    sourceNormalization,
    bandEnergies,
    activeSourceCoupledModeCount,
    nonZeroFFTBinCount,
    periodicity,
  });
  const slotEnergy = slotSummary.averageSlotEnergy;
  const modalDriveEnergy = clamp01(structuralMetrics?.modalDriveEnergy ?? 0);
  const modalPersistence = clamp01(structuralMetrics?.modalPersistence ?? 0);
  const resonatorCoherence = clamp01(structuralMetrics?.modeCoherence ?? 0);
  const distributedExcitation = clamp01(
    structuralMetrics?.distributedExcitation ?? 0,
  );
  const highQResonantModeCount = structuralMetrics?.highQResonantModeCount ?? 0;
  const highQResonantEnergy = clamp01(
    structuralMetrics?.highQResonantEnergy ?? 0,
  );
  const highQRingSupport = clamp01(structuralMetrics?.highQRingSupport ?? 0);
  const highQObservedCoherence = clamp01(
    structuralMetrics?.highQObservedCoherence ?? resonatorCoherence,
  );
  const highQSparseResonatorAuthority = clamp01(
    observerVisibility.highQSparseResonatorAuthority,
  );
  const highQSustainedVisibilityScale = smoothstep(
    0.06,
    0.18,
    highQResonantEnergy,
  );
  const hasRetainedHighQObserverAuthority =
    highQResonantModeCount >= 2 &&
    highQResonantEnergy > 0 &&
    highQRingSupport > 0 &&
    highQObservedCoherence > 0;
  if (
    modalPersistence <= MODAL_VISIBILITY_PERSISTENCE_START &&
    modalDriveEnergy < 0.09 &&
    !hasRetainedHighQObserverAuthority
  ) {
    return {
      ...slotSummary,
      distributedModalVisibility: 0,
      dominantModalVisibility: 0,
      modalVisibilityEnergy: 0,
      ...observerVisibility,
      retainedHighQModalVisibility: 0,
    };
  }
  const slotEnergyGate = smoothstep(
    MODAL_VISIBILITY_SLOT_ENERGY_START,
    MODAL_VISIBILITY_SLOT_ENERGY_END,
    slotEnergy,
  );
  const driveGate = smoothstep(
    MODAL_VISIBILITY_DRIVE_START,
    MODAL_VISIBILITY_DRIVE_END,
    Math.max(modalDriveEnergy, slotEnergy * 0.35),
  );
  const coherenceGate = smoothstep(
    MODAL_VISIBILITY_COHERENCE_START,
    MODAL_VISIBILITY_COHERENCE_END,
    resonatorCoherence,
  );
  const persistenceGate = smoothstep(
    MODAL_VISIBILITY_PERSISTENCE_START,
    MODAL_VISIBILITY_PERSISTENCE_END,
    modalPersistence,
  );
  const occupancyGate = smoothstep(
    0.02,
    0.12,
    activeModeCount / Math.max(1, modeCapacity),
  );
  const modalQuality = Math.max(coherenceGate, persistenceGate * 0.75);
  const distributedReduction =
    1 - distributedExcitation * MODAL_VISIBILITY_DISTRIBUTED_REDUCTION;
  const highQVisibilityGate =
    smoothstep(
      MODAL_VISIBILITY_HIGH_Q_ENERGY_START,
      MODAL_VISIBILITY_HIGH_Q_ENERGY_END,
      highQResonantEnergy * highQRingSupport,
    ) *
    smoothstep(2, 5, highQResonantModeCount) *
    modalQuality *
    highQSustainedVisibilityScale *
    highQSparseResonatorAuthority;
  const retainedHighQObserverSupport =
    MODAL_VISIBILITY_HIGH_Q_OBSERVER_MIN_SUPPORT_WEIGHT +
    highQSparseResonatorAuthority * 0.08 +
    smoothstep(
      MODAL_VISIBILITY_HIGH_Q_OBSERVER_SUPPORT_START,
      MODAL_VISIBILITY_HIGH_Q_OBSERVER_SUPPORT_END,
      highQRingSupport,
    ) *
      (1 - MODAL_VISIBILITY_HIGH_Q_OBSERVER_MIN_SUPPORT_WEIGHT - 0.08);
  const retainedHighQObserverQuality = Math.max(
    highQObservedCoherence,
    coherenceGate * 0.9,
    persistenceGate * 0.55,
  );
  const retainedHighQObserverAuthority =
    smoothstep(
      MODAL_VISIBILITY_HIGH_Q_OBSERVER_ENERGY_START,
      MODAL_VISIBILITY_HIGH_Q_OBSERVER_ENERGY_END,
      highQResonantEnergy,
    ) *
    smoothstep(1, 4, highQResonantModeCount) *
    retainedHighQObserverSupport *
    retainedHighQObserverQuality *
    highQSparseResonatorAuthority;
  const retainedHighQModalVisibility = clamp01(
    Math.max(
      retainedHighQObserverAuthority * MODAL_VISIBILITY_HIGH_Q_RETAINED_MAX,
      observerVisibility.highQObserverVisibilityEnergy *
        MODAL_VISIBILITY_HIGH_Q_RETAINED_MAX *
        0.68,
    ),
  );
  const distributedEnergyAnchor = smoothstep(
    0.015,
    0.16,
    Math.max(slotEnergy, modalDriveEnergy * 0.65),
  );
  const distributedClarityScale = 0.76 + distributedEnergyAnchor * 0.24;

  const distributedModalVisibility = clamp01(
    (slotEnergyGate * 0.34 +
      driveGate * 0.3 +
      persistenceGate * 0.22 +
      coherenceGate * 0.14) *
      modalQuality *
      (0.55 + occupancyGate * 0.45) *
      distributedReduction *
      distributedClarityScale,
  );
  const dominantSlotEnergy =
    slotSummary.upperSlotEnergy * 0.7 + slotSummary.peakSlotEnergy * 0.3;
  const dominantSlotGate = smoothstep(0.008, 0.11, dominantSlotEnergy);
  const sparseClusterGate =
    1 - smoothstep(0.48, 0.82, activeModeCount / Math.max(1, modeCapacity));
  const dominantQuality = Math.max(coherenceGate * 0.75, persistenceGate);
  const dominantModalVisibility = clamp01(
    dominantSlotGate *
      dominantQuality *
      (0.55 + sparseClusterGate * 0.35) *
      distributedReduction *
      0.28,
  );

  return {
    ...slotSummary,
    distributedModalVisibility,
    dominantModalVisibility,
    modalVisibilityEnergy: clamp01(
      Math.max(
        distributedModalVisibility,
        dominantModalVisibility,
        highQVisibilityGate * MODAL_VISIBILITY_HIGH_Q_MAX,
      ),
    ),
    modalObserverVisibilityEnergy:
      observerVisibility.modalObserverVisibilityEnergy,
    highQObserverVisibilityEnergy:
      observerVisibility.highQObserverVisibilityEnergy,
    lowQObserverVisibilityEnergy:
      observerVisibility.lowQObserverVisibilityEnergy,
    modalObserverTopologyFloor: observerVisibility.modalObserverTopologyFloor,
    lowQSourceCoupledVisibilityAuthority:
      observerVisibility.lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledVisibilityEnergy:
      observerVisibility.lowQSourceCoupledVisibilityEnergy,
    lowQSourceCoupledTopologyFloor:
      observerVisibility.lowQSourceCoupledTopologyFloor,
    lowQSourceCoupledSourceSupport:
      observerVisibility.lowQSourceCoupledSourceSupport,
    lowQSourceCoupledVisibilityRejected:
      observerVisibility.lowQSourceCoupledVisibilityRejected,
    retainedHighQModalVisibility,
    highQSparseResonatorAuthority,
    highQProjectionLoad: observerVisibility.highQProjectionLoad,
    highQRetainedVisibilityRejected:
      observerVisibility.highQRetainedVisibilityRejected,
  };
}

function deriveCompositeSignals({
  inputMode,
  modeCapacity,
  signalNormalizationSlots,
  modeSlots,
  visibilityModeSlots = modeSlots,
  referenceModeSlots,
  sourceCoupledState,
  resonantState,
  bandEnergies,
  analyserRms,
  avgAmplitude,
  dominantAmplitude,
  spectralCentroid,
  spectralFlux,
  transientEnergy,
  beatDetected,
  beatStrength,
  beatConfidence,
  beatOnsetDriver,
  beatThreshold,
  bandState,
  structuralMetrics = null,
  sourceNormalization = undefined,
  liveInputHardSilenceActive = false,
  activeSourceCoupledModeCount = 0,
  nonZeroFFTBinCount = 0,
}) {
  const activeModeCount = countActiveSlots(modeSlots, modeCapacity);
  const uniqueModeCount =
    (sourceCoupledState?.uniqueModeCount ?? 0) +
    (resonantState?.uniqueModeCount ?? 0);
  const harmonicSupport = averageArray(sourceCoupledState?.harmonicSupport);
  const bandDistribution =
    (bandEnergies?.reduce(
      (count, energy) => count + ((energy ?? 0) > 0.04 ? 1 : 0),
      0,
    ) ?? 0) / Math.max(1, bandEnergies?.length ?? 1);
  const { averageDelta, turnoverRatio } = deriveModeDeltaMetrics(
    modeSlots,
    referenceModeSlots,
    modeCapacity,
  );
  const { normalizedRms, normalizedAmplitude, normalizedCentroid } =
    sourceNormalization ??
    getSourceNormalization({
      inputMode,
      avgAmplitude,
      analyserRms,
      spectralCentroid,
      bandState,
    });

  // energyCoupling: scale mode-count terms with RMS so the gate deflates
  // during genuine fades rather than being propped open by slowly-releasing
  // source-coupled modes. Floor of 0.12 keeps some readout at moderate volumes.
  const energyCoupling = Math.sqrt(Math.max(normalizedRms, 0.12));
  const modalPersistence = clamp01(structuralMetrics?.modalPersistence ?? 0);
  const distributedExcitation = clamp01(
    structuralMetrics?.distributedExcitation ?? 0,
  );
  const resonatorCoherence = clamp01(structuralMetrics?.modeCoherence ?? 0);
  const lowBandStructureSupport = clamp01(
    (bandEnergies?.[0] ?? 0) * 3 + (bandEnergies?.[1] ?? 0) * 2,
  );
  const structureSignal = clamp01(
    (activeModeCount / Math.max(1, signalNormalizationSlots * 0.55)) *
      0.36 *
      energyCoupling +
      (uniqueModeCount / Math.max(1, signalNormalizationSlots * 0.7)) *
        0.26 *
        energyCoupling +
      harmonicSupport * 0.2 * energyCoupling +
      modalPersistence * 0.06 * energyCoupling +
      lowBandStructureSupport * 0.08,
  );
  // modeCoherence: pure structural quality — NOT energy-coupled. High when
  // modes are stable and harmonic with low churn. Used to distinguish
  // coherent treble (filament structure) from incoherent broadband noise.
  const modeCoherence = clamp01(
    (activeModeCount / Math.max(1, signalNormalizationSlots)) * 0.24 +
      (uniqueModeCount / Math.max(1, signalNormalizationSlots)) * 0.2 +
      harmonicSupport * 0.18 +
      (1 - Math.min(1, turnoverRatio * 3)) * 0.08 +
      modalPersistence * 0.08 +
      resonatorCoherence * 0.2 -
      distributedExcitation * 0.14,
  );
  const energySignal = clamp01(
    normalizedRms * 0.42 +
      normalizedAmplitude * 0.26 +
      averageArray(bandEnergies) * 0.16 +
      (bandEnergies?.[0] ?? 0) * 0.06 +
      clamp01(dominantAmplitude) * 0.12,
  );
  const changeBreakdown = {
    flux: clamp01(spectralFlux * 8) * 0.28,
    hit: transientEnergy * 0.26,
    slotDelta: averageDelta * 0.2,
    turnover: turnoverRatio * 0.16,
    timbre:
      clamp01(Math.abs(normalizedCentroid - bandDistribution) * 1.2) * 0.1,
    hint: 0,
  };
  const changeSignal = clamp01(
    changeBreakdown.flux +
      changeBreakdown.hit +
      changeBreakdown.slotDelta +
      changeBreakdown.turnover +
      changeBreakdown.timbre +
      changeBreakdown.hint,
  );
  const pulseDriver = beatThreshold > 0 ? beatOnsetDriver / beatThreshold : 0;
  const pulseSignal = clamp01(
    (beatDetected ? beatStrength * 0.56 + beatConfidence * 0.24 : 0) +
      clamp01(pulseDriver * 0.22),
  );
  const modalVisibilityComponents = deriveModalVisibilityComponents({
    modeSlots: visibilityModeSlots,
    modeCapacity,
    structuralMetrics,
    hardSilent: liveInputHardSilenceActive,
    sourceNormalization,
    bandEnergies,
    activeSourceCoupledModeCount,
    nonZeroFFTBinCount,
    periodicity: sourceCoupledState?.candidatePeriodicity ?? 0,
  });
  const modalVisibilityEnergy = modalVisibilityComponents.modalVisibilityEnergy;
  const modalObserverVisibilityEnergy =
    modalVisibilityComponents.modalObserverVisibilityEnergy ?? 0;
  const modalVisibilityRetainedHighQEnergy =
    modalVisibilityComponents.retainedHighQModalVisibility ?? 0;
  const lowQSourceCoupledVisibilityAuthority =
    modalVisibilityComponents.lowQSourceCoupledVisibilityAuthority ?? 0;
  const lowQSourceCoupledVisibilityEnergy =
    modalVisibilityComponents.lowQSourceCoupledVisibilityEnergy ?? 0;
  const lowQSourceCoupledTopologyFloor =
    modalVisibilityComponents.lowQSourceCoupledTopologyFloor ?? 0;
  const lowQSourceCoupledSourceSupport =
    modalVisibilityComponents.lowQSourceCoupledSourceSupport ?? 0;
  const lowQSourceCoupledVisibilityRejected = Boolean(
    modalVisibilityComponents.lowQSourceCoupledVisibilityRejected,
  );

  if (inputMode === "live") {
    return {
      structureSignal: clamp01(
        structureSignal * LIVE_INPUT_STRUCTURE_RESPONSE_SCALE,
      ),
      energySignal: clamp01(energySignal * LIVE_INPUT_ENERGY_RESPONSE_SCALE),
      changeSignal: clamp01(changeSignal * LIVE_INPUT_CHANGE_RESPONSE_SCALE),
      pulseSignal: clamp01(pulseSignal * LIVE_INPUT_PULSE_RESPONSE_SCALE),
      modeCoherence,
      modalVisibilityEnergy,
      modalObserverVisibilityEnergy,
      modalVisibilityRetainedHighQEnergy,
      lowQSourceCoupledVisibilityAuthority,
      lowQSourceCoupledVisibilityEnergy,
      lowQSourceCoupledTopologyFloor,
      lowQSourceCoupledSourceSupport,
      lowQSourceCoupledVisibilityRejected,
      changeBreakdown,
    };
  }

  return {
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    modeCoherence,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledVisibilityEnergy,
    lowQSourceCoupledTopologyFloor,
    lowQSourceCoupledSourceSupport,
    lowQSourceCoupledVisibilityRejected,
    changeBreakdown,
  };
}

function recordBeatTimestamp(bandState, currentFrameAtMs) {
  const idx = bandState.beatTimestampWriteIdx % BEAT_HISTORY_SIZE_LOCAL;
  bandState.beatTimestamps[idx] = currentFrameAtMs;
  bandState.beatTimestampWriteIdx += 1;
  bandState.beatTimestampCount = Math.min(
    bandState.beatTimestampCount + 1,
    BEAT_HISTORY_SIZE_LOCAL,
  );
}

function updateBandSignalState({
  analysisMemory,
  fftMagnitudes,
  sampleRate,
  fftSize,
  rms,
  frameTimeMs,
  beatSettings,
}) {
  const previousSpectrum = analysisMemory.previousSpectrum;
  const bandState = analysisMemory.bandState;
  if (
    Number.isFinite(frameTimeMs) &&
    frameTimeMs >= 0 &&
    Number.isFinite(bandState.previousFrameAtMs) &&
    bandState.previousFrameAtMs > frameTimeMs
  ) {
    resetBeatTrackingState(analysisMemory);
  }
  const {
    bandEnergies,
    spectralBandEnergies,
    trebleBroadbandEnergy,
    trebleTonalEnergy,
    spectralCentroid,
    spectralFlux,
  } = computeSignalSpectrumMetrics({
    fftMagnitudes,
    previousSpectrum,
    sampleRate,
    fftSize,
  });
  const rmsDelta = Math.max(0, rms - (bandState.previousRms ?? 0));
  const transientEnergy = Math.min(1, spectralFlux * 0.75 + rmsDelta * 0.25);
  const resolvedBeatSettings = {
    ...BEAT_DEFAULTS,
    ...beatSettings,
  };
  const lowBandEnergy =
    (bandEnergies[0] ?? 0) * LOW_BAND_PRIMARY_WEIGHT +
    (bandEnergies[1] ?? 0) * LOW_BAND_SECONDARY_WEIGHT;
  const lowBandRise = Math.max(
    0,
    lowBandEnergy - (bandState.previousLowBandEnergy ?? 0),
  );
  const onsetDriver = clamp01(
    lowBandRise * BEAT_LOW_BAND_RISE_WEIGHT +
      spectralFlux * BEAT_SPECTRAL_FLUX_WEIGHT +
      rmsDelta * BEAT_RMS_DELTA_WEIGHT,
  );
  const currentFrameAtMs =
    Number.isFinite(frameTimeMs) && frameTimeMs >= 0
      ? frameTimeMs
      : getFrameTimestamp();
  const deltaMs = getFrameDeltaMs(
    bandState.previousFrameAtMs,
    currentFrameAtMs,
  );
  const thresholdAlpha = computeEmaAlpha(
    deltaMs,
    resolvedBeatSettings.thresholdSmoothingMs,
  );
  const nextThresholdEma =
    (bandState.onsetThresholdEma ?? 0) +
    (onsetDriver - (bandState.onsetThresholdEma ?? 0)) * thresholdAlpha;
  const adaptiveThreshold = Math.max(
    MIN_BEAT_THRESHOLD,
    (bandState.onsetThresholdEma ?? 0) *
      (1 + 0.25 * resolvedBeatSettings.beatSensitivity),
  );
  const refractorySatisfied =
    currentFrameAtMs -
      (bandState.previousBeatAtMs ?? Number.NEGATIVE_INFINITY) >=
    resolvedBeatSettings.refractoryMs;
  const onsetExcess = clamp01(
    (onsetDriver - adaptiveThreshold) / Math.max(1e-4, 1 - adaptiveThreshold),
  );
  const beatConfidence = clamp01(onsetExcess * 0.75 + lowBandEnergy * 0.25);
  const beatDetected =
    onsetDriver > adaptiveThreshold &&
    lowBandEnergy >= resolvedBeatSettings.lowBandFloor &&
    refractorySatisfied;
  const beatStrength = beatDetected
    ? clamp01(lowBandEnergy * 0.6 + beatConfidence * 0.4)
    : 0;

  analysisMemory.bandEnergies.set(bandEnergies);
  bandState.bandEnergies.set(bandEnergies);
  bandState.spectralCentroid = spectralCentroid;
  bandState.spectralFlux = spectralFlux;
  bandState.transientEnergy = transientEnergy;
  bandState.previousRms = rms;
  bandState.lowBandEnergy = lowBandEnergy;
  bandState.lowBandEnergyEma =
    (bandState.lowBandEnergyEma ?? 0) +
    (lowBandEnergy - (bandState.lowBandEnergyEma ?? 0)) * thresholdAlpha;
  bandState.previousLowBandEnergy = lowBandEnergy;
  bandState.onsetDriver = onsetDriver;
  bandState.onsetThresholdEma = nextThresholdEma;
  bandState.previousFrameAtMs = currentFrameAtMs;
  bandState.beatSensitivity = resolvedBeatSettings.beatSensitivity;
  bandState.beatConfidence = beatConfidence;
  bandState.beatStrength = beatStrength;
  if (beatDetected) {
    bandState.previousBeatAtMs = currentFrameAtMs;
    bandState.beatPulseId = (bandState.beatPulseId ?? 0) + 1;
  }

  if (beatDetected) {
    recordBeatTimestamp(bandState, currentFrameAtMs);
  }

  if (
    !(previousSpectrum instanceof Float32Array) ||
    previousSpectrum.length !== fftMagnitudes.length
  ) {
    analysisMemory.previousSpectrum = new Float32Array(fftMagnitudes.length);
  }
  analysisMemory.previousSpectrum.set(fftMagnitudes);

  return {
    bandEnergies: analysisMemory.bandEnergies,
    spectralBandEnergies,
    trebleBroadbandEnergy,
    trebleTonalEnergy,
    spectralCentroid,
    spectralFlux,
    transientEnergy,
    beatDetected,
    beatPulseId: bandState.beatPulseId ?? 0,
    beatStrength,
    beatConfidence,
    beatLowBandEnergy: lowBandEnergy,
    beatOnsetDriver: onsetDriver,
    beatThreshold: adaptiveThreshold,
    currentFrameAtMs,
    deltaMs,
  };
}

function updateTempoTrackingState(bandState, beatConfidence, currentFrameAtMs) {
  if (bandState.beatTimestampCount >= 2) {
    const ibis = [];
    const n = Math.min(bandState.beatTimestampCount, BEAT_HISTORY_SIZE_LOCAL);
    for (let i = 1; i < n; i += 1) {
      const wi = bandState.beatTimestampWriteIdx;
      const a =
        bandState.beatTimestamps[
          (wi - i - 1 + BEAT_HISTORY_SIZE_LOCAL) % BEAT_HISTORY_SIZE_LOCAL
        ];
      const b =
        bandState.beatTimestamps[
          (wi - i + BEAT_HISTORY_SIZE_LOCAL) % BEAT_HISTORY_SIZE_LOCAL
        ];
      const ibi = b - a;
      if (ibi >= MIN_IBI_MS && ibi <= MAX_IBI_MS) {
        ibis.push(ibi);
      }
    }
    if (ibis.length >= 1) {
      ibis.sort((x, y) => x - y);
      const medianIbi = ibis[Math.floor(ibis.length / 2)];
      const newBpm = 60000 / medianIbi;
      const alpha =
        TEMPO_EMA_SLOW +
        (TEMPO_EMA_FAST - TEMPO_EMA_SLOW) * clamp01(beatConfidence);
      bandState.tempoEma =
        bandState.tempoEma === 0
          ? newBpm
          : bandState.tempoEma + (newBpm - bandState.tempoEma) * alpha;
      bandState.estimatedTempo = bandState.tempoEma;
      bandState.tempoConfidence = clamp01(
        ibis.length / (BEAT_HISTORY_SIZE_LOCAL - 1),
      );
    }
  }

  if (
    bandState.estimatedTempo > 0 &&
    Number.isFinite(bandState.previousBeatAtMs)
  ) {
    const msSince = Math.max(0, currentFrameAtMs - bandState.previousBeatAtMs);
    const periodMs = 60000 / bandState.estimatedTempo;
    bandState.beatPhase = clamp01(msSince / periodMs);
  }

  return {
    estimatedTempo: bandState.estimatedTempo,
    tempoConfidence: bandState.tempoConfidence,
    beatPhase: bandState.beatPhase,
  };
}

function computeRhythmicDensity(bandState, deltaMs, currentFrameAtMs) {
  const n = Math.min(bandState.beatTimestampCount, BEAT_HISTORY_SIZE_LOCAL);
  let beatsInWindow = 0;
  const windowStart = currentFrameAtMs - ONSET_DENSITY_WINDOW_MS;
  for (let i = 0; i < n; i += 1) {
    const idx =
      (bandState.beatTimestampWriteIdx - 1 - i + BEAT_HISTORY_SIZE_LOCAL) %
      BEAT_HISTORY_SIZE_LOCAL;
    if (bandState.beatTimestamps[idx] >= windowStart) {
      beatsInWindow += 1;
    }
  }
  const rawDensity = beatsInWindow / ONSET_DENSITY_MAX_BEATS;
  const alpha = computeEmaAlpha(deltaMs, ONSET_DENSITY_SMOOTHING_MS);
  bandState.onsetDensityEma += (rawDensity - bandState.onsetDensityEma) * alpha;
  return clamp01(bandState.onsetDensityEma);
}

export function updateAudioFeatureTempoState({
  bandState,
  beatConfidence,
  currentFrameAtMs,
  deltaMs,
}) {
  const { estimatedTempo, tempoConfidence, beatPhase } =
    updateTempoTrackingState(bandState, beatConfidence, currentFrameAtMs);

  const rhythmicDensity = computeRhythmicDensity(
    bandState,
    deltaMs,
    currentFrameAtMs,
  );

  return {
    estimatedTempo,
    tempoConfidence,
    beatPhase,
    rhythmicDensity,
  };
}

function finalizeFeatureDebugSnapshot({
  auditSettings,
  inputMode,
  analysisInputMode = inputMode,
  sourceEvidence = null,
  pitchSource,
  analysisEngine,
  fieldState,
  renderAuthority = false,
  soundActive,
  micActive,
  liveInputNoiseGateActive,
  liveInputHardSilenceActive,
  liveInputCalibrationActive,
  liveInputCalibrationInvalid = false,
  liveInputCalibrationInvalidReason = "none",
  liveInputAnalysisClass,
  resolvedLiveInputAnalysisClass,
  liveInputAcousticIntent,
  liveInputPolicy,
  liveInputBaselineRms,
  liveInputBaselinePeak,
  sourceCoupledState,
  resonantState,
  dominantFrequency,
  dominantAmplitude,
  avgAmplitude,
  analyserRms,
  spectralCandidates,
  fftMagnitudes,
  nonZeroFFTBinCount = null,
  candidateForcingSlots,
  candidateResponseSlots,
  modeSlots,
  sourceCoupledColorSlots,
  resonantColorSlots,
  referenceModeSlots,
  bandEnergies,
  spectralLightComponents = null,
  transientEnergy,
  spectralCentroid,
  spectralFlux,
  structureSignal,
  energySignal,
  modalVisibilityEnergy,
  timbreSpread = 0,
  spectralNovelty = 0,
  changeSignal,
  changeBreakdown = null,
  pulseSignal,
  beatDetected,
  beatPulseId,
  beatStrength,
  beatConfidence,
  beatLowBandEnergy,
  beatOnsetDriver,
  beatThreshold,
  sampleRate,
  fftSize,
  structuralMetrics = null,
  micFftNormGain = 1,
  preModalFftPeak = 0,
  postNormalizationFftPeak = preModalFftPeak,
  referencePitchBinAmplitude = null,
  sourceNormalization = undefined,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  const debug = buildDebugSummary({
    inputMode,
    analysisInputMode,
    sourceEvidence,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    renderAuthority,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputAnalysisClass,
    resolvedLiveInputAnalysisClass,
    liveInputAcousticIntent,
    liveInputPolicy,
    liveInputBaselineRms,
    liveInputBaselinePeak,
    sourceCoupledState,
    resonantState,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    fftMagnitudes,
    nonZeroFFTBinCount,
    candidateForcingSlots,
    candidateResponseSlots,
    modeSlots,
    spectralLightComponents:
      spectralLightComponents ??
      [
        ...(sourceCoupledState?.spectralLightComponents ?? []),
        ...(resonantState?.spectralLightComponents ?? []),
      ]
        .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
        .slice(0, 8),
    transientEnergy,
    spectralCentroid,
    spectralFlux,
    structureSignal,
    energySignal,
    modalVisibilityEnergy,
    timbreSpread,
    spectralNovelty,
    changeSignal,
    changeBreakdown,
    pulseSignal,
    beatDetected,
    beatPulseId,
    beatStrength,
    beatConfidence,
    beatLowBandEnergy,
    beatOnsetDriver,
    beatThreshold,
    sampleRate,
    fftSize,
    structuralMetrics,
    micFftNormGain,
    preModalFftPeak,
    postNormalizationFftPeak,
    referencePitchBinAmplitude,
    sourceNormalization,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  });

  if (!shouldBuildResonantedDebug(auditSettings)) {
    return debug;
  }

  const slotAmplitudeDeltas = new Float32Array(
    Math.min(MAX_STACK_SLOTS, modeSlots.length / 4),
  );
  const slotLimit = Math.min(
    slotAmplitudeDeltas.length,
    modeSlots.length / 4,
    referenceModeSlots.length / 4,
  );
  for (let i = 0; i < slotLimit; i++) {
    slotAmplitudeDeltas[i] =
      modeSlots[i * 4 + 3] - referenceModeSlots[i * 4 + 3];
  }

  return {
    ...debug,
    harmonicSupport: Array.from(sourceCoupledState.harmonicSupport),
    spectralCandidates: spectralCandidates.map((peak) => ({
      frequency: peak.frequency,
      amplitude: peak.amplitude,
    })),
    currentModeSlots: Array.from(modeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    modalFieldSlots: Array.from(modeSlots),
    modalFieldColorSlots: Array.from(sourceCoupledColorSlots),
    candidateForcingSlots: Array.from(candidateForcingSlots),
    candidateResponseSlots: Array.from(candidateResponseSlots),
    sourceCoupledColorSlots: Array.from(sourceCoupledColorSlots),
    resonantColorSlots: Array.from(resonantColorSlots),
    bandEnergies: Array.from(bandEnergies),
    slotAmplitudeDeltas: Array.from(slotAmplitudeDeltas),
  };
}

function resolveFeatureAnalysisSessionKey(status, inputMode) {
  if (inputMode === "file") {
    return `file:${status?.playbackSessionId ?? "none"}`;
  }

  if (inputMode === "live") {
    return `live:${normalizeLiveInputDeviceKind(
      status?.liveInputDeviceKind ?? status?.liveInputKind,
    )}`;
  }

  if (inputMode === "system") {
    return "system";
  }

  return "idle";
}

function buildFeatureAnalysisInputsSignature({
  inputMode,
  analysisInputMode,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
  liveInputDeviceKind,
  resolvedLiveInputAnalysisClass,
  calibrationVersion,
  shouldBuildSpectralLight,
  resolvedAuditSettings,
  liveInputNoiseGateActive,
  liveInputHardSilenceActive,
  liveInputCalibrationInvalid,
  liveInputCalibrationInvalidReason,
  sourceMode,
}) {
  return JSON.stringify({
    inputMode,
    analysisInputMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    calibrationVersion,
    shouldBuildSpectralLight,
    injectTestTone: Boolean(resolvedAuditSettings?.injectTestTone),
    freezeModeSlots: Boolean(resolvedAuditSettings?.freezeModeSlots),
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    sourceMode,
  });
}

function shouldMuteFileTransportSource({ inputMode, status, auditSettings }) {
  return (
    inputMode === "file" &&
    status?.isPlaying !== true &&
    auditSettings?.injectTestTone !== true
  );
}

function buildMutedAnalysisSnapshot(snapshot, fftSize) {
  const safeFftSize =
    Number.isFinite(fftSize) && fftSize > 0 ? fftSize : DEFAULT_FFT_SIZE;
  return {
    ...(snapshot ?? {}),
    sourceMode: "silent",
    avgAmplitude: 0,
    rms: 0,
    fftMagnitudes: new Float32Array(safeFftSize / 2),
    timeData: new Float32Array(safeFftSize),
  };
}

function smoothFeatureSignal(
  currentValue,
  targetValue,
  deltaMs,
  { attackMs, releaseMs },
) {
  if (!Number.isFinite(currentValue)) {
    return targetValue;
  }

  const alpha = computeEmaAlpha(
    deltaMs,
    targetValue > currentValue ? attackMs : releaseMs,
  );
  return currentValue + (targetValue - currentValue) * alpha;
}

function deriveDeterministicBassSalience(bandEnergies) {
  return clamp01(
    (bandEnergies?.[0] ?? 0) * 1.8 + (bandEnergies?.[1] ?? 0) * 0.8,
  );
}

function deriveDeterministicTimbreSpread({
  bandEnergies,
  spectralCentroid = 0,
  spectralFlux = 0,
  trebleBroadbandEnergy = 0,
}) {
  const [sub = 0, lowMid = 0, highMid = 0, air = 0] = bandEnergies ?? [];
  return clamp01(
    highMid * 0.28 +
      air * 0.42 +
      trebleBroadbandEnergy * 0.32 +
      spectralCentroid * 0.18 +
      spectralFlux * 0.12 -
      sub * 0.08 -
      lowMid * 0.03,
  );
}

function deriveDeterministicSpectralNovelty({
  spectralFlux = 0,
  transientEnergy = 0,
  changeSignal = 0,
  beatOnsetDriver = 0,
  beatDetected = false,
}) {
  return clamp01(
    spectralFlux * 0.55 +
      transientEnergy * 0.2 +
      changeSignal * 0.18 +
      beatOnsetDriver * 0.12 +
      (beatDetected ? 0.06 : 0),
  );
}

export function prepareAudioFeatureFrameInputs({
  analysisSnapshot,
  featureState,
  radius,
  cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS,
  boundaryMode = SIMULATION_DEFAULTS.boundaryMode,
  cavityGeometry = DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  status,
  auditSettings = undefined,
  beatSettings = undefined,
  frameTimeMs = undefined,
  micAnalysisSettings = undefined,
  liveInputAnalysisSettings = undefined,
  includeSpectralLight = true,
}) {
  const capacity = featureState?.capacity ?? AUDIO_SLOT_CAPACITY;
  const analysisMemory = getAnalysisMemory(featureState, capacity);
  const {
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    signalModeSlots,
    sourceCoupledColorSlots,
    resonantColorSlots,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroSourceCoupledTargetSlots,
    zeroResonantTargetSlots,
    nonAcousticSourceCoupledTarget,
    nonAcousticResonantTarget,
    nonAcousticPeakDriverScratch,
    acousticSourceCoupledTarget,
    acousticResonantTarget,
    modalExcitationState,
    sourceCoupledState,
    resonantState,
    bandState,
  } = ensureAnalysisMemoryShape(featureState, analysisMemory, capacity);
  const auditState = featureState?.audit;
  const resolvedAuditSettings = auditSettings ??
    auditState?.settings ?? {
      ...AUDIT_DEFAULTS,
    };
  const sampleRate = status?.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const fftSize = status?.fftSize ?? DEFAULT_FFT_SIZE;
  const inputMode = status?.audioInputMode ?? "idle";
  const calibrationVersion = status?.liveInputCalibrationVersion ?? 0;
  const liveInputDeviceKind =
    status?.liveInputDeviceKind != null || status?.liveInputKind != null
      ? normalizeLiveInputDeviceKind(
          status?.liveInputDeviceKind ?? status?.liveInputKind,
        )
      : null;
  const resolvedLiveInputAnalysisClass =
    resolveFeatureFrameLiveInputAnalysisClass(status, micAnalysisSettings);
  const isLineFeedLiveInput =
    inputMode === "system" ||
    (inputMode === "live" &&
      resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed);
  const isAcousticLiveInput =
    inputMode === "live" &&
    isAcousticLiveInputDeviceKind(liveInputDeviceKind) &&
    resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;
  const analysisInputMode = isLineFeedLiveInput ? "file" : inputMode;
  const soundActive = Boolean(
    status?.isPlaying || isLoopbackLiveInputDeviceKind(liveInputDeviceKind),
  );
  const micActive = Boolean(
    status?.isLiveInputActive &&
    isAcousticLiveInputDeviceKind(liveInputDeviceKind) &&
    resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic,
  );
  const currentFrameAtMs = getFrameTimeMs(frameTimeMs);
  const resolvedMicAnalysisSettings = normalizeLiveInputAnalysisSettings({
    acousticIntent: status?.liveInputAcousticIntent,
    ...(micAnalysisSettings ?? liveInputAnalysisSettings),
  });
  const liveInputPolicy = resolveFeatureFrameLiveInputPolicy({
    inputMode,
    resolvedLiveInputAnalysisClass,
    settings: resolvedMicAnalysisSettings,
  });
  const liveInputAcousticIntent =
    liveInputPolicy === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
      ? DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT
      : normalizeLiveInputAcousticIntent(liveInputPolicy);
  const shouldBuildSpectralLight = Boolean(
    includeSpectralLight ||
    resolvedAuditSettings.enabled ||
    resolvedAuditSettings.freezeModeSlots,
  );
  const requestedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const effectiveCavityGeometry = resolveEffectiveCavityGeometry(
    requestedCavityGeometry,
  );
  const currentFrame = (analysisMemory.frameId ?? 0) + 1;

  if (featureState?.analysis) {
    featureState.analysis.frameId = currentFrame;
  }

  let sourceMode = isAcousticLiveInput
    ? "mic"
    : isLineFeedLiveInput && inputMode === "live"
      ? LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
      : inputMode === "file" || inputMode === "system"
        ? inputMode
        : "silent";
  if (resolvedAuditSettings.injectTestTone) {
    sourceMode = "test";
  }

  const fileTransportSourceMuted = shouldMuteFileTransportSource({
    inputMode,
    status,
    auditSettings: resolvedAuditSettings,
  });

  if (!analysisSnapshot && !resolvedAuditSettings.injectTestTone) {
    if (!isAcousticLiveInput) {
      resetLiveInputGateState(analysisMemory.bandState, {
        inputMode,
        policy: liveInputPolicy,
        calibrationVersion,
      });
    }
    const sourceEvidence = buildAudioSourceEvidenceFrame(
      collectAudioSourceEvidenceInputs({
        inputMode,
        status,
        isAcousticLiveInput,
        isLineFeedLiveInput,
        fileMuted: fileTransportSourceMuted,
        metrics: {
          avgAmplitude: 0,
          analyserRms: 0,
          preModalFftPeak: 0,
          nonZeroFftBinCount: 0,
        },
      }),
    );
    return {
      capacity,
      analysisMemory,
      candidateForcingSlots,
      candidateResponseSlots,
      modeSlots,
      signalModeSlots,
      sourceCoupledColorSlots,
      resonantColorSlots,
      referenceSourceCoupledSlots,
      referenceResonantSlots,
      referenceModeSlots,
      signalReferenceModeSlots,
      bandEnergies,
      zeroSourceCoupledTargetSlots,
      zeroResonantTargetSlots,
      sourceCoupledState,
      resonantState,
      bandState,
      auditState,
      resolvedAuditSettings,
      sampleRate,
      fftSize,
      inputMode,
      analysisInputMode,
      calibrationVersion,
      liveInputDeviceKind,
      resolvedLiveInputAnalysisClass,
      isLineFeedLiveInput,
      isAcousticLiveInput,
      soundActive,
      micActive,
      currentFrameAtMs,
      resolvedMicAnalysisSettings,
      liveInputAcousticIntent,
      liveInputPolicy,
      shouldBuildSpectralLight,
      currentFrame,
      sourceMode,
      sourceEvidence,
      radius,
      cavityAcousticScale,
      boundaryMode,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      cavityGeometry: requestedCavityGeometry,
      status,
      beatSettings,
      analysisSessionKey: resolveFeatureAnalysisSessionKey(status, inputMode),
      analysisInputsSignature: buildFeatureAnalysisInputsSignature({
        inputMode,
        analysisInputMode,
        requestedCavityGeometry,
        effectiveCavityGeometry,
        liveInputDeviceKind,
        resolvedLiveInputAnalysisClass,
        calibrationVersion,
        shouldBuildSpectralLight,
        resolvedAuditSettings,
        liveInputNoiseGateActive: false,
        liveInputHardSilenceActive: false,
        liveInputCalibrationInvalid: false,
        liveInputCalibrationInvalidReason: "none",
        sourceMode,
      }),
      silentFeatureFrame: buildSilentFeatureFrame({
        featureState,
        inputMode,
        soundActive,
        micActive,
        isLiveInputActive: status?.isLiveInputActive === true,
        sourceEvidence,
        candidateForcingSlots,
        candidateResponseSlots,
        sourceCoupledPhaseSlots,
        resonantPhaseSlots,
        modeSlots,
        sourceCoupledColorSlots,
        resonantColorSlots,
        referenceModeSlots,
        bandEnergies,
        sourceCoupledState,
        resonantState,
        fftSize,
        auditSettings: resolvedAuditSettings,
        requestedCavityGeometry,
        effectiveCavityGeometry,
      }),
    };
  }

  const rawSnapshot = resolvedAuditSettings.injectTestTone
    ? applyTestToneToSnapshot({
        analysisSnapshot,
        auditSettings: resolvedAuditSettings,
        fftSize,
        sampleRate,
      })
    : analysisSnapshot;
  const snapshot = fileTransportSourceMuted
    ? buildMutedAnalysisSnapshot(rawSnapshot, fftSize)
    : rawSnapshot;
  const resolvedSourceMode = fileTransportSourceMuted ? "silent" : sourceMode;

  const avgAmplitude = snapshot?.avgAmplitude ?? 0;
  const analyserRms = snapshot?.rms ?? 0;
  const fftMagnitudesSource =
    snapshot?.fftMagnitudes ?? new Float32Array(fftSize / 2);
  const fftSummary = computeBasicFftSummary(fftMagnitudesSource, sampleRate);
  const preModalFftPeak = fftSummary.peakMagnitude;
  const spectralCentroidHint = fftSummary.spectralCentroid;
  const {
    active: liveInputNoiseGateActive,
    hardSilence: liveInputHardSilenceActive,
    invalid: liveInputCalibrationInvalid,
    invalidReason: liveInputCalibrationInvalidReason,
  } = isAcousticLiveInput
    ? resolveLiveInputNoiseGate({
        analysisMemory,
        injectTestTone: resolvedAuditSettings.injectTestTone,
        inputMode,
        avgAmplitude,
        rms: analyserRms,
        fftMagnitudes: fftMagnitudesSource,
        sampleRate,
        fftSize,
        preModalFftPeak,
        spectralCentroidHint,
        currentFrameAtMs,
        calibrationVersion,
        micAnalysisSettings: resolvedMicAnalysisSettings,
      })
    : (() => {
        resetLiveInputGateState(analysisMemory.bandState, {
          inputMode,
          policy: liveInputPolicy,
          calibrationVersion,
        });
        return {
          active: false,
          hardSilence: false,
          invalid: false,
          invalidReason: "none",
        };
      })();

  const analysisSessionKey = resolveFeatureAnalysisSessionKey(
    status,
    inputMode,
  );
  const lineFeedMetrics = isLineFeedLiveInput
    ? {
        ...computeLiveInputMetrics({
          avgAmplitude,
          rms: analyserRms,
          fftMagnitudes: fftMagnitudesSource,
          sampleRate,
          fftSize,
          peakAmplitude: preModalFftPeak,
          spectralCentroid: spectralCentroidHint,
        }),
        transportSpectrumSilent:
          fftSummary.nonZeroBinCount === 0 && preModalFftPeak <= 0.003,
      }
    : null;
  const lineFeedProgramActivity = isLineFeedLiveInput
    ? resolveLineFeedProgramActivity({
        bandState: analysisMemory.bandState,
        metrics: lineFeedMetrics,
        deltaMs: getFrameDeltaMs(
          analysisMemory.bandState.lineFeedProgramPreviousFrameAtMs ?? 0,
          currentFrameAtMs,
        ),
        currentFrameAtMs,
        enabled: !resolvedAuditSettings.injectTestTone,
        analysisSessionKey,
      })
    : (() => {
        resetLineFeedProgramActivityState(
          analysisMemory.bandState,
          analysisSessionKey,
        );
        return {
          programActive: true,
          programExcitation: 1,
          deviceFloorAvg: 0,
          deviceFloorRms: 0,
          deviceFloorPeak: 0,
          quietHoldMs: 0,
        };
      })();
  const sourceEvidence = buildAudioSourceEvidenceFrame(
    collectAudioSourceEvidenceInputs({
      inputMode,
      status,
      analysisSnapshot: rawSnapshot,
      includeSnapshotAsAnalysisSource: true,
      isAcousticLiveInput,
      isLineFeedLiveInput,
      injectTestTone: resolvedAuditSettings.injectTestTone,
      fileMuted: fileTransportSourceMuted,
      lineFeedProgramActive: lineFeedProgramActivity.programActive === true,
      liveInputHardSilenceActive,
      metrics: {
        avgAmplitude,
        analyserRms,
        preModalFftPeak,
        nonZeroFftBinCount: fftSummary.nonZeroBinCount,
      },
    }),
  );

  return {
    analysisSnapshot,
    featureState,
    radius,
    cavityAcousticScale,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    cavityGeometry: requestedCavityGeometry,
    status,
    beatSettings,
    capacity,
    analysisMemory,
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    signalModeSlots,
    sourceCoupledColorSlots,
    resonantColorSlots,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroSourceCoupledTargetSlots,
    zeroResonantTargetSlots,
    nonAcousticSourceCoupledTarget,
    nonAcousticResonantTarget,
    nonAcousticPeakDriverScratch,
    acousticSourceCoupledTarget,
    acousticResonantTarget,
    modalExcitationState,
    sourceCoupledState,
    resonantState,
    bandState,
    auditState,
    resolvedAuditSettings,
    sampleRate,
    fftSize,
    inputMode,
    analysisInputMode,
    calibrationVersion,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    isLineFeedLiveInput,
    isAcousticLiveInput,
    soundActive,
    micActive,
    currentFrameAtMs,
    resolvedMicAnalysisSettings,
    liveInputAcousticIntent,
    liveInputPolicy,
    shouldBuildSpectralLight,
    currentFrame,
    sourceMode: resolvedSourceMode,
    sourceEvidence,
    snapshot,
    avgAmplitude,
    analyserRms,
    fftMagnitudesSource,
    preModalFftPeak,
    spectralCentroidHint,
    nonZeroFftBinCount: fftSummary.nonZeroBinCount,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    lineFeedProgramActive: lineFeedProgramActivity.programActive === true,
    lineFeedProgramExcitation: lineFeedProgramActivity.programExcitation ?? 0,
    lineFeedDeviceFloorAvg: lineFeedProgramActivity.deviceFloorAvg ?? 0,
    lineFeedDeviceFloorRms: lineFeedProgramActivity.deviceFloorRms ?? 0,
    analysisSessionKey,
    analysisInputsSignature: buildFeatureAnalysisInputsSignature({
      inputMode,
      analysisInputMode,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      liveInputDeviceKind,
      resolvedLiveInputAnalysisClass,
      calibrationVersion,
      shouldBuildSpectralLight,
      resolvedAuditSettings,
      liveInputNoiseGateActive,
      liveInputHardSilenceActive,
      liveInputCalibrationInvalid,
      liveInputCalibrationInvalidReason,
      sourceMode: resolvedSourceMode,
    }),
    silentFeatureFrame: null,
  };
}

function resolveEffectiveFftState(preparedInputs) {
  const {
    bandState,
    isAcousticLiveInput,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    fftMagnitudesSource,
    snapshot,
    preModalFftPeak,
    nonZeroFftBinCount,
  } = preparedInputs;

  let micFftNormGain = 1;
  if (
    isAcousticLiveInput &&
    !liveInputNoiseGateActive &&
    !liveInputHardSilenceActive
  ) {
    const noiseFloor = bandState.liveInputBaselinePeak ?? 0;
    const signalPeak = Math.max(0, preModalFftPeak - noiseFloor);
    if (
      signalPeak >= LIVE_INPUT_NORMALIZATION_MIN_SIGNAL &&
      preModalFftPeak <= LIVE_INPUT_NORMALIZATION_MAX_RAW_PEAK
    ) {
      const normGain = Math.min(
        LIVE_INPUT_NORMALIZATION_MAX_GAIN,
        LIVE_INPUT_NORMALIZATION_TARGET / Math.max(preModalFftPeak, 1e-6),
      );
      if (normGain > 1.05) {
        micFftNormGain = normGain;
      }
    }
  }

  const effectiveFftMagnitudes =
    isAcousticLiveInput && micFftNormGain > 1
      ? scaleFftMagnitudes(fftMagnitudesSource, micFftNormGain)
      : fftMagnitudesSource;
  const effectiveSnapshot =
    effectiveFftMagnitudes === fftMagnitudesSource
      ? snapshot
      : {
          ...snapshot,
          fftMagnitudes: effectiveFftMagnitudes,
        };

  return {
    micFftNormGain,
    effectiveFftMagnitudes,
    effectiveSnapshot,
    postNormalizationFftPeak:
      effectiveFftMagnitudes === fftMagnitudesSource
        ? preModalFftPeak
        : findPeakFftMagnitude(effectiveFftMagnitudes),
    nonZeroFFTBinCount:
      effectiveFftMagnitudes === fftMagnitudesSource &&
      Number.isFinite(nonZeroFftBinCount)
        ? nonZeroFftBinCount
        : countNonZeroFFTBinCount(effectiveFftMagnitudes),
  };
}

function ensureAnalysisFftBuffer(preparedInputs, effectiveFftMagnitudes) {
  const { analysisMemory, featureState, fftMagnitudesSource } = preparedInputs;

  let fftMagnitudes = analysisMemory.fftMagnitudes;
  if (!fftMagnitudes || fftMagnitudes.length !== fftMagnitudesSource.length) {
    fftMagnitudes = new Float32Array(fftMagnitudesSource.length);
    if (featureState?.analysis) {
      featureState.analysis.fftMagnitudes = fftMagnitudes;
    }
  }
  fftMagnitudes.set(effectiveFftMagnitudes);
  return fftMagnitudes;
}

function getAudioPerfNow() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

function roundStructuralSignature(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1000) / 1000;
}

function computeSlotSignature(slots, capacity) {
  const slotLimit = Math.min(capacity, Math.floor((slots?.length ?? 0) / 4));
  let signature = 0;

  for (let index = 0; index < slotLimit; index += 1) {
    const amplitude = slots[index * 4 + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }

    signature +=
      (index + 1) *
      (((slots[index * 4] ?? 0) * 3.17 +
        (slots[index * 4 + 1] ?? 0) * 5.11 +
        (slots[index * 4 + 2] ?? 0) * 7.13 +
        amplitude * 11.19) *
        amplitude);
  }

  return roundStructuralSignature(signature);
}

function computeColorSignature(colorSlots, capacity) {
  const slotLimit = Math.min(
    capacity,
    Math.floor((colorSlots?.length ?? 0) / 4),
  );
  let signature = 0;

  for (let index = 0; index < slotLimit; index += 1) {
    const weight = colorSlots[index * 4 + 3] ?? 0;
    if (weight <= 0) {
      continue;
    }

    signature +=
      (index + 1) *
      (((colorSlots[index * 4] ?? 0) * 2.73 +
        (colorSlots[index * 4 + 1] ?? 0) * 4.87 +
        (colorSlots[index * 4 + 2] ?? 0) * 6.41 +
        weight * 9.97) *
        weight);
  }

  return roundStructuralSignature(signature);
}

function hasFrozenStructuralProjection(auditState) {
  return Boolean(
    auditState &&
    (auditState.frozenSourceCoupledSlots.some((value) => value !== 0) ||
      auditState.frozenResonantSlots.some((value) => value !== 0)),
  );
}

function resolveStructuralProjectionSources(preparedInputs, structuralState) {
  const {
    auditState,
    shouldBuildSpectralLight,
    capacity,
    resolvedAuditSettings,
  } = preparedInputs;
  const freezeModeSlots = Boolean(
    structuralState?.freezeModeSlots ?? resolvedAuditSettings?.freezeModeSlots,
  );
  const hasFrozenProjection =
    freezeModeSlots && hasFrozenStructuralProjection(auditState);

  const candidateForcingSlotsSource = hasFrozenProjection
    ? auditState.frozenSourceCoupledSlots
    : (structuralState?.candidateForcingSlotsSource ??
      preparedInputs.sourceCoupledState.slots);
  const candidateResponseSlotsSource = hasFrozenProjection
    ? auditState.frozenResonantSlots
    : (structuralState?.candidateResponseSlotsSource ??
      preparedInputs.resonantState.slots);
  const sourceCoupledPhaseSlotsSource =
    structuralState?.sourceCoupledPhaseSlotsSource ??
    preparedInputs.sourceCoupledPhaseSlots;
  const resonantPhaseSlotsSource =
    structuralState?.resonantPhaseSlotsSource ??
    preparedInputs.resonantPhaseSlots;
  const sourceCoupledColorSlotsSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenSourceCoupledColorSlots
      : (structuralState?.sourceCoupledColorSlotsSource ??
        preparedInputs.sourceCoupledState.colorSlots)
    : null;
  const resonantColorSlotsSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenResonantColorSlots
      : (structuralState?.resonantColorSlotsSource ??
        preparedInputs.resonantState.colorSlots)
    : null;
  const referenceSourceCoupledSlotsSource =
    structuralState?.referenceSourceCoupledSlotsSource ??
    preparedInputs.sourceCoupledState.referenceSlots;
  const referenceResonantSlotsSource =
    structuralState?.referenceResonantSlotsSource ??
    preparedInputs.resonantState.referenceSlots;
  const activeSourceCoupledModeCount = structuralState?.suppressedByFog
    ? 0
    : countActiveSlots(candidateForcingSlotsSource, capacity);
  const activeResonantModeCount = structuralState?.suppressedByFog
    ? 0
    : countActiveSlots(candidateResponseSlotsSource, capacity);

  return {
    freezeModeSlots,
    hasFrozenProjection,
    candidateForcingSlotsSource,
    candidateResponseSlotsSource,
    sourceCoupledPhaseSlotsSource,
    resonantPhaseSlotsSource,
    referenceSourceCoupledSlotsSource,
    referenceResonantSlotsSource,
    sourceCoupledColorSlotsSource,
    resonantColorSlotsSource,
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    activeModeCount: activeSourceCoupledModeCount + activeResonantModeCount,
  };
}

function resolveStructuralSignalSources(preparedInputs, structuralState) {
  return {
    signalSourceCoupledSlotsSource:
      structuralState?.signalSourceCoupledSlotsSource ??
      structuralState?.candidateForcingSlotsSource ??
      preparedInputs.sourceCoupledState.slots,
    signalResonantSlotsSource:
      structuralState?.signalResonantSlotsSource ??
      structuralState?.candidateResponseSlotsSource ??
      preparedInputs.resonantState.slots,
    signalReferenceSourceCoupledSlotsSource:
      structuralState?.signalReferenceSourceCoupledSlotsSource ??
      structuralState?.referenceSourceCoupledSlotsSource ??
      preparedInputs.sourceCoupledState.referenceSlots,
    signalReferenceResonantSlotsSource:
      structuralState?.signalReferenceResonantSlotsSource ??
      structuralState?.referenceResonantSlotsSource ??
      preparedInputs.resonantState.referenceSlots,
  };
}

function buildStructuralFingerprint({
  preparedInputs,
  structuralState,
  activeSourceCoupledModeCount,
  activeResonantModeCount,
  activeModeCount,
}) {
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    structuralState,
  );
  const fogSuppressed = Boolean(structuralState?.suppressedByFog);

  return {
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    activeModeCount,
    dominantFrequency: structuralState?.dominantFrequency ?? 0,
    dominantAmplitude: structuralState?.dominantAmplitude ?? 0,
    analysisEngine: structuralState?.analysisEngine ?? "none",
    pitchSource: structuralState?.pitchSource ?? "none",
    usedDecay: Boolean(structuralState?.usedDecay),
    sourceMode: structuralState?.sourceMode ?? preparedInputs.sourceMode,
    sourceCoupledSignature: fogSuppressed
      ? 0
      : computeSlotSignature(
          projectionSources.candidateForcingSlotsSource,
          preparedInputs.capacity,
        ),
    resonantSignature: fogSuppressed
      ? 0
      : computeSlotSignature(
          projectionSources.candidateResponseSlotsSource,
          preparedInputs.capacity,
        ),
    referenceSourceCoupledSignature: computeSlotSignature(
      projectionSources.referenceSourceCoupledSlotsSource,
      preparedInputs.capacity,
    ),
    referenceResonantSignature: computeSlotSignature(
      projectionSources.referenceResonantSlotsSource,
      preparedInputs.capacity,
    ),
    sourceCoupledColorSignature:
      fogSuppressed || !projectionSources.sourceCoupledColorSlotsSource
        ? 0
        : computeColorSignature(
            projectionSources.sourceCoupledColorSlotsSource,
            preparedInputs.capacity,
          ),
    resonantColorSignature:
      fogSuppressed || !projectionSources.resonantColorSlotsSource
        ? 0
        : computeColorSignature(
            projectionSources.resonantColorSlotsSource,
            preparedInputs.capacity,
          ),
  };
}

function materializeAudioFeatureStructuralSnapshot(
  preparedInputs,
  structuralState,
) {
  const {
    capacity,
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    sourceCoupledColorSlots,
    resonantColorSlots,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    auditState,
  } = preparedInputs;
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    structuralState,
  );

  copyFloatArray(
    candidateForcingSlots,
    projectionSources.candidateForcingSlotsSource,
  );
  copyFloatArray(
    candidateResponseSlots,
    projectionSources.candidateResponseSlotsSource,
  );
  copyFloatArray(
    sourceCoupledPhaseSlots,
    projectionSources.sourceCoupledPhaseSlotsSource,
  );
  copyFloatArray(
    resonantPhaseSlots,
    projectionSources.resonantPhaseSlotsSource,
  );
  copyFloatArray(
    referenceSourceCoupledSlots,
    projectionSources.referenceSourceCoupledSlotsSource,
  );
  copyFloatArray(
    referenceResonantSlots,
    projectionSources.referenceResonantSlotsSource,
  );
  combineModalLayers(
    modeSlots,
    [
      { slots: candidateForcingSlots, weight: 1 },
      { slots: candidateResponseSlots, weight: 1 },
    ],
    capacity,
  );
  combineModalLayers(
    referenceModeSlots,
    [
      { slots: referenceSourceCoupledSlots, weight: 1 },
      { slots: referenceResonantSlots, weight: 1 },
    ],
    capacity,
  );

  if (projectionSources.sourceCoupledColorSlotsSource) {
    copyFloatArray(
      sourceCoupledColorSlots,
      projectionSources.sourceCoupledColorSlotsSource,
    );
    copyFloatArray(
      resonantColorSlots,
      projectionSources.resonantColorSlotsSource,
    );
  } else {
    sourceCoupledColorSlots.fill(0);
    resonantColorSlots.fill(0);
  }

  let returnedSourceCoupledSlots = candidateForcingSlots;
  let returnedResonantSlots = candidateResponseSlots;
  let returnedSourceCoupledPhaseSlots = sourceCoupledPhaseSlots;
  let returnedResonantPhaseSlots = resonantPhaseSlots;
  let returnedModeSlots = modeSlots;
  let returnedSourceCoupledColorSlots = sourceCoupledColorSlots;
  let returnedResonantColorSlots = resonantColorSlots;

  if (projectionSources.freezeModeSlots && auditState) {
    if (!projectionSources.hasFrozenProjection) {
      auditState.frozenSourceCoupledSlots.set(candidateForcingSlots);
      auditState.frozenResonantSlots.set(candidateResponseSlots);
      auditState.frozenModeSlots.set(modeSlots);
      auditState.frozenSourceCoupledColorSlots.set(sourceCoupledColorSlots);
      auditState.frozenResonantColorSlots.set(resonantColorSlots);
    }
    returnedSourceCoupledSlots = auditState.frozenSourceCoupledSlots;
    returnedResonantSlots = auditState.frozenResonantSlots;
    returnedSourceCoupledPhaseSlots = sourceCoupledPhaseSlots;
    returnedResonantPhaseSlots = resonantPhaseSlots;
    returnedModeSlots = auditState.frozenModeSlots;
    returnedSourceCoupledColorSlots = auditState.frozenSourceCoupledColorSlots;
    returnedResonantColorSlots = auditState.frozenResonantColorSlots;
  } else if (auditState) {
    emptyFrozenLayers(auditState);
  }

  let activeSourceCoupledModeCount =
    projectionSources.activeSourceCoupledModeCount;
  let activeResonantModeCount = projectionSources.activeResonantModeCount;
  let activeModeCount = projectionSources.activeModeCount;

  if (structuralState.suppressedByFog) {
    returnedSourceCoupledSlots.fill(0);
    returnedResonantSlots.fill(0);
    returnedSourceCoupledPhaseSlots.fill(0);
    returnedResonantPhaseSlots.fill(0);
    returnedModeSlots.fill(0);
    returnedSourceCoupledColorSlots.fill(0);
    returnedResonantColorSlots.fill(0);
    activeSourceCoupledModeCount = 0;
    activeResonantModeCount = 0;
    activeModeCount = 0;
  }

  return {
    candidateForcingSlots: returnedSourceCoupledSlots,
    candidateResponseSlots: returnedResonantSlots,
    sourceCoupledPhaseSlots: returnedSourceCoupledPhaseSlots,
    resonantPhaseSlots: returnedResonantPhaseSlots,
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    sourceCoupledColorSlots: returnedSourceCoupledColorSlots,
    resonantColorSlots: returnedResonantColorSlots,
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    activeModeCount,
  };
}

function materializeAudioFeatureSignalSnapshot(
  preparedInputs,
  structuralState,
) {
  const { capacity, signalModeSlots, signalReferenceModeSlots } =
    preparedInputs;
  const signalSources = resolveStructuralSignalSources(
    preparedInputs,
    structuralState,
  );
  combineModalLayers(
    signalModeSlots,
    [
      {
        slots: signalSources.signalSourceCoupledSlotsSource,
        weight: 1,
      },
      {
        slots: signalSources.signalResonantSlotsSource,
        weight: 1,
      },
    ],
    capacity,
  );
  combineModalLayers(
    signalReferenceModeSlots,
    [
      {
        slots: signalSources.signalReferenceSourceCoupledSlotsSource,
        weight: 1,
      },
      {
        slots: signalSources.signalReferenceResonantSlotsSource,
        weight: 1,
      },
    ],
    capacity,
  );

  return {
    signalModeSlots,
    signalReferenceModeSlots,
  };
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
    avgAmplitude,
    bandState,
  } = preparedInputs;
  const effectiveFftState = resolveEffectiveFftState(preparedInputs);
  const fftMagnitudes = ensureAnalysisFftBuffer(
    preparedInputs,
    effectiveFftState.effectiveFftMagnitudes,
  );
  const bandMetrics = updateBandSignalState({
    analysisMemory,
    fftMagnitudes,
    sampleRate,
    fftSize,
    rms: analyserRms,
    frameTimeMs: currentFrameAtMs,
    beatSettings,
  });
  const sourceNormalization = getSourceNormalization({
    inputMode: analysisInputMode,
    avgAmplitude,
    analyserRms,
    spectralCentroid: bandMetrics.spectralCentroid,
    bandState,
  });

  return {
    ...effectiveFftState,
    fftMagnitudes,
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
  structuralState.structuralFingerprint = buildStructuralFingerprint({
    preparedInputs,
    structuralState,
    activeSourceCoupledModeCount: structuralState.activeSourceCoupledModeCount,
    activeResonantModeCount: structuralState.activeResonantModeCount,
    activeModeCount: structuralState.activeModeCount,
  });
  return structuralState;
}

export function updateAudioFeatureChromaState(preparedInputs, fastSignalState) {
  const chromaState = preparedInputs.featureState.analysis.chromaState;
  const rawChroma = buildChromaVector(
    fastSignalState.fftMagnitudes,
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

function readCurrentStructuralState(
  preparedInputs,
  previousAnalysisResult = null,
  structuralState = null,
) {
  const previousStructuralState =
    structuralState ?? previousAnalysisResult?.structuralState ?? null;

  if (previousStructuralState) {
    return {
      ...previousStructuralState,
      candidateForcingSlots:
        previousAnalysisResult?.candidateForcingSlots ??
        preparedInputs.candidateForcingSlots,
      candidateResponseSlots:
        previousAnalysisResult?.candidateResponseSlots ??
        preparedInputs.candidateResponseSlots,
      sourceCoupledPhaseSlots:
        previousAnalysisResult?.sourceCoupledPhaseSlots ??
        preparedInputs.sourceCoupledPhaseSlots,
      resonantPhaseSlots:
        previousAnalysisResult?.resonantPhaseSlots ??
        preparedInputs.resonantPhaseSlots,
      modeSlots: previousAnalysisResult?.modeSlots ?? preparedInputs.modeSlots,
      signalModeSlots:
        previousAnalysisResult?.signalModeSlots ??
        previousAnalysisResult?.modeSlots ??
        preparedInputs.signalModeSlots,
      referenceModeSlots:
        previousAnalysisResult?.referenceModeSlots ??
        preparedInputs.referenceModeSlots,
      signalReferenceModeSlots:
        previousAnalysisResult?.signalReferenceModeSlots ??
        previousAnalysisResult?.referenceModeSlots ??
        preparedInputs.signalReferenceModeSlots,
      sourceCoupledColorSlots:
        previousAnalysisResult?.sourceCoupledColorSlots ??
        preparedInputs.sourceCoupledColorSlots,
      resonantColorSlots:
        previousAnalysisResult?.resonantColorSlots ??
        preparedInputs.resonantColorSlots,
      structuralFingerprint:
        previousStructuralState.structuralFingerprint ??
        previousAnalysisResult?.structuralFingerprint ??
        null,
      structuralPerf: {
        peakScanMs: previousStructuralState.structuralPerf?.peakScanMs ?? 0,
        modalResolveMs:
          previousStructuralState.structuralPerf?.modalResolveMs ?? 0,
        projectionMs: previousStructuralState.structuralPerf?.projectionMs ?? 0,
      },
      structuralMetrics: previousStructuralState.structuralMetrics ?? null,
    };
  }

  return {
    candidateForcingSlotsSource: preparedInputs.sourceCoupledState.slots,
    candidateResponseSlotsSource: preparedInputs.resonantState.slots,
    sourceCoupledPhaseSlotsSource: preparedInputs.sourceCoupledPhaseSlots,
    resonantPhaseSlotsSource: preparedInputs.resonantPhaseSlots,
    referenceSourceCoupledSlotsSource:
      preparedInputs.sourceCoupledState.referenceSlots,
    referenceResonantSlotsSource: preparedInputs.resonantState.referenceSlots,
    sourceCoupledColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.sourceCoupledState.colorSlots
      : null,
    resonantColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.resonantState.colorSlots
      : null,
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
    sourceCoupledColorSlots: preparedInputs.sourceCoupledColorSlots,
    resonantColorSlots: preparedInputs.resonantColorSlots,
    activeSourceCoupledModeCount: 0,
    activeResonantModeCount: 0,
    activeModeCount: 0,
    dominantFrequency: 0,
    dominantAmplitude: 0,
    analysisEngine:
      preparedInputs.sourceCoupledState.analysisEngine !== "none"
        ? preparedInputs.sourceCoupledState.analysisEngine
        : preparedInputs.resonantState.analysisEngine,
    pitchSource: "none",
    spectralCandidates: [],
    usedDecay: false,
    sourceMode: preparedInputs.sourceMode,
    suppressedByFog: false,
    sourceCoupledStateSource: preparedInputs.sourceCoupledState,
    resonantStateSource: preparedInputs.resonantState,
    structuralFingerprint: null,
    structuralPerf: {
      peakScanMs: 0,
      modalResolveMs: 0,
      projectionMs: 0,
    },
    structuralMetrics: null,
  };
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
  let resolvedStructural = currentStructural;
  const shouldMaterializeSignalProjection =
    materializeStructuralProjection || materializeSignalProjection;
  const signalStructural = shouldMaterializeSignalProjection
    ? materializeAudioFeatureSignalSnapshot(preparedInputs, currentStructural)
    : null;

  if (materializeStructuralProjection) {
    const projectionStartedAt = getAudioPerfNow();
    const projectedStructural = materializeAudioFeatureStructuralSnapshot(
      preparedInputs,
      currentStructural,
    );
    resolvedStructural = {
      ...currentStructural,
      ...projectedStructural,
      ...(signalStructural ?? {}),
      structuralPerf: {
        peakScanMs: currentStructural.structuralPerf?.peakScanMs ?? 0,
        modalResolveMs: currentStructural.structuralPerf?.modalResolveMs ?? 0,
        projectionMs: getAudioPerfNow() - projectionStartedAt,
      },
    };
  } else {
    resolvedStructural = signalStructural
      ? {
          ...currentStructural,
          ...signalStructural,
        }
      : currentStructural;
  }
  const currentChroma = chromaState ?? {
    keyTonic: preparedInputs.featureState.analysis.chromaState.keyTonic,
    keyMode: preparedInputs.featureState.analysis.chromaState.keyMode,
    keyConfidence:
      preparedInputs.featureState.analysis.chromaState.keyConfidence,
    keyTonicHue: preparedInputs.featureState.analysis.chromaState.keyTonicHue,
  };
  const currentTempo = tempoState ?? {
    estimatedTempo: preparedInputs.bandState.estimatedTempo,
    tempoConfidence: preparedInputs.bandState.tempoConfidence,
    beatPhase: preparedInputs.bandState.beatPhase,
    rhythmicDensity: preparedInputs.bandState.onsetDensityEma,
  };
  const resolvedSourceCoupledState =
    resolvedStructural.sourceCoupledStateSource ??
    preparedInputs.sourceCoupledState;
  const resolvedResonantState =
    resolvedStructural.resonantStateSource ?? preparedInputs.resonantState;
  const modeSlotAmplitudeTotal = sumSlotAmplitudeTotal(
    resolvedStructural.modeSlots,
    preparedInputs.capacity,
  );
  const signalSlotAmplitudeTotal = sumSlotAmplitudeTotal(
    resolvedStructural.signalModeSlots,
    preparedInputs.capacity,
  );
  const observerVisibleDecay =
    preparedInputs.inputMode === "file" &&
    modeSlotAmplitudeTotal > 0 &&
    modeSlotAmplitudeTotal >= signalSlotAmplitudeTotal * 1.18 &&
    (resolvedStructural.structuralMetrics?.modalDriveEnergy ?? 1) < 0.08;
  const resolvedUsedDecay =
    resolvedStructural.usedDecay || observerVisibleDecay;

  return {
    preparedInputs,
    soundActive: preparedInputs.soundActive,
    micActive: preparedInputs.micActive,
    fftMagnitudes: fastSignalState.fftMagnitudes,
    nonZeroFFTBinCount:
      fastSignalState.nonZeroFFTBinCount ??
      countNonZeroFFTBinCount(fastSignalState.fftMagnitudes),
    candidateForcingSlots: resolvedStructural.candidateForcingSlots,
    candidateResponseSlots: resolvedStructural.candidateResponseSlots,
    sourceCoupledPhaseSlots: resolvedStructural.sourceCoupledPhaseSlots,
    resonantPhaseSlots: resolvedStructural.resonantPhaseSlots,
    activeSourceCoupledModeCount:
      resolvedStructural.activeSourceCoupledModeCount,
    activeResonantModeCount: resolvedStructural.activeResonantModeCount,
    sourceCoupledColorSlots: resolvedStructural.sourceCoupledColorSlots,
    resonantColorSlots: resolvedStructural.resonantColorSlots,
    bandEnergies: fastSignalState.bandEnergies,
    spectralBandEnergies: fastSignalState.spectralBandEnergies,
    trebleBroadbandEnergy: fastSignalState.trebleBroadbandEnergy,
    trebleTonalEnergy: fastSignalState.trebleTonalEnergy,
    transientEnergy: fastSignalState.transientEnergy,
    spectralCentroid: fastSignalState.spectralCentroid,
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
    liveInputCalibrationActive: Boolean(
      preparedInputs.bandState.liveInputCalibrationActive,
    ),
    beatLowBandEnergy: fastSignalState.beatLowBandEnergy,
    beatOnsetDriver: fastSignalState.beatOnsetDriver,
    beatThreshold: fastSignalState.beatThreshold,
    micFftNormGain: fastSignalState.micFftNormGain,
    preModalFftPeak: preparedInputs.preModalFftPeak,
    postNormalizationFftPeak: fastSignalState.postNormalizationFftPeak,
    activeModeCount: resolvedStructural.activeModeCount,
    structuralFingerprint: resolvedStructural.structuralFingerprint,
    structuralMetrics: resolvedStructural.structuralMetrics ?? null,
    structuralState: {
      ...currentStructural,
    },
    structuralPerf: {
      peakScanMs: resolvedStructural.structuralPerf?.peakScanMs ?? 0,
      modalResolveMs: resolvedStructural.structuralPerf?.modalResolveMs ?? 0,
      projectionMs: resolvedStructural.structuralPerf?.projectionMs ?? 0,
    },
    debug: null,
  };
}

export function buildFastSignalPatchedAudioFeatureAnalysisResult({
  preparedInputs,
  previousAnalysisResult,
}) {
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);

  return {
    ...previousAnalysisResult,
    preparedInputs,
    soundActive: preparedInputs.soundActive,
    micActive: preparedInputs.micActive,
    fftMagnitudes: fastSignalState.fftMagnitudes,
    nonZeroFFTBinCount:
      fastSignalState.nonZeroFFTBinCount ??
      countNonZeroFFTBinCount(fastSignalState.fftMagnitudes),
    bandEnergies: fastSignalState.bandEnergies,
    spectralBandEnergies: fastSignalState.spectralBandEnergies,
    trebleBroadbandEnergy: fastSignalState.trebleBroadbandEnergy,
    trebleTonalEnergy: fastSignalState.trebleTonalEnergy,
    transientEnergy: fastSignalState.transientEnergy,
    spectralCentroid: fastSignalState.spectralCentroid,
    spectralFlux: fastSignalState.spectralFlux,
    beatDetected: fastSignalState.beatDetected,
    beatPulseId: fastSignalState.beatPulseId,
    beatStrength: fastSignalState.beatStrength,
    beatConfidence: fastSignalState.beatConfidence,
    avgAmplitude: preparedInputs.avgAmplitude,
    analyserRms: preparedInputs.analyserRms,
    sourceNormalization: fastSignalState.sourceNormalization,
    liveInputNoiseGateActive: preparedInputs.liveInputNoiseGateActive,
    liveInputHardSilenceActive: preparedInputs.liveInputHardSilenceActive,
    liveInputCalibrationInvalid: preparedInputs.liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason:
      preparedInputs.liveInputCalibrationInvalidReason,
    liveInputCalibrationActive: Boolean(
      preparedInputs.bandState.liveInputCalibrationActive,
    ),
    beatLowBandEnergy: fastSignalState.beatLowBandEnergy,
    beatOnsetDriver: fastSignalState.beatOnsetDriver,
    beatThreshold: fastSignalState.beatThreshold,
    micFftNormGain: fastSignalState.micFftNormGain,
    preModalFftPeak: preparedInputs.preModalFftPeak,
    postNormalizationFftPeak: fastSignalState.postNormalizationFftPeak,
    bandState: preparedInputs.bandState,
    sourceEvidence: preparedInputs.sourceEvidence,
    debug: null,
  };
}

export function runHeavyAudioFeatureAnalysis(preparedInputs) {
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  const chromaState = updateAudioFeatureChromaState(
    preparedInputs,
    fastSignalState,
  );
  const structuralState = updateAudioFeatureStructuralState(
    preparedInputs,
    fastSignalState,
  );
  const tempoState = updateAudioFeatureTempoState({
    bandState: preparedInputs.bandState,
    beatConfidence: fastSignalState.beatConfidence,
    currentFrameAtMs: fastSignalState.currentFrameAtMs,
    deltaMs: fastSignalState.deltaMs,
  });

  return buildCurrentAudioFeatureAnalysisResult({
    preparedInputs,
    fastSignalState,
    structuralState,
    chromaState,
    tempoState,
    materializeStructuralProjection: true,
  });
}

export function buildAudioFeatureAnalysisSnapshot({
  preparedInputs,
  analysisResult,
  publishCount = 0,
}) {
  const sourceCoupledStateSummary = buildSourceCoupledStateSummary(
    analysisResult.sourceCoupledState,
  );
  const resonantStateSummary = buildResonantStateSummary(
    analysisResult.resonantState,
  );
  const spectralLightComponents = cloneSpectralLightComponents(
    [
      ...(analysisResult.sourceCoupledState?.spectralLightComponents ?? []),
      ...(analysisResult.resonantState?.spectralLightComponents ?? []),
    ]
      .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
      .slice(0, 8),
  );
  const nonZeroFFTBinCount =
    analysisResult.nonZeroFFTBinCount ??
    countNonZeroFFTBinCount(analysisResult.fftMagnitudes);
  const referencePitchBinAmplitude = analysisResult.dominantFrequency
    ? sampleFFTAmplitudeForFrequency(
        analysisResult.dominantFrequency,
        analysisResult.fftMagnitudes,
        preparedInputs.sampleRate,
        preparedInputs.fftSize,
      )
    : 0;

  return {
    analysisSessionKey: preparedInputs.analysisSessionKey,
    analysisInputsSignature: preparedInputs.analysisInputsSignature,
    frameTimeMs: preparedInputs.currentFrameAtMs,
    publishCount,
    analysisResult: {
      soundActive: analysisResult.soundActive,
      micActive: analysisResult.micActive,
      candidateForcingSlots: cloneFloat32Array(
        analysisResult.candidateForcingSlots,
      ),
      candidateResponseSlots: cloneFloat32Array(
        analysisResult.candidateResponseSlots,
      ),
      sourceCoupledPhaseSlots: cloneFloat32Array(
        analysisResult.sourceCoupledPhaseSlots,
      ),
      resonantPhaseSlots: cloneFloat32Array(analysisResult.resonantPhaseSlots),
      activeSourceCoupledModeCount: analysisResult.activeSourceCoupledModeCount,
      activeResonantModeCount: analysisResult.activeResonantModeCount,
      sourceCoupledColorSlots: cloneFloat32Array(
        analysisResult.sourceCoupledColorSlots,
      ),
      resonantColorSlots: cloneFloat32Array(analysisResult.resonantColorSlots),
      bandEnergies: cloneFloat32Array(analysisResult.bandEnergies),
      transientEnergy: analysisResult.transientEnergy,
      spectralCentroid: analysisResult.spectralCentroid,
      spectralFlux: analysisResult.spectralFlux,
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
      modeSlots: cloneFloat32Array(analysisResult.modeSlots),
      signalModeSlots: cloneFloat32Array(analysisResult.signalModeSlots),
      referenceModeSlots: cloneFloat32Array(analysisResult.referenceModeSlots),
      signalReferenceModeSlots: cloneFloat32Array(
        analysisResult.signalReferenceModeSlots,
      ),
      sourceMode: analysisResult.sourceMode,
      sourceEvidence: analysisResult.sourceEvidence
        ? {
            ...analysisResult.sourceEvidence,
            metrics: { ...analysisResult.sourceEvidence.metrics },
            transport: { ...analysisResult.sourceEvidence.transport },
          }
        : null,
      sourceCoupledStateSummary,
      resonantStateSummary,
      avgAmplitude: analysisResult.avgAmplitude,
      analyserRms: analysisResult.analyserRms,
      dominantFrequency: analysisResult.dominantFrequency,
      dominantAmplitude: analysisResult.dominantAmplitude,
      analysisEngine: analysisResult.analysisEngine,
      pitchSource: analysisResult.pitchSource,
      usedDecay: analysisResult.usedDecay,
      sourceNormalization: analysisResult.sourceNormalization
        ? { ...analysisResult.sourceNormalization }
        : null,
      liveInputNoiseGateActive: analysisResult.liveInputNoiseGateActive,
      liveInputHardSilenceActive: analysisResult.liveInputHardSilenceActive,
      liveInputCalibrationInvalid: analysisResult.liveInputCalibrationInvalid,
      liveInputCalibrationInvalidReason:
        analysisResult.liveInputCalibrationInvalidReason,
      liveInputCalibrationActive: analysisResult.liveInputCalibrationActive,
      liveInputAcousticIntent:
        analysisResult.bandState?.liveInputPolicy ??
        (preparedInputs.isAcousticLiveInput
          ? DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT
          : null),
      liveInputPolicy: analysisResult.bandState?.liveInputPolicy ?? null,
      liveInputBaselineRms: analysisResult.bandState?.liveInputBaselineRms ?? 0,
      liveInputBaselinePeak:
        analysisResult.bandState?.liveInputBaselinePeak ?? 0,
      beatLowBandEnergy: analysisResult.beatLowBandEnergy,
      beatOnsetDriver: analysisResult.beatOnsetDriver,
      beatThreshold: analysisResult.beatThreshold,
      micFftNormGain: analysisResult.micFftNormGain,
      preModalFftPeak: analysisResult.preModalFftPeak,
      postNormalizationFftPeak: analysisResult.postNormalizationFftPeak,
      activeModeCount: analysisResult.activeModeCount,
      structuralFingerprint: analysisResult.structuralFingerprint
        ? { ...analysisResult.structuralFingerprint }
        : null,
      structuralMetrics: analysisResult.structuralMetrics
        ? { ...analysisResult.structuralMetrics }
        : null,
      spectralLightComponents,
      nonZeroFFTBinCount,
      referencePitchBinAmplitude,
      debug: null,
    },
  };
}

export function composeAudioFeatureFrame({
  preparedInputs,
  analysisResult,
  previousFrame = null,
  reuseHeavyAnalysis = false,
}) {
  const sourceCoupledState =
    analysisResult.sourceCoupledStateSummary ??
    analysisResult.sourceCoupledState;
  const resonantState =
    analysisResult.resonantStateSummary ?? analysisResult.resonantState;
  let {
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown,
    pulseSignal,
    modeCoherence,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    lowQSourceCoupledVisibilityEnergy,
    lowQSourceCoupledVisibilityRejected,
  } = deriveCompositeSignals({
    inputMode: preparedInputs.analysisInputMode,
    modeCapacity: preparedInputs.capacity,
    signalNormalizationSlots: AUDIO_DEFAULTS.signalNormalizationSlots,
    modeSlots: analysisResult.signalModeSlots ?? analysisResult.modeSlots,
    visibilityModeSlots: analysisResult.modeSlots,
    referenceModeSlots:
      analysisResult.signalReferenceModeSlots ??
      analysisResult.referenceModeSlots,
    sourceCoupledState,
    resonantState,
    bandEnergies: analysisResult.bandEnergies,
    analyserRms: analysisResult.analyserRms,
    avgAmplitude: analysisResult.avgAmplitude,
    dominantAmplitude: analysisResult.dominantAmplitude,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralFlux: analysisResult.spectralFlux,
    transientEnergy: analysisResult.transientEnergy,
    beatDetected: analysisResult.beatDetected,
    beatStrength: analysisResult.beatStrength,
    beatConfidence: analysisResult.beatConfidence,
    beatOnsetDriver: analysisResult.beatOnsetDriver,
    beatThreshold: analysisResult.beatThreshold,
    bandState: analysisResult.bandState ?? null,
    structuralMetrics: analysisResult.structuralMetrics,
    sourceNormalization: analysisResult.sourceNormalization,
    liveInputHardSilenceActive: analysisResult.liveInputHardSilenceActive,
    activeSourceCoupledModeCount: analysisResult.activeSourceCoupledModeCount,
    nonZeroFFTBinCount:
      analysisResult.nonZeroFFTBinCount ??
      countNonZeroFFTBinCount(analysisResult.fftMagnitudes),
  });
  const reusedAnalysisSourceAuthorityScale = reuseHeavyAnalysis
    ? deriveReusedAnalysisSourceAuthorityScale({
        preparedInputs,
        analysisResult,
      })
    : 1;
  if (reuseHeavyAnalysis && previousFrame) {
    const deltaMs = getFrameDeltaMs(
      preparedInputs.analysisMemory.lastComposedFrameAtMs,
      preparedInputs.currentFrameAtMs,
    );
    structureSignal = smoothFeatureSignal(
      previousFrame.structureSignal,
      structureSignal,
      deltaMs,
      {
        attackMs: 70,
        releaseMs: 120,
      },
    );
    energySignal = smoothFeatureSignal(
      previousFrame.energySignal,
      energySignal,
      deltaMs,
      {
        attackMs: 35,
        releaseMs: 80,
      },
    );
    changeSignal = smoothFeatureSignal(
      previousFrame.changeSignal,
      changeSignal,
      deltaMs,
      {
        attackMs: 10,
        releaseMs: 42,
      },
    );
    pulseSignal = smoothFeatureSignal(
      previousFrame.pulseSignal,
      pulseSignal,
      deltaMs,
      {
        attackMs: 8,
        releaseMs: 50,
      },
    );
    modalVisibilityEnergy = smoothFeatureSignal(
      previousFrame.modalVisibilityEnergy ?? 0,
      modalVisibilityEnergy,
      deltaMs,
      {
        attackMs: 70,
        releaseMs: 160,
      },
    );
    modalObserverVisibilityEnergy = smoothFeatureSignal(
      previousFrame.modalObserverVisibilityEnergy ?? 0,
      modalObserverVisibilityEnergy,
      deltaMs,
      {
        attackMs: 50,
        releaseMs: 130,
      },
    );
    modalVisibilityRetainedHighQEnergy = smoothFeatureSignal(
      previousFrame.modalVisibilityRetainedHighQEnergy ?? 0,
      modalVisibilityRetainedHighQEnergy,
      deltaMs,
      {
        attackMs: 70,
        releaseMs: 160,
      },
    );
  }
  if (reusedAnalysisSourceAuthorityScale < 1) {
    structureSignal *= reusedAnalysisSourceAuthorityScale;
    energySignal *= reusedAnalysisSourceAuthorityScale;
    modalVisibilityEnergy *= reusedAnalysisSourceAuthorityScale;
    modalObserverVisibilityEnergy *= reusedAnalysisSourceAuthorityScale;
    modalVisibilityRetainedHighQEnergy *= reusedAnalysisSourceAuthorityScale;
    modeCoherence *= reusedAnalysisSourceAuthorityScale;
  }
  const retainedModalCoefficientEnergy = clamp01(
    sumSlotAmplitudeTotal(analysisResult.modeSlots, preparedInputs.capacity),
  );
  const sourceModalCoefficientEnergy = clamp01(
    sumSlotAmplitudeTotal(
      analysisResult.signalModeSlots ?? analysisResult.modeSlots,
      preparedInputs.capacity,
    ),
  );
  const retainedModalResponseSourceCoupledEnergy = clamp01(
    analysisResult.structuralMetrics?.modalResponseSourceCoupledEnergy ?? 0,
  );
  const retainedModalResponseResonantEnergy = clamp01(
    analysisResult.structuralMetrics?.modalResponseResonantEnergy ?? 0,
  );
  let projectedModalRenderEnergy = readModalResponseRenderEnergy(
    analysisResult.structuralMetrics,
    retainedModalCoefficientEnergy,
  );
  let modalResponseSourceCoupledEnergy =
    readModalResponseRenderSourceCoupledEnergy(
      analysisResult.structuralMetrics,
      retainedModalResponseSourceCoupledEnergy,
    );
  let modalResponseResonantEnergy = readModalResponseRenderResonantEnergy(
    analysisResult.structuralMetrics,
    retainedModalResponseResonantEnergy,
  );
  let modalResponseEnergy = clamp01(
    Math.max(
      analysisResult.structuralMetrics?.modalResponseEnergy ?? 0,
      modalResponseSourceCoupledEnergy,
      modalResponseResonantEnergy,
    ),
  );
  const resolvedSourceEvidence = resolveAudioRenderBoundary({
    sourceEvidence: preparedInputs.sourceEvidence,
    modalResponse: analysisResult.structuralMetrics,
  });
  analysisResult.sourceEvidence = resolvedSourceEvidence;
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy: resolvedSourceEvidence.sourceEnergy,
    sourceBoundaryState: resolvedSourceEvidence.sourceBoundaryState,
    modalResponse: analysisResult.structuralMetrics,
    candidateForcingSlots: analysisResult.candidateForcingSlots,
    candidateResponseSlots: analysisResult.candidateResponseSlots,
    capacity: preparedInputs.capacity,
    renderEnergyEpsilon: analysisResult.structuralMetrics?.renderEnergyEpsilon,
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
  });
  const projectedRenderAuthority = hasProjectedRenderAuthority(energyLedger);
  if (analysisResult.structuralMetrics) {
    analysisResult.structuralMetrics.energyLedger = energyLedger;
    analysisResult.structuralMetrics.sourceEvidence = resolvedSourceEvidence;
  }
  projectedModalRenderEnergy = energyLedger.projectedRenderEnergy;
  modalResponseSourceCoupledEnergy = energyLedger.projectedSourceCoupledEnergy;
  modalResponseResonantEnergy = energyLedger.projectedResonantEnergy;
  let observationEnergy = deriveModalObservationEnergy(
    projectedModalRenderEnergy,
    projectedRenderAuthority ? modalResponseEnergy : 0,
  );
  let timbreSpread = deriveDeterministicTimbreSpread({
    bandEnergies: analysisResult.bandEnergies,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralFlux: analysisResult.spectralFlux,
    trebleBroadbandEnergy: analysisResult.trebleBroadbandEnergy,
  });
  let spectralNovelty = deriveDeterministicSpectralNovelty({
    spectralFlux: analysisResult.spectralFlux,
    transientEnergy: analysisResult.transientEnergy,
    changeSignal,
    beatOnsetDriver: analysisResult.beatOnsetDriver,
    beatDetected: analysisResult.beatDetected,
  });
  preparedInputs.analysisMemory.lastComposedFrameAtMs =
    preparedInputs.currentFrameAtMs;

  if (!projectedRenderAuthority) {
    structureSignal = 0;
    energySignal = 0;
    changeSignal = 0;
    pulseSignal = 0;
    modeCoherence = 0;
    projectedModalRenderEnergy = 0;
    modalResponseSourceCoupledEnergy = 0;
    modalResponseResonantEnergy = 0;
    observationEnergy = 0;
    timbreSpread = 0;
    spectralNovelty = 0;
  }

  const sourceBoundaryModalForcingAbsent =
    resolvedSourceEvidence.currentSourceEvidence !== true &&
    (analysisResult.usedDecay ||
      sourceModalCoefficientEnergy <= RENDER_ENERGY_EPSILON);
  const lineFeedSourceVisibility =
    preparedInputs.resolvedLiveInputAnalysisClass ===
      LIVE_INPUT_ANALYSIS_CLASSES.lineFeed ||
    preparedInputs.liveInputPolicy === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  const lineFeedProgramActive = preparedInputs.lineFeedProgramActive === true;
  const lineFeedLowQFieldVisibilityAllowed =
    lineFeedSourceVisibility &&
    resolvedSourceEvidence.currentSourceEvidence === true &&
    lowQSourceCoupledVisibilityEnergy > RENDER_ENERGY_EPSILON;
  const observerAuthorizedActiveField =
    (analysisResult.activeModeCount ?? 0) > 0 &&
    !sourceBoundaryModalForcingAbsent &&
    (preparedInputs.inputMode === "live" ||
      projectedModalRenderEnergy > 0.02 ||
      modalVisibilityEnergy > 0.005 ||
      lineFeedLowQFieldVisibilityAllowed);
  const fieldStateUsesDecay =
    projectedRenderAuthority &&
    analysisResult.usedDecay &&
    !observerAuthorizedActiveField;
  const fieldStateActiveModeCount = projectedRenderAuthority
    ? analysisResult.activeModeCount
    : 0;
  let { fieldState, hasModalField } = deriveFieldState({
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
    activeModeCount: fieldStateActiveModeCount,
    usedDecay: fieldStateUsesDecay,
  });
  let renderAuthority =
    projectedRenderAuthority &&
    hasFeatureFrameRenderAuthority({
      fieldState,
      hasModalField,
      activeModeCount: fieldStateActiveModeCount,
      modalCoefficientEnergy: projectedModalRenderEnergy,
      observationEnergy,
      modalVisibilityEnergy,
      modalObserverVisibilityEnergy,
    });
  if (!projectedRenderAuthority) {
    fieldState = FIELD_STATES.idle;
    hasModalField = false;
    renderAuthority = false;
  }
  const sourceMode =
    fieldState === FIELD_STATES.idle &&
    !preparedInputs.resolvedAuditSettings.injectTestTone
      ? "silent"
      : analysisResult.sourceMode;
  const modalPhaseAuthority = renderAuthority
    ? clamp01(analysisResult.structuralMetrics?.modalPhaseAuthority ?? 0)
    : 0;
  let renderSourceCoupledSlots = analysisResult.candidateForcingSlots;
  let renderResonantSlots = analysisResult.candidateResponseSlots;
  let renderSourceCoupledPhaseSlots = analysisResult.sourceCoupledPhaseSlots;
  let renderResonantPhaseSlots = analysisResult.resonantPhaseSlots;
  let renderModeSlots = analysisResult.modeSlots;
  let renderReferenceModeSlots = analysisResult.referenceModeSlots;
  let renderSourceCoupledColorSlots = analysisResult.sourceCoupledColorSlots;
  let renderResonantColorSlots = analysisResult.resonantColorSlots;
  let renderBandEnergies = analysisResult.bandEnergies;
  let activeSourceCoupledModeCount =
    analysisResult.activeSourceCoupledModeCount;
  let activeResonantModeCount = analysisResult.activeResonantModeCount;
  let activeModeCount = analysisResult.activeModeCount;

  if (renderAuthority && energyLedger.projectedEnergyScale < 1) {
    scaleSlotAmplitudes(
      renderSourceCoupledSlots,
      preparedInputs.capacity,
      energyLedger.projectedEnergyScale,
    );
    scaleSlotAmplitudes(
      renderResonantSlots,
      preparedInputs.capacity,
      energyLedger.projectedEnergyScale,
    );
    scaleSlotAmplitudes(
      renderModeSlots,
      preparedInputs.capacity,
      energyLedger.projectedEnergyScale,
    );
  }

  if (!renderAuthority) {
    preparedInputs.modeSlots.fill(0);
    preparedInputs.referenceModeSlots.fill(0);
    preparedInputs.sourceCoupledColorSlots.fill(0);
    preparedInputs.resonantColorSlots.fill(0);
    preparedInputs.bandEnergies.fill(0);
    renderSourceCoupledSlots = preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantSlots = preparedInputs.zeroResonantTargetSlots;
    renderSourceCoupledPhaseSlots = preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantPhaseSlots = preparedInputs.zeroResonantTargetSlots;
    renderModeSlots = preparedInputs.modeSlots;
    renderReferenceModeSlots = preparedInputs.referenceModeSlots;
    renderSourceCoupledColorSlots = preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantColorSlots = preparedInputs.zeroResonantTargetSlots;
    renderBandEnergies = preparedInputs.bandEnergies;
    activeSourceCoupledModeCount = 0;
    activeResonantModeCount = 0;
    activeModeCount = 0;
  }

  const modalFieldDescriptorSource = buildModalFieldDescriptorSource({
    candidateForcingSlots: renderSourceCoupledSlots,
    candidateResponseSlots: renderResonantSlots,
    sourceCoupledPhaseSlots: renderSourceCoupledPhaseSlots,
    resonantPhaseSlots: renderResonantPhaseSlots,
    sourceCoupledColorSlots: renderSourceCoupledColorSlots,
    resonantColorSlots: renderResonantColorSlots,
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    radius: preparedInputs.radius,
    cavityAcousticScale: preparedInputs.cavityAcousticScale,
    boundaryMode: preparedInputs.boundaryMode,
  });
  const modalDescriptor = buildCanonicalFullModalDescriptor({
    generation: preparedInputs.auditState?.frame ?? 0,
    maxTotalModes: Math.min(
      preparedInputs.capacity,
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    ),
    basisAtlasPageCapacity: MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    modalFieldSlots: modalFieldDescriptorSource.modalFieldSlots,
    modalFieldPhaseSlots: modalFieldDescriptorSource.modalFieldPhaseSlots,
    modalFieldColorSlots: modalFieldDescriptorSource.modalFieldColorSlots,
    modalFieldMetadataSlots: modalFieldDescriptorSource.modalFieldMetadataSlots,
    activeModalFieldModeCount:
      modalFieldDescriptorSource.activeModalFieldModeCount,
    observerCandidateModeCount:
      analysisResult.structuralMetrics?.excitedModeCount,
    observedModalModeCount:
      analysisResult.structuralMetrics?.observedModalModeCount,
    phaseAuthorityModeCount:
      analysisResult.structuralMetrics?.modalPhaseCoherentFieldModeCount,
    modeIdentityRetentionRatio:
      analysisResult.structuralMetrics?.modalPersistence,
  });

  let debug = analysisResult.debug;
  if (!debug) {
    debug = finalizeFeatureDebugSnapshot({
      auditSettings: preparedInputs.resolvedAuditSettings,
      inputMode: preparedInputs.inputMode,
      sourceEvidence: analysisResult.sourceEvidence,
      pitchSource: analysisResult.pitchSource,
      analysisEngine: analysisResult.analysisEngine,
      fieldState,
      renderAuthority,
      soundActive: analysisResult.soundActive,
      micActive: analysisResult.micActive,
      liveInputNoiseGateActive: analysisResult.liveInputNoiseGateActive,
      liveInputHardSilenceActive: analysisResult.liveInputHardSilenceActive,
      liveInputCalibrationActive: analysisResult.liveInputCalibrationActive,
      liveInputCalibrationInvalid: analysisResult.liveInputCalibrationInvalid,
      liveInputCalibrationInvalidReason:
        analysisResult.liveInputCalibrationInvalidReason,
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
      fftMagnitudes: analysisResult.fftMagnitudes ?? null,
      nonZeroFFTBinCount: analysisResult.nonZeroFFTBinCount ?? null,
      candidateForcingSlots: renderSourceCoupledSlots,
      candidateResponseSlots: renderResonantSlots,
      sourceCoupledColorSlots: renderSourceCoupledColorSlots,
      resonantColorSlots: renderResonantColorSlots,
      modeSlots: renderModeSlots,
      referenceModeSlots: renderReferenceModeSlots,
      bandEnergies: renderBandEnergies,
      spectralLightComponents: analysisResult.spectralLightComponents ?? null,
      transientEnergy: analysisResult.transientEnergy,
      spectralCentroid: analysisResult.spectralCentroid,
      spectralFlux: analysisResult.spectralFlux,
      structureSignal,
      energySignal,
      modalVisibilityEnergy,
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
      micFftNormGain: analysisResult.micFftNormGain,
      preModalFftPeak: analysisResult.preModalFftPeak,
      postNormalizationFftPeak: analysisResult.postNormalizationFftPeak,
      referencePitchBinAmplitude:
        analysisResult.referencePitchBinAmplitude ?? null,
      sourceNormalization: analysisResult.sourceNormalization,
      requestedCavityGeometry: preparedInputs.requestedCavityGeometry,
      effectiveCavityGeometry: preparedInputs.effectiveCavityGeometry,
    });
    analysisResult.debug = debug;
  }
  if (
    debug.fieldState !== fieldState ||
    debug.renderAuthority !== renderAuthority ||
    debug.lowQSourceCoupledVisibilityRejected !==
      lowQSourceCoupledVisibilityRejected
  ) {
    debug = {
      ...debug,
      fieldState,
      renderAuthority,
      lineFeedProgramActive,
      lineFeedProgramExcitation: preparedInputs.lineFeedProgramExcitation ?? 0,
      lowQSourceCoupledVisibilityRejected,
    };
    analysisResult.debug = debug;
  }

  if (preparedInputs.auditState) {
    preparedInputs.auditState.frame += 1;
    preparedInputs.auditState.lastSnapshot = debug;
  }

  return {
    fieldState,
    hasModalField,
    renderAuthority,
    energyLedger,
    projectedRenderEnergy: energyLedger.projectedRenderEnergy,
    sourceEvidence: resolvedSourceEvidence,
    isLiveInputActive: preparedInputs.status?.isLiveInputActive === true,
    soundActive: analysisResult.soundActive,
    micActive: analysisResult.micActive,
    averageAmplitude: analysisResult.avgAmplitude,
    fftMagnitudes: analysisResult.fftMagnitudes,
    activeModeCount,
    activeModalFieldModeCount: modalDescriptor.counts.modalFieldModeCount,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalFieldColorSlots: modalDescriptor.slotViews.modalFieldColorSlots,
    modalFieldMetadataSlots: modalDescriptor.slotViews.modalFieldMetadataSlots,
    bandEnergies: renderBandEnergies,
    spectralBandEnergies: analysisResult.spectralBandEnergies,
    trebleBroadbandEnergy: analysisResult.trebleBroadbandEnergy,
    trebleTonalEnergy: analysisResult.trebleTonalEnergy,
    transientEnergy: analysisResult.transientEnergy,
    spectralCentroid: analysisResult.spectralCentroid,
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
    modalResponseRenderRawEnergy: renderAuthority
      ? (analysisResult.structuralMetrics?.modalResponseRenderRawEnergy ??
        projectedModalRenderEnergy)
      : 0,
    modalResponseCurrentRenderSourceEvidence: Boolean(
      analysisResult.structuralMetrics
        ?.modalResponseCurrentRenderSourceEvidence,
    ),
    observationEnergy,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    modalPhaseAuthority,
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
    bassSalience: deriveDeterministicBassSalience(renderBandEnergies),
    timbreSpread,
    spectralNovelty,
    referenceModeSlots: renderReferenceModeSlots,
    sourceMode,
    debug,
    audit: preparedInputs.resolvedAuditSettings,
  };
}

export function buildAudioFeatureFrame(args) {
  const preparedInputs = prepareAudioFeatureFrameInputs(args);
  if (preparedInputs.silentFeatureFrame) {
    return preparedInputs.silentFeatureFrame;
  }

  const analysisResult = runHeavyAudioFeatureAnalysis(preparedInputs);
  return composeAudioFeatureFrame({
    preparedInputs,
    analysisResult,
    reuseHeavyAnalysis: false,
  });
}
