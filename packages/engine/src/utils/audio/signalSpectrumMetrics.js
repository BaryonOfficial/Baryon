import { binIndexToFrequencyHz, frequencyToBinIndex } from "./binFrequency.js";
import { clamp01 } from "../math.js";
import { SPECTRAL_EVIDENCE_POLICY } from "./spectralEvidence.js";

const BAND_LIMITS_HZ = [140, 600, 2400, 8000];
const SPECTRAL_BAND_LIMITS_HZ = [
  140,
  400,
  1200,
  3200,
  6400,
  SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz,
];
const SPECTRAL_BAND_COUNT = SPECTRAL_BAND_LIMITS_HZ.length;
const TREBLE_FLATNESS_MIN_HZ = 3200;
const TREBLE_FLATNESS_MAX_HZ = 10000;

export const BAND_BUCKET_COUNT = BAND_LIMITS_HZ.length;

// Whitepaper eq: E_b = clip(max(mean_b, 0.55*rms_b, 0.18*peak_b)) — an
// absolute per-band estimate, not a share of total spectral power, so a
// band's energy reflects its own loudness rather than its proportion of the
// current frame.
function deriveBandEnergy({
  amplitudeSum,
  squaredSum,
  maxAmplitude,
  binCount,
}) {
  if (!(binCount > 0)) {
    return 0;
  }
  const meanAmplitude = amplitudeSum / binCount;
  const rmsAmplitude = Math.sqrt(squaredSum / binCount);
  return clamp01(
    Math.max(meanAmplitude, 0.55 * rmsAmplitude, 0.18 * maxAmplitude),
  );
}

