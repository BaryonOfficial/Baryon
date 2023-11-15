import * as THREE from 'three';
let sliders, m, n, a, b;

// vibration strength params
let A = 0.02;
let minWalk = 0.002;

const settings = {
  nParticles : 20000,
  canvasSize : [600, 600],
}

const pi = math.PI;

// chladni 2D closed-form solution - returns between -1 and 1
const chladni = (x, y, a, b, m, n) => 
  a * sin(pi*n*x) * sin(pi*m*y) + b * sin(pi*m*x) * sin(pi*n*y);

/* Initialization */

let scene, camera, renderer, particles;

function initThreeJS() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Initialize particles as vertices in a Three.js geometry
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(settings.nParticles * 3); // three components per vertex
  
  // Populate particles and vertices array
  for (let i = 0; i < settings.nParticles; i++) {
    const x = (Math.random() - 0.5) * 2; // Random value between -1 and 1
    const y = (Math.random() - 0.5) * 2; // Random value between -1 and 1
    const z = (Math.random() - 0.5) * 2; // Random value between -1 and 1

    vertices[i * 3] = x;
    vertices[i * 3 + 1] = y;
    vertices[i * 3 + 2] = z;

    particles.push(new Particle(x, y, z));
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  
  const material = new THREE.PointsMaterial({ size: 0.05, color: 0xFFFFFF });
  const points = new THREE.Points(geometry, material);
  
  scene.add(points);
  camera.position.z = 5;
}

const setupParticles = () => {
  // particle array
  particles = [];
  for (let i = 0; i < settings.nParticles; i++) {
    particles[i] = new Particle();
  }
}

function animate() {
  requestAnimationFrame(animate);

  updateParams();

  // Update particle positions
  for (let particle of particles) {
    particle.move();
  }

  // Update the geometry to reflect the new particle positions
  
  renderer.render(scene, camera);
}

/* Particle dynamics */

class Particle {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.stochasticAmplitude;
  }

  move() {
    // what is our chladni value i.e. how much are we vibrating? (between -1 and 1, zeroes are nodes)
    let eq = chladni(this.x, this.y, this.z, a, b, m, n);
  
    // set the amplitude of the move -> proportional to the vibration
    this.stochasticAmplitude = v * abs(eq);
  
    if (this.stochasticAmplitude <= minWalk) this.stochasticAmplitude = minWalk;
  
    // perform one random walk
    this.x += random(-this.stochasticAmplitude, this.stochasticAmplitude);
    this.y += random(-this.stochasticAmplitude, this.stochasticAmplitude);
    this.z += random(-this.stochasticAmplitude, this.stochasticAmplitude);
   
    this.updateOffsets();
  }

  updateOffsets() {
    // handle edges
    if (this.x <= 0) this.x = 0;
    if (this.x >= 1) this.x = 1;
    if (this.y <= 0) this.y = 0;
    if (this.y >= 1) this.y = 1;
    if (this.z <= 0) this.z = 0;
    if (this.z >= 1) this.z = 1;
  
    // convert to screen space
    this.xOff = width * this.x; // (this.x + 1) / 2 * width;
    this.yOff = height * this.y; // (this.y + 1) / 2 * height;
    this.zOff = depth * this.z; // (this.z + 1) / 2 * depth;
  }

  show() {
    // stroke(...this.color);
    let vector = new THREE.Vector3(this.xOff, this.yOff, this.zOff);
    // Add the vector to your scene...
  }
}


const moveParticles = () => {
  let movingParticles = particles.slice(0, N);

  // particle movement
  for(let particle of movingParticles) {
    particle.move();
    particle.show();
  }
}

const updateParams = () => {
  m = sliders.m.value();
  n = sliders.n.value();
  a = sliders.a.value();
  b = sliders.b.value()
  v = sliders.v.value();
  N = sliders.num.value();
}

const wipeScreen = () => {
  background(30);
  stroke(255);
}


function setup() {
  initThreeJS();
  animate();
}

// run each frame
function draw() {
  wipeScreen();
  updateParams();
  moveParticles();
}