import {
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  normalizeLiveInputAnalysisClass,
  normalizeResolvedLiveInputAnalysisClass,
} from "@baryon/visualizer/audio/liveInputAnalysis";

/**
 * @typedef {"idle" | "starting" | "active" | "stopping" | "error"} LiveInputUiState
 */

/**
 * @typedef {"idle" | "starting" | "calibrating" | "listening" | "weak-signal" | "stopping" | "error"} LiveInputPhase
 */

/**
 * @typedef {"ok" | "weak" | "silent" | "clipped"} LiveInputSignalState
 */

/**
 * @typedef {"none" | "permission-denied" | "device-missing" | "device-disconnected" | "start-failed" | "calibration-invalid"} LiveInputErrorCode
 */

/**
 * @typedef {{
 *   active: boolean,
 *   phase: LiveInputPhase,
 *   liveInputKind: "live" | "system" | null,
 *   selectedDeviceId: string | null,
 *   selectedDeviceLabel: string,
 *   requestedAnalysisClass: import("@baryon/visualizer/audio/liveInputAnalysis").LiveInputAnalysisClass,
 *   resolvedAnalysisClass: import("@baryon/visualizer/audio/liveInputAnalysis").ResolvedLiveInputAnalysisClass,
 *   calibrationActive: boolean,
 *   gateOpen: boolean,
 *   hardSilence: boolean,
 *   calibrationInvalid: boolean,
 *   calibrationInvalidReason: string,
 *   signalState: LiveInputSignalState,
 *   errorCode: LiveInputErrorCode,
 * }} LiveInputRuntimeStatus
 */

export const LIVE_INPUT_UI_STATES = Object.freeze({
  idle: "idle",
  starting: "starting",
  active: "active",
  stopping: "stopping",
  error: "error",
});

export const LIVE_INPUT_PHASES = Object.freeze({
  idle: "idle",
  starting: "starting",
  calibrating: "calibrating",
  listening: "listening",
  weakSignal: "weak-signal",
  stopping: "stopping",
  error: "error",
});

export const LIVE_INPUT_SIGNAL_STATES = Object.freeze({
  ok: "ok",
  weak: "weak",
  silent: "silent",
  clipped: "clipped",
});

export const LIVE_INPUT_ERROR_CODES = Object.freeze({
  none: "none",
  permissionDenied: "permission-denied",
  deviceMissing: "device-missing",
  deviceDisconnected: "device-disconnected",
  startFailed: "start-failed",
  calibrationInvalid: "calibration-invalid",
});

function getAutoResolvedStatusLabel(status) {
  if (status.requestedAnalysisClass !== DEFAULT_LIVE_INPUT_ANALYSIS_CLASS) {
    return "";
  }

  if (status.resolvedAnalysisClass === "line-feed") {
    return "Auto: detected line feed";
  }

  if (status.resolvedAnalysisClass === "acoustic-mic") {
    return "Auto: using acoustic mic";
  }

  return "";
}

/**
 * @param {unknown} value
 * @returns {LiveInputUiState}
 */
function normalizeUiState(value) {
  return value === LIVE_INPUT_UI_STATES.starting ||
    value === LIVE_INPUT_UI_STATES.active ||
    value === LIVE_INPUT_UI_STATES.stopping ||
    value === LIVE_INPUT_UI_STATES.error
    ? value
    : LIVE_INPUT_UI_STATES.idle;
}

/**
 * @param {unknown} value
 * @returns {LiveInputErrorCode}
 */
function normalizeErrorCode(value) {
  return value === LIVE_INPUT_ERROR_CODES.permissionDenied ||
    value === LIVE_INPUT_ERROR_CODES.deviceMissing ||
    value === LIVE_INPUT_ERROR_CODES.deviceDisconnected ||
    value === LIVE_INPUT_ERROR_CODES.startFailed ||
    value === LIVE_INPUT_ERROR_CODES.calibrationInvalid
    ? value
    : LIVE_INPUT_ERROR_CODES.none;
}

/**
 * @param {Partial<LiveInputRuntimeStatus>=} overrides
 * @returns {LiveInputRuntimeStatus}
 */
