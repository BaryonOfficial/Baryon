import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  RAYMARCH_BOUNDARY_TUNING,
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  RAYMARCH_SPECTRAL_LIGHT_TUNING,
  createRaymarchVolumeMesh,
  getRaymarchMaterialCache,
  setRaymarchBoundaryMode,
  setRaymarchCavityGeometry,
  setRaymarchSpectralLightEvaluationMode,
} from "./material.js";
import { createVisualizationUniforms } from "../visualizationUniforms.js";
import {
  raymarchOpacityNode,
} from "./SafeVolumetricLightingModel.js";
import {
  createRaymarchEffectiveFieldCache,
  createRaymarchSpectralLightCache,
} from "./fieldCache.js";

function makeMeshUniforms(overrides = {}) {
  const base = createVisualizationUniforms({
    radius: 3,
    threshold: 0.02,
  });
  return { ...base, ...overrides };
}

function expectSourceIndex(source, needle) {
  const index = source.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("raymarch volume material", () => {
  it("does not expose a product-controlled structure gradient window", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const forbiddenIdentifiers = [
      "uStructureMin",
      "uStructureMax",
      "structureMin",
      "structureMax",
      "gradientMin",
      "gradientMax",
      "structureFloor",
      "structureCeiling",
    ];

    for (const identifier of forbiddenIdentifiers) {
      expect(source).not.toContain(identifier);
    }
    expect(source).not.toMatch(/const\s+structure\s*=/);
    expect(source).not.toMatch(
      /smoothstep\(\s*[^,\n]+(?:Min|Floor)[^,]*,\s*[^,\n]+(?:Max|Ceiling)[^,]*,\s*normalizedGradMagnitude/s,
    );
  });

  it("uses observation transfer as the only shader density visibility lane", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const modalStructureAnchorStart = source.indexOf(
      "const modalStructureAnchor =",
    );
    const ridgeAnchorStart = source.indexOf("const ridgeAnchor =");
    const causticFocusStart = source.indexOf("const causticFocusAuthority =");
    const causticDensityStart = source.indexOf("const causticDensity =");
    const ridgeConcentrationStart = source.indexOf(
      "const ridgeConcentration =",
    );
    const observationEnergyStart = source.indexOf(
      "const observationEnergy = clamp(",
    );
    const observationSupportStart = source.indexOf(
      "const observationSupport = clamp(",
    );
    const observationResponseStart = source.indexOf(
      "const observationResponse =",
    );
    const modalStructureAnchorBlock = source.slice(
      modalStructureAnchorStart,
      ridgeAnchorStart,
    );
    const observationEnergyBlock = source.slice(
      observationEnergyStart,
      observationSupportStart,
    );

    expect(causticFocusStart).toBeGreaterThanOrEqual(0);
    expect(causticDensityStart).toBeGreaterThan(causticFocusStart);
    expect(ridgeConcentrationStart).toBeGreaterThan(causticDensityStart);
    expect(modalStructureAnchorStart).toBeGreaterThanOrEqual(0);
    expect(ridgeAnchorStart).toBeGreaterThan(modalStructureAnchorStart);
    expect(observationEnergyStart).toBeGreaterThanOrEqual(0);
    expect(observationResponseStart).toBeGreaterThan(observationEnergyStart);
    expect(observationSupportStart).toBeGreaterThan(observationEnergyStart);
    expect(observationSupportStart).toBeGreaterThan(observationResponseStart);
    expect(source).toContain("deriveObservationTransferNode");
    expect(source).toContain("uObservationDensityFadeStart");
    expect(source).toContain("uObservationDensityFadeEnd");
    expect(source).toContain("uObservationTransferGain");
    expect(source).toContain("uObservationDensityFloor");
    expect(source).toContain("uObservationContourSupportScale");
    expect(source).not.toContain("OBSERVATION_TRANSFER_DEFAULTS");
    expect(source).not.toContain("deriveVisibleDensityNode");
    expect(source).not.toContain("BASS_STRUCTURE_FLOOR");
    expect(source).not.toContain("lowQBackboneRidge");
    expect(source).not.toContain("lowQBackboneContourAccent");
    expect(source).not.toContain("retainedHighQRidge");
    expect(source).not.toContain("retainedHighQContourAccent");
    expect(modalStructureAnchorBlock).not.toContain("visibleStructure");
    expect(modalStructureAnchorBlock).not.toContain(".mul(structure)");
    expect(modalStructureAnchorBlock).not.toContain("ridgeConcentration");
    expect(modalStructureAnchorBlock).not.toContain("compressedShellWeight");
    expect(observationEnergyBlock).toContain("observationEnergy).pow");
    expect(observationEnergyBlock).toContain("observationResponse");
    expect(observationEnergyBlock).not.toContain("phaseCoherentFieldEnergy");
  });

  it("keeps rim compression out of modal observation support", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const rimCompressionStart = expectSourceIndex(
      source,
      "const compressedShellWeight =",
    );
    const modalStructureAnchorStart = expectSourceIndex(
      source,
      "const modalStructureAnchor =",
    );
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );
    const modalStructureAnchorBlock = source.slice(
      modalStructureAnchorStart,
      observationTransferStart,
    );

    expect(rimCompressionStart).toBeLessThan(modalStructureAnchorStart);
    expect(modalStructureAnchorBlock).toContain("causticRidgeAuthority");
    expect(modalStructureAnchorBlock).not.toContain("compressedShellWeight");
    expect(modalStructureAnchorBlock).not.toContain("rimCompression");
  });

  it("does not feed raw gradient or contour-only support into observation density authority", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("ridgeSupportAnchor");
    expect(source).not.toContain("max(contourShape, ridgeConcentration)");
    expect(source).not.toContain("max(ridgeAnchor, fieldGradientMagnitude)");
    expect(source).not.toContain("modalStructureAnchor.mul(ridgePhysicalAnchor)");
    expect(source).toMatch(
      /const contourRidgeAnchor = clamp\(ridgeAnchor, float\(0\.0\), float\(1\.0\)\);/,
    );
  });

  it("keeps presentation contour sharpness out of physical caustic support", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const contourCoreStart = expectSourceIndex(source, "const contourCore =");
    const modalStructureSupportStart = expectSourceIndex(
      source,
      "const modalStructureSupport =",
    );
    const causticFocusStart = expectSourceIndex(
      source,
      "const causticFocusAuthority =",
    );
    const causticRidgeStart = expectSourceIndex(
      source,
      "const causticRidgeAuthority =",
    );
    const causticFocusBlock = source.slice(causticFocusStart, causticRidgeStart);

    expect(modalStructureSupportStart).toBeGreaterThan(contourCoreStart);
    expect(causticFocusStart).toBeGreaterThan(modalStructureSupportStart);
    expect(causticFocusBlock).toContain("modalStructureSupport");
    expect(causticFocusBlock).not.toContain("gradientFieldAuthority.mul(contourCore)");
    expect(causticFocusBlock).not.toContain("shellFocus.mul(contourCore)");
  });

  it("gates broad body fill by signed field mass authority before observation", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const signedAuthorityStart = expectSourceIndex(
      source,
      "const signedBodyAuthority =",
    );
    const bodyDensityStart = expectSourceIndex(source, "const bodyDensity =");
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );

    expect(bodyDensityStart).toBeGreaterThan(signedAuthorityStart);
    expect(observationTransferStart).toBeGreaterThan(bodyDensityStart);
    expect(source).toContain("SIGNED_INTERFERENCE_BODY_AUTHORITY_START");
    expect(source).toContain("SIGNED_INTERFERENCE_BODY_AUTHORITY_END");
    expect(source).toContain("SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER");
    expect(source).toMatch(
      /const signedBodyAuthority = smoothstep\(\s*float\(SIGNED_INTERFERENCE_BODY_AUTHORITY_START\),\s*float\(SIGNED_INTERFERENCE_BODY_AUTHORITY_END\),\s*normalizedFieldAbs,?\s*\)\.pow\(\s*float\(SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER\),?\s*\);/,
    );
    expect(source).toMatch(/\.mul\(\s*signedBodyAuthority\s*\)/);
  });

  it("uses shared incoherent-treble suppression for body fill", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const suppressionStart = expectSourceIndex(
      source,
      "const incoherentTrebleSuppression =",
    );
    const bodyDensityStart = expectSourceIndex(source, "const bodyDensity =");
    const suppressionBlock = source.slice(suppressionStart, bodyDensityStart);

    expect(bodyDensityStart).toBeGreaterThan(suppressionStart);
    expect(source).toContain("INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX");
    expect(suppressionBlock).toContain("uTrebleBroadbandEnergy");
    expect(suppressionBlock).toContain("uModeCoherence");
    expect(suppressionBlock).not.toContain("float(0.45)");
  });

  it("uses effective-field support metadata to gate empty-field transfer", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const supportSampleStart = expectSourceIndex(
      source,
      "const effectiveFieldSupportSample =",
    );
    const cancellationSuppressionStart = expectSourceIndex(
      source,
      "const cancellationSuppression =",
    );
    const localFieldSupportAuthorityStart = expectSourceIndex(
      source,
      "const localFieldSupportAuthority =",
    );
    const bodyDensityStart = expectSourceIndex(source, "const bodyDensity =");
    const causticRidgeAuthorityStart = expectSourceIndex(
      source,
      "const causticRidgeAuthority =",
    );
    const causticVisibilityStart = expectSourceIndex(
      source,
      "const causticVisibility =",
    );
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );

    expect(source).toContain("effectiveFieldSupportTexture");
    expect(cancellationSuppressionStart).toBeGreaterThan(supportSampleStart);
    expect(localFieldSupportAuthorityStart).toBeGreaterThan(
      cancellationSuppressionStart,
    );
    expect(bodyDensityStart).toBeGreaterThan(cancellationSuppressionStart);
    expect(causticRidgeAuthorityStart).toBeGreaterThan(
      cancellationSuppressionStart,
    );
    expect(observationTransferStart).toBeGreaterThan(bodyDensityStart);
    expect(source).toMatch(/\.mul\(\s*cancellationSuppression\s*\)/);
    expect(source).toContain("EFFECTIVE_FIELD_CANCELLATION_SUPPRESSION_SCALE");
    expect(source).not.toContain(".mul(float(0.85))");
    expect(
      source.slice(causticRidgeAuthorityStart, causticVisibilityStart),
    ).not.toContain("cancellationSuppression");
    expect(
      source.slice(causticVisibilityStart, causticVisibilityStart + 180),
    ).toMatch(/\.mul\(\s*cancellationSuppression\s*\)/);
    expect(
      source.slice(observationTransferStart, observationTransferStart + 260),
    ).toContain("cancellationSuppression");
    expect(
      source.slice(localFieldSupportAuthorityStart, causticVisibilityStart),
    ).toContain("localFieldSupportAuthority");
    expect(
      source.slice(localFieldSupportAuthorityStart, causticVisibilityStart),
    ).toContain("const gradientFieldAuthority =");
    expect(
      source.slice(localFieldSupportAuthorityStart, causticVisibilityStart),
    ).toContain("const supportStructureAuthority =");
    expect(
      source.slice(localFieldSupportAuthorityStart, causticVisibilityStart),
    ).toContain("shellFocus.mul(supportStructureAuthority)");
    expect(
      source.slice(localFieldSupportAuthorityStart, causticVisibilityStart),
    ).toContain("max(localGradientEvidence, signedBodyAuthority)");
    expect(source).not.toContain("effectiveSupportDensity");
  });

  it("lets effective support own caustic focus without body fill", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const supportStructureStart = expectSourceIndex(
      source,
      "const supportStructureAuthority =",
    );
    const causticFocusStart = expectSourceIndex(
      source,
      "const causticFocusAuthority =",
    );
    const causticRidgeStart = expectSourceIndex(
      source,
      "const causticRidgeAuthority =",
    );
    const bodyDensityStart = expectSourceIndex(source, "const bodyDensity =");
    const dampedBodyDensityStart = expectSourceIndex(
      source,
      "const dampedBodyDensity =",
    );
    const causticFocusBlock = source.slice(
      causticFocusStart,
      causticRidgeStart,
    );
    const bodyDensityBlock = source.slice(
      bodyDensityStart,
      dampedBodyDensityStart,
    );

    expect(supportStructureStart).toBeLessThan(causticFocusStart);
    expect(causticFocusBlock).toContain(
      "shellFocus.mul(supportStructureAuthority)",
    );
    expect(causticFocusBlock).toContain(
      "gradientFieldAuthority.mul(modalStructureSupport)",
    );
    expect(causticFocusBlock).toContain(
      "shellFocus.mul(modalStructureSupport).mul(shellFieldAuthority)",
    );
    expect(bodyDensityBlock).not.toContain("supportStructureAuthority");
  });

  it("keeps excitation out of shader caustic visibility support", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const causticVisibilityStart = expectSourceIndex(
      source,
      "const causticVisibility =",
    );
    const causticDensityStart = expectSourceIndex(
      source,
      "const causticDensity =",
    );
    const bodyDensityStart = expectSourceIndex(source, "const bodyDensity =");
    const causticVisibilityBlock = source.slice(
      causticVisibilityStart,
      causticDensityStart,
    );
    const bodyDensityBlock = source.slice(
      bodyDensityStart,
      bodyDensityStart + 560,
    );

    expect(causticVisibilityStart).toBeLessThan(causticDensityStart);
    expect(source).not.toContain("causticExcitationVisibility");
    expect(source).not.toContain("CAUSTIC_VISIBILITY_FLOOR");
    expect(causticVisibilityBlock).toContain("causticRidgeAuthority");
    expect(causticVisibilityBlock).toContain("cancellationSuppression");
    expect(causticVisibilityBlock).not.toContain(".mul(excitationVisibility)");
    expect(bodyDensityBlock).toContain(
      ".mul(excitationVisibility.pow(float(1.2)))",
    );
  });

  it("keeps signed cancellation as observation visibility rather than ridge geometry", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const observationHelperStart = expectSourceIndex(
      source,
      "function deriveObservationTransferNode(",
    );
    const observationHelperEnd = expectSourceIndex(
      source,
      "function createRaymarchOffsetNode",
    );
    const observationHelperBlock = source.slice(
      observationHelperStart,
      observationHelperEnd,
    );

    expect(observationHelperBlock).toContain("signedRadianceAuthority");
    expect(observationHelperBlock).toContain(
      "modalStructureAnchor.mul(signedRadianceAuthority)",
    );
  });

  it("gates shader contour support by the same observation anchor as density", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const observationHelperStart = expectSourceIndex(
      source,
      "function deriveObservationTransferNode(",
    );
    const observationHelperEnd = expectSourceIndex(
      source,
      "function createRaymarchOffsetNode",
    );
    const observationHelperBlock = source.slice(
      observationHelperStart,
      observationHelperEnd,
    );

    expect(observationHelperBlock).toMatch(
      /const observedDensityFloor = clamp\(\s*observationSupport\.mul\(observationAnchor\)\.mul\(observationDensityFloor\)/s,
    );
    expect(observationHelperBlock).toMatch(
      /const observedContourSupport = clamp\(\s*observationSupport\s*\.mul\(observationAnchor\)\s*\.mul\(contourRidgeAnchor\)\s*\.mul\(observationContourSupportScale\)/s,
    );
  });

  it("does not spend the local observation anchor inside shader response support", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const observationHelperStart = expectSourceIndex(
      source,
      "function deriveObservationTransferNode(",
    );
    const observationHelperEnd = expectSourceIndex(
      source,
      "function createRaymarchOffsetNode",
    );
    const observationHelperBlock = source.slice(
      observationHelperStart,
      observationHelperEnd,
    );

    expect(observationHelperBlock).toMatch(
      /exp\(\s*observationResponse\s*\.mul\(observationTransferGain\.negate\(\)\)/s,
    );
    expect(observationHelperBlock).not.toMatch(
      /observationResponse\s*\.mul\(observationAnchor\)\s*\.mul\(observationTransferGain\.negate\(\)\)/s,
    );
  });

  it("keeps final radiance downstream of cancellation-suppressed density", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const cancellationSuppressionStart = expectSourceIndex(
      source,
      "const cancellationSuppression =",
    );
    const densityStart = expectSourceIndex(source, "const density =");
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );
    const stabilizedDensityStart = expectSourceIndex(
      source,
      "const stabilizedDensity = visibleDensity;",
    );
    const finalRadianceStart = expectSourceIndex(
      source,
      "return volumeColor.mul(stabilizedDensity).mul(structureAwareEmissionGain);",
    );
    const finalRadianceBlock = source.slice(
      stabilizedDensityStart,
      finalRadianceStart,
    );

    expect(densityStart).toBeGreaterThan(cancellationSuppressionStart);
    expect(observationTransferStart).toBeGreaterThan(densityStart);
    expect(stabilizedDensityStart).toBeGreaterThan(observationTransferStart);
    expect(finalRadianceStart).toBeGreaterThan(stabilizedDensityStart);
    expect(finalRadianceBlock).not.toContain("effectiveUnsignedSupport");
    expect(finalRadianceBlock).not.toContain("effectiveCancellationRatio");
  });

  it("lets observation-rescued density participate in optical highlight readout", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );
    const visibleDensityStart = expectSourceIndex(
      source,
      "const { visibleDensity } = observationTransfer;",
    );
    const highlightMaskStart = expectSourceIndex(
      source,
      "const highlightMask = smoothstep(",
    );
    const stabilizedDensityStart = expectSourceIndex(
      source,
      "const stabilizedDensity = visibleDensity;",
    );
    const highlightMaskBlock = source.slice(
      highlightMaskStart,
      stabilizedDensityStart,
    );

    expect(visibleDensityStart).toBeGreaterThan(observationTransferStart);
    expect(highlightMaskStart).toBeGreaterThan(visibleDensityStart);
    expect(highlightMaskBlock).toContain("visibleDensity");
    expect(highlightMaskBlock).not.toContain("physicalVisibleDensity");
  });

  it("samples only the canonical effective field texture for field ownership", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("effectiveFieldTexture");
    expect(source).not.toContain("fieldCacheTexture");
    expect(source).not.toContain("phaseCoherentFieldTexture");
    expect(source).not.toContain("signedPhaseContribution");
    expect(source).not.toContain("phaseCoherentSignedDisplacement");
  });

  it("keeps cached effective field ownership texture-only", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const amplitudeNormStart = expectSourceIndex(
      source,
      "const amplitudeNorm =",
    );
    const cachedBranchStart = source.indexOf(
      "if (effectiveFieldTexture) {",
      amplitudeNormStart,
    );
    const effectiveFieldStart = source.indexOf(
      "const effectiveField = field;",
      cachedBranchStart,
    );
    const cachedBranchBlock = source.slice(
      cachedBranchStart,
      effectiveFieldStart,
    );

    expect(cachedBranchStart).toBeGreaterThanOrEqual(0);
    expect(effectiveFieldStart).toBeGreaterThan(cachedBranchStart);
    expect(source).not.toContain("function accumulateCachedLiveResidual({");
    expect(source).not.toContain("directFieldEvaluationEnabled");
    expect(source).not.toContain("function accumulateDirectModalField");
    expect(source).not.toContain("function accumulateModalField");
    expect(source).not.toContain("setRaymarchFieldEvaluationMode");
    expect(source).not.toContain("fieldEvaluationMode");
    expect(cachedBranchBlock).not.toContain("accumulateCachedLiveResidual({");
    expect(cachedBranchBlock).not.toContain("evaluateFieldNode({");
    expect(cachedBranchBlock).not.toContain("modalFieldPhaseBuffer.element(i)");
    expect(cachedBranchBlock).not.toContain("end: int(modalFieldCapacity)");
  });

  it("keeps direct modal field evaluation out of the material shader", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("modalFieldModeBuffer");
    expect(source).not.toContain("modalFieldColorBuffer");
    expect(source).not.toContain("modalFieldPhaseBuffer");
    expect(source).not.toContain("modalFieldCapacity");
    expect(source).not.toContain("evaluateModeNode({");
    expect(source).not.toContain("cos(phase)");
    expect(source).not.toContain("phaseCurrentCoefficient");
    expect(source).not.toContain("unsignedSupport.addAssign");
    expect(source).toContain("uModalFieldModeCount");
    expect(source).not.toContain("function accumulateFieldLayers");
    expect(source).not.toContain("function accumulateColorLayers");
    expect(source).not.toContain("DETAIL_LAYER_WEIGHT");
    expect(source).not.toContain("uBackboneModeCount");
    expect(source).not.toContain("uDetailModeCount");
  });

  it("keeps Spectral Light photographic accents above the blandness floor", () => {
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING.contourShadow).toBeGreaterThan(0.95);

    const accentRanges = [
      ["baseRadianceLift", 0.3, 0.55],
      ["hotCoreSurfacePull", 0.22, 0.4],
      ["holographicAccentMix", 0.055, 0.09],
      ["holographicAccentColorPull", 0.3, 0.5],
      ["whiteEmissionLift", 0.028, 0.045],
    ];

    for (const [name, min, max] of accentRanges) {
      expect(RAYMARCH_SPECTRAL_LIGHT_TUNING[name]).toBeGreaterThanOrEqual(min);
      expect(RAYMARCH_SPECTRAL_LIGHT_TUNING[name]).toBeLessThanOrEqual(max);
    }

    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.cachedPresenceEnd,
    ).toBeLessThanOrEqual(0.07);
    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.uncoloredNeutralLift,
    ).toBeLessThanOrEqual(0.04);
  });

  it("keeps Spectral Light chroma from owning display luminance", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralVolumeStart = expectSourceIndex(
      source,
      "const spectralLightVolumeColor =",
    );
    const tintedRadianceStart = expectSourceIndex(
      source,
      "const spectralLightTintedRadiance =",
    );
    const baseRadianceStart = expectSourceIndex(
      source,
      "const spectralLightBaseRadiance = uColor.mul(",
    );
    const volumeAssignStart = expectSourceIndex(
      source,
      "volumeColor.assign(\n            spectralLightTintedRadiance.add(spectralLightBaseRadiance),",
    );
    const finalDensityStart = expectSourceIndex(
      source,
      "return volumeColor.mul(stabilizedDensity)",
    );

    expect(tintedRadianceStart).toBeGreaterThan(spectralVolumeStart);
    expect(baseRadianceStart).toBeGreaterThan(tintedRadianceStart);
    expect(volumeAssignStart).toBeGreaterThan(baseRadianceStart);
    expect(finalDensityStart).toBeGreaterThan(volumeAssignStart);

    const tintedRadianceBlock = source.slice(
      tintedRadianceStart,
      baseRadianceStart,
    );
    const baseRadianceBlock = source.slice(
      baseRadianceStart,
      volumeAssignStart,
    );

    expect(tintedRadianceBlock).toContain("spectralLightWeight");
    expect(tintedRadianceBlock).toContain("spectralLightVolumeColor");
    expect(baseRadianceBlock).toContain("uColor.mul");
    expect(baseRadianceBlock).toContain("baseRadianceLift");
  });

  it("gates Spectral Light tint by local signed support or caustic visibility", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const causticVisibilityStart = expectSourceIndex(
      source,
      "const causticVisibility =",
    );
    const colorGateStart = expectSourceIndex(
      source,
      "const spectralLightColorGate =",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence =",
    );
    const spectralWeightStart = expectSourceIndex(
      source,
      "const spectralLightWeight =",
    );
    const spectralContourColorStart = expectSourceIndex(
      source,
      "const spectralLightContourColor =",
    );
    const colorGateBlock = source.slice(colorGateStart, spectralPresenceStart);
    const spectralWeightBlock = source.slice(
      spectralWeightStart,
      spectralContourColorStart,
    );

    expect(colorGateStart).toBeGreaterThan(causticVisibilityStart);
    expect(spectralWeightStart).toBeGreaterThan(spectralPresenceStart);
    expect(colorGateBlock).toContain(
      "localFieldSupportAuthority.mul(cancellationSuppression)",
    );
    expect(colorGateBlock).toContain("causticVisibility");
    expect(spectralWeightBlock).toContain(".mul(spectralLightPresence)");
    expect(spectralWeightBlock).toContain(".mul(spectralLightColorGate)");
    expect(source).not.toContain("spectralLightBaseColor");
  });

  it("applies Spectral Light projection weight once after modal color is formed", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralWeightStart = expectSourceIndex(
      source,
      "const spectralLightWeight =",
    );
    const contourColorStart = expectSourceIndex(
      source,
      "const spectralLightContourColor =",
    );
    const tintedRadianceStart = expectSourceIndex(
      source,
      "const spectralLightTintedRadiance =",
    );
    const contourBlock = source.slice(contourColorStart, tintedRadianceStart);

    expect(contourColorStart).toBeGreaterThan(spectralWeightStart);
    expect(tintedRadianceStart).toBeGreaterThan(contourColorStart);
    expect(contourBlock).toContain("spectralColor.mul(");
    expect(contourBlock).toContain("spectralColor,");
    expect(contourBlock).not.toContain("spectralLightWeight");
    expect(source).toContain(
      "const spectralLightTintedRadiance = mix(\n            spectralLightUncoloredColor,\n            spectralLightVolumeColor,\n            spectralLightWeight,",
    );
  });

  it("uses whitepaper linear modal-local Spectral Light mixing", () => {
    const source = readFileSync(
      new URL("./fieldCache.js", import.meta.url),
      "utf8",
    );
    const influenceStart = expectSourceIndex(
      source,
      "const localInfluence = abs(contribution).mul(colorSlot.w).toVar();",
    );
    const colorWeightStart = expectSourceIndex(
      source,
      "colorWeight.addAssign(localInfluence);",
    );
    const colorSumStart = expectSourceIndex(
      source,
      "colorSumX.addAssign(localInfluence.mul(colorSlot.x));",
    );
    const textureStoreStart = expectSourceIndex(
      source,
      "vec4(colorSumX, colorSumY, colorSumZ, colorWeight)",
    );

    expect(influenceStart).toBeGreaterThan(0);
    expect(colorWeightStart).toBeGreaterThan(influenceStart);
    expect(colorSumStart).toBeGreaterThan(colorWeightStart);
    expect(colorSumStart).toBeLessThan(textureStoreStart);
    expect(source).not.toContain("colorChromaSum");
    expect(source).not.toContain("colorChromaWeight");
    expect(source).not.toContain("chromaInfluence");
  });

  it("routes white emission through the adaptive highlight target", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { deriveHighlightTargetNode } from "../../render/displayRadiance.js";',
    );
    expect(source).toContain("STATIC_HIGHLIGHT_SURFACE_PULL_SCALE");
    expect(source).toContain("staticWhiteEmissionMix");
    expect(source).toContain("spectralLightWhiteEmissionMix");
    expect(source).toContain(`deriveHighlightTargetNode(
        staticHolographicColor,
        uSurfaceColor,
        staticWhiteEmissionMix,
        float(STATIC_HIGHLIGHT_SURFACE_PULL_SCALE),
      )`);
    expect(source).toContain(`deriveHighlightTargetNode(
            spectralLightHolographicColor,
            uSurfaceColor,
            spectralLightWhiteEmissionMix,
          )`);
    expect(source).not.toContain(`const staticHolographicLaserColor = mix(
        staticHolographicColor,
        vec3(1.0),`);
    expect(source).not
      .toContain(`const spectralLightHolographicLaserColor = mix(
            spectralLightHolographicColor,
        vec3(1.0),`);
  });

  it("scales broad surface-tint pulls in static color mode", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("STATIC_SURFACE_TINT_SCALE");
    expect(source).toContain(
      "spectralColorBias.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
    expect(source).toContain(
      "contourAccent.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
    expect(source).toContain(
      "boundarySurfacePull.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
    expect(source).toContain(
      "holographicColorMix.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
  });

  it("routes optical laser caustic readout into the photographic material path", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const ridgeConcentrationStart = expectSourceIndex(
      source,
      "const ridgeConcentration =",
    );
    const opticalSlopeStart = expectSourceIndex(
      source,
      "const opticalSlopeAuthority =",
    );
    const opticalConvergenceStart = expectSourceIndex(
      source,
      "const opticalConvergenceAuthority =",
    );
    const opticalFocusStart = expectSourceIndex(
      source,
      "const opticalFocusAuthority =",
    );
    const opticalNegativeSpaceStart = expectSourceIndex(
      source,
      "const opticalNegativeSpaceGate =",
    );
    const laserRadianceStart = expectSourceIndex(
      source,
      "const laserCausticRadiance =",
    );
    const opticalBodyStart = expectSourceIndex(
      source,
      "const opticalBodyContribution =",
    );
    const photographicLaserStart = expectSourceIndex(
      source,
      "const photographicLaserCausticRadiance =",
    );
    const photographicRadianceScaleStart = expectSourceIndex(
      source,
      "const photographicRadianceScale =",
    );
    const densityStart = expectSourceIndex(source, "const density = clamp(");
    const photographicRadianceScaleBlock = source.slice(
      photographicRadianceScaleStart,
      photographicLaserStart,
    );
    const opticalNegativeSpaceBlock = source.slice(
      opticalNegativeSpaceStart,
      laserRadianceStart,
    );
    const photographicLaserBlock = source.slice(
      photographicLaserStart,
      densityStart,
    );
    const densityBlock = source.slice(densityStart, densityStart + 420);

    expect(opticalSlopeStart).toBeGreaterThan(ridgeConcentrationStart);
    expect(opticalConvergenceStart).toBeGreaterThan(opticalSlopeStart);
    expect(opticalFocusStart).toBeGreaterThan(opticalConvergenceStart);
    expect(opticalNegativeSpaceStart).toBeGreaterThan(opticalFocusStart);
    expect(laserRadianceStart).toBeGreaterThan(opticalFocusStart);
    expect(opticalBodyStart).toBeGreaterThan(laserRadianceStart);
    expect(photographicLaserStart).toBeGreaterThan(opticalBodyStart);
    expect(photographicRadianceScaleStart).toBeGreaterThan(opticalBodyStart);
    expect(photographicLaserStart).toBeGreaterThan(
      photographicRadianceScaleStart,
    );
    expect(densityStart).toBeGreaterThan(photographicLaserStart);
    expect(photographicRadianceScaleBlock).toContain(
      "PHOTOGRAPHIC_DARK_CAUSTIC_RATIO",
    );
    expect(opticalNegativeSpaceBlock).toContain(
      "opticalFocus.mul(causticRidgeAuthority)",
    );
    expect(opticalNegativeSpaceBlock).not.toContain(
      "opticalFocus.mul(causticVisibility)",
    );
    expect(photographicRadianceScaleBlock).toContain("blackfieldGate");
    expect(photographicLaserBlock).toContain("laserCausticRadiance");
    expect(photographicLaserBlock).toContain("photographicRadianceScale");
    expect(densityBlock).toContain("photographicLaserCausticRadiance");
    expect(densityBlock).toContain(".add(photographicBodyContribution)");
    expect(densityBlock).not.toContain(".add(opticalBodyContribution)");
    expect(densityBlock).not.toContain(
      "rolledCausticDensity\n          .add(adjustedBodyContribution)",
    );
  });

  it("requires gradient presence before optical slope can brighten a sample", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const opticalSlopeStart = expectSourceIndex(
      source,
      "const opticalSlopeAuthority =",
    );
    const opticalFocusStart = expectSourceIndex(
      source,
      "const opticalFocusAuthority =",
    );
    const opticalSlopeBlock = source.slice(
      opticalSlopeStart,
      opticalFocusStart,
    );

    expect(opticalSlopeBlock).toContain(".mul(localGradientEvidence)");
    expect(opticalSlopeBlock).toContain("OPTICAL_SLOPE_POWER");
    expect(opticalSlopeBlock).toContain("dot(gradientNormal");
  });

  it("uses normal convergence as the optical focus owner", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const convergenceHelperStart = expectSourceIndex(
      source,
      "function deriveOpticalConvergenceAuthorityNode",
    );
    const opticalConvergenceStart = expectSourceIndex(
      source,
      "const opticalConvergenceAuthority =",
    );
    const opticalFocusStart = expectSourceIndex(
      source,
      "const opticalFocusAuthority =",
    );
    const laserRadianceStart = expectSourceIndex(
      source,
      "const laserCausticRadiance =",
    );
    const opticalFocusBlock = source.slice(opticalFocusStart, laserRadianceStart);

    expect(opticalConvergenceStart).toBeGreaterThan(convergenceHelperStart);
    expect(opticalFocusStart).toBeGreaterThan(opticalConvergenceStart);
    expect(source).toContain("sampleFieldGradientNormalNode");
    expect(source).toContain("normalPositiveT1");
    expect(source).toContain("normalNegativeT1");
    expect(source).toContain("normalPositiveT2");
    expect(source).toContain("normalNegativeT2");
    const deletedGradientFocusLiteral =
      "float(0.65).add(" + "localGradientEvidence.mul(float(0." + "35)))";

    expect(source).not.toContain(deletedGradientFocusLiteral);
    expect(source).not.toContain("OPTICAL_CONVERGENCE_GAIN");
    expect(opticalFocusBlock).toContain("opticalConvergenceAuthority");
    expect(opticalFocusBlock).toContain(
      "opticalSlopeAuthority.mul(opticalConvergenceAuthority)",
    );
    expect(opticalFocusBlock).toContain(
      "ridgeConcentration.mul(opticalConvergenceAuthority)",
    );
    expect(opticalFocusBlock).not.toContain("localGradientEvidence");
    expect(opticalFocusBlock).not.toContain("OPTICAL_" + "SLOPE_GAIN");
    expect(opticalFocusBlock).not.toContain("OPTICAL_" + "RIDGE_GAIN");
  });

  it("keeps the optical measurement pass off the spherical startup path", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("sphericalCavityModes");
    expect(source).not.toContain("sphericalModeFamily");
    expect(source).not.toContain("sphericalModeFamilyNode");
  });

  it("keeps broad body authority out of nodal radiance lanes", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const signedBodyStart = expectSourceIndex(
      source,
      "const signedBodyAuthority =",
    );
    const causticDensityStart = expectSourceIndex(
      source,
      "const causticDensity =",
    );
    const modalStructureAnchorStart = expectSourceIndex(
      source,
      "const modalStructureAnchor =",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence =",
    );

    expect(causticDensityStart).toBeGreaterThan(signedBodyStart);
    expect(modalStructureAnchorStart).toBeGreaterThan(signedBodyStart);
    expect(spectralPresenceStart).toBeGreaterThan(signedBodyStart);
    expect(source).not.toContain("signedFieldRadianceAuthority");
  });

  it("routes physical density through the photographic blackfield readout", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const shellFocusStart = expectSourceIndex(source, "const shellFocus =");
    const opticalFocusStart = expectSourceIndex(source, "const opticalFocus =");
    const photographicShellStart = expectSourceIndex(
      source,
      "const photographicShellAuthority =",
    );
    const photographicFocusStart = expectSourceIndex(
      source,
      "const photographicFocus =",
    );
    const blackfieldGateStart = expectSourceIndex(
      source,
      "const blackfieldGate =",
    );
    const photographicBodyStart = expectSourceIndex(
      source,
      "const photographicBodyContribution =",
    );
    const photographicLaserStart = expectSourceIndex(
      source,
      "const photographicLaserCausticRadiance =",
    );
    const densityStart = expectSourceIndex(source, "const density = clamp(");
    const blackfieldGateBlock = source.slice(
      blackfieldGateStart,
      photographicBodyStart,
    );
    const densityBlock = source.slice(densityStart, densityStart + 520);

    expect(photographicShellStart).toBeGreaterThan(shellFocusStart);
    expect(photographicFocusStart).toBeGreaterThan(opticalFocusStart);
    expect(blackfieldGateStart).toBeGreaterThan(photographicFocusStart);
    expect(photographicBodyStart).toBeGreaterThan(blackfieldGateStart);
    expect(photographicLaserStart).toBeGreaterThan(photographicFocusStart);
    expect(densityStart).toBeGreaterThan(photographicBodyStart);
    expect(source).toContain("PHOTOGRAPHIC_BLACKFIELD_GATE_START");
    expect(source).toContain("PHOTOGRAPHIC_DARK_BODY_RATIO");
    expect(blackfieldGateBlock).toContain(
      "photographicFocus.mul(causticRidgeAuthority)",
    );
    expect(blackfieldGateBlock).not.toContain(
      "photographicFocus.mul(causticVisibility)",
    );
    expect(source).not.toContain("PHOTOGRAPHIC_LOW_FOCUS_BODY_RATIO_MAX");
    expect(source).not.toContain("PHOTOGRAPHIC_HIGH_FOCUS_BODY_RATIO_MAX");
    expect(source).not.toContain("OPTICAL_LOW_FOCUS_BODY_RATIO_MAX");
    expect(source).not.toContain("OPTICAL_HIGH_FOCUS_BODY_RATIO_MAX");
    expect(densityBlock).toContain("photographicLaserCausticRadiance");
    expect(densityBlock).toContain(".add(photographicBodyContribution)");
    expect(densityBlock).not.toContain(".add(opticalBodyContribution)");
    expect(densityBlock).not.toContain(
      "rolledCausticDensity\n          .add(adjustedBodyContribution)",
    );
  });

  it("keeps gradient confidence out of photographic aperture support", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const apertureStart = expectSourceIndex(
      source,
      "const apertureAuthority =",
    );
    const shellSuppressionStart = expectSourceIndex(
      source,
      "const shellSuppression =",
    );
    const apertureBlock = source.slice(apertureStart, shellSuppressionStart);

    expect(apertureBlock).toContain(".mul(contourCore)");
    expect(apertureBlock).not.toContain("localGradientEvidence");
  });

  it("keeps photographic color and white emission downstream of density", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const densityStart = expectSourceIndex(source, "const density = clamp(");
    const fringeStart = expectSourceIndex(
      source,
      "const photographicFringeWeight =",
    );
    const hotCoreStart = expectSourceIndex(source, "const hotCoreMix =");
    const holographicMixStart = expectSourceIndex(
      source,
      "const holographicColorMix =",
    );
    const whiteEmissionStart = expectSourceIndex(
      source,
      "const crowdedWhiteEmissionMix =",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence =",
    );
    const spectralColorStart = expectSourceIndex(
      source,
      "const spectralColor =",
    );
    const fringeBlock = source.slice(fringeStart, hotCoreStart);
    const hotCoreBlock = source.slice(hotCoreStart, holographicMixStart);
    const holographicBlock = source.slice(
      holographicMixStart,
      whiteEmissionStart,
    );

    expect(fringeStart).toBeLessThan(densityStart);
    expect(hotCoreStart).toBeGreaterThan(densityStart);
    expect(holographicMixStart).toBeGreaterThan(densityStart);
    expect(whiteEmissionStart).toBeGreaterThan(holographicMixStart);
    expect(spectralColorStart).toBeGreaterThan(densityStart);
    expect(spectralPresenceStart).toBeGreaterThan(densityStart);
    expect(fringeBlock).toContain(
      "photographicFocus.mul(causticRidgeAuthority)",
    );
    expect(fringeBlock).not.toContain(
      "photographicFocus.mul(causticVisibility)",
    );
    expect(hotCoreBlock).toContain("photographicLaserCausticRadiance");
    expect(hotCoreBlock).toContain("photographicFocus");
    expect(holographicBlock).toContain("photographicFringeWeight");
    expect(holographicBlock).toContain("photographicFocus");
    expect(source).not.toContain("legacyOpticalBodyContribution");
    expect(source).not.toContain("oldBodyContribution");
  });

  it("softens Dirichlet beam lighting so nodal planes do not dominate", () => {
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletBeamDensity).toBeGreaterThan(0.55);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletBeamDensity).toBeLessThan(0.75);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletHotCore).toBeLessThan(0.15);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletSurfacePull).toBeLessThan(0.12);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletWhiteEmission).toBeLessThan(0.1);
  });

  it("binds volumetric opacity to the material alpha path", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.outputNode).toBeTruthy();
    expect(mesh.material.offsetNode).toBeTruthy();
    expect(raymarchOpacityNode.isPropertyNode).toBe(true);
  });

  it("keeps the raymarch material runtime bindings intact", () => {
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms,
    });

    expect(mesh.material.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
    expect(mesh.material.radiusNode).toBe(uniforms.uRadius);
    expect(mesh.material.opacityGainNode).toBe(uniforms.uOpacityGain);
    expect(uniforms.uObservationDensityFadeStart.value).toBeCloseTo(0.22);
    expect(uniforms.uObservationDensityFadeEnd.value).toBeCloseTo(0.34);
    expect(uniforms.uObservationTransferGain.value).toBeCloseTo(2.2);
    expect(uniforms.uObservationDensityFloor.value).toBeCloseTo(0.22);
    expect(uniforms.uObservationContourSupportScale.value).toBeCloseTo(0.035);
    expect(uniforms.uModalResponseEnergy.value).toBe(0);
    expect(mesh.userData).not.toHaveProperty("raymarchBackbonePhaseBuffer");
    expect(mesh.userData).not.toHaveProperty("raymarchDetailPhaseBuffer");
  });

  it("binds the canonical effective field texture on the cache-only material", () => {
    const effectiveFieldCache = createRaymarchEffectiveFieldCache({
      resolution: 8,
    });
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      effectiveFieldTexture: effectiveFieldCache.texture,
      effectiveFieldSupportTexture: effectiveFieldCache.supportTexture,
      uniforms,
    });

    expect(mesh.userData.raymarchEffectiveFieldTexture).toBe(
      effectiveFieldCache.texture,
    );
    expect(mesh.material.effectiveFieldTexture).toBe(
      effectiveFieldCache.texture,
    );
    expect(mesh.userData.raymarchEffectiveFieldSupportTexture).toBe(
      effectiveFieldCache.supportTexture,
    );
    expect(mesh.material.effectiveFieldSupportTexture).toBe(
      effectiveFieldCache.supportTexture,
    );
    expect(mesh.userData).not.toHaveProperty("raymarchBackbonePhaseBuffer");
    expect(mesh.userData).not.toHaveProperty("raymarchDetailPhaseBuffer");
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.material).not.toHaveProperty("fieldEvaluationMode");
  });

  it("constructs the material without modal buffers", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
  });

  it("starts cache-only/off and creates no material field-evaluation variants", () => {
    const effectiveFieldCache = createRaymarchEffectiveFieldCache({
      resolution: 8,
    });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      effectiveFieldTexture: effectiveFieldCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    expect(materialCache.neumann.direct).toBeUndefined();
    expect(materialCache.dirichlet.direct).toBeUndefined();
    expect(materialCache.neumann["effective-cached"]).toBeUndefined();
    expect(materialCache.dirichlet["effective-cached"]).toBeUndefined();
    expect(materialCache.neumann.off).toBeTruthy();
    expect(materialCache.dirichlet.off).toBeTruthy();
    expect(materialCache.neumann.cached).toBeUndefined();
    expect(mesh.material).toBe(materialCache.neumann.off);
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(mesh.userData.raymarchCavityGeometry).toBe("rectangular");

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(mesh.material).toBe(materialCache.neumann.cached);
    expect(materialCache.neumann.cached).toBeTruthy();
    expect(materialCache.neumann.direct).toBeUndefined();
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.cached);
    expect(materialCache.dirichlet.cached).toBeTruthy();
    expect(materialCache.dirichlet.direct).toBeUndefined();
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
  });

  it("keeps cavity geometry as cache descriptor state, not a material variant", () => {
    const effectiveFieldCache = createRaymarchEffectiveFieldCache({
      resolution: 8,
    });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      effectiveFieldTexture: effectiveFieldCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    const neumannCachedMaterial = mesh.material;
    setRaymarchCavityGeometry(mesh, "spherical");
    expect(mesh.material).toBe(neumannCachedMaterial);

    setRaymarchBoundaryMode(mesh, "dirichlet");

    expect(mesh.userData.raymarchCavityGeometry).toBe("spherical");
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.cached);
    expect(materialCache.neumann.cached).toBe(neumannCachedMaterial);
    expect(materialCache.neumann.cached.spherical).toBeUndefined();
    expect(materialCache.dirichlet.cached.spherical).toBeUndefined();
  });

  it("keeps Spectral Light material switching on the cache-only field material", () => {
    const effectiveFieldCache = createRaymarchEffectiveFieldCache({
      resolution: 8,
    });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      effectiveFieldTexture: effectiveFieldCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      uniforms: makeMeshUniforms(),
    });

    const offMaterial = mesh.material;
    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );

    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(mesh.material).not.toBe(offMaterial);
    expect(mesh.material).not.toHaveProperty("fieldEvaluationMode");
    expect(mesh.material.effectiveFieldTexture).toBe(
      effectiveFieldCache.texture,
    );
    expect(mesh.material.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );

    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(mesh.material).not.toHaveProperty("fieldEvaluationMode");
    expect(mesh.material.effectiveFieldTexture).toBe(
      effectiveFieldCache.texture,
    );
    expect(mesh.material.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
  });
});