export function computeSignalSpectrumMetrics({
  fftLinearAmplitudes,
  previousSpectrum,
  sampleRate,
  fftSize,
}) {
  const bandEnergies = new Float32Array(BAND_BUCKET_COUNT);
  const spectralBandEnergies = new Float32Array(SPECTRAL_BAND_COUNT);
  const empty = {
    bandEnergies,
    spectralBandEnergies,
    trebleBroadbandEnergy: 0,
    trebleTonalEnergy: 0,
    spectralCentroid: 0,
    spectralSpread: 0,
    spectralFlatness: 0,
    spectralFlux: 0,
  };
  if (!fftLinearAmplitudes?.length) {
    return empty;
  }

  const hasFrequencyDomain = Boolean(sampleRate);
  const hasBandEnergyDomain = hasFrequencyDomain && Boolean(fftSize);
  const bandAmplitudeSums = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const bandSquaredSums = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const bandMaxAmplitude = hasBandEnergyDomain
    ? new Float32Array(BAND_BUCKET_COUNT)
    : null;
  const bandBinCounts = hasBandEnergyDomain
    ? new Uint32Array(BAND_BUCKET_COUNT)
    : null;
  const spectralAmplitudeSums = hasFrequencyDomain
    ? new Float32Array(SPECTRAL_BAND_COUNT)
    : null;
  const spectralSquaredSums = hasFrequencyDomain
    ? new Float32Array(SPECTRAL_BAND_COUNT)
    : null;
  const spectralMaxAmplitude = hasFrequencyDomain
    ? new Float32Array(SPECTRAL_BAND_COUNT)
    : null;
  const spectralBinCounts = hasFrequencyDomain
    ? new Uint32Array(SPECTRAL_BAND_COUNT)
    : null;
  const fluxLimit = previousSpectrum?.length
    ? Math.min(fftLinearAmplitudes.length, previousSpectrum.length)
    : 0;
  const nyquist = hasFrequencyDomain ? sampleRate * 0.5 : 0;
  // A continuous cutoff is represented by its nearest FFT bin. Clamp that
  // boundary bin back to the declared frequency so 12 kHz stays inclusive at
  // sample rates whose bin lattice cannot represent it exactly.
  const maxAnalysisBin = hasFrequencyDomain
    ? frequencyToBinIndex(
        SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz,
        fftLinearAmplitudes.length,
        sampleRate,
      )
    : fftLinearAmplitudes.length - 1;
  let weightedFrequency = 0;
  let weightedFrequencySquared = 0;
  let totalAmplitude = 0;
  let totalPower = 0;
  let positiveAmplitudeDelta = 0;
  let comparedCurrentAmplitude = 0;
  let amplitudeLogAmplitudeSum = 0;
  let trebleAmplitudeSum = 0;
  let treblePower = 0;
  let trebleLogSum = 0;
  let trebleCount = 0;

  for (let i = 0; i < fftLinearAmplitudes.length; i += 1) {
    if (i > maxAnalysisBin) {
      continue;
    }
    const frequency = hasFrequencyDomain
      ? Math.min(
          SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz,
          binIndexToFrequencyHz(i, fftLinearAmplitudes.length, sampleRate),
        )
      : 0;

    const amplitude = fftLinearAmplitudes[i] ?? 0;
    const power = amplitude * amplitude;
    totalPower += power;
    totalAmplitude += amplitude;
    if (amplitude > 0) {
      amplitudeLogAmplitudeSum += amplitude * Math.log(amplitude);
    }

    if (i < fluxLimit) {
      comparedCurrentAmplitude += amplitude;
      const previousAmplitude = previousSpectrum[i] ?? 0;
      const amplitudeDelta = amplitude - previousAmplitude;
      if (amplitudeDelta > 0) positiveAmplitudeDelta += amplitudeDelta;
    }

    if (!hasFrequencyDomain) {
      continue;
    }

    if (amplitude > 0) {
      weightedFrequency += frequency * amplitude;
      weightedFrequencySquared += frequency * frequency * amplitude;
    }

    if (hasBandEnergyDomain) {
      let bandIndex = BAND_BUCKET_COUNT - 1;
      for (let j = 0; j < BAND_LIMITS_HZ.length; j += 1) {
        if (frequency <= BAND_LIMITS_HZ[j]) {
          bandIndex = j;
          break;
        }
      }
      bandAmplitudeSums[bandIndex] += amplitude;
      bandSquaredSums[bandIndex] += power;
      bandMaxAmplitude[bandIndex] = Math.max(
        bandMaxAmplitude[bandIndex],
        amplitude,
      );
      bandBinCounts[bandIndex] += 1;
    }

    let spectralBandIndex = SPECTRAL_BAND_COUNT - 1;
    for (let j = 0; j < SPECTRAL_BAND_LIMITS_HZ.length; j += 1) {
      if (frequency <= SPECTRAL_BAND_LIMITS_HZ[j]) {
        spectralBandIndex = j;
        break;
      }
    }
    spectralAmplitudeSums[spectralBandIndex] += amplitude;
    spectralSquaredSums[spectralBandIndex] += power;
    spectralMaxAmplitude[spectralBandIndex] = Math.max(
      spectralMaxAmplitude[spectralBandIndex],
      amplitude,
    );
    spectralBinCounts[spectralBandIndex] += 1;

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
    empty.spectralFlux = clamp01(
      positiveAmplitudeDelta /
        Math.max(Number.EPSILON, comparedCurrentAmplitude),
    );
  }

  // Normalized spectral entropy measures how evenly magnitude is distributed
  // without treating silence outside the occupied band as tonal evidence.
  // A single-bin tone is 0, while broader occupancy trends toward 1 in
  // proportion to its analyzed bandwidth. The closed form avoids a second FFT
  // sweep:
  // H(X/sum X) = log(sum X) - sum(X log X)/sum X.
  if (totalAmplitude > Number.EPSILON && fftLinearAmplitudes.length > 1) {
    const spectralEntropy =
      Math.log(totalAmplitude) - amplitudeLogAmplitudeSum / totalAmplitude;
    empty.spectralFlatness = clamp01(
      spectralEntropy / Math.log(fftLinearAmplitudes.length),
    );
  }

  if (hasBandEnergyDomain) {
    for (let i = 0; i < BAND_BUCKET_COUNT; i += 1) {
      bandEnergies[i] = deriveBandEnergy({
        amplitudeSum: bandAmplitudeSums[i],
        squaredSum: bandSquaredSums[i],
        maxAmplitude: bandMaxAmplitude[i],
        binCount: bandBinCounts[i],
      });
    }
  }

  if (hasFrequencyDomain) {
    for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
      spectralBandEnergies[i] = deriveBandEnergy({
        amplitudeSum: spectralAmplitudeSums[i],
        squaredSum: spectralSquaredSums[i],
        maxAmplitude: spectralMaxAmplitude[i],
        binCount: spectralBinCounts[i],
      });
    }

    const safeTotalAmplitude = Math.max(Number.EPSILON, totalAmplitude);
    const meanFrequencyHz = weightedFrequency / safeTotalAmplitude;
    empty.spectralCentroid = Math.min(
      1,
      meanFrequencyHz / Math.max(1, nyquist),
    );
    // Spectral spread (second central moment): the standard MPEG-7/DSP
    // complement to centroid, computed from the same magnitude-weighted
    // accumulation via Var(f) = E[f^2] - E[f]^2 rather than a second pass.
    const meanSquaredFrequencyHz =
      weightedFrequencySquared / safeTotalAmplitude;
    const spectralSpreadHz = Math.sqrt(
      Math.max(0, meanSquaredFrequencyHz - meanFrequencyHz * meanFrequencyHz),
    );
    empty.spectralSpread = Math.min(1, spectralSpreadHz / Math.max(1, nyquist));

    let trebleFlatness = 0;
    let trebleMean = 0;
    if (trebleCount > 0) {
      trebleMean = trebleAmplitudeSum / trebleCount;
      const trebleGeometricMean = Math.exp(trebleLogSum / trebleCount);
      trebleFlatness =
        trebleMean > 1e-8 ? Math.min(1, trebleGeometricMean / trebleMean) : 0;
    }
    const trebleEnergyFraction =
      totalPower > Number.EPSILON ? treblePower / totalPower : 0;
    empty.trebleBroadbandEnergy = clamp01(
      trebleEnergyFraction * trebleFlatness,
    );
    empty.trebleTonalEnergy = clamp01(
      trebleEnergyFraction * (1 - trebleFlatness),
    );
  }

  return empty;
}
