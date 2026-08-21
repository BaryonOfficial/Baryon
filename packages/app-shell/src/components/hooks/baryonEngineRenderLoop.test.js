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
  createFeatureFrameResolver,
  createRenderFramePacerState,
  finalizeTerminalVisualIdleState,
  getRenderTargetPixelRatio,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  resolveRenderSurfaceOutputControls,
  shouldBypassTemporalHistoryForRaymarchFrame,
  updateModalEnvelopeDiagnostics,
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
import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  createRendererFeatureView,
} from "@baryon/engine/audio-features";
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

function createCompiledModalFrame(joinedSlots) {
  const count = Math.floor(joinedSlots.length / 4);
  const modalIdentitySlots = new Float32Array(count * 3);
  const modalCoefficientSlots = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const sourceOffset = index * 4;
    const identityOffset = index * 3;
    modalIdentitySlots[identityOffset] = joinedSlots[sourceOffset];
    modalIdentitySlots[identityOffset + 1] = joinedSlots[sourceOffset + 1];
    modalIdentitySlots[identityOffset + 2] = joinedSlots[sourceOffset + 2];
    modalCoefficientSlots[index] = joinedSlots[sourceOffset + 3];
  }
  return { modalIdentitySlots, modalCoefficientSlots };
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

function createResolveFeatureFrameHarness(overrides = {}) {
  const featureFrame = {
    fieldState: "active",
    frameTimeMs: 1000,
    sourceMode: "file",
    ...createLiveRenderFrameEvidence(),
  };
  const featureModel = {
    topology: {
      protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
      sourceGeneration: 2,
      workerGeneration: 3,
      topologyRevision: 1,
      activeModeCount: 1,
      committedModeCount: 1,
      basisIdentityHash: 11,
      modalIdentitySlots: new Float32Array([1, 1, 1]),
      committedModeIdentitySlots: new Float32Array([1, 1, 1]),
      committedModeFrequenciesHz: new Float32Array([528]),
      modalRoleMetadata: new Uint8Array([1]),
      committedModeRoleMetadata: new Uint8Array([1]),
      fastProbeModeIndices: new Uint16Array([0]),
      modalFieldSpectralMomentSlots: new Float32Array([1, 0, 1, 0]),
      modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
      modalFieldMetadataSlots: new Float32Array(4),
      modalDescriptor: {
        fieldAuthority: "complete",
        counts: { modalFieldModeCount: 1 },
      },
    },
    drive: {
      protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
      sourceGeneration: 2,
      workerGeneration: 3,
      topologyRevision: 1,
      frameId: 7,
      renderState: featureFrame,
      activeModeCount: 1,
      committedModeCount: 1,
      modalCoefficients: new Float32Array([0.5]),
      phaseSlots: new Float32Array(4),
      bandEnergies: new Float32Array(4),
      spectralBandEnergies: new Float32Array(4),
    },
  };
  return {
    args: {
      featureRuntime: {
        readLatestFeatureModel: vi.fn(() => featureModel),
        getStatus: vi.fn(() => ({
          state: "ready",
          sourceGeneration: 2,
          workerGeneration: 3,
          topologyRevision: 1,
          latestAcceptedFrameId: 7,
          latestDriveAgeMs: 4,
          latestDriveStale: true,
          processedFrameCount: 9,
          topologyPublishCount: 2,
          drivePublishCount: 7,
          inputReplacementCount: 1,
          rejectedPacketCount: 3,
          staleAcknowledgementCount: 5,
          queueDepth: 1,
          workerFastLaneMs: 0.4,
          workerStructuralLaneMs: 1.2,
          workerGoertzelMs: 0.2,
          workerCompositionMs: 0.7,
        })),
      },
      runtimeDiagnostics: createRuntimeDiagnostics(),
      runtimeState: {},
      controls: {
        cavityGeometry: "spherical",
        boundaryMode: "dirichlet",
        injectTestTone: false,
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        sourceSession: createFileSourceSession(),
        playbackSessionId: "song-1",
      },
      clockMode: "running",
      renderLoopRefs: {
        frameCacheRefs: {
          lastIdleFrameRef: { current: null },
          pausedFileFrameRef: { current: null },
        },
      },
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

test("updateRendererDiagnostics tolerates an external-authority hold without source status", () => {
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
  expect(runtimeDiagnosticsRef.current.lastLongFrame).toMatchObject({
    playbackSessionId: null,
  });
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
      featureFrame: { fieldState: "idle", energySignal: 0 },
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
  runtimeDiagnostics.modalFreshness.structureSignal = 0.72;
  runtimeDiagnostics.modalFreshness.responseEnvelope = 0.38;
  runtimeDiagnostics.modalFreshness.modeSlotChangeCount = 3;
  runtimeDiagnostics.modalFreshness._previousModeSlots = new Float32Array([
    0.1, 0.2, 0.3,
  ]);
  runtimeDiagnostics.perfBreakdown.readFeatureModelMs.averageMs = 1;
  runtimeDiagnostics.perfBreakdown.createRendererFeatureViewMs.averageMs = 4;
  runtimeDiagnostics.perfBreakdown.applyCachedControlSnapshotsMs.averageMs = 9;
  runtimeDiagnostics.perfBreakdown.syncLiveInputRuntimeStatusMs.averageMs = 10;
  runtimeDiagnostics.perfBreakdown.runtimeTickMs.averageMs = 11;
  runtimeDiagnostics.perfBreakdown.applySceneControlsMs.averageMs = 13;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.averageMs = 14;
  runtimeDiagnostics.perfBreakdown.pipelineRenderMs.lastMs = 99;
  runtimeDiagnostics.engine.latestAcceptedFrameId = 101;
  runtimeDiagnostics.engine.latestDriveAgeMs = 8;
  runtimeDiagnostics.engine.sourceGeneration = 3;
  runtimeDiagnostics.engine.workerGeneration = 5;
  runtimeDiagnostics.engine.topologyRevision = 7;
  runtimeDiagnostics.engine.processedFrameCount = 103;
  runtimeDiagnostics.engine.topologyPublishCount = 11;
  runtimeDiagnostics.engine.drivePublishCount = 101;
  runtimeDiagnostics.engine.inputReplacementCount = 7;
  runtimeDiagnostics.engine.rejectedPacketCount = 11;
  runtimeDiagnostics.engine.staleAcknowledgementCount = 13;
  runtimeDiagnostics.engine.queueDepth = 1;
  runtimeDiagnostics.engine.state = "ready";
  runtimeDiagnostics.engine.reason = "frame-processed";
  runtimeDiagnostics.engine.workerFastLaneMs = 1.25;
  runtimeDiagnostics.engine.workerFastLaneLastMs = 1.5;
  runtimeDiagnostics.engine.workerFastLaneMaxMs = 2.25;
  runtimeDiagnostics.engine.workerStructuralLaneMs = 2.5;
  runtimeDiagnostics.engine.workerStructuralLaneLastMs = 3.25;
  runtimeDiagnostics.engine.workerStructuralLaneMaxMs = 4.5;
  runtimeDiagnostics.engine.workerGoertzelMs = 0.75;
  runtimeDiagnostics.engine.workerGoertzelLastMs = 0.9;
  runtimeDiagnostics.engine.workerGoertzelMaxMs = 1.1;
  runtimeDiagnostics.engine.workerCompositionMs = 1.5;
  runtimeDiagnostics.engine.workerCompositionLastMs = 1.8;
  runtimeDiagnostics.engine.workerCompositionMaxMs = 2.2;
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
  expect(snapshot.engineCounters).toEqual({
    latestDriveAgeMs: 8,
    latestObservationTimeSeconds: null,
    latestCaptureRms: null,
    latestAcceptedFrameId: 101,
    sourceGeneration: 3,
    workerGeneration: 5,
    topologyRevision: 7,
    processedFrameCount: 103,
    topologyPublishCount: 11,
    drivePublishCount: 101,
    inputReplacementCount: 7,
    rejectedPacketCount: 11,
    staleAcknowledgementCount: 13,
    renderAuthorityRevoked: false,
    queueDepth: 1,
    state: "ready",
    reason: "frame-processed",
    workerFastLaneMs: 1.25,
    workerFastLaneLastMs: 1.5,
    workerFastLaneMaxMs: 2.25,
    workerStructuralLaneMs: 2.5,
    workerStructuralLaneLastMs: 3.25,
    workerStructuralLaneMaxMs: 4.5,
    workerGoertzelMs: 0.75,
    workerGoertzelLastMs: 0.9,
    workerGoertzelMaxMs: 1.1,
    workerCompositionMs: 1.5,
    workerCompositionLastMs: 1.8,
    workerCompositionMaxMs: 2.2,
  });
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

test("updateModalFreshnessDiagnostics records modal signals and slot turnover without publishing structural arrays", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.engine.latestDriveAgeMs = 41;

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
      modalIdentitySlots: new Float32Array([0.2, 0.3, 0.4]),
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
          fftPeakAmplitude: 0.31,
          spectralEffectiveBinCount: 128,
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
      modalResponseEnergy: 0.04,
      modalResponseRenderEnergy: 0.31,
      modalResponseRenderSourceCoupledEnergy: 0.24,
      modalResponseRenderResonantEnergy: 0.19,
      modalPhaseAuthority: 0.24,
      modalPhaseCoherentFieldModeCount: 4,
      modeCoherence: 0.88,
      activeModeCount: 9,
      activeModalFieldModeCount: 9,
      debug: {
        fieldState: "active",
        avgAmplitude: 13.25,
        analyserRms: 0.044,
        periodicity: 0.73,
        resonantPhaseAuthority: 0.31,
        sourceCoupledPhaseAuthority: 0.08,
        resonantObservedModeCount: 5,
        resonantObservedEnergy: 0.39,
        resonantRingSupport: 0.66,
        liveInputNoiseGateActive: false,
        liveInputHardSilenceActive: false,
        modalResponseEnergy: 0.05,
      },
      modalIdentitySlots: new Float32Array([0.2, 0.45, 0.4]),
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
        fftPeakAmplitude: 0.31,
        spectralEffectiveBinCount: 128,
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
    modalResponseEnergy: 0.31,
    modalPhaseAuthority: 0.24,
    resonantPhaseAuthority: 0.31,
    sourceCoupledPhaseAuthority: 0.08,
    modalPhaseCoherentFieldModeCount: 4,
    modeCoherence: 0.88,
    activeModeCount: 9,
    activeModalFieldModeCount: 9,
    fieldState: "active",
    avgAmplitude: 13.25,
    analyserRms: 0.044,
    periodicity: 0.73,
    resonantObservedModeCount: 5,
    resonantObservedEnergy: 0.39,
    resonantRingSupport: 0.66,
    liveInputNoiseGateActive: false,
    liveInputHardSilenceActive: false,
    modeSlotChangeCount: 0,
    modalIdentitySlotChangeCount: 1,
    responseEnvelope: 0.31,
    accentEnvelope: 0.42,
    motionSignal: 0.53,
    scaleSignal: 0.64,
    bloomResponseSignal: 0.75,
  });
  expect(runtimeDiagnostics.modalFreshness.modeSlotMeanAbsDelta).toBeCloseTo(0);
  expect(
    runtimeDiagnostics.modalFreshness.modalIdentitySlotMeanAbsDelta,
  ).toBeCloseTo(0.05);

  const hudSnapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);
  expect(hudSnapshot.modalFreshness).toMatchObject({
    structureSignal: 0.28,
    modalObserverVisibilityEnergy: 0.29,
    modalResponseEnergy: 0.31,
    modalPhaseAuthority: 0.24,
    resonantPhaseAuthority: 0.31,
    sourceCoupledPhaseAuthority: 0.08,
    modalPhaseCoherentFieldModeCount: 4,
    featureFrameAgeAtRenderMs: 234,
    renderSubmittedAtMs: 1250,
    responseEnvelope: 0.31,
    resonantObservedModeCount: 5,
    resonantObservedEnergy: 0.39,
    resonantRingSupport: 0.66,
    modeSlotChangeCount: 0,
  });
  expect(hudSnapshot.modalFreshness).not.toHaveProperty("_previousModeSlots");
  expect(hudSnapshot.modalFreshness).not.toHaveProperty(
    "_previousModalIdentitySlots",
  );
});

test("updateModalFreshnessDiagnostics uses render-authoritative descriptor counts", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1000,
      sourceMode: "live",
      activeModeCount: 48,
      activeModalFieldModeCount: 48,
      modalDescriptor: {
        fieldAuthority: "bandwidth-limited",
        counts: { modalFieldModeCount: 48 },
      },
      modalIdentitySlots: new Float32Array(48 * 3),
    },
    { getWallTimeMs: () => 1100 },
  );

  expect(runtimeDiagnostics.modalFreshness.activeModeCount).toBe(0);
  expect(runtimeDiagnostics.modalFreshness.activeModalFieldModeCount).toBe(0);

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1016,
      sourceMode: "live",
      activeModeCount: 48,
      activeModalFieldModeCount: 16,
      modalDescriptor: {
        fieldAuthority: "complete",
        counts: { modalFieldModeCount: 12 },
      },
      modalIdentitySlots: new Float32Array(48 * 3),
    },
    { getWallTimeMs: () => 1116 },
  );

  expect(runtimeDiagnostics.modalFreshness.activeModeCount).toBe(12);
  expect(runtimeDiagnostics.modalFreshness.activeModalFieldModeCount).toBe(12);
});

