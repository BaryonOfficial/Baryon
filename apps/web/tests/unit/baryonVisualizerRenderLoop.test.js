import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCachedControlSnapshots,
  applyReactiveBloomState,
  buildPerformanceHudSnapshot,
  publishPerformanceHudSnapshot,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  syncLiveInputRuntimeStatus,
  updateAdaptiveRaymarchStepBudget,
  updateRendererDiagnostics,
} from "../../../../packages/app-shell/src/components/hooks/baryonVisualizerRenderLoop.js";

function createRenderLoopRefs() {
  return {
    runtimeDiagnosticsRef: { current: null },
    pixelRatioRef: { current: null },
    lastAudioIssueSignatureRef: { current: null },
    lastLiveInputRuntimeStatusRef: { current: null },
    frameCacheRefs: {
      lastLiveFrameRef: { current: null },
      lastActiveFrameRef: { current: null },
      lastIdleFrameRef: { current: null },
      analysisSchedulerRef: {
        current: {
          lastHeavyAnalysisAtMs: Number.NEGATIVE_INFINITY,
          lastHeavyAnalysisResult: null,
          lastComposedFeatureFrame: null,
          lastAnalysisSessionKey: null,
          lastAnalysisInputsSignature: null,
        },
      },
    },
    controlCacheRefs: {
      controlVersionRef: { current: 0 },
      appliedControlVersionRef: { current: -1 },
      cachedControlSnapshotsRef: {
        current: {
          shared: null,
          output: null,
          visualization: null,
          bloom: null,
          audit: null,
          hasBloomPass: false,
          controlsSnapshot: null,
        },
      },
    },
  };
}

function createDevtoolsPublishArgs(overrides = {}) {
  return {
    devtoolsEnabled: true,
    controls: {
      auditEnabled: true,
      logEveryFrames: 1,
      ...(overrides.controls ?? {}),
    },
    runtime: {
      method: "raymarch",
      ...(overrides.runtime ?? {}),
    },
    runtimeState: {
      debugSnapshot: {
        debug: "audit",
        ...(overrides.runtimeState?.debugSnapshot ?? {}),
      },
      ...overrides.runtimeState,
    },
    status: {
      playbackSessionId: 8,
      lastPlaybackEndReason: "premature",
      lastPlaybackDiagnostics: { id: 1 },
      ...(overrides.status ?? {}),
    },
    featureState: {
      audit: {
        frame: 2,
        ...(overrides.featureState?.audit ?? {}),
      },
      ...overrides.featureState,
    },
    lowLoadActive: false,
    runtimeDiagnostics: {
      sample: "runtime",
      ...(overrides.runtimeDiagnostics ?? {}),
    },
    shared: { shared: true },
    output: { output: true },
    visualization: { visualization: true },
    bloom: { bloom: true },
    audit: { audit: true },
    sceneSnapshot: { rotationY: 1 },
    audio: {
      getLiveInputSettings() {
        return { echoCancellation: false };
      },
      ...(overrides.audio ?? {}),
    },
    ...overrides,
  };
}

function createDevtoolsDeps({ controlSnapshots, auditLogs, markedReady } = {}) {
  return {
    buildControlSnapshot(input) {
      controlSnapshots?.push(input);
      return { control: true, ...input };
    },
    snapshotDiagnostics(value) {
      return { snapshot: value };
    },
    logAudit(...args) {
      auditLogs?.push(args);
    },
    markRuntimeReady() {
      markedReady?.push(true);
    },
  };
}

function createRuntimeDiagnostics(overrides = {}) {
  return {
    activeFrameCount: 0,
    averageFrameTimeMs: 0,
    smoothedFrameTimeMs: 0,
    lastFrameTimeMs: 0,
    worstFrameTimeMs: 0,
    longFrameCount: 0,
    currentPixelRatio: 1,
    basePixelRatio: 1,
    lastFrameWallTimeMs: null,
    lastLongFrame: null,
    lastVisibilityChange: null,
    rendererMode: null,
    lastRendererModeChange: null,
    lastPlaybackIssue: null,
    analysisScheduler: {
      analysisReuseCount: 0,
      analysisAgeMs: 0,
      forcedAnalysisCount: 0,
      skippedAnalysisCount: 0,
    },
    engine: {
      snapshotAgeMs: 0,
      publishCount: 0,
      transportDropCount: 0,
      publishSkipCount: 0,
      fastSignalUpdateCount: 0,
      structuralUpdateCount: 0,
      chromaUpdateCount: 0,
      tempoUpdateCount: 0,
      latestProcessedFrameId: 0,
      latestPublishedFrameId: 0,
      workerFastSignalMs: 0,
      workerStructuralMs: 0,
      workerPeakScanMs: 0,
      workerModalResolveMs: 0,
      workerProjectionMs: 0,
      workerChromaMs: 0,
      workerTempoMs: 0,
      droppedFrameCount: 0,
      queueDepth: 0,
      state: "none",
      reason: null,
    },
    adaptiveRaymarch: {
      adaptiveRaymarchActive: false,
      requestedRaymarchSteps: 0,
      effectiveRaymarchSteps: 0,
      requestedRenderScale: 1,
      effectiveRenderScale: 1,
      currentRung: 0,
      currentScaleRung: 0,
      stepDownCount: 0,
      stepUpCount: 0,
      scaleStepDownCount: 0,
      scaleStepUpCount: 0,
      targetFps: 60,
      targetFrameTimeMs: 1000 / 60,
      decisionFrameCount: 0,
      longFrameCountInWindow: 0,
      stableWindowCount: 0,
      recoveryEligible: false,
      recoveryBlockedReason: "none",
      lastPlaybackSessionId: null,
    },
    ...overrides,
  };
}

test("updates smoothed frame time and DPR diagnostics for the performance HUD", () => {
  const renderLoopRefs = createRenderLoopRefs();
  renderLoopRefs.runtimeDiagnosticsRef.current = createRuntimeDiagnostics();
  const gl = {
    backend: { isWebGLBackend: false },
    setPixelRatio() {},
    setSize() {},
  };

  const { runtimeDiagnostics } = updateRendererDiagnostics(
    {
      state: { size: { width: 1280, height: 720 } },
      controls: {
        lowLoadPlaybackDiagnostics: false,
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        playbackSessionId: 10,
        lastPlaybackEndReason: null,
        lastPlaybackDiagnostics: null,
      },
      time: 1,
      deltaTime: 1 / 60,
      gl,
      renderLoopRefs,
    },
    {
      getTargetDpr() {
        return 2;
      },
      getWallTimeMs() {
        return 100;
      },
    },
  );

  assert.equal(runtimeDiagnostics.currentPixelRatio, 2);
  assert.equal(runtimeDiagnostics.basePixelRatio, 2);
  assert.ok(runtimeDiagnostics.smoothedFrameTimeMs > 0);
  assert.equal(runtimeDiagnostics.rendererMode, "webgpu");
});

