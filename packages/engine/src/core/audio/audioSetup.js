import {
  AUDIO_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
} from "../../defaults.js";
import { createNodeAnalyser, sampleAnalyser } from "./analyserSampler.js";
import {
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  areLiveInputAnalysisSettingsEqual,
  normalizeLiveInputAnalysisSettings,
  resolveLiveInputAnalysisClass,
} from "./liveInputAnalysis.js";
import {
  LIVE_INPUT_DEVICE_KINDS,
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "./inputDeviceSemantics.js";
import {
  areLiveInputCaptureSettingsEqual,
  buildAcousticLiveInputConstraints,
  buildLiveInputConstraints,
  cloneLiveInputCaptureSettings,
  isDefaultAudioInputDeviceId,
  normalizeAudioDeviceLabelKey,
  normalizeLiveInputCaptureSettings,
} from "./liveInputCapture.js";
import {
  buildLiveInputTrackDiagnostics,
  cloneLiveInputInterruptionDiagnostics,
  clonePlaybackDiagnostics,
} from "./audioSessionDiagnostics.js";
import { createDecodedAudioAnalysisSource } from "./decodedAudioAnalysis.js";
import {
  AUDIO_SOURCE_EVENTS,
  AUDIO_SOURCE_KINDS,
  AUDIO_SOURCE_PHASES,
  cloneAudioSourceSession,
  createAudioSourceSession,
  isPreparedFileAwaitingPlayback,
  reduceAudioSourceSession,
} from "./audioSourceSession.js";

export {
  AUDIO_SOURCE_KINDS,
  AUDIO_SOURCE_PHASES,
  isPreparedFileAwaitingPlayback,
};

const LIVE_INPUT_INTERRUPTION_MUTE_TIMEOUT_MS = 1500;
const LIVE_INPUT_INTERRUPTION_CONTEXT_TIMEOUT_MS = 1500;
const FAST_ANALYSIS_FFT_SIZE = 2048;
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

function disconnectAnalysisTaps(taps) {
  disconnectAudioNode(taps?.fast?.analyserNode);
  disconnectAudioNode(taps?.structural?.analyserNode);
}

function createSynchronizedAnalysisTaps(
  audioCtx,
  sourceNode,
  structuralFftSize,
) {
  const taps = {};
  try {
    taps.fast = createAnalysisTap(audioCtx, sourceNode, FAST_ANALYSIS_FFT_SIZE);
    taps.structural = createAnalysisTap(
      audioCtx,
      sourceNode,
      structuralFftSize,
    );
    return taps;
  } catch (error) {
    disconnectAnalysisTaps(taps);
    throw error;
  }
}

function createLiveInputAnalysisGraph(audioCtx, stream, structuralFftSize) {
  const sourceNode = audioCtx.createMediaStreamSource(stream);
  try {
    return {
      sourceNode,
      analysisTaps: createSynchronizedAnalysisTaps(
        audioCtx,
        sourceNode,
        structuralFftSize,
      ),
    };
  } catch (error) {
    disconnectAudioNode(sourceNode);
    throw error;
  }
}

function releaseLiveInputAnalysisGraph(graph) {
  disconnectAnalysisTaps(graph?.analysisTaps);
  disconnectAudioNode(graph?.sourceNode);
}

function stopMediaStreamTracks(stream) {
  const tracks = stream?.getTracks?.() ?? stream?.getAudioTracks?.() ?? [];
  for (const track of tracks) {
    track.stop?.();
  }
}

function getAnalysisSource(status) {
  if (
    status.sourceSession.kind === AUDIO_SOURCE_KINDS.file &&
    (status.hasPlaybackAnalysisSource ||
      (status.hasPreparedFileAnalysisSource && status.isPlaying))
  ) {
    return "file";
  }
  if (
    status.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
    status.isLiveInputActive
  ) {
    return isLoopbackLiveInputDeviceKind(status.liveInputDeviceKind)
      ? "file"
      : "live";
  }
  return "idle";
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

export function createAudioSession() {
  const state = {
    fftSize: DEFAULT_FFT_SIZE,
    capacity: AUDIO_SLOT_CAPACITY,
    pitchSourceMode: "spectral",
    sourceSession: createAudioSourceSession(),
    cachedFileTimelineRevision: 0,
    audioCtx: null,
    playbackOutputGain: null,
    activeAnalysisTaps: null,
    decodedBuffer: null,
    decodedAnalysisSource: null,
    activeBufferSource: null,
    mediaElement: null,
    mediaElementSourceNode: null,
    mediaElementListeners: null,
    loadedPlaybackSourceKind: "none",
    playbackOffsetSeconds: 0,
    playbackStartedAtSeconds: 0,
    playbackDurationSeconds: 0,
    liveInputNode: null,
    gumStream: null,
    liveInputSettings: normalizeLiveInputCaptureSettings(),
    appliedLiveInputSettings: normalizeLiveInputCaptureSettings(),
    liveInputAnalysisSettings: normalizeLiveInputAnalysisSettings(),
    selectedLiveInputDeviceId: null,
    selectedLiveInputDeviceLabel: "",
    liveInputDeviceKind: null,
    liveInputCalibrationVersion: 0,
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
    playbackSessionId: null,
    lastPlaybackEndReason: null,
    lastPlaybackDiagnostics: null,
    activePlaybackDiagnostics: null,
    audioContextState: "uninitialized",
    audioContextStateListenerAttached: false,
  };

  let endedCallback = null;
  let activeLiveInputSettingsSync = null;
  let nextPlaybackSessionId = 0;
  const clockState = {
    mode: "realtime",
    previousElapsedTime: 0,
    lastKnownAudioTime: 0,
  };

  function transitionSource(event) {
    state.sourceSession = reduceAudioSourceSession(state.sourceSession, event);
    if (state.sourceSession.kind === AUDIO_SOURCE_KINDS.file) {
      state.cachedFileTimelineRevision = state.sourceSession.timelineRevision;
    }
    return state.sourceSession;
  }

  function beginSourceRequest(event, expectedPhase) {
    const sourceSession = transitionSource(event);
    return {
      kind: sourceSession.kind,
      phase: expectedPhase,
      sessionId: sourceSession.sessionId,
    };
  }

  function isCurrentSourceRequest(request) {
    return Boolean(
      request &&
      state.sourceSession.kind === request.kind &&
      state.sourceSession.phase === request.phase &&
      state.sourceSession.sessionId === request.sessionId,
    );
  }

  function failCurrentSystemRequest(request, reason) {
    if (!isCurrentSourceRequest(request)) {
      return false;
    }
    clearLiveInputRuntimeState();
    transitionSource({
      type: AUDIO_SOURCE_EVENTS.systemError,
      sessionId: request.sessionId,
      reason,
    });
    return true;
  }

  function currentSourceEvent(type, overrides = {}) {
    return {
      type,
      sessionId: state.sourceSession.sessionId,
      ...overrides,
    };
  }

  function getEffectiveVolume() {
    return state.muted ? 0 : state.volume;
  }

  function getResolvedLiveInputAnalysisClass() {
    return resolveLiveInputAnalysisClass({
      liveInputDeviceKind: state.liveInputDeviceKind,
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

  function beginPlaybackSession({ audioCtx, sourceKind, offsetSeconds }) {
    const startedAtContextTimeSeconds = audioCtx.currentTime;
    const durationSeconds = normalizeDurationSeconds(
      state.playbackDurationSeconds,
    );
    const expectedRemainingDurationSeconds = Math.max(
      0,
      durationSeconds - offsetSeconds,
    );

    state.playbackStartedAtSeconds = startedAtContextTimeSeconds;
    state.playbackSessionId = ++nextPlaybackSessionId;
    state.lastPlaybackEndReason = null;
    state.activePlaybackDiagnostics = {
      playbackSessionId: state.playbackSessionId,
      sourceKind,
      startedAtContextTimeSeconds,
      startedAtWallTimeMs: getTimingNowMs(),
      offsetSeconds,
      durationSeconds,
      expectedRemainingDurationSeconds,
      expectedEndTimeSeconds:
        startedAtContextTimeSeconds + expectedRemainingDurationSeconds,
      audioContextStateAtStart: audioCtx.state,
      latestAudioContextState: audioCtx.state,
      contextStateTransitions: [],
      lastContextStateChange: null,
      lastResumeAttempt: null,
    };
    state.lastPlaybackDiagnostics = clonePlaybackDiagnostics(
      state.activePlaybackDiagnostics,
    );
    transitionSource(currentSourceEvent(AUDIO_SOURCE_EVENTS.filePlayStarted));
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

    if (state.sourceSession.kind !== AUDIO_SOURCE_KINDS.system) {
      return;
    }

    if (nextState === "closed" || nextState === "interrupted") {
      recoverInterruptedLiveInput("audio-context-interrupted");
      return;
    }

    if (nextState === "suspended") {
      const sessionId = state.sourceSession.sessionId;
      clearLiveInputContextTimeout();
      state.liveInputContextTimeoutId = globalThis.setTimeout?.(() => {
        if (
          state.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
          state.sourceSession.sessionId === sessionId
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
    disconnectAnalysisTaps(state.activeAnalysisTaps);
    state.activeAnalysisTaps = null;
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
    clearLiveInputMuteTimeout();
    clearLiveInputContextTimeout();
    detachLiveInputTrackListeners();

    if (stopTracks) {
      stopMediaStreamTracks(state.gumStream);
    }

    activeLiveInputSettingsSync = null;
    disconnectAudioNode(state.liveInputNode);

    state.liveInputNode = null;
    state.gumStream = null;
    state.selectedLiveInputDeviceId = null;
    state.selectedLiveInputDeviceLabel = "";
    state.liveInputDeviceKind = null;
    clearActiveAnalysisTap();
  }

  function recoverInterruptedLiveInput(reason) {
    if (state.sourceSession.kind !== AUDIO_SOURCE_KINDS.system) {
      return;
    }

    const sessionId = state.sourceSession.sessionId;
    const track = getActiveLiveInputTrack();
    const diagnostics = {
      reason,
      sessionId,
      deviceId: state.selectedLiveInputDeviceId,
      deviceLabel: state.selectedLiveInputDeviceLabel,
      liveInputDeviceKind: state.liveInputDeviceKind,
      audioContextState: state.audioCtx?.state ?? state.audioContextState,
      trackMuted: Boolean(track?.muted),
      atWallTimeMs: getTimingNowMs(),
    };

    clearLiveInputRuntimeState({ stopTracks: reason !== "track-ended" });
    state.lastLiveInputInterruption = diagnostics;
    transitionSource(
      currentSourceEvent(AUDIO_SOURCE_EVENTS.systemError, { reason }),
    );
  }

  function attachLiveInputTrackListeners(track, sessionId) {
    if (!track?.addEventListener) {
      return;
    }

    const handleEnded = () => {
      if (
        state.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
        state.sourceSession.sessionId === sessionId
      ) {
        recoverInterruptedLiveInput("track-ended");
      }
    };
    const handleMute = () => {
      if (
        state.sourceSession.kind !== AUDIO_SOURCE_KINDS.system ||
        state.sourceSession.sessionId !== sessionId
      ) {
        return;
      }
      clearLiveInputMuteTimeout();
      state.liveInputMuteTimeoutId = globalThis.setTimeout?.(() => {
        if (
          state.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
          state.sourceSession.sessionId === sessionId &&
          getActiveLiveInputTrack()?.muted === true
        ) {
          recoverInterruptedLiveInput("track-muted-timeout");
        }
      }, LIVE_INPUT_INTERRUPTION_MUTE_TIMEOUT_MS);
    };
    const handleUnmute = () => {
      if (
        state.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
        state.sourceSession.sessionId === sessionId
      ) {
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

  function hasActiveAnalysisTap(sourceKind) {
    return state.activeAnalysisTaps?.sourceKind === sourceKind;
  }

  function replaceActiveAnalysisTap(taps, sourceKind) {
    clearActiveAnalysisTap();
    state.activeAnalysisTaps = { ...taps, sourceKind };
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

  function hasLoadedPlaybackSource() {
    return state.loadedPlaybackSourceKind !== "none";
  }

  function hasLoadedBufferSource() {
    return (
      state.loadedPlaybackSourceKind === "file" && Boolean(state.decodedBuffer)
    );
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
    transitionSource(
      currentSourceEvent(AUDIO_SOURCE_EVENTS.fileEnded, {
        reason: "natural",
      }),
    );
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
    clearActiveBufferSource();
    if (state.mediaElement) {
      pauseMediaElement(state.mediaElement);
    }
    state.decodedBuffer = null;
    state.decodedAnalysisSource = null;
    state.loadedPlaybackSourceKind = "none";
    state.playbackDurationSeconds = 0;
    state.sourceMetadata = {
      label: "",
      sourceKind: "idle",
    };
    resetPlaybackPosition();
    state.playbackSessionId = null;
    state.activePlaybackDiagnostics = null;
  }

  function transitionPausedOrStoppedPlayback(stoppedMode, endReason) {
    if (state.sourceSession.kind !== AUDIO_SOURCE_KINDS.file) {
      return;
    }
    if (stoppedMode === "stopped" || endReason === "stopped") {
      transitionSource(
        currentSourceEvent(AUDIO_SOURCE_EVENTS.fileStopped, {
          reason: endReason ?? "stopped",
        }),
      );
      return;
    }
    transitionSource(currentSourceEvent(AUDIO_SOURCE_EVENTS.filePaused));
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

    transitionPausedOrStoppedPlayback(stoppedMode, endReason);
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

    transitionPausedOrStoppedPlayback(stoppedMode, endReason);
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

    transitionPausedOrStoppedPlayback(stoppedMode, endReason);
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
      transitionSource(
        currentSourceEvent(AUDIO_SOURCE_EVENTS.fileEnded, {
          reason: "natural",
        }),
      );
    } else {
      resetPlaybackPosition(playbackTime);
      transitionSource(currentSourceEvent(AUDIO_SOURCE_EVENTS.filePaused));
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
      hasActiveAnalysisTap("playback") && hasActivePlaybackSource,
    );
    const hasPreparedFileAnalysisSource = Boolean(
      state.loadedPlaybackSourceKind === "file" &&
      state.decodedBuffer &&
      state.decodedAnalysisSource,
    );
    const isPlaying = Boolean(
      state.sourceSession.kind === AUDIO_SOURCE_KINDS.file &&
      hasActivePlaybackSource,
    );
    const isLiveInputActive = Boolean(
      state.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
      state.sourceSession.phase === AUDIO_SOURCE_PHASES.active &&
      state.gumStream?.active &&
      hasActiveAnalysisTap("live"),
    );
    const isAudioLoaded = hasLoadedPlaybackSource();
    const isPlaybackPaused = Boolean(
      isAudioLoaded &&
      !isPlaying &&
      state.sourceSession.kind === AUDIO_SOURCE_KINDS.file &&
      state.sourceSession.phase === AUDIO_SOURCE_PHASES.paused &&
      state.lastPlaybackEndReason == null,
    );
    const liveInputTrack = getActiveLiveInputTrack();
    const liveInputDeviceKind = isLiveInputActive
      ? normalizeLiveInputDeviceKind(state.liveInputDeviceKind)
      : null;
    const sourceSession = cloneAudioSourceSession(state.sourceSession);
    const analysisSource = getAnalysisSource({
      hasPlaybackAnalysisSource,
      hasPreparedFileAnalysisSource,
      isPlaying,
      isLiveInputActive,
      liveInputDeviceKind,
      sourceKind: sourceSession.kind,
      sourceSession,
    });

    return {
      sourceSession,
      analysisSource,
      pitchSourceMode: state.pitchSourceMode,
      fastFftSize: FAST_ANALYSIS_FFT_SIZE,
      fftSize: state.fftSize,
      capacity: state.capacity,
      sampleRate:
        state.decodedBuffer?.sampleRate ??
        state.audioCtx?.sampleRate ??
        DEFAULT_SAMPLE_RATE,
      isAudioLoaded,
      isPlaying,
      isPlaybackPaused,
      isLiveInputActive,
      hasPlaybackAnalysisSource,
      hasPreparedFileAnalysisSource,
      hasAnalysisSource: analysisSource !== "idle",
      workerStatus: null,
      volume: state.volume,
      muted: state.muted,
      liveInputSettings: cloneLiveInputCaptureSettings(state.liveInputSettings),
      liveInputAnalysisClass:
        state.liveInputAnalysisSettings.analysisClass ??
        DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
      liveInputAcousticIntent:
        state.liveInputAnalysisSettings.acousticIntent ??
        AUDIO_DEFAULTS.liveInputAcousticIntent,
      resolvedLiveInputAnalysisClass: isLiveInputActive
        ? getResolvedLiveInputAnalysisClass()
        : null,
      liveInputDeviceKind,
      liveInputCalibrationVersion: state.liveInputCalibrationVersion,
      selectedLiveInputDeviceId: state.selectedLiveInputDeviceId,
      selectedLiveInputDeviceLabel: state.selectedLiveInputDeviceLabel,
      liveInputTrack: buildLiveInputTrackDiagnostics(
        liveInputTrack,
        state.gumStream,
      ),
      sourceLabel: state.sourceMetadata.label || "",
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
      hasLoadedPlaybackSource() &&
      !(state.gumStream?.active && hasActiveAnalysisTap("live")) &&
      durationSeconds > 0;

    return {
      currentTimeSeconds,
      durationSeconds,
      canSeek,
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
      status.sourceSession.kind === AUDIO_SOURCE_KINDS.file &&
      status.sourceSession.phase === AUDIO_SOURCE_PHASES.paused
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

  function setAudioEndedCallback(callback) {
    endedCallback = callback;
  }

  function getReturnedFilePhase() {
    if (!hasLoadedPlaybackSource()) {
      return AUDIO_SOURCE_PHASES.empty;
    }
    return AUDIO_SOURCE_PHASES.ready;
  }

  function selectSource(kind) {
    const nextKind =
      kind === AUDIO_SOURCE_KINDS.system
        ? AUDIO_SOURCE_KINDS.system
        : AUDIO_SOURCE_KINDS.file;
    if (state.sourceSession.kind === nextKind) {
      return cloneAudioSourceSession(state.sourceSession);
    }

    if (nextKind === AUDIO_SOURCE_KINDS.system) {
      if (state.activeBufferSource || isStreamSourcePlaying()) {
        stopPlayback({ resetOffset: false });
      }
      clearLiveInputRuntimeState();
      transitionSource({
        type: AUDIO_SOURCE_EVENTS.select,
        kind: AUDIO_SOURCE_KINDS.system,
        phase: AUDIO_SOURCE_PHASES.ready,
      });
    } else {
      clearLiveInputRuntimeState();
      transitionSource({
        type: AUDIO_SOURCE_EVENTS.select,
        kind: AUDIO_SOURCE_KINDS.file,
        phase: getReturnedFilePhase(),
        timelineRevision: state.cachedFileTimelineRevision,
      });
    }

    return cloneAudioSourceSession(state.sourceSession);
  }

  async function loadAudio(url) {
    ensurePlaybackAudioGraph();
    resetPlaybackDiagnostics();

    clearLiveInputRuntimeState();

    stopPlayback({ resetOffset: true });
    clearLoadedPlaybackState();
    const sourceRequest = beginSourceRequest(
      { type: AUDIO_SOURCE_EVENTS.fileLoadStarted },
      AUDIO_SOURCE_PHASES.loading,
    );

    try {
      const response = await fetch(url);
      if (!isCurrentSourceRequest(sourceRequest)) {
        return false;
      }
      if (!response.ok) {
        throw new Error(`Failed to load audio: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!isCurrentSourceRequest(sourceRequest)) {
        return false;
      }
      const decodedBuffer =
        await ensureAudioContext().decodeAudioData(arrayBuffer);
      if (!isCurrentSourceRequest(sourceRequest)) {
        return false;
      }
      state.decodedBuffer = decodedBuffer;
      state.decodedAnalysisSource = createDecodedAudioAnalysisSource(
        decodedBuffer,
        {
          fastFftSize: FAST_ANALYSIS_FFT_SIZE,
          structuralFftSize: state.fftSize,
        },
      );
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
      transitionSource(currentSourceEvent(AUDIO_SOURCE_EVENTS.fileLoadReady));
      return true;
    } catch (error) {
      if (!isCurrentSourceRequest(sourceRequest)) {
        return false;
      }
      transitionSource(
        currentSourceEvent(AUDIO_SOURCE_EVENTS.fileError, {
          reason: error instanceof Error ? error.message : "load-error",
        }),
      );
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

    clearLiveInputRuntimeState();

    stopPlayback({ resetOffset: true });
    clearLoadedPlaybackState();
    beginSourceRequest(
      { type: AUDIO_SOURCE_EVENTS.fileLoadStarted },
      AUDIO_SOURCE_PHASES.loading,
    );
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
    transitionSource(currentSourceEvent(AUDIO_SOURCE_EVENTS.fileLoadReady));
  }

  async function startBufferPlayback(
    offsetSeconds = state.playbackOffsetSeconds,
  ) {
    if (!hasLoadedBufferSource()) {
      return false;
    }

    if (state.sourceSession.kind !== AUDIO_SOURCE_KINDS.file) {
      selectSource(AUDIO_SOURCE_KINDS.file);
    }

    const audioCtx = ensureAudioContext();
    ensurePlaybackAudioGraph();

    if (audioCtx.state !== "running") {
      await maybeResumeAudioContext("start-buffer-playback");
    }

    const source = audioCtx.createBufferSource();
    source.buffer = state.decodedBuffer;
    source.connect(state.playbackOutputGain);
    source.onended = () => {
      handleBufferEnded(source);
    };

    const nextOffset = Math.min(
      clampPlaybackTime(offsetSeconds),
      Math.max(0, state.playbackDurationSeconds - 1e-4),
    );
    resetPlaybackPosition(nextOffset);
    beginPlaybackSession({
      audioCtx,
      sourceKind: "file",
      offsetSeconds: nextOffset,
    });
    state.activeBufferSource = source;
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
    beginPlaybackSession({
      audioCtx: streamAudioCtx,
      sourceKind: state.sourceMetadata.sourceKind || "stream",
      offsetSeconds,
    });
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

    if (state.sourceSession.kind !== AUDIO_SOURCE_KINDS.file) {
      selectSource(AUDIO_SOURCE_KINDS.file);
    }

    if (state.loadedPlaybackSourceKind === "stream" && state.mediaElement) {
      return startStreamPlayback(state.mediaElement);
    }

    if (!hasLoadedBufferSource()) {
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
    } else if (state.sourceSession.kind === AUDIO_SOURCE_KINDS.file) {
      finalizePlaybackDiagnostics("stopped", {
        endedAtContextTimeSeconds: state.audioCtx?.currentTime ?? 0,
        endedAtPlaybackTimeSeconds: 0,
      });
      transitionSource(
        currentSourceEvent(AUDIO_SOURCE_EVENTS.fileStopped, {
          reason: "stopped",
        }),
      );
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
      transitionSource(
        currentSourceEvent(AUDIO_SOURCE_EVENTS.fileTimelineChanged),
      );
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
    transitionSource(
      currentSourceEvent(AUDIO_SOURCE_EVENTS.fileTimelineChanged),
    );

    if (wasPlaying) {
      return startBufferPlayback(nextTimeSeconds);
    }

    if (state.sourceSession.kind === AUDIO_SOURCE_KINDS.file) {
      transitionSource(currentSourceEvent(AUDIO_SOURCE_EVENTS.filePaused));
    }

    return true;
  }

  async function applyLiveInputSettingsToActiveStream(targetSettings) {
    const track = state.gumStream?.getAudioTracks?.()?.[0];
    const resolvedLiveInputDeviceKind = normalizeLiveInputDeviceKind(
      state.liveInputDeviceKind,
    );

    if (isLoopbackLiveInputDeviceKind(resolvedLiveInputDeviceKind)) {
      state.appliedLiveInputSettings =
        cloneLiveInputCaptureSettings(targetSettings);
      return cloneLiveInputCaptureSettings(state.appliedLiveInputSettings);
    }

    if (!track) {
      state.appliedLiveInputSettings =
        cloneLiveInputCaptureSettings(targetSettings);
      return cloneLiveInputCaptureSettings(state.appliedLiveInputSettings);
    }

    if (typeof track.applyConstraints === "function") {
      await track.applyConstraints(
        buildAcousticLiveInputConstraints(null, targetSettings),
      );
      state.appliedLiveInputSettings =
        cloneLiveInputCaptureSettings(targetSettings);
      return cloneLiveInputCaptureSettings(state.appliedLiveInputSettings);
    }

    const selectedDeviceId = state.selectedLiveInputDeviceId;
    stopLiveInputStream();
    await startLiveInputStream(selectedDeviceId, resolvedLiveInputDeviceKind);
    state.appliedLiveInputSettings = cloneLiveInputCaptureSettings(
      state.liveInputSettings,
    );
    return cloneLiveInputCaptureSettings(state.appliedLiveInputSettings);
  }

  async function setLiveInputSettings(nextSettings) {
    const normalized = normalizeLiveInputCaptureSettings(nextSettings);
    if (areLiveInputCaptureSettingsEqual(state.liveInputSettings, normalized)) {
      return cloneLiveInputCaptureSettings(state.liveInputSettings);
    }

    state.liveInputSettings = normalized;
    if (!state.gumStream?.active) {
      return cloneLiveInputCaptureSettings(state.liveInputSettings);
    }

    while (
      state.gumStream?.active &&
      !areLiveInputCaptureSettingsEqual(
        state.appliedLiveInputSettings,
        state.liveInputSettings,
      )
    ) {
      if (activeLiveInputSettingsSync) {
        await activeLiveInputSettingsSync;
        continue;
      }

      const targetSettings = cloneLiveInputCaptureSettings(
        state.liveInputSettings,
      );
      activeLiveInputSettingsSync =
        applyLiveInputSettingsToActiveStream(targetSettings);
      try {
        await activeLiveInputSettingsSync;
      } finally {
        activeLiveInputSettingsSync = null;
      }
    }

    return cloneLiveInputCaptureSettings(state.liveInputSettings);
  }

  function getLiveInputSettings() {
    return cloneLiveInputCaptureSettings(state.liveInputSettings);
  }

  function getLiveInputAnalysisSettings() {
    return normalizeLiveInputAnalysisSettings(state.liveInputAnalysisSettings);
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
      return normalizeLiveInputAnalysisSettings(
        state.liveInputAnalysisSettings,
      );
    }

    state.liveInputAnalysisSettings = normalized;
    if (
      state.gumStream?.active &&
      normalizeLiveInputDeviceKind(state.liveInputDeviceKind) ===
        LIVE_INPUT_DEVICE_KINDS.acousticMic
    ) {
      state.liveInputCalibrationVersion += 1;
    }
    return normalizeLiveInputAnalysisSettings(state.liveInputAnalysisSettings);
  }

  function installLiveInputStream(
    stream,
    { deviceId, liveInputDeviceKind, sessionId },
  ) {
    const audioCtx = ensureAudioContext();
    let graph = null;

    try {
      graph = createLiveInputAnalysisGraph(audioCtx, stream, state.fftSize);
      const track = stream.getAudioTracks?.()?.[0] ?? null;

      if (
        state.sourceSession.kind !== AUDIO_SOURCE_KINDS.system ||
        state.sourceSession.phase !== AUDIO_SOURCE_PHASES.starting ||
        state.sourceSession.sessionId !== sessionId
      ) {
        releaseLiveInputAnalysisGraph(graph);
        stopMediaStreamTracks(stream);
        return null;
      }

      // Acquire and build the replacement before releasing the current input.
      // Once the replacement is known-good, this is the single cutover point
      // for stream, analysis-tap, and System capture ownership.
      clearLiveInputRuntimeState();
      state.gumStream = stream;
      state.liveInputNode = graph.sourceNode;
      state.selectedLiveInputDeviceId = deviceId ?? null;
      state.liveInputDeviceKind = liveInputDeviceKind;
      state.selectedLiveInputDeviceLabel = String(track?.label ?? "").trim();
      state.lastLiveInputInterruption = null;
      replaceActiveAnalysisTap(graph.analysisTaps, "live");
      attachLiveInputTrackListeners(track, sessionId);
      state.appliedLiveInputSettings = cloneLiveInputCaptureSettings(
        state.liveInputSettings,
      );
      transitionSource({
        type: AUDIO_SOURCE_EVENTS.systemActive,
        sessionId,
        capture: {
          deviceKind: liveInputDeviceKind,
          deviceId: deviceId ?? null,
          deviceLabel: state.selectedLiveInputDeviceLabel,
        },
      });
      if (liveInputDeviceKind === LIVE_INPUT_DEVICE_KINDS.acousticMic) {
        state.liveInputCalibrationVersion += 1;
      }
      return audioCtx;
    } catch (error) {
      if (state.gumStream === stream) {
        clearLiveInputRuntimeState();
      } else {
        releaseLiveInputAnalysisGraph(graph);
        stopMediaStreamTracks(stream);
      }
      throw error;
    }
  }

  /**
   * @param {string | null | undefined} deviceId
   * @param {import("./inputDeviceSemantics.js").LiveInputDeviceKind} [liveInputDeviceKind]
   * @param {string | null | undefined} [deviceLabel]
   */
  async function startLiveInputStream(
    deviceId,
    liveInputDeviceKind = LIVE_INPUT_DEVICE_KINDS.acousticMic,
    deviceLabel = null,
  ) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }

    if (state.activeBufferSource || isStreamSourcePlaying()) {
      stopPlayback({ resetOffset: false });
    }

    const sourceRequest = beginSourceRequest(
      { type: AUDIO_SOURCE_EVENTS.systemStarting },
      AUDIO_SOURCE_PHASES.starting,
    );

    const resolvedLiveInputDeviceKind =
      normalizeLiveInputDeviceKind(liveInputDeviceKind);
    let resolvedDeviceId = deviceId ?? null;
    if (
      !isDefaultAudioInputDeviceId(resolvedDeviceId) &&
      typeof navigator.mediaDevices?.enumerateDevices === "function"
    ) {
      try {
        const availableAudioInputs = (
          await navigator.mediaDevices.enumerateDevices()
        ).filter((device) => device?.kind === "audioinput");
        if (!isCurrentSourceRequest(sourceRequest)) {
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
    if (!isCurrentSourceRequest(sourceRequest)) {
      return false;
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
      if (
        !failCurrentSystemRequest(
          sourceRequest,
          error instanceof Error ? error.message : "capture-error",
        )
      ) {
        return false;
      }
      throw error;
    }
    if (!isCurrentSourceRequest(sourceRequest)) {
      stopMediaStreamTracks(stream);
      return false;
    }
    let audioCtx;
    try {
      audioCtx = installLiveInputStream(stream, {
        deviceId: resolvedDeviceId,
        liveInputDeviceKind: resolvedLiveInputDeviceKind,
        sessionId: sourceRequest.sessionId,
      });
    } catch (error) {
      failCurrentSystemRequest(
        sourceRequest,
        error instanceof Error ? error.message : "capture-error",
      );
      throw error;
    }
    if (!audioCtx) {
      return false;
    }
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
    const sessionId = state.sourceSession.sessionId;
    const ownsSystemSource =
      state.sourceSession.kind === AUDIO_SOURCE_KINDS.system;
    clearLiveInputRuntimeState();
    if (ownsSystemSource) {
      transitionSource({
        type: AUDIO_SOURCE_EVENTS.systemStopped,
        sessionId,
        reason: "stopped",
      });
    }
  }

  function resolveAnalysisSourceMode(status) {
    if (status.sourceSession.kind === AUDIO_SOURCE_KINDS.system) {
      if (!status.isLiveInputActive) {
        return null;
      }
      return isLoopbackLiveInputDeviceKind(status.liveInputDeviceKind)
        ? "system"
        : "live";
    }

    if (status.sourceSession.kind !== AUDIO_SOURCE_KINDS.file) {
      return null;
    }
    if (
      status.analysisSource !== "file" &&
      status.hasPreparedFileAnalysisSource !== true
    ) {
      return null;
    }
    return state.loadedPlaybackSourceKind === "stream" ? "stream" : "file";
  }

  function readFeatureAnalysisCapture({ includeStructural = false } = {}) {
    const status = getStatus();
    const sourceMode = resolveAnalysisSourceMode(status);
    if (!sourceMode) {
      return null;
    }

    const captureTimestampMs = getTimingNowMs();
    const observationTimeSeconds =
      sourceMode === "file" || sourceMode === "stream"
        ? clampPlaybackTime(getCurrentPlaybackTime())
        : captureTimestampMs / 1000;
    if (sourceMode === "file" && state.decodedAnalysisSource) {
      const capture = state.decodedAnalysisSource.sample(
        observationTimeSeconds,
        { includeStructural },
      );
      return {
        captureTimestampMs,
        observationTimeSeconds,
        fast: {
          sourceMode,
          ...capture.fast,
        },
        structural: capture.structural
          ? {
              sourceMode,
              ...capture.structural,
            }
          : null,
      };
    }
    return {
      captureTimestampMs,
      observationTimeSeconds,
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
    state.decodedBuffer = null;
    state.decodedAnalysisSource = null;
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
    clockState.mode = "realtime";
    clockState.previousElapsedTime = 0;
    clockState.lastKnownAudioTime = 0;
    transitionSource({ type: AUDIO_SOURCE_EVENTS.reset });
    state.cachedFileTimelineRevision = 0;

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
    loadAudio,
    loadStream,
    selectSource,
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

const defaultAudioSession = createAudioSession();

export function getDefaultAudioSession() {
  return defaultAudioSession;
}
