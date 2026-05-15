import { describe, expect, it } from "vitest";
import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";
import { BACKBONE_STACK_SLOTS, DETAIL_STACK_SLOTS } from "./modalStack.js";
import {
  applyTestToneToSnapshot,
  buildAudioFeatureFrame as buildAudioFeatureFrameBase,
  composeAudioFeatureFrame,
  createAudioFeatureState,
  detectLiveInputNoiseGate,
  prepareAudioFeatureFrameInputs as prepareAudioFeatureFrameInputsBase,
  runHeavyAudioFeatureAnalysis,
} from "./buildFeatureFrame.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const NYQUIST = SAMPLE_RATE / 2;
const LIVE_INPUT_CALIBRATION_MID_MS = 400;
const LIVE_INPUT_CALIBRATION_DONE_MS = 1200;
const LIVE_INPUT_POST_CALIBRATION_MS = 1240;
const LIVE_INPUT_POST_CALIBRATION_NEXT_MS = 1270;

function prepareAudioFeatureFrameInputs(options) {
  return prepareAudioFeatureFrameInputsBase(options);
}

function buildAudioFeatureFrame(options) {
  return buildAudioFeatureFrameBase(options);
}

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
    isLiveInputActive: false,
    hasAnalysisSource: false,
    workerStatus: null,
    liveInputCalibrationVersion: 0,
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

function makeLiveInputStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "live",
    analysisSource: "live",
    isLiveInputActive: true,
    hasAnalysisSource: true,
    ...overrides,
  });
}

function makeResolvedLineFeedLiveStatus(overrides = {}) {
  return makeLiveInputStatus({
    liveInputKind: "live",
    liveInputDeviceKind: "live",
    liveInputAnalysisClass: "auto",
    resolvedLiveInputAnalysisClass: "line-feed",
    ...overrides,
  });
}

function makeSystemStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "system",
    analysisSource: "file",
    isLiveInputActive: true,
    hasAnalysisSource: true,
    liveInputKind: "system",
    ...overrides,
  });
}

function averageWeightedColorSlots(...slotArrays) {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  for (const slots of slotArrays) {
    for (let index = 0; index < slots.length; index += 4) {
      const slotWeight = slots[index + 3] ?? 0;
      if (slotWeight <= 0) continue;
      r += (slots[index] ?? 0) * slotWeight;
      g += (slots[index + 1] ?? 0) * slotWeight;
      b += (slots[index + 2] ?? 0) * slotWeight;
      weight += slotWeight;
    }
  }

  return weight > 0
    ? { r: r / weight, g: g / weight, b: b / weight, weight }
    : { r: 0, g: 0, b: 0, weight: 0 };
}

function makeLoopbackLiveStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "live",
    analysisSource: "live",
    isLiveInputActive: true,
    hasAnalysisSource: true,
    liveInputKind: "system",
    liveInputDeviceKind: "system",
    liveInputAnalysisClass: "line-feed",
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

describe("live input feature-frame state", () => {
  it("exposes live input activity on silent frames", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 0,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        rms: 0,
      }),
      featureState,
      radius: 3,
      status: makeLiveInputStatus(),
      frameTimeMs: 0,
    });

    expect(frame.fieldState).toBe("idle");
    expect(frame.isLiveInputActive).toBe(true);
  });
});

function sumSlotAmplitudes(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    total += slots[index * 4 + 3] ?? 0;
  }
  return total;
}

function buildModalExcitationAnalysisFrame({
  featureState,
  fftMagnitudes,
  timeData = new Float32Array(FFT_SIZE),
  avgAmplitude = 24,
  rms = 0.2,
  frameTimeMs = 0,
  previousFrame = null,
}) {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      avgAmplitude,
      fftMagnitudes,
      timeData,
      rms,
    }),
    featureState,
    radius: 3,
    status: makeActiveStatus(),
    frameTimeMs,
  });
  const analysisResult = runHeavyAudioFeatureAnalysis(preparedInputs);
  const frame = composeAudioFeatureFrame({
    preparedInputs,
    analysisResult,
    previousFrame,
  });

  return {
    preparedInputs,
    analysisResult,
    frame,
  };
}

