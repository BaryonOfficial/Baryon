import { expect, test, vi } from "vitest";
import {
  clearAdaptiveRaymarchResumeState,
  createRuntimeDiagnostics,
} from "./baryonVisualizerRuntimeState.js";
import { syncLiveInputRuntimeStatus } from "./liveInputRuntimeSync.js";
import {
  applyLiveInputRenderIntent,
  buildPerformanceHudSnapshot,
  getEffectiveAdaptiveRenderScale,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  updateRendererDiagnostics,
  updateAdaptiveRaymarchStepBudget,
} from "./baryonVisualizerRenderLoop.js";
import { RENDER_CONTEXTS } from "@baryon/visualizer/render/outputPipeline";
import {
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
} from "../../context/liveInputRuntimeStatus.js";

function createSetterCapture() {
  let currentValue = null;
  let callCount = 0;

  return {
    get currentValue() {
      return currentValue;
    },
    get callCount() {
      return callCount;
    },
    set(valueOrUpdater) {
      callCount += 1;
      currentValue =
        typeof valueOrUpdater === "function"
          ? valueOrUpdater(currentValue)
          : valueOrUpdater;
    },
  };
}

function createAdaptiveRaymarchHarness({
  controls = {},
  renderProfile = {},
  effectiveFrame = {},
  status = {},
  runtime = {},
} = {}) {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.lastFrameTimeMs = 14;
  runtimeDiagnostics.smoothedFrameTimeMs = 14;
  runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 64;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 1;
  runtimeDiagnostics.adaptiveRaymarch.currentRung = 3;
  runtimeDiagnostics.adaptiveRaymarch.currentScaleRung = 2;

  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    autoRaymarchResumeRung: null,
    autoRaymarchResumeScaleRung: null,
    uniforms: {
      uRaymarchSteps: {
        value: 64,
      },
    },
    volumeMesh: {
      material: {
        steps: 64,
      },
    },
  };

  return {
    runtimeDiagnostics,
    runtimeState,
    args: {
      controls: {
        raymarchSteps: 64,
        injectTestTone: false,
        ...controls,
      },
      runtime: {
        method: "raymarch",
        ...runtime,
      },
      runtimeState,
      renderProfile: {
        qualityPreset: "auto",
        renderScale: 1,
        ...renderProfile,
      },
      effectiveFrame: {
        activeModeCount: 16,
        fieldState: "active",
        energySignal: 0.2,
        sourceMode: "file",
        ...effectiveFrame,
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        playbackSessionId: "song-1",
        ...status,
      },
      runtimeDiagnostics,
    },
  };
}

function primeAdaptiveRecoveryAttempt(runtimeDiagnostics) {
  runtimeDiagnostics.adaptiveRaymarch.decisionFrameCount = 29;
  runtimeDiagnostics.adaptiveRaymarch.stableWindowCount = 3;
}

function assertAdaptiveRecoveryBlocked(runtimeDiagnostics, blockedReason) {
  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(3);
  expect(runtimeDiagnostics.adaptiveRaymarch.currentScaleRung).toBe(2);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.scaleStepUpCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.stableWindowCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(false);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    blockedReason,
  );
}

test("marks idle frames as live while live start is pending", () => {
  const featureFrame = {
    fieldState: "idle",
    isLiveInputActive: false,
    sourceMode: "silent",
  };

  const resolvedFrame = applyLiveInputRenderIntent(featureFrame, {
    status: { isLiveInputActive: false },
    liveInputUiState: "idle",
    liveControlSignal: { desiredActive: true },
  });

  expect(resolvedFrame).not.toBe(featureFrame);
  expect(resolvedFrame).toMatchObject({
    fieldState: "idle",
    isLiveInputActive: true,
    sourceMode: "silent",
  });
});