test("updateModalFreshnessDiagnostics reuses the slot turnover buffer across same-capacity frames", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1000,
      sourceMode: "live",
      modalIdentitySlots: new Float32Array([0.2, 0.3, 0.4]),
    },
    { getWallTimeMs: () => 1100 },
  );
  const firstCopy =
    runtimeDiagnostics.modalFreshness._previousModalIdentitySlots;
  expect(firstCopy).toBeInstanceOf(Float32Array);

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1016,
      sourceMode: "live",
      modalIdentitySlots: new Float32Array([0.2, 0.45, 0.4]),
    },
    { getWallTimeMs: () => 1116 },
  );

  expect(runtimeDiagnostics.modalFreshness._previousModalIdentitySlots).toBe(
    firstCopy,
  );
  expect(Array.from(firstCopy)).toEqual([
    Math.fround(0.2),
    Math.fround(0.45),
    Math.fround(0.4),
  ]);
  expect(
    runtimeDiagnostics.modalFreshness.modalIdentitySlotMeanAbsDelta,
  ).toBeCloseTo(0.05);
  expect(runtimeDiagnostics.modalFreshness.modalIdentitySlotChangeCount).toBe(
    1,
  );

  updateModalFreshnessDiagnostics(
    runtimeDiagnostics,
    {
      frameTimeMs: 1032,
      sourceMode: "live",
      modalIdentitySlots: new Float32Array([0.2, 0.45, 0.4, 0.6, 0, 0]),
    },
    { getWallTimeMs: () => 1132 },
  );

  expect(
    runtimeDiagnostics.modalFreshness._previousModalIdentitySlots,
  ).not.toBe(firstCopy);
  expect(
    runtimeDiagnostics.modalFreshness._previousModalIdentitySlots,
  ).toHaveLength(6);
  expect(runtimeDiagnostics.modalFreshness.modalIdentitySlotChangeCount).toBe(
    1,
  );
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

