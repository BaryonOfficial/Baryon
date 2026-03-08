import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyAuditControls,
  applyBloomControls,
  applySceneControls,
  applySimulationControls,
  buildControlInspectionSnapshot,
  getDefaultAudioContext,
  createTimeHandler,
  setupLoaders,
  setupTSL,
  tickTSL,
  disposeTSL,
  createAudioFeatureState,
  buildAudioFeatureFrame,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/visualizer";

export function useBaryonVisualizer({
  camera,
  gl,
  setIsPlaying,
  setIsAudioLoaded,
  controlsRef,
  ensurePipeline,
  postNodesRef,
}) {
  const audioRef = useRef(null);
  const audioFeatureRef = useRef(null);
  const timeHandlerRef = useRef(null);
  const tslStateRef = useRef(null);
  const lastPitchSourceModeRef = useRef(null);
  const [points, setPoints] = useState(null);

  useEffect(() => {
    const audio = getDefaultAudioContext();
    audioRef.current = audio;

    audio.setup(camera);
    audio.startAudioProcessing();
    timeHandlerRef.current = createTimeHandler(audio.getState);
    gl.setClearColor(new THREE.Color(RENDER_DEFAULTS.backgroundColor));

    audio.setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    const { gltfLoader } = setupLoaders();

    (async () => {
      try {
        const gltf = await gltfLoader.loadAsync("./glb/Baryon_v2.glb");
        const instance = gltf.scene.children[0];
        instance.scale.set(0.2, 0.2, 0.2);
        instance.updateMatrix();
        instance.geometry.applyMatrix4(instance.matrix);

        const audioState = audio.getState();
        const parameters = {
          count: SIMULATION_DEFAULTS.particleCount,
          radius: SIMULATION_DEFAULTS.radius,
          surfaceRatio: SIMULATION_DEFAULTS.surfaceRatio,
          surfaceThreshold: SIMULATION_DEFAULTS.surfaceThreshold,
          threshold: SIMULATION_DEFAULTS.threshold,
        };
        const audioConfig = {
          capacity: audioState.capacity,
          fftSize: audioState.fftSize,
          sampleRate: audioState.audioCtx?.sampleRate ?? 44100,
        };

        audioFeatureRef.current = createAudioFeatureState(audioConfig.capacity);
        const tslState = setupTSL(instance.geometry, parameters, audioConfig);
        tslStateRef.current = tslState;
        setPoints(tslState.points);
      } catch (error) {
        console.error("[BaryonScene] Setup failed:", error);
      }
    })();

    return () => {
      const state = audio.getState();
      if (state.listener) camera.remove(state.listener);
      audio.disposeAnalysis?.();
      if (tslStateRef.current) disposeTSL(tslStateRef.current);
    };
  }, [camera, gl, setIsAudioLoaded, setIsPlaying]);

  useFrame((state) => {
    const pipeline = ensurePipeline();
    const tslState = tslStateRef.current;
    const featureState = audioFeatureRef.current;
    const timeHandler = timeHandlerRef.current;

    if (!pipeline || !tslState || !featureState || !timeHandler) {
      return;
    }

    const controls = controlsRef.current;
    const audio = audioRef.current;

    if (lastPitchSourceModeRef.current !== controls.pitchSourceMode) {
      audio?.setPitchSourceMode?.(controls.pitchSourceMode);
      lastPitchSourceModeRef.current = controls.pitchSourceMode;
    }

    const bloomSnapshot = applyBloomControls({ ensurePipeline, postNodesRef }, controls);
    const simulationSnapshot = applySimulationControls(gl, tslState, controls);
    const auditSnapshot = applyAuditControls(featureState, controls);

    const { time, deltaTime } = timeHandler(state.clock.getElapsedTime());
    const featureFrame = buildAudioFeatureFrame(
      audio.getState(),
      featureState,
      tslState.uniforms.uRadius.value
    );

    tickTSL(gl, tslState, featureFrame, time, deltaTime);

    if (typeof window !== "undefined") {
      window.__baryonAuditSnapshot = tslState.debugSnapshot;
    }

    if (controls.auditEnabled && tslState.debugSnapshot) {
      const frame = featureState.audit?.frame ?? 0;
      const interval = Math.max(1, Math.floor(controls.logEveryFrames));
      if (frame % interval === 0) {
        console.log("[Baryon audit]", tslState.debugSnapshot);
      }
    }

    const sceneSnapshot = applySceneControls(tslState.points, controls, deltaTime);

    if (typeof window !== "undefined" && import.meta.env.DEV) {
      window.__baryonControlState = buildControlInspectionSnapshot({
        simulation: simulationSnapshot,
        bloom: bloomSnapshot,
        audit: auditSnapshot,
        scene: sceneSnapshot,
      });
    }

    pipeline.render();
  }, 1);

  return points;
}
