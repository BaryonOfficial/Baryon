import {
  solveModeFamilyForPitch,
  sampleFFTAmplitudeForFrequency,
} from "../normalModes.js";
import { MAX_STACK_SLOTS, writeSlot } from "./modalStack.js";
import { SPECTRAL_MODAL_POLICY } from "./policy.js";

export const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;
const HARMONIC_ATTENUATION = SPECTRAL_MODAL_POLICY.harmonicAttenuation;
const HARMONIC_FAMILY_COUNTS = [3, 2, 2, 1];
const FAMILY_ATTENUATION = [1.0, 0.84, 0.7, 0.58];
const HARMONIC_SUPPORT_FLOOR = SPECTRAL_MODAL_POLICY.harmonicSupportFloor;
const HARMONIC_SUPPORT_RATIO = SPECTRAL_MODAL_POLICY.harmonicSupportRatio;
const MIN_SPECTRAL_BIN_AMPLITUDE =
  SPECTRAL_MODAL_POLICY.minSpectralBinAmplitude;
const MIN_SPECTRAL_BIN_GAP_HZ = SPECTRAL_MODAL_POLICY.minSpectralBinGapHz;
const MAX_SPECTRAL_FREQUENCY = SPECTRAL_MODAL_POLICY.maxSpectralFrequency;
const SPECTRAL_PEAK_FAMILY_COUNT = 2;

function modeKey(mode) {
  return `${mode.u}:${mode.v}:${mode.w}`;
}

function getFamilyAttenuation(index) {
  return (
    FAMILY_ATTENUATION[index] ??
    FAMILY_ATTENUATION[FAMILY_ATTENUATION.length - 1] ??
    1
  );
}

export function buildModalSlotsFromFundamental({
  frequency,
  confidence,
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
}) {
  const slotLimit = Math.min(capacity, MAX_STACK_SLOTS);
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const primarySupport = sampleFFTAmplitudeForFrequency(
    frequency,
    fftMagnitudes,
    sampleRate,
    fftSize,
  );
  const supportThreshold = Math.max(
    HARMONIC_SUPPORT_FLOOR,
    primarySupport * HARMONIC_SUPPORT_RATIO,
  );

  let slotIndex = 0;
  for (let i = 0; i < HARMONIC_ORDERS.length && slotIndex < slotLimit; i++) {
    const harmonicFrequency = frequency * HARMONIC_ORDERS[i];
    const support = sampleFFTAmplitudeForFrequency(
      harmonicFrequency,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    harmonicSupport[i] = support;

    if (i > 0 && support < supportThreshold) {
      continue;
    }

    const attenuation =
      HARMONIC_ATTENUATION[i] ??
      HARMONIC_ATTENUATION[HARMONIC_ATTENUATION.length - 1];
    const familyLimit = Math.min(
      slotLimit - slotIndex,
      HARMONIC_FAMILY_COUNTS[i] ?? 1,
    );
    const family = solveModeFamilyForPitch(
      harmonicFrequency,
      radius,
      familyLimit * 3,
    );

    let familyIndex = 0;
    for (const mode of family) {
      if (slotIndex >= slotLimit || familyIndex >= familyLimit) break;
      const key = modeKey(mode);
      if (seenModes.has(key)) continue;
      seenModes.add(key);

      const familyAttenuation = getFamilyAttenuation(familyIndex);
      const amplitude =
        support *
        attenuation *
        familyAttenuation *
        (i === 0 ? confidence : Math.max(0.5, confidence));
      writeSlot(slots, slotIndex, mode, amplitude);
      writeSlot(referenceSlots, slotIndex, mode, support * familyAttenuation);
      slotIndex++;
      familyIndex++;
    }
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
  const slotLimit = Math.min(capacity, MAX_STACK_SLOTS);
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const peaks = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    slotLimit * 2,
  );

  let slotIndex = 0;
  for (const peak of peaks) {
    if (slotIndex >= slotLimit) break;
    const familyLimit = Math.min(
      slotLimit - slotIndex,
      SPECTRAL_PEAK_FAMILY_COUNT,
    );
    const family = solveModeFamilyForPitch(
      peak.frequency,
      radius,
      familyLimit * 3,
    );

    let familyIndex = 0;
    for (const mode of family) {
      if (slotIndex >= slotLimit || familyIndex >= familyLimit) break;
      const key = modeKey(mode);
      if (seenModes.has(key)) continue;
      seenModes.add(key);

      const attenuation =
        getFamilyAttenuation(familyIndex) *
        (HARMONIC_ATTENUATION[
          Math.min(slotIndex, HARMONIC_ATTENUATION.length - 1)
        ] ?? 1);
      writeSlot(slots, slotIndex, mode, peak.amplitude * attenuation);
      writeSlot(
        referenceSlots,
        slotIndex,
        mode,
        peak.amplitude * getFamilyAttenuation(familyIndex),
      );
      if (slotIndex < harmonicSupport.length) {
        harmonicSupport[slotIndex] = peak.amplitude;
      }
      slotIndex++;
      familyIndex++;
    }
  }

  return {
    slots,
    referenceSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
    peaks,
  };
}

function findSpectralPeakFrequencies(
  fftMagnitudes,
  sampleRate,
  fftSize,
  count,
) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize || count <= 0) {
    return [];
  }

  const nyquist = sampleRate * 0.5;
  const minBinGap = Math.max(
    1,
    Math.round((MIN_SPECTRAL_BIN_GAP_HZ / nyquist) * (fftSize * 0.5 - 1)),
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
    const tooClose = selected.some(
      (existing) => Math.abs(existing.bin - candidate.bin) < minBinGap,
    );
    if (!tooClose) selected.push(candidate);
  }

  return selected;
}
