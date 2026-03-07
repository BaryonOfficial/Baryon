import * as THREE from 'three';

/*
 * AUDIO PROCESSING
 */

/**
 * Creates an isolated audio context instance.
 * All audio state is local to this instance — no module-level singletons.
 *
 * @returns {object} Audio context instance with methods for setup, playback, and per-frame processing
 */
export function createAudioContext() {
  const state = {
    fftSize: 4096,
    audioReader: null,
    gain: null,
    essentiaNode: null,
    audioCtx: null,
    sound: null,
    micSound: null,
    capacity: 5,
    analyser: null,
    micAnalyser: null,
    micNode: null,
    gumStream: null,
    listener: null,
    audioLoader: new THREE.AudioLoader(),
  };

  let isAudioLoaded = false;
  let isAudioWorkletLoaded = false;

  function getIsAudioLoaded() {
    return isAudioLoaded;
  }

  function loadAudio(url) {
    return new Promise((resolve, reject) => {
      // Stop the current audio if it is playing and reset its buffer
      if (state.sound.started === true) {
        state.sound.stop();
        state.sound.setBuffer(null);
        state.sound.started = false;
        console.log('Audio stopped on change');
      }

      isAudioLoaded = false;
      state.audioLoader.load(
        url,
        function (buffer) {
          state.sound.setBuffer(buffer);
          state.sound.setLoop(false);
          state.sound.setVolume(1.0);
          isAudioLoaded = true;
          resolve();
        },
        undefined,
        (err) => {
          console.error('Error loading audio file:', err);
          reject(err);
        }
      );
    });
  }

  function playPauseAudio() {
    return new Promise(async (resolve, reject) => {
      try {
        if (state.sound.isPlaying) {
          state.sound.pause();
        } else if (!state.sound.isPlaying && isAudioLoaded) {
          if (state.audioCtx.state === 'suspended') {
            await state.audioCtx.resume();
          }
          state.sound.play();
          state.sound.started = true;
        } else {
          console.log('Audio not loaded yet');
          resolve(false);
          return;
        }
        state.essentiaNode.port.postMessage({ isPlaying: state.sound.isPlaying });
        resolve(state.sound.isPlaying);
      } catch (error) {
        console.error('Error in audio playback:', error);
        reject(error);
      }
    });
  }

  function stopAudio() {
    state.sound.stop();
    state.sound.started = false;
    state.essentiaNode.port.postMessage({ isPlaying: false });
  }

  function startMicRecordStream(deviceId) {
    return new Promise((resolve, reject) => {
      if (navigator.mediaDevices.getUserMedia) {
        const constraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        };

        navigator.mediaDevices
          .getUserMedia(constraints)
          .then((stream) => {
            state.gumStream = stream;

            if (state.audioCtx.state === 'suspended') {
              state.audioCtx
                .resume()
                .then(() => {
                  console.log('Audio Context resumed successfully');
                  setupMicStream(resolve);
                })
                .catch((error) => {
                  console.error('Error resuming audio context:', error);
                  reject(error);
                });
            } else {
              setupMicStream(resolve);
            }
          })
          .catch((err) => {
            console.error('Error accessing microphone:', err);
            reject(err);
          });
      } else {
        console.error('getUserMedia not supported');
        reject(new Error('getUserMedia not supported'));
      }
    });
  }

  function setupMicStream(resolve) {
    // Create a THREE.Audio object for the microphone
    state.micSound = new THREE.Audio(state.listener);
    state.micNode = state.audioCtx.createMediaStreamSource(state.gumStream);
    state.micSound.setNodeSource(state.micNode);

    // Because of how the THREE.Audio object works with the setNodeSource method,
    // we need to detach the mic sound from whatever it connects to for manual
    // connections. We need this source defined first though.
    state.micSound.getOutput().disconnect();

    console.log('Microphone Sound:', state.micSound);

    state.micAnalyser = new THREE.AudioAnalyser(state.micSound, state.fftSize);
    console.log('Mic Analyser created:', state.micAnalyser);

    // Create a zero gain node to mute the mic from speaker output/ feedback
    const zeroGainNode = state.audioCtx.createGain();
    zeroGainNode.gain.setValueAtTime(0, state.audioCtx.currentTime);

    // Now we can actually connect it properly in the pipeline
    state.micSound
      .getOutput()
      .connect(state.essentiaNode)
      .connect(zeroGainNode)
      .connect(state.audioCtx.destination);

    console.log('Microphone connected');

    // Post message after micNode is initialized
    state.essentiaNode.port.postMessage({
      isPlaying: state.sound.isPlaying,
      micActive: state.gumStream && state.gumStream.active,
    });

    resolve();
  }

  function stopMicRecordStream() {
    if (state.gumStream) {
      state.gumStream.getAudioTracks().forEach((track) => {
        track.stop();
      });
      state.micNode.disconnect();
      state.micAnalyser = null;
      state.gumStream = null;
      state.micSound = null;
      console.log('Microphone disconnected');
    }

    state.essentiaNode.port.postMessage({
      isPlaying: state.sound.isPlaying,
      micActive: state.gumStream && state.gumStream.active,
    });
  }

  function setup(camera) {
    // create an AudioListener and add it to the camera
    state.listener = new THREE.AudioListener();
    camera.add(state.listener);

    // create an Audio source
    state.sound = new THREE.Audio(state.listener);
    state.sound.started = false;
    console.log('Sound:', state.sound);

    state.audioCtx = state.listener.context;
    console.log('audioCtx', state.audioCtx);
    // create an AudioAnalyser, passing in the sound and desired fftSize
    state.analyser = new THREE.AudioAnalyser(state.sound, state.fftSize);
  }

  // Set up onEnded callback
  function setAudioEndedCallback(callback) {
    state.sound.onEnded = function () {
      state.sound.stop();
      state.sound.started = false;
      state.essentiaNode.port.postMessage({ isPlaying: state.sound.isPlaying });
      console.log('Before onEnded callback');
      callback();
      console.log('OnEnded callback called');
    };
  }

  function audioAnalysis() {
    let avgAmplitude = 0;
    let freqData = [];

    let inputFileAmplitude = 0;
    let micAmplitude = 0;
    let inputFileFreqData = [];
    let micFreqData = [];

    const soundIsActive = state.sound.isPlaying;
    const micIsActive = state.gumStream && state.gumStream.active;

    if (soundIsActive && state.analyser) {
      inputFileAmplitude = state.analyser.getAverageFrequency();
      inputFileFreqData = state.analyser.getFrequencyData();
    }

    if (micIsActive && state.micAnalyser) {
      micAmplitude = state.micAnalyser.getAverageFrequency();
      micFreqData = state.micAnalyser.getFrequencyData();
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

    return { avgAmplitude, freqData };
  }

  function combineFrequencyData(freqData1, freqData2) {
    // Placeholder for a more complex frequency data combining logic
    return freqData1.map((value, index) =>
      Math.sqrt(value * value + freqData2[index] * freqData2[index])
    );
  }

  function processAudioData(gpgpu, particles, essentiaData) {
    if (state.audioReader?.available_read() >= 1) {
      let read = state.audioReader.dequeue(essentiaData);
      if (read !== 0) {
        gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
      }
    }

    const soundIsActive = state.sound.isPlaying;
    const micIsActive = state.gumStream && state.gumStream.active;

    if (soundIsActive || micIsActive) {
      const { avgAmplitude, freqData } = audioAnalysis();
      gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
      gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
      particles.material.uniforms.uAverageAmplitude.value = avgAmplitude;
      gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
      gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
    } else if (!soundIsActive && !micIsActive && !state.sound.started) {
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
    if (isAudioWorkletLoaded) {
      console.log('AudioWorkletProcessor is already registered');
      return;
    }
    const workletProcessorCode = [
      './lib/essentia-wasm.umd.js',
      './lib/essentia.js-core.umd.js',
      './lib/audio-data-processor.js',
      './lib/ringbuf.js',
    ];

    return URLFromFiles(workletProcessorCode)
      .then((concatenatedCode) => {
        return state.audioCtx.audioWorklet.addModule(concatenatedCode);
      })
      .then(() => {
        isAudioWorkletLoaded = true;
      })
      .catch((msg) => {
        console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
        throw new Error(msg);
      });
  }

  function setupAudioGraph() {
    if (!window.SharedArrayBuffer) {
      console.error('SharedArrayBuffer is not supported in this browser.');
      alert('SharedArrayBuffer is not supported in this browser. Please use a compatible browser.');
      return;
    }
    let sab = window.exports.RingBuffer.getStorageForCapacity(state.capacity, Float32Array); // capacity: three float32 values [pitch, confidence, rms]
    let rb = new window.exports.RingBuffer(sab, Float32Array);
    state.audioReader = new window.exports.AudioReader(rb);

    state.essentiaNode = new AudioWorkletNode(state.audioCtx, 'audio-data-processor', {
      processorOptions: {
        bufferSize: state.fftSize,
        sampleRate: state.audioCtx.sampleRate,
        capacity: state.capacity,
      },
    });
    // Add the onmessageerror event listener
    state.essentiaNode.port.onmessageerror = (event) => {
      console.error('AudioWorkletNode message error:', event);
    };

    try {
      state.essentiaNode.port.postMessage({
        sab: sab,
        isPlaying: state.sound.isPlaying,
        micActive: state.gumStream && state.gumStream.active,
      });
    } catch (_) {
      alert('No SharedArrayBuffer tranfer support, try another browser.');
      return;
    }

    //Input File Sound Path
    state.sound.getOutput().connect(state.essentiaNode);
    console.log('inputFile Sound Gain Node --> Essentia Node');

    // This will be used for overall volume
    state.gain = state.audioCtx.createGain();

    // Connection to destination
    state.essentiaNode.connect(state.gain);
    console.log('Essentia Node --> Gain');

    state.gain.connect(state.audioCtx.destination);
    console.log('Gain --> Destination');
  }

  function startAudioProcessing(callback) {
    loadAudioWorklet()
      .then(() => {
        setupAudioGraph();
        if (callback) callback();
      })
      .catch((msg) => {
        console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
      });
  }

  return {
    setup,
    loadAudio,
    playPauseAudio,
    stopAudio,
    startMicRecordStream,
    stopMicRecordStream,
    setupAudioGraph,
    startAudioProcessing,
    setAudioEndedCallback,
    processAudioData,
    getIsAudioLoaded,
    /** Live state reference — used by timeHandler and per-frame reads */
    getState: () => state,
  };
}

// ---------------------------------------------------------------------------
// Module-level backward-compat exports for useAudioLogic (no changes needed there)
// @deprecated — use createAudioContext() instance methods for new code
// ---------------------------------------------------------------------------
const _defaultInstance = createAudioContext();

/** Returns the shared default audio context instance used by the backward-compat exports. */
export function getDefaultAudioContext() {
  return _defaultInstance;
}

export const audioObject = _defaultInstance.getState();
export const audioSetup = (camera) => _defaultInstance.setup(camera);
export const loadAudio = (url) => _defaultInstance.loadAudio(url);
export const playPauseAudio = () => _defaultInstance.playPauseAudio();
export const stopAudio = () => _defaultInstance.stopAudio();
export const startMicRecordStream = (deviceId) => _defaultInstance.startMicRecordStream(deviceId);
export const stopMicRecordStream = () => _defaultInstance.stopMicRecordStream();
export const setupAudioGraph = () => _defaultInstance.setupAudioGraph();
export const startAudioProcessing = (cb) => _defaultInstance.startAudioProcessing(cb);
export const setAudioEndedCallback = (cb) => _defaultInstance.setAudioEndedCallback(cb);
export const processAudioData = (gpgpu, particles, essentiaData) =>
  _defaultInstance.processAudioData(gpgpu, particles, essentiaData);
export const getIsAudioLoaded = () => _defaultInstance.getIsAudioLoaded();