test("marks frames as not live after live stop intent", () => {
  const featureFrame = {
    fieldState: "idle",
    isLiveInputActive: true,
    sourceMode: "live",
  };

  const resolvedFrame = applyLiveInputRenderIntent(featureFrame, {
    status: { isLiveInputActive: false },
    liveInputUiState: "idle",
    liveControlSignal: { desiredActive: false },
  });

  expect(resolvedFrame).not.toBe(featureFrame);
  expect(resolvedFrame).toMatchObject({
    fieldState: "idle",
    isLiveInputActive: false,
    sourceMode: "live",
  });
});

function createResolveFeatureFrameHarness(overrides = {}) {
  return {
    args: {
      audio: {
        readAnalysisSnapshot() {
          return {
            sourceMode: "file",
            avgAmplitude: 24,
            fftMagnitudes: new Float32Array([0, 0.9, 0.4]),
            timeData: new Float32Array([0, 0.1, -0.1]),
            rms: 0.2,
            spectralCentroid: 0.3,
            spectralFlux: 0.1,
          };
        },
      },
      featureState: {
        capacity: 16,
        audit: { settings: {} },
      },
      featureAnalyzer: {
        enqueueAnalysisFrame() {},
        readHints() {
          return null;
        },
      },
      featureEngine: null,
      runtimeDiagnostics: createRuntimeDiagnostics(),
      runtimeState: {
        uniforms: {
          uRadius: { value: 3 },
        },
      },
      controls: {
        cavityGeometry: "spherical",
        injectTestTone: false,
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        playbackSessionId: "song-1",
      },
      time: 1,
      clockMode: "running",
      renderLoopRefs: {
        frameCacheRefs: {
          lastLiveFrameRef: { current: { fieldState: "idle" } },
          lastActiveFrameRef: { current: null },
          lastIdleFrameRef: { current: null },
          analysisSchedulerRef: { current: null },
        },
      },
      spectralLightEnabled: true,
      ...overrides,
    },
  };
}

test("publishes live runtime status changes only when fields change", () => {
  const setter = createSetterCapture();
  const renderLoopRefs = {
    lastLiveInputRuntimeStatusRef: { current: null },
  };
  const sharedStatus = {
    isLiveInputActive: true,
    liveInputKind: "live",
    liveInputAnalysisClass: "auto",
    resolvedLiveInputAnalysisClass: "acoustic-mic",
    selectedLiveInputDeviceId: "device-1",
    selectedLiveInputDeviceLabel: "Built-in Mic",
  };

  const first = syncLiveInputRuntimeStatus({
    status: sharedStatus,
    featureFrame: {
      debug: {
        liveInputCalibrationActive: true,
        liveInputNoiseGateActive: true,
      },
    },
    liveInputUiState: "active",
    liveInputErrorCode: LIVE_INPUT_ERROR_CODES.none,
    setLiveInputRuntimeStatus: setter.set,
    renderLoopRefs,
  });
  expect(first.phase).toBe(LIVE_INPUT_PHASES.calibrating);
  expect(setter.callCount).toBe(1);

  syncLiveInputRuntimeStatus({
    status: sharedStatus,
    featureFrame: {
      debug: {
        liveInputCalibrationActive: true,
        liveInputNoiseGateActive: true,
      },
    },
    liveInputUiState: "active",
    liveInputErrorCode: LIVE_INPUT_ERROR_CODES.none,
    setLiveInputRuntimeStatus: setter.set,
    renderLoopRefs,
  });
  expect(setter.callCount).toBe(1);

  const updated = syncLiveInputRuntimeStatus({
    status: sharedStatus,
    featureFrame: {
      debug: {
        liveInputCalibrationActive: false,
        liveInputNoiseGateActive: true,
      },
    },
    liveInputUiState: "active",
    liveInputErrorCode: LIVE_INPUT_ERROR_CODES.none,
    setLiveInputRuntimeStatus: setter.set,
    renderLoopRefs,
  });
  expect(updated.phase).toBe(LIVE_INPUT_PHASES.weakSignal);
  expect(setter.callCount).toBe(2);
  expect(setter.currentValue.phase).toBe(LIVE_INPUT_PHASES.weakSignal);
});

