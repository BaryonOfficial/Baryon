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

  it("hides auto target FPS and keeps local cadence compact", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 69.9,
          smoothedFrameTimeMs: 14.31,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          qualityPreset: "auto",
          targetFps: 60,
          visualizationMethod: "raymarch",
          requestedRaymarchSteps: 80,
          effectiveRaymarchSteps: 80,
        },
      }),
    );

    expect(markup).toContain("FPS: 69.9");
    expect(markup).not.toContain("Target FPS:");
    expect(markup).not.toContain("Target:");
  });

  it("does not show a target FPS for max quality", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 118.7,
          smoothedFrameTimeMs: 8.42,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          qualityPreset: "max-quality",
          targetFps: 240,
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Max Quality");
    expect(markup).toContain("FPS: 118.7");
    expect(markup).not.toContain("Target FPS:");
  });

  it("does not repeat custom target FPS in the profile title", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 69.9,
          smoothedFrameTimeMs: 14.31,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          qualityPreset: "custom",
          targetFps: 72,
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Custom");
    expect(markup).toContain("Target: 72 FPS");
    expect(markup).not.toContain("Custom 72 FPS");
  });

  it("labels authoritative output target FPS consistently", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 58.8,
          outputFps: 59.2,
          outputPaintFps: 59.1,
          outputTargetFps: 48,
          renderCompletedToPaintMs: 2.4,
          smoothedFrameTimeMs: 17.01,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          qualityPreset: "custom",
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Target: 48 FPS");
    expect(markup).toContain("Stage: 58.8 FPS");
    expect(markup).toContain("Output: 59.2 FPS");
    expect(markup).toContain("Latency: 2.40 ms");
    expect(markup).not.toContain("Output Publish FPS:");
    expect(markup).not.toContain("Stage Over ms:");
    expect(markup).not.toContain("paint /");
  });

  it("hides missing publish FPS instead of showing a noisy n/a row", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 35.7,
          outputFps: null,
          outputPaintFps: 100.9,
          outputTargetFps: 60,
          renderCompletedToPaintMs: 4,
          smoothedFrameTimeMs: 27.98,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          qualityPreset: "auto",
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Stage: 35.7 FPS");
    expect(markup).toContain("Output: 100.9 FPS paint");
    expect(markup).not.toContain("n/a");
    expect(markup).not.toContain("Output Publish FPS:");
  });

  it("summarizes performer output diagnostics without budget-threshold pop-in", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        showPublishSummary: true,
        metrics: {
          fps: 44.3,
          smoothedFrameTimeMs: 22.56,
          outputFps: 58.4,
          outputPaintFps: 82.1,
          outputTargetFps: 60,
          renderCompletedToPaintMs: 15,
          lastInvalidateToPaintMs: 18.5,
          stageRenderLeadMs: 6.25,
          stageRenderCoalescedRequestCount: 3,
          outputPublishAttemptCount: 120,
          outputDeferredPublishCount: 8,
          outputCoalescedPublishCount: 3,
          outputDiscardedPendingPublishCount: 2,
          outputDiscardedPublishResultCount: 1,
          outputSuccessfulPublishCount: 94,
          outputDroppedPublishCount: 26,
          outputFailedPublishCount: 2,
          outputPaintWithoutPublishCount: 31,
          outputConsecutivePaintWithoutPublishCount: 4,
          outputLastPublishDropReason: "publish-target-changed",
          outputLastPublishDurationMs: 8,
          outputAveragePublishDurationMs: 9.2,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          qualityPreset: "auto",
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("Stage: 44.3 FPS");
    expect(markup).toContain("Output: 58.4 FPS");
    expect(markup).toContain("Latency: 15.00 ms");
    expect(markup).toContain("Publish: 94 / 120");
    expect(markup).toContain(
      "Queue: 8 deferred · 3 coalesced · 2 / 1 discarded",
    );
    expect(markup).toContain("Drops: 26");
    expect(markup).toContain("Failures: 2");
    expect(markup).not.toContain("Paint-only:");
    expect(markup).toContain("Last Drop: publish-target-changed");
    expect(markup).not.toContain("Publish ms:");
    expect(markup).not.toContain("82.1 FPS paint");
    expect(markup).not.toContain("Stage Over ms:");
    expect(markup).not.toContain("Invalidate-&gt;Paint ms:");
    expect(markup).not.toContain("Stage Lead ms:");
    expect(markup).not.toContain("Stage Coalesced:");
  });

  it("keeps an explicitly enabled publish summary mounted across publish states", () => {
    const renderPublishSummary = (metrics) =>
      renderToStaticMarkup(
        React.createElement(PerformanceHud, {
          metrics: createMetrics(metrics),
          showPublishSummary: true,
        }),
      );

    expect(
      renderPublishSummary({
        outputPublishAttemptCount: 120,
        outputSuccessfulPublishCount: 120,
      }),
    ).toContain("Publish: 120 / 120");
    expect(
      renderPublishSummary({
        outputPublishAttemptCount: 121,
        outputSuccessfulPublishCount: 120,
      }),
    ).toContain("Publish: 120 / 121");
    expect(
      renderPublishSummary({
        outputPublishAttemptCount: 1_260_000,
        outputSuccessfulPublishCount: 1_200_000,
      }),
    ).toContain("Publish: 1.2M / 1.3M");
    expect(renderPublishSummary({})).toContain("Publish: n/a");

    const defaultMarkup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: createMetrics({
          outputPublishAttemptCount: 121,
          outputSuccessfulPublishCount: 120,
        }),
      }),
    );
    expect(defaultMarkup).not.toContain("Publish:");
  });

  it("keeps paint-only counters out of the visible HUD layout", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: createMetrics({
          outputPaintWithoutPublishCount: 31,
          outputConsecutivePaintWithoutPublishCount: 4,
        }),
      }),
    );

    expect(markup).toContain("FPS: 60.0");
    expect(markup).toContain("Frame ms: 16.67");
    expect(markup).not.toContain("Paint-only:");
    expect(markup).not.toContain("Stage:");
  });

  it("does not enter split-output mode for null output metric fields", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 58.8,
          outputFps: null,
          outputPaintFps: null,
          outputTargetFps: null,
          renderCompletedToPaintMs: null,
          targetFps: 60,
          smoothedFrameTimeMs: 17.01,
          currentPixelRatio: 2,
          basePixelRatio: 2,
          qualityPreset: "custom",
          visualizationMethod: "raymarch",
        },
      }),
    );

    expect(markup).toContain("FPS: 58.8");
    expect(markup).toContain("Frame ms: 17.01");
    expect(markup).not.toContain("Stage FPS:");
    expect(markup).not.toContain("Output FPS:");
  });

  it("puts profile in the title row and separates resolution fields", () => {
    const metrics = {
      fps: 69.9,
      smoothedFrameTimeMs: 14.31,
      currentPixelRatio: 2,
      basePixelRatio: 2,
      qualityPreset: "max-quality",
      targetFps: 240,
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
    expect(markup).not.toContain("Profile:");
    expect(markup).toContain("font-style:italic");
    expect(markup.indexOf("Max Quality")).toBeLessThan(markup.indexOf("FPS:"));
    expect(markup.indexOf("Samples: 72 / 80")).toBeLessThan(
      markup.indexOf('data-testid="performance-hud-resolution-divider"'),
    );
    expect(
      markup.indexOf('data-testid="performance-hud-resolution-divider"'),
    ).toBeLessThan(markup.indexOf("Canvas:"));
    expect(markup).not.toContain("DPR:");
    expect(markup).toContain("Canvas:");
    expect(markup).not.toContain("Render Scale:");
  });

  it("shows the analytic camera-ray sample budget", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          currentPixelRatio: 1,
          basePixelRatio: 1,
          qualityPreset: "auto",
          targetFps: 60,
          visualizationMethod: "raymarch",
          requestedRaymarchSteps: 80,
          effectiveRaymarchSteps: 64,
        },
      }),
    );

    expect(markup).toContain("Samples: 64 / 80");
  });

  it("shows the physical canvas backing size when diagnostics provide it", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PerformanceHud, {
        metrics: {
          fps: 50,
          smoothedFrameTimeMs: 20,
          currentPixelRatio: 2,
          basePixelRatio: 2,
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
