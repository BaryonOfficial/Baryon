/** @typedef {"file" | "system"} AudioSourceKind */
/**
 * @typedef {
 *   | "empty"
 *   | "loading"
 *   | "ready"
 *   | "active"
 *   | "paused"
 *   | "starting"
 *   | "ended"
 *   | "stopped"
 *   | "error"
 * } AudioSourcePhase
 */
/**
 * @typedef {object} AudioSystemCapture
 * @property {string | null} [deviceKind]
 * @property {string | null} [deviceId]
 * @property {string | null} [deviceLabel]
 */
/**
 * @typedef {object} AudioSourceSession
 * @property {AudioSourceKind} kind
 * @property {AudioSourcePhase} phase
 * @property {number} sessionId
 * @property {number} timelineRevision
 * @property {string | null} terminalReason
 * @property {AudioSystemCapture | null} systemCapture
 */
/**
 * @typedef {object} AudioSourceEvent
 * @property {string} type
 * @property {AudioSourceKind} [kind]
 * @property {AudioSourcePhase} [phase]
 * @property {number} [sessionId]
 * @property {number} [timelineRevision]
 * @property {string} [reason]
 * @property {AudioSystemCapture} [capture]
 */

export const AUDIO_SOURCE_KINDS = Object.freeze({
  file: "file",
  system: "system",
});

export const AUDIO_SOURCE_PHASES = Object.freeze({
  empty: "empty",
  loading: "loading",
  ready: "ready",
  active: "active",
  paused: "paused",
  starting: "starting",
  ended: "ended",
  stopped: "stopped",
  error: "error",
});

export const AUDIO_SOURCE_EVENTS = Object.freeze({
  select: "select",
  fileLoadStarted: "file-load-started",
  fileLoadReady: "file-load-ready",
  filePlayStarted: "file-play-started",
  filePaused: "file-paused",
  fileEnded: "file-ended",
  fileStopped: "file-stopped",
  fileError: "file-error",
  fileTimelineChanged: "file-timeline-changed",
  systemStarting: "system-starting",
  systemActive: "system-active",
  systemStopped: "system-stopped",
  systemError: "system-error",
  reset: "reset",
});

function normalizeKind(kind) {
  return kind === AUDIO_SOURCE_KINDS.system
    ? AUDIO_SOURCE_KINDS.system
    : AUDIO_SOURCE_KINDS.file;
}

function nextSessionId(session) {
  return Math.max(0, Math.floor(session?.sessionId ?? 0)) + 1;
}

function isCurrentSession(session, event, kind) {
  return (
    session.kind === kind &&
    Number.isFinite(event.sessionId) &&
    event.sessionId === session.sessionId
  );
}

/** @returns {AudioSourceSession} */
export function createAudioSourceSession() {
  return {
    kind: AUDIO_SOURCE_KINDS.file,
    phase: AUDIO_SOURCE_PHASES.empty,
    sessionId: 0,
    timelineRevision: 0,
    terminalReason: null,
    systemCapture: null,
  };
}

/**
 * @param {AudioSourceSession} session
 * @returns {AudioSourceSession}
 */
export function cloneAudioSourceSession(session) {
  return {
    ...session,
    systemCapture: session.systemCapture
      ? { ...session.systemCapture }
      : null,
  };
}

export function isPreparedFileAwaitingPlayback(status) {
  return (
    status?.sourceSession?.kind === AUDIO_SOURCE_KINDS.file &&
    status?.sourceSession?.phase === AUDIO_SOURCE_PHASES.ready &&
    status?.isAudioLoaded === true &&
    status?.hasPreparedFileAnalysisSource === true &&
    status?.isPlaying !== true &&
    status?.isPlaybackPaused !== true &&
    status?.isLiveInputActive !== true &&
    status?.naturalRingdownActive !== true
  );
}

/**
 * @param {AudioSourceSession | null | undefined} session
 * @param {AudioSourceEvent | null | undefined} event
 * @returns {AudioSourceSession}
 */
export function reduceAudioSourceSession(session, event) {
  const current = session ?? createAudioSourceSession();
  if (!event || typeof event.type !== "string") return current;

  switch (event.type) {
    case AUDIO_SOURCE_EVENTS.select: {
      const kind = normalizeKind(event.kind);
      if (kind === current.kind) return current;
      return {
        kind,
        phase:
          event.phase ??
          (kind === AUDIO_SOURCE_KINDS.file
            ? AUDIO_SOURCE_PHASES.empty
            : AUDIO_SOURCE_PHASES.ready),
        sessionId: nextSessionId(current),
        timelineRevision:
          kind === AUDIO_SOURCE_KINDS.file
            ? Math.max(0, Math.floor(event.timelineRevision ?? 0))
            : 0,
        terminalReason: null,
        systemCapture: null,
      };
    }

    case AUDIO_SOURCE_EVENTS.fileLoadStarted:
      return {
        kind: AUDIO_SOURCE_KINDS.file,
        phase: AUDIO_SOURCE_PHASES.loading,
        sessionId: nextSessionId(current),
        timelineRevision: 0,
        terminalReason: null,
        systemCapture: null,
      };

    case AUDIO_SOURCE_EVENTS.systemStarting:
      return {
        kind: AUDIO_SOURCE_KINDS.system,
        phase: AUDIO_SOURCE_PHASES.starting,
        sessionId: nextSessionId(current),
        timelineRevision: 0,
        terminalReason: null,
        systemCapture: null,
      };

    case AUDIO_SOURCE_EVENTS.fileLoadReady:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.ready,
        terminalReason: null,
      };

    case AUDIO_SOURCE_EVENTS.filePlayStarted:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.active,
        terminalReason: null,
      };

    case AUDIO_SOURCE_EVENTS.filePaused:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return { ...current, phase: AUDIO_SOURCE_PHASES.paused };

    case AUDIO_SOURCE_EVENTS.fileEnded:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.ended,
        terminalReason: event.reason ?? "natural",
      };

    case AUDIO_SOURCE_EVENTS.fileStopped:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.stopped,
        terminalReason: event.reason ?? "stopped",
      };

    case AUDIO_SOURCE_EVENTS.fileError:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.error,
        terminalReason: event.reason ?? "error",
      };

    case AUDIO_SOURCE_EVENTS.fileTimelineChanged:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.file)) {
        return current;
      }
      return {
        ...current,
        timelineRevision: current.timelineRevision + 1,
      };

    case AUDIO_SOURCE_EVENTS.systemActive:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.system)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.active,
        terminalReason: null,
        systemCapture: event.capture ? { ...event.capture } : null,
      };

    case AUDIO_SOURCE_EVENTS.systemStopped:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.system)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.stopped,
        terminalReason: event.reason ?? "stopped",
        systemCapture: null,
      };

    case AUDIO_SOURCE_EVENTS.systemError:
      if (!isCurrentSession(current, event, AUDIO_SOURCE_KINDS.system)) {
        return current;
      }
      return {
        ...current,
        phase: AUDIO_SOURCE_PHASES.error,
        terminalReason: event.reason ?? "error",
        systemCapture: null,
      };

    case AUDIO_SOURCE_EVENTS.reset:
      return createAudioSourceSession();

    default:
      return current;
  }
}