test("builds a compact performance HUD snapshot from runtime diagnostics", () => {
  const snapshot = buildPerformanceHudSnapshot(
    createRuntimeDiagnostics({
      smoothedFrameTimeMs: 20,
      currentPixelRatio: 1.5,
      basePixelRatio: 2,
      rendererMode: "webgpu",
      render: {
        visualizationMethod: "raymarch",
        qualityPreset: "auto",
        targetFps: 60,
        requestedRaymarchSteps: 64,
        effectiveRaymarchSteps: 32,
        adaptiveRaymarchActive: true,
      },
    }),
  );

  assert.equal(snapshot.fps, 50);
  assert.equal(snapshot.smoothedFrameTimeMs, 20);
  assert.equal(snapshot.currentPixelRatio, 1.5);
  assert.equal(snapshot.basePixelRatio, 2);
  assert.equal(snapshot.rendererMode, "webgpu");
  assert.equal(snapshot.visualizationMethod, "raymarch");
  assert.equal(snapshot.qualityPreset, "auto");
  assert.equal(snapshot.targetFps, 60);
  assert.equal(snapshot.requestedRenderScale, 1);
  assert.equal(snapshot.renderScale, 1);
  assert.equal(snapshot.requestedRaymarchSteps, 64);
  assert.equal(snapshot.effectiveRaymarchSteps, 32);
  assert.equal(snapshot.adaptiveRaymarchActive, true);
});

test("adapts auto raymarch steps downward under sustained pressure", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics({
    smoothedFrameTimeMs: 19,
    lastFrameTimeMs: 28,
  });
  const runtime = { method: "raymarch" };
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    uniforms: { uRaymarchSteps: { value: 64 } },
    volumeMesh: { material: { steps: 64 } },
    bloomTuning: {},
  };
  const controls = { raymarchSteps: 64, injectTestTone: true };

  for (let index = 0; index < 30; index += 1) {
    updateAdaptiveRaymarchStepBudget({
      controls,
      runtime,
      runtimeState,
      renderProfile: { qualityPreset: "auto" },
      effectiveFrame: { activeModeCount: 6 },
      status: { isPlaying: true, isLiveInputActive: false },
      runtimeDiagnostics,
    });
  }

  assert.equal(runtimeState.requestedRaymarchSteps, 64);
  assert.equal(runtimeState.effectiveRaymarchSteps, 64);
  assert.equal(runtimeState.uniforms.uRaymarchSteps.value, 64);
  assert.ok(runtimeDiagnostics.adaptiveRaymarch.scaleStepDownCount > 0);
  assert.ok(runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale < 1);
  assert.equal(
    runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive,
    true,
  );
});

test("uses the custom profile target fps for adaptive tuning", () => {
  const runtime = { method: "raymarch" };
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    autoRaymarchResumeRung: null,
    autoRaymarchResumeScaleRung: null,
    uniforms: { uRaymarchSteps: { value: 64 } },
    volumeMesh: { material: { steps: 64 } },
  };
  const runtimeDiagnostics = createRuntimeDiagnostics({
    lastFrameTimeMs: 23,
    smoothedFrameTimeMs: 23,
  });

  updateAdaptiveRaymarchStepBudget({
    controls: {
      raymarchSteps: 64,
      injectTestTone: true,
      customPerformanceTargetFps: 48,
    },
    runtime,
    runtimeState,
    renderProfile: { qualityPreset: "custom", renderScale: 1 },
    effectiveFrame: { activeModeCount: 12 },
    status: { isPlaying: true, isLiveInputActive: false },
    runtimeDiagnostics,
  });

  assert.equal(runtimeDiagnostics.adaptiveRaymarch.targetFps, 48);
  assert.equal(
    runtimeDiagnostics.adaptiveRaymarch.targetFrameTimeMs,
    1000 / 48,
  );
});

test("applies a proactive complexity cap before fps pressure ramps up", () => {
  const runtime = { method: "raymarch" };
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    backboneCapacity: 8,
    detailCapacity: 8,
    uniforms: { uRaymarchSteps: { value: 64 } },
    volumeMesh: { material: { steps: 64 } },
    bloomTuning: {},
  };
  const runtimeDiagnostics = createRuntimeDiagnostics({
    lastFrameTimeMs: 16,
    smoothedFrameTimeMs: 16,
  });

  updateAdaptiveRaymarchStepBudget({
    controls: { raymarchSteps: 64, injectTestTone: true },
    runtime,
    runtimeState,
    renderProfile: { qualityPreset: "auto", renderScale: 1 },
    effectiveFrame: {
      averageAmplitude: 144,
      structureSignal: 0.84,
      harmonicity: 0.78,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.9, 2, 3, 4, 0.85, 2, 4, 5, 0.8, 3, 4, 5, 0.75,
        3, 5, 6, 0.7, 4, 5, 6, 0.65, 4, 6, 7, 0.6,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.7, 2, 3, 3, 0.65, 3, 3, 4, 0.6, 3, 4, 4, 0.55, 4, 4, 5, 0.5,
        4, 5, 5, 0.45, 5, 5, 6, 0.4, 5, 6, 6, 0.35,
      ]),
      activeBackboneModeCount: 8,
      activeDetailModeCount: 8,
      activeModeCount: 16,
    },
    status: { isPlaying: true, isLiveInputActive: false },
    runtimeDiagnostics,
  });

  assert.ok(runtimeState.performanceGovernor.complexityScore > 0.5);
  assert.ok(runtimeState.performanceGovernor.proactiveStepBudget < 64);
  assert.ok(runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps < 64);
  assert.ok(runtimeDiagnostics.adaptiveRaymarch.requestedRenderScale < 1);
});

test("restores requested steps when auto adaptation is inactive", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();
  runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  runtimeDiagnostics.adaptiveRaymarch.requestedRaymarchSteps = 64;
  runtimeDiagnostics.adaptiveRaymarch.effectiveRaymarchSteps = 40;
  runtimeDiagnostics.adaptiveRaymarch.currentRung = 3;
  runtimeDiagnostics.adaptiveRaymarch.stepDownCount = 2;
  const runtime = { method: "raymarch" };
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 40,
    uniforms: { uRaymarchSteps: { value: 40 } },
    volumeMesh: { material: { steps: 40 } },
    bloomTuning: {},
  };

  const effectiveStepBudget = updateAdaptiveRaymarchStepBudget({
    controls: { raymarchSteps: 64, injectTestTone: false },
    runtime,
    runtimeState,
    renderProfile: { qualityPreset: "none" },
    effectiveFrame: { activeModeCount: 0 },
    status: { isPlaying: false, isLiveInputActive: false },
    runtimeDiagnostics,
  });

  assert.equal(effectiveStepBudget, 64);
  assert.equal(runtimeState.effectiveRaymarchSteps, 64);
  assert.equal(runtimeState.volumeMesh.material.steps, 64);
  assert.equal(
    runtimeDiagnostics.adaptiveRaymarch.adaptiveRaymarchActive,
    false,
  );
});

