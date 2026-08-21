import { DEFAULT_SAMPLE_RATE } from "../../defaults.js";
import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisSettings,
} from "../../core/audio/liveInputAnalysis.js";
import { clamp01, smoothstep } from "../math.js";
import { computeEmaAlpha, resolveFrameDeltaMs } from "./analysisTiming.js";
import { binIndexToFrequencyHz } from "./binFrequency.js";
import { findCredibleSpectralPeaks } from "./spectralEvidence.js";

const DEFAULT_LIVE_INPUT_POLICY = DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT;
const LIVE_INPUT_CALIBRATION_WINDOW_MS = 1100;
const LIVE_INPUT_CALIBRATION_SMOOTHING_MS = 320;
const LIVE_INPUT_INVALID_BASELINE_PEAK = 0.94;
const LIVE_INPUT_INVALID_COMPRESSED_BASELINE_PEAK = 0.82;
const LIVE_INPUT_INVALID_COMPRESSED_BASELINE_RMS = 0.0085;
const LIVE_INPUT_INVALID_CURRENT_SATURATED_PEAK = 0.98;
const LIVE_INPUT_INVALID_CURRENT_WEAK_RMS = 0.012;
const LIVE_INPUT_RESONANCE_PEAK_COUNT = 4;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_PEAK = 0.03;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_CLARITY = 0.42;
const LIVE_INPUT_AMBIENT_RESONANCE_MIN_CENTROID = 0.006;

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
export const EMPTY_LIVE_INPUT_EVIDENCE_UNITS = Object.freeze({
  rms: 0,
  peak: 0,
  spectralCentroid: 0,
});

/** @type {Readonly<LiveInputGateDiagnostics>} */
export const EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS = Object.freeze({
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

/** @param {unknown} [policy] */
function getLiveInputAcousticIntentConfig(policy = DEFAULT_LIVE_INPUT_POLICY) {
  const normalizedIntent = normalizeLiveInputAcousticIntent(policy);
  return (
    LIVE_INPUT_ACOUSTIC_INTENT_CONFIGS[normalizedIntent] ??
    LIVE_INPUT_ACOUSTIC_INTENT_CONFIGS[DEFAULT_LIVE_INPUT_POLICY]
  );
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
export function resetLiveInputGateState(
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

// Magnitude-weighted per the whitepaper's C_spec = sum(f*X)/sum(X)/f_nyquist
// (not power-weighted), so a single dominant bin doesn't skew the centroid
// more than its own magnitude warrants.
function computeSpectralCentroid(fftLinearAmplitudes, sampleRate) {
  if (!fftLinearAmplitudes?.length || !sampleRate) return 0;

  const nyquist = sampleRate * 0.5;
  let weightedFrequency = 0;
  let amplitudeTotal = 0;
  for (let index = 0; index < fftLinearAmplitudes.length; index += 1) {
    const amplitude = fftLinearAmplitudes[index] ?? 0;
    if (amplitude <= 0) continue;
    const frequency = binIndexToFrequencyHz(
      index,
      fftLinearAmplitudes.length,
      sampleRate,
    );
    weightedFrequency += frequency * amplitude;
    amplitudeTotal += amplitude;
  }

  if (amplitudeTotal <= Number.EPSILON) return 0;
  return Math.min(
    1,
    weightedFrequency / amplitudeTotal / Math.max(1, nyquist),
  );
}

export function computeLiveInputMetrics({
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

  return {
    rms,
    peakAmplitude: Number.isFinite(timeDomainPeakAmplitude)
      ? Math.max(0, timeDomainPeakAmplitude)
      : 0,
    peakFrequency: peaks[0]?.frequency ?? 0,
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
  liveInputAnalysisSettings = undefined,
}) {
  const { acousticIntent } = normalizeLiveInputAnalysisSettings(
    liveInputAnalysisSettings,
  );
  const config = getLiveInputAcousticIntentConfig(acousticIntent);
  const metrics = computeLiveInputMetrics({
    rms,
    fftLinearAmplitudes,
    sampleRate,
    timeDomainPeakAmplitude,
  });

  return (
    !injectTestTone &&
    inputMode === "live" &&
    detectLiveInputHardSilence(metrics, {
      hardSilenceRms: config.absoluteRmsFloor,
      hardSilencePeak: config.absolutePeakFloor,
    }) &&
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

export function resolveLiveInputNoiseGate({
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
  liveInputAnalysisSettings,
}) {
  const bandState = analysisMemory.bandState;
  const { acousticIntent } = normalizeLiveInputAnalysisSettings(
    liveInputAnalysisSettings,
  );
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
  const deltaMs = resolveFrameDeltaMs(
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
