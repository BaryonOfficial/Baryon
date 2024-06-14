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
  micSound: null,
  capacity: 5,
  analyser: null,
  micAnalyser: null,
  micNode: null,
  gumStream: null,
  listener: null,
};

function startMicRecordStream() {
  if (navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        audioObject.gumStream = stream;

        // Create a THREE.Audio object for the microphone
        audioObject.micSound = new THREE.Audio(audioObject.listener);
        audioObject.micNode = audioObject.audioCtx.createMediaStreamSource(audioObject.gumStream);
        audioObject.micSound.setNodeSource(audioObject.micNode);

        // Because of how the THREE.Audio object works with the setNodeSource method,
        // we need to detach the mic sound from whatever it connects to for manual
        // connections. We need this source defined first though.
        audioObject.micSound.getOutput().disconnect();

        console.log('Microphone Sound:', audioObject.micSound);

        audioObject.micAnalyser = new THREE.AudioAnalyser(
          audioObject.micSound,
          audioObject.fftSize
        );

        // Create a zero gain node to mute the mic from speaker output/ feedback
        const zeroGainNode = audioObject.audioCtx.createGain();
        zeroGainNode.gain.setValueAtTime(0, audioObject.audioCtx.currentTime);

        // Now we can actually connect it properly in the pipeline
        audioObject.micSound
          .getOutput()
          .connect(audioObject.essentiaNode)
          .connect(zeroGainNode)
          .connect(audioObject.audioCtx.destination);

        console.log('Microphone connected');

        // Post message after micNode is initialized
        audioObject.essentiaNode.port.postMessage({
          isPlaying: audioObject.sound.isPlaying,
          micActive: audioObject.gumStream && audioObject.gumStream.active,
        });

        setInterval(checkMicInputLevels, 1000); // Check every second
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err);
      });
  } else {
    console.error('getUserMedia not supported');
  }
}

function stopMicRecordStream() {
  if (audioObject.gumStream) {
    audioObject.gumStream.getAudioTracks().forEach((track) => {
      track.stop();
    });
    audioObject.micNode.disconnect();
    audioObject.micAnalyser = null;
    audioObject.gumStream = null;
    audioObject.micSound = null;
    console.log('Microphone disconnected');
  }

  // Post message after micNode is disconnected
  audioObject.essentiaNode.port.postMessage({
    isPlaying: audioObject.sound.isPlaying,
    micActive: audioObject.gumStream && audioObject.gumStream.active,
  });
}

function checkMicInputLevels() {
  if (audioObject.micAnalyser) {
    const data = audioObject.micAnalyser.getFrequencyData();
    const isMicWorking = data.some((value) => value > 0);

    if (isMicWorking) {
      console.log('Microphone is working');
    } else {
      console.log('Microphone is not picking up any sound');
    }
  } else {
    console.log('Microphone analyser is not initialized');
  }
}

let isAudioLoaded = false;

function loadAudio(url, audioLoader, playPauseButton) {
  // Stop the current audio if it is playing and reset its buffer
  if (audioObject.sound.started === true) {
    audioObject.sound.stop();
    audioObject.sound.setBuffer(null);
    playPauseButton.textContent = 'Play';
    audioObject.sound.started = false;
    console.log('Audio stopped on change');
  } else if (!audioObject.sound.started && playPauseButton.textContent !== 'Play') {
    audioObject.sound.setBuffer(null);
    playPauseButton.textContent = 'Play';
    console.log('Audio ended & reset w/ new file or URL');
  }

  isAudioLoaded = false;
  audioLoader.load(
    url,
    function (buffer) {
      audioObject.sound.setBuffer(buffer);
      audioObject.sound.setLoop(false);
      audioObject.sound.setVolume(0.5);
      isAudioLoaded = true;
    },
    undefined,
    (err) => {
      console.error('Error loading audio file:', err);
    }
  );
}

