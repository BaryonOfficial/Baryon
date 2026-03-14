import { describe, expect, it } from "vitest";
import {
  applyTestToneToSnapshot,
  buildAudioFeatureFrame,
  createAudioFeatureState,
  detectMicNoiseGate,
} from "./buildFeatureFrame.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const NYQUIST = SAMPLE_RATE / 2;

function createStatus(overrides = {}) {
  return {
    audioInputMode: "idle",
    analysisSource: "idle",
    pitchSourceMode: "spectral",
    fftSize: FFT_SIZE,
    capacity: 8,
    sampleRate: SAMPLE_RATE,
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
    fftMagnitudes: new Float32Array(BIN_COUNT),
    timeData: new Float32Array(FFT_SIZE),
    rms: 0.2,
    ...overrides,
  };
}

function freqToBin(freq) {
  return Math.round((freq / NYQUIST) * (BIN_COUNT - 1));
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    fft[Math.max(1, freqToBin(frequency))] = amplitude;
  }
  return fft;
}

function makeActiveStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "file",
    analysisSource: "file",
    isPlaying: true,
    isAudioLoaded: true,
    hasAnalysisSource: true,
    ...overrides,
  });
}

function createAuditSettings(overrides = {}) {
  return {
    enabled: true,
    freezeModeSlots: false,
    injectTestTone: false,
    testToneHz: 440,
    testToneAmplitude: 0.5,
    logEveryFrames: 30,
    ...overrides,
  };
}

function makeMicStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "mic",
    analysisSource: "mic",
    isMicActive: true,
    hasAnalysisSource: true,
    ...overrides,
  });
}

