import {
  getRaymarchModalBasisCacheDescriptorStaleReason,
  isRaymarchModalBasisCacheReadyForDescriptor,
} from "@baryon/visualizer/core/raymarch/fieldCache";

const WORKER_PERF_COUNTER_BASES = Object.freeze([
  "FastSignal",
  "Structural",
  "PeakScan",
  "ModalResolve",
  "Projection",
  "Chroma",
  "Tempo",
]);
const WORKER_PERF_COUNTER_SUFFIXES = Object.freeze(["Ms", "LastMs", "MaxMs"]);
export const WORKER_PERF_COUNTER_KEYS = Object.freeze(
  WORKER_PERF_COUNTER_BASES.flatMap((base) =>
    WORKER_PERF_COUNTER_SUFFIXES.map((suffix) => `worker${base}${suffix}`),
  ),
);

export function snapshotWorkerPerfCounters(source) {
  const counters = {};
  for (const key of WORKER_PERF_COUNTER_KEYS) {
    counters[key] = source?.[key] ?? 0;
  }
  return counters;
}

function createRuntimePerfEntry() {
  return {
    averageMs: 0,
    lastMs: 0,
    maxMs: 0,
    sampleCount: 0,
  };
}

function createFrameDropCounters() {
  return {
    framesOver16_7Ms: 0,
    framesOver25Ms: 0,
    framesOver33_3Ms: 0,
    framesOver50Ms: 0,
    recentLongFramesMs: [],
  };
}

function createPostProcessDiagnostics() {
  return {
    traaNodeActive: false,
    bloomPassPresent: false,
    bloomComposeEnabled: false,
    temporalHistoryBlend: null,
    temporalHistoryGraphEnabled: null,
  };
}

function createRenderSurfaceDiagnostics() {
  return {
    cssWidth: 0,
    cssHeight: 0,
    backingWidth: 0,
    backingHeight: 0,
    backingMegapixels: 0,
    pixelRatio: 1,
  };
}

function createAdaptiveRaymarchDiagnostics() {
  return {
    adaptiveRaymarchActive: false,
    requestedRaymarchSteps: 0,
    effectiveRaymarchSteps: 0,
    requestedRenderScale: 1,
    effectiveRenderScale: 1,
    currentRung: 0,
    stepDownCount: 0,
    stepUpCount: 0,
    targetFps: 60,
    targetFrameTimeMs: 1000 / 60,
    decisionFrameCount: 0,
    longFrameCountInWindow: 0,
    stableWindowCount: 0,
    recoveryEligible: false,
    recoveryBlockedReason: "none",
    lastPlaybackSessionId: null,
  };
}

function createUiInteractionDiagnostics() {
  return {
    active: false,
    holdUntilWallTimeMs: 0,
    suppressedAdaptivePressureFrameCount: 0,
    lastSource: null,
    lastKind: null,
  };
}

function createModalFreshnessDiagnostics() {
  return {
    frameTimeMs: 0,
    sourceMode: null,
    sourceEvidence: null,
    fieldState: "idle",
    frameSemanticSource: null,
    frameSemanticFresh: false,
    frameSemanticReused: false,
    structuralSnapshotAgeMs: 0,
    featureFrameAgeAtRenderMs: 0,
    renderSubmittedAtMs: 0,
    lastUpdatedAtWallTimeMs: 0,
    avgAmplitude: 0,
    analyserRms: 0,
    periodicity: 0,
    liveInputNoiseGateActive: false,
    liveInputHardSilenceActive: false,
    structureSignal: 0,
    energySignal: 0,
    changeSignal: 0,
    pulseSignal: 0,
    modalVisibilityEnergy: 0,
    modalObserverVisibilityEnergy: 0,
    modalVisibilityRetainedHighQEnergy: 0,
    observationEnergy: 0,
    modalResponseEnergy: 0,
    modalResponseBudgetScale: 0,
    modalResponseRawEnergy: 0,
    modalResponseAverageDampingEnvelope: 0,
    modalResponseAverageCouplingStrength: 0,
    modalResponseAveragePhaseConfidence: 0,
    modalResponseAveragePersistence: 0,
    modalPhaseAuthority: 0,
    highQPhaseAuthority: 0,
    lowQPhaseAuthority: 0,
    modalPhaseCoherentFieldModeCount: 0,
    modeCoherence: 0,
    activeModeCount: 0,
    activeModalFieldModeCount: 0,
    modeSlotMeanAbsDelta: 0,
    modeSlotChangeCount: 0,
    modalFieldSlotMeanAbsDelta: 0,
    modalFieldSlotChangeCount: 0,
    resonantSignalAuthoritative: false,
    resonantSignalAuthoritativeReason: "none",
    resonantSignalAuthoritativeCoverage: false,
    resonantSignalAuthoritativeFreshSignal: false,
    resonantSignalAuthoritativeFastAssist: false,
    resonantSignalAuthoritativeHighQ: false,
    resonantShiftReleaseOverrideCount: 0,
    resonantShiftTrackingOverrideCount: 0,
    observedResonanceModeCount: 0,
    observedResonanceEnergy: 0,
    highQRingSupport: 0,
    responseEnvelope: 0,
    accentEnvelope: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    _previousModeSlots: null,
    _previousModalFieldSlots: null,
  };
}

function readFiniteDiagnosticNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function readDiagnosticString(value, fallback = null) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function snapshotRenderSurfaceDiagnostics(renderSurface) {
  if (!renderSurface) {
    return createRenderSurfaceDiagnostics();
  }

  const backingWidth = Math.round(
    readFiniteDiagnosticNumber(renderSurface.backingWidth),
  );
  const backingHeight = Math.round(
    readFiniteDiagnosticNumber(renderSurface.backingHeight),
  );
  const backingMegapixels =
    Number.isFinite(renderSurface.backingMegapixels) &&
    renderSurface.backingMegapixels >= 0
      ? Number(renderSurface.backingMegapixels)
      : (backingWidth * backingHeight) / 1_000_000;

  return {
    cssWidth: readFiniteDiagnosticNumber(renderSurface.cssWidth),
    cssHeight: readFiniteDiagnosticNumber(renderSurface.cssHeight),
    backingWidth,
    backingHeight,
    backingMegapixels,
    pixelRatio: readFiniteDiagnosticNumber(renderSurface.pixelRatio, 1),
  };
}

