import { expect, test, vi } from "vitest";
import {
  clearAdaptiveRaymarchResumeState,
  createRuntimeDiagnostics,
} from "./baryonVisualizerRuntimeState.js";
import { syncLiveInputRuntimeStatus } from "./liveInputRuntimeSync.js";
import {
  applyLiveInputRenderIntent,
  applyReactiveBloomState,
  buildPerformanceHudSnapshot,
  finalizeTerminalVisualIdleState,
  getEffectiveAdaptiveRenderScale,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  shouldBypassTemporalHistoryForRaymarchFrame,
  updateModalEnvelopeDiagnostics,
  updateModalFreshnessDiagnostics,
  updateRendererDiagnostics,
  updateAdaptiveRaymarchStepBudget,
  resolveRaymarchGovernorFrameInputs,
  syncAdaptiveRenderSurfacePixelRatio,
  syncUploadedRenderQuantities,
} from "./baryonVisualizerRenderLoop.js";
import { RENDER_CONTEXTS } from "@baryon/visualizer/render/outputPipeline";
import { CAVITY_ACOUSTIC_DEFAULTS } from "@baryon/visualizer/defaults";
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

function createLiveRenderFrameEvidence({
  projectedRenderEnergy = 0.2,
  injectTestTone = false,
} = {}) {
  return {
    renderAuthority: true,
    energyLedger: {
      projectedRenderEnergy,
      renderEnergyEpsilon: 1e-6,
      injectTestTone,
    },
    sourceEvidence: {
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
      sourceEnergy: projectedRenderEnergy,
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
  const resolvedControls = {
    raymarchSteps: 64,
    injectTestTone: false,
    ...controls,
  };
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
      controls: resolvedControls,
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
        ...createLiveRenderFrameEvidence({
          injectTestTone: resolvedControls.injectTestTone,
        }),
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
      featureEngine: null,
      runtimeDiagnostics: createRuntimeDiagnostics(),
      runtimeState: {
        uniforms: {
          uRadius: { value: 3 },
        },
      },
      controls: {
        cavityGeometry: "spherical",
        boundaryMode: "dirichlet",
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

// `true` means flush temporal history (show the crisp scene color); `false`
// means let TRAA accumulate.
test("shouldBypassTemporalHistoryForRaymarchFrame is method-aware", () => {
  // raymarch accumulates while the field is driven and scene-root motion gives
  // TRAA a real velocity to reproject, and flushes when the field is idle so a
  // paused 3D volume cannot freeze stale history.
  for (const drivenState of ["active", "decay", "test"]) {
    expect(
      shouldBypassTemporalHistoryForRaymarchFrame({
        runtimeMethod: "raymarch",
        featureFrame: {
          ...createLiveRenderFrameEvidence({
            injectTestTone: drivenState === "test",
          }),
          fieldState: drivenState,
          energySignal: 0.6,
        },
        sceneSnapshot: { angularVelocity: 0.25 },
      }),
    ).toBe(false);
  }
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "raymarch",
      featureFrame: { fieldState: "idle", energySignal: 0 },
    }),
  ).toBe(true);

  // Non-raymarch-pipeline methods never engage the temporal bypass.
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "cymatics-2d",
      featureFrame: { fieldState: "active" },
    }),
  ).toBe(false);
});

test("shouldBypassTemporalHistoryForRaymarchFrame requires reprojectable raymarch motion", () => {
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "raymarch",
      featureFrame: {
        ...createLiveRenderFrameEvidence(),
        fieldState: "active",
        energySignal: 0.8,
      },
      sceneSnapshot: { angularVelocity: 0, pitchVelocity: 0, rollVelocity: 0 },
    }),
  ).toBe(true);

  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "raymarch",
      featureFrame: {
        ...createLiveRenderFrameEvidence(),
        fieldState: "active",
        energySignal: 0.8,
      },
      sceneSnapshot: {
        angularVelocity: 0,
        pitchVelocity: 0.02,
        rollVelocity: 0,
      },
    }),
  ).toBe(false);
});

// Regression: the old bug was threshold chatter around energySignal > 0.02
// toggling the temporal blend. Energy must no longer influence the decision.
test("shouldBypassTemporalHistoryForRaymarchFrame ignores audio energy", () => {
  for (const energySignal of [0, 0.01, 0.02, 0.03, 0.5]) {
    expect(
      shouldBypassTemporalHistoryForRaymarchFrame({
        runtimeMethod: "raymarch",
        featureFrame: {
          ...createLiveRenderFrameEvidence(),
          fieldState: "active",
          energySignal,
        },
        sceneSnapshot: { angularVelocity: 0.25 },
      }),
    ).toBe(false);
    expect(
      shouldBypassTemporalHistoryForRaymarchFrame({
        runtimeMethod: "raymarch",
        featureFrame: { fieldState: "idle", energySignal },
      }),
    ).toBe(true);
  }
});

