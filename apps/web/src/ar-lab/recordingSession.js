export const RECORDING_STATES = Object.freeze({
  idle: "idle",
  countdown: "countdown",
  recording: "recording",
  processing: "processing",
  preview: "preview",
  failed: "failed",
});

export const RECORDING_ASPECT_PRESETS = Object.freeze(["9:16", "1:1", "16:9"]);
export const DEFAULT_RECORDING_ASPECT_PRESET = "9:16";

export const RECORDING_DURATION_SECONDS = Object.freeze([10, 15, 30]);
export const DEFAULT_RECORDING_DURATION_SECONDS = 15;

export const RECORDING_AUDIO_MODES = Object.freeze({
  included: "included",
  videoOnly: "video-only",
  systemRecordingRecommended: "system-recording-recommended",
});

export const RECORDING_ERROR_CODES = Object.freeze({
  captureUnavailable: "capture-unavailable",
  recorderUnsupported: "recorder-unsupported",
  recorderStartFailed: "recorder-start-failed",
  recorderError: "recorder-error",
  emptyRecording: "empty-recording",
});

// Preference order favors quality-per-byte in desktop browsers, with MP4/H.264
// retained as the compatibility fallback for browsers that cannot record WebM.
const RECORDING_MIME_TYPE_CANDIDATES = Object.freeze([
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4",
]);

/**
 * @typedef {{
 *   state: "idle" | "countdown" | "recording" | "processing" | "preview" | "failed",
 *   preset: "9:16" | "1:1" | "16:9",
 *   durationSeconds: 10 | 15 | 30,
 *   audioMode: "included" | "video-only" | "system-recording-recommended",
 *   mimeType: string | null,
 *   blob: Blob | null,
 *   objectUrl: string | null,
 *   errorCode: string | null,
 * }} RecordingSessionState
 */

/**
 * @param {unknown} preset
 * @returns {"9:16" | "1:1" | "16:9"}
 */
export function normalizeRecordingPreset(preset) {
  return RECORDING_ASPECT_PRESETS.includes(/** @type {any} */ (preset))
    ? /** @type {any} */ (preset)
    : DEFAULT_RECORDING_ASPECT_PRESET;
}

/**
 * @param {unknown} durationSeconds
 * @returns {10 | 15 | 30}
 */
export function normalizeRecordingDuration(durationSeconds) {
  return RECORDING_DURATION_SECONDS.includes(
    /** @type {any} */ (durationSeconds),
  )
    ? /** @type {any} */ (durationSeconds)
    : DEFAULT_RECORDING_DURATION_SECONDS;
}

/** @returns {RecordingSessionState} */
export function createIdleRecordingState({
  preset = DEFAULT_RECORDING_ASPECT_PRESET,
  durationSeconds = DEFAULT_RECORDING_DURATION_SECONDS,
} = {}) {
  return {
    state: RECORDING_STATES.idle,
    preset: normalizeRecordingPreset(preset),
    durationSeconds: normalizeRecordingDuration(durationSeconds),
    audioMode: RECORDING_AUDIO_MODES.videoOnly,
    mimeType: null,
    blob: null,
    objectUrl: null,
    errorCode: null,
  };
}

/**
 * @param {(mimeType: string) => boolean} isTypeSupported
 * @returns {string | null}
 */
export function selectRecordingMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== "function") {
    return null;
  }

  return (
    RECORDING_MIME_TYPE_CANDIDATES.find((candidate) => {
      try {
        return isTypeSupported(candidate) === true;
      } catch {
        return false;
      }
    }) ?? null
  );
}

/**
 * Audio mode decision:
 * - App playback audio and selected live-input audio are included when the
 *   recorder receives a capture stream.
 * - Live input without an input capture tap still needs an external/system
 *   recording path.
 * - Otherwise the recording is explicitly video-only.
 *
 * @param {{
 *   isLiveInputActive?: boolean,
 *   hasPlaybackAudio?: boolean,
 *   captureAvailable?: boolean,
 * }} input
 * @returns {"included" | "video-only" | "system-recording-recommended"}
 */
