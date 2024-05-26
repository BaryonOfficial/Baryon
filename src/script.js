import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';

import { postProcessingSetup } from './postProcessing/postProcessingSetup.js';
import { guiSetup } from './utils/guiSetup.js';
import { particlesSetup } from './baryon/particlesSetup.js';
import { gpgpuSetup } from './baryon/gpgpuSetup.js';
import { audioObject, audioSetup, setupAudioGraph, processAudioData } from './audio/audioSetup.js';

//******************************************************* GENERAL INITIALIZATION *******************************************************//

const gui = new GUI({ width: 340 });
const debugObject = {};

async function URLFromFiles(files) {
  const promises = files.map(async (file) => {
    const response = await fetch(file);
    return response.text();
  });

  const texts = await Promise.all(promises);
  texts.unshift('var exports = {};'); // hack to make injected umd modules work
  const text = texts.join('');
  const blob = new Blob([text], { type: 'application/javascript' });

  return URL.createObjectURL(blob);
}

// Canvas
const canvas = document.querySelector('canvas.webgl');
const context = canvas.getContext('webgl2');

// Scene
export const scene = new THREE.Scene();

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
export const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 3, 20);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
export const renderer = new THREE.WebGLRenderer({
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
const texture = textureLoader.load('images/channelORANGE.png', () => {
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
plane.visible = true;
scene.add(plane);

// Object

// Parameters Object
let parameters = {
  count: 1000000,
  radius: 3.0, // Radius of the sphere
  threshold: 0.064,
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
const gltf = await gltfLoader.loadAsync('./Baryon_v2.glb');
const baseGeometry2 = {};
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
 * Audio Processing;
 */
audioSetup(camera);

/*
 * GPGPU
 */
const resA = gpgpuSetup(baseGeometry, renderer, parameters, baseGeometry2);
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

/******************************************************* ANIMATION *******************************************************/
const clock = new THREE.Clock();
let frameCounter = 0;
let previousTime = 0;
let time = 0;
let deltaTime = 0;
let frameReset = 10;

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
  particles.material.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(
    gpgpu.particlesVariable
  ).texture;
}

// Calculate the rotation matrix
const rotationMatrix = new THREE.Matrix4();

let lastKnownTime = 0;

function timeHandler(elapsedTime) {
  if (audioObject.sound.isPlaying && audioObject.sound.started) {
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

function startAudioProcessing() {
  const workletProcessorCode = [
    'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js',
    'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.umd.js',
    'audio-data-processor.js',
    'https://unpkg.com/ringbuf.js@0.1.0/dist/index.js',
  ];

  // inject Essentia.js code into AudioWorkletGlobalScope context, then setup audio graph and start animation
  URLFromFiles(workletProcessorCode)
    .then((concatenatedCode) => {
      audioObject.audioCtx.audioWorklet
        .addModule(concatenatedCode)
        .then(() => {
          setupAudioGraph();
          tick();
        })
        .catch(function moduleLoadRejected(msg) {
          console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
        });
    })
    .catch((msg) => {
      console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
    });
}

startAudioProcessing();
