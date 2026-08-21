import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
  RAYMARCH_MATERIAL_TRANSFER_LANES,
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_QUANTITY_LEDGER,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_RENDER_QUANTITY_LANES,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
  assertRaymarchQuantityConsumerAllowed,
  getRaymarchQuantityContract,
  isRaymarchQuantityConsumerAllowed,
} from "./quantityLedger.js";
import {
  RAYMARCH_RENDER_SURFACE_AUDITS,
  auditRaymarchSourceSurface,
} from "./quantityLedgerAudit.js";

const SOURCE_URL_BY_FILE = Object.freeze({
  "fieldCacheBake.js": new URL("./fieldCacheBake.js", import.meta.url),
  "cymaticObserverNode.js": new URL(
    "./cymaticObserverNode.js",
    import.meta.url,
  ),
  "cymaticPlasmaCarrierNode.js": new URL(
    "./cymaticPlasmaCarrierNode.js",
    import.meta.url,
  ),
  "cymaticPlasmaProfileLookup.js": new URL(
    "./cymaticPlasmaProfileLookup.js",
    import.meta.url,
  ),
  "cymaticPlasmaTransfer.js": new URL(
    "./cymaticPlasmaTransfer.js",
    import.meta.url,
  ),
  "cymaticPlasmaTransferNode.js": new URL(
    "./cymaticPlasmaTransferNode.js",
    import.meta.url,
  ),
  "material.js": new URL("./material.js", import.meta.url),
  "SafeVolumetricLightingModel.js": new URL(
    "./SafeVolumetricLightingModel.js",
    import.meta.url,
  ),
  "runtimeDiagnostics.js": new URL("./runtimeDiagnostics.js", import.meta.url),
});

