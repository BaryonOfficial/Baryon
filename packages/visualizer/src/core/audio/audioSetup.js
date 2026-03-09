import * as THREE from 'three';
import { AUDIO_DEFAULTS } from '../../defaults.js';
import {
  createAnalyserReader,
  createNodeAnalyser,
  sampleAnalyser,
} from './analyserSampler.js';

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

function getAnalysisSource(status) {
  if (status.isPlaying) return 'file';
  if (status.isMicActive) return 'mic';
  return 'idle';
}

function createDefaultAudioSessionBindings(instance) {
  return {
    attachAudio: (camera) => instance.attach(camera),
    loadAudio: (url) => instance.loadAudio(url),
    playPauseAudio: () => instance.playPauseAudio(),
    stopAudio: () => instance.stopAudio(),
    startMicRecordStream: (deviceId) => instance.startMicRecordStream(deviceId),
    stopMicRecordStream: () => instance.stopMicRecordStream(),
    setAudioEndedCallback: (cb) => instance.setAudioEndedCallback(cb),
    getIsAudioLoaded: () => instance.getIsAudioLoaded(),
    getAnalysisState: () => instance.getAnalysisState(),
    getStatus: () => instance.getStatus(),
    readClockSnapshot: (elapsedTime) => instance.readClockSnapshot(elapsedTime),
    readAnalysisSnapshot: () => instance.readAnalysisSnapshot(),
    disposeAudio: () => instance.dispose(),
  };
}

/**
 * Creates an isolated audio context instance.
 * All audio state is local to this instance — no module-level singletons.
 */