export function snapshotSourceEvidenceDiagnostics(sourceEvidence) {
  if (!sourceEvidence) {
    return null;
  }

  const metrics = sourceEvidence.metrics ?? {};
  const transport = sourceEvidence.transport ?? {};
  return {
    ownerVersion: readDiagnosticString(sourceEvidence.ownerVersion),
    sourceKind: readDiagnosticString(sourceEvidence.sourceKind, "none"),
    analysisClass: readDiagnosticString(sourceEvidence.analysisClass, "none"),
    sourceBoundaryState: readDiagnosticString(
      sourceEvidence.sourceBoundaryState,
      "absent",
    ),
    currentSourceEvidence: sourceEvidence.currentSourceEvidence === true,
    sourceEnergy: readFiniteDiagnosticNumber(sourceEvidence.sourceEnergy),
    metrics: {
      avgAmplitude: readFiniteDiagnosticNumber(metrics.avgAmplitude),
      analyserRms: readFiniteDiagnosticNumber(metrics.analyserRms),
      preModalFftPeak: readFiniteDiagnosticNumber(metrics.preModalFftPeak),
      nonZeroFftBinCount: Math.max(
        0,
        Math.floor(readFiniteDiagnosticNumber(metrics.nonZeroFftBinCount)),
      ),
    },
    transport: {
      playing: transport.playing === true,
      liveInputActive: transport.liveInputActive === true,
      fileMuted: transport.fileMuted === true,
      lineFeedProgramActive: transport.lineFeedProgramActive === true,
      micHardSilence: transport.micHardSilence === true,
    },
  };
}

function copyRecentLongFrames(recentLongFramesMs) {
  return Array.isArray(recentLongFramesMs) ? [...recentLongFramesMs] : [];
}

export function snapshotModalFreshnessDiagnostics(modalFreshness) {
  if (!modalFreshness) {
    return null;
  }

  return {
    frameTimeMs: modalFreshness.frameTimeMs ?? 0,
    sourceMode: modalFreshness.sourceMode ?? null,
    sourceEvidence: snapshotSourceEvidenceDiagnostics(
      modalFreshness.sourceEvidence,
    ),
    fieldState: modalFreshness.fieldState ?? "idle",
    frameSemanticSource: modalFreshness.frameSemanticSource ?? null,
    frameSemanticFresh: modalFreshness.frameSemanticFresh ?? false,
    frameSemanticReused: modalFreshness.frameSemanticReused ?? false,
    structuralSnapshotAgeMs: modalFreshness.structuralSnapshotAgeMs ?? 0,
    featureFrameAgeAtRenderMs: modalFreshness.featureFrameAgeAtRenderMs ?? 0,
    renderSubmittedAtMs: modalFreshness.renderSubmittedAtMs ?? 0,
    lastUpdatedAtWallTimeMs: modalFreshness.lastUpdatedAtWallTimeMs ?? 0,
    avgAmplitude: modalFreshness.avgAmplitude ?? 0,
    analyserRms: modalFreshness.analyserRms ?? 0,
    periodicity: modalFreshness.periodicity ?? 0,
    liveInputNoiseGateActive: modalFreshness.liveInputNoiseGateActive ?? false,
    liveInputHardSilenceActive:
      modalFreshness.liveInputHardSilenceActive ?? false,
    structureSignal: modalFreshness.structureSignal ?? 0,
    energySignal: modalFreshness.energySignal ?? 0,
    changeSignal: modalFreshness.changeSignal ?? 0,
    pulseSignal: modalFreshness.pulseSignal ?? 0,
    modalVisibilityEnergy: modalFreshness.modalVisibilityEnergy ?? 0,
    modalObserverVisibilityEnergy:
      modalFreshness.modalObserverVisibilityEnergy ?? 0,
    modalVisibilityRetainedHighQEnergy:
      modalFreshness.modalVisibilityRetainedHighQEnergy ?? 0,
    observationEnergy: modalFreshness.observationEnergy ?? 0,
    modalResponseEnergy: modalFreshness.modalResponseEnergy ?? 0,
    modalResponseBudgetScale: modalFreshness.modalResponseBudgetScale ?? 0,
    modalResponseRawEnergy: modalFreshness.modalResponseRawEnergy ?? 0,
    modalResponseAverageDampingEnvelope:
      modalFreshness.modalResponseAverageDampingEnvelope ?? 0,
    modalResponseAverageCouplingStrength:
      modalFreshness.modalResponseAverageCouplingStrength ?? 0,
    modalResponseAveragePhaseConfidence:
      modalFreshness.modalResponseAveragePhaseConfidence ?? 0,
    modalResponseAveragePersistence:
      modalFreshness.modalResponseAveragePersistence ?? 0,
    modalPhaseAuthority: modalFreshness.modalPhaseAuthority ?? 0,
    highQPhaseAuthority: modalFreshness.highQPhaseAuthority ?? 0,
    lowQPhaseAuthority: modalFreshness.lowQPhaseAuthority ?? 0,
    modalPhaseCoherentFieldModeCount:
      modalFreshness.modalPhaseCoherentFieldModeCount ?? 0,
    modeCoherence: modalFreshness.modeCoherence ?? 0,
    activeModeCount: modalFreshness.activeModeCount ?? 0,
    activeModalFieldModeCount:
      modalFreshness.activeModalFieldModeCount ??
      modalFreshness.activeModeCount ??
      0,
    modeSlotMeanAbsDelta: modalFreshness.modeSlotMeanAbsDelta ?? 0,
    modeSlotChangeCount: modalFreshness.modeSlotChangeCount ?? 0,
    modalFieldSlotMeanAbsDelta: modalFreshness.modalFieldSlotMeanAbsDelta ?? 0,
    modalFieldSlotChangeCount: modalFreshness.modalFieldSlotChangeCount ?? 0,
    resonantSignalAuthoritative:
      modalFreshness.resonantSignalAuthoritative ?? false,
    resonantSignalAuthoritativeReason:
      modalFreshness.resonantSignalAuthoritativeReason ?? "none",
    resonantSignalAuthoritativeCoverage:
      modalFreshness.resonantSignalAuthoritativeCoverage ?? false,
    resonantSignalAuthoritativeFreshSignal:
      modalFreshness.resonantSignalAuthoritativeFreshSignal ?? false,
    resonantSignalAuthoritativeFastAssist:
      modalFreshness.resonantSignalAuthoritativeFastAssist ?? false,
    resonantSignalAuthoritativeHighQ:
      modalFreshness.resonantSignalAuthoritativeHighQ ?? false,
    resonantShiftReleaseOverrideCount:
      modalFreshness.resonantShiftReleaseOverrideCount ?? 0,
    resonantShiftTrackingOverrideCount:
      modalFreshness.resonantShiftTrackingOverrideCount ?? 0,
    observedResonanceModeCount: modalFreshness.observedResonanceModeCount ?? 0,
    observedResonanceEnergy: modalFreshness.observedResonanceEnergy ?? 0,
    highQRingSupport: modalFreshness.highQRingSupport ?? 0,
    responseEnvelope: modalFreshness.responseEnvelope ?? 0,
    accentEnvelope: modalFreshness.accentEnvelope ?? 0,
    motionSignal: modalFreshness.motionSignal ?? 0,
    scaleSignal: modalFreshness.scaleSignal ?? 0,
    bloomResponseSignal: modalFreshness.bloomResponseSignal ?? 0,
  };
}

