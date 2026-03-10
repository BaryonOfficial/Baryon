import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyAuditControls,
  applyBloomControls,
  applyParticleControls,
  applyParticleSceneControls,
  applySharedControls,
  buildControlInspectionSnapshot,
  createVisualizationRuntime,
  DEFAULT_VISUALIZATION_METHOD,
  getDefaultAudioSession,
  setupLoaders,
  createAudioFeatureState,
  buildAudioFeatureFrame,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/visualizer";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";

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
  const runtimeRef = useRef(createVisualizationRuntime(DEFAULT_VISUALIZATION_METHOD));
  const runtimeStateRef = useRef(null);
  const [points, setPoints] = useState(null);

  useEffect(() => {
    const audio = getDefaultAudioSession();
    const runtime = runtimeRef.current;
    audioRef.current = audio;

    audio.attach(camera);
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

        const audioStatus = audio.getStatus();
        const parameters = {
          count: SIMULATION_DEFAULTS.particleCount,
          radius: SIMULATION_DEFAULTS.radius,
          surfaceRatio: SIMULATION_DEFAULTS.surfaceRatio,
          surfaceThreshold: SIMULATION_DEFAULTS.surfaceThreshold,
          threshold: SIMULATION_DEFAULTS.threshold,
        };
        const audioConfig = {
          capacity: audioStatus.capacity,
          fftSize: audioStatus.fftSize,
          sampleRate: audioStatus.sampleRate,
        };

        audioFeatureRef.current = createAudioFeatureState(audioConfig.capacity);
        const runtimeState = runtime.setup({
          baryonGeometry: instance.geometry,
          parameters,
          audioConfig,
        });
        runtimeStateRef.current = runtimeState;
        setPoints(runtimeState.points);
      } catch (error) {
        console.error("[BaryonScene] Setup failed:", error);
      }
    })();

    return () => {
      audio.dispose();
      if (runtimeStateRef.current) {
        runtime.dispose(runtimeStateRef.current);
      }
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonAuditSnapshot;
        delete window.__baryonControlState;
      }
    };
  }, [camera, gl, setIsAudioLoaded, setIsPlaying]);

  useFrame((state) => {
    const pipeline = ensurePipeline();
    const runtimeState = runtimeStateRef.current;
    const featureState = audioFeatureRef.current;

    if (!pipeline || !runtimeState || !featureState) {
      return;
    }

    const controls = controlsRef.current;
    const audio = audioRef.current;
    const status = audio.getStatus();
    const analysisSnapshot = audio.readAnalysisSnapshot();

    const bloomSnapshot = applyBloomControls({ ensurePipeline, postNodesRef }, controls);
    const sharedSnapshot = applySharedControls(gl, controls);
    const particleSnapshot = applyParticleControls(runtimeState, controls);
    const auditSnapshot = applyAuditControls(featureState, controls);

    const { time, deltaTime } = audio.readClockSnapshot(state.clock.getElapsedTime());
    const featureFrame = buildAudioFeatureFrame({
      analysisSnapshot,
      featureState,
      radius: runtimeState.uniforms.uRadius.value,
      status,
    });

    runtimeRef.current.tick({
      renderer: gl,
      runtimeState,
      featureFrame,
      time,
      deltaTime,
    });

    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      window.__baryonAuditSnapshot = {
        visualizationMethod: runtimeRef.current.method,
        ...runtimeState.debugSnapshot,
      };
    }

    if (DEVTOOLS_ENABLED && controls.auditEnabled && runtimeState.debugSnapshot) {
      const frame = featureState.audit?.frame ?? 0;
      const interval = Math.max(1, Math.floor(controls.logEveryFrames));
      if (frame % interval === 0) {
        console.log("[Baryon audit]", {
          visualizationMethod: runtimeRef.current.method,
          ...runtimeState.debugSnapshot,
        });
      }
    }

    const sceneSnapshot = applyParticleSceneControls(
      runtimeState.points,
      controls,
      deltaTime
    );

    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      window.__baryonControlState = buildControlInspectionSnapshot({
        method: runtimeRef.current.method,
        shared: sharedSnapshot,
        particle: particleSnapshot,
        bloom: bloomSnapshot,
        audit: auditSnapshot,
        scene: sceneSnapshot,
      });
    }

    pipeline.render();
  }, 1);

  return points;
}
