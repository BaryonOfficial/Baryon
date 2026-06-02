import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PerformanceHud from "./PerformanceHud.jsx";
import { TOP_RIGHT_OVERLAY_PANEL_WIDTH } from "./topRightOverlayLayout.js";

describe("PerformanceHud", () => {
  function createMetrics(overrides = {}) {
    return {
      fps: 60,
      smoothedFrameTimeMs: 16.67,
      currentPixelRatio: 1,
      basePixelRatio: 1,
      renderScale: 1,
      qualityPreset: "auto",
      targetFps: 60,
      visualizationMethod: "raymarch",
      ...overrides,
    };
  }

  it("matches the live input panel width and has no shell border", () => {
    const element = PerformanceHud({ metrics: createMetrics() });

    expect(element.props.style.width).toBe(TOP_RIGHT_OVERLAY_PANEL_WIDTH);
    expect(element.props.style.border).toBe("none");
  });

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
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Render Scale: 0.670");
    expect(markup).not.toContain("Governor Target:");
  });

  it("shows raymarch steps", () => {
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
          visualizationMethod: "raymarch",
          requestedRaymarchSteps: 80,
          effectiveRaymarchSteps: 64,
        },
      }),
    );

    expect(markup).toContain("Steps: 64 / 80");
  });

  it("shows the physical canvas backing size when diagnostics provide it", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 50,
          smoothedFrameTimeMs: 20,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          renderScale: 1,
          qualityPreset: "max-quality",
          targetFps: 60,
          visualizationMethod: "raymarch",
          renderSurface: {
            cssWidth: 1504,
            cssHeight: 830,
            backingWidth: 3008,
            backingHeight: 1660,
            backingMegapixels: 4.99328,
            pixelRatio: 2,
          },
        },
      }),
    );

    expect(markup).toContain("Canvas: 3008 x 1660 (4.99 MP)");
  });

  it("reports TRAA state and temporal-history blend", () => {
    const raymarchMarkup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          renderScale: 1,
          qualityPreset: "auto",
          targetFps: 60,
          visualizationMethod: "raymarch",
          traaEnabled: true,
          temporalHistoryBlend: 0.5,
        },
      }),
    );
    expect(raymarchMarkup).toContain("TRAA: on · blend 0.50");

    const traaOffMarkup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          renderScale: 1,
          qualityPreset: "auto",
          targetFps: 60,
          visualizationMethod: "raymarch",
          traaEnabled: false,
        },
      }),
    );
    expect(traaOffMarkup).toContain("TRAA: off");
  });
});