export function createEmptyAnalysisSchedulerState() {
  return {
    lastHeavyAnalysisAtMs: Number.NEGATIVE_INFINITY,
    lastHeavyAnalysisResult: null,
    lastComposedFeatureFrame: null,
    lastAnalysisSessionKey: null,
    lastAnalysisInputsSignature: null,
  };
}

function createRuntimePerfBreakdown() {
  return {
    readAnalysisSnapshotMs: createRuntimePerfEntry(),
    engineEnqueueMs: createRuntimePerfEntry(),
    readEngineSnapshotMs: createRuntimePerfEntry(),
    buildFeatureFrameMs: createRuntimePerfEntry(),
    heavyAnalysisMs: createRuntimePerfEntry(),
    fastComposeMs: createRuntimePerfEntry(),
    applyCachedControlSnapshotsMs: createRuntimePerfEntry(),
    syncLiveInputRuntimeStatusMs: createRuntimePerfEntry(),
    runtimeTickMs: createRuntimePerfEntry(),
    applyReactiveBloomMs: createRuntimePerfEntry(),
    applySceneControlsMs: createRuntimePerfEntry(),
    pipelineRenderMs: createRuntimePerfEntry(),
  };
}

export function clearFrameCache(frameCacheRefs) {
  frameCacheRefs.lastLiveFrameRef.current = null;
  frameCacheRefs.lastActiveFrameRef.current = null;
  frameCacheRefs.lastIdleFrameRef.current = null;
  if (frameCacheRefs.pausedFileFrameRef) {
    frameCacheRefs.pausedFileFrameRef.current = null;
  }
  if (frameCacheRefs.analysisSchedulerRef) {
    frameCacheRefs.analysisSchedulerRef.current =
      createEmptyAnalysisSchedulerState();
  }
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
  return (
    !status.isPlaying && !status.isLiveInputActive && !controls.injectTestTone
  );
}

const MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS = Object.freeze({
  modalBasisCacheActive: false,
  modalBasisCacheReady: false,
  modalBasisCacheSupportReady: false,
  modalBasisCacheSupportSemantic: "coefficient-invariant-basis-support",
  liveSynthesisUnsignedSupportMean: 0,
  liveSynthesisCancellationRatioMean: 0,
  liveSynthesisCancellationRatioMax: 0,
  liveSynthesisSupportDiagnosticSampleCount: 0,
  liveSynthesisSupportDiagnosticSupportedSampleCount: 0,
  liveSynthesisSupportDiagnosticCoverage: 0,
  modalBasisCacheRebuildPending: false,
  modalBasisCacheBackend: "compute",
  modalBasisCacheResolution: 0,
  modalBasisCacheRebuildCount: 0,
  modalBasisCacheRebuildReason: "uninitialized",
  modalBasisCacheGeneration: 0,
  modalBasisCacheAgeMs: null,
  liveModalFrameAgeMs: 0,
  modalBasisCacheDiagnosticReason: "uninitialized",
  modalBasisAtlasDepth: 0,
  liveSynthesisModeCount: 0,
  modalBasisCacheDescriptorFresh: false,
  modalBasisCacheDescriptorStaleReason: null,
  modalBasisCacheQueuedDescriptorPending: false,
  modalBasisCacheLastError: null,
  modalBasisCacheModeCount: 0,
  modalBasisCachePhaseAuthority: 0,
  modalBasisCacheModeIdentityRetentionRatio: 1,
  modalBasisCacheMaxRepresentableModeIndex: 0,
  modalBasisCacheContributingModeCount: 0,
  modalBasisCacheZeroAmplitudeSkippedModeCount: 0,
  modalBasisCacheContributingRawModalEnergy: 0,
  modalBasisCacheBandwidthRejectedModeCount: 0,
  modalBasisCacheBandwidthRejectedRawModalEnergy: 0,
  modalBasisCacheContributingStructuralModalEnergy: 0,
  modalBasisCacheBandwidthRejectedStructuralModalEnergy: 0,
  liveSynthesisResolvedRawModalEnergyRatio: 1,
  liveSynthesisResolvedStructuralModalEnergyRatio: 1,
  liveSynthesisRawGradientEnvelope: 0,
  liveSynthesisStructuralGradientEnvelope: 0,
  modalVarietyAudit: null,
});

