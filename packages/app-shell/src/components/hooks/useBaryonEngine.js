import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  advanceRenderOutputTemporalHistoryBypass,
  consumeRenderOutputVisualIdle,
  getRenderOutputSmaaGraphEnabled,
  getRenderOutputTemporalHistoryGraphEnabled,
  getRenderQualityProfileKey,
  getRenderQualityProfileTargetFps,
  isAdaptivePerformanceProfile,
  markRenderOutputContentChange,
  syncRenderOutputNodeTopology,
} from "@baryon/engine/render/outputPipeline";
import {
  applyAudioControls,
  applySceneControls,
} from "@baryon/engine/controls/runtime";
import { usesRaymarchVolumePipeline } from "@baryon/engine/visualization/types";
import { getDefaultAudioSession } from "@baryon/engine/audio";
import {
  DEVTOOLS_ENABLED,
  RAYMARCH_AUDIT_FIXTURE_ENABLED,
} from "../../devtools/config.js";
import {
  BARYON_UI_INTERACTION_EVENT,
  UI_INTERACTION_ADAPTIVE_SUPPRESSION_MS,
} from "../uiInteractionEvents.js";
import {
  markBaryonTestRuntimeReady,
  resetBaryonTestReady,
} from "../../devtools/testReady.js";
import {
  createTailDiagnosticsRecorder,
  installTailDiagnosticsWindowApi,
  isTailDiagnosticsRecorderActive,
  recordTailDiagnosticsSample,
} from "./tailDiagnostics.js";
import {
  resetAdaptiveRaymarchControllerState,
  maybePublishRuntimePerfSnapshot,
  clearFrameCache,
  createRuntimeDiagnostics,
  recordRuntimePerfSample,
  shouldRenderExternalFrame,
  updateCymaticObserverRenderDiagnostics,
} from "./baryonEngineRuntimeState.js";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import { subscribeControlsChanged } from "../../controls/controlsEvents.js";
import { createProgramFrameProducer } from "../programFrameProducer.js";
import {
  applyCachedControlSnapshots,
  consumeRenderFramePacerSlot,
  createAuditSnapshotNotifier,
  createFeatureFrameResolver,
  createRenderFramePacerState,
  getDevicePixelRatio,
  getRenderTargetPixelRatio,
  publishPerformanceHudSnapshot,
  publishDevtoolsSnapshots,
  finalizeTerminalVisualIdleState,
  shouldBypassTemporalHistoryForRaymarchFrame,
  syncLiveInputRuntimeStatus,
  updateModalEnvelopeDiagnostics,
  updateModalFreshnessDiagnostics,
  updateAdaptiveRaymarchStepBudget,
  updateRendererDiagnostics,
  syncUploadedRenderQuantities,
} from "./baryonEngineRenderLoop.js";
import { useVisualizationRuntimeLifecycle } from "./useVisualizationRuntimeLifecycle.js";
import { getSourceAuthoritativeClock } from "./externalFrameClock.js";
import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";
import { assertAudioFeatureAuthorityRole } from "../audioFeatureAuthorityRole.js";
import { createRenderCommandQueue } from "./renderCommandQueue.js";
import {
  createRaymarchAuditFixtureRuntimeDriver,
  RAYMARCH_AUDIT_FIXTURE_RUNTIME_ADAPTER_KEY,
} from "./raymarchAuditFixtureRuntimeAdapter.js";

function clearCachedControlsSnapshot(cachedControlSnapshotsRef) {
  cachedControlSnapshotsRef.current.controlsSnapshot = null;
}

function useLazyRef(createInitialValue) {
  const [ref] = useState(() => ({ current: createInitialValue() }));
  return ref;
}

function clearPausedRenderFrameCaches(frameCacheRefs) {
  frameCacheRefs.lastIdleFrameRef.current = null;
  if (frameCacheRefs.pausedFileFrameRef) {
    frameCacheRefs.pausedFileFrameRef.current = null;
  }
}

function getWallTimeMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : 0;
}

const LOCAL_CAMERA_FORCE_RENDER_INTERVAL_MS = 1000 / 30;

function shouldForceLocalCameraRender(cameraSignal, lastRenderedAtMs, nowMs) {
  if (!cameraSignal) {
    return false;
  }
  if (cameraSignal.phase === "end") {
    return true;
  }
  return nowMs - lastRenderedAtMs >= LOCAL_CAMERA_FORCE_RENDER_INTERVAL_MS;
}

function readFiniteNumber(value) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function assignFiniteNumber(target, key, value) {
  const nextValue = readFiniteNumber(value);
  if (nextValue === null) {
    return null;
  }

  target[key] = nextValue;
  return nextValue;
}

