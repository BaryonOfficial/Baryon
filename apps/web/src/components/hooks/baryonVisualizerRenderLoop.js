import {
  applyAuditControls,
  applyBloomControls,
  applyOutputControls,
  applySharedControls,
  applyVisualizationControls,
  buildControlInspectionSnapshot,
} from "@baryon/visualizer/controls/runtime";
import { buildAudioFeatureFrame } from "@baryon/visualizer/audio-features";
import {
  shouldReuseIdleFrame,
  snapshotRuntimeDiagnostics,
} from "./baryonVisualizerRuntimeState.js";

const LONG_FRAME_THRESHOLD_MS = 34;
const PERFORMANCE_HUD_PUBLISH_INTERVAL_MS = 150;
const PERFORMANCE_HUD_SMOOTHING_ALPHA = 0.12;

function snapshotFeatureFrame(featureFrame) {
  return {
    ...featureFrame,
    backboneSlots:
      featureFrame.backboneSlots instanceof Float32Array
        ? new Float32Array(featureFrame.backboneSlots)
        : featureFrame.backboneSlots,
    detailSlots:
      featureFrame.detailSlots instanceof Float32Array
        ? new Float32Array(featureFrame.detailSlots)
        : featureFrame.detailSlots,
    bandEnergies:
      featureFrame.bandEnergies instanceof Float32Array
        ? new Float32Array(featureFrame.bandEnergies)
        : featureFrame.bandEnergies,
    modeSlots:
      featureFrame.modeSlots instanceof Float32Array
        ? new Float32Array(featureFrame.modeSlots)
        : featureFrame.modeSlots,
    fftMagnitudes:
      featureFrame.fftMagnitudes instanceof Float32Array
        ? new Float32Array(featureFrame.fftMagnitudes)
        : featureFrame.fftMagnitudes,
  };
}

export function getPlaybackDiagnosticDpr() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
}

function getRenderLoopWallTimeMs() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

export function buildPerformanceHudSnapshot(runtimeDiagnostics) {
  const smoothedFrameTimeMs = runtimeDiagnostics?.smoothedFrameTimeMs ?? 0;
  return {
    fps:
      smoothedFrameTimeMs > 0 && Number.isFinite(smoothedFrameTimeMs)
        ? 1000 / smoothedFrameTimeMs
        : 0,
    smoothedFrameTimeMs,
    currentPixelRatio: runtimeDiagnostics?.currentPixelRatio ?? 1,
    basePixelRatio: runtimeDiagnostics?.basePixelRatio ?? 1,
    rendererMode: runtimeDiagnostics?.rendererMode ?? null,
  };
}

export function publishPerformanceHudSnapshot(
  { runtimeDiagnostics, onPerformanceHudSnapshotChange, performanceHudState },
  {
    getWallTimeMs = getRenderLoopWallTimeMs,
    publishIntervalMs = PERFORMANCE_HUD_PUBLISH_INTERVAL_MS,
  } = {},
) {
  if (!onPerformanceHudSnapshotChange || !performanceHudState) {
    return null;
  }

  const wallTimeMs = getWallTimeMs();
  if (
    wallTimeMs - (performanceHudState.lastPublishedAtMs ?? 0) <
    publishIntervalMs
  ) {
    return null;
  }

  const snapshot = buildPerformanceHudSnapshot(runtimeDiagnostics);
  performanceHudState.lastPublishedAtMs = wallTimeMs;
  onPerformanceHudSnapshotChange(snapshot);
  return snapshot;
}

