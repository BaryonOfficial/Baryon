import { describe, expect, it } from "vitest";
import {
  buildAudioFeatureFrame,
  createAudioFeatureState,
  detectMicNoiseGate,
  applyTestToneToSnapshot,
} from "./buildFeatureFrame.js";

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

  it("freezes mode slots on first active frame and holds them on subsequent frames", () => {
    const featureState = createAudioFeatureState();
    const activeFft = new Float32Array(16);
    activeFft[1] = 0.95;
    const activeStatus = createStatus({
      audioInputMode: "file",
      analysisSource: "file",
      isPlaying: true,
      isAudioLoaded: true,
      hasAnalysisSource: true,
    });

    // First frame — active signal, freeze off — slots are populated
    const first = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes: activeFft }),
      featureState,
      radius: 3,
      status: activeStatus,
      auditSettings: { enabled: true, freezeModeSlots: false, injectTestTone: false, testToneHz: 440, testToneAmplitude: 0.5, logEveryFrames: 30 },
    });
    expect(first.fieldState).toBe("active");
    const capturedSlots = Array.from(first.modeSlots);

    // Second frame — freeze on — slots should be captured from the first active frame
    const second = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes: activeFft }),
      featureState,
      radius: 3,
      status: activeStatus,
      auditSettings: { enabled: true, freezeModeSlots: true, injectTestTone: false, testToneHz: 440, testToneAmplitude: 0.5, logEveryFrames: 30 },
    });
    expect(Array.from(second.modeSlots)).toEqual(capturedSlots);

    // Third frame — silent FFT with freeze still on — frozen slots unchanged
    const third = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes: new Float32Array(16) }),
      featureState,
      radius: 3,
      status: activeStatus,
      auditSettings: { enabled: true, freezeModeSlots: true, injectTestTone: false, testToneHz: 440, testToneAmplitude: 0.5, logEveryFrames: 30 },
    });
    expect(Array.from(third.modeSlots)).toEqual(capturedSlots);
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

describe("detectMicNoiseGate", () => {
  it("activates when inputMode is mic and both amplitude and rms are near zero", () => {
    expect(detectMicNoiseGate({ injectTestTone: false, inputMode: "mic", avgAmplitude: 0, rms: 0 })).toBe(true);
  });

  it("does not activate when test tone is injected, even with silence", () => {
    expect(detectMicNoiseGate({ injectTestTone: true, inputMode: "mic", avgAmplitude: 0, rms: 0 })).toBe(false);
  });

  it("does not activate for file or idle input mode", () => {
    expect(detectMicNoiseGate({ injectTestTone: false, inputMode: "file", avgAmplitude: 0, rms: 0 })).toBe(false);
    expect(detectMicNoiseGate({ injectTestTone: false, inputMode: "idle", avgAmplitude: 0, rms: 0 })).toBe(false);
  });

  it("does not activate when amplitude is clearly above the silence threshold", () => {
    expect(detectMicNoiseGate({ injectTestTone: false, inputMode: "mic", avgAmplitude: 200, rms: 1.0 })).toBe(false);
  });
});

describe("applyTestToneToSnapshot", () => {
  it("places a single bin at the correct frequency with the given amplitude", () => {
    const snapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 440, testToneAmplitude: 0.8 },
      fftSize: 32,
      sampleRate: 44100,
    });

    expect(snapshot.sourceMode).toBe("test");
    expect(snapshot.avgAmplitude).toBeCloseTo(0.8 * 255);
    const nonZero = Array.from(snapshot.fftMagnitudes).filter((v) => v > 0);
    expect(nonZero).toHaveLength(1);
    expect(nonZero[0]).toBeCloseTo(0.8);
  });

  it("clamps amplitude above 1 to 1", () => {
    const snapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 440, testToneAmplitude: 3.5 },
      fftSize: 32,
      sampleRate: 44100,
    });

    expect(snapshot.avgAmplitude).toBeCloseTo(255);
  });

  it("clamps a frequency above Nyquist to the last valid bin", () => {
    const snapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 99999, testToneAmplitude: 0.5 },
      fftSize: 32,
      sampleRate: 44100,
    });

    const lastBin = snapshot.fftMagnitudes[snapshot.fftMagnitudes.length - 1];
    expect(lastBin).toBeCloseTo(0.5);
  });

  it("places a 0 Hz tone in the first bin", () => {
    const snapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 0, testToneAmplitude: 0.6 },
      fftSize: 32,
      sampleRate: 44100,
    });

    expect(snapshot.fftMagnitudes[0]).toBeCloseTo(0.6);
  });
});
