import {
  getRaymarchEffectiveFieldDescriptorStaleReason,
  isRaymarchEffectiveFieldCacheReadyForDescriptor,
} from "@baryon/visualizer/core/raymarch/fieldCache";

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
    currentScaleRung: 0,
    stepDownCount: 0,
    stepUpCount: 0,
    scaleStepDownCount: 0,
    scaleStepUpCount: 0,
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
    fieldState: "idle",
    frameSemanticSource: null,
    frameSemanticFresh: false,
    frameSemanticReused: false,
    structuralSnapshotAgeMs: 0,
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
    fieldState: modalFreshness.fieldState ?? "idle",
    frameSemanticSource: modalFreshness.frameSemanticSource ?? null,
    frameSemanticFresh: modalFreshness.frameSemanticFresh ?? false,
    frameSemanticReused: modalFreshness.frameSemanticReused ?? false,
    structuralSnapshotAgeMs: modalFreshness.structuralSnapshotAgeMs ?? 0,
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
    modalFieldSlotMeanAbsDelta:
      modalFreshness.modalFieldSlotMeanAbsDelta ?? 0,
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
    observedResonanceModeCount:
      modalFreshness.observedResonanceModeCount ?? 0,
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

const EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS = Object.freeze({
  effectiveFieldActive: false,
  effectiveFieldReady: false,
  effectiveFieldSupportReady: false,
  effectiveFieldSupportSemantic: "effective-field-support",
  effectiveFieldUnsignedSupportMean: 0,
  effectiveFieldCancellationRatioMean: 0,
  effectiveFieldCancellationRatioMax: 0,
  effectiveFieldSupportDiagnosticSampleCount: 0,
  effectiveFieldSupportDiagnosticSupportedSampleCount: 0,
  effectiveFieldSupportDiagnosticCoverage: 0,
  effectiveFieldRebuildPending: false,
  effectiveFieldBackend: "compute",
  effectiveFieldResolution: 0,
  effectiveFieldRebuildCount: 0,
  effectiveFieldRebuildReason: "uninitialized",
  effectiveFieldDescriptorFresh: false,
  effectiveFieldDescriptorStaleReason: null,
  effectiveFieldQueuedDescriptorPending: false,
  effectiveFieldLastError: null,
  effectiveFieldModeCount: 0,
  effectiveFieldAuthority: 0,
  effectiveFieldModeIdentityRetentionRatio: 1,
  effectiveFieldMaxRepresentableModeIndex: 0,
  effectiveFieldContributingModeCount: 0,
  effectiveFieldZeroAmplitudeSkippedModeCount: 0,
  effectiveFieldContributingRawModalEnergy: 0,
  effectiveFieldBandwidthRejectedModeCount: 0,
  effectiveFieldBandwidthRejectedRawModalEnergy: 0,
  effectiveFieldContributingPhaseCurrentModalEnergy: 0,
  effectiveFieldBandwidthRejectedPhaseCurrentModalEnergy: 0,
  effectiveFieldResolvedRawModalEnergyRatio: 1,
  effectiveFieldResolvedPhaseCurrentModalEnergyRatio: 1,
  effectiveFieldRawGradientEnvelope: 0,
  effectiveFieldPhaseCurrentGradientEnvelope: 0,
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
      workerFastSignalMs: 0,
      workerStructuralMs: 0,
      workerPeakScanMs: 0,
      workerModalResolveMs: 0,
      workerProjectionMs: 0,
      workerChromaMs: 0,
      workerTempoMs: 0,
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
      ...EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS,
    },
    modalFreshness: createModalFreshnessDiagnostics(),
    postProcess: createPostProcessDiagnostics(),
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
  if (
    !Object.prototype.hasOwnProperty.call(
      runtimeState,
      "autoRaymarchResumeScaleRung",
    )
  ) {
    runtimeState.autoRaymarchResumeScaleRung = null;
  }

  return runtimeState;
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function snapshotEffectiveFieldRenderDiagnostics(renderDiagnostics = null) {
  return Object.fromEntries(
    Object.entries(EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS).map(
      ([key, fallback]) => [key, renderDiagnostics?.[key] ?? fallback],
    ),
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
  const effectiveFieldCache = runtimeState?.effectiveFieldCache ?? null;
  const effectiveFieldDescriptor =
    runtimeState?.currentEffectiveFieldDescriptor ?? null;
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
  renderDiagnostics.effectiveFieldActive = Boolean(
    raymarchDebug.effectiveFieldActive ?? effectiveFieldCache?.active,
  );
  renderDiagnostics.effectiveFieldReady = Boolean(
    raymarchDebug.effectiveFieldReady ?? effectiveFieldCache?.ready,
  );
  renderDiagnostics.effectiveFieldSupportReady = Boolean(
    raymarchDebug.effectiveFieldSupportReady ??
    (effectiveFieldCache?.ready === true &&
      Boolean(effectiveFieldCache?.supportTexture)),
  );
  renderDiagnostics.effectiveFieldSupportSemantic =
    raymarchDebug.effectiveFieldSupportSemantic ??
    effectiveFieldCache?.supportSemantic ??
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS.effectiveFieldSupportSemantic;
  renderDiagnostics.effectiveFieldUnsignedSupportMean = readFiniteNumber(
    raymarchDebug.effectiveFieldUnsignedSupportMean ??
      effectiveFieldCache?.effectiveFieldUnsignedSupportMean ??
      effectiveFieldDescriptor?.effectiveFieldUnsignedSupportMean,
  );
  renderDiagnostics.effectiveFieldCancellationRatioMean = readFiniteNumber(
    raymarchDebug.effectiveFieldCancellationRatioMean ??
      effectiveFieldCache?.effectiveFieldCancellationRatioMean ??
      effectiveFieldDescriptor?.effectiveFieldCancellationRatioMean,
  );
  renderDiagnostics.effectiveFieldCancellationRatioMax = readFiniteNumber(
    raymarchDebug.effectiveFieldCancellationRatioMax ??
      effectiveFieldCache?.effectiveFieldCancellationRatioMax ??
      effectiveFieldDescriptor?.effectiveFieldCancellationRatioMax,
  );
  renderDiagnostics.effectiveFieldSupportDiagnosticSampleCount =
    readFiniteNumber(
      raymarchDebug.effectiveFieldSupportDiagnosticSampleCount ??
        effectiveFieldCache?.effectiveFieldSupportDiagnosticSampleCount ??
        effectiveFieldDescriptor?.effectiveFieldSupportDiagnosticSampleCount,
    );
  renderDiagnostics.effectiveFieldSupportDiagnosticSupportedSampleCount =
    readFiniteNumber(
      raymarchDebug.effectiveFieldSupportDiagnosticSupportedSampleCount ??
        effectiveFieldCache
          ?.effectiveFieldSupportDiagnosticSupportedSampleCount ??
        effectiveFieldDescriptor
          ?.effectiveFieldSupportDiagnosticSupportedSampleCount,
    );
  renderDiagnostics.effectiveFieldSupportDiagnosticCoverage = readFiniteNumber(
    raymarchDebug.effectiveFieldSupportDiagnosticCoverage ??
      effectiveFieldCache?.effectiveFieldSupportDiagnosticCoverage ??
      effectiveFieldDescriptor?.effectiveFieldSupportDiagnosticCoverage,
  );
  renderDiagnostics.effectiveFieldRebuildPending = Boolean(
    raymarchDebug.effectiveFieldRebuildPending ??
    effectiveFieldCache?.rebuildPending,
  );
  renderDiagnostics.effectiveFieldBackend =
    raymarchDebug.effectiveFieldBackend ??
    effectiveFieldCache?.backend ??
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS.effectiveFieldBackend;
  renderDiagnostics.effectiveFieldResolution = readFiniteNumber(
    raymarchDebug.effectiveFieldResolution ?? effectiveFieldCache?.resolution,
  );
  renderDiagnostics.effectiveFieldRebuildCount = readFiniteNumber(
    raymarchDebug.effectiveFieldRebuildCount ??
      effectiveFieldCache?.rebuildCount,
  );
  renderDiagnostics.effectiveFieldRebuildReason =
    raymarchDebug.effectiveFieldRebuildReason ??
    effectiveFieldCache?.lastRebuildReason ??
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS.effectiveFieldRebuildReason;
  const effectiveFieldDescriptorFresh =
    typeof raymarchDebug.effectiveFieldDescriptorFresh === "boolean"
      ? raymarchDebug.effectiveFieldDescriptorFresh
      : isRaymarchEffectiveFieldCacheReadyForDescriptor(
          effectiveFieldCache,
          effectiveFieldDescriptor,
        );
  renderDiagnostics.effectiveFieldDescriptorFresh =
    effectiveFieldDescriptorFresh;
  const effectiveFieldDescriptorStaleReason =
    getRaymarchEffectiveFieldDescriptorStaleReason({
      descriptorFresh: effectiveFieldDescriptorFresh,
      reportedReason:
        raymarchDebug.effectiveFieldDescriptorStaleReason ??
        effectiveFieldCache?.descriptorStaleReason,
      rebuildPending: effectiveFieldCache?.rebuildPending,
      queuedDescriptor: effectiveFieldCache?.queuedDescriptor,
      activeDescriptor: effectiveFieldCache?.activeDescriptor,
      nextDescriptor: effectiveFieldDescriptor,
      hasDescriptorState: Boolean(
        effectiveFieldCache || effectiveFieldDescriptor,
      ),
    }) ??
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS.effectiveFieldDescriptorStaleReason;
  renderDiagnostics.effectiveFieldDescriptorStaleReason =
    typeof effectiveFieldDescriptorStaleReason === "string"
      ? effectiveFieldDescriptorStaleReason
      : null;
  renderDiagnostics.effectiveFieldQueuedDescriptorPending = Boolean(
    raymarchDebug.effectiveFieldQueuedDescriptorPending ??
    effectiveFieldCache?.queuedDescriptor,
  );
  renderDiagnostics.effectiveFieldLastError =
    raymarchDebug.effectiveFieldLastError ??
    effectiveFieldCache?.lastError ??
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS.effectiveFieldLastError;
  renderDiagnostics.effectiveFieldModeCount = readFiniteNumber(
    raymarchDebug.effectiveFieldModeCount ??
      effectiveFieldCache?.activeEffectiveFieldModeCount ??
      effectiveFieldCache?.contributingEffectiveFieldModeCount ??
      effectiveFieldDescriptor?.contributingEffectiveFieldModeCount,
  );
  renderDiagnostics.effectiveFieldAuthority = readFiniteNumber(
    raymarchDebug.effectiveFieldAuthority ??
      effectiveFieldCache?.effectiveFieldAuthority ??
      effectiveFieldDescriptor?.phaseAuthority,
  );
  renderDiagnostics.effectiveFieldModeIdentityRetentionRatio = readFiniteNumber(
    raymarchDebug.effectiveFieldModeIdentityRetentionRatio ??
      effectiveFieldCache?.modeIdentityRetentionRatio ??
      effectiveFieldDescriptor?.modeIdentityRetentionRatio,
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS.effectiveFieldModeIdentityRetentionRatio,
  );
  renderDiagnostics.effectiveFieldMaxRepresentableModeIndex = readFiniteNumber(
    raymarchDebug.effectiveFieldMaxRepresentableModeIndex ??
      effectiveFieldCache?.effectiveFieldMaxRepresentableModeIndex ??
      effectiveFieldDescriptor?.effectiveFieldMaxRepresentableModeIndex,
  );
  renderDiagnostics.effectiveFieldContributingModeCount = readFiniteNumber(
    raymarchDebug.effectiveFieldContributingModeCount ??
      effectiveFieldCache?.contributingEffectiveFieldModeCount ??
      effectiveFieldDescriptor?.contributingEffectiveFieldModeCount,
  );
  renderDiagnostics.effectiveFieldZeroAmplitudeSkippedModeCount =
    readFiniteNumber(
      raymarchDebug.effectiveFieldZeroAmplitudeSkippedModeCount ??
        effectiveFieldCache?.zeroAmplitudeSkippedModeCount ??
        effectiveFieldDescriptor?.zeroAmplitudeSkippedModeCount,
    );
  renderDiagnostics.effectiveFieldContributingRawModalEnergy = readFiniteNumber(
    raymarchDebug.effectiveFieldContributingRawModalEnergy ??
      effectiveFieldCache?.contributingRawModalEnergy ??
      effectiveFieldDescriptor?.contributingRawModalEnergy,
  );
  renderDiagnostics.effectiveFieldBandwidthRejectedModeCount = readFiniteNumber(
    raymarchDebug.effectiveFieldBandwidthRejectedModeCount ??
      effectiveFieldCache?.bandwidthRejectedModeCount ??
      effectiveFieldDescriptor?.bandwidthRejectedModeCount,
  );
  renderDiagnostics.effectiveFieldBandwidthRejectedRawModalEnergy =
    readFiniteNumber(
      raymarchDebug.effectiveFieldBandwidthRejectedRawModalEnergy ??
        effectiveFieldCache?.bandwidthRejectedRawModalEnergy ??
        effectiveFieldDescriptor?.bandwidthRejectedRawModalEnergy,
    );
  renderDiagnostics.effectiveFieldContributingPhaseCurrentModalEnergy =
    readFiniteNumber(
      raymarchDebug.effectiveFieldContributingPhaseCurrentModalEnergy ??
        effectiveFieldCache?.contributingPhaseCurrentModalEnergy ??
        effectiveFieldDescriptor?.contributingPhaseCurrentModalEnergy,
    );
  renderDiagnostics.effectiveFieldBandwidthRejectedPhaseCurrentModalEnergy =
    readFiniteNumber(
      raymarchDebug.effectiveFieldBandwidthRejectedPhaseCurrentModalEnergy ??
        effectiveFieldCache?.bandwidthRejectedPhaseCurrentModalEnergy ??
        effectiveFieldDescriptor?.bandwidthRejectedPhaseCurrentModalEnergy,
    );
  renderDiagnostics.effectiveFieldResolvedRawModalEnergyRatio = readFiniteNumber(
    raymarchDebug.effectiveFieldResolvedRawModalEnergyRatio ??
      effectiveFieldCache?.effectiveFieldResolvedRawModalEnergyRatio ??
      effectiveFieldDescriptor?.effectiveFieldResolvedRawModalEnergyRatio,
    EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS
      .effectiveFieldResolvedRawModalEnergyRatio,
  );
  renderDiagnostics.effectiveFieldResolvedPhaseCurrentModalEnergyRatio =
    readFiniteNumber(
      raymarchDebug.effectiveFieldResolvedPhaseCurrentModalEnergyRatio ??
        effectiveFieldCache
          ?.effectiveFieldResolvedPhaseCurrentModalEnergyRatio ??
        effectiveFieldDescriptor
          ?.effectiveFieldResolvedPhaseCurrentModalEnergyRatio,
      EFFECTIVE_FIELD_RENDER_DIAGNOSTIC_DEFAULTS
        .effectiveFieldResolvedPhaseCurrentModalEnergyRatio,
    );
  renderDiagnostics.effectiveFieldRawGradientEnvelope = readFiniteNumber(
    raymarchDebug.effectiveFieldRawGradientEnvelope ??
      effectiveFieldCache?.effectiveFieldRawGradientEnvelope ??
      effectiveFieldDescriptor?.effectiveFieldRawGradientEnvelope,
  );
  renderDiagnostics.effectiveFieldPhaseCurrentGradientEnvelope =
    readFiniteNumber(
      raymarchDebug.effectiveFieldPhaseCurrentGradientEnvelope ??
        effectiveFieldCache?.effectiveFieldPhaseCurrentGradientEnvelope ??
        effectiveFieldDescriptor?.effectiveFieldPhaseCurrentGradientEnvelope,
    );

  return runtimeDiagnostics;
}

export function clearAdaptiveRaymarchResumeState(runtimeState) {
  if (!runtimeState || typeof runtimeState !== "object") {
    return;
  }

  runtimeState.autoRaymarchResumeRung = null;
  runtimeState.autoRaymarchResumeScaleRung = null;
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
      workerFastSignalMs: runtimeDiagnostics?.engine?.workerFastSignalMs ?? 0,
      workerStructuralMs: runtimeDiagnostics?.engine?.workerStructuralMs ?? 0,
      workerPeakScanMs: runtimeDiagnostics?.engine?.workerPeakScanMs ?? 0,
      workerModalResolveMs:
        runtimeDiagnostics?.engine?.workerModalResolveMs ?? 0,
      workerProjectionMs: runtimeDiagnostics?.engine?.workerProjectionMs ?? 0,
      workerChromaMs: runtimeDiagnostics?.engine?.workerChromaMs ?? 0,
      workerTempoMs: runtimeDiagnostics?.engine?.workerTempoMs ?? 0,
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
      ...snapshotEffectiveFieldRenderDiagnostics(runtimeDiagnostics?.render),
    },
    postProcess: {
      traaNodeActive: runtimeDiagnostics?.postProcess?.traaNodeActive ?? false,
      bloomPassPresent:
        runtimeDiagnostics?.postProcess?.bloomPassPresent ?? false,
      bloomComposeEnabled:
        runtimeDiagnostics?.postProcess?.bloomComposeEnabled ?? false,
    },
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
