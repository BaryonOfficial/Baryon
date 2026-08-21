import { describe, expect, it } from "vitest";
import { buildModalExcitationAtlas } from "../../utils/audio/modalExcitationAtlas.js";
import { evaluateWaterRadiationPotentialSample } from "./radiationPotentialObservation.js";
import {
  FIELD_CACHE_DOMAINS,
  canonicalizeFieldCacheVoxelIndex,
  clampAndCanonicalizeFieldCacheVoxelIndex,
  deriveFieldCacheVoxelRank,
  isFieldCacheVoxelInDomain,
  sortFieldCacheVoxelIndex,
} from "./fieldCacheGeometry.js";

const COORDINATE_PERMUTATIONS = Object.freeze([
  [0, 1, 2],
  [1, 0, 2],
  [0, 2, 1],
  [2, 1, 0],
  [1, 2, 0],
  [2, 0, 1],
]);

function buildModes(cavityGeometry) {
  return buildModalExcitationAtlas({ radius: 3, cavityGeometry }).map(
    (entry, index) => {
      const phase = (index * Math.PI * 2) / 17;
      return {
        u: entry.u,
        v: entry.v,
        w: entry.w,
        coefficient: 1 / (1 + Math.hypot(entry.u, entry.v, entry.w)),
        spectralMoment: [
          Math.cos(phase),
          Math.sin(phase),
          Math.cos(phase * 2),
          Math.sin(phase * 2),
        ],
      };
    },
  );
}

function evaluate(modes, [x, y, z], boundaryMode) {
  const sample = evaluateWaterRadiationPotentialSample({
    modes,
    x,
    y,
    z,
    boundaryMode,
  });
  return {
    field: sample.radiationPotential,
    gradient: sample.gradient,
    totalEnergy: sample.totalEnergy,
    spectralFirstMoment: sample.spectralFirstMoment,
    spectralSecondMoment: sample.spectralSecondMoment,
    spectralSupport: sample.spectralSupport,
  };
}

// The potential cache bakes only the fundamental domain i <= j <= k and
// reconstructs the other five sixths by symmetry. That is exact only while
// every mode is a symmetrised permutation family over an isotropic cavity. An
// anisotropic cavity would give the axes different wavenumbers and break it
// silently — the render would just be wrong. This is the guard.
describe("water radiation-potential permutation symmetry", () => {
  for (const cavityGeometry of ["rectangular", "spherical"]) {
    for (const boundaryMode of ["dirichlet", "neumann"]) {
      it(`holds for the ${cavityGeometry} cavity with ${boundaryMode} boundaries`, () => {
        const modes = buildModes(cavityGeometry);
        expect(modes.length).toBeGreaterThan(0);

        // A generic point: no two coordinates equal, none on a nodal plane.
        const point = [0.3137, -0.6421, 0.8053];
        const reference = evaluate(modes, point, boundaryMode);
        expect(Math.abs(reference.field)).toBeGreaterThan(1e-3);
        expect(reference.spectralSupport).toBeGreaterThan(0);

        for (const permutation of COORDINATE_PERMUTATIONS) {
          const permuted = permutation.map((axis) => point[axis]);
          const observed = evaluate(modes, permuted, boundaryMode);

          // Every source and resolved scalar lane copies unchanged.
          for (const scalar of ["field", "totalEnergy", "spectralSupport"]) {
            expect(observed[scalar]).toBeCloseTo(reference[scalar], 11);
          }
          for (const moment of [
            "spectralFirstMoment",
            "spectralSecondMoment",
          ]) {
            for (let component = 0; component < 2; component += 1) {
              expect(observed[moment][component]).toBeCloseTo(
                reference[moment][component],
                11,
              );
            }
          }
          for (let axis = 0; axis < 3; axis += 1) {
            // The topology gradient is the only spatial vector payload; it
            // must be unpermuted when the sparse resolved field is observed.
            expect(observed.gradient[axis]).toBeCloseTo(
              reference.gradient[permutation[axis]],
              11,
            );
          }
        }
      });
    }
  }
});

describe("fundamental-domain index mapping", () => {
  const samples = [
    [3, 7, 11],
    [11, 3, 7],
    [7, 11, 3],
    [5, 5, 9],
    [9, 5, 5],
    [5, 9, 5],
    [4, 4, 4],
    [0, 0, 111],
  ];

  it("sorts into the fundamental domain", () => {
    for (const voxel of samples) {
      const sorted = sortFieldCacheVoxelIndex(voxel);
      expect(sorted[0]).toBeLessThanOrEqual(sorted[1]);
      expect(sorted[1]).toBeLessThanOrEqual(sorted[2]);
      expect([...sorted].sort((a, b) => a - b)).toEqual(
        [...voxel].sort((a, b) => a - b),
      );
    }
  });

  it("ranks are a permutation even when indices tie", () => {
    for (const voxel of samples) {
      const rank = deriveFieldCacheVoxelRank(voxel);
      expect([...rank].sort()).toEqual([0, 1, 2]);
    }
  });

  it("rank recovers each axis from its sorted twin", () => {
    // This identity is what sparse observer reconstruction relies on: the
    // gradient component for axis b is the sorted component at rank[b].
    for (const voxel of samples) {
      const sorted = sortFieldCacheVoxelIndex(voxel);
      const rank = deriveFieldCacheVoxelRank(voxel);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(sorted[rank[axis]]).toBe(voxel[axis]);
      }
    }
  });

  it.each([
    FIELD_CACHE_DOMAINS.full,
    FIELD_CACHE_DOMAINS.fundamentalXyz,
    FIELD_CACHE_DOMAINS.halfYz,
    FIELD_CACHE_DOMAINS.halfXy,
  ])("clamps before selecting a canonical %s representative", (domain) => {
    for (const voxel of [
      [-8, 5, 140],
      [129, -2, 19],
      [127, 127, 127],
      [4, 91, 17],
    ]) {
      const bounded = voxel.map((component) =>
        Math.max(0, Math.min(127, component)),
      );
      const canonical = clampAndCanonicalizeFieldCacheVoxelIndex(voxel, domain);
      expect(canonical).toEqual(
        canonicalizeFieldCacheVoxelIndex(bounded, domain),
      );
      expect(isFieldCacheVoxelInDomain(domain, canonical)).toBe(true);
    }
  });
});
