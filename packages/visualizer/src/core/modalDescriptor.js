function clamp01(value) {
  return Math.min(1, Math.max(0, value));
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
  roleSlots,
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
    const roleMask = Math.max(0, Math.floor(roleSlots?.[offset] ?? 0));
    const backboneRoleWeight = roleSlots?.[offset + 1] ?? 0;
    const detailRoleWeight = roleSlots?.[offset + 2] ?? 0;
    entries.push({
      modeKey: `${u}:${v}:${w}`,
      u,
      v,
      w,
      roleMask,
      backboneRoleWeight,
      detailRoleWeight,
      coefficient,
      phaseOffsetRad: phaseSlots?.[offset] ?? 0,
      phaseVelocityRadPerSec: phaseSlots?.[offset + 1] ?? 0,
      phaseCoherence: phaseSlots?.[offset + 2] ?? 0,
      phaseAuthority: phaseSlots?.[offset + 3] ?? 0,
      colorR: colorSlots?.[offset] ?? 0,
      colorG: colorSlots?.[offset + 1] ?? 0,
      colorB: colorSlots?.[offset + 2] ?? 0,
      colorWeight: colorSlots?.[offset + 3] ?? 0,
    });
  }

  return entries;
}

function mergeAdmissionEntries(entries) {
  const merged = new Map();

  for (const entry of entries) {
    const existing = merged.get(entry.modeKey);
    const roleMask =
      entry.roleMask ||
      ((entry.backboneRoleWeight > 0 ? 1 : 0) |
        (entry.detailRoleWeight > 0 ? 2 : 0));
    if (!existing) {
      merged.set(entry.modeKey, {
        ...entry,
        roleMask,
        backboneRoleWeight: entry.backboneRoleWeight > 0 ? 1 : 0,
        detailRoleWeight: entry.detailRoleWeight > 0 ? 1 : 0,
        coefficient: entry.coefficient,
        colorWeightNumerator: entry.colorWeight * entry.coefficient,
        colorRNumerator: entry.colorR * entry.colorWeight * entry.coefficient,
        colorGNumerator: entry.colorG * entry.colorWeight * entry.coefficient,
        colorBNumerator: entry.colorB * entry.colorWeight * entry.coefficient,
      });
      continue;
    }

    existing.roleMask |= roleMask;
    existing.backboneRoleWeight += entry.backboneRoleWeight > 0 ? 1 : 0;
    existing.detailRoleWeight += entry.detailRoleWeight > 0 ? 1 : 0;
    existing.coefficient += entry.coefficient;
    if (entry.phaseAuthority >= existing.phaseAuthority) {
      existing.phaseAuthority = entry.phaseAuthority;
      existing.phaseOffsetRad = entry.phaseOffsetRad;
      existing.phaseVelocityRadPerSec = entry.phaseVelocityRadPerSec;
      existing.phaseCoherence = entry.phaseCoherence;
    }
    existing.colorWeightNumerator += entry.colorWeight * entry.coefficient;
    existing.colorRNumerator += entry.colorR * entry.colorWeight * entry.coefficient;
    existing.colorGNumerator += entry.colorG * entry.colorWeight * entry.coefficient;
    existing.colorBNumerator += entry.colorB * entry.colorWeight * entry.coefficient;
  }

  return Array.from(merged.values()).map((entry) => {
    const colorWeight = entry.colorWeightNumerator / Math.max(entry.coefficient, 1e-9);
    const colorDenom = Math.max(entry.colorWeightNumerator, 1e-9);
    return {
      ...entry,
      colorR: entry.colorRNumerator / colorDenom,
      colorG: entry.colorGNumerator / colorDenom,
      colorB: entry.colorBNumerator / colorDenom,
      colorWeight,
    };
  });
}

function writeUnifiedModalSlotViews(entries, capacity) {
  const slots = new Float32Array(capacity * 4);
  const phaseSlots = new Float32Array(capacity * 4);
  const colorSlots = new Float32Array(capacity * 4);
  const roleSlots = new Float32Array(capacity * 4);

  entries.slice(0, capacity).forEach((entry, index) => {
    const offset = index * 4;
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

    roleSlots[offset] = entry.roleMask;
    roleSlots[offset + 1] = entry.backboneRoleWeight > 0 ? 1 : 0;
    roleSlots[offset + 2] = entry.detailRoleWeight > 0 ? 1 : 0;
    roleSlots[offset + 3] = 1;
  });

  return {
    modalFieldSlots: slots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldColorSlots: colorSlots,
    modalFieldRoleSlots: roleSlots,
  };
}

/**
 * @param {{
 *   generation?: number,
 *   maxTotalModes?: number,
 *   modalFieldSlots?: Float32Array | number[],
 *   modalFieldPhaseSlots?: Float32Array | number[],
 *   modalFieldColorSlots?: Float32Array | number[] | null,
 *   modalFieldRoleSlots?: Float32Array | number[] | null,
 *   activeModalFieldModeCount?: number,
 *   roleHistogram?: {backbone?: number, detail?: number},
 *   observerCandidateModeCount?: number,
 *   observedModalModeCount?: number,
 *   phaseAuthorityModeCount?: number,
 *   modeIdentityRetentionRatio?: number,
 * }} [options]
 */
export function buildCanonicalFullModalDescriptor({
  generation = 0,
  maxTotalModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldColorSlots = null,
  modalFieldRoleSlots = null,
  activeModalFieldModeCount,
  roleHistogram: providedRoleHistogram = null,
  observerCandidateModeCount,
  observedModalModeCount,
  phaseAuthorityModeCount,
  modeIdentityRetentionRatio = 1,
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
    roleSlots: modalFieldRoleSlots,
    validCount: validModeCount,
  });
  const roleHistogram = providedRoleHistogram ?? admissionEntries.reduce(
    (histogram, entry) => {
      if ((entry.roleMask & 1) || entry.backboneRoleWeight > 0) {
        histogram.backbone += 1;
      }
      if ((entry.roleMask & 2) || entry.detailRoleWeight > 0) {
        histogram.detail += 1;
      }
      return histogram;
    },
    { backbone: 0, detail: 0 },
  );
  const mergedEntries = mergeAdmissionEntries(admissionEntries);
  const entriesByAdmissionPriority = [...mergedEntries].sort((left, right) => {
    if (right.coefficient !== left.coefficient) {
      return right.coefficient - left.coefficient;
    }
    return compareModeTuple(left, right);
  });
  const acceptedEntries = entriesByAdmissionPriority
    .slice(0, totalCapacity)
    .sort(compareModeTuple);
  const rejectedEntries = entriesByAdmissionPriority.slice(totalCapacity);
  const overflowModeCount = rejectedEntries.length;
  const rejectedModalEnergy = rejectedEntries.reduce(
    (total, entry) => total + Math.max(0, entry.coefficient) ** 2,
    0,
  );
  const descriptorOverflow = overflowModeCount > 0;
  const unifiedSlotViews = writeUnifiedModalSlotViews(
    acceptedEntries,
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
        roleMask: entry.roleMask,
        backboneRoleWeight: entry.backboneRoleWeight,
        detailRoleWeight: entry.detailRoleWeight,
        naturalFrequencyHz: 0,
      })),
    },
    counts: {
      validModeCount,
      modalFieldModeCount: acceptedEntries.length,
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
      roleHistogram,
      structuralCoverageSatisfied: true,
      rejectedModalEnergy,
      rejectionReasons:
        overflowModeCount > 0 ? { descriptorCapacity: overflowModeCount } : {},
    },
    slotViews: {
      ...unifiedSlotViews,
    },
  };
}
