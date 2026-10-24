import { createAudioFeaturePacketFixture } from "../../../../engine/src/testing/audioFeaturePacketFixture.js";
import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createRuntimeDiagnostics,
  resetAdaptiveRaymarchControllerState,
} from "./baryonEngineRuntimeState.js";
import { syncLiveInputRuntimeStatus } from "./liveInputRuntimeSync.js";
import {
  buildPerformanceHudSnapshot,
  consumeRenderFramePacerSlot,
  createAuditSnapshotNotifier,
  createRenderFramePacerState,
  finalizeTerminalVisualIdleState,
  getRenderTargetPixelRatio,
  publishDevtoolsSnapshots,
  recordCompletedRenderFrame,
  resolveRenderSurfaceOutputControls,
  shouldBypassTemporalHistoryForRaymarchFrame,
  updateModalFreshnessDiagnostics,
  updateRendererDiagnostics,
  updateAdaptiveRaymarchStepBudget,
  resolveRaymarchFieldAnalysisFrameInputs,
  syncRenderSurfacePixelRatio,
  syncUploadedRenderQuantities,
} from "./baryonEngineRenderLoop.js";
import {
  DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
  DEFAULT_PERFORMANCE_TARGET_FPS,
  isAdaptivePerformanceProfile,
  MIN_PRESENTATION_RAYMARCH_STEPS,
  RENDER_CONTEXTS,
} from "@baryon/engine/render/outputPipeline";
import { createRendererFeatureView } from "@baryon/engine/audio-features";
import {
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
} from "../../context/liveInputRuntimeStatus.js";

test("preview surfaces composite transparent output onto black before SMAA", () => {
  const controls = {
    outputMode: "transparent",
    outputBackgroundColor: "#ffffff",
    smaaEnabled: true,
  };

  expect(
    resolveRenderSurfaceOutputControls(controls, {
      renderContext: RENDER_CONTEXTS.preview,
    }),
  ).toEqual({
    outputMode: "opaque",
    outputBackgroundColor: "#000000",
    smaaEnabled: true,
  });
  expect(controls.outputMode).toBe("transparent");
});

test("external output retains the requested transparent compositor path", () => {
  const controls = {
    outputMode: "transparent",
    outputBackgroundColor: "#ffffff",
    smaaEnabled: true,
  };

  expect(
    resolveRenderSurfaceOutputControls(controls, {
      renderContext: RENDER_CONTEXTS.externalOutput,
    }),
  ).toBe(controls);
});

test("surface-owned transparency remains transparent in a preview context", () => {
  const controls = {
    outputBackgroundColor: "#ffffff",
    smaaEnabled: true,
  };

  expect(
    resolveRenderSurfaceOutputControls(
      controls,
      { renderContext: RENDER_CONTEXTS.preview },
      { outputMode: "transparent" },
    ),
  ).toEqual({
    outputMode: "transparent",
    outputBackgroundColor: "#ffffff",
    smaaEnabled: true,
  });
  expect(Object.hasOwn(controls, "outputMode")).toBe(false);
});

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

const fixture = createAudioFeaturePacketFixture();
const canonicalFrame = createRendererFeatureView(fixture.model());
function createLiveRenderFrameEvidence() {
  return canonicalFrame;
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
  const resolvedRenderProfile = {
    qualityPreset: "auto",
    ...renderProfile,
  };
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.lastFrameTimeMs = 14;
  runtimeDiagnostics.smoothedFrameTimeMs = 14;
  const adaptiveRaymarchController = {
    ...runtimeDiagnostics.adaptiveRaymarch,
    adaptiveRaymarchActive: true,
    requestedRaymarchSteps: 64,
    currentRung: 3,
    controllerLastFrameTimeMs: 14,
    controllerSmoothedFrameTimeMs: 14,
  };
  const profileAllowsAdaptiveRaymarch = isAdaptivePerformanceProfile(
    resolvedRenderProfile.qualityPreset,
  );

  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    adaptiveRaymarchController,
    adaptiveRaymarchInitializationInputs: {
      requestedStepBudget: resolvedControls.raymarchSteps,
      profileAllowsAdaptiveRaymarch,
      targetFps:
        resolvedRenderProfile.targetFps ??
        resolvedControls.customTargetFps ??
        DEFAULT_PERFORMANCE_TARGET_FPS,
      startupStepBudget: profileAllowsAdaptiveRaymarch
        ? (resolvedRenderProfile.startupRaymarchSteps ??
          DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS)
        : null,
    },
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
    adaptiveRaymarchController,
    args: {
      controls: resolvedControls,
      runtime: {
        method: "raymarch",
        ...runtime,
      },
      runtimeState,
      renderProfile: resolvedRenderProfile,
      effectiveFrame: {
        ...canonicalFrame,
        ...createLiveRenderFrameEvidence({
          injectTestTone: resolvedControls.injectTestTone,
        }),
        ...effectiveFrame,
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        sourceSession: createFileSourceSession(),
        playbackSessionId: "song-1",
        ...status,
      },
      runtimeDiagnostics,
    },
  };
}

function createFileSourceSession(overrides = {}) {
  return {
    kind: "file",
    phase: "active",
    sessionId: "source-1",
    timelineRevision: 0,
    ...overrides,
  };
}

