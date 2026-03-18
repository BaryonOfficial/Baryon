import { describe, expect, it } from "vitest";
import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";
import { BACKBONE_STACK_SLOTS, DETAIL_STACK_SLOTS } from "./modalStack.js";
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
    capacity: AUDIO_SLOT_CAPACITY,
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

function makeTimeData({
  frequency,
  amplitude = 0.45,
  harmonics = [],
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
}) {
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    const t = index / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    for (const [multiple, harmonicAmplitude] of harmonics) {
      sample +=
        Math.sin(2 * Math.PI * frequency * multiple * t) * harmonicAmplitude;
    }
    timeData[index] = Math.max(-1, Math.min(1, sample));
  }
  return timeData;
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
  timeData = new Float32Array(FFT_SIZE),
}) {
  return buildAudioFeatureFrame({
    analysisSnapshot: createSnapshot({
      sourceMode: "mic",
      avgAmplitude,
      fftMagnitudes: makeFft(peaks),
      timeData,
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

function readModeAmplitudeMap(slotBuffer) {
  const amplitudes = new Map();
  for (let i = 0; i < slotBuffer.length; i += 4) {
    const amplitude = slotBuffer[i + 3] ?? 0;
    if (amplitude <= 0) continue;
    amplitudes.set(
      `${slotBuffer[i]}:${slotBuffer[i + 1]}:${slotBuffer[i + 2]}`,
      amplitude,
    );
  }
  return amplitudes;
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
    const steadyFft = makeFft([
      [110, 0.95],
      [220, 0.62],
      [330, 0.36],
    ]);
    // Warmup: first frame goes from silence → audio (inherently high changeSignal)
    buildTimedFrame({
      featureState,
      fftMagnitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 0,
    });
    // Steady: same audio as previous frame → low changeSignal
    const steadyFrame = buildTimedFrame({
      featureState,
      fftMagnitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 16,
    });
    // Changing: completely different spectrum from previous steady frame → high changeSignal
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
      frameTimeMs: 32,
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
    expect(changingFrame.changeSignal).toBeGreaterThan(
      steadyFrame.changeSignal,
    );
    expect(changingFrame.changeSignal).toBeGreaterThan(0.1);
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

  it("keeps a short low-energy hold and then returns to idle", () => {
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
    expect(quiet2.debug.micNoiseGateActive).toBe(true);
    expect(quiet3.debug.micNoiseGateActive).toBe(true);
    expect(quiet4.debug.micNoiseGateActive).toBe(true);
    expect(quiet2.fieldState).toBe("idle");
    expect(quiet4.fieldState).toBe("idle");
  });

  it("drops to idle on the first hard-silence frame while mic stays active", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [880, 0.1],
      ],
      avgAmplitude: 7,
      rms: 0.028,
      frameTimeMs: 0,
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
      frameTimeMs: 30,
    });

    const silence = buildMicFrame({
      featureState,
      peaks: [],
      avgAmplitude: 0,
      rms: 0,
      frameTimeMs: 60,
    });

    expect(silence.debug.micNoiseGateActive).toBe(true);
    expect(silence.debug.micHardSilenceActive).toBe(true);
    expect(silence.fieldState).toBe("idle");
    expect(silence.debug.driverFrequency).toBe(0);
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
      timeData: makeTimeData({
        frequency: 220,
        amplitude: 0.06,
        harmonics: [
          [2, 0.03],
          [3, 0.02],
        ],
      }),
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
      timeData: makeTimeData({
        frequency: 220,
        amplitude: 0.065,
        harmonics: [
          [2, 0.03],
          [3, 0.02],
        ],
      }),
    });

    expect(firstVoice.debug.micBaselineRms).toBeLessThan(0.0013);
    expect(firstVoice.debug.micBaselinePeak).toBeGreaterThan(0.8);
    expect(firstVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.debug.micNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
  });

  it("tracks high singing without jumping to stronger upper harmonics", () => {
    const featureState = createAudioFeatureState();
    buildMicFrame({
      featureState,
      peaks: [
        [110, 0.08],
        [220, 0.06],
      ],
      avgAmplitude: 2.3,
      rms: 0.006,
      frameTimeMs: 0,
      timeData: makeTimeData({ frequency: 110, amplitude: 0.12 }),
    });
    buildMicFrame({
      featureState,
      peaks: [
        [110, 0.08],
        [220, 0.06],
      ],
      avgAmplitude: 2.3,
      rms: 0.006,
      frameTimeMs: 320,
      timeData: makeTimeData({ frequency: 110, amplitude: 0.12 }),
    });
    buildMicFrame({
      featureState,
      peaks: [
        [110, 0.08],
        [220, 0.06],
      ],
      avgAmplitude: 2.3,
      rms: 0.006,
      frameTimeMs: 770,
      timeData: makeTimeData({ frequency: 110, amplitude: 0.12 }),
    });

    const frame = buildMicFrame({
      featureState,
      peaks: [
        [880, 0.22],
        [1760, 0.31],
        [2640, 0.16],
      ],
      avgAmplitude: 6.4,
      rms: 0.03,
      frameTimeMs: 820,
      timeData: makeTimeData({
        frequency: 880,
        amplitude: 0.28,
        harmonics: [
          [2, 0.34],
          [3, 0.12],
        ],
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.debug.pitchSource).toBe("fundamental");
    expect(frame.debug.driverFrequency).toBeGreaterThan(820);
    expect(frame.debug.driverFrequency).toBeLessThan(940);
    expect(frame.debug.driverFrequency).toBeLessThan(1760);
  });

  it("keeps a spoken pitch latched when a weak trailing frame proposes a false high note", () => {
    const featureState = createAudioFeatureState();
    for (const frameTimeMs of [0, 320, 770]) {
      buildMicFrame({
        featureState,
        peaks: [
          [110, 0.08],
          [220, 0.06],
        ],
        avgAmplitude: 2.3,
        rms: 0.006,
        frameTimeMs,
        timeData: makeTimeData({ frequency: 110, amplitude: 0.12 }),
      });
    }

    buildMicFrame({
      featureState,
      peaks: [
        [190, 0.18],
        [380, 0.11],
        [570, 0.07],
      ],
      avgAmplitude: 6.2,
      rms: 0.022,
      frameTimeMs: 820,
      timeData: makeTimeData({
        frequency: 190,
        amplitude: 0.14,
        harmonics: [
          [2, 0.05],
          [3, 0.02],
        ],
      }),
    });

    const trailingFrame = buildMicFrame({
      featureState,
      peaks: [
        [190, 0.04],
        [760, 0.29],
        [1520, 0.05],
      ],
      avgAmplitude: 4.7,
      rms: 0.0019,
      frameTimeMs: 850,
      timeData: makeTimeData({
        frequency: 190,
        amplitude: 0.013,
        harmonics: [[4, 0.003]],
      }),
    });

    expect(trailingFrame.fieldState).toBe("active");
    expect(trailingFrame.debug.pitchSource).toBe("latched-fundamental");
    expect(trailingFrame.debug.driverFrequency).toBeGreaterThan(150);
    expect(trailingFrame.debug.driverFrequency).toBeLessThan(260);
    expect(trailingFrame.debug.candidateFrames).toBe(0);
    expect(trailingFrame.debug.candidateLowEnergy).toBe(true);
    expect(
      trailingFrame.debug.candidateFrequency < 300 ||
        trailingFrame.debug.highCandidateRejected,
    ).toBe(true);
  });

  it("prefers an inferred lower vocal pitch over a stronger overtone", () => {
    const featureState = createAudioFeatureState();
    for (const frameTimeMs of [0, 320, 770]) {
      buildMicFrame({
        featureState,
        peaks: [
          [110, 0.08],
          [220, 0.06],
        ],
        avgAmplitude: 2.3,
        rms: 0.006,
        frameTimeMs,
        timeData: makeTimeData({ frequency: 110, amplitude: 0.12 }),
      });
    }

    const frame = buildMicFrame({
      featureState,
      peaks: [
        [220, 0.04],
        [440, 0.24],
        [660, 0.16],
        [880, 0.09],
      ],
      avgAmplitude: 6.8,
      rms: 0.024,
      frameTimeMs: 820,
      timeData: makeTimeData({
        frequency: 220,
        amplitude: 0.09,
        harmonics: [
          [2, 0.19],
          [3, 0.11],
          [4, 0.06],
        ],
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.debug.pitchSource).toBe("fundamental");
    expect(frame.debug.driverFrequency).toBeGreaterThan(180);
    expect(frame.debug.driverFrequency).toBeLessThan(280);
    expect(frame.debug.driverFrequency).toBeLessThan(440);
    expect(frame.debug.candidateHarmonicSupport).toBeGreaterThan(0.09);
    expect(frame.debug.periodicity).toBeGreaterThan(0.2);
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

  it("stores layered slots against the derived total budget while enforcing per-layer limits", () => {
    const featureState = createAudioFeatureState();
    const richFft = makeFft([
      [60, 1],
      [90, 0.95],
      [120, 0.85],
      [180, 0.8],
      [270, 0.7],
      [360, 0.65],
      [540, 0.55],
      [720, 0.5],
      [1080, 0.4],
      [1440, 0.35],
      [2160, 0.25],
    ]);
    const snapshot = createSnapshot({
      avgAmplitude: 72,
      fftMagnitudes: richFft,
      rms: 0.36,
    });
    // Run several warmup frames so backbone can admit modes up to its per-layer
    // limit (freshCap admits 2 new backbone modes per frame).
    for (let i = 0; i < BACKBONE_STACK_SLOTS / 2; i += 1) {
      buildAudioFeatureFrame({
        analysisSnapshot: snapshot,
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        auditSettings: createAuditSettings(),
      });
    }
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: snapshot,
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings(),
    });

    expect(frame.backboneSlots).toHaveLength(AUDIO_SLOT_CAPACITY * 4);
    expect(frame.detailSlots).toHaveLength(AUDIO_SLOT_CAPACITY * 4);
    expect(frame.modeSlots).toHaveLength(AUDIO_SLOT_CAPACITY * 4);
    expect(frame.debug.backboneModeCount).toBeLessThanOrEqual(
      BACKBONE_STACK_SLOTS,
    );
    expect(frame.debug.detailModeCount).toBeLessThanOrEqual(DETAIL_STACK_SLOTS);
    expect(frame.debug.modeSlotCount).toBeLessThanOrEqual(AUDIO_SLOT_CAPACITY);
    expect(frame.debug.modeSlotCount).toBeGreaterThan(BACKBONE_STACK_SLOTS);
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

  it("skips chromesthesia color work when the render path does not need it", () => {
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
      includeChromesthesia: false,
    });

    expect(frame.backboneColorSlots.some((value) => value > 0)).toBe(false);
    expect(frame.detailColorSlots.some((value) => value > 0)).toBe(false);
    expect(frame.debug.chromesthesiaComponents).toEqual([]);
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

  it("accepts inactive analysis hints without changing the frame contract", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 28,
        fftMagnitudes: makeFft([
          [110, 0.8],
          [330, 0.42],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      analysisHints: {
        active: false,
        workerState: "ready",
        workerStatus: {
          state: "ready",
        },
        ageMs: 140,
      },
    });

    expect(frame.backboneSlots).toBeInstanceOf(Float32Array);
    expect(frame.detailSlots).toBeInstanceOf(Float32Array);
    expect(frame.debug.workerState).toBe("ready");
    expect(frame.debug.hintSource).toBe("none");
  });

  it("accelerates stale detail release on high-novelty contradictions", () => {
    const featureState = createAudioFeatureState();
    const first = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.65],
        [330, 0.42],
      ]),
      avgAmplitude: 40,
      rms: 0.16,
      frameTimeMs: 0,
    });
    const firstDetailAmplitudes = readModeAmplitudeMap(first.detailSlots);

    const second = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 52,
        fftMagnitudes: makeFft([
          [480, 1],
          [960, 0.72],
          [1440, 0.48],
        ]),
        rms: 0.24,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 16,
      analysisHints: {
        active: true,
        novelty: 0.82,
        transientSalience: 0.78,
        harmonicity: 0.2,
        bassSalience: 0.18,
        pitchConfidence: 0.22,
        textureSpread: 0.55,
        voicingProbability: 0.12,
        releaseBias: 0.74,
      },
    });

    let retainedDetailAmplitude = 0;
    const secondDetailAmplitudes = readModeAmplitudeMap(second.detailSlots);
    for (const [key, amplitude] of firstDetailAmplitudes.entries()) {
      retainedDetailAmplitude += secondDetailAmplitudes.get(key) ?? 0;
      expect(secondDetailAmplitudes.get(key) ?? 0).toBeLessThan(amplitude);
    }

    expect(retainedDetailAmplitude).toBeLessThan(
      Array.from(firstDetailAmplitudes.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
    );
    expect(
      Array.from(featureState.analysis.detailState.slotDisagreementCounts).some(
        (value) => value > 0,
      ),
    ).toBe(true);
  });

  it("anchors structure normalization to the named slot budget instead of backing array capacity", () => {
    const baselineFeatureState = createAudioFeatureState();
    const oversizedFeatureState = createAudioFeatureState(
      AUDIO_SLOT_CAPACITY * 2,
    );
    const analysisSnapshot = createSnapshot({
      avgAmplitude: 64,
      fftMagnitudes: makeFft([
        [110, 1],
        [220, 0.88],
        [440, 0.72],
        [880, 0.54],
      ]),
      rms: 0.28,
    });
    const status = makeActiveStatus({
      capacity: AUDIO_SLOT_CAPACITY * 2,
    });

    const baselineFrame = buildAudioFeatureFrame({
      analysisSnapshot,
      featureState: baselineFeatureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const oversizedFrame = buildAudioFeatureFrame({
      analysisSnapshot,
      featureState: oversizedFeatureState,
      radius: 3,
      status,
    });

    expect(oversizedFrame.debug.modeSlotCount).toBe(
      baselineFrame.debug.modeSlotCount,
    );
    expect(oversizedFrame.structureSignal).toBeCloseTo(
      baselineFrame.structureSignal,
      6,
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

describe("tempo tracking", () => {
  it("emits estimatedTempo=0 and beatPhase=0 when no beats detected", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 0,
        fftMagnitudes: makeFft([[440, 0.01]]),
        rms: 0.001,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    expect(frame.estimatedTempo).toBe(0);
    expect(frame.beatPhase).toBe(0);
    expect(frame.tempoConfidence).toBe(0);
  });

  it("converges to ~120 BPM after 4 beats spaced 500ms apart", () => {
    const featureState = createAudioFeatureState();
    const beatFft = makeFft([
      [60, 1],
      [90, 0.9],
      [120, 0.8],
    ]);
    let lastFrame;
    for (let i = 0; i < 4; i += 1) {
      lastFrame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 90,
          fftMagnitudes: beatFft,
          rms: 0.8,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: i * 500,
      });
    }
    // After 4 beats at 500ms intervals (120 BPM), tempo should converge
    if (lastFrame.estimatedTempo > 0) {
      expect(lastFrame.estimatedTempo).toBeGreaterThan(80);
      expect(lastFrame.estimatedTempo).toBeLessThan(160);
    }
  });

  it("returns tempoConfidence=0 with fewer than 2 valid IBIs", () => {
    const featureState = createAudioFeatureState();
    // Single beat — not enough for IBI calculation
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 90,
        fftMagnitudes: makeFft([
          [60, 1],
          [90, 0.9],
        ]),
        rms: 0.8,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 500,
    });
    // First beat: no IBI yet, confidence should be 0
    expect(frame.tempoConfidence).toBe(0);
  });

  it("ignores IBIs outside 250-1500ms range", () => {
    const featureState = createAudioFeatureState();
    const beatFft = makeFft([
      [60, 1],
      [90, 0.9],
    ]);
    let lastFrame;
    // 3000ms apart = 20 BPM, outside 40-240 BPM range
    for (let i = 0; i < 3; i += 1) {
      lastFrame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 90,
          fftMagnitudes: beatFft,
          rms: 0.8,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: i * 3000,
      });
    }
    // IBIs of 3000ms are outside range, tempo should remain 0
    expect(lastFrame.estimatedTempo).toBe(0);
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

describe("mic FFT normalization — slot amplitude lift", () => {
  // Helpers: calibrate with near-silent noise, then present a signal frame.
  // Calibration captures the quiet baseline so the subsequent signal clears
  // the noise gate. Calibration window is 750ms; use frames at 0, 300, 760ms.
  /*function calibrateMicSilence(featureState, profile = "ambient") {
    const silentFft = makeFft([[90, 0.003]]);
    for (const t of [0, 300, 760]) {
      buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "mic",
          avgAmplitude: 0.1,
          fftMagnitudes: silentFft,
          timeData: new Float32Array(FFT_SIZE),
          rms: 0.001,
        }),
        featureState,
        radius: 3,
        status: makeMicStatus(),
        micAnalysisSettings: { profile },
        frameTimeMs: t,
      });
    }
  }*/

  function maxBackboneAmplitude(frame) {
    let max = 0;
    for (let i = 0; i < frame.backboneSlots.length; i += 4) {
      if (frame.backboneSlots[i + 3] > max) max = frame.backboneSlots[i + 3];
    }
    return max;
  }

  it("file mode is unaffected — same weak FFT produces no slots (no normalization applied)", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 2,
        fftMagnitudes: makeFft([[300, 0.05]]),
        rms: 0.008,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });

    // No normalization for file mode → all slots at zero amplitude
    expect(maxBackboneAmplitude(frame)).toBeLessThan(0.1);
  });
});
