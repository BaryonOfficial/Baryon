import { findSpectralPeakFrequencies } from "./modalResolvers.js";

/**
 * @typedef {{
 *   minFrequency?: number;
 *   maxFrequency?: number;
 *   minRms?: number;
 *   lowEnergyRms?: number;
 *   minConfidence?: number;
 * }} AutocorrelationPitchOptions
 */

/**
 * @typedef {{
 *   minFrequency?: number;
 *   maxFrequency?: number;
 *   maxPeakFrequency?: number;
 *   peakCount?: number;
 *   harmonicCount?: number;
 *   minConfidence?: number;
 * }} SpectralPitchOptions
 */

const DEFAULT_AUTOCORR_OPTIONS = Object.freeze({
  minFrequency: 70,
  maxFrequency: 650,
  minRms: 0.008,
  lowEnergyRms: 0.02,
  minConfidence: 0.48,
});

const DEFAULT_SPECTRAL_OPTIONS = Object.freeze({
  minFrequency: 70,
  maxFrequency: 1400,
  maxPeakFrequency: 5000,
  peakCount: 10,
  harmonicCount: 5,
  minConfidence: 0.34,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function createPitchResult(overrides = {}) {
  return {
    frequencyHz: 0,
    confidence: 0,
    voiced: false,
    source: "none",
    periodicity: 0,
    periodicityFrequencyHz: 0,
    harmonicSupport: 0,
    directSupport: 0,
    supportSources: 0,
    lowEnergy: false,
    ...overrides,
  };
}

function removeDcOffset(timeData) {
  if (!timeData?.length) {
    return null;
  }

  const centered = new Float32Array(timeData.length);
  let mean = 0;
  for (let i = 0; i < timeData.length; i++) {
    mean += timeData[i] ?? 0;
  }
  mean /= Math.max(1, timeData.length);

  for (let i = 0; i < timeData.length; i++) {
    centered[i] = (timeData[i] ?? 0) - mean;
  }

  return centered;
}

function computeRms(timeData) {
  if (!timeData?.length) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const sample = timeData[i] ?? 0;
    sum += sample * sample;
  }

  return Math.sqrt(sum / Math.max(1, timeData.length));
}

function refineLag(correlations, lag) {
  if (lag <= 0 || lag >= correlations.length - 1) {
    return lag;
  }

  const left = correlations[lag - 1] ?? correlations[lag];
  const center = correlations[lag] ?? 0;
  const right = correlations[lag + 1] ?? correlations[lag];
  const denominator = left - 2 * center + right;
  if (Math.abs(denominator) < 1e-6) {
    return lag;
  }

  const offset = (left - right) / (2 * denominator);
  return lag + Math.max(-1, Math.min(1, offset));
}

/**
 * @param {Float32Array | null | undefined} timeData
 * @param {number | undefined} sampleRate
 * @param {AutocorrelationPitchOptions} [options]
 */
export function detectAutocorrelationPitch(
  timeData,
  sampleRate,
  options = DEFAULT_AUTOCORR_OPTIONS,
) {
  if (!timeData?.length || !sampleRate) {
    return createPitchResult();
  }

  const minFrequency = Math.max(1, options.minFrequency ?? 70);
  const maxFrequency = Math.max(minFrequency, options.maxFrequency ?? 650);
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(
    timeData.length - 2,
    Math.ceil(sampleRate / minFrequency),
  );

  if (maxLag <= minLag) {
    return createPitchResult();
  }

  const centered = removeDcOffset(timeData);
  const rms = computeRms(centered);
  const lowEnergy =
    rms < (options.lowEnergyRms ?? DEFAULT_AUTOCORR_OPTIONS.lowEnergyRms);
  if (!(rms > (options.minRms ?? DEFAULT_AUTOCORR_OPTIONS.minRms))) {
    return createPitchResult({ lowEnergy });
  }

  const correlations = new Float32Array(maxLag + 2);
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let numerator = 0;
    let sumLeft = 0;
    let sumRight = 0;
    const limit = centered.length - lag;
    for (let i = 0; i < limit; i++) {
      const left = centered[i];
      const right = centered[i + lag];
      numerator += left * right;
      sumLeft += left * left;
      sumRight += right * right;
    }

    const denominator = Math.sqrt(sumLeft * sumRight);
    const correlation = denominator > 1e-6 ? numerator / denominator : 0;
    correlations[lag] = correlation;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorrelation <= 0) {
    return createPitchResult({ lowEnergy });
  }

  const refinedLag = refineLag(correlations, bestLag);
  const frequencyHz = sampleRate / Math.max(1, refinedLag);
  const correlationDrop =
    bestCorrelation -
    Math.max(0, correlations[Math.max(minLag, bestLag * 2)] ?? 0);
  const confidence = clamp01(bestCorrelation * 0.8 + correlationDrop * 0.4);
  const inRange =
    Number.isFinite(frequencyHz) &&
    frequencyHz >= minFrequency &&
    frequencyHz <= maxFrequency;

  return createPitchResult({
    frequencyHz: inRange ? frequencyHz : 0,
    confidence,
    voiced:
      inRange &&
      confidence >=
        (options.minConfidence ?? DEFAULT_AUTOCORR_OPTIONS.minConfidence),
    source: inRange ? "autocorrelation" : "none",
    periodicity: bestCorrelation,
    periodicityFrequencyHz: inRange ? frequencyHz : 0,
    lowEnergy,
  });
}