function setupUIInteractions(audioLoader) {
  const audioInput = document.getElementById('audioInput');
  const fileName = document.getElementById('fileName');
  const playPauseButton = document.getElementById('playPauseButton');
  const stopButton = document.getElementById('stopButton');
  const micButton = document.getElementById('micMode');

  audioInput.addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
      const file = event.target.files[0];
      fileName.textContent = file.name;
      const fileURL = URL.createObjectURL(file);
      loadAudio(fileURL, audioLoader, playPauseButton);
    } else {
      fileName.textContent = 'Choose File';
    }
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  });

  micButton.addEventListener('click', () => {
    if (!audioObject.gumStream || !audioObject.gumStream.active) {
      startMicRecordStream();
      micButton.textContent = 'Stop Mic';
    } else {
      stopMicRecordStream();
      micButton.textContent = 'Mic';
    }
  });

  playPauseButton.addEventListener('click', () => {
    if (audioObject.sound.isPlaying) {
      audioObject.sound.pause();
      playPauseButton.textContent = 'Play';
    } else if (!audioObject.sound.isPlaying && isAudioLoaded) {
      if (audioObject.audioCtx.state === 'suspended') {
        audioObject.audioCtx
          .resume()
          .then(() => {
            audioObject.sound.play();
            audioObject.sound.started = true;
            playPauseButton.textContent = 'Pause';
          })
          .catch((error) => {
            console.error('Failed to resume audio context:', error);
          });
      } else {
        audioObject.sound.play();
        audioObject.sound.started = true;
        playPauseButton.textContent = 'Pause';
      }
    }
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  });

  stopButton.addEventListener('click', () => {
    audioObject.sound.stop();
    audioObject.sound.started = false;
    playPauseButton.textContent = 'Play';
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  });

  audioObject.sound.onEnded = function () {
    audioObject.sound.stop();
    console.log('Audio ended');
    audioObject.sound.started = false;
    playPauseButton.textContent = 'Replay';
    audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
  };
}

export function audioSetup(camera) {
  // create an AudioListener and add it to the camera
  audioObject.listener = new THREE.AudioListener();
  camera.add(audioObject.listener);

  // create an Audio source
  audioObject.sound = new THREE.Audio(audioObject.listener);
  audioObject.sound.started = false;
  console.log('Sound:', audioObject.sound);

  audioObject.audioCtx = audioObject.listener.context;
  console.log('audioCtx', audioObject.audioCtx);

  const audioLoader = new THREE.AudioLoader();

  // Setup UI interactions
  setupUIInteractions(audioLoader);

  // create an AudioAnalyser, passing in the sound and desired fftSize
  audioObject.analyser = new THREE.AudioAnalyser(audioObject.sound, audioObject.fftSize);
}

function audioAnalysis() {
  let avgAmplitude = 0;
  let freqData = [];

  let inputFileAmplitude = 0;
  let micAmplitude = 0;
  let inputFileFreqData = [];
  let micFreqData = [];

  const soundIsActive = audioObject.sound.isPlaying;
  const micIsActive = audioObject.gumStream && audioObject.gumStream.active;

  if (soundIsActive) {
    inputFileAmplitude = audioObject.analyser.getAverageFrequency();
    inputFileFreqData = audioObject.analyser.getFrequencyData();
  }

  if (micIsActive) {
    micAmplitude = audioObject.micAnalyser.getAverageFrequency();
    micFreqData = audioObject.micAnalyser.getFrequencyData();
  }

  if (soundIsActive && micIsActive) {
    // Combine amplitudes more realistically based on energy
    avgAmplitude = Math.sqrt(inputFileAmplitude * inputFileAmplitude + micAmplitude * micAmplitude);

    // Combine frequency data considering phase and magnitude
    freqData = combineFrequencyData(inputFileFreqData, micFreqData);
  } else if (soundIsActive) {
    avgAmplitude = inputFileAmplitude;
    freqData = Array.from(inputFileFreqData); // Clone to prevent mutability issues
  } else if (micIsActive) {
    avgAmplitude = micAmplitude;
    freqData = Array.from(micFreqData); // Clone to prevent mutability issues
  }

  // console.log('Input File Data - Amplitude:', inputFileAmplitude);
  // console.log('Input File Data - Frequency Data:', inputFileFreqData);
  // console.log('Mic Data - Amplitude:', micAmplitude);
  // console.log('Mic Data - Frequency Data:', micFreqData);
  // console.log('Final Avg Amplitude:', avgAmplitude);
  // console.log('Final Frequency Data:', freqData);

  return { avgAmplitude, freqData };
}

