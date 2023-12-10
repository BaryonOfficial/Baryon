import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNoise3D } from 'simplex-noise';
import { createNoise2D } from 'simplex-noise';

// Variables
const noise3D = createNoise3D();
const noise2D = createNoise2D();
const clock = new THREE.Clock();
const gui = new GUI();

let parameters, particlesGeometry, particlesMaterial, particlePoints;
const pi = Math.PI;
let elapsedTime = 0;

const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();

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
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 1000)
camera.position.y = 2
camera.position.z = 11
scene.add(camera)

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
    const components = parameters.waveComponents[i]
    const Ai = components[`A${i}`]
    const ui = components[`u${i}`]
    const vi = components[`v${i}`]
    const wi = components[`w${i}`]
    sum += Ai * Math.sin(ui * pi * x) * Math.sin(vi * pi * y) * Math.sin(wi * pi * z)
  }
  return sum
}

parameters = {
  N: 12,
  vel: 0.04,
  num: 25000,
  waveComponents:[]
}

// Populate initial wave component values
for (let i = 0; i < parameters.N; i++) {
  parameters.waveComponents.push({
    [`A${i}`]: Math.random() * 10 + 1,
    [`u${i}`]: Math.floor(Math.random() * 10) + 1,
    [`v${i}`]: Math.floor(Math.random() * 10) + 1,
    [`w${i}`]: Math.floor(Math.random() * 10) + 1
  });
}

console.log(parameters.waveComponents)

const sphereRadius = 5; // Radius of the sphere

const setupParticles = () => {
  // Create a BufferGeometry for particles
  particlesGeometry = new THREE.BufferGeometry();

  // Create arrays for positions and colors
  const positions = new Float32Array(parameters.num * 3); // x, y, z for each particle

// Create a PointsMaterial for particles with size, sizeAttenuation, and blending properties
  particlesMaterial = new THREE.PointsMaterial({
    size: 0.05, // Adjusted particle size with visible light trail effect
    sizeAttenuation: true,
    vertexColors: true, // Enable vertex colors
    blending: THREE.AdditiveBlending, // Additive blending for light effect
    depthWrite: false, // Prevent particles from affecting each other's depth test
    transparent: true, // Necessary for blending
  });

  // Initialize positions
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3

    const y = 1 - (i / parameters.num) + (1 / (2 * parameters.num)); // y goes from 1 to 0
    const radius = Math.sqrt(1 - Math.pow(y, 2)); // radius at y

    const phi = 2 * Math.PI * (i / ((1 + Math.sqrt(5)) / 2)); // golden angle approximation

    // Add noise to the initial positions
    const noiseScale = 0.05; // Adjust this value to change the intensity of the noise
    const noiseX = noise3D(radius * Math.cos(phi), y, radius * Math.sin(phi)) * noiseScale;
    const noiseY = noise3D(radius * Math.cos(phi), y, radius * Math.sin(phi)) * noiseScale;
    const noiseZ = noise3D(radius * Math.cos(phi), y, radius * Math.sin(phi)) * noiseScale;

    // // Initialize positions w/ noise
    positions[i3]     = sphereRadius * (radius * Math.cos(phi) + noiseX);
    positions[i3 + 1] = sphereRadius * (y + noiseY);
    positions[i3 + 2] = sphereRadius * (radius * Math.sin(phi) + noiseZ);

    // Initialize positions w/o noise
    // positions[i3]     = sphereRadius * (radius * Math.cos(phi));
    // positions[i3 + 1] = sphereRadius * (y);
    // positions[i3 + 2] = sphereRadius * (radius * Math.sin(phi));
  }

  // Add attributes to geometry
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Create a Points object using the geometry and material
  particlePoints = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particlePoints);
};

// Update particle positions
const updateParticles = () => {

  const positions = particlesGeometry.attributes.position.array;
  const colors = new Float32Array(parameters.num * 3); // r, g, b for each particle
  const minWalk = 0.002;

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3;
   
      // Calculate Chladni pattern value
      let x = (positions[i3] / sphereRadius);
      let y = (positions[i3 + 1] / sphereRadius);
      let z = (positions[i3 + 2] / sphereRadius);
      let chladniValue = chladni(x, y, z, parameters.N, parameters);
      let stochasticAmplitude = parameters.vel * (4 * pi * chladniValue**2)

      // Ensure min movement
      // stochasticAmplitude = Math.max(stochasticAmplitude, minWalk)

      const randomMovementX = randomInRange(-stochasticAmplitude, stochasticAmplitude);
      const randomMovementY = randomInRange(-stochasticAmplitude, stochasticAmplitude);
      const randomMovementZ = randomInRange(-stochasticAmplitude, stochasticAmplitude);

      positions[i3] += randomMovementX
      positions[i3 + 1] += randomMovementY
      positions[i3 + 2] += randomMovementZ 

      const color = new THREE.Color()

      const distanceFromCenter = Math.sqrt(x**2 + y**2 + z**2);
  
      color.setHSL(1 - distanceFromCenter * 2, 1.0, 0.5);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
   
    // Keep particles within the sphere
    const distance = Math.sqrt(positions[i3]**2 + positions[i3 + 1]**2 + positions[i3 + 2]**2)
    if (distance > sphereRadius) {
      const scale = sphereRadius /distance;
      positions[i3] *= scale
      positions[i3 + 1] *= scale
      positions[i3 + 2] *= scale
    }
  }

  // Set color attribute
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  particlesGeometry.attributes.position.needsUpdate = true;
};

let rotationSpeed = .01;

// Add GUI control for rotation speed
gui.add({ rotationSpeed: rotationSpeed }, 'rotationSpeed').min(0).max(1).step(0.001).onChange(value => {
  rotationSpeed = value;
});

// Initialize and start animation loop
function init() {
  setupParticles();
  animate();
}

function animate() {
  tick();
  requestAnimationFrame(animate);
}

const tick = () => {

  const delta = clock.getDelta();
  elapsedTime += delta;

  controls.update();

  // Rotate the entire shape
  particlePoints.rotation.y += rotationSpeed

  updateParticles();
  renderer.render(scene, camera);
};

init();

// GUI controller for 'num' with onFinishChange
gui.add(parameters, 'num').min(2000).max(50000).step(1000).onFinishChange(() => {
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
});

// Add GUI control for 'vel'
gui.add(parameters, 'vel').min(0).max(1).step(0.01).onChange(value => {
  parameters.vel = value;
});