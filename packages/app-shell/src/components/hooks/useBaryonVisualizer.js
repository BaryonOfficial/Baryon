import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { resolveRaymarchFieldCacheOverride } from "@baryon/visualizer";
import {
  applyAudioControls,
  applySceneControls,
} from "@baryon/visualizer/controls/runtime";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";
import { getDefaultAudioSession } from "@baryon/visualizer/audio";
import { RENDER_DEFAULTS } from "@baryon/visualizer/defaults";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
import {
  markBaryonTestRuntimeReady,
  resetBaryonTestReady,
} from "../../devtools/testReady.js";
import { shouldSkipChromesthesiaStaticColorInvalidation } from "./controlInvalidation.js";
import {
  maybePublishRuntimePerfSnapshot,
  clearFrameCache,
  createRuntimeDiagnostics,
  recordRuntimePerfSample,
  shouldRenderExternalFrame,
  shouldPreservePausedFrameOnControlsChange,
} from "./baryonVisualizerRuntimeState.js";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import { createCaptureOutputSession } from "@baryon/visualizer/render/outputPipeline";
import {
  applyCachedControlSnapshots,
  applyReactiveBloomState,
  getPlaybackDiagnosticDpr,
  getEffectiveAdaptiveRenderScale,
  publishPerformanceHudSnapshot,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  syncLiveInputRuntimeStatus,
  updateAdaptiveRaymarchStepBudget,
  updateRendererDiagnostics,
} from "./baryonVisualizerRenderLoop.js";
import { useVisualizationRuntimeLifecycle } from "./useVisualizationRuntimeLifecycle.js";
import { getSourceAuthoritativeClock } from "./externalFrameClock.js";

function resolveFieldCacheOverrideControls(input, fallbackControls) {
  return input?.detail ?? input ?? fallbackControls;
}

function clearCachedControlsSnapshot(cachedControlSnapshotsRef) {
  cachedControlSnapshotsRef.current.controlsSnapshot = null;
}

function getWallTimeMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : 0;
}

function recordMeasuredRuntimePerf(runtimeDiagnostics, key, startedAt) {
  recordRuntimePerfSample(
    runtimeDiagnostics,
    key,
    Math.max(0, getWallTimeMs() - startedAt),
  );
}

