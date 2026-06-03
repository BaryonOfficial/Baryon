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
import { raymarchOpacityNode } from "./SafeVolumetricLightingModel.js";
import {
  createRaymarchModalBasisCache,
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function estimateSpectralDisplayPeak(luminance) {
  const exposure = clamp(
    RAYMARCH_SPECTRAL_LIGHT_TUNING.hueExposureTarget /
      Math.max(luminance, 0.12),
    RAYMARCH_SPECTRAL_LIGHT_TUNING.hueExposureMin,
    RAYMARCH_SPECTRAL_LIGHT_TUNING.hueExposureMax,
  );
  return (
    exposure /
    (1 + exposure * RAYMARCH_SPECTRAL_LIGHT_TUNING.gamutCompression)
  );
}

function estimateJudgeableMixedSpectralRadiance() {
  const diversity = 0.45;
  const corePeak = estimateSpectralDisplayPeak(0.2126);
  const causticPeak = estimateSpectralDisplayPeak(0.0722);
  const body =
    corePeak *
    RAYMARCH_SPECTRAL_LIGHT_TUNING.spectralBodyRadiance *
    (1 - diversity * RAYMARCH_SPECTRAL_LIGHT_TUNING.bodyDiversitySuppression) *
    0.9 *
    RAYMARCH_SPECTRAL_LIGHT_TUNING.contourShadow;
  const core =
    corePeak * 0.55 * RAYMARCH_SPECTRAL_LIGHT_TUNING.coreCausticGain;
  const rim =
    causticPeak *
    0.38 *
    RAYMARCH_SPECTRAL_LIGHT_TUNING.rimCausticGain *
    (1 + diversity * RAYMARCH_SPECTRAL_LIGHT_TUNING.diversityRimGain);
  const interference =
    causticPeak * 0.2 * RAYMARCH_SPECTRAL_LIGHT_TUNING.interferenceAccentGain;
  const lowLight =
    (corePeak + causticPeak * diversity) *
    RAYMARCH_SPECTRAL_LIGHT_TUNING.chromaticLowLightFloor;

  return (body + core + rim + interference + lowLight) * 0.9;
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
    expect(source).not.toContain(
      "modalStructureAnchor.mul(ridgePhysicalAnchor)",
    );
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
    const causticFocusBlock = source.slice(
      causticFocusStart,
      causticRidgeStart,
    );

    expect(modalStructureSupportStart).toBeGreaterThan(contourCoreStart);
    expect(causticFocusStart).toBeGreaterThan(modalStructureSupportStart);
    expect(causticFocusBlock).toContain("modalStructureSupport");
    expect(causticFocusBlock).not.toContain(
      "gradientFieldAuthority.mul(contourCore)",
    );
    expect(causticFocusBlock).not.toContain("shellFocus.mul(contourCore)");
  });

  it("reuses raymarch sample basis and normalized view direction for optical convergence", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("function offsetBasisUvNode");
    expect(source).toContain("basisUv.add(tangent.mul(sampleUvStep))");
    expect(source).toContain("const convergenceSampleUvStep =");
    expect(source).toContain("const viewDirection = viewDirLocal.toVar();");
    expect(source).toContain("const viewNormalGrazing =");
    expect(source).toContain("const hotCoreCrowdingBase =");
    expect(source).toContain(
      "const tangent2 = cross(viewDirection, tangent1);",
    );
    const convergenceSampleStepStart = expectSourceIndex(
      source,
      "const convergenceSampleStep =",
    );
    const scatteringFnStart = expectSourceIndex(source, "return Fn(");
    expect(convergenceSampleStepStart).toBeLessThan(scatteringFnStart);
    expect(
      source.match(/abs\(dot\(gradientNormal, negViewDirLocal\)\)/g) ?? [],
    ).toHaveLength(1);
    expect(source).not.toContain("viewDirLocal.normalize().toVar()");
    expect(source).not.toContain(
      "const tangent2 = cross(viewDirection, tangent1).normalize();",
    );
    expect(source).not.toContain("const activityAccent = smoothstep");
    expect(source).not.toContain(
      "localPosition: localPosition.add(tangent1.mul(sampleStep))",
    );
    expect(source).not.toContain(
      "localPosition: localPosition.add(tangent2.mul(sampleStep))",
    );
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
    const suppressionBlock = source.slice(
      suppressionStart,
      source.indexOf("return Fn(", suppressionStart),
    );

    expect(bodyDensityStart).toBeGreaterThan(suppressionStart);
    expect(source).toContain("INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX");
    expect(suppressionBlock).toContain("uTrebleBroadbandEnergy");
    expect(suppressionBlock).toContain("uModeCoherence");
    expect(suppressionBlock).not.toContain("float(0.45)");
  });

  it("uses live basis support evidence to gate empty-field transfer", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const supportSampleStart = expectSourceIndex(
      source,
      "const basisSupport = abs(basisSample.x);",
    );
    const basisSamplerStart = expectSourceIndex(
      source,
      "function sampleBasisAtlasPageNode({",
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

    // Live basis sampler derives support directly from |basisSample.x|;
    // the legacy prebaked sampler (and its modalBasisSupportTexture read)
    // were removed in the bin-mapping hygiene pass.
    expect(source).not.toContain("function samplePrebakedFieldTextureNode");
    expect(source.slice(basisSamplerStart)).not.toContain(
      "texture3D(modalBasisSupportTexture)",
    );
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
    expect(source).toContain("LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE");
    expect(source).not.toContain(".mul(float(0.85))");
    expect(
      source.slice(causticRidgeAuthorityStart, causticVisibilityStart),
    ).not.toContain("cancellationSuppression");
    expect(
      source.slice(causticVisibilityStart, causticVisibilityStart + 180),
    ).toMatch(/\.mul\(\s*cancellationSuppression\s*,?\s*\)/);
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

  it("samples only the canonical modal basis atlas texture for field ownership", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("modalBasisAtlasTexture");
    expect(source).not.toContain("fieldCacheTexture");
    expect(source).not.toContain("phaseCoherentFieldTexture");
    expect(source).not.toContain("signedPhaseContribution");
    expect(source).not.toContain("phaseCoherentSignedDisplacement");
  });

  it("synthesizes cached basis pages with live modal inputs", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const amplitudeNormStart = expectSourceIndex(
      source,
      "const amplitudeNorm =",
    );
    const cachedBranchStart = source.indexOf(
      "synthesizeLiveModalFieldNode({",
      amplitudeNormStart,
    );
    const liveFieldStart = source.indexOf(
      "const liveField = field;",
      cachedBranchStart,
    );
    const cachedBranchBlock = source.slice(cachedBranchStart, liveFieldStart);

    expect(cachedBranchStart).toBeGreaterThanOrEqual(0);
    expect(liveFieldStart).toBeGreaterThan(cachedBranchStart);
    expect(source).not.toContain("function accumulateCachedLiveResidual({");
    expect(source).not.toContain("directFieldEvaluationEnabled");
    expect(source).not.toContain("function accumulateDirectModalField");
    expect(source).not.toContain("function accumulateModalField");
    expect(source).not.toContain("setRaymarchFieldEvaluationMode");
    expect(source).not.toContain("fieldEvaluationMode");
    expect(cachedBranchBlock).not.toContain("accumulateCachedLiveResidual({");
    expect(cachedBranchBlock).not.toContain("evaluateFieldNode({");
    expect(source).toContain("function sampleBasisAtlasPageNode({");
    expect(source).toContain("modalFieldCoefficientBuffer?.element(i)");
    expect(source).toContain("end: int(normalizedLiveSynthesisModeCount)");
    expect(source).toContain("liveSynthesisModeCount: modalFieldCapacity");
  });

  it("zeros live-synthesis cancellation ratio when unsigned support is silent", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const synthesizeStart = source.indexOf(
      "function synthesizeLiveModalFieldNode({",
    );
    const synthesizeEnd = source.indexOf(
      "function normalizeModalGradientNormalNode(",
      synthesizeStart,
    );
    const synthesizeBlock = source.slice(synthesizeStart, synthesizeEnd);

    expect(synthesizeBlock).toContain("cancellationSupportEpsilon");
    expect(synthesizeBlock).toContain(
      "greaterThan(cancellationSupportEpsilon)",
    );
    expect(synthesizeBlock).not.toContain(
      "normalizedUnsignedSupport.max(float(1e-4))",
    );
  });

  it("keeps direct modal basis evaluation out of the material shader", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("modalFieldModeBuffer");
    expect(source).not.toContain("modalFieldColorBuffer");
    expect(source).toContain("modalFieldPhaseBuffer");
    expect(source).toContain("modalFieldCoefficientBuffer");
    expect(source).toContain("modalFieldCapacity");
    expect(source).not.toContain("evaluateModeNode({");
    expect(source).toContain("cos(phase)");
    expect(source).not.toContain("phaseCurrentCoefficient");
    expect(source).toContain("unsignedSupport.addAssign");
    expect(source).toContain("uModalFieldModeCount");
    expect(source).not.toContain("function accumulateFieldLayers");
    expect(source).not.toContain("function accumulateColorLayers");
    expect(source).not.toContain("DETAIL_LAYER_WEIGHT");
    expect(source).not.toContain("uBackboneModeCount");
    expect(source).not.toContain("uDetailModeCount");
  });

  it("keeps Spectral caustic gains in a restrained light-through-field range", () => {
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING.contourShadow).toBeGreaterThan(0.95);

    const accentRanges = [
      ["spectralBodyRadiance", 0.14, 0.3],
      ["coreCausticGain", 0.62, 1.05],
      ["rimCausticGain", 1.35, 2.1],
      ["interferenceAccentGain", 0.32, 0.72],
      ["diversityRimGain", 0.45, 0.95],
      ["bodyDiversitySuppression", 0.35, 0.8],
      ["hueExposureTarget", 0.58, 0.8],
      ["hueExposureMin", 0.9, 1.2],
      ["hueExposureMax", 2.0, 2.65],
      ["gamutCompression", 0.2, 0.38],
      ["chromaticLowLightFloor", 0.045, 0.085],
    ];

    for (const [name, min, max] of accentRanges) {
      expect(RAYMARCH_SPECTRAL_LIGHT_TUNING[name]).toBeGreaterThanOrEqual(min);
      expect(RAYMARCH_SPECTRAL_LIGHT_TUNING[name]).toBeLessThanOrEqual(max);
    }

    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.cachedPresenceEnd,
    ).toBeLessThanOrEqual(0.012);
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING).not.toHaveProperty(
      "uncoloredNeutralLift",
    );
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING).not.toHaveProperty(
      "hotCoreSurfacePull",
    );
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING).not.toHaveProperty(
      "holographicAccentColorPull",
    );
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING).not.toHaveProperty(
      "whiteEmissionLift",
    );
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING).not.toHaveProperty(
      "filmGamutCompression",
    );
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING).not.toHaveProperty(
      "filmChromaMin",
    );
  });

  it("keeps mixed Spectral caustics bright enough to judge without neutral rescue", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralBranchStart = expectSourceIndex(
      source,
      "let volumeColor;\n      if (cachedSpectralLightEnabled) {",
    );
    const staticBranchStart = expectSourceIndex(
      source,
      "} else {\n        // Modal coherence warms color; rapid change cools it.",
    );
    const branch = source.slice(spectralBranchStart, staticBranchStart);

    expect(estimateJudgeableMixedSpectralRadiance()).toBeGreaterThanOrEqual(
      1.75,
    );
    expect(branch).not.toContain("uColor");
    expect(branch).not.toContain("uSurfaceColor");
    expect(branch).not.toContain("vec3(1.0)");
    expect(branch).not.toContain("whiteEmissionLift");
    expect(branch).not.toContain("uncoloredNeutralLift");
  });

  it("renders Spectral as caustic core and rim light instead of owner body paint", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const branchStart = expectSourceIndex(
      source,
      "let volumeColor;\n      if (cachedSpectralLightEnabled) {",
    );
    const staticBranchStart = expectSourceIndex(
      source,
      "} else {\n        // Modal coherence warms color; rapid change cools it.",
    );
    const branch = source.slice(branchStart, staticBranchStart);

    expect(branch).toContain("const spectralCoreColor = spectralOwnerColor;");
    expect(branch).toContain("const spectralCausticAccentColor =");
    expect(branch).toContain("const spectralLightDiversity =");
    expect(branch).toContain("const spectralDarkStructureColor =");
    expect(branch).toContain("const spectralCoreCausticRadiance =");
    expect(branch).toContain("const spectralCausticRimRadiance =");
    expect(branch).toContain("const spectralInterferenceRadiance =");
    expect(branch).toContain("rimCausticGain");
    expect(branch).toContain("diversityRimGain");
    expect(branch).toContain("chromaticLowLightFloor");
    expect(branch).not.toContain("const spectralColor = spectralOwnerColor;");
    expect(branch).not.toContain("spectralFilm");
    expect(branch).not.toContain("spectralLightVolumeColor = spectralDisplayColor");
    expect(branch).not.toContain("uColor");
    expect(branch).not.toContain("uSurfaceColor");
  });

  it("keeps Spectral Light luminance independent from static color", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralCoreDisplayStart = expectSourceIndex(
      source,
      "const spectralCoreDisplayColor =",
    );
    const darkStructureStart = expectSourceIndex(
      source,
      "const spectralDarkStructureColor =",
    );
    const rimRadianceStart = expectSourceIndex(
      source,
      "const spectralCausticRimRadiance =",
    );
    const volumeColorStart = expectSourceIndex(
      source,
      "volumeColor = spectralCausticVolumeColor.mul(",
    );
    const finalDensityStart = expectSourceIndex(
      source,
      "return volumeColor.mul(stabilizedDensity)",
    );

    expect(darkStructureStart).toBeGreaterThan(spectralCoreDisplayStart);
    expect(rimRadianceStart).toBeGreaterThan(darkStructureStart);
    expect(volumeColorStart).toBeGreaterThan(rimRadianceStart);
    expect(finalDensityStart).toBeGreaterThan(volumeColorStart);

    const spectralBodySuppressionStart = expectSourceIndex(
      source,
      "const spectralBodySuppression =",
    );
    const spectralBranchBlock = source.slice(
      spectralCoreDisplayStart,
      volumeColorStart,
    );
    const spectralRadianceFormationBlock = source.slice(
      spectralBodySuppressionStart,
      volumeColorStart,
    );

    expect(spectralBranchBlock).toContain("spectralDarkStructureColor");
    expect(spectralBranchBlock).toContain("spectralCoreCausticRadiance");
    expect(spectralBranchBlock).toContain("spectralCausticRimRadiance");
    expect(spectralBranchBlock).toContain("spectralInterferenceRadiance");
    expect(spectralBranchBlock).not.toContain("uColor");
    expect(spectralBranchBlock).not.toContain("uSurfaceColor");
    expect(spectralBranchBlock).not.toContain("baseRadianceLift");
    expect(spectralBranchBlock).not.toContain("spectralLightUncoloredColor");
    expect(spectralBranchBlock).not.toContain("uncoloredNeutralLift");
    expect(spectralBranchBlock).not.toContain("holographicAccentColor");
    expect(spectralBranchBlock).not.toContain("deriveHighlightTargetNode");
    expect(spectralBranchBlock).not.toContain("vec3(1.0)");
    expect(spectralBranchBlock).not.toContain("spectralLightWhiteEmissionMix");
    expect(spectralRadianceFormationBlock).not.toContain("spectralLightWeight");
    expect(spectralBranchBlock).toContain("spectralBodyRadiance");
    expect(spectralBranchBlock).toContain("rimCausticGain");
    expect(spectralBranchBlock).toContain("interferenceAccentGain");
    expect(source).not.toContain("spectralLightEnabled.greaterThan");
  });

  it("projects cached Spectral Light color before visibility gates attenuate density", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence =",
    );
    const spectralWeightStart = expectSourceIndex(
      source,
      "const spectralLightWeight =",
    );
    const spectralBodySuppressionStart = expectSourceIndex(
      source,
      "const spectralBodySuppression =",
    );
    const spectralWeightBlock = source.slice(
      spectralWeightStart,
      spectralBodySuppressionStart,
    );

    expect(spectralWeightStart).toBeGreaterThan(spectralPresenceStart);
    expect(spectralWeightBlock).toContain(".mul(spectralLightPresence)");
    expect(spectralWeightBlock).not.toContain("spectralLightColorGate");
    expect(spectralWeightBlock).not.toContain("causticVisibility");
    expect(source).not.toContain("const spectralLightColorGate =");
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
    const causticVolumeStart = expectSourceIndex(
      source,
      "const spectralCausticVolumeColor =",
    );
    const volumeColorStart = expectSourceIndex(
      source,
      "volumeColor = spectralCausticVolumeColor.mul(",
    );
    const causticBlock = source.slice(spectralWeightStart, volumeColorStart);

    expect(causticVolumeStart).toBeGreaterThan(spectralWeightStart);
    expect(volumeColorStart).toBeGreaterThan(causticVolumeStart);
    expect(causticBlock).not.toContain("uSurfaceColor");
    expect(causticBlock).not.toContain("holographicAccentColor");
    expect(causticBlock).not.toContain("deriveHighlightTargetNode");
    expect(source).toContain(
      "volumeColor = spectralCausticVolumeColor.mul(",
    );
    expect(source).toContain("spectralLightWeight.mul(");
    expect(source).not.toContain("spectralLightUncoloredColor");
  });

  it("uses dominant core ownership plus top-K caustic accent transfer", () => {
    const source = readFileSync(
      new URL("./fieldCache.js", import.meta.url),
      "utf8",
    );
    const materialSource = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const influenceStart = expectSourceIndex(
      source,
      "localInfluence.addAssign(abs(contribution).mul(colorSlot.w));",
    );
    const totalInfluenceStart = expectSourceIndex(
      source,
      "totalInfluence.addAssign(localInfluence);",
    );
    const ownerStart = expectSourceIndex(
      source,
      "ownerInfluence.assign(localInfluence);",
    );
    const ownerTextureStoreStart = expectSourceIndex(
      source,
      "vec4(ownerColorX, ownerColorY, ownerColorZ, totalInfluence)",
    );
    const causticTextureStoreStart = expectSourceIndex(
      source,
      "vec4(causticColorX, causticColorY, causticColorZ, ownerInfluence)",
    );

    expect(influenceStart).toBeGreaterThan(0);
    expect(totalInfluenceStart).toBeGreaterThan(influenceStart);
    expect(ownerStart).toBeGreaterThan(totalInfluenceStart);
    expect(ownerStart).toBeLessThan(ownerTextureStoreStart);
    expect(causticTextureStoreStart).toBeGreaterThan(ownerTextureStoreStart);
    expect(source).toContain("secondaryInfluence.assign");
    expect(source).toContain("tertiaryInfluence.assign");
    expect(source).toContain("causticColorPeak");
    expect(materialSource).toContain(
      "const spectralCoreColor = spectralOwnerColor;",
    );
    expect(materialSource).toContain("const spectralLightDominance =");
    expect(materialSource).toContain("const spectralLightDiversity =");
    expect(materialSource).toContain("const spectralCausticAccentColor =");
    expect(materialSource).toContain("const spectralCoreExposure =");
    expect(materialSource).toContain("const spectralCausticExposure =");
    expect(materialSource).toContain("const spectralCausticRimRadiance =");
    expect(materialSource).toContain(".mul(spectralCoreExposure)");
    expect(materialSource).toContain(".mul(spectralCausticExposure)");
    expect(materialSource).not.toContain("colorSum.div");
    expect(materialSource).not.toContain("spectralMomentX");
    expect(source).not.toContain("colorSumX");
  });

  it("routes white emission through the adaptive highlight target only in static color", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralBranchStart = expectSourceIndex(
      source,
      "let volumeColor;\n      if (cachedSpectralLightEnabled) {",
    );
    const staticBranchStart = expectSourceIndex(
      source,
      "} else {\n        // Modal coherence warms color; rapid change cools it.",
    );
    const spectralBranchBlock = source.slice(
      spectralBranchStart,
      staticBranchStart,
    );

    expect(source).toContain(
      'import { deriveHighlightTargetNode } from "../../render/displayRadiance.js";',
    );
    expect(source).toContain("STATIC_HIGHLIGHT_SURFACE_PULL_SCALE");
    expect(source).toContain("staticWhiteEmissionMix");
    expect(source).not.toContain("spectralLightWhiteEmissionMix");
    expect(source).toContain(`deriveHighlightTargetNode(
          staticHolographicColor,
          uSurfaceColor,
          staticWhiteEmissionMix,
          float(STATIC_HIGHLIGHT_SURFACE_PULL_SCALE),
        )`);
    expect(spectralBranchBlock).not.toContain("deriveHighlightTargetNode");
    expect(spectralBranchBlock).not.toContain("vec3(1.0)");
    expect(source).not.toContain(`const staticHolographicLaserColor = mix(
        staticHolographicColor,
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
    const viewNormalGrazingStart = expectSourceIndex(
      source,
      "const viewNormalGrazing =",
    );
    const opticalFocusStart = expectSourceIndex(
      source,
      "const opticalFocusAuthority =",
    );
    const viewNormalGrazingBlock = source.slice(
      viewNormalGrazingStart,
      opticalSlopeStart,
    );
    const opticalSlopeBlock = source.slice(
      opticalSlopeStart,
      opticalFocusStart,
    );

    expect(viewNormalGrazingStart).toBeLessThan(opticalSlopeStart);
    expect(viewNormalGrazingBlock).toContain("dot(gradientNormal");
    expect(opticalSlopeBlock).toContain(".mul(localGradientEvidence)");
    expect(opticalSlopeBlock).toContain("OPTICAL_SLOPE_POWER");
    expect(opticalSlopeBlock).toContain("viewNormalGrazing");
  });

  it("uses normal convergence as the optical focus owner", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const convergenceHelperStart = expectSourceIndex(
      source,
      "function deriveOpticalConvergenceNormalsNode",
    );
    const opticalConvergenceStart = expectSourceIndex(
      source,
      "const opticalConvergenceAuthority =",
    );
    const opticalGateStart = expectSourceIndex(
      source,
      "const shouldMeasureOpticalConvergence =",
    );
    const opticalMeasurementStart = expectSourceIndex(
      source,
      "If(shouldMeasureOpticalConvergence",
    );
    const convergenceSampleUvStepStart = expectSourceIndex(
      source,
      "const convergenceSampleUvStep =",
    );
    const opticalMeasurementHelperStart = expectSourceIndex(
      source,
      "const measuredOpticalConvergenceAuthority =",
    );
    const opticalFocusStart = expectSourceIndex(
      source,
      "const opticalFocusAuthority =",
    );
    const laserRadianceStart = expectSourceIndex(
      source,
      "const laserCausticRadiance =",
    );
    const opticalFocusBlock = source.slice(
      opticalFocusStart,
      laserRadianceStart,
    );

    expect(opticalConvergenceStart).toBeGreaterThan(convergenceHelperStart);
    expect(opticalGateStart).toBeGreaterThan(opticalConvergenceStart);
    expect(convergenceSampleUvStepStart).toBeLessThan(opticalMeasurementStart);
    expect(opticalMeasurementStart).toBeGreaterThan(opticalGateStart);
    expect(opticalMeasurementHelperStart).toBeGreaterThan(
      opticalMeasurementStart,
    );
    const opticalMeasurementBlock = source.slice(
      opticalMeasurementStart,
      opticalFocusStart,
    );
    expect(opticalMeasurementBlock).toContain("const tangent1 = cross");
    expect(opticalMeasurementBlock).toContain(
      "sampleUvStep: convergenceSampleUvStep",
    );
    expect(opticalFocusStart).toBeGreaterThan(opticalMeasurementHelperStart);
    expect(source).toContain("function computeLiveModalCoefficientNodes");
    expect(source).toContain("deriveOpticalConvergenceNormalsNode");
    expect(source).toContain("gradientPosT1");
    expect(source).toContain("gradientPosT2");
    // Forward difference: two forward offsets (+t1, +t2) reusing the
    // center normal as the N0 baseline — no four-offset (±t1, ±t2) loop.
    expect(source).not.toContain("gradientNegT1");
    expect(source).not.toContain("gradientNegT2");
    expect(source).not.toContain(
      "normalPositiveT1 = sampleFieldGradientNormalNode",
    );
    expect(source).toContain("normalPositiveT1");
    expect(source).toContain("normalPositiveT2");
    expect(source).not.toContain("normalNegativeT1");
    expect(source).not.toContain("normalNegativeT2");
    expect(source).toContain("centerGradientNormal");
    const deletedGradientFocusLiteral =
      "float(0.65).add(" + "localGradientEvidence.mul(float(0." + "35)))";

    expect(source).not.toContain(deletedGradientFocusLiteral);
    expect(source).not.toContain("OPTICAL_CONVERGENCE_GAIN");
    expect(source).toContain("OPTICAL_CONVERGENCE_MEASUREMENT_EPSILON");
    expect(source).toMatch(
      /opticalConvergenceAuthority\.assign\(\s*measuredOpticalConvergenceAuthority/,
    );
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

  it("keeps modal gradient normalization algebraically equivalent", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("function normalizeModalGradientNormalNode(");
    expect(source).toContain(
      "max(length(gradient), amplitudeNorm.mul(float(1e-4)))",
    );
  });

  it("does not let the frame-current projection cache own optical convergence", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const opticalMeasurementStart = expectSourceIndex(
      source,
      "If(shouldMeasureOpticalConvergence",
    );
    const opticalFocusStart = expectSourceIndex(
      source,
      "const opticalFocusAuthority =",
    );
    const opticalMeasurementBlock = source.slice(
      opticalMeasurementStart,
      opticalFocusStart,
    );

    expect(source).toContain("function sampleLiveFieldProjectionCacheNode");
    expect(opticalMeasurementBlock).toContain(
      "assignAtlasOpticalConvergenceAuthority();",
    );
    expect(source).not.toContain("function sampleLiveFieldProjectionNormalNode");
    expect(source).not.toContain(
      "function deriveLiveFieldProjectionConvergenceAuthorityNode",
    );
    expect(opticalMeasurementBlock).not.toContain(
      "uLiveFieldCacheActive.greaterThan",
    );
    expect(opticalMeasurementBlock).not.toContain(
      "deriveLiveFieldProjectionConvergenceAuthorityNode",
    );
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
    const hotCoreInputStart = expectSourceIndex(source, "const hotCoreInput =");
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
      "const spectralCoreColor =",
    );
    const fringeBlock = source.slice(fringeStart, hotCoreInputStart);
    const hotCoreBlock = source.slice(hotCoreInputStart, holographicMixStart);
    const holographicBlock = source.slice(
      holographicMixStart,
      whiteEmissionStart,
    );

    expect(fringeStart).toBeLessThan(densityStart);
    expect(hotCoreInputStart).toBeGreaterThan(densityStart);
    expect(hotCoreStart).toBeGreaterThan(hotCoreInputStart);
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
    expect(["function", "object"]).toContain(typeof mesh.material.outputNode);
    expect(["function", "object"]).toContain(typeof mesh.material.offsetNode);
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

  it("binds the canonical modal-basis atlas texture on the cache-only material", () => {
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      uniforms,
    });

    expect(mesh.userData.raymarchModalBasisAtlasTexture).toBe(
      modalBasisCache.texture,
    );
    expect(mesh.material.modalBasisAtlasTexture).toBe(modalBasisCache.texture);
    expect(mesh.userData).not.toHaveProperty(
      "raymarchModalBasisSupportTexture",
    );
    expect(mesh.material).not.toHaveProperty("modalBasisSupportTexture");
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
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      spectralLightCausticTexture: spectralLightCache.causticTexture,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    expect(materialCache.neumann.direct).toBeUndefined();
    expect(materialCache.dirichlet.direct).toBeUndefined();
    expect(materialCache.neumann["modal-basis-cached"]).toBeUndefined();
    expect(materialCache.dirichlet["modal-basis-cached"]).toBeUndefined();
    expect(materialCache.neumann.off).toHaveProperty("transparent", true);
    expect(materialCache.dirichlet.off).toHaveProperty("transparent", true);
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
    expect(materialCache.neumann.cached).toHaveProperty(
      "spectralLightEvaluationMode",
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(materialCache.neumann.direct).toBeUndefined();
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.cached);
    expect(materialCache.dirichlet.cached).toHaveProperty(
      "spectralLightEvaluationMode",
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(materialCache.dirichlet.direct).toBeUndefined();
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
  });

  it("keeps cavity geometry as cache descriptor state, not a material variant", () => {
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      spectralLightCausticTexture: spectralLightCache.causticTexture,
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
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      spectralLightCausticTexture: spectralLightCache.causticTexture,
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
    expect(mesh.material.modalBasisAtlasTexture).toBe(modalBasisCache.texture);
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
    expect(mesh.material.modalBasisAtlasTexture).toBe(modalBasisCache.texture);
    expect(mesh.material.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
  });
});
