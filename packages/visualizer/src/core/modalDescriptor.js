import {
  MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  MODAL_BASIS_CACHE_RESOLUTION,
  getModalBasisCacheMaxRepresentableModeIndex,
} from "./modalBudgets.js";

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function deriveStructuralAdmissionDiagnostics(
  slotAssignments,
  {
    basisAtlasPageCapacity = MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    basisCacheResolution = MODAL_BASIS_CACHE_RESOLUTION,
  } = {},
) {
  const normalizedBasisCapacity = Math.max(
    0,
    Math.floor(basisAtlasPageCapacity),
  );
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(basisCacheResolution);
  let basisAtlasCapacityRejectedCount = 0;
  let basisAtlasCapacityRejectedEnergy = 0;
  let spatialBandwidthRejectedCount = 0;
  let spatialBandwidthRejectedEnergy = 0;

  for (let slotIndex = 0; slotIndex < slotAssignments.length; slotIndex += 1) {
    const entry = slotAssignments[slotIndex];
    if (!entry) {
      continue;
    }

    const modalEnergy = Math.max(0, entry.coefficient) ** 2;
    const maxModeIndex = Math.max(
      Math.abs(entry.u),
      Math.abs(entry.v),
      Math.abs(entry.w),
    );

    if (maxModeIndex > maxRepresentableModeIndex) {
      spatialBandwidthRejectedCount += 1;
      spatialBandwidthRejectedEnergy += modalEnergy;
      continue;
    }

    if (slotIndex >= normalizedBasisCapacity) {
      basisAtlasCapacityRejectedCount += 1;
      basisAtlasCapacityRejectedEnergy += modalEnergy;
    }
  }

  return {
    basisAtlasPageCapacity: normalizedBasisCapacity,
    maxRepresentableModeIndex,
    basisAtlasCapacityRejectedCount,
    basisAtlasCapacityRejectedEnergy,
    spatialBandwidthRejectedCount,
    spatialBandwidthRejectedEnergy,
    structuralCoverageSatisfied:
      basisAtlasCapacityRejectedCount === 0 &&
      spatialBandwidthRejectedCount === 0,
  };
}

function readFiniteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function resolveCapacity(value, slots) {
  if (Number.isFinite(value) && value >= 0) {
    return Math.max(0, Math.floor(value));
  }
  return Math.max(0, Math.floor((slots?.length ?? 0) / 4));
}

function countActiveModalSlots(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let activeCount = 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    if ((slots?.[slotIndex * 4 + 3] ?? 0) > 0) {
      activeCount += 1;
    }
  }
  return activeCount;
}

function resolveValidCount(activeCount, slots) {
  if (Number.isFinite(activeCount) && activeCount >= 0) {
    return Math.max(0, Math.floor(activeCount));
  }
  return countActiveModalSlots(slots);
}

function resolveTotalCapacity({ maxTotalModes, fallbackCapacity }) {
  if (Number.isFinite(maxTotalModes) && maxTotalModes >= 0) {
    return Math.max(0, Math.floor(maxTotalModes));
  }
  return Math.max(0, Math.floor(fallbackCapacity || 0));
}

function compareModeTuple(left, right) {
  if (left.u !== right.u) return left.u - right.u;
  if (left.v !== right.v) return left.v - right.v;
  return left.w - right.w;
}

function countPhaseAuthorityModes(phaseSlots, maxCount) {
  const slotCount = Math.min(
    Math.max(0, Math.floor(maxCount ?? 0)),
    Math.floor((phaseSlots?.length ?? 0) / 4),
  );
  let activeCount = 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const authority =
      (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0);
    if (authority > 1e-4) {
      activeCount += 1;
    }
  }
  return activeCount;
}

