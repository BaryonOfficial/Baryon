import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import GUI from 'lil-gui';
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl';
import scalarFieldShader from './shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from './shaders/gpgpu/zeroPoints.glsl';
import audioDataShader from './shaders/gpgpu/audioData.glsl';
import { analyze } from 'web-audio-beat-detector';
import * as Pitchfinder from 'pitchfinder';

/******************************************************* AUDIO PROCESSING *******************************************************/

let audioContext = new AudioContext();
let bufferSource;
let audioBuffer;
let audioWorkletNode;
let audioFile;

const quantization = 4;
const bufferSize = 4096;

const bufferLength = 0;
const nNotes = 0;

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

const audioUniforms = {
  tPitches: { value: frequenciesTexture },
  tDataArray: { value: dataArrayTexture },
  uAvgAmplitude: { value: 0.0 },
  uTempo: { value: 0.0 },
  nNotes: { value: 0 },
  sampleRate: { value: audioContext.sampleRate },
  bufferSize: { value: bufferSize },
};

async function setupAudioWorklet(file, quantization, bufferSize) {
  audioFile = file;

  await audioContext.audioWorklet.addModule('audioProcessor.js');

  const fileReader = new FileReader();
  fileReader.onload = async () => {
    try {
      const arrayBuffer = fileReader.result;
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      if (!audioWorkletNode) {
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-data-processor', {
          processorOptions: {
            bufferSize: bufferSize,
          },
        });
        audioWorkletNode.connect(audioContext.destination);
      }

      audioWorkletNode.onprocessorerror = (event) => {
        console.error('AudioWorkletProcessor error event:', event);
        console.error('AudioWorkletProcessor error:', event.error);
        // Handle the error case, e.g., set a flag to indicate audio is not playing
      };

      console.log('AudioWorklet Connected');

      audioWorkletNode.port.onmessage = async (event) => {
        const audioData = event.data;
        const detectPitch = Pitchfinder.YIN();
        const analyser = new AnalyserNode(audioContext, { fftSize: bufferSize });
        bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const timeDomainData = new Uint8Array(bufferSize);

        // Perform audio analysis on the chunk
        const tempo = await estimateTempo(audioBuffer);
        const frequencies = Pitchfinder.frequencies(detectPitch, audioData, {
          tempo: tempo,
          quantization: quantization,
        });

        analyser.getByteFrequencyData(dataArray);
        analyser.getByteTimeDomainData(timeDomainData);

        const avgAmplitude = getAverageAmplitude(timeDomainData);
        const N = frequencies.length;

        // Update uniforms
        frequenciesTexture.image.data.set(frequencies);
        frequenciesTexture.needsUpdate = true;

        dataArrayTexture.image.data.set(dataArray);
        dataArrayTexture.needsUpdate = true;

        audioUniforms.nNotes.value = N;
        audioUniforms.uAvgAmplitude.value = avgAmplitude;
        audioUniforms.uTempo.value = tempo;
      };

      async function estimateTempo(audioBuffer) {
        try {
          const tempo = await analyze(audioBuffer);
          return tempo;
        } catch (err) {
          throw err;
        }
      }

      function getAverageAmplitude(timeDomainData) {
        const sum = timeDomainData.reduce((acc, val) => acc + Math.abs(val - 128), 0);
        return sum / timeDomainData.length;
      }
    } catch (error) {
      console.error('Error in fileReader.onload:', error);
    }
  };
  console.log('Before readAsArrayBuffer');

  fileReader.readAsArrayBuffer(audioFile);
}

// Function to handle file input change event
function handleFileInputChange(event) {
  audioFile = event.target.files[0];
  console.log('Selected audio file:', audioFile); // Add this line
}

async function playAudio() {
  // Check if the audio context and audio buffer are available
  if (!audioContext || !audioBuffer) {
    // If not, try to re-initialize them using the stored audioFile
    if (audioFile) {
      await setupAudioWorklet(audioFile, quantization, bufferSize);
    } else {
      console.log('No audio file selected, unable to play audio.');
      return;
    }
  }

  // Check if the audio is already playing
  if (
    audioContext.state === 'running' &&
    bufferSource &&
    bufferSource.playbackState === bufferSource.PLAYING_STATE
  ) {
    console.log('Audio is already playing, ignoring this click.');
    return;
  }

  await new Promise((resolve) => {
    const checkAudioWorkletConnected = () => {
      if (audioWorkletNode && audioWorkletNode.port) {
        resolve();
      } else {
        setTimeout(checkAudioWorkletConnected, 100);
      }
    };
    checkAudioWorkletConnected();
  });

  // Create a new buffer source if one doesn't exist or if it's not playing
  if (!bufferSource || bufferSource.playbackState !== bufferSource.PLAYING_STATE) {
    bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(audioContext.destination);
  }

  // Start the audio playback
  bufferSource.start();
  console.log('Audio playback started');
}

