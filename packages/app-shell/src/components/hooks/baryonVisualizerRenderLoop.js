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
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";

const LONG_FRAME_THRESHOLD_MS = 34;
const PERFORMANCE_HUD_PUBLISH_INTERVAL_MS = 150;
const PERFORMANCE_HUD_SMOOTHING_ALPHA = 0.25;

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
  { state, controls, status, time, deltaTime, rfDelta, gl, renderLoopRefs },
  { getTargetDpr = getPlaybackDiagnosticDpr } = {},
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
  const frameTimeMs =
    typeof rfDelta === "number" && rfDelta > 0 && Number.isFinite(rfDelta)
      ? rfDelta * 1000
      : typeof deltaTime === "number" &&
          deltaTime > 0 &&
          Number.isFinite(deltaTime)
        ? deltaTime * 1000
        : null;
  if (frameTimeMs !== null) {
    runtimeDiagnostics.smoothedFrameTimeMs =
      runtimeDiagnostics.smoothedFrameTimeMs > 0
        ? runtimeDiagnostics.smoothedFrameTimeMs +
          (frameTimeMs - runtimeDiagnostics.smoothedFrameTimeMs) *
            PERFORMANCE_HUD_SMOOTHING_ALPHA
        : frameTimeMs;
  }
  runtimeDiagnostics.currentPixelRatio = targetPixelRatio;
  runtimeDiagnostics.basePixelRatio = basePixelRatio;
  if (renderLoopRefs.pixelRatioRef.current !== targetPixelRatio) {
    gl.setPixelRatio(targetPixelRatio);
    gl.setSize(state.size.width, state.size.height, false);
    renderLoopRefs.pixelRatioRef.current = targetPixelRatio;
  }

  if (status.isPlaying && frameTimeMs !== null) {
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
    if (runtimeState) {
      runtimeState.auditEnabled = controls.auditEnabled;
    }
    appliedControlVersionRef.current = controlVersionRef.current;
  }

  return cachedControlSnapshotsRef.current;
}

export function resolveFeatureFrame(
  {
    audio,
    featureState,
    featureAnalyzer,
    runtimeState,
    controls,
    status,
    time,
    clockMode,
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
    const analysisSnapshot = audio.readAnalysisSnapshot();
    featureAnalyzer?.enqueueAnalysisFrame?.({
      analysisSnapshot,
      status,
      frameTimeMs: time * 1000,
    });
    const analysisHints = featureAnalyzer?.readHints?.({
      status,
      frameTimeMs: time * 1000,
    });
    featureFrame = buildFeatureFrame({
      analysisSnapshot,
      featureState,
      radius: runtimeState.uniforms.uRadius.value,
      status,
      frameTimeMs: time * 1000,
      includeChromesthesia: chromesthesiaEnabled,
      analysisHints,
    });

    if (shouldReuseIdleFrame(status, controls)) {
      lastIdleFrameRef.current = featureFrame;
    } else {
      lastIdleFrameRef.current = null;
    }
  } else if (shouldReuseStaticIdleFrame) {
    featureFrame = lastIdleFrameRef.current;
  }

  if (status.isPlaying || status.isLiveInputActive) {
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

export function syncLiveInputRuntimeStatus({
  status,
  setLiveInputRuntimeStatus,
  renderLoopRefs,
}) {
  const nextLiveInputRuntimeStatus = status.isLiveInputActive
    ? {
        active: true,
      }
    : createLiveInputRuntimeStatus();
  const previousLiveInputRuntimeStatus =
    renderLoopRefs.lastLiveInputRuntimeStatusRef.current;

  if (
    !previousLiveInputRuntimeStatus ||
    previousLiveInputRuntimeStatus.active !== nextLiveInputRuntimeStatus.active
  ) {
    renderLoopRefs.lastLiveInputRuntimeStatusRef.current =
      nextLiveInputRuntimeStatus;
    setLiveInputRuntimeStatus?.((currentStatus) => ({
      ...(currentStatus ?? {}),
      ...nextLiveInputRuntimeStatus,
    }));
  }

  return nextLiveInputRuntimeStatus;
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

  const bt = runtimeState?.bloomTuning;
  const strength = bt?.effectiveStrength ?? bloom.strength;
  const radius = bt?.effectiveRadius ?? bloom.radius;
  const threshold = bt?.effectiveThreshold ?? bloom.threshold;

  const bloomActive = controls.bloomEnabled && strength > 1e-4;
  bloomPass.strength.value = strength;
  bloomPass.radius.value = radius;
  bloomPass.threshold.value = bloomActive ? threshold : 999;

  return bloom;
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
    audio: audio.getLiveInputSettings(),
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
