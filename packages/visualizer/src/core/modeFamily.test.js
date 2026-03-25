import { describe, expect, it } from "vitest";
import {
  BOUNDARY_MODES,
  evaluatePermutationFamilyMode,
  evaluateSinglePermutationMode,
  getBoundaryModeFromValue,
  getBoundaryModeValue,
  getPermutationFamily,
  getUniquePermutationCount,
  normalizeBoundaryMode,
} from "./modeFamily.js";

describe("mode family helpers", () => {
  it("normalizes boundary mode strings and numeric encodings", () => {
    expect(normalizeBoundaryMode("dirichlet")).toBe(BOUNDARY_MODES.dirichlet);
    expect(normalizeBoundaryMode("unexpected")).toBe(BOUNDARY_MODES.neumann);
    expect(getBoundaryModeValue("dirichlet")).toBe(0);
    expect(getBoundaryModeValue("neumann")).toBe(1);
    expect(getBoundaryModeFromValue(0)).toBe(BOUNDARY_MODES.dirichlet);
    expect(getBoundaryModeFromValue(1)).toBe(BOUNDARY_MODES.neumann);
  });

  it("counts unique permutations for canonical mode tuples", () => {
    expect(getUniquePermutationCount(1, 2, 3)).toBe(6);
    expect(getUniquePermutationCount(1, 1, 2)).toBe(3);
    expect(getUniquePermutationCount(2, 2, 2)).toBe(1);
  });

  it("returns only unique permutations for repeated indices", () => {
    expect(getPermutationFamily(1, 1, 2)).toEqual([
      [1, 1, 2],
      [1, 2, 1],
      [2, 1, 1],
    ]);
    expect(getPermutationFamily(1, 2, 2)).toEqual([
      [1, 2, 2],
      [2, 1, 2],
      [2, 2, 1],
    ]);
  });

  it("produces different family values for dirichlet and neumann boundaries", () => {
    const args = {
      u: 1,
      v: 2,
      w: 3,
      x: 0.18,
      y: -0.31,
      z: 0.42,
      scale: Math.PI,
    };

    const dirichlet = evaluatePermutationFamilyMode({
      ...args,
      boundaryMode: BOUNDARY_MODES.dirichlet,
    });
    const neumann = evaluatePermutationFamilyMode({
      ...args,
      boundaryMode: BOUNDARY_MODES.neumann,
    });

    expect(dirichlet.field).not.toBeCloseTo(neumann.field, 6);
    expect(dirichlet.gradX).not.toBeCloseTo(neumann.gradX, 6);
    expect(Number.isFinite(dirichlet.gradY)).toBe(true);
    expect(Number.isFinite(neumann.gradZ)).toBe(true);
  });

  it("normalizes family energy relative to the old single-term kernel", () => {
    const single = evaluateSinglePermutationMode({
      u: 1,
      v: 2,
      w: 3,
      x: 0.21,
      y: -0.17,
      z: 0.39,
      scale: Math.PI,
      boundaryMode: BOUNDARY_MODES.neumann,
    });
    const family = evaluatePermutationFamilyMode({
      u: 1,
      v: 2,
      w: 3,
      x: 0.21,
      y: -0.17,
      z: 0.39,
      scale: Math.PI,
      boundaryMode: BOUNDARY_MODES.neumann,
    });

    expect(family.permutationCount).toBe(6);
    expect(family.normalization).toBeCloseTo(1 / Math.sqrt(6));
    expect(Math.abs(family.field)).toBeLessThan(2.6);
    expect(
      Math.abs(family.field / Math.max(Math.abs(single.field), 1e-4)),
    ).toBeLessThan(8);
  });
});