test("updateRendererDiagnostics resizes the renderer when canvas size changes without a DPR change", () => {
  const runtimeDiagnosticsRef = {
    current: createRuntimeDiagnostics(),
  };
  const pixelRatioRef = { current: 1 };
  const renderSurfaceSizeRef = {
    current: { width: 1318, height: 1536 },
  };
  const lastAudioIssueSignatureRef = { current: null };
  const gl = {
    backend: { isWebGLBackend: false },
    setPixelRatioCalls: [],
    setSizeCalls: [],
    setPixelRatio(value) {
      this.setPixelRatioCalls.push(value);
    },
    setSize(width, height, updateStyle) {
      this.setSizeCalls.push({ width, height, updateStyle });
    },
  };

  updateRendererDiagnostics(
    {
      state: {
        size: {
          width: 2538,
          height: 1536,
        },
      },
      controls: {
        lowLoadPlaybackDiagnostics: false,
      },
      status: {
        isPlaying: false,
      },
      time: 0,
      deltaTime: 1 / 60,
      rfDelta: 1 / 60,
      gl,
      renderLoopRefs: {
        runtimeDiagnosticsRef,
        pixelRatioRef,
        renderSurfaceSizeRef,
        lastAudioIssueSignatureRef,
      },
    },
    {
      getTargetDpr: () => 1,
      renderScale: 1,
    },
  );

  expect(gl.setPixelRatioCalls).toEqual([]);
  expect(gl.setSizeCalls).toEqual([
    {
      width: 2538,
      height: 1536,
      updateStyle: false,
    },
  ]);
  expect(renderSurfaceSizeRef.current).toEqual({
    width: 2538,
    height: 1536,
  });
});

test("buildPerformanceHudSnapshot exports stage attribution, engine counters, and raw perf breakdown", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.smoothedFrameTimeMs = 20;
  runtimeDiagnostics.render.targetFps = 60;
  runtimeDiagnostics.perfBreakdown.readAnalysisSnapshotMs.averageMs = 1;
  runtimeDiagnostics.perfBreakdown.enqueueAnalysisFrameMs.averageMs = 2;
  runtimeDiagnostics.perfBreakdown.readAnalysisHintsMs.averageMs = 3;
  runtimeDiagnostics.perfBreakdown.buildFeatureFrameMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.heavyAnalysisMs.averageMs = 5;
  runtimeDiagnostics.perfBreakdown.fastComposeMs.averageMs = 6;
  runtimeDiagnostics.perfBreakdown.engineEnqueueMs.averageMs = 7;
  runtimeDiagnostics.perfBreakdown.readEngineSnapshotMs.averageMs = 8;
  runtimeDiagnostics.perfBreakdown.applyCachedControlSnapshotsMs.averageMs = 9;
  runtimeDiagnostics.perfBreakdown.syncLiveInputRuntimeStatusMs.averageMs = 10;
  runtimeDiagnostics.perfBreakdown.runtimeTickMs.averageMs = 11;
  runtimeDiagnostics.perfBreakdown.applyReactiveBloomMs.averageMs = 12;
  runtimeDiagnostics.perfBreakdown.applySceneControlsMs.averageMs = 13;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.averageMs = 14;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.lastMs = 99;
  runtimeDiagnostics.engine.publishCount = 101;
  runtimeDiagnostics.engine.publishSkipCount = 7;
  runtimeDiagnostics.engine.fastSignalUpdateCount = 17;
  runtimeDiagnostics.engine.structuralUpdateCount = 19;
  runtimeDiagnostics.engine.chromaUpdateCount = 23;
  runtimeDiagnostics.engine.tempoUpdateCount = 29;

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);

  expect(snapshot.targetFps).toBe(60);
  expect(snapshot.perfBreakdown.heavyAnalysisMs.averageMs).toBe(5);
  expect(snapshot.perfBreakdown.pipelineRenderMs.lastMs).toBe(99);
  expect(snapshot.stageAttribution.analysisCpuMs).toBe(21);
  expect(snapshot.stageAttribution.engineCpuMs).toBe(15);
  expect(snapshot.stageAttribution.controlCpuMs).toBe(55);
  expect(snapshot.stageAttribution.renderCpuMs).toBe(14);
  expect(snapshot.stageAttribution.measuredCpuMs).toBe(105);
  expect(snapshot.stageAttribution.unattributedFrameMs).toBe(0);
  expect(snapshot.stageAttribution.dominantBucket).toBe("control");
  expect(snapshot.engineCounters).toEqual({
    publishCount: 101,
    publishSkipCount: 7,
    fastSignalUpdateCount: 17,
    structuralUpdateCount: 19,
    chromaUpdateCount: 23,
    tempoUpdateCount: 29,
  });
});