test("finalizeTerminalVisualIdleState cuts bloom and marks temporal history only after render authority ends", () => {
  const runtimeState = {
    bloomTuning: {
      bloomAllowed: true,
      effectiveStrength: 0.4,
      effectiveRadius: 0.2,
      effectiveThreshold: 0.1,
    },
  };
  const postNodes = {
    traaNode: {},
    temporalHistoryBlendUniform: { value: 1 },
  };

  const decayResult = finalizeTerminalVisualIdleState({
    featureFrame: {
      ...createLiveRenderFrameEvidence({
        projectedRenderEnergy: 0.04,
      }),
      fieldState: "decay",
      modalResponseEnergy: 0.04,
    },
    runtimeState,
    postNodes,
  });

  expect(decayResult).toEqual({
    terminalVisualIdle: false,
    resumedFromVisualIdle: false,
  });
  expect(runtimeState.bloomTuning.bloomAllowed).toBe(true);
  expect(postNodes.visualIdleFinalized).toBeUndefined();

  const idleResult = finalizeTerminalVisualIdleState({
    featureFrame: {
      fieldState: "idle",
      renderAuthority: false,
      sourceMode: "silent",
    },
    runtimeState,
    postNodes,
  });

  expect(idleResult).toMatchObject({
    terminalVisualIdle: true,
    resumedFromVisualIdle: false,
    markedTemporalBypass: true,
  });
  expect(runtimeState.bloomTuning.bloomAllowed).toBe(false);
  expect(postNodes.visualIdleFinalized).toBe(true);
  expect(postNodes.temporalHistoryBlendUniform.value).toBe(0);
  expect(postNodes.temporalHistoryCutFramesRemaining).toBeGreaterThan(0);
});

test("finalizeTerminalVisualIdleState reports resumed active frames without clearing the pending render cut", () => {
  const runtimeState = {
    bloomTuning: {
      bloomAllowed: false,
    },
  };
  const postNodes = {
    visualIdleFinalized: true,
    traaNode: {},
    temporalHistoryBlendUniform: { value: 1 },
  };

  const result = finalizeTerminalVisualIdleState({
    featureFrame: {
      ...createLiveRenderFrameEvidence(),
      fieldState: "active",
      modalVisibilityEnergy: 0.4,
    },
    runtimeState,
    postNodes,
  });

  expect(result).toEqual({
    terminalVisualIdle: false,
    resumedFromVisualIdle: true,
  });
  expect(postNodes.visualIdleFinalized).toBe(true);
});

test("applyReactiveBloomState disables bloom compose after terminal visual idle", () => {
  const postNodesRef = {
    current: {
      bloomPass: {
        strength: { value: 0 },
        radius: { value: 0 },
        threshold: { value: 0 },
      },
    },
  };

  applyReactiveBloomState({
    controls: { bloomEnabled: true },
    runtimeState: {
      bloomTuning: {
        bloomAllowed: false,
        effectiveStrength: 0.4,
        effectiveRadius: 0.2,
        effectiveThreshold: 0.1,
      },
      performanceGovernor: null,
    },
    postNodesRef,
    bloom: {
      strength: 0.4,
      radius: 0.2,
      threshold: 0.1,
    },
  });

  expect(postNodesRef.current.bloomPass.strength.value).toBe(0.4);
  expect(postNodesRef.current.bloomPass.radius.value).toBe(0.2);
  expect(postNodesRef.current.bloomPass.threshold.value).toBe(999);
});

test("buildPerformanceHudSnapshot exports stage attribution, engine counters, and raw perf breakdown", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.smoothedFrameTimeMs = 20;
  runtimeDiagnostics.render.targetFps = 60;
  runtimeDiagnostics.modalFreshness.structureSignal = 0.72;
  runtimeDiagnostics.modalFreshness.responseEnvelope = 0.38;
  runtimeDiagnostics.modalFreshness.modeSlotChangeCount = 3;
  runtimeDiagnostics.modalFreshness._previousModeSlots = new Float32Array([
    0.1, 0.2, 0.3,
  ]);
  runtimeDiagnostics.perfBreakdown.readAnalysisSnapshotMs.averageMs = 1;
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
  runtimeDiagnostics.engine.fastSignalPatchCount = 11;
  runtimeDiagnostics.engine.fastSignalUpdateCount = 17;
  runtimeDiagnostics.engine.structuralUpdateCount = 19;
  runtimeDiagnostics.engine.chromaUpdateCount = 23;
  runtimeDiagnostics.engine.tempoUpdateCount = 29;
  runtimeDiagnostics.engine.workerFastSignalMs = 1.25;
  runtimeDiagnostics.engine.workerFastSignalLastMs = 1.5;
  runtimeDiagnostics.engine.workerFastSignalMaxMs = 2.25;
  runtimeDiagnostics.engine.workerStructuralMs = 2.5;
  runtimeDiagnostics.engine.workerStructuralLastMs = 3.25;
  runtimeDiagnostics.engine.workerStructuralMaxMs = 4.5;
  runtimeDiagnostics.engine.workerPeakScanMs = 0.75;
  runtimeDiagnostics.engine.workerPeakScanLastMs = 0.9;
  runtimeDiagnostics.engine.workerPeakScanMaxMs = 1.1;
  runtimeDiagnostics.engine.workerModalResolveMs = 1.5;
  runtimeDiagnostics.engine.workerModalResolveLastMs = 1.8;
  runtimeDiagnostics.engine.workerModalResolveMaxMs = 2.2;
  runtimeDiagnostics.engine.workerProjectionMs = 3.5;
  runtimeDiagnostics.engine.workerProjectionLastMs = 4.25;
  runtimeDiagnostics.engine.workerProjectionMaxMs = 5.5;
  runtimeDiagnostics.engine.workerChromaMs = 0.5;
  runtimeDiagnostics.engine.workerChromaLastMs = 0.6;
  runtimeDiagnostics.engine.workerChromaMaxMs = 0.9;
  runtimeDiagnostics.engine.workerTempoMs = 0.25;
  runtimeDiagnostics.engine.workerTempoLastMs = 0.3;
  runtimeDiagnostics.engine.workerTempoMaxMs = 0.45;
  runtimeDiagnostics.frameDrops.framesOver16_7Ms = 13;
  runtimeDiagnostics.frameDrops.framesOver25Ms = 8;
  runtimeDiagnostics.frameDrops.framesOver33_3Ms = 5;
  runtimeDiagnostics.frameDrops.framesOver50Ms = 2;

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);

  expect(snapshot.targetFps).toBe(60);
  expect(snapshot.perfBreakdown.heavyAnalysisMs.averageMs).toBe(5);
  expect(snapshot.perfBreakdown.pipelineRenderMs.lastMs).toBe(99);
  expect(snapshot.frameDrops).toEqual({
    framesOver16_7Ms: 13,
    framesOver25Ms: 8,
    framesOver33_3Ms: 5,
    framesOver50Ms: 2,
  });
  expect(snapshot.stageAttribution.analysisCpuMs).toBe(16);
  expect(snapshot.stageAttribution.engineCpuMs).toBe(15);
  expect(snapshot.stageAttribution.controlCpuMs).toBe(55);
  expect(snapshot.stageAttribution.renderCpuMs).toBe(14);
  expect(snapshot.stageAttribution.measuredCpuMs).toBe(100);
  expect(snapshot.stageAttribution.unattributedFrameMs).toBe(0);
  expect(snapshot.stageAttribution.dominantBucket).toBe("control");
  expect(snapshot.engineCounters).toEqual({
    publishCount: 101,
    publishSkipCount: 7,
    fastSignalPatchCount: 11,
    fastSignalUpdateCount: 17,
    structuralUpdateCount: 19,
    chromaUpdateCount: 23,
    tempoUpdateCount: 29,
    workerFastSignalMs: 1.25,
    workerFastSignalLastMs: 1.5,
    workerFastSignalMaxMs: 2.25,
    workerStructuralMs: 2.5,
    workerStructuralLastMs: 3.25,
    workerStructuralMaxMs: 4.5,
    workerPeakScanMs: 0.75,
    workerPeakScanLastMs: 0.9,
    workerPeakScanMaxMs: 1.1,
    workerModalResolveMs: 1.5,
    workerModalResolveLastMs: 1.8,
    workerModalResolveMaxMs: 2.2,
    workerProjectionMs: 3.5,
    workerProjectionLastMs: 4.25,
    workerProjectionMaxMs: 5.5,
    workerChromaMs: 0.5,
    workerChromaLastMs: 0.6,
    workerChromaMaxMs: 0.9,
    workerTempoMs: 0.25,
    workerTempoLastMs: 0.3,
    workerTempoMaxMs: 0.45,
  });
  expect(snapshot.modalFreshness).toMatchObject({
    structureSignal: 0.72,
    responseEnvelope: 0.38,
    modeSlotChangeCount: 3,
  });
  expect(snapshot.modalFreshness).not.toHaveProperty("_previousModeSlots");
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

