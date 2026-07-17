import {
  applyBloomControls,
  applyEffectiveRaymarchStepBudget,
  applyOutputControls,
  applyRaymarchControls,
  applySharedControls,
  buildControlInspectionSnapshot,
} from "@baryon/engine/controls/runtime";
import { createRendererFeatureView } from "@baryon/engine/audio-features";
import {
  allowsModalDescriptorRenderAuthority,
  allowsCurrentLiveRenderFrame,
  hasRenderAuthority,
} from "@baryon/engine/core/renderAuthorityContract";
import { RAYMARCH_MODAL_BASIS_CACHE_CAPACITY } from "@baryon/engine/core/raymarch/fieldCache";
import * as raymarchFieldAnalysisModule from "@baryon/engine/core/raymarch/fieldAnalysis";
import { usesRaymarchVolumePipeline } from "@baryon/engine/visualization/types";
import { resolveTemporalReprojectionPolicy } from "@baryon/engine/render/temporalReprojectionPolicy";
import {
  DEFAULT_PERFORMANCE_TARGET_FPS,
  getRenderQualityProfileTargetFps,
  isAdaptivePerformanceProfile,
  normalizePerformanceTargetFps,
  normalizeOutputMode,
  OUTPUT_MODES,
  PERFORMANCE_PROFILES,
  RENDER_CONTEXTS,
  markRenderOutputVisualIdle,
} from "@baryon/engine/render/outputPipeline";
import {
  clearFrameCache,
  recordRuntimePerfSample,
  shouldReuseIdleFrame,
  snapshotModalFreshnessDiagnostics,
  snapshotRuntimePerfBreakdown,
  snapshotRuntimeDiagnostics,
  snapshotSourceEvidenceDiagnostics,
  snapshotWorkerPerfCounters,
} from "./baryonEngineRuntimeState.js";
import { readRenderFacingModalResponseEnergy } from "./modalResponseDiagnostics.js";
export { syncLiveInputRuntimeStatus } from "./liveInputRuntimeSync.js";