test("drops multiple adaptive rungs when the requested step cap is severely over budget", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics({
    smoothedFrameTimeMs: 40,
    lastFrameTimeMs: 41,
  });
  const runtime = { method: "raymarch" };
  const runtimeState = {
    requestedRaymarchSteps: 192,
    effectiveRaymarchSteps: 192,
    uniforms: { uRaymarchSteps: { value: 192 } },
    volumeMesh: { material: { steps: 192 } },
    bloomTuning: {},
  };

  for (let index = 0; index < 30; index += 1) {
    updateAdaptiveRaymarchStepBudget({
      controls: { raymarchSteps: 192, injectTestTone: true },
      runtime,
      runtimeState,
      renderProfile: { qualityPreset: "auto", renderScale: 0.67 },
      effectiveFrame: { activeModeCount: 12 },
      status: { isPlaying: true, isLiveInputActive: false },
      runtimeDiagnostics,
    });
  }

  assert.equal(runtimeState.effectiveRaymarchSteps, 64);
  assert.equal(runtimeDiagnostics.adaptiveRaymarch.currentRung, 6);
  assert.equal(runtimeDiagnostics.adaptiveRaymarch.stepDownCount, 8);
});

test("resumes from the last adapted rung after idle instead of restarting at the requested max", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics({
    smoothedFrameTimeMs: 24,
    lastFrameTimeMs: 24,
  });
  const runtime = { method: "raymarch" };
  const runtimeState = {
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 64,
    uniforms: { uRaymarchSteps: { value: 64 } },
    volumeMesh: { material: { steps: 64 } },
    bloomTuning: {},
  };

  for (let index = 0; index < 30; index += 1) {
    updateAdaptiveRaymarchStepBudget({
      controls: { raymarchSteps: 64, injectTestTone: true },
      runtime,
      runtimeState,
      renderProfile: { qualityPreset: "auto" },
      effectiveFrame: { activeModeCount: 8 },
      status: { isPlaying: true, isLiveInputActive: false },
      runtimeDiagnostics,
    });
  }

  const adaptedRenderScale =
    runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale;
  const adaptedScaleRung = runtimeDiagnostics.adaptiveRaymarch.currentScaleRung;
  assert.ok(adaptedRenderScale < 1);

  updateAdaptiveRaymarchStepBudget({
    controls: { raymarchSteps: 64, injectTestTone: false },
    runtime,
    runtimeState,
    renderProfile: { qualityPreset: "auto" },
    effectiveFrame: { activeModeCount: 0 },
    status: { isPlaying: false, isLiveInputActive: false },
    runtimeDiagnostics,
  });

  assert.equal(runtimeState.effectiveRaymarchSteps, 64);

  updateAdaptiveRaymarchStepBudget({
    controls: { raymarchSteps: 64, injectTestTone: true },
    runtime,
    runtimeState,
    renderProfile: { qualityPreset: "auto" },
    effectiveFrame: { activeModeCount: 8 },
    status: { isPlaying: true, isLiveInputActive: false },
    runtimeDiagnostics,
  });

  assert.equal(runtimeState.effectiveRaymarchSteps, 64);
  assert.equal(
    runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale,
    adaptedRenderScale,
  );
  assert.equal(
    runtimeDiagnostics.adaptiveRaymarch.currentScaleRung,
    adaptedScaleRung,
  );
});

test("keeps paused-playback HUD frame timing tied to render cadence", () => {
  const renderLoopRefs = createRenderLoopRefs();
  renderLoopRefs.runtimeDiagnosticsRef.current = createRuntimeDiagnostics({
    smoothedFrameTimeMs: 16,
    lastFrameWallTimeMs: 100,
  });
  const gl = {
    backend: { isWebGLBackend: false },
    setPixelRatio() {},
    setSize() {},
  };

  const { runtimeDiagnostics } = updateRendererDiagnostics(
    {
      state: { size: { width: 1280, height: 720 } },
      controls: {
        lowLoadPlaybackDiagnostics: false,
      },
      status: {
        isPlaying: false,
        isLiveInputActive: false,
        playbackSessionId: null,
        lastPlaybackEndReason: null,
        lastPlaybackDiagnostics: null,
      },
      time: 2,
      deltaTime: 0,
      gl,
      renderLoopRefs,
    },
    {
      getTargetDpr() {
        return 2;
      },
      getWallTimeMs() {
        return 116;
      },
    },
  );

  assert.equal(runtimeDiagnostics.smoothedFrameTimeMs, 16);
  assert.equal(buildPerformanceHudSnapshot(runtimeDiagnostics).fps, 62.5);
});

test("throttles performance HUD publications to the configured interval", () => {
  const snapshots = [];
  const performanceHudState = {
    lastPublishedAtMs: Number.NEGATIVE_INFINITY,
  };

  const first = publishPerformanceHudSnapshot(
    {
      runtimeDiagnostics: createRuntimeDiagnostics({
        smoothedFrameTimeMs: 25,
        currentPixelRatio: 2,
        basePixelRatio: 2,
      }),
      onPerformanceHudSnapshotChange(snapshot) {
        snapshots.push(snapshot);
      },
      performanceHudState,
    },
    {
      getWallTimeMs() {
        return 100;
      },
    },
  );
  const second = publishPerformanceHudSnapshot(
    {
      runtimeDiagnostics: createRuntimeDiagnostics({
        smoothedFrameTimeMs: 15,
        currentPixelRatio: 1,
        basePixelRatio: 2,
      }),
      onPerformanceHudSnapshotChange(snapshot) {
        snapshots.push(snapshot);
      },
      performanceHudState,
    },
    {
      getWallTimeMs() {
        return 180;
      },
    },
  );
  const third = publishPerformanceHudSnapshot(
    {
      runtimeDiagnostics: createRuntimeDiagnostics({
        smoothedFrameTimeMs: 15,
        currentPixelRatio: 1,
        basePixelRatio: 2,
      }),
      onPerformanceHudSnapshotChange(snapshot) {
        snapshots.push(snapshot);
      },
      performanceHudState,
    },
    {
      getWallTimeMs() {
        return 260;
      },
    },
  );

  assert.equal(first?.smoothedFrameTimeMs, 25);
  assert.equal(second, null);
  assert.equal(third?.smoothedFrameTimeMs, 15);
  assert.equal(snapshots.length, 2);
});

