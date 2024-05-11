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

//******************************************************* GENERAL INITIALIZATION *******************************************************//

/**
 * Base
 */
// Debug
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

debugObject.backgroundColor = '#000000';
renderer.setClearColor(debugObject.backgroundColor);

//****************************** AUDIO PROCESSING *********************************//

let fftSize = 8192;
let audioReader;
let gain;
let essentiaNode = null;
let soundGainNode;

// create an AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add(listener);

// create an Audio source
const sound = new THREE.Audio(listener);
sound.started = false;
console.log('Sound:', sound);

// Get references to the audio controls
const audioInput = document.getElementById('audioInput');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');

let audioLoaded = false;
const audioLoader = new THREE.AudioLoader();
audioInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  const fileURL = URL.createObjectURL(file);

  // Stop the current audio if it is playing and reset its buffer
  if (sound.started === true) {
    sound.stop();
    if (audioCtx.state === 'running') {
      audioCtx.suspend().catch((error) => {
        console.error('Failed to suspend audio context:', error);
      });
    }
    sound.setBuffer(null);
    playButton.textContent = 'Play';
    sound.started = false;
    console.log('Audio stopped on change');
  } else if (!sound.started && playButton.textContent !== 'Play') {
    if (audioCtx.state === 'running') {
      audioCtx.suspend().catch((error) => {
        console.error('Failed to suspend audio context:', error);
      });
    }
    sound.setBuffer(null);
    playButton.textContent = 'Play';
    console.log('Audio ended & reset w/ new file');
  }

  audioLoader.load(fileURL, function (buffer) {
    sound.setBuffer(buffer);
    sound.setLoop(false);
    sound.setVolume(0.5);
    audioLoaded = true;
  });
});

let audioCtx = sound.context;
console.log(audioCtx);

const capacity = 5;

function setupAudioGraph() {
  if (!window.SharedArrayBuffer) {
    console.error('SharedArrayBuffer is not supported in this browser.');
    alert('SharedArrayBuffer is not supported in this browser. Please use a compatible browser.');
    return;
  }
  let sab = exports.RingBuffer.getStorageForCapacity(capacity, Float32Array); // capacity: three float32 values [pitch, confidence, rms]
  console.log('Shared Buffer Size:', sab.byteLength);
  let rb = new exports.RingBuffer(sab, Float32Array);
  audioReader = new exports.AudioReader(rb);

  essentiaNode = new AudioWorkletNode(audioCtx, 'audio-data-processor', {
    processorOptions: {
      bufferSize: fftSize,
      sampleRate: audioCtx.sampleRate,
      capacity: capacity,
    },
  });

  // Add the onmessageerror event listener
  essentiaNode.port.onmessageerror = (event) => {
    console.error('AudioWorkletNode message error:', event);
  };

  try {
    essentiaNode.port.postMessage({
      sab: sab,
    });
  } catch (_) {
    alert('No SharedArrayBuffer tranfer support, try another browser.');
    // $("#recordButton").off('click', onRecordClickHandler);
    // $("#recordButton").prop("disabled", true);
    return;
  }

  gain = sound.gain;
  soundGainNode = sound.getOutput();
  soundGainNode.connect(essentiaNode);
  // essentiaNode.connect(gain);
  gain.connect(audioCtx.destination);
  logNodeConnections();
}

function logNodeConnections() {
  console.log('SoundGainNode -> Essentia Node:', soundGainNode.connect(essentiaNode));
  console.log('Essentia Node -> Gain Node:', essentiaNode.connect(gain));
  console.log('Gain Node -> Destination:', gain.connect(audioCtx.destination));
}

// ***** Analysis ***** //

// create an AudioAnalyser, passing in the sound and desired fftSize
const analyser = new THREE.AudioAnalyser(sound, fftSize);

let avgAmplitude = 0;
let freqData = 0;

function audioAnalysis() {
  if (sound.isPlaying) {
    avgAmplitude = analyser.getAverageFrequency();
    freqData = analyser.getFrequencyData();
  } else if (sound.started === false) {
    avgAmplitude = 0;
    freqData = 0;
  }

  return { avgAmplitude, freqData };
}

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
      audioCtx.audioWorklet
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

//***** Audio Playback *****//

// Play audio when play button is clicked
playButton.addEventListener('click', () => {
  if (sound.isPlaying) {
    sound.pause();
    audioCtx.suspend().catch((error) => {
      console.error('Failed to suspend audio context:', error);
    });
    playButton.textContent = 'Play';
  } else if (!sound.isPlaying && audioLoaded) {
    if (audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          sound.play();
          sound.started = true;
          playButton.textContent = 'Pause';
        })
        .catch((error) => {
          console.error('Failed to resume audio context:', error);
        });
    } else {
      sound.play();
      sound.started = true;
      playButton.textContent = 'Pause';
    }
  }
});