function applyExternalSceneSnapshot(runtimeState, sceneSnapshot) {
  if (!runtimeState || !sceneSnapshot) {
    return null;
  }

  const rotation =
    runtimeState.cymaticRoot?.rotation ??
    runtimeState.volumeMesh?.rotation ??
    null;
  const sceneMotion = runtimeState.sceneMotion ?? {};
  runtimeState.sceneMotion = sceneMotion;

  const rotationX = readFiniteNumber(sceneSnapshot.rotationX);
  const rotationY = readFiniteNumber(sceneSnapshot.rotationY);
  const rotationZ = readFiniteNumber(sceneSnapshot.rotationZ);

  if (rotation) {
    if (rotationX !== null) {
      rotation.x = rotationX;
    }
    if (rotationY !== null) {
      rotation.y = rotationY;
    }
    if (rotationZ !== null) {
      rotation.z = rotationZ;
    }
  }

  if (rotationX !== null) {
    sceneMotion.pitch = rotationX;
  }
  if (rotationY !== null) {
    sceneMotion.yaw = rotationY;
  }
  if (rotationZ !== null) {
    sceneMotion.roll = rotationZ;
  }

  assignFiniteNumber(
    sceneMotion,
    "angularVelocity",
    sceneSnapshot.angularVelocity,
  );
  assignFiniteNumber(
    sceneMotion,
    "targetAngularVelocity",
    sceneSnapshot.targetAngularVelocity,
  );
  assignFiniteNumber(sceneMotion, "pitchVelocity", sceneSnapshot.pitchVelocity);
  assignFiniteNumber(sceneMotion, "rollVelocity", sceneSnapshot.rollVelocity);

  const idleLogoRotationY = readFiniteNumber(sceneSnapshot.idleLogoRotationY);
  const idleLogoAngularVelocity = readFiniteNumber(
    sceneSnapshot.idleLogoAngularVelocity,
  );
  const idleLogoMotion = runtimeState.idleLogoMotion ?? {};
  runtimeState.idleLogoMotion = idleLogoMotion;

  if (idleLogoRotationY !== null) {
    if (runtimeState.idleOverlay?.rotation) {
      runtimeState.idleOverlay.rotation.y = idleLogoRotationY;
    }
    idleLogoMotion.yaw = idleLogoRotationY;
  }
  if (idleLogoAngularVelocity !== null) {
    idleLogoMotion.angularVelocity = idleLogoAngularVelocity;
    idleLogoMotion.targetAngularVelocity = idleLogoAngularVelocity;
  }

  return sceneSnapshot;
}

function recordMeasuredRuntimePerf(runtimeDiagnostics, key, startedAt) {
  recordRuntimePerfSample(
    runtimeDiagnostics,
    key,
    Math.max(0, getWallTimeMs() - startedAt),
  );
}

function renderPipelineFrame(renderLoopContext, pipeline) {
  renderLoopContext.gl.setRenderTarget?.(null);
  renderLoopContext.gl.setMRT?.(null);
  pipeline.render();
  advanceRenderOutputTemporalHistoryBypass(
    renderLoopContext.postNodesRef.current,
  );
}

function isAttachedToScene(root, scene) {
  let ancestor = root;
  while (ancestor) {
    if (ancestor === scene) {
      return true;
    }
    ancestor = ancestor.parent ?? null;
  }
  return false;
}

function isProgramRootAttached(scene, programRoot) {
  return !programRoot || isAttachedToScene(programRoot, scene);
}