test("refreshes cached control snapshots only when invalidated", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const calls = [];
  const runtime = { method: "raymarch" };
  const runtimeState = { id: "runtime" };
  const featureState = { id: "feature" };
  const controls = { id: "controls" };
  const postNodesRef = { current: { bloomPass: { enabled: true } } };
  const appliers = {
    applySharedControls() {
      calls.push("shared");
      return { shared: true };
    },
    applyOutputControls() {
      calls.push("output");
      return { output: true };
    },
    applyVisualizationControls() {
      calls.push("visualization");
      return { visualization: true };
    },
    applyBloomControls() {
      calls.push("bloom");
      return { bloom: true };
    },
    applyAuditControls() {
      calls.push("audit");
      return { audit: true };
    },
  };

  const firstSnapshot = applyCachedControlSnapshots(
    {
      controls,
      runtime,
      runtimeState,
      featureState,
      gl: {},
      ensurePipeline() {
        return null;
      },
      postNodesRef,
      renderLoopRefs,
    },
    appliers,
  );

  assert.deepEqual(calls, [
    "shared",
    "output",
    "visualization",
    "bloom",
    "audit",
  ]);
  assert.equal(firstSnapshot.hasBloomPass, true);

  calls.length = 0;
  const reusedSnapshot = applyCachedControlSnapshots(
    {
      controls,
      runtime,
      runtimeState,
      featureState,
      gl: {},
      ensurePipeline() {
        return null;
      },
      postNodesRef,
      renderLoopRefs,
    },
    appliers,
  );

  assert.notEqual(reusedSnapshot, firstSnapshot);
  assert.equal(reusedSnapshot.controlsChanged, false);
  assert.deepEqual(calls, []);

  renderLoopRefs.controlCacheRefs.controlVersionRef.current = 1;
  applyCachedControlSnapshots(
    {
      controls,
      runtime,
      runtimeState,
      featureState,
      gl: {},
      ensurePipeline() {
        return null;
      },
      postNodesRef,
      renderLoopRefs,
    },
    appliers,
  );

  assert.deepEqual(calls, [
    "shared",
    "output",
    "visualization",
    "bloom",
    "audit",
  ]);
});

test("resolves feature frames across live, paused, and idle reuse states", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const builtFrame = {
    debug: {},
    backboneSlots: new Float32Array([1, 2]),
  };
  let buildCount = 0;
  const buildFeatureFrame = () => {
    buildCount += 1;
    return builtFrame;
  };
  const baseArgs = {
    audio: {
      readAnalysisSnapshot() {
        return { fft: [] };
      },
    },
    featureState: {},
    runtimeState: {
      uniforms: {
        uRadius: { value: 3 },
      },
    },
    controls: {
      injectTestTone: false,
    },
    liveInputProfile: "voice-tone",
    renderLoopRefs,
    chromesthesiaEnabled: false,
  };

  const liveResult = resolveFeatureFrame(
    {
      ...baseArgs,
      status: {
        isPlaying: true,
        isLiveInputActive: false,
      },
      time: 1,
      clockMode: "playback",
    },
    { buildFeatureFrame },
  );

  assert.equal(buildCount, 1);
  assert.equal(liveResult.featureFrame, builtFrame);
  assert.equal(
    renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current,
    builtFrame,
  );

  const pausedResult = resolveFeatureFrame(
    {
      ...baseArgs,
      status: {
        isPlaying: false,
        isLiveInputActive: false,
      },
      time: 2,
      clockMode: "paused-playback",
    },
    { buildFeatureFrame },
  );

  assert.equal(buildCount, 1);
  assert.notEqual(
    pausedResult.featureFrame,
    renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current,
  );
  assert.deepEqual(
    Array.from(pausedResult.featureFrame.backboneSlots),
    Array.from(
      renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current.backboneSlots,
    ),
  );

  renderLoopRefs.frameCacheRefs.lastIdleFrameRef.current = {
    debug: { idle: true },
  };
  const idleResult = resolveFeatureFrame(
    {
      ...baseArgs,
      status: {
        isPlaying: false,
        isLiveInputActive: false,
      },
      time: 3,
      clockMode: "realtime",
    },
    { buildFeatureFrame },
  );

  assert.equal(buildCount, 1);
  assert.deepEqual(idleResult.featureFrame, { debug: { idle: true } });
});

test("feeds the analyzer and forwards valid hints into feature-frame building", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const analyzerCalls = [];
  const analysisHints = {
    active: true,
    novelty: 0.7,
    transientSalience: 0.4,
  };
  const buildFeatureFrame = (args) => {
    analyzerCalls.push(args);
    return {
      debug: {},
      backboneSlots: new Float32Array([1, 2]),
    };
  };

  resolveFeatureFrame(
    {
      audio: {
        readAnalysisSnapshot() {
          return { fftMagnitudes: new Float32Array([0, 1, 0.4]) };
        },
      },
      featureAnalyzer: {
        enqueueAnalysisFrame(args) {
          analyzerCalls.push({ enqueued: args });
        },
        readHints() {
          return analysisHints;
        },
      },
      featureState: {},
      runtimeState: {
        uniforms: {
          uRadius: { value: 3 },
        },
      },
      controls: {
        injectTestTone: false,
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
      },
      time: 1,
      clockMode: "playback",
      liveInputProfile: "voice-tone",
      renderLoopRefs,
      chromesthesiaEnabled: false,
    },
    { buildFeatureFrame },
  );

  assert.equal(analyzerCalls.length, 2);
  assert.deepEqual(analyzerCalls[1].analysisHints, analysisHints);
  assert.ok(analyzerCalls[0].enqueued.analysisSnapshot);
});

test("reuses cached heavy analysis inside the scheduler interval", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const runtimeDiagnostics = createRuntimeDiagnostics();
  let prepareCount = 0;
  let heavyCount = 0;
  let composeCount = 0;

  const deps = {
    prepareFeatureFrame() {
      prepareCount += 1;
      return {
        analysisMemory: {},
        capacity: 12,
        currentFrameAtMs: prepareCount === 1 ? 1000 : 1012,
        analysisSessionKey: "file:session-1",
        analysisInputsSignature: "sig-a",
        analysisInputMode: "file",
        resolvedAuditSettings: { injectTestTone: false },
        currentFrame: prepareCount,
        silentFeatureFrame: null,
      };
    },
    runHeavyFeatureAnalysis(preparedInputs) {
      heavyCount += 1;
      return {
        preparedInputs,
        debug: { heavyCount },
      };
    },
    composeFeatureFrame({
      preparedInputs,
      analysisResult,
      previousFrame,
      reuseHeavyAnalysis,
    }) {
      composeCount += 1;
      return {
        debug: {
          composedAt: preparedInputs.currentFrameAtMs,
          heavyCount,
          reused: reuseHeavyAnalysis,
          previousFrame,
          analysisResult,
        },
        backboneSlots: new Float32Array([heavyCount, composeCount]),
      };
    },
  };

  const baseArgs = {
    audio: {
      readAnalysisSnapshot() {
        return { fftMagnitudes: new Float32Array([0, 1]) };
      },
    },
    featureAnalyzer: {
      enqueueAnalysisFrame() {},
      readHints() {
        return { active: true, novelty: 0.4 };
      },
    },
    featureState: {},
    runtimeDiagnostics,
    runtimeState: {
      uniforms: {
        uRadius: { value: 3 },
      },
    },
    controls: {
      injectTestTone: false,
    },
    status: {
      isPlaying: true,
      isLiveInputActive: false,
      playbackSessionId: 1,
      audioInputMode: "file",
    },
    clockMode: "playback",
    renderLoopRefs,
    chromesthesiaEnabled: false,
  };

  const first = resolveFeatureFrame(
    {
      ...baseArgs,
      time: 1,
    },
    deps,
  );
  const second = resolveFeatureFrame(
    {
      ...baseArgs,
      time: 1.012,
    },
    deps,
  );

  assert.equal(heavyCount, 1);
  assert.equal(composeCount, 2);
  assert.equal(prepareCount, 2);
  assert.equal(first.featureFrame.debug.reused, false);
  assert.equal(second.featureFrame.debug.reused, true);
  assert.equal(runtimeDiagnostics.analysisScheduler.analysisReuseCount, 1);
  assert.equal(runtimeDiagnostics.analysisScheduler.skippedAnalysisCount, 1);
  assert.equal(
    renderLoopRefs.frameCacheRefs.analysisSchedulerRef.current
      .lastHeavyAnalysisResult.debug.heavyCount,
    1,
  );
});

