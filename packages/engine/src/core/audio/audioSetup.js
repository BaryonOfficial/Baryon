import {
  AUDIO_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
} from "../../defaults.js";
import { createNodeAnalyser, sampleAnalyser } from "./analyserSampler.js";
import {
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisClass,
  normalizeLiveInputAnalysisOverrides,
  resolveLiveInputAnalysisClass,
} from "./liveInputAnalysis.js";
import {
  LIVE_INPUT_DEVICE_KINDS,
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "./inputDeviceSemantics.js";

const LIVE_INPUT_INTERRUPTION_MUTE_TIMEOUT_MS = 1500;
const LIVE_INPUT_INTERRUPTION_CONTEXT_TIMEOUT_MS = 1500;
const FAST_ANALYSIS_FFT_SIZE = 2048;

function normalizeLiveInputSettings(settings = {}) {
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

function cloneLiveInputSettings(settings) {
  return {
    echoCancellation: Boolean(settings?.echoCancellation),
    noiseSuppression: Boolean(settings?.noiseSuppression),
    autoGainControl: Boolean(settings?.autoGainControl),
  };
}

function normalizeLiveInputAnalysisSettings(
  settings = {},
  previous = undefined,
) {
  return {
    analysisClass: normalizeLiveInputAnalysisClass(
      settings.analysisClass ??
        previous?.analysisClass ??
        AUDIO_DEFAULTS.liveInputAnalysisClass,
    ),
    acousticIntent: normalizeLiveInputAcousticIntent(
      settings.acousticIntent ??
        previous?.acousticIntent ??
        AUDIO_DEFAULTS.liveInputAcousticIntent,
    ),
    overrides: normalizeLiveInputAnalysisOverrides(
      settings.overrides ?? previous?.overrides,
    ),
  };
}

function cloneLiveInputAnalysisSettings(settings) {
  return {
    analysisClass: normalizeLiveInputAnalysisClass(settings?.analysisClass),
    acousticIntent: normalizeLiveInputAcousticIntent(settings?.acousticIntent),
    overrides: normalizeLiveInputAnalysisOverrides(settings?.overrides),
  };
}

function areLiveInputAnalysisSettingsEqual(left, right) {
  const normalizedLeft = cloneLiveInputAnalysisSettings(left);
  const normalizedRight = cloneLiveInputAnalysisSettings(right);
  if (normalizedLeft.analysisClass !== normalizedRight.analysisClass) {
    return false;
  }
  if (normalizedLeft.acousticIntent !== normalizedRight.acousticIntent) {
    return false;
  }

  const leftKeys = Object.keys(normalizedLeft.overrides);
  const rightKeys = Object.keys(normalizedRight.overrides);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) => normalizedLeft.overrides[key] === normalizedRight.overrides[key],
  );
}

function areLiveInputSettingsEqual(left, right) {
  return (
    Boolean(left?.echoCancellation) === Boolean(right?.echoCancellation) &&
    Boolean(left?.noiseSuppression) === Boolean(right?.noiseSuppression) &&
    Boolean(left?.autoGainControl) === Boolean(right?.autoGainControl)
  );
}

function normalizeGetUserMediaDeviceId(deviceId) {
  return typeof deviceId === "string" && deviceId !== "default"
    ? deviceId
    : null;
}

function isDefaultAudioInputDeviceId(deviceId) {
  return deviceId == null || deviceId === "default";
}

function buildLiveConstraints(deviceId, liveInputSettings) {
  const exactDeviceId = normalizeGetUserMediaDeviceId(deviceId);
  return {
    ...(exactDeviceId ? { deviceId: { exact: exactDeviceId } } : {}),
    ...cloneLiveInputSettings(liveInputSettings),
  };
}