function sampleFrequencyAmplitude(
  frequency,
  fftMagnitudes,
  sampleRate,
  fftSize,
) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize || frequency <= 0) {
    return 0;
  }

  const nyquist = sampleRate * 0.5;
  const bin = Math.round((frequency / nyquist) * (fftSize * 0.5 - 1));
  const index = Math.max(0, Math.min(fftMagnitudes.length - 1, bin));
  return fftMagnitudes[index] ?? 0;
}

function countAlignedSpectralSources(candidateFrequency, peaks) {
  if (!(candidateFrequency > 0) || !peaks?.length) {
    return 0;
  }

  let count = 0;
  for (const peak of peaks) {
    const peakFrequency = peak?.frequency ?? 0;
    const peakAmplitude = peak?.amplitude ?? 0;
    if (!(peakFrequency > 0) || !(peakAmplitude > 0.02)) {
      continue;
    }

    const ratio = peakFrequency / candidateFrequency;
    const nearest = Math.max(1, Math.round(ratio));
    if (nearest > 6) {
      continue;
    }

    if (Math.abs(ratio - nearest) <= 0.1 * nearest) {
      count += 1;
    }
  }

  return count;
}

function scoreSpectralCandidate(
  candidateFrequency,
  fftMagnitudes,
  sampleRate,
  fftSize,
  harmonicCount,
  peaks,
) {
  if (!Number.isFinite(candidateFrequency) || candidateFrequency <= 0) {
    return {
      confidence: 0,
      directSupport: 0,
      harmonicSupport: 0,
      supportSources: 0,
    };
  }

  const binLimit = Math.max(1, harmonicCount);
  let directSupport = 0;
  let harmonicSupport = 0;
  let weightTotal = 0;
  for (let harmonic = 1; harmonic <= binLimit; harmonic++) {
    const weight = harmonic === 1 ? 1 : 1 / harmonic;
    const support = sampleFrequencyAmplitude(
      candidateFrequency * harmonic,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    if (harmonic === 1) {
      directSupport = support;
    }
    harmonicSupport += support * weight;
    weightTotal += weight;
  }

  const normalizedHarmonicSupport =
    weightTotal > 0 ? harmonicSupport / weightTotal : 0;
  const supportSources = countAlignedSpectralSources(candidateFrequency, peaks);
  const sourceConfidence = clamp01((supportSources - 1) * 0.16);

  return {
    confidence: clamp01(
      directSupport * 0.44 + normalizedHarmonicSupport * 0.4 + sourceConfidence,
    ),
    directSupport,
    harmonicSupport: normalizedHarmonicSupport,
    supportSources,
  };
}

/**
 * @param {Float32Array | null | undefined} fftMagnitudes
 * @param {number | undefined} sampleRate
 * @param {number | undefined} fftSize
 * @param {SpectralPitchOptions} [options]
 */
export function detectSpectralPitch(
  fftMagnitudes,
  sampleRate,
  fftSize,
  options = DEFAULT_SPECTRAL_OPTIONS,
) {
  const minFrequency = Math.max(1, options.minFrequency ?? 70);
  const maxFrequency = Math.max(minFrequency, options.maxFrequency ?? 1400);
  const peaks = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    options.peakCount ?? DEFAULT_SPECTRAL_OPTIONS.peakCount,
    {
      minFrequency,
      maxFrequency:
        options.maxPeakFrequency ?? DEFAULT_SPECTRAL_OPTIONS.maxPeakFrequency,
    },
  );

  if (!peaks.length) {
    return createPitchResult();
  }

  let best = createPitchResult();

  for (const peak of peaks) {
    for (let divisor = 1; divisor <= 4; divisor++) {
      const candidateFrequency = peak.frequency / divisor;
      if (
        !Number.isFinite(candidateFrequency) ||
        candidateFrequency < minFrequency ||
        candidateFrequency > maxFrequency
      ) {
        continue;
      }

      const score = scoreSpectralCandidate(
        candidateFrequency,
        fftMagnitudes,
        sampleRate,
        fftSize,
        options.harmonicCount ?? DEFAULT_SPECTRAL_OPTIONS.harmonicCount,
        peaks,
      );
      const divisorBias = divisor === 1 ? 0.03 : 0.08;
      const confidence = clamp01(score.confidence + divisorBias);
      if (confidence > best.confidence) {
        best = createPitchResult({
          frequencyHz: candidateFrequency,
          confidence,
          voiced:
            confidence >=
            (options.minConfidence ?? DEFAULT_SPECTRAL_OPTIONS.minConfidence),
          source: divisor === 1 ? "spectral" : "spectral-subharmonic",
          harmonicSupport: score.harmonicSupport,
          directSupport: score.directSupport,
          supportSources: score.supportSources,
        });
      }
    }
  }

  return best;
}