function primeAdaptiveRecoveryAttempt(adaptiveRaymarchController) {
  adaptiveRaymarchController.currentRung = 0;
  adaptiveRaymarchController.decisionFrameCount = 29;
  adaptiveRaymarchController.stableWindowCount = 3;
}

function assertAdaptiveRecoveryBlocked(runtimeDiagnostics, blockedReason) {
  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.stableWindowCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(false);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    blockedReason,
  );
}

test("live status publishes actual readiness transitions once, including a missing first model", () => {
  const setter = createSetterCapture(),
    refs = { lastLiveInputRuntimeStatusRef: { current: null } };
  const args = {
    status: {
      isLiveInputActive: true,
      sourceSession: { kind: "system", sessionId: 7 },
    },
    featureFrame: null,
    liveInputUiState: "active",
    liveInputErrorCode: "none",
    setLiveInputRuntimeStatus: setter.set,
    renderLoopRefs: refs,
  };
  expect(syncLiveInputRuntimeStatus(args)).toMatchObject({
    phase: "listening",
    observationAvailable: false,
  });
  syncLiveInputRuntimeStatus(args);
  expect(setter.callCount).toBe(1);
  args.featureFrame = canonicalFrame;
  expect(syncLiveInputRuntimeStatus(args).phase).toBe("listening");
  syncLiveInputRuntimeStatus(args);
  expect(setter.callCount).toBe(2);
  args.featureRuntimeStatus = { state: "failed" };
  args.featureFrame = null;
  expect(syncLiveInputRuntimeStatus(args)).toMatchObject({
    phase: "error",
    errorCode: "processing-failed",
  });
  expect(setter.callCount).toBe(3);
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
        suppressPlaybackTelemetry: false,
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
      getRequestedPixelRatio: () => 1,
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
  expect(runtimeDiagnosticsRef.current.renderSurface).toEqual({
    cssWidth: 2538,
    cssHeight: 1536,
    backingWidth: 2538,
    backingHeight: 1536,
    backingMegapixels: 3.898368,
    pixelRatio: 1,
  });
});

test("updateRendererDiagnostics records the backing-pixel cost for high-DPR canvases", () => {
  const runtimeDiagnosticsRef = {
    current: createRuntimeDiagnostics(),
  };
  const pixelRatioRef = { current: 1 };
  const renderSurfaceSizeRef = { current: null };
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
          width: 1504,
          height: 830,
        },
      },
      controls: {
        suppressPlaybackTelemetry: false,
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
      getRequestedPixelRatio: () => 2,
    },
  );

  expect(gl.setPixelRatioCalls).toEqual([2]);
  expect(runtimeDiagnosticsRef.current.renderSurface).toEqual({
    cssWidth: 1504,
    cssHeight: 830,
    backingWidth: 3008,
    backingHeight: 1660,
    backingMegapixels: 4.99328,
    pixelRatio: 2,
  });
});

test("animation callbacks cannot count as completed frames, including an external-authority hold", () => {
  const runtimeDiagnosticsRef = {
    current: createRuntimeDiagnostics(),
  };
  const renderLoopRefs = {
    runtimeDiagnosticsRef,
    pixelRatioRef: { current: 1 },
    renderSurfaceSizeRef: { current: null },
    lastAudioIssueSignatureRef: { current: null },
  };
  const gl = {
    backend: { isWebGLBackend: false },
    setPixelRatio() {},
    setSize() {},
  };
  const baseArgs = {
    state: {
      size: {
        width: 1920,
        height: 1080,
      },
    },
    controls: {
      suppressPlaybackTelemetry: false,
    },
    status: null,
    time: 0,
    deltaTime: 1 / 60,
    gl,
    renderLoopRefs,
  };

  const firstResult = updateRendererDiagnostics(
    {
      ...baseArgs,
      rfDelta: 1 / 60,
    },
    {
      getRequestedPixelRatio: () => 1,
    },
  );
  updateRendererDiagnostics(
    {
      ...baseArgs,
      time: 1,
      rfDelta: 0.1,
    },
    {
      getRequestedPixelRatio: () => 1,
    },
  );

  expect(firstResult.suppressPlaybackTelemetryActive).toBe(false);
  expect(runtimeDiagnosticsRef.current.activeFrameCount).toBe(0);
  expect(buildPerformanceHudSnapshot(runtimeDiagnosticsRef.current).fps).toBe(
    0,
  );
  expect(runtimeDiagnosticsRef.current.lastLongFrame).toBeNull();
  expect(runtimeDiagnosticsRef.current.lastPlaybackIssue).toBeNull();
});

