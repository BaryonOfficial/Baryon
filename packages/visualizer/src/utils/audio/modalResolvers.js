import {
  solveNormalModesForPitch,
  sampleFFTAmplitudeForFrequency,
} from '../normalModes.js';
import { MAX_STACK_SLOTS, writeSlot } from './modalStack.js';

export const HARMONIC_ORDERS = [1, 2, 3, 4];
const HARMONIC_ATTENUATION = [1.0, 0.72, 0.52, 0.38];
const HARMONIC_SUPPORT_FLOOR = 0.1;
const HARMONIC_SUPPORT_RATIO = 0.2;
const MIN_SPECTRAL_BIN_AMPLITUDE = 0.12;
const MIN_SPECTRAL_BIN_GAP_HZ = 45;
const MAX_SPECTRAL_FREQUENCY = 1800;

export function buildModalSlotsFromFundamental({
  frequency,
  confidence,
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
}) {
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const primarySupport = sampleFFTAmplitudeForFrequency(
    frequency,
    fftMagnitudes,
    sampleRate,
    fftSize
  );
  const supportThreshold = Math.max(HARMONIC_SUPPORT_FLOOR, primarySupport * HARMONIC_SUPPORT_RATIO);

  let slotIndex = 0;
  for (let i = 0; i < HARMONIC_ORDERS.length && slotIndex < Math.min(capacity, MAX_STACK_SLOTS); i++) {
    const harmonicFrequency = frequency * HARMONIC_ORDERS[i];
    const support = sampleFFTAmplitudeForFrequency(
      harmonicFrequency,
      fftMagnitudes,
      sampleRate,
      fftSize
    );
    harmonicSupport[i] = support;

    if (i > 0 && support < supportThreshold) {
      continue;
    }

    const mode = solveNormalModesForPitch(harmonicFrequency, radius);
    if (!mode) continue;

    const key = `${mode.u}:${mode.v}:${mode.w}`;
    if (seenModes.has(key)) continue;
    seenModes.add(key);

    const attenuation = HARMONIC_ATTENUATION[i] ?? HARMONIC_ATTENUATION[HARMONIC_ATTENUATION.length - 1];
    const amplitude = support * attenuation * (i === 0 ? confidence : Math.max(0.5, confidence));
    writeSlot(slots, slotIndex, mode, amplitude);
    writeSlot(referenceSlots, slotIndex, mode, support);
    slotIndex++;
  }

  return {
    slots,
    referenceSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
  };
}

export function buildModalSlotsFromSpectralPeaks({
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
}) {
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const peaks = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    Math.min(capacity, MAX_STACK_SLOTS) * 2
  );

  let slotIndex = 0;
  for (const peak of peaks) {
    if (slotIndex >= Math.min(capacity, MAX_STACK_SLOTS)) break;
    const mode = solveNormalModesForPitch(peak.frequency, radius);
    if (!mode) continue;

    const key = `${mode.u}:${mode.v}:${mode.w}`;
    if (seenModes.has(key)) continue;
    seenModes.add(key);

    const attenuation = HARMONIC_ATTENUATION[Math.min(slotIndex, HARMONIC_ATTENUATION.length - 1)];
    writeSlot(slots, slotIndex, mode, peak.amplitude * attenuation);
    writeSlot(referenceSlots, slotIndex, mode, peak.amplitude);
    harmonicSupport[slotIndex] = peak.amplitude;
    slotIndex++;
  }

  return {
    slots,
    referenceSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
    peaks,
  };
}

function findSpectralPeakFrequencies(fftMagnitudes, sampleRate, fftSize, count) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize || count <= 0) {
    return [];
  }

  const nyquist = sampleRate * 0.5;
  const minBinGap = Math.max(
    1,
    Math.round((MIN_SPECTRAL_BIN_GAP_HZ / nyquist) * (fftSize * 0.5 - 1))
  );
  const candidates = [];

  for (let i = 1; i < fftMagnitudes.length - 1; i++) {
    const amplitude = fftMagnitudes[i];
    if (
      amplitude >= MIN_SPECTRAL_BIN_AMPLITUDE &&
      amplitude >= fftMagnitudes[i - 1] &&
      amplitude > fftMagnitudes[i + 1]
    ) {
      const frequency = (i / (fftSize * 0.5 - 1)) * nyquist;
      if (frequency > 0 && frequency <= MAX_SPECTRAL_FREQUENCY) {
        candidates.push({ bin: i, amplitude, frequency });
      }
    }
  }

  candidates.sort((a, b) => b.amplitude - a.amplitude);

  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    const tooClose = selected.some((existing) => Math.abs(existing.bin - candidate.bin) < minBinGap);
    if (!tooClose) selected.push(candidate);
  }

  return selected;
}
