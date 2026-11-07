import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputDeviceKind,
  normalizeLiveInputAnalysisClass,
  normalizeResolvedLiveInputAnalysisClass,
} from "@baryon/engine/audio/liveInputAnalysis";

import { hasRenderAuthority } from "@baryon/engine/core/renderAuthorityContract";

/** @typedef {"idle"|"starting"|"active"|"stopping"|"error"} LiveInputUiState */
/** @typedef {"idle"|"starting"|"listening"|"stopping"|"error"} LiveInputPhase */
/** @typedef {"none"|"permission-denied"|"device-missing"|"device-unavailable"|"device-disconnected"|"start-failed"|"processing-failed"} LiveInputErrorCode */
/** @typedef {{active:boolean,phase:LiveInputPhase,liveInputDeviceKind:import("@baryon/engine/audio/liveInputAnalysis").LiveInputDeviceKind|null,liveInputKind:"live"|"system"|null,selectedDeviceId:string|null,selectedDeviceLabel:string,requestedAnalysisClass:import("@baryon/engine/audio/liveInputAnalysis").LiveInputAnalysisClass,acousticIntent:import("@baryon/engine/audio/liveInputAnalysis").LiveInputAcousticIntent,resolvedAnalysisClass:import("@baryon/engine/audio/liveInputAnalysis").ResolvedLiveInputAnalysisClass,sourceSessionId:number|string|null,sourceGeneration:number|null,observationAvailable:boolean,errorCode:LiveInputErrorCode}} LiveInputRuntimeStatus */
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
  listening: "listening",
  stopping: "stopping",
  error: "error",
});
export const LIVE_INPUT_ERROR_CODES = Object.freeze({
  none: "none",
  permissionDenied: "permission-denied",
  deviceMissing: "device-missing",
  deviceUnavailable: "device-unavailable",
  deviceDisconnected: "device-disconnected",
  startFailed: "start-failed",
  processingFailed: "processing-failed",
});
/** @param {unknown} value @returns {LiveInputUiState} */
export function normalizeLiveInputUiState(value) {
  return value === "starting" ||
    value === "active" ||
    value === "stopping" ||
    value === "error"
    ? value
    : "idle";
}
/** @param {unknown} value @returns {LiveInputErrorCode} */
export function normalizeLiveInputErrorCode(value) {
  return value === "permission-denied" ||
    value === "device-missing" ||
    value === "device-unavailable" ||
    value === "device-disconnected" ||
    value === "start-failed" ||
    value === "processing-failed"
    ? value
    : "none";
}
/** @param {Partial<LiveInputRuntimeStatus>=} overrides @returns {LiveInputRuntimeStatus} */
export function createLiveInputRuntimeStatus(overrides = {}) {
  const kind = overrides.liveInputDeviceKind ?? overrides.liveInputKind;
  const liveInputDeviceKind =
    kind == null ? null : normalizeLiveInputDeviceKind(kind);
  return {
    active: overrides.active === true,
    phase: Object.values(LIVE_INPUT_PHASES).includes(overrides.phase)
      ? overrides.phase
      : LIVE_INPUT_PHASES.idle,
    liveInputDeviceKind,
    liveInputKind: liveInputDeviceKind,
    selectedDeviceId: overrides.selectedDeviceId ?? null,
    selectedDeviceLabel: overrides.selectedDeviceLabel ?? "",
    requestedAnalysisClass: normalizeLiveInputAnalysisClass(
      overrides.requestedAnalysisClass ?? DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
    ),
    acousticIntent: normalizeLiveInputAcousticIntent(
      overrides.acousticIntent ?? DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
    ),
    resolvedAnalysisClass: normalizeResolvedLiveInputAnalysisClass(
      overrides.resolvedAnalysisClass ??
        DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
    ),
    sourceSessionId: overrides.sourceSessionId ?? null,
    sourceGeneration: overrides.sourceGeneration ?? null,
    observationAvailable: overrides.observationAvailable === true,
    errorCode: normalizeLiveInputErrorCode(overrides.errorCode),
  };
}
/** @param {unknown} error @returns {LiveInputErrorCode} */
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
    message.includes("device not found") ||
    message.includes("no input")
  ) {
    return LIVE_INPUT_ERROR_CODES.deviceMissing;
  }

  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    message.includes("could not start audio source") ||
    message.includes("could not start video source") ||
    message.includes("already in use") ||
    message.includes("device is in use") ||
    message.includes("hardware unavailable") ||
    message.includes("failed to allocate")
  ) {
    return LIVE_INPUT_ERROR_CODES.deviceUnavailable;
  }

  return LIVE_INPUT_ERROR_CODES.startFailed;
}

