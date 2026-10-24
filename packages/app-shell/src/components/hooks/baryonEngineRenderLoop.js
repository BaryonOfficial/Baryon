import {
  applyBloomControls,
  applyEffectiveRaymarchStepBudget,
  applyOutputControls,
  applyRaymarchControls,
  applySharedControls,
  buildAuditControlSnapshot,
  buildControlInspectionSnapshot,
} from "@baryon/engine/controls/runtime";
import { createRendererFeatureView } from "@baryon/engine/audio-features";
import { hasRenderAuthority } from "@baryon/engine/core/renderAuthorityContract";
import { isVisualizationMethod } from "@baryon/engine/visualization/types";
import { resolveTemporalReprojectionPolicy } from "@baryon/engine/render/temporalReprojectionPolicy";
import {
  DEFAULT_PERFORMANCE_TARGET_FPS,
  getRenderQualityProfileTargetFps,
  isAdaptivePerformanceProfile,
  MIN_PRESENTATION_RAYMARCH_STEPS,
  normalizePerformanceTargetFps,
  normalizeOutputMode,
  OUTPUT_MODES,
  PERFORMANCE_PROFILES,
  RENDER_CONTEXTS,
  markRenderOutputVisualIdle,
} from "@baryon/engine/render/outputPipeline";
import {
  initializeAdaptiveRaymarchRuntimeState,
  recordRuntimePerfSample,
  snapshotModalFreshnessDiagnostics,
  snapshotRuntimePerfBreakdown,
  snapshotRuntimeDiagnostics,
} from "./baryonEngineRuntimeState.js";
import { readObservedResponseEnergy } from "./modalResponseDiagnostics.js";
export { syncLiveInputRuntimeStatus } from "./liveInputRuntimeSync.js";

const LONG_FRAME_THRESHOLD_MS = 34;
const FRAME_DROP_THRESHOLD_16_7_MS = 16.7;
const FRAME_DROP_THRESHOLD_25_MS = 25;
const FRAME_DROP_THRESHOLD_33_3_MS = 33.3;
const FRAME_DROP_THRESHOLD_50_MS = 50;
const MAX_RECENT_LONG_FRAME_SAMPLES = 8;
const PERFORMANCE_HUD_PUBLISH_INTERVAL_MS = 150;
const FRAME_TIME_SMOOTHING_ALPHA = 0.25;
const ADAPTIVE_RAYMARCH_DECISION_WINDOW_SECONDS = 0.33;
const ADAPTIVE_RAYMARCH_MIN_DECISION_WINDOW_FRAMES = 8;
const ADAPTIVE_RAYMARCH_MAX_DECISION_WINDOW_FRAMES = 80;
const ADAPTIVE_RAYMARCH_RECOVERY_WINDOWS = 3;
const ADAPTIVE_RAYMARCH_STEP_DOWN_LONG_FRAME_RATIO = 0.1;
const ADAPTIVE_RAYMARCH_PRESSURE_SAFETY_MARGIN = 0.9;
const ADAPTIVE_RAYMARCH_PRESSURE_FRAME_TIME_RATIO = 1.03;
const ADAPTIVE_RAYMARCH_STABLE_FRAME_TIME_RATIO = 0.9;
const ADAPTIVE_RAYMARCH_LONG_FRAME_TIME_RATIO = 1.35;
const RAYMARCH_USER_TUNABLE_STEP_MIN = MIN_PRESENTATION_RAYMARCH_STEPS;
const ADAPTIVE_RAYMARCH_STEP_LADDER = Object.freeze([
  16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192,
]);
const STAGE_ATTRIBUTION_TIEBREAK_ORDER = Object.freeze([
  "unattributed",
  "render",
  "analysis",
  "control",
  "engine",
]);
const STAGE_ATTRIBUTION_BUCKET_PERF_KEYS = Object.freeze({
  analysis: Object.freeze([]),
  engine: Object.freeze(["readFeatureModelMs", "createRendererFeatureViewMs"]),
  control: Object.freeze([
    "applyCachedControlSnapshotsMs",
    "syncLiveInputRuntimeStatusMs",
    "runtimeTickMs",
    "applySceneControlsMs",
  ]),
  render: Object.freeze(["pipelineRenderMs"]),
});

function readPerfAverageMs(perfBreakdown, key) {
  const averageMs = perfBreakdown?.[key]?.averageMs;
  return Number.isFinite(averageMs) ? Number(averageMs) : 0;
}

function readFiniteNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

function sumPerfAverageMs(perfBreakdown, keys) {
  return keys.reduce(
    (totalMs, key) => totalMs + readPerfAverageMs(perfBreakdown, key),
    0,
  );
}

function resolveDominantStageAttributionBucket(bucketValues) {
  let dominantBucket = STAGE_ATTRIBUTION_TIEBREAK_ORDER[0];
  let dominantValue = Number.NEGATIVE_INFINITY;
  for (const bucketName of STAGE_ATTRIBUTION_TIEBREAK_ORDER) {
    const bucketValue = bucketValues[bucketName];
    if (bucketValue > dominantValue) {
      dominantBucket = bucketName;
      dominantValue = bucketValue;
    }
  }

  return dominantBucket;
}

function buildStageAttribution(runtimeDiagnostics, perfBreakdown) {
  const smoothedFrameTimeMs = Number.isFinite(
    runtimeDiagnostics?.smoothedFrameTimeMs,
  )
    ? Number(runtimeDiagnostics.smoothedFrameTimeMs)
    : 0;
  const analysisCpuMs = sumPerfAverageMs(
    perfBreakdown,
    STAGE_ATTRIBUTION_BUCKET_PERF_KEYS.analysis,
  );
  const engineCpuMs = sumPerfAverageMs(
    perfBreakdown,
    STAGE_ATTRIBUTION_BUCKET_PERF_KEYS.engine,
  );
  const controlCpuMs = sumPerfAverageMs(
    perfBreakdown,
    STAGE_ATTRIBUTION_BUCKET_PERF_KEYS.control,
  );
  const renderCpuMs = sumPerfAverageMs(
    perfBreakdown,
    STAGE_ATTRIBUTION_BUCKET_PERF_KEYS.render,
  );
  const measuredCpuMs =
    analysisCpuMs + engineCpuMs + controlCpuMs + renderCpuMs;
  const unattributedFrameMs = Math.max(0, smoothedFrameTimeMs - measuredCpuMs);
  const bucketValues = {
    unattributed: unattributedFrameMs,
    render: renderCpuMs,
    analysis: analysisCpuMs,
    control: controlCpuMs,
    engine: engineCpuMs,
  };

  return {
    analysisCpuMs,
    engineCpuMs,
    controlCpuMs,
    renderCpuMs,
    measuredCpuMs,
    unattributedFrameMs,
    dominantBucket: resolveDominantStageAttributionBucket(bucketValues),
  };
}

function buildStageEngineCounters(diagnostics) {
  return diagnostics?.engine ? { ...diagnostics.engine } : null;
}

