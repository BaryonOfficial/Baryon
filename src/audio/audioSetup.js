import * as THREE from 'three';

/*
 * AUDIO PROCESSING
 */

export const audioObject = {
  fftSize: 4096,
  audioReader: null,
  gain: null,
  essentiaNode: null,
  soundGainNode: null,
  audioCtx: null,
  sound: null,
  capacity: 5,
  analyser: null,
};

export function audioSetup(camera) {
  // create an AudioListener and add it to the camera
  const listener = new THREE.AudioListener();
  camera.add(listener);

  // create an Audio source
  audioObject.sound = new THREE.Audio(listener);
  audioObject.sound.started = false;
  console.log('Sound:', audioObject.sound);

  audioObject.gain = audioObject.sound.gain;

  // Get references to the audio controls
  const audioInput = document.getElementById('audioInput');
  const fileName = document.getElementById('fileName');
  const audioUrl = document.getElementById('audioUrl');
  const playButton = document.getElementById('playButton');
  const stopButton = document.getElementById('stopButton');
  let isAudioLoaded = false;
  const audioLoader = new THREE.AudioLoader();
  audioObject.audioCtx = audioObject.sound.context;
  console.log('audioCtx', audioObject.audioCtx);

  function loadAudio(url) {
    // Stop the current audio if it is playing and reset its buffer
    if (audioObject.sound.started === true) {
      audioObject.sound.stop();
      audioObject.sound.setBuffer(null);
      playButton.textContent = 'Play';
      audioObject.sound.started = false;
      console.log('Audio stopped on change');
    } else if (!audioObject.sound.started && playButton.textContent !== 'Play') {
      audioObject.sound.setBuffer(null);
      playButton.textContent = 'Play';
      console.log('Audio ended & reset w/ new file or URL');
    }

    isAudioLoaded = false;
    audioLoader.load(url, function (buffer) {
      audioObject.sound.setBuffer(buffer);
      audioObject.sound.setLoop(false);
      audioObject.sound.setVolume(0.5);
      isAudioLoaded = true;
    });
  }

  audioInput.addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
      const file = event.target.files[0];
      fileName.textContent = file.name;
      const fileURL = URL.createObjectURL(file);
      loadAudio(fileURL);
    } else {
      fileName.textContent = 'Choose File';
    }
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  });

  audioUrl.addEventListener('change', (event) => {
    const url = event.target.value;
    loadAudio(url);
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  });

  // ***** Analysis ***** //

  // create an AudioAnalyser, passing in the sound and desired fftSize
  audioObject.analyser = new THREE.AudioAnalyser(audioObject.sound, audioObject.fftSize);

  //***** Audio Playback *****//

  // Play audio when play button is clicked
  playButton.addEventListener('click', () => {
    if (audioObject.sound.isPlaying) {
      audioObject.sound.pause();
      playButton.textContent = 'Play';
      audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
    } else if (!audioObject.sound.isPlaying && isAudioLoaded) {
      if (audioObject.audioCtx.state === 'suspended') {
        audioObject.audioCtx
          .resume()
          .then(() => {
            audioObject.sound.play();
            audioObject.sound.started = true;
            playButton.textContent = 'Pause';
            audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
          })
          .catch((error) => {
            console.error('Failed to resume audio context:', error);
          });
      } else {
        audioObject.sound.play();
        audioObject.sound.started = true;
        playButton.textContent = 'Pause';
        audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
      }
    }
  });

  // Stop audio when stop button is clicked
  stopButton.addEventListener('click', () => {
    audioObject.sound.stop();
    audioObject.sound.started = false;
    playButton.textContent = 'Play';
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  });

  audioObject.sound.onEnded = function () {
    audioObject.sound.stop();
    console.log('Audio ended');
    audioObject.sound.started = false;
    playButton.textContent = 'Replay'; // Update the play button text
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  };
}

function logNodeConnections() {
  console.log(
    'SoundGainNode -> Essentia Node:',
    audioObject.soundGainNode.connect(audioObject.essentiaNode)
  );
  console.log('Essentia Node -> Gain Node:', audioObject.essentiaNode.connect(audioObject.gain));
  console.log(
    'Gain Node -> Destination:',
    audioObject.gain.connect(audioObject.audioCtx.destination)
  );
}

export function setupAudioGraph() {
  console.log('1');
  if (!window.SharedArrayBuffer) {
    console.error('SharedArrayBuffer is not supported in this browser.');
    alert('SharedArrayBuffer is not supported in this browser. Please use a compatible browser.');
    return;
  }
  console.log('2');
  let sab = exports.RingBuffer.getStorageForCapacity(audioObject.capacity, Float32Array); // capacity: three float32 values [pitch, confidence, rms]
  let rb = new exports.RingBuffer(sab, Float32Array);
  audioObject.audioReader = new exports.AudioReader(rb);

  audioObject.essentiaNode = new AudioWorkletNode(audioObject.audioCtx, 'audio-data-processor', {
    processorOptions: {
      bufferSize: audioObject.fftSize,
      sampleRate: audioObject.audioCtx.sampleRate,
      capacity: audioObject.capacity,
    },
  });
  console.log('3');
  // Add the onmessageerror event listener
  audioObject.essentiaNode.port.onmessageerror = (event) => {
    console.error('AudioWorkletNode message error:', event);
  };

  try {
    audioObject.essentiaNode.port.postMessage({
      sab: sab,
      isPlaying: audioObject.sound.isPlaying,
    });
  } catch (_) {
    alert('No SharedArrayBuffer tranfer support, try another browser.');
    // $("#recordButton").off('click', onRecordClickHandler);
    // $("#recordButton").prop("disabled", true);
    return;
  }

  audioObject.soundGainNode = audioObject.sound.getOutput();
  audioObject.soundGainNode.connect(audioObject.essentiaNode);
  audioObject.essentiaNode.connect(audioObject.gain);
  audioObject.gain.connect(audioObject.audioCtx.destination);

  logNodeConnections();
}

function audioAnalysis() {
  let avgAmplitude = 0;
  let freqData = 0;

  if (audioObject.sound.isPlaying) {
    avgAmplitude = audioObject.analyser.getAverageFrequency();
    freqData = audioObject.analyser.getFrequencyData();
  } else if (audioObject.sound.started === false) {
    avgAmplitude = 0;
    freqData = 0;
  }

  return { avgAmplitude, freqData };
}

export function processAudioData(gpgpu, particles, essentiaData) {
  if (audioObject.audioReader.available_read() >= 1) {
    let read = audioObject.audioReader.dequeue(essentiaData);
    if (read !== 0) {
      gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
      // console.log(
      //   'Essentia Data:',
      //   gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data
      // );
    }
  }

  if (audioObject.sound.isPlaying) {
    const { avgAmplitude, freqData } = audioAnalysis();
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    particles.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  } else if (!audioObject.sound.isPlaying && !audioObject.sound.started) {
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = 0;
    particles.material.uniforms.uAverageAmplitude.value = 0;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(0);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  }
}
