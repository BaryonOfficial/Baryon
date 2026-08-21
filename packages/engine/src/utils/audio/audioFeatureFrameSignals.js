import { AUDIO_DEFAULTS } from "../../defaults.js";
import { clamp01 } from "../math.js";
import { computeEmaAlpha, resolveFrameDeltaMs } from "./analysisTiming.js";
import { deriveAudioFeatureCompositeSignals } from "./audioFeatureSignals.js";
import { deriveModalVisibilityComponents } from "./modalVisibility.js";

/**
 * @type {ReadonlyArray<readonly [string, Readonly<{
 *   attackMs: number,
 *   releaseMs: number,
 * }>]>}
 */
const SIGNAL_SMOOTHING_ENTRIES = Object.freeze([
  ["structureSignal", { attackMs: 70, releaseMs: 120 }],
  ["energySignal", { attackMs: 35, releaseMs: 80 }],
  ["changeSignal", { attackMs: 10, releaseMs: 42 }],
  ["pulseSignal", { attackMs: 8, releaseMs: 50 }],
]);
const VISIBILITY_SMOOTHING = Object.freeze({
  attackMs: 70,
  releaseMs: 160,
});

/** Owns temporal signal history without retaining a published feature frame. */
export function createAudioFeatureCompositionState() {
  return {
    analysisSessionKey: null,
    lastFrameAtMs: null,
    signals: null,
    modalVisibilityEnergy: 0,
  };
}

function resetCompositionState(state, analysisSessionKey) {
  state.analysisSessionKey = analysisSessionKey;
  state.lastFrameAtMs = null;
  state.signals = null;
  state.modalVisibilityEnergy = 0;
}

function readPreviousComposition(state, preparedInputs) {
  if (!state) {
    return null;
  }
  if (state.analysisSessionKey !== preparedInputs.analysisSessionKey) {
    resetCompositionState(state, preparedInputs.analysisSessionKey);
  }
  if (!state.signals || !Number.isFinite(state.lastFrameAtMs)) {
    return null;
  }
  return {
    deltaMs: resolveFrameDeltaMs(
      state.lastFrameAtMs,
      preparedInputs.currentFrameAtMs,
    ),
    signals: state.signals,
    modalVisibilityEnergy: state.modalVisibilityEnergy,
  };
}

function smoothFeatureSignal(
  currentValue,
  targetValue,
  deltaMs,
  { attackMs, releaseMs },
) {
  const alpha = computeEmaAlpha(
    deltaMs,
    targetValue > currentValue ? attackMs : releaseMs,
  );
  return currentValue + (targetValue - currentValue) * alpha;
}

function smoothCompositeSignals(target, previous) {
  if (!previous) {
    return target;
  }
  const smoothed = { ...target };
  for (const [key, timing] of SIGNAL_SMOOTHING_ENTRIES) {
    smoothed[key] = smoothFeatureSignal(
      previous.signals[key],
      target[key],
      previous.deltaMs,
      timing,
    );
  }
  return smoothed;
}

// IEC 61672-1 A-weighting curve (dB relative to 1kHz). A-weighting attenuates
// bass to approximate frequency-dependent hearing sensitivity; applying it in
// the forward direction keeps this metric aligned with perceived prominence.
function aWeightingDb(frequencyHz) {
  const f2 = frequencyHz * frequencyHz;
  const numerator = 12194 ** 2 * frequencyHz ** 4;
  const denominator =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12194 ** 2);
  return 20 * Math.log10(numerator / denominator) + 2.0;
}

function deriveAWeightedAmplitudeGain(frequencyHz) {
  return 10 ** (aWeightingDb(frequencyHz) / 20);
}

// bandEnergies buckets are [<=140Hz, <=600Hz, <=2400Hz, <=8000Hz]; 20Hz is
// the low end of hearing, used as the sub-band's lower bound for its
// geometric-mean center frequency.
const BASS_SALIENCE_SUB_BAND_CENTER_HZ = Math.sqrt(20 * 140);
const BASS_SALIENCE_LOW_MID_BAND_CENTER_HZ = Math.sqrt(140 * 600);
const BASS_SALIENCE_RAW_SUB_GAIN = deriveAWeightedAmplitudeGain(
  BASS_SALIENCE_SUB_BAND_CENTER_HZ,
);
const BASS_SALIENCE_RAW_LOW_MID_GAIN = deriveAWeightedAmplitudeGain(
  BASS_SALIENCE_LOW_MID_BAND_CENTER_HZ,
);
// bandEnergies are normalized magnitudes rather than calibrated SPL, so only
// the curve's relative shape is meaningful here. Anchor the low-mid band at
// unity and attenuate the sub band by the corresponding A-weighted ratio.
const BASS_SALIENCE_SUB_WEIGHT =
  BASS_SALIENCE_RAW_SUB_GAIN / BASS_SALIENCE_RAW_LOW_MID_GAIN;
