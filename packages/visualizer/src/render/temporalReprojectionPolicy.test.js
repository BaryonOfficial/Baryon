import { describe, expect, it } from "vitest";

import { resolveTemporalReprojectionPolicy } from "./temporalReprojectionPolicy.js";

const RAYMARCH_METHOD = "raymarch";

describe("temporal reprojection policy", () => {
  it("does not accumulate history from stale field-shaped frames without render authority", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        featureFrame: {
          fieldState: "active",
          renderAuthority: true,
          energyLedger: {
            projectedRenderEnergy: 0,
            renderEnergyEpsilon: 1e-6,
          },
        },
        sceneSnapshot: {
          angularVelocity: 0.1,
        },
      }),
    ).toMatchObject({
      accumulateHistory: false,
      shouldBypassHistory: true,
      reason: "render-not-authorized",
    });
  });

  it("accumulates history only for authorized raymarch frames with scene motion", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        featureFrame: {
          fieldState: "active",
          energyLedger: {
            projectedRenderEnergy: 0.05,
            renderEnergyEpsilon: 1e-6,
          },
        },
        sceneSnapshot: {
          angularVelocity: 0.1,
        },
      }),
    ).toMatchObject({
      accumulateHistory: true,
      shouldBypassHistory: false,
      reason: "reprojectable-scene-motion",
    });
  });
});
