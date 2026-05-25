import {
  sampleFFTAmplitudeForFrequency,
  getModalGeometryBackend,
} from "../../core/modalGeometryBackend.js";
import { LIVE_INPUT_ANALYSIS_CLASSES } from "../../core/audio/liveInputAnalysis.js";
import {
  blendColorStack,
  blendModalStack,
  countActiveSlots,
} from "./modalStack.js";
import { createModalExcitationState } from "./modalExcitationState.js";
import { createSpectralLightColor } from "./spectralLight.js";
import {
  countNonZeroFftBins,
  deriveHighQSparseResonatorAuthority,
} from "./highQSparseResonatorAuthority.js";
import {
  getPhaseAttack,
  getPhaseRelease,
  getPhaseVelocityLimit,
  normalizePhaseRad,
  PHASE_AUTHORITY_MIN,
  PHASE_VELOCITY_BLEND,
  PHASE_VELOCITY_RELEASE,
  unwrapPhaseDeltaRad,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";
import {
  classifyObservedModeRenderLayer,
  computeModalObservation,
  computeModalObserverNoiseFloor,
  getResonantHarmonicCoupling,
} from "./modalObservedScoring.js";
import {
  applyProjectionEnergyNormalization,
  mergeProjectionNormalizationMetrics,
} from "./modalProjectionNormalization.js";
import { updateModalResponseFrame } from "./modalResponse.js";
import {
  buildStaleResonantReleaseOverrides,
  buildStaleResonantTrackingOverrides,
  computeStaleResonantPressure,
} from "./modalStaleResonant.js";

const SOURCE_COUPLED_MAX_HZ = 3200;
const SOURCE_COUPLED_MIN_HZ = 60;
const RESONANT_MAX_HZ = 12000;
const RESONANT_MIN_HZ = 200;
const SOURCE_COUPLED_BINS_PER_OCTAVE = 5;
const RESONANT_BINS_PER_OCTAVE = 4;
const SOURCE_COUPLED_FAMILY_WIDTH = 2;
const RESONANT_FAMILY_WIDTH = 3;
const MAX_SYNTH_PARTIALS = 14;
const SYNTH_BUFFER_SIZE = 1024;
const MIN_RESONATOR_AMPLITUDE = 0.0025;
const MIN_DISPLAY_CONTINUITY_RESONATOR_AMPLITUDE = 0.00045;
const SOURCE_CUT_CURRENT_INPUT_FLOOR = 0.00008;
const SOURCE_CUT_RELEASE_HOLD_MS = 1180;
const RESONATOR_MIN_DECAY_MS = 90;
const RESONATOR_MAX_DECAY_MS = 340;
const DRIVE_BLEND_ALPHA = 0.18;
const COHERENCE_BLEND_ALPHA = 0.16;
const PERSISTENCE_BLEND_ALPHA = 0.12;
const SATURATION_FACTOR = 0.85;
const CANONICAL_DRIVE_POINT = Object.freeze({
  x: 0.31,
  y: 0.43,
  z: 0.57,
});
const MODE_ATLAS_CACHE = new Map();
const MODE_ATLAS_CACHE_MAX_SIZE = 8;
const MODE_RESPONSE_BASIS_CACHE = new Map();
const MODE_RESPONSE_BASIS_CACHE_MAX_SIZE = 512;
const EXCITATION_SOURCE_COUPLED_BLEND_ATTACK = 0.28;
const EXCITATION_SOURCE_COUPLED_BLEND_TRACKING = 0.32;
const EXCITATION_SOURCE_COUPLED_BLEND_RELEASE = 0.9;
const EXCITATION_SOURCE_COUPLED_SILENCE_RELEASE = 0.82;
const EXCITATION_SOURCE_COUPLED_LOW_SIGNAL_RELEASE_THRESHOLD = 0.08;
const EXCITATION_SOURCE_COUPLED_LOW_SIGNAL_RELEASE = 0.62;
const EXCITATION_SOURCE_COUPLED_OBSERVED_CONTINUITY_RELEASE = 0.94;
const EXCITATION_SOURCE_COUPLED_OBSERVED_CONTINUITY_EMPTY_RELEASE = 0.9;
const EXCITATION_SOURCE_COUPLED_OBSERVED_CONTINUITY_LOW_SIGNAL_RELEASE = 0.82;
const EXCITATION_SOURCE_COUPLED_FRESH_CAP = 3;
const EXCITATION_SOURCE_COUPLED_SWITCH_PROJECTION_FRAMES = 7;
const EXCITATION_RESONANT_BLEND_ATTACK = 0.45;
const EXCITATION_RESONANT_SHIFT_BLEND_ATTACK = 0.85;
const EXCITATION_RESONANT_BLEND_TRACKING = 0.5;
const EXCITATION_RESONANT_RESPONSE_ENVELOPE_TRACKING = 0.78;
const EXCITATION_RESONANT_BLEND_RELEASE = 0.68;
const EXCITATION_RESONANT_SILENCE_RELEASE = 0.58;
const EXCITATION_RESONANT_LOW_SIGNAL_RELEASE_THRESHOLD = 0.06;
const EXCITATION_RESONANT_LOW_SIGNAL_RELEASE = 0.48;
const EXCITATION_RESONANT_SIGNAL_COVERAGE_MIN = 0.68;
const EXCITATION_HIGH_Q_SIGNAL_COVERAGE_MIN = 0.82;
const EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE = 0.2;
const EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_STALE_PRESSURE = 0.08;
const EXCITATION_RESONANT_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE = 0.12;
const EXCITATION_RESONANT_FAST_SHIFT_MIN_SIGNAL_AMPLITUDE = 0.28;
const EXCITATION_RESONANT_FAST_SHIFT_SIGNAL_RATIO = 1.6;
const EXCITATION_RESONANT_CONTINUITY_RELEASE = 0.82;
const EXCITATION_RESONANT_CONTINUITY_EMPTY_RELEASE = 0.82;
const EXCITATION_RESONANT_CONTINUITY_LOW_SIGNAL_RELEASE = 0.72;
const EXCITATION_RESONANT_SHIFT_STALE_TRACKING = 0.86;
const EXCITATION_RESONANT_SHIFT_STALE_RELEASE = 0.3;
const EXCITATION_RESONANT_CONTINUITY_PRESENCE_RELEASE = 0.92;
const EXCITATION_RESONANT_FRESH_CAP = 2;
const SOURCE_COUPLED_SIGNAL_MIN_DRIVE_ENERGY = 0.045;
const RESONANT_SIGNAL_MIN_DRIVE_ENERGY = 0.05;
const SOURCE_COUPLED_SIGNAL_STALE_WINDOW_MS = 66;
const RESONANT_SIGNAL_STALE_WINDOW_MS = 33;
const SOURCE_COUPLED_SIGNAL_SCORE_DRIVE_WEIGHT = 0.7;
const SOURCE_COUPLED_SIGNAL_SCORE_AMPLITUDE_WEIGHT = 0.3;
const RESONANT_SIGNAL_SCORE_DRIVE_WEIGHT = 0.7;
const RESONANT_SIGNAL_SCORE_AMPLITUDE_WEIGHT = 0.14;
const RESONANT_SIGNAL_SCORE_FRESHNESS_WEIGHT = 0.16;
const RESONANT_SIGNAL_SCORE_SUSTAIN_WEIGHT = 0.075;
const OBSERVED_RESONANT_CARRY_ENVELOPE_WEIGHT = 0.08;
const RESONANT_SUSTAIN_MIN_COHERENCE = 0.5;
const RESONANT_SUSTAIN_MIN_PERSISTENCE = 0.2;
const RESONANT_SUSTAIN_REFERENCE_AMPLITUDE = 0.0045;
const RESONANT_SUSTAIN_REFERENCE_DRIVE_ENERGY = 0.005;
const RESONANT_SUSTAIN_SIGNAL_MIN_PRESENCE = 0.02;
const SOURCE_COUPLED_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY = 0.0002;
const SOURCE_COUPLED_DISPLAY_CONTINUITY_SIGNAL_BASE = 0.018;
const SOURCE_COUPLED_DISPLAY_CONTINUITY_PRESENCE_WEIGHT = 0.1;
const RESONANT_DISPLAY_CONTINUITY_MIN_PRESENCE = 0.0015;
const RESONANT_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY = 0.0002;
const RESONANT_SUBTLE_DISPLAY_CONTINUITY_MIN_MATURITY = 0.08;
const HIGH_Q_RESONANT_MIN_RING_SUPPORT = 0.08;
const HIGH_Q_RESONANT_MIN_RETAINED_ENERGY = 0.00045;
const HIGH_Q_RESONANT_MIN_MATURITY = 0.34;
const HIGH_Q_RESONANT_AUTHORITY_MIN_AGE_MS = 180;
const HIGH_Q_OBSERVER_MIN_MODE_COUNT = 2;
const HIGH_Q_OBSERVER_RESPONSE_START = 0.02;
const HIGH_Q_OBSERVER_RESPONSE_FULL = 0.18;
const HIGH_Q_OBSERVER_DRIVE_PEAK_START = 0.00018;
const HIGH_Q_OBSERVER_DRIVE_PEAK_FULL = 0.006;
const HIGH_Q_OBSERVER_SPECTRAL_EXCESS_START = 0.00004;
const HIGH_Q_OBSERVER_SPECTRAL_EXCESS_FULL = 0.012;
const HIGH_Q_OBSERVER_SNR_START = 1.25;
const HIGH_Q_OBSERVER_SNR_FULL = 5;
const HIGH_Q_OBSERVER_PERIODICITY_START = 0.36;
const HIGH_Q_OBSERVER_PERIODICITY_FULL = 0.86;
const HIGH_Q_OBSERVER_TONALNESS_START = 0.52;
const HIGH_Q_OBSERVER_TONALNESS_FULL = 0.9;
const HIGH_Q_OBSERVER_DISTRIBUTION_START = 0.12;
const HIGH_Q_OBSERVER_DISTRIBUTION_FULL = 0.48;
const HIGH_Q_OBSERVER_ENERGY_GAIN = 0.45;
const HIGH_Q_OBSERVER_ATTACK = 0.34;
const HIGH_Q_OBSERVER_DECAY_TAU_SCALE = 32;
const HIGH_Q_OBSERVER_NO_EVIDENCE_TAU_SCALE = 220;
const HIGH_Q_OBSERVER_MIN_OBSERVED_DRIVE = 0.0025;
const HIGH_Q_OBSERVER_NOISE_WINDOW_BINS = 9;
const HIGH_Q_OBSERVER_SOURCE_ENVELOPE_ATTACK = 0.34;
const HIGH_Q_OBSERVER_SOURCE_ENVELOPE_RELEASE = 0.24;
const HIGH_Q_RESONANT_DISPLAY_ENVELOPE_START = 0.006;
const HIGH_Q_RESONANT_DISPLAY_ENVELOPE_FULL = 0.08;
const HIGH_Q_RESONANT_DISPLAY_ENVELOPE_FLOOR = 0.62;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_START = 0.00012;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_PERIODICITY = 0.68;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_TONALNESS = 0.58;
const HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MAX_DISTRIBUTION = 0.18;
const LOW_Q_OBSERVER_MIN_MODE_COUNT = 1;
const LOW_Q_OBSERVER_MIN_RETAINED_ENERGY = 0.0008;
const LOW_Q_OBSERVER_RESPONSE_START = 0.015;
const LOW_Q_OBSERVER_RESPONSE_FULL = 0.13;
const LOW_Q_OBSERVER_DRIVE_PEAK_START = 0.00016;
const LOW_Q_OBSERVER_DRIVE_PEAK_FULL = 0.009;
const LOW_Q_OBSERVER_SPECTRAL_EXCESS_START = 0.00004;
const LOW_Q_OBSERVER_SPECTRAL_EXCESS_FULL = 0.018;
const LOW_Q_OBSERVER_SNR_START = 1.1;
const LOW_Q_OBSERVER_SNR_FULL = 4;
const LOW_Q_OBSERVER_PERIODICITY_START = 0.28;
const LOW_Q_OBSERVER_PERIODICITY_FULL = 0.72;
const LOW_Q_OBSERVER_TONALNESS_START = 0.34;
const LOW_Q_OBSERVER_TONALNESS_FULL = 0.78;
const LOW_Q_OBSERVER_DISTRIBUTION_START = 0.18;
const LOW_Q_OBSERVER_DISTRIBUTION_FULL = 0.58;
const LOW_Q_OBSERVER_ENERGY_GAIN = 0.34;
const LOW_Q_OBSERVER_ATTACK = 0.24;
const LOW_Q_OBSERVER_DECAY_TAU_SCALE = 8;
const LOW_Q_OBSERVER_NO_EVIDENCE_TAU_SCALE = 2.2;
const LOW_Q_OBSERVER_MIN_OBSERVED_DRIVE = 0.002;
const MODAL_OBSERVER_PROFILES = Object.freeze({
  sourceCoupled: {
    layer: "source-coupled",
    minModeCount: LOW_Q_OBSERVER_MIN_MODE_COUNT,
    minRetainedEnergy: LOW_Q_OBSERVER_MIN_RETAINED_ENERGY,
    responseStart: LOW_Q_OBSERVER_RESPONSE_START,
    responseFull: LOW_Q_OBSERVER_RESPONSE_FULL,
    drivePeakStart: LOW_Q_OBSERVER_DRIVE_PEAK_START,
    drivePeakFull: LOW_Q_OBSERVER_DRIVE_PEAK_FULL,
    spectralExcessStart: LOW_Q_OBSERVER_SPECTRAL_EXCESS_START,
    spectralExcessFull: LOW_Q_OBSERVER_SPECTRAL_EXCESS_FULL,
    snrStart: LOW_Q_OBSERVER_SNR_START,
    snrFull: LOW_Q_OBSERVER_SNR_FULL,
    periodicityStart: LOW_Q_OBSERVER_PERIODICITY_START,
    periodicityFull: LOW_Q_OBSERVER_PERIODICITY_FULL,
    tonalnessStart: LOW_Q_OBSERVER_TONALNESS_START,
    tonalnessFull: LOW_Q_OBSERVER_TONALNESS_FULL,
    distributionStart: LOW_Q_OBSERVER_DISTRIBUTION_START,
    distributionFull: LOW_Q_OBSERVER_DISTRIBUTION_FULL,
    energyGain: LOW_Q_OBSERVER_ENERGY_GAIN,
    attack: LOW_Q_OBSERVER_ATTACK,
    decayTauScale: LOW_Q_OBSERVER_DECAY_TAU_SCALE,
    noEvidenceTauScale: LOW_Q_OBSERVER_NO_EVIDENCE_TAU_SCALE,
    minObservedDrive: LOW_Q_OBSERVER_MIN_OBSERVED_DRIVE,
    minRetainedCoherence: 0.32,
    coherenceFloor: 0.24,
    persistenceFloor: 0.48,
    retainedDriveFloor: SOURCE_COUPLED_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY,
    noiseWindowBins: HIGH_Q_OBSERVER_NOISE_WINDOW_BINS,
    sparseEvidenceFloor: 0.08,
    mergeContextMin: 0.02,
  },
  resonant: {
    layer: "resonant",
    minModeCount: HIGH_Q_OBSERVER_MIN_MODE_COUNT,
    minRetainedEnergy: HIGH_Q_RESONANT_MIN_RETAINED_ENERGY,
    responseStart: HIGH_Q_OBSERVER_RESPONSE_START,
    responseFull: HIGH_Q_OBSERVER_RESPONSE_FULL,
    drivePeakStart: HIGH_Q_OBSERVER_DRIVE_PEAK_START,
    drivePeakFull: HIGH_Q_OBSERVER_DRIVE_PEAK_FULL,
    spectralExcessStart: HIGH_Q_OBSERVER_SPECTRAL_EXCESS_START,
    spectralExcessFull: HIGH_Q_OBSERVER_SPECTRAL_EXCESS_FULL,
    snrStart: HIGH_Q_OBSERVER_SNR_START,
    snrFull: HIGH_Q_OBSERVER_SNR_FULL,
    periodicityStart: HIGH_Q_OBSERVER_PERIODICITY_START,
    periodicityFull: HIGH_Q_OBSERVER_PERIODICITY_FULL,
    tonalnessStart: HIGH_Q_OBSERVER_TONALNESS_START,
    tonalnessFull: HIGH_Q_OBSERVER_TONALNESS_FULL,
    distributionStart: HIGH_Q_OBSERVER_DISTRIBUTION_START,
    distributionFull: HIGH_Q_OBSERVER_DISTRIBUTION_FULL,
    energyGain: HIGH_Q_OBSERVER_ENERGY_GAIN,
    attack: HIGH_Q_OBSERVER_ATTACK,
    decayTauScale: HIGH_Q_OBSERVER_DECAY_TAU_SCALE,
    noEvidenceTauScale: HIGH_Q_OBSERVER_NO_EVIDENCE_TAU_SCALE,
    minObservedDrive: HIGH_Q_OBSERVER_MIN_OBSERVED_DRIVE,
    minRetainedCoherence: RESONANT_SUSTAIN_MIN_COHERENCE,
    coherenceFloor: RESONANT_SUSTAIN_MIN_COHERENCE,
    persistenceFloor: 0.78,
    retainedDriveFloor: RESONANT_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY,
    noiseWindowBins: HIGH_Q_OBSERVER_NOISE_WINDOW_BINS,
    sparseEvidenceFloor: 0,
    mergeContextMin: 0.03,
  },
});
const RESONANT_DISPLAY_CONTINUITY_SIGNAL_BASE = 0.05;
const RESONANT_DISPLAY_CONTINUITY_PRESENCE_WEIGHT = 0.26;
const RESONANT_SUBTLE_DISPLAY_CONTINUITY_SIGNAL_BASE = 0.012;
const RESONANT_SUBTLE_DISPLAY_CONTINUITY_PRESENCE_WEIGHT = 0.08;
const RESONANT_MATURITY_SEED = 0.14;
const RESONANT_MATURITY_PRESENCE_GAIN = 4;
const RESONANT_MATURITY_ATTACK = 0.46;
const RESONANT_MATURITY_RELEASE = 0.38;
const RESONANT_MATURITY_SIGNAL_MIN = 0.2;
const RESONANT_MATURITY_SIGNAL_WEIGHT = 0.9;
const RESONANT_COUPLING_MIN_PERIODICITY = 0.42;
const RESONANT_COUPLING_MIN_TONALNESS = 0.68;
const RESONANT_COUPLING_MAX_DISTRIBUTION = 0.12;
const RESONANT_COUPLING_RESONANT_BAND_START = 0.012;
const RESONANT_COUPLING_RESONANT_BAND_END = 0.08;
const RESONANT_COUPLING_HARMONIC_SUPPORT_START = 0.012;
const RESONANT_COUPLING_HARMONIC_SUPPORT_END = 0.08;
const RESONANT_COUPLING_DRIVE = 0.064;
const RESONANT_COUPLING_MIN_HARMONIC = 2;
const RESONANT_COUPLING_MAX_HARMONIC = 64;
const RESONANT_COUPLING_HARMONIC_TOLERANCE = 0.045;
const SOURCE_COUPLED_DISPLAY_SCORE_DRIVE_WEIGHT = 0.42;
const SOURCE_COUPLED_DISPLAY_SCORE_COHERENCE_WEIGHT = 0.33;
const SOURCE_COUPLED_DISPLAY_SCORE_AMPLITUDE_WEIGHT = 0.17;
const SOURCE_COUPLED_DISPLAY_SCORE_FRESHNESS_WEIGHT = 0.08;
const RESONANT_DISPLAY_SCORE_DRIVE_WEIGHT = 0.56;
const RESONANT_DISPLAY_SCORE_COHERENCE_WEIGHT = 0.14;
const RESONANT_DISPLAY_SCORE_AMPLITUDE_WEIGHT = 0.1;
const RESONANT_DISPLAY_SCORE_FRESHNESS_WEIGHT = 0.2;
const SOURCE_COUPLED_DISPLAY_MIN_SIGNAL_AMPLITUDE = 0.08;
const RESONANT_DISPLAY_MIN_SIGNAL_AMPLITUDE = 0.05;
const SOURCE_COUPLED_DISPLAY_DUPLICATE_WINDOW = 0.09;
const RESONANT_DISPLAY_SAME_FREQUENCY_WINDOW = 1e-9;
const EXCITATION_DECAY_DRIVE_THRESHOLD = 0.065;
const EXCITATION_DECAY_SIGNAL_DISPLAY_RATIO = 0.55;
const EXCITATION_HARD_SILENCE_MAX_AVG_AMPLITUDE = 1;
const EXCITATION_HARD_SILENCE_MAX_RMS = 0.004;
const EXCITATION_LINE_FEED_ZERO_SPECTRUM_HARD_SILENCE_MAX_RMS = 0.0065;
const EXCITATION_HARD_SILENCE_MAX_FFT_PEAK = 0.003;
function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function buildModeKey(u, v, w) {
  return `${u}:${v}:${w}`;
}

function getRelativeFrequencyDistance(leftHz, rightHz) {
  const safeLeft = Math.max(leftHz ?? 0, 1e-6);
  const safeRight = Math.max(rightHz ?? 0, 1e-6);
  return Math.abs(safeLeft - safeRight) / Math.max(safeLeft, safeRight);
}

function computeOrder(mode) {
  return (mode?.u ?? 0) + (mode?.v ?? 0) + (mode?.w ?? 0);
}

function buildFrequencyCenters(minHz, maxHz, binsPerOctave) {
  const centers = [];
  const multiplier = Math.pow(2, 1 / Math.max(1, binsPerOctave));
  let frequency = minHz;
  while (frequency <= maxHz) {
    centers.push(frequency);
    frequency *= multiplier;
  }
  if (centers[centers.length - 1] !== maxHz) {
    centers.push(maxHz);
  }
  return centers;
}

function canonicalDriveWeight(mode) {
  const wx = Math.abs(Math.sin(Math.PI * mode.u * CANONICAL_DRIVE_POINT.x));
  const wy = Math.abs(Math.sin(Math.PI * mode.v * CANONICAL_DRIVE_POINT.y));
  const wz = Math.abs(Math.sin(Math.PI * mode.w * CANONICAL_DRIVE_POINT.z));
  return clamp01(0.18 + (wx * wy * wz) / 0.82);
}

function computeDecayTauMs(mode) {
  const order = Math.max(1, computeOrder(mode));
  const tau = 310 / Math.sqrt(order * 0.75);
  return Math.max(
    RESONATOR_MIN_DECAY_MS,
    Math.min(RESONATOR_MAX_DECAY_MS, tau),
  );
}

function isHardSilentFrame(preparedInputs) {
  const lineFeedZeroSpectrum =
    (preparedInputs?.inputMode === "system" ||
      preparedInputs?.resolvedLiveInputAnalysisClass ===
        LIVE_INPUT_ANALYSIS_CLASSES.lineFeed ||
      preparedInputs?.liveInputPolicy === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed) &&
    countNonZeroFftBins(preparedInputs?.fftMagnitudesSource) === 0 &&
    (preparedInputs?.preModalFftPeak ?? 0) <=
      EXCITATION_HARD_SILENCE_MAX_FFT_PEAK;
  const maxRms = lineFeedZeroSpectrum
    ? EXCITATION_LINE_FEED_ZERO_SPECTRUM_HARD_SILENCE_MAX_RMS
    : EXCITATION_HARD_SILENCE_MAX_RMS;

  return (
    (preparedInputs?.avgAmplitude ?? 0) <=
      EXCITATION_HARD_SILENCE_MAX_AVG_AMPLITUDE &&
    (preparedInputs?.analyserRms ?? 0) <= maxRms &&
    (preparedInputs?.preModalFftPeak ?? 0) <=
      EXCITATION_HARD_SILENCE_MAX_FFT_PEAK
  );
}

function isLiteralZeroSourceFrame(preparedInputs) {
  return (
    (preparedInputs?.avgAmplitude ?? 0) <= 0 &&
    (preparedInputs?.analyserRms ?? 0) <= 0 &&
    (preparedInputs?.preModalFftPeak ?? 0) <= 0
  );
}

function hasCurrentRenderSourceEvidence({
  strictHardSilentFrame,
  drivePeak,
  driveSource,
  periodicity,
  tonalness,
  distributedExcitation,
  modalResponseInputEnergy,
}) {
  if (!strictHardSilentFrame) {
    return true;
  }

  if ((modalResponseInputEnergy ?? 0) >= SOURCE_CUT_CURRENT_INPUT_FLOOR) {
    return true;
  }

  if (
    driveSource === "time-domain" &&
    drivePeak >= HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_START &&
    periodicity >= HIGH_Q_OBSERVER_PERIODICITY_START
  ) {
    return true;
  }

  return (
    drivePeak >= HIGH_Q_OBSERVER_COHERENT_BACKGROUND_DRIVE_START &&
    periodicity >= HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_PERIODICITY &&
    tonalness >= HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MIN_TONALNESS &&
    distributedExcitation <=
      HIGH_Q_OBSERVER_COHERENT_BACKGROUND_MAX_DISTRIBUTION
  );
}

function updateRenderAuthorityCutState({
  state,
  literalZeroSourceFrame,
  strictHardSilentFrame,
  currentRenderSourceEvidence,
  deltaMs,
}) {
  if (literalZeroSourceFrame) {
    state.renderAuthorityCutSilenceMs = SOURCE_CUT_RELEASE_HOLD_MS;
    return true;
  }

  if (strictHardSilentFrame && !currentRenderSourceEvidence) {
    state.renderAuthorityCutSilenceMs = Math.min(
      SOURCE_CUT_RELEASE_HOLD_MS,
      (state.renderAuthorityCutSilenceMs ?? 0) + Math.max(0, deltaMs),
    );
  } else {
    state.renderAuthorityCutSilenceMs = 0;
  }

  return state.renderAuthorityCutSilenceMs >= SOURCE_CUT_RELEASE_HOLD_MS;
}

function classifyModeLayer(naturalFrequencyHz, mode) {
  if (naturalFrequencyHz <= SOURCE_COUPLED_MAX_HZ && computeOrder(mode) <= 24) {
    return "source-coupled";
  }

  return "resonant";
}

function getModeRenderLayer(entry) {
  return entry?.renderLayer ?? entry?.layer ?? "resonant";
}

function buildPreviousModalResponseEnergies(
  state,
  { resetSourceCoupled = false, resetResonant = false } = {},
) {
  const energies = new Map();

  const mergeEntry = (entry) => {
    const layer = entry?.layer ?? getModeRenderLayer(entry);
    if (
      (layer === "source-coupled" && resetSourceCoupled) ||
      (layer === "resonant" && resetResonant)
    ) {
      return;
    }
    const modeKey =
      entry?.modeKey ?? buildModeKey(entry?.u, entry?.v, entry?.w);
    if (!modeKey) {
      return;
    }
    const energy = clamp01(
      entry?.modalResponseEnergy ??
        entry?.retainedEnergy ??
        entry?.amplitude ??
        0,
    );
    if (energy <= 0) {
      return;
    }
    const previous = energies.get(modeKey);
    if ((previous?.modalResponseEnergy ?? 0) > energy) {
      return;
    }
    energies.set(modeKey, {
      modalResponseEnergy: energy,
      oscillatorPhaseRad:
        entry?.oscillatorPhaseRad ??
        entry?.modalOscillatorPhaseRad ??
        entry?.phase,
      modalOscillatorPhaseRad:
        entry?.modalOscillatorPhaseRad ??
        entry?.oscillatorPhaseRad ??
        entry?.phase,
      amplitude: energy,
    });
  };

  for (const entry of state?.activeModes?.values?.() ?? []) {
    mergeEntry(entry);
  }
  for (const entry of state?.observedModes?.values?.() ?? []) {
    mergeEntry(entry);
  }

  return energies;
}

function mapModalResponseEntries(modalResponse) {
  return new Map(
    (modalResponse?.entries ?? []).map((entry) => [entry.modeKey, entry]),
  );
}

function buildModeAtlas({
  radius,
  cavityGeometry = "rectangular",
  cavityAcousticScale = null,
  boundaryMode = null,
}) {
  const safeRadius = Math.max(0.1, Math.round(radius * 1000) / 1000);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const acousticRadius = Number.isFinite(cavityAcousticScale?.radiusMeters)
    ? Math.round(cavityAcousticScale.radiusMeters * 1000) / 1000
    : safeRadius;
  const acousticSoundSpeed = Number.isFinite(
    cavityAcousticScale?.soundSpeedMetersPerSecond,
  )
    ? Math.round(cavityAcousticScale.soundSpeedMetersPerSecond * 1000) / 1000
    : 1480;
  const acousticSubfloorPolicy =
    cavityAcousticScale?.subfloorPolicy ?? "project-subfundamental";
  const cacheKey = [
    geometryBackend.cavityGeometry,
    boundaryMode ?? "legacy",
    acousticRadius.toFixed(3),
    acousticSoundSpeed.toFixed(3),
    acousticSubfloorPolicy,
  ].join(":");
  if (MODE_ATLAS_CACHE.has(cacheKey)) {
    return MODE_ATLAS_CACHE.get(cacheKey);
  }
  const atlas = geometryBackend.buildAtlas({
    radius: safeRadius,
    acousticScale: cavityAcousticScale,
    boundaryMode,
    frequencyCenters: [
      ...buildFrequencyCenters(
        SOURCE_COUPLED_MIN_HZ,
        SOURCE_COUPLED_MAX_HZ,
        SOURCE_COUPLED_BINS_PER_OCTAVE,
      ).map((centerHz) => ({
        centerHz,
        familyWidth: SOURCE_COUPLED_FAMILY_WIDTH,
      })),
      ...buildFrequencyCenters(
        RESONANT_MIN_HZ,
        RESONANT_MAX_HZ,
        RESONANT_BINS_PER_OCTAVE,
      ).map((centerHz) => ({
        centerHz,
        familyWidth: RESONANT_FAMILY_WIDTH,
      })),
    ],
    buildModeKey,
    createAtlasEntry({ candidate, modeKey, naturalFrequencyHz }) {
      const decayTauMs = computeDecayTauMs(candidate);
      const atlasEntry = {
        modeKey,
        familyId: `family:${modeKey}`,
        u: candidate.u,
        v: candidate.v,
        w: candidate.w,
        naturalFrequencyHz,
        order: computeOrder(candidate),
        driveWeight: canonicalDriveWeight(candidate),
        decayTauMs,
        qualityFactor: Math.max(
          0.5,
          (decayTauMs / 1000) * Math.PI * 2 * naturalFrequencyHz,
        ),
      };
      atlasEntry.layer = classifyModeLayer(naturalFrequencyHz, atlasEntry);
      atlasEntry.renderLayer = atlasEntry.layer;
      return atlasEntry;
    },
  });
  MODE_ATLAS_CACHE.set(cacheKey, atlas);
  if (MODE_ATLAS_CACHE.size > MODE_ATLAS_CACHE_MAX_SIZE) {
    const oldestKey = MODE_ATLAS_CACHE.keys().next().value;
    MODE_ATLAS_CACHE.delete(oldestKey);
  }
  return atlas;
}

function buildDriveBufferFromTimeData(timeData) {
  if (!(timeData instanceof Float32Array) || timeData.length === 0) {
    return null;
  }

  const length = Math.min(SYNTH_BUFFER_SIZE, timeData.length);
  const buffer = new Float32Array(length);
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = timeData[index] ?? 0;
    buffer[index] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak <= 1e-6) {
    return null;
  }
  for (let index = 0; index < length; index += 1) {
    buffer[index] /= peak;
  }
  return { buffer, peak };
}

