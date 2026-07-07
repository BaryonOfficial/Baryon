import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RECORDING_ASPECT_PRESET,
  DEFAULT_RECORDING_DURATION_SECONDS,
  RECORDING_AUDIO_MODES,
  RECORDING_STATES,
  beginRecordingCountdown,
  collectReleasableObjectUrl,
  completeRecording,
  createIdleRecordingState,
  failRecording,
  markRecordingProcessing,
  markRecordingStarted,
  normalizeRecordingDuration,
  normalizeRecordingPreset,
  resetRecording,
  resolveRecordingAudioMode,
  selectRecordingMimeType,
  setRecordingDuration,
  setRecordingPreset,
} from "../../src/ar-lab/recordingSession.js";

test("idle state uses the 9:16 preset and 15s duration defaults", () => {
  assert.deepEqual(createIdleRecordingState(), {
    state: "idle",
    preset: "9:16",
    durationSeconds: 15,
    audioMode: "video-only",
    mimeType: null,
    blob: null,
    objectUrl: null,
    errorCode: null,
  });
});

test("presets and durations normalize to the supported sets", () => {
  assert.equal(normalizeRecordingPreset("1:1"), "1:1");
  assert.equal(normalizeRecordingPreset("16:9"), "16:9");
  assert.equal(
    normalizeRecordingPreset("4:3"),
    DEFAULT_RECORDING_ASPECT_PRESET,
  );
  assert.equal(normalizeRecordingDuration(30), 30);
  assert.equal(
    normalizeRecordingDuration(45),
    DEFAULT_RECORDING_DURATION_SECONDS,
  );
  assert.equal(
    normalizeRecordingDuration("15"),
    DEFAULT_RECORDING_DURATION_SECONDS,
  );
});

test("walks the full record-preview lifecycle", () => {
  let state = createIdleRecordingState();
  state = beginRecordingCountdown(state, {
    audioMode: RECORDING_AUDIO_MODES.included,
    mimeType: "video/webm",
  });
  assert.equal(state.state, RECORDING_STATES.countdown);
  assert.equal(state.audioMode, RECORDING_AUDIO_MODES.included);
  assert.equal(state.mimeType, "video/webm");

  state = markRecordingStarted(state);
  assert.equal(state.state, RECORDING_STATES.recording);

  state = markRecordingProcessing(state);
  assert.equal(state.state, RECORDING_STATES.processing);

  const blob = { size: 1024 };
  state = completeRecording(state, {
    blob,
    objectUrl: "blob:demo",
    mimeType: "video/webm",
  });
  assert.equal(state.state, RECORDING_STATES.preview);
  assert.equal(state.blob, blob);
  assert.equal(state.objectUrl, "blob:demo");

  const reset = resetRecording(state);
  assert.equal(reset.state, RECORDING_STATES.idle);
  assert.equal(reset.blob, null);
  assert.equal(reset.objectUrl, null);
});

test("invalid transitions leave the state untouched", () => {
  const idle = createIdleRecordingState();
  assert.equal(markRecordingStarted(idle), idle);
  assert.equal(markRecordingProcessing(idle), idle);
  assert.equal(
    completeRecording(idle, { blob: {}, objectUrl: "blob:x" }),
    idle,
  );

  const recording = markRecordingStarted(
    beginRecordingCountdown(idle, { audioMode: "video-only", mimeType: null }),
  );
  assert.equal(
    beginRecordingCountdown(recording, {
      audioMode: "video-only",
      mimeType: null,
    }),
    recording,
  );
});

test("preset and duration changes are locked while capture is active", () => {
  const idle = createIdleRecordingState();
  assert.equal(setRecordingPreset(idle, "16:9").preset, "16:9");
  assert.equal(setRecordingDuration(idle, 30).durationSeconds, 30);

  const recording = markRecordingStarted(
    beginRecordingCountdown(idle, { audioMode: "video-only", mimeType: null }),
  );
  assert.equal(setRecordingPreset(recording, "1:1"), recording);
  assert.equal(setRecordingDuration(recording, 10), recording);
});

test("failure clears artifacts and preserves the error code", () => {
  const recording = markRecordingStarted(
    beginRecordingCountdown(createIdleRecordingState(), {
      audioMode: "included",
      mimeType: "video/webm",
    }),
  );
  const failed = failRecording(recording, "recorder-error");
  assert.equal(failed.state, RECORDING_STATES.failed);
  assert.equal(failed.errorCode, "recorder-error");
  assert.equal(failed.blob, null);
  assert.equal(failed.objectUrl, null);
});

test("selects the first supported mime type in preference order", () => {
  assert.equal(
    selectRecordingMimeType((mimeType) => mimeType === "video/webm"),
    "video/webm",
  );
  assert.equal(
    selectRecordingMimeType(() => true),
    "video/webm;codecs=vp9,opus",
  );
  assert.equal(
    selectRecordingMimeType(() => false),
    null,
  );
  assert.equal(
    selectRecordingMimeType(() => {
      throw new Error("no recorder");
    }),
    null,
  );
  assert.equal(selectRecordingMimeType(null), null);
});

test("audio mode resolution: included, video-only, and live-input fallback", () => {
  assert.equal(
    resolveRecordingAudioMode({
      isLiveInputActive: false,
      hasPlaybackAudio: true,
      captureAvailable: true,
    }),
    RECORDING_AUDIO_MODES.included,
  );
  assert.equal(
    resolveRecordingAudioMode({
      isLiveInputActive: true,
      hasPlaybackAudio: false,
      captureAvailable: true,
    }),
    RECORDING_AUDIO_MODES.included,
  );
  assert.equal(
    resolveRecordingAudioMode({
      isLiveInputActive: false,
      hasPlaybackAudio: true,
      captureAvailable: false,
    }),
    RECORDING_AUDIO_MODES.videoOnly,
  );
  assert.equal(
    resolveRecordingAudioMode({
      isLiveInputActive: false,
      hasPlaybackAudio: false,
      captureAvailable: true,
    }),
    RECORDING_AUDIO_MODES.videoOnly,
  );
  assert.equal(
    resolveRecordingAudioMode({
      isLiveInputActive: true,
      hasPlaybackAudio: false,
      captureAvailable: false,
    }),
    RECORDING_AUDIO_MODES.systemRecordingRecommended,
  );
});

test("object URL release is named exactly by the current state", () => {
  const idle = createIdleRecordingState();
  assert.equal(collectReleasableObjectUrl(idle), null);

  const preview = completeRecording(
    markRecordingProcessing(
      markRecordingStarted(
        beginRecordingCountdown(idle, {
          audioMode: "video-only",
          mimeType: null,
        }),
      ),
    ),
    { blob: {}, objectUrl: "blob:release-me" },
  );
  assert.equal(collectReleasableObjectUrl(preview), "blob:release-me");
});