export function createRuntimeDiagnostics() {
  return {
    activeFrameCount: 0,
    averageFrameTimeMs: 0,
    smoothedFrameTimeMs: 0,
    lastFrameTimeMs: 0,
    worstFrameTimeMs: 0,
    longFrameCount: 0,
    currentPixelRatio: 1,
    basePixelRatio: 1,
    lastLongFrame: null,
    lastVisibilityChange: null,
    rendererMode: null,
    lastRendererModeChange: null,
    lastPlaybackIssue: null,
    frameDrops: createFrameDropCounters(),
    perfBreakdown: createRuntimePerfBreakdown(),
    analysisScheduler: {
      analysisReuseCount: 0,
      analysisAgeMs: 0,
      forcedAnalysisCount: 0,
      skippedAnalysisCount: 0,
    },
    engine: {
      snapshotAgeMs: 0,
      publishCount: 0,
      droppedFrameCount: 0,
      transportDropCount: 0,
      publishSkipCount: 0,
      fastSignalPatchCount: 0,
      fastSignalUpdateCount: 0,
      structuralUpdateCount: 0,
      chromaUpdateCount: 0,
      tempoUpdateCount: 0,
      latestProcessedFrameId: 0,
      latestPublishedFrameId: 0,
      ...snapshotWorkerPerfCounters(null),
      queueDepth: 0,
      state: "none",
      reason: null,
    },
    render: {
      visualizationMethod: null,
      qualityPreset: null,
      renderScale: 1,
      requestedRenderScale: 1,
      traaEnabled: false,
      bloomAllowed: false,
      bloomEnabled: false,
      raymarchStepBudget: 0,
      requestedRaymarchSteps: 0,
      effectiveRaymarchSteps: 0,
      adaptiveRaymarchActive: false,
      adaptiveStepDownCount: 0,
      adaptiveStepUpCount: 0,
      targetFps: 60,
      targetFrameTimeMs: 1000 / 60,
      activeModeCount: 0,
      observationEnergy: 0,
      observationReferenceAnchor: 0,
      observationReferenceSupport: 0,
      observationReferenceDensityFloor: 0,
      observationReferenceContourSupport: 0,
      observationSampledAnchor: 0,
      observationSampledSignedAuthority: 0,
      observationSampledSupport: 0,
      observationSampledDensityFloor: 0,
      observationSampledContourSupport: 0,
      ...MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS,
    },
    modalFreshness: createModalFreshnessDiagnostics(),
    postProcess: createPostProcessDiagnostics(),
    renderSurface: createRenderSurfaceDiagnostics(),
    adaptiveRaymarch: createAdaptiveRaymarchDiagnostics(),
    uiInteraction: createUiInteractionDiagnostics(),
    perfLastPublishedAtMs: Number.NEGATIVE_INFINITY,
  };
}

export function initializeAdaptiveRaymarchRuntimeState(runtimeState) {
  if (!runtimeState || typeof runtimeState !== "object") {
    return runtimeState;
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      runtimeState,
      "autoRaymarchResumeRung",
    )
  ) {
    runtimeState.autoRaymarchResumeRung = null;
  }
  return runtimeState;
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function snapshotModalBasisCacheRenderDiagnostics(renderDiagnostics = null) {
  return Object.fromEntries(
    Object.entries(MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS).map(
      ([key, fallback]) => [
        key,
        key === "modalVarietyAudit"
          ? snapshotModalVarietyAudit(renderDiagnostics?.modalVarietyAudit)
          : (renderDiagnostics?.[key] ?? fallback),
      ],
    ),
  );
}

function snapshotModalVarietyAudit(modalVarietyAudit) {
  if (!modalVarietyAudit || typeof modalVarietyAudit !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(modalVarietyAudit).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((entry) =>
            entry && typeof entry === "object" ? { ...entry } : entry,
          )
        : value,
    ]),
  );
}

