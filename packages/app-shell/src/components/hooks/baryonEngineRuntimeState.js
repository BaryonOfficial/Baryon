import {
  RENDER_PROBE_SCHEMA_VERSION,
  buildRenderProbeSnapshot,
} from "./renderProbeSnapshot.js";

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
    lastSourceGeneration: null,
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
    frameId: null,
    sourcePhase: null,
    familyCount: 0,
    shellCount: 0,
    endSample: null,
    inputEndSample: null,
    preparationDelayFrames: null,
    observationTimeSeconds: null,
    normalizationEnergy: null,
    observationAgeMs: null,
    renderSubmittedAtMs: null,
    frameSemanticSource: null,
    frameSemanticFresh: false,
    frameSemanticReused: false,
    responseEnvelope: 0,
    accentEnvelope: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
  };
}

function readFiniteDiagnosticNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
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

function copyRecentLongFrames(recentLongFramesMs) {
  return Array.isArray(recentLongFramesMs) ? [...recentLongFramesMs] : [];
}

export function snapshotModalFreshnessDiagnostics(value) {
  if (!value) return null;
  const snapshot = createModalFreshnessDiagnostics();
  for (const key of Object.keys(snapshot)) {
    if (Object.hasOwn(value, key)) snapshot[key] = value[key];
  }
  return snapshot;
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
    appliedPostNodes: null,
    controlsSnapshot,
  };
}

export function createRuntimeDiagnostics() {
  return {
    activeFrameCount: 0,
    averageFrameTimeMs: 0,
    smoothedFrameTimeMs: 0,
    lastFrameTimeMs: 0,
    lastCompletedFrameAtMs: null,
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
      latestObservationAgeMs: null,
      latestObservationStale: false,
      latestObservationTimeSeconds: null,
      latestAcceptedFrameId: 0,
      sourceGeneration: 0,
      workerGeneration: 0,
      timelineRevision: 0,
      processingRevision: 0,
      topologyRevision: 0,
      sourceBootstrapCount: 0,
      workerProcessingMs: null,
      rejectedPacketCount: 0,
      staleAcknowledgementCount: 0,
      renderAuthorityRevoked: false,
      queueDepth: 0,
      state: "none",
      reason: null,
      phase: "idle",
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
      familyCount: 0,
      shellCount: 0,
      materialOutputVisible: false,
      renderAuthority: false,
      uploadedFamilyCount: 0,
      uploadedShellCount: 0,
      basisCompileCount: 0,
      observationUploadCount: 0,
      derivedTextureBytes: 0,
      latestAcceptedEndSample: null,
      observerConsumedEndSample: null,
      observerBakeExecuted: false,
      observerAdvanced: false,
      observerStepCount: 0,
      observerStepIndex: null,
      observerHasHistory: false,
      observationHistory: null,
      presentationFailure: null,
      spectralPresentationEnabled: false,
      renderProbeSchemaVersion: RENDER_PROBE_SCHEMA_VERSION,
      renderProbeSnapshot: null,
      materialProbe: null,
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

export function updateCymaticObserverRenderDiagnostics(
  diagnostics,
  debugSnapshot,
  runtimeState = null,
) {
  if (!diagnostics?.render) return diagnostics;
  const render = diagnostics.render,
    source = runtimeState?.fieldSource?.read?.(),
    observer =
      runtimeState?.fieldCache?.getObserverState?.() ?? debugSnapshot?.observer,
    bake = runtimeState?.cymaticObserverBakeResult;
  Object.assign(render, {
    renderAuthority: debugSnapshot?.renderAuthority === true,
    materialOutputVisible:
      runtimeState?.volumeMesh?.visible ??
      debugSnapshot?.volumeVisible ??
      false,
    uploadedFamilyCount: source?.topology?.familyCount ?? 0,
    uploadedShellCount: source?.topology?.shellCount ?? 0,
    basisCompileCount:
      source?.basisCompileCount ?? debugSnapshot?.basisCompileCount ?? 0,
    observationUploadCount:
      source?.observationUploadCount ??
      debugSnapshot?.observationUploadCount ??
      0,
    derivedTextureBytes:
      source?.textureBytes ?? debugSnapshot?.derivedTextureBytes ?? 0,
    latestAcceptedEndSample: debugSnapshot?.latestAcceptedEndSample ?? null,
    observerConsumedEndSample:
      runtimeState?.lastBakedFeatureFrame?.observation.endSample ??
      debugSnapshot?.observationEndSample ??
      null,
    observerBakeExecuted: bake?.baked === true,
    observerAdvanced: bake?.advanced === true,
    observerStepCount: bake?.stepCount ?? 0,
    observerStepIndex: observer?.stepIndex ?? null,
    observerHasHistory: observer?.hasHistory === true,
    observationHistory: debugSnapshot?.observationHistory ?? null,
    presentationFailure:
      runtimeState?.presentationFailure ??
      debugSnapshot?.presentationFailure ??
      null,
    presentationReady: debugSnapshot?.presentationReady === true,
    preparationPending: debugSnapshot?.preparationPending === true,
    preparationError: debugSnapshot?.preparationError ?? null,
    spectralPresentationEnabled:
      (runtimeState?.uniforms?.uSpectralPresentationEnabled?.value ?? 0) > 0,
    renderProbeSchemaVersion: RENDER_PROBE_SCHEMA_VERSION,
  });
  render.renderProbeSnapshot = buildRenderProbeSnapshot({
    renderDiagnostics: render,
    debugSnapshot,
    runtimeState,
  });
  return diagnostics;
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
    engine: runtimeDiagnostics?.engine
      ? { ...runtimeDiagnostics.engine }
      : null,
    render: runtimeDiagnostics?.render
      ? { ...runtimeDiagnostics.render }
      : null,
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