test("enqueues shared transport frames and composes from engine snapshots", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const runtimeDiagnostics = createRuntimeDiagnostics();
  const enqueuedFrames = [];
  const composed = [];

  const engineSnapshot = {
    analysisSessionKey: "file:session-engine",
    analysisInputsSignature: "sig-engine",
    frameTimeMs: 1000,
    analysisResult: {
      modeSlots: new Float32Array([1, 0, 0, 0.8]),
      referenceModeSlots: new Float32Array([1, 0, 0, 0.4]),
      bandEnergies: new Float32Array([0.5, 0.3, 0.2, 0.1]),
      backboneState: { analysisEngine: "test-engine" },
      detailState: { analysisEngine: "test-engine" },
      bandState: {},
      analyserRms: 0.25,
      avgAmplitude: 20,
      dominantAmplitude: 0.8,
      spectralCentroid: 0.4,
      spectralFlux: 0.3,
      transientEnergy: 0.5,
      beatDetected: false,
      beatStrength: 0,
      beatConfidence: 0,
      beatOnsetDriver: 0,
      beatThreshold: 0,
      sourceNormalization: { inputMode: "file" },
      activeModeCount: 1,
      usedDecay: false,
      sourceMode: "file",
      soundActive: true,
      micActive: false,
      pitchSource: "fft",
      analysisEngine: "worker",
      spectralCandidates: [],
      fftMagnitudes: new Float32Array([0, 1, 0.5]),
      backboneSlots: new Float32Array([1, 0, 0, 0.8]),
      detailSlots: new Float32Array([0, 1, 0, 0.4]),
      activeBackboneModeCount: 1,
      activeDetailModeCount: 1,
      backboneColorSlots: new Float32Array(4),
      detailColorSlots: new Float32Array(4),
      beatPulseId: 0,
      estimatedTempo: 0,
      tempoConfidence: 0,
      beatPhase: 0,
      rhythmicDensity: 0,
      keyTonic: 0,
      keyMode: "major",
      keyConfidence: 0,
      keyTonicHue: 0,
      dominantFrequency: 220,
      liveInputNoiseGateActive: false,
      liveInputHardSilenceActive: false,
      liveInputCalibrationInvalid: false,
      liveInputCalibrationInvalidReason: "none",
      liveInputCalibrationActive: false,
      beatLowBandEnergy: 0,
      micFftNormGain: 1,
      preModalFftPeak: 0.5,
      postNormalizationFftPeak: 0.5,
      baseAnalysisHints: { active: true, novelty: 0.2 },
      lastAnalysisHints: { active: true, novelty: 0.2 },
      debug: null,
    },
  };

  const deps = {
    prepareFeatureFrame() {
      return {
        analysisMemory: {},
        capacity: 12,
        currentFrameAtMs: 1000,
        analysisSessionKey: "file:session-engine",
        analysisInputsSignature: "sig-engine",
        analysisInputMode: "file",
        resolvedAuditSettings: { injectTestTone: false },
        currentFrame: 1,
        silentFeatureFrame: null,
        inputMode: "file",
        sampleRate: 48000,
        fftSize: 2048,
        status: {
          liveInputAnalysisClass: "auto",
        },
        resolvedLiveInputAnalysisClass: "line-feed",
        isAcousticLiveInput: false,
      };
    },
    composeFeatureFrame(args) {
      composed.push(args);
      return {
        debug: { reused: args.reuseHeavyAnalysis },
        backboneSlots: new Float32Array([1, 2]),
      };
    },
  };

  const result = resolveFeatureFrame(
    {
      audio: {
        readAnalysisSnapshot() {
          return {
            fftMagnitudes: new Float32Array([0, 1, 0.5]),
            timeData: new Float32Array([0, 0.1, -0.1]),
          };
        },
      },
      featureAnalyzer: {
        enqueueAnalysisFrame() {},
        readHints() {
          return { active: true, novelty: 0.7, transientSalience: 0.4 };
        },
      },
      featureEngine: {
        enqueueTransportFrame(frame) {
          enqueuedFrames.push(frame);
        },
        readLatestSnapshot() {
          return engineSnapshot;
        },
        getStatus() {
          return {
            latestSnapshotAgeMs: 12,
            publishCount: 4,
            droppedFrameCount: 1,
            transportDropCount: 1,
            publishSkipCount: 2,
            fastSignalUpdateCount: 9,
            structuralUpdateCount: 4,
            chromaUpdateCount: 2,
            tempoUpdateCount: 1,
            latestProcessedFrameId: 9,
            latestPublishedFrameId: 8,
            workerFastSignalMs: 0.4,
            workerStructuralMs: 5.2,
            workerChromaMs: 1.6,
            workerTempoMs: 0.8,
            queueDepth: 0,
            state: "ready",
            reason: "published",
          };
        },
      },
      featureState: {
        capacity: 12,
        audit: { settings: { injectTestTone: false } },
      },
      runtimeDiagnostics,
      runtimeState: {
        uniforms: {
          uRadius: { value: 3 },
        },
      },
      controls: {
        injectTestTone: false,
        structuralImplementation: "dual",
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        playbackSessionId: "session-engine",
        audioInputMode: "file",
        sampleRate: 48000,
        fftSize: 2048,
      },
      time: 1,
      clockMode: "playback",
      renderLoopRefs,
      chromesthesiaEnabled: false,
    },
    deps,
  );

  assert.equal(enqueuedFrames.length, 1);
  assert.equal(enqueuedFrames[0].sessionKey, "file:session-engine");
  assert.equal(enqueuedFrames[0].structuralImplementation, "dual");
  assert.deepEqual(enqueuedFrames[0].analysisHints, {
    active: true,
    novelty: 0.7,
    transientSalience: 0.4,
  });
  assert.equal(composed.length, 1);
  assert.equal(composed[0].reuseHeavyAnalysis, true);
  assert.equal(composed[0].analysisResult.analysisEngine, "worker");
  assert.equal(runtimeDiagnostics.engine.publishCount, 4);
  assert.equal(runtimeDiagnostics.engine.snapshotAgeMs, 12);
  assert.equal(runtimeDiagnostics.engine.publishSkipCount, 2);
  assert.equal(runtimeDiagnostics.engine.chromaUpdateCount, 2);
  assert.equal(runtimeDiagnostics.engine.tempoUpdateCount, 1);
  assert.equal(result.featureFrame.debug.reused, true);
});

