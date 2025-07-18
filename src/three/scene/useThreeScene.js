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
    const debugObject = { backgroundColor: "#000000" };
    const { gltfLoader } = setupLoaders();

    // Handle time logic
    const timeHandler = createTimeHandler(audioObject);

    // Setup audio context and listener
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
      count: 1500000,
      radius: 3.0,
      threshold: 0.05,
      surfaceRatio: 0.33,
      surfaceThreshold: 0.01,
      targetFPS: 60,
    };

    // Allocate memory for particles positions and colors
    const baseGeometry = {
      count: parameters.count,
      positions: new Float32Array(parameters.count * 3),
    };
    const colors = new Float32Array(baseGeometry.count * 3);

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
      });

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
      requestAnimationFrame(tick);

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
      gui?.destroy();
      disposeGPGPUResources(gpgpu);
      renderer.dispose();
      window.removeEventListener("resize", onResize);
    };
  }, [canvasRef, guiContainerRef, setIsPlaying, setIsAudioLoaded]);
}