// Stop audio when stop button is clicked
stopButton.addEventListener('click', () => {
  sound.stop();
  if (audioCtx.state === 'running') {
    audioCtx.suspend().catch((error) => {
      console.error('Failed to suspend audio context:', error);
    });
  }
  sound.started = false;
  playButton.textContent = 'Play';
});

sound.onEnded = function () {
  sound.stop();
  if (audioCtx.state === 'running') {
    audioCtx
      .suspend()
      .then(() => {
        console.log('Audio context suspended successfully');
      })
      .catch((error) => {
        console.error('Failed to suspend audio context:', error);
      });
  }

  console.log('Audio ended');
  sound.started = false;
  playButton.textContent = 'Replay'; // Update the play button text
};

let lastKnownTime = 0;

function timeHandler(elapsedTime) {
  if (sound.isPlaying && sound.started) {
    deltaTime = sound.listener.timeDelta;
    time = sound.context.currentTime;
    lastKnownTime = time;
  } else if (!sound.isPlaying && sound.started) {
    time = lastKnownTime;
    deltaTime = 0;
  } else {
    deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;
    time = elapsedTime;
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
unrealBloomPass.enabled = true;
effectComposer.addPass(unrealBloomPass);

unrealBloomPass.strength = 0.36;
unrealBloomPass.radius = -1.5;
unrealBloomPass.threshold = 0.4;

const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
effectComposer.addPass(gammaCorrectionPass);

if (renderer.getPixelRatio() === 1 && !renderer.capabilities.isWebGL2) {
  // Antialiasing must be after gammaCorrection
  const smaaPass = new SMAAPass();
  effectComposer.addPass(smaaPass);

  console.log('SMAA enabled');
}

// Parameters Object
let parameters = {
  N: 22,
  count: 1500000,
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
  threshold: 0.064,
  surfaceRatio: 0.33,
  surfaceThreshold: 0.01,
  particleSpeed: 1.0,
};

// Base Geometries
const baseGeometry = {
  count: parameters.count,
  positions: new Float32Array(parameters.count * 3), // x, y, z for each particle
};

const colors = new Float32Array(baseGeometry.count * 3); // r, g, b for each particle

function initializeParticlesInSphereVolumeAndSurface(count, radius, surfaceRatio) {
  const positions = new Float32Array(count * 3);
  const surfaceCount = Math.floor(count * surfaceRatio);
  // const volumeCount = count - surfaceCount;

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
 * Load model
 */
const gltf = await gltfLoader.loadAsync('./Baryon.glb');
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

const baryonLogoTexture = gpgpu.computation.createTexture();

for (let i = 0; i < baseGeometry2.count; i++) {
  const i3 = i * 3;
  const i4 = i * 4;

  // Position based on geometry
  baryonLogoTexture.image.data[i4 + 0] = baseGeometry2.geometry.attributes.position.array[i3 + 0];
  baryonLogoTexture.image.data[i4 + 1] = baseGeometry2.geometry.attributes.position.array[i3 + 1];
  baryonLogoTexture.image.data[i4 + 2] = baseGeometry2.geometry.attributes.position.array[i3 + 2];
  baryonLogoTexture.image.data[i4 + 3] = Math.random();
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

function generateRandomPitches(capacity) {
  const pitches = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    // Generate a random pitch, for example between 200 Hz and 2000 Hz
    pitches[i] = 200 + Math.random() * 2000;
  }
  return pitches;
}

const randomPitches = generateRandomPitches(capacity);

// Global Uniform Variables
const waveUniforms = {
  pitches: { value: randomPitches },
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

// Audio Data & Uniforms
const format = renderer.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
let essentiaData = new Float32Array(capacity);

gpgpu.audioDataVariable.material.uniforms.tPitches = {
  value: new THREE.DataTexture(essentiaData, capacity, 1, THREE.RedFormat, THREE.FloatType),
};
gpgpu.audioDataVariable.material.uniforms.tDataArray = {
  value: new THREE.DataTexture(
    analyser.data, // Initial empty data
    fftSize / 2,
    1,
    format
  ),
};
gpgpu.audioDataVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
gpgpu.audioDataVariable.material.uniforms.sampleRate = new THREE.Uniform(audioCtx.sampleRate);
gpgpu.audioDataVariable.material.uniforms.bufferSize = new THREE.Uniform(fftSize);
gpgpu.audioDataVariable.material.uniforms.capacity = new THREE.Uniform(capacity);
gpgpu.audioDataVariable.material.uniforms.uRandomPitches = waveUniforms.pitches;

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

gpgpu.scalarFieldVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);
gpgpu.scalarFieldVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);
gpgpu.scalarFieldVariable.material.uniforms.capacity = new THREE.Uniform(capacity);

// Dependencies
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
gpgpu.zeroPointsVariable.material.uniforms.uSurfaceThreshold = new THREE.Uniform(
  parameters.surfaceThreshold
);
gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl = new THREE.Uniform(true);

// Dependencies
gpgpu.computation.setVariableDependencies(gpgpu.zeroPointsVariable, [gpgpu.scalarFieldVariable]);

/**
 * Particles Variable
 */
gpgpu.particlesVariable = gpgpu.computation.addVariable(
  'uParticles',
  gpgpuParticlesShader,
  baseParticlesTexture
);

// Uniforms
gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(1.0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(3.6);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.64);
gpgpu.particlesVariable.material.uniforms.uThreshold = new THREE.Uniform(parameters.threshold);
gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform(baryonLogoTexture);
gpgpu.particlesVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);
gpgpu.particlesVariable.material.uniforms.uParticleSpeed = new THREE.Uniform(24);
gpgpu.particlesVariable.material.uniforms.uStarted = new THREE.Uniform(sound.started);
gpgpu.particlesVariable.material.uniforms.uParticleMovementType = new THREE.Uniform(1);
gpgpu.particlesVariable.material.uniforms.uRadius = new THREE.Uniform(parameters.radius);

// Dependencies
gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [
  gpgpu.zeroPointsVariable,
  gpgpu.particlesVariable,
]);

