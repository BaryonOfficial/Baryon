import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNoise3D } from 'simplex-noise';
const noise3D = createNoise3D();

// Variables

let parameters, particlesGeometry, particlesMaterial, particlePoints;
const pi = Math.PI;
let elapsedTime = 0;

// Debug
const gui = new GUI();

// Canvas
const canvas = document.querySelector('canvas.webgl');

// Scene
const scene = new THREE.Scene();

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
};

window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 1000);
camera.position.z = 12;
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Chladni pattern function
const chladni = (x, y, z, N, parameters) => {
  let sum = 0;
  for (let i=0; i < N; i++) {
    const Ai = parameters.waveComponents[i][`A${i}`]
    const ui = parameters.waveComponents[i][`u${i}`]
    const vi = parameters.waveComponents[i][`v${i}`]
    const wi = parameters.waveComponents[i][`w${i}`]
    sum += Ai * Math.sin(ui * pi * x) * Math.sin(vi * pi * y) * Math.sin(wi * pi * z)
  }
  return sum
}

parameters = {
  N: 10,
  v: 0.15,
  num: 25000,
  waveComponents:[]
}

// Populate initial wave component values
for (let i = 0; i < parameters.N; i++) {
  parameters.waveComponents.push({
    [`A${i}`]: Math.floor(Math.random() * 10) + 1,
    [`u${i}`]: Math.floor(Math.random() * 10) + 1,
    [`v${i}`]: Math.floor(Math.random() * 10) + 1,
    [`w${i}`]: Math.floor(Math.random() * 10) + 1
  });
}

const sphereRadius = 5; // Radius of the sphere

const setupParticles = () => {
  // Create a BufferGeometry for particles
  particlesGeometry = new THREE.BufferGeometry();

  // Create arrays for positions and colors
  const positions = new Float32Array(parameters.num * 3); // x, y, z for each particle
  const colors = new Float32Array(parameters.num * 3); // r, g, b for each particle

// Create a PointsMaterial for particles with size, sizeAttenuation, and blending properties
  particlesMaterial = new THREE.PointsMaterial({
    size: 0.05, // Adjusted particle size with visible light trail effect
    sizeAttenuation: true,
    vertexColors: true, // Enable vertex colors
    blending: THREE.AdditiveBlending, // Additive blending for light effect
    depthWrite: false, // Prevent particles from affecting each other's depth test
    transparent: true, // Necessary for blending
  });

  // Initialize positions and colors
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3
    const theta = Math.random() * 2 * pi + noise3D(i, i, i)
    const phi = Math.acos(2 * Math.random() - 1) + noise3D(i, i, i)
    const r = sphereRadius * Math.pow(Math.random(), 1/3);

    // Initialize positions
    positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // New color assignment, you could also vary this to create a gradient
    const zNormalized = (positions[i3 + 2] + sphereRadius) / (2 * sphereRadius);
    const hue = zNormalized
    const color = new THREE.Color().setHSL(hue, 1.0, 0.5); // Adjust hue, saturation, lightness for laser color
    colors[i3]     = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  // Add attributes to geometry
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Create a Points object using the geometry and material
  particlePoints = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particlePoints);
};


// Update particle positions
const updateParticles = () => {

  console.log('Updating particles...');

  const positions = particlesGeometry.attributes.position.array;
  const minWalk = 0.001;
  
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3;
    
    // Calculate Chladni pattern value with a noise offset
    let x = (positions[i3] / sphereRadius);
    let y = (positions[i3 + 1] / sphereRadius);
    let z = (positions[i3 + 2] / sphereRadius);
    let chladniValue = chladni(x, y, z, parameters.N, parameters);
    let stochasticAmplitude = parameters.v * Math.abs(chladniValue)

    // Use a time-dependent noise offset
    let noiseOffset = Math.max(1 - elapsedTime / 1, 0);

    // Add Perlin noise to the stochasticAmplitude
    stochasticAmplitude += noise3D(x, y, z) * noiseOffset;

    // Ensure min movement
    stochasticAmplitude = Math.max(stochasticAmplitude, minWalk)

    // Update positions based on Chladni value (using Math.random)
    positions[i3] += ((Math.random() - 0.5) * stochasticAmplitude * 2);
    positions[i3 + 1] += ((Math.random() - 0.5) * stochasticAmplitude * 2);
    positions[i3 + 2] += ((Math.random() - 0.5) * stochasticAmplitude * 2);
   
    // Keep particles within the sphere
    const distance = Math.sqrt(positions[i3]**2 + positions[i3 + 1]**2 + positions[i3 + 2]**2)
    if (distance > sphereRadius) {
      const scale = sphereRadius /distance;
      positions[i3] *= scale
      positions[i3 + 1] *= scale
      positions[i3 + 2] *= scale
    }
  }

  particlesGeometry.attributes.position.needsUpdate = true;
};

let rotationSpeed = .01;

// Add GUI control for rotation speed
gui.add({ rotationSpeed: rotationSpeed }, 'rotationSpeed').min(0).max(0.1).step(0.001).onChange(value => {
  rotationSpeed = value;
});

// Initialize and start animation loop
function init() {
  setupParticles();
  tick();
}

const clock = new THREE.Clock();

const tick = () => {

  const delta = clock.getDelta();
  elapsedTime += delta;

  controls.update();

  // Rotate the entire shape
  particlePoints.rotation.y += rotationSpeed

  updateParticles();
  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
};
init();

// GUI controller for 'num' with onFinishChange
gui.add(parameters, 'num').min(2000).max(30000).step(1000).onFinishChange(() => {
  // Dispose of the old geometry and material to free up GPU memory
  if (particlePoints) {
      particlePoints.geometry.dispose();
      particlePoints.material.dispose();
      scene.remove(particlePoints);

      // Clear references
      particlePoints = null;
      particlesGeometry = null;
      particlesMaterial = null;
  }

  // Re-setup the particles with the new count
  setupParticles();

  // Re-add particlePoints to the scene
  renderer.render(scene, camera)
});