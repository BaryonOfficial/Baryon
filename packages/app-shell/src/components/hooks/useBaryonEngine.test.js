// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invalidateSpy, resetAdaptiveRaymarchControllerStateSpy } = vi.hoisted(
  () => ({
    invalidateSpy: vi.fn(),
    resetAdaptiveRaymarchControllerStateSpy: vi.fn(),
  }),
);

const frameState = vi.hoisted(() => ({
  callbacks: [],
}));

const visualizationLifecycleCalls = vi.hoisted(() => ({ args: [] }));

const renderLoopSpies = vi.hoisted(() => ({
  applyCachedControlSnapshotsSpy: vi.fn(() => ({})),
  applySceneControlsSpy: vi.fn(() => ({})),
  consumeRenderFramePacerSlotSpy: vi.fn(() => true),
  getSourceAuthoritativeClockSpy: vi.fn(() => ({
    status: {},
    clockMode: "playback",
    time: 0,
    deltaTime: 0,
    frameSequence: 0,
    shouldAdvance: false,
  })),
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
  runtimeRef: {
    current: {
      method: "raymarch",
      tick: vi.fn(),
      prepare: vi.fn(),
      failClosed: vi.fn(),
    },
  },
  runtimeStateRef: { current: {} },
  audioFeatureRuntimeRef: { current: null },
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
  applySceneControls: (...args) =>
    renderLoopSpies.applySceneControlsSpy(...args),
}));

vi.mock("@baryon/engine/visualization/types", () => ({
  DEFAULT_VISUALIZATION_METHOD: "raymarch",
}));

vi.mock("@baryon/engine/audio", () => ({
  getDefaultAudioSession: () => ({
    getStatus: () => ({}),
    readClockSnapshot: () => ({}),
  }),
}));

vi.mock("../../devtools/config.js", () => ({
  DEVTOOLS_ENABLED: false,
  RAYMARCH_AUDIT_FIXTURE_ENABLED: false,
}));

vi.mock("../../devtools/testReady.js", () => ({
  markBaryonTestRuntimeReady: () => {},
  resetBaryonTestReady: () => {},
}));

vi.mock("./baryonEngineRuntimeState.js", () => ({
  resetAdaptiveRaymarchControllerState:
    resetAdaptiveRaymarchControllerStateSpy,
  maybePublishRuntimePerfSnapshot: () => {},
  clearFrameCache: (...args) => runtimeStateSpies.clearFrameCacheSpy(...args),
  createRuntimeDiagnostics: (...args) =>
    runtimeStateSpies.createRuntimeDiagnosticsSpy(...args),
  recordRuntimePerfSample: () => {},
  shouldRenderExternalFrame: (...args) =>
    renderLoopSpies.shouldRenderExternalFrameSpy(...args),
  updateCymaticObserverRenderDiagnostics: () => {},
}));

vi.mock("../../context/liveInputRuntimeStatus.js", () => ({
  createLiveInputRuntimeStatus: () => ({}),
}));

vi.mock("./baryonEngineRenderLoop.js", () => ({
  applyCachedControlSnapshots: (...args) =>
    renderLoopSpies.applyCachedControlSnapshotsSpy(...args),
  consumeRenderFramePacerSlot: (...args) =>
    renderLoopSpies.consumeRenderFramePacerSlotSpy(...args),
  createAuditSnapshotNotifier: (onAuditSnapshotChange) =>
    onAuditSnapshotChange ?? null,
  createRenderFramePacerState: () => ({
    nextRenderDueAtMs: Number.NEGATIVE_INFINITY,
  }),
  createFeatureFrameResolver: () => ({
    resolve: (...args) => ({
      ...renderLoopSpies.resolveFeatureFrameSpy(...args),
      resolvedSemanticRevision: 1,
    }),
  }),
  getDevicePixelRatio: () => 1,
  publishPerformanceHudSnapshot: () => {},
  publishDevtoolsSnapshots: () => {},
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
    suppressPlaybackTelemetryActive: false,
    runtimeDiagnostics: {},
  }),
}));

vi.mock("./useVisualizationRuntimeLifecycle.js", () => ({
  useVisualizationRuntimeLifecycle: (args) => {
    visualizationLifecycleCalls.args.push(args);
    return visualizationLifecycleState;
  },
}));

vi.mock("./externalFrameClock.js", () => ({
  getSourceAuthoritativeClock: (...args) =>
    renderLoopSpies.getSourceAuthoritativeClockSpy(...args),
}));