function buildLiveInputFrame({
  featureState,
  peaks,
  avgAmplitude,
  rms,
  frameTimeMs,
  acousticIntent = "vocal",
  status = makeLiveInputStatus(),
  timeData = new Float32Array(FFT_SIZE),
}) {
  return buildAudioFeatureFrame({
    analysisSnapshot: createSnapshot({
      sourceMode: "live",
      avgAmplitude,
      fftMagnitudes: makeFft(peaks),
      timeData,
      rms,
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs,
    liveInputAnalysisSettings: { acousticIntent },
  });
}

function calibrateLiveInput(
  featureState,
  {
    acousticIntent = "vocal",
    peaks = [
      [90, 0.09],
      [180, 0.07],
    ],
    avgAmplitude = 2.5,
    rms = 0.006,
    status = makeLiveInputStatus(),
    timeData = new Float32Array(FFT_SIZE),
  } = {},
) {
  for (const frameTimeMs of [
    0,
    LIVE_INPUT_CALIBRATION_MID_MS,
    LIVE_INPUT_CALIBRATION_DONE_MS,
  ]) {
    buildLiveInputFrame({
      featureState,
      peaks,
      avgAmplitude,
      rms,
      frameTimeMs,
      acousticIntent,
      status,
      timeData,
    });
  }
}

function readModeKeys(slotBuffer) {
  const keys = [];
  for (let i = 0; i < slotBuffer.length; i += 4) {
    if ((slotBuffer[i + 3] ?? 0) <= 0) continue;
    keys.push(`${slotBuffer[i]}:${slotBuffer[i + 1]}:${slotBuffer[i + 2]}`);
  }
  return keys;
}

function hasNewModeKey(nextKeys, previousKeys) {
  return nextKeys.some((key) => !previousKeys.includes(key));
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

describe("buildAudioFeatureFrame modal contract", () => {
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
    expect(steadyFrame.modalVisibilityEnergy).toBeGreaterThan(0.12);
    expect(steadyFrame).not.toHaveProperty("sustainedResonancePresence");
    expect(steadyFrame.changeSignal).toBeGreaterThanOrEqual(0);
    expect(steadyFrame.pulseSignal).toBeGreaterThanOrEqual(0);
    expect(steadyFrame.debug.structureSignal).toBe(steadyFrame.structureSignal);
    expect(steadyFrame.debug.energySignal).toBe(steadyFrame.energySignal);
    expect(steadyFrame.debug.modalVisibilityEnergy).toBe(
      steadyFrame.modalVisibilityEnergy,
    );
    expect(steadyFrame.debug.changeSignal).toBe(steadyFrame.changeSignal);
    expect(steadyFrame.debug.pulseSignal).toBe(steadyFrame.pulseSignal);

    expect(changingFrame.structureSignal).toBeGreaterThan(0.25);
    expect(changingFrame.energySignal).toBeGreaterThan(
      steadyFrame.energySignal,
    );
    expect(changingFrame.changeSignal).toBeGreaterThan(
      steadyFrame.changeSignal,
    );
    expect(changingFrame.changeSignal).toBeGreaterThan(0.07);
  });

  it("keeps live-input calibration active during startup frames", () => {
    const featureState = createAudioFeatureState();
    const first = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    const mid = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
    });
    const done = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
    });

    expect(first.fieldState).toBe("active");
    expect(first.debug.liveInputNoiseGateActive).toBe(true);
    expect(first.debug.liveInputCalibrationActive).toBe(true);
    expect(mid.debug.liveInputCalibrationActive).toBe(true);
    expect(done.debug.liveInputCalibrationActive).toBe(false);
    expect(done.debug.liveInputNoiseGateActive).toBe(true);
    expect(done.debug.liveInputBaselineRms).toBeGreaterThan(0);
    expect(done.debug.liveInputBaselinePeak).toBeGreaterThan(0);
  });

  it("opens quickly for voice after calibration", () => {
    const featureState = createAudioFeatureState();
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
    });
    const firstVoice = buildLiveInputFrame({
      featureState,
      peaks: [
        [180, 0.22],
        [320, 0.18],
        [540, 0.12],
        [960, 0.08],
      ],
      avgAmplitude: 5.9,
      rms: 0.021,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
    });
    const secondVoice = buildLiveInputFrame({
      featureState,
      peaks: [
        [180, 0.24],
        [320, 0.19],
        [540, 0.13],
        [960, 0.085],
      ],
      avgAmplitude: 6.2,
      rms: 0.0225,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
    });

    expect(firstVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
    expect(secondVoice.debug.modeSlotCount).toBeGreaterThan(0);
  });

  it("keeps steady fan-like noise gated after voice calibration", () => {
    const featureState = createAudioFeatureState();
    buildLiveInputFrame({
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
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.18],
        [180, 0.16],
        [270, 0.14],
      ],
      avgAmplitude: 3,
      rms: 0.012,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
    });
    const frame = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.18],
        [180, 0.16],
        [270, 0.14],
      ],
      avgAmplitude: 3,
      rms: 0.012,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
    });

    expect(frame.debug.liveInputCalibrationActive).toBe(false);
    expect(frame.debug.liveInputNoiseGateActive).toBe(true);
    expect(frame.fieldState).toBe("active");
  });

  it("re-engages the noise gate after a short low-energy hold", () => {
    const featureState = createAudioFeatureState();
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [880, 0.1],
      ],
      avgAmplitude: 7,
      rms: 0.028,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.31],
        [440, 0.19],
        [880, 0.11],
      ],
      avgAmplitude: 7.2,
      rms: 0.029,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
    });

    const quiet1 = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 1300,
    });
    const quiet2 = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 1330,
    });
    const quiet3 = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 1360,
    });
    const quiet4 = buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.4,
      rms: 0.006,
      frameTimeMs: 1390,
    });

    expect(quiet1.debug.liveInputNoiseGateActive).toBe(false);
    expect(quiet2.debug.liveInputNoiseGateActive).toBe(false);
    expect(quiet3.debug.liveInputNoiseGateActive).toBe(false);
    expect(quiet4.debug.liveInputNoiseGateActive).toBe(true);
    expect(quiet2.fieldState).toBe("active");
    expect(quiet4.fieldState).toBe("active");
  });

  it("flags hard silence on the first silent frame while mic stays active", () => {
    const featureState = createAudioFeatureState();
    buildLiveInputFrame({
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
    buildLiveInputFrame({
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

    const silence = buildLiveInputFrame({
      featureState,
      peaks: [],
      avgAmplitude: 0,
      rms: 0,
      frameTimeMs: 60,
    });

    expect(silence.debug.liveInputNoiseGateActive).toBe(true);
    expect(silence.debug.liveInputHardSilenceActive).toBe(true);
    expect(silence.fieldState).toBe("active");
    expect(silence.debug.driverFrequency).toBeGreaterThan(0);
  });

  it("recalibrates when mic mode is restarted", () => {
    const featureState = createAudioFeatureState();
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      frameTimeMs: 0,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [90, 0.09],
        [180, 0.07],
      ],
      avgAmplitude: 2.6,
      rms: 0.0065,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [880, 0.1],
      ],
      avgAmplitude: 7,
      rms: 0.028,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.31],
        [440, 0.19],
        [880, 0.11],
      ],
      avgAmplitude: 7.2,
      rms: 0.029,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
    });

    buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 1200,
    });

    const restarted = buildLiveInputFrame({
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

    expect(restarted.debug.liveInputCalibrationActive).toBe(true);
    expect(restarted.debug.liveInputNoiseGateActive).toBe(true);
    expect(restarted.fieldState).toBe("active");
  });

  it("auto-invalidates clipped mic calibration", () => {
    const featureState = createAudioFeatureState();

    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 1.0],
        [240, 0.22],
        [360, 0.11],
      ],
      avgAmplitude: 1.2,
      rms: 0.0044,
      frameTimeMs: 0,
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.99],
        [240, 0.21],
        [360, 0.1],
      ],
      avgAmplitude: 1.1,
      rms: 0.0042,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
    });
    const invalidFrame = buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.99],
        [240, 0.21],
        [360, 0.1],
      ],
      avgAmplitude: 1.1,
      rms: 0.0042,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
    });

    expect(invalidFrame.debug.liveInputCalibrationInvalid).toBe(true);
    expect(invalidFrame.debug.liveInputCalibrationInvalidReason).toBe(
      "baseline-clipping",
    );
    expect(invalidFrame.debug.liveInputCalibrationActive).toBe(true);
    expect(invalidFrame.debug.liveInputNoiseGateActive).toBe(true);
    expect(invalidFrame.fieldState).toBe("active");
  });

  it("re-enters calibration when the live-input calibration version changes", () => {
    const featureState = createAudioFeatureState();
    const initialStatus = makeLiveInputStatus({
      liveInputCalibrationVersion: 1,
    });
    const resetStatus = makeLiveInputStatus({ liveInputCalibrationVersion: 2 });
    const timeData = makeTimeData({
      frequency: 220,
      amplitude: 0.16,
      harmonics: [
        [2, 0.08],
        [3, 0.04],
      ],
    });

    calibrateLiveInput(featureState, { status: initialStatus });

    const activeFrame = buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [660, 0.1],
      ],
      avgAmplitude: 7.0,
      rms: 0.028,
      frameTimeMs: 1260,
      status: initialStatus,
      timeData,
    });
    const resetFrame = buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.3],
        [440, 0.18],
        [660, 0.1],
      ],
      avgAmplitude: 7.0,
      rms: 0.028,
      frameTimeMs: 1290,
      status: resetStatus,
      timeData,
    });

    expect(activeFrame.fieldState).toBe("active");
    expect(resetFrame.debug.liveInputCalibrationActive).toBe(true);
    expect(resetFrame.debug.liveInputNoiseGateActive).toBe(true);
    expect(resetFrame.fieldState).toBe("active");
  });

  it("still opens voice when calibration captured a strong narrowband background peak", () => {
    const featureState = createAudioFeatureState();

    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.76],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.3,
      rms: 0.0044,
      frameTimeMs: 0,
      acousticIntent: "vocal",
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.75],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.2,
      rms: 0.0043,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
      acousticIntent: "vocal",
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.75],
        [240, 0.17],
        [360, 0.08],
      ],
      avgAmplitude: 1.1,
      rms: 0.0042,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
      acousticIntent: "vocal",
    });

    const firstVoice = buildLiveInputFrame({
      featureState,
      peaks: [
        [180, 0.24],
        [320, 0.2],
        [540, 0.13],
        [900, 0.08],
      ],
      avgAmplitude: 6.1,
      rms: 0.021,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      acousticIntent: "vocal",
    });
    const secondVoice = buildLiveInputFrame({
      featureState,
      peaks: [
        [180, 0.25],
        [320, 0.21],
        [540, 0.14],
        [900, 0.085],
      ],
      avgAmplitude: 6.3,
      rms: 0.022,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
      acousticIntent: "vocal",
    });

    expect(firstVoice.debug.liveInputBaselinePeak).toBeGreaterThan(0.68);
    expect(firstVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
  });

  it("opens voice for low-rms desk voice levels after calibration", () => {
    const featureState = createAudioFeatureState();

    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.83],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.1,
      rms: 0.0012,
      frameTimeMs: 0,
      acousticIntent: "vocal",
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.82],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.1,
      rms: 0.0012,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
      acousticIntent: "vocal",
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.82],
        [240, 0.18],
        [360, 0.09],
      ],
      avgAmplitude: 1.1,
      rms: 0.0012,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
      acousticIntent: "vocal",
    });

    const firstVoice = buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.14],
        [640, 0.15],
        [1240, 0.13],
        [2480, 0.09],
      ],
      avgAmplitude: 4.42,
      rms: 0.00185,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      acousticIntent: "vocal",
      timeData: makeTimeData({
        frequency: 220,
        amplitude: 0.06,
        harmonics: [
          [2, 0.03],
          [3, 0.02],
        ],
      }),
    });
    const secondVoice = buildLiveInputFrame({
      featureState,
      peaks: [
        [220, 0.145],
        [640, 0.16],
        [1240, 0.135],
        [2480, 0.095],
      ],
      avgAmplitude: 4.5,
      rms: 0.00192,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
      acousticIntent: "vocal",
      timeData: makeTimeData({
        frequency: 220,
        amplitude: 0.065,
        harmonics: [
          [2, 0.03],
          [3, 0.02],
        ],
      }),
    });

    expect(firstVoice.debug.liveInputBaselineRms).toBeLessThan(0.0013);
    expect(firstVoice.debug.liveInputBaselinePeak).toBeGreaterThan(0.73);
    expect(firstVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
  });

  it("derives a line-feed runtime policy from the resolved live-input class", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 6.4,
        fftMagnitudes: makeFft([
          [110, 0.22],
          [220, 0.31],
          [330, 0.16],
        ]),
        timeData: makeTimeData({ frequency: 110, amplitude: 0.18 }),
        rms: 0.01,
      }),
      featureState,
      radius: 3,
      status: makeResolvedLineFeedLiveStatus(),
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      liveInputAnalysisSettings: { acousticIntent: "vocal" },
    });

    expect(preparedInputs.resolvedLiveInputAnalysisClass).toBe("line-feed");
    expect(preparedInputs.liveInputPolicy).toBe("line-feed");
    expect(preparedInputs.isAcousticLiveInput).toBe(false);
  });

  it("builds modal backbone/detail slots from spectral peaks", () => {
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
    expect(frame.debug.analysisEngine).toBe("modal-excitation");
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

  it("stores modal slots against the derived total budget while enforcing per-layer limits", () => {
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
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
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
        sourceMode: "live",
        avgAmplitude: 2,
        fftMagnitudes: makeFft([[80, 0.12]]),
        rms: 0.01,
      }),
      featureState,
      radius: 3,
      status: createStatus({
        audioInputMode: "live",
        analysisSource: "live",
        isLiveInputActive: true,
        hasAnalysisSource: true,
      }),
      frameTimeMs: 25,
    });

    expect(frame.debug.liveInputNoiseGateActive).toBe(true);
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

  it("injects deterministic test-tone analysis through the modal path", () => {
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
    expect(frame.debug.analysisEngine).toBe("modal-excitation");
    expect(frame.debug.pitchSource).toBe("resonator-bank");
    expect(frame.debug.backboneModeCount).toBeGreaterThan(0);
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
    // avgAmplitude is now RMS-derived: amplitude / sqrt(2) * 255
    expect(frame.averageAmplitude).toBeCloseTo((0.75 / Math.SQRT2) * 255, 1);
  });

  it("injects a richer modal test-tone excitation for the modal path", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      auditSettings: createAuditSettings({
        injectTestTone: true,
        testToneHz: 660,
        testToneAmplitude: 0.2,
      }),
    });

    expect(frame.fieldState).toBe("test");
    expect(frame.debug.pitchSource).toBe("resonator-bank");
    expect(frame.debug.analysisEngine).toBe("modal-excitation");
    expect(frame.debug.modeSlotCount).toBeGreaterThan(1);
    expect(
      frame.backboneSlots.some(
        (_, index) => index % 4 === 3 && frame.backboneSlots[index] > 0,
      ),
    ).toBe(true);
    expect(
      frame.detailSlots.some(
        (_, index) => index % 4 === 3 && frame.detailSlots[index] > 0,
      ),
    ).toBe(true);
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

    expect(frame.debug.analysisEngine).toBe("modal-excitation");
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

