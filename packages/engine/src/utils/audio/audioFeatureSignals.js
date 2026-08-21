import { BEAT_DEFAULTS } from "../../defaults.js";
import { DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT } from "../../core/audio/liveInputAnalysis.js";
import { clamp01 } from "../math.js";
import { computeEmaAlpha, resolveFrameDeltaMs } from "./analysisTiming.js";
import { resetLiveInputGateState } from "./liveInputNoiseGate.js";
import { countActiveSlots } from "./modalStack.js";
import { computeSignalSpectrumMetrics } from "./signalSpectrumMetrics.js";
import {
  recordBeatForTempoTracking,
  resetTempoTrackingTransientState,
} from "./tempoTracking.js";

const LOW_BAND_PRIMARY_WEIGHT = 0.7;
const LOW_BAND_SECONDARY_WEIGHT = 0.3;
const BEAT_LOW_BAND_RISE_WEIGHT = 0.5;
const BEAT_SPECTRAL_FLUX_WEIGHT = 0.35;
const BEAT_RMS_DELTA_WEIGHT = 0.15;
const MIN_BEAT_THRESHOLD = 0.024;
const LIVE_INPUT_STRUCTURE_RESPONSE_SCALE = 0.8;
const LIVE_INPUT_ENERGY_RESPONSE_SCALE = 0.55;
const LIVE_INPUT_CHANGE_RESPONSE_SCALE = 0.45;
const LIVE_INPUT_PULSE_RESPONSE_SCALE = 0.9;

export function resolveAudioFeatureFrameTimeMs(frameTimeMs) {
  return Number.isFinite(frameTimeMs) && frameTimeMs >= 0
    ? frameTimeMs
    : performance.now();
}

function averageArray(values) {
  if (!values?.length) return 0;

  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index] ?? 0;
  }

  return total / values.length;
}