function buildTimedFrame({
  featureState,
  fftMagnitudes,
  avgAmplitude = 24,
  rms = 0.2,
  frameTimeMs = 0,
  status = makeActiveStatus(),
}) {
  return buildAudioFeatureFrame({
    analysisSnapshot: createSnapshot({
      avgAmplitude,
      fftMagnitudes,
      rms,
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs,
  });
}

function buildMicFrame({
  featureState,
  peaks,
  avgAmplitude,
  rms,
  frameTimeMs,
  profile = "voice-tone",
  status = makeMicStatus(),
}) {
  return buildAudioFeatureFrame({
    analysisSnapshot: createSnapshot({
      sourceMode: "mic",
      avgAmplitude,
      fftMagnitudes: makeFft(peaks),
      rms,
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs,
    micAnalysisSettings: { profile },
  });
}

function readModeKeys(slotBuffer) {
  const keys = [];
  for (let i = 0; i < slotBuffer.length; i += 4) {
    if ((slotBuffer[i + 3] ?? 0) <= 0) continue;
    keys.push(`${slotBuffer[i]}:${slotBuffer[i + 1]}:${slotBuffer[i + 2]}`);
  }
  return keys;
}

describe("buildAudioFeatureFrame layered contract", () => {
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
    expect(frame.backboneSlots.every((value) => value === 0)).toBe(true);
    expect(frame.detailSlots.every((value) => value === 0)).toBe(true);
    expect(frame.bandEnergies.every((value) => value === 0)).toBe(true);
    expect(frame.transientEnergy).toBe(0);
    expect(frame.spectralFlux).toBe(0);
  });

  it("derives structure, energy, change, and pulse signals from the modal field", () => {
    const featureState = createAudioFeatureState();
    const steadyFrame = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.62],
        [330, 0.36],
      ]),
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 0,
    });
    const changingFrame = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [150, 1],
        [300, 0.74],
        [520, 0.42],
        [1200, 0.21],
      ]),
      avgAmplitude: 58,
      rms: 0.24,
      frameTimeMs: 16,
    });

    expect(steadyFrame.structureSignal).toBeGreaterThan(0.2);
    expect(steadyFrame.energySignal).toBeGreaterThan(0.1);
    expect(steadyFrame.changeSignal).toBeGreaterThanOrEqual(0);
    expect(steadyFrame.pulseSignal).toBeGreaterThanOrEqual(0);
    expect(steadyFrame.debug.structureSignal).toBe(steadyFrame.structureSignal);
    expect(steadyFrame.debug.energySignal).toBe(steadyFrame.energySignal);
    expect(steadyFrame.debug.changeSignal).toBe(steadyFrame.changeSignal);
    expect(steadyFrame.debug.pulseSignal).toBe(steadyFrame.pulseSignal);

    expect(changingFrame.structureSignal).toBeGreaterThan(0.25);
    expect(changingFrame.energySignal).toBeGreaterThan(
      steadyFrame.energySignal,
    );
    expect(changingFrame.changeSignal).toBeGreaterThan(0.2);
  });

  it("keeps ambient mic input idle during startup calibration", () => {
    const featureState = createAudioFeatureState();
    const first = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    const mid = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 400,
    });
    const done = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 760,
    });

    expect(first.fieldState).toBe("idle");
    expect(first.debug.micNoiseGateActive).toBe(true);
    expect(first.debug.micCalibrationActive).toBe(true);
    expect(mid.debug.micCalibrationActive).toBe(true);
    expect(done.debug.micCalibrationActive).toBe(false);
    expect(done.debug.micNoiseGateActive).toBe(true);
    expect(done.debug.micBaselineRms).toBeGreaterThan(0);
    expect(done.debug.micBaselinePeak).toBeGreaterThan(0);
  });

  it("opens quickly for voice after calibration", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 300,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 760,
    });
    const firstVoice = buildMicFrame({
      featureState,
      peaks: [
        [180, 0.22],
        [320, 0.18],
        [540, 0.12],
        [960, 0.08],
      ],
      avgAmplitude: 5.9,
      rms: 0.021,
      frameTimeMs: 800,
    });
    const secondVoice = buildMicFrame({
      featureState,
      peaks: [
        [180, 0.24],
        [320, 0.19],
        [540, 0.13],
        [960, 0.085],
      ],
      avgAmplitude: 6.2,
      rms: 0.0225,
      frameTimeMs: 830,
    });

    expect(firstVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.debug.micProfile).toBe("voice-tone");
    expect(secondVoice.fieldState).toBe("active");
    expect(secondVoice.debug.modeSlotCount).toBeGreaterThan(0);
  });

  it("keeps steady fan-like noise gated after voice calibration", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.18],
        [180, 0.16],
        [270, 0.14],
      ],
      avgAmplitude: 3,
      rms: 0.012,
      frameTimeMs: 0,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.18],
        [180, 0.16],
        [270, 0.14],
      ],
      avgAmplitude: 3,
      rms: 0.012,
      frameTimeMs: 300,
    });
    const frame = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.18],
        [180, 0.16],
        [270, 0.14],
      ],
      avgAmplitude: 3,
      rms: 0.012,
      frameTimeMs: 780,
    });

    expect(frame.debug.micCalibrationActive).toBe(false);
    expect(frame.debug.micNoiseGateActive).toBe(true);
    expect(frame.fieldState).toBe("idle");
  });

  it("lets ambient admit quieter room audio than voice", () => {
    const voiceState = createAudioFeatureState();
    const ambientState = createAudioFeatureState();

    for (const [featureState, profile] of [
      [voiceState, "voice-tone"],
      [ambientState, "ambient"],
    ]) {
      buildMicFrame({
        featureState,
        peaks: [
          [90, 0.09],
          [180, 0.07],
        ],
        avgAmplitude: 2.5,
        rms: 0.006,
        frameTimeMs: 0,
        profile,
      });
      buildMicFrame({
        featureState,
        peaks: [
          [90, 0.09],
          [180, 0.07],
        ],
        avgAmplitude: 2.6,
        rms: 0.0065,
        frameTimeMs: 300,
        profile,
      });
      buildMicFrame({
        featureState,
        peaks: [
          [90, 0.09],
          [180, 0.07],
        ],
        avgAmplitude: 2.6,
        rms: 0.0065,
        frameTimeMs: 760,
        profile,
      });
    }

    const voiceFrame = buildMicFrame({
      featureState: voiceState,
      peaks: [
        [120, 0.11],
        [240, 0.09],
        [360, 0.07],
      ],
      avgAmplitude: 3.4,
      rms: 0.0075,
      frameTimeMs: 800,
      profile: "voice-tone",
    });
    const ambientFrame = buildMicFrame({
      featureState: ambientState,
      peaks: [
        [120, 0.11],
        [240, 0.09],
        [360, 0.07],
      ],
      avgAmplitude: 3.4,
      rms: 0.0075,
      frameTimeMs: 800,
      profile: "ambient",
    });

    expect(voiceFrame.debug.micNoiseGateActive).toBe(true);
    expect(ambientFrame.debug.micNoiseGateActive).toBe(false);
  });

  it("holds the mic gate open across brief dropouts and closes after four quiet frames", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 300,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 760,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [880, 0.1],
      ],
      avgAmplitude: 7,
      rms: 0.028,
      frameTimeMs: 800,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [220, 0.31],
        [440, 0.19],
        [880, 0.11],
      ],
      avgAmplitude: 7.2,
      rms: 0.029,
      frameTimeMs: 830,
    });

    const quiet1 = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 860,
    });
    const quiet2 = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 890,
    });
    const quiet3 = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 920,
    });
    const quiet4 = buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 950,
    });

    expect(quiet1.debug.micNoiseGateActive).toBe(false);
    expect(quiet2.debug.micNoiseGateActive).toBe(false);
    expect(quiet3.debug.micNoiseGateActive).toBe(false);
    expect(quiet4.debug.micNoiseGateActive).toBe(true);
    expect(quiet4.fieldState).toBe("idle");
  });

  it("recalibrates when mic mode is restarted", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 300,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 760,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [880, 0.1],
      ],
      avgAmplitude: 7,
      rms: 0.028,
      frameTimeMs: 800,
    });
    buildMicFrame({
      featureState,
      peaks: [
        [220, 0.31],
        [440, 0.19],
        [880, 0.11],
      ],
      avgAmplitude: 7.2,
      rms: 0.029,
      frameTimeMs: 830,
    });

    buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 1200,
    });

    const restarted = buildMicFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [880, 0.1],
      ],
      avgAmplitude: 7,
      rms: 0.028,
      frameTimeMs: 1400,
    });

    expect(restarted.debug.micCalibrationActive).toBe(true);
    expect(restarted.debug.micNoiseGateActive).toBe(true);
    expect(restarted.fieldState).toBe("idle");
  });

  it("recalibrates when the mic profile changes mid-session", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
      profile: "voice-tone",
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 300,
      profile: "voice-tone",
    });
    buildMicFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: 760,
      profile: "voice-tone",
    });

    buildMicFrame({
      featureState,
      peaks: [
        [180, 0.24],
        [320, 0.19],
        [540, 0.13],
      ],
      avgAmplitude: 6,
      rms: 0.022,
      frameTimeMs: 800,
      profile: "voice-tone",
    });
    const activeVoice = buildMicFrame({
      featureState,
      peaks: [
        [180, 0.25],
        [320, 0.2],
        [540, 0.14],
      ],
      avgAmplitude: 6.2,
      rms: 0.023,
      frameTimeMs: 830,
      profile: "voice-tone",
    });
    const profileSwitch = buildMicFrame({
      featureState,
      peaks: [
        [180, 0.25],
        [320, 0.2],
        [540, 0.14],
      ],
      avgAmplitude: 6.2,
      rms: 0.023,
      frameTimeMs: 860,
      profile: "ambient",
    });

    expect(activeVoice.debug.micNoiseGateActive).toBe(false);
    expect(activeVoice.fieldState).toBe("active");
    expect(profileSwitch.debug.micCalibrationActive).toBe(true);
    expect(profileSwitch.debug.micProfile).toBe("ambient");
    expect(profileSwitch.debug.micNoiseGateActive).toBe(true);
    expect(profileSwitch.fieldState).toBe("idle");
  });

  it("still opens voice when calibration captured a strong narrowband background peak", () => {
    const featureState = createAudioFeatureState();

    buildMicFrame({
      featureState,
      peaks: [
        [120, 0.76],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.3,
      rms: 0.0044,
      frameTimeMs: 0,
      profile: "voice-tone",
    });
    buildMicFrame({
      featureState,
      peaks: [
        [120, 0.75],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.2,
      rms: 0.0043,
      frameTimeMs: 300,
      profile: "voice-tone",
    });
    buildMicFrame({
      featureState,
      peaks: [
        [120, 0.75],
        [240, 0.17],
        [360, 0.08],
      ],
      avgAmplitude: 1.1,
      rms: 0.0042,
      frameTimeMs: 760,
      profile: "voice-tone",
    });

    const firstVoice = buildMicFrame({
      featureState,
      peaks: [
        [180, 0.24],
        [320, 0.2],
        [540, 0.13],
        [900, 0.08],
      ],
      avgAmplitude: 6.1,
      rms: 0.021,
      frameTimeMs: 800,
      profile: "voice-tone",
    });
    const secondVoice = buildMicFrame({
      featureState,
      peaks: [
        [180, 0.25],
        [320, 0.21],
        [540, 0.14],
        [900, 0.085],
      ],
      avgAmplitude: 6.3,
      rms: 0.022,
      frameTimeMs: 830,
      profile: "voice-tone",
    });

    expect(firstVoice.debug.micBaselinePeak).toBeGreaterThan(0.7);
    expect(firstVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
  });

  it("opens voice for low-rms desk voice levels after calibration", () => {
    const featureState = createAudioFeatureState();

    buildMicFrame({
      featureState,
      peaks: [
        [120, 0.83],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.1,
      rms: 0.0012,
      frameTimeMs: 0,
      profile: "voice-tone",
    });
    buildMicFrame({
      featureState,
      peaks: [
        [120, 0.82],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.1,
      rms: 0.0012,
      frameTimeMs: 300,
      profile: "voice-tone",
    });
    buildMicFrame({
      featureState,
      peaks: [
        [120, 0.82],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.1,
      rms: 0.0012,
      frameTimeMs: 760,
      profile: "voice-tone",
    });

    const firstVoice = buildMicFrame({
      featureState,
      peaks: [
        [220, 0.14],
        [640, 0.15],
        [1240, 0.13],
        [2480, 0.09],
      ],
      avgAmplitude: 4.42,
      rms: 0.00185,
      frameTimeMs: 800,
      profile: "voice-tone",
    });
    const secondVoice = buildMicFrame({
      featureState,
      peaks: [
        [220, 0.145],
        [640, 0.16],
        [1240, 0.135],
        [2480, 0.095],
      ],
      avgAmplitude: 4.5,
      rms: 0.00192,
      frameTimeMs: 830,
      profile: "voice-tone",
    });

    expect(firstVoice.debug.micBaselineRms).toBeLessThan(0.0013);
    expect(firstVoice.debug.micBaselinePeak).toBeGreaterThan(0.8);
    expect(firstVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
  });

  it("builds layered backbone/detail slots from spectral peaks", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 70,
        fftMagnitudes: makeFft([
          [330, 0.95],
          [660, 0.72],
          [990, 0.45],
        ]),
        rms: 0.3,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.hasModalField).toBe(true);
    expect(frame.debug.analysisEngine).toBe("layered");
    expect(frame.debug.backboneModeCount).toBeGreaterThan(0);
    expect(frame.debug.detailModeCount).toBeGreaterThan(0);
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
    expect(frame.backboneSlots.some((value) => value !== 0)).toBe(true);
    expect(frame.detailSlots.some((value) => value !== 0)).toBe(true);
  });

  it("updates detail slots immediately while the backbone stays structurally continuous", () => {
    const featureState = createAudioFeatureState();
    const first = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 60,
        fftMagnitudes: makeFft([
          [220, 1],
          [440, 0.55],
        ]),
        rms: 0.24,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings(),
    });
    const second = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 62,
        fftMagnitudes: makeFft([
          [1320, 1],
          [1760, 0.6],
        ]),
        rms: 0.26,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings(),
    });

    const firstBackbone = readModeKeys(first.backboneSlots);
    const secondBackbone = readModeKeys(second.backboneSlots);
    expect(second.debug.spectralCandidates[0]?.frequency).not.toBeCloseTo(
      first.debug.spectralCandidates[0]?.frequency ?? 0,
    );
    expect(second.debug.detailModeCount).toBeGreaterThan(0);
    expect(secondBackbone.some((key) => firstBackbone.includes(key))).toBe(
      true,
    );
  });

  it("tracks transient energy and spectral flux on attacks while settling on repeated frames", () => {
    const featureState = createAudioFeatureState();
    const repeatedFft = makeFft([
      [220, 0.4],
      [440, 0.5],
    ]);

    const first = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 20,
        fftMagnitudes: repeatedFft,
        rms: 0.12,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const repeated = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 20,
        fftMagnitudes: repeatedFft,
        rms: 0.12,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const attack = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 65,
        fftMagnitudes: makeFft([
          [220, 0.3],
          [440, 1],
          [1760, 0.75],
        ]),
        rms: 0.34,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });

    expect(repeated.spectralFlux).toBeCloseTo(0, 6);
    expect(repeated.transientEnergy).toBeLessThanOrEqual(first.transientEnergy);
    expect(attack.spectralFlux).toBeGreaterThan(repeated.spectralFlux);
    expect(attack.transientEnergy).toBeGreaterThan(repeated.transientEnergy);
  });

  it("detects a strong low-end onset and increments the beat pulse id", () => {
    const featureState = createAudioFeatureState();
    buildTimedFrame({
      featureState,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      avgAmplitude: 8,
      rms: 0.05,
      frameTimeMs: 0,
    });

    const beat = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [60, 1],
        [120, 0.7],
      ]),
      avgAmplitude: 72,
      rms: 0.4,
      frameTimeMs: 40,
    });

    expect(beat.beatDetected).toBe(true);
    expect(beat.beatPulseId).toBe(1);
    expect(beat.beatStrength).toBeGreaterThan(0);
    expect(beat.beatConfidence).toBeGreaterThan(0);
    expect(beat.debug.beatDetected).toBe(true);
  });

  it("detects a moderate kick with the tuned default sensitivity", () => {
    const featureState = createAudioFeatureState();
    buildTimedFrame({
      featureState,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      avgAmplitude: 10,
      rms: 0.06,
      frameTimeMs: 0,
    });

    const beat = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [60, 0.72],
        [120, 0.42],
      ]),
      avgAmplitude: 46,
      rms: 0.22,
      frameTimeMs: 50,
    });

    expect(beat.beatDetected).toBe(true);
    expect(beat.beatStrength).toBeGreaterThan(0);
  });

  it("does not treat high-frequency only bursts as beats", () => {
    const featureState = createAudioFeatureState();
    buildTimedFrame({
      featureState,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      avgAmplitude: 10,
      rms: 0.04,
      frameTimeMs: 0,
    });

    const hats = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [5000, 1],
        [9000, 0.8],
      ]),
      avgAmplitude: 56,
      rms: 0.35,
      frameTimeMs: 35,
    });

    expect(hats.spectralFlux).toBeGreaterThan(0);
    expect(hats.beatDetected).toBe(false);
    expect(hats.beatPulseId).toBe(0);
  });

  it("does not retrigger on sustained bass without a fresh onset", () => {
    const featureState = createAudioFeatureState();
    const bassFft = makeFft([
      [60, 1],
      [120, 0.6],
    ]);

    const first = buildTimedFrame({
      featureState,
      fftMagnitudes: bassFft,
      avgAmplitude: 68,
      rms: 0.36,
      frameTimeMs: 0,
    });
    const held = buildTimedFrame({
      featureState,
      fftMagnitudes: bassFft,
      avgAmplitude: 68,
      rms: 0.36,
      frameTimeMs: 220,
    });

    expect(first.beatDetected).toBe(true);
    expect(held.beatDetected).toBe(false);
    expect(held.beatPulseId).toBe(first.beatPulseId);
  });

  it("keeps low-level mic noise from producing beat pulses", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "mic",
        avgAmplitude: 2,
        fftMagnitudes: makeFft([[80, 0.12]]),
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
      frameTimeMs: 25,
    });

    expect(frame.debug.micNoiseGateActive).toBe(true);
    expect(frame.beatDetected).toBe(false);
    expect(frame.beatPulseId).toBe(0);
  });

  it("suppresses consecutive kicks inside the refractory window and retriggers after it", () => {
    const featureState = createAudioFeatureState();
    const kickFft = makeFft([
      [60, 1],
      [120, 0.65],
    ]);
    const silenceFft = new Float32Array(BIN_COUNT);

    const first = buildTimedFrame({
      featureState,
      fftMagnitudes: kickFft,
      avgAmplitude: 70,
      rms: 0.38,
      frameTimeMs: 0,
    });
    buildTimedFrame({
      featureState,
      fftMagnitudes: silenceFft,
      avgAmplitude: 6,
      rms: 0.03,
      frameTimeMs: 60,
    });
    const blocked = buildTimedFrame({
      featureState,
      fftMagnitudes: kickFft,
      avgAmplitude: 70,
      rms: 0.38,
      frameTimeMs: 100,
    });
    buildTimedFrame({
      featureState,
      fftMagnitudes: silenceFft,
      avgAmplitude: 6,
      rms: 0.03,
      frameTimeMs: 180,
    });
    const retriggered = buildTimedFrame({
      featureState,
      fftMagnitudes: kickFft,
      avgAmplitude: 72,
      rms: 0.4,
      frameTimeMs: 260,
    });

    expect(first.beatDetected).toBe(true);
    expect(blocked.beatDetected).toBe(false);
    expect(blocked.beatPulseId).toBe(first.beatPulseId);
    expect(retriggered.beatDetected).toBe(true);
    expect(retriggered.beatPulseId).toBe(first.beatPulseId + 1);
  });

  it("resets beat tracking when playback time rewinds for a new play session", () => {
    const featureState = createAudioFeatureState();
    const kickFft = makeFft([
      [60, 1],
      [120, 0.7],
    ]);

    const firstSessionBeat = buildTimedFrame({
      featureState,
      fftMagnitudes: kickFft,
      avgAmplitude: 72,
      rms: 0.4,
      frameTimeMs: 1800,
    });

    const secondSessionBeat = buildTimedFrame({
      featureState,
      fftMagnitudes: kickFft,
      avgAmplitude: 74,
      rms: 0.42,
      frameTimeMs: 40,
    });

    expect(firstSessionBeat.beatDetected).toBe(true);
    expect(secondSessionBeat.beatDetected).toBe(true);
    expect(secondSessionBeat.beatPulseId).toBe(1);
  });

  it("keeps spectral flux near zero across repeated identical frames", () => {
    const featureState = createAudioFeatureState();
    const steadySnapshot = createSnapshot({
      avgAmplitude: 32,
      fftMagnitudes: makeFft([
        [330, 0.55],
        [660, 0.35],
      ]),
      rms: 0.18,
    });
    const status = makeActiveStatus();

    buildAudioFeatureFrame({
      analysisSnapshot: steadySnapshot,
      featureState,
      radius: 3,
      status,
    });

    const repeated = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: steadySnapshot.avgAmplitude,
        fftMagnitudes: steadySnapshot.fftMagnitudes,
        rms: steadySnapshot.rms,
      }),
      featureState,
      radius: 3,
      status,
    });

    expect(repeated.spectralFlux).toBeCloseTo(0, 6);
    expect(repeated.transientEnergy).toBeLessThan(0.01);
  });

  it("computes band energies and centroid without aliasing analyser-owned fft buffers", () => {
    const featureState = createAudioFeatureState();
    const sharedFft = makeFft([
      [60, 0.9],
      [5000, 0.75],
    ]);
    const status = makeActiveStatus();

    const first = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 48,
        fftMagnitudes: sharedFft,
        rms: 0.2,
      }),
      featureState,
      radius: 3,
      status,
    });
    const persistentFft = featureState.analysis.fftMagnitudes;

    expect(first.fftMagnitudes).toBe(persistentFft);
    expect(first.fftMagnitudes).not.toBe(sharedFft);
    expect(first.bandEnergies[0]).toBeGreaterThan(0);
    expect(first.bandEnergies[3]).toBeGreaterThan(0);
    expect(first.spectralCentroid).toBeGreaterThan(0.1);
    const firstAirBand = first.bandEnergies[3];

    sharedFft.fill(0);
    sharedFft[freqToBin(120)] = 0.8;

    const second = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 30,
        fftMagnitudes: sharedFft,
        rms: 0.16,
      }),
      featureState,
      radius: 3,
      status,
    });

    expect(second.fftMagnitudes).toBe(persistentFft);
    expect(second.fftMagnitudes[freqToBin(120)]).toBeCloseTo(0.8);
    expect(second.bandEnergies[0]).toBeGreaterThan(0);
    expect(second.bandEnergies[3]).toBeLessThan(firstAirBand);
  });

  it("freezes layered slots for audit playback snapshots", () => {
    const featureState = createAudioFeatureState();
    const status = makeActiveStatus();
    const activeFft = makeFft([
      [440, 0.95],
      [880, 0.5],
    ]);

    buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes: activeFft }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings(),
    });

    const frozen = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({ fftMagnitudes: activeFft }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });
    const capturedBackbone = Array.from(frozen.backboneSlots);
    const capturedDetail = Array.from(frozen.detailSlots);

    const held = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: new Float32Array(BIN_COUNT),
      }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });

    expect(Array.from(held.backboneSlots)).toEqual(capturedBackbone);
    expect(Array.from(held.detailSlots)).toEqual(capturedDetail);
  });

  it("injects deterministic test-tone analysis through the layered path", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      auditSettings: createAuditSettings({
        injectTestTone: true,
        testToneHz: 660,
        testToneAmplitude: 0.75,
      }),
    });

    expect(frame.fieldState).toBe("test");
    expect(frame.debug.pitchSource).toBe("test");
    expect(frame.debug.backboneModeCount).toBeGreaterThan(0);
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
    expect(frame.averageAmplitude).toBeCloseTo(191.25);
  });

  it("returns a lightweight debug summary when audit is disabled", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 48,
        fftMagnitudes: makeFft([
          [330, 0.95],
          [660, 0.72],
        ]),
        rms: 0.25,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });

    expect(frame.debug.analysisEngine).toBe("layered");
    expect(frame.debug.backboneModeCount).toBeGreaterThan(0);
    expect(frame.debug.currentModeSlots).toBeUndefined();
    expect(frame.debug.backboneSlots).toBeUndefined();
    expect(frame.debug.spectralCandidates).toBeUndefined();
    expect(frame.debug.slotAmplitudeDeltas).toBeUndefined();
  });

  it("keeps the full debug payload when audit is enabled", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 52,
        fftMagnitudes: makeFft([
          [440, 0.95],
          [880, 0.5],
        ]),
        rms: 0.28,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings(),
    });

    expect(frame.debug.currentModeSlots).toBeInstanceOf(Array);
    expect(frame.debug.backboneSlots).toBeInstanceOf(Array);
    expect(frame.debug.bandEnergies).toBeInstanceOf(Array);
    expect(frame.debug.slotAmplitudeDeltas).toBeInstanceOf(Array);
    expect(frame.debug.spectralCandidates).toBeInstanceOf(Array);
  });
});

