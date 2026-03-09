import * as THREE from 'three';
import { AUDIO_DEFAULTS } from '../../defaults.js';

function createMicAnalyser(audioCtx, sourceNode, fftSize) {
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = fftSize;
  const data = new Uint8Array(analyserNode.frequencyBinCount);
  sourceNode.connect(analyserNode);

  return {
    analyser: analyserNode,
    data,
    getFrequencyData() {
      analyserNode.getByteFrequencyData(data);
      return data;
    },
    getAverageFrequency() {
      analyserNode.getByteFrequencyData(data);
      let total = 0;
      for (let i = 0; i < data.length; i++) total += data[i];
      return data.length ? total / data.length : 0;
    },
  };
}

function normalizeAudioInputMode(mode) {
  return mode === 'file' || mode === 'mic' ? mode : 'idle';
}

function stopActiveFilePlayback(state) {
  if (state.sound?.started === true) {
    state.sound.stop();
    state.sound.setBuffer(null);
    state.sound.started = false;
  }
}

function disconnectMicNode(micNode) {
  if (!micNode) return;
  try {
    micNode.disconnect();
  } catch (error) {
    console.warn('Mic disconnect skipped:', error);
  }
}

function createDefaultAudioContextBindings(instance) {
  return {
    audioObject: instance.getState(),
    audioSetup: (camera) => instance.setup(camera),
    loadAudio: (url) => instance.loadAudio(url),
    playPauseAudio: () => instance.playPauseAudio(),
    stopAudio: () => instance.stopAudio(),
    startMicRecordStream: (deviceId) => instance.startMicRecordStream(deviceId),
    stopMicRecordStream: () => instance.stopMicRecordStream(),
    startAudioProcessing: (cb) => instance.startAudioProcessing(cb),
    setAudioInputMode: (mode) => instance.setAudioInputMode(mode),
    setAudioEndedCallback: (cb) => instance.setAudioEndedCallback(cb),
    processAudioData: () => instance.processAudioData(),
    getIsAudioLoaded: () => instance.getIsAudioLoaded(),
    getAnalysisState: () => instance.getAnalysisState(),
    disposeAnalysis: () => instance.disposeAnalysis(),
  };
}

/**
 * Creates an isolated audio context instance.
 * All audio state is local to this instance — no module-level singletons.
 */
export function createAudioContext() {
  const state = {
    fftSize: 4096,
    capacity: AUDIO_DEFAULTS.capacity,
    pitchSourceMode: 'spectral',
    audioInputMode: 'idle',
    audioCtx: null,
    listener: null,
    sound: null,
    analyser: null,
    micAnalyser: null,
    micNode: null,
    gumStream: null,
    audioLoader: new THREE.AudioLoader(),
  };

  let isAudioLoaded = false;

  function setAudioInputMode(mode) {
    const nextMode = normalizeAudioInputMode(mode);
    state.audioInputMode = nextMode;
  }

  function disposeAnalysis() {}

  function getAnalysisState() {
    return {
      audioInputMode: state.audioInputMode,
      pitchSourceMode: state.pitchSourceMode,
      workerStatus: null,
    };
  }

  function setup(camera) {
    state.listener = new THREE.AudioListener();
    camera.add(state.listener);

    state.sound = new THREE.Audio(state.listener);
    state.sound.started = false;
    state.audioCtx = state.listener.context;
    state.analyser = new THREE.AudioAnalyser(state.sound, state.fftSize);
  }

  function setAudioEndedCallback(callback) {
    state.sound.onEnded = function () {
      state.sound.stop();
      state.sound.started = false;
      setAudioInputMode('idle');
      callback();
    };
  }

  function loadAudio(url) {
    return new Promise((resolve, reject) => {
      if (state.gumStream?.active) {
        stopMicRecordStream();
      }

      stopActiveFilePlayback(state);

      setAudioInputMode('file');
      isAudioLoaded = false;

      state.audioLoader.load(
        url,
        (buffer) => {
          state.sound.setBuffer(buffer);
          state.sound.setLoop(false);
          state.sound.setVolume(1.0);
          isAudioLoaded = true;
          resolve();
        },
        undefined,
        (err) => {
          setAudioInputMode('idle');
          reject(err);
        }
      );
    });
  }

  function playPauseAudio() {
    return new Promise((resolve, reject) => {
      const run = async () => {
        try {
          if (state.sound.isPlaying) {
            state.sound.pause();
            setAudioInputMode('idle');
            resolve(false);
            return;
          }

          if (!isAudioLoaded) {
            resolve(false);
            return;
          }

          if (state.gumStream?.active) {
            stopMicRecordStream();
          }

          if (state.audioCtx.state === 'suspended') {
            await state.audioCtx.resume();
          }

          setAudioInputMode('file');
          state.sound.play();
          state.sound.started = true;
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };

      run();
    });
  }

  function stopAudio() {
    if (state.sound?.isPlaying || state.sound?.started) {
      state.sound.stop();
      state.sound.started = false;
    }
    if (state.audioInputMode === 'file') {
      setAudioInputMode('idle');
    }
  }

  function startMicRecordStream(deviceId) {
    return new Promise((resolve, reject) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        reject(new Error('getUserMedia not supported'));
        return;
      }

      if (state.sound?.isPlaying || state.sound?.started) {
        stopAudio();
      }

      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };

      navigator.mediaDevices.getUserMedia(constraints)
        .then(async (stream) => {
          state.gumStream = stream;

          if (state.audioCtx.state === 'suspended') {
            await state.audioCtx.resume();
          }

          state.micNode = state.audioCtx.createMediaStreamSource(state.gumStream);
          state.micAnalyser = createMicAnalyser(state.audioCtx, state.micNode, state.fftSize);
          setAudioInputMode('mic');
          resolve();
        })
        .catch(reject);
    });
  }

  function stopMicRecordStream() {
    if (state.gumStream) {
      state.gumStream.getAudioTracks().forEach((track) => track.stop());
    }

    disconnectMicNode(state.micNode);

    state.micAnalyser = null;
    state.micNode = null;
    state.gumStream = null;

    if (state.audioInputMode === 'mic') {
      setAudioInputMode('idle');
    }
  }

  function startAudioProcessing(callback) {
    if (callback) callback();
  }

  function processAudioData() {}

  return {
    setup,
    loadAudio,
    playPauseAudio,
    stopAudio,
    startMicRecordStream,
    stopMicRecordStream,
    startAudioProcessing,
    setAudioInputMode,
    setAudioEndedCallback,
    processAudioData,
    getIsAudioLoaded: () => isAudioLoaded,
    getAnalysisState,
    disposeAnalysis,
    getState: () => state,
  };
}

const _defaultInstance = createAudioContext();
const defaultBindings = createDefaultAudioContextBindings(_defaultInstance);

export function getDefaultAudioContext() {
  return _defaultInstance;
}

export const { audioObject } = defaultBindings;
export const { audioSetup } = defaultBindings;
export const { loadAudio } = defaultBindings;
export const { playPauseAudio } = defaultBindings;
export const { stopAudio } = defaultBindings;
export const { startMicRecordStream } = defaultBindings;
export const { stopMicRecordStream } = defaultBindings;
export const { startAudioProcessing } = defaultBindings;
export const { setAudioInputMode } = defaultBindings;
export const { setAudioEndedCallback } = defaultBindings;
export const { processAudioData } = defaultBindings;
export const { getIsAudioLoaded } = defaultBindings;
export const { getAnalysisState } = defaultBindings;
export const { disposeAnalysis } = defaultBindings;
