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
  N: 12,
  count: 200000,
  waveComponents: [],
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
  threshold: 0.75,
  zeroPointSpeed: 100.0,
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

// Function to generate positions on a spherical grid
function initializeParticlesOnSphericalGrid(count, radius) {
  const positions = new Float32Array(count * 3);

  const deltaTheta = Math.PI / Math.ceil(Math.sqrt(count));
  const deltaPhi = (2 * Math.PI) / Math.ceil(Math.sqrt(count));

  let index = 0;
  for (let theta = 0; theta < Math.PI; theta += deltaTheta) {
    for (let phi = 0; phi < 2 * Math.PI; phi += deltaPhi) {
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(theta);

      positions[index++] = x;
      positions[index++] = y;
      positions[index++] = z;
    }
  }

  return positions;
}

function initializeParticlesOnSphereSurface(count, radius) {
  const positions = new Float32Array(count * 3);

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;

    const x = radius * Math.sin(inclination) * Math.cos(azimuth);
    const y = radius * Math.sin(inclination) * Math.sin(azimuth);
    const z = radius * Math.cos(inclination);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}

// Colors attribute
const colors = new Float32Array(baseGeometry.count * 3); // r, g, b for each particle
for (let i = 0; i < baseGeometry.count; i++) {
  colors[i * 3 + 0] = 1.0; // Red
  colors[i * 3 + 1] = 1.0; // Green
  colors[i * 3 + 2] = 1.0; // Blue
}

baseGeometry.positions = initializeParticlesOnSphereSurface(parameters.count, parameters.radius);

/**
 * GPU Compute
 */

// Setup
const gpgpu = {};
gpgpu.size = Math.ceil(Math.sqrt(baseGeometry.count));
gpgpu.computation = new GPUComputationRenderer(gpgpu.size, gpgpu.size, renderer);

// Base Particles
const baseParticlesTexture = gpgpu.computation.createTexture();

for (let i = 0; i < baseGeometry.count; i++) {
  const i3 = i * 3;
  const i4 = i * 4;

  // Position based on Geometry
  baseParticlesTexture.image.data[i4 + 0] = baseGeometry.positions[i3 + 0];
  baseParticlesTexture.image.data[i4 + 1] = baseGeometry.positions[i3 + 1];
  baseParticlesTexture.image.data[i4 + 2] = baseGeometry.positions[i3 + 2];
  baseParticlesTexture.image.data[i4 + 3] = 0.0;
}

/**
 * ScalarField Variable
 */
const test = gpgpu.computation.createTexture();
gpgpu.scalarFieldVariable = gpgpu.computation.addVariable('uScalarField', scalarFieldShader, test);

//Uniforms
const waveUniforms = {
  N: { value: parameters.N },
  waveComponents: { value: new Float32Array(waveComponentsArray) },
  uRadius: { value: parameters.radius },
};

gpgpu.scalarFieldVariable.material.uniforms.N = waveUniforms.N;
gpgpu.scalarFieldVariable.material.uniforms.waveComponents = waveUniforms.waveComponents;
gpgpu.scalarFieldVariable.material.uniforms.uRadius = waveUniforms.uRadius;
gpgpu.scalarFieldVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);
console.log(gpgpu.scalarFieldVariable.material.uniforms.uBase.value.image.data);

// Dependency
gpgpu.computation.setVariableDependencies(gpgpu.scalarFieldVariable, []);

/**
 * ZeroPoints Variable
 */
gpgpu.zeroPointsVariable = gpgpu.computation.addVariable(
  'uZeroPoints',
  zeroPointsShader,
  gpgpu.computation.createTexture()
);

gpgpu.zeroPointsVariable.material.uniforms.uThreshold = { value: parameters.threshold };

// Dependency
gpgpu.computation.setVariableDependencies(gpgpu.zeroPointsVariable, [gpgpu.scalarFieldVariable]);

/**
 * Particles Variable
 */

gpgpu.particlesVariable = gpgpu.computation.addVariable(
  'uParticles',
  gpgpuParticlesShader,
  baseParticlesTexture
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

//******************************************************* INITIALIZATION *******************************************************//
gpgpu.computation.init();

// Debug
let mode = true;

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
    uSize: new THREE.Uniform(0.04),
    uResolution: new THREE.Uniform(
      new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)
    ),
    uParticlesTexture: new THREE.Uniform(),
  },
});

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

/**
 * Animate
 */
const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - previousTime;
  previousTime = elapsedTime;

  // Update controls
  controls.update();

  // GPGPU Update
  gpgpu.particlesVariable.material.uniforms.uTime.value = elapsedTime;
  gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;

  gpgpu.computation.compute();

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
console.log(gpgpu.computation.getCurrentRenderTarget(gpgpu.scalarFieldVariable).texture);