function buildSystemConstraints(deviceId) {
  const exactDeviceId = normalizeGetUserMediaDeviceId(deviceId);
  return {
    ...(exactDeviceId ? { deviceId: { exact: exactDeviceId } } : {}),
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
}

function buildLiveInputConstraints(
  liveInputDeviceKind,
  deviceId,
  liveInputSettings,
) {
  return isLoopbackLiveInputDeviceKind(liveInputDeviceKind)
    ? buildSystemConstraints(deviceId)
    : buildLiveConstraints(deviceId, liveInputSettings);
}

function normalizeAudioDeviceLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAudioDeviceLabelKey(value) {
  return normalizeAudioDeviceLabel(value).toLowerCase();
}

function normalizeAudioInputMode(mode) {
  return mode === "file" ||
    mode === "live" ||
    mode === "system" ||
    mode === "stopped"
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

function createAnalysisTap(audioCtx, sourceNode, fftSize) {
  const reader = createNodeAnalyser(audioCtx, sourceNode, fftSize);
  return {
    reader,
    analyserNode: reader.analyser,
  };
}

function createSynchronizedAnalysisTaps(
  audioCtx,
  sourceNode,
  structuralFftSize,
) {
  return {
    fast: createAnalysisTap(audioCtx, sourceNode, FAST_ANALYSIS_FFT_SIZE),
    structural: createAnalysisTap(audioCtx, sourceNode, structuralFftSize),
  };
}

function getAnalysisSource(status) {
  if (status.hasPlaybackAnalysisSource && status.sourceKind !== "live") {
    return "file";
  }
  if (status.isLiveInputActive) {
    return isLoopbackLiveInputDeviceKind(
      status.liveInputDeviceKind ?? status.liveInputKind,
    )
      ? "file"
      : "live";
  }
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
    setLiveInputSettings: (settings) => instance.setLiveInputSettings(settings),
    setLiveInputAnalysisSettings: (settings) =>
      instance.setLiveInputAnalysisSettings(settings),
    startLiveInputStream: (deviceId, liveInputKind) =>
      instance.startLiveInputStream(deviceId, liveInputKind),
    stopLiveInputStream: () => instance.stopLiveInputStream(),
    setAudioEndedCallback: (cb) => instance.setAudioEndedCallback(cb),
    getIsAudioLoaded: () => instance.getIsAudioLoaded(),
    getAnalysisState: () => instance.getAnalysisState(),
    getStatus: () => instance.getStatus(),
    getLiveInputSettings: () => instance.getLiveInputSettings(),
    getLiveInputAnalysisSettings: () => instance.getLiveInputAnalysisSettings(),
    readClockSnapshot: (elapsedTime) => instance.readClockSnapshot(elapsedTime),
    readFeatureAnalysisCapture: (options) =>
      instance.readFeatureAnalysisCapture(options),
    disposeAudio: () => instance.dispose(),
  };
}

function getAudioContextCtor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
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

function cloneLiveInputInterruptionDiagnostics(diagnostics) {
  return diagnostics ? { ...diagnostics } : null;
}

function cloneTrackRecord(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (Array.isArray(entry)) {
        return [key, [...entry]];
      }
      if (entry && typeof entry === "object") {
        return [key, { ...entry }];
      }
      return [key, entry];
    }),
  );
}