test("updateRendererDiagnostics keeps telemetry suppression from lowering DPR", () => {
  const runtimeDiagnosticsRef = {
    current: createRuntimeDiagnostics(),
  };
  const pixelRatioRef = { current: 1 };
  const renderSurfaceSizeRef = { current: null };
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

  const result = updateRendererDiagnostics(
    {
      state: {
        size: {
          width: 1920,
          height: 1080,
        },
      },
      controls: {
        suppressPlaybackTelemetry: true,
      },
      status: {
        isPlaying: true,
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
      getRequestedPixelRatio: () => 2,
    },
  );

  expect(result.suppressPlaybackTelemetryActive).toBe(true);
  expect(gl.setPixelRatioCalls).toEqual([2]);
  expect(pixelRatioRef.current).toBe(2);
  expect(runtimeDiagnosticsRef.current.currentPixelRatio).toBe(2);
  expect(runtimeDiagnosticsRef.current.renderSurface.pixelRatio).toBe(2);
});

test("render target DPR follows the selected output resolution", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      devicePixelRatio: 3,
    },
  });

  try {
    expect(getRenderTargetPixelRatio()).toBe(3);
    expect(getRenderTargetPixelRatio(1)).toBe(1);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "window", originalDescriptor);
    } else {
      delete globalThis.window;
    }
  }
});

// `true` means flush temporal history (show the crisp scene color); `false`
// means let TRAA accumulate.
test("shouldBypassTemporalHistoryForRaymarchFrame is method-aware", () => {
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "raymarch",
      featureFrame: null,
      traaRequested: false,
    }),
  ).toBe(false);

  // Authorized raymarch frames accumulate while the field is driven and flush
  // when the field is idle so a paused 3D volume cannot freeze stale history.
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
        traaRequested: true,
      }),
    ).toBe(false);
  }
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "raymarch",
      featureFrame: { fieldState: "idle", energySignal: 0 },
      traaRequested: true,
    }),
  ).toBe(true);

  // Non-raymarch-pipeline methods never engage the temporal bypass.
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "cymatics-2d",
      featureFrame: { fieldState: "active" },
      traaRequested: true,
    }),
  ).toBe(false);
});

test("shouldBypassTemporalHistoryForRaymarchFrame accumulates stable and moving raymarch frames", () => {
  expect(
    shouldBypassTemporalHistoryForRaymarchFrame({
      runtimeMethod: "raymarch",
      featureFrame: {
        ...createLiveRenderFrameEvidence(),
        fieldState: "active",
        energySignal: 0.8,
      },
      sceneSnapshot: { angularVelocity: 0, pitchVelocity: 0, rollVelocity: 0 },
      traaRequested: true,
    }),
  ).toBe(false);

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
      traaRequested: true,
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
        traaRequested: true,
      }),
    ).toBe(false);
    expect(
      shouldBypassTemporalHistoryForRaymarchFrame({
        runtimeMethod: "raymarch",
        featureFrame: { fieldState: "idle", energySignal },
        traaRequested: true,
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

test("buildPerformanceHudSnapshot exports stage attribution, engine counters, and raw perf breakdown", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.smoothedFrameTimeMs = 20;
  runtimeDiagnostics.render.targetFps = 60;
  runtimeDiagnostics.modalFreshness.familyCount = 85;
  runtimeDiagnostics.modalFreshness.responseEnvelope = 0.38;
  runtimeDiagnostics.perfBreakdown.readFeatureModelMs.averageMs = 1;
  runtimeDiagnostics.perfBreakdown.createRendererFeatureViewMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.applyCachedControlSnapshotsMs.averageMs = 9;
  runtimeDiagnostics.perfBreakdown.syncLiveInputRuntimeStatusMs.averageMs = 10;
  runtimeDiagnostics.perfBreakdown.runtimeTickMs.averageMs = 11;
  runtimeDiagnostics.perfBreakdown.applySceneControlsMs.averageMs = 13;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.averageMs = 14;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.lastMs = 99;
  Object.assign(runtimeDiagnostics.engine, {
    latestAcceptedFrameId: 101,
    latestObservationAgeMs: 8,
    sourceGeneration: 3,
    workerGeneration: 5,
    topologyRevision: 7,
    workerProcessingMs: 1.25,
    queueDepth: 1,
    state: "ready",
    reason: "observation-accepted",
  });
  runtimeDiagnostics.renderSurface.cssWidth = 1504;
  runtimeDiagnostics.renderSurface.cssHeight = 830;
  runtimeDiagnostics.renderSurface.backingWidth = 3008;
  runtimeDiagnostics.renderSurface.backingHeight = 1660;
  runtimeDiagnostics.renderSurface.backingMegapixels = 4.99328;
  runtimeDiagnostics.renderSurface.pixelRatio = 2;
  runtimeDiagnostics.render.modalVarietyAudit = {
    publishedModeCount: 52,
    modalDescriptorModeCapacity: 160,
    modalDescriptorCapacityPressure: 52 / 160,
    energyEffectiveModeCount: 7.4,
    publishedModalEnergyRatio: 0.91,
  };
  runtimeDiagnostics.frameDrops.framesOver16_7Ms = 13;
  runtimeDiagnostics.frameDrops.framesOver25Ms = 8;
  runtimeDiagnostics.frameDrops.framesOver33_3Ms = 5;
  runtimeDiagnostics.frameDrops.framesOver50Ms = 2;

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);

  expect(snapshot.targetFps).toBe(60);
  expect(snapshot.perfBreakdown.readFeatureModelMs.averageMs).toBe(1);
  expect(snapshot.perfBreakdown.pipelineRenderMs.lastMs).toBe(99);
  expect(snapshot.frameDrops).toEqual({
    framesOver16_7Ms: 13,
    framesOver25Ms: 8,
    framesOver33_3Ms: 5,
    framesOver50Ms: 2,
  });
  expect(snapshot.stageAttribution.analysisCpuMs).toBe(0);
  expect(snapshot.stageAttribution.engineCpuMs).toBe(5);
  expect(snapshot.stageAttribution.controlCpuMs).toBe(43);
  expect(snapshot.stageAttribution.renderCpuMs).toBe(14);
  expect(snapshot.stageAttribution.measuredCpuMs).toBe(62);
  expect(snapshot.stageAttribution.unattributedFrameMs).toBe(0);
  expect(snapshot.stageAttribution.dominantBucket).toBe("control");
  expect(snapshot.engineCounters).toEqual(runtimeDiagnostics.engine);
  expect(snapshot.engineCounters).not.toHaveProperty("workerGoertzelMs");
  expect(snapshot.engineCounters.workerProcessingMs).toBe(1.25);
  expect(snapshot.renderSurface).toEqual({
    cssWidth: 1504,
    cssHeight: 830,
    backingWidth: 3008,
    backingHeight: 1660,
    backingMegapixels: 4.99328,
    pixelRatio: 2,
  });
  expect(snapshot.modalVarietyAudit).toEqual({
    publishedModeCount: 52,
    modalDescriptorModeCapacity: 160,
    modalDescriptorCapacityPressure: 52 / 160,
    energyEffectiveModeCount: 7.4,
    publishedModalEnergyRatio: 0.91,
  });
  expect(snapshot.modalFreshness).toMatchObject({
    familyCount: 85,
    responseEnvelope: 0.38,
  });
  expect(snapshot.modalFreshness).not.toHaveProperty("_previousModeSlots");
});

test("buildPerformanceHudSnapshot uses deterministic dominant-bucket tie breaks", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.smoothedFrameTimeMs = 10;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.readFeatureModelMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.runtimeTickMs.averageMs = 4;

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);

  expect(snapshot.stageAttribution.analysisCpuMs).toBe(0);
  expect(snapshot.stageAttribution.engineCpuMs).toBe(4);
  expect(snapshot.stageAttribution.controlCpuMs).toBe(4);
  expect(snapshot.stageAttribution.renderCpuMs).toBe(4);
  expect(snapshot.stageAttribution.unattributedFrameMs).toBe(0);
  expect(snapshot.stageAttribution.dominantBucket).toBe("render");
});

