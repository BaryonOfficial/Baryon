import { AUDIO_DEFAULTS, AUDIO_SLOT_CAPACITY } from "../../defaults.js";
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
  if (status.isPlaying && status.sourceKind !== "mic") return "file";
  if (status.isMicActive) return "mic";
  return "idle";
}

function createDefaultAudioSessionBindings(instance) {
  return {
    attachAudio: (camera) => instance.attach(camera),
    loadAudio: (url) => instance.loadAudio(url),
    loadStream: (options) => instance.loadStream(options),
    playPauseAudio: () => instance.playPauseAudio(),
    stopAudio: () => instance.stopAudio(),
    getTransportState: () => instance.getTransportState(),
    seekTo: (timeSeconds) => instance.seekTo(timeSeconds),
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

function normalizeDurationSeconds(value) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : 0;
}

function getMediaElementPlaybackTime(element) {
  return normalizeDurationSeconds(element?.currentTime);
}

function pauseMediaElement(element) {
  element?.pause?.();
}

function setMediaElementTime(element, timeSeconds) {
  if (!element) return;
  try {
    element.currentTime = normalizeDurationSeconds(timeSeconds);
  } catch (error) {
    console.warn("Media element seek skipped:", error);
  }
}

function getTimingNowMs() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

function clonePlaybackDiagnostics(diagnostics) {
  if (!diagnostics) {
    return null;
  }

  return {
    ...diagnostics,
    contextStateTransitions: Array.isArray(diagnostics.contextStateTransitions)
      ? diagnostics.contextStateTransitions.map((transition) => ({
          ...transition,
        }))
      : [],
    lastContextStateChange: diagnostics.lastContextStateChange
      ? { ...diagnostics.lastContextStateChange }
      : null,
    lastResumeAttempt: diagnostics.lastResumeAttempt
      ? { ...diagnostics.lastResumeAttempt }
      : null,
  };
}

export function createAudioSession() {
  const state = {
    fftSize: 4096,
    capacity: AUDIO_SLOT_CAPACITY,
    pitchSourceMode: "spectral",
    audioInputMode: "idle",
    audioCtx: null,
    playbackAnalyserNode: null,
    playbackOutputGain: null,
    playbackAnalyser: null,
    decodedBuffer: null,
    activeBufferSource: null,
    mediaElement: null,
    mediaElementSourceNode: null,
    mediaElementListeners: null,
    loadedPlaybackSourceKind: "none",
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
    sourceMetadata: {
      label: "",
      sourceKind: "idle",
    },
    playbackSessionId: null,
    lastPlaybackEndReason: null,
    lastPlaybackDiagnostics: null,
    activePlaybackDiagnostics: null,
    audioContextState: "uninitialized",
    audioContextStateListenerAttached: false,
  };

  let isAudioLoaded = false;
  let endedCallback = null;
  let activeMicSettingsSync = null;
  let nextPlaybackSessionId = 0;
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
    state.audioContextState = state.audioCtx.state ?? "unknown";
    if (!state.audioContextStateListenerAttached) {
      state.audioCtx.onstatechange = () => {
        handleAudioContextStateChange();
      };
      state.audioContextStateListenerAttached = true;
    }
    return state.audioCtx;
  }

  function getPlaybackDiagnosticsSnapshot() {
    return clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics ?? state.lastPlaybackDiagnostics,
    );
  }

  function resetPlaybackDiagnostics() {
    state.playbackSessionId = null;
    state.lastPlaybackEndReason = null;
    state.lastPlaybackDiagnostics = null;
    state.activePlaybackDiagnostics = null;
  }

  function updateActivePlaybackDiagnostics(mutator) {
    if (!state.activePlaybackDiagnostics) {
      return null;
    }

    mutator(state.activePlaybackDiagnostics);
    state.lastPlaybackDiagnostics = clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics,
    );
    return state.activePlaybackDiagnostics;
  }

  function finalizePlaybackDiagnostics(reason, overrides = {}) {
    const activeDiagnostics = clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics,
    );
    const finalizedDiagnostics = {
      ...(activeDiagnostics ?? {
        playbackSessionId: state.playbackSessionId,
        sourceKind: state.sourceMetadata.sourceKind || "idle",
        durationSeconds: normalizeDurationSeconds(
          state.playbackDurationSeconds,
        ),
        latestAudioContextState:
          state.audioCtx?.state ?? state.audioContextState,
        contextStateTransitions: [],
        startedAtWallTimeMs: getTimingNowMs(),
      }),
      ...overrides,
      latestAudioContextState: state.audioCtx?.state ?? state.audioContextState,
      audioContextStateAtEnd:
        overrides.audioContextStateAtEnd ??
        state.audioCtx?.state ??
        state.audioContextState,
      reason,
    };

    state.lastPlaybackEndReason = reason;
    state.lastPlaybackDiagnostics = finalizedDiagnostics;
    state.activePlaybackDiagnostics = null;
    return finalizedDiagnostics;
  }

  function handleAudioContextStateChange() {
    const audioCtx = state.audioCtx;
    const nextState = audioCtx?.state ?? "unknown";
    const previousState = state.audioContextState;
    if (previousState === nextState) {
      return;
    }

    state.audioContextState = nextState;
    updateActivePlaybackDiagnostics((diagnostics) => {
      const transition = {
        from: previousState,
        to: nextState,
        atContextTimeSeconds: audioCtx?.currentTime ?? 0,
        atWallTimeMs: getTimingNowMs(),
      };
      diagnostics.latestAudioContextState = nextState;
      diagnostics.lastContextStateChange = transition;
      diagnostics.contextStateTransitions.push(transition);
      if (diagnostics.contextStateTransitions.length > 12) {
        diagnostics.contextStateTransitions.shift();
      }
    });
  }

  async function maybeResumeAudioContext(reason = "interaction") {
    const audioCtx = state.audioCtx;
    if (!audioCtx || audioCtx.state === "running") {
      return false;
    }

    updateActivePlaybackDiagnostics((diagnostics) => {
      diagnostics.lastResumeAttempt = {
        reason,
        attemptedAtContextTimeSeconds: audioCtx.currentTime ?? 0,
        attemptedAtWallTimeMs: getTimingNowMs(),
        previousAudioContextState: audioCtx.state,
      };
    });

    try {
      await audioCtx.resume();
      handleAudioContextStateChange();
      updateActivePlaybackDiagnostics((diagnostics) => {
        if (diagnostics.lastResumeAttempt) {
          diagnostics.lastResumeAttempt.succeeded =
            audioCtx.state === "running";
          diagnostics.lastResumeAttempt.nextAudioContextState = audioCtx.state;
        }
      });
      return audioCtx.state === "running";
    } catch (error) {
      updateActivePlaybackDiagnostics((diagnostics) => {
        if (diagnostics.lastResumeAttempt) {
          diagnostics.lastResumeAttempt.succeeded = false;
          diagnostics.lastResumeAttempt.nextAudioContextState =
            audioCtx.state ?? "unknown";
          diagnostics.lastResumeAttempt.errorMessage =
            error instanceof Error ? error.message : String(error);
        }
      });
      throw error;
    }
  }

  function ensurePlaybackAudioGraph() {
    const audioCtx = ensureAudioContext();
    if (!state.playbackAnalyserNode) {
      state.playbackAnalyserNode = audioCtx.createAnalyser();
      state.playbackAnalyserNode.fftSize = state.fftSize;
      state.playbackAnalyser = createFrequencyReader(
        state.playbackAnalyserNode,
      );
      state.analyser = state.playbackAnalyser;
    }

    if (!state.playbackOutputGain) {
      state.playbackOutputGain = audioCtx.createGain();
      state.playbackOutputGain.connect(audioCtx.destination);
    }

    state.playbackOutputGain.gain.value = getEffectiveVolume();
  }

  function applyOutputVolume() {
    if (state.playbackOutputGain?.gain) {
      state.playbackOutputGain.gain.value = getEffectiveVolume();
    }
  }

  function resetPlaybackPosition(nextOffsetSeconds = 0) {
    state.playbackOffsetSeconds = nextOffsetSeconds;
    clockState.lastKnownAudioTime = nextOffsetSeconds;
  }

  function isStreamSourcePlaying() {
    return Boolean(
      state.loadedPlaybackSourceKind === "stream" &&
      state.mediaElement &&
      !state.mediaElement.paused &&
      !state.mediaElement.ended,
    );
  }

  function getCurrentPlaybackTime() {
    if (state.loadedPlaybackSourceKind === "stream" && state.mediaElement) {
      return getMediaElementPlaybackTime(state.mediaElement);
    }

    if (!state.activeBufferSource) {
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

  function clampPlaybackTime(timeSeconds) {
    const normalizedTime = normalizeDurationSeconds(timeSeconds);
    if (state.playbackDurationSeconds <= 0) {
      return normalizedTime;
    }
    return Math.min(normalizedTime, state.playbackDurationSeconds);
  }

  function clearActiveBufferSource() {
    if (!state.activeBufferSource) return;
    state.activeBufferSource.onended = null;
    disconnectAudioNode(state.activeBufferSource);
    state.activeBufferSource = null;
  }

  function removeMediaElementListeners() {
    if (!state.mediaElement || !state.mediaElementListeners) {
      return;
    }

    const { ended, durationchange } = state.mediaElementListeners;
    if (ended) {
      state.mediaElement.removeEventListener?.("ended", ended);
    }
    if (durationchange) {
      state.mediaElement.removeEventListener?.(
        "durationchange",
        durationchange,
      );
    }
    state.mediaElementListeners = null;
  }

  function releaseStreamBinding({ clearElement = false } = {}) {
    removeMediaElementListeners();
    disconnectAudioNode(state.mediaElementSourceNode);
    state.mediaElementSourceNode = null;
    if (clearElement) {
      state.mediaElement = null;
    }
  }

  function handleStreamEnded(element) {
    if (
      state.loadedPlaybackSourceKind !== "stream" ||
      state.mediaElement !== element
    ) {
      return;
    }

    pauseMediaElement(element);
    setMediaElementTime(element, 0);
    resetPlaybackPosition();
    setAudioInputMode("stopped");
    finalizePlaybackDiagnostics("natural", {
      playbackSessionId:
        state.playbackSessionId ??
        state.lastPlaybackDiagnostics?.playbackSessionId ??
        null,
      sourceKind: state.sourceMetadata.sourceKind || "stream",
      endedAtContextTimeSeconds: state.audioCtx?.currentTime ?? 0,
      endedAtPlaybackTimeSeconds: normalizeDurationSeconds(element.duration),
    });
    endedCallback?.();
  }

  function ensureStreamBinding(element) {
    ensurePlaybackAudioGraph();

    if (state.mediaElement === element && state.mediaElementSourceNode) {
      return;
    }

    if (state.mediaElement && state.mediaElement !== element) {
      releaseStreamBinding({ clearElement: true });
    }

    const audioCtx = ensureAudioContext();
    const sourceNode = audioCtx.createMediaElementSource(element);
    sourceNode.connect(state.playbackAnalyserNode);
    sourceNode.connect(state.playbackOutputGain);

    const handleEnded = () => {
      handleStreamEnded(element);
    };
    const handleDurationChange = () => {
      if (state.mediaElement === element) {
        state.playbackDurationSeconds = normalizeDurationSeconds(
          element.duration,
        );
      }
    };

    element.addEventListener?.("ended", handleEnded);
    element.addEventListener?.("durationchange", handleDurationChange);

    state.mediaElement = element;
    state.mediaElementSourceNode = sourceNode;
    state.mediaElementListeners = {
      ended: handleEnded,
      durationchange: handleDurationChange,
    };
  }

  function clearLoadedPlaybackState() {
    clearActiveBufferSource();
    if (state.mediaElement) {
      pauseMediaElement(state.mediaElement);
    }
    state.decodedBuffer = null;
    state.loadedPlaybackSourceKind = "none";
    state.playbackDurationSeconds = 0;
    state.sourceMetadata = {
      label: "",
      sourceKind: "idle",
    };
    resetPlaybackPosition();
    isAudioLoaded = false;
    state.playbackSessionId = null;
    state.activePlaybackDiagnostics = null;
    if (state.audioInputMode !== "mic") {
      setAudioInputMode("idle");
    }
  }

  function stopBufferPlayback({
    resetOffset = false,
    stoppedMode = null,
    endReason = null,
  } = {}) {
    const playbackTime = getCurrentPlaybackTime();
    const audioCtx = state.audioCtx;
    if (resetOffset) {
      resetPlaybackPosition();
    } else {
      resetPlaybackPosition(playbackTime);
    }

    const source = state.activeBufferSource;
    state.activeBufferSource = null;
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

    if (endReason) {
      finalizePlaybackDiagnostics(endReason, {
        endedAtContextTimeSeconds: audioCtx?.currentTime ?? 0,
        endedAtPlaybackTimeSeconds: resetOffset ? 0 : playbackTime,
        actualPlayedDurationSeconds:
          playbackTime -
          normalizeDurationSeconds(
            state.lastPlaybackDiagnostics?.offsetSeconds ??
              state.activePlaybackDiagnostics?.offsetSeconds ??
              0,
          ),
      });
    } else {
      state.activePlaybackDiagnostics = null;
    }

    if (stoppedMode) {
      setAudioInputMode(stoppedMode);
    } else if (state.audioInputMode === "file") {
      setAudioInputMode("idle");
    }
  }

  function stopStreamPlayback({
    resetOffset = false,
    stoppedMode = null,
    endReason = null,
  } = {}) {
    const element = state.mediaElement;
    const playbackTime = getCurrentPlaybackTime();

    if (element) {
      pauseMediaElement(element);
      if (resetOffset) {
        setMediaElementTime(element, 0);
      }
    }

    if (resetOffset) {
      resetPlaybackPosition();
    } else {
      resetPlaybackPosition(playbackTime);
    }

    if (endReason) {
      finalizePlaybackDiagnostics(endReason, {
        playbackSessionId:
          state.playbackSessionId ??
          state.lastPlaybackDiagnostics?.playbackSessionId ??
          null,
        sourceKind: state.sourceMetadata.sourceKind || "stream",
        endedAtContextTimeSeconds: state.audioCtx?.currentTime ?? 0,
        endedAtPlaybackTimeSeconds: resetOffset ? 0 : playbackTime,
      });
    }

    if (stoppedMode) {
      setAudioInputMode(stoppedMode);
    } else if (state.audioInputMode === "file") {
      setAudioInputMode("idle");
    }
  }

  function stopPlayback({
    resetOffset = false,
    stoppedMode = null,
    endReason = null,
  } = {}) {
    if (state.loadedPlaybackSourceKind === "stream") {
      stopStreamPlayback({ resetOffset, stoppedMode, endReason });
      return;
    }

    if (state.activeBufferSource || state.playbackOffsetSeconds > 0) {
      stopBufferPlayback({ resetOffset, stoppedMode, endReason });
      return;
    }

    if (endReason) {
      finalizePlaybackDiagnostics(endReason, {
        endedAtContextTimeSeconds: state.audioCtx?.currentTime ?? 0,
        endedAtPlaybackTimeSeconds: resetOffset
          ? 0
          : state.playbackOffsetSeconds,
      });
    }

    if (stoppedMode) {
      setAudioInputMode(stoppedMode);
    } else if (state.audioInputMode === "file") {
      setAudioInputMode("idle");
    }
  }

  function handleBufferEnded(source) {
    if (state.activeBufferSource !== source) {
      return;
    }

    const audioCtx = state.audioCtx;
    const activeDiagnostics = clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics,
    );
    const playbackTime = clampPlaybackTime(getCurrentPlaybackTime());
    const offsetSeconds = normalizeDurationSeconds(
      activeDiagnostics?.offsetSeconds ?? state.playbackOffsetSeconds,
    );
    const expectedRemainingDurationSeconds = normalizeDurationSeconds(
      activeDiagnostics?.expectedRemainingDurationSeconds ??
        state.playbackDurationSeconds - offsetSeconds,
    );
    const actualPlayedDurationSeconds = Math.max(
      0,
      playbackTime - offsetSeconds,
    );
    const expectedPlaybackTime = clampPlaybackTime(
      offsetSeconds + expectedRemainingDurationSeconds,
    );
    const endedNearExpectedTime =
      expectedRemainingDurationSeconds <= 0 ||
      playbackTime >= expectedPlaybackTime - 0.05;
    const endReason = endedNearExpectedTime
      ? "natural"
      : audioCtx?.state === "running"
        ? "premature"
        : "interrupted";

    clearActiveBufferSource();
    if (endReason === "natural") {
      resetPlaybackPosition();
      setAudioInputMode("stopped");
    } else {
      resetPlaybackPosition(playbackTime);
      setAudioInputMode("idle");
    }
    finalizePlaybackDiagnostics(endReason, {
      endedAtContextTimeSeconds: audioCtx?.currentTime ?? 0,
      endedAtPlaybackTimeSeconds: playbackTime,
      actualPlayedDurationSeconds,
      expectedPlaybackTimeSeconds: expectedPlaybackTime,
      prematureBySeconds: Math.max(0, expectedPlaybackTime - playbackTime),
    });
    if (endReason === "natural") {
      endedCallback?.();
    }
  }

  function getStatus() {
    const isPlaying = Boolean(
      (state.activeBufferSource && state.audioCtx?.state === "running") ||
      isStreamSourcePlaying(),
    );
    const isMicActive = Boolean(state.gumStream?.active && state.micAnalyser);
    const sourceKind = isMicActive
      ? "mic"
      : state.loadedPlaybackSourceKind === "stream"
        ? state.sourceMetadata.sourceKind || "stream"
        : state.loadedPlaybackSourceKind === "file"
          ? "file"
          : "idle";
    const analysisSource = getAnalysisSource({
      isPlaying,
      isMicActive,
      sourceKind,
    });

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
      sourceKind,
      sourceLabel: state.sourceMetadata.label || "",
      playbackSessionId:
        state.playbackSessionId ??
        state.lastPlaybackDiagnostics?.playbackSessionId ??
        null,
      lastPlaybackEndReason: state.lastPlaybackEndReason,
      lastPlaybackDiagnostics: getPlaybackDiagnosticsSnapshot(),
    };
  }

  function getTransportState() {
    const durationSeconds = normalizeDurationSeconds(
      state.playbackDurationSeconds,
    );
    const currentTimeSeconds = clampPlaybackTime(getCurrentPlaybackTime());
    const canSeek =
      isAudioLoaded &&
      !(state.gumStream?.active && state.micAnalyser) &&
      durationSeconds > 0 &&
      state.loadedPlaybackSourceKind !== "none";

    return {
      currentTimeSeconds,
      durationSeconds,
      canSeek,
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
    ensurePlaybackAudioGraph();
    resetPlaybackDiagnostics();

    if (state.gumStream?.active) {
      stopMicRecordStream();
    }

    stopPlayback({ resetOffset: true });
    clearLoadedPlaybackState();
    setAudioInputMode("file");

    const response = await fetch(url);
    if (!response.ok) {
      setAudioInputMode("idle");
      throw new Error(`Failed to load audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decodedBuffer =
      await ensureAudioContext().decodeAudioData(arrayBuffer);
    state.decodedBuffer = decodedBuffer;
    state.loadedPlaybackSourceKind = "file";
    state.playbackDurationSeconds = normalizeDurationSeconds(
      decodedBuffer.duration,
    );
    state.sourceMetadata = {
      label: "",
      sourceKind: "file",
    };
    resetPlaybackPosition();
    applyOutputVolume();
    isAudioLoaded = true;
  }

  async function loadStream(options = {}) {
    const {
      element,
      label = "",
      duration = undefined,
      sourceKind = "stream",
    } = options;

    if (!element) {
      throw new Error("A media element is required for stream playback");
    }

    ensurePlaybackAudioGraph();
    resetPlaybackDiagnostics();

    if (state.gumStream?.active) {
      stopMicRecordStream();
    }

    stopPlayback({ resetOffset: true });
    clearLoadedPlaybackState();
    ensureStreamBinding(element);

    state.loadedPlaybackSourceKind = "stream";
    state.playbackDurationSeconds = normalizeDurationSeconds(
      duration ?? element.duration,
    );
    state.sourceMetadata = {
      label: String(label).trim(),
      sourceKind: String(sourceKind || "stream"),
    };
    resetPlaybackPosition(getMediaElementPlaybackTime(element));
    applyOutputVolume();
    isAudioLoaded = true;
    setAudioInputMode("file");
  }

  async function startBufferPlayback(
    offsetSeconds = state.playbackOffsetSeconds,
  ) {
    if (!isAudioLoaded || !state.decodedBuffer) {
      return false;
    }

    if (state.gumStream?.active) {
      stopMicRecordStream();
    }

    const audioCtx = ensureAudioContext();
    ensurePlaybackAudioGraph();

    if (audioCtx.state !== "running") {
      await maybeResumeAudioContext("start-buffer-playback");
    }

    const source = audioCtx.createBufferSource();
    source.buffer = state.decodedBuffer;
    source.connect(state.playbackAnalyserNode);
    source.connect(state.playbackOutputGain);
    source.onended = () => {
      handleBufferEnded(source);
    };

    const nextOffset = Math.min(
      clampPlaybackTime(offsetSeconds),
      Math.max(0, state.playbackDurationSeconds - 1e-4),
    );
    resetPlaybackPosition(nextOffset);
    state.playbackStartedAtSeconds = audioCtx.currentTime;
    state.playbackSessionId = ++nextPlaybackSessionId;
    state.lastPlaybackEndReason = null;
    state.activePlaybackDiagnostics = {
      playbackSessionId: state.playbackSessionId,
      sourceKind: "file",
      startedAtContextTimeSeconds: audioCtx.currentTime,
      startedAtWallTimeMs: getTimingNowMs(),
      offsetSeconds: nextOffset,
      durationSeconds: normalizeDurationSeconds(state.playbackDurationSeconds),
      expectedRemainingDurationSeconds: Math.max(
        0,
        state.playbackDurationSeconds - nextOffset,
      ),
      expectedEndTimeSeconds:
        audioCtx.currentTime +
        Math.max(0, state.playbackDurationSeconds - nextOffset),
      audioContextStateAtStart: audioCtx.state,
      latestAudioContextState: audioCtx.state,
      contextStateTransitions: [],
      lastContextStateChange: null,
      lastResumeAttempt: null,
    };
    state.lastPlaybackDiagnostics = clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics,
    );
    state.activeBufferSource = source;
    setAudioInputMode("file");
    source.start(0, nextOffset);
    return true;
  }

  async function playPauseAudio() {
    const audioCtx = state.audioCtx;
    if (state.activeBufferSource && audioCtx && audioCtx.state !== "running") {
      return maybeResumeAudioContext("play-pause-resume");
    }

    if (state.activeBufferSource) {
      stopBufferPlayback();
      return false;
    }

    if (isStreamSourcePlaying()) {
      stopStreamPlayback();
      return false;
    }

    if (state.loadedPlaybackSourceKind === "stream" && state.mediaElement) {
      const streamAudioCtx = ensureAudioContext();
      ensurePlaybackAudioGraph();

      if (streamAudioCtx.state !== "running") {
        await maybeResumeAudioContext("stream-playback");
      }

      if (
        state.playbackDurationSeconds > 0 &&
        getMediaElementPlaybackTime(state.mediaElement) >=
          state.playbackDurationSeconds
      ) {
        setMediaElementTime(state.mediaElement, 0);
      }

      await state.mediaElement.play();
      setAudioInputMode("file");
      return true;
    }

    if (!isAudioLoaded || !state.decodedBuffer) {
      return false;
    }

    return startBufferPlayback(state.playbackOffsetSeconds);
  }

  function stopAudio() {
    if (
      state.loadedPlaybackSourceKind === "stream" ||
      state.activeBufferSource ||
      state.playbackOffsetSeconds > 0
    ) {
      stopPlayback({
        resetOffset: true,
        stoppedMode: "stopped",
        endReason: "stopped",
      });
    } else if (state.audioInputMode === "file") {
      finalizePlaybackDiagnostics("stopped", {
        endedAtContextTimeSeconds: state.audioCtx?.currentTime ?? 0,
        endedAtPlaybackTimeSeconds: 0,
      });
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

  async function seekTo(timeSeconds) {
    const { canSeek } = getTransportState();
    if (!canSeek) {
      return false;
    }

    const nextTimeSeconds = clampPlaybackTime(timeSeconds);

    if (state.loadedPlaybackSourceKind === "stream" && state.mediaElement) {
      if (state.audioCtx?.state && state.audioCtx.state !== "running") {
        await maybeResumeAudioContext("seek");
      }
      setMediaElementTime(state.mediaElement, nextTimeSeconds);
      resetPlaybackPosition(nextTimeSeconds);
      return true;
    }

    if (!state.decodedBuffer) {
      return false;
    }

    const wasPlaying = Boolean(state.activeBufferSource);
    if (wasPlaying) {
      const source = state.activeBufferSource;
      state.activeBufferSource = null;
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
    }

    resetPlaybackPosition(nextTimeSeconds);

    if (wasPlaying) {
      return startBufferPlayback(nextTimeSeconds);
    }

    if (state.audioInputMode === "file") {
      setAudioInputMode("idle");
    }

    return true;
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

    if (
      state.loadedPlaybackSourceKind !== "none" ||
      state.playbackOffsetSeconds > 0
    ) {
      stopAudio();
      clearLoadedPlaybackState();
    }

    const constraints = {
      audio: buildMicConstraints(deviceId, state.micSettings),
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.gumStream = stream;
    state.selectedMicDeviceId = deviceId ?? null;
    state.appliedMicSettings = cloneMicSettings(state.micSettings);

    const audioCtx = ensureAudioContext();
    if (audioCtx.state !== "running") {
      await maybeResumeAudioContext("start-mic-record");
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
        sourceMode:
          state.loadedPlaybackSourceKind === "stream" ? "stream" : "file",
        ...sampleAnalyser(state.playbackAnalyser),
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

    releaseStreamBinding({ clearElement: true });
    disconnectAudioNode(state.playbackOutputGain);
    disconnectAudioNode(state.playbackAnalyserNode);
    state.playbackOutputGain = null;
    state.playbackAnalyserNode = null;
    state.playbackAnalyser = null;
    state.analyser = null;
    state.decodedBuffer = null;
    state.loadedPlaybackSourceKind = "none";
    state.playbackDurationSeconds = 0;
    state.sourceMetadata = {
      label: "",
      sourceKind: "idle",
    };
    resetPlaybackPosition();
    state.audioCtx = null;
    state.audioContextState = "closed";
    state.audioContextStateListenerAttached = false;
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
    loadStream,
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
    getTransportState,
    getMicSettings,
    readClockSnapshot,
    readAnalysisSnapshot,
    seekTo,
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
export const { loadStream } = defaultBindings;
export const { playPauseAudio } = defaultBindings;
export const { stopAudio } = defaultBindings;
export const { getTransportState } = defaultBindings;
export const { seekTo } = defaultBindings;
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
