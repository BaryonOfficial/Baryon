import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimePerfSnapshot,
  clearFrameCache,
  createRuntimeDiagnostics,
  shouldPreservePausedFrameOnControlsChange,
  shouldReuseIdleFrame,
  snapshotRuntimeDiagnostics,
} from "../../../../packages/app-shell/src/components/hooks/baryonVisualizerRuntimeState.js";

test("preserves paused frames only for output presentation changes", () => {
  assert.equal(
    shouldPreservePausedFrameOnControlsChange(
      {
        outputMode: "transparent",
        outputBackgroundColor: "#000000",
        bloomStrength: 1,
      },
      {
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
        bloomStrength: 1,
      },
    ),
    true,
  );

  assert.equal(
    shouldPreservePausedFrameOnControlsChange(
      {
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
        bloomStrength: 1,
      },
      {
        outputMode: "opaque",
        outputBackgroundColor: "#ffffff",
        bloomStrength: 1,
      },
    ),
    true,
  );

  assert.equal(
    shouldPreservePausedFrameOnControlsChange(
      {
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
        bloomStrength: 1,
      },
      {
        outputMode: "opaque",
        outputBackgroundColor: "#000000",
        bloomStrength: 2,
      },
    ),
    false,
  );
});

test("reuses idle frames only while playback and mic input are inactive", () => {
  assert.equal(
    shouldReuseIdleFrame(
      {
        isPlaying: false,
        isLiveInputActive: false,
      },
      {
        injectTestTone: false,
      },
    ),
    true,
  );

  assert.equal(
    shouldReuseIdleFrame(
      {
        isPlaying: true,
        isLiveInputActive: false,
      },
      {
        injectTestTone: false,
      },
    ),
    false,
  );

  assert.equal(
    shouldReuseIdleFrame(
      {
        isPlaying: false,
        isLiveInputActive: true,
      },
      {
        injectTestTone: false,
      },
    ),
    false,
  );

  assert.equal(
    shouldReuseIdleFrame(
      {
        isPlaying: false,
        isLiveInputActive: false,
      },
      {
        injectTestTone: true,
      },
    ),
    false,
  );
});

test("clears all cached frame refs together", () => {
  const frameCacheRefs = {
    lastLiveFrameRef: { current: { id: "live" } },
    lastActiveFrameRef: { current: { id: "active" } },
    lastIdleFrameRef: { current: { id: "idle" } },
    analysisSchedulerRef: {
      current: {
        lastHeavyAnalysisAtMs: 100,
        lastHeavyAnalysisResult: { id: "heavy" },
        lastComposedFeatureFrame: { id: "compose" },
        lastAnalysisSessionKey: "session",
        lastAnalysisInputsSignature: "sig",
      },
    },
  };

  clearFrameCache(frameCacheRefs);

  assert.equal(frameCacheRefs.lastLiveFrameRef.current, null);
  assert.equal(frameCacheRefs.lastActiveFrameRef.current, null);
  assert.equal(frameCacheRefs.lastIdleFrameRef.current, null);
  assert.equal(
    frameCacheRefs.analysisSchedulerRef.current.lastHeavyAnalysisResult,
    null,
  );
});

