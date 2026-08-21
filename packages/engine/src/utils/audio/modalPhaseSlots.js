import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import { clamp01, smoothstep } from "../math.js";

const RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 1.25;
const SOURCE_COUPLED_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 0.65;
const RESONANT_PHASE_ATTACK = 0.32;
const RESONANT_PHASE_RELEASE = 0.9;
const SOURCE_COUPLED_PHASE_ATTACK = 0.22;
const SOURCE_COUPLED_PHASE_RELEASE = 0.84;

const PHASE_VELOCITY_BLEND = 0.18;
const PHASE_VELOCITY_RELEASE = 0.92;
const PHASE_AUTHORITY_MIN = 0.015;

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
 * imported by modal response and detector-integration diagnostics
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

function unwrapPhaseDeltaRad(previousPhase, nextPhase) {
  return normalizePhaseRad(nextPhase - previousPhase);
}

function getPhaseVelocityLimit(layer) {
  return layer === "resonant"
    ? RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC
    : SOURCE_COUPLED_PHASE_MAX_VELOCITY_RAD_PER_SEC;
}

function getPhaseAttack(layer) {
  return layer === "resonant"
    ? RESONANT_PHASE_ATTACK
    : SOURCE_COUPLED_PHASE_ATTACK;
}

function getPhaseRelease(layer) {
  return layer === "resonant"
    ? RESONANT_PHASE_RELEASE
    : SOURCE_COUPLED_PHASE_RELEASE;
}

/**
 * Smooths observer phase evidence for diagnostics and continuity scoring.
 * Its bounded velocity is not a physical modal response frequency and is
 * therefore never granted detector-integration authority.
 */
export function deriveObservedModalPhaseState({
  layer = "resonant",
  previous,
  observedPhaseRad,
  observedDrive,
  observationConfidence,
  observedSnr,
  observerCoherence,
  currentFrameAtMs,
  observationProfile,
  hardSilentFrame = false,
}) {
  const phase = normalizePhaseRad(observedPhaseRad ?? previous?.phase ?? 0);
  const previousPhase = Number.isFinite(previous?.phase)
    ? previous.phase
    : phase;
  const previousVelocity = Number.isFinite(previous?.phaseVelocityRadPerSec)
    ? previous.phaseVelocityRadPerSec
    : 0;
  const previousPhaseAtMs = Number.isFinite(previous?.lastPhaseObservedAtMs)
    ? previous.lastPhaseObservedAtMs
    : currentFrameAtMs;
  const deltaSeconds = Math.max(
    0,
    (currentFrameAtMs - previousPhaseAtMs) / 1000,
  );
  const velocityLimit = getPhaseVelocityLimit(layer);
  const rawVelocity =
    deltaSeconds > 0
      ? unwrapPhaseDeltaRad(previousPhase, phase) / deltaSeconds
      : previousVelocity;
  const boundedVelocity = Math.max(
    -velocityLimit,
    Math.min(velocityLimit, rawVelocity),
  );
  const confidenceGate = smoothstep(
    observationProfile.minObservationConfidence,
    observationProfile.minObservationConfidence *
      (layer === "resonant" ? 10 : 6),
    observationConfidence,
  );
  const driveGate = smoothstep(
    observationProfile.minObservedDrive * 0.45,
    observationProfile.minObservedDrive * (layer === "resonant" ? 4 : 3),
    observedDrive,
  );
  const snrGate = smoothstep(
    observationProfile.snrStart,
    observationProfile.snrFull,
    observedSnr,
  );
  const coherenceGate = smoothstep(
    observationProfile.minObservationCoherence * 0.55,
    observationProfile.minObservationCoherence,
    observerCoherence,
  );
  const phaseCoherenceTarget = clamp01(
    Math.max(snrGate, driveGate * 0.85) * coherenceGate,
  );
  const authorityTarget = clamp01(
    confidenceGate * driveGate * phaseCoherenceTarget,
  );
  const previousAuthority = clamp01(previous?.phaseAuthority ?? 0);
  if (hardSilentFrame) {
    return {
      phase,
      phaseOffsetRad: previous?.phaseOffsetRad ?? phase,
      phaseVelocityRadPerSec: previousVelocity * PHASE_VELOCITY_RELEASE,
      phaseCoherence: 0,
      phaseAuthority: 0,
      lastPhaseObservedAtMs: previousPhaseAtMs,
    };
  }

  const phaseAuthority =
    authorityTarget >= previousAuthority
      ? previousAuthority +
        (authorityTarget - previousAuthority) * getPhaseAttack(layer)
      : previousAuthority * getPhaseRelease(layer);
  const previousPhaseCoherence = clamp01(previous?.phaseCoherence ?? 0);
  const phaseCoherence =
    phaseCoherenceTarget >= previousPhaseCoherence
      ? previousPhaseCoherence +
        (phaseCoherenceTarget - previousPhaseCoherence) * 0.24
      : previousPhaseCoherence * 0.92;
  const phaseVelocityRadPerSec =
    phaseAuthority > PHASE_AUTHORITY_MIN
      ? previousVelocity +
        (boundedVelocity - previousVelocity) * PHASE_VELOCITY_BLEND
      : previousVelocity * PHASE_VELOCITY_RELEASE;
  const phaseOffsetRad = normalizePhaseRad(
    phase - phaseVelocityRadPerSec * (currentFrameAtMs / 1000),
  );

  return {
    phase,
    phaseOffsetRad,
    phaseVelocityRadPerSec,
    phaseCoherence,
    phaseAuthority: phaseAuthority > PHASE_AUTHORITY_MIN ? phaseAuthority : 0,
    lastPhaseObservedAtMs:
      authorityTarget > 0 ? currentFrameAtMs : previousPhaseAtMs,
  };
}