test("max-quality keeps the requested raymarch budget under modal complexity", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      renderProfile: {
        qualityPreset: "max-quality",
      },
      effectiveFrame: {
        activeModeCount: 16,
        averageAmplitude: 255,
        structureSignal: 1,
        modalVisibilityEnergy: 1,
        ...createCompiledModalFrame(
          new Float32Array([
            1, 2, 3, 1.0, 1, 3, 4, 0.9, 2, 3, 4, 0.85, 2, 4, 5, 0.8, 3, 4, 5,
            0.75, 3, 5, 6, 0.7, 4, 5, 6, 0.65, 4, 6, 7, 0.6, 2, 2, 3, 0.7, 2, 3,
            3, 0.65, 3, 3, 4, 0.6, 3, 4, 4, 0.55, 4, 4, 5, 0.5, 4, 5, 5, 0.45,
            5, 5, 6, 0.4, 5, 6, 6, 0.35,
          ]),
        ),
      },
    });
  runtimeState.modalFieldCapacity = 16;
  runtimeState.modalFieldModeBuffer = {
    value: { array: new Float32Array(16 * 4) },
  };
  updateAdaptiveRaymarchStepBudget(args);

  expect(runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive).toBe(
    false,
  );
  // max-quality holds the user step cap; output-surface scale stays separate.
  expect(runtimeState.raymarchFieldAnalysis.complexityScore).toBeGreaterThan(
    0.8,
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "requestedStepBudget",
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "requestedRenderScale",
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "proactiveStepBudget",
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "stepScaleAdaptationActive",
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "bloomAdaptationActive",
  );
  expect(runtimeState.effectiveRaymarchSteps).toBe(64);
  expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(64);
  expect(runtimeState.volumeMesh.material.steps).toBe(64);
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
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "stepScaleAdaptationActive",
  );
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
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "effectiveStepBudget",
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "effectiveRenderScale",
  );
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

test("adaptive raymarch keeps committed step state outside field-analysis diagnostics", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      effectiveFrame: {
        activeModeCount: 3,
        ...createCompiledModalFrame(
          new Float32Array([1, 1, 1, 0.8, 2, 2, 2, 0.6, 3, 3, 3, 0.4]),
        ),
        averageAmplitude: 90,
        structureSignal: 0.55,
      },
    });
  runtimeState.modalFieldCapacity = 3;
  runtimeState.modalFieldModeBuffer = {
    value: { array: new Float32Array(12) },
  };

  updateAdaptiveRaymarchStepBudget(args);

  // The adaptive diagnostic owns only step-ladder state.
  expect(runtimeDiagnostics.adaptiveRaymarch).not.toHaveProperty(
    "effectiveRenderScale",
  );
  // In auto/custom the adaptive ladder owns steps. Performance profiles do not
  // govern bloom, render scale, or DPR.
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "stepScaleAdaptationActive",
  );
  expect(runtimeState.raymarchFieldAnalysis).not.toHaveProperty(
    "bloomAdaptationActive",
  );
  expect(
    runtimeState.raymarchFieldAnalysis.modalField.uploadedActiveCount,
  ).toBe(3);
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

