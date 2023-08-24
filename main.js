import * as THREE from 'three';
import * as math from 'mathjs';
import { Noise } from 'noisejs';

import Essentia from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js';
// import essentia-wasm-module
import { EssentiaWASM } from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.es.js';

const essentia = new Essentia(EssentiaWASM);

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

async function URLFromFiles(urls) {
    // Fetch the content from each URL and store it in the 'contents' array
    const contents = await Promise.all(
      urls.map(url => fetch(url).then(response => response.text()))
    );
  
    // Concatenate the contents into a single string
    const concatenatedCode = contents.join('\n');
  
    // Create a blob from the concatenated code
    const blob = new Blob([concatenatedCode], { type: 'application/javascript' });
  
    // Create a URL for the blob
    return URL.createObjectURL(blob);
  }
  

// main.js
const workletProcessorCode = ["https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js", "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js", "essentia-worklet-processor.js"];

export async function createEssentiaNode (audioCtx) {
  try {
    let concatenatedCode = await URLFromFiles(workletProcessorCode)
    await audioCtx.audioWorklet.addModule(concatenatedCode); // add our custom code to the worklet scope
  } catch(e) {
    console.log(e);
  }
  return new AudioWorkletNode(audioCtx, 'essentia-worklet-processor');
}

createEssentiaNode(audioCtx).then(audioWorkletNode => {
    startMicRecordStream(audioWorkletNode, enableButton);
    playAudioFile(audioWorkletNode, 'media_assets/drake_sxr2.m4a');
});

function startMicRecordStream(audioWorkletNode, btnCallback) {
    if (audioCtx.state === "suspended") audioCtx.resume(); 
    if (navigator.mediaDevices.getUserMedia) {
        console.log("Initializing audio...");
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then((stream) => {
                gumStream = stream;
                if (gumStream.active) {
                    mic = audioCtx.createMediaStreamSource(stream);
                    
                    mic.connect(audioWorkletNode);
                    audioWorkletNode.connect(audioCtx.destination);

                    btnCallback(); // restore button state
                } else {
                    throw "Mic stream not active";
                }
            }
        ).catch((message) => {
            throw "Could not access microphone - " + message;
        });

    } else {
    throw "Could not access microphone - getUserMedia not available";
    }
}

function playAudioFile(audioWorkletNode, audioFileUrl) {
    fetch(audioFileUrl)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
        .then(audioBuffer => {
            let audioSource = audioCtx.createBufferSource();
            audioSource.buffer = audioBuffer;
            
            audioSource.connect(audioWorkletNode);
            audioWorkletNode.connect(audioCtx.destination);
            
            audioSource.start();
        });
}

// prints version of essentia wasm backend
console.log(essentia.version)

// prints all the available algorithm methods in Essentia
console.log(essentia.algorithmNames)

// Scene, Camera, Renderer Initialization
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);


// Other constants
const NUM_PARTICLES = 1000;
const SCALE_FACTOR = 50;
const noise = new Noise(Math.random());

const startButton = document.getElementById('startButton');
startButton.addEventListener('click', initializeAudio);

// Particle Geometry Initialization
const particlesGeometry = new THREE.BufferGeometry();
const particleVertices = new Float32Array(NUM_PARTICLES * 3);
const particlesMaterial = new THREE.PointsMaterial({ size: 0.1, vertexColors: true });
const particleColors = new Float32Array(NUM_PARTICLES * 3);

const particles = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles);


for (let i = 0; i < NUM_PARTICLES; i++) {
  // Use Perlin noise to get values
  const x = (noise.perlin3(i, 0, 0) * 2 - 1) * 10; // Check usage based on the library
  const y = (noise.perlin3(0, i, 0) * 2 - 1) * 10;
  const z = (noise.perlin3(0, 0, i) * 2 - 1) * 10;

  particleVertices[i * 3] = x;
  particleVertices[i * 3 + 1] = y;
  particleVertices[i * 3 + 2] = z;

  particleColors[i * 3] = 1.0;
  particleColors[i * 3 + 1] = 1.0;
  particleColors[i * 3 + 2] = 1.0;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particleVertices, 3));
particlesGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

let particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particleSystem);

let audioContext = new AudioContext();

