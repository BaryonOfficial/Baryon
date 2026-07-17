import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  computeLinearLuminance,
  compressDisplayRadiance,
} from "../../render/displayRadiance.js";
import { deriveObservationTransfer } from "./observationTransfer.js";
import * as fieldShaping from "./fieldShaping.js";
import {
  BOUNDARY_CONTOUR_ACCENT_WEIGHT,
  BODY_DENSITY_MIX,
  BODY_DENSITY_GAIN,
  BODY_EXCITATION_VISIBILITY_POWER,
  CAUSTIC_BODY_MIX_MAX,
  CAUSTIC_BROAD_CONTOUR_LEAK_MAX,
  CAUSTIC_COLOR_DENSITY_DELTA_MAX,
  CANCELLATION_LUMINANCE_DROP_MIN,
  LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE,
  EMISSION_ROLLOFF_MIX,
  HIGHLIGHT_CONTOUR_ACCENT_WEIGHT,
  HOT_CORE_END,
  HOT_CORE_START,
  HOT_CORE_CROWDING_THRESHOLD_LIFT,
  HOT_CORE_SURFACE_CROWDING_REDUCTION,
  LATCHED_FOG_BODY_REDUCTION,
  MODAL_CROWDING_BODY_COMPRESSION,
  OPTICAL_COLOR_DENSITY_DELTA_MAX,
  OPTICAL_RECTANGULAR_STARTUP_IMPORT_DELTA_MAX,
  STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION,
  STRUCTURE_AWARE_EMISSION_MIN_GAIN,
  WHITE_EMISSION_CROWDING_REDUCTION,
  deriveCausticMaterialTransferProbe,
  deriveLaserCymaticOpticalProbe,
  deriveBodyDensity,
  deriveContourShape,
  deriveEmissionRolloff,
  deriveLatchedFogMask,
  deriveHolographicFresnel,
  deriveCrowdedHighlightMix,
  deriveCrowdedWhiteEmissionMix,
  deriveLiveSynthesisCancellationSuppression,
  deriveHotCoreCrowding,
  deriveHotCoreMix,
  deriveProjectedCausticRadianceDensity,
  deriveWhiteEmissionFieldAuthority,
  deriveModalCrowdingDensity,
  deriveStableContourAccent,
  deriveSignedInterferenceBodyAuthority,
  deriveSignedInterferenceRadianceAuthority,
  deriveSpectralLightProjectionWeight,
  deriveStructureAwareEmissionGain,
} from "./fieldShaping.js";
import { evaluateRaymarchSignedPotentialAtPoint } from "./fieldCache.js";

function mixTestColor(left, right, t) {
  return left.map((channel, index) => channel * (1 - t) + right[index] * t);
}

function saturationOf(color) {
  const max = Math.max(...color);
  if (max <= 1e-6) return 0;
  const min = Math.min(...color);
  return (max - min) / max;
}

function deriveFullCancellationRadianceAuthority() {
  return deriveSignedInterferenceRadianceAuthority({
    cancellation: 1,
    authority: 1,
    strength: 1,
  }).signedRadianceAuthority;
}

const REINFORCED_CAUSTIC_TONE = Object.freeze({
  fieldAbs: 0.002,
  threshold: 0.02,
  contourCore: 0.82,
  broadBand: 0.95,
  localGradientEvidence: 0.78,
  opticalConvergenceAuthority: 0.74,
  activeMask: 1,
  excitationVisibility: 0.9,
  signedRadianceAuthority: 1,
});

const CANCELED_CAUSTIC_TONE = Object.freeze({
  ...REINFORCED_CAUSTIC_TONE,
  signedRadianceAuthority: deriveFullCancellationRadianceAuthority(),
});

const BROAD_CONTOUR_LEAK = Object.freeze({
  fieldAbs: 0.002,
  threshold: 0.02,
  contourCore: 0.04,
  broadBand: 0.95,
  localGradientEvidence: 0.08,
  opticalConvergenceAuthority: 0.05,
  activeMask: 1,
  excitationVisibility: 0.9,
  signedRadianceAuthority: 1,
});

const DENSE_POLYPHONIC_PROBE = Object.freeze({
  fieldAbs: 0.006,
  threshold: 0.02,
  contourCore: 0.55,
  broadBand: 0.92,
  localGradientEvidence: 0.64,
  opticalConvergenceAuthority: 0.52,
  activeMask: 1,
  excitationVisibility: 0.82,
  signedRadianceAuthority: 0.55,
  colorWeight: 0.9,
});

function deriveFinalVisibilityProbe(sample) {
  const fieldAbs = Math.abs(sample.signedPotential) * 0.08;
  const body = deriveBodyDensity({
    // Normalize the fixture into the same low-field region where the material
    // currently turns near-zero field into broad body fill.
    fieldAbs,
    threshold: 0.15,
    edgeFade: 0.9,
    activeMask: 1,
    radialDistance: 0.45,
    boundaryMask: 0.05,
  });
  const finalRgb = compressDisplayRadiance(
    [0.72, 0.88, 1].map((channel) => channel * body.bodyDensity),
  );

  return {
    signedBodyAuthority: deriveSignedInterferenceBodyAuthority(fieldAbs),
    bodyDensity: body.bodyDensity,
    radiance: computeLinearLuminance(finalRgb),
  };
}

