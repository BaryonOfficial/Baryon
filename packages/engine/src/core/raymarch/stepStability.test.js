import { describe, expect, it } from "vitest";
import {
  deriveLowStepBloomGuard,
  deriveStableStepJitter,
  deriveStepCompensation,
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

  it("raises the bloom guard only below 64 steps", () => {
    expect(deriveLowStepBloomGuard(64)).toBe(0);
    expect(deriveLowStepBloomGuard(32)).toBeCloseTo(2 / 3);
    expect(deriveLowStepBloomGuard(16)).toBe(1);
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
