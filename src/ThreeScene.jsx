import React, { useEffect, useRef, useState, useCallback } from 'react';
import Stats from './utils/stats.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
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
} from './audio/audioSetup.js';
import GUI from 'lil-gui';
import UnsupportedWarning from './utils/UnsupportedWarning.jsx';
import { useFullscreen } from './hooks/useFullScreenToggle.jsx';
import { setupScene } from './three-utils/setupScene.js';
import { handleResize } from './three-utils/handleResize.js';
import { setupLoaders } from './three-utils/setupLoaders.js';


const ThreeScene = () => {
  const canvasRef = useRef(null);
  const rotationTime = useRef(0);
  const toggleFullscreen = useFullscreen(canvasRef);
  const guiContainerRef = useRef(null);

  const [fileName, setFileName] = useState('Upload Audio');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
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

    const { scene, sizes, camera, controls, renderer } = setupScene(canvasRef);
    const onResize = () => handleResize({ sizes, camera, renderer, effectComposer, particles });
    
    const setupGUI = () => {
      const guiWidth = 300;
      const gui = new GUI({ width: guiWidth, container: guiContainerRef.current });
      document.documentElement.style.setProperty('--gui-width', guiWidth + 'px');

      return { gui, debugObject: {} };
    };


    const { gui, debugObject } = setupGUI();
    const { gltfLoader } = setupLoaders();

    /*
     * Audio Processing;
     */
    audioSetup(camera);

    debugObject.backgroundColor = '#000000';

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

    window.addEventListener('resize', onResize);

    /******************************************************* ANIMATION *******************************************************/

    const clock = new THREE.Clock();
    let previousTime = 0;
    let time = 0;
    let deltaTime = 0;

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
    const stats = Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    statsRef.current = stats;

    // Style the stats panel
    const statsElement = stats.dom;
    statsElement.style.cssText = 'position:absolute;bottom:0;left:0;z-index:100;';

    // Always hide stats panel on mount/remount
    setShowStats(false);

    const tick = () => {
      requestAnimationFrame(tick);

      // Start monitoring frame
      stats.begin();

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

      // ******** GPGPU START ******** //
      gpgpu.computation.compute();
      updateGPGPUTextures();

      rotationTime.current += deltaTime;
      const angle = rotationTime.current * 0.5 * particles.material.uniforms.uRotation.value;
      rotationMatrix.makeRotationY(-angle);
      particles.points.matrix.copy(rotationMatrix);
      particles.points.matrixAutoUpdate = false;

      // Effect Composer Renderer
      effectComposer.render();

      // End monitoring frame
      stats.end();
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

  const handleDeviceChange = useCallback(
    async (deviceId) => {
      try {
        setSelectedDevice(deviceId);
        if (isMicActive) {
          // If mic is active, restart the stream with new device
          await stopMicRecordStream();
          await startMicRecordStream(deviceId);
        }
      } catch (error) {
        console.error('Error changing audio device:', error);
      }
    },
    [isMicActive]
  );

  useEffect(() => {
    const loadDevices = async () => {
      try {
        // First request microphone permissions
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately after getting permission
        stream.getTracks().forEach((track) => track.stop());

        // Now enumerate devices with full labels
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');

        // Log available devices for debugging
        console.log(
          'Available audio devices:',
          audioInputs.map((d) => ({
            id: d.deviceId,
            label: d.label,
            groupId: d.groupId,
          }))
        );

        setAudioDevices(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedDevice(audioInputs[0].deviceId);
        }
      } catch (error) {
        console.error('Error loading audio devices:', error);
        // If permission denied, still try to get devices (they'll just have generic labels)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter((device) => device.kind === 'audioinput');
          setAudioDevices(audioInputs);
          if (audioInputs.length > 0) {
            setSelectedDevice(audioInputs[0].deviceId);
          }
        } catch (e) {
          console.error('Error enumerating devices:', e);
        }
      }
    };

    loadDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
    };
  }, []);

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
                <div className="relative">
                  <button
                    onClick={async () => {
                      if (!isMicActive) {
                        setShowDeviceMenu(!showDeviceMenu);
                      } else {
                        await handleMicToggle();
                      }
                    }}
                    className="btn-standard flex items-center gap-1">
                    {isMicActive ? 'Stop Input' : 'Select Input'}
                    {!isMicActive && (
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          showDeviceMenu ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                  </button>
                  {showDeviceMenu && audioDevices.length > 0 && (
                    <div className="absolute left-0 mt-1 w-48 bg-white rounded-md shadow-lg z-50">
                      <div className="py-1">
                        {audioDevices.map((device) => (
                          <button
                            key={device.deviceId}
                            onClick={async () => {
                              setSelectedDevice(device.deviceId);
                              setShowDeviceMenu(false);
                              await handleMicToggle();
                            }}
                            className={`block w-full text-left px-4 py-2 text-sm ${
                              selectedDevice === device.deviceId
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}>
                            {device.label || `Device ${device.deviceId.slice(0, 8)}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {audioDevices.length === 0 && (
                <div className="text-sm text-gray-500 mt-1">
                  No audio input devices found. Make sure your device is connected and try clicking
                  &quot;Mic Mode&quot; first.
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {isUnsupported && <UnsupportedWarning />}
    </div>
  );
};
export default ThreeScene;
