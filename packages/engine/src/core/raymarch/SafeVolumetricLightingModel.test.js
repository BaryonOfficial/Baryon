import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveCompositeGaussLegendreRaymarchSamples,
  integrateCompositeGaussLegendreRaymarch,
  integrateRadiativeTransferRay,
  integrateRadiativeTransferStep,
} from "./SafeVolumetricLightingModel.js";
import { resolveSpectralChromaticity } from "./spectralColorimetry.js";
import {
  compressDisplayRadiance,
  computeLinearLuminance,
} from "../../render/displayRadiance.js";

function readSource() {
  return readFileSync(
    new URL("./SafeVolumetricLightingModel.js", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

describe("safe volumetric lighting model", () => {
  it("confines complementary-sheet neutralization to genuine line-of-sight overlap", () => {
    const sheetColors = [
      resolveSpectralChromaticity([1, 0]),
      resolveSpectralChromaticity([-1, 0]),
    ];
    const renderPixel = (sheetAVisible, sheetBVisible) => {
      let transmittance = 1;
      const radiance = [0, 0, 0];
      for (const [visible, color] of [
        [sheetAVisible, sheetColors[0]],
        [sheetBVisible, sheetColors[1]],
      ]) {
        if (!visible) continue;
        const step = integrateRadiativeTransferStep({
          transmittance,
          baseSourceRadiance: color.map((channel) => channel * 4),
          extinction: 0.35,
          stepSize: 0.15,
        });
        for (let channel = 0; channel < 3; channel += 1) {
          radiance[channel] += step.segmentRadiance[channel];
        }
        transmittance = step.nextTransmittance;
      }
      return compressDisplayRadiance(radiance);
    };
    const saturation = (rgb) => {
      const maximum = Math.max(...rgb);
      return maximum > 0 ? (maximum - Math.min(...rgb)) / maximum : 0;
    };
    const outsideOverlapSaturations = [];
    let genuineOverlapPixelCount = 0;
    let activePixelCount = 0;
    let brightLowSaturationPixelCount = 0;
    const width = 96;
    const height = 64;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const normalizedX = (x + 0.5) / width;
        const normalizedY = (y + 0.5) / height;
        const sheetAVisible =
          (normalizedX - 0.31) ** 2 + (normalizedY - 0.5) ** 2 < 0.25 ** 2;
        const sheetBVisible =
          (normalizedX - 0.69) ** 2 + (normalizedY - 0.5) ** 2 < 0.25 ** 2;
        const sheetA = renderPixel(sheetAVisible, false);
        const sheetB = renderPixel(false, sheetBVisible);
        const combined = renderPixel(sheetAVisible, sheetBVisible);
        const sheetAActive = computeLinearLuminance(sheetA) > 0.004;
        const sheetBActive = computeLinearLuminance(sheetB) > 0.004;
        const combinedActive = computeLinearLuminance(combined) > 0.004;
        const combinedSaturation = saturation(combined);

        if (sheetAActive && sheetBActive) {
          genuineOverlapPixelCount += 1;
        } else if (combinedActive) {
          outsideOverlapSaturations.push(combinedSaturation);
        }
        if (combinedActive) {
          activePixelCount += 1;
          if (Math.max(...combined) >= 0.72 && combinedSaturation < 0.32) {
            brightLowSaturationPixelCount += 1;
          }
        }
      }
    }

    const outsideOverlapMeanSaturation =
      outsideOverlapSaturations.reduce((sum, value) => sum + value, 0) /
      Math.max(1, outsideOverlapSaturations.length);
    const outsideOverlapBrightLowSaturationRatio =
      outsideOverlapSaturations.filter((value) => value < 0.32).length /
      Math.max(1, outsideOverlapSaturations.length);
    const wholeFrameBrightLowSaturationRatio =
      brightLowSaturationPixelCount / Math.max(1, activePixelCount);

    expect(genuineOverlapPixelCount).toBeGreaterThan(0);
    expect(outsideOverlapSaturations.length).toBeGreaterThan(0);
    expect(outsideOverlapMeanSaturation).toBeGreaterThanOrEqual(0.5);
    expect(outsideOverlapBrightLowSaturationRatio).toBeLessThanOrEqual(0.02);
    expect(wholeFrameBrightLowSaturationRatio).toBeLessThanOrEqual(0.08);
  });

  it("uses one fixed-spacing two-point panel lattice with explicit even rounding", () => {
    const fullChord = deriveCompositeGaussLegendreRaymarchSamples({
      entryDistance: 1,
      exitDistance: 3,
      referenceLength: 2,
      sampleBudget: 16,
    });
    const halfChord = deriveCompositeGaussLegendreRaymarchSamples({
      entryDistance: 1,
      exitDistance: 2,
      referenceLength: 2,
      sampleBudget: 16,
    });
    const oddBudget = deriveCompositeGaussLegendreRaymarchSamples({
      entryDistance: 0,
      exitDistance: 2,
      referenceLength: 2,
      sampleBudget: 5,
    });
    const grazingChord = deriveCompositeGaussLegendreRaymarchSamples({
      entryDistance: 0,
      exitDistance: 0.05,
      referenceLength: 2,
      sampleBudget: 16,
    });

    expect(fullChord).toHaveLength(16);
    expect(halfChord).toHaveLength(8);
    expect(oddBudget).toHaveLength(6);
    expect(grazingChord).toHaveLength(2);
    expect(
      fullChord.reduce((sum, sample) => sum + sample.weight, 0),
    ).toBeCloseTo(2, 14);
    expect(
      oddBudget.reduce((sum, sample) => sum + sample.weight, 0),
    ).toBeCloseTo(2, 14);
    for (const sample of [
      ...fullChord,
      ...halfChord,
      ...oddBudget,
      ...grazingChord,
    ]) {
      expect(sample.distance).toBeGreaterThanOrEqual(0);
      expect(sample.distance).toBeLessThanOrEqual(3);
      expect(sample.weight).toBeGreaterThan(0);
    }
  });

  it("extends a ray with a partial panel without moving its shared sample lattice", () => {
    const shorterChord = deriveCompositeGaussLegendreRaymarchSamples({
      entryDistance: 0,
      exitDistance: 0.7,
      referenceLength: 2,
      sampleBudget: 16,
    });
    const longerChord = deriveCompositeGaussLegendreRaymarchSamples({
      entryDistance: 0,
      exitDistance: 0.8,
      referenceLength: 2,
      sampleBudget: 16,
    });

    expect(longerChord.slice(0, 4)).toEqual(shorterChord.slice(0, 4));
    expect(
      shorterChord.reduce((sum, sample) => sum + sample.weight, 0),
    ).toBeCloseTo(0.7, 14);
    expect(
      longerChord.reduce((sum, sample) => sum + sample.weight, 0),
    ).toBeCloseTo(0.8, 14);
  });

  it("integrates cubic source variation exactly with an even budget", () => {
    const integral = integrateCompositeGaussLegendreRaymarch({
      entryDistance: 0,
      exitDistance: 1,
      referenceLength: 1,
      sampleBudget: 8,
      sample: (distance) => distance ** 3 - 2 * distance + 4,
    });

    expect(integral).toBeCloseTo(3.25, 14);
  });

  it("resolves a smooth attenuated caustic source more accurately than midpoint at the same cost", () => {
    const sample = (distance) =>
      Math.exp(-0.4 * distance) *
      (1 + 0.2 * Math.cos(7 * distance) + 0.05 * distance ** 3);
    const sampleBudget = 8;
    const reference = integrateCompositeGaussLegendreRaymarch({
      entryDistance: 0,
      exitDistance: 1,
      referenceLength: 1,
      sampleBudget: 1024,
      sample,
    });
    const gaussLegendre = integrateCompositeGaussLegendreRaymarch({
      entryDistance: 0,
      exitDistance: 1,
      referenceLength: 1,
      sampleBudget,
      sample,
    });
    const midpoint = Array.from({ length: sampleBudget }, (_, index) =>
      sample((index + 0.5) / sampleBudget),
    ).reduce((sum, value) => sum + value / sampleBudget, 0);

    expect(Math.abs(gaussLegendre - reference)).toBeLessThan(
      Math.abs(midpoint - reference),
    );
  });

  it("observes the complete chord without a camera-facing section mask", () => {
    const ray = integrateRadiativeTransferRay({
      entryDistance: 0,
      exitDistance: 6,
      referenceLength: 6,
      sampleBudget: 40,
      sample: () => ({
        baseSourceRadiance: [1, 0.5, 0.25],
        accentSourceRadiance: [0, 0, 0],
        extinction: 0,
      }),
    });

    expect(ray.baseRadiance).toEqual([
      expect.closeTo(6, 12),
      expect.closeTo(3, 12),
      expect.closeTo(1.5, 12),
    ]);
    expect(ray.transmittance).toBe(1);

    const source = readSource();
    expect(source).not.toContain("deriveUnitAreaOpticalSectionWeightNode");
    expect(source).not.toContain("opticalSectionNormalLocal");
    expect(source).not.toContain("opticalSectionWeight");
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
    expect(source).toContain(
      "const accumulatedTransmittance = float(1).toVar()",
    );
    expect(source).toContain(
      "const localExtinction = float(opticalSample.extinction).toVar()",
    );
    expect(source).toContain("material.createOpticalTransferRaySampler");
    expect(source).not.toContain("scatteringNode");
    expect(source).not.toContain("constantExtinction");
    expect(source).toContain("const falloff = localExtinction");
    expect(source).toMatch(
      /const falloff = localExtinction\s+\.negate\(\)\s+\.mul\(sampleWeight\)\s+\.exp\(\)/,
    );
    expect(source).toContain("accumulatedTransmittance.mulAssign(falloff)");
    expect(source).toContain("GAUSS_LEGENDRE_TWO_POINT_OFFSET");
    expect(source).toContain("end: segmentPanelCount");
    expect(source).toContain("const targetPanelWidth =");
    expect(source).toContain("const localPanelWidth =");
    expect(source).not.toContain("deriveSampleCountDitherNode");
    expect(source).not.toContain("steps.mul(int(2))");
    expect(source).not.toContain("adaptiveStepMultiplier");
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

  it("integrates the same physical field from the camera end in either parameterization", () => {
    const integrateChord = ({ cameraAtRayStart }) =>
      integrateRadiativeTransferRay({
        entryDistance: 0,
        exitDistance: 2,
        referenceLength: 2,
        sampleBudget: 64,
        cameraAtRayStart,
        sample: (distance) => {
          const distanceFromCamera = cameraAtRayStart ? distance : 2 - distance;
          return {
            baseSourceRadiance: [Math.exp(-3 * distanceFromCamera), 0, 0],
            accentSourceRadiance: [0, 0, 0],
            extinction: 0.5 + 0.2 * distanceFromCamera,
          };
        },
      });

    const cameraFirst = integrateChord({ cameraAtRayStart: true });
    const cameraLast = integrateChord({ cameraAtRayStart: false });

    expect(cameraLast.baseRadiance[0]).toBeCloseTo(
      cameraFirst.baseRadiance[0],
      12,
    );
    expect(cameraLast.transmittance).toBeCloseTo(cameraFirst.transmittance, 12);

    const source = readSource();
    expect(source).toContain("const marchPanelIndex = mix(");
    expect(source).toContain("cameraAtRayStart");
    expect(source).not.toContain("attenuationOrigin");
  });

  it("lets carrier extinction suppress deeper emission instead of deleting depth", () => {
    const integrateLayers = ({ absorberInFront }) =>
      integrateRadiativeTransferRay({
        entryDistance: 0,
        exitDistance: 2,
        referenceLength: 2,
        sampleBudget: 2,
        cameraAtRayStart: true,
        sample: (distance) => {
          const isFront = distance < 1;
          const absorber = absorberInFront ? isFront : !isFront;
          return {
            baseSourceRadiance: absorber ? [0, 0, 0] : [1, 1, 1],
            accentSourceRadiance: [0, 0, 0],
            extinction: absorber ? 2 : 0,
          };
        },
      });

    const frontAbsorber = integrateLayers({ absorberInFront: true });
    const rearAbsorber = integrateLayers({ absorberInFront: false });

    expect(frontAbsorber.baseRadiance[0]).toBeGreaterThan(0);
    expect(frontAbsorber.baseRadiance[0]).toBeLessThan(
      rearAbsorber.baseRadiance[0],
    );
    expect(frontAbsorber.transmittance).toBeCloseTo(
      rearAbsorber.transmittance,
      12,
    );
  });

  it("uses one deterministic quadrature policy for both supported hulls", () => {
    const source = readSource();

    expect(source).toContain("const segmentPanelCount = int(");
    expect(source).toContain("const panelCenterDistance = entryDistance.add(");
    expect(source).toContain("const firstGaussDirection = mix(");
    expect(source).toContain(
      "accumulateSample(firstSampleDistance, gaussWeight)",
    );
    expect(source).toContain(
      "accumulateSample(secondSampleDistance, gaussWeight)",
    );
    expect(source).toContain("const intersectSphereDomain = () => {");
    expect(source).toContain("const intersectBoxDomain = () => {");
    expect(source).toContain("material.domainHalfExtentsNode");
    expect(source).not.toContain("screenCoordinate");
    expect(source).not.toContain("coreStepRadiusNode");
    expect(source).not.toContain("outerStepStretch");
  });
});