function snapshotRenderSurfaceDiagnostics(renderSurface) {
  if (!renderSurface) {
    return {
      cssWidth: 0,
      cssHeight: 0,
      backingWidth: 0,
      backingHeight: 0,
      backingMegapixels: 0,
      pixelRatio: 1,
    };
  }

  return {
    cssWidth: readFiniteNonNegativeNumber(renderSurface.cssWidth),
    cssHeight: readFiniteNonNegativeNumber(renderSurface.cssHeight),
    backingWidth: Math.round(
      readFiniteNonNegativeNumber(renderSurface.backingWidth),
    ),
    backingHeight: Math.round(
      readFiniteNonNegativeNumber(renderSurface.backingHeight),
    ),
    backingMegapixels: readFiniteNonNegativeNumber(
      renderSurface.backingMegapixels,
    ),
    pixelRatio: readFiniteNonNegativeNumber(renderSurface.pixelRatio, 1),
  };
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function updateModalFreshnessDiagnostics(
  diagnostics,
  frame,
  { getWallTimeMs = getRenderLoopWallTimeMs } = {},
) {
  const target = diagnostics?.modalFreshness;
  if (!target) return;
  const observation = frame?.observation,
    topology = frame?.topology;
  Object.assign(target, {
    frameId: observation?.frameId ?? null,
    sourcePhase: observation?.sourcePhase ?? null,
    familyCount: topology?.familyCount ?? 0,
    shellCount: topology?.shellCount ?? 0,
    endSample: observation?.endSample ?? null,
    inputEndSample: observation?.inputEndSample ?? null,
    preparationDelayFrames: observation?.preparationDelayFrames ?? null,
    observationTimeSeconds:
      observation && topology
        ? observation.endSample / topology.sampleRate
        : null,
    normalizationEnergy: observation ? readObservedResponseEnergy(frame) : null,
    observationAgeMs: diagnostics.engine?.latestObservationAgeMs ?? null,
    renderSubmittedAtMs: getWallTimeMs(),
  });
}

export function updateModalEnvelopeDiagnostics(
  runtimeDiagnostics,
  runtimeState,
) {
  const modalFreshness = runtimeDiagnostics?.modalFreshness;
  if (!modalFreshness || !runtimeState) {
    return;
  }

  modalFreshness.responseEnvelope = readFiniteNumber(
    runtimeState.responseEnvelope,
  );
  modalFreshness.accentEnvelope = readFiniteNumber(runtimeState.accentEnvelope);
  modalFreshness.motionSignal = readFiniteNumber(runtimeState.motionSignal);
  modalFreshness.scaleSignal = readFiniteNumber(runtimeState.scaleSignal);
  modalFreshness.bloomResponseSignal = readFiniteNumber(
    runtimeState.bloomResponseSignal,
  );
}

export function getDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio || 1);
}

export function getRenderTargetPixelRatio(basePixelRatio = null) {
  if (Number.isFinite(basePixelRatio) && basePixelRatio > 0) {
    return basePixelRatio;
  }

  return getDevicePixelRatio();
}

function getRenderLoopWallTimeMs() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

const RENDER_FRAME_PACER_TOLERANCE_MS = 0.5;

export function createRenderFramePacerState() {
  return { nextRenderDueAtMs: Number.NEGATIVE_INFINITY };
}

/**
 * Gate a free-running render loop to an explicit frames-per-second budget.
 *
 * A `frameloop="always"` canvas ticks at the display refresh rate, so on
 * high-refresh displays a 60fps render policy would otherwise render every
 * tick. Returns true when the caller should render this tick and advances the
 * pacer clock; returns false when the tick falls inside the current frame
 * interval. Stays phase-locked while the loop keeps up and rebases after a
 * stall so a long frame is not followed by a burst of catch-up frames.
 *
 * @param {{ nextRenderDueAtMs: number }} pacerState
 * @param {number | null} targetFps
 * @param {number} nowMs
 * @returns {boolean}
 */
export function consumeRenderFramePacerSlot(pacerState, targetFps, nowMs) {
  if (!Number.isFinite(targetFps) || targetFps <= 0) {
    return true;
  }

  if (nowMs + RENDER_FRAME_PACER_TOLERANCE_MS < pacerState.nextRenderDueAtMs) {
    return false;
  }

  const intervalMs = 1000 / targetFps;
  const dueAtMs = pacerState.nextRenderDueAtMs;
  pacerState.nextRenderDueAtMs =
    Number.isFinite(dueAtMs) && nowMs - dueAtMs < intervalMs
      ? dueAtMs + intervalMs
      : nowMs + intervalMs;
  return true;
}

function classifyFrameSemanticSource(source) {
  switch (source) {
    case "feature-model":
      return { fresh: true, reused: false };
    case "static-idle-cache":
    case "paused-file-hold":
      return { fresh: false, reused: true };
    default:
      return { fresh: false, reused: false };
  }
}

function recordFrameSemanticSource(runtimeDiagnostics, source) {
  const modalFreshness = runtimeDiagnostics?.modalFreshness;
  if (!modalFreshness) {
    return;
  }

  const { fresh, reused } = classifyFrameSemanticSource(source);
  modalFreshness.frameSemanticSource = source ?? null;
  modalFreshness.frameSemanticFresh = fresh;
  modalFreshness.frameSemanticReused = reused;
}

export function buildPerformanceHudSnapshot(runtimeDiagnostics) {
  const smoothedFrameTimeMs = runtimeDiagnostics?.smoothedFrameTimeMs ?? 0;
  const render = runtimeDiagnostics?.render ?? null;
  const perfBreakdown = snapshotRuntimePerfBreakdown(
    runtimeDiagnostics?.perfBreakdown,
  );
  return {
    fps:
      smoothedFrameTimeMs > 0 && Number.isFinite(smoothedFrameTimeMs)
        ? 1000 / smoothedFrameTimeMs
        : 0,
    smoothedFrameTimeMs,
    currentPixelRatio: runtimeDiagnostics?.currentPixelRatio ?? 1,
    basePixelRatio: runtimeDiagnostics?.basePixelRatio ?? 1,
    rendererMode: runtimeDiagnostics?.rendererMode ?? null,
    visualizationMethod: render?.visualizationMethod ?? null,
    qualityPreset: render?.qualityPreset ?? null,
    targetFps: render?.targetFps ?? DEFAULT_PERFORMANCE_TARGET_FPS,
    traaEnabled: render?.traaEnabled ?? false,
    smaaEnabled: runtimeDiagnostics?.postProcess?.smaaGraphEnabled ?? false,
    temporalHistoryBlend:
      runtimeDiagnostics?.postProcess?.temporalHistoryBlend ?? null,
    requestedRaymarchSteps: render?.requestedRaymarchSteps ?? 0,
    effectiveRaymarchSteps: render?.effectiveRaymarchSteps ?? 0,
    adaptiveRaymarchActive: render?.adaptiveRaymarchActive ?? false,
    frameDrops: {
      framesOver16_7Ms: runtimeDiagnostics?.frameDrops?.framesOver16_7Ms ?? 0,
      framesOver25Ms: runtimeDiagnostics?.frameDrops?.framesOver25Ms ?? 0,
      framesOver33_3Ms: runtimeDiagnostics?.frameDrops?.framesOver33_3Ms ?? 0,
      framesOver50Ms: runtimeDiagnostics?.frameDrops?.framesOver50Ms ?? 0,
    },
    perfBreakdown,
    stageAttribution: buildStageAttribution(runtimeDiagnostics, perfBreakdown),
    engineCounters: buildStageEngineCounters(runtimeDiagnostics),
    renderSurface: snapshotRenderSurfaceDiagnostics(
      runtimeDiagnostics?.renderSurface,
    ),
    modalFreshness: snapshotModalFreshnessDiagnostics(
      runtimeDiagnostics?.modalFreshness,
    ),
    modalVarietyAudit: runtimeDiagnostics?.render?.modalVarietyAudit ?? null,
  };
}

