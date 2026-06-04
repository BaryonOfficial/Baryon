import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import {
  createAudioFeatureState,
  prepareAudioFeatureFrameInputs,
  updateAudioFeatureFastSignalState,
} from "../audioFeatures.js";
import {
  buildModalExcitationStructuralState,
  computeDrivePeriodicity,
  createModalExcitationState,
  getAtlasCacheSize,
} from "./modalExcitation.js";
import {
  createBassHatFixture,
  createBroadbandNoiseFixture,
  createMajorTriadFixture,
  createSineToneFixture,
  createVocalLikeFixture,
} from "./audioFixtures.js";
import { MODAL_BASIS_ATLAS_PAGE_CAPACITY } from "../../core/modalBudgets.js";
import { frequencyToBinIndex } from "./binFrequency.js";
import { getPhaseVelocityLimit } from "./modalPhaseSlots.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const MODAL_EXCITATION_SOURCE_URL = new URL(
  "./modalExcitation.js",
  import.meta.url,
);
const MODAL_OBSERVED_SCORING_SOURCE_URL = new URL(
  "./modalObservedScoring.js",
  import.meta.url,
);

function readModalExcitationSource() {
  return readFileSync(MODAL_EXCITATION_SOURCE_URL, { encoding: "utf8" });
}

function readModalObservedScoringSource() {
  return readFileSync(MODAL_OBSERVED_SCORING_SOURCE_URL, { encoding: "utf8" });
}

function expectModalHelperBoundary({ helperPath, localFunctions }) {
  const source = readModalExcitationSource();

  expect(source).toContain(`} from "${helperPath}";`);
  for (const localFunction of localFunctions) {
    expect(source).not.toContain(`function ${localFunction}`);
  }
}

function extractModalExcitationFunctionSource(functionName) {
  const source = readModalExcitationSource();
  const start = source.indexOf(`function ${functionName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const paramsStart = source.indexOf("(", start);
  expect(paramsStart).toBeGreaterThan(start);

  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      paramsDepth += 1;
    } else if (char === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  expect(bodyStart).toBeGreaterThan(start);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unable to extract function source for ${functionName}`);
}

it("keeps phase-slot derivation in the modal phase slot helper", () => {
  expectModalHelperBoundary({
    helperPath: "./modalPhaseSlots.js",
    localFunctions: [
      "writePhaseSlotsForVisibleModes",
      "findModalPhaseEntryForSlot",
    ],
  });
});

it("keeps stale-detail override policy in the modal stale detail helper", () => {
  expectModalHelperBoundary({
    helperPath: "./modalStaleResonant.js",
    localFunctions: [
      "buildStaleResonantReleaseOverrides",
      "computeStaleResonantPressure",
      "buildStaleResonantTrackingOverrides",
    ],
  });
});

it("keeps projection energy normalization in the modal projection helper", () => {
  expectModalHelperBoundary({
    helperPath: "./modalProjectionNormalization.js",
    localFunctions: [
      "createEmptyProjectionNormalizationMetrics",
      "applyProjectionEnergyNormalization",
      "mergeProjectionNormalizationMetrics",
    ],
  });
});

it("keeps observed-mode scoring in the modal observed scoring helper", () => {
  expectModalHelperBoundary({
    helperPath: "./modalObservedScoring.js",
    localFunctions: [
      "classifyObservedModeQProfile",
      "computeModalObserverNoiseFloor",
      "computeModalObservation",
      "isHighQHarmonicDriverFrequency",
      "getResonantHarmonicCoupling",
    ],
  });
});

it("keeps retained display continuity out of canonical observed modal state", () => {
  const source = extractModalExcitationFunctionSource(
    "createObservedModalModeEntry",
  );

  expect(source).not.toContain("driveEnergy: Math.max");
  expect(source).not.toContain("coherence: Math.max");
  expect(source).not.toContain("persistence: Math.max");
  expect(source).not.toContain("resonantMaturity: isResonant");
  expect(source).toContain("driveEnergy,");
  expect(source).toContain("coherence,");
  expect(source).toContain("persistence,");
  expect(source).toContain("resonantMaturity,");
  expect(source).toContain("displayContinuityDriveEnergy,");
  expect(source).toContain("displayContinuityCoherence,");
  expect(source).toContain("displayContinuityPersistence,");
  expect(source).toContain("resonantDisplayContinuityMaturity,");
});

it("keeps high-Q sparse evidence out of topology ownership", () => {
  const source = extractModalExcitationFunctionSource(
    "deriveHighQTopologySignal",
  );

  expect(source).not.toContain("highQSparseResonatorEvidence");
  expect(source).toContain("highQResonantEnergy");
  expect(source).toContain("highQRingSupport");
  expect(source).toContain("highQObservedDrive");
  expect(source).toContain("highQObservedCoherence");
});

it("keeps display continuity support on projection and display paths only", () => {
  const signalScoreSource =
    extractModalExcitationFunctionSource("getSignalScore");
  const displayScoreSource =
    extractModalExcitationFunctionSource("getDisplayScore");
  const projectionShortlistSource = extractModalExcitationFunctionSource(
    "buildProjectionShortlist",
  );

  expect(signalScoreSource).toContain("getDisplayContinuityDriveEnergy");
  expect(signalScoreSource).toContain("getDisplayContinuityCoherence");
  expect(displayScoreSource).toContain("getDisplayContinuityDriveEnergy");
  expect(displayScoreSource).toContain("getDisplayContinuityCoherence");
  expect(projectionShortlistSource).toContain("getDisplayContinuityCoherence");
});

it("keeps projection shortlist scores out of semantic modal candidate energy", () => {
  const projectionShortlistSource = extractModalExcitationFunctionSource(
    "buildProjectionShortlist",
  );
  const modalCandidateSource = extractModalExcitationFunctionSource(
    "buildModalCandidateList",
  );

  expect(projectionShortlistSource).toContain("displayProjectionAmplitude");
  expect(projectionShortlistSource).not.toContain("signalAmplitude");
  expect(modalCandidateSource).not.toContain("displayProjectionAmplitude");
  expect(modalCandidateSource).toContain("storedEnergy");
  expect(modalCandidateSource).toContain("forcingEnergy");
  expect(modalCandidateSource).toContain("observedSupport");
});

it("keeps file weak-noise policy owned by source evidence", () => {
  const modalExcitationSource = readModalExcitationSource();
  const observedScoringSource = readModalObservedScoringSource();

  expect(modalExcitationSource).not.toContain("weakFile");
  expect(modalExcitationSource).not.toContain('analysisClass === "file"');
  expect(observedScoringSource).not.toContain("avgAmplitude < 10");
  expect(observedScoringSource).not.toContain("analyserRms < 0.025");
  expect(observedScoringSource).toContain(
    "sourceBoundarySuppressWeakSpectralFallbackDrive",
  );
});

function createStatus(overrides = {}) {
  return {
    audioInputMode: "file",
    analysisSource: "file",
    pitchSourceMode: "spectral",
    fftSize: FFT_SIZE,
    capacity: 16,
    sampleRate: SAMPLE_RATE,
    isAudioLoaded: true,
    isPlaying: true,
    isLiveInputActive: false,
    hasAnalysisSource: true,
    liveInputCalibrationVersion: 0,
    ...overrides,
  };
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    const bin = Math.max(
      1,
      frequencyToBinIndex(frequency, BIN_COUNT, SAMPLE_RATE),
    );
    fft[bin] = amplitude;
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
  fft[Math.max(1, frequencyToBinIndex(peakFrequency, BIN_COUNT, SAMPLE_RATE))] =
    peakAmplitude;
  return fft;
}

function makeTimeData({
  frequency,
  amplitude = 0.45,
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
}) {
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    timeData[index] =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
  }
  return timeData;
}

function getRelativeFrequencyDistance(leftHz, rightHz) {
  const safeLeft = Math.max(leftHz ?? 0, 1e-6);
  const safeRight = Math.max(rightHz ?? 0, 1e-6);
  return Math.abs(safeLeft - safeRight) / Math.max(safeLeft, safeRight);
}

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

function makeNoisyPeriodicTimeData({
  frequency,
  amplitude = 0.006,
  noiseAmplitude = 0.003,
  seed = 123,
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
}) {
  const random = createDeterministicRandom(seed);
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    timeData[index] =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude +
      (random() * 2 - 1) * noiseAmplitude;
  }
  return timeData;
}

function createPreparedInputs({
  frameTimeMs,
  fftMagnitudes,
  timeData,
  status = createStatus(),
  cavityGeometry = "rectangular",
  cavityAcousticScale = undefined,
  boundaryMode = undefined,
  avgAmplitude = 24,
  rms = 0.2,
  radius = 3,
  featureState = createAudioFeatureState(status.capacity),
  includeSpectralLight = true,
  auditSettings = undefined,
}) {
  return prepareAudioFeatureFrameInputs({
    featureState,
    analysisSnapshot: {
      sourceMode: "file",
      avgAmplitude,
      fftMagnitudes,
      timeData,
      rms,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
    },
    radius,
    cavityGeometry,
    cavityAcousticScale,
    boundaryMode,
    status,
    frameTimeMs,
    includeSpectralLight,
    auditSettings,
  });
}

it("builds the modal excitation atlas from acoustic scale, not visual radius", () => {
  const preparedInputs = createPreparedInputs({
    frameTimeMs: 16,
    fftMagnitudes: makeFft([[60, 0.9]]),
    timeData: makeTimeData({ frequency: 60, amplitude: 0.5 }),
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: "neumann",
    radius: 3,
  });
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  const state = createModalExcitationState(preparedInputs.capacity);
  buildModalExcitationStructuralState({
    preparedInputs,
    fastSignalState,
    existingState: state,
  });
  const floorEntry = state.atlasEntries.find(
    (entry) => entry.u === 0 && entry.v === 0 && entry.w === 1,
  );

  expect(floorEntry?.naturalFrequencyHz).toBeCloseTo(59.2, 1);
  expect(state.atlasCacheKey).toContain("12.500");
});

it("bounds modal oscillator velocities before phase-slot upload", () => {
  const state = createModalExcitationState(16);
  const preparedInputs = createPreparedInputs({
    frameTimeMs: 33,
    fftMagnitudes: makeFft([[440, 1]]),
    timeData: makeTimeData({ frequency: 440, amplitude: 0.65 }),
    radius: 3,
  });
  preparedInputs.modalExcitationState = state;
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  const structural = buildModalExcitationStructuralState({
    preparedInputs,
    fastSignalState,
    existingState: state,
    performanceNow: () => 33,
  });
  const velocities = [
    ...readPhaseSlotVelocities(structural.sourceCoupledPhaseSlotsSource),
    ...readPhaseSlotVelocities(structural.resonantPhaseSlotsSource),
  ];
  const oscillatorEntries = Array.from(
    state.activeModes?.values?.() ?? [],
  ).filter((entry) => Number.isFinite(entry.modalOscillatorPhaseRad));
  const renderPhaseLimit = Math.max(
    getPhaseVelocityLimit("source-coupled"),
    getPhaseVelocityLimit("resonant"),
  );

  expect(velocities.length).toBeGreaterThan(0);
  expect(
    velocities.every((velocity) => Math.abs(velocity) <= renderPhaseLimit),
  ).toBe(true);
  expect(velocities.some((velocity) => Math.abs(velocity) > 100)).toBe(false);
  expect(oscillatorEntries.length).toBeGreaterThan(0);
  for (const entry of oscillatorEntries) {
    expect(entry.modalOscillatorPhaseObservedAtSec).toBeCloseTo(0.033);
  }
});

function cloneSlots(slots) {
  return new Float32Array(slots);
}

function computeAmplitudeDelta(currentSlots, previousSlots) {
  const slotCount = Math.min(
    Math.floor((currentSlots?.length ?? 0) / 4),
    Math.floor((previousSlots?.length ?? 0) / 4),
  );
  let totalDelta = 0;
  for (let index = 0; index < slotCount; index += 1) {
    totalDelta += Math.abs(
      (currentSlots[index * 4 + 3] ?? 0) - (previousSlots[index * 4 + 3] ?? 0),
    );
  }
  return totalDelta;
}

function sumAmplitudes(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    total += slots[index * 4 + 3] ?? 0;
  }
  return total;
}

function sumSquaredAmplitudes(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const amplitude = slots[index * 4 + 3] ?? 0;
    total += amplitude * amplitude;
  }
  return total;
}

function computeTopModalEnergyCoverage(slots, retainedSlotCount) {
  const energies = [];
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  for (let index = 0; index < slotCount; index += 1) {
    const amplitude = slots[index * 4 + 3] ?? 0;
    if (amplitude > 0) {
      energies.push(amplitude * amplitude);
    }
  }
  const totalEnergy = energies.reduce((total, energy) => total + energy, 0);
  if (!(totalEnergy > 0)) {
    return 1;
  }
  energies.sort((left, right) => right - left);
  const retainedEnergy = energies
    .slice(0, Math.max(0, Math.round(retainedSlotCount || 0)))
    .reduce((total, energy) => total + energy, 0);
  return retainedEnergy / totalEnergy;
}

