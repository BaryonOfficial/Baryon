import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import GUI from 'lil-gui';

// Audio Analysis
import * as Pitchfinder from 'pitchfinder';

// Shaders
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl';
import scalarFieldShader from './shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from './shaders/gpgpu/zeroPoints.glsl';
import audioDataShader from './shaders/gpgpu/audioData.glsl';

/******************************************************* AUDIO PROCESSING *******************************************************/

let bufferSource;
let audioBuffer;
let audioWorkletNode;
let audioFile;
let audioUniforms;
let audioContext;

const quantization = 4;
const bufferSize = 256;
const bufferLength = bufferSize / 2;
const nNotes = 128;

const frequenciesTexture = new THREE.DataTexture(
  new Float32Array(nNotes),
  nNotes,
  1,
  THREE.RedFormat,
  THREE.FloatType
);
const dataArrayTexture = new THREE.DataTexture(
  new Uint8Array(bufferLength),
  bufferLength,
  1,
  THREE.LuminanceFormat,
  THREE.UnsignedByteType
);

/**
 * Set up audio processing, including AudioWorklet, audio decoding, and analysis.
 * @param {File} file - The audio file to be processed.
 * @param {number} quantization - The quantization value for the audio analysis.
 * @param {number} bufferSize - The size of the audio buffer.
 */
async function setupAudio(file, quantization, bufferSize) {
  audioFile = file;

  try {
    audioContext = await initializeAudioContext();
    await loadAudioWorkletModule(audioContext);
    await decodeAudioData(audioContext, audioFile);
    await initializeAudioWorkletNode(audioContext);
    await setupAudioAnalysis(audioContext, quantization, bufferSize);
    await initializeAudioUniforms(audioContext);
  } catch (error) {
    console.error('Error setting up AudioWorklet:', error);
    throw error;
  }
}

// Loading
async function loadAudioWorkletModule(audioContext) {
  try {
    await audioContext.audioWorklet.addModule('audioProcessor.js');
    console.log('AudioWorklet module loaded successfully');
  } catch (error) {
    console.error('Failed to load AudioWorklet module:', error);
    throw error;
  }
}

// Decode Audio Data
async function decodeAudioData(audioContext, file) {
  try {
    // Create a new promise that resolves when the file is read
    const arrayBuffer = await new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = () => resolve(fileReader.result);
      fileReader.onerror = () => reject(fileReader.error);
      fileReader.readAsArrayBuffer(file);
    });

    // Decode the audio data
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('AudioBuffer decoded successfully:', audioBuffer);
  } catch (error) {
    console.error('Error decoding audio data:', error);
    throw error;
  }
}

// Initialize Audio Worklet Node
async function initializeAudioWorkletNode(audioContext) {
  try {
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-data-processor');
    audioWorkletNode.connect(audioContext.destination);
    audioWorkletNode.onprocessorerror = handleAudioWorkletProcessorError;
    console.log('AudioWorklet Connected');
  } catch (error) {
    console.error('Error initializing AudioWorkletNode:', error);
    throw error;
  }
}

function handleAudioWorkletProcessorError(event) {
  console.error('AudioWorkletProcessor error event:', event);
  console.error('AudioWorkletProcessor error:', event.error);
  // Handle the error case, e.g., set a flag to indicate audio is not playing
}

async function setupAudioAnalysis(audioContext, quantization, bufferSize) {
  const detectPitch = Pitchfinder.YIN();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = bufferSize;
  const frequencyDataLength = analyser.frequencyBinCount;
  const frequencyData = new Uint8Array(frequencyDataLength);
  const timeDomainData = new Uint8Array(bufferSize);

  audioWorkletNode.connect(analyser);

  audioWorkletNode.port.onmessage = async (event) => {
    console.log('Message from Worklet:', event.data);
    if (event.data.tempo && event.data.audioData) {
      const tempo = event.data.tempo;
      const audioData = event.data.audioData;

      // Find the pitches using Pitchfinder
      const frequencies = Pitchfinder.frequencies(detectPitch, audioData, {
        tempo: tempo,
        quantization: quantization,
      });
      try {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeDomainData);
        const averageAmplitude = calculateAverageAmplitude(timeDomainData);
        const numberOfNotes = frequencies.length;

        updateUniforms(frequencies, frequencyData, numberOfNotes, averageAmplitude, tempo);
        logAudioAnalysisData(frequencies, frequencyData, numberOfNotes, averageAmplitude, tempo);
      } catch (error) {
        console.error('Error processing audio data:', error);
      }
    }
  };
}

function calculateAverageAmplitude(timeDomainData) {
  const sum = timeDomainData.reduce((acc, val) => acc + Math.abs(val - 128), 0);
  return sum / timeDomainData.length;
}

function updateUniforms(frequencies, frequencyData, numberOfNotes, averageAmplitude, tempo) {
  frequenciesTexture.image.data.set(frequencies);
  frequenciesTexture.needsUpdate = true;
  dataArrayTexture.image.data.set(frequencyData);
  dataArrayTexture.needsUpdate = true;
  audioUniforms.nNotes.value = numberOfNotes;
  audioUniforms.uAvgAmplitude.value = averageAmplitude;
  audioUniforms.uTempo.value = tempo;
}

function logAudioAnalysisData(frequencies, frequencyData, numberOfNotes, averageAmplitude, tempo) {
  console.log('Frequencies:', frequencies);
  console.log('Frequency Data:', frequencyData);
  console.log('Number of Notes:', numberOfNotes);
  console.log('Average Amplitude:', averageAmplitude);
  console.log('Tempo:', tempo);
}

