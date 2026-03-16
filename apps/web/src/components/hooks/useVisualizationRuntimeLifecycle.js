import { useEffect, useRef, useState } from "react";
import { createVisualizationRuntime } from "@baryon/visualizer/visualization/runtime";
import { createAudioFeatureState } from "@baryon/visualizer/audio-features";
import { SIMULATION_DEFAULTS } from "@baryon/visualizer/defaults";
import {
  clearFrameCache,
  createEmptyControlSnapshots,
  createRuntimeDiagnostics,
} from "./baryonVisualizerRuntimeState.js";

export function useVisualizationRuntimeLifecycle({
  audioRef,
  baryonGeometry,
  controlsRef,
  micProfile,
  visualizationMethod,
  setIsEngineReady,
  setMicRuntimeStatus,
}) {
  const runtimeRef = useRef(createVisualizationRuntime(visualizationMethod));
  const runtimeStateRef = useRef(null);
  const audioFeatureRef = useRef(null);
  const lastLiveFrameRef = useRef(null);
  const lastActiveFrameRef = useRef(null);
  const lastIdleFrameRef = useRef(null);
  const lastMicRuntimeStatusRef = useRef(null);
  const controlVersionRef = useRef(0);
  const appliedControlVersionRef = useRef(-1);
  const runtimeDiagnosticsRef = useRef(createRuntimeDiagnostics());
  const pixelRatioRef = useRef(null);
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

      audioFeatureRef.current = createAudioFeatureState(audioConfig.capacity);
      const runtimeState = runtime.setup({
        baryonGeometry,
        parameters,
        audioConfig,
      });
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
      if (runtimeStateRef.current) {
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      clearFrameCache(frameCacheRefs);
      audioFeatureRef.current = null;
      lastMicRuntimeStatusRef.current = null;
      cachedControlSnapshotsRef.current = createEmptyControlSnapshots(null);
      setMicRuntimeStatus?.({
        active: false,
        calibrating: false,
        profile: micProfile ?? "voice-tone",
      });
    };
  }, [
    audioRef,
    baryonGeometry,
    controlsRef,
    frameCacheRefs,
    micProfile,
    setIsEngineReady,
    setMicRuntimeStatus,
    visualizationMethod,
  ]);

  return {
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
  };
}