function buildDriveBufferFromSpectrum(fftMagnitudes, sampleRate) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return new Float32Array(SYNTH_BUFFER_SIZE);
  }

  const peaks = [];
  const nyquist = sampleRate * 0.5;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = fftMagnitudes[index] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    const frequency = (index / Math.max(1, fftMagnitudes.length)) * nyquist;
    peaks.push({ frequency, amplitude });
  }
  peaks.sort((left, right) => right.amplitude - left.amplitude);
  const selected = peaks.slice(0, MAX_SYNTH_PARTIALS);
  const buffer = new Float32Array(SYNTH_BUFFER_SIZE);
  const amplitudeNorm = selected[0]?.amplitude ?? 1;

  for (let index = 0; index < buffer.length; index += 1) {
    const t = index / sampleRate;
    let sample = 0;
    for (let peakIndex = 0; peakIndex < selected.length; peakIndex += 1) {
      const peak = selected[peakIndex];
      const partialAmplitude = peak.amplitude / Math.max(amplitudeNorm, 1e-6);
      const phaseOffset = peakIndex * 0.41;
      sample +=
        Math.sin(2 * Math.PI * peak.frequency * t + phaseOffset) *
        partialAmplitude;
    }
    buffer[index] = selected.length > 0 ? sample / selected.length : 0;
  }

  return buffer;
}

function computeDriveBuffer(preparedInputs, fastSignalState) {
  const timeDomainResult = buildDriveBufferFromTimeData(
    preparedInputs.snapshot?.timeData,
  );
  if (timeDomainResult) {
    return {
      buffer: timeDomainResult.buffer,
      peak: timeDomainResult.peak,
      driveSource: "time-domain",
    };
  }

  return {
    buffer: buildDriveBufferFromSpectrum(
      fastSignalState.fftMagnitudes,
      preparedInputs.sampleRate,
    ),
    peak: 1,
    driveSource: "spectral-fallback",
  };
}

function computeSpectralFlatness(fftMagnitudes) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return 1;
  }

  let logSum = 0;
  let linearSum = 0;
  let count = 0;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = Math.max(1e-6, fftMagnitudes[index] ?? 0);
    logSum += Math.log(amplitude);
    linearSum += amplitude;
    count += 1;
  }
  if (count === 0 || linearSum <= 0) {
    return 1;
  }

  return clamp01(Math.exp(logSum / count) / (linearSum / count));
}

function estimateDominantSpectralFrequency(fftMagnitudes, sampleRate) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return 0;
  }

  let dominantAmplitude = 0;
  let dominantIndex = 0;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = fftMagnitudes[index] ?? 0;
    if (amplitude > dominantAmplitude) {
      dominantAmplitude = amplitude;
      dominantIndex = index;
    }
  }

  if (dominantAmplitude <= 0 || dominantIndex <= 0) {
    return 0;
  }

  const significantAmplitude = Math.max(
    RESONANT_COUPLING_HARMONIC_SUPPORT_START,
    dominantAmplitude * 0.35,
  );
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    if ((fftMagnitudes[index] ?? 0) >= significantAmplitude) {
      return (index / Math.max(1, fftMagnitudes.length)) * sampleRate * 0.5;
    }
  }

  return (dominantIndex / Math.max(1, fftMagnitudes.length)) * sampleRate * 0.5;
}

function computeSpectralPeakInRange(fftMagnitudes, sampleRate, minHz, maxHz) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return 0;
  }

  const nyquist = sampleRate * 0.5;
  const startIndex = Math.max(
    1,
    Math.floor((Math.max(0, minHz) / nyquist) * fftMagnitudes.length),
  );
  const endIndex = Math.min(
    fftMagnitudes.length - 1,
    Math.ceil((Math.max(minHz, maxHz) / nyquist) * fftMagnitudes.length),
  );
  let peak = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    peak = Math.max(peak, fftMagnitudes[index] ?? 0);
  }

  return clamp01(peak);
}

function sampleSpectralAmplitude(fftMagnitudes, sampleRate, frequencyHz) {
  if (
    !(fftMagnitudes instanceof Float32Array) ||
    fftMagnitudes.length === 0 ||
    frequencyHz <= 0
  ) {
    return 0;
  }

  const nyquist = sampleRate * 0.5;
  const centerBin = Math.max(
    1,
    Math.min(
      fftMagnitudes.length - 1,
      Math.round((frequencyHz / nyquist) * fftMagnitudes.length),
    ),
  );
  const binWindow = Math.max(
    1,
    Math.ceil(
      ((frequencyHz * RESONANT_COUPLING_HARMONIC_TOLERANCE) / nyquist) *
        fftMagnitudes.length,
    ),
  );
  const startBin = Math.max(1, centerBin - binWindow);
  const endBin = Math.min(fftMagnitudes.length - 1, centerBin + binWindow);
  let peak = 0;
  for (let index = startBin; index <= endBin; index += 1) {
    peak = Math.max(peak, fftMagnitudes[index] ?? 0);
  }

  return clamp01(peak);
}

function computeResonantBandHarmonicSupport({
  fftMagnitudes,
  sampleRate,
  dominantFrequencyHz,
}) {
  if (dominantFrequencyHz <= 0) {
    return 0;
  }

  let support = 0;
  let harmonicCount = 0;
  let supportedHarmonics = 0;
  let supportedLowHarmonics = 0;
  const maxHarmonic = Math.min(
    RESONANT_COUPLING_MAX_HARMONIC,
    Math.floor(RESONANT_MAX_HZ / dominantFrequencyHz),
  );
  for (
    let harmonic = RESONANT_COUPLING_MIN_HARMONIC;
    harmonic <= maxHarmonic;
    harmonic += 1
  ) {
    const frequencyHz = dominantFrequencyHz * harmonic;
    if (frequencyHz < RESONANT_MIN_HZ) {
      continue;
    }
    harmonicCount += 1;
    const amplitude = sampleSpectralAmplitude(
      fftMagnitudes,
      sampleRate,
      frequencyHz,
    );
    support = Math.max(support, amplitude);
    if (amplitude >= RESONANT_COUPLING_HARMONIC_SUPPORT_START) {
      supportedHarmonics += 1;
      if (harmonic <= 5) {
        supportedLowHarmonics += 1;
      }
    }
  }

  if (supportedLowHarmonics < 2) {
    return 0;
  }

  return harmonicCount > 0
    ? clamp01(support * smoothstep(1, 3, supportedHarmonics))
    : 0;
}

function computeDrivePeriodicity(buffer, sampleRate) {
  if (!(buffer instanceof Float32Array) || buffer.length < 32) {
    return 0;
  }

  const minLag = Math.max(2, Math.floor(sampleRate / 1200));
  const maxLag = Math.min(buffer.length - 2, Math.floor(sampleRate / 60));
  if (maxLag <= minLag) {
    return 0;
  }

  const prefixSumSq = new Float64Array(buffer.length + 1);
  for (let index = 0; index < buffer.length; index += 1) {
    prefixSumSq[index + 1] = prefixSumSq[index] + buffer[index] * buffer[index];
  }
  const totalEnergy = prefixSumSq[buffer.length];
  if (totalEnergy <= 1e-6) {
    return 0;
  }

  let best = 0;
  let bestLag = minLag;
  const lagStep = maxLag - minLag > 192 ? 3 : 1;
  const scanLag = (lag) => {
    let correlation = 0;
    const overlapLength = buffer.length - lag;
    for (let index = 0; index < overlapLength; index += 1) {
      correlation += buffer[index] * buffer[index + lag];
    }
    const overlapEnergy = prefixSumSq[overlapLength];
    if (overlapEnergy > 1e-6) {
      const score = correlation / overlapEnergy;
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
  };

  for (let lag = minLag; lag <= maxLag; lag += lagStep) {
    scanLag(lag);
  }

  if (lagStep > 1) {
    const refineStart = Math.max(minLag, bestLag - lagStep + 1);
    const refineEnd = Math.min(maxLag, bestLag + lagStep - 1);
    for (let lag = refineStart; lag <= refineEnd; lag += 1) {
      scanLag(lag);
    }
  }

  return clamp01(best);
}

function getModeResponseBasis(sampleRate, length, frequencyHz) {
  const key = `${sampleRate}:${length}:${frequencyHz.toFixed(3)}`;
  const cached = MODE_RESPONSE_BASIS_CACHE.get(key);
  if (cached) {
    return cached;
  }

  const cos = new Float32Array(length);
  const sin = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const theta = (2 * Math.PI * frequencyHz * index) / sampleRate;
    cos[index] = Math.cos(theta);
    sin[index] = Math.sin(theta);
  }

  const basis = { cos, sin };
  MODE_RESPONSE_BASIS_CACHE.set(key, basis);
  if (MODE_RESPONSE_BASIS_CACHE.size > MODE_RESPONSE_BASIS_CACHE_MAX_SIZE) {
    const oldestKey = MODE_RESPONSE_BASIS_CACHE.keys().next().value;
    MODE_RESPONSE_BASIS_CACHE.delete(oldestKey);
  }
  return basis;
}