export function updateObservationTransferRenderDiagnostics(
  runtimeDiagnostics,
  debugSnapshot,
  runtimeState = null,
) {
  const renderDiagnostics = runtimeDiagnostics?.render;
  if (!renderDiagnostics) {
    return runtimeDiagnostics;
  }

  const raymarchDebug = debugSnapshot?.raymarchDebug ?? debugSnapshot ?? {};
  const modalBasisCache = runtimeState?.modalBasisCache ?? null;
  const modalBasisCacheDescriptor =
    runtimeState?.currentModalBasisCacheDescriptor ?? null;
  renderDiagnostics.observationEnergy = readFiniteNumber(
    raymarchDebug.observationEnergy,
  );
  renderDiagnostics.observationReferenceAnchor = readFiniteNumber(
    raymarchDebug.observationReferenceAnchor,
  );
  renderDiagnostics.observationReferenceSupport = readFiniteNumber(
    raymarchDebug.observationReferenceSupport,
  );
  renderDiagnostics.observationReferenceDensityFloor = readFiniteNumber(
    raymarchDebug.observationReferenceDensityFloor,
  );
  renderDiagnostics.observationReferenceContourSupport = readFiniteNumber(
    raymarchDebug.observationReferenceContourSupport,
  );
  renderDiagnostics.observationSampledAnchor = readFiniteNumber(
    raymarchDebug.observationSampledAnchor,
  );
  renderDiagnostics.observationSampledSignedAuthority = readFiniteNumber(
    raymarchDebug.observationSampledSignedAuthority,
  );
  renderDiagnostics.observationSampledSupport = readFiniteNumber(
    raymarchDebug.observationSampledSupport,
  );
  renderDiagnostics.observationSampledDensityFloor = readFiniteNumber(
    raymarchDebug.observationSampledDensityFloor,
  );
  renderDiagnostics.observationSampledContourSupport = readFiniteNumber(
    raymarchDebug.observationSampledContourSupport,
  );
  renderDiagnostics.modalBasisCacheActive = Boolean(
    raymarchDebug.modalBasisCacheActive ?? modalBasisCache?.active,
  );
  renderDiagnostics.modalBasisCacheReady = Boolean(
    raymarchDebug.modalBasisCacheReady ?? modalBasisCache?.ready,
  );
  renderDiagnostics.modalBasisCacheSupportReady = Boolean(
    raymarchDebug.modalBasisCacheSupportReady ?? modalBasisCache?.ready,
  );
  renderDiagnostics.modalBasisCacheSupportSemantic =
    raymarchDebug.modalBasisCacheSupportSemantic ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheSupportSemantic;
  renderDiagnostics.liveSynthesisUnsignedSupportMean = readFiniteNumber(
    raymarchDebug.liveSynthesisUnsignedSupportMean ??
      modalBasisCache?.liveSynthesisUnsignedSupportMean ??
      modalBasisCacheDescriptor?.liveSynthesisUnsignedSupportMean,
  );
  renderDiagnostics.liveSynthesisCancellationRatioMean = readFiniteNumber(
    raymarchDebug.liveSynthesisCancellationRatioMean ??
      modalBasisCache?.liveSynthesisCancellationRatioMean ??
      modalBasisCacheDescriptor?.liveSynthesisCancellationRatioMean,
  );
  renderDiagnostics.liveSynthesisCancellationRatioMax = readFiniteNumber(
    raymarchDebug.liveSynthesisCancellationRatioMax ??
      modalBasisCache?.liveSynthesisCancellationRatioMax ??
      modalBasisCacheDescriptor?.liveSynthesisCancellationRatioMax,
  );
  renderDiagnostics.liveSynthesisSupportDiagnosticSampleCount =
    readFiniteNumber(
      raymarchDebug.liveSynthesisSupportDiagnosticSampleCount ??
        modalBasisCache?.liveSynthesisSupportDiagnosticSampleCount ??
        modalBasisCacheDescriptor?.liveSynthesisSupportDiagnosticSampleCount,
    );
  renderDiagnostics.liveSynthesisSupportDiagnosticSupportedSampleCount =
    readFiniteNumber(
      raymarchDebug.liveSynthesisSupportDiagnosticSupportedSampleCount ??
        modalBasisCache?.liveSynthesisSupportDiagnosticSupportedSampleCount ??
        modalBasisCacheDescriptor?.liveSynthesisSupportDiagnosticSupportedSampleCount,
    );
  renderDiagnostics.liveSynthesisSupportDiagnosticCoverage = readFiniteNumber(
    raymarchDebug.liveSynthesisSupportDiagnosticCoverage ??
      modalBasisCache?.liveSynthesisSupportDiagnosticCoverage ??
      modalBasisCacheDescriptor?.liveSynthesisSupportDiagnosticCoverage,
  );
  renderDiagnostics.modalBasisCacheRebuildPending = Boolean(
    raymarchDebug.modalBasisCacheRebuildPending ??
    modalBasisCache?.rebuildPending,
  );
  renderDiagnostics.modalBasisCacheBackend =
    raymarchDebug.modalBasisCacheBackend ??
    modalBasisCache?.backend ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheBackend;
  renderDiagnostics.modalBasisCacheResolution = readFiniteNumber(
    raymarchDebug.modalBasisCacheResolution ?? modalBasisCache?.resolution,
  );
  renderDiagnostics.modalBasisCacheRebuildCount = readFiniteNumber(
    raymarchDebug.modalBasisCacheRebuildCount ?? modalBasisCache?.rebuildCount,
  );
  renderDiagnostics.modalBasisCacheRebuildReason =
    raymarchDebug.modalBasisCacheRebuildReason ??
    modalBasisCache?.lastRebuildReason ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheRebuildReason;
  const modalBasisCacheDescriptorFresh =
    typeof raymarchDebug.modalBasisCacheDescriptorFresh === "boolean"
      ? raymarchDebug.modalBasisCacheDescriptorFresh
      : isRaymarchModalBasisCacheReadyForDescriptor(
          modalBasisCache,
          modalBasisCacheDescriptor,
        );
  renderDiagnostics.modalBasisCacheDescriptorFresh =
    modalBasisCacheDescriptorFresh;
  const modalBasisCacheDescriptorStaleReason =
    getRaymarchModalBasisCacheDescriptorStaleReason({
      descriptorFresh: modalBasisCacheDescriptorFresh,
      reportedReason:
        raymarchDebug.modalBasisCacheDescriptorStaleReason ??
        modalBasisCache?.descriptorStaleReason,
      rebuildPending: modalBasisCache?.rebuildPending,
      queuedDescriptor: modalBasisCache?.queuedDescriptor,
      activeDescriptor: modalBasisCache?.activeDescriptor,
      nextDescriptor: modalBasisCacheDescriptor,
      hasDescriptorState: Boolean(modalBasisCache || modalBasisCacheDescriptor),
    }) ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheDescriptorStaleReason;
  renderDiagnostics.modalBasisCacheDescriptorStaleReason =
    typeof modalBasisCacheDescriptorStaleReason === "string"
      ? modalBasisCacheDescriptorStaleReason
      : null;
  renderDiagnostics.modalBasisCacheGeneration = readFiniteNumber(
    raymarchDebug.modalBasisCacheGeneration ?? modalBasisCache?.generation,
  );
  renderDiagnostics.modalBasisCacheAgeMs =
    raymarchDebug.modalBasisCacheAgeMs ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheAgeMs;
  renderDiagnostics.liveModalFrameAgeMs = readFiniteNumber(
    raymarchDebug.liveModalFrameAgeMs ??
      renderDiagnostics.featureFrameAgeAtRenderMs,
  );
  renderDiagnostics.modalBasisCacheDiagnosticReason =
    raymarchDebug.modalBasisCacheDiagnosticReason ??
    renderDiagnostics.modalBasisCacheDescriptorStaleReason ??
    modalBasisCache?.lastRebuildReason ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheDiagnosticReason;
  renderDiagnostics.modalBasisAtlasDepth = readFiniteNumber(
    raymarchDebug.modalBasisAtlasDepth ??
      modalBasisCache?.basisAtlasDepth ??
      modalBasisCacheDescriptor?.basisAtlasDepth,
  );
  renderDiagnostics.liveSynthesisModeCount = readFiniteNumber(
    raymarchDebug.liveSynthesisModeCount ??
      modalBasisCache?.liveSynthesisModeCount ??
      modalBasisCacheDescriptor?.liveSynthesisModeCount,
  );
  renderDiagnostics.modalBasisCacheQueuedDescriptorPending = Boolean(
    raymarchDebug.modalBasisCacheQueuedDescriptorPending ??
    modalBasisCache?.queuedDescriptor,
  );
  renderDiagnostics.modalBasisCacheLastError =
    raymarchDebug.modalBasisCacheLastError ??
    modalBasisCache?.lastError ??
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheLastError;
  renderDiagnostics.modalBasisCacheModeCount = readFiniteNumber(
    raymarchDebug.modalBasisCacheModeCount ??
      modalBasisCache?.activeBasisPageModeCount ??
      modalBasisCache?.contributingBasisPageModeCount ??
      modalBasisCacheDescriptor?.contributingBasisPageModeCount,
  );
  renderDiagnostics.modalBasisCachePhaseAuthority = readFiniteNumber(
    raymarchDebug.modalBasisCachePhaseAuthority ??
      modalBasisCache?.modalBasisCachePhaseAuthority ??
      modalBasisCacheDescriptor?.phaseAuthority,
  );
  renderDiagnostics.modalBasisCacheModeIdentityRetentionRatio =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheModeIdentityRetentionRatio ??
        modalBasisCache?.modeIdentityRetentionRatio ??
        modalBasisCacheDescriptor?.modeIdentityRetentionRatio,
      MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.modalBasisCacheModeIdentityRetentionRatio,
    );
  renderDiagnostics.modalBasisCacheMaxRepresentableModeIndex = readFiniteNumber(
    raymarchDebug.modalBasisCacheMaxRepresentableModeIndex ??
      modalBasisCache?.modalBasisCacheMaxRepresentableModeIndex ??
      modalBasisCacheDescriptor?.modalBasisCacheMaxRepresentableModeIndex,
  );
  renderDiagnostics.modalBasisCacheContributingModeCount = readFiniteNumber(
    raymarchDebug.modalBasisCacheContributingModeCount ??
      modalBasisCache?.contributingBasisPageModeCount ??
      modalBasisCacheDescriptor?.contributingBasisPageModeCount,
  );
  renderDiagnostics.modalBasisCacheZeroAmplitudeSkippedModeCount =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheZeroAmplitudeSkippedModeCount ??
        modalBasisCache?.zeroAmplitudeSkippedModeCount ??
        modalBasisCacheDescriptor?.zeroAmplitudeSkippedModeCount,
    );
  renderDiagnostics.modalBasisCacheContributingRawModalEnergy =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheContributingRawModalEnergy ??
        modalBasisCache?.contributingRawModalEnergy ??
        modalBasisCacheDescriptor?.contributingRawModalEnergy,
    );
  renderDiagnostics.modalBasisCacheBandwidthRejectedModeCount =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheBandwidthRejectedModeCount ??
        modalBasisCache?.bandwidthRejectedModeCount ??
        modalBasisCacheDescriptor?.bandwidthRejectedModeCount,
    );
  renderDiagnostics.modalBasisCacheBandwidthRejectedRawModalEnergy =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheBandwidthRejectedRawModalEnergy ??
        modalBasisCache?.bandwidthRejectedRawModalEnergy ??
        modalBasisCacheDescriptor?.bandwidthRejectedRawModalEnergy,
    );
  renderDiagnostics.modalBasisCacheContributingStructuralModalEnergy =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheContributingStructuralModalEnergy ??
        modalBasisCache?.contributingStructuralModalEnergy ??
        modalBasisCacheDescriptor?.contributingStructuralModalEnergy,
    );
  renderDiagnostics.modalBasisCacheBandwidthRejectedStructuralModalEnergy =
    readFiniteNumber(
      raymarchDebug.modalBasisCacheBandwidthRejectedStructuralModalEnergy ??
        modalBasisCache?.bandwidthRejectedStructuralModalEnergy ??
        modalBasisCacheDescriptor?.bandwidthRejectedStructuralModalEnergy,
    );
  renderDiagnostics.liveSynthesisResolvedRawModalEnergyRatio = readFiniteNumber(
    raymarchDebug.liveSynthesisResolvedRawModalEnergyRatio ??
      modalBasisCache?.liveSynthesisResolvedRawModalEnergyRatio ??
      modalBasisCacheDescriptor?.liveSynthesisResolvedRawModalEnergyRatio,
    MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.liveSynthesisResolvedRawModalEnergyRatio,
  );
  renderDiagnostics.liveSynthesisResolvedStructuralModalEnergyRatio =
    readFiniteNumber(
      raymarchDebug.liveSynthesisResolvedStructuralModalEnergyRatio ??
        modalBasisCache?.liveSynthesisResolvedStructuralModalEnergyRatio ??
        modalBasisCacheDescriptor?.liveSynthesisResolvedStructuralModalEnergyRatio,
      MODAL_BASIS_CACHE_RENDER_DIAGNOSTIC_DEFAULTS.liveSynthesisResolvedStructuralModalEnergyRatio,
    );
  renderDiagnostics.liveSynthesisRawGradientEnvelope = readFiniteNumber(
    raymarchDebug.liveSynthesisRawGradientEnvelope ??
      modalBasisCache?.liveSynthesisRawGradientEnvelope ??
      modalBasisCacheDescriptor?.liveSynthesisRawGradientEnvelope,
  );
  renderDiagnostics.liveSynthesisStructuralGradientEnvelope = readFiniteNumber(
    raymarchDebug.liveSynthesisStructuralGradientEnvelope ??
      modalBasisCache?.liveSynthesisStructuralGradientEnvelope ??
      modalBasisCacheDescriptor?.liveSynthesisStructuralGradientEnvelope,
  );
  renderDiagnostics.modalVarietyAudit = snapshotModalVarietyAudit(
    raymarchDebug.modalVarietyAudit ??
      runtimeState?.currentModalDescriptor?.diagnostics?.modalVarietyAudit,
  );

  return runtimeDiagnostics;
}

