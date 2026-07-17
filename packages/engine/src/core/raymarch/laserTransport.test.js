import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LASER_DEFAULT_DIRECTION,
  LASER_REFERENCE_APPARATUS_PROFILE,
  LASER_TRANSPORT_RAY_GRID_SIZE,
  buildLaserRayBasis,
  computeExpectedDepositsPerVoxel,
  createRaymarchLaserTransportCache,
  computeRaymarchLaserTransportCache,
  deactivateRaymarchLaserTransportCache,
  depositLaserSampleTrilinearCpu,
  deriveLaserOrderPowerFractions,
  getLaserRayPhaseSamples,
  traceLaserTransportCpu,
} from "./laserTransport.js";
import { VOLUME_SHAPES } from "../volumeShape.js";

const RESOLUTION = 32;
const RAY_GRID = 64;
const STEPS = 48;

const zeroField = () => [0, 0, 0];

function commonTraceOptions(overrides = {}) {
  return {
    samplePressureGradient: zeroField,
    resolution: RESOLUTION,
    rayGridSize: RAY_GRID,
    steps: STEPS,
    mediumAbsorption: 0,
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

function irradianceStatsInRadialShell(result, innerRadius, outerRadius) {
  const values = [];
  for (let index = 0; index < result.irradiance.length; index += 1) {
    const [x, y, z] = voxelCenter(index, result.resolution);
    const radius = Math.hypot(x, y, z);
    if (radius >= innerRadius && radius < outerRadius) {
      values.push(result.irradiance[index]);
    }
  }
  values.sort((left, right) => left - right);
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  return {
    mean,
    p10: values[Math.floor(values.length * 0.1)],
  };
}

function sumVolume(volume) {
  let total = 0;
  for (const value of volume) {
    total += value;
  }
  return total;
}

describe("laser half-cycle sampling", () => {
  it("bounds the paired CIC source grid to the declared transport budget", () => {
    const formerNearestAtomicBudget = 128 ** 2;
    const pairedCicAtomicBudget = LASER_TRANSPORT_RAY_GRID_SIZE ** 2 * 2 * 8;

    expect(LASER_TRANSPORT_RAY_GRID_SIZE).toBe(96);
    expect(pairedCicAtomicBudget / formerNearestAtomicBudget).toBeCloseTo(
      9,
      12,
    );
  });

  it("pairs equal-power opposite signs at every ray origin", () => {
    const paired = getLaserRayPhaseSamples(true);

    expect(paired).toEqual([
      { fieldSign: 1, powerWeight: 0.5 },
      { fieldSign: -1, powerWeight: 0.5 },
    ]);
    expect(
      paired.reduce((total, sample) => total + sample.powerWeight, 0),
    ).toBe(1);
    expect(
      paired.reduce(
        (total, sample) => total + sample.fieldSign * sample.powerWeight,
        0,
      ),
    ).toBe(0);
    expect(getLaserRayPhaseSamples(false)).toEqual([
      { fieldSign: 1, powerWeight: 1 },
    ]);
  });

  it("does not bias one half-cycle on odd or even ray grids", () => {
    for (const rayGridSize of [7, 8, 9]) {
      const result = traceLaserTransportCpu(
        commonTraceOptions({
          resolution: 20,
          rayGridSize,
          steps: 32,
          samplePressureGradient: () => [0, 0.8, 0],
          deflectionGain: 0.3,
          phasePairing: true,
        }),
      );

      expect(
        Math.abs(result.transportDiagnostics.meanExitDirection[1]),
      ).toBeLessThan(1e-10);
    }
  });

  it("keeps the GPU trace independent of source-grid checkerboard parity", () => {
    const source = readFileSync(
      new URL("./laserTransport.js", import.meta.url),
      "utf8",
    );
    const traceKernel = source.slice(
      source.indexOf("function createTraceKernel"),
      source.indexOf("function createIrradianceResolveKernel"),
    );

    expect(traceKernel).not.toContain("rayX.add(rayY).bitAnd");
    expect(traceKernel).toContain("phaseSampleCount");
    expect(traceKernel).toContain("rayPowerWeight");
    expect(traceKernel).toContain("fixedSampleEnergy.sub(highXEnergy)");
    expect(traceKernel).toContain("xEnergy.sub(highYEnergy)");
    expect(traceKernel).toContain("yEnergy.sub(highZEnergy)");
  });
});

describe("laser CIC deposition", () => {
  it.each([
    ["interior", [0.13, -0.27, 0.41]],
    ["voxel junction", [0, 0, 0]],
    ["negative boundary", [-1, -1, -1]],
    ["positive boundary", [1, 1, 1]],
  ])("preserves sample energy at the %s", (_name, position) => {
    const resolution = 6;
    const deposits = new Float32Array(resolution ** 3);
    const sampleEnergy = 0.375;

    depositLaserSampleTrilinearCpu(
      deposits,
      position,
      resolution,
      sampleEnergy,
    );

    expect(sumVolume(deposits)).toBeCloseTo(sampleEnergy, 7);
  });

  it("distributes a voxel-junction sample equally across eight neighbors", () => {
    const resolution = 4;
    const deposits = new Float32Array(resolution ** 3);

    depositLaserSampleTrilinearCpu(deposits, [0, 0, 0], resolution, 1);

    expect([...deposits].filter((value) => value > 0)).toEqual(
      new Array(8).fill(0.125),
    );
  });
});

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
  it("derives complementary order powers from diffraction efficiency", () => {
    expect(deriveLaserOrderPowerFractions(0.12)).toEqual({
      zeroOrderPowerFraction: 0.88,
      diffractedPowerFraction: 0.12,
    });
    expect(deriveLaserOrderPowerFractions(-1)).toEqual({
      zeroOrderPowerFraction: 1,
      diffractedPowerFraction: 0,
    });
    expect(deriveLaserOrderPowerFractions(2)).toEqual({
      zeroOrderPowerFraction: 0,
      diffractedPowerFraction: 1,
    });
  });

  it("declares the fixed reference apparatus that owns transport constants", () => {
    expect(LASER_REFERENCE_APPARATUS_PROFILE).toMatchObject({
      semantic: "declared-reference-acousto-optic-apparatus",
      incidentIrradiance: 1,
      cavityDiameter: 2,
      zeroOrderPowerFraction: 0.88,
      diffractedPowerFraction: 0.12,
    });
    expect(
      LASER_REFERENCE_APPARATUS_PROFILE.zeroOrderPowerFraction +
        LASER_REFERENCE_APPARATUS_PROFILE.diffractedPowerFraction,
    ).toBe(1);
    expect(LASER_REFERENCE_APPARATUS_PROFILE.mediumAbsorption).toBeGreaterThan(
      0,
    );
    expect(
      LASER_REFERENCE_APPARATUS_PROFILE.maxAngularStepRadians,
    ).toBeGreaterThan(0);
    expect(Object.isFrozen(LASER_REFERENCE_APPARATUS_PROFILE)).toBe(true);
  });

  it("floods the cavity with unit irradiance when no field bends the rays", () => {
    const result = traceLaserTransportCpu(commonTraceOptions());

    // Central region of the straight-ray flood normalizes to ≈ 1.
    expect(meanIrradianceInBall(result, [0, 0, 0], 0.35)).toBeGreaterThan(0.85);
    expect(meanIrradianceInBall(result, [0, 0, 0], 0.35)).toBeLessThan(1.15);
    // Corners outside the sphere receive nothing.
    expect(meanIrradianceInBall(result, [0.95, 0.95, 0.95], 0.05)).toBe(0);
  });

  it("floods the cubic observation domain instead of retaining a spherical aperture", () => {
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        direction: LASER_DEFAULT_DIRECTION,
        volumeShape: VOLUME_SHAPES.cube,
      }),
    );
    const cornerIrradiance = meanIrradianceInBall(
      result,
      [0.9, 0.9, 0.9],
      0.08,
    );

    expect(cornerIrradiance).toBeGreaterThan(0.85);
    expect(cornerIrradiance).toBeLessThan(1.15);
    expect(result.volumeShape).toBe(VOLUME_SHAPES.cube);
  });

  it.each([20, 32, 40])(
    "keeps a straight-beam flood normalized through the spherical rim at %i³",
    (resolution) => {
      const result = traceLaserTransportCpu(
        commonTraceOptions({
          resolution,
          rayGridSize: resolution * 2,
        }),
      );
      const central = irradianceStatsInRadialShell(result, 0, 0.5);
      const rim = irradianceStatsInRadialShell(result, 0.95, 1);
      const wholeCavity = irradianceStatsInRadialShell(result, 0, 1);

      expect(central.mean).toBeGreaterThan(0.95);
      expect(central.mean).toBeLessThan(1.05);
      expect(rim.mean).toBeGreaterThan(0.95);
      expect(rim.mean).toBeLessThan(1.05);
      expect(rim.p10).toBeGreaterThan(0.9);
      expect(wholeCavity.mean).toBeGreaterThan(0.95);
      expect(wholeCavity.mean).toBeLessThan(1.05);
    },
  );

  it("is deterministic", () => {
    const first = traceLaserTransportCpu(commonTraceOptions());
    const second = traceLaserTransportCpu(commonTraceOptions());
    expect(second.irradiance).toEqual(first.irradiance);
  });

  it("conserves incident ray power at the closed cavity boundary", () => {
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        samplePressureGradient: (x, y, z) => [0, -0.35 * y, -0.35 * z],
        deflectionGain: 0.2,
        phasePairing: false,
      }),
    );

    expect(result.powerLedger.incidentPower).toBe(1);
    expect(result.powerLedger.absorbedPower).toBeCloseTo(0, 10);
    expect(result.powerLedger.unresolvedPower).toBeCloseTo(0, 10);
    expect(result.powerLedger.escapedPower).toBeCloseTo(1, 10);
    expect(result.powerLedger.forwardOutputPower).toBeCloseTo(1, 10);
    expect(result.powerLedger.nonForwardEscapePower).toBeCloseTo(0, 10);
    expect(
      result.powerLedger.forwardOutputPower +
        result.powerLedger.nonForwardEscapePower,
    ).toBeCloseTo(result.powerLedger.escapedPower, 10);
    expect(result.powerLedger.balanceError).toBeLessThan(1e-10);
    expect(result.transportDiagnostics.angularClampCount).toBe(0);
  });

  it("keeps total incident power invariant when half-cycle pairing is enabled", () => {
    const trace = (phasePairing) =>
      traceLaserTransportCpu(
        commonTraceOptions({
          rayGridSize: 15,
          samplePressureGradient: () => [0, 0.4, 0],
          deflectionGain: 0.2,
          phasePairing,
        }),
      );
    const singlePhase = trace(false);
    const pairedPhase = trace(true);

    expect(pairedPhase.rayCount).toBe(singlePhase.rayCount);
    for (const result of [singlePhase, pairedPhase]) {
      expect(result.powerLedger.incidentPower).toBe(1);
      expect(
        result.powerLedger.escapedPower +
          result.powerLedger.absorbedPower +
          result.powerLedger.unresolvedPower,
      ).toBeCloseTo(result.powerLedger.incidentPower, 10);
      expect(result.powerLedger.balanceError).toBeLessThan(1e-10);
    }
  });

  it("fails closed without a field sampler", () => {
    const result = traceLaserTransportCpu({
      samplePressureGradient: null,
      resolution: RESOLUTION,
    });
    expect(result.rayCount).toBe(0);
    expect(result.irradiance.every((value) => value === 0)).toBe(true);
    expect(result.transportDiagnostics).toMatchObject({
      zeroOrderPowerFraction: 0.88,
      diffractedPowerFraction: 0.12,
    });
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
        phasePairing: false,
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
    // Only the declared diffracted fraction is displaced. The transmitted
    // reference order carries the complementary power on axis, so the total
    // beam centroid moves by eta times the diffracted-order displacement.
    const eta = LASER_REFERENCE_APPARATUS_PROFILE.diffractedPowerFraction;
    expect(displacement).toBeGreaterThan(paraxial * eta * 0.4);
    expect(displacement).toBeLessThan(paraxial * eta * 2.5);
  });

  it("responds linearly to a common pressure-gradient scale", () => {
    const trace = (gradientScale) =>
      traceLaserTransportCpu(
        commonTraceOptions({
          samplePressureGradient: () => [0, gradientScale, 0],
          deflectionGain: 0.12,
          phasePairing: false,
          steps: 96,
        }),
      );
    const base = trace(0.2);
    const doubled = trace(0.4);
    const baseDeflection = base.transportDiagnostics.meanExitDirection[1];
    const doubledDeflection = doubled.transportDiagnostics.meanExitDirection[1];

    expect(base.transportDiagnostics.angularClampCount).toBe(0);
    expect(doubled.transportDiagnostics.angularClampCount).toBe(0);
    expect(doubledDeflection / baseDeflection).toBeGreaterThan(1.9);
    expect(doubledDeflection / baseDeflection).toBeLessThan(2.1);
  });

  it("converges under longitudinal step refinement", () => {
    const trace = (steps) =>
      traceLaserTransportCpu(
        commonTraceOptions({
          samplePressureGradient: () => [0, 0.3, 0],
          deflectionGain: 0.2,
          phasePairing: false,
          steps,
        }),
      );
    const coarse = trace(48);
    const medium = trace(96);
    const fine = trace(192);
    const lateralExitPosition = (result) =>
      result.transportDiagnostics.meanExitPosition[1];
    const coarseError = Math.abs(
      lateralExitPosition(coarse) - lateralExitPosition(fine),
    );
    const mediumError = Math.abs(
      lateralExitPosition(medium) - lateralExitPosition(fine),
    );

    expect(coarse.transportDiagnostics.angularClampCount).toBe(0);
    expect(medium.transportDiagnostics.angularClampCount).toBe(0);
    expect(fine.transportDiagnostics.angularClampCount).toBe(0);
    expect(mediumError).toBeLessThan(coarseError);
    expect(mediumError).toBeLessThan(0.01);
  });

  it("splits an oscillating grating into both caustic families", () => {
    const result = traceLaserTransportCpu(
      commonTraceOptions({
        samplePressureGradient: () => [0, 0.8, 0],
        deflectionGain: 0.3,
        phasePairing: true,
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
        phasePairing: false,
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

  it("reveals the carrier with a fixed energy-conserving reference/order split", () => {
    const options = commonTraceOptions({
      samplePressureGradient: (x, y, z) => [0, -2 * y, -2 * z],
      deflectionGain: 0.45,
      phasePairing: false,
    });
    const reference = traceLaserTransportCpu({
      ...options,
      samplePressureGradient: zeroField,
      diffractedPowerFraction: 1,
    });
    const diffracted = traceLaserTransportCpu({
      ...options,
      diffractedPowerFraction: 1,
    });
    const observed = traceLaserTransportCpu(options);
    const eta = LASER_REFERENCE_APPARATUS_PROFILE.diffractedPowerFraction;

    for (let index = 0; index < observed.irradiance.length; index += 97) {
      expect(observed.irradiance[index]).toBeCloseTo(
        observed.zeroOrderIrradiance[index] +
          observed.diffractedOrderIrradiance[index],
        6,
      );
      expect(observed.irradiance[index]).toBeCloseTo(
        reference.irradiance[index] * (1 - eta) +
          diffracted.irradiance[index] * eta,
        6,
      );
    }

    // The transmitted reference is a real optical power lane, not an
    // aesthetic floor. Because the diffracted contribution is nonnegative,
    // transport shadows cannot remove its complementary share of the beam.
    for (let index = 0; index < observed.irradiance.length; index += 1) {
      expect(observed.irradiance[index]).toBeGreaterThanOrEqual(
        reference.irradiance[index] * (1 - eta) - 1e-6,
      );
    }

    const observedFocus = meanIrradianceInBall(observed, [0.45, 0, 0], 0.12);
    const diffractedFocus = meanIrradianceInBall(
      diffracted,
      [0.45, 0, 0],
      0.12,
    );
    expect(observedFocus).toBeGreaterThan(1);
    expect(observedFocus).toBeLessThan(diffractedFocus);
    expect(observed.powerLedger.balanceError).toBeLessThan(1e-10);
  });

  it("uses the same complementary order split in the GPU resolve", () => {
    const source = readFileSync(
      new URL("./laserTransport.js", import.meta.url),
      "utf8",
    );
    const resolveKernel = source.slice(
      source.indexOf("function createIrradianceResolveKernel"),
      source.indexOf("export function createRaymarchLaserTransportCache"),
    );

    expect(resolveKernel).toContain("zeroOrderPowerFractionNode");
    expect(resolveKernel).toContain("diffractedPowerFractionNode");
    expect(resolveKernel).toContain("deriveLaserOrderPowerFractions");
    expect(resolveKernel).toContain("directTransmittance");
    expect(resolveKernel).toContain("diffractedIrradiance");
    expect(resolveKernel).toContain(
      "vec4(\n          resolvedIrradiance,\n          resolvedZeroOrderIrradiance,\n          resolvedDiffractedOrderIrradiance,\n          1.0,\n        )",
    );
  });
});

describe("attenuation", () => {
  it("retains analytic Beer-Lambert loss after estimator calibration", () => {
    const mediumAbsorption = 0.8;
    const result = traceLaserTransportCpu(
      commonTraceOptions({ mediumAbsorption }),
    );
    const entry = meanIrradianceInBall(result, [-0.5, 0, 0], 0.12);
    const exit = meanIrradianceInBall(result, [0.5, 0, 0], 0.12);

    expect(exit / entry).toBeCloseTo(Math.exp(-mediumAbsorption), 6);
    expect(result.powerLedger.unresolvedPower).toBeCloseTo(0, 10);
    expect(
      result.powerLedger.escapedPower + result.powerLedger.absorbedPower,
    ).toBeCloseTo(result.powerLedger.incidentPower, 10);
    expect(result.powerLedger.absorbedPower).toBeGreaterThan(0);
    expect(result.powerLedger.balanceError).toBeLessThan(1e-10);
  });

  it("does not reinterpret acoustic modal support as optical extinction", () => {
    const unsupported = traceLaserTransportCpu(
      commonTraceOptions({ sampleSupport: () => 0 }),
    );
    const supported = traceLaserTransportCpu(
      commonTraceOptions({ sampleSupport: () => 1 }),
    );

    expect(supported.irradiance).toEqual(unsupported.irradiance);
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
  it("fails closed without renderer or the refractive field texture", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    expect(computeRaymarchLaserTransportCache(cache, null, {})).toMatchObject({
      computed: false,
      reason: "renderer-unavailable",
    });
    expect(
      computeRaymarchLaserTransportCache(
        cache,
        { compute: () => {} },
        { fieldTexture: null },
      ),
    ).toMatchObject({ computed: false, reason: "field-texture-unavailable" });
    expect(cache.active).toBe(false);
    expect(cache.ready).toBe(false);
  });

  it("requires only the refractive field texture", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const computed = [];
    const result = computeRaymarchLaserTransportCache(
      cache,
      { compute: (node) => computed.push(node) },
      { fieldTexture: {} },
    );

    expect(result).toMatchObject({ computed: true, reason: "frame-current" });
    expect(computed.length).toBeGreaterThan(0);
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
      { fieldTexture: {} },
    );
    expect(result).toMatchObject({ computed: false, reason: "compute-failed" });
    expect(cache.backend).toBe("unavailable");
    expect(cache.lastError).toContain("no adapter");
    // Subsequent frames stay failed-closed without retry storms.
    expect(
      computeRaymarchLaserTransportCache(
        cache,
        { compute: () => {} },
        { fieldTexture: {} },
      ),
    ).toMatchObject({ computed: false, reason: "unavailable" });
  });

  it("computes through a renderer and reports readiness", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const computed = [];
    const result = computeRaymarchLaserTransportCache(
      cache,
      { compute: (node) => computed.push(node) },
      { fieldTexture: {} },
    );
    expect(result).toMatchObject({ computed: true, reason: "frame-current" });
    // The first frame builds the static straight-beam calibration, then runs
    // the current field through the same direct CIC resolve path.
    expect(computed).toHaveLength(6);
    computed.length = 0;
    expect(
      computeRaymarchLaserTransportCache(
        cache,
        { compute: (node) => computed.push(node) },
        { fieldTexture: {} },
      ),
    ).toMatchObject({ computed: true, reason: "frame-current" });
    // Steady state remains clear → trace → direct CIC resolve.
    expect(computed).toHaveLength(3);
    expect(cache.ready).toBe(true);
    expect(cache.active).toBe(true);
    expect(cache.calibrationReady).toBe(true);
  });

  it("rebuilds kernels when the live refractive field texture changes", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const first = computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture: { id: "field-a" } },
    );
    const firstKernels = cache.kernels;
    const second = computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture: { id: "field-b" } },
    );

    expect(first).toMatchObject({ computed: true });
    expect(second).toMatchObject({ computed: true });
    expect(cache.kernels).not.toBe(firstKernels);
  });

  it("rebuilds shape-specific transport and calibration kernels", () => {
    const cache = createRaymarchLaserTransportCache({
      resolution: 8,
      volumeShape: VOLUME_SHAPES.sphere,
    });
    const fieldTexture = { id: "field-stable" };
    computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture, volumeShape: VOLUME_SHAPES.sphere },
    );
    const sphereKernels = cache.kernels;
    const cubeDispatches = [];

    computeRaymarchLaserTransportCache(
      cache,
      { compute: (node) => cubeDispatches.push(node) },
      { fieldTexture, volumeShape: VOLUME_SHAPES.cube },
    );

    expect(cache.volumeShape).toBe(VOLUME_SHAPES.cube);
    expect(cache.kernels).not.toBe(sphereKernels);
    expect(cubeDispatches).toHaveLength(6);
  });

  it("reuses the direct CIC resolve kernel for stable input identity", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    const fieldTexture = { id: "field-stable" };
    const firstDispatches = [];
    computeRaymarchLaserTransportCache(
      cache,
      { compute: (node) => firstDispatches.push(node) },
      { fieldTexture },
    );
    const firstKernels = cache.kernels;
    const secondDispatches = [];
    computeRaymarchLaserTransportCache(
      cache,
      { compute: (node) => secondDispatches.push(node) },
      { fieldTexture },
    );

    expect(cache.kernels).toBe(firstKernels);
    expect(cache).not.toHaveProperty("tentIntermediateX");
    expect(cache).not.toHaveProperty("tentIntermediateY");
    expect(secondDispatches).toEqual(firstDispatches.slice(-3));
  });

  it("marks deactivated transport as not frame-current", () => {
    const cache = createRaymarchLaserTransportCache({ resolution: 8 });
    computeRaymarchLaserTransportCache(
      cache,
      { compute: () => {} },
      { fieldTexture: {} },
    );

    deactivateRaymarchLaserTransportCache(cache, "render-authority-reset");

    expect(cache.active).toBe(false);
    expect(cache.ready).toBe(false);
    expect(cache.lastComputeReason).toBe("render-authority-reset");
  });
});
