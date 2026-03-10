import { describe, expect, it } from "vitest";
import { buildAudioFeatureFrame, createAudioFeatureState } from "./buildFeatureFrame.js";

function createStatus(overrides = {}) {
  return {
    audioInputMode: "idle",
    analysisSource: "idle",
    pitchSourceMode: "spectral",
    fftSize: 32,
    capacity: 8,
    sampleRate: 44100,
    isAudioLoaded: false,
    isPlaying: false,
    isMicActive: false,
    hasAnalysisSource: false,
    workerStatus: null,
    ...overrides,
  };
}

function createSnapshot(overrides = {}) {
  return {
    sourceMode: "file",
    avgAmplitude: 24,
    fftMagnitudes: new Float32Array(16),
    timeData: new Float32Array(32),
    rms: 0.2,
    ...overrides,
  };
}

describe("buildAudioFeatureFrame", () => {
  it("returns idle output for missing analysis input", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
    });

    expect(frame.fieldState).toBe("idle");
    expect(frame.hasModalField).toBe(false);
    expect(frame.averageAmplitude).toBe(0);
    expect(frame.modeSlots.every((value) => value === 0)).toBe(true);
  });

  it("suppresses mic modal activation when the silence gate is active", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = new Float32Array(16);
    fftMagnitudes[1] = 1;

    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "mic",
        avgAmplitude: 2,
        fftMagnitudes,
        rms: 0.01,
      }),
      featureState,
      radius: 3,
      status: createStatus({
        audioInputMode: "mic",
        analysisSource: "mic",
        isMicActive: true,
        hasAnalysisSource: true,
      }),
    });

    expect(frame.fieldState).toBe("idle");
    expect(frame.debug.micNoiseGateActive).toBe(true);
    expect(frame.debug.modeSlotCount).toBe(0);
  });

  it("builds active modal slots from spectral peaks", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = new Float32Array(16);
    fftMagnitudes[1] = 0.95;
    fftMagnitudes[2] = 0.3;

    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes }),
      featureState,
      radius: 3,
      status: createStatus({
        audioInputMode: "file",
        analysisSource: "file",
        isPlaying: true,
        isAudioLoaded: true,
        hasAnalysisSource: true,
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.hasModalField).toBe(true);
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
    expect(frame.debug.pitchSource).toBe("spectral");
  });

  it("decays the modal stack when live analysis temporarily weakens", () => {
    const featureState = createAudioFeatureState();
    const activeFft = new Float32Array(16);
    activeFft[1] = 1;

    buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes: activeFft }),
      featureState,
      radius: 3,
      status: createStatus({
        audioInputMode: "file",
        analysisSource: "file",
        isPlaying: true,
        isAudioLoaded: true,
        hasAnalysisSource: true,
      }),
    });

    const decayed = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 30,
        fftMagnitudes: new Float32Array(16),
        rms: 0.25,
      }),
      featureState,
      radius: 3,
      status: createStatus({
        audioInputMode: "file",
        analysisSource: "file",
        isPlaying: true,
        isAudioLoaded: true,
        hasAnalysisSource: true,
      }),
    });

    expect(decayed.fieldState).toBe("decay");
    expect(decayed.debug.modeSlotCount).toBeGreaterThan(0);
  });

  it("injects deterministic test-tone analysis", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      auditSettings: {
        enabled: true,
        freezeModeSlots: false,
        injectTestTone: true,
        testToneHz: 660,
        testToneAmplitude: 0.75,
        logEveryFrames: 30,
      },
    });

    expect(frame.fieldState).toBe("test");
    expect(frame.debug.pitchSource).toBe("test");
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
    expect(frame.averageAmplitude).toBeCloseTo(191.25);
  });
});