export function clearAdaptiveRaymarchResumeState(runtimeState) {
  if (!runtimeState || typeof runtimeState !== "object") {
    return;
  }

  runtimeState.autoRaymarchResumeRung = null;
}

export function recordRuntimePerfSample(
  runtimeDiagnostics,
  key,
  durationMs,
  smoothingAlpha = 0.2,
) {
  const entry = runtimeDiagnostics?.perfBreakdown?.[key];
  if (!entry || !Number.isFinite(durationMs)) {
    return;
  }

  const nextDurationMs = Math.max(0, durationMs);
  entry.lastMs = nextDurationMs;
  entry.maxMs = Math.max(entry.maxMs, nextDurationMs);
  entry.sampleCount += 1;
  entry.averageMs =
    entry.sampleCount > 1
      ? entry.averageMs + (nextDurationMs - entry.averageMs) * smoothingAlpha
      : nextDurationMs;
}

export function snapshotRuntimePerfBreakdown(perfBreakdown) {
  return Object.fromEntries(
    Object.entries(perfBreakdown ?? {}).map(([key, value]) => [
      key,
      {
        averageMs: value.averageMs,
        lastMs: value.lastMs,
        maxMs: value.maxMs,
        sampleCount: value.sampleCount,
      },
    ]),
  );
}