test("resolveFeatureFrame consumes one immutable feature model mechanically", () => {
  const { args } = createResolveFeatureFrameHarness();
  const featureModel = args.featureRuntime.readLatestFeatureModel();
  const rendererView = {
    fieldState: "active",
    topologyRevision: 1,
    ...createLiveRenderFrameEvidence(),
  };
  args.featureRuntime.readLatestFeatureModel.mockClear();
  const createFeatureView = vi.fn(() => rendererView);

  const result = resolveFeatureFrame(args, { createFeatureView });

  expect(args.featureRuntime.readLatestFeatureModel).toHaveBeenCalledTimes(1);
  expect(createFeatureView).toHaveBeenCalledWith(featureModel);
  expect(result.featureFrame).toBe(rendererView);
  expect(result.effectiveFrame).toBe(rendererView);
  expect(args.runtimeDiagnostics.modalFreshness).toMatchObject({
    frameSemanticSource: "feature-model",
    frameSemanticFresh: true,
    frameSemanticReused: false,
  });
  expect(args.runtimeDiagnostics.engine).toMatchObject({
    state: "ready",
    sourceGeneration: 2,
    workerGeneration: 3,
    topologyRevision: 1,
    latestAcceptedFrameId: 7,
    latestDriveAgeMs: 4,
    latestDriveStale: true,
    processedFrameCount: 9,
    topologyPublishCount: 2,
    drivePublishCount: 7,
    inputReplacementCount: 1,
    rejectedPacketCount: 3,
    staleAcknowledgementCount: 5,
    queueDepth: 1,
    workerFastLaneMs: 0.4,
    workerStructuralLaneMs: 1.2,
    workerGoertzelMs: 0.2,
    workerCompositionMs: 0.7,
  });
});

test("resolveFeatureFrame fails closed when the local runtime has no model", () => {
  const { args } = createResolveFeatureFrameHarness({
    featureRuntime: {
      readLatestFeatureModel: vi.fn(() => null),
      getStatus: vi.fn(() => ({
        state: "ready",
        renderAuthorityRevoked: true,
      })),
    },
    renderLoopRefs: {
      frameCacheRefs: {
        lastIdleFrameRef: { current: null },
        pausedFileFrameRef: { current: null },
        lastLiveFrameRef: {
          current: { fieldState: "active", renderAuthority: true },
        },
      },
    },
  });
  const createFeatureView = vi.fn();

  const result = resolveFeatureFrame(args, { createFeatureView });

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(createFeatureView).not.toHaveBeenCalled();
  expect(args.runtimeDiagnostics.engine.renderAuthorityRevoked).toBe(true);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "feature-model-unavailable",
  );
});

test("resolveFeatureFrame rejects a retained live model after transport stops", () => {
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: null,
    },
  });

  const stopped = resolveFeatureFrame(args);

  expect(stopped).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(
    args.renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current,
  ).toBeNull();
  expect(args.featureRuntime.readLatestFeatureModel).toHaveBeenCalledTimes(1);

  args.featureRuntime.readLatestFeatureModel.mockReturnValue(null);
  resolveFeatureFrame(args);

  expect(args.featureRuntime.readLatestFeatureModel).toHaveBeenCalledTimes(2);
});

test("resolveFeatureFrame caches a canonical static idle model", () => {
  const idleFrame = {
    fieldState: "idle",
    renderAuthority: false,
    sourceEvidence: {
      sourceBoundaryState: "absent",
      currentSourceEvidence: false,
    },
  };
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      playbackSessionId: null,
    },
  });
  const createFeatureView = vi.fn(() => idleFrame);

  const first = resolveFeatureFrame(args, { createFeatureView });
  const second = resolveFeatureFrame(args, { createFeatureView });

  expect(first.effectiveFrame).toBe(idleFrame);
  expect(second.effectiveFrame).toBe(idleFrame);
  expect(args.renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current).toBe(
    idleFrame,
  );
  expect(args.featureRuntime.readLatestFeatureModel).toHaveBeenCalledTimes(1);
});

test("resolveFeatureFrame rejects a stale playing frame as terminal idle", () => {
  const stalePlayingIdleFrame = {
    fieldState: "idle",
    renderAuthority: false,
    sourceEvidence: {
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
      transport: {
        playing: true,
        liveInputActive: false,
      },
    },
  };
  const playbackSessionId = "song-1";
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isAudioLoaded: true,
      hasPreparedFileAnalysisSource: true,
      isPlaying: false,
      isPlaybackPaused: false,
      isLiveInputActive: false,
      playbackSessionId,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: {
        playbackSessionId,
      },
    },
  });
  const createFeatureView = vi.fn(() => stalePlayingIdleFrame);

  const result = resolveFeatureFrame(args, { createFeatureView });

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(
    args.renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current,
  ).toBeNull();
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "stale-source-model-rejected",
  );
});

test("resolveFeatureFrame reuses only the explicit static-idle cache", () => {
  const idleFrame = { fieldState: "idle", renderAuthority: false };
  const readLatestFeatureModel = vi.fn();
  const { args } = createResolveFeatureFrameHarness({
    featureRuntime: {
      readLatestFeatureModel,
      getStatus: vi.fn(),
    },
    status: {
      isPlaying: false,
      isLiveInputActive: false,
    },
    renderLoopRefs: {
      frameCacheRefs: {
        lastIdleFrameRef: { current: idleFrame },
        pausedFileFrameRef: { current: null },
      },
    },
  });

  const result = resolveFeatureFrame(args);

  expect(result.effectiveFrame).toBe(idleFrame);
  expect(readLatestFeatureModel).not.toHaveBeenCalled();
  expect(args.runtimeDiagnostics.modalFreshness).toMatchObject({
    frameSemanticSource: "static-idle-cache",
    frameSemanticFresh: false,
    frameSemanticReused: true,
  });
});

