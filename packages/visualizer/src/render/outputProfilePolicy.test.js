import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERFORMANCE_TARGET_FPS,
  applyRenderQualityProfileOverrides,
  DEFAULT_PERFORMANCE_PROFILE,
  formatPerformanceProfileLabel,
  normalizePerformanceProfile,
  normalizeRenderQualityProfileOverrides,
  normalizePerformanceTargetFps,
  normalizeResolvedRenderQualityProfile,
  RENDER_CONTEXTS,
  resolveRenderQualityProfile,
} from "./outputProfilePolicy.js";

describe("render quality profiles", () => {
  it("normalizes quality presets and defaults to max quality", () => {
    expect(normalizePerformanceProfile("auto")).toBe("auto");
    expect(normalizePerformanceProfile("custom")).toBe("custom");
    expect(normalizePerformanceProfile("none")).toBe("max-quality");
    expect(normalizePerformanceProfile("max-quality")).toBe("max-quality");
    expect(normalizePerformanceProfile("unexpected")).toBe(
      DEFAULT_PERFORMANCE_PROFILE,
    );
  });

  it("normalizes custom target fps values", () => {
    expect(normalizePerformanceTargetFps(48)).toBe(48);
    expect(normalizePerformanceTargetFps(5)).toBe(24);
    expect(normalizePerformanceTargetFps(500)).toBe(120);
    expect(normalizePerformanceTargetFps("unexpected")).toBe(
      DEFAULT_PERFORMANCE_TARGET_FPS,
    );
  });

  it("formats operator-facing performance profile labels", () => {
    expect(formatPerformanceProfileLabel("auto")).toBe("Auto");
    expect(formatPerformanceProfileLabel("none")).toBe("Max Quality");
    expect(formatPerformanceProfileLabel("max-quality")).toBe("Max Quality");
    expect(formatPerformanceProfileLabel("custom")).toBe("Custom");
    expect(formatPerformanceProfileLabel("custom", 48)).toBe("Custom 48 FPS");
    expect(formatPerformanceProfileLabel("unexpected")).toBe("Max Quality");
  });

  it("normalizes render profile overrides into the supported override shape", () => {
    expect(
      normalizeRenderQualityProfileOverrides({
        renderScale: 0.67,
        traaEnabled: false,
        bloomAllowed: false,
        unexpected: true,
      }),
    ).toEqual({
      renderScale: 0.67,
      bloomAllowed: false,
    });

    expect(
      normalizeRenderQualityProfileOverrides({
        renderScale: 0,
        traaEnabled: "nope",
        bloomAllowed: null,
      }),
    ).toBeNull();
  });

  it("normalizes resolved render profiles into the canonical internal shape", () => {
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
      targetFps: 62,
      renderScale: 0.84,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });

    expect(
      normalizeResolvedRenderQualityProfile({
        qualityPreset: "auto",
        renderScale: 0,
        traaEnabled: true,
      }),
    ).toBeNull();
  });

  it("normalizes legacy resolved profiles with TRAA disabled back to always-on policy", () => {
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
      renderScale: 0.67,
      traaEnabled: true,
      bloomAllowed: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("keeps full quality for auto at 1080p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 1920,
        outputHeight: 1080,
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("downgrades auto quality for 2160p output", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      renderScale: 0.84,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("uses external-output auto calibration at 1080p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 1920,
        outputHeight: 1080,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      renderScale: 0.75,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("uses external-output auto calibration at 2160p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 30,
      renderScale: 0.5,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("uses external-output auto calibration at 1440p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 2560,
        outputHeight: 1440,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 48,
      renderScale: 0.59,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("uses the auto baseline while preserving the custom target fps", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 48,
        outputWidth: 1920,
        outputHeight: 1080,
      }),
    ).toEqual({
      qualityPreset: "custom",
      targetFps: 48,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("uses external-output custom calibration for 49-72 fps at 1440p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 60,
        outputWidth: 2560,
        outputHeight: 1440,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "custom",
      targetFps: 60,
      renderScale: 0.59,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("uses external-output custom calibration for 97-120 fps", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 120,
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "custom",
      targetFps: 120,
      renderScale: 0.5,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("keeps auto and custom 60 identical for preview at 1080p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 1920,
        outputHeight: 1080,
      }),
    ).toMatchObject({
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 60,
        outputWidth: 1920,
        outputHeight: 1080,
      }),
    ).toMatchObject({
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("keeps auto and custom 60 identical for preview at 2160p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toMatchObject({
      targetFps: 60,
      renderScale: 0.84,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 60,
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toMatchObject({
      targetFps: 60,
      renderScale: 0.84,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("uses more conservative auto cadence than custom 60 for high-resolution external output", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 2560,
        outputHeight: 1440,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      targetFps: 48,
      renderScale: 0.59,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 60,
        outputWidth: 2560,
        outputHeight: 1440,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      targetFps: 60,
      renderScale: 0.59,
      traaEnabled: true,
      bloomAllowed: true,
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
      targetFps: 30,
      renderScale: 0.5,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 60,
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: RENDER_CONTEXTS.externalOutput,
      }),
    ).toMatchObject({
      targetFps: 60,
      renderScale: 0.5,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("keeps TRAA enabled for every external-output custom band", () => {
    for (const targetFps of [48, 60, 96, 120]) {
      expect(
        resolveRenderQualityProfile({
          qualityPreset: "custom",
          targetFps,
          outputWidth: 3840,
          outputHeight: 2160,
          renderContext: RENDER_CONTEXTS.externalOutput,
        }).traaEnabled,
      ).toBe(true);
    }
  });

  it("keeps TRAA enabled for preview high-resolution custom bands with distinct scales", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 48,
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toMatchObject({
      renderScale: 0.92,
      traaEnabled: true,
    });
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 96,
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toMatchObject({
      renderScale: 0.75,
      traaEnabled: true,
    });
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "custom",
        targetFps: 120,
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toMatchObject({
      renderScale: 0.67,
      traaEnabled: true,
    });
  });

  it("keeps full quality for max-quality preview at 2160p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "max-quality",
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("keeps full quality for max-quality external-output at 2160p", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "max-quality",
        outputWidth: 3840,
        outputHeight: 2160,
        renderContext: "external-output",
      }),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("applies explicit overrides without changing the preset", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        outputWidth: 1920,
        outputHeight: 1080,
        overrides: {
          renderScale: 0.67,
          traaEnabled: false,
          bloomAllowed: false,
        },
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      renderScale: 0.67,
      traaEnabled: true,
      bloomAllowed: false,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("drops TRAA override attempts before applying profile overrides", () => {
    expect(
      normalizeRenderQualityProfileOverrides({
        traaEnabled: false,
      }),
    ).toBeNull();

    expect(
      applyRenderQualityProfileOverrides(
        {
          qualityPreset: "max-quality",
          targetFps: 60,
          renderScale: 1,
          traaEnabled: true,
          bloomAllowed: true,
          renderContext: RENDER_CONTEXTS.preview,
        },
        {
          traaEnabled: false,
        },
      ),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("ignores invalid override values", () => {
    expect(
      applyRenderQualityProfileOverrides(
        {
          qualityPreset: "max-quality",
          targetFps: 60,
          renderScale: 1,
          traaEnabled: true,
          bloomAllowed: true,
          renderContext: RENDER_CONTEXTS.preview,
        },
        {
          renderScale: 0,
          traaEnabled: "nope",
          bloomAllowed: null,
        },
      ),
    ).toEqual({
      qualityPreset: "max-quality",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });

  it("preserves explicit profile fields when a resolved profile is re-used", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        renderScale: 0.67,
        traaEnabled: false,
        bloomAllowed: false,
      }),
    ).toEqual({
      qualityPreset: "auto",
      targetFps: 60,
      renderScale: 0.67,
      traaEnabled: true,
      bloomAllowed: false,
      renderContext: RENDER_CONTEXTS.preview,
    });
  });
});
