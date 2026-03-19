import { describe, expect, it } from "vitest";
import {
  buildCompactAnalyzerFrame,
  createAudioFeatureAnalyzer,
} from "./featureAnalyzer.js";

const FFT_SIZE = 4096;
const BIN_COUNT = FFT_SIZE / 2;
const SAMPLE_RATE = 44100;
const NYQUIST = SAMPLE_RATE / 2;

function makeStatus(overrides = {}) {
  return {
    audioInputMode: "file",
    isPlaying: true,
    isLiveInputActive: false,
    playbackSessionId: 4,
    fftSize: FFT_SIZE,
    sampleRate: SAMPLE_RATE,
    ...overrides,
  };
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    const bin = Math.max(
      1,
      Math.min(
        BIN_COUNT - 1,
        Math.round((frequency / NYQUIST) * (BIN_COUNT - 1)),
      ),
    );
    fft[bin] = amplitude;
  }
  return fft;
}

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(payload, transfer) {
    this.messages.push({ payload, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data, message: data?.error });
    }
  }
}

describe("feature analyzer", () => {
  it("builds compact analyzer frames with mel64 payloads", () => {
    const frame = buildCompactAnalyzerFrame({
      analysisSnapshot: {
        fftMagnitudes: makeFft([
          [110, 0.9],
          [220, 0.65],
          [880, 0.3],
        ]),
        avgAmplitude: 24,
        rms: 0.18,
      },
      status: makeStatus(),
      frameTimeMs: 16,
      frameId: 7,
    });

    expect(frame.frameId).toBe(7);
    expect(frame.mel64).toBeInstanceOf(Float32Array);
    expect(frame.mel64.length).toBe(64);
    expect(frame.lowBandEnergy).toBeGreaterThan(0);
    expect(frame.sessionKey).toBe("file:4");
  });

  it("filters hints by session and age while preserving worker status", () => {
    const fakeWorker = new FakeWorker();
    const analyzer = createAudioFeatureAnalyzer(
      {},
      {
        WorkerCtor: function WorkerCtor() {},
        createWorker: () => fakeWorker,
      },
    );

    expect(fakeWorker.messages[0].payload.type).toBe("init");
    fakeWorker.emit("message", {
      type: "status",
      state: "ready",
      reason: "model-ready",
      error: null,
    });
    fakeWorker.emit("message", {
      type: "hint",
      hint: {
        sessionKey: "file:4",
        frameTimeMs: 32,
        pitchConfidence: 0.62,
        harmonicity: 0.54,
        transientSalience: 0.48,
        bassSalience: 0.41,
        novelty: 0.58,
        textureSpread: 0.36,
        voicingProbability: 0.33,
        releaseBias: 0.44,
        analysisLatencyMs: 2.1,
      },
    });

    const freshHint = analyzer.readHints({
      status: makeStatus(),
      frameTimeMs: 80,
    });
    expect(freshHint.active).toBe(true);
    expect(freshHint.pitchConfidence).toBeCloseTo(0.62);
    expect(freshHint.workerState).toBe("ready");
    expect(freshHint.hintSource).toBe("onnx-worker");

    const staleHint = analyzer.readHints({
      status: makeStatus(),
      frameTimeMs: 160,
    });
    expect(staleHint.active).toBe(false);
    expect(staleHint.workerState).toBe("ready");

    const wrongSessionHint = analyzer.readHints({
      status: makeStatus({ playbackSessionId: 9 }),
      frameTimeMs: 64,
    });
    expect(wrongSessionHint.active).toBe(false);

    analyzer.dispose();
    expect(fakeWorker.terminated).toBe(true);
  });

  it("enqueues compact frames to the worker", () => {
    const fakeWorker = new FakeWorker();
    const analyzer = createAudioFeatureAnalyzer(
      {},
      {
        WorkerCtor: function WorkerCtor() {},
        createWorker: () => fakeWorker,
      },
    );

    analyzer.enqueueAnalysisFrame({
      analysisSnapshot: {
        fftMagnitudes: makeFft([
          [140, 1],
          [420, 0.45],
        ]),
        avgAmplitude: 32,
        rms: 0.22,
      },
      status: makeStatus(),
      frameTimeMs: 48,
    });

    expect(fakeWorker.messages[1].payload.type).toBe("frame");
    expect(fakeWorker.messages[1].payload.frame.mel64).toBeInstanceOf(
      Float32Array,
    );
    expect(fakeWorker.messages[1].payload.frame.frameId).toBe(1);
  });
});
