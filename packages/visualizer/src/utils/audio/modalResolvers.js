import {
  solveModeFamilyForPitch,
  sampleFFTAmplitudeForFrequency,
} from "../normalModes.js";
import {
  BACKBONE_STACK_SLOTS,
  DETAIL_STACK_SLOTS,
  MAX_STACK_SLOTS,
  writeColorSlot,
  writeSlot,
} from "./modalStack.js";
import {
  collapseFrequencyToNearestFamily,
  createChromesthesiaColor,
} from "./chromesthesia.js";
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
const BACKBONE_DRIVER_ATTENUATION = [1.0, 0.82, 0.66];
const MAX_COLOR_COMPONENTS = 6;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

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

function buildColorComponent({
  frequency,
  strength,
  stability,
  spectralCentroid = 0,
  families,
}) {
  const familyFrequency = collapseFrequencyToNearestFamily(
    frequency,
    strength,
    families,
  );
  const color = createChromesthesiaColor({
    frequency: familyFrequency,
    strength,
    stability,
    spectralCentroid,
  });

  if (color.weight > 0) {
    families.push({
      frequency: familyFrequency,
      weight: color.weight,
    });
  }

  return {
    frequency,
    familyFrequency,
    weight: color.weight,
    pitchClass: color.pitchClass,
    octave: color.octave,
    noteName: color.noteName,
    rgb: color.rgb,
  };
}

function limitColorComponents(components) {
  return components
    .filter((component) => component.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, MAX_COLOR_COMPONENTS);
}

export function buildModalSlotsFromFundamental({
  frequency,
  confidence,
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
  spectralCentroid = 0,
  includeChromesthesia = true,
}) {
  const slotLimit = Math.min(capacity, MAX_STACK_SLOTS);
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const colorSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const colorFamilies = includeChromesthesia ? [] : null;
  const components = includeChromesthesia ? [] : null;
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
    const colorComponent = includeChromesthesia
      ? buildColorComponent({
          frequency: harmonicFrequency,
          strength: clamp01(support * attenuation),
          stability: clamp01(i === 0 ? confidence : Math.max(0.5, confidence)),
          spectralCentroid,
          families: colorFamilies,
        })
      : null;
    if (colorComponent) {
      components.push(colorComponent);
    }

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
      if (colorComponent) {
        writeColorSlot(
          colorSlots,
          slotIndex,
          colorComponent.rgb,
          clamp01(colorComponent.weight * familyAttenuation),
        );
      }
      slotIndex++;
      familyIndex++;
    }
  }

  return {
    slots,
    referenceSlots,
    colorSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
    components: includeChromesthesia ? limitColorComponents(components) : [],
  };
}

export function buildModalSlotsFromSpectralPeaks({
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
  peakCount = null,
  slotLimit = null,
  peakFamilyCount = SPECTRAL_PEAK_FAMILY_COUNT,
  spectralCentroid = 0,
  includeChromesthesia = true,
}) {
  const maxSlots =
    slotLimit ?? Math.min(capacity, DETAIL_STACK_SLOTS, MAX_STACK_SLOTS);
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const colorSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const colorFamilies = includeChromesthesia ? [] : null;
  const components = includeChromesthesia ? [] : null;
  const peaks = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    peakCount ?? maxSlots * 2,
  );

  let slotIndex = 0;
  for (const peak of peaks) {
    if (slotIndex >= maxSlots) break;
    const familyLimit = Math.min(maxSlots - slotIndex, peakFamilyCount);
    const family = solveModeFamilyForPitch(
      peak.frequency,
      radius,
      familyLimit * 3,
    );
    const colorComponent = includeChromesthesia
      ? buildColorComponent({
          frequency: peak.frequency,
          strength: clamp01(peak.amplitude),
          stability: clamp01(peak.amplitude * 0.8 + 0.2),
          spectralCentroid,
          families: colorFamilies,
        })
      : null;
    if (colorComponent) {
      components.push(colorComponent);
    }

    let familyIndex = 0;
    for (const mode of family) {
      if (slotIndex >= maxSlots || familyIndex >= familyLimit) break;
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
      if (colorComponent) {
        writeColorSlot(
          colorSlots,
          slotIndex,
          colorComponent.rgb,
          clamp01(colorComponent.weight * getFamilyAttenuation(familyIndex)),
        );
      }
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
    colorSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
    peaks,
    components: includeChromesthesia ? limitColorComponents(components) : [],
  };
}