export function useBaryonEngine({
  baryonGeometry,
  camera,
  gl,
  scene,
  setIsEngineReady,
  setLiveInputRuntimeStatus,
  liveInputUiState,
  liveInputErrorCode,
  controlsRef,
  ensurePipeline,
  postNodesRef,
  onPerformanceHudSnapshotChange,
  onAuditSnapshotChange,
  outputCompositorFrameTransfer = false,
  onOutputCompositorFrame = null,
  onFrameState = null,
  registerStructureExportSampleReader = null,
  audioFeatureAuthorityRole,
  externalFrameRef = null,
  structuralControlVersion = 0,
  liveControlSignalRef = null,
  localCameraRenderSignalRef = null,
  adaptiveResetNonce = 0,
  framePacingFps = null,
  renderProfile = null,
  basePixelRatio = null,
  onStageRender = null,
  suppressRender = false,
  enableControlEventSync = true,
  cameraRenderKey = null,
  outputMode = null,
}) {
  assertAudioFeatureAuthorityRole(audioFeatureAuthorityRole);
  const externalFeatureAuthorityActive =
    audioFeatureAuthorityRole ===
    AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer;
  const { invalidate } = useThree();
  const audioRef = useLazyRef(getDefaultAudioSession);
  const renderControlsRef = useLazyRef(() =>
    controlsRef?.current ? { ...controlsRef.current } : {},
  );
  const renderCommandQueueRef = useLazyRef(createRenderCommandQueue);
  const outputCompositorFrameErrorRef = useRef(null);
  const programFrameProducerRef = useLazyRef(createProgramFrameProducer);
  const featureFrameResolverRef = useLazyRef(createFeatureFrameResolver);
  const latestFeatureResolverInputsRef = useRef(null);
  const tailDiagnosticsRef = useLazyRef(createTailDiagnosticsRecorder);
  const lastAppliedExternalFrameSequenceRef = useRef(null);
  const lastObservedLocalCameraRenderSignalVersionRef = useRef(0);
  const pendingLocalCameraRenderSignalRef = useRef(null);
  const lastLocalCameraRenderAtMsRef = useRef(Number.NEGATIVE_INFINITY);
  const performanceHudStateRef = useRef({
    lastPublishedAtMs: Number.NEGATIVE_INFINITY,
    wasPublishing: false,
  });
  const notifyAuditSnapshotChange = useMemo(
    () => createAuditSnapshotNotifier(onAuditSnapshotChange),
    [onAuditSnapshotChange],
  );
  const {
    points,
    runtimeRef,
    runtimeStateRef,
    audioFeatureRuntimeRef,
    runtimeDiagnosticsRef,
    frameCacheRefs,
    controlCacheRefs,
    pixelRatioRef,
    renderSurfaceSizeRef,
    lastLiveInputRuntimeStatusRef,
    lastAudioIssueSignatureRef,
  } = useVisualizationRuntimeLifecycle({
    audioRef,
    baryonGeometry,
    controlsRef,
    audioFeatureAuthorityRole,
    audioFeatureConfigurationVersion: structuralControlVersion,
    setIsEngineReady,
    setLiveInputRuntimeStatus,
  });
  const {
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  } = controlCacheRefs;

  useEffect(() => {
    if (
      externalFeatureAuthorityActive ||
      typeof registerStructureExportSampleReader !== "function"
    ) {
      registerStructureExportSampleReader?.(null);
      return undefined;
    }

    const reader = () => {
      const inputs = latestFeatureResolverInputsRef.current;
      if (!inputs) {
        return null;
      }
      const resolved = featureFrameResolverRef.current.resolve({
        ...inputs,
        runtimeDiagnostics: null,
        controls: renderControlsRef.current,
      });
      if (!resolved?.effectiveFrame) {
        return null;
      }
      const appliedControlsSnapshot =
        cachedControlSnapshotsRef.current?.controlsSnapshot ??
        renderControlsRef.current;
      return {
        featureFrame: resolved.effectiveFrame,
        resolvedSemanticRevision: resolved.resolvedSemanticRevision,
        appliedControls: {
          colorMode: appliedControlsSnapshot?.colorMode,
          volumeColorRgb: appliedControlsSnapshot?.volumeColor,
          surfaceColorRgb: appliedControlsSnapshot?.surfaceColor,
          effectiveGeometry:
            inputs.runtimeState?.effectiveCavityGeometry ?? "rectangular",
        },
        appliedControlRevision: appliedControlVersionRef.current,
      };
    };
    registerStructureExportSampleReader(reader);
    return () => {
      registerStructureExportSampleReader(null);
    };
  }, [
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
    externalFeatureAuthorityActive,
    featureFrameResolverRef,
    registerStructureExportSampleReader,
    renderControlsRef,
  ]);
  const renderLoopRefs = {
    runtimeDiagnosticsRef,
    pixelRatioRef,
    renderSurfaceSizeRef,
    lastAudioIssueSignatureRef,
    lastLiveInputRuntimeStatusRef,
    frameCacheRefs,
    controlCacheRefs,
  };
  const renderLoopContext = {
    gl,
    scene,
    camera,
    ensurePipeline,
    postNodesRef,
    audioRef,
    runtimeRef,
    runtimeStateRef,
    audioFeatureRuntimeRef,
    controlsRef: renderControlsRef,
  };
  const renderProfileRef = useRef(renderProfile);
  const renderProfileKeyRef = useLazyRef(() =>
    getRenderQualityProfileKey(renderProfile),
  );
  const uiInteractionUntilMsRef = useRef(0);
  const latestUiInteractionRef = useRef({ source: null, kind: null });
  const lastObservedLiveControlSignalVersionRef = useRef(
    liveControlSignalRef?.current?.version ?? 0,
  );
  const forcedExternalRenderPendingRef = useRef(false);
  const framePacerStateRef = useLazyRef(createRenderFramePacerState);
  const framePacingFpsRef = useRef(framePacingFps);
  const pendingPacedLocalDeltaTimeRef = useRef(0);
  const fixtureRuntimeDriverRef = useLazyRef(() =>
    createRaymarchAuditFixtureRuntimeDriver({
      camera,
      scene,
      gl,
      runtimeRef,
      runtimeStateRef,
      controlsRef: renderControlsRef,
      renderProfileRef,
      postNodesRef,
      ensurePipeline,
      invalidate,
      restoreControls(snapshot) {
        renderControlsRef.current = { ...snapshot };
        clearFrameCache(frameCacheRefs);
        clearCachedControlsSnapshot(cachedControlSnapshotsRef);
        appliedControlVersionRef.current = -1;
        controlVersionRef.current += 1;
      },
    }),
  );

  useLayoutEffect(() => {
    renderProfileRef.current = renderProfile;
  }, [renderProfile]);

  useLayoutEffect(() => {
    framePacingFpsRef.current = framePacingFps;
  }, [framePacingFps]);

  useEffect(() => {
    if (!RAYMARCH_AUDIT_FIXTURE_ENABLED || typeof window === "undefined") {
      return undefined;
    }
    const driver = fixtureRuntimeDriverRef.current;
    window[RAYMARCH_AUDIT_FIXTURE_RUNTIME_ADAPTER_KEY] = driver.adapter;
    return () => {
      driver.dispose();
      if (
        window[RAYMARCH_AUDIT_FIXTURE_RUNTIME_ADAPTER_KEY] === driver.adapter
      ) {
        delete window[RAYMARCH_AUDIT_FIXTURE_RUNTIME_ADAPTER_KEY];
      }
    };
  }, [fixtureRuntimeDriverRef]);

  useEffect(() => {
    const renderCommandQueue = renderCommandQueueRef.current;

    return () => {
      lastAppliedExternalFrameSequenceRef.current = null;
      clearFrameCache(frameCacheRefs);
      lastLiveInputRuntimeStatusRef.current = null;
      runtimeDiagnosticsRef.current = createRuntimeDiagnostics();
      performanceHudStateRef.current = {
        lastPublishedAtMs: Number.NEGATIVE_INFINITY,
        wasPublishing: false,
      };
      lastAudioIssueSignatureRef.current = null;
      clearCachedControlsSnapshot(cachedControlSnapshotsRef);
      renderCommandQueue.clear();
      onPerformanceHudSnapshotChange?.(null);
      notifyAuditSnapshotChange?.({
        enabled: false,
        snapshot: null,
      });
      setLiveInputRuntimeStatus?.(createLiveInputRuntimeStatus());
      const defaultDpr = getDevicePixelRatio();
      gl.setPixelRatio(defaultDpr);
      pixelRatioRef.current = defaultDpr;
      renderSurfaceSizeRef.current = null;
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonAuditSnapshot;
        delete window.__baryonControlState;
      }
      resetBaryonTestReady();
    };
  }, [
    audioRef,
    camera,
    frameCacheRefs,
    gl,
    lastAudioIssueSignatureRef,
    lastLiveInputRuntimeStatusRef,
    pixelRatioRef,
    renderSurfaceSizeRef,
    renderCommandQueueRef,
    runtimeDiagnosticsRef,
    cachedControlSnapshotsRef,
    scene,
    onPerformanceHudSnapshotChange,
    notifyAuditSnapshotChange,
    setLiveInputRuntimeStatus,
  ]);

  useEffect(() => {
    resetAdaptiveRaymarchControllerState(runtimeStateRef.current);
    forcedExternalRenderPendingRef.current = true;
    invalidate();
  }, [adaptiveResetNonce, invalidate, runtimeStateRef]);

  useEffect(() => {
    lastAppliedExternalFrameSequenceRef.current = null;
    forcedExternalRenderPendingRef.current = true;
    invalidate();
  }, [audioFeatureAuthorityRole, invalidate]);

  useEffect(() => {
    if (cameraRenderKey == null) {
      return;
    }

    forcedExternalRenderPendingRef.current = true;
    invalidate();
  }, [cameraRenderKey, invalidate]);

  useEffect(() => {
    return installTailDiagnosticsWindowApi({
      recorder: tailDiagnosticsRef.current,
      getNowMs: getWallTimeMs,
    });
  }, [tailDiagnosticsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePerfMetricsReset = () => {
      runtimeDiagnosticsRef.current = createRuntimeDiagnostics();
      performanceHudStateRef.current = {
        lastPublishedAtMs: Number.NEGATIVE_INFINITY,
        wasPublishing: false,
      };
      lastAudioIssueSignatureRef.current = null;
      uiInteractionUntilMsRef.current = 0;
      latestUiInteractionRef.current = { source: null, kind: null };
      clearFrameCache(frameCacheRefs);
      delete window.__baryonPerfMetrics;
      onPerformanceHudSnapshotChange?.(null);
    };

    window.addEventListener(
      "__baryon-reset-perf-metrics",
      handlePerfMetricsReset,
    );
    return () => {
      window.removeEventListener(
        "__baryon-reset-perf-metrics",
        handlePerfMetricsReset,
      );
    };
  }, [
    frameCacheRefs,
    lastAudioIssueSignatureRef,
    onPerformanceHudSnapshotChange,
    runtimeDiagnosticsRef,
  ]);

  useEffect(() => {
    const nextRenderProfileKey = getRenderQualityProfileKey(renderProfile);
    if (renderProfileKeyRef.current === nextRenderProfileKey) {
      return;
    }

    renderProfileKeyRef.current = nextRenderProfileKey;
    // Profile-only output changes still need one forced draw so the external
    // frame path emits a fresh rendered frame and downstream sinks can republish.
    forcedExternalRenderPendingRef.current = true;
    invalidate();
  }, [invalidate, renderProfile, renderProfileKeyRef]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handleVisibilityChange = () => {
      runtimeDiagnosticsRef.current.lastVisibilityChange = {
        state: document.visibilityState,
        atWallTimeMs:
          typeof globalThis.performance?.now === "function"
            ? globalThis.performance.now()
            : 0,
      };
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [runtimeDiagnosticsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleUiInteraction = (event) => {
      const nowMs = getWallTimeMs();
      uiInteractionUntilMsRef.current = Math.max(
        uiInteractionUntilMsRef.current,
        nowMs + UI_INTERACTION_ADAPTIVE_SUPPRESSION_MS,
      );
      latestUiInteractionRef.current = {
        source: event?.detail?.source ?? null,
        kind: event?.detail?.kind ?? null,
      };
    };

    window.addEventListener(BARYON_UI_INTERACTION_EVENT, handleUiInteraction);
    return () => {
      window.removeEventListener(
        BARYON_UI_INTERACTION_EVENT,
        handleUiInteraction,
      );
    };
  }, []);

  useEffect(() => {
    if (!enableControlEventSync) {
      return undefined;
    }

    if (typeof window === "undefined") {
      return undefined;
    }

    const audio = audioRef.current;
    const handleAudioControlsChange = (event) => {
      const nextControls = event?.detail ?? controlsRef.current;
      void applyAudioControls(audio, nextControls).catch((error) => {
        console.error(
          "[Baryon audio] Failed to apply live input settings:",
          error,
        );
      });
    };

    handleAudioControlsChange();
    return subscribeControlsChanged(handleAudioControlsChange);
  }, [audioRef, controlsRef, enableControlEventSync]);

  const applyControlInvalidation = useCallback(
    (nextControls, { clearPausedFrameCache = false } = {}) => {
      cachedControlSnapshotsRef.current.controlsSnapshot = nextControls
        ? { ...nextControls }
        : null;

      controlVersionRef.current += 1;
      appliedControlVersionRef.current = -1;
      if (clearPausedFrameCache) {
        clearPausedRenderFrameCaches(frameCacheRefs);
      }
      return true;
    },
    [
      appliedControlVersionRef,
      cachedControlSnapshotsRef,
      controlVersionRef,
      frameCacheRefs,
    ],
  );

  useEffect(() => {
    if (
      !Number.isInteger(structuralControlVersion) ||
      structuralControlVersion <= 0
    ) {
      return;
    }

    renderCommandQueueRef.current.enqueueControlsChanged(controlsRef.current, {
      clearPausedFrameCache: true,
      source: "structural-version",
    });
    invalidate();
  }, [
    structuralControlVersion,
    controlsRef,
    invalidate,
    renderCommandQueueRef,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleControlsChange = (event) => {
      renderCommandQueueRef.current.enqueueControlsChanged(
        event?.detail ?? controlsRef.current,
        {
          // Live presentation controls redraw the current observation. They do
          // not revoke the audio-owned frame held while file playback is paused.
          clearPausedFrameCache: false,
          source: "controls-change",
        },
      );
      invalidate();
    };

    return subscribeControlsChanged(handleControlsChange);
  }, [controlsRef, invalidate, renderCommandQueueRef]);

  useEffect(
    () => () => {
      programFrameProducerRef.current.detach();
    },
    [programFrameProducerRef],
  );

  useFrame((state, rfDelta) => {
    const runtime = renderLoopContext.runtimeRef.current;
    const runtimeState = renderLoopContext.runtimeStateRef.current;
    if (!runtime || !runtimeState) {
      return;
    }
    // Runtime setup and React scene attachment are separate commits. Building
    // or compiling the PassNode graph in the gap can permanently cache an
    // empty WebGPU scene on Windows. The React commit that attaches the root
    // schedules the next demand frame, so wait for the canonical scene graph
    // before creating or preparing any output pipeline.
    if (!isProgramRootAttached(state.scene, runtimeState.points)) {
      programFrameProducerRef.current.detach();
      return;
    }
    if (fixtureRuntimeDriverRef.current.renderFixtureFrame()) {
      return;
    }

    const pendingControlsCommand =
      renderCommandQueueRef.current.drainControlsChanged();
    const controlCommandChanged = Boolean(pendingControlsCommand);
    if (pendingControlsCommand) {
      renderControlsRef.current = pendingControlsCommand.controls;
      applyControlInvalidation(renderControlsRef.current, {
        clearPausedFrameCache: pendingControlsCommand.clearPausedFrameCache,
      });
    }

    const pipeline = renderLoopContext.ensurePipeline();
    programFrameProducerRef.current.bindRenderer(
      pipeline ?? renderLoopContext.gl,
    );

    let controls = renderLoopContext.controlsRef.current;
    const nextLiveControlSignalVersion =
      liveControlSignalRef?.current?.version ?? 0;
    if (
      Number.isInteger(nextLiveControlSignalVersion) &&
      nextLiveControlSignalVersion >
        lastObservedLiveControlSignalVersionRef.current
    ) {
      lastObservedLiveControlSignalVersionRef.current =
        nextLiveControlSignalVersion;
      controls = controlsRef?.current ? { ...controlsRef.current } : controls;
      renderLoopContext.controlsRef.current = controls;
      applyControlInvalidation(controls);
    }
    const nextLocalCameraRenderSignalVersion =
      localCameraRenderSignalRef?.current?.version ?? 0;
    if (
      Number.isInteger(nextLocalCameraRenderSignalVersion) &&
      nextLocalCameraRenderSignalVersion >
        lastObservedLocalCameraRenderSignalVersionRef.current
    ) {
      lastObservedLocalCameraRenderSignalVersionRef.current =
        nextLocalCameraRenderSignalVersion;
      pendingLocalCameraRenderSignalRef.current = {
        version: nextLocalCameraRenderSignalVersion,
        phase: localCameraRenderSignalRef?.current?.phase ?? "change",
      };
    }
    const tailDiagnosticsActive = isTailDiagnosticsRecorderActive(
      tailDiagnosticsRef.current,
    );
    runtimeState.renderProbeEnabled =
      controls.auditEnabled === true || tailDiagnosticsActive;
    const audio = renderLoopContext.audioRef.current;
    const externalFrameCandidate = externalFeatureAuthorityActive
      ? (externalFrameRef?.current ?? null)
      : null;
    const externalFrameState = externalFrameCandidate?.featureFrame
      ? externalFrameCandidate
      : null;
    const fallbackClockSnapshot = externalFeatureAuthorityActive
      ? null
      : {
          status: audio.getStatus(),
          ...audio.readClockSnapshot(state.clock.getElapsedTime()),
        };
    const {
      status,
      clockMode,
      time,
      deltaTime,
      frameSequence: externalFrameSequence,
      frameIdentity: externalFrameIdentity,
      shouldAdvance,
    } = getSourceAuthoritativeClock({
      audioFeatureAuthorityRole,
      externalFrameState,
      lastAppliedFrameSequence: lastAppliedExternalFrameSequenceRef.current,
      fallbackClockSnapshot,
    });
    const pacedLocalFrame =
      externalFeatureAuthorityActive === false &&
      Number.isFinite(framePacingFpsRef.current) &&
      framePacingFpsRef.current > 0;
    // The source clock is sampled before the frame pacer can skip this tick.
    // Carry skipped elapsed time into the next rendered frame so motion stays
    // wall-clock consistent with an unpaced Listener surface.
    if (pacedLocalFrame) {
      if (Number.isFinite(deltaTime) && deltaTime > 0) {
        pendingPacedLocalDeltaTimeRef.current += deltaTime;
      }
    } else {
      pendingPacedLocalDeltaTimeRef.current = 0;
    }
    const stageRenderReceipt = {
      frameSequence: externalFrameSequence,
      qualityPreset: renderProfileRef.current?.qualityPreset ?? null,
    };
    const completeProgramFrame = (render) => {
      void programFrameProducerRef.current.produce({
        render,
        renderCanvas: renderLoopContext.gl.domElement,
        transferRequired: outputCompositorFrameTransfer === true,
        onFrame: onOutputCompositorFrame,
        receipt: stageRenderReceipt,
        onStageRender(receipt) {
          outputCompositorFrameErrorRef.current = null;
          onStageRender?.(receipt);
        },
        onError(error) {
          const errorSignature =
            error instanceof Error
              ? `${error.name}:${error.message}`
              : String(error);
          if (outputCompositorFrameErrorRef.current !== errorSignature) {
            outputCompositorFrameErrorRef.current = errorSignature;
            console.error(
              "[Baryon output] GPU compositor frame transfer failed:",
              error,
            );
          }
        },
      });
    };
    const completePipelineFreeStageRender = () => {
      completeProgramFrame(() => {
        renderLoopContext.gl.setRenderTarget?.(null);
        renderLoopContext.gl.setMRT?.(null);
        renderLoopContext.gl.render(state.scene, state.camera);
      });
    };
    const { suppressPlaybackTelemetryActive, runtimeDiagnostics } =
      updateRendererDiagnostics(
        {
          state,
          controls,
          status,
          time,
          deltaTime,
          rfDelta,
          gl: renderLoopContext.gl,
          renderLoopRefs,
        },
        {
          getRequestedPixelRatio: () =>
            getRenderTargetPixelRatio(basePixelRatio),
        },
      );
    const uiInteractionActive =
      uiInteractionUntilMsRef.current > getWallTimeMs();
    if (runtimeDiagnostics.uiInteraction) {
      runtimeDiagnostics.uiInteraction.active = uiInteractionActive;
      runtimeDiagnostics.uiInteraction.holdUntilWallTimeMs =
        uiInteractionUntilMsRef.current;
      runtimeDiagnostics.uiInteraction.lastSource =
        latestUiInteractionRef.current.source;
      runtimeDiagnostics.uiInteraction.lastKind =
        latestUiInteractionRef.current.kind;
    }
    const shouldPublishHudSnapshot =
      controls.performanceHudEnabled || controls.auditEnabled;
    if (shouldPublishHudSnapshot) {
      publishPerformanceHudSnapshot({
        runtimeDiagnostics,
        onPerformanceHudSnapshotChange,
        performanceHudState: performanceHudStateRef.current,
      });
      performanceHudStateRef.current.wasPublishing = true;
    } else if (performanceHudStateRef.current.wasPublishing) {
      performanceHudStateRef.current.wasPublishing = false;
      performanceHudStateRef.current.lastPublishedAtMs =
        Number.NEGATIVE_INFINITY;
      onPerformanceHudSnapshotChange?.(null);
    }
    const applyCachedControlSnapshotsStartedAt = getWallTimeMs();
    const controlSnapshots = applyCachedControlSnapshots({
      controls,
      runtimeState,
      gl: renderLoopContext.gl,
      ensurePipeline: renderLoopContext.ensurePipeline,
      postNodesRef: renderLoopContext.postNodesRef,
      renderProfileRef,
      renderLoopRefs,
      surfaceOutputMode: outputMode,
    });
    recordMeasuredRuntimePerf(
      runtimeDiagnostics,
      "applyCachedControlSnapshotsMs",
      applyCachedControlSnapshotsStartedAt,
    );
    const {
      shared,
      output,
      visualization,
      bloom,
      audit,
      controlsChanged = false,
    } = controlSnapshots;
    const immediateControlRenderDue = controlCommandChanged;
    const pendingLocalCameraSignal = pendingLocalCameraRenderSignalRef.current;
    const localCameraForceRender = shouldForceLocalCameraRender(
      pendingLocalCameraSignal,
      lastLocalCameraRenderAtMsRef.current,
      getWallTimeMs(),
    );
    // External frames own the render cadence; the pacer only gates the
    // free-running local path so a 60fps policy does not render every tick on
    // high-refresh displays. Camera force renders bypass it: they are already
    // throttled and guarantee the end-of-drag pose is presented.
    const framePacedRenderDue = externalFeatureAuthorityActive
      ? Boolean(externalFrameState) ||
        forcedExternalRenderPendingRef.current ||
        localCameraForceRender ||
        immediateControlRenderDue
      : localCameraForceRender ||
        immediateControlRenderDue ||
        consumeRenderFramePacerSlot(
          framePacerStateRef.current,
          framePacingFpsRef.current,
          getWallTimeMs(),
        );
    if (
      !framePacedRenderDue ||
      !shouldRenderExternalFrame({
        externalFeatureAuthorityActive,
        externalFrameState,
        shouldAdvance,
        controlsChanged,
        forceRender:
          forcedExternalRenderPendingRef.current ||
          localCameraForceRender ||
          immediateControlRenderDue,
      })
    ) {
      return;
    }
    if (pendingLocalCameraSignal) {
      pendingLocalCameraRenderSignalRef.current = null;
      lastLocalCameraRenderAtMsRef.current = getWallTimeMs();
    }
    const renderedDeltaTime = pacedLocalFrame
      ? pendingPacedLocalDeltaTimeRef.current
      : deltaTime;
    pendingPacedLocalDeltaTimeRef.current = 0;
    if (!externalFeatureAuthorityActive) {
      latestFeatureResolverInputsRef.current = {
        featureRuntime: renderLoopContext.audioFeatureRuntimeRef.current,
        runtimeState,
        controls,
        status,
        clockMode,
        renderLoopRefs,
      };
    }
    const resolvedFrame = externalFeatureAuthorityActive
      ? externalFrameState?.featureFrame
        ? {
            featureFrame: externalFrameState.featureFrame,
            effectiveFrame: externalFrameState.featureFrame,
          }
        : {
            featureFrame: null,
            effectiveFrame: null,
          }
      : featureFrameResolverRef.current.resolve({
          featureRuntime: renderLoopContext.audioFeatureRuntimeRef.current,
          runtimeDiagnostics,
          runtimeState,
          controls,
          status,
          clockMode,
          renderLoopRefs,
        });
    const {
      featureFrame,
      effectiveFrame,
      preparationFrame = null,
    } = resolvedFrame;

    fixtureRuntimeDriverRef.current.observeAuthoritativeFrame(effectiveFrame);

    if (!featureFrame || !effectiveFrame) {
      const runtimeTickStartedAt = getWallTimeMs();
      const preparationResult = preparationFrame
        ? runtime.prepare?.({
            renderer: renderLoopContext.gl,
            scene: renderLoopContext.scene,
            camera: renderLoopContext.camera,
            runtimeState,
            featureFrame: preparationFrame,
          })
        : null;
      if (preparationResult?.prepared !== true) {
        runtime.failClosed?.({
          renderer: renderLoopContext.gl,
          runtimeState,
          status,
          time,
          deltaTime: renderedDeltaTime,
        });
      }
      // Fail-closed revokes field authority, while scene controls still own
      // the idle overlay's continuous motion.
      applySceneControls(runtimeState, controls, renderedDeltaTime, null);
      syncUploadedRenderQuantities(runtimeDiagnostics, runtimeState);
      updateCymaticObserverRenderDiagnostics(
        runtimeDiagnostics,
        runtimeState?.debugSnapshot,
        runtimeState,
      );
      recordMeasuredRuntimePerf(
        runtimeDiagnostics,
        "runtimeTickMs",
        runtimeTickStartedAt,
      );
      // A missing first feature frame is still an authoritative program state:
      // publish the idle layer for transparent and opaque sinks alike. Waiting
      // for live pixels here deadlocks native bootstrap because Screen/Spout
      // are consumers and cannot be allowed to trigger a render themselves.
      if (!suppressRender) {
        const pipelineRenderStartedAt = getWallTimeMs();
        if (pipeline) {
          syncRenderOutputNodeTopology(
            pipeline,
            renderLoopContext.postNodesRef.current,
            {
              outputMode: output.outputMode,
              temporalHistoryEnabled: false,
              smaaEnabled: output?.smaaEnabled !== false,
            },
          );
          completeProgramFrame(() =>
            renderPipelineFrame(renderLoopContext, pipeline),
          );
        } else {
          // WebGL intentionally has no post-process pipeline. It must still
          // draw and acknowledge the fail-closed idle frame so a native sink
          // can complete bootstrap before live input exists.
          completePipelineFreeStageRender();
        }
        recordMeasuredRuntimePerf(
          runtimeDiagnostics,
          "pipelineRenderMs",
          pipelineRenderStartedAt,
        );
      }
      if (externalFeatureAuthorityActive) {
        forcedExternalRenderPendingRef.current = false;
      }
      return;
    }

    updateModalFreshnessDiagnostics(runtimeDiagnostics, effectiveFrame);

    const effectiveRaymarchSteps = updateAdaptiveRaymarchStepBudget({
      controls,
      runtime,
      runtimeState,
      renderProfile: renderProfileRef.current,
      effectiveFrame,
      status,
      runtimeDiagnostics,
    });

    const effectiveBloomEnabled = Boolean(
      controls.bloomEnabled && (renderProfileRef.current?.bloomAllowed ?? true),
    );
    if (runtimeDiagnostics?.render) {
      runtimeDiagnostics.render.visualizationMethod = runtime.method ?? null;
      runtimeDiagnostics.render.qualityPreset =
        renderProfileRef.current?.qualityPreset ?? null;
      runtimeDiagnostics.render.traaEnabled =
        renderProfileRef.current?.traaEnabled ?? false;
      runtimeDiagnostics.render.bloomAllowed =
        renderProfileRef.current?.bloomAllowed ?? false;
      runtimeDiagnostics.render.bloomEnabled = effectiveBloomEnabled;
      runtimeDiagnostics.render.requestedRaymarchSteps =
        runtimeState?.requestedRaymarchSteps ??
        Math.round(controls.raymarchSteps ?? 0);
      runtimeDiagnostics.render.effectiveRaymarchSteps =
        runtimeState?.effectiveRaymarchSteps ?? effectiveRaymarchSteps;
      runtimeDiagnostics.render.raymarchStepBudget = usesRaymarchVolumePipeline(
        runtime.method,
      )
        ? runtimeDiagnostics.render.effectiveRaymarchSteps
        : 0;
      runtimeDiagnostics.render.adaptiveRaymarchActive = Boolean(
        runtimeDiagnostics.adaptiveRaymarch?.adaptiveRaymarchActive,
      );
      runtimeDiagnostics.render.adaptiveStepDownCount =
        runtimeDiagnostics.adaptiveRaymarch?.stepDownCount ?? 0;
      runtimeDiagnostics.render.adaptiveStepUpCount =
        runtimeDiagnostics.adaptiveRaymarch?.stepUpCount ?? 0;
      const renderProfileTargetFps = isAdaptivePerformanceProfile(
        renderProfileRef.current?.qualityPreset,
      )
        ? getRenderQualityProfileTargetFps(renderProfileRef.current)
        : null;
      runtimeDiagnostics.render.targetFps =
        renderProfileTargetFps ??
        runtimeDiagnostics.adaptiveRaymarch?.targetFps ??
        60;
      runtimeDiagnostics.render.targetFrameTimeMs =
        runtimeDiagnostics.render.targetFps > 0
          ? 1000 / runtimeDiagnostics.render.targetFps
          : (runtimeDiagnostics.adaptiveRaymarch?.targetFrameTimeMs ??
            1000 / 60);
      runtimeDiagnostics.render.activeModeCount =
        effectiveFrame?.activeModeCount ??
        effectiveFrame?.activeModalFieldModeCount ??
        effectiveFrame?.modalDescriptor?.counts?.modalFieldModeCount ??
        0;
      runtimeDiagnostics.render.complexityScore =
        runtimeState?.raymarchFieldAnalysis?.complexityScore ?? 0;
      runtimeDiagnostics.render.uploadedModeCount =
        runtimeState?.raymarchFieldAnalysis?.uploadedModeCount ??
        runtimeDiagnostics.render.activeModeCount;
      runtimeDiagnostics.render.originalModeCount =
        runtimeState?.raymarchFieldAnalysis?.originalModeCount ??
        runtimeDiagnostics.render.activeModeCount;
    }
    if (runtimeDiagnostics?.postProcess) {
      runtimeDiagnostics.postProcess.traaNodeActive = Boolean(
        renderLoopContext.postNodesRef.current?.traaNode,
      );
      runtimeDiagnostics.postProcess.bloomPassPresent = Boolean(
        renderLoopContext.postNodesRef.current?.bloomPass,
      );
      runtimeDiagnostics.postProcess.bloomComposeEnabled = Boolean(
        renderLoopContext.postNodesRef.current?.bloomPass &&
        effectiveBloomEnabled,
      );
      const postNodes = renderLoopContext.postNodesRef.current;
      runtimeDiagnostics.postProcess.smaaGraphEnabled =
        getRenderOutputSmaaGraphEnabled(postNodes);
      runtimeDiagnostics.postProcess.temporalHistoryBlend =
        postNodes?.temporalHistoryBlendUniform?.value ?? null;
      runtimeDiagnostics.postProcess.temporalHistoryGraphEnabled =
        getRenderOutputTemporalHistoryGraphEnabled(postNodes);
    }

    if (externalFrameState?.featureFrame) {
      lastAppliedExternalFrameSequenceRef.current =
        externalFrameIdentity ?? externalFrameSequence;
    }
    forcedExternalRenderPendingRef.current = false;

    const syncLiveInputRuntimeStatusStartedAt = getWallTimeMs();
    syncLiveInputRuntimeStatus({
      status,
      featureFrame: effectiveFrame,
      liveInputUiState,
      liveInputErrorCode,
      setLiveInputRuntimeStatus,
      renderLoopRefs,
    });
    recordMeasuredRuntimePerf(
      runtimeDiagnostics,
      "syncLiveInputRuntimeStatusMs",
      syncLiveInputRuntimeStatusStartedAt,
    );

    const runtimeTickStartedAt = getWallTimeMs();
    runtime.tick({
      renderer: renderLoopContext.gl,
      runtimeState,
      featureFrame: effectiveFrame,
      time,
      deltaTime: renderedDeltaTime,
    });
    const visualIdleFinalizer = finalizeTerminalVisualIdleState({
      featureFrame: effectiveFrame,
      runtimeState,
      postNodes: renderLoopContext.postNodesRef.current,
    });
    syncUploadedRenderQuantities(runtimeDiagnostics, runtimeState);
    updateCymaticObserverRenderDiagnostics(
      runtimeDiagnostics,
      runtimeState?.debugSnapshot,
      runtimeState,
    );
    if (tailDiagnosticsActive) {
      recordTailDiagnosticsSample(tailDiagnosticsRef.current, {
        runtimeDiagnostics,
        featureFrame: effectiveFrame,
        runtimeState,
        nowMs: getWallTimeMs(),
      });
    }
    recordMeasuredRuntimePerf(
      runtimeDiagnostics,
      "runtimeTickMs",
      runtimeTickStartedAt,
    );
    updateModalEnvelopeDiagnostics(runtimeDiagnostics, runtimeState);

    const applySceneControlsStartedAt = getWallTimeMs();
    const externalSceneSnapshot = externalFrameState?.sceneSnapshot ?? null;
    const sceneSnapshot =
      externalFrameState?.featureFrame && externalSceneSnapshot
        ? applyExternalSceneSnapshot(runtimeState, externalSceneSnapshot)
        : applySceneControls(
            runtimeState,
            controls,
            renderedDeltaTime,
            featureFrame,
          );
    recordMeasuredRuntimePerf(
      runtimeDiagnostics,
      "applySceneControlsMs",
      applySceneControlsStartedAt,
    );
    publishDevtoolsSnapshots(
      {
        devtoolsEnabled: DEVTOOLS_ENABLED,
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
        markRuntimeReady: markBaryonTestRuntimeReady,
        onAuditSnapshotChange: notifyAuditSnapshotChange,
      },
    );
    onFrameState?.({
      controls,
      controlsVersion: controlVersionRef.current,
      visualizationMethod: runtime.method,
      qualityPreset: renderProfileRef.current?.qualityPreset ?? null,
      resolvedRenderProfile: renderProfileRef.current,
      status,
      time,
      deltaTime: renderedDeltaTime,
      clockMode,
      featureFrame: effectiveFrame,
      sceneSnapshot,
      backgroundColor: controls.backgroundColor,
    });

    const shouldBypassTemporalHistory =
      shouldBypassTemporalHistoryForRaymarchFrame({
        runtimeMethod: runtime.method,
        featureFrame: effectiveFrame,
        sceneSnapshot,
        traaRequested: renderProfileRef.current?.traaEnabled === true,
      });

    if (!suppressRender && pipeline) {
      const pipelineRenderStartedAt = getWallTimeMs();
      const temporalHistoryBypassRequested =
        shouldBypassTemporalHistory ||
        visualIdleFinalizer.resumedFromVisualIdle;
      if (temporalHistoryBypassRequested) {
        markRenderOutputContentChange(renderLoopContext.postNodesRef.current);
        if (visualIdleFinalizer.resumedFromVisualIdle) {
          consumeRenderOutputVisualIdle(renderLoopContext.postNodesRef.current);
        }
      }
      syncRenderOutputNodeTopology(
        pipeline,
        renderLoopContext.postNodesRef.current,
        {
          outputMode: output?.outputMode ?? controls.outputMode,
          temporalHistoryEnabled: !temporalHistoryBypassRequested,
          smaaEnabled: output?.smaaEnabled ?? controls.smaaEnabled !== false,
        },
      );
      if (runtimeDiagnostics?.postProcess) {
        const postNodes = renderLoopContext.postNodesRef.current;
        runtimeDiagnostics.postProcess.smaaGraphEnabled =
          getRenderOutputSmaaGraphEnabled(postNodes);
        runtimeDiagnostics.postProcess.temporalHistoryGraphEnabled =
          getRenderOutputTemporalHistoryGraphEnabled(postNodes);
      }
      completeProgramFrame(() =>
        renderPipelineFrame(renderLoopContext, pipeline),
      );
      recordMeasuredRuntimePerf(
        runtimeDiagnostics,
        "pipelineRenderMs",
        pipelineRenderStartedAt,
      );
    } else if (!suppressRender) {
      const pipelineRenderStartedAt = getWallTimeMs();
      completePipelineFreeStageRender();
      recordMeasuredRuntimePerf(
        runtimeDiagnostics,
        "pipelineRenderMs",
        pipelineRenderStartedAt,
      );
    }

    maybePublishRuntimePerfSnapshot(runtimeDiagnostics);
  }, 1);

  return { points };
}
