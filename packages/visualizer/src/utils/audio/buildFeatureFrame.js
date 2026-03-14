import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
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
import { deriveFieldState } from "./fieldState.js";
import { AUDIO_ANALYSIS_POLICY, SPECTRAL_MODAL_POLICY } from "./policy.js";
import { FIELD_STATES } from "./types.js";

const {
  micSilenceAvgAmplitude: MIC_SILENCE_AVG_AMPLITUDE,
  micSignalPeakAmplitude: MIC_SIGNAL_PEAK_AMPLITUDE,
  requestedPitchSource: REQUESTED_PITCH_SOURCE,
} = AUDIO_ANALYSIS_POLICY;
const TEST_TONE_HARMONIC_ATTENUATION =
  SPECTRAL_MODAL_POLICY.harmonicAttenuation;

const BACKBONE_PEAK_COUNT = 3;
const DETAIL_PEAK_COUNT = 4;
const DETAIL_LAYER_WEIGHT = 0.35;
const BACKBONE_ATTACK = 0.22;
const BACKBONE_RELEASE = 0.96;
const DETAIL_ATTACK = 0.55;
const DETAIL_RELEASE = 0.82;
const DETAIL_FRESH_CAP = 0;
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
const MIC_PROFILE_CONFIGS = Object.freeze({
  "voice-tone": Object.freeze({
    absoluteAvgAmplitude: Math.max(4, MIC_SILENCE_AVG_AMPLITUDE * 0.5),
    absoluteRmsFloor: 0.009,
    absolutePeakFloor: 0.1,
    absoluteCentroidFloor: 0.006,
    openFrames: 1,
    closeFrames: 4,
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
  }),
  ambient: Object.freeze({
    absoluteAvgAmplitude: Math.max(3, MIC_SILENCE_AVG_AMPLITUDE * 0.4),
    absoluteRmsFloor: 0.007,
    absolutePeakFloor: 0.1,
    absoluteCentroidFloor: 0,
    openFrames: 1,
    closeFrames: 4,
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
  }),
});
const LOW_BAND_PRIMARY_WEIGHT = 0.7;
const LOW_BAND_SECONDARY_WEIGHT = 0.3;
const BEAT_LOW_BAND_RISE_WEIGHT = 0.5;
const BEAT_SPECTRAL_FLUX_WEIGHT = 0.35;
const BEAT_RMS_DELTA_WEIGHT = 0.15;
const MIN_BEAT_THRESHOLD = 0.024;
const DEFAULT_FRAME_TIME_MS = 1000 / 60;

export const DEFAULT_MIC_ANALYSIS_SETTINGS = Object.freeze({
  profile: DEFAULT_MIC_PROFILE,
});

