import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";
import { assertAudioFeatureAuthorityRole } from "../audioFeatureAuthorityRole.js";

function resolveExternalFrameIdentity(externalFrameState) {
  const frameSequence = externalFrameState?.frameSequence ?? null;
  if (frameSequence != null) {
    return frameSequence;
  }

  const frameCreatedAtMs = Number(externalFrameState?.frameCreatedAtMs);
  return Number.isFinite(frameCreatedAtMs)
    ? `created:${frameCreatedAtMs}`
    : null;
}

export function getSourceAuthoritativeClock({
  audioFeatureAuthorityRole,
  externalFrameState,
  lastAppliedFrameSequence,
  fallbackClockSnapshot,
}) {
  assertAudioFeatureAuthorityRole(audioFeatureAuthorityRole);

  if (
    audioFeatureAuthorityRole === AUDIO_FEATURE_AUTHORITY_ROLES.localProducer
  ) {
    return {
      ...fallbackClockSnapshot,
      frameSequence: null,
      frameIdentity: null,
      shouldAdvance: true,
    };
  }

  if (!externalFrameState) {
    return {
      status: null,
      clockMode: "external-hold",
      time: 0,
      deltaTime: 0,
      frameSequence: null,
      frameIdentity: null,
      shouldAdvance: false,
    };
  }

  const frameSequence = externalFrameState.frameSequence ?? null;
  const frameIdentity = resolveExternalFrameIdentity(externalFrameState);
  const shouldAdvance =
    frameIdentity === null || frameIdentity !== lastAppliedFrameSequence;

  return {
    status: externalFrameState.status,
    clockMode: externalFrameState.clockMode,
    time: externalFrameState.time,
    deltaTime: shouldAdvance ? externalFrameState.deltaTime : 0,
    frameSequence,
    frameIdentity,
    shouldAdvance,
  };
}
