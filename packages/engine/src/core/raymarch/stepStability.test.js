import { describe, expect, it } from "vitest";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  deriveLowStepBloomGuard,
  deriveStableStepJitter,
  deriveStepCompensation,
  MIN_ADAPTIVE_STEPS,
  QUADRATURE_SPARSITY_STEP_THRESHOLD,
  STEP_REFERENCE,
} from "./stepStability.js";

describe("step stability", () => {
  it("keeps the reference step count neutral", () => {
    expect(deriveStepCompensation(STEP_REFERENCE)).toBe(1);
    expect(deriveLowStepBloomGuard(STEP_REFERENCE)).toBe(0);
  });

  it("applies only mild compensation at 64 steps", () => {
    expect(deriveStepCompensation(64)).toBeGreaterThan(1);
    expect(deriveStepCompensation(64)).toBeLessThanOrEqual(1.08);
    expect(deriveLowStepBloomGuard(64)).toBe(0);
  });

  it("keeps lower step compensation bounded", () => {
    expect(deriveStepCompensation(32)).toBeLessThanOrEqual(1.08);
    expect(deriveStepCompensation(16)).toBeLessThanOrEqual(1.08);
  });

  it("never boosts step counts above the reference", () => {
    expect(deriveStepCompensation(144)).toBe(1);
    expect(deriveStepCompensation(192)).toBe(1);
  });

  it("leaves the sealed presentation budget unguarded and ramps to the floor", () => {
    // The shipped budget carries hand-measured bloom values, so the guard must
    // not silently rescale them there. It only engages for budgets the user or
    // an adaptive profile drops below that measured point.
    const sealedBudget = RAYMARCH_DEFAULTS.raymarchSteps;

    expect(deriveLowStepBloomGuard(STEP_REFERENCE)).toBe(0);
    expect(deriveLowStepBloomGuard(MIN_ADAPTIVE_STEPS)).toBe(1);

    // The invariant: the shipped budget is never guarded, so hand-measured
    // bloom values are never silently rescaled. The guard band starts at the
    // quadrature threshold, which the shipped budget must stay at or above —
    // dropping it below would engage the guard on the sealed operating point.
    expect(sealedBudget).toBeGreaterThanOrEqual(
      QUADRATURE_SPARSITY_STEP_THRESHOLD,
    );
    expect(deriveLowStepBloomGuard(sealedBudget)).toBe(0);
    expect(deriveLowStepBloomGuard(QUADRATURE_SPARSITY_STEP_THRESHOLD)).toBe(0);
    expect(
      deriveLowStepBloomGuard(QUADRATURE_SPARSITY_STEP_THRESHOLD - 1),
    ).toBeGreaterThan(0);

    // The ramp spans the guard band, which now starts below the shipped budget
    // rather than at it.
    const midpoint = deriveLowStepBloomGuard(
      (QUADRATURE_SPARSITY_STEP_THRESHOLD + MIN_ADAPTIVE_STEPS) / 2,
    );
    expect(midpoint).toBeCloseTo(0.5);
  });

  it("returns the same jitter for the same local ray entry point", () => {
    const point = [0.42, -0.18, 0.91];
    const direction = [0.2, 0.4, -0.7];

    expect(deriveStableStepJitter(point, direction, 3)).toBeCloseTo(
      deriveStableStepJitter(point, direction, 3),
    );
  });

  it("keeps stable step jitter inside the sub-step interval", () => {
    const jitter = deriveStableStepJitter(
      [0.8, -0.3, 0.2],
      [0.5, 0.1, -0.6],
      3,
    );

    expect(jitter).toBeGreaterThanOrEqual(0);
    expect(jitter).toBeLessThan(1);
  });

  it("varies stable step jitter across nearby ray entries", () => {
    const left = deriveStableStepJitter([0.25, 0.18, 0.9], [0.1, 0.2, -0.8], 3);
    const right = deriveStableStepJitter(
      [0.27, 0.18, 0.9],
      [0.1, 0.2, -0.8],
      3,
    );

    expect(Math.abs(left - right)).toBeGreaterThan(0.01);
  });
});