test("updateModalFreshnessDiagnostics records modal signals and slot turnover without publishing structural arrays", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.engine.snapshotAgeMs = 41;

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1000,
      sourceMode: "live",
      structureSignal: 0.24,
      energySignal: 0.36,
      changeSignal: 0.48,
      pulseSignal: 0.6,
      modalVisibilityEnergy: 0.72,
      modeCoherence: 0.84,
      activeModeCount: 9,
      activeModalFieldModeCount: 9,
      modalFieldSlots: new Float32Array([0.2, 0.3, 0.4, 0.5]),
    },
    { getWallTimeMs: () => 1234 },
  );

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1016,
      sourceMode: "live",
      sourceEvidence: {
        ownerVersion: "audio-source-evidence:v1",
        sourceKind: "system",
        analysisClass: "line-feed",
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        sourceEnergy: 0.44,
        metrics: {
          avgAmplitude: 13.25,
          analyserRms: 0.044,
          preModalFftPeak: 0.31,
          nonZeroFftBinCount: 128,
        },
        transport: {
          playing: false,
          liveInputActive: true,
          fileMuted: false,
          lineFeedProgramActive: true,
          micHardSilence: false,
        },
      },
      structureSignal: 0.28,
      energySignal: 0.4,
      changeSignal: 0.52,
      pulseSignal: 0.64,
      modalVisibilityEnergy: 0.76,
      modalObserverVisibilityEnergy: 0.29,
      modalVisibilityRetainedHighQEnergy: 0.33,
      modalPhaseAuthority: 0.24,
      highQPhaseAuthority: 0.31,
      lowQPhaseAuthority: 0.08,
      modalPhaseCoherentFieldModeCount: 4,
      modeCoherence: 0.88,
      activeModeCount: 9,
      activeModalFieldModeCount: 9,
      debug: {
        fieldState: "active",
        avgAmplitude: 13.25,
        analyserRms: 0.044,
        periodicity: 0.73,
        highQResonantModeCount: 5,
        highQResonantEnergy: 0.39,
        highQRingSupport: 0.66,
        liveInputNoiseGateActive: false,
        liveInputHardSilenceActive: false,
        resonantSignalAuthoritative: true,
        resonantSignalAuthoritativeReason: "fresh-signal",
        resonantSignalAuthoritativeCoverage: false,
        resonantSignalAuthoritativeFreshSignal: true,
        resonantSignalAuthoritativeFastAssist: false,
        resonantSignalAuthoritativeHighQ: true,
        resonantShiftReleaseOverrideCount: 2,
        resonantShiftTrackingOverrideCount: 3,
      },
      modalFieldSlots: new Float32Array([0.2, 0.45, 0.4, 0.5]),
    },
    { getWallTimeMs: () => 1250 },
  );

  updateModalEnvelopeDiagnostics(runtimeDiagnostics, {
    responseEnvelope: 0.31,
    accentEnvelope: 0.42,
    motionSignal: 0.53,
    scaleSignal: 0.64,
    bloomResponseSignal: 0.75,
  });

  expect(runtimeDiagnostics.modalFreshness).toMatchObject({
    frameTimeMs: 1016,
    sourceMode: "live",
    sourceEvidence: {
      ownerVersion: "audio-source-evidence:v1",
      sourceKind: "system",
      analysisClass: "line-feed",
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
      sourceEnergy: 0.44,
      metrics: {
        avgAmplitude: 13.25,
        analyserRms: 0.044,
        preModalFftPeak: 0.31,
        nonZeroFftBinCount: 128,
      },
      transport: {
        playing: false,
        liveInputActive: true,
        fileMuted: false,
        lineFeedProgramActive: true,
        micHardSilence: false,
      },
    },
    structuralSnapshotAgeMs: 41,
    featureFrameAgeAtRenderMs: 234,
    renderSubmittedAtMs: 1250,
    lastUpdatedAtWallTimeMs: 1250,
    structureSignal: 0.28,
    energySignal: 0.4,
    changeSignal: 0.52,
    pulseSignal: 0.64,
    modalVisibilityEnergy: 0.76,
    modalObserverVisibilityEnergy: 0.29,
    modalVisibilityRetainedHighQEnergy: 0.33,
    modalPhaseAuthority: 0.24,
    highQPhaseAuthority: 0.31,
    lowQPhaseAuthority: 0.08,
    modalPhaseCoherentFieldModeCount: 4,
    modeCoherence: 0.88,
    activeModeCount: 9,
    activeModalFieldModeCount: 9,
    fieldState: "active",
    avgAmplitude: 13.25,
    analyserRms: 0.044,
    periodicity: 0.73,
    observedResonanceModeCount: 5,
    observedResonanceEnergy: 0.39,
    highQRingSupport: 0.66,
    liveInputNoiseGateActive: false,
    liveInputHardSilenceActive: false,
    resonantSignalAuthoritative: true,
    resonantSignalAuthoritativeReason: "fresh-signal",
    resonantSignalAuthoritativeHighQ: true,
    resonantSignalAuthoritativeFreshSignal: true,
    resonantShiftReleaseOverrideCount: 2,
    resonantShiftTrackingOverrideCount: 3,
    modeSlotChangeCount: 0,
    modalFieldSlotChangeCount: 1,
    responseEnvelope: 0.31,
    accentEnvelope: 0.42,
    motionSignal: 0.53,
    scaleSignal: 0.64,
    bloomResponseSignal: 0.75,
  });
  expect(runtimeDiagnostics.modalFreshness.modeSlotMeanAbsDelta).toBeCloseTo(0);
  expect(
    runtimeDiagnostics.modalFreshness.modalFieldSlotMeanAbsDelta,
  ).toBeCloseTo(0.0375);

  const hudSnapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);
  expect(hudSnapshot.modalFreshness).toMatchObject({
    structureSignal: 0.28,
    modalObserverVisibilityEnergy: 0.29,
    modalVisibilityRetainedHighQEnergy: 0.33,
    modalPhaseAuthority: 0.24,
    highQPhaseAuthority: 0.31,
    lowQPhaseAuthority: 0.08,
    modalPhaseCoherentFieldModeCount: 4,
    featureFrameAgeAtRenderMs: 234,
    renderSubmittedAtMs: 1250,
    responseEnvelope: 0.31,
    observedResonanceModeCount: 5,
    observedResonanceEnergy: 0.39,
    highQRingSupport: 0.66,
    resonantSignalAuthoritative: true,
    resonantSignalAuthoritativeReason: "fresh-signal",
    resonantSignalAuthoritativeHighQ: true,
    modeSlotChangeCount: 0,
  });
  expect(hudSnapshot.modalFreshness).not.toHaveProperty("_previousModeSlots");
  expect(hudSnapshot.modalFreshness).not.toHaveProperty(
    "_previousModalFieldSlots",
  );
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
    expect(auditStates[0].snapshot).toEqual(expect.any(Object));
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

