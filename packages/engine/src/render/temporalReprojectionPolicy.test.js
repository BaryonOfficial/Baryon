import { describe, expect, it } from "vitest";

import { resolveTemporalReprojectionPolicy } from "./temporalReprojectionPolicy.js";

const RAYMARCH_METHOD = "raymarch";

describe("temporal reprojection policy", () => {
  it("keeps temporal accumulation disabled unless explicitly requested", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        featureFrame: {
          energyLedger: {
            projectedRenderEnergy: 0.05,
            renderEnergyEpsilon: 1e-6,
          },
        },
      }),
    ).toEqual({
      traaEnabled: false,
      accumulateHistory: false,
      shouldBypassHistory: false,
      reason: "traa-disabled",
    });
  });

  it("does not accumulate history from stale field-shaped frames without render authority", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        traaRequested: true,
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

  it("accumulates history for authorized raymarch frames with scene motion", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        traaRequested: true,
        featureFrame: {
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

  it("accumulates history for stable authorized raymarch frames", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        traaRequested: true,
        featureFrame: {
          energyLedger: {
            projectedRenderEnergy: 0.05,
            renderEnergyEpsilon: 1e-6,
          },
        },
        sceneSnapshot: {
          angularVelocity: 0,
          pitchVelocity: 0,
          rollVelocity: 0,
        },
      }),
    ).toMatchObject({
      traaEnabled: true,
      accumulateHistory: true,
      shouldBypassHistory: false,
      reason: "stable-raymarch-frame",
    });
  });

  it("accumulates history for recoverable capacity-limited descriptors", () => {
    expect(
      resolveTemporalReprojectionPolicy({
        visualizationMethod: RAYMARCH_METHOD,
        traaRequested: true,
        featureFrame: {
          energyLedger: {
            projectedRenderEnergy: 0.05,
            renderEnergyEpsilon: 1e-6,
          },
          modalDescriptor: {
            fieldAuthority: "capacity-limited",
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

  it("bypasses history for fatal modal descriptors", () => {
    for (const fieldAuthority of ["bandwidth-limited", "blocked"]) {
      expect(
        resolveTemporalReprojectionPolicy({
          visualizationMethod: RAYMARCH_METHOD,
          traaRequested: true,
          featureFrame: {
            energyLedger: {
              projectedRenderEnergy: 0.05,
              renderEnergyEpsilon: 1e-6,
            },
            modalDescriptor: {
              fieldAuthority,
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
    }
  });
});
