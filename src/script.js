import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import GUI from 'lil-gui';

// Passes
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Shaders
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl';
import scalarFieldShader from './shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from './shaders/gpgpu/zeroPoints.glsl';
import audioDataShader from './shaders/gpgpu/audioData.glsl';

// Audio Analysis
import * as Pitchfinder from 'pitchfinder';

//******************************************************* GENERAL INITIALIZATION *******************************************************//

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 340 });
const debugObject = {};

// Canvas
const canvas = document.querySelector('canvas.webgl');
const context = canvas.getContext('webgl2');

// Scene
const scene = new THREE.Scene();

// Loaders
// const dracoLoader = new DRACOLoader();
// dracoLoader.setDecoderPath('/draco/');

// const gltfLoader = new GLTFLoader();
// gltfLoader.setDRACOLoader(dracoLoader);

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

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

  // Update effect composer
  effectComposer.setSize(sizes.width, sizes.height);
  effectComposer.setPixelRatio(sizes.pixelRatio);
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 0, 15);
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

debugObject.backgroundColor = '#000000';
renderer.setClearColor(debugObject.backgroundColor);

//****************************** AUDIO PROCESSING *********************************//

let fftSize = 512;

// create an AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add(listener);

// create an Audio source
const sound = new THREE.Audio(listener);

// Get references to the audio controls
const audioInput = document.getElementById('audioInput');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');

let audioLoaded = false;
const audioLoader = new THREE.AudioLoader();
audioInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  const fileURL = URL.createObjectURL(file);

  audioLoader.load(fileURL, function (buffer) {
    sound.setBuffer(buffer);
    sound.setLoop(false);
    sound.setVolume(0.5);
    audioLoaded = true;
    sound.started = false;
  });
});

// ***** Analysis ***** //

// create an AudioAnalyser, passing in the sound and desired fftSize
const analyser = new THREE.AudioAnalyser(sound, fftSize);

function audioAnalysis() {
  let avgAmplitude = 0;
  let freqData = [];
  if (sound.isPlaying) {
    avgAmplitude = analyser.getAverageFrequency();
    freqData = analyser.getFrequencyData();
  }

  return { avgAmplitude, freqData };
}

//***** Audio Playback *****//

// Play audio when play button is clicked
playButton.addEventListener('click', () => {
  if (sound.isPlaying) {
    sound.pause();
    playButton.textContent = 'Play';
  } else if (!sound.isPlaying && audioLoaded) {
    sound.play();
    sound.started = true;
    playButton.textContent = 'Pause';
  }
});

// Stop audio when stop button is clicked
stopButton.addEventListener('click', () => {
  sound.stop();
  sound.started = false;
  playButton.textContent = 'Play';
});

sound.onEnded = function () {
  console.log('Audio ended');
  sound.started = false;
  playButton.textContent = 'Play'; // Update the play button text
};

function timeHandler(elapsedTime) {
  if (sound.isPlaying && sound.started === true) {
    deltaTime = sound.listener.timeDelta;
    time = sound.context.currentTime;
    if (frameCounter % frameReset === 0) {
      console.log('Audio Time: ', time);
      console.log('Audio Delta Time: ', deltaTime);
    }
  } else if (!sound.isPlaying && sound.started === true) {
    time = 0;
    deltaTime = 0;
    if (frameCounter % frameReset === 0) {
      console.log('Audio Time: ', time);
      console.log('Audio Delta Time: ', deltaTime);
    }
  } else {
    deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;
    time = elapsedTime;
    if (frameCounter % frameReset === 0) {
      console.log('Elapsed Time: ', time);
      console.log('Delta Time: ', deltaTime);
    }
  }

  return { time, deltaTime };
}

/**
 * Post Processing
 */

const renderTarget = new THREE.WebGLRenderTarget(800, 600, {
  samples: renderer.getPixelRatio() === 1 ? 2 : 0,
});

const effectComposer = new EffectComposer(renderer, renderTarget);
effectComposer.setPixelRatio(sizes.pixelRatio);
effectComposer.setSize(sizes.width, sizes.height);

const renderPass = new RenderPass(scene, camera);
effectComposer.addPass(renderPass);

// Must be before GammaCorrection
const unrealBloomPass = new UnrealBloomPass();
unrealBloomPass.enabled = false;
effectComposer.addPass(unrealBloomPass);

const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
effectComposer.addPass(gammaCorrectionPass);

if (renderer.getPixelRatio() === 1 && !renderer.capabilities.isWebGL2) {
  // Antialiasing must be after gammaCorrection
  const smaaPass = new SMAAPass();
  effectComposer.addPass(smaaPass);

  console.log('SMAA enabled');
}

// GUI for effects

const bloomFolder = gui.addFolder('Bloom Effect');

