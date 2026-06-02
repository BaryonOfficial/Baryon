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

function getEntryModalEnergy(entry) {
  return Math.max(0, entry?.coefficient ?? 0) ** 2;
}

function compareModalEnergyThenTuple(left, right) {
  const energyDelta = getEntryModalEnergy(right) - getEntryModalEnergy(left);
  if (energyDelta !== 0) {
    return energyDelta;
  }
  return compareModeTuple(left, right);
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

function getEntryModeOrder(entry) {
  return Math.max(Math.abs(entry.u), Math.abs(entry.v), Math.abs(entry.w));
}

function getModeOrderOctaveBand(entry) {
  // Selection-only grouping: modal energy stays owned by the descriptor entry.
  const modeOrder = Math.max(1, getEntryModeOrder(entry));
  return Math.floor(Math.log2(modeOrder));
}

function getSpatialFamilyKey(entry) {
  return [Math.abs(entry.u), Math.abs(entry.v), Math.abs(entry.w)]
    .sort((left, right) => left - right)
    .join(":");
}

function divideOrFallback(numerator, denominator, fallback = 0) {
  return denominator > 0 ? numerator / denominator : fallback;
}

function buildModalVarietyAudit({
  slotAssignments,
  rejectedEntries,
  structuralAdmission,
  phaseAuthorityModeCount,
  modeIdentityRetentionRatio,
}) {
  const acceptedEntries = slotAssignments.filter(Boolean);
  const representedEntries = [];
  const familyKeys = new Set();
  const representedFamilyKeys = new Set();
  let acceptedModalEnergy = 0;
  let representedModalEnergy = 0;
  let modalEnergySquaredSum = 0;
  let minModeOrder = Infinity;
  let maxModeOrder = 0;
  let weightedModeOrderSum = 0;

  for (let slotIndex = 0; slotIndex < slotAssignments.length; slotIndex += 1) {
    const entry = slotAssignments[slotIndex];
    if (!entry) {
      continue;
    }

    const modalEnergy = Math.max(0, entry.coefficient) ** 2;
    const modeOrder = getEntryModeOrder(entry);
    acceptedModalEnergy += modalEnergy;
    modalEnergySquaredSum += modalEnergy * modalEnergy;
    minModeOrder = Math.min(minModeOrder, modeOrder);
    maxModeOrder = Math.max(maxModeOrder, modeOrder);
    weightedModeOrderSum += modalEnergy * modeOrder;
    familyKeys.add(getSpatialFamilyKey(entry));

    if (
      modeOrder <= structuralAdmission.maxRepresentableModeIndex &&
      slotIndex < structuralAdmission.basisAtlasPageCapacity
    ) {
      representedEntries.push(entry);
      representedFamilyKeys.add(getSpatialFamilyKey(entry));
      representedModalEnergy += modalEnergy;
    }
  }

  const descriptorRejectedModalEnergy = rejectedEntries.reduce(
    (total, entry) => total + Math.max(0, entry.coefficient) ** 2,
    0,
  );
  const semanticModalEnergy =
    acceptedModalEnergy + descriptorRejectedModalEnergy;
  const energyEffectiveModeCount =
    modalEnergySquaredSum > 0
      ? (acceptedModalEnergy * acceptedModalEnergy) / modalEnergySquaredSum
      : 0;

  return {
    semanticModeCount: acceptedEntries.length,
    representedBasisPageModeCount: representedEntries.length,
    basisAtlasPageCapacity: structuralAdmission.basisAtlasPageCapacity,
    basisAtlasPressure: divideOrFallback(
      representedEntries.length,
      structuralAdmission.basisAtlasPageCapacity,
    ),
    spatialFamilyCount: familyKeys.size,
    representedSpatialFamilyCount: representedFamilyKeys.size,
    energyEffectiveModeCount,
    modeOrderMin: Number.isFinite(minModeOrder) ? minModeOrder : 0,
    modeOrderMax: maxModeOrder,
    energyWeightedModeOrderMean: divideOrFallback(
      weightedModeOrderSum,
      acceptedModalEnergy,
    ),
    phaseAuthorityCoverage: divideOrFallback(
      phaseAuthorityModeCount,
      acceptedEntries.length,
    ),
    modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio ?? 1),
    semanticModalEnergy,
    representedModalEnergy,
    renderRepresentedEnergyRatio: divideOrFallback(
      representedModalEnergy,
      semanticModalEnergy,
      semanticModalEnergy > 0 ? 0 : 1,
    ),
    descriptorRejectedModeCount: rejectedEntries.length,
    descriptorRejectedEnergyRatio: divideOrFallback(
      descriptorRejectedModalEnergy,
      semanticModalEnergy,
    ),
    basisAtlasCapacityRejectedCount:
      structuralAdmission.basisAtlasCapacityRejectedCount,
    basisAtlasCapacityRejectedEnergyRatio: divideOrFallback(
      structuralAdmission.basisAtlasCapacityRejectedEnergy,
      semanticModalEnergy,
    ),
    spatialBandwidthRejectedCount:
      structuralAdmission.spatialBandwidthRejectedCount,
    spatialBandwidthRejectedEnergyRatio: divideOrFallback(
      structuralAdmission.spatialBandwidthRejectedEnergy,
      semanticModalEnergy,
    ),
    basisAtlasCapacitySweep: buildBasisAtlasCapacitySweep({
      slotAssignments,
      semanticModalEnergy,
      maxRepresentableModeIndex: structuralAdmission.maxRepresentableModeIndex,
      basisAtlasPageCapacity: structuralAdmission.basisAtlasPageCapacity,
    }),
  };
}

