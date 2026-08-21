import { describe, expect, it } from "vitest";
import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAINS,
  canonicalizeFieldCacheVoxelIndex,
  deriveFieldCacheVoxelRank,
  isFieldCacheVoxelInDomain,
  sortFieldCacheVoxelIndex,
} from "./fieldCacheGeometry.js";
import {
  CYMATIC_OBSERVER_APERTURE_PASSES,
  CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS,
  CYMATIC_OBSERVER_REFERENCE,
  CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS,
} from "./cymaticObserverReference.js";

const ORACLE_RESOLUTION = 12;
const ORACLE_LANES = 2;
const RADIUS = 3;
const f32 = Math.fround;

function scalarIndex([i, j, k]) {
  return i + ORACLE_RESOLUTION * (j + ORACLE_RESOLUTION * k);
}

function clampAndCanonicalize(voxel, domain) {
  const bounded = voxel.map((component) =>
    Math.max(0, Math.min(ORACLE_RESOLUTION - 1, component)),
  );
  return canonicalizeFieldCacheVoxelIndex(bounded, domain);
}

function createKernel(offsets, fwhmWorld) {
  const sigmaWorld = f32(fwhmWorld / (2 * Math.sqrt(2 * Math.LN2)));
  const cellWorld = f32(FIELD_CACHE_CELL_SIZE);
  const weights = new Map();
  let total = f32(0);
  for (const offset of offsets) {
    const offsetWorld = f32(f32(RADIUS * cellWorld) * f32(offset));
    const squared = f32(offsetWorld * offsetWorld);
    const denominator = f32(f32(sigmaWorld * sigmaWorld) * f32(-2));
    const weight = f32(Math.exp(f32(squared / denominator)));
    weights.set(offset, weight);
    total = f32(total + weight);
  }
  return { offsets, total, weights };
}

const FINE_KERNEL = createKernel(
  CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS,
  CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
);
const TOPOLOGY_KERNEL = createKernel(
  CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS,
  CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
);

function sourceLane(voxel, lane) {
  const [a, b, c] = sortFieldCacheVoxelIndex(voxel);
  if (lane === 0) {
    return f32(
      Math.sin((a + 1) * 0.73) +
        Math.cos((b + 1) * 0.31) -
        Math.sin((c + 1) * 0.17),
    );
  }
  return f32(
    Math.cos((a + 1) * 0.41) -
      Math.sin((b + 1) * 0.29) +
      Math.cos((c + 1) * 0.13),
  );
}

function createSource(domain) {
  const result = new Float32Array(ORACLE_RESOLUTION ** 3 * ORACLE_LANES);
  for (let k = 0; k < ORACLE_RESOLUTION; k += 1) {
    for (let j = 0; j < ORACLE_RESOLUTION; j += 1) {
      for (let i = 0; i < ORACLE_RESOLUTION; i += 1) {
        const voxel = [i, j, k];
        if (!isFieldCacheVoxelInDomain(domain, voxel)) continue;
        const base = scalarIndex(voxel) * ORACLE_LANES;
        for (let lane = 0; lane < ORACLE_LANES; lane += 1) {
          result[base + lane] = sourceLane(voxel, lane);
        }
      }
    }
  }
  return result;
}

function readLane(source, voxel, lane, domain) {
  const canonical = clampAndCanonicalize(voxel, domain);
  return source[scalarIndex(canonical) * ORACLE_LANES + lane];
}

function filterLane(source, voxel, lane, direction, domain) {
  const kernel = lane === 0 ? FINE_KERNEL : TOPOLOGY_KERNEL;
  let sum = f32(0);
  for (const offset of kernel.offsets) {
    const sampleVoxel = voxel.map(
      (component, axis) => component + direction[axis] * offset,
    );
    const weighted = f32(
      readLane(source, sampleVoxel, lane, domain) * kernel.weights.get(offset),
    );
    sum = f32(sum + weighted);
  }
  return f32(sum / kernel.total);
}

function filterPass(source, { direction, inputDomain, outputDomain }) {
  const result = new Float32Array(source.length);
  for (let k = 0; k < ORACLE_RESOLUTION; k += 1) {
    for (let j = 0; j < ORACLE_RESOLUTION; j += 1) {
      for (let i = 0; i < ORACLE_RESOLUTION; i += 1) {
        const voxel = [i, j, k];
        if (!isFieldCacheVoxelInDomain(outputDomain, voxel)) continue;
        const base = scalarIndex(voxel) * ORACLE_LANES;
        for (let lane = 0; lane < ORACLE_LANES; lane += 1) {
          result[base + lane] = filterLane(
            source,
            voxel,
            lane,
            direction,
            inputDomain,
          );
        }
      }
    }
  }
  return result;
}

