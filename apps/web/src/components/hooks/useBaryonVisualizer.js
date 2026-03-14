import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyAudioControls,
  applyAuditControls,
  applyBloomControls,
  applyVisualizationControls,
  applySharedControls,
  applySceneControls,
  buildControlInspectionSnapshot,
  createVisualizationRuntime,
  DEFAULT_VISUALIZATION_METHOD,
  getDefaultAudioSession,
  createAudioFeatureState,
  buildAudioFeatureFrame,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/visualizer";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
import {
  markBaryonTestRuntimeReady,
  resetBaryonTestReady,
} from "../../devtools/testReady.js";

function snapshotFeatureFrame(featureFrame) {
  return {
    ...featureFrame,
    backboneSlots:
      featureFrame.backboneSlots instanceof Float32Array
        ? new Float32Array(featureFrame.backboneSlots)
        : featureFrame.backboneSlots,
    detailSlots:
      featureFrame.detailSlots instanceof Float32Array
        ? new Float32Array(featureFrame.detailSlots)
        : featureFrame.detailSlots,
    bandEnergies:
      featureFrame.bandEnergies instanceof Float32Array
        ? new Float32Array(featureFrame.bandEnergies)
        : featureFrame.bandEnergies,
    modeSlots:
      featureFrame.modeSlots instanceof Float32Array
        ? new Float32Array(featureFrame.modeSlots)
        : featureFrame.modeSlots,
    fftMagnitudes:
      featureFrame.fftMagnitudes instanceof Float32Array
        ? new Float32Array(featureFrame.fftMagnitudes)
        : featureFrame.fftMagnitudes,
  };
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
  ensurePipeline,
  postNodesRef,
}) {
  const audioRef = useRef(null);
  const audioFeatureRef = useRef(null);
  const runtimeRef = useRef(
    createVisualizationRuntime(DEFAULT_VISUALIZATION_METHOD),
  );
  const runtimeStateRef = useRef(null);
  const lastLiveFrameRef = useRef(null);
  const lastActiveFrameRef = useRef(null);
  const lastMicRuntimeStatusRef = useRef(null);
  const [points, setPoints] = useState(null);

  useEffect(() => {
    const audio = getDefaultAudioSession();
    const runtime = runtimeRef.current;
    audioRef.current = audio;

    audio.attach(camera);
    gl.setClearColor(new THREE.Color(RENDER_DEFAULTS.backgroundColor));
    if (gl.shadowMap) {
      gl.shadowMap.enabled = true;
    }

    audio.setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    return () => {
      setIsEngineReady?.(false);
      setPoints(null);
      audio.setAudioEndedCallback(null);
      if (runtimeStateRef.current) {
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
      const lastMicProfile =
        lastMicRuntimeStatusRef.current?.profile ?? "voice-tone";
      lastMicRuntimeStatusRef.current = null;
      setMicRuntimeStatus?.({
        active: false,
        calibrating: false,
        profile: lastMicProfile,
      });
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonAuditSnapshot;
        delete window.__baryonControlState;
      }
      resetBaryonTestReady();
    };
  }, [
    camera,
    gl,
    setIsAudioLoaded,
    setIsEngineReady,
    setIsPlaying,
    setMicRuntimeStatus,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const audio = audioRef.current ?? getDefaultAudioSession();
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
    const audio = audioRef.current;
    const runtime = runtimeRef.current;

    if (!audio || !baryonGeometry) {
      setIsEngineReady?.(false);
      setPoints(null);
      return undefined;
    }

    setIsEngineReady?.(false);
    setPoints(null);

    try {
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
      setPoints(runtimeState.points);
      setIsEngineReady?.(true);
    } catch (error) {
      console.error("[BaryonScene] Setup failed:", error);
    }

    return () => {
      setIsEngineReady?.(false);
      setPoints(null);
      if (runtimeStateRef.current) {
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
      audioFeatureRef.current = null;
      lastMicRuntimeStatusRef.current = null;
      setMicRuntimeStatus?.({
        active: false,
        calibrating: false,
        profile: micProfile ?? "voice-tone",
      });
    };
  }, [baryonGeometry, micProfile, setIsEngineReady, setMicRuntimeStatus]);

  useFrame((state) => {
    const pipeline = ensurePipeline();
    const runtimeState = runtimeStateRef.current;
    const featureState = audioFeatureRef.current;

    if (!runtimeState || !featureState) {
      return;
    }

    const controls = controlsRef.current;
    const audio = audioRef.current;
    const status = audio.getStatus();
    const analysisSnapshot = audio.readAnalysisSnapshot();

    const bloomSnapshot = applyBloomControls(
      { ensurePipeline, postNodesRef, runtimeState },
      controls,
    );
    const audioSnapshot = audio.getMicSettings();
    const sharedSnapshot = applySharedControls(gl, controls);
    const visualizationSnapshot = applyVisualizationControls(
      runtimeRef.current.method,
      runtimeState,
      controls,
    );
    const auditSnapshot = applyAuditControls(featureState, controls);

    const { clockMode, time, deltaTime } = audio.readClockSnapshot(
      state.clock.getElapsedTime(),
    );
    if (clockMode === "paused-playback" && !lastActiveFrameRef.current) {
      const liveFrame = lastLiveFrameRef.current;
      if (liveFrame) {
        lastActiveFrameRef.current = snapshotFeatureFrame(liveFrame);
      }
    }
    const featureFrame = buildAudioFeatureFrame({
      analysisSnapshot,
      featureState,
      radius: runtimeState.uniforms.uRadius.value,
      status,
      frameTimeMs: time * 1000,
      micAnalysisSettings: {
        profile: micProfile,
      },
    });
    const nextMicRuntimeStatus = status.isMicActive
      ? {
          active: true,
          calibrating: Boolean(featureFrame.debug?.micCalibrationActive),
          profile: featureFrame.debug?.micProfile ?? micProfile ?? "voice-tone",
        }
      : {
          active: false,
          calibrating: false,
          profile: micProfile ?? "voice-tone",
        };
    const previousMicRuntimeStatus = lastMicRuntimeStatusRef.current;
    if (
      !previousMicRuntimeStatus ||
      previousMicRuntimeStatus.active !== nextMicRuntimeStatus.active ||
      previousMicRuntimeStatus.calibrating !==
        nextMicRuntimeStatus.calibrating ||
      previousMicRuntimeStatus.profile !== nextMicRuntimeStatus.profile
    ) {
      lastMicRuntimeStatusRef.current = nextMicRuntimeStatus;
      setMicRuntimeStatus?.(nextMicRuntimeStatus);
    }

    if (status.isPlaying || status.isMicActive) {
      lastLiveFrameRef.current = featureFrame;
      lastActiveFrameRef.current = null;
    } else if (clockMode !== "paused-playback") {
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
    }
    const effectiveFrame =
      clockMode === "paused-playback" && lastActiveFrameRef.current
        ? lastActiveFrameRef.current
        : featureFrame;

    runtimeRef.current.tick({
      renderer: gl,
      runtimeState,
      featureFrame: effectiveFrame,
      time,
      deltaTime,
    });

    if (controls.bloomEnabled && postNodesRef.current?.bloomPass) {
      postNodesRef.current.bloomPass.strength.value =
        bloomSnapshot.strength *
        (1 + (runtimeState.bloomResponseSignal ?? 0) * 0.16);
    }

    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      window.__baryonAuditSnapshot = {
        visualizationMethod: runtimeRef.current.method,
        renderer: window.__baryonRendererInfo ?? null,
        ...runtimeState.debugSnapshot,
      };
    }

    if (
      DEVTOOLS_ENABLED &&
      controls.auditEnabled &&
      runtimeState.debugSnapshot
    ) {
      const frame = featureState.audit?.frame ?? 0;
      const interval = Math.max(1, Math.floor(controls.logEveryFrames));
      if (frame % interval === 0) {
        console.log("[Baryon audit]", {
          visualizationMethod: runtimeRef.current.method,
          renderer: window.__baryonRendererInfo ?? null,
          ...runtimeState.debugSnapshot,
        });
      }
    }

    const sceneSnapshot = applySceneControls(
      runtimeState,
      controls,
      deltaTime,
      featureFrame,
      status,
    );

    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      window.__baryonControlState = buildControlInspectionSnapshot({
        method: runtimeRef.current.method,
        audio: audioSnapshot,
        shared: sharedSnapshot,
        raymarch: visualizationSnapshot,
        bloom: bloomSnapshot,
        audit: auditSnapshot,
        scene: sceneSnapshot,
      });
      markBaryonTestRuntimeReady();
    }

    if (pipeline) {
      pipeline.render();
    } else {
      gl.render(state.scene, state.camera);
    }
  }, 1);

  return points;
}