test("buildPerformanceHudSnapshot uses deterministic dominant-bucket tie breaks", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.smoothedFrameTimeMs = 10;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.heavyAnalysisMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.engineEnqueueMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.runtimeTickMs.averageMs = 4;

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);

  expect(snapshot.stageAttribution.analysisCpuMs).toBe(4);
  expect(snapshot.stageAttribution.engineCpuMs).toBe(4);
  expect(snapshot.stageAttribution.controlCpuMs).toBe(4);
  expect(snapshot.stageAttribution.renderCpuMs).toBe(4);
  expect(snapshot.stageAttribution.unattributedFrameMs).toBe(0);
  expect(snapshot.stageAttribution.dominantBucket).toBe("render");
});

test("publishes provider transition phases even before live audio becomes active", () => {
  const setter = createSetterCapture();
  const renderLoopRefs = {
    lastLiveInputRuntimeStatusRef: { current: null },
  };

  const runtimeStatus = syncLiveInputRuntimeStatus({
    status: {
      isLiveInputActive: false,
      liveInputKind: "live",
      liveInputAnalysisClass: "auto",
      resolvedLiveInputAnalysisClass: "acoustic-mic",
      selectedLiveInputDeviceId: "device-1",
      selectedLiveInputDeviceLabel: "Built-in Mic",
    },
    featureFrame: null,
    liveInputUiState: "starting",
    liveInputErrorCode: LIVE_INPUT_ERROR_CODES.none,
    setLiveInputRuntimeStatus: setter.set,
    renderLoopRefs,
  });

  expect(runtimeStatus.phase).toBe(LIVE_INPUT_PHASES.starting);
  expect(runtimeStatus.active).toBe(false);
  expect(setter.callCount).toBe(1);
  expect(setter.currentValue.phase).toBe(LIVE_INPUT_PHASES.starting);
});

test("publishes authoritative audit callbacks without devtools globals", () => {
  const auditStates = [];
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    publishDevtoolsSnapshots(
      {
        devtoolsEnabled: false,
        controls: {
          auditEnabled: true,
          logEveryFrames: 1,
        },
        runtime: {
          method: "raymarch",
        },
        runtimeState: {
          debugSnapshot: {
            raymarchDebug: {
              fieldState: "active",
            },
          },
        },
        status: {
          isPlaying: true,
        },
        featureState: {
          audit: {
            frame: 1,
          },
        },
        lowLoadActive: false,
        runtimeDiagnostics: createRuntimeDiagnostics(),
        shared: {},
        output: {},
        visualization: {},
        bloom: {},
        audit: {},
        sceneSnapshot: {},
        audio: {
          getLiveInputSettings() {
            return {};
          },
        },
      },
      {
        markRuntimeReady: () => {
          throw new Error("runtime ready should remain devtools-only");
        },
        logAudit: () => {},
        onAuditSnapshotChange: (nextState) => {
          auditStates.push(nextState);
        },
      },
    );

    expect(auditStates).toHaveLength(1);
    expect(auditStates[0]).toMatchObject({
      enabled: true,
    });
    expect(auditStates[0].snapshot).toBeTruthy();
    expect(window.__baryonAuditSnapshot).toBeUndefined();
    expect(window.__baryonControlState).toBeUndefined();
  } finally {
    if (typeof previousWindow === "undefined") {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("auto raymarch drops render scale before bottoming out step budget", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.lastFrameTimeMs = 19.2;
  runtimeDiagnostics.smoothedFrameTimeMs = 19.2;
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    autoRaymarchResumeRung: null,
    autoRaymarchResumeScaleRung: null,
    uniforms: {
      uRaymarchSteps: {
        value: 64,
      },
    },
    volumeMesh: {
      material: {
        steps: 64,
      },
    },
  };
  const baseArgs = {
    controls: {
      raymarchSteps: 64,
      injectTestTone: true,
    },
    runtime: {
      method: "raymarch",
    },
    runtimeState,
    renderProfile: {
      qualityPreset: "auto",
      renderScale: 1,
    },
    effectiveFrame: {
      activeModeCount: 16,
    },
    status: {
      isPlaying: false,
      isLiveInputActive: false,
    },
    runtimeDiagnostics,
  };

  for (let index = 0; index < 31; index += 1) {
    updateAdaptiveRaymarchStepBudget(baseArgs);
  }

  expect(runtimeState.effectiveRaymarchSteps).toBe(40);
  expect(getEffectiveAdaptiveRenderScale(runtimeDiagnostics, 1)).toBeLessThan(
    1,
  );
  expect(
    runtimeDiagnostics.adaptiveRaymarch.scaleStepDownCount,
  ).toBeGreaterThan(0);
});

test("performance HUD scale falls back to requested render scale when adaptive mode is idle", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  expect(getEffectiveAdaptiveRenderScale(runtimeDiagnostics, 0.75)).toBe(0.75);

  runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale = 0.67;

  expect(getEffectiveAdaptiveRenderScale(runtimeDiagnostics, 0.75)).toBe(0.67);
});

