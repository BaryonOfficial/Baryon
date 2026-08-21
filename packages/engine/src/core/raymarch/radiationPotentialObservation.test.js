import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { uniform, uniformArray, vec3 } from "three/tsl";
import {
  SPECTRAL_MOMENT_SUPPORT_EPSILON,
  WATER_CYMATIC_APPARATUS,
  accumulateSpectralMomentEvidence,
  evaluateAnalyticWaterRadiationPotentialNode,
  evaluateWaterRadiationPotentialSample,
  filterAdditiveSpectralMomentEvidence,
  resolveSpectralMomentEvidence,
} from "./radiationPotentialObservation.js";
import { evaluatePermutationFamilyMode } from "../modeFamily.js";
import { createSpectralMomentBasis } from "../../utils/audio/spectralPhase.js";
import { createFieldCacheBasisLookup } from "./fieldCacheBasisLookup.js";

describe("water radiation-potential observation", () => {
  it("declares the physical acoustic owner separately from laser presentation", () => {
    expect(WATER_CYMATIC_APPARATUS).toMatchObject({
      semantic: "cycle-averaged-gorkov-tracer-cymascope",
      sourceTopology: "centered-zero-mean-finite-volume-drive",
      acousticMedium: "water",
      tracer: "subwavelength-alpha-quartz-spheres",
      opticalDomain: "sealed-rigid-cubical-acoustic-cavity",
      representation:
        "complete-modal-gorkov-field-fixed-scale-space-persistent-topology-u0-observer",
      presentation:
        "camera-ordered-beer-lambert-integration-of-persistent-u0-plasma",
    });
  });

  it("places the rigid mineral tracer in a lower potential at a pressure node", () => {
    const mode = [{ u: 2, v: 2, w: 2, coefficient: 1 }];
    const pressureAntinode = evaluateWaterRadiationPotentialSample({
      modes: mode,
      x: 0,
      y: 0,
      z: 0,
    });
    const pressureNode = evaluateWaterRadiationPotentialSample({
      modes: mode,
      x: -0.5,
      y: 0,
      z: 0,
    });

    expect(pressureAntinode.pressureEnergy).toBeGreaterThan(0);
    expect(pressureAntinode.velocityEnergy).toBeCloseTo(0, 12);
    expect(pressureAntinode.radiationPotential).toBeGreaterThan(0);
    expect(pressureNode.pressureEnergy).toBeCloseTo(0, 12);
    expect(pressureNode.velocityEnergy).toBeGreaterThan(0);
    expect(pressureNode.radiationPotential).toBeLessThan(0);
  });

  it("adds distinct families as a convex cycle-averaged energy mixture", () => {
    const point = { x: 0.17, y: -0.31, z: 0.43 };
    const first = evaluateWaterRadiationPotentialSample({
      modes: [{ u: 0, v: 0, w: 2, coefficient: 1 }],
      ...point,
    });
    const second = evaluateWaterRadiationPotentialSample({
      modes: [{ u: 0, v: 2, w: 2, coefficient: 1 }],
      ...point,
    });
    const mixed = evaluateWaterRadiationPotentialSample({
      modes: [
        { u: 0, v: 0, w: 2, coefficient: Math.sqrt(0.25) },
        { u: 0, v: 2, w: 2, coefficient: Math.sqrt(0.75) },
      ],
      ...point,
    });

    expect(mixed.radiationPotential).toBeCloseTo(
      0.25 * first.radiationPotential + 0.75 * second.radiationPotential,
      12,
    );
  });

  it("squares exact-eigenvalue families only after their coherent shell sum", () => {
    const point = { x: 0.17, y: -0.31, z: 0.43 };
    const firstWeight = 1 / Math.sqrt(5);
    const secondWeight = 2 / Math.sqrt(5);
    const first = evaluatePermutationFamilyMode({
      u: 0,
      v: 0,
      w: 6,
      ...point,
      boundaryMode: "neumann",
    });
    const second = evaluatePermutationFamilyMode({
      u: 2,
      v: 4,
      w: 4,
      ...point,
      boundaryMode: "neumann",
    });
    const sample = evaluateWaterRadiationPotentialSample({
      modes: [
        {
          u: 0,
          v: 0,
          w: 6,
          coefficient: firstWeight,
          responseFrequencyHz: 355.2,
        },
        {
          u: 2,
          v: 4,
          w: 4,
          coefficient: secondWeight,
          responseFrequencyHz: 355.2,
        },
      ],
      ...point,
    });
    const coherentPressure =
      firstWeight * first.field + secondWeight * second.field;

    expect(sample.pressureEnergy).toBeCloseTo(coherentPressure ** 2, 12);
    expect(sample.pressureEnergy).not.toBeCloseTo(
      firstWeight ** 2 * first.field ** 2 +
        secondWeight ** 2 * second.field ** 2,
      6,
    );
  });

  it("coheres every natural shell driven at the same physical response frequency", () => {
    const point = { x: 0.17, y: -0.31, z: 0.43 };
    const first = evaluatePermutationFamilyMode({
      u: 0,
      v: 0,
      w: 2,
      ...point,
      boundaryMode: "neumann",
    });
    const second = evaluatePermutationFamilyMode({
      u: 0,
      v: 0,
      w: 4,
      ...point,
      boundaryMode: "neumann",
    });
    const cancellingCoefficient = -first.field / second.field;
    const independent = evaluateWaterRadiationPotentialSample({
      modes: [
        {
          u: 0,
          v: 0,
          w: 2,
          coefficient: 1,
          naturalFrequencyHz: 200,
          responseFrequencyHz: 300,
        },
        {
          u: 0,
          v: 0,
          w: 4,
          coefficient: cancellingCoefficient,
          naturalFrequencyHz: 400,
          responseFrequencyHz: 301,
        },
      ],
      ...point,
    });
    const sample = evaluateWaterRadiationPotentialSample({
      modes: [
        {
          u: 0,
          v: 0,
          w: 2,
          coefficientRe: 1,
          coefficientIm: 0,
          naturalFrequencyHz: 200,
          responseFrequencyHz: 300,
        },
        {
          u: 0,
          v: 0,
          w: 4,
          coefficientRe: cancellingCoefficient,
          coefficientIm: 0,
          naturalFrequencyHz: 400,
          responseFrequencyHz: 300,
        },
      ],
      ...point,
    });

    expect(independent.pressureEnergy).toBeGreaterThan(0);
    expect(sample.pressureEnergy).toBeCloseTo(0, 12);
  });

  it("preserves quadrature energy in the complex response packet", () => {
    const options = {
      u: 0,
      v: 0,
      w: 2,
      naturalFrequencyHz: 200,
      responseFrequencyHz: 200,
    };
    const real = evaluateWaterRadiationPotentialSample({
      modes: [{ ...options, coefficientRe: 1, coefficientIm: 0 }],
      x: 0.17,
      y: -0.31,
      z: 0.43,
    });
    const imaginary = evaluateWaterRadiationPotentialSample({
      modes: [{ ...options, coefficientRe: 0, coefficientIm: 1 }],
      x: 0.17,
      y: -0.31,
      z: 0.43,
    });

    expect(real.pressureEnergy).toBeGreaterThan(0);
    expect(imaginary.pressureEnergy).toBeCloseTo(real.pressureEnergy, 12);
    expect(imaginary.velocityEnergy).toBeCloseTo(real.velocityEnergy, 12);
  });

  it("normalizes acoustic velocity by the actual response frequency", () => {
    const options = {
      modes: [
        {
          u: 0,
          v: 0,
          w: 4,
          coefficient: 1,
          naturalFrequencyHz: 400,
        },
      ],
      x: 0.17,
      y: -0.31,
      z: 0.43,
    };
    const natural = evaluateWaterRadiationPotentialSample({
      ...options,
      modes: [{ ...options.modes[0], responseFrequencyHz: 400 }],
    });
    const subResonant = evaluateWaterRadiationPotentialSample({
      ...options,
      modes: [{ ...options.modes[0], responseFrequencyHz: 200 }],
    });

    expect(subResonant.velocityEnergy).toBeCloseTo(
      natural.velocityEnergy * 4,
      10,
    );
    expect(subResonant.pressureEnergy).toBeCloseTo(natural.pressureEnergy, 12);
  });

  it("returns a gradient matched to the represented scalar potential", () => {
    const options = {
      modes: [
        { u: 0, v: 0, w: 2, coefficient: 0.6 },
        { u: 0, v: 2, w: 4, coefficient: 0.8 },
      ],
      x: 0.17,
      y: -0.31,
      z: 0.43,
    };
    const sample = evaluateWaterRadiationPotentialSample(options);
    const epsilon = 1e-6;
    for (const [axis, key] of ["x", "y", "z"].entries()) {
      const low = evaluateWaterRadiationPotentialSample({
        ...options,
        [key]: options[key] - epsilon,
      }).radiationPotential;
      const high = evaluateWaterRadiationPotentialSample({
        ...options,
        [key]: options[key] + epsilon,
      }).radiationPotential;
      expect(sample.gradient[axis]).toBeCloseTo(
        (high - low) / (2 * epsilon),
        5,
      );
    }
  });

  it("builds one O(modes) analytic TSL traversal", () => {
    const basisLookup = createFieldCacheBasisLookup();
    const modes = uniformArray(
      [new THREE.Vector4(0, 2, 4, 1), new THREE.Vector4()],
      "vec4",
    );
    const coefficients = uniformArray(
      [new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4()],
      "vec4",
    );
    const potential = evaluateAnalyticWaterRadiationPotentialNode({
      voxelIndex: vec3(12, 47, 96),
      basisLookup: basisLookup.texture,
      modalFieldModeUniforms: modes,
      modalFieldCoefficientUniforms: coefficients,
      modalFieldActiveCount: uniform(1),
      boundaryMode: "neumann",
    });

    expect(potential.radiationPotential.isNode).toBe(true);
    const source = readFileSync(
      new URL("./radiationPotentialObservation.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "evaluatePermutationFamilyFieldGradientFromBasisLookupNode",
    );
    expect(source).toContain("family.gradient.mul(packet.x).mul(");
    expect(source).toContain("response.w");
    expect(source.match(/\bLoop\(/g)).toHaveLength(1);
    expect(source).not.toContain("fieldReconstructionWeight");
    basisLookup.dispose();
  });

  it("accumulates single-phase M1, M2, and W with q equal to S squared", () => {
    const evidence = accumulateSpectralMomentEvidence([
      { support: 2, basis: [1, 0, 1, 0] },
    ]);

    expect(evidence).toEqual({
      firstMoment: [4, 0],
      secondMoment: [4, 0],
      support: 4,
    });
    expect(resolveSpectralMomentEvidence(evidence)).toMatchObject({
      firstMoment: [1, 0],
      secondMoment: [1, 0],
    });
  });

  it("preserves the tritone axis when the first moment cancels", () => {
    const evidence = accumulateSpectralMomentEvidence([
      { support: 1, basis: createSpectralMomentBasis({ frequencyHz: 440 }) },
      {
        support: 1,
        basis: createSpectralMomentBasis({ frequencyHz: 440 * Math.SQRT2 }),
      },
    ]);
    const resolved = resolveSpectralMomentEvidence(evidence);

    expect(resolved.firstMoment[0]).toBeCloseTo(0, 12);
    expect(resolved.firstMoment[1]).toBeCloseTo(0, 12);
    expect(resolved.secondMoment[0]).toBeCloseTo(1, 12);
    expect(resolved.secondMoment[1]).toBeCloseTo(0, 12);
    expect(resolved.presence).toBeGreaterThan(0.99);
  });

  it("keeps twelve equal pitch classes neutral and permutation invariant", () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      support: 1,
      basis: createSpectralMomentBasis({
        frequencyHz: 440 * 2 ** (index / 12),
      }),
    }));
    const forward = accumulateSpectralMomentEvidence(samples);
    const reversed = accumulateSpectralMomentEvidence(samples.toReversed());

    expect(forward.support).toBe(12);
    expect(forward.firstMoment[0]).toBeCloseTo(0, 12);
    expect(forward.firstMoment[1]).toBeCloseTo(0, 12);
    expect(forward.secondMoment[0]).toBeCloseTo(0, 12);
    expect(forward.secondMoment[1]).toBeCloseTo(0, 12);
    expect(reversed.firstMoment[0]).toBeCloseTo(forward.firstMoment[0], 12);
    expect(reversed.firstMoment[1]).toBeCloseTo(forward.firstMoment[1], 12);
    expect(reversed.secondMoment[0]).toBeCloseTo(forward.secondMoment[0], 12);
    expect(reversed.secondMoment[1]).toBeCloseTo(forward.secondMoment[1], 12);
    expect(reversed.support).toBe(forward.support);
  });

  it("filters additive evidence before the sole normalization boundary", () => {
    const filtered = filterAdditiveSpectralMomentEvidence([
      { firstMoment: [1, 0], secondMoment: [1, 0], support: 1, weight: 1 },
      { firstMoment: [-1, 0], secondMoment: [1, 0], support: 9, weight: 1 },
    ]);
    const resolved = resolveSpectralMomentEvidence(filtered);

    expect(filtered).toEqual({
      firstMoment: [0, 0],
      secondMoment: [1, 0],
      support: 5,
    });
    expect(resolved.firstMoment).toEqual([0, 0]);
    expect(resolved.secondMoment[0]).toBeCloseTo(0.2, 12);
  });

  it("keeps zero and saturated support finite without denominator reconstruction", () => {
    const zero = resolveSpectralMomentEvidence({
      firstMoment: [0, 0],
      secondMoment: [0, 0],
      support: 0,
    });
    const saturated = resolveSpectralMomentEvidence({
      firstMoment: [1e20, 0],
      secondMoment: [0, -1e20],
      support: 1e20,
    });

    expect(SPECTRAL_MOMENT_SUPPORT_EPSILON).toBe(2 ** -16);
    expect(zero).toEqual({
      firstMoment: [0, 0],
      secondMoment: [0, 0],
      presence: 0,
    });
    expect(saturated.presence).toBe(1);
    expect(saturated.firstMoment).toEqual([1, 0]);
    expect(saturated.secondMoment).toEqual([0, -1]);
    expect(Object.values(saturated).flat().every(Number.isFinite)).toBe(true);
  });

  it("stores only finite bounded values at the half-float boundary", () => {
    const resolved = resolveSpectralMomentEvidence({
      firstMoment: [9, -12],
      secondMoment: [-20, 4],
      support: 0.25,
    });
    const packed = [
      ...resolved.firstMoment,
      ...resolved.secondMoment,
      resolved.presence,
    ].map((value) =>
      THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(value)),
    );

    expect(packed.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(packed[0], packed[1])).toBeLessThanOrEqual(1.001);
    expect(Math.hypot(packed[2], packed[3])).toBeLessThanOrEqual(1.001);
    expect(packed[4]).toBeGreaterThanOrEqual(0);
    expect(packed[4]).toBeLessThanOrEqual(1);
  });
});
