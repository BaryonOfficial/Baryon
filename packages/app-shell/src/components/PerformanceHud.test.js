import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PerformanceHud from "./PerformanceHud.jsx";

describe("PerformanceHud", () => {
  it("labels local target fps as a frame budget instead of a render cap", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 69.9,
          smoothedFrameTimeMs: 14.31,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          renderScale: 1,
          requestedRenderScale: 1,
          qualityPreset: "max-quality",
          targetFps: 60,
          visualizationMethod: "raymarch",
          requestedRaymarchSteps: 80,
          effectiveRaymarchSteps: 80,
        },
      }),
    );

    expect(markup).toContain("FPS: 69.9");
    expect(markup).toContain("Frame Budget FPS: 60");
    expect(markup).not.toContain("Target FPS:");
  });

  it("shows the effective render scale without a duplicate governor target", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          renderScale: 0.67,
          requestedRenderScale: 0.67,
          qualityPreset: "auto",
          targetFps: 60,
          visualizationMethod: "fullscreen-volume",
        },
      }),
    );

    expect(markup).toContain("Render Scale: 0.670");
    expect(markup).not.toContain("Governor Target:");
  });

  it("shows raymarch steps for fullscreen volume", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          renderScale: 1,
          requestedRenderScale: 1,
          qualityPreset: "auto",
          targetFps: 60,
          visualizationMethod: "fullscreen-volume",
          requestedRaymarchSteps: 56,
          effectiveRaymarchSteps: 48,
        },
      }),
    );

    expect(markup).toContain("Steps: 48 / 56");
  });
});