function areHarmonicallyRelated(left, right) {
  if (!(left > 0) || !(right > 0)) {
    return false;
  }

  const higher = Math.max(left, right);
  const lower = Math.min(left, right);
  const ratio = higher / lower;
  const nearest = Math.max(1, Math.round(ratio));
  return Math.abs(ratio - nearest) <= 0.085 * nearest;
}

function withVoiceDiagnostics(base, autocorrelationPitch, spectralPitch) {
  const relatedToSpectral =
    base.frequencyHz > 0 &&
    spectralPitch.frequencyHz > 0 &&
    areHarmonicallyRelated(base.frequencyHz, spectralPitch.frequencyHz);
  const hasPeriodicTimeSignal =
    (autocorrelationPitch.periodicity ?? 0) > 0.05 ||
    (autocorrelationPitch.periodicityFrequencyHz ?? 0) > 0;

  return createPitchResult({
    ...base,
    periodicity: autocorrelationPitch.periodicity ?? 0,
    periodicityFrequencyHz: autocorrelationPitch.periodicityFrequencyHz ?? 0,
    harmonicSupport: relatedToSpectral
      ? (spectralPitch.harmonicSupport ?? 0)
      : (base.harmonicSupport ?? 0),
    directSupport: relatedToSpectral
      ? (spectralPitch.directSupport ?? 0)
      : (base.directSupport ?? 0),
    supportSources: relatedToSpectral
      ? (spectralPitch.supportSources ?? 0)
      : (base.supportSources ?? 0),
    lowEnergy: hasPeriodicTimeSignal && Boolean(autocorrelationPitch.lowEnergy),
  });
}

function shouldPreferAutocorrelationFundamental(
  autocorrelationPitch,
  spectralPitch,
) {
  if (!autocorrelationPitch.voiced || !spectralPitch.voiced) {
    return false;
  }

  if (!(spectralPitch.frequencyHz > autocorrelationPitch.frequencyHz)) {
    return false;
  }

  return (
    spectralPitch.source === "spectral" &&
    spectralPitch.supportSources <= 2 &&
    autocorrelationPitch.periodicity >= 0.55
  );
}

