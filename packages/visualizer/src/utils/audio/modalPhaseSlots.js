import { clamp01 } from "../math.js";

const RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 1.25;
const SOURCE_COUPLED_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 0.65;
const RESONANT_PHASE_ATTACK = 0.32;
const RESONANT_PHASE_RELEASE = 0.9;
const SOURCE_COUPLED_PHASE_ATTACK = 0.22;
const SOURCE_COUPLED_PHASE_RELEASE = 0.84;

export const PHASE_VELOCITY_BLEND = 0.18;
export const PHASE_VELOCITY_RELEASE = 0.92;
export const PHASE_AUTHORITY_MIN = 0.015;

const TWO_PI = Math.PI * 2;
// Largest finite phase magnitude for which `phase + Math.PI` does not lose
// the +π offset to FP rounding. At |phase| ≳ 1e16, π is smaller than the
// ULP of `phase`, so the closed-form modulo drifts outside [-π, π). The
// while-loop fallback below converges from any finite magnitude.
const CLOSED_FORM_PHASE_MAX_MAGNITUDE = 1e15;

/**
 * Reduce an angle (radians) to the canonical interval `[-π, π)`.
 *
 * Used as the canonical helper across the modal/raymarch pipeline:
 * imported by `modalResponse.js` and `core/raymarch/phaseSlotSemantics.js`
 * so the three former local copies cannot drift.
 *
 * The closed-form reduction is O(1) and accurate for `|phase| ≲ 1e15`;
 * larger magnitudes lose the `+π` offset to FP precision so we fall back
 * to a bounded while-loop reduction. Typical callers pass per-frame
 * deltas or `phase - velocity * t` for `t` in wall-clock seconds, where
 * even a multi-day session stays well below the closed-form ceiling.
 *
 * Boundary behaviour: returns `-π` (not `+π`) for input exactly `±π`.
 */
export function normalizePhaseRad(phase) {
  if (!Number.isFinite(phase)) {
    return 0;
  }
  if (Math.abs(phase) <= CLOSED_FORM_PHASE_MAX_MAGNITUDE) {
    return phase - Math.floor((phase + Math.PI) / TWO_PI) * TWO_PI;
  }
  let normalized = phase;
  while (normalized >= Math.PI) normalized -= TWO_PI;
  while (normalized < -Math.PI) normalized += TWO_PI;
  return normalized;
}

export function unwrapPhaseDeltaRad(previousPhase, nextPhase) {
  return normalizePhaseRad(nextPhase - previousPhase);
}

export function getPhaseVelocityLimit(layer) {
  return layer === "resonant"
    ? RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC
    : SOURCE_COUPLED_PHASE_MAX_VELOCITY_RAD_PER_SEC;
}

export function getPhaseAttack(layer) {
  return layer === "resonant"
    ? RESONANT_PHASE_ATTACK
    : SOURCE_COUPLED_PHASE_ATTACK;
}

export function getPhaseRelease(layer) {
  return layer === "resonant"
    ? RESONANT_PHASE_RELEASE
    : SOURCE_COUPLED_PHASE_RELEASE;
}

function getRenderPhaseLayer(entry) {
  return entry?.renderLayer ?? entry?.layer;
}

function findModalPhaseEntryForSlot(slots, offset, activeModes, observedModes) {
  const modeKey = `${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`;
  return observedModes?.get?.(modeKey) ?? activeModes?.get?.(modeKey) ?? null;
}

function resolvePhaseUpload(entry) {
  const hasOscillatorPhase =
    Number.isFinite(entry?.modalOscillatorPhaseRad) &&
    Number.isFinite(entry?.modalOscillatorPhaseOffsetRad) &&
    Number.isFinite(entry?.modalOscillatorAngularVelocityRadPerSec);
  if (hasOscillatorPhase) {
    const phaseVelocityRadPerSec = clampPhaseVelocity(
      entry.modalOscillatorAngularVelocityRadPerSec,
      entry,
    );
    const phaseOffsetRad = Number.isFinite(
      entry?.modalOscillatorPhaseObservedAtSec,
    )
      ? normalizePhaseRad(
          entry.modalOscillatorPhaseRad -
            phaseVelocityRadPerSec * entry.modalOscillatorPhaseObservedAtSec,
        )
      : entry.modalOscillatorPhaseOffsetRad;
    return {
      phaseOffsetRad,
      phaseVelocityRadPerSec,
      phaseCoherence: entry.modalOscillatorPhaseCoherence,
      phaseAuthority: entry.modalOscillatorPhaseAuthority,
    };
  }

  return {
    phaseOffsetRad: entry?.phaseOffsetRad,
    phaseVelocityRadPerSec: entry?.phaseVelocityRadPerSec,
    phaseCoherence: entry?.phaseCoherence,
    phaseAuthority: entry?.phaseAuthority,
  };
}

function clampPhaseVelocity(phaseVelocityRadPerSec, entry) {
  const phaseVelocity = Number.isFinite(phaseVelocityRadPerSec)
    ? phaseVelocityRadPerSec
    : 0;
  const phaseVelocityLimit = getPhaseVelocityLimit(getRenderPhaseLayer(entry));
  return Math.max(
    -phaseVelocityLimit,
    Math.min(phaseVelocityLimit, phaseVelocity),
  );
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
    const phaseUpload = resolvePhaseUpload(phaseEntry);
    const authority = clamp01(phaseUpload.phaseAuthority ?? 0);
    if (authority <= 0) {
      continue;
    }
    target[offset] = normalizePhaseRad(phaseUpload.phaseOffsetRad ?? 0);
    target[offset + 1] = clampPhaseVelocity(
      phaseUpload.phaseVelocityRadPerSec,
      phaseEntry,
    );
    target[offset + 2] = clamp01(phaseUpload.phaseCoherence ?? 0);
    target[offset + 3] = authority;
    authoritativeCount += 1;
  }

  return authoritativeCount;
}
