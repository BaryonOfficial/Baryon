import { describe, expect, it } from "vitest";
import {
  computeLinearLuminance,
  compressDisplayRadiance,
} from "../../render/displayRadiance.js";
import { deriveObservationTransfer } from "./observationTransfer.js";
import * as fieldShaping from "./fieldShaping.js";
import {
  BEAM_POWER_BASE,
  BOUNDARY_CONTOUR_ACCENT_WEIGHT,
  BODY_DENSITY_MIX,
  BODY_DENSITY_GAIN,
  BODY_EXCITATION_VISIBILITY_POWER,
  CAUSTIC_BODY_MIX_MAX,
  CAUSTIC_BROAD_CONTOUR_LEAK_MAX,
  CAUSTIC_COLOR_DENSITY_DELTA_MAX,
  CANCELLATION_LUMINANCE_DROP_MIN,
  CONTOUR_BLEND,
  LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE,
  EMISSION_ROLLOFF_MIX,
  HIGHLIGHT_CONTOUR_ACCENT_WEIGHT,
  HOT_CORE_END,
  HOT_CORE_START,
  HOT_CORE_CROWDING_THRESHOLD_LIFT,
  HOT_CORE_SURFACE_CROWDING_REDUCTION,
  INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX,
  LATCHED_FOG_BEAM_REDUCTION,
  LATCHED_FOG_BODY_REDUCTION,
  MODAL_CROWDING_BODY_COMPRESSION,
  OPTICAL_COLOR_DENSITY_DELTA_MAX,
  OPTICAL_RECTANGULAR_STARTUP_IMPORT_DELTA_MAX,
  STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION,
  STRUCTURE_AWARE_EMISSION_MIN_GAIN,
  WHITE_EMISSION_CROWDING_REDUCTION,
  SHELL_WEIGHT_MAX,
  SHELL_WEIGHT_MIN,
  deriveCausticMaterialTransferProbe,
  deriveLaserCymaticOpticalProbe,
  deriveBeamMask,
  deriveBodyDensity,
  deriveContourShape,
  deriveEmissionRolloff,
  deriveLatchedFogMask,
  deriveHolographicColorMix,
  deriveHolographicFresnel,
  deriveCrowdedHighlightMix,
  deriveLiveSynthesisCancellationSuppression,
  deriveHotCoreCrowding,
  deriveHotCoreMix,
  derivePhotographicCymaticProbe,
  deriveModalCrowdingDensity,
  deriveShellWeight,
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
  shellFocus: 0.7,
  edgeFade: 1,
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
  shellFocus: 0.7,
  edgeFade: 1,
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
  shellFocus: 0.62,
  edgeFade: 1,
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
  it("documents hard optical measurement invariants without freezing tunable gains", () => {
    expect(OPTICAL_COLOR_DENSITY_DELTA_MAX).toBe(1e-6);
    expect(OPTICAL_RECTANGULAR_STARTUP_IMPORT_DELTA_MAX).toBe(0);
    expect(fieldShaping.OPTICAL_BODY_SUPPRESSION_MAX).toBeLessThan(1);
    expect(fieldShaping.PHOTOGRAPHIC_DARK_BODY_RATIO).toBeLessThanOrEqual(
      1 - fieldShaping.PHOTOGRAPHIC_BLACKFIELD_BODY_REDUCTION_MIN,
    );
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

  it("derives optical convergence from signed view-plane normal flow", () => {
    expect(fieldShaping.deriveOpticalConvergenceAuthority).toBeTypeOf(
      "function",
    );

    const converging = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      normalPositiveT1: [-1, 0, 0],
      normalNegativeT1: [1, 0, 0],
      normalPositiveT2: [0, -1, 0],
      normalNegativeT2: [0, 1, 0],
    });
    const diverging = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      normalPositiveT1: [1, 0, 0],
      normalNegativeT1: [-1, 0, 0],
      normalPositiveT2: [0, 1, 0],
      normalNegativeT2: [0, -1, 0],
    });
    const flat = fieldShaping.deriveOpticalConvergenceAuthority({
      tangent1: [1, 0, 0],
      tangent2: [0, 1, 0],
      normalPositiveT1: [0, 0, 1],
      normalNegativeT1: [0, 0, 1],
      normalPositiveT2: [0, 0, 1],
      normalNegativeT2: [0, 0, 1],
    });

    expect(converging.viewPlaneNormalConvergence).toBeGreaterThan(0);
    expect(converging.opticalConvergenceAuthority).toBe(1);
    expect(diverging.viewPlaneNormalConvergence).toBeLessThan(0);
    expect(diverging.opticalConvergenceAuthority).toBe(0);
    expect(flat.viewPlaneNormalConvergence).toBeCloseTo(0);
    expect(flat.opticalConvergenceAuthority).toBe(0);
  });

  it("does not let flat high-gradient samples promote optical focus", () => {
    const flatHighGradient = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 1,
      opticalConvergenceAuthority: 0,
      shellFocus: 0.95,
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
      shellFocus: 0.84,
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
    expect(observed.visibleDensity).toBe(observed.observedDensityFloor);
  });

  it("prevents zero-gradient shell focus from becoming maximum optical slope", () => {
    const flatShell = deriveLaserCymaticOpticalProbe({
      ...REINFORCED_CAUSTIC_TONE,
      localGradientEvidence: 0,
      opticalConvergenceAuthority: 0,
      shellFocus: 0.95,
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

    expect(flatShell.opticalSlopeAuthority).toBe(0);
    expect(flatShell.opticalFocusAuthority).toBeLessThan(
      highGradient.opticalFocusAuthority,
    );
    expect(flatShell.laserCausticRadiance).toBeLessThan(
      highGradient.laserCausticRadiance,
    );
  });

  it("does not let unsupported zero-field shell focus authorize caustics", () => {
    const unsupportedShell = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      shellFocus: 1,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0,
      signedBodyAuthority: 0,
    });

    expect(unsupportedShell.causticFocusAuthority).toBe(0);
    expect(unsupportedShell.causticRidgeAuthority).toBe(0);
  });

  it("does not use presentation contour core as physical caustic support", () => {
    const unsupportedContour = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      localGradientEvidence: 1,
      shellFocus: 1,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedBodyAuthority: 1,
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

  it("does not let uncanceled radiance masquerade as shell field support", () => {
    const radianceOnlyShell = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      shellFocus: 1,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      signedBodyAuthority: 0,
    });
    const bodySupportedShell = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      shellFocus: 1,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 0,
      signedBodyAuthority: 0.35,
    });

    expect(radianceOnlyShell.causticFocusAuthority).toBe(0);
    expect(radianceOnlyShell.causticRidgeAuthority).toBe(0);
    expect(bodySupportedShell.causticFocusAuthority).toBeGreaterThan(0);
    expect(bodySupportedShell.causticRidgeAuthority).toBeGreaterThan(0);
  });

  it("does not let unsupported gradient contours authorize caustics", () => {
    const unsupportedGradientContour = fieldShaping.deriveCausticRidgeAuthority(
      {
        contourCore: 1,
        modalStructureSupport: 1,
        localGradientEvidence: 1,
        shellFocus: 0,
        edgeFade: 1,
        activeMask: 1,
        effectiveUnsignedSupport: 0,
        signedBodyAuthority: 1,
      },
    );
    const supportedGradientContour = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 1,
      shellFocus: 0,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.2,
      signedBodyAuthority: 1,
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
      shellFocus: 0.9,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.2,
      signedBodyAuthority: 1,
    });

    expect(supportedNode.causticFocusAuthority).toBeGreaterThan(0);
    expect(supportedNode.causticRidgeAuthority).toBeGreaterThan(0);
  });

  it("does not recreate old structure-window discontinuities around legacy thresholds", () => {
    const common = {
      contourCore: 1,
      modalStructureSupport: 1,
      shellFocus: 0.2,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.4,
      signedBodyAuthority: 1,
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

  it("does not let support-only shell focus become caustic authority", () => {
    const supportOnlyShell = fieldShaping.deriveCausticRidgeAuthority({
      contourCore: 1,
      modalStructureSupport: 1,
      localGradientEvidence: 0,
      shellFocus: 1,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.2,
      signedBodyAuthority: 0,
    });

    expect(supportOnlyShell.causticFocusAuthority).toBe(0);
    expect(supportOnlyShell.causticRidgeAuthority).toBe(0);
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
      shellFocus: 0.65,
      shellWeight: 0.62,
      edgeFade: 1,
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

  it("keeps a high photographic shell dark when caustic evidence is absent", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const shellOnly = fieldShaping.derivePhotographicCymaticProbe({
      fieldAbs: 0.002,
      threshold: 0.02,
      contourCore: 0,
      broadBand: 0.95,
      localGradientEvidence: 0,
      shellFocus: 1,
      shellWeight: 0.92,
      radialDistance: 0.48,
      signedCausticDensity: 0,
      bodyContribution: 0,
      normalDotMeasurement: 0.02,
      gradientPresence: 0,
      ridgeConcentration: 0,
      edgeFade: 1,
      activeMask: 1,
      excitationVisibility: 1,
      signedRadianceAuthority: 1,
    });

    expect(shellOnly.photographicShellAuthority).toBeGreaterThan(0.45);
    expect(shellOnly.causticRidgeAuthority).toBe(0);
    expect(shellOnly.physicalDensity).toBeLessThan(1e-4);
    expect(shellOnly.peakWhiteMix).toBeLessThan(0.01);
  });

  it("does not let gradient confidence author photographic aperture support", () => {
    const gradientOnlyAperture = fieldShaping.derivePhotographicShellAuthority({
      radialDistance: 0.02,
      shellFocus: 0,
      shellWeight: 0,
      contourCore: 0,
      localGradientEvidence: 1,
      edgeFade: 1,
      activeMask: 1,
    });
    const contourAperture = fieldShaping.derivePhotographicShellAuthority({
      radialDistance: 0.02,
      shellFocus: 0,
      shellWeight: 0,
      contourCore: 0.6,
      localGradientEvidence: 0,
      edgeFade: 1,
      activeMask: 1,
    });

    expect(gradientOnlyAperture.apertureAuthority).toBe(0);
    expect(gradientOnlyAperture.photographicShellAuthority).toBe(0);
    expect(contourAperture.apertureAuthority).toBeGreaterThan(0);
    expect(contourAperture.photographicShellAuthority).toBeGreaterThan(0);
  });

  it("makes focused photographic ridges dominate body-heavy low-focus support", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const focused = fieldShaping.derivePhotographicCymaticProbe({
      ...REINFORCED_CAUSTIC_TONE,
      signedCausticDensity: 0.16,
      bodyContribution: 0.04,
      radialDistance: 0.48,
      normalDotMeasurement: 0.04,
      gradientPresence: 0.9,
      ridgeConcentration: 0.86,
      colorWeight: 0.2,
    });
    const smoky = fieldShaping.derivePhotographicCymaticProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.16,
      bodyContribution: 0.12,
      radialDistance: 0.48,
      normalDotMeasurement: 0.96,
      gradientPresence: 0.08,
      ridgeConcentration: 0.12,
      colorWeight: 0.2,
    });

    expect(focused.signedCausticDensity).toBeCloseTo(
      smoky.signedCausticDensity,
    );
    expect(focused.photographicFocus).toBeGreaterThan(smoky.photographicFocus);
    expect(focused.photographicLaserCausticRadiance).toBeGreaterThan(
      smoky.photographicLaserCausticRadiance * 1.4,
    );
    expect(focused.photographicLaserCausticRadiance).toBeGreaterThan(
      focused.photographicBodyContribution,
    );
  });

  it("rejects low-focus photographic caustic wash relative to the optical baseline", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const opticalWash = deriveLaserCymaticOpticalProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.16,
      bodyContribution: 0.12,
      normalDotMeasurement: 0.96,
      gradientPresence: 0.08,
      ridgeConcentration: 0.12,
    });
    const photographicWash = fieldShaping.derivePhotographicCymaticProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.16,
      bodyContribution: 0.12,
      radialDistance: 0.48,
      normalDotMeasurement: 0.96,
      gradientPresence: 0.08,
      ridgeConcentration: 0.12,
    });

    expect(photographicWash.blackfieldGate).toBeLessThan(0.2);
    expect(photographicWash.photographicRadianceScale).toBeLessThan(0.5);
    expect(photographicWash.photographicLaserCausticRadiance).toBeLessThan(
      opticalWash.laserCausticRadiance * 0.62,
    );
    expect(photographicWash.physicalDensity).toBeLessThan(
      opticalWash.physicalDensity * 0.62,
    );
  });

  it("does not let signed cancellation own the photographic blackfield aperture", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 0.55,
      modalStructureSupport: 0.55,
      broadBand: 1,
      localGradientEvidence: 0.55,
      shellFocus: 0.55,
      shellWeight: 0.62,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      excitationVisibility: 1,
      radialDistance: 0.54,
      normalDotMeasurement: 0.15,
      gradientPresence: 0.55,
      ridgeConcentration: 0.55,
      colorWeight: 0.4,
    };
    const reinforcing = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      signedRadianceAuthority: 1,
    });
    const halfSigned = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      signedRadianceAuthority: 0.5,
    });
    const canceled = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      signedRadianceAuthority: 0.18,
    });

    expect(reinforcing.blackfieldGate).toBeGreaterThan(0.2);
    expect(reinforcing.blackfieldGate).toBeLessThan(0.5);
    expect(halfSigned.causticRidgeAuthority).toBeCloseTo(
      reinforcing.causticRidgeAuthority,
    );
    expect(canceled.causticRidgeAuthority).toBeCloseTo(
      reinforcing.causticRidgeAuthority,
    );
    expect(halfSigned.blackfieldGate).toBeCloseTo(reinforcing.blackfieldGate);
    expect(canceled.blackfieldGate).toBeCloseTo(reinforcing.blackfieldGate);
    expect(halfSigned.photographicRadianceScale).toBeCloseTo(
      reinforcing.photographicRadianceScale,
    );
    expect(canceled.photographicRadianceScale).toBeCloseTo(
      reinforcing.photographicRadianceScale,
    );
    expect(
      halfSigned.photographicLaserCausticRadiance /
        reinforcing.photographicLaserCausticRadiance,
    ).toBeCloseTo(0.5, 6);
    expect(
      canceled.photographicLaserCausticRadiance /
        reinforcing.photographicLaserCausticRadiance,
    ).toBeCloseTo(0.18, 6);
  });

  it("applies a blackfield gate that suppresses low-focus haze", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");
    expect(fieldShaping.PHOTOGRAPHIC_BLACKFIELD_BODY_REDUCTION_MIN).toBe(0.6);

    const optical = deriveLaserCymaticOpticalProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.12,
      bodyContribution: 0.1,
      normalDotMeasurement: 0.86,
      gradientPresence: 0.06,
      ridgeConcentration: 0.08,
    });
    const photographic = fieldShaping.derivePhotographicCymaticProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.12,
      bodyContribution: 0.1,
      radialDistance: 0.42,
      normalDotMeasurement: 0.86,
      gradientPresence: 0.06,
      ridgeConcentration: 0.08,
    });
    const bodyReduction =
      1 -
      photographic.photographicBodyContribution /
        Math.max(optical.opticalBodyContribution, 1e-6);

    expect(optical.opticalBodyContribution).toBeGreaterThan(0);
    expect(photographic.blackfieldGate).toBeLessThan(0.2);
    expect(bodyReduction).toBeGreaterThanOrEqual(
      fieldShaping.PHOTOGRAPHIC_BLACKFIELD_BODY_REDUCTION_MIN,
    );
  });

  it("keeps photographic color downstream of physical density", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");
    expect(fieldShaping.PHOTOGRAPHIC_COLOR_DENSITY_DELTA_MAX).toBe(
      OPTICAL_COLOR_DENSITY_DELTA_MAX,
    );

    const uncolored = fieldShaping.derivePhotographicCymaticProbe({
      ...DENSE_POLYPHONIC_PROBE,
      radialDistance: 0.58,
      normalDotMeasurement: 0.12,
      gradientPresence: 0.74,
      ridgeConcentration: 0.76,
      colorWeight: 0,
    });
    const colored = fieldShaping.derivePhotographicCymaticProbe({
      ...DENSE_POLYPHONIC_PROBE,
      radialDistance: 0.58,
      normalDotMeasurement: 0.12,
      gradientPresence: 0.74,
      ridgeConcentration: 0.76,
      colorWeight: 1,
    });

    expect(colored.photographicSpectralWeight).toBeGreaterThan(
      uncolored.photographicSpectralWeight,
    );
    expect(
      Math.abs(colored.physicalDensity - uncolored.physicalDensity),
    ).toBeLessThan(fieldShaping.PHOTOGRAPHIC_COLOR_DENSITY_DELTA_MAX);
  });

  it("uses resolved signed authority once for photographic color and white peaks", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 0.75,
      broadBand: 1,
      localGradientEvidence: 0.75,
      shellFocus: 0.75,
      shellWeight: 0.7,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      excitationVisibility: 1,
      radialDistance: 0.54,
      normalDotMeasurement: 0.02,
      gradientPresence: 0.94,
      ridgeConcentration: 0.92,
      colorWeight: 1,
      signedRadianceAuthority: 1,
    };
    const reinforcing = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      effectiveCancellationRatio: 0,
    });
    const canceled = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      effectiveCancellationRatio: 1,
    });

    expect(canceled.signedRadianceAuthority).toBeCloseTo(
      1 - LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE,
    );
    expect(canceled.photographicFocus).toBeCloseTo(
      reinforcing.photographicFocus,
    );
    expect(canceled.photographicSpectralWeight).toBeCloseTo(
      reinforcing.photographicSpectralWeight * canceled.signedRadianceAuthority,
      6,
    );
    expect(canceled.peakWhiteSignal).toBeCloseTo(
      reinforcing.peakWhiteSignal * canceled.signedRadianceAuthority,
      6,
    );
    expect(canceled.peakWhiteSignal).toBeGreaterThan(
      reinforcing.peakWhiteSignal *
        canceled.signedRadianceAuthority *
        canceled.signedRadianceAuthority,
    );
  });

  it("keeps photographic fringe tied to ridge aperture instead of signed damping", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 0.75,
      broadBand: 1,
      localGradientEvidence: 0.75,
      shellFocus: 0.75,
      shellWeight: 0.7,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      excitationVisibility: 1,
      radialDistance: 0.54,
      normalDotMeasurement: 0.02,
      gradientPresence: 0.94,
      ridgeConcentration: 0.92,
      colorWeight: 1,
    };
    const reinforcing = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      signedRadianceAuthority: 1,
    });
    const canceled = fieldShaping.derivePhotographicCymaticProbe({
      ...common,
      signedRadianceAuthority: 0.18,
    });

    expect(canceled.causticRidgeAuthority).toBeCloseTo(
      reinforcing.causticRidgeAuthority,
    );
    expect(canceled.causticVisibility).toBeCloseTo(
      reinforcing.causticVisibility * canceled.signedRadianceAuthority,
    );
    expect(canceled.physicalDensity / reinforcing.physicalDensity).toBeCloseTo(
      canceled.signedRadianceAuthority,
      6,
    );
    expect(reinforcing.photographicFringeWeight).toBeGreaterThan(
      reinforcing.opticalFringeWeight,
    );
    expect(canceled.photographicFringeWeight).toBeCloseTo(
      reinforcing.photographicFringeWeight,
    );
  });

  it("keeps photographic white peaks local to focused caustic ridges", () => {
    expect(fieldShaping.derivePhotographicCymaticProbe).toBeTypeOf("function");

    const focused = fieldShaping.derivePhotographicCymaticProbe({
      ...REINFORCED_CAUSTIC_TONE,
      signedCausticDensity: 0.18,
      bodyContribution: 0.04,
      radialDistance: 0.54,
      normalDotMeasurement: 0.02,
      gradientPresence: 0.94,
      ridgeConcentration: 0.92,
      colorWeight: 0.7,
    });
    const bodyHeavy = fieldShaping.derivePhotographicCymaticProbe({
      ...BROAD_CONTOUR_LEAK,
      signedCausticDensity: 0.18,
      bodyContribution: 0.16,
      radialDistance: 0.54,
      normalDotMeasurement: 0.92,
      gradientPresence: 0.06,
      ridgeConcentration: 0.1,
      colorWeight: 0.7,
    });

    expect(focused.peakWhiteMix).toBeGreaterThan(0.18);
    expect(bodyHeavy.peakWhiteMix).toBeLessThan(0.08);
    expect(focused.peakWhiteMix).toBeGreaterThan(bodyHeavy.peakWhiteMix * 3);
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
      shellFocus: 0,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      excitationVisibility: 1,
      shellWeight: 1,
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
      shellFocus: 0,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      shellWeight: 1,
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
      shellFocus: 0,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      shellWeight: 1,
      excitationVisibility: 1,
    });
    const quietCoherent = deriveCausticMaterialTransferProbe({
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      modalStructureSupport: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      shellFocus: 0,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      shellWeight: 1,
      excitationVisibility: 0,
    });

    expect(quietCoherent.causticRidgeAuthority).toBeGreaterThan(0.9);
    expect(quietCoherent.causticVisibility).toBeCloseTo(
      excited.causticVisibility,
    );
    expect(quietCoherent.bodyDensity).toBe(0);
    expect(quietCoherent.causticDensity).toBeCloseTo(excited.causticDensity);
  });

  it("reduces caustic body mass for incoherent treble noise", () => {
    const common = {
      fieldAbs: 0.08,
      threshold: 0.15,
      contourCore: 1,
      broadBand: 1,
      localGradientEvidence: 1,
      shellFocus: 0,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 1,
      signedRadianceAuthority: 1,
      excitationVisibility: 1,
      shellWeight: 1,
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
    const tonalBodyRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * tonalTreble.bodyDensity),
    );
    const incoherentBodyRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * incoherentTreble.bodyDensity),
    );

    expect(INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX).toBeCloseTo(0.45);
    expect(incoherentTreble.causticRidgeAuthority).toBeCloseTo(
      tonalTreble.causticRidgeAuthority,
    );
    expect(incoherentTreble.causticVisibility).toBeCloseTo(
      tonalTreble.causticVisibility,
    );
    expect(incoherentTreble.bodyDensity).toBeLessThan(
      tonalTreble.bodyDensity * 0.6,
    );
    expect(computeLinearLuminance(incoherentBodyRgb)).toBeLessThan(
      computeLinearLuminance(tonalBodyRgb) * 0.65,
    );
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
      opticalConvergenceAuthority: 0.42,
      shellFocus: 0.7,
      edgeFade: 1,
      activeMask: 1,
      effectiveUnsignedSupport: 0.58,
      effectiveCancellationRatio: 0.5,
      excitationVisibility: 1,
      shellWeight: 0.72,
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
    const soft = derivePhotographicCymaticProbe({
      ...common,
      contourCore: softContour.contourCore,
      modalStructureSupport: softContour.nodeBand,
    });
    const sharp = derivePhotographicCymaticProbe({
      ...common,
      contourCore: sharpContour.contourCore,
      modalStructureSupport: sharpContour.nodeBand,
    });

    expect(sharpContour.contourCore).toBeLessThan(
      softContour.contourCore * 0.03,
    );
    expect(sharp.causticRidgeAuthority).toBeGreaterThan(
      soft.causticRidgeAuthority * 0.9,
    );
    expect(sharp.visibleDensity ?? sharp.localDensity).toBeGreaterThan(0);
    expect(sharp.localDensity).toBeGreaterThan(soft.localDensity * 0.7);
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

  it("uses a flatter shell-weight range than the prior shell-heavy look", () => {
    expect(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN).toBeCloseTo(0.16);
    expect(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN).toBeLessThan(0.36);
  });

  it("keeps shell weighting restrained near the artifact-prone boundary", () => {
    const shell = deriveShellWeight({
      radialDistance: 0.94,
      rimBloomBias: 0.5,
      bandEnergies: [0.4, 0.3, 0.2, 0.4],
    });

    expect(shell.outerShellAccent).toBeGreaterThan(0.9);
    expect(shell.shellWeight).toBeLessThan(0.82);
  });

  it("adds non-zero interior body density away from the boundary", () => {
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
    });

    expect(BODY_DENSITY_GAIN).toBeCloseTo(0.12);
    expect(body.interiorMask).toBeGreaterThan(0);
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

  it("reduces standalone body density for incoherent treble noise", () => {
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
    const tonalRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * tonalTreble.bodyDensity),
    );
    const incoherentRgb = compressDisplayRadiance(
      [0.72, 0.88, 1].map((channel) => channel * incoherentTreble.bodyDensity),
    );

    expect(incoherentTreble.signedBodyAuthority).toBeCloseTo(
      tonalTreble.signedBodyAuthority,
    );
    expect(incoherentTreble.excitationVisibility).toBeCloseTo(
      tonalTreble.excitationVisibility,
    );
    expect(incoherentTreble.bodyDensity).toBeLessThan(
      tonalTreble.bodyDensity * 0.6,
    );
    expect(computeLinearLuminance(incoherentRgb)).toBeLessThan(
      computeLinearLuminance(tonalRgb) * 0.65,
    );
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

  it("keeps contour shaping dominant while cutting the old fog-heavy fill", () => {
    const contour = deriveContourShape({
      fieldAbs: 0.02,
      threshold: 0.15,
      contourSharpness: 4,
      transientEnergy: 0.5,
    });
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      edgeFade: 0.92,
      activeMask: 1,
      radialDistance: 0.42,
      boundaryMask: 0.04,
    });
    const shell = deriveShellWeight({
      radialDistance: 0.42,
      rimBloomBias: 0.5,
      bandEnergies: [0.4, 0.3, 0.2, 0.1],
    });
    const beam = deriveBeamMask({
      contourShape: contour.contourShape,
      shellWeight: shell.shellWeight,
      localGradientEvidence: 0.7,
      transientEnergy: 0.5,
      spectralFlux: 0.35,
      radialDistance: 0.42,
      rimCompression: 0.2,
      boundaryMask: 0.04,
    });

    expect(CONTOUR_BLEND).toBeCloseTo(0.82);
    expect(BEAM_POWER_BASE).toBeCloseTo(1.55);
    expect(BODY_DENSITY_MIX).toBeCloseTo(0.5);
    expect(contour.contourShape).toBeGreaterThan(contour.contourCore);
    expect(beam.beamMask).toBeGreaterThan(body.bodyDensity);
    expect(body.bodyDensity / beam.beamMask).toBeLessThan(0.16);
  });

  it("compresses the rim contribution before the beam reaches bloom", () => {
    const uncompressed = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      localGradientEvidence: 0.76,
      transientEnergy: 0.55,
      spectralFlux: 0.4,
      radialDistance: 0.91,
      rimCompression: 0,
      boundaryMask: 0.92,
    });
    const compressed = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      localGradientEvidence: 0.76,
      transientEnergy: 0.55,
      spectralFlux: 0.4,
      radialDistance: 0.91,
      rimCompression: 0.72,
      boundaryMask: 0.92,
    });

    expect(compressed.rimCompressionMix).toBeGreaterThan(0);
    expect(compressed.compressedShellWeight).toBeLessThan(
      uncompressed.compressedShellWeight,
    );
    expect(compressed.beamMask).toBeLessThan(uncompressed.beamMask);
  });

  it("documents the CPU parity formula for latched-fog beam reduction", () => {
    const baseline = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      localGradientEvidence: 0.76,
      transientEnergy: 0.2,
      spectralFlux: 0.08,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.14,
    });
    const fogged = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      localGradientEvidence: 0.76,
      transientEnergy: 0.2,
      spectralFlux: 0.08,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });

    expect(LATCHED_FOG_BEAM_REDUCTION).toBeCloseTo(0.12);
    expect(fogged.latchedFogMask).toBeGreaterThan(0);
    expect(fogged.beamMask).toBeLessThan(baseline.beamMask);
  });

  it("lets current transients recover beam density from latched fog", () => {
    const latched = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      localGradientEvidence: 0.76,
      transientEnergy: 0.02,
      spectralFlux: 0.01,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });
    const reactive = deriveBeamMask({
      contourShape: 0.82,
      shellWeight: 0.88,
      localGradientEvidence: 0.76,
      transientEnergy: 0.56,
      spectralFlux: 0.01,
      radialDistance: 0.72,
      rimCompression: 0.1,
      boundaryMask: 0.2,
      structureSignal: 0.9,
      changeSignal: 0.01,
    });

    expect(reactive.latchedFogMask).toBeLessThan(latched.latchedFogMask * 0.2);
    expect(reactive.beamMask).toBeGreaterThan(latched.beamMask);
  });

  it("gates broad beam radiance when signed interference cancels", () => {
    const canceledRadianceAuthority = deriveFullCancellationRadianceAuthority();
    const reinforcing = deriveBeamMask({
      contourShape: 0.86,
      shellWeight: 0.82,
      localGradientEvidence: 0.78,
      transientEnergy: 0.34,
      spectralFlux: 0.28,
      radialDistance: 0.58,
      rimCompression: 0.16,
      boundaryMask: 0.1,
      signedRadianceAuthority: 1,
    });
    const canceling = deriveBeamMask({
      contourShape: 0.86,
      shellWeight: 0.82,
      localGradientEvidence: 0.78,
      transientEnergy: 0.34,
      spectralFlux: 0.28,
      radialDistance: 0.58,
      rimCompression: 0.16,
      boundaryMask: 0.1,
      signedRadianceAuthority: canceledRadianceAuthority,
    });

    expect(canceling.beamMask).toBeLessThan(reinforcing.beamMask * 0.32);
    expect(reinforcing.beamCore).toBeCloseTo(canceling.beamCore);
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

    expect(STRUCTURE_AWARE_EMISSION_MIN_GAIN).toBeCloseTo(0.34);
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
    expect(denseHighlightedBodyFill.emissionGain).toBeLessThan(0.42);
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

  it("preserves the base palette while shifting toward a cool holographic tint", () => {
    const result = deriveHolographicColorMix({
      baseColor: [0.18, 0.36, 0.62],
      surfaceColor: [0.4, 0.72, 0.92],
      holographicShift: 0.35,
      holographicFresnel: 0.42,
    });

    expect(result.colorMix).toBeGreaterThan(0);
    expect(result.colorMix).toBeLessThan(1);
    expect(result.holographicColor[0]).toBeGreaterThan(0.18);
    expect(result.holographicColor[2]).toBeGreaterThan(0.62);
    expect(result.holographicColor).not.toEqual(result.accentColor);
  });
});
