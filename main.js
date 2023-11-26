import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Variables
let parameters, particlesGeometry, particlesMaterial, particlePoints;
const pi = Math.PI;

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
camera.position.x = 0;
camera.position.y = 0;
camera.position.z = 8;
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
const chladni = (x, y, a, b, m, n) => 
  a * Math.sin(pi * n * x) * Math.sin(pi * m * y) + b * Math.sin(pi * m * x) * Math.sin(pi * n * y);

// Parameters for particles
parameters = {
  m: 8, // freq param 1
  n: 4, // freq param 2
  a: 1, // freq param 3
  b: 1, // freq param 4
  v: 0.02, // velocity
  num: 20000, // number of particles
};



const planeSize = 10; // Example size of the plane

const setupParticles = () => {
  // Create a BufferGeometry for particles
  particlesGeometry = new THREE.BufferGeometry();

  // Create arrays for positions and colors
  const positions = new Float32Array(parameters.num * 3); // x, y, z for each particle
  const colors = new Float32Array(parameters.num * 3); // r, g, b for each particle

  // Initialize positions and colors
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3;

    // Initialize positions
    positions[i3] = (Math.random() - 0.5) * planeSize;
    positions[i3 + 1] = (Math.random() - 0.5) * planeSize;
    positions[i3 + 2] = 0;

    // Assign color - creating a rainbow gradient
    const color = new THREE.Color();
    color.setHSL(i / parameters.num, 1.0, 0.5); // Rainbow gradient
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  // Add attributes to geometry
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Create a PointsMaterial for particles, enabling vertex colors
  particlesMaterial = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true // Enable vertex colors
  });

  // Create a Points object using the geometry and material
  particlePoints = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particlePoints);
};


// Update particle positions
const updateParticles = () => {
  const positions = particlesGeometry.attributes.position.array;
  const minWalk = 0.05;
  
  for (let i = 0; i < parameters.num; i++) {
    const i3 = i * 3;
    
    // Convert positions for Chladni function
    let x = (positions[i3] / planeSize + 0.5);
    let y = (positions[i3 + 1] / planeSize + 0.5);

    // Calculate Chladni pattern value
    let chladniValue = chladni(x, y, parameters.a, parameters.b, parameters.m, parameters.n);
    let stochasticAmplitude = parameters.v * Math.abs(chladniValue)

    // Ensure min movement
    stochasticAmplitude = Math.max(stochasticAmplitude, minWalk)

    // Update positions based on Chladni value (can add random component as well)
    positions[i3] += (Math.random() - 0.5) * stochasticAmplitude * 2;
    positions[i3 + 1] += (Math.random() - 0.5) * stochasticAmplitude * 2;
    

    // Handle boundaries more naturally
    if (positions[i3] < -planeSize / 2) positions[i3] = -planeSize / 2;
    if (positions[i3] > planeSize / 2) positions[i3] = planeSize / 2;
    if (positions[i3 + 1] < -planeSize / 2) positions[i3 + 1] = -planeSize / 2;
    if (positions[i3 + 1] > planeSize / 2) positions[i3 + 1] = planeSize / 2;
  }

  particlesGeometry.attributes.position.needsUpdate = true;
};


// Initialize and start animation loop
function init() {
  setupParticles();
  tick();
}

const tick = () => {
  controls.update();
  updateParticles();
  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
};

init();

// GUI controllers
gui.add(parameters, 'm').min(1).max(16).step(1).onChange(updateParticles);
gui.add(parameters, 'n').min(1).max(16).step(1).onChange(updateParticles);
gui.add(parameters, 'a').min(-2).max(2).step(1).onChange(updateParticles);
gui.add(parameters, 'b').min(-2).max(2).step(1).onChange(updateParticles);
gui.add(parameters, 'v').min(0.01).max(.1).step(0.01).onChange(updateParticles);

// GUI controller for 'num' with onFinishChange
gui.add(parameters, 'num').min(2000).max(20000).step(1000).onFinishChange(() => {
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

