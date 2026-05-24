import {
  applyAuditControls,
  applyBloomControls,
  applyEffectiveRaymarchStepBudget,
  applyOutputControls,
  applySharedControls,
  applyVisualizationControls,
  buildControlInspectionSnapshot,
} from "@baryon/visualizer/controls/runtime";
import {
  buildAudioFeatureTransportFrame,
  buildAudioFeatureFrame,
  composeAudioFeatureFrame,
  prepareAudioFeatureFrameInputs,
  runHeavyAudioFeatureAnalysis,
} from "@baryon/visualizer/audio-features";
import { CAVITY_ACOUSTIC_DEFAULTS } from "@baryon/visualizer/defaults";
import * as raymarchPerformanceGovernor from "@baryon/visualizer/core/raymarch/performanceGovernor";
import {
  CUSTOM_TARGET_FPS_BANDS,
  DEFAULT_PERFORMANCE_TARGET_FPS,
  normalizePerformanceTargetFps,
  PERFORMANCE_PROFILES,
  RENDER_CONTEXTS,
  resolveCustomTargetFpsBand,
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
} from "./baryonVisualizerRuntimeState.js";
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
const AUTO_RAYMARCH_DECISION_WINDOW_SECONDS = 0.5;
const AUTO_RAYMARCH_MIN_DECISION_WINDOW_FRAMES = 12;
const AUTO_RAYMARCH_MAX_DECISION_WINDOW_FRAMES = 45;
const AUTO_RAYMARCH_RECOVERY_WINDOWS = 4;
const AUTO_RAYMARCH_STEP_DOWN_LONG_FRAME_RATIO = 0.1;
const AUTO_RAYMARCH_PRESSURE_SAFETY_MARGIN = 0.94;
const AUTO_RAYMARCH_SCALE_PRESSURE_SAFETY_MARGIN = 0.985;
const AUTO_RAYMARCH_PRESSURE_FRAME_TIME_RATIO = 1.08;
const AUTO_RAYMARCH_SCALE_PRESSURE_FRAME_TIME_RATIO = 1.015;
const AUTO_RAYMARCH_STABLE_FRAME_TIME_RATIO = 0.93;
const AUTO_RAYMARCH_LONG_FRAME_TIME_RATIO = 1.5;
const AUTO_RAYMARCH_RECOVERY_MIN_ENERGY_SIGNAL = 0.08;
const AUTO_RAYMARCH_STEP_LADDER = Object.freeze([
  16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192,
]);
const AUTO_RAYMARCH_RENDER_SCALE_LADDER = Object.freeze([
  0.67, 0.75, 0.84, 0.92, 1,
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
    workerFastSignalMs: runtimeDiagnostics?.engine?.workerFastSignalMs ?? 0,
    workerStructuralMs: runtimeDiagnostics?.engine?.workerStructuralMs ?? 0,
    workerPeakScanMs: runtimeDiagnostics?.engine?.workerPeakScanMs ?? 0,
    workerModalResolveMs: runtimeDiagnostics?.engine?.workerModalResolveMs ?? 0,
    workerProjectionMs: runtimeDiagnostics?.engine?.workerProjectionMs ?? 0,
    workerChromaMs: runtimeDiagnostics?.engine?.workerChromaMs ?? 0,
    workerTempoMs: runtimeDiagnostics?.engine?.workerTempoMs ?? 0,
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

  modalFreshness.frameTimeMs = readFiniteNumber(featureFrame.frameTimeMs);
  modalFreshness.sourceMode = featureFrame.sourceMode ?? null;
  modalFreshness.fieldState =
    featureFrame.debug?.fieldState ?? featureFrame.fieldState ?? "idle";
  modalFreshness.structuralSnapshotAgeMs = readFiniteNumber(
    runtimeDiagnostics?.engine?.snapshotAgeMs,
  );
  modalFreshness.lastUpdatedAtWallTimeMs = readFiniteNumber(getWallTimeMs());
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
  modalFreshness.modalResponseBackboneEnergy = readFiniteNumber(
    featureFrame.modalResponseBackboneEnergy ??
      featureFrame.debug?.modalResponseBackboneEnergy,
  );
  modalFreshness.modalResponseDetailEnergy = readFiniteNumber(
    featureFrame.modalResponseDetailEnergy ??
      featureFrame.debug?.modalResponseDetailEnergy,
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
  modalFreshness.activeBackboneModeCount = readFiniteNumber(
    featureFrame.activeBackboneModeCount,
  );
  modalFreshness.activeDetailModeCount = readFiniteNumber(
    featureFrame.activeDetailModeCount,
  );
  modalFreshness.activeModeCount = readFiniteNumber(
    featureFrame.activeModeCount,
    modalFreshness.activeBackboneModeCount +
      modalFreshness.activeDetailModeCount,
  );
  applySlotTurnoverDiagnostics(modalFreshness, {
    fieldPrefix: "modeSlot",
    previousField: "_previousModeSlots",
    nextSlots: featureFrame.modeSlots,
  });
  applySlotTurnoverDiagnostics(modalFreshness, {
    fieldPrefix: "backboneSlot",
    previousField: "_previousBackboneSlots",
    nextSlots: featureFrame.backboneSlots,
  });
  applySlotTurnoverDiagnostics(modalFreshness, {
    fieldPrefix: "detailSlot",
    previousField: "_previousDetailSlots",
    nextSlots: featureFrame.detailSlots,
  });
  modalFreshness.detailSignalAuthoritative = Boolean(
    featureFrame.debug?.detailSignalAuthoritative,
  );
  modalFreshness.detailSignalAuthoritativeReason =
    featureFrame.debug?.detailSignalAuthoritativeReason ?? "none";
  modalFreshness.detailSignalAuthoritativeCoverage = Boolean(
    featureFrame.debug?.detailSignalAuthoritativeCoverage,
  );
  modalFreshness.detailSignalAuthoritativeFreshSignal = Boolean(
    featureFrame.debug?.detailSignalAuthoritativeFreshSignal,
  );
  modalFreshness.detailSignalAuthoritativeFastAssist = Boolean(
    featureFrame.debug?.detailSignalAuthoritativeFastAssist,
  );
  modalFreshness.detailSignalAuthoritativeHighQ = Boolean(
    featureFrame.debug?.detailSignalAuthoritativeHighQ,
  );
  modalFreshness.detailShiftReleaseOverrideCount = readFiniteNumber(
    featureFrame.debug?.detailShiftReleaseOverrideCount,
  );
  modalFreshness.detailShiftTrackingOverrideCount = readFiniteNumber(
    featureFrame.debug?.detailShiftTrackingOverrideCount,
  );
  modalFreshness.highQDetailModeCount = readFiniteNumber(
    featureFrame.debug?.highQDetailModeCount,
  );
  modalFreshness.highQDetailEnergy = readFiniteNumber(
    featureFrame.debug?.highQDetailEnergy,
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

function classifyFrameSemanticSource(source) {
  switch (source) {
    case "worker-snapshot":
    case "local-heavy-analysis":
    case "live-warmup":
    case "bootstrap-fallback":
    case "legacy-build":
      return { fresh: true, reused: false };
    case "scheduled-reuse":
    case "last-live-cache":
    case "static-idle-cache":
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

function isNonIdleFeatureFrame(featureFrame) {
  return (featureFrame?.fieldState ?? "idle") !== "idle";
}

function shouldSeedLiveInputWarmupFrame({
  status,
  lastLiveFrame,
  lastActiveFrame,
}) {
  return (
    status?.isLiveInputActive === true &&
    !isNonIdleFeatureFrame(lastLiveFrame) &&
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
    !isNonIdleFeatureFrame(lastLiveFrame) &&
    !isNonIdleFeatureFrame(lastActiveFrame)
  );
}

function hasAudioSourceRenderIntent({ status, controls }) {
  return Boolean(
    status?.isPlaying || status?.isLiveInputActive || controls?.injectTestTone,
  );
}

function shouldComposeInactiveSourceFeatureFrame({
  status,
  controls,
  preparedInputs,
}) {
  return (
    preparedInputs?.snapshot != null &&
    !hasAudioSourceRenderIntent({ status, controls })
  );
}

function shouldCaptureLastLiveFrame({ status, featureFrame }) {
  return (
    status?.isPlaying === true ||
    status?.isLiveInputActive !== true ||
    isNonIdleFeatureFrame(featureFrame)
  );
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
    modalFreshness: snapshotModalFreshnessDiagnostics(
      runtimeDiagnostics?.modalFreshness,
    ),
  };
}

function normalizeAdaptiveRenderScale(renderScale) {
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
    AUTO_RAYMARCH_MAX_DECISION_WINDOW_FRAMES,
    Math.max(
      AUTO_RAYMARCH_MIN_DECISION_WINDOW_FRAMES,
      Math.round(normalizedTargetFps * AUTO_RAYMARCH_DECISION_WINDOW_SECONDS),
    ),
  );

  return {
    targetFps: normalizedTargetFps,
    targetFrameTimeMs,
    pressureFrameTimeMs:
      targetFrameTimeMs * AUTO_RAYMARCH_PRESSURE_FRAME_TIME_RATIO,
    scalePressureFrameTimeMs:
      targetFrameTimeMs * AUTO_RAYMARCH_SCALE_PRESSURE_FRAME_TIME_RATIO,
    stableFrameTimeMs:
      targetFrameTimeMs * AUTO_RAYMARCH_STABLE_FRAME_TIME_RATIO,
    decisionFrameCount,
    longFrameThresholdMs:
      targetFrameTimeMs * AUTO_RAYMARCH_LONG_FRAME_TIME_RATIO,
    stepDownLongFrameCount: Math.max(
      1,
      Math.round(decisionFrameCount * AUTO_RAYMARCH_STEP_DOWN_LONG_FRAME_RATIO),
    ),
  };
}

export function getEffectiveAdaptiveRenderScale(
  runtimeDiagnostics,
  requestedRenderScale = 1,
) {
  const normalizedRequestedRenderScale =
    normalizeAdaptiveRenderScale(requestedRenderScale);
  const effectiveRenderScale =
    runtimeDiagnostics?.adaptiveRaymarch?.adaptiveRaymarchActive &&
    Number.isFinite(runtimeDiagnostics?.adaptiveRaymarch?.effectiveRenderScale)
      ? runtimeDiagnostics.adaptiveRaymarch.effectiveRenderScale
      : normalizedRequestedRenderScale;

  return normalizeAdaptiveRenderScale(effectiveRenderScale);
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

  return Math.max(16, Math.round(requestedSteps || 0));
}

function buildAdaptiveRaymarchLadder(requestedStepBudget) {
  const normalizedRequestedStepBudget = normalizeRequestedRaymarchSteps(null, {
    raymarchSteps: requestedStepBudget,
  });
  const rungSet = new Set(
    AUTO_RAYMARCH_STEP_LADDER.filter(
      (stepBudget) => stepBudget < normalizedRequestedStepBudget,
    ),
  );
  rungSet.add(normalizedRequestedStepBudget);
  return Array.from(rungSet).sort((left, right) => left - right);
}

function buildAdaptiveRenderScaleLadder(requestedRenderScale) {
  const normalizedRequestedRenderScale =
    normalizeAdaptiveRenderScale(requestedRenderScale);
  const rungSet = new Set(
    AUTO_RAYMARCH_RENDER_SCALE_LADDER.filter(
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

function resolveAdaptiveStartInputs({
  renderProfile,
  requestedStepBudget,
  requestedRenderScale,
}) {
  const stepLadder = buildAdaptiveRaymarchLadder(requestedStepBudget);
  const scaleLadder = buildAdaptiveRenderScaleLadder(requestedRenderScale);
  const resolvedScaleRung = findAdaptiveLadderRungForValue(
    scaleLadder,
    normalizeAdaptiveRenderScale(
      renderProfile?.renderScale ?? requestedRenderScale,
    ),
  );

  if (renderProfile?.qualityPreset === PERFORMANCE_PROFILES.maxQuality) {
    return {
      startRung: getAdaptiveLadderMaxRung(stepLadder),
      startScaleRung: getAdaptiveLadderMaxRung(scaleLadder),
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
        startScaleRung: resolvedScaleRung,
      };
    }
    if (targetBand === CUSTOM_TARGET_FPS_BANDS.low) {
      return {
        startRung: findAdaptiveLadderRungForValue(stepLadder, 40),
        startScaleRung: resolvedScaleRung,
      };
    }
    if (targetBand === CUSTOM_TARGET_FPS_BANDS.high) {
      return {
        startRung: findAdaptiveLadderRungForValue(stepLadder, 24),
        startScaleRung: resolvedScaleRung,
      };
    }
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 16),
      startScaleRung: resolvedScaleRung,
    };
  }

  if (usesBalancedBaseline) {
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 40),
      startScaleRung: resolvedScaleRung,
    };
  }
  if (targetBand === CUSTOM_TARGET_FPS_BANDS.low) {
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 48),
      startScaleRung: resolvedScaleRung,
    };
  }
  if (targetBand === CUSTOM_TARGET_FPS_BANDS.high) {
    return {
      startRung: findAdaptiveLadderRungForValue(stepLadder, 32),
      startScaleRung: resolvedScaleRung,
    };
  }

  return {
    startRung: findAdaptiveLadderRungForValue(stepLadder, 24),
    startScaleRung: resolvedScaleRung,
  };
}

