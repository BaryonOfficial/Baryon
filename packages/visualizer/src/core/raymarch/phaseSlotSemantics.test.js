import { describe, expect, it } from "vitest";
import {
  copyCanonicalRaymarchStructuralCoefficients,
  getModalBasisStructuralCoefficient,
} from "./phaseSlotSemantics.js";

describe("raymarch phase slot semantics", () => {
  it("keeps visible modal coefficients owned by structural amplitude, not phase current", () => {
    const modeSlots = new Float32Array([1, 0, 0, 0.8, 2, 0, 0, 0.4]);
    const targetSlots = new Float32Array(8);

    expect(getModalBasisStructuralCoefficient(modeSlots, 0)).toBeCloseTo(0.8);
    expect(getModalBasisStructuralCoefficient(modeSlots, 4)).toBeCloseTo(0.4);
    expect(
      copyCanonicalRaymarchStructuralCoefficients({
        modeSlots,
        targetSlots,
        capacity: 2,
        activeCount: 2,
      }),
    ).toBe(2);
    expect(targetSlots[0]).toBeCloseTo(0.8);
    expect(targetSlots[1]).toBe(0);
    expect(targetSlots[2]).toBe(0);
    expect(targetSlots[3]).toBe(0);
    expect(targetSlots[4]).toBeCloseTo(0.4);
    expect(targetSlots[5]).toBe(0);
    expect(targetSlots[6]).toBe(0);
    expect(targetSlots[7]).toBe(0);
  });

  it("uses the raw modal amplitude when a slot has no phase authority", () => {
    const modeSlots = new Float32Array([1, 0, 0, 0.64]);
    const targetSlots = new Float32Array(4);

    copyCanonicalRaymarchStructuralCoefficients({
      modeSlots,
      targetSlots,
      capacity: 1,
      activeCount: 1,
    });

    expect(targetSlots[0]).toBeCloseTo(0.64);
  });
});
