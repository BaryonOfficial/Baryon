import * as THREE from 'three';

/*
 * AUDIO PROCESSING
 */

export const audioObject = {
  fftSize: 4096,
  fftData: new Float32Array(4096 / 2), // FFT data is half the size
  averageAmplitude: 0,
  sampleRate: 44100,
  isPlaying: false,
  isInputConnected: false,
  listener: null,
  sound: {
    isPlaying: false,
    started: false,
    context: { currentTime: 0 },
    listener: { timeDelta: 0 },
  },
  gumStream: null,
};

// Set up callback to receive data from JUCE
window.audioDataCallback = function (data) {
  if (data) {
    if (data.fftData) {
      audioObject.fftData = new Float32Array(data.fftData);
    }
    if (typeof data.averageAmplitude === 'number') {
      audioObject.averageAmplitude = data.averageAmplitude;
    }
    if (typeof data.sampleRate === 'number') {
      audioObject.sampleRate = data.sampleRate;
    }
    if (typeof data.isPlaying === 'boolean') {
      audioObject.isPlaying = data.isPlaying;
      audioObject.sound.isPlaying = data.isPlaying;
      audioObject.sound.started = data.isPlaying;
    }
    if (typeof data.isInputConnected === 'boolean') {
      audioObject.isInputConnected = data.isInputConnected;
    }
  }
};

export function audioSetup(camera) {
  // Only create the listener for Three.js scene
  audioObject.listener = new THREE.AudioListener();
  camera.add(audioObject.listener);
}

// Function to get current audio analysis data
export function getAudioData() {
  return {
    fftData: audioObject.fftData,
    averageAmplitude: audioObject.averageAmplitude,
    sampleRate: audioObject.sampleRate,
    isPlaying: audioObject.isPlaying,
    isInputConnected: audioObject.isInputConnected,
  };
}

// Add back the functions ThreeScene expects, but adapted for JUCE
export function getIsAudioLoaded() {
  return audioObject.isInputConnected;
}

export function loadAudio() {
  // In JUCE version, audio is loaded by the DAW
  console.log('Audio loading handled by DAW');
  return Promise.resolve();
}

export function playPauseAudio() {
  // In JUCE version, playback is controlled by DAW
  console.log('Playback controlled by DAW');
  return Promise.resolve(audioObject.isPlaying);
}

export function stopAudio() {
  // In JUCE version, stopping is controlled by DAW
  console.log('Playback controlled by DAW');
}

export function startMicRecordStream() {
  // In JUCE version, input is controlled by DAW
  console.log('Audio input controlled by DAW');
  return Promise.resolve();
}

export function stopMicRecordStream() {
  // In JUCE version, input is controlled by DAW
  console.log('Audio input controlled by DAW');
}

export function setAudioEndedCallback(callback) {
  // In JUCE version, we might want to call this when the DAW stops
  if (callback) {
    const oldCallback = window.audioDataCallback;
    window.audioDataCallback = function (data) {
      oldCallback(data);
      if (data && data.isPlaying === false && audioObject.isPlaying === true) {
        callback();
      }
      audioObject.isPlaying = data.isPlaying;
    };
  }
}

// Add GPGPU update function
export function processAudioData(gpgpu, particles) {
  if (!gpgpu?.particlesVariable || !particles) {
    return;
  }

  try {
    // Update GPU uniforms with current audio data
    if (gpgpu.zeroPointsVariable?.material?.uniforms) {
      gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value =
        audioObject.averageAmplitude;
    }

    if (gpgpu.particlesVariable?.material?.uniforms) {
      gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value =
        audioObject.averageAmplitude;
      gpgpu.particlesVariable.material.uniforms.uStarted.value = audioObject.isPlaying;
    }

    if (particles.material?.uniforms) {
      particles.material.uniforms.uAverageAmplitude.value = audioObject.averageAmplitude;
      particles.material.uniforms.uSoundPlaying.value = audioObject.isPlaying;
    }

    // Update FFT data texture if it exists
    if (gpgpu.audioDataVariable?.material?.uniforms?.tDataArray?.value) {
      const texture = gpgpu.audioDataVariable.material.uniforms.tDataArray.value;

      // Create a new Float32Array with the current FFT data
      const newData = new Float32Array(audioObject.fftData);

      // Update the texture data
      texture.image.data = newData;
      texture.needsUpdate = true;
    }
  } catch (error) {
    console.warn('Error processing audio data:', error);
  }
}

// Simple callback handler for animation
export function startAudioProcessing(callback) {
  if (callback) {
    callback();
  }
}
