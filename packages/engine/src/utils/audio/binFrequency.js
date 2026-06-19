// Map between FFT bin indices and frequencies (Hz) for Web Audio AnalyserNode
// magnitude buffers.
//
// The Web Audio specification places bin k at center frequency
//   f_k = k * sampleRate / fftSize
//        = k * nyquist  / (fftSize / 2)
//        = k * nyquist  / binCount
// where binCount is the magnitude-buffer length (AnalyserNode.frequencyBinCount,
// equal to fftSize / 2). The divisor is therefore `binCount`, not
// `binCount - 1`. Historically a handful of callsites used `binCount - 1`,
// which compresses the bin↔frequency map by one bin and introduces a
// systematic off-by-one at high frequencies. Routing every callsite through
// these helpers eliminates that drift and keeps the engine consistent with
// what `AnalyserNode.getFloatFrequencyData` actually emits.

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

/**
 * Convert a frequency to its (fractional) FFT bin position.
 *
 * Returns `frequencyHz * binCount / nyquist`. Use this for peak interpolation
 * or anywhere a non-integer position is meaningful; use
 * {@link frequencyToBinIndex} when you want an array index.
 *
 * @param {number} frequencyHz
 * @param {number} binCount   AnalyserNode.frequencyBinCount (== fftSize / 2)
 * @param {number} sampleRate Hz
 * @returns {number} Fractional bin position; 0 for invalid input.
 */
export function frequencyToBin(frequencyHz, binCount, sampleRate) {
  if (!Number.isFinite(frequencyHz)) return 0;
  if (!isPositiveFinite(binCount) || !isPositiveFinite(sampleRate)) return 0;
  const nyquist = sampleRate * 0.5;
  return (frequencyHz / nyquist) * binCount;
}

/**
 * Resolve a frequency to a rounded, clamped FFT bin index suitable for direct
 * array indexing into an AnalyserNode magnitude buffer.
 *
 * @param {number} frequencyHz
 * @param {number} binCount   AnalyserNode.frequencyBinCount (== fftSize / 2)
 * @param {number} sampleRate Hz
 * @returns {number} Integer index in `[0, binCount - 1]`; 0 for invalid input.
 */
export function frequencyToBinIndex(frequencyHz, binCount, sampleRate) {
  if (!isPositiveFinite(binCount)) return 0;
  const raw = frequencyToBin(frequencyHz, binCount, sampleRate);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(binCount - 1, Math.round(raw)));
}

/**
 * Inverse of {@link frequencyToBin}: convert a bin index (integer or
 * fractional) to its center frequency in Hz.
 *
 * @param {number} index      Bin position (integer or fractional).
 * @param {number} binCount   AnalyserNode.frequencyBinCount (== fftSize / 2)
 * @param {number} sampleRate Hz
 * @returns {number} Frequency in Hz; 0 for invalid input.
 */
export function binIndexToFrequencyHz(index, binCount, sampleRate) {
  if (!Number.isFinite(index)) return 0;
  if (!isPositiveFinite(binCount) || !isPositiveFinite(sampleRate)) return 0;
  const nyquist = sampleRate * 0.5;
  return (index / binCount) * nyquist;
}