test("clones nested runtime diagnostics snapshots", () => {
  const diagnostics = createRuntimeDiagnostics();
  diagnostics.lastLongFrame = { durationMs: 44 };
  diagnostics.lastVisibilityChange = { state: "hidden" };
  diagnostics.lastRendererModeChange = { mode: "webgpu" };
  diagnostics.lastPlaybackIssue = { reason: "premature" };
  diagnostics.worstFrameTimeMs = 52;
  diagnostics.longFrameCount = 4;
  diagnostics.frameDrops.framesOver16_7Ms = 10;
  diagnostics.frameDrops.framesOver25Ms = 6;
  diagnostics.frameDrops.framesOver33_3Ms = 4;
  diagnostics.frameDrops.framesOver50Ms = 1;
  diagnostics.frameDrops.recentLongFramesMs.push(44, 52);
  diagnostics.analysisScheduler.analysisReuseCount = 3;
  diagnostics.render.visualizationMethod = "raymarch";
  diagnostics.render.qualityPreset = "auto";
  diagnostics.render.renderScale = 0.75;
  diagnostics.render.requestedRenderScale = 1;
  diagnostics.render.traaEnabled = true;
  diagnostics.render.bloomAllowed = true;
  diagnostics.render.bloomEnabled = true;
  diagnostics.render.raymarchStepBudget = 64;
  diagnostics.render.requestedRaymarchSteps = 64;
  diagnostics.render.effectiveRaymarchSteps = 48;
  diagnostics.render.adaptiveRaymarchActive = true;
  diagnostics.render.adaptiveStepDownCount = 2;
  diagnostics.render.adaptiveStepUpCount = 1;
  diagnostics.render.targetFps = 60;
  diagnostics.render.targetFrameTimeMs = 1000 / 60;
  diagnostics.render.activeBackboneModeCount = 3;
  diagnostics.render.activeDetailModeCount = 5;
  diagnostics.render.activeModeCount = 8;
  diagnostics.postProcess.traaNodeActive = true;
  diagnostics.postProcess.bloomPassPresent = true;
  diagnostics.postProcess.bloomComposeEnabled = true;
  diagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  diagnostics.adaptiveRaymarch.requestedRaymarchSteps = 64;
  diagnostics.adaptiveRaymarch.effectiveRaymarchSteps = 48;
  diagnostics.adaptiveRaymarch.requestedRenderScale = 1;
  diagnostics.adaptiveRaymarch.effectiveRenderScale = 0.75;
  diagnostics.adaptiveRaymarch.currentRung = 4;
  diagnostics.adaptiveRaymarch.currentScaleRung = 3;
  diagnostics.adaptiveRaymarch.stepDownCount = 2;
  diagnostics.adaptiveRaymarch.stepUpCount = 1;
  diagnostics.adaptiveRaymarch.scaleStepDownCount = 1;
  diagnostics.adaptiveRaymarch.scaleStepUpCount = 0;
  diagnostics.adaptiveRaymarch.recoveryEligible = false;
  diagnostics.adaptiveRaymarch.recoveryBlockedReason = "low-energy";
  diagnostics.adaptiveRaymarch.lastPlaybackSessionId = "song-1";

  const snapshot = snapshotRuntimeDiagnostics(diagnostics);
  diagnostics.lastLongFrame.durationMs = 99;
  diagnostics.lastVisibilityChange.state = "visible";
  diagnostics.lastRendererModeChange.mode = "webgl";
  diagnostics.lastPlaybackIssue.reason = "interrupted";
  diagnostics.worstFrameTimeMs = 99;
  diagnostics.longFrameCount = 10;
  diagnostics.frameDrops.framesOver16_7Ms = 20;
  diagnostics.frameDrops.framesOver25Ms = 11;
  diagnostics.frameDrops.framesOver33_3Ms = 7;
  diagnostics.frameDrops.framesOver50Ms = 2;
  diagnostics.frameDrops.recentLongFramesMs.push(88);
  diagnostics.analysisScheduler.analysisReuseCount = 7;
  diagnostics.render.visualizationMethod = "cymatics-2d";
  diagnostics.render.qualityPreset = "none";
  diagnostics.render.renderScale = 1;
  diagnostics.render.traaEnabled = false;
  diagnostics.render.bloomAllowed = false;
  diagnostics.render.bloomEnabled = false;
  diagnostics.render.raymarchStepBudget = 0;
  diagnostics.render.requestedRaymarchSteps = 32;
  diagnostics.render.effectiveRaymarchSteps = 32;
  diagnostics.render.adaptiveRaymarchActive = false;
  diagnostics.render.adaptiveStepDownCount = 0;
  diagnostics.render.adaptiveStepUpCount = 0;
  diagnostics.render.activeBackboneModeCount = 1;
  diagnostics.render.activeDetailModeCount = 1;
  diagnostics.render.activeModeCount = 2;
  diagnostics.postProcess.traaNodeActive = false;
  diagnostics.postProcess.bloomPassPresent = false;
  diagnostics.postProcess.bloomComposeEnabled = false;
  diagnostics.adaptiveRaymarch.effectiveRaymarchSteps = 32;

  assert.deepEqual(snapshot.lastLongFrame, { durationMs: 44 });
  assert.deepEqual(snapshot.lastVisibilityChange, { state: "hidden" });
  assert.deepEqual(snapshot.lastRendererModeChange, { mode: "webgpu" });
  assert.deepEqual(snapshot.lastPlaybackIssue, { reason: "premature" });
  assert.equal(snapshot.worstFrameTimeMs, 52);
  assert.equal(snapshot.longFrameCount, 4);
  assert.deepEqual(snapshot.frameDrops, {
    framesOver16_7Ms: 10,
    framesOver25Ms: 6,
    framesOver33_3Ms: 4,
    framesOver50Ms: 1,
    recentLongFramesMs: [44, 52],
  });
  assert.deepEqual(snapshot.analysisScheduler, {
    analysisReuseCount: 3,
    analysisAgeMs: 0,
    forcedAnalysisCount: 0,
    skippedAnalysisCount: 0,
  });
  assert.deepEqual(snapshot.render, {
    visualizationMethod: "raymarch",
    qualityPreset: "auto",
    renderScale: 0.75,
    requestedRenderScale: 1,
    traaEnabled: true,
    bloomAllowed: true,
    bloomEnabled: true,
    raymarchStepBudget: 64,
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 48,
    adaptiveRaymarchActive: true,
    adaptiveStepDownCount: 2,
    adaptiveStepUpCount: 1,
    targetFps: 60,
    targetFrameTimeMs: 1000 / 60,
    activeBackboneModeCount: 3,
    activeDetailModeCount: 5,
    activeModeCount: 8,
  });
  assert.deepEqual(snapshot.postProcess, {
    traaNodeActive: true,
    bloomPassPresent: true,
    bloomComposeEnabled: true,
  });
  assert.deepEqual(snapshot.adaptiveRaymarch, {
    adaptiveRaymarchActive: true,
    requestedRaymarchSteps: 64,
    effectiveRaymarchSteps: 48,
    requestedRenderScale: 1,
    effectiveRenderScale: 0.75,
    currentRung: 4,
    currentScaleRung: 3,
    stepDownCount: 2,
    stepUpCount: 1,
    scaleStepDownCount: 1,
    scaleStepUpCount: 0,
    targetFps: 60,
    targetFrameTimeMs: 1000 / 60,
    decisionFrameCount: 0,
    longFrameCountInWindow: 0,
    stableWindowCount: 0,
    recoveryEligible: false,
    recoveryBlockedReason: "low-energy",
    lastPlaybackSessionId: "song-1",
  });
});