test("auto raymarch drops render scale before crossing the cymatic sampling floor", () => {
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
      ...createLiveRenderFrameEvidence({ injectTestTone: true }),
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

  expect(runtimeState.effectiveRaymarchSteps).toBeLessThan(64);
  expect(runtimeState.effectiveRaymarchSteps).toBeGreaterThanOrEqual(16);
  expect(getEffectiveAdaptiveRenderScale(runtimeDiagnostics, 1)).toBeLessThan(
    1,
  );
  expect(
    runtimeDiagnostics.adaptiveRaymarch.scaleStepDownCount,
  ).toBeGreaterThan(0);
});

test("max-quality keeps the requested raymarch budget under modal complexity", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: {
        qualityPreset: "max-quality",
        renderScale: 1,
      },
      effectiveFrame: {
        activeModeCount: 16,
        averageAmplitude: 255,
        structureSignal: 1,
        modalVisibilityEnergy: 1,
        modalFieldSlots: new Float32Array([
          1, 2, 3, 1.0, 1, 3, 4, 0.9, 2, 3, 4, 0.85, 2, 4, 5, 0.8, 3, 4, 5,
          0.75, 3, 5, 6, 0.7, 4, 5, 6, 0.65, 4, 6, 7, 0.6, 2, 2, 3, 0.7, 2, 3,
          3, 0.65, 3, 3, 4, 0.6, 3, 4, 4, 0.55, 4, 4, 5, 0.5, 4, 5, 5, 0.45, 5,
          5, 6, 0.4, 5, 6, 6, 0.35,
        ]),
      },
    });
  runtimeState.modalFieldCapacity = 16;
  runtimeState.modalFieldModeBuffer = {
    value: { array: new Float32Array(16 * 4) },
  };
  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 0;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  // max-quality holds the user step/scale (the ladder/cap owns them)...
  expect(runtimeState.performanceGovernor.stepScaleAdaptationActive).toBe(
    false,
  );
  expect(runtimeState.performanceGovernor.complexityScore).toBeGreaterThan(0.8);
  expect(runtimeState.performanceGovernor.proactiveStepBudget).toBe(64);
  expect(runtimeState.performanceGovernor.proactiveRenderScale).toBe(1);
  // ...but the bloom guard stays active while a raymarch frame plays.
  expect(runtimeState.performanceGovernor.bloomAdaptationActive).toBe(true);
  expect(runtimeState.performanceGovernor.bloomStrengthScale).toBeLessThan(1);
  expect(runtimeState.performanceGovernor.bloomThresholdOffset).toBeGreaterThan(
    0,
  );
  // Step budget stays above the guard floor, so bloom is not fully cut.
  expect(runtimeState.performanceGovernor.bloomAllowed).toBe(true);
  expect(runtimeState.effectiveRaymarchSteps).toBe(64);
  expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(64);
  expect(runtimeState.volumeMesh.material.steps).toBe(64);
  // The integrator budget is published to runtimeState (no governor handoff).
  expect(runtimeState.effectiveRenderScale).toBe(1);
  expect(runtimeState.raymarchBloomAdaptationActive).toBe(true);
});

