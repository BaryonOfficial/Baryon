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
  "material.js": new URL("./material.js", import.meta.url),
  "runtime.js": new URL("./runtime.js", import.meta.url),
});

describe("raymarch quantity ownership ledger", () => {
  it("declares stable lane ownership for structural, observation, caustic, support, body, and emission quantities", () => {
    expect(RAYMARCH_QUANTITY_LEDGER_VERSION).toMatch(/^raymarch-/);
    expect(RAYMARCH_RENDER_QUANTITY_LANES).toEqual(
      expect.objectContaining({
        "audio-evidence": expect.arrayContaining([
          "sourceEnergy",
          "sourceBoundaryModalObservationPolicy",
        ]),
        "modal-response": expect.arrayContaining(["storedModalEnergy"]),
        projection: expect.arrayContaining(["projectedRenderEnergy"]),
        "canonical-descriptor": expect.arrayContaining([
          "modalAmplitudeCoefficient",
          "modalIdentityTopology",
        ]),
        "runtime-upload": expect.arrayContaining(["runtimeUploadAuthority"]),
        phase: expect.arrayContaining([
          "phaseState",
          "phaseAuthorityCoherence",
          "interferenceContrast",
        ]),
        display: expect.arrayContaining([
          "displayCompression",
          "displayProjectionAmplitude",
        ]),
        material: expect.arrayContaining(["materialExcitationGate"]),
      }),
    );
    expect(RAYMARCH_MATERIAL_TRANSFER_LANES).toEqual(
      expect.objectContaining({
        structural: expect.arrayContaining([
          "structuralProjectionDrive",
          "modalCoefficientEnergy",
        ]),
        observation: expect.arrayContaining([
          "observationDensity",
          "observedDensityFloor",
        ]),
        caustic: expect.arrayContaining([
          "physicalCausticDensity",
          "causticVisibleDensity",
        ]),
        support: expect.arrayContaining(["supportVisibleDensity"]),
        body: expect.arrayContaining(["photographicBodyContribution"]),
        emission: expect.arrayContaining(["whiteEmissionFieldAuthority"]),
      }),
    );

    for (const quantityName of [
      "structuralProjectionDrive",
      "sourceEnergy",
      "sourceBoundaryModalObservationPolicy",
      "storedModalEnergy",
      "projectedRenderEnergy",
      "modalAmplitudeCoefficient",
      "modalIdentityTopology",
      "runtimeUploadAuthority",
      "phaseState",
      "phaseAuthorityCoherence",
      "signedField",
      "unsignedSupport",
      "cancellation",
      "interferenceContrast",
      "observationDensity",
      "causticRidgeAuthority",
      "displayCompression",
      "displayProjectionAmplitude",
      "diagnostics",
      "modalCoefficientEnergy",
      "materialExcitationGate",
      "visibleDensity",
      "observedDensityFloor",
      "physicalCausticDensity",
      "causticVisibleDensity",
      "supportVisibleDensity",
      "photographicBodyContribution",
      "cancellationSuppression",
      "photographicFocus",
      "whiteEmissionFieldAuthority",
    ]) {
      const contract = RAYMARCH_QUANTITY_LEDGER[quantityName];
      expect(contract, quantityName).toBeTruthy();
      expect(contract.quantity).toBe(quantityName);
      expect(contract.lane).toBeTypeOf("string");
      expect(contract.represents).toBeTypeOf("string");
      expect(contract.deepOwner).toBeTypeOf("string");
      expect(contract.allowedConsumerPath.length).toBeGreaterThan(0);
      expect(contract.allowedConsumers.length).toBeGreaterThan(0);
      expect(contract.forbiddenConsumers).toBeInstanceOf(Array);
    }
  });

  it("declares executable source-surface audits for material and probe consumers", () => {
    expect(RAYMARCH_RENDER_SURFACE_AUDITS).toEqual(
      expect.objectContaining({
        materialObservationCore: expect.objectContaining({
          file: "material.js",
          requiredTokens: expect.arrayContaining([
            "const { observationDensity } = observationTransfer;",
          ]),
          forbiddenTokens: expect.arrayContaining(["visibleDensity"]),
        }),
        materialHighlightAuthority: expect.objectContaining({
          owner: "causticVisibleDensity",
          forbiddenTokens: expect.arrayContaining(["observedDensityFloor"]),
        }),
        materialWhiteEmissionAuthority: expect.objectContaining({
          owner: "whiteEmissionFieldAuthority",
          requiredTokens: expect.arrayContaining([
            "whiteEmissionRidgeEvidence",
            "whiteEmissionFieldAuthority",
          ]),
        }),
        runtimeMaterialProbeTransfer: expect.objectContaining({
          file: "runtime.js",
          requiredTokens: expect.arrayContaining([
            "materialProbeObservationDensity",
          ]),
          forbiddenTokens: expect.arrayContaining([
            "materialProbeVisibleDensity",
          ]),
        }),
        sourceBoundaryModalObservationPolicy: expect.objectContaining({
          file: "audioSourceEvidence.js",
          owner: "audioSourceEvidence.js source boundary",
          requiredTokens: expect.arrayContaining([
            "suppressWeakSpectralFallbackDrive",
            "suppressWeakResonantDrive",
          ]),
        }),
        modalObservationSourcePolicyConsumer: expect.objectContaining({
          file: "modalObservedScoring.js",
          owner: "sourceBoundaryModalObservationPolicy",
          forbiddenTokens: expect.arrayContaining([
            "analysisClass === \"file\"",
          ]),
        }),
        modalProjectionDisplayScore: expect.objectContaining({
          file: "modalExcitation.js",
          owner: "displayProjectionAmplitude",
          forbiddenTokens: expect.arrayContaining(["signalAmplitude"]),
        }),
        materialExcitationAuthority: expect.objectContaining({
          file: "material.js",
          owner: "materialExcitationGate",
          forbiddenTokens: expect.arrayContaining(["uAverageAmplitude"]),
        }),
      }),
    );
    expect(RAYMARCH_RENDER_SURFACE_AUDITS.materialHotCoreAuthority.owner).toBe(
      "photographicLaserCausticRadiance plus caustic highlight evidence",
    );
  });

  it("executes declared source-surface audits against their source files", () => {
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

  it("prevents support and observation floors from authorizing caustic, highlight, hot-core, or white-emission consumers", () => {
    for (const supportQuantity of [
      "observationDensity",
      "visibleDensity",
      "observedDensityFloor",
      "supportVisibleDensity",
      "photographicBodyContribution",
    ]) {
      for (const consumer of [
        "highlightMask",
        "hotCoreInput",
        "whiteEmissionFieldAuthority",
        "causticRadianceContribution",
      ]) {
        expect(
          isRaymarchQuantityConsumerAllowed(supportQuantity, consumer),
          `${supportQuantity} -> ${consumer}`,
        ).toBe(false);
      }
    }

    expect(
      isRaymarchQuantityConsumerAllowed(
        "supportVisibleDensity",
        "supportRevealContribution",
      ),
    ).toBe(true);
  });

  it("keeps cancellation suppression and photographic focus out of standalone white-emission authority", () => {
    expect(
      isRaymarchQuantityConsumerAllowed(
        "cancellationSuppression",
        "whiteEmissionFieldAuthority",
      ),
    ).toBe(false);
    expect(
      isRaymarchQuantityConsumerAllowed(
        "photographicFocus",
        "whiteEmissionFieldAuthority",
      ),
    ).toBe(false);
    expect(
      getRaymarchQuantityContract("photographicFocus")
        .requiredEvidenceByConsumer.whiteEmissionLocalEvidence,
    ).toEqual(expect.arrayContaining(["whiteEmissionRidgeEvidence"]));
    expect(() =>
      assertRaymarchQuantityConsumerAllowed(
        "cancellationSuppression",
        "whiteEmissionFieldAuthority",
      ),
    ).toThrow(/cancellationSuppression.*whiteEmissionFieldAuthority/);
  });

  it("keeps phase state and phase authority out of topology, coefficients, and render authority", () => {
    for (const phaseQuantity of [
      "phaseState",
      "phaseAuthorityCoherence",
      "interferenceContrast",
    ]) {
      for (const consumer of [
        "modalIdentityTopology",
        "modalAmplitudeCoefficient",
        "renderAuthority",
      ]) {
        expect(
          isRaymarchQuantityConsumerAllowed(phaseQuantity, consumer),
          `${phaseQuantity} -> ${consumer}`,
        ).toBe(false);
      }
    }

    expect(
      getRaymarchQuantityContract("phaseState").allowedConsumers,
    ).toContain("interferenceContrast");
  });

  it("prevents diagnostics and runtime authority from creating energy or liveness", () => {
    for (const consumer of [
      "renderAuthority",
      "runtimeUploadAuthority",
      "projectedRenderEnergy",
    ]) {
      expect(
        isRaymarchQuantityConsumerAllowed("diagnostics", consumer),
        `diagnostics -> ${consumer}`,
      ).toBe(false);
    }

    for (const energyQuantity of [
      "sourceEnergy",
      "storedModalEnergy",
      "projectedRenderEnergy",
    ]) {
      expect(
        isRaymarchQuantityConsumerAllowed(
          "runtimeUploadAuthority",
          energyQuantity,
        ),
        `runtimeUploadAuthority -> ${energyQuantity}`,
      ).toBe(false);
    }
  });

  it("keeps display compression downstream of modal semantics", () => {
    expect(
      getRaymarchQuantityContract("displayCompression").allowedConsumers,
    ).toEqual(["finalOutput", "displayDiagnostics"]);

    for (const semanticConsumer of [
      "sourceEnergy",
      "storedModalEnergy",
      "projectedRenderEnergy",
      "modalAmplitudeCoefficient",
      "modalIdentityTopology",
      "runtimeUploadAuthority",
    ]) {
      expect(
        isRaymarchQuantityConsumerAllowed(
          "displayCompression",
          semanticConsumer,
        ),
        `displayCompression -> ${semanticConsumer}`,
      ).toBe(false);
    }
  });

  it("summarizes forbidden consumers for runtime audit snapshots", () => {
    expect(RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY.observedDensityFloor).toEqual(
      expect.arrayContaining(["highlightMask", "whiteEmissionFieldAuthority"]),
    );
    expect(RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY.cancellationSuppression).toEqual(
      expect.arrayContaining(["whiteEmissionFieldAuthority"]),
    );
    expect(RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY.physicalCausticDensity).not.toContain(
      "highlightMask",
    );
  });
});
