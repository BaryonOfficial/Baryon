import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENDER_QUALITY_PRESET,
  normalizeRenderQualityPreset,
  resolveRenderQualityProfile,
} from "./outputPipeline.js";

describe("render quality profiles", () => {
  it("normalizes quality presets and defaults to auto", () => {
    expect(normalizeRenderQualityPreset("performance")).toBe("performance");
    expect(normalizeRenderQualityPreset("quality")).toBe("quality");
    expect(normalizeRenderQualityPreset("unexpected")).toBe(
      DEFAULT_RENDER_QUALITY_PRESET,
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
      renderScale: 0.75,
      traaEnabled: false,
      bloomAllowed: true,
    });
  });

  it("applies the performance profile overrides", () => {
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "performance",
        outputWidth: 3840,
        outputHeight: 2160,
      }),
    ).toEqual({
      qualityPreset: "performance",
      renderScale: 0.67,
      traaEnabled: false,
      bloomAllowed: false,
    });
  });
});