describe("chromesthesia feature frame outputs", () => {
  it("populates backbone and detail color slots for active analysis", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: makeFft([
          [220, 0.95],
          [440, 0.72],
          [660, 0.44],
          [880, 0.28],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });

    expect(frame.backboneColorSlots.some((value) => value > 0)).toBe(true);
    expect(frame.detailColorSlots.some((value) => value > 0)).toBe(true);
    expect(frame.debug.chromesthesiaComponents.length).toBeGreaterThan(0);
    expect(frame.debug.chromesthesiaComponents[0]).toMatchObject({
      frequency: expect.any(Number),
      noteName: expect.any(String),
      rgb: {
        r: expect.any(Number),
        g: expect.any(Number),
        b: expect.any(Number),
      },
    });
  });

  it("freezes chromesthesia color slots alongside frozen modal slots", () => {
    const featureState = createAudioFeatureState();
    const first = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: makeFft([
          [220, 0.95],
          [440, 0.72],
          [660, 0.44],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });
    const second = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: makeFft([
          [330, 0.92],
          [550, 0.68],
          [770, 0.42],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });

    expect(Array.from(second.backboneSlots)).toEqual(
      Array.from(first.backboneSlots),
    );
    expect(Array.from(second.backboneColorSlots)).toEqual(
      Array.from(first.backboneColorSlots),
    );
    expect(Array.from(second.detailColorSlots)).toEqual(
      Array.from(first.detailColorSlots),
    );
  });
});