function findModalPhaseEntryForSlot(slots, offset, activeModes) {
  const modeKey = buildModalTopologyModeKey(
    slots[offset],
    slots[offset + 1],
    slots[offset + 2],
  );
  return activeModes?.get?.(modeKey) ?? null;
}

/**
 * Amplitude-and-authority-weighted mean modal angular velocity across the
 * given render slot sets.
 *
 * Phase evolves in a rotating frame anchored at this mean: uploading
 * `ω_m − ω̄` instead of `ω_m` removes the physically irrelevant common
 * carrier while preserving the exact relative angular velocities required by
 * finite-time detector integration. A display-rate renderer must not clamp
 * this physical quantity and later reuse the clamp as detector frequency.
 */
export function computePhaseAnchorAngularVelocityRadPerSec({
  slotSets,
  activeModes,
}) {
  let weightedAngularVelocitySum = 0;
  let weightSum = 0;

  for (const slotSet of slotSets ?? []) {
    const visibleSlots = slotSet?.visibleSlots;
    if (!visibleSlots?.length) {
      continue;
    }
    const slotLimit = Math.min(
      Math.max(0, Math.floor(slotSet?.capacity ?? 0)),
      Math.floor(visibleSlots.length / 4),
    );
    for (let index = 0; index < slotLimit; index += 1) {
      const offset = index * 4;
      const amplitude = visibleSlots[offset + 3] ?? 0;
      if (!(amplitude > 0)) {
        continue;
      }
      const entry = findModalPhaseEntryForSlot(
        visibleSlots,
        offset,
        activeModes,
      );
      const angularVelocityRadPerSec =
        entry?.modalOscillatorAngularVelocityRadPerSec;
      if (!Number.isFinite(angularVelocityRadPerSec)) {
        continue;
      }
      const authority = clamp01(entry?.modalOscillatorPhaseAuthority ?? 0);
      if (!(authority > 0)) {
        continue;
      }
      const weight = amplitude * authority;
      weightedAngularVelocitySum += weight * angularVelocityRadPerSec;
      weightSum += weight;
    }
  }

  return weightSum > 0 ? weightedAngularVelocitySum / weightSum : 0;
}

/**
 * Integrate the rotating-frame carrier as state. Recomputing `ω̄t` from a
 * changing weighted velocity would introduce a common phase jump whenever the
 * visible modal mixture changes; the physical reference phase is ∫ω̄(t)dt.
 */
export function advancePhaseAnchorState({
  previous = null,
  angularVelocityRadPerSec,
  observedAtSec,
}) {
  const angularVelocity = Number.isFinite(angularVelocityRadPerSec)
    ? angularVelocityRadPerSec
    : 0;
  const observationTime = Number.isFinite(observedAtSec) ? observedAtSec : 0;
  const hasPrevious =
    Number.isFinite(previous?.phaseRad) &&
    Number.isFinite(previous?.angularVelocityRadPerSec) &&
    Number.isFinite(previous?.observedAtSec) &&
    observationTime >= previous.observedAtSec;
  const phaseRad = hasPrevious
    ? normalizePhaseRad(
        previous.phaseRad +
          previous.angularVelocityRadPerSec *
            (observationTime - previous.observedAtSec),
      )
    : normalizePhaseRad(angularVelocity * observationTime);

  return {
    phaseRad,
    angularVelocityRadPerSec: angularVelocity,
    observedAtSec: observationTime,
  };
}

