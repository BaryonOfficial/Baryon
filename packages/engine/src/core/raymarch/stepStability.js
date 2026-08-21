import { clamp01 } from "../../utils/math.js";

export const STEP_REFERENCE = 96;
export const MIN_ADAPTIVE_STEPS = 16;
// What bloom over-responds to at a small budget is camera-integration error,
// not the field: the emission profile is integrated analytically over each step
// interval, but a sparse quadrature can still leave isolated bright samples for
// the threshold to latch onto. The guard reaches full strength at the adaptive
// floor and is zero at any budget dense enough for that not to happen.
//
// This used to mirror RAYMARCH_DEFAULTS.raymarchSteps, because the shipped
// budget and the budget where sparsity starts to show were the same number.
// Raising the shipped budget to clear Nyquist along the ray separated them: the
// threshold is a property of the quadrature, not of whatever the current
// default happens to be, and moving it upward would newly suppress bloom at
// every adaptive rung between here and the new default without any measurement
// saying it should. The invariant a test still pins is the one that matters —
// the guard must be zero at the shipped budget, so it never silently rescales
// hand-measured bloom values.
export const QUADRATURE_SPARSITY_STEP_THRESHOLD = 40;
const LOW_STEP_BLOOM_GUARD_START = QUADRATURE_SPARSITY_STEP_THRESHOLD;
const LOW_STEP_BLOOM_GUARD_RANGE = Math.max(
  1,
  LOW_STEP_BLOOM_GUARD_START - MIN_ADAPTIVE_STEPS,
);
const MAX_STEP_COMPENSATION = 1.08;
const STEP_COMPENSATION_EXPONENT = 0.18;
const STABLE_STEP_JITTER_DIRECTION_WEIGHT = 0.61;
const STABLE_STEP_JITTER_PHASE_SCALE = 27.173;
const STABLE_STEP_JITTER_AMPLITUDE = 0.3995;
const STABLE_STEP_JITTER_BIAS = 0.5;
const STABLE_STEP_JITTER_SEED = Object.freeze([12.9898, 78.233, 37.719]);

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