export function useBaryonVisualizer({
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
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
  externalFrameRef = null,
  renderProfile = null,
  basePixelRatio = null,
  onStageRender = null,
  suppressRender = false,
}) {
  const audioRef = useRef(getDefaultAudioSession());
  const outputSessionRef = useRef(null);
  const outputCaptureInFlightRef = useRef(false);
  const lastAppliedExternalFrameSequenceRef = useRef(null);
  const performanceHudStateRef = useRef({
    lastPublishedAtMs: Number.NEGATIVE_INFINITY,
    wasVisible: false,
  });
  const {
    points,
    runtimeRef,
    runtimeStateRef,
    audioFeatureRef,
    audioFeatureAnalyzerRef,
    audioFeatureEngineRef,
    runtimeDiagnosticsRef,
    frameCacheRefs,
    controlCacheRefs,
    pixelRatioRef,
    lastLiveInputRuntimeStatusRef,
    lastAudioIssueSignatureRef,
  } = useVisualizationRuntimeLifecycle({
    audioRef,
    baryonGeometry,
    controlsRef,
    visualizationMethod,
    setIsEngineReady,
    setLiveInputRuntimeStatus,
  });
  const { lastActiveFrameRef, lastIdleFrameRef } = frameCacheRefs;
  const {
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  } = controlCacheRefs;
  const renderLoopRefs = {
    runtimeDiagnosticsRef,
    pixelRatioRef,
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
    audioFeatureAnalyzerRef,
    audioFeatureEngineRef,
    controlsRef,
  };
  const renderProfileRef = useRef(renderProfile);
  renderProfileRef.current = renderProfile;

  useEffect(() => {
    const audio = audioRef.current;

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
        wasVisible: false,
      };
      lastAudioIssueSignatureRef.current = null;
      clearCachedControlsSnapshot(cachedControlSnapshotsRef);
      onPerformanceHudSnapshotChange?.(null);
      setLiveInputRuntimeStatus?.(createLiveInputRuntimeStatus());
      const defaultDpr = getPlaybackDiagnosticDpr();
      gl.setPixelRatio(defaultDpr);
      pixelRatioRef.current = defaultDpr;
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonAuditSnapshot;
        delete window.__baryonControlState;
        delete window.__baryonFieldCacheOverride;
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
    runtimeDiagnosticsRef,
    cachedControlSnapshotsRef,
    scene,
    onPerformanceHudSnapshotChange,
    setLiveInputRuntimeStatus,
  ]);

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

    const syncFieldCacheOverride = (input = controlsRef.current) => {
      const nextControls = resolveFieldCacheOverrideControls(
        input,
        controlsRef.current,
      );
      window.__baryonFieldCacheOverride = resolveRaymarchFieldCacheOverride(
        nextControls?.fieldCacheOverride,
      );
    };

    syncFieldCacheOverride();
    window.addEventListener("__baryon-controls-change", syncFieldCacheOverride);
    return () => {
      window.removeEventListener(
        "__baryon-controls-change",
        syncFieldCacheOverride,
      );
      if (DEVTOOLS_ENABLED) {
        delete window.__baryonFieldCacheOverride;
      }
    };
  }, [controlsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const audio = audioRef.current;
    const syncAudioControls = (event) => {
      const nextControls = event?.detail ?? controlsRef.current;
      void applyAudioControls(audio, nextControls).catch((error) => {
        console.error(
          "[Baryon audio] Failed to apply live input settings:",
          error,
        );
      });
    };

    syncAudioControls();
    window.addEventListener("__baryon-controls-change", syncAudioControls);
    return () => {
      window.removeEventListener("__baryon-controls-change", syncAudioControls);
    };
  }, [controlsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleControlsChange = (event) => {
      const nextControls = event?.detail ?? controlsRef.current;
      const previousControls =
        cachedControlSnapshotsRef.current.controlsSnapshot;
      const shouldSkipInvalidation =
        shouldSkipChromesthesiaStaticColorInvalidation(
          previousControls,
          nextControls,
        );
      cachedControlSnapshotsRef.current.controlsSnapshot = nextControls
        ? { ...nextControls }
        : null;

      if (shouldSkipInvalidation) {
        return;
      }

      const preservePausedFrame = shouldPreservePausedFrameOnControlsChange(
        previousControls,
        nextControls,
      );

      controlVersionRef.current += 1;
      appliedControlVersionRef.current = -1;
      if (!preservePausedFrame) {
        lastActiveFrameRef.current = null;
        lastIdleFrameRef.current = null;
      }
    };

    window.addEventListener("__baryon-controls-change", handleControlsChange);
    return () => {
      window.removeEventListener(
        "__baryon-controls-change",
        handleControlsChange,
      );
    };
  }, [
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
    controlVersionRef,
    controlsRef,
    lastActiveFrameRef,
    lastIdleFrameRef,
  ]);

  useFrame((state, rfDelta) => {
    const pipeline = renderLoopContext.ensurePipeline();
    const runtime = renderLoopContext.runtimeRef.current;
    const runtimeState = renderLoopContext.runtimeStateRef.current;
    const featureState = renderLoopContext.audioFeatureRef.current;

    if (!runtime || !runtimeState || !featureState) {
      return;
    }

    const controls = renderLoopContext.controlsRef.current;
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
      shouldAdvance,
    } = getSourceAuthoritativeClock({
      externalFrameState,
      lastAppliedFrameSequence: lastAppliedExternalFrameSequenceRef.current,
      fallbackClockSnapshot,
    });
    const requestedRenderScale = renderProfileRef.current?.renderScale ?? 1;
    const currentEffectiveRenderScale = getEffectiveAdaptiveRenderScale(
      runtimeDiagnosticsRef.current,
      requestedRenderScale,
    );
    const { lowLoadActive, runtimeDiagnostics } = updateRendererDiagnostics(
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
        getTargetDpr: () => basePixelRatio ?? getPlaybackDiagnosticDpr(),
        renderScale: currentEffectiveRenderScale,
      },
    );
    if (controls.performanceHudEnabled) {
      publishPerformanceHudSnapshot({
        runtimeDiagnostics,
        onPerformanceHudSnapshotChange,
        performanceHudState: performanceHudStateRef.current,
      });
      performanceHudStateRef.current.wasVisible = true;
    } else if (performanceHudStateRef.current.wasVisible) {
      performanceHudStateRef.current.wasVisible = false;
      performanceHudStateRef.current.lastPublishedAtMs =
        Number.NEGATIVE_INFINITY;
      onPerformanceHudSnapshotChange?.(null);
    }
    const chromesthesiaEnabled =
      controls.colorMode === "chromesthesia" &&
      (controls.chromesthesiaMix ?? RENDER_DEFAULTS.chromesthesiaMix) > 0;
    const applyCachedControlSnapshotsStartedAt = getWallTimeMs();
    const controlSnapshots = applyCachedControlSnapshots({
      controls,
      runtime,
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
    if (
      !shouldRenderExternalFrame({
        externalFrameState,
        shouldAdvance,
        controlsChanged,
      })
    ) {
      return;
    }
    const { featureFrame, effectiveFrame } = externalFrameState?.featureFrame
      ? {
          featureFrame: externalFrameState.featureFrame,
          effectiveFrame: externalFrameState.featureFrame,
        }
      : resolveFeatureFrame({
          audio,
          featureState,
          featureAnalyzer: renderLoopContext.audioFeatureAnalyzerRef.current,
          featureEngine: renderLoopContext.audioFeatureEngineRef.current,
          runtimeDiagnostics,
          runtimeState,
          controls,
          status,
          time,
          clockMode,
          renderLoopRefs,
          chromesthesiaEnabled,
        });

    if (!featureFrame || !effectiveFrame) {
      return;
    }

    const effectiveRaymarchSteps = updateAdaptiveRaymarchStepBudget({
      controls,
      runtime,
      runtimeState,
      renderProfile: renderProfileRef.current,
      effectiveFrame,
      status,
      runtimeDiagnostics,
    });

    const bloomGovernorAllowed =
      runtimeState?.performanceGovernor?.bloomAllowed ?? true;
    const effectiveBloomEnabled = Boolean(
      controls.bloomEnabled &&
      (renderProfileRef.current?.bloomAllowed ?? true) &&
      bloomGovernorAllowed,
    );
    if (runtimeDiagnostics?.render) {
      const effectiveRenderScale = getEffectiveAdaptiveRenderScale(
        runtimeDiagnostics,
        requestedRenderScale,
      );
      runtimeDiagnostics.render.visualizationMethod = runtime.method ?? null;
      runtimeDiagnostics.render.qualityPreset =
        renderProfileRef.current?.qualityPreset ?? null;
      runtimeDiagnostics.render.requestedRenderScale = requestedRenderScale;
      runtimeDiagnostics.render.renderScale = effectiveRenderScale;
      runtimeDiagnostics.render.traaEnabled =
        renderProfileRef.current?.traaEnabled ?? false;
      runtimeDiagnostics.render.bloomAllowed =
        (renderProfileRef.current?.bloomAllowed ?? false) &&
        bloomGovernorAllowed;
      runtimeDiagnostics.render.bloomEnabled = effectiveBloomEnabled;
      runtimeDiagnostics.render.requestedRaymarchSteps =
        runtimeState?.requestedRaymarchSteps ??
        Math.round(controls.raymarchSteps ?? 0);
      runtimeDiagnostics.render.effectiveRaymarchSteps =
        runtimeState?.effectiveRaymarchSteps ?? effectiveRaymarchSteps;
      runtimeDiagnostics.render.raymarchStepBudget =
        runtime.method === "raymarch"
          ? runtimeDiagnostics.render.effectiveRaymarchSteps
          : 0;
      runtimeDiagnostics.render.adaptiveRaymarchActive = Boolean(
        runtimeDiagnostics.adaptiveRaymarch?.adaptiveRaymarchActive,
      );
      runtimeDiagnostics.render.adaptiveStepDownCount =
        runtimeDiagnostics.adaptiveRaymarch?.stepDownCount ?? 0;
      runtimeDiagnostics.render.adaptiveStepUpCount =
        runtimeDiagnostics.adaptiveRaymarch?.stepUpCount ?? 0;
      runtimeDiagnostics.render.targetFps =
        runtimeDiagnostics.adaptiveRaymarch?.targetFps ?? 60;
      runtimeDiagnostics.render.targetFrameTimeMs =
        runtimeDiagnostics.adaptiveRaymarch?.targetFrameTimeMs ?? 1000 / 60;
      runtimeDiagnostics.render.activeBackboneModeCount =
        effectiveFrame?.activeBackboneModeCount ?? 0;
      runtimeDiagnostics.render.activeDetailModeCount =
        effectiveFrame?.activeDetailModeCount ?? 0;
      runtimeDiagnostics.render.activeModeCount =
        effectiveFrame?.activeModeCount ??
        (effectiveFrame?.activeBackboneModeCount ?? 0) +
          (effectiveFrame?.activeDetailModeCount ?? 0);
      runtimeDiagnostics.render.complexityScore =
        runtimeState?.performanceGovernor?.complexityScore ?? 0;
      runtimeDiagnostics.render.uploadedModeCount =
        runtimeState?.performanceGovernor?.uploadedModeCount ??
        runtimeDiagnostics.render.activeModeCount;
      runtimeDiagnostics.render.originalModeCount =
        runtimeState?.performanceGovernor?.originalModeCount ??
        runtimeDiagnostics.render.activeModeCount;
      runtimeDiagnostics.render.proactiveRenderScale =
        runtimeState?.performanceGovernor?.proactiveRenderScale ??
        requestedRenderScale;
      runtimeDiagnostics.render.proactiveStepBudget =
        runtimeState?.performanceGovernor?.proactiveStepBudget ??
        runtimeDiagnostics.render.requestedRaymarchSteps;
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
    }

    if (externalFrameState?.featureFrame) {
      lastAppliedExternalFrameSequenceRef.current = externalFrameSequence;
    }

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
    recordMeasuredRuntimePerf(
      runtimeDiagnostics,
      "runtimeTickMs",
      runtimeTickStartedAt,
    );

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
    const sceneSnapshot = applySceneControls(
      runtimeState,
      controls,
      deltaTime,
      featureFrame,
      status,
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
        featureState,
        lowLoadActive,
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
      },
    );
    onFrameState?.({
      controls,
      controlsVersion: controlVersionRef.current,
      visualizationMethod: runtime.method,
      status,
      time,
      deltaTime,
      clockMode,
      featureFrame: effectiveFrame,
      backgroundColor: controls.backgroundColor,
    });

    if (suppressRender) {
      outputSessionRef.current?.dispose?.();
      outputSessionRef.current = null;
      outputCaptureInFlightRef.current = false;
    } else if (pipeline) {
      const pipelineRenderStartedAt = getWallTimeMs();
      pipeline.render();
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
