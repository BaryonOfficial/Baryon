import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_INTEGRATION_MAX_STEP_MULTIPLIER,
  deriveAdaptiveRaymarchStepSize,
  deriveRaymarchSampleInterval,
  integrateRadiativeTransferStep,
} from "./SafeVolumetricLightingModel.js";

function readSource() {
  return readFileSync(
    new URL("./SafeVolumetricLightingModel.js", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

describe("safe volumetric lighting model", () => {
  it("samples the center of each bounded integration interval", () => {
    const first = deriveRaymarchSampleInterval({
      intervalStart: 1,
      intervalEnd: 1.23,
      nominalStepSize: 0.1,
      stepMultiplier: 1,
    });
    const tail = deriveRaymarchSampleInterval({
      intervalStart: 1.2,
      intervalEnd: 1.23,
      nominalStepSize: 0.1,
      stepMultiplier: 1,
    });

    expect(first).toEqual({
      stepSize: 0.1,
      sampleDistance: 1.05,
      nextIntervalStart: 1.1,
    });
    expect(tail.stepSize).toBeCloseTo(0.03);
    expect(tail.sampleDistance).toBeCloseTo(1.215);
    expect(tail.nextIntervalStart).toBeCloseTo(1.23);
  });

  it("refines high-error intervals without ever coarsening the base lattice", () => {
    const highError = deriveAdaptiveRaymarchStepSize({
      baseStepSize: 0.1,
      previousDensity: 0.1,
      currentDensity: 0.9,
    });
    const lowError = deriveAdaptiveRaymarchStepSize({
      baseStepSize: 0.1,
      previousDensity: 0.4,
      currentDensity: 0.401,
    });

    expect(highError.stepSize).toBeLessThan(0.1);
    expect(highError.stepSize).toBeGreaterThanOrEqual(0.05);
    expect(ADAPTIVE_INTEGRATION_MAX_STEP_MULTIPLIER).toBe(1);
    expect(lowError.stepSize).toBeCloseTo(0.1);
  });

  it("matches the exact homogeneous radiative-transfer step", () => {
    const step = integrateRadiativeTransferStep({
      transmittance: 0.8,
      baseSourceRadiance: [0.3, 0.15, 0.075],
      accentSourceRadiance: [0.1, 0.05, 0.025],
      extinction: 0.5,
      stepSize: 0.25,
    });
    const falloff = Math.exp(-0.5 * 0.25);
    const integral = (1 - falloff) / 0.5;

    expect(step.falloff).toBeCloseTo(falloff, 12);
    expect(step.segmentBaseRadiance).toEqual(
      [0.3, 0.15, 0.075].map((value) =>
        expect.closeTo(0.8 * value * integral, 12),
      ),
    );
    expect(step.segmentAccentRadiance).toEqual(
      [0.1, 0.05, 0.025].map((value) =>
        expect.closeTo(0.8 * value * integral, 12),
      ),
    );
    expect(step.segmentRadiance).toEqual(
      [0.4, 0.2, 0.1].map((value) =>
        expect.closeTo(0.8 * value * integral, 12),
      ),
    );
    expect(step.nextTransmittance).toBeCloseTo(0.8 * falloff, 12);
  });

  it("preserves color ratios through achromatic extinction", () => {
    const step = integrateRadiativeTransferStep({
      transmittance: 1,
      baseSourceRadiance: [0.8, 0.4, 0.2],
      accentSourceRadiance: [0, 0, 0],
      extinction: 1.4,
      stepSize: 0.6,
    });

    expect(step.segmentRadiance[0] / step.segmentRadiance[1]).toBeCloseTo(2);
    expect(step.segmentRadiance[1] / step.segmentRadiance[2]).toBeCloseTo(2);
  });

  it("converges to the same radiance under step subdivision", () => {
    const oneStep = integrateRadiativeTransferStep({
      transmittance: 1,
      baseSourceRadiance: [0.24, 0.12, 0.06],
      accentSourceRadiance: [0.08, 0.04, 0.02],
      extinction: 0.4,
      stepSize: 1,
    });
    const firstHalf = integrateRadiativeTransferStep({
      transmittance: 1,
      baseSourceRadiance: [0.24, 0.12, 0.06],
      accentSourceRadiance: [0.08, 0.04, 0.02],
      extinction: 0.4,
      stepSize: 0.5,
    });
    const secondHalf = integrateRadiativeTransferStep({
      transmittance: firstHalf.nextTransmittance,
      baseSourceRadiance: [0.24, 0.12, 0.06],
      accentSourceRadiance: [0.08, 0.04, 0.02],
      extinction: 0.4,
      stepSize: 0.5,
    });

    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        firstHalf.segmentRadiance[channel] +
          secondHalf.segmentRadiance[channel],
      ).toBeCloseTo(oneStep.segmentRadiance[channel], 12);
    }
    expect(secondHalf.nextTransmittance).toBeCloseTo(
      oneStep.nextTransmittance,
      12,
    );
  });

  it("contains no presentation, step-count, or chromatic visibility gains", () => {
    const source = readSource();
    const forbidden = [
      "OUTPUT_GAIN",
      "stepCompensation",
      "SOFT_KNEE",
      "EMISSION_SAMPLE_GAIN",
      "DIRECT_LIGHT_RESPONSE_GAIN",
      "SOURCE_ALBEDO_GAIN",
      "MEDIUM_CHROMATIC_ABSORPTION",
      "opacityGainNode",
      "composeEmissionContribution",
      "applySoftKneeCompression",
    ];

    for (const identifier of forbidden) {
      expect(source).not.toContain(identifier);
    }
    expect(source).toMatch(
      /const falloff = extinction\s*\.negate\(\)\s*\.mul\(currentStepSize\)\s*\.exp\(\)/,
    );
    expect(source).toContain(
      "const coverage = float(1.0).sub(transmittance).saturate()",
    );
    expect(source).toContain("raymarchCoverageNode.assign(coverage)");
    expect(source).toContain("raymarchOpacityNode.assign(coverage)");
    expect(source).toMatch(
      /raymarchLightNode\.assign\(\s*accumulatedBaseRadiance\.add\(accumulatedAccentRadiance\),?\s*\)/,
    );
    expect(source).toContain("raymarchTransmittanceNode.assign(transmittance)");
  });

  it("uses one deterministic spatial step policy for both supported hulls", () => {
    const source = readSource();

    expect(source).toMatch(
      /const sampleDistance = distTravelled\.add\(\s*currentStepSize\.mul\(0\.5\),?\s*\)/,
    );
    expect(source).toContain("const intersectSphereDomain = () => {");
    expect(source).toContain("const intersectBoxDomain = () => {");
    expect(source).toContain("material.domainHalfExtentsNode");
    expect(source).not.toContain("screenCoordinate");
    expect(source).not.toContain("coreStepRadiusNode");
    expect(source).not.toContain("outerStepStretch");
  });
});
