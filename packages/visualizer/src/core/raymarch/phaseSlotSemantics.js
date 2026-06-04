import { normalizePhaseRad } from "../../utils/audio/modalPhaseSlots.js";

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const PHASE_AUTHORITY_EPSILON = 1e-4;
const PHASE_VELOCITY_GROUP_SCALE = 10;
const PHASE_UNIT_INTERVAL_HASH_SCALE = 1000;
const PHASE_OFFSET_HASH_SCALE = 1024;
const EFFECTIVE_PHASE_CONTRIBUTION_HASH_SCALE = 256;

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function getPhaseSlotAuthority(phaseSlots, offset) {
  return (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0);
}

function hasPhaseSlotAuthority(phaseSlots, offset) {
  return getPhaseSlotAuthority(phaseSlots, offset) > PHASE_AUTHORITY_EPSILON;
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

function getEffectivePhaseContributionHashKey(contribution) {
  const finiteContribution = Number.isFinite(contribution) ? contribution : 1;
  return Math.round(
    Math.min(1, Math.max(-1, finiteContribution)) *
      EFFECTIVE_PHASE_CONTRIBUTION_HASH_SCALE,
  );
}

function getOwnedPhaseOffsetRad(phaseSlots, offset) {
  if (!hasPhaseSlotAuthority(phaseSlots, offset)) {
    return 0;
  }
  return normalizePhaseRad(phaseSlots?.[offset] ?? 0);
}

function hashOwnedPhaseSlot(phaseSlots, offset, hash) {
  if (!hasPhaseSlotAuthority(phaseSlots, offset)) {
    let nextHash = hashUint32(getPhaseOffsetHashKey(0), hash);
    nextHash = hashUint32(getPhaseVelocityGroupKey(0), nextHash);
    nextHash = hashUint32(getUnitIntervalHashKey(0), nextHash);
    return hashUint32(getUnitIntervalHashKey(0), nextHash);
  }

  let nextHash = hashUint32(
    getPhaseOffsetHashKey(getOwnedPhaseOffsetRad(phaseSlots, offset)),
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
  let slotHash = FNV_OFFSET_BASIS;
  let activePhaseCount = 0;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (includeSlotIndex) {
      slotHash = hashUint32(slotIndex, slotHash);
    }
    slotHash = hashOwnedPhaseSlot(phaseSlots, offset, slotHash);
    if (hasPhaseSlotAuthority(phaseSlots, offset)) {
      activePhaseCount += 1;
    }
  }

  return {
    activePhaseCount,
    slotHash: slotHash >>> 0,
  };
}

function getModalBasisPhaseWeight(modalFieldSlots, offset) {
  if (!modalFieldSlots) {
    return 1;
  }
  return Math.max(0, modalFieldSlots?.[offset + 3] ?? 0);
}

function getModalBasisPhaseMotionContribution(phaseSlots, offset, time = 0) {
  if (!hasPhaseSlotAuthority(phaseSlots, offset)) {
    return 1;
  }

  const beta = Math.min(
    1,
    Math.max(
      0,
      (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0),
    ),
  );
  const phase =
    getOwnedPhaseOffsetRad(phaseSlots, offset) +
    (phaseSlots?.[offset + 1] ?? 0) * (Number.isFinite(time) ? time : 0);
  return 1 - beta + beta * Math.cos(normalizePhaseRad(phase));
}

export function getModalBasisStructuralCoefficient(modeSlots, offset) {
  return Math.max(0, modeSlots?.[offset + 3] ?? 0);
}

export function copyCanonicalRaymarchStructuralCoefficients({
  modeSlots,
  targetSlots,
  capacity,
  activeCount,
}) {
  if (!targetSlots) {
    return 0;
  }

  targetSlots.fill(0);
  const resolvedCapacity = Math.max(0, Math.floor(capacity ?? 0));
  const sourceSlotCount = Math.floor((modeSlots?.length ?? 0) / 4);
  const uploadLimit = Math.min(
    resolvedCapacity,
    sourceSlotCount,
    Math.max(0, Math.floor(activeCount ?? resolvedCapacity)),
  );

  for (let slotIndex = 0; slotIndex < uploadLimit; slotIndex += 1) {
    const offset = slotIndex * 4;
    targetSlots[offset] = getModalBasisStructuralCoefficient(modeSlots, offset);
  }

  return uploadLimit;
}

function getAggregatePhaseContributionHashKey(entry, totalContributionWeight) {
  return getEffectivePhaseContributionHashKey(
    entry.phaseMotionContributionNumerator /
      Math.max(Number.EPSILON, totalContributionWeight),
  );
}

export function buildRaymarchModalBasisPhaseSignature({
  phaseSlots,
  modalFieldSlots,
  activeCount,
  time = 0,
  isSlotContributing = null,
  getSlotIdentityKey = null,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const entriesByIdentity = new Map();

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (
      typeof isSlotContributing === "function" &&
      !isSlotContributing({ slots: modalFieldSlots, offset })
    ) {
      continue;
    }
    const contributionWeight = getModalBasisPhaseWeight(
      modalFieldSlots,
      offset,
    );
    if (!(contributionWeight > 0)) {
      continue;
    }
    const identityKey =
      typeof getSlotIdentityKey === "function"
        ? getSlotIdentityKey({ slots: modalFieldSlots, offset })
        : [slotIndex];
    const normalizedIdentityKey = Array.isArray(identityKey)
      ? identityKey
      : [identityKey];
    const aggregateKey = normalizedIdentityKey.join(":");
    const identityEntry = entriesByIdentity.get(aggregateKey) ?? {
      identityKey: normalizedIdentityKey,
      contributionWeight: 0,
      phaseMotionContributionNumerator: 0,
      hasPhaseAuthority: false,
    };
    identityEntry.contributionWeight += contributionWeight;
    identityEntry.phaseMotionContributionNumerator +=
      contributionWeight *
      getModalBasisPhaseMotionContribution(phaseSlots, offset, time);
    identityEntry.hasPhaseAuthority =
      identityEntry.hasPhaseAuthority ||
      hasPhaseSlotAuthority(phaseSlots, offset);
    if (!entriesByIdentity.has(aggregateKey)) {
      entriesByIdentity.set(aggregateKey, identityEntry);
    }
  }

  const entries = [];
  let totalContributionWeight = 0;
  for (const identityEntry of entriesByIdentity.values()) {
    totalContributionWeight += identityEntry.contributionWeight;
  }

  for (const identityEntry of entriesByIdentity.values()) {
    entries.push([
      ...identityEntry.identityKey,
      getAggregatePhaseContributionHashKey(
        identityEntry,
        totalContributionWeight,
      ),
    ]);
  }

  entries.sort((left, right) => {
    const entryLength = Math.max(left.length, right.length);
    for (let index = 0; index < entryLength; index += 1) {
      const leftValue = left[index] ?? 0;
      const rightValue = right[index] ?? 0;
      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }
    return 0;
  });

  let slotHash = FNV_OFFSET_BASIS;
  for (const entry of entries) {
    for (const value of entry) {
      slotHash = hashUint32(value, slotHash);
    }
  }

  return {
    activePhaseCount: Array.from(entriesByIdentity.values()).filter(
      (entry) => entry.hasPhaseAuthority,
    ).length,
    slotHash: slotHash >>> 0,
  };
}

export function copyCanonicalRaymarchPhaseSlots({
  sourceSlots,
  targetSlots,
  capacity,
  phaseEvaluationTimeSec = 0,
}) {
  if (!targetSlots) {
    return 0;
  }

  targetSlots.fill(0);
  let activePhaseCount = 0;
  const resolvedCapacity = Math.max(0, Math.floor(capacity ?? 0));
  const sourceSlotCount = Math.floor((sourceSlots?.length ?? 0) / 4);
  const slotLimit = Math.min(resolvedCapacity, sourceSlotCount);
  const time = Number.isFinite(phaseEvaluationTimeSec)
    ? phaseEvaluationTimeSec
    : 0;

  for (let slotIndex = 0; slotIndex < resolvedCapacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (slotIndex < slotLimit) {
      const phaseVelocityRadPerSec = sourceSlots?.[offset + 1] ?? 0;
      targetSlots[offset] = normalizePhaseRad(
        getOwnedPhaseOffsetRad(sourceSlots, offset) +
          phaseVelocityRadPerSec * time,
      );
      targetSlots[offset + 1] = phaseVelocityRadPerSec;
      targetSlots[offset + 2] = sourceSlots?.[offset + 2] ?? 0;
      targetSlots[offset + 3] = sourceSlots?.[offset + 3] ?? 0;
    }
    if (hasPhaseSlotAuthority(targetSlots, offset)) {
      activePhaseCount += 1;
    }
  }

  return activePhaseCount;
}
