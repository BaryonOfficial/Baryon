import {
  RENDER_PROBE_SCHEMA_VERSION,
  buildRenderProbeSnapshot,
} from "./renderProbeSnapshot.js";
import {
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "@baryon/engine/core/raymarch/quantityLedger";

const WORKER_PERF_COUNTER_BASES = Object.freeze([
  "FastLane",
  "StructuralLane",
  "Goertzel",
  "Composition",
]);
const WORKER_PERF_COUNTER_SUFFIXES = Object.freeze(["Ms", "LastMs", "MaxMs"]);
const WORKER_PERF_COUNTER_KEYS = Object.freeze(
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
    smaaGraphEnabled: false,
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

function createAdaptiveRaymarchControllerState() {
  return {
    adaptiveRaymarchActive: false,
    requestedRaymarchSteps: 0,
    effectiveRaymarchSteps: 0,
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
    controllerLastFrameTimeMs: 0,
    controllerSmoothedFrameTimeMs: 0,
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
    observationEnergy: 0,
    modalResponseEnergy: 0,
    modalResponseBudgetScale: 0,
    modalResponseRawEnergy: 0,
    modalResponseAverageDampingEnvelope: 0,
    modalResponseAverageCouplingStrength: 0,
    modalResponseAveragePhaseConfidence: 0,
    modalResponseAveragePersistence: 0,
    modalPhaseAuthority: 0,
    resonantPhaseAuthority: 0,
    sourceCoupledPhaseAuthority: 0,
    modalPhaseCoherentFieldModeCount: 0,
    modeCoherence: 0,
    activeModeCount: 0,
    activeModalFieldModeCount: 0,
    modeSlotMeanAbsDelta: 0,
    modeSlotChangeCount: 0,
    modalIdentitySlotMeanAbsDelta: 0,
    modalIdentitySlotChangeCount: 0,
    resonantObservedModeCount: 0,
    resonantObservedEnergy: 0,
    resonantRingSupport: 0,
    responseEnvelope: 0,
    accentEnvelope: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    _previousModeSlots: null,
    _previousModalIdentitySlots: null,
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
      fftPeakAmplitude: readFiniteDiagnosticNumber(metrics.fftPeakAmplitude),
      spectralEffectiveBinCount: Math.max(
        0,
        Math.floor(
          readFiniteDiagnosticNumber(metrics.spectralEffectiveBinCount),
        ),
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
    resonantPhaseAuthority: modalFreshness.resonantPhaseAuthority ?? 0,
    sourceCoupledPhaseAuthority:
      modalFreshness.sourceCoupledPhaseAuthority ?? 0,
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
    modalIdentitySlotMeanAbsDelta:
      modalFreshness.modalIdentitySlotMeanAbsDelta ?? 0,
    modalIdentitySlotChangeCount:
      modalFreshness.modalIdentitySlotChangeCount ?? 0,
    resonantObservedModeCount: modalFreshness.resonantObservedModeCount ?? 0,
    resonantObservedEnergy: modalFreshness.resonantObservedEnergy ?? 0,
    resonantRingSupport: modalFreshness.resonantRingSupport ?? 0,
    responseEnvelope: modalFreshness.responseEnvelope ?? 0,
    accentEnvelope: modalFreshness.accentEnvelope ?? 0,
    motionSignal: modalFreshness.motionSignal ?? 0,
    scaleSignal: modalFreshness.scaleSignal ?? 0,
    bloomResponseSignal: modalFreshness.bloomResponseSignal ?? 0,
  };
}

function createRuntimePerfBreakdown() {
  return {
    readFeatureModelMs: createRuntimePerfEntry(),
    createRendererFeatureViewMs: createRuntimePerfEntry(),
    applyCachedControlSnapshotsMs: createRuntimePerfEntry(),
    syncLiveInputRuntimeStatusMs: createRuntimePerfEntry(),
    runtimeTickMs: createRuntimePerfEntry(),
    applySceneControlsMs: createRuntimePerfEntry(),
    pipelineRenderMs: createRuntimePerfEntry(),
  };
}

export function clearFrameCache(frameCacheRefs) {
  if (frameCacheRefs.lastIdleFrameRef) {
    frameCacheRefs.lastIdleFrameRef.current = null;
  }
  if (frameCacheRefs.pausedFileFrameRef) {
    frameCacheRefs.pausedFileFrameRef.current = null;
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
    !status.isPlaying &&
    !status.isPlaybackPaused &&
    !status.isLiveInputActive &&
    !controls.injectTestTone
  );
}

const RADIATION_POTENTIAL_RENDER_DIAGNOSTIC_DEFAULTS = Object.freeze({
  opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  radiationPotentialModeCapacity: 0,
  radiationPotentialObservedCoefficientEnergy: 0,
  radiationPotentialObservedCoefficientNorm: 0,
  radiationPotentialNormalizedEnergyNorm: 0,
  radiationPotentialBakeModeCount: 0,
  radiationPotentialExposureDrive: 0,
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
    engine: {
      latestDriveAgeMs: null,
      latestDriveStale: false,
      latestObservationTimeSeconds: null,
      latestCaptureRms: null,
      latestAcceptedFrameId: 0,
      sourceGeneration: 0,
      workerGeneration: 0,
      topologyRevision: 0,
      processedFrameCount: 0,
      topologyPublishCount: 0,
      drivePublishCount: 0,
      inputReplacementCount: 0,
      rejectedPacketCount: 0,
      staleAcknowledgementCount: 0,
      renderAuthorityRevoked: false,
      ...snapshotWorkerPerfCounters(null),
      queueDepth: 0,
      state: "none",
      reason: null,
    },
    render: {
      visualizationMethod: null,
      qualityPreset: null,
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
      visibilityGateState: "unavailable",
      visibilityGateBlockedReason: "raymarch-debug-missing",
      spectralPresentationEnabled: false,
      spectralColorFieldImplementationState:
        RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
      materialOutputVisible: false,
      observerBakeExecuted: false,
      observerAdvanced: false,
      observerStepCount: 0,
      observerStepIndex: null,
      observerCheckpointKeyActive: false,
      observerCheckpointSaved: false,
      observerCheckpointRestored: false,
      observerCheckpointStepIndex: null,
      observerCheckpointSaveCount: 0,
      observerCheckpointRestoreCount: 0,
      observerCheckpointLastEvent: null,
      observerCheckpointBytes: 0,
      observerGeometryExposureSeconds: 0,
      observerRadianceExposureSeconds: 0,
      observerSpectralExposureSeconds: 0,
      plasmaProbeLocalRadiance: 0,
      plasmaProbePersistence: 0,
      plasmaProbeOrganizedDensity: 0,
      plasmaProbeExtinction: 0,
      plasmaProbePreBloomRadiance: 0,
      plasmaProbePostBloomRisk: 0,
      plasmaProbeBloomAmplification: 1,
      renderProbeSchemaVersion: RENDER_PROBE_SCHEMA_VERSION,
      renderProbeAvailable: false,
      renderProbeActiveCandidate: false,
      renderProbeStatus: "unavailable",
      renderProbeUnavailableReason: "raymarch-debug-missing",
      renderProbeSnapshot: null,
      renderQuantityLedgerVersion: null,
      renderQuantityForbiddenConsumers: null,
      absentDiagnosticSources: [],
      ...RADIATION_POTENTIAL_RENDER_DIAGNOSTIC_DEFAULTS,
    },
    modalFreshness: createModalFreshnessDiagnostics(),
    postProcess: createPostProcessDiagnostics(),
    renderSurface: createRenderSurfaceDiagnostics(),
    adaptiveRaymarch: createAdaptiveRaymarchControllerState(),
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
      "adaptiveRaymarchController",
    )
  ) {
    runtimeState.adaptiveRaymarchController =
      createAdaptiveRaymarchControllerState();
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      runtimeState,
      "adaptiveRaymarchInitializationInputs",
    )
  ) {
    runtimeState.adaptiveRaymarchInitializationInputs = null;
  }
  return runtimeState;
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readString(value, fallback = null) {
  return typeof value === "string" ? value : fallback;
}

function snapshotRenderQuantityForbiddenConsumers(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value).map(([quantityName, consumers]) => [
      quantityName,
      Array.isArray(consumers) ? [...consumers] : [],
    ]),
  );
}