test("max-quality keeps user raymarch budget and render scale under frame pressure", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: {
        qualityPreset: "max-quality",
        renderScale: 1,
      },
    });
  runtimeDiagnostics.lastFrameTimeMs = 120;
  runtimeDiagnostics.smoothedFrameTimeMs = 120;
  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale = 0;

  for (let index = 0; index < 31; index += 1) {
    updateAdaptiveRaymarchStepBudget(args);
  }

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  expect(runtimeState.performanceGovernor.stepScaleAdaptationActive).toBe(
    false,
  );
  expect(runtimeState.effectiveRaymarchSteps).toBe(64);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(64);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale).toBe(1);
  expect(getEffectiveAdaptiveRenderScale(runtimeDiagnostics, 1)).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.scaleStepDownCount).toBe(0);
});

test("auto raymarch ignores long frames caused by active UI interaction", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness();
  runtimeDiagnostics.lastFrameTimeMs = 200;
  runtimeDiagnostics.smoothedFrameTimeMs = 200;
  runtimeDiagnostics.adaptiveRaymarch.decisionFrameCount = 29;
  runtimeDiagnostics.adaptiveRaymarch.longFrameCountInWindow = 3;
  runtimeDiagnostics.uiInteraction = {
    active: true,
    suppressedAdaptivePressureFrameCount: 0,
  };

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(3);
  expect(runtimeDiagnostics.adaptiveRaymarch.currentScaleRung).toBe(2);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepDownCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.scaleStepDownCount).toBe(0);
  expect(
    runtimeDiagnostics.uiInteraction.suppressedAdaptivePressureFrameCount,
  ).toBe(1);
});

test("auto raymarch does not publish a phase rebuild cadence under frame pressure", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  runtimeDiagnostics.lastFrameTimeMs = 80;
  runtimeDiagnostics.smoothedFrameTimeMs = 32;

  updateAdaptiveRaymarchStepBudget(args);

  const removedPhaseCadenceKey = [
    "effective",
    "FieldPhaseRebuildMinIntervalSec",
  ].join("");
  expect(runtimeState).not.toHaveProperty(removedPhaseCadenceKey);
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

test("adaptive raymarch publishes the integrator budget for the runtime tick", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      effectiveFrame: {
        activeModeCount: 3,
        modalFieldSlots: new Float32Array([
          1, 1, 1, 0.8, 2, 2, 2, 0.6, 3, 3, 3, 0.4,
        ]),
        averageAmplitude: 90,
        structureSignal: 0.55,
      },
    });
  runtimeState.modalFieldCapacity = 3;
  runtimeState.modalFieldModeBuffer = {
    value: { array: new Float32Array(12) },
  };

  updateAdaptiveRaymarchStepBudget(args);

  // The integrator publishes its committed budget as plain scalars (no governor
  // handoff); the visualizer tick rebuilds the governor from them.
  expect(runtimeState.effectiveRenderScale).toBe(
    runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale,
  );
  expect(runtimeState.raymarchBloomAdaptationActive).toBe(true);
  // In auto/custom the ladder owns step/scale while bloom adaptation stays on.
  expect(runtimeState.performanceGovernor).toMatchObject({
    stepScaleAdaptationActive: false,
    bloomAdaptationActive: true,
  });
  expect(runtimeState.performanceGovernor.modalField.uploadedActiveCount).toBe(
    3,
  );
});

