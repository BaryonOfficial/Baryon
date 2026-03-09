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

  getByteFrequencyData(data) {
    data.fill(0);
    if (data.length > 2) data[2] = 255;
  }

  getFloatTimeDomainData(data) {
    data.fill(0.25);
  }
}

const mockTrackStop = vi.fn();
let lastAudioInstance = null;

vi.mock("three", () => {
  class AudioLoader {
    load(url, onLoad, _progress, onError) {
      if (url === "bad") {
        onError(new Error("load failed"));
        return;
      }
      onLoad({ url });
    }
  }

  class AudioListener {
    constructor() {
      this.timeDelta = 1 / 60;
      this.context = {
        state: "running",
        sampleRate: 48000,
        currentTime: 12,
        resume: vi.fn(async () => {
          this.context.state = "running";
        }),
        createAnalyser: () => new MockAnalyserNode(),
        createMediaStreamSource: () => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
        }),
      };
    }
  }

  class Audio {
    constructor(listener) {
      this.listener = listener;
      this.context = listener.context;
      this.started = false;
      this.isPlaying = false;
      this.onEnded = null;
      this.buffer = null;
      lastAudioInstance = this;
    }

    setBuffer(buffer) {
      this.buffer = buffer;
    }

    setLoop() {}

    setVolume() {}

    play() {
      this.isPlaying = true;
    }

    pause() {
      this.isPlaying = false;
    }

    stop() {
      this.isPlaying = false;
    }
  }

  class AudioAnalyser {
    constructor(sound, fftSize) {
      this.sound = sound;
      this.analyser = new MockAnalyserNode();
      this.analyser.fftSize = fftSize;
    }

    getFrequencyData() {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return data;
    }

    getAverageFrequency() {
      return 64;
    }
  }

  return {
    Audio,
    AudioAnalyser,
    AudioListener,
    AudioLoader,
  };
});

describe("audio session", () => {
  let createAudioSession;

  beforeEach(async () => {
    mockTrackStop.mockReset();
    lastAudioInstance = null;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(async () => ({
            active: true,
            getAudioTracks: () => [{ stop: mockTrackStop }],
          })),
        },
      },
    });

    ({ createAudioSession } = await import("./audioSetup.js"));
  });

  it("tracks file lifecycle through explicit status", async () => {
    const session = createAudioSession();
    const camera = { add: vi.fn(), remove: vi.fn() };

    session.attach(camera);
    await session.loadAudio("good");

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
    });
    expect(session.readAnalysisSnapshot()?.sourceMode).toBe("file");

    await session.playPauseAudio();
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isPlaying: false,
      analysisSource: "idle",
    });
  });

  it("tracks mic lifecycle and clears state on stop", async () => {
    const session = createAudioSession();
    const camera = { add: vi.fn(), remove: vi.fn() };

    session.attach(camera);
    await session.startMicRecordStream("device-1");

    expect(session.getStatus()).toMatchObject({
      audioInputMode: "mic",
      isMicActive: true,
      analysisSource: "mic",
    });
    expect(session.readAnalysisSnapshot()?.sourceMode).toBe("mic");

    session.stopMicRecordStream();
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isMicActive: false,
      analysisSource: "idle",
    });
  });

  it("disposes host state deterministically", async () => {
    const session = createAudioSession();
    const camera = { add: vi.fn(), remove: vi.fn() };

    session.attach(camera);
    await session.loadAudio("good");
    await session.playPauseAudio();

    session.dispose();

    expect(camera.remove).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isAudioLoaded: false,
      isPlaying: false,
      analysisSource: "idle",
    });
    expect(session.readAnalysisSnapshot()).toBeNull();
  });

  it("reports clock snapshots from playback and realtime modes without transition spikes", async () => {
    const session = createAudioSession();
    const camera = { add: vi.fn(), remove: vi.fn() };

    session.attach(camera);

    expect(session.readClockSnapshot(1)).toMatchObject({
      clockMode: "realtime",
      time: 1,
      deltaTime: 0,
    });
    expect(session.readClockSnapshot(1.5)).toMatchObject({
      clockMode: "realtime",
      time: 1.5,
      deltaTime: 0.5,
    });

    await session.loadAudio("good");
    await session.playPauseAudio();

    expect(session.readClockSnapshot(2)).toMatchObject({
      clockMode: "playback",
      time: 12,
      deltaTime: 1 / 60,
    });

    session.stopAudio();

    expect(session.readClockSnapshot(3)).toMatchObject({
      clockMode: "realtime",
      time: 3,
      deltaTime: 0,
    });
  });

  it("applies the ended callback even when registered before attach", async () => {
    const session = createAudioSession();
    const callback = vi.fn();
    const camera = { add: vi.fn(), remove: vi.fn() };

    session.setAudioEndedCallback(callback);
    session.attach(camera);
    await session.loadAudio("good");
    await session.playPauseAudio();

    lastAudioInstance.onEnded();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toMatchObject({
      audioInputMode: "idle",
      isPlaying: false,
    });
  });
});