function pauseAudio() {
  if (audioContext) {
    if (audioContext.state === 'running') {
      audioContext.suspend().then(() => {
        console.log('Audio playback paused');
      });
    } else if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('Audio playback resumed');
      });
    }
  }
}

function resetAudio() {
  if (audioContext && bufferSource) {
    bufferSource.stop();
    bufferSource.disconnect();
    audioContext.close().then(() => {
      audioContext = null;
      bufferSource = null;
      audioWorkletNode = null;
      console.log('Audio playback reset');
    });
  }
}

// Add event listener to the file input element
const audioInput = document.getElementById('audioInput');
audioInput.addEventListener('change', handleFileInputChange);

const playButton = document.getElementById('playButton');
playButton.addEventListener('click', playAudio);

const pauseButton = document.getElementById('pauseButton');
pauseButton.addEventListener('click', pauseAudio);

const resetButton = document.getElementById('resetButton');
resetButton.addEventListener('click', resetAudio);

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
  waveComponents: [],
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
  threshold: 1.25,
  zeroPointSpeed: 100.0,
  surfaceRatio: 0.33,
};

// Populate initial wave component values
for (let i = 0; i < parameters.N; i++) {
  parameters.waveComponents.push({
    [`A${i}`]: Math.random() * 3 + 1,
    [`u${i}`]: Math.floor(Math.random() * 10) + 1,
    [`v${i}`]: Math.floor(Math.random() * 10) + 1,
    [`w${i}`]: Math.floor(Math.random() * 10) + 1,
  });
}

// Flatten the wave components into an array that can be used in GLSL
const waveComponentsArray = [];
for (let i = 0; i < parameters.N; i++) {
  waveComponentsArray.push(parameters.waveComponents[i][`A${i}`]);
  waveComponentsArray.push(parameters.waveComponents[i][`u${i}`]);
  waveComponentsArray.push(parameters.waveComponents[i][`v${i}`]);
  waveComponentsArray.push(parameters.waveComponents[i][`w${i}`]);
}

// Base Geometry
const baseGeometry = {
  count: parameters.count,
  positions: new Float32Array(parameters.count * 3), // x, y, z for each particle
};

const colors = new Float32Array(baseGeometry.count * 3); // r, g, b for each particle

function initializeParticlesInSphere(count, radius) {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * (radius / 3);
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

baseGeometry.positions = initializeParticlesInSphereVolumeAndSurface(
  parameters.count,
  parameters.radius,
  parameters.surfaceRatio
);

/**
 * GPU Compute
 */

// Setup
const gpgpu = {};
gpgpu.size = Math.ceil(Math.sqrt(baseGeometry.count));
gpgpu.computation = new GPUComputationRenderer(gpgpu.size, gpgpu.size, renderer);

// Particles w/ positions only for computation
const baseParticlesTexture = gpgpu.computation.createTexture();

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
  waveComponents: { value: new Float32Array(waveComponentsArray) },
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
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(0.5);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(1);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.5);
gpgpu.particlesVariable.material.uniforms.uThreshold = { value: parameters.threshold };
gpgpu.particlesVariable.material.uniforms.uZeroPointSpeed = { value: parameters.zeroPointSpeed };
gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);

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
  vertexShader: particlesVertexShader,
  fragmentShader: particlesFragmentShader,
  uniforms: {
    uSize: new THREE.Uniform(0.03),
    uResolution: new THREE.Uniform(
      new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)
    ),
    uParticlesTexture: new THREE.Uniform(),
    uTime: new THREE.Uniform(0),
  },
});

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
  .max(1)
  .step(0.001)
  .name('uFlowFieldFrequency');

/******************************************************* ANIMATION *******************************************************/

const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
  const audioTime = audioContext.currentTime;
  const elapsedTime = clock.getElapsedTime();
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
