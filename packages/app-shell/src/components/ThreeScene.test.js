// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  baryonSceneSpy,
  dispatchCameraControlCommandSpy,
  audioSceneState,
  audioState,
} = vi.hoisted(() => ({
  baryonSceneSpy: vi.fn(),
  dispatchCameraControlCommandSpy: vi.fn(),
  audioSceneState: {
    liveInputUiState: "active",
  },
  audioState: {
    selectedSource: "file",
  },
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }) => React.createElement("div", null, children),
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

vi.mock("./ParticleDebugOverlay.jsx", () => ({
  default: () => null,
}));

vi.mock("./PerformanceHud.jsx", () => ({
  default: () => null,
}));

vi.mock("./RendererErrorBoundary.jsx", () => ({
  RendererErrorBoundary: ({ children }) => children,
}));

vi.mock("./UnsupportedWarning.jsx", () => ({
  default: () => null,
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
    isFullscreen: false,
    toggleFullscreen: () => {},
  }),
}));

vi.mock("./AdvancedControlsDock.jsx", () => ({
  default: () => null,
}));

vi.mock("./hooks/useBrowserSupportState.js", () => ({
  useBrowserSupportState: () => ({
    supportProbe: null,
    unsupportedReason: null,
    isUnsupported: false,
    isSupportReady: true,
    markRendererInitUnsupported: () => {},
  }),
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
import { resolvePresetCameraPose } from "./cameraPosePresets.js";
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
  it("stays on authoritative metrics when output-authoritative mode is active without the preview", () => {
    expect(
      shouldUseAuthoritativePerformanceHud({
        previewState: {
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

describe("camera reset control", () => {
  /** @type {HTMLDivElement | null} */
  let container = null;
  /** @type {import('react-dom/client').Root | null} */
  let root = null;

  beforeEach(() => {
    baryonSceneSpy.mockClear();
    dispatchCameraControlCommandSpy.mockClear();
    audioSceneState.liveInputUiState = "active";
    audioState.selectedSource = "file";
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

  it("reapplies the active preset when the reset button is pressed", async () => {
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
      [{ cameraPose: resolvePresetCameraPose("side") }],
    ]);
    expect(sideButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps live input preview camera top-down when the frame falls back to idle", async () => {
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
    expect(topButton.getAttribute("aria-pressed")).toBe("true");
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
            debugOverlayExtraItems: [{ label: "A", value: 1 }],
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
            debugOverlayExtraItems: [{ label: "A", value: 2 }],
          }),
        ),
      );
    });

    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]?.cameraPose).toBe(initialPose);
  });
});