unrealBloomPass.strength = 0.05;
unrealBloomPass.radius = 1;
unrealBloomPass.threshold = 0.6;

bloomFolder.add(unrealBloomPass, 'enabled').name('Enable Bloom');
bloomFolder.add(unrealBloomPass, 'strength').min(0).max(2).step(0.001).name('Bloom Strength');
bloomFolder.add(unrealBloomPass, 'radius').min(0).max(2).step(0.001).name('Bloom Radius');
bloomFolder.add(unrealBloomPass, 'threshold').min(0).max(1).step(0.001).name('Bloom Threshold');
bloomFolder.close();

// Parameters Object
let parameters = {
  N: 22,
  count: 1000000,
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
  threshold: 1.0,
  surfaceRatio: 0.33,
  surfaceThreshold: 0.001,
  particleSpeed: 1.0,
  dampening: 0.5,
};

function generateWaveComponents() {
  const waveComponents = [];
  // Populate initial wave component values
  for (let i = 0; i < parameters.N; i++) {
    waveComponents.push({
      [`A${i}`]: Math.random() * 3 + 1,
      [`u${i}`]: Math.floor(Math.random() * 10) + 1,
      [`v${i}`]: Math.floor(Math.random() * 10) + 1,
      [`w${i}`]: Math.floor(Math.random() * 10) + 1,
    });
  }

  // Flatten the wave components into an array that can be used in GLSL
  const waveComponentsArray = new Float32Array(parameters.N * 4);
  for (let i = 0; i < parameters.N; i++) {
    waveComponentsArray[i * 4] = waveComponents[i][`A${i}`];
    waveComponentsArray[i * 4 + 1] = waveComponents[i][`u${i}`];
    waveComponentsArray[i * 4 + 2] = waveComponents[i][`v${i}`];
    waveComponentsArray[i * 4 + 3] = waveComponents[i][`w${i}`];
  }

  return waveComponentsArray;
}

const initialWaveComponentsArray = generateWaveComponents();

// Base Geometry
const baseGeometry = {
  count: parameters.count,
  positions: new Float32Array(parameters.count * 3), // x, y, z for each particle
};

const colors = new Float32Array(baseGeometry.count * 3); // r, g, b for each particle

function initializeParticlesInSphereVolumeAndSurface(count, radius, surfaceRatio) {
  const positions = new Float32Array(count * 3);
  const surfaceCount = Math.floor(count * surfaceRatio);
  const volumeCount = count - surfaceCount;

  // Generate points on the surface
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;
    const x = radius * Math.sin(inclination) * Math.cos(azimuth);
    const y = radius * Math.sin(inclination) * Math.sin(azimuth);
    const z = radius * Math.cos(inclination);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  // Generate points within the volume
  for (let i = surfaceCount; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * radius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}

function initializeParticlesInSphere(count, radius) {
  // Scale down the radius to 1/10th
  const scaledRadius = radius / 10;

  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Use the scaled radius in the calculation
    const r = Math.pow(Math.random(), 1 / 3) * scaledRadius; // Adjust the power to 1/3 for uniform distribution within the sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}

/**
 * GPU Compute
 */

// Setup

const gpgpu = {};
gpgpu.size = Math.ceil(Math.sqrt(baseGeometry.count));
gpgpu.computation = new GPUComputationRenderer(gpgpu.size, gpgpu.size, renderer);

// Particles w/ positions only for computation
const baseParticlesTexture = gpgpu.computation.createTexture();

baseGeometry.positions = initializeParticlesInSphereVolumeAndSurface(
  parameters.count,
  parameters.radius,
  parameters.surfaceRatio
);

for (let i = 0; i < baseGeometry.count; i++) {
  const i3 = i * 3;
  const i4 = i * 4;

  // Position based on Geometry
  baseParticlesTexture.image.data[i4 + 0] = baseGeometry.positions[i3 + 0];
  baseParticlesTexture.image.data[i4 + 1] = baseGeometry.positions[i3 + 1];
  baseParticlesTexture.image.data[i4 + 2] = baseGeometry.positions[i3 + 2];
  baseParticlesTexture.image.data[i4 + 3] = 1.0;
}

// Initalization of particles for movement
const initialParticlesTexture = gpgpu.computation.createTexture();

const initialPositions = initializeParticlesInSphere(parameters.count, parameters.radius);

for (let i = 0; i < baseGeometry.count; i++) {
  const i3 = i * 3;
  const i4 = i * 4;

  initialParticlesTexture.image.data[i4 + 0] = initialPositions[i3 + 0];
  initialParticlesTexture.image.data[i4 + 1] = initialPositions[i3 + 1];
  initialParticlesTexture.image.data[i4 + 2] = initialPositions[i3 + 2];
  initialParticlesTexture.image.data[i4 + 3] = 1.0;
}

// Global Uniform Variables
const waveUniforms = {
  N: { value: parameters.N },
  waveComponents: { value: initialWaveComponentsArray },
};

/**
 * AudioData Variable
 */
const audioDataTexture = gpgpu.computation.createTexture();
gpgpu.audioDataVariable = gpgpu.computation.addVariable(
  'uAudioData',
  audioDataShader,
  audioDataTexture
);

// Dependencies
gpgpu.computation.setVariableDependencies(gpgpu.audioDataVariable, []);

/**
 * ScalarField Variable
 */
const scalarTexture = gpgpu.computation.createTexture();
gpgpu.scalarFieldVariable = gpgpu.computation.addVariable(
  'uScalarField',
  scalarFieldShader,
  scalarTexture
);

gpgpu.scalarFieldVariable.material.uniforms.N = waveUniforms.N;
gpgpu.scalarFieldVariable.material.uniforms.waveComponents = waveUniforms.waveComponents;
gpgpu.scalarFieldVariable.material.uniforms.uRadius = { value: parameters.radius };
gpgpu.scalarFieldVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);

// Log
// console.log(gpgpu.scalarFieldVariable.material.uniforms.uBase.value.image.data);

// Dependency
gpgpu.computation.setVariableDependencies(gpgpu.scalarFieldVariable, [gpgpu.audioDataVariable]);

/**
 * ZeroPoints Variable
 */
gpgpu.zeroPointsVariable = gpgpu.computation.addVariable(
  'uZeroPoints',
  zeroPointsShader,
  gpgpu.computation.createTexture()
);

gpgpu.zeroPointsVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
gpgpu.zeroPointsVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
gpgpu.zeroPointsVariable.material.uniforms.uSurfaceThreshold = {
  value: parameters.surfaceThreshold,
};

// Dependency
gpgpu.computation.setVariableDependencies(gpgpu.zeroPointsVariable, [gpgpu.scalarFieldVariable]);

/**
 * Particles Variable
 */

gpgpu.particlesVariable = gpgpu.computation.addVariable(
  'uParticles',
  gpgpuParticlesShader,
  initialParticlesTexture
);

gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [
  gpgpu.zeroPointsVariable,
  gpgpu.particlesVariable,
]);

gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(1.0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(3.14);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.5);
gpgpu.particlesVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform();
gpgpu.particlesVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(100);
gpgpu.particlesVariable.material.uniforms.uParticleSpeed = new THREE.Uniform(100.0);
gpgpu.particlesVariable.material.uniforms.uDampening = new THREE.Uniform(0.5);

//******************************************************* GPGPU INITIALIZATION *******************************************************//

gpgpu.computation.init();

// Debug
let mode = false;

gpgpu.debug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture,
  })
);
gpgpu.debug.visible = mode;
gpgpu.debug.position.x = -4;
gpgpu.debug.position.y = -3;
scene.add(gpgpu.debug);

const scalarFieldDebug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture,
  })
);
scalarFieldDebug.visible = mode;
scalarFieldDebug.position.x = -4;
scalarFieldDebug.position.y = 3;
scene.add(scalarFieldDebug);

const zeroPointsDebug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3), // The size of the plane can be adjusted as needed
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable).texture,
  })
);
zeroPointsDebug.visible = mode;
zeroPointsDebug.position.x = -4; // Position it differently so it doesn't overlap with the scalarFieldDebug
scene.add(zeroPointsDebug);

/**
 * Particles
 */
const particles = {};
const materialParameters = {};

// materialParameters.color = new THREE.Color('rgb(77,142,236)');
materialParameters.color = new THREE.Color('rgb(18, 198, 211)');

// Material
particles.material = new THREE.ShaderMaterial({
  // transparent: true,
  side: THREE.DoubleSide,
  // depthWrite: false,
  // depthTest: false,
  blending: THREE.AdditiveBlending,
  // vertexColors: true,
  vertexShader: particlesVertexShader,
  fragmentShader: particlesFragmentShader,
  uniforms: {
    uSize: new THREE.Uniform(0.03),
    uResolution: new THREE.Uniform(
      new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)
    ),
    uParticlesTexture: new THREE.Uniform(),
    uTime: new THREE.Uniform(0),
    uColor: new THREE.Uniform(new THREE.Color(materialParameters.color)),
    uRadius: new THREE.Uniform(parameters.radius),
  },
});

// rgb(77,142,236)

particles.material.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(
  gpgpu.particlesVariable
).texture;

// Geometry
const particlesUvArray = new Float32Array(baseGeometry.count * 2);
// Sizes Array
const sizesArray = new Float32Array(baseGeometry.count);

