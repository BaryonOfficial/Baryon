import {
  RECORDING_AUDIO_MODES,
  RECORDING_ERROR_CODES,
  RECORDING_STATES,
  beginRecordingCountdown,
  collectReleasableObjectUrl,
  completeRecording,
  createIdleRecordingState,
  failRecording,
  markRecordingProcessing,
  markRecordingStarted,
  resetRecording,
  resolveRecordingAudioMode,
  selectRecordingMimeType,
  setRecordingDuration,
  setRecordingPreset,
} from "./recordingSession.js";
import {
  RECORDING_COMPOSER_FPS,
  createRecordingComposer,
  resolveComposedDimensions,
} from "./recordingComposer.js";

export const RECORDING_COUNTDOWN_SECONDS = 3;
export const RECORDING_AUDIO_BITS_PER_SECOND = 192_000;
const RECORDING_DEFAULT_VIDEO_BITS_PER_PIXEL_SECOND = 0.12;
const RECORDING_EFFICIENT_VIDEO_BITS_PER_PIXEL_SECOND = 0.1;
const RECORDING_MIN_VIDEO_BITS_PER_SECOND = 8_000_000;
const RECORDING_MAX_VIDEO_BITS_PER_SECOND = 18_000_000;

export const RECORDING_SHARE_RESULTS = Object.freeze({
  shared: "shared",
  unsupported: "unsupported",
  failed: "failed",
});

/**
 * @typedef {{ stream: MediaStream, stop: () => void }} RecordingAudioCapture
 */

/**
 * @param {string | null} mimeType
 * @param {string} preset
 * @param {number} nowMs
 * @returns {string}
 */
export function resolveRecordingFilename(mimeType, preset, nowMs) {
  const extension = String(mimeType ?? "").includes("mp4") ? "mp4" : "webm";
  const aspect = String(preset).replace(":", "x");
  return `baryon-ar-${aspect}-${nowMs}.${extension}`;
}

/**
 * @param {unknown} preset
 * @param {string | null} [mimeType]
 * @returns {number}
 */
export function resolveRecordingVideoBitsPerSecond(preset, mimeType = null) {
  const { width, height } = resolveComposedDimensions(preset);
  const bitsPerPixelSecond =
    typeof mimeType === "string" &&
    /video\/webm/i.test(mimeType) &&
    /vp9|av01/i.test(mimeType)
      ? RECORDING_EFFICIENT_VIDEO_BITS_PER_PIXEL_SECOND
      : RECORDING_DEFAULT_VIDEO_BITS_PER_PIXEL_SECOND;
  const targetBitrate = Math.round(
    width * height * RECORDING_COMPOSER_FPS * bitsPerPixelSecond,
  );
  return Math.min(
    RECORDING_MAX_VIDEO_BITS_PER_SECOND,
    Math.max(RECORDING_MIN_VIDEO_BITS_PER_SECOND, targetBitrate),
  );
}

/**
 * @param {{
 *   mimeType: string | null,
 *   preset: unknown,
 *   audioMode: "included" | "video-only" | "system-recording-recommended",
 * }} input
 * @returns {MediaRecorderOptions}
 */
export function createRecordingMediaRecorderOptions({
  mimeType,
  preset,
  audioMode,
}) {
  const options = {
    videoBitsPerSecond: resolveRecordingVideoBitsPerSecond(preset, mimeType),
  };
  if (mimeType) {
    options.mimeType = mimeType;
  }
  if (audioMode === RECORDING_AUDIO_MODES.included) {
    options.audioBitsPerSecond = RECORDING_AUDIO_BITS_PER_SECOND;
  }
  return options;
}

function createDefaultDependencies() {
  return {
    now: () => Date.now(),
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
    setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle),
    isMimeTypeSupported: (mimeType) =>
      typeof globalThis.MediaRecorder?.isTypeSupported === "function"
        ? globalThis.MediaRecorder.isTypeSupported(mimeType)
        : false,
    isRecorderSupported: () => typeof globalThis.MediaRecorder === "function",
    createMediaRecorder: (stream, options) =>
      new globalThis.MediaRecorder(stream, options),
    createMediaStream: (tracks) => new globalThis.MediaStream(tracks),
    createBlob: (chunks, options) => new Blob(chunks, options),
    createFile: (blob, filename, options) =>
      new File([blob], filename, options),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createComposer: (options) => createRecordingComposer(options),
    canShareFiles: (files) =>
      typeof globalThis.navigator?.canShare === "function" &&
      globalThis.navigator.canShare({ files }),
    shareFiles: (payload) => globalThis.navigator.share(payload),
  };
}

