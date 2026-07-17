// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  advancedControlsDockSpy,
  baryonSceneSpy,
  canvasSpy,
  dispatchCameraControlCommandSpy,
  unsupportedWarningSpy,
  browserSupportState,
  audioSceneState,
  audioState,
  fullscreenState,
} = vi.hoisted(() => ({
  advancedControlsDockSpy: vi.fn(),
  baryonSceneSpy: vi.fn(),
  canvasSpy: vi.fn(),
  dispatchCameraControlCommandSpy: vi.fn(),
  unsupportedWarningSpy: vi.fn(),
  browserSupportState: {
    supportProbe: null,
    unsupportedReason: null,
    isUnsupported: false,
    isSupportReady: true,
    markRendererInitUnsupported: vi.fn(),
  },
  audioSceneState: {
    liveInputUiState: "active",
  },
  audioState: {
    selectedSource: "file",
  },
  fullscreenState: {
    isFullscreen: false,
  },
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: (props) => {
    canvasSpy(props);
    return React.createElement("div", null, props.children);
  },
}));

vi.mock("./BaryonScene", () => ({
  CAMERA_CONTROL_MODES: {
    previewLocal: "preview-local",
    externalSynced: "external-synced",
  },
  BaryonScene: (props) => {
    baryonSceneSpy(props);
    return null;
  },
}));

vi.mock("./cameraControlEvents.js", () => ({
  dispatchCameraControlCommand: dispatchCameraControlCommandSpy,
}));

vi.mock("./DiagnosticsHud.jsx", () => ({
  default: () => null,
}));

vi.mock("./PerformanceHud.jsx", () => ({
  default: () => null,
}));

vi.mock("./RendererErrorBoundary.jsx", () => ({
  RendererErrorBoundary: ({ children }) => children,
}));

vi.mock("./UnsupportedWarning.jsx", () => ({
  default: (props) => {
    unsupportedWarningSpy(props);
    return React.createElement("div", {
      "data-testid": "unsupported-warning",
    });
  },
}));

vi.mock("./LiveInputStatusPanel.jsx", () => ({
  default: () => null,
}));

vi.mock("./rendererDiagnostics.js", () => ({
  WEBGPU_RENDERER_INIT_ERROR: "WebGPURendererInitError",
  createBaryonRenderer: () => ({}),
}));

vi.mock("./hooks/useFullScreenToggle.jsx", () => ({
  useFullscreen: () => ({
    isFullscreen: fullscreenState.isFullscreen,
    toggleFullscreen: () => {},
  }),
}));

vi.mock("./AdvancedControlsDock.jsx", () => ({
  default: (props) => {
    advancedControlsDockSpy(props);
    return null;
  },
}));

vi.mock("./hooks/useBrowserSupportState.js", () => ({
  useBrowserSupportState: () => browserSupportState,
}));

vi.mock("./hooks/useDraggableFloatingUi.js", () => ({
  useDraggableFloatingUi: () => ({
    dragOffset: { x: 0, y: 0 },
    isDragging: false,
    handlePointerDown: () => {},
    handlePointerUp: () => {},
    handleDoubleClick: () => {},
  }),
}));

vi.mock("./hooks/useRendererModeState.js", () => ({
  useRendererModeState: () => ({
    forceWebGLFallbackTest: false,
    activeRendererFallback: false,
    canvasEpoch: 0,
    showCanvas: true,
    setShowCanvas: () => {},
  }),
}));

vi.mock("../context/AudioContext", () => ({
  useAudioScene: () => ({
    setIsEngineReady: () => {},
    setLiveInputRuntimeStatus: () => {},
    liveInputUiState: audioSceneState.liveInputUiState,
    liveInputErrorCode: null,
    resetAudioSession: () => {},
  }),
  useAudio: () => ({
    selectedSource: audioState.selectedSource,
  }),
}));

import {
  composeAuthoritativePerformanceHudMetrics,
  resolveCameraControlFieldState,
  resolvePreviewOverlayState,
  shouldUseAuthoritativePerformanceHud,
} from "./threeSceneState.js";
import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";
import { ControlsProvider } from "../controls/ControlsProvider.jsx";
import { createControlsStore } from "../controls/controlsStore.js";
import ThreeScene from "./ThreeScene.jsx";