if (audioContext.state === 'suspended') {
  audioContext.resume();
}

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
    const noteRegex = /^[A-G]#?/;
    const note = noteWithOctave.match(noteRegex)[0];
    const octave = parseInt(noteWithOctave.slice(note.length));
    const luminosityFactor = getLuminosityFactor(octave);
  
    // Get the base color
    let color = noteColors[note];
    
    if (!color) {
      console.error('Color not found for note:', note);
      return [0, 0, 0]; // Default color if note is not found
    }
  
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
    let spectrum = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(spectrum);
    let audioSignal = essentia.arrayToVector(spectrum);
    console.log("Audio signal:", audioSignal);

    let windowedSignal = essentia.Windowing(audioSignal, true, 0); // Changed "hann" to 0
    let pitch = essentia.PitchYinFFT(windowedSignal);

    console.log("Pitch object:", pitch);

    
    let note = mapFrequencyToNote(pitch.freq); // Assuming pitch.freq is a frequency
    let color = mapNoteToColor(note);
    const volume = essentia.Energy(audioSignal);

    let audioSignalValues = [];
    for (let i = 0; i < audioSignal.size(); i++) {
    audioSignalValues.push(audioSignal.get(i));
    }
    console.log("Audio signal values:", audioSignalValues);
  
    const l = mapToL(pitch);
    const m = mapToM(volume);
    const theta = mapToTheta(pitch, volume);
    const phi = mapToPhi(pitch, volume);
    const harmonicValue = computeSphericalHarmonic(l, m, theta, phi);
    
    // Update particles based on audio analysis
    updateParticles(particleVertices, pitch.freq, color);
  
    renderer.render(scene, camera);
  }
animate();

// Function to update particles
function updateParticles(particleVertices, pitch, color) {
  if (typeof pitch === 'undefined') {
    console.log('Pitch object is undefined');
    return;
  }

  // If pitch.freq is undefined, log a message and return
  if (typeof pitch.freq === 'undefined') {
    console.log('Pitch.freq is undefined', pitch);
    return;
  }

  console.log("Pitch object:", pitch);
  
    const colors = particlesGeometry.attributes.color.array; // Accessing the color attribute
    for (let i = 0; i < NUM_PARTICLES; i++) {
      let index = i * 3;
      let x = particleVertices[index];
      let z = particleVertices[index + 2];
      console.log("Debugging Values:", x, z, pitch.freq, n, m);
      let cymaticsEffect = cymaticsFunction(x, z, pitch.freq % 10, (pitch.freq + 2) % 10);
      
      // Check if cymaticsEffect is NaN
      if (isNaN(cymaticsEffect)) {
      console.error("NaN detected in cymaticsEffect:", x, z, pitch);
      continue; // Skip to the next iteration
    }
      particleVertices[index + 1] = cymaticsEffect * SCALE_FACTOR;
  
      // Update color based on the note
      colors[index] = color[0] / 255; // Red component
      colors[index + 1] = color[1] / 255; // Green component
      colors[index + 2] = color[2] / 255; // Blue component
    }
    particlesGeometry.attributes.position.needsUpdate = true; // Notify three.js that vertices have changed
    particlesGeometry.attributes.color.needsUpdate = true; // Notify three.js that colors have changed

  }
  
// Cymatics function
function cymaticsFunction(x, z, n, m) {
  return Math.cos(n * x * Math.PI) * Math.cos(m * z * Math.PI) - Math.cos(m * x * Math.PI) * Math.cos(n * z * Math.PI);
}

function legendreP(l, m, x) {
  if (m < 0) return 0;
  if (m === 0 && l === 0) return 1;
  if (l < m) return 0;
  let p0 = 1;
  let p1 = x;
  for (let i = 2; i <= l; i++) {
    let p2 = ((2 * i - 1) * x * p1 - (i + m - 1) * p0) / (i - m);
    p0 = p1;
    p1 = p2;
  }
  let fact = 1;
  for (let i = 1; i <= m; i++) {
    fact *= -fact * (2 * i - 1);
  }
  return fact * p1;
}


function computeSphericalHarmonic(l, m, theta, phi) {
  const factor1 = Math.sqrt((2 * l + 1) / (4 * Math.PI) * (math.factorial(l - m) / math.factorial(l + m)));
  const factor2 = legendreP(l, m, Math.cos(theta)); // Changed to custom legendreP
  const factor3 = math.exp(math.complex(0, m * phi));

  // Take the real part of the result to avoid complex numbers
  return factor1 * factor2 * math.re(factor3);
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
  