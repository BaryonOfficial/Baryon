import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  BEAT_DEFAULTS,
  CAVITY_ACOUSTIC_DEFAULTS,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
  SIMULATION_DEFAULTS,
  TEST_TONE_SIGNALS,
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
  SPECTRAL_EVIDENCE_POLICY,
  computeSpectralEffectiveBinCount,
  findCredibleSpectralPeaks,
} from "./spectralEvidence.js";
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
import {
  createModalFieldContinuityState,
  hasVisibleModalFieldContinuityPayload,
  updateModalFieldContinuity,
} from "../../core/modalFieldContinuity.js";
import { getModalGeometryBackend } from "../../core/modalGeometryBackend.js";
import {
  MODAL_BASIS_CACHE_PAGE_CAPACITY,
  MODAL_BASIS_CACHE_RESOLUTION,
  MODAL_BASIS_HANDOFF_MODE_COUNT,
  MODAL_BASIS_STEADY_MODE_COUNT,
  getModalBasisCacheMaxRepresentableModeIndex,
} from "../../core/modalBudgets.js";
import { deriveHighQSparseResonatorEvidence } from "./highQSparseResonatorEvidence.js";
import {
  buildModalEnergyLedger,
  hasProjectedRenderAuthority,
  sumProjectedSlotEnergy,
} from "./modalEnergyLedger.js";
import {
  buildAudioSourceEvidenceFrame,
  collectAudioSourceEvidenceInputs,
  resolveAudioRenderBoundary,
} from "./audioSourceEvidence.js";
import { clamp, clamp01, smoothstep } from "../math.js";

const MODAL_FIELD_CONTINUITY_MAX_BASIS_MODE_ORDER =
  getModalBasisCacheMaxRepresentableModeIndex(MODAL_BASIS_CACHE_RESOLUTION);
const LIVE_SOURCE_MODAL_CONTINUITY_RELEASE_SECONDS = 0.75;

/** @typedef {import("../../core/cavityGeometry.js").CavityGeometry} CavityGeometry */

const { requestedPitchSource: REQUESTED_PITCH_SOURCE } = AUDIO_ANALYSIS_POLICY;
const TEST_TONE_HARMONIC_ATTENUATION =
  SPECTRAL_MODAL_POLICY.harmonicAttenuation;
const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;

function resolveTestToneSignal(value) {
  return value === TEST_TONE_SIGNALS.harmonicSeries
    ? TEST_TONE_SIGNALS.harmonicSeries
    : TEST_TONE_SIGNALS.pureSine;
}

const LIVE_INPUT_INVALID_BASELINE_PEAK = 0.94;
const LIVE_INPUT_INVALID_COMPRESSED_BASELINE_PEAK = 0.82;
const LIVE_INPUT_INVALID_COMPRESSED_BASELINE_RMS = 0.0085;
const LIVE_INPUT_INVALID_CURRENT_SATURATED_PEAK = 0.98;
const LIVE_INPUT_INVALID_CURRENT_WEAK_RMS = 0.012;
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
  highQSparseResonatorEvidence: 0,
  highQProjectionLoad: 0,
});
const LIVE_INPUT_ACOUSTIC_GATE_BASE_CONFIG = Object.freeze({
  absoluteRmsFloor: 0.0065,
  absolutePeakFloor: 0.075,
  absoluteCentroidFloor: 0.006,
  openFrames: 1,
  releaseFrames: 4,
  evidenceFloorScale: 0.08,
  evidenceOpenUnits: 3,
  confidenceOpenThreshold: 0.45,
  confidenceCloseThreshold: 0.3,
  hardSilenceRmsMultiplier: 1.02,
  hardSilenceRmsOffset: 0.00005,
  hardSilencePeakMultiplier: 1.02,
  hardSilencePeakOffset: 0.004,
  confidenceWeights: Object.freeze({
    rms: 0.4,
    peak: 0.32,
    spectralCentroid: 0.12,
    peakClarity: 0.16,
  }),
  humPenaltyWeight: 0.65,
  ambientResonanceWeight: 0,
  ambientResonanceSupport: false,
});
const LIVE_INPUT_ACOUSTIC_INTENT_PRESETS = Object.freeze({
  ambient: Object.freeze({
    confidenceOpenThreshold: 0.42,
    confidenceCloseThreshold: 0.24,
    releaseFrames: 7,
    ambientResonanceSupport: true,
    ambientResonanceWeight: 0.18,
  }),
  vocal: Object.freeze({
    confidenceOpenThreshold: 0.45,
    confidenceCloseThreshold: 0.3,
    releaseFrames: 4,
    ambientResonanceSupport: false,
    ambientResonanceWeight: 0,
  }),
});
const LIVE_INPUT_ACOUSTIC_INTENT_CONFIGS = Object.freeze(
  Object.fromEntries(
    Object.entries(LIVE_INPUT_ACOUSTIC_INTENT_PRESETS).map(
      ([intent, preset]) => [
        intent,
        Object.freeze({
          ...LIVE_INPUT_ACOUSTIC_GATE_BASE_CONFIG,
          ...preset,
        }),
      ],
    ),
  ),
);

/**
 * @typedef {{
 *   rms: number,
 *   peak: number,
 *   spectralCentroid: number,
 *   peakClarity?: number,
 * }} LiveInputEvidenceUnits
 *
 * @typedef {{
 *   evidenceUnits: LiveInputEvidenceUnits,
 *   evidenceSupports: LiveInputEvidenceUnits,
 *   sourceConfidence: number,
 *   confidenceOpenThreshold: number,
 *   confidenceCloseThreshold: number,
 *   humPenalty: number,
 *   ambientResonanceSupport: number,
 *   baselineRmsSpread: number,
 *   baselinePeakSpread: number,
 *   baselineCentroidSpread: number,
 *   openFrames: number,
 *   releaseFrames: number,
 * }} LiveInputGateDiagnostics
 */