export function resolveRecordingAudioMode({
  isLiveInputActive = false,
  hasPlaybackAudio = false,
  captureAvailable = false,
} = {}) {
  if (captureAvailable && (hasPlaybackAudio || isLiveInputActive)) {
    return RECORDING_AUDIO_MODES.included;
  }
  if (isLiveInputActive) {
    return RECORDING_AUDIO_MODES.systemRecordingRecommended;
  }
  return RECORDING_AUDIO_MODES.videoOnly;
}

/**
 * Object URLs are owned by the controller; this helper names which URL a
 * transition releases so the controller can revoke exactly once.
 *
 * @param {RecordingSessionState} state
 * @returns {string | null}
 */
export function collectReleasableObjectUrl(state) {
  return state.objectUrl ?? null;
}

/** @type {Set<RecordingSessionState["state"]>} */
const RESTARTABLE_STATES = new Set([
  RECORDING_STATES.idle,
  RECORDING_STATES.preview,
  RECORDING_STATES.failed,
]);

/**
 * @param {RecordingSessionState} state
 * @param {{ audioMode: string, mimeType: string | null }} input
 * @returns {RecordingSessionState}
 */
export function beginRecordingCountdown(state, { audioMode, mimeType }) {
  if (!RESTARTABLE_STATES.has(state.state)) {
    return state;
  }

  return {
    ...state,
    state: RECORDING_STATES.countdown,
    audioMode:
      audioMode === RECORDING_AUDIO_MODES.included ||
      audioMode === RECORDING_AUDIO_MODES.systemRecordingRecommended
        ? audioMode
        : RECORDING_AUDIO_MODES.videoOnly,
    mimeType: mimeType ?? null,
    blob: null,
    objectUrl: null,
    errorCode: null,
  };
}

/**
 * @param {RecordingSessionState} state
 * @returns {RecordingSessionState}
 */
export function markRecordingStarted(state) {
  if (state.state !== RECORDING_STATES.countdown) {
    return state;
  }
  return { ...state, state: RECORDING_STATES.recording };
}

/**
 * @param {RecordingSessionState} state
 * @returns {RecordingSessionState}
 */
export function markRecordingProcessing(state) {
  if (state.state !== RECORDING_STATES.recording) {
    return state;
  }
  return { ...state, state: RECORDING_STATES.processing };
}

/**
 * @param {RecordingSessionState} state
 * @param {{ blob: Blob, objectUrl: string, mimeType?: string | null }} input
 * @returns {RecordingSessionState}
 */
export function completeRecording(state, { blob, objectUrl, mimeType }) {
  if (state.state !== RECORDING_STATES.processing) {
    return state;
  }

  return {
    ...state,
    state: RECORDING_STATES.preview,
    blob,
    objectUrl,
    mimeType: mimeType ?? state.mimeType,
    errorCode: null,
  };
}

/**
 * @param {RecordingSessionState} state
 * @param {string} errorCode
 * @returns {RecordingSessionState}
 */
export function failRecording(state, errorCode) {
  return {
    ...state,
    state: RECORDING_STATES.failed,
    blob: null,
    objectUrl: null,
    errorCode: errorCode ?? RECORDING_ERROR_CODES.recorderError,
  };
}

/**
 * @param {RecordingSessionState} state
 * @returns {RecordingSessionState}
 */
export function resetRecording(state) {
  return createIdleRecordingState({
    preset: state.preset,
    durationSeconds: state.durationSeconds,
  });
}

/**
 * @param {RecordingSessionState} state
 * @param {unknown} preset
 * @returns {RecordingSessionState}
 */
export function setRecordingPreset(state, preset) {
  if (
    state.state === RECORDING_STATES.countdown ||
    state.state === RECORDING_STATES.recording ||
    state.state === RECORDING_STATES.processing
  ) {
    return state;
  }
  return { ...state, preset: normalizeRecordingPreset(preset) };
}

/**
 * @param {RecordingSessionState} state
 * @param {unknown} durationSeconds
 * @returns {RecordingSessionState}
 */
export function setRecordingDuration(state, durationSeconds) {
  if (
    state.state === RECORDING_STATES.countdown ||
    state.state === RECORDING_STATES.recording ||
    state.state === RECORDING_STATES.processing
  ) {
    return state;
  }
  return {
    ...state,
    durationSeconds: normalizeRecordingDuration(durationSeconds),
  };
}