export function updateRendererDiagnostics(
  { state, controls, status, time, deltaTime, gl, renderLoopRefs },
  {
    getTargetDpr = getPlaybackDiagnosticDpr,
    getWallTimeMs = getRenderLoopWallTimeMs,
  } = {},
) {
  const runtimeDiagnostics = renderLoopRefs.runtimeDiagnosticsRef.current;
  const rendererMode =
    gl?.backend?.isWebGLBackend === true ? "webgl" : "webgpu";
  if (runtimeDiagnostics.rendererMode !== rendererMode) {
    runtimeDiagnostics.rendererMode = rendererMode;
    runtimeDiagnostics.lastRendererModeChange = {
      mode: rendererMode,
      atElapsedTimeSeconds: time,
      atWallTimeMs:
        typeof globalThis.performance?.now === "function"
          ? globalThis.performance.now()
          : 0,
    };
  }

  const lowLoadActive = Boolean(
    controls.lowLoadPlaybackDiagnostics && status.isPlaying,
  );
  const basePixelRatio = getTargetDpr();
  const targetPixelRatio = lowLoadActive ? 1 : basePixelRatio;
  const wallTimeMs = getWallTimeMs();
  const wallFrameTimeMs =
    typeof runtimeDiagnostics.lastFrameWallTimeMs === "number"
      ? Math.max(0, wallTimeMs - runtimeDiagnostics.lastFrameWallTimeMs)
      : null;
  const frameTimeMs =
    wallFrameTimeMs && Number.isFinite(wallFrameTimeMs)
      ? wallFrameTimeMs
      : Math.max(0, deltaTime * 1000);
  runtimeDiagnostics.lastFrameWallTimeMs = wallTimeMs;
  runtimeDiagnostics.smoothedFrameTimeMs =
    runtimeDiagnostics.smoothedFrameTimeMs > 0
      ? runtimeDiagnostics.smoothedFrameTimeMs +
        (frameTimeMs - runtimeDiagnostics.smoothedFrameTimeMs) *
          PERFORMANCE_HUD_SMOOTHING_ALPHA
      : frameTimeMs;
  runtimeDiagnostics.currentPixelRatio = targetPixelRatio;
  runtimeDiagnostics.basePixelRatio = basePixelRatio;
  if (renderLoopRefs.pixelRatioRef.current !== targetPixelRatio) {
    gl.setPixelRatio(targetPixelRatio);
    gl.setSize(state.size.width, state.size.height, false);
    renderLoopRefs.pixelRatioRef.current = targetPixelRatio;
  }

  if (status.isPlaying) {
    runtimeDiagnostics.activeFrameCount += 1;
    runtimeDiagnostics.averageFrameTimeMs +=
      (frameTimeMs - runtimeDiagnostics.averageFrameTimeMs) /
      runtimeDiagnostics.activeFrameCount;
    runtimeDiagnostics.worstFrameTimeMs = Math.max(
      runtimeDiagnostics.worstFrameTimeMs,
      frameTimeMs,
    );
    if (frameTimeMs >= LONG_FRAME_THRESHOLD_MS) {
      runtimeDiagnostics.longFrameCount += 1;
      runtimeDiagnostics.lastLongFrame = {
        durationMs: frameTimeMs,
        atElapsedTimeSeconds: time,
        playbackSessionId: status.playbackSessionId ?? null,
      };
    }
  }

  const playbackIssueSignature =
    status.lastPlaybackEndReason &&
    status.lastPlaybackDiagnostics?.playbackSessionId != null
      ? `${status.lastPlaybackEndReason}:${status.lastPlaybackDiagnostics.playbackSessionId}:${status.lastPlaybackDiagnostics.endedAtContextTimeSeconds ?? "na"}`
      : null;
  if (
    playbackIssueSignature &&
    playbackIssueSignature !==
      renderLoopRefs.lastAudioIssueSignatureRef.current &&
    (status.lastPlaybackEndReason === "premature" ||
      status.lastPlaybackEndReason === "interrupted")
  ) {
    renderLoopRefs.lastAudioIssueSignatureRef.current = playbackIssueSignature;
    runtimeDiagnostics.lastPlaybackIssue = {
      reason: status.lastPlaybackEndReason,
      playbackSessionId: status.lastPlaybackDiagnostics?.playbackSessionId,
      atElapsedTimeSeconds: time,
      averageFrameTimeMs: runtimeDiagnostics.averageFrameTimeMs,
      worstFrameTimeMs: runtimeDiagnostics.worstFrameTimeMs,
      longFrameCount: runtimeDiagnostics.longFrameCount,
      lastLongFrame: runtimeDiagnostics.lastLongFrame,
      lastVisibilityChange: runtimeDiagnostics.lastVisibilityChange,
      rendererMode,
      lastRendererModeChange: runtimeDiagnostics.lastRendererModeChange,
    };
  }

  return {
    lowLoadActive,
    rendererMode,
    runtimeDiagnostics,
  };
}