/** @type {Readonly<LiveInputEvidenceUnits>} */
const EMPTY_LIVE_INPUT_EVIDENCE_UNITS = Object.freeze({
  rms: 0,
  peak: 0,
  spectralCentroid: 0,
});
/** @type {Readonly<LiveInputGateDiagnostics>} */
const EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS = Object.freeze({
  evidenceUnits: EMPTY_LIVE_INPUT_EVIDENCE_UNITS,
  evidenceSupports: EMPTY_LIVE_INPUT_EVIDENCE_UNITS,
  sourceConfidence: 0,
  confidenceOpenThreshold: 0,
  confidenceCloseThreshold: 0,
  humPenalty: 0,
  ambientResonanceSupport: 0,
  baselineRmsSpread: 0,
  baselinePeakSpread: 0,
  baselineCentroidSpread: 0,
  openFrames: 0,
  releaseFrames: 0,
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
  value.spectralLaneA = ensureArrayField(value, "spectralLaneA", slotLength);
  value.spectralLaneB = ensureArrayField(value, "spectralLaneB", slotLength);
  value.spectralMeta = ensureArrayField(value, "spectralMeta", slotLength);
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
  const sourceCoupledSpectralLaneA = ensureArrayField(
    analysisMemory,
    "sourceCoupledSpectralLaneA",
    slotLength,
  );
  const sourceCoupledSpectralLaneB = ensureArrayField(
    analysisMemory,
    "sourceCoupledSpectralLaneB",
    slotLength,
  );
  const sourceCoupledSpectralMeta = ensureArrayField(
    analysisMemory,
    "sourceCoupledSpectralMeta",
    slotLength,
  );
  const resonantSpectralLaneA = ensureArrayField(
    analysisMemory,
    "resonantSpectralLaneA",
    slotLength,
  );
  const resonantSpectralLaneB = ensureArrayField(
    analysisMemory,
    "resonantSpectralLaneB",
    slotLength,
  );
  const resonantSpectralMeta = ensureArrayField(
    analysisMemory,
    "resonantSpectralMeta",
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
  if (!analysisMemory.modalFieldContinuityState) {
    analysisMemory.modalFieldContinuityState =
      createModalFieldContinuityState();
  }
  if (!analysisMemory.modalDescriptorAuthorityState) {
    analysisMemory.modalDescriptorAuthorityState = {
      previousFieldAuthority: null,
    };
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
    sourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta,
    resonantSpectralLaneA,
    resonantSpectralLaneB,
    resonantSpectralMeta,
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
    modalFieldContinuityState: analysisMemory.modalFieldContinuityState,
    modalDescriptorAuthorityState: analysisMemory.modalDescriptorAuthorityState,
    sourceCoupledState: analysisMemory.sourceCoupledState,
    resonantState: analysisMemory.resonantState,
    bandState: analysisMemory.bandState,
    previousSpectrum: analysisMemory.previousSpectrum,
  };
}

function getFrameTimestamp() {
  return performance.now();
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
      normalizedAmplitude: normalizedRms,
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
    normalizedAmplitude: normalizedRms,
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

function derivePreviousCompositionSourceAuthorityScale({
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

function getModalFieldContinuityDeltaMs(previousFrameAtMs, currentFrameAtMs) {
  if (!Number.isFinite(previousFrameAtMs)) {
    return DEFAULT_FRAME_TIME_MS;
  }
  if (!Number.isFinite(currentFrameAtMs)) {
    return DEFAULT_FRAME_TIME_MS;
  }
  return Math.max(0, currentFrameAtMs - previousFrameAtMs);
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
  bandState.liveInputBaselineRmsSpread = 0;
  bandState.liveInputBaselinePeakSpread = 0;
  bandState.liveInputBaselineCentroidSpread = 0;
  bandState.liveInputGateDiagnostics = EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS;
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
  auditState.frozenSourceCoupledSpectralLaneA?.fill(0);
  auditState.frozenSourceCoupledSpectralLaneB?.fill(0);
  auditState.frozenSourceCoupledSpectralMeta?.fill(0);
  auditState.frozenResonantSpectralLaneA?.fill(0);
  auditState.frozenResonantSpectralLaneB?.fill(0);
  auditState.frozenResonantSpectralMeta?.fill(0);
}

function shouldBuildResonantedDebug(auditSettings) {
  return Boolean(auditSettings?.enabled);
}

function computeBasicFftSummary(fftLinearAmplitudes, sampleRate) {
  const summary = {
    peakMagnitude: 0,
    crediblePeakCount: 0,
    spectralEffectiveBinCount: 0,
    spectralCentroid: 0,
  };
  if (!fftLinearAmplitudes?.length) return summary;

  const nyquist = sampleRate ? sampleRate * 0.5 : 0;
  let weightedFrequency = 0;
  let powerTotal = 0;
  for (let i = 0; i < fftLinearAmplitudes.length; i += 1) {
    const amplitude = fftLinearAmplitudes[i] ?? 0;
    if (amplitude > summary.peakMagnitude) {
      summary.peakMagnitude = amplitude;
    }
    if (amplitude > 0 && sampleRate) {
      const frequency = binIndexToFrequencyHz(
        i,
        fftLinearAmplitudes.length,
        sampleRate,
      );
      const power = amplitude * amplitude;
      weightedFrequency += frequency * power;
      powerTotal += power;
    }
  }
  summary.spectralEffectiveBinCount =
    computeSpectralEffectiveBinCount(fftLinearAmplitudes);
  summary.crediblePeakCount = findCredibleSpectralPeaks(
    fftLinearAmplitudes,
    sampleRate,
    LIVE_INPUT_RESONANCE_PEAK_COUNT,
  ).length;

  if (powerTotal > Number.EPSILON) {
    summary.spectralCentroid = Math.min(
      1,
      weightedFrequency / powerTotal / Math.max(1, nyquist),
    );
  }

  return summary;
}

function computeTimeDataPeakAmplitude(timeData) {
  if (!(timeData instanceof Float32Array) || timeData.length === 0) {
    return 0;
  }

  let peak = 0;
  for (let index = 0; index < timeData.length; index += 1) {
    peak = Math.max(peak, Math.abs(timeData[index] ?? 0));
  }
  return peak;
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

function resolveModalObservationCoherence(structuralMetrics) {
  if (Number.isFinite(structuralMetrics?.modalObservationCoherence)) {
    return clamp01(structuralMetrics.modalObservationCoherence);
  }
  return 1;
}

function resolveModalObservationConfidence(structuralMetrics) {
  if (Number.isFinite(structuralMetrics?.modalObservationConfidence)) {
    return clamp01(structuralMetrics.modalObservationConfidence);
  }
  return 1;
}

function hasFeatureFrameRenderAuthority({
  fieldState,
  hasModalField,
  modalCoefficientEnergy,
  observationEnergy,
}) {
  if (fieldState === FIELD_STATES.test) {
    return true;
  }

  return (
    hasModalField &&
    (modalCoefficientEnergy > RENDER_ENERGY_EPSILON ||
      observationEnergy > RENDER_ENERGY_EPSILON)
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
  liveInputGateDiagnostics = EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
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
  fftLinearAmplitudes,
  spectralEffectiveBinCount = null,
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
  fftPeakAmplitude = 0,
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
    spectralEffectiveBinCount:
      spectralEffectiveBinCount ??
      computeSpectralEffectiveBinCount(fftLinearAmplitudes),
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
  const gateDiagnostics =
    liveInputGateDiagnostics ?? EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS;

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
    liveInputEvidenceUnits: {
      ...(gateDiagnostics.evidenceUnits ?? EMPTY_LIVE_INPUT_EVIDENCE_UNITS),
    },
    liveInputEvidenceSupports: {
      ...(gateDiagnostics.evidenceSupports ?? EMPTY_LIVE_INPUT_EVIDENCE_UNITS),
    },
    liveInputSourceConfidence: gateDiagnostics.sourceConfidence ?? 0,
    liveInputConfidenceOpenThreshold:
      gateDiagnostics.confidenceOpenThreshold ?? 0,
    liveInputConfidenceCloseThreshold:
      gateDiagnostics.confidenceCloseThreshold ?? 0,
    liveInputHumPenalty: gateDiagnostics.humPenalty ?? 0,
    liveInputAmbientResonanceSupport:
      gateDiagnostics.ambientResonanceSupport ?? 0,
    liveInputBaselineRmsSpread: gateDiagnostics.baselineRmsSpread ?? 0,
    liveInputBaselinePeakSpread: gateDiagnostics.baselinePeakSpread ?? 0,
    liveInputBaselineCentroidSpread:
      gateDiagnostics.baselineCentroidSpread ?? 0,
    liveInputOpenFramesRequired: gateDiagnostics.openFrames ?? 0,
    liveInputReleaseFrames: gateDiagnostics.releaseFrames ?? 0,
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
    spectralEffectiveBinCount:
      spectralEffectiveBinCount ??
      computeSpectralEffectiveBinCount(fftLinearAmplitudes),
    fftPeakAmplitude,
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
            fftLinearAmplitudes,
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
    highQSparseResonatorEvidence:
      modalVisibilitySummary.highQSparseResonatorEvidence ??
      structuralMetrics?.highQSparseResonatorEvidence ??
      0,
    highQProjectionLoad:
      modalVisibilitySummary.highQProjectionLoad ??
      structuralMetrics?.highQProjectionLoad ??
      0,
    modalPhaseAuthority: structuralMetrics?.modalPhaseAuthority ?? 0,
    modalObservationCoherence:
      resolveModalObservationCoherence(structuralMetrics),
    modalObservationConfidence:
      resolveModalObservationConfidence(structuralMetrics),
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
    fftLinearAmplitudes: null,
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
 *   modalFieldSpectralLaneA?: Float32Array | number[],
 *   modalFieldSpectralLaneB?: Float32Array | number[],
 *   modalFieldSpectralMeta?: Float32Array | number[],
 *   modalFieldMetadataSlots?: Float32Array | number[],
 * }} [options]
 */
function buildEmptyModalFieldDescriptor({
  generation = 0,
  maxTotalModes = AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldColorSlots,
  modalFieldSpectralLaneA,
  modalFieldSpectralLaneB,
  modalFieldSpectralMeta,
  modalFieldMetadataSlots,
} = {}) {
  const slotLength = Math.max(
    modalFieldSlots?.length ?? 0,
    modalFieldPhaseSlots?.length ?? 0,
    modalFieldColorSlots?.length ?? 0,
    modalFieldSpectralLaneA?.length ?? 0,
    modalFieldSpectralLaneB?.length ?? 0,
    modalFieldSpectralMeta?.length ?? 0,
    modalFieldMetadataSlots?.length ?? 0,
  );
  const emptySlots = new Float32Array(slotLength);

  return buildCanonicalFullModalDescriptor({
    generation,
    maxTotalModes,
    basisAtlasPageCapacity: MODAL_BASIS_STEADY_MODE_COUNT,
    modalFieldSlots: modalFieldSlots ?? emptySlots,
    modalFieldPhaseSlots: modalFieldPhaseSlots ?? emptySlots,
    modalFieldColorSlots: modalFieldColorSlots ?? emptySlots,
    modalFieldSpectralLaneA: modalFieldSpectralLaneA ?? emptySlots,
    modalFieldSpectralLaneB: modalFieldSpectralLaneB ?? emptySlots,
    modalFieldSpectralMeta: modalFieldSpectralMeta ?? emptySlots,
    modalFieldMetadataSlots: modalFieldMetadataSlots ?? emptySlots,
    activeModalFieldModeCount: 0,
    observerCandidateModeCount: 0,
    observedModalModeCount: 0,
    phaseAuthorityModeCount: 0,
    rawCandidateModeCount: 0,
    confidenceQualifiedCandidateModeCount: 0,
    lowConfidenceCandidateModeCount: 0,
    rawCandidateModalEnergy: 0,
    confidenceWeightedCandidateEnergy: 0,
    modalObservationCoherence: 0,
    modalObservationConfidence: 0,
    overBandwidthRejectedModeCount: 0,
    overBandwidthRejectedModalEnergy: 0,
    overBandwidthMaxRequestedModeIndex: 0,
    overBandwidthMaxRequestedMode: [0, 0, 0],
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
  sourceCoupledSpectralLaneA,
  sourceCoupledSpectralLaneB,
  sourceCoupledSpectralMeta,
  resonantSpectralLaneA,
  resonantSpectralLaneB,
  resonantSpectralMeta,
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
  sourceCoupledSpectralLaneA.fill(0);
  sourceCoupledSpectralLaneB.fill(0);
  sourceCoupledSpectralMeta.fill(0);
  resonantSpectralLaneA.fill(0);
  resonantSpectralLaneB.fill(0);
  resonantSpectralMeta.fill(0);
  bandEnergies.fill(0);
  clearModalStack(sourceCoupledState);
  clearModalStack(resonantState);
  if (featureState?.analysis) {
    featureState.analysis.modalFieldContinuityState =
      createModalFieldContinuityState();
    featureState.analysis.lastModalFieldContinuityFrameAtMs = undefined;
  }

  let silentFft = featureState?.analysis?.fftLinearAmplitudes;
  if (!silentFft?.length) {
    silentFft = new Float32Array((fftSize ?? 0) / 2);
  }
  silentFft.fill(0);

  if (featureState?.analysis) {
    featureState.analysis.fftLinearAmplitudes = silentFft;
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
    modalFieldSpectralLaneA: sourceCoupledSpectralLaneA,
    modalFieldSpectralLaneB: sourceCoupledSpectralLaneB,
    modalFieldSpectralMeta: sourceCoupledSpectralMeta,
    modalFieldMetadataSlots: new Float32Array(modeSlots.length),
  });
  if (featureState?.analysis?.modalDescriptorAuthorityState) {
    featureState.analysis.modalDescriptorAuthorityState.previousFieldAuthority =
      modalDescriptor.fieldAuthority;
  }
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy: sourceEvidence?.sourceEnergy ?? 0,
    renderBoundaryState:
      sourceEvidence?.renderBoundaryState ??
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
    fftLinearAmplitudes: silentFft,
    activeModeCount: 0,
    activeModalFieldModeCount: 0,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalFieldColorSlots: modalDescriptor.slotViews.modalFieldColorSlots,
    modalFieldSpectralLaneA: modalDescriptor.slotViews.modalFieldSpectralLaneA,
    modalFieldSpectralLaneB: modalDescriptor.slotViews.modalFieldSpectralLaneB,
    modalFieldSpectralMeta: modalDescriptor.slotViews.modalFieldSpectralMeta,
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
    fftLinearAmplitudes: new Float32Array(fftSize / 2),
    timeData: null,
    rms: 0,
  };
  const fftLinearAmplitudes = snapshot.fftLinearAmplitudes?.length
    ? snapshot.fftLinearAmplitudes
    : new Float32Array(fftSize / 2);

  fftLinearAmplitudes.fill(0);
  const testBinAmplitude = Math.max(
    0,
    Math.min(1, auditSettings.testToneAmplitude),
  );
  const testToneSignal = resolveTestToneSignal(auditSettings.testToneSignal);
  const injectHarmonicSeries =
    testToneSignal === TEST_TONE_SIGNALS.harmonicSeries;
  const nyquist = sampleRate * 0.5;
  const writeToneBin = (frequency, amplitude) => {
    const index = frequencyToBinIndex(
      frequency,
      fftLinearAmplitudes.length,
      sampleRate,
    );
    fftLinearAmplitudes[index] = Math.max(
      fftLinearAmplitudes[index] ?? 0,
      amplitude,
    );
    if (index > 0) {
      fftLinearAmplitudes[index - 1] = Math.max(
        fftLinearAmplitudes[index - 1] ?? 0,
        amplitude * 0.35,
      );
    }
    if (index < fftLinearAmplitudes.length - 1) {
      fftLinearAmplitudes[index + 1] = Math.max(
        fftLinearAmplitudes[index + 1] ?? 0,
        amplitude * 0.35,
      );
    }
  };
  const baseFrequency = Math.max(
    0,
    Math.min(nyquist, auditSettings.testToneHz),
  );

  writeToneBin(baseFrequency, testBinAmplitude);

  if (injectHarmonicSeries) {
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
      writeToneBin(harmonicFrequency, testBinAmplitude * attenuation);
    }
  }

  const timeData = new Float32Array(fftSize);
  if (baseFrequency > 0 && testBinAmplitude > 0) {
    for (let index = 0; index < timeData.length; index += 1) {
      const t = index / sampleRate;
      let sample = 0;
      if (injectHarmonicSeries) {
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
            Math.sin(
              2 * Math.PI * harmonicFrequency * t + harmonicIndex * 0.37,
            ) * attenuation;
        }
      } else {
        sample = Math.sin(2 * Math.PI * baseFrequency * t);
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
    fftLinearAmplitudes,
    timeData,
    rms: syntheticRms,
  };
}

function computeLiveInputMetrics({
  rms,
  fftLinearAmplitudes,
  sampleRate,
  timeDomainPeakAmplitude = 0,
  spectralCentroid: providedSpectralCentroid = null,
}) {
  const spectrum = fftLinearAmplitudes ?? new Float32Array(0);
  const peaks = findCredibleSpectralPeaks(
    spectrum,
    sampleRate,
    LIVE_INPUT_RESONANCE_PEAK_COUNT,
  );
  const totalCrediblePeakAmplitude = peaks.reduce(
    (sum, peak) => sum + (peak?.amplitude ?? 0),
    0,
  );
  const peakClarity = peaks.length
    ? (peaks[0]?.amplitude ?? 0) /
      Math.max(Number.EPSILON, totalCrediblePeakAmplitude)
    : 0;
  const peakFrequency = peaks[0]?.frequency ?? 0;
  return {
    rms,
    peakAmplitude: Number.isFinite(timeDomainPeakAmplitude)
      ? Math.max(0, timeDomainPeakAmplitude)
      : 0,
    peakFrequency,
    crediblePeakCount: peaks.length,
    peakClarity,
    spectralCentroid: Number.isFinite(providedSpectralCentroid)
      ? clamp01(providedSpectralCentroid)
      : computeSpectralCentroid(spectrum, sampleRate),
  };
}

function detectLiveInputHardSilence(metrics, thresholds) {
  return (
    metrics.rms <= thresholds.hardSilenceRms &&
    metrics.peakAmplitude <= thresholds.hardSilencePeak
  );
}

export function detectLiveInputNoiseGate({
  injectTestTone,
  inputMode,
  rms,
  fftLinearAmplitudes,
  sampleRate = DEFAULT_SAMPLE_RATE,
  timeDomainPeakAmplitude = 0,
  micAnalysisSettings = undefined,
  liveInputAnalysisSettings = undefined,
}) {
  const { acousticIntent } = normalizeLiveInputAnalysisSettings(
    micAnalysisSettings ?? liveInputAnalysisSettings,
  );
  const config = getLiveInputAcousticIntentConfig(acousticIntent);
  const metrics = computeLiveInputMetrics({
    rms,
    fftLinearAmplitudes,
    sampleRate,
    timeDomainPeakAmplitude,
  });
  const thresholds = {
    hardSilenceRms: config.absoluteRmsFloor,
    hardSilencePeak: config.absolutePeakFloor,
  };

  return (
    !injectTestTone &&
    inputMode === "live" &&
    detectLiveInputHardSilence(metrics, thresholds) &&
    metrics.crediblePeakCount === 0 &&
    metrics.spectralCentroid < config.absoluteCentroidFloor
  );
}

function isLiveInputCalibrationBaselineEmpty(bandState) {
  return (
    !(bandState.liveInputBaselineRms > 0) &&
    !(bandState.liveInputBaselinePeak > 0) &&
    !(bandState.liveInputBaselineCentroid > 0)
  );
}

function updateLiveInputBaselineMetric(
  bandState,
  valueField,
  spreadField,
  nextValue,
  alpha,
) {
  const previousValue = Math.max(0, bandState[valueField] ?? 0);
  const previousSpread = Math.max(0, bandState[spreadField] ?? 0);
  const deviation = Math.abs(Math.max(0, nextValue) - previousValue);
  bandState[valueField] = previousValue + (nextValue - previousValue) * alpha;
  bandState[spreadField] =
    previousSpread + (deviation - previousSpread) * alpha;
}

function updateLiveInputCalibrationBaseline(bandState, metrics, deltaMs) {
  const alpha = computeEmaAlpha(deltaMs, LIVE_INPUT_CALIBRATION_SMOOTHING_MS);
  if (isLiveInputCalibrationBaselineEmpty(bandState)) {
    bandState.liveInputBaselineRms = metrics.rms;
    bandState.liveInputBaselinePeak = metrics.peakAmplitude;
    bandState.liveInputBaselineCentroid = metrics.spectralCentroid;
    bandState.liveInputBaselineRmsSpread = 0;
    bandState.liveInputBaselinePeakSpread = 0;
    bandState.liveInputBaselineCentroidSpread = 0;
    return;
  }

  updateLiveInputBaselineMetric(
    bandState,
    "liveInputBaselineRms",
    "liveInputBaselineRmsSpread",
    metrics.rms,
    alpha,
  );
  updateLiveInputBaselineMetric(
    bandState,
    "liveInputBaselinePeak",
    "liveInputBaselinePeakSpread",
    metrics.peakAmplitude,
    alpha,
  );
  updateLiveInputBaselineMetric(
    bandState,
    "liveInputBaselineCentroid",
    "liveInputBaselineCentroidSpread",
    metrics.spectralCentroid,
    alpha,
  );
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
    metrics.rms <= LIVE_INPUT_INVALID_CURRENT_WEAK_RMS
  ) {
    return "compressed-baseline";
  }

  return "none";
}

function deriveLiveInputHardSilenceThresholds(bandState, profileConfig) {
  return {
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
  };
}

function computeLiveInputEvidenceDelta(spread, safetyFloor, profileConfig) {
  return Math.max(
    Math.max(0, spread ?? 0),
    Math.max(0, safetyFloor ?? 0) * profileConfig.evidenceFloorScale,
    1e-6,
  );
}

function computePositiveLiveInputEvidenceUnit({
  value,
  baseline,
  spread,
  safetyFloor,
  profileConfig,
}) {
  const delta = computeLiveInputEvidenceDelta(
    spread,
    safetyFloor,
    profileConfig,
  );
  return Math.max(0, (Math.max(0, value) - Math.max(0, baseline ?? 0)) / delta);
}

function computeLiveInputEvidenceUnits(bandState, metrics, profileConfig) {
  return {
    rms: computePositiveLiveInputEvidenceUnit({
      value: metrics.rms,
      baseline: bandState.liveInputBaselineRms,
      spread: bandState.liveInputBaselineRmsSpread,
      safetyFloor: profileConfig.absoluteRmsFloor,
      profileConfig,
    }),
    peak: computePositiveLiveInputEvidenceUnit({
      value: metrics.peakAmplitude,
      baseline: bandState.liveInputBaselinePeak,
      spread: bandState.liveInputBaselinePeakSpread,
      safetyFloor: profileConfig.absolutePeakFloor,
      profileConfig,
    }),
    spectralCentroid: computePositiveLiveInputEvidenceUnit({
      value: metrics.spectralCentroid,
      baseline: bandState.liveInputBaselineCentroid,
      spread: bandState.liveInputBaselineCentroidSpread,
      safetyFloor: profileConfig.absoluteCentroidFloor,
      profileConfig,
    }),
  };
}

function liveInputEvidenceUnitToSupport(evidenceUnit, profileConfig) {
  return clamp01(
    evidenceUnit / Math.max(1e-6, profileConfig.evidenceOpenUnits),
  );
}

function computeLiveInputAmbientResonanceSupport(metrics, profileConfig) {
  if (!profileConfig.ambientResonanceSupport) {
    return 0;
  }

  return Math.min(
    smoothstep(
      LIVE_INPUT_AMBIENT_RESONANCE_MIN_PEAK * 0.8,
      LIVE_INPUT_AMBIENT_RESONANCE_MIN_PEAK,
      metrics.peakAmplitude,
    ),
    smoothstep(
      LIVE_INPUT_AMBIENT_RESONANCE_MIN_CLARITY * 0.75,
      LIVE_INPUT_AMBIENT_RESONANCE_MIN_CLARITY,
      metrics.peakClarity,
    ),
    smoothstep(
      LIVE_INPUT_AMBIENT_RESONANCE_MIN_CENTROID * 0.75,
      LIVE_INPUT_AMBIENT_RESONANCE_MIN_CENTROID,
      metrics.spectralCentroid,
    ),
  );
}

function computeLiveInputHumPenalty(metrics, evidenceSupports) {
  const lowCentroid = 1 - smoothstep(0.006, 0.0132, metrics.spectralCentroid);
  const narrowLowPeak = evidenceSupports.peak * clamp01(metrics.peakClarity);
  const weakRms = 1 - evidenceSupports.rms;
  const missingSpectralSpread = 1 - evidenceSupports.spectralCentroid;
  return clamp01(
    lowCentroid *
      narrowLowPeak *
      weakRms *
      Math.max(clamp01(metrics.peakClarity), missingSpectralSpread),
  );
}

function computeLiveInputSourceConfidence(
  metrics,
  evidenceUnits,
  profileConfig,
) {
  const rawSupports = {
    rms: liveInputEvidenceUnitToSupport(evidenceUnits.rms, profileConfig),
    peak: liveInputEvidenceUnitToSupport(evidenceUnits.peak, profileConfig),
    spectralCentroid: liveInputEvidenceUnitToSupport(
      evidenceUnits.spectralCentroid,
      profileConfig,
    ),
  };
  const ambientResonanceSupport = computeLiveInputAmbientResonanceSupport(
    metrics,
    profileConfig,
  );
  const coherenceSupport = Math.max(
    rawSupports.spectralCentroid,
    ambientResonanceSupport,
    rawSupports.rms * 0.5,
  );
  const sourceEnvelopeSupport = Math.max(rawSupports.rms, rawSupports.peak);
  const evidenceSupports = {
    ...rawSupports,
    peakClarity:
      clamp01(metrics.peakClarity) * coherenceSupport * sourceEnvelopeSupport,
  };
  const humPenalty = computeLiveInputHumPenalty(metrics, rawSupports);
  const weights = profileConfig.confidenceWeights;
  const weightedConfidence =
    weights.rms * evidenceSupports.rms +
    weights.peak * evidenceSupports.peak +
    weights.spectralCentroid * evidenceSupports.spectralCentroid +
    weights.peakClarity * evidenceSupports.peakClarity +
    profileConfig.ambientResonanceWeight * ambientResonanceSupport -
    profileConfig.humPenaltyWeight * humPenalty;

  return {
    evidenceSupports,
    sourceConfidence: clamp01(weightedConfidence),
    humPenalty,
    ambientResonanceSupport,
  };
}

function buildLiveInputGateDiagnostics({
  bandState,
  profileConfig,
  evidenceUnits = EMPTY_LIVE_INPUT_EVIDENCE_UNITS,
  evidenceSupports = EMPTY_LIVE_INPUT_EVIDENCE_UNITS,
  sourceConfidence = 0,
  humPenalty = 0,
  ambientResonanceSupport = 0,
}) {
  return {
    evidenceUnits: { ...evidenceUnits },
    evidenceSupports: { ...evidenceSupports },
    sourceConfidence,
    confidenceOpenThreshold: profileConfig.confidenceOpenThreshold,
    confidenceCloseThreshold: profileConfig.confidenceCloseThreshold,
    humPenalty,
    ambientResonanceSupport,
    baselineRmsSpread: bandState.liveInputBaselineRmsSpread ?? 0,
    baselinePeakSpread: bandState.liveInputBaselinePeakSpread ?? 0,
    baselineCentroidSpread: bandState.liveInputBaselineCentroidSpread ?? 0,
    openFrames: profileConfig.openFrames,
    releaseFrames: profileConfig.releaseFrames,
  };
}

function resolveLiveInputNoiseGate({
  analysisMemory,
  injectTestTone,
  inputMode,
  rms,
  fftLinearAmplitudes,
  sampleRate,
  timeDomainPeakAmplitude = 0,
  spectralCentroidHint = null,
  currentFrameAtMs,
  calibrationVersion = 0,
  micAnalysisSettings,
}) {
  const bandState = analysisMemory.bandState;
  const { acousticIntent } =
    normalizeLiveInputAnalysisSettings(micAnalysisSettings);
  const acousticIntentConfig = getLiveInputAcousticIntentConfig(acousticIntent);
  if (injectTestTone || inputMode !== "live") {
    resetLiveInputGateState(bandState, {
      inputMode,
      policy: acousticIntent,
      calibrationVersion,
    });
    const gateDiagnostics = buildLiveInputGateDiagnostics({
      bandState,
      profileConfig: acousticIntentConfig,
    });
    bandState.liveInputGateDiagnostics = gateDiagnostics;
    return {
      active: false,
      hardSilence: false,
      invalid: false,
      invalidReason: "none",
      gateDiagnostics,
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

  const metrics = computeLiveInputMetrics({
    rms,
    fftLinearAmplitudes,
    sampleRate,
    timeDomainPeakAmplitude,
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
    const gateDiagnostics = buildLiveInputGateDiagnostics({
      bandState,
      profileConfig: acousticIntentConfig,
    });
    bandState.liveInputGateDiagnostics = gateDiagnostics;
    if (
      currentFrameAtMs - bandState.liveInputCalibrationStartedAtMs <
      LIVE_INPUT_CALIBRATION_WINDOW_MS
    ) {
      return {
        active: true,
        hardSilence: true,
        invalid: bandState.liveInputCalibrationInvalid,
        invalidReason: bandState.liveInputCalibrationInvalidReason ?? "none",
        gateDiagnostics,
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
      const invalidGateDiagnostics = buildLiveInputGateDiagnostics({
        bandState,
        profileConfig: acousticIntentConfig,
      });
      bandState.liveInputGateDiagnostics = invalidGateDiagnostics;
      return {
        active: true,
        hardSilence: true,
        invalid: true,
        invalidReason: calibrationInvalidReason,
        gateDiagnostics: invalidGateDiagnostics,
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
    const invalidGateDiagnostics = buildLiveInputGateDiagnostics({
      bandState,
      profileConfig: acousticIntentConfig,
    });
    bandState.liveInputGateDiagnostics = invalidGateDiagnostics;
    return {
      active: true,
      hardSilence: true,
      invalid: true,
      invalidReason: invalidCalibrationReason,
      gateDiagnostics: invalidGateDiagnostics,
    };
  }

  const hardGateActive =
    !injectTestTone &&
    inputMode === "live" &&
    detectLiveInputHardSilence(metrics, {
      hardSilenceRms: acousticIntentConfig.absoluteRmsFloor,
      hardSilencePeak: acousticIntentConfig.absolutePeakFloor,
    }) &&
    metrics.spectralCentroid < acousticIntentConfig.absoluteCentroidFloor;
  const hardSilenceThresholds = deriveLiveInputHardSilenceThresholds(
    bandState,
    acousticIntentConfig,
  );
  const evidenceUnits = computeLiveInputEvidenceUnits(
    bandState,
    metrics,
    acousticIntentConfig,
  );
  const confidenceResult = computeLiveInputSourceConfidence(
    metrics,
    evidenceUnits,
    acousticIntentConfig,
  );
  const gateDiagnostics = buildLiveInputGateDiagnostics({
    bandState,
    profileConfig: acousticIntentConfig,
    evidenceUnits,
    evidenceSupports: confidenceResult.evidenceSupports,
    sourceConfidence: confidenceResult.sourceConfidence,
    humPenalty: confidenceResult.humPenalty,
    ambientResonanceSupport: confidenceResult.ambientResonanceSupport,
  });
  bandState.liveInputGateDiagnostics = gateDiagnostics;
  const hardSilence =
    detectLiveInputHardSilence(metrics, hardSilenceThresholds) &&
    metrics.crediblePeakCount === 0;

  if (hardSilence) {
    bandState.liveInputGateState = "closed";
    bandState.liveInputQuietFrames = 0;
    bandState.liveInputOpenFrames = 0;
    return {
      active: true,
      hardSilence: true,
      invalid: false,
      invalidReason: "none",
      gateDiagnostics,
    };
  }

  if (bandState.liveInputGateState === "open") {
    if (
      !hardGateActive &&
      confidenceResult.sourceConfidence >=
        acousticIntentConfig.confidenceCloseThreshold
    ) {
      bandState.liveInputQuietFrames = 0;
      return {
        active: false,
        hardSilence: false,
        invalid: false,
        invalidReason: "none",
        gateDiagnostics,
      };
    }

    bandState.liveInputQuietFrames += 1;
    if (bandState.liveInputQuietFrames < acousticIntentConfig.releaseFrames) {
      return {
        active: false,
        hardSilence: false,
        invalid: false,
        invalidReason: "none",
        gateDiagnostics,
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
      gateDiagnostics,
    };
  }

  if (
    !hardGateActive &&
    confidenceResult.sourceConfidence >=
      acousticIntentConfig.confidenceOpenThreshold
  ) {
    bandState.liveInputOpenFrames += 1;
    if (bandState.liveInputOpenFrames >= acousticIntentConfig.openFrames) {
      bandState.liveInputGateState = "open";
      bandState.liveInputOpenFrames = 0;
      bandState.liveInputQuietFrames = 0;
      return {
        active: false,
        hardSilence: false,
        invalid: false,
        invalidReason: "none",
        gateDiagnostics,
      };
    }
    return {
      active: true,
      hardSilence: false,
      invalid: false,
      invalidReason: "none",
      gateDiagnostics,
    };
  }

  bandState.liveInputOpenFrames = 0;
  return {
    active: true,
    hardSilence: false,
    invalid: false,
    invalidReason: "none",
    gateDiagnostics,
  };
}

function computeSpectralCentroid(fftLinearAmplitudes, sampleRate) {
  if (!fftLinearAmplitudes?.length || !sampleRate) return 0;

  const nyquist = sampleRate * 0.5;
  let weightedFrequency = 0;
  let powerTotal = 0;
  for (let i = 0; i < fftLinearAmplitudes.length; i++) {
    const amplitude = fftLinearAmplitudes[i] ?? 0;
    if (amplitude <= 0) continue;
    const frequency = binIndexToFrequencyHz(
      i,
      fftLinearAmplitudes.length,
      sampleRate,
    );
    const power = amplitude * amplitude;
    weightedFrequency += frequency * power;
    powerTotal += power;
  }

  if (powerTotal <= Number.EPSILON) return 0;
  return Math.min(1, weightedFrequency / powerTotal / Math.max(1, nyquist));
}

function computeSignalSpectrumMetrics({
  fftLinearAmplitudes,
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
  if (!fftLinearAmplitudes?.length) {
    return empty;
  }

  const hasFrequencyDomain = Boolean(sampleRate);
  const hasBandEnergyDomain = hasFrequencyDomain && Boolean(fftSize);
  const bandPowerSums = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const spectralPowerSums = hasFrequencyDomain
    ? new Float32Array(SPECTRAL_BAND_6_COUNT)
    : null;
  const fluxLimit = previousSpectrum?.length
    ? Math.min(fftLinearAmplitudes.length, previousSpectrum.length)
    : 0;
  const nyquist = hasFrequencyDomain ? sampleRate * 0.5 : 0;
  let weightedFrequency = 0;
  let totalPower = 0;
  let positivePowerDelta = 0;
  let trebleAmplitudeSum = 0;
  let treblePower = 0;
  let trebleLogSum = 0;
  let trebleCount = 0;

  for (let i = 0; i < fftLinearAmplitudes.length; i += 1) {
    const amplitude = fftLinearAmplitudes[i] ?? 0;
    const power = amplitude * amplitude;
    totalPower += power;

    if (i < fluxLimit) {
      const previousAmplitude = previousSpectrum[i] ?? 0;
      const powerDelta = power - previousAmplitude * previousAmplitude;
      if (powerDelta > 0) positivePowerDelta += powerDelta;
    }

    if (!hasFrequencyDomain) {
      continue;
    }

    const frequency = binIndexToFrequencyHz(
      i,
      fftLinearAmplitudes.length,
      sampleRate,
    );
    if (amplitude > 0) {
      weightedFrequency += frequency * power;
    }

    if (hasBandEnergyDomain) {
      let bandIndex = BAND_BUCKET_COUNT - 1;
      for (let j = 0; j < BAND_LIMITS_HZ.length; j += 1) {
        if (frequency <= BAND_LIMITS_HZ[j]) {
          bandIndex = j;
          break;
        }
      }
      bandPowerSums[bandIndex] += power;
    }

    let spectralBandIndex = SPECTRAL_BAND_6_COUNT - 1;
    for (let j = 0; j < SPECTRAL_BAND_6_LIMITS_HZ.length; j += 1) {
      if (frequency <= SPECTRAL_BAND_6_LIMITS_HZ[j]) {
        spectralBandIndex = j;
        break;
      }
    }
    spectralPowerSums[spectralBandIndex] += power;

    if (
      frequency >= TREBLE_FLATNESS_MIN_HZ &&
      frequency <= TREBLE_FLATNESS_MAX_HZ
    ) {
      trebleAmplitudeSum += amplitude;
      treblePower += power;
      trebleLogSum += Math.log(Math.max(amplitude, 1e-8));
      trebleCount += 1;
    }
  }

  if (fluxLimit > 0) {
    empty.spectralFlux = Math.min(
      1,
      positivePowerDelta / Math.max(Number.EPSILON, totalPower),
    );
  }

  if (hasBandEnergyDomain && totalPower > Number.EPSILON) {
    for (let i = 0; i < BAND_BUCKET_COUNT; i += 1) {
      bandEnergies[i] = bandPowerSums[i] / totalPower;
    }
  }

  if (hasFrequencyDomain && totalPower > Number.EPSILON) {
    for (let i = 0; i < SPECTRAL_BAND_6_COUNT; i += 1) {
      spectralBandEnergies[i] = spectralPowerSums[i] / totalPower;
    }

    empty.spectralCentroid = Math.min(
      1,
      weightedFrequency / totalPower / Math.max(1, nyquist),
    );

    let trebleFlatness = 0;
    let trebleMean = 0;
    if (trebleCount > 0) {
      trebleMean = trebleAmplitudeSum / trebleCount;
      const trebleGeometricMean = Math.exp(trebleLogSum / trebleCount);
      trebleFlatness =
        trebleMean > 1e-8 ? Math.min(1, trebleGeometricMean / trebleMean) : 0;
    }
    const trebleEnergyFraction = treblePower / totalPower;
    empty.trebleBroadbandEnergy = clamp01(
      trebleEnergyFraction * trebleFlatness,
    );
    empty.trebleTonalEnergy = clamp01(
      trebleEnergyFraction * (1 - trebleFlatness),
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

function sumModalSlotCoefficientEnergy(modeSlots, capacity) {
  const slotCount = Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const coefficient = modeSlots?.[index * 4 + 3] ?? 0;
    if (coefficient > 0) {
      total += coefficient * coefficient;
    }
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
        : { sideLengthMeters: radius },
    boundaryMode,
  };
}

function buildModalSlotModeKey(sourceSlots, sourceOffset) {
  const u = Math.round(sourceSlots?.[sourceOffset] ?? 0);
  const v = Math.round(sourceSlots?.[sourceOffset + 1] ?? 0);
  const w = Math.round(sourceSlots?.[sourceOffset + 2] ?? 0);
  return `${u}:${v}:${w}`;
}

function buildModalCandidateMetadataSlots({
  slots,
  activeModeCount,
  capacity,
  candidateState,
}) {
  if (!candidateState || typeof candidateState.get !== "function") {
    return null;
  }
  if (candidateState.size === 0) {
    return null;
  }

  const slotLength = slots?.length ?? 0;
  const slotLimit = Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor(slotLength / 4),
  );
  const validLimit = Math.max(0, Math.floor(activeModeCount ?? 0));
  const metadataSlots = new Float32Array(slotLength);
  metadataSlots.fill(Number.NaN);
  let seen = 0;
  let wroteSupport = false;

  for (
    let sourceIndex = 0;
    sourceIndex < slotLimit && seen < validLimit;
    sourceIndex += 1
  ) {
    const sourceOffset = sourceIndex * 4;
    if (!((slots?.[sourceOffset + 3] ?? 0) > 0)) {
      continue;
    }
    seen += 1;

    const candidate = candidateState.get(
      buildModalSlotModeKey(slots, sourceOffset),
    );
    if (!candidate) {
      continue;
    }

    if (Number.isFinite(candidate.naturalFrequencyHz)) {
      metadataSlots[sourceOffset] = candidate.naturalFrequencyHz;
    }
    if (Number.isFinite(candidate.qualityFactor)) {
      metadataSlots[sourceOffset + 1] = candidate.qualityFactor;
    }
    if (Number.isFinite(candidate.dampingRatio)) {
      metadataSlots[sourceOffset + 2] = candidate.dampingRatio;
    }
    if (Number.isFinite(candidate.observedSupport)) {
      metadataSlots[sourceOffset + 3] = clamp01(candidate.observedSupport);
      wroteSupport = true;
    }
  }

  return wroteSupport ? metadataSlots : null;
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
  modalObservationConfidence = 1,
  defaultCandidateSupport = 1,
}) {
  const u = sourceSlots?.[sourceOffset] ?? 0;
  const v = sourceSlots?.[sourceOffset + 1] ?? 0;
  const w = sourceSlots?.[sourceOffset + 2] ?? 0;
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
  const baseSupport = Number.isFinite(explicitObservedSupport)
    ? clamp01(explicitObservedSupport)
    : Math.max(phaseEvidence, clamp01(defaultCandidateSupport));
  const observedSupport = clamp01(
    baseSupport * clamp01(modalObservationConfidence),
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
  targetSpectralLaneA,
  targetSpectralLaneB,
  targetSpectralMeta,
  targetMetadataSlots,
  writeIndex,
  sourceSlots,
  sourcePhaseSlots,
  sourceColorSlots,
  sourceSpectralLaneA,
  sourceSpectralLaneB,
  sourceSpectralMeta,
  sourceMetadataSlots,
  validCount,
  frequencyOptions,
  modalObservationConfidence,
  defaultCandidateSupport,
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

    targetSpectralLaneA[targetOffset] =
      sourceSpectralLaneA?.[sourceOffset] ?? 0;
    targetSpectralLaneA[targetOffset + 1] =
      sourceSpectralLaneA?.[sourceOffset + 1] ?? 0;
    targetSpectralLaneA[targetOffset + 2] =
      sourceSpectralLaneA?.[sourceOffset + 2] ?? 0;
    targetSpectralLaneA[targetOffset + 3] =
      sourceSpectralLaneA?.[sourceOffset + 3] ?? 0;

    targetSpectralLaneB[targetOffset] =
      sourceSpectralLaneB?.[sourceOffset] ?? 0;
    targetSpectralLaneB[targetOffset + 1] =
      sourceSpectralLaneB?.[sourceOffset + 1] ?? 0;
    targetSpectralLaneB[targetOffset + 2] =
      sourceSpectralLaneB?.[sourceOffset + 2] ?? 0;
    targetSpectralLaneB[targetOffset + 3] =
      sourceSpectralLaneB?.[sourceOffset + 3] ?? 0;

    targetSpectralMeta[targetOffset] = sourceSpectralMeta?.[sourceOffset] ?? 0;
    targetSpectralMeta[targetOffset + 1] =
      sourceSpectralMeta?.[sourceOffset + 1] ?? 0;
    targetSpectralMeta[targetOffset + 2] =
      sourceSpectralMeta?.[sourceOffset + 2] ?? 0;
    targetSpectralMeta[targetOffset + 3] =
      sourceSpectralMeta?.[sourceOffset + 3] ?? 0;

    const metadata = buildModalFieldMetadataSlot({
      sourceSlots,
      sourcePhaseSlots,
      sourceMetadataSlots,
      sourceOffset,
      frequencyOptions,
      modalObservationConfidence,
      defaultCandidateSupport,
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
  sourceCoupledSpectralLaneA,
  sourceCoupledSpectralLaneB,
  sourceCoupledSpectralMeta,
  resonantSpectralLaneA,
  resonantSpectralLaneB,
  resonantSpectralMeta,
  sourceCoupledMetadataSlots = null,
  resonantMetadataSlots = null,
  activeSourceCoupledModeCount,
  activeResonantModeCount,
  radius,
  cavityAcousticScale,
  boundaryMode,
  modalObservationConfidence = 1,
  defaultCandidateSupport = 1,
}) {
  const candidateCount =
    Math.max(0, Math.floor(activeSourceCoupledModeCount ?? 0)) +
    Math.max(0, Math.floor(activeResonantModeCount ?? 0));
  const slotLength = candidateCount * 4;
  const modalFieldSlots = new Float32Array(slotLength);
  const modalFieldPhaseSlots = new Float32Array(slotLength);
  const modalFieldColorSlots = new Float32Array(slotLength);
  const modalFieldSpectralLaneA = new Float32Array(slotLength);
  const modalFieldSpectralLaneB = new Float32Array(slotLength);
  const modalFieldSpectralMeta = new Float32Array(slotLength);
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
    targetSpectralLaneA: modalFieldSpectralLaneA,
    targetSpectralLaneB: modalFieldSpectralLaneB,
    targetSpectralMeta: modalFieldSpectralMeta,
    targetMetadataSlots: modalFieldMetadataSlots,
    writeIndex: activeModalFieldModeCount,
    sourceSlots: candidateForcingSlots,
    sourcePhaseSlots: sourceCoupledPhaseSlots,
    sourceColorSlots: sourceCoupledColorSlots,
    sourceSpectralLaneA: sourceCoupledSpectralLaneA,
    sourceSpectralLaneB: sourceCoupledSpectralLaneB,
    sourceSpectralMeta: sourceCoupledSpectralMeta,
    sourceMetadataSlots: sourceCoupledMetadataSlots,
    validCount: activeSourceCoupledModeCount,
    frequencyOptions,
    modalObservationConfidence,
    defaultCandidateSupport,
  });
  activeModalFieldModeCount = writeModalFieldCandidates({
    targetSlots: modalFieldSlots,
    targetPhaseSlots: modalFieldPhaseSlots,
    targetColorSlots: modalFieldColorSlots,
    targetSpectralLaneA: modalFieldSpectralLaneA,
    targetSpectralLaneB: modalFieldSpectralLaneB,
    targetSpectralMeta: modalFieldSpectralMeta,
    targetMetadataSlots: modalFieldMetadataSlots,
    writeIndex: activeModalFieldModeCount,
    sourceSlots: candidateResponseSlots,
    sourcePhaseSlots: resonantPhaseSlots,
    sourceColorSlots: resonantColorSlots,
    sourceSpectralLaneA: resonantSpectralLaneA,
    sourceSpectralLaneB: resonantSpectralLaneB,
    sourceSpectralMeta: resonantSpectralMeta,
    sourceMetadataSlots: resonantMetadataSlots,
    validCount: activeResonantModeCount,
    frequencyOptions,
    modalObservationConfidence,
    defaultCandidateSupport,
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldColorSlots,
    modalFieldSpectralLaneA,
    modalFieldSpectralLaneB,
    modalFieldSpectralMeta,
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
  const lowQSourceCoupledVisibilityAuthority = clamp01(
    lowQEnergyGate *
      lowQCoherenceGate *
      snrGate *
      sourceSupportGate *
      smoothstep(0, 2, activeSourceCoupledModeCount),
  );

  return {
    lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledVisibilityEnergy:
      LOW_Q_SOURCE_COUPLED_VISIBILITY_ENERGY_MAX *
      lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledTopologyFloor:
      LOW_Q_SOURCE_COUPLED_TOPOLOGY_FLOOR_MAX *
      lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledSourceSupport: sourceSupport,
    lowQSourceCoupledVisibilityRejected: Boolean(
      hasLowQSourceCoupledCandidate &&
      lowQSourceCoupledVisibilityAuthority <= 0,
    ),
  };
}

function deriveModalObserverVisibilityComponents({
  structuralMetrics = null,
  hardSilent = false,
  sourceNormalization = undefined,
  bandEnergies = null,
  activeSourceCoupledModeCount = 0,
  spectralEffectiveBinCount = 0,
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
  const highQSparseResonatorEvidence = deriveHighQSparseResonatorEvidence({
    highQObservedSnr,
    highQObservedCoherence,
    highQObservedDrive: structuralMetrics.highQObservedDrive ?? 0,
    highQRingSupport,
    highQResonantEnergy,
    distributedExcitation: structuralMetrics.distributedExcitation ?? 0,
    periodicity,
    spectralEffectiveBinCount,
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
      highQSparseResonatorEvidence.highQSparseResonatorEvidence *
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
    ...highQSparseResonatorEvidence,
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
  spectralEffectiveBinCount = 0,
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
    highQSparseResonatorEvidence: 0,
    highQProjectionLoad: 0,
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
  const retainedDisplayCacheOnly =
    hasRenderAuthoritativeEnergy &&
    Number.isFinite(structuralMetrics?.currentSignalAmplitude) &&
    structuralMetrics.currentSignalAmplitude <= RENDER_ENERGY_EPSILON;
  const visibilityEnergyCeiling = retainedDisplayCacheOnly
    ? renderAuthoritativeEnergy
    : 1;

  const observerVisibility = deriveModalObserverVisibilityComponents({
    structuralMetrics,
    hardSilent,
    sourceNormalization,
    bandEnergies,
    activeSourceCoupledModeCount,
    spectralEffectiveBinCount,
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
  const highQSparseResonatorEvidence = clamp01(
    observerVisibility.highQSparseResonatorEvidence,
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
    highQSparseResonatorEvidence;
  const retainedHighQObserverSupport =
    MODAL_VISIBILITY_HIGH_Q_OBSERVER_MIN_SUPPORT_WEIGHT +
    highQSparseResonatorEvidence * 0.08 +
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
    highQSparseResonatorEvidence;
  const retainedHighQModalVisibility = Math.min(
    visibilityEnergyCeiling,
    clamp01(
      Math.max(
        retainedHighQObserverAuthority * MODAL_VISIBILITY_HIGH_Q_RETAINED_MAX,
        observerVisibility.highQObserverVisibilityEnergy *
          MODAL_VISIBILITY_HIGH_Q_RETAINED_MAX *
          0.68,
      ),
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
    modalVisibilityEnergy: Math.min(
      visibilityEnergyCeiling,
      clamp01(
        Math.max(
          distributedModalVisibility,
          dominantModalVisibility,
          highQVisibilityGate * MODAL_VISIBILITY_HIGH_Q_MAX,
        ),
      ),
    ),
    modalObserverVisibilityEnergy: Math.min(
      visibilityEnergyCeiling,
      observerVisibility.modalObserverVisibilityEnergy,
    ),
    highQObserverVisibilityEnergy:
      observerVisibility.highQObserverVisibilityEnergy,
    lowQObserverVisibilityEnergy:
      observerVisibility.lowQObserverVisibilityEnergy,
    modalObserverTopologyFloor: observerVisibility.modalObserverTopologyFloor,
    lowQSourceCoupledVisibilityAuthority:
      observerVisibility.lowQSourceCoupledVisibilityAuthority,
    lowQSourceCoupledVisibilityEnergy: Math.min(
      visibilityEnergyCeiling,
      observerVisibility.lowQSourceCoupledVisibilityEnergy,
    ),
    lowQSourceCoupledTopologyFloor:
      observerVisibility.lowQSourceCoupledTopologyFloor,
    lowQSourceCoupledSourceSupport:
      observerVisibility.lowQSourceCoupledSourceSupport,
    lowQSourceCoupledVisibilityRejected:
      observerVisibility.lowQSourceCoupledVisibilityRejected,
    retainedHighQModalVisibility,
    highQSparseResonatorEvidence,
    highQProjectionLoad: observerVisibility.highQProjectionLoad,
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
  spectralEffectiveBinCount = 0,
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
    spectralEffectiveBinCount,
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
  fftLinearAmplitudes,
  sampleRate,
  fftSize,
  rms,
  frameTimeMs,
  beatSettings,
  suppressBeat = false,
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
    bandState.previousBeatAtMs = currentFrameAtMs;
    bandState.beatPulseId = (bandState.beatPulseId ?? 0) + 1;
  }

  if (beatDetected) {
    recordBeatTimestamp(bandState, currentFrameAtMs);
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
  liveInputGateDiagnostics = EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
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
  fftLinearAmplitudes,
  spectralEffectiveBinCount = null,
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
  fftPeakAmplitude = 0,
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
    liveInputGateDiagnostics,
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
    fftLinearAmplitudes,
    spectralEffectiveBinCount,
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
    fftPeakAmplitude,
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
  if (typeof status?.sessionKey === "string" && status.sessionKey) {
    return status.sessionKey;
  }

  if (inputMode === "file") {
    return `file:${status?.playbackSessionId ?? "none"}`;
  }

  if (inputMode === "live") {
    return `live:${status?.liveInputSessionId ?? "none"}`;
  }

  if (inputMode === "system") {
    return `system:${status?.liveInputSessionId ?? "none"}`;
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
    testToneSignal: resolveTestToneSignal(
      resolvedAuditSettings?.testToneSignal,
    ),
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
    fftLinearAmplitudes: new Float32Array(safeFftSize / 2),
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
    sourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta,
    resonantSpectralLaneA,
    resonantSpectralLaneB,
    resonantSpectralMeta,
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
    modalFieldContinuityState,
    modalDescriptorAuthorityState,
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
          fftPeakAmplitude: 0,
          spectralEffectiveBinCount: 0,
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
      modalFieldContinuityState,
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
        sourceCoupledSpectralLaneA,
        sourceCoupledSpectralLaneB,
        sourceCoupledSpectralMeta,
        resonantSpectralLaneA,
        resonantSpectralLaneB,
        resonantSpectralMeta,
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
  const timeDomainPeakAmplitude = computeTimeDataPeakAmplitude(
    snapshot?.timeData,
  );
  const fftLinearAmplitudesSource =
    snapshot?.fftLinearAmplitudes ?? new Float32Array(fftSize / 2);
  const fftSummary = computeBasicFftSummary(
    fftLinearAmplitudesSource,
    sampleRate,
  );
  const fftPeakAmplitude = fftSummary.peakMagnitude;
  const spectralCentroidHint = fftSummary.spectralCentroid;
  const {
    active: liveInputNoiseGateActive,
    hardSilence: liveInputHardSilenceActive,
    invalid: liveInputCalibrationInvalid,
    invalidReason: liveInputCalibrationInvalidReason,
    gateDiagnostics: liveInputGateDiagnostics,
  } = isAcousticLiveInput
    ? resolveLiveInputNoiseGate({
        analysisMemory,
        injectTestTone: resolvedAuditSettings.injectTestTone,
        inputMode,
        rms: analyserRms,
        fftLinearAmplitudes: fftLinearAmplitudesSource,
        sampleRate,
        timeDomainPeakAmplitude,
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
          gateDiagnostics: EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
        };
      })();

  const analysisSessionKey = resolveFeatureAnalysisSessionKey(
    status,
    inputMode,
  );
  const lineFeedMetrics = isLineFeedLiveInput
    ? {
        ...computeLiveInputMetrics({
          rms: analyserRms,
          fftLinearAmplitudes: fftLinearAmplitudesSource,
          sampleRate,
          timeDomainPeakAmplitude,
          spectralCentroid: spectralCentroidHint,
        }),
        avgAmplitude,
        timeDomainPeakAmplitude,
        credibleSpectralPeakCount: fftSummary.crediblePeakCount,
        transportSpectrumSilent:
          fftSummary.spectralEffectiveBinCount === 0 &&
          fftPeakAmplitude <= SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor,
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
          deviceFloorRms: 0,
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
        fftPeakAmplitude,
        credibleSpectralPeakCount: fftSummary.crediblePeakCount,
        timeDomainPeakAmplitude,
        spectralEffectiveBinCount: fftSummary.spectralEffectiveBinCount,
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
    sourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta,
    resonantSpectralLaneA,
    resonantSpectralLaneB,
    resonantSpectralMeta,
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
    modalFieldContinuityState,
    modalDescriptorAuthorityState,
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
    fftLinearAmplitudesSource,
    fftPeakAmplitude,
    spectralCentroidHint,
    spectralEffectiveBinCount: fftSummary.spectralEffectiveBinCount,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputGateDiagnostics:
      liveInputGateDiagnostics ?? EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
    lineFeedProgramActive: lineFeedProgramActivity.programActive === true,
    lineFeedProgramExcitation: lineFeedProgramActivity.programExcitation ?? 0,
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

function ensureAnalysisFftBuffer(preparedInputs) {
  const { analysisMemory, featureState, fftLinearAmplitudesSource } =
    preparedInputs;

  let fftLinearAmplitudes = analysisMemory.fftLinearAmplitudes;
  if (
    !fftLinearAmplitudes ||
    fftLinearAmplitudes.length !== fftLinearAmplitudesSource.length
  ) {
    fftLinearAmplitudes = new Float32Array(fftLinearAmplitudesSource.length);
    if (featureState?.analysis) {
      featureState.analysis.fftLinearAmplitudes = fftLinearAmplitudes;
    }
  }
  fftLinearAmplitudes.set(fftLinearAmplitudesSource);
  return fftLinearAmplitudes;
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
  const sourceCoupledSpectralLaneASource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenSourceCoupledSpectralLaneA
      : (structuralState?.sourceCoupledSpectralLaneASource ??
        preparedInputs.sourceCoupledState.spectralLaneA)
    : null;
  const sourceCoupledSpectralLaneBSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenSourceCoupledSpectralLaneB
      : (structuralState?.sourceCoupledSpectralLaneBSource ??
        preparedInputs.sourceCoupledState.spectralLaneB)
    : null;
  const sourceCoupledSpectralMetaSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenSourceCoupledSpectralMeta
      : (structuralState?.sourceCoupledSpectralMetaSource ??
        preparedInputs.sourceCoupledState.spectralMeta)
    : null;
  const resonantSpectralLaneASource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenResonantSpectralLaneA
      : (structuralState?.resonantSpectralLaneASource ??
        preparedInputs.resonantState.spectralLaneA)
    : null;
  const resonantSpectralLaneBSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenResonantSpectralLaneB
      : (structuralState?.resonantSpectralLaneBSource ??
        preparedInputs.resonantState.spectralLaneB)
    : null;
  const resonantSpectralMetaSource = shouldBuildSpectralLight
    ? hasFrozenProjection
      ? auditState.frozenResonantSpectralMeta
      : (structuralState?.resonantSpectralMetaSource ??
        preparedInputs.resonantState.spectralMeta)
    : null;
  const referenceSourceCoupledSlotsSource =
    structuralState?.referenceSourceCoupledSlotsSource ??
    preparedInputs.sourceCoupledState.referenceSlots;
  const referenceResonantSlotsSource =
    structuralState?.referenceResonantSlotsSource ??
    preparedInputs.resonantState.referenceSlots;
  const activeSourceCoupledModeCount = countActiveSlots(
    candidateForcingSlotsSource,
    capacity,
  );
  const activeResonantModeCount = countActiveSlots(
    candidateResponseSlotsSource,
    capacity,
  );

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
    sourceCoupledSpectralLaneASource,
    sourceCoupledSpectralLaneBSource,
    sourceCoupledSpectralMetaSource,
    resonantSpectralLaneASource,
    resonantSpectralLaneBSource,
    resonantSpectralMetaSource,
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    activeModeCount: activeSourceCoupledModeCount + activeResonantModeCount,
  };
}

function resolveStructuralProposalSources(preparedInputs, structuralState) {
  const { shouldBuildSpectralLight } = preparedInputs;
  return {
    proposalSourceCoupledSlotsSource:
      structuralState?.proposalSourceCoupledSlotsSource ??
      structuralState?.candidateForcingSlotsSource ??
      preparedInputs.sourceCoupledState.slots,
    proposalResonantSlotsSource:
      structuralState?.proposalResonantSlotsSource ??
      structuralState?.candidateResponseSlotsSource ??
      preparedInputs.resonantState.slots,
    proposalReferenceSourceCoupledSlotsSource:
      structuralState?.proposalReferenceSourceCoupledSlotsSource ??
      structuralState?.referenceSourceCoupledSlotsSource ??
      preparedInputs.sourceCoupledState.referenceSlots,
    proposalReferenceResonantSlotsSource:
      structuralState?.proposalReferenceResonantSlotsSource ??
      structuralState?.referenceResonantSlotsSource ??
      preparedInputs.resonantState.referenceSlots,
    proposalSourceCoupledPhaseSlotsSource:
      structuralState?.proposalSourceCoupledPhaseSlotsSource ??
      structuralState?.sourceCoupledPhaseSlotsSource ??
      preparedInputs.sourceCoupledPhaseSlots,
    proposalResonantPhaseSlotsSource:
      structuralState?.proposalResonantPhaseSlotsSource ??
      structuralState?.resonantPhaseSlotsSource ??
      preparedInputs.resonantPhaseSlots,
    proposalSourceCoupledColorSlotsSource: shouldBuildSpectralLight
      ? (structuralState?.proposalSourceCoupledColorSlotsSource ??
        structuralState?.sourceCoupledColorSlotsSource ??
        preparedInputs.sourceCoupledState.colorSlots)
      : null,
    proposalResonantColorSlotsSource: shouldBuildSpectralLight
      ? (structuralState?.proposalResonantColorSlotsSource ??
        structuralState?.resonantColorSlotsSource ??
        preparedInputs.resonantState.colorSlots)
      : null,
    proposalSourceCoupledSpectralLaneASource: shouldBuildSpectralLight
      ? (structuralState?.proposalSourceCoupledSpectralLaneASource ??
        structuralState?.sourceCoupledSpectralLaneASource ??
        preparedInputs.sourceCoupledState.spectralLaneA)
      : null,
    proposalSourceCoupledSpectralLaneBSource: shouldBuildSpectralLight
      ? (structuralState?.proposalSourceCoupledSpectralLaneBSource ??
        structuralState?.sourceCoupledSpectralLaneBSource ??
        preparedInputs.sourceCoupledState.spectralLaneB)
      : null,
    proposalSourceCoupledSpectralMetaSource: shouldBuildSpectralLight
      ? (structuralState?.proposalSourceCoupledSpectralMetaSource ??
        structuralState?.sourceCoupledSpectralMetaSource ??
        preparedInputs.sourceCoupledState.spectralMeta)
      : null,
    proposalResonantSpectralLaneASource: shouldBuildSpectralLight
      ? (structuralState?.proposalResonantSpectralLaneASource ??
        structuralState?.resonantSpectralLaneASource ??
        preparedInputs.resonantState.spectralLaneA)
      : null,
    proposalResonantSpectralLaneBSource: shouldBuildSpectralLight
      ? (structuralState?.proposalResonantSpectralLaneBSource ??
        structuralState?.resonantSpectralLaneBSource ??
        preparedInputs.resonantState.spectralLaneB)
      : null,
    proposalResonantSpectralMetaSource: shouldBuildSpectralLight
      ? (structuralState?.proposalResonantSpectralMetaSource ??
        structuralState?.resonantSpectralMetaSource ??
        preparedInputs.resonantState.spectralMeta)
      : null,
  };
}

function copyDescriptorQuad(source, offset) {
  return [
    source?.[offset] ?? 0,
    source?.[offset + 1] ?? 0,
    source?.[offset + 2] ?? 0,
    source?.[offset + 3] ?? 0,
  ];
}

function descriptorQuadWeight(quad) {
  return Math.max(
    Math.abs(quad?.[0] ?? 0),
    Math.abs(quad?.[1] ?? 0),
    Math.abs(quad?.[2] ?? 0),
    Math.abs(quad?.[3] ?? 0),
  );
}

function descriptorPhaseWeight(quad) {
  return Math.max(0, quad?.[2] ?? 0) * Math.max(0, quad?.[3] ?? 0);
}

function chooseDescriptorQuad(existing, incoming, weightFn) {
  return weightFn(incoming) > weightFn(existing) ? incoming : existing;
}

function createDescriptorLayerEntry({
  sourceSlots,
  sourcePhaseSlots,
  sourceColorSlots,
  sourceSpectralLaneA,
  sourceSpectralLaneB,
  sourceSpectralMeta,
  sourceOffset,
  coefficientScale = 1,
}) {
  const boundedCoefficientScale = Number.isFinite(coefficientScale)
    ? Math.max(0, coefficientScale)
    : 1;
  const coefficient =
    Math.max(0, sourceSlots?.[sourceOffset + 3] ?? 0) * boundedCoefficientScale;
  if (!(coefficient > 0)) {
    return null;
  }

  const slot = copyDescriptorQuad(sourceSlots, sourceOffset);
  slot[3] = coefficient;
  return {
    key: `${slot[0]}:${slot[1]}:${slot[2]}`,
    slot,
    phase: copyDescriptorQuad(sourcePhaseSlots, sourceOffset),
    color: copyDescriptorQuad(sourceColorSlots, sourceOffset),
    spectralLaneA: copyDescriptorQuad(sourceSpectralLaneA, sourceOffset),
    spectralLaneB: copyDescriptorQuad(sourceSpectralLaneB, sourceOffset),
    spectralMeta: copyDescriptorQuad(sourceSpectralMeta, sourceOffset),
  };
}

function mergeDescriptorLayerEntry(entries, entryByModeKey, incoming) {
  if (!incoming) {
    return;
  }

  const existing = entryByModeKey.get(incoming.key);
  if (!existing) {
    entries.push(incoming);
    entryByModeKey.set(incoming.key, incoming);
    return;
  }

  if ((incoming.slot?.[3] ?? 0) > (existing.slot?.[3] ?? 0)) {
    existing.slot = incoming.slot;
  }
  existing.phase = chooseDescriptorQuad(
    existing.phase,
    incoming.phase,
    descriptorPhaseWeight,
  );
  existing.color = chooseDescriptorQuad(
    existing.color,
    incoming.color,
    descriptorQuadWeight,
  );
  existing.spectralLaneA = chooseDescriptorQuad(
    existing.spectralLaneA,
    incoming.spectralLaneA,
    descriptorQuadWeight,
  );
  existing.spectralLaneB = chooseDescriptorQuad(
    existing.spectralLaneB,
    incoming.spectralLaneB,
    descriptorQuadWeight,
  );
  existing.spectralMeta = chooseDescriptorQuad(
    existing.spectralMeta,
    incoming.spectralMeta,
    descriptorQuadWeight,
  );
}

function appendDescriptorLayerEntries({
  entries,
  entryByModeKey,
  slots,
  phaseSlots,
  colorSlots,
  spectralLaneA,
  spectralLaneB,
  spectralMeta,
  activeModeCount,
  capacity,
  coefficientScale = 1,
}) {
  const slotLimit = Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor((slots?.length ?? 0) / 4),
  );
  const validLimit = Math.max(0, Math.floor(activeModeCount ?? 0));
  let seen = 0;

  for (
    let sourceIndex = 0;
    sourceIndex < slotLimit && seen < validLimit;
    sourceIndex += 1
  ) {
    const sourceOffset = sourceIndex * 4;
    if (!((slots?.[sourceOffset + 3] ?? 0) > 0)) {
      continue;
    }
    seen += 1;
    mergeDescriptorLayerEntry(
      entries,
      entryByModeKey,
      createDescriptorLayerEntry({
        sourceSlots: slots,
        sourcePhaseSlots: phaseSlots,
        sourceColorSlots: colorSlots,
        sourceSpectralLaneA: spectralLaneA,
        sourceSpectralLaneB: spectralLaneB,
        sourceSpectralMeta: spectralMeta,
        sourceOffset,
        coefficientScale,
      }),
    );
  }
}

function writeDescriptorLayerEntries(entries) {
  const length = entries.length * 4;
  const slots = new Float32Array(length);
  const phaseSlots = new Float32Array(length);
  const colorSlots = new Float32Array(length);
  const spectralLaneA = new Float32Array(length);
  const spectralLaneB = new Float32Array(length);
  const spectralMeta = new Float32Array(length);

  entries.forEach((entry, index) => {
    const offset = index * 4;
    slots.set(entry.slot, offset);
    phaseSlots.set(entry.phase, offset);
    colorSlots.set(entry.color, offset);
    spectralLaneA.set(entry.spectralLaneA, offset);
    spectralLaneB.set(entry.spectralLaneB, offset);
    spectralMeta.set(entry.spectralMeta, offset);
  });

  return {
    slots,
    phaseSlots,
    colorSlots,
    spectralLaneA,
    spectralLaneB,
    spectralMeta,
    activeModeCount: entries.length,
  };
}

function mergeDescriptorLayerSources({
  renderSlots,
  proposalSlots,
  renderPhaseSlots,
  proposalPhaseSlots,
  renderColorSlots,
  proposalColorSlots,
  renderSpectralLaneA,
  proposalSpectralLaneA,
  renderSpectralLaneB,
  proposalSpectralLaneB,
  renderSpectralMeta,
  proposalSpectralMeta,
  activeRenderModeCount,
  activeProposalModeCount,
  capacity,
  proposalScale,
}) {
  if (proposalSlots === renderSlots || !(activeProposalModeCount > 0)) {
    return {
      slots: renderSlots,
      phaseSlots: renderPhaseSlots,
      colorSlots: renderColorSlots,
      spectralLaneA: renderSpectralLaneA,
      spectralLaneB: renderSpectralLaneB,
      spectralMeta: renderSpectralMeta,
      activeModeCount: activeRenderModeCount,
    };
  }

  const entries = [];
  const entryByModeKey = new Map();

  appendDescriptorLayerEntries({
    entries,
    entryByModeKey,
    slots: renderSlots,
    phaseSlots: renderPhaseSlots,
    colorSlots: renderColorSlots,
    spectralLaneA: renderSpectralLaneA,
    spectralLaneB: renderSpectralLaneB,
    spectralMeta: renderSpectralMeta,
    activeModeCount: activeRenderModeCount,
    capacity,
  });
  appendDescriptorLayerEntries({
    entries,
    entryByModeKey,
    slots: proposalSlots,
    phaseSlots: proposalPhaseSlots,
    colorSlots: proposalColorSlots,
    spectralLaneA: proposalSpectralLaneA,
    spectralLaneB: proposalSpectralLaneB,
    spectralMeta: proposalSpectralMeta,
    activeModeCount: activeProposalModeCount,
    capacity,
    coefficientScale: proposalScale,
  });

  return writeDescriptorLayerEntries(entries);
}

function resolveModalFieldContinuityDescriptorSources({
  preparedInputs,
  structuralState,
  renderSourceCoupledSlots,
  renderResonantSlots,
  renderSourceCoupledPhaseSlots,
  renderResonantPhaseSlots,
  renderSourceCoupledColorSlots,
  renderResonantColorSlots,
  renderSourceCoupledSpectralLaneA,
  renderSourceCoupledSpectralLaneB,
  renderSourceCoupledSpectralMeta,
  renderResonantSpectralLaneA,
  renderResonantSpectralLaneB,
  renderResonantSpectralMeta,
  activeSourceCoupledModeCount,
  activeResonantModeCount,
  scale,
  allowProposalCandidates = true,
}) {
  const capacity = preparedInputs.capacity;
  const defaultSources = {
    descriptorSourceCoupledSlots: renderSourceCoupledSlots,
    descriptorResonantSlots: renderResonantSlots,
    sourceCoupledPhaseSlots: renderSourceCoupledPhaseSlots,
    resonantPhaseSlots: renderResonantPhaseSlots,
    sourceCoupledColorSlots: renderSourceCoupledColorSlots,
    resonantColorSlots: renderResonantColorSlots,
    sourceCoupledSpectralLaneA: renderSourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB: renderSourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta: renderSourceCoupledSpectralMeta,
    resonantSpectralLaneA: renderResonantSpectralLaneA,
    resonantSpectralLaneB: renderResonantSpectralLaneB,
    resonantSpectralMeta: renderResonantSpectralMeta,
    activeSourceCoupledModeCount,
    activeResonantModeCount,
  };
  if (!allowProposalCandidates) {
    return defaultSources;
  }

  const proposalSources = resolveStructuralProposalSources(
    preparedInputs,
    structuralState,
  );
  const proposalSourceCoupledModeCount = countActiveSlots(
    proposalSources.proposalSourceCoupledSlotsSource,
    capacity,
  );
  const proposalResonantModeCount = countActiveSlots(
    proposalSources.proposalResonantSlotsSource,
    capacity,
  );
  const hasProposalCandidates =
    proposalSourceCoupledModeCount + proposalResonantModeCount > 0;
  const proposalDiffersFromRender =
    proposalSources.proposalSourceCoupledSlotsSource !==
      renderSourceCoupledSlots ||
    proposalSources.proposalResonantSlotsSource !== renderResonantSlots;

  if (!hasProposalCandidates || !proposalDiffersFromRender) {
    return defaultSources;
  }

  const sourceCoupledDescriptorSources = mergeDescriptorLayerSources({
    renderSlots: renderSourceCoupledSlots,
    proposalSlots: proposalSources.proposalSourceCoupledSlotsSource,
    renderPhaseSlots: renderSourceCoupledPhaseSlots,
    proposalPhaseSlots: proposalSources.proposalSourceCoupledPhaseSlotsSource,
    renderColorSlots: renderSourceCoupledColorSlots,
    proposalColorSlots: proposalSources.proposalSourceCoupledColorSlotsSource,
    renderSpectralLaneA: renderSourceCoupledSpectralLaneA,
    proposalSpectralLaneA:
      proposalSources.proposalSourceCoupledSpectralLaneASource,
    renderSpectralLaneB: renderSourceCoupledSpectralLaneB,
    proposalSpectralLaneB:
      proposalSources.proposalSourceCoupledSpectralLaneBSource,
    renderSpectralMeta: renderSourceCoupledSpectralMeta,
    proposalSpectralMeta:
      proposalSources.proposalSourceCoupledSpectralMetaSource,
    activeRenderModeCount: activeSourceCoupledModeCount,
    activeProposalModeCount: proposalSourceCoupledModeCount,
    capacity,
    proposalScale:
      proposalSources.proposalSourceCoupledSlotsSource ===
      renderSourceCoupledSlots
        ? 1
        : scale < 1
          ? scale
          : 1,
  });
  const resonantDescriptorSources = mergeDescriptorLayerSources({
    renderSlots: renderResonantSlots,
    proposalSlots: proposalSources.proposalResonantSlotsSource,
    renderPhaseSlots: renderResonantPhaseSlots,
    proposalPhaseSlots: proposalSources.proposalResonantPhaseSlotsSource,
    renderColorSlots: renderResonantColorSlots,
    proposalColorSlots: proposalSources.proposalResonantColorSlotsSource,
    renderSpectralLaneA: renderResonantSpectralLaneA,
    proposalSpectralLaneA: proposalSources.proposalResonantSpectralLaneASource,
    renderSpectralLaneB: renderResonantSpectralLaneB,
    proposalSpectralLaneB: proposalSources.proposalResonantSpectralLaneBSource,
    renderSpectralMeta: renderResonantSpectralMeta,
    proposalSpectralMeta: proposalSources.proposalResonantSpectralMetaSource,
    activeRenderModeCount: activeResonantModeCount,
    activeProposalModeCount: proposalResonantModeCount,
    capacity,
    proposalScale:
      proposalSources.proposalResonantSlotsSource === renderResonantSlots
        ? 1
        : scale < 1
          ? scale
          : 1,
  });

  return {
    descriptorSourceCoupledSlots: sourceCoupledDescriptorSources.slots,
    descriptorResonantSlots: resonantDescriptorSources.slots,
    sourceCoupledPhaseSlots: sourceCoupledDescriptorSources.phaseSlots,
    resonantPhaseSlots: resonantDescriptorSources.phaseSlots,
    sourceCoupledColorSlots: sourceCoupledDescriptorSources.colorSlots,
    resonantColorSlots: resonantDescriptorSources.colorSlots,
    sourceCoupledSpectralLaneA: sourceCoupledDescriptorSources.spectralLaneA,
    sourceCoupledSpectralLaneB: sourceCoupledDescriptorSources.spectralLaneB,
    sourceCoupledSpectralMeta: sourceCoupledDescriptorSources.spectralMeta,
    resonantSpectralLaneA: resonantDescriptorSources.spectralLaneA,
    resonantSpectralLaneB: resonantDescriptorSources.spectralLaneB,
    resonantSpectralMeta: resonantDescriptorSources.spectralMeta,
    activeSourceCoupledModeCount:
      sourceCoupledDescriptorSources.activeModeCount,
    activeResonantModeCount: resonantDescriptorSources.activeModeCount,
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
    sourceCoupledSignature: computeSlotSignature(
      projectionSources.candidateForcingSlotsSource,
      preparedInputs.capacity,
    ),
    resonantSignature: computeSlotSignature(
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
    sourceCoupledColorSignature: projectionSources.sourceCoupledColorSlotsSource
      ? computeColorSignature(
          projectionSources.sourceCoupledColorSlotsSource,
          preparedInputs.capacity,
        )
      : 0,
    resonantColorSignature: projectionSources.resonantColorSlotsSource
      ? computeColorSignature(
          projectionSources.resonantColorSlotsSource,
          preparedInputs.capacity,
        )
      : 0,
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
    sourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta,
    resonantSpectralLaneA,
    resonantSpectralLaneB,
    resonantSpectralMeta,
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
  if (projectionSources.sourceCoupledSpectralLaneASource) {
    copyFloatArray(
      sourceCoupledSpectralLaneA,
      projectionSources.sourceCoupledSpectralLaneASource,
    );
    copyFloatArray(
      sourceCoupledSpectralLaneB,
      projectionSources.sourceCoupledSpectralLaneBSource,
    );
    copyFloatArray(
      sourceCoupledSpectralMeta,
      projectionSources.sourceCoupledSpectralMetaSource,
    );
    copyFloatArray(
      resonantSpectralLaneA,
      projectionSources.resonantSpectralLaneASource,
    );
    copyFloatArray(
      resonantSpectralLaneB,
      projectionSources.resonantSpectralLaneBSource,
    );
    copyFloatArray(
      resonantSpectralMeta,
      projectionSources.resonantSpectralMetaSource,
    );
  } else {
    sourceCoupledSpectralLaneA.fill(0);
    sourceCoupledSpectralLaneB.fill(0);
    sourceCoupledSpectralMeta.fill(0);
    resonantSpectralLaneA.fill(0);
    resonantSpectralLaneB.fill(0);
    resonantSpectralMeta.fill(0);
  }

  let returnedSourceCoupledSlots = candidateForcingSlots;
  let returnedResonantSlots = candidateResponseSlots;
  let returnedSourceCoupledPhaseSlots = sourceCoupledPhaseSlots;
  let returnedResonantPhaseSlots = resonantPhaseSlots;
  let returnedModeSlots = modeSlots;
  let returnedSourceCoupledColorSlots = sourceCoupledColorSlots;
  let returnedResonantColorSlots = resonantColorSlots;
  let returnedSourceCoupledSpectralLaneA = sourceCoupledSpectralLaneA;
  let returnedSourceCoupledSpectralLaneB = sourceCoupledSpectralLaneB;
  let returnedSourceCoupledSpectralMeta = sourceCoupledSpectralMeta;
  let returnedResonantSpectralLaneA = resonantSpectralLaneA;
  let returnedResonantSpectralLaneB = resonantSpectralLaneB;
  let returnedResonantSpectralMeta = resonantSpectralMeta;

  if (projectionSources.freezeModeSlots && auditState) {
    if (!projectionSources.hasFrozenProjection) {
      auditState.frozenSourceCoupledSlots.set(candidateForcingSlots);
      auditState.frozenResonantSlots.set(candidateResponseSlots);
      auditState.frozenModeSlots.set(modeSlots);
      auditState.frozenSourceCoupledColorSlots.set(sourceCoupledColorSlots);
      auditState.frozenResonantColorSlots.set(resonantColorSlots);
      auditState.frozenSourceCoupledSpectralLaneA?.set(
        sourceCoupledSpectralLaneA,
      );
      auditState.frozenSourceCoupledSpectralLaneB?.set(
        sourceCoupledSpectralLaneB,
      );
      auditState.frozenSourceCoupledSpectralMeta?.set(
        sourceCoupledSpectralMeta,
      );
      auditState.frozenResonantSpectralLaneA?.set(resonantSpectralLaneA);
      auditState.frozenResonantSpectralLaneB?.set(resonantSpectralLaneB);
      auditState.frozenResonantSpectralMeta?.set(resonantSpectralMeta);
    }
    returnedSourceCoupledSlots = auditState.frozenSourceCoupledSlots;
    returnedResonantSlots = auditState.frozenResonantSlots;
    returnedSourceCoupledPhaseSlots = sourceCoupledPhaseSlots;
    returnedResonantPhaseSlots = resonantPhaseSlots;
    returnedModeSlots = auditState.frozenModeSlots;
    returnedSourceCoupledColorSlots = auditState.frozenSourceCoupledColorSlots;
    returnedResonantColorSlots = auditState.frozenResonantColorSlots;
    returnedSourceCoupledSpectralLaneA =
      auditState.frozenSourceCoupledSpectralLaneA;
    returnedSourceCoupledSpectralLaneB =
      auditState.frozenSourceCoupledSpectralLaneB;
    returnedSourceCoupledSpectralMeta =
      auditState.frozenSourceCoupledSpectralMeta;
    returnedResonantSpectralLaneA = auditState.frozenResonantSpectralLaneA;
    returnedResonantSpectralLaneB = auditState.frozenResonantSpectralLaneB;
    returnedResonantSpectralMeta = auditState.frozenResonantSpectralMeta;
  } else if (auditState) {
    emptyFrozenLayers(auditState);
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
    sourceCoupledSpectralLaneA: returnedSourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB: returnedSourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta: returnedSourceCoupledSpectralMeta,
    resonantSpectralLaneA: returnedResonantSpectralLaneA,
    resonantSpectralLaneB: returnedResonantSpectralLaneB,
    resonantSpectralMeta: returnedResonantSpectralMeta,
    activeSourceCoupledModeCount:
      projectionSources.activeSourceCoupledModeCount,
    activeResonantModeCount: projectionSources.activeResonantModeCount,
    activeModeCount: projectionSources.activeModeCount,
  };
}

function materializeAudioFeatureProposalSnapshot(
  preparedInputs,
  structuralState,
) {
  const { capacity, signalModeSlots, signalReferenceModeSlots } =
    preparedInputs;
  const proposalSources = resolveStructuralProposalSources(
    preparedInputs,
    structuralState,
  );
  combineModalLayers(
    signalModeSlots,
    [
      {
        slots: proposalSources.proposalSourceCoupledSlotsSource,
        weight: 1,
      },
      {
        slots: proposalSources.proposalResonantSlotsSource,
        weight: 1,
      },
    ],
    capacity,
  );
  combineModalLayers(
    signalReferenceModeSlots,
    [
      {
        slots: proposalSources.proposalReferenceSourceCoupledSlotsSource,
        weight: 1,
      },
      {
        slots: proposalSources.proposalReferenceResonantSlotsSource,
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
    bandState,
  } = preparedInputs;
  const fftLinearAmplitudes = ensureAnalysisFftBuffer(preparedInputs);
  const bandMetrics = updateBandSignalState({
    analysisMemory,
    fftLinearAmplitudes,
    sampleRate,
    fftSize,
    rms: analyserRms,
    frameTimeMs: currentFrameAtMs,
    beatSettings,
    suppressBeat: preparedInputs.liveInputNoiseGateActive === true,
  });
  const sourceNormalization = getSourceNormalization({
    inputMode: analysisInputMode,
    analyserRms,
    spectralCentroid: bandMetrics.spectralCentroid,
    bandState,
  });

  return {
    fftLinearAmplitudes,
    spectralEffectiveBinCount: Number.isFinite(
      preparedInputs.spectralEffectiveBinCount,
    )
      ? preparedInputs.spectralEffectiveBinCount
      : computeSpectralEffectiveBinCount(fftLinearAmplitudes),
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
    fastSignalState.fftLinearAmplitudes,
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
      sourceCoupledSpectralLaneA:
        previousAnalysisResult?.sourceCoupledSpectralLaneA ??
        preparedInputs.sourceCoupledSpectralLaneA,
      sourceCoupledSpectralLaneB:
        previousAnalysisResult?.sourceCoupledSpectralLaneB ??
        preparedInputs.sourceCoupledSpectralLaneB,
      sourceCoupledSpectralMeta:
        previousAnalysisResult?.sourceCoupledSpectralMeta ??
        preparedInputs.sourceCoupledSpectralMeta,
      resonantSpectralLaneA:
        previousAnalysisResult?.resonantSpectralLaneA ??
        preparedInputs.resonantSpectralLaneA,
      resonantSpectralLaneB:
        previousAnalysisResult?.resonantSpectralLaneB ??
        preparedInputs.resonantSpectralLaneB,
      resonantSpectralMeta:
        previousAnalysisResult?.resonantSpectralMeta ??
        preparedInputs.resonantSpectralMeta,
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
    sourceCoupledSpectralLaneASource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.sourceCoupledState.spectralLaneA
      : null,
    sourceCoupledSpectralLaneBSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.sourceCoupledState.spectralLaneB
      : null,
    sourceCoupledSpectralMetaSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.sourceCoupledState.spectralMeta
      : null,
    resonantSpectralLaneASource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.resonantState.spectralLaneA
      : null,
    resonantSpectralLaneBSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.resonantState.spectralLaneB
      : null,
    resonantSpectralMetaSource: preparedInputs.shouldBuildSpectralLight
      ? preparedInputs.resonantState.spectralMeta
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
    ? materializeAudioFeatureProposalSnapshot(preparedInputs, currentStructural)
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
    fftLinearAmplitudes: fastSignalState.fftLinearAmplitudes,
    spectralEffectiveBinCount:
      fastSignalState.spectralEffectiveBinCount ??
      computeSpectralEffectiveBinCount(fastSignalState.fftLinearAmplitudes),
    candidateForcingSlots: resolvedStructural.candidateForcingSlots,
    candidateResponseSlots: resolvedStructural.candidateResponseSlots,
    sourceCoupledPhaseSlots: resolvedStructural.sourceCoupledPhaseSlots,
    resonantPhaseSlots: resolvedStructural.resonantPhaseSlots,
    activeSourceCoupledModeCount:
      resolvedStructural.activeSourceCoupledModeCount,
    activeResonantModeCount: resolvedStructural.activeResonantModeCount,
    sourceCoupledColorSlots: resolvedStructural.sourceCoupledColorSlots,
    resonantColorSlots: resolvedStructural.resonantColorSlots,
    sourceCoupledSpectralLaneA: resolvedStructural.sourceCoupledSpectralLaneA,
    sourceCoupledSpectralLaneB: resolvedStructural.sourceCoupledSpectralLaneB,
    sourceCoupledSpectralMeta: resolvedStructural.sourceCoupledSpectralMeta,
    resonantSpectralLaneA: resolvedStructural.resonantSpectralLaneA,
    resonantSpectralLaneB: resolvedStructural.resonantSpectralLaneB,
    resonantSpectralMeta: resolvedStructural.resonantSpectralMeta,
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
    liveInputGateDiagnostics: preparedInputs.liveInputGateDiagnostics,
    liveInputCalibrationActive: Boolean(
      preparedInputs.bandState.liveInputCalibrationActive,
    ),
    beatLowBandEnergy: fastSignalState.beatLowBandEnergy,
    beatOnsetDriver: fastSignalState.beatOnsetDriver,
    beatThreshold: fastSignalState.beatThreshold,
    fftPeakAmplitude: preparedInputs.fftPeakAmplitude,
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

export function composeAudioFeatureFrame({
  preparedInputs,
  analysisResult,
  previousFrame = null,
  smoothFromPreviousFrame = false,
  topologyFrame = null,
  topologyOnly = false,
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
    spectralEffectiveBinCount:
      analysisResult.spectralEffectiveBinCount ??
      computeSpectralEffectiveBinCount(analysisResult.fftLinearAmplitudes),
  });
  const previousCompositionSourceAuthorityScale = smoothFromPreviousFrame
    ? derivePreviousCompositionSourceAuthorityScale({
        preparedInputs,
        analysisResult,
      })
    : 1;
  if (smoothFromPreviousFrame && previousFrame) {
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
  if (previousCompositionSourceAuthorityScale < 1) {
    structureSignal *= previousCompositionSourceAuthorityScale;
    energySignal *= previousCompositionSourceAuthorityScale;
    modalVisibilityEnergy *= previousCompositionSourceAuthorityScale;
    modalObserverVisibilityEnergy *= previousCompositionSourceAuthorityScale;
    modalVisibilityRetainedHighQEnergy *=
      previousCompositionSourceAuthorityScale;
    modeCoherence *= previousCompositionSourceAuthorityScale;
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
  if (!topologyOnly) {
    analysisResult.sourceEvidence = resolvedSourceEvidence;
  }
  let energyLedger = buildModalEnergyLedger({
    sourceEnergy: resolvedSourceEvidence.sourceEnergy,
    renderBoundaryState:
      resolvedSourceEvidence.renderBoundaryState ??
      resolvedSourceEvidence.sourceBoundaryState,
    modalResponse: analysisResult.structuralMetrics,
    candidateForcingSlots: analysisResult.candidateForcingSlots,
    candidateResponseSlots: analysisResult.candidateResponseSlots,
    capacity: preparedInputs.capacity,
    currentSignalEnergy: analysisResult.structuralMetrics?.currentSignalEnergy,
    currentSignalAmplitude:
      analysisResult.structuralMetrics?.currentSignalAmplitude,
    renderEnergyEpsilon: analysisResult.structuralMetrics?.renderEnergyEpsilon,
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
  });
  const projectedRenderAuthority = hasProjectedRenderAuthority(energyLedger);
  if (!topologyOnly && analysisResult.structuralMetrics) {
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
  if (!topologyOnly) {
    preparedInputs.analysisMemory.lastComposedFrameAtMs =
      preparedInputs.currentFrameAtMs;
  }

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
      (!analysisResult.usedDecay && modalVisibilityEnergy > 0.005) ||
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
      modalCoefficientEnergy: projectedModalRenderEnergy,
      observationEnergy,
    });
  if (!projectedRenderAuthority) {
    fieldState = FIELD_STATES.idle;
    hasModalField = false;
    renderAuthority = false;
  }
  const modalProjectionContinuityHold =
    !topologyFrame &&
    !renderAuthority &&
    resolvedSourceEvidence.currentSourceEvidence === true &&
    energyLedger.renderBoundaryState === "live" &&
    energyLedger.storedModalEnergy > energyLedger.renderEnergyEpsilon &&
    hasVisibleModalFieldContinuityPayload(
      preparedInputs.modalFieldContinuityState,
    );
  if (modalProjectionContinuityHold) {
    fieldState = FIELD_STATES.decay;
    hasModalField = true;
  }
  const sourceMode =
    fieldState === FIELD_STATES.idle &&
    !preparedInputs.resolvedAuditSettings.injectTestTone
      ? "silent"
      : analysisResult.sourceMode;
  let modalPhaseAuthority = renderAuthority
    ? clamp01(analysisResult.structuralMetrics?.modalPhaseAuthority ?? 0)
    : 0;
  const modalObservationCoherence = resolveModalObservationCoherence(
    analysisResult.structuralMetrics,
  );
  const modalObservationConfidence = resolveModalObservationConfidence(
    analysisResult.structuralMetrics,
  );
  if (analysisResult.structuralMetrics) {
    analysisResult.structuralMetrics.modalObservationCoherence =
      modalObservationCoherence;
    analysisResult.structuralMetrics.modalObservationConfidence =
      modalObservationConfidence;
  }
  let renderSourceCoupledSlots = analysisResult.candidateForcingSlots;
  let renderResonantSlots = analysisResult.candidateResponseSlots;
  let renderSourceCoupledPhaseSlots = analysisResult.sourceCoupledPhaseSlots;
  let renderResonantPhaseSlots = analysisResult.resonantPhaseSlots;
  let renderModeSlots = analysisResult.modeSlots;
  let renderReferenceModeSlots = analysisResult.referenceModeSlots;
  let renderSourceCoupledColorSlots = analysisResult.sourceCoupledColorSlots;
  let renderResonantColorSlots = analysisResult.resonantColorSlots;
  let renderSourceCoupledSpectralLaneA =
    analysisResult.sourceCoupledSpectralLaneA;
  let renderSourceCoupledSpectralLaneB =
    analysisResult.sourceCoupledSpectralLaneB;
  let renderSourceCoupledSpectralMeta =
    analysisResult.sourceCoupledSpectralMeta;
  let renderResonantSpectralLaneA = analysisResult.resonantSpectralLaneA;
  let renderResonantSpectralLaneB = analysisResult.resonantSpectralLaneB;
  let renderResonantSpectralMeta = analysisResult.resonantSpectralMeta;
  let renderBandEnergies = analysisResult.bandEnergies;
  let activeSourceCoupledModeCount =
    analysisResult.activeSourceCoupledModeCount;
  let activeResonantModeCount = analysisResult.activeResonantModeCount;

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

  if (!renderAuthority && !modalProjectionContinuityHold) {
    preparedInputs.modeSlots.fill(0);
    preparedInputs.referenceModeSlots.fill(0);
    preparedInputs.sourceCoupledColorSlots.fill(0);
    preparedInputs.resonantColorSlots.fill(0);
    preparedInputs.sourceCoupledSpectralLaneA.fill(0);
    preparedInputs.sourceCoupledSpectralLaneB.fill(0);
    preparedInputs.sourceCoupledSpectralMeta.fill(0);
    preparedInputs.resonantSpectralLaneA.fill(0);
    preparedInputs.resonantSpectralLaneB.fill(0);
    preparedInputs.resonantSpectralMeta.fill(0);
    preparedInputs.bandEnergies.fill(0);
    renderSourceCoupledSlots = preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantSlots = preparedInputs.zeroResonantTargetSlots;
    renderSourceCoupledPhaseSlots = preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantPhaseSlots = preparedInputs.zeroResonantTargetSlots;
    renderModeSlots = preparedInputs.modeSlots;
    renderReferenceModeSlots = preparedInputs.referenceModeSlots;
    renderSourceCoupledColorSlots = preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantColorSlots = preparedInputs.zeroResonantTargetSlots;
    renderSourceCoupledSpectralLaneA =
      preparedInputs.zeroSourceCoupledTargetSlots;
    renderSourceCoupledSpectralLaneB =
      preparedInputs.zeroSourceCoupledTargetSlots;
    renderSourceCoupledSpectralMeta =
      preparedInputs.zeroSourceCoupledTargetSlots;
    renderResonantSpectralLaneA = preparedInputs.zeroResonantTargetSlots;
    renderResonantSpectralLaneB = preparedInputs.zeroResonantTargetSlots;
    renderResonantSpectralMeta = preparedInputs.zeroResonantTargetSlots;
    renderBandEnergies = preparedInputs.bandEnergies;
    activeSourceCoupledModeCount = 0;
    activeResonantModeCount = 0;
  }

  let modalFieldContinuityDiagnostics =
    topologyFrame?.modalFieldContinuity ?? null;
  let modalDescriptor = topologyFrame?.modalDescriptor ?? null;
  if (!modalDescriptor) {
    const continuityDescriptorSources =
      resolveModalFieldContinuityDescriptorSources({
        preparedInputs,
        structuralState: analysisResult.structuralState,
        renderSourceCoupledSlots,
        renderResonantSlots,
        renderSourceCoupledPhaseSlots,
        renderResonantPhaseSlots,
        renderSourceCoupledColorSlots,
        renderResonantColorSlots,
        renderSourceCoupledSpectralLaneA,
        renderSourceCoupledSpectralLaneB,
        renderSourceCoupledSpectralMeta,
        renderResonantSpectralLaneA,
        renderResonantSpectralLaneB,
        renderResonantSpectralMeta,
        activeSourceCoupledModeCount,
        activeResonantModeCount,
        scale: renderAuthority ? energyLedger.projectedEnergyScale : 1,
        allowProposalCandidates:
          (renderAuthority || modalProjectionContinuityHold) &&
          analysisResult.structuralState?.freezeModeSlots !== true,
      });
    const modalCandidateState =
      analysisResult.structuralState?.modalCandidateState;
    const sourceCoupledMetadataSlots = buildModalCandidateMetadataSlots({
      slots: continuityDescriptorSources.descriptorSourceCoupledSlots,
      activeModeCount: continuityDescriptorSources.activeSourceCoupledModeCount,
      capacity: preparedInputs.capacity,
      candidateState: modalCandidateState,
    });
    const resonantMetadataSlots = buildModalCandidateMetadataSlots({
      slots: continuityDescriptorSources.descriptorResonantSlots,
      activeModeCount: continuityDescriptorSources.activeResonantModeCount,
      capacity: preparedInputs.capacity,
      candidateState: modalCandidateState,
    });
    const modalFieldDescriptorSource = buildModalFieldDescriptorSource({
      candidateForcingSlots:
        continuityDescriptorSources.descriptorSourceCoupledSlots,
      candidateResponseSlots:
        continuityDescriptorSources.descriptorResonantSlots,
      sourceCoupledPhaseSlots:
        continuityDescriptorSources.sourceCoupledPhaseSlots,
      resonantPhaseSlots: continuityDescriptorSources.resonantPhaseSlots,
      sourceCoupledColorSlots:
        continuityDescriptorSources.sourceCoupledColorSlots,
      resonantColorSlots: continuityDescriptorSources.resonantColorSlots,
      sourceCoupledSpectralLaneA:
        continuityDescriptorSources.sourceCoupledSpectralLaneA,
      sourceCoupledSpectralLaneB:
        continuityDescriptorSources.sourceCoupledSpectralLaneB,
      sourceCoupledSpectralMeta:
        continuityDescriptorSources.sourceCoupledSpectralMeta,
      resonantSpectralLaneA: continuityDescriptorSources.resonantSpectralLaneA,
      resonantSpectralLaneB: continuityDescriptorSources.resonantSpectralLaneB,
      resonantSpectralMeta: continuityDescriptorSources.resonantSpectralMeta,
      sourceCoupledMetadataSlots,
      resonantMetadataSlots,
      activeSourceCoupledModeCount:
        continuityDescriptorSources.activeSourceCoupledModeCount,
      activeResonantModeCount:
        continuityDescriptorSources.activeResonantModeCount,
      radius: preparedInputs.radius,
      cavityAcousticScale: preparedInputs.cavityAcousticScale,
      boundaryMode: preparedInputs.boundaryMode,
      modalObservationConfidence,
    });
    const modalGeometryBackend = getModalGeometryBackend(
      preparedInputs.effectiveCavityGeometry,
    );
    const upstreamSourceCoupledTopology =
      modalGeometryBackend.summarizeModalSlotTopologyRange(
        continuityDescriptorSources.descriptorSourceCoupledSlots,
        { count: continuityDescriptorSources.activeSourceCoupledModeCount },
      );
    const upstreamResonantTopology =
      modalGeometryBackend.summarizeModalSlotTopologyRange(
        continuityDescriptorSources.descriptorResonantSlots,
        {
          count: continuityDescriptorSources.activeResonantModeCount,
        },
      );
    const upstreamCandidateTopology =
      modalGeometryBackend.summarizeModalSlotTopologyRange(
        modalFieldDescriptorSource.modalFieldSlots,
        { count: modalFieldDescriptorSource.activeModalFieldModeCount },
      );
    const upstreamSourceCoupledModalEnergy = sumModalSlotCoefficientEnergy(
      continuityDescriptorSources.descriptorSourceCoupledSlots,
      continuityDescriptorSources.activeSourceCoupledModeCount,
    );
    const upstreamResonantModalEnergy = sumModalSlotCoefficientEnergy(
      continuityDescriptorSources.descriptorResonantSlots,
      continuityDescriptorSources.activeResonantModeCount,
    );
    const upstreamCandidateModalEnergy =
      upstreamSourceCoupledModalEnergy + upstreamResonantModalEnergy;
    const previousModalFieldContinuityFrameAtMs =
      preparedInputs.analysisMemory.lastModalFieldContinuityFrameAtMs;
    const modalFieldContinuityResetToken = `${preparedInputs.analysisSessionKey}|${preparedInputs.analysisInputsSignature}`;
    const allowImmediateModalFieldBootstrap =
      !Number.isFinite(previousModalFieldContinuityFrameAtMs) ||
      (preparedInputs.modalFieldContinuityState?.lastResetToken !== undefined &&
        preparedInputs.modalFieldContinuityState.lastResetToken !==
          modalFieldContinuityResetToken);
    const modalFieldContinuityDeltaMs = getModalFieldContinuityDeltaMs(
      previousModalFieldContinuityFrameAtMs,
      preparedInputs.currentFrameAtMs,
    );
    preparedInputs.analysisMemory.lastModalFieldContinuityFrameAtMs =
      preparedInputs.currentFrameAtMs;
    const modalFieldContinuityResult = updateModalFieldContinuity(
      preparedInputs.modalFieldContinuityState,
      {
        descriptorSource: modalFieldDescriptorSource,
        deltaTimeSec: modalFieldContinuityDeltaMs / 1000,
        resetToken: modalFieldContinuityResetToken,
        renderAuthority: renderAuthority || modalProjectionContinuityHold,
        maxVisibleModeCount: Math.min(
          preparedInputs.capacity,
          MODAL_BASIS_STEADY_MODE_COUNT,
        ),
        maxHandoffModeCount: Math.min(
          MODAL_BASIS_HANDOFF_MODE_COUNT,
          Math.max(
            0,
            Math.min(preparedInputs.capacity, MODAL_BASIS_CACHE_PAGE_CAPACITY) -
              Math.min(preparedInputs.capacity, MODAL_BASIS_STEADY_MODE_COUNT),
          ),
        ),
        maxBasisModeOrder: MODAL_FIELD_CONTINUITY_MAX_BASIS_MODE_ORDER,
        releaseSeconds: modalProjectionContinuityHold
          ? LIVE_SOURCE_MODAL_CONTINUITY_RELEASE_SECONDS
          : undefined,
        allowImmediateBootstrap: allowImmediateModalFieldBootstrap,
        normalizeCandidateEvidence: true,
        cavityGeometry: preparedInputs.effectiveCavityGeometry,
      },
    );
    const continuityDescriptorSource =
      modalFieldContinuityResult.descriptorSource;
    modalFieldContinuityDiagnostics = modalFieldContinuityResult.diagnostics;
    const overBandwidthDiagnosticModeCount = Math.max(
      0,
      analysisResult.structuralMetrics?.overBandwidthRejectedModeCount ?? 0,
    );
    const overBandwidthDiagnosticModalEnergy = Math.max(
      0,
      analysisResult.structuralMetrics?.overBandwidthRejectedModalEnergy ?? 0,
    );
    const overBandwidthDiagnosticMaxModeIndex = Math.max(
      0,
      analysisResult.structuralMetrics?.overBandwidthMaxRequestedModeIndex ?? 0,
    );
    const continuityOverBandwidthMaxModeIndex = Math.max(
      0,
      modalFieldContinuityDiagnostics.overBandwidthMaxRequestedModeIndex ?? 0,
    );
    const overBandwidthMaxRequestedMode =
      overBandwidthDiagnosticMaxModeIndex >
      continuityOverBandwidthMaxModeIndex
        ? analysisResult.structuralMetrics?.overBandwidthMaxRequestedMode
        : modalFieldContinuityDiagnostics.overBandwidthMaxRequestedMode;
    if (modalProjectionContinuityHold) {
      const heldProjectedRenderEnergy = sumProjectedSlotEnergy(
        continuityDescriptorSource.modalFieldSlots,
        continuityDescriptorSource.activeModalFieldModeCount,
      );
      if (heldProjectedRenderEnergy > energyLedger.renderEnergyEpsilon) {
        const storedSourceCoupledEnergy = clamp01(
          energyLedger.storedModalSourceCoupledEnergy ?? 0,
        );
        const storedResonantEnergy = clamp01(
          energyLedger.storedModalResonantEnergy ?? 0,
        );
        const storedLayerEnergy =
          storedSourceCoupledEnergy + storedResonantEnergy;
        const sourceCoupledShare =
          storedLayerEnergy > 0
            ? storedSourceCoupledEnergy / storedLayerEnergy
            : 1;
        const resonantShare =
          storedLayerEnergy > 0 ? storedResonantEnergy / storedLayerEnergy : 0;

        projectedModalRenderEnergy = heldProjectedRenderEnergy;
        modalResponseSourceCoupledEnergy =
          heldProjectedRenderEnergy * sourceCoupledShare;
        modalResponseResonantEnergy = heldProjectedRenderEnergy * resonantShare;
        observationEnergy = deriveModalObservationEnergy(
          projectedModalRenderEnergy,
          modalResponseEnergy,
        );
        renderAuthority = true;
        fieldState = FIELD_STATES.decay;
        hasModalField = true;
        modalPhaseAuthority = Math.max(
          modalPhaseAuthority,
          clamp01(analysisResult.structuralMetrics?.modalPhaseAuthority ?? 0),
        );
        energyLedger = {
          ...energyLedger,
          projectedRenderEnergy: heldProjectedRenderEnergy,
          rawProjectedRenderEnergy: Math.max(
            energyLedger.rawProjectedRenderEnergy ?? 0,
            heldProjectedRenderEnergy,
          ),
          projectedSourceCoupledEnergy: modalResponseSourceCoupledEnergy,
          projectedResonantEnergy: modalResponseResonantEnergy,
          projectedEnergyScale: 1,
          renderAuthority: true,
        };
        if (analysisResult.structuralMetrics) {
          analysisResult.structuralMetrics.energyLedger = energyLedger;
          analysisResult.structuralMetrics.modalResponseRenderEnergy =
            heldProjectedRenderEnergy;
          analysisResult.structuralMetrics.modalResponseRenderSourceCoupledEnergy =
            modalResponseSourceCoupledEnergy;
          analysisResult.structuralMetrics.modalResponseRenderResonantEnergy =
            modalResponseResonantEnergy;
        }
      } else {
        fieldState = FIELD_STATES.idle;
        hasModalField = false;
        renderAuthority = false;
      }
    }
    modalDescriptor = buildCanonicalFullModalDescriptor({
      generation: preparedInputs.auditState?.frame ?? 0,
      maxTotalModes: Math.min(
        preparedInputs.capacity,
        AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
      ),
      // Structural coverage remains the 12 steady pages. The extra physical
      // atlas page is reserved exclusively for an active/pending handoff.
      basisAtlasPageCapacity: MODAL_BASIS_STEADY_MODE_COUNT,
      modalFieldSlots: continuityDescriptorSource.modalFieldSlots,
      modalFieldPhaseSlots: continuityDescriptorSource.modalFieldPhaseSlots,
      modalFieldColorSlots: continuityDescriptorSource.modalFieldColorSlots,
      modalFieldSpectralLaneA:
        continuityDescriptorSource.modalFieldSpectralLaneA,
      modalFieldSpectralLaneB:
        continuityDescriptorSource.modalFieldSpectralLaneB,
      modalFieldSpectralMeta: continuityDescriptorSource.modalFieldSpectralMeta,
      modalFieldMetadataSlots:
        continuityDescriptorSource.modalFieldMetadataSlots,
      activeModalFieldModeCount:
        continuityDescriptorSource.activeModalFieldModeCount,
      observerCandidateModeCount:
        analysisResult.structuralMetrics?.excitedModeCount,
      observedModalModeCount:
        analysisResult.structuralMetrics?.observedModalModeCount,
      phaseAuthorityModeCount:
        analysisResult.structuralMetrics?.modalPhaseCoherentFieldModeCount,
      rawCandidateModeCount:
        modalFieldContinuityDiagnostics.rawCandidateModeCount,
      confidenceQualifiedCandidateModeCount:
        modalFieldContinuityDiagnostics.confidenceQualifiedCandidateModeCount,
      lowConfidenceCandidateModeCount:
        modalFieldContinuityDiagnostics.lowConfidenceCandidateModeCount,
      rawCandidateModalEnergy:
        modalFieldContinuityDiagnostics.rawCandidateModalEnergy,
      confidenceWeightedCandidateEnergy:
        modalFieldContinuityDiagnostics.confidenceWeightedCandidateEnergy,
      modalObservationCoherence,
      modalObservationConfidence,
      overBandwidthRejectedModeCount:
        modalFieldContinuityDiagnostics.overBandwidthRejectedModeCount +
        overBandwidthDiagnosticModeCount,
      overBandwidthRejectedModalEnergy:
        modalFieldContinuityDiagnostics.overBandwidthRejectedModalEnergy +
        overBandwidthDiagnosticModalEnergy,
      overBandwidthMaxRequestedModeIndex:
        Math.max(
          continuityOverBandwidthMaxModeIndex,
          overBandwidthDiagnosticMaxModeIndex,
        ),
      overBandwidthMaxRequestedMode: /** @type {[number, number, number]} */ ([
        overBandwidthMaxRequestedMode?.[0] ?? 0,
        overBandwidthMaxRequestedMode?.[1] ?? 0,
        overBandwidthMaxRequestedMode?.[2] ?? 0,
      ]),
      upstreamSourceCoupledModeCount:
        continuityDescriptorSources.activeSourceCoupledModeCount,
      upstreamResonantModeCount:
        continuityDescriptorSources.activeResonantModeCount,
      upstreamCandidateModeCount:
        modalFieldDescriptorSource.activeModalFieldModeCount,
      upstreamSourceCoupledShellCount: upstreamSourceCoupledTopology.shellCount,
      upstreamResonantShellCount: upstreamResonantTopology.shellCount,
      upstreamCandidateShellCount: upstreamCandidateTopology.shellCount,
      upstreamSourceCoupledModalEnergy,
      upstreamResonantModalEnergy,
      upstreamCandidateModalEnergy,
      cavityGeometry: preparedInputs.effectiveCavityGeometry,
      modeIdentityRetentionRatio:
        modalFieldContinuityDiagnostics.modeIdentityRetentionRatio,
      previousFieldAuthority:
        preparedInputs.modalDescriptorAuthorityState?.previousFieldAuthority,
      allowOverBandwidthProjectionRetention:
        !preparedInputs.resolvedAuditSettings.injectTestTone &&
        resolvedSourceEvidence.currentSourceEvidence === true &&
        energyLedger.renderBoundaryState === "live",
    });
    if (preparedInputs.modalDescriptorAuthorityState) {
      preparedInputs.modalDescriptorAuthorityState.previousFieldAuthority =
        modalDescriptor.fieldAuthority;
    }
  }
  if (modalDescriptor.fieldAuthority === "bandwidth-limited") {
    fieldState = FIELD_STATES.idle;
    hasModalField = false;
    renderAuthority = false;
    structureSignal = 0;
    energySignal = 0;
    changeSignal = 0;
    pulseSignal = 0;
    modeCoherence = 0;
    modalVisibilityEnergy = 0;
    modalObserverVisibilityEnergy = 0;
    modalVisibilityRetainedHighQEnergy = 0;
    projectedModalRenderEnergy = 0;
    modalResponseSourceCoupledEnergy = 0;
    modalResponseResonantEnergy = 0;
    observationEnergy = 0;
    modalPhaseAuthority = 0;
    timbreSpread = 0;
    spectralNovelty = 0;
    energyLedger = {
      ...energyLedger,
      projectedRenderEnergy: 0,
      projectedSourceCoupledEnergy: 0,
      projectedResonantEnergy: 0,
      projectedEnergyScale: 0,
      renderAuthority: false,
    };
    if (analysisResult.structuralMetrics) {
      analysisResult.structuralMetrics.energyLedger = energyLedger;
      analysisResult.structuralMetrics.modalResponseRenderEnergy = 0;
      analysisResult.structuralMetrics.modalResponseRenderSourceCoupledEnergy = 0;
      analysisResult.structuralMetrics.modalResponseRenderResonantEnergy = 0;
    }
  }
  if (topologyOnly) {
    return {
      activeModeCount: modalDescriptor.counts.modalFieldModeCount,
      activeModalFieldModeCount: modalDescriptor.counts.modalFieldModeCount,
      modalFieldContinuity: modalFieldContinuityDiagnostics,
      modalDescriptor,
      modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
      modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
      modalFieldColorSlots: modalDescriptor.slotViews.modalFieldColorSlots,
      modalFieldSpectralLaneA:
        modalDescriptor.slotViews.modalFieldSpectralLaneA,
      modalFieldSpectralLaneB:
        modalDescriptor.slotViews.modalFieldSpectralLaneB,
      modalFieldSpectralMeta: modalDescriptor.slotViews.modalFieldSpectralMeta,
      modalFieldMetadataSlots:
        modalDescriptor.slotViews.modalFieldMetadataSlots,
    };
  }
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
      liveInputGateDiagnostics:
        analysisResult.liveInputGateDiagnostics ??
        EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
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
      fftLinearAmplitudes: analysisResult.fftLinearAmplitudes ?? null,
      spectralEffectiveBinCount:
        analysisResult.spectralEffectiveBinCount ?? null,
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
      fftPeakAmplitude: analysisResult.fftPeakAmplitude,
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
    spectralLightRequested: preparedInputs.shouldBuildSpectralLight === true,
    energyLedger,
    projectedRenderEnergy: energyLedger.projectedRenderEnergy,
    sourceEvidence: resolvedSourceEvidence,
    isLiveInputActive: preparedInputs.status?.isLiveInputActive === true,
    soundActive: analysisResult.soundActive,
    micActive: analysisResult.micActive,
    averageAmplitude: analysisResult.avgAmplitude,
    fftLinearAmplitudes: analysisResult.fftLinearAmplitudes,
    activeModeCount: modalDescriptor.counts.modalFieldModeCount,
    activeModalFieldModeCount: modalDescriptor.counts.modalFieldModeCount,
    modalFieldContinuity: modalFieldContinuityDiagnostics,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalFieldColorSlots: modalDescriptor.slotViews.modalFieldColorSlots,
    modalFieldSpectralLaneA: modalDescriptor.slotViews.modalFieldSpectralLaneA,
    modalFieldSpectralLaneB: modalDescriptor.slotViews.modalFieldSpectralLaneB,
    modalFieldSpectralMeta: modalDescriptor.slotViews.modalFieldSpectralMeta,
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
    modalResponseRenderSourceCoupledEnergy: modalResponseSourceCoupledEnergy,
    modalResponseRenderResonantEnergy: modalResponseResonantEnergy,
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
    modalObservationCoherence,
    modalObservationConfidence,
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
