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
  updateRendererDiagnostics,
} from "../../src/components/hooks/baryonVisualizerRenderLoop.js";

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
    }),
  );

  assert.equal(snapshot.fps, 50);
  assert.equal(snapshot.smoothedFrameTimeMs, 20);
  assert.equal(snapshot.currentPixelRatio, 1.5);
  assert.equal(snapshot.basePixelRatio, 2);
  assert.equal(snapshot.rendererMode, "webgpu");
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

  assert.equal(reusedSnapshot, firstSnapshot);
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
  assert.deepEqual(emitted[0], {
    active: true,
    calibrating: true,
    profile: "studio",
  });

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
  assert.deepEqual(emitted[1], {
    active: false,
    calibrating: false,
    profile: "voice-tone",
  });
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
    strength: 0.31,
    radius: 0.045,
    threshold: 0.52,
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
