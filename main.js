import * as THREE from 'three';
import * as essentia from 'essentia.js';
import Perlin from 'perlin.js';
import * as math from 'mathjs';


// Constants
const NUM_PARTICLES = 6144;
const SCALE_FACTOR = 50;
const math = require('mathjs');

// Scene, Camera, Renderer Initialization
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 50;
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Particle Geometry Initialization
const particlesGeometry = new THREE.BufferGeometry();
const particleVertices = new Float32Array(NUM_PARTICLES * 3);
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particleVertices, 3));
const particlesMaterial = new THREE.PointsMaterial({ size: 0.1, vertexColors: true });

const particles = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles);

for (let i = 0; i < NUM_PARTICLES; i++) {
  // Use Perlin noise to get values
  const x = (perlin.noise(i, 0, 0) * 2 - 1) * 10;
  const y = (perlin.noise(0, i, 0) * 2 - 1) * 10;
  const z = (perlin.noise(0, 0, i) * 2 - 1) * 10;

  particleVertices[i * 3] = x;
  particleVertices[i * 3 + 1] = y;
  particleVertices[i * 3 + 2] = z;
}
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particleVertices, 3));


// Create a color attribute for particles
const particleColors = new Float32Array(NUM_PARTICLES * 3);
particlesGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

// Audio Analysis Initialization
const essentiaInstance = new essentia.Essentia();

let audioContext = new AudioContext();
let audioSource = audioContext.createBufferSource();
let audioAnalyser = audioContext.createAnalyser();

// audio initialization
function initializeAudio() {
    fetch('media_assets/drake_sxr2.m4a')
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        audioSource.buffer = audioBuffer;
  
        // Connect audio source to analyser
        audioSource.connect(audioAnalyser);
  
        // Connect analyser to destination
        audioAnalyser.connect(audioContext.destination);
  
        // Play the audio
        audioSource.start();
  
        // Call the main render loop after audio initialization
        animate();
      })
      .catch(error => console.error('An error occurred:', error));
  }
  // Call the function to initialize the audio
  initializeAudio();

// Frequencies for notes in the 4th octave (C4 to B4)
const noteFrequencies = {
    'C': 261.63,
    'C#': 277.18,
    'D': 293.66,
    'D#': 311.13,
    'E': 329.63,
    'F': 349.23,
    'F#': 369.99,
    'G': 392.00,
    'G#': 415.30,
    'A': 440.00,
    'A#': 466.16,
    'B': 493.88,
  };
  
  function mapFrequencyToNote(frequency) {
    let closestNote = 'C';
    let closestFrequencyDifference = Infinity;
  
    for (const [note, noteFrequency] of Object.entries(noteFrequencies)) {
      const difference = Math.abs(frequency - noteFrequency);
      if (difference < closestFrequencyDifference) {
        closestFrequencyDifference = difference;
        closestNote = note;
      }
    }
  
    const octave = Math.floor(frequency / noteFrequencies[closestNote]);
    return `${closestNote}${octave}`;
  }

  const noteColors = {
    'C': [255, 0, 0],
    'C#': [255, 64, 0],
    'D': [255, 128, 0],
    'D#': [255, 255, 0],
    'E': [255, 255, 64],
    'F': [128, 255, 0],
    'F#': [0, 255, 0],
    'G': [0, 255, 128],
    'G#': [0, 128, 255],
    'A': [64, 0, 255],
    'A#': [128, 0, 255],
    'B': [255, 0, 128]
  };
  
  function getLuminosityFactor(octave) {
    if (octave < 2) return 0; // Black for anything below octave 2
    if (octave == 2) return 0.2;
    if (octave == 3) return 0.4;
    if (octave == 4) return 0.6;
    if (octave == 5) return 0.8;
    if (octave == 6) return 1; // Full luminosity for octave 6
    return 0; // Default to black for out-of-range octaves
  }
  
  function mapNoteToColor(noteWithOctave) {
    const note = noteWithOctave.slice(0, -1);
    const octave = parseInt(noteWithOctave.slice(-1));
    const luminosityFactor = getLuminosityFactor(octave);
  
    // Get the base color
    let color = noteColors[note];
  
    // Apply luminosity factor
    color = color.map(channel => channel * luminosityFactor);
  
    return color;
  }  
  
  // Example usage:
  const frequency = 440; // A4
  const note = mapFrequencyToNote(frequency);
  console.log(`The note for frequency ${frequency} is ${note}`);
  

// Main render loop
function animate() {
    requestAnimationFrame(animate);
  
    // Audio Analysis
    // Audio Analysis
    let spectrum = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(spectrum);
    let audioSignal = essentiaInstance.arrayToVector(spectrum); // Corrected variable name
    let pitch = essentiaInstance.PitchYinFFT(audioSignal); // Needs preprocessing of audio signal
    let note = mapFrequencyToNote(pitch.freq); // Assuming pitch.freq is a frequency
    let color = mapNoteToColor(note);

    
  
    // Update particles based on audio analysis
    updateParticles(particleVertices, pitch.freq, color);
  
    renderer.render(scene, camera);
  }
animate();

// Function to update particles
function updateParticles(particleVertices, pitch, color) {
    const colors = particlesGeometry.attributes.color.array; // Accessing the color attribute
    for (let i = 0; i < NUM_PARTICLES; i++) {
      let index = i * 3;
      let x = particleVertices[index];
      let z = particleVertices[index + 2];
      let cymaticsEffect = cymaticsFunction(x, z, pitch % 10, (pitch + 2) % 10);
      particleVertices[index + 1] = cymaticsEffect * SCALE_FACTOR;

    const pitch = getPitch(audioData);
    const volume = getVolume(audioData);
    const l = mapToL(pitch);
    const m = mapToM(volume);
    const theta = mapToTheta(pitch, volume);
    const phi = mapToPhi(pitch, volume);
  
    const harmonicValue = computeSphericalHarmonic(l, m, theta, phi);
  
    particles.forEach((particle) => {
      particle.position.x = harmonicValue.re; // Real part for x
      particle.position.y = harmonicValue.im; // Imaginary part for y
      // Modify other properties as needed
    });
  
    render();
  
      // Update color based on the note
      colors[index] = color[0] / 255; // Red component
      colors[index + 1] = color[1] / 255; // Green component
      colors[index + 2] = color[2] / 255; // Blue component
    }
    particlesGeometry.attributes.position.needsUpdate = true; // Notify three.js that vertices have changed
    particlesGeometry.attributes.color.needsUpdate = true; // Notify three.js that colors have changed


  }
  
  function updateParticles(audioData) {
    
  }
  
  
// Cymatics function
function cymaticsFunction(x, z, n, m) {
  return Math.cos(n * x * Math.PI) * Math.cos(m * z * Math.PI) - Math.cos(m * x * Math.PI) * Math.cos(n * z * Math.PI);
}

function computeSphericalHarmonic(l, m, theta, phi) {
    const factor1 = Math.sqrt((2 * l + 1) / (4 * Math.PI) * (math.factorial(l - m) / math.factorial(l + m)));
    const factor2 = math.legendreP(l, m, Math.cos(theta));
    const factor3 = math.exp(math.complex(0, m * phi));
    return factor1 * factor2 * factor3;
  }
  
  
  function mapToL(pitch) {
    return pitch / 100;
  }
  
  function mapToM(volume) {
    return volume / 100;
  }
  
  function mapToTheta(pitch, volume) {
    return Math.PI * (pitch / volume);
  }
  
  function mapToPhi(pitch, volume) {
    return 2 * Math.PI * (volume / pitch);
  }
  