test("custom profile uses the selected target fps for adaptive tuning", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    autoRaymarchResumeRung: null,
    autoRaymarchResumeScaleRung: null,
    uniforms: {
      uRaymarchSteps: {
        value: 64,
      },
    },
    volumeMesh: {
      material: {
        steps: 64,
      },
    },
  };

  updateAdaptiveRaymarchStepBudget({
    controls: {
      raymarchSteps: 64,
      injectTestTone: true,
      customPerformanceTargetFps: 48,
    },
    runtime: {
      method: "raymarch",
    },
    runtimeState,
    renderProfile: {
      qualityPreset: "custom",
      renderScale: 1,
    },
    effectiveFrame: {
      activeModeCount: 12,
    },
    status: {
      isPlaying: true,
      isLiveInputActive: false,
    },
    runtimeDiagnostics,
  });

  expect(runtimeDiagnostics.adaptiveRaymarch.targetFps).toBe(48);
  expect(runtimeDiagnostics.adaptiveRaymarch.targetFrameTimeMs).toBe(1000 / 48);
});

test("external-output custom 120 starts from the calibrated base rung and scale", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        customPerformanceTargetFps: 120,
      },
      renderProfile: {
        qualityPreset: "custom",
        targetFps: 120,
        renderScale: 0.67,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 0;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeState.effectiveRaymarchSteps).toBe(16);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale).toBe(0.67);
});

test("external-output auto starts from the balanced 60 base rung and scale", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    renderProfile: {
      qualityPreset: "auto",
      targetFps: 60,
      renderScale: 0.75,
      renderContext: RENDER_CONTEXTS.externalOutput,
    },
  });

  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 0;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(32);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale).toBe(0.75);
});

test("preview custom 120 starts from the intended rung instead of max quality", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    controls: {
      customPerformanceTargetFps: 120,
    },
    renderProfile: {
      qualityPreset: "custom",
      targetFps: 120,
      renderScale: 0.84,
      renderContext: RENDER_CONTEXTS.preview,
    },
  });

  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 0;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(24);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale).toBe(0.84);
});

