// Import Statements
import * as THREE from 'three';
import {
  atan2, chain, derivative, e, evaluate, log, pi, pow, round, sqrt
} from 'mathjs'
import { Noise } from 'noisejs';
import Essentia from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.es.js';

// Initialize Essentia
const essentia = new Essentia(EssentiaWASM);


// Global Variables
let particles, m, n, a, b, v;
let A = 0.02, minWalk = 0.002;
let song;
let amplitude = 0, spectrum = [], audioHandler;

// Settings
const settings = {
  nParticles: 20000,
  canvasSize: [600, 600],
};

// p5.js 
const DOMinit = () => {
  let canvas = createCanvas(...settings.canvasSize);
  canvas.parent('sketch-container');
};

// chladni 2D closed-form solution - returns between -1 and 1
const chladni = (x, y, a, b, m, n) => 
  a * Math.sin(pi*n*x) * Math.sin(pi*m*y) + b * Math.sin(pi*m*x) * Math.sin(pi*n*y);

/* Initialization */
const setupParticles = () => {
  // particle array
  particles = [];
  for (let i = 0; i < settings.nParticles; i++) {
    particles[i] = new Particle();
  }
}

class AudioHandler {
  
  constructor() {
    this.audioContext = new AudioContext({sampleRate: 44100});
    this.fft = new p5.FFT();
    this.mic = new p5.AudioIn();
    this.song = loadSound('media_assets/drake_sxr2.m4a'); // Assuming p5.js
    this.micEnabled = false;
    this.songEnabled = false;
    this.audioSignal = null;
    this.audioBuffer = null;
  }

  toggleMic() {
    this.micEnabled = !this.micEnabled;
    if (this.micEnabled) this.mic.start();
    else this.mic.stop();
  }

  toggleSong() {
    this.songEnabled = !this.songEnabled;
    if (this.songEnabled) this.song.play();
    else this.song.pause();
  }

  async setupAudioWorklet() {
    try {
      await this.audioContext.audioWorklet.addModule('essentia-worklet-processor.js');
      this.essentiaNode = new AudioWorkletNode(this.audioContext, 'essentia-worklet-processor');
      this.essentiaNode.onprocessorerror = (e) => {
      console.log(`Error from processor: ${e.message}`);
      };

      this.essentiaNode.port.onmessage = (e) => {
      const rms = e.data;
      // Use `rms` for visualization
      };

    } catch (e) {
      console.error(`Error setting up audio worklet: ${e.message}`);
    }
  }

  async setupMicrophone() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  this.microphone = this.audioContext.createMediaStreamSource(stream);
  this.microphone.connect(this.essentiaNode);
  this.essentiaNode.connect(this.audioContext.destination);
}

  analyzeWithEssentia(audioSignal) {
    if (audioSignal) {
      let essentiaInput = essentia.arrayToVector(audioSignal);
      let rhythm = essentia.RhythmExtractor2013(essentiaInput);
      let bpm = rhythm.bpm;
      return bpm;
    }   else {
      console.error("Audio signal is not defined.");
      return null;
  }
}

  // Additional methods for FFT, Essentia analysis, etc.
}

/* Particle dynamics */

class Particle {

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

const moveParticles = () => {
  let movingParticles = particles.slice(0, settings.nParticles);

  // particle movement
  for(let particle of movingParticles) {
    particle.move();
    particle.show();
  }
}

const wipeScreen = () => {
  background(30);
  stroke(255);
};

function updateAudioInput() {
  audioHandler.fft.setInput(audioHandler.micEnabled ? audioHandler.mic : audioHandler.song);
}

// Function to update audioSignal based on source
function updateAudioSignal() {
  if (audioHandler.songEnabled) {
    audioSignal = audioHandler.song.getChannelData(0);
  } else if (audioHandler.micEnabled && audioBuffer) {
    audioSignal = audioBuffer.slice();  // Captured from microphone
  }
}
  
function analyzeAudio() {
    let micAmplitude = 0;
    let songAmplitude = 0;
    let micSpectrum = [];
    let songSpectrum = [];
  
    if (audioHandler.micEnabled) {
      micAmplitude = audioHandler.mic.getLevel();
      micSpectrum = audioHandler.fft.analyze();
    }
  
    if (audioHandler.songEnabled) {
      songAmplitude = song.getLevel();
      songSpectrum = audioHandler.fft.analyze();
    }
  
    // Average the amplitude and spectrum if both are enabled
    if (audioHandler.micEnabled && audioHandler.songEnabled){
      amplitude = (micAmplitude + songAmplitude) / 2;
  
      // Assuming both spectra are of the same length
      for (let i = 0; i < micSpectrum.length; i++) {
        spectrum[i] = (micSpectrum[i] + songSpectrum[i]) / 2;
      }
    } else if (audioHandler.micEnabled) {
      amplitude = micAmplitude;
      spectrum = micSpectrum;
    } else if (songEnabled) {
      amplitude = songAmplitude;
      spectrum = songSpectrum;
    }
  
  for (var i = 0; i < 8; i++){
    // Your existing code for calculating frequency ranges and visual elements
    var midrangeEnergy = (pow(2,i)*125)/2;
    var bassEnergy = (pow(2,i-1)*125)/2 + midrangeEnergy/4;
    var trebleEnergy = (midrangeEnergy + midrangeEnergy/2);

    var freqValue = audioHandler.fft.getEnergy(bassEnergy, trebleEnergy - 1); 

    // Your mapping logic here
    m = map(bassEnergy, 0, 1, 1, 16);
    n = map(midrangeEnergy, 0, 1, 1, 16);
    a = map(trebleEnergy, 0, 1, -2, 2);
    b = map(trebleEnergy, 0, 1, -2, 2);

    // Mapping freqValue to vibration strength
    v = map(freqValue, 0, 255, 0.01, 0.1);
  }
}

// run at DOM load
function setup() {
  audioHandler = new AudioHandler();
  audioHandler.setupAudioWorklet();

  DOMinit();
  setupParticles();
}
// audioHandler.toggleMic();  // Or based on some event
// audioHandler.toggleSong(); // Or based on some event

// run each frame
function draw() {
  wipeScreen();
  updateAudioInput();
  updateAudioSignal();
  audioHandler.analyzeWithEssentia(audioSignal);  
  analyzeAudio();
  moveParticles();
}