test("resolveFeatureFrame uses the prepared file model immediately on playback", () => {
  const idleFrame = {
    fieldState: "idle",
    renderAuthority: false,
    sourceEvidence: {
      sourceBoundaryState: "absent",
      currentSourceEvidence: false,
    },
  };
  const activeFrame = {
    fieldState: "active",
    renderAuthority: true,
    ...createLiveRenderFrameEvidence(),
  };
  const readLatestFeatureModel = vi.fn(() => ({ current: true }));
  const getStatus = vi.fn(() => ({
    state: "ready",
  }));
  const { args } = createResolveFeatureFrameHarness({
    featureRuntime: {
      readLatestFeatureModel,
      getStatus,
    },
    renderLoopRefs: {
      frameCacheRefs: {
        lastIdleFrameRef: { current: idleFrame },
        pausedFileFrameRef: { current: null },
      },
    },
  });
  const createFeatureView = vi.fn(() => activeFrame);

  const ready = resolveFeatureFrame(args, { createFeatureView });

  expect(ready.effectiveFrame).toBe(activeFrame);
  expect(readLatestFeatureModel).toHaveBeenCalledTimes(1);
  expect(
    args.renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current,
  ).toBeNull();
});

test("resolveFeatureFrame exposes a loaded file model only to idle preparation", () => {
  const preparedFrame = {
    fieldState: "active",
    renderAuthority: false,
    energyLedger: {
      projectedRenderEnergy: 0.08,
      renderEnergyEpsilon: 1e-6,
    },
    sourceEvidence: {
      sourceKind: "file",
      sourceBoundaryState: "prepared",
      currentSourceEvidence: false,
      transport: {
        playing: false,
        preparationOnly: true,
      },
    },
    modalDescriptor: {
      fieldAuthority: "complete",
    },
  };
  const readLatestFeatureModel = vi.fn(() => ({ prepared: true }));
  const { args } = createResolveFeatureFrameHarness({
    featureRuntime: {
      readLatestFeatureModel,
      getStatus: vi.fn(() => ({ state: "ready" })),
    },
    status: {
      isAudioLoaded: true,
      hasPreparedFileAnalysisSource: true,
      isPlaying: false,
      isPlaybackPaused: false,
      isLiveInputActive: false,
      sourceSession: createFileSourceSession({
        phase: "ready",
        sessionId: "prepared-demo",
      }),
    },
  });
  const createFeatureView = vi.fn(() => preparedFrame);

  const result = resolveFeatureFrame(args, { createFeatureView });

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: preparedFrame,
  });
  expect(readLatestFeatureModel).toHaveBeenCalledTimes(1);
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "prepared-file-model",
  );
});

test("resolveFeatureFrame returns a naturally completed file to visual idle", () => {
  const completedFrame = {
    fieldState: "active",
    renderAuthority: true,
    modalDescriptor: {
      fieldAuthority: "complete",
    },
    ...createLiveRenderFrameEvidence(),
  };
  const playbackSessionId = "song-1";
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isAudioLoaded: true,
      hasPreparedFileAnalysisSource: true,
      isPlaying: false,
      isPlaybackPaused: false,
      isLiveInputActive: false,
      sourceSession: createFileSourceSession({ phase: "ended" }),
      playbackSessionId,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: {
        playbackSessionId,
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    createFeatureView: vi.fn(() => completedFrame),
  });

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "stale-source-model-rejected",
  );
});

test("resolveFeatureFrame renders a naturally completed file while modal ring-down advances", () => {
  const ringdownFrame = {
    fieldState: "active",
    renderAuthority: true,
    modalDescriptor: {
      fieldAuthority: "complete",
    },
    ...createLiveRenderFrameEvidence(),
  };
  const playbackSessionId = "song-1";
  const { args } = createResolveFeatureFrameHarness({
    featureRuntime: {
      readLatestFeatureModel: vi.fn(() => ({ ringdown: true })),
      getStatus: vi.fn(() => ({
        state: "ready",
        naturalRingdownActive: true,
        naturalRingdownSessionId: playbackSessionId,
      })),
    },
    status: {
      isAudioLoaded: true,
      hasPreparedFileAnalysisSource: true,
      isPlaying: false,
      isPlaybackPaused: false,
      isLiveInputActive: false,
      sourceSession: createFileSourceSession({ phase: "ended" }),
      playbackSessionId,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: {
        playbackSessionId,
      },
    },
  });

  const result = resolveFeatureFrame(args, {
    createFeatureView: vi.fn(() => ringdownFrame),
  });

  expect(result).toEqual({
    featureFrame: ringdownFrame,
    effectiveFrame: ringdownFrame,
    preparationFrame: null,
  });
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "feature-model",
  );
});

test("resolveFeatureFrame retains an explicit paused-file hold", () => {
  const activeHarness = createResolveFeatureFrameHarness();
  resolveFeatureFrame(activeHarness.args);

  const held =
    activeHarness.args.renderLoopRefs.frameCacheRefs.pausedFileFrameRef.current;
  expect(held).toMatchObject({
    playbackSessionId: "song-1",
    fileSourceSessionId: "source-1",
    fileTimelineRevision: 0,
  });
  expect(held.frame).toMatchObject({
    audioMotionAuthority: false,
    modalResponseCurrentRenderSourceEvidence: false,
    observationAdvancing: false,
    observationPaused: true,
  });

  activeHarness.args.status = {
    isPlaying: false,
    isLiveInputActive: false,
    isAudioLoaded: true,
    sourceSession: createFileSourceSession({ phase: "paused" }),
    playbackSessionId: "song-1",
  };
  activeHarness.args.clockMode = "paused-playback";
  activeHarness.args.featureRuntime.readLatestFeatureModel.mockReturnValue(
    null,
  );

  const paused = resolveFeatureFrame(activeHarness.args);

  expect(paused.effectiveFrame).toBe(held.frame);
  expect(paused.effectiveFrame).toMatchObject({
    observationAdvancing: false,
    observationPaused: true,
  });
  expect(
    activeHarness.args.featureRuntime.readLatestFeatureModel,
  ).toHaveBeenCalledTimes(1);
  expect(
    activeHarness.args.runtimeDiagnostics.modalFreshness.frameSemanticSource,
  ).toBe("paused-file-hold");
});

