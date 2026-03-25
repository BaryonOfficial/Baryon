import {
  AUDIT_DEFAULTS,
  AUDIO_SIGNAL_NORMALIZATION_SLOTS,
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
  blendColorStack,
  blendModalStack,
  clearModalStack,
  combineModalLayers,
  copyFloatArray,
  countActiveSlots,
  createAudioFeatureState,
  createModalTargetBuild,
} from "./modalStack.js";
import {
  buildModalExcitationStructuralState,
  compareStructuralStates,
  createModalExcitationState,
} from "./modalExcitation.js";
import {
  buildModalSlotsFromFundamental,
  buildModalSlotsFromSpectralPeaks,
  findSpectralPeakFrequencies,
  HARMONIC_ORDERS,
  writeModalSlotsFromFundamental,
  writeModalSlotsFromPeakDrivers,
  writeModalSlotsFromSpectralPeaks,
} from "./modalResolvers.js";
import { detectVoicePitch } from "./pitchDetection.js";
import { deriveFieldState } from "./fieldState.js";
import { AUDIO_ANALYSIS_POLICY, SPECTRAL_MODAL_POLICY } from "./policy.js";
import { FIELD_STATES } from "./types.js";
import {
  buildChromaVector,
  smoothChromaInPlace,
  detectKeyFromChroma,
} from "./chromaAnalysis.js";
import { pitchClassToHue } from "./chromesthesia.js";
import { annotatePeakSalience } from "./harmonicSalience.js";
import {
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  LIVE_INPUT_ANALYSIS_CLASSES,
  normalizeLiveInputAnalysisClass,
  normalizeResolvedLiveInputAnalysisClass,
} from "../../core/audio/liveInputAnalysis.js";
import {
  isAcousticLiveInputDeviceKind,
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "../../core/audio/inputDeviceSemantics.js";

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
const LIVE_INPUT_VOICE_LOCK_MIN_PERIODICITY = 0.12;
const LIVE_INPUT_VOICE_LOCK_MIN_HARMONIC_SUPPORT = 0.1;
const LIVE_INPUT_VOICE_LOCK_MIN_DIRECT_SUPPORT = 0.18;
const LIVE_INPUT_VOICE_LOCK_MIN_SUPPORT_SOURCES = 3;
const LIVE_INPUT_VOICE_LOCK_MIN_RMS = 0.018;
const LIVE_INPUT_VOICE_LOCK_MIN_AVG_AMPLITUDE = 5;
const LIVE_INPUT_FOG_SUPPRESSION_MODE_COUNT = 10;
const LIVE_INPUT_FOG_SUPPRESSION_MAX_PERIODICITY = 0.05;

const BACKBONE_PEAK_COUNT = 5;
const DETAIL_PEAK_COUNT = 8;
const INTERNAL_CANDIDATE_POOL_SIZE = 24;
// Backbone selection stays in the low/mid range where modes produce clear
// standing-wave structure. Peaks above this are routed to detail only.
const BACKBONE_PEAK_MAX_HZ = 3200;
const BACKBONE_SALIENCE_WEIGHT = 1.2;
const DETAIL_LAYER_WEIGHT = 0.35;
const BACKBONE_ATTACK = 0.22;
const BACKBONE_RELEASE = 0.96;
const DETAIL_ATTACK = 0.55;
const DETAIL_RELEASE = 0.82;
const DETAIL_FRESH_CAP = 0;
const BACKBONE_FRESH_CAP = 4;
const BACKBONE_EVICTION_RELEASE = 0.78;
const DETAIL_EVICTION_RELEASE = 0.58;
const DETAIL_EVICTION_FRAMES = 2;
const BACKBONE_EVICTION_FRAMES = 4;
const DETAIL_NOVELTY_EVICTION_THRESHOLD = 0.8;
const BACKBONE_NOVELTY_EVICTION_THRESHOLD = 0.9;
const LOW_HARMONICITY_THRESHOLD = 0.28;
const BACKBONE_COLOR_ATTACK = 0.38;
const BACKBONE_COLOR_TRACKING = 0.22;
const BACKBONE_COLOR_RELEASE = 0.96;
const DETAIL_COLOR_ATTACK = 0.5;
const DETAIL_COLOR_TRACKING = 0.28;
const DETAIL_COLOR_RELEASE = 0.9;
const BACKBONE_COLOR_SLOT_LIMIT = 6;
const DETAIL_COLOR_SLOT_LIMIT = 7;
const BAND_LIMITS_HZ = [140, 600, 2400, 8000];
const SPECTRAL_BAND_6_LIMITS_HZ = [140, 400, 1200, 3200, 6400, 12000];
const SPECTRAL_BAND_6_COUNT = 6;
const TREBLE_FLATNESS_MIN_HZ = 3200;
const TREBLE_FLATNESS_MAX_HZ = 10000;
const LEGACY_ACOUSTIC_MIC_PROFILE = "voice-tone";
const DEFAULT_LIVE_INPUT_PROFILE = LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;
const LIVE_INPUT_CALIBRATION_WINDOW_MS = 1100;
const LIVE_INPUT_CALIBRATION_SMOOTHING_MS = 320;
const VOICE_DETAIL_HARMONIC_LIMIT = 5;
const VOICE_LATCH_DECAY = 0.94;
const VOICE_CANDIDATE_MATCH_TOLERANCE = 0.065;
const LIVE_INPUT_PROFILE_CONFIGS = Object.freeze({
  "acoustic-mic": Object.freeze({
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

export const DEFAULT_LIVE_INPUT_ANALYSIS_SETTINGS = Object.freeze({
  analysisClass: DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
});

export const LIVE_INPUT_ANALYSIS_OPTIONS = Object.freeze([
  Object.freeze({
    value: LIVE_INPUT_ANALYSIS_CLASSES.auto,
    label: "Auto",
    description:
      "Use heuristics. System capture and obvious loopback devices become line feeds; other inputs stay acoustic mics.",
  }),
  Object.freeze({
    value: LIVE_INPUT_ANALYSIS_CLASSES.lineFeed,
    label: "Line Feed",
    description:
      "Use the file-style analysis path for live feeds, virtual cables, and line-level capture.",
  }),
  Object.freeze({
    value: LIVE_INPUT_ANALYSIS_CLASSES.acousticMic,
    label: "Acoustic Mic",
    description:
      "Use the forgiving mic path for laptop mics, headsets, and room pickup.",
  }),
]);

export const LIVE_INPUT_PROFILE_OPTIONS = LIVE_INPUT_ANALYSIS_OPTIONS;

export { createAudioFeatureState, FIELD_STATES };

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

function getActiveAnalysisHints(analysisHints) {
  return analysisHints?.active ? analysisHints : null;
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
 *   profile?: "line-feed" | "acoustic-mic",
 *   calibrationVersion?: number,
 *   invalid?: boolean,
 *   invalidReason?: string,
 * }=} options
 */
function resetLiveInputGateState(
  bandState,
  {
    inputMode = "idle",
    profile = DEFAULT_LIVE_INPUT_PROFILE,
    calibrationVersion = bandState.liveInputCalibrationVersion ?? 0,
    invalid = false,
    invalidReason = "none",
  } = {},
) {
  bandState.liveInputMode = inputMode;
  bandState.liveInputProfile = profile;
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
 * @param {"line-feed" | "acoustic-mic"} profile
 * @param {{
 *   calibrationVersion?: number,
 *   invalid?: boolean,
 *   invalidReason?: string,
 * }=} options
 */
function beginLiveInputCalibration(
  bandState,
  currentFrameAtMs,
  profile,
  {
    calibrationVersion = bandState.liveInputCalibrationVersion ?? 0,
    invalid = false,
    invalidReason = "none",
  } = {},
) {
  resetLiveInputGateState(bandState, {
    inputMode: "live",
    profile,
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
 * @param {unknown} profile
 * @returns {"line-feed" | "acoustic-mic"}
 */
function normalizeLiveInputProfile(profile) {
  const normalized = normalizeLiveInputAnalysisClass(profile);
  if (normalized === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }
  if (profile === LEGACY_ACOUSTIC_MIC_PROFILE || profile === "ambient") {
    return DEFAULT_LIVE_INPUT_PROFILE;
  }
  return normalized === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic
    ? normalized
    : DEFAULT_LIVE_INPUT_PROFILE;
}

/**
 * @param {{ analysisClass?: unknown, profile?: unknown } | undefined} [settings]
 * @returns {{ analysisClass: import("../../core/audio/liveInputAnalysis.js").LiveInputAnalysisClass }}
 */
function normalizeLiveInputAnalysisSettings(settings = undefined) {
  return {
    analysisClass: normalizeLiveInputAnalysisClass(
      settings?.analysisClass ?? settings?.profile,
    ),
  };
}

/**
 * @param {unknown} [profile=DEFAULT_LIVE_INPUT_PROFILE]
 */
function getLiveInputProfileConfig(profile = DEFAULT_LIVE_INPUT_PROFILE) {
  const normalizedProfile = normalizeLiveInputProfile(profile);
  return (
    LIVE_INPUT_PROFILE_CONFIGS[normalizedProfile] ??
    LIVE_INPUT_PROFILE_CONFIGS[DEFAULT_LIVE_INPUT_PROFILE]
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

function resolveFeatureFrameLiveInputProfile({
  inputMode,
  resolvedLiveInputAnalysisClass,
  settings,
}) {
  if (inputMode === "live" || inputMode === "system") {
    return normalizeLiveInputProfile(resolvedLiveInputAnalysisClass);
  }

  return normalizeLiveInputProfile(
    settings?.analysisClass ?? settings?.profile,
  );
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
    profile: bandState.liveInputProfile ?? DEFAULT_LIVE_INPUT_PROFILE,
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

function setLayerMetadata(
  layerState,
  stackBuild,
  fundamental,
  confidence,
  engine,
) {
  layerState.harmonicSupport.set(stackBuild.harmonicSupport);
  layerState.fundamental = fundamental;
  layerState.fundamentalConfidence = confidence;
  layerState.analysisEngine = engine;
  layerState.uniqueModeCount = stackBuild.uniqueModeCount;
  layerState.lastStableAt = getFrameTimestamp();
  layerState.chromesthesiaComponents = stackBuild.components ?? [];
}

function clearLayerMetadata(layerState) {
  layerState.harmonicSupport.fill(0);
  layerState.fundamental = 0;
  layerState.fundamentalConfidence = 0;
  layerState.analysisEngine = "none";
  layerState.uniqueModeCount = 0;
  layerState.chromesthesiaComponents = [];
}

function slotModeKey(u, v, w) {
  return `${u}:${v}:${w}`;
}

function buildModeAmplitudeMap(slotBuffer, capacity) {
  const modeMap = new Map();
  const slotCount = Math.min(
    capacity,
    Math.floor((slotBuffer?.length ?? 0) / 4),
  );
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4;
    const amplitude = slotBuffer[offset + 3] ?? 0;
    if (amplitude <= 0) continue;
    modeMap.set(
      slotModeKey(
        slotBuffer[offset],
        slotBuffer[offset + 1],
        slotBuffer[offset + 2],
      ),
      amplitude,
    );
  }
  return modeMap;
}

function getPeakSelectionDistanceHz(kind, frequency) {
  const baseDistance = kind === "detail" ? 55 : 70;
  const proportionalDistance =
    kind === "detail" ? frequency * 0.08 : frequency * 0.12;
  return Math.max(baseDistance, proportionalDistance);
}

function scoreCandidatePeak(peak, analysisHints, kind) {
  const hints = getActiveAnalysisHints(analysisHints);
  const baseAmplitude = peak?.amplitude ?? 0;
  if (!(baseAmplitude > 0)) {
    return 0;
  }

  const normalizedFrequency = clamp01((peak.frequency ?? 0) / 5000);
  const bassBias =
    1 + (hints?.bassSalience ?? 0) * (1 - normalizedFrequency) * 0.55;
  const harmonicBias =
    kind === "backbone"
      ? 1 +
        (hints?.harmonicity ?? 0) * 0.65 +
        (hints?.pitchConfidence ?? 0) * 0.4 +
        (hints?.voicingProbability ?? 0) * 0.3
      : 1 + (hints?.harmonicity ?? 0) * 0.18;
  const changeBias =
    kind === "detail"
      ? 1 +
        (hints?.transientSalience ?? 0) * 0.55 +
        (hints?.novelty ?? 0) * 0.7 +
        (hints?.textureSpread ?? 0) * 0.35
      : 1 + (hints?.novelty ?? 0) * 0.18;

  const salienceBias =
    kind === "backbone"
      ? 1 + (peak.salienceScore ?? 0) * BACKBONE_SALIENCE_WEIGHT
      : 1;

  return baseAmplitude * bassBias * harmonicBias * changeBias * salienceBias;
}

function buildPreparedCandidatePool(candidates, analysisHints) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const hints = getActiveAnalysisHints(analysisHints);
  return candidates
    .map((candidate) => ({
      ...candidate,
      backboneBaseScore: scoreCandidatePeak(candidate, hints, "backbone"),
      detailBaseScore: scoreCandidatePeak(candidate, hints, "detail"),
    }))
    .filter(
      (candidate) =>
        candidate.backboneBaseScore > 0 || candidate.detailBaseScore > 0,
    );
}

function selectPreparedPeaks(preparedCandidates, limit, analysisHints, kind) {
  if (!Array.isArray(preparedCandidates) || limit <= 0) {
    return [];
  }

  const hints = getActiveAnalysisHints(analysisHints);
  const selected = [];
  const scoreKey =
    kind === "backbone" ? "backboneBaseScore" : "detailBaseScore";
  const remaining = preparedCandidates
    .filter((candidate) => (candidate?.[scoreKey] ?? 0) > 0)
    .map((candidate) => ({
      ...candidate,
      baseScore: candidate[scoreKey] ?? 0,
    }));

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const minDistanceHz =
        selected.length > 0
          ? Math.min(
              ...selected.map((entry) =>
                Math.abs((entry.frequency ?? 0) - (candidate.frequency ?? 0)),
              ),
            )
          : Number.POSITIVE_INFINITY;
      const diversityBoost =
        selected.length === 0
          ? 1
          : 1 +
            (hints?.textureSpread ?? 0) *
              clamp01(minDistanceHz / Math.max(1, candidate.frequency ?? 1));
      const candidateScore = candidate.baseScore * diversityBoost;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) {
      break;
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    const minDistance = getPeakSelectionDistanceHz(kind, chosen.frequency ?? 0);
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (
        Math.abs((remaining[index].frequency ?? 0) - (chosen.frequency ?? 0)) <
        minDistance
      ) {
        remaining.splice(index, 1);
      }
    }
  }

  return selected;
}

function selectScoredPeaks(candidates, limit, analysisHints, kind) {
  return selectPreparedPeaks(
    buildPreparedCandidatePool(candidates, analysisHints),
    limit,
    analysisHints,
    kind,
  );
}

function buildAnnotatedCandidatePool(
  fftMagnitudes,
  sampleRate,
  fftSize,
  poolSize,
  options = undefined,
) {
  const candidatePool = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    poolSize,
    options,
  );

  if (candidatePool.length > 0) {
    annotatePeakSalience(candidatePool, fftMagnitudes, sampleRate, fftSize);
  }

  return candidatePool;
}

function deriveSelectedCandidatePeaks(candidatePool, analysisHints) {
  const preparedCandidatePool = buildPreparedCandidatePool(
    candidatePool,
    analysisHints,
  );
  // Detail sees all candidates up to the policy ceiling (8 kHz).
  const detailPeaks = selectPreparedPeaks(
    preparedCandidatePool,
    DETAIL_PEAK_COUNT,
    analysisHints,
    "detail",
  );
  // Backbone is restricted to low/mid frequencies so that treble peaks
  // route to detail rather than masking low-end standing-wave structure.
  const backboneCandidates = preparedCandidatePool.filter(
    (c) => (c.frequency ?? 0) <= BACKBONE_PEAK_MAX_HZ,
  );
  const backbonePeaks = selectPreparedPeaks(
    backboneCandidates,
    BACKBONE_PEAK_COUNT,
    analysisHints,
    "backbone",
  );

  return {
    detailPeaks,
    backbonePeaks,
    dominantPeak: backbonePeaks[0] ?? null,
  };
}

function createLayerReleaseOptions(
  layerState,
  targetSlots,
  capacity,
  baseOptions,
  analysisHints,
  layerType,
) {
  const currentModes = buildModeAmplitudeMap(layerState?.slots, capacity);
  if (currentModes.size === 0) {
    return baseOptions;
  }

  const targetModes = buildModeAmplitudeMap(targetSlots, capacity);
  const previousMetrics = layerState?._slotMetricMap ?? new Map();
  const releaseOverrides = new Map();
  const novelty = clamp01(analysisHints?.novelty ?? 0);
  const harmonicity = clamp01(analysisHints?.harmonicity ?? 0);
  const releaseBias = clamp01(analysisHints?.releaseBias ?? 0);
  const effectiveRelease =
    releaseBias > 0
      ? baseOptions.release * (1 - releaseBias * 0.25)
      : baseOptions.release;
  const effectiveBaseOptions =
    effectiveRelease !== baseOptions.release
      ? { ...baseOptions, release: effectiveRelease }
      : baseOptions;
  const disagreementLimit =
    layerType === "detail" ? DETAIL_EVICTION_FRAMES : BACKBONE_EVICTION_FRAMES;
  const noveltyLimit =
    layerType === "detail"
      ? DETAIL_NOVELTY_EVICTION_THRESHOLD
      : BACKBONE_NOVELTY_EVICTION_THRESHOLD;
  const evictionRelease =
    layerType === "detail"
      ? DETAIL_EVICTION_RELEASE
      : BACKBONE_EVICTION_RELEASE;

  for (const key of currentModes.keys()) {
    if (targetModes.has(key)) {
      continue;
    }
    const disagreementCount =
      (previousMetrics.get(key)?.disagreementCount ?? 0) + 1;
    const noveltyEviction =
      novelty >= noveltyLimit &&
      (layerType === "detail" || harmonicity <= LOW_HARMONICITY_THRESHOLD);
    if (disagreementCount >= disagreementLimit || noveltyEviction) {
      releaseOverrides.set(key, evictionRelease);
    }
  }

  if (releaseOverrides.size === 0) {
    return effectiveBaseOptions;
  }

  return {
    ...effectiveBaseOptions,
    releaseOverrides,
  };
}

function updateLayerSlotTracking(
  layerState,
  targetSlots,
  capacity,
  currentFrame,
  analysisHints,
  layerType,
) {
  if (!layerState) {
    return;
  }

  const previousMetrics = layerState._slotMetricMap ?? new Map();
  const nextMetrics = new Map();
  const targetModes = buildModeAmplitudeMap(targetSlots, capacity);
  const slotCount = Math.min(
    capacity,
    Math.floor((layerState.slots?.length ?? 0) / 4),
  );
  const slotAgeFrames = layerState.slotAgeFrames;
  const slotConfidence = layerState.slotConfidence;
  const slotDisagreementCounts = layerState.slotDisagreementCounts;
  const slotLastConfirmedFrames = layerState.slotLastConfirmedFrames;
  const hints = getActiveAnalysisHints(analysisHints);

  slotAgeFrames?.fill(0);
  slotConfidence?.fill(0);
  slotDisagreementCounts?.fill(0);
  slotLastConfirmedFrames?.fill(0);

  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4;
    const amplitude = layerState.slots[offset + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }

    const key = slotModeKey(
      layerState.slots[offset],
      layerState.slots[offset + 1],
      layerState.slots[offset + 2],
    );
    const previous = previousMetrics.get(key) ?? {
      ageFrames: 0,
      confidence: 0,
      disagreementCount: 0,
      lastConfirmedFrame: 0,
    };
    const confirmed = targetModes.has(key);
    const disagreementCount = confirmed ? 0 : previous.disagreementCount + 1;
    const ageFrames = confirmed ? 0 : previous.ageFrames + 1;
    const hintBias =
      layerType === "detail"
        ? 1 +
          (hints?.transientSalience ?? 0) * 0.18 +
          (hints?.novelty ?? 0) * 0.22
        : 1 +
          (hints?.harmonicity ?? 0) * 0.28 +
          (hints?.pitchConfidence ?? 0) * 0.14;
    const confidence = clamp01(
      (confirmed
        ? (targetModes.get(key) ?? amplitude)
        : previous.confidence * 0.88) * hintBias,
    );
    const lastConfirmedFrame = confirmed
      ? currentFrame
      : (previous.lastConfirmedFrame ?? 0);

    if (slotAgeFrames) slotAgeFrames[index] = Math.min(65535, ageFrames);
    if (slotConfidence) slotConfidence[index] = confidence;
    if (slotDisagreementCounts) {
      slotDisagreementCounts[index] = Math.min(255, disagreementCount);
    }
    if (slotLastConfirmedFrames) {
      slotLastConfirmedFrames[index] = Math.min(0xffffffff, lastConfirmedFrame);
    }
    nextMetrics.set(key, {
      ageFrames,
      confidence,
      disagreementCount,
      lastConfirmedFrame,
    });
  }

  layerState._slotMetricMap = nextMetrics;
}

function shouldBuildDetailedDebug(auditSettings) {
  return Boolean(auditSettings?.enabled);
}

function countNonZeroFFTBinCount(fftMagnitudes) {
  if (!fftMagnitudes?.length) return 0;

  let count = 0;
  for (let i = 0; i < fftMagnitudes.length; i++) {
    if ((fftMagnitudes[i] ?? 0) > 0.001) {
      count += 1;
    }
  }

  return count;
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

function cloneAnalysisHintsForSnapshot(analysisHints) {
  return analysisHints ? { ...analysisHints } : null;
}

function cloneChromesthesiaComponents(components) {
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

function buildDebugSummary({
  inputMode,
  analysisInputMode = inputMode,
  structuralImplementation = "legacy-peak",
  soundActive,
  micActive,
  pitchSource = "none",
  analysisEngine = "none",
  fieldState = FIELD_STATES.idle,
  liveInputNoiseGateActive = false,
  liveInputHardSilenceActive = false,
  liveInputCalibrationActive = false,
  liveInputCalibrationInvalid = false,
  liveInputCalibrationInvalidReason = "none",
  liveInputAnalysisClass = DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  resolvedLiveInputAnalysisClass = DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  liveInputProfile = DEFAULT_LIVE_INPUT_PROFILE,
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
  chromesthesiaComponents = [],
  transientEnergy = 0,
  spectralCentroid = 0,
  spectralFlux = 0,
  structureSignal = 0,
  energySignal = 0,
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
  analysisHints = null,
  structuralMetrics = null,
  structuralComparison = null,
  comparisonDebug = null,
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

  return {
    audioInputMode: inputMode,
    structuralImplementation,
    pitchSource,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    requestedPitchSource: REQUESTED_PITCH_SOURCE,
    analysisEngine,
    fieldState,
    workerState: analysisHints?.workerState ?? "none",
    pitchFrameAge: analysisHints?.ageMs ?? null,
    workerStatus: analysisHints?.workerStatus ?? null,
    fileActive: soundActive,
    micActive,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputAnalysisClass,
    resolvedLiveInputAnalysisClass,
    liveInputProfile,
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
    changeSignal,
    changeBreakdown: changeBreakdown ? { ...changeBreakdown } : null,
    pulseSignal,
    beatDetected,
    beatPulseId,
    beatStrength,
    beatConfidence,
    hintSource: analysisHints?.hintSource ?? "none",
    analysisLatencyMs: analysisHints?.analysisLatencyMs ?? 0,
    novelty: clamp01(analysisHints?.novelty ?? 0),
    harmonicity: clamp01(analysisHints?.harmonicity ?? 0),
    transientSalience: clamp01(analysisHints?.transientSalience ?? 0),
    bassSalience: clamp01(analysisHints?.bassSalience ?? 0),
    textureSpread: clamp01(analysisHints?.textureSpread ?? 0),
    voicingProbability: clamp01(analysisHints?.voicingProbability ?? 0),
    releaseBias: clamp01(analysisHints?.releaseBias ?? 0),
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
    modalPersistence: structuralMetrics?.modalPersistence ?? 0,
    modalDriveEnergy: structuralMetrics?.modalDriveEnergy ?? 0,
    driveSource: structuralMetrics?.driveSource ?? "none",
    structuralComparison,
    comparisonDebug,
    sourceNormalization: sourceNormalization ?? {
      normalizedRms: 0,
      normalizedAmplitude: 0,
      normalizedCentroid: 0,
    },
    chromesthesiaComponents,
  };
}

function buildZeroDebugSnapshot({
  inputMode,
  soundActive,
  micActive,
  structuralImplementation = "legacy-peak",
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
  analysisHints = null,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  const debug = buildDebugSummary({
    inputMode,
    structuralImplementation,
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
    chromesthesiaComponents: [],
    beatDetected: false,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    beatLowBandEnergy: 0,
    beatOnsetDriver: 0,
    beatThreshold: 0,
    structureSignal: 0,
    energySignal: 0,
    changeSignal: 0,
    pulseSignal: 0,
    analysisHints,
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

export function buildSilentFeatureFrame({
  featureState,
  inputMode,
  soundActive,
  micActive,
  backboneSlots,
  detailSlots,
  modeSlots,
  referenceModeSlots,
  backboneColorSlots,
  detailColorSlots,
  bandEnergies,
  backboneState,
  detailState,
  fftSize,
  auditSettings,
  analysisHints = null,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  backboneSlots.fill(0);
  detailSlots.fill(0);
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
    soundActive,
    micActive,
    averageAmplitude: 0,
    fftMagnitudes: silentFft,
    backboneSlots,
    detailSlots,
    backboneColorSlots,
    detailColorSlots,
    bandEnergies,
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    structureSignal: 0,
    energySignal: 0,
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
    harmonicity: 0,
    bassSalience: 0,
    textureSpread: 0,
    novelty: 0,
    modeSlots,
    referenceModeSlots,
    sourceMode: "silent",
    debug: buildZeroDebugSnapshot({
      inputMode,
      soundActive,
      micActive,
      structuralImplementation: "legacy-peak",
      referenceModeSlots,
      bandEnergies,
      backboneSlots,
      detailSlots,
      modeSlots,
      backboneColorSlots,
      detailColorSlots,
      auditSettings,
      analysisHints,
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
  const peaks = findSpectralPeakFrequencies(spectrum, sampleRate, fftSize, 3);
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
  const { analysisClass } = normalizeLiveInputAnalysisSettings(
    micAnalysisSettings ?? liveInputAnalysisSettings,
  );
  const profile = normalizeLiveInputProfile(analysisClass);
  const config = getLiveInputProfileConfig(profile);
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

function qualifiesLiveInputOpen(metrics, thresholds, profile, profileConfig) {
  if (profile === "ambient") {
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
      metrics.peakClarity >= profileConfig.minPeakClarity)
  );
}

function qualifiesLiveInputHold(metrics, thresholds, profile) {
  if (profile === "ambient") {
    return (
      metrics.rms >= thresholds.closeRms ||
      metrics.peakAmplitude >= thresholds.closePeak ||
      metrics.lowBandEnergy >= thresholds.openLowBand * 0.8
    );
  }

  return (
    metrics.rms >= thresholds.closeRms ||
    metrics.peakAmplitude >= thresholds.closePeak
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
  const { analysisClass } =
    normalizeLiveInputAnalysisSettings(micAnalysisSettings);
  const profile = normalizeLiveInputProfile(analysisClass);
  if (injectTestTone || inputMode !== "live") {
    resetLiveInputGateState(bandState, {
      inputMode,
      profile,
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
    bandState.liveInputProfile !== profile ||
    currentFrameAtMs < (bandState.liveInputPreviousFrameAtMs ?? 0)
  ) {
    beginLiveInputCalibration(bandState, currentFrameAtMs, profile, {
      calibrationVersion,
    });
  }

  const profileConfig = getLiveInputProfileConfig(profile);
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
  bandState.liveInputProfile = profile;
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
      beginLiveInputCalibration(bandState, currentFrameAtMs, profile, {
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
    beginLiveInputCalibration(bandState, currentFrameAtMs, profile, {
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
    micAnalysisSettings: { profile },
  });
  const thresholds = deriveLiveInputThresholds(bandState, profileConfig);
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
      qualifiesLiveInputHold(metrics, thresholds, profile)
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
    if (bandState.liveInputQuietFrames < profileConfig.closeFrames) {
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
    qualifiesLiveInputOpen(metrics, thresholds, profile, profileConfig)
  ) {
    bandState.liveInputOpenFrames += 1;
    if (bandState.liveInputOpenFrames >= profileConfig.openFrames) {
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

function areFrequenciesClose(
  left,
  right,
  tolerance = VOICE_CANDIDATE_MATCH_TOLERANCE,
) {
  if (!(left > 0) || !(right > 0)) {
    return false;
  }

  return Math.abs(left - right) / Math.max(left, right) <= tolerance;
}

function isPeakHarmonicallyRelated(frequency, fundamental) {
  if (!(frequency > 0) || !(fundamental > 0)) {
    return false;
  }

  const ratio = frequency / fundamental;
  const nearest = Math.max(1, Math.round(ratio));
  return Math.abs(ratio - nearest) <= 0.14;
}

function clearVocalLatchState(layerState) {
  layerState.latchedFundamentalHz = 0;
  layerState.latchedFundamentalConfidence = 0;
  layerState.latchHoldFrames = 0;
  layerState.latchLowSupportFrames = 0;
  layerState.driverFrequency = 0;
}

function clearVocalDriverDiagnostics(layerState) {
  layerState.candidateFrequency = 0;
  layerState.candidateConfidence = 0;
  layerState.candidateFrames = 0;
  layerState.candidatePeriodicity = 0;
  layerState.candidateHarmonicSupport = 0;
  layerState.candidateDirectSupport = 0;
  layerState.candidateLowEnergy = false;
  layerState.voicingActive = false;
  layerState.highCandidateRejected = false;
  layerState.rejectionReason = "none";
}

function clearVocalDriverState(layerState) {
  clearVocalLatchState(layerState);
  clearVocalDriverDiagnostics(layerState);
}

function updateVoiceDetectionDiagnostics(
  layerState,
  detection,
  {
    voicingActive = false,
    highCandidateRejected = false,
    rejectionReason = "none",
  } = {},
) {
  layerState.candidatePeriodicity = detection?.periodicity ?? 0;
  layerState.candidateHarmonicSupport = detection?.harmonicSupport ?? 0;
  layerState.candidateDirectSupport = detection?.directSupport ?? 0;
  layerState.candidateLowEnergy = Boolean(detection?.lowEnergy);
  layerState.voicingActive = voicingActive;
  layerState.highCandidateRejected = highCandidateRejected;
  layerState.rejectionReason = rejectionReason;
}

function updateVoiceCandidateState({
  backboneState,
  detection,
  profileConfig,
}) {
  const candidateFrequency = detection?.frequencyHz ?? 0;
  const candidateConfidence = detection?.confidence ?? 0;
  const lowEnergy = Boolean(detection?.lowEnergy);
  const trackableCandidate =
    candidateFrequency > 0 &&
    candidateConfidence >= profileConfig.pitchLatchConfidence;

  if (!trackableCandidate) {
    backboneState.candidateFrequency = 0;
    backboneState.candidateConfidence = 0;
    backboneState.candidateFrames = 0;
    return {
      candidateFrequency,
      candidateConfidence,
      candidateFrames: 0,
      stableCandidate: false,
    };
  }

  const matchedPrevious =
    !lowEnergy &&
    areFrequenciesClose(
      candidateFrequency,
      backboneState.candidateFrequency ?? 0,
    );

  backboneState.candidateFrequency = candidateFrequency;
  backboneState.candidateConfidence = candidateConfidence;
  if (lowEnergy) {
    backboneState.candidateFrames = 0;
  } else if (matchedPrevious) {
    backboneState.candidateFrames = (backboneState.candidateFrames ?? 0) + 1;
  } else {
    backboneState.candidateFrames = 1;
  }

  const stableCandidate =
    backboneState.candidateFrames >= profileConfig.highPitchStableFrames ||
    areFrequenciesClose(
      candidateFrequency,
      backboneState.latchedFundamentalHz ?? 0,
    );

  return {
    candidateFrequency,
    candidateConfidence,
    candidateFrames: backboneState.candidateFrames,
    stableCandidate,
  };
}

function resolveVoiceVoicing({
  detection,
  profileConfig,
  candidateFrames,
  stableCandidate,
}) {
  const candidateFrequency = detection?.frequencyHz ?? 0;
  const candidateConfidence = detection?.confidence ?? 0;

  if (!(candidateFrequency > 0)) {
    return {
      active: false,
      highCandidateRejected: false,
      rejectionReason: "no-candidate",
    };
  }

  if (detection?.lowEnergy) {
    return {
      active: false,
      highCandidateRejected: candidateFrequency >= profileConfig.highPitchMinHz,
      rejectionReason: "low-energy",
    };
  }

  if (!(candidateConfidence >= profileConfig.pitchConfidence)) {
    return {
      active: false,
      highCandidateRejected: candidateFrequency >= profileConfig.highPitchMinHz,
      rejectionReason: "low-confidence",
    };
  }

  if (!detection?.voiced) {
    return {
      active: false,
      highCandidateRejected: candidateFrequency >= profileConfig.highPitchMinHz,
      rejectionReason: "unvoiced",
    };
  }

  if (candidateFrequency < profileConfig.highPitchMinHz) {
    return {
      active: true,
      highCandidateRejected: false,
      rejectionReason: "none",
    };
  }

  const periodicity = detection?.periodicity ?? 0;
  const harmonicSupport = detection?.harmonicSupport ?? 0;
  const supportSources = detection?.supportSources ?? 0;
  const strongPeriodicity =
    periodicity >= profileConfig.highPitchMinPeriodicity;
  const strongHarmonicSupport =
    harmonicSupport >= profileConfig.highPitchMinHarmonicSupport &&
    supportSources >= profileConfig.highPitchMinSupportSources;
  const stableHighCandidate =
    stableCandidate &&
    candidateFrames >= profileConfig.highPitchStableFrames &&
    candidateConfidence >= profileConfig.highPitchStableConfidence;

  if (!(candidateConfidence >= profileConfig.highPitchMinConfidence)) {
    return {
      active: false,
      highCandidateRejected: true,
      rejectionReason: "low-confidence-high",
    };
  }

  if (
    strongPeriodicity ||
    strongHarmonicSupport ||
    stableHighCandidate ||
    (periodicity >= profileConfig.pitchStrongPeriodicity &&
      supportSources >= profileConfig.highPitchMinSupportSources)
  ) {
    return {
      active: true,
      highCandidateRejected: false,
      rejectionReason: "none",
    };
  }

  return {
    active: false,
    highCandidateRejected: true,
    rejectionReason:
      supportSources < profileConfig.highPitchMinSupportSources &&
      harmonicSupport < profileConfig.highPitchMinHarmonicSupport
        ? "sparse-high-harmonics"
        : "weak-high-candidate",
  };
}

function resolveLiveInputVoiceValidity({
  detection,
  profileConfig,
  candidateFrames,
  stableCandidate,
  analyserRms,
  avgAmplitude,
  preModalFftPeak,
  baselinePeak,
}) {
  const periodicity = detection?.periodicity ?? 0;
  const harmonicSupport = detection?.harmonicSupport ?? 0;
  const directSupport = detection?.directSupport ?? 0;
  const supportSources = detection?.supportSources ?? 0;
  const hasMeaningfulTimeSignal =
    periodicity >= LIVE_INPUT_VOICE_LOCK_MIN_PERIODICITY;
  const hasStrongSpectralSignal =
    supportSources >= LIVE_INPUT_VOICE_LOCK_MIN_SUPPORT_SOURCES &&
    analyserRms >= LIVE_INPUT_VOICE_LOCK_MIN_RMS &&
    avgAmplitude >= LIVE_INPUT_VOICE_LOCK_MIN_AVG_AMPLITUDE &&
    (harmonicSupport >= LIVE_INPUT_VOICE_LOCK_MIN_HARMONIC_SUPPORT ||
      directSupport >= LIVE_INPUT_VOICE_LOCK_MIN_DIRECT_SUPPORT);
  const hasStableLatchEvidence =
    stableCandidate &&
    candidateFrames >= Math.max(1, profileConfig.highPitchStableFrames);

  if (
    hasMeaningfulTimeSignal ||
    hasStrongSpectralSignal ||
    hasStableLatchEvidence
  ) {
    return {
      allowed: true,
      rejectionReason: "none",
    };
  }

  if (
    periodicity <= LIVE_INPUT_FOG_SUPPRESSION_MAX_PERIODICITY &&
    analyserRms <= LIVE_INPUT_INVALID_CURRENT_WEAK_RMS &&
    avgAmplitude <= LIVE_INPUT_INVALID_CURRENT_WEAK_AVG &&
    preModalFftPeak >= LIVE_INPUT_INVALID_CURRENT_SATURATED_PEAK &&
    baselinePeak >= LIVE_INPUT_INVALID_COMPRESSED_BASELINE_PEAK
  ) {
    return {
      allowed: false,
      rejectionReason: "invalid-clipped-mic",
    };
  }

  return {
    allowed: false,
    rejectionReason: "insufficient-voicing-evidence",
  };
}

function resolveVoiceDriver({
  backboneState,
  detection,
  hardSilence,
  profileConfig,
  analyserRms,
  avgAmplitude,
  preModalFftPeak,
  baselinePeak,
}) {
  if (hardSilence) {
    clearVocalDriverState(backboneState);
    return {
      frequency: 0,
      confidence: 0,
      pitchSource: "none",
    };
  }

  const {
    candidateFrequency,
    candidateConfidence,
    candidateFrames,
    stableCandidate,
  } = updateVoiceCandidateState({
    backboneState,
    detection,
    profileConfig,
  });
  const voicing = resolveVoiceVoicing({
    detection,
    profileConfig,
    candidateFrames,
    stableCandidate,
  });
  const voiceValidity = resolveLiveInputVoiceValidity({
    detection,
    profileConfig,
    candidateFrames,
    stableCandidate,
    analyserRms,
    avgAmplitude,
    preModalFftPeak,
    baselinePeak,
  });
  updateVoiceDetectionDiagnostics(backboneState, detection, {
    voicingActive: voicing.active && voiceValidity.allowed,
    highCandidateRejected: voicing.highCandidateRejected,
    rejectionReason: voiceValidity.allowed
      ? voicing.rejectionReason
      : voiceValidity.rejectionReason,
  });

  if (
    voicing.active &&
    voiceValidity.allowed &&
    candidateFrequency > 0 &&
    candidateConfidence >= profileConfig.pitchConfidence
  ) {
    backboneState.latchedFundamentalHz = candidateFrequency;
    backboneState.latchedFundamentalConfidence = candidateConfidence;
    backboneState.latchHoldFrames = profileConfig.latchHoldFrames;
    backboneState.latchLowSupportFrames = 0;
    backboneState.driverFrequency = candidateFrequency;
    return {
      frequency: candidateFrequency,
      confidence: candidateConfidence,
      pitchSource: "fundamental",
    };
  }

  if (
    !voiceValidity.allowed &&
    voiceValidity.rejectionReason === "invalid-clipped-mic"
  ) {
    clearVocalLatchState(backboneState);
    return {
      frequency: 0,
      confidence: 0,
      pitchSource: "none",
    };
  }

  if (
    backboneState.latchedFundamentalHz > 0 &&
    backboneState.latchHoldFrames > 0
  ) {
    backboneState.latchHoldFrames -= 1;
    backboneState.latchLowSupportFrames = voicing.active
      ? 0
      : (backboneState.latchLowSupportFrames ?? 0) + 1;
    backboneState.latchedFundamentalConfidence *= VOICE_LATCH_DECAY;
    backboneState.driverFrequency = backboneState.latchedFundamentalHz;
    return {
      frequency: backboneState.latchedFundamentalHz,
      confidence: backboneState.latchedFundamentalConfidence,
      pitchSource: "latched-fundamental",
    };
  }

  clearVocalLatchState(backboneState);

  return {
    frequency: 0,
    confidence: 0,
    pitchSource: "none",
  };
}

function resolveVoiceDetailPeaks({
  fftMagnitudes,
  sampleRate,
  fftSize,
  fundamental,
  profileConfig,
  analysisHints,
}) {
  if (!(fundamental > 0)) {
    return [];
  }

  const candidates = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    INTERNAL_CANDIDATE_POOL_SIZE,
    {
      minFrequency: fundamental * 0.8,
      maxFrequency: Math.min(
        profileConfig.spectralPeakMaxHz,
        fundamental * VOICE_DETAIL_HARMONIC_LIMIT + 120,
      ),
    },
  ).filter((peak) => isPeakHarmonicallyRelated(peak.frequency, fundamental));

  return selectScoredPeaks(
    candidates,
    DETAIL_PEAK_COUNT,
    analysisHints,
    "detail",
  );
}

function getLayerSlotLimit(layerType, capacity) {
  return Math.min(
    capacity,
    layerType === "backbone" ? BACKBONE_STACK_SLOTS : DETAIL_STACK_SLOTS,
  );
}

function buildEmptyTarget(capacity) {
  return new Float32Array(capacity * 4);
}

function releaseLayer(
  layerState,
  capacity,
  options,
  targetSlots = null,
  emptyTargetSlots = null,
) {
  const resolvedTargetSlots = targetSlots ?? buildEmptyTarget(capacity);
  const resolvedEmptyTargetSlots = emptyTargetSlots ?? resolvedTargetSlots;
  blendModalStack(layerState, resolvedTargetSlots, capacity, options);
  if (options.colorOptions) {
    blendColorStack(
      layerState,
      resolvedTargetSlots,
      resolvedEmptyTargetSlots,
      capacity,
      options.colorOptions,
    );
  } else {
    layerState.colorSlots?.fill(0);
    layerState.referenceColorSlots?.fill(0);
  }
  clearLayerMetadata(layerState);
}

function applyLayerBlend(layerState, targetBuild, capacity, options) {
  blendModalStack(layerState, targetBuild.slots, capacity, options);
  if (options.colorOptions) {
    blendColorStack(
      layerState,
      targetBuild.slots,
      targetBuild.colorSlots,
      capacity,
      options.colorOptions,
    );
  } else {
    layerState.colorSlots.fill(0);
    layerState.referenceColorSlots.fill(0);
  }
}

function computeBandEnergies(fftMagnitudes, sampleRate, fftSize) {
  const bands = new Float32Array(BAND_BUCKET_COUNT);
  if (!fftMagnitudes?.length || !sampleRate || !fftSize) {
    return bands;
  }

  const nyquist = sampleRate * 0.5;
  const sums = new Float32Array(BAND_BUCKET_COUNT);
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
    counts[bandIndex] += 1;
  }

  for (let i = 0; i < BAND_BUCKET_COUNT; i++) {
    bands[i] = counts[i] > 0 ? Math.min(1, sums[i] / counts[i]) : 0;
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

function deriveCompositeSignals({
  inputMode,
  modeCapacity,
  signalNormalizationSlots,
  modeSlots,
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
  analysisHints,
  structuralMetrics = null,
  sourceNormalization = undefined,
}) {
  const hints = getActiveAnalysisHints(analysisHints);
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
  const structureSignal = clamp01(
    (activeModeCount / Math.max(1, signalNormalizationSlots * 0.55)) *
      0.36 *
      energyCoupling +
      (uniqueModeCount / Math.max(1, signalNormalizationSlots * 0.7)) *
        0.26 *
        energyCoupling +
      harmonicSupport * 0.2 * energyCoupling +
      modalPersistence * 0.06 +
      // Removed: bandDistribution (not energy-sensitive — stays elevated during fades)
      // Removed: normalizedCentroid (treble centroid ≠ modal structure)
      (hints?.harmonicity ?? 0) * 0.12 +
      (hints?.textureSpread ?? 0) * 0.06,
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
      averageArray(bandEnergies) * 0.2 +
      clamp01(dominantAmplitude) * 0.12 +
      (hints?.bassSalience ?? 0) * 0.08,
  );
  const changeBreakdown = {
    flux: clamp01(spectralFlux * 8) * 0.28,
    hit: transientEnergy * 0.26,
    slotDelta: averageDelta * 0.2,
    turnover: turnoverRatio * 0.16,
    timbre:
      clamp01(Math.abs(normalizedCentroid - bandDistribution) * 1.2) * 0.1,
    hint: (hints?.novelty ?? 0) * 0.18 + (hints?.transientSalience ?? 0) * 0.12,
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
      clamp01(pulseDriver * 0.22) +
      (hints?.transientSalience ?? 0) * 0.12 +
      (hints?.novelty ?? 0) * 0.06,
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
      changeBreakdown,
    };
  }

  return {
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    modeCoherence,
    changeBreakdown,
  };
}

function shouldSuppressLiveInputFogField({
  inputMode,
  activeModeCount,
  analyserRms,
  avgAmplitude,
  periodicity,
  preModalFftPeak,
  liveInputCalibrationInvalid,
  liveInputNoiseGateActive,
  liveInputHardSilenceActive,
}) {
  return (
    inputMode === "live" &&
    !liveInputCalibrationInvalid &&
    !liveInputNoiseGateActive &&
    !liveInputHardSilenceActive &&
    activeModeCount >= LIVE_INPUT_FOG_SUPPRESSION_MODE_COUNT &&
    analyserRms <= LIVE_INPUT_INVALID_CURRENT_WEAK_RMS &&
    avgAmplitude <= LIVE_INPUT_INVALID_CURRENT_WEAK_AVG &&
    periodicity <= LIVE_INPUT_FOG_SUPPRESSION_MAX_PERIODICITY &&
    preModalFftPeak >= LIVE_INPUT_INVALID_CURRENT_SATURATED_PEAK
  );
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

function resolveLayeredModalStacks({
  analysisSnapshot,
  status,
  backboneState,
  detailState,
  zeroBackboneTargetSlots,
  zeroDetailTargetSlots,
  nonAcousticBackboneTarget,
  nonAcousticDetailTarget,
  nonAcousticPeakDriverScratch,
  acousticBackboneTarget,
  acousticDetailTarget,
  radius,
  effectiveCavityGeometry = DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  capacity,
  currentFrame,
  liveInputNoiseGateActive,
  liveInputHardSilenceActive,
  liveInputProfile,
  resolvedLiveInputAnalysisClass,
  auditSettings,
  spectralCentroid,
  includeChromesthesia,
  analysisHints,
  analyserRms,
  avgAmplitude,
  preModalFftPeak,
  liveInputBaselinePeak,
}) {
  let analysisEngine = "none";
  let pitchSource = "none";
  let spectralCandidates = [];
  let usedDecay = false;
  let peakScanMs = 0;

  const backboneCapacity = getLayerSlotLimit("backbone", capacity);
  const detailCapacity = getLayerSlotLimit("detail", capacity);
  const profileConfig = getLiveInputProfileConfig(liveInputProfile);
  let backboneTrackingSlots =
    zeroBackboneTargetSlots ?? buildEmptyTarget(backboneCapacity);
  let detailTrackingSlots =
    zeroDetailTargetSlots ?? buildEmptyTarget(detailCapacity);

  if (auditSettings.injectTestTone) {
    const selectedFrequency = auditSettings.testToneHz;
    const selectedConfidence = 1;
    const fftMagnitudes =
      analysisSnapshot?.fftMagnitudes ?? new Float32Array(status.fftSize / 2);
    const backboneBuild = buildModalSlotsFromFundamental({
      frequency: selectedFrequency,
      confidence: selectedConfidence,
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity: backboneCapacity,
      cavityGeometry: effectiveCavityGeometry,
      spectralCentroid,
      includeChromesthesia,
    });
    const detailBuild = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity: detailCapacity,
      cavityGeometry: effectiveCavityGeometry,
      peakCount: DETAIL_PEAK_COUNT,
      slotLimit: detailCapacity,
      spectralCentroid,
      includeChromesthesia,
    });
    copyFloatArray(backboneState.slots, backboneBuild.slots);
    copyFloatArray(backboneState.referenceSlots, backboneBuild.referenceSlots);
    copyFloatArray(backboneState.colorSlots, backboneBuild.colorSlots);
    copyFloatArray(backboneState.referenceColorSlots, backboneBuild.colorSlots);
    copyFloatArray(detailState.slots, detailBuild.slots);
    copyFloatArray(detailState.referenceSlots, detailBuild.referenceSlots);
    copyFloatArray(detailState.colorSlots, detailBuild.colorSlots);
    copyFloatArray(detailState.referenceColorSlots, detailBuild.colorSlots);
    setLayerMetadata(
      backboneState,
      backboneBuild,
      selectedFrequency,
      selectedConfidence,
      "test",
    );
    setLayerMetadata(
      detailState,
      detailBuild,
      selectedFrequency,
      selectedConfidence,
      "test",
    );
    analysisEngine = "test";
    pitchSource = "test";
    spectralCandidates = detailBuild.peaks ?? [];
    backboneTrackingSlots = backboneBuild.slots;
    detailTrackingSlots = detailBuild.slots;
  } else if (!liveInputNoiseGateActive && analysisSnapshot?.fftMagnitudes) {
    const fftMagnitudes = analysisSnapshot.fftMagnitudes;
    const layerBlendOptions = {
      attack: BACKBONE_ATTACK,
      tracking: BACKBONE_ATTACK,
      release: BACKBONE_RELEASE,
      freshCap: BACKBONE_FRESH_CAP,
      colorOptions: includeChromesthesia
        ? {
            attack: BACKBONE_COLOR_ATTACK,
            tracking: BACKBONE_COLOR_TRACKING,
            release: BACKBONE_COLOR_RELEASE,
            maxActiveSlots: BACKBONE_COLOR_SLOT_LIMIT,
          }
        : null,
    };
    const detailBlendOptions = {
      attack: DETAIL_ATTACK,
      tracking: DETAIL_ATTACK,
      release: DETAIL_RELEASE,
      freshCap: DETAIL_FRESH_CAP,
      colorOptions: includeChromesthesia
        ? {
            attack: DETAIL_COLOR_ATTACK,
            tracking: DETAIL_COLOR_TRACKING,
            release: DETAIL_COLOR_RELEASE,
            maxActiveSlots: DETAIL_COLOR_SLOT_LIMIT,
          }
        : null,
    };
    const isAcousticMic =
      status.audioInputMode === "live" &&
      resolvedLiveInputAnalysisClass ===
        LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;

    if (isAcousticMic) {
      const detection = detectVoicePitch({
        timeData: analysisSnapshot?.timeData,
        fftMagnitudes,
        sampleRate: status.sampleRate,
        fftSize: status.fftSize,
        autocorrelation: {
          minFrequency: profileConfig.pitchMinHz,
          maxFrequency: profileConfig.pitchAutocorrelationMaxHz,
          lowEnergyRms: profileConfig.pitchLowEnergyRms,
          minConfidence: profileConfig.pitchConfidence,
        },
        spectral: {
          minFrequency: profileConfig.pitchMinHz,
          maxFrequency: profileConfig.pitchMaxHz,
          maxPeakFrequency: profileConfig.spectralPeakMaxHz,
          minConfidence: profileConfig.pitchConfidence,
        },
      });
      const voiceDriver = resolveVoiceDriver({
        backboneState,
        detection,
        hardSilence: liveInputHardSilenceActive,
        profileConfig,
        analyserRms,
        avgAmplitude,
        preModalFftPeak,
        baselinePeak: liveInputBaselinePeak,
      });
      const hintedVoiceConfidence = clamp01(
        voiceDriver.confidence *
          (0.72 +
            (analysisHints?.pitchConfidence ?? 0) * 0.18 +
            (analysisHints?.voicingProbability ?? 0) * 0.2),
      );
      const voiceDetailPeaks = resolveVoiceDetailPeaks({
        fftMagnitudes,
        sampleRate: status.sampleRate,
        fftSize: status.fftSize,
        fundamental: voiceDriver.frequency,
        profileConfig,
        analysisHints,
      });
      spectralCandidates = voiceDetailPeaks;
      let fallbackDetailPeaks = [];
      let fallbackDominantPeak = null;
      if (voiceDriver.frequency <= 0) {
        const peakScanStartedAt = getAudioPerfNow();
        const fallbackCandidatePool = buildAnnotatedCandidatePool(
          fftMagnitudes,
          status.sampleRate,
          status.fftSize,
          INTERNAL_CANDIDATE_POOL_SIZE,
          {
            maxFrequency: profileConfig.spectralPeakMaxHz,
            minimumAmplitude: SPECTRAL_MODAL_POLICY.minSpectralBinAmplitude,
          },
        );
        ({
          detailPeaks: fallbackDetailPeaks,
          dominantPeak: fallbackDominantPeak,
        } = deriveSelectedCandidatePeaks(fallbackCandidatePool, analysisHints));
        peakScanMs += getAudioPerfNow() - peakScanStartedAt;
      }

      if (voiceDriver.frequency > 0) {
        const backboneTarget = writeModalSlotsFromFundamental(
          acousticBackboneTarget,
          {
            frequency: voiceDriver.frequency,
            confidence: hintedVoiceConfidence,
            fftMagnitudes,
            sampleRate: status.sampleRate,
            fftSize: status.fftSize,
            radius,
            capacity: backboneCapacity,
            cavityGeometry: effectiveCavityGeometry,
            spectralCentroid,
            includeChromesthesia,
          },
        );
        const detailTarget = writeModalSlotsFromSpectralPeaks(
          acousticDetailTarget,
          {
            fftMagnitudes,
            sampleRate: status.sampleRate,
            fftSize: status.fftSize,
            radius,
            capacity: detailCapacity,
            cavityGeometry: effectiveCavityGeometry,
            slotLimit: detailCapacity,
            spectralCentroid,
            includeChromesthesia,
            peaks: voiceDetailPeaks,
          },
        );
        const resolvedBackboneBlendOptions = createLayerReleaseOptions(
          backboneState,
          backboneTarget.slots,
          backboneCapacity,
          layerBlendOptions,
          analysisHints,
          "backbone",
        );
        const resolvedDetailBlendOptions = createLayerReleaseOptions(
          detailState,
          detailTarget.slots,
          detailCapacity,
          detailBlendOptions,
          analysisHints,
          "detail",
        );

        applyLayerBlend(
          backboneState,
          backboneTarget,
          backboneCapacity,
          resolvedBackboneBlendOptions,
        );
        applyLayerBlend(
          detailState,
          detailTarget,
          detailCapacity,
          resolvedDetailBlendOptions,
        );
        setLayerMetadata(
          backboneState,
          backboneTarget,
          voiceDriver.frequency,
          hintedVoiceConfidence,
          "vocal",
        );
        setLayerMetadata(
          detailState,
          detailTarget,
          voiceDriver.frequency,
          hintedVoiceConfidence,
          "vocal",
        );
        analysisEngine = "vocal";
        pitchSource = voiceDriver.pitchSource;
        backboneTrackingSlots = backboneTarget.slots;
        detailTrackingSlots = detailTarget.slots;
      } else if (
        fallbackDominantPeak &&
        ((fallbackDominantPeak.salienceScore ?? 0) >= 0.12 ||
          fallbackDetailPeaks.length >= 2)
      ) {
        const backboneTarget = writeModalSlotsFromFundamental(
          acousticBackboneTarget,
          {
            frequency: fallbackDominantPeak.frequency,
            confidence: Math.max(0.28, fallbackDominantPeak.amplitude ?? 0),
            fftMagnitudes,
            sampleRate: status.sampleRate,
            fftSize: status.fftSize,
            radius,
            capacity: backboneCapacity,
            cavityGeometry: effectiveCavityGeometry,
            spectralCentroid,
            includeChromesthesia,
          },
        );
        const detailTarget = writeModalSlotsFromSpectralPeaks(
          acousticDetailTarget,
          {
            fftMagnitudes,
            sampleRate: status.sampleRate,
            fftSize: status.fftSize,
            radius,
            capacity: detailCapacity,
            cavityGeometry: effectiveCavityGeometry,
            slotLimit: detailCapacity,
            spectralCentroid,
            includeChromesthesia,
            peaks: fallbackDetailPeaks,
          },
        );
        const resolvedBackboneBlendOptions = createLayerReleaseOptions(
          backboneState,
          backboneTarget.slots,
          backboneCapacity,
          layerBlendOptions,
          analysisHints,
          "backbone",
        );
        const resolvedDetailBlendOptions = createLayerReleaseOptions(
          detailState,
          detailTarget.slots,
          detailCapacity,
          detailBlendOptions,
          analysisHints,
          "detail",
        );

        applyLayerBlend(
          backboneState,
          backboneTarget,
          backboneCapacity,
          resolvedBackboneBlendOptions,
        );
        applyLayerBlend(
          detailState,
          detailTarget,
          detailCapacity,
          resolvedDetailBlendOptions,
        );
        setLayerMetadata(
          backboneState,
          backboneTarget,
          fallbackDominantPeak.frequency,
          fallbackDominantPeak.amplitude ?? 0,
          "spectral-fallback",
        );
        setLayerMetadata(
          detailState,
          detailTarget,
          fallbackDominantPeak.frequency,
          fallbackDominantPeak.amplitude ?? 0,
          "spectral-fallback",
        );
        spectralCandidates = fallbackDetailPeaks.length
          ? fallbackDetailPeaks
          : [fallbackDominantPeak];
        analysisEngine = "spectral-fallback";
        pitchSource = "spectral-fallback";
        backboneTrackingSlots = backboneTarget.slots;
        detailTrackingSlots = detailTarget.slots;
      } else if (
        countActiveSlots(backboneState.slots, backboneCapacity) > 0 ||
        countActiveSlots(detailState.slots, detailCapacity) > 0
      ) {
        releaseLayer(
          backboneState,
          backboneCapacity,
          createLayerReleaseOptions(
            backboneState,
            backboneTrackingSlots,
            backboneCapacity,
            layerBlendOptions,
            analysisHints,
            "backbone",
          ),
          backboneTrackingSlots,
          zeroBackboneTargetSlots,
        );
        releaseLayer(
          detailState,
          detailCapacity,
          createLayerReleaseOptions(
            detailState,
            detailTrackingSlots,
            detailCapacity,
            detailBlendOptions,
            analysisHints,
            "detail",
          ),
          detailTrackingSlots,
          zeroDetailTargetSlots,
        );
        usedDecay = true;
        pitchSource = voiceDriver.pitchSource;
      } else {
        clearModalStack(backboneState);
        clearModalStack(detailState);
        clearVocalDriverState(backboneState);
      }
    } else {
      clearVocalDriverState(backboneState);
      const peakScanStartedAt = getAudioPerfNow();
      const candidatePool = buildAnnotatedCandidatePool(
        fftMagnitudes,
        status.sampleRate,
        status.fftSize,
        INTERNAL_CANDIDATE_POOL_SIZE,
      );
      const { detailPeaks, backbonePeaks, dominantPeak } =
        deriveSelectedCandidatePeaks(candidatePool, analysisHints);
      peakScanMs += getAudioPerfNow() - peakScanStartedAt;
      const backboneTarget = writeModalSlotsFromPeakDrivers(
        nonAcousticBackboneTarget,
        {
          fftMagnitudes,
          sampleRate: status.sampleRate,
          fftSize: status.fftSize,
          radius,
          capacity: backboneCapacity,
          cavityGeometry: effectiveCavityGeometry,
          peakCount: backbonePeaks.length || BACKBONE_PEAK_COUNT,
          slotLimit: backboneCapacity,
          spectralCentroid,
          includeChromesthesia,
          peaks: backbonePeaks,
          scratchTarget: nonAcousticPeakDriverScratch,
        },
      );
      const detailTarget = writeModalSlotsFromSpectralPeaks(
        nonAcousticDetailTarget,
        {
          fftMagnitudes,
          sampleRate: status.sampleRate,
          fftSize: status.fftSize,
          radius,
          capacity: detailCapacity,
          cavityGeometry: effectiveCavityGeometry,
          peakCount: detailPeaks.length || DETAIL_PEAK_COUNT,
          slotLimit: detailCapacity,
          spectralCentroid,
          includeChromesthesia,
          peaks: detailPeaks,
        },
      );

      spectralCandidates = detailPeaks.length
        ? detailPeaks
        : dominantPeak
          ? [dominantPeak]
          : [];

      if (
        backboneTarget.uniqueModeCount > 0 ||
        detailTarget.uniqueModeCount > 0
      ) {
        const resolvedBackboneBlendOptions = createLayerReleaseOptions(
          backboneState,
          backboneTarget.slots,
          backboneCapacity,
          layerBlendOptions,
          analysisHints,
          "backbone",
        );
        const resolvedDetailBlendOptions = createLayerReleaseOptions(
          detailState,
          detailTarget.slots,
          detailCapacity,
          detailBlendOptions,
          analysisHints,
          "detail",
        );
        applyLayerBlend(
          backboneState,
          backboneTarget,
          backboneCapacity,
          resolvedBackboneBlendOptions,
        );
        applyLayerBlend(
          detailState,
          detailTarget,
          detailCapacity,
          resolvedDetailBlendOptions,
        );
        setLayerMetadata(
          backboneState,
          backboneTarget,
          dominantPeak?.frequency ?? 0,
          dominantPeak?.amplitude ?? 0,
          "layered",
        );
        setLayerMetadata(
          detailState,
          detailTarget,
          dominantPeak?.frequency ?? 0,
          dominantPeak?.amplitude ?? 0,
          "layered",
        );
        analysisEngine = "layered";
        pitchSource = "spectral";
        backboneTrackingSlots = backboneTarget.slots;
        detailTrackingSlots = detailTarget.slots;
      } else if (
        countActiveSlots(backboneState.slots, backboneCapacity) > 0 ||
        countActiveSlots(detailState.slots, detailCapacity) > 0
      ) {
        releaseLayer(
          backboneState,
          backboneCapacity,
          createLayerReleaseOptions(
            backboneState,
            backboneTrackingSlots,
            backboneCapacity,
            layerBlendOptions,
            analysisHints,
            "backbone",
          ),
          backboneTrackingSlots,
          zeroBackboneTargetSlots,
        );
        releaseLayer(
          detailState,
          detailCapacity,
          createLayerReleaseOptions(
            detailState,
            detailTrackingSlots,
            detailCapacity,
            detailBlendOptions,
            analysisHints,
            "detail",
          ),
          detailTrackingSlots,
          zeroDetailTargetSlots,
        );
        usedDecay = true;
      } else {
        clearModalStack(backboneState);
        clearModalStack(detailState);
      }
    }
  } else if (
    status.audioInputMode !== "idle" &&
    !liveInputNoiseGateActive &&
    (backboneState.analysisEngine !== "none" ||
      detailState.analysisEngine !== "none")
  ) {
    const layerBlendOptions = {
      attack: BACKBONE_ATTACK,
      tracking: BACKBONE_ATTACK,
      release: BACKBONE_RELEASE,
      freshCap: BACKBONE_FRESH_CAP,
      colorOptions: includeChromesthesia
        ? {
            attack: BACKBONE_COLOR_ATTACK,
            tracking: BACKBONE_COLOR_TRACKING,
            release: BACKBONE_COLOR_RELEASE,
            maxActiveSlots: BACKBONE_COLOR_SLOT_LIMIT,
          }
        : null,
    };
    const detailBlendOptions = {
      attack: DETAIL_ATTACK,
      tracking: DETAIL_ATTACK,
      release: DETAIL_RELEASE,
      freshCap: DETAIL_FRESH_CAP,
      colorOptions: includeChromesthesia
        ? {
            attack: DETAIL_COLOR_ATTACK,
            tracking: DETAIL_COLOR_TRACKING,
            release: DETAIL_COLOR_RELEASE,
            maxActiveSlots: DETAIL_COLOR_SLOT_LIMIT,
          }
        : null,
    };
    releaseLayer(
      backboneState,
      backboneCapacity,
      createLayerReleaseOptions(
        backboneState,
        backboneTrackingSlots,
        backboneCapacity,
        layerBlendOptions,
        analysisHints,
        "backbone",
      ),
      backboneTrackingSlots,
      zeroBackboneTargetSlots,
    );
    releaseLayer(
      detailState,
      detailCapacity,
      createLayerReleaseOptions(
        detailState,
        detailTrackingSlots,
        detailCapacity,
        detailBlendOptions,
        analysisHints,
        "detail",
      ),
      detailTrackingSlots,
      zeroDetailTargetSlots,
    );
    usedDecay = true;
  } else {
    clearModalStack(backboneState);
    clearModalStack(detailState);
    if (liveInputProfile === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic) {
      clearVocalDriverState(backboneState);
    }
  }

  updateLayerSlotTracking(
    backboneState,
    backboneTrackingSlots,
    backboneCapacity,
    currentFrame,
    analysisHints,
    "backbone",
  );
  updateLayerSlotTracking(
    detailState,
    detailTrackingSlots,
    detailCapacity,
    currentFrame,
    analysisHints,
    "detail",
  );

  return {
    analysisEngine,
    pitchSource,
    spectralCandidates,
    usedDecay,
    peakScanMs,
  };
}

function finalizeFeatureDebugSnapshot({
  auditSettings,
  inputMode,
  analysisInputMode = inputMode,
  structuralImplementation = "legacy-peak",
  pitchSource,
  analysisEngine,
  fieldState,
  soundActive,
  micActive,
  liveInputNoiseGateActive,
  liveInputHardSilenceActive,
  liveInputCalibrationActive,
  liveInputCalibrationInvalid = false,
  liveInputCalibrationInvalidReason = "none",
  liveInputAnalysisClass,
  resolvedLiveInputAnalysisClass,
  liveInputProfile,
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
  chromesthesiaComponents = null,
  transientEnergy,
  spectralCentroid,
  spectralFlux,
  structureSignal,
  energySignal,
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
  analysisHints = null,
  structuralMetrics = null,
  structuralComparison = null,
  comparisonDebug = null,
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
    structuralImplementation,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputAnalysisClass,
    resolvedLiveInputAnalysisClass,
    liveInputProfile,
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
    chromesthesiaComponents:
      chromesthesiaComponents ??
      [
        ...(backboneState?.chromesthesiaComponents ?? []),
        ...(detailState?.chromesthesiaComponents ?? []),
      ]
        .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
        .slice(0, 8),
    transientEnergy,
    spectralCentroid,
    spectralFlux,
    structureSignal,
    energySignal,
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
    analysisHints,
    structuralMetrics,
    structuralComparison,
    comparisonDebug,
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
  structuralImplementation,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
  liveInputDeviceKind,
  resolvedLiveInputAnalysisClass,
  calibrationVersion,
  shouldBuildChromesthesia,
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
    structuralImplementation,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    calibrationVersion,
    shouldBuildChromesthesia,
    injectTestTone: Boolean(resolvedAuditSettings?.injectTestTone),
    freezeModeSlots: Boolean(resolvedAuditSettings?.freezeModeSlots),
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    sourceMode,
  });
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

function buildHintMetrics(analysisHints) {
  return {
    active: true,
    harmonicity: clamp01(analysisHints?.harmonicity ?? 0),
    bassSalience: clamp01(analysisHints?.bassSalience ?? 0),
    textureSpread: clamp01(analysisHints?.textureSpread ?? 0),
    novelty: clamp01(analysisHints?.novelty ?? 0),
    transientSalience: clamp01(analysisHints?.transientSalience ?? 0),
  };
}

function resolveComposeAnalysisHints(analysisHints, analysisResult) {
  const activeHints = getActiveAnalysisHints(analysisHints);
  if (activeHints) {
    return {
      ...activeHints,
      ...buildHintMetrics(activeHints),
    };
  }

  return analysisResult?.baseAnalysisHints ?? null;
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
  includeChromesthesia = true,
  analysisHints = null,
  structuralImplementation = "legacy-peak",
}) {
  const capacity = featureState?.capacity ?? AUDIO_SLOT_CAPACITY;
  const analysisMemory = getAnalysisMemory(featureState, capacity);
  const {
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
  const resolvedMicAnalysisSettings = normalizeLiveInputAnalysisSettings(
    micAnalysisSettings ?? liveInputAnalysisSettings,
  );
  const liveInputProfile = resolveFeatureFrameLiveInputProfile({
    inputMode,
    resolvedLiveInputAnalysisClass,
    settings: resolvedMicAnalysisSettings,
  });
  const shouldBuildChromesthesia = Boolean(
    includeChromesthesia ||
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
        profile: liveInputProfile,
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
      liveInputProfile,
      shouldBuildChromesthesia,
      currentFrame,
      sourceMode,
      radius,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      cavityGeometry: requestedCavityGeometry,
      status,
      beatSettings,
      analysisHints,
      analysisSessionKey: resolveFeatureAnalysisSessionKey(status, inputMode),
      analysisInputsSignature: buildFeatureAnalysisInputsSignature({
        inputMode,
        analysisInputMode,
        structuralImplementation,
        requestedCavityGeometry,
        effectiveCavityGeometry,
        liveInputDeviceKind,
        resolvedLiveInputAnalysisClass,
        calibrationVersion,
        shouldBuildChromesthesia,
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
        backboneSlots,
        detailSlots,
        modeSlots,
        backboneColorSlots,
        detailColorSlots,
        referenceModeSlots,
        bandEnergies,
        backboneState,
        detailState,
        fftSize,
        auditSettings: resolvedAuditSettings,
        analysisHints,
        requestedCavityGeometry,
        effectiveCavityGeometry,
      }),
    };
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
          profile: liveInputProfile,
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
    analysisHints,
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
    liveInputProfile,
    shouldBuildChromesthesia,
    currentFrame,
    sourceMode,
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
      structuralImplementation,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      liveInputDeviceKind,
      resolvedLiveInputAnalysisClass,
      calibrationVersion,
      shouldBuildChromesthesia,
      resolvedAuditSettings,
      liveInputNoiseGateActive,
      liveInputHardSilenceActive,
      liveInputCalibrationInvalid,
      liveInputCalibrationInvalidReason,
      sourceMode,
    }),
    structuralImplementation,
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
    shouldBuildChromesthesia,
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
  const backboneColorSlotsSource = shouldBuildChromesthesia
    ? hasFrozenProjection
      ? auditState.frozenBackboneColorSlots
      : (structuralState?.backboneColorSlotsSource ??
        preparedInputs.backboneState.colorSlots)
    : null;
  const detailColorSlotsSource = shouldBuildChromesthesia
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

export function materializeAudioFeatureStructuralSnapshot(
  preparedInputs,
  structuralState,
) {
  const {
    capacity,
    backboneSlots,
    detailSlots,
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
      { slots: signalSources.signalBackboneSlotsSource, weight: 1 },
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
      { slots: signalSources.signalReferenceBackboneSlotsSource, weight: 1 },
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

function combineBackboneAndDetailLayers(
  target,
  capacity,
  backboneSlots,
  detailSlots,
) {
  combineModalLayers(
    target,
    [
      { slots: backboneSlots, weight: 1 },
      { slots: detailSlots, weight: DETAIL_LAYER_WEIGHT },
    ],
    capacity,
  );
}

function buildDualComparisonDebugSummary({
  preparedInputs,
  analysisResult,
  analysisHints,
}) {
  const comparisonState = analysisResult.structuralState?.comparisonState;
  if (!comparisonState) {
    return null;
  }

  const capacity = preparedInputs.capacity;
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    comparisonState,
  );
  const signalSources = resolveStructuralSignalSources(
    preparedInputs,
    comparisonState,
  );
  const modeSlots = new Float32Array(capacity * 4);
  const referenceModeSlots = new Float32Array(capacity * 4);
  const signalModeSlots = new Float32Array(capacity * 4);
  const signalReferenceModeSlots = new Float32Array(capacity * 4);
  const backboneState =
    comparisonState.backboneStateSource ?? preparedInputs.backboneState;
  const detailState =
    comparisonState.detailStateSource ?? preparedInputs.detailState;

  combineBackboneAndDetailLayers(
    modeSlots,
    capacity,
    projectionSources.backboneSlotsSource,
    projectionSources.detailSlotsSource,
  );
  combineBackboneAndDetailLayers(
    referenceModeSlots,
    capacity,
    projectionSources.referenceBackboneSlotsSource,
    projectionSources.referenceDetailSlotsSource,
  );
  combineBackboneAndDetailLayers(
    signalModeSlots,
    capacity,
    signalSources.signalBackboneSlotsSource,
    signalSources.signalDetailSlotsSource,
  );
  combineBackboneAndDetailLayers(
    signalReferenceModeSlots,
    capacity,
    signalSources.signalReferenceBackboneSlotsSource,
    signalSources.signalReferenceDetailSlotsSource,
  );

  const {
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown,
    pulseSignal,
    modeCoherence,
  } = deriveCompositeSignals({
    inputMode: preparedInputs.analysisInputMode,
    modeCapacity: capacity,
    signalNormalizationSlots: AUDIO_SIGNAL_NORMALIZATION_SLOTS,
    modeSlots: signalModeSlots,
    referenceModeSlots: signalReferenceModeSlots,
    backboneState,
    detailState,
    bandEnergies: analysisResult.bandEnergies,
    analyserRms: analysisResult.analyserRms,
    avgAmplitude: analysisResult.avgAmplitude,
    dominantAmplitude: comparisonState.dominantAmplitude ?? 0,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralFlux: analysisResult.spectralFlux,
    transientEnergy: analysisResult.transientEnergy,
    beatDetected: analysisResult.beatDetected,
    beatStrength: analysisResult.beatStrength,
    beatConfidence: analysisResult.beatConfidence,
    beatOnsetDriver: analysisResult.beatOnsetDriver,
    beatThreshold: analysisResult.beatThreshold,
    bandState: analysisResult.bandState ?? null,
    analysisHints,
    structuralMetrics: comparisonState.structuralMetrics,
    sourceNormalization: analysisResult.sourceNormalization,
  });

  return {
    analysisEngine: comparisonState.analysisEngine ?? "none",
    pitchSource: comparisonState.pitchSource ?? "none",
    dominantFrequency: comparisonState.dominantFrequency ?? 0,
    dominantAmplitude: comparisonState.dominantAmplitude ?? 0,
    activeBackboneModeCount: projectionSources.activeBackboneModeCount,
    activeDetailModeCount: projectionSources.activeDetailModeCount,
    activeModeCount: projectionSources.activeModeCount,
    signalModeCount: countActiveSlots(signalModeSlots, capacity),
    modeSlotCount: countActiveSlots(modeSlots, capacity),
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown: changeBreakdown ? { ...changeBreakdown } : null,
    pulseSignal,
    modeCoherence,
    usedDecay: Boolean(comparisonState.usedDecay),
    structuralMetrics: comparisonState.structuralMetrics
      ? { ...comparisonState.structuralMetrics }
      : null,
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

function updateLegacyAudioFeatureStructuralState(
  preparedInputs,
  fastSignalState,
) {
  const {
    status,
    capacity,
    backboneState,
    detailState,
    zeroBackboneTargetSlots,
    zeroDetailTargetSlots,
    nonAcousticBackboneTarget,
    nonAcousticDetailTarget,
    nonAcousticPeakDriverScratch,
    acousticBackboneTarget,
    acousticDetailTarget,
    bandState,
    resolvedAuditSettings,
    sampleRate,
    fftSize,
    analysisInputMode,
    shouldBuildChromesthesia,
    currentFrame,
    analysisHints,
    avgAmplitude,
    analyserRms,
    preModalFftPeak,
    spectralCentroidHint,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    sourceMode,
  } = preparedInputs;

  const structuralStartedAt = getAudioPerfNow();
  const {
    analysisEngine,
    pitchSource,
    spectralCandidates,
    usedDecay,
    peakScanMs,
  } = resolveLayeredModalStacks({
    analysisSnapshot: fastSignalState.effectiveSnapshot,
    status: {
      ...status,
      audioInputMode: analysisInputMode,
      sampleRate,
      fftSize,
    },
    backboneState,
    detailState,
    zeroBackboneTargetSlots,
    zeroDetailTargetSlots,
    nonAcousticBackboneTarget,
    nonAcousticDetailTarget,
    nonAcousticPeakDriverScratch,
    acousticBackboneTarget,
    acousticDetailTarget,
    radius: preparedInputs.radius,
    effectiveCavityGeometry: preparedInputs.effectiveCavityGeometry,
    capacity,
    currentFrame,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputProfile: preparedInputs.liveInputProfile,
    resolvedLiveInputAnalysisClass:
      preparedInputs.resolvedLiveInputAnalysisClass,
    auditSettings: resolvedAuditSettings,
    spectralCentroid: spectralCentroidHint,
    includeChromesthesia: shouldBuildChromesthesia,
    analysisHints,
    analyserRms,
    avgAmplitude,
    preModalFftPeak,
    liveInputBaselinePeak: bandState.liveInputBaselinePeak ?? 0,
  });
  const structuralTotalMs = getAudioPerfNow() - structuralStartedAt;
  const modalResolveMs = Math.max(0, structuralTotalMs - peakScanMs);

  const dominantFrequency =
    backboneState.fundamental || detailState.fundamental;
  const dominantAmplitude = dominantFrequency
    ? sampleFFTAmplitudeForFrequency(
        dominantFrequency,
        fastSignalState.fftMagnitudes,
        sampleRate,
        fftSize,
      )
    : 0;
  let activeBackboneModeCount = countActiveSlots(
    backboneState.slots,
    BACKBONE_STACK_SLOTS,
  );
  let activeDetailModeCount = countActiveSlots(
    detailState.slots,
    DETAIL_STACK_SLOTS,
  );
  let activeModeCount = activeBackboneModeCount + activeDetailModeCount;
  const suppressedByFog = shouldSuppressLiveInputFogField({
    inputMode: analysisInputMode,
    activeModeCount,
    analyserRms,
    avgAmplitude,
    periodicity: backboneState.candidatePeriodicity ?? 0,
    preModalFftPeak,
    liveInputCalibrationInvalid,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
  });

  if (suppressedByFog) {
    activeBackboneModeCount = 0;
    activeDetailModeCount = 0;
    activeModeCount = 0;
  }

  const structuralState = {
    sourceMode,
    backboneSlotsSource: backboneState.slots,
    detailSlotsSource: detailState.slots,
    referenceBackboneSlotsSource: backboneState.referenceSlots,
    referenceDetailSlotsSource: detailState.referenceSlots,
    backboneColorSlotsSource: shouldBuildChromesthesia
      ? backboneState.colorSlots
      : null,
    detailColorSlotsSource: shouldBuildChromesthesia
      ? detailState.colorSlots
      : null,
    freezeModeSlots: Boolean(resolvedAuditSettings.freezeModeSlots),
    activeBackboneModeCount,
    activeDetailModeCount,
    activeModeCount,
    dominantFrequency,
    dominantAmplitude,
    analysisEngine,
    pitchSource,
    spectralCandidates,
    usedDecay,
    suppressedByFog,
    structuralPerf: {
      peakScanMs,
      modalResolveMs,
      projectionMs: 0,
    },
  };

  structuralState.structuralFingerprint = buildStructuralFingerprint({
    preparedInputs,
    structuralState,
    activeBackboneModeCount,
    activeDetailModeCount,
    activeModeCount,
  });

  return structuralState;
}

export function updateAudioFeatureStructuralState(
  preparedInputs,
  fastSignalState,
) {
  const attachStructuralFingerprint = (structuralState) => {
    structuralState.structuralFingerprint = buildStructuralFingerprint({
      preparedInputs,
      structuralState,
      activeBackboneModeCount: structuralState.activeBackboneModeCount,
      activeDetailModeCount: structuralState.activeDetailModeCount,
      activeModeCount: structuralState.activeModeCount,
    });
    return structuralState;
  };
  const structuralImplementation =
    preparedInputs.structuralImplementation ?? "legacy-peak";

  if (structuralImplementation === "modal-excitation") {
    return attachStructuralFingerprint(
      buildModalExcitationStructuralState({
        preparedInputs,
        fastSignalState,
        existingState: preparedInputs.modalExcitationState,
        performanceNow: getAudioPerfNow,
      }),
    );
  }

  const legacyStructuralState = updateLegacyAudioFeatureStructuralState(
    preparedInputs,
    fastSignalState,
  );

  if (structuralImplementation === "legacy-peak") {
    return legacyStructuralState;
  }

  const modalStructuralState = attachStructuralFingerprint(
    buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: preparedInputs.modalExcitationState,
      performanceNow: getAudioPerfNow,
    }),
  );

  const comparison = compareStructuralStates(
    legacyStructuralState,
    modalStructuralState,
  );

  return {
    ...legacyStructuralState,
    comparisonState: modalStructuralState,
    structuralMetrics: legacyStructuralState.structuralMetrics ?? {
      excitedModeCount:
        modalStructuralState.structuralMetrics?.excitedModeCount ?? 0,
      distributedExcitation:
        modalStructuralState.structuralMetrics?.distributedExcitation ?? 0,
      lowOrderModalEnergy:
        modalStructuralState.structuralMetrics?.lowOrderModalEnergy ?? 0,
      highOrderModalEnergy:
        modalStructuralState.structuralMetrics?.highOrderModalEnergy ?? 0,
      modalPersistence:
        modalStructuralState.structuralMetrics?.modalPersistence ?? 0,
      modalDriveEnergy:
        modalStructuralState.structuralMetrics?.modalDriveEnergy ?? 0,
      modeCoherence: modalStructuralState.structuralMetrics?.modeCoherence ?? 0,
      driveSource:
        modalStructuralState.structuralMetrics?.driveSource ??
        "spectral-fallback",
    },
    structuralComparison: comparison,
  };
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
    referenceBackboneSlotsSource: preparedInputs.backboneState.referenceSlots,
    referenceDetailSlotsSource: preparedInputs.detailState.referenceSlots,
    backboneColorSlotsSource: preparedInputs.shouldBuildChromesthesia
      ? preparedInputs.backboneState.colorSlots
      : null,
    detailColorSlotsSource: preparedInputs.shouldBuildChromesthesia
      ? preparedInputs.detailState.colorSlots
      : null,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    backboneSlots: preparedInputs.backboneSlots,
    detailSlots: preparedInputs.detailSlots,
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
}) {
  const currentStructural = readCurrentStructuralState(
    preparedInputs,
    previousAnalysisResult,
    structuralState,
  );
  let resolvedStructural = currentStructural;
  const signalStructural = materializeAudioFeatureSignalSnapshot(
    preparedInputs,
    currentStructural,
  );

  if (materializeStructuralProjection) {
    const projectionStartedAt = getAudioPerfNow();
    const projectedStructural = materializeAudioFeatureStructuralSnapshot(
      preparedInputs,
      currentStructural,
    );
    resolvedStructural = {
      ...currentStructural,
      ...projectedStructural,
      ...signalStructural,
      structuralPerf: {
        peakScanMs: currentStructural.structuralPerf?.peakScanMs ?? 0,
        modalResolveMs: currentStructural.structuralPerf?.modalResolveMs ?? 0,
        projectionMs: getAudioPerfNow() - projectionStartedAt,
      },
    };
  } else {
    resolvedStructural = {
      ...currentStructural,
      ...signalStructural,
    };
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

  return {
    preparedInputs,
    soundActive: preparedInputs.soundActive,
    micActive: preparedInputs.micActive,
    fftMagnitudes: fastSignalState.fftMagnitudes,
    backboneSlots: resolvedStructural.backboneSlots,
    detailSlots: resolvedStructural.detailSlots,
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
    usedDecay: resolvedStructural.usedDecay,
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
    structuralComparison: resolvedStructural.structuralComparison ?? null,
    structuralState: {
      ...currentStructural,
    },
    structuralPerf: {
      peakScanMs: resolvedStructural.structuralPerf?.peakScanMs ?? 0,
      modalResolveMs: resolvedStructural.structuralPerf?.modalResolveMs ?? 0,
      projectionMs: resolvedStructural.structuralPerf?.projectionMs ?? 0,
    },
    baseAnalysisHints: resolveComposeAnalysisHints(
      preparedInputs.analysisHints,
      null,
    ),
    lastAnalysisHints: preparedInputs.analysisHints,
    debug: null,
  };
}

export function runHeavyAudioFeatureAnalysis(preparedInputs) {
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  const structuralState = updateAudioFeatureStructuralState(
    preparedInputs,
    fastSignalState,
  );
  const chromaState = updateAudioFeatureChromaState(
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
  const comparisonDebug =
    analysisResult.comparisonDebug ??
    buildDualComparisonDebugSummary({
      preparedInputs,
      analysisResult,
      analysisHints:
        analysisResult.lastAnalysisHints ?? analysisResult.baseAnalysisHints,
    });
  const backboneStateSummary = buildBackboneStateSummary(
    analysisResult.backboneState,
  );
  const detailStateSummary = buildDetailStateSummary(
    analysisResult.detailState,
  );
  const chromesthesiaComponents = cloneChromesthesiaComponents(
    [
      ...(analysisResult.backboneState?.chromesthesiaComponents ?? []),
      ...(analysisResult.detailState?.chromesthesiaComponents ?? []),
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
      liveInputCalibrationInvalid: analysisResult.liveInputCalibrationInvalid,
      liveInputCalibrationInvalidReason:
        analysisResult.liveInputCalibrationInvalidReason,
      liveInputCalibrationActive: analysisResult.liveInputCalibrationActive,
      liveInputProfile:
        analysisResult.bandState?.liveInputProfile ??
        (preparedInputs.isAcousticLiveInput
          ? DEFAULT_LIVE_INPUT_PROFILE
          : null),
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
      structuralComparison: analysisResult.structuralComparison
        ? { ...analysisResult.structuralComparison }
        : null,
      comparisonDebug: comparisonDebug
        ? {
            ...comparisonDebug,
            changeBreakdown: comparisonDebug.changeBreakdown
              ? { ...comparisonDebug.changeBreakdown }
              : null,
          }
        : null,
      baseAnalysisHints: cloneAnalysisHintsForSnapshot(
        analysisResult.baseAnalysisHints,
      ),
      lastAnalysisHints: cloneAnalysisHintsForSnapshot(
        analysisResult.lastAnalysisHints,
      ),
      chromesthesiaComponents,
      nonZeroFFTBinCount,
      referencePitchBinAmplitude,
      debug: null,
    },
  };
}

export function composeAudioFeatureFrame({
  preparedInputs,
  analysisResult,
  analysisHints = null,
  previousFrame = null,
  reuseHeavyAnalysis = false,
}) {
  const backboneState =
    analysisResult.backboneStateSummary ?? analysisResult.backboneState;
  const detailState =
    analysisResult.detailStateSummary ?? analysisResult.detailState;
  const effectiveAnalysisHints = resolveComposeAnalysisHints(
    analysisHints,
    analysisResult,
  );
  const debugAnalysisHints =
    analysisHints ?? analysisResult.lastAnalysisHints ?? effectiveAnalysisHints;
  let {
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown,
    pulseSignal,
    modeCoherence,
  } = deriveCompositeSignals({
    inputMode: preparedInputs.analysisInputMode,
    modeCapacity: preparedInputs.capacity,
    signalNormalizationSlots: AUDIO_SIGNAL_NORMALIZATION_SLOTS,
    modeSlots: analysisResult.signalModeSlots ?? analysisResult.modeSlots,
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
    analysisHints: effectiveAnalysisHints,
    structuralMetrics: analysisResult.structuralMetrics,
    sourceNormalization: analysisResult.sourceNormalization,
  });

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
        attackMs: 90,
        releaseMs: 160,
      },
    );
    energySignal = smoothFeatureSignal(
      previousFrame.energySignal,
      energySignal,
      deltaMs,
      {
        attackMs: 45,
        releaseMs: 120,
      },
    );
    changeSignal = smoothFeatureSignal(
      previousFrame.changeSignal,
      changeSignal,
      deltaMs,
      {
        attackMs: 14,
        releaseMs: 70,
      },
    );
    pulseSignal = smoothFeatureSignal(
      previousFrame.pulseSignal,
      pulseSignal,
      deltaMs,
      {
        attackMs: 10,
        releaseMs: 90,
      },
    );
  }
  preparedInputs.analysisMemory.lastComposedFrameAtMs =
    preparedInputs.currentFrameAtMs;

  const { fieldState, hasModalField } = deriveFieldState({
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
    activeModeCount: analysisResult.activeModeCount,
    usedDecay: analysisResult.usedDecay,
  });
  const sourceMode =
    fieldState === FIELD_STATES.idle &&
    !preparedInputs.resolvedAuditSettings.injectTestTone
      ? "silent"
      : analysisResult.sourceMode;

  let debug = analysisResult.debug;
  if (!debug) {
    const comparisonDebug =
      analysisResult.comparisonDebug ??
      buildDualComparisonDebugSummary({
        preparedInputs,
        analysisResult,
        analysisHints: effectiveAnalysisHints,
      });
    debug = finalizeFeatureDebugSnapshot({
      auditSettings: preparedInputs.resolvedAuditSettings,
      inputMode: preparedInputs.inputMode,
      structuralImplementation: preparedInputs.structuralImplementation,
      pitchSource: analysisResult.pitchSource,
      analysisEngine: analysisResult.analysisEngine,
      fieldState,
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
      liveInputProfile:
        analysisResult.liveInputProfile ??
        analysisResult.bandState?.liveInputProfile ??
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
      backboneSlots: analysisResult.backboneSlots,
      detailSlots: analysisResult.detailSlots,
      backboneColorSlots: analysisResult.backboneColorSlots,
      detailColorSlots: analysisResult.detailColorSlots,
      modeSlots: analysisResult.modeSlots,
      referenceModeSlots: analysisResult.referenceModeSlots,
      bandEnergies: analysisResult.bandEnergies,
      chromesthesiaComponents: analysisResult.chromesthesiaComponents ?? null,
      transientEnergy: analysisResult.transientEnergy,
      spectralCentroid: analysisResult.spectralCentroid,
      spectralFlux: analysisResult.spectralFlux,
      structureSignal,
      energySignal,
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
      analysisHints: debugAnalysisHints,
      structuralMetrics: analysisResult.structuralMetrics,
      structuralComparison: analysisResult.structuralComparison,
      comparisonDebug,
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

  if (preparedInputs.auditState) {
    preparedInputs.auditState.frame += 1;
    preparedInputs.auditState.lastSnapshot = debug;
  }

  return {
    fieldState,
    hasModalField,
    soundActive: analysisResult.soundActive,
    micActive: analysisResult.micActive,
    averageAmplitude: analysisResult.avgAmplitude,
    fftMagnitudes: analysisResult.fftMagnitudes,
    backboneSlots: analysisResult.backboneSlots,
    detailSlots: analysisResult.detailSlots,
    activeBackboneModeCount: analysisResult.activeBackboneModeCount,
    activeDetailModeCount: analysisResult.activeDetailModeCount,
    backboneColorSlots: analysisResult.backboneColorSlots,
    detailColorSlots: analysisResult.detailColorSlots,
    bandEnergies: analysisResult.bandEnergies,
    spectralBandEnergies: analysisResult.spectralBandEnergies,
    trebleBroadbandEnergy: analysisResult.trebleBroadbandEnergy,
    trebleTonalEnergy: analysisResult.trebleTonalEnergy,
    transientEnergy: analysisResult.transientEnergy,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralFlux: analysisResult.spectralFlux,
    structureSignal,
    energySignal,
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
    harmonicity: clamp01(effectiveAnalysisHints?.harmonicity ?? 0),
    bassSalience: clamp01(effectiveAnalysisHints?.bassSalience ?? 0),
    textureSpread: clamp01(effectiveAnalysisHints?.textureSpread ?? 0),
    novelty: clamp01(effectiveAnalysisHints?.novelty ?? 0),
    modeSlots: analysisResult.modeSlots,
    referenceModeSlots: analysisResult.referenceModeSlots,
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
    analysisHints: preparedInputs.analysisHints,
    reuseHeavyAnalysis: false,
  });
}