test("external-output custom 120 starts from the user-tunable step minimum", () => {
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

test("external-output auto starts from the balanced external baseline rung", () => {
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

test("preview custom 120 starts from the ultra target-fps baseline rung", () => {
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
    sourceCoupledColorSlots: new Float32Array([0.1, 0.8, 1, 0.9]),
    resonantColorSlots: new Float32Array([1, 0.3, 0.2, 0.7]),
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
    sourceCoupledColorSlots: analysisResult.sourceCoupledColorSlots,
    resonantColorSlots: analysisResult.resonantColorSlots,
  }));
  const { args } = createResolveFeatureFrameHarness({
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
  });

  const { effectiveFrame } = resolveFeatureFrame(
    {
      ...args,
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
  expect(effectiveFrame.sourceCoupledColorSlots[3]).toBeGreaterThan(0);
  expect(runHeavyFeatureAnalysis).toHaveBeenCalledTimes(1);
  expect(composeFeatureFrame).toHaveBeenCalledTimes(1);
  expect(frameCacheRefs.analysisSchedulerRef.current).toMatchObject({
    lastHeavyAnalysisResult: heavyAnalysis,
    lastComposedFeatureFrame: effectiveFrame,
  });
  expect(
    frameCacheRefs.analysisSchedulerRef.current.lastComposedFeatureFrame,
  ).toBe(effectiveFrame);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "bootstrap-fallback",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(
    false,
  );
});

test("resolveFeatureFrame records matching worker snapshots as fresh semantic frames", () => {
  const workerAnalysis = {
    fieldState: "active",
    activeModeCount: 4,
  };
  const featureEngine = {
    enqueueTransportFrame: vi.fn(),
    readLatestSnapshot: vi.fn(() => ({
      analysisSessionKey: "song-1",
      analysisInputsSignature: '"worker-sig"',
      analysisResult: workerAnalysis,
    })),
    getStatus: vi.fn(() => ({})),
  };
  const composeFeatureFrame = vi.fn(({ analysisResult }) => ({
    fieldState: analysisResult.fieldState,
    activeModeCount: analysisResult.activeModeCount,
  }));
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame: vi.fn(() => ({
      currentFrameAtMs: 1000,
      analysisSessionKey: "song-1",
      analysisInputsSignature: '"worker-sig"',
      silentFeatureFrame: null,
    })),
    composeFeatureFrame,
  });

  expect(result.effectiveFrame.activeModeCount).toBe(4);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "worker-snapshot",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(
    false,
  );
  expect(
    buildPerformanceHudSnapshot(args.runtimeDiagnostics).modalFreshness
      .frameSemanticSource,
  ).toBe("worker-snapshot");
});

test("resolveFeatureFrame patches current fast audio signals onto stale worker snapshots", () => {
  const workerAnalysis = {
    fieldState: "active",
    activeModeCount: 4,
    avgAmplitude: 12,
    transientEnergy: 0.1,
  };
  const currentAnalysis = {
    ...workerAnalysis,
    avgAmplitude: 72,
    transientEnergy: 0.9,
  };
  const featureEngine = {
    enqueueTransportFrame: vi.fn(),
    readLatestSnapshot: vi.fn(() => ({
      frameTimeMs: 1000,
      analysisSessionKey: "song-1",
      analysisInputsSignature: '"worker-sig"',
      analysisResult: workerAnalysis,
    })),
    getStatus: vi.fn(() => ({})),
  };
  const composeFeatureFrame = vi.fn(({ analysisResult }) => ({
    fieldState: analysisResult.fieldState,
    activeModeCount: analysisResult.activeModeCount,
    averageAmplitude: analysisResult.avgAmplitude,
    transientEnergy: analysisResult.transientEnergy,
  }));
  const buildFastSignalAnalysisResult = vi.fn(() => currentAnalysis);
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame: vi.fn(() => ({
      currentFrameAtMs: 1033,
      analysisSessionKey: "song-1",
      analysisInputsSignature: '"worker-sig"',
      silentFeatureFrame: null,
    })),
    composeFeatureFrame,
    buildFastSignalAnalysisResult,
  });

  expect(buildFastSignalAnalysisResult).toHaveBeenCalledWith({
    preparedInputs: expect.objectContaining({
      currentFrameAtMs: 1033,
    }),
    previousAnalysisResult: workerAnalysis,
  });
  expect(result.effectiveFrame).toMatchObject({
    activeModeCount: 4,
    averageAmplitude: 72,
    transientEnergy: 0.9,
  });
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "worker-fast-signal",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(
    false,
  );
});

test("resolveFeatureFrame refreshes active file playback when the worker structural snapshot is stale", () => {
  const workerAnalysis = {
    fieldState: "active",
    activeModeCount: 2,
    avgAmplitude: 12,
    staleWorker: true,
  };
  const localAnalysis = {
    fieldState: "active",
    activeModeCount: 5,
    avgAmplitude: 84,
    localCurrent: true,
  };
  const currentFrame = {
    fieldState: "active",
    activeModeCount: 5,
    localCurrent: true,
  };
  const featureEngine = {
    enqueueTransportFrame: vi.fn(),
    readLatestSnapshot: vi.fn(() => ({
      frameTimeMs: 1000,
      analysisSessionKey: "file:song-1",
      analysisInputsSignature: '"worker-sig"',
      analysisResult: workerAnalysis,
    })),
    getStatus: vi.fn(() => ({})),
  };
  const runHeavyFeatureAnalysis = vi.fn(() => localAnalysis);
  const buildFastSignalAnalysisResult = vi.fn(() => ({
    ...workerAnalysis,
    avgAmplitude: 84,
  }));
  const composeFeatureFrame = vi.fn(({ analysisResult }) =>
    analysisResult.localCurrent ? currentFrame : workerAnalysis,
  );
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    status: {
      audioInputMode: "file",
      isPlaying: true,
      isLiveInputActive: false,
      playbackSessionId: "song-1",
    },
    clockMode: "playback",
    renderLoopRefs: {
      frameCacheRefs: {
        lastLiveFrameRef: {
          current: {
            fieldState: "active",
            renderAuthority: true,
          },
        },
        lastActiveFrameRef: {
          current: {
            fieldState: "active",
            renderAuthority: true,
          },
        },
        lastIdleFrameRef: { current: null },
        analysisSchedulerRef: { current: null },
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame: vi.fn(() => ({
      currentFrameAtMs: 1080,
      analysisSessionKey: "file:song-1",
      analysisInputsSignature: '"worker-sig"',
      silentFeatureFrame: null,
    })),
    runHeavyFeatureAnalysis,
    composeFeatureFrame,
    buildFastSignalAnalysisResult,
  });

  expect(runHeavyFeatureAnalysis).toHaveBeenCalledTimes(1);
  expect(buildFastSignalAnalysisResult).not.toHaveBeenCalled();
  expect(result.effectiveFrame).toBe(currentFrame);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "local-heavy-analysis",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(
    false,
  );
});

