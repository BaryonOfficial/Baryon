import { describe, expect, it } from "vitest";
import {
  deriveLowStepBloomGuard,
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
});
