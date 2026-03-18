export function clearFrameCache(frameCacheRefs) {
  frameCacheRefs.lastLiveFrameRef.current = null;
  frameCacheRefs.lastActiveFrameRef.current = null;
  frameCacheRefs.lastIdleFrameRef.current = null;
}

export function createEmptyControlSnapshots(controlsSnapshot = null) {
  return {
    shared: null,
    output: null,
    visualization: null,
    bloom: null,
    audit: null,
    hasBloomPass: false,
    controlsSnapshot,
  };
}

export function shouldReuseIdleFrame(status, controls) {
  return !status.isPlaying && !status.isMicActive && !controls.injectTestTone;
}

export function createRuntimeDiagnostics() {
  return {
    activeFrameCount: 0,
    averageFrameTimeMs: 0,
    smoothedFrameTimeMs: 0,
    worstFrameTimeMs: 0,
    longFrameCount: 0,
    currentPixelRatio: 1,
    basePixelRatio: 1,
    lastFrameWallTimeMs: null,
    lastLongFrame: null,
    lastVisibilityChange: null,
    rendererMode: null,
    lastRendererModeChange: null,
    lastPlaybackIssue: null,
  };
}

export function snapshotRuntimeDiagnostics(runtimeDiagnostics) {
  return {
    ...runtimeDiagnostics,
    lastLongFrame: runtimeDiagnostics.lastLongFrame
      ? { ...runtimeDiagnostics.lastLongFrame }
      : null,
    lastVisibilityChange: runtimeDiagnostics.lastVisibilityChange
      ? { ...runtimeDiagnostics.lastVisibilityChange }
      : null,
    lastRendererModeChange: runtimeDiagnostics.lastRendererModeChange
      ? { ...runtimeDiagnostics.lastRendererModeChange }
      : null,
    lastPlaybackIssue: runtimeDiagnostics.lastPlaybackIssue
      ? { ...runtimeDiagnostics.lastPlaybackIssue }
      : null,
  };
}

export function shouldPreservePausedFrameOnControlsChange(
  previousControls,
  nextControls,
) {
  if (!previousControls || !nextControls) {
    return false;
  }

  return (
    previousControls.outputMode !== nextControls.outputMode ||
    previousControls.outputBackgroundColor !==
      nextControls.outputBackgroundColor
  );
}
