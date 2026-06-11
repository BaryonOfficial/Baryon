import {
  applyAuditControls,
  applyBloomControls,
  applyEffectiveRaymarchStepBudget,
  applyOutputControls,
  applyRaymarchControls,
  applySharedControls,
  buildControlInspectionSnapshot,
} from "@baryon/visualizer/controls/runtime";
import {
  buildAudioFeatureTransportFrame,
  buildFastSignalPatchedAudioFeatureAnalysisResult,
  buildAudioFeatureFrame,
  composeAudioFeatureFrame,
  prepareAudioFeatureFrameInputs,
  runHeavyAudioFeatureAnalysis,
} from "@baryon/visualizer/audio-features";
import { CAVITY_ACOUSTIC_DEFAULTS } from "@baryon/visualizer/defaults";
import {
  allowsModalDescriptorRenderAuthority,
  allowsCurrentLiveRenderFrame,
  hasRenderAuthority,
} from "@baryon/visualizer/core/renderAuthorityContract";
import { RAYMARCH_MODAL_BASIS_CACHE_CAPACITY } from "@baryon/visualizer/core/raymarch/fieldCache";
import * as raymarchPerformanceGovernor from "@baryon/visualizer/core/raymarch/performanceGovernor";
import { usesRaymarchVolumePipeline } from "@baryon/visualizer/visualization/types";
import { resolveTemporalReprojectionPolicy } from "@baryon/visualizer/render/temporalReprojectionPolicy";
import {
  CUSTOM_TARGET_FPS_BANDS,
  DEFAULT_PERFORMANCE_TARGET_FPS,
  normalizePerformanceTargetFps,
  PERFORMANCE_PROFILES,
  RENDER_CONTEXTS,
  markRenderOutputVisualIdle,
  resolveCustomTargetFpsBand,
  syncRenderOutputBloomPassUniforms,
  usesBalancedPerformanceBaseline,
} from "@baryon/visualizer/render/outputPipeline";
import {
  clearFrameCache,
  createEmptyAnalysisSchedulerState,
  recordRuntimePerfSample,
  shouldReuseIdleFrame,
  snapshotModalFreshnessDiagnostics,
  snapshotRuntimePerfBreakdown,
  snapshotRuntimeDiagnostics,
  snapshotSourceEvidenceDiagnostics,
  snapshotWorkerPerfCounters,
} from "./baryonVisualizerRuntimeState.js";
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
const ACTIVE_FEATURE_ANALYSIS_HZ = 30;
const ACTIVE_FEATURE_ANALYSIS_INTERVAL_MS = 1000 / ACTIVE_FEATURE_ANALYSIS_HZ;
const MAX_ANALYSIS_AGE_MS = 50;
const ADAPTIVE_RAYMARCH_DECISION_WINDOW_SECONDS = 0.5;
const ADAPTIVE_RAYMARCH_MIN_DECISION_WINDOW_FRAMES = 12;
const ADAPTIVE_RAYMARCH_MAX_DECISION_WINDOW_FRAMES = 45;
const ADAPTIVE_RAYMARCH_RECOVERY_WINDOWS = 4;
const ADAPTIVE_RAYMARCH_STEP_DOWN_LONG_FRAME_RATIO = 0.1;
const ADAPTIVE_RAYMARCH_PRESSURE_SAFETY_MARGIN = 0.94;
const ADAPTIVE_RAYMARCH_PRESSURE_FRAME_TIME_RATIO = 1.08;
const ADAPTIVE_RAYMARCH_STABLE_FRAME_TIME_RATIO = 0.93;
const ADAPTIVE_RAYMARCH_LONG_FRAME_TIME_RATIO = 1.5;
const ADAPTIVE_RAYMARCH_RECOVERY_MIN_RENDER_ENERGY = 0.08;
const RAYMARCH_USER_TUNABLE_STEP_MIN = 16;
const COHERENT_MODAL_RAYMARCH_STEP_FLOOR = RAYMARCH_USER_TUNABLE_STEP_MIN;
const ADAPTIVE_RAYMARCH_STEP_LADDER = Object.freeze([
  16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192,
]);
const ADAPTIVE_RAYMARCH_RENDER_SCALE_LADDER = Object.freeze([
  0.5, 0.59, 0.67, 0.75, 0.84, 0.92, 1,
]);
const STAGE_ATTRIBUTION_TIEBREAK_ORDER = Object.freeze([
  "unattributed",
  "render",
  "analysis",
  "control",
  "engine",
]);
const STAGE_ATTRIBUTION_BUCKET_PERF_KEYS = Object.freeze({
  analysis: Object.freeze([
    "readAnalysisSnapshotMs",
    "buildFeatureFrameMs",
    "heavyAnalysisMs",
    "fastComposeMs",
  ]),
  engine: Object.freeze(["engineEnqueueMs", "readEngineSnapshotMs"]),
  control: Object.freeze([
    "applyCachedControlSnapshotsMs",
    "syncLiveInputRuntimeStatusMs",
    "runtimeTickMs",
    "applyReactiveBloomMs",
    "applySceneControlsMs",
  ]),
  render: Object.freeze(["pipelineRenderMs"]),
});
const LIVE_RENDER_INTENT_UI_STATES = new Set(["starting", "active"]);

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
    publishCount: runtimeDiagnostics?.engine?.publishCount ?? 0,
    publishSkipCount: runtimeDiagnostics?.engine?.publishSkipCount ?? 0,
    fastSignalPatchCount: runtimeDiagnostics?.engine?.fastSignalPatchCount ?? 0,
    fastSignalUpdateCount:
      runtimeDiagnostics?.engine?.fastSignalUpdateCount ?? 0,
    structuralUpdateCount:
      runtimeDiagnostics?.engine?.structuralUpdateCount ?? 0,
    chromaUpdateCount: runtimeDiagnostics?.engine?.chromaUpdateCount ?? 0,
    tempoUpdateCount: runtimeDiagnostics?.engine?.tempoUpdateCount ?? 0,
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

function copyNumericSlots(values) {
  if (values instanceof Float32Array) {
    return new Float32Array(values);
  }
  if (Array.isArray(values)) {
    return Float32Array.from(values, (value) => readFiniteNumber(value));
  }

  return null;
}

