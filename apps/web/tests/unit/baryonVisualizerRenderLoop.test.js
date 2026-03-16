import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCachedControlSnapshots,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  syncMicRuntimeStatus,
} from "../../src/components/hooks/baryonVisualizerRenderLoop.js";

function createRenderLoopRefs() {
  return {
    runtimeDiagnosticsRef: { current: null },
    pixelRatioRef: { current: null },
    lastAudioIssueSignatureRef: { current: null },
    lastMicRuntimeStatusRef: { current: null },
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
      getMicSettings() {
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
    micProfile: "voice-tone",
    renderLoopRefs,
    chromesthesiaEnabled: false,
  };

  const liveResult = resolveFeatureFrame(
    {
      ...baseArgs,
      status: {
        isPlaying: true,
        isMicActive: false,
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
        isMicActive: false,
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
        isMicActive: false,
      },
      time: 3,
      clockMode: "realtime",
    },
    { buildFeatureFrame },
  );

  assert.equal(buildCount, 1);
  assert.deepEqual(idleResult.featureFrame, { debug: { idle: true } });
});

test("emits mic runtime status changes only when the status meaningfully changes", () => {
  const renderLoopRefs = createRenderLoopRefs();
  const emitted = [];
  const args = {
    status: {
      isMicActive: true,
    },
    featureFrame: {
      debug: {
        micCalibrationActive: true,
        micProfile: "studio",
      },
    },
    micProfile: "voice-tone",
    setMicRuntimeStatus(value) {
      emitted.push(value);
    },
    renderLoopRefs,
  };

  syncMicRuntimeStatus(args);
  syncMicRuntimeStatus(args);

  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], {
    active: true,
    calibrating: true,
    profile: "studio",
  });

  syncMicRuntimeStatus({
    ...args,
    status: {
      isMicActive: false,
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
          getMicSettings() {
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