test("rejects worker snapshots when the analysis signature changed", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const runtimeDiagnostics = createRuntimeDiagnostics();
  const enqueuedFrames = [];
  const composed = [];
  const fallbackFrame = { debug: { fallback: true } };
  renderLoopRefs.frameCacheRefs.lastLiveFrameRef.current = fallbackFrame;

  const engineSnapshot = {
    analysisSessionKey: "file:session-engine",
    analysisInputsSignature: "sig-legacy",
    frameTimeMs: 1000,
    analysisResult: {
      modeSlots: new Float32Array([1, 0, 0, 0.8]),
      referenceModeSlots: new Float32Array([1, 0, 0, 0.4]),
      bandEnergies: new Float32Array([0.5, 0.3, 0.2, 0.1]),
      backboneState: { analysisEngine: "test-engine" },
      detailState: { analysisEngine: "test-engine" },
      bandState: {},
      analyserRms: 0.25,
      avgAmplitude: 20,
      dominantAmplitude: 0.8,
      spectralCentroid: 0.4,
      spectralFlux: 0.3,
      transientEnergy: 0.5,
      beatDetected: false,
      beatStrength: 0,
      beatConfidence: 0,
      beatOnsetDriver: 0,
      beatThreshold: 0,
      sourceNormalization: { inputMode: "file" },
      activeModeCount: 1,
      usedDecay: false,
      sourceMode: "file",
      soundActive: true,
      micActive: false,
      pitchSource: "fft",
      analysisEngine: "worker",
      spectralCandidates: [],
      fftMagnitudes: new Float32Array([0, 1, 0.5]),
      backboneSlots: new Float32Array([1, 0, 0, 0.8]),
      detailSlots: new Float32Array([0, 1, 0, 0.4]),
      activeBackboneModeCount: 1,
      activeDetailModeCount: 1,
      backboneColorSlots: new Float32Array(4),
      detailColorSlots: new Float32Array(4),
      beatPulseId: 0,
      estimatedTempo: 0,
      tempoConfidence: 0,
      beatPhase: 0,
      rhythmicDensity: 0,
      keyTonic: 0,
      keyMode: "major",
      keyConfidence: 0,
      keyTonicHue: 0,
      dominantFrequency: 220,
      liveInputNoiseGateActive: false,
      liveInputHardSilenceActive: false,
      liveInputCalibrationInvalid: false,
      liveInputCalibrationInvalidReason: "none",
      liveInputCalibrationActive: false,
      beatLowBandEnergy: 0,
      micFftNormGain: 1,
      preModalFftPeak: 0.5,
      postNormalizationFftPeak: 0.5,
      baseAnalysisHints: { active: true, novelty: 0.2 },
      lastAnalysisHints: { active: true, novelty: 0.2 },
      debug: null,
    },
  };

  const deps = {
    prepareFeatureFrame() {
      return {
        analysisMemory: {},
        capacity: 12,
        currentFrameAtMs: 1000,
        analysisSessionKey: "file:session-engine",
        analysisInputsSignature: "sig-dual",
        analysisInputMode: "file",
        resolvedAuditSettings: { injectTestTone: false },
        currentFrame: 1,
        silentFeatureFrame: null,
        inputMode: "file",
      };
    },
    composeFeatureFrame(args) {
      composed.push(args);
      return {
        debug: { reused: args.reuseHeavyAnalysis },
        backboneSlots: new Float32Array([1, 2]),
      };
    },
  };

  const result = resolveFeatureFrame(
    {
      audio: {
        readAnalysisSnapshot() {
          return {
            fftMagnitudes: new Float32Array([0, 1, 0.5]),
            timeData: new Float32Array([0, 0.1, -0.1]),
          };
        },
      },
      featureAnalyzer: {
        enqueueAnalysisFrame() {},
        readHints() {
          return { active: true, novelty: 0.7, transientSalience: 0.4 };
        },
      },
      featureEngine: {
        enqueueTransportFrame(frame) {
          enqueuedFrames.push(frame);
        },
        readLatestSnapshot() {
          return engineSnapshot;
        },
        getStatus() {
          return {
            latestSnapshotAgeMs: 12,
            publishCount: 4,
            droppedFrameCount: 1,
            transportDropCount: 1,
            publishSkipCount: 2,
            fastSignalUpdateCount: 9,
            structuralUpdateCount: 4,
            chromaUpdateCount: 2,
            tempoUpdateCount: 1,
            latestProcessedFrameId: 9,
            latestPublishedFrameId: 8,
            workerFastSignalMs: 0.4,
            workerStructuralMs: 5.2,
            workerChromaMs: 1.6,
            workerTempoMs: 0.8,
            queueDepth: 0,
            state: "ready",
            reason: "published",
          };
        },
      },
      featureState: {
        capacity: 12,
        audit: { settings: { injectTestTone: false } },
      },
      runtimeDiagnostics,
      runtimeState: {
        uniforms: {
          uRadius: { value: 3 },
        },
      },
      controls: {
        injectTestTone: false,
        structuralImplementation: "dual",
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        playbackSessionId: "session-engine",
        audioInputMode: "file",
        sampleRate: 48000,
        fftSize: 2048,
      },
      time: 1,
      clockMode: "playback",
      renderLoopRefs,
      chromesthesiaEnabled: false,
    },
    deps,
  );

  assert.equal(enqueuedFrames.length, 1);
  assert.equal(composed.length, 0);
  assert.equal(result.featureFrame, fallbackFrame);
});