test("buildPerformanceHudSnapshot preserves precise fps from smoothed frame time", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.smoothedFrameTimeMs = 1000 / 59.94;

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);

  expect(snapshot.fps).toBeCloseTo(59.94, 10);
  expect(snapshot.fps).not.toBe(Math.round(snapshot.fps));
});

test("HUD cadence counts completed frames rather than skipped 120 Hz callbacks", () => {
  const diagnostics = createRuntimeDiagnostics();
  const record = (completedAtMs) =>
    recordCompletedRenderFrame(diagnostics, {
      completedAtMs,
      time: completedAtMs / 1000,
      status: { isPlaying: true },
    });
  record(100);
  expect(buildPerformanceHudSnapshot(diagnostics).fps).toBe(0);
  // Two animation callbacks per completed frame: the HUD must report 60.
  for (let i = 1; i <= 12; i++) record(100 + (i * 1000) / 60);
  expect(buildPerformanceHudSnapshot(diagnostics).fps).toBeCloseTo(60, 8);
  expect(diagnostics.activeFrameCount).toBe(12);
  expect(diagnostics.averageFrameTimeMs).toBeCloseTo(1000 / 60, 8);
  const before = structuredClone(diagnostics);
  for (const invalid of [300, 200, NaN, Infinity]) record(invalid);
  expect(diagnostics).toEqual(before);
});

test("completed-frame stalls update drop counters and resets discard old timing", () => {
  const diagnostics = createRuntimeDiagnostics();
  recordCompletedRenderFrame(diagnostics, { completedAtMs: 100, time: 0 });
  recordCompletedRenderFrame(diagnostics, { completedAtMs: 180, time: 0.08 });
  expect(diagnostics.lastFrameTimeMs).toBe(80);
  expect(diagnostics.longFrameCount).toBe(1);
  expect(diagnostics.frameDrops.framesOver50Ms).toBe(1);
  expect(diagnostics.lastLongFrame).toMatchObject({ playbackSessionId: null });
  const reset = createRuntimeDiagnostics();
  recordCompletedRenderFrame(reset, { completedAtMs: 500, time: 0.4 });
  expect(buildPerformanceHudSnapshot(reset).fps).toBe(0);
});

test("createAuditSnapshotNotifier collapses repeated disabled notifications", () => {
  const received = [];
  const notify = createAuditSnapshotNotifier((nextState) => {
    received.push(nextState);
  });

  notify({ enabled: false, snapshot: null });
  notify({ enabled: false, snapshot: null });
  notify({ enabled: false, snapshot: null });

  expect(received).toHaveLength(1);
  expect(received[0]).toStrictEqual({ enabled: false, snapshot: null });

  const firstEnabledSnapshot = { enabled: true, snapshot: { frame: 1 } };
  const secondEnabledSnapshot = { enabled: true, snapshot: { frame: 2 } };
  notify(firstEnabledSnapshot);
  notify(secondEnabledSnapshot);

  expect(received).toHaveLength(3);
  expect(received[1]).toBe(firstEnabledSnapshot);
  expect(received[2]).toBe(secondEnabledSnapshot);

  notify({ enabled: false, snapshot: null });
  notify({ enabled: false, snapshot: null });

  expect(received).toHaveLength(4);
  expect(received[3]).toStrictEqual({ enabled: false, snapshot: null });
});

