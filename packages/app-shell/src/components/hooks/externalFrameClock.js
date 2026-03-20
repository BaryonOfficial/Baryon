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
  const shouldAdvance =
    frameSequence === null || frameSequence !== lastAppliedFrameSequence;

  return {
    status: externalFrameState.status,
    clockMode: externalFrameState.clockMode,
    time: externalFrameState.time,
    deltaTime: shouldAdvance ? externalFrameState.deltaTime : 0,
    frameSequence,
    shouldAdvance,
  };
}