export function applyCachedControlSnapshots(
  {
    controls,
    runtime,
    runtimeState,
    featureState,
    gl,
    ensurePipeline,
    postNodesRef,
    renderLoopRefs,
  },
  appliers = {
    applySharedControls,
    applyOutputControls,
    applyVisualizationControls,
    applyBloomControls,
    applyAuditControls,
  },
) {
  const {
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  } = renderLoopRefs.controlCacheRefs;
  const hasBloomPass = Boolean(postNodesRef.current?.bloomPass);
  const controlsChanged =
    appliedControlVersionRef.current !== controlVersionRef.current ||
    cachedControlSnapshotsRef.current.hasBloomPass !== hasBloomPass;

  if (controlsChanged) {
    cachedControlSnapshotsRef.current = {
      shared: appliers.applySharedControls(gl, controls),
      output: appliers.applyOutputControls(
        { ensurePipeline, postNodesRef },
        controls,
      ),
      visualization: appliers.applyVisualizationControls(
        runtime.method,
        runtimeState,
        controls,
      ),
      bloom: appliers.applyBloomControls(
        { ensurePipeline, postNodesRef, runtimeState },
        controls,
      ),
      audit: appliers.applyAuditControls(featureState, controls),
      hasBloomPass,
      controlsSnapshot: cachedControlSnapshotsRef.current.controlsSnapshot,
    };
    appliedControlVersionRef.current = controlVersionRef.current;
  }

  return cachedControlSnapshotsRef.current;
}

export function resolveFeatureFrame(
  {
    audio,
    featureState,
    runtimeState,
    controls,
    status,
    time,
    clockMode,
    micProfile,
    renderLoopRefs,
    chromesthesiaEnabled,
  },
  { buildFeatureFrame = buildAudioFeatureFrame } = {},
) {
  const { lastLiveFrameRef, lastActiveFrameRef, lastIdleFrameRef } =
    renderLoopRefs.frameCacheRefs;

  if (clockMode === "paused-playback" && !lastActiveFrameRef.current) {
    const liveFrame = lastLiveFrameRef.current;
    if (liveFrame) {
      lastActiveFrameRef.current = snapshotFeatureFrame(liveFrame);
    }
  }

  const shouldReusePausedFrame =
    clockMode === "paused-playback" && lastActiveFrameRef.current;
  const shouldReuseStaticIdleFrame =
    shouldReuseIdleFrame(status, controls) && lastIdleFrameRef.current;

  let featureFrame = lastActiveFrameRef.current;
  if (!shouldReusePausedFrame && !shouldReuseStaticIdleFrame) {
    featureFrame = buildFeatureFrame({
      analysisSnapshot: audio.readAnalysisSnapshot(),
      featureState,
      radius: runtimeState.uniforms.uRadius.value,
      status,
      frameTimeMs: time * 1000,
      micAnalysisSettings: {
        profile: micProfile,
      },
      includeChromesthesia: chromesthesiaEnabled,
    });

    if (shouldReuseIdleFrame(status, controls)) {
      lastIdleFrameRef.current = featureFrame;
    } else {
      lastIdleFrameRef.current = null;
    }
  } else if (shouldReuseStaticIdleFrame) {
    featureFrame = lastIdleFrameRef.current;
  }

  if (status.isPlaying || status.isMicActive) {
    lastLiveFrameRef.current = featureFrame;
    lastActiveFrameRef.current = null;
    lastIdleFrameRef.current = null;
  } else if (clockMode !== "paused-playback") {
    lastLiveFrameRef.current = null;
    lastActiveFrameRef.current = null;
  }

  const effectiveFrame =
    clockMode === "paused-playback" && lastActiveFrameRef.current
      ? lastActiveFrameRef.current
      : featureFrame;

  return {
    featureFrame,
    effectiveFrame,
  };
}

export function syncMicRuntimeStatus({
  status,
  featureFrame,
  micProfile,
  setMicRuntimeStatus,
  renderLoopRefs,
}) {
  const nextMicRuntimeStatus = status.isMicActive
    ? {
        active: true,
        calibrating: Boolean(featureFrame.debug?.micCalibrationActive),
        profile: featureFrame.debug?.micProfile ?? micProfile ?? "voice-tone",
      }
    : {
        active: false,
        calibrating: false,
        profile: micProfile ?? "voice-tone",
      };
  const previousMicRuntimeStatus =
    renderLoopRefs.lastMicRuntimeStatusRef.current;

  if (
    !previousMicRuntimeStatus ||
    previousMicRuntimeStatus.active !== nextMicRuntimeStatus.active ||
    previousMicRuntimeStatus.calibrating !== nextMicRuntimeStatus.calibrating ||
    previousMicRuntimeStatus.profile !== nextMicRuntimeStatus.profile
  ) {
    renderLoopRefs.lastMicRuntimeStatusRef.current = nextMicRuntimeStatus;
    setMicRuntimeStatus?.(nextMicRuntimeStatus);
  }

  return nextMicRuntimeStatus;
}

