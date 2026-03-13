import { AUDIO_DEFAULTS } from "../../defaults.js";
import {
  createAnalyserReader,
  createNodeAnalyser,
  sampleAnalyser,
} from "./analyserSampler.js";

function normalizeMicSettings(settings = {}) {
  return {
    echoCancellation: Boolean(
      settings.echoCancellation ?? AUDIO_DEFAULTS.echoCancellation,
    ),
    noiseSuppression: Boolean(
      settings.noiseSuppression ?? AUDIO_DEFAULTS.noiseSuppression,
    ),
    autoGainControl: Boolean(
      settings.autoGainControl ?? AUDIO_DEFAULTS.autoGainControl,
    ),
  };
}

function cloneMicSettings(settings) {
  return {
    echoCancellation: Boolean(settings?.echoCancellation),
    noiseSuppression: Boolean(settings?.noiseSuppression),
    autoGainControl: Boolean(settings?.autoGainControl),
  };
}

function areMicSettingsEqual(left, right) {
  return (
    Boolean(left?.echoCancellation) === Boolean(right?.echoCancellation) &&
    Boolean(left?.noiseSuppression) === Boolean(right?.noiseSuppression) &&
    Boolean(left?.autoGainControl) === Boolean(right?.autoGainControl)
  );
}

function buildMicConstraints(deviceId, micSettings) {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    ...cloneMicSettings(micSettings),
  };
}

function normalizeAudioInputMode(mode) {
  return mode === "file" || mode === "mic" || mode === "stopped"
    ? mode
    : "idle";
}

function disconnectAudioNode(node, target = undefined) {
  if (!node?.disconnect) return;
  try {
    if (target) {
      node.disconnect(target);
    } else {
      node.disconnect();
    }
  } catch (error) {
    console.warn("Audio disconnect skipped:", error);
  }
}

function getAnalysisSource(status) {
  if (status.isPlaying) return "file";
  if (status.isMicActive) return "mic";
  return "idle";
}

function createDefaultAudioSessionBindings(instance) {
  return {
    attachAudio: (camera) => instance.attach(camera),
    loadAudio: (url) => instance.loadAudio(url),
    playPauseAudio: () => instance.playPauseAudio(),
    stopAudio: () => instance.stopAudio(),
    setAudioVolume: (value) => instance.setVolume(value),
    setAudioMuted: (value) => instance.setMuted(value),
    setMicSettings: (settings) => instance.setMicSettings(settings),
    startMicRecordStream: (deviceId) => instance.startMicRecordStream(deviceId),
    stopMicRecordStream: () => instance.stopMicRecordStream(),
    setAudioEndedCallback: (cb) => instance.setAudioEndedCallback(cb),
    getIsAudioLoaded: () => instance.getIsAudioLoaded(),
    getAnalysisState: () => instance.getAnalysisState(),
    getStatus: () => instance.getStatus(),
    getMicSettings: () => instance.getMicSettings(),
    readClockSnapshot: (elapsedTime) => instance.readClockSnapshot(elapsedTime),
    readAnalysisSnapshot: () => instance.readAnalysisSnapshot(),
    disposeAudio: () => instance.dispose(),
  };
}

function getAudioContextCtor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function createFrequencyReader(analyserNode) {
  return createAnalyserReader(analyserNode, (data) => {
    analyserNode.getByteFrequencyData(data);
    return data;
  });
}