//******************************************************* GPGPU INITIALIZATION *******************************************************//

gpgpu.computation.init();

// Debug Planes
let mode = false;
gpgpu.audioDebug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.audioDataVariable).texture,
  })
);
gpgpu.audioDebug.visible = mode;
gpgpu.audioDebug.position.x = -4;
gpgpu.audioDebug.position.y = 2;

const scalarFieldDebug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture,
  })
);
scalarFieldDebug.visible = mode;
scalarFieldDebug.position.x = -4;
scalarFieldDebug.position.y = 1;

const zeroPointsDebug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3), // The size of the plane can be adjusted as needed
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.zeroPointsVariable).texture,
  })
);
zeroPointsDebug.visible = mode;
zeroPointsDebug.position.x = -4;
zeroPointsDebug.position.y = -1;

gpgpu.particlesDebug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture,
  })
);
gpgpu.particlesDebug.visible = mode;
gpgpu.particlesDebug.position.x = -4;
gpgpu.particlesDebug.position.y = -2;

if (mode) {
  scene.add(gpgpu.audioDebug);
  scene.add(scalarFieldDebug);
  scene.add(zeroPointsDebug);
  scene.add(gpgpu.particlesDebug);
}

/**
 * Particles
 */
const particles = {};
const materialParameters = {};

// materialParameters.color = new THREE.Color('rgb(77,142,236)');
materialParameters.color = new THREE.Color('rgb(5, 134, 255)');
// rgb(77,142,236)

// Material
particles.material = new THREE.ShaderMaterial({
  // transparent: true,
  side: THREE.DoubleSide,
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
    uAverageAmplitude: new THREE.Uniform(0.0),
    uRotation: new THREE.Uniform(1.5),
    uDeltaTime: new THREE.Uniform(0),
    uSoundPlaying: new THREE.Uniform(sound.isPlaying),
  },
});

// Texture Initialization
particles.material.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(
  gpgpu.particlesVariable
).texture;

// Geometry
const particlesUvArray = new Float32Array(baseGeometry.count * 2);

// Sizes
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
particles.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizesArray, 1));

// Points
particles.points = new THREE.Points(particles.geometry, particles.material);
scene.add(particles.points);

/**
 * Controls
 */
gui.close();

const bloomFolder = gui.addFolder('Bloom Effect');
bloomFolder.add(unrealBloomPass, 'enabled').name('Enable Bloom');
bloomFolder.add(unrealBloomPass, 'strength').min(0).max(2).step(0.001).name('Bloom Strength');
bloomFolder.add(unrealBloomPass, 'radius').min(-2).max(2).step(0.001).name('Bloom Radius');
bloomFolder.add(unrealBloomPass, 'threshold').min(0).max(1).step(0.001).name('Bloom Threshold');
bloomFolder.close();

const colorFolder = gui.addFolder('Color Settings');
colorFolder
  .addColor(debugObject, 'backgroundColor')
  .name('Background Color')
  .onChange(() => {
    renderer.setClearColor(debugObject.backgroundColor);
  });
colorFolder
  .addColor(materialParameters, 'color')
  .name('Volume Color')
  .onChange(() => {
    particles.material.uniforms.uColor.value.set(materialParameters.color);
  });
colorFolder.close();