import { useBaryonEngine } from "./useBaryonEngine.js";
import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";

const originalCreateImageBitmapDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "createImageBitmap",
);

function restoreCreateImageBitmap() {
  if (originalCreateImageBitmapDescriptor) {
    Object.defineProperty(
      globalThis,
      "createImageBitmap",
      originalCreateImageBitmapDescriptor,
    );
  } else {
    delete globalThis.createImageBitmap;
  }
}

function HookHarness({
  controlsRef = { current: {} },
  liveControlSignalRef = null,
  localCameraRenderSignalRef = null,
  renderProfile,
  structuralControlVersion = 0,
  ensurePipeline = () => null,
  postNodesRef = { current: null },
  audioFeatureAuthorityRole = AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
  externalFrameRef = null,
  cameraRenderKey = null,
  framePacingFps = null,
  onPerformanceHudSnapshotChange,
  onStageRender,
  outputCompositorFrameTransfer = false,
  onOutputCompositorFrame,
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
    ensurePipeline,
    postNodesRef,
    audioFeatureAuthorityRole,
    externalFrameRef,
    liveControlSignalRef,
    structuralControlVersion,
    localCameraRenderSignalRef,
    renderProfile,
    cameraRenderKey,
    framePacingFps,
    onPerformanceHudSnapshotChange,
    onStageRender,
    outputCompositorFrameTransfer,
    onOutputCompositorFrame,
  });
  return null;
}