test("active playback bootstrap builds a fresh Spectral Light frame when the feature engine has no matching snapshot", () => {
  const heavyAnalysis = {
    fieldState: "active",
    activeModeCount: 2,
    backboneColorSlots: new Float32Array([0.1, 0.8, 1, 0.9]),
    detailColorSlots: new Float32Array([1, 0.3, 0.2, 0.7]),
  };
  const frameCacheRefs = {
    lastLiveFrameRef: { current: null },
    lastActiveFrameRef: { current: null },
    lastIdleFrameRef: { current: null },
    analysisSchedulerRef: { current: {} },
  };
  const runHeavyFeatureAnalysis = vi.fn(() => heavyAnalysis);
  const composeFeatureFrame = vi.fn(({ analysisResult }) => ({
    fieldState: analysisResult.fieldState,
    activeModeCount: analysisResult.activeModeCount,
    backboneColorSlots: analysisResult.backboneColorSlots,
    detailColorSlots: analysisResult.detailColorSlots,
  }));

  const { effectiveFrame } = resolveFeatureFrame(
    {
      ...createResolveFeatureFrameHarness({
        featureEngine: {
          enqueueTransportFrame: vi.fn(),
          readLatestSnapshot: vi.fn(() => ({
            analysisSessionKey: "previous-session",
            analysisInputsSignature: "previous-inputs",
          })),
          getStatus: vi.fn(() => ({})),
        },
        renderLoopRefs: {
          frameCacheRefs,
        },
      }).args,
      spectralLightEnabled: true,
    },
    {
      prepareFeatureFrame: vi.fn(() => ({
        currentFrameAtMs: 1000,
        analysisSessionKey: "song-1",
        analysisInputsSignature: "spectral-on",
        silentFeatureFrame: null,
      })),
      runHeavyFeatureAnalysis,
      composeFeatureFrame,
    },
  );

  expect(effectiveFrame.fieldState).toBe("active");
  expect(effectiveFrame.backboneColorSlots[3]).toBeGreaterThan(0);
  expect(runHeavyFeatureAnalysis).toHaveBeenCalledTimes(1);
  expect(composeFeatureFrame).toHaveBeenCalledTimes(1);
  expect(frameCacheRefs.analysisSchedulerRef.current).toMatchObject({
    lastHeavyAnalysisResult: heavyAnalysis,
    lastComposedFeatureFrame: effectiveFrame,
  });
});

test("clearing adaptive resume state forces the next authoritative session to restart from calibrated base rungs", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        customPerformanceTargetFps: 120,
      },
      renderProfile: {
        qualityPreset: "custom",
        targetFps: 120,
        renderScale: 0.67,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  runtimeState.autoRaymarchResumeRung = 6;
  runtimeState.autoRaymarchResumeScaleRung = 4;
  clearAdaptiveRaymarchResumeState(runtimeState);
  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 0;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeState.autoRaymarchResumeRung).toBe(0);
  expect(runtimeState.autoRaymarchResumeScaleRung).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(16);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale).toBe(0.67);
});

test("auto raymarch does not recover during decay frames", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    effectiveFrame: {
      fieldState: "decay",
      energySignal: 0.22,
    },
  });
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  assertAdaptiveRecoveryBlocked(runtimeDiagnostics, "inactive-field");
});

test("auto raymarch does not recover during silent playback gaps", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    effectiveFrame: {
      fieldState: "idle",
      energySignal: 0,
      sourceMode: "silent",
    },
  });
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  assertAdaptiveRecoveryBlocked(runtimeDiagnostics, "silent-source");
});

test("auto raymarch does not recover on weak active audio", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    effectiveFrame: {
      energySignal: 0.04,
    },
  });
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  assertAdaptiveRecoveryBlocked(runtimeDiagnostics, "low-energy");
});

test("auto raymarch resumes recovery on sustained active audio", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness();
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(4);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(true);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "none",
  );
});

test("playback session changes clear adaptive recovery momentum", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    status: {
      playbackSessionId: "song-2",
    },
  });
  runtimeDiagnostics.adaptiveRaymarch.lastPlaybackSessionId = "song-1";
  runtimeDiagnostics.adaptiveRaymarch.stableWindowCount = 3;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.stableWindowCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(false);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "session-transition",
  );
  expect(runtimeDiagnostics.adaptiveRaymarch.lastPlaybackSessionId).toBe(
    "song-2",
  );
});

