import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUDIO_SLOT_CAPACITY,
  CAVITY_ACOUSTIC_DEFAULTS,
} from "../../defaults.js";
import {
  applyTestToneToSnapshot,
  buildAudioFeatureFrame as buildAudioFeatureFrameBase,
  buildCurrentAudioFeatureAnalysisResult,
  buildFastSignalPatchedAudioFeatureAnalysisResult,
  composeAudioFeatureFrame,
  createAudioFeatureState,
  detectLiveInputNoiseGate,
  prepareAudioFeatureFrameInputs as prepareAudioFeatureFrameInputsBase,
  runHeavyAudioFeatureAnalysis,
  updateAudioFeatureFastSignalState,
} from "./buildFeatureFrame.js";
import { binIndexToFrequencyHz, frequencyToBinIndex } from "./binFrequency.js";
import { deriveHighQSparseResonatorEvidence } from "./highQSparseResonatorEvidence.js";
import { DEFAULT_RENDER_ENERGY_EPSILON } from "./modalEnergyLedger.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
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

it("derives observation energy from modal coefficient and response only", () => {
  const source = readFileSync(
    new URL("./buildFeatureFrame.js", import.meta.url),
    "utf8",
  );
  const observationEnergyHelper = source.match(
    /function deriveModalObservationEnergy[\s\S]*?\n}/,
  )?.[0];

  expect(observationEnergyHelper).toBeTruthy();
  expect(observationEnergyHelper).not.toContain("modalPhaseAuthority");
  expect(observationEnergyHelper).not.toContain("liveInputHardSilenceActive");
});

it("keeps render liveness owned by canonical energy quantities", () => {
  const source = readFileSync(
    new URL("./buildFeatureFrame.js", import.meta.url),
    "utf8",
  );
  const renderAuthorityHelper = source.match(
    /function hasFeatureFrameRenderAuthority[\s\S]*?\n}/,
  )?.[0];

  expect(renderAuthorityHelper).toBeTruthy();
  expect(renderAuthorityHelper).toContain("modalCoefficientEnergy");
  expect(renderAuthorityHelper).toContain("observationEnergy");
  expect(renderAuthorityHelper).not.toContain("activeModeCount");
  expect(renderAuthorityHelper).not.toContain("modalVisibilityEnergy");
  expect(renderAuthorityHelper).not.toContain("modalObserverVisibilityEnergy");
  expect(renderAuthorityHelper).not.toContain("diagnostic");
  expect(renderAuthorityHelper).not.toContain("probe");
});

it("keeps source and resonant slot reservoirs out of production owners", () => {
  const productionFiles = [
    "./buildFeatureFrame.js",
    "./modalExcitation.js",
    "./modalExcitationState.js",
    "./modalStack.js",
  ];

  for (const file of productionFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    expect(source).not.toMatch(/\bsourceCoupledSlots\b/);
    expect(source).not.toMatch(/\bresonantSlots\b/);
  }
});

it("patches current fast audio signals without replacing structural modal fields", () => {
  const featureState = createAudioFeatureState();
  const status = createStatus({
    audioInputMode: "file",
    isPlaying: true,
    playbackSessionId: "song-1",
  });
  const previousInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      avgAmplitude: 24,
      rms: 0.2,
      fftMagnitudes: makeFft([
        [220, 0.9],
        [440, 0.4],
      ]),
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs: 1000,
  });
  const previousAnalysis = runHeavyAudioFeatureAnalysis(previousInputs);
  const currentInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      avgAmplitude: 96,
      rms: 0.8,
      fftMagnitudes: makeFft([
        [220, 0.1],
        [880, 0.95],
      ]),
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs: 1016,
  });

  const patchedAnalysis = buildFastSignalPatchedAudioFeatureAnalysisResult({
    preparedInputs: currentInputs,
    previousAnalysisResult: previousAnalysis,
  });

  expect(patchedAnalysis.avgAmplitude).toBe(96);
  expect(patchedAnalysis.analyserRms).toBe(0.8);
  expect(patchedAnalysis.transientEnergy).toBeGreaterThan(
    previousAnalysis.transientEnergy,
  );
  expect(patchedAnalysis.bandEnergies).toBe(currentInputs.bandEnergies);
  expect(patchedAnalysis.modeSlots).toBe(previousAnalysis.modeSlots);
  expect(patchedAnalysis.candidateForcingSlots).toBe(
    previousAnalysis.candidateForcingSlots,
  );
  expect(patchedAnalysis.candidateResponseSlots).toBe(
    previousAnalysis.candidateResponseSlots,
  );
});

it("reuses exact FFT summaries for file-source evidence", () => {
  const featureState = createAudioFeatureState();
  const status = makeActiveStatus({
    playbackSessionId: "summary-regression",
  });
  const peaks = [
    [220, 0.75],
    [440, 0.25],
    [1760, 0.08],
  ];
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      avgAmplitude: 32,
      rms: 0.12,
      fftMagnitudes: makeFft(peaks),
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs: 1000,
  });
  const expectedCentroid =
    peaks.reduce((weighted, [frequency, amplitude]) => {
      const bin = freqToBin(frequency);
      const resolvedFrequency = binIndexToFrequencyHz(
        bin,
        BIN_COUNT,
        SAMPLE_RATE,
      );
      return weighted + resolvedFrequency * amplitude;
    }, 0) /
    peaks.reduce((total, [, amplitude]) => total + amplitude, 0) /
    (SAMPLE_RATE * 0.5);

  expect(preparedInputs.preModalFftPeak).toBeCloseTo(0.75, 6);
  expect(preparedInputs.spectralCentroidHint).toBeCloseTo(expectedCentroid, 6);
  expect(preparedInputs.nonZeroFftBinCount).toBe(peaks.length);
  expect(preparedInputs.sourceEvidence.metrics.preModalFftPeak).toBeCloseTo(
    0.75,
    6,
  );
  expect(preparedInputs.sourceEvidence.metrics.nonZeroFftBinCount).toBe(
    peaks.length,
  );
});

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
  return frequencyToBinIndex(freq, BIN_COUNT, SAMPLE_RATE);
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    fft[Math.max(1, freqToBin(frequency))] = amplitude;
  }
  return fft;
}

function makeDenseFft({
  count = 1000,
  amplitude = 0.035,
  lowBin = 8,
  peakFrequency = 427,
  peakAmplitude = 0.62,
} = {}) {
  const fft = new Float32Array(BIN_COUNT);
  for (let index = 0; index < count; index += 1) {
    const bin = Math.min(BIN_COUNT - 1, lowBin + index);
    fft[bin] = amplitude + ((index % 7) / 7) * amplitude;
  }
  fft[Math.max(1, freqToBin(peakFrequency))] = peakAmplitude;
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

it("carries acoustic cavity scale separately from visual radius", () => {
  const featureState = createAudioFeatureState(AUDIO_SLOT_CAPACITY);
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      fftMagnitudes: makeFft([[60, 0.9]]),
    }),
    featureState,
    radius: 3,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: "neumann",
    status: createStatus({
      audioInputMode: "file",
      isPlaying: true,
      hasAnalysisSource: true,
    }),
  });

  expect(preparedInputs.radius).toBe(3);
  expect(preparedInputs.cavityAcousticScale).toBe(CAVITY_ACOUSTIC_DEFAULTS);
  expect(preparedInputs.boundaryMode).toBe("neumann");
});

function makeMixedTimeData({
  partials,
  amplitudeScale = 1,
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
}) {
  const timeData = new Float32Array(fftSize);
  let normalizer = 0;
  for (const [, amplitude] of partials) {
    normalizer += Math.abs(amplitude);
  }
  const safeNormalizer = Math.max(normalizer, 1e-6);
  for (let index = 0; index < fftSize; index += 1) {
    let sample = 0;
    for (const [frequency, amplitude] of partials) {
      sample +=
        Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
    }
    timeData[index] = (sample / safeNormalizer) * amplitudeScale;
  }
  return timeData;
}

const RESONANT_STRIKE_PARTIALS = Object.freeze([
  [196, 0.9],
  [293, 0.76],
  [432, 0.7],
  [611, 0.58],
  [832, 0.5],
  [1180, 0.44],
  [1860, 0.36],
  [3100, 0.28],
  [5200, 0.24],
]);

const INHARMONIC_BOWL_STRIKE_PARTIALS = Object.freeze([
  [196, 0.9],
  [282, 0.76],
  [417, 0.7],
  [611, 0.58],
  [899, 0.5],
  [1327, 0.42],
  [1890, 0.34],
  [2780, 0.26],
  [4100, 0.2],
]);

const LOUD_BOWL_TONE_PARTIALS = Object.freeze([
  [196, 0.42],
  [282, 0.28],
]);

function scalePartials(partials, scale) {
  return partials.map(([frequency, amplitude]) => [
    frequency,
    amplitude * scale,
  ]);
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

function collectWeightedColorSlotTriples(slots, minWeight = 0.05) {
  const colors = [];
  for (let index = 0; index < slots.length; index += 4) {
    const weight = slots[index + 3] ?? 0;
    if (weight < minWeight) continue;
    colors.push({
      r: slots[index] ?? 0,
      g: slots[index + 1] ?? 0,
      b: slots[index + 2] ?? 0,
      weight,
    });
  }
  return colors;
}

function maxColorDistance(colors) {
  let maxDistance = 0;
  for (let left = 0; left < colors.length; left += 1) {
    for (let right = left + 1; right < colors.length; right += 1) {
      const dr = colors[left].r - colors[right].r;
      const dg = colors[left].g - colors[right].g;
      const db = colors[left].b - colors[right].b;
      maxDistance = Math.max(maxDistance, Math.hypot(dr, dg, db));
    }
  }
  return maxDistance;
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

it("does not let topology below the render-energy epsilon authorize liveness", () => {
  const featureState = createAudioFeatureState();
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      sourceMode: "live",
      avgAmplitude: 12,
      fftMagnitudes: makeFft([[220, 0.08]]),
      rms: 0.03,
    }),
    featureState,
    radius: 3,
    status: makeLiveInputStatus(),
    frameTimeMs: 0,
  });
  const expectedProjectedEnergy = DEFAULT_RENDER_ENERGY_EPSILON * 0.5;
  const epsilonAmplitude = Math.sqrt(expectedProjectedEnergy);
  const structuralState = makeManualStructuralState({
    candidateForcingSlots: makeModeSlots([[1, 1, 1, epsilonAmplitude]]),
    structuralMetrics: {
      modalResponseEnergy: 0.4,
      modalResponseSourceCoupledEnergy: 0.4,
      modalResponseRenderEnergy: expectedProjectedEnergy,
      energyLedger: {
        sourceBoundaryState: "live",
      },
    },
  });

  const frame = composeManualStructuralFrame({
    preparedInputs,
    structuralState,
  });

  expect(frame.energyLedger.projectedRenderEnergy).toBeCloseTo(
    expectedProjectedEnergy,
    8,
  );
  expect(frame.energyLedger.storedModalEnergy).toBeCloseTo(0.4, 6);
  expect(frame.renderAuthority).toBe(false);
  expect(frame.fieldState).toBe("idle");
  expect(frame.hasModalField).toBe(false);
  expect(frame.activeModalFieldModeCount).toBe(0);
  expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
});

function sumSlotAmplitudes(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    total += slots[index * 4 + 3] ?? 0;
  }
  return total;
}

function findModeAmplitude(slots, [u, v, w]) {
  for (let index = 0; index < (slots?.length ?? 0); index += 4) {
    if (
      slots[index] === u &&
      slots[index + 1] === v &&
      slots[index + 2] === w
    ) {
      return slots[index + 3] ?? 0;
    }
  }
  return 0;
}

function findModeSlotOffset(slots, [u, v, w]) {
  for (let index = 0; index < (slots?.length ?? 0); index += 4) {
    if (
      slots[index] === u &&
      slots[index + 1] === v &&
      slots[index + 2] === w &&
      (slots[index + 3] ?? 0) > 0
    ) {
      return index;
    }
  }
  return -1;
}

function makeSingleModeSlot([u, v, w, amplitude]) {
  const slots = new Float32Array(AUDIO_SLOT_CAPACITY * 4);
  slots[0] = u;
  slots[1] = v;
  slots[2] = w;
  slots[3] = amplitude;
  return slots;
}

function makeModeSlots(entries) {
  const slots = new Float32Array(AUDIO_SLOT_CAPACITY * 4);
  entries.forEach(([u, v, w, amplitude], index) => {
    const offset = index * 4;
    slots[offset] = u;
    slots[offset + 1] = v;
    slots[offset + 2] = w;
    slots[offset + 3] = amplitude;
  });
  return slots;
}

function makePhaseSlots(entries) {
  const slots = new Float32Array(AUDIO_SLOT_CAPACITY * 4);
  entries.forEach(
    ([phaseOffset, phaseVelocity, coherence, authority], index) => {
      const offset = index * 4;
      slots[offset] = phaseOffset;
      slots[offset + 1] = phaseVelocity;
      slots[offset + 2] = coherence;
      slots[offset + 3] = authority;
    },
  );
  return slots;
}

function makeQuadSlots(entries) {
  const slots = new Float32Array(AUDIO_SLOT_CAPACITY * 4);
  entries.forEach(([x, y, z, w], index) => {
    const offset = index * 4;
    slots[offset] = x;
    slots[offset + 1] = y;
    slots[offset + 2] = z;
    slots[offset + 3] = w;
  });
  return slots;
}

function countAuthoritativePhaseSlots(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) > 0) {
      total += 1;
    }
  }
  return total;
}

function countActiveSlots(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) > 0) {
      total += 1;
    }
  }
  return total;
}

function makeManualStructuralState({
  candidateForcingSlots = makeModeSlots([]),
  candidateResponseSlots = makeModeSlots([]),
  proposalSourceCoupledSlots = candidateForcingSlots,
  proposalResonantSlots = candidateResponseSlots,
  sourceCoupledPhaseSlots = makePhaseSlots([]),
  resonantPhaseSlots = makePhaseSlots([]),
  proposalSourceCoupledPhaseSlots = sourceCoupledPhaseSlots,
  proposalSourceCoupledColorSlots = makeQuadSlots([]),
  proposalSourceCoupledSpectralLaneA = makeQuadSlots([]),
  proposalSourceCoupledSpectralLaneB = makeQuadSlots([]),
  proposalSourceCoupledSpectralMeta = makeQuadSlots([]),
  dominantFrequency = 196,
  dominantAmplitude = 0.08,
  sourceMode = "file",
  structuralMetrics = {},
  suppressedByFog = false,
} = {}) {
  return {
    candidateForcingSlotsSource: candidateForcingSlots,
    candidateResponseSlotsSource: candidateResponseSlots,
    referenceSourceCoupledSlotsSource: candidateForcingSlots,
    referenceResonantSlotsSource: candidateResponseSlots,
    proposalSourceCoupledSlotsSource: proposalSourceCoupledSlots,
    proposalResonantSlotsSource: proposalResonantSlots,
    sourceCoupledPhaseSlotsSource: sourceCoupledPhaseSlots,
    resonantPhaseSlotsSource: resonantPhaseSlots,
    proposalSourceCoupledPhaseSlotsSource: proposalSourceCoupledPhaseSlots,
    proposalSourceCoupledColorSlotsSource: proposalSourceCoupledColorSlots,
    proposalSourceCoupledSpectralLaneASource:
      proposalSourceCoupledSpectralLaneA,
    proposalSourceCoupledSpectralLaneBSource:
      proposalSourceCoupledSpectralLaneB,
    proposalSourceCoupledSpectralMetaSource: proposalSourceCoupledSpectralMeta,
    proposalReferenceSourceCoupledSlotsSource: proposalSourceCoupledSlots,
    proposalReferenceResonantSlotsSource: proposalResonantSlots,
    dominantFrequency,
    dominantAmplitude,
    analysisEngine: "modal-excitation",
    pitchSource: "resonator-bank",
    spectralCandidates: [],
    sourceMode,
    structuralMetrics,
    suppressedByFog,
  };
}

function composeManualStructuralFrame({ preparedInputs, structuralState }) {
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  const analysisResult = buildCurrentAudioFeatureAnalysisResult({
    preparedInputs,
    fastSignalState,
    structuralState,
    materializeStructuralProjection: true,
  });
  return composeAudioFeatureFrame({
    preparedInputs,
    analysisResult,
  });
}

function buildModalExcitationAnalysisFrame({
  featureState,
  fftMagnitudes,
  timeData = new Float32Array(FFT_SIZE),
  avgAmplitude = 24,
  rms = 0.2,
  frameTimeMs = 0,
  previousFrame = null,
  status = makeActiveStatus(),
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
    status,
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

function expectClosedSourceRenderFrame(frame) {
  expect(["absent", "muted", "zero"]).toContain(
    frame.energyLedger.sourceBoundaryState,
  );
  expect(frame.energyLedger.projectedRenderEnergy).toBe(0);
  expect(frame.renderAuthority).toBe(false);
  expect(frame.activeModeCount).toBe(0);
  expect(frame.activeModalFieldModeCount).toBe(0);
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

function makeLowQSourceCoupledStructuralMetrics(overrides = {}) {
  return {
    modeCoherence: 0.48,
    modalPersistence: 0.01,
    modalDriveEnergy: 0.008,
    modalResponseEnergy: 0.055,
    modalResponseInputEnergy: 0.12,
    modalResponseSourceCoupledEnergy: 0.055,
    modalResponseResonantEnergy: 0,
    modalResponseModeCount: 2,
    modalResponseBudgetScaleSourceCoupled: 1,
    modalResponseBudgetScaleResonant: 1,
    distributedExcitation: 0.08,
    lowQSourceCoupledModeCount: 2,
    lowQSourceCoupledEnergy: 0.055,
    lowQObservedDrive: 0.34,
    lowQObservedSnr: 0.26,
    lowQObservedCoherence: 0.66,
    highQResonantModeCount: 0,
    highQResonantEnergy: 0,
    highQRingSupport: 0,
    highQObservedDrive: 0,
    highQObservedSnr: 0,
    highQObservedCoherence: 0,
    highQPhaseAuthority: 0,
    ...overrides,
  };
}

function buildManualLowQSourceCoupledFrame({
  status = makeActiveStatus(),
  sourceMode = "file",
  avgAmplitude = 8.2,
  rms = 0.028,
  fftMagnitudes = makeFft([
    [55, 0.28],
    [110, 0.18],
  ]),
  timeData = makeMixedTimeData({
    partials: [
      [55, 0.8],
      [110, 0.24],
    ],
    amplitudeScale: 0.09,
  }),
  candidateForcingSlots = makeModeSlots([
    [1, 1, 1, 0.0006],
    [2, 1, 1, 0.0004],
  ]),
  candidateResponseSlots = makeModeSlots([]),
  structuralMetrics = makeLowQSourceCoupledStructuralMetrics(),
  liveInputAnalysisSettings,
} = {}) {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      sourceMode,
      avgAmplitude,
      fftMagnitudes,
      timeData,
      rms,
    }),
    featureState: createAudioFeatureState(),
    radius: 3,
    status,
    frameTimeMs: 0,
    liveInputAnalysisSettings,
  });
  const structuralState = makeManualStructuralState({
    candidateForcingSlots,
    candidateResponseSlots,
    sourceMode,
    structuralMetrics,
  });

  return composeManualStructuralFrame({ preparedInputs, structuralState });
}

