import {
  AUDIT_DEFAULTS,
  AUDIO_SIGNAL_NORMALIZATION_SLOTS,
  AUDIO_SLOT_CAPACITY,
  BEAT_DEFAULTS,
} from "../../defaults.js";
import { sampleFFTAmplitudeForFrequency } from "../normalModes.js";
import {
  BACKBONE_STACK_SLOTS,
  DETAIL_STACK_SLOTS,
  MAX_STACK_SLOTS,
  BAND_BUCKET_COUNT,
  BLEND_MAX_FRESH_PER_FRAME,
  blendColorStack,
  blendModalStack,
  clearModalStack,
  combineModalLayers,
  copyFloatArray,
  countActiveSlots,
  createAudioFeatureState,
} from "./modalStack.js";
import {
  buildModalSlotsFromFundamental,
  buildModalSlotsFromPeakDrivers,
  buildModalSlotsFromSpectralPeaks,
  findSpectralPeakFrequencies,
  HARMONIC_ORDERS,
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

const {
  micSilenceAvgAmplitude: MIC_SILENCE_AVG_AMPLITUDE,
  micSignalPeakAmplitude: MIC_SIGNAL_PEAK_AMPLITUDE,
  requestedPitchSource: REQUESTED_PITCH_SOURCE,
} = AUDIO_ANALYSIS_POLICY;
const TEST_TONE_HARMONIC_ATTENUATION =
  SPECTRAL_MODAL_POLICY.harmonicAttenuation;

const BACKBONE_PEAK_COUNT = 3;
const DETAIL_PEAK_COUNT = 4;
const INTERNAL_CANDIDATE_POOL_SIZE = 16;
const BACKBONE_SALIENCE_WEIGHT = 1.2;
const DETAIL_LAYER_WEIGHT = 0.35;
const BACKBONE_ATTACK = 0.22;
const BACKBONE_RELEASE = 0.96;
const DETAIL_ATTACK = 0.55;
const DETAIL_RELEASE = 0.82;
const DETAIL_FRESH_CAP = 0;
const BACKBONE_EVICTION_RELEASE = 0.78;
const DETAIL_EVICTION_RELEASE = 0.58;
const DETAIL_EVICTION_FRAMES = 2;
const BACKBONE_EVICTION_FRAMES = 4;
const DETAIL_NOVELTY_EVICTION_THRESHOLD = 0.65;
const BACKBONE_NOVELTY_EVICTION_THRESHOLD = 0.8;
const LOW_HARMONICITY_THRESHOLD = 0.35;
const BACKBONE_COLOR_ATTACK = 0.38;
const BACKBONE_COLOR_TRACKING = 0.22;
const BACKBONE_COLOR_RELEASE = 0.96;
const DETAIL_COLOR_ATTACK = 0.5;
const DETAIL_COLOR_TRACKING = 0.28;
const DETAIL_COLOR_RELEASE = 0.9;
const BACKBONE_COLOR_SLOT_LIMIT = 4;
const DETAIL_COLOR_SLOT_LIMIT = 5;
const BAND_LIMITS_HZ = [140, 600, 2400, 8000];
const DEFAULT_MIC_PROFILE = "voice-tone";
const MIC_CALIBRATION_WINDOW_MS = 750;
const MIC_CALIBRATION_SMOOTHING_MS = 180;
const VOICE_DETAIL_HARMONIC_LIMIT = 5;
const VOICE_LATCH_DECAY = 0.94;
const VOICE_CANDIDATE_MATCH_TOLERANCE = 0.065;
const AMBIENT_REGION_RANGES = Object.freeze([
  Object.freeze([70, 240]),
  Object.freeze([240, 720]),
  Object.freeze([720, 1800]),
  Object.freeze([1800, 5000]),
]);
const MIC_PROFILE_CONFIGS = Object.freeze({
  "voice-tone": Object.freeze({
    absoluteAvgAmplitude: Math.max(4, MIC_SILENCE_AVG_AMPLITUDE * 0.5),
    absoluteRmsFloor: 0.009,
    absolutePeakFloor: 0.1,
    absoluteCentroidFloor: 0.006,
    openFrames: 1,
    closeFrames: 2,
    rmsOpenMultiplier: 1.15,
    rmsOpenOffset: 0.0002,
    peakOpenMultiplier: 1.4,
    peakOpenOffset: 0.024,
    centroidOpenMultiplier: 1,
    centroidOpenOffset: 0.002,
    lowBandOpenMultiplier: 1.45,
    lowBandOpenOffset: 0.002,
    rmsCloseMultiplier: 1.03,
    rmsCloseOffset: 0.0001,
    peakCloseMultiplier: 1.15,
    peakCloseOffset: 0.015,
    minPeakClarity: 0.38,
    hardSilenceRmsMultiplier: 1.08,
    hardSilenceRmsOffset: 0.00012,
    hardSilencePeakMultiplier: 1.02,
    hardSilencePeakOffset: 0.006,
    hardSilenceAvgMultiplier: 0.4,
    hardSilenceAvgOffset: 0.35,
    latchHoldFrames: 3,
    pitchMinHz: 70,
    pitchMaxHz: 1400,
    pitchAutocorrelationMaxHz: 650,
    pitchConfidence: 0.28,
    pitchLatchConfidence: 0.2,
    pitchLowEnergyRms: 0.018,
    pitchStrongPeriodicity: 0.58,
    highPitchMinHz: 650,
    highPitchMinConfidence: 0.36,
    highPitchMinPeriodicity: 0.58,
    highPitchMinHarmonicSupport: 0.24,
    highPitchMinSupportSources: 2,
    highPitchStableFrames: 2,
    highPitchStableConfidence: 0.34,
    spectralPeakMaxHz: 3200,
  }),
  ambient: Object.freeze({
    absoluteAvgAmplitude: Math.max(3, MIC_SILENCE_AVG_AMPLITUDE * 0.4),
    absoluteRmsFloor: 0.007,
    absolutePeakFloor: 0.1,
    absoluteCentroidFloor: 0,
    openFrames: 1,
    closeFrames: 30,
    rmsOpenMultiplier: 1.08,
    rmsOpenOffset: 0.00012,
    peakOpenMultiplier: 1.2,
    peakOpenOffset: 0.02,
    centroidOpenMultiplier: 1,
    centroidOpenOffset: 0,
    lowBandOpenMultiplier: 1.15,
    lowBandOpenOffset: 0.001,
    rmsCloseMultiplier: 1.02,
    rmsCloseOffset: 0.00008,
    peakCloseMultiplier: 1.05,
    peakCloseOffset: 0.01,
    minPeakClarity: 0,
    hardSilenceRmsMultiplier: 1.06,
    hardSilenceRmsOffset: 0.00008,
    hardSilencePeakMultiplier: 1.02,
    hardSilencePeakOffset: 0.006,
    hardSilenceAvgMultiplier: 0.4,
    hardSilenceAvgOffset: 0.3,
    spectralPeakMaxHz: 5000,
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
const MIC_MODAL_FFT_TARGET = 0.65;
const MIC_MODAL_FFT_MAX_GAIN = 12.0;
// Minimum harmonic salience for a peak to drive the ambient backbone.
// Prevents isolated noise peaks (fricatives, room noise, broadband bursts)
// from injecting incoherent high-mode-number modes.
//
// The salience score formula is: Σ amp(k*f) * weight[k] / MAX_SCORE
// where SALIENCE_WEIGHTS = [1.0, 0.9, 0.7, 0.55, 0.4, 0.3], MAX_SCORE = 3.85.
//
// A problematic case: 3382 Hz fricative with harmonicSupport:[1, 0.235, 0, ...]
// gives salienceScore ≈ (1.0 + 0.235*0.9) / 3.85 = 0.315.
// A threshold of 0.32 blocks single-harmonic peaks while allowing genuine
// tonal content (singing bowls, instruments) that have 3+ visible harmonics
// (typical score ≥ 0.40).
const AMBIENT_MIC_BACKBONE_MIN_SALIENCE = 0.32;
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;
const MIN_IBI_MS = 60000 / MAX_TEMPO_BPM; // 250ms
const MAX_IBI_MS = 60000 / MIN_TEMPO_BPM; // 1500ms
const TEMPO_EMA_FAST = 0.35;
const TEMPO_EMA_SLOW = 0.1;
const CHROMA_EMA_ALPHA = 0.1;

export const DEFAULT_MIC_ANALYSIS_SETTINGS = Object.freeze({
  profile: DEFAULT_MIC_PROFILE,
});

export const MIC_PROFILE_OPTIONS = Object.freeze([
  Object.freeze({
    value: "voice-tone",
    label: "Voice",
    description:
      "Speech and singing. Tracks a lead vocal pitch and uses harmonics as texture.",
  }),
]);

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

function getActiveAnalysisHints(analysisHints) {
  return analysisHints?.active ? analysisHints : null;
}

function ensureAnalysisMemoryShape(featureState, analysisMemory, capacity) {
  const slotLength = capacity * 4;
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
  const bandEnergies = ensureArrayField(
    analysisMemory,
    "bandEnergies",
    BAND_BUCKET_COUNT,
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

  if (featureState?.analysis) {
    featureState.analysis = analysisMemory;
  }

  return {
    backboneSlots,
    detailSlots,
    modeSlots,
    backboneColorSlots,
    detailColorSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    bandEnergies,
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
  if (inputMode === "mic") {
    const baselineRms = Math.max(0, bandState?.micBaselineRms ?? 0);
    const baselineCentroid = Math.max(0, bandState?.micBaselineCentroid ?? 0);
    return {
      normalizedRms: clamp01(
        baselineRms > 0
          ? (analyserRms - baselineRms * 0.45) /
              Math.max(0.0015, baselineRms * 4.5)
          : analyserRms / 0.018,
      ),
      normalizedAmplitude: clamp01(avgAmplitude / 18),
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

function resetMicGateState(
  bandState,
  { inputMode = "idle", profile = DEFAULT_MIC_PROFILE } = {},
) {
  bandState.micInputMode = inputMode;
  bandState.micProfile = profile;
  bandState.micGateState = "closed";
  bandState.micCalibrationActive = false;
  bandState.micCalibrationStartedAtMs = Number.NEGATIVE_INFINITY;
  bandState.micPreviousFrameAtMs = 0;
  bandState.micBaselineRms = 0;
  bandState.micBaselinePeak = 0;
  bandState.micBaselineCentroid = 0;
  bandState.micBaselineLowBandEnergy = 0;
  bandState.micOpenFrames = 0;
  bandState.micQuietFrames = 0;
}

function beginMicCalibration(bandState, currentFrameAtMs, profile) {
  resetMicGateState(bandState, {
    inputMode: "mic",
    profile,
  });
  bandState.micGateState = "calibrating";
  bandState.micCalibrationActive = true;
  bandState.micCalibrationStartedAtMs = currentFrameAtMs;
  bandState.micPreviousFrameAtMs = currentFrameAtMs;
}

function normalizeMicProfile(profile) {
  // "ambient" is disabled — redirect to the default so any saved preferences
  // or direct callers are silently migrated rather than breaking.
  if (profile === "ambient") return DEFAULT_MIC_PROFILE;
  return MIC_PROFILE_CONFIGS[profile] ? profile : DEFAULT_MIC_PROFILE;
}

function normalizeMicAnalysisSettings(settings = undefined) {
  return {
    profile: normalizeMicProfile(settings?.profile),
  };
}

function getMicProfileConfig(profile) {
  return (
    MIC_PROFILE_CONFIGS[normalizeMicProfile(profile)] ??
    MIC_PROFILE_CONFIGS[DEFAULT_MIC_PROFILE]
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
  resetMicGateState(bandState, {
    inputMode: bandState.micInputMode ?? "idle",
    profile: bandState.micProfile ?? DEFAULT_MIC_PROFILE,
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
        (hints?.pitchConfidence ?? 0) * 0.4
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

function selectScoredPeaks(candidates, limit, analysisHints, kind) {
  if (!Array.isArray(candidates) || limit <= 0) {
    return [];
  }

  const hints = getActiveAnalysisHints(analysisHints);
  const selected = [];
  const remaining = candidates
    .map((candidate) => ({
      ...candidate,
      baseScore: scoreCandidatePeak(candidate, hints, kind),
    }))
    .filter((candidate) => candidate.baseScore > 0);

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
    return baseOptions;
  }

  return {
    ...baseOptions,
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

function buildDebugSummary({
  inputMode,
  soundActive,
  micActive,
  pitchSource = "none",
  analysisEngine = "none",
  fieldState = FIELD_STATES.idle,
  micNoiseGateActive = false,
  micHardSilenceActive = false,
  micCalibrationActive = false,
  micProfile = DEFAULT_MIC_PROFILE,
  micBaselineRms = 0,
  micBaselinePeak = 0,
  backboneState,
  detailState,
  dominantFrequency = 0,
  dominantAmplitude = 0,
  avgAmplitude = 0,
  analyserRms = 0,
  fftMagnitudes,
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
}) {
  const backboneModeCount = countActiveSlots(
    backboneSlots,
    BACKBONE_STACK_SLOTS,
  );
  const detailModeCount = countActiveSlots(detailSlots, DETAIL_STACK_SLOTS);
  const modeSlotCount = countActiveSlots(modeSlots, MAX_STACK_SLOTS);

  return {
    audioInputMode: inputMode,
    pitchSource,
    requestedPitchSource: REQUESTED_PITCH_SOURCE,
    analysisEngine,
    fieldState,
    workerState: analysisHints?.workerState ?? "none",
    pitchFrameAge: analysisHints?.ageMs ?? null,
    workerStatus: analysisHints?.workerStatus ?? null,
    fileActive: soundActive,
    micActive,
    micNoiseGateActive,
    micHardSilenceActive,
    micCalibrationActive,
    micProfile,
    micBaselineRms,
    micBaselinePeak,
    analysisSourceUsed: inputMode === "idle" ? "none" : inputMode,
    fundamentalFrequency: backboneState?.fundamental ?? 0,
    fundamentalConfidence: backboneState?.fundamentalConfidence ?? 0,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    uniqueModeCount:
      (backboneState?.uniqueModeCount ?? 0) +
      (detailState?.uniqueModeCount ?? 0),
    nonZeroFFTBinCount: countNonZeroFFTBinCount(fftMagnitudes),
    modeSlotCount,
    backboneModeCount,
    detailModeCount,
    transientEnergy,
    spectralCentroid,
    spectralFlux,
    structureSignal,
    energySignal,
    changeSignal,
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
    referencePitchBinAmplitude: dominantFrequency
      ? sampleFFTAmplitudeForFrequency(
          dominantFrequency,
          fftMagnitudes,
          sampleRate,
          fftSize,
        )
      : 0,
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
    chromesthesiaComponents,
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
  analysisHints = null,
}) {
  const debug = buildDebugSummary({
    inputMode,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    micNoiseGateActive: false,
    micHardSilenceActive: false,
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
      referenceModeSlots,
      bandEnergies,
      backboneSlots,
      detailSlots,
      modeSlots,
      backboneColorSlots,
      detailColorSlots,
      auditSettings,
      analysisHints,
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

  return {
    ...snapshot,
    sourceMode: "test",
    avgAmplitude: testBinAmplitude * 255,
    fftMagnitudes,
    rms: snapshot.rms ?? 0,
  };
}

function computeMicMetrics({
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

function detectMicHardSilence(metrics, thresholds) {
  return (
    metrics.avgAmplitude <= thresholds.hardSilenceAvg &&
    metrics.rms <= thresholds.hardSilenceRms &&
    metrics.peakAmplitude <= thresholds.hardSilencePeak
  );
}

export function detectMicNoiseGate({
  injectTestTone,
  inputMode,
  avgAmplitude,
  rms,
  fftMagnitudes,
  sampleRate = 44100,
  fftSize = 4096,
  micAnalysisSettings = DEFAULT_MIC_ANALYSIS_SETTINGS,
}) {
  const profile = normalizeMicAnalysisSettings(micAnalysisSettings).profile;
  const config = getMicProfileConfig(profile);
  const metrics = computeMicMetrics({
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
    inputMode === "mic" &&
    detectMicHardSilence(metrics, thresholds) &&
    metrics.spectralCentroid < config.absoluteCentroidFloor
  );
}

function updateMicCalibrationBaseline(bandState, metrics, deltaMs) {
  const alpha = computeEmaAlpha(deltaMs, MIC_CALIBRATION_SMOOTHING_MS);
  if (
    !(bandState.micBaselineRms > 0) &&
    !(bandState.micBaselinePeak > 0) &&
    !(bandState.micBaselineCentroid > 0) &&
    !(bandState.micBaselineLowBandEnergy > 0)
  ) {
    bandState.micBaselineRms = metrics.rms;
    bandState.micBaselinePeak = metrics.peakAmplitude;
    bandState.micBaselineCentroid = metrics.spectralCentroid;
    bandState.micBaselineLowBandEnergy = metrics.lowBandEnergy;
    return;
  }

  bandState.micBaselineRms += (metrics.rms - bandState.micBaselineRms) * alpha;
  bandState.micBaselinePeak +=
    (metrics.peakAmplitude - bandState.micBaselinePeak) * alpha;
  bandState.micBaselineCentroid +=
    (metrics.spectralCentroid - bandState.micBaselineCentroid) * alpha;
  bandState.micBaselineLowBandEnergy +=
    (metrics.lowBandEnergy - bandState.micBaselineLowBandEnergy) * alpha;
}

function deriveMicThresholds(bandState, profileConfig) {
  return {
    openRms: Math.max(
      profileConfig.absoluteRmsFloor * 0.2,
      bandState.micBaselineRms * profileConfig.rmsOpenMultiplier +
        profileConfig.rmsOpenOffset,
    ),
    closeRms: Math.max(
      profileConfig.absoluteRmsFloor * 0.15,
      bandState.micBaselineRms * profileConfig.rmsCloseMultiplier +
        profileConfig.rmsCloseOffset,
    ),
    openPeak: profileConfig.absolutePeakFloor,
    closePeak: Math.max(
      MIC_SIGNAL_PEAK_AMPLITUDE * 0.7,
      profileConfig.absolutePeakFloor * 0.85,
    ),
    openCentroid:
      bandState.micBaselineCentroid * profileConfig.centroidOpenMultiplier +
      profileConfig.centroidOpenOffset,
    openLowBand:
      bandState.micBaselineLowBandEnergy * profileConfig.lowBandOpenMultiplier +
      profileConfig.lowBandOpenOffset,
    hardSilenceRms: Math.max(
      profileConfig.absoluteRmsFloor * 0.8,
      bandState.micBaselineRms * profileConfig.hardSilenceRmsMultiplier +
        profileConfig.hardSilenceRmsOffset,
    ),
    hardSilencePeak: Math.max(
      profileConfig.absolutePeakFloor * 0.4,
      bandState.micBaselinePeak * profileConfig.hardSilencePeakMultiplier +
        profileConfig.hardSilencePeakOffset,
    ),
    hardSilenceAvg:
      profileConfig.absoluteAvgAmplitude *
        profileConfig.hardSilenceAvgMultiplier +
      profileConfig.hardSilenceAvgOffset,
  };
}

function qualifiesMicOpen(metrics, thresholds, profile, profileConfig) {
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

function qualifiesMicHold(metrics, thresholds, profile) {
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

function resolveMicNoiseGate({
  analysisMemory,
  injectTestTone,
  inputMode,
  avgAmplitude,
  rms,
  fftMagnitudes,
  sampleRate,
  fftSize,
  currentFrameAtMs,
  micAnalysisSettings,
}) {
  const bandState = analysisMemory.bandState;
  const { profile } = normalizeMicAnalysisSettings(micAnalysisSettings);
  if (injectTestTone || inputMode !== "mic") {
    resetMicGateState(bandState, {
      inputMode,
      profile,
    });
    return {
      active: false,
      hardSilence: false,
    };
  }

  if (
    bandState.micInputMode !== "mic" ||
    bandState.micProfile !== profile ||
    currentFrameAtMs < (bandState.micPreviousFrameAtMs ?? 0)
  ) {
    beginMicCalibration(bandState, currentFrameAtMs, profile);
  }

  const profileConfig = getMicProfileConfig(profile);
  const metrics = computeMicMetrics({
    avgAmplitude,
    rms,
    fftMagnitudes,
    sampleRate,
    fftSize,
  });
  const deltaMs = getFrameDeltaMs(
    bandState.micPreviousFrameAtMs,
    currentFrameAtMs,
  );
  bandState.micInputMode = "mic";
  bandState.micProfile = profile;
  bandState.micPreviousFrameAtMs = currentFrameAtMs;

  if (bandState.micCalibrationActive) {
    updateMicCalibrationBaseline(bandState, metrics, deltaMs);
    if (
      currentFrameAtMs - bandState.micCalibrationStartedAtMs <
      MIC_CALIBRATION_WINDOW_MS
    ) {
      return {
        active: true,
        hardSilence: true,
      };
    }

    bandState.micCalibrationActive = false;
    bandState.micGateState = "closed";
    bandState.micOpenFrames = 0;
    bandState.micQuietFrames = 0;
  }

  const hardGateActive = detectMicNoiseGate({
    injectTestTone,
    inputMode,
    avgAmplitude,
    rms,
    fftMagnitudes,
    sampleRate,
    fftSize,
    micAnalysisSettings: { profile },
  });
  const thresholds = deriveMicThresholds(bandState, profileConfig);
  const hardSilence = detectMicHardSilence(metrics, thresholds);

  if (hardSilence) {
    bandState.micGateState = "closed";
    bandState.micQuietFrames = 0;
    bandState.micOpenFrames = 0;
    return {
      active: true,
      hardSilence: true,
    };
  }

  if (bandState.micGateState === "open") {
    if (!hardGateActive && qualifiesMicHold(metrics, thresholds, profile)) {
      bandState.micQuietFrames = 0;
      return {
        active: false,
        hardSilence: false,
      };
    }

    bandState.micQuietFrames += 1;
    if (bandState.micQuietFrames < profileConfig.closeFrames) {
      return {
        active: false,
        hardSilence: false,
      };
    }

    bandState.micGateState = "closed";
    bandState.micQuietFrames = 0;
    bandState.micOpenFrames = 0;
    return {
      active: true,
      hardSilence: false,
    };
  }

  if (
    !hardGateActive &&
    qualifiesMicOpen(metrics, thresholds, profile, profileConfig)
  ) {
    bandState.micOpenFrames += 1;
    if (bandState.micOpenFrames >= profileConfig.openFrames) {
      bandState.micGateState = "open";
      bandState.micOpenFrames = 0;
      bandState.micQuietFrames = 0;
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

  bandState.micOpenFrames = 0;
  return {
    active: true,
    hardSilence: false,
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

function resolveVoiceDriver({
  backboneState,
  detection,
  hardSilence,
  profileConfig,
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
  updateVoiceDetectionDiagnostics(backboneState, detection, {
    voicingActive: voicing.active,
    highCandidateRejected: voicing.highCandidateRejected,
    rejectionReason: voicing.rejectionReason,
  });

  if (
    voicing.active &&
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

function resolveAmbientPeakOptions(profileConfig) {
  return {
    maxFrequency: profileConfig.spectralPeakMaxHz,
    regionRanges: AMBIENT_REGION_RANGES,
    perRegionCount: 4,
  };
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

function releaseLayer(layerState, capacity, options, targetSlots = null) {
  const resolvedTargetSlots = targetSlots ?? buildEmptyTarget(capacity);
  blendModalStack(layerState, resolvedTargetSlots, capacity, options);
  if (options.colorOptions) {
    blendColorStack(
      layerState,
      resolvedTargetSlots,
      buildEmptyTarget(capacity),
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
    getSourceNormalization({
      inputMode,
      avgAmplitude,
      analyserRms,
      spectralCentroid,
      bandState,
    });

  const structureSignal = clamp01(
    (activeModeCount / Math.max(1, signalNormalizationSlots * 0.55)) * 0.34 +
      (uniqueModeCount / Math.max(1, signalNormalizationSlots * 0.7)) * 0.24 +
      harmonicSupport * 0.18 +
      bandDistribution * 0.14 +
      normalizedCentroid * 0.1 +
      (hints?.harmonicity ?? 0) * 0.08 +
      (hints?.textureSpread ?? 0) * 0.06,
  );
  const energySignal = clamp01(
    normalizedRms * 0.42 +
      normalizedAmplitude * 0.26 +
      averageArray(bandEnergies) * 0.2 +
      clamp01(dominantAmplitude) * 0.12 +
      (hints?.bassSalience ?? 0) * 0.08,
  );
  const changeSignal = clamp01(
    clamp01(spectralFlux * 8) * 0.28 +
      transientEnergy * 0.26 +
      averageDelta * 0.2 +
      turnoverRatio * 0.16 +
      clamp01(Math.abs(normalizedCentroid - bandDistribution) * 1.2) * 0.1 +
      (hints?.novelty ?? 0) * 0.18 +
      (hints?.transientSalience ?? 0) * 0.12,
  );
  const pulseDriver = beatThreshold > 0 ? beatOnsetDriver / beatThreshold : 0;
  const pulseSignal = clamp01(
    (beatDetected ? beatStrength * 0.56 + beatConfidence * 0.24 : 0) +
      clamp01(pulseDriver * 0.22) +
      (hints?.transientSalience ?? 0) * 0.12 +
      (hints?.novelty ?? 0) * 0.06,
  );

  return {
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
  };
}

function updateBandState({
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

  const { estimatedTempo, tempoConfidence, beatPhase } = updateTempoState(
    bandState,
    beatDetected,
    beatConfidence,
    currentFrameAtMs,
  );

  const rhythmicDensity = computeRhythmicDensity(
    bandState,
    deltaMs,
    currentFrameAtMs,
  );

  if (
    !(previousSpectrum instanceof Float32Array) ||
    previousSpectrum.length !== fftMagnitudes.length
  ) {
    analysisMemory.previousSpectrum = new Float32Array(fftMagnitudes.length);
  }
  analysisMemory.previousSpectrum.set(fftMagnitudes);

  return {
    bandEnergies: analysisMemory.bandEnergies,
    spectralCentroid,
    spectralFlux,
    transientEnergy,
    beatDetected,
    beatPulseId: bandState.beatPulseId ?? 0,
    beatStrength,
    beatConfidence,
    estimatedTempo,
    tempoConfidence,
    beatPhase,
    rhythmicDensity,
    beatLowBandEnergy: lowBandEnergy,
    beatOnsetDriver: onsetDriver,
    beatThreshold: adaptiveThreshold,
  };
}

function updateTempoState(
  bandState,
  beatDetected,
  beatConfidence,
  currentFrameAtMs,
) {
  if (beatDetected) {
    const idx = bandState.beatTimestampWriteIdx % BEAT_HISTORY_SIZE_LOCAL;
    bandState.beatTimestamps[idx] = currentFrameAtMs;
    bandState.beatTimestampWriteIdx += 1;
    bandState.beatTimestampCount = Math.min(
      bandState.beatTimestampCount + 1,
      BEAT_HISTORY_SIZE_LOCAL,
    );

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

function computeMicFftNormGain(fftMagnitudes, target, maxGain) {
  let peak = 0;
  for (let i = 0; i < fftMagnitudes.length; i++) {
    if (fftMagnitudes[i] > peak) peak = fftMagnitudes[i];
  }
  if (peak <= 0) return 1.0;
  return Math.min(Math.max(target / peak, 1.0), maxGain);
}

function scaledFftCopy(fftMagnitudes, gain) {
  if (gain === 1.0) return fftMagnitudes;
  const out = new Float32Array(fftMagnitudes.length);
  for (let i = 0; i < fftMagnitudes.length; i++) {
    out[i] = fftMagnitudes[i] * gain;
  }
  return out;
}

function resolveLayeredModalStacks({
  analysisSnapshot,
  status,
  backboneState,
  detailState,
  radius,
  capacity,
  currentFrame,
  micNoiseGateActive,
  micHardSilenceActive,
  micProfile,
  auditSettings,
  spectralCentroid,
  includeChromesthesia,
  analysisHints,
}) {
  let analysisEngine = "none";
  let pitchSource = "none";
  let spectralCandidates = [];
  let usedDecay = false;

  const backboneCapacity = getLayerSlotLimit("backbone", capacity);
  const detailCapacity = getLayerSlotLimit("detail", capacity);
  const profileConfig = getMicProfileConfig(micProfile);
  let backboneTrackingSlots = buildEmptyTarget(backboneCapacity);
  let detailTrackingSlots = buildEmptyTarget(detailCapacity);

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
      spectralCentroid,
      includeChromesthesia,
    });
    const detailBuild = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity: detailCapacity,
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
  } else if (!micNoiseGateActive && analysisSnapshot?.fftMagnitudes) {
    const fftMagnitudes = analysisSnapshot.fftMagnitudes;
    const layerBlendOptions = {
      attack: BACKBONE_ATTACK,
      tracking: BACKBONE_ATTACK,
      release: BACKBONE_RELEASE,
      freshCap: BLEND_MAX_FRESH_PER_FRAME,
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
    const isVoiceMic =
      status.audioInputMode === "mic" && micProfile === "voice-tone";
    const isAmbientMic =
      status.audioInputMode === "mic" && micProfile === "ambient";

    if (isVoiceMic) {
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
        hardSilence: micHardSilenceActive,
        profileConfig,
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

      const micNormGain = computeMicFftNormGain(
        fftMagnitudes,
        MIC_MODAL_FFT_TARGET,
        MIC_MODAL_FFT_MAX_GAIN,
      );
      const modalFft = scaledFftCopy(fftMagnitudes, micNormGain);

      if (voiceDriver.frequency > 0) {
        const backboneTarget = buildModalSlotsFromFundamental({
          frequency: voiceDriver.frequency,
          confidence: hintedVoiceConfidence,
          fftMagnitudes: modalFft,
          sampleRate: status.sampleRate,
          fftSize: status.fftSize,
          radius,
          capacity: backboneCapacity,
          spectralCentroid,
          includeChromesthesia,
        });
        const detailTarget = buildModalSlotsFromSpectralPeaks({
          fftMagnitudes: modalFft,
          sampleRate: status.sampleRate,
          fftSize: status.fftSize,
          radius,
          capacity: detailCapacity,
          slotLimit: detailCapacity,
          spectralCentroid,
          includeChromesthesia,
          peaks: voiceDetailPeaks,
        });
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
      const micNormGainAmbient = isAmbientMic
        ? computeMicFftNormGain(
            fftMagnitudes,
            MIC_MODAL_FFT_TARGET,
            MIC_MODAL_FFT_MAX_GAIN,
          )
        : 1.0;
      const modalFftAmbient = scaledFftCopy(fftMagnitudes, micNormGainAmbient);
      // Peak detection uses the original FFT with a proportionally scaled
      // threshold: noise bins that would exceed 0.12 only after normalization
      // are excluded, while genuine signal peaks that are just quiet in the
      // original still pass. Region-based spreading (AMBIENT_REGION_RANGES) is
      // intentionally omitted here — it was designed for true broadband ambient
      // (crowd, room) but for music it guarantees harmonically unrelated peaks
      // across bass/mid/treble that produce incoherent superposition. The
      // salience scorer picks the most harmonically coherent peaks instead.
      const peakDetectionMinAmplitude = isAmbientMic
        ? SPECTRAL_MODAL_POLICY.minSpectralBinAmplitude / micNormGainAmbient
        : undefined;
      const peakOptions = isAmbientMic
        ? {
            maxFrequency: resolveAmbientPeakOptions(profileConfig).maxFrequency,
            minimumAmplitude: peakDetectionMinAmplitude,
          }
        : undefined;
      const candidatePool = findSpectralPeakFrequencies(
        fftMagnitudes,
        status.sampleRate,
        status.fftSize,
        INTERNAL_CANDIDATE_POOL_SIZE,
        peakOptions,
      );
      annotatePeakSalience(
        candidatePool,
        modalFftAmbient,
        status.sampleRate,
        status.fftSize,
      );
      // Backbone strategy differs by mode:
      // - Ambient mic: drive from a SINGLE dominant peak via buildModalSlotsFromFundamental.
      //   buildModalSlotsFromPeakDrivers with 3 peaks picks harmonically-related
      //   frequencies (f, 2f, 3f after normalization flattens the harmonic envelope)
      //   and treats each as an independent fundamental, generating overlapping
      //   high-mode-number series → incoherent ray patterns. Single-peak mirrors
      //   voice mode: one coherent standing wave, detail carries harmonic texture.
      // - File / system audio: use buildModalSlotsFromPeakDrivers with BACKBONE_PEAK_COUNT
      //   peaks for polyphonic chord support (harmonically unrelated notes each
      //   drive their own standing wave at natural amplitude levels).
      const detailPeaks = selectScoredPeaks(
        candidatePool,
        DETAIL_PEAK_COUNT,
        analysisHints,
        "detail",
      );
      let backboneTarget;
      let dominantPeak;
      if (isAmbientMic) {
        dominantPeak =
          selectScoredPeaks(candidatePool, 1, analysisHints, "backbone")[0] ??
          null;
        // Only update backbone if the peak has real harmonic structure.
        // Noise peaks (fricatives, room transients) have salienceScore ≈ 0;
        // tonal music/humming scores ≥ 0.15. Below the gate the backbone
        // holds its current EMA state and decays naturally — no incoherent
        // noise mode injected.
        const hasTonalContent =
          dominantPeak !== null &&
          (dominantPeak.salienceScore ?? 0) >=
            AMBIENT_MIC_BACKBONE_MIN_SALIENCE;
        backboneTarget = hasTonalContent
          ? buildModalSlotsFromFundamental({
              frequency: dominantPeak.frequency,
              confidence: Math.max(
                0.45,
                dominantPeak.amplitude * micNormGainAmbient,
              ),
              fftMagnitudes: modalFftAmbient,
              sampleRate: status.sampleRate,
              fftSize: status.fftSize,
              radius,
              capacity: backboneCapacity,
              spectralCentroid,
              includeChromesthesia,
            })
          : {
              slots: new Float32Array(backboneCapacity * 4),
              referenceSlots: new Float32Array(backboneCapacity * 4),
              colorSlots: new Float32Array(backboneCapacity * 4),
              harmonicSupport: new Float32Array(HARMONIC_ORDERS.length),
              uniqueModeCount: 0,
              components: [],
              peaks: [],
            };
      } else {
        const backbonePeaks = selectScoredPeaks(
          candidatePool,
          BACKBONE_PEAK_COUNT,
          analysisHints,
          "backbone",
        );
        dominantPeak = backbonePeaks[0] ?? null;
        backboneTarget = buildModalSlotsFromPeakDrivers({
          fftMagnitudes: modalFftAmbient,
          sampleRate: status.sampleRate,
          fftSize: status.fftSize,
          radius,
          capacity: backboneCapacity,
          peakCount: backbonePeaks.length || BACKBONE_PEAK_COUNT,
          slotLimit: backboneCapacity,
          spectralCentroid,
          includeChromesthesia,
          peaks: backbonePeaks,
        });
      }
      const detailTarget = buildModalSlotsFromSpectralPeaks({
        fftMagnitudes: modalFftAmbient,
        sampleRate: status.sampleRate,
        fftSize: status.fftSize,
        radius,
        capacity: detailCapacity,
        peakCount: detailPeaks.length || DETAIL_PEAK_COUNT,
        slotLimit: detailCapacity,
        spectralCentroid,
        includeChromesthesia,
        peaks: detailPeaks,
      });

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
          isAmbientMic ? "multi-spectral" : "layered",
        );
        setLayerMetadata(
          detailState,
          detailTarget,
          dominantPeak?.frequency ?? 0,
          dominantPeak?.amplitude ?? 0,
          isAmbientMic ? "multi-spectral" : "layered",
        );
        analysisEngine = isAmbientMic ? "multi-spectral" : "layered";
        pitchSource = isAmbientMic ? "multi-spectral" : "spectral";
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
        );
        usedDecay = true;
      } else {
        clearModalStack(backboneState);
        clearModalStack(detailState);
      }
    }
  } else if (
    status.audioInputMode !== "idle" &&
    !micNoiseGateActive &&
    (backboneState.analysisEngine !== "none" ||
      detailState.analysisEngine !== "none")
  ) {
    const layerBlendOptions = {
      attack: BACKBONE_ATTACK,
      tracking: BACKBONE_ATTACK,
      release: BACKBONE_RELEASE,
      freshCap: BLEND_MAX_FRESH_PER_FRAME,
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
    );
    usedDecay = true;
  } else {
    clearModalStack(backboneState);
    clearModalStack(detailState);
    if (micProfile === "voice-tone") {
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
  };
}

function finalizeFeatureDebugSnapshot({
  auditSettings,
  inputMode,
  pitchSource,
  analysisEngine,
  fieldState,
  soundActive,
  micActive,
  micNoiseGateActive,
  micHardSilenceActive,
  micCalibrationActive,
  micProfile,
  micBaselineRms,
  micBaselinePeak,
  backboneState,
  detailState,
  dominantFrequency,
  dominantAmplitude,
  avgAmplitude,
  analyserRms,
  spectralCandidates,
  fftMagnitudes,
  backboneSlots,
  detailSlots,
  modeSlots,
  backboneColorSlots,
  detailColorSlots,
  referenceModeSlots,
  bandEnergies,
  transientEnergy,
  spectralCentroid,
  spectralFlux,
  structureSignal,
  energySignal,
  changeSignal,
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
}) {
  const debug = buildDebugSummary({
    inputMode,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    micNoiseGateActive,
    micHardSilenceActive,
    micCalibrationActive,
    micProfile,
    micBaselineRms,
    micBaselinePeak,
    backboneState,
    detailState,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    fftMagnitudes,
    backboneSlots,
    detailSlots,
    modeSlots,
    chromesthesiaComponents: [
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

export function buildAudioFeatureFrame({
  analysisSnapshot,
  featureState,
  radius,
  status,
  auditSettings = undefined,
  beatSettings = undefined,
  frameTimeMs = undefined,
  micAnalysisSettings = DEFAULT_MIC_ANALYSIS_SETTINGS,
  includeChromesthesia = true,
  analysisHints = null,
}) {
  const capacity = featureState?.capacity ?? AUDIO_SLOT_CAPACITY;
  const analysisMemory = getAnalysisMemory(featureState, capacity);
  const {
    backboneSlots,
    detailSlots,
    modeSlots,
    backboneColorSlots,
    detailColorSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    bandEnergies,
    backboneState,
    detailState,
    bandState,
  } = ensureAnalysisMemoryShape(featureState, analysisMemory, capacity);
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
  const currentFrameAtMs = getFrameTimeMs(frameTimeMs);
  const resolvedMicAnalysisSettings =
    normalizeMicAnalysisSettings(micAnalysisSettings);
  const shouldBuildChromesthesia = Boolean(
    includeChromesthesia ||
    resolvedAuditSettings.enabled ||
    resolvedAuditSettings.freezeModeSlots,
  );
  const currentFrame = (analysisMemory.frameId ?? 0) + 1;

  if (featureState?.analysis) {
    featureState.analysis.frameId = currentFrame;
  }

  let sourceMode =
    inputMode === "file" ? "file" : inputMode === "mic" ? "mic" : "silent";
  if (resolvedAuditSettings.injectTestTone) sourceMode = "test";

  if (!analysisSnapshot && !resolvedAuditSettings.injectTestTone) {
    if (inputMode !== "mic") {
      resetMicGateState(analysisMemory.bandState, {
        inputMode,
        profile: resolvedMicAnalysisSettings.profile,
      });
    }
    return buildSilentFeatureFrame({
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
  const spectralCentroidHint = computeSpectralCentroid(
    fftMagnitudesSource,
    sampleRate,
  );

  const { active: micNoiseGateActive, hardSilence: micHardSilenceActive } =
    resolveMicNoiseGate({
      analysisMemory,
      injectTestTone: resolvedAuditSettings.injectTestTone,
      inputMode,
      avgAmplitude,
      rms: analyserRms,
      fftMagnitudes: fftMagnitudesSource,
      sampleRate,
      fftSize,
      currentFrameAtMs,
      micAnalysisSettings: resolvedMicAnalysisSettings,
    });

  const { analysisEngine, pitchSource, spectralCandidates, usedDecay } =
    resolveLayeredModalStacks({
      analysisSnapshot: snapshot,
      status: {
        ...status,
        sampleRate,
        fftSize,
      },
      backboneState,
      detailState,
      radius,
      capacity,
      currentFrame,
      micNoiseGateActive,
      micHardSilenceActive,
      micProfile: resolvedMicAnalysisSettings.profile,
      auditSettings: resolvedAuditSettings,
      spectralCentroid: spectralCentroidHint,
      includeChromesthesia: shouldBuildChromesthesia,
      analysisHints,
    });

  copyFloatArray(backboneSlots, backboneState.slots);
  copyFloatArray(detailSlots, detailState.slots);
  if (shouldBuildChromesthesia) {
    copyFloatArray(backboneColorSlots, backboneState.colorSlots);
    copyFloatArray(detailColorSlots, detailState.colorSlots);
  } else {
    backboneColorSlots.fill(0);
    detailColorSlots.fill(0);
  }
  copyFloatArray(referenceBackboneSlots, backboneState.referenceSlots);
  copyFloatArray(referenceDetailSlots, detailState.referenceSlots);
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

  let returnedBackboneSlots = backboneSlots;
  let returnedDetailSlots = detailSlots;
  let returnedModeSlots = modeSlots;
  let returnedBackboneColorSlots = backboneColorSlots;
  let returnedDetailColorSlots = detailColorSlots;
  if (resolvedAuditSettings.freezeModeSlots && auditState) {
    const hasFrozen =
      auditState.frozenBackboneSlots.some((value) => value !== 0) ||
      auditState.frozenDetailSlots.some((value) => value !== 0);
    if (!hasFrozen) {
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

  let fftMagnitudes = analysisMemory.fftMagnitudes;
  if (!fftMagnitudes || fftMagnitudes.length !== fftMagnitudesSource.length) {
    fftMagnitudes = new Float32Array(fftMagnitudesSource.length);
    if (featureState?.analysis) {
      featureState.analysis.fftMagnitudes = fftMagnitudes;
    }
  }
  fftMagnitudes.set(fftMagnitudesSource);

  // Chroma + key detection
  const chromaState = featureState.analysis.chromaState;
  const rawChroma = buildChromaVector(fftMagnitudes, sampleRate, fftSize);
  smoothChromaInPlace(chromaState.smoothedChroma, rawChroma, CHROMA_EMA_ALPHA);
  const keyResult = detectKeyFromChroma(chromaState.smoothedChroma);
  chromaState.keyTonic = keyResult.tonic;
  chromaState.keyMode = keyResult.mode;
  chromaState.keyConfidence = keyResult.confidence;
  chromaState.keyTonicHue = pitchClassToHue(keyResult.tonic);

  const {
    spectralCentroid,
    spectralFlux,
    transientEnergy,
    beatDetected,
    beatPulseId,
    beatStrength,
    beatConfidence,
    estimatedTempo,
    tempoConfidence,
    beatPhase,
    rhythmicDensity,
    beatLowBandEnergy,
    beatOnsetDriver,
    beatThreshold,
  } = updateBandState({
    analysisMemory,
    fftMagnitudes,
    sampleRate,
    fftSize,
    rms: analyserRms,
    frameTimeMs: currentFrameAtMs,
    beatSettings,
  });

  const dominantFrequency =
    backboneState.fundamental || detailState.fundamental;
  const dominantAmplitude = dominantFrequency
    ? sampleFFTAmplitudeForFrequency(
        dominantFrequency,
        fftMagnitudes,
        sampleRate,
        fftSize,
      )
    : 0;
  const { structureSignal, energySignal, changeSignal, pulseSignal } =
    deriveCompositeSignals({
      inputMode,
      modeCapacity: capacity,
      signalNormalizationSlots: AUDIO_SIGNAL_NORMALIZATION_SLOTS,
      modeSlots: returnedModeSlots,
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
    });

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
    auditSettings: resolvedAuditSettings,
    inputMode,
    pitchSource,
    analysisEngine,
    fieldState,
    soundActive,
    micActive,
    micNoiseGateActive,
    micHardSilenceActive,
    micCalibrationActive: Boolean(bandState.micCalibrationActive),
    micProfile: bandState.micProfile ?? resolvedMicAnalysisSettings.profile,
    micBaselineRms: bandState.micBaselineRms ?? 0,
    micBaselinePeak: bandState.micBaselinePeak ?? 0,
    backboneState,
    detailState,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    spectralCandidates,
    fftMagnitudes,
    backboneSlots: returnedBackboneSlots,
    detailSlots: returnedDetailSlots,
    backboneColorSlots: returnedBackboneColorSlots,
    detailColorSlots: returnedDetailColorSlots,
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    bandEnergies,
    transientEnergy,
    spectralCentroid,
    spectralFlux,
    structureSignal,
    energySignal,
    changeSignal,
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
    backboneSlots: returnedBackboneSlots,
    detailSlots: returnedDetailSlots,
    backboneColorSlots: returnedBackboneColorSlots,
    detailColorSlots: returnedDetailColorSlots,
    bandEnergies,
    transientEnergy,
    spectralCentroid,
    spectralFlux,
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    beatDetected,
    beatPulseId,
    beatStrength,
    beatConfidence,
    estimatedTempo,
    tempoConfidence,
    beatPhase,
    rhythmicDensity,
    keyTonic: chromaState.keyTonic,
    keyMode: chromaState.keyMode,
    keyConfidence: chromaState.keyConfidence,
    keyTonicHue: chromaState.keyTonicHue,
    harmonicity: clamp01(analysisHints?.harmonicity ?? 0),
    bassSalience: clamp01(analysisHints?.bassSalience ?? 0),
    textureSpread: clamp01(analysisHints?.textureSpread ?? 0),
    novelty: clamp01(analysisHints?.novelty ?? 0),
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    sourceMode,
    debug,
    audit: resolvedAuditSettings,
  };
}
