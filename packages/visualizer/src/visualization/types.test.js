import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISUALIZATION_METHOD,
  normalizeVisualizationMethod,
  usesRaymarchVolumePipeline,
  VISUALIZATION_METHODS,
} from "./types.js";

describe("normalizeVisualizationMethod", () => {
  it("passes through the canonical raymarch method", () => {
    expect(normalizeVisualizationMethod(VISUALIZATION_METHODS.raymarch)).toBe(
      VISUALIZATION_METHODS.raymarch,
    );
  });

  it("collapses removed/legacy methods onto raymarch", () => {
    expect(normalizeVisualizationMethod("fullscreen-volume")).toBe(
      DEFAULT_VISUALIZATION_METHOD,
    );
    expect(normalizeVisualizationMethod("cymatics-2d")).toBe(
      DEFAULT_VISUALIZATION_METHOD,
    );
    expect(normalizeVisualizationMethod(null)).toBe(
      DEFAULT_VISUALIZATION_METHOD,
    );
  });
});

describe("usesRaymarchVolumePipeline", () => {
  it("is true for the raymarch method and false otherwise", () => {
    expect(usesRaymarchVolumePipeline(VISUALIZATION_METHODS.raymarch)).toBe(
      true,
    );
    expect(usesRaymarchVolumePipeline("legacy")).toBe(false);
  });
});
