import { useEffect, useRef, useState } from "react";
import { createVisualizationRuntime } from "@baryon/engine/visualization/runtime";
import {
  createAudioFeatureEngine,
  createAudioFeatureState,
  createNoopAudioFeatureEngine,
} from "@baryon/engine/audio-features";
import { SIMULATION_DEFAULTS } from "@baryon/engine/defaults";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import {
  clearFrameCache,
  clearAdaptiveRaymarchResumeState,
  createEmptyAnalysisSchedulerState,
  createEmptyControlSnapshots,
  createRuntimeDiagnostics,
  initializeAdaptiveRaymarchRuntimeState,
} from "./baryonEngineRuntimeState.js";

export function useVisualizationRuntimeLifecycle({
  audioRef,
  baryonGeometry,
  controlsRef,
  visualizationMethod,
  setIsEngineReady,
  setLiveInputRuntimeStatus,
}) {
  const runtimeRef = useRef(createVisualizationRuntime(visualizationMethod));
  const runtimeStateRef = useRef(null);
  const audioFeatureRef = useRef(null);
  const audioFeatureEngineRef = useRef(createNoopAudioFeatureEngine());
  const lastLiveFrameRef = useRef(null);
  const lastActiveFrameRef = useRef(null);
  const lastIdleFrameRef = useRef(null);
  const pausedFileFrameRef = useRef(null);
  const analysisSchedulerRef = useRef(createEmptyAnalysisSchedulerState());
  const lastLiveInputRuntimeStatusRef = useRef(null);
  const controlVersionRef = useRef(0);
  const appliedControlVersionRef = useRef(-1);
  const runtimeDiagnosticsRef = useRef(createRuntimeDiagnostics());
  const pixelRatioRef = useRef(null);
  const renderSurfaceSizeRef = useRef(null);
  const lastAudioIssueSignatureRef = useRef(null);
  const cachedControlSnapshotsRef = useRef(
    createEmptyControlSnapshots(
      controlsRef?.current ? { ...controlsRef.current } : null,
    ),
  );
  const [points, setPoints] = useState(null);

  const frameCacheRefs = useRef({
    lastLiveFrameRef,
    lastActiveFrameRef,
    lastIdleFrameRef,
    pausedFileFrameRef,
    analysisSchedulerRef,
  }).current;
  const controlCacheRefs = useRef({
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  }).current;

  useEffect(() => {
    const audio = audioRef.current;
    const initialControlsSnapshot = controlsRef?.current
      ? { ...controlsRef.current }
      : null;

    if (!audio || !baryonGeometry) {
      setIsEngineReady?.(false);
      setPoints(null);
      return undefined;
    }

    setIsEngineReady?.(false);
    setPoints(null);

    try {
      const runtime = createVisualizationRuntime(visualizationMethod);
      runtimeRef.current = runtime;
      const audioStatus = audio.getStatus();
      const parameters = {
        radius: SIMULATION_DEFAULTS.radius,
      };
      const audioConfig = {
        capacity: audioStatus.capacity,
        fftSize: audioStatus.fftSize,
        sampleRate: audioStatus.sampleRate,
      };

      audioFeatureEngineRef.current?.dispose?.();
      audioFeatureEngineRef.current = createAudioFeatureEngine();
      audioFeatureRef.current = createAudioFeatureState(audioConfig.capacity);
      const runtimeState = runtime.setup({
        baryonGeometry,
        parameters,
        audioConfig,
      });
      initializeAdaptiveRaymarchRuntimeState(runtimeState);
      runtimeState.method = runtime.method;
      runtimeStateRef.current = runtimeState;
      cachedControlSnapshotsRef.current = createEmptyControlSnapshots(
        initialControlsSnapshot,
      );
      appliedControlVersionRef.current = -1;
      setPoints(runtimeState.points);
      setIsEngineReady?.(true);
    } catch (error) {
      console.error("[BaryonScene] Setup failed:", error);
    }

    return () => {
      const runtime = runtimeRef.current;
      setIsEngineReady?.(false);
      setPoints(null);
      if (typeof window !== "undefined") {
        delete (/** @type {any} */ (window).__baryonPerfMetrics);
      }
      if (runtimeStateRef.current) {
        clearAdaptiveRaymarchResumeState(runtimeStateRef.current);
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      audioFeatureEngineRef.current?.dispose?.();
      audioFeatureEngineRef.current = createNoopAudioFeatureEngine();
      clearFrameCache(frameCacheRefs);
      audioFeatureRef.current = null;
      lastLiveInputRuntimeStatusRef.current = null;
      cachedControlSnapshotsRef.current = createEmptyControlSnapshots(null);
      setLiveInputRuntimeStatus?.(createLiveInputRuntimeStatus());
    };
  }, [
    audioRef,
    baryonGeometry,
    controlsRef,
    frameCacheRefs,
    setIsEngineReady,
    setLiveInputRuntimeStatus,
    visualizationMethod,
  ]);

  return {
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
  };
}
