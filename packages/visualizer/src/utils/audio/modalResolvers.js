import { binIndexToFrequencyHz, frequencyToBin } from "./binFrequency.js";
import { SPECTRAL_MODAL_POLICY } from "./policy.js";

export const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;

const MIN_SPECTRAL_BIN_AMPLITUDE =
  SPECTRAL_MODAL_POLICY.minSpectralBinAmplitude;
const MIN_SPECTRAL_BIN_GAP_HZ = SPECTRAL_MODAL_POLICY.minSpectralBinGapHz;
const MAX_SPECTRAL_FREQUENCY = SPECTRAL_MODAL_POLICY.maxSpectralFrequency;

export function findSpectralPeakFrequencies(
  fftMagnitudes,
  sampleRate,
  fftSize,
  count,
  options = undefined,
) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize || count <= 0) {
    return [];
  }

  const nyquist = sampleRate * 0.5;
  const minFrequency = Math.max(0, options?.minFrequency ?? 0);
  const maxFrequency = Math.min(
    nyquist,
    options?.maxFrequency ?? MAX_SPECTRAL_FREQUENCY,
  );
  const minimumAmplitude =
    options?.minimumAmplitude ?? MIN_SPECTRAL_BIN_AMPLITUDE;
  const minBinGapHz = options?.minBinGapHz ?? MIN_SPECTRAL_BIN_GAP_HZ;
  const regionRanges = Array.isArray(options?.regionRanges)
    ? options.regionRanges
    : null;
  const perRegionCount = Math.max(1, options?.perRegionCount ?? 1);
  const minBinGap = Math.max(
    1,
    Math.round(frequencyToBin(minBinGapHz, fftMagnitudes.length, sampleRate)),
  );
  const candidates = [];

  for (let i = 1; i < fftMagnitudes.length - 1; i++) {
    const amplitude = fftMagnitudes[i];
    if (
      amplitude >= minimumAmplitude &&
      amplitude >= fftMagnitudes[i - 1] &&
      amplitude > fftMagnitudes[i + 1]
    ) {
      const prev = fftMagnitudes[i - 1];
      const next = fftMagnitudes[i + 1];
      const denom = prev - 2 * amplitude + next;
      const delta = Math.abs(denom) > 1e-10 ? (0.5 * (prev - next)) / denom : 0;
      const trueBin = i + delta;
      const frequency = binIndexToFrequencyHz(
        trueBin,
        fftMagnitudes.length,
        sampleRate,
      );
      const interpolatedAmplitude = amplitude - 0.25 * delta * (prev - next);
      if (frequency >= minFrequency && frequency <= maxFrequency) {
        candidates.push({
          bin: i,
          amplitude: interpolatedAmplitude,
          frequency,
        });
      }
    }
  }

  candidates.sort((a, b) => b.amplitude - a.amplitude);

  if (!regionRanges?.length) {
    const selected = [];
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      const tooClose = selected.some(
        (existing) => Math.abs(existing.bin - candidate.bin) < minBinGap,
      );
      if (!tooClose) selected.push(candidate);
    }

    return selected;
  }

  const regionalCandidates = regionRanges.map(([start, end]) =>
    candidates.filter(
      (candidate) =>
        candidate.frequency >= Math.max(minFrequency, start ?? minFrequency) &&
        candidate.frequency <= Math.min(maxFrequency, end ?? maxFrequency),
    ),
  );

  const selected = [];
  let exhaustedRegions = 0;
  for (
    let round = 0;
    selected.length < count &&
    exhaustedRegions < regionalCandidates.length &&
    round < perRegionCount;
    round += 1
  ) {
    exhaustedRegions = 0;
    for (const region of regionalCandidates) {
      if (selected.length >= count) break;
      const candidate = region[round];
      if (!candidate) {
        exhaustedRegions += 1;
        continue;
      }

      const tooClose = selected.some(
        (existing) => Math.abs(existing.bin - candidate.bin) < minBinGap,
      );
      if (!tooClose) selected.push(candidate);
    }
  }

  if (selected.length < count) {
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      if (selected.includes(candidate)) continue;
      const tooClose = selected.some(
        (existing) => Math.abs(existing.bin - candidate.bin) < minBinGap,
      );
      if (!tooClose) selected.push(candidate);
    }
  }

  selected.sort((a, b) => b.amplitude - a.amplitude);
  return selected.slice(0, count);
}