test("consumeRenderFramePacerSlot renders every other tick at double the target rate", () => {
  const pacerState = createRenderFramePacerState();
  const rendered = [];
  // 120Hz ticks against a 60fps budget.
  for (let tick = 0; tick < 8; tick += 1) {
    const nowMs = tick * (1000 / 120);
    if (consumeRenderFramePacerSlot(pacerState, 60, nowMs)) {
      rendered.push(tick);
    }
  }

  expect(rendered).toEqual([0, 2, 4, 6]);
});

test("consumeRenderFramePacerSlot renders every tick at the target rate", () => {
  const pacerState = createRenderFramePacerState();
  // 60Hz ticks with realistic jitter against a 60fps budget.
  const tickTimesMs = [0, 16.6, 33.4, 50.0, 66.7];
  const decisions = tickTimesMs.map((nowMs) =>
    consumeRenderFramePacerSlot(pacerState, 60, nowMs),
  );

  expect(decisions).toEqual([true, true, true, true, true]);
});

test("consumeRenderFramePacerSlot rebases after a stall instead of bursting", () => {
  const pacerState = createRenderFramePacerState();
  expect(consumeRenderFramePacerSlot(pacerState, 60, 0)).toBe(true);
  // A 100ms stall: the next tick renders once, then pacing resumes from now.
  expect(consumeRenderFramePacerSlot(pacerState, 60, 100)).toBe(true);
  expect(consumeRenderFramePacerSlot(pacerState, 60, 108.3)).toBe(false);
  expect(consumeRenderFramePacerSlot(pacerState, 60, 116.7)).toBe(true);
});

test("consumeRenderFramePacerSlot passes through without a finite fps budget", () => {
  const pacerState = createRenderFramePacerState();
  expect(consumeRenderFramePacerSlot(pacerState, null, 0)).toBe(true);
  expect(consumeRenderFramePacerSlot(pacerState, null, 1)).toBe(true);
  expect(consumeRenderFramePacerSlot(pacerState, 0, 2)).toBe(true);
  expect(consumeRenderFramePacerSlot(pacerState, Number.NaN, 3)).toBe(true);
});

test("createAuditSnapshotNotifier returns null without a listener", () => {
  expect(createAuditSnapshotNotifier(null)).toBeNull();
  expect(createAuditSnapshotNotifier(undefined)).toBeNull();
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
  const logAudit = vi.fn();
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
        suppressPlaybackTelemetryActive: false,
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
        logAudit,
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
    expect(logAudit).not.toHaveBeenCalled();
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

test("auto raymarch steps down presentation integration before changing any upstream field", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.lastFrameTimeMs = 19.2;
  runtimeDiagnostics.smoothedFrameTimeMs = 19.2;
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
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
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
});

test("max-quality preserves the complete basis and requested presentation budget", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: { qualityPreset: "max-quality" },
    });
  const observation = args.effectiveFrame.observation;
  updateAdaptiveRaymarchStepBudget(args);
  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  expect(runtimeState.effectiveRaymarchSteps).toBe(64);
  expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(64);
  expect(args.effectiveFrame.observation).toBe(observation);
  expect(args.effectiveFrame.topology.familyCount).toBe(85);
  expect(runtimeState).not.toHaveProperty("raymarchFieldAnalysis");
});

test("max-quality keeps user raymarch budget under frame pressure", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: {
        qualityPreset: "max-quality",
        targetFps: 240,
      },
    });
  runtimeDiagnostics.lastFrameTimeMs = 120;
  runtimeDiagnostics.smoothedFrameTimeMs = 120;
  for (let index = 0; index < 31; index += 1) {
    updateAdaptiveRaymarchStepBudget(args);
  }

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch.targetFps).toBe(60);
  expect(runtimeState).not.toHaveProperty("stepScaleAdaptationActive");
  expect(runtimeState.effectiveRaymarchSteps).toBe(64);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(64);
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
});

test("auto raymarch lowers steps without publishing adaptive render-scale state", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  runtimeDiagnostics.lastFrameTimeMs = 120;
  runtimeDiagnostics.smoothedFrameTimeMs = 120;
  runtimeState.adaptiveRaymarchController.currentRung = 3;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 29;
  runtimeState.adaptiveRaymarchController.longFrameCountInWindow = 3;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBeLessThan(3);
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
  expect(
    "renderScaleStepDownCount" in runtimeDiagnostics.adaptiveRaymarch,
  ).toBe(false);
});

