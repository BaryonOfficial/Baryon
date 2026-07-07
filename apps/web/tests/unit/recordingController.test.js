import test from "node:test";
import assert from "node:assert/strict";
import {
  RECORDING_AUDIO_BITS_PER_SECOND,
  RECORDING_COUNTDOWN_SECONDS,
  RECORDING_SHARE_RESULTS,
  createRecordingMediaRecorderOptions,
  createRecordingController,
  resolveRecordingFilename,
  resolveRecordingVideoBitsPerSecond,
} from "../../src/ar-lab/recordingController.js";
import { RECORDING_COMPOSER_FPS } from "../../src/ar-lab/recordingComposer.js";
import {
  RECORDING_AUDIO_MODES,
  RECORDING_ERROR_CODES,
  RECORDING_STATES,
} from "../../src/ar-lab/recordingSession.js";

function flushPromiseQueue() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness({
  audioStatus = { isLiveInputActive: false, hasPlaybackAudio: true },
  audioCaptureAvailable = true,
  audioCaptureAsync = false,
  audioCaptureRejects = false,
  audioCaptureHasTracks = true,
  composerAvailable = true,
  recorderSupported = true,
  canShare = true,
  shareError = null,
  sourceVideo = null,
} = {}) {
  const videoTrack = {
    kind: "video",
    stopped: 0,
    stop() {
      this.stopped += 1;
    },
  };
  const audioTrack = { kind: "audio" };
  const videoStream = {
    getVideoTracks: () => [videoTrack],
    getTracks: () => [videoTrack],
  };

  const harness = {
    videoTrack,
    audioTrack,
    intervals: new Map(),
    timeouts: new Map(),
    nextTimerId: 1,
    composer: null,
    composerCaptureFps: null,
    composerSourceVideo: null,
    audioCapture: null,
    recorder: null,
    recorderOptions: null,
    recordedStream: null,
    createdObjectUrls: [],
    revokedObjectUrls: [],
    sharedPayloads: [],
    createAudioCaptureCalls: 0,
    audioCaptureStatus: null,
  };

  const dependencies = {
    now: () => 1700000000000,
    setTimeout: (callback, ms) => {
      const id = harness.nextTimerId++;
      harness.timeouts.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (id) => {
      harness.timeouts.delete(id);
    },
    setInterval: (callback, ms) => {
      const id = harness.nextTimerId++;
      harness.intervals.set(id, { callback, ms });
      return id;
    },
    clearInterval: (id) => {
      harness.intervals.delete(id);
    },
    isRecorderSupported: () => recorderSupported,
    isMimeTypeSupported: (mimeType) => mimeType === "video/webm",
    createMediaRecorder: (stream, options) => {
      harness.recordedStream = stream;
      harness.recorderOptions = options;
      harness.recorder = {
        state: "recording",
        mimeType: options?.mimeType ?? "video/webm",
        startCalls: 0,
        ondataavailable: null,
        onerror: null,
        onstop: null,
        start() {
          this.startCalls += 1;
        },
        stop() {
          this.state = "inactive";
          this.onstop?.();
        },
      };
      return harness.recorder;
    },
    createMediaStream: (tracks) => ({ combined: true, tracks }),
    createBlob: (chunks, options) => ({
      chunks,
      type: options?.type ?? null,
      size: chunks.reduce((total, chunk) => total + (chunk.size ?? 0), 0),
    }),
    createFile: (blob, filename, options) => ({ blob, filename, options }),
    createObjectUrl: (blob) => {
      const url = `blob:${harness.createdObjectUrls.length}`;
      harness.createdObjectUrls.push({ url, blob });
      return url;
    },
    revokeObjectUrl: (url) => {
      harness.revokedObjectUrls.push(url);
    },
    createComposer: ({ preset, sourceVideo: composerSourceVideo }) => {
      if (!composerAvailable) {
        return null;
      }
      harness.composerSourceVideo = composerSourceVideo;
      harness.composer = {
        preset,
        started: 0,
        stopped: 0,
        start() {
          this.started += 1;
        },
        stop() {
          this.stopped += 1;
        },
        captureStream(fps) {
          harness.composerCaptureFps = fps;
          return videoStream;
        },
      };
      return harness.composer;
    },
    canShareFiles: () => canShare,
    shareFiles: async (payload) => {
      if (shareError) {
        throw shareError;
      }
      harness.sharedPayloads.push(payload);
    },
  };

  harness.controller = createRecordingController({
    resolveSourceCanvas: () => ({ width: 1600, height: 900 }),
    resolveSourceVideo: () => sourceVideo,
    readAudioStatus: () => audioStatus,
    createAudioCapture: (status) => {
      harness.createAudioCaptureCalls += 1;
      harness.audioCaptureStatus = status;
      if (audioCaptureRejects) {
        return Promise.reject(new Error("audio capture denied"));
      }
      if (!audioCaptureAvailable) {
        return audioCaptureAsync ? Promise.resolve(null) : null;
      }
      const capture = {
        stream: {
          getAudioTracks: () => (audioCaptureHasTracks ? [audioTrack] : []),
        },
        stopped: 0,
        stop() {
          this.stopped += 1;
        },
      };
      harness.audioCapture = capture;
      return audioCaptureAsync ? Promise.resolve(capture) : capture;
    },
    dependencies,
  });

  harness.runCountdown = () => {
    for (let tick = 0; tick < RECORDING_COUNTDOWN_SECONDS; tick += 1) {
      const [interval] = harness.intervals.values();
      assert.ok(interval, "countdown interval should be scheduled");
      interval.callback();
    }
  };

  harness.fireAutoStop = () => {
    const [timeout] = harness.timeouts.values();
    assert.ok(timeout, "auto-stop timeout should be scheduled");
    timeout.callback();
  };

  return harness;
}

test("records through countdown to preview with app audio included", () => {
  const harness = createHarness();
  const { controller } = harness;

  controller.setPreset("1:1");
  controller.setDurationSeconds(10);
  controller.startRecording();

  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.countdown);
  assert.equal(snapshot.countdownRemainingSeconds, RECORDING_COUNTDOWN_SECONDS);
  assert.equal(snapshot.audioMode, RECORDING_AUDIO_MODES.included);
  assert.equal(snapshot.mimeType, "video/webm");

  harness.runCountdown();
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.recording);
  assert.equal(harness.composer.preset, "1:1");
  assert.equal(harness.composer.started, 1);
  assert.equal(harness.composerCaptureFps, RECORDING_COMPOSER_FPS);
  assert.equal(harness.recorder.startCalls, 1);
  assert.deepEqual(harness.recorderOptions, {
    mimeType: "video/webm",
    videoBitsPerSecond: resolveRecordingVideoBitsPerSecond("1:1"),
    audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
  });
  // Audio inclusion composes video and audio tracks into one stream.
  assert.deepEqual(harness.recordedStream.tracks, [
    harness.videoTrack,
    harness.audioTrack,
  ]);

  // Duration limit: auto stop is scheduled for the selected clip length.
  const [timeout] = harness.timeouts.values();
  assert.equal(timeout.ms, 10000);

  harness.recorder.ondataavailable({ data: { size: 2048 } });
  harness.fireAutoStop();

  snapshot = controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.preview);
  assert.equal(snapshot.blob.size, 2048);
  assert.equal(snapshot.objectUrl, "blob:0");
  assert.equal(harness.composer.stopped, 1);
  assert.equal(harness.audioCapture.stopped, 1);
  assert.equal(harness.videoTrack.stopped, 1);

  const download = controller.download();
  assert.equal(download.objectUrl, "blob:0");
  assert.match(download.filename, /^baryon-ar-1x1-\d+\.webm$/);
});

