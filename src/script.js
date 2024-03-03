import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import GUI from 'lil-gui';
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl';

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 340 });
const debugObject = {};

// Canvas
const canvas = document.querySelector('canvas.webgl');

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
camera.position.set(4.5, 4, 11);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

debugObject.clearColor = '#000000';
renderer.setClearColor(debugObject.clearColor);

// Parameters Object
let parameters = {
  N: 12,
  count: 30000,
  waveComponents: [],
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
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

// Function to generate positions within a sphere
function initializeParticlesWithinSphere(count, radius) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let i3 = i * 3;
    // Generate random positions within a sphere
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = 2 * Math.PI * Math.random();
    const r = radius * Math.cbrt(Math.random()); // Uniform distribution within a sphere

    positions[i3 + 0] = r * Math.sin(phi) * Math.cos(theta); // x
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta); // y
    positions[i3 + 2] = r * Math.cos(phi); // z
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

baseGeometry.positions = initializeParticlesWithinSphere(parameters.count, parameters.radius);

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
  baseParticlesTexture.image.data[i4 + 3] = Math.random();
}

// Particles Variable
gpgpu.particlesVariable = gpgpu.computation.addVariable(
  'uParticles',
  gpgpuParticlesShader,
  baseParticlesTexture
);
gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [gpgpu.particlesVariable]);

// Uniforms
const waveUniforms = {
  N: { value: parameters.N },
  waveComponents: { value: new Float32Array(waveComponentsArray) },
  uRadius: { value: parameters.radius },
};

gpgpu.particlesVariable.material.uniforms.N = waveUniforms.N;
gpgpu.particlesVariable.material.uniforms.waveComponents = waveUniforms.waveComponents;
gpgpu.particlesVariable.material.uniforms.uRadius = waveUniforms.uRadius;

gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);
gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(0.5);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(2);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.5);

// Init
gpgpu.computation.init();

// Debug
gpgpu.debug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture,
  })
);
gpgpu.debug.visible = false;
gpgpu.debug.position.x = 3;
scene.add(gpgpu.debug);

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

  particles.material.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(
    gpgpu.particlesVariable
  ).texture;

  // Render normal scene
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
