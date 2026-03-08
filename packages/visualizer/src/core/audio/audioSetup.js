import * as THREE from 'three';
import { DEFAULTS } from '../../defaults.js';
import { createPitchService } from './pitchService.js';

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

/**
 * Creates an isolated audio context instance.
 * All audio state is local to this instance — no module-level singletons.
 */
export function createAudioContext() {
  const state = {
    fftSize: 4096,
    capacity: DEFAULTS.capacity,
    pitchSourceMode: 'auto',
    audioInputMode: 'idle',
    audioCtx: null,
    listener: null,
    sound: null,
    analyser: null,
    micAnalyser: null,
    micNode: null,
    gumStream: null,
    pitchService: null,
    audioLoader: new THREE.AudioLoader(),
  };

  let isAudioLoaded = false;

  function ensurePitchService() {
    if (!state.pitchService && state.audioCtx) {
      state.pitchService = createPitchService({
        sampleRate: state.audioCtx.sampleRate,
      });
      state.pitchService.setMode('idle');
    }
  }

  function setAudioInputMode(mode) {
    const nextMode = mode === 'file' || mode === 'mic' ? mode : 'idle';
    state.audioInputMode = nextMode;
    ensurePitchService();
    state.pitchService?.setMode(nextMode);
  }

  function disposeAnalysis() {
    state.pitchService?.dispose();
    state.pitchService = null;
  }

  function getAnalysisState() {
    return {
      audioInputMode: state.audioInputMode,
      pitchSourceMode: state.pitchSourceMode,
      workerStatus: state.pitchService?.getStatus() ?? null,
    };
  }

  function setup(camera) {
    state.listener = new THREE.AudioListener();
    camera.add(state.listener);

    state.sound = new THREE.Audio(state.listener);
    state.sound.started = false;
    state.audioCtx = state.listener.context;
    state.analyser = new THREE.AudioAnalyser(state.sound, state.fftSize);
    ensurePitchService();
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

      if (state.sound.started === true) {
        state.sound.stop();
        state.sound.setBuffer(null);
        state.sound.started = false;
      }

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

    if (state.micNode) {
      try {
        state.micNode.disconnect();
      } catch (error) {
        console.warn('Mic disconnect skipped:', error);
      }
    }

    state.micAnalyser = null;
    state.micNode = null;
    state.gumStream = null;

    if (state.audioInputMode === 'mic') {
      setAudioInputMode('idle');
    }
  }

  function startAudioProcessing(callback) {
    ensurePitchService();
    if (callback) callback();
  }

  function setPitchSourceMode(mode) {
    state.pitchSourceMode = mode === 'fallback'
      ? 'fallback'
      : mode === 'worker'
      ? 'worker'
      : 'auto';
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
    setPitchSourceMode,
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
export const startAudioProcessing = (cb) => _defaultInstance.startAudioProcessing(cb);
export const setPitchSourceMode = (mode) => _defaultInstance.setPitchSourceMode(mode);
export const setAudioInputMode = (mode) => _defaultInstance.setAudioInputMode(mode);
export const setAudioEndedCallback = (cb) => _defaultInstance.setAudioEndedCallback(cb);
export const processAudioData = () => _defaultInstance.processAudioData();
export const getIsAudioLoaded = () => _defaultInstance.getIsAudioLoaded();
export const getAnalysisState = () => _defaultInstance.getAnalysisState();
export const disposeAnalysis = () => _defaultInstance.disposeAnalysis();
