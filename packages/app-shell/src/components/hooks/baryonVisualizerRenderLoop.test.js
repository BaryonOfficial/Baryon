import { expect, test } from "vitest";
import { createRuntimeDiagnostics } from "./baryonVisualizerRuntimeState.js";
import { syncLiveInputRuntimeStatus } from "./liveInputRuntimeSync.js";
import {
  getEffectiveAdaptiveRenderScale,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  updateAdaptiveRaymarchStepBudget,
} from "./baryonVisualizerRenderLoop.js";
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
        structuralImplementation: "modal-excitation",
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
      chromesthesiaEnabled: true,
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

  expect(runtimeState.effectiveRaymarchSteps).toBe(64);
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