function resolvePhaseUpload(
  entry,
  anchorAngularVelocityRadPerSec,
  anchorPhaseRadAtObserved,
  phaseObservedAtSec,
) {
  const hasOscillatorPhase =
    Number.isFinite(entry?.modalOscillatorPhaseRad) &&
    Number.isFinite(entry?.modalOscillatorPhaseOffsetRad) &&
    Number.isFinite(entry?.modalOscillatorAngularVelocityRadPerSec);
  if (hasOscillatorPhase) {
    const phaseVelocityRadPerSec =
      entry.modalOscillatorAngularVelocityRadPerSec -
      anchorAngularVelocityRadPerSec;
    const entryObservedAtSec = entry.modalOscillatorPhaseObservedAtSec;
    let phaseOffsetRad = entry.modalOscillatorPhaseOffsetRad;
    if (
      Number.isFinite(anchorPhaseRadAtObserved) &&
      Number.isFinite(phaseObservedAtSec)
    ) {
      const labPhaseAtObservation = normalizePhaseRad(
        entry.modalOscillatorPhaseRad +
          entry.modalOscillatorAngularVelocityRadPerSec *
            (phaseObservedAtSec -
              (Number.isFinite(entryObservedAtSec)
                ? entryObservedAtSec
                : phaseObservedAtSec)),
      );
      phaseOffsetRad = normalizePhaseRad(
        labPhaseAtObservation -
          anchorPhaseRadAtObserved -
          phaseVelocityRadPerSec * phaseObservedAtSec,
      );
    } else if (Number.isFinite(entryObservedAtSec)) {
      // Stateless callers use the constant-carrier gauge α(t)=ω̄t. Stateful
      // engine paths pass the integrated anchor phase above.
      phaseOffsetRad = normalizePhaseRad(
        entry.modalOscillatorPhaseRad -
          anchorAngularVelocityRadPerSec * entryObservedAtSec -
          phaseVelocityRadPerSec * entryObservedAtSec,
      );
    }
    return {
      phaseOffsetRad,
      phaseVelocityRadPerSec,
      phaseCoherence: entry.modalOscillatorPhaseCoherence,
      phaseAuthority: entry.modalOscillatorPhaseAuthority,
    };
  }

  return {
    // The observer-derived fallback velocity is deliberately bounded for
    // temporal smoothing and is not a physical response frequency. Without
    // oscillator-owned angular velocity, detector coherence must fail closed
    // rather than manufacture a slow beat from that display-rate estimate.
    phaseOffsetRad: 0,
    phaseVelocityRadPerSec: 0,
    phaseCoherence: 0,
    phaseAuthority: 0,
  };
}

export function writePhaseSlotsForVisibleModes({
  target,
  visibleSlots,
  capacity,
  activeModes,
  anchorAngularVelocityRadPerSec = null,
  anchorPhaseRadAtObserved = null,
  phaseObservedAtSec = null,
}) {
  target?.fill?.(0);
  if (!target?.length || !visibleSlots?.length) {
    return 0;
  }

  const phaseAnchorAngularVelocityRadPerSec = Number.isFinite(
    anchorAngularVelocityRadPerSec,
  )
    ? anchorAngularVelocityRadPerSec
    : computePhaseAnchorAngularVelocityRadPerSec({
        slotSets: [{ visibleSlots, capacity }],
        activeModes,
      });
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
    );
    const phaseUpload = resolvePhaseUpload(
      phaseEntry,
      phaseAnchorAngularVelocityRadPerSec,
      anchorPhaseRadAtObserved,
      phaseObservedAtSec,
    );
    const authority = clamp01(phaseUpload.phaseAuthority ?? 0);
    target[offset] = normalizePhaseRad(phaseUpload.phaseOffsetRad ?? 0);
    // This slot is a physical rotating-frame angular velocity. It remains
    // diagnostic metadata; clipping it to a comfortable display rate would
    // still misreport the response frequency represented by the phase.
    target[offset + 1] = Number.isFinite(phaseUpload.phaseVelocityRadPerSec)
      ? phaseUpload.phaseVelocityRadPerSec
      : 0;
    target[offset + 2] = clamp01(phaseUpload.phaseCoherence ?? 0);
    target[offset + 3] = authority;
    if (authority > 0) {
      authoritativeCount += 1;
    }
  }

  return authoritativeCount;
}