describe("raymarch quantity ownership ledger", () => {
  it("declares one complete-field persistent-observer architecture", () => {
    expect(RAYMARCH_QUANTITY_LEDGER_VERSION).toBe(
      "cymatic-observer-quantity-v11",
    );
    expect(RAYMARCH_OPTICAL_FIELD_REPRESENTATION).toBe(
      "complete-modal-gorkov-field-fixed-scale-space-persistent-topology-u0-observer",
    );
    expect(RAYMARCH_SPECTRAL_PHASE_REPRESENTATION).toBe(
      "observer-phase-cache-nearest-rgb-companion",
    );
    expect(RAYMARCH_RENDER_QUANTITY_LANES).toMatchObject({
      "modal-field": expect.arrayContaining([
        "admittedModalDescriptor",
        "modalCoefficientPacket",
      ]),
      "field-cache": expect.arrayContaining([
        "completeAcousticField",
        "fineApertureResolvedField",
        "topologyApertureResolvedField",
        "fineDetailAgreement",
        "fineResidualDetail",
      ]),
      "observer-state": expect.arrayContaining([
        "implicitSurfaceMotion",
        "observerGeometryPersistence",
        "observerSurfaceSupport",
        "observerFineDetail",
        "observerLocalRadiance",
        "observerAudioClock",
      ]),
      "spectral-phase": expect.arrayContaining([
        "modalSpectralPacket",
        "fieldSpectralMomentEvidence",
        "resolvedSpectralMomentEvidence",
        "observerLocalSpectralPhase",
        "observerLocalSpectralChromaticity",
      ]),
      "plasma-material": expect.arrayContaining([
        "plasmaContinuitySpineDensity",
        "plasmaDetailSpineDensity",
        "plasmaCoreDensity",
        "plasmaSheathDensity",
        "plasmaExtinction",
        "plasmaBaseRadiance",
      ]),
      "volume-integration": expect.arrayContaining([
        "volumeTransmittance",
        "volumeBaseRadiance",
        "volumeAccentRadiance",
      ]),
    });
  });

  it("keeps geometry, radiance, and spectral phase as independent observer lanes", () => {
    expect(
      getRaymarchQuantityContract("observerGeometryPersistence"),
    ).toMatchObject({
      allowedConsumers: ["plasmaCarrier", "diagnostics"],
      forbiddenConsumers: expect.arrayContaining([
        "audioEnergyGain",
        "spectralColorGain",
      ]),
    });
    expect(getRaymarchQuantityContract("observerLocalRadiance")).toMatchObject({
      allowedConsumers: ["plasmaAccentRadiance", "diagnostics"],
      forbiddenConsumers: expect.arrayContaining([
        "observerGeometry",
        "surfaceWidth",
      ]),
    });
    expect(
      getRaymarchQuantityContract("observerLocalSpectralPhase"),
    ).toMatchObject({
      allowedConsumers: ["spectralColorimetry", "diagnostics"],
      forbiddenConsumers: expect.arrayContaining([
        "plasmaDensity",
        "observerGeometry",
      ]),
    });
    expect(
      getRaymarchQuantityContract("observerLocalSpectralChromaticity"),
    ).toMatchObject({
      allowedConsumers: [
        "operatorSpectralChroma",
        "plasmaBaseRadiance",
        "plasmaAccentRadiance",
        "diagnostics",
      ],
      forbiddenConsumers: expect.arrayContaining([
        "plasmaDensity",
        "staticColorFallback",
        "evidenceDerivedChromaAttenuation",
      ]),
    });
  });

  it("packs bounded moment evidence and phase independently from geometry", () => {
    const fieldCacheSource = readFileSync(
      SOURCE_URL_BY_FILE["fieldCacheBake.js"],
      "utf8",
    );
    const observerSource = readFileSync(
      SOURCE_URL_BY_FILE["cymaticObserverNode.js"],
      "utf8",
    );
    const materialSource = readFileSync(
      SOURCE_URL_BY_FILE["material.js"],
      "utf8",
    );

    expect(fieldCacheSource).toContain("spectralFirstMoment.x");
    expect(fieldCacheSource).toContain("spectralSecondMoment.y");
    expect(observerSource).toContain("source.spectralPresence");
    expect(observerSource).toContain("previousAppearance.xy");
    expect(observerSource).toContain("spectralDirection.x");
    expect(observerSource).toContain("resolveSpectralChromaticityNode");
    expect(observerSource).not.toContain("recoverSpectralDirectionNode");
    expect(observerSource).not.toContain("spectralAuthority");
    expect(materialSource).toContain("observer.localSpectralChromaticity");
    expect(materialSource).not.toContain("observer.localSpectralPhase");
    expect(materialSource).not.toContain(
      "resolveInterpolatedSpectralChromaticityNode(",
    );
    expect(materialSource).not.toContain("observer.localSpectralAuthority");
  });

  it("lets fine detail reinforce material but never redefine topology", () => {
    expect(getRaymarchQuantityContract("fineDetailAgreement")).toMatchObject({
      allowedConsumers: ["observerFineDetail", "diagnostics"],
      forbiddenConsumers: expect.arrayContaining([
        "observerTopology",
        "implicitSurfaceMotion",
        "observerGeometry",
        "modalAdmission",
        "thresholdGate",
      ]),
    });
    expect(getRaymarchQuantityContract("fineResidualDetail")).toMatchObject({
      allowedConsumers: ["observerFineDetail", "diagnostics"],
      forbiddenConsumers: expect.arrayContaining([
        "observerTopology",
        "implicitSurfaceMotion",
        "surfaceIntersection",
      ]),
    });
    expect(
      getRaymarchQuantityContract("topologyApertureResolvedField"),
    ).toMatchObject({
      allowedConsumers: expect.arrayContaining([
        "observerTopology",
        "implicitSurfaceMotion",
      ]),
      forbiddenConsumers: expect.arrayContaining(["camera", "frameRate"]),
    });
    expect(
      getRaymarchQuantityContract("fineApertureResolvedField"),
    ).toMatchObject({
      forbiddenConsumers: expect.arrayContaining([
        "observerTopology",
        "implicitSurfaceMotion",
        "observerGeometry",
      ]),
    });
  });

  it("forbids presentation and performance state from owning observation", () => {
    expect(RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY.observerAudioClock).toEqual(
      expect.arrayContaining([
        "renderFrameClock",
        "camera",
        "outputResolution",
        "bloom",
        "performanceTier",
      ]),
    );
    expect(RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY.performanceResolution).toEqual(
      expect.arrayContaining([
        "modalAdmission",
        "observerClock",
        "observerExposure",
        "plasmaCalibration",
      ]),
    );
    expect(
      isRaymarchQuantityConsumerAllowed(
        "observerAudioClock",
        "observerHistoryAdvection",
      ),
    ).toBe(true);
    expect(
      isRaymarchQuantityConsumerAllowed("observerAudioClock", "camera"),
    ).toBe(false);
    expect(() =>
      assertRaymarchQuantityConsumerAllowed("optionalBloom", "observerState"),
    ).toThrow(
      "Raymarch quantity contract violation: optionalBloom cannot feed observerState.",
    );
  });

  it("exposes only canonical observer quantities to the material transfer", () => {
    const materialQuantities = Object.values(
      RAYMARCH_MATERIAL_TRANSFER_LANES,
    ).flat();
    expect(materialQuantities).toEqual(
      expect.arrayContaining([
        "observerGeometryPersistence",
        "observerSurfaceNormal",
        "observerSurfaceSupport",
        "observerFineDetail",
        "observerLocalRadiance",
        "observerLocalSpectralChromaticity",
        "plasmaContinuitySpineDensity",
        "plasmaDetailSpineDensity",
        "plasmaCoreDensity",
        "plasmaSheathDensity",
        "plasmaExtinction",
        "plasmaBaseRadiance",
        "plasmaAccentRadiance",
      ]),
    );
    expect(materialQuantities).not.toEqual(
      expect.arrayContaining([
        "trapWeightedLevelSurface",
        "holographicBaseRadianceGain",
        "carrierCoreFwhmWorld",
        "contourSharpness",
      ]),
    );
  });

  it("audits every canonical source owner", () => {
    for (const [name, audit] of Object.entries(
      RAYMARCH_RENDER_SURFACE_AUDITS,
    )) {
      const sourceUrl = SOURCE_URL_BY_FILE[audit.file];
      expect(sourceUrl, `${name} source URL`).toBeDefined();
      const source = readFileSync(sourceUrl, "utf8");
      expect(auditRaymarchSourceSurface(name, source)).toBe(true);
    }
  });

  it("fails closed when legacy transfer or modal paging reappears", () => {
    const fieldSource = readFileSync(
      SOURCE_URL_BY_FILE["fieldCacheBake.js"],
      "utf8",
    );
    const materialSource = readFileSync(
      SOURCE_URL_BY_FILE["material.js"],
      "utf8",
    );
    expect(() =>
      auditRaymarchSourceSurface(
        "completeFieldBake",
        fieldSource.replace(
          "// Modal field cache bake owner end.",
          "const modalPage = 0;\n// Modal field cache bake owner end.",
        ),
      ),
    ).toThrow("contains forbidden token: modalPage");
    expect(() =>
      auditRaymarchSourceSurface(
        "productionMaterial",
        materialSource.replace(
          "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
          "const uHolographicBaseRadianceGain = 1;\nconst RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
        ),
      ),
    ).toThrow("contains forbidden token: uHolographicBaseRadianceGain");
  });

  it("fails closed for unknown quantities and consumers", () => {
    expect(getRaymarchQuantityContract("not-a-quantity")).toBeNull();
    expect(
      isRaymarchQuantityConsumerAllowed("not-a-quantity", "diagnostics"),
    ).toBe(false);
    expect(
      isRaymarchQuantityConsumerAllowed("plasmaBaseRadiance", "not-a-consumer"),
    ).toBe(false);
  });

  it("freezes the ledger and contracts", () => {
    expect(Object.isFrozen(RAYMARCH_QUANTITY_LEDGER)).toBe(true);
    expect(
      Object.isFrozen(
        RAYMARCH_QUANTITY_LEDGER.observerGeometryPersistence.allowedConsumers,
      ),
    ).toBe(true);
    expect(Object.isFrozen(RAYMARCH_RENDER_QUANTITY_LANES)).toBe(true);
    expect(Object.isFrozen(RAYMARCH_MATERIAL_TRANSFER_LANES)).toBe(true);
  });
});