test("shared feature resolver revisions semantic transitions once across render and OSC interleavings", () => {
  const harness = createResolveFeatureFrameHarness();
  const resolver = createFeatureFrameResolver();
  const rendered = resolver.resolve(harness.args);
  const sampled = resolver.resolve(harness.args);

  expect(rendered.resolvedSemanticRevision).toBe(1);
  expect(sampled).toBe(rendered);

  harness.args.status = {
    ...harness.args.status,
    isPlaying: false,
    isPlaybackPaused: true,
    isLiveInputActive: false,
    isAudioLoaded: true,
    sourceSession: createFileSourceSession({ phase: "paused" }),
  };
  harness.args.clockMode = "paused-playback";
  const pausedFromOsc = resolver.resolve(harness.args);
  const pausedFromRender = resolver.resolve(harness.args);

  expect(pausedFromOsc.resolvedSemanticRevision).toBe(2);
  expect(pausedFromOsc.effectiveFrame?.observationAdvancing).toBe(false);
  expect(pausedFromRender).toBe(pausedFromOsc);

  harness.args.status = {
    ...harness.args.status,
    isPlaybackPaused: false,
    isPlaying: true,
    sourceSession: createFileSourceSession({ phase: "active" }),
  };
  harness.args.clockMode = "playing";
  const resumedFromRender = resolver.resolve(harness.args);
  const resumedFromOsc = resolver.resolve(harness.args);

  expect(resumedFromRender.resolvedSemanticRevision).toBe(3);
  expect(resumedFromOsc).toBe(resumedFromRender);
});

test("OSC-first resolution preserves render-only diagnostics on the cache hit", () => {
  const harness = createResolveFeatureFrameHarness();
  const resolver = createFeatureFrameResolver();

  const sampled = resolver.resolve({
    ...harness.args,
    runtimeDiagnostics: null,
  });
  expect(sampled.resolvedSemanticRevision).toBe(1);
  expect(harness.args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    null,
  );

  const rendered = resolver.resolve(harness.args);

  expect(rendered).toBe(sampled);
  expect(harness.args.runtimeDiagnostics.modalFreshness).toMatchObject({
    frameSemanticSource: "feature-model",
    frameSemanticFresh: true,
    frameSemanticReused: false,
  });
  expect(harness.args.runtimeDiagnostics.engine).toMatchObject({
    sourceGeneration: 2,
    workerGeneration: 3,
    topologyRevision: 1,
    latestAcceptedFrameId: 7,
  });
});

test("shared feature resolver observes a newly available model when runtime status lags", () => {
  const harness = createResolveFeatureFrameHarness();
  const readLatestFeatureModel =
    harness.args.featureRuntime.readLatestFeatureModel;
  const featureModel = readLatestFeatureModel();
  readLatestFeatureModel.mockClear();
  readLatestFeatureModel.mockReturnValue(null);
  const resolver = createFeatureFrameResolver();
  const createFeatureView = vi.fn(createRendererFeatureView);

  const unavailable = resolver.resolve(harness.args, { createFeatureView });
  expect(unavailable.effectiveFrame).toBeNull();
  expect(unavailable.resolvedSemanticRevision).toBe(1);

  readLatestFeatureModel.mockReturnValue(featureModel);
  const available = resolver.resolve(harness.args, { createFeatureView });
  const repeated = resolver.resolve(harness.args, { createFeatureView });

  expect(available.effectiveFrame?.frameId).toBe(7);
  expect(available.resolvedSemanticRevision).toBe(2);
  expect(repeated).toBe(available);
  expect(createFeatureView).toHaveBeenCalledTimes(1);
});

test("shared feature resolver revisions every resolver-only transition once with an unchanged frame id", () => {
  const harness = createResolveFeatureFrameHarness();
  const featureModel = harness.args.featureRuntime.readLatestFeatureModel();
  const runtimeStatus = harness.args.featureRuntime.getStatus();
  harness.args.featureRuntime.readLatestFeatureModel.mockReturnValue(
    featureModel,
  );
  harness.args.featureRuntime.getStatus.mockImplementation(
    () => runtimeStatus,
  );
  harness.args.status = {
    ...harness.args.status,
    sourceSession: createFileSourceSession({
      sessionId: 1,
      timelineRevision: 0,
    }),
  };
  featureModel.drive.observationSourceKey = "file:1";
  featureModel.drive.observationSessionKey = "file:1";
  featureModel.drive.observationTimelineRevision = 0;
  const resolver = createFeatureFrameResolver();
  let expectedRevision = 0;

  const resolveTransition = ({ frameAvailable }) => {
    const first = resolver.resolve(harness.args);
    const second = resolver.resolve(harness.args);
    expectedRevision += 1;
    expect(first.resolvedSemanticRevision).toBe(expectedRevision);
    expect(second).toBe(first);
    expect(Boolean(first.effectiveFrame)).toBe(frameAvailable);
    expect(first.effectiveFrame?.frameId ?? featureModel.drive.frameId).toBe(7);
  };

  resolveTransition({ frameAvailable: true });

  harness.args.status = {
    ...harness.args.status,
    sessionKey: "file:unexpected-session",
  };
  resolveTransition({ frameAvailable: false });

  harness.args.status = {
    ...harness.args.status,
    sessionKey: null,
  };
  resolveTransition({ frameAvailable: true });

  harness.args.status = {
    ...harness.args.status,
    sourceSession: {
      ...harness.args.status.sourceSession,
      timelineRevision: 1,
    },
  };
  resolveTransition({ frameAvailable: false });

  featureModel.drive.observationSessionKey = "file:1:timeline:1";
  featureModel.drive.observationTimelineRevision = 1;
  resolveTransition({ frameAvailable: true });

  harness.args.status = {
    ...harness.args.status,
    isPlaying: false,
    lastLiveInputInterruption: { sessionId: "interruption-1" },
  };
  resolveTransition({ frameAvailable: false });

  harness.args.status = {
    ...harness.args.status,
    isPlaying: true,
    lastLiveInputInterruption: null,
  };
  resolveTransition({ frameAvailable: true });

  harness.args.status = {
    ...harness.args.status,
    isPlaying: false,
  };
  harness.args.controls.injectTestTone = false;
  resolveTransition({ frameAvailable: false });

  harness.args.controls.injectTestTone = true;
  resolveTransition({ frameAvailable: true });

  harness.args.status = {
    ...harness.args.status,
    isPlaying: true,
    sourceSession: createFileSourceSession({
      sessionId: 2,
      timelineRevision: 0,
    }),
  };
  harness.args.controls.injectTestTone = false;
  featureModel.drive.observationSourceKey = "file:2";
  featureModel.drive.observationSessionKey = "file:2";
  featureModel.drive.observationTimelineRevision = 0;
  resolveTransition({ frameAvailable: true });

  harness.args.status = {
    ...harness.args.status,
    isPlaying: false,
  };
  runtimeStatus.naturalRingdownActive = true;
  runtimeStatus.naturalRingdownSessionId = "song-1";
  resolveTransition({ frameAvailable: true });

  runtimeStatus.naturalRingdownSessionId = "ringdown-other";
  resolveTransition({ frameAvailable: false });

  harness.args.status = {
    ...harness.args.status,
    isAudioLoaded: true,
    hasPreparedFileAnalysisSource: true,
  };
  resolveTransition({ frameAvailable: false });

  harness.args.status = {
    ...harness.args.status,
    lastPlaybackEndReason: "natural",
    lastPlaybackDiagnostics: { playbackSessionId: "song-1" },
  };
  resolveTransition({ frameAvailable: false });
});

