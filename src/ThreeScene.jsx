import React, { useEffect, useRef, useState, useCallback } from 'react';
import Stats from './utils/stats.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { postProcessingSetup } from './postProcessing/postProcessingSetup.js';
import { guiSetup } from './utils/guiSetup.js';
import { particlesSetup } from './baryon/particlesSetup.js';
import { gpgpuSetup, disposeGPGPUResources } from './baryon/gpgpuSetup.js';
import {
  audioObject,
  audioSetup,
  loadAudio,
  startMicRecordStream,
  stopMicRecordStream,
  playPauseAudio,
  stopAudio,
  processAudioData,
  startAudioProcessing,
  setAudioEndedCallback,
} from './audio/audioManager.js';
import GUI from 'lil-gui';
import UnsupportedWarning from './utils/UnsupportedWarning.jsx';
import { useFullscreen } from './hooks/useFullScreenToggle.jsx';

const ThreeScene = () => {
  const canvasRef = useRef(null);
  const toggleFullscreen = useFullscreen(canvasRef);
  const guiContainerRef = useRef(null);

  const [fileName, setFileName] = useState('Upload Audio');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const statsRef = useRef(null);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    function isUnsupportedEnvironment() {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

      return isMobile || isFirefox || isSafari;
    }

    setIsUnsupported(isUnsupportedEnvironment());

    let particles, gpgpu, essentiaData;

    const setupScene = () => {
      const canvas = canvasRef.current;
      const context = canvas.getContext('webgl2');
      const scene = new THREE.Scene();

      return { canvas, context, scene };
    };

    const setupGUI = () => {
      const guiWidth = 300;
      const gui = new GUI({ width: guiWidth, container: guiContainerRef.current });
      document.documentElement.style.setProperty('--gui-width', guiWidth + 'px');

      return { gui, debugObject: {} };
    };

    const setupLoaders = () => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/draco/');

      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);

      return { gltfLoader };
    };

    const { canvas, context, scene } = setupScene();
    const { gui, debugObject } = setupGUI();
    const { gltfLoader } = setupLoaders();

    /**
     * Sizes
     */

    const sizes = {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    };

    /**
     * Camera
     */
    const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
    camera.position.set(0, 3, 20);
    scene.add(camera);

    /*
     * Audio Processing;
     */
    audioSetup(camera);

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    /**
     * Renderer
     */

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: context,
      antialias: true,
    });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(sizes.pixelRatio);
    debugObject.backgroundColor = '#000000';
    renderer.setClearColor(debugObject.backgroundColor);

    const res = postProcessingSetup(renderer, scene, camera, sizes);
    const effectComposer = res.effectComposer;
    const unrealBloomPass = res.unrealBloomPass;

    // Parameters Object
    let parameters = {
      count: 1500000,
      radius: 3.0, // Radius of the sphere
      threshold: 0.05,
      surfaceRatio: 0.33,
      surfaceThreshold: 0.01,
      targetFPS: 60,
    };

    // Base Geometries
    const baseGeometry = {
      count: parameters.count,
      positions: new Float32Array(parameters.count * 3), // x, y, z for each particle
    };

    const colors = new Float32Array(baseGeometry.count * 3); // r, g, b for each particle

    /**
     * Load model
     */
    const baseGeometry2 = {};

    async function loadModel() {
      const gltf = await gltfLoader.loadAsync('./glb/Baryon_v2.glb');
      baseGeometry2.instance = gltf.scene.children[0];

      // Apply scaling to the object
      baseGeometry2.instance.scale.set(0.2, 0.2, 0.2); // Adjust scale factors as needed

      // Update the geometry to apply the transformation
      baseGeometry2.instance.updateMatrix();
      baseGeometry2.instance.geometry.applyMatrix4(baseGeometry2.instance.matrix);

      // Reset the matrix to avoid further unintended transformations
      baseGeometry2.instance.matrix.identity();
      baseGeometry2.instance.matrix.decompose(
        baseGeometry2.instance.position,
        baseGeometry2.instance.quaternion,
        baseGeometry2.instance.scale
      );

      // Now extract the transformed vertex positions
      baseGeometry2.geometry = baseGeometry2.instance.geometry;
      baseGeometry2.count = baseGeometry2.geometry.attributes.position.count;

      /*
       * GPGPU
       */
      const resA = gpgpuSetup(scene, baseGeometry, renderer, parameters, baseGeometry2);
      gpgpu = resA.gpgpu;
      essentiaData = resA.essentiaData;

      /*
       * Particles
       */
      const resB = particlesSetup(parameters, sizes, gpgpu, baseGeometry, colors, scene);
      particles = resB.particles;
      const materialParameters = resB.materialParameters;

      /*
       * GUI Setup
       */

      guiSetup(
        gui,
        unrealBloomPass,
        renderer,
        particles,
        gpgpu,
        debugObject,
        materialParameters,
        parameters,
        stats,
        setShowStats
      );
      return { gpgpu, particles, essentiaData };
    }

    loadModel();

    /********************************************** WEBRTC ***********************************************/

    // // Attach event listener to the toggle recording control button
    // toggleRecordingButton.addEventListener('click', () =>
    //   toggleRecording(canvas, audioObject.audioCtx, audioObject.gain)
    // );
    // toggleRecordingButton.disabled = false; // Enable the button as it's now the only control for recording

    /****************************************** EVENT LISTENERS ******************************************/

    window.addEventListener('resize', () => {
      // Update sizes
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;
      sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

      // Materials
      particles.material.uniforms.uResolution.value.set(
        sizes.width * sizes.pixelRatio,
        sizes.height * sizes.pixelRatio
      );

      // Update camera
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();

      // Update renderer
      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(sizes.pixelRatio);

      // // Update effect composer
      effectComposer.setSize(sizes.width, sizes.height);
      effectComposer.setPixelRatio(sizes.pixelRatio);
    });

    /******************************************************* ANIMATION *******************************************************/

    const clock = new THREE.Clock();
    let frameCounter = 0;
    let previousTime = 0;
    let time = 0;
    let deltaTime = 0;
    let frameReset = 10;

    function updateGPGPUTextures() {
      // Update audioData texture
      gpgpu.scalarFieldVariable.material.uniforms.uAudioData.value =
        gpgpu.computation.getCurrentRenderTarget(gpgpu.audioDataVariable).texture;

      // Update scalarfield texture
      gpgpu.zeroPointsVariable.material.uniforms.uScalarField.value =
        gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture;

      // Update zeropoints texture
      gpgpu.particlesVariable.material.uniforms.uZeroPoints.value =
        gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable).texture;

      // Update particles texture
      particles.material.uniforms.uParticlesTexture.value =
        gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture;
    }

    // Calculate the rotation matrix
    const rotationMatrix = new THREE.Matrix4();

    let lastKnownTime = 0;

    function timeHandler(elapsedTime) {
      if (audioObject.gumStream && audioObject.gumStream.active) {
        deltaTime = elapsedTime - previousTime;
        previousTime = elapsedTime;
        time = elapsedTime;
      } else if (audioObject.sound.isPlaying && audioObject.sound.started) {
        deltaTime = audioObject.sound.listener.timeDelta;
        time = audioObject.sound.context.currentTime;
        lastKnownTime = time;
      } else if (!audioObject.sound.isPlaying && audioObject.sound.started) {
        time = lastKnownTime;
        deltaTime = 0;
      } else {
        deltaTime = elapsedTime - previousTime;
        previousTime = elapsedTime;
        time = elapsedTime;
      }

      return { time, deltaTime };
    }

    // Initialize Stats
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    statsRef.current = stats;

    // Style the stats panel
    const statsElement = stats.dom;
    statsElement.style.cssText = 'position:absolute;bottom:0;left:0;z-index:100;';

    // Always hide stats panel on mount/remount
    setShowStats(false);

    let lastFrameTime = 0;

    const tick = (currentTime) => {
      requestAnimationFrame(tick);

      const frameInterval = 1000 / parameters.targetFPS; // Move this inside tick
      const elapsed = currentTime - lastFrameTime;

      if (elapsed > frameInterval) {
        lastFrameTime = currentTime - (elapsed % frameInterval);

        // Start monitoring frame
        stats.begin();
        frameCounter++;
        // pseudoVisualizer();

        const elapsedTime = clock.getElapsedTime();
        const { time, deltaTime } = timeHandler(elapsedTime);

        controls.update(deltaTime);

        // GPGPU Updates
        gpgpu.particlesVariable.material.uniforms.uTime.value = time;
        gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
        gpgpu.particlesVariable.material.uniforms.uStarted.value = audioObject.sound.started;
        gpgpu.particlesVariable.material.uniforms.uMicActive.value =
          audioObject.gumStream && audioObject.gumStream.active;

        particles.material.uniforms.uSoundPlaying.value = audioObject.sound.isPlaying;
        particles.material.uniforms.uTime.value = time;
        particles.material.uniforms.uDeltaTime.value = deltaTime;

        processAudioData(gpgpu, particles, essentiaData);

        // Log Uniforms
        // if (frameCounter % 60 === 0) {
        //   // For example, log every 60 frames
        //   logGPGPUUniforms();
        // }

        // ******** GPGPU START ******** //
        gpgpu.computation.compute();
        updateGPGPUTextures();

        const angle = time * 0.5 * particles.material.uniforms.uRotation.value;
        rotationMatrix.makeRotationY(-angle);
        particles.points.matrix.copy(rotationMatrix);
        particles.points.matrixAutoUpdate = false;

        // Normal Renderer
        // renderer.render(scene, camera);

        // Effect Composer Renderer
        effectComposer.render();

        // End monitoring frame
        stats.end();
      }
    };

    startAudioProcessing(tick);

    // Set up audio ended callback
    setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
      console.log('Audio ended');
    });

    return () => {
      console.log('Component unmounting');
      if (gui) {
        gui.destroy();
      }
      if (gpgpu) {
        disposeGPGPUResources(gpgpu);
      }
      renderer.dispose();

      if (statsRef.current && statsRef.current.dom.parentNode) {
        statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
      }
    };
  }, []);

  useEffect(() => {
    if (showStats && statsRef.current) {
      document.body.appendChild(statsRef.current.dom);
    } else if (!showStats && statsRef.current && statsRef.current.dom.parentNode) {
      statsRef.current.dom.parentNode.removeChild(statsRef.current.dom);
    }
  }, [showStats]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      const fileURL = URL.createObjectURL(file);
      loadAudio(fileURL)
        .then(() => {
          setIsAudioLoaded(true);
          setIsPlaying(false);
        })
        .catch((error) => {
          console.error('Error loading audio:', error);
          setIsAudioLoaded(false);
        });
    } else {
      setFileName('Upload Audio');
      setIsAudioLoaded(false);
    }
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (!isAudioLoaded) {
      console.log('Audio not loaded yet');
      return;
    }
    try {
      const isNowPlaying = await playPauseAudio();
      setIsPlaying(isNowPlaying);
    } catch (error) {
      console.error('Error in play/pause:', error);
      setIsPlaying(false);
    }
  }, [isAudioLoaded]);

  const handleStop = useCallback(() => {
    stopAudio();
    setIsPlaying(false);
  }, []);

  const handleMicToggle = useCallback(async () => {
    try {
      if (isMicActive) {
        stopMicRecordStream();
      } else {
        await startMicRecordStream();
      }
      setIsMicActive(!isMicActive);
    } catch (error) {
      console.error('Error toggling microphone:', error);
      setIsMicActive(false);
    }
  }, [isMicActive]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'absolute', zIndex: 1 }}>
      <canvas ref={canvasRef} className="webgl absolute z-10" />
      <button onClick={toggleFullscreen}>Toggle Fullscreen</button>
      {!isUnsupported && (
        <>
          <div ref={guiContainerRef} className="fixed top-20 right-0 z-50"></div>
          <div className="controls-container fixed top-20 left-12 z-50 p-4">
            <div className="flex flex-col items-start space-y-2">
              <div className="file-input flex flex-col items-start space-y-2">
                <label className="file-btn-standard max-w-[131.06px] truncate cursor-pointer">
                  <span className="truncate">{fileName}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <div className="playback-controls flex flex-row items-center space-x-2">
                <button
                  onClick={handlePlayPause}
                  className="btn-standard"
                  disabled={!isAudioLoaded}>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button onClick={handleStop} className="btn-standard" disabled={!isAudioLoaded}>
                  Stop
                </button>
              </div>

              <div className="modes flex flex-row items-center space-x-0">
                <button onClick={handleMicToggle} className="btn-standard">
                  {isMicActive ? 'Stop Mic' : 'Mic Mode'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {isUnsupported && <UnsupportedWarning />}
    </div>
  );
};
export default ThreeScene;