describe("useBaryonEngine", () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    invalidateSpy.mockClear();
    resetAdaptiveRaymarchControllerStateSpy.mockClear();
    runtimeStateSpies.clearFrameCacheSpy.mockClear();
    runtimeStateSpies.createRuntimeDiagnosticsSpy.mockClear();
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockClear();
    renderLoopSpies.applySceneControlsSpy.mockClear();
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
    renderLoopSpies.getSourceAuthoritativeClockSpy.mockReset();
    renderLoopSpies.getSourceAuthoritativeClockSpy.mockReturnValue({
      status: {},
      clockMode: "playback",
      time: 0,
      deltaTime: 0,
      frameSequence: 0,
      shouldAdvance: false,
    });
    frameState.callbacks.length = 0;
    visualizationLifecycleCalls.args.length = 0;
    visualizationLifecycleState.runtimeRef.current.tick.mockClear();
    visualizationLifecycleState.runtimeRef.current.prepare.mockReset();
    visualizationLifecycleState.runtimeRef.current.failClosed.mockClear();
    visualizationLifecycleState.runtimeStateRef.current = {};
    visualizationLifecycleState.controlCacheRefs.controlVersionRef.current = 0;
    visualizationLifecycleState.controlCacheRefs.appliedControlVersionRef.current = 0;
    visualizationLifecycleState.controlCacheRefs.cachedControlSnapshotsRef.current =
      { controlsSnapshot: null };
    visualizationLifecycleState.runtimeDiagnosticsRef.current = {
      diagnosticsId: "initial",
    };
    visualizationLifecycleState.audioFeatureRuntimeRef.current = null;
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
    restoreCreateImageBitmap();
  });

  it("preserves renderer-owned canvas clear state", async () => {
    const setClearColor = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          gl: {
            setClearColor,
            setPixelRatio: vi.fn(),
            setRenderTarget: vi.fn(),
            setMRT: vi.fn(),
            render: vi.fn(),
          },
        }),
      );
    });

    expect(setClearColor).not.toHaveBeenCalled();
  });

  it("waits to create the output pipeline until the engine-owned program root is attached", async () => {
    const ensurePipeline = vi.fn(() => null);
    const scene = {};
    const visualizationRoot = { parent: null };
    visualizationLifecycleState.runtimeStateRef.current = {
      points: visualizationRoot,
    };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline,
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene,
      },
      1 / 60,
    );

    expect(ensurePipeline).not.toHaveBeenCalled();

    visualizationRoot.parent = scene;
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene,
      },
      1 / 60,
    );

    expect(ensurePipeline).toHaveBeenCalledOnce();
  });

  it("resets probe performance metrics through the hook", async () => {
    const onPerformanceHudSnapshotChange = vi.fn();
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
    resetAdaptiveRaymarchControllerStateSpy.mockClear();
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
    expect(resetAdaptiveRaymarchControllerStateSpy).not.toHaveBeenCalled();
    expect(onPerformanceHudSnapshotChange).toHaveBeenCalledWith(null);
    expect(window.__baryonPerfMetrics).toBeUndefined();
  });

  it("commands feature authority only from explicit role transitions", async () => {
    const externalFrameRef = { current: null };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
          externalFrameRef,
        }),
      );
    });
    expect(
      visualizationLifecycleCalls.args.at(-1).audioFeatureAuthorityRole,
    ).toBe(AUDIO_FEATURE_AUTHORITY_ROLES.localProducer);

    externalFrameRef.current = { featureFrame: { fieldState: "active" } };
    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
          externalFrameRef,
        }),
      );
    });
    expect(
      visualizationLifecycleCalls.args.at(-1).audioFeatureAuthorityRole,
    ).toBe(AUDIO_FEATURE_AUTHORITY_ROLES.localProducer);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
          externalFrameRef,
        }),
      );
    });
    expect(
      visualizationLifecycleCalls.args.at(-1).audioFeatureAuthorityRole,
    ).toBe(AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer);
  });

  it("forces a redraw without letting profile effects reset adaptive control", async () => {
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
    resetAdaptiveRaymarchControllerStateSpy.mockClear();

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
    expect(resetAdaptiveRaymarchControllerStateSpy).toHaveBeenCalledTimes(0);

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
    expect(resetAdaptiveRaymarchControllerStateSpy).toHaveBeenCalledTimes(0);

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
    expect(resetAdaptiveRaymarchControllerStateSpy).toHaveBeenCalledTimes(0);
  });

  it("applies presentation controls without replacing the paused observation", async () => {
    const controlsRef = {
      current: {
        backgroundColor: "#000000",
        bloomEnabled: false,
        colorMode: "spectral",
        performanceHudEnabled: false,
      },
    };

    await act(async () => {
      root.render(React.createElement(HookHarness, { controlsRef }));
    });

    const pausedObservation = {
      playbackSessionId: "song-1",
      frame: { fieldState: "active" },
    };
    visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current =
      pausedObservation;
    controlsRef.current.bloomEnabled = true;
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
        .current.controlsSnapshot.bloomEnabled,
    ).toBe(true);
    expect(
      renderLoopSpies.applyCachedControlSnapshotsSpy.mock.calls.at(-1)[0]
        .controls.bloomEnabled,
    ).toBe(true);
    expect(
      visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current,
    ).toBe(pausedObservation);
    expect(runtimeStateSpies.clearFrameCacheSpy).not.toHaveBeenCalled();
  });

  it("replaces the paused observation only for an explicit structural invalidation", async () => {
    const controlsRef = { current: { bloomEnabled: false } };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          controlsRef,
          structuralControlVersion: 0,
        }),
      );
    });

    visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current = {
      playbackSessionId: "song-1",
      frame: { fieldState: "active" },
    };

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          controlsRef,
          structuralControlVersion: 1,
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
      1 / 60,
    );

    expect(
      visualizationLifecycleState.frameCacheRefs.pausedFileFrameRef.current,
    ).toBeNull();
  });

  it("refreshes active render controls when the output stage receives live controls", async () => {
    const controlsRef = {
      current: {
        backgroundColor: "#000000",
        colorMode: "spectral",
        performanceHudEnabled: false,
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

  it("transfers one compositor bitmap after one render without requesting another frame", async () => {
    const renderSpy = vi.fn();
    const createImageBitmap = vi.fn();
    const onOutputCompositorFrame = vi.fn();
    const onStageRender = vi.fn();
    const renderCanvas = { width: 1920, height: 1080 };
    const bitmap = {
      width: 1920,
      height: 1080,
      close: vi.fn(),
    };
    createImageBitmap.mockResolvedValue(bitmap);
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: createImageBitmap,
    });
    const postNodesRef = {
      current: {
        composeOutputNode: vi.fn(() => "opaque-output"),
      },
    };
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: true,
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
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
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef,
          outputCompositorFrameTransfer: true,
          onOutputCompositorFrame,
          onStageRender,
          gl: {
            domElement: renderCanvas,
            setClearColor: () => {},
            setPixelRatio: () => {},
            setRenderTarget: () => {},
            setMRT: () => {},
          },
        }),
      );
    });

    invalidateSpy.mockClear();
    await act(async () => {
      frameState.callbacks.at(-1)(
        {
          clock: { getElapsedTime: () => 0 },
          camera: {},
          scene: {},
        },
        1 / 60,
      );
      await Promise.resolve();
    });

    expect(renderSpy).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(renderCanvas, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "premultiply",
    });
    expect(onOutputCompositorFrame).toHaveBeenCalledWith({
      bitmap,
      width: 1920,
      height: 1080,
    });
    expect(bitmap.close).not.toHaveBeenCalled();
    expect(onStageRender).toHaveBeenCalledOnce();
    expect(renderSpy.mock.invocationCallOrder[0]).toBeLessThan(
      createImageBitmap.mock.invocationCallOrder[0],
    );
    expect(createImageBitmap.mock.invocationCallOrder[0]).toBeLessThan(
      onStageRender.mock.invocationCallOrder[0],
    );
    expect(onOutputCompositorFrame.mock.invocationCallOrder[0]).toBeLessThan(
      onStageRender.mock.invocationCallOrder[0],
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("does not acknowledge a native stage frame when its bitmap transfer fails", async () => {
    const renderSpy = vi.fn();
    const onStageRender = vi.fn();
    const transferError = new Error("bitmap snapshot failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => {
        throw transferError;
      }),
    });
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: true,
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
        smaaEnabled: true,
      },
      controlsChanged: true,
    });
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef: {
            current: {
              composeOutputNode: vi.fn(() => "opaque-output"),
            },
          },
          outputCompositorFrameTransfer: true,
          onOutputCompositorFrame: vi.fn(),
          onStageRender,
          gl: {
            domElement: { width: 1920, height: 1080 },
            setClearColor: () => {},
            setPixelRatio: () => {},
            setRenderTarget: () => {},
            setMRT: () => {},
          },
        }),
      );
    });

    await act(async () => {
      frameState.callbacks.at(-1)(
        {
          clock: { getElapsedTime: () => 0 },
          camera: {},
          scene: {},
        },
        1 / 60,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderSpy).toHaveBeenCalledOnce();
    expect(onStageRender).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[Baryon output] GPU compositor frame transfer failed:",
      expect.objectContaining({
        name: "OutputCompositorFrameError",
      }),
    );
    consoleError.mockRestore();
  });

  it("completes a transparent local stage render while its first feature model is pending", async () => {
    const renderSpy = vi.fn();
    const onStageRender = vi.fn();
    const postNodesRef = {
      current: {
        composeOutputNode: vi.fn(() => "transparent-output"),
      },
    };
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: true,
        outputMode: "transparent",
        outputBackgroundColor: "#000000",
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
          controlsRef: { current: { outputMode: "transparent" } },
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef,
          onStageRender,
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
      1 / 60,
    );

    expect(
      visualizationLifecycleState.runtimeRef.current.failClosed,
    ).toHaveBeenCalledTimes(1);
    expect(postNodesRef.current.composeOutputNode).toHaveBeenCalledWith(
      expect.objectContaining({
        outputMode: "transparent",
        temporalHistoryEnabled: false,
      }),
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(onStageRender).toHaveBeenCalledTimes(1);
  });

  it("prepares a loaded file without granting visible render authority", async () => {
    const renderSpy = vi.fn();
    const preparationFrame = {
      fieldState: "active",
      renderAuthority: true,
      observationTimeSeconds: 0,
    };
    const runtime = visualizationLifecycleState.runtimeRef.current;
    runtime.prepare.mockReturnValue({
      prepared: true,
      seeded: true,
    });
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: false,
        outputMode: "opaque",
        smaaEnabled: true,
      },
      controlsChanged: true,
    });
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: null,
      effectiveFrame: null,
      preparationFrame,
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          ensurePipeline: () => ({ render: renderSpy }),
        }),
      );
    });

    frameState.callbacks.at(-1)(
      {
        clock: { getElapsedTime: () => 0 },
        camera: { kind: "prepared-camera" },
        scene: { kind: "prepared-scene" },
      },
      1 / 60,
    );

    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    expect(runtime.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeState: visualizationLifecycleState.runtimeStateRef.current,
        featureFrame: preparationFrame,
      }),
    );
    expect(runtime.failClosed).not.toHaveBeenCalled();
    expect(runtime.tick).not.toHaveBeenCalled();
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("completes a transparent external stage render before its first authoritative feature frame", async () => {
    const renderSpy = vi.fn();
    const onStageRender = vi.fn();
    const postNodesRef = {
      current: {
        composeOutputNode: vi.fn(() => "transparent-output"),
      },
    };
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: true,
        outputMode: "transparent",
        outputBackgroundColor: "#000000",
        smaaEnabled: true,
      },
      controlsChanged: true,
    });
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
          controlsRef: { current: { outputMode: "transparent" } },
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef,
          onStageRender,
        }),
      );
    });

    frameState.callbacks.at(-1)(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(renderSpy).toHaveBeenCalledOnce();
    expect(onStageRender).toHaveBeenCalledOnce();
  });

  it("completes a pipeline-free WebGL idle stage render before live input exists", async () => {
    const renderSpy = vi.fn();
    const setRenderTargetSpy = vi.fn();
    const setMRTSpy = vi.fn();
    const onStageRender = vi.fn();
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: false,
        outputMode: "transparent",
        outputBackgroundColor: "#000000",
        smaaEnabled: false,
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
          controlsRef: { current: { outputMode: "transparent" } },
          ensurePipeline: () => null,
          onStageRender,
          gl: {
            backend: { isWebGLBackend: true },
            setClearColor: () => {},
            setPixelRatio: () => {},
            setRenderTarget: setRenderTargetSpy,
            setMRT: setMRTSpy,
            render: renderSpy,
          },
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: { kind: "stage-camera" },
        scene: { kind: "idle-scene" },
      },
      1 / 60,
    );

    expect(
      visualizationLifecycleState.runtimeRef.current.failClosed,
    ).toHaveBeenCalledTimes(1);
    expect(setRenderTargetSpy).toHaveBeenCalledOnce();
    expect(setMRTSpy).toHaveBeenCalledOnce();
    expect(renderSpy).toHaveBeenCalledOnce();
    expect(renderSpy).toHaveBeenCalledWith(
      { kind: "idle-scene" },
      { kind: "stage-camera" },
    );
    expect(onStageRender).toHaveBeenCalledOnce();
  });

  it("renders active preview frames with the resolved opaque monitor output", async () => {
    const renderSpy = vi.fn();
    const postNodesRef = {
      current: {
        composeOutputNode: vi.fn(() => "opaque-preview-output"),
      },
    };
    const activeFrame = {
      fieldState: "active",
      activeModeCount: 4,
      energySignal: 0.4,
    };
    renderLoopSpies.applyCachedControlSnapshotsSpy.mockReturnValue({
      output: {
        bloomEnabled: true,
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
        smaaEnabled: true,
      },
      controlsChanged: true,
    });
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: activeFrame,
      effectiveFrame: activeFrame,
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          controlsRef: {
            current: {
              outputMode: "transparent",
              smaaEnabled: true,
            },
          },
          ensurePipeline: () => ({ render: renderSpy }),
          postNodesRef,
        }),
      );
    });

    frameState.callbacks.at(-1)(
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
        smaaEnabled: true,
      }),
    );
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
    resetAdaptiveRaymarchControllerStateSpy.mockClear();

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
      traaRequested: false,
    });
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(postNodesRef.current.temporalHistoryBlendUniform.value).toBe(0);
    expect(
      postNodesRef.current.temporalHistoryCutFramesRemaining,
    ).toBeGreaterThan(0);
    expect(runtimeStateSpies.clearFrameCacheSpy).not.toHaveBeenCalled();
    expect(resetAdaptiveRaymarchControllerStateSpy).not.toHaveBeenCalled();
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
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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
            audioFeatureAuthorityRole:
              AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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

  it("preserves elapsed scene time across skipped paced frames", async () => {
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: {},
      effectiveFrame: {},
    });
    renderLoopSpies.getSourceAuthoritativeClockSpy.mockReturnValue({
      status: {},
      clockMode: "realtime",
      time: 0,
      deltaTime: 1 / 120,
      frameSequence: null,
      shouldAdvance: true,
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          framePacingFps: 60,
        }),
      );
    });

    const frameCallback = frameState.callbacks.at(-1);
    renderLoopSpies.consumeRenderFramePacerSlotSpy
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    frameCallback(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 120,
    );
    frameCallback(
      {
        clock: { getElapsedTime: () => 1 / 120 },
        camera: {},
        scene: {},
      },
      1 / 120,
    );

    expect(renderLoopSpies.applySceneControlsSpy).toHaveBeenCalledTimes(1);
    expect(renderLoopSpies.applySceneControlsSpy.mock.calls[0][2]).toBeCloseTo(
      1 / 60,
    );
  });

  it("renders immediately for control changes even when the frame pacer declines", async () => {
    const renderSpy = vi.fn();
    const controlsRef = {
      current: {
        backgroundColor: "#000000",
        volumeShape: "sphere",
        boundaryMode: "dirichlet",
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

    controlsRef.current.volumeShape = "cube";
    controlsRef.current.boundaryMode = "neumann";
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
      volumeShape: "cube",
      boundaryMode: "neumann",
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
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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

  it("applies independent cymatic and idle-logo rotation from an external frame", async () => {
    const runtimeState = {
      cymaticRoot: { rotation: { x: 0, y: 0, z: 0 } },
      idleOverlay: { rotation: { y: 0 } },
      sceneMotion: {},
      idleLogoMotion: {},
    };
    visualizationLifecycleState.runtimeStateRef.current = runtimeState;
    const externalFrameRef = {
      current: {
        frameSequence: 7,
        featureFrame: { fieldState: "active" },
        sceneSnapshot: {
          rotationX: 0.1,
          rotationY: 0.7,
          rotationZ: -0.05,
          angularVelocity: -0.4,
          idleLogoRotationY: -1.2,
          idleLogoAngularVelocity: -0.8,
        },
      },
    };
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
          externalFrameRef,
        }),
      );
    });

    frameState.callbacks.at(-1)(
      {
        clock: { getElapsedTime: () => 0 },
        camera: {},
        scene: {},
      },
      1 / 60,
    );

    expect(runtimeState.cymaticRoot.rotation).toEqual({
      x: 0.1,
      y: 0.7,
      z: -0.05,
    });
    expect(runtimeState.idleOverlay.rotation.y).toBe(-1.2);
    expect(runtimeState.sceneMotion.angularVelocity).toBe(-0.4);
    expect(runtimeState.idleLogoMotion).toMatchObject({
      yaw: -1.2,
      angularVelocity: -0.8,
      targetAngularVelocity: -0.8,
    });
    expect(renderLoopSpies.applySceneControlsSpy).not.toHaveBeenCalled();
  });

  it("renders the safe idle state without local analysis while external authority has no frame", async () => {
    const externalFrameRef = {
      current: {
        status: { isPlaying: true },
        frameSequence: 42,
        featureFrame: null,
      },
    };
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
          externalFrameRef,
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

    expect(renderLoopSpies.resolveFeatureFrameSpy).not.toHaveBeenCalled();
    expect(
      visualizationLifecycleState.runtimeRef.current.failClosed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeState: visualizationLifecycleState.runtimeStateRef.current,
      }),
    );
    expect(
      renderLoopSpies.shouldRenderExternalFrameSpy,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        externalFeatureAuthorityActive: true,
        externalFrameState: null,
      }),
    );
  });

  it("keeps idle scene motion running after renderer authority is revoked", async () => {
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);
    renderLoopSpies.resolveFeatureFrameSpy.mockReturnValue({
      featureFrame: null,
      effectiveFrame: null,
    });
    renderLoopSpies.getSourceAuthoritativeClockSpy.mockReturnValue({
      status: {
        isPlaying: false,
        isLiveInputActive: false,
        lastPlaybackEndReason: "stopped",
      },
      clockMode: "realtime",
      time: 1,
      deltaTime: 1 / 60,
      frameSequence: 0,
      shouldAdvance: false,
    });

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
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
      1 / 60,
    );

    expect(
      visualizationLifecycleState.runtimeRef.current.failClosed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeState: visualizationLifecycleState.runtimeStateRef.current,
      }),
    );
    expect(
      visualizationLifecycleState.runtimeRef.current.tick,
    ).not.toHaveBeenCalled();
    expect(renderLoopSpies.applySceneControlsSpy).toHaveBeenCalledWith(
      visualizationLifecycleState.runtimeStateRef.current,
      expect.anything(),
      1 / 60,
      null,
    );
  });

  it("uses local feature analysis even when a stray external frame is present", async () => {
    const externalFrameRef = {
      current: { featureFrame: { fieldState: "active" } },
    };
    renderLoopSpies.shouldRenderExternalFrameSpy.mockReturnValue(true);

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          audioFeatureAuthorityRole:
            AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
          externalFrameRef,
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
      1 / 60,
    );

    expect(renderLoopSpies.resolveFeatureFrameSpy).toHaveBeenCalledTimes(1);
    expect(
      renderLoopSpies.shouldRenderExternalFrameSpy,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        externalFeatureAuthorityActive: false,
        externalFrameState: null,
      }),
    );
  });
});
