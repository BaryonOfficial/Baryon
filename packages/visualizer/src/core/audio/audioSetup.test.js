import { beforeEach, describe, expect, it, vi } from "vitest";

class MockAnalyserNode {
  constructor() {
    this._fftSize = 0;
    this.frequencyBinCount = 0;
  }

  set fftSize(value) {
    this._fftSize = value;
    this.frequencyBinCount = value / 2;
  }

  get fftSize() {
    return this._fftSize;
  }

  connect() {}

  disconnect() {}

  getByteFrequencyData(data) {
    data.fill(0);
    if (data.length > 2) data[2] = 255;
  }

  getFloatTimeDomainData(data) {
    data.fill(0.25);
  }
}

class MockGainNode {
  constructor() {
    this.gain = { value: 1 };
  }

  connect() {}

  disconnect() {}
}

class MockMediaStreamSourceNode {
  connect() {}

  disconnect() {}
}

class MockMediaElementSourceNode {
  constructor(element) {
    this.element = element;
  }

  connect() {}

  disconnect() {}
}

class MockBufferSourceNode {
  constructor(context) {
    this.context = context;
    this.buffer = null;
    this.onended = null;
    this.started = false;
    this.startArgs = null;
  }

  connect() {}

  disconnect() {}

  start(when = 0, offset = 0) {
    this.started = true;
    this.startArgs = { when, offset };
  }

  stop() {
    this.started = false;
  }
}

class MockAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
    this.currentTime = 12;
    this.destination = {};
    this.createdBufferSources = [];
    this.createdMediaElementSources = [];
    this.onstatechange = null;
  }

  resume = vi.fn(async () => {
    this.state = "running";
  });

  close = vi.fn(async () => {
    this.state = "closed";
  });

  createGain() {
    return new MockGainNode();
  }

  createAnalyser() {
    return new MockAnalyserNode();
  }

  createMediaStreamSource() {
    return new MockMediaStreamSourceNode();
  }

  createMediaElementSource(element) {
    const source = new MockMediaElementSourceNode(element);
    this.createdMediaElementSources.push(source);
    return source;
  }

  createBufferSource() {
    const source = new MockBufferSourceNode(this);
    this.createdBufferSources.push(source);
    return source;
  }

  decodeAudioData = vi.fn(async () => ({
    duration: 5,
  }));

  dispatchStateChange(nextState) {
    this.state = nextState;
    this.onstatechange?.();
  }
}

class MockMediaElement {
  constructor({
    currentTime = 0,
    duration = 5,
    paused = true,
    ended = false,
    src = "https://streams.soundcloud.com/track.m3u8",
  } = {}) {
    this.currentTime = currentTime;
    this.duration = duration;
    this.paused = paused;
    this.ended = ended;
    this.src = src;
    this.currentSrc = src;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type);
    listeners?.delete(listener);
  }

  dispatchEvent(type) {
    const listeners = this.listeners.get(type);
    listeners?.forEach((listener) => listener());
  }

  play = vi.fn(async () => {
    this.paused = false;
    this.ended = false;
  });

  pause = vi.fn(() => {
    this.paused = true;
  });
}

const mockTrackStop = vi.fn();
const mockTrackApplyConstraints = vi.fn(async () => {});
let fetchMock;
let lastAudioContext = null;
let getUserMediaMock;
let getAudioTracksMock;