test("passes structural implementation into prepared feature inputs for worker mode", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const preparedImplementations = [];
  const enqueuedFrames = [];

  const deps = {
    prepareFeatureFrame(args) {
      preparedImplementations.push(args.structuralImplementation ?? null);
      return {
        analysisMemory: {},
        capacity: 12,
        currentFrameAtMs: 1000,
        analysisSessionKey: "file:session-engine",
        analysisInputsSignature: `sig-${args.structuralImplementation}`,
        analysisInputMode: "file",
        resolvedAuditSettings: { injectTestTone: false },
        currentFrame: 1,
        silentFeatureFrame: null,
        inputMode: "file",
      };
    },
    composeFeatureFrame(args) {
      return {
        debug: { reused: args.reuseHeavyAnalysis },
        backboneSlots: new Float32Array([1, 2]),
      };
    },
  };

  const result = resolveFeatureFrame(
    {
      audio: {
        readAnalysisSnapshot() {
          return {
            fftMagnitudes: new Float32Array([0, 1, 0.5]),
            timeData: new Float32Array([0, 0.1, -0.1]),
          };
        },
      },
      featureAnalyzer: {
        enqueueAnalysisFrame() {},
        readHints() {
          return { active: true, novelty: 0.7, transientSalience: 0.4 };
        },
      },
      featureEngine: {
        enqueueTransportFrame(frame) {
          enqueuedFrames.push(frame);
        },
        readLatestSnapshot() {
          return {
            analysisSessionKey: "file:session-engine",
            analysisInputsSignature: "sig-dual",
            frameTimeMs: 1000,
            analysisResult: {
              modeSlots: new Float32Array([1, 0, 0, 0.8]),
              signalModeSlots: new Float32Array([1, 0, 0, 0.8]),
              referenceModeSlots: new Float32Array([1, 0, 0, 0.4]),
              signalReferenceModeSlots: new Float32Array([1, 0, 0, 0.4]),
              bandEnergies: new Float32Array([0.5, 0.3, 0.2, 0.1]),
              backboneState: { analysisEngine: "test-engine" },
              detailState: { analysisEngine: "test-engine" },
              bandState: {},
              analyserRms: 0.25,
              avgAmplitude: 20,
              dominantAmplitude: 0.8,
              spectralCentroid: 0.4,
              spectralFlux: 0.3,
              transientEnergy: 0.5,
              beatDetected: false,
              beatStrength: 0,
              beatConfidence: 0,
              beatOnsetDriver: 0,
              beatThreshold: 0,
              sourceNormalization: { inputMode: "file" },
              activeModeCount: 1,
              usedDecay: false,
              sourceMode: "file",
              soundActive: true,
              micActive: false,
              pitchSource: "fft",
              analysisEngine: "worker",
              spectralCandidates: [],
              fftMagnitudes: new Float32Array([0, 1, 0.5]),
              backboneSlots: new Float32Array([1, 0, 0, 0.8]),
              detailSlots: new Float32Array([0, 1, 0, 0.4]),
              activeBackboneModeCount: 1,
              activeDetailModeCount: 1,
              backboneColorSlots: new Float32Array(4),
              detailColorSlots: new Float32Array(4),
              beatPulseId: 0,
              estimatedTempo: 0,
              tempoConfidence: 0,
              beatPhase: 0,
              rhythmicDensity: 0,
              keyTonic: 0,
              keyMode: "major",
              keyConfidence: 0,
              keyTonicHue: 0,
              dominantFrequency: 220,
              liveInputNoiseGateActive: false,
              liveInputHardSilenceActive: false,
              liveInputCalibrationInvalid: false,
              liveInputCalibrationInvalidReason: "none",
              liveInputCalibrationActive: false,
              beatLowBandEnergy: 0,
              micFftNormGain: 1,
              preModalFftPeak: 0.5,
              postNormalizationFftPeak: 0.5,
              baseAnalysisHints: { active: true, novelty: 0.2 },
              lastAnalysisHints: { active: true, novelty: 0.2 },
              debug: null,
            },
          };
        },
        getStatus() {
          return {
            latestSnapshotAgeMs: 12,
            publishCount: 1,
            droppedFrameCount: 0,
            transportDropCount: 0,
            publishSkipCount: 0,
            fastSignalUpdateCount: 1,
            structuralUpdateCount: 1,
            chromaUpdateCount: 0,
            tempoUpdateCount: 0,
            latestProcessedFrameId: 1,
            latestPublishedFrameId: 1,
            workerFastSignalMs: 0.4,
            workerStructuralMs: 5.2,
            workerChromaMs: 0,
            workerTempoMs: 0,
            queueDepth: 0,
            state: "ready",
            reason: "published",
          };
        },
      },
      featureState: {
        capacity: 12,
        audit: { settings: { injectTestTone: false } },
      },
      runtimeDiagnostics: createRuntimeDiagnostics(),
      runtimeState: {
        uniforms: {
          uRadius: { value: 3 },
        },
      },
      controls: {
        injectTestTone: false,
        structuralImplementation: "dual",
      },
      status: {
        isPlaying: true,
        isLiveInputActive: false,
        playbackSessionId: "session-engine",
        audioInputMode: "file",
        sampleRate: 48000,
        fftSize: 2048,
      },
      time: 1,
      clockMode: "playback",
      renderLoopRefs,
      chromesthesiaEnabled: false,
    },
    deps,
  );

  assert.deepEqual(preparedImplementations, ["dual"]);
  assert.equal(enqueuedFrames[0].structuralImplementation, "dual");
  assert.equal(result.featureFrame.debug.reused, true);
});

test("forces heavy analysis when the analysis signature changes", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const runtimeDiagnostics = createRuntimeDiagnostics();
  let prepareCount = 0;
  let heavyCount = 0;

  const deps = {
    prepareFeatureFrame() {
      prepareCount += 1;
      return {
        analysisMemory: {},
        capacity: 12,
        currentFrameAtMs: prepareCount === 1 ? 2000 : 2010,
        analysisSessionKey: "file:session-2",
        analysisInputsSignature: prepareCount === 1 ? "sig-a" : "sig-b",
        analysisInputMode: "file",
        resolvedAuditSettings: { injectTestTone: false },
        currentFrame: prepareCount,
        silentFeatureFrame: null,
      };
    },
    runHeavyFeatureAnalysis(preparedInputs) {
      heavyCount += 1;
      return {
        preparedInputs,
        debug: { heavyCount },
      };
    },
    composeFeatureFrame({ preparedInputs, reuseHeavyAnalysis }) {
      return {
        debug: {
          composedAt: preparedInputs.currentFrameAtMs,
          reused: reuseHeavyAnalysis,
        },
        backboneSlots: new Float32Array([1]),
      };
    },
  };

  const baseArgs = {
    audio: {
      readAnalysisSnapshot() {
        return { fftMagnitudes: new Float32Array([0, 1]) };
      },
    },
    featureAnalyzer: {
      enqueueAnalysisFrame() {},
      readHints() {
        return { active: true, novelty: 0.4 };
      },
    },
    featureState: {},
    runtimeDiagnostics,
    runtimeState: {
      uniforms: {
        uRadius: { value: 3 },
      },
    },
    controls: {
      injectTestTone: false,
    },
    status: {
      isPlaying: true,
      isLiveInputActive: false,
      playbackSessionId: 2,
      audioInputMode: "file",
    },
    clockMode: "playback",
    renderLoopRefs,
    chromesthesiaEnabled: false,
  };

  resolveFeatureFrame(
    {
      ...baseArgs,
      time: 2,
    },
    deps,
  );
  const second = resolveFeatureFrame(
    {
      ...baseArgs,
      time: 2.01,
    },
    deps,
  );

  assert.equal(heavyCount, 2);
  assert.equal(second.featureFrame.debug.reused, false);
  assert.equal(runtimeDiagnostics.analysisScheduler.forcedAnalysisCount, 2);
});