test("auto raymarch holds the numerical presentation floor without render-scale stepdown state", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  runtimeDiagnostics.lastFrameTimeMs = 120;
  runtimeDiagnostics.smoothedFrameTimeMs = 120;
  runtimeState.adaptiveRaymarchController.currentRung = 0;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 29;
  runtimeState.adaptiveRaymarchController.longFrameCountInWindow = 3;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
  expect(
    "renderScaleStepDownCount" in runtimeDiagnostics.adaptiveRaymarch,
  ).toBe(false);
});

test("auto raymarch normalizes stale throttled steps to the observation floor across inactive frames", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        raymarchSteps: 72,
      },
    });
  runtimeState.adaptiveRaymarchController.requestedRaymarchSteps = 72;
  runtimeState.adaptiveRaymarchController.effectiveRaymarchSteps = 16;
  runtimeState.adaptiveRaymarchController.currentRung = 0;
  runtimeState.effectiveRaymarchSteps = 16;
  runtimeState.uniforms.uRaymarchSteps.value = 16;
  runtimeState.volumeMesh.material.steps = 16;

  const effectiveStepBudget = updateAdaptiveRaymarchStepBudget({
    ...args,
    effectiveFrame: {
      ...args.effectiveFrame,
      activeModeCount: 0,
      renderAuthority: false,
    },
  });

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  expect(effectiveStepBudget).toBe(MIN_PRESENTATION_RAYMARCH_STEPS);
  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect("currentRenderScaleRung" in runtimeDiagnostics.adaptiveRaymarch).toBe(
    false,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
  expect(runtimeState.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeState.volumeMesh.material.steps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeState).not.toHaveProperty("effectiveStepBudget");
  expect(runtimeState).not.toHaveProperty("effectiveRenderScale");
});

test("auto raymarch recovers steps without scale ladder state", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  runtimeDiagnostics.lastFrameTimeMs = 10;
  runtimeDiagnostics.smoothedFrameTimeMs = 10;
  runtimeState.adaptiveRaymarchController.currentRung = 0;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 29;
  runtimeState.adaptiveRaymarchController.stableWindowCount = 3;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(1);
  expect("currentRenderScaleRung" in runtimeDiagnostics.adaptiveRaymarch).toBe(
    false,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
  expect("renderScaleStepUpCount" in runtimeDiagnostics.adaptiveRaymarch).toBe(
    false,
  );
});

test("auto raymarch ignores long frames caused by active UI interaction", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  runtimeDiagnostics.lastFrameTimeMs = 200;
  runtimeDiagnostics.smoothedFrameTimeMs = 200;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 29;
  runtimeState.adaptiveRaymarchController.longFrameCountInWindow = 3;
  runtimeDiagnostics.uiInteraction = {
    active: true,
    suppressedAdaptivePressureFrameCount: 0,
  };

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(3);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepDownCount).toBe(0);
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

test("custom profile uses the selected target FPS for adaptive tuning", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
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
      customTargetFps: 48,
    },
    runtime: {
      method: "raymarch",
    },
    runtimeState,
    renderProfile: {
      qualityPreset: "custom",
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

test("custom controls fallback owns adaptive tuning when profile target is absent", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        customTargetFps: 48,
      },
      renderProfile: {
        qualityPreset: "custom",
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  resetAdaptiveRaymarchControllerState(runtimeState);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.targetFps).toBe(48);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
  );
});

test("custom render profile owns adaptive tuning before controls fallback", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    controls: {
      customTargetFps: 48,
    },
    renderProfile: {
      qualityPreset: "custom",
      targetFps: 120,
      renderContext: RENDER_CONTEXTS.externalOutput,
    },
  });

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.targetFps).toBe(120);
  expect(runtimeDiagnostics.adaptiveRaymarch.targetFrameTimeMs).toBe(
    1000 / 120,
  );
});

test("adaptive raymarch exposes complete family/shell counts without a capacity selector", () => {
  const { args, runtimeState } = createAdaptiveRaymarchHarness();
  updateAdaptiveRaymarchStepBudget(args);
  expect(
    resolveRaymarchFieldAnalysisFrameInputs(runtimeState, args.effectiveFrame),
  ).toEqual({ familyCount: 85, shellCount: 59, uploadedFamilyCount: 0 });
  expect(runtimeState).not.toHaveProperty("raymarchFieldAnalysis");
});

test("external-output custom 120 cannot start below the presentation integration floor", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        customTargetFps: 120,
      },
      renderProfile: {
        qualityPreset: "custom",
        targetFps: 120,
        startupRaymarchSteps: 16,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  resetAdaptiveRaymarchControllerState(runtimeState);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeState.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
});

test("external-output auto honors its presentation-only startup budget", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: {
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: 32,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  resetAdaptiveRaymarchControllerState(runtimeState);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
});

test("external-output auto uses the resolved profile target FPS for adaptive tuning", () => {
  const { args, runtimeDiagnostics } = createAdaptiveRaymarchHarness({
    renderProfile: {
      qualityPreset: "auto",
      targetFps: 60,
      renderContext: RENDER_CONTEXTS.externalOutput,
    },
  });

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.targetFps).toBe(60);
  expect(runtimeDiagnostics.adaptiveRaymarch.targetFrameTimeMs).toBe(1000 / 60);
});

test("external-output auto startup steps cannot under-sample the observed field", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: {
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: 16,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  resetAdaptiveRaymarchControllerState(runtimeState);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
});

