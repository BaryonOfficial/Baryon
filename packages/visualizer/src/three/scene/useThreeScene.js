import { useEffect } from "react";
import * as THREE from "three";
import { setupScene } from "./setupScene";
import { postProcessingSetup } from "../postProcessing/postProcessingSetup";
import { gpgpuSetup, disposeGPGPUResources, tickGPGPU } from "../../core/gpgpuSetup";
import { particlesSetup } from "../../core/particlesSetup";
import { createTimeHandler } from "../../utils/timeHandler";
import { loadModelAndSetup } from "../../utils/loadModelAndSetup";
import { setupLoaders } from "../loaders/setupLoaders";
import { handleResize } from "./handleResize";
import { DEFAULTS } from "../../defaults.js";
import { getDefaultAudioContext } from "../../core/audio/audioSetup";

export default function useThreeScene(
  canvasRef,
  setIsPlaying,
  setIsAudioLoaded,
  onSetupComplete
) {
  useEffect(() => {
    let particles, gpgpu, essentiaData;
    let effectComposer, renderer;
    let animFrameId;
    let isMounted = true;

    // Setup the scene, camera, renderer, and controls
    const {
      scene,
      sizes,
      camera,
      controls,
      renderer: _renderer,
    } = setupScene(canvasRef);
    renderer = _renderer;

    // Setup resize handler
    const onResize = () =>
      handleResize({ sizes, camera, renderer, effectComposer, particles });

    const debugObject = { backgroundColor: DEFAULTS.backgroundColor };
    const { gltfLoader } = setupLoaders();

    // Use the shared default audio context (same instance used by useAudioLogic's module exports)
    const audio = getDefaultAudioContext();

    // Setup audio context and listener (must run before building audioConfig)
    audio.setup(camera);

    // Handle time logic — reads live audio state each frame
    const timeHandler = createTimeHandler(audio.getState);

    // Setup post-processing effects (bloom, composer)
    const { effectComposer: composer, unrealBloomPass } = postProcessingSetup(
      renderer,
      scene,
      camera,
      sizes
    );
    effectComposer = composer;

    // Particle system parameters
    const parameters = {
      count: DEFAULTS.particleCount,
      radius: DEFAULTS.radius,
      threshold: DEFAULTS.threshold,
      surfaceRatio: DEFAULTS.surfaceRatio,
      surfaceThreshold: DEFAULTS.surfaceThreshold,
      targetFPS: DEFAULTS.targetFPS,
    };

    // Allocate memory for particles positions and colors
    const baseGeometry = {
      count: parameters.count,
      positions: new Float32Array(parameters.count * 3),
    };
    const colors = new Float32Array(baseGeometry.count * 3);

    // Snapshot of audio state at setup time — passed to engine modules
    // so they don't need to import audioObject directly
    const audioState = audio.getState();
    const audioConfig = {
      capacity: audioState.capacity,
      fftSize: audioState.fftSize,
      sampleRate: audioState.audioCtx.sampleRate,
      fftData: audioState.analyser.data,
      soundStarted: audioState.sound.started,
      gumStreamActive: audioState.gumStream?.active ?? false,
    };

    // Load model and initialize particles and GPGPU
    (async () => {
      try {
        const result = await loadModelAndSetup({
          gltfLoader,
          scene,
          renderer,
          parameters,
          baseGeometry,
          colors,
          sizes,
          gpgpuSetup,
          particlesSetup,
          audioConfig,
        });

        if (!isMounted) {
          disposeGPGPUResources(result.gpgpu);
          result.particles.geometry.dispose();
          result.particles.material.dispose();
          return;
        }

        gpgpu = result.gpgpu;
        essentiaData = result.essentiaData;
        particles = result.particles;
        const materialParameters = result.materialParameters;

        // Notify app layer that setup is complete (e.g. to initialize GUI)
        onSetupComplete?.({
          unrealBloomPass,
          renderer,
          particles,
          gpgpu,
          debugObject,
          materialParameters,
          parameters,
        });
      } catch (err) {
        console.error('[useThreeScene] Model/GPGPU setup failed:', err);
      }
    })();

    // Setup animation timing
    const clock = new THREE.Clock();
    const rotationTime = { current: 0 };
    const rotationMatrix = new THREE.Matrix4();

    // Main animation loop
    const tick = () => {
      animFrameId = requestAnimationFrame(tick);

      // Skip frames until the async model/GPGPU setup resolves
      if (!gpgpu || !particles) return;

      // Compute time deltas
      const elapsedTime = clock.getElapsedTime();
      const { time, deltaTime } = timeHandler(elapsedTime);

      // Update camera controls
      controls.update(deltaTime);

      // Pass time and sound state to rendering shader
      const liveState = audio.getState();
      particles.material.uniforms.uSoundPlaying.value = liveState.sound.isPlaying;
      particles.material.uniforms.uTime.value = time;
      particles.material.uniforms.uDeltaTime.value = deltaTime;

      // Process audio + compute GPGPU updates
      audio.processAudioData(gpgpu, particles, essentiaData);
      tickGPGPU(gpgpu, particles, time, deltaTime, liveState);

      // Apply rotation transformation to the particle system
      rotationTime.current += deltaTime;
      rotationMatrix.makeRotationY(
        -rotationTime.current *
          0.5 *
          particles.material.uniforms.uRotation.value
      );
      particles.points.matrix.copy(rotationMatrix);
      particles.points.matrixAutoUpdate = false;

      // Render final output
      effectComposer.render();
    };

    // Start audio + rendering loop
    audio.startAudioProcessing(tick);

    // Callback for when audio finishes
    audio.setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    // Attach resize listener
    window.addEventListener("resize", onResize);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      cancelAnimationFrame(animFrameId);
      if (gpgpu) disposeGPGPUResources(gpgpu);
      if (particles) {
        particles.geometry.dispose();
        particles.material.dispose();
      }
      effectComposer?.dispose();
      const s = audio.getState();
      if (s.listener) camera.remove(s.listener);
      renderer.dispose();
      window.removeEventListener("resize", onResize);
    };
  }, [canvasRef, setIsPlaying, setIsAudioLoaded, onSetupComplete]);
}