function resolveAdaptiveCurrentRung({
  currentRung,
  resumeRung,
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
  { preserveHistory = false, startRung = null, startScaleRung = null } = {},
) {
  const ladder = buildAdaptiveRaymarchLadder(requestedStepBudget);
  const scaleLadder = buildAdaptiveRenderScaleLadder(requestedRenderScale);
  const normalizedRequestedRenderScale =
    normalizeAdaptiveRenderScale(requestedRenderScale);
  adaptiveRaymarch.requestedRaymarchSteps = requestedStepBudget;
  adaptiveRaymarch.requestedRenderScale = normalizedRequestedRenderScale;
  const resolvedStartRung = Number.isFinite(startRung)
    ? clampAdaptiveLadderRung(startRung, ladder)
    : getAdaptiveLadderMaxRung(ladder);
  const resolvedStartScaleRung = Number.isFinite(startScaleRung)
    ? clampAdaptiveLadderRung(startScaleRung, scaleLadder)
    : getAdaptiveLadderMaxRung(scaleLadder);
  adaptiveRaymarch.currentRung = resolvedStartRung;
  adaptiveRaymarch.currentScaleRung = resolvedStartScaleRung;
  adaptiveRaymarch.effectiveRaymarchSteps = ladder[resolvedStartRung];
  adaptiveRaymarch.effectiveRenderScale = scaleLadder[resolvedStartScaleRung];
  adaptiveRaymarch.decisionFrameCount = 0;
  adaptiveRaymarch.longFrameCountInWindow = 0;
  adaptiveRaymarch.stableWindowCount = 0;
  adaptiveRaymarch.recoveryEligible = false;
  adaptiveRaymarch.recoveryBlockedReason = "none";
  if (!preserveHistory) {
    adaptiveRaymarch.stepDownCount = 0;
    adaptiveRaymarch.stepUpCount = 0;
    adaptiveRaymarch.scaleStepDownCount = 0;
    adaptiveRaymarch.scaleStepUpCount = 0;
  }
  return {
    ladder,
    scaleLadder,
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

function findAdaptiveRenderScaleRungAtOrBelow(scaleLadder, renderScale) {
  let rung = 0;
  for (let index = 0; index < scaleLadder.length; index += 1) {
    if (scaleLadder[index] <= renderScale + 1e-6) {
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
    AUTO_RAYMARCH_PRESSURE_SAFETY_MARGIN;
  const estimatedRung = findAdaptiveRaymarchRungAtOrBelow(
    ladder,
    estimatedBudget,
  );
  return Math.max(0, Math.min(currentRung - 1, estimatedRung));
}

function deriveAdaptivePressureScaleRung({
  scaleLadder,
  currentScaleRung,
  targetFrameTimeMs,
  smoothedFrameTimeMs,
}) {
  if (!(smoothedFrameTimeMs > 0)) {
    return Math.max(0, currentScaleRung - 1);
  }

  const currentRenderScale =
    scaleLadder[currentScaleRung] ?? scaleLadder[scaleLadder.length - 1] ?? 1;
  const estimatedRenderScale =
    currentRenderScale *
    Math.sqrt(targetFrameTimeMs / smoothedFrameTimeMs) *
    AUTO_RAYMARCH_SCALE_PRESSURE_SAFETY_MARGIN;
  const estimatedRung = findAdaptiveRenderScaleRungAtOrBelow(
    scaleLadder,
    estimatedRenderScale,
  );
  return Math.max(0, Math.min(currentScaleRung - 1, estimatedRung));
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
    const sourceMode = effectiveFrame?.sourceMode ?? null;
    const fieldState = effectiveFrame?.fieldState ?? "idle";
    const energySignal = effectiveFrame?.energySignal ?? 0;

    if (sessionTransition) {
      recoveryBlockedReason = "session-transition";
    } else if (sourceMode === "silent") {
      recoveryBlockedReason = "silent-source";
    } else if (fieldState !== "active") {
      recoveryBlockedReason = "inactive-field";
    } else if (!(energySignal >= AUTO_RAYMARCH_RECOVERY_MIN_ENERGY_SIGNAL)) {
      recoveryBlockedReason = "low-energy";
    }
  }

  return {
    recoveryEligible: recoveryBlockedReason === "none",
    recoveryBlockedReason,
    playbackSessionId,
    sessionTransition,
  };
}

function preparePendingRaymarchPerformanceGovernor(runtimeState, inputs) {
  if (!runtimeState || !inputs?.featureFrame || !inputs?.baseGovernor) {
    return null;
  }

  const governor =
    raymarchPerformanceGovernor.deriveRaymarchPerformanceGovernor({
      backbone: inputs.baseGovernor.backbone,
      detail: inputs.baseGovernor.detail,
      featureFrame: inputs.featureFrame,
      requestedStepBudget: inputs.requestedStepBudget,
      requestedRenderScale: inputs.requestedRenderScale,
    });

  runtimeState.pendingRaymarchPerformanceGovernor = {
    featureFrame: inputs.featureFrame,
    backboneCapacity: inputs.backboneCapacity,
    detailCapacity: inputs.detailCapacity,
    cavityGeometry: inputs.cavityGeometry,
    requestedStepBudget: inputs.requestedStepBudget,
    requestedRenderScale: inputs.requestedRenderScale,
    governor,
  };

  return governor;
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
  const requestedRenderScale = normalizeAdaptiveRenderScale(
    renderProfile?.renderScale ?? 1,
  );
  const backboneCapacity = raymarchPerformanceGovernor.inferLayerCapacity(
    runtimeState?.backboneCapacity,
    runtimeState?.backboneModeBuffer?.value?.array,
  );
  const detailCapacity = raymarchPerformanceGovernor.inferLayerCapacity(
    runtimeState?.detailCapacity,
    runtimeState?.detailModeBuffer?.value?.array,
  );
  const cavityGeometry =
    runtimeState?.effectiveCavityGeometry ??
    runtimeState?.volumeMesh?.userData?.raymarchCavityGeometry ??
    "rectangular";
  const performanceGovernor =
    raymarchPerformanceGovernor.buildRaymarchPerformanceGovernor({
      backboneSlots: effectiveFrame?.backboneSlots,
      detailSlots: effectiveFrame?.detailSlots,
      backboneCapacity,
      detailCapacity,
      featureFrame: effectiveFrame,
      requestedStepBudget,
      requestedRenderScale,
      cavityGeometry,
    });
  runtimeState.performanceGovernor = {
    ...runtimeState.performanceGovernor,
    ...performanceGovernor,
  };
  const governedStepBudget = Math.min(
    requestedStepBudget,
    performanceGovernor.proactiveStepBudget,
  );
  const governedRenderScale = Math.min(
    requestedRenderScale,
    performanceGovernor.proactiveRenderScale,
  );
  const adaptiveTuning = buildAdaptiveRaymarchTuning(
    resolveAdaptiveTargetFps(renderProfile, controls),
  );
  const adaptiveRaymarch = runtimeDiagnostics.adaptiveRaymarch;
  const activeModeCount =
    effectiveFrame?.activeModeCount ??
    (effectiveFrame?.activeBackboneModeCount ?? 0) +
      (effectiveFrame?.activeDetailModeCount ?? 0);
  adaptiveRaymarch.targetFps = adaptiveTuning.targetFps;
  adaptiveRaymarch.targetFrameTimeMs = adaptiveTuning.targetFrameTimeMs;

  const autoAdaptiveActive = Boolean(
    runtime?.method === "raymarch" &&
    (renderProfile?.qualityPreset === PERFORMANCE_PROFILES.auto ||
      renderProfile?.qualityPreset === PERFORMANCE_PROFILES.custom) &&
    (status?.isPlaying ||
      status?.isLiveInputActive ||
      controls?.injectTestTone) &&
    activeModeCount > 0,
  );

  let ladder = buildAdaptiveRaymarchLadder(governedStepBudget);
  let scaleLadder = buildAdaptiveRenderScaleLadder(governedRenderScale);
  const adaptiveStartInputs = resolveAdaptiveStartInputs({
    renderProfile,
    requestedStepBudget: governedStepBudget,
    requestedRenderScale: governedRenderScale,
  });
  const requestedChanged =
    adaptiveRaymarch.requestedRaymarchSteps !== governedStepBudget ||
    adaptiveRaymarch.requestedRenderScale !== governedRenderScale;
  if (requestedChanged) {
    ({ ladder, scaleLadder } = resetAdaptiveRaymarchState(
      adaptiveRaymarch,
      governedStepBudget,
      governedRenderScale,
      {
        startRung: Number.isFinite(runtimeState.autoRaymarchResumeRung)
          ? runtimeState.autoRaymarchResumeRung
          : adaptiveStartInputs.startRung,
        startScaleRung: Number.isFinite(
          runtimeState.autoRaymarchResumeScaleRung,
        )
          ? runtimeState.autoRaymarchResumeScaleRung
          : adaptiveStartInputs.startScaleRung,
      },
    ));
  }

  if (!autoAdaptiveActive) {
    runtimeState.autoRaymarchResumeRung = adaptiveRaymarch.currentRung;
    runtimeState.autoRaymarchResumeScaleRung =
      adaptiveRaymarch.currentScaleRung;
    adaptiveRaymarch.adaptiveRaymarchActive = false;
    ({ ladder, scaleLadder } = resetAdaptiveRaymarchState(
      adaptiveRaymarch,
      governedStepBudget,
      governedRenderScale,
    ));
    const effectiveStepBudget = ladder[ladder.length - 1];
    applyEffectiveRaymarchStepBudget(
      runtimeState,
      controls,
      effectiveStepBudget,
    );
    preparePendingRaymarchPerformanceGovernor(runtimeState, {
      featureFrame: effectiveFrame,
      backboneCapacity,
      detailCapacity,
      cavityGeometry,
      requestedStepBudget: effectiveStepBudget,
      requestedRenderScale: 1,
      baseGovernor: performanceGovernor,
    });
    return effectiveStepBudget;
  }

  const wasAdaptiveActive = adaptiveRaymarch.adaptiveRaymarchActive === true;
  adaptiveRaymarch.adaptiveRaymarchActive = true;
  adaptiveRaymarch.currentRung = resolveAdaptiveCurrentRung({
    currentRung: adaptiveRaymarch.currentRung,
    resumeRung: runtimeState.autoRaymarchResumeRung,
    ladder,
    reactivating: !wasAdaptiveActive,
  });
  adaptiveRaymarch.currentScaleRung = resolveAdaptiveCurrentRung({
    currentRung: adaptiveRaymarch.currentScaleRung,
    resumeRung: runtimeState.autoRaymarchResumeScaleRung,
    ladder: scaleLadder,
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
      const scaleUnderPressure =
        smoothedFrameTimeMs > adaptiveTuning.scalePressureFrameTimeMs ||
        adaptiveRaymarch.longFrameCountInWindow > 0;
      const stableWindow =
        smoothedFrameTimeMs > 0 &&
        smoothedFrameTimeMs < adaptiveTuning.stableFrameTimeMs &&
        adaptiveRaymarch.longFrameCountInWindow === 0;

      if (underPressure) {
        let handledPressure = false;

        if (scaleUnderPressure && adaptiveRaymarch.currentScaleRung > 0) {
          const nextPressureScaleRung = deriveAdaptivePressureScaleRung({
            scaleLadder,
            currentScaleRung: adaptiveRaymarch.currentScaleRung,
            targetFrameTimeMs: adaptiveTuning.targetFrameTimeMs,
            smoothedFrameTimeMs,
          });
          if (nextPressureScaleRung < adaptiveRaymarch.currentScaleRung) {
            adaptiveRaymarch.scaleStepDownCount +=
              adaptiveRaymarch.currentScaleRung - nextPressureScaleRung;
            adaptiveRaymarch.currentScaleRung = nextPressureScaleRung;
            handledPressure = true;
          }
        }

        if (!handledPressure && adaptiveRaymarch.currentRung > 0) {
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
          adaptiveRaymarch.stableWindowCount >= AUTO_RAYMARCH_RECOVERY_WINDOWS
        ) {
          if (adaptiveRaymarch.currentRung < ladder.length - 1) {
            adaptiveRaymarch.currentRung += 1;
            adaptiveRaymarch.stepUpCount += 1;
          } else if (
            adaptiveRaymarch.currentScaleRung <
            scaleLadder.length - 1
          ) {
            adaptiveRaymarch.currentScaleRung += 1;
            adaptiveRaymarch.scaleStepUpCount += 1;
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

  const effectiveStepBudget =
    ladder[clampAdaptiveLadderRung(adaptiveRaymarch.currentRung, ladder)];
  adaptiveRaymarch.effectiveRaymarchSteps = effectiveStepBudget;
  adaptiveRaymarch.effectiveRenderScale =
    scaleLadder[
      clampAdaptiveLadderRung(adaptiveRaymarch.currentScaleRung, scaleLadder)
    ];
  adaptiveRaymarch.complexityScore = performanceGovernor.complexityScore;
  adaptiveRaymarch.uploadedModeCount = performanceGovernor.uploadedModeCount;
  adaptiveRaymarch.originalModeCount = performanceGovernor.originalModeCount;
  adaptiveRaymarch.proactiveStepBudget =
    performanceGovernor.proactiveStepBudget;
  adaptiveRaymarch.proactiveRenderScale =
    performanceGovernor.proactiveRenderScale;
  adaptiveRaymarch.bloomAllowed = performanceGovernor.bloomAllowed;
  runtimeState.autoRaymarchResumeRung = adaptiveRaymarch.currentRung;
  runtimeState.autoRaymarchResumeScaleRung = adaptiveRaymarch.currentScaleRung;
  runtimeState.performanceGovernor = {
    ...runtimeState.performanceGovernor,
    effectiveRenderScale: adaptiveRaymarch.effectiveRenderScale,
    effectiveStepBudget,
  };
  applyEffectiveRaymarchStepBudget(runtimeState, controls, effectiveStepBudget);
  preparePendingRaymarchPerformanceGovernor(runtimeState, {
    featureFrame: effectiveFrame,
    backboneCapacity,
    detailCapacity,
    cavityGeometry,
    requestedStepBudget: effectiveStepBudget,
    requestedRenderScale: 1,
    baseGovernor: performanceGovernor,
  });
  return effectiveStepBudget;
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
    renderProfileRef,
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
        { ensurePipeline, postNodesRef, renderProfileRef },
        controls,
      ),
      visualization: appliers.applyVisualizationControls(
        runtime.method,
        runtimeState,
        controls,
      ),
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
    composeFeatureFrame = composeAudioFeatureFrame,
  } = {},
) {
  const {
    lastLiveFrameRef,
    lastActiveFrameRef,
    lastIdleFrameRef,
    analysisSchedulerRef,
  } = renderLoopRefs.frameCacheRefs;

  const shouldReuseStaticIdleFrame =
    shouldReuseIdleFrame(status, controls) && lastIdleFrameRef.current;

  let featureFrame = null;
  let frameSemanticSource = shouldReuseStaticIdleFrame
    ? "static-idle-cache"
    : null;
  if (!shouldReuseStaticIdleFrame) {
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

    const shouldUseLegacyBuildPath =
      !featureEngine?.enqueueTransportFrame &&
      buildFeatureFrame !== buildAudioFeatureFrame &&
      prepareFeatureFrame === prepareAudioFeatureFrameInputs &&
      runHeavyFeatureAnalysis === runHeavyAudioFeatureAnalysis &&
      composeFeatureFrame === composeAudioFeatureFrame;

    if (shouldUseLegacyBuildPath) {
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
      frameSemanticSource = "legacy-build";
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
            runtimeDiagnostics.engine.workerFastSignalMs =
              engineStatus?.workerFastSignalMs ?? 0;
            runtimeDiagnostics.engine.workerStructuralMs =
              engineStatus?.workerStructuralMs ?? 0;
            runtimeDiagnostics.engine.workerPeakScanMs =
              engineStatus?.workerPeakScanMs ?? 0;
            runtimeDiagnostics.engine.workerModalResolveMs =
              engineStatus?.workerModalResolveMs ?? 0;
            runtimeDiagnostics.engine.workerProjectionMs =
              engineStatus?.workerProjectionMs ?? 0;
            runtimeDiagnostics.engine.workerChromaMs =
              engineStatus?.workerChromaMs ?? 0;
            runtimeDiagnostics.engine.workerTempoMs =
              engineStatus?.workerTempoMs ?? 0;
            runtimeDiagnostics.engine.queueDepth =
              engineStatus?.queueDepth ?? 0;
            runtimeDiagnostics.engine.state = engineStatus?.state ?? "none";
            runtimeDiagnostics.engine.reason = engineStatus?.reason ?? null;
          }

          if (snapshotMatchesPreparedInputs(engineSnapshot, preparedInputs)) {
            const fastComposeStartedAt = getRenderLoopWallTimeMs();
            featureFrame = composeFeatureFrame({
              preparedInputs,
              analysisResult: engineSnapshot.analysisResult,
              previousFrame: lastLiveFrameRef.current,
              reuseHeavyAnalysis: true,
            });
            frameSemanticSource = "worker-snapshot";
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

            if (
              shouldComposeInactiveSource ||
              shouldSeedLiveWarmup ||
              shouldBootstrapActive
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
              frameSemanticSource = shouldSeedLiveWarmup
                ? "live-warmup"
                : shouldBootstrapActive
                  ? "bootstrap-fallback"
                  : "local-heavy-analysis";
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
              // hasAudioSourceRenderIntent guards cached live-frame fallback.
              featureFrame = hasSourceIntent
                ? (lastLiveFrameRef.current ??
                  preparedInputs.silentFeatureFrame)
                : preparedInputs.silentFeatureFrame;
              frameSemanticSource =
                hasSourceIntent && lastLiveFrameRef.current
                  ? "last-live-cache"
                  : "silent-frame";
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
    if (shouldCaptureLastLiveFrame({ status, featureFrame })) {
      lastLiveFrameRef.current = featureFrame;
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
  const bloomPass = postNodesRef.current?.bloomPass;
  if (!bloomPass || !bloom) {
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