describe("Spectral Light feature frame outputs", () => {
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
    expect(frame.debug.spectralLightComponents.length).toBeGreaterThan(0);
    expect(frame.debug.spectralLightComponents[0]).toMatchObject({
      frequency: expect.any(Number),
      weight: expect.any(Number),
      color: {
        r: expect.any(Number),
        g: expect.any(Number),
        b: expect.any(Number),
      },
    });
  });

  it("keeps injected warm tones red at the modal color-slot boundary", () => {
    for (const testToneHz of [220, 440]) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
        frame = buildAudioFeatureFrame({
          analysisSnapshot: null,
          featureState,
          radius: 3,
          status: createStatus(),
          auditSettings: createAuditSettings({
            injectTestTone: true,
            testToneHz,
            testToneAmplitude: 0.5,
          }),
          frameTimeMs: frameIndex * 33,
        });
      }

      const color = averageWeightedColorSlots(
        frame.backboneColorSlots,
        frame.detailColorSlots,
      );

      expect(color.weight).toBeGreaterThan(0.5);
      expect(color.r).toBeGreaterThan(0.85);
      expect(color.g).toBeLessThan(0.08);
      expect(color.b).toBeLessThan(0.15);
    }
  });

  it("skips Spectral Light color work when the render path does not need it", () => {
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
      includeSpectralLight: false,
    });

    expect(frame.backboneColorSlots.some((value) => value > 0)).toBe(false);
    expect(frame.detailColorSlots.some((value) => value > 0)).toBe(false);
    expect(frame.debug.spectralLightComponents.length).toBeGreaterThan(0);
  });

  it("freezes Spectral Light color slots alongside frozen modal slots", () => {
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

  it("keeps contradictory stale detail bounded", () => {
    const featureState = createAudioFeatureState();
    const first = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([
        [550, 0.95],
        [1100, 0.65],
        [1650, 0.42],
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
    for (const [key] of firstDetailAmplitudes.entries()) {
      retainedDetailAmplitude += secondDetailAmplitudes.get(key) ?? 0;
    }

    const initialDetailAmplitude = Array.from(
      firstDetailAmplitudes.values(),
    ).reduce((sum, value) => sum + value, 0);
    expect(retainedDetailAmplitude).toBeLessThanOrEqual(
      initialDetailAmplitude * 1.15,
    );
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

describe("live input noise gate", () => {
  it("opens when mic energy exceeds the voice hard floor", () => {
    expect(
      detectLiveInputNoiseGate({
        injectTestTone: false,
        inputMode: "live",
        avgAmplitude: 16,
        rms: 0.04,
      }),
    ).toBe(false);
  });

  it("does not hard-gate tiny weak tonal acoustic mic input", () => {
    expect(
      detectLiveInputNoiseGate({
        injectTestTone: false,
        inputMode: "live",
        avgAmplitude: 1.8,
        rms: 0.005,
        fftMagnitudes: makeFft([
          [90, 0.08],
          [180, 0.06],
        ]),
        liveInputAnalysisSettings: { acousticIntent: "vocal" },
      }),
    ).toBe(false);
  });

  it("lets ambient intent clear the hard floor for modest room audio", () => {
    expect(
      detectLiveInputNoiseGate({
        injectTestTone: false,
        inputMode: "live",
        avgAmplitude: 4.5,
        rms: 0.015,
        fftMagnitudes: makeFft([
          [120, 0.18],
          [240, 0.15],
          [360, 0.12],
        ]),
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      }),
    ).toBe(false);
  });

  it("keeps vocal mic intent stricter than ambient for modest resonant audio", () => {
    const resonantInput = {
      injectTestTone: false,
      inputMode: "live",
      avgAmplitude: 4.5,
      rms: 0.015,
      fftMagnitudes: makeFft([
        [120, 0.18],
        [240, 0.15],
        [360, 0.12],
      ]),
    };

    expect(
      detectLiveInputNoiseGate({
        ...resonantInput,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      }),
    ).toBe(false);
    expect(
      detectLiveInputNoiseGate({
        ...resonantInput,
        liveInputAnalysisSettings: { acousticIntent: "vocal" },
      }),
    ).toBe(true);
  });

  it("matches file analysis for system-classified live input", () => {
    const fileFeatureState = createAudioFeatureState();
    const systemFeatureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [110, 0.82],
      [220, 0.41],
      [330, 0.22],
      [440, 0.17],
    ]);
    const analysisSnapshot = createSnapshot({
      fftMagnitudes,
      avgAmplitude: 36,
      rms: 0.27,
    });

    const fileFrame = buildAudioFeatureFrame({
      analysisSnapshot,
      featureState: fileFeatureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 32,
      liveInputAnalysisSettings: { acousticIntent: "ambient" },
    });
    const systemFrame = buildAudioFeatureFrame({
      analysisSnapshot,
      featureState: systemFeatureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 32,
      liveInputAnalysisSettings: { acousticIntent: "vocal" },
    });

    expect(systemFrame.sourceMode).toBe("system");
    expect(systemFrame.debug.analysisSourceUsed).toBe("system");
    expect(systemFrame.debug.micActive).toBe(false);
    expect(Array.from(systemFrame.backboneSlots)).toEqual(
      Array.from(fileFrame.backboneSlots),
    );
    expect(Array.from(systemFrame.detailSlots)).toEqual(
      Array.from(fileFrame.detailSlots),
    );
    expect(Array.from(systemFrame.modeSlots)).toEqual(
      Array.from(fileFrame.modeSlots),
    );
  });

  it("keeps low-level system-routed bowl resonance visible without spikes", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [220, 0.24],
      [440, 0.14],
      [660, 0.08],
      [880, 0.04],
    ]);
    const timeData = makeTimeData({
      frequency: 220,
      amplitude: 0.055,
      harmonics: [
        [2, 0.025],
        [3, 0.012],
      ],
    });
    let frame = null;

    for (let index = 0; index < 8; index += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 12,
          fftMagnitudes,
          timeData,
          rms: 0.045,
        }),
        featureState,
        radius: 3,
        status: makeSystemStatus(),
        frameTimeMs: index * 33,
      });
    }

    expect(frame.sourceMode).toBe("system");
    expect(frame.fieldState).toBe("active");
    expect(frame.changeSignal).toBeLessThan(0.03);
    expect(frame.modeCoherence).toBeGreaterThan(0.4);
    expect(frame.debug.modalPersistence).toBeGreaterThan(0.35);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.12);
  });

  it("keeps loopback-classified live input structurally active", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 36,
        rms: 0.27,
        fftMagnitudes: makeFft([
          [110, 0.82],
          [220, 0.41],
          [330, 0.22],
          [440, 0.17],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeLoopbackLiveStatus(),
      frameTimeMs: 32,
      liveInputAnalysisSettings: { acousticIntent: "vocal" },
    });

    expect(frame.fieldState).not.toBe("idle");
    expect(frame.hasModalField).toBe(true);
    expect(frame.sourceMode).toBe("line-feed");
    expect(frame.debug.liveInputPolicy).toBe("line-feed");
    expect(frame.debug.analysisEngine).not.toBe("vocal");
    expect(
      frame.activeBackboneModeCount + frame.activeDetailModeCount,
    ).toBeGreaterThan(0);
    expect(frame.debug.dominantFrequency).toBeGreaterThan(0);
    expect(frame.structureSignal).toBeGreaterThan(0);
  });

  it("reuses zero-target buffers and rebuilds them when capacity changes", () => {
    const featureState = createAudioFeatureState(8);
    const status = makeActiveStatus({ capacity: 8 });
    const analysisSnapshot = createSnapshot({
      fftMagnitudes: makeFft([
        [110, 0.82],
        [220, 0.41],
      ]),
    });

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 16,
    });
    const firstBackboneTargets = featureState.analysis.zeroBackboneTargetSlots;
    const firstDetailTargets = featureState.analysis.zeroDetailTargetSlots;

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.zeroBackboneTargetSlots).toBe(
      firstBackboneTargets,
    );
    expect(featureState.analysis.zeroDetailTargetSlots).toBe(
      firstDetailTargets,
    );

    featureState.capacity = 2;
    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status: makeActiveStatus({ capacity: 2 }),
      frameTimeMs: 48,
    });

    expect(featureState.analysis.zeroBackboneTargetSlots).not.toBe(
      firstBackboneTargets,
    );
    expect(featureState.analysis.zeroDetailTargetSlots).not.toBe(
      firstDetailTargets,
    );
    expect(featureState.analysis.zeroBackboneTargetSlots.length).toBe(
      Math.min(2, BACKBONE_STACK_SLOTS) * 4,
    );
    expect(featureState.analysis.zeroDetailTargetSlots.length).toBe(
      Math.min(2, DETAIL_STACK_SLOTS) * 4,
    );
  });

  it("reuses non-acoustic target buffers and rebuilds them when capacity changes", () => {
    const featureState = createAudioFeatureState(8);
    const status = makeActiveStatus({ capacity: 8 });
    const analysisSnapshot = createSnapshot({
      fftMagnitudes: makeFft([
        [110, 0.82],
        [220, 0.41],
        [330, 0.22],
      ]),
    });

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 16,
    });
    const firstBackboneTargetSlots =
      featureState.analysis.nonAcousticBackboneTarget.slots;
    const firstDetailTargetSlots =
      featureState.analysis.nonAcousticDetailTarget.slots;
    const firstPeakDriverScratchSlots =
      featureState.analysis.nonAcousticPeakDriverScratch.slots;

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.nonAcousticBackboneTarget.slots).toBe(
      firstBackboneTargetSlots,
    );
    expect(featureState.analysis.nonAcousticDetailTarget.slots).toBe(
      firstDetailTargetSlots,
    );
    expect(featureState.analysis.nonAcousticPeakDriverScratch.slots).toBe(
      firstPeakDriverScratchSlots,
    );

    featureState.capacity = 2;
    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status: makeActiveStatus({ capacity: 2 }),
      frameTimeMs: 48,
    });

    expect(featureState.analysis.nonAcousticBackboneTarget.slots).not.toBe(
      firstBackboneTargetSlots,
    );
    expect(featureState.analysis.nonAcousticDetailTarget.slots).not.toBe(
      firstDetailTargetSlots,
    );
    expect(featureState.analysis.nonAcousticPeakDriverScratch.slots).not.toBe(
      firstPeakDriverScratchSlots,
    );
    expect(featureState.analysis.nonAcousticBackboneTarget.slots.length).toBe(
      Math.min(2, BACKBONE_STACK_SLOTS) * 4,
    );
    expect(featureState.analysis.nonAcousticDetailTarget.slots.length).toBe(
      Math.min(2, DETAIL_STACK_SLOTS) * 4,
    );
    expect(
      featureState.analysis.nonAcousticPeakDriverScratch.slots.length,
    ).toBe(Math.min(2, BACKBONE_STACK_SLOTS) * 4);
  });

  it("reuses acoustic target buffers and rebuilds them when capacity changes", () => {
    const featureState = createAudioFeatureState(8);
    const status = makeLiveInputStatus({ capacity: 8, liveInputKind: "live" });
    const analysisSnapshot = createSnapshot({
      sourceMode: "live",
      fftMagnitudes: makeFft([
        [180, 0.22],
        [320, 0.18],
        [540, 0.12],
      ]),
      timeData: makeTimeData({
        frequency: 180,
        amplitude: 0.4,
        harmonics: [[2, 0.14]],
      }),
    });

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 16,
    });
    const firstBackboneTargetSlots =
      featureState.analysis.acousticBackboneTarget.slots;
    const firstDetailTargetSlots =
      featureState.analysis.acousticDetailTarget.slots;

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.acousticBackboneTarget.slots).toBe(
      firstBackboneTargetSlots,
    );
    expect(featureState.analysis.acousticDetailTarget.slots).toBe(
      firstDetailTargetSlots,
    );

    featureState.capacity = 2;
    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status: makeLiveInputStatus({ capacity: 2, liveInputKind: "live" }),
      frameTimeMs: 48,
    });

    expect(featureState.analysis.acousticBackboneTarget.slots).not.toBe(
      firstBackboneTargetSlots,
    );
    expect(featureState.analysis.acousticDetailTarget.slots).not.toBe(
      firstDetailTargetSlots,
    );
    expect(featureState.analysis.acousticBackboneTarget.slots.length).toBe(
      Math.min(2, BACKBONE_STACK_SLOTS) * 4,
    );
    expect(featureState.analysis.acousticDetailTarget.slots.length).toBe(
      Math.min(2, DETAIL_STACK_SLOTS) * 4,
    );
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

    // avgAmplitude is now RMS-derived (pure sine: amplitude / sqrt(2) * 255)
    expect(snapshot.avgAmplitude).toBeCloseTo((0.5 / Math.SQRT2) * 255, 1);
    expect(snapshot.fftMagnitudes.some((value) => value > 0)).toBe(true);
  });

  it("produces non-zero rms that scales with tone amplitude", () => {
    const low = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 440, testToneAmplitude: 0.1 },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });
    const high = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 440, testToneAmplitude: 0.8 },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });

    expect(low.rms).toBeCloseTo(0.1 / Math.SQRT2, 4);
    expect(high.rms).toBeCloseTo(0.8 / Math.SQRT2, 4);
    expect(low.avgAmplitude).toBeCloseTo(low.rms * 255, 1);
    expect(high.avgAmplitude).toBeCloseTo(high.rms * 255, 1);
    expect(high.avgAmplitude).toBeGreaterThan(low.avgAmplitude);
  });

  it("low-amplitude tone has lower avgAmplitude than high-amplitude tone (excitation fidelity)", () => {
    const lowAmp = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 440, testToneAmplitude: 0.08 },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });
    const highAmp = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: { testToneHz: 440, testToneAmplitude: 0.75 },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });

    // Low amplitude should produce avgAmplitude well below the 255/5 = 51 midpoint
    expect(lowAmp.avgAmplitude).toBeLessThan(30);
    // High amplitude should be substantially stronger
    expect(highAmp.avgAmplitude).toBeGreaterThan(100);
    // FFT should still have content in both cases
    expect(lowAmp.fftMagnitudes.some((v) => v > 0)).toBe(true);
    expect(highAmp.fftMagnitudes.some((v) => v > 0)).toBe(true);
  });

  it("keeps modal visibility energy present for low-transient injected tones", () => {
    const featureState = createAudioFeatureState();
    const warmup = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 0,
      auditSettings: createAuditSettings({
        injectTestTone: true,
        testToneHz: 440,
        testToneAmplitude: 0.7,
      }),
    });
    const sustained = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 33,
      auditSettings: createAuditSettings({
        injectTestTone: true,
        testToneHz: 440,
        testToneAmplitude: 0.7,
      }),
    });

    expect(warmup.transientEnergy).toBeGreaterThanOrEqual(0);
    expect(sustained.transientEnergy).toBeLessThan(0.1);
    expect(sustained.changeSignal).toBeLessThan(0.12);
    expect(sustained.modalVisibilityEnergy).toBeGreaterThan(0.24);
    expect(sustained.debug.modalVisibilityEnergy).toBe(
      sustained.modalVisibilityEnergy,
    );
  });

  it("does not expose modal visibility energy for silence or weak noisy input", () => {
    const silent = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState: createAudioFeatureState(),
      radius: 3,
      status: createStatus(),
    });
    const weakNoisy = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 8,
        fftMagnitudes: makeFft([
          [120, 0.04],
          [380, 0.05],
          [920, 0.04],
          [1600, 0.05],
          [2400, 0.04],
        ]),
        rms: 0.015,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });

    expect(silent.modalVisibilityEnergy).toBe(0);
    expect(weakNoisy.energySignal).toBeLessThan(0.12);
    expect(weakNoisy.modalVisibilityEnergy).toBe(0);
  });
});