describe("resolvePreviewOverlayState", () => {
  it("returns an unsupported state when presented performer preview is requested without support", () => {
    expect(
      resolvePreviewOverlayState({
        requested: true,
        rendering: false,
        supported: false,
      }),
    ).toMatchObject({
      state: "unsupported",
    });
  });

  it("uses intentional disabled copy when the native output preview mirror is off", () => {
    expect(
      resolvePreviewOverlayState({
        requested: true,
        rendering: false,
        supported: false,
        failureReason:
          "Preview shared-texture transfer is disabled while native output is active.",
      }),
    ).toMatchObject({
      state: "preview-mirror-disabled",
      title: "In-app preview disabled",
      message:
        "Native output is publishing directly. The app mirror is disabled to keep the output path stable.",
    });
  });

  it("returns a startup-failed state when the authoritative stage misses startup watchdogs", () => {
    expect(
      resolvePreviewOverlayState({
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
      resolvePreviewOverlayState({
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

  it("returns null once the preview is actively rendering", () => {
    expect(
      resolvePreviewOverlayState({
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

describe("preview camera control state", () => {
  it("uses the authoritative stage field state once the local scene is omitted", () => {
    expect(
      resolveCameraControlFieldState({
        frameFieldState: "idle",
        previewState: {
          omitLocalScene: true,
        },
        authoritativeStageStatus: {
          lastRenderedFieldState: "active",
        },
      }),
    ).toBe("active");
  });

  it("keeps preview camera control highlights source-owned even when the authoritative stage is mirrored", () => {
    expect(
      resolveCameraControlFieldState({
        frameFieldState: "idle",
        previewState: {
          omitLocalScene: true,
        },
        authoritativeStageStatus: {
          lastRenderedFieldState: "active",
        },
      }),
    ).toBe("active");
  });
});

describe("authoritative performance HUD composition", () => {
  it("uses authoritative metrics when visual output is active without the preview", () => {
    expect(
      shouldUseAuthoritativePerformanceHud({
        previewState: {
          enabled: false,
          requested: false,
          rendering: false,
          omitLocalScene: false,
          programOutputConfiguredActive: true,
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

  it("keeps authoritative HUD metrics hidden for data-only helper sessions", () => {
    expect(
      shouldUseAuthoritativePerformanceHud({
        previewState: {
          enabled: false,
          requested: false,
          rendering: false,
          omitLocalScene: false,
          programOutputConfiguredActive: false,
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
    ).toBe(false);
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
          outputPublishAttemptCount: 120,
          outputDeferredPublishCount: 8,
          outputCoalescedPublishCount: 3,
          outputLastPublishDurationMs: 8,
          outputAveragePublishDurationMs: 9.2,
          outputSuccessfulPublishCount: 94,
          outputDroppedPublishCount: 26,
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
      outputPublishAttemptCount: 120,
      outputDeferredPublishCount: 8,
      outputCoalescedPublishCount: 3,
      outputLastPublishDurationMs: 8,
      outputAveragePublishDurationMs: 9.2,
      outputSuccessfulPublishCount: 94,
      outputDroppedPublishCount: 26,
    });
  });

  it("does not publish output metric fields without output metrics", () => {
    expect(
      composeAuthoritativePerformanceHudMetrics(
        {
          fps: 60,
          smoothedFrameTimeMs: 16.67,
          targetFps: 60,
        },
        null,
      ),
    ).toStrictEqual({
      fps: 60,
      smoothedFrameTimeMs: 16.67,
      targetFps: 60,
    });

    expect(
      composeAuthoritativePerformanceHudMetrics(null, {
        outputTargetFps: null,
        outputFps: null,
        outputPaintFps: null,
        renderCompletedToPaintMs: null,
      }),
    ).toBeNull();
  });
});

describe("ThreeScene render behavior", () => {
  /** @type {HTMLDivElement | null} */
  let container = null;
  /** @type {import('react-dom/client').Root | null} */
  let root = null;

  beforeEach(() => {
    baryonSceneSpy.mockClear();
    advancedControlsDockSpy.mockClear();
    canvasSpy.mockClear();
    dispatchCameraControlCommandSpy.mockClear();
    unsupportedWarningSpy.mockClear();
    Object.assign(browserSupportState, {
      supportProbe: null,
      unsupportedReason: null,
      isUnsupported: false,
      isSupportReady: true,
    });
    browserSupportState.markRendererInitUnsupported.mockClear();
    audioSceneState.liveInputUiState = "active";
    audioState.selectedSource = "file";
    fullscreenState.isFullscreen = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("passes the device DPR through without the default R3F two-x cap", async () => {
    const originalDprDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "devicePixelRatio",
    );
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
    try {
      const controlsStore = createControlsStore();

      await act(async () => {
        root.render(
          React.createElement(
            ControlsProvider,
            { store: controlsStore },
            React.createElement(ThreeScene),
          ),
        );
      });

      expect(canvasSpy.mock.calls.at(-1)?.[0]?.dpr).toBe(3);
    } finally {
      if (originalDprDescriptor) {
        Object.defineProperty(
          window,
          "devicePixelRatio",
          originalDprDescriptor,
        );
      } else {
        delete window.devicePixelRatio;
      }
    }
  });

  it("does not rerender the canvas for controls consumed by the live event lane", async () => {
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });
    const initialCanvasRenderCount = canvasSpy.mock.calls.length;
    const initialSceneRenderCount = baryonSceneSpy.mock.calls.length;

    await act(async () => {
      controlsStore.updateControl("densityGain", 1.25, {
        persistMode: "none",
      });
    });

    expect(canvasSpy).toHaveBeenCalledTimes(initialCanvasRenderCount);
    expect(baryonSceneSpy).toHaveBeenCalledTimes(initialSceneRenderCount);
  });

  it("forwards footer actions to the advanced controls dock", async () => {
    const controlsStore = createControlsStore();
    const footerActions = [{ label: "Terms", onSelect: vi.fn() }];

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            controlsFooterActions: footerActions,
          }),
        ),
      );
    });

    expect(advancedControlsDockSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      footerActions,
    });
  });

  it("hides listener chrome by default in fullscreen", async () => {
    fullscreenState.isFullscreen = true;
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            controlsOverlay: React.createElement("div", {
              "data-testid": "listener-controls-overlay",
            }),
          }),
        ),
      );
    });

    expect(canvasSpy).toHaveBeenCalled();
    expect(advancedControlsDockSpy).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="listener-controls-overlay"]'),
    ).toBeNull();
  });

  it("shows listener chrome in fullscreen when the preference is enabled", async () => {
    fullscreenState.isFullscreen = true;
    const controlsStore = createControlsStore();
    const onShowUiInFullscreenChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            showUiInFullscreen: true,
            onShowUiInFullscreenChange,
            controlsOverlay: React.createElement("div", {
              "data-testid": "listener-controls-overlay",
            }),
          }),
        ),
      );
    });

    expect(advancedControlsDockSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      showUiInFullscreen: true,
      onShowUiInFullscreenChange,
    });
    expect(
      container.querySelector('[data-testid="listener-controls-overlay"]'),
    ).toBeInstanceOf(HTMLElement);
  });

  it("keeps the blocking unsupported warning as the default unsupported fallback", async () => {
    Object.assign(browserSupportState, {
      supportProbe: { failureCode: "gpu-missing" },
      unsupportedReason: "browser",
      isUnsupported: true,
      isSupportReady: false,
    });
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            controlsOverlay: React.createElement("div", {
              "data-testid": "listener-controls-overlay",
            }),
          }),
        ),
      );
    });

    expect(canvasSpy).not.toHaveBeenCalled();
    expect(baryonSceneSpy).not.toHaveBeenCalled();
    expect(advancedControlsDockSpy).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="listener-controls-overlay"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="unsupported-warning"]'),
    ).toBeInstanceOf(HTMLElement);
    expect(unsupportedWarningSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "browser",
        probe: { failureCode: "gpu-missing" },
      }),
    );
  });

  it("keeps shell chrome mounted for desktop when renderer support is unavailable", async () => {
    Object.assign(browserSupportState, {
      supportProbe: { failureCode: "gpu-missing" },
      unsupportedReason: "browser",
      isUnsupported: true,
      isSupportReady: false,
    });
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            allowUnsupportedShellUi: true,
            controlsOverlay: React.createElement("div", {
              "data-testid": "listener-controls-overlay",
            }),
            controlsBrandAccessory: React.createElement("div", {
              "data-testid": "desktop-update-brand",
            }),
            topRightOverlay: React.createElement("button", {
              "data-testid": "mode-toggle",
              type: "button",
            }),
          }),
        ),
      );
    });

    expect(canvasSpy).not.toHaveBeenCalled();
    expect(baryonSceneSpy).not.toHaveBeenCalled();
    expect(advancedControlsDockSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      visible: true,
    });
    expect(
      advancedControlsDockSpy.mock.calls.at(-1)?.[0]?.brandAccessory?.props,
    ).toMatchObject({
      "data-testid": "desktop-update-brand",
    });
    expect(
      container.querySelector('[data-testid="listener-controls-overlay"]'),
    ).toBeInstanceOf(HTMLElement);
    expect(
      container.querySelector('[data-testid="mode-toggle"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      container.querySelector('[data-testid="unsupported-warning"]'),
    ).toBeNull();
    expect(unsupportedWarningSpy).not.toHaveBeenCalled();
  });

  it("passes the custom target FPS to the render scene", async () => {
    const controlsStore = createControlsStore();
    controlsStore.updateControl("renderQualityPreset", "custom", {
      persistMode: "none",
    });
    controlsStore.updateControl("customTargetFps", 72, {
      persistMode: "none",
    });

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      performanceProfile: "custom",
      customTargetFps: 72,
      audioFeatureAuthorityRole: "local-producer",
    });
  });

  it("uses the output color as the opaque preview backdrop", async () => {
    const controlsStore = createControlsStore();
    controlsStore.updateControl("backgroundColor", "#112233", {
      persistMode: "none",
    });
    controlsStore.updateControl("outputMode", "opaque", {
      persistMode: "none",
    });
    controlsStore.updateControl("outputBackgroundColor", "#445566", {
      persistMode: "none",
    });

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    const sceneRoot = container.querySelector(
      '[data-testid="baryon-scene-root"]',
    );

    expect(sceneRoot?.style.background).toBe("rgb(68, 85, 102)");
  });

  it("keeps the transparent preview backdrop black", async () => {
    const controlsStore = createControlsStore();
    controlsStore.updateControl("backgroundColor", "#112233", {
      persistMode: "none",
    });
    controlsStore.updateControl("outputMode", "transparent", {
      persistMode: "none",
    });
    controlsStore.updateControl("outputBackgroundColor", "#445566", {
      persistMode: "none",
    });

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    const sceneRoot = container.querySelector(
      '[data-testid="baryon-scene-root"]',
    );

    expect(sceneRoot?.style.background).toBe("rgb(0, 0, 0)");
  });

  it("resets an active preset back to the default camera view", async () => {
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    const sideButton = container.querySelector(
      '[data-testid="camera-side-view-button"]',
    );
    const resetButton = container.querySelector(
      '[data-testid="camera-reset-view-button"]',
    );

    expect(sideButton).toBeInstanceOf(HTMLButtonElement);
    expect(resetButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      sideButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      resetButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatchCameraControlCommandSpy.mock.calls).toStrictEqual([
      [{ cameraPose: resolvePresetCameraPose("side") }],
      [{ cameraPose: DEFAULT_ACTIVE_CAMERA_POSE }],
    ]);
    expect(sideButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("uses the diagonal default camera view for active preview", async () => {
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    const topButton = container.querySelector(
      '[data-testid="camera-top-view-button"]',
    );
    const sideButton = container.querySelector(
      '[data-testid="camera-side-view-button"]',
    );

    expect(topButton).toBeInstanceOf(HTMLButtonElement);
    expect(sideButton).toBeInstanceOf(HTMLButtonElement);
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]?.cameraPose).toStrictEqual(
      DEFAULT_ACTIVE_CAMERA_POSE,
    );
    expect(topButton.getAttribute("aria-pressed")).toBe("false");
    expect(sideButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("hides camera controls while idle and keeps the idle camera default", async () => {
    audioSceneState.liveInputUiState = "idle";
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    expect(
      container.querySelector('[data-testid="camera-controls"]'),
    ).toBeNull();
    expect(dispatchCameraControlCommandSpy).not.toHaveBeenCalled();
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]?.cameraPose).toStrictEqual(
      resolvePresetCameraPose("side"),
    );
  });

  it("shows camera controls once file playback renders an active field", async () => {
    audioSceneState.liveInputUiState = "idle";
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene),
        ),
      );
    });

    expect(
      container.querySelector('[data-testid="camera-controls"]'),
    ).toBeNull();

    await act(async () => {
      baryonSceneSpy.mock.calls.at(-1)?.[0]?.onFrameState?.({
        featureFrame: { fieldState: "active" },
        cameraPose: {
          position: { x: 1.234, y: 0, z: -8.765 },
        },
      });
    });

    expect(
      container.querySelector('[data-testid="camera-controls"]'),
    ).toBeInstanceOf(HTMLElement);
    expect(
      container
        .querySelector('[data-testid="camera-top-view-button"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      container
        .querySelector('[data-testid="camera-side-view-button"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      container.querySelector('[data-testid="camera-view-readout"]')
        ?.textContent,
    ).toContain("x+1.23");
    expect(
      container.querySelector('[data-testid="camera-view-readout"]')
        ?.textContent,
    ).toContain("z-8.77");
  });

  it("keeps camera pose identity stable across unrelated rerenders", async () => {
    const controlsStore = createControlsStore();

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            diagnosticsHudExtraItems: [{ label: "A", value: 1 }],
          }),
        ),
      );
    });

    const initialPose = baryonSceneSpy.mock.calls.at(-1)?.[0]?.cameraPose;

    await act(async () => {
      root.render(
        React.createElement(
          ControlsProvider,
          { store: controlsStore },
          React.createElement(ThreeScene, {
            diagnosticsHudExtraItems: [{ label: "A", value: 2 }],
          }),
        ),
      );
    });

    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]?.cameraPose).toBe(initialPose);
  });
});
