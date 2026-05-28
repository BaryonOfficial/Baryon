import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISUALIZATION_METHOD,
  LEGACY_CYMATICS_2D_METHOD,
  normalizeVisualizationMethod,
  usesRaymarchVolumePipeline,
  VISUALIZATION_METHODS,
} from "./types.js";

describe("normalizeVisualizationMethod", () => {
  it("migrates legacy cymatics-2d to fullscreen-volume", () => {
    expect(normalizeVisualizationMethod(LEGACY_CYMATICS_2D_METHOD)).toBe(
      VISUALIZATION_METHODS.fullscreenVolume,
    );
  });

  it("passes through canonical methods", () => {
    expect(normalizeVisualizationMethod(VISUALIZATION_METHODS.raymarch)).toBe(
      VISUALIZATION_METHODS.raymarch,
    );
    expect(
      normalizeVisualizationMethod(VISUALIZATION_METHODS.fullscreenVolume),
    ).toBe(VISUALIZATION_METHODS.fullscreenVolume);
  });

  it("falls back unknown methods to raymarch", () => {
    expect(normalizeVisualizationMethod("cymatics2d")).toBe(
      DEFAULT_VISUALIZATION_METHOD,
    );
    expect(normalizeVisualizationMethod(null)).toBe(
      DEFAULT_VISUALIZATION_METHOD,
    );
  });
});

describe("usesRaymarchVolumePipeline", () => {
  it("includes raymarch and fullscreen volume", () => {
    expect(usesRaymarchVolumePipeline(VISUALIZATION_METHODS.raymarch)).toBe(
      true,
    );
    expect(
      usesRaymarchVolumePipeline(VISUALIZATION_METHODS.fullscreenVolume),
    ).toBe(true);
    expect(usesRaymarchVolumePipeline("legacy")).toBe(false);
  });
});
