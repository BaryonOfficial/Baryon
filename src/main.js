import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { setupGUI } from "./guiSetup.js";
import { chladni } from "./chladni.js";
import { setupParticles } from "./particleSetup.js";
import { updateParticles } from "./particleUpdate.js";

import { createNoise3D } from "simplex-noise";
import { createNoise2D } from "simplex-noise";

// Variables
const noise3D = createNoise3D();
const noise2D = createNoise2D();
const clock = new THREE.Clock();

const pi = Math.PI;
const sphereRadius = 5; // Radius of the sphere
let elapsedTime = 0;

const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
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
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  1000
);
camera.position.y = 2;
camera.position.z = 11;
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

let parameters = {
  N: 12,
  vel: 0.125,
  num: 25000,
  waveComponents: [],
  rotationSpeed: 0.01,
};

// Populate initial wave component values
for (let i = 0; i < parameters.N; i++) {
  parameters.waveComponents.push({
    [`A${i}`]: Math.random() * 10 + 1,
    [`u${i}`]: Math.floor(Math.random() * 10) + 1,
    [`v${i}`]: Math.floor(Math.random() * 10) + 1,
    [`w${i}`]: Math.floor(Math.random() * 10) + 1,
  });
}

console.log(parameters.waveComponents);

const { particlesGeometry, particlesMaterial, particlePoints } = setupParticles(
  parameters,
  sphereRadius,
  scene
);

// Initialize and start animation loop
function init() {
  setupParticles(parameters, sphereRadius, scene);
  tick();
}

const tick = () => {
  const delta = clock.getDelta();
  elapsedTime += delta;

  controls.update();

  // Rotate the entire shape
  particlePoints.rotation.y += parameters.rotationSpeed;

  updateParticles(particlesGeometry, parameters, sphereRadius, chladni);
  renderer.render(scene, camera);

  requestAnimationFrame(tick);
};

init();
setupGUI(parameters);
