/**
 * Find the top N spectral peaks from an FFT frequency data array.
 *
 * @param {Uint8Array} freqData  - Raw FFT bin magnitudes [0,255], length = fftSize/2
 * @param {number}     count     - Number of peaks to return (= capacity)
 * @param {number}     sampleRate
 * @param {number}     fftSize
 * @returns {Float32Array} Peak frequencies in Hz, length = count.
 *                         Unfilled slots are 0 (GPU applies per-slot min pitch floor).
 */
export function findFFTPeaks(freqData, count, sampleRate, fftSize) {
  const binHz      = sampleRate / fftSize;
  const minBinGap  = Math.max(1, Math.round(50 / binHz)); // 50 Hz minimum spacing
  const noiseFloor = 30; // out of 255

  const candidates = [];
  for (let i = 1; i < freqData.length - 1; i++) {
    if (
      freqData[i] > noiseFloor &&
      freqData[i] >= freqData[i - 1] &&
      freqData[i] >  freqData[i + 1]
    ) {
      candidates.push({ bin: i, amp: freqData[i] });
    }
  }

  candidates.sort((a, b) => b.amp - a.amp);

  const selected = [];
  for (const c of candidates) {
    if (selected.length >= count) break;
    const tooClose = selected.some(s => Math.abs(s.bin - c.bin) < minBinGap);
    if (!tooClose) selected.push(c);
  }

  const result = new Float32Array(count);
  for (let i = 0; i < selected.length; i++) {
    result[i] = selected[i].bin * binHz;
  }
  return result;
}