test("resolveFeatureFrame records scheduled analysis reuse as reused semantics", () => {
  const reusedAnalysis = { fieldState: "active", reusedAnalysis: true };
  const reusedFrame = { fieldState: "active", reusedFrame: true };
  const { args } = createResolveFeatureFrameHarness({
    renderLoopRefs: {
      frameCacheRefs: {
        lastLiveFrameRef: { current: null },
        lastActiveFrameRef: { current: null },
        lastIdleFrameRef: { current: null },
        analysisSchedulerRef: {
          current: {
            lastHeavyAnalysisAtMs: 1000,
            lastAnalysisSessionKey: "song-1",
            lastAnalysisInputsSignature: '"same"',
            lastHeavyAnalysisResult: reusedAnalysis,
            lastComposedFeatureFrame: reusedFrame,
          },
        },
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame: vi.fn(() => ({
      currentFrameAtMs: 1010,
      analysisSessionKey: "song-1",
      analysisInputsSignature: '"same"',
      silentFeatureFrame: null,
    })),
    composeFeatureFrame: vi.fn(() => reusedFrame),
  });

  expect(result.effectiveFrame).toBe(reusedFrame);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "scheduled-reuse",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(false);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(true);
});

test("resolveFeatureFrame composes a source-cut frame during paused playback", () => {
  const cachedActiveFrame = {
    fieldState: "active",
    renderAuthority: true,
    stale: true,
  };
  const sourceCutFrame = {
    fieldState: "idle",
    renderAuthority: false,
    energyLedger: {
      projectedRenderEnergy: 0,
      renderEnergyEpsilon: 1e-6,
    },
    sourceEvidence: {
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
    },
  };
  const featureEngine = {
    enqueueTransportFrame: vi.fn(),
    readLatestSnapshot: vi.fn(() => ({
      analysisSessionKey: "file:song-1",
      analysisInputsSignature: '"active-before-pause"',
      analysisResult: cachedActiveFrame,
    })),
    getStatus: vi.fn(() => ({})),
  };
  const prepareFeatureFrame = vi.fn(() => ({
    currentFrameAtMs: 1000,
    analysisSessionKey: "file:song-1",
    analysisInputsSignature: '"paused-source-cut"',
    snapshot: {
      fftMagnitudes: new Float32Array(4),
      timeData: new Float32Array(4),
    },
    silentFeatureFrame: null,
  }));
  const runHeavyFeatureAnalysis = vi.fn(() => ({
    fieldState: "idle",
    renderAuthority: false,
  }));
  const composeFeatureFrame = vi.fn(() => sourceCutFrame);
  const { args } = createResolveFeatureFrameHarness({
    featureEngine,
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: "song-1",
    },
    clockMode: "paused-playback",
    renderLoopRefs: {
      frameCacheRefs: {
        lastLiveFrameRef: { current: cachedActiveFrame },
        lastActiveFrameRef: { current: cachedActiveFrame },
        lastIdleFrameRef: { current: null },
        analysisSchedulerRef: { current: null },
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame,
    runHeavyFeatureAnalysis,
    composeFeatureFrame,
  });

  expect(prepareFeatureFrame).toHaveBeenCalled();
  expect(featureEngine.enqueueTransportFrame).toHaveBeenCalled();
  expect(runHeavyFeatureAnalysis).toHaveBeenCalled();
  expect(composeFeatureFrame).toHaveBeenCalled();
  expect(result.featureFrame).toBe(sourceCutFrame);
  expect(result.effectiveFrame).toBe(sourceCutFrame);
  expect(result.effectiveFrame).toMatchObject({
    fieldState: "idle",
    renderAuthority: false,
    energyLedger: {
      projectedRenderEnergy: 0,
    },
    sourceEvidence: {
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
    },
  });
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "local-heavy-analysis",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(
    false,
  );
  expect(
    args.renderLoopRefs.frameCacheRefs.lastActiveFrameRef.current,
  ).toBeNull();
  expect(
    args.renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current,
  ).toBeNull();
});

test("resolveFeatureFrame does not fall back to cached active frames for inactive sources", () => {
  const cachedActiveFrame = {
    fieldState: "active",
    renderAuthority: true,
    stale: true,
  };
  const { args } = createResolveFeatureFrameHarness({
    featureEngine: {
      enqueueTransportFrame: vi.fn(),
      readLatestSnapshot: vi.fn(() => null),
      getStatus: vi.fn(() => ({})),
    },
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: "song-1",
    },
    clockMode: "paused-playback",
    renderLoopRefs: {
      frameCacheRefs: {
        lastLiveFrameRef: { current: cachedActiveFrame },
        lastActiveFrameRef: { current: cachedActiveFrame },
        lastIdleFrameRef: { current: null },
        analysisSchedulerRef: { current: null },
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    prepareFeatureFrame: vi.fn(() => ({
      currentFrameAtMs: 1000,
      analysisSessionKey: "file:song-1",
      analysisInputsSignature: '"paused-source-cut"',
      silentFeatureFrame: null,
    })),
  });

  expect(result.featureFrame).toBeNull();
  expect(result.effectiveFrame).toBeNull();
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

test("auto raymarch ignores field-state labels when ledger authority is present", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    effectiveFrame: {
      fieldState: "decay",
      energySignal: 0,
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

test("auto raymarch does not recover during silent playback gaps", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    effectiveFrame: {
      fieldState: "idle",
      energySignal: 0,
      sourceMode: "file",
      renderAuthority: false,
      energyLedger: {
        projectedRenderEnergy: 0,
        renderEnergyEpsilon: 1e-6,
      },
      sourceEvidence: {
        sourceBoundaryState: "zero",
        currentSourceEvidence: true,
      },
    },
  });
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(0);
});

test("auto raymarch does not recover on weak active audio", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    effectiveFrame: {
      energySignal: 0.4,
      ...createLiveRenderFrameEvidence({ projectedRenderEnergy: 0.04 }),
    },
  });
  primeAdaptiveRecoveryAttempt(runtimeDiagnostics);

  updateAdaptiveRaymarchStepBudget(args);

  assertAdaptiveRecoveryBlocked(runtimeDiagnostics, "low-render-energy");
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
  expect(preparedArgs.boundaryMode).toBe("dirichlet");
  expect(preparedArgs.cavityAcousticScale).toEqual(CAVITY_ACOUSTIC_DEFAULTS);
});

test("resolveFeatureFrame forwards Spectral Light as a presentation request", () => {
  const { args } = createResolveFeatureFrameHarness({
    spectralLightEnabled: false,
  });
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

  expect(preparedArgs.includeSpectralLight).toBe(false);
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
  expect(featureEngine.lastFrame.boundaryMode).toBe("dirichlet");
  expect(featureEngine.lastFrame.cavityAcousticScale).toEqual(
    CAVITY_ACOUSTIC_DEFAULTS,
  );
});

test("resolveFeatureFrame forwards Spectral Light into the worker transport payload", () => {
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
    spectralLightEnabled: false,
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

  expect(featureEngine.lastFrame.includeSpectralLight).toBe(false);
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
        renderAuthority: true,
        energyLedger: {
          projectedRenderEnergy: 0.08,
          renderEnergyEpsilon: 1e-6,
        },
        sourceEvidence: {
          sourceBoundaryState: "live",
          currentSourceEvidence: true,
        },
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
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "live-warmup",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(
    false,
  );
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
  const lastLiveFrame = {
    fieldState: "active",
    renderAuthority: true,
    energyLedger: {
      projectedRenderEnergy: 0.08,
      renderEnergyEpsilon: 1e-6,
    },
    sourceEvidence: {
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
    },
    preserved: true,
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
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "last-live-cache",
  );
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticFresh).toBe(false);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticReused).toBe(true);
});

