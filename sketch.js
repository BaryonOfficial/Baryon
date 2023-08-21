import * as THREE from 'three';
import Essentia from 'essentia.js'; // Ensure you have the correct import path

let song;
let particles = [];
const NUM_PARTICLES = 6144;
const FLOW_RESOLUTION = 5;
let flowfield = [];
let scene, camera, renderer;
let audioContext, audioSource, essentiaExtractor;

function preload() {
    // Using a standard method to load audio
    song = new Audio('media_assets/drake_sxr2.m4a');
}

function setup() {
    // Set up the three.js scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Initialize particles
    for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push(new Particle());
    }

    // Audio Context for Essentia
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioContext.createMediaElementSource(song);
    audioSource.connect(audioContext.destination);
    essentiaExtractor = new Essentia(audioContext, audioSource);

    song.play(); // Start the song

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    render();
}

function render() {
    // Analyze the audio's frequency spectrum using Essentia
    let spectrum = essentiaExtractor.computeSpectrum();
    let dominantFrequency = getDominantFrequency(spectrum);

    // Update flow field and particles
    updateFlowField(dominantFrequency);
    particles.forEach(p => {
        p.update();
        p.display();
    });

    renderer.render(scene, camera);
}

function getDominantFrequency(spectrum) {
    return spectrum.indexOf(Math.max(...spectrum));
}

function updateFlowField(frequency) {
    let depth = floor(window.innerWidth / FLOW_RESOLUTION);
    let rows = floor(window.innerWidth / FLOW_RESOLUTION);
    let cols = floor(window.innerHeight / FLOW_RESOLUTION);
    flowfield = [];

    for (let z = 0; z < depth; z++) {
        flowfield[z] = [];
        for (let x = 0; x < rows; x++) {
            flowfield[z][x] = [];
            for (let y = 0; y < cols; y++) {
                let val = cymaticsFunction(x / rows * 2 - 1, y / cols * 2 - 1, z / depth * 2 - 1, frequency % 10, (frequency + 2) % 10);
                let v = new THREE.Vector3(Math.cos(val * TWO_PI), Math.sin(val * TWO_PI), Math.sin(val * TWO_PI));
                flowfield[z][x][y] = v;
            }
        }
    }
}

// ... [other functions remain largely the same, but with 3D logic]
function cymaticsFunction(x, y, z, n, m) {
    return Math.cos(n * x * Math.PI) * Math.cos(m * y * Math.PI) * Math.sin(m * z * Math.PI) - Math.sin(m * x * Math.PI) * Math.sin(n * y * Math.PI) * Math.cos(n * z * Math.PI);
}

class Particle {
    constructor() {
        this.geometry = new THREE.SphereGeometry(1, 32, 32);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
        this.mesh = new THREE.Mesh(this.geometry, this.material);

        this.pos = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.acc = new THREE.Vector3();

        scene.add(this.mesh);
    }

    applyForce(force) {
        this.acc.add(force);
    }

    update() {
        this.vel.add(this.acc);
        this.vel.clampLength(0, 0.1); // Limiting velocity
        this.pos.add(this.vel);
        this.acc.multiplyScalar(0);

        // Restrict particles to the sphere's surface
        this.pos.normalize().multiplyScalar(SPHERE_RADIUS);
        this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    }

    display() {
        let hue = this.pos.angleTo(new THREE.Vector3(1, 0, 0)) / Math.PI;
        this.material.color.setHSL(hue, 1, 0.5);
    }
}
