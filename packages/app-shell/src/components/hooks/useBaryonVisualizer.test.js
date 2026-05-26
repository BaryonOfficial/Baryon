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

const frameState = vi.hoisted(() => ({
  callbacks: [],
}));

const renderLoopSpies = vi.hoisted(() => ({
  applyCachedControlSnapshotsSpy: vi.fn(() => ({})),
  resolveFeatureFrameSpy: vi.fn(() => ({
    featureFrame: null,
    effectiveFrame: null,
  })),
  shouldBypassTemporalHistoryForRaymarchFrameSpy: vi.fn(() => false),
  shouldRenderExternalFrameSpy: vi.fn(() => false),
}));

const runtimeStateSpies = vi.hoisted(() => {
  let diagnosticsId = 0;
  return {
    clearFrameCacheSpy: vi.fn(),
    createRuntimeDiagnosticsSpy: vi.fn(() => {
      diagnosticsId += 1;
      return { diagnosticsId };
    }),
  };
});

const visualizationLifecycleState = vi.hoisted(() => ({
  points: null,
  runtimeRef: { current: { method: "raymarch", tick: () => {} } },
  runtimeStateRef: { current: {} },
  audioFeatureRef: { current: {} },
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
  renderSurfaceSizeRef: { current: null },
  lastLiveInputRuntimeStatusRef: { current: null },
  lastAudioIssueSignatureRef: { current: null },
}));

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    invalidate: invalidateSpy,
  }),
  useFrame: (callback) => {
    frameState.callbacks.push(callback);
  },
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
  shouldSkipSpectralStaticColorInvalidation: () => false,
}));

