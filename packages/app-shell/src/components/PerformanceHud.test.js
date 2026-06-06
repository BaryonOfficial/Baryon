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
          qualityPreset: "auto",
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

  it("labels max quality cadence as display rate instead of an fps budget", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 118.7,
          smoothedFrameTimeMs: 8.42,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          renderScale: 1,
          requestedRenderScale: 1,
          qualityPreset: "max-quality",
          targetFps: 60,
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Max Quality");
    expect(markup).toContain("Cadence: Display Rate");
    expect(markup).toContain("FPS: 118.7");
    expect(markup).not.toContain("Frame Budget FPS:");
    expect(markup).not.toContain("Output Target FPS:");
  });

  it("does not repeat custom target fps in the profile title", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 69.9,
          smoothedFrameTimeMs: 14.31,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          renderScale: 1,
          requestedRenderScale: 1,
          qualityPreset: "custom",
          targetFps: 72,
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Custom");
    expect(markup).toContain("Frame Budget FPS: 72");
    expect(markup).not.toContain("Custom 72 FPS");
  });

  it("puts profile in the title row and separates resolution fields", () => {
    const metrics = {
      fps: 69.9,
      smoothedFrameTimeMs: 14.31,
      currentPixelRatio: 2,
      basePixelRatio: 2,
      renderScale: 0.75,
      qualityPreset: "max-quality",
      targetFps: 60,
      visualizationMethod: "raymarch",
      requestedRaymarchSteps: 80,
      effectiveRaymarchSteps: 72,
      renderSurface: {
        backingWidth: 1920,
        backingHeight: 1080,
      },
    };
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, { metrics }),
    );

    expect(markup).toContain(
      'data-testid="performance-hud-resolution-divider"',
    );
    expect(markup).toContain('data-testid="performance-hud-profile-title"');
    expect(markup).toContain("Performance");
    expect(markup).toContain("Max Quality");
    expect(markup).toContain("·");
    expect(markup).not.toContain("Performance Profile:");
    expect(markup).toContain("font-style:italic");
    expect(markup.indexOf("Max Quality")).toBeLessThan(
      markup.indexOf("Cadence: Display Rate"),
    );
    expect(markup.indexOf("Steps: 72 / 80")).toBeLessThan(
      markup.indexOf('data-testid="performance-hud-resolution-divider"'),
    );
    expect(
      markup.indexOf('data-testid="performance-hud-resolution-divider"'),
    ).toBeLessThan(markup.indexOf("DPR:"));
    expect(markup.indexOf("DPR:")).toBeLessThan(
      markup.indexOf("Render Scale:"),
    );
    expect(markup.indexOf("Render Scale:")).toBeLessThan(
      markup.indexOf("Canvas:"),
    );
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

  it("does not report post-process anti-aliasing state", () => {
    const markup = renderToStaticMarkup(
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
          smaaEnabled: true,
          temporalHistoryBlend: 0.5,
        },
      }),
    );

    expect(markup).not.toContain("TRAA:");
    expect(markup).not.toContain("SMAA:");
  });
});