function computeModeResponse(buffer, sampleRate, frequencyHz) {
  if (
    !(buffer instanceof Float32Array) ||
    buffer.length === 0 ||
    frequencyHz <= 0
  ) {
    return { magnitude: 0, phase: 0 };
  }

  const basis = getModeResponseBasis(sampleRate, buffer.length, frequencyHz);
  let real = 0;
  let imag = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = buffer[index] ?? 0;
    real += sample * basis.cos[index];
    imag -= sample * basis.sin[index];
  }

  const magnitude = Math.hypot(real, imag) / Math.max(1, buffer.length);
  return {
    magnitude: clamp01(magnitude * 2.6),
    phase: Math.atan2(imag, real),
  };
}

function clearLayerBuffers(layerBuffer) {
  layerBuffer.slots.fill(0);
  layerBuffer.referenceSlots.fill(0);
  layerBuffer.colorSlots.fill(0);
  layerBuffer.phaseSlots?.fill(0);
}

function sumSlotAmplitudes(slots) {
  if (!(slots instanceof Float32Array) || slots.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 3; index < slots.length; index += 4) {
    total += slots[index] ?? 0;
  }

  return total;
}

function deriveModalResponseRenderEnergy({
  candidateForcingSlots,
  candidateResponseSlots,
  sourceCut,
}) {
  const rawSourceCoupledEnergy = clamp01(sumSlotAmplitudes(candidateForcingSlots));
  const rawResonantEnergy = clamp01(sumSlotAmplitudes(candidateResponseSlots));
  const rawEnergy = clamp01(rawSourceCoupledEnergy + rawResonantEnergy);
  const sourceCutSuppressed = sourceCut === true;

  return {
    modalResponseRenderEnergy: sourceCutSuppressed ? 0 : rawEnergy,
    modalResponseRenderSourceCoupledEnergy: sourceCutSuppressed
      ? 0
      : rawSourceCoupledEnergy,
    modalResponseRenderResonantEnergy: sourceCutSuppressed ? 0 : rawResonantEnergy,
    modalResponseRenderRawEnergy: rawEnergy,
    modalResponseRenderSourceCutSuppressed: sourceCutSuppressed,
  };
}

function isWeakResidualDisplayTail({
  modalDriveEnergy,
  signalAmplitudeTotal,
  displayAmplitudeTotal,
}) {
  return (
    modalDriveEnergy <= EXCITATION_DECAY_DRIVE_THRESHOLD &&
    signalAmplitudeTotal > 0 &&
    signalAmplitudeTotal <=
      displayAmplitudeTotal * EXCITATION_DECAY_SIGNAL_DISPLAY_RATIO
  );
}

function remapReferenceToBlendedOrder(
  blendedSlots,
  rawReferenceSlots,
  capacity,
  output,
) {
  output.fill(0);

  const blendedLimit = Math.min(
    capacity,
    Math.floor((blendedSlots?.length ?? 0) / 4),
  );
  const rawLimit = Math.min(
    capacity,
    Math.floor((rawReferenceSlots?.length ?? 0) / 4),
  );

  for (let index = 0; index < blendedLimit; index += 1) {
    const offset = index * 4;
    const blendedAmplitude = blendedSlots[offset + 3] ?? 0;
    if (blendedAmplitude <= 0) {
      continue;
    }

    const u = blendedSlots[offset];
    const v = blendedSlots[offset + 1];
    const w = blendedSlots[offset + 2];
    output[offset] = u;
    output[offset + 1] = v;
    output[offset + 2] = w;

    for (
      let referenceIndex = 0;
      referenceIndex < rawLimit;
      referenceIndex += 1
    ) {
      const referenceOffset = referenceIndex * 4;
      const referenceAmplitude = rawReferenceSlots[referenceOffset + 3] ?? 0;
      if (
        referenceAmplitude > 0 &&
        rawReferenceSlots[referenceOffset] === u &&
        rawReferenceSlots[referenceOffset + 1] === v &&
        rawReferenceSlots[referenceOffset + 2] === w
      ) {
        output[offset + 3] = referenceAmplitude;
        break;
      }
    }
  }
}

function resolveEntrySpectralLightFrequency(entry, colorContext = {}) {
  const auditToneFrequencyHz = colorContext.auditToneFrequencyHz ?? 0;
  return Number.isFinite(auditToneFrequencyHz) && auditToneFrequencyHz > 0
    ? auditToneFrequencyHz
    : entry.naturalFrequencyHz;
}

function createEntrySpectralLightComponent(entry, colorContext = {}) {
  const colorFrequencyHz = resolveEntrySpectralLightFrequency(
    entry,
    colorContext,
  );
  const strength = clamp01(
    (entry.signalAmplitude ?? entry.amplitude ?? 0) * 0.58 +
      (entry.currentDriveEnergy ?? entry.driveEnergy ?? 0) * 0.28 +
      (entry.amplitude ?? 0) * 0.14,
  );
  const harmonicConfidence = clamp01(
    (entry.coherence ?? 0) * 0.66 +
      (colorContext.tonalness ?? 0) * 0.22 +
      (entry.persistence ?? 0) * 0.12,
  );
  const accentEnergy = clamp01(
    (colorContext.transientEnergy ?? 0) * 0.62 +
      (colorContext.trebleBroadbandEnergy ?? 0) * 0.24 +
      (entry.currentDriveEnergy ?? entry.driveEnergy ?? 0) * 0.14,
  );
  const spectralLight = createSpectralLightColor({
    frequency: colorFrequencyHz,
    strength,
    harmonicConfidence,
    accentEnergy,
  });

  return {
    frequency: entry.naturalFrequencyHz,
    familyFrequency: colorFrequencyHz,
    colorFrequency: colorFrequencyHz,
    weight: spectralLight.weight,
    phase: spectralLight.phase,
    wavelengthNm: spectralLight.wavelengthNm,
    color: spectralLight.rgb,
    harmonicConfidence: spectralLight.harmonicConfidence,
    accentEnergy: spectralLight.accentEnergy,
  };
}

function clearBlendColorState(layerState) {
  layerState.colorSlots?.fill(0);
  layerState.referenceColorSlots?.fill(0);
  layerState._poolCurrentColorMap?.clear();
  layerState._poolTargetColorMap?.clear();
}

function writeLayerEntry(
  layerBuffer,
  index,
  entry,
  referenceAmplitude,
  colorContext,
) {
  const offset = index * 4;
  layerBuffer.slots[offset] = entry.u;
  layerBuffer.slots[offset + 1] = entry.v;
  layerBuffer.slots[offset + 2] = entry.w;
  layerBuffer.slots[offset + 3] = referenceAmplitude;
  layerBuffer.referenceSlots[offset] = entry.u;
  layerBuffer.referenceSlots[offset + 1] = entry.v;
  layerBuffer.referenceSlots[offset + 2] = entry.w;
  layerBuffer.referenceSlots[offset + 3] = referenceAmplitude;
  const spectralLight = createEntrySpectralLightComponent(entry, colorContext);
  layerBuffer.colorSlots[offset] = spectralLight.color.r;
  layerBuffer.colorSlots[offset + 1] = spectralLight.color.g;
  layerBuffer.colorSlots[offset + 2] = spectralLight.color.b;
  layerBuffer.colorSlots[offset + 3] = spectralLight.weight;
}

function writeShortlistedEntries(
  layerBuffer,
  entries,
  capacity,
  selectReference,
  colorContext,
) {
  // The shortlist is already term-based: one shortlisted entry writes one slot,
  // and capacity is enforced in slot units rather than family units.
  const slotLimit = Math.min(
    capacity,
    entries.length,
    Math.floor((layerBuffer?.slots?.length ?? 0) / 4),
  );
  for (let index = 0; index < slotLimit; index += 1) {
    const entry = entries[index];
    writeLayerEntry(
      layerBuffer,
      index,
      entry,
      selectReference(entry),
      colorContext,
    );
  }
  return slotLimit;
}

