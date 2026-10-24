import { beforeEach, describe, expect, it, vi } from "vitest";

class MockGainNode {
  constructor() {
    this.gain = {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
    this.connectedTargets = [];
  }

  connect(target) {
    this.connectedTargets.push(target);
  }

  disconnect(target) {
    if (target === undefined) {
      this.connectedTargets = [];
      return;
    }
    this.connectedTargets = this.connectedTargets.filter(
      (connected) => connected !== target,
    );
  }
}

class MockMediaStreamSourceNode {
  connect() {}

  disconnect = vi.fn();
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

  disconnect = vi.fn();

  start(when = 0, offset = 0) {
    this.started = true;
    this.startArgs = { when, offset };
  }

  stop = vi.fn((when = 0) => {
    this.started = false;
    this.stoppedAt = when;
  });
}

class MockAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
    this.currentTime = 12;
    this.destination = {};
    this.createdBufferSources = [];
    this.createdAnalysers = [];
    this.createdGains = [];
    this.createdMediaElementSources = [];
    this.createdMediaStreamSources = [];
    this.createdMediaStreamDestinations = [];
    this.onstatechange = null;
  }

  resume = vi.fn(async () => {
    this.state = "running";
  });

  close = vi.fn(async () => {
    this.state = "closed";
  });

  createGain() {
    const gain = new MockGainNode();
    this.createdGains.push(gain);
    return gain;
  }

  createAnalyser() {
    this.createdAnalysers.push(null);
    throw new Error(
      "Snapshot analysers must not be created by the PCM session",
    );
  }

  createMediaStreamSource() {
    const source = new MockMediaStreamSourceNode();
    this.createdMediaStreamSources.push(source);
    return source;
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

  createMediaStreamDestination() {
    const track = {
      stopped: 0,
      stop() {
        this.stopped += 1;
      },
    };
    const destination = {
      stream: {
        id: `capture-stream-${this.createdMediaStreamDestinations.length}`,
        getTracks: () => [track],
      },
      track,
    };
    this.createdMediaStreamDestinations.push(destination);
    return destination;
  }

  decodeAudioData = vi.fn(async () => {
    const samples = new Float32Array(this.sampleRate * 5);
    samples.fill(0.25);
    return {
      duration: 5,
      sampleRate: this.sampleRate,
      length: samples.length,
      numberOfChannels: 1,
      getChannelData: () => samples,
    };
  });

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
    src = "https://streams.example.test/track.m3u8",
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
let mockTrackListeners;
let mockTrack;
let fetchMock;
let lastAudioContext = null;
let getUserMediaMock;
let getAudioTracksMock;
let enumerateDevicesMock;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("audio session", () => {
  let createAudioSession;

  beforeEach(async () => {
    vi.resetModules();
    mockTrackStop.mockReset();
    mockTrackApplyConstraints.mockReset();
    mockTrackListeners = new Map();
    mockTrack = {
      id: "track-1",
      kind: "audio",
      label: "Built-in Mic",
      enabled: true,
      readyState: "live",
      stop: mockTrackStop,
      applyConstraints: mockTrackApplyConstraints,
      getSettings: vi.fn(() => ({
        deviceId: "device-1",
        sampleRate: 48000,
        channelCount: 2,
      })),
      getConstraints: vi.fn(() => ({
        deviceId: { exact: "device-1" },
      })),
      getCapabilities: vi.fn(() => ({
        channelCount: { min: 1, max: 2 },
      })),
      muted: false,
      addEventListener: vi.fn((type, listener) => {
        const listeners = mockTrackListeners.get(type) ?? new Set();
        listeners.add(listener);
        mockTrackListeners.set(type, listeners);
      }),
      removeEventListener: vi.fn((type, listener) => {
        mockTrackListeners.get(type)?.delete(listener);
      }),
      dispatchEvent(type) {
        mockTrackListeners.get(type)?.forEach((listener) => listener());
      },
    };
    lastAudioContext = null;
    getAudioTracksMock = vi.fn(() => [mockTrack]);
    getUserMediaMock = vi.fn(async () => ({
      active: true,
      getAudioTracks: getAudioTracksMock,
    }));
    enumerateDevicesMock = vi.fn(async () => []);

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
          enumerateDevices: enumerateDevicesMock,
          getUserMedia: getUserMediaMock,
        },
      },
    });

    ({ createAudioSession } = await import("./audioSetup.js"));
  });

  function createSession() {
    // Session graph tests isolate the model processor. Explicit PCM timing
    // cases bind their own consumer; production uses the real factory.
    return createAudioSession({
      createFeatureRuntime: () => ({ start: vi.fn() }),
    });
  }

  it("owns one feature runtime across resource reset and never constructs it from renderer reads", async () => {
    const consumer = {
      prepare: vi.fn(async () => true),
      begin: vi.fn(),
      invalidate: vi.fn(),
      scheduleEnd: vi.fn(),
      waitUntilStarted: vi.fn(async () => {}),
      pause: vi.fn(),
    };
    const runtime = {
      start: vi.fn(),
      configure: vi.fn(),
      setAuthorityRole: vi.fn(),
      dispose: vi.fn(),
    };
    const factory = vi.fn((_settings, { audioSession }) => {
      runtime.start.mockImplementation(() =>
        audioSession.bindPcmConsumer(consumer),
      );
      return runtime;
    });
    const session = createAudioSession({ createFeatureRuntime: factory });
    expect(session.featureRuntime).toBe(runtime);
    expect(factory).toHaveBeenCalledExactlyOnceWith(
      {},
      { audioSession: session },
    );
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(lastAudioContext).toBeNull();
    for (let i = 0; i < 2; i++) {
      await session.loadAudio("good");
      await session.playPauseAudio();
      expect(session.featureRuntime).toBe(runtime);
      await session.dispose();
    }
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
    expect(consumer.prepare).toHaveBeenCalledTimes(2);
    expect(consumer.invalidate).toHaveBeenCalledWith("audio-session-disposed");
    expect(runtime.dispose).not.toHaveBeenCalled();
  });

  it("file, media-stream and live sources use the PCM bus without snapshot analysers", async () => {
    const session = createSession();
    expect(session).not.toHaveProperty("readFeatureAnalysisCapture");
    await session.loadAudio("good");
    expect(session.getStatus().isAudioLoaded).toBe(true);
    await session.playPauseAudio();
    expect(session.readPcmSource()?.active).toBe(true);
    expect(lastAudioContext.createdAnalysers).toHaveLength(0);
    session.stopAudio();
    const element = new MockMediaElement();
    await session.loadStream({ element, sourceKind: "stream", duration: 7 });
    await session.playPauseAudio();
    expect(session.readPcmSource()?.active).toBe(true);
    expect(lastAudioContext.createdAnalysers).toHaveLength(0);
    session.stopAudio();
    await session.startLiveInputStream("device-1", "system");
    expect(session.readPcmSource()?.active).toBe(true);
    expect(lastAudioContext.createdAnalysers).toHaveLength(0);
    session.stopLiveInputStream();
    expect(session.readPcmSource()?.active).toBe(false);
  });

  it("tracks file lifecycle through explicit status", async () => {
    const session = createSession();
    await session.loadAudio("good");

    expect(fetchMock).toHaveBeenCalledWith("good");
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ready" },
      isAudioLoaded: true,
      isPlaying: false,
      isPlaybackPaused: false,
    });

    await session.playPauseAudio();
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "active" },
      isPlaying: true,
      playbackSessionId: 1,
      lastPlaybackEndReason: null,
    });
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
      sourceSession: { kind: "file", phase: "paused" },
      isPlaying: false,
      isPlaybackPaused: true,
    });
  });

  it("discards an older file load that finishes after a newer load", async () => {
    const session = createSession();
    const firstResponse = createDeferred();
    const secondResponse = createDeferred();
    fetchMock.mockImplementation((url) =>
      url === "first" ? firstResponse.promise : secondResponse.promise,
    );

    const firstLoad = session.loadAudio("first");
    const secondLoad = session.loadAudio("second");

    secondResponse.resolve({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(64),
    });
    await expect(secondLoad).resolves.toBe(true);

    firstResponse.resolve({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(32),
    });
    await expect(firstLoad).resolves.toBe(false);

    expect(session.getStatus().sourceSession).toMatchObject({
      kind: "file",
      phase: "ready",
      sessionId: 2,
    });
  });

  it("lets live input supersede a pending file decode", async () => {
    const session = createSession();
    const pendingArrayBuffer = createDeferred();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => pendingArrayBuffer.promise,
    });

    const fileLoad = session.loadAudio("pending-demo");
    await Promise.resolve();

    await expect(
      session.startLiveInputStream("device-1", "system"),
    ).resolves.toBe(true);

    pendingArrayBuffer.resolve(new ArrayBuffer(32));
    await expect(fileLoad).resolves.toBe(false);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active" },
      isAudioLoaded: false,
      isLiveInputActive: true,
    });
  });

  it("keeps a cached File passive while System owns the PCM source", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();
    lastAudioContext.currentTime += 1;

    session.selectSource("system");

    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "ready" },
      isAudioLoaded: true,
      isLiveInputActive: false,
    });

    const deferredStream = createDeferred();
    navigator.mediaDevices.enumerateDevices = undefined;
    getUserMediaMock.mockReturnValue(deferredStream.promise);
    const liveStart = session.startLiveInputStream("device-1", "system");
    await Promise.resolve();

    expect(session.getStatus().sourceSession).toMatchObject({
      kind: "system",
      phase: "starting",
    });

    deferredStream.resolve({
      active: true,
      getTracks: () => [mockTrack],
      getAudioTracks: getAudioTracksMock,
    });
    await expect(liveStart).resolves.toBe(true);

    session.stopLiveInputStream();

    session.selectSource("file");
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ready" },
      isPlaybackPaused: false,
    });
    expect(session.getTransportState().currentTimeSeconds).toBe(1);
  });

  it("lets a file load supersede a pending live input capture", async () => {
    const session = createSession();
    const deferredStream = createDeferred();
    navigator.mediaDevices.enumerateDevices = undefined;
    getUserMediaMock.mockReturnValue(deferredStream.promise);

    const liveStart = session.startLiveInputStream("device-1", "system");
    await Promise.resolve();

    await expect(session.loadAudio("selected-file")).resolves.toBe(true);

    deferredStream.resolve({
      active: true,
      getTracks: () => [mockTrack],
      getAudioTracks: getAudioTracksMock,
    });

    await expect(liveStart).resolves.toBe(false);
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ready" },
      isAudioLoaded: true,
      isLiveInputActive: false,
    });
  });

  it("rejects and closes a live stream that resolves after stop", async () => {
    const session = createSession();
    const deferredStream = createDeferred();
    navigator.mediaDevices.enumerateDevices = undefined;
    getUserMediaMock.mockReturnValue(deferredStream.promise);

    const startRequest = session.startLiveInputStream("device-1");
    session.stopLiveInputStream();
    deferredStream.resolve({
      active: true,
      getTracks: () => [mockTrack],
      getAudioTracks: getAudioTracksMock,
    });

    await expect(startRequest).resolves.toBe(false);
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus().isLiveInputActive).toBe(false);
  });

  it("rolls back an acquired stream and staged node when PCM connection fails", async () => {
    let shouldFailPcmConnection = true;
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class extends MockAudioContext {
        constructor() {
          super();
          lastAudioContext = this;
        }

        createMediaStreamSource() {
          const node = super.createMediaStreamSource();
          if (shouldFailPcmConnection) {
            shouldFailPcmConnection = false;
            node.connect = () => {
              throw new Error("PCM connection unavailable");
            };
          }
          return node;
        }
      },
    });
    const session = createSession();

    await expect(
      session.startLiveInputStream("device-1", "system"),
    ).rejects.toThrow("PCM connection unavailable");

    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(
      lastAudioContext.createdMediaStreamSources[0].disconnect,
    ).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: {
        kind: "system",
        phase: "error",
        sessionId: 1,
      },
      isLiveInputActive: false,
      selectedLiveInputDeviceId: null,
      selectedLiveInputDeviceLabel: "",
    });

    await expect(
      session.startLiveInputStream("device-1", "system"),
    ).resolves.toBe(true);
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: {
        kind: "system",
        phase: "active",
        sessionId: 2,
      },
      isLiveInputActive: true,
      selectedLiveInputDeviceId: "device-1",
    });
  });

  it("atomically replaces an active live stream without leaking its track", async () => {
    const firstTrackStop = vi.fn();
    const secondTrackStop = vi.fn();
    const firstTrack = {
      ...mockTrack,
      id: "track-first",
      label: "First Input",
      stop: firstTrackStop,
    };
    const secondTrack = {
      ...mockTrack,
      id: "track-second",
      label: "Second Input",
      stop: secondTrackStop,
    };
    getUserMediaMock
      .mockResolvedValueOnce({
        active: true,
        getAudioTracks: () => [firstTrack],
      })
      .mockResolvedValueOnce({
        active: true,
        getAudioTracks: () => [secondTrack],
      });
    const session = createSession();

    await expect(
      session.startLiveInputStream("device-1", "system"),
    ).resolves.toBe(true);
    await expect(
      session.startLiveInputStream("device-2", "system"),
    ).resolves.toBe(true);

    expect(firstTrackStop).toHaveBeenCalledTimes(1);
    expect(secondTrackStop).not.toHaveBeenCalled();
    expect(session.getStatus()).toMatchObject({
      sourceSession: {
        kind: "system",
        phase: "active",
        sessionId: 2,
      },
      isLiveInputActive: true,
      selectedLiveInputDeviceId: "device-2",
      selectedLiveInputDeviceLabel: "Second Input",
      liveInputTrack: { id: "track-second" },
    });
  });

  it("fails closed when the replacement PCM node cannot connect", async () => {
    const activeTrackStop = vi.fn();
    const replacementTrackStop = vi.fn();
    const activeTrack = {
      ...mockTrack,
      id: "track-active",
      label: "Active Input",
      stop: activeTrackStop,
    };
    const replacementTrack = {
      ...mockTrack,
      id: "track-replacement",
      label: "Replacement Input",
      stop: replacementTrackStop,
    };
    getUserMediaMock
      .mockResolvedValueOnce({
        active: true,
        getAudioTracks: () => [activeTrack],
      })
      .mockResolvedValueOnce({
        active: true,
        getAudioTracks: () => [replacementTrack],
      });
    const session = createSession();
    await session.startLiveInputStream("device-1", "system");

    lastAudioContext.createMediaStreamSource = vi.fn(() => {
      const node = new MockMediaStreamSourceNode();
      node.connect = () => {
        throw new Error("replacement PCM connection unavailable");
      };
      return node;
    });

    await expect(
      session.startLiveInputStream("device-2", "system"),
    ).rejects.toThrow("replacement PCM connection unavailable");

    expect(activeTrackStop).toHaveBeenCalledTimes(1);
    expect(replacementTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: {
        kind: "system",
        phase: "error",
        sessionId: 2,
      },
      isLiveInputActive: false,
      selectedLiveInputDeviceId: null,
      selectedLiveInputDeviceLabel: "",
      liveInputTrack: { present: false, streamActive: false },
    });
  });

  it("captures playback audio through a disconnectable media-stream tap", async () => {
    const session = createSession();
    await session.loadAudio("good");

    const capture = session.createCaptureStream();
    expect(capture).not.toBeNull();

    const captureDestination =
      lastAudioContext.createdMediaStreamDestinations[0];
    expect(capture.stream).toBe(captureDestination.stream);

    const playbackOutputGain = lastAudioContext.createdGains.find((gain) =>
      gain.connectedTargets.includes(lastAudioContext.destination),
    );
    expect(playbackOutputGain).toBeDefined();
    expect(playbackOutputGain.connectedTargets).toContain(captureDestination);

    capture.stop();
    expect(playbackOutputGain.connectedTargets).not.toContain(
      captureDestination,
    );
    expect(captureDestination.track.stopped).toBe(1);
    expect(playbackOutputGain.connectedTargets).toContain(
      lastAudioContext.destination,
    );

    // A second capture after stop creates a fresh destination tap.
    const secondCapture = session.createCaptureStream();
    expect(secondCapture.stream).toBe(
      lastAudioContext.createdMediaStreamDestinations[1].stream,
    );
  });

  it("returns null from createCaptureStream when media-stream capture is unavailable", async () => {
    lastAudioContext = null;
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class extends MockAudioContext {
        constructor() {
          super();
          this.createMediaStreamDestination = undefined;
          lastAudioContext = this;
        }
      },
    });

    const session = createSession();
    await session.loadAudio("good");
    expect(session.createCaptureStream()).toBeNull();
  });

  it("tracks native stream lifecycle through the shared playback graph", async () => {
    const session = createSession();
    const mediaElement = new MockMediaElement({
      duration: 9,
      currentTime: 0,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Remote Stream",
      duration: 9,
      sourceKind: "stream",
    });

    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ready" },
      sourceLabel: "Remote Stream",
      isAudioLoaded: true,
      isPlaying: false,
    });

    await session.playPauseAudio();

    expect(mediaElement.play).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "active" },
      isPlaying: true,
      playbackSessionId: 1,
      lastPlaybackDiagnostics: {
        playbackSessionId: 1,
        sourceKind: "stream",
        offsetSeconds: 0,
        durationSeconds: 9,
        audioContextStateAtStart: "running",
        latestAudioContextState: "running",
      },
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
      sourceSession: { kind: "file", phase: "paused" },
      isPlaying: false,
    });
    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "paused-playback",
      time: 2.25,
      deltaTime: 0,
    });
  });

  it("reports seekable transport state for finite files and updates paused offsets", async () => {
    const session = createSession();
    await session.loadAudio("good");
    expect(session.getStatus().sourceSession.timelineRevision).toBe(0);

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 5,
      canSeek: true,
    });

    await session.seekTo(2.5);

    expect(session.getStatus().sourceSession.timelineRevision).toBe(1);
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
    const session = createSession();
    const mediaElement = new MockMediaElement({
      duration: 9,
      currentTime: 0,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Seekable Stream",
      duration: 9,
      sourceKind: "stream",
    });

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 9,
      canSeek: true,
    });

    await session.seekTo(4.5);

    expect(session.getStatus().sourceSession.timelineRevision).toBe(1);
    expect(mediaElement.currentTime).toBe(4.5);
    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 4.5,
      durationSeconds: 9,
      canSeek: true,
    });
  });

  it("tracks live input lifecycle and clears state on stop", async () => {
    const session = createSession();
    await session.startLiveInputStream("device-1");

    expect(getUserMediaMock).toHaveBeenLastCalledWith({
      audio: {
        deviceId: { exact: "device-1" },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(session.getStatus().liveInputCalibrationVersion).toBeGreaterThan(0);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active", sessionId: 1 },
      isLiveInputActive: true,
      liveInputTrack: {
        present: true,
        streamActive: true,
        id: "track-1",
        label: "Built-in Mic",
        kind: "audio",
        enabled: true,
        muted: false,
        readyState: "live",
        settings: {
          deviceId: "device-1",
          sampleRate: 48000,
          channelCount: 2,
        },
        constraints: {
          deviceId: { exact: "device-1" },
        },
        capabilities: {
          channelCount: { min: 1, max: 2 },
        },
      },
      liveInputSettings: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    session.stopLiveInputStream();
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "stopped" },
      isLiveInputActive: false,
      lastLiveInputInterruption: null,
    });
  });

  it("assigns a new owner session id after a live-input reconnect", async () => {
    const session = createSession();
    await session.startLiveInputStream("device-1");
    const firstSessionId = session.getStatus().sourceSession.sessionId;

    session.stopLiveInputStream();
    await session.startLiveInputStream("device-1");

    expect(firstSessionId).toBe(1);
    expect(session.getStatus().sourceSession.sessionId).toBe(2);
  });

  it("treats the browser default input id as an unconstrained device choice", async () => {
    const session = createSession();
    await session.startLiveInputStream("default");

    expect(enumerateDevicesMock).not.toHaveBeenCalled();
    expect(getUserMediaMock).toHaveBeenLastCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active" },
      isLiveInputActive: true,
      selectedLiveInputDeviceId: "default",
    });
  });

  it("recovers live input when the media stream track ends unexpectedly", async () => {
    const session = createSession();
    await session.startLiveInputStream("device-1");

    mockTrack.dispatchEvent("ended");

    expect(mockTrackStop).not.toHaveBeenCalled();
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "error" },
      isLiveInputActive: false,
      selectedLiveInputDeviceId: null,
      selectedLiveInputDeviceLabel: "",
      lastLiveInputInterruption: {
        reason: "track-ended",
        deviceId: "device-1",
      },
    });
  });

  it("recovers live input after a sustained track mute but ignores a transient mute", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      await session.startLiveInputStream("device-1");

      mockTrack.muted = true;
      mockTrack.dispatchEvent("mute");
      await vi.advanceTimersByTimeAsync(1499);

      expect(session.getStatus()).toMatchObject({
        sourceSession: { kind: "system", phase: "active" },
        isLiveInputActive: true,
        lastLiveInputInterruption: null,
      });

      mockTrack.muted = false;
      mockTrack.dispatchEvent("unmute");
      await vi.advanceTimersByTimeAsync(2);

      expect(session.getStatus()).toMatchObject({
        sourceSession: { kind: "system", phase: "active" },
        isLiveInputActive: true,
        lastLiveInputInterruption: null,
      });

      mockTrack.muted = true;
      mockTrack.dispatchEvent("mute");
      await vi.advanceTimersByTimeAsync(1500);

      expect(session.getStatus()).toMatchObject({
        sourceSession: { kind: "system", phase: "error" },
        isLiveInputActive: false,
        lastLiveInputInterruption: {
          reason: "track-muted-timeout",
          deviceId: "device-1",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers live input when the live audio context is interrupted", async () => {
    const session = createSession();
    await session.startLiveInputStream("device-1");

    lastAudioContext.dispatchStateChange("interrupted");

    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "error" },
      isLiveInputActive: false,
      lastLiveInputInterruption: {
        reason: "audio-context-interrupted",
        deviceId: "device-1",
      },
    });
  });

  it("tracks loopback input through its declared capture-device kind", async () => {
    const session = createSession();
    await session.setLiveInputSettings({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await session.startLiveInputStream("device-1", "system");

    expect(getUserMediaMock).toHaveBeenLastCalledWith({
      audio: {
        deviceId: { exact: "device-1" },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const status = session.getStatus();
    expect(status).toMatchObject({
      sourceSession: {
        kind: "system",
        phase: "active",
        systemCapture: { deviceKind: "system" },
      },
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      liveInputCalibrationVersion: 0,
    });
    expect(status).not.toHaveProperty("liveInputKind");

    await session.setLiveInputSettings({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });

    expect(mockTrackApplyConstraints).not.toHaveBeenCalled();
  });

  it("resolves a session-local loopback device id from the selected device label", async () => {
    enumerateDevicesMock.mockResolvedValue([
      {
        kind: "audioinput",
        deviceId: "stage-device-1",
        label: "BlackHole 2ch (Virtual)",
      },
    ]);
    getUserMediaMock.mockResolvedValue({
      active: true,
      getAudioTracks: () => [
        {
          label: "BlackHole 2ch (Virtual)",
          stop: mockTrackStop,
          applyConstraints: mockTrackApplyConstraints,
        },
      ],
    });

    const session = createSession();
    await session.startLiveInputStream(
      "main-window-device-9",
      "system",
      "BlackHole 2ch (Virtual)",
    );

    expect(getUserMediaMock).toHaveBeenLastCalledWith({
      audio: {
        deviceId: { exact: "stage-device-1" },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active" },
      isLiveInputActive: true,
      selectedLiveInputDeviceId: "stage-device-1",
      selectedLiveInputDeviceLabel: "BlackHole 2ch (Virtual)",
    });
  });

  it("does not block live input startup on a suspended audio context resume", async () => {
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: class extends MockAudioContext {
        constructor() {
          super();
          this.state = "suspended";
          lastAudioContext = this;
        }

        resume = vi.fn(() => new Promise(() => {}));
      },
    });

    const session = createSession();
    const result = await Promise.race([
      session.startLiveInputStream("device-1", "system").then(() => "started"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
    ]);

    expect(result).toBe("started");
    expect(lastAudioContext.resume).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active" },
      isLiveInputActive: true,
      selectedLiveInputDeviceId: "device-1",
    });
  });

  it("disposes host state deterministically", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    await session.dispose();

    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "empty" },
      isAudioLoaded: false,
      isPlaying: false,
    });
    expect(lastAudioContext.close).toHaveBeenCalledTimes(1);
  });

  it("reports clock snapshots from playback, paused-playback, and realtime modes", async () => {
    const session = createSession();

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

  it("reports the canonical File error state after a failed audio load", async () => {
    const session = createSession();

    await expect(session.loadAudio("bad")).rejects.toThrow(
      "Failed to load audio: 500",
    );

    expect(session.getStatus()).toMatchObject({
      isAudioLoaded: false,
      isPlaying: false,
      sourceSession: { kind: "file", phase: "error" },
    });
  });

  it("cancels a pending start when the playback toggle is pressed again", async () => {
    const session = createSession();
    await session.loadAudio("good");
    const resume = createDeferred();
    lastAudioContext.state = "suspended";
    lastAudioContext.resume.mockImplementation(() => resume.promise);
    const first = session.playPauseAudio();
    const second = session.playPauseAudio();
    lastAudioContext.state = "running";
    resume.resolve();
    await Promise.all([first, second]);
    expect(
      lastAudioContext.createdBufferSources.filter((source) => source.started),
    ).toHaveLength(0);
    expect(session.getStatus().isPlaying).toBe(false);
  });

  it.each(["stop", "seek", "replace", "select-system", "dispose"])(
    "does not finish a pending start after %s",
    async (command) => {
      const session = createSession();
      await session.loadAudio("good");
      const context = lastAudioContext;
      const resume = createDeferred();
      context.state = "suspended";
      context.resume.mockImplementation(() => resume.promise);
      const starting = session.playPauseAudio();
      if (command === "stop") session.stopAudio();
      if (command === "seek") await session.seekTo(1);
      if (command === "replace") await session.loadAudio("replacement");
      if (command === "select-system") session.selectSource("system");
      if (command === "dispose") await session.dispose();
      context.state = "running";
      resume.resolve();
      expect(await starting).toBe(false);
      expect(
        context.createdBufferSources.filter((source) => source.started),
      ).toHaveLength(0);
      expect(session.getStatus().isPlaying).toBe(false);
    },
  );

  it("does not finish or leave a stream playing after a cancelled asynchronous play", async () => {
    const session = createSession();
    const element = new MockMediaElement();
    await session.loadStream({ element });
    const play = createDeferred();
    element.play.mockImplementation(async () => {
      await play.promise;
      element.paused = false;
    });
    const starting = session.playPauseAudio();
    session.stopAudio();
    play.resolve();
    expect(await starting).toBe(false);
    expect(element.paused).toBe(true);
    expect(session.getStatus().isPlaying).toBe(false);
  });

  it.each([false, true])(
    "does not let an old stream start override a newer play result (fails=%s)",
    async (fails) => {
      const session = createSession();
      const element = new MockMediaElement();
      await session.loadStream({ element });
      const oldPlay = createDeferred();
      element.play.mockImplementationOnce(async () => {
        await oldPlay.promise;
        element.paused = false;
      });
      const oldStart = session.playPauseAudio();
      session.stopAudio();
      if (fails) {
        element.play.mockRejectedValueOnce(new Error("play rejected"));
        await expect(session.playPauseAudio()).rejects.toThrow("play rejected");
      } else {
        expect(await session.playPauseAudio()).toBe(true);
      }
      oldPlay.resolve();
      expect(await oldStart).toBe(false);
      expect(element.paused).toBe(fails);
      expect(session.getStatus().isPlaying).toBe(!fails);
    },
  );

  it.each([false, true])(
    "honors the newer stream result after an old play resolves first (fails=%s)",
    async (fails) => {
      const session = createSession();
      const element = new MockMediaElement();
      await session.loadStream({ element });
      const oldPlay = createDeferred();
      const newPlay = createDeferred();
      element.play
        .mockImplementationOnce(async () => {
          await oldPlay.promise;
          element.paused = false;
        })
        .mockImplementationOnce(() => newPlay.promise);

      const oldStart = session.playPauseAudio();
      session.stopAudio();
      const newStart = session.playPauseAudio();
      oldPlay.resolve();
      expect(await oldStart).toBe(false);
      expect(element.paused).toBe(false);

      if (fails) {
        const rejection = expect(newStart).rejects.toThrow("play rejected");
        newPlay.reject(new Error("play rejected"));
        await rejection;
      } else {
        newPlay.resolve();
        expect(await newStart).toBe(true);
      }
      expect(element.paused).toBe(fails);
      expect(session.getStatus().isPlaying).toBe(!fails);
    },
  );

  it("does not pause a newer stream when a stale play rejects", async () => {
    const session = createSession();
    const element = new MockMediaElement();
    await session.loadStream({ element });
    const oldPlay = createDeferred();
    element.play.mockImplementationOnce(() => oldPlay.promise);
    const oldStart = session.playPauseAudio();
    session.stopAudio();
    expect(await session.playPauseAudio()).toBe(true);
    oldPlay.reject(new Error("stale play rejected"));
    expect(await oldStart).toBe(false);
    expect(element.paused).toBe(false);
    expect(session.getStatus().isPlaying).toBe(true);
  });

  it("returns to stopped when stopAudio is called while playing", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    session.stopAudio();

    expect(session.getStatus()).toMatchObject({
      isPlaying: false,
      sourceSession: { kind: "file", phase: "stopped" },
      lastPlaybackEndReason: "stopped",
    });
  });

  it("resets native stream playback when stopAudio is called", async () => {
    const session = createSession();
    const mediaElement = new MockMediaElement({
      duration: 7,
      currentTime: 1.75,
      paused: false,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Playlist Track",
      duration: 7,
      sourceKind: "stream",
    });

    session.stopAudio();

    expect(mediaElement.pause).toHaveBeenCalledTimes(1);
    expect(mediaElement.currentTime).toBe(0);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "stopped" },
      isPlaying: false,
    });
  });

  it("clears explicit stop diagnostics when native stream playback resumes", async () => {
    const session = createSession();
    const mediaElement = new MockMediaElement({
      duration: 7,
      currentTime: 1.75,
      paused: false,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Playlist Track",
      duration: 7,
      sourceKind: "stream",
    });

    session.stopAudio();
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "stopped" },
      isPlaying: false,
      lastPlaybackEndReason: "stopped",
    });

    await session.playPauseAudio();

    expect(mediaElement.play).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "active" },
      isPlaying: true,
      lastPlaybackEndReason: null,
    });
    expect(session.getStatus().playbackSessionId).not.toBeNull();
  });

  it("keeps the raw PCM source independent of output volume and mute", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();
    const rawSource = session.readPcmSource().source;
    session.setVolume(0);
    expect(session.readPcmSource()).toMatchObject({
      source: rawSource,
      active: true,
    });
    session.setMuted(true);
    expect(session.readPcmSource()).toMatchObject({
      source: rawSource,
      active: true,
    });
    session.setVolume(0.75);
    session.setMuted(false);
    expect(session.readPcmSource()).toMatchObject({
      source: rawSource,
      active: true,
    });
    expect(session.getStatus().isPlaying).toBe(true);
  });

  it("preserves playback offset across pause and resume", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13.5;
    await session.playPauseAudio();
    expect(session.getStatus().isPlaybackPaused).toBe(true);
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

  it("prepares PCM before scheduling audible file playback on the same sample edge", async () => {
    const session = createSession();
    await session.loadAudio("good");
    const installed = createDeferred();
    const consumer = {
      prepare: vi.fn(() => installed.promise),
      begin: vi.fn(),
      scheduleEnd: vi.fn(),
      pause: vi.fn(),
      invalidate: vi.fn(),
    };
    session.bindPcmConsumer(consumer);
    const playing = session.playPauseAudio();
    expect(consumer.prepare).toHaveBeenCalledOnce();
    expect(lastAudioContext.createdBufferSources.at(-1).started).toBe(false);
    installed.resolve();
    expect(await playing).toBe(true);
    const source = lastAudioContext.createdBufferSources.at(-1);
    const { startFrame } = consumer.begin.mock.calls[0][0];
    expect(source.startArgs.when * lastAudioContext.sampleRate).toBe(
      startFrame,
    );
    expect(startFrame).toBeGreaterThan(
      lastAudioContext.currentTime * lastAudioContext.sampleRate,
    );
    expect(consumer.scheduleEnd).toHaveBeenCalledExactlyOnceWith(
      startFrame + 5 * lastAudioContext.sampleRate,
    );
    expect(session.readPcmSource().source).toBe(
      consumer.prepare.mock.calls[0][0].source,
    );
    expect(session.readPcmSource().source.channelInterpretation).toBe(
      "discrete",
    );
    await session.playPauseAudio();
    expect(consumer.pause).toHaveBeenCalledOnce();
    expect(consumer.invalidate).not.toHaveBeenCalled();
    session.stopAudio();
    expect(consumer.invalidate).toHaveBeenCalledWith("file-stopped");
  });

  it.each([
    [44100, 0],
    [44100, 0.031],
    [48000, 0],
    [48000, 0.031],
  ])(
    "pauses file and PCM together at %i Hz after %f seconds and retires only the old node",
    async (sampleRate, elapsed) => {
      const session = createSession();
      await session.loadAudio("good");
      const consumer = {
        prepare: vi.fn(async () => {}),
        begin: vi.fn(),
        scheduleEnd: vi.fn(),
        pause: vi.fn(),
        invalidate: vi.fn(),
      };
      session.bindPcmConsumer(consumer);
      lastAudioContext.sampleRate = sampleRate;
      await session.playPauseAudio();
      const context = lastAudioContext;
      const oldSource = context.createdBufferSources.at(-1);
      context.currentTime += elapsed;
      await session.playPauseAudio();
      const { contextFrame } = consumer.pause.mock.calls[0][0];
      expect(contextFrame).toBeGreaterThan(
        context.currentTime * context.sampleRate,
      );
      expect(oldSource.stop).toHaveBeenCalledExactlyOnceWith(
        contextFrame / context.sampleRate,
      );
      expect(oldSource.disconnect).not.toHaveBeenCalled();
      const pausedTime = session.getTransportState().currentTimeSeconds;
      expect(pausedTime).toBeCloseTo(
        contextFrame / context.sampleRate - oldSource.startArgs.when,
        12,
      );
      expect(session.getStatus().isPlaybackPaused).toBe(true);
      const retireOldSource = oldSource.onended;
      context.currentTime = contextFrame / context.sampleRate;
      await session.playPauseAudio();
      const newSource = context.createdBufferSources.at(-1);
      expect(newSource.startArgs.offset).toBe(pausedTime);
      retireOldSource();
      expect(oldSource.disconnect).toHaveBeenCalledOnce();
      expect(newSource.disconnect).not.toHaveBeenCalled();
      expect(session.getStatus().isPlaying).toBe(true);
      expect(consumer.invalidate).not.toHaveBeenCalled();
      expect(consumer.begin).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["stop", "replace", "select", "dispose"])(
    "%s cancels a pending sample-aligned pause without leaving a connected source",
    async (action) => {
      const session = createSession();
      await session.loadAudio("good");
      session.bindPcmConsumer({
        prepare: async () => {},
        begin() {},
        scheduleEnd() {},
        pause() {},
        invalidate() {},
      });
      await session.playPauseAudio();
      const source = lastAudioContext.createdBufferSources.at(-1);
      await session.playPauseAudio();
      expect(source.disconnect).not.toHaveBeenCalled();
      if (action === "stop") session.stopAudio();
      if (action === "replace") await session.loadAudio("good");
      if (action === "select") session.selectSource("system");
      if (action === "dispose") await session.dispose();
      expect(source.stop).toHaveBeenLastCalledWith();
      expect(source.disconnect).toHaveBeenCalledOnce();
      expect(source.onended).toBeNull();
    },
  );

  it("a command cancelling PCM installation cannot leave an audible source or bootstrap it later", async () => {
    const session = createSession();
    await session.loadAudio("good");
    const installed = createDeferred();
    const consumer = {
      prepare: vi.fn(() => installed.promise),
      begin: vi.fn(),
      scheduleEnd: vi.fn(),
      pause: vi.fn(),
      invalidate: vi.fn(),
    };
    session.bindPcmConsumer(consumer);
    const playing = session.playPauseAudio();
    session.stopAudio();
    installed.resolve();
    expect(await playing).toBe(false);
    expect(consumer.begin).not.toHaveBeenCalled();
    expect(
      lastAudioContext.createdBufferSources.some((source) => source.started),
    ).toBe(false);
  });

  it("captures the native stream before asking the media element to play", async () => {
    const session = createSession(),
      element = new MockMediaElement();
    await session.loadStream({ element });
    const started = createDeferred();
    const consumer = {
      prepare: vi.fn(async () => {}),
      begin: vi.fn(),
      waitUntilStarted: () => started.promise,
      end: vi.fn(),
      pause: vi.fn(),
      invalidate: vi.fn(),
    };
    session.bindPcmConsumer(consumer);
    const playing = session.playPauseAudio();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(consumer.begin).toHaveBeenCalledOnce();
    expect(element.play).not.toHaveBeenCalled();
    started.resolve();
    expect(await playing).toBe(true);
    expect(element.play).toHaveBeenCalledOnce();
  });

  it("restarts active file playback from the requested seek offset", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();
    const sourceSession = session.getStatus().sourceSession;
    const playbackSessionId = session.getStatus().playbackSessionId;

    await session.seekTo(3.25);

    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
      sourceSession: {
        kind: "file",
        phase: "active",
        sessionId: sourceSession.sessionId,
        timelineRevision: sourceSession.timelineRevision + 1,
      },
    });
    expect(session.getStatus().playbackSessionId).not.toBe(playbackSessionId);
    expect(lastAudioContext.createdBufferSources).toHaveLength(2);
    expect(
      lastAudioContext.createdBufferSources.at(-1)?.startArgs,
    ).toMatchObject({
      when: lastAudioContext.currentTime,
      offset: 3.25,
    });
    expect(session.getTransportState()).toMatchObject({
      currentTimeSeconds: 3.25,
      durationSeconds: 5,
      canSeek: true,
    });
  });

  it("updates active native stream playback without interrupting play state", async () => {
    const session = createSession();
    const mediaElement = new MockMediaElement({
      duration: 8,
      currentTime: 1,
      paused: true,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Playing Stream",
      duration: 8,
      sourceKind: "stream",
    });
    await session.playPauseAudio();

    await session.seekTo(5.5);

    expect(mediaElement.currentTime).toBe(5.5);
    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
      sourceSession: { kind: "file", phase: "active" },
    });
    expect(session.getTransportState()).toMatchObject({
      currentTimeSeconds: 5.5,
      durationSeconds: 8,
      canSeek: true,
    });
  });

  it("resets playback state cleanly when a new file is loaded during playback", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13.25;
    await session.loadAudio("good");

    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ready" },
      isAudioLoaded: true,
      isPlaying: false,
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
      when: lastAudioContext.currentTime,
      offset: 0,
    });
  });

  it("clears paused file playback state when switching to live input", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.currentTime = 13;
    await session.playPauseAudio();
    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "paused-playback",
      time: 1,
    });

    await session.startLiveInputStream("device-1");

    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active" },
      isLiveInputActive: true,
      isPlaying: false,
    });
    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "realtime",
      time: 3,
      deltaTime: 0,
    });
  });

  it("keeps a loaded File source passive while System input is active", async () => {
    const session = createSession();
    const mediaElement = new MockMediaElement({
      duration: 8,
      currentTime: 0,
    });

    await session.loadStream({
      element: mediaElement,
      label: "Stream Track",
      duration: 8,
      sourceKind: "stream",
    });

    await session.startLiveInputStream("device-1");

    expect(mediaElement.pause).not.toHaveBeenCalled();
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "system", phase: "active" },
      isLiveInputActive: true,
      isPlaying: false,
      isAudioLoaded: true,
    });
  });

  it("marks unloaded and live input sources as non-seekable", async () => {
    const session = createSession();

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });
    await expect(session.seekTo(1)).resolves.toBe(false);

    await session.startLiveInputStream("device-1");

    expect(session.getTransportState()).toEqual({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });
    await expect(session.seekTo(1)).resolves.toBe(false);
  });

  it("applies an ended callback registered before playback", async () => {
    const session = createSession();
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
      sourceSession: { kind: "file", phase: "ended" },
      isPlaying: false,
      lastPlaybackEndReason: "natural",
    });
  });

  it("classifies early buffer endings as premature and preserves playback offset", async () => {
    const session = createSession();
    const callback = vi.fn();

    session.setAudioEndedCallback(callback);
    await session.loadAudio("good");
    await session.playPauseAudio();
    lastAudioContext.currentTime = 13.2;

    const activeSource = lastAudioContext.createdBufferSources[0];
    activeSource?.onended?.();

    expect(callback).not.toHaveBeenCalled();
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "paused" },
      isPlaying: false,
      isPlaybackPaused: false,
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

  it("preserves the prepared File and source session across audio context interruptions", async () => {
    const session = createSession();
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioContext.dispatchStateChange("suspended");

    expect(session.getStatus()).toMatchObject({
      isPlaying: true,
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
    const session = createSession();
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
    const session = createSession();
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
      sourceKind: "stream",
    });
    await session.playPauseAudio();

    mediaElement.currentTime = 6;
    mediaElement.ended = true;
    mediaElement.dispatchEvent("ended");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(mediaElement.currentTime).toBe(0);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ended" },
      isPlaying: false,
      lastPlaybackEndReason: "natural",
    });
  });

  it("releases live input resources and closes the audio context on dispose", async () => {
    const session = createSession();
    await session.startLiveInputStream("device-1");

    await session.dispose();

    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "empty" },
      isLiveInputActive: false,
      isPlaying: false,
    });
    expect(lastAudioContext.close).toHaveBeenCalledTimes(1);
  });

  it("requests live input with the selected device and current DSP settings", async () => {
    const session = createSession();
    await session.setLiveInputSettings({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await session.startLiveInputStream("device-1");

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: "device-1" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(session.getLiveInputSettings()).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("applies updated live input DSP settings to the active track", async () => {
    const session = createSession();
    await session.startLiveInputStream("device-1");

    await session.setLiveInputSettings({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });

    expect(mockTrackApplyConstraints).toHaveBeenCalledWith({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
    expect(session.getStatus().liveInputSettings).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
  });

  it("allows repeated create and dispose cycles without retaining playback state", async () => {
    const firstSession = createSession();
    await firstSession.loadAudio("good");
    await firstSession.playPauseAudio();
    await firstSession.dispose();

    const secondSession = createSession();
    expect(secondSession.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "empty" },
      isAudioLoaded: false,
      isPlaying: false,
    });

    await secondSession.loadAudio("good");
    expect(secondSession.getStatus()).toMatchObject({
      sourceSession: { kind: "file", phase: "ready" },
      isAudioLoaded: true,
      isPlaying: false,
    });
  });
});
