import { getPitchClassForFrequency } from "./pitch.js";

const CHROMA_MIN_HZ = 65; // C2 — ignore sub-bass rumble
const CHROMA_MAX_HZ = 2100; // matches MAX_SPECTRAL_FREQUENCY
const CHROMA_NOISE_FLOOR = 0.03; // skip near-silent FFT bins

// Krumhansl-Kessler key profiles (relative magnitudes matter for correlation)
const MAJOR_PROFILE = Object.freeze([
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
]);
const MINOR_PROFILE = Object.freeze([
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
]);

// Pre-compute profile means once — used in Pearson correlation
const MAJOR_MEAN =
  MAJOR_PROFILE.reduce((a, b) => a + b, 0) / MAJOR_PROFILE.length;
const MINOR_MEAN =
  MINOR_PROFILE.reduce((a, b) => a + b, 0) / MINOR_PROFILE.length;

/**
 * Build a 12-bin chromagram from FFT magnitude data.
 * Bins are accumulated by pitch class across all octaves, then normalized to sum=1.
 *
 * @param {Float32Array} fftMagnitudes
 * @param {number} sampleRate
 * @param {number} fftSize
 * @returns {Float32Array} 12-element chroma vector, sum-to-1 normalized
 */
export function buildChromaVector(fftMagnitudes, sampleRate, fftSize) {
  const chroma = new Float32Array(12);

  if (!fftMagnitudes?.length || !sampleRate || !fftSize) {
    return chroma;
  }

  const binCount = fftSize / 2;
  const binHz = sampleRate / fftSize;
  let total = 0;

  for (let b = 0; b < binCount && b < fftMagnitudes.length; b++) {
    const f = b * binHz;
    if (f < CHROMA_MIN_HZ) continue;
    if (f > CHROMA_MAX_HZ) break;

    const magnitude = fftMagnitudes[b];
    if (magnitude < CHROMA_NOISE_FLOOR) continue;

    const pitchClass = getPitchClassForFrequency(f);
    if (pitchClass == null) continue;

    chroma[pitchClass] += magnitude;
    total += magnitude;
  }

  if (total > 0) {
    for (let i = 0; i < 12; i++) {
      chroma[i] /= total;
    }
  }

  return chroma;
}

/**
 * EMA-smooth a chroma vector in-place.
 * Mutates `smoothed`; does not allocate.
 *
 * @param {Float32Array} smoothed - persistent smoothed state (mutated)
 * @param {Float32Array} incoming - new raw chroma vector
 * @param {number} alpha - 0-1, higher = faster response
 */
export function smoothChromaInPlace(smoothed, incoming, alpha) {
  for (let i = 0; i < 12; i++) {
    smoothed[i] += (incoming[i] - smoothed[i]) * alpha;
  }
}

/**
 * Detect musical key from a chroma vector using Krumhansl-Kessler profiles
 * with Pearson correlation scoring. Pearson normalizes for mean and variance,
 * correctly distinguishing relative major/minor pairs (e.g. C major vs A minor).
 *
 * @param {Float32Array} chromaVector - 12-element, sum-to-1 normalized
 * @returns {{ tonic: number, mode: "major"|"minor", confidence: number }}
 *   tonic: 0-11 (C=0, C#=1, ... B=11)
 *   confidence: Pearson r of the best-matching key profile, clamped 0-1
 */
export function detectKeyFromChroma(chromaVector) {
  let bestScore = -Infinity;
  let bestTonic = 0;
  /** @type {"major" | "minor"} */
  let bestMode = "major";

  // Mean of a sum-to-1 normalized chroma vector is always 1/12
  const chromaMean = 1 / 12;

  for (let root = 0; root < 12; root++) {
    for (let modeIdx = 0; modeIdx < 2; modeIdx++) {
      const profile = modeIdx === 0 ? MAJOR_PROFILE : MINOR_PROFILE;
      const profileMean = modeIdx === 0 ? MAJOR_MEAN : MINOR_MEAN;

      let numerator = 0;
      let chromaVar = 0;
      let profileVar = 0;

      for (let i = 0; i < 12; i++) {
        const xDev = chromaVector[(i + root) % 12] - chromaMean;
        const yDev = profile[i] - profileMean;
        numerator += xDev * yDev;
        chromaVar += xDev * xDev;
        profileVar += yDev * yDev;
      }

      const denom = Math.sqrt(chromaVar * profileVar);
      const score = denom < 1e-10 ? 0 : numerator / denom;

      if (score > bestScore) {
        bestScore = score;
        bestTonic = root;
        bestMode = modeIdx === 0 ? "major" : "minor";
      }
    }
  }

  // Pearson r is in [-1, 1]; clamp to [0, 1] for confidence
  const confidence = Math.max(0, Math.min(1, bestScore));

  return { tonic: bestTonic, mode: bestMode, confidence };
}
