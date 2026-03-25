import { sampleFFTAmplitudeForFrequency } from "../cavityModes.js";

// Harmonic orders and weights for salience scoring.
// Order 1 = fundamental itself (highest weight).
// Odd harmonics (3, 5) discriminate genuine fundamentals from even-harmonic
// overtones: an overtone at 2f only has harmonics at 2f, 4f, 6f, 8f... while
// a genuine fundamental at f also has energy at 3f, 5f, 7f...
const SALIENCE_ORDERS = [1, 2, 3, 4, 5, 6];
const SALIENCE_WEIGHTS = [1.0, 0.9, 0.7, 0.55, 0.4, 0.3];
const SALIENCE_MAX_SCORE = SALIENCE_WEIGHTS.reduce((a, b) => a + b, 0);

/**
 * Score a frequency's harmonic salience: how strongly it appears as a
 * genuine fundamental in the FFT by checking energy at its harmonic series.
 *
 * Reuses `sampleFFTAmplitudeForFrequency` from cavityModes.js for bin lookup.
 *
 * @param {number} frequency - Candidate fundamental frequency in Hz
 * @param {Float32Array} fftMagnitudes
 * @param {number} sampleRate
 * @param {number} fftSize
 * @returns {number} Salience score in [0, 1]
 */
export function scoreHarmonicSalience(
  frequency,
  fftMagnitudes,
  sampleRate,
  fftSize,
) {
  if (
    !frequency ||
    frequency <= 0 ||
    !fftMagnitudes?.length ||
    !sampleRate ||
    !fftSize
  ) {
    return 0;
  }

  let score = 0;
  for (let k = 0; k < SALIENCE_ORDERS.length; k++) {
    const harmonicFreq = frequency * SALIENCE_ORDERS[k];
    const amp = sampleFFTAmplitudeForFrequency(
      harmonicFreq,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    score += amp * SALIENCE_WEIGHTS[k];
  }

  return Math.max(0, Math.min(1, score / SALIENCE_MAX_SCORE));
}

/**
 * Annotate each peak in the array with a `.salienceScore` property in-place.
 * Safe to call on empty or null arrays.
 *
 * @param {Array<{frequency: number, salienceScore?: number}>} peaks - Array of peak objects (mutated)
 * @param {Float32Array} fftMagnitudes
 * @param {number} sampleRate
 * @param {number} fftSize
 */
export function annotatePeakSalience(
  peaks,
  fftMagnitudes,
  sampleRate,
  fftSize,
) {
  if (!Array.isArray(peaks)) return;
  for (const peak of peaks) {
    peak.salienceScore = scoreHarmonicSalience(
      peak.frequency,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
  }
}