function measureSlotTurnover(previousSlots, nextSlots, epsilon = 1e-4) {
  const nextCopy = copyNumericSlots(nextSlots);
  if (!nextCopy) {
    return {
      nextCopy: null,
      meanAbsDelta: 0,
      changeCount: 0,
    };
  }
  if (!previousSlots) {
    return {
      nextCopy,
      meanAbsDelta: 0,
      changeCount: 0,
    };
  }

  const previousLength = previousSlots.length;
  const nextLength = nextCopy.length;
  const comparedLength = Math.max(previousLength, nextLength);
  if (comparedLength === 0) {
    return {
      nextCopy,
      meanAbsDelta: 0,
      changeCount: 0,
    };
  }

  let totalAbsDelta = 0;
  let changeCount = 0;
  for (let index = 0; index < comparedLength; index += 1) {
    const previousValue =
      index < previousLength ? readFiniteNumber(previousSlots[index]) : 0;
    const nextValue =
      index < nextLength ? readFiniteNumber(nextCopy[index]) : 0;
    const delta = Math.abs(nextValue - previousValue);
    totalAbsDelta += delta;
    if (delta > epsilon) {
      changeCount += 1;
    }
  }

  return {
    nextCopy,
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
    return null;
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
    runtimeDiagnostics?.engine?.snapshotAgeMs,
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

  return snapshotModalFreshnessDiagnostics(modalFreshness);
}

export function updateModalEnvelopeDiagnostics(
  runtimeDiagnostics,
  runtimeState,
) {
  const modalFreshness = runtimeDiagnostics?.modalFreshness;
  if (!modalFreshness || !runtimeState) {
    return null;
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

  return snapshotModalFreshnessDiagnostics(modalFreshness);
}

export function getPlaybackDiagnosticDpr() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
}

export function getRenderTargetPixelRatio(
  qualityPreset,
  basePixelRatio = null,
) {
  if (Number.isFinite(basePixelRatio) && basePixelRatio > 0) {
    return basePixelRatio;
  }

  if (qualityPreset === PERFORMANCE_PROFILES.maxQuality) {
    if (typeof window === "undefined") {
      return 1;
    }

    return Math.max(1, window.devicePixelRatio || 1);
  }

  return getPlaybackDiagnosticDpr();
}

function getRenderLoopWallTimeMs() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

function serializeReplayArray(values) {
  if (values instanceof Float32Array || values instanceof Uint8Array) {
    return Array.from(values);
  }

  return values ?? null;
}

function maybeCaptureReplayFrame({ analysisSnapshot, status, frameTimeMs }) {
  if (typeof window === "undefined") {
    return;
  }

  const capture = /** @type {any} */ (window).__baryonPerfReplayCapture;
  if (!capture?.enabled) {
    return;
  }

  const frames = Array.isArray(capture.frames) ? capture.frames : [];
  frames.push({
    frameTimeMs,
    status: {
      audioInputMode: status?.audioInputMode ?? "idle",
      isPlaying: Boolean(status?.isPlaying),
      isLiveInputActive: Boolean(status?.isLiveInputActive),
      liveInputDeviceKind:
        status?.liveInputDeviceKind ?? status?.liveInputKind ?? null,
      liveInputKind: status?.liveInputKind ?? null,
      playbackSessionId: status?.playbackSessionId ?? null,
      sampleRate: status?.sampleRate ?? null,
      fftSize: status?.fftSize ?? null,
      liveInputCalibrationVersion: status?.liveInputCalibrationVersion ?? null,
    },
    analysisSnapshot: analysisSnapshot
      ? {
          sourceMode: analysisSnapshot.sourceMode ?? null,
          avgAmplitude: analysisSnapshot.avgAmplitude ?? 0,
          rms: analysisSnapshot.rms ?? 0,
          spectralCentroid: analysisSnapshot.spectralCentroid ?? 0,
          spectralFlux: analysisSnapshot.spectralFlux ?? 0,
          fftMagnitudes: serializeReplayArray(analysisSnapshot.fftMagnitudes),
          timeData: serializeReplayArray(analysisSnapshot.timeData),
        }
      : null,
  });

  const maxFrames = Math.max(1, Math.round(capture.maxFrames ?? 24));
  if (frames.length > maxFrames) {
    frames.splice(0, frames.length - maxFrames);
  }

  /** @type {any} */ (window).__baryonPerfReplayCapture = {
    ...capture,
    frames,
  };
}

function snapshotMatchesPreparedInputs(engineSnapshot, preparedInputs) {
  return hasMatchingAnalysisContext(engineSnapshot, preparedInputs);
}

function getSnapshotAgeMsForPreparedInputs(engineSnapshot, preparedInputs) {
  if (!Number.isFinite(preparedInputs?.currentFrameAtMs)) {
    return 0;
  }

  if (!Number.isFinite(engineSnapshot?.frameTimeMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    0,
    preparedInputs.currentFrameAtMs - engineSnapshot.frameTimeMs,
  );
}

function isLineFeedProgramInput({ preparedInputs, status }) {
  const inputMode = preparedInputs?.inputMode ?? status?.audioInputMode;
  return (
    inputMode === "system" ||
    (inputMode === "live" &&
      (preparedInputs?.resolvedLiveInputAnalysisClass === "line-feed" ||
        preparedInputs?.liveInputPolicy === "line-feed"))
  );
}

function shouldRefreshStaleProgramSnapshot({
  engineSnapshot,
  preparedInputs,
  status,
}) {
  const inputMode = preparedInputs?.inputMode ?? status?.audioInputMode;
  const activeFileProgram =
    inputMode === "file" &&
    status?.isPlaying === true &&
    status?.isLiveInputActive !== true;
  const activeLineFeedProgram =
    isLineFeedProgramInput({ preparedInputs, status }) &&
    status?.isLiveInputActive === true;

  if (!activeFileProgram && !activeLineFeedProgram) {
    return false;
  }

  return getSnapshotAgeMsForPreparedInputs(engineSnapshot, preparedInputs) > 0;
}

function classifyFrameSemanticSource(source) {
  switch (source) {
    case "worker-snapshot":
    case "worker-fast-signal":
    case "local-heavy-analysis":
    case "live-warmup":
    case "bootstrap-fallback":
    case "direct-feature-build":
      return { fresh: true, reused: false };
    case "scheduled-reuse":
    case "last-live-cache":
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

function hasMatchingAnalysisContext(previousAnalysis, preparedInputs) {
  return Boolean(
    previousAnalysis &&
    preparedInputs &&
    previousAnalysis.analysisSessionKey === preparedInputs.analysisSessionKey &&
    previousAnalysis.analysisInputsSignature ===
      preparedInputs.analysisInputsSignature,
  );
}

function shouldRunHeavyFeatureAnalysis({
  schedulerState,
  preparedInputs,
  frameTimeMs,
  runtimeDiagnostics,
}) {
  const analysisAgeMs = Number.isFinite(schedulerState.lastHeavyAnalysisAtMs)
    ? Math.max(0, frameTimeMs - schedulerState.lastHeavyAnalysisAtMs)
    : Number.POSITIVE_INFINITY;
  const targetIntervalMs =
    (runtimeDiagnostics?.smoothedFrameTimeMs ?? 0) >
    ACTIVE_FEATURE_ANALYSIS_INTERVAL_MS
      ? MAX_ANALYSIS_AGE_MS
      : ACTIVE_FEATURE_ANALYSIS_INTERVAL_MS;
  const forced =
    !schedulerState.lastHeavyAnalysisResult ||
    !hasMatchingAnalysisContext(
      {
        analysisSessionKey: schedulerState.lastAnalysisSessionKey,
        analysisInputsSignature: schedulerState.lastAnalysisInputsSignature,
      },
      preparedInputs,
    ) ||
    analysisAgeMs >= MAX_ANALYSIS_AGE_MS;

  return {
    analysisAgeMs,
    forced,
    shouldRun: forced || analysisAgeMs >= targetIntervalMs,
  };
}

function resetAnalysisSchedulerState(analysisSchedulerRef) {
  if (analysisSchedulerRef?.current) {
    analysisSchedulerRef.current = createEmptyAnalysisSchedulerState();
  }
}

function getAnalysisSchedulerState(analysisSchedulerRef) {
  return analysisSchedulerRef?.current ?? createEmptyAnalysisSchedulerState();
}

function isRenderAuthorizedFeatureFrame(featureFrame) {
  return hasRenderAuthority(featureFrame);
}

function shouldSeedLiveInputWarmupFrame({
  status,
  lastLiveFrame,
  lastActiveFrame,
}) {
  return (
    status?.isLiveInputActive === true &&
    !isRenderAuthorizedFeatureFrame(lastLiveFrame) &&
    !lastActiveFrame
  );
}

function shouldBootstrapActiveFeatureFrame({
  status,
  controls,
  lastLiveFrame,
  lastActiveFrame,
}) {
  const audioActive = hasAudioSourceRenderIntent({ status, controls });
  return (
    audioActive &&
    !isRenderAuthorizedFeatureFrame(lastLiveFrame) &&
    !isRenderAuthorizedFeatureFrame(lastActiveFrame)
  );
}

function hasSpectralLightFeatureFrameRequest(featureFrame) {
  return featureFrame?.spectralLightRequested === true;
}

function hasPositiveSpectralLaneWeight(laneWeights) {
  if (!laneWeights?.length) {
    return false;
  }

  for (let index = 0; index < laneWeights.length; index += 1) {
    if ((laneWeights[index] ?? 0) > 1e-8) {
      return true;
    }
  }

  return false;
}

function hasRenderableSpectralLanePayload(analysisResult) {
  const activeModeCount = Math.max(
    analysisResult?.activeModeCount ?? 0,
    analysisResult?.activeSourceCoupledModeCount ?? 0,
    analysisResult?.activeResonantModeCount ?? 0,
  );

  return (
    activeModeCount > 0 &&
    (hasPositiveSpectralLaneWeight(
      analysisResult?.sourceCoupledSpectralLaneA,
    ) ||
      hasPositiveSpectralLaneWeight(
        analysisResult?.sourceCoupledSpectralLaneB,
      ) ||
      hasPositiveSpectralLaneWeight(analysisResult?.resonantSpectralLaneA) ||
      hasPositiveSpectralLaneWeight(analysisResult?.resonantSpectralLaneB))
  );
}

function hasPreparedSourceActivity({ preparedInputs, controls }) {
  return Boolean(
    controls?.injectTestTone ||
    preparedInputs?.soundActive ||
    preparedInputs?.micActive ||
    preparedInputs?.lineFeedProgramActive,
  );
}

function shouldRebuildEmptySpectralLaneSnapshot({
  spectralLightEnabled,
  engineSnapshot,
  preparedInputs,
  status,
  controls,
}) {
  return (
    spectralLightEnabled === true &&
    preparedInputs?.shouldBuildSpectralLight === true &&
    hasAudioSourceRenderIntent({ status, controls }) &&
    hasPreparedSourceActivity({ preparedInputs, controls }) &&
    !hasRenderableSpectralLanePayload(engineSnapshot?.analysisResult)
  );
}

function shouldRefreshSpectralLightFeatureFrame({
  spectralLightEnabled,
  status,
  controls,
  lastLiveFrame,
}) {
  return (
    spectralLightEnabled === true &&
    hasAudioSourceRenderIntent({ status, controls }) &&
    isRenderAuthorizedFeatureFrame(lastLiveFrame) &&
    !hasSpectralLightFeatureFrameRequest(lastLiveFrame)
  );
}

function hasAudioSourceRenderIntent({ status, controls }) {
  return Boolean(
    status?.isPlaying || status?.isLiveInputActive || controls?.injectTestTone,
  );
}

function hasClosedPreparedSourceEvidence(preparedInputs) {
  const sourceEvidence = preparedInputs?.sourceEvidence;
  if (!sourceEvidence) {
    return false;
  }

  return (
    sourceEvidence.currentSourceEvidence !== true ||
    sourceEvidence.sourceBoundaryState !== "live"
  );
}

function shouldComposeInactiveSourceFeatureFrame({
  status,
  controls,
  preparedInputs,
}) {
  return (
    preparedInputs?.snapshot != null &&
    (!hasAudioSourceRenderIntent({ status, controls }) ||
      hasClosedPreparedSourceEvidence(preparedInputs))
  );
}

function shouldCaptureLastLiveFrame({ featureFrame }) {
  return allowsCurrentLiveRenderFrame(featureFrame);
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

function resolveCachedLiveFeatureFrame(lastLiveFrame, silentFeatureFrame) {
  if (allowsCurrentLiveRenderFrame(lastLiveFrame)) {
    return lastLiveFrame;
  }

  return silentFeatureFrame;
}

function shouldApplyLiveInputRenderIntent(
  { status, liveInputUiState, liveControlSignal } = {
    status: null,
    liveInputUiState: null,
    liveControlSignal: null,
  },
) {
  if (liveControlSignal?.desiredActive === false) {
    return false;
  }

  if (liveControlSignal?.desiredActive === true) {
    return true;
  }

  return (
    status?.isLiveInputActive === true ||
    LIVE_RENDER_INTENT_UI_STATES.has(liveInputUiState)
  );
}

export function applyLiveInputRenderIntent(
  featureFrame,
  { status, liveInputUiState, liveControlSignal } = {
    status: null,
    liveInputUiState: null,
    liveControlSignal: null,
  },
) {
  if (!featureFrame) {
    return featureFrame;
  }

  const isLiveInputActive = shouldApplyLiveInputRenderIntent({
    status,
    liveInputUiState,
    liveControlSignal,
  });
  if (featureFrame.isLiveInputActive === isLiveInputActive) {
    return featureFrame;
  }

  return {
    ...featureFrame,
    isLiveInputActive,
  };
}

function storeComposedAnalysisResult(
  analysisSchedulerRef,
  preparedInputs,
  analysisResult,
  featureFrame,
) {
  if (!analysisSchedulerRef?.current) {
    return;
  }

  analysisSchedulerRef.current = {
    lastHeavyAnalysisAtMs: preparedInputs.currentFrameAtMs,
    lastHeavyAnalysisResult: analysisResult,
    lastComposedFeatureFrame: featureFrame,
    lastAnalysisSessionKey: preparedInputs.analysisSessionKey,
    lastAnalysisInputsSignature: preparedInputs.analysisInputsSignature,
  };
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
    requestedRenderScale: render?.requestedRenderScale ?? 1,
    renderScale: render?.renderScale ?? 1,
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

function normalizeRenderScale(renderScale) {
  if (!Number.isFinite(renderScale) || renderScale <= 0) {
    return 1;
  }

  return Math.max(0.5, Math.min(1, renderScale));
}

function resolveAdaptiveTargetFps(renderProfile, controls) {
  if (renderProfile?.qualityPreset === PERFORMANCE_PROFILES.custom) {
    return normalizePerformanceTargetFps(controls?.customPerformanceTargetFps);
  }

  return DEFAULT_PERFORMANCE_TARGET_FPS;
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
  renderProfile,
  controls,
  status,
  requestedRenderScale = 1,
  basePixelRatio = null,
}) {
  if (!gl || !runtimeDiagnostics) {
    return null;
  }

  const effectiveRenderScale = getEffectiveRenderScale(
    runtimeDiagnostics,
    requestedRenderScale,
  );
  const lowLoadActive = Boolean(
    controls?.lowLoadPlaybackDiagnostics && status?.isPlaying,
  );
  const resolvedBasePixelRatio = getRenderTargetPixelRatio(
    renderProfile?.qualityPreset,
    basePixelRatio,
  );
  const scaledPixelRatio = Math.max(
    0.25,
    resolvedBasePixelRatio * effectiveRenderScale,
  );
  const targetPixelRatio = lowLoadActive ? 1 : scaledPixelRatio;

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

export function getEffectiveRenderScale(
  runtimeDiagnostics,
  requestedRenderScale = 1,
) {
  const normalizedRequestedRenderScale =
    normalizeRenderScale(requestedRenderScale);
  const effectiveRenderScale = Number.isFinite(
    runtimeDiagnostics?.adaptiveRaymarch?.effectiveRenderScale,
  )
    ? runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale
    : normalizedRequestedRenderScale;

  return normalizeRenderScale(
    Math.min(effectiveRenderScale, normalizedRequestedRenderScale),
  );
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
 * for this raymarch-pipeline frame. Delegates to visualizer's temporal
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
  { getTargetDpr = getPlaybackDiagnosticDpr, renderScale = 1 } = {},
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
  const scaledPixelRatio = Math.max(0.25, basePixelRatio * renderScale);
  const targetPixelRatio = lowLoadActive ? 1 : scaledPixelRatio;
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
        playbackSessionId: status.playbackSessionId ?? null,
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
  runtimeDiagnostics.currentPixelRatio = targetPixelRatio;
  runtimeDiagnostics.basePixelRatio = basePixelRatio;
  const nextRenderSurfaceWidth = state?.size?.width ?? 0;
  const nextRenderSurfaceHeight = state?.size?.height ?? 0;
  const previousRenderSurfaceSize =
    renderLoopRefs.renderSurfaceSizeRef.current ?? null;
  const renderSurfaceSizeChanged =
    previousRenderSurfaceSize?.width !== nextRenderSurfaceWidth ||
    previousRenderSurfaceSize?.height !== nextRenderSurfaceHeight;
  if (renderLoopRefs.pixelRatioRef.current !== targetPixelRatio) {
    gl.setPixelRatio(targetPixelRatio);
    renderLoopRefs.pixelRatioRef.current = targetPixelRatio;
  }
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

  if (status.isPlaying && frameTimeMs !== null) {
    runtimeDiagnostics.activeFrameCount += 1;
    runtimeDiagnostics.averageFrameTimeMs +=
      (frameTimeMs - runtimeDiagnostics.averageFrameTimeMs) /
      runtimeDiagnostics.activeFrameCount;
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

function buildAdaptiveRenderScaleLadder(requestedRenderScale) {
  const normalizedRequestedRenderScale =
    normalizeRenderScale(requestedRenderScale);
  const rungSet = new Set(
    ADAPTIVE_RAYMARCH_RENDER_SCALE_LADDER.filter(
      (renderScale) => renderScale < normalizedRequestedRenderScale,
    ),
  );
  rungSet.add(normalizedRequestedRenderScale);
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

  const renderContext =
    renderProfile?.renderContext === RENDER_CONTEXTS.externalOutput
      ? RENDER_CONTEXTS.externalOutput
      : RENDER_CONTEXTS.preview;
  const targetBand = resolveCustomTargetFpsBand(
    renderProfile?.targetFps ?? DEFAULT_PERFORMANCE_TARGET_FPS,
  );
  const usesBalancedBaseline = usesBalancedPerformanceBaseline(
    renderProfile?.qualityPreset,
    renderProfile?.targetFps ?? DEFAULT_PERFORMANCE_TARGET_FPS,
  );

  if (renderContext === RENDER_CONTEXTS.externalOutput) {
    if (usesBalancedBaseline) {
      return {
        startRung: findAdaptiveLadderRungForValue(stepLadder, 32),
      };
    }
    if (targetBand === CUSTOM_TARGET_FPS_BANDS.low) {
      return {
        startRung: findAdaptiveLadderRungForValue(stepLadder, 40),
      };
    }
    if (targetBand === CUSTOM_TARGET_FPS_BANDS.high) {
      return {
        startRung: findAdaptiveLadderRungForValue(stepLadder, 24),
      };
    }
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 16),
    };
  }

  if (usesBalancedBaseline) {
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 40),
    };
  }
  if (targetBand === CUSTOM_TARGET_FPS_BANDS.low) {
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 48),
    };
  }
  if (targetBand === CUSTOM_TARGET_FPS_BANDS.high) {
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 32),
    };
  }

  return {
    startRung: findAdaptiveLadderRungForValue(stepLadder, 24),
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
  requestedRenderScale = 1,
  { preserveHistory = false, startRung = null } = {},
) {
  const ladder = buildAdaptiveRaymarchLadder(requestedStepBudget);
  const renderScaleLadder =
    buildAdaptiveRenderScaleLadder(requestedRenderScale);
  const normalizedRequestedRenderScale =
    normalizeRenderScale(requestedRenderScale);
  adaptiveRaymarch.requestedRaymarchSteps = requestedStepBudget;
  adaptiveRaymarch.requestedRenderScale = normalizedRequestedRenderScale;
  const resolvedStartRung = Number.isFinite(startRung)
    ? clampAdaptiveLadderRung(startRung, ladder)
    : getAdaptiveLadderMaxRung(ladder);
  adaptiveRaymarch.currentRung = resolvedStartRung;
  adaptiveRaymarch.effectiveRaymarchSteps = ladder[resolvedStartRung];
  adaptiveRaymarch.currentRenderScaleRung =
    getAdaptiveLadderMaxRung(renderScaleLadder);
  adaptiveRaymarch.effectiveRenderScale = normalizedRequestedRenderScale;
  adaptiveRaymarch.decisionFrameCount = 0;
  adaptiveRaymarch.longFrameCountInWindow = 0;
  adaptiveRaymarch.stableWindowCount = 0;
  adaptiveRaymarch.recoveryEligible = false;
  adaptiveRaymarch.recoveryBlockedReason = "none";
  if (!preserveHistory) {
    adaptiveRaymarch.stepDownCount = 0;
    adaptiveRaymarch.stepUpCount = 0;
    adaptiveRaymarch.renderScaleStepDownCount = 0;
    adaptiveRaymarch.renderScaleStepUpCount = 0;
  }
  return {
    ladder,
    renderScaleLadder,
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

function resolveAdaptiveRenderScaleAtRung({ ladder, rung }) {
  return ladder[clampAdaptiveLadderRung(rung, ladder)];
}

/**
 * Publish the integrator's committed budget to runtimeState so the visualizer
 * tick can build its governor self-sufficiently. Replaces the old prepare/take
 * governor handoff (which matched by reference equality and missed whenever the
 * committed budget and diagnostics were no longer read from one state owner).
 */
function publishRaymarchIntegratorBudget(
  runtimeState,
  { effectiveRenderScale, bloomAdaptationActive },
) {
  if (!runtimeState) {
    return;
  }
  runtimeState.effectiveRenderScale = effectiveRenderScale;
  runtimeState.raymarchBloomAdaptationActive = bloomAdaptationActive === true;
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

export function resolveRaymarchGovernorFrameInputs(
  runtimeState,
  effectiveFrame,
) {
  const modalFieldCapacity =
    raymarchPerformanceGovernor.inferModalFieldCapacity(
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
  const requestedRenderScale = normalizeRenderScale(
    renderProfile?.renderScale ?? 1,
  );
  const { productUploadCapacity, uploadedModeCount } =
    resolveRaymarchGovernorFrameInputs(runtimeState, effectiveFrame);
  const frameModeCount = readRaymarchFrameModeCount(effectiveFrame);
  const cavityGeometry =
    runtimeState?.effectiveCavityGeometry ??
    runtimeState?.volumeMesh?.userData?.raymarchCavityGeometry ??
    "rectangular";
  const governorSlots =
    effectiveFrame?.modalDescriptor?.slotViews?.modalFieldSlots ??
    effectiveFrame?.modalFieldSlots;
  const activeRaymarchFrame = Boolean(
    usesRaymarchVolumePipeline(runtime?.method) &&
    allowsCurrentLiveRenderFrame(effectiveFrame) &&
    Math.max(frameModeCount, uploadedModeCount) > 0,
  );
  const profileAllowsAdaptiveQuality = Boolean(
    renderProfile?.qualityPreset === PERFORMANCE_PROFILES.auto ||
    renderProfile?.qualityPreset === PERFORMANCE_PROFILES.custom,
  );
  const adaptiveRaymarch = runtimeDiagnostics.adaptiveRaymarch;
  const adaptiveQualityActive =
    profileAllowsAdaptiveQuality && activeRaymarchFrame;
  // The observation integrator owns adaptive quality: steps are lowered first;
  // render scale/DPR are lowered only after the step ladder reaches its floor.
  // The governor stays bloom-only while there is an active raymarch frame.
  const performanceGovernor =
    raymarchPerformanceGovernor.buildRaymarchPerformanceGovernor({
      modalFieldSlots: governorSlots,
      modalFieldCapacity: productUploadCapacity,
      featureFrame: effectiveFrame,
      requestedStepBudget,
      requestedRenderScale,
      cavityGeometry,
      stepScaleAdaptationEnabled: false,
      bloomAdaptationEnabled: activeRaymarchFrame,
    });
  runtimeState.performanceGovernor = {
    ...runtimeState.performanceGovernor,
    ...performanceGovernor,
  };
  // The ladder ceiling is the user cap; the governor no longer pre-reduces it.
  const governedStepBudget = requestedStepBudget;
  const governedRenderScale = requestedRenderScale;
  const adaptiveTuning = buildAdaptiveRaymarchTuning(
    resolveAdaptiveTargetFps(renderProfile, controls),
  );
  adaptiveRaymarch.targetFps = adaptiveTuning.targetFps;
  adaptiveRaymarch.targetFrameTimeMs = adaptiveTuning.targetFrameTimeMs;

  let ladder = buildAdaptiveRaymarchLadder(governedStepBudget);
  let renderScaleLadder = buildAdaptiveRenderScaleLadder(governedRenderScale);
  const adaptiveStartInputs = resolveAdaptiveStartInputs({
    renderProfile,
    requestedStepBudget: governedStepBudget,
  });
  const requestedChanged =
    adaptiveRaymarch.requestedRaymarchSteps !== governedStepBudget ||
    adaptiveRaymarch.requestedRenderScale !== governedRenderScale;
  if (requestedChanged) {
    ({ ladder, renderScaleLadder } = resetAdaptiveRaymarchState(
      adaptiveRaymarch,
      governedStepBudget,
      governedRenderScale,
      {
        startRung: Number.isFinite(runtimeState.adaptiveRaymarchResumeRung)
          ? runtimeState.adaptiveRaymarchResumeRung
          : adaptiveStartInputs.startRung,
      },
    ));
  }

  if (!adaptiveQualityActive) {
    const inactiveStepRung = profileAllowsAdaptiveQuality
      ? resolveAdaptiveCurrentRung({
          currentRung: adaptiveRaymarch.currentRung,
          ladder,
        })
      : getAdaptiveLadderMaxRung(ladder);
    const inactiveStepBudget = resolveAdaptiveStepBudgetAtRung({
      activeRaymarchFrame,
      requestedStepBudget: governedStepBudget,
      ladder,
      rung: inactiveStepRung,
    });
    const inactiveRenderScaleRung = profileAllowsAdaptiveQuality
      ? resolveAdaptiveCurrentRung({
          currentRung: adaptiveRaymarch.currentRenderScaleRung,
          ladder: renderScaleLadder,
        })
      : getAdaptiveLadderMaxRung(renderScaleLadder);
    const inactiveRenderScale = resolveAdaptiveRenderScaleAtRung({
      ladder: renderScaleLadder,
      rung: inactiveRenderScaleRung,
    });
    runtimeState.adaptiveRaymarchResumeRung = inactiveStepRung;
    adaptiveRaymarch.adaptiveRaymarchActive = false;
    adaptiveRaymarch.requestedRaymarchSteps = governedStepBudget;
    adaptiveRaymarch.requestedRenderScale = governedRenderScale;
    adaptiveRaymarch.currentRung = inactiveStepRung;
    adaptiveRaymarch.effectiveRaymarchSteps = inactiveStepBudget;
    adaptiveRaymarch.effectiveRenderScale = inactiveRenderScale;
    adaptiveRaymarch.currentRenderScaleRung = inactiveRenderScaleRung;
    applyEffectiveRaymarchStepBudget(
      runtimeState,
      controls,
      inactiveStepBudget,
    );
    // Non-adaptive profiles hold the user cap; adaptive profiles hold their
    // committed ladder rungs across transient inactive frames.
    publishRaymarchIntegratorBudget(runtimeState, {
      effectiveRenderScale: inactiveRenderScale,
      bloomAdaptationActive: activeRaymarchFrame,
    });
    runtimeState.performanceGovernor = {
      ...runtimeState.performanceGovernor,
      effectiveRenderScale: inactiveRenderScale,
      effectiveStepBudget: inactiveStepBudget,
    };
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
  adaptiveRaymarch.currentRenderScaleRung = resolveAdaptiveCurrentRung({
    currentRung: adaptiveRaymarch.currentRenderScaleRung,
    ladder: renderScaleLadder,
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
        } else if (adaptiveRaymarch.currentRenderScaleRung > 0) {
          adaptiveRaymarch.currentRenderScaleRung -= 1;
          adaptiveRaymarch.renderScaleStepDownCount =
            (adaptiveRaymarch.renderScaleStepDownCount ?? 0) + 1;
        }
        adaptiveRaymarch.stableWindowCount = 0;
      } else if (stableWindow && recoveryState.recoveryEligible) {
        adaptiveRaymarch.stableWindowCount += 1;
        if (
          adaptiveRaymarch.stableWindowCount >=
          ADAPTIVE_RAYMARCH_RECOVERY_WINDOWS
        ) {
          if (
            adaptiveRaymarch.currentRenderScaleRung <
            renderScaleLadder.length - 1
          ) {
            adaptiveRaymarch.currentRenderScaleRung += 1;
            adaptiveRaymarch.renderScaleStepUpCount =
              (adaptiveRaymarch.renderScaleStepUpCount ?? 0) + 1;
          } else if (adaptiveRaymarch.currentRung < ladder.length - 1) {
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
    requestedStepBudget: governedStepBudget,
    ladder,
    rung: adaptiveRaymarch.currentRung,
  });
  adaptiveRaymarch.effectiveRaymarchSteps = effectiveStepBudget;
  adaptiveRaymarch.effectiveRenderScale = resolveAdaptiveRenderScaleAtRung({
    ladder: renderScaleLadder,
    rung: adaptiveRaymarch.currentRenderScaleRung,
  });
  adaptiveRaymarch.complexityScore = performanceGovernor.complexityScore;
  adaptiveRaymarch.uploadedModeCount = performanceGovernor.uploadedModeCount;
  adaptiveRaymarch.originalModeCount = performanceGovernor.originalModeCount;
  adaptiveRaymarch.proactiveStepBudget =
    performanceGovernor.proactiveStepBudget;
  adaptiveRaymarch.proactiveRenderScale =
    performanceGovernor.proactiveRenderScale;
  runtimeState.adaptiveRaymarchResumeRung = adaptiveRaymarch.currentRung;
  runtimeState.performanceGovernor = {
    ...runtimeState.performanceGovernor,
    effectiveRenderScale: adaptiveRaymarch.effectiveRenderScale,
    effectiveStepBudget,
  };
  applyEffectiveRaymarchStepBudget(runtimeState, controls, effectiveStepBudget);
  // The bloom guard reads the ladder's effective budget/scale. The visualizer
  // tick builds the authoritative governor from the published budget; here we
  // mirror the same decision into diagnostics via the shared helper.
  publishRaymarchIntegratorBudget(runtimeState, {
    effectiveRenderScale: adaptiveRaymarch.effectiveRenderScale,
    bloomAdaptationActive: true,
  });
  adaptiveRaymarch.bloomAllowed =
    raymarchPerformanceGovernor.deriveRaymarchBloomAllowed({
      complexityScore: performanceGovernor.complexityScore,
      bloomAdaptationActive: true,
      effectiveStepBudget,
      effectiveRenderScale: adaptiveRaymarch.effectiveRenderScale,
    });
  runtimeState.performanceGovernor.bloomAllowed = adaptiveRaymarch.bloomAllowed;
  return effectiveStepBudget;
}

export function applyCachedControlSnapshots(
  {
    controls,
    runtimeState,
    featureState,
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
        { ensurePipeline, postNodesRef, renderProfileRef },
        controls,
      ),
      visualization: appliers.applyRaymarchControls(runtimeState, controls),
      bloom: appliers.applyBloomControls(
        { ensurePipeline, postNodesRef, renderProfileRef, runtimeState },
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

  return {
    ...cachedControlSnapshotsRef.current,
    controlsChanged,
  };
}

export function resolveFeatureFrame(
  {
    audio,
    featureState,
    featureEngine,
    runtimeDiagnostics = null,
    runtimeState,
    controls,
    status,
    time,
    clockMode,
    renderLoopRefs,
    spectralLightEnabled,
  },
  {
    buildFeatureFrame = buildAudioFeatureFrame,
    prepareFeatureFrame = prepareAudioFeatureFrameInputs,
    runHeavyFeatureAnalysis = runHeavyAudioFeatureAnalysis,
    buildFastSignalAnalysisResult = buildFastSignalPatchedAudioFeatureAnalysisResult,
    composeFeatureFrame = composeAudioFeatureFrame,
  } = {},
) {
  const {
    lastLiveFrameRef,
    lastActiveFrameRef,
    lastIdleFrameRef,
    analysisSchedulerRef,
  } = renderLoopRefs.frameCacheRefs;
  const pausedFileHoldFrame = readPausedFileHoldFrame({
    frameCacheRefs: renderLoopRefs.frameCacheRefs,
    status,
    clockMode,
  });

  const shouldReuseStaticIdleFrame =
    !pausedFileHoldFrame &&
    shouldReuseIdleFrame(status, controls) &&
    lastIdleFrameRef.current;

  let featureFrame = null;
  let frameSemanticSource = pausedFileHoldFrame
    ? "paused-file-hold"
    : shouldReuseStaticIdleFrame
      ? "static-idle-cache"
      : null;
  if (pausedFileHoldFrame) {
    featureFrame = pausedFileHoldFrame;
  } else if (!shouldReuseStaticIdleFrame) {
    const buildFeatureFrameStartedAt = getRenderLoopWallTimeMs();
    const analysisSnapshotStartedAt = getRenderLoopWallTimeMs();
    const analysisSnapshot = audio.readAnalysisSnapshot();
    recordRuntimePerfSample(
      runtimeDiagnostics,
      "readAnalysisSnapshotMs",
      getRenderLoopWallTimeMs() - analysisSnapshotStartedAt,
    );

    maybeCaptureReplayFrame({
      analysisSnapshot,
      status,
      frameTimeMs: time * 1000,
    });

    const shouldUseDirectFeatureBuildPath =
      !featureEngine?.enqueueTransportFrame &&
      buildFeatureFrame !== buildAudioFeatureFrame &&
      prepareFeatureFrame === prepareAudioFeatureFrameInputs &&
      runHeavyFeatureAnalysis === runHeavyAudioFeatureAnalysis &&
      composeFeatureFrame === composeAudioFeatureFrame;

    if (shouldUseDirectFeatureBuildPath) {
      featureFrame = buildFeatureFrame({
        analysisSnapshot,
        featureState,
        radius: runtimeState.uniforms.uRadius.value,
        cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
        boundaryMode: controls.boundaryMode,
        cavityGeometry: controls.cavityGeometry,
        status,
        frameTimeMs: time * 1000,
        includeSpectralLight: spectralLightEnabled,
      });
      frameSemanticSource = "direct-feature-build";
    } else {
      const preparedInputs = prepareFeatureFrame({
        analysisSnapshot,
        featureState,
        radius: runtimeState.uniforms.uRadius.value,
        cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
        boundaryMode: controls.boundaryMode,
        cavityGeometry: controls.cavityGeometry,
        status,
        frameTimeMs: time * 1000,
        includeSpectralLight: spectralLightEnabled,
      });

      if (preparedInputs.silentFeatureFrame) {
        featureFrame = preparedInputs.silentFeatureFrame;
        frameSemanticSource = "silent-frame";
        featureEngine?.reset?.("silent-frame");
        resetAnalysisSchedulerState(analysisSchedulerRef);
      } else {
        if (featureEngine?.enqueueTransportFrame) {
          const schedulerState =
            getAnalysisSchedulerState(analysisSchedulerRef);
          const engineEnqueueStartedAt = getRenderLoopWallTimeMs();
          const transportFrame = buildAudioFeatureTransportFrame({
            analysisSnapshot,
            status: {
              ...status,
              capacity: featureState?.capacity ?? null,
            },
            frameTimeMs: preparedInputs.currentFrameAtMs,
            radius: runtimeState.uniforms.uRadius.value,
            cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
            boundaryMode: controls.boundaryMode,
            cavityGeometry: controls.cavityGeometry,
            includeSpectralLight: spectralLightEnabled,
            auditSettings: featureState?.audit?.settings ?? null,
          });
          featureEngine.enqueueTransportFrame(transportFrame);
          recordRuntimePerfSample(
            runtimeDiagnostics,
            "engineEnqueueMs",
            getRenderLoopWallTimeMs() - engineEnqueueStartedAt,
          );

          const readEngineSnapshotStartedAt = getRenderLoopWallTimeMs();
          const engineSnapshot = featureEngine.readLatestSnapshot({
            frameTimeMs: preparedInputs.currentFrameAtMs,
          });
          recordRuntimePerfSample(
            runtimeDiagnostics,
            "readEngineSnapshotMs",
            getRenderLoopWallTimeMs() - readEngineSnapshotStartedAt,
          );

          const engineStatus = featureEngine.getStatus?.() ?? null;
          if (runtimeDiagnostics?.engine) {
            runtimeDiagnostics.engine.snapshotAgeMs =
              engineStatus?.latestSnapshotAgeMs ?? 0;
            runtimeDiagnostics.engine.publishCount =
              engineStatus?.publishCount ?? 0;
            runtimeDiagnostics.engine.droppedFrameCount =
              engineStatus?.droppedFrameCount ?? 0;
            runtimeDiagnostics.engine.transportDropCount =
              engineStatus?.transportDropCount ??
              engineStatus?.droppedFrameCount ??
              0;
            runtimeDiagnostics.engine.publishSkipCount =
              engineStatus?.publishSkipCount ?? 0;
            runtimeDiagnostics.engine.fastSignalPatchCount =
              engineStatus?.fastSignalPatchCount ?? 0;
            runtimeDiagnostics.engine.fastSignalUpdateCount =
              engineStatus?.fastSignalUpdateCount ?? 0;
            runtimeDiagnostics.engine.structuralUpdateCount =
              engineStatus?.structuralUpdateCount ?? 0;
            runtimeDiagnostics.engine.chromaUpdateCount =
              engineStatus?.chromaUpdateCount ?? 0;
            runtimeDiagnostics.engine.tempoUpdateCount =
              engineStatus?.tempoUpdateCount ?? 0;
            runtimeDiagnostics.engine.latestProcessedFrameId =
              engineStatus?.latestProcessedFrameId ?? 0;
            runtimeDiagnostics.engine.latestPublishedFrameId =
              engineStatus?.latestPublishedFrameId ?? 0;
            Object.assign(
              runtimeDiagnostics.engine,
              snapshotWorkerPerfCounters(engineStatus),
            );
            runtimeDiagnostics.engine.queueDepth =
              engineStatus?.queueDepth ?? 0;
            runtimeDiagnostics.engine.state = engineStatus?.state ?? "none";
            runtimeDiagnostics.engine.reason = engineStatus?.reason ?? null;
          }

          const workerSnapshotMatches = snapshotMatchesPreparedInputs(
            engineSnapshot,
            preparedInputs,
          );
          const shouldRefreshProgramSnapshot =
            workerSnapshotMatches &&
            shouldRefreshStaleProgramSnapshot({
              engineSnapshot,
              preparedInputs,
              status,
            });
          const shouldRefreshSpectralLightWorkerSnapshot =
            workerSnapshotMatches &&
            shouldRebuildEmptySpectralLaneSnapshot({
              spectralLightEnabled,
              engineSnapshot,
              preparedInputs,
              status,
              controls,
            });

          if (
            workerSnapshotMatches &&
            !shouldRefreshProgramSnapshot &&
            !shouldRefreshSpectralLightWorkerSnapshot
          ) {
            const fastComposeStartedAt = getRenderLoopWallTimeMs();
            const snapshotFrameTimeMs = engineSnapshot?.frameTimeMs;
            const shouldPatchCurrentFastSignals =
              Number.isFinite(snapshotFrameTimeMs) &&
              Number.isFinite(preparedInputs.currentFrameAtMs) &&
              snapshotFrameTimeMs < preparedInputs.currentFrameAtMs;
            const analysisResult = shouldPatchCurrentFastSignals
              ? buildFastSignalAnalysisResult({
                  preparedInputs,
                  previousAnalysisResult: engineSnapshot.analysisResult,
                })
              : engineSnapshot.analysisResult;
            featureFrame = composeFeatureFrame({
              preparedInputs,
              analysisResult,
              previousFrame: lastLiveFrameRef.current,
              reuseHeavyAnalysis: true,
            });
            frameSemanticSource = shouldPatchCurrentFastSignals
              ? "worker-fast-signal"
              : "worker-snapshot";
            recordRuntimePerfSample(
              runtimeDiagnostics,
              "fastComposeMs",
              getRenderLoopWallTimeMs() - fastComposeStartedAt,
            );
          } else {
            const shouldComposeInactiveSource =
              shouldComposeInactiveSourceFeatureFrame({
                status,
                controls,
                preparedInputs,
              });
            const shouldSeedLiveWarmup = shouldSeedLiveInputWarmupFrame({
              status,
              lastLiveFrame: lastLiveFrameRef.current,
              lastActiveFrame: lastActiveFrameRef.current,
            });
            const shouldBootstrapActive = shouldBootstrapActiveFeatureFrame({
              status,
              controls,
              lastLiveFrame: lastLiveFrameRef.current,
              lastActiveFrame: lastActiveFrameRef.current,
            });
            const shouldRefreshSpectralLight =
              shouldRefreshSpectralLightFeatureFrame({
                spectralLightEnabled,
                status,
                controls,
                lastLiveFrame: lastLiveFrameRef.current,
              }) || shouldRefreshSpectralLightWorkerSnapshot;

            if (
              shouldRefreshProgramSnapshot ||
              shouldComposeInactiveSource ||
              shouldSeedLiveWarmup ||
              shouldBootstrapActive ||
              shouldRefreshSpectralLight
            ) {
              const heavyAnalysisStartedAt = getRenderLoopWallTimeMs();
              const analysisResult = runHeavyFeatureAnalysis(preparedInputs);
              recordRuntimePerfSample(
                runtimeDiagnostics,
                "heavyAnalysisMs",
                getRenderLoopWallTimeMs() - heavyAnalysisStartedAt,
              );

              const fastComposeStartedAt = getRenderLoopWallTimeMs();
              featureFrame = composeFeatureFrame({
                preparedInputs,
                analysisResult,
                previousFrame: schedulerState.lastComposedFeatureFrame,
                reuseHeavyAnalysis: false,
              });
              if (shouldRefreshProgramSnapshot) {
                frameSemanticSource = "local-heavy-analysis";
              } else if (shouldSeedLiveWarmup) {
                frameSemanticSource = "live-warmup";
              } else if (shouldBootstrapActive) {
                frameSemanticSource = "bootstrap-fallback";
              } else {
                frameSemanticSource = "local-heavy-analysis";
              }
              recordRuntimePerfSample(
                runtimeDiagnostics,
                "fastComposeMs",
                getRenderLoopWallTimeMs() - fastComposeStartedAt,
              );

              storeComposedAnalysisResult(
                analysisSchedulerRef,
                preparedInputs,
                analysisResult,
                featureFrame,
              );
              if (runtimeDiagnostics?.analysisScheduler) {
                runtimeDiagnostics.analysisScheduler.forcedAnalysisCount += 1;
              }
            } else {
              const hasSourceIntent = hasAudioSourceRenderIntent({
                status,
                controls,
              });
              const cachedLiveFrame = resolveCachedLiveFeatureFrame(
                lastLiveFrameRef.current,
                preparedInputs.silentFeatureFrame,
              );
              // hasAudioSourceRenderIntent guards cached live-frame fallback.
              featureFrame = hasSourceIntent
                ? cachedLiveFrame
                : preparedInputs.silentFeatureFrame;
              frameSemanticSource =
                hasSourceIntent && cachedLiveFrame === lastLiveFrameRef.current
                  ? "last-live-cache"
                  : "silent-frame";
              if (
                hasSourceIntent &&
                lastLiveFrameRef.current &&
                cachedLiveFrame !== lastLiveFrameRef.current
              ) {
                lastLiveFrameRef.current = null;
              }
            }
          }
        } else {
          const schedulerState =
            getAnalysisSchedulerState(analysisSchedulerRef);
          const { shouldRun, forced, analysisAgeMs } =
            shouldRunHeavyFeatureAnalysis({
              schedulerState,
              preparedInputs,
              frameTimeMs: preparedInputs.currentFrameAtMs,
              runtimeDiagnostics,
            });

          if (runtimeDiagnostics?.analysisScheduler) {
            runtimeDiagnostics.analysisScheduler.analysisAgeMs =
              Number.isFinite(analysisAgeMs) ? analysisAgeMs : 0;
          }

          if (shouldRun) {
            const heavyAnalysisStartedAt = getRenderLoopWallTimeMs();
            const analysisResult = runHeavyFeatureAnalysis(preparedInputs);
            recordRuntimePerfSample(
              runtimeDiagnostics,
              "heavyAnalysisMs",
              getRenderLoopWallTimeMs() - heavyAnalysisStartedAt,
            );

            const fastComposeStartedAt = getRenderLoopWallTimeMs();
            featureFrame = composeFeatureFrame({
              preparedInputs,
              analysisResult,
              previousFrame: schedulerState.lastComposedFeatureFrame,
              reuseHeavyAnalysis: false,
            });
            frameSemanticSource = "local-heavy-analysis";
            recordRuntimePerfSample(
              runtimeDiagnostics,
              "fastComposeMs",
              getRenderLoopWallTimeMs() - fastComposeStartedAt,
            );

            storeComposedAnalysisResult(
              analysisSchedulerRef,
              preparedInputs,
              analysisResult,
              featureFrame,
            );
            if (runtimeDiagnostics?.analysisScheduler && forced) {
              runtimeDiagnostics.analysisScheduler.forcedAnalysisCount += 1;
            }
          } else {
            const fastComposeStartedAt = getRenderLoopWallTimeMs();
            featureFrame = composeFeatureFrame({
              preparedInputs,
              analysisResult: schedulerState.lastHeavyAnalysisResult,
              previousFrame: schedulerState.lastComposedFeatureFrame,
              reuseHeavyAnalysis: true,
            });
            frameSemanticSource = "scheduled-reuse";
            recordRuntimePerfSample(
              runtimeDiagnostics,
              "fastComposeMs",
              getRenderLoopWallTimeMs() - fastComposeStartedAt,
            );

            if (analysisSchedulerRef?.current) {
              analysisSchedulerRef.current = {
                ...schedulerState,
                lastComposedFeatureFrame: featureFrame,
              };
            }
            if (runtimeDiagnostics?.analysisScheduler) {
              runtimeDiagnostics.analysisScheduler.analysisReuseCount += 1;
              runtimeDiagnostics.analysisScheduler.skippedAnalysisCount += 1;
            }
          }
        }
      }
    }

    recordRuntimePerfSample(
      runtimeDiagnostics,
      "buildFeatureFrameMs",
      getRenderLoopWallTimeMs() - buildFeatureFrameStartedAt,
    );

    if (shouldReuseIdleFrame(status, controls)) {
      lastIdleFrameRef.current = featureFrame;
    } else {
      lastIdleFrameRef.current = null;
    }
  } else if (shouldReuseStaticIdleFrame) {
    featureFrame = lastIdleFrameRef.current;
  }

  recordFrameSemanticSource(runtimeDiagnostics, frameSemanticSource);

  if (status.isPlaying || status.isLiveInputActive) {
    if (isActiveFilePlayback(status)) {
      refreshPausedFileHoldFrame({
        frameCacheRefs: renderLoopRefs.frameCacheRefs,
        status,
        featureFrame,
      });
    } else {
      clearPausedFileHoldFrame(renderLoopRefs.frameCacheRefs);
    }

    if (shouldCaptureLastLiveFrame({ featureFrame })) {
      lastLiveFrameRef.current = featureFrame;
    } else if (!allowsCurrentLiveRenderFrame(featureFrame)) {
      lastLiveFrameRef.current = null;
    }
    lastActiveFrameRef.current = null;
    lastIdleFrameRef.current = null;
  } else {
    if (status.lastLiveInputInterruption) {
      clearFrameCache(renderLoopRefs.frameCacheRefs);
      resetInterruptedLiveInputVisualResponse(runtimeState);
      if (!controls.injectTestTone) {
        featureEngine?.reset?.("live-input-interrupted");
      }
    } else {
      if (frameSemanticSource !== "paused-file-hold") {
        clearPausedFileHoldFrame(renderLoopRefs.frameCacheRefs);
      }
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
      if (!controls.injectTestTone && clockMode !== "paused-playback") {
        featureEngine?.reset?.("idle");
      }
      if (clockMode !== "paused-playback") {
        resetAnalysisSchedulerState(analysisSchedulerRef);
      }
    }
  }

  const effectiveFrame = featureFrame;

  return {
    featureFrame,
    effectiveFrame,
  };
}

export function applyReactiveBloomState({
  controls,
  runtimeState,
  postNodesRef,
  bloom,
}) {
  if (!bloom) {
    return bloom;
  }

  const bt = runtimeState?.bloomTuning;
  const performanceGovernor = runtimeState?.performanceGovernor;
  const strength = bt?.effectiveStrength ?? bloom.strength;
  const radius = bt?.effectiveRadius ?? bloom.radius;
  const threshold = bt?.effectiveThreshold ?? bloom.threshold;
  const bloomAllowed =
    (bt?.bloomAllowed ?? true) && (performanceGovernor?.bloomAllowed ?? true);

  const bloomActive = controls.bloomEnabled && bloomAllowed && strength > 1e-4;
  syncRenderOutputBloomPassUniforms(postNodesRef.current, {
    strength,
    radius,
    threshold: bloomActive ? threshold : 999,
  });

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
    featureState,
    lowLoadActive,
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
      featureState,
      lowLoadActive,
      runtimeDiagnostics,
    },
    {
      snapshotDiagnostics,
      logAudit,
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