test("passes the active camera video element to the recording composer", () => {
  const sourceVideo = { videoWidth: 1280, videoHeight: 720 };
  const harness = createHarness({ sourceVideo });

  harness.controller.startRecording();
  harness.runCountdown();

  assert.equal(harness.composerSourceVideo, sourceVideo);
});

test("recording options scale bitrate by output surface", () => {
  assert.equal(resolveRecordingVideoBitsPerSecond("9:16"), 14_929_920);
  assert.equal(resolveRecordingVideoBitsPerSecond("1:1"), 8_398_080);
  assert.equal(resolveRecordingVideoBitsPerSecond("16:9"), 14_929_920);
  assert.equal(
    resolveRecordingVideoBitsPerSecond("16:9", "video/webm;codecs=vp9,opus"),
    12_441_600,
  );
  assert.equal(
    resolveRecordingVideoBitsPerSecond("1:1", "video/webm;codecs=vp9,opus"),
    8_000_000,
  );

  assert.deepEqual(
    createRecordingMediaRecorderOptions({
      mimeType: "video/mp4",
      preset: "16:9",
      audioMode: RECORDING_AUDIO_MODES.videoOnly,
    }),
    {
      mimeType: "video/mp4",
      videoBitsPerSecond: 14_929_920,
    },
  );
  assert.deepEqual(
    createRecordingMediaRecorderOptions({
      mimeType: "video/webm;codecs=vp9,opus",
      preset: "16:9",
      audioMode: RECORDING_AUDIO_MODES.included,
    }),
    {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 12_441_600,
      audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
    },
  );
  assert.deepEqual(
    createRecordingMediaRecorderOptions({
      mimeType: null,
      preset: "1:1",
      audioMode: RECORDING_AUDIO_MODES.included,
    }),
    {
      videoBitsPerSecond: 8_398_080,
      audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
    },
  );
});