export function createLiveInputRuntimeStatus(overrides = {}) {
  return {
    active: false,
    phase: LIVE_INPUT_PHASES.idle,
    liveInputKind: null,
    selectedDeviceId: null,
    selectedDeviceLabel: "",
    requestedAnalysisClass: DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
    resolvedAnalysisClass: DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
    calibrationActive: false,
    gateOpen: false,
    hardSilence: false,
    calibrationInvalid: false,
    calibrationInvalidReason: "none",
    signalState: LIVE_INPUT_SIGNAL_STATES.ok,
    errorCode: LIVE_INPUT_ERROR_CODES.none,
    ...overrides,
  };
}

/**
 * @param {unknown} error
 * @returns {LiveInputErrorCode}
 */
export function mapLiveInputStartError(error) {
  const candidate =
    /** @type {{ name?: unknown, message?: unknown } | null | undefined} */ (
      error
    );
  const name = String(candidate?.name ?? "");
  const message = String(candidate?.message ?? "").toLowerCase();

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    message.includes("permission") ||
    message.includes("not allowed")
  ) {
    return LIVE_INPUT_ERROR_CODES.permissionDenied;
  }

  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    message.includes("device") ||
    message.includes("input")
  ) {
    return LIVE_INPUT_ERROR_CODES.deviceMissing;
  }

  return LIVE_INPUT_ERROR_CODES.startFailed;
}

/**
 * @param {{
 *   active: boolean,
 *   liveInputUiState: LiveInputUiState,
 *   providerErrorCode: LiveInputErrorCode,
 *   calibrationActive: boolean,
 *   gateOpen: boolean,
 *   calibrationInvalid: boolean,
 * }} param0
 * @returns {LiveInputPhase}
 */
function deriveLiveInputPhase({
  active,
  liveInputUiState,
  providerErrorCode,
  calibrationActive,
  gateOpen,
  calibrationInvalid,
}) {
  if (liveInputUiState === LIVE_INPUT_UI_STATES.starting) {
    return LIVE_INPUT_PHASES.starting;
  }
  if (liveInputUiState === LIVE_INPUT_UI_STATES.stopping) {
    return LIVE_INPUT_PHASES.stopping;
  }
  if (
    liveInputUiState === LIVE_INPUT_UI_STATES.error ||
    providerErrorCode !== LIVE_INPUT_ERROR_CODES.none ||
    calibrationInvalid
  ) {
    return LIVE_INPUT_PHASES.error;
  }
  if (!active) {
    return LIVE_INPUT_PHASES.idle;
  }
  if (calibrationActive) {
    return LIVE_INPUT_PHASES.calibrating;
  }
  if (gateOpen) {
    return LIVE_INPUT_PHASES.listening;
  }
  return LIVE_INPUT_PHASES.weakSignal;
}

/**
 * @param {{
 *   phase: LiveInputPhase,
 *   hardSilence: boolean,
 *   calibrationInvalid: boolean,
 *   calibrationInvalidReason: string,
 * }} param0
 * @returns {LiveInputSignalState}
 */
function deriveSignalState({
  phase,
  hardSilence,
  calibrationInvalid,
  calibrationInvalidReason,
}) {
  if (
    calibrationInvalid &&
    (calibrationInvalidReason === "baseline-clipping" ||
      calibrationInvalidReason === "compressed-baseline")
  ) {
    return LIVE_INPUT_SIGNAL_STATES.clipped;
  }
  if (hardSilence) {
    return LIVE_INPUT_SIGNAL_STATES.silent;
  }
  if (phase === LIVE_INPUT_PHASES.weakSignal) {
    return LIVE_INPUT_SIGNAL_STATES.weak;
  }
  return LIVE_INPUT_SIGNAL_STATES.ok;
}

/**
 * @param {{
 *   status?: any,
 *   featureFrame?: any,
 *   liveInputUiState?: LiveInputUiState,
 *   liveInputErrorCode?: LiveInputErrorCode,
 * }=} param0
 * @returns {LiveInputRuntimeStatus}
 */