function getRuntimePerfWallTimeMs() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return 0;
}

function buildRuntimePerfSnapshot(runtimeDiagnostics) {
  return {
    fps:
      runtimeDiagnostics?.smoothedFrameTimeMs > 0
        ? 1000 / runtimeDiagnostics.smoothedFrameTimeMs
        : 0,
    smoothedFrameTimeMs: runtimeDiagnostics?.smoothedFrameTimeMs ?? 0,
    averageFrameTimeMs: runtimeDiagnostics?.averageFrameTimeMs ?? 0,
    lastFrameTimeMs: runtimeDiagnostics?.lastFrameTimeMs ?? 0,
    worstFrameTimeMs: runtimeDiagnostics?.worstFrameTimeMs ?? 0,
    longFrameCount: runtimeDiagnostics?.longFrameCount ?? 0,
    lastLongFrame: runtimeDiagnostics?.lastLongFrame
      ? { ...runtimeDiagnostics.lastLongFrame }
      : null,
    frameDrops: {
      framesOver16_7Ms: runtimeDiagnostics?.frameDrops?.framesOver16_7Ms ?? 0,
      framesOver25Ms: runtimeDiagnostics?.frameDrops?.framesOver25Ms ?? 0,
      framesOver33_3Ms: runtimeDiagnostics?.frameDrops?.framesOver33_3Ms ?? 0,
      framesOver50Ms: runtimeDiagnostics?.frameDrops?.framesOver50Ms ?? 0,
      recentLongFramesMs: copyRecentLongFrames(
        runtimeDiagnostics?.frameDrops?.recentLongFramesMs,
      ),
    },
    analysisScheduler: {
      analysisReuseCount:
        runtimeDiagnostics?.analysisScheduler?.analysisReuseCount ?? 0,
      analysisAgeMs: runtimeDiagnostics?.analysisScheduler?.analysisAgeMs ?? 0,
      forcedAnalysisCount:
        runtimeDiagnostics?.analysisScheduler?.forcedAnalysisCount ?? 0,
      skippedAnalysisCount:
        runtimeDiagnostics?.analysisScheduler?.skippedAnalysisCount ?? 0,
    },
    engine: {
      snapshotAgeMs: runtimeDiagnostics?.engine?.snapshotAgeMs ?? 0,
      publishCount: runtimeDiagnostics?.engine?.publishCount ?? 0,
      droppedFrameCount: runtimeDiagnostics?.engine?.droppedFrameCount ?? 0,
      transportDropCount: runtimeDiagnostics?.engine?.transportDropCount ?? 0,
      publishSkipCount: runtimeDiagnostics?.engine?.publishSkipCount ?? 0,
      fastSignalPatchCount:
        runtimeDiagnostics?.engine?.fastSignalPatchCount ?? 0,
      fastSignalUpdateCount:
        runtimeDiagnostics?.engine?.fastSignalUpdateCount ?? 0,
      structuralUpdateCount:
        runtimeDiagnostics?.engine?.structuralUpdateCount ?? 0,
      chromaUpdateCount: runtimeDiagnostics?.engine?.chromaUpdateCount ?? 0,
      tempoUpdateCount: runtimeDiagnostics?.engine?.tempoUpdateCount ?? 0,
      latestProcessedFrameId:
        runtimeDiagnostics?.engine?.latestProcessedFrameId ?? 0,
      latestPublishedFrameId:
        runtimeDiagnostics?.engine?.latestPublishedFrameId ?? 0,
      ...snapshotWorkerPerfCounters(runtimeDiagnostics?.engine),
      queueDepth: runtimeDiagnostics?.engine?.queueDepth ?? 0,
      state: runtimeDiagnostics?.engine?.state ?? "none",
      reason: runtimeDiagnostics?.engine?.reason ?? null,
    },
    render: {
      visualizationMethod:
        runtimeDiagnostics?.render?.visualizationMethod ?? null,
      qualityPreset: runtimeDiagnostics?.render?.qualityPreset ?? null,
      renderScale: runtimeDiagnostics?.render?.renderScale ?? 1,
      requestedRenderScale:
        runtimeDiagnostics?.render?.requestedRenderScale ?? 1,
      traaEnabled: runtimeDiagnostics?.render?.traaEnabled ?? false,
      bloomAllowed: runtimeDiagnostics?.render?.bloomAllowed ?? false,
      bloomEnabled: runtimeDiagnostics?.render?.bloomEnabled ?? false,
      raymarchStepBudget: runtimeDiagnostics?.render?.raymarchStepBudget ?? 0,
      requestedRaymarchSteps:
        runtimeDiagnostics?.render?.requestedRaymarchSteps ?? 0,
      effectiveRaymarchSteps:
        runtimeDiagnostics?.render?.effectiveRaymarchSteps ?? 0,
      adaptiveRaymarchActive:
        runtimeDiagnostics?.render?.adaptiveRaymarchActive ?? false,
      adaptiveStepDownCount:
        runtimeDiagnostics?.render?.adaptiveStepDownCount ?? 0,
      adaptiveStepUpCount: runtimeDiagnostics?.render?.adaptiveStepUpCount ?? 0,
      targetFps: runtimeDiagnostics?.render?.targetFps ?? 60,
      targetFrameTimeMs:
        runtimeDiagnostics?.render?.targetFrameTimeMs ?? 1000 / 60,
      activeModeCount: runtimeDiagnostics?.render?.activeModeCount ?? 0,
      observationEnergy: runtimeDiagnostics?.render?.observationEnergy ?? 0,
      observationReferenceAnchor:
        runtimeDiagnostics?.render?.observationReferenceAnchor ?? 0,
      observationReferenceSupport:
        runtimeDiagnostics?.render?.observationReferenceSupport ?? 0,
      observationReferenceDensityFloor:
        runtimeDiagnostics?.render?.observationReferenceDensityFloor ?? 0,
      observationReferenceContourSupport:
        runtimeDiagnostics?.render?.observationReferenceContourSupport ?? 0,
      observationSampledAnchor:
        runtimeDiagnostics?.render?.observationSampledAnchor ?? 0,
      observationSampledSignedAuthority:
        runtimeDiagnostics?.render?.observationSampledSignedAuthority ?? 0,
      observationSampledSupport:
        runtimeDiagnostics?.render?.observationSampledSupport ?? 0,
      observationSampledDensityFloor:
        runtimeDiagnostics?.render?.observationSampledDensityFloor ?? 0,
      observationSampledContourSupport:
        runtimeDiagnostics?.render?.observationSampledContourSupport ?? 0,
      ...snapshotModalBasisCacheRenderDiagnostics(runtimeDiagnostics?.render),
    },
    postProcess: {
      traaNodeActive: runtimeDiagnostics?.postProcess?.traaNodeActive ?? false,
      bloomPassPresent:
        runtimeDiagnostics?.postProcess?.bloomPassPresent ?? false,
      bloomComposeEnabled:
        runtimeDiagnostics?.postProcess?.bloomComposeEnabled ?? false,
      temporalHistoryBlend:
        runtimeDiagnostics?.postProcess?.temporalHistoryBlend ?? null,
      temporalHistoryGraphEnabled:
        runtimeDiagnostics?.postProcess?.temporalHistoryGraphEnabled ?? null,
    },
    renderSurface: snapshotRenderSurfaceDiagnostics(
      runtimeDiagnostics?.renderSurface,
    ),
    adaptiveRaymarch: runtimeDiagnostics?.adaptiveRaymarch
      ? { ...runtimeDiagnostics.adaptiveRaymarch }
      : null,
    modalFreshness: snapshotModalFreshnessDiagnostics(
      runtimeDiagnostics?.modalFreshness,
    ),
    uiInteraction: runtimeDiagnostics?.uiInteraction
      ? { ...runtimeDiagnostics.uiInteraction }
      : null,
    perfBreakdown: snapshotRuntimePerfBreakdown(
      runtimeDiagnostics?.perfBreakdown,
    ),
  };
}