vi.mock("./baryonVisualizerRuntimeState.js", () => ({
  clearAdaptiveRaymarchResumeState: clearAdaptiveRaymarchResumeStateSpy,
  maybePublishRuntimePerfSnapshot: () => {},
  clearFrameCache: (...args) => runtimeStateSpies.clearFrameCacheSpy(...args),
  createRuntimeDiagnostics: (...args) =>
    runtimeStateSpies.createRuntimeDiagnosticsSpy(...args),
  recordRuntimePerfSample: () => {},
  shouldRenderExternalFrame: (...args) =>
    renderLoopSpies.shouldRenderExternalFrameSpy(...args),
  updateObservationTransferRenderDiagnostics: () => {},
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
  applyCachedControlSnapshots: (...args) =>
    renderLoopSpies.applyCachedControlSnapshotsSpy(...args),
  applyReactiveBloomState: () => ({}),
  getPlaybackDiagnosticDpr: () => 1,
  getEffectiveAdaptiveRenderScale: () => 1,
  publishPerformanceHudSnapshot: () => {},
  publishDevtoolsSnapshots: () => {},
  applyLiveInputRenderIntent: (frame) => frame,
  resolveFeatureFrame: (...args) =>
    renderLoopSpies.resolveFeatureFrameSpy(...args),
  shouldBypassTemporalHistoryForRaymarchFrame: (...args) =>
    renderLoopSpies.shouldBypassTemporalHistoryForRaymarchFrameSpy(...args),
  syncLiveInputRuntimeStatus: () => {},
  updateModalEnvelopeDiagnostics: () => {},
  updateModalFreshnessDiagnostics: () => {},
  updateAdaptiveRaymarchStepBudget: () => 0,
  syncUploadedRenderQuantities: () => {},
  syncAdaptiveRenderSurfacePixelRatio: () => 1,
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

function HookHarness({
  controlsRef = { current: {} },
  renderProfile,
  ensurePipeline = () => null,
  postNodesRef = { current: null },
  externalFrameRef = null,
  cameraRenderKey = null,
  onPerformanceHudSnapshotChange,
  gl = {
    setClearColor: () => {},
    setPixelRatio: () => {},
    setRenderTarget: () => {},
    setMRT: () => {},
    render: () => {},
  },
}) {
  useBaryonVisualizer({
    baryonGeometry: null,
    camera: {},
    gl,
    scene: {},
    setIsEngineReady: () => {},
    setLiveInputRuntimeStatus: () => {},
    liveInputUiState: null,
    liveInputErrorCode: null,
    controlsRef,
    visualizationMethod: "raymarch",
    ensurePipeline,
    postNodesRef,
    externalFrameRef,
    renderProfile,
    cameraRenderKey,
    onPerformanceHudSnapshotChange,
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
    runtimeStateSpies.clearFrameCacheSpy.mockClear();
    runtimeStateSpies.createRuntimeDiagnosticsSpy.mockClear();
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockClear();
    renderLoopSpies.resolveFeatureFrameSpy.mockReset();
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: null,
      effectiveFrame: null,
    });
    renderLoopSpies.shouldBypassTemporalHistoryForRaymarchFrameSpy.mockReset();
    renderLoopSpies.shouldBypassTemporalHistoryForRaymarchFrameSpy.mockReturnValue(
      false,
    );
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReset();
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(false);
    frameState.callbacks.length = 0;
    visualizationLifecycleState.controlCacheRefs.controlVersionRef.current = 0;
    visualizationLifecycleState.controlCacheRefs.appliedControlVersionRef.current = 0;
    visualizationLifecycleState.controlCacheRefs.cachedControlSnapshotsRef.current =
      { controlsSnapshot: null };
    visualizationLifecycleState.runtimeDiagnosticsRef.current = {
      diagnosticsId: "initial",
    };
    visualizationLifecycleState.audioFeatureEngineRef.current = null;
    visualizationLifecycleState.lastAudioIssueSignatureRef.current = null;
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
    delete window.__baryonPerfMetrics;
  });

  it("resets probe performance metrics through the hook", async () => {
    const resetMetrics = vi.fn();
    const onPerformanceHudSnapshotChange = vi.fn();
    visualizationLifecycleState.audioFeatureEngineRef.current = {
      resetMetrics,
    };
    visualizationLifecycleState.lastAudioIssueSignatureRef.current =
      "audio-issue";
    window.__baryonPerfMetrics = { fps: 12 };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          onPerformanceHudSnapshotChange,
        }),
      );
    });

    const previousDiagnostics =
      visualizationLifecycleState.runtimeDiagnosticsRef.current;
    await act(async () => {
      window.dispatchEvent(new Event("__baryon-reset-perf-metrics"));
    });

    expect(visualizationLifecycleState.runtimeDiagnosticsRef.current).not.toBe(
      previousDiagnostics,
    );
    expect(
      visualizationLifecycleState.lastAudioIssueSignatureRef.current,
    ).toBeNull();
    expect(runtimeStateSpies.clearFrameCacheSpy).toHaveBeenCalledWith(
      visualizationLifecycleState.frameCacheRefs,
    );
    expect(resetMetrics).toHaveBeenCalledWith("dev-perf-probe-reset");
    expect(onPerformanceHudSnapshotChange).toHaveBeenCalledWith(null);
    expect(window.__baryonPerfMetrics).toBeUndefined();
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

  it("applies control-change commands at the render frame boundary", async () => {
    const controlsRef = {
      current: {
        backgroundColor: "#000000",
        colorMode: "spectral",
        performanceHudEnabled: false,
        spectralMix: 1,
      },
    };

    await act(async () => {
      root.render(React.createElement(HookHarness, { controlsRef }));
    });

    controlsRef.current.backgroundColor = "#112233";
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("__baryon-controls-change", {
          detail: { ...controlsRef.current },
        }),
      );
    });

    expect(
      visualizationLifecycleState.controlCacheRefs.controlVersionRef.current,
    ).toBe(0);
    expect(
      visualizationLifecycleState.controlCacheRefs.cachedControlSnapshotsRef
        .current.controlsSnapshot,
    ).toBeNull();

    const frameCallback = frameState.callbacks.at(-1);
    expect(frameCallback).toBeTypeOf("function");

    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(
      visualizationLifecycleState.controlCacheRefs.controlVersionRef.current,
    ).toBe(1);
    expect(
      visualizationLifecycleState.controlCacheRefs.cachedControlSnapshotsRef
        .current.controlsSnapshot.backgroundColor,
    ).toBe("#112233");
    expect(
      renderLoopSpies.applyCachedControlSnapshotsSpy.mock.calls.at(-1)[0]
        .controls.backgroundColor,
    ).toBe("#112233");
  });

  it("advances output temporal camera cuts after rendering", async () => {
    const renderSpy = vi.fn();
    const setRenderTargetSpy = vi.fn();
    const setMRTSpy = vi.fn();
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });
    const postNodesRef = {
      current: {
        temporalHistoryBlendUniform: { value: 0 },
        temporalHistoryCutFramesRemaining: 1,
      },
    };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef,
          gl: {
            setClearColor: () => {},
            setPixelRatio: () => {},
            setRenderTarget: setRenderTargetSpy,
            setMRT: setMRTSpy,
            render: () => {},
          },
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    expect(frameCallback).toBeTypeOf("function");

    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(setRenderTargetSpy).toHaveBeenCalledWith(null);
    expect(setMRTSpy).toHaveBeenCalledWith(null);
    expect(setRenderTargetSpy.mock.invocationCallOrder[0]).toBeLessThan(
      renderSpy.mock.invocationCallOrder[0],
    );
    expect(setMRTSpy.mock.invocationCallOrder[0]).toBeLessThan(
      renderSpy.mock.invocationCallOrder[0],
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(postNodesRef.current.temporalHistoryCutFramesRemaining).toBe(0);
    expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(1);
  });

  it("bypasses temporal history while rendering dynamic raymarch content", async () => {
    const renderSpy = vi.fn();
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    const dynamicFrame = {
      fieldState: "active",
      activeModeCount: 4,
      energySignal: 0.4,
    };
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: dynamicFrame,
      effectiveFrame: dynamicFrame,
    });
    renderLoopSpies.shouldBypassTemporalHistoryForRaymarchFrameSpy.mockReturnValue(
      true,
    );
    const postNodesRef = {
      current: {
        traaNode: {},
        temporalHistoryBlendUniform: { value: 1 },
        temporalHistoryCutFramesRemaining: 0,
      },
    };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef,
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    expect(frameCallback).toBeTypeOf("function");

    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(
      renderLoopSpies.shouldBypassTemporalHistoryForRaymarchFrameSpy,
    ).toHaveBeenCalledWith({
      runtimeMethod: "raymarch",
      featureFrame: dynamicFrame,
    });
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(0);
    expect(
      postNodesRef.current.temporalHistoryCutFramesRemaining,
    ).toBeGreaterThan(0);
  });

  it("forces an external-stage render after camera-only pose changes", async () => {
    const renderSpy = vi.fn();
    const externalFrameRef = { current: { featureFrame: {} } };
    renderLoopSpies.shouldRenderExternalFrameSpy.mockImplementation((options) =>
      Boolean(options?.forceRender),
    );
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          externalFrameRef,
          cameraRenderKey: "side",
        }),
      );
    });

    const initialFrameCallback = frameState.callbacks.at(-1);
    initialFrameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );
    renderSpy.mockClear();
    renderLoopSpies.shouldRenderExternalFrameSpy.mockClear();

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          externalFrameRef,
          cameraRenderKey: "top-down",
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    expect(frameCallback).toBeTypeOf("function");

    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(
      renderLoopSpies.shouldRenderExternalFrameSpy,
    ).toHaveBeenLastCalledWith(expect.objectContaining({ forceRender: true }));
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
