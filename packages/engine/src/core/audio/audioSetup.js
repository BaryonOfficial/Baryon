import { AUDIO_DEFAULTS, DEFAULT_SAMPLE_RATE } from "../../defaults.js";
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
import {
  AUDIO_SOURCE_EVENTS,
  AUDIO_SOURCE_KINDS,
  AUDIO_SOURCE_PHASES,
  cloneAudioSourceSession,
  createAudioSourceSession,
  reduceAudioSourceSession,
} from "./audioSourceSession.js";
import { createAudioFeatureRuntime } from "../../utils/audio/audioFeatureEngine.js";

export { AUDIO_SOURCE_KINDS, AUDIO_SOURCE_PHASES };

const LIVE_INPUT_INTERRUPTION_MUTE_TIMEOUT_MS = 1500;
const LIVE_INPUT_INTERRUPTION_CONTEXT_TIMEOUT_MS = 1500;
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

function stopMediaStreamTracks(stream) {
  const tracks = stream?.getTracks?.() ?? stream?.getAudioTracks?.() ?? [];
  for (const track of tracks) {
    track.stop?.();
  }
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

export function createAudioSession({
  createFeatureRuntime = createAudioFeatureRuntime,
} = {}) {
  const state = {
    sourceSession: createAudioSourceSession(),
    cachedFileTimelineRevision: 0,
    audioCtx: null,
    playbackOutputGain: null,
    decodedBuffer: null,
    activeBufferSource: null,
    retiringBufferSources: new Set(),
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

  let pcmBus = null;
  let pcmConsumer = null;
  function ensurePcmBus() {
    if (!pcmBus) {
      pcmBus = ensureAudioContext().createGain();
      pcmBus.channelCountMode = "max";
      pcmBus.channelInterpretation = "discrete";
    }
    return pcmBus;
  }
  function readPcmSource() {
    if (!state.audioCtx || !pcmBus) return null;
    return {
      context: state.audioCtx,
      source: pcmBus,
      sourceSession: cloneAudioSourceSession(state.sourceSession),
      active: Boolean(
        state.activeBufferSource ||
        isStreamSourcePlaying() ||
        state.gumStream?.active,
      ),
      endTime: state.activeBufferSource
        ? state.activePlaybackDiagnostics?.expectedEndTimeSeconds
        : undefined,
    };
  }
  function bindPcmConsumer(consumer) {
    if (pcmConsumer)
      throw new Error("The audio session already has a PCM consumer");
    pcmConsumer = consumer;
    return () => {
      if (pcmConsumer !== consumer) return;
      pcmConsumer = null;
      consumer.invalidate("pcm-consumer-detached");
    };
  }
  async function preparePcmAnalysis() {
    if (pcmConsumer) await pcmConsumer.prepare(readPcmSource());
  }
  function nextPcmBoundaryFrame(context) {
    return (
      Math.ceil((context.currentTime * context.sampleRate) / 128) * 128 + 512
    );
  }
  function beginPcmAnalysis(endTime = undefined) {
    const context = ensureAudioContext();
    if (!pcmConsumer) return context.currentTime;
    // Both audible file playback and capture use this scheduled sample edge.
    // The short lookahead lets the worklet receive its command before the edge.
    const startFrame = nextPcmBoundaryFrame(context);
    pcmConsumer?.begin({
      startFrame,
      endFrame:
        endTime === undefined
          ? undefined
          : Math.ceil(endTime * context.sampleRate),
    });
    return startFrame / context.sampleRate;
  }

  let endedCallback = null;
  let activeLiveInputSettingsSync = null;
  let nextPlaybackSessionId = 0;
  let playbackStartRequest = null;
  const clockState = {
    mode: "realtime",
    previousElapsedTime: 0,
    lastKnownAudioTime: 0,
  };

  function transitionSource(event) {
    const previous = state.sourceSession;
    state.sourceSession = reduceAudioSourceSession(previous, event);
    if (
      state.sourceSession !== previous &&
      (previous.sessionId !== state.sourceSession.sessionId ||
        previous.timelineRevision !== state.sourceSession.timelineRevision ||
        ["empty", "loading", "stopped", "error"].includes(
          state.sourceSession.phase,
        ))
    ) {
      clearRetiringBufferSources();
      pcmConsumer?.invalidate(event.type);
    }
    if (state.sourceSession.kind === AUDIO_SOURCE_KINDS.file) {
      state.cachedFileTimelineRevision = state.sourceSession.timelineRevision;
    }
    return state.sourceSession;
  }

  function beginSourceRequest(event, expectedPhase) {
    cancelPlaybackStart();
    const sourceSession = transitionSource(event);
    return {
      kind: sourceSession.kind,
      phase: expectedPhase,
      sessionId: sourceSession.sessionId,
    };
  }

  function cancelPlaybackStart() {
    playbackStartRequest = null;
  }

  function beginPlaybackStart(element = null) {
    const request = { pending: true, element };
    playbackStartRequest = request;
    return request;
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
    globalThis.addEventListener?.("pagehide", handlePageUnload);
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

  function beginPlaybackSession({
    audioCtx,
    sourceKind,
    offsetSeconds,
    startedAtContextTimeSeconds = audioCtx.currentTime,
  }) {
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
  }

  function stopBufferSource(source, stopAtSeconds = null) {
    const disconnect = () => {
      state.retiringBufferSources.delete(source);
      source.onended = null;
      disconnectAudioNode(source);
    };
    source.onended = null;
    if (stopAtSeconds !== null) {
      // The worklet must still receive the input through the shared pause edge.
      state.retiringBufferSources.add(source);
      source.onended = disconnect;
    }
    try {
      if (stopAtSeconds === null) source.stop();
      else source.stop(stopAtSeconds);
    } catch (error) {
      disconnect();
      if (error?.name !== "InvalidStateError") throw error;
      return;
    }
    if (stopAtSeconds === null) disconnect();
  }

  function clearRetiringBufferSources() {
    for (const source of state.retiringBufferSources) stopBufferSource(source);
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

    pcmConsumer?.end();
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
    sourceNode.connect(state.playbackOutputGain);
    sourceNode.connect(ensurePcmBus());

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
    synchronizePcmPause = false,
  } = {}) {
    const audioCtx = state.audioCtx;
    const pauseFrame =
      synchronizePcmPause &&
      pcmConsumer &&
      state.activeBufferSource &&
      audioCtx?.state === "running"
        ? nextPcmBoundaryFrame(audioCtx)
        : null;
    const pauseTime =
      pauseFrame === null ? null : pauseFrame / audioCtx.sampleRate;
    const playbackTime =
      pauseTime === null
        ? getCurrentPlaybackTime()
        : clampPlaybackTime(
            state.playbackOffsetSeconds +
              Math.max(0, pauseTime - state.playbackStartedAtSeconds),
          );
    if (resetOffset) {
      resetPlaybackPosition();
    } else {
      resetPlaybackPosition(playbackTime);
    }

    pcmConsumer?.pause(
      pauseFrame === null ? undefined : { contextFrame: pauseFrame },
    );
    const source = state.activeBufferSource;
    state.activeBufferSource = null;
    if (source) stopBufferSource(source, pauseTime);

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
    pcmConsumer?.pause();
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
    synchronizePcmPause = false,
  } = {}) {
    cancelPlaybackStart();
    if (state.loadedPlaybackSourceKind === "stream") {
      stopStreamPlayback({ resetOffset, stoppedMode, endReason });
      return;
    }

    if (state.activeBufferSource || state.playbackOffsetSeconds > 0) {
      stopBufferPlayback({
        resetOffset,
        stoppedMode,
        endReason,
        synchronizePcmPause,
      });
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

    if (endReason !== "natural") pcmConsumer?.pause();
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
    const isPlaying = Boolean(
      state.sourceSession.kind === AUDIO_SOURCE_KINDS.file &&
      hasActivePlaybackSource,
    );
    const isLiveInputActive = Boolean(
      state.sourceSession.kind === AUDIO_SOURCE_KINDS.system &&
      state.sourceSession.phase === AUDIO_SOURCE_PHASES.active &&
      state.gumStream?.active &&
      state.liveInputNode,
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

    return {
      sourceSession,
      sampleRate:
        state.decodedBuffer?.sampleRate ??
        state.audioCtx?.sampleRate ??
        DEFAULT_SAMPLE_RATE,
      isAudioLoaded,
      isPlaying,
      isPlaybackPaused,
      isLiveInputActive,
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
      !state.gumStream?.active &&
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

    cancelPlaybackStart();

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
    const request = beginPlaybackStart();

    try {
      if (audioCtx.state !== "running") {
        await maybeResumeAudioContext("start-buffer-playback");
      }
      if (playbackStartRequest !== request) {
        return false;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = state.decodedBuffer;
      source.connect(state.playbackOutputGain);
      source.connect(ensurePcmBus());
      source.onended = () => {
        handleBufferEnded(source);
      };

      const nextOffset = Math.min(
        clampPlaybackTime(offsetSeconds),
        Math.max(0, state.playbackDurationSeconds - 1e-4),
      );
      if (pcmConsumer) await preparePcmAnalysis();
      if (playbackStartRequest !== request) {
        source.onended = null;
        disconnectAudioNode(source);
        return false;
      }
      const startedAtContextTimeSeconds = beginPcmAnalysis();
      pcmConsumer?.scheduleEnd(
        Math.round(
          (startedAtContextTimeSeconds +
            state.playbackDurationSeconds -
            nextOffset) *
            audioCtx.sampleRate,
        ),
      );
      resetPlaybackPosition(nextOffset);
      beginPlaybackSession({
        audioCtx,
        sourceKind: "file",
        offsetSeconds: nextOffset,
        startedAtContextTimeSeconds,
      });
      state.activeBufferSource = source;
      source.start(startedAtContextTimeSeconds, nextOffset);
      return true;
    } finally {
      request.pending = false;
    }
  }

  async function startStreamPlayback(element) {
    if (!element) {
      return false;
    }

    const streamAudioCtx = ensureAudioContext();
    ensurePlaybackAudioGraph();
    const request = beginPlaybackStart(element);

    try {
      if (streamAudioCtx.state !== "running") {
        await maybeResumeAudioContext("stream-playback");
      }
      if (playbackStartRequest !== request) {
        return false;
      }

      if (
        state.playbackDurationSeconds > 0 &&
        getMediaElementPlaybackTime(element) >= state.playbackDurationSeconds
      ) {
        setMediaElementTime(element, 0);
      }

      if (pcmConsumer) await preparePcmAnalysis();
      if (playbackStartRequest !== request) return false;
      // Media elements expose no sample-accurate play boundary. Capture starts
      // on the audio clock before play(), retaining real leading silence.
      beginPcmAnalysis();
      if (pcmConsumer) await pcmConsumer.waitUntilStarted();
      if (playbackStartRequest !== request) return false;
      await element.play();
      if (playbackStartRequest !== request) {
        // A late play() may make the old element audible again. Only a newer
        // playback command for this same element may keep it playing.
        if (playbackStartRequest?.element !== element) {
          pauseMediaElement(element);
        }
        return false;
      }

      const offsetSeconds = clampPlaybackTime(
        getMediaElementPlaybackTime(element),
      );
      beginPlaybackSession({
        audioCtx: streamAudioCtx,
        sourceKind: state.sourceMetadata.sourceKind || "stream",
        offsetSeconds,
      });
      return true;
    } catch (error) {
      if (playbackStartRequest !== request) {
        return false;
      }
      cancelPlaybackStart();
      // An older play may have made this element audible while we waited.
      pauseMediaElement(element);
      throw error;
    } finally {
      request.pending = false;
    }
  }

  async function playPauseAudio() {
    if (playbackStartRequest?.pending) {
      stopPlayback();
      return false;
    }
    const audioCtx = state.audioCtx;
    if (state.activeBufferSource && audioCtx && audioCtx.state !== "running") {
      return maybeResumeAudioContext("play-pause-resume");
    }

    if (state.activeBufferSource || isStreamSourcePlaying()) {
      stopPlayback({ synchronizePcmPause: true });
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
    cancelPlaybackStart();
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

    cancelPlaybackStart();

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
      if (isStreamSourcePlaying()) {
        if (pcmConsumer) await preparePcmAnalysis();
        beginPcmAnalysis();
      }
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
    let sourceNode = null;

    try {
      sourceNode = audioCtx.createMediaStreamSource(stream);
      const track = stream.getAudioTracks?.()?.[0] ?? null;

      if (
        state.sourceSession.kind !== AUDIO_SOURCE_KINDS.system ||
        state.sourceSession.phase !== AUDIO_SOURCE_PHASES.starting ||
        state.sourceSession.sessionId !== sessionId
      ) {
        disconnectAudioNode(sourceNode);
        stopMediaStreamTracks(stream);
        return null;
      }

      // Only the current source command may connect to the physical PCM bus.
      sourceNode.connect(ensurePcmBus());
      // Acquire and build the replacement before releasing the current input.
      // Once the replacement is known-good, this is the single cutover point
      // for stream, PCM-node and System capture ownership.
      clearLiveInputRuntimeState();
      state.gumStream = stream;
      state.liveInputNode = sourceNode;
      state.selectedLiveInputDeviceId = deviceId ?? null;
      state.liveInputDeviceKind = liveInputDeviceKind;
      state.selectedLiveInputDeviceLabel = String(track?.label ?? "").trim();
      state.lastLiveInputInterruption = null;
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
        disconnectAudioNode(sourceNode);
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
    if (pcmConsumer) await preparePcmAnalysis();
    if (
      !isCurrentSourceRequest({
        ...sourceRequest,
        phase: AUDIO_SOURCE_PHASES.active,
      })
    )
      return false;
    beginPcmAnalysis();
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

  async function dispose() {
    clearRetiringBufferSources();
    pcmConsumer?.invalidate("audio-session-disposed");
    // This session is reused by the host after an explicit reset. Retain its
    // one feature owner/binding; invalidate() releases all live processing.
    pcmBus?.disconnect();
    pcmBus = null;
    cancelPlaybackStart();
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

  const session = {
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
    bindPcmConsumer,
    readPcmSource,
    seekTo,
    dispose,
    get featureRuntime() {
      return featureRuntime;
    },
  };
  // Binding is inert until a source command supplies consecutive PCM. Canvas
  // creation, cache reads and renderer recovery never construct this owner.
  const featureRuntime = createFeatureRuntime({}, { audioSession: session });
  featureRuntime.start();
  return session;
}

const defaultAudioSession = createAudioSession();

export function getDefaultAudioSession() {
  return defaultAudioSession;
}
