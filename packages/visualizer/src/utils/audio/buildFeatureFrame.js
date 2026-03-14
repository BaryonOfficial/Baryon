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
  HARMONIC_ORDERS,
} from "./modalResolvers.js";
import { deriveFieldState } from "./fieldState.js";
import { AUDIO_ANALYSIS_POLICY, SPECTRAL_MODAL_POLICY } from "./policy.js";
import { FIELD_STATES } from "./types.js";

const {
  micSilenceAvgAmplitude: MIC_SILENCE_AVG_AMPLITUDE,
  micSilenceRms: MIC_SILENCE_RMS,
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
const BAND_LIMITS_HZ = [140, 600, 2400, 8000];
const LOW_BAND_PRIMARY_WEIGHT = 0.7;
const LOW_BAND_SECONDARY_WEIGHT = 0.3;
const BEAT_LOW_BAND_RISE_WEIGHT = 0.5;
const BEAT_SPECTRAL_FLUX_WEIGHT = 0.35;
const BEAT_RMS_DELTA_WEIGHT = 0.15;
const MIN_BEAT_THRESHOLD = 0.024;
const DEFAULT_FRAME_TIME_MS = 1000 / 60;

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
  if (analysisMemory.previousSpectrum instanceof Float32Array) {
    analysisMemory.previousSpectrum.fill(0);
  }
}

function emptyFrozenLayers(auditState) {
  auditState.frozenBackboneSlots.fill(0);
  auditState.frozenDetailSlots.fill(0);
  auditState.frozenModeSlots.fill(0);
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
}

function clearLayerMetadata(layerState) {
  layerState.harmonicSupport.fill(0);
  layerState.fundamental = 0;
  layerState.fundamentalConfidence = 0;
  layerState.analysisEngine = "none";
  layerState.uniqueModeCount = 0;
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
  transientEnergy = 0,
  spectralCentroid = 0,
  spectralFlux = 0,
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
    beatDetected: false,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    beatLowBandEnergy: 0,
    beatOnsetDriver: 0,
    beatThreshold: 0,
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
    bandEnergies,
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
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
    });
    const detailBuild = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity: detailCapacity,
      peakCount: DETAIL_PEAK_COUNT,
      slotLimit: detailCapacity,
    });
    copyFloatArray(backboneState.slots, backboneBuild.slots);
    copyFloatArray(backboneState.referenceSlots, backboneBuild.referenceSlots);
    copyFloatArray(detailState.slots, detailBuild.slots);
    copyFloatArray(detailState.referenceSlots, detailBuild.referenceSlots);
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
    });
    const detailTarget = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: status.sampleRate,
      fftSize: status.fftSize,
      radius,
      capacity,
      peakCount: DETAIL_PEAK_COUNT,
      slotLimit: detailCapacity,
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
      blendModalStack(detailState, detailTarget.slots, detailCapacity, {
        attack: DETAIL_ATTACK,
        tracking: DETAIL_ATTACK,
        release: DETAIL_RELEASE,
        freshCap: DETAIL_FRESH_CAP,
      });
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
      });
      releaseLayer(detailState, detailCapacity, {
        attack: DETAIL_ATTACK,
        tracking: DETAIL_ATTACK,
        release: DETAIL_RELEASE,
        freshCap: DETAIL_FRESH_CAP,
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
    });
    releaseLayer(detailState, detailCapacity, {
      attack: DETAIL_ATTACK,
      tracking: DETAIL_ATTACK,
      release: DETAIL_RELEASE,
      freshCap: DETAIL_FRESH_CAP,
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
  referenceModeSlots,
  bandEnergies,
  transientEnergy,
  spectralCentroid,
  spectralFlux,
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
    transientEnergy,
    spectralCentroid,
    spectralFlux,
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
}) {
  const capacity = featureState?.capacity ?? AUDIO_DEFAULTS.capacity;
  const analysisMemory = getAnalysisMemory(featureState, capacity);
  const {
    backboneSlots,
    detailSlots,
    modeSlots,
    referenceBackboneSlots,
    referenceDetailSlots,
    referenceModeSlots,
    bandEnergies,
    backboneState,
    detailState,
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
  const currentFrame = (analysisMemory.frameId ?? 0) + 1;

  if (featureState?.analysis) {
    featureState.analysis.frameId = currentFrame;
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
      backboneSlots,
      detailSlots,
      modeSlots,
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

  const micNoiseGateActive = detectMicNoiseGate({
    injectTestTone: resolvedAuditSettings.injectTestTone,
    inputMode,
    avgAmplitude,
    rms: analyserRms,
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
    });

  copyFloatArray(backboneSlots, backboneState.slots);
  copyFloatArray(detailSlots, detailState.slots);
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
  if (resolvedAuditSettings.freezeModeSlots && auditState) {
    const hasFrozen =
      auditState.frozenBackboneSlots.some((value) => value !== 0) ||
      auditState.frozenDetailSlots.some((value) => value !== 0);
    if (!hasFrozen) {
      auditState.frozenBackboneSlots.set(backboneSlots);
      auditState.frozenDetailSlots.set(detailSlots);
      auditState.frozenModeSlots.set(modeSlots);
    }
    returnedBackboneSlots = auditState.frozenBackboneSlots;
    returnedDetailSlots = auditState.frozenDetailSlots;
    returnedModeSlots = auditState.frozenModeSlots;
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
    frameTimeMs,
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
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    bandEnergies,
    transientEnergy,
    spectralCentroid,
    spectralFlux,
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
    bandEnergies,
    transientEnergy,
    spectralCentroid,
    spectralFlux,
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
