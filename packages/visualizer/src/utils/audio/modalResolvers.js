import {
  getLegacyAnalysisFloorHz,
  getLegacyAnalysisRadius,
  sampleFFTAmplitudeForFrequency,
} from "../cavityModes.js";
import { getModalGeometryBackend } from "../../core/modalGeometryBackend.js";
import {
  BACKBONE_STACK_SLOTS,
  DETAIL_STACK_SLOTS,
  MAX_STACK_SLOTS,
  createModalTargetBuild,
  writeColorSlot,
  writeSlot,
} from "./modalStack.js";
import {
  collapseFrequencyToNearestFamily,
  createSpectralLightColor,
} from "./spectralLight.js";
import { SPECTRAL_MODAL_POLICY } from "./policy.js";

export const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;
const HARMONIC_ATTENUATION = SPECTRAL_MODAL_POLICY.harmonicAttenuation;
const HARMONIC_FAMILY_COUNTS = [3, 2, 2, 1, 1, 1];
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

function getModeMatchQuality(magnitudeError) {
  return Math.max(0.35, 1 - (magnitudeError ?? 0) * 0.35);
}

function buildColorComponent({
  frequency,
  strength,
  harmonicConfidence,
  families,
}) {
  const familyFrequency = collapseFrequencyToNearestFamily(
    frequency,
    strength,
    families,
  );
  const color = createSpectralLightColor({
    frequency: familyFrequency,
    strength,
    harmonicConfidence,
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
    phase: color.phase,
    wavelengthNm: color.wavelengthNm,
    rgb: color.rgb,
  };
}

function limitColorComponents(components) {
  return components
    .filter((component) => component.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, MAX_COLOR_COMPONENTS);
}

function resetModalTargetBuild(target, peaks = []) {
  target.slots.fill(0);
  target.referenceSlots.fill(0);
  target.colorSlots.fill(0);
  target.harmonicSupport.fill(0);
  target.uniqueModeCount = 0;
  target.peaks = peaks;
  target.components = [];
  target.subfloorBridgeMeta = null;
  return target;
}

function ensureMergeScratch(target) {
  if (!(target._mergeScratch instanceof Map)) {
    target._mergeScratch = new Map();
  }
  return target._mergeScratch;
}

export function writeModalSlotsFromFundamental(
  target,
  {
    frequency,
    confidence,
    fftMagnitudes,
    sampleRate,
    fftSize,
    radius,
    capacity,
    cavityGeometry = "rectangular",
    spectralCentroid = 0,
    includeSpectralLight = true,
  },
) {
  // Kept in the resolver input contract; Spectral Light color is folded per mode.
  void spectralCentroid;
  resetModalTargetBuild(target);
  const slotLimit = Math.min(
    capacity,
    MAX_STACK_SLOTS,
    Math.floor((target.slots?.length ?? 0) / 4),
  );
  const slots = target.slots;
  const referenceSlots = target.referenceSlots;
  const colorSlots = target.colorSlots;
  const harmonicSupport = target.harmonicSupport;
  const seenModes = new Set();
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const colorFamilies = includeSpectralLight ? [] : null;
  const components = includeSpectralLight ? [] : null;
  let primarySupport = sampleFFTAmplitudeForFrequency(
    frequency,
    fftMagnitudes,
    sampleRate,
    fftSize,
  );
  if (primarySupport < HARMONIC_SUPPORT_FLOOR) {
    for (let i = 1; i < HARMONIC_ORDERS.length; i++) {
      const harmonicFrequency = frequency * HARMONIC_ORDERS[i];
      const harmonicSupport = sampleFFTAmplitudeForFrequency(
        harmonicFrequency,
        fftMagnitudes,
        sampleRate,
        fftSize,
      );
      const attenuation =
        HARMONIC_ATTENUATION[i] ??
        HARMONIC_ATTENUATION[HARMONIC_ATTENUATION.length - 1] ??
        1;
      primarySupport = Math.max(
        primarySupport,
        attenuation > 0 ? harmonicSupport / attenuation : harmonicSupport,
      );
    }
  }
  const supportThreshold = Math.max(
    HARMONIC_SUPPORT_FLOOR,
    primarySupport * HARMONIC_SUPPORT_RATIO,
  );

  let slotIndex = 0;
  for (let i = 0; i < HARMONIC_ORDERS.length && slotIndex < slotLimit; i++) {
    const harmonicFrequency = frequency * HARMONIC_ORDERS[i];
    const sampledSupport = sampleFFTAmplitudeForFrequency(
      harmonicFrequency,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    const support =
      i === 0
        ? Math.max(sampledSupport, primarySupport * 0.72)
        : sampledSupport;
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
    const family = geometryBackend.solveTermsForPitch({
      pitch: harmonicFrequency,
      radius,
      count: familyLimit * 3,
    });
    const colorComponent = includeSpectralLight
      ? buildColorComponent({
          frequency: harmonicFrequency,
          strength: clamp01(support * attenuation),
          harmonicConfidence: clamp01(
            i === 0 ? confidence : Math.max(0.5, confidence),
          ),
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
        (i === 0 ? confidence : Math.max(0.5, confidence)) *
        getModeMatchQuality(mode.magnitudeError);
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

  target.uniqueModeCount = slotIndex;
  target.components = includeSpectralLight
    ? limitColorComponents(components)
    : [];
  return target;
}

export function buildModalSlotsFromFundamental(options) {
  return writeModalSlotsFromFundamental(
    createModalTargetBuild(options.capacity),
    options,
  );
}

export function writeModalSlotsFromSpectralPeaks(
  target,
  {
    fftMagnitudes,
    sampleRate,
    fftSize,
    radius,
    capacity,
    cavityGeometry = "rectangular",
    peakCount = null,
    slotLimit = null,
    peakFamilyCount = SPECTRAL_PEAK_FAMILY_COUNT,
    spectralCentroid = 0,
    includeSpectralLight = true,
    peaks = null,
    peakOptions = undefined,
  },
) {
  // Kept in the resolver input contract; Spectral Light color is folded per mode.
  void spectralCentroid;
  const maxSlots =
    slotLimit ??
    Math.min(
      capacity,
      DETAIL_STACK_SLOTS,
      MAX_STACK_SLOTS,
      Math.floor((target.slots?.length ?? 0) / 4),
    );
  const resolvedPeaks =
    peaks ??
    findSpectralPeakFrequencies(
      fftMagnitudes,
      sampleRate,
      fftSize,
      peakCount ?? maxSlots * 2,
      peakOptions,
    );
  resetModalTargetBuild(target, resolvedPeaks);
  const slots = target.slots;
  const referenceSlots = target.referenceSlots;
  const colorSlots = target.colorSlots;
  const harmonicSupport = target.harmonicSupport;
  const seenModes = new Set();
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const colorFamilies = includeSpectralLight ? [] : null;
  const components = includeSpectralLight ? [] : null;
  const legacyRadius = getLegacyAnalysisRadius(radius);

  let slotIndex = 0;
  for (const peak of resolvedPeaks) {
    if (slotIndex >= maxSlots) break;
    const familyLimit = Math.min(maxSlots - slotIndex, peakFamilyCount);
    const family = geometryBackend.solveTermsForPitch({
      pitch: peak.frequency,
      radius: legacyRadius,
      count: familyLimit * 3,
    });
    const colorComponent = includeSpectralLight
      ? buildColorComponent({
          frequency: peak.frequency,
          strength: clamp01(peak.amplitude),
          harmonicConfidence: clamp01(peak.amplitude * 0.8 + 0.2),
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
      writeSlot(
        slots,
        slotIndex,
        mode,
        peak.amplitude * attenuation * getModeMatchQuality(mode.magnitudeError),
      );
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

  target.uniqueModeCount = slotIndex;
  target.components = includeSpectralLight
    ? limitColorComponents(components)
    : [];
  return target;
}

export function buildModalSlotsFromSpectralPeaks(options) {
  return writeModalSlotsFromSpectralPeaks(
    createModalTargetBuild(options.capacity),
    options,
  );
}

function mergeDriverBuildIntoScratch(merged, build) {
  for (let offset = 0; offset < build.slots.length; offset += 4) {
    const amplitude = build.slots[offset + 3] ?? 0;
    if (amplitude <= 0) continue;
    const u = build.slots[offset];
    const v = build.slots[offset + 1];
    const w = build.slots[offset + 2];
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
    existing.referenceAmplitude += build.referenceSlots[offset + 3] ?? 0;
    existing.colorR += (build.colorSlots?.[offset] ?? 0) * amplitude;
    existing.colorG += (build.colorSlots?.[offset + 1] ?? 0) * amplitude;
    existing.colorB += (build.colorSlots?.[offset + 2] ?? 0) * amplitude;
    existing.colorWeight += build.colorSlots?.[offset + 3] ?? 0;
    merged.set(key, existing);
  }
}

function writeMergedDriverScratch(target, capacity, merged) {
  const survivors = Array.from(merged.values())
    .sort((left, right) => right.amplitude - left.amplitude)
    .slice(0, capacity);

  for (let index = 0; index < survivors.length; index += 1) {
    const entry = survivors[index];
    writeSlot(target.slots, index, entry, entry.amplitude);
    writeSlot(target.referenceSlots, index, entry, entry.referenceAmplitude);
    const amplitude = Math.max(entry.amplitude, 1e-4);
    writeColorSlot(
      target.colorSlots,
      index,
      {
        r: entry.colorR / amplitude,
        g: entry.colorG / amplitude,
        b: entry.colorB / amplitude,
      },
      clamp01(1 - Math.exp(-entry.colorWeight)),
    );
  }

  target.uniqueModeCount = survivors.length;
}

function resolveSubfloorPseudoDrivers({
  peak,
  fftMagnitudes,
  sampleRate,
  fftSize,
  floorHz,
}) {
  const primarySupport = sampleFFTAmplitudeForFrequency(
    peak.frequency,
    fftMagnitudes,
    sampleRate,
    fftSize,
  );
  const supportThreshold = Math.max(
    HARMONIC_SUPPORT_FLOOR,
    primarySupport * HARMONIC_SUPPORT_RATIO,
  );
  const pseudoDrivers = [
    {
      frequency: peak.frequency,
      attenuation: 1,
      bridge: false,
    },
  ];
  let bridgeCount = 0;

  for (
    let harmonicIndex = 1;
    harmonicIndex < HARMONIC_ORDERS.length && bridgeCount < 3;
    harmonicIndex += 1
  ) {
    const harmonicHz = peak.frequency * HARMONIC_ORDERS[harmonicIndex];
    if (harmonicHz < floorHz) {
      continue;
    }

    const support = sampleFFTAmplitudeForFrequency(
      harmonicHz,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    if (support < supportThreshold) {
      continue;
    }

    pseudoDrivers.push({
      frequency: harmonicHz,
      attenuation:
        HARMONIC_ATTENUATION[harmonicIndex] ??
        HARMONIC_ATTENUATION[HARMONIC_ATTENUATION.length - 1] ??
        1,
      bridge: true,
    });
    bridgeCount += 1;
  }

  return {
    pseudoDrivers,
    bridgeCount,
  };
}

export function writeModalSlotsFromPeakDrivers(
  target,
  {
    fftMagnitudes,
    sampleRate,
    fftSize,
    radius,
    capacity,
    cavityGeometry = "rectangular",
    peakCount = 3,
    slotLimit = BACKBONE_STACK_SLOTS,
    minimumConfidence = 0.45,
    spectralCentroid = 0,
    includeSpectralLight = true,
    peaks = null,
    peakOptions = undefined,
    scratchTarget = null,
  },
) {
  const resolvedPeaks =
    peaks ??
    findSpectralPeakFrequencies(
      fftMagnitudes,
      sampleRate,
      fftSize,
      peakCount,
      peakOptions,
    );
  resetModalTargetBuild(target, resolvedPeaks);
  if (!resolvedPeaks.length) {
    return target;
  }

  const resolvedCapacity = Math.min(capacity, slotLimit);
  const resolvedScratchTarget =
    scratchTarget ?? createModalTargetBuild(resolvedCapacity);
  const merged = ensureMergeScratch(target);
  const components = [];
  const legacyRadius = getLegacyAnalysisRadius(radius);
  const legacyFloorHz = getLegacyAnalysisFloorHz(radius);
  let dominantPeakBridgeCount = 0;
  let meaningfulAboveFloorPeakCount = 0;
  merged.clear();

  for (let index = 0; index < resolvedPeaks.length; index += 1) {
    const peak = resolvedPeaks[index];
    const attenuation =
      BACKBONE_DRIVER_ATTENUATION[index] ??
      BACKBONE_DRIVER_ATTENUATION[BACKBONE_DRIVER_ATTENUATION.length - 1] ??
      1;
    const confidence =
      Math.max(minimumConfidence, peak.amplitude) * attenuation;
    const peakIsAboveFloor = peak.frequency >= legacyFloorHz;
    const { pseudoDrivers, bridgeCount } = peakIsAboveFloor
      ? {
          pseudoDrivers: [
            {
              frequency: peak.frequency,
              attenuation: 1,
              bridge: false,
            },
          ],
          bridgeCount: 0,
        }
      : resolveSubfloorPseudoDrivers({
          peak,
          fftMagnitudes,
          sampleRate,
          fftSize,
          floorHz: legacyFloorHz,
        });
    if (index === 0) {
      dominantPeakBridgeCount = bridgeCount;
    }
    if (peakIsAboveFloor || bridgeCount > 0) {
      meaningfulAboveFloorPeakCount += 1;
    }

    for (const pseudoDriver of pseudoDrivers) {
      const build = writeModalSlotsFromFundamental(resolvedScratchTarget, {
        frequency: pseudoDriver.frequency,
        confidence,
        fftMagnitudes,
        sampleRate,
        fftSize,
        radius: legacyRadius,
        capacity: resolvedCapacity,
        cavityGeometry,
        spectralCentroid,
        includeSpectralLight,
      });

      if (Array.isArray(build.components)) {
        components.push(...build.components);
      }
      for (
        let harmonicIndex = 0;
        harmonicIndex < target.harmonicSupport.length;
        harmonicIndex += 1
      ) {
        target.harmonicSupport[harmonicIndex] = Math.max(
          target.harmonicSupport[harmonicIndex],
          build.harmonicSupport?.[harmonicIndex] ?? 0,
        );
      }
      for (let offset = 0; offset < build.slots.length; offset += 4) {
        const combinedAttenuation = attenuation * pseudoDriver.attenuation;
        build.slots[offset + 3] *= combinedAttenuation;
        build.referenceSlots[offset + 3] *= combinedAttenuation;
        build.colorSlots[offset + 3] = clamp01(
          build.colorSlots[offset + 3] * combinedAttenuation,
        );
      }
      mergeDriverBuildIntoScratch(merged, build);
    }
  }

  writeMergedDriverScratch(target, resolvedCapacity, merged);
  target.components = limitColorComponents(components);
  // The base pseudo-driver may internally climb harmonics, but residual gating
  // only relies on explicit bridge drivers and cross-peak above-floor presence.
  target.subfloorBridgeMeta = {
    dominantPeakFrequency: resolvedPeaks[0]?.frequency ?? 0,
    dominantPeakAmplitude: resolvedPeaks[0]?.amplitude ?? 0,
    dominantPeakBridgeCount,
    meaningfulAboveFloorPeakCount,
    legacyAnalysisFloorHz: legacyFloorHz,
  };
  return target;
}

export function buildModalSlotsFromPeakDrivers(options) {
  return writeModalSlotsFromPeakDrivers(
    createModalTargetBuild(options.capacity),
    options,
  );
}

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
    Math.round((minBinGapHz / nyquist) * (fftSize * 0.5 - 1)),
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
      const frequency = (trueBin / (fftSize * 0.5 - 1)) * nyquist;
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
    selected.length < count && exhaustedRegions < regionalCandidates.length;
    round++
  ) {
    exhaustedRegions = 0;
    for (const region of regionalCandidates) {
      const candidate = region[round];
      if (!candidate || round >= perRegionCount) {
        exhaustedRegions += 1;
        continue;
      }
      const tooClose = selected.some(
        (existing) => Math.abs(existing.bin - candidate.bin) < minBinGap,
      );
      if (!tooClose) {
        selected.push(candidate);
        if (selected.length >= count) {
          break;
        }
      }
    }
  }

  return selected;
}