function makeModalFieldContinuityStructuralMetrics(overrides = {}) {
  return {
    modeCoherence: 0.82,
    modalPersistence: 0.88,
    modalDriveEnergy: 0.34,
    modalResponseEnergy: 0.42,
    modalResponseInputEnergy: 0.45,
    modalResponseSourceCoupledEnergy: 0.34,
    modalResponseResonantEnergy: 0.08,
    modalResponseModeCount: 4,
    modalResponseRenderEnergy: 0.42,
    modalResponseRenderSourceCoupledEnergy: 0.34,
    modalResponseRenderResonantEnergy: 0.08,
    modalResponseRawEnergy: 0.42,
    modalResponseBudgetScaleSourceCoupled: 1,
    modalResponseBudgetScaleResonant: 1,
    modalResponseBudgetScale: 1,
    currentSignalEnergy: 0.45,
    currentSignalAmplitude: 0.5,
    excitedModeCount: 4,
    observedModalModeCount: 4,
    modalPhaseAuthority: 0.9,
    modalPhaseCoherentFieldModeCount: 4,
    ...overrides,
  };
}

function buildManualModalContinuityFrame({
  featureState,
  frameTimeMs,
  candidateForcingSlots,
  proposalSourceCoupledSlots = candidateForcingSlots,
  sourceCoupledPhaseSlots = makePhaseSlots([]),
  proposalSourceCoupledPhaseSlots = sourceCoupledPhaseSlots,
  proposalSourceCoupledColorSlots = makeQuadSlots([]),
  proposalSourceCoupledSpectralLaneA = makeQuadSlots([]),
  proposalSourceCoupledSpectralLaneB = makeQuadSlots([]),
  proposalSourceCoupledSpectralMeta = makeQuadSlots([]),
  structuralMetrics = makeModalFieldContinuityStructuralMetrics(),
  suppressedByFog = false,
  sourceMode = "file",
  status = makeActiveStatus(),
} = {}) {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      sourceMode,
      avgAmplitude: 42,
      fftMagnitudes: makeFft([
        [196, 0.72],
        [392, 0.45],
        [588, 0.32],
      ]),
      rms: 0.22,
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs,
  });
  const structuralState = makeManualStructuralState({
    candidateForcingSlots,
    proposalSourceCoupledSlots,
    sourceCoupledPhaseSlots,
    proposalSourceCoupledPhaseSlots,
    proposalSourceCoupledColorSlots,
    proposalSourceCoupledSpectralLaneA,
    proposalSourceCoupledSpectralLaneB,
    proposalSourceCoupledSpectralMeta,
    sourceMode,
    structuralMetrics,
    suppressedByFog,
  });
  return composeManualStructuralFrame({ preparedInputs, structuralState });
}

function addModalFingerprintLayer(fingerprint, slotBuffer, weight = 1) {
  for (let index = 0; index < slotBuffer.length; index += 4) {
    const amplitude = (slotBuffer[index + 3] ?? 0) * weight;
    if (amplitude <= 0) continue;
    const key = `${slotBuffer[index]}:${slotBuffer[index + 1]}:${
      slotBuffer[index + 2]
    }`;
    fingerprint.set(key, (fingerprint.get(key) ?? 0) + amplitude);
  }
}

function buildModalFingerprint(frame) {
  const amplitudes = new Map();
  addModalFingerprintLayer(amplitudes, frame.modalFieldSlots, 1);
  addModalFingerprintLayer(amplitudes, frame.modalFieldSlots, 0.45);
  let totalAmplitude = 0;
  for (const amplitude of amplitudes.values()) {
    totalAmplitude += amplitude;
  }

  return {
    amplitudes,
    totalAmplitude,
  };
}

function measureStaleModalDominance(sourceFingerprint, nextFingerprint) {
  if ((nextFingerprint?.totalAmplitude ?? 0) <= 0) {
    return 0;
  }

  let staleAmplitude = 0;
  for (const key of sourceFingerprint?.amplitudes?.keys?.() ?? []) {
    staleAmplitude += nextFingerprint.amplitudes.get(key) ?? 0;
  }
  return staleAmplitude / nextFingerprint.totalAmplitude;
}