function resolveAdaptiveTargetFps(renderProfile, controls) {
  if (!isAdaptivePerformanceProfile(renderProfile?.qualityPreset)) {
    return DEFAULT_PERFORMANCE_TARGET_FPS;
  }

  const profileTargetFps = getRenderQualityProfileTargetFps(renderProfile);
  if (profileTargetFps != null) {
    return profileTargetFps;
  }

  return renderProfile?.qualityPreset === PERFORMANCE_PROFILES.custom
    ? normalizePerformanceTargetFps(controls?.customTargetFps)
    : DEFAULT_PERFORMANCE_TARGET_FPS;
}

function buildAdaptiveRaymarchTuning(targetFps) {
  const normalizedTargetFps = normalizePerformanceTargetFps(targetFps);
  const targetFrameTimeMs = 1000 / normalizedTargetFps;
  const decisionFrameCount = Math.min(
    ADAPTIVE_RAYMARCH_MAX_DECISION_WINDOW_FRAMES,
    Math.max(
      ADAPTIVE_RAYMARCH_MIN_DECISION_WINDOW_FRAMES,
      Math.round(
        normalizedTargetFps * ADAPTIVE_RAYMARCH_DECISION_WINDOW_SECONDS,
      ),
    ),
  );

  return {
    targetFps: normalizedTargetFps,
    targetFrameTimeMs,
    pressureFrameTimeMs:
      targetFrameTimeMs * ADAPTIVE_RAYMARCH_PRESSURE_FRAME_TIME_RATIO,
    stableFrameTimeMs:
      targetFrameTimeMs * ADAPTIVE_RAYMARCH_STABLE_FRAME_TIME_RATIO,
    decisionFrameCount,
    longFrameThresholdMs:
      targetFrameTimeMs * ADAPTIVE_RAYMARCH_LONG_FRAME_TIME_RATIO,
    stepDownLongFrameCount: Math.max(
      1,
      Math.round(
        decisionFrameCount * ADAPTIVE_RAYMARCH_STEP_DOWN_LONG_FRAME_RATIO,
      ),
    ),
  };
}

export function syncRenderSurfacePixelRatio({
  gl,
  renderLoopRefs,
  runtimeDiagnostics,
  basePixelRatio = null,
}) {
  if (!gl || !runtimeDiagnostics) {
    return null;
  }

  const resolvedBasePixelRatio = getRenderTargetPixelRatio(basePixelRatio);
  const targetPixelRatio = Math.max(0.25, resolvedBasePixelRatio);

  runtimeDiagnostics.currentPixelRatio = targetPixelRatio;
  runtimeDiagnostics.basePixelRatio = resolvedBasePixelRatio;

  if (
    renderLoopRefs?.pixelRatioRef &&
    renderLoopRefs.pixelRatioRef.current !== targetPixelRatio
  ) {
    gl.setPixelRatio(targetPixelRatio);
    renderLoopRefs.pixelRatioRef.current = targetPixelRatio;
  }

  return targetPixelRatio;
}

function readRaymarchFamilyCount(frame) {
  return hasRenderAuthority(frame) ? frame.topology.familyCount : 0;
}

/**
 * Decide whether to flush TRAA temporal history (show the crisp scene color)
 * for this raymarch-pipeline frame. Delegates to engine temporal
 * reprojection policy so app-shell does not own field-drive semantics.
 *
 * @param {{ runtimeMethod?: unknown, featureFrame?: any, sceneSnapshot?: any, traaRequested?: boolean }} params
 * @returns {boolean}
 */
export function shouldBypassTemporalHistoryForRaymarchFrame({
  runtimeMethod,
  featureFrame,
  sceneSnapshot,
  traaRequested,
}) {
  return resolveTemporalReprojectionPolicy({
    visualizationMethod: runtimeMethod,
    featureFrame,
    sceneSnapshot,
    traaRequested,
  }).shouldBypassHistory;
}

