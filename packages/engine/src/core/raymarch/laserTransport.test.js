import { describe, expect, it } from "vitest";
import {
  LASER_DEFAULT_DIRECTION,
  buildLaserRayBasis,
  computeExpectedDepositsPerVoxel,
  createRaymarchLaserTransportCache,
  computeRaymarchLaserTransportCache,
  deactivateRaymarchLaserTransportCache,
  traceLaserTransportCpu,
} from "./laserTransport.js";

const RESOLUTION = 32;
const RAY_GRID = 64;
const STEPS = 48;

const zeroField = () => [0, 0, 0];
const zeroSupport = () => 0;

function commonTraceOptions(overrides = {}) {
  return {
    samplePressureGradient: zeroField,
    sampleSupport: zeroSupport,
    resolution: RESOLUTION,
    rayGridSize: RAY_GRID,
    steps: STEPS,
    mediumAbsorption: 0,
    supportExtinction: 0,
    direction: [1, 0, 0],
    ...overrides,
  };
}

function voxelCenter(index, resolution) {
  const x = index % resolution;
  const y = Math.floor(index / resolution) % resolution;
  const z = Math.floor(index / (resolution * resolution));
  const toUnit = (v) => ((v + 0.5) / resolution) * 2 - 1;
  return [toUnit(x), toUnit(y), toUnit(z)];
}

function meanIrradianceInBall(result, center, radius) {
  let total = 0;
  let count = 0;
  for (let index = 0; index < result.irradiance.length; index += 1) {
    const [x, y, z] = voxelCenter(index, result.resolution);
    const dx = x - center[0];
    const dy = y - center[1];
    const dz = z - center[2];
    if (dx * dx + dy * dy + dz * dz <= radius * radius) {
      total += result.irradiance[index];
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

describe("laser ray basis", () => {
  it("builds an orthonormal frame for any beam direction", () => {
    for (const direction of [[1, 0, 0], [0, 1, 0], LASER_DEFAULT_DIRECTION]) {
      const { forward, tangent1, tangent2 } = buildLaserRayBasis(direction);
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(dot(forward, forward)).toBeCloseTo(1, 9);
      expect(dot(tangent1, tangent1)).toBeCloseTo(1, 9);
      expect(dot(tangent2, tangent2)).toBeCloseTo(1, 9);
      expect(dot(forward, tangent1)).toBeCloseTo(0, 9);
      expect(dot(forward, tangent2)).toBeCloseTo(0, 9);
      expect(dot(tangent1, tangent2)).toBeCloseTo(0, 9);
    }
  });
});

describe("laser transport through silence", () => {
  it("floods the cavity with unit irradiance when no field bends the rays", () => {
    const result = traceLaserTransportCpu(commonTraceOptions());

    // Central region of the straight-ray flood normalizes to ≈ 1.
    expect(meanIrradianceInBall(result, [0, 0, 0], 0.35)).toBeGreaterThan(0.85);
    expect(meanIrradianceInBall(result, [0, 0, 0], 0.35)).toBeLessThan(1.15);
    // Corners outside the sphere receive nothing.
    expect(meanIrradianceInBall(result, [0.95, 0.95, 0.95], 0.05)).toBe(0);
  });

  it("is deterministic", () => {
    const first = traceLaserTransportCpu(commonTraceOptions());
    const second = traceLaserTransportCpu(commonTraceOptions());
    expect(second.irradiance).toEqual(first.irradiance);
  });

  it("fails closed without a field sampler", () => {
    const result = traceLaserTransportCpu({
      samplePressureGradient: null,
      resolution: RESOLUTION,
    });
    expect(result.rayCount).toBe(0);
    expect(result.irradiance.every((value) => value === 0)).toBe(true);
  });
});

describe("acousto-optic deflection", () => {
  it("bends rays toward higher refractive index with paraxial magnitude", () => {
    // Constant lateral index gradient along +Y; single-sign field so the
    // whole beam deflects one way.
    const gradientStrength = 0.6;
    const deflectionGain = 0.25;
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        samplePressureGradient: () => [0, gradientStrength, 0],
        deflectionGain,
        oscillationParity: false,
      }),
    );

    // Compare the beam centroid in the exit half against the entry half:
    // paraxial optics displaces it by ~½·κ·|∇p|·L² over path L.
    let entrySum = 0;
    let entryWeight = 0;
    let exitSum = 0;
    let exitWeight = 0;
    for (let index = 0; index < result.irradiance.length; index += 1) {
      const [x, y] = voxelCenter(index, result.resolution);
      const weight = result.irradiance[index];
      if (x < -0.4) {
        entrySum += y * weight;
        entryWeight += weight;
      } else if (x > 0.4) {
        exitSum += y * weight;
        exitWeight += weight;
      }
    }
    const entryCentroidY = entrySum / Math.max(entryWeight, 1e-9);
    const exitCentroidY = exitSum / Math.max(exitWeight, 1e-9);
    const displacement = exitCentroidY - entryCentroidY;

    expect(displacement).toBeGreaterThan(0);
    // Path between the sampled halves is ~1.1 in unit-sphere units; accept
    // a broad band around ½·κ·g·L² since the beam clips the sphere.
    const paraxial = 0.5 * deflectionGain * gradientStrength * 1.1 ** 2;
    expect(displacement).toBeGreaterThan(paraxial * 0.4);
    expect(displacement).toBeLessThan(paraxial * 2.5);
  });

  it("splits an oscillating grating into both caustic families", () => {
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        samplePressureGradient: () => [0, 0.8, 0],
        deflectionGain: 0.3,
        oscillationParity: true,
      }),
    );

    // With alternating half-cycle signs the exit distribution is symmetric:
    // both deflected lobes are present, centroid stays near the axis.
    let exitSum = 0;
    let exitWeight = 0;
    for (let index = 0; index < result.irradiance.length; index += 1) {
      const [x, y] = voxelCenter(index, result.resolution);
      if (x > 0.4) {
        exitSum += y * result.irradiance[index];
        exitWeight += result.irradiance[index];
      }
    }
    expect(Math.abs(exitSum / Math.max(exitWeight, 1e-9))).toBeLessThan(0.05);
  });

  it("concentrates converging rays into a caustic focus above unit irradiance", () => {
    // Index highest on the beam axis (x-axis): n ∝ −(y² + z²) gives a
    // gradient-index lens; rays converge and pile up downstream.
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        samplePressureGradient: (x, y, z) => [0, -2 * y, -2 * z],
        deflectionGain: 0.45,
        oscillationParity: false,
      }),
    );

    const axisDownstream = meanIrradianceInBall(result, [0.45, 0, 0], 0.12);
    const offAxisDownstream = meanIrradianceInBall(
      result,
      [0.45, 0.55, 0],
      0.12,
    );
    expect(axisDownstream).toBeGreaterThan(1.6);
    expect(axisDownstream).toBeGreaterThan(offAxisDownstream * 2.5);

    let peak = 0;
    for (const value of result.irradiance) {
      peak = Math.max(peak, value);
    }
    expect(peak).toBeGreaterThan(2.5);
  });
});