function buildAdmissionEntries({
  slots,
  phaseSlots,
  colorSlots,
  spectralSlots,
  metadataSlots,
  validCount,
}) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  const limit = Math.min(Math.max(0, Math.floor(validCount ?? 0)), slotCount);
  const entries = [];

  for (let slotIndex = 0; slotIndex < limit; slotIndex += 1) {
    const offset = slotIndex * 4;
    const coefficient = slots?.[offset + 3] ?? 0;
    if (!(coefficient > 0)) {
      continue;
    }
    const u = slots?.[offset] ?? 0;
    const v = slots?.[offset + 1] ?? 0;
    const w = slots?.[offset + 2] ?? 0;
    entries.push({
      modeKey: `${u}:${v}:${w}`,
      u,
      v,
      w,
      coefficient,
      phaseOffsetRad: phaseSlots?.[offset] ?? 0,
      phaseVelocityRadPerSec: phaseSlots?.[offset + 1] ?? 0,
      phaseCoherence: phaseSlots?.[offset + 2] ?? 0,
      phaseAuthority: phaseSlots?.[offset + 3] ?? 0,
      colorR: colorSlots?.[offset] ?? 0,
      colorG: colorSlots?.[offset + 1] ?? 0,
      colorB: colorSlots?.[offset + 2] ?? 0,
      colorWeight: colorSlots?.[offset + 3] ?? 0,
      spectralPhase: spectralSlots?.[offset] ?? 0,
      spectralWavelength: spectralSlots?.[offset + 1] ?? 0,
      spectralHarmonicConfidence: spectralSlots?.[offset + 2] ?? 0,
      spectralAccentEnergy: spectralSlots?.[offset + 3] ?? 0,
      naturalFrequencyHz: readFiniteNonNegative(metadataSlots?.[offset]),
      qualityFactor: readFiniteNonNegative(metadataSlots?.[offset + 1]),
      dampingRatio: readFiniteNonNegative(metadataSlots?.[offset + 2]),
      observedSupport: clamp01(metadataSlots?.[offset + 3] ?? 0),
    });
  }

  return entries;
}

function mergeAdmissionEntries(entries) {
  const merged = new Map();

  for (const entry of entries) {
    const existing = merged.get(entry.modeKey);
    const spectralInfluence = Math.max(0, entry.colorWeight) * entry.coefficient;
    if (!existing) {
      merged.set(entry.modeKey, {
        ...entry,
        coefficient: entry.coefficient,
        colorWeightNumerator: entry.colorWeight * entry.coefficient,
        spectralOwnerInfluence: spectralInfluence,
        spectralOwnerColorR: entry.colorR,
        spectralOwnerColorG: entry.colorG,
        spectralOwnerColorB: entry.colorB,
        spectralOwnerPhase: entry.spectralPhase,
        spectralOwnerWavelength: entry.spectralWavelength,
        spectralOwnerHarmonicConfidence: entry.spectralHarmonicConfidence,
        spectralOwnerAccentEnergy: entry.spectralAccentEnergy,
        naturalFrequencyNumerator: entry.naturalFrequencyHz * entry.coefficient,
        qualityFactorNumerator: entry.qualityFactor * entry.coefficient,
        dampingRatioNumerator: entry.dampingRatio * entry.coefficient,
      });
      continue;
    }

    existing.coefficient += entry.coefficient;
    if (entry.phaseAuthority >= existing.phaseAuthority) {
      existing.phaseAuthority = entry.phaseAuthority;
      existing.phaseOffsetRad = entry.phaseOffsetRad;
      existing.phaseVelocityRadPerSec = entry.phaseVelocityRadPerSec;
      existing.phaseCoherence = entry.phaseCoherence;
    }
    existing.colorWeightNumerator += entry.colorWeight * entry.coefficient;
    if (spectralInfluence > existing.spectralOwnerInfluence) {
      existing.spectralOwnerInfluence = spectralInfluence;
      existing.spectralOwnerColorR = entry.colorR;
      existing.spectralOwnerColorG = entry.colorG;
      existing.spectralOwnerColorB = entry.colorB;
      existing.spectralOwnerPhase = entry.spectralPhase;
      existing.spectralOwnerWavelength = entry.spectralWavelength;
      existing.spectralOwnerHarmonicConfidence =
        entry.spectralHarmonicConfidence;
      existing.spectralOwnerAccentEnergy = entry.spectralAccentEnergy;
    }
    existing.naturalFrequencyNumerator +=
      entry.naturalFrequencyHz * entry.coefficient;
    existing.qualityFactorNumerator += entry.qualityFactor * entry.coefficient;
    existing.dampingRatioNumerator += entry.dampingRatio * entry.coefficient;
    existing.observedSupport = Math.max(
      existing.observedSupport,
      entry.observedSupport,
    );
  }

  return Array.from(merged.values()).map((entry) => {
    const coefficientDenom = Math.max(entry.coefficient, 1e-9);
    const colorWeight = entry.colorWeightNumerator / coefficientDenom;
    return {
      ...entry,
      colorR: entry.spectralOwnerColorR,
      colorG: entry.spectralOwnerColorG,
      colorB: entry.spectralOwnerColorB,
      colorWeight,
      spectralPhase: entry.spectralOwnerPhase,
      spectralWavelength: entry.spectralOwnerWavelength,
      spectralHarmonicConfidence: entry.spectralOwnerHarmonicConfidence,
      spectralAccentEnergy: entry.spectralOwnerAccentEnergy,
      naturalFrequencyHz: entry.naturalFrequencyNumerator / coefficientDenom,
      qualityFactor: entry.qualityFactorNumerator / coefficientDenom,
      dampingRatio: entry.dampingRatioNumerator / coefficientDenom,
    };
  });
}

