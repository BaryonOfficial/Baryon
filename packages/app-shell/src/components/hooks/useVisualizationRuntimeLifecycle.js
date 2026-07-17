import { useEffect, useRef, useState } from "react";
import { createVisualizationRuntime } from "@baryon/engine/visualization/runtime";
import {
  AUDIO_FEATURE_AUTHORITY_ROLES,
  createAudioFeatureRuntime,
} from "@baryon/engine/audio-features";
import {
  CAVITY_ACOUSTIC_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/engine/defaults";
import { createLiveInputRuntimeStatus } from "../../context/liveInputRuntimeStatus.js";
import { subscribeControlsChanged } from "../../controls/controlsEvents.js";
import {
  clearFrameCache,
  clearAdaptiveRaymarchResumeState,
  createEmptyControlSnapshots,
  createRuntimeDiagnostics,
  initializeAdaptiveRaymarchRuntimeState,
} from "./baryonEngineRuntimeState.js";

function buildAudioFeatureRuntimeConfiguration(controls = {}) {
  return {
    radius: SIMULATION_DEFAULTS.radius,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: controls.boundaryMode ?? SIMULATION_DEFAULTS.boundaryMode,
    cavityGeometry:
      controls.cavityGeometry ?? SIMULATION_DEFAULTS.cavityGeometry,
    includeSpectralLight:
      controls.colorMode === "spectral" &&
      (controls.spectralMix ?? RENDER_DEFAULTS.spectralMix) > 0,
    auditSettings: {
      enabled: controls.auditEnabled === true,
      freezeModeSlots: controls.freezeModeSlots === true,
      forceWebGLFallbackTest: controls.forceWebGLFallbackTest === true,
      lowLoadPlaybackDiagnostics: controls.lowLoadPlaybackDiagnostics === true,
      injectTestTone: controls.injectTestTone === true,
      testToneHz: controls.testToneHz,
      testToneSignal: controls.testToneSignal,
      testToneAmplitude: controls.testToneAmplitude,
      logEveryFrames: controls.logEveryFrames,
    },
  };
}

export function useVisualizationRuntimeLifecycle({
  audioRef,
  baryonGeometry,
  controlsRef,
  visualizationMethod,
  audioFeatureAuthorityRole = AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
  audioFeatureConfigurationVersion = 0,
  setIsEngineReady,
  setLiveInputRuntimeStatus,
}) {
  const runtimeRef = useRef(null);
  const runtimeStateRef = useRef(null);
  const audioFeatureRuntimeRef = useRef(null);
  const initialAudioFeatureAuthorityRoleRef = useRef(audioFeatureAuthorityRole);
  const [initialAudioFeatureConfiguration] = useState(() =>
    buildAudioFeatureRuntimeConfiguration(controlsRef?.current),
  );
  const initialAudioFeatureConfigurationRef = useRef(
    initialAudioFeatureConfiguration,
  );
  const initialAudioFeatureConfigurationVersionRef = useRef(
    audioFeatureConfigurationVersion,
  );
  const lastCommandedAudioFeatureAuthorityRoleRef = useRef(null);
  const lastCommandedAudioFeatureConfigurationVersionRef = useRef(null);
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
    const audioSession = audioRef.current;
    if (!audioSession) {
      return undefined;
    }

    const featureRuntime = createAudioFeatureRuntime({}, { audioSession });
    audioFeatureRuntimeRef.current = featureRuntime;
    featureRuntime.configure(initialAudioFeatureConfigurationRef.current);
    lastCommandedAudioFeatureConfigurationVersionRef.current =
      initialAudioFeatureConfigurationVersionRef.current;
    featureRuntime.setAuthorityRole(
      initialAudioFeatureAuthorityRoleRef.current,
    );
    lastCommandedAudioFeatureAuthorityRoleRef.current =
      initialAudioFeatureAuthorityRoleRef.current;
    featureRuntime.start();

    return () => {
      featureRuntime.dispose();
      if (audioFeatureRuntimeRef.current === featureRuntime) {
        audioFeatureRuntimeRef.current = null;
      }
    };
  }, [audioRef]);

  useEffect(() => {
    if (
      lastCommandedAudioFeatureAuthorityRoleRef.current ===
      audioFeatureAuthorityRole
    ) {
      return;
    }
    const featureRuntime = audioFeatureRuntimeRef.current;
    if (!featureRuntime) {
      return;
    }
    featureRuntime.setAuthorityRole(audioFeatureAuthorityRole);
    lastCommandedAudioFeatureAuthorityRoleRef.current =
      audioFeatureAuthorityRole;
  }, [audioFeatureAuthorityRole]);

  useEffect(() => {
    if (
      lastCommandedAudioFeatureConfigurationVersionRef.current ===
      audioFeatureConfigurationVersion
    ) {
      return;
    }
    audioFeatureRuntimeRef.current?.configure(
      buildAudioFeatureRuntimeConfiguration(controlsRef?.current),
    );
    lastCommandedAudioFeatureConfigurationVersionRef.current =
      audioFeatureConfigurationVersion;
  }, [audioFeatureConfigurationVersion, controlsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleControlsChange = (event) => {
      audioFeatureRuntimeRef.current?.configure(
        buildAudioFeatureRuntimeConfiguration(
          event?.detail ?? controlsRef?.current,
        ),
      );
    };
    return subscribeControlsChanged(handleControlsChange);
  }, [controlsRef]);

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

    try {
      const runtime = createVisualizationRuntime(visualizationMethod);
      runtimeRef.current = runtime;
      const audioStatus = audio.getStatus();
      const parameters = {
        radius: SIMULATION_DEFAULTS.radius,
        // This is apparatus calibration, not user state. Keeping it outside
        // the control snapshot makes sharpness invariant across sessions.
        carrierCoreFwhmWorld: SIMULATION_DEFAULTS.carrierCoreFwhmWorld,
        volumeShape:
          initialControlsSnapshot?.volumeShape ??
          SIMULATION_DEFAULTS.volumeShape,
      };
      const audioConfig = {
        capacity: audioStatus.capacity,
        fftSize: audioStatus.fftSize,
        sampleRate: audioStatus.sampleRate,
      };

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
      setIsEngineReadyRef.current?.(true);
    } catch (error) {
      console.error("[BaryonScene] Setup failed:", error);
    }

    return () => {
      const runtime = runtimeRef.current;
      setIsEngineReadyRef.current?.(false);
      setPoints(null);
      if (typeof window !== "undefined") {
        delete (/** @type {any} */ (window).__baryonPerfMetrics);
      }
      if (runtimeStateRef.current) {
        clearAdaptiveRaymarchResumeState(runtimeStateRef.current);
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      clearFrameCache(frameCacheRefs);
      lastLiveInputRuntimeStatusRef.current = null;
      cachedControlSnapshotsRef.current = createEmptyControlSnapshots(null);
      setLiveInputRuntimeStatusRef.current?.(createLiveInputRuntimeStatus());
    };
  }, [
    audioRef,
    baryonGeometry,
    controlsRef,
    frameCacheRefs,
    visualizationMethod,
  ]);

  return {
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
  };
}