test("live input capture is muxed when selected input capture opens", async () => {
  const harness = createHarness({
    audioStatus: { isLiveInputActive: true, hasPlaybackAudio: false },
    audioCaptureAsync: true,
  });
  harness.controller.startRecording();

  const snapshot = harness.controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.countdown);
  assert.equal(snapshot.audioMode, RECORDING_AUDIO_MODES.included);
  assert.equal(harness.createAudioCaptureCalls, 0);

  harness.runCountdown();
  await flushPromiseQueue();
  assert.equal(harness.createAudioCaptureCalls, 1);
  assert.equal(harness.audioCaptureStatus.isLiveInputActive, true);
  assert.equal(
    harness.controller.getSnapshot().state,
    RECORDING_STATES.recording,
  );
  assert.deepEqual(harness.recordedStream.tracks, [
    harness.videoTrack,
    harness.audioTrack,
  ]);
});

test("uses the latest audio status when the countdown finishes", () => {
  const audioStatus = { isLiveInputActive: false, hasPlaybackAudio: false };
  const harness = createHarness({ audioStatus });
  harness.controller.startRecording();

  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.videoOnly,
  );
  assert.equal(harness.createAudioCaptureCalls, 0);

  audioStatus.hasPlaybackAudio = true;
  harness.runCountdown();

  assert.equal(harness.createAudioCaptureCalls, 1);
  assert.equal(harness.audioCaptureStatus.hasPlaybackAudio, true);
  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.included,
  );
  assert.deepEqual(harness.recordedStream.tracks, [
    harness.videoTrack,
    harness.audioTrack,
  ]);
});

test("live input falls back when selected input capture is unavailable", async () => {
  const harness = createHarness({
    audioStatus: { isLiveInputActive: true, hasPlaybackAudio: false },
    audioCaptureAvailable: false,
    audioCaptureAsync: true,
  });
  harness.controller.startRecording();

  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.included,
  );
  assert.equal(harness.createAudioCaptureCalls, 0);

  harness.runCountdown();
  await flushPromiseQueue();
  assert.equal(harness.createAudioCaptureCalls, 1);
  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.systemRecordingRecommended,
  );
  assert.equal(harness.recordedStream.combined, undefined);
});

test("live input falls back when selected input capture rejects", async () => {
  const harness = createHarness({
    audioStatus: { isLiveInputActive: true, hasPlaybackAudio: false },
    audioCaptureRejects: true,
  });
  harness.controller.startRecording();

  assert.equal(harness.createAudioCaptureCalls, 0);
  harness.runCountdown();
  await flushPromiseQueue();
  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.systemRecordingRecommended,
  );
  assert.equal(harness.createAudioCaptureCalls, 1);
  assert.equal(harness.recordedStream.combined, undefined);
});

test("explicit video-only when audio capture is unavailable", () => {
  const harness = createHarness({ audioCaptureAvailable: false });
  harness.controller.startRecording();
  harness.runCountdown();

  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.videoOnly,
  );
});

test("explicit video-only when audio capture has no tracks", () => {
  const harness = createHarness({ audioCaptureHasTracks: false });
  harness.controller.startRecording();
  harness.runCountdown();

  assert.equal(
    harness.controller.getSnapshot().audioMode,
    RECORDING_AUDIO_MODES.videoOnly,
  );
  assert.equal(harness.audioCapture.stopped, 1);
  assert.equal(harness.recordedStream.combined, undefined);
});

test("fails with capture-unavailable when the composer cannot be created", () => {
  const harness = createHarness({ composerAvailable: false });
  harness.controller.startRecording();
  harness.runCountdown();

  const snapshot = harness.controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.failed);
  assert.equal(snapshot.errorCode, RECORDING_ERROR_CODES.captureUnavailable);
});

test("fails fast when MediaRecorder is unsupported", () => {
  const harness = createHarness({ recorderSupported: false });
  harness.controller.startRecording();

  const snapshot = harness.controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.failed);
  assert.equal(snapshot.errorCode, RECORDING_ERROR_CODES.recorderUnsupported);
});