function resolveBasisAtlasSweepCapacities({
  basisAtlasPageCapacity,
  modalFieldCount,
}) {
  const capacities = new Set([
    basisAtlasPageCapacity,
    8,
    12,
    16,
    20,
    24,
    modalFieldCount,
  ]);
  return [...capacities]
    .filter((capacity) => Number.isFinite(capacity) && capacity > 0)
    .map((capacity) => Math.floor(capacity))
    .filter((capacity) => capacity <= Math.max(1, modalFieldCount))
    .sort((left, right) => left - right);
}

function buildBasisAtlasCapacitySweep({
  slotAssignments,
  semanticModalEnergy,
  maxRepresentableModeIndex,
  basisAtlasPageCapacity,
}) {
  return resolveBasisAtlasSweepCapacities({
    basisAtlasPageCapacity,
    modalFieldCount: slotAssignments.filter(Boolean).length,
  }).map((capacity) => {
    const representedFamilyKeys = new Set();
    let representedModeCount = 0;
    let representedModalEnergy = 0;
    let basisAtlasCapacityRejectedCount = 0;
    let basisAtlasCapacityRejectedEnergy = 0;
    let spatialBandwidthRejectedCount = 0;
    let spatialBandwidthRejectedEnergy = 0;

    for (
      let slotIndex = 0;
      slotIndex < slotAssignments.length;
      slotIndex += 1
    ) {
      const entry = slotAssignments[slotIndex];
      if (!entry) {
        continue;
      }
      const modalEnergy = getEntryModalEnergy(entry);
      if (getEntryModeOrder(entry) > maxRepresentableModeIndex) {
        spatialBandwidthRejectedCount += 1;
        spatialBandwidthRejectedEnergy += modalEnergy;
        continue;
      }
      if (slotIndex >= capacity) {
        basisAtlasCapacityRejectedCount += 1;
        basisAtlasCapacityRejectedEnergy += modalEnergy;
        continue;
      }

      representedModeCount += 1;
      representedFamilyKeys.add(getSpatialFamilyKey(entry));
      representedModalEnergy += modalEnergy;
    }

    const rejectedEnergy = Math.max(
      0,
      semanticModalEnergy - representedModalEnergy,
    );
    return {
      basisAtlasPageCapacity: capacity,
      representedBasisPageModeCount: representedModeCount,
      representedSpatialFamilyCount: representedFamilyKeys.size,
      representedModalEnergy,
      renderRepresentedEnergyRatio: divideOrFallback(
        representedModalEnergy,
        semanticModalEnergy,
        semanticModalEnergy > 0 ? 0 : 1,
      ),
      basisAtlasCapacityRejectedCount,
      basisAtlasCapacityRejectedEnergyRatio: divideOrFallback(
        basisAtlasCapacityRejectedEnergy,
        semanticModalEnergy,
      ),
      spatialBandwidthRejectedCount,
      spatialBandwidthRejectedEnergyRatio: divideOrFallback(
        spatialBandwidthRejectedEnergy,
        semanticModalEnergy,
      ),
      unrepresentedModalEnergyRatio: divideOrFallback(
        rejectedEnergy,
        semanticModalEnergy,
      ),
    };
  });
}