describe("live input FFT normalization — slot amplitude lift", () => {
  function maxSlotAmplitude(slotBuffer) {
    let max = 0;
    for (let i = 0; i < slotBuffer.length; i += 4) {
      if (slotBuffer[i + 3] > max) max = slotBuffer[i + 3];
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

    expect(maxSlotAmplitude(frame.backboneSlots)).toBeLessThan(0.1);
    expect(frame.debug.micFftNormGain).toBe(1);
    expect(frame.debug.preModalFftPeak).toBeCloseTo(0.05, 6);
  });

  it("keeps calibrated mic backbone response within range of file for the same harmonic input", () => {
    // Mic picks up a distant source: FFT peak at 0.24, noise floor calibrated to ~0.09.
    // This is a normal calibrated mic frame, so normalization should stay out of
    // the way and keep the modal response close to the equivalent file input.
    const micFeatureState = createAudioFeatureState();
    const fileFeatureState = createAudioFeatureState();
    const micPeaks = [
      [550, 0.24],
      [1100, 0.16],
      [1650, 0.11],
      [2200, 0.07],
    ];
    const timeData = makeTimeData({
      frequency: 550,
      amplitude: 0.18,
      harmonics: [
        [2, 0.1],
        [3, 0.06],
        [4, 0.04],
      ],
    });

    calibrateLiveInput(micFeatureState);

    const micFrame = buildLiveInputFrame({
      featureState: micFeatureState,
      peaks: micPeaks,
      avgAmplitude: 6.2,
      rms: 0.0225,
      frameTimeMs: 1260,
      timeData,
    });
    const fileFrame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 6.2,
        fftMagnitudes: makeFft(micPeaks),
        timeData,
        rms: 0.0225,
      }),
      featureState: fileFeatureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 1260,
    });

    const micBackbone = maxSlotAmplitude(micFrame.backboneSlots);
    const fileBackbone = maxSlotAmplitude(fileFrame.backboneSlots);
    const micDetail = maxSlotAmplitude(micFrame.detailSlots);
    const fileDetail = maxSlotAmplitude(fileFrame.detailSlots);

    expect(micBackbone).toBeGreaterThan(0);
    expect(fileBackbone).toBeGreaterThan(0);
    expect(micDetail).toBeGreaterThan(0);
    expect(fileDetail).toBe(0);
    expect(micBackbone / fileBackbone).toBeGreaterThanOrEqual(0.8);
    expect(micBackbone / fileBackbone).toBeLessThanOrEqual(2.0);
    expect(micFrame.debug.micFftNormGain).toBe(1);
    expect(fileFrame.debug.micFftNormGain).toBe(1);
    expect(micFrame.debug.preModalFftPeak).toBeCloseTo(0.24, 6);
    expect(micFrame.debug.sourceNormalization.normalizedAmplitude).toBeCloseTo(
      6.2 / 72,
      6,
    );
  });

  it("keeps mic energy response below whiteout territory for speech-like harmonic input", () => {
    const featureState = createAudioFeatureState();
    const peaks = [
      [180, 0.24],
      [320, 0.19],
      [540, 0.13],
      [960, 0.085],
    ];
    const timeData = makeTimeData({
      frequency: 180,
      amplitude: 0.16,
      harmonics: [
        [2, 0.09],
        [3, 0.05],
      ],
    });

    calibrateLiveInput(featureState);

    const frame = buildLiveInputFrame({
      featureState,
      peaks,
      avgAmplitude: 6.2,
      rms: 0.0225,
      frameTimeMs: 1260,
      timeData,
    });

    expect(frame.energySignal).toBeGreaterThan(0.05);
    expect(frame.energySignal).toBeLessThan(0.37);
    expect(frame.debug.energySignal).toBe(frame.energySignal);
    expect(frame.debug.micFftNormGain).toBe(1);
    expect(frame.debug.preModalFftPeak).toBeCloseTo(0.24, 6);
    expect(frame.debug.sourceNormalization.normalizedRms).toBeGreaterThan(0);
    expect(frame.debug.sourceNormalization.normalizedAmplitude).toBeCloseTo(
      6.2 / 72,
      6,
    );
    expect(frame.debug.sourceNormalization.normalizedCentroid).toBeGreaterThan(
      0,
    );
  });

  it("applies mic FFT normalization when gate is open and signal exceeds noise floor", () => {
    const featureState = createAudioFeatureState();
    calibrateLiveInput(featureState); // baseline peak ≈ 0.09

    const frame = buildLiveInputFrame({
      featureState,
      peaks: [
        [440, 0.13],
        [880, 0.065],
      ],
      avgAmplitude: 6.0,
      rms: 0.022,
      frameTimeMs: 1260,
    });

    // Noise-floor calibration is only used to decide whether normalization should
    // run; ordinary calibrated peaks stay unnormalized, while genuinely weak
    // peaks still get lifted using the raw peak value.
    expect(frame.debug.micFftNormGain).toBeGreaterThan(1);
    expect(frame.debug.micFftNormGain).toBeCloseTo(5.0, 1);
  });

  it("does not apply normalization for file input with the same FFT content", () => {
    const featureState = createAudioFeatureState();
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 6.0,
        fftMagnitudes: makeFft([
          [440, 0.24],
          [880, 0.12],
        ]),
        rms: 0.022,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 1260,
    });

    expect(frame.debug.micFftNormGain).toBe(1);
  });

  it("caps normalization gain at MIC_NORMALIZATION_MAX_GAIN (6×)", () => {
    const featureState = createAudioFeatureState();
    // Near-zero noise floor so signalPeak is small → uncapped gain would exceed 6×
    calibrateLiveInput(featureState, {
      peaks: [[90, 0.01]],
      avgAmplitude: 0.5,
      rms: 0.002,
    });

    const frame = buildLiveInputFrame({
      featureState,
      // preModalFftPeak = 0.105 (> absolutePeakFloor 0.10 → gate opens)
      // noiseFloor ≈ 0.01; raw-peak gain would be 0.65 / 0.105 ≈ 6.19 → capped at 6
      peaks: [[440, 0.105]],
      avgAmplitude: 5.0,
      rms: 0.02,
      frameTimeMs: 1260,
    });

    expect(frame.debug.micFftNormGain).toBeLessThanOrEqual(6.0);
    expect(frame.debug.micFftNormGain).toBeGreaterThan(1);
  });

  it("does not normalize when signal peak is at or below the noise floor", () => {
    const featureState = createAudioFeatureState();
    // Calibrate with a strong noise floor
    calibrateLiveInput(featureState, {
      peaks: [
        [440, 0.22],
        [880, 0.18],
      ],
      avgAmplitude: 5.0,
      rms: 0.018,
    });

    const frame = buildLiveInputFrame({
      featureState,
      // preModalFftPeak = 0.20; noiseFloor ≈ 0.22; signalPeak ≤ 0 → no normalization
      peaks: [
        [440, 0.2],
        [880, 0.12],
      ],
      avgAmplitude: 5.0,
      rms: 0.018,
      frameTimeMs: 1260,
    });

    expect(frame.debug.micFftNormGain).toBe(1);
  });

  it("reuses heavy analysis while refreshing fast-lane pulse and novelty outputs", () => {
    const featureState = createAudioFeatureState();
    const status = createStatus({
      audioInputMode: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 42,
    });
    const analysisSnapshot = createSnapshot({
      sourceMode: "file",
      avgAmplitude: 36,
      fftMagnitudes: makeFft([
        [110, 0.92],
        [220, 0.48],
        [440, 0.24],
      ]),
      rms: 0.34,
    });
    const heavyHints = {
      active: true,
      harmonicity: 0.55,
      bassSalience: 0.46,
      textureSpread: 0.18,
      novelty: 0.12,
      transientSalience: 0.14,
      workerState: "ready",
      hintSource: "onnx-worker",
    };
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000,
      analysisHints: heavyHints,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
      analysisHints: heavyHints,
    });

    const transientHints = {
      ...heavyHints,
      novelty: 0.9,
      transientSalience: 0.92,
      bassSalience: 0.78,
    };
    const preparedReuse = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1012,
      analysisHints: transientHints,
    });
    const reused = composeAudioFeatureFrame({
      preparedInputs: preparedReuse,
      analysisResult,
      analysisHints: transientHints,
      previousFrame: first,
      reuseHeavyAnalysis: true,
    });

    expect(reused.backboneSlots).toBe(first.backboneSlots);
    expect(reused.modeSlots).toBe(first.modeSlots);
    expect(reused.keyTonic).toBe(first.keyTonic);
    expect(reused.pulseSignal).toBeGreaterThan(first.pulseSignal);
    expect(reused.changeSignal).toBeGreaterThan(first.changeSignal);
    expect(reused.novelty).toBeCloseTo(0.9, 4);
  });

  it("reuses stored analysis hints when compose receives no fresh hint payload", () => {
    const featureState = createAudioFeatureState();
    const status = createStatus({
      audioInputMode: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 42,
    });
    const heavyHints = {
      active: true,
      harmonicity: 0.55,
      bassSalience: 0.46,
      textureSpread: 0.18,
      novelty: 0.12,
      transientSalience: 0.14,
      workerState: "ready",
      hintSource: "onnx-worker",
    };
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 36,
        fftMagnitudes: makeFft([
          [110, 0.92],
          [220, 0.48],
          [440, 0.24],
        ]),
        rms: 0.34,
      }),
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000,
      analysisHints: heavyHints,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const frame = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
    });

    expect(frame.novelty).toBeCloseTo(heavyHints.novelty, 4);
    expect(frame.debug.workerState).toBe("ready");
    expect(frame.debug.hintSource).toBe("onnx-worker");
  });

  it("reused heavy-analysis frames shed transient-driven signals faster than structural ones", () => {
    const featureState = createAudioFeatureState();
    const status = createStatus({
      audioInputMode: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 7,
    });
    const analysisSnapshot = createSnapshot({
      sourceMode: "file",
      avgAmplitude: 16,
      fftMagnitudes: makeFft([
        [220, 0.58],
        [440, 0.24],
      ]),
      rms: 0.08,
    });
    const transientHints = {
      active: true,
      harmonicity: 0.58,
      bassSalience: 0.8,
      textureSpread: 0.2,
      novelty: 0.92,
      transientSalience: 0.95,
      workerState: "ready",
      hintSource: "onnx-worker",
    };
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000,
      analysisHints: transientHints,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
      analysisHints: transientHints,
    });

    const calmHints = {
      ...transientHints,
      bassSalience: 0.2,
      novelty: 0,
      transientSalience: 0,
    };
    const preparedReuse = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1048,
      analysisHints: calmHints,
    });
    const reused = composeAudioFeatureFrame({
      preparedInputs: preparedReuse,
      analysisResult,
      analysisHints: calmHints,
      previousFrame: first,
      reuseHeavyAnalysis: true,
    });

    expect(reused.backboneSlots).toBe(first.backboneSlots);
    expect(reused.modeSlots).toBe(first.modeSlots);
    expect(reused.sourceMode).toBe(first.sourceMode);
    expect(reused.keyTonic).toBe(first.keyTonic);
    expect(reused.changeSignal / first.changeSignal).toBeLessThan(0.8);
    expect(reused.pulseSignal / first.pulseSignal).toBeLessThan(0.84);
    expect(reused.changeSignal / first.changeSignal).toBeLessThan(
      reused.structureSignal / first.structureSignal,
    );
    expect(reused.pulseSignal / first.pulseSignal).toBeLessThan(
      reused.energySignal / first.energySignal,
    );
  });
});