test("publishes frame-drop counters and post-process attribution", () => {
  const diagnostics = createRuntimeDiagnostics();
  diagnostics.smoothedFrameTimeMs = 20;
  diagnostics.worstFrameTimeMs = 47;
  diagnostics.longFrameCount = 3;
  diagnostics.frameDrops.framesOver16_7Ms = 14;
  diagnostics.frameDrops.framesOver25Ms = 8;
  diagnostics.frameDrops.framesOver33_3Ms = 3;
  diagnostics.frameDrops.framesOver50Ms = 0;
  diagnostics.frameDrops.recentLongFramesMs = [34.5, 47];
  diagnostics.render.visualizationMethod = "raymarch";
  diagnostics.render.qualityPreset = "auto";
  diagnostics.render.renderScale = 1;
  diagnostics.render.traaEnabled = true;
  diagnostics.render.bloomAllowed = true;
  diagnostics.render.bloomEnabled = false;
  diagnostics.render.requestedRaymarchSteps = 64;
  diagnostics.render.effectiveRaymarchSteps = 40;
  diagnostics.render.adaptiveRaymarchActive = true;
  diagnostics.render.adaptiveStepDownCount = 3;
  diagnostics.render.adaptiveStepUpCount = 0;
  diagnostics.render.activeModeCount = 12;
  diagnostics.postProcess.traaNodeActive = true;
  diagnostics.postProcess.bloomPassPresent = true;
  diagnostics.postProcess.bloomComposeEnabled = false;
  diagnostics.adaptiveRaymarch.adaptiveRaymarchActive = true;
  diagnostics.adaptiveRaymarch.requestedRaymarchSteps = 64;
  diagnostics.adaptiveRaymarch.effectiveRaymarchSteps = 40;
  diagnostics.adaptiveRaymarch.currentRung = 3;
  diagnostics.adaptiveRaymarch.stepDownCount = 3;

  const snapshot = buildRuntimePerfSnapshot(diagnostics);

  assert.equal(snapshot.fps, 50);
  assert.equal(snapshot.worstFrameTimeMs, 47);
  assert.equal(snapshot.longFrameCount, 3);
  assert.deepEqual(snapshot.frameDrops, {
    framesOver16_7Ms: 14,
    framesOver25Ms: 8,
    framesOver33_3Ms: 3,
    framesOver50Ms: 0,
    recentLongFramesMs: [34.5, 47],
  });
  assert.equal(snapshot.render.bloomEnabled, false);
  assert.deepEqual(snapshot.postProcess, {
    traaNodeActive: true,
    bloomPassPresent: true,
    bloomComposeEnabled: false,
  });
  assert.equal(snapshot.render.requestedRaymarchSteps, 64);
  assert.equal(snapshot.render.effectiveRaymarchSteps, 40);
  assert.equal(snapshot.render.adaptiveRaymarchActive, true);
  assert.equal(snapshot.render.adaptiveStepDownCount, 3);
  assert.equal(snapshot.render.targetFps, 60);
  assert.equal(snapshot.adaptiveRaymarch?.currentRung, 3);
});