/**
 * Owner of the recording pipeline: composer lifecycle, capture streams,
 * audio inclusion, MediaRecorder, blobs, object URLs, and share/download.
 * Everything here is triggered by user actions or by the recorder's own
 * stop; nothing in this module touches XR sessions, audio session state,
 * camera presets, or the control store.
 *
 * @param {{
 *   resolveSourceCanvas: () => HTMLCanvasElement | null,
 *   resolveSourceVideo?: () => HTMLVideoElement | null,
 *   resolveSourcePersonCanvas?: () => HTMLCanvasElement | null,
 *   resolveSourceBackgroundImage?: () => HTMLImageElement | null,
 *   readAudioStatus: () => { isLiveInputActive: boolean, hasPlaybackAudio: boolean },
 *   createAudioCapture: (audioStatus?: { isLiveInputActive: boolean, hasPlaybackAudio: boolean }) => RecordingAudioCapture | null | Promise<RecordingAudioCapture | null>,
 *   dependencies?: Partial<ReturnType<typeof createDefaultDependencies>>,
 * }} options
 */
export function createRecordingController({
  resolveSourceCanvas,
  resolveSourceVideo = () => null,
  resolveSourcePersonCanvas = () => null,
  resolveSourceBackgroundImage = () => null,
  readAudioStatus,
  createAudioCapture,
  dependencies = {},
}) {
  const deps = { ...createDefaultDependencies(), ...dependencies };
  const listeners = new Set();

  let session = createIdleRecordingState();
  let countdownRemainingSeconds = null;
  let countdownIntervalHandle = null;
  let autoStopTimeoutHandle = null;
  let activeComposer = null;
  let activeAudioCapture = null;
  let activeRecorder = null;
  let activeStreamTracks = [];
  let recordedChunks = [];
  let disposed = false;
  let startRequestInFlight = false;
  let startRequestId = 0;
  // Cached so getSnapshot stays referentially stable between notifications
  // (required by useSyncExternalStore).
  let snapshot = { ...session, countdownRemainingSeconds };

  function notify() {
    snapshot = { ...session, countdownRemainingSeconds };
    for (const listener of listeners) {
      listener();
    }
  }

  function setSession(nextSession) {
    if (nextSession === session) {
      return;
    }
    session = nextSession;
    notify();
  }

  function releaseObjectUrl(state) {
    const releasableUrl = collectReleasableObjectUrl(state);
    if (releasableUrl) {
      deps.revokeObjectUrl(releasableUrl);
    }
  }

  function clearCountdown() {
    if (countdownIntervalHandle != null) {
      deps.clearInterval(countdownIntervalHandle);
      countdownIntervalHandle = null;
    }
    countdownRemainingSeconds = null;
  }

  function clearAutoStop() {
    if (autoStopTimeoutHandle != null) {
      deps.clearTimeout(autoStopTimeoutHandle);
      autoStopTimeoutHandle = null;
    }
  }

  function teardownCapture() {
    startRequestId += 1;
    startRequestInFlight = false;
    clearAutoStop();
    activeComposer?.stop();
    activeComposer = null;
    activeAudioCapture?.stop();
    activeAudioCapture = null;
    for (const track of activeStreamTracks) {
      track.stop?.();
    }
    activeStreamTracks = [];
    activeRecorder = null;
    recordedChunks = [];
  }

  function normalizeAudioStatus(audioStatus = {}) {
    return {
      isLiveInputActive: audioStatus?.isLiveInputActive === true,
      hasPlaybackAudio: audioStatus?.hasPlaybackAudio === true,
    };
  }

  function shouldCreateAudioCapture(audioStatus) {
    const normalizedStatus = normalizeAudioStatus(audioStatus);
    return (
      normalizedStatus.isLiveInputActive || normalizedStatus.hasPlaybackAudio
    );
  }

  function resolvePlannedAudioMode(audioStatus) {
    const normalizedStatus = normalizeAudioStatus(audioStatus);
    return resolveRecordingAudioMode({
      ...normalizedStatus,
      captureAvailable: shouldCreateAudioCapture(normalizedStatus),
    });
  }

  /**
   * @param {unknown} value
   * @returns {value is Promise<RecordingAudioCapture | null>}
   */
  function isAudioCapturePromise(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      typeof (/** @type {{ then?: unknown }} */ (value).then) === "function",
    );
  }

  function failWith(errorCode) {
    teardownCapture();
    clearCountdown();
    releaseObjectUrl(session);
    setSession(failRecording(session, errorCode));
  }

  function finalizeRecording() {
    const chunks = recordedChunks;
    const recorderMimeType = activeRecorder?.mimeType || session.mimeType;
    teardownCapture();

    if (session.state !== RECORDING_STATES.processing) {
      return;
    }
    if (chunks.length === 0) {
      setSession(failRecording(session, RECORDING_ERROR_CODES.emptyRecording));
      return;
    }

    const blob = deps.createBlob(
      chunks,
      recorderMimeType ? { type: recorderMimeType } : undefined,
    );
    const objectUrl = deps.createObjectUrl(blob);
    setSession(
      completeRecording(session, {
        blob,
        objectUrl,
        mimeType: recorderMimeType ?? null,
      }),
    );
  }

  function beginRecorderCapture(requestId, audioStatus, audioCapture) {
    if (requestId !== startRequestId || disposed) {
      audioCapture?.stop?.();
      return;
    }
    if (session.state !== RECORDING_STATES.countdown) {
      audioCapture?.stop?.();
      return;
    }

    const audioTracks = audioCapture?.stream?.getAudioTracks?.() ?? [];
    activeAudioCapture = audioTracks.length > 0 ? audioCapture : null;
    if (audioCapture && !activeAudioCapture) {
      audioCapture.stop?.();
    }
    session = {
      ...session,
      audioMode: resolveRecordingAudioMode({
        ...normalizeAudioStatus(audioStatus),
        captureAvailable: Boolean(activeAudioCapture),
      }),
    };

    const sourceCanvas = resolveSourceCanvas();
    if (!sourceCanvas) {
      failWith(RECORDING_ERROR_CODES.captureUnavailable);
      return;
    }

    const composer = deps.createComposer({
      sourceCanvas,
      sourceVideo: resolveSourceVideo(),
      sourcePersonCanvas: resolveSourcePersonCanvas(),
      sourceBackgroundImage: resolveSourceBackgroundImage(),
      preset: session.preset,
    });
    if (!composer) {
      failWith(RECORDING_ERROR_CODES.captureUnavailable);
      return;
    }
    activeComposer = composer;
    composer.start();

    const videoStream = composer.captureStream(RECORDING_COMPOSER_FPS);
    if (!videoStream) {
      failWith(RECORDING_ERROR_CODES.captureUnavailable);
      return;
    }

    let recordedStream = videoStream;
    if (
      session.audioMode === RECORDING_AUDIO_MODES.included &&
      activeAudioCapture
    ) {
      recordedStream = deps.createMediaStream([
        ...videoStream.getVideoTracks(),
        ...audioTracks,
      ]);
    }
    activeStreamTracks = videoStream.getTracks();

    let recorder;
    try {
      recorder = deps.createMediaRecorder(
        recordedStream,
        createRecordingMediaRecorderOptions({
          mimeType: session.mimeType,
          preset: session.preset,
          audioMode: session.audioMode,
        }),
      );
    } catch {
      failWith(RECORDING_ERROR_CODES.recorderStartFailed);
      return;
    }

    recordedChunks = [];
    recorder.ondataavailable = (event) => {
      if (event?.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      failWith(RECORDING_ERROR_CODES.recorderError);
    };
    recorder.onstop = () => {
      finalizeRecording();
    };

    try {
      recorder.start();
    } catch {
      failWith(RECORDING_ERROR_CODES.recorderStartFailed);
      return;
    }

    activeRecorder = recorder;
    setSession(markRecordingStarted(session));
    autoStopTimeoutHandle = deps.setTimeout(() => {
      autoStopTimeoutHandle = null;
      stopRecording();
    }, session.durationSeconds * 1000);
  }

  function beginCapture() {
    const requestId = startRequestId;
    const audioStatus = normalizeAudioStatus(readAudioStatus());
    let audioCaptureRequest = null;
    if (shouldCreateAudioCapture(audioStatus)) {
      try {
        audioCaptureRequest = createAudioCapture(audioStatus);
      } catch {
        audioCaptureRequest = null;
      }
    }

    if (isAudioCapturePromise(audioCaptureRequest)) {
      startRequestInFlight = true;
      audioCaptureRequest
        .catch(() => null)
        .then((audioCapture) => {
          startRequestInFlight = false;
          beginRecorderCapture(requestId, audioStatus, audioCapture);
        });
      return;
    }

    beginRecorderCapture(requestId, audioStatus, audioCaptureRequest);
  }

  function finishStartRecording(audioStatus) {
    if (
      disposed ||
      session.state === RECORDING_STATES.countdown ||
      session.state === RECORDING_STATES.recording ||
      session.state === RECORDING_STATES.processing
    ) {
      return;
    }

    const audioMode = resolvePlannedAudioMode(audioStatus);
    const mimeType = selectRecordingMimeType(deps.isMimeTypeSupported);

    releaseObjectUrl(session);
    setSession(beginRecordingCountdown(session, { audioMode, mimeType }));

    countdownRemainingSeconds = RECORDING_COUNTDOWN_SECONDS;
    notify();
    countdownIntervalHandle = deps.setInterval(() => {
      countdownRemainingSeconds -= 1;
      if (countdownRemainingSeconds > 0) {
        notify();
        return;
      }
      clearCountdown();
      beginCapture();
    }, 1000);
  }

  function startRecording() {
    if (
      startRequestInFlight ||
      disposed ||
      session.state === RECORDING_STATES.countdown ||
      session.state === RECORDING_STATES.recording ||
      session.state === RECORDING_STATES.processing
    ) {
      return undefined;
    }

    if (!deps.isRecorderSupported()) {
      releaseObjectUrl(session);
      setSession(
        failRecording(session, RECORDING_ERROR_CODES.recorderUnsupported),
      );
      return undefined;
    }

    const audioStatus = normalizeAudioStatus(readAudioStatus());
    const requestId = startRequestId + 1;
    startRequestId = requestId;
    finishStartRecording(audioStatus);
    return undefined;
  }

  function stopRecording() {
    if (session.state === RECORDING_STATES.countdown) {
      clearCountdown();
      teardownCapture();
      setSession(resetRecording(session));
      return;
    }
    if (session.state !== RECORDING_STATES.recording) {
      return;
    }

    clearAutoStop();
    setSession(markRecordingProcessing(session));
    try {
      activeRecorder?.stop();
    } catch {
      failWith(RECORDING_ERROR_CODES.recorderError);
    }
  }

  function cancelRecording() {
    if (disposed) {
      return;
    }
    clearCountdown();
    try {
      if (activeRecorder && activeRecorder.state !== "inactive") {
        activeRecorder.onstop = null;
        activeRecorder.stop();
      }
    } catch {
      // Best-effort cancellation: teardown below owns the final cleanup.
    }
    teardownCapture();
    releaseObjectUrl(session);
    setSession(resetRecording(session));
  }

  function discardPreview() {
    if (
      session.state !== RECORDING_STATES.preview &&
      session.state !== RECORDING_STATES.failed
    ) {
      return;
    }
    releaseObjectUrl(session);
    setSession(resetRecording(session));
  }

  function download() {
    if (session.state !== RECORDING_STATES.preview || !session.objectUrl) {
      return null;
    }
    return {
      objectUrl: session.objectUrl,
      filename: resolveRecordingFilename(
        session.mimeType,
        session.preset,
        deps.now(),
      ),
    };
  }

  async function share() {
    if (session.state !== RECORDING_STATES.preview || !session.blob) {
      return RECORDING_SHARE_RESULTS.unsupported;
    }

    const filename = resolveRecordingFilename(
      session.mimeType,
      session.preset,
      deps.now(),
    );
    const file = deps.createFile(
      session.blob,
      filename,
      session.mimeType ? { type: session.mimeType } : undefined,
    );
    if (!deps.canShareFiles([file])) {
      return RECORDING_SHARE_RESULTS.unsupported;
    }

    try {
      await deps.shareFiles({ files: [file] });
      return RECORDING_SHARE_RESULTS.shared;
    } catch {
      return RECORDING_SHARE_RESULTS.failed;
    }
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPreset(preset) {
      setSession(setRecordingPreset(session, preset));
    },
    setDurationSeconds(durationSeconds) {
      setSession(setRecordingDuration(session, durationSeconds));
    },
    startRecording,
    stopRecording,
    cancelRecording,
    discardPreview,
    download,
    share,
    dispose() {
      disposed = true;
      clearCountdown();
      try {
        if (activeRecorder && activeRecorder.state !== "inactive") {
          activeRecorder.onstop = null;
          activeRecorder.stop();
        }
      } catch {
        // Recorder teardown must never throw during dispose.
      }
      teardownCapture();
      releaseObjectUrl(session);
      listeners.clear();
    },
  };
}
