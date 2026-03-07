import { useEffect } from "react";
import * as THREE from "three";
import { setupScene } from "./setupScene";
import { postProcessingSetup } from "../postProcessing/postProcessingSetup";
import { guiSetup } from "../gui/guiSetup";
import { gpgpuSetup, disposeGPGPUResources } from "../../core/gpgpuSetup";
import { particlesSetup } from "../../core/particlesSetup";
import { createTimeHandler } from "../../utils/timeHandler";
import { loadModelAndSetup } from "../../utils/loadModelAndSetup";
import { setupLoaders } from "../loaders/setupLoaders";
import { initGUI } from "../gui/initGui";
import { handleResize } from "./handleResize";
import { DEFAULTS } from "../../defaults.js";
import {
  audioObject,
  audioSetup,
  processAudioData,
  startAudioProcessing,
  setAudioEndedCallback,
} from "../../core/audio/audioSetup";

export default function useThreeScene(
  canvasRef,
  guiContainerRef,
  setIsPlaying,
  setIsAudioLoaded
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

    // Create GUI and loaders
    const gui = initGUI(guiContainerRef);
    const debugObject = { backgroundColor: DEFAULTS.backgroundColor };
    const { gltfLoader } = setupLoaders();

    // Handle time logic
    const timeHandler = createTimeHandler(audioObject);

    // Setup audio context and listener (must run before building audioConfig)
    audioSetup(camera);

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
    const audioConfig = {
      capacity: audioObject.capacity,
      fftSize: audioObject.fftSize,
      sampleRate: audioObject.audioCtx.sampleRate,
      fftData: audioObject.analyser.data,
      soundStarted: audioObject.sound.started,
      gumStreamActive: audioObject.gumStream?.active ?? false,
    };

    // Load model and initialize particles and GPGPU
    (async () => {
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

      // Setup GUI controls
      guiSetup(
        gui,
        unrealBloomPass,
        renderer,
        particles,
        gpgpu,
        debugObject,
        materialParameters,
        parameters
      );
    })();

    // Setup animation timing
    const clock = new THREE.Clock();
    const rotationTime = { current: 0 };
    const rotationMatrix = new THREE.Matrix4();

    // Update textures from GPGPU simulation to shaders
    const updateGPGPUTextures = () => {
      gpgpu.scalarFieldVariable.material.uniforms.uAudioData.value =
        gpgpu.computation.getCurrentRenderTarget(
          gpgpu.audioDataVariable
        ).texture;
      gpgpu.zeroPointsVariable.material.uniforms.uScalarField.value =
        gpgpu.computation.getCurrentRenderTarget(
          gpgpu.scalarFieldVariable
        ).texture;
      gpgpu.particlesVariable.material.uniforms.uZeroPoints.value =
        gpgpu.computation.getCurrentRenderTarget(
          gpgpu.zeroPointsVariable
        ).texture;
      particles.material.uniforms.uParticlesTexture.value =
        gpgpu.computation.getCurrentRenderTarget(
          gpgpu.particlesVariable
        ).texture;
    };

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

      // Pass time and audio data to GPGPU shaders
      gpgpu.particlesVariable.material.uniforms.uTime.value = time;
      gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
      gpgpu.particlesVariable.material.uniforms.uStarted.value =
        audioObject.sound.started;
      gpgpu.particlesVariable.material.uniforms.uMicActive.value =
        audioObject.gumStream?.active;

      // Pass time and sound state to rendering shader
      particles.material.uniforms.uSoundPlaying.value =
        audioObject.sound.isPlaying;
      particles.material.uniforms.uTime.value = time;
      particles.material.uniforms.uDeltaTime.value = deltaTime;

      // Process audio + compute GPGPU updates
      processAudioData(gpgpu, particles, essentiaData);
      gpgpu.computation.compute();
      updateGPGPUTextures();

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
    startAudioProcessing(tick);

    // Callback for when audio finishes
    setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    // Attach resize listener
    window.addEventListener("resize", onResize);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      cancelAnimationFrame(animFrameId);
      gui?.destroy();
      if (gpgpu) disposeGPGPUResources(gpgpu);
      if (particles) {
        particles.geometry.dispose();
        particles.material.dispose();
      }
      effectComposer?.dispose();
      if (audioObject.listener) camera.remove(audioObject.listener);
      renderer.dispose();
      window.removeEventListener("resize", onResize);
    };
  }, [canvasRef, guiContainerRef, setIsPlaying, setIsAudioLoaded]);
}