test("inject test tone bypasses the recovery gate", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    controls: {
      injectTestTone: true,
    },
    effectiveFrame: {
      fieldState: "idle",
      energySignal: 0,
      sourceMode: "silent",
    },
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: null,
    },
  });
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(4);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(true);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "none",
  );
});

test("resolveFeatureFrame passes cavity geometry into prepared inputs", () => {
  const { args } = createResolveFeatureFrameHarness();
  let preparedArgs = null;

  resolveFeatureFrame(args, {
    prepareFeatureFrame(nextArgs) {
      preparedArgs = nextArgs;
      return {
        currentFrameAtMs: 1000,
        analysisSessionKey: "file:song-1",
        analysisInputsSignature: '"sig"',
        silentFeatureFrame: { fieldState: "idle" },
      };
    },
  });

  expect(preparedArgs.cavityGeometry).toBe("spherical");
});

test("resolveFeatureFrame forwards cavity geometry into the worker transport payload", () => {
  const featureEngine = {
    lastFrame: null,
    enqueueTransportFrame(frame) {
      this.lastFrame = frame;
    },
    readLatestSnapshot() {
      return null;
    },
    getStatus() {
      return null;
    },
  };
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: null,
    },
  });

  resolveFeatureFrame(args, {
    prepareFeatureFrame() {
      return {
        currentFrameAtMs: 1000,
        analysisSessionKey: "file:song-1",
        analysisInputsSignature: '"sig"',
        silentFeatureFrame: null,
      };
    },
  });

  expect(featureEngine.lastFrame.cavityGeometry).toBe("spherical");
});

test("resolveFeatureFrame seeds the first live frame locally while worker analysis warms", () => {
  const featureEngine = {
    enqueueTransportFrame() {},
    readLatestSnapshot() {
      return null;
    },
    getStatus() {
      return null;
    },
  };
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    status: {
      isPlaying: false,
      isLiveInputActive: true,
      playbackSessionId: null,
    },
    renderLoopRefs: {
      frameCacheRefs: {
        lastLiveFrameRef: { current: null },
        lastActiveFrameRef: { current: null },
        lastIdleFrameRef: { current: null },
        analysisSchedulerRef: { current: null },
      },
    },
  });
  let heavyAnalysisCallCount = 0;
  let composeCallCount = 0;

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame() {
      return {
        currentFrameAtMs: 1000,
        analysisSessionKey: "live:device-1",
        analysisInputsSignature: '"sig"',
        silentFeatureFrame: null,
      };
    },
    runHeavyFeatureAnalysis(preparedInputs) {
      heavyAnalysisCallCount += 1;
      return {
        preparedInputs,
      };
    },
    composeFeatureFrame({ analysisResult }) {
      composeCallCount += 1;
      return {
        fieldState: "active",
        seededFromAnalysis: analysisResult.preparedInputs.analysisSessionKey,
      };
    },
  });

  expect(heavyAnalysisCallCount).toBe(1);
  expect(composeCallCount).toBe(1);
  expect(result.effectiveFrame.fieldState).toBe("active");
  expect(
    args.renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current,
  ).toMatchObject({
    fieldState: "active",
    seededFromAnalysis: "live:device-1",
  });
});

test("resolveFeatureFrame preserves the last active live frame during worker warmup", () => {
  const featureEngine = {
    enqueueTransportFrame() {},
    readLatestSnapshot() {
      return null;
    },
    getStatus() {
      return null;
    },
  };
  const lastLiveFrame = { fieldState: "active", preserved: true };
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    status: {
      isPlaying: false,
      isLiveInputActive: true,
      playbackSessionId: null,
    },
    renderLoopRefs: {
      frameCacheRefs: {
        lastLiveFrameRef: { current: lastLiveFrame },
        lastActiveFrameRef: { current: null },
        lastIdleFrameRef: { current: null },
        analysisSchedulerRef: { current: null },
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame() {
      return {
        currentFrameAtMs: 1000,
        analysisSessionKey: "live:device-1",
        analysisInputsSignature: '"sig"',
        silentFeatureFrame: null,
      };
    },
    runHeavyFeatureAnalysis() {
      throw new Error("worker warmup should reuse the preserved live frame");
    },
  });

  expect(result.effectiveFrame).toBe(lastLiveFrame);
  expect(args.renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current).toBe(
    lastLiveFrame,
  );
});