function readTrackMethodRecord(track, methodName) {
  try {
    const method = track?.[methodName];
    return typeof method === "function"
      ? cloneTrackRecord(method.call(track))
      : {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildLiveInputTrackDiagnostics(track, stream) {
  if (!track) {
    return {
      present: false,
      streamActive: Boolean(stream?.active),
      id: null,
      label: "",
      kind: null,
      enabled: null,
      muted: null,
      readyState: null,
      settings: {},
      constraints: {},
      capabilities: {},
    };
  }

  return {
    present: true,
    streamActive: Boolean(stream?.active),
    id: typeof track.id === "string" ? track.id : null,
    label: typeof track.label === "string" ? track.label : "",
    kind: typeof track.kind === "string" ? track.kind : null,
    enabled: typeof track.enabled === "boolean" ? track.enabled : null,
    muted: typeof track.muted === "boolean" ? track.muted : null,
    readyState: typeof track.readyState === "string" ? track.readyState : null,
    settings: readTrackMethodRecord(track, "getSettings"),
    constraints: readTrackMethodRecord(track, "getConstraints"),
    capabilities: readTrackMethodRecord(track, "getCapabilities"),
  };
}

export function createAudioSession() {
  const state = {
    fftSize: DEFAULT_FFT_SIZE,
    capacity: AUDIO_SLOT_CAPACITY,
    pitchSourceMode: "spectral",
    audioInputMode: "idle",
    audioCtx: null,
    playbackOutputGain: null,
    playbackAnalyser: null,
    activeAnalysisTaps: null,
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
    liveInputAnalyser: null,
    liveInputNode: null,
    gumStream: null,
    liveInputSettings: normalizeLiveInputSettings(),
    appliedLiveInputSettings: normalizeLiveInputSettings(),
    liveInputAnalysisSettings: normalizeLiveInputAnalysisSettings(),
    selectedLiveInputDeviceId: null,
    selectedLiveInputDeviceLabel: "",
    liveInputKind: null,
    liveInputCalibrationVersion: 0,
    liveInputSessionId: null,
    lastLiveInputInterruption: null,
    liveInputTrackListeners: null,
    liveInputMuteTimeoutId: null,
    liveInputContextTimeoutId: null,
    volume: 1,
    muted: false,
    sourceMetadata: {
      label: "",
      sourceKind: "idle",
    },
    playbackSourceSessionId: null,
    playbackSessionId: null,
    lastPlaybackEndReason: null,
    lastPlaybackDiagnostics: null,
    activePlaybackDiagnostics: null,
    audioContextState: "uninitialized",
    audioContextStateListenerAttached: false,
  };

  let isAudioLoaded = false;
  let endedCallback = null;
  let activeLiveInputSettingsSync = null;
  let nextPlaybackSourceSessionId = 0;
  let nextPlaybackSessionId = 0;
  let nextLiveInputSessionId = 0;
  let playbackLoadRequestId = 0;
  let liveInputStartRequestId = 0;
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

  function getResolvedLiveInputAnalysisClass() {
    return resolveLiveInputAnalysisClass({
      liveInputKind: state.liveInputKind,
      selectedDeviceId: state.selectedLiveInputDeviceId,
      selectedDeviceLabel: state.selectedLiveInputDeviceLabel,
      analysisClass: state.liveInputAnalysisSettings.analysisClass,
      overrides: state.liveInputAnalysisSettings.overrides,
    });
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

    if (state.audioInputMode !== "live" && state.audioInputMode !== "system") {
      return;
    }

    if (nextState === "closed" || nextState === "interrupted") {
      recoverInterruptedLiveInput("audio-context-interrupted");
      return;
    }

    if (nextState === "suspended") {
      const sessionId = state.liveInputSessionId;
      clearLiveInputContextTimeout();
      state.liveInputContextTimeoutId = globalThis.setTimeout?.(() => {
        if (
          state.liveInputSessionId === sessionId &&
          (state.audioInputMode === "live" || state.audioInputMode === "system")
        ) {
          recoverInterruptedLiveInput("audio-context-interrupted");
        }
      }, LIVE_INPUT_INTERRUPTION_CONTEXT_TIMEOUT_MS);
      return;
    }

    clearLiveInputContextTimeout();
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
    if (!state.playbackOutputGain) {
      state.playbackOutputGain = audioCtx.createGain();
      state.playbackOutputGain.connect(audioCtx.destination);
    }

    state.playbackOutputGain.gain.value = getEffectiveVolume();
  }

  /**
   * Route the audible playback graph into a MediaStream for recording.
   * The tap sits on `playbackOutputGain`, so captured audio matches what the
   * listener hears (volume and mute included). Live-input audio is analysis
   * only and never app-audible, so it is intentionally not routed here.
   *
   * @returns {{ stream: MediaStream, stop: () => void } | null}
   */
  function createCaptureStream() {
    if (!getAudioContextCtor()) {
      return null;
    }

    ensurePlaybackAudioGraph();
    const audioCtx = state.audioCtx;
    if (typeof audioCtx?.createMediaStreamDestination !== "function") {
      return null;
    }

    const captureDestination = audioCtx.createMediaStreamDestination();
    const capturedOutputGain = state.playbackOutputGain;
    capturedOutputGain.connect(captureDestination);
    return {
      stream: captureDestination.stream,
      stop() {
        disconnectAudioNode(capturedOutputGain, captureDestination);
        for (const track of captureDestination.stream?.getTracks?.() ?? []) {
          track.stop?.();
        }
      },
    };
  }

  function clearActiveAnalysisTap() {
    disconnectAudioNode(state.activeAnalysisTaps?.fast?.analyserNode);
    disconnectAudioNode(state.activeAnalysisTaps?.structural?.analyserNode);
    state.activeAnalysisTaps = null;
    state.playbackAnalyser = null;
    state.liveInputAnalyser = null;
    state.analyser = null;
  }

  function clearLiveInputMuteTimeout() {
    if (state.liveInputMuteTimeoutId != null) {
      globalThis.clearTimeout?.(state.liveInputMuteTimeoutId);
      state.liveInputMuteTimeoutId = null;
    }
  }

  function clearLiveInputContextTimeout() {
    if (state.liveInputContextTimeoutId != null) {
      globalThis.clearTimeout?.(state.liveInputContextTimeoutId);
      state.liveInputContextTimeoutId = null;
    }
  }

  function getActiveLiveInputTrack() {
    return state.gumStream?.getAudioTracks?.()?.[0] ?? null;
  }

  function detachLiveInputTrackListeners() {
    const listeners = state.liveInputTrackListeners;
    if (!listeners?.track) {
      state.liveInputTrackListeners = null;
      return;
    }

    listeners.track.removeEventListener?.("ended", listeners.handleEnded);
    listeners.track.removeEventListener?.("mute", listeners.handleMute);
    listeners.track.removeEventListener?.("unmute", listeners.handleUnmute);
    state.liveInputTrackListeners = null;
  }

  function clearLiveInputRuntimeState({ stopTracks = true } = {}) {
    liveInputStartRequestId += 1;
    clearLiveInputMuteTimeout();
    clearLiveInputContextTimeout();
    detachLiveInputTrackListeners();

    if (stopTracks && state.gumStream) {
      state.gumStream.getAudioTracks().forEach((track) => track.stop());
    }

    activeLiveInputSettingsSync = null;
    disconnectAudioNode(state.liveInputNode);

    state.liveInputAnalyser = null;
    state.liveInputNode = null;
    state.gumStream = null;
    state.selectedLiveInputDeviceId = null;
    state.selectedLiveInputDeviceLabel = "";
    state.liveInputKind = null;
    state.liveInputSessionId = null;

    if (state.audioInputMode === "live" || state.audioInputMode === "system") {
      setAudioInputMode("idle");
    }
    clearActiveAnalysisTap();
  }

  function recoverInterruptedLiveInput(reason) {
    if (state.audioInputMode !== "live" && state.audioInputMode !== "system") {
      return;
    }

    const track = getActiveLiveInputTrack();
    const diagnostics = {
      reason,
      sessionId: state.liveInputSessionId,
      deviceId: state.selectedLiveInputDeviceId,
      deviceLabel: state.selectedLiveInputDeviceLabel,
      liveInputKind: state.liveInputKind,
      audioContextState: state.audioCtx?.state ?? state.audioContextState,
      trackMuted: Boolean(track?.muted),
      atWallTimeMs: getTimingNowMs(),
    };

    clearLiveInputRuntimeState({ stopTracks: reason !== "track-ended" });
    state.lastLiveInputInterruption = diagnostics;
  }

  function attachLiveInputTrackListeners(track, sessionId) {
    if (!track?.addEventListener) {
      return;
    }

    const handleEnded = () => {
      if (state.liveInputSessionId === sessionId) {
        recoverInterruptedLiveInput("track-ended");
      }
    };
    const handleMute = () => {
      if (state.liveInputSessionId !== sessionId) {
        return;
      }
      clearLiveInputMuteTimeout();
      state.liveInputMuteTimeoutId = globalThis.setTimeout?.(() => {
        if (
          state.liveInputSessionId === sessionId &&
          getActiveLiveInputTrack()?.muted === true
        ) {
          recoverInterruptedLiveInput("track-muted-timeout");
        }
      }, LIVE_INPUT_INTERRUPTION_MUTE_TIMEOUT_MS);
    };
    const handleUnmute = () => {
      if (state.liveInputSessionId === sessionId) {
        clearLiveInputMuteTimeout();
      }
    };

    track.addEventListener("ended", handleEnded);
    track.addEventListener("mute", handleMute);
    track.addEventListener("unmute", handleUnmute);
    state.liveInputTrackListeners = {
      track,
      handleEnded,
      handleMute,
      handleUnmute,
    };
  }

  function replaceActiveAnalysisTap(taps, targetKind) {
    clearActiveAnalysisTap();
    state.activeAnalysisTaps = taps;
    state.analyser = taps.structural.reader;
    if (targetKind === "live") {
      state.liveInputAnalyser = taps.structural.reader;
    } else {
      state.playbackAnalyser = taps.structural.reader;
    }
    return taps.structural.reader;
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
    clearActiveAnalysisTap();
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
    clearActiveAnalysisTap();
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
    replaceActiveAnalysisTap(
      createSynchronizedAnalysisTaps(audioCtx, sourceNode, state.fftSize),
      "playback",
    );
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
    playbackLoadRequestId += 1;
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
    state.playbackSourceSessionId = null;
    state.playbackSessionId = null;
    state.activePlaybackDiagnostics = null;
    if (state.audioInputMode !== "live") {
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
      clearActiveAnalysisTap();
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
    const hasActivePlaybackSource = Boolean(
      state.activeBufferSource || isStreamSourcePlaying(),
    );
    const hasPlaybackAnalysisSource = Boolean(
      state.playbackAnalyser && hasActivePlaybackSource,
    );
    const isPlaying = hasActivePlaybackSource;
    const isLiveInputActive = Boolean(
      state.gumStream?.active && state.liveInputAnalyser,
    );
    const isPlaybackPaused = Boolean(
      isAudioLoaded &&
      !isPlaying &&
      !isLiveInputActive &&
      state.audioInputMode === "idle" &&
      state.playbackOffsetSeconds > 0 &&
      state.lastPlaybackEndReason == null,
    );
    const liveInputTrack = getActiveLiveInputTrack();
    const liveInputDeviceKind = isLiveInputActive
      ? normalizeLiveInputDeviceKind(state.liveInputKind)
      : null;
    const sourceKind = isLiveInputActive
      ? isLoopbackLiveInputDeviceKind(liveInputDeviceKind)
        ? "system"
        : "live"
      : state.loadedPlaybackSourceKind === "stream"
        ? state.sourceMetadata.sourceKind || "stream"
        : state.loadedPlaybackSourceKind === "file"
          ? "file"
          : "idle";
    const analysisSource = getAnalysisSource({
      hasPlaybackAnalysisSource,
      isLiveInputActive,
      liveInputKind: liveInputDeviceKind,
      liveInputDeviceKind,
      sourceKind,
    });

    return {
      audioInputMode: state.audioInputMode,
      analysisSource,
      pitchSourceMode: state.pitchSourceMode,
      fastFftSize: FAST_ANALYSIS_FFT_SIZE,
      fftSize: state.fftSize,
      capacity: state.capacity,
      sampleRate: state.audioCtx?.sampleRate ?? DEFAULT_SAMPLE_RATE,
      isAudioLoaded,
      isPlaying,
      isPlaybackPaused,
      isLiveInputActive,
      hasPlaybackAnalysisSource,
      hasAnalysisSource: analysisSource !== "idle",
      workerStatus: null,
      volume: state.volume,
      muted: state.muted,
      liveInputSettings: cloneLiveInputSettings(state.liveInputSettings),
      liveInputAnalysisClass:
        state.liveInputAnalysisSettings.analysisClass ??
        DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
      liveInputAcousticIntent:
        state.liveInputAnalysisSettings.acousticIntent ??
        AUDIO_DEFAULTS.liveInputAcousticIntent,
      resolvedLiveInputAnalysisClass: isLiveInputActive
        ? getResolvedLiveInputAnalysisClass()
        : null,
      liveInputKind: liveInputDeviceKind,
      liveInputDeviceKind,
      liveInputCalibrationVersion: state.liveInputCalibrationVersion,
      liveInputSessionId: state.liveInputSessionId,
      selectedLiveInputDeviceId: state.selectedLiveInputDeviceId,
      selectedLiveInputDeviceLabel: state.selectedLiveInputDeviceLabel,
      liveInputTrack: buildLiveInputTrackDiagnostics(
        liveInputTrack,
        state.gumStream,
      ),
      sourceKind,
      sourceLabel: state.sourceMetadata.label || "",
      playbackSourceSessionId: state.playbackSourceSessionId,
      playbackSessionId:
        state.playbackSessionId ??
        state.lastPlaybackDiagnostics?.playbackSessionId ??
        null,
      lastPlaybackEndReason: state.lastPlaybackEndReason,
      lastPlaybackDiagnostics: getPlaybackDiagnosticsSnapshot(),
      lastLiveInputInterruption: cloneLiveInputInterruptionDiagnostics(
        state.lastLiveInputInterruption,
      ),
    };
  }

  function getTransportState() {
    const durationSeconds = normalizeDurationSeconds(
      state.playbackDurationSeconds,
    );
    const currentTimeSeconds = clampPlaybackTime(getCurrentPlaybackTime());
    const canSeek =
      isAudioLoaded &&
      !(state.gumStream?.active && state.liveInputAnalyser) &&
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
      liveInputAnalysisClass:
        status.liveInputAnalysisClass ?? DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
      liveInputAcousticIntent:
        status.liveInputAcousticIntent ??
        AUDIO_DEFAULTS.liveInputAcousticIntent,
      resolvedLiveInputAnalysisClass:
        status.resolvedLiveInputAnalysisClass ?? null,
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

    if (status.isLiveInputActive) {
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
      stopLiveInputStream();
    }

    stopPlayback({ resetOffset: true });
    clearLoadedPlaybackState();
    const requestId = ++playbackLoadRequestId;
    setAudioInputMode("file");

    try {
      const response = await fetch(url);
      if (requestId !== playbackLoadRequestId) {
        return false;
      }
      if (!response.ok) {
        throw new Error(`Failed to load audio: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (requestId !== playbackLoadRequestId) {
        return false;
      }
      const decodedBuffer =
        await ensureAudioContext().decodeAudioData(arrayBuffer);
      if (requestId !== playbackLoadRequestId) {
        return false;
      }
      state.decodedBuffer = decodedBuffer;
      state.loadedPlaybackSourceKind = "file";
      state.playbackDurationSeconds = normalizeDurationSeconds(
        decodedBuffer.duration,
      );
      state.sourceMetadata = {
        label: "",
        sourceKind: "file",
      };
      state.playbackSourceSessionId = ++nextPlaybackSourceSessionId;
      resetPlaybackPosition();
      applyOutputVolume();
      isAudioLoaded = true;
      return true;
    } catch (error) {
      if (requestId !== playbackLoadRequestId) {
        return false;
      }
      setAudioInputMode("idle");
      throw error;
    }
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
      stopLiveInputStream();
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
    state.playbackSourceSessionId = ++nextPlaybackSourceSessionId;
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
      stopLiveInputStream();
    }

    const audioCtx = ensureAudioContext();
    ensurePlaybackAudioGraph();

    if (audioCtx.state !== "running") {
      await maybeResumeAudioContext("start-buffer-playback");
    }

    const source = audioCtx.createBufferSource();
    source.buffer = state.decodedBuffer;
    replaceActiveAnalysisTap(
      createSynchronizedAnalysisTaps(audioCtx, source, state.fftSize),
      "playback",
    );
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

  async function startStreamPlayback(element) {
    if (!element) {
      return false;
    }

    const streamAudioCtx = ensureAudioContext();
    ensurePlaybackAudioGraph();

    if (streamAudioCtx.state !== "running") {
      await maybeResumeAudioContext("stream-playback");
    }

    if (
      state.playbackDurationSeconds > 0 &&
      getMediaElementPlaybackTime(element) >= state.playbackDurationSeconds
    ) {
      setMediaElementTime(element, 0);
    }

    await element.play();

    const offsetSeconds = clampPlaybackTime(
      getMediaElementPlaybackTime(element),
    );
    state.playbackStartedAtSeconds = streamAudioCtx.currentTime;
    state.playbackSessionId = ++nextPlaybackSessionId;
    state.lastPlaybackEndReason = null;
    state.activePlaybackDiagnostics = {
      playbackSessionId: state.playbackSessionId,
      sourceKind: state.sourceMetadata.sourceKind || "stream",
      startedAtContextTimeSeconds: streamAudioCtx.currentTime,
      startedAtWallTimeMs: getTimingNowMs(),
      offsetSeconds,
      durationSeconds: normalizeDurationSeconds(state.playbackDurationSeconds),
      expectedRemainingDurationSeconds: Math.max(
        0,
        state.playbackDurationSeconds - offsetSeconds,
      ),
      expectedEndTimeSeconds:
        streamAudioCtx.currentTime +
        Math.max(0, state.playbackDurationSeconds - offsetSeconds),
      audioContextStateAtStart: streamAudioCtx.state,
      latestAudioContextState: streamAudioCtx.state,
      contextStateTransitions: [],
      lastContextStateChange: null,
      lastResumeAttempt: null,
    };
    state.lastPlaybackDiagnostics = clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics,
    );
    setAudioInputMode("file");
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
      return startStreamPlayback(state.mediaElement);
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

  async function applyLiveInputSettingsToActiveStream(targetSettings) {
    const track = state.gumStream?.getAudioTracks?.()?.[0];
    const resolvedLiveInputDeviceKind = normalizeLiveInputDeviceKind(
      state.liveInputKind,
    );

    if (isLoopbackLiveInputDeviceKind(resolvedLiveInputDeviceKind)) {
      state.appliedLiveInputSettings = cloneLiveInputSettings(targetSettings);
      return cloneLiveInputSettings(state.appliedLiveInputSettings);
    }

    if (!track) {
      state.appliedLiveInputSettings = cloneLiveInputSettings(targetSettings);
      return cloneLiveInputSettings(state.appliedLiveInputSettings);
    }

    if (typeof track.applyConstraints === "function") {
      await track.applyConstraints(buildLiveConstraints(null, targetSettings));
      state.appliedLiveInputSettings = cloneLiveInputSettings(targetSettings);
      return cloneLiveInputSettings(state.appliedLiveInputSettings);
    }

    const selectedDeviceId = state.selectedLiveInputDeviceId;
    stopLiveInputStream();
    await startLiveInputStream(selectedDeviceId, resolvedLiveInputDeviceKind);
    state.appliedLiveInputSettings = cloneLiveInputSettings(
      state.liveInputSettings,
    );
    return cloneLiveInputSettings(state.appliedLiveInputSettings);
  }

  async function setLiveInputSettings(nextSettings) {
    const normalized = normalizeLiveInputSettings(nextSettings);
    if (areLiveInputSettingsEqual(state.liveInputSettings, normalized)) {
      return cloneLiveInputSettings(state.liveInputSettings);
    }

    state.liveInputSettings = normalized;
    if (!state.gumStream?.active) {
      return cloneLiveInputSettings(state.liveInputSettings);
    }

    while (
      state.gumStream?.active &&
      !areLiveInputSettingsEqual(
        state.appliedLiveInputSettings,
        state.liveInputSettings,
      )
    ) {
      if (activeLiveInputSettingsSync) {
        await activeLiveInputSettingsSync;
        continue;
      }

      const targetSettings = cloneLiveInputSettings(state.liveInputSettings);
      activeLiveInputSettingsSync =
        applyLiveInputSettingsToActiveStream(targetSettings);
      try {
        await activeLiveInputSettingsSync;
      } finally {
        activeLiveInputSettingsSync = null;
      }
    }

    return cloneLiveInputSettings(state.liveInputSettings);
  }

  function getLiveInputSettings() {
    return cloneLiveInputSettings(state.liveInputSettings);
  }

  function getLiveInputAnalysisSettings() {
    return cloneLiveInputAnalysisSettings(state.liveInputAnalysisSettings);
  }

  function setLiveInputAnalysisSettings(nextSettings) {
    const normalized = normalizeLiveInputAnalysisSettings(
      nextSettings,
      state.liveInputAnalysisSettings,
    );
    if (
      areLiveInputAnalysisSettingsEqual(
        state.liveInputAnalysisSettings,
        normalized,
      )
    ) {
      return cloneLiveInputAnalysisSettings(state.liveInputAnalysisSettings);
    }

    state.liveInputAnalysisSettings = normalized;
    if (
      state.gumStream?.active &&
      normalizeLiveInputDeviceKind(state.liveInputKind) ===
        LIVE_INPUT_DEVICE_KINDS.acousticMic
    ) {
      state.liveInputCalibrationVersion += 1;
    }
    return cloneLiveInputAnalysisSettings(state.liveInputAnalysisSettings);
  }

  /**
   * @param {string | null | undefined} deviceId
   * @param {import("./inputDeviceSemantics.js").LiveInputDeviceKind} [liveInputKind]
   * @param {string | null | undefined} [deviceLabel]
   */
  async function startLiveInputStream(
    deviceId,
    liveInputKind = LIVE_INPUT_DEVICE_KINDS.acousticMic,
    deviceLabel = null,
  ) {
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

    const requestId = ++liveInputStartRequestId;

    const resolvedLiveInputDeviceKind =
      normalizeLiveInputDeviceKind(liveInputKind);
    let resolvedDeviceId = deviceId ?? null;
    if (
      !isDefaultAudioInputDeviceId(resolvedDeviceId) &&
      typeof navigator.mediaDevices?.enumerateDevices === "function"
    ) {
      try {
        const availableAudioInputs = (
          await navigator.mediaDevices.enumerateDevices()
        ).filter((device) => device?.kind === "audioinput");
        if (requestId !== liveInputStartRequestId) {
          return false;
        }
        const hasExactDeviceId =
          resolvedDeviceId == null
            ? true
            : availableAudioInputs.some(
                (device) => device?.deviceId === resolvedDeviceId,
              );
        if (!hasExactDeviceId) {
          const requestedLabelKey = normalizeAudioDeviceLabelKey(deviceLabel);
          if (requestedLabelKey) {
            const matchingDevice = availableAudioInputs.find(
              (device) =>
                normalizeAudioDeviceLabelKey(device?.label) ===
                requestedLabelKey,
            );
            resolvedDeviceId = matchingDevice?.deviceId ?? resolvedDeviceId;
          }
        }
      } catch {
        // Preserve the requested device id if local enumeration is unavailable.
      }
    }
    const constraints = {
      audio: buildLiveInputConstraints(
        resolvedLiveInputDeviceKind,
        resolvedDeviceId,
        state.liveInputSettings,
      ),
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      if (requestId !== liveInputStartRequestId) {
        return false;
      }
      throw error;
    }
    if (requestId !== liveInputStartRequestId) {
      const tracks = stream.getTracks?.() ?? stream.getAudioTracks?.() ?? [];
      tracks.forEach((track) => track.stop?.());
      return false;
    }
    detachLiveInputTrackListeners();
    clearLiveInputMuteTimeout();
    clearLiveInputContextTimeout();
    const liveInputSessionId = ++nextLiveInputSessionId;
    state.gumStream = stream;
    state.selectedLiveInputDeviceId = resolvedDeviceId ?? null;
    state.liveInputKind = resolvedLiveInputDeviceKind;
    state.selectedLiveInputDeviceLabel =
      stream.getAudioTracks?.()?.[0]?.label?.trim?.() ?? "";
    state.liveInputSessionId = liveInputSessionId;
    state.lastLiveInputInterruption = null;
    attachLiveInputTrackListeners(
      stream.getAudioTracks?.()?.[0] ?? null,
      liveInputSessionId,
    );
    if (resolvedLiveInputDeviceKind === LIVE_INPUT_DEVICE_KINDS.acousticMic) {
      state.liveInputCalibrationVersion += 1;
    }
    state.appliedLiveInputSettings = cloneLiveInputSettings(
      state.liveInputSettings,
    );

    const audioCtx = ensureAudioContext();
    state.liveInputNode = audioCtx.createMediaStreamSource(state.gumStream);
    replaceActiveAnalysisTap(
      createSynchronizedAnalysisTaps(
        audioCtx,
        state.liveInputNode,
        state.fftSize,
      ),
      "live",
    );
    setAudioInputMode(resolvedLiveInputDeviceKind);
    if (audioCtx.state !== "running") {
      void maybeResumeAudioContext("start-mic-record").catch((error) => {
        console.warn("Audio context resume skipped during live-input start:", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return true;
  }

  function stopLiveInputStream() {
    clearLiveInputRuntimeState();
  }

  function resolveAnalysisSourceMode(status) {
    if (status.analysisSource === "live") {
      return "live";
    }
    if (status.analysisSource !== "file") {
      return null;
    }
    const activeLiveInputDeviceKind =
      status.liveInputDeviceKind ?? status.liveInputKind;
    return isLoopbackLiveInputDeviceKind(activeLiveInputDeviceKind)
      ? "system"
      : state.loadedPlaybackSourceKind === "stream"
        ? "stream"
        : "file";
  }

  function readFeatureAnalysisCapture({ includeStructural = false } = {}) {
    const status = getStatus();
    const sourceMode = resolveAnalysisSourceMode(status);
    if (!sourceMode) {
      return null;
    }

    const captureTimestampMs = getTimingNowMs();
    return {
      captureTimestampMs,
      fast: {
        sourceMode,
        ...sampleAnalyser(state.activeAnalysisTaps?.fast?.reader),
      },
      structural: includeStructural
        ? {
            sourceMode,
            ...sampleAnalyser(state.activeAnalysisTaps?.structural?.reader),
          }
        : null,
    };
  }

  async function dispose() {
    const audioCtx = state.audioCtx;

    globalThis.removeEventListener?.("pagehide", handlePageUnload);

    // Ramp gain to zero before disconnecting to prevent an audio pop
    if (audioCtx?.state === "running" && state.playbackOutputGain?.gain) {
      const now = audioCtx.currentTime;
      const fadeSec = 0.06;
      state.playbackOutputGain.gain.cancelScheduledValues(now);
      state.playbackOutputGain.gain.setValueAtTime(
        state.playbackOutputGain.gain.value,
        now,
      );
      state.playbackOutputGain.gain.linearRampToValueAtTime(0, now + fadeSec);
      await new Promise((resolve) => setTimeout(resolve, fadeSec * 1000 + 10));
    }

    stopAudio();
    stopLiveInputStream();
    endedCallback = null;

    releaseStreamBinding({ clearElement: true });
    disconnectAudioNode(state.playbackOutputGain);
    state.playbackOutputGain = null;
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

  // Synchronous pagehide guard: zero the gain immediately so a hard browser
  // refresh or tab close can't produce an audio pop before the OS cuts the stream.
  function handlePageUnload() {
    if (state.playbackOutputGain?.gain) {
      state.playbackOutputGain.gain.cancelScheduledValues(0);
      state.playbackOutputGain.gain.value = 0;
    }
    state.audioCtx?.suspend();
  }

  globalThis.addEventListener?.("pagehide", handlePageUnload);

  return {
    attach,
    loadAudio,
    loadStream,
    playPauseAudio,
    stopAudio,
    createCaptureStream,
    setVolume,
    setMuted,
    setLiveInputSettings,
    setLiveInputAnalysisSettings,
    startLiveInputStream,
    stopLiveInputStream,
    setAudioEndedCallback,
    getIsAudioLoaded: () => isAudioLoaded,
    getAnalysisState,
    getStatus,
    getTransportState,
    getLiveInputSettings,
    getLiveInputAnalysisSettings,
    readClockSnapshot,
    readFeatureAnalysisCapture,
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
export const { setLiveInputSettings } = defaultBindings;
export const { startLiveInputStream } = defaultBindings;
export const { stopLiveInputStream } = defaultBindings;
export const { setAudioEndedCallback } = defaultBindings;
export const { getIsAudioLoaded } = defaultBindings;
export const { getAnalysisState } = defaultBindings;
export const { getStatus } = defaultBindings;
export const { getLiveInputSettings } = defaultBindings;
export const { getLiveInputAnalysisSettings } = defaultBindings;
export const { readClockSnapshot } = defaultBindings;
export const { readFeatureAnalysisCapture } = defaultBindings;
export const { disposeAudio } = defaultBindings;