function runFullAperture() {
  let field = createSource(FIELD_CACHE_DOMAINS.full);
  for (const pass of CYMATIC_OBSERVER_APERTURE_PASSES) {
    field = filterPass(field, {
      direction: pass.direction,
      inputDomain: FIELD_CACHE_DOMAINS.full,
      outputDomain: FIELD_CACHE_DOMAINS.full,
    });
  }
  return field;
}

function runSparseAperture() {
  let field = createSource(FIELD_CACHE_DOMAINS.fundamentalXyz);
  for (const pass of CYMATIC_OBSERVER_APERTURE_PASSES) {
    field = filterPass(field, pass);
  }
  return field;
}

function firstDerivative(source, voxel, axis, domain) {
  const sample = (offset) => {
    const candidate = [...voxel];
    candidate[axis] += offset;
    return readLane(source, candidate, 1, domain);
  };
  let result = f32(sample(3) - f32(sample(2) * f32(9)));
  result = f32(result + f32(sample(1) * f32(45)));
  result = f32(result - f32(sample(-1) * f32(45)));
  result = f32(result + f32(sample(-2) * f32(9)));
  result = f32(result - sample(-3));
  return f32(result * f32(1 / (60 * FIELD_CACHE_CELL_SIZE)));
}

function resolveTopology(source, voxel, domain) {
  return {
    potential: readLane(source, voxel, 1, domain),
    gradient: [0, 1, 2].map((axis) =>
      firstDerivative(source, voxel, axis, domain),
    ),
  };
}

describe("sparse field-cache Float32 oracle", () => {
  it("preserves both aperture scales across every reconstructed voxel", () => {
    const full = runFullAperture();
    const sparse = runSparseAperture();
    const maximumError = [0, 0];
    let nonzeroDifferences = 0;

    for (let k = 0; k < ORACLE_RESOLUTION; k += 1) {
      for (let j = 0; j < ORACLE_RESOLUTION; j += 1) {
        for (let i = 0; i < ORACLE_RESOLUTION; i += 1) {
          const voxel = [i, j, k];
          for (let lane = 0; lane < ORACLE_LANES; lane += 1) {
            const error = Math.abs(
              readLane(full, voxel, lane, FIELD_CACHE_DOMAINS.full) -
                readLane(
                  sparse,
                  voxel,
                  lane,
                  FIELD_CACHE_DOMAINS.fundamentalXyz,
                ),
            );
            maximumError[lane] = Math.max(maximumError[lane], error);
            nonzeroDifferences += error > 0 ? 1 : 0;
          }
        }
      }
    }

    expect(maximumError[0]).toBeLessThanOrEqual(1e-6);
    expect(maximumError[1]).toBeLessThanOrEqual(1e-6);
    // Exercise the axis-order reassociation instead of accidentally comparing
    // the same dense algorithm to itself.
    expect(nonzeroDifferences).toBeGreaterThan(0);
  });

  it("restores sparse resolved topology gradients in full-axis order", () => {
    const full = runFullAperture();
    const sparse = runSparseAperture();
    let maximumPotentialError = 0;
    let maximumGradientError = 0;

    for (let k = 0; k < ORACLE_RESOLUTION; k += 1) {
      for (let j = 0; j < ORACLE_RESOLUTION; j += 1) {
        for (let i = 0; i < ORACLE_RESOLUTION; i += 1) {
          const voxel = [i, j, k];
          const expected = resolveTopology(
            full,
            voxel,
            FIELD_CACHE_DOMAINS.full,
          );
          const canonicalVoxel = sortFieldCacheVoxelIndex(voxel);
          const stored = resolveTopology(
            sparse,
            canonicalVoxel,
            FIELD_CACHE_DOMAINS.fundamentalXyz,
          );
          const rank = deriveFieldCacheVoxelRank(voxel);
          const reconstructedGradient = rank.map(
            (sortedAxis) => stored.gradient[sortedAxis],
          );
          maximumPotentialError = Math.max(
            maximumPotentialError,
            Math.abs(expected.potential - stored.potential),
          );
          for (let axis = 0; axis < 3; axis += 1) {
            maximumGradientError = Math.max(
              maximumGradientError,
              Math.abs(expected.gradient[axis] - reconstructedGradient[axis]),
            );
          }
        }
      }
    }

    expect(maximumPotentialError).toBeLessThanOrEqual(1e-6);
    expect(maximumGradientError).toBeLessThanOrEqual(5e-5);
  });
});