test("resolveFeatureFrame clears cached live frames and reactive response after live input interruption", () => {
  const featureEngine = {
    reset: vi.fn(),
  };
  const runtimeState = {
    responseEnvelope: 0.7,
    accentEnvelope: 0.6,
    motionSignal: 0.5,
    scaleSignal: 0.4,
    bloomResponseSignal: 0.8,
    beatPulseEnvelope: 0.3,
    uniforms: {
      uRadius: { value: 3 },
    },
  };
  const frameCacheRefs = {
    lastLiveFrameRef: { current: { fieldState: "active" } },
    lastActiveFrameRef: { current: { fieldState: "active" } },
    lastIdleFrameRef: { current: { fieldState: "idle" } },
    analysisSchedulerRef: {
      current: {
        lastHeavyAnalysisAtMs: 900,
        lastHeavyAnalysisResult: { stale: true },
        lastComposedFeatureFrame: { fieldState: "active" },
        lastAnalysisSessionKey: "live:device-1",
        lastAnalysisInputsSignature: '"sig"',
      },
    },
  };
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    runtimeState,
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: null,
      lastLiveInputInterruption: {
        reason: "track-ended",
      },
    },
    renderLoopRefs: {
      frameCacheRefs,
    },
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame() {
      return {
        currentFrameAtMs: 1000,
        analysisSessionKey: "idle",
        analysisInputsSignature: '"idle"',
        silentFeatureFrame: { fieldState: "idle" },
      };
    },
  });

  expect(result.effectiveFrame).toMatchObject({ fieldState: "idle" });
  expect(frameCacheRefs.lastLiveFrameRef.current).toBeNull();
  expect(frameCacheRefs.lastActiveFrameRef.current).toBeNull();
  expect(frameCacheRefs.lastIdleFrameRef.current).toBeNull();
  expect(frameCacheRefs.analysisSchedulerRef.current).toMatchObject({
    lastHeavyAnalysisAtMs: Number.NEGATIVE_INFINITY,
    lastHeavyAnalysisResult: null,
    lastComposedFeatureFrame: null,
  });
  expect(featureEngine.reset).toHaveBeenCalledWith("live-input-interrupted");
  expect(runtimeState).toMatchObject({
    responseEnvelope: 0,
    accentEnvelope: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    beatPulseEnvelope: 0,
  });
});

test("resolveFeatureFrame keeps weak active live input out of the interruption reset path", () => {
  const featureEngine = {
    reset: vi.fn(),
  };
  const runtimeState = {
    responseEnvelope: 0.7,
    bloomResponseSignal: 0.8,
    uniforms: {
      uRadius: { value: 3 },
    },
  };
  const frameCacheRefs = {
    lastLiveFrameRef: { current: { fieldState: "active" } },
    lastActiveFrameRef: { current: null },
    lastIdleFrameRef: { current: null },
    analysisSchedulerRef: { current: null },
  };
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    runtimeState,
    status: {
      isPlaying: false,
      isLiveInputActive: true,
      playbackSessionId: null,
      lastLiveInputInterruption: null,
    },
    renderLoopRefs: {
      frameCacheRefs,
    },
  });

  resolveFeatureFrame(args, {
    prepareFeatureFrame() {
      return {
        currentFrameAtMs: 1000,
        analysisSessionKey: "live:device-1",
        analysisInputsSignature: '"weak"',
        silentFeatureFrame: { fieldState: "idle" },
      };
    },
  });

  expect(featureEngine.reset).not.toHaveBeenCalledWith(
    "live-input-interrupted",
  );
  expect(runtimeState.responseEnvelope).toBe(0.7);
  expect(runtimeState.bloomResponseSignal).toBe(0.8);
});
