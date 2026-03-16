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
import {
  applyCachedControlSnapshots,
  getPlaybackDiagnosticDpr,
  publishDevtoolsSnapshots,
  resolveFeatureFrame,
  syncMicRuntimeStatus,
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
  setIsPlaying,
  setIsAudioLoaded,
  setIsEngineReady,
  setMicRuntimeStatus,
  micProfile,
  controlsRef,
  visualizationMethod = DEFAULT_VISUALIZATION_METHOD,
  ensurePipeline,
  postNodesRef,
}) {
  const audioRef = useRef(getDefaultAudioSession());
  const {
    points,
    runtimeRef,
    runtimeStateRef,
    audioFeatureRef,
    runtimeDiagnosticsRef,
    frameCacheRefs,
    controlCacheRefs,
    pixelRatioRef,
    lastMicRuntimeStatusRef,
    lastAudioIssueSignatureRef,
  } = useVisualizationRuntimeLifecycle({
    audioRef,
    baryonGeometry,
    controlsRef,
    micProfile,
    visualizationMethod,
    setIsEngineReady,
    setMicRuntimeStatus,
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
    lastMicRuntimeStatusRef,
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
    controlsRef,
    micProfile,
  };

  useEffect(() => {
    const audio = audioRef.current;

    audio.attach(camera);
    gl.setClearColor(new THREE.Color(0x000000), 0);
    if (gl.shadowMap) {
      gl.shadowMap.enabled = true;
    }

    audio.setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    return () => {
      audio.setAudioEndedCallback(null);
      clearFrameCache(frameCacheRefs);
      const lastMicProfile =
        lastMicRuntimeStatusRef.current?.profile ?? "voice-tone";
      lastMicRuntimeStatusRef.current = null;
      runtimeDiagnosticsRef.current = createRuntimeDiagnostics();
      lastAudioIssueSignatureRef.current = null;
      clearCachedControlsSnapshot(cachedControlSnapshotsRef);
      setMicRuntimeStatus?.({
        active: false,
        calibrating: false,
        profile: lastMicProfile,
      });
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
    lastMicRuntimeStatusRef,
    pixelRatioRef,
    runtimeDiagnosticsRef,
    cachedControlSnapshotsRef,
    setIsAudioLoaded,
    setIsPlaying,
    setMicRuntimeStatus,
  ]);

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
        console.error("[Baryon audio] Failed to apply mic settings:", error);
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

  useFrame((state) => {
    const pipeline = renderLoopContext.ensurePipeline();
    const runtime = renderLoopContext.runtimeRef.current;
    const runtimeState = renderLoopContext.runtimeStateRef.current;
    const featureState = renderLoopContext.audioFeatureRef.current;

    if (!runtime || !runtimeState || !featureState) {
      return;
    }

    const controls = renderLoopContext.controlsRef.current;
    const audio = renderLoopContext.audioRef.current;
    const status = audio.getStatus();
    const { clockMode, time, deltaTime } = audio.readClockSnapshot(
      state.clock.getElapsedTime(),
    );
    const { lowLoadActive, runtimeDiagnostics } = updateRendererDiagnostics({
      state,
      controls,
      status,
      time,
      deltaTime,
      gl: renderLoopContext.gl,
      renderLoopRefs,
    });
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
    const { featureFrame, effectiveFrame } = resolveFeatureFrame({
      audio,
      featureState,
      runtimeState,
      controls,
      status,
      time,
      clockMode,
      micProfile: renderLoopContext.micProfile,
      renderLoopRefs,
      chromesthesiaEnabled,
    });
    syncMicRuntimeStatus({
      status,
      featureFrame,
      micProfile: renderLoopContext.micProfile,
      setMicRuntimeStatus,
      renderLoopRefs,
    });

    runtime.tick({
      renderer: renderLoopContext.gl,
      runtimeState,
      featureFrame: effectiveFrame,
      time,
      deltaTime,
    });

    if (
      controls.bloomEnabled &&
      renderLoopContext.postNodesRef.current?.bloomPass
    ) {
      renderLoopContext.postNodesRef.current.bloomPass.strength.value =
        bloom.strength * (1 + (runtimeState.bloomResponseSignal ?? 0) * 0.16);
    }

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
        bloom,
        audit,
        sceneSnapshot,
        audio,
      },
      {
        markRuntimeReady: markBaryonTestRuntimeReady,
      },
    );

    if (pipeline) {
      pipeline.render();
    } else {
      renderLoopContext.gl.render(state.scene, state.camera);
    }
  }, 1);

  return points;
}