// Listening describes the connected capture source, including exact silence.
// Observation availability is separate; virtual response energy cannot measure
// input signal quality. Explicit processing failures still surface as errors.
/** @param {{status?:any,featureFrame?:any,featureRuntimeStatus?:any,liveInputUiState?:LiveInputUiState,liveInputErrorCode?:LiveInputErrorCode}=} options @returns {LiveInputRuntimeStatus} */
export function buildLiveInputRuntimeStatus({
  status,
  featureFrame,
  featureRuntimeStatus,
  liveInputUiState = LIVE_INPUT_UI_STATES.idle,
  liveInputErrorCode = LIVE_INPUT_ERROR_CODES.none,
} = {}) {
  const active = status?.isLiveInputActive === true,
    ui = normalizeLiveInputUiState(liveInputUiState);
  const failed =
    featureRuntimeStatus?.state === "failed" ||
    featureRuntimeStatus?.latestObservationStale === true;
  const errorCode =
    normalizeLiveInputErrorCode(liveInputErrorCode) !==
    LIVE_INPUT_ERROR_CODES.none
      ? normalizeLiveInputErrorCode(liveInputErrorCode)
      : active && failed
        ? LIVE_INPUT_ERROR_CODES.processingFailed
        : LIVE_INPUT_ERROR_CODES.none;
  const currentEpoch = ![
    "sourceGeneration",
    "workerGeneration",
    "timelineRevision",
    "processingRevision",
    "topologyRevision",
  ].some(
    (key) =>
      Number.isSafeInteger(featureRuntimeStatus?.[key]) &&
      featureRuntimeStatus[key] !== featureFrame?.observation?.[key],
  );
  const observationAvailable =
    active &&
    !failed &&
    featureRuntimeStatus?.revoked !== true &&
    featureRuntimeStatus?.renderAuthorityRevoked !== true &&
    currentEpoch &&
    hasRenderAuthority(featureFrame);
  const phase =
    ui === LIVE_INPUT_UI_STATES.stopping
      ? LIVE_INPUT_PHASES.stopping
      : ui === LIVE_INPUT_UI_STATES.error ||
          errorCode !== LIVE_INPUT_ERROR_CODES.none
        ? LIVE_INPUT_PHASES.error
        : ui === LIVE_INPUT_UI_STATES.starting
          ? LIVE_INPUT_PHASES.starting
          : !active
            ? LIVE_INPUT_PHASES.idle
            : LIVE_INPUT_PHASES.listening;
  return createLiveInputRuntimeStatus({
    active,
    phase,
    observationAvailable,
    errorCode,
    sourceSessionId: status?.sourceSession?.sessionId ?? null,
    sourceGeneration: observationAvailable
      ? featureFrame.observation.sourceGeneration
      : null,
    liveInputDeviceKind:
      status?.liveInputDeviceKind ?? status?.liveInputKind ?? null,
    selectedDeviceId: status?.selectedLiveInputDeviceId ?? null,
    selectedDeviceLabel: status?.selectedLiveInputDeviceLabel ?? "",
    requestedAnalysisClass: status?.liveInputAnalysisClass,
    resolvedAnalysisClass: status?.resolvedLiveInputAnalysisClass,
    acousticIntent: status?.liveInputAcousticIntent,
  });
}
/** @param {Partial<LiveInputRuntimeStatus>|null|undefined} left @param {Partial<LiveInputRuntimeStatus>|null|undefined} right @returns {boolean} */
export function areLiveInputRuntimeStatusesEqual(left, right) {
  const a = createLiveInputRuntimeStatus(left),
    b = createLiveInputRuntimeStatus(right);
  return Object.keys(a).every((key) => a[key] === b[key]);
}
/** @param {Partial<LiveInputRuntimeStatus>|null|undefined} status @returns {boolean} */
export function isLiveInputTransitionLocked(status) {
  return (
    status?.phase === LIVE_INPUT_PHASES.starting ||
    status?.phase === LIVE_INPUT_PHASES.stopping
  );
}
