import {
  sampleFFTAmplitudeForFrequency,
  getModalGeometryBackend,
} from "../../core/modalGeometryBackend.js";
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
  classifyObservedModeQProfile,
  computeModalObservation,
  computeModalObserverNoiseFloor,
  getDetailHarmonicCoupling,
} from "./modalObservedScoring.js";
import {
  applyProjectionEnergyNormalization,
  mergeProjectionNormalizationMetrics,
} from "./modalProjectionNormalization.js";
import { updateModalResponseFrame } from "./modalResponse.js";
import {
  buildStaleDetailReleaseOverrides,
  buildStaleDetailTrackingOverrides,
  computeStaleDetailPressure,
} from "./modalStaleDetail.js";

const BACKBONE_MAX_HZ = 3200;
const BACKBONE_MIN_HZ = 60;
const DETAIL_MAX_HZ = 12000;
const DETAIL_MIN_HZ = 200;
const BACKBONE_BINS_PER_OCTAVE = 5;
const DETAIL_BINS_PER_OCTAVE = 4;
const BACKBONE_FAMILY_WIDTH = 2;
const DETAIL_FAMILY_WIDTH = 3;
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
const EXCITATION_BACKBONE_BLEND_ATTACK = 0.28;
const EXCITATION_BACKBONE_BLEND_TRACKING = 0.32;
const EXCITATION_BACKBONE_BLEND_RELEASE = 0.9;
const EXCITATION_BACKBONE_SILENCE_RELEASE = 0.82;
const EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE_THRESHOLD = 0.08;
const EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE = 0.62;
const EXCITATION_BACKBONE_OBSERVED_CONTINUITY_RELEASE = 0.94;
const EXCITATION_BACKBONE_OBSERVED_CONTINUITY_EMPTY_RELEASE = 0.9;
const EXCITATION_BACKBONE_OBSERVED_CONTINUITY_LOW_SIGNAL_RELEASE = 0.82;
const EXCITATION_BACKBONE_FRESH_CAP = 3;
const EXCITATION_BACKBONE_SWITCH_PROJECTION_FRAMES = 7;
const EXCITATION_DETAIL_BLEND_ATTACK = 0.45;
const EXCITATION_DETAIL_SHIFT_BLEND_ATTACK = 0.85;
const EXCITATION_DETAIL_BLEND_TRACKING = 0.5;
const EXCITATION_DETAIL_RESPONSE_ENVELOPE_TRACKING = 0.78;
const EXCITATION_DETAIL_BLEND_RELEASE = 0.68;
const EXCITATION_DETAIL_SILENCE_RELEASE = 0.58;
const EXCITATION_DETAIL_LOW_SIGNAL_RELEASE_THRESHOLD = 0.06;
const EXCITATION_DETAIL_LOW_SIGNAL_RELEASE = 0.48;
const EXCITATION_DETAIL_SIGNAL_COVERAGE_MIN = 0.68;
const EXCITATION_HIGH_Q_SIGNAL_COVERAGE_MIN = 0.82;
const EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE = 0.2;
const EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_STALE_PRESSURE = 0.08;
const EXCITATION_DETAIL_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE = 0.12;
const EXCITATION_DETAIL_FAST_SHIFT_MIN_SIGNAL_AMPLITUDE = 0.28;
const EXCITATION_DETAIL_FAST_SHIFT_SIGNAL_RATIO = 1.6;
const EXCITATION_DETAIL_CONTINUITY_RELEASE = 0.82;
const EXCITATION_DETAIL_CONTINUITY_EMPTY_RELEASE = 0.82;
const EXCITATION_DETAIL_CONTINUITY_LOW_SIGNAL_RELEASE = 0.72;
const EXCITATION_DETAIL_SHIFT_STALE_TRACKING = 0.86;
const EXCITATION_DETAIL_SHIFT_STALE_RELEASE = 0.36;
const EXCITATION_DETAIL_CONTINUITY_PRESENCE_RELEASE = 0.92;
const EXCITATION_DETAIL_FRESH_CAP = 2;
const BACKBONE_SIGNAL_MIN_DRIVE_ENERGY = 0.045;
const DETAIL_SIGNAL_MIN_DRIVE_ENERGY = 0.05;
const BACKBONE_SIGNAL_STALE_WINDOW_MS = 66;
const DETAIL_SIGNAL_STALE_WINDOW_MS = 33;
const BACKBONE_SIGNAL_SCORE_DRIVE_WEIGHT = 0.7;
const BACKBONE_SIGNAL_SCORE_AMPLITUDE_WEIGHT = 0.3;
const DETAIL_SIGNAL_SCORE_DRIVE_WEIGHT = 0.7;
const DETAIL_SIGNAL_SCORE_AMPLITUDE_WEIGHT = 0.14;
const DETAIL_SIGNAL_SCORE_FRESHNESS_WEIGHT = 0.16;
const DETAIL_SIGNAL_SCORE_SUSTAIN_WEIGHT = 0.075;
const OBSERVED_DETAIL_CARRY_ENVELOPE_WEIGHT = 0.08;
const DETAIL_SUSTAIN_MIN_COHERENCE = 0.5;
const DETAIL_SUSTAIN_MIN_PERSISTENCE = 0.2;
const DETAIL_SUSTAIN_REFERENCE_AMPLITUDE = 0.0045;
const DETAIL_SUSTAIN_REFERENCE_DRIVE_ENERGY = 0.005;
const DETAIL_SUSTAIN_SIGNAL_MIN_PRESENCE = 0.02;
const BACKBONE_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY = 0.0002;
const BACKBONE_DISPLAY_CONTINUITY_SIGNAL_BASE = 0.018;
const BACKBONE_DISPLAY_CONTINUITY_PRESENCE_WEIGHT = 0.1;
const DETAIL_DISPLAY_CONTINUITY_MIN_PRESENCE = 0.0015;
const DETAIL_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY = 0.0002;
const DETAIL_SUBTLE_DISPLAY_CONTINUITY_MIN_MATURITY = 0.08;
const HIGH_Q_DETAIL_MIN_RING_SUPPORT = 0.08;
const HIGH_Q_DETAIL_MIN_RETAINED_ENERGY = 0.00045;
const HIGH_Q_DETAIL_MIN_MATURITY = 0.34;
const HIGH_Q_DETAIL_AUTHORITY_MIN_AGE_MS = 180;
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
const HIGH_Q_DETAIL_DISPLAY_ENVELOPE_START = 0.006;
const HIGH_Q_DETAIL_DISPLAY_ENVELOPE_FULL = 0.08;
const HIGH_Q_DETAIL_DISPLAY_ENVELOPE_FLOOR = 0.62;
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
  backbone: {
    layer: "backbone",
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
    retainedDriveFloor: BACKBONE_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY,
    noiseWindowBins: HIGH_Q_OBSERVER_NOISE_WINDOW_BINS,
    sparseEvidenceFloor: 0.08,
    mergeContextMin: 0.02,
  },
  detail: {
    layer: "detail",
    minModeCount: HIGH_Q_OBSERVER_MIN_MODE_COUNT,
    minRetainedEnergy: HIGH_Q_DETAIL_MIN_RETAINED_ENERGY,
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
    minRetainedCoherence: DETAIL_SUSTAIN_MIN_COHERENCE,
    coherenceFloor: DETAIL_SUSTAIN_MIN_COHERENCE,
    persistenceFloor: 0.78,
    retainedDriveFloor: DETAIL_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY,
    noiseWindowBins: HIGH_Q_OBSERVER_NOISE_WINDOW_BINS,
    sparseEvidenceFloor: 0,
    mergeContextMin: 0.03,
  },
});
const DETAIL_DISPLAY_CONTINUITY_SIGNAL_BASE = 0.05;
const DETAIL_DISPLAY_CONTINUITY_PRESENCE_WEIGHT = 0.26;
const DETAIL_SUBTLE_DISPLAY_CONTINUITY_SIGNAL_BASE = 0.012;
const DETAIL_SUBTLE_DISPLAY_CONTINUITY_PRESENCE_WEIGHT = 0.08;
const DETAIL_MATURITY_SEED = 0.14;
const DETAIL_MATURITY_PRESENCE_GAIN = 4;
const DETAIL_MATURITY_ATTACK = 0.46;
const DETAIL_MATURITY_RELEASE = 0.38;
const DETAIL_MATURITY_SIGNAL_MIN = 0.2;
const DETAIL_MATURITY_SIGNAL_WEIGHT = 0.9;
const DETAIL_COUPLING_MIN_PERIODICITY = 0.42;
const DETAIL_COUPLING_MIN_TONALNESS = 0.68;
const DETAIL_COUPLING_MAX_DISTRIBUTION = 0.12;
const DETAIL_COUPLING_DETAIL_BAND_START = 0.012;
const DETAIL_COUPLING_DETAIL_BAND_END = 0.08;
const DETAIL_COUPLING_HARMONIC_SUPPORT_START = 0.012;
const DETAIL_COUPLING_HARMONIC_SUPPORT_END = 0.08;
const DETAIL_COUPLING_DRIVE = 0.064;
const DETAIL_COUPLING_MIN_HARMONIC = 2;
const DETAIL_COUPLING_MAX_HARMONIC = 64;
const DETAIL_COUPLING_HARMONIC_TOLERANCE = 0.045;
const BACKBONE_DISPLAY_SCORE_DRIVE_WEIGHT = 0.42;
const BACKBONE_DISPLAY_SCORE_COHERENCE_WEIGHT = 0.33;
const BACKBONE_DISPLAY_SCORE_AMPLITUDE_WEIGHT = 0.17;
const BACKBONE_DISPLAY_SCORE_FRESHNESS_WEIGHT = 0.08;
const DETAIL_DISPLAY_SCORE_DRIVE_WEIGHT = 0.56;
const DETAIL_DISPLAY_SCORE_COHERENCE_WEIGHT = 0.14;
const DETAIL_DISPLAY_SCORE_AMPLITUDE_WEIGHT = 0.1;
const DETAIL_DISPLAY_SCORE_FRESHNESS_WEIGHT = 0.2;
const BACKBONE_DISPLAY_MIN_SIGNAL_AMPLITUDE = 0.08;
const DETAIL_DISPLAY_MIN_SIGNAL_AMPLITUDE = 0.05;
const BACKBONE_DISPLAY_DUPLICATE_WINDOW = 0.09;
const DETAIL_DISPLAY_DUPLICATE_WINDOW = 0.018;
const BACKBONE_DISPLAY_MAX_VISIBLE = 6;
const DETAIL_DISPLAY_MAX_VISIBLE = 5;
const EXCITATION_DECAY_DRIVE_THRESHOLD = 0.065;
const EXCITATION_DECAY_SIGNAL_DISPLAY_RATIO = 0.55;
const EXCITATION_HARD_SILENCE_MAX_AVG_AMPLITUDE = 1;
const EXCITATION_HARD_SILENCE_MAX_RMS = 0.004;
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
  return (
    (preparedInputs?.avgAmplitude ?? 0) <=
      EXCITATION_HARD_SILENCE_MAX_AVG_AMPLITUDE &&
    (preparedInputs?.analyserRms ?? 0) <= EXCITATION_HARD_SILENCE_MAX_RMS &&
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
  if (naturalFrequencyHz <= BACKBONE_MAX_HZ && computeOrder(mode) <= 24) {
    return "backbone";
  }

  return "detail";
}