export function finalizeTerminalVisualIdleState({
  featureFrame,
  runtimeState,
  postNodes,
}) {
  if (hasRenderAuthority(featureFrame)) {
    return {
      terminalVisualIdle: false,
      resumedFromVisualIdle: postNodes?.visualIdleFinalized === true,
    };
  }

  if (runtimeState?.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }

  return {
    terminalVisualIdle: true,
    resumedFromVisualIdle: false,
    markedTemporalBypass: markRenderOutputVisualIdle(postNodes),
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

function updateRenderSurfaceDiagnostics(
  runtimeDiagnostics,
  { cssWidth, cssHeight, targetPixelRatio, gl },
) {
  if (!runtimeDiagnostics?.renderSurface) {
    return;
  }

  const normalizedCssWidth = readFiniteNonNegativeNumber(cssWidth);
  const normalizedCssHeight = readFiniteNonNegativeNumber(cssHeight);
  const normalizedPixelRatio = readFiniteNonNegativeNumber(targetPixelRatio, 1);
  const canvas = gl?.domElement ?? null;
  const backingWidth = readFiniteNonNegativeNumber(
    canvas?.width,
    normalizedCssWidth * normalizedPixelRatio,
  );
  const backingHeight = readFiniteNonNegativeNumber(
    canvas?.height,
    normalizedCssHeight * normalizedPixelRatio,
  );

  runtimeDiagnostics.renderSurface.cssWidth = normalizedCssWidth;
  runtimeDiagnostics.renderSurface.cssHeight = normalizedCssHeight;
  runtimeDiagnostics.renderSurface.pixelRatio = normalizedPixelRatio;
  runtimeDiagnostics.renderSurface.backingWidth = Math.round(backingWidth);
  runtimeDiagnostics.renderSurface.backingHeight = Math.round(backingHeight);
  runtimeDiagnostics.renderSurface.backingMegapixels =
    (runtimeDiagnostics.renderSurface.backingWidth *
      runtimeDiagnostics.renderSurface.backingHeight) /
    1_000_000;
}

/** Completion cadence in wall-clock milliseconds, never animation callbacks,
 * GPU execution time, or physical display presentation. The frame producer
 * admits only successful completions from the current renderer generation.
 */
export function recordCompletedRenderFrame(
  runtimeDiagnostics,
  { completedAtMs, time, status },
) {
  if (!Number.isFinite(completedAtMs)) return;
  const previous = runtimeDiagnostics.lastCompletedFrameAtMs;
  if (previous !== null && completedAtMs <= previous) return;
  runtimeDiagnostics.lastCompletedFrameAtMs = completedAtMs;
  // The first completion establishes an endpoint, not a frame interval.
  if (previous === null) return;
  const frameTimeMs = completedAtMs - previous;
  const sourceStatus = status ?? {};
  runtimeDiagnostics.lastFrameTimeMs = frameTimeMs;
  runtimeDiagnostics.smoothedFrameTimeMs =
    runtimeDiagnostics.smoothedFrameTimeMs > 0
      ? runtimeDiagnostics.smoothedFrameTimeMs +
        (frameTimeMs - runtimeDiagnostics.smoothedFrameTimeMs) *
          FRAME_TIME_SMOOTHING_ALPHA
      : frameTimeMs;
  runtimeDiagnostics.worstFrameTimeMs = Math.max(
    runtimeDiagnostics.worstFrameTimeMs,
    frameTimeMs,
  );
  if (frameTimeMs > FRAME_DROP_THRESHOLD_16_7_MS) {
    runtimeDiagnostics.frameDrops.framesOver16_7Ms += 1;
  }
  if (frameTimeMs > FRAME_DROP_THRESHOLD_25_MS) {
    runtimeDiagnostics.frameDrops.framesOver25Ms += 1;
  }
  if (frameTimeMs > FRAME_DROP_THRESHOLD_33_3_MS) {
    runtimeDiagnostics.frameDrops.framesOver33_3Ms += 1;
  }
  if (frameTimeMs > FRAME_DROP_THRESHOLD_50_MS) {
    runtimeDiagnostics.frameDrops.framesOver50Ms += 1;
  }
  if (frameTimeMs >= LONG_FRAME_THRESHOLD_MS) {
    runtimeDiagnostics.longFrameCount += 1;
    runtimeDiagnostics.lastLongFrame = {
      durationMs: frameTimeMs,
      atElapsedTimeSeconds: time,
      playbackSessionId: sourceStatus.playbackSessionId ?? null,
    };
    runtimeDiagnostics.frameDrops.recentLongFramesMs.push(frameTimeMs);
    if (
      runtimeDiagnostics.frameDrops.recentLongFramesMs.length >
      MAX_RECENT_LONG_FRAME_SAMPLES
    ) {
      runtimeDiagnostics.frameDrops.recentLongFramesMs.splice(
        0,
        runtimeDiagnostics.frameDrops.recentLongFramesMs.length -
          MAX_RECENT_LONG_FRAME_SAMPLES,
      );
    }
  }
  if (sourceStatus.isPlaying) {
    runtimeDiagnostics.activeFrameCount += 1;
    runtimeDiagnostics.averageFrameTimeMs +=
      (frameTimeMs - runtimeDiagnostics.averageFrameTimeMs) /
      runtimeDiagnostics.activeFrameCount;
  }
}

export function updateRendererDiagnostics(
  { state, controls, status, time, gl, renderLoopRefs },
  { getRequestedPixelRatio = getDevicePixelRatio } = {},
) {
  const runtimeDiagnostics = renderLoopRefs.runtimeDiagnosticsRef.current;
  const sourceStatus = status ?? {};
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

  const suppressPlaybackTelemetryActive = Boolean(
    controls.suppressPlaybackTelemetry && sourceStatus.isPlaying,
  );
  const targetPixelRatio = syncRenderSurfacePixelRatio({
    gl,
    renderLoopRefs,
    runtimeDiagnostics,
    basePixelRatio: getRequestedPixelRatio(),
  });
  const nextRenderSurfaceWidth = state?.size?.width ?? 0;
  const nextRenderSurfaceHeight = state?.size?.height ?? 0;
  const previousRenderSurfaceSize =
    renderLoopRefs.renderSurfaceSizeRef.current ?? null;
  const renderSurfaceSizeChanged =
    previousRenderSurfaceSize?.width !== nextRenderSurfaceWidth ||
    previousRenderSurfaceSize?.height !== nextRenderSurfaceHeight;
  if (renderSurfaceSizeChanged) {
    gl.setSize(state.size.width, state.size.height, false);
    renderLoopRefs.renderSurfaceSizeRef.current = {
      width: nextRenderSurfaceWidth,
      height: nextRenderSurfaceHeight,
    };
  }
  updateRenderSurfaceDiagnostics(runtimeDiagnostics, {
    cssWidth: nextRenderSurfaceWidth,
    cssHeight: nextRenderSurfaceHeight,
    targetPixelRatio,
    gl,
  });

  const playbackIssueSignature =
    sourceStatus.lastPlaybackEndReason &&
    sourceStatus.lastPlaybackDiagnostics?.playbackSessionId != null
      ? `${sourceStatus.lastPlaybackEndReason}:${sourceStatus.lastPlaybackDiagnostics.playbackSessionId}:${sourceStatus.lastPlaybackDiagnostics.endedAtContextTimeSeconds ?? "na"}`
      : null;
  if (
    playbackIssueSignature &&
    playbackIssueSignature !==
      renderLoopRefs.lastAudioIssueSignatureRef.current &&
    (sourceStatus.lastPlaybackEndReason === "premature" ||
      sourceStatus.lastPlaybackEndReason === "interrupted")
  ) {
    renderLoopRefs.lastAudioIssueSignatureRef.current = playbackIssueSignature;
    runtimeDiagnostics.lastPlaybackIssue = {
      reason: sourceStatus.lastPlaybackEndReason,
      playbackSessionId:
        sourceStatus.lastPlaybackDiagnostics?.playbackSessionId,
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
    suppressPlaybackTelemetryActive,
    rendererMode,
    runtimeDiagnostics,
  };
}

function normalizeRequestedRaymarchSteps(runtimeState, controls) {
  const requestedSteps =
    controls?.raymarchSteps ??
    runtimeState?.requestedRaymarchSteps ??
    runtimeState?.effectiveRaymarchSteps ??
    runtimeState?.volumeMesh?.material?.steps ??
    64;

  return Math.max(
    RAYMARCH_USER_TUNABLE_STEP_MIN,
    Math.round(requestedSteps || 0),
  );
}

function buildAdaptiveRaymarchLadder(requestedStepBudget) {
  const normalizedRequestedStepBudget = normalizeRequestedRaymarchSteps(null, {
    raymarchSteps: requestedStepBudget,
  });
  const rungSet = new Set(
    ADAPTIVE_RAYMARCH_STEP_LADDER.filter(
      (stepBudget) => stepBudget < normalizedRequestedStepBudget,
    ),
  );
  rungSet.add(normalizedRequestedStepBudget);
  return Array.from(rungSet).sort((left, right) => left - right);
}

function getAdaptiveLadderMaxRung(ladder) {
  return Math.max(0, ladder.length - 1);
}

function clampAdaptiveLadderRung(rung, ladder) {
  return Math.min(Math.max(0, rung), getAdaptiveLadderMaxRung(ladder));
}

function findAdaptiveLadderRungForValue(ladder, value) {
  const normalizedValue =
    typeof value === "number" ? Number(value.toFixed(2)) : value;
  const matchedIndex = ladder.findIndex(
    (entry) => Number(entry.toFixed(2)) === normalizedValue,
  );
  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  const fallbackIndex = ladder.findIndex((entry) => entry >= value);
  return fallbackIndex >= 0 ? fallbackIndex : getAdaptiveLadderMaxRung(ladder);
}

function resolveAdaptiveStartInputs({ renderProfile, requestedStepBudget }) {
  const stepLadder = buildAdaptiveRaymarchLadder(requestedStepBudget);

  if (renderProfile?.qualityPreset === PERFORMANCE_PROFILES.maxQuality) {
    return {
      startRung: getAdaptiveLadderMaxRung(stepLadder),
      startupStepBudget: null,
    };
  }

  const startupRaymarchSteps = Number.isFinite(
    renderProfile?.startupRaymarchSteps,
  )
    ? renderProfile.startupRaymarchSteps
    : 32;
  return {
    startRung: findAdaptiveLadderRungForValue(stepLadder, startupRaymarchSteps),
    startupStepBudget: startupRaymarchSteps,
  };
}

function resolveAdaptiveCurrentRung({ currentRung, ladder }) {
  if (Number.isFinite(currentRung)) {
    return clampAdaptiveLadderRung(currentRung, ladder);
  }
  return getAdaptiveLadderMaxRung(ladder);
}

function resetAdaptiveRaymarchState(
  adaptiveRaymarch,
  requestedStepBudget,
  { preserveHistory = false, startRung = null } = {},
) {
  const ladder = buildAdaptiveRaymarchLadder(requestedStepBudget);
  const resolvedStartRung = Number.isFinite(startRung)
    ? clampAdaptiveLadderRung(startRung, ladder)
    : getAdaptiveLadderMaxRung(ladder);
  adaptiveRaymarch.currentRung = resolvedStartRung;
  adaptiveRaymarch.effectiveRaymarchSteps = ladder[resolvedStartRung];
  adaptiveRaymarch.decisionFrameCount = 0;
  adaptiveRaymarch.longFrameCountInWindow = 0;
  adaptiveRaymarch.stableWindowCount = 0;
  adaptiveRaymarch.recoveryEligible = false;
  adaptiveRaymarch.recoveryBlockedReason = "none";
  if (!preserveHistory) {
    adaptiveRaymarch.stepDownCount = 0;
    adaptiveRaymarch.stepUpCount = 0;
  }
  return {
    ladder,
  };
}

function updateAdaptiveRaymarchControllerFrameTiming(
  adaptiveRaymarch,
  frameTimeMs,
) {
  if (!(Number.isFinite(frameTimeMs) && frameTimeMs > 0)) {
    return;
  }

  adaptiveRaymarch.controllerLastFrameTimeMs = frameTimeMs;
  adaptiveRaymarch.controllerSmoothedFrameTimeMs =
    adaptiveRaymarch.controllerSmoothedFrameTimeMs > 0
      ? adaptiveRaymarch.controllerSmoothedFrameTimeMs +
        (frameTimeMs - adaptiveRaymarch.controllerSmoothedFrameTimeMs) *
          FRAME_TIME_SMOOTHING_ALPHA
      : frameTimeMs;
}

function publishAdaptiveRaymarchDiagnostics(
  runtimeDiagnostics,
  adaptiveRaymarch,
) {
  Object.assign(runtimeDiagnostics.adaptiveRaymarch, adaptiveRaymarch);
}

function findAdaptiveRaymarchRungAtOrBelow(ladder, stepBudget) {
  let rung = 0;
  for (let index = 0; index < ladder.length; index += 1) {
    if (ladder[index] <= stepBudget) {
      rung = index;
      continue;
    }
    break;
  }
  return rung;
}

function deriveAdaptivePressureRung({
  ladder,
  currentRung,
  targetFrameTimeMs,
  smoothedFrameTimeMs,
}) {
  if (!(smoothedFrameTimeMs > 0)) {
    return Math.max(0, currentRung - 1);
  }

  const currentBudget = ladder[currentRung] ?? ladder[ladder.length - 1] ?? 16;
  const estimatedBudget =
    currentBudget *
    (targetFrameTimeMs / smoothedFrameTimeMs) *
    ADAPTIVE_RAYMARCH_PRESSURE_SAFETY_MARGIN;
  const estimatedRung = findAdaptiveRaymarchRungAtOrBelow(
    ladder,
    estimatedBudget,
  );
  return Math.max(0, Math.min(currentRung - 1, estimatedRung));
}

function deriveAdaptiveRecoveryState({ effectiveFrame, adaptiveRaymarch }) {
  const sourceGeneration =
    effectiveFrame?.observation?.sourceGeneration ?? null;
  const sourceTransition =
    sourceGeneration !== null &&
    adaptiveRaymarch.lastSourceGeneration !== null &&
    sourceGeneration !== adaptiveRaymarch.lastSourceGeneration;
  const reason = sourceTransition
    ? "source-transition"
    : !hasRenderAuthority(effectiveFrame)
      ? "render-not-authorized"
      : !effectiveFrame.audioMotionAuthority
        ? "source-held"
        : "none";
  return {
    recoveryEligible: reason === "none",
    recoveryBlockedReason: reason,
    sourceGeneration,
    sourceTransition,
  };
}

function resolveAdaptiveStepBudgetAtRung({ ladder, rung }) {
  return Math.max(
    MIN_PRESENTATION_RAYMARCH_STEPS,
    ladder[clampAdaptiveLadderRung(rung, ladder)],
  );
}

export function resolveRaymarchFieldAnalysisFrameInputs(state, frame) {
  const familyCount = readRaymarchFamilyCount(frame);
  const source = state?.fieldSource?.read();
  return {
    familyCount,
    shellCount: familyCount ? frame.topology.shellCount : 0,
    uploadedFamilyCount: source?.topology?.familyCount ?? 0,
  };
}

export function syncUploadedRenderQuantities(diagnostics, state) {
  if (!diagnostics || !state) return;
  const source = state.fieldSource?.read();
  const render = diagnostics.render ?? (diagnostics.render = {});
  Object.assign(render, {
    uploadedFamilyCount: source?.topology?.familyCount ?? 0,
    uploadedShellCount: source?.topology?.shellCount ?? 0,
    basisCompileCount: source?.basisCompileCount ?? 0,
    observationUploadCount: source?.observationUploadCount ?? 0,
    observerConsumedEndSample:
      state.lastBakedFeatureFrame?.observation.endSample ?? null,
    derivedTextureBytes: source?.textureBytes ?? 0,
  });
}

export function updateAdaptiveRaymarchStepBudget({
  controls,
  runtime,
  runtimeState,
  renderProfile,
  effectiveFrame,
  runtimeDiagnostics,
}) {
  if (!runtimeState || !runtimeDiagnostics) {
    return 0;
  }
  initializeAdaptiveRaymarchRuntimeState(runtimeState);
  const adaptiveRaymarch = runtimeState.adaptiveRaymarchController;
  updateAdaptiveRaymarchControllerFrameTiming(
    adaptiveRaymarch,
    runtimeDiagnostics.lastFrameTimeMs,
  );

  const requestedStepBudget = normalizeRequestedRaymarchSteps(
    runtimeState,
    controls,
  );
  const { familyCount, shellCount, uploadedFamilyCount } =
    resolveRaymarchFieldAnalysisFrameInputs(runtimeState, effectiveFrame);
  const activeRaymarchFrame = Boolean(
    isVisualizationMethod(runtime?.method) && familyCount > 0,
  );
  const profileAllowsAdaptiveRaymarch = isAdaptivePerformanceProfile(
    renderProfile?.qualityPreset,
  );
  const adaptiveQualityActive =
    profileAllowsAdaptiveRaymarch && activeRaymarchFrame;
  // Measured frame time controls only ray integration quality. The complete
  // acoustic basis and matrices are never selected or pruned by this controller.
  const adaptiveTuning = buildAdaptiveRaymarchTuning(
    resolveAdaptiveTargetFps(renderProfile, controls),
  );
  adaptiveRaymarch.targetFps = adaptiveTuning.targetFps;
  adaptiveRaymarch.targetFrameTimeMs = adaptiveTuning.targetFrameTimeMs;

  let ladder = buildAdaptiveRaymarchLadder(requestedStepBudget);
  const adaptiveStartInputs = resolveAdaptiveStartInputs({
    renderProfile,
    requestedStepBudget,
  });
  const previousInitializationInputs =
    runtimeState.adaptiveRaymarchInitializationInputs ?? null;
  const nextInitializationInputs = {
    requestedStepBudget,
    profileAllowsAdaptiveRaymarch,
    targetFps: adaptiveTuning.targetFps,
    startupStepBudget: adaptiveStartInputs.startupStepBudget,
  };
  // Runtime state owns controller initialization. Diagnostics and React
  // profile effects are projections/notifications, never reset triggers.
  const profileInitializationChanged = Boolean(
    previousInitializationInputs == null ||
    previousInitializationInputs.profileAllowsAdaptiveRaymarch !==
      nextInitializationInputs.profileAllowsAdaptiveRaymarch ||
    previousInitializationInputs.targetFps !==
      nextInitializationInputs.targetFps ||
    previousInitializationInputs.startupStepBudget !==
      nextInitializationInputs.startupStepBudget,
  );
  const requestedStepBudgetChanged = Boolean(
    previousInitializationInputs?.requestedStepBudget !== requestedStepBudget,
  );
  if (profileInitializationChanged || requestedStepBudgetChanged) {
    ({ ladder } = resetAdaptiveRaymarchState(
      adaptiveRaymarch,
      requestedStepBudget,
      {
        startRung: profileInitializationChanged
          ? adaptiveStartInputs.startRung
          : adaptiveRaymarch.currentRung,
      },
    ));
    runtimeState.adaptiveRaymarchInitializationInputs =
      nextInitializationInputs;
  }
  adaptiveRaymarch.requestedRaymarchSteps = requestedStepBudget;

  if (!adaptiveQualityActive) {
    const inactiveStepRung = profileAllowsAdaptiveRaymarch
      ? resolveAdaptiveCurrentRung({
          currentRung: adaptiveRaymarch.currentRung,
          ladder,
        })
      : getAdaptiveLadderMaxRung(ladder);
    const inactiveStepBudget = resolveAdaptiveStepBudgetAtRung({
      ladder,
      rung: inactiveStepRung,
    });
    adaptiveRaymarch.adaptiveRaymarchActive = false;
    adaptiveRaymarch.currentRung = inactiveStepRung;
    adaptiveRaymarch.effectiveRaymarchSteps = inactiveStepBudget;
    applyEffectiveRaymarchStepBudget(
      runtimeState,
      controls,
      inactiveStepBudget,
    );
    publishAdaptiveRaymarchDiagnostics(runtimeDiagnostics, adaptiveRaymarch);
    // Non-adaptive profiles hold the user cap; adaptive profiles hold their
    // committed step rung across transient inactive frames.
    return inactiveStepBudget;
  }

  adaptiveRaymarch.adaptiveRaymarchActive = true;
  adaptiveRaymarch.currentRung = resolveAdaptiveCurrentRung({
    currentRung: adaptiveRaymarch.currentRung,
    ladder,
  });
  const recoveryState = deriveAdaptiveRecoveryState({
    effectiveFrame,
    adaptiveRaymarch,
  });
  adaptiveRaymarch.recoveryEligible = recoveryState.recoveryEligible;
  adaptiveRaymarch.recoveryBlockedReason = recoveryState.recoveryBlockedReason;
  adaptiveRaymarch.lastSourceGeneration = recoveryState.sourceGeneration;
  if (recoveryState.sourceTransition) {
    adaptiveRaymarch.stableWindowCount = 0;
  }

  adaptiveRaymarch.decisionFrameCount += 1;
  if (
    adaptiveRaymarch.controllerLastFrameTimeMs >
    adaptiveTuning.longFrameThresholdMs
  ) {
    adaptiveRaymarch.longFrameCountInWindow += 1;
  }

  if (
    adaptiveRaymarch.decisionFrameCount >= adaptiveTuning.decisionFrameCount
  ) {
    if (runtimeDiagnostics.uiInteraction?.active === true) {
      runtimeDiagnostics.uiInteraction.suppressedAdaptivePressureFrameCount =
        (runtimeDiagnostics.uiInteraction
          .suppressedAdaptivePressureFrameCount ?? 0) + 1;
      adaptiveRaymarch.decisionFrameCount = 0;
      adaptiveRaymarch.longFrameCountInWindow = 0;
      adaptiveRaymarch.stableWindowCount = 0;
    } else {
      const smoothedFrameTimeMs =
        adaptiveRaymarch.controllerSmoothedFrameTimeMs;
      const underPressure =
        smoothedFrameTimeMs > adaptiveTuning.pressureFrameTimeMs ||
        adaptiveRaymarch.longFrameCountInWindow >=
          adaptiveTuning.stepDownLongFrameCount;
      const stableWindow =
        smoothedFrameTimeMs > 0 &&
        smoothedFrameTimeMs < adaptiveTuning.stableFrameTimeMs &&
        adaptiveRaymarch.longFrameCountInWindow === 0;

      if (underPressure) {
        if (adaptiveRaymarch.currentRung > 0) {
          const nextPressureRung = deriveAdaptivePressureRung({
            ladder,
            currentRung: adaptiveRaymarch.currentRung,
            targetFrameTimeMs: adaptiveTuning.targetFrameTimeMs,
            smoothedFrameTimeMs,
          });
          if (nextPressureRung < adaptiveRaymarch.currentRung) {
            adaptiveRaymarch.stepDownCount +=
              adaptiveRaymarch.currentRung - nextPressureRung;
            adaptiveRaymarch.currentRung = nextPressureRung;
          }
        }
        adaptiveRaymarch.stableWindowCount = 0;
      } else if (stableWindow && recoveryState.recoveryEligible) {
        adaptiveRaymarch.stableWindowCount += 1;
        if (
          adaptiveRaymarch.stableWindowCount >=
          ADAPTIVE_RAYMARCH_RECOVERY_WINDOWS
        ) {
          if (adaptiveRaymarch.currentRung < ladder.length - 1) {
            adaptiveRaymarch.currentRung += 1;
            adaptiveRaymarch.stepUpCount += 1;
          }
          adaptiveRaymarch.stableWindowCount = 0;
        }
      } else {
        adaptiveRaymarch.stableWindowCount = 0;
      }

      adaptiveRaymarch.decisionFrameCount = 0;
      adaptiveRaymarch.longFrameCountInWindow = 0;
    }
  }

  const effectiveStepBudget = resolveAdaptiveStepBudgetAtRung({
    ladder,
    rung: adaptiveRaymarch.currentRung,
  });
  adaptiveRaymarch.effectiveRaymarchSteps = effectiveStepBudget;
  adaptiveRaymarch.familyCount = familyCount;
  adaptiveRaymarch.shellCount = shellCount;
  adaptiveRaymarch.uploadedFamilyCount = uploadedFamilyCount;
  applyEffectiveRaymarchStepBudget(runtimeState, controls, effectiveStepBudget);
  publishAdaptiveRaymarchDiagnostics(runtimeDiagnostics, adaptiveRaymarch);
  // Profile-owned adaptation stops at the step ladder.
  return effectiveStepBudget;
}

export function applyCachedControlSnapshots(
  {
    controls,
    runtimeState,
    gl,
    ensurePipeline,
    postNodesRef,
    renderProfileRef,
    renderLoopRefs,
    surfaceOutputMode = null,
  },
  appliers = {
    applySharedControls,
    applyOutputControls,
    applyRaymarchControls,
    applyBloomControls,
  },
) {
  const {
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  } = renderLoopRefs.controlCacheRefs;
  const controlsChanged =
    appliedControlVersionRef.current !== controlVersionRef.current ||
    cachedControlSnapshotsRef.current.appliedPostNodes !==
      postNodesRef.current ||
    cachedControlSnapshotsRef.current.surfaceOutputMode !== surfaceOutputMode;

  if (controlsChanged) {
    const outputControls = resolveRenderSurfaceOutputControls(
      controls,
      renderProfileRef.current,
      { outputMode: surfaceOutputMode },
    );
    cachedControlSnapshotsRef.current = {
      shared: appliers.applySharedControls(gl, controls),
      output: appliers.applyOutputControls(
        { ensurePipeline, postNodesRef, renderProfileRef },
        outputControls,
      ),
      visualization: appliers.applyRaymarchControls(runtimeState, controls),
      bloom: appliers.applyBloomControls(
        { ensurePipeline, postNodesRef, renderProfileRef, runtimeState },
        outputControls,
      ),
      audit: buildAuditControlSnapshot(controls),
      // Applying output controls may create the pipeline. Record the objects
      // that actually received them so the next frame does not reapply them.
      appliedPostNodes: postNodesRef.current,
      surfaceOutputMode,
      controlsSnapshot: cachedControlSnapshotsRef.current.controlsSnapshot,
    };
    if (runtimeState) {
      runtimeState.auditEnabled = controls.auditEnabled;
    }
    appliedControlVersionRef.current = controlVersionRef.current;
  }

  return {
    ...cachedControlSnapshotsRef.current,
    controlsChanged,
  };
}

/**
 * The operator preview is an opaque monitor surface. When the program output
 * is transparent, preview it composited over the same black backdrop the UI
 * already presents, then run the standard opaque SMAA graph. The external
 * output surface retains the requested transparent premultiplied-alpha path.
 */
export function resolveRenderSurfaceOutputControls(
  controls,
  renderProfile,
  { outputMode: surfaceOutputMode = null } = {},
) {
  const surfaceOwnsOutputMode = surfaceOutputMode != null;
  const resolvedControls = surfaceOwnsOutputMode
    ? { ...controls, outputMode: normalizeOutputMode(surfaceOutputMode) }
    : controls;
  const requestedOutputMode = normalizeOutputMode(resolvedControls?.outputMode);
  const isPreview =
    renderProfile?.renderContext !== RENDER_CONTEXTS.externalOutput;

  if (
    isPreview &&
    !surfaceOwnsOutputMode &&
    requestedOutputMode === OUTPUT_MODES.transparent
  ) {
    return {
      ...resolvedControls,
      outputMode: OUTPUT_MODES.opaque,
      outputBackgroundColor: "#000000",
    };
  }

  return resolvedControls;
}

const FEATURE_EPOCH_KEYS = [
  "sourceGeneration",
  "workerGeneration",
  "timelineRevision",
  "processingRevision",
  "topologyRevision",
];
function syncFeatureRuntimeDiagnostics(diagnostics, status) {
  if (!diagnostics?.engine) return;
  for (const key of [
    ...FEATURE_EPOCH_KEYS,
    "state",
    "reason",
    "phase",
    "queueDepth",
    "latestAcceptedFrameId",
    "latestObservationTimeSeconds",
    "latestObservationAgeMs",
    "latestObservationStale",
    "sourceBootstrapCount",
    "workerProcessingMs",
    "rejectedPacketCount",
    "staleAcknowledgementCount",
    "naturalRingdownActive",
    "renderAuthorityRevoked",
  ])
    diagnostics.engine[key] = status?.[key] ?? null;
}

/** Select the source owner's current immutable observation; never synthesize a hold or forcing frame. */
export function resolveFeatureFrame(
  { featureRuntime, runtimeDiagnostics = null },
  {
    createFeatureView = createRendererFeatureView,
    candidateFeatureModel = UNREAD_FEATURE_RESOLVER_INPUT,
    featureRuntimeStatus = UNREAD_FEATURE_RESOLVER_INPUT,
    onFrameSemanticSource = null,
  } = {},
) {
  const status =
    featureRuntimeStatus === UNREAD_FEATURE_RESOLVER_INPUT
      ? featureRuntime?.getStatus?.()
      : featureRuntimeStatus;
  const model =
    candidateFeatureModel === UNREAD_FEATURE_RESOLVER_INPUT
      ? readLatestFeatureModel(featureRuntime, runtimeDiagnostics)
      : candidateFeatureModel;
  let featureFrame = null,
    source = "feature-model-unavailable";
  if (status?.renderAuthorityRevoked === true || status?.revoked === true)
    source = "source-authority-revoked";
  else if (model) {
    if (
      FEATURE_EPOCH_KEYS.some(
        (key) =>
          Number.isSafeInteger(status?.[key]) &&
          model.observation?.[key] !== status[key],
      )
    )
      source = "stale-source-model-rejected";
    else {
      const startedAt = getRenderLoopWallTimeMs();
      try {
        const view = createFeatureView(model);
        if (hasRenderAuthority(view)) {
          featureFrame = view;
          source = "feature-model";
        } else source = "invalid-feature-model";
      } catch {
        source = "invalid-feature-model";
      }
      recordRuntimePerfSample(
        runtimeDiagnostics,
        "createRendererFeatureViewMs",
        getRenderLoopWallTimeMs() - startedAt,
      );
    }
  }
  syncFeatureRuntimeDiagnostics(runtimeDiagnostics, status);
  if (runtimeDiagnostics?.engine)
    runtimeDiagnostics.engine.rejectedModelReason =
      source === "feature-model" || source === "feature-model-unavailable"
        ? null
        : source;
  onFrameSemanticSource?.(source);
  recordFrameSemanticSource(runtimeDiagnostics, source);
  return { featureFrame, effectiveFrame: featureFrame };
}

const UNREAD_FEATURE_RESOLVER_INPUT = Symbol("unread-feature-resolver-input");

function readLatestFeatureModel(featureRuntime, runtimeDiagnostics) {
  const readStartedAt = getRenderLoopWallTimeMs();
  const featureModel = featureRuntime?.readLatestFeatureModel?.() ?? null;
  recordRuntimePerfSample(
    runtimeDiagnostics,
    "readFeatureModelMs",
    getRenderLoopWallTimeMs() - readStartedAt,
  );
  return featureModel;
}

function buildCandidateFeatureModelIdentity(model) {
  const observation = model?.observation;
  return [
    ...FEATURE_EPOCH_KEYS.map((key) => observation?.[key] ?? null),
    observation?.frameId ?? null,
    observation?.endSample ?? null,
    observation?.sourcePhase ?? null,
  ];
}
function buildFeatureResolverInvocationKey(_args, model, status) {
  return JSON.stringify([
    ...buildCandidateFeatureModelIdentity(model),
    ...FEATURE_EPOCH_KEYS.map((key) => status?.[key] ?? null),
    status?.renderAuthorityRevoked === true,
    status?.revoked === true,
  ]);
}
/**
 * Owns only a renderer validation/diagnostic cache. Source identity and acoustic
 * state belong to the session; no renderer revision is part of exported state.
 */
export function createFeatureFrameResolver() {
  let lastInvocationKey = null;
  let lastResult = null;
  let lastFrameSemanticSource = null;

  return {
    resolve(args, dependencies = {}) {
      const featureRuntimeStatus = args?.featureRuntime?.getStatus?.() ?? null;
      const candidateFeatureModel = readLatestFeatureModel(
        args?.featureRuntime,
        args?.runtimeDiagnostics,
      );
      const invocationKey = buildFeatureResolverInvocationKey(
        args,
        candidateFeatureModel,
        featureRuntimeStatus,
      );
      if (invocationKey === lastInvocationKey && lastResult) {
        if (featureRuntimeStatus) {
          syncFeatureRuntimeDiagnostics(
            args?.runtimeDiagnostics,
            featureRuntimeStatus,
          );
        }
        recordFrameSemanticSource(
          args?.runtimeDiagnostics,
          lastFrameSemanticSource,
        );
        return lastResult;
      }
      let frameSemanticSource = null;
      const result = resolveFeatureFrame(args, {
        ...dependencies,
        candidateFeatureModel,
        featureRuntimeStatus,
        onFrameSemanticSource(source) {
          frameSemanticSource = source;
          dependencies.onFrameSemanticSource?.(source);
        },
      });
      lastInvocationKey = invocationKey;
      lastFrameSemanticSource = frameSemanticSource;
      lastResult = result;
      return lastResult;
    },
  };
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
    externalOutputDiagnostics: window.__baryonExternalOutputDiagnostics ?? null,
    audioDiagnostics: {
      playbackSessionId: status.playbackSessionId,
      lastPlaybackEndReason: status.lastPlaybackEndReason,
      lastPlaybackDiagnostics: status.lastPlaybackDiagnostics,
      runtime: snapshotDiagnostics(runtimeDiagnostics),
    },
    sourceSession: status.sourceSession ?? null,
    ...runtimeState.debugSnapshot,
  };
}

function publishAuditSnapshot(
  {
    controls,
    runtime,
    runtimeState,
    status,
    suppressPlaybackTelemetryActive,
    runtimeDiagnostics,
  },
  {
    snapshotDiagnostics,
    logAudit,
    onAuditSnapshotChange = null,
    persistWindowSnapshot = true,
  },
) {
  if (!controls.auditEnabled || !runtimeState.debugSnapshot) {
    if (persistWindowSnapshot && typeof window !== "undefined") {
      delete window.__baryonAuditSnapshot;
    }
    onAuditSnapshotChange?.({
      enabled: false,
      snapshot: null,
    });
    return;
  }

  const payload = buildAuditSnapshotPayload({
    runtime,
    runtimeState,
    status,
    runtimeDiagnostics,
    snapshotDiagnostics,
  });
  if (persistWindowSnapshot && typeof window !== "undefined") {
    window.__baryonAuditSnapshot = payload;
  }
  onAuditSnapshotChange?.({
    enabled: true,
    snapshot: payload,
  });

  const frame = runtimeDiagnostics?.activeFrameCount ?? 0;
  const interval = Math.max(1, Math.floor(controls.logEveryFrames));
  if (!suppressPlaybackTelemetryActive && frame % interval === 0) {
    logAudit("[Baryon audit]", payload);
  }
}

/**
 * Wrap an audit-snapshot listener so repeated "audit disabled" notifications
 * collapse to the first one. `publishAuditSnapshot` runs every rendered frame
 * and reports the disabled state each time; consumers such as the desktop
 * output stage forward every notification over IPC, so without deduping this
 * produces a per-frame cross-process telemetry stream while audit is off.
 * Enabled-state notifications always pass through: each carries a fresh
 * snapshot payload.
 *
 * @param {((state: { enabled: boolean, snapshot: Record<string, unknown> | null }) => void) | null | undefined} onAuditSnapshotChange
 * @returns {((state: { enabled: boolean, snapshot: Record<string, unknown> | null }) => void) | null}
 */
export function createAuditSnapshotNotifier(onAuditSnapshotChange) {
  if (!onAuditSnapshotChange) {
    return null;
  }

  let lastNotifiedEnabled = null;
  return (nextAuditState) => {
    const enabled = nextAuditState?.enabled === true;
    if (!enabled && lastNotifiedEnabled === false) {
      return;
    }

    lastNotifiedEnabled = enabled;
    onAuditSnapshotChange(nextAuditState);
  };
}

function publishControlSnapshot(
  {
    runtime,
    suppressPlaybackTelemetryActive,
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
  if (suppressPlaybackTelemetryActive) {
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
    suppressPlaybackTelemetryActive,
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
    onAuditSnapshotChange = null,
  } = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  publishAuditSnapshot(
    {
      controls,
      runtime,
      runtimeState,
      status,
      suppressPlaybackTelemetryActive,
      runtimeDiagnostics,
    },
    {
      snapshotDiagnostics,
      logAudit: devtoolsEnabled ? logAudit : () => {},
      onAuditSnapshotChange,
      persistWindowSnapshot: devtoolsEnabled,
    },
  );
  if (!devtoolsEnabled) {
    return;
  }
  publishControlSnapshot(
    {
      runtime,
      suppressPlaybackTelemetryActive,
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
