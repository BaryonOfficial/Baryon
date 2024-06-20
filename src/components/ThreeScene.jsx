import React, { useEffect, useRef } from 'react';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';

import { postProcessingSetup } from '../postProcessing/postProcessingSetup.js';
import { guiSetup } from '../utils/guiSetup.js';
import { particlesSetup } from '../baryon/particlesSetup.js';
import { gpgpuSetup, disposeGPGPUResources } from '../baryon/gpgpuSetup.js';
import {
  audioObject,
  audioSetup,
  processAudioData,
  startAudioProcessing,
} from '../audio/audioSetup.js';
import { toggleRecording, toggleRecordingButton } from '../utils/recordRTC.js';

const ThreeScene = () => {
  const canvasRef = useRef(null);

  const audioInputRef = useRef(null);
  const fileNameButtonRef = useRef(null);
  const micButtonRef = useRef(null);
  const playPauseButtonRef = useRef(null);
  const stopButtonRef = useRef(null);

  useEffect(() => {
    //******************************************************* GENERAL INITIALIZATION *******************************************************//
    const guiWidth = 300;
    const gui = new GUI({ width: guiWidth, container: document.getElementById('gui-container') });
    document.documentElement.style.setProperty('--gui-width', guiWidth + 'px');
    const debugObject = {};

    //Canvas
    const canvas = canvasRef.current;
    const context = canvas.getContext('webgl2');

    // Scene
    const scene = new THREE.Scene();

    // Loaders
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

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
    renderer.xr.enabled = true;
    debugObject.backgroundColor = '#000000';
    renderer.setClearColor(debugObject.backgroundColor);

    const res = postProcessingSetup(renderer, scene, camera, sizes);
    const effectComposer = res.effectComposer;
    const unrealBloomPass = res.unrealBloomPass;

    // Load the texture
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('assets/channelORANGE.png', () => {
      // Update renderer size if necessary
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Create a material using the texture
    const material = new THREE.MeshBasicMaterial({ map: texture });

    // Create a geometry
    const geometry = new THREE.PlaneGeometry(2, 2); // Width and height of the plane

    // Create a mesh with the geometry and material
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(-4, 1.5, -6);
    plane.scale.multiplyScalar(6);
    plane.lookAt(camera.position);

    // Add the mesh to the scene
    plane.visible = false;
    scene.add(plane);

    // Object

    // Parameters Object
    let parameters = {
      count: 1500000,
      radius: 3.0, // Radius of the sphere
      threshold: 0.05,
      surfaceRatio: 0.33,
      surfaceThreshold: 0.01,
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
    }

    loadModel();

    /*
     * Audio Processing;
     */
    audioSetup(
      camera,
      audioInputRef,
      fileNameButtonRef,
      micButtonRef,
      playPauseButtonRef,
      stopButtonRef
    );

    /*
     * GPGPU
     */
    const resA = gpgpuSetup(scene, baseGeometry, renderer, parameters, baseGeometry2);
    const gpgpu = resA.gpgpu;
    const essentiaData = resA.essentiaData;

    /*
     * Particles
     */
    const resB = particlesSetup(parameters, sizes, gpgpu, baseGeometry, colors, scene);
    const particles = resB.particles;
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
      parameters
    );

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

    document.addEventListener('keydown', function (event) {
      // Check if 'f' key is pressed
      if (event.key === 'f') {
        if (!document.fullscreenElement) {
          if (canvas.requestFullscreen) {
            canvas.requestFullscreen();
          } else if (canvas.mozRequestFullScreen) {
            // Firefox
            canvas.mozRequestFullScreen();
          } else if (canvas.webkitRequestFullscreen) {
            // Chrome, Safari and Opera
            canvas.webkitRequestFullscreen();
          } else if (canvas.msRequestFullscreen) {
            // IE/Edge
            canvas.msRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.mozCancelFullScreen) {
            // Firefox
            document.mozCancelFullScreen();
          } else if (document.webkitExitFullscreen) {
            // Chrome, Safari and Opera
            document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            // IE/Edge
            document.msExitFullscreen();
          }
        }
      }
    });

    // Function to detect if the device is a mobile device
    function isMobileDevice() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    }

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

    const tick = () => {
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

      // Call tick again on the next frame
      window.requestAnimationFrame(tick);
    };

    startAudioProcessing(tick);

    // Clean up on component unmount
    return () => {
      console.log('Component unmounting');
      //   disposeGPGPUResources(gpgpu);
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'absolute', zIndex: 1 }}>
      <canvas ref={canvasRef} className="webgl" />
      <input type="file" ref={audioInputRef} style={{ display: 'none' }} />
      <button ref={fileNameButtonRef} className="file-btn-standard">
        Choose File
      </button>
      <button ref={micButtonRef} id="micMode">
        Mic
      </button>
      <button ref={playPauseButtonRef} className="btn-standard">
        Play
      </button>
      <button ref={stopButtonRef} className="btn-standard">
        Stop
      </button>
    </div>
  );
};
export default ThreeScene;
