import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PerformanceHud from "./PerformanceHud.jsx";

describe("PerformanceHud", () => {
  it("labels scale against requested and full resolution", () => {
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
          visualizationMethod: "cymatics-2d",
        },
      }),
    );

    expect(markup).toContain("Scale: 0.670 (requested 0.670, full 1.000)");
  });
});