for (let y = 0; y < gpgpu.size; y++) {
  for (let x = 0; x < gpgpu.size; x++) {
    const i = y * gpgpu.size + x;
    const i2 = i * 2;

    const uvX = (x + 0.5) / gpgpu.size;
    const uvY = (y + 0.5) / gpgpu.size;

    particlesUvArray[i2 + 0] = uvX;
    particlesUvArray[i2 + 1] = uvY;

    // Sizes
    sizesArray[i] = Math.random();
  }
}

particles.geometry = new THREE.BufferGeometry();
particles.geometry.setDrawRange(0, baseGeometry.count);
particles.geometry.setAttribute('aParticlesUv', new THREE.BufferAttribute(particlesUvArray, 2));
particles.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

// Sizes
particles.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizesArray, 1));

// Points
particles.points = new THREE.Points(particles.geometry, particles.material);
scene.add(particles.points);

/**
 * Tweaks
 */
gui.close();

const colorFolder = gui.addFolder('Color Settings');

colorFolder.addColor(debugObject, 'backgroundColor').onChange(() => {
  renderer.setClearColor(debugObject.backgroundColor);
});
colorFolder.addColor(materialParameters, 'color').onChange(() => {
  particles.material.uniforms.uColor.value.set(materialParameters.color);
});
colorFolder.close();

gui.add(particles.material.uniforms.uSize, 'value').min(0).max(1).step(0.001).name('uSize');
// gui.add(parameters, 'count').min(1000).max(10000000).step(1000).name('Particle Count');

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence, 'value')
  .min(0.01)
  .max(1)
  .step(0.001)
  .name('uFlowFieldInfluence');

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength, 'value')
  .min(0.1)
  .max(10)
  .step(0.001)
  .name('uFlowFieldStrength');

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency, 'value')
  .min(0.01)
  .max(1)
  .step(0.001)
  .name('uFlowFieldFrequency');
gui
  .add(gpgpu.particlesVariable.material.uniforms.uParticleSpeed, 'value')
  .min(1)
  .max(200)
  .step(0.001)
  .name('uParticleSpeed');

// Add the GUI control for the threshold parameter
gui
  .add(parameters, 'threshold')
  .min(0.01)
  .max(5)
  .step(0.001)
  .name('uThreshold')
  .onChange(() => {
    // Update both uniforms when the threshold value changes
    gpgpu.zeroPointsVariable.material.uniforms.uThreshold.value = parameters.threshold;
    gpgpu.particlesVariable.material.uniforms.uThreshold.value = parameters.threshold;
  });

gui
  .add(gpgpu.particlesVariable.material.uniforms.uAverageAmplitude, 'value')
  .min(0)
  .max(255)
  .step(0.01)
  .name('uAverageAmplitude');

// Add a button to generate new wave components
gui
  .add(
    {
      generateNewWaveComponents: () => {
        waveUniforms.waveComponents.value = generateWaveComponents();
      },
    },
    'generateNewWaveComponents'
  )
  .name('Generate New Wave Components');

/******************************************************* ANIMATION *******************************************************/
const clock = new THREE.Clock();
let frameCounter = 0;
let previousTime = 0;
let time = 0;
let deltaTime = 0;
let frameReset = 10;

const tick = () => {
  frameCounter++;
  const elapsedTime = clock.getElapsedTime();

  const { time, deltaTime } = timeHandler(elapsedTime);

  // Update controls
  controls.update();

  const { avgAmplitude, freqData } = audioAnalysis();

  if (frameCounter % frameReset === 0) {
    console.log('Avg Amplitude: ', avgAmplitude);
    console.log('Frequency Data: ', freqData);
    console.log('Sound: ', sound);
  }

  // // Check if 60 frames have passed
  if (frameCounter >= frameReset) {
    waveUniforms.waveComponents.value = generateWaveComponents();
    frameCounter = 0; // Reset the counter after generating
  }

  // GPGPU Update
  gpgpu.particlesVariable.material.uniforms.uTime.value = time;
  particles.material.uniforms.uTime.value = time;
  gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;

  // const computationStartTime = performance.now();

  gpgpu.computation.compute();

  // // Check computation time
  // const computationEndTime = performance.now();
  // const computationDuration = computationEndTime - computationStartTime;

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

  // Debug materials update
  scalarFieldDebug.material.map = gpgpu.computation.getCurrentRenderTarget(
    gpgpu.scalarFieldVariable
  ).texture;
  scalarFieldDebug.material.needsUpdate = true;

  zeroPointsDebug.material.map = gpgpu.computation.getCurrentRenderTarget(
    gpgpu.zeroPointsVariable
  ).texture;
  zeroPointsDebug.material.needsUpdate = true;

  // Render normal scene
  // renderer.render(scene, camera);
  effectComposer.render();

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