export const MIC_PROFILE_OPTIONS = Object.freeze([
  Object.freeze({
    value: "voice-tone",
    label: "Voice",
    description: "Best for voice, humming, and simple sung notes.",
  }),
  Object.freeze({
    value: "ambient",
    label: "Ambient",
    description: "Most sensitive. Use for room texture and quieter sound beds.",
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
    workerState: "none",
    pitchFrameAge: null,
    workerStatus: null,
    fileActive: soundActive,
    micActive,
    micNoiseGateActive,
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
    driverFrequency: dominantFrequency,
    driverLocked: backboneModeCount > 0,
    candidateFrequency: 0,
    candidateConfidence: 0,
    candidateFrames: 0,
    latchHoldFrames: 0,
    latchLowSupportFrames: 0,
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
}) {
  const debug = buildDebugSummary({
    inputMode,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    micNoiseGateActive: false,
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

  return (
    !injectTestTone &&
    inputMode === "mic" &&
    metrics.avgAmplitude < config.absoluteAvgAmplitude &&
    metrics.rms < config.absoluteRmsFloor &&
    metrics.peakAmplitude < config.absolutePeakFloor &&
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
    return false;
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
      return true;
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

  if (bandState.micGateState === "open") {
    if (!hardGateActive && qualifiesMicHold(metrics, thresholds, profile)) {
      bandState.micQuietFrames = 0;
      return false;
    }

    bandState.micQuietFrames += 1;
    if (bandState.micQuietFrames < profileConfig.closeFrames) {
      return false;
    }

    bandState.micGateState = "closed";
    bandState.micQuietFrames = 0;
    bandState.micOpenFrames = 0;
    return true;
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
      return false;
    }
    return true;
  }

  bandState.micOpenFrames = 0;
  return true;
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

function releaseLayer(layerState, capacity, options) {
  blendModalStack(layerState, buildEmptyTarget(capacity), capacity, options);
  blendColorStack(
    layerState,
    buildEmptyTarget(capacity),
    buildEmptyTarget(capacity),
    capacity,
    options.colorOptions,
  );
  clearLayerMetadata(layerState);
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
  capacity,
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
}) {
  const activeModeCount = countActiveSlots(modeSlots, capacity);
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
    capacity,
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
    (activeModeCount / Math.max(1, capacity * 0.55)) * 0.34 +
      (uniqueModeCount / Math.max(1, capacity * 0.7)) * 0.24 +
      harmonicSupport * 0.18 +
      bandDistribution * 0.14 +
      normalizedCentroid * 0.1,
  );
  const energySignal = clamp01(
    normalizedRms * 0.42 +
      normalizedAmplitude * 0.26 +
      averageArray(bandEnergies) * 0.2 +
      clamp01(dominantAmplitude) * 0.12,
  );
  const changeSignal = clamp01(
    clamp01(spectralFlux * 8) * 0.28 +
      transientEnergy * 0.26 +
      averageDelta * 0.2 +
      turnoverRatio * 0.16 +
      clamp01(Math.abs(normalizedCentroid - bandDistribution) * 1.2) * 0.1,
  );
  const pulseDriver = beatThreshold > 0 ? beatOnsetDriver / beatThreshold : 0;
  const pulseSignal = clamp01(
    (beatDetected ? beatStrength * 0.56 + beatConfidence * 0.24 : 0) +
      clamp01(pulseDriver * 0.22),
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
    beatLowBandEnergy: lowBandEnergy,
    beatOnsetDriver: onsetDriver,
    beatThreshold: adaptiveThreshold,
  };
}

function resolveLayeredModalStacks({
  analysisSnapshot,
  status,
  backboneState,
  detailState,
  radius,
  capacity,
  micNoiseGateActive,
  auditSettings,
  spectralCentroid,
}) {
  let analysisEngine = "none";
  let pitchSource = "none";
  let spectralCandidates = [];
  let usedDecay = false;

  const backboneCapacity = getLayerSlotLimit("backbone", capacity);
  const detailCapacity = getLayerSlotLimit("detail", capacity);

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
  } else if (!micNoiseGateActive && analysisSnapshot?.fftMagnitudes) {
    const fftMagnitudes = analysisSnapshot.fftMagnitudes;
    const backboneTarget = buildModalSlotsFromPeakDrivers({
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity,
      peakCount: BACKBONE_PEAK_COUNT,
      slotLimit: backboneCapacity,
      spectralCentroid,
    });
    const detailTarget = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity,
      peakCount: DETAIL_PEAK_COUNT,
      slotLimit: detailCapacity,
      spectralCentroid,
    });

    spectralCandidates = detailTarget.peaks ?? backboneTarget.peaks ?? [];
    const dominantPeak =
      backboneTarget.peaks?.[0] ?? detailTarget.peaks?.[0] ?? null;

    if (
      backboneTarget.uniqueModeCount > 0 ||
      detailTarget.uniqueModeCount > 0
    ) {
      blendModalStack(backboneState, backboneTarget.slots, backboneCapacity, {
        attack: BACKBONE_ATTACK,
        tracking: BACKBONE_ATTACK,
        release: BACKBONE_RELEASE,
        freshCap: BLEND_MAX_FRESH_PER_FRAME,
      });
      blendColorStack(
        backboneState,
        backboneTarget.slots,
        backboneTarget.colorSlots,
        backboneCapacity,
        {
          attack: BACKBONE_COLOR_ATTACK,
          tracking: BACKBONE_COLOR_TRACKING,
          release: BACKBONE_COLOR_RELEASE,
          maxActiveSlots: BACKBONE_COLOR_SLOT_LIMIT,
        },
      );
      blendModalStack(detailState, detailTarget.slots, detailCapacity, {
        attack: DETAIL_ATTACK,
        tracking: DETAIL_ATTACK,
        release: DETAIL_RELEASE,
        freshCap: DETAIL_FRESH_CAP,
      });
      blendColorStack(
        detailState,
        detailTarget.slots,
        detailTarget.colorSlots,
        detailCapacity,
        {
          attack: DETAIL_COLOR_ATTACK,
          tracking: DETAIL_COLOR_TRACKING,
          release: DETAIL_COLOR_RELEASE,
          maxActiveSlots: DETAIL_COLOR_SLOT_LIMIT,
        },
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
    } else if (
      countActiveSlots(backboneState.slots, capacity) > 0 ||
      countActiveSlots(detailState.slots, capacity) > 0
    ) {
      releaseLayer(backboneState, backboneCapacity, {
        attack: BACKBONE_ATTACK,
        tracking: BACKBONE_ATTACK,
        release: BACKBONE_RELEASE,
        freshCap: BLEND_MAX_FRESH_PER_FRAME,
        colorOptions: {
          attack: BACKBONE_COLOR_ATTACK,
          tracking: BACKBONE_COLOR_TRACKING,
          release: BACKBONE_COLOR_RELEASE,
          maxActiveSlots: BACKBONE_COLOR_SLOT_LIMIT,
        },
      });
      releaseLayer(detailState, detailCapacity, {
        attack: DETAIL_ATTACK,
        tracking: DETAIL_ATTACK,
        release: DETAIL_RELEASE,
        freshCap: DETAIL_FRESH_CAP,
        colorOptions: {
          attack: DETAIL_COLOR_ATTACK,
          tracking: DETAIL_COLOR_TRACKING,
          release: DETAIL_COLOR_RELEASE,
          maxActiveSlots: DETAIL_COLOR_SLOT_LIMIT,
        },
      });
      usedDecay = true;
    } else {
      clearModalStack(backboneState);
      clearModalStack(detailState);
    }
  } else if (
    status.audioInputMode !== "idle" &&
    !micNoiseGateActive &&
    (backboneState.analysisEngine !== "none" ||
      detailState.analysisEngine !== "none")
  ) {
    releaseLayer(backboneState, backboneCapacity, {
      attack: BACKBONE_ATTACK,
      tracking: BACKBONE_ATTACK,
      release: BACKBONE_RELEASE,
      freshCap: BLEND_MAX_FRESH_PER_FRAME,
      colorOptions: {
        attack: BACKBONE_COLOR_ATTACK,
        tracking: BACKBONE_COLOR_TRACKING,
        release: BACKBONE_COLOR_RELEASE,
        maxActiveSlots: BACKBONE_COLOR_SLOT_LIMIT,
      },
    });
    releaseLayer(detailState, detailCapacity, {
      attack: DETAIL_ATTACK,
      tracking: DETAIL_ATTACK,
      release: DETAIL_RELEASE,
      freshCap: DETAIL_FRESH_CAP,
      colorOptions: {
        attack: DETAIL_COLOR_ATTACK,
        tracking: DETAIL_COLOR_TRACKING,
        release: DETAIL_COLOR_RELEASE,
        maxActiveSlots: DETAIL_COLOR_SLOT_LIMIT,
      },
    });
    usedDecay = true;
  } else {
    clearModalStack(backboneState);
    clearModalStack(detailState);
  }

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
}) {
  const debug = buildDebugSummary({
    inputMode,
    soundActive,
    micActive,
    pitchSource,
    analysisEngine,
    fieldState,
    micNoiseGateActive,
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
}) {
  const capacity = featureState?.capacity ?? AUDIO_DEFAULTS.capacity;
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

  const micNoiseGateActive = resolveMicNoiseGate({
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
      micNoiseGateActive,
      auditSettings: resolvedAuditSettings,
      spectralCentroid: spectralCentroidHint,
    });

  copyFloatArray(backboneSlots, backboneState.slots);
  copyFloatArray(detailSlots, detailState.slots);
  copyFloatArray(backboneColorSlots, backboneState.colorSlots);
  copyFloatArray(detailColorSlots, detailState.colorSlots);
  copyFloatArray(referenceBackboneSlots, backboneState.referenceSlots);
  copyFloatArray(referenceDetailSlots, detailState.referenceSlots);
  combineModalLayers(
    modeSlots,
    [
      { slots: backboneSlots, weight: 1 },
      { slots: detailSlots, weight: DETAIL_LAYER_WEIGHT },
    ],
    Math.min(capacity, MAX_STACK_SLOTS),
  );
  combineModalLayers(
    referenceModeSlots,
    [
      { slots: referenceBackboneSlots, weight: 1 },
      { slots: referenceDetailSlots, weight: DETAIL_LAYER_WEIGHT },
    ],
    Math.min(capacity, MAX_STACK_SLOTS),
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

  const {
    spectralCentroid,
    spectralFlux,
    transientEnergy,
    beatDetected,
    beatPulseId,
    beatStrength,
    beatConfidence,
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
      capacity,
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
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    sourceMode,
    debug,
    audit: resolvedAuditSettings,
  };
}
