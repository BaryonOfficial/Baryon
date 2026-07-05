import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  RAYMARCH_BOUNDARY_TUNING,
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  createRaymarchVolumeMesh,
  getRaymarchMaterialCache,
  setRaymarchBoundaryMode,
  setRaymarchCavityGeometry,
  setRaymarchFieldExtent,
  setRaymarchModalBasisAtlasTexture,
  setRaymarchSpectralLightEvaluationMode,
} from "./material.js";
import {
  FIELD_EXTENTS,
  UNBOUNDED_DOMAIN_SCALE,
  UNBOUNDED_STEP_SCALE,
} from "../fieldExtent.js";
import { createVisualizationUniforms } from "../visualizationUniforms.js";
import { raymarchOpacityNode } from "./SafeVolumetricLightingModel.js";
import {
  createRaymarchLiveFieldProjectionCache,
  createRaymarchModalBasisCache,
} from "./fieldCache.js";
import {
  auditRaymarchSourceSurface,
  getRaymarchQuantityContract,
} from "./quantityLedger.js";

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

function expectSourceBlock(source, startNeedle, endNeedle) {
  const start = expectSourceIndex(source, startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function normalizeSource(value) {
  return value.replace(/\r\n/g, "\n");
}

describe("raymarch volume material", () => {
  it("does not expose a product-controlled structure gradient window", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
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

  it("keeps modal evidence taxonomy out of shader transfer ownership", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );

    expect(source).not.toMatch(
      /sourceCoupled|modalResponseRender|modalResponseDiagnostic|resonant/i,
    );
  });

  it("uses observation transfer as the only shader density visibility lane", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
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

  it("uses structural projection drive instead of raw amplitude sum for modal observation energy", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    const coefficientStart = expectSourceIndex(
      source,
      "const modalCoefficientEnergy =",
    );
    const excitationGateStart = expectSourceIndex(
      source.slice(coefficientStart),
      "// Excitation gate:",
    );
    const coefficientBlock = source.slice(
      coefficientStart,
      coefficientStart + excitationGateStart,
    );
    const amplitudeNormStart = expectSourceIndex(
      source,
      "const amplitudeNorm =",
    );
    const modalFieldCountStart = expectSourceIndex(
      source,
      "const modalFieldCount =",
    );
    const excitationInputStart = expectSourceIndex(
      source,
      "const excitationInput =",
    );
    const latchedFogStart = expectSourceIndex(source, "const latchedFogMask =");
    const amplitudeNormBlock = source.slice(
      amplitudeNormStart,
      modalFieldCountStart,
    );
    const excitationBlock = source.slice(excitationInputStart, latchedFogStart);

    expect(coefficientBlock).toContain("uStructuralProjectionDrive");
    expect(coefficientBlock).not.toContain("uTotalSlotAmplitude");
    expect(amplitudeNormBlock).toContain("uTotalSlotAmplitude");
    expect(excitationBlock).toContain("uStructureSignal");
    expect(excitationBlock).toContain("uModalResponseEnergy");
    expect(excitationBlock).toContain("modalCoefficientEnergy");
    expect(excitationBlock).toContain("uModeCoherence");
    expect(excitationBlock).toContain("excitationModalAuthority");
    expect(excitationBlock).not.toContain("uAverageAmplitude");
  });

  it("uses structural and local field evidence to suppress diffuse white emission", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    const structuralConcentrationStart = expectSourceIndex(
      source,
      "const structuralConcentration =",
    );
    const causticRidgeAuthorityStart = expectSourceIndex(
      source,
      "const causticRidgeAuthority =",
    );
    const whiteEmissionStart = expectSourceIndex(
      source,
      "const whiteEmissionRidgeEvidence =",
    );
    const colorBranchStart = expectSourceIndex(
      source,
      "const staticBaseColor = mix(",
    );
    const whiteEmissionBlock = source.slice(
      whiteEmissionStart,
      colorBranchStart,
    );

    expect(structuralConcentrationStart).toBeLessThan(whiteEmissionStart);
    expect(causticRidgeAuthorityStart).toBeLessThan(whiteEmissionStart);
    expect(whiteEmissionBlock).toContain("whiteEmissionRidgeEvidence");
    expect(whiteEmissionBlock).toContain("whiteEmissionLocalEvidence");
    expect(whiteEmissionBlock).toContain("structuralConcentration");
    expect(whiteEmissionBlock).toContain("ridgeConcentration");
    expect(whiteEmissionBlock).toContain("causticRidgeAuthority");
    expect(whiteEmissionBlock).toContain("photographicFocus");
    expect(whiteEmissionBlock).toContain(
      "photographicFocus.mul(whiteEmissionRidgeEvidence)",
    );
    expect(whiteEmissionBlock).not.toContain(
      "max(ridgeConcentration, photographicFocus)",
    );
    expect(whiteEmissionBlock).not.toContain("cancellationSuppression");
    expect(whiteEmissionBlock).toContain("whiteEmissionFieldCrowding");
    expect(whiteEmissionBlock).toContain(".mul(whiteEmissionFieldAuthority)");
  });

  it("mirrors quantity-ledger forbidden consumers in shader transfer lanes", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    for (const surfaceName of [
      "materialObservationCore",
      "materialHighlightAuthority",
      "materialHotCoreAuthority",
      "materialWhiteEmissionAuthority",
    ]) {
      expect(auditRaymarchSourceSurface(surfaceName, source).file).toBe(
        "material.js",
      );
    }
    const highlightStart = expectSourceIndex(source, "const highlightMask =");
    const stabilizedDensityStart = expectSourceIndex(
      source,
      "const stabilizedDensity = observationDensity;",
    );
    const hotCoreStart = expectSourceIndex(source, "const hotCoreInput =");
    const hotCoreMixStart = expectSourceIndex(source, "const hotCoreMix =");
    const whiteEmissionStart = expectSourceIndex(
      source,
      "const whiteEmissionRidgeEvidence =",
    );
    const colorBranchStart = expectSourceIndex(
      source,
      "const staticBaseColor = mix(",
    );
    const supportSplitStart = expectSourceIndex(
      source,
      "const supportVisibleDensity =",
    );
    const returnStart = expectSourceIndex(
      source,
      "return vec4(\n        applyExtentEnergyProfile(\n          causticRadianceContribution",
    );
    const highlightBlock = source.slice(highlightStart, stabilizedDensityStart);
    const hotCoreBlock = source.slice(hotCoreStart, hotCoreMixStart);
    const whiteEmissionBlock = source.slice(
      whiteEmissionStart,
      colorBranchStart,
    );
    const finalTransferBlock = source.slice(supportSplitStart, returnStart);
    const floorContract = getRaymarchQuantityContract("observedDensityFloor");
    const observationContract =
      getRaymarchQuantityContract("observationDensity");
    const supportContract = getRaymarchQuantityContract(
      "supportVisibleDensity",
    );
    const cancellationContract = getRaymarchQuantityContract(
      "cancellationSuppression",
    );

    expect(floorContract.forbiddenConsumers).toEqual(
      expect.arrayContaining(["highlightMask", "whiteEmissionFieldAuthority"]),
    );
    expect(observationContract.forbiddenConsumers).toEqual(
      expect.arrayContaining(["highlightMask", "hotCoreInput"]),
    );
    expect(supportContract.forbiddenConsumers).toEqual(
      expect.arrayContaining(["causticRadianceContribution"]),
    );
    expect(cancellationContract.forbiddenConsumers).toEqual(
      expect.arrayContaining(["whiteEmissionFieldAuthority"]),
    );
    expect(highlightBlock).toContain("projectedCausticRadianceDensity");
    expect(highlightBlock).not.toContain("causticVisibleDensity");
    expect(highlightBlock).not.toContain("visibleDensity");
    expect(highlightBlock).not.toContain("observedDensityFloor");
    expect(hotCoreBlock).toContain("projectedCausticRadianceDensity");
    expect(hotCoreBlock).toContain("highlightMask");
    expect(hotCoreBlock).not.toContain("photographicLaserCausticRadiance");
    expect(hotCoreBlock).not.toContain("causticVisibleDensity");
    expect(hotCoreBlock).not.toContain("visibleDensity");
    expect(hotCoreBlock).not.toContain("observedDensityFloor");
    expect(whiteEmissionBlock).not.toContain("cancellationSuppression");
    expect(finalTransferBlock).toContain(
      "causticRadianceContribution = volumeColor.mul",
    );
    expect(finalTransferBlock).toContain("projectedCausticRadianceDensity");
    expect(finalTransferBlock).not.toContain(
      "volumeColor.mul(\n        causticVisibleDensity",
    );
    expect(finalTransferBlock).toContain("supportRevealContribution =");
    expect(finalTransferBlock).toContain(
      "supportRevealColor.mul(supportRevealDensity)",
    );
    expect(finalTransferBlock).not.toContain(
      "causticRadianceContribution = volumeColor.mul(stabilizedDensity)",
    );
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
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
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
    const densityStart = expectSourceIndex(
      source,
      "const observationInputDensity =",
    );
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );
    const stabilizedDensityStart = expectSourceIndex(
      source,
      "const stabilizedDensity = observationDensity;",
    );
    const finalRadianceStart = expectSourceIndex(
      source,
      "return vec4(\n        applyExtentEnergyProfile(\n          causticRadianceContribution",
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

  it("keeps body and observation-rescued density out of optical highlight readout", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const physicalCausticDensityStart = expectSourceIndex(
      source,
      "const physicalCausticDensity = clamp(",
    );
    const densityStart = expectSourceIndex(
      source,
      "const observationInputDensity = clamp(",
    );
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );
    const observationDensityStart = expectSourceIndex(
      source,
      "const { observationDensity } = observationTransfer;",
    );
    const causticVisibleDensityStart = expectSourceIndex(
      source,
      "const causticVisibleDensity = physicalCausticDensity.mul(",
    );
    const projectedCausticRadianceStart = expectSourceIndex(
      source,
      "const projectedCausticRadianceDensity =",
    );
    const highlightMaskStart = expectSourceIndex(
      source,
      "const highlightMask = smoothstep(",
    );
    const stabilizedDensityStart = expectSourceIndex(
      source,
      "const stabilizedDensity = observationDensity;",
    );
    const highlightMaskBlock = source.slice(
      highlightMaskStart,
      stabilizedDensityStart,
    );
    const physicalCausticDensityBlock = source.slice(
      physicalCausticDensityStart,
      densityStart,
    );
    const densityBlock = source.slice(densityStart, observationTransferStart);

    expect(physicalCausticDensityStart).toBeLessThan(densityStart);
    expect(physicalCausticDensityBlock).toContain(
      "photographicLaserCausticRadiance",
    );
    expect(physicalCausticDensityBlock).not.toContain(
      "photographicBodyContribution",
    );
    expect(densityBlock).toContain("photographicBodyContribution");
    expect(observationDensityStart).toBeGreaterThan(observationTransferStart);
    expect(causticVisibleDensityStart).toBeGreaterThan(observationDensityStart);
    expect(projectedCausticRadianceStart).toBeGreaterThan(
      causticVisibleDensityStart,
    );
    expect(highlightMaskStart).toBeGreaterThan(projectedCausticRadianceStart);
    expect(highlightMaskBlock).toContain("projectedCausticRadianceDensity");
    expect(highlightMaskBlock).not.toContain("causticVisibleDensity");
    expect(highlightMaskBlock).not.toContain("visibleDensity");
    expect(highlightMaskBlock).not.toContain("observedDensityFloor");
  });

  it("keeps support density from inheriting full caustic radiance", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    const stabilizedDensityStart = expectSourceIndex(
      source,
      "const stabilizedDensity = observationDensity;",
    );
    const supportDensityStart = expectSourceIndex(
      source,
      "const supportVisibleDensity = max(",
    );
    const causticRadianceStart = expectSourceIndex(
      source,
      "const causticRadianceContribution = volumeColor.mul(",
    );
    const supportRevealStart = expectSourceIndex(
      source,
      "const supportRevealContribution =",
    );
    const finalRadianceStart = expectSourceIndex(
      source,
      "return vec4(\n        applyExtentEnergyProfile(\n          causticRadianceContribution",
    );
    const finalRadianceBlock = source.slice(
      supportDensityStart,
      finalRadianceStart + 220,
    );

    expect(supportDensityStart).toBeGreaterThan(stabilizedDensityStart);
    expect(causticRadianceStart).toBeGreaterThan(supportDensityStart);
    expect(supportRevealStart).toBeGreaterThan(causticRadianceStart);
    expect(finalRadianceBlock).toContain("supportRevealColor");
    expect(finalRadianceBlock).toContain("projectedCausticRadianceDensity");
    expect(finalRadianceBlock).not.toContain(
      "volumeColor.mul(\n        causticVisibleDensity",
    );
    expect(finalRadianceBlock).toContain(
      "causticRadianceContribution\n        .mul(structureAwareEmissionGain)\n        .add(supportRevealContribution)",
    );
    expect(finalRadianceBlock).not.toContain(
      "volumeColor.mul(stabilizedDensity)",
    );
    expect(finalRadianceBlock).not.toContain(
      ".add(supportRevealContribution)\n        .mul(structureAwareEmissionGain)",
    );
  });

  it("keeps pre-lane Spectral cache transfer out of the material", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES).toEqual({
      off: "off",
      laneCache: "lane-cache",
    });
    expect(source).not.toContain("RAYMARCH_SPECTRAL_LIGHT_TUNING");
    expect(source).not.toContain("cachedSpectralLightEnabled");
    expect(source).not.toContain("spectralLightCacheTexture");
    expect(source).not.toContain("spectralLightCausticTexture");
    expect(source).not.toContain("spectralSupportRevealDensity");
    expect(source).not.toContain("spectralCoreColor");
    expect(source).not.toContain("spectralLightWeight");
    expect(source).not.toContain("spectralCacheAccent");
    expect(source).toContain(
      "const supportRevealDensity = supportVisibleDensity.mul(",
    );
  });

  it("projects Spectral lane textures to display radiance inside the material", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    const laneTransferBlock = expectSourceBlock(
      source,
      "function sampleSpectralLaneCacheNode",
      "function createScatteringNode",
    );
    const scatteringSignature = expectSourceBlock(
      source,
      "function createScatteringNode",
      "const normalizedBoundaryMode",
    );
    const materialBindingBlock = expectSourceBlock(
      source,
      "material.scatteringNode = createScatteringNode({",
      "});\n    material.spectralLightEvaluationMode",
    );

    expect(laneTransferBlock).toContain(
      "texture3D(spectralLaneTextureA).sample",
    );
    expect(laneTransferBlock).toContain(
      "texture3D(spectralLaneTextureB).sample",
    );
    expect(laneTransferBlock).toContain(
      "texture3D(spectralLaneStatsTexture).sample",
    );
    expect(laneTransferBlock).toContain("projectSpectralLaneRadianceToRgbNode");
    expect(source).toContain("SPECTRAL_LIGHT_LANE_DISPLAY_RGB");
    expect(laneTransferBlock).toContain("dominance");
    expect(laneTransferBlock).toContain("entropy");
    expect(laneTransferBlock).not.toContain("uColor");
    expect(laneTransferBlock).not.toContain("uSurfaceColor");
    expect(laneTransferBlock).not.toContain("modalFieldColorBuffer");
    expect(laneTransferBlock).not.toContain("spectralLightCacheTexture");
    expect(scatteringSignature).toContain("spectralLightEvaluationMode");
    expect(scatteringSignature).toContain("spectralLaneTextureA");
    expect(scatteringSignature).toContain("spectralLaneTextureB");
    expect(scatteringSignature).toContain("spectralLaneStatsTexture");
    expect(materialBindingBlock).toContain("spectralLightEvaluationMode");
    expect(materialBindingBlock).toContain(
      "spectralLaneTextureA: modalResourceBindings.spectralLaneTextureA",
    );
    expect(materialBindingBlock).toContain(
      "spectralLaneTextureB: modalResourceBindings.spectralLaneTextureB",
    );
    expect(materialBindingBlock).toContain("spectralLaneStatsTexture:");
    expect(materialBindingBlock).toContain(
      "modalResourceBindings.spectralLaneStatsTexture",
    );
  });

  it("keeps broad Spectral lane mixtures chromatic instead of whitening entropy", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const projectionBlock = expectSourceBlock(
      source,
      "function projectSpectralLaneRadianceToRgbNode",
      "function sampleSpectralLaneCacheNode",
    );

    expect(projectionBlock).not.toContain("broadSpectrumWhite");
    expect(projectionBlock).not.toContain("entropyWhiteMix");
    expect(projectionBlock).not.toContain("vec3(1.0)");
    expect(projectionBlock).toContain("dominantLaneRgb");
    expect(projectionBlock).toContain("broadSpectrumChromaAnchor");
    expect(projectionBlock).toContain("broadSpectrumExposureCompression");
  });

  it("keeps meaningful low-radiance Spectral lanes visible without static rescue", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const projectionBlock = expectSourceBlock(
      source,
      "function projectSpectralLaneRadianceToRgbNode",
      "function sampleSpectralLaneCacheNode",
    );

    expect(projectionBlock).toContain("rawRadianceGain");
    expect(projectionBlock).toContain("spectralReadabilityPresent");
    expect(projectionBlock).toContain("spectralReadabilityFloor");
    expect(projectionBlock).toContain("spectralReadabilityGain");
    expect(projectionBlock).toContain("total");
    expect(projectionBlock).toContain(".greaterThan(float(1e-7))");
    expect(projectionBlock).toContain(".select(float(1.0), float(0.0))");
    expect(projectionBlock).not.toContain(
      "smoothstep(float(0.0), float(0.015), total)",
    );
    expect(projectionBlock).not.toContain(
      "smoothstep(\n    float(0.00018),\n    float(0.0028),\n    total,\n  )",
    );
    expect(projectionBlock).not.toContain("uColor");
    expect(projectionBlock).not.toContain("uSurfaceColor");
  });

  it("does not fall back to static color inside Spectral lane transfer", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralBranch = expectSourceBlock(
      source,
      "if (spectralLaneTransferEnabled) {",
      "const causticRadianceContribution = volumeColor.mul(",
    );

    expect(spectralBranch).toContain(
      "const spectralCausticRadianceContribution =",
    );
    expect(spectralBranch).toContain("spectralLaneTransfer.rgb");
    expect(spectralBranch).toContain(".mul(projectedCausticRadianceDensity)");
    expect(spectralBranch).not.toContain(".mul(causticVisibleDensity)");
    expect(spectralBranch).not.toContain(
      ".mul(spectralLaneTransfer.authority)",
    );
    expect(spectralBranch).not.toContain("volumeColor");
    expect(spectralBranch).not.toContain("supportRevealColor");
    expect(spectralBranch).not.toContain("const spectralCausticColor = mix(");
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
    expect(source).toContain(
      "liveSynthesisModeCount: modalResourceBindings.modalFieldCapacity",
    );
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
    expect(synthesizeBlock).not.toContain("modalFieldPhaseBuffer");
    expect(synthesizeBlock).not.toContain("uTime");
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
    expect(source).not.toContain("modalFieldPhaseBuffer");
    expect(source).toContain("modalFieldCoefficientBuffer");
    expect(source).toContain("modalFieldCapacity");
    expect(source).not.toContain("evaluateModeNode({");
    expect(source).not.toContain("cos(phase)");
    expect(source).not.toContain(
      "modalFieldCoefficientBuffer || modalFieldPhaseBuffer",
    );
    expect(source).not.toContain(
      "!modalFieldCoefficientBuffer && !modalFieldPhaseBuffer",
    );
    expect(source).not.toContain("phaseCurrentCoefficient");
    expect(source).toContain("unsignedSupport.addAssign");
    expect(source).toContain("uModalFieldModeCount");
    expect(source).not.toContain("function accumulateFieldLayers");
    expect(source).not.toContain("function accumulateColorLayers");
    expect(source).not.toContain("DETAIL_LAYER_WEIGHT");
    expect(source).not.toContain("uBackboneModeCount");
    expect(source).not.toContain("uDetailModeCount");
  });

  it("isolates phase projection to the named spatial interference carrier", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const carrierStart = expectSourceIndex(
      source,
      "function samplePhaseInterferenceCarrierNode",
    );
    const scatteringStart = expectSourceIndex(
      source,
      "function createScatteringNode({",
    );
    const phaseTransferStart = expectSourceIndex(
      source,
      "const phaseInterferenceTransfer =",
    );
    const carrierUseStart = expectSourceIndex(
      source,
      "const phaseInterferenceCarrier =",
    );
    const carrierBlock = source.slice(carrierStart, scatteringStart);
    const carrierUseBlock = source.slice(carrierUseStart, phaseTransferStart);
    const transferBlock = source.slice(
      phaseTransferStart,
      source.indexOf("const opticalFocus =", phaseTransferStart),
    );

    expect(carrierBlock).toContain("modalPhaseInterferenceTexture");
    expect(carrierBlock).toContain("texture3D(modalPhaseInterferenceTexture)");
    expect(carrierBlock).toContain("interferenceSample.x");
    expect(carrierBlock).toContain("interferenceSample.z");
    expect(carrierBlock).toContain("float(-1.0)");
    expect(carrierUseBlock).toContain("contrast: float(0.0)");
    expect(carrierUseBlock).toContain("authority: float(0.0)");
    expect(carrierUseBlock).toContain("let phaseInterferenceAuthority =");
    expect(carrierUseBlock).toContain("uLiveFieldCacheActive");
    expect(carrierUseBlock).toContain(
      ".mul(phaseInterferenceCarrier.authority)",
    );
    expect(carrierUseBlock).toContain("phaseInterferenceCarrier.contrast");
    expect(carrierUseBlock).toContain("phaseInterferenceAuthority");
    expect(transferBlock).toContain("uPhaseProjectionMix");
    expect(transferBlock).toContain("uPhaseProjectionStrength");
    expect(transferBlock).toContain("phaseInterferenceContrast");
    expect(transferBlock).not.toContain("sub(float(0.5))");
    expect(source).toContain("uLiveFieldCacheActive");
    expect(source).not.toContain("modalFieldPhaseBuffer");
    expect(source).not.toContain("cos(phase)");
    expect(source).not.toContain("phaseCurrentCoefficient");
    expect(source).not.toContain("phaseProjectionResponse");
  });

  it("samples normalized pressure from the named pressure/radiation carrier", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const carrierStart = expectSourceIndex(
      source,
      "function samplePressureRadiationCarrierNode",
    );
    const liveSampleStart = expectSourceIndex(
      source,
      "function sampleLiveFieldProjectionCacheNode",
    );
    const scatteringStart = expectSourceIndex(
      source,
      "function createScatteringNode({",
    );
    const carrierBlock = source.slice(carrierStart, liveSampleStart);
    const liveSampleBlock = source.slice(liveSampleStart, scatteringStart);

    expect(carrierBlock).toContain("modalPressureRadiationTexture");
    expect(carrierBlock).toMatch(
      /pressureRadiationSample\s*=\s*texture3D\(\s*modalPressureRadiationTexture,?\s*\)\.sample\(\s*basisUv,?\s*\)/,
    );
    expect(carrierBlock).toContain("normalizedPressure");
    expect(carrierBlock).toContain("velocityProxy");
    expect(carrierBlock).toContain("radiationPotential");
    expect(liveSampleBlock).toContain("pressureRadiationCarrier.pressure");
    expect(liveSampleBlock).toContain("velocityProxy");
    expect(liveSampleBlock).toContain("radiationPotential");
    expect(liveSampleBlock).not.toContain("field: fieldSample.x");
    expect(liveSampleBlock).not.toContain("pressure: fieldSample.x");
  });

  it("routes white emission through the adaptive highlight target in static color", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { deriveHighlightTargetNode } from "../../render/displayRadiance.js";',
    );
    expect(source).toContain("STATIC_HIGHLIGHT_SURFACE_PULL_SCALE");
    expect(source).toContain("staticWhiteEmissionMix");
    expect(source).not.toContain("spectralLightWhiteEmissionMix");
    const highlightTargetStart = expectSourceIndex(
      source,
      "const staticHolographicLaserColor = deriveHighlightTargetNode(",
    );
    const highlightTargetBlock = source.slice(
      highlightTargetStart,
      source.indexOf("const volumeColor = mix(", highlightTargetStart),
    );

    expect(highlightTargetBlock).toContain("staticHolographicColor");
    expect(highlightTargetBlock).toContain("uSurfaceColor");
    expect(highlightTargetBlock).toContain("staticWhiteEmissionMix");
    expect(highlightTargetBlock).toContain(
      "float(STATIC_HIGHLIGHT_SURFACE_PULL_SCALE)",
    );
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
    const densityStart = expectSourceIndex(
      source,
      "const observationInputDensity = clamp(",
    );
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
      "let shouldMeasureOpticalConvergence =",
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
    expect(source).not.toContain(
      "function sampleLiveFieldProjectionNormalNode",
    );
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

  it("precomputes basis-atlas page reciprocals outside live modal loops", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const atlasZ = float(basisSlot).add(basisUv.z)");
    expect(source).toContain("atlasZ.mul(float(invLiveSynthesisModeCount))");
    expect(source).toContain(
      "const invLiveSynthesisModeCount = 1 / normalizedLiveSynthesisModeCount",
    );
    expect(source).toContain("invLiveSynthesisModeCount,");
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
    const staticBaseColorStart = expectSourceIndex(
      source,
      "const staticBaseColor = mix(",
    );

    expect(causticDensityStart).toBeGreaterThan(signedBodyStart);
    expect(modalStructureAnchorStart).toBeGreaterThan(signedBodyStart);
    expect(staticBaseColorStart).toBeGreaterThan(signedBodyStart);
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
    const densityStart = expectSourceIndex(
      source,
      "const observationInputDensity = clamp(",
    );
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
    const densityStart = expectSourceIndex(
      source,
      "const observationInputDensity = clamp(",
    );
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
    const staticBaseColorStart = expectSourceIndex(
      source,
      "const staticBaseColor = mix(",
    );
    const supportRevealColorStart = expectSourceIndex(
      source,
      "const supportRevealColor = clamp(",
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
    expect(staticBaseColorStart).toBeGreaterThan(densityStart);
    expect(supportRevealColorStart).toBeGreaterThan(densityStart);
    expect(fringeBlock).toContain(
      "photographicFocus.mul(causticRidgeAuthority)",
    );
    expect(fringeBlock).not.toContain(
      "photographicFocus.mul(causticVisibility)",
    );
    expect(hotCoreBlock).toContain("projectedCausticRadianceDensity");
    expect(hotCoreBlock).not.toContain("photographicLaserCausticRadiance");
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
    // The flagship sphere keeps the old direct radius path; unbounded gets a
    // separate material variant so the default shader stays cheap.
    expect(mesh.material.radiusNode).toBe(uniforms.uRadius);
    expect(mesh.material.opacityGainNode).toBe(uniforms.uOpacityGain);
    expect(uniforms.uObservationDensityFadeStart.value).toBeCloseTo(0.22);
    expect(uniforms.uObservationDensityFadeEnd.value).toBeCloseTo(0.34);
    expect(uniforms.uObservationTransferGain.value).toBeCloseTo(2.2);
    expect(uniforms.uObservationDensityFloor.value).toBeCloseTo(0.22);
    expect(uniforms.uObservationContourSupportScale.value).toBeCloseTo(0.035);
    expect(uniforms.uModalResponseEnergy.value).toBe(0);
    expect(uniforms.uPhaseProjectionMix.value).toBe(0);
    expect(uniforms.uPhaseProjectionStrength.value).toBe(0);
    expect(mesh.userData).not.toHaveProperty("raymarchBackbonePhaseBuffer");
    expect(mesh.userData).not.toHaveProperty("raymarchDetailPhaseBuffer");
  });

  it("binds pressure/radiation and phase-interference textures without exposing raw phase slots to material", () => {
    const liveFieldProjectionCache = createRaymarchLiveFieldProjectionCache({
      resolution: 8,
    });
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalLiveFieldTexture: liveFieldProjectionCache.fieldTexture,
      modalLiveSupportTexture: liveFieldProjectionCache.supportTexture,
      modalPressureRadiationTexture:
        liveFieldProjectionCache.pressureRadiationTexture,
      modalPhaseInterferenceTexture:
        liveFieldProjectionCache.phaseInterferenceTexture,
      uniforms,
    });

    expect(mesh.userData.raymarchModalPressureRadiationTexture).toBe(
      liveFieldProjectionCache.pressureRadiationTexture,
    );
    expect(mesh.material.modalPressureRadiationTexture).toBe(
      liveFieldProjectionCache.pressureRadiationTexture,
    );
    expect(mesh.userData.raymarchModalPhaseInterferenceTexture).toBe(
      liveFieldProjectionCache.phaseInterferenceTexture,
    );
    expect(mesh.material.modalPhaseInterferenceTexture).toBe(
      liveFieldProjectionCache.phaseInterferenceTexture,
    );
    expect(mesh.userData).not.toHaveProperty(
      "raymarchModalPhaseResponseTexture",
    );
    expect(mesh.material).not.toHaveProperty("modalPhaseResponseTexture");
    expect(mesh.userData).not.toHaveProperty("raymarchModalFieldPhaseBuffer");
    expect(mesh.material).not.toHaveProperty("modalFieldPhaseBuffer");
  });

  it("binds Spectral lane textures for lane-cache material transfer", () => {
    const uniforms = makeMeshUniforms();
    const spectralLaneTextureA = {};
    const spectralLaneTextureB = {};
    const spectralLaneStatsTexture = {};
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms,
      spectralLaneTextureA,
      spectralLaneTextureB,
      spectralLaneStatsTexture,
      spectralLightEvaluationMode: "lane-cache",
    });

    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      "lane-cache",
    );
    expect(mesh.userData.raymarchSpectralLaneTextureA).toBe(
      spectralLaneTextureA,
    );
    expect(mesh.userData.raymarchSpectralLaneTextureB).toBe(
      spectralLaneTextureB,
    );
    expect(mesh.userData.raymarchSpectralLaneStatsTexture).toBe(
      spectralLaneStatsTexture,
    );
    expect(mesh.material.spectralLightEvaluationMode).toBe("lane-cache");
    expect(mesh.material.spectralLaneTextureA).toBe(spectralLaneTextureA);
    expect(mesh.material.spectralLaneTextureB).toBe(spectralLaneTextureB);
    expect(mesh.material.spectralLaneStatsTexture).toBe(
      spectralLaneStatsTexture,
    );
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

  it("retargets the shared modal-basis atlas node across material variants", () => {
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const promotedTexture = modalBasisCache.pendingTexture;
    const spectralLaneTextureA = {};
    const spectralLaneTextureB = {};
    const spectralLaneStatsTexture = {};
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      spectralLaneTextureA,
      spectralLaneTextureB,
      spectralLaneStatsTexture,
      spectralLightEvaluationMode: RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
      uniforms,
    });
    const materialCache = getRaymarchMaterialCache(mesh);
    const textureNode =
      mesh.userData.raymarchModalResourceBindings.modalBasisAtlasTextureNode;

    expect(textureNode?.isTexture3DNode).toBe(true);
    expect(textureNode.value).toBe(modalBasisCache.texture);

    setRaymarchModalBasisAtlasTexture(mesh, promotedTexture);

    expect(mesh.userData.raymarchModalBasisAtlasTexture).toBe(promotedTexture);
    expect(
      mesh.userData.raymarchModalResourceBindings.modalBasisAtlasTexture,
    ).toBe(promotedTexture);
    expect(textureNode.value).toBe(promotedTexture);
    expect(materialCache.neumann.off.modalBasisAtlasTexture).toBe(
      promotedTexture,
    );
    expect(materialCache.dirichlet.off.modalBasisAtlasTexture).toBe(
      promotedTexture,
    );

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache,
    );
    expect(mesh.material.modalBasisAtlasTexture).toBe(promotedTexture);
    expect(materialCache.neumann["lane-cache"].modalBasisAtlasTexture).toBe(
      promotedTexture,
    );

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material.modalBasisAtlasTexture).toBe(promotedTexture);
    expect(materialCache.dirichlet["lane-cache"].modalBasisAtlasTexture).toBe(
      promotedTexture,
    );
    expect(
      mesh.userData.raymarchModalResourceBindings.modalBasisAtlasTextureNode,
    ).toBe(textureNode);
  });

  it("constructs the material without modal buffers", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
  });

  it("starts off and creates no Spectral material variants", () => {
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
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

    setRaymarchSpectralLightEvaluationMode(mesh, "cached");
    expect(mesh.material).toBe(materialCache.neumann.off);
    expect(materialCache.neumann.cached).toBeUndefined();
    expect(materialCache.neumann.direct).toBeUndefined();
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.off);
    expect(materialCache.dirichlet.cached).toBeUndefined();
    expect(materialCache.dirichlet.direct).toBeUndefined();
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
  });

  it("repairs a stale boundary material cache entry", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    setRaymarchBoundaryMode(mesh, "dirichlet");
    const dirichletMaterial = mesh.material;
    expect(dirichletMaterial.raymarchBoundaryMode).toBe("dirichlet");

    materialCache.neumann.off = dirichletMaterial;
    mesh.userData.raymarchBoundaryMode = "neumann";

    setRaymarchBoundaryMode(mesh, "neumann");

    expect(mesh.userData.raymarchBoundaryMode).toBe("neumann");
    expect(mesh.material).not.toBe(dirichletMaterial);
    expect(mesh.material.raymarchBoundaryMode).toBe("neumann");
  });

  it("keeps cavity geometry as cache descriptor state, not a material variant", () => {
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    setRaymarchSpectralLightEvaluationMode(mesh, "cached");
    const neumannOffMaterial = mesh.material;
    setRaymarchCavityGeometry(mesh, "spherical");
    expect(mesh.material).toBe(neumannOffMaterial);

    setRaymarchBoundaryMode(mesh, "dirichlet");

    expect(mesh.userData.raymarchCavityGeometry).toBe("spherical");
    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.off);
    expect(materialCache.neumann.cached).toBeUndefined();
    expect(materialCache.dirichlet.cached).toBeUndefined();
    expect(materialCache.neumann.off.spherical).toBeUndefined();
    expect(materialCache.dirichlet.off.spherical).toBeUndefined();
  });

  it("keeps Spectral material switching unavailable before lane implementation", () => {
    const modalBasisCache = createRaymarchModalBasisCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      modalBasisAtlasTexture: modalBasisCache.texture,
      uniforms: makeMeshUniforms(),
    });

    const offMaterial = mesh.material;
    setRaymarchSpectralLightEvaluationMode(mesh, "cached");

    expect(mesh.userData).not.toHaveProperty("raymarchFieldEvaluationMode");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(mesh.material).toBe(offMaterial);
    expect(mesh.material).not.toHaveProperty("fieldEvaluationMode");
    expect(mesh.material.modalBasisAtlasTexture).toBe(modalBasisCache.texture);
    expect(mesh.material.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
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

  it("radiates the modal pattern outward as traveling wavefronts", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    const scatteringBlock = expectSourceBlock(
      source,
      "function createScatteringNode",
      "function deriveObservationTransferNode",
    );

    expect(scatteringBlock).toContain(
      "const isUnboundedFieldExtent =\n    normalizedFieldExtent === FIELD_EXTENTS.unbounded;",
    );

    // The far field is D(θ,φ)·cos(k·r − ω·t)·decay(r) — the modal pattern's
    // angular directivity carried outward by traveling waves. The sample
    // position morphs to the mid-cavity directivity point across a wide
    // band; a mirror tiling of the cavity (discrete bounded copies) and the
    // old narrow-band probe smear are both banned.
    expect(scatteringBlock).toContain("const radiatingSamplePosition = mix(");
    expect(scatteringBlock).toContain("UNBOUNDED_DIRECTIVITY_RADIUS");
    expect(scatteringBlock).toContain("UNBOUNDED_TRAVEL_BLEND_START");
    expect(scatteringBlock).toContain("UNBOUNDED_TRAVEL_BLEND_END");
    expect(scatteringBlock).not.toContain("foldPhase");
    expect(scatteringBlock).not.toContain("foldSign");
    expect(scatteringBlock).not.toContain("openProbeRadius");
    expect(scatteringBlock).not.toContain("openProbePosition");
    expect(scatteringBlock).not.toContain("fieldSamplePosition");
    expect(scatteringBlock).not.toContain("unboundedDomainDistance");
    expect(scatteringBlock).not.toContain("domainDistance");
    expect(scatteringBlock).not.toContain(
      "localPosition.div(max(radialDistance, float(1.0)))",
    );
    expect(scatteringBlock).not.toContain("float(1.08)");

    // The traveling factor is signed: its moving zero-crossings are the
    // wavefronts, advancing one wavelength per beat and drifting between
    // beats, with the radial gradient term lighting the caustic lanes on
    // the moving shells.
    expect(scatteringBlock).toContain("const radialWavePhase = radialDistance");
    expect(scatteringBlock).toContain("UNBOUNDED_RADIAL_PHASE_GAIN");
    expect(scatteringBlock).toContain("UNBOUNDED_WAVE_DRIFT");
    expect(scatteringBlock).toContain("cos(radialWavePhase)");
    expect(scatteringBlock).toContain("field.mulAssign(signedTravel);");
    expect(scatteringBlock).toContain("sin(radialWavePhase).negate()");
    expect(scatteringBlock).not.toContain("wavefrontCrest");
    expect(scatteringBlock).not.toContain("UNBOUNDED_WAVEFRONT");
    expect(scatteringBlock).not.toContain("radialAmplitude");

    // Every cavity-solved carrier (laser, phase interference, pressure/
    // radiation) has planar structure that the inward-pulled directivity
    // sampling would re-project through the origin into radial streak
    // artifacts. The laser is skipped outright; the other carriers fade out
    // with the travel blend.
    expect(scatteringBlock).toContain(
      "laserIrradianceTexture && !isUnboundedFieldExtent",
    );
    expect(scatteringBlock).toContain(
      "const cavityCarrierAuthority = unboundedTravelMix",
    );
    expect(scatteringBlock).toContain(
      "phaseInterferenceAuthority = phaseInterferenceAuthority.mul(",
    );
    expect(scatteringBlock).toContain(
      "radiationTransferAuthority = radiationTransferAuthority.mul(",
    );

    // The optical-convergence probe (per-sample mode loop, two atlas
    // fetches per mode) stays cavity-only: the undecayed radiating field
    // has ridge authority everywhere, and measuring canvas-wide melts the
    // frame budget.
    expect(scatteringBlock).toContain(
      "radialDistance.lessThan(float(UNBOUNDED_TRAVEL_BLEND_START))",
    );

    // No observation exposure lift: the fog it produced is gone, and the
    // envelope alone owns far-field visibility.
    expect(scatteringBlock).not.toContain("unboundedObservationGain");
    expect(scatteringBlock).not.toContain("UNBOUNDED_OBSERVATION");
    expect(scatteringBlock).not.toContain("uUnboundedMix");
    expect(scatteringBlock).not.toContain("unboundedMix");
    expect(scatteringBlock).not.toContain(
      "mix(boundedEdgeFade, unboundedEdgeFade",
    );

    // Local support extends the attenuation reach, so excited lobes shape
    // the silhouette while nodal directions collapse to black. Presence is
    // calibrated through a smoothstep window because normalized support is
    // small in absolute terms.
    expect(scatteringBlock).toContain("const supportPresence = smoothstep(");
    expect(scatteringBlock).toContain("UNBOUNDED_SUPPORT_PRESENCE_START");
    expect(scatteringBlock).toContain("UNBOUNDED_REACH_EXTENSION");

    // Structure/energy split: the folded pattern is never amplitude-decayed
    // — classification stays sharp to the far edge — and the radial energy
    // profile is applied exactly once, at the sample output, to emitted
    // radiance and extinction together. Decaying the sampled field would
    // dim every authority product quadratically (the "too dim" regression).
    expect(scatteringBlock).not.toContain("radiationEnvelope");
    expect(scatteringBlock).not.toContain(
      "effectiveUnsignedSupport.mulAssign(",
    );
    expect(scatteringBlock).toContain("unboundedEnergyProfile = exp(");
    expect(scatteringBlock).toContain(
      "const applyExtentEnergyProfile = (node) =>",
    );
    expect(scatteringBlock).toContain(
      "applyExtentEnergyProfile(dot(baseRadiance, luminanceWeights))",
    );
  });

  it("dissolves the container masks in the unbounded field extent", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );
    const scatteringBlock = expectSourceBlock(
      source,
      "function createScatteringNode",
      "function deriveObservationTransferNode",
    );

    const boundaryMaskBlock = expectSourceBlock(
      scatteringBlock,
      "const boundaryMask = isUnboundedFieldExtent",
      "const bodyDensity",
    );
    expect(boundaryMaskBlock).toContain("? float(0.0)");

    const edgeFadeBlock = expectSourceBlock(
      scatteringBlock,
      "const boundedEdgeFade",
      "const field = float(0.0).toVar()",
    );
    expect(edgeFadeBlock).toContain("const edgeFade = isUnboundedFieldExtent");
    // The fail-safe fade rides the camera-scaled march bound, not a fixed
    // multiple of the old sphere and not a cube distance.
    expect(edgeFadeBlock).toContain("unboundedOuterFadeStart");
    expect(edgeFadeBlock).toContain("unboundedOuterFadeEnd");

    const densityBlock = expectSourceBlock(
      scatteringBlock,
      "const physicalCausticDensity = clamp(",
      "const modalStructureAnchor",
    );
    // Density lanes carry no extent-specific exposure lift — the radiation
    // envelope alone decides what the far field shows.
    expect(densityBlock).toContain(
      "photographicLaserCausticRadiance\n          .mul(edgeFade)",
    );
    expect(densityBlock).not.toContain("unboundedObservationGain");

    const photographicShellBlock = expectSourceBlock(
      scatteringBlock,
      "const photographicShellAuthorityBase",
      "const photographicFocusAuthority",
    );
    expect(photographicShellBlock).toContain(
      "const photographicShellAuthority = isUnboundedFieldExtent",
    );
    // The unbounded variant swaps the radial shell stack for a radially
    // uniform focus presence — flagship-level blackfield exposure with no
    // container geometry implied. Zeroing it halves the whole scene.
    expect(photographicShellBlock).toContain("UNBOUNDED_FOCUS_PRESENCE");
    expect(photographicShellBlock).not.toContain("? float(0.0)");
  });

  it("uses an extent-specific material and observation hull when the field extent changes", () => {
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms,
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    expect(mesh.userData.raymarchFieldExtent).toBe(FIELD_EXTENTS.sphere);
    expect(mesh.userData.raymarchBaseRadius).toBe(3);
    const sphereGeometry = mesh.geometry;
    const sphereMaterial = mesh.material;
    expect(sphereGeometry.parameters.radius).toBeCloseTo(3 * 1.01);
    expect(sphereMaterial.raymarchFieldExtent).toBe(FIELD_EXTENTS.sphere);
    expect(sphereMaterial.radiusNode).toBe(uniforms.uRadius);
    // The flagship sphere never opts into radial-adaptive stepping.
    expect(sphereMaterial.coreStepRadiusNode).toBeUndefined();
    expect(sphereMaterial.outerStepStretch).toBeUndefined();

    setRaymarchFieldExtent(mesh, FIELD_EXTENTS.sphere);
    expect(mesh.geometry).toBe(sphereGeometry);
    expect(mesh.material).toBe(sphereMaterial);

    setRaymarchFieldExtent(mesh, FIELD_EXTENTS.unbounded);
    expect(mesh.userData.raymarchFieldExtent).toBe(FIELD_EXTENTS.unbounded);
    expect(mesh.geometry).not.toBe(sphereGeometry);
    // The hull covers the fixed free-field reach; there is no box hull and
    // no per-material domain-shape switch.
    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.geometry.parameters.radius).toBeCloseTo(
      3 * UNBOUNDED_DOMAIN_SCALE * 1.01,
    );
    expect(mesh.material).toBe(materialCache.neumann["off:unbounded"]);
    expect(mesh.material.raymarchFieldExtent).toBe(FIELD_EXTENTS.unbounded);
    expect(mesh.material.radiusNode).not.toBe(uniforms.uRadius);
    expect(mesh.material.domainShape).toBeUndefined();
    expect(mesh.material.domainHalfExtentsNode).toBeUndefined();
    // The large open domain marches with radial-adaptive steps: flagship
    // density inside the core radius, stretched steps in the radiating zone.
    expect(mesh.material.coreStepRadiusNode).toBeDefined();
    expect(mesh.material.outerStepStretch).toBeGreaterThan(1);
    expect(mesh.material.steps).toBe(
      Math.round(RAYMARCH_DEFAULTS.raymarchSteps * UNBOUNDED_STEP_SCALE),
    );

    const unboundedGeometry = mesh.geometry;
    setRaymarchFieldExtent(mesh, "not-a-real-extent");
    expect(mesh.userData.raymarchFieldExtent).toBe(FIELD_EXTENTS.sphere);
    expect(mesh.geometry).not.toBe(unboundedGeometry);
    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.geometry.parameters.radius).toBeCloseTo(3 * 1.01);
    expect(mesh.material).toBe(sphereMaterial);
    expect(mesh.material.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
  });

  it("repairs stale extent material and hull state", () => {
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms,
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    setRaymarchFieldExtent(mesh, FIELD_EXTENTS.unbounded);
    const unboundedGeometry = mesh.geometry;
    const unboundedMaterial = mesh.material;
    expect(unboundedMaterial.raymarchFieldExtent).toBe(FIELD_EXTENTS.unbounded);

    materialCache.neumann.off = unboundedMaterial;
    mesh.userData.raymarchFieldExtent = FIELD_EXTENTS.sphere;

    setRaymarchFieldExtent(mesh, FIELD_EXTENTS.sphere);

    expect(mesh.userData.raymarchFieldExtent).toBe(FIELD_EXTENTS.sphere);
    expect(mesh.geometry).not.toBe(unboundedGeometry);
    expect(mesh.geometry.parameters.radius).toBeCloseTo(3 * 1.01);
    expect(mesh.material).not.toBe(unboundedMaterial);
    expect(mesh.material.raymarchFieldExtent).toBe(FIELD_EXTENTS.sphere);
  });

  it("keeps the unbounded march bound at the fixed free-field reach", () => {
    const source = normalizeSource(
      readFileSync(new URL("./material.js", import.meta.url), "utf8"),
    );

    // Fixed generous reach: the field ends by absorption inside a bound
    // that covers the canvas at flagship framing. No camera-coupled
    // analytic domain, no box, no cube distance.
    const radiusSelectorBlock = expectSourceBlock(
      source,
      "function createVolumeDomainRadiusNode",
      "function resolveMaterialStepBudget",
    );
    expect(radiusSelectorBlock).toContain(
      "uniforms.uRadius.mul(float(UNBOUNDED_DOMAIN_SCALE))",
    );
    expect(radiusSelectorBlock).toContain(": uniforms.uRadius;");
    expect(source).not.toContain("cameraProjectionMatrix");
    expect(source).not.toContain("createUnboundedDomainRadiusNode");
    expect(source).not.toContain("BoxGeometry");

    // The fail-safe fade sits at fractions of that same fixed reach; the
    // radiation envelope reaches ~black first, so it never reads as a wall.
    const scatteringBlock = expectSourceBlock(
      source,
      "function createScatteringNode",
      "function deriveObservationTransferNode",
    );
    expect(scatteringBlock).toContain(
      "UNBOUNDED_DOMAIN_SCALE * UNBOUNDED_OUTER_FADE_START",
    );
    expect(scatteringBlock).toContain(
      "UNBOUNDED_DOMAIN_SCALE * UNBOUNDED_OUTER_FADE_END",
    );
  });
});