test("resolveFeatureFrame invalidates the old hold and installs the paused seek target", () => {
  const harness = createResolveFeatureFrameHarness();
  resolveFeatureFrame(harness.args);

  const seekFrame = {
    fieldState: "active",
    renderAuthority: true,
    modalDescriptor: {
      fieldAuthority: "complete",
    },
    observationPaused: true,
    observationAdvancing: false,
    observationTimelineRevision: 1,
    observationTimeSeconds: 42,
    ...createLiveRenderFrameEvidence(),
  };
  harness.args.status = {
    isPlaying: false,
    isPlaybackPaused: true,
    isLiveInputActive: false,
    isAudioLoaded: true,
    hasPreparedFileAnalysisSource: true,
    sourceSession: createFileSourceSession({
      phase: "paused",
      timelineRevision: 1,
    }),
    playbackSessionId: "song-1",
  };
  harness.args.clockMode = "paused-playback";
  harness.args.featureRuntime.readLatestFeatureModel.mockReturnValue({
    seek: true,
  });

  const result = resolveFeatureFrame(harness.args, {
    createFeatureView: vi.fn(() => seekFrame),
  });

  expect(result.preparationFrame).toBeNull();
  expect(result.effectiveFrame).toMatchObject({
    observationTimeSeconds: 42,
    observationTimelineRevision: 1,
    audioMotionAuthority: false,
  });
  expect(
    harness.args.renderLoopRefs.frameCacheRefs.pausedFileFrameRef.current,
  ).toMatchObject({
    playbackSessionId: "song-1",
    fileSourceSessionId: "source-1",
    fileTimelineRevision: 1,
  });
  expect(
    harness.args.runtimeDiagnostics.modalFreshness.frameSemanticSource,
  ).toBe("paused-file-seek");
});

test("resolveFeatureFrame never lets static idle mask paused seek reconstruction", () => {
  const staleIdleFrame = {
    fieldState: "idle",
    renderAuthority: false,
    sourceEvidence: {
      sourceBoundaryState: "absent",
      currentSourceEvidence: false,
    },
  };
  const seekFrame = {
    fieldState: "active",
    renderAuthority: true,
    modalDescriptor: {
      fieldAuthority: "complete",
    },
    observationPaused: true,
    observationAdvancing: false,
    observationTimelineRevision: 1,
    observationTimeSeconds: 42,
    ...createLiveRenderFrameEvidence(),
  };
  const harness = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isPlaybackPaused: true,
      isLiveInputActive: false,
      isAudioLoaded: true,
      hasPreparedFileAnalysisSource: true,
      sourceSession: createFileSourceSession({
        phase: "paused",
        timelineRevision: 1,
      }),
      playbackSessionId: "song-1",
    },
    clockMode: "paused-playback",
    renderLoopRefs: {
      frameCacheRefs: {
        lastIdleFrameRef: { current: staleIdleFrame },
        pausedFileFrameRef: { current: null },
      },
    },
  });
  const createFeatureView = vi.fn(() => seekFrame);

  const result = resolveFeatureFrame(harness.args, { createFeatureView });

  expect(
    harness.args.featureRuntime.readLatestFeatureModel,
  ).toHaveBeenCalledTimes(1);
  expect(result.effectiveFrame).toMatchObject({
    fieldState: "active",
    observationTimeSeconds: 42,
    observationTimelineRevision: 1,
  });
  expect(
    harness.args.renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current,
  ).toBeNull();
  expect(
    harness.args.runtimeDiagnostics.modalFreshness.frameSemanticSource,
  ).toBe("paused-file-seek");
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

test("auto raymarch ignores field-state labels when ledger authority is present", () => {
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

test("auto raymarch does not recover on weak active audio", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      effectiveFrame: {
        energySignal: 0.4,
        ...createLiveRenderFrameEvidence({ projectedRenderEnergy: 0.04 }),
      },
    });
  primeAdaptiveRecoveryAttempt(runtimeState.adaptiveRaymarchController);

  updateAdaptiveRaymarchStepBudget(args);

  assertAdaptiveRecoveryBlocked(runtimeDiagnostics, "low-render-energy");
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

test("playback session changes clear adaptive recovery momentum", () => {
  const { args, runtimeState, runtimeDiagnostics } =
    createAdaptiveRaymarchHarness({
      status: {
        playbackSessionId: "song-2",
      },
    });
  runtimeState.adaptiveRaymarchController.lastPlaybackSessionId = "song-1";
  runtimeState.adaptiveRaymarchController.stableWindowCount = 3;

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

test("resolveFeatureFrame clears retained caches and response after interruption", () => {
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      lastLiveInputInterruption: { reason: "device-lost" },
    },
    runtimeState: {
      responseEnvelope: 1,
      accentEnvelope: 1,
      motionSignal: 1,
      scaleSignal: 1,
      bloomResponseSignal: 1,
    },
    renderLoopRefs: {
      frameCacheRefs: {
        lastIdleFrameRef: { current: { fieldState: "idle" } },
        pausedFileFrameRef: {
          current: {
            playbackSessionId: "song-1",
            frame: { fieldState: "active" },
          },
        },
      },
    },
  });

  const result = resolveFeatureFrame(args);

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(
    args.renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current,
  ).toBeNull();
  expect(
    args.renderLoopRefs.frameCacheRefs.pausedFileFrameRef.current,
  ).toBeNull();
  expect(args.runtimeState).toMatchObject({
    responseEnvelope: 0,
    accentEnvelope: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
  });
});

