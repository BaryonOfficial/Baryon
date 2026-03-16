import test from "node:test";
import assert from "node:assert/strict";
import {
  clearFrameCache,
  createRuntimeDiagnostics,
  shouldPreservePausedFrameOnControlsChange,
  shouldReuseIdleFrame,
  snapshotRuntimeDiagnostics,
} from "../../src/components/hooks/baryonVisualizerRuntimeState.js";

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
        isMicActive: false,
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
        isMicActive: false,
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
        isMicActive: true,
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
        isMicActive: false,
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
  };

  clearFrameCache(frameCacheRefs);

  assert.equal(frameCacheRefs.lastLiveFrameRef.current, null);
  assert.equal(frameCacheRefs.lastActiveFrameRef.current, null);
  assert.equal(frameCacheRefs.lastIdleFrameRef.current, null);
});

test("clones nested runtime diagnostics snapshots", () => {
  const diagnostics = createRuntimeDiagnostics();
  diagnostics.lastLongFrame = { durationMs: 44 };
  diagnostics.lastVisibilityChange = { state: "hidden" };
  diagnostics.lastRendererModeChange = { mode: "webgpu" };
  diagnostics.lastPlaybackIssue = { reason: "premature" };

  const snapshot = snapshotRuntimeDiagnostics(diagnostics);
  diagnostics.lastLongFrame.durationMs = 99;
  diagnostics.lastVisibilityChange.state = "visible";
  diagnostics.lastRendererModeChange.mode = "webgl";
  diagnostics.lastPlaybackIssue.reason = "interrupted";

  assert.deepEqual(snapshot.lastLongFrame, { durationMs: 44 });
  assert.deepEqual(snapshot.lastVisibilityChange, { state: "hidden" });
  assert.deepEqual(snapshot.lastRendererModeChange, { mode: "webgpu" });
  assert.deepEqual(snapshot.lastPlaybackIssue, { reason: "premature" });
});