function mergeModeBuilds(builds, capacity) {
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const colorSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const merged = new Map();
  const components = [];

  for (const build of builds) {
    if (!build) continue;
    if (Array.isArray(build.components)) {
      components.push(...build.components);
    }
    harmonicSupport.forEach((_, index) => {
      harmonicSupport[index] = Math.max(
        harmonicSupport[index],
        build.harmonicSupport?.[index] ?? 0,
      );
    });
    for (let i = 0; i < build.slots.length; i += 4) {
      const amplitude = build.slots[i + 3];
      if (amplitude <= 0) continue;
      const u = build.slots[i];
      const v = build.slots[i + 1];
      const w = build.slots[i + 2];
      const key = `${u}:${v}:${w}`;
      const existing = merged.get(key) ?? {
        u,
        v,
        w,
        amplitude: 0,
        referenceAmplitude: 0,
        colorR: 0,
        colorG: 0,
        colorB: 0,
        colorWeight: 0,
      };
      existing.amplitude += amplitude;
      existing.referenceAmplitude += build.referenceSlots[i + 3] ?? 0;
      existing.colorR += (build.colorSlots?.[i] ?? 0) * amplitude;
      existing.colorG += (build.colorSlots?.[i + 1] ?? 0) * amplitude;
      existing.colorB += (build.colorSlots?.[i + 2] ?? 0) * amplitude;
      existing.colorWeight += build.colorSlots?.[i + 3] ?? 0;
      merged.set(key, existing);
    }
  }

  const survivors = Array.from(merged.values())
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, capacity);

  for (let i = 0; i < survivors.length; i++) {
    const entry = survivors[i];
    writeSlot(slots, i, entry, entry.amplitude);
    writeSlot(referenceSlots, i, entry, entry.referenceAmplitude);
    const amplitude = Math.max(entry.amplitude, 1e-4);
    writeColorSlot(
      colorSlots,
      i,
      {
        r: entry.colorR / amplitude,
        g: entry.colorG / amplitude,
        b: entry.colorB / amplitude,
      },
      clamp01(1 - Math.exp(-entry.colorWeight)),
    );
  }

  return {
    slots,
    referenceSlots,
    colorSlots,
    harmonicSupport,
    uniqueModeCount: survivors.length,
    components: limitColorComponents(components),
  };
}

export function buildModalSlotsFromPeakDrivers({
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
  peakCount = 3,
  slotLimit = BACKBONE_STACK_SLOTS,
  minimumConfidence = 0.45,
  spectralCentroid = 0,
  includeChromesthesia = true,
}) {
  const peaks = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    peakCount,
  );
  if (!peaks.length) {
    return {
      slots: new Float32Array(capacity * 4),
      referenceSlots: new Float32Array(capacity * 4),
      colorSlots: new Float32Array(capacity * 4),
      harmonicSupport: new Float32Array(HARMONIC_ORDERS.length),
      uniqueModeCount: 0,
      peaks,
      components: [],
    };
  }

  const builds = peaks.map((peak, index) => {
    const attenuation =
      BACKBONE_DRIVER_ATTENUATION[index] ??
      BACKBONE_DRIVER_ATTENUATION[BACKBONE_DRIVER_ATTENUATION.length - 1] ??
      1;
    const confidence =
      Math.max(minimumConfidence, peak.amplitude) * attenuation;
    const build = buildModalSlotsFromFundamental({
      frequency: peak.frequency,
      confidence,
      fftMagnitudes,
      sampleRate,
      fftSize,
      radius,
      capacity: Math.min(capacity, slotLimit),
      spectralCentroid,
      includeChromesthesia,
    });

    for (let i = 0; i < build.slots.length; i += 4) {
      build.slots[i + 3] *= attenuation;
      build.referenceSlots[i + 3] *= attenuation;
      build.colorSlots[i + 3] = clamp01(build.colorSlots[i + 3] * attenuation);
    }

    return build;
  });

  return {
    ...mergeModeBuilds(builds, Math.min(capacity, slotLimit)),
    peaks,
  };
}

export function findSpectralPeakFrequencies(
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