describe("full-range music handling", () => {
  it("frequency ceiling: 6 kHz peak reaches detail slots", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([[6000, 0.7]]);
    const frame = buildTimedFrame({
      featureState,
      fftMagnitudes,
      avgAmplitude: 80,
      rms: 0.4,
    });

    // At least one detail slot must have non-zero amplitude
    let hasDetailActivity = false;
    for (let i = 3; i < frame.detailSlots.length; i += 4) {
      if ((frame.detailSlots[i] ?? 0) > 0) {
        hasDetailActivity = true;
        break;
      }
    }
    expect(hasDetailActivity).toBe(true);
  });

  it("fade-out: structureSignal collapses proportionally with energy", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [440, 0.8],
      [880, 0.5],
      [1320, 0.3],
    ]);

    // Warm up the feature state at full amplitude over several frames
    for (let i = 0; i < 30; i++) {
      buildTimedFrame({
        featureState,
        fftMagnitudes,
        avgAmplitude: 200,
        rms: 0.8,
        frameTimeMs: i * 16,
      });
    }
    const fullFrame = buildTimedFrame({
      featureState,
      fftMagnitudes,
      avgAmplitude: 200,
      rms: 0.8,
      frameTimeMs: 30 * 16,
    });

    // Now drive to near-silence (rms = 0.02, avgAmplitude = 3) — all subsequent frames
    const silentFft = new Float32Array(BIN_COUNT);
    for (let i = 0; i < 50; i++) {
      buildTimedFrame({
        featureState,
        fftMagnitudes: silentFft,
        avgAmplitude: 3,
        rms: 0.02,
        frameTimeMs: (30 + i) * 16,
      });
    }
    const silentFrame = buildTimedFrame({
      featureState,
      fftMagnitudes: silentFft,
      avgAmplitude: 3,
      rms: 0.02,
      frameTimeMs: 80 * 16,
    });

    // structureSignal at silence must be well below that at full amplitude
    expect(silentFrame.structureSignal).toBeLessThanOrEqual(
      fullFrame.structureSignal * 0.5,
    );
  });

  it("broadband treble: flat high-frequency noise produces trebleBroadbandEnergy", () => {
    const featureState = createAudioFeatureState();
    // Fill bins from 3200–10000 Hz with uniform amplitude (high flatness)
    const fftMagnitudes = new Float32Array(BIN_COUNT);
    const loFreqBin = freqToBin(3200);
    const hiFreqBin = freqToBin(10000);
    for (let i = loFreqBin; i <= hiFreqBin && i < BIN_COUNT; i++) {
      fftMagnitudes[i] = 0.6;
    }
    const frame = buildTimedFrame({
      featureState,
      fftMagnitudes,
      avgAmplitude: 120,
      rms: 0.5,
    });

    expect(frame.trebleBroadbandEnergy).toBeGreaterThan(0.1);
    // spectralBandEnergies must be populated (6 bands)
    expect(frame.spectralBandEnergies).toBeInstanceOf(Float32Array);
    expect(frame.spectralBandEnergies.length).toBe(6);
    // Presence (band 4: 3200–6400) and air (band 5: 6400–12000) should have energy
    expect(frame.spectralBandEnergies[4]).toBeGreaterThan(0);
  });

  it("tonal treble: narrow peaks above 3200 Hz produce trebleTonalEnergy and modeCoherence", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [440, 0.9],
      [880, 0.7],
      [4000, 0.75],
      [8000, 0.65],
    ]);

    // Warm up with several frames so modal state stabilises
    for (let i = 0; i < 15; i++) {
      buildTimedFrame({
        featureState,
        fftMagnitudes,
        avgAmplitude: 150,
        rms: 0.6,
        frameTimeMs: i * 16,
      });
    }
    const frame = buildTimedFrame({
      featureState,
      fftMagnitudes,
      avgAmplitude: 150,
      rms: 0.6,
      frameTimeMs: 15 * 16,
    });

    expect(frame.trebleTonalEnergy).toBeGreaterThan(0);
    expect(frame.modeCoherence).toBeGreaterThan(0);
  });

  it("mixed low-end backbone and broadband treble stays structured without foggy promotion", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = new Float32Array(BIN_COUNT);
    for (const [frequency, amplitude] of [
      [110, 0.9],
      [220, 0.5],
      [440, 0.25],
    ]) {
      fftMagnitudes[freqToBin(frequency)] = amplitude;
    }
    for (
      let bin = freqToBin(3200);
      bin <= freqToBin(10000) && bin < BIN_COUNT;
      bin += 1
    ) {
      fftMagnitudes[bin] = 0.32;
    }

    const frame = buildTimedFrame({
      featureState,
      fftMagnitudes,
      avgAmplitude: 130,
      rms: 0.56,
    });

    expect(
      frame.backboneSlots.some(
        (_, index) => index % 4 === 3 && frame.backboneSlots[index] > 0,
      ),
    ).toBe(true);
    expect(frame.trebleBroadbandEnergy).toBeGreaterThan(0.05);
    expect(frame.structureSignal).toBeLessThanOrEqual(1);
    expect(frame.modeCoherence).toBeGreaterThan(0);
  });
});