function snapshotRadiationPotentialRenderDiagnostics(renderDiagnostics = null) {
  return Object.fromEntries(
    Object.entries(RADIATION_POTENTIAL_RENDER_DIAGNOSTIC_DEFAULTS).map(
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

export function updateCymaticObserverRenderDiagnostics(
  runtimeDiagnostics,
  debugSnapshot,
  runtimeState = null,
) {
  const renderDiagnostics = runtimeDiagnostics?.render;
  if (!renderDiagnostics) {
    return runtimeDiagnostics;
  }

  const raymarchDebug = debugSnapshot?.raymarchDebug ?? debugSnapshot ?? {};
  if (!debugSnapshot) {
    const coefficientFrame = runtimeState?.radiationPotentialCoefficientFrame;
    const spectralPresentationEnabled =
      readFiniteNumber(
        runtimeState?.uniforms?.uSpectralPresentationEnabled?.value,
        renderDiagnostics.spectralPresentationEnabled ? 1 : 0,
      ) > 0;
    const spectralChroma = readFiniteNumber(
      runtimeState?.uniforms?.uSpectralChroma?.value,
      renderDiagnostics.spectralChroma ?? 1,
    );
    const bakeModeCount = Math.max(
      0,
      Math.round(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
    );
    renderDiagnostics.spectralChroma = spectralChroma;
    renderDiagnostics.spectralPresentationEnabled = spectralPresentationEnabled;
    renderDiagnostics.spectralColorFieldImplementationState =
      RAYMARCH_SPECTRAL_PHASE_REPRESENTATION;
    renderDiagnostics.opticalFieldRepresentation =
      RAYMARCH_OPTICAL_FIELD_REPRESENTATION;
    renderDiagnostics.radiationPotentialModeCapacity = Math.max(
      0,
      Math.floor(runtimeState?.modalFieldCapacity ?? 0),
    );
    renderDiagnostics.radiationPotentialObservedCoefficientEnergy =
      readFiniteNumber(
        coefficientFrame?.observedCoefficientEnergy,
        renderDiagnostics.radiationPotentialObservedCoefficientEnergy,
      );
    renderDiagnostics.radiationPotentialObservedCoefficientNorm =
      readFiniteNumber(
        coefficientFrame?.observedCoefficientNorm,
        renderDiagnostics.radiationPotentialObservedCoefficientNorm,
      );
    renderDiagnostics.radiationPotentialNormalizedEnergyNorm = Math.sqrt(
      Math.max(
        0,
        readFiniteNumber(
          coefficientFrame?.normalizedEnergySum,
          renderDiagnostics.radiationPotentialNormalizedEnergyNorm ** 2,
        ),
      ),
    );
    renderDiagnostics.radiationPotentialBakeModeCount = bakeModeCount;
    renderDiagnostics.radiationPotentialExposureDrive = readFiniteNumber(
      coefficientFrame?.observedPressureDrive,
      renderDiagnostics.radiationPotentialExposureDrive,
    );
    renderDiagnostics.modalVarietyAudit = snapshotModalVarietyAudit(
      runtimeState?.currentModalDescriptor?.diagnostics?.modalVarietyAudit,
    );
    const observerState =
      runtimeState?.fieldCache?.getObserverState?.() ?? null;
    const observerBakeResult = runtimeState?.cymaticObserverBakeResult;
    renderDiagnostics.observerBakeExecuted = observerBakeResult?.baked === true;
    renderDiagnostics.observerAdvanced = observerBakeResult?.advanced === true;
    renderDiagnostics.observerStepCount = Number.isFinite(
      observerBakeResult?.stepCount,
    )
      ? Math.max(0, Math.floor(observerBakeResult.stepCount))
      : 0;
    renderDiagnostics.observerStepIndex = Number.isFinite(
      observerBakeResult?.stepIndex,
    )
      ? Math.max(0, Math.floor(observerBakeResult.stepIndex))
      : null;
    renderDiagnostics.observerCheckpointKeyActive =
      typeof observerState?.checkpointKey === "string";
    renderDiagnostics.observerCheckpointSaved =
      runtimeState?.cymaticObserverBakeResult?.checkpointSaved === true;
    renderDiagnostics.observerCheckpointRestored =
      runtimeState?.cymaticObserverBakeResult?.checkpointRestored === true;
    renderDiagnostics.observerCheckpointStepIndex = Number.isFinite(
      observerState?.checkpointStepIndex,
    )
      ? Math.max(0, Math.floor(observerState.checkpointStepIndex))
      : null;
    renderDiagnostics.observerCheckpointSaveCount = Math.max(
      0,
      Math.floor(runtimeState?.cymaticObserverCheckpointSaveCount ?? 0),
    );
    renderDiagnostics.observerCheckpointRestoreCount = Math.max(
      0,
      Math.floor(runtimeState?.cymaticObserverCheckpointRestoreCount ?? 0),
    );
    renderDiagnostics.observerCheckpointLastEvent = readString(
      runtimeState?.cymaticObserverCheckpointLastEvent,
      null,
    );
    renderDiagnostics.observerCheckpointBytes = Math.max(
      0,
      Math.floor(
        runtimeState?.debugSnapshot?.observerCheckpointBytes ??
          renderDiagnostics.observerCheckpointBytes ??
          0,
      ),
    );
    const renderProbeSnapshot = buildRenderProbeSnapshot({
      renderDiagnostics,
      debugSnapshot,
      runtimeState,
    });
    renderDiagnostics.renderProbeSchemaVersion =
      renderProbeSnapshot.schemaVersion;
    renderDiagnostics.renderProbeAvailable =
      renderProbeSnapshot.health.available;
    renderDiagnostics.renderProbeActiveCandidate =
      renderProbeSnapshot.health.activeCandidate;
    renderDiagnostics.renderProbeStatus = renderProbeSnapshot.health.status;
    renderDiagnostics.renderProbeUnavailableReason =
      renderProbeSnapshot.health.unavailableReason;
    renderDiagnostics.renderProbeSnapshot = renderProbeSnapshot;
    return runtimeDiagnostics;
  }

  renderDiagnostics.observerGeometryExposureSeconds = readFiniteNumber(
    raymarchDebug.observerGeometryExposureSeconds,
  );
  renderDiagnostics.observerBakeExecuted =
    raymarchDebug.observerBakeExecuted === true;
  renderDiagnostics.observerAdvanced = raymarchDebug.observerAdvanced === true;
  renderDiagnostics.observerStepCount = Math.max(
    0,
    Math.floor(raymarchDebug.observerStepCount ?? 0),
  );
  renderDiagnostics.observerStepIndex = Number.isFinite(
    raymarchDebug.observerStepIndex,
  )
    ? Math.max(0, Math.floor(raymarchDebug.observerStepIndex))
    : null;
  renderDiagnostics.observerCheckpointKeyActive =
    raymarchDebug.observerCheckpointKeyActive === true;
  renderDiagnostics.observerCheckpointSaved =
    raymarchDebug.observerCheckpointSaved === true;
  renderDiagnostics.observerCheckpointRestored =
    raymarchDebug.observerCheckpointRestored === true;
  renderDiagnostics.observerCheckpointStepIndex = Number.isFinite(
    raymarchDebug.observerCheckpointStepIndex,
  )
    ? Math.max(0, Math.floor(raymarchDebug.observerCheckpointStepIndex))
    : null;
  renderDiagnostics.observerCheckpointSaveCount = Math.max(
    0,
    Math.floor(raymarchDebug.observerCheckpointSaveCount ?? 0),
  );
  renderDiagnostics.observerCheckpointRestoreCount = Math.max(
    0,
    Math.floor(raymarchDebug.observerCheckpointRestoreCount ?? 0),
  );
  renderDiagnostics.observerCheckpointLastEvent = readString(
    raymarchDebug.observerCheckpointLastEvent,
    null,
  );
  renderDiagnostics.observerCheckpointBytes = Math.max(
    0,
    Math.floor(raymarchDebug.observerCheckpointBytes ?? 0),
  );
  renderDiagnostics.observerRadianceExposureSeconds = readFiniteNumber(
    raymarchDebug.observerRadianceExposureSeconds,
  );
  renderDiagnostics.observerSpectralExposureSeconds = readFiniteNumber(
    raymarchDebug.observerSpectralExposureSeconds,
  );
  renderDiagnostics.absentDiagnosticSources = Array.isArray(
    raymarchDebug.absentDiagnosticSources,
  )
    ? [...raymarchDebug.absentDiagnosticSources]
    : [];
  renderDiagnostics.plasmaProbeLocalRadiance = readFiniteNumber(
    raymarchDebug.plasmaProbeLocalRadiance,
  );
  renderDiagnostics.plasmaProbePersistence = readFiniteNumber(
    raymarchDebug.plasmaProbePersistence,
  );
  renderDiagnostics.plasmaProbeOrganizedDensity = readFiniteNumber(
    raymarchDebug.plasmaProbeOrganizedDensity,
  );
  renderDiagnostics.plasmaProbeExtinction = readFiniteNumber(
    raymarchDebug.plasmaProbeExtinction,
  );
  renderDiagnostics.plasmaProbePreBloomRadiance = readFiniteNumber(
    raymarchDebug.plasmaProbePreBloomRadiance,
  );
  renderDiagnostics.plasmaProbePostBloomRisk = readFiniteNumber(
    raymarchDebug.plasmaProbePostBloomRisk,
  );
  renderDiagnostics.plasmaProbeBloomAmplification = readFiniteNumber(
    raymarchDebug.plasmaProbeBloomAmplification,
    1,
  );
  renderDiagnostics.visibilityGateState = readString(
    raymarchDebug.visibilityGateState,
    renderDiagnostics.visibilityGateState ?? "unavailable",
  );
  renderDiagnostics.visibilityGateBlockedReason =
    raymarchDebug.visibilityGateBlockedReason === null
      ? null
      : readString(
          raymarchDebug.visibilityGateBlockedReason,
          renderDiagnostics.visibilityGateBlockedReason ?? null,
        );
  renderDiagnostics.spectralPresentationEnabled =
    raymarchDebug.spectralPresentationEnabled === true;
  renderDiagnostics.spectralColorFieldImplementationState = readString(
    raymarchDebug.spectralColorFieldImplementationState,
    RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
  );
  renderDiagnostics.materialOutputVisible =
    raymarchDebug.materialOutputVisible === true;
  renderDiagnostics.renderQuantityLedgerVersion = readString(
    raymarchDebug.renderQuantityLedgerVersion,
    renderDiagnostics.renderQuantityLedgerVersion ?? null,
  );
  renderDiagnostics.renderQuantityForbiddenConsumers =
    snapshotRenderQuantityForbiddenConsumers(
      raymarchDebug.renderQuantityForbiddenConsumers ??
        renderDiagnostics.renderQuantityForbiddenConsumers,
    );
  const renderProbeSnapshot = buildRenderProbeSnapshot({
    renderDiagnostics,
    debugSnapshot,
    runtimeState,
  });
  renderDiagnostics.renderProbeSchemaVersion =
    renderProbeSnapshot.schemaVersion;
  renderDiagnostics.renderProbeAvailable = renderProbeSnapshot.health.available;
  renderDiagnostics.renderProbeActiveCandidate =
    renderProbeSnapshot.health.activeCandidate;
  renderDiagnostics.renderProbeStatus = renderProbeSnapshot.health.status;
  renderDiagnostics.renderProbeUnavailableReason =
    renderProbeSnapshot.health.unavailableReason;
  renderDiagnostics.renderProbeSnapshot = renderProbeSnapshot;
  renderDiagnostics.opticalFieldRepresentation = readString(
    raymarchDebug.opticalFieldRepresentation,
    RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  );
  renderDiagnostics.radiationPotentialModeCapacity = readFiniteNumber(
    raymarchDebug.radiationPotentialModeCapacity ??
      runtimeState?.modalFieldCapacity,
  );
  renderDiagnostics.radiationPotentialObservedCoefficientEnergy =
    readFiniteNumber(raymarchDebug.radiationPotentialObservedCoefficientEnergy);
  renderDiagnostics.radiationPotentialObservedCoefficientNorm =
    readFiniteNumber(raymarchDebug.radiationPotentialObservedCoefficientNorm);
  renderDiagnostics.radiationPotentialNormalizedEnergyNorm = readFiniteNumber(
    raymarchDebug.radiationPotentialNormalizedEnergyNorm,
  );
  renderDiagnostics.radiationPotentialBakeModeCount = readFiniteNumber(
    raymarchDebug.radiationPotentialBakeModeCount,
  );
  renderDiagnostics.radiationPotentialExposureDrive = readFiniteNumber(
    raymarchDebug.radiationPotentialExposureDrive,
  );
  renderDiagnostics.liveSynthesisUnsignedSupportMean = readFiniteNumber(
    raymarchDebug.liveSynthesisUnsignedSupportMean,
  );
  renderDiagnostics.liveSynthesisCancellationRatioMean = readFiniteNumber(
    raymarchDebug.liveSynthesisCancellationRatioMean,
  );
  renderDiagnostics.liveSynthesisCancellationRatioMax = readFiniteNumber(
    raymarchDebug.liveSynthesisCancellationRatioMax,
  );
  renderDiagnostics.liveSynthesisSupportDiagnosticSampleCount =
    readFiniteNumber(raymarchDebug.liveSynthesisSupportDiagnosticSampleCount);
  renderDiagnostics.liveSynthesisSupportDiagnosticSupportedSampleCount =
    readFiniteNumber(
      raymarchDebug.liveSynthesisSupportDiagnosticSupportedSampleCount,
    );
  renderDiagnostics.liveSynthesisSupportDiagnosticCoverage = readFiniteNumber(
    raymarchDebug.liveSynthesisSupportDiagnosticCoverage,
  );
  renderDiagnostics.modalVarietyAudit = snapshotModalVarietyAudit(
    raymarchDebug.modalVarietyAudit ??
      runtimeState?.currentModalDescriptor?.diagnostics?.modalVarietyAudit,
  );

  return runtimeDiagnostics;
}

export function resetAdaptiveRaymarchControllerState(runtimeState) {
  if (!runtimeState || typeof runtimeState !== "object") {
    return;
  }

  const previousController = runtimeState.adaptiveRaymarchController;
  runtimeState.adaptiveRaymarchController = {
    ...createAdaptiveRaymarchControllerState(),
    // Explicit controller resets restart its decision window while retaining
    // the frame-time signal. Performance history is not profile/session state.
    controllerLastFrameTimeMs:
      previousController?.controllerLastFrameTimeMs ?? 0,
    controllerSmoothedFrameTimeMs:
      previousController?.controllerSmoothedFrameTimeMs ?? 0,
  };
  runtimeState.adaptiveRaymarchInitializationInputs = null;
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
    engine: {
      latestDriveAgeMs: runtimeDiagnostics?.engine?.latestDriveAgeMs ?? null,
      latestDriveStale: runtimeDiagnostics?.engine?.latestDriveStale === true,
      latestObservationTimeSeconds:
        runtimeDiagnostics?.engine?.latestObservationTimeSeconds ?? null,
      latestCaptureRms: runtimeDiagnostics?.engine?.latestCaptureRms ?? null,
      latestAcceptedFrameId:
        runtimeDiagnostics?.engine?.latestAcceptedFrameId ?? 0,
      sourceGeneration: runtimeDiagnostics?.engine?.sourceGeneration ?? 0,
      workerGeneration: runtimeDiagnostics?.engine?.workerGeneration ?? 0,
      topologyRevision: runtimeDiagnostics?.engine?.topologyRevision ?? 0,
      processedFrameCount: runtimeDiagnostics?.engine?.processedFrameCount ?? 0,
      topologyPublishCount:
        runtimeDiagnostics?.engine?.topologyPublishCount ?? 0,
      drivePublishCount: runtimeDiagnostics?.engine?.drivePublishCount ?? 0,
      inputReplacementCount:
        runtimeDiagnostics?.engine?.inputReplacementCount ?? 0,
      rejectedPacketCount: runtimeDiagnostics?.engine?.rejectedPacketCount ?? 0,
      staleAcknowledgementCount:
        runtimeDiagnostics?.engine?.staleAcknowledgementCount ?? 0,
      renderAuthorityRevoked:
        runtimeDiagnostics?.engine?.renderAuthorityRevoked ?? false,
      ...snapshotWorkerPerfCounters(runtimeDiagnostics?.engine),
      queueDepth: runtimeDiagnostics?.engine?.queueDepth ?? 0,
      state: runtimeDiagnostics?.engine?.state ?? "none",
      reason: runtimeDiagnostics?.engine?.reason ?? null,
    },
    render: {
      visualizationMethod:
        runtimeDiagnostics?.render?.visualizationMethod ?? null,
      qualityPreset: runtimeDiagnostics?.render?.qualityPreset ?? null,
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
      visibilityGateState:
        runtimeDiagnostics?.render?.visibilityGateState ?? "unavailable",
      visibilityGateBlockedReason: Object.prototype.hasOwnProperty.call(
        runtimeDiagnostics?.render ?? {},
        "visibilityGateBlockedReason",
      )
        ? runtimeDiagnostics.render.visibilityGateBlockedReason
        : "raymarch-debug-missing",
      spectralPresentationEnabled:
        runtimeDiagnostics?.render?.spectralPresentationEnabled ?? false,
      spectralColorFieldImplementationState:
        runtimeDiagnostics?.render?.spectralColorFieldImplementationState ??
        RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
      materialOutputVisible:
        runtimeDiagnostics?.render?.materialOutputVisible ?? false,
      observerBakeExecuted:
        runtimeDiagnostics?.render?.observerBakeExecuted ?? false,
      observerAdvanced: runtimeDiagnostics?.render?.observerAdvanced ?? false,
      observerStepCount: runtimeDiagnostics?.render?.observerStepCount ?? 0,
      observerStepIndex: runtimeDiagnostics?.render?.observerStepIndex ?? null,
      observerCheckpointKeyActive:
        runtimeDiagnostics?.render?.observerCheckpointKeyActive ?? false,
      observerCheckpointSaved:
        runtimeDiagnostics?.render?.observerCheckpointSaved ?? false,
      observerCheckpointRestored:
        runtimeDiagnostics?.render?.observerCheckpointRestored ?? false,
      observerCheckpointStepIndex:
        runtimeDiagnostics?.render?.observerCheckpointStepIndex ?? null,
      observerCheckpointSaveCount:
        runtimeDiagnostics?.render?.observerCheckpointSaveCount ?? 0,
      observerCheckpointRestoreCount:
        runtimeDiagnostics?.render?.observerCheckpointRestoreCount ?? 0,
      observerCheckpointLastEvent:
        runtimeDiagnostics?.render?.observerCheckpointLastEvent ?? null,
      observerCheckpointBytes:
        runtimeDiagnostics?.render?.observerCheckpointBytes ?? 0,
      observerGeometryExposureSeconds:
        runtimeDiagnostics?.render?.observerGeometryExposureSeconds ?? 0,
      observerRadianceExposureSeconds:
        runtimeDiagnostics?.render?.observerRadianceExposureSeconds ?? 0,
      observerSpectralExposureSeconds:
        runtimeDiagnostics?.render?.observerSpectralExposureSeconds ?? 0,
      plasmaProbeLocalRadiance:
        runtimeDiagnostics?.render?.plasmaProbeLocalRadiance ?? 0,
      plasmaProbePersistence:
        runtimeDiagnostics?.render?.plasmaProbePersistence ?? 0,
      plasmaProbeOrganizedDensity:
        runtimeDiagnostics?.render?.plasmaProbeOrganizedDensity ?? 0,
      plasmaProbeExtinction:
        runtimeDiagnostics?.render?.plasmaProbeExtinction ?? 0,
      plasmaProbePreBloomRadiance:
        runtimeDiagnostics?.render?.plasmaProbePreBloomRadiance ?? 0,
      plasmaProbePostBloomRisk:
        runtimeDiagnostics?.render?.plasmaProbePostBloomRisk ?? 0,
      plasmaProbeBloomAmplification:
        runtimeDiagnostics?.render?.plasmaProbeBloomAmplification ?? 1,
      renderProbeSchemaVersion:
        runtimeDiagnostics?.render?.renderProbeSchemaVersion ??
        RENDER_PROBE_SCHEMA_VERSION,
      renderProbeAvailable:
        runtimeDiagnostics?.render?.renderProbeAvailable ?? false,
      renderProbeActiveCandidate:
        runtimeDiagnostics?.render?.renderProbeActiveCandidate ?? false,
      renderProbeStatus:
        runtimeDiagnostics?.render?.renderProbeStatus ?? "unavailable",
      renderProbeUnavailableReason: Object.prototype.hasOwnProperty.call(
        runtimeDiagnostics?.render ?? {},
        "renderProbeUnavailableReason",
      )
        ? runtimeDiagnostics.render.renderProbeUnavailableReason
        : "raymarch-debug-missing",
      renderProbeSnapshot:
        runtimeDiagnostics?.render?.renderProbeSnapshot ?? null,
      renderQuantityLedgerVersion:
        runtimeDiagnostics?.render?.renderQuantityLedgerVersion ?? null,
      renderQuantityForbiddenConsumers:
        snapshotRenderQuantityForbiddenConsumers(
          runtimeDiagnostics?.render?.renderQuantityForbiddenConsumers,
        ),
      ...snapshotRadiationPotentialRenderDiagnostics(
        runtimeDiagnostics?.render,
      ),
    },
    postProcess: {
      traaNodeActive: runtimeDiagnostics?.postProcess?.traaNodeActive ?? false,
      bloomPassPresent:
        runtimeDiagnostics?.postProcess?.bloomPassPresent ?? false,
      bloomComposeEnabled:
        runtimeDiagnostics?.postProcess?.bloomComposeEnabled ?? false,
      smaaGraphEnabled:
        runtimeDiagnostics?.postProcess?.smaaGraphEnabled ?? false,
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
  externalFeatureAuthorityActive = false,
  externalFrameState,
  shouldAdvance,
  controlsChanged,
  forceRender = false,
}) {
  if (externalFeatureAuthorityActive && !externalFrameState) {
    return controlsChanged || forceRender;
  }

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