describe("field shaping", () => {
  describe("core and linked sheath carrier reference", () => {
    it("defines a narrow core with only a bounded linked sheath", () => {
      expect(fieldShaping.CYMATIC_CARRIER_REFERENCE_PROFILE).toMatchObject({
        coreFwhmWorld: 0.024,
        sheathWidthRatio: 2,
        coreEnergyWeight: 97,
        sheathEnergyWeight: 3,
      });
    });

    it("keeps core and sheath FWHM fixed in world space across field gradients", () => {
      const coreFwhmWorld = 0.04;
      const sheathFwhmWorld = 0.12;
      const gradients = [0.25, 2, 16];

      for (const gradientMagnitude of gradients) {
        const center = fieldShaping.deriveCoreAndLinkedSheathCarrier({
          fieldValue: 0,
          gradientMagnitude,
          coreFwhmWorld,
          sheathFwhmWorld,
          coreEnergyWeight: 9,
          sheathEnergyWeight: 1,
        });
        const coreHalfMaximum = fieldShaping.deriveCoreAndLinkedSheathCarrier({
          fieldValue: gradientMagnitude * (coreFwhmWorld / 2),
          gradientMagnitude,
          coreFwhmWorld,
          sheathFwhmWorld,
          coreEnergyWeight: 9,
          sheathEnergyWeight: 1,
        });
        const sheathHalfMaximum = fieldShaping.deriveCoreAndLinkedSheathCarrier(
          {
            fieldValue: gradientMagnitude * (sheathFwhmWorld / 2),
            gradientMagnitude,
            coreFwhmWorld,
            sheathFwhmWorld,
            coreEnergyWeight: 9,
            sheathEnergyWeight: 1,
          },
        );

        expect(center.gradientValid).toBe(true);
        expect(coreHalfMaximum.localFieldDistance).toBeCloseTo(
          coreFwhmWorld / 2,
        );
        expect(coreHalfMaximum.coreProfile / center.coreProfile).toBeCloseTo(
          0.5,
          10,
        );
        expect(
          sheathHalfMaximum.sheathProfile / center.sheathProfile,
        ).toBeCloseTo(0.5, 10);
      }
    });

    it("keeps the normalized core and sheath energy split constant", () => {
      const coreFwhmWorld = 0.04;
      const sheathFwhmWorld = 0.12;
      const coreEnergyWeight = 97;
      const sheathEnergyWeight = 3;
      const sampleStepWorld = 0.0005;
      const sampleLimitWorld = sheathFwhmWorld * 5;

      for (const gradientMagnitude of [0.25, 4]) {
        let coreEnergy = 0;
        let sheathEnergy = 0;
        for (
          let worldPosition = -sampleLimitWorld;
          worldPosition <= sampleLimitWorld;
          worldPosition += sampleStepWorld
        ) {
          const carrier = fieldShaping.deriveCoreAndLinkedSheathCarrier({
            fieldValue: gradientMagnitude * worldPosition,
            gradientMagnitude,
            coreFwhmWorld,
            sheathFwhmWorld,
            coreEnergyWeight,
            sheathEnergyWeight,
          });
          coreEnergy += carrier.coreEnergyDensity * sampleStepWorld;
          sheathEnergy += carrier.sheathEnergyDensity * sampleStepWorld;
        }

        const totalEnergy = coreEnergy + sheathEnergy;
        expect(coreEnergy / totalEnergy).toBeCloseTo(0.97, 4);
        expect(sheathEnergy / totalEnergy).toBeCloseTo(0.03, 4);
        expect(totalEnergy).toBeCloseTo(1, 4);
      }
    });

    it("provides a normalized Gaussian average over a finite world-space interval", () => {
      const fwhmWorld = 0.04;
      const pointProfile = fieldShaping.deriveFixedWorldSpaceCarrierProfiles({
        localFieldDistance: 0,
        coreFwhmWorld: fwhmWorld,
        sheathFwhmWorld: fwhmWorld * 3,
      });
      const zeroWidth = fieldShaping.deriveNormalizedGaussianIntervalAverage({
        localFieldDistance: 0,
        intervalWidthWorld: 0,
        fwhmWorld,
      });
      const fullProfile = fieldShaping.deriveNormalizedGaussianIntervalAverage({
        localFieldDistance: 0,
        intervalWidthWorld: fwhmWorld * 10,
        fwhmWorld,
      });

      expect(zeroWidth.intervalAverage).toBeCloseTo(
        pointProfile.coreProfile,
        12,
      );
      expect(fullProfile.intervalEnergy).toBeCloseTo(1, 7);
      expect(
        fullProfile.intervalAverage * fullProfile.intervalWidthWorld,
      ).toBeCloseTo(fullProfile.intervalEnergy, 12);
    });

    it("fails closed for zero or non-finite local gradients", () => {
      const degenerateDistance = fieldShaping.deriveLocalFieldDistance({
        fieldValue: 1,
        gradientMagnitude: 0,
        gradientEpsilon: 1e-6,
      });
      expect(degenerateDistance.gradientValid).toBe(false);
      expect(degenerateDistance.localFieldDistance).toBe(1e6);
      expect(Number.isFinite(degenerateDistance.localFieldDistance)).toBe(true);

      for (const gradientMagnitude of [
        0,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]) {
        const carrier = fieldShaping.deriveCoreAndLinkedSheathCarrier({
          fieldValue: 0,
          gradientMagnitude,
          coreFwhmWorld: 0.04,
          sheathFwhmWorld: 0.12,
          coreEnergyWeight: 9,
          sheathEnergyWeight: 1,
        });
        expect(carrier.gradientValid).toBe(false);
        expect(carrier.coreProfile).toBe(0);
        expect(carrier.sheathProfile).toBe(0);
        expect(carrier.carrierEnergyDensity).toBe(0);
      }
    });

    it("does not accept pitch, beat, or frame metadata as carrier authority", () => {
      const physicalInputs = {
        fieldValue: 0.006,
        gradientMagnitude: 0.8,
        coreFwhmWorld: 0.04,
        sheathFwhmWorld: 0.12,
        coreEnergyWeight: 9,
        sheathEnergyWeight: 1,
      };
      const reference = fieldShaping.deriveCoreAndLinkedSheathCarrier({
        ...physicalInputs,
        pitchHz: 80,
        beat: 0,
        frame: 1,
      });
      const unrelatedMetadataChanged =
        fieldShaping.deriveCoreAndLinkedSheathCarrier({
          ...physicalInputs,
          pitchHz: 8_000,
          beat: 1,
          frame: 90_000,
        });

      expect(unrelatedMetadataChanged).toEqual(reference);
    });

    it("mirrors the TSL interval carrier at zero, off-surface, grazing, and degenerate samples", () => {
      const zero = fieldShaping.deriveFixedWorldSpaceCarrierDensity({
        fieldValue: 0,
        gradient: [0, 0, 2],
        rayDirLocal: [0, 0, 1],
        stepSize: 0.02,
      });
      const offSurface = fieldShaping.deriveFixedWorldSpaceCarrierDensity({
        fieldValue: 0.2,
        gradient: [0, 0, 2],
        rayDirLocal: [0, 0, 1],
        stepSize: 0.02,
      });
      const grazing = fieldShaping.deriveFixedWorldSpaceCarrierDensity({
        fieldValue: 0,
        gradient: [0, 0, 2],
        rayDirLocal: [1, 0, 0],
        stepSize: 0.02,
      });
      const degenerate = fieldShaping.deriveFixedWorldSpaceCarrierDensity({
        fieldValue: 0,
        gradient: [0, 0, 0],
        rayDirLocal: [0, 0, 1],
        stepSize: 0.02,
      });

      expect(zero.carrierDensity).toBeGreaterThan(0);
      expect(offSurface.carrierDensity).toBeLessThan(zero.carrierDensity);
      expect(grazing.intervalWidthWorld).toBe(0);
      expect(grazing.carrierDensity).toBeGreaterThan(0);
      expect(degenerate).toMatchObject({
        carrierValid: false,
        carrierDensity: 0,
        normalDotRay: 0,
      });

      const nodeSource = readFileSync(
        new URL("./carrierDensityNode.js", import.meta.url),
        "utf8",
      );
      for (const sharedContract of [
        "CYMATIC_CARRIER_REFERENCE_PROFILE.gradientEpsilon",
        "CYMATIC_CARRIER_REFERENCE_PROFILE.sheathWidthRatio",
        "CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight",
        "CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight",
        "intervalWidthWorld",
        "normalDotRay",
      ]) {
        expect(nodeSource).toContain(sharedContract);
      }
      expect(nodeSource).toContain(
        "const validCoreDensity = carrierValid.select(coreDensity, float(0.0));",
      );
      expect(nodeSource).toContain(
        "const validSheathDensity = carrierValid.select(sheathDensity, float(0.0));",
      );
      expect(nodeSource).toContain("carrierDensity: validCarrierDensity");
    });
  });

  it("documents hard optical measurement invariants without freezing tunable gains", () => {
    expect(OPTICAL_COLOR_DENSITY_DELTA_MAX).toBe(1e-6);
    expect(OPTICAL_RECTANGULAR_STARTUP_IMPORT_DELTA_MAX).toBe(0);
    expect(fieldShaping.OPTICAL_BODY_SUPPRESSION_MAX).toBeLessThan(1);
    for (const obsoleteExport of [
      "PHOTOGRAPHIC_DARK_BODY_RATIO",
      "PHOTOGRAPHIC_SHELL_INNER_START",
      "PHOTOGRAPHIC_BLACKFIELD_GATE_START",
      "PHOTOGRAPHIC_BLACKFIELD_BODY_REDUCTION_MIN",
      "derivePhotographicBodyContribution",
      "derivePhotographicShellAuthority",
      "derivePhotographicRadianceScale",
      "derivePhotographicColorMix",
      "derivePhotographicCymaticProbe",
      "deriveBlackfieldGate",
      "deriveShellFocus",
      "deriveMaterialRadianceTransfer",
      "EDGE_FADE_START",
      "INTERIOR_MASK_START",
      "BODY_BOUNDARY_REDUCTION",
      "PHOTOGRAPHIC_SHELL_SUPPRESSION_START",
      "INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX",
      "deriveIncoherentTrebleBodySuppression",
    ]) {
      expect(fieldShaping).not.toHaveProperty(obsoleteExport);
    }
  });

  it("boosts focused optical caustic lanes over equal-density fog support", () => {
    const focused = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      signedCausticDensity: 0.16,
      bodyContribution: 0.04,
      normalDotMeasurement: 0.04,
      gradientPresence: 0.9,
      ridgeConcentration: 0.86,
    });
    const fog = deriveLaserCymaticOpticalProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.16,
      bodyContribution: 0.04,
      normalDotMeasurement: 0.96,
      gradientPresence: 0.08,
      ridgeConcentration: 0.12,
    });

    expect(focused.signedCausticDensity).toBeCloseTo(fog.signedCausticDensity);
    expect(focused.opticalFocusAuthority).toBeGreaterThan(
      fog.opticalFocusAuthority,
    );
    expect(focused.laserCausticRadiance).toBeGreaterThan(
      fog.laserCausticRadiance * 1.35,
    );
  });

  it("derives optical convergence from a forward-difference of view-plane normals", () => {
    expect(fieldShaping.deriveOpticalConvergenceAuthority).toBeTypeOf(
      "function",
    );

    // Center normal N0 faces the camera (+z); offset normals tilt back toward
    // the optical axis as the sample steps outward → wavefront focusing.
    const converging = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      centerGradientNormal: [0, 0, 1],
      normalPositiveT1: [-1, 0, 0],
      normalPositiveT2: [0, -1, 0],
    });
    // Offset normals tilt outward (away from the axis) → diverging wavefront.
    const diverging = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      centerGradientNormal: [0, 0, 1],
      normalPositiveT1: [1, 0, 0],
      normalPositiveT2: [0, 1, 0],
    });
    // Offset normals equal the center normal → no curvature, flat wavefront.
    const flat = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      centerGradientNormal: [0, 0, 1],
      normalPositiveT1: [0, 0, 1],
      normalPositiveT2: [0, 0, 1],
    });

    expect(converging.viewPlaneNormalConvergence).toBeGreaterThan(0);
    expect(converging.opticalConvergenceAuthority).toBe(1);
    expect(diverging.viewPlaneNormalConvergence).toBeLessThan(0);
    expect(diverging.opticalConvergenceAuthority).toBe(0);
    expect(flat.viewPlaneNormalConvergence).toBeCloseTo(0);
    expect(flat.opticalConvergenceAuthority).toBe(0);
  });

  it("keeps a face-on caustic focusing through forward-difference convergence", () => {
    // A bowl facing the camera: center normal on the optical axis (+z) so the
    // grazing slope is ~0, yet the forward-difference normals tilt inward →
    // high convergence. A slope proxy would erase this; convergence must not.
    const faceOnConvergence = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      centerGradientNormal: [0, 0, 1],
      normalPositiveT1: [-1, 0, 0],
      normalPositiveT2: [0, -1, 0],
    });
    expect(faceOnConvergence.opticalConvergenceAuthority).toBeGreaterThan(0.5);

    const common = {
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 0.72,
      signedCausticDensity: 0.14,
      bodyContribution: 0.02,
      // normalDotMeasurement ~ 1 → opticalSlopeAuthority ~ 0 (face-on).
      normalDotMeasurement: 1,
      gradientPresence: 0.72,
      ridgeConcentration: 0.76,
    };
    const flat = deriveLaserCymaticOpticalProbe({
      ...common,
      opticalConvergenceAuthority: 0,
    });
    const faceOn = deriveLaserCymaticOpticalProbe({
      ...common,
      opticalConvergenceAuthority:
        faceOnConvergence.opticalConvergenceAuthority,
    });

    expect(faceOn.opticalSlopeAuthority).toBeCloseTo(0);
    expect(flat.opticalFocusAuthority).toBeCloseTo(flat.causticRidgeAuthority);
    expect(faceOn.opticalFocusAuthority).toBeGreaterThan(
      flat.opticalFocusAuthority,
    );
    expect(faceOn.laserCausticRadiance).toBeGreaterThan(
      flat.laserCausticRadiance,
    );
  });

  it("does not let flat high-gradient samples promote optical focus", () => {
    const flatHighGradient = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 1,
      opticalConvergenceAuthority: 0,
      signedCausticDensity: 0.14,
      bodyContribution: 0,
      normalDotMeasurement: 0,
      gradientPresence: 1,
      ridgeConcentration: 0.92,
    });

    expect(flatHighGradient.opticalSlopeAuthority).toBeGreaterThan(0);
    expect(flatHighGradient.opticalFocusAuthority).toBeCloseTo(
      flatHighGradient.causticRidgeAuthority,
    );
  });

  it("promotes curved ridges through convergence rather than gradient magnitude", () => {
    const common = {
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 0.72,
      signedCausticDensity: 0.14,
      bodyContribution: 0.02,
      normalDotMeasurement: 0.08,
      gradientPresence: 0.72,
      ridgeConcentration: 0.76,
    };
    const flat = deriveLaserCymaticOpticalProbe({
      ...common,
      opticalConvergenceAuthority: 0,
    });
    const curved = deriveLaserCymaticOpticalProbe({
      ...common,
      opticalConvergenceAuthority: 0.7,
    });

    expect(flat.opticalFocusAuthority).toBeCloseTo(flat.causticRidgeAuthority);
    expect(curved.opticalFocusAuthority).toBeGreaterThan(
      flat.opticalFocusAuthority,
    );
    expect(curved.laserCausticRadiance).toBeGreaterThan(
      flat.laserCausticRadiance,
    );
  });

  it("keeps weak valid ridge visibility in observation transfer", () => {
    const weakRidge = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 0.18,
      opticalConvergenceAuthority: 0,
      signedCausticDensity: 0.03,
      bodyContribution: 0,
      normalDotMeasurement: 0.1,
      gradientPresence: 0.18,
      ridgeConcentration: 0.4,
    });
    const observed = deriveObservationTransfer({
      density: weakRidge.physicalDensity,
      modalStructureAnchor: weakRidge.causticRidgeAuthority,
      ridgeAnchor: weakRidge.causticRidgeAuthority,
      modalCoefficientEnergy: 0.8,
      modalResponseEnergy: 0.5,
    });

    expect(weakRidge.opticalFocusAuthority).toBeCloseTo(
      weakRidge.causticRidgeAuthority,
    );
    expect(observed.observedDensityFloor).toBeGreaterThan(
      observed.physicalVisibleDensity,
    );
    expect(observed.observationDensity).toBe(observed.observedDensityFloor);
  });

  it("prevents zero-gradient samples from becoming maximum optical slope", () => {
    const flatSample = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 0,
      opticalConvergenceAuthority: 0,
      signedCausticDensity: 0.14,
      bodyContribution: 0.02,
      normalDotMeasurement: 0,
      gradientPresence: 0,
      ridgeConcentration: 0.72,
    });
    const highGradient = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      opticalConvergenceAuthority: 0.72,
      signedCausticDensity: 0.14,
      bodyContribution: 0.02,
      normalDotMeasurement: 0,
      gradientPresence: 0.9,
      ridgeConcentration: 0.72,
    });

    expect(flatSample.opticalSlopeAuthority).toBe(0);
    expect(flatSample.opticalFocusAuthority).toBeLessThan(
      highGradient.opticalFocusAuthority,
    );
    expect(flatSample.laserCausticRadiance).toBeLessThan(
      highGradient.laserCausticRadiance,
    );
  });

  it("does not let unsupported zero-field presentation inputs authorize caustics", () => {
    const unsupported = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      activeMask: 1,
      effectiveUnsignedSupport: 0,
    });

    expect(unsupported.causticFocusAuthority).toBe(0);
    expect(unsupported.causticRidgeAuthority).toBe(0);
  });

  it("does not use presentation contour core as physical caustic support", () => {
    const unsupportedContour = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
    });

    expect(unsupportedContour.causticFocusAuthority).toBe(0);
    expect(unsupportedContour.causticRidgeAuthority).toBe(0);
  });

  it("derives support-gated live-synthesis cancellation suppression", () => {
    const fullCancellation = deriveLiveSynthesisCancellationSuppression({
      effectiveCancellationRatio: 1,
      effectiveUnsignedSupport: 1,
    });
    const noSupportCancellation = deriveLiveSynthesisCancellationSuppression({
      effectiveCancellationRatio: 1,
      effectiveUnsignedSupport: 0,
    });
    const partialCancellation = deriveLiveSynthesisCancellationSuppression({
      effectiveCancellationRatio: 0.5,
      effectiveUnsignedSupport: 0.4,
    });

    expect(LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE).toBeCloseTo(0.85);
    expect(fullCancellation).toBeCloseTo(0.15, 6);
    expect(noSupportCancellation).toBe(1);
    expect(partialCancellation).toBeCloseTo(1 - 0.5 * 0.4 * 0.85, 6);
  });

  it("uses live-synthesis cancellation metadata as caustic radiance authority", () => {
    const reinforcing = deriveCausticMaterialTransferProbe({
      ...REINFORCED_CAUSTIC_TONE,
      effectiveUnsignedSupport: 1,
      effectiveCancellationRatio: 0,
    });
    const canceled = deriveCausticMaterialTransferProbe({
      ...REINFORCED_CAUSTIC_TONE,
      effectiveUnsignedSupport: 1,
      effectiveCancellationRatio: 1,
    });
    const unsupportedCancellation = deriveCausticMaterialTransferProbe({
      ...REINFORCED_CAUSTIC_TONE,
      effectiveUnsignedSupport: 0,
      effectiveCancellationRatio: 1,
    });

    expect(canceled.cancellationSuppression).toBeCloseTo(0.15, 6);
    expect(canceled.signedRadianceAuthority).toBeCloseTo(
      canceled.cancellationSuppression,
      6,
    );
    expect(canceled.causticVisibility).toBeLessThan(
      reinforcing.causticVisibility * 0.2,
    );
    expect(canceled.observationAnchor).toBeLessThan(
      reinforcing.observationAnchor * 0.2,
    );
    expect(unsupportedCancellation.cancellationSuppression).toBe(1);
  });

  it("keeps Spectral Light projection owned by mix and cached color presence", () => {
    expect(
      deriveSpectralLightProjectionWeight({
        spectralMix: 1,
        spectralLightPresence: 1,
        causticVisibility: 0,
        localFieldSupportAuthority: 0,
      }),
    ).toBe(1);
    expect(
      deriveSpectralLightProjectionWeight({
        spectralMix: 0.8,
        spectralLightPresence: 0.75,
        causticVisibility: 0.42,
        signedRadianceAuthority: 0,
      }),
    ).toBeCloseTo(0.8 * 0.75);
  });

  it("does not let radiance or body fill substitute for gradient evidence", () => {
    const radianceOnly = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      signedBodyAuthority: 0,
    });
    const bodyOnly = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 0,
      signedBodyAuthority: 0.35,
    });

    expect(radianceOnly.causticFocusAuthority).toBe(0);
    expect(radianceOnly.causticRidgeAuthority).toBe(0);
    expect(bodyOnly.causticFocusAuthority).toBe(0);
    expect(bodyOnly.causticRidgeAuthority).toBe(0);
  });

  it("does not let unsupported gradient contours authorize caustics", () => {
    const unsupportedGradientContour = fieldShaping.deriveCausticRidgeAuthority(
      {
        contourCore: 1,
        modalStructureSupport: 1,
        localGradientEvidence: 1,
        activeMask: 1,
        effectiveUnsignedSupport: 0,
      },
    );
    const supportedGradientContour = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.2,
    });

    expect(unsupportedGradientContour.causticFocusAuthority).toBe(0);
    expect(unsupportedGradientContour.causticRidgeAuthority).toBe(0);
    expect(supportedGradientContour.causticFocusAuthority).toBeGreaterThan(0);
    expect(supportedGradientContour.causticRidgeAuthority).toBeGreaterThan(0);
  });

  it("derives local gradient evidence from direct and cached field representations", () => {
    expect(fieldShaping.deriveLocalGradientEvidence).toBeTypeOf("function");

    const direct = fieldShaping.deriveLocalGradientEvidence({
      gradientMagnitude: 0.3,
      amplitudeNorm: 0.6,
      modalBasisCacheActive: false,
      cachedGradientMagnitude: 0.9,
    });
    const cached = fieldShaping.deriveLocalGradientEvidence({
      gradientMagnitude: 0.3,
      amplitudeNorm: 0.6,
      modalBasisCacheActive: true,
      cachedGradientMagnitude: 0.9,
    });
    const saturated = fieldShaping.deriveLocalGradientEvidence({
      gradientMagnitude: 4,
      amplitudeNorm: 0.2,
      modalBasisCacheActive: false,
    });

    expect(direct.localGradientEvidence).toBeCloseTo(0.5);
    expect(cached.localGradientEvidence).toBeCloseTo(0.9);
    expect(saturated.localGradientEvidence).toBe(1);
    expect(direct).not.toHaveProperty("structureMin");
    expect(direct).not.toHaveProperty("structureMax");
  });

  it("preserves supported nodal caustics when field structure exists", () => {
    const supportedNode = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0.62,
      activeMask: 1,
      effectiveUnsignedSupport: 0.2,
    });

    expect(supportedNode.causticFocusAuthority).toBeGreaterThan(0);
    expect(supportedNode.causticRidgeAuthority).toBeGreaterThan(0);
  });

  it("does not recreate old structure-window discontinuities around legacy thresholds", () => {
    const common = {
      contourCore: 1,
      modalStructureSupport: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.4,
    };
    const belowOldMin = fieldShaping.deriveCausticRidgeAuthority({
      ...common,
      localGradientEvidence: 0.58,
    });
    const atOldMin = fieldShaping.deriveCausticRidgeAuthority({
      ...common,
      localGradientEvidence: 0.59,
    });
    const atOldMax = fieldShaping.deriveCausticRidgeAuthority({
      ...common,
      localGradientEvidence: 0.83,
    });

    expect(belowOldMin.causticRidgeAuthority).toBeGreaterThan(0);
    expect(
      Math.abs(
        atOldMin.causticRidgeAuthority - belowOldMin.causticRidgeAuthority,
      ),
    ).toBeLessThan(0.04);
    expect(atOldMax.causticRidgeAuthority).toBeGreaterThan(
      atOldMin.causticRidgeAuthority,
    );
  });

  it("does not let field support without a gradient become caustic authority", () => {
    const supportOnly = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      activeMask: 1,
      effectiveUnsignedSupport: 0.2,
    });

    expect(supportOnly.causticFocusAuthority).toBe(0);
    expect(supportOnly.causticRidgeAuthority).toBe(0);
  });

  it("attenuates low-focus body contribution without caustic-density ownership", () => {
    const broadSupport = deriveLaserCymaticOpticalProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0,
      bodyContribution: 0.1,
      normalDotMeasurement: 0.86,
      gradientPresence: 0.06,
      ridgeConcentration: 0.08,
    });

    expect(broadSupport.opticalNegativeSpaceGate).toBeLessThan(0.1);
    expect(broadSupport.signedCausticDensity).toBe(0);
    expect(broadSupport.opticalBodyContribution).toBeGreaterThan(0);
    expect(broadSupport.opticalBodyContribution).toBeLessThan(
      broadSupport.bodyContribution,
    );
  });

  it("does not let signed cancellation own the optical negative-space aperture", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 0.65,
      modalStructureSupport: 0.65,
      broadBand: 1,
      localGradientEvidence: 0.65,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      excitationVisibility: 1,
      normalDotMeasurement: 0.15,
      gradientPresence: 0.65,
      ridgeConcentration: 0.65,
      colorWeight: 0.4,
    };
    const reinforcing = deriveLaserCymaticOpticalProbe({
      ...common,
      signedRadianceAuthority: 1,
    });
    const halfSigned = deriveLaserCymaticOpticalProbe({
      ...common,
      signedRadianceAuthority: 0.5,
    });
    const canceled = deriveLaserCymaticOpticalProbe({
      ...common,
      signedRadianceAuthority: 0.18,
    });
    const reinforcingAttenuation =
      reinforcing.opticalBodyContribution / reinforcing.bodyContribution;
    const halfSignedAttenuation =
      halfSigned.opticalBodyContribution / halfSigned.bodyContribution;
    const canceledAttenuation =
      canceled.opticalBodyContribution / canceled.bodyContribution;

    expect(reinforcing.opticalNegativeSpaceGate).toBeGreaterThan(0.45);
    expect(reinforcing.opticalNegativeSpaceGate).toBeLessThan(0.7);
    expect(halfSigned.causticRidgeAuthority).toBeCloseTo(
      reinforcing.causticRidgeAuthority,
    );
    expect(canceled.causticRidgeAuthority).toBeCloseTo(
      reinforcing.causticRidgeAuthority,
    );
    expect(halfSigned.opticalNegativeSpaceGate).toBeCloseTo(
      reinforcing.opticalNegativeSpaceGate,
    );
    expect(canceled.opticalNegativeSpaceGate).toBeCloseTo(
      reinforcing.opticalNegativeSpaceGate,
    );
    expect(halfSignedAttenuation).toBeCloseTo(reinforcingAttenuation);
    expect(canceledAttenuation).toBeCloseTo(reinforcingAttenuation);
    expect(
      halfSigned.opticalBodyContribution / reinforcing.opticalBodyContribution,
    ).toBeCloseTo(0.5, 6);
    expect(
      canceled.opticalBodyContribution / reinforcing.opticalBodyContribution,
    ).toBeCloseTo(0.18, 6);
  });

  it("preserves signed cancellation in optical radiance without double gating", () => {
    const reinforcing = deriveLaserCymaticOpticalProbe(REINFORCED_CAUSTIC_TONE);
    const halfSigned = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      signedRadianceAuthority: 0.5,
    });
    const canceled = deriveLaserCymaticOpticalProbe(CANCELED_CAUSTIC_TONE);
    const singleGateReference = reinforcing.laserCausticRadiance * 0.5;
    const doubleGateReference = reinforcing.laserCausticRadiance * 0.25;
    const cancellationDrop =
      (reinforcing.localLuminance - canceled.localLuminance) /
      reinforcing.localLuminance;

    expect(
      Math.abs(halfSigned.laserCausticRadiance - singleGateReference) /
        singleGateReference,
    ).toBeLessThan(0.08);
    expect(
      Math.abs(halfSigned.laserCausticRadiance - singleGateReference),
    ).toBeLessThan(
      Math.abs(halfSigned.laserCausticRadiance - doubleGateReference),
    );
    expect(cancellationDrop).toBeGreaterThanOrEqual(
      CANCELLATION_LUMINANCE_DROP_MIN,
    );
  });

  it("keeps optical color and fringe downstream of physical density", () => {
    const uncolored = deriveLaserCymaticOpticalProbe({
      ...DENSE_POLYPHONIC_PROBE,
      colorWeight: 0,
    });
    const colored = deriveLaserCymaticOpticalProbe({
      ...DENSE_POLYPHONIC_PROBE,
      colorWeight: 1,
    });

    expect(colored.colorConfidence).toBeGreaterThan(uncolored.colorConfidence);
    expect(colored.opticalFringeWeight).toBeGreaterThanOrEqual(0);
    expect(
      Math.abs(colored.physicalDensity - uncolored.physicalDensity),
    ).toBeLessThan(OPTICAL_COLOR_DENSITY_DELTA_MAX);
  });

  it("keeps solved density independent of radial and illumination presentation inputs", () => {
    const solvedField = {
      fieldAbs: 0.006,
      threshold: 0.02,
      modalStructureSupport: 0.78,
      broadBand: 0.86,
      localGradientEvidence: 0.74,
      activeMask: 1,
      effectiveUnsignedSupport: 0.8,
      effectiveCancellationRatio: 0.1,
      excitationVisibility: 0.9,
      signedRadianceAuthority: 1,
      colorWeight: 0.2,
      transientBoost: 1.1,
      boundaryDensity: 0.9,
      latchedFogMask: 0.1,
      trebleBroadbandEnergy: 0.2,
      modeCoherence: 0.8,
    };
    const inner = deriveCausticMaterialTransferProbe({
      ...solvedField,
      radialDistance: 0.05,
      shellWeight: 0.54,
      shellFocus: 0,
      bandEnergies: [1, 0, 0, 0],
      bloomStrength: 0,
      bloomRadius: 0,
      bloomThreshold: 1,
      laserIrradiance: 0.1,
    });
    const outer = deriveCausticMaterialTransferProbe({
      ...solvedField,
      radialDistance: 0.99,
      shellWeight: 0.7,
      shellFocus: 1,
      bandEnergies: [0, 0, 1, 1],
      bloomStrength: 2,
      bloomRadius: 1,
      bloomThreshold: 0,
      laserIrradiance: 10,
    });

    for (const quantity of [
      "modalStructureSupport",
      "causticFocusAuthority",
      "causticRidgeAuthority",
      "causticVisibility",
      "causticDensity",
      "bodyDensity",
      "bodyContribution",
      "localDensity",
    ]) {
      expect(outer[quantity]).toBeCloseTo(inner[quantity], 12);
    }
  });

  it("keeps optical focus downstream of solved caustic density", () => {
    const solvedField = {
      ...REINFORCED_CAUSTIC_TONE,
      modalStructureSupport: 0.82,
      localGradientEvidence: 0.78,
      signedCausticDensity: null,
      bodyContribution: null,
      gradientPresence: 0.78,
      ridgeConcentration: 0.76,
    };
    const flat = deriveLaserCymaticOpticalProbe({
      ...solvedField,
      normalDotMeasurement: 1,
      opticalConvergenceAuthority: 0,
    });
    const focused = deriveLaserCymaticOpticalProbe({
      ...solvedField,
      normalDotMeasurement: 0,
      opticalConvergenceAuthority: 0.9,
    });

    expect(focused.causticDensity).toBeCloseTo(flat.causticDensity, 12);
    expect(focused.bodyDensity).toBeCloseTo(flat.bodyDensity, 12);
    expect(focused.baseLocalDensity).toBeCloseTo(flat.baseLocalDensity, 12);
    expect(focused.opticalFocusAuthority).toBeGreaterThan(
      flat.opticalFocusAuthority,
    );
    expect(focused.laserCausticRadiance).toBeGreaterThan(
      flat.laserCausticRadiance,
    );
  });

  it("promotes reinforced caustic tone structure above body fill", () => {
    const probe = deriveCausticMaterialTransferProbe(REINFORCED_CAUSTIC_TONE);

    expect(probe.causticDensity).toBeGreaterThan(probe.bodyDensity * 4);
    expect(probe.localDensity).toBeGreaterThan(0);
    expect(probe.causticRidgeAuthority).toBeGreaterThan(0);
  });

  it("keeps exact signed cancellation dark after caustic transfer", () => {
    const reinforcing = deriveCausticMaterialTransferProbe(
      REINFORCED_CAUSTIC_TONE,
    );
    const canceled = deriveCausticMaterialTransferProbe(CANCELED_CAUSTIC_TONE);
    const luminanceDrop =
      (reinforcing.localLuminance - canceled.localLuminance) /
      reinforcing.localLuminance;

    expect(CANCELLATION_LUMINANCE_DROP_MIN).toBeCloseTo(0.65);
    expect(luminanceDrop).toBeGreaterThanOrEqual(
      CANCELLATION_LUMINANCE_DROP_MIN,
    );
    expect(canceled.localDensity).toBeLessThan(reinforcing.localDensity * 0.35);
  });

  it("gates broad body mass by signed visible authority", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      modalStructureSupport: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      excitationVisibility: 1,
    };
    const reinforcing = deriveCausticMaterialTransferProbe({
      ...common,
      signedRadianceAuthority: 1,
    });
    const canceling = deriveCausticMaterialTransferProbe({
      ...common,
      signedRadianceAuthority: 0.18,
    });

    expect(reinforcing.bodyDensity).toBeGreaterThan(0);
    expect(canceling.causticRidgeAuthority).toBeCloseTo(
      reinforcing.causticRidgeAuthority,
    );
    expect(canceling.bodyDensity).toBeLessThan(reinforcing.bodyDensity * 0.25);
    expect(canceling.localDensity).toBeLessThan(
      reinforcing.localDensity * 0.35,
    );
  });

  it("keeps caustic ridge visibility independent from source excitation", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      modalStructureSupport: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
    };
    const excited = deriveCausticMaterialTransferProbe({
      ...common,
      excitationVisibility: 1,
    });
    const underExcited = deriveCausticMaterialTransferProbe({
      ...common,
      excitationVisibility: 0.12,
    });
    const excitedBodyRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * excited.bodyDensity),
    );
    const underExcitedBodyRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * underExcited.bodyDensity),
    );

    expect(underExcited.causticRidgeAuthority).toBeCloseTo(
      excited.causticRidgeAuthority,
    );
    expect(underExcited.causticVisibility).toBeCloseTo(
      excited.causticVisibility,
    );
    expect(underExcited.causticDensity).toBeCloseTo(excited.causticDensity);
    expect(underExcited.bodyDensity).toBeLessThan(excited.bodyDensity * 0.15);
    expect(computeLinearLuminance(underExcitedBodyRgb)).toBeLessThan(
      computeLinearLuminance(excitedBodyRgb) * 0.18,
    );
  });

  it("preserves coherent caustic ridge visibility when excitation is low", () => {
    const excited = deriveCausticMaterialTransferProbe({
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      modalStructureSupport: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      excitationVisibility: 1,
    });
    const quietCoherent = deriveCausticMaterialTransferProbe({
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      modalStructureSupport: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      excitationVisibility: 0,
    });

    expect(quietCoherent.causticRidgeAuthority).toBeGreaterThan(0.9);
    expect(quietCoherent.causticVisibility).toBeCloseTo(
      excited.causticVisibility,
    );
    expect(quietCoherent.bodyDensity).toBe(0);
    expect(quietCoherent.causticDensity).toBeCloseTo(excited.causticDensity);
  });

  it("keeps caustic body density independent of treble classifier inputs", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      excitationVisibility: 1,
      trebleBroadbandEnergy: 1,
    };
    const tonalTreble = deriveCausticMaterialTransferProbe({
      ...common,
      modeCoherence: 1,
    });
    const incoherentTreble = deriveCausticMaterialTransferProbe({
      ...common,
      modeCoherence: 0,
    });
    expect(incoherentTreble.causticRidgeAuthority).toBeCloseTo(
      tonalTreble.causticRidgeAuthority,
    );
    expect(incoherentTreble.causticVisibility).toBeCloseTo(
      tonalTreble.causticVisibility,
    );
    expect(incoherentTreble.bodyDensity).toBeCloseTo(tonalTreble.bodyDensity);
    expect(incoherentTreble.localDensity).toBeCloseTo(tonalTreble.localDensity);
    expect(incoherentTreble).not.toHaveProperty("incoherentTrebleSuppression");
  });

  it("does not turn broad contour support into caustic mass", () => {
    const leak = deriveCausticMaterialTransferProbe(BROAD_CONTOUR_LEAK);

    expect(leak.localDensity).toBeLessThanOrEqual(
      CAUSTIC_BROAD_CONTOUR_LEAK_MAX,
    );
    if (leak.localDensity > 0) {
      expect(leak.bodyContribution / leak.localDensity).toBeLessThan(
        CAUSTIC_BODY_MIX_MAX,
      );
    }
  });

  it("keeps physical node support independent of presentation sharpness", () => {
    const common = {
      fieldAbs: 0.05,
      threshold: 0.1,
      broadBand: 0.72,
      localGradientEvidence: 0.64,
      activeMask: 1,
      effectiveUnsignedSupport: 0.58,
      effectiveCancellationRatio: 0.5,
      excitationVisibility: 1,
      signedRadianceAuthority: 1,
    };
    const softContour = deriveContourShape({
      fieldAbs: common.fieldAbs,
      threshold: common.threshold,
      contourSharpness: 2,
      transientEnergy: 0,
    });
    const sharpContour = deriveContourShape({
      fieldAbs: common.fieldAbs,
      threshold: common.threshold,
      contourSharpness: 8,
      transientEnergy: 0,
    });
    const soft = deriveCausticMaterialTransferProbe({
      ...common,
      contourCore: softContour.contourCore,
      modalStructureSupport: softContour.nodeBand,
    });
    const sharp = deriveCausticMaterialTransferProbe({
      ...common,
      contourCore: sharpContour.contourCore,
      modalStructureSupport: sharpContour.nodeBand,
    });

    expect(sharpContour.contourCore).toBeLessThan(
      softContour.contourCore * 0.03,
    );
    expect(sharp.causticRidgeAuthority).toBeCloseTo(
      soft.causticRidgeAuthority,
      12,
    );
    expect(sharp.localDensity).toBeGreaterThan(0);
    expect(sharp.localDensity).toBeCloseTo(soft.localDensity, 12);
  });

  it("keeps dense polyphonic material caustic-led instead of body-led", () => {
    const probe = deriveCausticMaterialTransferProbe(DENSE_POLYPHONIC_PROBE);

    expect(probe.causticVisibility).toBeGreaterThan(0);
    expect(probe.bodyContribution / probe.localDensity).toBeLessThan(
      CAUSTIC_BODY_MIX_MAX,
    );
  });

  it("lets Spectral Light change color confidence without changing density", () => {
    const uncolored = deriveCausticMaterialTransferProbe({
      ...DENSE_POLYPHONIC_PROBE,
      colorWeight: 0,
    });
    const colored = deriveCausticMaterialTransferProbe({
      ...DENSE_POLYPHONIC_PROBE,
      colorWeight: 1,
    });

    expect(colored.colorConfidence).toBeGreaterThan(uncolored.colorConfidence);
    expect(
      Math.abs(colored.localDensity - uncolored.localDensity),
    ).toBeLessThan(CAUSTIC_COLOR_DENSITY_DELTA_MAX);
  });

  it("keeps solved body density independent of radial presentation masks", () => {
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      activeMask: 1,
    });

    expect(BODY_DENSITY_GAIN).toBeCloseTo(0.12);
    expect(body).not.toHaveProperty("interiorMask");
    expect(body.bodyDensity).toBeGreaterThan(0);
  });

  it("applies the latched-fog mask only to high-structure low-change states", () => {
    const fogged = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const active = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.14,
    });
    const weak = deriveLatchedFogMask({
      structureSignal: 0.35,
      changeSignal: 0.01,
    });

    expect(fogged).toBeGreaterThan(0);
    expect(active).toBe(0);
    expect(weak).toBe(0);
  });

  it("releases the latched-fog mask when current transients are active", () => {
    const latched = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const reactive = deriveLatchedFogMask({
      structureSignal: 0.9,
      changeSignal: 0.01,
      transientEnergy: 0.56,
    });

    expect(latched).toBeGreaterThan(0.6);
    expect(reactive).toBeLessThan(latched * 0.2);
  });

  it("does not create body density when broad field support is absent", () => {
    const body = deriveBodyDensity({
      fieldAbs: 0.28,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
    });

    expect(body.bodyDensity).toBe(0);
  });

  it("gates body density by signed visible authority", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
    };
    const reinforcing = deriveBodyDensity({
      ...common,
      signedRadianceAuthority: 1,
    });
    const canceling = deriveBodyDensity({
      ...common,
      signedRadianceAuthority: 0.18,
    });
    const reinforcingRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * reinforcing.bodyDensity),
    );
    const cancelingRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * canceling.bodyDensity),
    );

    expect(reinforcing.signedBodyAuthority).toBeCloseTo(
      canceling.signedBodyAuthority,
    );
    expect(canceling.bodyDensity).toBeLessThan(reinforcing.bodyDensity * 0.25);
    expect(computeLinearLuminance(cancelingRgb)).toBeLessThan(
      computeLinearLuminance(reinforcingRgb) * 0.3,
    );
  });

  it("gates standalone body density by source excitation visibility", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      signedRadianceAuthority: 1,
    };
    const excited = deriveBodyDensity({
      ...common,
      excitationVisibility: 1,
    });
    const underExcited = deriveBodyDensity({
      ...common,
      excitationVisibility: 0.12,
    });
    const excitedRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * excited.bodyDensity),
    );
    const underExcitedRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * underExcited.bodyDensity),
    );

    expect(BODY_EXCITATION_VISIBILITY_POWER).toBeCloseTo(1.2);
    expect(underExcited.signedBodyAuthority).toBeCloseTo(
      excited.signedBodyAuthority,
    );
    expect(underExcited.signedRadianceAuthority).toBeCloseTo(
      excited.signedRadianceAuthority,
    );
    expect(underExcited.bodyDensity).toBeLessThan(excited.bodyDensity * 0.15);
    expect(computeLinearLuminance(underExcitedRgb)).toBeLessThan(
      computeLinearLuminance(excitedRgb) * 0.18,
    );
  });

  it("keeps standalone body density independent of treble classifier inputs", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      signedRadianceAuthority: 1,
      excitationVisibility: 1,
      trebleBroadbandEnergy: 1,
    };
    const tonalTreble = deriveBodyDensity({
      ...common,
      modeCoherence: 1,
    });
    const incoherentTreble = deriveBodyDensity({
      ...common,
      modeCoherence: 0,
    });
    expect(incoherentTreble.signedBodyAuthority).toBeCloseTo(
      tonalTreble.signedBodyAuthority,
    );
    expect(incoherentTreble.excitationVisibility).toBeCloseTo(
      tonalTreble.excitationVisibility,
    );
    expect(incoherentTreble.bodyDensity).toBeCloseTo(tonalTreble.bodyDensity);
    expect(incoherentTreble).not.toHaveProperty("incoherentTrebleSuppression");
  });

  it("reduces final body mass and radiance when signed modal energy cancels", () => {
    const canceling = evaluateRaymarchSignedPotentialAtPoint({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });
    const reinforcing = evaluateRaymarchSignedPotentialAtPoint({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });
    const cancelingOutput = deriveFinalVisibilityProbe(canceling);
    const reinforcingOutput = deriveFinalVisibilityProbe(reinforcing);

    expect(canceling.unsignedPotential).toBeCloseTo(
      reinforcing.unsignedPotential,
    );
    expect(canceling.cancellation).toBeGreaterThanOrEqual(0.85);
    expect(reinforcing.cancellation).toBeLessThan(0.1);
    expect(cancelingOutput.signedBodyAuthority).toBeLessThanOrEqual(0.01);
    expect(reinforcingOutput.signedBodyAuthority).toBeGreaterThan(0.3);
    expect(cancelingOutput.bodyDensity).toBeLessThanOrEqual(
      reinforcingOutput.bodyDensity * 0.45,
    );
    expect(cancelingOutput.radiance).toBeLessThanOrEqual(
      reinforcingOutput.radiance * 0.55,
    );
  });

  it("documents the CPU parity formula for latched-fog body reduction", () => {
    const baseline = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.14,
    });
    const fogged = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });

    expect(LATCHED_FOG_BODY_REDUCTION).toBeCloseTo(0.18);
    expect(fogged.latchedFogMask).toBeGreaterThan(0);
    expect(fogged.bodyDensity).toBeLessThan(baseline.bodyDensity);
  });

  it("lets current transients recover body density from latched fog", () => {
    const latched = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const reactive = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
      structureSignal: 0.9,
      changeSignal: 0.01,
      transientEnergy: 0.56,
    });

    expect(reactive.latchedFogMask).toBeLessThan(latched.latchedFogMask * 0.2);
    expect(reactive.bodyDensity).toBeGreaterThan(latched.bodyDensity);
  });

  it("applies a soft emission rolloff before beam peaks blow out", () => {
    const subtle = deriveEmissionRolloff({
      beamDensity: 0.28,
      transientEnergy: 0.12,
    });
    const intense = deriveEmissionRolloff({
      beamDensity: 1.6,
      transientEnergy: 0.74,
    });

    expect(EMISSION_ROLLOFF_MIX).toBeCloseTo(0.68);
    expect(intense.softCappedBeamDensity).toBeLessThan(1.6);
    expect(intense.rolledBeamDensity).toBeLessThan(1.6);
    expect(intense.rolledBeamDensity).toBeGreaterThan(subtle.rolledBeamDensity);
    expect(intense.rolledBeamDensity / 1.6).toBeLessThan(
      subtle.rolledBeamDensity / 0.28,
    );
  });

  it("compresses body-dominant modal crowding before it becomes haze", () => {
    expect(MODAL_CROWDING_BODY_COMPRESSION).toBeCloseTo(0.55);

    const additiveDensity = 0.34 + 1.4 * BODY_DENSITY_MIX;
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.34,
      dampedBodyDensity: 1.4,
    });

    expect(crowded.ridgeConcentration).toBeLessThan(0.25);
    expect(crowded.bodyCompression).toBeLessThan(0.75);
    expect(crowded.adjustedBodyDensity).toBeLessThan(1.4);
    expect(crowded.localDensity).toBeLessThan(additiveDensity * 0.82);
  });

  it("compresses dense mixed accumulation before it becomes a broad haze", () => {
    const additiveDensity = 0.86 + 1.32 * BODY_DENSITY_MIX;
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.86,
      dampedBodyDensity: 1.32,
    });

    expect(crowded.ridgeConcentration).toBeGreaterThan(0.3);
    expect(crowded.ridgeConcentration).toBeLessThan(0.55);
    expect(crowded.localDensity).toBeLessThan(additiveDensity * 0.78);
  });

  it("preserves ridge-dominant density while crowding compression affects body fill", () => {
    const additiveDensity = 1.1 + 0.16 * BODY_DENSITY_MIX;
    const ridge = deriveModalCrowdingDensity({
      rolledBeamDensity: 1.1,
      dampedBodyDensity: 0.16,
    });

    expect(ridge.ridgeConcentration).toBeGreaterThan(0.86);
    expect(ridge.bodyCompression).toBeGreaterThan(0.9);
    expect(ridge.localDensity).toBeGreaterThan(additiveDensity * 0.99);
    expect(ridge.rolledBeamDensity).toBeCloseTo(1.1);
  });

  it("keeps low-threshold emission available to ridges while suppressing broad body fill", () => {
    const bodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.18,
      bodyCrowding: 1.05,
      contourMix: 0.22,
      highlightMask: 0.12,
      transientEnergy: 0.08,
    });
    const filament = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.92,
      bodyCrowding: 1.05,
      contourMix: 0.84,
      highlightMask: 0.42,
      transientEnergy: 0.08,
    });

    expect(STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION).toBeCloseTo(0.72);
    expect(bodyFill.filamentEligibility).toBeLessThan(0.22);
    expect(bodyFill.emissionGain).toBeLessThan(0.72);
    expect(filament.filamentEligibility).toBe(1);
    expect(filament.emissionGain).toBeGreaterThan(0.98);
    expect(filament.emissionGain).toBeGreaterThan(bodyFill.emissionGain + 0.28);
  });

  it("keeps transient relief bounded so dense body emission cannot fully bypass suppression", () => {
    const sustained = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.24,
      bodyCrowding: 1.12,
      contourMix: 0.18,
      highlightMask: 0.08,
      transientEnergy: 0.04,
    });
    const transient = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.24,
      bodyCrowding: 1.12,
      contourMix: 0.18,
      highlightMask: 0.08,
      transientEnergy: 0.92,
    });

    expect(STRUCTURE_AWARE_EMISSION_MIN_GAIN).toBeCloseTo(0.42);
    expect(transient.emissionGain).toBeGreaterThan(sustained.emissionGain);
    expect(transient.emissionGain).toBeLessThan(0.8);
    expect(sustained.bodySuppression).toBeGreaterThan(0.75);
  });

  it("catches moderate body fill before low-threshold bloom treats it like structure", () => {
    const moderateBodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.12,
      bodyCrowding: 0.16,
      contourMix: 0.15,
      highlightMask: 0.08,
      transientEnergy: 0.08,
    });

    expect(moderateBodyFill.bodyCrowdingGate).toBeGreaterThan(0.3);
    expect(moderateBodyFill.emissionGain).toBeLessThan(0.9);
    expect(moderateBodyFill.emissionGain).toBeGreaterThan(
      STRUCTURE_AWARE_EMISSION_MIN_GAIN,
    );
  });

  it("does not preserve bright body fill just because it is already highlighted", () => {
    const highlightedBodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.12,
      bodyCrowding: 0.16,
      contourMix: 0.85,
      highlightMask: 0.95,
      transientEnergy: 0.25,
    });
    const denseHighlightedBodyFill = deriveStructureAwareEmissionGain({
      ridgeConcentration: 0.18,
      bodyCrowding: 1.05,
      contourMix: 0.75,
      highlightMask: 0.9,
      transientEnergy: 0.25,
    });

    expect(highlightedBodyFill.filamentEligibility).toBeLessThan(0.18);
    expect(highlightedBodyFill.emissionGain).toBeLessThan(0.78);
    expect(denseHighlightedBodyFill.emissionGain).toBeLessThan(0.5);
    expect(denseHighlightedBodyFill.emissionGain).toBeGreaterThanOrEqual(
      STRUCTURE_AWARE_EMISSION_MIN_GAIN,
    );
  });

  it("keeps hot-core authority on beam density rather than crowding compression", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.58,
      dampedBodyDensity: 1.2,
    });
    const baselineHotCore = deriveHotCoreMix({
      beamMask: 0.58,
      highlightMask: 0.12,
      contourMix: 0.66,
      transientEnergy: 0.2,
    });
    const crowdedHotCore = deriveHotCoreMix({
      beamMask: crowded.rolledBeamDensity,
      highlightMask: 0.12,
      contourMix: 0.66,
      transientEnergy: 0.2,
    });

    expect(crowded.adjustedBodyDensity).toBeLessThan(1.2);
    expect(crowdedHotCore).toBeCloseTo(baselineHotCore);
  });

  it("raises the hot-core threshold for locally crowded bright fields", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.82,
      dampedBodyDensity: 1.24,
    });
    const hotCoreCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.12,
    });
    const baselineHotCore = deriveHotCoreMix({
      beamMask: crowded.rolledBeamDensity,
      highlightMask: 0.36,
      contourMix: 0.78,
      transientEnergy: 0.12,
    });
    const crowdedHotCore = deriveHotCoreMix({
      beamMask: crowded.rolledBeamDensity,
      highlightMask: 0.36,
      contourMix: 0.78,
      transientEnergy: 0.12,
      hotCoreStart: hotCoreCrowding.hotCoreStart,
    });

    expect(HOT_CORE_CROWDING_THRESHOLD_LIFT).toBeCloseTo(0.14);
    expect(hotCoreCrowding.hotCoreCrowding).toBeGreaterThan(0.35);
    expect(hotCoreCrowding.hotCoreStart).toBeGreaterThan(HOT_CORE_START);
    expect(crowdedHotCore).toBeLessThan(baselineHotCore * 0.82);
  });

  it("keeps isolated ridge hot-core response nearly unchanged", () => {
    const ridge = deriveModalCrowdingDensity({
      rolledBeamDensity: 1.12,
      dampedBodyDensity: 0.12,
    });
    const hotCoreCrowding = deriveHotCoreCrowding({
      ridgeConcentration: ridge.ridgeConcentration,
      bodyCrowding: ridge.bodyCrowding,
      transientEnergy: 0.1,
    });
    const baselineHotCore = deriveHotCoreMix({
      beamMask: ridge.rolledBeamDensity,
      highlightMask: 0.22,
      contourMix: 0.82,
      transientEnergy: 0.1,
    });
    const ridgeHotCore = deriveHotCoreMix({
      beamMask: ridge.rolledBeamDensity,
      highlightMask: 0.22,
      contourMix: 0.82,
      transientEnergy: 0.1,
      hotCoreStart: hotCoreCrowding.hotCoreStart,
    });

    expect(hotCoreCrowding.hotCoreCrowding).toBeLessThan(0.02);
    expect(ridgeHotCore).toBeGreaterThan(baselineHotCore * 0.98);
  });

  it("lets strong transients push through the hot-core crowding limiter", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.82,
      dampedBodyDensity: 1.24,
    });
    const sustainedCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.08,
    });
    const transientCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.86,
    });

    expect(transientCrowding.hotCoreCrowding).toBeLessThan(
      sustainedCrowding.hotCoreCrowding,
    );
    expect(transientCrowding.hotCoreStart).toBeLessThan(
      sustainedCrowding.hotCoreStart,
    );
  });

  it("keeps white emission crowded during dense transients", () => {
    const crowded = deriveModalCrowdingDensity({
      rolledBeamDensity: 0.86,
      dampedBodyDensity: 1.32,
    });
    const transientCrowding = deriveHotCoreCrowding({
      ridgeConcentration: crowded.ridgeConcentration,
      bodyCrowding: crowded.bodyCrowding,
      transientEnergy: 0.86,
    });
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.7,
      whiteEmissionMix: 0.52,
      hotCoreCrowding: transientCrowding.hotCoreCrowding,
      whiteEmissionCrowding: transientCrowding.whiteEmissionCrowding,
    });

    expect(transientCrowding.hotCoreCrowding).toBeLessThan(
      transientCrowding.whiteEmissionCrowding,
    );
    expect(highlight.crowdedHotCoreMix).toBeGreaterThan(0.48);
    expect(highlight.crowdedWhiteEmissionMix).toBeLessThan(0.52 * 0.45);
  });

  it("derives white-emission authority from structural and local field evidence only", () => {
    const supportOnlyFocus = deriveWhiteEmissionFieldAuthority({
      ridgeConcentration: 0,
      causticRidgeAuthority: 0,
      opticalFocusEvidence: 1,
      structuralConcentration: 1,
      modalCoefficientEnergy: 1,
      cancellationSuppression: 1,
    });
    const ridgeSupportedFocus = deriveWhiteEmissionFieldAuthority({
      ridgeConcentration: 0.35,
      causticRidgeAuthority: 0.35,
      opticalFocusEvidence: 1,
      structuralConcentration: 0.6,
      modalCoefficientEnergy: 0.4,
      cancellationSuppression: 0,
    });

    expect(supportOnlyFocus.whiteEmissionRidgeEvidence).toBe(0);
    expect(supportOnlyFocus.whiteEmissionFieldAuthority).toBe(0);
    expect(ridgeSupportedFocus.whiteEmissionRidgeEvidence).toBeGreaterThan(0);
    expect(ridgeSupportedFocus.whiteEmissionLocalEvidence).toBeGreaterThan(0);
    expect(ridgeSupportedFocus.whiteEmissionStructuralDrive).toBe(0.6);
    expect(ridgeSupportedFocus.whiteEmissionFieldAuthority).toBeGreaterThan(0);
  });

  it("gates white emission by field authority before crowding relief", () => {
    const unauthorized = deriveCrowdedWhiteEmissionMix({
      holographicEmissionLift: 0.8,
      whiteEmissionFieldAuthority: 0,
      whiteEmissionCrowding: 0,
    });
    const authorized = deriveCrowdedWhiteEmissionMix({
      holographicEmissionLift: 0.8,
      whiteEmissionFieldAuthority: 1,
      whiteEmissionCrowding: 0.25,
    });

    expect(unauthorized.crowdedWhiteEmissionMix).toBe(0);
    expect(authorized.whiteEmissionFieldCrowding).toBe(0);
    expect(authorized.crowdedWhiteEmissionMix).toBeCloseTo(
      0.8 * (1 - 0.25 * WHITE_EMISSION_CROWDING_REDUCTION),
    );
  });

  it("projects physical caustic density into bounded radiance authority", () => {
    const broad = deriveProjectedCausticRadianceDensity({
      causticVisibleDensity: 0.6,
      ridgeConcentration: 0,
      causticRidgeAuthority: 0,
      opticalFocusEvidence: 0,
      structuralConcentration: 0.1,
      modalCoefficientEnergy: 0.1,
    });
    const normal = deriveProjectedCausticRadianceDensity({
      causticVisibleDensity: 0.56,
      ridgeConcentration: 0.45,
      causticRidgeAuthority: 0.35,
      opticalFocusEvidence: 0.45,
      structuralConcentration: 0.5,
      modalCoefficientEnergy: 0.5,
    });
    const focused = deriveProjectedCausticRadianceDensity({
      causticVisibleDensity: 0.6,
      ridgeConcentration: 0.92,
      causticRidgeAuthority: 0.86,
      opticalFocusEvidence: 0.82,
      structuralConcentration: 0.7,
      modalCoefficientEnergy: 0.48,
    });
    const denseTail = deriveProjectedCausticRadianceDensity({
      causticVisibleDensity: 1,
      ridgeConcentration: 0.15,
      causticRidgeAuthority: 0.08,
      opticalFocusEvidence: 0.1,
      structuralConcentration: 0.5,
      modalCoefficientEnergy: 0.5,
    });

    expect(broad.projectedCausticRadianceDensity).toBeGreaterThan(0);
    expect(broad.projectedCausticRadianceDensity).toBeLessThan(0.25);
    expect(normal.projectedCausticRadianceDensity).toBeGreaterThan(0.27);
    expect(normal.projectedCausticRadianceDensity).toBeLessThan(0.56);
    expect(focused.projectedCausticRadianceDensity).toBeGreaterThan(
      normal.projectedCausticRadianceDensity,
    );
    expect(focused.projectedCausticRadianceDensity).toBeGreaterThan(0.38);
    expect(focused.projectedCausticRadianceDensity).toBeLessThan(0.6);
    expect(denseTail.projectedCausticRadianceDensity).toBeLessThan(0.45);
    expect(focused.projectedCausticRadianceAuthority).toBeGreaterThan(0.5);
    expect(normal.projectedCausticAuthorityResponse).toBeCloseTo(
      normal.projectedCausticRadianceAuthority,
    );
    expect(focused.projectedCausticAuthorityResponse).toBeCloseTo(
      focused.projectedCausticRadianceAuthority,
    );
  });

  it("reduces crowded white-emission mix before highlights desaturate", () => {
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.62,
      whiteEmissionMix: 0.52,
      hotCoreCrowding: 0.82,
    });

    expect(WHITE_EMISSION_CROWDING_REDUCTION).toBeCloseTo(0.72);
    expect(highlight.crowdedWhiteEmissionMix).toBeLessThan(0.52 * 0.55);
    expect(highlight.crowdedHotCoreMix).toBeLessThan(0.62);
  });

  it("prevents signed cancellation from re-entering as white highlight emission", () => {
    const canceledRadianceAuthority = deriveFullCancellationRadianceAuthority();
    const reinforcing = deriveCrowdedHighlightMix({
      hotCoreMix: 0.68,
      whiteEmissionMix: 0.48,
      hotCoreCrowding: 0.42,
      whiteEmissionCrowding: 0.62,
      signedRadianceAuthority: 1,
    });
    const canceling = deriveCrowdedHighlightMix({
      hotCoreMix: 0.68,
      whiteEmissionMix: 0.48,
      hotCoreCrowding: 0.42,
      whiteEmissionCrowding: 0.62,
      signedRadianceAuthority: canceledRadianceAuthority,
    });
    const saturatedColor = [0.92, 0.24, 0.7];
    const reinforcingRgb = compressDisplayRadiance(
      mixTestColor(
        saturatedColor,
        [1, 1, 1],
        reinforcing.crowdedWhiteEmissionMix,
      ),
    );
    const cancelingRgb = compressDisplayRadiance(
      mixTestColor(
        saturatedColor,
        [1, 1, 1],
        canceling.crowdedWhiteEmissionMix,
      ),
    );

    expect(canceling.crowdedWhiteEmissionMix).toBeLessThan(
      reinforcing.crowdedWhiteEmissionMix * 0.35,
    );
    expect(saturationOf(cancelingRgb)).toBeGreaterThan(
      saturationOf(reinforcingRgb),
    );
  });

  it("preserves isolated ridge highlight and white-emission mix", () => {
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.82,
      whiteEmissionMix: 0.3,
      hotCoreCrowding: 0.01,
    });

    expect(HOT_CORE_SURFACE_CROWDING_REDUCTION).toBeCloseTo(0.34);
    expect(highlight.crowdedHotCoreMix).toBeGreaterThan(0.82 * 0.98);
    expect(highlight.crowdedWhiteEmissionMix).toBeGreaterThan(0.3 * 0.98);
  });

  it("applies less highlight desaturation when transient relief lowers crowding", () => {
    const sustained = deriveCrowdedHighlightMix({
      hotCoreMix: 0.7,
      whiteEmissionMix: 0.42,
      hotCoreCrowding: 0.76,
    });
    const transient = deriveCrowdedHighlightMix({
      hotCoreMix: 0.7,
      whiteEmissionMix: 0.42,
      hotCoreCrowding: 0.34,
    });

    expect(transient.crowdedHotCoreMix).toBeGreaterThan(
      sustained.crowdedHotCoreMix,
    );
    expect(transient.crowdedWhiteEmissionMix).toBeGreaterThan(
      sustained.crowdedWhiteEmissionMix,
    );
  });

  it("preserves more saturation than direct mix-to-white in crowded color", () => {
    const baseColor = [0.92, 0.24, 0.7];
    const white = [1, 1, 1];
    const directMix = mixTestColor(baseColor, white, 0.44);
    const highlight = deriveCrowdedHighlightMix({
      hotCoreMix: 0.64,
      whiteEmissionMix: 0.44,
      hotCoreCrowding: 0.84,
    });
    const crowdedMix = mixTestColor(
      baseColor,
      white,
      highlight.crowdedWhiteEmissionMix,
    );

    expect(saturationOf(crowdedMix)).toBeGreaterThan(
      saturationOf(directMix) * 1.45,
    );
  });

  it("pushes hot-core highlights from beam energy instead of body fog", () => {
    const subtleCore = deriveHotCoreMix({
      beamMask: 0.38,
      highlightMask: 0.18,
      contourMix: 0.44,
      transientEnergy: 0.12,
    });
    const hotCore = deriveHotCoreMix({
      beamMask: 0.92,
      highlightMask: 0.78,
      contourMix: 0.86,
      transientEnergy: 0.74,
    });

    expect(HOT_CORE_START).toBeCloseTo(0.56);
    expect(HOT_CORE_END).toBeCloseTo(0.94);
    expect(hotCore).toBeGreaterThan(subtleCore);
    expect(hotCore).toBeGreaterThan(0.45);
    expect(hotCore).toBeLessThan(0.8);
  });

  it("drives contour accent from boundary and highlight masks without camera terms", () => {
    const accent = deriveStableContourAccent({
      contourMix: 0.55,
      boundaryMask: 0.7,
      highlightMask: 0.35,
    });
    const contourOnly = deriveStableContourAccent({
      contourMix: 0.55,
      boundaryMask: 0,
      highlightMask: 0,
    });

    expect(BOUNDARY_CONTOUR_ACCENT_WEIGHT).toBeCloseTo(0.08);
    expect(HIGHLIGHT_CONTOUR_ACCENT_WEIGHT).toBeCloseTo(0.04);
    expect(accent).toBeCloseTo(0.55 * 0.18 + 0.7 * 0.08 + 0.35 * 0.04);
    expect(accent).toBeGreaterThan(contourOnly);
  });

  it("raises holographic fresnel at grazing view angles", () => {
    const faceOn = deriveHolographicFresnel({
      normalViewDot: 0.92,
      holographicIntensity: 0.45,
      holographicFresnelPower: 3.2,
    });
    const grazing = deriveHolographicFresnel({
      normalViewDot: 0.18,
      holographicIntensity: 0.45,
      holographicFresnelPower: 3.2,
    });

    expect(grazing.fresnelBase).toBeGreaterThan(faceOn.fresnelBase);
    expect(grazing.holographicFresnel).toBeGreaterThan(
      faceOn.holographicFresnel,
    );
  });

  it("tightens holographic falloff as fresnel power increases", () => {
    const loose = deriveHolographicFresnel({
      normalViewDot: 0.55,
      holographicIntensity: 0.45,
      holographicFresnelPower: 2.2,
    });
    const tight = deriveHolographicFresnel({
      normalViewDot: 0.55,
      holographicIntensity: 0.45,
      holographicFresnelPower: 5.2,
    });

    expect(tight.fresnelBase).toBeLessThan(loose.fresnelBase);
    expect(tight.holographicFresnel).toBeLessThan(loose.holographicFresnel);
  });

  it("disables holographic sheen when intensity is zero", () => {
    const sheen = deriveHolographicFresnel({
      normalViewDot: 0.2,
      holographicIntensity: 0,
      holographicFresnelPower: 3.2,
    });

    expect(sheen.fresnelBase).toBeGreaterThan(0);
    expect(sheen.holographicFresnel).toBe(0);
  });
});