const BASS_SALIENCE_LOW_MID_WEIGHT = 1;

function deriveDeterministicBassSalience(bandEnergies) {
  return clamp01(
    (bandEnergies?.[0] ?? 0) * BASS_SALIENCE_SUB_WEIGHT +
      (bandEnergies?.[1] ?? 0) * BASS_SALIENCE_LOW_MID_WEIGHT,
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

function applyModalAuthorityToSignals(signals, analysisResult, allowed) {
  if (!allowed) {
    return {
      ...signals,
      structureSignal: 0,
      energySignal: 0,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0,
      timbreSpread: 0,
      spectralNovelty: 0,
    };
  }

  return {
    ...signals,
    // The actual spectral spread (second central moment around the
    // centroid) replaces the prior hand-weighted band-energy blend — no
    // coefficients left to tune, it's a direct MPEG-7/DSP feature.
    timbreSpread: clamp01(analysisResult.spectralSpread ?? 0),
    spectralNovelty: deriveDeterministicSpectralNovelty({
      spectralFlux: analysisResult.spectralFlux,
      transientEnergy: analysisResult.transientEnergy,
      changeSignal: signals.changeSignal,
      beatOnsetDriver: analysisResult.beatOnsetDriver,
      beatDetected: analysisResult.beatDetected,
    }),
  };
}

function composeModalVisibility(modalProjection, analysisResult, previous) {
  const summary = deriveModalVisibilityComponents({
    modeSlots: modalProjection.modalDescriptor.slotViews.modalFieldSlots,
    modeCapacity: modalProjection.modalDescriptor.counts.modalFieldModeCount,
    projectedModalEnergy: modalProjection.energyLedger.projectedRenderEnergy,
    observationConfidence: modalProjection.modalObservationConfidence,
    hardSilent: analysisResult.liveInputHardSilenceActive,
  });
  const target = summary.displayVisibility;
  const displayVisibility =
    previous && target > 0
      ? smoothFeatureSignal(
          previous.modalVisibilityEnergy,
          target,
          previous.deltaMs,
          VISIBILITY_SMOOTHING,
        )
      : target;

  return {
    modalVisibilitySummary: summary,
    modalVisibilityEnergy: displayVisibility,
    modalObserverVisibilityEnergy: summary.observableModalEnergy,
  };
}

function commitCompositionState(state, preparedInputs, signals, visibility) {
  if (!state) {
    return;
  }
  state.analysisSessionKey = preparedInputs.analysisSessionKey;
  state.lastFrameAtMs = preparedInputs.currentFrameAtMs;
  state.signals = {
    structureSignal: signals.structureSignal,
    energySignal: signals.energySignal,
    changeSignal: signals.changeSignal,
    pulseSignal: signals.pulseSignal,
  };
  state.modalVisibilityEnergy = visibility.modalVisibilityEnergy;
}

/**
 * Projects current analysis and render authority into scalar frame signals.
 * The optional state stores only the minimal temporal history and resets at
 * the analysis-session boundary; transport packets never participate.
 */
export function composeAudioFeatureFrameSignals({
  preparedInputs,
  analysisResult,
  modalProjection,
  sourceCoupledState,
  resonantState,
  compositionState = null,
}) {
  const previous = readPreviousComposition(compositionState, preparedInputs);
  const targetSignals = deriveAudioFeatureCompositeSignals({
    inputMode: preparedInputs.analysisInputMode,
    modeCapacity: preparedInputs.capacity,
    signalNormalizationSlots: AUDIO_DEFAULTS.signalNormalizationSlots,
    modeSlots: analysisResult.signalModeSlots ?? analysisResult.modeSlots,
    referenceModeSlots:
      analysisResult.signalReferenceModeSlots ??
      analysisResult.referenceModeSlots,
    sourceCoupledState,
    resonantState,
    bandEnergies: analysisResult.bandEnergies,
    analyserRms: analysisResult.analyserRms,
    dominantAmplitude: analysisResult.dominantAmplitude,
    spectralCentroid: analysisResult.spectralCentroid,
    spectralFlatness: analysisResult.spectralFlatness,
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
  });
  const signals = applyModalAuthorityToSignals(
    smoothCompositeSignals(targetSignals, previous),
    analysisResult,
    modalProjection.allowsFeatureSignals,
  );
  const visibility = composeModalVisibility(
    modalProjection,
    analysisResult,
    previous,
  );
  commitCompositionState(compositionState, preparedInputs, signals, visibility);

  return {
    ...signals,
    ...visibility,
    bassSalience: deriveDeterministicBassSalience(
      modalProjection.renderSources.bandEnergies,
    ),
  };
}