function readPhaseSlotVelocities(slots) {
  const velocities = [];
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4;
    if ((slots[offset + 3] ?? 0) > 0) {
      velocities.push(slots[offset + 1] ?? 0);
    }
  }
  return velocities;
}

function countActiveSlotsLocal(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) > 0) {
      total += 1;
    }
  }
  return total;
}

function countSlotsAboveAmplitude(slots, minimumAmplitude) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) > minimumAmplitude) {
      total += 1;
    }
  }
  return total;
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

function readModeKeys(slots) {
  const keys = [];
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) <= 0) {
      continue;
    }
    keys.push(
      `${slots[index * 4]}:${slots[index * 4 + 1]}:${slots[index * 4 + 2]}`,
    );
  }
  return keys;
}

function hasNewModeKey(nextKeys, previousKeys) {
  return nextKeys.some((key) => !previousKeys.includes(key));
}

function readModeAmplitudeMap(slots) {
  const amplitudes = new Map();
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  for (let index = 0; index < slotCount; index += 1) {
    const amplitude = slots[index * 4 + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    amplitudes.set(
      `${slots[index * 4]}:${slots[index * 4 + 1]}:${slots[index * 4 + 2]}`,
      amplitude,
    );
  }
  return amplitudes;
}

function sumSharedModeAmplitudes(reference, candidate) {
  let total = 0;
  for (const [modeKey, amplitude] of candidate) {
    if (reference.has(modeKey)) {
      total += amplitude;
    }
  }
  return total;
}

function sumModeAmplitudeMap(amplitudes) {
  let total = 0;
  for (const amplitude of amplitudes.values()) {
    total += amplitude;
  }
  return total;
}

function measureSharedAmplitudeRatio(reference, candidate) {
  return (
    sumSharedModeAmplitudes(reference, candidate) /
    Math.max(sumModeAmplitudeMap(candidate), 1e-9)
  );
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

const RESONANT_SUSTAIN_PARTIALS = Object.freeze([
  [196, 0.2],
  [293, 0.17],
  [432, 0.15],
  [611, 0.13],
  [832, 0.11],
  [1180, 0.1],
  [1860, 0.08],
  [3100, 0.06],
  [5200, 0.05],
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

function runModalFrame({
  state,
  featureState,
  capacity = 16,
  frame,
  partials,
  avgAmplitude,
  rms,
  amplitudeScale,
  performanceNow = () => frame,
}) {
  const inputs = createPreparedInputs({
    frameTimeMs: frame * 33,
    fftMagnitudes: makeFft(partials),
    timeData: makeMixedTimeData({
      partials,
      amplitudeScale,
    }),
    featureState,
    status: createStatus({ capacity }),
    avgAmplitude,
    rms,
  });
  inputs.modalExcitationState = state;
  const fastSignal = updateAudioFeatureFastSignalState(inputs);
  return buildModalExcitationStructuralState({
    preparedInputs: inputs,
    fastSignalState: fastSignal,
    existingState: state,
    performanceNow,
  });
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function createDeterministicRandom(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const REMOVED_MODAL_OBSERVER_AUTHORITY_FIELDS = [
  "highQResonantModes",
  "highQObservedModes",
  "coherentSourceCoupledTailMemory",
  "coherentSourceCoupledTailSeeded",
  "coherentSourceCoupledTailModes",
  "coherentResonantTailMemory",
  "coherentResonantTailSeeded",
  "coherentResonantTailModes",
  "resonantTailPresence",
  "observedHardSilenceGraceActive",
  "observedHardSilenceAgeMs",
];

const REMOVED_MODAL_OBSERVER_ENTRY_FIELDS = [
  "seededAtMs",
  "lastSupportedAtMs",
  "highQObserved",
  "retainedSustainedResonant",
  "retainedSubtleSustainedResonant",
  "retainedSustainedResonantPresence",
  "retainedSustainedSourceCoupled",
  "retainedSustainedSourceCoupledPresence",
];

function expectLegacyModalObserverAuthoritiesRemoved(state) {
  for (const field of REMOVED_MODAL_OBSERVER_AUTHORITY_FIELDS) {
    expect(state[field]).toBeUndefined();
  }
}

function expectCanonicalObservedModeEntries(state) {
  for (const entry of state.observedModes?.values?.() ?? []) {
    expect(entry).toMatchObject({
      observedModal: true,
      renderLayer: expect.stringMatching(/^(source-coupled|resonant)$/),
      qualityFactor: expect.any(Number),
      firstObservedAtMs: expect.any(Number),
      lastObservedAtMs: expect.any(Number),
      phaseOffsetRad: expect.any(Number),
      phaseVelocityRadPerSec: expect.any(Number),
      phaseCoherence: expect.any(Number),
      phaseAuthority: expect.any(Number),
    });
    for (const field of REMOVED_MODAL_OBSERVER_ENTRY_FIELDS) {
      expect(entry[field]).toBeUndefined();
    }
  }
}

function expectObservedDisplayContinuityEntries(state) {
  const continuityEntries = Array.from(
    state.observedModes?.values?.() ?? [],
  ).filter(
    (entry) =>
      entry.resonantDisplayContinuity === true ||
      entry.sourceCoupledDisplayContinuity === true,
  );

  expect(continuityEntries.length).toBeGreaterThan(0);
  for (const entry of continuityEntries) {
    expect(entry.displayContinuityDriveEnergy).toBeGreaterThanOrEqual(0);
    expect(entry.displayContinuityCoherence).toBeGreaterThanOrEqual(0);
    expect(entry.displayContinuityPersistence).toBeGreaterThanOrEqual(0);
    if (entry.resonantDisplayContinuity === true) {
      expect(entry.resonantDisplayContinuityMaturity).toBeGreaterThanOrEqual(0);
      expect(entry.resonantDisplayContinuityPresence).toBeGreaterThanOrEqual(0);
    }
    if (entry.sourceCoupledDisplayContinuity === true) {
      expect(
        entry.sourceCoupledDisplayContinuityPresence,
      ).toBeGreaterThanOrEqual(0);
    }
  }
}

describe("modal excitation structural state", () => {
  let lineFeedProgramFeatureState = null;

  function isLineFeedPreparedStatus(status = {}) {
    const inputMode = status.audioInputMode ?? "file";
    return (
      inputMode === "system" ||
      (inputMode === "live" &&
        (status.resolvedLiveInputAnalysisClass === "line-feed" ||
          status.liveInputDeviceKind === "system"))
    );
  }

  function createLineFeedPreparedInputs(options) {
    const status = options.status ?? createStatus();
    if (!options.featureState && isLineFeedPreparedStatus(status)) {
      if (!lineFeedProgramFeatureState) {
        lineFeedProgramFeatureState = createAudioFeatureState(status.capacity);
      }
      return createPreparedInputs({
        ...options,
        status,
        featureState: lineFeedProgramFeatureState,
      });
    }

    return createPreparedInputs(options);
  }

  function collectWeightedColorSlots(slots, minWeight = 0.05) {
    const colors = [];
    for (let offset = 0; offset < slots.length; offset += 4) {
      const weight = slots[offset + 3] ?? 0;
      if (weight < minWeight) {
        continue;
      }
      colors.push({
        r: slots[offset] ?? 0,
        g: slots[offset + 1] ?? 0,
        b: slots[offset + 2] ?? 0,
        weight,
      });
    }
    return colors;
  }

  function maxColorDistance(colors) {
    let maxDistance = 0;
    for (let left = 0; left < colors.length; left += 1) {
      for (let right = left + 1; right < colors.length; right += 1) {
        maxDistance = Math.max(
          maxDistance,
          Math.hypot(
            colors[left].r - colors[right].r,
            colors[left].g - colors[right].g,
            colors[left].b - colors[right].b,
          ),
        );
      }
    }
    return maxDistance;
  }

  beforeEach(() => {
    lineFeedProgramFeatureState = null;
  });
  it("initializes one canonical modal observer state", () => {
    const state = createModalExcitationState(16);

    expect(state.observedModes).toBeInstanceOf(Map);
    expect(state.sourceCoupledProposal?.slots).toBeInstanceOf(Float32Array);
    expect(state.resonantProposal?.slots).toBeInstanceOf(Float32Array);
    expect(state.sourceCoupled).toBeUndefined();
    expect(state.resonant).toBeUndefined();
    expectLegacyModalObserverAuthoritiesRemoved(state);
  });

  it("builds persistent backbone structure for stable low-order input", () => {
    const baseState = createModalExcitationState(16);
    const firstInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [550, 0.95],
        [1100, 0.5],
      ]),
      timeData: makeTimeData({ frequency: 550 }),
    });
    const firstFastSignal = updateAudioFeatureFastSignalState(firstInputs);
    const firstStructural = buildModalExcitationStructuralState({
      preparedInputs: firstInputs,
      fastSignalState: firstFastSignal,
      existingState: baseState,
      performanceNow: () => 0,
    });

    const secondInputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [550, 0.95],
        [1100, 0.52],
      ]),
      timeData: makeTimeData({ frequency: 550 }),
    });
    secondInputs.modalExcitationState = baseState;
    const secondFastSignal = updateAudioFeatureFastSignalState(secondInputs);
    const secondStructural = buildModalExcitationStructuralState({
      preparedInputs: secondInputs,
      fastSignalState: secondFastSignal,
      existingState: baseState,
      performanceNow: () => 1,
    });

    expect(firstStructural.activeSourceCoupledModeCount).toBeGreaterThan(0);
    expect(secondStructural.activeSourceCoupledModeCount).toBeGreaterThan(0);
    expect(secondStructural.structuralMetrics.modalPersistence).toBeGreaterThan(
      0.03,
    );
    expect(secondStructural.structuralMetrics.modeCoherence).toBeGreaterThan(0);
    expect(secondStructural.structuralMetrics.driveSource).toBe("time-domain");
  });

  it("observes low-Q backbone modes as the same retained modal state", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 96; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [
          [550, 0.95],
          [1100, 0.52],
        ],
        avgAmplitude: 24,
        rms: 0.2,
        amplitudeScale: 0.45,
      });
    }

    expect(state.observedModes?.size ?? 0).toBeGreaterThan(0);
    expect(
      Array.from(state.observedModes?.values?.() ?? []).some(
        (entry) => entry.layer === "source-coupled",
      ),
    ).toBe(true);
    expect(structural.structuralMetrics.observedModalModeCount).toBeGreaterThan(
      0,
    );
    expect(
      structural.structuralMetrics.lowQSourceCoupledModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.lowQSourceCoupledEnergy,
    ).toBeGreaterThan(0);
    expect(structural.structuralMetrics.lowQObservedCoherence).toBeGreaterThan(
      0,
    );
    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0);
    expectCanonicalObservedModeEntries(state);
  });

  it("does not retain topology from activeModes without observer authority", () => {
    const state = createModalExcitationState(16);
    state.activeModes.set("1:1:1", {
      modeKey: "1:1:1",
      familyId: "family:1:1:1",
      u: 1,
      v: 1,
      w: 1,
      layer: "source-coupled",
      renderLayer: "source-coupled",
      qualityFactor: 4,
      naturalFrequencyHz: 220,
      order: 3,
      driveWeight: 1,
      decayTauMs: 320,
      amplitude: 0.95,
      currentDriveEnergy: 0,
      driveEnergy: 0,
      coherence: 0.95,
      persistence: 0.95,
      phase: 0,
      lastExcitedAtMs: 0,
      ageMs: 300,
    });
    state.observedModes.clear();

    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 333,
      fftMagnitudes: makeFft([[880, 0.02]]),
      timeData: makeTimeData({ frequency: 880, amplitude: 0.012 }),
      avgAmplitude: 4,
      rms: 0.012,
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    expect(readModeKeys(structural.candidateForcingSlotsSource)).not.toContain(
      "1:1:1",
    );
    expect(readModeKeys(structural.candidateResponseSlotsSource)).not.toContain(
      "1:1:1",
    );
  });

  it("keeps retained modal response diagnostic without render slots on strict hard silence", () => {
    const state = createModalExcitationState(16);
    state.activeModes.set("1:1:1", {
      modeKey: "1:1:1",
      familyId: "family:1:1:1",
      u: 1,
      v: 1,
      w: 1,
      layer: "source-coupled",
      renderLayer: "source-coupled",
      qualityFactor: 4,
      naturalFrequencyHz: 220,
      order: 3,
      driveWeight: 1,
      decayTauMs: 320,
      amplitude: 0.18,
      modalResponseEnergy: 0.18,
      modalResponseDisplayAmplitude: 0.18,
      currentDriveEnergy: 0,
      driveEnergy: 0,
      coherence: 0.95,
      persistence: 0.95,
      phase: 0,
      lastExcitedAtMs: 0,
      ageMs: 300,
    });
    state.observedModes.clear();

    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: new Float32Array(FFT_SIZE),
      avgAmplitude: 0,
      rms: 0,
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    expect(structural.structuralMetrics.observedModalModeCount).toBe(0);
    expect(structural.structuralMetrics.modalResponseEnergy).toBeGreaterThan(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBe(0);
    expect(sumAmplitudes(structural.candidateForcingSlotsSource)).toBe(0);
  });

  it("keeps retained modal energy diagnostic-only on the first zero-input frame", () => {
    const state = createModalExcitationState(16);
    const activeInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [220, 0.8],
        [440, 0.35],
      ]),
      timeData: makeTimeData({ frequency: 220, amplitude: 0.45 }),
      avgAmplitude: 32,
      rms: 0.18,
    });
    activeInputs.modalExcitationState = state;
    buildModalExcitationStructuralState({
      preparedInputs: activeInputs,
      fastSignalState: updateAudioFeatureFastSignalState(activeInputs),
      existingState: state,
      performanceNow: () => 0,
    });

    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: new Float32Array(FFT_SIZE),
      avgAmplitude: 0,
      rms: 0,
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .storedModalEnergy,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .renderBoundaryState,
    ).toBe("muted");
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBe(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
    );
    expect(sumAmplitudes(structural.candidateForcingSlotsSource)).toBe(0);
  });

  it("retains low-frequency coherent high-Q modes through observer authority", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 160; frame += 1) {
      const strike = frame < 2;
      const amplitudeScale = strike ? 0.42 : 0.045;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [196, strike ? 0.8 : 0.08],
          [392, strike ? 0.4 : 0.035],
          [588, strike ? 0.22 : 0.018],
        ]),
        timeData: makeMixedTimeData({
          partials: [
            [196, 0.8],
            [392, 0.26],
            [588, 0.12],
          ],
          amplitudeScale,
        }),
        avgAmplitude: strike ? 36 : 1.8,
        rms: strike ? 0.22 : 0.006,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const observedRetainedResonators = Array.from(
      state.observedModes?.values?.() ?? [],
    ).filter((entry) => entry.renderLayer === "resonant");
    expect(observedRetainedResonators.length).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.001);
    expect(structural.structuralMetrics.observedModalModeCount).toBeGreaterThan(
      0,
    );
    expectCanonicalObservedModeEntries(state);
  });

  it("publishes one modal candidate list and state map for current and retained evidence", () => {
    const state = createModalExcitationState(16);
    const structural = runModalFrame({
      state,
      frame: 12,
      partials: [
        [110, 0.8],
        [220, 0.62],
        [880, 0.48],
        [1760, 0.36],
        [3520, 0.28],
      ],
      avgAmplitude: 32,
      rms: 0.18,
      amplitudeScale: 0.42,
    });

    expect(structural.modalCandidates.length).toBeGreaterThan(0);
    expect(state.modalCandidateState).toBeInstanceOf(Map);
    expect(state.modalCandidateState.size).toBe(
      structural.modalCandidates.length,
    );
    for (const candidate of structural.modalCandidates) {
      expect(candidate).toMatchObject({
        modeKey: expect.any(String),
        naturalFrequencyHz: expect.any(Number),
        qualityFactor: expect.any(Number),
        dampingRatio: expect.any(Number),
        forcingEnergy: expect.any(Number),
        storedEnergy: expect.any(Number),
        observedSupport: expect.any(Number),
        projectionWeight: expect.any(Number),
        rejectionReasons: expect.any(Array),
      });
      expect(state.modalCandidateState.get(candidate.modeKey)).toBe(candidate);
    }
  });

  it("reports canonical Spectral Light components for modal-excitation color", () => {
    const baseState = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [440, 0.98],
        [880, 0.42],
      ]),
      timeData: makeTimeData({ frequency: 440 }),
    });
    const fastSignal = updateAudioFeatureFastSignalState(preparedInputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState: fastSignal,
      existingState: baseState,
    });

    const component =
      structural.sourceCoupledStateSource.spectralLightComponents[0] ??
      structural.resonantStateSource.spectralLightComponents[0];

    expect(component).toMatchObject({
      frequency: expect.any(Number),
      familyFrequency: expect.any(Number),
      phase: expect.any(Number),
      wavelengthNm: expect.any(Number),
      weight: expect.any(Number),
      color: {
        r: expect.any(Number),
        g: expect.any(Number),
        b: expect.any(Number),
      },
    });
    expect(component.phase).toBeGreaterThanOrEqual(0);
    expect(component.phase).toBeLessThan(1);
    expect(component.wavelengthNm).toBeGreaterThanOrEqual(380);
    expect(component.wavelengthNm).toBeLessThanOrEqual(780);
    expect(component).not.toHaveProperty("pitchClass");
  });

  it("keeps tone and chord fixtures stable in display and color slots", () => {
    const fixtures = [
      createSineToneFixture(220),
      createSineToneFixture(440),
      createSineToneFixture(660),
      createMajorTriadFixture(261.626),
      createBassHatFixture(),
      createVocalLikeFixture(220),
      createBroadbandNoiseFixture(),
    ];

    for (const [index, fixture] of fixtures.entries()) {
      const state = createModalExcitationState(16);
      const preparedInputs = createLineFeedPreparedInputs({
        frameTimeMs: index * 33,
        fftMagnitudes: fixture.fftMagnitudes,
        timeData: fixture.timeData,
        avgAmplitude: index === fixtures.length - 1 ? 12 : 32,
        rms: index === fixtures.length - 1 ? 0.08 : 0.24,
      });
      preparedInputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(preparedInputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => index,
      });

      expect(structural.candidateForcingSlotsSource.length).toBeGreaterThan(0);
      expect(structural.candidateResponseSlotsSource.length).toBeGreaterThan(0);
      expect(structural.sourceCoupledColorSlotsSource?.length).toBe(
        structural.candidateForcingSlotsSource.length,
      );
      expect(structural.resonantColorSlotsSource?.length).toBe(
        structural.candidateResponseSlotsSource.length,
      );
    }
  });

  it("keeps Spectral Light independent from key-relative pitch tint", () => {
    const featureState = createAudioFeatureState();
    featureState.analysis.chromaState.keyTonic = 7;
    featureState.analysis.chromaState.keyMode = "major";
    featureState.analysis.chromaState.keyConfidence = 1;
    const state = createModalExcitationState(16);
    const fixture = createMajorTriadFixture(261.626);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: fixture.fftMagnitudes,
      timeData: fixture.timeData,
      featureState,
    });
    preparedInputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(preparedInputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });

    const components = [
      ...structural.sourceCoupledStateSource.spectralLightComponents,
      ...structural.resonantStateSource.spectralLightComponents,
    ].filter((component) => component.weight > 0);

    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      expect(component).not.toHaveProperty("keyTonic");
      expect(component).not.toHaveProperty("keyMode");
      expect(component).not.toHaveProperty("keyConfidence");
      expect(component).not.toHaveProperty("hue");
      expect(component.phase).toBeGreaterThanOrEqual(0);
      expect(component.wavelengthNm).toBeGreaterThanOrEqual(380);
    }
  });

  it("keeps injected-tone Spectral Light colors owned by modal frequencies", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: null,
      auditSettings: {
        injectTestTone: true,
        testToneHz: 330,
        testToneAmplitude: 0.5,
        freezeModeSlots: false,
        enabled: false,
      },
    });
    preparedInputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(preparedInputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });

    const colors = collectWeightedColorSlots(
      structural.sourceCoupledColorSlotsSource,
    ).concat(collectWeightedColorSlots(structural.resonantColorSlotsSource));

    expect(colors.length).toBeGreaterThanOrEqual(3);
    expect(maxColorDistance(colors)).toBeGreaterThan(0.25);
  });

  it("clears stale blended colors when Spectral Light turns back on", () => {
    const state = createModalExcitationState(16);
    state.blendSourceCoupled.slots.set([8, 8, 8, 0.5]);
    state.blendSourceCoupled.colorSlots.set([0, 1, 0, 0.9]);

    const fixture = createSineToneFixture(440);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 120,
      fftMagnitudes: fixture.fftMagnitudes,
      timeData: fixture.timeData,
      includeSpectralLight: true,
    });
    preparedInputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(preparedInputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 3,
    });

    const slots = structural.candidateForcingSlotsSource;
    const colors = structural.sourceCoupledColorSlotsSource;
    let staleGreenWeight = 0;
    for (let offset = 0; offset < colors.length; offset += 4) {
      if (
        slots[offset] === 8 &&
        slots[offset + 1] === 8 &&
        slots[offset + 2] === 8 &&
        colors[offset + 3] > staleGreenWeight
      ) {
        staleGreenWeight = colors[offset + 3];
      }
    }

    expect(staleGreenWeight).toBe(0);
  });

  it("routes bright coherent treble into detail modes", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.92],
        [6800, 0.44],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.35 }),
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    expect(
      countActiveSlotsLocal(structuralState.proposalResonantSlotsSource),
    ).toBeGreaterThan(0);
    expect(structuralState.dominantFrequency).toBeGreaterThan(3200);
    expect(
      structuralState.structuralMetrics.highOrderModalEnergy,
    ).toBeGreaterThan(0);
    expect(structuralState.structuralMetrics.driveSource).toBe("time-domain");
  });

  it("falls back to spectral drive only when time data is unavailable", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: null,
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    expect(structuralState.structuralMetrics.driveSource).toBe(
      "spectral-fallback",
    );
  });

  it("enforces slot capacity in slot units across proposal and display layers", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.99],
        [220, 0.9],
        [330, 0.82],
        [440, 0.75],
        [550, 0.68],
        [660, 0.61],
        [770, 0.54],
      ]),
      timeData: makeTimeData({ frequency: 110, amplitude: 0.85 }),
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });
    const sourceCoupledCapacity =
      structuralState.candidateForcingSlotsSource.length / 4;
    const resonantCapacity =
      structuralState.candidateResponseSlotsSource.length / 4;

    expect(structuralState.activeSourceCoupledModeCount).toBeLessThanOrEqual(
      sourceCoupledCapacity,
    );
    expect(structuralState.activeResonantModeCount).toBeLessThanOrEqual(
      resonantCapacity,
    );
    expect(
      countActiveSlotsLocal(structuralState.proposalSourceCoupledSlotsSource),
    ).toBeLessThanOrEqual(sourceCoupledCapacity);
    expect(
      countActiveSlotsLocal(structuralState.proposalResonantSlotsSource),
    ).toBeLessThanOrEqual(resonantCapacity);
  });

  it("keeps reference remapping aligned to the blended slot order", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: makeTimeData({ frequency: 110 }),
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    for (
      let offset = 0;
      offset < structuralState.candidateForcingSlotsSource.length;
      offset += 4
    ) {
      const amplitude =
        structuralState.candidateForcingSlotsSource[offset + 3] ?? 0;
      if (amplitude <= 0) {
        continue;
      }
      expect(
        Array.from(
          structuralState.referenceSourceCoupledSlotsSource.slice(
            offset,
            offset + 3,
          ),
        ),
      ).toEqual(
        Array.from(
          structuralState.candidateForcingSlotsSource.slice(offset, offset + 3),
        ),
      );
    }
  });

  it("keeps requested spherical geometry on the inputs while using the rectangular backend atlas", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: makeTimeData({ frequency: 110 }),
      cavityGeometry: "spherical",
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    expect(preparedInputs.requestedCavityGeometry).toBe("spherical");
    expect(preparedInputs.effectiveCavityGeometry).toBe("rectangular");
    expect(state.atlasCacheKey).toBe(
      "rectangular:neumann:12.500:1480.000:project-subfundamental",
    );
    expect(structuralState.analysisEngine).toBe("modal-excitation");
  });

  it("saturates amplitude to <= 1.0 under sustained strong input", () => {
    const state = createModalExcitationState(16);
    const fftMagnitudes = makeFft([
      [110, 0.99],
      [220, 0.85],
      [330, 0.7],
    ]);
    const timeData = makeTimeData({ frequency: 110, amplitude: 0.95 });

    for (let frame = 0; frame < 300; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes,
        timeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      expect(structural.dominantAmplitude).toBeLessThanOrEqual(1.0);
    }
  });

  it("does not excite modes on very quiet input", () => {
    const state = createModalExcitationState(16);
    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([[110, 0.001]]),
      timeData: makeTimeData({ frequency: 110, amplitude: 0.001 }),
      avgAmplitude: 0.01,
      rms: 0.0005,
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    expect(structural.activeModeCount).toBe(0);
  });

  it("bounds atlas cache size via eviction", () => {
    for (let index = 0; index < 12; index += 1) {
      const radius = 1.0 + index * 0.1;
      const state = createModalExcitationState(16);
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: 0,
        fftMagnitudes: makeFft([[110, 0.5]]),
        timeData: makeTimeData({ frequency: 110 }),
      });
      inputs.radius = radius;
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => 0,
      });
    }
    expect(getAtlasCacheSize()).toBeLessThanOrEqual(8);
  });

  it("reports high periodicity for a clean periodic signal", () => {
    const buffer = new Float32Array(1024);
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE);
    }
    const periodicity = computeDrivePeriodicity(buffer, SAMPLE_RATE);
    expect(periodicity).toBeGreaterThan(0.5);
  });

  it("converges toward the raw target across repeated stable frames", () => {
    const state = createModalExcitationState(16);
    const amplitudeGaps = [];

    for (let frame = 0; frame < 20; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [550, 0.95],
          [1100, 0.5],
        ]),
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      amplitudeGaps.push(
        sumAmplitudes(state.sourceCoupledProposal.slots) -
          sumAmplitudes(structural.candidateForcingSlotsSource),
      );
    }

    expect(amplitudeGaps[0]).toBeGreaterThan(0);
    expect(amplitudeGaps.at(-1)).toBeLessThanOrEqual(amplitudeGaps[0] * 1.01);
  });

  it("adds release sustain beyond the raw resonator decay", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    const silenceFrames = [];

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 25; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 2.5,
        rms: 0.01,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      silenceFrames.push({
        proposal: sumAmplitudes(structural.proposalSourceCoupledSlotsSource),
        blended: sumAmplitudes(structural.candidateForcingSlotsSource),
      });
    }

    expect(
      silenceFrames
        .slice(4)
        .some(({ proposal, blended }) => blended > proposal + 1e-4),
    ).toBe(true);
    expect(silenceFrames.at(-1).blended).toBeGreaterThan(
      silenceFrames.at(-1).proposal,
    );
  });

  it("clears the visible tail after sustained true hard silence", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let activeBlendedAmplitude = 0;
    let hardSilentStructural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      activeBlendedAmplitude = sumAmplitudes(
        structural.candidateForcingSlotsSource,
      );
    }

    for (let frame = 10; frame < 64; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 0,
        rms: 0,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      hardSilentStructural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      sumAmplitudes(hardSilentStructural.proposalSourceCoupledSlotsSource),
    ).toBe(0);
    expect(
      sumAmplitudes(hardSilentStructural.candidateForcingSlotsSource),
    ).toBeLessThan(activeBlendedAmplitude * 0.08);
  });

  it("cuts render authority on residual line-feed meter floor without modal input", () => {
    const state = createModalExcitationState(16);
    const featureState = createAudioFeatureState(16);
    const status = createStatus({
      audioInputMode: "system",
      analysisSource: "live",
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    let structural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
        avgAmplitude: 24,
        rms: 0.16,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      structural.structuralMetrics.modalResponseRenderEnergy,
    ).toBeGreaterThan(0);

    for (let frame = 10; frame < 52; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        timeData: new Float32Array(FFT_SIZE),
        avgAmplitude: 1.2,
        rms: 0.0068,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.modalResponseInputEnergy).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseCurrentRenderSourceEvidence,
    ).toBe(false);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .sourceEnergy,
    ).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .renderBoundaryState,
    ).toBe("muted");
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .storedModalEnergy,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBeCloseTo(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
      6,
    );
    expect(sumAmplitudes(structural.candidateForcingSlotsSource)).toBe(0);
  });

  it("cuts loopback transport silence without waiting for the file release hold", () => {
    const state = createModalExcitationState(16);
    const featureState = createAudioFeatureState(16);
    const status = createStatus({
      audioInputMode: "system",
      analysisSource: "live",
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    let structural = null;
    let firstSilentLedgerFrame = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
        avgAmplitude: 24,
        rms: 0.16,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 24; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        timeData: new Float32Array(FFT_SIZE),
        avgAmplitude: 1.2,
        rms: 0.0068,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      if (
        firstSilentLedgerFrame == null &&
        structural.structuralMetrics.modalResponseRenderPreviewLedger
          .sourceEnergy === 0
      ) {
        firstSilentLedgerFrame = frame;
      }
    }

    expect(firstSilentLedgerFrame).not.toBeNull();
    expect(firstSilentLedgerFrame).toBeLessThan(18);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .sourceEnergy,
    ).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseCurrentRenderSourceEvidence,
    ).toBe(false);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .renderBoundaryState,
    ).toBe("muted");
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .storedModalEnergy,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBe(0);
  });

  it("reduces noisy-input jitter after the post-resonator blend", () => {
    const state = createModalExcitationState(16);
    const random = createDeterministicRandom(97);
    const rawDeltas = [];
    const blendedDeltas = [];
    let previousRawSlots = null;
    let previousBlendedSlots = null;

    for (let frame = 0; frame < 24; frame += 1) {
      const baseAmplitude = 0.88 + (random() - 0.5) * 0.12;
      const harmonicAmplitude = 0.46 + (random() - 0.5) * 0.1;
      const timeAmplitude = 0.42 + (random() - 0.5) * 0.08;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [110, baseAmplitude],
          [220, harmonicAmplitude],
        ]),
        timeData: makeTimeData({
          frequency: 110,
          amplitude: timeAmplitude,
        }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      const rawSlots = cloneSlots(structural.proposalSourceCoupledSlotsSource);
      const blendedSlots = cloneSlots(structural.candidateForcingSlotsSource);

      if (previousRawSlots && previousBlendedSlots) {
        rawDeltas.push(computeAmplitudeDelta(rawSlots, previousRawSlots));
        blendedDeltas.push(
          computeAmplitudeDelta(blendedSlots, previousBlendedSlots),
        );
      }

      previousRawSlots = rawSlots;
      previousBlendedSlots = blendedSlots;
    }

    expect(average(blendedDeltas)).toBeLessThan(average(rawDeltas));
    expect(average(blendedDeltas.slice(-10))).toBeLessThan(
      average(rawDeltas.slice(-10)),
    );
  });

  it("surfaces multiple visible detail modes within two bright treble frames", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 2; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [6200, 0.92],
          [7600, 0.72],
          [9100, 0.58],
        ]),
        timeData: makeTimeData({ frequency: 6200, amplitude: 0.38 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(1);
  });

  it("keeps coherent bowl-like detail modes visible through low-transient sustain", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 28; frame += 1) {
      const isStrike = frame < 2;
      structural = runModalFrame({
        state,
        frame,
        partials: isStrike
          ? RESONANT_STRIKE_PARTIALS
          : RESONANT_SUSTAIN_PARTIALS,
        avgAmplitude: isStrike ? 42 : 14,
        rms: isStrike ? 0.32 : 0.07,
        amplitudeScale: isStrike ? 1 : 0.22,
      });
    }

    expect(structural.structuralMetrics.modeCoherence).toBeGreaterThan(0.5);
    expectObservedDisplayContinuityEntries(state);
    expect(
      countActiveSlotsLocal(structural.proposalResonantSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.16);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(4);
  });

  it("keeps meter-loud inharmonic bowl sustain from losing seeded detail structure", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const isStrike = frame < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(isStrike ? partials : []),
        timeData: makeMixedTimeData({
          partials,
          amplitudeScale: isStrike ? 1 : 0.28,
        }),
        avgAmplitude: isStrike ? 42 : 16,
        rms: isStrike ? 0.32 : 0.075,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.modeCoherence).toBeGreaterThan(0.35);
    expectObservedDisplayContinuityEntries(state);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.035);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(3);
    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.035,
    );
    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0.5);
    expect(
      structural.structuralMetrics.projectionHighQProtection,
    ).toBeGreaterThan(0.1);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0.14);
    expect(
      structural.structuralMetrics.projectionEnergyUsedResonant,
    ).toBeLessThanOrEqual(
      structural.structuralMetrics.projectionEnergyBudgetResonant,
    );
    expect(
      Array.from(state.observedModes?.values?.() ?? []).filter(
        (entry) => entry.layer === "resonant",
      ).length,
    ).toBeGreaterThanOrEqual(4);
    expectLegacyModalObserverAuthoritiesRemoved(state);
  });

  it("keeps a loud periodic bowl tail structured across a long sustain", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const isStrike = frame < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(isStrike ? partials : []),
        timeData: makeMixedTimeData({
          partials,
          amplitudeScale: isStrike ? 1 : 0.28,
        }),
        avgAmplitude: isStrike ? 42 : 16,
        rms: isStrike ? 0.32 : 0.075,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0.5);
    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.035,
    );
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.035);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps retained display continuity separate from phase authority", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 180; frame += 1) {
      const isStrike = frame < 4;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : [
            [196, 0.14],
            [282, 0.11],
            [417, 0.07],
          ];
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(partials),
        timeData: makeMixedTimeData({
          partials,
          amplitudeScale: isStrike ? 0.8 : 0.045,
        }),
        avgAmplitude: isStrike ? 36 : 5.4,
        rms: isStrike ? 0.26 : 0.018,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const resonantPhaseEntries = Array.from(
      state.observedModes?.values?.() ?? [],
    ).filter((entry) => entry.layer === "resonant" && entry.phaseAuthority > 0);

    expectObservedDisplayContinuityEntries(state);
    expect(
      structural.structuralMetrics.modalPhaseAuthority,
    ).toBeGreaterThanOrEqual(0);
    expect(
      structural.structuralMetrics.highQPhaseAuthority,
    ).toBeGreaterThanOrEqual(0);
    expect(
      structural.structuralMetrics.lowQPhaseAuthority,
    ).toBeGreaterThanOrEqual(0);
    for (const entry of resonantPhaseEntries) {
      expect(Math.abs(entry.phaseVelocityRadPerSec)).toBeLessThanOrEqual(
        Math.PI * 1.25,
      );
      expect(entry.phaseCoherence).toBeGreaterThan(0);
      expect(entry.phaseAuthority).toBeLessThanOrEqual(1);
    }
    expect(
      countAuthoritativePhaseSlots(structural.resonantPhaseSlotsSource),
    ).toBeLessThanOrEqual(
      structural.structuralMetrics.modalPhaseCoherentFieldModeCount,
    );
    expectCanonicalObservedModeEntries(state);
  });

  it("retains seeded detail through trace-level periodic bowl tails without fresh detail FFT", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 420; frame += 1) {
      const isStrike = frame < 2;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
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
        avgAmplitude: isStrike ? 42 : 0.18,
        rms: isStrike ? 0.32 : 0.0008,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0.08);
    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(4);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.004,
    );
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(4);
  });

  it("keeps observed high-Q detail through brief noisy observation dropouts", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 48; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
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
        avgAmplitude: isStrike ? 42 : 0.74,
        rms: isStrike ? 0.32 : 0.0049,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const supportedEnergy = structural.structuralMetrics.highQResonantEnergy;
    expect(structural.structuralMetrics.highQResonantModeCount).toBeGreaterThan(
      0,
    );
    expect(supportedEnergy).toBeGreaterThan(0.02);

    for (let frame = 48; frame < 72; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([]),
        timeData: makeNoisyPeriodicTimeData({
          frequency: 196,
          amplitude: 0.003,
          noiseAmplitude: 0.018,
          seed: frame,
        }),
        avgAmplitude: 1.5,
        rms: 0.012,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0);
    expect(structural.structuralMetrics.highQRingSupport).toBeLessThanOrEqual(
      1,
    );
    expect(structural.structuralMetrics.highQResonantModeCount).toBeGreaterThan(
      0,
    );
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      supportedEnergy * 0.35,
    );
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
  });

  it("keeps observed high-Q detail when a ringing bowl tail alternates dominant partials", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 96; frame += 1) {
      const isStrike = frame < 8;
      const tailDominantFrequency = frame % 2 === 0 ? 196 : 282;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: isStrike
          ? makeFft(INHARMONIC_BOWL_STRIKE_PARTIALS)
          : makeFft([[tailDominantFrequency, 0.18]]),
        timeData: makeMixedTimeData({
          partials: isStrike
            ? INHARMONIC_BOWL_STRIKE_PARTIALS
            : LOUD_BOWL_TONE_PARTIALS,
          amplitudeScale: isStrike ? 1 : 0.006,
        }),
        avgAmplitude: isStrike ? 42 : 6.4,
        rms: isStrike ? 0.32 : 0.18,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });

      if (!isStrike) {
        expect(
          structural.structuralMetrics.highQResonantModeCount,
        ).toBeGreaterThan(0);
        expect(
          structural.structuralMetrics.highQResonantEnergy,
        ).toBeGreaterThan(0.004);
      }
    }

    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
  });

  it("refreshes high-Q detail from sustained upper bowl harmonics after the strike", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 180; frame += 1) {
      const isStrike = frame < 8;
      const tailPartials = [
        [417, 0.075],
        [611, 0.052],
      ];
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : tailPartials;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(partials),
        timeData: makeMixedTimeData({
          partials,
          amplitudeScale: isStrike ? 1 : 0.018,
        }),
        avgAmplitude: isStrike ? 42 : 0.9,
        rms: isStrike ? 0.32 : 0.0058,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const currentFrameAtMs = 179 * 33;
    const freshlyObservedResonantModes = Array.from(
      state.observedModes?.values?.() ?? [],
    ).filter(
      (entry) =>
        entry.layer === "resonant" &&
        currentFrameAtMs - (entry.lastObservedAtMs ?? 0) <= 66,
    );

    expect(structural.structuralMetrics.highQObservedDrive).toBeGreaterThan(
      0.0025,
    );
    expect(freshlyObservedResonantModes.length).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.resonantSignalAuthoritativeHighQ).toBe(
      false,
    );
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.003);
  });

  it("observes high-Q detail from low-meter bowl strikes before the tail", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 180; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
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
        avgAmplitude: isStrike ? 2.2 : 0.18,
        rms: isStrike ? 0.006 : 0.0008,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0.08);
    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.004,
    );
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("observes high-Q detail from soft coherent bowl strikes before the tail", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: isStrike
          ? makeFft(scalePartials(INHARMONIC_BOWL_STRIKE_PARTIALS, 0.018))
          : makeFft([
              [196, 0.01],
              [282, 0.006],
            ]),
        timeData: makeMixedTimeData({
          partials: isStrike
            ? INHARMONIC_BOWL_STRIKE_PARTIALS
            : LOUD_BOWL_TONE_PARTIALS,
          amplitudeScale: isStrike ? 0.12 : 0.005,
        }),
        avgAmplitude: isStrike ? 0.85 : 0.16,
        rms: isStrike ? 0.0028 : 0.00072,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0.08);
    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.003,
    );
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("observes high-Q detail from a soft coherent bowl without a loud seed strike", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    const softHighQPartials = [
      [3206.67, 0.0012],
      [3805.39, 0.00095],
      [4528.2, 0.00072],
    ];
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(softHighQPartials),
        timeData: makeMixedTimeData({
          partials: softHighQPartials,
          amplitudeScale: 0.005,
        }),
        avgAmplitude: 0.16,
        rms: 0.00072,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.003,
    );
    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0.08);
    expect(
      Array.from(state.observedModes?.values?.() ?? []).filter(
        (entry) => entry.layer === "resonant",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.observedModalModeCount).toBeGreaterThan(
      0,
    );
    expectLegacyModalObserverAuthoritiesRemoved(state);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("observes high-Q detail from an E2-range coherent bowl fundamental", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    const e2BowlFundamentalHz = 82.41;
    const e2BowlTone = [
      [e2BowlFundamentalHz, 0.8],
      [e2BowlFundamentalHz * 2, 0.08],
    ];
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(e2BowlTone),
        timeData: makeMixedTimeData({
          partials: e2BowlTone,
          amplitudeScale: 0.08,
        }),
        avgAmplitude: 5.2,
        rms: 0.018,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      structural.structuralMetrics.lowQSourceCoupledModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.highQResonantModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(
      0.003,
    );
    expect(structural.structuralMetrics.resonantSignalAuthoritativeHighQ).toBe(
      false,
    );
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("lets aged high-Q observation own periodic bowl tails", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 36; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: isStrike
          ? makeFft(INHARMONIC_BOWL_STRIKE_PARTIALS)
          : makeFft([
              [196, 0.014],
              [282, 0.009],
            ]),
        timeData: isStrike
          ? makeMixedTimeData({
              partials: INHARMONIC_BOWL_STRIKE_PARTIALS,
              amplitudeScale: 1,
            })
          : makeNoisyPeriodicTimeData({
              frequency: 196,
              amplitude: 0.006,
              noiseAmplitude: 0.003,
              seed: 123,
            }),
        avgAmplitude: isStrike ? 42 : 0.74,
        rms: isStrike ? 0.32 : 0.0049,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQResonantModeCount).toBeGreaterThan(
      0,
    );
    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0);
    expect(structural.structuralMetrics.highQRingSupport).toBeLessThanOrEqual(
      1,
    );
    expect(structural.structuralMetrics.resonantSignalAuthoritativeHighQ).toBe(
      false,
    );
    expect(
      structural.structuralMetrics.resonantSignalAuthoritativeReason,
    ).not.toBe("resonant-authority");
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expectCanonicalObservedModeEntries(state);
  });

  it("keeps dense sustained music detail active without high-Q authority", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 96; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeDenseFft({
          count: 1000,
          amplitude: 0.018,
          peakFrequency: frame % 2 === 0 ? 427 : 3197,
          peakAmplitude: 0.62,
        }),
        timeData: makeMixedTimeData({
          partials: [
            [110, 0.42],
            [164, 0.35],
            [220, 0.3],
            [427, 0.22],
            [880, 0.18],
            [1600, 0.14],
            [3197, 0.1],
          ],
          amplitudeScale: 0.18,
        }),
        avgAmplitude: 28,
        rms: 0.046,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.1);
    expect(structural.structuralMetrics.resonantSignalAuthoritativeHighQ).toBe(
      false,
    );
    expect(structural.structuralMetrics.highQProjectionLoad).toBeGreaterThan(
      0.4,
    );
    expect(
      structural.structuralMetrics.projectionConservationApplied,
    ).toBeUndefined();
    expect(
      structural.structuralMetrics.projectionEnergyNormalizationApplied,
    ).toBe(true);
    expect(
      structural.structuralMetrics.projectionCompetitionReduction,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.projectionRawEnergyResonant,
    ).toBeGreaterThan(
      structural.structuralMetrics.projectionAllocatedEnergyResonant,
    );
    expect(
      structural.structuralMetrics.projectionEnergyScaleResonant,
    ).toBeLessThanOrEqual(1);
    expect(
      structural.structuralMetrics.projectionOverlapPressureResonant,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.projectionEnergyUsedResonant,
    ).toBeLessThanOrEqual(
      structural.structuralMetrics.projectionEnergyBudgetResonant,
    );
    expect(
      structural.structuralMetrics.projectionAllocatedEnergyResonant,
    ).toBeLessThanOrEqual(
      structural.structuralMetrics.projectionEnergyBudgetResonant,
    );
    expect(
      sumSquaredAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeLessThanOrEqual(
      structural.structuralMetrics.projectionEnergyBudgetResonant + 1e-6,
    );
  });

  it("decays high-Q detail state on true hard silence after a loud ring", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 120; frame += 1) {
      const isStrike = frame < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(isStrike ? partials : []),
        timeData: makeMixedTimeData({
          partials,
          amplitudeScale: isStrike ? 1 : 0.28,
        }),
        avgAmplitude: isStrike ? 42 : 16,
        rms: isStrike ? 0.32 : 0.075,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQResonantModeCount).toBeGreaterThan(
      0,
    );
    const preSilenceResonantAmplitude = sumAmplitudes(
      structural.candidateResponseSlotsSource,
    );
    const preSilenceHighQEnergy =
      structural.structuralMetrics.highQResonantEnergy;

    for (let frame = 120; frame < 172; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        timeData: new Float32Array(FFT_SIZE),
        avgAmplitude: 0,
        rms: 0,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.modalResponseInputEnergy).toBe(0);
    expect(structural.structuralMetrics.highQResonantModeCount).toBeGreaterThan(
      0,
    );
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.highQResonantEnergy,
    ).toBeLessThanOrEqual(preSilenceHighQEnergy);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBeLessThan(
      preSilenceResonantAmplitude,
    );
    expect(sumAmplitudes(structural.proposalResonantSlotsSource)).toBe(0);
    expectLegacyModalObserverAuthoritiesRemoved(state);
  });

  it("keeps zero-input high-Q ring-out diagnostic-only on the energy ledger", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 18; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(LOUD_BOWL_TONE_PARTIALS),
        timeData: makeMixedTimeData({
          partials: LOUD_BOWL_TONE_PARTIALS,
          amplitudeScale: 0.32,
        }),
        avgAmplitude: 18,
        rms: 0.08,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const silentInputs = createLineFeedPreparedInputs({
      frameTimeMs: 18 * 33,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: new Float32Array(FFT_SIZE),
      avgAmplitude: 0,
      rms: 0,
      status,
    });
    silentInputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(silentInputs);
    structural = buildModalExcitationStructuralState({
      preparedInputs: silentInputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 18,
    });

    expect(structural.structuralMetrics.modalResponseInputEnergy).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .renderBoundaryState,
    ).toBe("muted");
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
    ).toBe(0);
    expect(sumAmplitudes(structural.candidateResponseSlotsSource)).toBe(0);
    expectLegacyModalObserverAuthoritiesRemoved(structural.structuralMetrics);
  });

  it("keeps zero-input ring-out energy from creating signed phase authority", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 18; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(LOUD_BOWL_TONE_PARTIALS),
        timeData: makeMixedTimeData({
          partials: LOUD_BOWL_TONE_PARTIALS,
          amplitudeScale: 0.32,
        }),
        avgAmplitude: 18,
        rms: 0.08,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.modalPhaseAuthority).toBeGreaterThan(0);
    expect(
      countAuthoritativePhaseSlots(structural.resonantPhaseSlotsSource),
    ).toBeGreaterThan(0);

    const silentInputs = createLineFeedPreparedInputs({
      frameTimeMs: 18 * 33,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      timeData: new Float32Array(FFT_SIZE),
      avgAmplitude: 0,
      rms: 0,
      status,
    });
    silentInputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(silentInputs);
    structural = buildModalExcitationStructuralState({
      preparedInputs: silentInputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 18,
    });

    expect(structural.structuralMetrics.modalResponseInputEnergy).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBe(0);
    expect(sumAmplitudes(structural.candidateResponseSlotsSource)).toBe(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .renderBoundaryState,
    ).toBe("muted");
    expect(structural.structuralMetrics.modalPhaseAuthority).toBe(0);
    expect(structural.structuralMetrics.modalPhaseCoherentFieldModeCount).toBe(
      0,
    );
    expect(
      countAuthoritativePhaseSlots(structural.resonantPhaseSlotsSource),
    ).toBe(0);
  });

  it("matures bowl-like detail structure during the first sustained ring", () => {
    const state = createModalExcitationState(16);
    const sustainedRingFrames = [];

    for (let frame = 0; frame < 10; frame += 1) {
      const isStrike = frame < 2;
      const structural = runModalFrame({
        state,
        frame,
        partials: isStrike
          ? RESONANT_STRIKE_PARTIALS
          : RESONANT_SUSTAIN_PARTIALS,
        avgAmplitude: isStrike ? 42 : 14,
        rms: isStrike ? 0.32 : 0.07,
        amplitudeScale: isStrike ? 1 : 0.22,
      });
      if (frame >= 6) {
        sustainedRingFrames.push({
          meaningfulResonantCount: countSlotsAboveAmplitude(
            structural.candidateResponseSlotsSource,
            0.025,
          ),
          resonantAmplitude: sumAmplitudes(
            structural.candidateResponseSlotsSource,
          ),
        });
      }
    }

    expect(
      sustainedRingFrames.every(
        ({ meaningfulResonantCount }) => meaningfulResonantCount >= 4,
      ),
    ).toBe(true);
    expect(
      Math.min(
        ...sustainedRingFrames.map(
          ({ resonantAmplitude }) => resonantAmplitude,
        ),
      ),
    ).toBeGreaterThan(0.16);
    expect(sustainedRingFrames.at(-1).resonantAmplitude).toBeGreaterThan(0.21);
  });

  it("blooms resonant detail after the strike seeds stable modes", () => {
    const state = createModalExcitationState(16);
    const frames = new Map();

    for (let frame = 0; frame < 14; frame += 1) {
      const isStrike = frame < 2;
      const structural = runModalFrame({
        state,
        frame,
        partials: isStrike
          ? RESONANT_STRIKE_PARTIALS
          : RESONANT_SUSTAIN_PARTIALS,
        avgAmplitude: isStrike ? 42 : 14,
        rms: isStrike ? 0.32 : 0.07,
        amplitudeScale: isStrike ? 1 : 0.22,
      });
      if ([2, 7, 12].includes(frame)) {
        frames.set(frame, {
          amplitude: sumAmplitudes(structural.candidateResponseSlotsSource),
          meaningfulResonantCount: countSlotsAboveAmplitude(
            structural.candidateResponseSlotsSource,
            0.025,
          ),
        });
      }
    }

    const seeded = frames.get(2);
    const opening = frames.get(7);
    const mature = frames.get(12);
    expect(opening.amplitude).toBeGreaterThan(seeded.amplitude);
    expect(mature.amplitude).toBeGreaterThan(seeded.amplitude * 1.05);
    expect(mature.meaningfulResonantCount).toBeGreaterThanOrEqual(4);
  });

  it("admits high-order detail for low-level coherent routed resonance", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 14; frame += 1) {
      const decay = frame < 2 ? 1 : Math.max(0.42, Math.exp(-(frame - 2) / 18));
      structural = runModalFrame({
        state,
        frame,
        partials: [
          [220, 0.24 * decay],
          [440, 0.14 * decay],
          [660, 0.08 * decay],
          [880, 0.04 * decay],
          [1320, 0.025 * decay],
          [2200, 0.018 * decay],
        ],
        avgAmplitude: Math.max(2, 12 * decay),
        rms: Math.max(0.006, 0.045 * decay),
        amplitudeScale: Math.max(0.04, 0.055 * decay),
      });
    }

    expect(structural.structuralMetrics.modeCoherence).toBeGreaterThan(0.8);
    expectObservedDisplayContinuityEntries(state);
    expect(structural.structuralMetrics.highOrderModalEnergy).toBeGreaterThan(
      0,
    );
    expect(
      countActiveSlotsLocal(structural.proposalResonantSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.035);
  });

  it("scales retained quiet-ring detail with the fading source", () => {
    const state = createModalExcitationState(16);
    const snapshots = [];

    for (let frame = 0; frame < 48; frame += 1) {
      const scale =
        frame < 2 ? 1 : Math.max(0.012, Math.exp(-(frame - 2) / 22) * 0.24);
      const structural = runModalFrame({
        state,
        frame,
        partials: scalePartials(RESONANT_STRIKE_PARTIALS, scale),
        avgAmplitude: Math.max(1.4, 36 * scale),
        rms: Math.max(0.005, 0.26 * scale),
        amplitudeScale: frame < 2 ? 1 : scale,
      });
      if ([20, 30, 44].includes(frame)) {
        snapshots.push({
          frame,
          proposalResonant: sumAmplitudes(
            structural.proposalResonantSlotsSource,
          ),
          visibleResonant: sumAmplitudes(
            structural.candidateResponseSlotsSource,
          ),
          highOrderModalEnergy:
            structural.structuralMetrics.highOrderModalEnergy,
        });
      }
    }

    const [earlyTail, midTail, lateTail] = snapshots;
    expect(earlyTail.proposalResonant).toBeGreaterThan(0);
    expect(midTail.proposalResonant).toBeGreaterThan(0);
    expect(lateTail.proposalResonant).toBeGreaterThan(0);
    expect(midTail.proposalResonant).toBeLessThan(earlyTail.proposalResonant);
    expect(lateTail.proposalResonant).toBeLessThan(
      midTail.proposalResonant * 0.9,
    );
    expect(lateTail.visibleResonant).toBeLessThan(earlyTail.visibleResonant);
    expect(lateTail.highOrderModalEnergy).toBeGreaterThan(0);
  });

  it("deblooms a coherent ring by shrinking the same modal structure", () => {
    const state = createModalExcitationState(16);
    const snapshots = new Map();

    for (let frame = 0; frame < 52; frame += 1) {
      const scale =
        frame < 2 ? 1 : Math.max(0.012, Math.exp(-(frame - 2) / 22) * 0.24);
      const structural = runModalFrame({
        state,
        frame,
        partials: scalePartials(RESONANT_STRIKE_PARTIALS, scale),
        avgAmplitude: Math.max(1.4, 36 * scale),
        rms: Math.max(0.005, 0.26 * scale),
        amplitudeScale: frame < 2 ? 1 : scale,
      });
      if ([12, 36, 48].includes(frame)) {
        snapshots.set(frame, {
          amplitude: sumAmplitudes(structural.candidateResponseSlotsSource),
          modeAmplitudes: readModeAmplitudeMap(
            structural.candidateResponseSlotsSource,
          ),
          highOrderModalEnergy:
            structural.structuralMetrics.highOrderModalEnergy,
        });
      }
    }

    const open = snapshots.get(12);
    const late = snapshots.get(36);
    const tail = snapshots.get(48);

    expect(sumModeAmplitudeMap(open.modeAmplitudes)).toBeGreaterThan(0);
    expect(late.amplitude).toBeGreaterThan(0);
    expect(tail.amplitude).toBeLessThan(late.amplitude * 0.9);
    expect(tail.highOrderModalEnergy).toBeGreaterThan(0);
  });

  it("drops coherent bowl-like detail tails from render slots on hard silence", () => {
    const state = createModalExcitationState(16);
    const fadeFrames = [];
    let structural = null;

    for (let frame = 0; frame < 40; frame += 1) {
      const isStrike = frame < 2;
      const fadeScale = isStrike
        ? 1
        : Math.max(0.015, Math.exp(-(frame - 2) / 18) * 0.24);
      const partials = scalePartials(RESONANT_STRIKE_PARTIALS, fadeScale);
      const avgAmplitude = Math.max(2, 36 * fadeScale);
      const rms = Math.max(0.006, 0.26 * fadeScale);
      structural = runModalFrame({
        state,
        frame,
        partials,
        avgAmplitude,
        rms,
        amplitudeScale: isStrike ? 1 : fadeScale,
      });
      fadeFrames.push({
        avgAmplitude,
        rms,
        resonantAmplitude: sumAmplitudes(
          structural.candidateResponseSlotsSource,
        ),
      });
    }

    for (let index = 1; index < fadeFrames.length; index += 1) {
      const previous = fadeFrames[index - 1];
      const current = fadeFrames[index];
      if (
        previous.resonantAmplitude <= 0.04 ||
        current.avgAmplitude <= 1 ||
        current.rms <= 0.004
      ) {
        continue;
      }
      expect(current.resonantAmplitude).toBeGreaterThanOrEqual(
        previous.resonantAmplitude * 0.3,
      );
    }
    expect(
      fadeFrames.slice(16, 21).some((frame) => frame.resonantAmplitude > 0),
    ).toBe(true);

    const preSilenceResonantAmplitude = sumAmplitudes(
      structural.candidateResponseSlotsSource,
    );
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);

    for (let frame = 40; frame < 94; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 0,
        rms: 0,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.modalResponseInputEnergy).toBe(0);
    expect(sumAmplitudes(structural.proposalResonantSlotsSource)).toBe(0);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBeLessThan(
      preSilenceResonantAmplitude,
    );
  });

  it("retains coherent quiet-ring detail modes above hard silence", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 45; frame += 1) {
      const scale =
        frame < 2 ? 1 : Math.max(0.012, Math.exp(-(frame - 2) / 22) * 0.24);
      structural = runModalFrame({
        state,
        frame,
        partials: scalePartials(RESONANT_STRIKE_PARTIALS, scale),
        avgAmplitude: Math.max(1.4, 36 * scale),
        rms: Math.max(0.005, 0.26 * scale),
        amplitudeScale: frame < 2 ? 1 : scale,
      });
    }

    expect(structural.structuralMetrics.modeCoherence).toBeGreaterThan(0.65);
    expect(structural.structuralMetrics.modalDriveEnergy).toBeGreaterThan(
      0.004,
    );
    expect(structural.structuralMetrics.highOrderModalEnergy).toBeGreaterThan(
      0,
    );
    expect(
      countActiveSlotsLocal(structural.proposalResonantSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("keeps seeded subtle coherent line-feed resonance visible above hard silence", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 74; frame += 1) {
      const isStrike = frame < 2;
      const tailScale = Math.max(0.0065, Math.exp(-(frame - 2) / 18) * 0.22);
      const scale = isStrike ? 1 : tailScale;
      structural = runModalFrame({
        state,
        frame,
        partials: scalePartials(RESONANT_STRIKE_PARTIALS, scale),
        avgAmplitude: isStrike ? 38 : 1.24,
        rms: isStrike ? 0.28 : 0.0048,
        amplitudeScale: isStrike ? 1 : tailScale,
      });
    }

    expect(structural.structuralMetrics.modeCoherence).toBeGreaterThan(0.55);
    expectObservedDisplayContinuityEntries(state);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.006);
  });

  it("does not hard-clear seeded coherent detail when the ringing tail is below meter silence", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 68; frame += 1) {
      const isStrike = frame < 2;
      const tailScale =
        frame < 44
          ? Math.max(0.0065, Math.exp(-(frame - 2) / 18) * 0.22)
          : 0.0027;
      structural = runModalFrame({
        state,
        frame,
        partials: scalePartials(
          RESONANT_STRIKE_PARTIALS,
          isStrike ? 1 : tailScale,
        ),
        avgAmplitude: isStrike ? 38 : 0.72,
        rms: isStrike ? 0.28 : 0.0032,
        amplitudeScale: isStrike ? 1 : tailScale,
      });
    }

    expect(structural.structuralMetrics.modeCoherence).toBeGreaterThan(0.45);
    expectObservedDisplayContinuityEntries(state);
    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0.0015);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
  });

  it("keeps long coherent ring-out detail from decaying to an empty render", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 520; frame += 1) {
      const isStrike = frame < 2;
      const earlyTailScale = Math.max(
        0.0065,
        Math.exp(-(frame - 2) / 22) * 0.24,
      );
      const longTailScale = 0.00125 + Math.sin(frame * 0.11) * 0.00018;
      const scale = isStrike ? 1 : frame < 72 ? earlyTailScale : longTailScale;
      structural = runModalFrame({
        state,
        frame,
        partials: scalePartials(RESONANT_STRIKE_PARTIALS, scale),
        avgAmplitude: isStrike ? 38 : 0.52,
        rms: isStrike ? 0.28 : 0.0026,
        amplitudeScale: scale,
      });
    }

    expectObservedDisplayContinuityEntries(state);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0015);
  });

  it("does not blank high-Q detail when a quiet bowl tail dominant bin jitters", () => {
    const state = createModalExcitationState(16);
    const blankResonantFrames = [];
    const unsupportedObserverFrames = [];
    let structural = null;

    for (let frame = 0; frame < 420; frame += 1) {
      const isStrike = frame < 4;
      const tailFftPeaks =
        frame % 4 < 2
          ? [
              [282, 0.0011],
              [417, 0.00064],
            ]
          : [
              [417, 0.001],
              [611, 0.00058],
            ];
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(
          isStrike ? INHARMONIC_BOWL_STRIKE_PARTIALS : tailFftPeaks,
        ),
        timeData: makeMixedTimeData({
          partials: isStrike
            ? INHARMONIC_BOWL_STRIKE_PARTIALS
            : LOUD_BOWL_TONE_PARTIALS,
          amplitudeScale: isStrike ? 1 : 0.0048,
        }),
        avgAmplitude: isStrike ? 38 : 0.52,
        rms: isStrike ? 0.28 : 0.0026,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });

      if (frame < 96) {
        continue;
      }
      if ((structural.structuralMetrics.highQResonantEnergy ?? 0) > 0) {
        if ((structural.structuralMetrics.highQRingSupport ?? 0) <= 0) {
          unsupportedObserverFrames.push(frame);
        }
        if (
          countActiveSlotsLocal(structural.candidateResponseSlotsSource) === 0
        ) {
          blankResonantFrames.push(frame);
        }
      }
    }

    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(0);
    expect(unsupportedObserverFrames).toEqual([]);
    expect(blankResonantFrames).toEqual([]);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("bridges brief near-silent live input dropouts during an observed bowl ring", () => {
    const state = createModalExcitationState(16);
    const featureState = createAudioFeatureState(16);
    const status = createStatus({
      audioInputMode: "live",
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    const blankFrames = [];
    let structural = null;

    for (let frame = 0; frame < 128; frame += 1) {
      const isStrike = frame < 4;
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(
          isStrike
            ? INHARMONIC_BOWL_STRIKE_PARTIALS
            : [
                [282, 0.0012],
                [417, 0.0007],
              ],
        ),
        timeData: makeMixedTimeData({
          partials: isStrike
            ? INHARMONIC_BOWL_STRIKE_PARTIALS
            : LOUD_BOWL_TONE_PARTIALS,
          amplitudeScale: isStrike ? 1 : 0.0048,
        }),
        avgAmplitude: isStrike ? 38 : 0.14,
        rms: isStrike ? 0.28 : 0.00045,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(0);

    for (let frame = 128; frame < 158; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftMagnitudes: new Float32Array(BIN_COUNT),
        timeData: new Float32Array(FFT_SIZE),
        avgAmplitude: 0,
        rms: 0.00001,
        status,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });

      if (
        countActiveSlotsLocal(structural.candidateResponseSlotsSource) === 0
      ) {
        blankFrames.push({
          frame,
          highQResonantEnergy: structural.structuralMetrics.highQResonantEnergy,
          highQRingSupport: structural.structuralMetrics.highQRingSupport,
          fieldActiveModeCount: structural.activeModeCount,
        });
      }
    }

    expect(blankFrames).toEqual([]);
    expect(structural.structuralMetrics.highQResonantEnergy).toBeGreaterThan(0);
    expect(structural.structuralMetrics.highQRingSupport).toBeGreaterThan(0);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("keeps low system hum from becoming retained detail structure", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 40; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [
          [60, 0.055],
          [120, 0.025],
          [180, 0.012],
        ],
        avgAmplitude: 5,
        rms: 0.012,
        amplitudeScale: 0.045,
      });
    }

    expect(structural.structuralMetrics.highOrderModalEnergy).toBe(0);
    expect(structural.structuralMetrics.highQResonantModeCount ?? 0).toBe(0);
    expect(structural.structuralMetrics.highQResonantEnergy ?? 0).toBe(0);
    expect(structural.structuralMetrics.highQRingSupport ?? 0).toBe(0);
    expect(structural.structuralMetrics.highQPhaseAuthority ?? 0).toBe(0);
    expect(countActiveSlotsLocal(structural.proposalResonantSlotsSource)).toBe(
      0,
    );
    expect(countActiveSlotsLocal(structural.candidateResponseSlotsSource)).toBe(
      0,
    );
  });

  it("retunes observed low-Q backbone state after a clear frequency switch", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 64; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [
          [550, 0.95],
          [1100, 0.52],
        ],
        avgAmplitude: 24,
        rms: 0.2,
        amplitudeScale: 0.45,
      });
    }
    const firstSourceCoupledKeys = readModeKeys(
      structural.candidateForcingSlotsSource,
    );
    expect(firstSourceCoupledKeys.length).toBeGreaterThan(0);

    for (let frame = 64; frame < 88; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [
          [880, 0.95],
          [1760, 0.48],
        ],
        avgAmplitude: 24,
        rms: 0.2,
        amplitudeScale: 0.45,
      });
    }

    const switchedSourceCoupledKeys = readModeKeys(
      structural.candidateForcingSlotsSource,
    );
    expect(
      hasNewModeKey(switchedSourceCoupledKeys, firstSourceCoupledKeys),
    ).toBe(true);
    expect(
      measureSharedAmplitudeRatio(
        new Map(firstSourceCoupledKeys.map((key) => [key, 1])),
        readModeAmplitudeMap(structural.candidateForcingSlotsSource),
      ),
    ).toBeLessThan(0.8);
    expect(
      structural.structuralMetrics.lowQSourceCoupledModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.modalPhaseCoherentFieldModeCount,
    ).toBeGreaterThan(0);
  });

  it("keeps dense sustained music bounded while admitting fresh detail", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    const densePartials = [
      [110, 0.76],
      [165, 0.58],
      [220, 0.62],
      [277, 0.48],
      [330, 0.42],
      [440, 0.38],
      [660, 0.32],
      [990, 0.24],
      [3300, 0.22],
      [5200, 0.18],
      [7600, 0.16],
    ];

    for (let frame = 0; frame < 18; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: densePartials,
        avgAmplitude: 32,
        rms: 0.2,
        amplitudeScale: 0.42,
      });
    }
    const sustainedKeys = readModeKeys(structural.candidateResponseSlotsSource);

    for (let frame = 18; frame < 21; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [...densePartials.slice(0, 8), [10800, 0.92]],
        avgAmplitude: 34,
        rms: 0.22,
        amplitudeScale: 0.44,
      });
    }

    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeLessThanOrEqual(16);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeLessThanOrEqual(
      sumAmplitudes(structural.proposalResonantSlotsSource),
    );
    expect(
      hasNewModeKey(
        readModeKeys(structural.candidateResponseSlotsSource),
        sustainedKeys,
      ),
    ).toBe(true);
  });

  it("bounds visible dense detail by physical modal response energy", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    const densePartials = [
      [110, 0.76],
      [165, 0.58],
      [220, 0.62],
      [277, 0.48],
      [330, 0.42],
      [440, 0.38],
      [660, 0.32],
      [990, 0.24],
      [3300, 0.22],
      [5200, 0.18],
      [7600, 0.16],
    ];

    for (let frame = 0; frame < 24; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials:
          frame < 18
            ? densePartials
            : [...densePartials.slice(0, 8), [10800, 0.92]],
        avgAmplitude: frame < 18 ? 32 : 34,
        rms: frame < 18 ? 0.2 : 0.22,
        amplitudeScale: frame < 18 ? 0.42 : 0.44,
      });
    }

    const visibleResonant = readModeAmplitudeMap(
      structural.candidateResponseSlotsSource,
    );
    let strongResonantCount = 0;
    for (const [modeKey, amplitude] of visibleResonant) {
      if (amplitude <= 0.01) {
        continue;
      }
      const activeMode = state.activeModes.get(modeKey);
      expect(activeMode?.modalResponseEnergy ?? 0).toBeGreaterThan(0);
      expect(amplitude).toBeLessThanOrEqual(
        (activeMode?.modalResponseDisplayAmplitude ?? 0) + 1e-6,
      );
      if (amplitude > 0.09) {
        strongResonantCount += 1;
      }
    }
    expect(strongResonantCount).toBeLessThanOrEqual(6);
    expect(
      sumSquaredAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeLessThan(
      sumSquaredAmplitudes(structural.candidateForcingSlotsSource) * 0.28,
    );
  });

  it("keeps dense published render candidates within the modal basis page budget", () => {
    const pageBudget = MODAL_BASIS_ATLAS_PAGE_CAPACITY;
    const semanticCapacity = Math.max(pageBudget + 12, 32);
    const state = createModalExcitationState(semanticCapacity);
    const featureState = createAudioFeatureState(semanticCapacity);
    let structural = null;
    const densePartials = [
      [110, 0.76],
      [165, 0.58],
      [220, 0.62],
      [277, 0.48],
      [330, 0.42],
      [440, 0.38],
      [660, 0.32],
      [990, 0.24],
      [1320, 0.22],
      [1980, 0.2],
      [3300, 0.22],
      [5200, 0.18],
      [7600, 0.16],
      [9200, 0.14],
      [10800, 0.12],
      [12100, 0.1],
    ];

    for (let frame = 0; frame < 36; frame += 1) {
      structural = runModalFrame({
        state,
        featureState,
        capacity: semanticCapacity,
        frame,
        partials:
          frame < 24
            ? densePartials
            : [...densePartials.slice(0, 12), [10800, 0.92], [12400, 0.35]],
        avgAmplitude: frame < 24 ? 32 : 34,
        rms: frame < 24 ? 0.2 : 0.22,
        amplitudeScale: 0.44,
      });
    }

    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    ).toBeLessThanOrEqual(pageBudget);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeLessThanOrEqual(pageBudget);
    expect(
      countActiveSlotsLocal(structural.proposalResonantSlotsSource),
    ).toBeGreaterThan(pageBudget);
    expect(
      computeTopModalEnergyCoverage(
        structural.candidateForcingSlotsSource,
        pageBudget,
      ),
    ).toBeCloseTo(1, 6);
    expect(
      computeTopModalEnergyCoverage(
        structural.candidateResponseSlotsSource,
        pageBudget,
      ),
    ).toBeCloseTo(1, 6);
    expect(
      computeTopModalEnergyCoverage(
        structural.proposalSourceCoupledSlotsSource,
        pageBudget,
      ),
    ).toBeLessThan(1);
  });

  it("drops stale visible detail dominance after a busy modal switch", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    const densePartials = [
      [110, 0.76],
      [165, 0.58],
      [220, 0.62],
      [277, 0.48],
      [330, 0.42],
      [440, 0.38],
      [660, 0.32],
      [990, 0.24],
      [3300, 0.22],
      [5200, 0.18],
      [7600, 0.16],
    ];

    for (let frame = 0; frame < 18; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: densePartials,
        avgAmplitude: 32,
        rms: 0.2,
        amplitudeScale: 0.42,
      });
    }
    const sustainedProposalAmplitudes = readModeAmplitudeMap(
      structural.proposalResonantSlotsSource,
    );
    const sustainedDisplayAmplitudes = readModeAmplitudeMap(
      structural.candidateResponseSlotsSource,
    );

    for (let frame = 18; frame < 21; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [...densePartials.slice(0, 8), [10800, 0.92]],
        avgAmplitude: 34,
        rms: 0.22,
        amplitudeScale: 0.44,
      });
    }

    const switchedProposalAmplitudes = readModeAmplitudeMap(
      structural.proposalResonantSlotsSource,
    );
    const switchedDisplayAmplitudes = readModeAmplitudeMap(
      structural.candidateResponseSlotsSource,
    );
    const staleProposalRatio = measureSharedAmplitudeRatio(
      sustainedProposalAmplitudes,
      switchedProposalAmplitudes,
    );
    const staleDisplayRatio = measureSharedAmplitudeRatio(
      sustainedDisplayAmplitudes,
      switchedDisplayAmplitudes,
    );

    expect(staleProposalRatio).toBeLessThan(0.78);
    expect(staleDisplayRatio).toBeLessThan(0.78);
    expect(staleDisplayRatio).toBeLessThanOrEqual(staleProposalRatio + 0.18);
  });

  it("uses signal identity when visible detail under-covers the shifted signal", () => {
    const featureState = createAudioFeatureState();
    const state = createModalExcitationState(16);
    let structural = null;

    const densePartials = [
      [110, 0.76],
      [165, 0.58],
      [220, 0.62],
      [277, 0.48],
      [330, 0.42],
      [440, 0.38],
      [660, 0.32],
      [990, 0.24],
      [3300, 0.22],
      [5200, 0.18],
      [7600, 0.16],
    ];

    for (let frame = 0; frame < 12; frame += 1) {
      structural = runModalFrame({
        state,
        featureState,
        frame,
        partials: densePartials,
        avgAmplitude: 32,
        rms: 0.2,
        amplitudeScale: 0.42,
      });
    }
    const sustainedDisplayAmplitudes = readModeAmplitudeMap(
      structural.candidateResponseSlotsSource,
    );

    for (let frame = 12; frame < 15; frame += 1) {
      structural = runModalFrame({
        state,
        featureState,
        frame,
        partials: [...densePartials.slice(0, 8), [10800, 0.92]],
        avgAmplitude: 34,
        rms: 0.22,
        amplitudeScale: 0.44,
      });
    }

    const switchedDisplayAmplitudes = readModeAmplitudeMap(
      structural.candidateResponseSlotsSource,
    );
    const staleDisplayRatio = measureSharedAmplitudeRatio(
      sustainedDisplayAmplitudes,
      switchedDisplayAmplitudes,
    );

    expect(staleDisplayRatio).toBeLessThan(0.72);
  });

  it("does not use coverage authority when retained detail has no material stale pressure", () => {
    const partials = [
      [5200, 0.52],
      [6400, 0.5],
      [7600, 0.48],
      [8800, 0.46],
      [10000, 0.44],
      [11200, 0.42],
    ];
    const probeState = createModalExcitationState(16);
    const probeInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft(partials),
      timeData: makeMixedTimeData({ partials, amplitudeScale: 0.34 }),
      avgAmplitude: 30,
      rms: 0.18,
    });
    probeInputs.modalExcitationState = probeState;
    const probeFastSignal = updateAudioFeatureFastSignalState(probeInputs);
    const probeStructural = buildModalExcitationStructuralState({
      preparedInputs: probeInputs,
      fastSignalState: probeFastSignal,
      existingState: probeState,
      performanceNow: () => 0,
    });
    const retainedOffset = 0;
    const retainedAmplitude =
      probeStructural.proposalResonantSlotsSource[retainedOffset + 3];

    expect(retainedAmplitude).toBeGreaterThan(0.2);

    const state = createModalExcitationState(16);
    state.blendResonant.slots[0] =
      probeStructural.proposalResonantSlotsSource[retainedOffset];
    state.blendResonant.slots[1] =
      probeStructural.proposalResonantSlotsSource[retainedOffset + 1];
    state.blendResonant.slots[2] =
      probeStructural.proposalResonantSlotsSource[retainedOffset + 2];
    state.blendResonant.slots[3] = retainedAmplitude;

    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft(partials),
      timeData: makeMixedTimeData({ partials, amplitudeScale: 0.34 }),
      avgAmplitude: 30,
      rms: 0.18,
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    expect(structural.structuralMetrics.resonantSignalAuthoritative).toBe(
      false,
    );
    expect(structural.structuralMetrics.resonantSignalAuthoritativeReason).toBe(
      "none",
    );
    expect(structural.structuralMetrics.resonantShiftReleaseOverrideCount).toBe(
      0,
    );
    expect(
      structural.structuralMetrics.resonantShiftTrackingOverrideCount,
    ).toBe(0);
  });

  it("does not promote weak broadband noise into sustained detail visibility", () => {
    const state = createModalExcitationState(16);
    const random = createDeterministicRandom(174);
    let structural = null;

    for (let frame = 0; frame < 28; frame += 1) {
      const peaks = Array.from({ length: 18 }, (_, index) => [
        500 + index * 430,
        0.04 + random() * 0.03,
      ]);
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft(peaks),
        timeData: makeMixedTimeData({
          partials: peaks,
          amplitudeScale: 0.08,
        }),
        avgAmplitude: 8,
        rms: 0.025,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(sumAmplitudes(structural.candidateResponseSlotsSource)).toBeLessThan(
      0.02,
    );
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeLessThanOrEqual(
      countActiveSlotsLocal(structural.proposalResonantSlotsSource),
    );
  });

  it("replaces stale visible detail keys within two frames of a treble switch", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    const firstInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.92],
        [6800, 0.74],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.36 }),
    });
    firstInputs.modalExcitationState = state;
    const firstFastSignal = updateAudioFeatureFastSignalState(firstInputs);
    const firstStructural = buildModalExcitationStructuralState({
      preparedInputs: firstInputs,
      fastSignalState: firstFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const firstVisibleKeys = readModeKeys(
      firstStructural.candidateResponseSlotsSource,
    );
    const firstDominantKey = firstVisibleKeys[0] ?? null;

    for (let frame = 1; frame <= 2; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [8200, 0.94],
          [9800, 0.68],
        ]),
        timeData: makeTimeData({ frequency: 8200, amplitude: 0.34 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const switchedVisibleKeys = readModeKeys(
      structural.candidateResponseSlotsSource,
    );
    expect(hasNewModeKey(switchedVisibleKeys, firstVisibleKeys)).toBe(true);
    expect(
      switchedVisibleKeys.length > 1 ||
        switchedVisibleKeys[0] !== firstDominantKey,
    ).toBe(true);
  });

  it("surfaces a new visible detail key within one frame under incumbent pressure", () => {
    const state = createModalExcitationState(16);
    const seededInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [5600, 0.84],
        [6400, 0.8],
        [7200, 0.76],
        [8600, 0.68],
        [9800, 0.6],
      ]),
      timeData: makeTimeData({ frequency: 6400, amplitude: 0.3 }),
    });
    seededInputs.modalExcitationState = state;
    const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
    const seededStructural = buildModalExcitationStructuralState({
      preparedInputs: seededInputs,
      fastSignalState: seededFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const seededVisibleKeys = readModeKeys(
      seededStructural.candidateResponseSlotsSource,
    );

    const freshInputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [5600, 0.62],
        [6400, 0.58],
        [7200, 0.54],
        [8600, 0.46],
        [10800, 0.96],
      ]),
      timeData: makeTimeData({ frequency: 10800, amplitude: 0.34 }),
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    const freshVisibleKeys = readModeKeys(
      freshStructural.candidateResponseSlotsSource,
    );
    expect(hasNewModeKey(freshVisibleKeys, seededVisibleKeys)).toBe(true);
  });

  it("cuts stale detail blend weight on a strong fresh treble switch", () => {
    const state = createModalExcitationState(16);
    let seededStructural = null;

    for (let frame = 0; frame < 4; frame += 1) {
      const seededInputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [5200, 0.9],
          [6200, 0.86],
          [7200, 0.82],
          [8400, 0.78],
          [9600, 0.74],
        ]),
        timeData: makeTimeData({ frequency: 6200, amplitude: 0.36 }),
      });
      seededInputs.modalExcitationState = state;
      const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
      seededStructural = buildModalExcitationStructuralState({
        preparedInputs: seededInputs,
        fastSignalState: seededFastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const seededVisibleAmplitudes = readModeAmplitudeMap(
      seededStructural.candidateResponseSlotsSource,
    );

    const freshInputs = createLineFeedPreparedInputs({
      frameTimeMs: 4 * 33,
      fftMagnitudes: makeFft([
        [5400, 0.18],
        [6200, 0.16],
        [7200, 0.14],
        [10400, 0.98],
        [11800, 0.92],
      ]),
      timeData: makeTimeData({ frequency: 10800, amplitude: 0.4 }),
      avgAmplitude: 44,
      rms: 0.28,
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 4,
    });

    const freshVisibleAmplitudes = readModeAmplitudeMap(
      freshStructural.candidateResponseSlotsSource,
    );
    const sharedRatio = measureSharedAmplitudeRatio(
      seededVisibleAmplitudes,
      freshVisibleAmplitudes,
    );

    expect(
      hasNewModeKey(
        readModeKeys(freshStructural.candidateResponseSlotsSource),
        [...seededVisibleAmplitudes.keys()],
      ),
    ).toBe(true);
    expect(sharedRatio).toBeLessThan(0.6);
    expect(freshStructural.structuralMetrics.resonantSignalAuthoritative).toBe(
      true,
    );
    expect(
      freshStructural.structuralMetrics.resonantSignalAuthoritativeReason,
    ).toBe("fresh-signal");
    expect(
      freshStructural.structuralMetrics.resonantShiftTrackingOverrideCount,
    ).toBeGreaterThanOrEqual(0);
    expect(
      freshStructural.structuralMetrics.resonantShiftReleaseOverrideCount,
    ).toBeGreaterThanOrEqual(0);
    expect(
      freshStructural.structuralMetrics.resonantShiftReleaseOverrideCount +
        freshStructural.structuralMetrics.resonantShiftTrackingOverrideCount,
    ).toBeGreaterThan(0);
  });

  it("keeps visible detail keys as a subset of the raw proposal shortlist", () => {
    const state = createModalExcitationState(16);
    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.92],
        [7600, 0.72],
        [9100, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.38 }),
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const proposalKeys = readModeKeys(structural.proposalResonantSlotsSource);

    expect(
      readModeKeys(structural.candidateResponseSlotsSource).every((key) =>
        proposalKeys.includes(key),
      ),
    ).toBe(true);
  });

  it("does not let a weaker near-duplicate assist evict a stronger incumbent", () => {
    const state = createModalExcitationState(16);
    const firstInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.96],
        [7600, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.38 }),
    });
    firstInputs.modalExcitationState = state;
    const firstFastSignal = updateAudioFeatureFastSignalState(firstInputs);
    const firstStructural = buildModalExcitationStructuralState({
      preparedInputs: firstInputs,
      fastSignalState: firstFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const firstDominantKey = readModeKeys(
      firstStructural.candidateResponseSlotsSource,
    )[0];

    const secondInputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [6450, 0.62],
        [7600, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 6450, amplitude: 0.22 }),
    });
    secondInputs.modalExcitationState = state;
    const secondFastSignal = updateAudioFeatureFastSignalState(secondInputs);
    const secondStructural = buildModalExcitationStructuralState({
      preparedInputs: secondInputs,
      fastSignalState: secondFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    expect(readModeKeys(secondStructural.candidateResponseSlotsSource)[0]).toBe(
      firstDominantKey,
    );
  });

  it("leaves fresh detail admission unreserved for downstream continuity", () => {
    const state = createModalExcitationState(16);
    const seededInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [5200, 0.88],
        [6200, 0.84],
        [7200, 0.8],
        [8600, 0.74],
        [9800, 0.68],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.34 }),
    });
    seededInputs.modalExcitationState = state;
    const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
    const seededStructural = buildModalExcitationStructuralState({
      preparedInputs: seededInputs,
      fastSignalState: seededFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const seededVisibleKeys = readModeKeys(
      seededStructural.candidateResponseSlotsSource,
    );

    const freshInputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [5400, 0.42],
        [6800, 0.48],
        [8200, 0.56],
        [9400, 0.62],
        [11100, 0.98],
      ]),
      timeData: makeTimeData({ frequency: 11100, amplitude: 0.34 }),
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });
    const freshVisibleKeys = readModeKeys(
      freshStructural.candidateResponseSlotsSource,
    );
    const newVisibleKeys = freshVisibleKeys.filter(
      (key) => !seededVisibleKeys.includes(key),
    );

    expect(newVisibleKeys.length).toBeGreaterThan(3);
    expect(
      newVisibleKeys.every((key) =>
        readModeKeys(freshStructural.proposalResonantSlotsSource).includes(key),
      ),
    ).toBe(true);
  });

  it("collapses proposal slots before the display blend releases to zero", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let lastStructural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      lastStructural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 16; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      lastStructural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      sumAmplitudes(lastStructural.proposalSourceCoupledSlotsSource),
    ).toBeLessThan(sumAmplitudes(lastStructural.candidateForcingSlotsSource));
    expect(
      sumAmplitudes(lastStructural.proposalReferenceSourceCoupledSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("keeps weak residual tails visible before the proposal layer fully clears", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let structural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 13; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      sumAmplitudes(structural.proposalSourceCoupledSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(
      sumAmplitudes(structural.proposalSourceCoupledSlotsSource),
    );
  });

  it("keeps retained projection visible after fresh source-coupled authority clears", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let structural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 16; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(structural.structuralMetrics.currentSignalAmplitude).toBe(0);
    expect(structural.structuralMetrics.currentSignalEnergy).toBe(0);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.modalResponseRenderPreviewLedger
        .projectedRenderEnergy,
    ).toBeGreaterThan(0);
  });

  it("keeps display slots sparser than proposal slots under dense sustained input", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 12; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
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
        timeData: makeTimeData({ frequency: 110, amplitude: 0.62 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      countActiveSlotsLocal(structural.proposalSourceCoupledSlotsSource),
    ).toBeGreaterThanOrEqual(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    );
    expect(sumAmplitudes(structural.candidateForcingSlotsSource)).toBeLessThan(
      sumAmplitudes(structural.proposalSourceCoupledSlotsSource),
    );
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeLessThanOrEqual(
      sumAmplitudes(structural.proposalResonantSlotsSource),
    );
  });

  it("does not fill visible detail with same-frequency families", () => {
    const state = createModalExcitationState(16);
    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.96],
        [6240, 0.92],
        [6280, 0.88],
        [7600, 0.72],
      ]),
      timeData: makeMixedTimeData({
        partials: [
          [6200, 0.96],
          [6240, 0.92],
          [6280, 0.88],
          [7600, 0.72],
        ],
        amplitudeScale: 0.32,
      }),
      avgAmplitude: 34,
      rms: 0.2,
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const frequencyByKey = new Map(
      state.atlasEntries.map((entry) => [
        `${entry.u}:${entry.v}:${entry.w}`,
        entry.naturalFrequencyHz,
      ]),
    );
    const visibleFrequencies = readModeKeys(
      structural.candidateResponseSlotsSource,
    ).map((key) => frequencyByKey.get(key));

    for (let left = 0; left < visibleFrequencies.length; left += 1) {
      for (
        let right = left + 1;
        right < visibleFrequencies.length;
        right += 1
      ) {
        expect(
          getRelativeFrequencyDistance(
            visibleFrequencies[left],
            visibleFrequencies[right],
          ),
        ).toBeGreaterThan(1e-9);
      }
    }
  });

  it("drops stale low-signal entries from display while keeping them in proposal slots", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
      [1650, 0.38],
      [6600, 0.34],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let structural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550, amplitude: 0.45 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 12; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      countActiveSlotsLocal(structural.proposalSourceCoupledSlotsSource),
    ).toBeGreaterThan(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    );
    expect(
      countActiveSlotsLocal(structural.referenceSourceCoupledSlotsSource),
    ).toBeLessThanOrEqual(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    );
    expect(
      countActiveSlotsLocal(structural.referenceSourceCoupledSlotsSource),
    ).toBeLessThanOrEqual(1);
    expect(
      countActiveSlotsLocal(
        structural.proposalReferenceSourceCoupledSlotsSource,
      ),
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Negative regression: visual scale must not leak into acoustic excitation
// ---------------------------------------------------------------------------

function readExcitationModeKeys(slots) {
  const keys = [];
  for (let offset = 0; offset < slots.length; offset += 4) {
    if ((slots[offset + 3] ?? 0) > 0) {
      keys.push(`${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`);
    }
  }
  return keys;
}

function runExcitationWithCavityOptions({
  radius = 3,
  cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS,
} = {}) {
  const state = createModalExcitationState(16);
  const fft = makeFft([
    [440, 0.9],
    [880, 0.5],
  ]);
  const preparedInputs = createPreparedInputs({
    frameTimeMs: 0,
    fftMagnitudes: fft,
    timeData: makeTimeData({ frequency: 440 }),
    radius,
    cavityAcousticScale,
    boundaryMode: "neumann",
  });
  preparedInputs.modalExcitationState = state;
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  return buildModalExcitationStructuralState({
    preparedInputs,
    fastSignalState,
    existingState: state,
    performanceNow: () => 0,
  });
}

describe("modal excitation acoustic scale ownership", () => {
  it("does not let visual radius change acoustic mode assignments", () => {
    const compactVisualResult = runExcitationWithCavityOptions({ radius: 0.5 });
    const largeVisualResult = runExcitationWithCavityOptions({ radius: 8 });

    expect(
      readExcitationModeKeys(compactVisualResult.candidateForcingSlotsSource),
    ).toEqual(
      readExcitationModeKeys(largeVisualResult.candidateForcingSlotsSource),
    );
  });

  it("changes mode assignments when the acoustic cavity scale changes", () => {
    const defaultResult = runExcitationWithCavityOptions();
    const compactAcousticResult = runExcitationWithCavityOptions({
      cavityAcousticScale: {
        ...CAVITY_ACOUSTIC_DEFAULTS,
        radiusMeters: 6,
      },
    });

    expect(
      readExcitationModeKeys(defaultResult.candidateForcingSlotsSource),
    ).not.toEqual(
      readExcitationModeKeys(compactAcousticResult.candidateForcingSlotsSource),
    );
  });
});
