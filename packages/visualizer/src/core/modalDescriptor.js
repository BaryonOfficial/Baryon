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

function buildModalDescriptorEntries({
  slots,
  phaseSlots,
  layer,
  validCount,
  capacity,
}) {
  const transportCount = Math.min(validCount, capacity);
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  const entries = [];

  for (
    let slotIndex = 0;
    slotIndex < slotCount && entries.length < transportCount;
    slotIndex += 1
  ) {
    const offset = slotIndex * 4;
    const amplitude = slots?.[offset + 3] ?? 0;
    if (!(amplitude > 0)) {
      continue;
    }
    const phaseOffsetRad = phaseSlots?.[offset] ?? 0;
    const phaseVelocityRadPerSec = phaseSlots?.[offset + 1] ?? 0;
    const phaseCoherence = phaseSlots?.[offset + 2] ?? 0;
    const phaseAuthority = phaseSlots?.[offset + 3] ?? 0;
    const u = slots?.[offset] ?? 0;
    const v = slots?.[offset + 1] ?? 0;
    const w = slots?.[offset + 2] ?? 0;

    entries.push({
      modeKey: `${u}:${v}:${w}`,
      u,
      v,
      w,
      layer,
      amplitude,
      referenceAmplitude: amplitude,
      phaseOffsetRad,
      phaseVelocityRadPerSec,
      phaseCoherence,
      phaseAuthority,
      coherence: phaseCoherence,
      persistence: phaseAuthority,
      naturalFrequencyHz: 0,
    });
  }

  return entries;
}

/**
 * @param {{
 *   generation?: number,
 *   maxBackboneModes?: number,
 *   maxDetailModes?: number,
 *   backboneSlots?: Float32Array | number[],
 *   detailSlots?: Float32Array | number[],
 *   backbonePhaseSlots?: Float32Array | number[],
 *   detailPhaseSlots?: Float32Array | number[],
 *   backboneColorSlots?: Float32Array | number[] | null,
 *   detailColorSlots?: Float32Array | number[] | null,
 *   activeBackboneModeCount?: number,
 *   activeDetailModeCount?: number,
 *   observerCandidateModeCount?: number,
 *   observedModalModeCount?: number,
 *   phaseAuthorityModeCount?: number,
 *   modeIdentityRetentionRatio?: number,
 * }} [options]
 */
export function buildCanonicalFullModalDescriptor({
  generation = 0,
  maxBackboneModes,
  maxDetailModes,
  backboneSlots,
  detailSlots,
  backbonePhaseSlots,
  detailPhaseSlots,
  backboneColorSlots = null,
  detailColorSlots = null,
  activeBackboneModeCount,
  activeDetailModeCount,
  observerCandidateModeCount,
  observedModalModeCount,
  phaseAuthorityModeCount,
  modeIdentityRetentionRatio = 1,
} = {}) {
  const backboneCapacity = resolveCapacity(maxBackboneModes, backboneSlots);
  const detailCapacity = resolveCapacity(maxDetailModes, detailSlots);
  const validBackboneModeCount = resolveValidCount(
    activeBackboneModeCount,
    backboneSlots,
  );
  const validDetailModeCount = resolveValidCount(
    activeDetailModeCount,
    detailSlots,
  );
  const overflowBackboneModeCount = Math.max(
    0,
    validBackboneModeCount - backboneCapacity,
  );
  const overflowDetailModeCount = Math.max(
    0,
    validDetailModeCount - detailCapacity,
  );
  const descriptorOverflow =
    overflowBackboneModeCount > 0 || overflowDetailModeCount > 0;
  const resolvedPhaseAuthorityModeCount = Number.isFinite(
    phaseAuthorityModeCount,
  )
    ? Math.max(0, Math.floor(phaseAuthorityModeCount))
    : countPhaseAuthorityModes(backbonePhaseSlots, validBackboneModeCount) +
      countPhaseAuthorityModes(detailPhaseSlots, validDetailModeCount);

  return {
    generation: Math.max(0, Math.floor(generation ?? 0)),
    fieldAuthority: descriptorOverflow ? "blocked" : "complete",
    capacity: {
      maxBackboneModes: backboneCapacity,
      maxDetailModes: detailCapacity,
      maxTotalModes: backboneCapacity + detailCapacity,
    },
    modes: {
      backbone: buildModalDescriptorEntries({
        slots: backboneSlots,
        phaseSlots: backbonePhaseSlots,
        layer: "backbone",
        validCount: validBackboneModeCount,
        capacity: backboneCapacity,
      }),
      detail: buildModalDescriptorEntries({
        slots: detailSlots,
        phaseSlots: detailPhaseSlots,
        layer: "detail",
        validCount: validDetailModeCount,
        capacity: detailCapacity,
      }),
    },
    counts: {
      validBackboneModeCount,
      validDetailModeCount,
      validModeCount: validBackboneModeCount + validDetailModeCount,
      overflowBackboneModeCount,
      overflowDetailModeCount,
    },
    diagnostics: {
      observerCandidateModeCount: Number.isFinite(observerCandidateModeCount)
        ? Math.max(0, Math.floor(observerCandidateModeCount))
        : validBackboneModeCount + validDetailModeCount,
      observedModalModeCount: Number.isFinite(observedModalModeCount)
        ? Math.max(0, Math.floor(observedModalModeCount))
        : validBackboneModeCount + validDetailModeCount,
      phaseAuthorityModeCount: resolvedPhaseAuthorityModeCount,
      modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio ?? 1),
      descriptorOverflow,
    },
    slotViews: {
      backboneSlots,
      detailSlots,
      backbonePhaseSlots,
      detailPhaseSlots,
      backboneColorSlots,
      detailColorSlots,
    },
  };
}
