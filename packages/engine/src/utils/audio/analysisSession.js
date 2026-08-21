import { AUDIO_SOURCE_KINDS } from "../../core/audio/audioSourceSession.js";

export function buildAnalysisSourceKey(status) {
  const sourceSession = status?.sourceSession;
  if (
    sourceSession?.kind !== AUDIO_SOURCE_KINDS.file &&
    sourceSession?.kind !== AUDIO_SOURCE_KINDS.system
  ) {
    return "idle";
  }

  const sessionId = Number.isFinite(sourceSession.sessionId)
    ? Math.max(0, Math.floor(sourceSession.sessionId))
    : "none";
  return `${sourceSession.kind}:${sessionId}`;
}

export function buildAnalysisSessionKey(status) {
  if (typeof status?.sessionKey === "string" && status.sessionKey) {
    return status.sessionKey;
  }

  const sourceKey = buildAnalysisSourceKey(status);
  if (!sourceKey.startsWith("file:")) {
    return sourceKey;
  }

  const timelineRevision = Math.max(
    0,
    Math.floor(status?.sourceSession?.timelineRevision ?? 0),
  );
  return timelineRevision > 0
    ? `${sourceKey}:timeline:${timelineRevision}`
    : sourceKey;
}

function readFrameLiveInputActive(featureFrame) {
  if (typeof featureFrame?.isLiveInputActive === "boolean") {
    return featureFrame.isLiveInputActive;
  }
  return featureFrame?.sourceEvidence?.transport?.liveInputActive === true;
}

/**
 * @returns {"source-session" | "source-state" | null}
 */
export function resolveAnalysisFrameStaleness(featureFrame, status) {
  if (!featureFrame) {
    return null;
  }

  const observedSessionKey = featureFrame?.observationSessionKey;
  if (
    typeof observedSessionKey === "string" &&
    observedSessionKey !== buildAnalysisSessionKey(status)
  ) {
    return "source-session";
  }

  if (
    status?.sourceSession?.kind === AUDIO_SOURCE_KINDS.system &&
    readFrameLiveInputActive(featureFrame) !==
      (status?.isLiveInputActive === true)
  ) {
    return "source-state";
  }

  return null;
}