describe("audio session", () => {
  let createAudioSession;

  beforeEach(async () => {
    vi.resetModules();
    mockTrackStop.mockReset();
    mockTrackApplyConstraints.mockReset();
    lastAudioContext = null;
    getAudioTracksMock = vi.fn(() => [
      {
        stop: mockTrackStop,
        applyConstraints: mockTrackApplyConstraints,
      },
    ]);
    getUserMediaMock = vi.fn(async () => ({
      active: true,
      getAudioTracks: getAudioTracksMock,
    }));

    fetchMock = vi.fn(async (url) => {
      if (url === "bad") {
        return {
          ok: false,
          status: 500,
        };
      }

      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(32),
      };
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class extends MockAudioContext {
        constructor() {
          super();
          lastAudioContext = this;
        }
      },
    });

    Object.defineProperty(globalThis, "webkitAudioContext", {
      configurable: true,
      value: undefined,
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: getUserMediaMock,
        },
      },
    });

    ({ createAudioSession } = await import("./audioSetup.js"));
  });

  function createAttachedSession() {
    const session = createAudioSession();
    session.attach({ add: vi.fn(), remove: vi.fn() });
    return session;
  }

  it("tracks file lifecycle through explicit status", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");

    expect(fetchMock).toHaveBeenCalledWith("good");
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "file",
      isAudioLoaded: true,
      isPlaying: false,
      analysisSource: "idle",
    });

    await session.playPauseAudio();
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "file",
      isPlaying: true,
      analysisSource: "file",
      playbackSessionId: 1,
      lastPlaybackEndReason: null,
    });
    const fileSnapshot = session.readAnalysisSnapshot();
    expect(fileSnapshot).toMatchObject({
      sourceMode: "file",
      rms: 0.25,
    });
    expect(fileSnapshot?.avgAmplitude).toBeGreaterThan(0);
    expect(fileSnapshot?.fftMagnitudes).toBeInstanceOf(Float32Array);
    expect(fileSnapshot?.timeData).toBeInstanceOf(Float32Array);
    expect(session.getStatus().lastPlaybackDiagnostics).toMatchObject({
      playbackSessionId: 1,
      sourceKind: "file",
      offsetSeconds: 0,
      durationSeconds: 5,
      audioContextStateAtStart: "running",
      latestAudioContextState: "running",
    });

    await session.playPauseAudio();
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isPlaying: false,
      analysisSource: "idle",
    });
  });

  it("tracks native stream lifecycle through the shared playback graph", async () => {
    const session = createAttachedSession();
    const mediaElement = new MockMediaElement({
      duration: 9,
      currentTime: 0,
    });

    await session.loadStream({
      element: mediaElement,
      label: "SoundCloud Track",
      duration: 9,
      sourceKind: "soundcloud",
    });

    expect(session.getStatus()).toMatchObject({
      audioInputMode: "file",
      sourceKind: "soundcloud",
      sourceLabel: "SoundCloud Track",
      isAudioLoaded: true,
      isPlaying: false,
      analysisSource: "idle",
    });

    await session.playPauseAudio();

    expect(mediaElement.play).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "file",
      isPlaying: true,
      sourceKind: "soundcloud",
      analysisSource: "file",
    });
    expect(session.readAnalysisSnapshot()).toMatchObject({
      sourceMode: "stream",
      rms: 0.25,
    });

    mediaElement.currentTime = 2.25;
    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "playback",
      time: 2.25,
      deltaTime: 2.25,
    });

    await session.playPauseAudio();
    expect(mediaElement.pause).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isPlaying: false,
      sourceKind: "soundcloud",
    });
    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "paused-playback",
      time: 2.25,
      deltaTime: 0,
    });
  });

  it("reports seekable transport state for finite files and updates paused offsets", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 5,
      canSeek: true,
    });

    await session.seekTo(2.5);

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 2.5,
      durationSeconds: 5,
      canSeek: true,
    });
    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "paused-playback",
      time: 2.5,
      deltaTime: 0,
    });
  });

  it("reports seekable transport state for finite streams and updates current time", async () => {
    const session = createAttachedSession();
    const mediaElement = new MockMediaElement({
      duration: 9,
      currentTime: 0,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Seekable Stream",
      duration: 9,
      sourceKind: "soundcloud",
    });

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 9,
      canSeek: true,
    });

    await session.seekTo(4.5);

    expect(mediaElement.currentTime).toBe(4.5);
    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 4.5,
      durationSeconds: 9,
      canSeek: true,
    });
  });

  it("tracks mic lifecycle and clears state on stop", async () => {
    const session = createAttachedSession();
    await session.startMicRecordStream("device-1");

    expect(session.getStatus()).toMatchObject({
      audioInputMode: "mic",
      isMicActive: true,
      analysisSource: "mic",
      micSettings: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const micSnapshot = session.readAnalysisSnapshot();
    expect(micSnapshot).toMatchObject({
      sourceMode: "mic",
      rms: 0.25,
    });
    expect(micSnapshot?.avgAmplitude).toBeGreaterThan(0);

    session.stopMicRecordStream();
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isMicActive: false,
      analysisSource: "idle",
    });
  });

  it("disposes host state deterministically", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    await session.dispose();

    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isAudioLoaded: false,
      isPlaying: false,
      analysisSource: "idle",
    });
    expect(session.readAnalysisSnapshot()).toBeNull();
    expect(lastAudioContext.close).toHaveBeenCalledTimes(1);
  });

  it("reports clock snapshots from playback, paused-playback, and realtime modes", async () => {
    const session = createAttachedSession();

    expect(session.readClockSnapshot(1)).toMatchObject({
      clockMode: "realtime",
      time: 1,
      deltaTime: 0,
    });

    await session.loadAudio("good");
    await session.playPauseAudio();
    lastAudioContext.currentTime = 12.75;

    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "playback",
      time: 0.75,
      deltaTime: 0.75,
    });

    await session.playPauseAudio();

    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "paused-playback",
      time: 0.75,
      deltaTime: 0,
    });

    session.stopAudio();

    expect(session.readClockSnapshot(4)).toMatchObject({
      clockMode: "realtime",
      time: 4,
      deltaTime: 0,
    });
  });

  it("resets to unloaded state after a failed audio load", async () => {
    const session = createAttachedSession();

    await expect(session.loadAudio("bad")).rejects.toThrow(
      "Failed to load audio: 500",
    );

    expect(session.getStatus()).toMatchObject({
      isAudioLoaded: false,
      isPlaying: false,
      audioInputMode: "idle",
    });
  });

  it("returns to stopped when stopAudio is called while playing", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    session.stopAudio();

    expect(session.getStatus()).toMatchObject({
      isPlaying: false,
      audioInputMode: "stopped",
      analysisSource: "idle",
      lastPlaybackEndReason: "stopped",
    });
  });

  it("resets native stream playback when stopAudio is called", async () => {
    const session = createAttachedSession();
    const mediaElement = new MockMediaElement({
      duration: 7,
      currentTime: 1.75,
      paused: false,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Playlist Track",
      duration: 7,
      sourceKind: "soundcloud",
    });

    session.stopAudio();

    expect(mediaElement.pause).toHaveBeenCalledTimes(1);
    expect(mediaElement.currentTime).toBe(0);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "stopped",
      isPlaying: false,
      sourceKind: "soundcloud",
      analysisSource: "idle",
    });
  });

  it("keeps analysis snapshots active at zero volume and while muted", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    const baseline = session.readAnalysisSnapshot();
    session.setVolume(0);
    const mutedByVolume = session.readAnalysisSnapshot();
    session.setMuted(true);
    const muted = session.readAnalysisSnapshot();

    expect(baseline.fftMagnitudes).toEqual(mutedByVolume.fftMagnitudes);
    expect(baseline.fftMagnitudes).toEqual(muted.fftMagnitudes);
    expect(baseline.avgAmplitude).toBe(mutedByVolume.avgAmplitude);
    expect(baseline.avgAmplitude).toBe(muted.avgAmplitude);
    expect(lastAudioContext.destination).toBeTruthy();
  });

  it("preserves playback offset across pause and resume", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13.5;
    await session.playPauseAudio();
    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "paused-playback",
      time: 1.5,
    });

    await session.playPauseAudio();
    lastAudioContext.currentTime = 14;

    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "playback",
      time: 2,
      deltaTime: 0.5,
    });
  });

  it("restarts active file playback from the requested seek offset", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    await session.seekTo(3.25);

    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
      audioInputMode: "file",
    });
    expect(lastAudioContext.createdBufferSources).toHaveLength(2);
    expect(
      lastAudioContext.createdBufferSources.at(-1)?.startArgs,
    ).toMatchObject({
      when: 0,
      offset: 3.25,
    });
    expect(session.getTransportState()).toMatchObject({
      currentTimeSeconds: 3.25,
      durationSeconds: 5,
      canSeek: true,
    });
  });

  it("updates active native stream playback without interrupting play state", async () => {
    const session = createAttachedSession();
    const mediaElement = new MockMediaElement({
      duration: 8,
      currentTime: 1,
      paused: true,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Playing Stream",
      duration: 8,
      sourceKind: "soundcloud",
    });
    await session.playPauseAudio();

    await session.seekTo(5.5);

    expect(mediaElement.currentTime).toBe(5.5);
    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
      sourceKind: "soundcloud",
    });
    expect(session.getTransportState()).toMatchObject({
      currentTimeSeconds: 5.5,
      durationSeconds: 8,
      canSeek: true,
    });
  });

  it("resets playback state cleanly when a new file is loaded during playback", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13.25;
    await session.loadAudio("good");

    expect(session.getStatus()).toMatchObject({
      audioInputMode: "file",
      isAudioLoaded: true,
      isPlaying: false,
      analysisSource: "idle",
    });
    expect(session.readClockSnapshot(5)).toMatchObject({
      clockMode: "realtime",
      time: 5,
      deltaTime: 0,
    });

    await session.playPauseAudio();

    expect(
      lastAudioContext.createdBufferSources.at(-1)?.startArgs,
    ).toMatchObject({
      when: 0,
      offset: 0,
    });
  });

  it("clears paused file playback state when switching to mic input", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13;
    await session.playPauseAudio();
    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "paused-playback",
      time: 1,
    });

    await session.startMicRecordStream("device-1");

    expect(session.getStatus()).toMatchObject({
      audioInputMode: "mic",
      isMicActive: true,
      isPlaying: false,
      analysisSource: "mic",
    });
    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "realtime",
      time: 3,
      deltaTime: 0,
    });
    expect(session.readAnalysisSnapshot()).toMatchObject({
      sourceMode: "mic",
      rms: 0.25,
    });
  });

  it("clears loaded stream playback state when switching to mic input", async () => {
    const session = createAttachedSession();
    const mediaElement = new MockMediaElement({
      duration: 8,
      currentTime: 0,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Stream Track",
      duration: 8,
      sourceKind: "soundcloud",
    });

    await session.startMicRecordStream("device-1");

    expect(mediaElement.pause).toHaveBeenCalledTimes(2);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "mic",
      isMicActive: true,
      isPlaying: false,
      sourceKind: "mic",
      analysisSource: "mic",
      isAudioLoaded: false,
    });
  });

  it("marks unloaded and mic sources as non-seekable", async () => {
    const session = createAttachedSession();

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });
    await expect(session.seekTo(1)).resolves.toBe(false);

    await session.startMicRecordStream("device-1");

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });
    await expect(session.seekTo(1)).resolves.toBe(false);
  });

  it("applies the ended callback even when registered before attach", async () => {
    const session = createAttachedSession();
    const callback = vi.fn();

    session.setAudioEndedCallback(callback);
    await session.loadAudio("good");
    await session.playPauseAudio();
    lastAudioContext.currentTime = 17;

    const activeSource = lastAudioContext.createdBufferSources[0];
    if (activeSource?.onended) {
      activeSource.onended();
    }

    expect(callback).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "stopped",
      isPlaying: false,
      lastPlaybackEndReason: "natural",
    });
  });

  it("classifies early buffer endings as premature and preserves playback offset", async () => {
    const session = createAttachedSession();
    const callback = vi.fn();

    session.setAudioEndedCallback(callback);
    await session.loadAudio("good");
    await session.playPauseAudio();
    lastAudioContext.currentTime = 13.2;

    const activeSource = lastAudioContext.createdBufferSources[0];
    activeSource?.onended?.();

    expect(callback).not.toHaveBeenCalled();
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isPlaying: false,
      lastPlaybackEndReason: "premature",
    });
    expect(session.getTransportState()).toMatchObject({
      durationSeconds: 5,
      canSeek: true,
    });
    expect(session.getTransportState().currentTimeSeconds).toBeCloseTo(1.2, 5);
    expect(session.getStatus().lastPlaybackDiagnostics).toMatchObject({
      playbackSessionId: 1,
      reason: "premature",
    });
    expect(
      session.getStatus().lastPlaybackDiagnostics?.actualPlayedDurationSeconds,
    ).toBeCloseTo(1.2, 5);
  });

  it("records audio context state changes and resumes interrupted playback on interaction", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.dispatchStateChange("suspended");

    expect(session.getStatus()).toMatchObject({
      isPlaying: false,
      lastPlaybackEndReason: null,
    });
    expect(session.getStatus().lastPlaybackDiagnostics).toMatchObject({
      latestAudioContextState: "suspended",
      lastContextStateChange: {
        from: "running",
        to: "suspended",
      },
    });

    await session.playPauseAudio();

    expect(lastAudioContext.resume).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
    });
    expect(session.getStatus().lastPlaybackDiagnostics).toMatchObject({
      latestAudioContextState: "running",
      lastResumeAttempt: {
        succeeded: true,
        nextAudioContextState: "running",
      },
    });
  });

  it("does not misclassify pause, resume, and seek as playback interruptions", async () => {
    const session = createAttachedSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13;
    await session.playPauseAudio();
    await session.playPauseAudio();
    await session.seekTo(2.25);

    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
      lastPlaybackEndReason: null,
    });
    expect(session.getTransportState()).toMatchObject({
      currentTimeSeconds: 2.25,
    });
  });

  it("applies the ended callback for native stream playback", async () => {
    const session = createAttachedSession();
    const callback = vi.fn();
    const mediaElement = new MockMediaElement({
      duration: 6,
      currentTime: 0,
    });

    session.setAudioEndedCallback(callback);
    await session.loadStream({
      element: mediaElement,
      label: "Ended Stream",
      duration: 6,
      sourceKind: "soundcloud",
    });
    await session.playPauseAudio();

    mediaElement.currentTime = 6;
    mediaElement.ended = true;
    mediaElement.dispatchEvent("ended");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(mediaElement.currentTime).toBe(0);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "stopped",
      isPlaying: false,
      sourceKind: "soundcloud",
      lastPlaybackEndReason: "natural",
    });
  });

  it("releases mic resources and closes the audio context on dispose", async () => {
    const session = createAttachedSession();
    await session.startMicRecordStream("device-1");

    await session.dispose();

    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isMicActive: false,
      isPlaying: false,
      analysisSource: "idle",
    });
    expect(lastAudioContext.close).toHaveBeenCalledTimes(1);
  });

  it("requests mic input with the selected device and current DSP settings", async () => {
    const session = createAttachedSession();
    await session.setMicSettings({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await session.startMicRecordStream("device-1");

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: "device-1" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(session.getMicSettings()).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("applies updated mic DSP settings to the active track", async () => {
    const session = createAttachedSession();
    await session.startMicRecordStream("device-1");

    await session.setMicSettings({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });

    expect(mockTrackApplyConstraints).toHaveBeenCalledWith({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
    expect(session.getStatus().micSettings).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
  });

  it("allows repeated create and dispose cycles without retaining playback state", async () => {
    const firstSession = createAttachedSession();
    await firstSession.loadAudio("good");
    await firstSession.playPauseAudio();
    await firstSession.dispose();

    const secondSession = createAttachedSession();
    expect(secondSession.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isAudioLoaded: false,
      isPlaying: false,
      analysisSource: "idle",
    });

    await secondSession.loadAudio("good");
    expect(secondSession.getStatus()).toMatchObject({
      audioInputMode: "file",
      isAudioLoaded: true,
      isPlaying: false,
    });
  });
});