function combineFrequencyData(freqData1, freqData2) {
  // Placeholder for a more complex frequency data combining logic
  return freqData1.map((value, index) =>
    Math.sqrt(value * value + freqData2[index] * freqData2[index])
  );
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

  const soundIsActive = audioObject.sound.isPlaying;
  const micIsActive = audioObject.gumStream && audioObject.gumStream.active;

  if (soundIsActive || micIsActive) {
    const { avgAmplitude, freqData } = audioAnalysis();
    gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    particles.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  } else if (!soundIsActive && !micIsActive && !audioObject.sound.started) {
    gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = 0;
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = 0;
    particles.material.uniforms.uAverageAmplitude.value = 0;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(0);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  }
}

async function URLFromFiles(files) {
  const promises = files.map(async (file) => {
    const response = await fetch(file);
    return response.text();
  });

  const texts = await Promise.all(promises);
  texts.unshift('var exports = {};'); // hack to make injected umd modules work
  const text = texts.join('');
  const blob = new Blob([text], { type: 'application/javascript' });

  return URL.createObjectURL(blob);
}

async function loadAudioWorklet() {
  const workletProcessorCode = [
    'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js',
    'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.umd.js',
    './src/audio/audio-data-processor.js',
    'https://unpkg.com/ringbuf.js@0.1.0/dist/index.js',
  ];

  return URLFromFiles(workletProcessorCode)
    .then((concatenatedCode) => {
      return audioObject.audioCtx.audioWorklet.addModule(concatenatedCode);
    })
    .catch((msg) => {
      console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
      throw new Error(msg);
    });
}

export function setupAudioGraph() {
  if (!window.SharedArrayBuffer) {
    console.error('SharedArrayBuffer is not supported in this browser.');
    alert('SharedArrayBuffer is not supported in this browser. Please use a compatible browser.');
    return;
  }
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
  // Add the onmessageerror event listener
  audioObject.essentiaNode.port.onmessageerror = (event) => {
    console.error('AudioWorkletNode message error:', event);
  };

  try {
    audioObject.essentiaNode.port.postMessage({
      sab: sab,
      isPlaying: audioObject.sound.isPlaying,
      micActive: audioObject.gumStream && audioObject.gumStream.active,
    });
  } catch (_) {
    alert('No SharedArrayBuffer tranfer support, try another browser.');
    // $("#recordButton").off('click', onRecordClickHandler);
    // $("#recordButton").prop("disabled", true);
    return;
  }

  //Input File Sound Path
  audioObject.sound.getOutput().connect(audioObject.essentiaNode);
  console.log('inputFile Sound Gain Node --> Essentia Node');

  // This will be used for overall volume
  audioObject.gain = audioObject.audioCtx.createGain();

  // Connection to destination
  audioObject.essentiaNode.connect(audioObject.gain);
  console.log('Essentia Node --> Gain');

  audioObject.gain.connect(audioObject.audioCtx.destination);
  console.log('Gain --> Destination');
}

export function startAudioProcessing(callback) {
  loadAudioWorklet()
    .then(() => {
      setupAudioGraph();
      if (callback) callback();
    })
    .catch((msg) => {
      console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
    });
}