function shouldPreferSpectralSubharmonicCandidate(
  autocorrelationPitch,
  spectralPitch,
) {
  if (!autocorrelationPitch.voiced || !spectralPitch.voiced) {
    return false;
  }

  if (spectralPitch.source !== "spectral-subharmonic") {
    return false;
  }

  const ratio =
    spectralPitch.frequencyHz / Math.max(1, autocorrelationPitch.frequencyHz);
  return (
    ratio >= 1.8 &&
    ratio <= 2.2 &&
    spectralPitch.supportSources >= 2 &&
    spectralPitch.confidence >= 0.28
  );
}

/**
 * @param {{
 *   timeData?: Float32Array;
 *   fftMagnitudes?: Float32Array;
 *   sampleRate?: number;
 *   fftSize?: number;
 *   autocorrelation?: AutocorrelationPitchOptions;
 *   spectral?: SpectralPitchOptions;
 * }} [options]
 */
export function detectVoicePitch(options = {}) {
  const {
    timeData,
    fftMagnitudes,
    sampleRate,
    fftSize,
    autocorrelation = DEFAULT_AUTOCORR_OPTIONS,
    spectral = DEFAULT_SPECTRAL_OPTIONS,
  } = options;
  const autocorrelationPitch = detectAutocorrelationPitch(
    timeData,
    sampleRate,
    autocorrelation,
  );
  const spectralPitch = detectSpectralPitch(
    fftMagnitudes,
    sampleRate,
    fftSize,
    spectral,
  );
  const autocorrelationMaxHz =
    autocorrelation?.maxFrequency ?? DEFAULT_AUTOCORR_OPTIONS.maxFrequency;

  if (
    spectralPitch.voiced &&
    spectralPitch.frequencyHz > autocorrelationMaxHz &&
    (!autocorrelationPitch.voiced ||
      spectralPitch.frequencyHz /
        Math.max(1, autocorrelationPitch.frequencyHz || 1) >=
        4)
  ) {
    return withVoiceDiagnostics(
      spectralPitch,
      autocorrelationPitch,
      spectralPitch,
    );
  }

  if (
    autocorrelationPitch.voiced &&
    spectralPitch.voiced &&
    areHarmonicallyRelated(
      autocorrelationPitch.frequencyHz,
      spectralPitch.frequencyHz,
    )
  ) {
    if (
      shouldPreferSpectralSubharmonicCandidate(
        autocorrelationPitch,
        spectralPitch,
      )
    ) {
      return withVoiceDiagnostics(
        spectralPitch,
        autocorrelationPitch,
        spectralPitch,
      );
    }

    const spectralDominant =
      spectralPitch.confidence > autocorrelationPitch.confidence &&
      !shouldPreferAutocorrelationFundamental(
        autocorrelationPitch,
        spectralPitch,
      );
    return withVoiceDiagnostics(
      createPitchResult({
        frequencyHz: spectralDominant
          ? spectralPitch.frequencyHz
          : autocorrelationPitch.frequencyHz,
        confidence: clamp01(
          Math.max(
            autocorrelationPitch.confidence,
            spectralPitch.confidence * 0.96,
          ),
        ),
        voiced: true,
        source: spectralDominant
          ? spectralPitch.source
          : autocorrelationPitch.source,
        harmonicSupport: spectralPitch.harmonicSupport,
        directSupport: spectralPitch.directSupport,
        supportSources: spectralPitch.supportSources,
      }),
      autocorrelationPitch,
      spectralPitch,
    );
  }

  if (autocorrelationPitch.voiced) {
    return withVoiceDiagnostics(
      autocorrelationPitch,
      autocorrelationPitch,
      spectralPitch,
    );
  }

  if (spectralPitch.voiced) {
    return withVoiceDiagnostics(
      spectralPitch,
      autocorrelationPitch,
      spectralPitch,
    );
  }

  return spectralPitch.confidence >= autocorrelationPitch.confidence
    ? withVoiceDiagnostics(spectralPitch, autocorrelationPitch, spectralPitch)
    : withVoiceDiagnostics(
        autocorrelationPitch,
        autocorrelationPitch,
        spectralPitch,
      );
}