export function applyReactiveBloomState({
  controls,
  runtimeState,
  postNodesRef,
  bloom,
}) {
  const bloomPass = postNodesRef.current?.bloomPass;
  if (!bloomPass || !bloom) {
    return bloom;
  }

  const reactiveBloom = {
    ...bloom,
    strength: runtimeState?.bloomTuning?.effectiveStrength ?? bloom.strength,
    radius: runtimeState?.bloomTuning?.effectiveRadius ?? bloom.radius,
    threshold: runtimeState?.bloomTuning?.effectiveThreshold ?? bloom.threshold,
  };

  bloomPass.strength.value = reactiveBloom.strength;
  bloomPass.radius.value = reactiveBloom.radius;
  bloomPass.threshold.value = reactiveBloom.threshold;

  return controls.bloomEnabled ? reactiveBloom : bloom;
}

function buildAuditSnapshotPayload({
  runtime,
  runtimeState,
  status,
  runtimeDiagnostics,
  snapshotDiagnostics,
}) {
  return {
    visualizationMethod: runtime.method,
    renderer: window.__baryonRendererInfo ?? null,
    audioDiagnostics: {
      playbackSessionId: status.playbackSessionId,
      lastPlaybackEndReason: status.lastPlaybackEndReason,
      lastPlaybackDiagnostics: status.lastPlaybackDiagnostics,
      runtime: snapshotDiagnostics(runtimeDiagnostics),
    },
    ...runtimeState.debugSnapshot,
  };
}

function publishAuditSnapshot(
  {
    controls,
    runtime,
    runtimeState,
    status,
    featureState,
    lowLoadActive,
    runtimeDiagnostics,
  },
  { snapshotDiagnostics, logAudit },
) {
  if (!controls.auditEnabled || !runtimeState.debugSnapshot) {
    delete window.__baryonAuditSnapshot;
    return;
  }

  const payload = buildAuditSnapshotPayload({
    runtime,
    runtimeState,
    status,
    runtimeDiagnostics,
    snapshotDiagnostics,
  });
  window.__baryonAuditSnapshot = payload;

  const frame = featureState.audit?.frame ?? 0;
  const interval = Math.max(1, Math.floor(controls.logEveryFrames));
  if (!lowLoadActive && frame % interval === 0) {
    logAudit("[Baryon audit]", payload);
  }
}

function publishControlSnapshot(
  {
    runtime,
    lowLoadActive,
    shared,
    output,
    visualization,
    bloom,
    audit,
    sceneSnapshot,
    audio,
  },
  { buildControlSnapshot },
) {
  if (lowLoadActive) {
    return;
  }

  window.__baryonControlState = buildControlSnapshot({
    method: runtime.method,
    audio: audio.getMicSettings(),
    shared,
    output,
    visualization,
    raymarch: visualization,
    bloom,
    audit,
    scene: sceneSnapshot,
  });
}

export function publishDevtoolsSnapshots(
  {
    devtoolsEnabled,
    controls,
    runtime,
    runtimeState,
    status,
    featureState,
    lowLoadActive,
    runtimeDiagnostics,
    shared,
    output,
    visualization,
    bloom,
    audit,
    sceneSnapshot,
    audio,
  },
  {
    buildControlSnapshot = buildControlInspectionSnapshot,
    snapshotDiagnostics = snapshotRuntimeDiagnostics,
    logAudit = console.log,
    markRuntimeReady = () => {},
  } = {},
) {
  if (!devtoolsEnabled || typeof window === "undefined") {
    return;
  }

  publishAuditSnapshot(
    {
      controls,
      runtime,
      runtimeState,
      status,
      featureState,
      lowLoadActive,
      runtimeDiagnostics,
    },
    {
      snapshotDiagnostics,
      logAudit,
    },
  );
  publishControlSnapshot(
    {
      runtime,
      lowLoadActive,
      shared,
      output,
      visualization,
      bloom,
      audit,
      sceneSnapshot,
      audio,
    },
    {
      buildControlSnapshot,
    },
  );

  markRuntimeReady();
}
