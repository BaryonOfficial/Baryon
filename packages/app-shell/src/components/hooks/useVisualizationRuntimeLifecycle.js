import { useEffect, useRef, useState } from "react";
import { createVisualizationRuntime } from "@baryon/engine/visualization/runtime";
import { SIMULATION_DEFAULTS } from "@baryon/engine/defaults";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import {
  clearFrameCache,
  createEmptyControlSnapshots,
  createRuntimeDiagnostics,
  initializeAdaptiveRaymarchRuntimeState,
  resetAdaptiveRaymarchControllerState,
} from "./baryonEngineRuntimeState.js";

export function useVisualizationRuntimeLifecycle({
  externalFeatureSource = null,
  audioRef,
  baryonGeometry,
  controlsRef,
  setIsEngineReady,
  setLiveInputRuntimeStatus,
  requestRender = null,
}) {
  const requestRenderRef = useRef(requestRender);
  const runtimeRef = useRef(null);
  const runtimeStateRef = useRef(null);
  const featureSourceRef = useRef(null);
  const lastIdleFrameRef = useRef(null);
  const pausedFileFrameRef = useRef(null);
  const lastLiveInputRuntimeStatusRef = useRef(null);
  const controlVersionRef = useRef(0);
  const appliedControlVersionRef = useRef(-1);
  const [initialRuntimeDiagnostics] = useState(createRuntimeDiagnostics);
  const runtimeDiagnosticsRef = useRef(initialRuntimeDiagnostics);
  const pixelRatioRef = useRef(null);
  const renderSurfaceSizeRef = useRef(null);
  const lastAudioIssueSignatureRef = useRef(null);
  const [initialControlSnapshots] = useState(() =>
    createEmptyControlSnapshots(
      controlsRef?.current ? { ...controlsRef.current } : null,
    ),
  );
  const cachedControlSnapshotsRef = useRef(initialControlSnapshots);
  const setIsEngineReadyRef = useRef(setIsEngineReady);
  const setLiveInputRuntimeStatusRef = useRef(setLiveInputRuntimeStatus);
  const [points, setPoints] = useState(null);

  const [frameCacheRefs] = useState(() => ({
    lastIdleFrameRef,
    pausedFileFrameRef,
  }));
  const [controlCacheRefs] = useState(() => ({
    controlVersionRef,
    appliedControlVersionRef,
    cachedControlSnapshotsRef,
  }));

  useEffect(() => {
    setIsEngineReadyRef.current = setIsEngineReady;
  }, [setIsEngineReady]);

  useEffect(() => {
    setLiveInputRuntimeStatusRef.current = setLiveInputRuntimeStatus;
  }, [setLiveInputRuntimeStatus]);

  useEffect(() => {
    requestRenderRef.current = requestRender;
  }, [requestRender]);

  useEffect(() => {
    const featureRuntime =
      externalFeatureSource ?? audioRef.current?.featureRuntime ?? null;
    featureSourceRef.current = featureRuntime;
    return () => {
      // A renderer relinquishes its reference, never the source processor.
      if (featureSourceRef.current === featureRuntime)
        featureSourceRef.current = null;
    };
  }, [audioRef, externalFeatureSource]);

  useEffect(() => {
    const audio = audioRef.current;
    const initialControlsSnapshot = controlsRef?.current
      ? { ...controlsRef.current }
      : null;

    if (!audio || !baryonGeometry) {
      setIsEngineReadyRef.current?.(false);
      setPoints(null);
      return undefined;
    }

    setIsEngineReadyRef.current?.(false);
    setPoints(null);

    let unsubscribeObservations = null;
    try {
      const runtime = createVisualizationRuntime();
      runtimeRef.current = runtime;
      const parameters = {
        radius: SIMULATION_DEFAULTS.radius,
        volumeShape:
          initialControlsSnapshot?.volumeShape ??
          SIMULATION_DEFAULTS.volumeShape,
      };

      const runtimeState = runtime.setup({
        baryonGeometry,
        parameters,
      });
      initializeAdaptiveRaymarchRuntimeState(runtimeState);
      runtimeState.method = runtime.method;
      runtimeStateRef.current = runtimeState;
      unsubscribeObservations = featureSourceRef.current.subscribeObservations(
        (model) => runtime.enqueueObservation({ runtimeState, model }),
        (error) => runtime.invalidatePresentation({ runtimeState, error }),
        () => {
          runtime.revokeObservations({ runtimeState });
          requestRenderRef.current?.();
        },
      );
      // A recreated renderer may replay the latest complete model once. This
      // cache read cannot send another audio bootstrap or restart capture.
      const latestModel = featureSourceRef.current.readLatestFeatureModel();
      if (latestModel)
        runtime.enqueueObservation({ runtimeState, model: latestModel });
      cachedControlSnapshotsRef.current = createEmptyControlSnapshots(
        initialControlsSnapshot,
      );
      appliedControlVersionRef.current = -1;
      setPoints(runtimeState.points);
      setIsEngineReadyRef.current?.(true);
    } catch (error) {
      console.error("[BaryonScene] Setup failed:", error);
    }

    return () => {
      unsubscribeObservations?.();
      const runtime = runtimeRef.current;
      setIsEngineReadyRef.current?.(false);
      setPoints(null);
      if (typeof window !== "undefined") {
        delete (/** @type {any} */ (window).__baryonPerfMetrics);
      }
      if (runtimeStateRef.current) {
        resetAdaptiveRaymarchControllerState(runtimeStateRef.current);
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
      clearFrameCache(frameCacheRefs);
      lastLiveInputRuntimeStatusRef.current = null;
      cachedControlSnapshotsRef.current = createEmptyControlSnapshots(null);
      setLiveInputRuntimeStatusRef.current?.(createLiveInputRuntimeStatus());
    };
  }, [
    audioRef,
    externalFeatureSource,
    baryonGeometry,
    controlsRef,
    frameCacheRefs,
  ]);

  return {
    points,
    runtimeRef,
    runtimeStateRef,
    featureSourceRef,
    runtimeDiagnosticsRef,
    frameCacheRefs,
    controlCacheRefs,
    pixelRatioRef,
    renderSurfaceSizeRef,
    lastLiveInputRuntimeStatusRef,
    lastAudioIssueSignatureRef,
  };
}
