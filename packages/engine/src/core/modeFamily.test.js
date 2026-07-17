import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOUNDARY_MODES,
  PERMUTATION_ORDERS,
  evaluatePermutationFamilyMode,
  evaluateSinglePermutationMode,
  getBoundaryModeFromValue,
  getBoundaryModeValue,
  getPermutationFamily,
  getUniquePermutationCount,
  normalizeBoundaryMode,
} from "./modeFamily.js";

const estimateFamilyMeanSquare = ({
  u,
  v,
  w,
  boundaryMode,
  coefficient = 1,
  samplesPerAxis = 24,
}) => {
  let sum = 0;
  for (let xi = 0; xi < samplesPerAxis; xi += 1) {
    const x = -1 + (2 * (xi + 0.5)) / samplesPerAxis;
    for (let yi = 0; yi < samplesPerAxis; yi += 1) {
      const y = -1 + (2 * (yi + 0.5)) / samplesPerAxis;
      for (let zi = 0; zi < samplesPerAxis; zi += 1) {
        const z = -1 + (2 * (zi + 0.5)) / samplesPerAxis;
        const { field } = evaluatePermutationFamilyMode({
          u,
          v,
          w,
          x,
          y,
          z,
          scale: Math.PI,
          boundaryMode,
        });
        sum += (coefficient * field) ** 2;
      }
    }
  }
  return sum / samplesPerAxis ** 3;
};

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

  it("canonicalizes unsorted mode triples before classifying permutations", () => {
    expect(getUniquePermutationCount(1, 2, 1)).toBe(3);
    expect(getPermutationFamily(2, 1, 1)).toEqual(
      getPermutationFamily(1, 1, 2),
    );
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

  it("centers the Dirichlet basis on the rendered [-R, R] domain", () => {
    const radius = 3;
    const args = {
      u: 1,
      v: 1,
      w: 1,
      scale: Math.PI / radius,
      boundaryMode: BOUNDARY_MODES.dirichlet,
    };

    const center = evaluateSinglePermutationMode({
      ...args,
      x: 0,
      y: 0,
      z: 0,
    });
    const negativeFace = evaluateSinglePermutationMode({
      ...args,
      x: -radius,
      y: 0,
      z: 0,
    });
    const positiveFace = evaluateSinglePermutationMode({
      ...args,
      x: radius,
      y: 0,
      z: 0,
    });

    expect(center.field).toBeCloseTo(Math.SQRT2 ** 3, 6);
    expect(negativeFace.field).toBeCloseTo(0, 6);
    expect(positiveFace.field).toBeCloseTo(0, 6);
  });

  it("keeps the TSL Dirichlet basis shifted with the CPU basis", () => {
    const source = readFileSync(
      new URL("./modeFamilyNode.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("createCenteredDirichletArgumentNode");
    expect(source).toContain(
      "coordinate.mul(scale).add(float(Math.PI)).mul(float(0.5))",
    );
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

  it("gives every Neumann family unit mean-square basis energy", () => {
    for (const [u, v, w] of [
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [1, 2, 3],
    ]) {
      expect(
        estimateFamilyMeanSquare({
          u,
          v,
          w,
          boundaryMode: BOUNDARY_MODES.neumann,
        }),
      ).toBeCloseTo(1, 6);
    }
  });

  it("gives every Dirichlet family unit mean-square basis energy", () => {
    for (const [u, v, w] of [
      [1, 1, 1],
      [1, 1, 2],
      [1, 2, 3],
    ]) {
      expect(
        estimateFamilyMeanSquare({
          u,
          v,
          w,
          boundaryMode: BOUNDARY_MODES.dirichlet,
        }),
      ).toBeCloseTo(1, 6);
    }
  });

  it("makes squared coefficient magnitude equal represented modal energy", () => {
    const coefficient = 0.37;
    const representedEnergy = coefficient * coefficient;

    expect(
      estimateFamilyMeanSquare({
        u: 0,
        v: 0,
        w: 1,
        coefficient,
        boundaryMode: BOUNDARY_MODES.neumann,
      }),
    ).toBeCloseTo(representedEnergy, 6);
    expect(
      estimateFamilyMeanSquare({
        u: 1,
        v: 1,
        w: 1,
        coefficient,
        boundaryMode: BOUNDARY_MODES.neumann,
      }),
    ).toBeCloseTo(representedEnergy, 6);
  });

  it("keeps the TSL basis on the same energy-normalized convention", () => {
    const source = readFileSync(
      new URL("./modeFamilyNode.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("createDirichletBasisEnergyNormalizationNode");
    expect(source).toContain("createNeumannBasisEnergyNormalizationNode");
  });
});

describe("permutation family gradients", () => {
  const gradientTriples = [
    [0, 0, 1],
    [1, 1, 1],
    [1, 1, 2],
    [1, 2, 2],
    [1, 2, 3],
    [2, 3, 5],
  ];
  const samplePoints = [
    [0.21, -0.17, 0.39],
    [-0.62, 0.05, 0.88],
    [0.0, 0.47, -0.33],
  ];
  const step = 1e-5;

  const numericalGradient = (args, axis) => {
    const fieldAt = (delta) =>
      evaluatePermutationFamilyMode({
        ...args,
        [axis]: args[axis] + delta,
      }).field;
    return (fieldAt(step) - fieldAt(-step)) / (2 * step);
  };

  for (const boundaryMode of [
    BOUNDARY_MODES.dirichlet,
    BOUNDARY_MODES.neumann,
  ]) {
    it(`matches central-difference gradients for ${boundaryMode} families`, () => {
      for (const [u, v, w] of gradientTriples) {
        if (boundaryMode === BOUNDARY_MODES.dirichlet && u < 1) {
          continue;
        }
        for (const [x, y, z] of samplePoints) {
          const args = { u, v, w, x, y, z, scale: Math.PI, boundaryMode };
          const analytic = evaluatePermutationFamilyMode(args);
          expect(analytic.gradX).toBeCloseTo(numericalGradient(args, "x"), 4);
          expect(analytic.gradY).toBeCloseTo(numericalGradient(args, "y"), 4);
          expect(analytic.gradZ).toBeCloseTo(numericalGradient(args, "z"), 4);
        }
      }
    });
  }

  it("satisfies the Neumann zero-normal-derivative condition at the faces", () => {
    for (const x of [-1, 1]) {
      const face = evaluatePermutationFamilyMode({
        u: 2,
        v: 3,
        w: 4,
        x,
        y: 0.3,
        z: -0.5,
        scale: Math.PI,
        boundaryMode: BOUNDARY_MODES.neumann,
      });
      expect(face.gradX).toBeCloseTo(0, 6);
    }
  });
});

describe("GPU permutation-family mask parity", () => {
  // Plain-number mirror of createPermutationFamilySignature in
  // modeFamilyNode.js. The GPU derives per-term weights from smoothstep
  // equality masks and a positional weight list over
  // PERMUTATION_ORDERS.distinct; for integer mode indices the masks are
  // exactly 0 or 1 because unequal adjacent indices differ by at least 1,
  // far above the GPU's FAMILY_EPSILON. This sweep pins the positional
  // contract: reordering PERMUTATION_ORDERS.distinct would silently break
  // the GPU weight assignment even though the CPU side adapts, and this
  // test fails in that case.
  const signatureTermWeights = (u, v, w) => {
    const neqUV = u === v ? 0 : 1;
    const neqVW = v === w ? 0 : 1;
    const twoEqualUV = (1 - neqUV) * neqVW;
    const twoEqualVW = neqUV * (1 - neqVW);
    const allDistinct = neqUV * neqVW;
    return {
      termWeights: [
        1,
        twoEqualUV + allDistinct,
        twoEqualVW + allDistinct,
        twoEqualUV + allDistinct,
        twoEqualVW + allDistinct,
        allDistinct,
      ],
      uniquePermutationCount:
        1 + (twoEqualUV + twoEqualVW) * 2 + allDistinct * 5,
    };
  };

  const sortedTripleKeys = (triples) =>
    triples.map((triple) => triple.join(":")).sort();

  it("selects exactly the CPU permutation family for every canonical triple", () => {
    for (let u = 0; u <= 4; u += 1) {
      for (let v = u; v <= 4; v += 1) {
        for (let w = v; w <= 4; w += 1) {
          if (u + v + w === 0) {
            continue;
          }
          const { termWeights, uniquePermutationCount } = signatureTermWeights(
            u,
            v,
            w,
          );
          for (const weight of termWeights) {
            expect([0, 1]).toContain(weight);
          }
          expect(uniquePermutationCount).toBe(
            getUniquePermutationCount(u, v, w),
          );

          const triple = [u, v, w];
          const selected = PERMUTATION_ORDERS.distinct
            .filter((_, term) => termWeights[term] === 1)
            .map(([xIndex, yIndex, zIndex]) => [
              triple[xIndex],
              triple[yIndex],
              triple[zIndex],
            ]);
          expect(selected).toHaveLength(uniquePermutationCount);
          expect(sortedTripleKeys(selected)).toEqual(
            sortedTripleKeys(getPermutationFamily(u, v, w)),
          );
        }
      }
    }
  });
});