async function initializeAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
    console.log('AudioContext resumed successfully');
  }

  return audioContext;
}

async function initializeAudioUniforms(audioContext) {
  audioUniforms = {
    tPitches: { value: frequenciesTexture },
    tDataArray: { value: dataArrayTexture },
    uAvgAmplitude: { value: 0.0 },
    uTempo: { value: 0.0 },
    nNotes: { value: nNotes },
    sampleRate: { value: audioContext.sampleRate },
    bufferSize: { value: bufferSize },
  };

  console.log('Audio Uniforms:', audioUniforms);
}

async function handleFileInputChange(event) {
  if (event.target.files[0]) {
    audioFile = event.target.files[0];
    console.log('Selected audio file:', audioFile);

    try {
      await setupAudio(audioFile, quantization, bufferSize);
      console.log('Audio setup completed successfully');
    } catch (error) {
      console.error('Failed to set up audio:', error);
      alert('Error setting up audio. Please try a different file.');
    }
  } else {
    console.log('No file selected');
  }
}

async function startAudioPlayback() {
  if (!audioContext || !audioBuffer) {
    throw new Error('AudioContext or AudioBuffer not initialized');
  }

  bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(audioWorkletNode);
  bufferSource.start();
  console.log('Audio playback started');
}

async function pauseAudioPlayback() {
  if (!audioContext) {
    console.error('AudioContext is not initialized');
    return;
  }

  if (audioContext.state === 'running') {
    await audioContext.suspend();
    console.log('Audio playback paused');
  } else if (audioContext.state === 'suspended') {
    await audioContext.resume();
    console.log('Audio playback resumed');
  } else {
    console.log('AudioContext is in an unexpected state:', audioContext.state);
  }
}

async function resetAudioPlayback() {
  if (audioContext) {
    bufferSource?.stop();
    bufferSource?.disconnect();
    audioWorkletNode?.disconnect();
    await audioContext.close();
    audioContext = null;
    bufferSource = null;
    audioWorkletNode = null;
    audioBuffer = null;
    console.log('Audio playback reset');
  }
}

/**
 * Set up event listeners for the audio controls.
 */
function setupEventListeners() {
  const audioInput = document.getElementById('audioInput');
  const playButton = document.getElementById('playButton');
  const pauseButton = document.getElementById('pauseButton');
  const resetButton = document.getElementById('resetButton');

  audioInput.addEventListener('change', handleFileInputChange);
  playButton.addEventListener('click', startAudioPlayback);
  pauseButton.addEventListener('click', pauseAudioPlayback);
  resetButton.addEventListener('click', resetAudioPlayback);
}

// Call setupEventListeners when the script is loaded
setupEventListeners();

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

debugObject.clearColor = '#000000';
renderer.setClearColor(debugObject.clearColor);

// Parameters Object
let parameters = {
  N: 22,
  count: 1000000,
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
  threshold: 1.25,
  interopRate: 0.1,
  surfaceRatio: 0.33,
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
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 10) * (radius / 10);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  for (let i = 0; i < count; i++) {
    const colorValue = Math.random(); // Assign a random value between 0 and 1 for the gradient
    colors[i * 3] = colorValue;
    colors[i * 3 + 1] = colorValue;
    colors[i * 3 + 2] = colorValue;
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

Object.assign(gpgpu.audioDataVariable.material.uniforms, audioUniforms);

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

gpgpu.zeroPointsVariable.material.uniforms.uThreshold = { value: parameters.threshold };
gpgpu.zeroPointsVariable.material.uniforms.uRadius = { value: parameters.radius };

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
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(2);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.5);
gpgpu.particlesVariable.material.uniforms.uThreshold = { value: parameters.threshold };
gpgpu.particlesVariable.material.uniforms.uRate = { value: parameters.interopRate };
gpgpu.particlesVariable.material.uniforms.uInit = new THREE.Uniform(initialParticlesTexture);
gpgpu.particlesVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(100);

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

// Material
particles.material = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  // depthWrite: false,
  // depthTest: false,
  blending: THREE.NormalBlending,
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
    uColor: new THREE.Uniform(new THREE.Color('skyblue')),
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
gui.addColor(debugObject, 'clearColor').onChange(() => {
  renderer.setClearColor(debugObject.clearColor);
});
gui.add(particles.material.uniforms.uSize, 'value').min(0).max(1).step(0.001).name('uSize');

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence, 'value')
  .min(0)
  .max(1)
  .step(0.001)
  .name('uFlowFieldInfluence');

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength, 'value')
  .min(0)
  .max(10)
  .step(0.001)
  .name('uFlowFieldStrength');

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency, 'value')
  .min(0)
  .max(10)
  .step(0.001)
  .name('uFlowFieldFrequency');
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
let previousTime = 0;

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  let audioTime;

  // Check if audioContext is initialized and use audioContext.currentTime if available
  if (audioContext && audioContext.state === 'running') {
    audioTime = audioContext.currentTime;
  } else {
    audioTime = elapsedTime; // Use clock's elapsed time if audioContext is not available
  }

  const deltaTime = audioTime - previousTime;
  previousTime = audioTime;

  // Update controls
  controls.update();

  // GPGPU Update
  gpgpu.particlesVariable.material.uniforms.uTime.value = audioTime;
  particles.material.uniforms.uTime.value = audioTime;
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
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