function getModeRenderLayer(entry) {
  return entry?.renderLayer ?? entry?.layer ?? "detail";
}

function getModeQProfile(entry) {
  if (entry?.qProfile === "high-q" || entry?.qProfile === "low-q") {
    return entry.qProfile;
  }
  return getModeRenderLayer(entry) === "detail" ? "high-q" : "low-q";
}

function buildPreviousModalResponseEnergies(state) {
  const energies = new Map();

  const mergeEntry = (entry) => {
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
    energies.set(modeKey, Math.max(energies.get(modeKey) ?? 0, energy));
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

function buildModeAtlas(radius, cavityGeometry = "rectangular") {
  const safeRadius = Math.max(0.1, Math.round(radius * 1000) / 1000);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const cacheKey = `${geometryBackend.cavityGeometry}:${safeRadius.toFixed(3)}`;
  if (MODE_ATLAS_CACHE.has(cacheKey)) {
    return MODE_ATLAS_CACHE.get(cacheKey);
  }
  const atlas = geometryBackend.buildAtlas({
    radius: safeRadius,
    frequencyCenters: [
      ...buildFrequencyCenters(
        BACKBONE_MIN_HZ,
        BACKBONE_MAX_HZ,
        BACKBONE_BINS_PER_OCTAVE,
      ).map((centerHz) => ({
        centerHz,
        familyWidth: BACKBONE_FAMILY_WIDTH,
      })),
      ...buildFrequencyCenters(
        DETAIL_MIN_HZ,
        DETAIL_MAX_HZ,
        DETAIL_BINS_PER_OCTAVE,
      ).map((centerHz) => ({
        centerHz,
        familyWidth: DETAIL_FAMILY_WIDTH,
      })),
    ],
    buildModeKey,
    createAtlasEntry({ candidate, modeKey, naturalFrequencyHz }) {
      const atlasEntry = {
        modeKey,
        familyId: `family:${modeKey}`,
        u: candidate.u,
        v: candidate.v,
        w: candidate.w,
        naturalFrequencyHz,
        order: computeOrder(candidate),
        driveWeight: canonicalDriveWeight(candidate),
        decayTauMs: computeDecayTauMs(candidate),
      };
      atlasEntry.layer = classifyModeLayer(naturalFrequencyHz, atlasEntry);
      atlasEntry.renderLayer = atlasEntry.layer;
      atlasEntry.qProfile = atlasEntry.layer === "detail" ? "high-q" : "low-q";
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
    DETAIL_COUPLING_HARMONIC_SUPPORT_START,
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
      ((frequencyHz * DETAIL_COUPLING_HARMONIC_TOLERANCE) / nyquist) *
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

function computeDetailBandHarmonicSupport({
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
    DETAIL_COUPLING_MAX_HARMONIC,
    Math.floor(DETAIL_MAX_HZ / dominantFrequencyHz),
  );
  for (
    let harmonic = DETAIL_COUPLING_MIN_HARMONIC;
    harmonic <= maxHarmonic;
    harmonic += 1
  ) {
    const frequencyHz = dominantFrequencyHz * harmonic;
    if (frequencyHz < DETAIL_MIN_HZ) {
      continue;
    }
    harmonicCount += 1;
    const amplitude = sampleSpectralAmplitude(
      fftMagnitudes,
      sampleRate,
      frequencyHz,
    );
    support = Math.max(support, amplitude);
    if (amplitude >= DETAIL_COUPLING_HARMONIC_SUPPORT_START) {
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
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    const overlapLength = buffer.length - lag;
    for (let index = 0; index < overlapLength; index += 1) {
      correlation += buffer[index] * buffer[index + lag];
    }
    const overlapEnergy = prefixSumSq[overlapLength];
    if (overlapEnergy > 1e-6) {
      best = Math.max(best, correlation / overlapEnergy);
    }
  }

  return clamp01(best);
}

function computeModeResponse(buffer, sampleRate, frequencyHz) {
  if (
    !(buffer instanceof Float32Array) ||
    buffer.length === 0 ||
    frequencyHz <= 0
  ) {
    return { magnitude: 0, phase: 0 };
  }

  let real = 0;
  let imag = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const theta = (2 * Math.PI * frequencyHz * index) / sampleRate;
    const sample = buffer[index] ?? 0;
    real += sample * Math.cos(theta);
    imag -= sample * Math.sin(theta);
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
  backboneSlots,
  detailSlots,
  sourceCut,
}) {
  const rawBackboneEnergy = clamp01(sumSlotAmplitudes(backboneSlots));
  const rawDetailEnergy = clamp01(sumSlotAmplitudes(detailSlots));
  const rawEnergy = clamp01(rawBackboneEnergy + rawDetailEnergy);
  const sourceCutSuppressed = sourceCut === true;

  return {
    modalResponseRenderEnergy: sourceCutSuppressed ? 0 : rawEnergy,
    modalResponseRenderBackboneEnergy: sourceCutSuppressed
      ? 0
      : rawBackboneEnergy,
    modalResponseRenderDetailEnergy: sourceCutSuppressed ? 0 : rawDetailEnergy,
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

function getSustainedDetailPresence(entry) {
  const coherence = clamp01(entry?.coherence ?? 0);
  const persistence = clamp01(entry?.persistence ?? 0);
  const amplitude = clamp01(entry?.amplitude ?? 0);
  const driveEnergy = clamp01(
    entry?.currentDriveEnergy ?? entry?.driveEnergy ?? 0,
  );

  const coherent = clamp01(
    (coherence - DETAIL_SUSTAIN_MIN_COHERENCE) /
      Math.max(1 - DETAIL_SUSTAIN_MIN_COHERENCE, 1e-6),
  );
  const persistent = clamp01(
    (persistence - DETAIL_SUSTAIN_MIN_PERSISTENCE) /
      Math.max(1 - DETAIL_SUSTAIN_MIN_PERSISTENCE, 1e-6),
  );
  const modalAmplitude = clamp01(
    amplitude / DETAIL_SUSTAIN_REFERENCE_AMPLITUDE,
  );
  const driven = clamp01(driveEnergy / DETAIL_SUSTAIN_REFERENCE_DRIVE_ENERGY);

  return coherent * persistent * modalAmplitude * driven;
}

function shouldApplyDetailDisplayContinuity({
  atlasEntry,
  previous,
  driveEnergy,
  hardSilentFrame,
  detailDisplayContinuityPresence,
  detailObserverContinuitySignal,
}) {
  if (hardSilentFrame || atlasEntry?.layer !== "detail" || !previous) {
    return false;
  }
  if (
    driveEnergy < DETAIL_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY &&
    detailObserverContinuitySignal <= 0
  ) {
    return false;
  }

  return (
    getSustainedDetailPresence(previous) >=
      DETAIL_DISPLAY_CONTINUITY_MIN_PRESENCE ||
    (detailDisplayContinuityPresence ?? 0) >=
      DETAIL_DISPLAY_CONTINUITY_MIN_PRESENCE ||
    (detailObserverContinuitySignal > 0 &&
      ((previous.detailMaturity ?? 0) >=
        DETAIL_SUBTLE_DISPLAY_CONTINUITY_MIN_MATURITY ||
        (previous.amplitude ?? 0) >=
          MIN_DISPLAY_CONTINUITY_RESONATOR_AMPLITUDE))
  );
}

function shouldApplyBackboneDisplayContinuity({
  atlasEntry,
  previous,
  driveEnergy,
  hardSilentFrame,
}) {
  if (hardSilentFrame || atlasEntry?.layer !== "backbone" || !previous) {
    return false;
  }
  if ((previous?.observedModal ?? false) !== true) {
    return false;
  }

  const profile = getModalObserverProfile("backbone");
  const retainedEnergy = getObservedModeRetainedEnergy(previous);
  return (
    retainedEnergy >= profile.minRetainedEnergy &&
    (previous?.coherence ?? 0) >= profile.minRetainedCoherence &&
    (driveEnergy >= BACKBONE_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY ||
      hasObservedModalDrive(previous, profile))
  );
}

function getModalObserverProfile(layer) {
  return MODAL_OBSERVER_PROFILES[layer] ?? MODAL_OBSERVER_PROFILES.detail;
}

function getObservedModeRetainedEnergy(entry) {
  return entry?.retainedEnergy ?? entry?.amplitude ?? 0;
}

function hasObservedModalDrive(entry, profile) {
  return (entry?.observedDrive ?? 0) >= profile.minObservedDrive;
}

function hasObservedLayerDrive(metrics, layer) {
  const profile = getModalObserverProfile(layer);
  return layer === "backbone"
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
  const layer = atlasEntry?.layer ?? "detail";
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
    profile.minRetainedEnergy * (layer === "detail" ? 10 : 6),
    retainedEnergy,
  );
  const driveGate = smoothstep(
    profile.minObservedDrive * 0.45,
    profile.minObservedDrive * (layer === "detail" ? 4 : 3),
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
  const isDetail = atlasEntry?.layer === "detail";
  const renderLayer = getModeRenderLayer(atlasEntry);
  const qProfile = classifyObservedModeQProfile({
    atlasEntry,
    observedSnr,
    observerCoherence,
    retainedEnergy: energy,
    observedDrive,
    dominantDriveFrequencyHz,
    dominantDriveSpectralSupport,
    allowBassHarmonicDriver,
    highQDetailMinRetainedEnergy: HIGH_Q_DETAIL_MIN_RETAINED_ENERGY,
    lowQObserverSnrStart: LOW_Q_OBSERVER_SNR_START,
    lowQObserverMinObservedDrive: LOW_Q_OBSERVER_MIN_OBSERVED_DRIVE,
  });
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
    qProfile,
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
    detailMaturity: isDetail
      ? Math.max(previous?.detailMaturity ?? 0, HIGH_Q_DETAIL_MIN_MATURITY)
      : 1,
    retainedEnergy: energy,
    observedDrive,
    observedEnergy,
    observedSnr,
    localNoiseFloor,
    sourceAmplitude: updateObservedSourceAmplitude(previous, drivePeak),
    firstObservedAtMs,
    lastObservedAtMs,
    detailDisplayContinuity: isDetail,
    subtleDetailDisplayContinuity: isDetail,
    detailDisplayContinuityPresence: isDetail
      ? Math.max(previous?.detailDisplayContinuityPresence ?? 0, energy)
      : 0,
    backboneDisplayContinuity: !isDetail,
    backboneDisplayContinuityPresence: !isDetail
      ? Math.max(previous?.backboneDisplayContinuityPresence ?? 0, energy)
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
  let phaseOverlayModeCount = 0;

  for (const entry of modes?.values?.() ?? []) {
    const renderLayer = getModeRenderLayer(entry);
    const qProfile = getModeQProfile(entry);
    const includeEntry =
      layer === "detail"
        ? qProfile === "high-q"
        : renderLayer === "backbone" && qProfile !== "high-q";
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
      phaseOverlayModeCount += 1;
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
      phaseOverlayModeCount > 0
        ? clamp01(phaseCoherence / phaseOverlayModeCount)
        : 0,
    phaseOverlayModeCount,
  };
}

function summarizeObservedModes(modes) {
  const highQ = summarizeObservedLayerModes(modes, "detail");
  const lowQ = summarizeObservedLayerModes(modes, "backbone");
  const observedModalModeCount = highQ.count + lowQ.count;
  const highQRingSupport =
    highQ.count >= HIGH_Q_OBSERVER_MIN_MODE_COUNT &&
    highQ.energy >= HIGH_Q_DETAIL_MIN_RETAINED_ENERGY
      ? clamp01(
          Math.max(
            HIGH_Q_DETAIL_MIN_RING_SUPPORT,
            highQ.energy * 24,
            highQ.observedDrive * 2.2,
          ) *
            smoothstep(1, HIGH_Q_OBSERVER_MIN_MODE_COUNT, highQ.count) *
            Math.max(0.5, highQ.coherence),
        )
      : 0;

  return {
    observedModalModeCount,
    lowQBackboneModeCount: lowQ.count,
    lowQBackboneEnergy: lowQ.energy,
    lowQObservedDrive: lowQ.observedDrive,
    lowQObservedSnr: lowQ.observedSnr,
    lowQObservedCoherence: lowQ.coherence,
    lowQPhaseAuthority: lowQ.phaseAuthority,
    highQDetailModeCount: highQ.count,
    highQDetailEnergy: highQ.energy,
    highQRingSupport,
    highQObservedDrive: highQ.observedDrive,
    highQObservedSnr: highQ.observedSnr,
    highQObservedCoherence: highQ.coherence,
    highQObservedNoiseFloor: highQ.noiseFloor,
    highQPhaseAuthority: highQ.phaseAuthority,
    modalPhaseAuthority: clamp01(
      highQ.phaseAuthority + lowQ.phaseAuthority * 0.45,
    ),
    modalPhaseOverlayModeCount:
      highQ.phaseOverlayModeCount + lowQ.phaseOverlayModeCount,
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
      highQDetailEnergy: modalObserverMetrics.highQDetailEnergy,
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
    const matchesLayer =
      layer === "detail"
        ? getModeQProfile(entry) === "high-q"
        : getModeRenderLayer(entry) === layer &&
          getModeQProfile(entry) !== "high-q";
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
    const layer = entry?.layer ?? "detail";
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
      Math.max(1, (capacities?.backbone ?? 0) + (capacities?.detail ?? 0)) &&
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
      entry.layer === "backbone" &&
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
        (entry.amplitude ?? 0) * (entry.layer === "detail" ? 1.15 : 1),
        observedDrive * profile.energyGain,
      ),
    );
    const hasObservedModalEvidence =
      hasObservedModalDrive({ observedDrive }, profile) ||
      observedEnergy >= profile.minRetainedEnergy;
    const hasSustainedModalEvidence =
      entry.layer === "backbone"
        ? hasObservedModalDrive({ observedDrive }, profile) ||
          (entry.amplitude ?? 0) >= profile.minRetainedEnergy
        : (entry.detailMaturity ?? 0) >=
            DETAIL_SUBTLE_DISPLAY_CONTINUITY_MIN_MATURITY ||
          getSustainedDetailPresence(entry) >=
            DETAIL_DISPLAY_CONTINUITY_MIN_PRESENCE ||
          entry.detailDisplayContinuity === true;

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

function getDetailMaturitySignalScale(entry) {
  if ((entry?.layer ?? "detail") !== "detail") {
    return 1;
  }
  return clamp01(
    DETAIL_MATURITY_SIGNAL_MIN +
      clamp01(entry?.detailMaturity ?? 0) * DETAIL_MATURITY_SIGNAL_WEIGHT,
  );
}

function getDetailDisplayContinuitySourceScale(entry) {
  if (
    (entry?.layer ?? "detail") !== "detail" ||
    entry?.detailDisplayContinuity !== true
  ) {
    return 1;
  }

  const sourceEnvelope = smoothstep(
    HIGH_Q_DETAIL_DISPLAY_ENVELOPE_START,
    HIGH_Q_DETAIL_DISPLAY_ENVELOPE_FULL,
    clamp01(entry?.sourceAmplitude ?? entry?.currentDriveEnergy ?? 0),
  );
  return (
    HIGH_Q_DETAIL_DISPLAY_ENVELOPE_FLOOR +
    sourceEnvelope * (1 - HIGH_Q_DETAIL_DISPLAY_ENVELOPE_FLOOR)
  );
}

function getDisplayAmplitude(entry, layer) {
  const signalAmplitude = entry?.signalAmplitude ?? 0;
  const modalResponseAmplitude = clamp01(
    entry?.modalResponseDisplayAmplitude ?? entry?.displayAmplitude ?? 0,
  );
  const displayAmplitude =
    layer !== "detail"
      ? Math.max(signalAmplitude, modalResponseAmplitude)
      : Math.max(
          modalResponseAmplitude,
          clamp01(signalAmplitude * getDetailMaturitySignalScale(entry)),
        );
  return entry?.hardSilentFrame === true
    ? Math.min(displayAmplitude, clamp01(entry?.amplitude ?? 0))
    : displayAmplitude;
}

function getObservedCarryAmplitudeScale(entry, layer) {
  if (
    layer !== "detail" ||
    entry?.observedModal !== true ||
    getModeQProfile(entry) !== "high-q"
  ) {
    return 1;
  }
  return (
    1 -
    (1 - getDetailDisplayContinuitySourceScale(entry)) *
      OBSERVED_DETAIL_CARRY_ENVELOPE_WEIGHT
  );
}

function getNextDetailMaturity({
  previousMaturity,
  sustainedPresence,
  driveEnergy,
  hardSilentFrame,
}) {
  if (hardSilentFrame) {
    return 0;
  }

  const seedMaturity =
    driveEnergy >= DETAIL_SIGNAL_MIN_DRIVE_ENERGY ? DETAIL_MATURITY_SEED : 0;
  const targetMaturity = Math.max(
    seedMaturity,
    clamp01(sustainedPresence * DETAIL_MATURITY_PRESENCE_GAIN),
  );
  const rate =
    targetMaturity >= previousMaturity
      ? DETAIL_MATURITY_ATTACK
      : DETAIL_MATURITY_RELEASE;

  return clamp01(previousMaturity + (targetMaturity - previousMaturity) * rate);
}

function getCoherentDetailCoupling({
  tonalness,
  periodicity,
  distributedExcitation,
  detailBandPeak,
  harmonicSupport,
  hardSilentFrame,
}) {
  if (
    hardSilentFrame ||
    tonalness < DETAIL_COUPLING_MIN_TONALNESS ||
    periodicity < DETAIL_COUPLING_MIN_PERIODICITY ||
    distributedExcitation > DETAIL_COUPLING_MAX_DISTRIBUTION
  ) {
    return 0;
  }

  return (
    smoothstep(
      DETAIL_COUPLING_DETAIL_BAND_START,
      DETAIL_COUPLING_DETAIL_BAND_END,
      detailBandPeak,
    ) *
    smoothstep(
      DETAIL_COUPLING_HARMONIC_SUPPORT_START,
      DETAIL_COUPLING_HARMONIC_SUPPORT_END,
      harmonicSupport,
    ) *
    clamp01(
      (tonalness - DETAIL_COUPLING_MIN_TONALNESS) /
        (1 - DETAIL_COUPLING_MIN_TONALNESS),
    ) *
    clamp01(
      (periodicity - DETAIL_COUPLING_MIN_PERIODICITY) /
        (1 - DETAIL_COUPLING_MIN_PERIODICITY),
    ) *
    clamp01(
      (DETAIL_COUPLING_MAX_DISTRIBUTION - distributedExcitation) /
        DETAIL_COUPLING_MAX_DISTRIBUTION,
    )
  );
}

function getSignalScore(entry, layer) {
  const coherence = clamp01(entry?.coherence ?? 0);
  const driveEnergy = entry?.currentDriveEnergy ?? entry?.driveEnergy ?? 0;
  const amplitude = entry?.amplitude ?? 0;
  const modalResponseAmplitude = clamp01(
    entry?.modalResponseDisplayAmplitude ?? 0,
  );
  const freshness = getFreshness(entry);

  if (layer === "detail") {
    const sustainedPresence = getSustainedDetailPresence(entry);
    const score =
      (driveEnergy * DETAIL_SIGNAL_SCORE_DRIVE_WEIGHT +
        amplitude * DETAIL_SIGNAL_SCORE_AMPLITUDE_WEIGHT +
        freshness * DETAIL_SIGNAL_SCORE_FRESHNESS_WEIGHT) *
        clamp01(0.45 + coherence * 0.55) +
      sustainedPresence * DETAIL_SIGNAL_SCORE_SUSTAIN_WEIGHT;
    const responseScore =
      modalResponseAmplitude * clamp01(0.5 + coherence * 0.5);
    if (!entry?.detailDisplayContinuity) {
      return Math.max(score, responseScore);
    }

    const continuityScore = Math.max(
      score,
      responseScore,
      entry.subtleDetailDisplayContinuity
        ? DETAIL_SUBTLE_DISPLAY_CONTINUITY_SIGNAL_BASE +
            clamp01(entry.detailDisplayContinuityPresence ?? 0) *
              DETAIL_SUBTLE_DISPLAY_CONTINUITY_PRESENCE_WEIGHT
        : DETAIL_DISPLAY_CONTINUITY_SIGNAL_BASE +
            clamp01(entry.detailDisplayContinuityPresence ?? 0) *
              DETAIL_DISPLAY_CONTINUITY_PRESENCE_WEIGHT,
    );
    return continuityScore * getDetailDisplayContinuitySourceScale(entry);
  }

  const backboneScore =
    coherence *
    (driveEnergy * BACKBONE_SIGNAL_SCORE_DRIVE_WEIGHT +
      amplitude * BACKBONE_SIGNAL_SCORE_AMPLITUDE_WEIGHT);
  const responseScore = modalResponseAmplitude * clamp01(0.5 + coherence * 0.5);
  return entry?.backboneDisplayContinuity
    ? Math.max(
        backboneScore,
        responseScore,
        BACKBONE_DISPLAY_CONTINUITY_SIGNAL_BASE +
          clamp01(entry.backboneDisplayContinuityPresence ?? 0) *
            BACKBONE_DISPLAY_CONTINUITY_PRESENCE_WEIGHT,
      )
    : Math.max(backboneScore, responseScore);
}

function buildSignalShortlist(entries, layer, currentFrameAtMs, capacity) {
  const coherenceThreshold = layer === "backbone" ? 0.08 : 0.05;
  const driveThreshold =
    layer === "backbone"
      ? BACKBONE_SIGNAL_MIN_DRIVE_ENERGY
      : DETAIL_SIGNAL_MIN_DRIVE_ENERGY;
  const staleWindowMs =
    layer === "backbone"
      ? BACKBONE_SIGNAL_STALE_WINDOW_MS
      : DETAIL_SIGNAL_STALE_WINDOW_MS;

  return entries
    .filter((entry) => {
      if (entry.layer !== layer || entry.coherence < coherenceThreshold) {
        return false;
      }
      if (
        (entry.currentDriveEnergy ?? entry.driveEnergy ?? 0) >= driveThreshold
      ) {
        return true;
      }
      if (
        layer === "detail" &&
        getSustainedDetailPresence(entry) >= DETAIL_SUSTAIN_SIGNAL_MIN_PRESENCE
      ) {
        return true;
      }
      if (layer === "backbone" && entry.backboneDisplayContinuity) {
        return true;
      }
      if (layer === "detail" && entry.detailDisplayContinuity) {
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

  if (layer === "backbone") {
    return (
      driveEnergy * BACKBONE_DISPLAY_SCORE_DRIVE_WEIGHT +
      coherence * BACKBONE_DISPLAY_SCORE_COHERENCE_WEIGHT +
      amplitude * BACKBONE_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
      modalResponseAmplitude * BACKBONE_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
      freshness * BACKBONE_DISPLAY_SCORE_FRESHNESS_WEIGHT
    );
  }

  return (
    driveEnergy * DETAIL_DISPLAY_SCORE_DRIVE_WEIGHT +
    coherence * DETAIL_DISPLAY_SCORE_COHERENCE_WEIGHT +
    amplitude * DETAIL_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
    modalResponseAmplitude * DETAIL_DISPLAY_SCORE_AMPLITUDE_WEIGHT +
    freshness * DETAIL_DISPLAY_SCORE_FRESHNESS_WEIGHT
  );
}

function compareFastDetailAssistEntries(left, right) {
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

function selectFastDetailAssist(entries, currentFrameAtMs) {
  return (
    entries
      .filter((entry) => {
        if ((entry?.layer ?? "detail") !== "detail") {
          return false;
        }

        return (
          (entry?.currentDriveEnergy ?? 0) >= 0.12 &&
          (entry?.signalAmplitude ?? 0) >=
            DETAIL_DISPLAY_MIN_SIGNAL_AMPLITUDE &&
          currentFrameAtMs -
            (entry?.lastExcitedAtMs ?? Number.NEGATIVE_INFINITY) <=
            DETAIL_SIGNAL_STALE_WINDOW_MS &&
          (entry?.persistence ?? 1) <= 0.72
        );
      })
      .sort(compareFastDetailAssistEntries)[0] ?? null
  );
}

function mergeFastDetailAssist(displayEntries, assistEntry) {
  const visibleEntries = displayEntries.slice(0, DETAIL_DISPLAY_MAX_VISIBLE);
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
      ) <= DETAIL_DISPLAY_DUPLICATE_WINDOW,
  );

  if (duplicateIndex === -1) {
    return {
      entries: [
        assistEntry,
        ...mergedEntries.filter(
          (entry) => entry.modeKey !== assistEntry.modeKey,
        ),
      ].slice(0, DETAIL_DISPLAY_MAX_VISIBLE),
      assistEntry,
      assistNeedsReservedAdmission: true,
    };
  }

  const duplicateEntry = mergedEntries[duplicateIndex];
  if (compareFastDetailAssistEntries(assistEntry, duplicateEntry) >= 0) {
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
    ].slice(0, DETAIL_DISPLAY_MAX_VISIBLE),
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

function hasStrongFreshDetailSignal({ visibleSlots, signalSlots, capacity }) {
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
    strongestFreshSignal >= EXCITATION_DETAIL_FAST_SHIFT_MIN_SIGNAL_AMPLITUDE &&
    strongestFreshSignal >=
      strongestCoveredSignal * EXCITATION_DETAIL_FAST_SHIFT_SIGNAL_RATIO
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

function getDetailDisplayContinuityPresence(slots, modalModes, capacity) {
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
      entry?.layer === "detail" &&
      getSustainedDetailPresence(entry) > continuityPresence
    ) {
      continuityPresence = getSustainedDetailPresence(entry);
    }
  }

  return continuityPresence;
}

function buildDisplayShortlist(entries, layer) {
  const minSignalAmplitude =
    layer === "backbone"
      ? BACKBONE_DISPLAY_MIN_SIGNAL_AMPLITUDE
      : DETAIL_DISPLAY_MIN_SIGNAL_AMPLITUDE;
  const duplicateWindow =
    layer === "backbone"
      ? BACKBONE_DISPLAY_DUPLICATE_WINDOW
      : DETAIL_DISPLAY_DUPLICATE_WINDOW;
  const visibleCap =
    layer === "backbone"
      ? BACKBONE_DISPLAY_MAX_VISIBLE
      : DETAIL_DISPLAY_MAX_VISIBLE;

  const ranked = entries
    .filter((entry) => {
      const entryMinSignal =
        layer === "backbone" && entry?.backboneDisplayContinuity
          ? BACKBONE_DISPLAY_CONTINUITY_SIGNAL_BASE * 0.85
          : layer === "detail" && entry?.subtleDetailDisplayContinuity
            ? DETAIL_SUBTLE_DISPLAY_CONTINUITY_SIGNAL_BASE * 0.85
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
      return (right.signalAmplitude ?? 0) - (left.signalAmplitude ?? 0);
    });

  const survivors = [];
  for (const entry of ranked) {
    if (
      survivors.some(
        (survivor) =>
          getRelativeFrequencyDistance(
            survivor.naturalFrequencyHz,
            entry.naturalFrequencyHz,
          ) <= duplicateWindow,
      )
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
  backboneEntries,
  detailEntries,
  fastDetailAssist,
  hardSilentFrame,
  backboneProjectionSwitch,
  backboneCapacity,
  detailCapacity,
  colorContext,
  modalObserverMetrics,
  highQDetailTopologySignal,
  modalResponseMetrics = null,
}) {
  if (hardSilentFrame) {
    state.backboneProjectionSwitchFrames = 0;
    state.backboneProjectionSuppressedKeys?.clear?.();
  } else if (backboneProjectionSwitch) {
    state.backboneProjectionSwitchFrames =
      EXCITATION_BACKBONE_SWITCH_PROJECTION_FRAMES;
    state.backboneProjectionSuppressedKeys = buildModeKeySet(
      state.blendBackbone.slots,
      backboneCapacity,
    );
  } else if ((state.backboneProjectionSwitchFrames ?? 0) > 0) {
    state.backboneProjectionSwitchFrames -= 1;
    if (state.backboneProjectionSwitchFrames <= 0) {
      state.backboneProjectionSuppressedKeys?.clear?.();
    }
  }
  const suppressedBackboneKeys =
    (state.backboneProjectionSwitchFrames ?? 0) > 0
      ? state.backboneProjectionSuppressedKeys
      : null;
  const projectedBackboneEntries = suppressedBackboneKeys?.size
    ? backboneEntries.filter(
        (entry) => !suppressedBackboneKeys.has(getEntryModeKey(entry)),
      )
    : backboneEntries;
  const rawDisplayBackboneEntries = hardSilentFrame
    ? []
    : buildDisplayShortlist(projectedBackboneEntries, "backbone");
  const {
    entries: rawDisplayDetailEntries,
    assistEntry: mergedFastDetailAssist,
    assistNeedsReservedAdmission,
  } = hardSilentFrame
    ? {
        entries: [],
        assistEntry: null,
        assistNeedsReservedAdmission: false,
      }
    : mergeFastDetailAssist(
        buildDisplayShortlist(detailEntries, "detail"),
        fastDetailAssist,
      );
  const {
    entries: displayBackboneEntries,
    metrics: backboneProjectionNormalizationMetrics,
  } = applyProjectionEnergyNormalization({
    entries: rawDisplayBackboneEntries,
    layer: "backbone",
    modalObserverMetrics,
    hardSilentFrame,
    highQDetailTopologySignal,
    resolveDisplayAmplitude: getDisplayAmplitude,
    getModalObserverProfile,
  });
  const {
    entries: displayDetailEntries,
    metrics: detailProjectionNormalizationMetrics,
  } = applyProjectionEnergyNormalization({
    entries: rawDisplayDetailEntries,
    layer: "detail",
    modalObserverMetrics,
    hardSilentFrame,
    highQDetailTopologySignal,
    resolveDisplayAmplitude: getDisplayAmplitude,
    getModalObserverProfile,
  });
  const {
    entries: signalDetailProjectionEntries,
    metrics: signalDetailProjectionNormalizationMetrics,
  } = applyProjectionEnergyNormalization({
    entries: detailEntries,
    layer: "detail",
    modalObserverMetrics,
    hardSilentFrame,
    highQDetailTopologySignal,
    resolveDisplayAmplitude: getDisplayAmplitude,
    getModalObserverProfile,
  });

  writeShortlistedEntries(
    state.displayBackbone,
    displayBackboneEntries,
    backboneCapacity,
    (entry) => entry.displayAmplitude ?? getDisplayAmplitude(entry, "backbone"),
    colorContext,
  );
  writeShortlistedEntries(
    state.displayDetail,
    displayDetailEntries,
    detailCapacity,
    (entry) => entry.displayAmplitude ?? getDisplayAmplitude(entry, "detail"),
    colorContext,
  );
  writeShortlistedEntries(
    state.detailProjection,
    signalDetailProjectionEntries,
    detailCapacity,
    (entry) => entry.displayAmplitude ?? getDisplayAmplitude(entry, "detail"),
    colorContext,
  );

  const detailAssistNeedsFreshAdmission =
    assistNeedsReservedAdmission &&
    mergedFastDetailAssist &&
    !hasVisibleModeKey(state.blendDetail.slots, mergedFastDetailAssist.modeKey);
  const detectedDetailDisplayContinuityPresence = hardSilentFrame
    ? 0
    : Math.max(
        getDetailDisplayContinuityPresence(
          state.blendDetail.slots,
          state.activeModes,
          detailCapacity,
        ),
        getDetailDisplayContinuityPresence(
          state.blendDetail.slots,
          state.observedModes,
          detailCapacity,
        ),
      );
  state.detailDisplayContinuityPresence = hardSilentFrame
    ? 0
    : Math.max(
        detectedDetailDisplayContinuityPresence,
        (state.detailDisplayContinuityPresence ?? 0) *
          EXCITATION_DETAIL_CONTINUITY_PRESENCE_RELEASE,
      );
  const hasDetailDisplayContinuity =
    state.detailDisplayContinuityPresence >=
    DETAIL_DISPLAY_CONTINUITY_MIN_PRESENCE;
  const detailSignalCoverage = computeSignalCoverageByVisibleKeys(
    state.blendDetail.slots,
    state.detailProposal.slots,
    detailCapacity,
  );
  const detailVisibleAmplitude = sumSlotAmplitudes(state.blendDetail.slots);
  const detailStalePressure = computeStaleDetailPressure({
    visibleSlots: state.blendDetail.slots,
    targetSlots: state.detailProposal.slots,
    capacity: detailCapacity,
  });
  const detailTargetShifted =
    detailSignalCoverage < EXCITATION_DETAIL_SIGNAL_COVERAGE_MIN &&
    detailVisibleAmplitude >=
      EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE &&
    detailStalePressure >=
      EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_STALE_PRESSURE;
  const detailFreshSignalShifted =
    detailVisibleAmplitude >=
      EXCITATION_DETAIL_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE &&
    hasStrongFreshDetailSignal({
      visibleSlots: state.blendDetail.slots,
      signalSlots: state.detailProposal.slots,
      capacity: detailCapacity,
    });
  const detailFastAssistShifted =
    detailAssistNeedsFreshAdmission &&
    detailVisibleAmplitude >=
      EXCITATION_DETAIL_FAST_SHIFT_MIN_VISIBLE_AMPLITUDE;
  const highQDetailSignalAuthoritative = false;
  const modalResponseDetailSignalAuthoritative =
    (modalResponseMetrics?.modalResponseDetailEnergy ?? 0) > 0.08 &&
    rawDisplayDetailEntries.length > 0 &&
    modalObserverMetrics.highQDenseSpectrumPressure < 0.72;
  const detailSignalAuthoritative =
    detailTargetShifted ||
    detailFreshSignalShifted ||
    detailFastAssistShifted ||
    highQDetailSignalAuthoritative;
  const detailSignalAuthoritativeReason = detailFreshSignalShifted
    ? "fresh-signal"
    : detailTargetShifted
      ? "coverage"
      : detailFastAssistShifted
        ? "fast-assist"
        : highQDetailSignalAuthoritative
          ? "high-q"
          : "none";
  const highQCoverageShifted =
    detailVisibleAmplitude >=
      EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE &&
    detailSignalCoverage >= EXCITATION_DETAIL_SIGNAL_COVERAGE_MIN &&
    detailSignalCoverage < EXCITATION_HIGH_Q_SIGNAL_COVERAGE_MIN &&
    (modalObserverMetrics.highQObservedDrive ?? 0) >= 0.075 &&
    (modalObserverMetrics.highQDenseSpectrumPressure ?? 0) <= 0.2;
  const highQSignalShifted =
    highQDetailSignalAuthoritative &&
    ((detailVisibleAmplitude >=
      EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_VISIBLE_AMPLITUDE &&
      detailStalePressure >=
        EXCITATION_DETAIL_SIGNAL_AUTHORITY_MIN_STALE_PRESSURE) ||
      highQCoverageShifted);
  const detailUsesSignalProjection =
    detailTargetShifted ||
    detailFreshSignalShifted ||
    detailFastAssistShifted ||
    highQSignalShifted;
  const detailBlendTargetSlots = detailUsesSignalProjection
    ? state.detailProjection.slots
    : state.displayDetail.slots;
  const detailBlendReferenceSlots = detailUsesSignalProjection
    ? state.detailProjection.referenceSlots
    : state.displayDetail.referenceSlots;
  const detailBlendColorSlots = detailUsesSignalProjection
    ? state.detailProjection.colorSlots
    : state.displayDetail.colorSlots;
  const projectionNormalizationMetrics = mergeProjectionNormalizationMetrics(
    backboneProjectionNormalizationMetrics,
    detailUsesSignalProjection
      ? signalDetailProjectionNormalizationMetrics
      : detailProjectionNormalizationMetrics,
  );
  const detailShiftReleaseOverrides = detailSignalAuthoritative
    ? buildStaleDetailReleaseOverrides({
        visibleSlots: state.blendDetail.slots,
        targetSlots: detailBlendTargetSlots,
        capacity: detailCapacity,
        release: EXCITATION_DETAIL_SHIFT_STALE_RELEASE,
      })
    : null;
  const detailShiftTrackingOverrides = detailSignalAuthoritative
    ? buildStaleDetailTrackingOverrides({
        visibleSlots: state.blendDetail.slots,
        targetSlots: detailBlendTargetSlots,
        capacity: detailCapacity,
        tracking: EXCITATION_DETAIL_SHIFT_STALE_TRACKING,
      })
    : null;

  return {
    displayBackboneEntries,
    displayDetailEntries,
    hasDetailDisplayContinuity,
    detailAssistNeedsFreshAdmission,
    detailSignalCoverage,
    detailStalePressure,
    detailTargetShifted,
    detailFreshSignalShifted,
    detailFastAssistShifted,
    highQDetailSignalAuthoritative,
    modalResponseDetailSignalAuthoritative,
    detailSignalAuthoritative,
    detailSignalAuthoritativeReason,
    detailBlendTargetSlots,
    detailBlendReferenceSlots,
    detailBlendColorSlots,
    detailShiftReleaseOverrides,
    detailShiftTrackingOverrides,
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
  const sparseOrPerModeSupported =
    (modalObserverMetrics.highQDenseSpectrumPressure ?? 0) < 0.5 ||
    (modalObserverMetrics.highQObservedSnr ?? 0) >= 0.55 ||
    (modalObserverMetrics.highQObservedDrive ?? 0) >= 0.06;
  return modalObserverMetrics.highQRingSupport > 0 &&
    modalObserverMetrics.highQDetailModeCount > 0 &&
    modalObserverMetrics.highQDetailEnergy >=
      HIGH_Q_DETAIL_MIN_RETAINED_ENERGY &&
    observedHighQModesAged &&
    sparseOrPerModeSupported &&
    highQSparseResonatorAuthority >= 0.08
    ? Math.max(
        modalObserverMetrics.highQRingSupport,
        HIGH_Q_DETAIL_MIN_RING_SUPPORT,
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
    layer === "backbone" ? (dominant?.naturalFrequencyHz ?? 0) : 0,
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
  const atlas = buildModeAtlas(
    preparedInputs.radius,
    preparedInputs.effectiveCavityGeometry,
  );
  state.atlasEntries = atlas;
  state.atlasCacheKey = `${
    preparedInputs.effectiveCavityGeometry
  }:${preparedInputs.radius}`;
  clearLayerBuffers(state.backboneProposal);
  clearLayerBuffers(state.detailProposal);
  clearLayerBuffers(state.displayBackbone);
  clearLayerBuffers(state.displayDetail);
  clearLayerBuffers(state.detailProjection);

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
  const detailBandPeak = computeSpectralPeakInRange(
    fastSignalState.fftMagnitudes,
    preparedInputs.sampleRate,
    DETAIL_MIN_HZ,
    DETAIL_MAX_HZ,
  );
  const detailBandHarmonicSupport = computeDetailBandHarmonicSupport({
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
  const backboneCapacity = state.backboneProposal.slots.length / 4;
  const detailCapacity = state.detailProposal.slots.length / 4;
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
      backbone: backboneCapacity,
      detail: detailCapacity,
    },
  });
  modalObserverMetrics = appendHighQSparseAuthority({
    modalObserverMetrics,
    distributedExcitation,
    periodicity,
    fftMagnitudes: fastSignalState.fftMagnitudes,
  });
  const observedTailActivity =
    (modalObserverMetrics.highQDetailModeCount >=
      HIGH_Q_OBSERVER_MIN_MODE_COUNT &&
      modalObserverMetrics.highQDetailEnergy >=
        HIGH_Q_DETAIL_MIN_RETAINED_ENERGY &&
      modalObserverMetrics.highQRingSupport > 0 &&
      hasObservedLayerDrive(modalObserverMetrics, "detail")) ||
    (modalObserverMetrics.lowQBackboneModeCount >=
      LOW_Q_OBSERVER_MIN_MODE_COUNT &&
      modalObserverMetrics.lowQBackboneEnergy >=
        LOW_Q_OBSERVER_MIN_RETAINED_ENERGY &&
      hasObservedLayerDrive(modalObserverMetrics, "backbone") &&
      modalObserverMetrics.lowQObservedCoherence >= 0.32);
  const previousModalResponseEnergies =
    buildPreviousModalResponseEnergies(state);
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
  const previousDetailMaturity = state.detailMaturity;
  const nextModes = new Map();
  const nextDetailMaturity = new Map();
  const excitedEntries = [];
  let lowOrderModalEnergy = 0;
  let highOrderModalEnergy = 0;
  let driveEnergyTotal = 0;
  let driveEnergySampleCount = 0;
  let persistenceTotal = 0;
  let coherenceTotal = 0;
  const previousBackboneCouplingFrequencyHz =
    state.backboneCouplingFrequencyHz ?? 0;
  const backboneCouplingFrequencySwitch =
    previousBackboneCouplingFrequencyHz > 0 &&
    dominantDriveFrequencyHz > 0 &&
    getRelativeFrequencyDistance(
      previousBackboneCouplingFrequencyHz,
      dominantDriveFrequencyHz,
    ) > 0.12;
  const previousDetailCouplingFrequencyHz =
    state.detailCouplingFrequencyHz ?? 0;
  const detailCouplingFrequencySwitch =
    previousDetailCouplingFrequencyHz > 0 &&
    dominantDriveFrequencyHz > 0 &&
    getRelativeFrequencyDistance(
      previousDetailCouplingFrequencyHz,
      dominantDriveFrequencyHz,
    ) > 0.08;
  const coherentDetailCoupling = detailCouplingFrequencySwitch
    ? 0
    : getCoherentDetailCoupling({
        tonalness,
        periodicity,
        distributedExcitation,
        detailBandPeak,
        harmonicSupport: detailBandHarmonicSupport,
        hardSilentFrame,
      });
  let observedDetailModesAged = hasAgedObservedLayerModes({
    modes: state.observedModes,
    layer: "detail",
    currentFrameAtMs: preparedInputs.currentFrameAtMs,
    minAgeMs: HIGH_Q_DETAIL_AUTHORITY_MIN_AGE_MS,
  });
  let highQDetailTopologySignal = deriveHighQTopologySignal({
    modalObserverMetrics,
    observedHighQModesAged: observedDetailModesAged,
  });
  const highQDetailRetentionSignal =
    (state.observedModes?.size ?? 0) > 0 && highQDetailTopologySignal > 0
      ? highQDetailTopologySignal
      : 0;
  const retainedDetailObserverSignal = highQDetailRetentionSignal;
  state.detailCouplingFrequencyHz =
    hardSilentFrame || detailCouplingFrequencySwitch
      ? 0
      : dominantDriveFrequencyHz || previousDetailCouplingFrequencyHz;
  state.backboneCouplingFrequencyHz = hardSilentFrame
    ? 0
    : dominantDriveFrequencyHz || previousBackboneCouplingFrequencyHz;

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
      atlasEntry.layer === "detail" &&
      distributedExcitation > 0.5 &&
      tonalness < 0.58 &&
      modalResponseDrive < 0.02
        ? 0
        : rawTimeDomainModalDrive;
    const modalResponseCurrentDrive = clamp01(
      modalResponseDrive * (atlasEntry.layer === "backbone" ? 0.82 : 1),
    );
    const weakFileSpectralFallbackNoise =
      preparedInputs.sourceMode === "file" &&
      driveSource === "spectral-fallback" &&
      preparedInputs.avgAmplitude < 10 &&
      preparedInputs.analyserRms < 0.02;
    const weakFileDetailNoise =
      atlasEntry.layer === "detail" &&
      preparedInputs.sourceMode === "file" &&
      preparedInputs.avgAmplitude < 10 &&
      preparedInputs.analyserRms < 0.03 &&
      modalResponseDrive < 0.16;
    const directDriveEnergy = clamp01(
      weakFileSpectralFallbackNoise || weakFileDetailNoise
        ? 0
        : Math.max(modalResponseCurrentDrive, noiseSuppressedTimeDomainDrive),
    );
    const coupledDetailDriveEnergy =
      atlasEntry.layer === "detail"
        ? coherentDetailCoupling *
          getDetailHarmonicCoupling(
            atlasEntry.naturalFrequencyHz,
            dominantDriveFrequencyHz,
          ) *
          DETAIL_COUPLING_DRIVE *
          atlasEntry.driveWeight
        : 0;
    const driveEnergy = Math.max(directDriveEnergy, coupledDetailDriveEnergy);
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
    const observedPreviousHighQ =
      getModeQProfile(observedPrevious) === "high-q";
    const canUseObservedPrevious =
      observedPreviousAged &&
      !hardSilentFrame &&
      (atlasEntry.layer === "backbone"
        ? (observedPreviousHighQ
            ? highQDetailRetentionSignal > 0
            : hasObservedLayerDrive(modalObserverMetrics, "backbone")) &&
          !backboneCouplingFrequencySwitch
        : highQDetailRetentionSignal > 0 && !detailCouplingFrequencySwitch);
    const activePrevious =
      (detailCouplingFrequencySwitch && atlasEntry.layer === "detail") ||
      (backboneCouplingFrequencySwitch && atlasEntry.layer === "backbone")
        ? null
        : (state.activeModes.get(atlasEntry.modeKey) ?? null);
    const activePreviousIsCurrentProposal =
      !!activePrevious &&
      (observedPrevious != null ||
        modalResponseEnergy >= MIN_RESONATOR_AMPLITUDE ||
        driveEnergy >=
          (atlasEntry.layer === "backbone"
            ? BACKBONE_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY
            : DETAIL_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY));
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
      (atlasEntry.layer === "backbone" ? 0.92 : 0.78) *
      (0.35 + coherenceTarget * 0.65);
    const rawAmplitude =
      carriedAmplitude +
      injectedAmplitude * (1 - carriedAmplitude * SATURATION_FACTOR);
    const detailDisplayContinuity = shouldApplyDetailDisplayContinuity({
      atlasEntry,
      previous,
      driveEnergy,
      hardSilentFrame,
      detailDisplayContinuityPresence: state.detailDisplayContinuityPresence,
      detailObserverContinuitySignal: Math.max(
        retainedDetailObserverSignal,
        modalResponse.modalResponseDetailEnergy,
      ),
    });
    const subtleDetailDisplayContinuity =
      detailDisplayContinuity &&
      driveEnergy < DETAIL_DISPLAY_CONTINUITY_MIN_DRIVE_ENERGY &&
      retainedDetailObserverSignal > 0;
    const backboneDisplayContinuity = shouldApplyBackboneDisplayContinuity({
      atlasEntry,
      previous,
      driveEnergy,
      hardSilentFrame,
    });
    const detailDisplayContinuityPresence = detailDisplayContinuity
      ? subtleDetailDisplayContinuity
        ? Math.max(
            getSustainedDetailPresence(previous),
            state.detailDisplayContinuityPresence ?? 0,
            previous?.detailMaturity ?? 0,
          ) * retainedDetailObserverSignal
        : Math.max(
            getSustainedDetailPresence(previous),
            state.detailDisplayContinuityPresence ?? 0,
          )
      : 0;
    const backboneDisplayContinuityPresence = backboneDisplayContinuity
      ? Math.max(previous?.amplitude ?? 0, previous?.retainedEnergy ?? 0) *
        Math.max(0.35, previous?.coherence ?? 0)
      : 0;
    const displayContinuityMode =
      detailDisplayContinuity || backboneDisplayContinuity;
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
    const sustainedPresence = getSustainedDetailPresence({
      ...atlasEntry,
      amplitude,
      currentDriveEnergy: driveEnergy,
      driveEnergy:
        (previous?.driveEnergy ?? driveEnergy) * (1 - DRIVE_BLEND_ALPHA) +
        driveEnergy * DRIVE_BLEND_ALPHA,
      coherence,
      persistence,
    });
    const detailMaturity =
      atlasEntry.layer === "detail"
        ? getNextDetailMaturity({
            previousMaturity: Math.max(
              previousDetailMaturity?.get(atlasEntry.modeKey) ?? 0,
              previous?.detailMaturity ?? 0,
            ),
            sustainedPresence,
            driveEnergy,
            hardSilentFrame,
          })
        : 1;
    const entry = {
      ...atlasEntry,
      amplitude,
      currentDriveEnergy: driveEnergy,
      driveEnergy:
        (previous?.driveEnergy ?? driveEnergy) * (1 - DRIVE_BLEND_ALPHA) +
        driveEnergy * DRIVE_BLEND_ALPHA,
      phase: response.phase,
      modalResponseDrive,
      modalResponseEnergy,
      modalResponseDisplayAmplitude,
      hardSilentFrame: strictHardSilentFrame,
      sourceAmplitude: updateObservedSourceAmplitude(previous, drivePeak),
      coherence,
      persistence,
      detailMaturity,
      detailDisplayContinuity,
      subtleDetailDisplayContinuity,
      detailDisplayContinuityPresence,
      backboneDisplayContinuity,
      backboneDisplayContinuityPresence,
      lastExcitedAtMs:
        driveEnergy > MIN_RESONATOR_AMPLITUDE
          ? preparedInputs.currentFrameAtMs
          : (previous?.lastExcitedAtMs ?? preparedInputs.currentFrameAtMs),
      ageMs: (previous?.ageMs ?? 0) + deltaMs,
    };
    nextModes.set(entry.modeKey, entry);
    if (entry.layer === "detail") {
      nextDetailMaturity.set(entry.modeKey, detailMaturity);
    }
    excitedEntries.push(entry);
    driveEnergyTotal += entry.driveEnergy;
    driveEnergySampleCount += 1;
    persistenceTotal += entry.persistence;
    coherenceTotal += entry.coherence;
    if (entry.layer === "backbone") {
      lowOrderModalEnergy += Math.max(entry.amplitude, modalResponseEnergy);
    } else {
      highOrderModalEnergy += Math.max(entry.amplitude, modalResponseEnergy);
    }
  }

  state.activeModes = nextModes;
  state.detailMaturity = hardSilentFrame ? new Map() : nextDetailMaturity;
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
        backbone: backboneCapacity,
        detail: detailCapacity,
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
  observedDetailModesAged = hasAgedObservedLayerModes({
    modes: state.observedModes,
    layer: "detail",
    currentFrameAtMs: preparedInputs.currentFrameAtMs,
    minAgeMs: HIGH_Q_DETAIL_AUTHORITY_MIN_AGE_MS,
  });
  highQDetailTopologySignal = deriveHighQTopologySignal({
    modalObserverMetrics,
    observedHighQModesAged: observedDetailModesAged,
  });

  const displayBackboneEntries = buildSignalShortlist(
    excitedEntries,
    "backbone",
    preparedInputs.currentFrameAtMs,
    backboneCapacity,
  );
  const displayDetailEntries = buildSignalShortlist(
    excitedEntries,
    "detail",
    preparedInputs.currentFrameAtMs,
    detailCapacity,
  );
  const signalBackboneEntries = strictHardSilentFrame
    ? []
    : displayBackboneEntries;
  const signalDetailEntries = strictHardSilentFrame ? [] : displayDetailEntries;
  const fastDetailAssist = selectFastDetailAssist(
    signalDetailEntries,
    preparedInputs.currentFrameAtMs,
  );

  writeShortlistedEntries(
    state.backboneProposal,
    signalBackboneEntries,
    backboneCapacity,
    (entry) =>
      entry.signalAmplitude ?? entry.currentDriveEnergy ?? entry.driveEnergy,
    colorContext,
  );
  writeShortlistedEntries(
    state.detailProposal,
    signalDetailEntries,
    detailCapacity,
    (entry) =>
      entry.signalAmplitude ?? entry.currentDriveEnergy ?? entry.driveEnergy,
    colorContext,
  );
  const projection = buildModalProjection({
    state,
    backboneEntries: displayBackboneEntries,
    detailEntries: displayDetailEntries,
    fastDetailAssist,
    hardSilentFrame,
    backboneProjectionSwitch: backboneCouplingFrequencySwitch,
    backboneCapacity,
    detailCapacity,
    colorContext,
    modalObserverMetrics,
    highQDetailTopologySignal,
    modalResponseMetrics: modalResponse,
  });
  const {
    hasDetailDisplayContinuity,
    detailAssistNeedsFreshAdmission,
    detailSignalCoverage,
    detailStalePressure,
    detailTargetShifted,
    detailFreshSignalShifted,
    detailFastAssistShifted,
    highQDetailSignalAuthoritative,
    modalResponseDetailSignalAuthoritative,
    detailSignalAuthoritative,
    detailSignalAuthoritativeReason,
    detailBlendTargetSlots,
    detailBlendReferenceSlots,
    detailBlendColorSlots,
    detailShiftReleaseOverrides,
    detailShiftTrackingOverrides,
    projectionNormalizationMetrics,
  } = projection;

  const observedBackboneContinuity =
    !hardSilentFrame &&
    !backboneCouplingFrequencySwitch &&
    modalObserverMetrics.lowQBackboneModeCount >=
      LOW_Q_OBSERVER_MIN_MODE_COUNT &&
    modalObserverMetrics.lowQBackboneEnergy >=
      LOW_Q_OBSERVER_MIN_RETAINED_ENERGY;
  blendModalStack(
    state.blendBackbone,
    state.displayBackbone.slots,
    backboneCapacity,
    {
      attack: EXCITATION_BACKBONE_BLEND_ATTACK,
      tracking: EXCITATION_BACKBONE_BLEND_TRACKING,
      release: observedBackboneContinuity
        ? EXCITATION_BACKBONE_OBSERVED_CONTINUITY_RELEASE
        : EXCITATION_BACKBONE_BLEND_RELEASE,
      emptyTargetRelease: observedBackboneContinuity
        ? EXCITATION_BACKBONE_OBSERVED_CONTINUITY_EMPTY_RELEASE
        : EXCITATION_BACKBONE_SILENCE_RELEASE,
      lowSignalReleaseThreshold:
        EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE_THRESHOLD,
      lowSignalRelease: observedBackboneContinuity
        ? EXCITATION_BACKBONE_OBSERVED_CONTINUITY_LOW_SIGNAL_RELEASE
        : EXCITATION_BACKBONE_LOW_SIGNAL_RELEASE,
      retainReleased: !hardSilentFrame,
      freshCap: EXCITATION_BACKBONE_FRESH_CAP,
    },
  );
  blendModalStack(state.blendDetail, detailBlendTargetSlots, detailCapacity, {
    attack:
      detailSignalAuthoritative || modalResponseDetailSignalAuthoritative
        ? EXCITATION_DETAIL_SHIFT_BLEND_ATTACK
        : EXCITATION_DETAIL_BLEND_ATTACK,
    tracking:
      modalResponseDetailSignalAuthoritative || highQDetailSignalAuthoritative
        ? EXCITATION_DETAIL_RESPONSE_ENVELOPE_TRACKING
        : EXCITATION_DETAIL_BLEND_TRACKING,
    release: hasDetailDisplayContinuity
      ? EXCITATION_DETAIL_CONTINUITY_RELEASE
      : EXCITATION_DETAIL_BLEND_RELEASE,
    emptyTargetRelease: hasDetailDisplayContinuity
      ? EXCITATION_DETAIL_CONTINUITY_EMPTY_RELEASE
      : EXCITATION_DETAIL_SILENCE_RELEASE,
    lowSignalReleaseThreshold: EXCITATION_DETAIL_LOW_SIGNAL_RELEASE_THRESHOLD,
    lowSignalRelease: hasDetailDisplayContinuity
      ? EXCITATION_DETAIL_CONTINUITY_LOW_SIGNAL_RELEASE
      : EXCITATION_DETAIL_LOW_SIGNAL_RELEASE,
    trackingOverrides: detailShiftTrackingOverrides,
    releaseOverrides: detailShiftReleaseOverrides,
    retainReleased: !hardSilentFrame,
    freshCap:
      detailSignalAuthoritative || modalResponseDetailSignalAuthoritative
        ? detailCapacity
        : EXCITATION_DETAIL_FRESH_CAP +
          (detailAssistNeedsFreshAdmission ? 1 : 0),
  });

  if (
    preparedInputs.shouldBuildSpectralLight &&
    !state.previousShouldBuildSpectralLight
  ) {
    clearBlendColorState(state.blendBackbone);
    clearBlendColorState(state.blendDetail);
  }

  if (preparedInputs.shouldBuildSpectralLight) {
    blendColorStack(
      state.blendBackbone,
      state.displayBackbone.slots,
      state.displayBackbone.colorSlots,
      backboneCapacity,
      {
        attack: EXCITATION_BACKBONE_BLEND_ATTACK,
        tracking: EXCITATION_BACKBONE_BLEND_TRACKING,
        release: EXCITATION_BACKBONE_BLEND_RELEASE,
      },
    );
    blendColorStack(
      state.blendDetail,
      detailBlendTargetSlots,
      detailBlendColorSlots,
      detailCapacity,
      {
        attack: detailSignalAuthoritative
          ? EXCITATION_DETAIL_SHIFT_BLEND_ATTACK
          : EXCITATION_DETAIL_BLEND_ATTACK,
        tracking: EXCITATION_DETAIL_BLEND_TRACKING,
        release: EXCITATION_DETAIL_BLEND_RELEASE,
      },
    );
  }
  state.previousShouldBuildSpectralLight = Boolean(
    preparedInputs.shouldBuildSpectralLight,
  );

  remapReferenceToBlendedOrder(
    state.blendBackbone.slots,
    state.displayBackbone.referenceSlots,
    backboneCapacity,
    state.remappedBackboneRef,
  );
  remapReferenceToBlendedOrder(
    state.blendDetail.slots,
    detailBlendReferenceSlots,
    detailCapacity,
    state.remappedDetailRef,
  );
  remapReferenceToBlendedOrder(
    state.backboneProposal.slots,
    state.previousSignalBackboneSlots,
    backboneCapacity,
    state.remappedSignalBackboneRef,
  );
  remapReferenceToBlendedOrder(
    state.detailProposal.slots,
    state.previousSignalDetailSlots,
    detailCapacity,
    state.remappedSignalDetailRef,
  );
  const backbonePhaseModeCount = writePhaseSlotsForVisibleModes({
    target: state.blendBackbone.phaseSlots,
    visibleSlots: state.blendBackbone.slots,
    capacity: backboneCapacity,
    activeModes: state.activeModes,
    observedModes: state.observedModes,
  });
  const detailPhaseModeCount = writePhaseSlotsForVisibleModes({
    target: state.blendDetail.phaseSlots,
    visibleSlots: state.blendDetail.slots,
    capacity: detailCapacity,
    activeModes: state.activeModes,
    observedModes: state.observedModes,
  });

  const blendedBackboneCount = countActiveSlots(
    state.blendBackbone.slots,
    backboneCapacity,
  );
  const blendedDetailCount = countActiveSlots(
    state.blendDetail.slots,
    detailCapacity,
  );
  const signalBackboneCount = countActiveSlots(
    state.backboneProposal.slots,
    backboneCapacity,
  );
  const signalDetailCount = countActiveSlots(
    state.detailProposal.slots,
    detailCapacity,
  );
  const modalDriveEnergy = driveEnergySampleCount
    ? clamp01(driveEnergyTotal / driveEnergySampleCount)
    : 0;
  const displayAmplitudeTotal =
    sumSlotAmplitudes(state.blendBackbone.slots) +
    sumSlotAmplitudes(state.blendDetail.slots);
  const signalAmplitudeTotal =
    sumSlotAmplitudes(state.backboneProposal.slots) +
    sumSlotAmplitudes(state.detailProposal.slots);
  const modalResponseRenderEnergy = deriveModalResponseRenderEnergy({
    backboneSlots: state.blendBackbone.slots,
    detailSlots: state.blendDetail.slots,
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
    (hasObservedLayerDrive(modalObserverMetrics, "backbone") ||
      hasObservedLayerDrive(modalObserverMetrics, "detail"));

  state.previousSignalBackboneSlots.fill(0);
  state.previousSignalBackboneSlots.set(
    state.backboneProposal.slots.subarray(
      0,
      state.previousSignalBackboneSlots.length,
    ),
  );
  state.previousSignalDetailSlots.fill(0);
  state.previousSignalDetailSlots.set(
    state.detailProposal.slots.subarray(
      0,
      state.previousSignalDetailSlots.length,
    ),
  );

  const dominantEntry = excitedEntries[0] ?? null;
  const backboneStateSource = createLayerStateSummary(
    displayBackboneEntries,
    periodicity,
    tonalness,
    "backbone",
    colorContext,
  );
  const detailStateSource = createLayerStateSummary(
    displayDetailEntries,
    periodicity,
    tonalness,
    "detail",
    colorContext,
  );
  const diagnostics = {
    excitedModeCount: excitedEntries.length,
    distributedExcitation,
    lowOrderModalEnergy,
    highOrderModalEnergy,
    observedModalModeCount: modalObserverMetrics.observedModalModeCount,
    lowQBackboneModeCount: modalObserverMetrics.lowQBackboneModeCount,
    lowQBackboneEnergy: modalObserverMetrics.lowQBackboneEnergy,
    lowQObservedDrive: modalObserverMetrics.lowQObservedDrive,
    lowQObservedSnr: modalObserverMetrics.lowQObservedSnr,
    lowQObservedCoherence: modalObserverMetrics.lowQObservedCoherence,
    highQDetailModeCount: modalObserverMetrics.highQDetailModeCount,
    highQDetailEnergy: modalObserverMetrics.highQDetailEnergy,
    highQRingSupport: modalObserverMetrics.highQRingSupport,
    highQObservedDrive: modalObserverMetrics.highQObservedDrive,
    highQObservedSnr: modalObserverMetrics.highQObservedSnr,
    highQObservedCoherence: modalObserverMetrics.highQObservedCoherence,
    highQObservedNoiseFloor: modalObserverMetrics.highQObservedNoiseFloor,
    highQSparseResonatorAuthority:
      modalObserverMetrics.highQSparseResonatorAuthority,
    highQDenseSpectrumPressure: modalObserverMetrics.highQDenseSpectrumPressure,
    highQRetainedVisibilityRejected:
      modalObserverMetrics.highQRetainedVisibilityRejected,
    lowQPhaseAuthority: modalObserverMetrics.lowQPhaseAuthority,
    highQPhaseAuthority: modalObserverMetrics.highQPhaseAuthority,
    modalPhaseAuthority: modalObserverMetrics.modalPhaseAuthority,
    modalPhaseOverlayModeCount: backbonePhaseModeCount + detailPhaseModeCount,
    highQDetailTopologySignal,
    modalPersistence: excitedEntries.length
      ? clamp01(persistenceTotal / excitedEntries.length)
      : 0,
    modalDriveEnergy,
    modeCoherence: excitedEntries.length
      ? clamp01(coherenceTotal / excitedEntries.length)
      : 0,
    driveSource,
    detailSignalAuthoritative,
    detailSignalAuthoritativeReason,
    detailSignalAuthoritativeCoverage: detailTargetShifted,
    detailSignalAuthoritativeFreshSignal: detailFreshSignalShifted,
    detailSignalAuthoritativeFastAssist: detailFastAssistShifted,
    detailSignalAuthoritativeHighQ: highQDetailSignalAuthoritative,
    detailSignalAuthoritativeModalResponse:
      projection.modalResponseDetailSignalAuthoritative,
    detailSignalCoverage,
    detailShiftStalePressure: detailStalePressure,
    detailShiftReleaseOverrideCount: detailShiftReleaseOverrides?.size ?? 0,
    detailShiftTrackingOverrideCount: detailShiftTrackingOverrides?.size ?? 0,
    modalResponseEnergy: modalResponse.modalResponseEnergy,
    modalResponseInputEnergy: modalResponse.modalResponseInputEnergy,
    modalResponseCurrentRenderSourceEvidence: currentRenderSourceEvidence,
    modalResponseRenderAuthorityCutSilenceMs:
      state.renderAuthorityCutSilenceMs ?? 0,
    renderAuthorityCut,
    ...modalResponseRenderEnergy,
    modalResponseBackboneEnergy: modalResponse.modalResponseBackboneEnergy,
    modalResponseDetailEnergy: modalResponse.modalResponseDetailEnergy,
    modalResponseModeCount: modalResponse.modalResponseModeCount,
    modalResponseBudgetScaleBackbone:
      modalResponse.modalResponseBudgetScaleBackbone,
    modalResponseBudgetScaleDetail:
      modalResponse.modalResponseBudgetScaleDetail,
    ...projectionNormalizationMetrics,
  };
  state.diagnostics = diagnostics;

  const renderBackboneSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroBackboneTargetSlots
    : state.blendBackbone.slots;
  const renderDetailSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroDetailTargetSlots
    : state.blendDetail.slots;
  const renderBackbonePhaseSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroBackboneTargetSlots
    : state.blendBackbone.phaseSlots;
  const renderDetailPhaseSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroDetailTargetSlots
    : state.blendDetail.phaseSlots;
  const renderBackboneReferenceSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroBackboneTargetSlots
    : state.remappedBackboneRef;
  const renderDetailReferenceSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroDetailTargetSlots
    : state.remappedDetailRef;
  const renderBackboneColorSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroBackboneTargetSlots
    : state.blendBackbone.colorSlots;
  const renderDetailColorSlotsSource = renderSuppressedBySourceCut
    ? preparedInputs.zeroDetailTargetSlots
    : state.blendDetail.colorSlots;
  const renderBackboneModeCount = renderSuppressedBySourceCut
    ? 0
    : blendedBackboneCount;
  const renderDetailModeCount = renderSuppressedBySourceCut
    ? 0
    : blendedDetailCount;

  return {
    sourceMode: preparedInputs.sourceMode,
    backboneSlotsSource: renderBackboneSlotsSource,
    detailSlotsSource: renderDetailSlotsSource,
    backbonePhaseSlotsSource: renderBackbonePhaseSlotsSource,
    detailPhaseSlotsSource: renderDetailPhaseSlotsSource,
    referenceBackboneSlotsSource: renderBackboneReferenceSlotsSource,
    referenceDetailSlotsSource: renderDetailReferenceSlotsSource,
    signalBackboneSlotsSource: state.backboneProposal.slots,
    signalDetailSlotsSource: state.detailProposal.slots,
    signalReferenceBackboneSlotsSource: state.remappedSignalBackboneRef,
    signalReferenceDetailSlotsSource: state.remappedSignalDetailRef,
    backboneColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? renderBackboneColorSlotsSource
      : null,
    detailColorSlotsSource: preparedInputs.shouldBuildSpectralLight
      ? renderDetailColorSlotsSource
      : null,
    backboneStateSource,
    detailStateSource,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    activeBackboneModeCount: renderBackboneModeCount,
    activeDetailModeCount: renderDetailModeCount,
    activeModeCount: renderBackboneModeCount + renderDetailModeCount,
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
      blendedBackboneCount + blendedDetailCount > 0 &&
      ((!observedCurrentSignal &&
        (signalBackboneCount + signalDetailCount === 0 ||
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
