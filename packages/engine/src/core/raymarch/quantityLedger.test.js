import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
  RAYMARCH_MATERIAL_TRANSFER_LANES,
  RAYMARCH_QUANTITY_LEDGER,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_RENDER_QUANTITY_LANES,
  RAYMARCH_RENDER_SURFACE_AUDITS,
  auditRaymarchSourceSurface,
  assertRaymarchQuantityConsumerAllowed,
  getRaymarchQuantityContract,
  isRaymarchQuantityConsumerAllowed,
} from "./quantityLedger.js";

const RAYMARCH_AUDIT_SOURCE_URL_BY_FILE = Object.freeze({
  "audioSourceEvidence.js": new URL(
    "../../utils/audio/audioSourceEvidence.js",
    import.meta.url,
  ),
  "modalExcitation.js": new URL(
    "../../utils/audio/modalExcitation.js",
    import.meta.url,
  ),
  "modalObservedScoring.js": new URL(
    "../../utils/audio/modalObservedScoring.js",
    import.meta.url,
  ),
  "fieldCache.js": new URL("./fieldCache.js", import.meta.url),
  "carrierDensityNode.js": new URL("./carrierDensityNode.js", import.meta.url),
  "material.js": new URL("./material.js", import.meta.url),
  "observationTransfer.js": new URL(
    "./observationTransfer.js",
    import.meta.url,
  ),
  "observationTransferNode.js": new URL(
    "./observationTransferNode.js",
    import.meta.url,
  ),
  "runtime.js": new URL("./runtime.js", import.meta.url),
});

const CANONICAL_MATERIAL_QUANTITIES = Object.freeze([
  "matchedFieldGradient",
  "localZeroSetDistance",
  "fixedWorldSpaceCarrierDensity",
  "carrierNormalViewCosine",
  "detectorIntegratedAcousticEnergy",
  "materialChromaticity",
  "surfaceChromaticity",
  "materialDensityScale",
  "holographicFresnelEmission",
  "scatteringCoefficient",
  "absorptionCoefficient",
  "laserExcitedEmissionCoefficient",
  "organizedCoreDensity",
  "organizedSheathDensity",
  "organizedDensity",
  "sigmaS",
  "sigmaA",
  "extinction",
  "emissionSourceStrength",
  "coreEmissionSourceStrength",
  "sheathEmissionSourceStrength",
  "fresnelEmissionSourceStrength",
  "incidentLaserIrradiance",
  "holographicBaseRadianceGain",
  "laserCausticAccentAuthority",
  "baseSourceRadiance",
  "accentSourceRadiance",
  "sourceRadiance",
  "laserTransportReady",
  "volumeBaseRadiance",
  "volumeAccentRadiance",
  "volumeTransmittance",
  "volumeCoverage",
]);

const RETIRED_MATERIAL_QUANTITIES = Object.freeze([
  "observationDensity",
  "structuralContourAuthority",
  "modalStructureAnchor",
  "observedDensityFloor",
  "observedContourSupport",
  "physicalRidgeDensity",
  "causticVisibleDensity",
  "projectedCausticRadianceDensity",
  "supportVisibleDensity",
  "adjustedBodyContribution",
  "cancellationSuppression",
  "whiteEmissionRidgeEvidence",
  "whiteEmissionFieldAuthority",
  "causticRadianceContribution",
  "supportRevealContribution",
  "supportExtinctionContribution",
]);

const VISIBILITY_COMPENSATION_CONSUMERS = Object.freeze([
  "pitchVisibilityCompensation",
  "beatVisibilityCompensation",
  "radialVisibilityCompensation",
  "centerVisibilityCompensation",
  "edgeVisibilityCompensation",
  "profileVisibilityCompensation",
  "frameVisibilityCompensation",
]);

