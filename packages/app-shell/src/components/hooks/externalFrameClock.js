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
  externalFrameState,
  lastAppliedFrameSequence,
  fallbackClockSnapshot,
}) {
  if (!externalFrameState) {
    return {
      ...fallbackClockSnapshot,
      frameSequence: null,
      shouldAdvance: true,
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
