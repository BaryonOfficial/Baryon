const DETAIL_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 1.25;
const BACKBONE_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 0.65;
const DETAIL_PHASE_ATTACK = 0.32;
const DETAIL_PHASE_RELEASE = 0.9;
const BACKBONE_PHASE_ATTACK = 0.22;
const BACKBONE_PHASE_RELEASE = 0.84;

export const PHASE_VELOCITY_BLEND = 0.18;
export const PHASE_VELOCITY_RELEASE = 0.92;
export const PHASE_AUTHORITY_MIN = 0.015;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function normalizePhaseRad(phase) {
  if (!Number.isFinite(phase)) {
    return 0;
  }
  let normalized = phase;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export function unwrapPhaseDeltaRad(previousPhase, nextPhase) {
  return normalizePhaseRad(nextPhase - previousPhase);
}

export function getPhaseVelocityLimit(layer) {
  return layer === "detail"
    ? DETAIL_PHASE_MAX_VELOCITY_RAD_PER_SEC
    : BACKBONE_PHASE_MAX_VELOCITY_RAD_PER_SEC;
}

export function getPhaseAttack(layer) {
  return layer === "detail" ? DETAIL_PHASE_ATTACK : BACKBONE_PHASE_ATTACK;
}

export function getPhaseRelease(layer) {
  return layer === "detail" ? DETAIL_PHASE_RELEASE : BACKBONE_PHASE_RELEASE;
}

function findModalPhaseEntryForSlot(slots, offset, activeModes, observedModes) {
  const modeKey = `${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`;
  return observedModes?.get?.(modeKey) ?? activeModes?.get?.(modeKey) ?? null;
}

export function writePhaseSlotsForVisibleModes({
  target,
  visibleSlots,
  capacity,
  activeModes,
  observedModes,
}) {
  target?.fill?.(0);
  if (!target?.length || !visibleSlots?.length) {
    return 0;
  }

  const slotLimit = Math.min(
    capacity,
    Math.floor(visibleSlots.length / 4),
    Math.floor(target.length / 4),
  );
  let authoritativeCount = 0;
  for (let index = 0; index < slotLimit; index += 1) {
    const offset = index * 4;
    if ((visibleSlots[offset + 3] ?? 0) <= 0) {
      continue;
    }
    const phaseEntry = findModalPhaseEntryForSlot(
      visibleSlots,
      offset,
      activeModes,
      observedModes,
    );
    const authority = clamp01(phaseEntry?.phaseAuthority ?? 0);
    if (authority <= 0) {
      continue;
    }
    target[offset] = normalizePhaseRad(phaseEntry.phaseOffsetRad ?? 0);
    target[offset + 1] = Math.max(
      -getPhaseVelocityLimit(phaseEntry.layer),
      Math.min(
        getPhaseVelocityLimit(phaseEntry.layer),
        phaseEntry.phaseVelocityRadPerSec ?? 0,
      ),
    );
    target[offset + 2] = clamp01(phaseEntry.phaseCoherence ?? 0);
    target[offset + 3] = authority;
    authoritativeCount += 1;
  }

  return authoritativeCount;
}