function assignEntriesToStableSlotIndices(
  entries,
  totalCapacity,
  stableSlotByModeKey = null,
) {
  const assignments = new Array(totalCapacity).fill(null);
  if (!stableSlotByModeKey) {
    const sorted = [...entries].sort(compareModeTuple);
    for (
      let index = 0;
      index < sorted.length && index < totalCapacity;
      index += 1
    ) {
      assignments[index] = sorted[index];
    }
    return assignments;
  }

  const usedSlots = new Set();
  const unassigned = [];

  for (const entry of entries) {
    const stableSlot = stableSlotByModeKey.get(entry.modeKey);
    if (
      Number.isInteger(stableSlot) &&
      stableSlot >= 0 &&
      stableSlot < totalCapacity &&
      !usedSlots.has(stableSlot)
    ) {
      assignments[stableSlot] = entry;
      usedSlots.add(stableSlot);
    } else {
      unassigned.push(entry);
    }
  }

  unassigned.sort(compareModeTuple);
  let searchFrom = 0;
  for (const entry of unassigned) {
    while (searchFrom < totalCapacity && assignments[searchFrom] != null) {
      searchFrom += 1;
    }
    if (searchFrom >= totalCapacity) {
      break;
    }
    assignments[searchFrom] = entry;
    stableSlotByModeKey.set(entry.modeKey, searchFrom);
    usedSlots.add(searchFrom);
    searchFrom += 1;
  }

  return assignments;
}

function writeUnifiedModalSlotViewsFromAssignments(assignments, capacity) {
  const slots = new Float32Array(capacity * 4);
  const phaseSlots = new Float32Array(capacity * 4);
  const colorSlots = new Float32Array(capacity * 4);
  const spectralSlots = new Float32Array(capacity * 4);
  const metadataSlots = new Float32Array(capacity * 4);

  for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
    const entry = assignments[slotIndex];
    if (!entry) {
      continue;
    }
    const offset = slotIndex * 4;
    slots[offset] = entry.u;
    slots[offset + 1] = entry.v;
    slots[offset + 2] = entry.w;
    slots[offset + 3] = entry.coefficient;

    phaseSlots[offset] = entry.phaseOffsetRad;
    phaseSlots[offset + 1] = entry.phaseVelocityRadPerSec;
    phaseSlots[offset + 2] = entry.phaseCoherence;
    phaseSlots[offset + 3] = entry.phaseAuthority;

    colorSlots[offset] = entry.colorR;
    colorSlots[offset + 1] = entry.colorG;
    colorSlots[offset + 2] = entry.colorB;
    colorSlots[offset + 3] = entry.colorWeight;

    spectralSlots[offset] = entry.spectralPhase;
    spectralSlots[offset + 1] = entry.spectralWavelength;
    spectralSlots[offset + 2] = entry.spectralHarmonicConfidence;
    spectralSlots[offset + 3] = entry.spectralAccentEnergy;

    metadataSlots[offset] = entry.naturalFrequencyHz;
    metadataSlots[offset + 1] = entry.qualityFactor;
    metadataSlots[offset + 2] = entry.dampingRatio;
    metadataSlots[offset + 3] = entry.observedSupport;
  }

  return {
    modalFieldSlots: slots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldColorSlots: colorSlots,
    modalFieldSpectralSlots: spectralSlots,
    modalFieldMetadataSlots: metadataSlots,
  };
}

