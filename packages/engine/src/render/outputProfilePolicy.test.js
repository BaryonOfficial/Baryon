import { describe, expect, it } from "vitest";
import {
  applyRenderProfilePostProcessOverrides,
  DEFAULT_PERFORMANCE_PROFILE,
  DEFAULT_PERFORMANCE_TARGET_FPS,
  formatPerformanceProfileLabel,
  getRenderQualityProfileTargetFps,
  getRenderQualityProfileKey,
  isAdaptivePerformanceProfile,
  normalizePerformanceProfile,
  normalizePersistedPerformanceProfile,
  normalizePerformanceTargetFps,
  normalizeRenderPostProcessOverrides,
  normalizeResolvedRenderQualityProfile,
  RENDER_CONTEXTS,
  resolveRenderQualityProfile,
} from "./outputProfilePolicy.js";

describe("render performance profiles", () => {
  it("normalizes performance profile controls", () => {
    expect(normalizePerformanceProfile("auto")).toBe("auto");
    expect(normalizePerformanceProfile("custom")).toBe("custom");
    expect(normalizePerformanceProfile("max-quality")).toBe("max-quality");
    expect(normalizePerformanceProfile("none")).toBe(
      DEFAULT_PERFORMANCE_PROFILE,
    );
    expect(normalizePerformanceProfile("unexpected")).toBe(
      DEFAULT_PERFORMANCE_PROFILE,
    );

    expect(normalizePersistedPerformanceProfile("none")).toBe("max-quality");

    expect(isAdaptivePerformanceProfile("auto")).toBe(true);
    expect(isAdaptivePerformanceProfile("custom")).toBe(true);
    expect(isAdaptivePerformanceProfile("max-quality")).toBe(false);
    expect(isAdaptivePerformanceProfile("unexpected")).toBe(true);

    expect(normalizePerformanceTargetFps(48)).toBe(48);
    expect(normalizePerformanceTargetFps(5)).toBe(24);
    expect(normalizePerformanceTargetFps(500)).toBe(240);
    expect(normalizePerformanceTargetFps("unexpected")).toBe(
      DEFAULT_PERFORMANCE_TARGET_FPS,
    );
  });

  it("formats operator-facing performance profile labels", () => {
    expect(formatPerformanceProfileLabel("auto")).toBe("Auto");
    expect(formatPerformanceProfileLabel("max-quality")).toBe("Max Quality");
    expect(formatPerformanceProfileLabel("custom")).toBe("Custom");
    expect(formatPerformanceProfileLabel("custom", 48)).toBe(
      "Custom 48 FPS target",
    );
    expect(formatPerformanceProfileLabel("unexpected")).toBe("Auto");
  });

  it("keeps post-process overrides scoped to diagnostics toggles", () => {
    expect(
      normalizeRenderPostProcessOverrides({
        renderScale: 0.67,
        traaEnabled: false,
        bloomAllowed: false,
        carrierTruthEnabled: true,
        unexpected: true,
      }),
    ).toEqual({
      traaEnabled: false,
      bloomAllowed: false,
      carrierTruthEnabled: true,
    });

    expect(
      normalizeRenderPostProcessOverrides({
        renderScale: 0,
        traaEnabled: "nope",
        bloomAllowed: null,
        carrierTruthEnabled: "yes",
      }),
    ).toBeNull();
  });

  it("defaults carrier truth off and enables it only by explicit override", () => {
    const normalProfile = resolveRenderQualityProfile({
      qualityPreset: "auto",
    });
    const carrierTruthProfile = resolveRenderQualityProfile({
      qualityPreset: "auto",
      postProcessOverrides: { carrierTruthEnabled: true },
    });

    expect(normalProfile.carrierTruthEnabled).toBe(false);
    expect(carrierTruthProfile.carrierTruthEnabled).toBe(true);
    expect(
      getRenderQualityProfileKey(carrierTruthProfile),
    ).not.toBe(getRenderQualityProfileKey(normalProfile));
  });

  it("normalizes resolved profiles without accepting render-scale ownership", () => {
    expect(
      normalizeResolvedRenderQualityProfile({
        qualityPreset: "none",
        targetFps: 61.7,
        renderScale: 0.84,
        traaEnabled: true,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 240,
      startupRaymarchSteps: null,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(
      normalizeResolvedRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 120,
        renderScale: 0.67,
        traaEnabled: false,
        bloomAllowed: false,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "custom",
      targetFps: 120,
      startupRaymarchSteps: 32,
      traaEnabled: false,
      bloomAllowed: false,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(normalizeResolvedRenderQualityProfile(null)).toBeNull();
  });

  it("translates serialized render profile target fps to target FPS at the boundary", () => {
    expect(
      getRenderQualityProfileTargetFps({
        qualityPreset: "custom",
        targetFps: 62,
        renderScale: 0.5,
      }),
    ).toBe(62);

    expect(
      getRenderQualityProfileTargetFps(
        normalizeResolvedRenderQualityProfile({
          qualityPreset: "custom",
          targetFps: 61.7,
        }),
      ),
    ).toBe(62);

    expect(
      getRenderQualityProfileTargetFps({
        qualityPreset: "custom",
        targetFps: 61.7,
      }),
    ).toBeNull();

    expect(
      getRenderQualityProfileTargetFps({
        qualityPreset: "custom",
        targetFps: "60",
      }),
    ).toBeNull();

    expect(
      getRenderQualityProfileTargetFps({
        qualityPreset: "max-quality",
        targetFps: 240,
      }),
    ).toBe(240);

    expect(getRenderQualityProfileTargetFps(null)).toBeNull();
  });

  it("resolves preview profiles without publishing render scale", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "none",
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      startupRaymarchSteps: 32,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.preview,
    });

    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      startupRaymarchSteps: 16,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.preview,
    });

    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 120,
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toEqual({
      qualityPreset: "custom",
      targetFps: 120,
      startupRaymarchSteps: 16,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("resolves external-output adaptive target FPSs without publishing render scale", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 1920,
        outputHeight: 1080,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      startupRaymarchSteps: 32,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 2560,
        outputHeight: 1440,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      targetFps: 60,
      startupRaymarchSteps: 24,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      targetFps: 60,
      startupRaymarchSteps: 16,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("keeps custom and max-quality target FPSs explicit", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 97,
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toEqual({
      qualityPreset: "custom",
      targetFps: 97,
      startupRaymarchSteps: 16,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(
      resolveRenderQualityProfile({
        qualityPreset: "max-quality",
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 240,
      startupRaymarchSteps: null,
      traaEnabled: true,
      bloomAllowed: true,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("clamps custom target FPS and chooses conservative startup hints", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 5,
        outputWidth: 1920,
        outputHeight: 1080,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      qualityPreset: "custom",
      targetFps: 24,
      startupRaymarchSteps: 32,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 500,
        outputWidth: 2560,
        outputHeight: 1440,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      qualityPreset: "custom",
      targetFps: 240,
      startupRaymarchSteps: 16,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("applies diagnostics overrides without changing resolution semantics", () => {
    const profile = resolveRenderQualityProfile({
      qualityPreset: "auto",
      outputWidth: 1920,
      outputHeight: 1080,
      postProcessOverrides: {
        renderScale: 0.67,
        traaEnabled: false,
        bloomAllowed: false,
      },
    });

    expect(profile).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      startupRaymarchSteps: 32,
      traaEnabled: false,
      bloomAllowed: false,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.preview,
    });
    expect(profile).not.toHaveProperty("renderScale");
  });

  it("ignores render scale while applying post-process override helpers", () => {
    expect(
      applyRenderProfilePostProcessOverrides(
        {
          qualityPreset: "max-quality",
          targetFps: 60,
          traaEnabled: true,
          bloomAllowed: true,
          renderContext: RENDER_CONTEXTS.preview,
        },
        {
          renderScale: 0,
          traaEnabled: false,
          bloomAllowed: null,
        },
      ),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 60,
      traaEnabled: false,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("keys profile cache by adaptive target FPS and context but not render scale", () => {
    expect(
      getRenderQualityProfileKey({
        qualityPreset: "auto",
        targetFps: 60,
        renderScale: 0.5,
        traaEnabled: true,
        bloomAllowed: true,
      }),
    ).toBe(
      getRenderQualityProfileKey({
        qualityPreset: "auto",
        targetFps: 60,
        renderScale: 1,
        traaEnabled: true,
        bloomAllowed: true,
      }),
    );

    expect(
      getRenderQualityProfileKey({
        qualityPreset: "custom",
        targetFps: 48,
        traaEnabled: true,
        bloomAllowed: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).not.toBe(
      getRenderQualityProfileKey({
        qualityPreset: "custom",
        targetFps: 120,
        traaEnabled: true,
        bloomAllowed: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    );

    expect(
      getRenderQualityProfileKey({
        qualityPreset: "custom",
        targetFps: 120,
        startupRaymarchSteps: 16,
        traaEnabled: true,
        bloomAllowed: true,
        renderContext: RENDER_CONTEXTS.preview,
      }),
    ).not.toBe(
      getRenderQualityProfileKey({
        qualityPreset: "custom",
        targetFps: 120,
        startupRaymarchSteps: 16,
        traaEnabled: true,
        bloomAllowed: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    );

    expect(
      getRenderQualityProfileKey({
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: 32,
        traaEnabled: true,
        bloomAllowed: true,
      }),
    ).not.toBe(
      getRenderQualityProfileKey({
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: 16,
        traaEnabled: true,
        bloomAllowed: true,
      }),
    );

    expect(
      getRenderQualityProfileKey({
        qualityPreset: "auto",
        targetFps: "invalid",
        traaEnabled: true,
        bloomAllowed: true,
      }),
    ).toBe(
      getRenderQualityProfileKey({
        qualityPreset: "auto",
        targetFps: 60,
        traaEnabled: true,
        bloomAllowed: true,
      }),
    );

    expect(
      getRenderQualityProfileKey({
        qualityPreset: "max-quality",
        targetFps: 24,
        traaEnabled: true,
        bloomAllowed: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toBe(
      getRenderQualityProfileKey({
        qualityPreset: "max-quality",
        targetFps: 120,
        traaEnabled: true,
        bloomAllowed: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    );
  });
});
