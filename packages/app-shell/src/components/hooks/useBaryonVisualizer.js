import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
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
  clearFrameCache,
  createRuntimeDiagnostics,
  shouldPreservePausedFrameOnControlsChange,
} from "./baryonVisualizerRuntimeState.js";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import { createCaptureOutputSession } from "@baryon/visualizer/render/outputPipeline";
import {
  applyCachedControlSnapshots,
  applyReactiveBloomState,
  getPlaybackDiagnosticDpr,
  publishPerformanceHudSnapshot,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  syncLiveInputRuntimeStatus,
  updateRendererDiagnostics,
} from "./baryonVisualizerRenderLoop.js";
import { useVisualizationRuntimeLifecycle } from "./useVisualizationRuntimeLifecycle.js";

function clearCachedControlsSnapshot(cachedControlSnapshotsRef) {
  cachedControlSnapshotsRef.current.controlsSnapshot = null;
}

export function useBaryonVisualizer({
  baryonGeometry,
  camera,
  gl,
  scene,
  setIsEngineReady,
  setLiveInputRuntimeStatus,
  controlsRef,
  visualizationMethod = DEFAULT_VISUALIZATION_METHOD,
  ensurePipeline,
  postNodesRef,
  onPerformanceHudSnapshotChange,
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
  externalFrameRef = null,
}) {
  const audioRef = useRef(getDefaultAudioSession());
  const outputSessionRef = useRef(null);
  const outputCaptureInFlightRef = useRef(false);
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
    controlsRef,
  };

  useEffect(() => {
    const audio = audioRef.current;

    audio.attach(camera);
    gl.setClearColor(new THREE.Color(0x000000), 0);

    return () => {
      outputSessionRef.current?.dispose?.();
      outputSessionRef.current = null;
      outputCaptureInFlightRef.current = false;
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
    const status = externalFrameState?.status ?? audio.getStatus();
    const { clockMode, time, deltaTime } =
      externalFrameState ??
      audio.readClockSnapshot(state.clock.getElapsedTime());
    const { lowLoadActive, runtimeDiagnostics } = updateRendererDiagnostics({
      state,
      controls,
      status,
      time,
      deltaTime,
      rfDelta,
      gl: renderLoopContext.gl,
      renderLoopRefs,
    });
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
    const { shared, output, visualization, bloom, audit } =
      applyCachedControlSnapshots({
        controls,
        runtime,
        runtimeState,
        featureState,
        gl: renderLoopContext.gl,
        ensurePipeline: renderLoopContext.ensurePipeline,
        postNodesRef: renderLoopContext.postNodesRef,
        renderLoopRefs,
      });
    const { featureFrame, effectiveFrame } = externalFrameState?.featureFrame
      ? {
          featureFrame: externalFrameState.featureFrame,
          effectiveFrame: externalFrameState.featureFrame,
        }
      : resolveFeatureFrame({
          audio,
          featureState,
          featureAnalyzer: renderLoopContext.audioFeatureAnalyzerRef.current,
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

    syncLiveInputRuntimeStatus({
      status,
      setLiveInputRuntimeStatus,
      renderLoopRefs,
    });

    runtime.tick({
      renderer: renderLoopContext.gl,
      runtimeState,
      featureFrame: effectiveFrame,
      time,
      deltaTime,
    });

    const reactiveBloom = applyReactiveBloomState({
      controls,
      runtimeState,
      postNodesRef: renderLoopContext.postNodesRef,
      bloom,
    });

    const sceneSnapshot = applySceneControls(
      runtimeState,
      controls,
      deltaTime,
      featureFrame,
      status,
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

    if (pipeline) {
      pipeline.render();
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
      renderLoopContext.gl.render(state.scene, state.camera);
    }
  }, 1);

  return points;
}
