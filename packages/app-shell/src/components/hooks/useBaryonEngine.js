import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
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
import {
  DEFAULT_VISUALIZATION_METHOD,
  usesRaymarchVolumePipeline,
} from "@baryon/engine/visualization/types";
import { getDefaultAudioSession } from "@baryon/engine/audio";
import { RENDER_DEFAULTS } from "@baryon/engine/defaults";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
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
import { shouldSkipSpectralStaticColorInvalidation } from "./controlInvalidation.js";
import {
  clearAdaptiveRaymarchResumeState,
  maybePublishRuntimePerfSnapshot,
  clearFrameCache,
  createRuntimeDiagnostics,
  recordRuntimePerfSample,
  shouldRenderExternalFrame,
  updateObservationTransferRenderDiagnostics,
} from "./baryonEngineRuntimeState.js";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import { createCaptureOutputSession } from "@baryon/engine/render/outputPipeline";
import {
  applyCachedControlSnapshots,
  applyReactiveBloomState,
  consumeRenderFramePacerSlot,
  createAuditSnapshotNotifier,
  createRenderFramePacerState,
  getDevicePixelRatio,
  getRenderTargetPixelRatio,
  publishPerformanceHudSnapshot,
  publishDevtoolsSnapshots,
  applyLiveInputRenderIntent,
  finalizeTerminalVisualIdleState,
  resolveFeatureFrame,
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
import { createRenderCommandQueue } from "./renderCommandQueue.js";

function clearCachedControlsSnapshot(cachedControlSnapshotsRef) {
  cachedControlSnapshotsRef.current.controlsSnapshot = null;
}

function clearPausedRenderFrameCaches(frameCacheRefs) {
  frameCacheRefs.lastActiveFrameRef.current = null;
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

  const rotation = runtimeState.points?.rotation ?? null;
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

  const idleLogoYaw = assignFiniteNumber(
    sceneMotion,
    "idleLogoYaw",
    sceneSnapshot.idleLogoYaw,
  );
  const idleOverlayRotationY = readFiniteNumber(
    sceneSnapshot.idleOverlayRotationY,
  );
  if (runtimeState.idleOverlay?.rotation && idleOverlayRotationY !== null) {
    runtimeState.idleOverlay.rotation.y = idleOverlayRotationY;
  } else if (
    runtimeState.idleOverlay?.rotation &&
    idleLogoYaw !== null &&
    rotationY !== null
  ) {
    runtimeState.idleOverlay.rotation.y = idleLogoYaw - rotationY;
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
  visualizationMethod = DEFAULT_VISUALIZATION_METHOD,
  ensurePipeline,
  postNodesRef,
  onPerformanceHudSnapshotChange,
  onAuditSnapshotChange,
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
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
}) {
  const { invalidate } = useThree();
  const audioRef = useRef(getDefaultAudioSession());
  const renderControlsRef = useRef(
    controlsRef?.current ? { ...controlsRef.current } : {},
  );
  const renderCommandQueueRef = useRef(createRenderCommandQueue());
  const outputSessionRef = useRef(null);
  const outputCaptureInFlightRef = useRef(false);
  const tailDiagnosticsRef = useRef(createTailDiagnosticsRecorder());
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
    audioFeatureRef,
    audioFeatureEngineRef,
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
    controlsRef: renderControlsRef,
    visualizationMethod,
    setIsEngineReady,
    setLiveInputRuntimeStatus,
  });
  const {
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  } = controlCacheRefs;
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
    ensurePipeline,
    postNodesRef,
    audioRef,
    runtimeRef,
    runtimeStateRef,
    audioFeatureRef,
    audioFeatureEngineRef,
    controlsRef: renderControlsRef,
  };
  const renderProfileRef = useRef(renderProfile);
  renderProfileRef.current = renderProfile;
  const renderProfileKeyRef = useRef(getRenderQualityProfileKey(renderProfile));
  const uiInteractionUntilMsRef = useRef(0);
  const latestUiInteractionRef = useRef({ source: null, kind: null });
  const lastObservedLiveControlSignalVersionRef = useRef(
    liveControlSignalRef?.current?.version ?? 0,
  );
  const forcedExternalRenderPendingRef = useRef(false);
  const framePacerStateRef = useRef(createRenderFramePacerState());
  const framePacingFpsRef = useRef(framePacingFps);
  framePacingFpsRef.current = framePacingFps;

  useEffect(() => {
    const audio = audioRef.current;
    const renderCommandQueue = renderCommandQueueRef.current;

    audio.attach(camera);
    gl.setClearColor(new THREE.Color(0x000000), 0);

    return () => {
      outputSessionRef.current?.dispose?.();
      outputSessionRef.current = null;
      outputCaptureInFlightRef.current = false;
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
    camera,
    frameCacheRefs,
    gl,
    lastAudioIssueSignatureRef,
    lastLiveInputRuntimeStatusRef,
    pixelRatioRef,
    renderSurfaceSizeRef,
    runtimeDiagnosticsRef,
    cachedControlSnapshotsRef,
    scene,
    onPerformanceHudSnapshotChange,
    notifyAuditSnapshotChange,
    setLiveInputRuntimeStatus,
  ]);

  useEffect(() => {
    clearAdaptiveRaymarchResumeState(runtimeStateRef.current);
    forcedExternalRenderPendingRef.current = true;
    invalidate();
  }, [adaptiveResetNonce, invalidate, runtimeStateRef]);

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
  }, []);

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
      audioFeatureEngineRef.current?.resetMetrics?.("dev-perf-probe-reset");
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
    audioFeatureEngineRef,
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
    clearAdaptiveRaymarchResumeState(runtimeStateRef.current);
    forcedExternalRenderPendingRef.current = true;
    invalidate();
  }, [invalidate, renderProfile, runtimeStateRef]);

  useEffect(() => {
    if (outputFrameConfig?.enabled) {
      return undefined;
    }

    outputSessionRef.current?.dispose?.();
    outputSessionRef.current = null;
    outputCaptureInFlightRef.current = false;
    return undefined;
  }, [outputFrameConfig?.enabled]);

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
    window.addEventListener(
      "__baryon-controls-change",
      handleAudioControlsChange,
    );
    return () => {
      window.removeEventListener(
        "__baryon-controls-change",
        handleAudioControlsChange,
      );
    };
  }, [controlsRef, enableControlEventSync]);

  const applyControlInvalidation = useCallback(
    (nextControls, { clearPausedFrameCache = false } = {}) => {
      const previousControls =
        cachedControlSnapshotsRef.current.controlsSnapshot;
      const shouldSkipInvalidation = shouldSkipSpectralStaticColorInvalidation(
        previousControls,
        nextControls,
      );
      cachedControlSnapshotsRef.current.controlsSnapshot = nextControls
        ? { ...nextControls }
        : null;

      if (shouldSkipInvalidation) {
        return false;
      }

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
  }, [structuralControlVersion, controlsRef, invalidate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleControlsChange = (event) => {
      renderCommandQueueRef.current.enqueueControlsChanged(
        event?.detail ?? controlsRef.current,
        {
          clearPausedFrameCache: true,
          source: "controls-change",
        },
      );
      invalidate();
    };

    window.addEventListener("__baryon-controls-change", handleControlsChange);
    return () => {
      window.removeEventListener(
        "__baryon-controls-change",
        handleControlsChange,
      );
    };
  }, [controlsRef, invalidate]);

  useFrame((state, rfDelta) => {
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
    const runtime = renderLoopContext.runtimeRef.current;
    const runtimeState = renderLoopContext.runtimeStateRef.current;
    const featureState = renderLoopContext.audioFeatureRef.current;

    if (!runtime || !runtimeState || !featureState) {
      return;
    }

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
    const externalFrameState = externalFrameRef?.current ?? null;
    const fallbackClockSnapshot = {
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
      externalFrameState,
      lastAppliedFrameSequence: lastAppliedExternalFrameSequenceRef.current,
      fallbackClockSnapshot,
    });
    const { lowLoadPlaybackDiagnosticsActive, runtimeDiagnostics } =
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
    const spectralLightEnabled =
      controls.colorMode === "spectral" &&
      (controls.spectralMix ?? RENDER_DEFAULTS.spectralMix) > 0;
    const applyCachedControlSnapshotsStartedAt = getWallTimeMs();
    const controlSnapshots = applyCachedControlSnapshots({
      controls,
      runtimeState,
      featureState,
      gl: renderLoopContext.gl,
      ensurePipeline: renderLoopContext.ensurePipeline,
      postNodesRef: renderLoopContext.postNodesRef,
      renderProfileRef,
      renderLoopRefs,
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
    const framePacedRenderDue =
      Boolean(externalFrameState) ||
      localCameraForceRender ||
      immediateControlRenderDue ||
      consumeRenderFramePacerSlot(
        framePacerStateRef.current,
        framePacingFpsRef.current,
        getWallTimeMs(),
      );
    if (
      !framePacedRenderDue ||
      !shouldRenderExternalFrame({
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
    const resolvedFrame = externalFrameState?.featureFrame
      ? {
          featureFrame: externalFrameState.featureFrame,
          effectiveFrame: externalFrameState.featureFrame,
        }
      : resolveFeatureFrame({
          audio,
          featureState,
          featureEngine: renderLoopContext.audioFeatureEngineRef.current,
          runtimeDiagnostics,
          runtimeState,
          controls,
          status,
          time,
          clockMode,
          renderLoopRefs,
          spectralLightEnabled,
        });
    const featureFrame = applyLiveInputRenderIntent(
      resolvedFrame.featureFrame,
      {
        status,
        liveInputUiState,
        liveControlSignal: liveControlSignalRef?.current,
      },
    );
    const effectiveFrame = applyLiveInputRenderIntent(
      resolvedFrame.effectiveFrame,
      {
        status,
        liveInputUiState,
        liveControlSignal: liveControlSignalRef?.current,
      },
    );

    if (!featureFrame || !effectiveFrame) {
      if (!suppressRender && pipeline && output?.outputMode === "opaque") {
        const pipelineRenderStartedAt = getWallTimeMs();
        syncRenderOutputNodeTopology(
          pipeline,
          renderLoopContext.postNodesRef.current,
          {
            bloomEnabled: output?.bloomEnabled === true,
            outputMode: output.outputMode,
            bloomActive: false,
            temporalHistoryEnabled: false,
            smaaEnabled: output?.smaaEnabled !== false,
          },
        );
        renderPipelineFrame(renderLoopContext, pipeline);
        recordMeasuredRuntimePerf(
          runtimeDiagnostics,
          "pipelineRenderMs",
          pipelineRenderStartedAt,
        );
        onStageRender?.({
          frameSequence: externalFrameSequence,
          qualityPreset: renderProfileRef.current?.qualityPreset ?? null,
        });
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
      deltaTime,
    });
    const visualIdleFinalizer = finalizeTerminalVisualIdleState({
      featureFrame: effectiveFrame,
      runtimeState,
      postNodes: renderLoopContext.postNodesRef.current,
    });
    syncUploadedRenderQuantities(runtimeDiagnostics, runtimeState);
    updateObservationTransferRenderDiagnostics(
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

    const reactiveBloomStartedAt = getWallTimeMs();
    const reactiveBloom = applyReactiveBloomState({
      controls,
      runtimeState,
      postNodesRef: renderLoopContext.postNodesRef,
      bloom,
    });
    recordMeasuredRuntimePerf(
      runtimeDiagnostics,
      "applyReactiveBloomMs",
      reactiveBloomStartedAt,
    );

    const applySceneControlsStartedAt = getWallTimeMs();
    const externalSceneSnapshot = externalFrameState?.sceneSnapshot ?? null;
    const sceneSnapshot =
      externalFrameState?.featureFrame && externalSceneSnapshot
        ? applyExternalSceneSnapshot(runtimeState, externalSceneSnapshot)
        : applySceneControls(runtimeState, controls, deltaTime, featureFrame);
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
        featureState,
        lowLoadPlaybackDiagnosticsActive,
        runtimeDiagnostics,
        shared,
        output,
        visualization,
        bloom: reactiveBloom,
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
      deltaTime,
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
      });

    if (suppressRender) {
      outputSessionRef.current?.dispose?.();
      outputSessionRef.current = null;
      outputCaptureInFlightRef.current = false;
    } else if (pipeline) {
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
          bloomEnabled: effectiveBloomEnabled,
          outputMode: controls.outputMode,
          bloomActive: effectiveBloomEnabled,
          temporalHistoryEnabled: !temporalHistoryBypassRequested,
          smaaEnabled: controls.smaaEnabled !== false,
        },
      );
      if (runtimeDiagnostics?.postProcess) {
        const postNodes = renderLoopContext.postNodesRef.current;
        runtimeDiagnostics.postProcess.smaaGraphEnabled =
          getRenderOutputSmaaGraphEnabled(postNodes);
        runtimeDiagnostics.postProcess.temporalHistoryGraphEnabled =
          getRenderOutputTemporalHistoryGraphEnabled(postNodes);
      }
      renderPipelineFrame(renderLoopContext, pipeline);
      recordMeasuredRuntimePerf(
        runtimeDiagnostics,
        "pipelineRenderMs",
        pipelineRenderStartedAt,
      );
      onStageRender?.({
        frameSequence: externalFrameSequence,
        qualityPreset: renderProfileRef.current?.qualityPreset ?? null,
      });
      if (outputFrameConfig?.enabled && onOutputFrame) {
        const { width, height } = outputFrameConfig;
        const currentSession = outputSessionRef.current;
        const needsNewSession =
          !currentSession ||
          currentSession.width !== width ||
          currentSession.height !== height;

        if (needsNewSession) {
          currentSession?.dispose?.();
          outputSessionRef.current = createCaptureOutputSession(
            renderLoopContext.gl,
            scene,
            state.camera,
            width,
            height,
            { renderProfile: renderProfileRef.current },
          );
          outputCaptureInFlightRef.current = false;
        }

        const outputSession = outputSessionRef.current;
        if (outputSession && !outputCaptureInFlightRef.current) {
          outputCaptureInFlightRef.current = true;
          outputSession.renderFrame();
          void outputSession
            .readPixelsAsync()
            .then((rgba) => onOutputFrame({ width, height, rgba }))
            .catch((error) => {
              console.error(
                "[Baryon output] Production output capture failed:",
                error,
              );
            })
            .finally(() => {
              outputCaptureInFlightRef.current = false;
            });
        }
      }
    } else {
      outputSessionRef.current?.dispose?.();
      outputSessionRef.current = null;
      outputCaptureInFlightRef.current = false;
      const pipelineRenderStartedAt = getWallTimeMs();
      renderLoopContext.gl.setRenderTarget?.(null);
      renderLoopContext.gl.setMRT?.(null);
      renderLoopContext.gl.render(state.scene, state.camera);
      recordMeasuredRuntimePerf(
        runtimeDiagnostics,
        "pipelineRenderMs",
        pipelineRenderStartedAt,
      );
      onStageRender?.({
        frameSequence: externalFrameSequence,
        qualityPreset: renderProfileRef.current?.qualityPreset ?? null,
      });
    }

    maybePublishRuntimePerfSnapshot(runtimeDiagnostics);
  }, 1);

  return points;
}