export function deriveAudioSourceNormalization({
  inputMode,
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
    const normalizedRms = clamp01(
      baselineRms > 0
        ? (analyserRms - baselineRms * 0.75) / Math.max(0.003, baselineRms * 12)
        : analyserRms / 0.028,
    );
    return {
      normalizedRms,
      normalizedCentroid: clamp01(
        baselineCentroid > 0
          ? spectralCentroid / Math.max(0.02, baselineCentroid * 1.8)
          : spectralCentroid / 0.25,
      ),
    };
  }

  const normalizedRms = clamp01(analyserRms * 2.8);
  return {
    normalizedRms,
    normalizedCentroid: clamp01(spectralCentroid * 1.25),
  };
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
  bandState.previousFrameAtMs = 0;
  bandState.beatPulseId = 0;
  bandState.beatStrength = 0;
  bandState.beatConfidence = 0;
  resetTempoTrackingTransientState(bandState);
  resetLiveInputGateState(bandState, {
    inputMode: bandState.liveInputMode ?? "idle",
    policy: bandState.liveInputPolicy ?? DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  });
  if (analysisMemory.previousSpectrum instanceof Float32Array) {
    analysisMemory.previousSpectrum.fill(0);
  }
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
  for (let index = 0; index < slotCount; index += 1) {
    const amplitude = modeSlots[index * 4 + 3] ?? 0;
    const referenceAmplitude = referenceModeSlots[index * 4 + 3] ?? 0;
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

export function deriveAudioFeatureCompositeSignals({
  inputMode,
  modeCapacity,
  signalNormalizationSlots,
  modeSlots,
  referenceModeSlots,
  sourceCoupledState,
  resonantState,
  bandEnergies,
  analyserRms,
  dominantAmplitude,
  spectralCentroid,
  spectralFlatness = 0,
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
  const { normalizedRms, normalizedCentroid } =
    sourceNormalization ??
    deriveAudioSourceNormalization({
      inputMode,
      analyserRms,
      spectralCentroid,
      bandState,
    });

  // Scale mode-count terms with RMS so fades are not held open by slowly
  // releasing source-coupled modes. The floor preserves moderate-volume detail.
  const energyCoupling = Math.sqrt(Math.max(normalizedRms, 0.12));
  const modalPersistence = clamp01(structuralMetrics?.modalPersistence ?? 0);
  const distributedExcitation = clamp01(
    structuralMetrics?.distributedExcitation ?? 0,
  );
  // resonatorCoherence is already grounded in per-mode tonality/periodicity
  // evidence (see modalExcitation.js's coherenceTarget), so it's the most
  // direct coherence signal available, not just one heuristic among equals.
  const resonatorCoherence = clamp01(structuralMetrics?.modeCoherence ?? 0);
  // Tonality (1 - spectral flatness): whether the raw input spectrum itself
  // is peaky/harmonic vs broadband noise. Replaces a bass-energy proxy that
  // just duplicated bassSalience without checking for real tonal content —
  // structure should require actual harmonic evidence, not just bass level.
  const tonality = clamp01(1 - clamp01(spectralFlatness));
  const structureSignal = clamp01(
    (activeModeCount / Math.max(1, signalNormalizationSlots * 0.55)) *
      0.36 *
      energyCoupling +
      (uniqueModeCount / Math.max(1, signalNormalizationSlots * 0.7)) *
        0.26 *
        energyCoupling +
      harmonicSupport * 0.2 * energyCoupling +
      modalPersistence * 0.06 * energyCoupling +
      tonality * 0.08,
  );
  // Coherence describes structural quality, independent of signal energy —
  // so unlike structureSignal, it must not scale with how many modes are
  // merely active (a quantity/capacity measure): only with how well-formed
  // (tonal, harmonically supported, phase-stable) the active structure is.
  const modeCoherence = clamp01(
    resonatorCoherence * 0.4 +
      harmonicSupport * 0.3 +
      (1 - Math.min(1, turnoverRatio * 3)) * 0.15 +
      modalPersistence * 0.15 -
      distributedExcitation * 0.2,
  );
  // normalizedRms is the canonical source-level amplitude measure. The prior
  // band-average and low-band-share terms described spectral distribution,
  // not independent total level, while normalizedAmplitude was only an alias.
  // dominantAmplitude remains distinct peak-versus-mean evidence.
  const energySignal = clamp01(
    normalizedRms * 0.88 + clamp01(dominantAmplitude) * 0.12,
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

export function updateAudioFeatureBandSignals({
  analysisMemory,
  fftLinearAmplitudes,
  sampleRate,
  fftSize,
  rms,
  currentFrameAtMs,
  beatSettings,
  suppressBeat = false,
}) {
  const previousSpectrum = analysisMemory.previousSpectrum;
  const bandState = analysisMemory.bandState;
  if (
    Number.isFinite(bandState.previousFrameAtMs) &&
    bandState.previousFrameAtMs > currentFrameAtMs
  ) {
    resetBeatTrackingState(analysisMemory);
  }
  const {
    bandEnergies,
    spectralBandEnergies,
    trebleBroadbandEnergy,
    trebleTonalEnergy,
    spectralCentroid,
    spectralSpread,
    spectralFlatness,
    spectralFlux,
  } = computeSignalSpectrumMetrics({
    fftLinearAmplitudes,
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
  const deltaMs = resolveFrameDeltaMs(
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
    !suppressBeat &&
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
    recordBeatForTempoTracking(bandState, currentFrameAtMs);
    bandState.beatPulseId = (bandState.beatPulseId ?? 0) + 1;
  }

  if (
    !(previousSpectrum instanceof Float32Array) ||
    previousSpectrum.length !== fftLinearAmplitudes.length
  ) {
    analysisMemory.previousSpectrum = new Float32Array(
      fftLinearAmplitudes.length,
    );
  }
  analysisMemory.previousSpectrum.set(fftLinearAmplitudes);

  return {
    bandEnergies: analysisMemory.bandEnergies,
    spectralBandEnergies,
    trebleBroadbandEnergy,
    trebleTonalEnergy,
    spectralCentroid,
    spectralSpread,
    spectralFlatness,
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