const granularControls = gui.addFolder('Granular Controls');
granularControls
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence, 'value')
  .min(0.01)
  .max(1)
  .step(0.001)
  .name('uFlowFieldInfluence');
granularControls
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength, 'value')
  .min(0.1)
  .max(10)
  .step(0.001)
  .name('uFlowFieldStrength');
granularControls
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency, 'value')
  .min(0.01)
  .max(1)
  .step(0.001)
  .name('uFlowFieldFrequency');
granularControls
  .add(gpgpu.particlesVariable.material.uniforms.uParticleSpeed, 'value')
  .min(1)
  .max(200)
  .step(0.001)
  .name('uParticleSpeed');
granularControls
  .add(parameters, 'threshold')
  .min(0.01)
  .max(5)
  .step(0.001)
  .name('uThreshold')
  .onChange(() => {
    gpgpu.zeroPointsVariable.material.uniforms.uThreshold.value = parameters.threshold;
    gpgpu.particlesVariable.material.uniforms.uThreshold.value = parameters.threshold;
  });
granularControls.close();

const aesthetics = gui.addFolder('Aesthetics');
aesthetics.add(particles.material.uniforms.uSize, 'value').min(0).max(1).step(0.001).name('uSize');
aesthetics
  .add(particles.material.uniforms.uRotation, 'value')
  .min(0)
  .max(10)
  .step(0.001)
  .name('uRotation');
aesthetics
  .add(gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl, 'value')
  .name('Surface Particles')
  .onChange(function (value) {
    gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl.value = value;
  });
aesthetics
  .add(gpgpu.particlesVariable.material.uniforms.uParticleMovementType, 'value', {
    Quickest: 0,
    Smoothed: 1,
  })
  .name('Particle Movement Type')
  .onChange(function (value) {
    gpgpu.particlesVariable.material.uniforms.uParticleMovementType.value = value;
  });
aesthetics.close();

/******************************************************* ANIMATION *******************************************************/
const clock = new THREE.Clock();
let frameCounter = 0;
let previousTime = 0;
let time = 0;
let deltaTime = 0;
let frameReset = 10;

// function pseudoVisualizer() {
//   // // Check if 60 frames have passed
//   if (frameCounter % frameReset === 0) {
//     waveUniforms.pitches.value = generateRandomPitches(capacity);
//     frameCounter = 0; // Reset the counter after generating
//   }
// }

// function logUniforms(material, variableName) {
//   console.log(`Uniforms for ${variableName}:`);
//   for (const [key, uniform] of Object.entries(material.uniforms)) {
//     console.log(`${key}:`, uniform.value);
//   }
// }

// function logGPGPUUniforms() {
//   if (gpgpu.audioDataVariable && gpgpu.audioDataVariable.material) {
//     logUniforms(gpgpu.audioDataVariable.material, 'Audio Data');
//   }
//   if (gpgpu.scalarFieldVariable && gpgpu.scalarFieldVariable.material) {
//     logUniforms(gpgpu.scalarFieldVariable.material, 'Scalar Field');
//   }
//   if (gpgpu.particlesVariable && gpgpu.particlesVariable.material) {
//     logUniforms(gpgpu.particlesVariable.material, 'Particles');
//   }
// }

const tick = () => {
  frameCounter++;
  // pseudoVisualizer();

  const elapsedTime = clock.getElapsedTime();
  const { time, deltaTime } = timeHandler(elapsedTime);
  // console.log('time:', time);
  // console.log('deltaTime:', deltaTime);

  // GPGPU Updates
  gpgpu.particlesVariable.material.uniforms.uTime.value = time;
  gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
  gpgpu.particlesVariable.material.uniforms.uStarted.value = sound.started;

  particles.material.uniforms.uSoundPlaying.value = sound.isPlaying;
  particles.material.uniforms.uTime.value = time;
  particles.material.uniforms.uDeltaTime.value = deltaTime;
  controls.update(deltaTime);

  if (audioReader.available_read() >= 1) {
    let read = audioReader.dequeue(essentiaData);
    if (read !== 0) {
      gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
      // console.log(
      //   'Essentia Data:',
      //   gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data
      // );
    }
  }

  if (sound.isPlaying) {
    const { avgAmplitude, freqData } = audioAnalysis();
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    particles.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  } else if (!sound.isPlaying && !sound.started) {
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = 0;
    particles.material.uniforms.uAverageAmplitude.value = 0;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(0);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  }

  // Log Uniforms
  // if (frameCounter % 60 === 0) {
  //   // For example, log every 60 frames
  //   logGPGPUUniforms();
  // }

  // ******** GPGPU START ******** //
  gpgpu.computation.compute();

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

  // Normal Renderer
  // renderer.render(scene, camera);

  // Effect Composer Renderer
  effectComposer.render();

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

startAudioProcessing();
