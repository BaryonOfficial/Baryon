const DEFAULT_FRAME_TIME_MS = 1000 / 60;

export function resolveFrameDeltaMs(previousFrameAtMs, currentFrameAtMs) {
  if (!Number.isFinite(previousFrameAtMs) || previousFrameAtMs <= 0) {
    return DEFAULT_FRAME_TIME_MS;
  }

  return Math.max(1, currentFrameAtMs - previousFrameAtMs);
}

export function resolveContinuityDeltaMs(previousFrameAtMs, currentFrameAtMs) {
  if (
    !Number.isFinite(previousFrameAtMs) ||
    !Number.isFinite(currentFrameAtMs)
  ) {
    return DEFAULT_FRAME_TIME_MS;
  }

  return Math.max(0, currentFrameAtMs - previousFrameAtMs);
}

export function computeEmaAlpha(deltaMs, smoothingMs) {
  if (!(deltaMs > 0) || !(smoothingMs > 0)) {
    return 1;
  }

  return 1 - Math.exp(-deltaMs / smoothingMs);
}