test("active live input consumes the runtime model without interruption reset", () => {
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isLiveInputActive: true,
      lastLiveInputInterruption: null,
    },
    runtimeState: {
      responseEnvelope: 0.4,
      accentEnvelope: 0.3,
    },
  });

  const result = resolveFeatureFrame(args);

  expect(result.effectiveFrame).toMatchObject({ fieldState: "active" });
  expect(args.runtimeState.responseEnvelope).toBe(0.4);
  expect(args.runtimeState.accentEnvelope).toBe(0.3);
});

test("resolveFeatureFrame rejects a model from the previous source session", () => {
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isLiveInputActive: true,
      sourceSession: {
        kind: "system",
        phase: "active",
        sessionId: 2,
        timelineRevision: 0,
      },
      playbackSessionId: null,
    },
  });

  const result = resolveFeatureFrame(args, {
    createFeatureView: vi.fn(() => ({
      fieldState: "active",
      observationSessionKey: "file:1",
      ...createLiveRenderFrameEvidence(),
    })),
  });

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "stale-source-session-model-rejected",
  );
});

test("resolveFeatureFrame rejects an active model after System stops", () => {
  const { args } = createResolveFeatureFrameHarness({
    status: {
      isPlaying: false,
      isLiveInputActive: false,
      sourceSession: {
        kind: "system",
        phase: "stopped",
        sessionId: 2,
        timelineRevision: 0,
      },
      playbackSessionId: null,
    },
  });

  const result = resolveFeatureFrame(args, {
    createFeatureView: vi.fn(() => ({
      fieldState: "active",
      observationSessionKey: "system:2",
      sourceEvidence: {
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        transport: { playing: false, liveInputActive: true },
      },
    })),
  });

  expect(result).toEqual({
    featureFrame: null,
    effectiveFrame: null,
    preparationFrame: null,
  });
  expect(args.runtimeDiagnostics.modalFreshness.frameSemanticSource).toBe(
    "stale-source-state-model-rejected",
  );
});

test("resolveRaymarchFieldAnalysisFrameInputs prefers uploaded mode count over descriptor span", () => {
  const runtimeState = {
    modalFieldCapacity: 12,
    modalFieldModeBuffer: { value: { array: new Float32Array(48) } },
    uniforms: {
      uModalFieldModeCount: { value: 3 },
    },
  };
  const effectiveFrame = {
    activeModeCount: 48,
    modalDescriptor: { counts: { modalFieldModeCount: 48 } },
  };

  expect(
    resolveRaymarchFieldAnalysisFrameInputs(runtimeState, effectiveFrame),
  ).toEqual({
    modalFieldCapacity: 12,
    productUploadCapacity: 12,
    activeModeCount: 3,
    uploadedModeCount: 3,
  });
});

test("resolveRaymarchFieldAnalysisFrameInputs uses descriptor-owned mode count over raw active count", () => {
  const runtimeState = {
    modalFieldCapacity: 16,
    modalFieldModeBuffer: { value: { array: new Float32Array(64) } },
    uniforms: {
      uModalFieldModeCount: { value: 0 },
    },
  };
  const effectiveFrame = {
    activeModeCount: 24,
    activeModalFieldModeCount: 16,
    modalDescriptor: {
      fieldAuthority: "capacity-limited",
      counts: { modalFieldModeCount: 12 },
    },
  };

  expect(
    resolveRaymarchFieldAnalysisFrameInputs(runtimeState, effectiveFrame),
  ).toEqual({
    modalFieldCapacity: 16,
    productUploadCapacity: 16,
    activeModeCount: 12,
    uploadedModeCount: 0,
  });
});

test("resolveRaymarchFieldAnalysisFrameInputs suppresses fatal descriptor topology", () => {
  const runtimeState = {
    modalFieldCapacity: 12,
    modalFieldModeBuffer: { value: { array: new Float32Array(48) } },
    uniforms: {
      uModalFieldModeCount: { value: 3 },
    },
  };

  for (const fieldAuthority of ["bandwidth-limited", "blocked"]) {
    expect(
      resolveRaymarchFieldAnalysisFrameInputs(runtimeState, {
        activeModeCount: 48,
        activeModalFieldModeCount: 48,
        modalDescriptor: {
          fieldAuthority,
          counts: { modalFieldModeCount: 48 },
        },
      }),
    ).toEqual({
      modalFieldCapacity: 12,
      productUploadCapacity: 12,
      activeModeCount: 0,
      uploadedModeCount: 0,
    });
  }
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

test("syncUploadedRenderQuantities mirrors canonical runtime quantities", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  syncUploadedRenderQuantities(runtimeDiagnostics, {
    uniforms: {
      uModalFieldModeCount: { value: 5 },
    },
    raymarchStructuralProjection: {
      amplitudeSum: 0.18,
      projectionEnergyDrive: 0.42,
      structuralConcentration: 0.31,
    },
  });

  expect(runtimeDiagnostics.render.uploadedModeCount).toBe(5);
  expect(runtimeDiagnostics.render.totalSlotAmplitude).toBeCloseTo(0.18);
  expect(runtimeDiagnostics.render.structuralProjectionDrive).toBeCloseTo(0.42);
  expect(
    runtimeDiagnostics.render.structuralProjectionConcentration,
  ).toBeCloseTo(0.31);
  expect(runtimeDiagnostics.modalFreshness.uploadedModeCount).toBe(5);
  expect(runtimeDiagnostics.modalFreshness.totalSlotAmplitude).toBeCloseTo(
    0.18,
  );
  expect(
    runtimeDiagnostics.modalFreshness.structuralProjectionDrive,
  ).toBeCloseTo(0.42);
  expect(
    runtimeDiagnostics.modalFreshness.structuralProjectionConcentration,
  ).toBeCloseTo(0.31);
});
