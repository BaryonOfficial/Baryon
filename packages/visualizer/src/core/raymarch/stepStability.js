export const STEP_REFERENCE = 96;
export const MIN_ADAPTIVE_STEPS = 16;
const LOW_STEP_BLOOM_GUARD_START = 64;
const LOW_STEP_BLOOM_GUARD_RANGE = 48;
export const MAX_STEP_COMPENSATION = 1.08;
export const STEP_COMPENSATION_EXPONENT = 0.18;
const STABLE_STEP_JITTER_DIRECTION_WEIGHT = 0.61;
const STABLE_STEP_JITTER_PHASE_SCALE = 27.173;
const STABLE_STEP_JITTER_AMPLITUDE = 0.3995;
const STABLE_STEP_JITTER_BIAS = 0.5;
const STABLE_STEP_JITTER_SEED = Object.freeze([12.9898, 78.233, 37.719]);

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function normalizeStepBudget(steps) {
  return Math.max(1, Math.round(steps || 0));
}

export function deriveStepCompensation(steps) {
  const normalizedSteps = normalizeStepBudget(steps);
  const stepRatio = STEP_REFERENCE / normalizedSteps;
  if (stepRatio <= 1) {
    return 1;
  }

  return Math.min(
    MAX_STEP_COMPENSATION,
    Math.pow(stepRatio, STEP_COMPENSATION_EXPONENT),
  );
}

export function deriveLowStepBloomGuard(steps) {
  const normalizedSteps = normalizeStepBudget(steps);
  return clamp01(
    (LOW_STEP_BLOOM_GUARD_START - normalizedSteps) / LOW_STEP_BLOOM_GUARD_RANGE,
  );
}

export function deriveStableStepJitter(
  point,
  direction = [0, 0, 0],
  radius = 1,
) {
  const [x = 0, y = 0, z = 0] = point ?? [];
  const [dx = 0, dy = 0, dz = 0] = direction ?? [];
  const safeRadius = Math.max(1e-4, Math.abs(radius) || 0);
  const blendedX = x / safeRadius + dx * STABLE_STEP_JITTER_DIRECTION_WEIGHT;
  const blendedY = y / safeRadius + dy * STABLE_STEP_JITTER_DIRECTION_WEIGHT;
  const blendedZ = z / safeRadius + dz * STABLE_STEP_JITTER_DIRECTION_WEIGHT;
  const phase =
    (blendedX * STABLE_STEP_JITTER_SEED[0] +
      blendedY * STABLE_STEP_JITTER_SEED[1] +
      blendedZ * STABLE_STEP_JITTER_SEED[2]) *
    STABLE_STEP_JITTER_PHASE_SCALE;

  return clamp01(
    Math.sin(phase) * STABLE_STEP_JITTER_AMPLITUDE + STABLE_STEP_JITTER_BIAS,
  );
}