export function createAudioSession() {
  const state = {
    fftSize: 4096,
    capacity: AUDIO_DEFAULTS.capacity,
    pitchSourceMode: "spectral",
    audioInputMode: "idle",
    audioCtx: null,
    fileAnalyserNode: null,
    fileOutputGain: null,
    fileAnalyser: null,
    decodedBuffer: null,
    activeFileSource: null,
    playbackOffsetSeconds: 0,
    playbackStartedAtSeconds: 0,
    playbackDurationSeconds: 0,
    analyser: null,
    micAnalyser: null,
    micNode: null,
    gumStream: null,
    micSettings: normalizeMicSettings(),
    appliedMicSettings: normalizeMicSettings(),
    selectedMicDeviceId: null,
    volume: 1,
    muted: false,
  };

  let isAudioLoaded = false;
  let endedCallback = null;
  let activeMicSettingsSync = null;
  const clockState = {
    mode: "realtime",
    previousElapsedTime: 0,
    lastKnownAudioTime: 0,
  };

  function setAudioInputMode(mode) {
    state.audioInputMode = normalizeAudioInputMode(mode);
  }

  function getEffectiveVolume() {
    return state.muted ? 0 : state.volume;
  }

  function ensureAudioContext() {
    if (state.audioCtx) return state.audioCtx;

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      throw new Error("Web Audio API not supported");
    }

    state.audioCtx = new AudioContextCtor();
    return state.audioCtx;
  }

  function ensureFileAudioGraph() {
    const audioCtx = ensureAudioContext();
    if (!state.fileAnalyserNode) {
      state.fileAnalyserNode = audioCtx.createAnalyser();
      state.fileAnalyserNode.fftSize = state.fftSize;
      state.fileAnalyser = createFrequencyReader(state.fileAnalyserNode);
      state.analyser = state.fileAnalyser;
    }

    if (!state.fileOutputGain) {
      state.fileOutputGain = audioCtx.createGain();
      state.fileOutputGain.connect(audioCtx.destination);
    }

    state.fileOutputGain.gain.value = getEffectiveVolume();
  }

  function applyOutputVolume() {
    if (state.fileOutputGain?.gain) {
      state.fileOutputGain.gain.value = getEffectiveVolume();
    }
  }

  function resetPlaybackPosition(nextOffsetSeconds = 0) {
    state.playbackOffsetSeconds = nextOffsetSeconds;
    clockState.lastKnownAudioTime = nextOffsetSeconds;
  }

  function getCurrentPlaybackTime() {
    if (!state.activeFileSource) {
      return state.playbackOffsetSeconds;
    }

    return Math.min(
      state.playbackDurationSeconds || Infinity,
      state.playbackOffsetSeconds +
        Math.max(
          0,
          ensureAudioContext().currentTime - state.playbackStartedAtSeconds,
        ),
    );
  }

  function clearActiveFileSource() {
    if (!state.activeFileSource) return;
    state.activeFileSource.onended = null;
    disconnectAudioNode(state.activeFileSource);
    state.activeFileSource = null;
  }

  function stopFilePlayback({ resetOffset = false, stoppedMode = null } = {}) {
    const playbackTime = getCurrentPlaybackTime();
    if (resetOffset) {
      resetPlaybackPosition();
    } else {
      resetPlaybackPosition(playbackTime);
    }

    const source = state.activeFileSource;
    state.activeFileSource = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch (error) {
        if (error?.name !== "InvalidStateError") {
          throw error;
        }
      }
      disconnectAudioNode(source);
    }

    if (stoppedMode) {
      setAudioInputMode(stoppedMode);
    } else if (state.audioInputMode === "file") {
      setAudioInputMode("idle");
    }
  }

  function handleFileEnded(source) {
    if (state.activeFileSource !== source) {
      return;
    }

    clearActiveFileSource();
    resetPlaybackPosition();
    setAudioInputMode("stopped");
    endedCallback?.();
  }

  function getStatus() {
    const isPlaying = Boolean(state.activeFileSource);
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
      hasAnalysisSource: analysisSource !== "idle",
      workerStatus: null,
      volume: state.volume,
      muted: state.muted,
      micSettings: cloneMicSettings(state.micSettings),
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
    const deltaTime =
      modeChanged || firstSample
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

    if (status.isMicActive) {
      return updateRealtimeClock(elapsedTime, "realtime");
    }

    if (status.isPlaying) {
      const playbackTime = getCurrentPlaybackTime();
      const deltaTime = Math.max(
        0,
        playbackTime - clockState.lastKnownAudioTime,
      );
      clockState.mode = "playback";
      clockState.previousElapsedTime = elapsedTime;
      clockState.lastKnownAudioTime = playbackTime;

      return {
        clockMode: "playback",
        time: playbackTime,
        deltaTime,
      };
    }

    if (
      state.playbackOffsetSeconds > 0 &&
      status.isAudioLoaded &&
      status.audioInputMode === "idle"
    ) {
      clockState.mode = "paused-playback";
      clockState.previousElapsedTime = elapsedTime;

      return {
        clockMode: "paused-playback",
        time: clockState.lastKnownAudioTime || state.playbackOffsetSeconds,
        deltaTime: 0,
      };
    }

    return updateRealtimeClock(elapsedTime, "realtime");
  }

  function attach(_camera) {
    void _camera;
  }

  function setAudioEndedCallback(callback) {
    endedCallback = callback;
  }

  async function loadAudio(url) {
    ensureFileAudioGraph();

    if (state.gumStream?.active) {
      stopMicRecordStream();
    }

    stopFilePlayback({ resetOffset: true });
    setAudioInputMode("file");
    isAudioLoaded = false;

    const response = await fetch(url);
    if (!response.ok) {
      setAudioInputMode("idle");
      throw new Error(`Failed to load audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decodedBuffer =
      await ensureAudioContext().decodeAudioData(arrayBuffer);
    state.decodedBuffer = decodedBuffer;
    state.playbackDurationSeconds = decodedBuffer.duration ?? 0;
    resetPlaybackPosition();
    applyOutputVolume();
    isAudioLoaded = true;
  }

  async function playPauseAudio() {
    if (state.activeFileSource) {
      stopFilePlayback();
      return false;
    }

    if (!isAudioLoaded || !state.decodedBuffer) {
      return false;
    }

    if (state.gumStream?.active) {
      stopMicRecordStream();
    }

    const audioCtx = ensureAudioContext();
    ensureFileAudioGraph();

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = state.decodedBuffer;
    source.connect(state.fileAnalyserNode);
    source.connect(state.fileOutputGain);
    source.onended = () => {
      handleFileEnded(source);
    };

    const offset = Math.min(
      state.playbackOffsetSeconds,
      Math.max(0, state.playbackDurationSeconds - 1e-4),
    );
    state.playbackStartedAtSeconds = audioCtx.currentTime;
    state.activeFileSource = source;
    setAudioInputMode("file");
    source.start(0, offset);
    return true;
  }

  function stopAudio() {
    if (state.activeFileSource || state.playbackOffsetSeconds > 0) {
      stopFilePlayback({ resetOffset: true, stoppedMode: "stopped" });
    } else if (state.audioInputMode === "file") {
      setAudioInputMode("stopped");
    }
  }

  function setVolume(value) {
    const nextVolume = Math.max(0, Math.min(1, Number(value) || 0));
    state.volume = nextVolume;
    applyOutputVolume();
    return nextVolume;
  }

  function setMuted(value) {
    state.muted = Boolean(value);
    applyOutputVolume();
    return state.muted;
  }

  async function applyMicSettingsToActiveStream(targetSettings) {
    const track = state.gumStream?.getAudioTracks?.()?.[0];

    if (!track) {
      state.appliedMicSettings = cloneMicSettings(targetSettings);
      return cloneMicSettings(state.appliedMicSettings);
    }

    if (typeof track.applyConstraints === "function") {
      await track.applyConstraints(buildMicConstraints(null, targetSettings));
      state.appliedMicSettings = cloneMicSettings(targetSettings);
      return cloneMicSettings(state.appliedMicSettings);
    }

    const selectedDeviceId = state.selectedMicDeviceId;
    stopMicRecordStream();
    await startMicRecordStream(selectedDeviceId);
    state.appliedMicSettings = cloneMicSettings(state.micSettings);
    return cloneMicSettings(state.appliedMicSettings);
  }

  async function setMicSettings(nextSettings) {
    const normalized = normalizeMicSettings(nextSettings);
    if (areMicSettingsEqual(state.micSettings, normalized)) {
      return cloneMicSettings(state.micSettings);
    }

    state.micSettings = normalized;
    if (!state.gumStream?.active) {
      return cloneMicSettings(state.micSettings);
    }

    while (
      state.gumStream?.active &&
      !areMicSettingsEqual(state.appliedMicSettings, state.micSettings)
    ) {
      if (activeMicSettingsSync) {
        await activeMicSettingsSync;
        continue;
      }

      const targetSettings = cloneMicSettings(state.micSettings);
      activeMicSettingsSync = applyMicSettingsToActiveStream(targetSettings);
      try {
        await activeMicSettingsSync;
      } finally {
        activeMicSettingsSync = null;
      }
    }

    return cloneMicSettings(state.micSettings);
  }

  function getMicSettings() {
    return cloneMicSettings(state.micSettings);
  }

  async function startMicRecordStream(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }

    if (state.activeFileSource || state.playbackOffsetSeconds > 0) {
      stopAudio();
    }

    const constraints = {
      audio: buildMicConstraints(deviceId, state.micSettings),
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.gumStream = stream;
    state.selectedMicDeviceId = deviceId ?? null;
    state.appliedMicSettings = cloneMicSettings(state.micSettings);

    const audioCtx = ensureAudioContext();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    state.micNode = audioCtx.createMediaStreamSource(state.gumStream);
    state.micAnalyser = createNodeAnalyser(
      audioCtx,
      state.micNode,
      state.fftSize,
    );
    setAudioInputMode("mic");
  }

  function stopMicRecordStream() {
    if (state.gumStream) {
      state.gumStream.getAudioTracks().forEach((track) => track.stop());
    }

    activeMicSettingsSync = null;
    disconnectAudioNode(state.micNode);

    state.micAnalyser = null;
    state.micNode = null;
    state.gumStream = null;

    if (state.audioInputMode === "mic") {
      setAudioInputMode("idle");
    }
  }

  function readAnalysisSnapshot() {
    const status = getStatus();
    if (status.analysisSource === "file") {
      return {
        sourceMode: "file",
        ...sampleAnalyser(state.fileAnalyser),
      };
    }
    if (status.analysisSource === "mic") {
      return {
        sourceMode: "mic",
        ...sampleAnalyser(state.micAnalyser),
      };
    }
    return null;
  }

  async function dispose() {
    const audioCtx = state.audioCtx;
    stopAudio();
    stopMicRecordStream();
    endedCallback = null;

    disconnectAudioNode(state.fileOutputGain);
    disconnectAudioNode(state.fileAnalyserNode);
    state.fileOutputGain = null;
    state.fileAnalyserNode = null;
    state.fileAnalyser = null;
    state.analyser = null;
    state.decodedBuffer = null;
    state.playbackDurationSeconds = 0;
    resetPlaybackPosition();
    state.audioCtx = null;
    isAudioLoaded = false;
    clockState.mode = "realtime";
    clockState.previousElapsedTime = 0;
    clockState.lastKnownAudioTime = 0;
    setAudioInputMode("idle");

    if (audioCtx?.close) {
      try {
        await audioCtx.close();
      } catch (error) {
        console.warn("AudioContext close skipped:", error);
      }
    }
  }

  return {
    attach,
    loadAudio,
    playPauseAudio,
    stopAudio,
    setVolume,
    setMuted,
    setMicSettings,
    startMicRecordStream,
    stopMicRecordStream,
    setAudioEndedCallback,
    getIsAudioLoaded: () => isAudioLoaded,
    getAnalysisState,
    getStatus,
    getMicSettings,
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
export const { setAudioVolume } = defaultBindings;
export const { setAudioMuted } = defaultBindings;
export const { setMicSettings } = defaultBindings;
export const { startMicRecordStream } = defaultBindings;
export const { stopMicRecordStream } = defaultBindings;
export const { setAudioEndedCallback } = defaultBindings;
export const { getIsAudioLoaded } = defaultBindings;
export const { getAnalysisState } = defaultBindings;
export const { getStatus } = defaultBindings;
export const { getMicSettings } = defaultBindings;
export const { readClockSnapshot } = defaultBindings;
export const { readAnalysisSnapshot } = defaultBindings;
export const { disposeAudio } = defaultBindings;