const LONG_FRAME_THRESHOLD_MS = 34;
const FRAME_DROP_THRESHOLD_16_7_MS = 16.7;
const FRAME_DROP_THRESHOLD_25_MS = 25;
const FRAME_DROP_THRESHOLD_33_3_MS = 33.3;
const FRAME_DROP_THRESHOLD_50_MS = 50;
const MAX_RECENT_LONG_FRAME_SAMPLES = 8;
const PERFORMANCE_HUD_PUBLISH_INTERVAL_MS = 150;
const PERFORMANCE_HUD_SMOOTHING_ALPHA = 0.25;
const ADAPTIVE_RAYMARCH_DECISION_WINDOW_SECONDS = 0.33;
const ADAPTIVE_RAYMARCH_MIN_DECISION_WINDOW_FRAMES = 8;
const ADAPTIVE_RAYMARCH_MAX_DECISION_WINDOW_FRAMES = 80;
const ADAPTIVE_RAYMARCH_RECOVERY_WINDOWS = 3;
const ADAPTIVE_RAYMARCH_STEP_DOWN_LONG_FRAME_RATIO = 0.1;
const ADAPTIVE_RAYMARCH_PRESSURE_SAFETY_MARGIN = 0.9;
const ADAPTIVE_RAYMARCH_PRESSURE_FRAME_TIME_RATIO = 1.03;
const ADAPTIVE_RAYMARCH_STABLE_FRAME_TIME_RATIO = 0.9;
const ADAPTIVE_RAYMARCH_LONG_FRAME_TIME_RATIO = 1.35;
const ADAPTIVE_RAYMARCH_RECOVERY_MIN_RENDER_ENERGY = 0.08;
const RAYMARCH_USER_TUNABLE_STEP_MIN = 16;
const COHERENT_MODAL_RAYMARCH_STEP_FLOOR = RAYMARCH_USER_TUNABLE_STEP_MIN;
const ADAPTIVE_RAYMARCH_STEP_LADDER = Object.freeze([
  16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192,
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

function buildStageEngineCounters(runtimeDiagnostics) {
  return {
    latestDriveAgeMs: runtimeDiagnostics?.engine?.latestDriveAgeMs ?? null,
    latestAcceptedFrameId:
      runtimeDiagnostics?.engine?.latestAcceptedFrameId ?? 0,
    sourceGeneration: runtimeDiagnostics?.engine?.sourceGeneration ?? 0,
    workerGeneration: runtimeDiagnostics?.engine?.workerGeneration ?? 0,
    topologyRevision: runtimeDiagnostics?.engine?.topologyRevision ?? 0,
    processedFrameCount: runtimeDiagnostics?.engine?.processedFrameCount ?? 0,
    topologyPublishCount: runtimeDiagnostics?.engine?.topologyPublishCount ?? 0,
    drivePublishCount: runtimeDiagnostics?.engine?.drivePublishCount ?? 0,
    inputReplacementCount:
      runtimeDiagnostics?.engine?.inputReplacementCount ?? 0,
    rejectedPacketCount: runtimeDiagnostics?.engine?.rejectedPacketCount ?? 0,
    staleAcknowledgementCount:
      runtimeDiagnostics?.engine?.staleAcknowledgementCount ?? 0,
    renderAuthorityRevoked:
      runtimeDiagnostics?.engine?.renderAuthorityRevoked ?? false,
    queueDepth: runtimeDiagnostics?.engine?.queueDepth ?? 0,
    state: runtimeDiagnostics?.engine?.state ?? "none",
    reason: runtimeDiagnostics?.engine?.reason ?? null,
    ...snapshotWorkerPerfCounters(runtimeDiagnostics?.engine),
  };
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

function isCopyableSlotArray(values) {
  return values instanceof Float32Array || Array.isArray(values);
}

function copyNumericSlotsInto(values, reusableTarget) {
  const target =
    reusableTarget instanceof Float32Array &&
    reusableTarget.length === values.length
      ? reusableTarget
      : new Float32Array(values.length);
  if (values instanceof Float32Array) {
    target.set(values);
    return target;
  }

  for (let index = 0; index < values.length; index += 1) {
    target[index] = readFiniteNumber(values[index]);
  }
  return target;
}

function measureSlotTurnover(previousSlots, nextSlots, epsilon = 1e-4) {
  if (!isCopyableSlotArray(nextSlots)) {
    return {
      nextCopy: null,
      meanAbsDelta: 0,
      changeCount: 0,
    };
  }
  if (!previousSlots) {
    return {
      nextCopy: copyNumericSlotsInto(nextSlots, null),
      meanAbsDelta: 0,
      changeCount: 0,
    };
  }

  const previousLength = previousSlots.length;
  const nextLength = nextSlots.length;
  const comparedLength = Math.max(previousLength, nextLength);
  if (comparedLength === 0) {
    return {
      nextCopy: copyNumericSlotsInto(nextSlots, previousSlots),
      meanAbsDelta: 0,
      changeCount: 0,
    };
  }

  let totalAbsDelta = 0;
  let changeCount = 0;
  for (let index = 0; index < comparedLength; index += 1) {
    const previousValue =
      index < previousLength ? readFiniteNumber(previousSlots[index]) : 0;
    // fround mirrors the Float32Array coercion the stored copy will apply.
    const nextValue =
      index < nextLength ? Math.fround(readFiniteNumber(nextSlots[index])) : 0;
    const delta = Math.abs(nextValue - previousValue);
    totalAbsDelta += delta;
    if (delta > epsilon) {
      changeCount += 1;
    }
  }

  return {
    nextCopy: copyNumericSlotsInto(nextSlots, previousSlots),
    meanAbsDelta: totalAbsDelta / comparedLength,
    changeCount,
  };
}

function applySlotTurnoverDiagnostics(
  modalFreshness,
  { fieldPrefix, previousField, nextSlots },
) {
  const turnover = measureSlotTurnover(
    modalFreshness[previousField],
    nextSlots,
  );
  modalFreshness[`${fieldPrefix}MeanAbsDelta`] = turnover.meanAbsDelta;
  modalFreshness[`${fieldPrefix}ChangeCount`] = turnover.changeCount;
  modalFreshness[previousField] = turnover.nextCopy;
}

export function updateModalFreshnessDiagnostics(
  runtimeDiagnostics,
  featureFrame,
  { getWallTimeMs = getRenderLoopWallTimeMs } = {},
) {
  const modalFreshness = runtimeDiagnostics?.modalFreshness;
  if (!modalFreshness || !featureFrame) {
    return;
  }

  const renderSubmittedAtMs = readFiniteNumber(getWallTimeMs());
  const frameTimeMs = readFiniteNumber(featureFrame.frameTimeMs);
  modalFreshness.frameTimeMs = frameTimeMs;
  modalFreshness.sourceMode = featureFrame.sourceMode ?? null;
  modalFreshness.sourceEvidence = snapshotSourceEvidenceDiagnostics(
    featureFrame.sourceEvidence,
  );
  modalFreshness.fieldState =
    featureFrame.debug?.fieldState ?? featureFrame.fieldState ?? "idle";
  modalFreshness.structuralSnapshotAgeMs = readFiniteNumber(
    runtimeDiagnostics?.engine?.latestDriveAgeMs,
  );
  modalFreshness.featureFrameAgeAtRenderMs = Math.max(
    0,
    renderSubmittedAtMs - frameTimeMs,
  );
  modalFreshness.renderSubmittedAtMs = renderSubmittedAtMs;
  modalFreshness.lastUpdatedAtWallTimeMs = renderSubmittedAtMs;
  modalFreshness.avgAmplitude = readFiniteNumber(
    featureFrame.debug?.avgAmplitude ?? featureFrame.averageAmplitude,
  );
  modalFreshness.analyserRms = readFiniteNumber(
    featureFrame.debug?.analyserRms,
  );
  modalFreshness.periodicity = readFiniteNumber(
    featureFrame.debug?.periodicity,
  );
  modalFreshness.liveInputNoiseGateActive = Boolean(
    featureFrame.debug?.liveInputNoiseGateActive,
  );
  modalFreshness.liveInputHardSilenceActive = Boolean(
    featureFrame.debug?.liveInputHardSilenceActive,
  );
  modalFreshness.structureSignal = readFiniteNumber(
    featureFrame.structureSignal,
  );
  modalFreshness.energySignal = readFiniteNumber(featureFrame.energySignal);
  modalFreshness.changeSignal = readFiniteNumber(featureFrame.changeSignal);
  modalFreshness.pulseSignal = readFiniteNumber(featureFrame.pulseSignal);
  modalFreshness.modalVisibilityEnergy = readFiniteNumber(
    featureFrame.modalVisibilityEnergy,
  );
  modalFreshness.modalObserverVisibilityEnergy = readFiniteNumber(
    featureFrame.modalObserverVisibilityEnergy,
  );
  modalFreshness.modalVisibilityRetainedHighQEnergy = readFiniteNumber(
    featureFrame.modalVisibilityRetainedHighQEnergy,
  );
  modalFreshness.observationEnergy = readFiniteNumber(
    featureFrame.observationEnergy,
  );
  modalFreshness.modalResponseEnergy =
    readRenderFacingModalResponseEnergy(featureFrame);
  modalFreshness.modalResponseBudgetScale = readFiniteNumber(
    featureFrame.modalResponseBudgetScale ??
      featureFrame.debug?.modalResponseBudgetScale,
  );
  modalFreshness.modalResponseRawEnergy = readFiniteNumber(
    featureFrame.modalResponseRawEnergy ??
      featureFrame.debug?.modalResponseRawEnergy,
  );
  modalFreshness.modalResponseAverageDampingEnvelope = readFiniteNumber(
    featureFrame.modalResponseAverageDampingEnvelope ??
      featureFrame.debug?.modalResponseAverageDampingEnvelope,
  );
  modalFreshness.modalResponseAverageCouplingStrength = readFiniteNumber(
    featureFrame.modalResponseAverageCouplingStrength ??
      featureFrame.debug?.modalResponseAverageCouplingStrength,
  );
  modalFreshness.modalResponseAveragePhaseConfidence = readFiniteNumber(
    featureFrame.modalResponseAveragePhaseConfidence ??
      featureFrame.debug?.modalResponseAveragePhaseConfidence,
  );
  modalFreshness.modalResponseAveragePersistence = readFiniteNumber(
    featureFrame.modalResponseAveragePersistence ??
      featureFrame.debug?.modalResponseAveragePersistence,
  );
  modalFreshness.modalPhaseAuthority = readFiniteNumber(
    featureFrame.modalPhaseAuthority,
  );
  modalFreshness.highQPhaseAuthority = readFiniteNumber(
    featureFrame.debug?.highQPhaseAuthority ?? featureFrame.highQPhaseAuthority,
  );
  modalFreshness.lowQPhaseAuthority = readFiniteNumber(
    featureFrame.debug?.lowQPhaseAuthority ?? featureFrame.lowQPhaseAuthority,
  );
  modalFreshness.modalPhaseCoherentFieldModeCount = readFiniteNumber(
    featureFrame.debug?.modalPhaseCoherentFieldModeCount ??
      featureFrame.modalPhaseCoherentFieldModeCount,
  );
  modalFreshness.modeCoherence = readFiniteNumber(featureFrame.modeCoherence);
  const renderFacingModeCount = readRaymarchFrameModeCount(featureFrame);
  modalFreshness.activeModeCount = renderFacingModeCount;
  modalFreshness.activeModalFieldModeCount = renderFacingModeCount;
  applySlotTurnoverDiagnostics(modalFreshness, {
    fieldPrefix: "modalFieldSlot",
    previousField: "_previousModalFieldSlots",
    nextSlots: featureFrame.modalFieldSlots,
  });
  modalFreshness.resonantSignalAuthoritative = Boolean(
    featureFrame.debug?.resonantSignalAuthoritative,
  );
  modalFreshness.resonantSignalAuthoritativeReason =
    featureFrame.debug?.resonantSignalAuthoritativeReason ?? "none";
  modalFreshness.resonantSignalAuthoritativeCoverage = Boolean(
    featureFrame.debug?.resonantSignalAuthoritativeCoverage,
  );
  modalFreshness.resonantSignalAuthoritativeFreshSignal = Boolean(
    featureFrame.debug?.resonantSignalAuthoritativeFreshSignal,
  );
  modalFreshness.resonantSignalAuthoritativeFastAssist = Boolean(
    featureFrame.debug?.resonantSignalAuthoritativeFastAssist,
  );
  modalFreshness.resonantSignalAuthoritativeHighQ = Boolean(
    featureFrame.debug?.resonantSignalAuthoritativeHighQ,
  );
  modalFreshness.resonantShiftReleaseOverrideCount = readFiniteNumber(
    featureFrame.debug?.resonantShiftReleaseOverrideCount,
  );
  modalFreshness.resonantShiftTrackingOverrideCount = readFiniteNumber(
    featureFrame.debug?.resonantShiftTrackingOverrideCount,
  );
  modalFreshness.observedResonanceModeCount = readFiniteNumber(
    featureFrame.debug?.highQResonantModeCount,
  );
  modalFreshness.observedResonanceEnergy = readFiniteNumber(
    featureFrame.debug?.highQResonantEnergy,
  );
  modalFreshness.highQRingSupport = readFiniteNumber(
    featureFrame.debug?.highQRingSupport,
  );
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
    case "file-playback-activation-hold":
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

function isCanonicalStaticIdleFrame(featureFrame) {
  return Boolean(
    featureFrame &&
    featureFrame.fieldState === "idle" &&
    featureFrame.renderAuthority === false &&
    featureFrame.sourceEvidence?.currentSourceEvidence !== true &&
    featureFrame.sourceEvidence?.sourceBoundaryState !== "live",
  );
}

function cloneFrameValue(value, seen = new WeakMap()) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (ArrayBuffer.isView(value)) {
    const cloned =
      value instanceof DataView
        ? new DataView(
            value.buffer.slice(
              value.byteOffset,
              value.byteOffset + value.byteLength,
            ),
          )
        : Reflect.construct(value.constructor, [value]);
    seen.set(value, cloned);
    return cloned;
  }

  if (Array.isArray(value)) {
    const cloned = [];
    seen.set(value, cloned);
    for (const entry of value) {
      cloned.push(cloneFrameValue(entry, seen));
    }
    return cloned;
  }

  const cloned = {};
  seen.set(value, cloned);
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = cloneFrameValue(entry, seen);
  }
  return cloned;
}

function closePausedFileSourceEvidence(sourceEvidence) {
  return {
    ...(sourceEvidence ?? {}),
    sourceBoundaryState: "muted",
    currentSourceEvidence: false,
    sourceEnergy: 0,
    transport: {
      ...(sourceEvidence?.transport ?? {}),
      playing: false,
      fileMuted: true,
    },
  };
}

function closePausedFileEnergyLedger(energyLedger) {
  return {
    ...(energyLedger ?? {}),
    sourceBoundaryState: "muted",
    sourceEnergy: 0,
  };
}

function createPausedFileHoldFrame(featureFrame) {
  const frame = cloneFrameValue(featureFrame);
  frame.audioMotionAuthority = false;
  frame.sourceEvidence = closePausedFileSourceEvidence(frame.sourceEvidence);
  frame.energyLedger = closePausedFileEnergyLedger(frame.energyLedger);
  frame.modalResponseCurrentRenderSourceEvidence = false;
  frame.debug = {
    ...(frame.debug ?? {}),
    pausedFileHold: true,
    sourceBoundaryState: "muted",
    currentSourceEvidence: false,
  };
  return frame;
}

function getPlaybackSessionId(status) {
  return status?.playbackSessionId ?? null;
}

const TERMINAL_PLAYBACK_END_REASONS = new Set([
  "natural",
  "premature",
  "interrupted",
  "stopped",
]);

function hasCurrentPlaybackSessionEnded(status) {
  const playbackSessionId = getPlaybackSessionId(status);
  if (playbackSessionId == null) {
    return false;
  }

  return (
    TERMINAL_PLAYBACK_END_REASONS.has(status?.lastPlaybackEndReason) &&
    status?.lastPlaybackDiagnostics?.playbackSessionId === playbackSessionId
  );
}

function isActiveFilePlayback(status) {
  return (
    status?.isPlaying === true &&
    status?.isLiveInputActive !== true &&
    getPlaybackSessionId(status) != null
  );
}

function readPausedFileHoldFrame({ frameCacheRefs, status, clockMode }) {
  if (
    clockMode !== "paused-playback" ||
    status?.isPlaying === true ||
    status?.isLiveInputActive === true ||
    hasCurrentPlaybackSessionEnded(status)
  ) {
    return null;
  }

  const playbackSessionId = getPlaybackSessionId(status);
  if (playbackSessionId == null) {
    return null;
  }

  const heldFrame = frameCacheRefs.pausedFileFrameRef?.current;
  return heldFrame?.playbackSessionId === playbackSessionId
    ? (heldFrame.frame ?? null)
    : null;
}

function clearPausedFileHoldFrame(frameCacheRefs) {
  if (frameCacheRefs.pausedFileFrameRef) {
    frameCacheRefs.pausedFileFrameRef.current = null;
  }
}

function refreshPausedFileHoldFrame({ frameCacheRefs, status, featureFrame }) {
  const playbackSessionId = getPlaybackSessionId(status);
  if (!frameCacheRefs.pausedFileFrameRef || playbackSessionId == null) {
    return;
  }

  const heldFrame = frameCacheRefs.pausedFileFrameRef.current;
  if (heldFrame?.playbackSessionId !== playbackSessionId) {
    frameCacheRefs.pausedFileFrameRef.current = null;
  }

  if (allowsCurrentLiveRenderFrame(featureFrame)) {
    frameCacheRefs.pausedFileFrameRef.current = {
      playbackSessionId,
      frame: createPausedFileHoldFrame(featureFrame),
    };
  }
}

function resetInterruptedLiveInputVisualResponse(runtimeState) {
  if (!runtimeState) {
    return;
  }

  runtimeState.responseEnvelope = 0;
  runtimeState.accentEnvelope = 0;
  runtimeState.motionSignal = 0;
  runtimeState.scaleSignal = 0;
  runtimeState.bloomResponseSignal = 0;
  runtimeState.beatPulseEnvelope = 0;
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

function readRaymarchFrameModeCount(featureFrame) {
  if (!allowsModalDescriptorRenderAuthority(featureFrame)) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      readFiniteNumber(
        featureFrame?.modalDescriptor?.counts?.modalFieldModeCount ??
          featureFrame?.activeModalFieldModeCount ??
          featureFrame?.activeModeCount,
      ),
    ),
  );
}

/**
 * Decide whether to flush TRAA temporal history (show the crisp scene color)
 * for this raymarch-pipeline frame. Delegates to engine temporal
 * reprojection policy so app-shell does not own field-drive semantics.
 *
 * @param {{ runtimeMethod?: unknown, featureFrame?: any, sceneSnapshot?: any }} params
 * @returns {boolean}
 */
export function shouldBypassTemporalHistoryForRaymarchFrame({
  runtimeMethod,
  featureFrame,
  sceneSnapshot,
}) {
  return resolveTemporalReprojectionPolicy({
    visualizationMethod: runtimeMethod,
    featureFrame,
    sceneSnapshot,
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

export function updateRendererDiagnostics(
  { state, controls, status, time, deltaTime, rfDelta, gl, renderLoopRefs },
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

  const lowLoadPlaybackDiagnosticsActive = Boolean(
    controls.lowLoadPlaybackDiagnostics && sourceStatus.isPlaying,
  );
  const targetPixelRatio = syncRenderSurfacePixelRatio({
    gl,
    renderLoopRefs,
    runtimeDiagnostics,
    basePixelRatio: getRequestedPixelRatio(),
  });
  const frameTimeMs =
    typeof rfDelta === "number" && rfDelta > 0 && Number.isFinite(rfDelta)
      ? rfDelta * 1000
      : typeof deltaTime === "number" &&
          deltaTime > 0 &&
          Number.isFinite(deltaTime)
        ? deltaTime * 1000
        : null;
  if (frameTimeMs !== null) {
    runtimeDiagnostics.lastFrameTimeMs = frameTimeMs;
    runtimeDiagnostics.smoothedFrameTimeMs =
      runtimeDiagnostics.smoothedFrameTimeMs > 0
        ? runtimeDiagnostics.smoothedFrameTimeMs +
          (frameTimeMs - runtimeDiagnostics.smoothedFrameTimeMs) *
            PERFORMANCE_HUD_SMOOTHING_ALPHA
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
  }
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

  if (sourceStatus.isPlaying && frameTimeMs !== null) {
    runtimeDiagnostics.activeFrameCount += 1;
    runtimeDiagnostics.averageFrameTimeMs +=
      (frameTimeMs - runtimeDiagnostics.averageFrameTimeMs) /
      runtimeDiagnostics.activeFrameCount;
  }

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
    lowLoadPlaybackDiagnosticsActive,
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
    };
  }

  const startupRaymarchSteps = Number.isFinite(
    renderProfile?.startupRaymarchSteps,
  )
    ? renderProfile.startupRaymarchSteps
    : 32;
  return {
    startRung: findAdaptiveLadderRungForValue(stepLadder, startupRaymarchSteps),
  };
}

function resolveAdaptiveCurrentRung({
  currentRung,
  resumeRung = null,
  ladder,
  reactivating = false,
}) {
  if (reactivating && Number.isFinite(resumeRung)) {
    return clampAdaptiveLadderRung(resumeRung, ladder);
  }
  if (Number.isFinite(currentRung)) {
    return clampAdaptiveLadderRung(currentRung, ladder);
  }
  if (Number.isFinite(resumeRung)) {
    return clampAdaptiveLadderRung(resumeRung, ladder);
  }
  return getAdaptiveLadderMaxRung(ladder);
}

function resetAdaptiveRaymarchState(
  adaptiveRaymarch,
  requestedStepBudget,
  { preserveHistory = false, startRung = null } = {},
) {
  const ladder = buildAdaptiveRaymarchLadder(requestedStepBudget);
  adaptiveRaymarch.requestedRaymarchSteps = requestedStepBudget;
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

function deriveAdaptiveRecoveryState({
  controls,
  effectiveFrame,
  status,
  adaptiveRaymarch,
}) {
  const playbackSessionId = status?.playbackSessionId ?? null;
  const sessionTransition =
    playbackSessionId != null &&
    adaptiveRaymarch?.lastPlaybackSessionId != null &&
    adaptiveRaymarch.lastPlaybackSessionId !== playbackSessionId;

  let recoveryBlockedReason = "none";
  if (!controls?.injectTestTone) {
    const currentSourceEvidence =
      effectiveFrame?.sourceEvidence?.currentSourceEvidence === true;
    const sourceBoundaryState =
      effectiveFrame?.sourceEvidence?.sourceBoundaryState ?? "absent";
    const projectedRenderEnergy =
      effectiveFrame?.energyLedger?.projectedRenderEnergy ?? 0;

    if (sessionTransition) {
      recoveryBlockedReason = "session-transition";
    } else if (!currentSourceEvidence || sourceBoundaryState !== "live") {
      recoveryBlockedReason = "closed-source";
    } else if (!hasRenderAuthority(effectiveFrame)) {
      recoveryBlockedReason = "render-not-authorized";
    } else if (
      !(projectedRenderEnergy >= ADAPTIVE_RAYMARCH_RECOVERY_MIN_RENDER_ENERGY)
    ) {
      recoveryBlockedReason = "low-render-energy";
    }
  }

  return {
    recoveryEligible: recoveryBlockedReason === "none",
    recoveryBlockedReason,
    playbackSessionId,
    sessionTransition,
  };
}

function deriveCoherentModalRaymarchStepFloor({
  activeRaymarchFrame,
  requestedStepBudget,
}) {
  if (!activeRaymarchFrame) {
    return RAYMARCH_USER_TUNABLE_STEP_MIN;
  }

  return Math.min(requestedStepBudget, COHERENT_MODAL_RAYMARCH_STEP_FLOOR);
}

function resolveAdaptiveStepBudgetAtRung({
  activeRaymarchFrame,
  requestedStepBudget,
  ladder,
  rung,
}) {
  const coherentModalStepFloor = deriveCoherentModalRaymarchStepFloor({
    activeRaymarchFrame,
    requestedStepBudget,
  });
  return Math.max(
    coherentModalStepFloor,
    ladder[clampAdaptiveLadderRung(rung, ladder)],
  );
}

function resolveProductBasisAtlasPageCapacity(runtimeState) {
  return Math.max(
    1,
    Math.round(
      runtimeState?.modalBasisCache?.basisCapacity ??
        RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
    ),
  );
}

export function resolveRaymarchFieldAnalysisFrameInputs(
  runtimeState,
  effectiveFrame,
) {
  const modalFieldCapacity =
    raymarchFieldAnalysisModule.inferModalFieldCapacity(
      runtimeState?.modalFieldCapacity,
      runtimeState?.modalFieldModeBuffer?.value?.array,
    );
  const productUploadCapacity = Math.min(
    modalFieldCapacity,
    resolveProductBasisAtlasPageCapacity(runtimeState),
  );
  const uploadedModeCount = allowsModalDescriptorRenderAuthority(effectiveFrame)
    ? Math.max(
        0,
        Math.round(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
      )
    : 0;
  const descriptorModeCount = readRaymarchFrameModeCount(effectiveFrame);
  const activeModeCount =
    uploadedModeCount > 0 ? uploadedModeCount : descriptorModeCount;

  return {
    modalFieldCapacity: productUploadCapacity,
    productUploadCapacity,
    activeModeCount,
    uploadedModeCount,
  };
}

export function syncUploadedRenderQuantities(runtimeDiagnostics, runtimeState) {
  if (!runtimeDiagnostics || !runtimeState) {
    return;
  }

  const uploadedModeCount = Math.max(
    0,
    Math.round(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  const totalSlotAmplitude = readFiniteNumber(
    runtimeState?.uniforms?.uTotalSlotAmplitude?.value,
  );
  const structuralProjectionDrive = readFiniteNumber(
    runtimeState?.uniforms?.uStructuralProjectionDrive?.value,
  );
  const structuralProjectionConcentration = readFiniteNumber(
    runtimeState?.uniforms?.uStructuralProjectionConcentration?.value,
  );
  const render = runtimeDiagnostics.render ?? (runtimeDiagnostics.render = {});
  render.activeModeCount = uploadedModeCount;
  render.uploadedModeCount = uploadedModeCount;
  render.totalSlotAmplitude = totalSlotAmplitude;
  render.structuralProjectionDrive = structuralProjectionDrive;
  render.structuralProjectionConcentration = structuralProjectionConcentration;

  const modalFreshness = runtimeDiagnostics.modalFreshness;
  if (modalFreshness) {
    modalFreshness.uploadedModeCount = uploadedModeCount;
    modalFreshness.totalSlotAmplitude = totalSlotAmplitude;
    modalFreshness.structuralProjectionDrive = structuralProjectionDrive;
    modalFreshness.structuralProjectionConcentration =
      structuralProjectionConcentration;
  }
}

export function updateAdaptiveRaymarchStepBudget({
  controls,
  runtime,
  runtimeState,
  renderProfile,
  effectiveFrame,
  status,
  runtimeDiagnostics,
}) {
  if (!runtimeState || !runtimeDiagnostics) {
    return 0;
  }

  const requestedStepBudget = normalizeRequestedRaymarchSteps(
    runtimeState,
    controls,
  );
  const { productUploadCapacity, uploadedModeCount } =
    resolveRaymarchFieldAnalysisFrameInputs(runtimeState, effectiveFrame);
  const frameModeCount = readRaymarchFrameModeCount(effectiveFrame);
  const cavityGeometry =
    runtimeState?.effectiveCavityGeometry ??
    runtimeState?.volumeMesh?.userData?.raymarchCavityGeometry ??
    "rectangular";
  const modalFieldAnalysisSlots =
    effectiveFrame?.modalDescriptor?.slotViews?.modalFieldSlots ??
    effectiveFrame?.modalFieldSlots;
  const activeRaymarchFrame = Boolean(
    usesRaymarchVolumePipeline(runtime?.method) &&
    allowsCurrentLiveRenderFrame(effectiveFrame) &&
    Math.max(frameModeCount, uploadedModeCount) > 0,
  );
  const profileAllowsAdaptiveRaymarch = isAdaptivePerformanceProfile(
    renderProfile?.qualityPreset,
  );
  const adaptiveRaymarch = runtimeDiagnostics.adaptiveRaymarch;
  const adaptiveQualityActive =
    profileAllowsAdaptiveRaymarch && activeRaymarchFrame;
  // The observation integrator owns adaptive quality only through the raymarch
  // step budget. Render scale/DPR remain the user-selected output resolution.
  const raymarchFieldAnalysis =
    raymarchFieldAnalysisModule.buildRaymarchFieldAnalysis({
      modalFieldSlots: modalFieldAnalysisSlots,
      modalFieldCapacity: productUploadCapacity,
      featureFrame: effectiveFrame,
      cavityGeometry,
    });
  runtimeState.raymarchFieldAnalysis = raymarchFieldAnalysis;
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
  const requestedChanged =
    adaptiveRaymarch.requestedRaymarchSteps !== requestedStepBudget;
  if (requestedChanged) {
    ({ ladder } = resetAdaptiveRaymarchState(
      adaptiveRaymarch,
      requestedStepBudget,
      {
        startRung: Number.isFinite(runtimeState.adaptiveRaymarchResumeRung)
          ? runtimeState.adaptiveRaymarchResumeRung
          : adaptiveStartInputs.startRung,
      },
    ));
  }

  if (!adaptiveQualityActive) {
    const inactiveStepRung = profileAllowsAdaptiveRaymarch
      ? resolveAdaptiveCurrentRung({
          currentRung: adaptiveRaymarch.currentRung,
          ladder,
        })
      : getAdaptiveLadderMaxRung(ladder);
    const inactiveStepBudget = resolveAdaptiveStepBudgetAtRung({
      activeRaymarchFrame,
      requestedStepBudget,
      ladder,
      rung: inactiveStepRung,
    });
    runtimeState.adaptiveRaymarchResumeRung = inactiveStepRung;
    adaptiveRaymarch.adaptiveRaymarchActive = false;
    adaptiveRaymarch.requestedRaymarchSteps = requestedStepBudget;
    adaptiveRaymarch.currentRung = inactiveStepRung;
    adaptiveRaymarch.effectiveRaymarchSteps = inactiveStepBudget;
    applyEffectiveRaymarchStepBudget(
      runtimeState,
      controls,
      inactiveStepBudget,
    );
    // Non-adaptive profiles hold the user cap; adaptive profiles hold their
    // committed step rung across transient inactive frames.
    return inactiveStepBudget;
  }

  const wasAdaptiveActive = adaptiveRaymarch.adaptiveRaymarchActive === true;
  adaptiveRaymarch.adaptiveRaymarchActive = true;
  adaptiveRaymarch.currentRung = resolveAdaptiveCurrentRung({
    currentRung: adaptiveRaymarch.currentRung,
    resumeRung: runtimeState.adaptiveRaymarchResumeRung,
    ladder,
    reactivating: !wasAdaptiveActive,
  });
  const recoveryState = deriveAdaptiveRecoveryState({
    controls,
    effectiveFrame,
    status,
    adaptiveRaymarch,
  });
  adaptiveRaymarch.recoveryEligible = recoveryState.recoveryEligible;
  adaptiveRaymarch.recoveryBlockedReason = recoveryState.recoveryBlockedReason;
  adaptiveRaymarch.lastPlaybackSessionId = recoveryState.playbackSessionId;
  if (recoveryState.sessionTransition) {
    adaptiveRaymarch.stableWindowCount = 0;
  }

  adaptiveRaymarch.decisionFrameCount += 1;
  if (
    (runtimeDiagnostics.lastFrameTimeMs ?? 0) >
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
      const smoothedFrameTimeMs = runtimeDiagnostics.smoothedFrameTimeMs ?? 0;
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
    activeRaymarchFrame,
    requestedStepBudget,
    ladder,
    rung: adaptiveRaymarch.currentRung,
  });
  adaptiveRaymarch.effectiveRaymarchSteps = effectiveStepBudget;
  adaptiveRaymarch.complexityScore = raymarchFieldAnalysis.complexityScore;
  adaptiveRaymarch.uploadedModeCount = raymarchFieldAnalysis.uploadedModeCount;
  adaptiveRaymarch.originalModeCount = raymarchFieldAnalysis.originalModeCount;
  runtimeState.adaptiveRaymarchResumeRung = adaptiveRaymarch.currentRung;
  applyEffectiveRaymarchStepBudget(runtimeState, controls, effectiveStepBudget);
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
  const hasBloomPass = Boolean(postNodesRef.current?.bloomPass);
  const controlsChanged =
    appliedControlVersionRef.current !== controlVersionRef.current ||
    cachedControlSnapshotsRef.current.hasBloomPass !== hasBloomPass;

  if (controlsChanged) {
    const outputControls = resolveRenderSurfaceOutputControls(
      controls,
      renderProfileRef.current,
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
      audit: {
        enabled: controls.auditEnabled === true,
        freezeModeSlots: controls.freezeModeSlots === true,
        forceWebGLFallbackTest: controls.forceWebGLFallbackTest === true,
        lowLoadPlaybackDiagnostics:
          controls.lowLoadPlaybackDiagnostics === true,
        injectTestTone: controls.injectTestTone === true,
        testToneHz: controls.testToneHz,
        testToneSignal: controls.testToneSignal,
        testToneAmplitude: controls.testToneAmplitude,
        logEveryFrames: controls.logEveryFrames,
      },
      hasBloomPass,
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
export function resolveRenderSurfaceOutputControls(controls, renderProfile) {
  const requestedOutputMode = normalizeOutputMode(controls?.outputMode);
  const isPreview =
    renderProfile?.renderContext !== RENDER_CONTEXTS.externalOutput;

  if (isPreview && requestedOutputMode === OUTPUT_MODES.transparent) {
    return {
      ...controls,
      outputMode: OUTPUT_MODES.opaque,
      outputBackgroundColor: "#000000",
    };
  }

  return controls;
}

function syncFeatureRuntimeDiagnostics(runtimeDiagnostics, runtimeStatus) {
  if (!runtimeDiagnostics?.engine) {
    return;
  }

  Object.assign(runtimeDiagnostics.engine, {
    latestDriveAgeMs: runtimeStatus?.latestDriveAgeMs ?? null,
    latestAcceptedFrameId: runtimeStatus?.latestAcceptedFrameId ?? 0,
    sourceGeneration: runtimeStatus?.sourceGeneration ?? 0,
    workerGeneration: runtimeStatus?.workerGeneration ?? 0,
    topologyRevision: runtimeStatus?.topologyRevision ?? 0,
    processedFrameCount: runtimeStatus?.processedFrameCount ?? 0,
    topologyPublishCount: runtimeStatus?.topologyPublishCount ?? 0,
    drivePublishCount: runtimeStatus?.drivePublishCount ?? 0,
    inputReplacementCount: runtimeStatus?.inputReplacementCount ?? 0,
    rejectedPacketCount: runtimeStatus?.rejectedPacketCount ?? 0,
    staleAcknowledgementCount: runtimeStatus?.staleAcknowledgementCount ?? 0,
    renderAuthorityRevoked: runtimeStatus?.renderAuthorityRevoked === true,
    ...snapshotWorkerPerfCounters(runtimeStatus),
    queueDepth: runtimeStatus?.queueDepth ?? 0,
    state: runtimeStatus?.state ?? "none",
    reason: runtimeStatus?.reason ?? null,
  });
}

export function resolveFeatureFrame(
  {
    featureRuntime,
    runtimeDiagnostics = null,
    runtimeState,
    controls,
    status,
    clockMode,
    renderLoopRefs,
  },
  { createFeatureView = createRendererFeatureView } = {},
) {
  const { lastIdleFrameRef } = renderLoopRefs.frameCacheRefs;
  const pausedFileHoldFrame = readPausedFileHoldFrame({
    frameCacheRefs: renderLoopRefs.frameCacheRefs,
    status,
    clockMode,
  });
  let featureRuntimeStatus = isActiveFilePlayback(status)
    ? (featureRuntime?.getStatus?.() ?? null)
    : null;
  const filePlaybackActivationHold = Boolean(
    !pausedFileHoldFrame &&
    featureRuntimeStatus?.playbackAnalysisPending === true &&
    isCanonicalStaticIdleFrame(lastIdleFrameRef.current),
  );
  const shouldReuseStaticIdleFrame =
    !pausedFileHoldFrame &&
    (shouldReuseIdleFrame(status, controls) || filePlaybackActivationHold) &&
    isCanonicalStaticIdleFrame(lastIdleFrameRef.current);

  let featureFrame = null;
  let frameSemanticSource = null;

  if (pausedFileHoldFrame) {
    featureFrame = pausedFileHoldFrame;
    frameSemanticSource = "paused-file-hold";
  } else if (shouldReuseStaticIdleFrame) {
    featureFrame = lastIdleFrameRef.current;
    frameSemanticSource = filePlaybackActivationHold
      ? "file-playback-activation-hold"
      : "static-idle-cache";
  } else {
    const readStartedAt = getRenderLoopWallTimeMs();
    const featureModel = featureRuntime?.readLatestFeatureModel?.() ?? null;
    recordRuntimePerfSample(
      runtimeDiagnostics,
      "readFeatureModelMs",
      getRenderLoopWallTimeMs() - readStartedAt,
    );

    featureRuntimeStatus = featureRuntime?.getStatus?.() ?? null;

    if (featureModel) {
      const viewStartedAt = getRenderLoopWallTimeMs();
      featureFrame = createFeatureView(featureModel);
      recordRuntimePerfSample(
        runtimeDiagnostics,
        "createRendererFeatureViewMs",
        getRenderLoopWallTimeMs() - viewStartedAt,
      );
    }
    frameSemanticSource = featureFrame
      ? "feature-model"
      : "feature-model-unavailable";

    if (shouldReuseIdleFrame(status, controls)) {
      if (featureFrame && !isCanonicalStaticIdleFrame(featureFrame)) {
        featureFrame = null;
        frameSemanticSource = "stale-source-model-rejected";
      }
      lastIdleFrameRef.current = isCanonicalStaticIdleFrame(featureFrame)
        ? featureFrame
        : null;
    } else {
      lastIdleFrameRef.current = null;
    }
  }

  if (featureRuntimeStatus) {
    syncFeatureRuntimeDiagnostics(runtimeDiagnostics, featureRuntimeStatus);
  }

  recordFrameSemanticSource(runtimeDiagnostics, frameSemanticSource);

  if (status?.isPlaying || status?.isLiveInputActive) {
    if (isActiveFilePlayback(status) && featureFrame) {
      refreshPausedFileHoldFrame({
        frameCacheRefs: renderLoopRefs.frameCacheRefs,
        status,
        featureFrame,
      });
    } else {
      clearPausedFileHoldFrame(renderLoopRefs.frameCacheRefs);
    }
    if (!filePlaybackActivationHold) {
      lastIdleFrameRef.current = null;
    }
  } else if (status?.lastLiveInputInterruption) {
    clearFrameCache(renderLoopRefs.frameCacheRefs);
    resetInterruptedLiveInputVisualResponse(runtimeState);
    featureFrame = null;
  } else if (frameSemanticSource !== "paused-file-hold") {
    clearPausedFileHoldFrame(renderLoopRefs.frameCacheRefs);
  }

  return {
    featureFrame,
    effectiveFrame: featureFrame,
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
    ...runtimeState.debugSnapshot,
  };
}

function publishAuditSnapshot(
  {
    controls,
    runtime,
    runtimeState,
    status,
    lowLoadPlaybackDiagnosticsActive,
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
  if (!lowLoadPlaybackDiagnosticsActive && frame % interval === 0) {
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
    lowLoadPlaybackDiagnosticsActive,
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
  if (lowLoadPlaybackDiagnosticsActive) {
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
    lowLoadPlaybackDiagnosticsActive,
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
      lowLoadPlaybackDiagnosticsActive,
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
      lowLoadPlaybackDiagnosticsActive,
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