export function createAudioSession() {
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
    camera: null,
    audioLoader: new THREE.AudioLoader(),
  };

  let isAudioLoaded = false;
  let endedCallback = null;
  const clockState = {
    mode: 'realtime',
    previousElapsedTime: 0,
    lastKnownAudioTime: 0,
  };

  function setAudioInputMode(mode) {
    const nextMode = normalizeAudioInputMode(mode);
    state.audioInputMode = nextMode;
  }

  function getStatus() {
    const isPlaying = Boolean(state.sound?.isPlaying);
    const isMicActive = Boolean(state.gumStream?.active && state.micAnalyser);
    const analysisSource = getAnalysisSource({ isPlaying, isMicActive });

    return {
      audioInputMode: state.audioInputMode,
      analysisSource,
      pitchSourceMode: state.pitchSourceMode,
      fftSize: state.fftSize,
      capacity: state.capacity,
      sampleRate: state.audioCtx?.sampleRate ?? 44100,
      isAudioLoaded,
      isPlaying,
      isMicActive,
      hasAnalysisSource: analysisSource !== 'idle',
      workerStatus: null,
    };
  }

  function getAnalysisState() {
    const status = getStatus();
    return {
      audioInputMode: status.audioInputMode,
      pitchSourceMode: status.pitchSourceMode,
      workerStatus: status.workerStatus,
    };
  }

  function updateRealtimeClock(elapsedTime, mode) {
    const modeChanged = clockState.mode !== mode;
    const firstSample = clockState.previousElapsedTime === 0;
    const deltaTime = modeChanged || firstSample
      ? 0
      : elapsedTime - clockState.previousElapsedTime;

    clockState.previousElapsedTime = elapsedTime;
    clockState.mode = mode;

    return {
      clockMode: mode,
      time: elapsedTime,
      deltaTime,
    };
  }

  function readClockSnapshot(elapsedTime) {
    const status = getStatus();
    const timingState = {
      isPlaying: status.isPlaying,
      isMicActive: status.isMicActive,
      playbackStarted: Boolean(state.sound?.started),
      playbackTime: state.sound?.context?.currentTime ?? 0,
      playbackDeltaTime: state.sound?.listener?.timeDelta ?? 0,
    };

    if (timingState.isMicActive) {
      return updateRealtimeClock(elapsedTime, 'realtime');
    }

    if (timingState.isPlaying && timingState.playbackStarted) {
      clockState.mode = 'playback';
      clockState.previousElapsedTime = elapsedTime;
      clockState.lastKnownAudioTime = timingState.playbackTime;

      return {
        clockMode: 'playback',
        time: timingState.playbackTime,
        deltaTime: timingState.playbackDeltaTime,
      };
    }

    if (!timingState.isPlaying && timingState.playbackStarted) {
      clockState.mode = 'paused-playback';
      clockState.previousElapsedTime = elapsedTime;

      return {
        clockMode: 'paused-playback',
        time: clockState.lastKnownAudioTime,
        deltaTime: 0,
      };
    }

    return updateRealtimeClock(elapsedTime, 'realtime');
  }

  function attach(camera) {
    if (state.listener && state.camera === camera) {
      return;
    }

    if (!state.listener) {
      state.listener = new THREE.AudioListener();
      state.sound = new THREE.Audio(state.listener);
      state.sound.started = false;
      state.audioCtx = state.listener.context;
      const threeAnalyser = new THREE.AudioAnalyser(state.sound, state.fftSize);
      state.analyser = createAnalyserReader(threeAnalyser.analyser, (data) => {
        data.set(threeAnalyser.getFrequencyData());
        return data;
      });
    }

    if (state.camera && state.listener) {
      state.camera.remove(state.listener);
    }

    state.camera = camera;
    camera.add(state.listener);
  }

  function setAudioEndedCallback(callback) {
    endedCallback = callback;
    if (!state.sound) return;

    state.sound.onEnded = function () {
      if (state.sound?.isPlaying || state.sound?.started) {
        state.sound.stop();
      }
      state.sound.started = false;
      setAudioInputMode('idle');
      if (endedCallback) endedCallback();
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
          state.micAnalyser = createNodeAnalyser(state.audioCtx, state.micNode, state.fftSize);
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

  function readAnalysisSnapshot() {
    const status = getStatus();
    if (status.analysisSource === 'file') {
      return {
        sourceMode: 'file',
        ...sampleAnalyser(state.analyser),
      };
    }
    if (status.analysisSource === 'mic') {
      return {
        sourceMode: 'mic',
        ...sampleAnalyser(state.micAnalyser),
      };
    }
    return null;
  }

  function dispose() {
    stopAudio();
    stopMicRecordStream();

    if (state.sound) {
      state.sound.onEnded = null;
      state.sound.setBuffer?.(null);
    }

    if (state.camera && state.listener) {
      state.camera.remove(state.listener);
    }

    state.camera = null;
    state.listener = null;
    state.sound = null;
    state.analyser = null;
    state.audioCtx = null;
    isAudioLoaded = false;
    clockState.mode = 'realtime';
    clockState.previousElapsedTime = 0;
    clockState.lastKnownAudioTime = 0;
    setAudioInputMode('idle');
  }

  return {
    attach,
    loadAudio,
    playPauseAudio,
    stopAudio,
    startMicRecordStream,
    stopMicRecordStream,
    setAudioEndedCallback,
    getIsAudioLoaded: () => isAudioLoaded,
    getAnalysisState,
    getStatus,
    readClockSnapshot,
    readAnalysisSnapshot,
    dispose,
  };
}

const _defaultInstance = createAudioSession();
const defaultBindings = createDefaultAudioSessionBindings(_defaultInstance);

export function getDefaultAudioSession() {
  return _defaultInstance;
}
export const { attachAudio } = defaultBindings;
export const { loadAudio } = defaultBindings;
export const { playPauseAudio } = defaultBindings;
export const { stopAudio } = defaultBindings;
export const { startMicRecordStream } = defaultBindings;
export const { stopMicRecordStream } = defaultBindings;
export const { setAudioEndedCallback } = defaultBindings;
export const { getIsAudioLoaded } = defaultBindings;
export const { getAnalysisState } = defaultBindings;
export const { getStatus } = defaultBindings;
export const { readClockSnapshot } = defaultBindings;
export const { readAnalysisSnapshot } = defaultBindings;
export const { disposeAudio } = defaultBindings;