function buildAdmissionEntries({
  slots,
  phaseSlots,
  colorSlots,
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
    if (!existing) {
      merged.set(entry.modeKey, {
        ...entry,
        coefficient: entry.coefficient,
        colorWeightNumerator: entry.colorWeight * entry.coefficient,
        colorRNumerator: entry.colorR * entry.colorWeight * entry.coefficient,
        colorGNumerator: entry.colorG * entry.colorWeight * entry.coefficient,
        colorBNumerator: entry.colorB * entry.colorWeight * entry.coefficient,
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
    existing.colorRNumerator +=
      entry.colorR * entry.colorWeight * entry.coefficient;
    existing.colorGNumerator +=
      entry.colorG * entry.colorWeight * entry.coefficient;
    existing.colorBNumerator +=
      entry.colorB * entry.colorWeight * entry.coefficient;
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
    const colorDenom = Math.max(entry.colorWeightNumerator, 1e-9);
    return {
      ...entry,
      colorR: entry.colorRNumerator / colorDenom,
      colorG: entry.colorGNumerator / colorDenom,
      colorB: entry.colorBNumerator / colorDenom,
      colorWeight,
      naturalFrequencyHz: entry.naturalFrequencyNumerator / coefficientDenom,
      qualityFactor: entry.qualityFactorNumerator / coefficientDenom,
      dampingRatio: entry.dampingRatioNumerator / coefficientDenom,
    };
  });
}

function isBasisRepresentableEntry(entry, maxRepresentableModeIndex) {
  return getEntryModeOrder(entry) <= maxRepresentableModeIndex;
}

function selectDiverseBasisEntries(entries, basisAtlasPageCapacity) {
  const basisCapacity = Math.max(0, Math.floor(basisAtlasPageCapacity ?? 0));
  if (basisCapacity <= 0 || entries.length <= basisCapacity) {
    return [...entries].sort(compareModeTuple);
  }

  const energyOrdered = [...entries].sort(compareModalEnergyThenTuple);
  const selected = [];
  const selectedModeKeys = new Set();
  const selectedFamilyKeys = new Set();
  const selectedOrderBands = new Set();
  const anchorCount = Math.min(
    energyOrdered.length,
    basisCapacity,
    Math.max(1, Math.floor(basisCapacity / 2)),
  );

  const addSelected = (entry) => {
    if (!entry || selectedModeKeys.has(entry.modeKey)) {
      return false;
    }
    selected.push(entry);
    selectedModeKeys.add(entry.modeKey);
    selectedFamilyKeys.add(getSpatialFamilyKey(entry));
    selectedOrderBands.add(getModeOrderOctaveBand(entry));
    return true;
  };

  for (let index = 0; index < anchorCount; index += 1) {
    addSelected(energyOrdered[index]);
  }

  while (selected.length < basisCapacity) {
    let bestEntry = null;
    let bestRank = null;

    for (const entry of energyOrdered) {
      if (selectedModeKeys.has(entry.modeKey)) {
        continue;
      }

      const familyNovelty = selectedFamilyKeys.has(getSpatialFamilyKey(entry))
        ? 0
        : 1;
      const orderBandNovelty = selectedOrderBands.has(
        getModeOrderOctaveBand(entry),
      )
        ? 0
        : 1;
      const rank = [
        orderBandNovelty,
        familyNovelty,
        getEntryModalEnergy(entry),
        -entry.u,
        -entry.v,
        -entry.w,
      ];

      if (!bestRank || compareRank(rank, bestRank) > 0) {
        bestEntry = entry;
        bestRank = rank;
      }
    }

    if (!bestEntry) {
      break;
    }
    addSelected(bestEntry);
  }

  return selected;
}

function compareRank(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function orderEntriesForBasisRepresentation(
  entries,
  { basisAtlasPageCapacity, basisCacheResolution },
) {
  const basisCapacity = Math.max(0, Math.floor(basisAtlasPageCapacity ?? 0));
  if (entries.length <= basisCapacity) {
    return [...entries].sort(compareModeTuple);
  }

  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(basisCacheResolution);
  const representableEntries = entries
    .filter((entry) =>
      isBasisRepresentableEntry(entry, maxRepresentableModeIndex),
    )
    .sort(compareModalEnergyThenTuple);
  const bandwidthRejectedEntries = entries
    .filter(
      (entry) => !isBasisRepresentableEntry(entry, maxRepresentableModeIndex),
    )
    .sort(compareModalEnergyThenTuple);
  const basisEntries = selectDiverseBasisEntries(
    representableEntries,
    basisCapacity,
  );
  const basisModeKeys = new Set(basisEntries.map((entry) => entry.modeKey));
  const remainingRepresentableEntries = representableEntries.filter(
    (entry) => !basisModeKeys.has(entry.modeKey),
  );

  return [
    ...basisEntries,
    ...remainingRepresentableEntries,
    ...bandwidthRejectedEntries,
  ];
}

function assignEntriesToStableSlotIndices(
  entries,
  totalCapacity,
  {
    basisAtlasPageCapacity = MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    basisCacheResolution = MODAL_BASIS_CACHE_RESOLUTION,
  } = {},
  stableSlotByModeKey = null,
) {
  const assignments = new Array(totalCapacity).fill(null);
  const orderedEntries = orderEntriesForBasisRepresentation(entries, {
    basisAtlasPageCapacity,
    basisCacheResolution,
  }).slice(0, totalCapacity);

  if (!stableSlotByModeKey) {
    for (
      let index = 0;
      index < orderedEntries.length && index < totalCapacity;
      index += 1
    ) {
      assignments[index] = orderedEntries[index];
    }
    return assignments;
  }

  const usedSlots = new Set();
  const orderedModeKeys = new Set(orderedEntries.map((entry) => entry.modeKey));
  const orderedBasisEntries = orderedEntries.slice(
    0,
    Math.max(0, Math.floor(basisAtlasPageCapacity ?? 0)),
  );
  const orderedTailEntries = orderedEntries.slice(orderedBasisEntries.length);
  const assignEntry = (entry, slotIndex) => {
    assignments[slotIndex] = entry;
    usedSlots.add(slotIndex);
    stableSlotByModeKey.set(entry.modeKey, slotIndex);
  };
  const assignOrderedEntries = ({ ordered, start, end, allowStableSlot }) => {
    const unassigned = [];
    for (const entry of ordered) {
      const stableSlot = stableSlotByModeKey.get(entry.modeKey);
      if (
        allowStableSlot &&
        Number.isInteger(stableSlot) &&
        stableSlot >= start &&
        stableSlot < end &&
        stableSlot < totalCapacity &&
        !usedSlots.has(stableSlot)
      ) {
        assignEntry(entry, stableSlot);
      } else {
        unassigned.push(entry);
      }
    }

    let searchFrom = start;
    for (const entry of unassigned) {
      while (
        searchFrom < end &&
        searchFrom < totalCapacity &&
        assignments[searchFrom] != null
      ) {
        searchFrom += 1;
      }
      if (searchFrom >= end || searchFrom >= totalCapacity) {
        break;
      }
      assignEntry(entry, searchFrom);
      searchFrom += 1;
    }
  };

  assignOrderedEntries({
    ordered: orderedBasisEntries,
    start: 0,
    end: Math.min(
      totalCapacity,
      Math.max(0, Math.floor(basisAtlasPageCapacity ?? 0)),
    ),
    allowStableSlot: true,
  });

  assignOrderedEntries({
    ordered: orderedTailEntries,
    start: Math.min(
      totalCapacity,
      Math.max(0, Math.floor(basisAtlasPageCapacity ?? 0)),
    ),
    end: totalCapacity,
    allowStableSlot: true,
  });

  for (const modeKey of stableSlotByModeKey.keys()) {
    if (!orderedModeKeys.has(modeKey)) {
      stableSlotByModeKey.delete(modeKey);
    }
  }

  return assignments;
}

function writeUnifiedModalSlotViewsFromAssignments(assignments, capacity) {
  const slots = new Float32Array(capacity * 4);
  const phaseSlots = new Float32Array(capacity * 4);
  const colorSlots = new Float32Array(capacity * 4);
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

    metadataSlots[offset] = entry.naturalFrequencyHz;
    metadataSlots[offset + 1] = entry.qualityFactor;
    metadataSlots[offset + 2] = entry.dampingRatio;
    metadataSlots[offset + 3] = entry.observedSupport;
  }

  return {
    modalFieldSlots: slots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldColorSlots: colorSlots,
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
    {
      basisAtlasPageCapacity,
      basisCacheResolution,
    },
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
  const modalVarietyAudit = buildModalVarietyAudit({
    slotAssignments,
    rejectedEntries,
    structuralAdmission,
    phaseAuthorityModeCount: resolvedPhaseAuthorityModeCount,
    modeIdentityRetentionRatio,
  });

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
      modalVarietyAudit,
      rejectionReasons,
    },
    slotViews: {
      ...unifiedSlotViews,
    },
  };
}
