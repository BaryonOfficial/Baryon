import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERFORMANCE_TARGET_FPS,
  applyRenderQualityProfileOverrides,
  DEFAULT_RENDER_QUALITY_PRESET,
  DEFAULT_PERFORMANCE_PROFILE,
  normalizePerformanceProfile,
  normalizePerformanceTargetFps,
  normalizeRenderQualityPreset,
  PERFORMANCE_PROFILES,
  RENDER_QUALITY_PRESETS,
  resolveRenderQualityProfile,
} from "./outputPipeline.js";

describe("render quality profiles", () => {
  it("keeps the canonical performance profile constants aligned with the legacy aliases", () => {
    expect(PERFORMANCE_PROFILES).toBe(RENDER_QUALITY_PRESETS);
    expect(DEFAULT_PERFORMANCE_PROFILE).toBe(DEFAULT_RENDER_QUALITY_PRESET);
    expect(normalizeRenderQualityPreset("none")).toBe(
      normalizePerformanceProfile("none"),
    );
    expect(normalizeRenderQualityPreset("unexpected")).toBe(
      normalizePerformanceProfile("unexpected"),
    );
  });

  it("normalizes quality presets and defaults to auto", () => {
    expect(normalizeRenderQualityPreset("custom")).toBe("custom");
    expect(normalizeRenderQualityPreset("none")).toBe("none");
    expect(normalizeRenderQualityPreset("unexpected")).toBe(
      DEFAULT_RENDER_QUALITY_PRESET,
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
      renderScale: 0.75,
      traaEnabled: false,
      bloomAllowed: true,
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
    });
  });

  it("uses a manual baseline for the none profile", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "none",
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toEqual({
      qualityPreset: "none",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
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
      traaEnabled: false,
      bloomAllowed: false,
    });
  });

  it("ignores invalid override values", () => {
    expect(
      applyRenderQualityProfileOverrides(
        {
          qualityPreset: "none",
          targetFps: 60,
          renderScale: 1,
          traaEnabled: true,
          bloomAllowed: true,
        },
        {
          renderScale: 0,
          traaEnabled: "nope",
          bloomAllowed: null,
        },
      ),
    ).toEqual({
      qualityPreset: "none",
      targetFps: 60,
      renderScale: 1,
      traaEnabled: true,
      bloomAllowed: true,
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
      traaEnabled: false,
      bloomAllowed: false,
    });
  });
});
