import { describe, expect, it } from "vitest";
import {
  copyCanonicalRaymarchPhaseCurrentCoefficients,
  getModalBasisPhaseCurrentCoefficient,
} from "./phaseSlotSemantics.js";

describe("raymarch phase slot semantics", () => {
  it("derives frame-current modal coefficients from canonical phase slots", () => {
    const modeSlots = new Float32Array([
      1, 0, 0, 0.8,
      2, 0, 0, 0.4,
    ]);
    const phaseSlots = new Float32Array([
      0, 0, 1, 1,
      Math.PI, 0, 1, 1,
    ]);
    const targetSlots = new Float32Array(8);

    expect(getModalBasisPhaseCurrentCoefficient(phaseSlots, 0, 0)).toBeCloseTo(
      1,
    );
    expect(getModalBasisPhaseCurrentCoefficient(phaseSlots, 4, 0)).toBeCloseTo(
      -1,
    );
    expect(
      copyCanonicalRaymarchPhaseCurrentCoefficients({
        modeSlots,
        phaseSlots,
        targetSlots,
        capacity: 2,
        activeCount: 2,
        time: 0,
      }),
    ).toBe(2);
    expect(targetSlots[0]).toBeCloseTo(0.8);
    expect(targetSlots[1]).toBe(0);
    expect(targetSlots[2]).toBe(0);
    expect(targetSlots[3]).toBe(0);
    expect(targetSlots[4]).toBeCloseTo(-0.4);
    expect(targetSlots[5]).toBe(0);
    expect(targetSlots[6]).toBe(0);
    expect(targetSlots[7]).toBe(0);
  });

  it("uses the raw modal amplitude when a slot has no phase authority", () => {
    const modeSlots = new Float32Array([1, 0, 0, 0.64]);
    const phaseSlots = new Float32Array([Math.PI, 20, 0, 0]);
    const targetSlots = new Float32Array(4);

    copyCanonicalRaymarchPhaseCurrentCoefficients({
      modeSlots,
      phaseSlots,
      targetSlots,
      capacity: 1,
      activeCount: 1,
      time: 12,
    });

    expect(targetSlots[0]).toBeCloseTo(0.64);
  });
});
