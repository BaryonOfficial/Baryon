const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const PHASE_AUTHORITY_EPSILON = 1e-4;
const PHASE_VELOCITY_GROUP_SCALE = 10;
const PHASE_UNIT_INTERVAL_HASH_SCALE = 1000;
const PHASE_OFFSET_HASH_SCALE = 1024;

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function normalizePhaseRad(phase) {
  if (!Number.isFinite(phase)) {
    return 0;
  }
  let normalized = phase;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function getPhaseSlotAuthority(phaseSlots, offset) {
  return (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0);
}

function getPhaseVelocityGroupKey(phaseVelocityRadPerSec) {
  return Math.round(
    (Number.isFinite(phaseVelocityRadPerSec) ? phaseVelocityRadPerSec : 0) *
      PHASE_VELOCITY_GROUP_SCALE,
  );
}

function getUnitIntervalHashKey(value) {
  return Math.round(
    Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) *
      PHASE_UNIT_INTERVAL_HASH_SCALE,
  );
}

function getPhaseOffsetHashKey(phaseOffsetRad) {
  return Math.round(
    normalizePhaseRad(phaseOffsetRad) * PHASE_OFFSET_HASH_SCALE,
  );
}

function buildPhaseVelocityGroups(phaseSlots, activeCount) {
  const groups = new Map();
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (getPhaseSlotAuthority(phaseSlots, offset) <= PHASE_AUTHORITY_EPSILON) {
      continue;
    }
    const key = getPhaseVelocityGroupKey(phaseSlots?.[offset + 1] ?? 0);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      continue;
    }
    groups.set(key, {
      count: 1,
      referencePhaseRad: normalizePhaseRad(phaseSlots?.[offset] ?? 0),
    });
  }
  return groups;
}

function getCanonicalPhaseOffsetRad(phaseSlots, offset, groups) {
  if (getPhaseSlotAuthority(phaseSlots, offset) <= PHASE_AUTHORITY_EPSILON) {
    return 0;
  }
  const key = getPhaseVelocityGroupKey(phaseSlots?.[offset + 1] ?? 0);
  const group = groups.get(key);
  if (!group || group.count <= 1) {
    return 0;
  }
  return normalizePhaseRad(
    (phaseSlots?.[offset] ?? 0) - group.referencePhaseRad,
  );
}

function hashCanonicalPhaseSlot(phaseSlots, offset, groups, hash) {
  let nextHash = hashUint32(
    getPhaseOffsetHashKey(
      getCanonicalPhaseOffsetRad(phaseSlots, offset, groups),
    ),
    hash,
  );
  nextHash = hashUint32(
    getPhaseVelocityGroupKey(phaseSlots?.[offset + 1] ?? 0),
    nextHash,
  );
  nextHash = hashUint32(
    getUnitIntervalHashKey(phaseSlots?.[offset + 2] ?? 0),
    nextHash,
  );
  return hashUint32(
    getUnitIntervalHashKey(phaseSlots?.[offset + 3] ?? 0),
    nextHash,
  );
}

export function buildRaymarchPhaseSlotSignature({
  phaseSlots,
  activeCount,
  includeSlotIndex = false,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const phaseVelocityGroups = buildPhaseVelocityGroups(
    phaseSlots,
    clampedActiveCount,
  );
  let slotHash = FNV_OFFSET_BASIS;
  let activePhaseCount = 0;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (includeSlotIndex) {
      slotHash = hashUint32(slotIndex, slotHash);
    }
    slotHash = hashCanonicalPhaseSlot(
      phaseSlots,
      offset,
      phaseVelocityGroups,
      slotHash,
    );
    if (getPhaseSlotAuthority(phaseSlots, offset) > PHASE_AUTHORITY_EPSILON) {
      activePhaseCount += 1;
    }
  }

  return {
    activePhaseCount,
    slotHash: slotHash >>> 0,
  };
}

export function copyCanonicalRaymarchPhaseSlots({
  sourceSlots,
  targetSlots,
  capacity,
}) {
  if (!targetSlots) {
    return 0;
  }

  targetSlots.fill(0);
  let activePhaseCount = 0;
  const resolvedCapacity = Math.max(0, Math.floor(capacity ?? 0));
  const sourceSlotCount = Math.floor((sourceSlots?.length ?? 0) / 4);
  const slotLimit = Math.min(resolvedCapacity, sourceSlotCount);
  const phaseVelocityGroups = buildPhaseVelocityGroups(sourceSlots, slotLimit);

  for (let slotIndex = 0; slotIndex < resolvedCapacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (slotIndex < slotLimit) {
      targetSlots[offset] = getCanonicalPhaseOffsetRad(
        sourceSlots,
        offset,
        phaseVelocityGroups,
      );
      targetSlots[offset + 1] = sourceSlots?.[offset + 1] ?? 0;
      targetSlots[offset + 2] = sourceSlots?.[offset + 2] ?? 0;
      targetSlots[offset + 3] = sourceSlots?.[offset + 3] ?? 0;
    }
    if (getPhaseSlotAuthority(targetSlots, offset) > PHASE_AUTHORITY_EPSILON) {
      activePhaseCount += 1;
    }
  }

  return activePhaseCount;
}