function measureModalFingerprintRetention(sourceFingerprint, nextFingerprint) {
  if ((sourceFingerprint?.totalAmplitude ?? 0) <= 0) {
    return 0;
  }

  let retainedAmplitude = 0;
  for (const [key, sourceAmplitude] of sourceFingerprint.amplitudes) {
    retainedAmplitude += Math.min(
      sourceAmplitude,
      nextFingerprint?.amplitudes?.get(key) ?? 0,
    );
  }
  return retainedAmplitude / sourceFingerprint.totalAmplitude;
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
    expect(frame.modalFieldSlots.every((value) => value === 0)).toBe(true);
    expect(frame.modalFieldSlots.every((value) => value === 0)).toBe(true);
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
    buildTimedFrame({
      featureState,
      fftMagnitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 16,
    });
    // Steady: same audio after warmup -> low changeSignal
    const steadyFrame = buildTimedFrame({
      featureState,
      fftMagnitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 32,
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
      frameTimeMs: 48,
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
    expect(changingFrame.changeSignal).toBeGreaterThan(0.04);
  });

  it("routes modal descriptor source through continuity before publication", () => {
    const featureState = createAudioFeatureState();
    const firstCandidate = makeModeSlots([[9, 3, 1, 0.42]]);

    const bootstrapped = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: firstCandidate,
      sourceCoupledPhaseSlots: makePhaseSlots([[0.1, 0.2, 0.8, 0.9]]),
    });

    expect(bootstrapped.renderAuthority).toBe(true);
    expect(readModeKeys(bootstrapped.modalFieldSlots)).toEqual(["9:3:1"]);
    expect(bootstrapped.modalFieldContinuity).toMatchObject({
      candidateModeCount: 1,
      visibleModeCount: 1,
      admittedModeKeys: ["9:3:1"],
    });

    const earlyNewIdentity = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 16,
      candidateForcingSlots: makeModeSlots([
        [10, 3, 1, 0.68],
        [9, 3, 1, 0.4],
      ]),
      sourceCoupledPhaseSlots: makePhaseSlots([
        [0.4, 0.5, 0.8, 0.9],
        [1.1, 2.2, 0.7, 0.95],
      ]),
    });

    expect(readModeKeys(earlyNewIdentity.modalFieldSlots)).toEqual(["9:3:1"]);
    expect(earlyNewIdentity.modalFieldContinuity.tailModeKeys).toContain(
      "10:3:1",
    );

    const promotedNewIdentity = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 80,
      candidateForcingSlots: makeModeSlots([
        [10, 3, 1, 0.7],
        [9, 3, 1, 0.41],
      ]),
      sourceCoupledPhaseSlots: makePhaseSlots([
        [0.6, 0.7, 0.8, 0.9],
        [1.1, 2.2, 0.7, 0.95],
      ]),
    });

    expect(readModeKeys(promotedNewIdentity.modalFieldSlots)).toEqual([
      "9:3:1",
      "10:3:1",
    ]);
    expect(promotedNewIdentity.modalFieldPhaseSlots[0]).toBeCloseTo(1.1, 6);
    expect(promotedNewIdentity.modalFieldPhaseSlots[1]).toBeCloseTo(2.2, 6);
    expect(promotedNewIdentity.modalFieldContinuity.admittedModeKeys).toEqual([
      "10:3:1",
    ]);
  });

  it("lets richer proposal candidates compete in global continuity admission", () => {
    const featureState = createAudioFeatureState();
    const blendedSourceCoupledSlots = makeModeSlots([[2, 1, 1, 0.42]]);
    const proposalSourceCoupledSlots = makeModeSlots([[3, 1, 1, 0.36]]);
    const proposalSourceCoupledPhaseSlots = makePhaseSlots([
      [1.25, 2.5, 0.7, 0.8],
    ]);
    const proposalSourceCoupledColorSlots = makeQuadSlots([
      [0.2, 0.45, 0.7, 0.9],
    ]);
    const proposalSourceCoupledSpectralLaneA = makeQuadSlots([
      [0.1, 0.2, 0.3, 0.4],
    ]);
    const proposalSourceCoupledSpectralLaneB = makeQuadSlots([
      [0.05, 0.15, 0.25, 0.35],
    ]);
    const proposalSourceCoupledSpectralMeta = makeQuadSlots([
      [0.4, 0.5, 0.6, 0.7],
    ]);

    const frame = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: blendedSourceCoupledSlots,
      proposalSourceCoupledSlots,
      proposalSourceCoupledPhaseSlots,
      proposalSourceCoupledColorSlots,
      proposalSourceCoupledSpectralLaneA,
      proposalSourceCoupledSpectralLaneB,
      proposalSourceCoupledSpectralMeta,
      structuralMetrics: makeModalFieldContinuityStructuralMetrics({
        excitedModeCount: 2,
        observedModalModeCount: 2,
      }),
    });

    expect(readModeKeys(frame.modalFieldSlots).sort()).toEqual([
      "2:1:1",
      "3:1:1",
    ]);
    expect(frame.modalFieldContinuity.candidateModeCount).toBe(2);
    expect(frame.modalFieldContinuity.admittedModeKeys.sort()).toEqual([
      "2:1:1",
      "3:1:1",
    ]);
    expect(
      frame.modalDescriptor.diagnostics.modalVarietyAudit
        .upstreamSourceCoupledModeCount,
    ).toBe(2);
    const proposalModeOffset = findModeSlotOffset(
      frame.modalFieldSlots,
      [3, 1, 1],
    );
    expect(proposalModeOffset).toBeGreaterThanOrEqual(0);
    expect(frame.modalFieldPhaseSlots[proposalModeOffset]).toBeCloseTo(1.25, 6);
    expect(frame.modalFieldPhaseSlots[proposalModeOffset + 3]).toBeCloseTo(
      0.8,
      6,
    );
    expect(frame.modalFieldColorSlots[proposalModeOffset + 3]).toBeCloseTo(
      0.9,
      6,
    );
    expect(
      frame.modalFieldSpectralLaneA[proposalModeOffset + 2],
    ).toBeGreaterThan(0);
    expect(
      frame.modalFieldSpectralMeta[proposalModeOffset + 3],
    ).toBeGreaterThan(0);
    expect(countActiveSlots(frame.modalFieldSlots)).toBeLessThanOrEqual(12);
  });

  it("does not admit richer proposal candidates during fog suppression", () => {
    const featureState = createAudioFeatureState();
    const liveStatus = makeLiveInputStatus();
    buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[1, 1, 1, 0.42]]),
      sourceMode: "live",
      status: liveStatus,
    });

    const frame = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 16,
      candidateForcingSlots: makeModeSlots([[2, 1, 1, 0.42]]),
      proposalSourceCoupledSlots: makeModeSlots([
        [2, 1, 1, 0.42],
        [3, 1, 1, 0.36],
      ]),
      structuralMetrics: makeModalFieldContinuityStructuralMetrics({
        excitedModeCount: 2,
        observedModalModeCount: 2,
      }),
      sourceMode: "live",
      status: liveStatus,
      suppressedByFog: true,
    });

    expect(readModeKeys(frame.modalFieldSlots)).toEqual(["1:1:1"]);
    expect(frame.modalFieldContinuity.candidateModeCount).toBe(0);
    expect(
      frame.modalDescriptor.diagnostics.modalVarietyAudit
        .upstreamSourceCoupledModeCount,
    ).toBe(0);
  });

  it("bootstraps modal field continuity immediately after a silent reset", () => {
    const featureState = createAudioFeatureState();
    buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[9, 3, 1, 0.42]]),
    });

    const silent = buildAudioFeatureFrame({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 16,
    });
    expect(silent.fieldState).toBe("idle");
    expect(silent.activeModalFieldModeCount).toBe(0);

    const resumed = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 32,
      candidateForcingSlots: makeModeSlots([[10, 3, 1, 0.5]]),
    });

    expect(readModeKeys(resumed.modalFieldSlots)).toEqual(["10:3:1"]);
    expect(resumed.modalFieldContinuity.admittedModeKeys).toEqual(["10:3:1"]);
  });

  it("holds visible modal continuity through a live-source empty projection frame", () => {
    const featureState = createAudioFeatureState();
    const bootstrapped = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[9, 3, 1, 0.42]]),
      sourceCoupledPhaseSlots: makePhaseSlots([[0.1, 0.2, 0.8, 0.9]]),
    });

    const held = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 16,
      candidateForcingSlots: makeModeSlots([]),
      structuralMetrics: makeModalFieldContinuityStructuralMetrics({
        modalResponseEnergy: 0.42,
        modalResponseSourceCoupledEnergy: 0.34,
        modalResponseResonantEnergy: 0.08,
        modalResponseRenderEnergy: 0,
        modalResponseRenderSourceCoupledEnergy: 0,
        modalResponseRenderResonantEnergy: 0,
        currentSignalEnergy: 0.36,
        currentSignalAmplitude: 0.34,
        excitedModeCount: 0,
        observedModalModeCount: 0,
      }),
    });

    expect(bootstrapped.renderAuthority).toBe(true);
    expect(held.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(held.energyLedger.sourceBoundaryState).toBe("live");
    expect(held.renderAuthority).toBe(true);
    expect(held.energyLedger.projectedRenderEnergy).toBeGreaterThan(
      DEFAULT_RENDER_ENERGY_EPSILON,
    );
    expect(readModeKeys(held.modalFieldSlots)).toEqual(["9:3:1"]);
    expect(held.modalFieldContinuity.releasingModeKeys).toEqual(["9:3:1"]);
    expect(sumSlotAmplitudes(held.modalFieldSlots)).toBeGreaterThan(0.3);
    expect(sumSlotAmplitudes(held.modalFieldSlots)).toBeLessThan(
      sumSlotAmplitudes(bootstrapped.modalFieldSlots),
    );
  });

  it("does not keep low-Q background bass active from observer authority alone", () => {
    const originalSourceCoupledSlots = makeModeSlots([
      [1, 1, 1, 0.0006],
      [2, 1, 1, 0.0004],
    ]);
    const frame = buildManualLowQSourceCoupledFrame({
      candidateForcingSlots: originalSourceCoupledSlots,
    });

    expect(frame.fieldState).toBe("idle");
    expect(frame.debug.lowQSourceCoupledVisibilityAuthority).toBe(0);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBe(0);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(frame.debug.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(countActiveSlots(frame.modalFieldSlots)).toBe(0);
    expect(
      findModeAmplitude(frame.modalFieldSlots, [1, 1, 1]),
    ).toBeLessThanOrEqual(
      findModeAmplitude(originalSourceCoupledSlots, [1, 1, 1]),
    );
  });

  it("keeps strong low-Q bass within existing candidate slot energy", () => {
    const originalSourceCoupledSlots = makeModeSlots([
      [1, 1, 1, 0.04],
      [1, 1, 2, 0.032],
      [2, 1, 1, 0.02],
    ]);
    const originalTotal = sumSlotAmplitudes(originalSourceCoupledSlots);
    const frame = buildManualLowQSourceCoupledFrame({
      avgAmplitude: 28,
      rms: 0.16,
      fftMagnitudes: makeFft([
        [55, 0.68],
        [110, 0.42],
        [165, 0.25],
      ]),
      timeData: makeMixedTimeData({
        partials: [
          [55, 0.8],
          [110, 0.42],
          [165, 0.2],
        ],
        amplitudeScale: 0.18,
      }),
      candidateForcingSlots: originalSourceCoupledSlots,
      structuralMetrics: makeLowQSourceCoupledStructuralMetrics({
        modeCoherence: 0.82,
        lowQSourceCoupledModeCount: 4,
        lowQSourceCoupledEnergy: 0.78,
        lowQObservedDrive: 0.42,
        lowQObservedSnr: 0.45,
        lowQObservedCoherence: 0.9,
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.debug.lowQSourceCoupledVisibilityAuthority).toBeGreaterThan(
      0.7,
    );
    expect(frame.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(countActiveSlots(frame.modalFieldSlots)).toBeGreaterThan(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeLessThanOrEqual(
      originalTotal + 1e-6,
    );
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.08);
  });

  it("rejects low-Q backbone visibility for silence and weak incoherent noise", () => {
    const silent = buildManualLowQSourceCoupledFrame({
      avgAmplitude: 0,
      rms: 0,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: new Float32Array(FFT_SIZE),
      structuralMetrics: makeLowQSourceCoupledStructuralMetrics({
        modalResponseEnergy: 0,
        modalResponseSourceCoupledEnergy: 0,
        modalResponseModeCount: 0,
        lowQObservedDrive: 0,
      }),
    });
    const weakNoise = buildManualLowQSourceCoupledFrame({
      avgAmplitude: 7,
      rms: 0.014,
      fftMagnitudes: makeFft([
        [80, 0.035],
        [260, 0.04],
        [730, 0.035],
        [1300, 0.04],
        [2200, 0.035],
      ]),
      timeData: new Float32Array(FFT_SIZE),
      structuralMetrics: makeLowQSourceCoupledStructuralMetrics({
        modalResponseEnergy: 0,
        modalResponseSourceCoupledEnergy: 0,
        modalResponseModeCount: 0,
        lowQSourceCoupledEnergy: 0.04,
        lowQObservedDrive: 0.04,
        lowQObservedSnr: 0.02,
        lowQObservedCoherence: 0.11,
        modeCoherence: 0.1,
        distributedExcitation: 0.74,
      }),
    });

    expect(silent.fieldState).toBe("idle");
    expect(countActiveSlots(silent.modalFieldSlots)).toBe(0);
    expect(silent.renderAuthority).toBe(false);
    expect(silent.debug.lowQSourceCoupledVisibilityRejected).toBe(true);
    expect(weakNoise.fieldState).toBe("idle");
    expect(countActiveSlots(weakNoise.modalFieldSlots)).toBe(0);
    expect(weakNoise.renderAuthority).toBe(false);
    expect(weakNoise.debug.lowQSourceCoupledVisibilityRejected).toBe(true);
    expect(weakNoise.modalVisibilityRetainedHighQEnergy).toBe(0);
  });

  it("does not let weak cross-input low-Q observer authority create slots", () => {
    const scenarios = [
      {
        sourceMode: "file",
        status: makeActiveStatus(),
      },
      {
        sourceMode: "live",
        status: makeSystemStatus(),
      },
      {
        sourceMode: "live",
        status: makeResolvedLineFeedLiveStatus(),
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      },
    ];
    const frames = scenarios.map((scenario) =>
      buildManualLowQSourceCoupledFrame(scenario),
    );
    for (const frame of frames) {
      expect(
        frame.debug.lowQSourceCoupledVisibilityAuthority,
      ).toBeGreaterThanOrEqual(0);
      expect(frame.modalVisibilityRetainedHighQEnergy).toBe(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeLessThanOrEqual(
        0.001001,
      );
    }
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

  it("drops zero-input retained modal energy from field liveness while mic stays active", () => {
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
    expect(silence.fieldState).toBe("idle");
    expect(silence.energyLedger.sourceBoundaryState).toBe("muted");
    expect(silence.energyLedger.storedModalEnergy).toBeGreaterThan(0);
    expect(silence.energyLedger.projectedRenderEnergy).toBe(0);
    expectClosedSourceRenderFrame(silence);
    expect(silence.renderAuthority).toBe(false);
    expect(silence.hasModalField).toBe(false);
    expect(silence.observationEnergy).toBe(0);
    expect(silence.debug.observationEnergy).toBe(0);
    expect(silence.modalResponseRenderEnergy).toBe(0);
    expect(silence.debug.modalResponseEnergy).toBeGreaterThan(0);
    expect(silence.activeModalFieldModeCount).toBe(0);
    expect(silence.activeModeCount).toBe(0);
    expect(sumSlotAmplitudes(silence.modalFieldSlots)).toBe(0);
    expect(countAuthoritativePhaseSlots(silence.modalFieldPhaseSlots)).toBe(0);
  });

  it("cuts render authority after paused line-feed residual meter floor", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus({
      audioInputMode: "system",
      analysisSource: "live",
    });
    let frame = null;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      frame = buildLiveInputFrame({
        featureState,
        peaks: [
          [550, 0.95],
          [1100, 0.52],
        ],
        avgAmplitude: 24,
        rms: 0.16,
        frameTimeMs: frameIndex * 33,
        acousticIntent: "ambient",
        status,
        timeData: makeTimeData({ frequency: 550 }),
      });
    }

    expect(frame.renderAuthority).toBe(true);
    expect(frame.modalResponseRenderEnergy).toBeGreaterThan(0);

    for (let frameIndex = 10; frameIndex < 52; frameIndex += 1) {
      frame = buildLiveInputFrame({
        featureState,
        peaks: [],
        avgAmplitude: 1.2,
        rms: 0.0068,
        frameTimeMs: frameIndex * 33,
        acousticIntent: "ambient",
        status,
        timeData: new Float32Array(FFT_SIZE),
      });
    }

    expect(frame.debug.modalResponseInputEnergy).toBe(0);
    expect(frame.modalResponseCurrentRenderSourceEvidence).toBe(false);
    expect(frame.energyLedger.sourceEnergy).toBe(0);
    expect(frame.energyLedger.sourceBoundaryState).toBe("muted");
    expect(frame.energyLedger.storedModalEnergy).toBeGreaterThan(0);
    expect(frame.energyLedger.projectedRenderEnergy).toBe(0);
    expectClosedSourceRenderFrame(frame);
    expect(frame.renderAuthority).toBe(false);
    expect(frame.fieldState).toBe("idle");
    expect(frame.hasModalField).toBe(false);
    expect(frame.modalResponseRenderEnergy).toBe(0);
    expect(frame.observationEnergy).toBe(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
    expect(countAuthoritativePhaseSlots(frame.modalFieldPhaseSlots)).toBe(0);
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
    expect(frame.debug.sourceCoupledModeCount).toBeGreaterThan(0);
    expect(frame.debug.resonantModeCount).toBeGreaterThan(0);
    expect(frame.debug.modeSlotCount).toBeGreaterThan(0);
    expect(frame.modalFieldSlots.some((value) => value !== 0)).toBe(true);
    expect(frame.modalFieldSlots.some((value) => value !== 0)).toBe(true);
  });

  it("surfaces detail shift diagnostics in the frame debug summary", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 70,
        fftMagnitudes: makeFft([[330, 0.95]]),
        rms: 0.3,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const candidateForcingSlotsSource = makeSingleModeSlot([1, 1, 1, 1]);
    const candidateResponseSlotsSource = makeSingleModeSlot([9, 9, 9, 0.5]);
    const structuralState = {
      candidateForcingSlotsSource,
      candidateResponseSlotsSource,
      referenceSourceCoupledSlotsSource: candidateForcingSlotsSource,
      referenceResonantSlotsSource: candidateResponseSlotsSource,
      proposalSourceCoupledSlotsSource: candidateForcingSlotsSource,
      proposalResonantSlotsSource: candidateResponseSlotsSource,
      proposalReferenceSourceCoupledSlotsSource: candidateForcingSlotsSource,
      proposalReferenceResonantSlotsSource: candidateResponseSlotsSource,
      activeSourceCoupledModeCount: 1,
      activeResonantModeCount: 1,
      activeModeCount: 2,
      dominantFrequency: 330,
      dominantAmplitude: 0.95,
      analysisEngine: "modal-excitation",
      pitchSource: "resonator-bank",
      spectralCandidates: [],
      sourceMode: "file",
      structuralMetrics: {
        resonantSignalAuthoritative: true,
        resonantSignalAuthoritativeReason: "fresh-signal",
        resonantShiftReleaseOverrideCount: 2,
        resonantShiftTrackingOverrideCount: 3,
      },
    };
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const frame = composeAudioFeatureFrame({
      preparedInputs,
      analysisResult,
    });

    expect(frame.debug.resonantSignalAuthoritative).toBe(true);
    expect(frame.debug.resonantSignalAuthoritativeReason).toBe("fresh-signal");
    expect(frame.debug.resonantShiftReleaseOverrideCount).toBe(2);
    expect(frame.debug.resonantShiftTrackingOverrideCount).toBe(3);
  });

  it("does not apply a second detail-layer weight after admission", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
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
    const fastSignalState = {
      ...updateAudioFeatureFastSignalState(preparedInputs),
      trebleTonalEnergy: 0.2,
      beatLowBandEnergy: 0.12,
    };
    const candidateForcingSlotsSource = makeSingleModeSlot([1, 1, 1, 1]);
    const candidateResponseSlotsSource = makeSingleModeSlot([9, 9, 9, 1]);
    const structuralState = {
      candidateForcingSlotsSource,
      candidateResponseSlotsSource,
      referenceSourceCoupledSlotsSource: candidateForcingSlotsSource,
      referenceResonantSlotsSource: candidateResponseSlotsSource,
      proposalSourceCoupledSlotsSource: candidateForcingSlotsSource,
      proposalResonantSlotsSource: candidateResponseSlotsSource,
      proposalReferenceSourceCoupledSlotsSource: candidateForcingSlotsSource,
      proposalReferenceResonantSlotsSource: candidateResponseSlotsSource,
      activeSourceCoupledModeCount: 1,
      activeResonantModeCount: 1,
      activeModeCount: 2,
      dominantFrequency: 330,
      dominantAmplitude: 0.95,
      analysisEngine: "spectral-fallback",
      pitchSource: "spectral",
      spectralCandidates: [],
      sourceMode: "file",
      structuralMetrics: {
        modeCoherence: 0.5,
      },
    };

    const result = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });

    expect(findModeAmplitude(result.modeSlots, [1, 1, 1])).toBeCloseTo(1, 6);
    const admittedResonantCoefficient = findModeAmplitude(
      result.candidateResponseSlots,
      [9, 9, 9],
    );
    expect(findModeAmplitude(result.modeSlots, [9, 9, 9])).toBeCloseTo(
      admittedResonantCoefficient,
      6,
    );
    expect(findModeAmplitude(result.signalModeSlots, [9, 9, 9])).toBeCloseTo(
      admittedResonantCoefficient,
      6,
    );
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

    const firstSourceCoupled = readModeKeys(first.modalFieldSlots);
    const secondSourceCoupled = readModeKeys(second.modalFieldSlots);
    expect(second.debug.spectralCandidates[0]?.frequency).not.toBeCloseTo(
      first.debug.spectralCandidates[0]?.frequency ?? 0,
    );
    expect(second.debug.resonantModeCount).toBeGreaterThan(0);
    expect(
      secondSourceCoupled.some((key) => firstSourceCoupled.includes(key)),
    ).toBe(true);
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
    // Run several warmup frames so modal-field continuity can settle before
    // this budget assertion reads the published descriptor.
    for (let i = 0; i < AUDIO_SLOT_CAPACITY / 2; i += 1) {
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

    expect(frame.modalFieldSlots).toHaveLength(AUDIO_SLOT_CAPACITY * 4);
    expect(frame.modalFieldSlots).toHaveLength(AUDIO_SLOT_CAPACITY * 4);
    expect(frame.modalFieldSlots).toHaveLength(AUDIO_SLOT_CAPACITY * 4);
    expect(frame.debug.sourceCoupledModeCount).toBeLessThanOrEqual(
      AUDIO_SLOT_CAPACITY,
    );
    expect(frame.debug.resonantModeCount).toBeLessThanOrEqual(
      AUDIO_SLOT_CAPACITY,
    );
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

  it("detects sparse sub-bass pulses under brighter upper partials", () => {
    const featureState = createAudioFeatureState();
    const upperBed = [
      [880, 0.46],
      [1760, 0.32],
      [3520, 0.18],
    ];

    buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([[48, 0.08], [96, 0.045], ...upperBed]),
      avgAmplitude: 24,
      rms: 0.09,
      frameTimeMs: 0,
    });
    const beat = buildTimedFrame({
      featureState,
      fftMagnitudes: makeFft([[48, 0.42], [96, 0.22], ...upperBed]),
      avgAmplitude: 38,
      rms: 0.18,
      frameTimeMs: 260,
    });

    expect(beat.debug.beatLowBandEnergy).toBeGreaterThan(0.05);
    expect(beat.debug.beatOnsetDriver).toBeGreaterThan(
      beat.debug.beatThreshold,
    );
    expect(beat.beatDetected).toBe(true);
    expect(beat.beatPulseId).toBe(1);
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
    const capturedSourceCoupled = Array.from(frozen.modalFieldSlots);
    const capturedResonant = Array.from(frozen.modalFieldSlots);

    const held = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: new Float32Array(BIN_COUNT),
      }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });

    expect(Array.from(held.modalFieldSlots)).toEqual(capturedSourceCoupled);
    expect(Array.from(held.modalFieldSlots)).toEqual(capturedResonant);
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
    expect(frame.renderAuthority).toBe(true);
    expect(frame.debug.analysisEngine).toBe("modal-excitation");
    expect(frame.debug.pitchSource).toBe("resonator-bank");
    expect(frame.debug.sourceCoupledModeCount).toBeGreaterThan(0);
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
      frame.modalFieldSlots.some(
        (_, index) => index % 4 === 3 && frame.modalFieldSlots[index] > 0,
      ),
    ).toBe(true);
    expect(
      frame.modalFieldSlots.some(
        (_, index) => index % 4 === 3 && frame.modalFieldSlots[index] > 0,
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
    expect(frame.debug.sourceCoupledModeCount).toBeGreaterThan(0);
    expect(frame.debug.currentModeSlots).toBeUndefined();
    expect(frame.debug.modalFieldSlots).toBeUndefined();
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
    expect(frame.debug.modalFieldSlots).toBeInstanceOf(Array);
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

    expect(frame.modalFieldColorSlots.some((value) => value > 0)).toBe(true);
    expect(frame.modalFieldColorSlots.some((value) => value > 0)).toBe(true);
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

  it("publishes normalized Spectral lane buffers beside modal color debug projections", () => {
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
    const laneA = frame.modalFieldSpectralLaneA;
    const laneB = frame.modalFieldSpectralLaneB;
    const meta = frame.modalFieldSpectralMeta;
    const firstEnergyOffset = Array.from(meta).findIndex(
      (value, index) => index % 4 === 3 && value > 0,
    );
    const offset = firstEnergyOffset - 3;

    expect(laneA).toBeInstanceOf(Float32Array);
    expect(laneB).toBeInstanceOf(Float32Array);
    expect(meta).toBeInstanceOf(Float32Array);
    expect(laneA.length).toBe(frame.modalFieldColorSlots.length);
    expect(laneB.length).toBe(frame.modalFieldColorSlots.length);
    expect(meta.length).toBe(frame.modalFieldColorSlots.length);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(meta[offset]).toBeGreaterThanOrEqual(0);
    expect(meta[offset]).toBeLessThan(1);
    expect(meta[offset + 1]).toBeGreaterThan(0);
    expect(meta[offset + 2]).toBeGreaterThan(0);
    expect(meta[offset + 3]).toBeGreaterThan(0);
    expect(
      laneA[offset] +
        laneA[offset + 1] +
        laneA[offset + 2] +
        laneA[offset + 3] +
        laneB[offset] +
        laneB[offset + 1] +
        laneB[offset + 2] +
        laneB[offset + 3],
    ).toBeCloseTo(1, 5);
  });

  it("preserves multiple Spectral color families through the render-facing modal slots", () => {
    const featureState = createAudioFeatureState();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          fftMagnitudes: makeFft([
            [220, 0.95],
            [330, 0.82],
            [528, 0.74],
            [660, 0.58],
            [880, 0.46],
          ]),
          timeData: makeMixedTimeData({
            partials: [
              [220, 0.95],
              [330, 0.82],
              [528, 0.74],
              [660, 0.58],
              [880, 0.46],
            ],
            amplitudeScale: 0.72,
          }),
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: frameIndex * 33,
      });
    }

    const colors = collectWeightedColorSlotTriples(frame.modalFieldColorSlots);

    expect(colors.length).toBeGreaterThanOrEqual(2);
    expect(maxColorDistance(colors)).toBeGreaterThan(0.28);
  });

  it("keeps injected tones distributed across modal Spectral colors", () => {
    for (const testToneHz of [220, 440, 528]) {
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

      const colors = collectWeightedColorSlotTriples(
        frame.modalFieldColorSlots,
      );
      const color = averageWeightedColorSlots(frame.modalFieldColorSlots);

      expect(colors.length).toBeGreaterThanOrEqual(3);
      expect(maxColorDistance(colors)).toBeGreaterThan(0.25);
      expect(color.weight).toBeGreaterThan(0.5);
    }
  });

  it("does not let injected tone frequency collapse modal colors", () => {
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
          testToneHz: 528,
          testToneAmplitude: 0.5,
        }),
        frameTimeMs: frameIndex * 33,
      });
    }

    const colors = collectWeightedColorSlotTriples(frame.modalFieldColorSlots);

    expect(colors.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(colors.map(({ r, g, b }) => `${r}:${g}:${b}`)).size,
    ).toBeGreaterThan(1);
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

    expect(frame.modalFieldColorSlots.some((value) => value > 0)).toBe(false);
    expect(frame.modalFieldColorSlots.some((value) => value > 0)).toBe(false);
    expect(frame.debug.spectralLightComponents.length).toBeGreaterThan(0);
  });

  it("keeps modal physics invariant when Spectral Light output is disabled", () => {
    const createFrame = (includeSpectralLight) =>
      buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          fftMagnitudes: makeFft([
            [220, 0.95],
            [440, 0.72],
            [660, 0.44],
            [880, 0.28],
          ]),
        }),
        featureState: createAudioFeatureState(),
        radius: 3,
        status: makeActiveStatus(),
        includeSpectralLight,
      });

    const spectralFrame = createFrame(true);
    const staticFrame = createFrame(false);

    expect(staticFrame.fieldState).toBe(spectralFrame.fieldState);
    expect(staticFrame.activeModalFieldModeCount).toBe(
      spectralFrame.activeModalFieldModeCount,
    );
    expect(staticFrame.activeModalFieldModeCount).toBe(
      spectralFrame.activeModalFieldModeCount,
    );
    expect(Array.from(staticFrame.modalFieldSlots)).toEqual(
      Array.from(spectralFrame.modalFieldSlots),
    );
    expect(Array.from(staticFrame.modalFieldSlots)).toEqual(
      Array.from(spectralFrame.modalFieldSlots),
    );
    expect(Array.from(staticFrame.modalFieldSlots)).toEqual(
      Array.from(spectralFrame.modalFieldSlots),
    );
    expect(spectralFrame.modalFieldColorSlots.some((value) => value > 0)).toBe(
      true,
    );
    expect(staticFrame.modalFieldColorSlots.some((value) => value > 0)).toBe(
      false,
    );
    expect(spectralFrame.spectralLightRequested).toBe(true);
    expect(staticFrame.spectralLightRequested).toBe(false);
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

    expect(Array.from(second.modalFieldSlots)).toEqual(
      Array.from(first.modalFieldSlots),
    );
    expect(Array.from(second.modalFieldColorSlots)).toEqual(
      Array.from(first.modalFieldColorSlots),
    );
    expect(Array.from(second.modalFieldColorSlots)).toEqual(
      Array.from(first.modalFieldColorSlots),
    );
  });

  it("ignores retired analysis hints without changing the frame contract", () => {
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
    });

    expect(frame.modalFieldSlots).toBeInstanceOf(Float32Array);
    expect(frame.modalFieldSlots).toBeInstanceOf(Float32Array);
    expect(frame.debug.workerState).toBe("none");
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
    const firstResonantAmplitudes = readModeAmplitudeMap(first.modalFieldSlots);

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
    });

    let retainedResonantAmplitude = 0;
    const secondResonantAmplitudes = readModeAmplitudeMap(
      second.modalFieldSlots,
    );
    for (const [key] of firstResonantAmplitudes.entries()) {
      retainedResonantAmplitude += secondResonantAmplitudes.get(key) ?? 0;
    }

    const initialResonantAmplitude = Array.from(
      firstResonantAmplitudes.values(),
    ).reduce((sum, value) => sum + value, 0);
    expect(retainedResonantAmplitude).toBeLessThanOrEqual(
      initialResonantAmplitude * 3,
    );
    expect(second.debug.resonantSignalAuthoritative).toBe(true);
  });

  it("does not let active analysis hints change visible frame signals", () => {
    const fftMagnitudes = makeFft([
      [220, 0.7],
      [440, 0.38],
      [660, 0.18],
    ]);
    const baseFrame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 34,
        fftMagnitudes,
        rms: 0.18,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });
    const comparisonFrame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 34,
        fftMagnitudes,
        rms: 0.18,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });

    expect(comparisonFrame.structureSignal).toBeCloseTo(
      baseFrame.structureSignal,
      6,
    );
    expect(comparisonFrame.energySignal).toBeCloseTo(baseFrame.energySignal, 6);
    expect(comparisonFrame.changeSignal).toBeCloseTo(baseFrame.changeSignal, 6);
    expect(comparisonFrame.pulseSignal).toBeCloseTo(baseFrame.pulseSignal, 6);
    expect(comparisonFrame.modalVisibilityEnergy).toBeCloseTo(
      baseFrame.modalVisibilityEnergy,
      6,
    );
    expect(comparisonFrame.bassSalience).toBeCloseTo(baseFrame.bassSalience, 6);
    expect(comparisonFrame.bassSalience).not.toBe(1);
    expect(comparisonFrame.timbreSpread).toBeCloseTo(baseFrame.timbreSpread, 6);
    expect(comparisonFrame.spectralNovelty).toBeCloseTo(
      baseFrame.spectralNovelty,
      6,
    );
    expect(comparisonFrame).not.toHaveProperty("harmonicity");
    expect(comparisonFrame).not.toHaveProperty("textureSpread");
    expect(comparisonFrame).not.toHaveProperty("novelty");
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
  let lineFeedProgramFeatureState = null;

  beforeEach(() => {
    lineFeedProgramFeatureState = null;
  });

  function resolveLiveInputNoiseGateFeatureState(options = {}) {
    const status = options.status ?? {};
    if (options.featureState) {
      return options.featureState;
    }

    const inputMode = status.audioInputMode ?? "idle";
    const isLineFeed =
      inputMode === "system" ||
      (inputMode === "live" &&
        (status.resolvedLiveInputAnalysisClass === "line-feed" ||
          status.liveInputDeviceKind === "system"));

    if (!isLineFeed) {
      return createAudioFeatureState(status.capacity ?? AUDIO_SLOT_CAPACITY);
    }

    if (!lineFeedProgramFeatureState) {
      lineFeedProgramFeatureState = createAudioFeatureState(
        status.capacity ?? AUDIO_SLOT_CAPACITY,
      );
    }

    return lineFeedProgramFeatureState;
  }

  function buildAudioFeatureFrame(options) {
    return buildAudioFeatureFrameBase({
      ...options,
      featureState: resolveLiveInputNoiseGateFeatureState(options),
    });
  }

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

  it("does not use vocal intent as a hard gate for modest resonant audio", () => {
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
    ).toBe(false);
  });

  it("opens vocal mic input for modest coherent audio after calibration", () => {
    const featureState = createAudioFeatureState();
    calibrateLiveInput(featureState, {
      acousticIntent: "vocal",
      peaks: [
        [90, 0.025],
        [180, 0.018],
      ],
      avgAmplitude: 0.8,
      rms: 0.0016,
    });

    const frame = buildLiveInputFrame({
      featureState,
      acousticIntent: "vocal",
      peaks: [
        [120, 0.18],
        [240, 0.15],
        [360, 0.12],
      ],
      avgAmplitude: 4.5,
      rms: 0.015,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      timeData: makeTimeData({
        frequency: 120,
        amplitude: 0.035,
        harmonics: [
          [2, 0.018],
          [3, 0.011],
        ],
      }),
    });

    expect(frame.debug.liveInputHardSilenceActive).toBe(false);
    expect(frame.debug.liveInputNoiseGateActive).toBe(false);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.01);
  });

  it("holds ambient mic resonance through quiet coherent tails", () => {
    const featureState = createAudioFeatureState();
    calibrateLiveInput(featureState, {
      acousticIntent: "ambient",
      peaks: [
        [90, 0.025],
        [180, 0.018],
      ],
      avgAmplitude: 0.8,
      rms: 0.0016,
    });

    const strikePeaks = [
      [220, 0.18],
      [440, 0.11],
      [660, 0.068],
      [880, 0.045],
    ];
    buildLiveInputFrame({
      featureState,
      acousticIntent: "ambient",
      peaks: strikePeaks,
      avgAmplitude: 4.8,
      rms: 0.017,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      timeData: makeTimeData({
        frequency: 220,
        amplitude: 0.05,
        harmonics: [
          [2, 0.024],
          [3, 0.011],
        ],
      }),
    });

    let frame = null;
    for (let index = 0; index < 7; index += 1) {
      const scale = 1 - index * 0.055;
      frame = buildLiveInputFrame({
        featureState,
        acousticIntent: "ambient",
        peaks: [
          [220, 0.052 * scale],
          [440, 0.032 * scale],
          [660, 0.02 * scale],
          [880, 0.013 * scale],
        ],
        avgAmplitude: 1.05,
        rms: 0.0008,
        frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS + index * 33,
        timeData: makeTimeData({
          frequency: 220,
          amplitude: 0.016 * scale,
          harmonics: [
            [2, 0.0075 * scale],
            [3, 0.0035 * scale],
          ],
        }),
      });

      expect(frame.debug.liveInputHardSilenceActive).toBe(false);
      expect(frame.debug.liveInputNoiseGateActive).toBe(false);
    }

    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.01);

    const silence = buildLiveInputFrame({
      featureState,
      acousticIntent: "ambient",
      peaks: [],
      avgAmplitude: 0,
      rms: 0,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS + 7 * 33,
    });

    expect(silence.debug.liveInputNoiseGateActive).toBe(true);
    expect(silence.debug.liveInputHardSilenceActive).toBe(true);
  });

  it("keeps weak ambient mic noise and low hum gated", () => {
    const featureState = createAudioFeatureState();
    calibrateLiveInput(featureState, {
      acousticIntent: "ambient",
      peaks: [
        [90, 0.025],
        [180, 0.018],
      ],
      avgAmplitude: 0.8,
      rms: 0.0016,
    });

    const lowHum = buildLiveInputFrame({
      featureState,
      acousticIntent: "ambient",
      peaks: [[60, 0.052]],
      avgAmplitude: 1.05,
      rms: 0.0008,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_MS,
      timeData: makeTimeData({
        frequency: 60,
        amplitude: 0.012,
      }),
    });
    const weakBroadband = buildLiveInputFrame({
      featureState,
      acousticIntent: "ambient",
      peaks: [
        [360, 0.028],
        [940, 0.025],
        [1800, 0.023],
        [3600, 0.02],
      ],
      avgAmplitude: 1.05,
      rms: 0.0008,
      frameTimeMs: LIVE_INPUT_POST_CALIBRATION_NEXT_MS,
    });

    expect(lowHum.debug.liveInputNoiseGateActive).toBe(true);
    expect(weakBroadband.debug.liveInputNoiseGateActive).toBe(true);
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
    expect(Array.from(systemFrame.modalFieldSlots)).toEqual(
      Array.from(fileFrame.modalFieldSlots),
    );
    expect(Array.from(systemFrame.modalFieldSlots)).toEqual(
      Array.from(fileFrame.modalFieldSlots),
    );
    expect(Array.from(systemFrame.modalFieldSlots)).toEqual(
      Array.from(fileFrame.modalFieldSlots),
    );
  });

  it("keeps program-audio render signals equivalent between file and system paths", () => {
    const cases = [
      {
        label: "moderate",
        avgAmplitude: 36,
        rms: 0.27,
        peaks: [
          [110, 0.82],
          [220, 0.41],
          [330, 0.22],
          [440, 0.17],
        ],
        timeData: makeTimeData({ frequency: 110, amplitude: 0.27 }),
      },
      {
        label: "quiet",
        avgAmplitude: 0.1844,
        rms: 0.005,
        peaks: [
          [196, 0.018],
          [282, 0.012],
        ],
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.018],
            [282, 0.012],
          ],
          amplitudeScale: 0.005,
        }),
      },
    ];

    for (const { label, avgAmplitude, rms, peaks, timeData } of cases) {
      const analysisSnapshot = createSnapshot({
        sourceMode: "file",
        avgAmplitude,
        rms,
        fftMagnitudes: makeFft(peaks),
        timeData,
      });
      const fileFrame = buildAudioFeatureFrame({
        analysisSnapshot,
        featureState: createAudioFeatureState(),
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: 32,
      });
      const systemFrame = buildAudioFeatureFrame({
        analysisSnapshot: {
          ...analysisSnapshot,
          sourceMode: "system",
        },
        featureState: createAudioFeatureState(),
        radius: 3,
        status: makeSystemStatus(),
        frameTimeMs: 32,
      });

      expect(systemFrame.debug.sourceNormalization, label).toEqual(
        fileFrame.debug.sourceNormalization,
      );
      expect(systemFrame.structureSignal, label).toBeCloseTo(
        fileFrame.structureSignal,
        6,
      );
      expect(systemFrame.energySignal, label).toBeCloseTo(
        fileFrame.energySignal,
        6,
      );
      expect(systemFrame.changeSignal, label).toBeCloseTo(
        fileFrame.changeSignal,
        6,
      );
      expect(systemFrame.pulseSignal, label).toBeCloseTo(
        fileFrame.pulseSignal,
        6,
      );
    }
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
    expect(frame.debug.modalPersistence).toBeGreaterThan(0.08);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.12);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0.03);
    expect(frame.debug.modalVisibilitySlotEnergy).toBeGreaterThan(0.035);
    expect(frame.debug.modalVisibilityActiveModeCount).toBeGreaterThan(0);
    expect(frame.debug.modalVisibilityDriveEnergy).toBe(
      frame.debug.modalDriveEnergy,
    );
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.025);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
  });

  it("keeps line-feed bowl tails visually eligible between repeated strikes", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    const tailFrames = [];

    for (let frameIndex = 0; frameIndex < 74; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const tailScale = Math.max(
        0.0065,
        Math.exp(-(frameIndex - 2) / 18) * 0.22,
      );
      const scale = isStrike ? 1 : tailScale;
      const partials = scalePartials(RESONANT_STRIKE_PARTIALS, scale);
      const frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 38 : 1.24,
          fftMagnitudes: makeFft(partials),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: isStrike ? 1 : tailScale,
          }),
          rms: isStrike ? 0.28 : 0.0048,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });

      if (frameIndex >= 58) {
        tailFrames.push({
          modalVisibilityEnergy: frame.modalVisibilityEnergy,
          resonantAmplitude: sumSlotAmplitudes(frame.modalFieldSlots),
          fieldState: frame.fieldState,
        });
      }
    }

    expect(tailFrames.every(({ fieldState }) => fieldState === "active")).toBe(
      true,
    );
    expect(
      Math.min(...tailFrames.map(({ resonantAmplitude }) => resonantAmplitude)),
    ).toBeGreaterThan(0.006);
    expect(
      Math.min(
        ...tailFrames.map(({ modalVisibilityEnergy }) => modalVisibilityEnergy),
      ),
    ).toBeGreaterThan(0.08);
  });

  it("keeps meter-loud inharmonic line-feed bowl sustain visibly structured", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    const samples = new Map();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 42 : 16,
          fftMagnitudes: makeFft(isStrike ? partials : []),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: isStrike ? 1 : 0.28,
          }),
          rms: isStrike ? 0.32 : 0.075,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });

      if ([12, 120, 239].includes(frameIndex)) {
        samples.set(frameIndex, {
          resonantAmplitude: sumSlotAmplitudes(frame.modalFieldSlots),
          modalVisibilityEnergy: frame.modalVisibilityEnergy,
          modalVisibilityRetainedHighQEnergy:
            frame.modalVisibilityRetainedHighQEnergy,
          activeModalFieldModeCount: frame.activeModalFieldModeCount,
          structureSignal: frame.structureSignal,
          highQResonantModeCount: frame.debug.highQResonantModeCount,
          highQResonantEnergy: frame.debug.highQResonantEnergy,
          highQRingSupport: frame.debug.highQRingSupport,
        });
      }
    }

    const open = samples.get(12);
    const mid = samples.get(120);
    const late = samples.get(239);

    expect(frame.fieldState).toBe("active");
    expect(late.activeModalFieldModeCount).toBeGreaterThanOrEqual(4);
    expect(late.highQResonantModeCount).toBeGreaterThanOrEqual(4);
    expect(late.highQResonantEnergy).toBeGreaterThan(0.035);
    expect(late.highQRingSupport).toBeGreaterThan(0.5);
    expect(late.resonantAmplitude).toBeGreaterThan(
      open.resonantAmplitude * 0.35,
    );
    expect(late.modalVisibilityEnergy).toBeGreaterThan(0.3);
    expect(late.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0.12);
    expect(late.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(
      mid.modalVisibilityRetainedHighQEnergy * 0.75,
    );
    expect(late.modalVisibilityEnergy).toBeGreaterThan(
      open.modalVisibilityEnergy * 0.8,
    );
    expect(mid.structureSignal).toBeGreaterThan(0);
    expect(late.structureSignal).toBeGreaterThan(0);
  });

  it("keeps lower-level periodic bowl ring visible after the opening sustain", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 360; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 42 : 5.2,
          fftMagnitudes: makeFft(isStrike ? partials : []),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: isStrike ? 1 : 0.11,
          }),
          rms: isStrike ? 0.32 : 0.022,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });
    }

    expect(frame.fieldState).toBe("active");
    expect(frame.energyLedger.renderAuthority).toBe(true);
    expect(frame.renderAuthority).toBe(true);
    expect(frame.debug.liveInputHardSilenceActive).toBe(false);
    expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(4);
    expect(frame.debug.highQRingSupport).toBeGreaterThan(0.15);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.16);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.02);
    expect(frame.activeModalFieldModeCount).toBeGreaterThanOrEqual(4);
  });

  it("keeps lower-level periodic bowl sound-file ring visible after the opening sustain", () => {
    const featureState = createAudioFeatureState();
    const status = makeActiveStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 360; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "file",
          avgAmplitude: isStrike ? 42 : 5.2,
          fftMagnitudes: makeFft(isStrike ? partials : []),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: isStrike ? 1 : 0.11,
          }),
          rms: isStrike ? 0.32 : 0.022,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.fieldState).toBe("active");
    expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(4);
    expect(frame.debug.highQRingSupport).toBeGreaterThan(0.15);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.16);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.02);
    expect(frame.activeModalFieldModeCount).toBeGreaterThanOrEqual(4);
  });

  for (const scenario of [
    {
      label: "line-feed",
      sourceMode: "live",
      status: makeResolvedLineFeedLiveStatus(),
      liveInputAnalysisSettings: { acousticIntent: "ambient" },
    },
    {
      label: "file",
      sourceMode: "file",
      status: makeActiveStatus(),
      liveInputAnalysisSettings: undefined,
    },
  ]) {
    it(`keeps trace-level periodic bowl tails visible for ${scenario.label} sources`, () => {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 420; frameIndex += 1) {
        const isStrike = frameIndex < 2;
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: isStrike ? 42 : 0.18,
            fftMagnitudes: isStrike
              ? makeFft(INHARMONIC_BOWL_STRIKE_PARTIALS)
              : makeFft([
                  [196, 0.014],
                  [282, 0.009],
                ]),
            timeData: makeMixedTimeData({
              partials: isStrike
                ? INHARMONIC_BOWL_STRIKE_PARTIALS
                : LOUD_BOWL_TONE_PARTIALS,
              amplitudeScale: isStrike ? 1 : 0.006,
            }),
            rms: isStrike ? 0.32 : 0.0008,
          }),
          featureState,
          radius: 3,
          status: scenario.status,
          frameTimeMs: frameIndex * 33,
          liveInputAnalysisSettings: scenario.liveInputAnalysisSettings,
        });
      }

      expect(frame.fieldState).toBe("active");
      expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(4);
      expect(frame.debug.highQRingSupport).toBeGreaterThan(0.08);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.04);
      expect(frame.activeModalFieldModeCount).toBeGreaterThanOrEqual(4);
    });
  }

  for (const scenario of [
    {
      label: "line-feed",
      sourceMode: "live",
      status: makeResolvedLineFeedLiveStatus(),
      liveInputAnalysisSettings: { acousticIntent: "ambient" },
    },
    {
      label: "file",
      sourceMode: "file",
      status: makeActiveStatus(),
      liveInputAnalysisSettings: undefined,
    },
  ]) {
    it(`keeps observed bowl tails active from periodic waveform after FFT detail disappears for ${scenario.label} sources`, () => {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 420; frameIndex += 1) {
        const isStrike = frameIndex < 2;
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: isStrike ? 42 : 0.18,
            fftMagnitudes: isStrike
              ? makeFft(INHARMONIC_BOWL_STRIKE_PARTIALS)
              : makeFft([]),
            timeData: makeMixedTimeData({
              partials: isStrike
                ? INHARMONIC_BOWL_STRIKE_PARTIALS
                : LOUD_BOWL_TONE_PARTIALS,
              amplitudeScale: isStrike ? 1 : 0.006,
            }),
            rms: isStrike ? 0.32 : 0.0008,
          }),
          featureState,
          radius: 3,
          status: scenario.status,
          frameTimeMs: frameIndex * 33,
          liveInputAnalysisSettings: scenario.liveInputAnalysisSettings,
        });
      }

      expect(frame.fieldState).toBe("active");
      expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(4);
      expect(frame.debug.highQRingSupport).toBeGreaterThan(0.08);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.04);
    });
  }

  it("observes soft high-Q detail without a loud seed strike for line-feed and file sources", () => {
    const scenarios = [
      {
        sourceMode: "live",
        status: makeResolvedLineFeedLiveStatus(),
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      },
      {
        sourceMode: "file",
        status: makeActiveStatus(),
        liveInputAnalysisSettings: undefined,
      },
    ];
    const softHighQPartials = [
      [3206.67, 0.0012],
      [3805.39, 0.00095],
      [4528.2, 0.00072],
    ];

    for (const scenario of scenarios) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: 0.16,
            fftMagnitudes: makeFft(softHighQPartials),
            timeData: makeMixedTimeData({
              partials: softHighQPartials,
              amplitudeScale: 0.005,
            }),
            rms: 0.00072,
          }),
          featureState,
          radius: 3,
          status: scenario.status,
          frameTimeMs: frameIndex * 33,
          liveInputAnalysisSettings: scenario.liveInputAnalysisSettings,
        });
      }

      expect(frame.fieldState).toBe("active");
      expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.highQObservedDrive).toBeGreaterThan(0);
      expect(frame.debug.highQObservedCoherence).toBeGreaterThan(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.04);
    }
  });

  it("observes quiet background bowl hum without waiting for a strike", () => {
    const scenarios = [
      {
        sourceMode: "live",
        status: makeResolvedLineFeedLiveStatus(),
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      },
      {
        sourceMode: "file",
        status: makeActiveStatus(),
        liveInputAnalysisSettings: undefined,
      },
    ];
    const quietBowlHumPartials = [
      [196, 0.004],
      [282, 0.0028],
      [417, 0.002],
      [611, 0.0014],
    ];

    for (const scenario of scenarios) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: 0.055,
            fftMagnitudes: makeFft(quietBowlHumPartials),
            timeData: makeMixedTimeData({
              partials: quietBowlHumPartials,
              amplitudeScale: 0.0008,
            }),
            rms: 0.0002,
          }),
          featureState,
          radius: 3,
          status: scenario.status,
          frameTimeMs: frameIndex * 33,
          liveInputAnalysisSettings: scenario.liveInputAnalysisSettings,
        });
      }

      expect(frame.fieldState).toBe("active");
      expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.highQObservedDrive).toBeGreaterThan(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.04);
    }
  });

  it("keeps E2-range bowl fundamentals eligible for high-Q retained visibility", () => {
    const scenarios = [
      {
        sourceMode: "live",
        status: makeResolvedLineFeedLiveStatus(),
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      },
      {
        sourceMode: "file",
        status: makeActiveStatus(),
        liveInputAnalysisSettings: undefined,
      },
    ];
    const e2BowlFundamentalHz = 82.41;
    const e2BowlPartials = [
      [e2BowlFundamentalHz, 0.8],
      [e2BowlFundamentalHz * 2, 0.08],
    ];

    for (const scenario of scenarios) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: 5.2,
            fftMagnitudes: makeFft(e2BowlPartials),
            timeData: makeMixedTimeData({
              partials: e2BowlPartials,
              amplitudeScale: 0.08,
            }),
            rms: 0.018,
          }),
          featureState,
          radius: 3,
          status: scenario.status,
          frameTimeMs: frameIndex * 33,
          liveInputAnalysisSettings: scenario.liveInputAnalysisSettings,
        });
      }

      expect(frame.fieldState).toBe("active");
      expect(frame.debug.lowQSourceCoupledModeCount).toBeGreaterThan(0);
      expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.highQResonantEnergy).toBeGreaterThan(0.003);
      expect(frame.debug.resonantSignalAuthoritativeHighQ).toBe(false);
      expect(frame.debug.modalResponseEnergy).toBeGreaterThan(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0.03);
    }
  });

  it("keeps E2-range bowl retained detail breathing with the source envelope", () => {
    const featureState = createAudioFeatureState();
    const e2BowlFundamentalHz = 82.41;
    const e2BowlPartials = [
      [e2BowlFundamentalHz, 0.8],
      [e2BowlFundamentalHz * 2, 0.08],
    ];
    const samples = [];

    for (let frameIndex = 0; frameIndex < 180; frameIndex += 1) {
      const envelope = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(frameIndex * 0.11));
      const partials = scalePartials(e2BowlPartials, envelope);
      const frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: 5.2 * envelope,
          fftMagnitudes: makeFft(partials),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: 0.08 * envelope,
          }),
          rms: 0.018 * envelope,
        }),
        featureState,
        radius: 3,
        status: makeResolvedLineFeedLiveStatus(),
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });

      if (frameIndex >= 120) {
        samples.push({
          envelope,
          resonantAmplitude: sumSlotAmplitudes(frame.modalFieldSlots),
          retainedVisibility: frame.modalVisibilityRetainedHighQEnergy ?? 0,
          highQResonantEnergy: frame.debug.highQResonantEnergy ?? 0,
        });
      }
    }

    const low = samples.reduce((currentLow, sample) =>
      sample.envelope < currentLow.envelope ? sample : currentLow,
    );
    const high = samples.reduce((currentHigh, sample) =>
      sample.envelope > currentHigh.envelope ? sample : currentHigh,
    );

    expect(low.highQResonantEnergy).toBeGreaterThan(0.003);
    expect(low.retainedVisibility).toBeGreaterThan(0.03);
    expect(high.resonantAmplitude).toBeGreaterThan(
      low.resonantAmplitude * 1.02,
    );
  });

  it("seeds low-meter bowl strikes into retained tails for line-feed and file sources", () => {
    const scenarios = [
      {
        sourceMode: "live",
        status: makeResolvedLineFeedLiveStatus(),
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      },
      {
        sourceMode: "file",
        status: makeActiveStatus(),
        liveInputAnalysisSettings: undefined,
      },
    ];

    for (const scenario of scenarios) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 180; frameIndex += 1) {
        const isStrike = frameIndex < 8;
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: isStrike ? 2.2 : 0.18,
            fftMagnitudes: isStrike
              ? makeFft(scalePartials(INHARMONIC_BOWL_STRIKE_PARTIALS, 0.08))
              : makeFft([
                  [196, 0.014],
                  [282, 0.009],
                ]),
            timeData: makeMixedTimeData({
              partials: isStrike
                ? INHARMONIC_BOWL_STRIKE_PARTIALS
                : LOUD_BOWL_TONE_PARTIALS,
              amplitudeScale: isStrike ? 1 : 0.006,
            }),
            rms: isStrike ? 0.006 : 0.0008,
          }),
          featureState,
          radius: 3,
          status: scenario.status,
          frameTimeMs: frameIndex * 33,
          liveInputAnalysisSettings: scenario.liveInputAnalysisSettings,
        });
      }

      expect(frame.fieldState).toBe("active");
      expect(frame.debug.highQResonantModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.highQRingSupport).toBeGreaterThan(0.08);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.04);
      expect(frame.activeModalFieldModeCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps line-feed coherent ringing visible below raw meter silence", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 68; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const tailScale =
        frameIndex < 44
          ? Math.max(0.0065, Math.exp(-(frameIndex - 2) / 18) * 0.22)
          : 0.0027;
      const scale = isStrike ? 1 : tailScale;
      const partials = scalePartials(RESONANT_STRIKE_PARTIALS, scale);
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 38 : 0.72,
          fftMagnitudes: makeFft(partials),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: scale,
          }),
          rms: isStrike ? 0.28 : 0.0032,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });
    }

    expect(frame.fieldState).toBe("active");
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.04);
  });

  it("drops line-feed source-boundary residue from render authority", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 600; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const earlyTailScale = Math.max(
        0.0065,
        Math.exp(-(frameIndex - 2) / 22) * 0.24,
      );
      const longTailScale = 0;
      const scale = isStrike
        ? 1
        : frameIndex < 72
          ? earlyTailScale
          : longTailScale;
      const partials =
        isStrike || frameIndex < 72
          ? scalePartials(RESONANT_STRIKE_PARTIALS, scale)
          : [];
      const meterIdlePause = !isStrike && frameIndex >= 72;
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 38 : meterIdlePause ? 1.22 : 0.34,
          fftMagnitudes: makeFft(partials),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: scale,
          }),
          rms: isStrike ? 0.28 : meterIdlePause ? 0.0068 : 0.0017,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });
    }

    expect(frame.fieldState).toBe("idle");
    expect(frame.renderAuthority).toBe(false);
    expect(frame.hasModalField).toBe(false);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
    expect(frame.modalVisibilityEnergy).toBe(0);
    expect(frame.debug.modalResponseEnergy).toBeGreaterThan(0.2);
    expect(frame.debug.modalResponseRenderEnergy).toBe(0);
    expect(frame.debug.energyLedger.sourceEnergy).toBe(0);
    expect(frame.debug.energyLedger.sourceBoundaryState).toBe("muted");
    expect(frame.debug.energyLedger.storedModalEnergy).toBeGreaterThan(0.2);
    expect(frame.debug.energyLedger.projectedRenderEnergy).toBe(0);
    expect(frame.debug.modalResponseCurrentRenderSourceEvidence).toBe(false);
    expect(frame.debug.modalResponseModeCount).toBeGreaterThan(0);
    expect(frame.debug.modalVisibilityDistributedEnergy).toBeGreaterThanOrEqual(
      0,
    );
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThanOrEqual(0);
    expect(frame.debug.modalVisibilityDominantEnergy).toBeGreaterThanOrEqual(0);
    expect(frame.debug.modalVisibilityDominantClusterEnergy).toBeUndefined();
  });

  it("cuts near-silent system line-feed residue without waiting for retained modal buffers", () => {
    const featureState = createAudioFeatureState();
    const status = makeSystemStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 42,
          fftMagnitudes: makeFft(RESONANT_STRIKE_PARTIALS),
          timeData: makeMixedTimeData({
            partials: RESONANT_STRIKE_PARTIALS,
            amplitudeScale: 1,
          }),
          rms: 0.28,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.fieldState).toBe("active");
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0);

    for (let frameIndex = 12; frameIndex < 52; frameIndex += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 1.2,
          fftMagnitudes: new Float32Array(BIN_COUNT),
          timeData: new Float32Array(FFT_SIZE),
          rms: 0.0068,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.fieldState).toBe("idle");
    expect(frame.renderAuthority).toBe(false);
    expect(frame.hasModalField).toBe(false);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
    expect(frame.modalVisibilityEnergy).toBe(0);
    expect(frame.debug.modalResponseEnergy).toBeGreaterThan(0);
    expect(frame.debug.modalResponseRenderEnergy).toBe(0);
    expect(frame.debug.energyLedger.sourceEnergy).toBe(0);
    expect(frame.debug.energyLedger.sourceBoundaryState).toBe("muted");
    expect(frame.debug.energyLedger.storedModalEnergy).toBeGreaterThan(0);
    expect(frame.debug.energyLedger.projectedRenderEnergy).toBe(0);
    expect(frame.debug.modalResponseCurrentRenderSourceEvidence).toBe(false);
  });

  it("does not render the first silent-transport system residue frame as live source", () => {
    const featureState = createAudioFeatureState();
    const status = makeSystemStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 42,
          fftMagnitudes: makeFft(RESONANT_STRIKE_PARTIALS),
          timeData: makeMixedTimeData({
            partials: RESONANT_STRIKE_PARTIALS,
            amplitudeScale: 1,
          }),
          rms: 0.28,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.fieldState).toBe("active");
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0);

    frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "system",
        avgAmplitude: 0.34,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        timeData: new Float32Array(FFT_SIZE),
        rms: 0.0017,
      }),
      featureState,
      radius: 3,
      status,
      frameTimeMs: 12 * 33,
    });

    expect(frame.sourceEvidence.currentSourceEvidence).toBe(false);
    expect(frame.energyLedger.sourceBoundaryState).toBe("muted");
    expect(frame.renderAuthority).toBe(false);
    expect(frame.fieldState).toBe("idle");
    expect(frame.hasModalField).toBe(false);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
    expect(frame.energyLedger.projectedRenderEnergy).toBe(0);
  });

  it("keeps retained high-Q topology visible through ring-support dropouts", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.34,
        fftMagnitudes: makeFft([
          [196, 0.012],
          [282, 0.008],
        ]),
        timeData: makeTimeData({
          frequency: 196,
          amplitude: 0.0045,
          harmonics: [[1.44, 0.0028]],
        }),
        rms: 0.0045,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 9000,
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const candidateForcingSlots = makeModeSlots([]);
    const candidateResponseSlots = makeModeSlots([
      [2, 1, 3, 0.03],
      [3, 2, 5, 0.028],
      [5, 3, 8, 0.026],
      [7, 4, 11, 0.024],
      [11, 5, 13, 0.022],
      [13, 8, 17, 0.02],
      [17, 11, 19, 0.018],
      [19, 13, 23, 0.016],
    ]);
    const structuralState = {
      candidateForcingSlotsSource: candidateForcingSlots,
      candidateResponseSlotsSource: candidateResponseSlots,
      referenceSourceCoupledSlotsSource: candidateForcingSlots,
      referenceResonantSlotsSource: candidateResponseSlots,
      proposalSourceCoupledSlotsSource: candidateForcingSlots,
      proposalResonantSlotsSource: candidateResponseSlots,
      proposalReferenceSourceCoupledSlotsSource: candidateForcingSlots,
      proposalReferenceResonantSlotsSource: candidateResponseSlots,
      dominantFrequency: 196,
      dominantAmplitude: 0.34,
      analysisEngine: "modal-excitation",
      pitchSource: "resonator-bank",
      spectralCandidates: [],
      sourceMode: "file",
      structuralMetrics: {
        distributedExcitation: 0.08,
        highQResonantModeCount: 8,
        highQResonantEnergy: 0.18,
        highQRingSupport: 0,
        modalPersistence: 0.035,
        modalDriveEnergy: 0.01,
        modeCoherence: 0.46,
        resonantSignalAuthoritative: false,
        resonantSignalAuthoritativeReason: "none",
        resonantSignalAuthoritativeHighQ: false,
      },
    };
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const frame = composeAudioFeatureFrame({
      preparedInputs,
      analysisResult,
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.activeModalFieldModeCount).toBe(8);
    expect(frame.debug.highQResonantModeCount).toBe(8);
    expect(frame.debug.highQRingSupport).toBe(0);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0.08);
    expect(frame.modalVisibilityEnergy).toBeLessThan(
      frame.modalVisibilityRetainedHighQEnergy,
    );
    expect(frame.modalVisibilityRetainedHighQEnergy).toBe(
      frame.debug.modalVisibilityRetainedHighQEnergy,
    );
  });

  it("keeps observer-authoritative high-Q tails visible below the old retained-energy threshold", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.52,
        fftMagnitudes: makeFft([
          [196, 0.01],
          [282, 0.007],
        ]),
        timeData: makeTimeData({
          frequency: 196,
          amplitude: 0.0038,
          harmonics: [[1.44, 0.0022]],
        }),
        rms: 0.0038,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 12000,
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const candidateForcingSlots = makeModeSlots([]);
    const candidateResponseSlots = makeModeSlots([
      [2, 1, 3, 0.012],
      [3, 2, 5, 0.01],
      [5, 3, 8, 0.009],
      [7, 4, 11, 0.008],
      [11, 5, 13, 0.007],
      [13, 8, 17, 0.006],
      [17, 11, 19, 0.005],
      [19, 13, 23, 0.004],
    ]);
    const structuralState = {
      candidateForcingSlotsSource: candidateForcingSlots,
      candidateResponseSlotsSource: candidateResponseSlots,
      referenceSourceCoupledSlotsSource: candidateForcingSlots,
      referenceResonantSlotsSource: candidateResponseSlots,
      proposalSourceCoupledSlotsSource: candidateForcingSlots,
      proposalResonantSlotsSource: candidateResponseSlots,
      proposalReferenceSourceCoupledSlotsSource: candidateForcingSlots,
      proposalReferenceResonantSlotsSource: candidateResponseSlots,
      dominantFrequency: 196,
      dominantAmplitude: 0.12,
      analysisEngine: "modal-excitation",
      pitchSource: "resonator-bank",
      spectralCandidates: [],
      sourceMode: "file",
      structuralMetrics: {
        distributedExcitation: 0.06,
        observedModalModeCount: 8,
        highQResonantModeCount: 8,
        highQResonantEnergy: 0.035,
        highQRingSupport: 0.4,
        highQObservedCoherence: 0.76,
        modalPersistence: 0.16,
        modalDriveEnergy: 0.012,
        modeCoherence: 0.68,
        resonantSignalAuthoritative: true,
        resonantSignalAuthoritativeReason: "high-q",
        resonantSignalAuthoritativeHighQ: true,
      },
    };
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const frame = composeAudioFeatureFrame({
      preparedInputs,
      analysisResult,
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.debug.highQResonantEnergy).toBe(0.035);
    expect(frame.debug.highQRingSupport).toBe(0.4);
    expect(frame.debug.highQObservedCoherence).toBe(0.76);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0.035);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeLessThanOrEqual(0.28);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBe(
      frame.debug.modalVisibilityRetainedHighQEnergy,
    );
  });

  it("does not flash high-Q retained visibility off when broad persistence jitters low", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.38,
        fftMagnitudes: makeFft([
          [196, 0.008],
          [282, 0.006],
          [417, 0.004],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.006],
            [282, 0.004],
            [417, 0.003],
          ],
          amplitudeScale: 0.0012,
        }),
        rms: 0.0018,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 16000,
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const candidateForcingSlots = makeModeSlots([]);
    const candidateResponseSlots = makeModeSlots([
      [2, 1, 3, 0.012],
      [3, 2, 5, 0.01],
      [5, 3, 8, 0.008],
      [7, 4, 11, 0.006],
    ]);
    const structuralState = {
      candidateForcingSlotsSource: candidateForcingSlots,
      candidateResponseSlotsSource: candidateResponseSlots,
      referenceSourceCoupledSlotsSource: candidateForcingSlots,
      referenceResonantSlotsSource: candidateResponseSlots,
      proposalSourceCoupledSlotsSource: candidateForcingSlots,
      proposalResonantSlotsSource: candidateResponseSlots,
      proposalReferenceSourceCoupledSlotsSource: candidateForcingSlots,
      proposalReferenceResonantSlotsSource: candidateResponseSlots,
      dominantFrequency: 196,
      dominantAmplitude: 0.08,
      analysisEngine: "modal-excitation",
      pitchSource: "resonator-bank",
      spectralCandidates: [],
      sourceMode: "file",
      structuralMetrics: {
        distributedExcitation: 0.05,
        observedModalModeCount: 4,
        highQResonantModeCount: 4,
        highQResonantEnergy: 0.028,
        highQRingSupport: 0.32,
        highQObservedCoherence: 0.74,
        modalPersistence: 0.024,
        modalDriveEnergy: 0.006,
        modeCoherence: 0.62,
        resonantSignalAuthoritative: true,
        resonantSignalAuthoritativeReason: "high-q",
        resonantSignalAuthoritativeHighQ: true,
      },
    };
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const frame = composeAudioFeatureFrame({
      preparedInputs,
      analysisResult,
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.debug.highQResonantEnergy).toBe(0.028);
    expect(frame.debug.highQRingSupport).toBe(0.32);
    expect(frame.debug.modalPersistence).toBeLessThan(0.03);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0.03);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
  });

  it("exposes observer-authorized visibility for coherent high-Q tails below broad modal energy", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.44,
        fftMagnitudes: makeFft([
          [196, 0.008],
          [282, 0.006],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.006],
            [282, 0.004],
          ],
          amplitudeScale: 0.0011,
        }),
        rms: 0.0016,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 17000,
    });
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateResponseSlots: makeModeSlots([
          [2, 1, 3, 0.0032],
          [3, 2, 5, 0.0026],
          [5, 3, 8, 0.002],
          [7, 4, 11, 0.0016],
        ]),
        dominantAmplitude: 0.08,
        structuralMetrics: {
          distributedExcitation: 0.03,
          observedModalModeCount: 4,
          highQResonantModeCount: 4,
          highQResonantEnergy: 0.012,
          highQRingSupport: 0.22,
          highQObservedCoherence: 0.78,
          highQObservedSnr: 0.64,
          modalPersistence: 0.018,
          modalDriveEnergy: 0.004,
          modeCoherence: 0.58,
          resonantSignalAuthoritative: true,
          resonantSignalAuthoritativeReason: "high-q",
          resonantSignalAuthoritativeHighQ: true,
        },
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.modalVisibilityEnergy).toBeLessThan(0.18);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0.08);
    expect(frame.debug.modalObserverVisibilityEnergy).toBe(
      frame.modalObserverVisibilityEnergy,
    );
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0);
  });

  it("rejects retained high-Q visibility for dense pop-like spectra", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 28,
        fftMagnitudes: makeDenseFft({
          count: 1000,
          amplitude: 0.018,
          peakFrequency: 427,
          peakAmplitude: 0.62,
        }),
        timeData: makeMixedTimeData({
          partials: [
            [110, 0.4],
            [164, 0.32],
            [220, 0.28],
            [427, 0.2],
            [880, 0.18],
            [1600, 0.12],
            [3197, 0.1],
          ],
          amplitudeScale: 0.18,
        }),
        rms: 0.046,
      }),
      featureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 22000,
    });
    const denseResonantSlots = makeModeSlots([
      [12, 18, 22, 0.31],
      [5, 18, 18, 0.3],
      [4, 9, 24, 0.29],
      [4, 6, 30, 0.28],
      [6, 14, 21, 0.27],
      [2, 7, 30, 0.26],
      [4, 10, 19, 0.25],
      [3, 12, 18, 0.24],
    ]);
    const denseSourceCoupledSlots = makeModeSlots([
      [1, 1, 1, 0.39],
      [1, 1, 3, 0.26],
      [1, 1, 2, 0.25],
      [1, 2, 2, 0.15],
      [1, 1, 4, 0.14],
      [1, 3, 6, 0.13],
    ]);
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateForcingSlots: denseSourceCoupledSlots,
        candidateResponseSlots: denseResonantSlots,
        dominantFrequency: 427,
        dominantAmplitude: 0.4,
        sourceMode: "file",
        structuralMetrics: {
          distributedExcitation: 0.62,
          observedModalModeCount: 16,
          lowQSourceCoupledModeCount: 8,
          lowQSourceCoupledEnergy: 1,
          lowQObservedCoherence: 0.47,
          lowQObservedSnr: 0.31,
          highQResonantModeCount: 8,
          highQResonantEnergy: 1,
          highQRingSupport: 1,
          highQObservedDrive: 0,
          highQObservedSnr: 0.2,
          highQObservedCoherence: 0.55,
          highQObservedNoiseFloor: 0.26,
          modalPersistence: 0,
          modalDriveEnergy: 0.16,
          modeCoherence: 0.52,
          resonantSignalAuthoritative: true,
          resonantSignalAuthoritativeReason: "resonant-authority",
          resonantSignalAuthoritativeHighQ: true,
        },
      }),
    });

    expect(frame.debug.nonZeroFFTBinCount).toBeGreaterThanOrEqual(900);
    expect(frame.debug.highQProjectionLoad).toBeGreaterThan(0.8);
    expect(frame.debug.highQSparseResonatorEvidence).toBeGreaterThanOrEqual(0);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0.05);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.18);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
  });

  it("does not let dense music periodicity override weak high-Q evidence", () => {
    const evidence = deriveHighQSparseResonatorEvidence({
      highQObservedSnr: 0.175,
      highQObservedCoherence: 0.548,
      highQObservedDrive: 0,
      highQRingSupport: 1,
      highQResonantEnergy: 1,
      distributedExcitation: 0.627,
      periodicity: 0.983,
      nonZeroFFTBinCount: 1345,
      modeCoherence: 0.49,
    });

    expect(evidence.highQProjectionLoad).toBeGreaterThan(0.9);
    expect(evidence.highQSparseResonatorEvidence).toBeGreaterThan(0.04);
  });

  it("does not let dense music coherence rescue weak high-Q evidence", () => {
    const evidence = deriveHighQSparseResonatorEvidence({
      highQObservedSnr: 0.18,
      highQObservedCoherence: 0.86,
      highQObservedDrive: 0,
      highQRingSupport: 1,
      highQResonantEnergy: 1,
      distributedExcitation: 0.63,
      periodicity: 0.98,
      nonZeroFFTBinCount: 1345,
      modeCoherence: 0.86,
    });

    expect(evidence.highQProjectionLoad).toBeGreaterThan(0.85);
    expect(evidence.highQSparseResonatorEvidence).toBeGreaterThan(0.12);
  });

  it("recomputes dense projection load at the frame display seam", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 52,
        fftMagnitudes: makeDenseFft({
          count: 1345,
          amplitude: 0.012,
          peakFrequency: 1328,
          peakAmplitude: 0.74,
        }),
        timeData: makeMixedTimeData({
          partials: [
            [818, 0.4],
            [1328, 0.3],
            [220, 0.24],
            [440, 0.2],
            [1760, 0.16],
          ],
          amplitudeScale: 0.22,
        }),
        rms: 0.059,
      }),
      featureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 24000,
    });
    const denseResonantSlots = makeModeSlots([
      [2, 3, 15, 0.25],
      [4, 6, 30, 0.23],
      [2, 8, 13, 0.22],
      [3, 12, 18, 0.21],
      [12, 18, 22, 0.2],
      [6, 9, 11, 0.19],
    ]);
    const denseSourceCoupledSlots = makeModeSlots([
      [1, 1, 3, 0.26],
      [1, 1, 1, 0.21],
      [2, 4, 10, 0.18],
      [1, 3, 6, 0.14],
      [1, 3, 3, 0.13],
      [1, 1, 2, 0.13],
    ]);
    const structuralState = makeManualStructuralState({
      candidateForcingSlots: denseSourceCoupledSlots,
      candidateResponseSlots: denseResonantSlots,
      dominantFrequency: 818,
      dominantAmplitude: 0.4,
      sourceMode: "file",
      structuralMetrics: {
        distributedExcitation: 0.627,
        highQResonantModeCount: 8,
        highQResonantEnergy: 1,
        highQRingSupport: 1,
        highQObservedDrive: 0,
        highQObservedSnr: 0.175,
        highQObservedCoherence: 0.548,
        highQObservedNoiseFloor: 0.347,
        highQSparseResonatorEvidence: 1,
        lowQSourceCoupledModeCount: 8,
        lowQSourceCoupledEnergy: 1,
        lowQObservedCoherence: 0.5,
        lowQObservedSnr: 0.2,
        modalPersistence: 0,
        modalDriveEnergy: 0.35,
        modeCoherence: 0.49,
      },
    });
    structuralState.sourceCoupledStateSource = {
      candidatePeriodicity: 0.983,
    };

    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState,
    });

    expect(frame.debug.highQProjectionLoad).toBeGreaterThan(0.9);
    expect(frame.debug.highQSparseResonatorEvidence).toBeGreaterThan(0.04);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.18);
  });

  it("does not reduce low-Q source visibility because projection load is dense", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 34,
        fftMagnitudes: makeDenseFft({
          count: 1024,
          amplitude: 0.01,
          peakFrequency: 220,
          peakAmplitude: 0.7,
        }),
        timeData: makeMixedTimeData({
          partials: [[220, 0.7]],
          amplitudeScale: 0.3,
        }),
        rms: 0.08,
      }),
      featureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 24033,
    });
    const sourceSlots = makeModeSlots([
      [1, 1, 1, 0.32],
      [1, 1, 2, 0.28],
    ]);
    const buildFrame = (projectionLoad) =>
      composeManualStructuralFrame({
        preparedInputs,
        structuralState: makeManualStructuralState({
          candidateForcingSlots: sourceSlots,
          candidateResponseSlots: makeModeSlots([]),
          sourceMode: "file",
          structuralMetrics: {
            projectionLoad: projectionLoad,
            distributedExcitation: projectionLoad,
            lowQSourceCoupledModeCount: 2,
            lowQSourceCoupledEnergy: 0.6,
            lowQObservedDrive: 0.4,
            lowQObservedSnr: 0.8,
            lowQObservedCoherence: 0.8,
            modeCoherence: 0.8,
          },
        }),
      });

    const sparse = buildFrame(0);
    const dense = buildFrame(1);

    expect(dense.debug.lowQSourceCoupledVisibilityAuthority).toBeCloseTo(
      sparse.debug.lowQSourceCoupledVisibilityAuthority,
      6,
    );
  });

  it("raises only existing observed slots enough to preserve cached topology", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.5,
        fftMagnitudes: makeFft([
          [196, 0.007],
          [282, 0.005],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.005],
            [282, 0.003],
          ],
          amplitudeScale: 0.001,
        }),
        rms: 0.0015,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 17100,
    });
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateForcingSlots: makeModeSlots([[2, 2, 3, 0.001]]),
        candidateResponseSlots: makeModeSlots([
          [2, 1, 3, 0.001],
          [3, 2, 5, 0.0008],
          [5, 3, 8, 0.0006],
        ]),
        dominantAmplitude: 0.06,
        structuralMetrics: {
          observedModalModeCount: 4,
          lowQSourceCoupledModeCount: 1,
          lowQSourceCoupledEnergy: 0.04,
          lowQObservedCoherence: 0.6,
          highQResonantModeCount: 3,
          highQResonantEnergy: 0.01,
          highQRingSupport: 0.24,
          highQObservedCoherence: 0.82,
          highQObservedSnr: 0.7,
          modalPersistence: 0.02,
          modalDriveEnergy: 0.004,
          modeCoherence: 0.64,
        },
      }),
    });

    expect(
      findModeAmplitude(frame.modalFieldSlots, [2, 1, 3]),
    ).toBeLessThanOrEqual(0.001001);
    expect(
      findModeAmplitude(frame.modalFieldSlots, [3, 2, 5]),
    ).toBeLessThanOrEqual(0.0008);
    expect(findModeAmplitude(frame.modalFieldSlots, [4, 4, 4])).toBe(0);
    expect(frame.debug.modalObserverTopologyFloor).toBeGreaterThan(0);
    expect(frame.debug.highQObserverVisibilityEnergy).toBeGreaterThan(0);
  });

  it("exposes phase slots aligned with existing mode slots without adding modes", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.58,
        fftMagnitudes: makeFft([
          [196, 0.009],
          [282, 0.007],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.007],
            [282, 0.005],
          ],
          amplitudeScale: 0.0012,
        }),
        rms: 0.0018,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 17200,
    });
    const candidateResponseSlots = makeModeSlots([
      [2, 1, 3, 0.0032],
      [3, 2, 5, 0.0026],
    ]);
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateResponseSlots,
        resonantPhaseSlots: makePhaseSlots([
          [0.2, 0.12, 0.8, 0.54],
          [-0.4, -0.08, 0.72, 0.42],
        ]),
        structuralMetrics: {
          observedModalModeCount: 2,
          highQResonantModeCount: 2,
          highQResonantEnergy: 0.012,
          highQRingSupport: 0.24,
          highQObservedCoherence: 0.82,
          highQObservedSnr: 0.7,
          modalPersistence: 0.04,
          modalDriveEnergy: 0.004,
          modeCoherence: 0.66,
          modalPhaseAuthority: 0.48,
          highQPhaseAuthority: 0.48,
          modalPhaseCoherentFieldModeCount: 2,
        },
      }),
    });

    expect(countActiveSlots(frame.modalFieldSlots)).toBe(2);
    expect(countAuthoritativePhaseSlots(frame.modalFieldPhaseSlots)).toBe(2);
    expect(frame.modalFieldPhaseSlots[0]).toBeCloseTo(0.2);
    expect(frame.modalFieldPhaseSlots[3]).toBeCloseTo(0.54);
    expect(frame.modalFieldPhaseSlots[4]).toBeCloseTo(-0.4);
    expect(frame.activeModalFieldModeCount).toBe(2);
    expect(frame.debug.modalPhaseAuthority).toBeGreaterThan(0);
    expect(frame.debug.highQPhaseAuthority).toBeGreaterThan(0);
  });

  it("audits upstream modal publication coverage before descriptor admission", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 36,
        fftMagnitudes: makeFft([
          [196, 0.8],
          [392, 0.6],
          [588, 0.42],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.7],
            [392, 0.42],
            [588, 0.28],
          ],
          amplitudeScale: 0.16,
        }),
        rms: 0.18,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 17300,
    });
    const sourceEntries = Array.from({ length: 12 }, (_, index) => [
      1 + (index % 3),
      1 + Math.floor(index / 3),
      1,
      0.18 - index * 0.003,
    ]);
    const resonantEntries = Array.from({ length: 24 }, (_, index) => [
      4 + (index % 6),
      2 + Math.floor(index / 6),
      1,
      0.16 - index * 0.002,
    ]);
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateForcingSlots: makeModeSlots(sourceEntries),
        candidateResponseSlots: makeModeSlots(resonantEntries),
        structuralMetrics: {
          observedModalModeCount: 36,
          excitedModeCount: 36,
          lowQSourceCoupledModeCount: 12,
          lowQSourceCoupledEnergy: 0.4,
          lowQObservedCoherence: 0.72,
          highQResonantModeCount: 24,
          highQResonantEnergy: 0.55,
          highQRingSupport: 0.7,
          highQObservedCoherence: 0.82,
          highQObservedSnr: 0.7,
          modalPersistence: 0.62,
          modalDriveEnergy: 0.4,
          modalResponseEnergy: 0.78,
          modalResponseRenderEnergy: 0.78,
          modalResponseSourceCoupledEnergy: 0.32,
          modalResponseResonantEnergy: 0.46,
          modalResponseModeCount: 36,
          modalResponseRawEnergy: 0.78,
          modalResponseBudgetScale: 1,
          modeCoherence: 0.72,
          modalPhaseAuthority: 0.9,
          highQPhaseAuthority: 0.9,
          modalPhaseCoherentFieldModeCount: 36,
        },
      }),
    });
    const audit = frame.modalDescriptor.diagnostics.modalVarietyAudit;

    expect(audit.upstreamSourceCoupledModeCount).toBe(12);
    expect(audit.upstreamResonantModeCount).toBe(24);
    expect(audit.upstreamCandidateModeCount).toBe(36);
    expect(audit.modalTopologyGeometry).toBe("rectangular");
    expect(audit.upstreamSourceCoupledShellCount).toBeGreaterThan(0);
    expect(audit.upstreamResonantShellCount).toBeGreaterThan(0);
    expect(audit.upstreamCandidateShellCount).toBeGreaterThan(0);
    expect(audit.semanticShellCount).toBeGreaterThan(0);
    expect(audit.representedShellCount).toBeGreaterThan(0);
    expect(audit.observedModalModeCount).toBe(36);
    expect(audit.phaseAuthorityModeCount).toBe(36);
    expect(frame.activeModalFieldModeCount).toBeLessThan(
      audit.upstreamCandidateModeCount,
    );
    expect(audit.semanticModeCount).toBe(frame.activeModalFieldModeCount);
    expect(audit.publishedModeCoverageRatio).toBeCloseTo(
      frame.activeModalFieldModeCount / 36,
      6,
    );
    expect(audit.publishedShellCoverageRatio).toBeCloseTo(
      audit.semanticShellCount / audit.upstreamCandidateShellCount,
      6,
    );
    expect(audit.basisRepresentedShellCoverageRatio).toBeCloseTo(
      audit.representedShellCount / audit.upstreamCandidateShellCount,
      6,
    );
    expect(audit.observedModalPublishedModeCoverageRatio).toBeCloseTo(
      frame.activeModalFieldModeCount / 36,
      6,
    );
    expect(audit.basisRepresentedUpstreamModeCoverageRatio).toBeCloseTo(
      audit.representedBasisPageModeCount / 36,
      6,
    );
    expect(audit.publishedModalEnergyCoverageRatio).toBeGreaterThan(0);
    expect(audit.publishedModalEnergyCoverageRatio).toBeLessThanOrEqual(1);
  });

  it("does not authorize observer visibility or create slots from stale silence", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 0,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        timeData: new Float32Array(FFT_SIZE),
        rms: 0,
      }),
      featureState,
      radius: 3,
      status: makeResolvedLineFeedLiveStatus(),
      frameTimeMs: 18000,
      liveInputAnalysisSettings: { acousticIntent: "ambient" },
    });
    preparedInputs.liveInputHardSilenceActive = true;
    const emptySlots = new Float32Array(AUDIO_SLOT_CAPACITY * 4);
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateForcingSlots: emptySlots,
        candidateResponseSlots: emptySlots,
        dominantAmplitude: 0,
        sourceMode: "live",
        structuralMetrics: {
          observedModalModeCount: 4,
          highQResonantModeCount: 4,
          highQResonantEnergy: 0.04,
          highQRingSupport: 0.4,
          highQObservedCoherence: 0.8,
          modalPersistence: 0.2,
          modalDriveEnergy: 0.08,
          modeCoherence: 0.8,
        },
      }),
    });

    expect(frame.modalObserverVisibilityEnergy).toBe(0);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
    expect(frame.debug.modalObserverTopologyFloor).toBe(0);
  });

  it("does not amplify modal slots from observer visibility floors", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 3,
        fftMagnitudes: makeFft([
          [55, 0.18],
          [110, 0.12],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [55, 0.5],
            [110, 0.18],
          ],
          amplitudeScale: 0.018,
        }),
        rms: 0.008,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 18100,
    });
    const candidateForcingSlots = makeModeSlots([
      [1, 1, 1, 0.0006],
      [2, 1, 1, 0.0004],
    ]);
    const physicalSlotTotal = sumSlotAmplitudes(candidateForcingSlots);
    const frame = composeManualStructuralFrame({
      preparedInputs,
      structuralState: makeManualStructuralState({
        candidateForcingSlots,
        structuralMetrics: makeLowQSourceCoupledStructuralMetrics({
          lowQSourceCoupledEnergy: 0.09,
          lowQSourceCoupledModeCount: 4,
          lowQObservedCoherence: 0.88,
          lowQObservedSnr: 0.82,
          modalResponseEnergy: 0.09,
          modalResponseSourceCoupledEnergy: 0.09,
        }),
      }),
    });

    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeLessThanOrEqual(
      physicalSlotTotal + 1e-6,
    );
  });

  it("keeps subdued system-routed harmonic resonance from going empty", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [220, 0.096],
      [440, 0.056],
      [660, 0.032],
      [880, 0.016],
      [1320, 0.01],
      [2200, 0.007],
    ]);
    const timeData = makeTimeData({
      frequency: 220,
      amplitude: 0.022,
      harmonics: [
        [2, 0.01],
        [3, 0.0048],
      ],
    });
    let frame = null;

    for (let index = 0; index < 10; index += 1) {
      frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 4.8,
          fftMagnitudes,
          timeData,
          rms: 0.018,
        }),
        featureState,
        radius: 3,
        status: makeSystemStatus(),
        frameTimeMs: index * 33,
      });
    }

    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.12);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.02);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
  });

  it("reports low-Q observer energy without retained high-Q ridge visibility", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 24,
        fftMagnitudes: makeFft([
          [550, 0.95],
          [1100, 0.52],
        ]),
        timeData: makeTimeData({ frequency: 550, amplitude: 0.45 }),
        rms: 0.2,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 96,
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const candidateForcingSlots = makeModeSlots([
      [2, 2, 3, 0.18],
      [3, 2, 4, 0.14],
    ]);
    const emptyResonantSlots = new Float32Array(AUDIO_SLOT_CAPACITY * 4);
    const structuralState = {
      candidateForcingSlotsSource: candidateForcingSlots,
      candidateResponseSlotsSource: emptyResonantSlots,
      referenceSourceCoupledSlotsSource: candidateForcingSlots,
      referenceResonantSlotsSource: emptyResonantSlots,
      proposalSourceCoupledSlotsSource: candidateForcingSlots,
      proposalResonantSlotsSource: emptyResonantSlots,
      proposalReferenceSourceCoupledSlotsSource: candidateForcingSlots,
      proposalReferenceResonantSlotsSource: emptyResonantSlots,
      dominantFrequency: 550,
      dominantAmplitude: 0.18,
      analysisEngine: "modal-excitation",
      pitchSource: "resonator-bank",
      spectralCandidates: [],
      sourceMode: "file",
      structuralMetrics: {
        observedModalModeCount: 2,
        lowQSourceCoupledModeCount: 2,
        lowQSourceCoupledEnergy: 0.32,
        lowQObservedDrive: 0.12,
        lowQObservedSnr: 0.5,
        lowQObservedCoherence: 0.82,
        highQResonantModeCount: 0,
        highQResonantEnergy: 0,
        highQRingSupport: 0,
        modalPersistence: 0.3,
        modalDriveEnergy: 0.12,
        modeCoherence: 0.82,
        distributedExcitation: 0.08,
      },
    };
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const frame = composeAudioFeatureFrame({
      preparedInputs,
      analysisResult,
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(frame.debug.observedModalModeCount).toBe(2);
    expect(frame.debug.lowQSourceCoupledModeCount).toBe(2);
    expect(frame.debug.lowQSourceCoupledEnergy).toBe(0.32);
    expect(frame.debug.lowQObservedCoherence).toBe(0.82);
    expect(frame.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(frame.debug.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(frame.debug.highQResonantEnergy).toBe(0);
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
      frame.activeModalFieldModeCount + frame.activeModalFieldModeCount,
    ).toBeGreaterThan(0);
    expect(frame.debug.dominantFrequency).toBeGreaterThan(0);
    expect(frame.structureSignal).toBeGreaterThan(0);
  });

  it("keeps quiet line-feed program audio on file-equivalent source normalization", () => {
    const snapshot = createSnapshot({
      sourceMode: "live",
      avgAmplitude: 0.1844,
      rms: 0.005,
      fftMagnitudes: makeFft([
        [196, 0.018],
        [282, 0.012],
      ]),
      timeData: makeMixedTimeData({
        partials: [
          [196, 0.018],
          [282, 0.012],
        ],
        amplitudeScale: 0.005,
      }),
    });
    const lineFeedFrame = buildAudioFeatureFrame({
      analysisSnapshot: snapshot,
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 32,
    });
    const fileFrame = buildAudioFeatureFrame({
      analysisSnapshot: { ...snapshot, sourceMode: "file" },
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 32,
    });

    expect(lineFeedFrame.debug.resolvedLiveInputAnalysisClass).toBe(
      "line-feed",
    );
    expect(lineFeedFrame.debug.liveInputPolicy).toBe("line-feed");
    expect(fileFrame.debug.sourceNormalization.normalizedRms).toBeCloseTo(
      0.005 * 2.8,
      6,
    );
    expect(lineFeedFrame.debug.sourceNormalization).toEqual(
      fileFrame.debug.sourceNormalization,
    );
    expect(lineFeedFrame.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(lineFeedFrame.energyLedger.sourceBoundaryState).toBe("live");
  });

  it("lets coherent line-feed source-coupled visibility exceed the observer SNR floor", () => {
    const frame = buildManualLowQSourceCoupledFrame({
      sourceMode: "live",
      status: makeSystemStatus(),
      avgAmplitude: 0.1844,
      rms: 0.005,
      fftMagnitudes: makeFft([
        [196, 0.018],
        [282, 0.012],
        [798, 0.6],
      ]),
      timeData: makeMixedTimeData({
        partials: [
          [196, 0.018],
          [282, 0.012],
          [798, 0.06],
        ],
        amplitudeScale: 0.005,
      }),
      candidateForcingSlots: makeModeSlots([
        [2, 3, 13, 0.427],
        [1, 5, 8, 0.121],
        [1, 1, 16, 0.074],
        [1, 2, 4, 0.071],
      ]),
      structuralMetrics: makeLowQSourceCoupledStructuralMetrics({
        modeCoherence: 0.64,
        modalDriveEnergy: 0.066,
        modalResponseSourceCoupledEnergy: 1,
        modalResponseEnergy: 1,
        lowQSourceCoupledModeCount: 56,
        lowQSourceCoupledEnergy: 1,
        lowQObservedDrive: 0.1508,
        lowQObservedSnr: 0.107,
        lowQObservedCoherence: 0.97,
        distributedExcitation: 0.224,
      }),
    });

    expect(frame.debug.resolvedLiveInputAnalysisClass).toBe("line-feed");
    expect(frame.debug.lowQSourceCoupledSourceSupport).toBeGreaterThan(0.12);
    expect(frame.debug.lowQSourceCoupledVisibilityAuthority).toBeGreaterThan(
      0.7,
    );
    expect(frame.debug.lowQSourceCoupledVisibilityEnergy).toBeGreaterThan(0.12);
    expect(frame.debug.lowQSourceCoupledTopologyFloor).toBeGreaterThan(0.12);
    expect(frame.modalResponseRenderSourceCoupledEnergy).toBeGreaterThan(0);
    expect(frame.modalResponseRenderResonantEnergy).toBe(0);
  });

  it("keeps coherent system source-coupled modes active from low-Q visibility energy", () => {
    const frame = buildManualLowQSourceCoupledFrame({
      sourceMode: "live",
      status: makeSystemStatus(),
      avgAmplitude: 0.1844,
      rms: 0.005,
      fftMagnitudes: makeFft([
        [196, 0.018],
        [282, 0.012],
        [798, 0.6],
      ]),
      timeData: makeMixedTimeData({
        partials: [
          [196, 0.018],
          [282, 0.012],
          [798, 0.06],
        ],
        amplitudeScale: 0.005,
      }),
      candidateForcingSlots: makeModeSlots([
        [2, 3, 13, 0.006],
        [1, 5, 8, 0.004],
      ]),
      structuralMetrics: makeLowQSourceCoupledStructuralMetrics({
        modeCoherence: 0.64,
        modalDriveEnergy: 0.066,
        modalResponseSourceCoupledEnergy: 1,
        modalResponseEnergy: 1,
        lowQSourceCoupledModeCount: 56,
        lowQSourceCoupledEnergy: 1,
        lowQObservedDrive: 0.1508,
        lowQObservedSnr: 0.107,
        lowQObservedCoherence: 0.97,
        distributedExcitation: 0.224,
      }),
    });

    expect(frame.debug.lowQSourceCoupledVisibilityEnergy).toBeGreaterThan(0.12);
    expect(frame.modalVisibilityEnergy).toBe(0);
    expect(frame.fieldState).toBe("active");
    expect(frame.renderAuthority).toBe(true);
    expect(countActiveSlots(frame.modalFieldSlots)).toBe(2);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeCloseTo(0.01, 6);
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
    const firstSourceCoupledTargets =
      featureState.analysis.zeroSourceCoupledTargetSlots;
    const firstResonantTargets = featureState.analysis.zeroResonantTargetSlots;

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.zeroSourceCoupledTargetSlots).toBe(
      firstSourceCoupledTargets,
    );
    expect(featureState.analysis.zeroResonantTargetSlots).toBe(
      firstResonantTargets,
    );

    featureState.capacity = 2;
    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status: makeActiveStatus({ capacity: 2 }),
      frameTimeMs: 48,
    });

    expect(featureState.analysis.zeroSourceCoupledTargetSlots).not.toBe(
      firstSourceCoupledTargets,
    );
    expect(featureState.analysis.zeroResonantTargetSlots).not.toBe(
      firstResonantTargets,
    );
    expect(featureState.analysis.zeroSourceCoupledTargetSlots.length).toBe(
      Math.min(2, AUDIO_SLOT_CAPACITY) * 4,
    );
    expect(featureState.analysis.zeroResonantTargetSlots.length).toBe(
      Math.min(2, AUDIO_SLOT_CAPACITY) * 4,
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
    const firstSourceCoupledTargetSlots =
      featureState.analysis.nonAcousticSourceCoupledTarget.slots;
    const firstResonantTargetSlots =
      featureState.analysis.nonAcousticResonantTarget.slots;
    const firstPeakDriverScratchSlots =
      featureState.analysis.nonAcousticPeakDriverScratch.slots;

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.nonAcousticSourceCoupledTarget.slots).toBe(
      firstSourceCoupledTargetSlots,
    );
    expect(featureState.analysis.nonAcousticResonantTarget.slots).toBe(
      firstResonantTargetSlots,
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

    expect(featureState.analysis.nonAcousticSourceCoupledTarget.slots).not.toBe(
      firstSourceCoupledTargetSlots,
    );
    expect(featureState.analysis.nonAcousticResonantTarget.slots).not.toBe(
      firstResonantTargetSlots,
    );
    expect(featureState.analysis.nonAcousticPeakDriverScratch.slots).not.toBe(
      firstPeakDriverScratchSlots,
    );
    expect(
      featureState.analysis.nonAcousticSourceCoupledTarget.slots.length,
    ).toBe(Math.min(2, AUDIO_SLOT_CAPACITY) * 4);
    expect(featureState.analysis.nonAcousticResonantTarget.slots.length).toBe(
      Math.min(2, AUDIO_SLOT_CAPACITY) * 4,
    );
    expect(
      featureState.analysis.nonAcousticPeakDriverScratch.slots.length,
    ).toBe(Math.min(2, AUDIO_SLOT_CAPACITY) * 4);
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
    const firstSourceCoupledTargetSlots =
      featureState.analysis.acousticSourceCoupledTarget.slots;
    const firstResonantTargetSlots =
      featureState.analysis.acousticResonantTarget.slots;

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.acousticSourceCoupledTarget.slots).toBe(
      firstSourceCoupledTargetSlots,
    );
    expect(featureState.analysis.acousticResonantTarget.slots).toBe(
      firstResonantTargetSlots,
    );

    featureState.capacity = 2;
    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status: makeLiveInputStatus({ capacity: 2, liveInputKind: "live" }),
      frameTimeMs: 48,
    });

    expect(featureState.analysis.acousticSourceCoupledTarget.slots).not.toBe(
      firstSourceCoupledTargetSlots,
    );
    expect(featureState.analysis.acousticResonantTarget.slots).not.toBe(
      firstResonantTargetSlots,
    );
    expect(featureState.analysis.acousticSourceCoupledTarget.slots.length).toBe(
      Math.min(2, AUDIO_SLOT_CAPACITY) * 4,
    );
    expect(featureState.analysis.acousticResonantTarget.slots.length).toBe(
      Math.min(2, AUDIO_SLOT_CAPACITY) * 4,
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
    expect(sustained.debug.modalVisibilityPeakSlotEnergy).toBeGreaterThan(0);
    expect(sustained.debug.modalVisibilityUpperSlotEnergy).toBeGreaterThan(0);
    expect(sustained.debug.modalVisibilityDistributedEnergy).toBeGreaterThan(0);
    expect(
      sustained.debug.modalVisibilityDominantEnergy,
    ).toBeGreaterThanOrEqual(0);
    expect(
      sustained.debug.modalVisibilityDominantClusterEnergy,
    ).toBeUndefined();
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
    expect(silent.modalVisibilityRetainedHighQEnergy).toBe(0);
    expect(weakNoisy.energySignal).toBeLessThan(0.12);
    expect(weakNoisy.modalVisibilityEnergy).toBe(0);
    expect(weakNoisy.modalVisibilityRetainedHighQEnergy ?? 0).toBe(0);
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

    expect(maxSlotAmplitude(frame.modalFieldSlots)).toBeLessThan(0.1);
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

    const micSourceCoupled = maxSlotAmplitude(micFrame.modalFieldSlots);
    const fileSourceCoupled = maxSlotAmplitude(fileFrame.modalFieldSlots);
    const micResonant = maxSlotAmplitude(micFrame.modalFieldSlots);
    const fileResonant = maxSlotAmplitude(fileFrame.modalFieldSlots);

    expect(micSourceCoupled).toBeGreaterThan(0);
    expect(fileSourceCoupled).toBeGreaterThan(0);
    expect(micResonant).toBeGreaterThan(0);
    expect(fileResonant).toBeGreaterThan(0);
    expect(micResonant / fileResonant).toBeGreaterThanOrEqual(0.5);
    expect(micResonant / fileResonant).toBeLessThanOrEqual(2.7);
    expect(micSourceCoupled / fileSourceCoupled).toBeGreaterThanOrEqual(0.5);
    expect(micSourceCoupled / fileSourceCoupled).toBeLessThanOrEqual(2.7);
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

  it("reuses heavy analysis while keeping deterministic appearance descriptors", () => {
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
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
    });

    const preparedReuse = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1012,
    });
    const reused = composeAudioFeatureFrame({
      preparedInputs: preparedReuse,
      analysisResult,
      previousFrame: first,
      reuseHeavyAnalysis: true,
    });

    expect(Array.from(reused.modalFieldSlots)).toEqual(
      Array.from(first.modalFieldSlots),
    );
    expect(reused.keyTonic).toBe(first.keyTonic);
    expect(reused.pulseSignal).toBe(first.pulseSignal);
    expect(reused.changeSignal).toBe(first.changeSignal);
    expect(reused.timbreSpread).toBeCloseTo(first.timbreSpread, 4);
    expect(reused.spectralNovelty).toBeCloseTo(first.spectralNovelty, 4);
  });

  it("stores deterministic descriptors in composed frames", () => {
    const featureState = createAudioFeatureState();
    const status = createStatus({
      audioInputMode: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 42,
    });
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
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const frame = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
    });

    expect(frame.timbreSpread).toBeGreaterThanOrEqual(0);
    expect(frame.spectralNovelty).toBeGreaterThanOrEqual(0);
    expect(frame.debug.workerState).toBe("none");
    expect(frame.debug.hintSource).toBe("none");
  });

  it("reused heavy-analysis frames keep core signals stable", () => {
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
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
    });

    const preparedReuse = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1048,
    });
    const reused = composeAudioFeatureFrame({
      preparedInputs: preparedReuse,
      analysisResult,
      previousFrame: first,
      reuseHeavyAnalysis: true,
    });

    expect(Array.from(reused.modalFieldSlots)).toEqual(
      Array.from(first.modalFieldSlots),
    );
    expect(reused.sourceMode).toBe(first.sourceMode);
    expect(reused.keyTonic).toBe(first.keyTonic);
    expect(reused.changeSignal).toBe(first.changeSignal);
    expect(reused.pulseSignal).toBe(first.pulseSignal);
    expect(reused.structureSignal).toBe(first.structureSignal);
    expect(reused.energySignal).toBe(first.energySignal);
    expect(reused.timbreSpread).toBe(first.timbreSpread);
    expect(reused.spectralNovelty).toBe(first.spectralNovelty);
  });

  it("reused heavy-analysis frames let current silence collapse composite authority", () => {
    const featureState = createAudioFeatureState();
    const status = createStatus({
      audioInputMode: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 7,
    });
    const analysisSnapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: {
        testToneHz: 440,
        testToneAmplitude: 0.7,
      },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
    });

    const preparedSilentReuse = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        rms: 0,
      }),
      featureState,
      radius: 3,
      status,
      frameTimeMs: 1000 + 8 * 33,
    });
    const reused = composeAudioFeatureFrame({
      preparedInputs: preparedSilentReuse,
      analysisResult,
      previousFrame: first,
      reuseHeavyAnalysis: true,
    });

    expect(Array.from(reused.modalFieldSlots)).not.toEqual(
      Array.from(first.modalFieldSlots),
    );
    expect(first.modalVisibilityEnergy).toBeGreaterThan(0.05);
    expect(reused.renderAuthority).toBe(false);
    expect(reused.sourceEvidence.currentSourceEvidence).toBe(false);
    expect(reused.energyLedger.projectedRenderEnergy).toBe(0);
    expect(sumSlotAmplitudes(reused.modalFieldSlots)).toBe(0);
    expect(reused.structureSignal).toBeLessThan(first.structureSignal * 0.5);
    expect(reused.energySignal).toBeLessThan(first.energySignal * 0.5);
    expect(reused.modalVisibilityEnergy).toBeLessThan(
      first.modalVisibilityEnergy * 0.5,
    );
    expect(reused.modeCoherence).toBeLessThan(first.modeCoherence * 0.5);
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
    let hasResonantActivity = false;
    for (let i = 3; i < frame.modalFieldSlots.length; i += 4) {
      if ((frame.modalFieldSlots[i] ?? 0) > 0) {
        hasResonantActivity = true;
        break;
      }
    }
    expect(hasResonantActivity).toBe(true);
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
      frame.modalFieldSlots.some(
        (_, index) => index % 4 === 3 && frame.modalFieldSlots[index] > 0,
      ),
    ).toBe(true);
    expect(frame.trebleBroadbandEnergy).toBeGreaterThan(0.05);
    expect(frame.structureSignal).toBeLessThanOrEqual(1);
    expect(frame.modeCoherence).toBeGreaterThan(0);
  });

  it("projects current resonant treble energy over a low-end backbone", () => {
    const mixedPartials = [
      [92, 0.68],
      [184, 0.4],
      [368, 0.22],
      [6200, 0.16],
      [6975, 0.1],
    ];
    const cases = [
      {
        label: "file",
        status: makeActiveStatus(),
        sourceMode: "file",
        avgAmplitude: 12,
        rms: 0.04,
      },
      {
        label: "system",
        status: makeSystemStatus(),
        sourceMode: "live",
        avgAmplitude: 5.5,
        rms: 0.018,
      },
    ];

    for (const { label, status, sourceMode, avgAmplitude, rms } of cases) {
      const featureState = createAudioFeatureState();
      const frame = buildAudioFeatureFrame({
        analysisSnapshot: createSnapshot({
          sourceMode,
          avgAmplitude,
          fftMagnitudes: makeFft(mixedPartials),
          rms,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: 0,
      });
      const { energyLedger } = frame;

      expect(frame.sourceEvidence.currentSourceEvidence, label).toBe(true);
      expect(energyLedger.sourceBoundaryState, label).toBe("live");
      expect(energyLedger.storedModalResonantEnergy, label).toBeGreaterThan(
        0.08,
      );
      expect(energyLedger.projectedResonantEnergy, label).toBeGreaterThan(
        energyLedger.storedModalResonantEnergy * 0.02,
      );
    }
  });

  it("keeps resonant projection alive through intense changing music", () => {
    function makeIntenseChangingMusicFft(frameIndex) {
      const fftMagnitudes = new Float32Array(BIN_COUNT);
      const roots = [74, 82, 92, 103];
      const root = roots[frameIndex % roots.length];
      for (const [frequency, amplitude] of [
        [root, 0.75 + 0.15 * Math.sin(frameIndex * 0.7)],
        [root * 2, 0.54],
        [root * 3, 0.35],
        [root * 4, 0.24],
      ]) {
        fftMagnitudes[freqToBin(frequency)] = amplitude;
      }

      const highs = [4200, 5100, 6200, 7600, 8800, 9800, 10800];
      for (let index = 0; index < highs.length; index += 1) {
        const frequency =
          highs[(index + frameIndex) % highs.length] *
          (1 + 0.015 * Math.sin(frameIndex + index));
        fftMagnitudes[freqToBin(frequency)] =
          0.11 + ((index + frameIndex) % 3 === 0 ? 0.12 : 0);
      }

      for (
        let bin = freqToBin(2600);
        bin < freqToBin(11500) && bin < BIN_COUNT;
        bin += 3
      ) {
        fftMagnitudes[bin] = Math.max(
          fftMagnitudes[bin],
          0.035 + ((bin + frameIndex) % 11) / 300,
        );
      }
      return fftMagnitudes;
    }
    const cases = [
      {
        label: "file",
        status: makeActiveStatus(),
        sourceMode: "file",
      },
      {
        label: "system",
        status: makeSystemStatus(),
        sourceMode: "live",
      },
    ];

    for (const { label, status, sourceMode } of cases) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex <= 3; frameIndex += 1) {
        frame = buildAudioFeatureFrame({
          analysisSnapshot: createSnapshot({
            sourceMode,
            avgAmplitude: 120,
            fftMagnitudes: makeIntenseChangingMusicFft(frameIndex),
            rms: 0.55,
          }),
          featureState,
          radius: 3,
          status,
          frameTimeMs: frameIndex * 33,
        });
      }

      expect(frame.sourceEvidence.currentSourceEvidence, label).toBe(true);
      expect(frame.renderAuthority, label).toBe(true);
      expect(frame.energyLedger.sourceBoundaryState, label).toBe("live");
      expect(frame.energyLedger.projectedResonantEnergy, label).toBeGreaterThan(
        0.003,
      );
      expect(frame.debug.resonantModeCount, label).toBeGreaterThan(0);
    }
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

    expect(frame.modalFieldSlots).toBeInstanceOf(Float32Array);
    expect(frame.modalFieldSlots).toBeInstanceOf(Float32Array);
    expect(frame.modalFieldMetadataSlots).toBeInstanceOf(Float32Array);
    expect(frame.referenceModeSlots).toBeInstanceOf(Float32Array);
    expect(frame.structureSignal).toBeGreaterThan(0);
    expect(frame.modeCoherence).toBeGreaterThan(0);
    expect(frame.debug.excitedModeCount).toBeGreaterThan(0);
    expect(frame.debug.modalPersistence).toBeGreaterThanOrEqual(0);
    expect(frame.debug.driveSource).toBe("time-domain");
  });

  it("uses modal response energy for low-band backbone without beat onset", () => {
    const featureState = createAudioFeatureState();
    const fftMagnitudes = makeFft([
      [92, 0.82],
      [184, 0.32],
      [427, 0.48],
    ]);
    const timeData = makeMixedTimeData({
      partials: [
        [92, 0.82],
        [184, 0.32],
        [427, 0.48],
      ],
      amplitudeScale: 0.11,
    });
    const snapshot = createSnapshot({
      sourceMode: "file",
      avgAmplitude: 2.2,
      fftMagnitudes,
      timeData,
      rms: 0.039,
      spectralFlux: 0.00018,
    });

    buildAudioFeatureFrame({
      analysisSnapshot: snapshot,
      featureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 0,
    });
    const frame = buildAudioFeatureFrame({
      analysisSnapshot: snapshot,
      featureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 33,
    });

    expect(frame.beatDetected).toBe(false);
    expect(frame.modalResponseEnergy).toBeCloseTo(
      frame.debug.modalResponseEnergy,
      12,
    );
    expect(frame.debug.modalResponseEnergy).toBeGreaterThan(0.08);
    expect(frame.observationEnergy).toBeGreaterThanOrEqual(
      frame.modalResponseEnergy,
    );
    expect(frame.debug.modalResponseModeCount).toBeGreaterThan(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.04);
    expect(frame.fieldState).toBe("active");
  });

  it("bounds composed detail replacement through continuity admissions", () => {
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
    const firstFrameResonantKeys = readModeKeys(firstFrame.modalFieldSlots);
    let frame = null;

    for (let frameIndex = 1; frameIndex <= 3; frameIndex += 1) {
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
    const switchedResonantKeys = readModeKeys(frame.modalFieldSlots);
    const newlyVisibleKeys = switchedResonantKeys.filter(
      (key) => !firstFrameResonantKeys.includes(key),
    );
    expect(
      newlyVisibleKeys.every((key) =>
        frame.modalFieldContinuity.admittedModeKeys.includes(key),
      ),
    ).toBe(true);
    expect(newlyVisibleKeys.length).toBeLessThanOrEqual(
      Math.ceil(frame.activeModalFieldModeCount * 0.4),
    );
    expect(frame.modalFieldContinuity.retainedModeKeys.length).toBeGreaterThan(
      0,
    );
  });

  it("reports unrepresentable line-feed detail as omitted tail topology", () => {
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

    buildAudioFeatureFrame({
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
    const switchedResonantKeys = readModeKeys(frame.modalFieldSlots);
    expect(frame.modalFieldContinuity.candidateModeCount).toBeGreaterThan(0);
    expect(frame.modalFieldContinuity.tailModeKeys.length).toBeGreaterThan(0);
    expect(
      frame.modalFieldContinuity.tailModeKeys.every(
        (key) => !switchedResonantKeys.includes(key),
      ),
    ).toBe(true);
    const diagnostics = frame.modalDescriptor.diagnostics;
    const maxRepresentableModeIndex = diagnostics.maxRepresentableModeIndex;
    expect(
      frame.modalFieldContinuity.tailModeKeys.some((key) =>
        key
          .split(":")
          .some(
            (coordinate) =>
              Math.abs(Number(coordinate)) > maxRepresentableModeIndex,
          ),
      ),
    ).toBe(true);
    expect(diagnostics.modalVarietyAudit.upstreamCandidateModeCount).toBe(
      frame.modalFieldContinuity.candidateModeCount,
    );
    expect(
      diagnostics.modalVarietyAudit.upstreamResonantModeCount,
    ).toBeGreaterThan(0);
    expect(frame.activeModalFieldModeCount).toBeLessThanOrEqual(
      diagnostics.basisAtlasPageCapacity,
    );
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

    expect(Array.from(sphericalRequestedFrame.modalFieldSlots)).toEqual(
      Array.from(rectangularFrame.modalFieldSlots),
    );
    expect(Array.from(sphericalRequestedFrame.modalFieldSlots)).toEqual(
      Array.from(rectangularFrame.modalFieldSlots),
    );
    expect(Array.from(sphericalRequestedFrame.modalFieldSlots)).toEqual(
      Array.from(rectangularFrame.modalFieldSlots),
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

    expect(
      sumSlotAmplitudes(silentResult.analysisResult.modeSlots),
    ).toBeGreaterThan(0);
    expect(
      sumSlotAmplitudes(silentResult.analysisResult.signalModeSlots),
    ).toBeGreaterThan(0);
    expect(
      silentResult.analysisResult.structuralMetrics.modalResponseRenderEnergy,
    ).toBeGreaterThan(0);
    expect(
      sumSlotAmplitudes(silentResult.frame.modalFieldSlots),
    ).toBeGreaterThan(0);
    expect(silentResult.frame.structureSignal).toBeLessThan(
      activeFrame.structureSignal * 0.65,
    );
    expect(silentResult.frame.changeSignal).toBeGreaterThanOrEqual(0);
  });

  it("keeps zero-input retained modal response diagnostic but removes field liveness", () => {
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
    let activeSourceCoupledAmplitude = 0;
    let activeResonantAmplitude = 0;

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
      activeSourceCoupledAmplitude = sumSlotAmplitudes(
        result.frame.modalFieldSlots,
      );
      activeResonantAmplitude = sumSlotAmplitudes(result.frame.modalFieldSlots);
    }

    for (let frameIndex = 10; frameIndex < 64; frameIndex += 1) {
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

    expect(silentResult.frame.fieldState).toBe("idle");
    expect(silentResult.frame.renderAuthority).toBe(false);
    expect(sumSlotAmplitudes(silentResult.analysisResult.signalModeSlots)).toBe(
      0,
    );
    const decayedSourceCoupledAmplitude = sumSlotAmplitudes(
      silentResult.frame.modalFieldSlots,
    );
    const decayedResonantAmplitude = sumSlotAmplitudes(
      silentResult.frame.modalFieldSlots,
    );
    expect(decayedSourceCoupledAmplitude + decayedResonantAmplitude).toBe(0);
    expect(
      silentResult.analysisResult.structuralMetrics.modalResponseEnergy,
    ).toBeGreaterThan(0);
    expect(
      silentResult.analysisResult.structuralMetrics.modalResponseRenderEnergy,
    ).toBe(0);
    expect(
      silentResult.analysisResult.structuralMetrics.energyLedger
        .sourceBoundaryState,
    ).toBe("muted");
    expect(
      silentResult.analysisResult.structuralMetrics.energyLedger
        .storedModalEnergy,
    ).toBeGreaterThan(0);
    expect(
      silentResult.analysisResult.structuralMetrics.energyLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expect(decayedSourceCoupledAmplitude).toBeLessThan(
      activeSourceCoupledAmplitude,
    );
    expect(decayedResonantAmplitude).toBeLessThan(activeResonantAmplitude);
  });

  it("treats paused file transport as zero forcing even when analyser data is stale", () => {
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
    let previousFrame = null;

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
    }

    const pausedResult = buildModalExcitationAnalysisFrame({
      featureState,
      fftMagnitudes: activeFft,
      timeData: activeTimeData,
      avgAmplitude: 120,
      rms: 0.52,
      frameTimeMs: 10 * 33,
      previousFrame,
      status: makeActiveStatus({ isPlaying: false }),
    });

    expect(
      pausedResult.analysisResult.structuralMetrics.modalResponseEnergy,
    ).toBeGreaterThan(0);
    expect(
      pausedResult.analysisResult.structuralMetrics.modalResponseRenderEnergy,
    ).toBe(0);
    expect(
      pausedResult.analysisResult.structuralMetrics.energyLedger
        .sourceBoundaryState,
    ).toBe("muted");
    expect(
      pausedResult.analysisResult.structuralMetrics.energyLedger
        .storedModalEnergy,
    ).toBeGreaterThan(0);
    expect(
      pausedResult.analysisResult.structuralMetrics.energyLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expectClosedSourceRenderFrame(pausedResult.frame);
    expect(pausedResult.analysisResult.avgAmplitude).toBe(0);
    expect(pausedResult.analysisResult.analyserRms).toBe(0);
    expect(pausedResult.analysisResult.preModalFftPeak).toBe(0);
    expect(pausedResult.frame.retainedModalCoefficientEnergy).toBe(0);
    expect(pausedResult.frame.modalCoefficientEnergy).toBe(0);
    expect(pausedResult.frame.fieldState).toBe("idle");
    expect(pausedResult.frame.hasModalField).toBe(false);
    expect(pausedResult.frame.observationEnergy).toBe(0);
    expect(pausedResult.frame.modalVisibilityEnergy).toBe(0);
  });

  it("cuts playing file analyser residue with no meter or spectrum", () => {
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
    let previousFrame = null;

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
    }

    const residueResult = buildModalExcitationAnalysisFrame({
      featureState,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: makeTimeData({
        frequency: 550,
        amplitude: 0.003,
      }),
      avgAmplitude: 0,
      rms: 0.002138553954931318,
      frameTimeMs: 10 * 33,
      previousFrame,
      status: makeActiveStatus(),
    });

    expect(
      residueResult.analysisResult.structuralMetrics.modalResponseEnergy,
    ).toBeGreaterThan(0);
    expect(
      residueResult.analysisResult.structuralMetrics.energyLedger
        .sourceBoundaryState,
    ).toBe("muted");
    expect(
      residueResult.analysisResult.structuralMetrics.energyLedger.sourceEnergy,
    ).toBe(0);
    expect(
      residueResult.analysisResult.structuralMetrics.energyLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expectClosedSourceRenderFrame(residueResult.frame);
    expect(residueResult.frame.fieldState).toBe("idle");
    expect(residueResult.frame.hasModalField).toBe(false);
    expect(residueResult.frame.observationEnergy).toBe(0);
    expect(residueResult.frame.modalVisibilityEnergy).toBe(0);
  });

  it("caps weak file residual display cache by modal energy instead of filling the volume", () => {
    const featureState = createAudioFeatureState();
    const activePartials = [
      [196, 0.9],
      [293, 0.76],
      [432, 0.7],
      [611, 0.58],
      [832, 0.5],
      [1180, 0.44],
      [1860, 0.36],
      [3100, 0.28],
    ];
    let previousFrame = null;

    for (let frameIndex = 0; frameIndex < 40; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: makeFft(activePartials),
        timeData: makeMixedTimeData({
          partials: activePartials,
          amplitudeScale: 0.82,
        }),
        avgAmplitude: 24,
        rms: 0.2,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
    }

    const residueResult = buildModalExcitationAnalysisFrame({
      featureState,
      fftMagnitudes: makeDenseFft({
        count: 92,
        amplitude: 0.004,
        peakFrequency: 427,
        peakAmplitude: 0.235,
      }),
      timeData: makeMixedTimeData({
        partials: activePartials,
        amplitudeScale: 0.02,
      }),
      avgAmplitude: 0.6605,
      rms: 0.010756,
      frameTimeMs: 40 * 33,
      previousFrame,
      status: makeActiveStatus(),
    });

    expect(residueResult.frame.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(residueResult.frame.energyLedger.sourceEnergy).toBeGreaterThan(0.2);
    expect(residueResult.frame.energyLedger.currentSignalAmplitude).toBe(0);
    expect(
      residueResult.analysisResult.structuralMetrics.currentSignalAmplitude,
    ).toBe(0);
    expect(residueResult.frame.energyLedger.projectedRenderEnergy).toBeCloseTo(
      residueResult.frame.energyLedger.storedModalEnergy,
      6,
    );
    expect(residueResult.frame.energyLedger.projectedRenderEnergy).toBeLessThan(
      0.01,
    );
    expect(residueResult.frame.modalVisibilityEnergy).toBeLessThanOrEqual(
      residueResult.frame.energyLedger.projectedRenderEnergy + 1e-9,
    );
    expect(residueResult.frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(residueResult.frame.fieldState).toBe("decay");
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
    expect(result.frame.debug.modalVisibilityActiveModeCount).toBeGreaterThan(
      4,
    );
    expect(result.frame.debug.projectionConservationApplied).toBeUndefined();
    expect(result.frame.debug.projectionEnergyNormalizationApplied).toBe(true);
    expect(result.frame.debug.projectionRawEnergyResonant).toBeGreaterThan(0);
    expect(
      result.frame.debug.projectionAllocatedEnergyResonant,
    ).toBeLessThanOrEqual(result.frame.debug.projectionEnergyBudgetResonant);
    expect(
      result.frame.debug.projectionEnergyScaleResonant,
    ).toBeLessThanOrEqual(1);
    expect(
      result.frame.debug.projectionOverlapPressureResonant,
    ).toBeGreaterThan(0);
    expect(result.frame.debug.projectionCompetitionReduction).toBeGreaterThan(
      0,
    );
    expect(result.frame.debug.projectionEnergyUsedResonant).toBeLessThanOrEqual(
      result.frame.debug.projectionEnergyBudgetResonant,
    );
    expect(result.frame.modalVisibilityEnergy).toBeLessThan(0.9);
    expect(result.frame.debug.modalVisibilityDominantEnergy).toBeLessThan(0.35);
    expect(
      result.frame.debug.modalVisibilityDominantClusterEnergy,
    ).toBeUndefined();
  });

  it("measures stale modal dominance dropping after a clear tonal switch", () => {
    const featureState = createAudioFeatureState();
    let previousFrame = null;
    let result = null;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      result = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: makeFft([
          [110, 0.92],
          [220, 0.7],
          [330, 0.46],
          [440, 0.24],
          [1760, 0.12],
        ]),
        timeData: makeTimeData({
          frequency: 110,
          amplitude: 0.42,
          harmonics: [
            [2, 0.12],
            [3, 0.06],
          ],
        }),
        avgAmplitude: 96,
        rms: 0.36,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
    }

    const sourceFingerprint = buildModalFingerprint(result.frame);
    let switchedResult = null;
    for (let frameIndex = 10; frameIndex < 16; frameIndex += 1) {
      switchedResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: makeFft([
          [831, 0.9],
          [1246, 0.66],
          [1662, 0.52],
          [2493, 0.34],
          [3324, 0.16],
        ]),
        timeData: makeTimeData({
          frequency: 831,
          amplitude: 0.42,
          harmonics: [
            [1.5, 0.1],
            [2, 0.08],
            [3, 0.04],
          ],
        }),
        avgAmplitude: 104,
        rms: 0.38,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = switchedResult.frame;
    }

    const switchedFingerprint = buildModalFingerprint(switchedResult.frame);
    expect(
      measureStaleModalDominance(sourceFingerprint, switchedFingerprint),
    ).toBeLessThan(0.65);
  });

  it("measures modal continuity for stable coherent input and clearance on silence", () => {
    const featureState = createAudioFeatureState();
    let previousFrame = null;
    let sourceFrame = null;
    let sustainedFrame = null;

    for (let frameIndex = 0; frameIndex < 16; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: makeFft([
          [196, 0.72],
          [392, 0.48],
          [588, 0.28],
          [1176, 0.16],
        ]),
        timeData: makeTimeData({
          frequency: 196,
          amplitude: 0.34,
          harmonics: [
            [2, 0.12],
            [3, 0.06],
          ],
        }),
        avgAmplitude: 76,
        rms: 0.28,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
      if (frameIndex === 5) {
        sourceFrame = result.frame;
      }
      sustainedFrame = result.frame;
    }

    const sourceFingerprint = buildModalFingerprint(sourceFrame);
    const sustainedFingerprint = buildModalFingerprint(sustainedFrame);

    expect(
      measureModalFingerprintRetention(sourceFingerprint, sustainedFingerprint),
    ).toBeGreaterThan(0.62);

    let silentResult = null;
    for (let frameIndex = 16; frameIndex < 32; frameIndex += 1) {
      silentResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftMagnitudes: makeFft([]),
        timeData: new Float32Array(FFT_SIZE),
        avgAmplitude: 0,
        rms: 0,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = silentResult.frame;
    }

    expect(
      buildModalFingerprint(silentResult.frame).totalAmplitude,
    ).toBeLessThan(sustainedFingerprint.totalAmplitude * 0.6);
  });
});