test("stopping during countdown cancels back to idle", () => {
  const harness = createHarness();
  harness.controller.startRecording();
  harness.controller.stopRecording();

  assert.equal(harness.controller.getSnapshot().state, RECORDING_STATES.idle);
  assert.equal(harness.intervals.size, 0);
});

test("canceling an active recording resets without producing a preview", () => {
  const harness = createHarness();
  harness.controller.startRecording();
  harness.runCountdown();
  harness.recorder.ondataavailable({ data: { size: 64 } });

  harness.controller.cancelRecording();

  assert.equal(harness.controller.getSnapshot().state, RECORDING_STATES.idle);
  assert.equal(harness.composer.stopped, 1);
  assert.equal(harness.audioCapture.stopped, 1);
  assert.equal(harness.videoTrack.stopped, 1);
  assert.equal(harness.createdObjectUrls.length, 0);
});

test("object URLs are revoked exactly once on discard and restart", () => {
  const harness = createHarness();
  const { controller } = harness;

  controller.startRecording();
  harness.runCountdown();
  harness.recorder.ondataavailable({ data: { size: 64 } });
  harness.fireAutoStop();
  assert.equal(controller.getSnapshot().objectUrl, "blob:0");

  // Restarting from preview releases the previous preview URL.
  controller.startRecording();
  assert.deepEqual(harness.revokedObjectUrls, ["blob:0"]);
  harness.runCountdown();
  harness.recorder.ondataavailable({ data: { size: 64 } });
  harness.fireAutoStop();
  assert.equal(controller.getSnapshot().objectUrl, "blob:1");

  controller.discardPreview();
  assert.deepEqual(harness.revokedObjectUrls, ["blob:0", "blob:1"]);
  assert.equal(controller.getSnapshot().state, RECORDING_STATES.idle);
});

test("share uses the native share sheet and falls back when unsupported", async () => {
  const sharing = createHarness();
  sharing.controller.startRecording();
  sharing.runCountdown();
  sharing.recorder.ondataavailable({ data: { size: 64 } });
  sharing.fireAutoStop();
  assert.equal(
    await sharing.controller.share(),
    RECORDING_SHARE_RESULTS.shared,
  );
  assert.equal(sharing.sharedPayloads.length, 1);
  assert.match(sharing.sharedPayloads[0].files[0].filename, /baryon-ar/);

  const unsupported = createHarness({ canShare: false });
  unsupported.controller.startRecording();
  unsupported.runCountdown();
  unsupported.recorder.ondataavailable({ data: { size: 64 } });
  unsupported.fireAutoStop();
  assert.equal(
    await unsupported.controller.share(),
    RECORDING_SHARE_RESULTS.unsupported,
  );

  const failing = createHarness({ shareError: new Error("dismissed") });
  failing.controller.startRecording();
  failing.runCountdown();
  failing.recorder.ondataavailable({ data: { size: 64 } });
  failing.fireAutoStop();
  assert.equal(
    await failing.controller.share(),
    RECORDING_SHARE_RESULTS.failed,
  );

  assert.equal(
    await createHarness().controller.share(),
    RECORDING_SHARE_RESULTS.unsupported,
  );
});

test("empty recordings fail instead of previewing", () => {
  const harness = createHarness();
  harness.controller.startRecording();
  harness.runCountdown();
  harness.fireAutoStop();

  const snapshot = harness.controller.getSnapshot();
  assert.equal(snapshot.state, RECORDING_STATES.failed);
  assert.equal(snapshot.errorCode, RECORDING_ERROR_CODES.emptyRecording);
});

test("dispose releases the preview object URL and capture resources", () => {
  const harness = createHarness();
  harness.controller.startRecording();
  harness.runCountdown();
  harness.recorder.ondataavailable({ data: { size: 64 } });
  harness.fireAutoStop();

  harness.controller.dispose();
  assert.deepEqual(harness.revokedObjectUrls, ["blob:0"]);
});

test("recording filenames encode container and aspect", () => {
  assert.equal(
    resolveRecordingFilename("video/mp4", "9:16", 123),
    "baryon-ar-9x16-123.mp4",
  );
  assert.equal(
    resolveRecordingFilename("video/webm;codecs=vp9,opus", "16:9", 9),
    "baryon-ar-16x9-9.webm",
  );
  assert.equal(
    resolveRecordingFilename(null, "1:1", 7),
    "baryon-ar-1x1-7.webm",
  );
});