describe("raymarch quantity ownership ledger", () => {
  it("declares the canonical acoustic-carrier to emission-extinction quantity chain", () => {
    expect(RAYMARCH_QUANTITY_LEDGER_VERSION).toBe(
      "raymarch-render-quantity-v12",
    );
    expect(RAYMARCH_RENDER_QUANTITY_LANES).toEqual(
      expect.objectContaining({
        field: expect.arrayContaining(["matchedFieldGradient"]),
        carrier: expect.arrayContaining([
          "localZeroSetDistance",
          "fixedWorldSpaceCarrierDensity",
        ]),
        energy: expect.arrayContaining(["detectorIntegratedAcousticEnergy"]),
        "optical-material": expect.arrayContaining([
          "materialChromaticity",
          "surfaceChromaticity",
          "materialDensityScale",
          "carrierColumnDensityScale",
          "scatteringCoefficient",
          "absorptionCoefficient",
          "laserExcitedEmissionCoefficient",
        ]),
        "optical-detector": expect.arrayContaining([
          "carrierNormalViewCosine",
          "holographicFresnelEmission",
        ]),
        "optical-transport": expect.arrayContaining([
          "incidentLaserIrradiance",
          "laserCausticAccentAuthority",
          "laserTransportReady",
        ]),
        calibration: expect.arrayContaining(["holographicBaseRadianceGain"]),
        "material-transfer": expect.arrayContaining([
          "organizedCoreDensity",
          "organizedSheathDensity",
          "organizedDensity",
          "sigmaS",
          "sigmaA",
          "extinction",
          "emissionSourceStrength",
          "coreEmissionSourceStrength",
          "sheathEmissionSourceStrength",
          "fresnelEmissionSourceStrength",
          "baseSourceRadiance",
          "accentSourceRadiance",
          "sourceRadiance",
        ]),
        "volume-integration": expect.arrayContaining([
          "volumeBaseRadiance",
          "volumeAccentRadiance",
          "volumeTransmittance",
          "volumeCoverage",
        ]),
      }),
    );
    expect(RAYMARCH_MATERIAL_TRANSFER_LANES).toEqual(
      expect.objectContaining({
        carrier: expect.arrayContaining([
          "localZeroSetDistance",
          "fixedWorldSpaceCarrierDensity",
        ]),
        energy: expect.arrayContaining(["detectorIntegratedAcousticEnergy"]),
        "optical-material": expect.arrayContaining([
          "materialChromaticity",
          "surfaceChromaticity",
          "materialDensityScale",
          "scatteringCoefficient",
          "absorptionCoefficient",
          "laserExcitedEmissionCoefficient",
        ]),
        "material-transfer": expect.arrayContaining([
          "organizedCoreDensity",
          "organizedSheathDensity",
          "organizedDensity",
          "sigmaS",
          "sigmaA",
          "extinction",
          "emissionSourceStrength",
          "coreEmissionSourceStrength",
          "sheathEmissionSourceStrength",
          "fresnelEmissionSourceStrength",
          "baseSourceRadiance",
          "accentSourceRadiance",
          "sourceRadiance",
        ]),
      }),
    );

    for (const quantityName of CANONICAL_MATERIAL_QUANTITIES) {
      const contract = getRaymarchQuantityContract(quantityName);
      expect(contract, quantityName).toBeTruthy();
      expect(contract.quantity).toBe(quantityName);
      expect(contract.represents).toBeTypeOf("string");
      expect(contract.deepOwner).toBeTypeOf("string");
      expect(contract.allowedConsumerPath.length).toBeGreaterThan(0);
      expect(contract.allowedConsumers.length).toBeGreaterThan(0);
    }
  });

  it("hard-cuts obsolete visibility, caustic, highlight, and white-emission owners", () => {
    for (const quantityName of RETIRED_MATERIAL_QUANTITIES) {
      expect(
        getRaymarchQuantityContract(quantityName),
        quantityName,
      ).toBeNull();
    }

    for (const auditName of [
      "materialObservationCore",
      "materialSolvedDensity",
      "materialHighlightAuthority",
      "materialHotCoreAuthority",
      "materialWhiteEmissionAuthority",
    ]) {
      expect(
        RAYMARCH_RENDER_SURFACE_AUDITS[auditName],
        auditName,
      ).toBeUndefined();
    }
  });

  it("allows only the canonical physical transfer edges", () => {
    const allowedEdges = [
      ["matchedFieldGradient", "localZeroSetDistance"],
      ["matchedFieldGradient", "carrierNormalViewCosine"],
      ["localZeroSetDistance", "fixedWorldSpaceCarrierDensity"],
      ["fixedWorldSpaceCarrierDensity", "organizedCoreDensity"],
      ["fixedWorldSpaceCarrierDensity", "organizedSheathDensity"],
      ["detectorIntegratedAcousticEnergy", "organizedCoreDensity"],
      ["detectorIntegratedAcousticEnergy", "organizedSheathDensity"],
      ["materialDensityScale", "organizedCoreDensity"],
      ["materialDensityScale", "organizedSheathDensity"],
      ["carrierColumnDensityScale", "organizedCoreDensity"],
      ["carrierColumnDensityScale", "organizedSheathDensity"],
      ["organizedCoreDensity", "organizedDensity"],
      ["organizedSheathDensity", "organizedDensity"],
      ["organizedCoreDensity", "coreEmissionSourceStrength"],
      ["organizedSheathDensity", "sheathEmissionSourceStrength"],
      ["organizedDensity", "sigmaS"],
      ["organizedDensity", "sigmaA"],
      ["organizedDensity", "emissionSourceStrength"],
      ["scatteringCoefficient", "sigmaS"],
      ["absorptionCoefficient", "sigmaA"],
      ["laserExcitedEmissionCoefficient", "emissionSourceStrength"],
      ["laserExcitedEmissionCoefficient", "coreEmissionSourceStrength"],
      ["laserExcitedEmissionCoefficient", "sheathEmissionSourceStrength"],
      ["sigmaS", "extinction"],
      ["sigmaA", "extinction"],
      ["carrierNormalViewCosine", "holographicFresnelEmission"],
      ["holographicFresnelEmission", "fresnelEmissionSourceStrength"],
      ["emissionSourceStrength", "fresnelEmissionSourceStrength"],
      ["coreEmissionSourceStrength", "baseSourceRadiance"],
      ["sheathEmissionSourceStrength", "baseSourceRadiance"],
      ["fresnelEmissionSourceStrength", "baseSourceRadiance"],
      ["materialChromaticity", "baseSourceRadiance"],
      ["materialChromaticity", "accentSourceRadiance"],
      ["surfaceChromaticity", "baseSourceRadiance"],
      ["holographicBaseRadianceGain", "baseSourceRadiance"],
      ["holographicBaseRadianceGain", "accentSourceRadiance"],
      ["laserTransportReady", "laserCausticAccentAuthority"],
      ["incidentLaserIrradiance", "laserCausticAccentAuthority"],
      ["laserCausticAccentAuthority", "accentSourceRadiance"],
      ["baseSourceRadiance", "accentSourceRadiance"],
      ["baseSourceRadiance", "sourceRadiance"],
      ["accentSourceRadiance", "sourceRadiance"],
      ["baseSourceRadiance", "volumeBaseRadiance"],
      ["accentSourceRadiance", "volumeAccentRadiance"],
      ["volumeTransmittance", "coverage"],
    ];

    for (const [quantity, consumer] of allowedEdges) {
      expect(
        isRaymarchQuantityConsumerAllowed(quantity, consumer),
        `${quantity} -> ${consumer}`,
      ).toBe(true);
    }

    expect(
      isRaymarchQuantityConsumerAllowed(
        "absorptionCoefficient",
        "sourceRadiance",
      ),
    ).toBe(false);
    expect(
      isRaymarchQuantityConsumerAllowed(
        "incidentLaserIrradiance",
        "baseSourceRadiance",
      ),
    ).toBe(false);
    expect(() =>
      assertRaymarchQuantityConsumerAllowed(
        "incidentLaserIrradiance",
        "baseSourceRadiance",
      ),
    ).toThrow(/incidentLaserIrradiance.*baseSourceRadiance/);
  });

  it("forbids pitch, beat, radial, profile, and frame visibility compensation", () => {
    for (const quantityName of [
      "fixedWorldSpaceCarrierDensity",
      "organizedDensity",
      "sourceRadiance",
    ]) {
      for (const consumerName of VISIBILITY_COMPENSATION_CONSUMERS) {
        expect(
          isRaymarchQuantityConsumerAllowed(quantityName, consumerName),
          `${quantityName} -> ${consumerName}`,
        ).toBe(false);
      }
    }

    expect(RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY.sourceRadiance).toEqual(
      expect.arrayContaining(VISIBILITY_COMPENSATION_CONSUMERS),
    );
  });

  it("keeps spectral and static color in chromaticity ownership only", () => {
    const spectralProjection = getRaymarchQuantityContract(
      "spectralDisplayProjection",
    );
    expect(spectralProjection.represents).toContain("chromaticity");
    expect(spectralProjection.transforms.join(" ")).not.toContain(
      "density shaping",
    );
    expect(spectralProjection.allowedConsumers).toContain(
      "materialChromaticity",
    );
    expect(
      isRaymarchQuantityConsumerAllowed(
        "materialChromaticity",
        "incidentLaserIrradiance",
      ),
    ).toBe(false);
  });

  it("declares executable audits for every canonical owner seam", () => {
    expect(RAYMARCH_RENDER_SURFACE_AUDITS).toEqual(
      expect.objectContaining({
        fieldCacheMatchedFieldGradient: expect.objectContaining({
          file: "fieldCache.js",
          owner: "matchedFieldGradient",
        }),
        materialMatchedFieldGradient: expect.objectContaining({
          file: "material.js",
          owner: "matchedFieldGradient",
        }),
        materialLocalZeroSetDistance: expect.objectContaining({
          owner: "localZeroSetDistance",
          requiredTokens: expect.arrayContaining([
            "localFieldDistance",
            "abs(fieldValue).div",
          ]),
        }),
        materialGaussianIntervalIntegration: expect.objectContaining({
          owner: "fixedWorldSpaceCarrierDensity",
          requiredTokens: expect.arrayContaining([
            "intervalEnergy",
            "pointProfile",
          ]),
        }),
        materialFixedWorldSpaceCarrier: expect.objectContaining({
          owner: "fixedWorldSpaceCarrierDensity",
          requiredTokens: expect.arrayContaining([
            "coreFwhmWorld",
            "sheathFwhmWorld",
            "coreEnergyFraction",
            "sheathEnergyFraction",
          ]),
        }),
        fieldCacheDetectorWindowedEnergy: expect.objectContaining({
          owner: "detectorIntegratedAcousticEnergy",
          requiredTokens: expect.arrayContaining([
            "frequencySeparationHz",
            "normalizedSinc",
            "incoherentResidualEnergy",
          ]),
        }),
        materialDetectorWindowedEnergy: expect.objectContaining({
          owner: "detectorIntegratedAcousticEnergy",
          requiredTokens: expect.arrayContaining([
            "detectorIntegratedAcousticEnergy",
            "phaseInterferenceCarrier.independentSpatialEnergy",
            "phaseInterferenceCarrier.detectorIntegratedSpatialEnergy",
          ]),
        }),
        acousticEnergyTransferCpuOwner: expect.objectContaining({
          file: "observationTransfer.js",
          requiredTokens: expect.arrayContaining([
            "organizedDensity",
            "organizedCoreDensity",
            "organizedSheathDensity",
            "sigmaS",
            "sigmaA",
            "extinction",
            "laserExcitedEmissionCoefficient",
            "emissionSourceStrength",
            "coreEmissionSourceStrength",
            "sheathEmissionSourceStrength",
            "holographicFresnel",
            "fresnelEmissionSourceStrength",
            "holographicBaseRadianceGain",
            "laserAccentAuthority",
            "baseRadiance",
            "accentRadiance",
            "sourceRadiance",
          ]),
        }),
        acousticEnergyTransferNodeOwner: expect.objectContaining({
          file: "observationTransferNode.js",
          requiredTokens: expect.arrayContaining([
            "organizedDensity",
            "organizedCoreDensity",
            "organizedSheathDensity",
            "sigmaS",
            "sigmaA",
            "extinction",
            "laserExcitedEmissionCoefficient",
            "emissionSourceStrength",
            "coreEmissionSourceStrength",
            "sheathEmissionSourceStrength",
            "holographicFresnel",
            "fresnelEmissionSourceStrength",
            "holographicBaseRadianceGain",
            "laserAccentAuthority",
            "baseRadiance",
            "accentRadiance",
          ]),
        }),
        materialChromaticity: expect.objectContaining({
          owner: "materialChromaticity",
          requiredTokens: expect.arrayContaining([
            "spectralChromaticity",
            "fallbackChromaticity",
          ]),
        }),
        materialEmissionExtinctionTransfer: expect.objectContaining({
          requiredTokens: expect.arrayContaining([
            "detectorIntegratedEnergy: detectorIntegratedAcousticEnergy",
            "coreDensity,",
            "sheathDensity,",
            "materialDensityScale,",
            "laserExcitedEmissionCoefficient",
            "holographicIntensity: uHolographicIntensity",
            "holographicFresnelPower: uHolographicFresnelPower",
            "normalDotRay: carrier.normalDotRay",
            "holographicBaseRadianceGain: uHolographicBaseRadianceGain",
            "laserAccentAuthority,",
            "baseRadiance",
            "accentRadiance",
            "extinction",
          ]),
        }),
        runtimeMaterialProbeTransfer: expect.objectContaining({
          startToken: "const materialProbeCarrierDensity =",
          requiredTokens: expect.arrayContaining([
            "materialProbeDetectorIntegratedEnergy",
            "materialProbeTransfer.extinction",
            "materialProbeTransfer.sourceRadiance",
          ]),
        }),
        runtimeMaterialProbeDiagnostics: expect.objectContaining({
          requiredTokens: expect.arrayContaining([
            "materialProbeMaterialDensityScale",
            "materialProbeOrganizedDensity",
            "materialProbeOrganizedCoreDensity",
            "materialProbeOrganizedSheathDensity",
            "materialProbeSigmaS",
            "materialProbeSigmaA",
            "materialProbeLaserExcitedEmissionCoefficient",
            "materialProbeEmissionSourceStrength",
            "materialProbeCoreEmissionSourceStrength",
            "materialProbeSheathEmissionSourceStrength",
            "materialProbeFresnelEmissionSourceStrength",
            "materialProbeHolographicFresnel",
            "materialProbeHolographicBaseRadianceGain",
            "materialProbeBaseRadiance",
            "materialProbeAccentRadiance",
          ]),
        }),
      }),
    );
  });

  it("executes every declared source audit against the current owners", () => {
    const sourceByFile = new Map();

    for (const [surfaceName, audit] of Object.entries(
      RAYMARCH_RENDER_SURFACE_AUDITS,
    )) {
      const sourceUrl = RAYMARCH_AUDIT_SOURCE_URL_BY_FILE[audit.file];
      expect(sourceUrl, audit.file).toBeTruthy();
      if (!sourceByFile.has(audit.file)) {
        sourceByFile.set(audit.file, readFileSync(sourceUrl, "utf8"));
      }
      expect(
        auditRaymarchSourceSurface(surfaceName, sourceByFile.get(audit.file)),
      ).toEqual(
        expect.objectContaining({
          surface: audit.surface,
          file: audit.file,
          owner: audit.owner,
        }),
      );
    }
  });

  it("fails a canonical owner audit when visibility compensation is inserted", () => {
    const carrierSource = readFileSync(
      RAYMARCH_AUDIT_SOURCE_URL_BY_FILE["carrierDensityNode.js"],
      "utf8",
    );
    const injectedSource = carrierSource.replace(
      "const carrierDensity = coreDensity.add(sheathDensity);",
      "const carrierDensity = coreDensity.add(sheathDensity);\n  const radialDistance = 0;",
    );

    expect(() =>
      auditRaymarchSourceSurface(
        "materialFixedWorldSpaceCarrier",
        injectedSource,
      ),
    ).toThrow(/radialDistance/);
  });

  it("keeps diagnostics and display compression downstream of physics", () => {
    for (const consumer of [
      "renderAuthority",
      "runtimeUploadAuthority",
      "projectedRenderEnergy",
      "sourceRadiance",
    ]) {
      expect(
        isRaymarchQuantityConsumerAllowed("diagnostics", consumer),
        `diagnostics -> ${consumer}`,
      ).toBe(false);
    }

    expect(
      getRaymarchQuantityContract("displayCompression").allowedConsumers,
    ).toEqual(["finalOutput", "displayDiagnostics"]);
    expect(
      isRaymarchQuantityConsumerAllowed(
        "displayCompression",
        "detectorIntegratedAcousticEnergy",
      ),
    ).toBe(false);
    expect(Object.isFrozen(RAYMARCH_QUANTITY_LEDGER)).toBe(true);
  });
});
