import {
  AUDIT_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  BEAT_DEFAULTS,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
} from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
  resolveEffectiveCavityGeometry,
} from "../../core/cavityGeometry.js";
import { sampleFFTAmplitudeForFrequency } from "../cavityModes.js";
import {
  BACKBONE_STACK_SLOTS,
  DETAIL_STACK_SLOTS,
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
import {
  countNonZeroFftBins,
  deriveHighQSparseResonatorAuthority,
} from "./highQSparseResonatorAuthority.js";

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
const DETAIL_LAYER_WEIGHT = 0.35;
const SOURCE_CUT_MODAL_FORCING_EPSILON = 1e-6;
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
const MODAL_OBSERVER_DETAIL_SLOT_FLOOR_TOTAL_MAX = 0.018;
const MODAL_OBSERVER_BACKBONE_SLOT_FLOOR_TOTAL_MAX = 0.012;
const LOW_Q_BACKBONE_VISIBILITY_ENERGY_START = 0.006;
const LOW_Q_BACKBONE_VISIBILITY_ENERGY_END = 0.075;
const LOW_Q_BACKBONE_VISIBILITY_COHERENCE_START = 0.22;
const LOW_Q_BACKBONE_VISIBILITY_COHERENCE_END = 0.58;
const LOW_Q_BACKBONE_VISIBILITY_SNR_START = 0.08;
const LOW_Q_BACKBONE_VISIBILITY_SNR_END = 0.45;
const LOW_Q_BACKBONE_VISIBILITY_SOURCE_START = 0.018;
const LOW_Q_BACKBONE_VISIBILITY_SOURCE_END = 0.12;
const LOW_Q_BACKBONE_VISIBILITY_SNR_FLOOR = 0.32;
const LOW_Q_BACKBONE_VISIBILITY_DENSE_REDUCTION = 0.35;
const LOW_Q_BACKBONE_VISIBILITY_ENERGY_MAX = 0.18;
const LOW_Q_BACKBONE_TOPOLOGY_FLOOR_MAX = 0.18;
const EMPTY_LOW_Q_BACKBONE_VISIBILITY = Object.freeze({
  lowQBackboneVisibilityAuthority: 0,
  lowQBackboneVisibilityEnergy: 0,
  lowQBackboneTopologyFloor: 0,
  lowQBackboneSourceSupport: 0,
  lowQBackboneVisibilityRejected: false,
});
const EMPTY_MODAL_OBSERVER_VISIBILITY = Object.freeze({
  modalObserverVisibilityEnergy: 0,
  highQObserverVisibilityEnergy: 0,
  lowQObserverVisibilityEnergy: 0,
  modalObserverTopologyFloor: 0,
  detailSlotFloorTotal: 0,
  backboneSlotFloorTotal: 0,
  ...EMPTY_LOW_Q_BACKBONE_VISIBILITY,
  highQSparseResonatorAuthority: 0,
  highQDenseSpectrumPressure: 0,
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
// Minimum harmonic salience for a peak to drive the ambient backbone.
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
  const backboneTargetLength = Math.min(capacity, BACKBONE_STACK_SLOTS) * 4;
  const detailTargetLength = Math.min(capacity, DETAIL_STACK_SLOTS) * 4;
  const backboneSlots = ensureArrayField(
    analysisMemory,
    "backboneSlots",
    slotLength,
  );
  const detailSlots = ensureArrayField(
    analysisMemory,
    "detailSlots",
    slotLength,
  );
  const backbonePhaseSlots = ensureArrayField(
    analysisMemory,
    "backbonePhaseSlots",
    slotLength,
  );
  const detailPhaseSlots = ensureArrayField(
    analysisMemory,
    "detailPhaseSlots",
    slotLength,
  );
  const modeSlots = ensureArrayField(analysisMemory, "modeSlots", slotLength);
  const signalModeSlots = ensureArrayField(
    analysisMemory,
    "signalModeSlots",
    slotLength,
  );
  const backboneColorSlots = ensureArrayField(
    analysisMemory,
    "backboneColorSlots",
    slotLength,
  );
  const detailColorSlots = ensureArrayField(
    analysisMemory,
    "detailColorSlots",
    slotLength,
  );
  const referenceBackboneSlots = ensureArrayField(
    analysisMemory,
    "referenceBackboneSlots",
    slotLength,
  );
  const referenceDetailSlots = ensureArrayField(
    analysisMemory,
    "referenceDetailSlots",
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
  const zeroBackboneTargetSlots = ensureArrayField(
    analysisMemory,
    "zeroBackboneTargetSlots",
    backboneTargetLength,
  );
  const zeroDetailTargetSlots = ensureArrayField(
    analysisMemory,
    "zeroDetailTargetSlots",
    detailTargetLength,
  );
  const nonAcousticBackboneTarget = ensureTargetBuildField(
    analysisMemory,
    "nonAcousticBackboneTarget",
    Math.min(capacity, BACKBONE_STACK_SLOTS),
  );
  const nonAcousticDetailTarget = ensureTargetBuildField(
    analysisMemory,
    "nonAcousticDetailTarget",
    Math.min(capacity, DETAIL_STACK_SLOTS),
  );
  const nonAcousticPeakDriverScratch = ensureTargetBuildField(
    analysisMemory,
    "nonAcousticPeakDriverScratch",
    Math.min(capacity, BACKBONE_STACK_SLOTS),
  );
  const acousticBackboneTarget = ensureTargetBuildField(
    analysisMemory,
    "acousticBackboneTarget",
    Math.min(capacity, BACKBONE_STACK_SLOTS),
  );
  const acousticDetailTarget = ensureTargetBuildField(
    analysisMemory,
    "acousticDetailTarget",
    Math.min(capacity, DETAIL_STACK_SLOTS),
  );
  if (!analysisMemory.backboneState || !analysisMemory.detailState) {
    const replacement = createAudioFeatureState(capacity).analysis;
    analysisMemory.backboneState = replacement.backboneState;
    analysisMemory.detailState = replacement.detailState;
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
    backboneSlots,
    detailSlots,
    backbonePhaseSlots,
    detailPhaseSlots,
    modeSlots,
    signalModeSlots,
    backboneColorSlots,
    detailColorSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroBackboneTargetSlots,
    zeroDetailTargetSlots,
    nonAcousticBackboneTarget,
    nonAcousticDetailTarget,
    nonAcousticPeakDriverScratch,
    acousticBackboneTarget,
    acousticDetailTarget,
    modalExcitationState: analysisMemory.modalExcitationState,
    backboneState: analysisMemory.backboneState,
    detailState: analysisMemory.detailState,
    bandState: analysisMemory.bandState,
    previousSpectrum: analysisMemory.previousSpectrum,
  };
}

function getFrameTimestamp() {
  return performance.now();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
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
  auditState.frozenBackboneSlots.fill(0);
  auditState.frozenDetailSlots.fill(0);
  auditState.frozenModeSlots.fill(0);
  auditState.frozenBackboneColorSlots.fill(0);
  auditState.frozenDetailColorSlots.fill(0);
}

function shouldBuildDetailedDebug(auditSettings) {
  return Boolean(auditSettings?.enabled);
}

function countNonZeroFFTBinCount(fftMagnitudes) {
  return countNonZeroFftBins(fftMagnitudes);
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

function buildBackboneStateSummary(backboneState) {
  if (!backboneState) {
    return null;
  }

  return {
    uniqueModeCount: backboneState.uniqueModeCount ?? 0,
    harmonicSupport: cloneFloat32Array(backboneState.harmonicSupport),
    fundamental: backboneState.fundamental ?? 0,
    fundamentalConfidence: backboneState.fundamentalConfidence ?? 0,
    driverFrequency: backboneState.driverFrequency ?? 0,
    candidateFrequency: backboneState.candidateFrequency ?? 0,
    candidateConfidence: backboneState.candidateConfidence ?? 0,
    candidateFrames: backboneState.candidateFrames ?? 0,
    candidatePeriodicity: backboneState.candidatePeriodicity ?? 0,
    candidateHarmonicSupport: backboneState.candidateHarmonicSupport ?? 0,
    candidateDirectSupport: backboneState.candidateDirectSupport ?? 0,
    candidateLowEnergy: backboneState.candidateLowEnergy ?? false,
    voicingActive: backboneState.voicingActive ?? false,
    highCandidateRejected: backboneState.highCandidateRejected ?? false,
    rejectionReason: backboneState.rejectionReason ?? "none",
    latchHoldFrames: backboneState.latchHoldFrames ?? 0,
    latchLowSupportFrames: backboneState.latchLowSupportFrames ?? 0,
  };
}

function buildDetailStateSummary(detailState) {
  if (!detailState) {
    return null;
  }

  return {
    uniqueModeCount: detailState.uniqueModeCount ?? 0,
  };
}

function deriveModalObservationEnergy(
  modalCoefficientEnergy,
  modalResponseBackboneEnergy,
  modalResponseDetailEnergy,
) {
  return clamp01(
    Math.max(
      modalCoefficientEnergy,
      modalResponseBackboneEnergy,
      modalResponseDetailEnergy,
    ),
  );
}

function readModalResponseRenderEnergy(structuralMetrics, fallbackEnergy = 0) {
  return clamp01(
    structuralMetrics?.modalResponseRenderEnergy ?? fallbackEnergy,
  );
}

function readModalResponseRenderBackboneEnergy(
  structuralMetrics,
  fallbackEnergy = 0,
) {
  return clamp01(
    structuralMetrics?.modalResponseRenderBackboneEnergy ?? fallbackEnergy,
  );
}

function readModalResponseRenderDetailEnergy(
  structuralMetrics,
  fallbackEnergy = 0,
) {
  return clamp01(
    structuralMetrics?.modalResponseRenderDetailEnergy ?? fallbackEnergy,
  );
}

function hasNoRenderSourceForcing(analysisResult) {
  if (analysisResult?.liveInputHardSilenceActive) {
    return true;
  }

  return (
    (analysisResult?.avgAmplitude ?? 0) <= 0 &&
    (analysisResult?.analyserRms ?? 0) <= 0 &&
    (analysisResult?.preModalFftPeak ?? 0) <= 0
  );
}

function isAnalysisRenderAuthorityCut(analysisResult) {
  return Boolean(
    analysisResult?.renderAuthorityCut ||
      analysisResult?.structuralMetrics?.renderAuthorityCut ||
      analysisResult?.structuralMetrics?.modalResponseRenderSourceCutSuppressed,
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
      modalCoefficientEnergy > SOURCE_CUT_MODAL_FORCING_EPSILON ||
      observationEnergy > SOURCE_CUT_MODAL_FORCING_EPSILON ||
      modalVisibilityEnergy > SOURCE_CUT_MODAL_FORCING_EPSILON ||
      modalObserverVisibilityEnergy > SOURCE_CUT_MODAL_FORCING_EPSILON)
  );
}

function buildDebugSummary({
  inputMode,
  analysisInputMode = inputMode,
  soundActive,
  micActive,
  pitchSource = "none",
  analysisEngine = "none",
  fieldState = FIELD_STATES.idle,
  renderAuthorityCut = false,
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
  backboneState,
  detailState,
  dominantFrequency = 0,
  dominantAmplitude = 0,
  avgAmplitude = 0,
  analyserRms = 0,
  fftMagnitudes,
  nonZeroFFTBinCount = null,
  backboneSlots,
  detailSlots,
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
  const backboneModeCount = countActiveSlots(
    backboneSlots,
    BACKBONE_STACK_SLOTS,
  );
  const detailModeCount = countActiveSlots(detailSlots, DETAIL_STACK_SLOTS);
  const modeSlotCount = countActiveSlots(modeSlots, MAX_STACK_SLOTS);
  const modalVisibilitySummary = deriveModalVisibilityComponents({
    modeSlots,
    modeCapacity: MAX_STACK_SLOTS,
    structuralMetrics,
    hardSilent: liveInputHardSilenceActive,
    sourceNormalization,
    bandEnergies,
    activeBackboneModeCount: backboneModeCount,
    nonZeroFFTBinCount:
      nonZeroFFTBinCount ?? countNonZeroFFTBinCount(fftMagnitudes),
    periodicity: backboneState?.candidatePeriodicity ?? 0,
  });
  const modalVisibilityDriveEnergy = clamp01(
    structuralMetrics?.modalDriveEnergy ?? 0,
  );
  const modalObserverVisibilityEnergy =
    modalVisibilitySummary.modalObserverVisibilityEnergy ?? 0;
  const retainedModalCoefficientEnergy = clamp01(
    sumSlotAmplitudeTotal(modeSlots, MAX_STACK_SLOTS),
  );
  const retainedModalResponseBackboneEnergy = clamp01(
    structuralMetrics?.modalResponseBackboneEnergy ?? 0,
  );
  const retainedModalResponseDetailEnergy = clamp01(
    structuralMetrics?.modalResponseDetailEnergy ?? 0,
  );
  const modalCoefficientEnergy = readModalResponseRenderEnergy(
    structuralMetrics,
    retainedModalCoefficientEnergy,
  );
  const modalResponseBackboneEnergy = readModalResponseRenderBackboneEnergy(
    structuralMetrics,
    retainedModalResponseBackboneEnergy,
  );
  const modalResponseDetailEnergy = readModalResponseRenderDetailEnergy(
    structuralMetrics,
    retainedModalResponseDetailEnergy,
  );
  const observationEnergy = deriveModalObservationEnergy(
    modalCoefficientEnergy,
    modalResponseBackboneEnergy,
    modalResponseDetailEnergy,
  );

  return {
    audioInputMode: inputMode,
    pitchSource,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    requestedPitchSource: REQUESTED_PITCH_SOURCE,
    analysisEngine,
    fieldState,
    renderAuthorityCut,
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
    analysisSourceUsed: inputMode === "idle" ? "none" : analysisInputMode,
    fundamentalFrequency: backboneState?.fundamental ?? 0,
    fundamentalConfidence: backboneState?.fundamentalConfidence ?? 0,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    uniqueModeCount:
      (backboneState?.uniqueModeCount ?? 0) +
      (detailState?.uniqueModeCount ?? 0),
    nonZeroFFTBinCount:
      nonZeroFFTBinCount ?? countNonZeroFFTBinCount(fftMagnitudes),
    micFftNormGain,
    preModalFftPeak,
    postNormalizationFftPeak,
    modeSlotCount,
    backboneModeCount,
    detailModeCount,
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
    lowQBackboneVisibilityAuthority:
      modalVisibilitySummary.lowQBackboneVisibilityAuthority,
    lowQBackboneVisibilityEnergy:
      modalVisibilitySummary.lowQBackboneVisibilityEnergy,
    lowQBackboneTopologyFloor: modalVisibilitySummary.lowQBackboneTopologyFloor,
    lowQBackboneSourceSupport: modalVisibilitySummary.lowQBackboneSourceSupport,
    lowQBackboneVisibilityRejected:
      modalVisibilitySummary.lowQBackboneVisibilityRejected,
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
    driverFrequency: backboneState?.driverFrequency ?? dominantFrequency,
    driverLocked: backboneModeCount > 0,
    candidateFrequency: backboneState?.candidateFrequency ?? 0,
    candidateConfidence: backboneState?.candidateConfidence ?? 0,
    candidateFrames: backboneState?.candidateFrames ?? 0,
    periodicity: backboneState?.candidatePeriodicity ?? 0,
    candidateHarmonicSupport: backboneState?.candidateHarmonicSupport ?? 0,
    candidateDirectSupport: backboneState?.candidateDirectSupport ?? 0,
    candidateLowEnergy: backboneState?.candidateLowEnergy ?? false,
    voicingActive: backboneState?.voicingActive ?? false,
    highCandidateRejected: backboneState?.highCandidateRejected ?? false,
    rejectionReason: backboneState?.rejectionReason ?? "none",
    latchHoldFrames: backboneState?.latchHoldFrames ?? 0,
    latchLowSupportFrames: backboneState?.latchLowSupportFrames ?? 0,
    excitedModeCount: structuralMetrics?.excitedModeCount ?? 0,
    distributedExcitation: structuralMetrics?.distributedExcitation ?? 0,
    lowOrderModalEnergy: structuralMetrics?.lowOrderModalEnergy ?? 0,
    highOrderModalEnergy: structuralMetrics?.highOrderModalEnergy ?? 0,
    observedModalModeCount: structuralMetrics?.observedModalModeCount ?? 0,
    lowQBackboneModeCount: structuralMetrics?.lowQBackboneModeCount ?? 0,
    lowQBackboneEnergy: structuralMetrics?.lowQBackboneEnergy ?? 0,
    lowQObservedDrive: structuralMetrics?.lowQObservedDrive ?? 0,
    lowQObservedSnr: structuralMetrics?.lowQObservedSnr ?? 0,
    lowQObservedCoherence: structuralMetrics?.lowQObservedCoherence ?? 0,
    highQDetailModeCount: structuralMetrics?.highQDetailModeCount ?? 0,
    highQDetailEnergy: structuralMetrics?.highQDetailEnergy ?? 0,
    highQRingSupport: structuralMetrics?.highQRingSupport ?? 0,
    highQObservedDrive: structuralMetrics?.highQObservedDrive ?? 0,
    highQObservedSnr: structuralMetrics?.highQObservedSnr ?? 0,
    highQObservedCoherence: structuralMetrics?.highQObservedCoherence ?? 0,
    highQObservedNoiseFloor: structuralMetrics?.highQObservedNoiseFloor ?? 0,
    highQSparseResonatorAuthority:
      modalVisibilitySummary.highQSparseResonatorAuthority ??
      structuralMetrics?.highQSparseResonatorAuthority ??
      0,
    highQDenseSpectrumPressure:
      modalVisibilitySummary.highQDenseSpectrumPressure ??
      structuralMetrics?.highQDenseSpectrumPressure ??
      0,
    highQRetainedVisibilityRejected: Boolean(
      modalVisibilitySummary.highQRetainedVisibilityRejected ??
      structuralMetrics?.highQRetainedVisibilityRejected,
    ),
    modalPhaseAuthority: structuralMetrics?.modalPhaseAuthority ?? 0,
    highQPhaseAuthority: structuralMetrics?.highQPhaseAuthority ?? 0,
    lowQPhaseAuthority: structuralMetrics?.lowQPhaseAuthority ?? 0,
    modalPhaseOverlayModeCount:
      structuralMetrics?.modalPhaseOverlayModeCount ?? 0,
    modalPersistence: structuralMetrics?.modalPersistence ?? 0,
    modalDriveEnergy: structuralMetrics?.modalDriveEnergy ?? 0,
    modalResponseEnergy: structuralMetrics?.modalResponseEnergy ?? 0,
    modalResponseRenderEnergy:
      structuralMetrics?.modalResponseRenderEnergy ?? modalCoefficientEnergy,
    modalResponseRenderRawEnergy:
      structuralMetrics?.modalResponseRenderRawEnergy ?? modalCoefficientEnergy,
    modalResponseRenderSourceCutSuppressed: Boolean(
      structuralMetrics?.modalResponseRenderSourceCutSuppressed,
    ),
    modalResponseCurrentRenderSourceEvidence: Boolean(
      structuralMetrics?.modalResponseCurrentRenderSourceEvidence,
    ),
    modalResponseRenderAuthorityCutSilenceMs:
      structuralMetrics?.modalResponseRenderAuthorityCutSilenceMs ?? 0,
    modalResponseInputEnergy: structuralMetrics?.modalResponseInputEnergy ?? 0,
    modalResponseBackboneEnergy,
    modalResponseDetailEnergy,
    modalResponseModeCount: structuralMetrics?.modalResponseModeCount ?? 0,
    modalResponseBudgetScaleBackbone:
      structuralMetrics?.modalResponseBudgetScaleBackbone ?? 0,
    modalResponseBudgetScaleDetail:
      structuralMetrics?.modalResponseBudgetScaleDetail ?? 0,
    driveSource: structuralMetrics?.driveSource ?? "none",
    detailSignalAuthoritative:
      structuralMetrics?.detailSignalAuthoritative ?? false,
    detailSignalAuthoritativeReason:
      structuralMetrics?.detailSignalAuthoritativeReason ?? "none",
    detailSignalAuthoritativeCoverage:
      structuralMetrics?.detailSignalAuthoritativeCoverage ?? false,
    detailSignalAuthoritativeFreshSignal:
      structuralMetrics?.detailSignalAuthoritativeFreshSignal ?? false,
    detailSignalAuthoritativeFastAssist:
      structuralMetrics?.detailSignalAuthoritativeFastAssist ?? false,
    detailSignalAuthoritativeHighQ:
      structuralMetrics?.detailSignalAuthoritativeHighQ ?? false,
    detailShiftReleaseOverrideCount:
      structuralMetrics?.detailShiftReleaseOverrideCount ?? 0,
    detailShiftTrackingOverrideCount:
      structuralMetrics?.detailShiftTrackingOverrideCount ?? 0,
    projectionEnergyBudgetBackbone:
      structuralMetrics?.projectionEnergyBudgetBackbone ?? 0,
    projectionEnergyBudgetDetail:
      structuralMetrics?.projectionEnergyBudgetDetail ?? 0,
    projectionEnergyUsedBackbone:
      structuralMetrics?.projectionEnergyUsedBackbone ?? 0,
    projectionEnergyUsedDetail:
      structuralMetrics?.projectionEnergyUsedDetail ?? 0,
    projectionRawEnergyBackbone:
      structuralMetrics?.projectionRawEnergyBackbone ?? 0,
    projectionRawEnergyDetail:
      structuralMetrics?.projectionRawEnergyDetail ?? 0,
    projectionAllocatedEnergyBackbone:
      structuralMetrics?.projectionAllocatedEnergyBackbone ?? 0,
    projectionAllocatedEnergyDetail:
      structuralMetrics?.projectionAllocatedEnergyDetail ?? 0,
    projectionEnergyScaleBackbone:
      structuralMetrics?.projectionEnergyScaleBackbone ?? 0,
    projectionEnergyScaleDetail:
      structuralMetrics?.projectionEnergyScaleDetail ?? 0,
    projectionOverlapPressureBackbone:
      structuralMetrics?.projectionOverlapPressureBackbone ?? 0,
    projectionOverlapPressureDetail:
      structuralMetrics?.projectionOverlapPressureDetail ?? 0,
    projectionCompetitionReduction:
      structuralMetrics?.projectionCompetitionReduction ?? 0,
    projectionDenseSpectrumPressure:
      structuralMetrics?.projectionDenseSpectrumPressure ?? 0,
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
  backboneSlots,
  detailSlots,
  modeSlots,
  backboneColorSlots,
  detailColorSlots,
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
    backboneState: null,
    detailState: null,
    fftMagnitudes: null,
    backboneSlots,
    detailSlots,
    modeSlots,
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

  if (!shouldBuildDetailedDebug(auditSettings)) {
    return debug;
  }

  return {
    ...debug,
    harmonicSupport: Array.from(new Float32Array(HARMONIC_ORDERS.length)),
    spectralCandidates: [],
    currentModeSlots: Array.from(modeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    backboneSlots: Array.from(backboneSlots),
    detailSlots: Array.from(detailSlots),
    backboneColorSlots: Array.from(backboneColorSlots),
    detailColorSlots: Array.from(detailColorSlots),
    bandEnergies: Array.from(bandEnergies),
    slotAmplitudeDeltas: Array.from(new Float32Array(MAX_STACK_SLOTS)),
  };
}

function buildSilentFeatureFrame({
  featureState,
  inputMode,
  soundActive,
  micActive,
  isLiveInputActive,
  backboneSlots,
  detailSlots,
  backbonePhaseSlots,
  detailPhaseSlots,
  modeSlots,
  referenceModeSlots,
  backboneColorSlots,
  detailColorSlots,
  bandEnergies,
  backboneState,
  detailState,
  fftSize,
  auditSettings,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  backboneSlots.fill(0);
  detailSlots.fill(0);
  backbonePhaseSlots.fill(0);
  detailPhaseSlots.fill(0);
  modeSlots.fill(0);
  referenceModeSlots.fill(0);
  backboneColorSlots.fill(0);
  detailColorSlots.fill(0);
  bandEnergies.fill(0);
  clearModalStack(backboneState);
  clearModalStack(detailState);

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
    renderAuthorityCut: false,
    renderAuthority: false,
    isLiveInputActive,
    soundActive,
    micActive,
    averageAmplitude: 0,
    fftMagnitudes: silentFft,
    backboneSlots,
    detailSlots,
    backbonePhaseSlots,
    detailPhaseSlots,
    backboneColorSlots,
    detailColorSlots,
    bandEnergies,
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    structureSignal: 0,
    energySignal: 0,
    modalCoefficientEnergy: 0,
    retainedModalCoefficientEnergy: 0,
    modalResponseBackboneEnergy: 0,
    modalResponseDetailEnergy: 0,
    modalResponseRenderEnergy: 0,
    modalResponseRenderRawEnergy: 0,
    modalResponseRenderSourceCutSuppressed: false,
    modalResponseCurrentRenderSourceEvidence: false,
    modalResponseRenderAuthorityCutSilenceMs: 0,
    observationEnergy: 0,
    modalVisibilityEnergy: 0,
    modalObserverVisibilityEnergy: 0,
    modalVisibilityRetainedHighQEnergy: 0,
    lowQBackboneVisibilityAuthority: 0,
    lowQBackboneVisibilityEnergy: 0,
    lowQBackboneTopologyFloor: 0,
    lowQBackboneSourceSupport: 0,
    lowQBackboneVisibilityRejected: false,
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
    modeSlots,
    referenceModeSlots,
    sourceMode: "silent",
    debug: buildZeroDebugSnapshot({
      inputMode,
      soundActive,
      micActive,
      referenceModeSlots,
      bandEnergies,
      backboneSlots,
      detailSlots,
      modeSlots,
      backboneColorSlots,
      detailColorSlots,
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
    const bin = Math.round((frequency / nyquist) * (fftMagnitudes.length - 1));
    const index = Math.max(0, Math.min(fftMagnitudes.length - 1, bin));
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
}) {
  const spectrum = fftMagnitudes ?? new Float32Array(0);
  const peaks = findSpectralPeakFrequencies(
    spectrum,
    sampleRate,
    fftSize,
    LIVE_INPUT_RESONANCE_PEAK_COUNT,
  );
  let peakAmplitude = 0;
  for (let i = 0; i < spectrum.length; i++) {
    peakAmplitude = Math.max(peakAmplitude, spectrum[i] ?? 0);
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
    spectralCentroid: computeSpectralCentroid(spectrum, sampleRate),
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

  const hardGateActive = detectLiveInputNoiseGate({
    injectTestTone,
    inputMode,
    avgAmplitude,
    rms,
    fftMagnitudes,
    sampleRate,
    fftSize,
    micAnalysisSettings: { acousticIntent },
  });
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

  const nyquist = sampleRate * 0.5;
  const sums = new Float32Array(BAND_BUCKET_COUNT);
  const squareSums = new Float32Array(BAND_BUCKET_COUNT);
  const peaks = new Float32Array(BAND_BUCKET_COUNT);
  const counts = new Float32Array(BAND_BUCKET_COUNT);

  for (let i = 0; i < fftMagnitudes.length; i++) {
    const frequency = (i / Math.max(1, fftMagnitudes.length - 1)) * nyquist;
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

function computeSpectralBandOutputs(fftMagnitudes, sampleRate) {
  const spectralBandEnergies = new Float32Array(SPECTRAL_BAND_6_COUNT);
  if (!fftMagnitudes?.length || !sampleRate) {
    return {
      spectralBandEnergies,
      trebleBroadbandEnergy: 0,
      trebleTonalEnergy: 0,
    };
  }

  const nyquist = sampleRate * 0.5;
  const sums = new Float32Array(SPECTRAL_BAND_6_COUNT);
  const counts = new Float32Array(SPECTRAL_BAND_6_COUNT);
  let trebleSum = 0;
  let trebleLogSum = 0;
  let trebleCount = 0;
  let treblePeakEnergy = 0;

  for (let i = 0; i < fftMagnitudes.length; i++) {
    const frequency = (i / Math.max(1, fftMagnitudes.length - 1)) * nyquist;
    const amplitude = fftMagnitudes[i] ?? 0;

    let bandIndex = SPECTRAL_BAND_6_COUNT - 1;
    for (let j = 0; j < SPECTRAL_BAND_6_LIMITS_HZ.length; j++) {
      if (frequency <= SPECTRAL_BAND_6_LIMITS_HZ[j]) {
        bandIndex = j;
        break;
      }
    }
    sums[bandIndex] += amplitude;
    counts[bandIndex] += 1;

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

  for (let i = 0; i < SPECTRAL_BAND_6_COUNT; i++) {
    spectralBandEnergies[i] =
      counts[i] > 0 ? Math.min(1, sums[i] / counts[i]) : 0;
  }

  let trebleFlatness = 0;
  let trebleMean = 0;
  if (trebleCount > 0) {
    trebleMean = trebleSum / trebleCount;
    const trebleGeometricMean = Math.exp(trebleLogSum / trebleCount);
    trebleFlatness =
      trebleMean > 1e-8 ? Math.min(1, trebleGeometricMean / trebleMean) : 0;
  }

  const trebleBroadbandEnergy = clamp01(trebleMean * trebleFlatness * 6);
  const trebleTonalEnergy = clamp01(
    treblePeakEnergy * (1 - trebleFlatness) * 4,
  );

  return { spectralBandEnergies, trebleBroadbandEnergy, trebleTonalEnergy };
}

function computeSpectralCentroid(fftMagnitudes, sampleRate) {
  if (!fftMagnitudes?.length || !sampleRate) return 0;

  const nyquist = sampleRate * 0.5;
  let weightedFrequency = 0;
  let amplitudeTotal = 0;
  for (let i = 0; i < fftMagnitudes.length; i++) {
    const amplitude = fftMagnitudes[i] ?? 0;
    if (amplitude <= 0) continue;
    const frequency = (i / Math.max(1, fftMagnitudes.length - 1)) * nyquist;
    weightedFrequency += frequency * amplitude;
    amplitudeTotal += amplitude;
  }

  if (amplitudeTotal <= 1e-6) return 0;
  return Math.min(1, weightedFrequency / amplitudeTotal / Math.max(1, nyquist));
}

function computeSpectralFlux(fftMagnitudes, previousSpectrum) {
  if (!fftMagnitudes?.length || !previousSpectrum?.length) return 0;

  const limit = Math.min(fftMagnitudes.length, previousSpectrum.length);
  let positiveDelta = 0;
  for (let i = 0; i < limit; i++) {
    const delta = (fftMagnitudes[i] ?? 0) - (previousSpectrum[i] ?? 0);
    if (delta > 0) positiveDelta += delta;
  }

  return Math.min(1, positiveDelta / Math.max(1, limit));
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

function emptyLowQBackboneVisibility({ rejected = false } = {}) {
  return rejected
    ? {
        ...EMPTY_LOW_Q_BACKBONE_VISIBILITY,
        lowQBackboneVisibilityRejected: true,
      }
    : EMPTY_LOW_Q_BACKBONE_VISIBILITY;
}

function deriveLowQBackboneVisibilityAuthority({
  structuralMetrics = null,
  hardSilent = false,
  sourceNormalization = undefined,
  bandEnergies = null,
  activeBackboneModeCount = 0,
} = {}) {
  const lowQBackboneModeCount = structuralMetrics?.lowQBackboneModeCount ?? 0;
  const lowQBackboneEnergy = clamp01(
    structuralMetrics?.lowQBackboneEnergy ?? 0,
  );
  const hasLowQBackboneCandidate =
    lowQBackboneModeCount > 0 ||
    lowQBackboneEnergy > 0 ||
    activeBackboneModeCount > 0;

  if (hardSilent || !structuralMetrics) {
    return emptyLowQBackboneVisibility({
      rejected: hasLowQBackboneCandidate,
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
    lowQBackboneModeCount > 0 && lowQBackboneEnergy > 0;
  const snrGate = admittedLowQObservedMode
    ? Math.max(
        LOW_Q_BACKBONE_VISIBILITY_SNR_FLOOR,
        smoothstep(
          LOW_Q_BACKBONE_VISIBILITY_SNR_START,
          LOW_Q_BACKBONE_VISIBILITY_SNR_END,
          lowQObservedSnr,
        ),
      )
    : smoothstep(
        LOW_Q_BACKBONE_VISIBILITY_SNR_START,
        LOW_Q_BACKBONE_VISIBILITY_SNR_END,
        lowQObservedSnr,
      );
  const denseSpectrumPressure = clamp01(
    structuralMetrics.projectionDenseSpectrumPressure ??
      structuralMetrics.denseSpectrumPressure ??
      structuralMetrics.distributedExcitation ??
      0,
  );
  const authority = clamp01(
    smoothstep(
      LOW_Q_BACKBONE_VISIBILITY_ENERGY_START,
      LOW_Q_BACKBONE_VISIBILITY_ENERGY_END,
      lowQBackboneEnergy,
    ) *
      smoothstep(
        LOW_Q_BACKBONE_VISIBILITY_COHERENCE_START,
        LOW_Q_BACKBONE_VISIBILITY_COHERENCE_END,
        lowQCoherence,
      ) *
      snrGate *
      smoothstep(
        LOW_Q_BACKBONE_VISIBILITY_SOURCE_START,
        LOW_Q_BACKBONE_VISIBILITY_SOURCE_END,
        sourceSupport,
      ) *
      smoothstep(0, 2, activeBackboneModeCount) *
      (1 - LOW_Q_BACKBONE_VISIBILITY_DENSE_REDUCTION * denseSpectrumPressure),
  );

  return {
    lowQBackboneVisibilityAuthority: authority,
    lowQBackboneVisibilityEnergy:
      LOW_Q_BACKBONE_VISIBILITY_ENERGY_MAX * authority,
    lowQBackboneTopologyFloor: LOW_Q_BACKBONE_TOPOLOGY_FLOOR_MAX * authority,
    lowQBackboneSourceSupport: sourceSupport,
    lowQBackboneVisibilityRejected: Boolean(
      hasLowQBackboneCandidate && authority <= 0,
    ),
  };
}

function deriveModalObserverVisibilityComponents({
  structuralMetrics = null,
  hardSilent = false,
  sourceNormalization = undefined,
  bandEnergies = null,
  activeBackboneModeCount = 0,
  nonZeroFFTBinCount = 0,
  periodicity = 0,
} = {}) {
  if (hardSilent || !structuralMetrics) {
    return EMPTY_MODAL_OBSERVER_VISIBILITY;
  }

  const modeCoherence = clamp01(structuralMetrics.modeCoherence ?? 0);
  const modalPersistence = clamp01(structuralMetrics.modalPersistence ?? 0);
  const highQDetailModeCount = structuralMetrics.highQDetailModeCount ?? 0;
  const highQDetailEnergy = clamp01(structuralMetrics.highQDetailEnergy ?? 0);
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
    highQDetailEnergy,
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
    highQDetailEnergy,
  );
  const highQSupportGate = smoothstep(
    MODAL_OBSERVER_HIGH_Q_SUPPORT_START,
    MODAL_OBSERVER_HIGH_Q_SUPPORT_END,
    highQSignalSupport,
  );
  const highQCountGate = smoothstep(1, 4, highQDetailModeCount);
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

  const lowQBackboneModeCount = structuralMetrics.lowQBackboneModeCount ?? 0;
  const lowQBackboneEnergy = clamp01(structuralMetrics.lowQBackboneEnergy ?? 0);
  const lowQObservedCoherence = clamp01(
    structuralMetrics.lowQObservedCoherence ?? modeCoherence,
  );
  const lowQObservedSnr = clamp01(structuralMetrics.lowQObservedSnr ?? 0);
  const lowQSignalSupport = Math.max(0.35, lowQObservedSnr);
  const lowQEnergyGate = smoothstep(
    MODAL_OBSERVER_LOW_Q_ENERGY_START,
    MODAL_OBSERVER_LOW_Q_ENERGY_END,
    lowQBackboneEnergy,
  );
  const lowQCountGate = smoothstep(0, 3, lowQBackboneModeCount);
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
  const lowQBackboneVisibility = deriveLowQBackboneVisibilityAuthority({
    structuralMetrics,
    hardSilent,
    sourceNormalization,
    bandEnergies,
    activeBackboneModeCount,
  });

  const detailSlotFloorTotal = Math.min(
    MODAL_OBSERVER_DETAIL_SLOT_FLOOR_TOTAL_MAX,
    highQObserverVisibilityEnergy * 0.055,
  );
  const lowQObserverBackboneSlotFloorTotal = Math.min(
    MODAL_OBSERVER_BACKBONE_SLOT_FLOOR_TOTAL_MAX,
    lowQObserverVisibilityEnergy * 0.045,
  );
  const backboneSlotFloorTotal = Math.max(
    lowQObserverBackboneSlotFloorTotal,
    lowQBackboneVisibility.lowQBackboneTopologyFloor,
  );
  const modalObserverTopologyFloor = Math.max(
    detailSlotFloorTotal,
    backboneSlotFloorTotal,
  );

  return {
    modalObserverVisibilityEnergy: clamp01(
      Math.max(
        highQObserverVisibilityEnergy,
        lowQObserverVisibilityEnergy,
        lowQBackboneVisibility.lowQBackboneVisibilityEnergy,
      ),
    ),
    highQObserverVisibilityEnergy,
    lowQObserverVisibilityEnergy,
    modalObserverTopologyFloor,
    detailSlotFloorTotal,
    backboneSlotFloorTotal,
    ...lowQBackboneVisibility,
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
  activeBackboneModeCount = 0,
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
    ...EMPTY_LOW_Q_BACKBONE_VISIBILITY,
    retainedHighQModalVisibility: 0,
    highQSparseResonatorAuthority: 0,
    highQDenseSpectrumPressure: 0,
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
    activeBackboneModeCount,
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
  const highQDetailModeCount = structuralMetrics?.highQDetailModeCount ?? 0;
  const highQDetailEnergy = clamp01(structuralMetrics?.highQDetailEnergy ?? 0);
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
    highQDetailEnergy,
  );
  const hasRetainedHighQObserverAuthority =
    highQDetailModeCount >= 2 &&
    highQDetailEnergy > 0 &&
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
      highQDetailEnergy * highQRingSupport,
    ) *
    smoothstep(2, 5, highQDetailModeCount) *
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
      highQDetailEnergy,
    ) *
    smoothstep(1, 4, highQDetailModeCount) *
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
    lowQBackboneVisibilityAuthority:
      observerVisibility.lowQBackboneVisibilityAuthority,
    lowQBackboneVisibilityEnergy:
      observerVisibility.lowQBackboneVisibilityEnergy,
    lowQBackboneTopologyFloor: observerVisibility.lowQBackboneTopologyFloor,
    lowQBackboneSourceSupport: observerVisibility.lowQBackboneSourceSupport,
    lowQBackboneVisibilityRejected:
      observerVisibility.lowQBackboneVisibilityRejected,
    retainedHighQModalVisibility,
    highQSparseResonatorAuthority,
    highQDenseSpectrumPressure: observerVisibility.highQDenseSpectrumPressure,
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
  backboneState,
  detailState,
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
  activeBackboneModeCount = 0,
  nonZeroFFTBinCount = 0,
}) {
  const activeModeCount = countActiveSlots(modeSlots, modeCapacity);
  const uniqueModeCount =
    (backboneState?.uniqueModeCount ?? 0) + (detailState?.uniqueModeCount ?? 0);
  const harmonicSupport = averageArray(backboneState?.harmonicSupport);
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
  // backbone modes. Floor of 0.12 keeps some readout at moderate volumes.
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
    activeBackboneModeCount,
    nonZeroFFTBinCount,
    periodicity: backboneState?.candidatePeriodicity ?? 0,
  });
  const modalVisibilityEnergy = modalVisibilityComponents.modalVisibilityEnergy;
  const modalObserverVisibilityEnergy =
    modalVisibilityComponents.modalObserverVisibilityEnergy ?? 0;
  const modalVisibilityRetainedHighQEnergy =
    modalVisibilityComponents.retainedHighQModalVisibility ?? 0;
  const lowQBackboneVisibilityAuthority =
    modalVisibilityComponents.lowQBackboneVisibilityAuthority ?? 0;
  const lowQBackboneVisibilityEnergy =
    modalVisibilityComponents.lowQBackboneVisibilityEnergy ?? 0;
  const lowQBackboneTopologyFloor =
    modalVisibilityComponents.lowQBackboneTopologyFloor ?? 0;
  const lowQBackboneSourceSupport =
    modalVisibilityComponents.lowQBackboneSourceSupport ?? 0;
  const lowQBackboneVisibilityRejected = Boolean(
    modalVisibilityComponents.lowQBackboneVisibilityRejected,
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
      lowQBackboneVisibilityAuthority,
      lowQBackboneVisibilityEnergy,
      lowQBackboneTopologyFloor,
      lowQBackboneSourceSupport,
      lowQBackboneVisibilityRejected,
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
    lowQBackboneVisibilityAuthority,
    lowQBackboneVisibilityEnergy,
    lowQBackboneTopologyFloor,
    lowQBackboneSourceSupport,
    lowQBackboneVisibilityRejected,
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
  const bandEnergies = computeBandEnergies(fftMagnitudes, sampleRate, fftSize);
  const { spectralBandEnergies, trebleBroadbandEnergy, trebleTonalEnergy } =
    computeSpectralBandOutputs(fftMagnitudes, sampleRate);
  const spectralCentroid = computeSpectralCentroid(fftMagnitudes, sampleRate);
  const spectralFlux = computeSpectralFlux(fftMagnitudes, previousSpectrum);
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
  pitchSource,
  analysisEngine,
  fieldState,
  renderAuthorityCut = false,
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
  backboneState,
  detailState,
  dominantFrequency,
  dominantAmplitude,
  avgAmplitude,
  analyserRms,
  spectralCandidates,
  fftMagnitudes,
  nonZeroFFTBinCount = null,
  backboneSlots,
  detailSlots,
  modeSlots,
  backboneColorSlots,
  detailColorSlots,
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
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    renderAuthorityCut,
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
    backboneState,
    detailState,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    fftMagnitudes,
    nonZeroFFTBinCount,
    backboneSlots,
    detailSlots,
    modeSlots,
    spectralLightComponents:
      spectralLightComponents ??
      [
        ...(backboneState?.spectralLightComponents ?? []),
        ...(detailState?.spectralLightComponents ?? []),
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

  if (!shouldBuildDetailedDebug(auditSettings)) {
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
    harmonicSupport: Array.from(backboneState.harmonicSupport),
    spectralCandidates: spectralCandidates.map((peak) => ({
      frequency: peak.frequency,
      amplitude: peak.amplitude,
    })),
    currentModeSlots: Array.from(modeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    backboneSlots: Array.from(backboneSlots),
    detailSlots: Array.from(detailSlots),
    backboneColorSlots: Array.from(backboneColorSlots),
    detailColorSlots: Array.from(detailColorSlots),
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
    backboneSlots,
    detailSlots,
    backbonePhaseSlots,
    detailPhaseSlots,
    modeSlots,
    signalModeSlots,
    backboneColorSlots,
    detailColorSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroBackboneTargetSlots,
    zeroDetailTargetSlots,
    nonAcousticBackboneTarget,
    nonAcousticDetailTarget,
    nonAcousticPeakDriverScratch,
    acousticBackboneTarget,
    acousticDetailTarget,
    modalExcitationState,
    backboneState,
    detailState,
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

  if (!analysisSnapshot && !resolvedAuditSettings.injectTestTone) {
    if (!isAcousticLiveInput) {
      resetLiveInputGateState(analysisMemory.bandState, {
        inputMode,
        policy: liveInputPolicy,
        calibrationVersion,
      });
    }
    return {
      capacity,
      analysisMemory,
      backboneSlots,
      detailSlots,
      modeSlots,
      signalModeSlots,
      backboneColorSlots,
      detailColorSlots,
      referenceBackboneSlots,
      referenceDetailSlots,
      referenceModeSlots,
      signalReferenceModeSlots,
      bandEnergies,
      zeroBackboneTargetSlots,
      zeroDetailTargetSlots,
      backboneState,
      detailState,
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
      radius,
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
        backboneSlots,
        detailSlots,
        backbonePhaseSlots,
        detailPhaseSlots,
        modeSlots,
        backboneColorSlots,
        detailColorSlots,
        referenceModeSlots,
        bandEnergies,
        backboneState,
        detailState,
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
  const fileTransportSourceMuted = shouldMuteFileTransportSource({
    inputMode,
    status,
    auditSettings: resolvedAuditSettings,
  });
  const snapshot = fileTransportSourceMuted
    ? buildMutedAnalysisSnapshot(rawSnapshot, fftSize)
    : rawSnapshot;
  const resolvedSourceMode = fileTransportSourceMuted ? "silent" : sourceMode;

  const avgAmplitude = snapshot?.avgAmplitude ?? 0;
  const analyserRms = snapshot?.rms ?? 0;
  const fftMagnitudesSource =
    snapshot?.fftMagnitudes ?? new Float32Array(fftSize / 2);
  const preModalFftPeak = findPeakFftMagnitude(fftMagnitudesSource);
  const spectralCentroidHint = computeSpectralCentroid(
    fftMagnitudesSource,
    sampleRate,
  );
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

  return {
    analysisSnapshot,
    featureState,
    radius,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    cavityGeometry: requestedCavityGeometry,
    status,
    beatSettings,
    capacity,
    analysisMemory,
    backboneSlots,
    detailSlots,
    backbonePhaseSlots,
    detailPhaseSlots,
    modeSlots,
    signalModeSlots,
    backboneColorSlots,
    detailColorSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroBackboneTargetSlots,
    zeroDetailTargetSlots,
    nonAcousticBackboneTarget,
    nonAcousticDetailTarget,
    nonAcousticPeakDriverScratch,
    acousticBackboneTarget,
    acousticDetailTarget,
    modalExcitationState,
    backboneState,
    detailState,
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
    snapshot,
    avgAmplitude,
    analyserRms,
    fftMagnitudesSource,
    preModalFftPeak,
    spectralCentroidHint,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
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
    postNormalizationFftPeak: findPeakFftMagnitude(effectiveFftMagnitudes),
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
    (auditState.frozenBackboneSlots.some((value) => value !== 0) ||
      auditState.frozenDetailSlots.some((value) => value !== 0)),
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

  const backboneSlotsSource = hasFrozenProjection
    ? auditState.frozenBackboneSlots
    : (structuralState?.backboneSlotsSource ??
      preparedInputs.backboneState.slots);
  const detailSlotsSource = hasFrozenProjection
    ? auditState.frozenDetailSlots
    : (structuralState?.detailSlotsSource ?? preparedInputs.detailState.slots);
  const backbonePhaseSlotsSource =
    structuralState?.backbonePhaseSlotsSource ??
    preparedInputs.backbonePhaseSlots;
  const detailPhaseSlotsSource =
    structuralState?.detailPhaseSlotsSource ?? preparedInputs.detailPhaseSlots;
  const backboneColorSlotsSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenBackboneColorSlots
      : (structuralState?.backboneColorSlotsSource ??
        preparedInputs.backboneState.colorSlots)
    : null;
  const detailColorSlotsSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenDetailColorSlots
      : (structuralState?.detailColorSlotsSource ??
        preparedInputs.detailState.colorSlots)
    : null;
  const referenceBackboneSlotsSource =
    structuralState?.referenceBackboneSlotsSource ??
    preparedInputs.backboneState.referenceSlots;
  const referenceDetailSlotsSource =
    structuralState?.referenceDetailSlotsSource ??
    preparedInputs.detailState.referenceSlots;
  const activeBackboneModeCount = structuralState?.suppressedByFog
    ? 0
    : countActiveSlots(
        backboneSlotsSource,
        Math.min(capacity, BACKBONE_STACK_SLOTS),
      );
  const activeDetailModeCount = structuralState?.suppressedByFog
    ? 0
    : countActiveSlots(
        detailSlotsSource,
        Math.min(capacity, DETAIL_STACK_SLOTS),
      );

  return {
    freezeModeSlots,
    hasFrozenProjection,
    backboneSlotsSource,
    detailSlotsSource,
    backbonePhaseSlotsSource,
    detailPhaseSlotsSource,
    referenceBackboneSlotsSource,
    referenceDetailSlotsSource,
    backboneColorSlotsSource,
    detailColorSlotsSource,
    activeBackboneModeCount,
    activeDetailModeCount,
    activeModeCount: activeBackboneModeCount + activeDetailModeCount,
  };
}

function resolveStructuralSignalSources(preparedInputs, structuralState) {
  return {
    signalBackboneSlotsSource:
      structuralState?.signalBackboneSlotsSource ??
      structuralState?.backboneSlotsSource ??
      preparedInputs.backboneState.slots,
    signalDetailSlotsSource:
      structuralState?.signalDetailSlotsSource ??
      structuralState?.detailSlotsSource ??
      preparedInputs.detailState.slots,
    signalReferenceBackboneSlotsSource:
      structuralState?.signalReferenceBackboneSlotsSource ??
      structuralState?.referenceBackboneSlotsSource ??
      preparedInputs.backboneState.referenceSlots,
    signalReferenceDetailSlotsSource:
      structuralState?.signalReferenceDetailSlotsSource ??
      structuralState?.referenceDetailSlotsSource ??
      preparedInputs.detailState.referenceSlots,
  };
}

function applyObserverSlotFloor(slots, capacity, floorTotal) {
  if (!(floorTotal > 0) || !slots?.length) {
    return 0;
  }

  const limit = Math.min(capacity, Math.floor(slots.length / 4));
  let currentTotal = 0;
  for (let index = 0; index < limit; index += 1) {
    currentTotal += Math.max(0, slots[index * 4 + 3] ?? 0);
  }

  if (!(currentTotal > 0) || currentTotal >= floorTotal) {
    return 0;
  }

  const scale = floorTotal / currentTotal;
  for (let index = 0; index < limit; index += 1) {
    const offset = index * 4 + 3;
    const amplitude = Math.max(0, slots[offset] ?? 0);
    if (amplitude > 0) {
      slots[offset] = Math.min(1, amplitude * scale);
    }
  }

  return floorTotal - currentTotal;
}

function buildStructuralFingerprint({
  preparedInputs,
  structuralState,
  activeBackboneModeCount,
  activeDetailModeCount,
  activeModeCount,
}) {
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    structuralState,
  );
  const fogSuppressed = Boolean(structuralState?.suppressedByFog);

  return {
    activeBackboneModeCount,
    activeDetailModeCount,
    activeModeCount,
    dominantFrequency: structuralState?.dominantFrequency ?? 0,
    dominantAmplitude: structuralState?.dominantAmplitude ?? 0,
    analysisEngine: structuralState?.analysisEngine ?? "none",
    pitchSource: structuralState?.pitchSource ?? "none",
    usedDecay: Boolean(structuralState?.usedDecay),
    sourceMode: structuralState?.sourceMode ?? preparedInputs.sourceMode,
    backboneSignature: fogSuppressed
      ? 0
      : computeSlotSignature(
          projectionSources.backboneSlotsSource,
          Math.min(preparedInputs.capacity, BACKBONE_STACK_SLOTS),
        ),
    detailSignature: fogSuppressed
      ? 0
      : computeSlotSignature(
          projectionSources.detailSlotsSource,
          Math.min(preparedInputs.capacity, DETAIL_STACK_SLOTS),
        ),
    referenceBackboneSignature: computeSlotSignature(
      projectionSources.referenceBackboneSlotsSource,
      Math.min(preparedInputs.capacity, BACKBONE_STACK_SLOTS),
    ),
    referenceDetailSignature: computeSlotSignature(
      projectionSources.referenceDetailSlotsSource,
      Math.min(preparedInputs.capacity, DETAIL_STACK_SLOTS),
    ),
    backboneColorSignature:
      fogSuppressed || !projectionSources.backboneColorSlotsSource
        ? 0
        : computeColorSignature(
            projectionSources.backboneColorSlotsSource,
            Math.min(preparedInputs.capacity, BACKBONE_STACK_SLOTS),
          ),
    detailColorSignature:
      fogSuppressed || !projectionSources.detailColorSlotsSource
        ? 0
        : computeColorSignature(
            projectionSources.detailColorSlotsSource,
            Math.min(preparedInputs.capacity, DETAIL_STACK_SLOTS),
          ),
  };
}

function materializeAudioFeatureStructuralSnapshot(
  preparedInputs,
  structuralState,
  fastSignalState = null,
) {
  const {
    capacity,
    backboneSlots,
    detailSlots,
    backbonePhaseSlots,
    detailPhaseSlots,
    modeSlots,
    backboneColorSlots,
    detailColorSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    auditState,
  } = preparedInputs;
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    structuralState,
  );

  copyFloatArray(backboneSlots, projectionSources.backboneSlotsSource);
  copyFloatArray(detailSlots, projectionSources.detailSlotsSource);
  copyFloatArray(
    backbonePhaseSlots,
    projectionSources.backbonePhaseSlotsSource,
  );
  copyFloatArray(detailPhaseSlots, projectionSources.detailPhaseSlotsSource);
  const observerVisibility = deriveModalObserverVisibilityComponents({
    structuralMetrics: structuralState?.structuralMetrics,
    hardSilent: preparedInputs.liveInputHardSilenceActive,
    sourceNormalization: fastSignalState?.sourceNormalization,
    bandEnergies: fastSignalState?.bandEnergies,
    activeBackboneModeCount: projectionSources.activeBackboneModeCount,
  });
  applyObserverSlotFloor(
    backboneSlots,
    Math.min(capacity, BACKBONE_STACK_SLOTS),
    observerVisibility.backboneSlotFloorTotal,
  );
  applyObserverSlotFloor(
    detailSlots,
    Math.min(capacity, DETAIL_STACK_SLOTS),
    observerVisibility.detailSlotFloorTotal,
  );
  copyFloatArray(
    referenceBackboneSlots,
    projectionSources.referenceBackboneSlotsSource,
  );
  copyFloatArray(
    referenceDetailSlots,
    projectionSources.referenceDetailSlotsSource,
  );
  combineModalLayers(
    modeSlots,
    [
      { slots: backboneSlots, weight: 1 },
      { slots: detailSlots, weight: DETAIL_LAYER_WEIGHT },
    ],
    capacity,
  );
  combineModalLayers(
    referenceModeSlots,
    [
      { slots: referenceBackboneSlots, weight: 1 },
      { slots: referenceDetailSlots, weight: DETAIL_LAYER_WEIGHT },
    ],
    capacity,
  );

  if (projectionSources.backboneColorSlotsSource) {
    copyFloatArray(
      backboneColorSlots,
      projectionSources.backboneColorSlotsSource,
    );
    copyFloatArray(detailColorSlots, projectionSources.detailColorSlotsSource);
  } else {
    backboneColorSlots.fill(0);
    detailColorSlots.fill(0);
  }

  let returnedBackboneSlots = backboneSlots;
  let returnedDetailSlots = detailSlots;
  let returnedBackbonePhaseSlots = backbonePhaseSlots;
  let returnedDetailPhaseSlots = detailPhaseSlots;
  let returnedModeSlots = modeSlots;
  let returnedBackboneColorSlots = backboneColorSlots;
  let returnedDetailColorSlots = detailColorSlots;

  if (projectionSources.freezeModeSlots && auditState) {
    if (!projectionSources.hasFrozenProjection) {
      auditState.frozenBackboneSlots.set(backboneSlots);
      auditState.frozenDetailSlots.set(detailSlots);
      auditState.frozenModeSlots.set(modeSlots);
      auditState.frozenBackboneColorSlots.set(backboneColorSlots);
      auditState.frozenDetailColorSlots.set(detailColorSlots);
    }
    returnedBackboneSlots = auditState.frozenBackboneSlots;
    returnedDetailSlots = auditState.frozenDetailSlots;
    returnedBackbonePhaseSlots = backbonePhaseSlots;
    returnedDetailPhaseSlots = detailPhaseSlots;
    returnedModeSlots = auditState.frozenModeSlots;
    returnedBackboneColorSlots = auditState.frozenBackboneColorSlots;
    returnedDetailColorSlots = auditState.frozenDetailColorSlots;
  } else if (auditState) {
    emptyFrozenLayers(auditState);
  }

  let activeBackboneModeCount = projectionSources.activeBackboneModeCount;
  let activeDetailModeCount = projectionSources.activeDetailModeCount;
  let activeModeCount = projectionSources.activeModeCount;

  if (structuralState.suppressedByFog) {
    returnedBackboneSlots.fill(0);
    returnedDetailSlots.fill(0);
    returnedBackbonePhaseSlots.fill(0);
    returnedDetailPhaseSlots.fill(0);
    returnedModeSlots.fill(0);
    returnedBackboneColorSlots.fill(0);
    returnedDetailColorSlots.fill(0);
    activeBackboneModeCount = 0;
    activeDetailModeCount = 0;
    activeModeCount = 0;
  }

  return {
    backboneSlots: returnedBackboneSlots,
    detailSlots: returnedDetailSlots,
    backbonePhaseSlots: returnedBackbonePhaseSlots,
    detailPhaseSlots: returnedDetailPhaseSlots,
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    backboneColorSlots: returnedBackboneColorSlots,
    detailColorSlots: returnedDetailColorSlots,
    activeBackboneModeCount,
    activeDetailModeCount,
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
        slots: signalSources.signalBackboneSlotsSource,
        weight: 1,
      },
      {
        slots: signalSources.signalDetailSlotsSource,
        weight: DETAIL_LAYER_WEIGHT,
      },
    ],
    capacity,
  );
  combineModalLayers(
    signalReferenceModeSlots,
    [
      {
        slots: signalSources.signalReferenceBackboneSlotsSource,
        weight: 1,
      },
      {
        slots: signalSources.signalReferenceDetailSlotsSource,
        weight: DETAIL_LAYER_WEIGHT,
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
    activeBackboneModeCount: structuralState.activeBackboneModeCount,
    activeDetailModeCount: structuralState.activeDetailModeCount,
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
      backboneSlots:
        previousAnalysisResult?.backboneSlots ?? preparedInputs.backboneSlots,
      detailSlots:
        previousAnalysisResult?.detailSlots ?? preparedInputs.detailSlots,
      backbonePhaseSlots:
        previousAnalysisResult?.backbonePhaseSlots ??
        preparedInputs.backbonePhaseSlots,
      detailPhaseSlots:
        previousAnalysisResult?.detailPhaseSlots ??
        preparedInputs.detailPhaseSlots,
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
      backboneColorSlots:
        previousAnalysisResult?.backboneColorSlots ??
        preparedInputs.backboneColorSlots,
      detailColorSlots:
        previousAnalysisResult?.detailColorSlots ??
        preparedInputs.detailColorSlots,
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
    backboneSlotsSource: preparedInputs.backboneState.slots,
    detailSlotsSource: preparedInputs.detailState.slots,
    backbonePhaseSlotsSource: preparedInputs.backbonePhaseSlots,
    detailPhaseSlotsSource: preparedInputs.detailPhaseSlots,
    referenceBackboneSlotsSource: preparedInputs.backboneState.referenceSlots,
    referenceDetailSlotsSource: preparedInputs.detailState.referenceSlots,
    backboneColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.backboneState.colorSlots
      : null,
    detailColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.detailState.colorSlots
      : null,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    backboneSlots: preparedInputs.backboneSlots,
    detailSlots: preparedInputs.detailSlots,
    backbonePhaseSlots: preparedInputs.backbonePhaseSlots,
    detailPhaseSlots: preparedInputs.detailPhaseSlots,
    modeSlots: preparedInputs.modeSlots,
    signalModeSlots: preparedInputs.signalModeSlots,
    referenceModeSlots: preparedInputs.referenceModeSlots,
    signalReferenceModeSlots: preparedInputs.signalReferenceModeSlots,
    backboneColorSlots: preparedInputs.backboneColorSlots,
    detailColorSlots: preparedInputs.detailColorSlots,
    activeBackboneModeCount: 0,
    activeDetailModeCount: 0,
    activeModeCount: 0,
    dominantFrequency: 0,
    dominantAmplitude: 0,
    analysisEngine:
      preparedInputs.backboneState.analysisEngine !== "none"
        ? preparedInputs.backboneState.analysisEngine
        : preparedInputs.detailState.analysisEngine,
    pitchSource: "none",
    spectralCandidates: [],
    usedDecay: false,
    sourceMode: preparedInputs.sourceMode,
    suppressedByFog: false,
    backboneStateSource: preparedInputs.backboneState,
    detailStateSource: preparedInputs.detailState,
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
      fastSignalState,
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
  const resolvedBackboneState =
    resolvedStructural.backboneStateSource ?? preparedInputs.backboneState;
  const resolvedDetailState =
    resolvedStructural.detailStateSource ?? preparedInputs.detailState;
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
    nonZeroFFTBinCount: countNonZeroFFTBinCount(fastSignalState.fftMagnitudes),
    backboneSlots: resolvedStructural.backboneSlots,
    detailSlots: resolvedStructural.detailSlots,
    backbonePhaseSlots: resolvedStructural.backbonePhaseSlots,
    detailPhaseSlots: resolvedStructural.detailPhaseSlots,
    activeBackboneModeCount: resolvedStructural.activeBackboneModeCount,
    activeDetailModeCount: resolvedStructural.activeDetailModeCount,
    backboneColorSlots: resolvedStructural.backboneColorSlots,
    detailColorSlots: resolvedStructural.detailColorSlots,
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
    backboneState: resolvedBackboneState,
    detailState: resolvedDetailState,
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
    renderAuthorityCut: isAnalysisRenderAuthorityCut(resolvedStructural),
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
  const backboneStateSummary = buildBackboneStateSummary(
    analysisResult.backboneState,
  );
  const detailStateSummary = buildDetailStateSummary(
    analysisResult.detailState,
  );
  const spectralLightComponents = cloneSpectralLightComponents(
    [
      ...(analysisResult.backboneState?.spectralLightComponents ?? []),
      ...(analysisResult.detailState?.spectralLightComponents ?? []),
    ]
      .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
      .slice(0, 8),
  );
  const nonZeroFFTBinCount = countNonZeroFFTBinCount(
    analysisResult.fftMagnitudes,
  );
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
      backboneSlots: cloneFloat32Array(analysisResult.backboneSlots),
      detailSlots: cloneFloat32Array(analysisResult.detailSlots),
      backbonePhaseSlots: cloneFloat32Array(analysisResult.backbonePhaseSlots),
      detailPhaseSlots: cloneFloat32Array(analysisResult.detailPhaseSlots),
      activeBackboneModeCount: analysisResult.activeBackboneModeCount,
      activeDetailModeCount: analysisResult.activeDetailModeCount,
      backboneColorSlots: cloneFloat32Array(analysisResult.backboneColorSlots),
      detailColorSlots: cloneFloat32Array(analysisResult.detailColorSlots),
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
      backboneStateSummary,
      detailStateSummary,
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
      renderAuthorityCut: analysisResult.renderAuthorityCut === true,
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
  const backboneState =
    analysisResult.backboneStateSummary ?? analysisResult.backboneState;
  const detailState =
    analysisResult.detailStateSummary ?? analysisResult.detailState;
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
    lowQBackboneVisibilityAuthority,
    lowQBackboneVisibilityEnergy,
    lowQBackboneTopologyFloor,
    lowQBackboneSourceSupport,
    lowQBackboneVisibilityRejected,
  } = deriveCompositeSignals({
    inputMode: preparedInputs.analysisInputMode,
    modeCapacity: preparedInputs.capacity,
    signalNormalizationSlots: AUDIO_SLOT_CAPACITY,
    modeSlots: analysisResult.signalModeSlots ?? analysisResult.modeSlots,
    visibilityModeSlots: analysisResult.modeSlots,
    referenceModeSlots:
      analysisResult.signalReferenceModeSlots ??
      analysisResult.referenceModeSlots,
    backboneState,
    detailState,
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
    activeBackboneModeCount: analysisResult.activeBackboneModeCount,
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
    lowQBackboneVisibilityAuthority *= reusedAnalysisSourceAuthorityScale;
    lowQBackboneVisibilityEnergy *= reusedAnalysisSourceAuthorityScale;
    lowQBackboneTopologyFloor *= reusedAnalysisSourceAuthorityScale;
    lowQBackboneSourceSupport *= reusedAnalysisSourceAuthorityScale;
    modeCoherence *= reusedAnalysisSourceAuthorityScale;
  }
  const renderAuthorityCut = isAnalysisRenderAuthorityCut(analysisResult);
  const retainedModalCoefficientEnergy = clamp01(
    sumSlotAmplitudeTotal(analysisResult.modeSlots, preparedInputs.capacity),
  );
  const sourceModalCoefficientEnergy = clamp01(
    sumSlotAmplitudeTotal(
      analysisResult.signalModeSlots ?? analysisResult.modeSlots,
      preparedInputs.capacity,
    ),
  );
  const retainedModalResponseBackboneEnergy = clamp01(
    analysisResult.structuralMetrics?.modalResponseBackboneEnergy ?? 0,
  );
  const retainedModalResponseDetailEnergy = clamp01(
    analysisResult.structuralMetrics?.modalResponseDetailEnergy ?? 0,
  );
  let modalCoefficientEnergy = readModalResponseRenderEnergy(
    analysisResult.structuralMetrics,
    retainedModalCoefficientEnergy,
  );
  let modalResponseBackboneEnergy = readModalResponseRenderBackboneEnergy(
    analysisResult.structuralMetrics,
    retainedModalResponseBackboneEnergy,
  );
  let modalResponseDetailEnergy = readModalResponseRenderDetailEnergy(
    analysisResult.structuralMetrics,
    retainedModalResponseDetailEnergy,
  );
  let observationEnergy = deriveModalObservationEnergy(
    modalCoefficientEnergy,
    modalResponseBackboneEnergy,
    modalResponseDetailEnergy,
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

  if (renderAuthorityCut) {
    structureSignal = 0;
    energySignal = 0;
    changeSignal = 0;
    pulseSignal = 0;
    modalVisibilityEnergy = 0;
    modalObserverVisibilityEnergy = 0;
    modalVisibilityRetainedHighQEnergy = 0;
    lowQBackboneVisibilityAuthority = 0;
    lowQBackboneVisibilityEnergy = 0;
    lowQBackboneTopologyFloor = 0;
    lowQBackboneSourceSupport = 0;
    modeCoherence = 0;
    modalCoefficientEnergy = 0;
    modalResponseBackboneEnergy = 0;
    modalResponseDetailEnergy = 0;
    observationEnergy = 0;
    timbreSpread = 0;
    spectralNovelty = 0;
  }

  const sourceCutModalForcing =
    renderAuthorityCut ||
    (hasNoRenderSourceForcing(analysisResult) &&
      (analysisResult.usedDecay ||
        sourceModalCoefficientEnergy <= SOURCE_CUT_MODAL_FORCING_EPSILON));
  const observerAuthorizedActiveField =
    (analysisResult.activeModeCount ?? 0) > 0 &&
    !sourceCutModalForcing &&
    (preparedInputs.inputMode === "live" ||
      modalCoefficientEnergy > 0.02 ||
      modalVisibilityEnergy > 0.005);
  const fieldStateUsesDecay =
    analysisResult.usedDecay &&
    !observerAuthorizedActiveField &&
    (!sourceCutModalForcing || modalCoefficientEnergy > 0);
  const fieldStateActiveModeCount =
    !renderAuthorityCut &&
    (observerAuthorizedActiveField ||
      modalVisibilityEnergy > 0 ||
      (analysisResult.usedDecay &&
        (!sourceCutModalForcing || modalCoefficientEnergy > 0)))
      ? analysisResult.activeModeCount
      : 0;
  let { fieldState, hasModalField } = deriveFieldState({
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
    activeModeCount: fieldStateActiveModeCount,
    usedDecay: fieldStateUsesDecay,
  });
  let renderAuthority =
    !renderAuthorityCut &&
    hasFeatureFrameRenderAuthority({
      fieldState,
      hasModalField,
      activeModeCount: fieldStateActiveModeCount,
      modalCoefficientEnergy,
      observationEnergy,
      modalVisibilityEnergy,
      modalObserverVisibilityEnergy,
    });
  if (renderAuthorityCut) {
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
  let renderBackboneSlots = analysisResult.backboneSlots;
  let renderDetailSlots = analysisResult.detailSlots;
  let renderBackbonePhaseSlots = analysisResult.backbonePhaseSlots;
  let renderDetailPhaseSlots = analysisResult.detailPhaseSlots;
  let renderModeSlots = analysisResult.modeSlots;
  let renderReferenceModeSlots = analysisResult.referenceModeSlots;
  let renderBackboneColorSlots = analysisResult.backboneColorSlots;
  let renderDetailColorSlots = analysisResult.detailColorSlots;
  let renderBandEnergies = analysisResult.bandEnergies;
  let activeBackboneModeCount = analysisResult.activeBackboneModeCount;
  let activeDetailModeCount = analysisResult.activeDetailModeCount;
  let activeModeCount = analysisResult.activeModeCount;

  if (!renderAuthority) {
    preparedInputs.modeSlots.fill(0);
    preparedInputs.referenceModeSlots.fill(0);
    preparedInputs.backboneColorSlots.fill(0);
    preparedInputs.detailColorSlots.fill(0);
    preparedInputs.bandEnergies.fill(0);
    renderBackboneSlots = preparedInputs.zeroBackboneTargetSlots;
    renderDetailSlots = preparedInputs.zeroDetailTargetSlots;
    renderBackbonePhaseSlots = preparedInputs.zeroBackboneTargetSlots;
    renderDetailPhaseSlots = preparedInputs.zeroDetailTargetSlots;
    renderModeSlots = preparedInputs.modeSlots;
    renderReferenceModeSlots = preparedInputs.referenceModeSlots;
    renderBackboneColorSlots = preparedInputs.zeroBackboneTargetSlots;
    renderDetailColorSlots = preparedInputs.zeroDetailTargetSlots;
    renderBandEnergies = preparedInputs.bandEnergies;
    activeBackboneModeCount = 0;
    activeDetailModeCount = 0;
    activeModeCount = 0;
  }

  let debug = analysisResult.debug;
  if (!debug) {
    debug = finalizeFeatureDebugSnapshot({
      auditSettings: preparedInputs.resolvedAuditSettings,
      inputMode: preparedInputs.inputMode,
      pitchSource: analysisResult.pitchSource,
      analysisEngine: analysisResult.analysisEngine,
      fieldState,
      renderAuthorityCut,
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
      backboneState,
      detailState,
      dominantFrequency: analysisResult.dominantFrequency,
      dominantAmplitude: analysisResult.dominantAmplitude,
      avgAmplitude: analysisResult.avgAmplitude,
      analyserRms: analysisResult.analyserRms,
      spectralCandidates: analysisResult.spectralCandidates ?? [],
      fftMagnitudes: analysisResult.fftMagnitudes ?? null,
      nonZeroFFTBinCount: analysisResult.nonZeroFFTBinCount ?? null,
      backboneSlots: renderBackboneSlots,
      detailSlots: renderDetailSlots,
      backboneColorSlots: renderBackboneColorSlots,
      detailColorSlots: renderDetailColorSlots,
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
    debug.renderAuthorityCut !== renderAuthorityCut ||
    debug.renderAuthority !== renderAuthority ||
    debug.lowQBackboneVisibilityRejected !== lowQBackboneVisibilityRejected
  ) {
    debug = {
      ...debug,
      fieldState,
      renderAuthorityCut,
      renderAuthority,
      lowQBackboneVisibilityRejected,
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
    renderAuthorityCut,
    renderAuthority,
    isLiveInputActive: preparedInputs.status?.isLiveInputActive === true,
    soundActive: analysisResult.soundActive,
    micActive: analysisResult.micActive,
    averageAmplitude: analysisResult.avgAmplitude,
    fftMagnitudes: analysisResult.fftMagnitudes,
    backboneSlots: renderBackboneSlots,
    detailSlots: renderDetailSlots,
    backbonePhaseSlots: renderBackbonePhaseSlots,
    detailPhaseSlots: renderDetailPhaseSlots,
    activeBackboneModeCount,
    activeDetailModeCount,
    activeModeCount,
    backboneColorSlots: renderBackboneColorSlots,
    detailColorSlots: renderDetailColorSlots,
    bandEnergies: renderBandEnergies,
    spectralBandEnergies: analysisResult.spectralBandEnergies,
    trebleBroadbandEnergy: analysisResult.trebleBroadbandEnergy,
    trebleTonalEnergy: analysisResult.trebleTonalEnergy,
    transientEnergy: analysisResult.transientEnergy,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralFlux: analysisResult.spectralFlux,
    structureSignal,
    energySignal,
    modalCoefficientEnergy,
    retainedModalCoefficientEnergy,
    modalResponseBackboneEnergy,
    modalResponseDetailEnergy,
    modalResponseRenderEnergy: modalCoefficientEnergy,
    modalResponseRenderRawEnergy: renderAuthority
      ? (analysisResult.structuralMetrics?.modalResponseRenderRawEnergy ??
        modalCoefficientEnergy)
      : 0,
    modalResponseRenderSourceCutSuppressed: Boolean(
      analysisResult.structuralMetrics?.modalResponseRenderSourceCutSuppressed,
    ),
    modalResponseCurrentRenderSourceEvidence: Boolean(
      analysisResult.structuralMetrics?.modalResponseCurrentRenderSourceEvidence,
    ),
    modalResponseRenderAuthorityCutSilenceMs:
      analysisResult.structuralMetrics
        ?.modalResponseRenderAuthorityCutSilenceMs ?? 0,
    observationEnergy,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    lowQBackboneVisibilityAuthority,
    lowQBackboneVisibilityEnergy,
    lowQBackboneTopologyFloor,
    lowQBackboneSourceSupport,
    lowQBackboneVisibilityRejected,
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
    modeSlots: renderModeSlots,
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