describe("modal excitation integration", () => {
  it("keeps the renderer contract stable while using resonator-driven structure", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [110, 0.95],
      [220, 0.52],
      [6600, 0.38],
    ]);
    const timeData = makeTimeData({
      frequency: 110,
      amplitude: 0.45,
      harmonics: [[2, 0.08]],
    });

    const frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 120,
        fftMagnitudes,
        timeData,
        rms: 0.52,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 33,
    });

    expect(frame.backboneSlots).toBeInstanceOf(Float32Array);
    expect(frame.detailSlots).toBeInstanceOf(Float32Array);
    expect(frame.modeSlots).toBeInstanceOf(Float32Array);
    expect(frame.referenceModeSlots).toBeInstanceOf(Float32Array);
    expect(frame.structureSignal).toBeGreaterThan(0);
    expect(frame.modeCoherence).toBeGreaterThan(0);
    expect(frame.debug.excitedModeCount).toBeGreaterThan(0);
    expect(frame.debug.modalPersistence).toBeGreaterThanOrEqual(0);
    expect(frame.debug.driveSource).toBe("time-domain");
  });

  it("surfaces a newly visible composed detail key within two bright treble frames", () => {
    const featureState = createAudioFeatureState();
    const firstFrame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 118,
        fftMagnitudes: makeFft([
          [6200, 0.92],
          [7600, 0.72],
        ]),
        timeData: makeTimeData({
          frequency: 6200,
          amplitude: 0.36,
        }),
        rms: 0.42,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });
    const firstFrameDetailKeys = readModeKeys(firstFrame.detailSlots);
    let frame = null;

    for (let frameIndex = 1; frameIndex <= 2; frameIndex += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 118,
          fftMagnitudes: makeFft([
            [8600, 0.96],
            [9800, 0.7],
          ]),
          timeData: makeTimeData({
            frequency: 8600,
            amplitude: 0.34,
          }),
          rms: 0.42,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.debug.analysisEngine).toBe("modal-excitation");
    const switchedDetailKeys = readModeKeys(frame.detailSlots);
    expect(hasNewModeKey(switchedDetailKeys, firstFrameDetailKeys)).toBe(true);
  });

  it("surfaces a newly visible composed detail key for calibrated line-feed modal excitation", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();

    calibrateLiveInput(featureState, {
      acousticIntent: "ambient",
      status,
      peaks: [
        [180, 0.09],
        [360, 0.07],
      ],
      avgAmplitude: 2.5,
      rms: 0.006,
      timeData: new Float32Array(FFT_SIZE),
    });

    const firstFrame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 5.2,
        fftMagnitudes: makeFft([
          [6200, 0.2],
          [7600, 0.14],
          [9100, 0.1],
        ]),
        timeData: makeTimeData({
          frequency: 6200,
          amplitude: 0.12,
        }),
        rms: 0.02,
      }),
      featureState,
      radius: 3,
      status,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      liveInputAnalysisSettings: { acousticIntent: "ambient" },
    });
    const firstFrameDetailKeys = readModeKeys(firstFrame.detailSlots);
    let frame = null;

    for (const frameTimeMs of [
      LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
      LIVE_INPUT_POST_CALIBRATION_NEXT_MS + 33,
    ]) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: 5.4,
          fftMagnitudes: makeFft([
            [9800, 0.24],
            [10800, 0.16],
          ]),
          timeData: makeTimeData({
            frequency: 9800,
            amplitude: 0.13,
          }),
          rms: 0.02,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });
    }

    expect(frame.debug.analysisEngine).toBe("modal-excitation");
    expect(frame.sourceMode).toBe("line-feed");
    expect(frame.debug.liveInputPolicy).toBe("line-feed");
    const switchedDetailKeys = readModeKeys(frame.detailSlots);
    expect(hasNewModeKey(switchedDetailKeys, firstFrameDetailKeys)).toBe(true);
  });

  it("modal path still collapses structure through fade-out after shared persistence gating", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [110, 0.95],
      [220, 0.52],
      [6600, 0.38],
    ]);
    const timeData = makeTimeData({
      frequency: 110,
      amplitude: 0.45,
      harmonics: [[2, 0.08]],
    });

    for (let i = 0; i < 20; i += 1) {
      buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 120,
          fftMagnitudes,
          timeData,
          rms: 0.52,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: i * 16,
      });
    }

    const activeFrame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 120,
        fftMagnitudes,
        timeData,
        rms: 0.52,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 20 * 16,
    });

    let fadedFrame = null;
    for (let i = 0; i < 30; i += 1) {
      fadedFrame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 3,
          fftMagnitudes: new Float32Array(BIN_COUNT),
          timeData: new Float32Array(FFT_SIZE),
          rms: 0.02,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: (21 + i) * 16,
      });
    }

    expect(fadedFrame.structureSignal).toBeLessThanOrEqual(
      activeFrame.structureSignal * 0.5,
    );
  });

  it("keeps modal output identical when spherical is only requested and the effective backend stays rectangular", () => {
    const featureStateRectangular = createAudioFeatureState();
    const featureStateSpherical = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [110, 0.95],
      [220, 0.52],
      [6600, 0.38],
    ]);
    const timeData = makeTimeData({
      frequency: 110,
      amplitude: 0.45,
      harmonics: [[2, 0.08]],
    });
    const analysisSnapshot = createSnapshot({
      avgAmplitude: 120,
      fftMagnitudes,
      timeData,
      rms: 0.52,
    });

    const rectangularFrame = buildAudioFeatureFrameBase({
      analysisSnapshot,
      featureState: featureStateRectangular,
      radius: 3,
      cavityGeometry: "rectangular",
      status: makeActiveStatus(),
      frameTimeMs: 33,
    });
    const sphericalRequestedFrame = buildAudioFeatureFrameBase({
      analysisSnapshot,
      featureState: featureStateSpherical,
      radius: 3,
      cavityGeometry: "spherical",
      status: makeActiveStatus(),
      frameTimeMs: 33,
    });

    expect(Array.from(sphericalRequestedFrame.backboneSlots)).toEqual(
      Array.from(rectangularFrame.backboneSlots),
    );
    expect(Array.from(sphericalRequestedFrame.detailSlots)).toEqual(
      Array.from(rectangularFrame.detailSlots),
    );
    expect(Array.from(sphericalRequestedFrame.modeSlots)).toEqual(
      Array.from(rectangularFrame.modeSlots),
    );
    expect(sphericalRequestedFrame.debug.requestedCavityGeometry).toBe(
      "spherical",
    );
    expect(sphericalRequestedFrame.debug.effectiveCavityGeometry).toBe(
      "rectangular",
    );
  });

  it("keeps a brief visible release tail on near-silence", () => {
    const featureState = createAudioFeatureState();
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
      [6600, 0.38],
    ]);
    const activeTimeData = makeTimeData({
      frequency: 550,
      amplitude: 0.45,
      harmonics: [[2, 0.08]],
    });
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let previousFrame = null;
    let activeFrame = null;
    let silentResult = null;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: activeFft,
        timeData: activeTimeData,
        avgAmplitude: 120,
        rms: 0.52,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
      activeFrame = result.frame;
    }

    for (let frameIndex = 10; frameIndex < 16; frameIndex += 1) {
      silentResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 2.5,
        rms: 0.01,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = silentResult.frame;
    }

    expect(silentResult.analysisResult.usedDecay).toBe(true);
    expect(
      sumSlotAmplitudes(silentResult.analysisResult.modeSlots),
    ).toBeGreaterThan(
      sumSlotAmplitudes(silentResult.analysisResult.signalModeSlots),
    );
    expect(sumSlotAmplitudes(silentResult.frame.backboneSlots)).toBeGreaterThan(
      0,
    );
    expect(silentResult.frame.structureSignal).toBeLessThan(
      activeFrame.structureSignal * 0.65,
    );
    expect(silentResult.frame.changeSignal).toBeGreaterThanOrEqual(0);
  });

  it("clears modal cymatics quickly on true hard silence", () => {
    const featureState = createAudioFeatureState();
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
      [6600, 0.38],
    ]);
    const activeTimeData = makeTimeData({
      frequency: 550,
      amplitude: 0.45,
      harmonics: [[2, 0.08]],
    });
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let previousFrame = null;
    let silentResult = null;
    let activeBackboneAmplitude = 0;
    let activeDetailAmplitude = 0;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: activeFft,
        timeData: activeTimeData,
        avgAmplitude: 120,
        rms: 0.52,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
      activeBackboneAmplitude = sumSlotAmplitudes(result.frame.backboneSlots);
      activeDetailAmplitude = sumSlotAmplitudes(result.frame.detailSlots);
    }

    for (let frameIndex = 10; frameIndex < 16; frameIndex += 1) {
      silentResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 0,
        rms: 0,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = silentResult.frame;
    }

    expect(silentResult.analysisResult.usedDecay).toBe(true);
    expect(sumSlotAmplitudes(silentResult.analysisResult.signalModeSlots)).toBe(
      0,
    );
    expect(sumSlotAmplitudes(silentResult.frame.backboneSlots)).toBeLessThan(
      activeBackboneAmplitude * 0.08,
    );
    expect(sumSlotAmplitudes(silentResult.frame.detailSlots)).toBeLessThan(
      activeDetailAmplitude * 0.08,
    );
  });

  it("keeps dense low-change modal input visually pruned without collapsing reactivity", () => {
    const featureState = createAudioFeatureState();
    let previousFrame = null;
    let result = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      result = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: makeFft([
          [90, 0.92],
          [110, 0.95],
          [220, 0.84],
          [330, 0.7],
          [440, 0.58],
          [660, 0.52],
          [6200, 0.44],
          [6800, 0.41],
          [7600, 0.38],
        ]),
        timeData: makeTimeData({
          frequency: 110,
          amplitude: 0.55,
          harmonics: [
            [2, 0.12],
            [3, 0.08],
          ],
        }),
        avgAmplitude: 135,
        rms: 0.58,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
    }

    expect(sumSlotAmplitudes(result.analysisResult.modeSlots)).toBeLessThan(
      sumSlotAmplitudes(result.analysisResult.signalModeSlots),
    );
    expect(result.frame.structureSignal).toBeGreaterThan(0);
    expect(result.frame.changeSignal).toBeGreaterThanOrEqual(0);
    expect(result.frame.modeCoherence).toBeGreaterThan(0);
  });
});
