// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invalidateSpy, clearAdaptiveRaymarchResumeStateSpy } = vi.hoisted(
  () => ({
    invalidateSpy: vi.fn(),
    clearAdaptiveRaymarchResumeStateSpy: vi.fn(),
  }),
);

const visualizationLifecycleState = vi.hoisted(() => ({
  points: null,
  runtimeRef: { current: { method: "raymarch", tick: () => {} } },
  runtimeStateRef: { current: {} },
  audioFeatureRef: { current: null },
  audioFeatureAnalyzerRef: { current: null },
  audioFeatureEngineRef: { current: null },
  runtimeDiagnosticsRef: { current: {} },
  frameCacheRefs: {
    lastActiveFrameRef: { current: null },
    lastIdleFrameRef: { current: null },
  },
  controlCacheRefs: {
    controlVersionRef: { current: 0 },
    appliedControlVersionRef: { current: 0 },
    cachedControlSnapshotsRef: { current: { controlsSnapshot: null } },
  },
  pixelRatioRef: { current: 1 },
  lastLiveInputRuntimeStatusRef: { current: null },
  lastAudioIssueSignatureRef: { current: null },
}));

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    invalidate: invalidateSpy,
  }),
  useFrame: () => {},
}));

vi.mock("@baryon/visualizer", () => ({
  resolveRaymarchFieldCacheOverride: () => null,
}));

vi.mock("@baryon/visualizer/controls/runtime", () => ({
  applyAudioControls: () => Promise.resolve(),
  applySceneControls: () => ({}),
}));

vi.mock("@baryon/visualizer/visualization/types", () => ({
  DEFAULT_VISUALIZATION_METHOD: "raymarch",
}));

vi.mock("@baryon/visualizer/audio", () => ({
  getDefaultAudioSession: () => ({
    attach: () => {},
    getStatus: () => ({}),
    readClockSnapshot: () => ({}),
  }),
}));

vi.mock("../../devtools/config.js", () => ({
  DEVTOOLS_ENABLED: false,
}));

vi.mock("../../devtools/testReady.js", () => ({
  markBaryonTestRuntimeReady: () => {},
  resetBaryonTestReady: () => {},
}));

vi.mock("./controlInvalidation.js", () => ({
  shouldSkipChromesthesiaStaticColorInvalidation: () => false,
}));

vi.mock("./baryonVisualizerRuntimeState.js", () => ({
  clearAdaptiveRaymarchResumeState: clearAdaptiveRaymarchResumeStateSpy,
  maybePublishRuntimePerfSnapshot: () => {},
  clearFrameCache: () => {},
  createRuntimeDiagnostics: () => ({}),
  recordRuntimePerfSample: () => {},
  shouldRenderExternalFrame: () => false,
  shouldPreservePausedFrameOnControlsChange: () => false,
}));

vi.mock("../../context/liveInputRuntimeStatus.js", () => ({
  createLiveInputRuntimeStatus: () => ({}),
}));

vi.mock("@baryon/visualizer/render/outputPipeline", async () => {
  const actual = await vi.importActual(
    "@baryon/visualizer/render/outputPipeline",
  );
  return {
    ...actual,
    createCaptureOutputSession: () => ({
      dispose: () => {},
    }),
  };
});

vi.mock("./baryonVisualizerRenderLoop.js", () => ({
  applyCachedControlSnapshots: () => ({}),
  applyReactiveBloomState: () => ({}),
  getPlaybackDiagnosticDpr: () => 1,
  getEffectiveAdaptiveRenderScale: () => 1,
  publishPerformanceHudSnapshot: () => {},
  publishDevtoolsSnapshots: () => {},
  resolveFeatureFrame: () => ({ featureFrame: null, effectiveFrame: null }),
  syncLiveInputRuntimeStatus: () => {},
  updateAdaptiveRaymarchStepBudget: () => 0,
  updateRendererDiagnostics: () => ({
    lowLoadActive: false,
    runtimeDiagnostics: {},
  }),
}));

vi.mock("./useVisualizationRuntimeLifecycle.js", () => ({
  useVisualizationRuntimeLifecycle: () => visualizationLifecycleState,
}));

vi.mock("./externalFrameClock.js", () => ({
  getSourceAuthoritativeClock: () => ({
    status: {},
    clockMode: "playback",
    time: 0,
    deltaTime: 0,
    frameSequence: 0,
    shouldAdvance: false,
  }),
}));

import { useBaryonVisualizer } from "./useBaryonVisualizer.js";

function HookHarness({ renderProfile }) {
  useBaryonVisualizer({
    baryonGeometry: null,
    camera: {},
    gl: { setClearColor: () => {}, setPixelRatio: () => {} },
    scene: {},
    setIsEngineReady: () => {},
    setLiveInputRuntimeStatus: () => {},
    liveInputUiState: null,
    liveInputErrorCode: null,
    controlsRef: { current: {} },
    visualizationMethod: "raymarch",
    ensurePipeline: () => null,
    postNodesRef: { current: null },
    renderProfile,
  });
  return null;
}

describe("useBaryonVisualizer", () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    invalidateSpy.mockClear();
    clearAdaptiveRaymarchResumeStateSpy.mockClear();
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
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it("forces a redraw when the render profile key changes", async () => {
    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          renderProfile: {
            qualityPreset: "custom",
            renderScale: 1,
            traaEnabled: true,
            bloomAllowed: true,
          },
        }),
      );
    });

    invalidateSpy.mockClear();
    clearAdaptiveRaymarchResumeStateSpy.mockClear();

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          renderProfile: {
            qualityPreset: "custom",
            renderScale: 1,
            traaEnabled: true,
            bloomAllowed: true,
          },
        }),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(0);
    expect(clearAdaptiveRaymarchResumeStateSpy).toHaveBeenCalledTimes(0);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          renderProfile: {
            qualityPreset: "max-quality",
            renderScale: 1,
            traaEnabled: true,
            bloomAllowed: true,
          },
        }),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(clearAdaptiveRaymarchResumeStateSpy).toHaveBeenCalledTimes(1);
  });
});