test("emits live input runtime status changes only when the status meaningfully changes", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const emitted = [];
  const args = {
    status: {
      isLiveInputActive: true,
    },
    featureFrame: {
      debug: {
        liveInputCalibrationActive: true,
        liveInputProfile: "studio",
      },
    },
    liveInputProfile: "voice-tone",
    setLiveInputRuntimeStatus(value) {
      emitted.push(value);
    },
    renderLoopRefs,
  };

  syncLiveInputRuntimeStatus(args);
  syncLiveInputRuntimeStatus(args);

  assert.equal(emitted.length, 1);
  assert.equal(typeof emitted[0], "function");
  const activeStatus = emitted[0]();
  assert.equal(activeStatus.active, true);
  assert.equal(activeStatus.phase, "calibrating");
  assert.equal(activeStatus.calibrationActive, true);
  assert.equal(activeStatus.resolvedAnalysisClass, "acoustic-mic");
  assert.equal(activeStatus.errorCode, "none");

  syncLiveInputRuntimeStatus({
    ...args,
    status: {
      isLiveInputActive: false,
    },
    featureFrame: {
      debug: {},
    },
  });

  assert.equal(emitted.length, 2);
  assert.equal(typeof emitted[1], "function");
  const idleStatus = emitted[1]();
  assert.equal(idleStatus.active, false);
  assert.equal(idleStatus.phase, "idle");
  assert.equal(idleStatus.calibrationActive, false);
  assert.equal(idleStatus.errorCode, "none");
});

test("applies reactive bloom tuning after the runtime tick", () => {
  const bloomPass = {
    strength: { value: 0.2 },
    radius: { value: 0.08 },
    threshold: { value: 0.4 },
  };

  const reactiveBloom = applyReactiveBloomState({
    controls: {
      bloomEnabled: true,
    },
    runtimeState: {
      bloomTuning: {
        effectiveStrength: 0.31,
        effectiveRadius: 0.045,
        effectiveThreshold: 0.52,
      },
    },
    postNodesRef: {
      current: { bloomPass },
    },
    bloom: {
      strength: 0.2,
      radius: 0.08,
      threshold: 0.4,
    },
  });

  assert.deepEqual(reactiveBloom, {
    strength: 0.2,
    radius: 0.08,
    threshold: 0.4,
  });
  assert.equal(bloomPass.strength.value, 0.31);
  assert.equal(bloomPass.radius.value, 0.045);
  assert.equal(bloomPass.threshold.value, 0.52);
});

test("deletes the audit snapshot when audit publishing is disabled", () => {
  const originalWindow = globalThis.window;
  const markedReady = [];
  const controlSnapshots = [];

  globalThis.window = {
    __baryonRendererInfo: { backend: "webgpu" },
    __baryonAuditSnapshot: { stale: true },
    __baryonControlState: { stale: true },
  };

  try {
    publishDevtoolsSnapshots(
      createDevtoolsPublishArgs({
        controls: {
          auditEnabled: false,
        },
        runtimeState: {
          debugSnapshot: {
            debug: true,
          },
        },
        status: {
          playbackSessionId: 7,
          lastPlaybackEndReason: null,
          lastPlaybackDiagnostics: null,
        },
        featureState: {
          audit: {
            frame: 1,
          },
        },
        runtimeDiagnostics: {
          sample: true,
        },
        sceneSnapshot: { rotationY: 0 },
        audio: {
          getLiveInputSettings() {
            return { echoCancellation: true };
          },
        },
      }),
      createDevtoolsDeps({ controlSnapshots, markedReady }),
    );

    assert.equal(globalThis.window.__baryonAuditSnapshot, undefined);
    assert.equal(controlSnapshots.length, 1);
    assert.equal(markedReady.length, 1);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("publishes the audit snapshot payload and logs on the configured interval", () => {
  const originalWindow = globalThis.window;
  const markedReady = [];
  const controlSnapshots = [];
  const auditLogs = [];

  globalThis.window = {
    __baryonRendererInfo: { backend: "webgpu" },
  };

  try {
    publishDevtoolsSnapshots(
      createDevtoolsPublishArgs({
        runtime: {
          method: "cymatics2d",
        },
      }),
      createDevtoolsDeps({ controlSnapshots, auditLogs, markedReady }),
    );

    assert.equal(globalThis.window.__baryonAuditSnapshot.debug, "audit");
    assert.equal(
      globalThis.window.__baryonAuditSnapshot.visualizationMethod,
      "cymatics2d",
    );
    assert.deepEqual(globalThis.window.__baryonAuditSnapshot.audioDiagnostics, {
      playbackSessionId: 8,
      lastPlaybackEndReason: "premature",
      lastPlaybackDiagnostics: { id: 1 },
      runtime: { snapshot: { sample: "runtime" } },
    });
    assert.equal(auditLogs.length, 1);
    assert.deepEqual(auditLogs[0], [
      "[Baryon audit]",
      globalThis.window.__baryonAuditSnapshot,
    ]);
    assert.equal(controlSnapshots.length, 1);
    assert.equal(markedReady.length, 1);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("skips audit logging and control snapshot publication during low-load playback", () => {
  const originalWindow = globalThis.window;
  const markedReady = [];
  const controlSnapshots = [];
  const auditLogs = [];

  globalThis.window = {
    __baryonRendererInfo: { backend: "webgpu" },
  };

  try {
    publishDevtoolsSnapshots(
      createDevtoolsPublishArgs({
        lowLoadActive: true,
      }),
      createDevtoolsDeps({ controlSnapshots, auditLogs, markedReady }),
    );

    assert.equal(globalThis.window.__baryonAuditSnapshot.debug, "audit");
    assert.equal(controlSnapshots.length, 0);
    assert.equal(auditLogs.length, 0);
    assert.equal(markedReady.length, 1);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("publishes the control snapshot with the legacy raymarch alias", () => {
  const originalWindow = globalThis.window;
  const controlSnapshots = [];

  globalThis.window = {
    __baryonRendererInfo: { backend: "webgpu" },
  };

  try {
    publishDevtoolsSnapshots(
      createDevtoolsPublishArgs({
        controls: {
          auditEnabled: false,
        },
      }),
      createDevtoolsDeps({ controlSnapshots }),
    );

    assert.equal(controlSnapshots.length, 1);
    assert.deepEqual(globalThis.window.__baryonControlState.visualization, {
      visualization: true,
    });
    assert.deepEqual(globalThis.window.__baryonControlState.raymarch, {
      visualization: true,
    });
  } finally {
    globalThis.window = originalWindow;
  }
});

test("marks the runtime ready whenever devtools publishing is enabled", () => {
  const originalWindow = globalThis.window;
  const markedReady = [];

  globalThis.window = {
    __baryonRendererInfo: { backend: "webgpu" },
  };

  try {
    publishDevtoolsSnapshots(
      createDevtoolsPublishArgs({
        controls: {
          auditEnabled: false,
        },
        lowLoadActive: true,
      }),
      createDevtoolsDeps({ markedReady }),
    );

    assert.equal(markedReady.length, 1);
  } finally {
    globalThis.window = originalWindow;
  }
});