test("preview custom 120 cannot start below the presentation integration floor", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        customTargetFps: 120,
      },
      renderProfile: {
        qualityPreset: "custom",
        targetFps: 120,
        startupRaymarchSteps: 16,
        renderContext: RENDER_CONTEXTS.preview,
      },
    });

  resetAdaptiveRaymarchControllerState(runtimeState);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
});

test.each([
  ["auto", DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS],
  ["custom", MIN_PRESENTATION_RAYMARCH_STEPS],
])(
  "entering %s from max quality restarts at its calibrated rung when the requested cap is unchanged",
  (qualityPreset, startupRaymarchSteps) => {
    const { args, runtimeState, runtimeDiagnostics } =
      createAdaptiveRaymarchHarness({
        controls: {
          raymarchSteps: 64,
        },
        renderProfile: {
          qualityPreset: "max-quality",
          renderContext: RENDER_CONTEXTS.externalOutput,
        },
      });

    updateAdaptiveRaymarchStepBudget(args);
    expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(64);

    args.renderProfile = {
      qualityPreset,
      targetFps: qualityPreset === "custom" ? 120 : 60,
      startupRaymarchSteps,
      renderContext: RENDER_CONTEXTS.externalOutput,
    };
    updateAdaptiveRaymarchStepBudget(args);

    expect(runtimeState.effectiveRaymarchSteps).toBe(startupRaymarchSteps);
    expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
      startupRaymarchSteps,
    );
  },
);

test("adaptive initialization responds only to controller-relevant profile inputs", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: { raymarchSteps: 64 },
      renderProfile: {
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
        bloomAllowed: true,
      },
    });

  runtimeState.adaptiveRaymarchController.currentRung = 1;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 2;
  args.renderProfile = { ...args.renderProfile, bloomAllowed: false };
  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.decisionFrameCount).toBe(3);

  args.renderProfile = {
    ...args.renderProfile,
    qualityPreset: "custom",
    targetFps: 120,
    startupRaymarchSteps: MIN_PRESENTATION_RAYMARCH_STEPS,
  };
  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.decisionFrameCount).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeState.adaptiveRaymarchInitializationInputs).toMatchObject({
    targetFps: 120,
    startupStepBudget: MIN_PRESENTATION_RAYMARCH_STEPS,
  });
});

test("stable adaptive profile and cap frames preserve the committed rung", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        raymarchSteps: 64,
      },
      renderProfile: {
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  updateAdaptiveRaymarchStepBudget(args);
  runtimeState.adaptiveRaymarchController.currentRung = 1;
  runtimeState.adaptiveRaymarchController.stepDownCount = 5;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 2;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepDownCount).toBe(5);
  expect(runtimeDiagnostics.adaptiveRaymarch.decisionFrameCount).toBe(3);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(20);
});

test("mirrored adaptive diagnostics and frame timing cannot reset controller state", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        raymarchSteps: 64,
      },
      renderProfile: {
        qualityPreset: "auto",
        targetFps: 60,
        startupRaymarchSteps: DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  updateAdaptiveRaymarchStepBudget(args);
  runtimeState.adaptiveRaymarchController.currentRung = 1;
  runtimeState.adaptiveRaymarchController.stepDownCount = 5;
  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 0;
  runtimeDiagnostics.lastFrameTimeMs = 200;
  runtimeDiagnostics.smoothedFrameTimeMs = 200;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepDownCount).toBe(5);
  expect(runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps).toBe(64);
  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(20);
});

test("replacing performance diagnostics cannot restart the adaptive decision window", () => {
  const { args, runtimeState } = createAdaptiveRaymarchHarness({
    controls: {
      raymarchSteps: 64,
    },
    renderProfile: {
      qualityPreset: "auto",
      targetFps: 60,
      startupRaymarchSteps: DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS,
      renderContext: RENDER_CONTEXTS.externalOutput,
    },
  });

  runtimeState.adaptiveRaymarchController.currentRung = 1;
  runtimeState.adaptiveRaymarchController.decisionFrameCount = 29;
  runtimeState.adaptiveRaymarchController.longFrameCountInWindow = 3;
  const freshDiagnostics = createRuntimeDiagnostics();
  freshDiagnostics.lastFrameTimeMs = 200;
  freshDiagnostics.smoothedFrameTimeMs = 200;
  args.runtimeDiagnostics = freshDiagnostics;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeState.effectiveRaymarchSteps).toBe(16);
  expect(freshDiagnostics.adaptiveRaymarch.currentRung).toBe(0);
  expect(freshDiagnostics.adaptiveRaymarch.stepDownCount).toBe(1);
});

test("resetting the adaptive controller restarts the next authoritative session from its calibrated rung", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      controls: {
        customTargetFps: 120,
      },
      renderProfile: {
        qualityPreset: "custom",
        targetFps: 120,
        startupRaymarchSteps: 16,
        renderContext: RENDER_CONTEXTS.externalOutput,
      },
    });

  resetAdaptiveRaymarchControllerState(runtimeState);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps).toBe(
    MIN_PRESENTATION_RAYMARCH_STEPS,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
});

