// Import Statements
import { Noise } from 'noisejs';
import {setupParticles, moveParticles, wipeScreen, initThreeJS} from './ThreeAndVisual.js';
import { AudioHandler } from './AudioHandlerModule.js';

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
  audioHandler.loadSong('media_assets/drake_sxr2.m4a');

  DOMinit();
  setupParticles();
  initThreeJS();

  document.getElementById("toggleMicBtn").addEventListener("click", () => {
    audioHandler.toggleMic();
  });

  document.getElementById("startButton").addEventListener("click", () => {
    audioHandler.toggleSong();
  });
}

// run each frame
function draw() {
  wipeScreen();
  updateAudioInput();
  updateAudioSignal();
  audioHandler.analyzeWithEssentia(audioSignal);  
  analyzeAudio();
  moveParticles();
}