test("resolveFeatureFrame does not reuse stale live cache without current source evidence", () => {
  const silentFeatureFrame = {
    fieldState: "idle",
    renderAuthority: false,
    energyLedger: {
      projectedRenderEnergy: 0,
      renderEnergyEpsilon: 1e-6,
    },
    sourceEvidence: {
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
    },
  };
  const staleActiveFrame = {
    fieldState: "active",
    renderAuthority: true,
    energyLedger: {
      projectedRenderEnergy: 0.08,
      renderEnergyEpsilon: 1e-6,
    },
    sourceEvidence: {
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
    },
  };
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
        lastLiveFrameRef: { current: staleActiveFrame },
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
        silentFeatureFrame,
      };
    },
    runHeavyFeatureAnalysis() {
      throw new Error("stale live cache should not require heavy analysis");
    },
  });

  expect(result.effectiveFrame).toBe(silentFeatureFrame);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "silent-frame",
  );
  expect(
    args.renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current,
  ).toBeNull();
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

test("resolveRaymarchGovernorFrameInputs prefers uploaded mode count over descriptor span", () => {
  const runtimeState = {
    modalFieldCapacity: 12,
    modalBasisCache: { basisCapacity: 12 },
    modalFieldModeBuffer: { value: { array: new Float32Array(48) } },
    uniforms: {
      uModalFieldModeCount: { value: 3 },
      uTotalSlotAmplitude: { value: 0.42 },
    },
  };
  const effectiveFrame = {
    activeModeCount: 48,
    modalDescriptor: { counts: { modalFieldModeCount: 48 } },
  };

  expect(
    resolveRaymarchGovernorFrameInputs(runtimeState, effectiveFrame),
  ).toEqual({
    modalFieldCapacity: 12,
    productUploadCapacity: 12,
    activeModeCount: 3,
    uploadedModeCount: 3,
  });
});

test("syncAdaptiveRenderSurfacePixelRatio applies adaptive render scale to DPR", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale = 0.67;
  const gl = {
    setPixelRatioCalls: [],
    setPixelRatio(value) {
      this.setPixelRatioCalls.push(value);
    },
  };
  const pixelRatioRef = { current: 1 };

  const targetPixelRatio = syncAdaptiveRenderSurfacePixelRatio({
    gl,
    renderLoopRefs: { pixelRatioRef },
    runtimeDiagnostics,
    renderProfile: { qualityPreset: "auto" },
    controls: {},
    status: { isPlaying: true },
    requestedRenderScale: 1,
    basePixelRatio: 2,
  });

  expect(targetPixelRatio).toBeCloseTo(1.34);
  expect(pixelRatioRef.current).toBeCloseTo(1.34);
  expect(gl.setPixelRatioCalls).toEqual([1.34]);
});

test("syncUploadedRenderQuantities mirrors runtime uniforms into diagnostics", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  syncUploadedRenderQuantities(runtimeDiagnostics, {
    uniforms: {
      uModalFieldModeCount: { value: 5 },
      uTotalSlotAmplitude: { value: 0.18 },
    },
  });

  expect(runtimeDiagnostics.render.uploadedModeCount).toBe(5);
  expect(runtimeDiagnostics.render.totalSlotAmplitude).toBeCloseTo(0.18);
  expect(runtimeDiagnostics.modalFreshness.uploadedModeCount).toBe(5);
  expect(runtimeDiagnostics.modalFreshness.totalSlotAmplitude).toBeCloseTo(
    0.18,
  );
});