export function maybePublishRuntimePerfSnapshot(
  runtimeDiagnostics,
  { publishIntervalMs = 250, force = false } = {},
) {
  if (typeof window === "undefined" || !runtimeDiagnostics) {
    return null;
  }

  const wallTimeMs = getRuntimePerfWallTimeMs();
  if (
    !force &&
    wallTimeMs - (runtimeDiagnostics.perfLastPublishedAtMs ?? 0) <
      publishIntervalMs
  ) {
    return null;
  }

  const snapshot = buildRuntimePerfSnapshot(runtimeDiagnostics);
  runtimeDiagnostics.perfLastPublishedAtMs = wallTimeMs;
  /** @type {any} */ (window).__baryonPerfMetrics = snapshot;
  return snapshot;
}

export function shouldRenderExternalFrame({
  externalFrameState,
  shouldAdvance,
  controlsChanged,
  forceRender = false,
}) {
  return !externalFrameState || shouldAdvance || controlsChanged || forceRender;
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
    frameDrops: runtimeDiagnostics.frameDrops
      ? {
          ...runtimeDiagnostics.frameDrops,
          recentLongFramesMs: copyRecentLongFrames(
            runtimeDiagnostics.frameDrops.recentLongFramesMs,
          ),
        }
      : null,
    analysisScheduler: runtimeDiagnostics.analysisScheduler
      ? { ...runtimeDiagnostics.analysisScheduler }
      : null,
    engine: runtimeDiagnostics.engine ? { ...runtimeDiagnostics.engine } : null,
    render: runtimeDiagnostics.render ? { ...runtimeDiagnostics.render } : null,
    modalFreshness: snapshotModalFreshnessDiagnostics(
      runtimeDiagnostics.modalFreshness,
    ),
    postProcess: runtimeDiagnostics.postProcess
      ? { ...runtimeDiagnostics.postProcess }
      : null,
    renderSurface: snapshotRenderSurfaceDiagnostics(
      runtimeDiagnostics.renderSurface,
    ),
    adaptiveRaymarch: runtimeDiagnostics.adaptiveRaymarch
      ? { ...runtimeDiagnostics.adaptiveRaymarch }
      : null,
    uiInteraction: runtimeDiagnostics.uiInteraction
      ? { ...runtimeDiagnostics.uiInteraction }
      : null,
    perfBreakdown: snapshotRuntimePerfBreakdown(
      runtimeDiagnostics.perfBreakdown,
    ),
  };
}