export function buildLiveInputRuntimeStatus({
  status = undefined,
  featureFrame = undefined,
  liveInputUiState = LIVE_INPUT_UI_STATES.idle,
  liveInputErrorCode = LIVE_INPUT_ERROR_CODES.none,
} = {}) {
  const debug = featureFrame?.debug ?? null;
  const active = Boolean(status?.isLiveInputActive);
  const normalizedUiState = normalizeUiState(liveInputUiState);
  const requestedAnalysisClass = normalizeLiveInputAnalysisClass(
    status?.liveInputAnalysisClass,
  );
  const resolvedAnalysisClass = normalizeResolvedLiveInputAnalysisClass(
    status?.resolvedLiveInputAnalysisClass,
  );
  const calibrationInvalid = Boolean(debug?.liveInputCalibrationInvalid);
  const calibrationInvalidReason =
    debug?.liveInputCalibrationInvalidReason ?? "none";
  const providerErrorCode = normalizeErrorCode(
    liveInputErrorCode !== LIVE_INPUT_ERROR_CODES.none
      ? liveInputErrorCode
      : calibrationInvalid
        ? LIVE_INPUT_ERROR_CODES.calibrationInvalid
        : LIVE_INPUT_ERROR_CODES.none,
  );
  const calibrationActive =
    active &&
    resolvedAnalysisClass === "acoustic-mic" &&
    Boolean(debug?.liveInputCalibrationActive);
  const hardSilence = active && Boolean(debug?.liveInputHardSilenceActive);
  const gateOpen =
    active &&
    (resolvedAnalysisClass === "line-feed" ||
      (!debug?.liveInputNoiseGateActive &&
        !calibrationActive &&
        !calibrationInvalid));
  const phase = deriveLiveInputPhase({
    active,
    liveInputUiState: normalizedUiState,
    providerErrorCode,
    calibrationActive,
    gateOpen,
    calibrationInvalid,
  });

  return createLiveInputRuntimeStatus({
    active,
    phase,
    liveInputKind: status?.liveInputKind ?? null,
    selectedDeviceId: status?.selectedLiveInputDeviceId ?? null,
    selectedDeviceLabel: status?.selectedLiveInputDeviceLabel ?? "",
    requestedAnalysisClass,
    resolvedAnalysisClass,
    calibrationActive,
    gateOpen,
    hardSilence,
    calibrationInvalid,
    calibrationInvalidReason,
    signalState: deriveSignalState({
      phase,
      hardSilence,
      calibrationInvalid,
      calibrationInvalidReason,
    }),
    errorCode: providerErrorCode,
  });
}

/**
 * @param {Partial<LiveInputRuntimeStatus> | null | undefined} left
 * @param {Partial<LiveInputRuntimeStatus> | null | undefined} right
 * @returns {boolean}
 */
export function areLiveInputRuntimeStatusesEqual(left, right) {
  const normalizedLeft = createLiveInputRuntimeStatus(left);
  const normalizedRight = createLiveInputRuntimeStatus(right);
  const keys = Object.keys(normalizedLeft);
  return keys.every((key) => normalizedLeft[key] === normalizedRight[key]);
}

/**
 * @param {Partial<LiveInputRuntimeStatus> | null | undefined} runtimeStatus
 * @returns {boolean}
 */
export function isLiveInputTransitionLocked(runtimeStatus) {
  const phase = runtimeStatus?.phase ?? LIVE_INPUT_PHASES.idle;
  return (
    phase === LIVE_INPUT_PHASES.starting || phase === LIVE_INPUT_PHASES.stopping
  );
}

/**
 * @param {Partial<LiveInputRuntimeStatus> | null | undefined} runtimeStatus
 * @returns {string}
 */
export function getLiveInputStatusLabel(runtimeStatus) {
  const status = createLiveInputRuntimeStatus(runtimeStatus);
  const autoResolvedStatusLabel = getAutoResolvedStatusLabel(status);

  if (status.errorCode === LIVE_INPUT_ERROR_CODES.permissionDenied) {
    return "Microphone permission blocked";
  }
  if (
    status.errorCode === LIVE_INPUT_ERROR_CODES.deviceMissing ||
    status.errorCode === LIVE_INPUT_ERROR_CODES.deviceDisconnected
  ) {
    return "Selected device unavailable";
  }
  if (
    status.errorCode === LIVE_INPUT_ERROR_CODES.calibrationInvalid ||
    status.signalState === LIVE_INPUT_SIGNAL_STATES.clipped
  ) {
    return "Mic signal looks clipped";
  }
  if (status.phase === LIVE_INPUT_PHASES.calibrating) {
    return "Calibrating mic";
  }
  if (status.phase === LIVE_INPUT_PHASES.weakSignal) {
    return "Input too weak";
  }
  if (autoResolvedStatusLabel) {
    return autoResolvedStatusLabel;
  }
  if (status.phase === LIVE_INPUT_PHASES.listening) {
    return "Listening";
  }

  return "";
}