describe("attenuation", () => {
  it("decays transmittance through acoustically dense support", () => {
    const supportExtinction = 1.6;
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        sampleSupport: () => 1,
        supportExtinction,
      }),
    );

    const front = meanIrradianceInBall(result, [-0.5, 0, 0], 0.2);
    const back = meanIrradianceInBall(result, [0.5, 0, 0], 0.2);
    expect(front).toBeGreaterThan(back * 2);
    // Beer–Lambert over the ~1.0 separation between probe centers.
    expect(back / front).toBeGreaterThan(
      Math.exp(-supportExtinction * 1.0) * 0.5,
    );
    expect(back / front).toBeLessThan(Math.exp(-supportExtinction * 1.0) * 2);
  });
});

describe("normalization", () => {
  it("scales expected deposits with ray count and step density", () => {
    const base = computeExpectedDepositsPerVoxel({
      rayGridSize: 64,
      steps: 48,
      resolution: 32,
    });
    const denser = computeExpectedDepositsPerVoxel({
      rayGridSize: 128,
      steps: 48,
      resolution: 32,
    });
    expect(base).toBeGreaterThan(0);
    expect(denser / base).toBeCloseTo(4, 1);
  });
});

describe("laser transport cache", () => {
  it("fails closed without renderer or field textures", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    expect(
      computeRaymarchLaserTransportCache(cache, null, {}),
    ).toMatchObject({ computed: false, reason: "renderer-unavailable" });
    expect(
      computeRaymarchLaserTransportCache(
        cache,
        { compute: () => {} },
        { fieldTexture: null, supportTexture: null },
      ),
    ).toMatchObject({ computed: false, reason: "field-textures-unavailable" });
    expect(cache.active).toBe(false);
    expect(cache.ready).toBe(false);
  });

  it("marks the cache unavailable when compute throws", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const result = computeRaymarchLaserTransportCache(
      cache,
      {
        compute: () => {
          throw new Error("no adapter");
        },
      },
      { fieldTexture: {}, supportTexture: {} },
    );
    expect(result).toMatchObject({ computed: false, reason: "compute-failed" });
    expect(cache.backend).toBe("unavailable");
    expect(cache.lastError).toContain("no adapter");
    // Subsequent frames stay failed-closed without retry storms.
    expect(
      computeRaymarchLaserTransportCache(
        cache,
        { compute: () => {} },
        { fieldTexture: {}, supportTexture: {} },
      ),
    ).toMatchObject({ computed: false, reason: "unavailable" });
  });

  it("computes through a renderer and reports readiness", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const computed = [];
    const result = computeRaymarchLaserTransportCache(
      cache,
      { compute: (node) => computed.push(node) },
      { fieldTexture: {}, supportTexture: {} },
    );
    expect(result).toMatchObject({ computed: true, reason: "frame-current" });
    // clear → trace → resolve, one dispatch each.
    expect(computed).toHaveLength(3);
    expect(cache.ready).toBe(true);
    expect(cache.active).toBe(true);
  });

  it("rebuilds kernels when either live field texture changes", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const fieldTexture = { id: "field-a" };
    const first = computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture, supportTexture: { id: "support-a" } },
    );
    const firstKernels = cache.kernels;
    const second = computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture, supportTexture: { id: "support-b" } },
    );

    expect(first).toMatchObject({ computed: true });
    expect(second).toMatchObject({ computed: true });
    expect(cache.kernels).not.toBe(firstKernels);
  });

  it("marks deactivated transport as not frame-current", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture: {}, supportTexture: {} },
    );

    deactivateRaymarchLaserTransportCache(cache, "render-authority-reset");

    expect(cache.active).toBe(false);
    expect(cache.ready).toBe(false);
    expect(cache.lastComputeReason).toBe("render-authority-reset");
  });
});
