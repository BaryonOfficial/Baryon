import * as THREE from 'three';
import {
    atan2, chain, derivative, e, evaluate, log, pi, pow, round, sqrt
  } from 'mathjs'

// Three.js variables
let scene, camera, renderer;

export const initThreeJS = () => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer();
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // Add a cube for testing
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
  
  camera.position.z = 5;
  
  // Rendering loop
  const animate = function () {
    requestAnimationFrame(animate);
    
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    
    renderer.render(scene, camera);
  };
  
  animate();
};


// chladni 2D closed-form solution - returns between -1 and 1
const chladni = (x, y, a, b, m, n) => 
a * Math.sin(pi*n*x) * Math.sin(pi*m*y) + b * Math.sin(pi*m*x) * Math.sin(pi*n*y);

export class Particle {

    constructor() {
      this.x = random(0,1);
      this.y = random(0,1);
      this.stochasticAmplitude;
  
      // this.color = [random(100,255), random(100,255), random(100,255)];
      
      this.updateOffsets();
    }
  
    move() {
      // what is our chladni value i.e. how much are we vibrating? (between -1 and 1, zeroes are nodes)
      let eq = chladni(this.x, this.y, a, b, m, n);
  
      // set the amplitude of the move -> proportional to the vibration
      this.stochasticAmplitude = v * abs(eq);
  
      if (this.stochasticAmplitude <= minWalk) this.stochasticAmplitude = minWalk;
  
      // perform one random walk
      this.x += random(-this.stochasticAmplitude, this.stochasticAmplitude);
      this.y += random(-this.stochasticAmplitude, this.stochasticAmplitude);
   
      this.updateOffsets();
    }
  
    updateOffsets() {
      // handle edges
      if (this.x <= 0) this.x = 0;
      if (this.x >= 1) this.x = 1;
      if (this.y <= 0) this.y = 0;
      if (this.y >= 1) this.y = 1;
  
      // convert to screen space
      this.xOff = width * this.x; // (this.x + 1) / 2 * width;
      this.yOff = height * this.y; // (this.y + 1) / 2 * height;
    }
  
    show() {
      // stroke(...this.color);
      point(this.xOff, this.yOff)
    }
  }

export const setupParticles = () => {
    // particle array
    particles = [];
    for (let i = 0; i < settings.nParticles; i++) {
      particles[i] = new Particle();
    }
  }

export const moveParticles = () => {
    let movingParticles = particles.slice(0, settings.nParticles);
  
    // particle movement
    for(let particle of movingParticles) {
      particle.move();
      particle.show();
    }
  }

export const wipeScreen = () => {
    background(30);
    stroke(255);
  };