function countOccupiedSlotSpan(assignments) {
  for (let slotIndex = assignments.length - 1; slotIndex >= 0; slotIndex -= 1) {
    if (assignments[slotIndex] != null) {
      return slotIndex + 1;
    }
  }
  return 0;
}

/**
 * @param {{
 *   generation?: number,
 *   maxTotalModes?: number,
 *   modalFieldSlots?: Float32Array | number[],
 *   modalFieldPhaseSlots?: Float32Array | number[],
 *   modalFieldColorSlots?: Float32Array | number[] | null,
 *   modalFieldSpectralSlots?: Float32Array | number[] | null,
 *   modalFieldMetadataSlots?: Float32Array | number[] | null,
 *   activeModalFieldModeCount?: number,
 *   observerCandidateModeCount?: number,
 *   observedModalModeCount?: number,
 *   phaseAuthorityModeCount?: number,
 *   modeIdentityRetentionRatio?: number,
 *   stableSlotByModeKey?: Map<string, number> | null,
 *   basisAtlasPageCapacity?: number,
 *   basisCacheResolution?: number,
 * }} [options]
 */
export function buildCanonicalFullModalDescriptor({
  generation = 0,
  maxTotalModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldColorSlots = null,
  modalFieldSpectralSlots = null,
  modalFieldMetadataSlots = null,
  activeModalFieldModeCount,
  observerCandidateModeCount,
  observedModalModeCount,
  phaseAuthorityModeCount,
  modeIdentityRetentionRatio = 1,
  stableSlotByModeKey = null,
  basisAtlasPageCapacity = MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  basisCacheResolution = MODAL_BASIS_CACHE_RESOLUTION,
} = {}) {
  const fallbackCapacity = resolveCapacity(undefined, modalFieldSlots);
  const totalCapacity = resolveTotalCapacity({
    maxTotalModes,
    fallbackCapacity,
  });
  const validModeCount = resolveValidCount(
    activeModalFieldModeCount,
    modalFieldSlots,
  );
  const admissionEntries = buildAdmissionEntries({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    colorSlots: modalFieldColorSlots,
    spectralSlots: modalFieldSpectralSlots,
    metadataSlots: modalFieldMetadataSlots,
    validCount: validModeCount,
  });
  const mergedEntries = mergeAdmissionEntries(admissionEntries);
  let admittedEntries;
  let rejectedEntries;
  if (mergedEntries.length <= totalCapacity) {
    admittedEntries = mergedEntries;
    rejectedEntries = [];
  } else {
    const entriesByAdmissionPriority = [...mergedEntries].sort(
      (left, right) => {
        if (right.coefficient !== left.coefficient) {
          return right.coefficient - left.coefficient;
        }
        return compareModeTuple(left, right);
      },
    );
    admittedEntries = entriesByAdmissionPriority.slice(0, totalCapacity);
    rejectedEntries = entriesByAdmissionPriority.slice(totalCapacity);
  }
  const slotAssignments = assignEntriesToStableSlotIndices(
    admittedEntries,
    totalCapacity,
    stableSlotByModeKey,
  );
  const acceptedEntries = slotAssignments.filter((entry) => entry != null);
  const occupiedSlotSpan = countOccupiedSlotSpan(slotAssignments);
  const overflowModeCount = rejectedEntries.length;
  const rejectedModalEnergy = rejectedEntries.reduce(
    (total, entry) => total + Math.max(0, entry.coefficient) ** 2,
    0,
  );
  const descriptorOverflow = overflowModeCount > 0;
  const structuralAdmission = deriveStructuralAdmissionDiagnostics(
    slotAssignments,
    {
      basisAtlasPageCapacity,
      basisCacheResolution,
    },
  );
  const rejectionReasons = {};
  if (overflowModeCount > 0) {
    rejectionReasons.descriptorCapacity = overflowModeCount;
  }
  if (structuralAdmission.basisAtlasCapacityRejectedCount > 0) {
    rejectionReasons.basisAtlasCapacity =
      structuralAdmission.basisAtlasCapacityRejectedCount;
  }
  if (structuralAdmission.spatialBandwidthRejectedCount > 0) {
    rejectionReasons.spatialBandwidth =
      structuralAdmission.spatialBandwidthRejectedCount;
  }
  const unifiedSlotViews = writeUnifiedModalSlotViewsFromAssignments(
    slotAssignments,
    totalCapacity,
  );
  const resolvedPhaseAuthorityModeCount = Number.isFinite(
    phaseAuthorityModeCount,
  )
    ? Math.max(0, Math.floor(phaseAuthorityModeCount))
    : countPhaseAuthorityModes(modalFieldPhaseSlots, validModeCount);

  return {
    generation: Math.max(0, Math.floor(generation ?? 0)),
    fieldAuthority: descriptorOverflow ? "blocked" : "complete",
    capacity: {
      maxTotalModes: totalCapacity,
    },
    modes: {
      modalField: acceptedEntries.map((entry) => ({
        modeKey: entry.modeKey,
        u: entry.u,
        v: entry.v,
        w: entry.w,
        coefficient: entry.coefficient,
        referenceAmplitude: entry.coefficient,
        phaseOffsetRad: entry.phaseOffsetRad,
        phaseVelocityRadPerSec: entry.phaseVelocityRadPerSec,
        phaseCoherence: entry.phaseCoherence,
        phaseAuthority: entry.phaseAuthority,
        coherence: entry.phaseCoherence,
        persistence: entry.phaseAuthority,
        naturalFrequencyHz: entry.naturalFrequencyHz,
        qualityFactor: entry.qualityFactor,
        dampingRatio: entry.dampingRatio,
        observedSupport: entry.observedSupport,
      })),
    },
    counts: {
      validModeCount,
      modalFieldModeCount: occupiedSlotSpan,
      overflowModeCount,
    },
    diagnostics: {
      observerCandidateModeCount: Number.isFinite(observerCandidateModeCount)
        ? Math.max(0, Math.floor(observerCandidateModeCount))
        : validModeCount,
      observedModalModeCount: Number.isFinite(observedModalModeCount)
        ? Math.max(0, Math.floor(observedModalModeCount))
        : validModeCount,
      phaseAuthorityModeCount: resolvedPhaseAuthorityModeCount,
      modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio ?? 1),
      descriptorOverflow,
      structuralCoverageSatisfied:
        !descriptorOverflow && structuralAdmission.structuralCoverageSatisfied,
      rejectedModalEnergy:
        rejectedModalEnergy +
        structuralAdmission.basisAtlasCapacityRejectedEnergy +
        structuralAdmission.spatialBandwidthRejectedEnergy,
      descriptorRejectedModalEnergy: rejectedModalEnergy,
      basisAtlasRejectedModalEnergy:
        structuralAdmission.basisAtlasCapacityRejectedEnergy,
      spatialBandwidthRejectedModalEnergy:
        structuralAdmission.spatialBandwidthRejectedEnergy,
      basisAtlasCapacityRejectedCount:
        structuralAdmission.basisAtlasCapacityRejectedCount,
      spatialBandwidthRejectedCount:
        structuralAdmission.spatialBandwidthRejectedCount,
      basisAtlasPageCapacity: structuralAdmission.basisAtlasPageCapacity,
      maxRepresentableModeIndex: structuralAdmission.maxRepresentableModeIndex,
      rejectionReasons,
    },
    slotViews: {
      ...unifiedSlotViews,
    },
  };
}
