export const STEP_REFERENCE = 96;
export const LOW_STEP_BLOOM_GUARD_START = 64;
export const LOW_STEP_BLOOM_GUARD_RANGE = 48;
export const MAX_STEP_COMPENSATION = 1.08;
export const STEP_COMPENSATION_EXPONENT = 0.18;

export function clamp01(value) {
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
