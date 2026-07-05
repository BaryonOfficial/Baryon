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
  consumeRenderFramePacerSlotSpy: vi.fn(() => true),
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
    lastLiveFrameRef: { current: null },
    pausedFileFrameRef: { current: null },
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

vi.mock("@baryon/engine/controls/runtime", () => ({
  applyAudioControls: () => Promise.resolve(),
  applySceneControls: () => ({}),
}));

vi.mock("@baryon/engine/visualization/types", () => ({
  DEFAULT_VISUALIZATION_METHOD: "raymarch",
}));

vi.mock("@baryon/engine/audio", () => ({
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

vi.mock("./baryonEngineRuntimeState.js", () => ({
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

vi.mock("@baryon/engine/render/outputPipeline", async () => {
  const actual = await vi.importActual("@baryon/engine/render/outputPipeline");
  return {
    ...actual,
    createCaptureOutputSession: () => ({
      dispose: () => {},
    }),
  };
});

vi.mock("./baryonEngineRenderLoop.js", () => ({
  applyCachedControlSnapshots: (...args) =>
    renderLoopSpies.applyCachedControlSnapshotsSpy(...args),
  applyReactiveBloomState: () => ({}),
  consumeRenderFramePacerSlot: (...args) =>
    renderLoopSpies.consumeRenderFramePacerSlotSpy(...args),
  createAuditSnapshotNotifier: (onAuditSnapshotChange) =>
    onAuditSnapshotChange ?? null,
  createRenderFramePacerState: () => ({
    nextRenderDueAtMs: Number.NEGATIVE_INFINITY,
  }),
  getDevicePixelRatio: () => 1,
  publishPerformanceHudSnapshot: () => {},
  publishDevtoolsSnapshots: () => {},
  applyLiveInputRenderIntent: (frame) => frame,
  finalizeTerminalVisualIdleState: () => ({
    terminalVisualIdle: false,
    resumedFromVisualIdle: false,
  }),
  resolveFeatureFrame: (...args) =>
    renderLoopSpies.resolveFeatureFrameSpy(...args),
  shouldBypassTemporalHistoryForRaymarchFrame: (...args) =>
    renderLoopSpies.shouldBypassTemporalHistoryForRaymarchFrameSpy(...args),
  syncLiveInputRuntimeStatus: () => {},
  updateModalEnvelopeDiagnostics: () => {},
  updateModalFreshnessDiagnostics: () => {},
  updateAdaptiveRaymarchStepBudget: () => 0,
  syncUploadedRenderQuantities: () => {},
  syncRenderSurfacePixelRatio: () => 1,
  updateRendererDiagnostics: () => ({
    lowLoadPlaybackDiagnosticsActive: false,
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

import { useBaryonEngine } from "./useBaryonEngine.js";

function HookHarness({
  controlsRef = { current: {} },
  liveControlSignalRef = null,
  localCameraRenderSignalRef = null,
  renderProfile,
  ensurePipeline = () => null,
  postNodesRef = { current: null },
  externalFrameRef = null,
  cameraRenderKey = null,
  framePacingFps = null,
  onPerformanceHudSnapshotChange,
  gl = {
    setClearColor: () => {},
    setPixelRatio: () => {},
    setRenderTarget: () => {},
    setMRT: () => {},
    render: () => {},
  },
}) {
  useBaryonEngine({
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
    liveControlSignalRef,
    localCameraRenderSignalRef,
    renderProfile,
    cameraRenderKey,
    framePacingFps,
    onPerformanceHudSnapshotChange,
  });
  return null;
}

describe("useBaryonEngine", () => {
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
    renderLoopSpies.consumeRenderFramePacerSlotSpy.mockReset();
    renderLoopSpies.consumeRenderFramePacerSlotSpy.mockReturnValue(true);
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
    visualizationLifecycleState.frameCacheRefs.lastActiveFrameRef.current =
      null;
    visualizationLifecycleState.frameCacheRefs.lastIdleFrameRef.current = null;
    visualizationLifecycleState.frameCacheRefs.lastLiveFrameRef.current = null;
    visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current =
      null;
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
            targetFps: 48,
            renderContext: "external-output",
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
            targetFps: 48,
            renderContext: "external-output",
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
            qualityPreset: "custom",
            targetFps: 120,
            renderContext: "external-output",
            traaEnabled: true,
            bloomAllowed: true,
          },
        }),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(clearAdaptiveRaymarchResumeStateSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          renderProfile: {
            qualityPreset: "max-quality",
            targetFps: 60,
            renderContext: "external-output",
            traaEnabled: true,
            bloomAllowed: true,
          },
        }),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(clearAdaptiveRaymarchResumeStateSpy).toHaveBeenCalledTimes(2);
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

    visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current = {
      playbackSessionId: "song-1",
      frame: { fieldState: "active" },
    };
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
    expect(
      visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current,
    ).toBeNull();
    expect(runtimeStateSpies.clearFrameCacheSpy).not.toHaveBeenCalled();
  });

  it("refreshes active render controls when the output stage receives live controls", async () => {
    const controlsRef = {
      current: {
        backgroundColor: "#000000",
        colorMode: "spectral",
        performanceHudEnabled: false,
        spectralMix: 1,
      },
    };
    const liveControlSignalRef = { current: { version: 0 } };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          controlsRef,
          liveControlSignalRef,
        }),
      );
    });

    controlsRef.current.backgroundColor = "#334455";
    controlsRef.current.auditEnabled = true;
    liveControlSignalRef.current = { version: 1 };

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
      visualizationLifecycleState.controlCacheRefs.cachedControlSnapshotsRef
        .current.controlsSnapshot.backgroundColor,
    ).toBe("#334455");
    expect(
      renderLoopSpies.applyCachedControlSnapshotsSpy.mock.calls.at(-1)[0]
        .controls.backgroundColor,
    ).toBe("#334455");
    expect(
      visualizationLifecycleState.runtimeStateRef.current.renderProbeEnabled,
    ).toBe(true);
  });

  it("renders opaque output frames even when no audio feature frame is available", async () => {
    const renderSpy = vi.fn();
    const setRenderTargetSpy = vi.fn();
    const setMRTSpy = vi.fn();
    const postNodesRef = {
      current: {
        composeOutputNode: vi.fn(() => "opaque-output"),
      },
    };
    const pipeline = {
      outputNode: null,
      needsUpdate: false,
      render: renderSpy,
    };
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: true,
        outputMode: "opaque",
        outputBackgroundColor: "#123456",
        smaaEnabled: true,
      },
      controlsChanged: true,
    });
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: null,
      effectiveFrame: null,
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          controlsRef: {
            current: {
              outputMode: "opaque",
              outputBackgroundColor: "#123456",
            },
          },
          ensurePipeline: () => pipeline,
          postNodesRef,
          gl: {
            setClearColor: () => {},
            setPixelRatio: () => {},
            setRenderTarget: setRenderTargetSpy,
            setMRT: setMRTSpy,
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

    expect(postNodesRef.current.composeOutputNode).toHaveBeenCalledWith(
      expect.objectContaining({
        outputMode: "opaque",
        temporalHistoryEnabled: false,
      }),
    );
    expect(setRenderTargetSpy).toHaveBeenCalledWith(null);
    expect(setMRTSpy).toHaveBeenCalledWith(null);
    expect(renderSpy).toHaveBeenCalledTimes(1);
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

  it("enables internal render probe snapshots while tail diagnostics are active", async () => {
    const runtimeState = {};
    visualizationLifecycleState.runtimeStateRef.current = runtimeState;
    const controlsRef = {
      current: {
        auditEnabled: false,
      },
    };

    await act(async () => {
      root.render(React.createElement(HookHarness, { controlsRef }));
    });

    window.__baryonTailDiagnostics.start();
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

    expect(runtimeState.renderProbeEnabled).toBe(true);

    window.__baryonTailDiagnostics.stop();
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(runtimeState.renderProbeEnabled).toBe(false);
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
    runtimeStateSpies.clearFrameCacheSpy.mockClear();
    clearAdaptiveRaymarchResumeStateSpy.mockClear();

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
      sceneSnapshot: {},
    });
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(0);
    expect(
      postNodesRef.current.temporalHistoryCutFramesRemaining,
    ).toBeGreaterThan(0);
    expect(runtimeStateSpies.clearFrameCacheSpy).not.toHaveBeenCalled();
    expect(clearAdaptiveRaymarchResumeStateSpy).not.toHaveBeenCalled();
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

  it("coalesces external-frame preview renders during local orbit camera motion", async () => {
    const renderSpy = vi.fn();
    const externalFrameRef = { current: { featureFrame: {} } };
    const localCameraRenderSignalRef = {
      current: { version: 0, phase: null },
    };
    const nowSpy = vi.spyOn(globalThis.performance, "now");
    renderLoopSpies.shouldRenderExternalFrameSpy.mockImplementation((options) =>
      Boolean(options?.forceRender),
    );
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });

    try {
      nowSpy.mockReturnValue(0);
      await act(async () => {
        root.render(
          React.createElement(HookHarness, {
            ensurePipeline: () => ({ render: renderSpy }),
            externalFrameRef,
            localCameraRenderSignalRef,
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

      localCameraRenderSignalRef.current.version += 1;
      localCameraRenderSignalRef.current.phase = "change";
      const frameCallback = frameState.callbacks.at(-1);
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
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ forceRender: true }),
      );
      expect(renderSpy).toHaveBeenCalledTimes(1);

      renderSpy.mockClear();
      renderLoopSpies.shouldRenderExternalFrameSpy.mockClear();
      nowSpy.mockReturnValue(10);
      localCameraRenderSignalRef.current.version += 1;
      localCameraRenderSignalRef.current.phase = "change";
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
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ forceRender: false }),
      );
      expect(renderSpy).not.toHaveBeenCalled();

      nowSpy.mockReturnValue(40);
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
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ forceRender: true }),
      );
      expect(renderSpy).toHaveBeenCalledTimes(1);

      renderSpy.mockClear();
      renderLoopSpies.shouldRenderExternalFrameSpy.mockClear();
      nowSpy.mockReturnValue(41);
      localCameraRenderSignalRef.current.version += 1;
      localCameraRenderSignalRef.current.phase = "end";
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
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ forceRender: true }),
      );
      expect(renderSpy).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("skips paced local frames when the frame pacer declines the tick", async () => {
    const renderSpy = vi.fn();
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          framePacingFps: 60,
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    expect(frameCallback).toBeTypeOf("function");

    renderLoopSpies.consumeRenderFramePacerSlotSpy.mockReturnValue(false);
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 120,
    );

    expect(renderLoopSpies.consumeRenderFramePacerSlotSpy).toHaveBeenCalledWith(
      expect.anything(),
      60,
      expect.any(Number),
    );
    expect(renderSpy).not.toHaveBeenCalled();

    renderLoopSpies.consumeRenderFramePacerSlotSpy.mockReturnValue(true);
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 120,
    );

    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("renders immediately for control changes even when the frame pacer declines", async () => {
    const renderSpy = vi.fn();
    const controlsRef = {
      current: {
        backgroundColor: "#000000",
        fieldExtent: "unbounded",
        boundaryMode: "dirichlet",
        zeroPointPrecision: 0.12,
      },
    };
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });
    renderLoopSpies.consumeRenderFramePacerSlotSpy.mockReturnValue(false);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          controlsRef,
          ensurePipeline: () => ({ render: renderSpy }),
          framePacingFps: 60,
        }),
      );
    });

    controlsRef.current.fieldExtent = "sphere";
    controlsRef.current.boundaryMode = "neumann";
    controlsRef.current.zeroPointPrecision = 0.072;
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("__baryon-controls-change", {
          detail: { ...controlsRef.current },
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
      1 / 120,
    );

    expect(
      renderLoopSpies.consumeRenderFramePacerSlotSpy,
    ).not.toHaveBeenCalled();
    expect(
      renderLoopSpies.shouldRenderExternalFrameSpy,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ controlsChanged: true }),
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(
      renderLoopSpies.applyCachedControlSnapshotsSpy.mock.calls.at(-1)[0]
        .controls,
    ).toMatchObject({
      fieldExtent: "sphere",
      boundaryMode: "neumann",
      zeroPointPrecision: 0.072,
    });
  });

  it("bypasses the frame pacer while external frames drive the cadence", async () => {
    const renderSpy = vi.fn();
    const externalFrameRef = { current: { featureFrame: {} } };
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });
    renderLoopSpies.consumeRenderFramePacerSlotSpy.mockReturnValue(false);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          externalFrameRef,
          framePacingFps: 60,
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 120,
    );

    expect(
      renderLoopSpies.consumeRenderFramePacerSlotSpy,
    ).not.toHaveBeenCalled();
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
