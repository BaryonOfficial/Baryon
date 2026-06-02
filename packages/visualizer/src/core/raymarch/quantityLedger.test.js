import { describe, expect, it } from "vitest";
import {
  RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
  RAYMARCH_MATERIAL_TRANSFER_LANES,
  RAYMARCH_QUANTITY_LEDGER,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  assertRaymarchQuantityConsumerAllowed,
  getRaymarchQuantityContract,
  isRaymarchQuantityConsumerAllowed,
} from "./quantityLedger.js";

describe("raymarch quantity ownership ledger", () => {
  it("declares stable lane ownership for structural, observation, caustic, support, body, and emission quantities", () => {
    expect(RAYMARCH_QUANTITY_LEDGER_VERSION).toMatch(/^raymarch-/);
    expect(RAYMARCH_MATERIAL_TRANSFER_LANES).toEqual(
      expect.objectContaining({
        structural: expect.arrayContaining([
          "structuralProjectionDrive",
          "modalCoefficientEnergy",
        ]),
        observation: expect.arrayContaining([
          "visibleDensity",
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
      "modalCoefficientEnergy",
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
      expect(contract.allowedConsumers.length).toBeGreaterThan(0);
      expect(contract.forbiddenConsumers).toBeInstanceOf(Array);
    }
  });

  it("prevents support and observation floors from authorizing caustic, highlight, hot-core, or white-emission consumers", () => {
    for (const supportQuantity of [
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