test("auto raymarch ignores obsolete field-state labels with valid v3 authority", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      effectiveFrame: {
        fieldState: "decay",
        energySignal: 0,
      },
    });
  primeAdaptiveRecoveryAttempt(runtimeState.adaptiveRaymarchController);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(true);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "none",
  );
});

test("auto raymarch does not recover during silent playback gaps", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
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
  primeAdaptiveRecoveryAttempt(runtimeState.adaptiveRaymarchController);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(0);
});

test("a held source blocks quality recovery without changing its acoustic state", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  args.effectiveFrame = createRendererFeatureView({
    ...canonicalFrame,
    observation: { ...canonicalFrame.observation, sourcePhase: "paused" },
  });
  primeAdaptiveRecoveryAttempt(runtimeState.adaptiveRaymarchController);
  const observation = args.effectiveFrame.observation;
  updateAdaptiveRaymarchStepBudget(args);
  assertAdaptiveRecoveryBlocked(runtimeDiagnostics, "source-held");
  expect(args.effectiveFrame.observation).toBe(observation);
});

test("auto raymarch resumes recovery on sustained active audio", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness();
  primeAdaptiveRecoveryAttempt(runtimeState.adaptiveRaymarchController);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(true);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "none",
  );
});

test("source generation changes clear adaptive recovery momentum", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      status: {
        playbackSessionId: "song-2",
      },
    });
  runtimeState.adaptiveRaymarchController.lastSourceGeneration = 999;
  runtimeState.adaptiveRaymarchController.stableWindowCount = 3;

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.stableWindowCount).toBe(0);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(false);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "source-transition",
  );
  expect(runtimeDiagnostics.adaptiveRaymarch.lastSourceGeneration).toBe(
    canonicalFrame.observation.sourceGeneration,
  );
});

test("quiet valid v3 state can recover without an input-energy or test-tone threshold", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
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
  primeAdaptiveRecoveryAttempt(runtimeState.adaptiveRaymarchController);

  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.currentRung).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.stepUpCount).toBe(1);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryEligible).toBe(true);
  expect(runtimeDiagnostics.adaptiveRaymarch.recoveryBlockedReason).toBe(
    "none",
  );
});

test("render-loop source cannot capture, enqueue, or compose audio analysis", () => {
  const source = readFileSync(
    new URL("./baryonEngineRenderLoop.js", import.meta.url),
    "utf8",
  );

  for (const forbiddenOwner of [
    "readAnalysisSnapshot",
    "enqueueTransportFrame",
    "readLatestSnapshot",
    "prepareAudioFeatureFrameInputs",
    "runHeavyAudioFeatureAnalysis",
    "composeAudioFeatureFrame",
    "createAudioFeatureState",
    "audioFeatureRef",
    "analysisScheduler",
    "lastLiveFrameRef",
  ]) {
    expect(source).not.toContain(forbiddenOwner);
  }
  expect(source).toContain("readLatestFeatureModel");
  expect(source).toContain("createRendererFeatureView");
});

test("syncRenderSurfacePixelRatio uses selected surface pixel ratio", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
  const gl = {
    setPixelRatioCalls: [],
    setPixelRatio(value) {
      this.setPixelRatioCalls.push(value);
    },
  };
  const pixelRatioRef = { current: 1 };

  const targetPixelRatio = syncRenderSurfacePixelRatio({
    gl,
    renderLoopRefs: { pixelRatioRef },
    runtimeDiagnostics,
    basePixelRatio: 2,
  });

  expect(targetPixelRatio).toBe(2);
  expect(pixelRatioRef.current).toBe(2);
  expect(gl.setPixelRatioCalls).toEqual([2]);
});

test("syncUploadedRenderQuantities distinguishes uploaded resources from consumed observer time", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  syncUploadedRenderQuantities(runtimeDiagnostics, {
    fieldSource: {
      read: () => ({
        topology: canonicalFrame.topology,
        basisCompileCount: 1,
        observationUploadCount: 12,
        textureBytes: 4096,
      }),
    },
    lastBakedFeatureFrame: canonicalFrame,
  });
  expect(runtimeDiagnostics.render).toMatchObject({
    uploadedFamilyCount: 85,
    uploadedShellCount: 59,
    basisCompileCount: 1,
    observationUploadCount: 12,
    observerConsumedEndSample: 512,
    derivedTextureBytes: 4096,
  });
});

test("freshness diagnostics report source cursors and raw energy without slot/phase arrays", () => {
  const diagnostics = createRuntimeDiagnostics();
  diagnostics.engine.latestObservationAgeMs = 9;
  updateModalFreshnessDiagnostics(diagnostics, canonicalFrame, {
    getWallTimeMs: () => 123,
  });
  expect(diagnostics.modalFreshness).toMatchObject({
    frameId: 1,
    familyCount: 85,
    shellCount: 59,
    endSample: 512,
    inputEndSample: 512,
    preparationDelayFrames: 0,
    normalizationEnergy: canonicalFrame.observation.normalizationEnergy,
    observationAgeMs: 9,
    renderSubmittedAtMs: 123,
  });
  expect(
    Object.values(
      buildPerformanceHudSnapshot(diagnostics).modalFreshness,
    ).every((value) => value === null || typeof value !== "object"),
  ).toBe(true);
});