function buildHarmonicSupport(entries, dominantFrequencyHz) {
  const support = new Float32Array(6);
  if (!dominantFrequencyHz || entries.length === 0) {
    return support;
  }

  for (let harmonic = 1; harmonic <= support.length; harmonic += 1) {
    const targetFrequency = dominantFrequencyHz * harmonic;
    let best = 0;
    for (const entry of entries) {
      const relativeError =
        Math.abs(entry.naturalFrequencyHz - targetFrequency) /
        Math.max(targetFrequency, 1);
      const match =
        clamp01(1 - relativeError * 10) * entry.amplitude * entry.coherence;
      best = Math.max(best, match);
    }
    support[harmonic - 1] = clamp01(best);
  }

  return support;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function getFreshness(entry) {
  return 1 - (entry?.persistence ?? 0);
}

function getSustainedResonantPresence(entry) {
  const coherence = clamp01(entry?.coherence ?? 0);
  const persistence = clamp01(entry?.persistence ?? 0);
  const amplitude = clamp01(entry?.amplitude ?? 0);
  const driveEnergy = clamp01(
    entry?.currentDriveEnergy ?? entry?.driveEnergy ?? 0,
  );

  const coherent = clamp01(
    (coherence - RESONANT_SUSTAIN_MIN_COHERENCE) /
      Math.max(1 - RESONANT_SUSTAIN_MIN_COHERENCE, 1e-6),
  );
  const persistent = clamp01(
    (persistence - RESONANT_SUSTAIN_MIN_PERSISTENCE) /
      Math.max(1 - RESONANT_SUSTAIN_MIN_PERSISTENCE, 1e-6),
  );
  const modalAmplitude = clamp01(
    amplitude / RESONANT_SUSTAIN_REFERENCE_AMPLITUDE,
  );
  const driven = clamp01(driveEnergy / RESONANT_SUSTAIN_REFERENCE_DRIVE_ENERGY);

  return coherent * persistent * modalAmplitude * driven;
}

function shouldApplyResonantDisplayContinuity({
  atlasEntry,
  previous,
  driveEnergy,
  hardSilentFrame,
  resonantDisplayContinuityPresence,
  resonantObserverContinuitySignal,
}) {
  if (hardSilentFrame || atlasEntry?.layer !== "resonant" || !previous) {
    return false;
  }
  if (
    driveEnergy < RESONANT_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY &&
    resonantObserverContinuitySignal <= 0
  ) {
    return false;
  }

  return (
    getSustainedResonantPresence(previous) >=
      RESONANT_DISPLAY_CONTINUITY_MIN_PRESENCE ||
    (resonantDisplayContinuityPresence ?? 0) >=
      RESONANT_DISPLAY_CONTINUITY_MIN_PRESENCE ||
    (resonantObserverContinuitySignal > 0 &&
      ((previous.resonantMaturity ?? 0) >=
        RESONANT_SUBTLE_DISPLAY_CONTINUITY_MIN_MATURITY ||
        (previous.amplitude ?? 0) >=
          MIN_DISPLAY_CONTINUITY_RESONATOR_AMPLITUDE))
  );
}

function shouldApplySourceCoupledDisplayContinuity({
  atlasEntry,
  previous,
  driveEnergy,
  hardSilentFrame,
}) {
  if (hardSilentFrame || atlasEntry?.layer !== "source-coupled" || !previous) {
    return false;
  }
  if ((previous?.observedModal ?? false) !== true) {
    return false;
  }

  const profile = getModalObserverProfile("source-coupled");
  const retainedEnergy = getObservedModeRetainedEnergy(previous);
  return (
    retainedEnergy >= profile.minRetainedEnergy &&
    (previous?.coherence ?? 0) >= profile.minRetainedCoherence &&
    (driveEnergy >= SOURCE_COUPLED_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY ||
      hasObservedModalDrive(previous, profile))
  );
}

function getModalObserverProfile(layer) {
  return MODAL_OBSERVER_PROFILES[layer] ?? MODAL_OBSERVER_PROFILES.resonant;
}

function getObservedModeRetainedEnergy(entry) {
  return entry?.retainedEnergy ?? entry?.amplitude ?? 0;
}

function hasObservedModalDrive(entry, profile) {
  return (entry?.observedDrive ?? 0) >= profile.minObservedDrive;
}

function hasObservedLayerDrive(metrics, layer) {
  const profile = getModalObserverProfile(layer);
  return layer === "source-coupled"
    ? metrics.lowQObservedDrive >= profile.minObservedDrive
    : metrics.highQObservedDrive >= profile.minObservedDrive;
}

function updateObservedSourceAmplitude(previous, drivePeak) {
  const target = clamp01(drivePeak);
  const previousAmplitude = Number.isFinite(previous?.sourceAmplitude)
    ? clamp01(previous.sourceAmplitude)
    : target;
  const rate =
    target >= previousAmplitude
      ? HIGH_Q_OBSERVER_SOURCE_ENVELOPE_ATTACK
      : HIGH_Q_OBSERVER_SOURCE_ENVELOPE_RELEASE;
  return clamp01(previousAmplitude + (target - previousAmplitude) * rate);
}

function isObservedModeAged(entry, currentFrameAtMs) {
  return (
    !!entry && (entry.firstObservedAtMs ?? currentFrameAtMs) < currentFrameAtMs
  );
}

function deriveObservedModePhaseState({
  atlasEntry,
  previous,
  response,
  observedDrive,
  retainedEnergy,
  observedSnr,
  observerCoherence,
  currentFrameAtMs,
  hardSilentFrame = false,
}) {
  const profile = getModalObserverProfile(atlasEntry?.layer);
  const layer = atlasEntry?.layer ?? "resonant";
  const phase = normalizePhaseRad(response?.phase ?? previous?.phase ?? 0);
  const previousPhase = Number.isFinite(previous?.phase)
    ? previous.phase
    : phase;
  const previousVelocity = Number.isFinite(previous?.phaseVelocityRadPerSec)
    ? previous.phaseVelocityRadPerSec
    : 0;
  const previousPhaseAtMs = Number.isFinite(previous?.lastPhaseObservedAtMs)
    ? previous.lastPhaseObservedAtMs
    : currentFrameAtMs;
  const deltaSeconds = Math.max(
    0,
    (currentFrameAtMs - previousPhaseAtMs) / 1000,
  );
  const velocityLimit = getPhaseVelocityLimit(layer);
  const rawVelocity =
    deltaSeconds > 0
      ? unwrapPhaseDeltaRad(previousPhase, phase) / deltaSeconds
      : previousVelocity;
  const boundedVelocity = Math.max(
    -velocityLimit,
    Math.min(velocityLimit, rawVelocity),
  );
  const energyGate = smoothstep(
    profile.minRetainedEnergy,
    profile.minRetainedEnergy * (layer === "resonant" ? 10 : 6),
    retainedEnergy,
  );
  const driveGate = smoothstep(
    profile.minObservedDrive * 0.45,
    profile.minObservedDrive * (layer === "resonant" ? 4 : 3),
    observedDrive,
  );
  const snrGate = smoothstep(profile.snrStart, profile.snrFull, observedSnr);
  const coherenceGate = smoothstep(
    profile.minRetainedCoherence * 0.55,
    profile.minRetainedCoherence,
    observerCoherence,
  );
  const phaseCoherenceTarget = clamp01(
    Math.max(snrGate, driveGate * 0.85) * coherenceGate,
  );
  const authorityTarget = clamp01(
    energyGate * driveGate * phaseCoherenceTarget,
  );
  const previousAuthority = clamp01(previous?.phaseAuthority ?? 0);
  if (hardSilentFrame) {
    return {
      phase,
      phaseOffsetRad: previous?.phaseOffsetRad ?? phase,
      phaseVelocityRadPerSec: previousVelocity * PHASE_VELOCITY_RELEASE,
      phaseCoherence: 0,
      phaseAuthority: 0,
      lastPhaseObservedAtMs: previousPhaseAtMs,
    };
  }
  const phaseAuthority =
    authorityTarget >= previousAuthority
      ? previousAuthority +
        (authorityTarget - previousAuthority) * getPhaseAttack(layer)
      : previousAuthority * getPhaseRelease(layer);
  const previousPhaseCoherence = clamp01(previous?.phaseCoherence ?? 0);
  const phaseCoherence =
    phaseCoherenceTarget >= previousPhaseCoherence
      ? previousPhaseCoherence +
        (phaseCoherenceTarget - previousPhaseCoherence) * 0.24
      : previousPhaseCoherence * 0.92;
  const phaseVelocityRadPerSec =
    phaseAuthority > PHASE_AUTHORITY_MIN
      ? previousVelocity +
        (boundedVelocity - previousVelocity) * PHASE_VELOCITY_BLEND
      : previousVelocity * PHASE_VELOCITY_RELEASE;
  const phaseOffsetRad = normalizePhaseRad(
    phase - phaseVelocityRadPerSec * (currentFrameAtMs / 1000),
  );

  return {
    phase,
    phaseOffsetRad,
    phaseVelocityRadPerSec,
    phaseCoherence,
    phaseAuthority: phaseAuthority > PHASE_AUTHORITY_MIN ? phaseAuthority : 0,
    lastPhaseObservedAtMs:
      authorityTarget > 0 ? currentFrameAtMs : previousPhaseAtMs,
  };
}

function createObservedModalModeEntry({
  atlasEntry,
  previous,
  response,
  observedDrive,
  observedEnergy,
  retainedEnergy,
  localNoiseFloor,
  observedSnr,
  observerCoherence,
  currentFrameAtMs,
  drivePeak,
  dominantDriveFrequencyHz,
  dominantDriveSpectralSupport,
  allowBassHarmonicDriver,
  hardSilentFrame = false,
}) {
  const profile = getModalObserverProfile(atlasEntry?.layer);
  const existingCoherence = previous?.coherence ?? observerCoherence;
  const coherence =
    observedDrive > 0
      ? clamp01(existingCoherence * 0.72 + observerCoherence * 0.28)
      : clamp01(existingCoherence * 0.96);
  const driveEnergy =
    observedDrive > 0
      ? clamp01((previous?.driveEnergy ?? 0) * 0.82 + observedDrive * 0.18)
      : clamp01((previous?.driveEnergy ?? 0) * 0.96);
  const firstObservedAtMs = previous?.firstObservedAtMs ?? currentFrameAtMs;
  const lastObservedAtMs = hasObservedModalDrive({ observedDrive }, profile)
    ? currentFrameAtMs
    : (previous?.lastObservedAtMs ?? firstObservedAtMs);
  const energy = clamp01(retainedEnergy);
  const renderLayer = classifyObservedModeRenderLayer({
    atlasEntry,
    observedSnr,
    observerCoherence,
    retainedEnergy: energy,
    observedDrive,
    dominantDriveFrequencyHz,
    dominantDriveSpectralSupport,
    allowBassHarmonicDriver,
    highQResonantMinRetainedEnergy: HIGH_Q_RESONANT_MIN_RETAINED_ENERGY,
    lowQObserverSnrStart: LOW_Q_OBSERVER_SNR_START,
    lowQObserverMinObservedDrive: LOW_Q_OBSERVER_MIN_OBSERVED_DRIVE,
  });
  const isResonant = renderLayer === "resonant";
  const phaseState = deriveObservedModePhaseState({
    atlasEntry,
    previous,
    response,
    observedDrive,
    retainedEnergy: energy,
    observedSnr,
    observerCoherence,
    currentFrameAtMs,
    hardSilentFrame,
  });

  return {
    ...atlasEntry,
    renderLayer,
    amplitude: energy,
    signalAmplitude: energy,
    currentDriveEnergy: observedDrive,
    driveEnergy: Math.max(driveEnergy, profile.retainedDriveFloor),
    phase: phaseState.phase,
    phaseOffsetRad: phaseState.phaseOffsetRad,
    phaseVelocityRadPerSec: phaseState.phaseVelocityRadPerSec,
    phaseCoherence: phaseState.phaseCoherence,
    phaseAuthority: phaseState.phaseAuthority,
    lastPhaseObservedAtMs: phaseState.lastPhaseObservedAtMs,
    coherence: Math.max(coherence, profile.coherenceFloor),
    persistence: Math.max(previous?.persistence ?? 0, profile.persistenceFloor),
    resonantMaturity: isResonant
      ? Math.max(previous?.resonantMaturity ?? 0, HIGH_Q_RESONANT_MIN_MATURITY)
      : 1,
    retainedEnergy: energy,
    observedDrive,
    observedEnergy,
    observedSnr,
    localNoiseFloor,
    sourceAmplitude: updateObservedSourceAmplitude(previous, drivePeak),
    firstObservedAtMs,
    lastObservedAtMs,
    resonantDisplayContinuity: isResonant,
    subtleResonantDisplayContinuity: isResonant,
    resonantDisplayContinuityPresence: isResonant
      ? Math.max(previous?.resonantDisplayContinuityPresence ?? 0, energy)
      : 0,
    sourceCoupledDisplayContinuity: !isResonant,
    sourceCoupledDisplayContinuityPresence: !isResonant
      ? Math.max(previous?.sourceCoupledDisplayContinuityPresence ?? 0, energy)
      : 0,
    observedModal: true,
  };
}

function summarizeObservedLayerModes(modes, layer) {
  const profile = getModalObserverProfile(layer);
  let count = 0;
  let energy = 0;
  let observedDrive = 0;
  let observedSnr = 0;
  let coherence = 0;
  let noiseFloor = 0;
  let phaseAuthority = 0;
  let phaseCoherence = 0;
  let phaseCoherentFieldModeCount = 0;

  for (const entry of modes?.values?.() ?? []) {
    const renderLayer = getModeRenderLayer(entry);
    const includeEntry = renderLayer === layer;
    if (!includeEntry) {
      continue;
    }
    const retainedEnergy = getObservedModeRetainedEnergy(entry);
    if (retainedEnergy <= 0) {
      continue;
    }
    count += 1;
    energy += retainedEnergy;
    observedDrive += entry?.observedDrive ?? 0;
    observedSnr += Math.min(entry?.observedSnr ?? 0, profile.snrFull);
    coherence += entry?.coherence ?? 0;
    noiseFloor += entry?.localNoiseFloor ?? 0;
    const entryPhaseAuthority = clamp01(entry?.phaseAuthority ?? 0);
    if (entryPhaseAuthority > 0) {
      phaseCoherentFieldModeCount += 1;
      phaseAuthority += entryPhaseAuthority;
      phaseCoherence += entry?.phaseCoherence ?? 0;
    }
  }

  const averageObservedDrive = count > 0 ? observedDrive / count : 0;
  const averageCoherence = count > 0 ? coherence / count : 0;
  const averageSnr = count > 0 ? observedSnr / count : 0;

  return {
    count,
    energy: clamp01(energy),
    observedDrive: clamp01(averageObservedDrive),
    observedSnr: clamp01(averageSnr / profile.snrFull),
    coherence: clamp01(averageCoherence),
    noiseFloor: count > 0 ? clamp01(noiseFloor / count) : 0,
    phaseAuthority: clamp01(phaseAuthority),
    phaseCoherence:
      phaseCoherentFieldModeCount > 0
        ? clamp01(phaseCoherence / phaseCoherentFieldModeCount)
        : 0,
    phaseCoherentFieldModeCount,
  };
}

function summarizeObservedModes(modes) {
  const highQ = summarizeObservedLayerModes(modes, "resonant");
  const lowQ = summarizeObservedLayerModes(modes, "source-coupled");
  const observedModalModeCount = highQ.count + lowQ.count;
  const highQRingSupport =
    highQ.count >= HIGH_Q_OBSERVER_MIN_MODE_COUNT &&
    highQ.energy >= HIGH_Q_RESONANT_MIN_RETAINED_ENERGY
      ? clamp01(
          Math.max(
            HIGH_Q_RESONANT_MIN_RING_SUPPORT,
            highQ.energy * 24,
            highQ.observedDrive * 2.2,
          ) *
            smoothstep(1, HIGH_Q_OBSERVER_MIN_MODE_COUNT, highQ.count) *
            Math.max(0.5, highQ.coherence),
        )
      : 0;

  return {
    observedModalModeCount,
    lowQSourceCoupledModeCount: lowQ.count,
    lowQSourceCoupledEnergy: lowQ.energy,
    lowQObservedDrive: lowQ.observedDrive,
    lowQObservedSnr: lowQ.observedSnr,
    lowQObservedCoherence: lowQ.coherence,
    lowQPhaseAuthority: lowQ.phaseAuthority,
    highQResonantModeCount: highQ.count,
    highQResonantEnergy: highQ.energy,
    highQRingSupport,
    highQObservedDrive: highQ.observedDrive,
    highQObservedSnr: highQ.observedSnr,
    highQObservedCoherence: highQ.coherence,
    highQObservedNoiseFloor: highQ.noiseFloor,
    highQPhaseAuthority: highQ.phaseAuthority,
    modalPhaseAuthority: clamp01(
      highQ.phaseAuthority + lowQ.phaseAuthority * 0.45,
    ),
    modalPhaseCoherentFieldModeCount:
      highQ.phaseCoherentFieldModeCount + lowQ.phaseCoherentFieldModeCount,
  };
}

function appendHighQSparseAuthority({
  modalObserverMetrics,
  distributedExcitation,
  periodicity,
  fftMagnitudes,
}) {
  return {
    ...modalObserverMetrics,
    ...deriveHighQSparseResonatorAuthority({
      highQObservedSnr: modalObserverMetrics.highQObservedSnr,
      highQObservedCoherence: modalObserverMetrics.highQObservedCoherence,
      highQObservedDrive: modalObserverMetrics.highQObservedDrive,
      highQRingSupport: modalObserverMetrics.highQRingSupport,
      highQResonantEnergy: modalObserverMetrics.highQResonantEnergy,
      distributedExcitation,
      periodicity,
      nonZeroFFTBinCount: countNonZeroFftBins(fftMagnitudes),
      modeCoherence: modalObserverMetrics.highQObservedCoherence,
    }),
  };
}

function hasAgedObservedLayerModes({
  modes,
  layer,
  currentFrameAtMs,
  minAgeMs,
}) {
  for (const entry of modes?.values?.() ?? []) {
    const matchesLayer = getModeRenderLayer(entry) === layer;
    if (
      matchesLayer &&
      currentFrameAtMs - (entry?.firstObservedAtMs ?? currentFrameAtMs) >=
        minAgeMs
    ) {
      return true;
    }
  }
  return false;
}

function pruneObservedModesByLayer(modes, capacities) {
  const byLayer = new Map();
  for (const entry of modes?.values?.() ?? []) {
    const layer = entry?.layer ?? "resonant";
    if (!byLayer.has(layer)) {
      byLayer.set(layer, []);
    }
    byLayer.get(layer).push(entry);
  }

  const nextModes = new Map();
  for (const [layer, entries] of byLayer) {
    const capacity = Math.max(0, capacities?.[layer] ?? entries.length);
    for (const entry of entries
      .sort(
        (left, right) =>
          (right.retainedEnergy ?? 0) - (left.retainedEnergy ?? 0),
      )
      .slice(0, capacity)) {
      nextModes.set(entry.modeKey, entry);
    }
  }
  return nextModes;
}

function updateObservedModalModes({
  state,
  atlas,
  driveBuffer,
  fastSignalState,
  preparedInputs,
  drivePeak,
  periodicity,
  tonalness,
  distributedExcitation,
  strictHardSilentFrame,
  dominantDriveFrequencyHz,
  dominantDriveSpectralSupport,
  deltaMs,
  capacities,
  driveSource,
}) {
  const nextModes = new Map();
  const hadPreviousObservedModes = (state.observedModes?.size ?? 0) > 0;
  const periodicAliveSignal =
    periodicity >= HIGH_Q_OBSERVER_PERIODICITY_START &&
    drivePeak >= HIGH_Q_OBSERVER_DRIVE_PEAK_START;
  const allowBassHarmonicDriver =
    !preparedInputs.bandState?.liveInputCalibrationActive;

  for (const atlasEntry of atlas) {
    const profile = getModalObserverProfile(atlasEntry.layer);
    const response = computeModeResponse(
      driveBuffer,
      preparedInputs.sampleRate,
      atlasEntry.naturalFrequencyHz,
    );
    const spectralSupport = sampleFFTAmplitudeForFrequency(
      atlasEntry.naturalFrequencyHz,
      fastSignalState.fftMagnitudes,
      preparedInputs.sampleRate,
      preparedInputs.fftSize,
    );
    const localNoiseFloor = computeModalObserverNoiseFloor({
      fftMagnitudes: fastSignalState.fftMagnitudes,
      sampleRate: preparedInputs.sampleRate,
      frequencyHz: atlasEntry.naturalFrequencyHz,
      profile,
    });
    const observation = computeModalObservation({
      atlasEntry,
      response,
      spectralSupport,
      localNoiseFloor,
      drivePeak,
      periodicity,
      tonalness,
      distributedExcitation,
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
      avgAmplitude: preparedInputs.avgAmplitude,
      analyserRms: preparedInputs.analyserRms,
      driveSource,
      sourceMode: preparedInputs.sourceMode,
      profile,
    });
    const previous = state.observedModes?.get(atlasEntry.modeKey) ?? null;
    const observed = hasObservedModalDrive(observation, profile);
    const modeHardSilentFrame = strictHardSilentFrame;
    const decayTauMs =
      atlasEntry.decayTauMs *
      (observed ? profile.decayTauScale : profile.noEvidenceTauScale);
    const physicalRelease = Math.exp(-deltaMs / Math.max(decayTauMs, 1));
    const release = physicalRelease;
    const decayedEnergy =
      (previous?.retainedEnergy ?? previous?.amplitude ?? 0) * release;
    const previousEnergy = previous?.retainedEnergy ?? 0;
    const attackedEnergy =
      modeHardSilentFrame && !observed && !periodicAliveSignal
        ? 0
        : previous
          ? previousEnergy * (1 - profile.attack) +
            observation.observedEnergy * profile.attack
          : observation.observedEnergy;
    const retainedEnergy = Math.max(decayedEnergy, attackedEnergy);

    if (retainedEnergy < profile.minRetainedEnergy) {
      continue;
    }

    const entry = createObservedModalModeEntry({
      atlasEntry,
      previous,
      response,
      observedDrive: observation.observedDrive,
      observedEnergy: observation.observedEnergy,
      retainedEnergy,
      localNoiseFloor,
      observedSnr: observation.observedSnr,
      observerCoherence: observation.observerCoherence,
      currentFrameAtMs: preparedInputs.currentFrameAtMs,
      drivePeak,
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
      hardSilentFrame: modeHardSilentFrame,
    });
    nextModes.set(entry.modeKey, entry);
  }

  const sortedModes = Array.from(nextModes.values()).sort(
    (left, right) => (right.retainedEnergy ?? 0) - (left.retainedEnergy ?? 0),
  );
  const currentObservationCount = sortedModes.filter((entry) =>
    hasObservedModalDrive(entry, getModalObserverProfile(entry.layer)),
  ).length;
  const averageCurrentObservedDrive =
    currentObservationCount > 0
      ? sortedModes.reduce(
          (total, entry) => total + Math.max(0, entry.observedDrive ?? 0),
          0,
        ) / currentObservationCount
      : 0;
  const broadbandLikeObservation =
    !hadPreviousObservedModes &&
    currentObservationCount >=
      Math.max(1, (capacities?.sourceCoupled ?? 0) + (capacities?.resonant ?? 0)) &&
    averageCurrentObservedDrive < 0.008;

  state.observedModes = broadbandLikeObservation
    ? new Map()
    : pruneObservedModesByLayer(
        new Map(sortedModes.map((entry) => [entry.modeKey, entry])),
        capacities,
      );

  const summary = summarizeObservedModes(state.observedModes);
  return summary;
}

function mergeExcitedObservedModes({
  state,
  excitedEntries,
  capacities,
  currentFrameAtMs,
  drivePeak,
  periodicity,
  tonalness,
  distributedExcitation,
  dominantDriveFrequencyHz,
  dominantDriveSpectralSupport,
  allowBassHarmonicDriver,
}) {
  const nextModes = new Map(state.observedModes ?? []);

  for (const entry of excitedEntries) {
    const profile = getModalObserverProfile(entry.layer);
    if (
      entry.layer === "source-coupled" &&
      distributedExcitation > 0.5 &&
      tonalness < 0.58
    ) {
      continue;
    }
    const periodicityGate = smoothstep(
      profile.periodicityStart,
      profile.periodicityFull,
      periodicity,
    );
    const tonalGate = smoothstep(
      profile.tonalnessStart,
      profile.tonalnessFull,
      Math.max(tonalness, periodicity * 0.82),
    );
    const sparseGate = Math.max(
      1 -
        smoothstep(
          profile.distributionStart,
          profile.distributionFull,
          distributedExcitation,
        ),
      profile.sparseEvidenceFloor ?? 0,
    );
    const observerContext = clamp01(periodicityGate * tonalGate * sparseGate);

    if (observerContext <= profile.mergeContextMin) {
      continue;
    }

    const observedDrive = clamp01(
      Math.max(entry.currentDriveEnergy ?? 0, entry.driveEnergy ?? 0) *
        Math.max(observerContext, entry.coherence ?? 0),
    );
    const observedEnergy = clamp01(
      Math.max(
        (entry.amplitude ?? 0) * (entry.layer === "resonant" ? 1.15 : 1),
        observedDrive * profile.energyGain,
      ),
    );
    const hasObservedModalEvidence =
      hasObservedModalDrive({ observedDrive }, profile) ||
      observedEnergy >= profile.minRetainedEnergy;
    const hasSustainedModalEvidence =
      entry.layer === "source-coupled"
        ? hasObservedModalDrive({ observedDrive }, profile) ||
          (entry.amplitude ?? 0) >= profile.minRetainedEnergy
        : (entry.resonantMaturity ?? 0) >=
            RESONANT_SUBTLE_DISPLAY_CONTINUITY_MIN_MATURITY ||
          getSustainedResonantPresence(entry) >=
            RESONANT_DISPLAY_CONTINUITY_MIN_PRESENCE ||
          entry.resonantDisplayContinuity === true;

    if (
      !hasObservedModalEvidence ||
      (!hasSustainedModalEvidence && observedDrive < 0.015)
    ) {
      continue;
    }

    const previous = nextModes.get(entry.modeKey) ?? null;
    const mergedObservedDrive = Math.max(
      observedDrive,
      previous?.observedDrive ?? 0,
    );
    const mergedObservedEnergy = Math.max(
      observedEnergy,
      previous?.observedEnergy ?? 0,
    );
    const retainedEnergy = Math.max(
      previous?.retainedEnergy ?? 0,
      mergedObservedEnergy,
    );
    nextModes.set(
      entry.modeKey,
      createObservedModalModeEntry({
        atlasEntry: entry,
        previous,
        response: { phase: entry.phase ?? previous?.phase ?? 0 },
        observedDrive: mergedObservedDrive,
        observedEnergy: mergedObservedEnergy,
        retainedEnergy,
        localNoiseFloor: previous?.localNoiseFloor ?? 0,
        observedSnr: previous?.observedSnr ?? 0,
        observerCoherence: Math.max(
          entry.coherence ?? 0,
          observerContext,
          profile.minRetainedCoherence,
        ),
        currentFrameAtMs,
        drivePeak,
        dominantDriveFrequencyHz,
        dominantDriveSpectralSupport,
        allowBassHarmonicDriver,
      }),
    );
  }

  state.observedModes = pruneObservedModesByLayer(
    new Map(
      Array.from(nextModes.values()).map((entry) => [entry.modeKey, entry]),
    ),
    capacities,
  );

  return summarizeObservedModes(state.observedModes);
}

function getResonantMaturitySignalScale(entry) {
  if ((entry?.layer ?? "resonant") !== "resonant") {
    return 1;
  }
  return clamp01(
    RESONANT_MATURITY_SIGNAL_MIN +
      clamp01(entry?.resonantMaturity ?? 0) * RESONANT_MATURITY_SIGNAL_WEIGHT,
  );
}

function getResonantDisplayContinuitySourceScale(entry) {
  if (
    (entry?.layer ?? "resonant") !== "resonant" ||
    entry?.resonantDisplayContinuity !== true
  ) {
    return 1;
  }

  const sourceEnvelope = smoothstep(
    HIGH_Q_RESONANT_DISPLAY_ENVELOPE_START,
    HIGH_Q_RESONANT_DISPLAY_ENVELOPE_FULL,
    clamp01(entry?.sourceAmplitude ?? entry?.currentDriveEnergy ?? 0),
  );
  return (
    HIGH_Q_RESONANT_DISPLAY_ENVELOPE_FLOOR +
    sourceEnvelope * (1 - HIGH_Q_RESONANT_DISPLAY_ENVELOPE_FLOOR)
  );
}

function getDisplayAmplitude(entry, layer) {
  const signalAmplitude = entry?.signalAmplitude ?? 0;
  const modalResponseAmplitude = clamp01(
    entry?.modalResponseDisplayAmplitude ?? entry?.displayAmplitude ?? 0,
  );
  if (layer === "resonant") {
    const unconstrainedResonantAmplitude = Math.max(
      modalResponseAmplitude,
      clamp01(signalAmplitude * getResonantMaturitySignalScale(entry)),
    );
    const responseBudgetConstrained =
      (entry?.modalResponseBudgetScale ?? 1) < 0.999 &&
      (entry?.modalResponseInputEnergy ?? 0) > 0.75;
    const currentResponseSupport = responseBudgetConstrained
      ? smoothstep(
          0.006,
          0.08,
          Math.max(
            entry?.modalResponseDrive ?? 0,
            entry?.currentDriveEnergy ?? 0,
          ),
        )
      : 1;
    const responseCeiling =
      modalResponseAmplitude * Math.max(0.12, currentResponseSupport);
    const resonantAmplitude = responseBudgetConstrained
      ? Math.min(unconstrainedResonantAmplitude, responseCeiling)
      : unconstrainedResonantAmplitude;
    return entry?.hardSilentFrame === true
      ? Math.min(resonantAmplitude, clamp01(entry?.amplitude ?? 0))
      : resonantAmplitude;
  }

  const displayAmplitude =
    Math.max(signalAmplitude, modalResponseAmplitude);
  return entry?.hardSilentFrame === true
    ? Math.min(displayAmplitude, clamp01(entry?.amplitude ?? 0))
    : displayAmplitude;
}

function getObservedCarryAmplitudeScale(entry, layer) {
  if (
    layer !== "resonant" ||
    entry?.observedModal !== true ||
    getModeRenderLayer(entry) !== "resonant"
  ) {
    return 1;
  }
  return (
    1 -
    (1 - getResonantDisplayContinuitySourceScale(entry)) *
      OBSERVED_RESONANT_CARRY_ENVELOPE_WEIGHT
  );
}

function getNextResonantMaturity({
  previousMaturity,
  sustainedPresence,
  driveEnergy,
  hardSilentFrame,
}) {
  if (hardSilentFrame) {
    return 0;
  }

  const seedMaturity =
    driveEnergy >= RESONANT_SIGNAL_MIN_DRIVE_ENERGY ? RESONANT_MATURITY_SEED : 0;
  const targetMaturity = Math.max(
    seedMaturity,
    clamp01(sustainedPresence * RESONANT_MATURITY_PRESENCE_GAIN),
  );
  const rate =
    targetMaturity >= previousMaturity
      ? RESONANT_MATURITY_ATTACK
      : RESONANT_MATURITY_RELEASE;

  return clamp01(previousMaturity + (targetMaturity - previousMaturity) * rate);
}

function getCoherentResonantCoupling({
  tonalness,
  periodicity,
  distributedExcitation,
  resonantBandPeak,
  harmonicSupport,
  hardSilentFrame,
}) {
  if (
    hardSilentFrame ||
    tonalness < RESONANT_COUPLING_MIN_TONALNESS ||
    periodicity < RESONANT_COUPLING_MIN_PERIODICITY ||
    distributedExcitation > RESONANT_COUPLING_MAX_DISTRIBUTION
  ) {
    return 0;
  }

  return (
    smoothstep(
      RESONANT_COUPLING_RESONANT_BAND_START,
      RESONANT_COUPLING_RESONANT_BAND_END,
      resonantBandPeak,
    ) *
    smoothstep(
      RESONANT_COUPLING_HARMONIC_SUPPORT_START,
      RESONANT_COUPLING_HARMONIC_SUPPORT_END,
      harmonicSupport,
    ) *
    clamp01(
      (tonalness - RESONANT_COUPLING_MIN_TONALNESS) /
        (1 - RESONANT_COUPLING_MIN_TONALNESS),
    ) *
    clamp01(
      (periodicity - RESONANT_COUPLING_MIN_PERIODICITY) /
        (1 - RESONANT_COUPLING_MIN_PERIODICITY),
    ) *
    clamp01(
      (RESONANT_COUPLING_MAX_DISTRIBUTION - distributedExcitation) /
        RESONANT_COUPLING_MAX_DISTRIBUTION,
    )
  );
}

function getSignalScore(entry, layer) {
  const coherence = clamp01(entry?.coherence ?? 0);
  const currentDriveEnergy = entry?.currentDriveEnergy ?? 0;
  const driveEnergy = currentDriveEnergy || (entry?.driveEnergy ?? 0);
  const amplitude = entry?.amplitude ?? 0;
  const modalResponseAmplitude =
    currentDriveEnergy >=
    (layer === "source-coupled"
      ? SOURCE_COUPLED_SIGNAL_MIN_DRIVE_ENERGY
      : RESONANT_SIGNAL_MIN_DRIVE_ENERGY)
      ? clamp01(entry?.modalResponseDisplayAmplitude ?? 0)
      : 0;
  const freshness = getFreshness(entry);

  if (layer === "resonant") {
    const sustainedPresence = getSustainedResonantPresence(entry);
    const score =
      (driveEnergy * RESONANT_SIGNAL_SCORE_DRIVE_WEIGHT +
        amplitude * RESONANT_SIGNAL_SCORE_AMPLITUDE_WEIGHT +
        freshness * RESONANT_SIGNAL_SCORE_FRESHNESS_WEIGHT) *
        clamp01(0.45 + coherence * 0.55) +
      sustainedPresence * RESONANT_SIGNAL_SCORE_SUSTAIN_WEIGHT;
    const responseScore =
      modalResponseAmplitude * clamp01(0.5 + coherence * 0.5);
    if (!entry?.resonantDisplayContinuity) {
      return Math.max(score, responseScore);
    }

    const continuityScore = Math.max(
      score,
      responseScore,
      entry.subtleResonantDisplayContinuity
        ? RESONANT_SUBTLE_DISPLAY_CONTINUITY_SIGNAL_BASE +
            clamp01(entry.resonantDisplayContinuityPresence ?? 0) *
              RESONANT_SUBTLE_DISPLAY_CONTINUITY_PRESENCE_WEIGHT
        : RESONANT_DISPLAY_CONTINUITY_SIGNAL_BASE +
            clamp01(entry.resonantDisplayContinuityPresence ?? 0) *
              RESONANT_DISPLAY_CONTINUITY_PRESENCE_WEIGHT,
    );
    return continuityScore * getResonantDisplayContinuitySourceScale(entry);
  }

  const sourceCoupledScore =
    coherence *
    (driveEnergy * SOURCE_COUPLED_SIGNAL_SCORE_DRIVE_WEIGHT +
      amplitude * SOURCE_COUPLED_SIGNAL_SCORE_AMPLITUDE_WEIGHT);
  const responseScore = modalResponseAmplitude * clamp01(0.5 + coherence * 0.5);
  return entry?.sourceCoupledDisplayContinuity
    ? Math.max(
        sourceCoupledScore,
        responseScore,
        SOURCE_COUPLED_DISPLAY_CONTINUITY_SIGNAL_BASE +
          clamp01(entry.sourceCoupledDisplayContinuityPresence ?? 0) *
            SOURCE_COUPLED_DISPLAY_CONTINUITY_PRESENCE_WEIGHT,
      )
    : Math.max(sourceCoupledScore, responseScore);
}

function buildSignalShortlist(entries, layer, currentFrameAtMs, capacity) {
  const coherenceThreshold = layer === "source-coupled" ? 0.08 : 0.05;
  const driveThreshold =
    layer === "source-coupled"
      ? SOURCE_COUPLED_SIGNAL_MIN_DRIVE_ENERGY
      : RESONANT_SIGNAL_MIN_DRIVE_ENERGY;
  const staleWindowMs =
    layer === "source-coupled"
      ? SOURCE_COUPLED_SIGNAL_STALE_WINDOW_MS
      : RESONANT_SIGNAL_STALE_WINDOW_MS;

  return entries
    .filter((entry) => {
      if (entry.layer !== layer || entry.coherence < coherenceThreshold) {
        return false;
      }
      if (layer === "resonant" && entry.weakResonantNoise === true) {
        return false;
      }
      if (
        (entry.currentDriveEnergy ?? entry.driveEnergy ?? 0) >= driveThreshold
      ) {
        return true;
      }
      if (
        layer === "resonant" &&
        getSustainedResonantPresence(entry) >= RESONANT_SUSTAIN_SIGNAL_MIN_PRESENCE
      ) {
        return true;
      }
      if (layer === "source-coupled" && entry.sourceCoupledDisplayContinuity) {
        return true;
      }
      if (layer === "resonant" && entry.resonantDisplayContinuity) {
        return true;
      }
      return (
        currentFrameAtMs -
          (entry.lastExcitedAtMs ?? Number.NEGATIVE_INFINITY) <=
        staleWindowMs
      );
    })
    .map((entry) => ({
      entry,
      score: getSignalScore(entry, layer),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (
        (right.entry.currentDriveEnergy ?? right.entry.driveEnergy ?? 0) !==
        (left.entry.currentDriveEnergy ?? left.entry.driveEnergy ?? 0)
      ) {
        return (
          (right.entry.currentDriveEnergy ?? right.entry.driveEnergy ?? 0) -
          (left.entry.currentDriveEnergy ?? left.entry.driveEnergy ?? 0)
        );
      }
      return (right.entry.amplitude ?? 0) - (left.entry.amplitude ?? 0);
    })
    .slice(0, capacity)
    .map(({ entry, score }) => ({
      ...entry,
      signalAmplitude: clamp01(score),
    }));
}

function getDisplayScore(entry, layer) {
  const driveEnergy = entry?.currentDriveEnergy ?? 0;
  const coherence = entry?.coherence ?? 0;
  const amplitude = entry?.amplitude ?? 0;
  const modalResponseAmplitude = clamp01(
    entry?.modalResponseDisplayAmplitude ?? 0,
  );
  const freshness = getFreshness(entry);

  if (layer === "source-coupled") {
    return (
      driveEnergy * SOURCE_COUPLED_DISPLAY_SCORE_DRIVE_WEIGHT +
      coherence * SOURCE_COUPLED_DISPLAY_SCORE_COHERENCE_WEIGHT +
      amplitude * SOURCE_COUPLED_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
      modalResponseAmplitude * SOURCE_COUPLED_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
      freshness * SOURCE_COUPLED_DISPLAY_SCORE_FRESHNESS_WEIGHT
    );
  }

  return (
    driveEnergy * RESONANT_DISPLAY_SCORE_DRIVE_WEIGHT +
    coherence * RESONANT_DISPLAY_SCORE_COHERENCE_WEIGHT +
    amplitude * RESONANT_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
    modalResponseAmplitude * RESONANT_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
    freshness * RESONANT_DISPLAY_SCORE_FRESHNESS_WEIGHT
  );
}

function compareFastResonantAssistEntries(left, right) {
  const driveDelta =
    (right?.currentDriveEnergy ?? 0) - (left?.currentDriveEnergy ?? 0);
  if (Math.abs(driveDelta) > 1e-9) {
    return driveDelta;
  }

  const freshnessDelta = getFreshness(right) - getFreshness(left);
  if (Math.abs(freshnessDelta) > 1e-9) {
    return freshnessDelta;
  }

  return (right?.signalAmplitude ?? 0) - (left?.signalAmplitude ?? 0);
}

function selectFastResonantAssist(entries, currentFrameAtMs) {
  return (
    entries
      .filter((entry) => {
        if ((entry?.layer ?? "resonant") !== "resonant") {
          return false;
        }

        return (
          (entry?.currentDriveEnergy ?? 0) >= 0.12 &&
          (entry?.signalAmplitude ?? 0) >=
            RESONANT_DISPLAY_MIN_SIGNAL_AMPLITUDE &&
          currentFrameAtMs -
            (entry?.lastExcitedAtMs ?? Number.NEGATIVE_INFINITY) <=
            RESONANT_SIGNAL_STALE_WINDOW_MS &&
          (entry?.persistence ?? 1) <= 0.72
        );
      })
      .sort(compareFastResonantAssistEntries)[0] ?? null
  );
}

function mergeFastResonantAssist(displayEntries, assistEntry, visibleCap) {
  const resolvedVisibleCap = Math.max(
    0,
    Math.floor(visibleCap ?? displayEntries.length),
  );
  const visibleEntries = displayEntries.slice(0, resolvedVisibleCap);
  if (!assistEntry) {
    return {
      entries: visibleEntries,
      assistEntry: null,
      assistNeedsReservedAdmission: false,
    };
  }

  const mergedEntries = [...visibleEntries];
  const duplicateIndex = mergedEntries.findIndex(
    (entry) =>
      getRelativeFrequencyDistance(
        entry.naturalFrequencyHz,
        assistEntry.naturalFrequencyHz,
      ) <= RESONANT_DISPLAY_SAME_FREQUENCY_WINDOW,
  );

  if (duplicateIndex === -1) {
    return {
      entries: [
        assistEntry,
        ...mergedEntries.filter(
          (entry) => entry.modeKey !== assistEntry.modeKey,
        ),
      ].slice(0, resolvedVisibleCap),
      assistEntry,
      assistNeedsReservedAdmission: true,
    };
  }

  const duplicateEntry = mergedEntries[duplicateIndex];
  if (compareFastResonantAssistEntries(assistEntry, duplicateEntry) >= 0) {
    return {
      entries: visibleEntries,
      assistEntry: null,
      assistNeedsReservedAdmission: false,
    };
  }

  mergedEntries.splice(duplicateIndex, 1, assistEntry);
  return {
    entries: [
      assistEntry,
      ...mergedEntries.filter((entry) => entry.modeKey !== assistEntry.modeKey),
    ].slice(0, resolvedVisibleCap),
    assistEntry,
    assistNeedsReservedAdmission:
      duplicateEntry?.modeKey !== assistEntry.modeKey,
  };
}

function hasVisibleModeKey(slots, modeKey) {
  if (!modeKey || !(slots instanceof Float32Array)) {
    return false;
  }

  for (let index = 0; index < slots.length; index += 4) {
    if ((slots[index + 3] ?? 0) <= 0) {
      continue;
    }
    if (
      buildModeKey(slots[index], slots[index + 1], slots[index + 2]) === modeKey
    ) {
      return true;
    }
  }

  return false;
}

function buildModeKeySet(slots, capacity) {
  const keys = new Set();
  if (!(slots instanceof Float32Array)) {
    return keys;
  }

  const slotLimit = Math.min(capacity, Math.floor(slots.length / 4));
  for (let index = 0; index < slotLimit; index += 1) {
    const offset = index * 4;
    if ((slots[offset + 3] ?? 0) <= 0) {
      continue;
    }
    keys.add(buildModeKey(slots[offset], slots[offset + 1], slots[offset + 2]));
  }

  return keys;
}

function hasStrongFreshResonantSignal({ visibleSlots, signalSlots, capacity }) {
  const visibleKeys = buildModeKeySet(visibleSlots, capacity);
  if (!(signalSlots instanceof Float32Array) || visibleKeys.size === 0) {
    return false;
  }

  let strongestFreshSignal = 0;
  let strongestCoveredSignal = 0;
  const signalLimit = Math.min(capacity, Math.floor(signalSlots.length / 4));
  for (let index = 0; index < signalLimit; index += 1) {
    const offset = index * 4;
    const signalAmplitude = signalSlots[offset + 3] ?? 0;
    if (signalAmplitude <= 0) {
      continue;
    }
    const key = buildModeKey(
      signalSlots[offset],
      signalSlots[offset + 1],
      signalSlots[offset + 2],
    );
    if (visibleKeys.has(key)) {
      strongestCoveredSignal = Math.max(
        strongestCoveredSignal,
        signalAmplitude,
      );
    } else {
      strongestFreshSignal = Math.max(strongestFreshSignal, signalAmplitude);
    }
  }

  return (
    strongestFreshSignal >= EXCITATION_RESONANT_FAST_SHIFT_MIN_SIGNAL_AMPLITUDE &&
    strongestFreshSignal >=
      strongestCoveredSignal * EXCITATION_RESONANT_FAST_SHIFT_SIGNAL_RATIO
  );
}

function computeSignalCoverageByVisibleKeys(
  visibleSlots,
  signalSlots,
  capacity,
) {
  if (
    !(visibleSlots instanceof Float32Array) ||
    !(signalSlots instanceof Float32Array)
  ) {
    return 1;
  }

  const visibleKeys = new Set();
  const visibleLimit = Math.min(capacity, Math.floor(visibleSlots.length / 4));
  for (let index = 0; index < visibleLimit; index += 1) {
    const offset = index * 4;
    if ((visibleSlots[offset + 3] ?? 0) <= 0) {
      continue;
    }
    visibleKeys.add(
      buildModeKey(
        visibleSlots[offset],
        visibleSlots[offset + 1],
        visibleSlots[offset + 2],
      ),
    );
  }

  let coveredSignalAmplitude = 0;
  let totalSignalAmplitude = 0;
  const signalLimit = Math.min(capacity, Math.floor(signalSlots.length / 4));
  for (let index = 0; index < signalLimit; index += 1) {
    const offset = index * 4;
    const signalAmplitude = signalSlots[offset + 3] ?? 0;
    if (signalAmplitude <= 0) {
      continue;
    }
    totalSignalAmplitude += signalAmplitude;
    if (
      visibleKeys.has(
        buildModeKey(
          signalSlots[offset],
          signalSlots[offset + 1],
          signalSlots[offset + 2],
        ),
      )
    ) {
      coveredSignalAmplitude += signalAmplitude;
    }
  }

  return totalSignalAmplitude > 0
    ? clamp01(coveredSignalAmplitude / totalSignalAmplitude)
    : 1;
}

function getResonantDisplayContinuityPresence(slots, modalModes, capacity) {
  if (!(slots instanceof Float32Array) || !(modalModes instanceof Map)) {
    return 0;
  }

  const slotLimit = Math.min(capacity, Math.floor(slots.length / 4));
  let continuityPresence = 0;
  for (let index = 0; index < slotLimit; index += 1) {
    const offset = index * 4;
    if ((slots[offset + 3] ?? 0) <= 0) {
      continue;
    }
    const entry = modalModes.get(
      buildModeKey(slots[offset], slots[offset + 1], slots[offset + 2]),
    );
    if (
      entry?.layer === "resonant" &&
      getSustainedResonantPresence(entry) > continuityPresence
    ) {
      continuityPresence = getSustainedResonantPresence(entry);
    }
  }

  return continuityPresence;
}

function buildDisplayShortlist(entries, layer, capacity = entries.length) {
  const minSignalAmplitude =
    layer === "source-coupled"
      ? SOURCE_COUPLED_DISPLAY_MIN_SIGNAL_AMPLITUDE
      : RESONANT_DISPLAY_MIN_SIGNAL_AMPLITUDE;
  const duplicateWindow =
    layer === "source-coupled"
      ? SOURCE_COUPLED_DISPLAY_DUPLICATE_WINDOW
      : RESONANT_DISPLAY_SAME_FREQUENCY_WINDOW;
  const visibleCap = Math.max(0, Math.floor(capacity ?? entries.length));

  const ranked = entries
    .filter((entry) => {
      if (layer === "resonant" && entry.weakResonantNoise === true) {
        return false;
      }
      const entryMinSignal =
        layer === "source-coupled" && entry?.sourceCoupledDisplayContinuity
          ? SOURCE_COUPLED_DISPLAY_CONTINUITY_SIGNAL_BASE * 0.85
          : layer === "resonant" && entry?.subtleResonantDisplayContinuity
            ? RESONANT_SUBTLE_DISPLAY_CONTINUITY_SIGNAL_BASE * 0.85
            : minSignalAmplitude;
      return (entry?.signalAmplitude ?? 0) >= entryMinSignal;
    })
    .map((entry) => ({
      ...entry,
      displayAmplitude: getDisplayAmplitude(entry, layer),
      displayScore: getDisplayScore(entry, layer),
    }))
    .sort((left, right) => {
      if (right.displayScore !== left.displayScore) {
        return right.displayScore - left.displayScore;
      }
      const signalDelta =
        (right.signalAmplitude ?? 0) - (left.signalAmplitude ?? 0);
      if (Math.abs(signalDelta) > 1e-9) {
        return signalDelta;
      }
      const frequencyDelta =
        (left.naturalFrequencyHz ?? 0) - (right.naturalFrequencyHz ?? 0);
      if (Math.abs(frequencyDelta) > 1e-9) {
        return frequencyDelta;
      }
      return getEntryModeKey(left).localeCompare(getEntryModeKey(right));
    });

  const survivors = [];
  for (const entry of ranked) {
    if (
      survivors.some((survivor) => {
        if (getEntryModeKey(survivor) === getEntryModeKey(entry)) {
          return true;
        }
        return (
          duplicateWindow > 0 &&
          getRelativeFrequencyDistance(
            survivor.naturalFrequencyHz,
            entry.naturalFrequencyHz,
          ) <= duplicateWindow
        );
      })
    ) {
      continue;
    }
    survivors.push(entry);
    if (survivors.length >= visibleCap) {
      break;
    }
  }

  return survivors;
}

function getEntryModeKey(entry) {
  return buildModeKey(entry?.u, entry?.v, entry?.w);
}

function buildModalProjection({
  state,
  sourceCoupledEntries,
  resonantEntries,
  fastResonantAssist,
  hardSilentFrame,
  sourceCoupledProjectionSwitch,
  resonantProjectionSwitch = false,
  sourceCoupledCapacity,
  resonantCapacity,
  colorContext,
  modalObserverMetrics,
  highQResonantTopologySignal,
  modalResponseMetrics = null,
}) {
  if (hardSilentFrame) {
    state.sourceCoupledProjectionSwitchFrames = 0;
    state.sourceCoupledProjectionSuppressedKeys?.clear?.();
  } else if (sourceCoupledProjectionSwitch) {
    state.sourceCoupledProjectionSwitchFrames =
      EXCITATION_SOURCE_COUPLED_SWITCH_PROJECTION_FRAMES;
    state.sourceCoupledProjectionSuppressedKeys = buildModeKeySet(
      state.blendSourceCoupled.slots,
      sourceCoupledCapacity,
    );
  } else if ((state.sourceCoupledProjectionSwitchFrames ?? 0) > 0) {
    state.sourceCoupledProjectionSwitchFrames -= 1;
    if (state.sourceCoupledProjectionSwitchFrames <= 0) {
      state.sourceCoupledProjectionSuppressedKeys?.clear?.();
    }
  }
  const suppressedSourceCoupledKeys =
    (state.sourceCoupledProjectionSwitchFrames ?? 0) > 0
      ? state.sourceCoupledProjectionSuppressedKeys
      : null;
  const projectedSourceCoupledEntries = suppressedSourceCoupledKeys?.size
    ? sourceCoupledEntries.filter(
        (entry) => !suppressedSourceCoupledKeys.has(getEntryModeKey(entry)),
      )
    : sourceCoupledEntries;
  const rawDisplaySourceCoupledEntries = hardSilentFrame
    ? []
    : buildDisplayShortlist(
        projectedSourceCoupledEntries,
        "source-coupled",
        sourceCoupledCapacity,
      );
  const {
    entries: rawDisplayResonantEntries,
    assistEntry: mergedFastResonantAssist,
    assistNeedsReservedAdmission,
  } = hardSilentFrame
    ? {
        entries: [],
        assistEntry: null,
        assistNeedsReservedAdmission: false,
      }
    : mergeFastResonantAssist(
        buildDisplayShortlist(resonantEntries, "resonant", resonantCapacity),
        fastResonantAssist,
        resonantCapacity,
      );
  const {
    entries: displaySourceCoupledEntries,
    metrics: sourceCoupledProjectionNormalizationMetrics,
  } = applyProjectionEnergyNormalization({
    entries: rawDisplaySourceCoupledEntries,
    layer: "source-coupled",
    modalObserverMetrics,
    hardSilentFrame,
    highQResonantTopologySignal,
    resolveDisplayAmplitude: getDisplayAmplitude,
    getModalObserverProfile,
  });
  const {
    entries: displayResonantEntries,
    metrics: resonantProjectionNormalizationMetrics,
  } = applyProjectionEnergyNormalization({
    entries: rawDisplayResonantEntries,
    layer: "resonant",
    modalObserverMetrics,
    hardSilentFrame,
    highQResonantTopologySignal,
    resolveDisplayAmplitude: getDisplayAmplitude,
    getModalObserverProfile,
  });
  const {
    entries: signalResonantProjectionEntries,
    metrics: signalResonantProjectionNormalizationMetrics,
  } = applyProjectionEnergyNormalization({
    entries: resonantEntries,
    layer: "resonant",
    modalObserverMetrics,
    hardSilentFrame,
    highQResonantTopologySignal,
    resolveDisplayAmplitude: getDisplayAmplitude,
    getModalObserverProfile,
  });

  writeShortlistedEntries(
    state.displaySourceCoupled,
    displaySourceCoupledEntries,
    sourceCoupledCapacity,
    (entry) => entry.displayAmplitude ?? getDisplayAmplitude(entry, "source-coupled"),
    colorContext,
  );
  writeShortlistedEntries(
    state.displayResonant,
    displayResonantEntries,
    resonantCapacity,
    (entry) => entry.displayAmplitude ?? getDisplayAmplitude(entry, "resonant"),
    colorContext,
  );
  writeShortlistedEntries(
    state.resonantProjection,
    signalResonantProjectionEntries,
    resonantCapacity,
    (entry) => entry.displayAmplitude ?? getDisplayAmplitude(entry, "resonant"),
    colorContext,
  );

  const resonantAssistNeedsFreshAdmission =
    assistNeedsReservedAdmission &&
    mergedFastResonantAssist &&
    !hasVisibleModeKey(state.blendResonant.slots, mergedFastResonantAssist.modeKey);
  const detectedResonantDisplayContinuityPresence = hardSilentFrame
    ? 0
    : Math.max(
        getResonantDisplayContinuityPresence(
          state.blendResonant.slots,
          state.activeModes,
          resonantCapacity,
        ),
        getResonantDisplayContinuityPresence(
          state.blendResonant.slots,
          state.observedModes,
          resonantCapacity,
        ),
      );
  state.resonantDisplayContinuityPresence = hardSilentFrame
    ? 0
    : Math.max(
        detectedResonantDisplayContinuityPresence,
        (state.resonantDisplayContinuityPresence ?? 0) *
          EXCITATION_RESONANT_CONTINUITY_PRESENCE_RELEASE,
      );
  const hasResonantDisplayContinuity =
    state.resonantDisplayContinuityPresence >=
    RESONANT_DISPLAY_CONTINUITY_MIN_PRESENCE;
  const resonantSignalCoverage = computeSignalCoverageByVisibleKeys(
    state.blendResonant.slots,
    state.resonantProposal.slots,
    resonantCapacity,
  );
  const resonantVisibleAmplitude = sumSlotAmplitudes(state.blendResonant.slots);
  const resonantStalePressure = computeStaleResonantPressure({
    visibleSlots: state.blendResonant.slots,
    targetSlots: state.resonantProposal.slots,
    capacity: resonantCapacity,
  });
  const resonantTargetShifted =
    resonantSignalCoverage < EXCITATION_RESONANT_SIGNAL_COVERAGE_MIN &&
    resonantVisibleAmplitude >=
      EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE &&
    resonantStalePressure >=
      EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_STALE_PRESSURE;
  const resonantFreshSignalShifted =
    (resonantVisibleAmplitude >=
      EXCITATION_RESONANT_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE &&
      hasStrongFreshResonantSignal({
        visibleSlots: state.blendResonant.slots,
        signalSlots: state.resonantProposal.slots,
        capacity: resonantCapacity,
      })) ||
    (resonantProjectionSwitch &&
      rawDisplayResonantEntries.length > 0 &&
      resonantVisibleAmplitude >=
        EXCITATION_RESONANT_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE);
  const resonantFastAssistShifted =
    resonantAssistNeedsFreshAdmission &&
    resonantVisibleAmplitude >=
      EXCITATION_RESONANT_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE;
  const highQResonantSignalAuthoritative = false;
  const modalResponseResonantSignalAuthoritative =
    (modalResponseMetrics?.modalResponseEnergy ?? 0) > 0.08 &&
    rawDisplayResonantEntries.length > 0 &&
    resonantStalePressure > 0;
  const resonantSignalAuthoritative =
    resonantTargetShifted ||
    resonantFreshSignalShifted ||
    resonantFastAssistShifted ||
    modalResponseResonantSignalAuthoritative ||
    highQResonantSignalAuthoritative;
  const resonantSignalAuthoritativeReason = resonantFreshSignalShifted
    ? "fresh-signal"
    : resonantTargetShifted
      ? "coverage"
    : resonantFastAssistShifted
      ? "fast-assist"
      : modalResponseResonantSignalAuthoritative
        ? "modal-response"
        : highQResonantSignalAuthoritative
          ? "resonant-authority"
          : "none";
  const highQCoverageShifted =
    resonantVisibleAmplitude >=
      EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE &&
    resonantSignalCoverage >= EXCITATION_RESONANT_SIGNAL_COVERAGE_MIN &&
    resonantSignalCoverage < EXCITATION_HIGH_Q_SIGNAL_COVERAGE_MIN &&
    (modalObserverMetrics.highQObservedDrive ?? 0) >= 0.075;
  const highQSignalShifted =
    highQResonantSignalAuthoritative &&
    ((resonantVisibleAmplitude >=
      EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE &&
      resonantStalePressure >=
        EXCITATION_RESONANT_SIGNAL_AUTHORITY_MIN_STALE_PRESSURE) ||
      highQCoverageShifted);
  const resonantUsesSignalProjection =
    resonantTargetShifted ||
    resonantFreshSignalShifted ||
    resonantFastAssistShifted ||
    highQSignalShifted;
  const resonantBlendTargetSlots = resonantUsesSignalProjection
    ? state.resonantProjection.slots
    : state.displayResonant.slots;
  const resonantBlendReferenceSlots = resonantUsesSignalProjection
    ? state.resonantProjection.referenceSlots
    : state.displayResonant.referenceSlots;
  const resonantBlendColorSlots = resonantUsesSignalProjection
    ? state.resonantProjection.colorSlots
    : state.displayResonant.colorSlots;
  const projectionNormalizationMetrics = mergeProjectionNormalizationMetrics(
    sourceCoupledProjectionNormalizationMetrics,
    resonantUsesSignalProjection
      ? signalResonantProjectionNormalizationMetrics
      : resonantProjectionNormalizationMetrics,
  );
  const resonantShiftReleaseOverrides = resonantSignalAuthoritative
    ? buildStaleResonantReleaseOverrides({
        visibleSlots: state.blendResonant.slots,
        targetSlots: resonantBlendTargetSlots,
        capacity: resonantCapacity,
        release: EXCITATION_RESONANT_SHIFT_STALE_RELEASE,
      })
    : null;
  const resonantShiftTrackingOverrides = resonantSignalAuthoritative
    ? buildStaleResonantTrackingOverrides({
        visibleSlots: state.blendResonant.slots,
        targetSlots: resonantBlendTargetSlots,
        capacity: resonantCapacity,
        tracking: EXCITATION_RESONANT_SHIFT_STALE_TRACKING,
      })
    : null;

  return {
    displaySourceCoupledEntries,
    displayResonantEntries,
    hasResonantDisplayContinuity,
    resonantAssistNeedsFreshAdmission,
    resonantSignalCoverage,
    resonantStalePressure,
    resonantTargetShifted,
    resonantFreshSignalShifted,
    resonantFastAssistShifted,
    highQResonantSignalAuthoritative,
    modalResponseResonantSignalAuthoritative,
    resonantSignalAuthoritative,
    resonantSignalAuthoritativeReason,
    resonantBlendTargetSlots,
    resonantBlendReferenceSlots,
    resonantBlendColorSlots,
    resonantShiftReleaseOverrides,
    resonantShiftTrackingOverrides,
    projectionNormalizationMetrics,
  };
}

function deriveHighQTopologySignal({
  modalObserverMetrics,
  observedHighQModesAged,
}) {
  const highQSparseResonatorAuthority = clamp01(
    modalObserverMetrics.highQSparseResonatorAuthority ?? 0,
  );
  const perModeSupported =
    (modalObserverMetrics.highQObservedSnr ?? 0) >= 0.55 ||
    (modalObserverMetrics.highQObservedDrive ?? 0) >= 0.06 ||
    (modalObserverMetrics.highQRingSupport ?? 0) >= HIGH_Q_RESONANT_MIN_RING_SUPPORT;
  return modalObserverMetrics.highQRingSupport > 0 &&
    modalObserverMetrics.highQResonantModeCount > 0 &&
    modalObserverMetrics.highQResonantEnergy >=
      HIGH_Q_RESONANT_MIN_RETAINED_ENERGY &&
    observedHighQModesAged &&
    perModeSupported &&
    highQSparseResonatorAuthority >= 0.08
    ? Math.max(
        modalObserverMetrics.highQRingSupport,
        HIGH_Q_RESONANT_MIN_RING_SUPPORT,
      ) * highQSparseResonatorAuthority
    : 0;
}

function createLayerStateSummary(
  entries,
  periodicity,
  tonalness,
  layer,
  colorContext,
) {
  const dominant = entries[0] ?? null;
  const harmonicSupport = buildHarmonicSupport(
    entries,
    layer === "source-coupled" ? (dominant?.naturalFrequencyHz ?? 0) : 0,
  );
  return {
    uniqueModeCount: entries.length,
    harmonicSupport,
    fundamental: dominant?.naturalFrequencyHz ?? 0,
    fundamentalConfidence: dominant?.coherence ?? 0,
    analysisEngine: "modal-excitation",
    driverFrequency: dominant?.naturalFrequencyHz ?? 0,
    candidateFrequency: dominant?.naturalFrequencyHz ?? 0,
    candidateConfidence: dominant?.coherence ?? 0,
    candidateFrames: Math.round((dominant?.ageMs ?? 0) / 33),
    candidatePeriodicity: periodicity,
    candidateHarmonicSupport: average(Array.from(harmonicSupport)),
    candidateDirectSupport: dominant?.driveEnergy ?? 0,
    candidateLowEnergy: (dominant?.amplitude ?? 0) < 0.08,
    voicingActive: periodicity > 0.25 && tonalness > 0.2,
    highCandidateRejected: false,
    rejectionReason: "none",
    latchHoldFrames: 0,
    latchLowSupportFrames: 0,
    spectralLightComponents: entries.slice(0, 6).map((entry) =>
      createEntrySpectralLightComponent(entry, {
        ...colorContext,
        tonalness,
      }),
    ),
  };
}

function buildModalCandidateList(...entryGroups) {
  const rawCandidates = [];
  let totalProjectionEnergy = 0;

  for (const entries of entryGroups) {
    for (const entry of entries ?? []) {
      const storedEnergy = clamp01(
        entry?.storedEnergy ??
          entry?.retainedEnergy ??
          entry?.modalResponseEnergy ??
          entry?.amplitude ??
          0,
      );
      const forcingEnergy = clamp01(
        entry?.forcingEnergy ??
          entry?.currentDriveEnergy ??
          entry?.observedDrive ??
          entry?.driveEnergy ??
          0,
      );
      const observedSupport = clamp01(
        Math.max(
          entry?.observedSupport ?? 0,
          entry?.coherence ?? 0,
          entry?.phaseAuthority ?? 0,
          entry?.phaseCoherence ?? 0,
          forcingEnergy,
        ),
      );
      const qualityFactor = Math.max(
        0.5,
        Number.isFinite(entry?.qualityFactor) ? entry.qualityFactor : 1,
      );
      const candidate = {
        modeKey: entry?.modeKey ?? buildModeKey(entry?.u, entry?.v, entry?.w),
        u: entry?.u ?? 0,
        v: entry?.v ?? 0,
        w: entry?.w ?? 0,
        naturalFrequencyHz: entry?.naturalFrequencyHz ?? 0,
        qualityFactor,
        dampingRatio: 1 / (2 * qualityFactor),
        forcingEnergy,
        storedEnergy,
        observedSupport,
        phaseOffsetRad: entry?.phaseOffsetRad ?? entry?.phase ?? 0,
        angularVelocityRadPerSec:
          entry?.phaseVelocityRadPerSec ??
          entry?.oscillatorAngularVelocityRadPerSec ??
          0,
        phaseCoherence: clamp01(entry?.phaseCoherence ?? 0),
        phaseAuthority: clamp01(entry?.phaseAuthority ?? 0),
        colorEvidence: entry?.spectralLightColor ?? entry?.color ?? null,
        projectionWeight: 0,
        rejectionReasons: Array.isArray(entry?.rejectionReasons)
          ? [...entry.rejectionReasons]
          : [],
      };
      rawCandidates.push(candidate);
      totalProjectionEnergy += candidate.storedEnergy * candidate.observedSupport;
    }
  }

  if (totalProjectionEnergy > 0) {
    for (const candidate of rawCandidates) {
      candidate.projectionWeight = clamp01(
        (candidate.storedEnergy * candidate.observedSupport) /
          totalProjectionEnergy,
      );
    }
  }

  return rawCandidates;
}

export function getAtlasCacheSize() {
  return MODE_ATLAS_CACHE.size;
}

export { computeDrivePeriodicity };
export { createModalExcitationState };

export function buildModalExcitationStructuralState({
  preparedInputs,
  fastSignalState,
  existingState,
  performanceNow = () => 0,
}) {
  const state =
    existingState && existingState.capacity === preparedInputs.capacity
      ? existingState
      : createModalExcitationState(preparedInputs.capacity);
  const atlas = buildModeAtlas({
    radius: preparedInputs.radius,
    cavityGeometry: preparedInputs.effectiveCavityGeometry,
    cavityAcousticScale: preparedInputs.cavityAcousticScale,
    boundaryMode: preparedInputs.boundaryMode,
  });
  state.atlasEntries = atlas;
  const stateAcousticRadius = Number.isFinite(
    preparedInputs.cavityAcousticScale?.radiusMeters,
  )
    ? preparedInputs.cavityAcousticScale.radiusMeters
    : preparedInputs.radius;
  state.atlasCacheKey = [
    preparedInputs.effectiveCavityGeometry,
    preparedInputs.boundaryMode ?? "legacy",
    Number.isFinite(stateAcousticRadius)
      ? stateAcousticRadius.toFixed(3)
      : "unknown",
    Number.isFinite(preparedInputs.cavityAcousticScale?.soundSpeedMetersPerSecond)
      ? preparedInputs.cavityAcousticScale.soundSpeedMetersPerSecond.toFixed(3)
      : "1480.000",
    preparedInputs.cavityAcousticScale?.subfloorPolicy ?? "project-subfundamental",
  ].join(":");
  clearLayerBuffers(state.sourceCoupledProposal);
  clearLayerBuffers(state.resonantProposal);
  clearLayerBuffers(state.displaySourceCoupled);
  clearLayerBuffers(state.displayResonant);
  clearLayerBuffers(state.resonantProjection);

  const startedAt = performanceNow();
  const {
    buffer: driveBuffer,
    peak: drivePeak,
    driveSource,
  } = computeDriveBuffer(preparedInputs, fastSignalState);
  const strictHardSilentFrame = isHardSilentFrame(preparedInputs);
  const periodicity = computeDrivePeriodicity(
    driveBuffer,
    preparedInputs.sampleRate,
  );
  const flatness = computeSpectralFlatness(fastSignalState.fftMagnitudes);
  const tonalness = clamp01(1 - flatness * 1.1);
  const distributedExcitation = clamp01(
    fastSignalState.trebleBroadbandEnergy * 0.62 + flatness * 0.38,
  );
  const dominantDriveFrequencyHz = estimateDominantSpectralFrequency(
    fastSignalState.fftMagnitudes,
    preparedInputs.sampleRate,
  );
  const dominantDriveSpectralSupport =
    dominantDriveFrequencyHz > 0
      ? sampleFFTAmplitudeForFrequency(
          dominantDriveFrequencyHz,
          fastSignalState.fftMagnitudes,
          preparedInputs.sampleRate,
          preparedInputs.fftSize,
        )
      : 0;
  const allowBassHarmonicDriver =
    !preparedInputs.bandState?.liveInputCalibrationActive;
  const resonantBandPeak = computeSpectralPeakInRange(
    fastSignalState.fftMagnitudes,
    preparedInputs.sampleRate,
    RESONANT_MIN_HZ,
    RESONANT_MAX_HZ,
  );
  const resonantBandHarmonicSupport = computeResonantBandHarmonicSupport({
    fftMagnitudes: fastSignalState.fftMagnitudes,
    sampleRate: preparedInputs.sampleRate,
    dominantFrequencyHz: dominantDriveFrequencyHz,
  });
  const deltaMs = Math.max(
    16,
    preparedInputs.currentFrameAtMs -
      (state.lastFrameAtMs ?? preparedInputs.currentFrameAtMs - 16),
  );
  state.lastFrameAtMs = preparedInputs.currentFrameAtMs;
  const sourceCoupledCapacity = state.sourceCoupledProposal.slots.length / 4;
  const resonantCapacity = state.resonantProposal.slots.length / 4;
  let modalObserverMetrics = updateObservedModalModes({
    state,
    atlas,
    driveBuffer,
    fastSignalState,
    preparedInputs,
    drivePeak,
    periodicity,
    tonalness,
    distributedExcitation,
    strictHardSilentFrame,
    dominantDriveFrequencyHz,
    dominantDriveSpectralSupport,
    deltaMs,
    driveSource,
    capacities: {
      sourceCoupled: sourceCoupledCapacity,
      resonant: resonantCapacity,
    },
  });
  modalObserverMetrics = appendHighQSparseAuthority({
    modalObserverMetrics,
    distributedExcitation,
    periodicity,
    fftMagnitudes: fastSignalState.fftMagnitudes,
  });
  const observedTailActivity =
    (modalObserverMetrics.highQResonantModeCount >=
      HIGH_Q_OBSERVER_MIN_MODE_COUNT &&
      modalObserverMetrics.highQResonantEnergy >=
        HIGH_Q_RESONANT_MIN_RETAINED_ENERGY &&
      modalObserverMetrics.highQRingSupport > 0 &&
      hasObservedLayerDrive(modalObserverMetrics, "resonant")) ||
    (modalObserverMetrics.lowQSourceCoupledModeCount >=
      LOW_Q_OBSERVER_MIN_MODE_COUNT &&
      modalObserverMetrics.lowQSourceCoupledEnergy >=
        LOW_Q_OBSERVER_MIN_RETAINED_ENERGY &&
      hasObservedLayerDrive(modalObserverMetrics, "source-coupled") &&
      modalObserverMetrics.lowQObservedCoherence >= 0.32);
  const previousSourceCoupledCouplingFrequencyHz =
    state.sourceCoupledCouplingFrequencyHz ?? 0;
  const sourceCoupledCouplingFrequencySwitch =
    previousSourceCoupledCouplingFrequencyHz > 0 &&
    dominantDriveFrequencyHz > 0 &&
    getRelativeFrequencyDistance(
      previousSourceCoupledCouplingFrequencyHz,
      dominantDriveFrequencyHz,
    ) > 0.12;
  const previousResonantCouplingFrequencyHz =
    state.resonantCouplingFrequencyHz ?? 0;
  const resonantCouplingFrequencySwitch =
    previousResonantCouplingFrequencyHz > 0 &&
    dominantDriveFrequencyHz > 0 &&
    getRelativeFrequencyDistance(
      previousResonantCouplingFrequencyHz,
      dominantDriveFrequencyHz,
    ) > 0.08;
  const previousModalResponseEnergies = buildPreviousModalResponseEnergies(
    state,
    {
      resetSourceCoupled: sourceCoupledCouplingFrequencySwitch,
      resetResonant: resonantCouplingFrequencySwitch,
    },
  );
  const modalResponse = updateModalResponseFrame({
    modes: atlas,
    fftMagnitudes: fastSignalState.fftMagnitudes,
    sampleRate: preparedInputs.sampleRate,
    previousEnergies: previousModalResponseEnergies,
    deltaMs,
    inputRms: preparedInputs.analyserRms,
    hardSilence: strictHardSilentFrame,
    coherence: Math.max(tonalness, periodicity),
  });
  const currentRenderSourceEvidence = hasCurrentRenderSourceEvidence({
    strictHardSilentFrame,
    drivePeak,
    driveSource,
    periodicity,
    tonalness,
    distributedExcitation,
    modalResponseInputEnergy: modalResponse.modalResponseInputEnergy,
  });
  const renderAuthorityCut = updateRenderAuthorityCutState({
    state,
    literalZeroSourceFrame: isLiteralZeroSourceFrame(preparedInputs),
    strictHardSilentFrame,
    currentRenderSourceEvidence,
    deltaMs,
  });
  const hardSilentFrame =
    strictHardSilentFrame &&
    !observedTailActivity &&
    !(modalResponse.modalResponseEnergy > 0);
  const modalResponseByMode = mapModalResponseEntries(modalResponse);
  const chromaState = preparedInputs.featureState?.analysis?.chromaState ?? {};
  const colorContext = {
    spectralCentroid: fastSignalState.spectralCentroid,
    transientEnergy: fastSignalState.transientEnergy,
    trebleBroadbandEnergy: fastSignalState.trebleBroadbandEnergy,
    tonalness,
    auditToneFrequencyHz: preparedInputs.resolvedAuditSettings.injectTestTone
      ? preparedInputs.resolvedAuditSettings.testToneHz
      : 0,
    keyTonic: chromaState.keyTonic,
    keyMode: chromaState.keyMode,
    keyConfidence: chromaState.keyConfidence,
  };
  const previousResonantMaturity = state.resonantMaturity;
  const nextModes = new Map();
  const nextResonantMaturity = new Map();
  const excitedEntries = [];
  let lowOrderModalEnergy = 0;
  let highOrderModalEnergy = 0;
  let driveEnergyTotal = 0;
  let driveEnergySampleCount = 0;
  let persistenceTotal = 0;
  let coherenceTotal = 0;
  const coherentResonantCoupling = resonantCouplingFrequencySwitch
    ? 0
    : getCoherentResonantCoupling({
        tonalness,
        periodicity,
        distributedExcitation,
        resonantBandPeak,
        harmonicSupport: resonantBandHarmonicSupport,
        hardSilentFrame,
      });
  let observedResonantModesAged = hasAgedObservedLayerModes({
    modes: state.observedModes,
    layer: "resonant",
    currentFrameAtMs: preparedInputs.currentFrameAtMs,
    minAgeMs: HIGH_Q_RESONANT_AUTHORITY_MIN_AGE_MS,
  });
  let highQResonantTopologySignal = deriveHighQTopologySignal({
    modalObserverMetrics,
    observedHighQModesAged: observedResonantModesAged,
  });
  const highQResonantRetentionSignal =
    (state.observedModes?.size ?? 0) > 0 && highQResonantTopologySignal > 0
      ? highQResonantTopologySignal
      : 0;
  const retainedResonantObserverSignal = highQResonantRetentionSignal;
  state.resonantCouplingFrequencyHz =
    hardSilentFrame || resonantCouplingFrequencySwitch
      ? 0
      : dominantDriveFrequencyHz || previousResonantCouplingFrequencyHz;
  state.sourceCoupledCouplingFrequencyHz = hardSilentFrame
    ? 0
    : dominantDriveFrequencyHz || previousSourceCoupledCouplingFrequencyHz;

  for (const atlasEntry of atlas) {
    const modalResponseEntry = modalResponseByMode.get(atlasEntry.modeKey);
    const modalResponseEnergy = clamp01(
      modalResponseEntry?.modalResponseEnergy ?? 0,
    );
    const modalResponseDrive = clamp01(
      modalResponseEntry?.modalResponseDrive ?? 0,
    );
    const modalResponseDisplayAmplitude = clamp01(
      modalResponseEntry?.displayAmplitude ?? 0,
    );
    const response = computeModeResponse(
      driveBuffer,
      preparedInputs.sampleRate,
      atlasEntry.naturalFrequencyHz,
    );
    const spectralSupport = sampleFFTAmplitudeForFrequency(
      atlasEntry.naturalFrequencyHz,
      fastSignalState.fftMagnitudes,
      preparedInputs.sampleRate,
      preparedInputs.fftSize,
    );
    const rawTimeDomainModalDrive =
      drivePeak < 0.005
        ? 0
        : clamp01(
            response.magnitude * drivePeak * 1.9 +
              spectralSupport * 0.85 +
              fastSignalState.transientEnergy * 0.08,
          );
    const noiseSuppressedTimeDomainDrive =
      atlasEntry.layer === "resonant" &&
      distributedExcitation > 0.5 &&
      tonalness < 0.58 &&
      modalResponseDrive < 0.02
        ? 0
        : rawTimeDomainModalDrive;
    const modalResponseCurrentDrive = clamp01(
      modalResponseDrive * (atlasEntry.layer === "source-coupled" ? 0.82 : 1),
    );
    const weakFileSpectralFallbackNoise =
      preparedInputs.sourceMode === "file" &&
      driveSource === "spectral-fallback" &&
      preparedInputs.avgAmplitude < 10 &&
      preparedInputs.analyserRms < 0.02;
    const weakFileResonantNoise =
      atlasEntry.layer === "resonant" &&
      preparedInputs.sourceMode === "file" &&
      preparedInputs.avgAmplitude >= 5 &&
      preparedInputs.avgAmplitude < 10 &&
      preparedInputs.analyserRms < 0.03 &&
      dominantDriveFrequencyHz >= 400 &&
      modalResponseDrive < 0.16;
    const weakFileResonantModalResponseNoise =
      weakFileResonantNoise && modalResponseDrive < 0.2;
    const effectiveModalResponseDisplayAmplitude =
      weakFileResonantModalResponseNoise ? 0 : modalResponseDisplayAmplitude;
    const switchedAwayFromSourceCoupledMode =
      atlasEntry.layer === "source-coupled" &&
      sourceCoupledCouplingFrequencySwitch &&
      previousSourceCoupledCouplingFrequencyHz > 0 &&
      dominantDriveFrequencyHz > 0 &&
      getRelativeFrequencyDistance(
        atlasEntry.naturalFrequencyHz,
        previousSourceCoupledCouplingFrequencyHz,
      ) < 0.18 &&
      getRelativeFrequencyDistance(
        atlasEntry.naturalFrequencyHz,
        dominantDriveFrequencyHz,
      ) > 0.18;
    const sourceRetuneDriveScale = switchedAwayFromSourceCoupledMode ? 0.42 : 1;
    const directDriveEnergy = clamp01(
      weakFileSpectralFallbackNoise || weakFileResonantNoise
        ? 0
        : Math.max(
            modalResponseCurrentDrive,
            noiseSuppressedTimeDomainDrive * sourceRetuneDriveScale,
          ),
    );
    const coupledResonantDriveEnergy =
      atlasEntry.layer === "resonant"
        ? coherentResonantCoupling *
          getResonantHarmonicCoupling(
            atlasEntry.naturalFrequencyHz,
            dominantDriveFrequencyHz,
          ) *
          RESONANT_COUPLING_DRIVE *
          atlasEntry.driveWeight
        : 0;
    const driveEnergy = Math.max(directDriveEnergy, coupledResonantDriveEnergy);
    const coherenceTarget = clamp01(
      tonalness * 0.45 +
        periodicity * 0.4 +
        atlasEntry.driveWeight * 0.15 -
        distributedExcitation * 0.24 +
        modalResponseDrive * 0.12,
    );
    const observedPrevious =
      state.observedModes?.get(atlasEntry.modeKey) ?? null;
    const observedPreviousAged = isObservedModeAged(
      observedPrevious,
      preparedInputs.currentFrameAtMs,
    );
    const observedPreviousResonant =
      getModeRenderLayer(observedPrevious) === "resonant";
    const canUseObservedPrevious =
      observedPreviousAged &&
      !hardSilentFrame &&
      (atlasEntry.layer === "source-coupled"
        ? (observedPreviousResonant
            ? highQResonantRetentionSignal > 0
            : hasObservedLayerDrive(modalObserverMetrics, "source-coupled")) &&
          !sourceCoupledCouplingFrequencySwitch
        : highQResonantRetentionSignal > 0 && !resonantCouplingFrequencySwitch);
    const activePrevious =
      (resonantCouplingFrequencySwitch && atlasEntry.layer === "resonant") ||
      (sourceCoupledCouplingFrequencySwitch && atlasEntry.layer === "source-coupled")
        ? null
        : (state.activeModes.get(atlasEntry.modeKey) ?? null);
    const activePreviousIsCurrentProposal =
      !!activePrevious &&
      (observedPrevious != null ||
        modalResponseEnergy >= MIN_RESONATOR_AMPLITUDE ||
        driveEnergy >=
          (atlasEntry.layer === "source-coupled"
            ? SOURCE_COUPLED_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY
            : RESONANT_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY));
    const previous = canUseObservedPrevious
      ? observedPrevious
      : activePreviousIsCurrentProposal
        ? activePrevious
        : null;
    const decay = Math.exp(-deltaMs / atlasEntry.decayTauMs);
    const carryAuthorityEntry =
      previous?.observedModal === true ? previous : observedPrevious;
    const carriedAmplitude =
      (previous?.amplitude ?? 0) *
      decay *
      getObservedCarryAmplitudeScale(carryAuthorityEntry, atlasEntry.layer);
    const injectedAmplitude =
      driveEnergy *
      atlasEntry.driveWeight *
      (atlasEntry.layer === "source-coupled" ? 0.92 : 0.78) *
      (0.35 + coherenceTarget * 0.65);
    const rawAmplitude =
      carriedAmplitude +
      injectedAmplitude * (1 - carriedAmplitude * SATURATION_FACTOR);
    const resonantDisplayContinuity = shouldApplyResonantDisplayContinuity({
      atlasEntry,
      previous,
      driveEnergy,
      hardSilentFrame,
      resonantDisplayContinuityPresence: state.resonantDisplayContinuityPresence,
      resonantObserverContinuitySignal: Math.max(
        retainedResonantObserverSignal,
        modalResponse.modalResponseEnergy,
      ),
    });
    const subtleResonantDisplayContinuity =
      resonantDisplayContinuity &&
      driveEnergy < RESONANT_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY &&
      retainedResonantObserverSignal > 0;
    const sourceCoupledDisplayContinuity = shouldApplySourceCoupledDisplayContinuity({
      atlasEntry,
      previous,
      driveEnergy,
      hardSilentFrame,
    });
    const resonantDisplayContinuityPresence = resonantDisplayContinuity
      ? subtleResonantDisplayContinuity
        ? Math.max(
            getSustainedResonantPresence(previous),
            state.resonantDisplayContinuityPresence ?? 0,
            previous?.resonantMaturity ?? 0,
          ) * retainedResonantObserverSignal
        : Math.max(
            getSustainedResonantPresence(previous),
            state.resonantDisplayContinuityPresence ?? 0,
          )
      : 0;
    const sourceCoupledDisplayContinuityPresence = sourceCoupledDisplayContinuity
      ? Math.max(previous?.amplitude ?? 0, previous?.retainedEnergy ?? 0) *
        Math.max(0.35, previous?.coherence ?? 0)
      : 0;
    const displayContinuityMode =
      resonantDisplayContinuity || sourceCoupledDisplayContinuity;
    const minimumResonatorAmplitude = displayContinuityMode
      ? MIN_DISPLAY_CONTINUITY_RESONATOR_AMPLITUDE
      : MIN_RESONATOR_AMPLITUDE;
    const amplitude = clamp01(
      displayContinuityMode
        ? Math.max(rawAmplitude, MIN_DISPLAY_CONTINUITY_RESONATOR_AMPLITUDE)
        : rawAmplitude,
    );
    if (amplitude < minimumResonatorAmplitude) {
      continue;
    }

    const coherence = clamp01(
      (previous?.coherence ?? coherenceTarget) * (1 - COHERENCE_BLEND_ALPHA) +
        coherenceTarget * COHERENCE_BLEND_ALPHA,
    );
    const persistenceTarget =
      amplitude > 1e-6 ? clamp01(carriedAmplitude / amplitude) : 0;
    const persistence = clamp01(
      (previous?.persistence ?? persistenceTarget) *
        (1 - PERSISTENCE_BLEND_ALPHA) +
        persistenceTarget * PERSISTENCE_BLEND_ALPHA,
    );
    const sustainedPresence = getSustainedResonantPresence({
      ...atlasEntry,
      amplitude,
      currentDriveEnergy: driveEnergy,
      driveEnergy:
        (previous?.driveEnergy ?? driveEnergy) * (1 - DRIVE_BLEND_ALPHA) +
        driveEnergy * DRIVE_BLEND_ALPHA,
      coherence,
      persistence,
    });
    const resonantMaturity =
      atlasEntry.layer === "resonant"
        ? getNextResonantMaturity({
            previousMaturity: Math.max(
              previousResonantMaturity?.get(atlasEntry.modeKey) ?? 0,
              previous?.resonantMaturity ?? 0,
            ),
            sustainedPresence,
            driveEnergy,
            hardSilentFrame,
          })
        : 1;
    const modalOscillatorAngularVelocityRadPerSec =
      modalResponseEntry?.oscillatorAngularVelocityRadPerSec;
    const modalOscillatorPhaseRad = Number.isFinite(
      modalResponseEntry?.oscillatorPhaseRad,
    )
      ? modalResponseEntry.oscillatorPhaseRad
      : response.phase;
    const modalOscillatorPhaseOffsetRad = Number.isFinite(
      modalOscillatorAngularVelocityRadPerSec,
    )
      ? normalizePhaseRad(
          modalOscillatorPhaseRad -
            modalOscillatorAngularVelocityRadPerSec *
              (preparedInputs.currentFrameAtMs / 1000),
        )
      : undefined;
    const modalOscillatorPhaseAuthority = clamp01(
      modalResponseEntry?.oscillatorPhaseAuthority ?? modalResponseEnergy,
    );
    const modalOscillatorPhaseCoherence = clamp01(
      modalResponseEntry?.oscillatorPhaseCoherence ??
        Math.max(coherence, modalResponseDrive),
    );
    const entry = {
      ...atlasEntry,
      amplitude,
      currentDriveEnergy: driveEnergy,
      driveEnergy:
        (previous?.driveEnergy ?? driveEnergy) * (1 - DRIVE_BLEND_ALPHA) +
        driveEnergy * DRIVE_BLEND_ALPHA,
      phase: modalOscillatorPhaseRad,
      modalResponseDrive,
      modalResponseEnergy,
      modalResponseDisplayAmplitude: effectiveModalResponseDisplayAmplitude,
      modalResponseBudgetScale:
        modalResponseEntry?.modalResponseBudgetScale ??
        modalResponse.modalResponseBudgetScale ??
        1,
      modalResponseInputEnergy: modalResponse.modalResponseInputEnergy,
      weakResonantNoise: weakFileResonantModalResponseNoise,
      oscillatorPhaseRad: modalResponseEntry?.oscillatorPhaseRad,
      oscillatorAngularVelocityRadPerSec:
        modalResponseEntry?.oscillatorAngularVelocityRadPerSec,
      signedModalCoefficient: modalResponseEntry?.signedModalCoefficient,
      modalOscillatorPhaseRad,
      modalOscillatorPhaseOffsetRad,
      modalOscillatorAngularVelocityRadPerSec,
      modalOscillatorPhaseObservedAtSec:
        preparedInputs.currentFrameAtMs / 1000,
      modalOscillatorPhaseAuthority,
      modalOscillatorPhaseCoherence,
      hardSilentFrame: strictHardSilentFrame,
      sourceAmplitude: updateObservedSourceAmplitude(previous, drivePeak),
      coherence,
      persistence,
      resonantMaturity,
      resonantDisplayContinuity,
      subtleResonantDisplayContinuity,
      resonantDisplayContinuityPresence,
      sourceCoupledDisplayContinuity,
      sourceCoupledDisplayContinuityPresence,
      lastExcitedAtMs:
        driveEnergy > MIN_RESONATOR_AMPLITUDE
          ? preparedInputs.currentFrameAtMs
          : (previous?.lastExcitedAtMs ?? preparedInputs.currentFrameAtMs),
      ageMs: (previous?.ageMs ?? 0) + deltaMs,
    };
    nextModes.set(entry.modeKey, entry);
    if (entry.layer === "resonant") {
      nextResonantMaturity.set(entry.modeKey, resonantMaturity);
    }
    excitedEntries.push(entry);
    driveEnergyTotal += entry.driveEnergy;
    driveEnergySampleCount += 1;
    persistenceTotal += entry.persistence;
    coherenceTotal += entry.coherence;
    if (entry.layer === "source-coupled") {
      lowOrderModalEnergy += Math.max(entry.amplitude, modalResponseEnergy);
    } else {
      highOrderModalEnergy += Math.max(entry.amplitude, modalResponseEnergy);
    }
  }

  state.activeModes = nextModes;
  state.resonantMaturity = hardSilentFrame ? new Map() : nextResonantMaturity;
  excitedEntries.sort(
    (left, right) =>
      right.amplitude * Math.max(0.15, right.coherence) -
      left.amplitude * Math.max(0.15, left.coherence),
  );
  if (!strictHardSilentFrame) {
    modalObserverMetrics = mergeExcitedObservedModes({
      state,
      excitedEntries,
      capacities: {
        sourceCoupled: sourceCoupledCapacity,
        resonant: resonantCapacity,
      },
      currentFrameAtMs: preparedInputs.currentFrameAtMs,
      drivePeak,
      periodicity,
      tonalness,
      distributedExcitation,
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
    });
  }
  modalObserverMetrics = appendHighQSparseAuthority({
    modalObserverMetrics,
    distributedExcitation,
    periodicity,
    fftMagnitudes: fastSignalState.fftMagnitudes,
  });
  observedResonantModesAged = hasAgedObservedLayerModes({
    modes: state.observedModes,
    layer: "resonant",
    currentFrameAtMs: preparedInputs.currentFrameAtMs,
    minAgeMs: HIGH_Q_RESONANT_AUTHORITY_MIN_AGE_MS,
  });
  highQResonantTopologySignal = deriveHighQTopologySignal({
    modalObserverMetrics,
    observedHighQModesAged: observedResonantModesAged,
  });

  const displaySourceCoupledEntries = buildSignalShortlist(
    excitedEntries,
    "source-coupled",
    preparedInputs.currentFrameAtMs,
    sourceCoupledCapacity,
  );
  const displayResonantEntries = buildSignalShortlist(
    excitedEntries,
    "resonant",
    preparedInputs.currentFrameAtMs,
    resonantCapacity,
  );
  const signalSourceCoupledEntries = strictHardSilentFrame
    ? []
    : displaySourceCoupledEntries;
  const signalResonantEntries = strictHardSilentFrame ? [] : displayResonantEntries;
  const fastResonantAssist = selectFastResonantAssist(
    signalResonantEntries,
    preparedInputs.currentFrameAtMs,
  );

  writeShortlistedEntries(
    state.sourceCoupledProposal,
    signalSourceCoupledEntries,
    sourceCoupledCapacity,
    (entry) =>
      entry.signalAmplitude ?? entry.currentDriveEnergy ?? entry.driveEnergy,
    colorContext,
  );
  writeShortlistedEntries(
    state.resonantProposal,
    signalResonantEntries,
    resonantCapacity,
    (entry) =>
      entry.signalAmplitude ?? entry.currentDriveEnergy ?? entry.driveEnergy,
    colorContext,
  );
  const projection = buildModalProjection({
    state,
    sourceCoupledEntries: displaySourceCoupledEntries,
    resonantEntries: displayResonantEntries,
    fastResonantAssist,
    hardSilentFrame,
    sourceCoupledProjectionSwitch: sourceCoupledCouplingFrequencySwitch,
    resonantProjectionSwitch: resonantCouplingFrequencySwitch,
    sourceCoupledCapacity,
    resonantCapacity,
    colorContext,
    modalObserverMetrics,
    highQResonantTopologySignal,
    modalResponseMetrics: modalResponse,
  });
  const {
    hasResonantDisplayContinuity,
    resonantAssistNeedsFreshAdmission,
    resonantSignalCoverage,
    resonantStalePressure,
    resonantTargetShifted,
    resonantFreshSignalShifted,
    resonantFastAssistShifted,
    highQResonantSignalAuthoritative,
    modalResponseResonantSignalAuthoritative,
    resonantSignalAuthoritative,
    resonantSignalAuthoritativeReason,
    resonantBlendTargetSlots,
    resonantBlendReferenceSlots,
    resonantBlendColorSlots,
    resonantShiftReleaseOverrides,
    resonantShiftTrackingOverrides,
    projectionNormalizationMetrics,
  } = projection;

  const observedSourceCoupledContinuity =
    !hardSilentFrame &&
    !sourceCoupledCouplingFrequencySwitch &&
    modalObserverMetrics.lowQSourceCoupledModeCount >=
      LOW_Q_OBSERVER_MIN_MODE_COUNT &&
    modalObserverMetrics.lowQSourceCoupledEnergy >=
      LOW_Q_OBSERVER_MIN_RETAINED_ENERGY;
  blendModalStack(
    state.blendSourceCoupled,
    state.displaySourceCoupled.slots,
    sourceCoupledCapacity,
    {
      attack: EXCITATION_SOURCE_COUPLED_BLEND_ATTACK,
      tracking: EXCITATION_SOURCE_COUPLED_BLEND_TRACKING,
      release: observedSourceCoupledContinuity
        ? EXCITATION_SOURCE_COUPLED_OBSERVED_CONTINUITY_RELEASE
        : EXCITATION_SOURCE_COUPLED_BLEND_RELEASE,
      emptyTargetRelease: observedSourceCoupledContinuity
        ? EXCITATION_SOURCE_COUPLED_OBSERVED_CONTINUITY_EMPTY_RELEASE
        : EXCITATION_SOURCE_COUPLED_SILENCE_RELEASE,
      lowSignalReleaseThreshold:
        EXCITATION_SOURCE_COUPLED_LOW_SIGNAL_RELEASE_THRESHOLD,
      lowSignalRelease: observedSourceCoupledContinuity
        ? EXCITATION_SOURCE_COUPLED_OBSERVED_CONTINUITY_LOW_SIGNAL_RELEASE
        : EXCITATION_SOURCE_COUPLED_LOW_SIGNAL_RELEASE,
      retainReleased: !hardSilentFrame,
      freshCap: EXCITATION_SOURCE_COUPLED_FRESH_CAP,
    },
  );
  if (resonantCouplingFrequencySwitch && resonantSignalAuthoritative) {
    clearLayerBuffers(state.blendResonant);
  }
  blendModalStack(state.blendResonant, resonantBlendTargetSlots, resonantCapacity, {
    attack:
      resonantSignalAuthoritative || modalResponseResonantSignalAuthoritative
        ? EXCITATION_RESONANT_SHIFT_BLEND_ATTACK
        : EXCITATION_RESONANT_BLEND_ATTACK,
    tracking:
      modalResponseResonantSignalAuthoritative || highQResonantSignalAuthoritative
        ? EXCITATION_RESONANT_RESPONSE_ENVELOPE_TRACKING
        : EXCITATION_RESONANT_BLEND_TRACKING,
    release: hasResonantDisplayContinuity
      ? EXCITATION_RESONANT_CONTINUITY_RELEASE
      : EXCITATION_RESONANT_BLEND_RELEASE,
    emptyTargetRelease: hasResonantDisplayContinuity
      ? EXCITATION_RESONANT_CONTINUITY_EMPTY_RELEASE
      : EXCITATION_RESONANT_SILENCE_RELEASE,
    lowSignalReleaseThreshold: EXCITATION_RESONANT_LOW_SIGNAL_RELEASE_THRESHOLD,
    lowSignalRelease: hasResonantDisplayContinuity
      ? EXCITATION_RESONANT_CONTINUITY_LOW_SIGNAL_RELEASE
      : EXCITATION_RESONANT_LOW_SIGNAL_RELEASE,
    trackingOverrides: resonantShiftTrackingOverrides,
    releaseOverrides: resonantShiftReleaseOverrides,
    retainReleased: !hardSilentFrame,
    freshCap: Math.min(
      resonantCapacity,
      EXCITATION_RESONANT_FRESH_CAP +
        (resonantAssistNeedsFreshAdmission ? 1 : 0),
    ),
  });

  if (
    preparedInputs.shouldBuildSpectralLight &&
    !state.previousShouldBuildSpectralLight
  ) {
    clearBlendColorState(state.blendSourceCoupled);
    clearBlendColorState(state.blendResonant);
  }

  if (preparedInputs.shouldBuildSpectralLight) {
    blendColorStack(
      state.blendSourceCoupled,
      state.displaySourceCoupled.slots,
      state.displaySourceCoupled.colorSlots,
      sourceCoupledCapacity,
      {
        attack: EXCITATION_SOURCE_COUPLED_BLEND_ATTACK,
        tracking: EXCITATION_SOURCE_COUPLED_BLEND_TRACKING,
        release: EXCITATION_SOURCE_COUPLED_BLEND_RELEASE,
      },
    );
    blendColorStack(
      state.blendResonant,
      resonantBlendTargetSlots,
      resonantBlendColorSlots,
      resonantCapacity,
      {
        attack: resonantSignalAuthoritative
          ? EXCITATION_RESONANT_SHIFT_BLEND_ATTACK
          : EXCITATION_RESONANT_BLEND_ATTACK,
        tracking: EXCITATION_RESONANT_BLEND_TRACKING,
        release: EXCITATION_RESONANT_BLEND_RELEASE,
      },
    );
  }
  state.previousShouldBuildSpectralLight = Boolean(
    preparedInputs.shouldBuildSpectralLight,
  );

  remapReferenceToBlendedOrder(
    state.blendSourceCoupled.slots,
    state.displaySourceCoupled.referenceSlots,
    sourceCoupledCapacity,
    state.remappedSourceCoupledRef,
  );
  remapReferenceToBlendedOrder(
    state.blendResonant.slots,
    resonantBlendReferenceSlots,
    resonantCapacity,
    state.remappedResonantRef,
  );
  remapReferenceToBlendedOrder(
    state.sourceCoupledProposal.slots,
    state.previousSignalSourceCoupledSlots,
    sourceCoupledCapacity,
    state.remappedSignalSourceCoupledRef,
  );
  remapReferenceToBlendedOrder(
    state.resonantProposal.slots,
    state.previousSignalResonantSlots,
    resonantCapacity,
    state.remappedSignalResonantRef,
  );
  const sourceCoupledPhaseModeCount = writePhaseSlotsForVisibleModes({
    target: state.blendSourceCoupled.phaseSlots,
    visibleSlots: state.blendSourceCoupled.slots,
    capacity: sourceCoupledCapacity,
    activeModes: state.activeModes,
    observedModes: state.observedModes,
  });
  const resonantPhaseModeCount = writePhaseSlotsForVisibleModes({
    target: state.blendResonant.phaseSlots,
    visibleSlots: state.blendResonant.slots,
    capacity: resonantCapacity,
    activeModes: state.activeModes,
    observedModes: state.observedModes,
  });

  const blendedSourceCoupledCount = countActiveSlots(
    state.blendSourceCoupled.slots,
    sourceCoupledCapacity,
  );
  const blendedResonantCount = countActiveSlots(
    state.blendResonant.slots,
    resonantCapacity,
  );
  const signalSourceCoupledCount = countActiveSlots(
    state.sourceCoupledProposal.slots,
    sourceCoupledCapacity,
  );
  const signalResonantCount = countActiveSlots(
    state.resonantProposal.slots,
    resonantCapacity,
  );
  const modalDriveEnergy = driveEnergySampleCount
    ? clamp01(driveEnergyTotal / driveEnergySampleCount)
    : 0;
  const displayAmplitudeTotal =
    sumSlotAmplitudes(state.blendSourceCoupled.slots) +
    sumSlotAmplitudes(state.blendResonant.slots);
  const signalAmplitudeTotal =
    sumSlotAmplitudes(state.sourceCoupledProposal.slots) +
    sumSlotAmplitudes(state.resonantProposal.slots);
  const modalResponseRenderEnergy = deriveModalResponseRenderEnergy({
    candidateForcingSlots: state.blendSourceCoupled.slots,
    candidateResponseSlots: state.blendResonant.slots,
    sourceCut: renderAuthorityCut,
  });
  const renderSuppressedBySourceCut =
    modalResponseRenderEnergy.modalResponseRenderSourceCutSuppressed === true;
  const weakResidualSignal = isWeakResidualDisplayTail({
    modalDriveEnergy,
    signalAmplitudeTotal,
    displayAmplitudeTotal,
  });
  const decayedDisplayDominatesSignal =
    displayAmplitudeTotal > 0 &&
    displayAmplitudeTotal >= signalAmplitudeTotal * 1.18;
  const lowCurrentModalDrive = modalDriveEnergy < 0.05;
  const observedCurrentSignal =
    !weakResidualSignal &&
    (hasObservedLayerDrive(modalObserverMetrics, "source-coupled") ||
      hasObservedLayerDrive(modalObserverMetrics, "resonant"));

  state.previousSignalSourceCoupledSlots.fill(0);
  state.previousSignalSourceCoupledSlots.set(
    state.sourceCoupledProposal.slots.subarray(
      0,
      state.previousSignalSourceCoupledSlots.length,
    ),
  );
  state.previousSignalResonantSlots.fill(0);
  state.previousSignalResonantSlots.set(
    state.resonantProposal.slots.subarray(
      0,
      state.previousSignalResonantSlots.length,
    ),
  );

  const dominantEntry = excitedEntries[0] ?? null;
  const sourceCoupledStateSource = createLayerStateSummary(
    displaySourceCoupledEntries,
    periodicity,
    tonalness,
    "source-coupled",
    colorContext,
  );
  const resonantStateSource = createLayerStateSummary(
    displayResonantEntries,
    periodicity,
    tonalness,
    "resonant",
    colorContext,
  );
  const diagnostics = {
    excitedModeCount: excitedEntries.length,
    distributedExcitation,
    lowOrderModalEnergy,
    highOrderModalEnergy,
    observedModalModeCount: modalObserverMetrics.observedModalModeCount,
    lowQSourceCoupledModeCount: modalObserverMetrics.lowQSourceCoupledModeCount,
    lowQSourceCoupledEnergy: modalObserverMetrics.lowQSourceCoupledEnergy,
    lowQObservedDrive: modalObserverMetrics.lowQObservedDrive,
    lowQObservedSnr: modalObserverMetrics.lowQObservedSnr,
    lowQObservedCoherence: modalObserverMetrics.lowQObservedCoherence,
    highQResonantModeCount: modalObserverMetrics.highQResonantModeCount,
    highQResonantEnergy: modalObserverMetrics.highQResonantEnergy,
    highQRingSupport: modalObserverMetrics.highQRingSupport,
    highQObservedDrive: modalObserverMetrics.highQObservedDrive,
    highQObservedSnr: modalObserverMetrics.highQObservedSnr,
    highQObservedCoherence: modalObserverMetrics.highQObservedCoherence,
    highQObservedNoiseFloor: modalObserverMetrics.highQObservedNoiseFloor,
    highQSparseResonatorAuthority:
      modalObserverMetrics.highQSparseResonatorAuthority,
    highQProjectionLoad: modalObserverMetrics.highQProjectionLoad,
    highQRetainedVisibilityRejected:
      modalObserverMetrics.highQRetainedVisibilityRejected,
    lowQPhaseAuthority: modalObserverMetrics.lowQPhaseAuthority,
    highQPhaseAuthority: modalObserverMetrics.highQPhaseAuthority,
    modalPhaseAuthority: modalObserverMetrics.modalPhaseAuthority,
    modalPhaseCoherentFieldModeCount: renderSuppressedBySourceCut
      ? 0
      : sourceCoupledPhaseModeCount + resonantPhaseModeCount,
    highQResonantTopologySignal,
    modalPersistence: excitedEntries.length
      ? clamp01(persistenceTotal / excitedEntries.length)
      : 0,
    modalDriveEnergy,
    modeCoherence: excitedEntries.length
      ? clamp01(coherenceTotal / excitedEntries.length)
      : 0,
    driveSource,
    resonantSignalAuthoritative,
    resonantSignalAuthoritativeReason,
    resonantSignalAuthoritativeCoverage: resonantTargetShifted,
    resonantSignalAuthoritativeFreshSignal: resonantFreshSignalShifted,
    resonantSignalAuthoritativeFastAssist: resonantFastAssistShifted,
    resonantSignalAuthoritativeHighQ: highQResonantSignalAuthoritative,
    resonantSignalAuthoritativeModalResponse:
      projection.modalResponseResonantSignalAuthoritative,
    resonantSignalCoverage,
    resonantShiftStalePressure: resonantStalePressure,
    resonantShiftReleaseOverrideCount: resonantShiftReleaseOverrides?.size ?? 0,
    resonantShiftTrackingOverrideCount: resonantShiftTrackingOverrides?.size ?? 0,
    modalResponseEnergy: modalResponse.modalResponseEnergy,
    modalResponseInputEnergy: modalResponse.modalResponseInputEnergy,
    modalResponseCurrentRenderSourceEvidence: currentRenderSourceEvidence,
    modalResponseRenderAuthorityCutSilenceMs:
      state.renderAuthorityCutSilenceMs ?? 0,
    renderAuthorityCut,
    ...modalResponseRenderEnergy,
    modalResponseSourceCoupledEnergy: modalResponse.modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy: modalResponse.modalResponseResonantEnergy,
    modalResponseModeCount: modalResponse.modalResponseModeCount,
    modalResponseBudgetScale: modalResponse.modalResponseBudgetScale,
    modalResponseRawEnergy: modalResponse.modalResponseRawEnergy,
    modalResponseAverageDampingEnvelope:
      modalResponse.modalResponseAverageDampingEnvelope,
    modalResponseAverageCouplingStrength:
      modalResponse.modalResponseAverageCouplingStrength,
    modalResponseAveragePhaseConfidence:
      modalResponse.modalResponseAveragePhaseConfidence,
    modalResponseAveragePersistence:
      modalResponse.modalResponseAveragePersistence,
    modalResponseBudgetScaleSourceCoupled:
      modalResponse.modalResponseBudgetScaleSourceCoupled,
    modalResponseBudgetScaleResonant:
      modalResponse.modalResponseBudgetScaleResonant,
    ...projectionNormalizationMetrics,
  };
  state.diagnostics = diagnostics;
  const modalCandidates = buildModalCandidateList(
    displaySourceCoupledEntries,
    displayResonantEntries,
  );
  state.modalCandidates = modalCandidates;
  const modalCandidateState = new Map();
  for (const candidate of modalCandidates) {
    modalCandidateState.set(candidate.modeKey, candidate);
  }
  state.modalCandidateState = modalCandidateState;

  const renderSourceCoupledSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroSourceCoupledTargetSlots
    : state.blendSourceCoupled.slots;
  const renderResonantSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroResonantTargetSlots
    : state.blendResonant.slots;
  const renderSourceCoupledPhaseSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroSourceCoupledTargetSlots
    : state.blendSourceCoupled.phaseSlots;
  const renderResonantPhaseSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroResonantTargetSlots
    : state.blendResonant.phaseSlots;
  const renderSourceCoupledReferenceSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroSourceCoupledTargetSlots
    : state.remappedSourceCoupledRef;
  const renderResonantReferenceSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroResonantTargetSlots
    : state.remappedResonantRef;
  const renderSourceCoupledColorSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroSourceCoupledTargetSlots
    : state.blendSourceCoupled.colorSlots;
  const renderResonantColorSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroResonantTargetSlots
    : state.blendResonant.colorSlots;
  const renderSourceCoupledModeCount = renderSuppressedBySourceCut
    ? 0
    : blendedSourceCoupledCount;
  const renderResonantModeCount = renderSuppressedBySourceCut
    ? 0
    : blendedResonantCount;

  return {
    sourceMode: preparedInputs.sourceMode,
    modalCandidates,
    modalCandidateState: state.modalCandidateState,
    candidateForcingSlotsSource: renderSourceCoupledSlotsSource,
    candidateResponseSlotsSource: renderResonantSlotsSource,
    sourceCoupledPhaseSlotsSource: renderSourceCoupledPhaseSlotsSource,
    resonantPhaseSlotsSource: renderResonantPhaseSlotsSource,
    referenceSourceCoupledSlotsSource: renderSourceCoupledReferenceSlotsSource,
    referenceResonantSlotsSource: renderResonantReferenceSlotsSource,
    signalSourceCoupledSlotsSource: state.sourceCoupledProposal.slots,
    signalResonantSlotsSource: state.resonantProposal.slots,
    signalReferenceSourceCoupledSlotsSource: state.remappedSignalSourceCoupledRef,
    signalReferenceResonantSlotsSource: state.remappedSignalResonantRef,
    sourceCoupledColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? renderSourceCoupledColorSlotsSource
      : null,
    resonantColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? renderResonantColorSlotsSource
      : null,
    sourceCoupledStateSource,
    resonantStateSource,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    activeSourceCoupledModeCount: renderSourceCoupledModeCount,
    activeResonantModeCount: renderResonantModeCount,
    activeModeCount: renderSourceCoupledModeCount + renderResonantModeCount,
    renderAuthorityCut,
    dominantFrequency: renderSuppressedBySourceCut
      ? 0
      : (dominantEntry?.naturalFrequencyHz ?? 0),
    dominantAmplitude: renderSuppressedBySourceCut
      ? 0
      : (dominantEntry?.amplitude ?? 0),
    analysisEngine: "modal-excitation",
    pitchSource: "resonator-bank",
    spectralCandidates: [],
    usedDecay:
      !renderSuppressedBySourceCut &&
      blendedSourceCoupledCount + blendedResonantCount > 0 &&
      ((!observedCurrentSignal &&
        (signalSourceCoupledCount + signalResonantCount === 0 ||
          weakResidualSignal ||
          decayedDisplayDominatesSignal)) ||
        (lowCurrentModalDrive && decayedDisplayDominatesSignal)),
    suppressedByFog: false,
    structuralPerf: {
      peakScanMs: 0,
      modalResolveMs: Math.max(0, performanceNow() - startedAt),
      projectionMs: 0,
    },
    structuralMetrics: diagnostics,
  };
}
