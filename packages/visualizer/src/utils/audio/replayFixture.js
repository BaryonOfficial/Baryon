export function reviveSerializedReplayFrame(frame) {
  if (!frame) {
    return null;
  }

  const snapshot = frame.analysisSnapshot
    ? {
        ...frame.analysisSnapshot,
        fftMagnitudes: Array.isArray(frame.analysisSnapshot.fftMagnitudes)
          ? new Float32Array(frame.analysisSnapshot.fftMagnitudes)
          : null,
        timeData: Array.isArray(frame.analysisSnapshot.timeData)
          ? new Uint8Array(frame.analysisSnapshot.timeData)
          : null,
      }
    : null;

  return {
    frameTimeMs: frame.frameTimeMs ?? 0,
    status: frame.status ?? {},
    analysisSnapshot: snapshot,
  };
}

export function reviveSerializedReplayFrames(frames) {
  return Array.isArray(frames)
    ? frames.map((frame) => reviveSerializedReplayFrame(frame))
    : [];
}
