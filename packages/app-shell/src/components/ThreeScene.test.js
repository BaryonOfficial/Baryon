import { describe, expect, it } from "vitest";
import {
  composeAuthoritativePerformanceHudMetrics,
  resolveActiveCameraControlPreset,
  resolveCameraControlFieldState,
  resolveSharedPreviewOverlayState,
} from "./threeSceneState.js";

describe("resolveSharedPreviewOverlayState", () => {
  it("returns an unsupported state when presented performer preview is requested without support", () => {
    expect(
      resolveSharedPreviewOverlayState({
        requested: true,
        rendering: false,
        supported: false,
      }),
    ).toMatchObject({
      state: "unsupported",
    });
  });

  it("returns null once shared preview is actively rendering", () => {
    expect(
      resolveSharedPreviewOverlayState({
        requested: true,
        rendering: true,
        supported: true,
        connected: true,
        canvasAttached: true,
        healthy: true,
        stale: false,
      }),
    ).toBeNull();
  });
});

describe("shared preview camera control state", () => {
  it("uses the authoritative stage field state once the local scene is omitted", () => {
    expect(
      resolveCameraControlFieldState({
        frameFieldState: "idle",
        sharedPreviewMode: {
          omitLocalScene: true,
        },
        authoritativeStageStatus: {
          renderedFieldState: "active",
        },
      }),
    ).toBe("active");
  });

  it("uses the authoritative rendered camera preset for shared preview controls", () => {
    expect(
      resolveActiveCameraControlPreset({
        sharedPreviewMode: {
          omitLocalScene: true,
        },
        authoritativeStageStatus: {
          renderedCameraViewPreset: "top-down",
        },
        fallbackCameraViewPreset: "side",
      }),
    ).toBe("top-down");

    expect(
      resolveActiveCameraControlPreset({
        sharedPreviewMode: {
          omitLocalScene: true,
        },
        authoritativeStageStatus: {
          renderedCameraViewPreset: "invalid",
        },
        fallbackCameraViewPreset: "side",
      }),
    ).toBe("side");
  });
});

describe("authoritative performance HUD composition", () => {
  it("combines stage render metrics with output publish metrics", () => {
    expect(
      composeAuthoritativePerformanceHudMetrics(
        {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          targetFps: 60,
        },
        {
          outputTargetFps: 48,
          outputFps: 47.5,
          outputPaintFps: 48.2,
          renderCompletedToPaintMs: 9.5,
        },
      ),
    ).toMatchObject({
      fps: 60,
      smoothedFrameTimeMs: 16.67,
      targetFps: 60,
      outputTargetFps: 48,
      outputFps: 47.5,
      outputPaintFps: 48.2,
      renderCompletedToPaintMs: 9.5,
    });
  });
});
