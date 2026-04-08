import { describe, expect, it } from "vitest";
import {
  composeAuthoritativePerformanceHudMetrics,
  resolveActiveCameraControlPreset,
  resolveCameraControlFieldState,
  resolveOutputMirrorOverlayState,
  shouldUseAuthoritativePerformanceHud,
} from "./threeSceneState.js";

describe("resolveOutputMirrorOverlayState", () => {
  it("returns an unsupported state when presented performer preview is requested without support", () => {
    expect(
      resolveOutputMirrorOverlayState({
        requested: true,
        rendering: false,
        supported: false,
      }),
    ).toMatchObject({
      state: "unsupported",
    });
  });

  it("returns a startup-failed state when the authoritative stage misses startup watchdogs", () => {
    expect(
      resolveOutputMirrorOverlayState({
        requested: true,
        rendering: false,
        supported: true,
        connected: true,
        canvasAttached: true,
        startupFailed: true,
        failureReason: "Timed out waiting for the first publish.",
      }),
    ).toMatchObject({
      state: "startup-failed",
      message: "Timed out waiting for the first publish.",
    });
  });

  it("returns a recovering state while the authoritative runtime is retrying", () => {
    expect(
      resolveOutputMirrorOverlayState({
        requested: true,
        rendering: false,
        supported: true,
        connected: true,
        canvasAttached: true,
        recovering: true,
      }),
    ).toMatchObject({
      state: "recovering",
    });
  });

  it("returns null once the output mirror is actively rendering", () => {
    expect(
      resolveOutputMirrorOverlayState({
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

describe("output mirror camera control state", () => {
  it("uses the authoritative stage field state once the local scene is omitted", () => {
    expect(
      resolveCameraControlFieldState({
        frameFieldState: "idle",
        outputMirrorState: {
          omitLocalScene: true,
        },
        authoritativeStageStatus: {
          renderedFieldState: "active",
        },
      }),
    ).toBe("active");
  });

  it("uses the authoritative rendered camera preset for output mirror controls", () => {
    expect(
      resolveActiveCameraControlPreset({
        outputMirrorState: {
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
        outputMirrorState: {
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
  it("stays on authoritative metrics when output-authoritative mode is active without the output mirror", () => {
    expect(
      shouldUseAuthoritativePerformanceHud({
        outputMirrorState: {
          enabled: false,
          requested: false,
          rendering: false,
          omitLocalScene: false,
          authorityMode: "output-stage-authoritative",
        },
        authoritativeStageTelemetry: {
          performanceHudSnapshot: {
            fps: 58.6,
          },
        },
        authoritativeOutputHudMetrics: {
          outputFps: 57.9,
        },
      }),
    ).toBe(true);
  });

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
