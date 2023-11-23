import GUI from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Variables
let particles, parameters, m, n, a, b;

// Debug
const gui = new GUI()

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

const settings = {
  nParticles : 20000
}
/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.x = 1
camera.position.y = 1
camera.position.z = 2
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))


// vibration strength params
let A = 0.02;
let minWalk = 0.002;

const pi = Math.PI;

// chladni 2D closed-form solution - returns between -1 and 1
const chladni = (x, y, a, b, m, n) => 
  a * Math.sin(pi*n*x) * Math.sin(pi*m*y) + b * Math.sin(pi*m*x) * Math.sin(pi*n*y);

/* Initialization */

// parameters for the GUI
  parameters = {
      m : 8, // freq param 1
      n : 4, // freq param 2
      a : 1, // freq param 3
      b : 1, // freq param 4
      v : 0.2, // velocity
      num : 20000, // number
  };
  
  // create GUI controllers for each parameter
  gui.add(parameters, 'm').min(1).max(16).step(1);
  gui.add(parameters, 'n').min(1).max(16).step(1);
  gui.add(parameters, 'a').min(-2).max(2).step(1);
  gui.add(parameters, 'b').min(-2).max(2).step(1);
  gui.add(parameters, 'v').min(0.01).max(.1).step(0.01);
  gui.add(parameters, 'num').min(2000).max(20000).step(1000);
  

const setupParticles = () => {
  // particle array
  particles = [];
  for (let i = 0; i < settings.nParticles; i++) {
    particles[i] = new Particle();
  }
}

/* Particle dynamics */

class Particle {

  constructor() {
    this.x = Math.random(0,1);
    this.y = Math.random(0,1);
    this.stochasticAmplitude;

    // this.color = [random(100,255), random(100,255), random(100,255)];
    
    this.updateOffsets();
  }

  move() {
    // what is our chladni value i.e. how much are we vibrating? (between -1 and 1, zeroes are nodes)
    let eq = chladni(this.x, this.y, a, b, m, n);
  
    // set the amplitude of the move -> proportional to the vibration
    this.stochasticAmplitude = parameters.v * Math.abs(eq);

    if (this.stochasticAmplitude <= minWalk) this.stochasticAmplitude = minWalk;

    // perform one random walk
    this.x += Math.random(-this.stochasticAmplitude, this.stochasticAmplitude);
    this.y += Math.random(-this.stochasticAmplitude, this.stochasticAmplitude);
 
    this.updateOffsets();
  }

  updateOffsets() {
    // handle edges
    if (this.x <= 0) this.x = 0;
    if (this.x >= 1) this.x = 1;
    if (this.y <= 0) this.y = 0;
    if (this.y >= 1) this.y = 1;
  
    // convert to screen space
    this.xOff = sizes.width * this.x; // (this.x + 1) / 2 * width;
    this.yOff = sizes.height * this.y; // (this.y + 1) / 2 * height;
  }

  show() {
    // stroke(...this.color);
    const geometry = new THREE.BufferGeometry();
    geometry.vertices.push(new THREE.Vector3(this.xOff, this.yOff, 0)); // Add a vertex at the point's position

    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1 }); // Set the point's color and size

    const point = new THREE.Points(geometry, material);

    scene.add(point);
  }
}

const moveParticles = () => {
  let movingParticles = particles.slice(0, parameters.num);

  // particle movement
  for(let particle of movingParticles) {
    particle.move();
    particle.show();
  }
}

function init() {
  setupParticles();
}

const tick = () => {
  // Update controls
  controls.update()

  // Update parameters, and move particles
  moveParticles();

  // Render
  renderer.render(scene, camera)

  // Call tick again on the next frame
  window.requestAnimationFrame(tick)
}

// Start the animation loop
init();
tick();