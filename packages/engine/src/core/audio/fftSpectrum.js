export const FFT_MIN_DECIBELS = -100;
export const FFT_MAX_DECIBELS = -30;
export const BLACKMAN_WINDOW_COHERENT_GAIN = 0.42;

// Periodic Blackman aperture mandated for Web Audio AnalyserNode.
export function computeBlackmanWindow(index, size) {
  const angle = (2 * Math.PI * index) / size;
  return (
    BLACKMAN_WINDOW_COHERENT_GAIN -
    0.5 * Math.cos(angle) +
    0.08 * Math.cos(2 * angle)
  );
}

/**
 * Input is |DFT(window * samples)| / N, the native Web Audio magnitude.
 * Output is a bounded one-sided, coherent-gain-corrected amplitude estimate
 * relative to digital full scale. Only non-DC bins double the two-sided DFT.
 * The acquisition floor applies before gain correction, in native FFT units.
 */
export function normalizeFftMagnitude(
  magnitude,
  bin,
  coherentGain = BLACKMAN_WINDOW_COHERENT_GAIN,
  minDecibels = FFT_MIN_DECIBELS,
) {
  if (!Number.isFinite(magnitude) || magnitude <= 10 ** (minDecibels / 20)) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(1, (magnitude * (bin === 0 ? 1 : 2)) / coherentGain),
  );
}

// The legacy 0-255 level remains a decibel-range measure, independently
// derived from native magnitudes rather than the corrected/clipped spectrum.
export function normalizeDecibelMagnitude(
  value,
  minDecibels = FFT_MIN_DECIBELS,
  maxDecibels = FFT_MAX_DECIBELS,
) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const span = Math.max(1e-6, maxDecibels - minDecibels);
  return Math.max(0, Math.min(1, (value - minDecibels) / span));
}