describe("mic noise gate", () => {
  it("opens when mic energy exceeds the voice hard floor", () => {
    expect(
      detectMicNoiseGate({
        injectTestTone: false,
        inputMode: "mic",
        avgAmplitude: 16,
        rms: 0.04,
      }),
    ).toBe(false);
  });

  it("keeps tiny voice-profile ambient noise gated", () => {
    expect(
      detectMicNoiseGate({
        injectTestTone: false,
        inputMode: "mic",
        avgAmplitude: 1.8,
        rms: 0.005,
        fftMagnitudes: makeFft([
          [90, 0.08],
          [180, 0.06],
        ]),
        micAnalysisSettings: { profile: "voice-tone" },
      }),
    ).toBe(true);
  });

  it("lets ambient profile clear the hard floor for modest room audio", () => {
    expect(
      detectMicNoiseGate({
        injectTestTone: false,
        inputMode: "mic",
        avgAmplitude: 4.5,
        rms: 0.015,
        fftMagnitudes: makeFft([
          [120, 0.18],
          [240, 0.15],
          [360, 0.12],
        ]),
        micAnalysisSettings: { profile: "ambient" },
      }),
    ).toBe(false);
  });
});

describe("test-tone snapshot generation", () => {
  it("writes harmonics into the fft magnitudes", () => {
    const snapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: {
        testToneHz: 440,
        testToneAmplitude: 0.5,
      },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });

    expect(snapshot.avgAmplitude).toBeCloseTo(127.5);
    expect(snapshot.fftMagnitudes.some((value) => value > 0)).toBe(true);
  });
});
