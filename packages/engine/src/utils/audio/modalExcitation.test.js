import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { updateAudioFeatureFastSignalState } from "./audioFeatureAnalysis.js";
import { prepareAudioFeatureFrameInputs } from "./audioFeatureInputPreparation.js";
import { createAudioFeatureState } from "./audioFeatureState.js";
import {
  buildModalExcitationStructuralState,
  createModalExcitationState,
} from "./modalExcitation.js";
import { buildModalExcitationAtlas } from "./modalExcitationAtlas.js";
import {
  createBassHatFixture,
  createBroadbandNoiseFixture,
  createMajorTriadFixture,
  createSineToneFixture,
  createVocalLikeFixture,
} from "./audioFixtures.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../../core/modalBudgets.js";
import { deriveCavityModalFieldCacheBandwidth } from "../../core/raymarch/fieldCachePassband.js";
import { frequencyToBinIndex } from "./binFrequency.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const MAX_RENDER_PHASE_VELOCITY_RAD_PER_SEC = Math.PI * 1.25;
const MODAL_EXCITATION_SOURCE_URL = new URL(
  "./modalExcitation.js",
  import.meta.url,
);
const MODAL_OBSERVED_SCORING_SOURCE_URL = new URL(
  "./modalObservedScoring.js",
  import.meta.url,
);
const MODAL_OBSERVED_STATE_SOURCE_URL = new URL(
  "./modalObservedState.js",
  import.meta.url,
);
const MODAL_TOPOLOGY_SIGNAL_SOURCE_URL = new URL(
  "./modalTopologySignal.js",
  import.meta.url,
);

function readModalExcitationSource() {
  return readFileSync(MODAL_EXCITATION_SOURCE_URL, { encoding: "utf8" });
}

function readModalObservedScoringSource() {
  return readFileSync(MODAL_OBSERVED_SCORING_SOURCE_URL, { encoding: "utf8" });
}

function readModalObservedStateSource() {
  return readFileSync(MODAL_OBSERVED_STATE_SOURCE_URL, { encoding: "utf8" });
}

function readModalTopologySignalSource() {
  return readFileSync(MODAL_TOPOLOGY_SIGNAL_SOURCE_URL, {
    encoding: "utf8",
  });
}

function modeKeyToShellKey(modeKey) {
  const [u, v, w] = modeKey.split(":").map(Number);
  return `${u * u + v * v + w * w}`;
}

function readModeShellKeys(amplitudes) {
  return new Set(Array.from(amplitudes.keys(), modeKeyToShellKey));
}

function countRetainedModeShells(previous, next) {
  const previousShells = readModeShellKeys(previous);
  const nextShells = readModeShellKeys(next);
  return Array.from(previousShells).filter((key) => nextShells.has(key)).length;
}

function expectModalHelperBoundary({ helperPath, localFunctions }) {
  const source = readModalExcitationSource();

  expect(source).toContain(`} from "${helperPath}";`);
  for (const localFunction of localFunctions) {
    expect(source).not.toContain(`function ${localFunction}`);
  }
}

function extractFunctionSource(source, functionName) {
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

function extractModalExcitationFunctionSource(functionName) {
  return extractFunctionSource(readModalExcitationSource(), functionName);
}

function extractModalObservedStateFunctionSource(functionName) {
  return extractFunctionSource(readModalObservedStateSource(), functionName);
}

function extractModalTopologySignalFunctionSource(functionName) {
  return extractFunctionSource(readModalTopologySignalSource(), functionName);
}

it("routes every modal layer through the phase-slot helper", () => {
  const source = readModalExcitationSource();
  expectModalHelperBoundary({
    helperPath: "./modalPhaseSlots.js",
    localFunctions: [
      "deriveObservedModalPhaseState",
      "writePhaseSlotsForVisibleModes",
      "findModalPhaseEntryForSlot",
    ],
  });
  expect(source).toContain("target: state.sourceCoupledProposal.phaseSlots");
  expect(source).toContain("target: state.resonantProposal.phaseSlots");
  expect(source).toContain("target: state.blendSourceCoupled.phaseSlots");
  expect(source).toContain("target: state.blendResonant.phaseSlots");
});

it("keeps projection diagnostics in the modal projection helper", () => {
  expectModalHelperBoundary({
    helperPath: "./modalProjectionDiagnostics.js",
    localFunctions: [
      "createEmptyModalProjectionDiagnostics",
      "measureModalProjection",
      "mergeModalProjectionDiagnostics",
    ],
  });
});

it("keeps source-signal measurement in the modal drive analysis helper", () => {
  expectModalHelperBoundary({
    helperPath: "./modalDriveAnalysis.js",
    localFunctions: [
      "buildDriveBufferFromTimeData",
      "computeDrivePeriodicity",
      "computeModeResponse",
    ],
  });
});

it("keeps topology evidence at its owner seam", () => {
  expectModalHelperBoundary({
    helperPath: "./modalTopologySignal.js",
    localFunctions: ["deriveCurrentResonantTopologySignal"],
  });
});

it("keeps source evidence and oscillator response at their owner seam", () => {
  expectModalHelperBoundary({
    helperPath: "./modalObservationResponseFrame.js",
    localFunctions: [
      "advanceModalObservationResponseFrame",
      "isModalExcitationHardSilentFrame",
      "resolvePreparedSourceEvidence",
      "advancePhysicalModalResponseFrame",
    ],
  });
});

it("keeps physical amplitude out of canonical observed modal state", () => {
  const source = extractModalObservedStateFunctionSource(
    "createObservedModalModeEntry",
  );

  expect(source).toContain("observationConfidence: confidence");
  expect(source).toContain("coherence,");
  expect(source).not.toContain("displayProjectionAmplitude");
  expect(source).not.toContain("retainedEnergy");
  expect(source).not.toContain("amplitude:");
  expect(source).not.toContain("displayContinuity");
});

it("keeps resonant sparse evidence out of topology ownership", () => {
  const source = extractModalTopologySignalFunctionSource(
    "deriveResonantTopologySignal",
  );

  expect(source).not.toContain("resonantSparseEvidence");
  expect(source).toContain("resonantObservationConfidence");
  expect(source).toContain("resonantRingSupport");
  expect(source).toContain("resonantObservedDrive");
  expect(source).toContain("resonantObservedCoherence");
});

it("uses the oscillator coefficient as the sole projection priority", () => {
  const projectionShortlistSource = extractModalExcitationFunctionSource(
    "buildProjectionShortlist",
  );

  expect(projectionShortlistSource).toContain("modalResponseDisplayAmplitude");
  expect(projectionShortlistSource).toContain("displayProjectionAmplitude");
  expect(projectionShortlistSource).not.toContain("currentDriveEnergy");
  expect(projectionShortlistSource).not.toContain("coherence");
  expect(projectionShortlistSource).not.toContain("displayContinuity");
});

it("keeps semantic modal candidate projection outside shortlist scoring", () => {
  const projectionShortlistSource = extractModalExcitationFunctionSource(
    "buildProjectionShortlist",
  );

  expect(projectionShortlistSource).toContain("displayProjectionAmplitude");
  expect(projectionShortlistSource).not.toContain("signalAmplitude");
  expectModalHelperBoundary({
    helperPath: "./modalCandidateProjection.js",
    localFunctions: ["buildModalCandidateState"],
  });
});

it("publishes observation confidence instead of an audio-side fog category", () => {
  const source = readModalExcitationSource();
  const retiredFogAdmissionField = "suppressed" + "ByFog";

  expect(source).toContain("modalObservationCoherence");
  expect(source).toContain("modalObservationConfidence");
  expect(source).not.toContain(retiredFogAdmissionField);
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
    sourceSession: createSourceSession(),
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

function createSourceSession({
  kind = "file",
  phase = "active",
  sessionId = 1,
  timelineRevision = 0,
  terminalReason = null,
  deviceKind = null,
} = {}) {
  return {
    kind,
    phase,
    sessionId,
    timelineRevision,
    terminalReason,
    systemCapture:
      kind === "system"
        ? {
            deviceId: "test-device",
            deviceKind: deviceKind ?? "live",
            label: "Test input",
          }
        : null,
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
  fftLinearAmplitudes,
  timeData,
  status = createStatus(),
  cavityGeometry = "rectangular",
  cavityAcousticScale = undefined,
  boundaryMode = undefined,
  avgAmplitude = 24,
  rms = 0.2,
  radius = 3,
  featureState = createAudioFeatureState(status.capacity),
  auditSettings = undefined,
}) {
  return prepareAudioFeatureFrameInputs({
    featureState,
    analysisSnapshot: {
      sourceMode: "file",
      avgAmplitude,
      fftLinearAmplitudes,
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
    auditSettings,
  });
}

it("bounds modal oscillator velocities before phase-slot upload", () => {
  const state = createModalExcitationState(16);
  const preparedInputs = createPreparedInputs({
    frameTimeMs: 33,
    fftLinearAmplitudes: makeFft([[440, 1]]),
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
  expect(velocities.length).toBeGreaterThan(0);
  expect(
    velocities.every(
      (velocity) => Math.abs(velocity) <= MAX_RENDER_PHASE_VELOCITY_RAD_PER_SEC,
    ),
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

function computeModalEnergyWeightedOrder(amplitudes) {
  let weightedOrder = 0;
  let totalEnergy = 0;
  for (const [modeKey, amplitude] of amplitudes) {
    const order = modeKey
      .split(":")
      .reduce((sum, component) => sum + Number(component), 0);
    const energy = amplitude * amplitude;
    weightedOrder += order * energy;
    totalEnergy += energy;
  }
  return weightedOrder / Math.max(totalEnergy, 1e-12);
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
    fftLinearAmplitudes: makeFft(partials),
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
  "amplitude",
  "displayProjectionAmplitude",
  "retainedEnergy",
  "currentDriveEnergy",
  "driveEnergy",
  "persistence",
  "resonantMaturity",
  "displayContinuityDriveEnergy",
  "displayContinuityCoherence",
  "displayContinuityPersistence",
  "resonantDisplayContinuityMaturity",
  "resonantDisplayContinuity",
  "subtleResonantDisplayContinuity",
  "sourceCoupledDisplayContinuity",
  "observedModal",
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
      observationConfidence: expect.any(Number),
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

function expectObservedConfidenceOnlyEntries(state) {
  const entries = Array.from(state.observedModes?.values?.() ?? []);

  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry.observationConfidence).toBeGreaterThanOrEqual(0);
    for (const field of REMOVED_MODAL_OBSERVER_ENTRY_FIELDS) {
      expect(entry[field]).toBeUndefined();
    }
  }
}

describe("modal excitation structural state", () => {
  it("publishes the oscillator coefficient without a second amplitude recurrence", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createPreparedInputs({
      frameTimeMs: 33,
      fftLinearAmplitudes: makeFft([
        [440, 0.9],
        [880, 0.45],
      ]),
      timeData: makeTimeData({ frequency: 440, amplitude: 0.55 }),
    });
    preparedInputs.modalExcitationState = state;

    buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState: updateAudioFeatureFastSignalState(preparedInputs),
      existingState: state,
      performanceNow: () => 0,
    });

    const physicalEntries = Array.from(state.activeModes.values()).filter(
      (entry) => (entry.modalResponseDisplayAmplitude ?? 0) > 0,
    );
    expect(physicalEntries.length).toBeGreaterThan(0);
    for (const entry of physicalEntries) {
      expect(entry.amplitude).toBeCloseTo(
        entry.modalResponseDisplayAmplitude,
        8,
      );
      expect(entry.driveEnergy).toBeCloseTo(entry.modalResponseDrive, 8);
    }
  });

  let lineFeedProgramFeatureState = null;

  function isLineFeedPreparedStatus(status = {}) {
    const sourceSession = status.sourceSession;
    return (
      sourceSession?.kind === "system" &&
      (sourceSession.systemCapture?.deviceKind === "system" ||
        status.resolvedLiveInputAnalysisClass === "line-feed")
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

  function collectActiveSpectralMoments(
    momentSlots,
    modalSlots,
    minCoefficient = 0.05,
  ) {
    const moments = [];
    for (let offset = 0; offset < momentSlots.length; offset += 4) {
      if ((modalSlots[offset + 3] ?? 0) <= minCoefficient) {
        continue;
      }
      moments.push({
        m1x: momentSlots[offset] ?? 0,
        m1y: momentSlots[offset + 1] ?? 0,
        m2x: momentSlots[offset + 2] ?? 0,
        m2y: momentSlots[offset + 3] ?? 0,
      });
    }
    return moments;
  }

  function maxSpectralMomentDistance(moments) {
    let maxDistance = 0;
    for (let left = 0; left < moments.length; left += 1) {
      for (let right = left + 1; right < moments.length; right += 1) {
        maxDistance = Math.max(
          maxDistance,
          Math.hypot(
            moments[left].m1x - moments[right].m1x,
            moments[left].m1y - moments[right].m1y,
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
    expect(state.modalOscillatorStates).toBeInstanceOf(Map);
    expect(state.sourceCoupledProposal?.slots).toBeInstanceOf(Float32Array);
    expect(state.resonantProposal?.slots).toBeInstanceOf(Float32Array);
    expect(state).not.toHaveProperty("diagnostics");
    expect(state.sourceCoupled).toBeUndefined();
    expect(state.resonant).toBeUndefined();
    expectLegacyModalObserverAuthoritiesRemoved(state);
  });

  it("builds persistent backbone structure for stable source coupling", () => {
    const baseState = createModalExcitationState(16);
    const firstInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: makeFft([
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
    expect(
      secondStructural.structuralMetrics.sourceCoupledModalEnergy,
    ).toBeGreaterThan(0);
    expect(secondStructural.structuralMetrics.modalPersistence).toBeGreaterThan(
      0.03,
    );
    expect(secondStructural.structuralMetrics.modeCoherence).toBeGreaterThan(0);
    expect(secondStructural.structuralMetrics.driveSource).toBe("time-domain");
  });

  it("tracks source-coupled confidence separately from modal response", () => {
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
      structural.structuralMetrics.sourceCoupledObservedModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.sourceCoupledObservationConfidence,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.sourceCoupledObservedCoherence,
    ).toBeGreaterThan(0);
    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0);
    expectCanonicalObservedModeEntries(state);
  });

  it("does not retain topology from activeModes without observer authority", () => {
    const state = createModalExcitationState(16);
    state.activeModes.set("0:0:2", {
      modeKey: "0:0:2",
      familyId: "family:0:0:2",
      u: 0,
      v: 0,
      w: 2,
      layer: "source-coupled",
      renderLayer: "source-coupled",
      qualityFactor: 4,
      naturalFrequencyHz: 220,
      order: 2,
      driveWeight: 1,
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
      fftLinearAmplitudes: makeFft([[880, 0.02]]),
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
    state.modalOscillatorStates.set("0:0:2", {
      modeKey: "0:0:2",
      modalResponseEnergy: 0.18,
    });
    state.observedModes.clear();

    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
      fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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

  it("retains low-frequency coherent resonant modes through observer authority", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 160; frame += 1) {
      const strike = frame < 2;
      const amplitudeScale = strike ? 0.42 : 0.045;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft([
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

  it("publishes one modal candidate state for current and retained evidence", () => {
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

    expect(state.modalCandidateState).toBeInstanceOf(Map);
    expect(state.modalCandidateState.size).toBeGreaterThan(0);
    expect(structural.modalCandidateState).toBe(state.modalCandidateState);
    expect(structural).not.toHaveProperty("modalCandidates");
    expect(state).not.toHaveProperty("modalCandidates");
    for (const candidate of state.modalCandidateState.values()) {
      expect(candidate).toMatchObject({
        modeKey: expect.any(String),
        naturalFrequencyHz: expect.any(Number),
        qualityFactor: expect.any(Number),
        dampingRatio: expect.any(Number),
        forcingEnergy: expect.any(Number),
        observedSupport: expect.any(Number),
      });
    }
  });

  it("reports canonical first and second circular pitch moments", () => {
    const baseState = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
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

    const moments = collectActiveSpectralMoments(
      structural.sourceCoupledSpectralMomentSource,
      structural.candidateForcingSlotsSource,
      0,
    ).concat(
      collectActiveSpectralMoments(
        structural.resonantSpectralMomentSource,
        structural.candidateResponseSlotsSource,
        0,
      ),
    );

    expect(moments.length).toBeGreaterThan(0);
    for (const moment of moments) {
      expect(Math.hypot(moment.m1x, moment.m1y)).toBeCloseTo(1, 6);
      expect(Math.hypot(moment.m2x, moment.m2y)).toBeCloseTo(1, 6);
      expect(moment.m2x).toBeCloseTo(
        moment.m1x * moment.m1x - moment.m1y * moment.m1y,
        6,
      );
      expect(moment.m2y).toBeCloseTo(2 * moment.m1x * moment.m1y, 6);
    }
    expect(
      Math.hypot(...structural.modalFieldSpectralSeedDirection),
    ).toBeCloseTo(1, 6);
  });

  it("keeps tone and chord fixtures stable in modal and pitch-basis slots", () => {
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
        fftLinearAmplitudes: fixture.fftLinearAmplitudes,
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
      expect(structural.sourceCoupledSpectralMomentSource?.length).toBe(
        structural.candidateForcingSlotsSource.length,
      );
      expect(structural.resonantSpectralMomentSource?.length).toBe(
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
      fftLinearAmplitudes: fixture.fftLinearAmplitudes,
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

    const moments = collectActiveSpectralMoments(
      structural.sourceCoupledSpectralMomentSource,
      structural.candidateForcingSlotsSource,
      0,
    ).concat(
      collectActiveSpectralMoments(
        structural.resonantSpectralMomentSource,
        structural.candidateResponseSlotsSource,
        0,
      ),
    );

    expect(moments.length).toBeGreaterThan(0);
    for (const moment of moments) {
      expect(moment).not.toHaveProperty("keyTonic");
      expect(moment).not.toHaveProperty("keyMode");
      expect(moment).not.toHaveProperty("keyConfidence");
      expect(moment).not.toHaveProperty("hue");
      expect(Math.hypot(moment.m1x, moment.m1y)).toBeCloseTo(1, 6);
    }
  });

  it("keeps injected-tone pitch moments owned by modal frequencies", () => {
    const state = createModalExcitationState(16);
    let structural = null;
    for (let frame = 0; frame < 8; frame += 1) {
      const preparedInputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
        timeData: null,
        auditSettings: {
          injectTestTone: true,
          testToneHz: 330,
          testToneAmplitude: 0.5,
          testToneSignal: "harmonic-series",
          freezeModeSlots: false,
          enabled: false,
        },
      });
      preparedInputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(preparedInputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const moments = collectActiveSpectralMoments(
      structural.sourceCoupledSpectralMomentSource,
      structural.candidateForcingSlotsSource,
    ).concat(
      collectActiveSpectralMoments(
        structural.resonantSpectralMomentSource,
        structural.candidateResponseSlotsSource,
      ),
    );

    expect(moments.length).toBeGreaterThanOrEqual(3);
    expect(maxSpectralMomentDistance(moments)).toBeGreaterThan(0.25);
  });

  it("clears stale projected moments when current modal ownership changes", () => {
    const state = createModalExcitationState(16);
    state.blendSourceCoupled.slots.set([8, 8, 8, 0.5]);
    state.blendSourceCoupled.spectralMomentSlots.set([0, 1, -1, 0]);

    const fixture = createSineToneFixture(440);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 120,
      fftLinearAmplitudes: fixture.fftLinearAmplitudes,
      timeData: fixture.timeData,
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
    const moments = structural.sourceCoupledSpectralMomentSource;
    let staleMomentMagnitude = 0;
    for (let offset = 0; offset < moments.length; offset += 4) {
      if (
        slots[offset] === 8 &&
        slots[offset + 1] === 8 &&
        slots[offset + 2] === 8 &&
        Math.hypot(moments[offset], moments[offset + 1]) > staleMomentMagnitude
      ) {
        staleMomentMagnitude = Math.hypot(
          moments[offset],
          moments[offset + 1],
        );
      }
    }

    expect(staleMomentMagnitude).toBe(0);
  });

  it("routes bright coherent cache-edge energy into detail modes", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
        [954.6, 0.92],
        [961.9, 0.44],
      ]),
      timeData: makeTimeData({ frequency: 954.6, amplitude: 0.35 }),
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
    expect(structuralState.dominantFrequency).toBeGreaterThan(900);
    expect(structuralState.dominantFrequency).toBeLessThanOrEqual(
      deriveCavityModalFieldCacheBandwidth({
        sideLengthMeters: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
        soundSpeedMetersPerSecond:
          CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond,
        boundaryMode: "neumann",
      }).tailMaxFrequencyHz,
    );
    expect(
      structuralState.structuralMetrics.resonantModalEnergy,
    ).toBeGreaterThan(0);
    expect(structuralState.structuralMetrics.driveSource).toBe("time-domain");
  });

  it("falls back to spectral drive only when time data is unavailable", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
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

  it("uses spectral drive when the time buffer carries no signal", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: new Float32Array(4096),
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
    expect(
      structuralState.structuralMetrics.modalResponseEnergy,
    ).toBeGreaterThan(0);
  });

  it("enforces slot capacity in slot units across proposal and display layers", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: makeFft([
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

  it("resolves a spherical request to the supported rectangular geometry", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
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
    expect(structuralState.analysisEngine).toBe("modal-excitation");
  });

  it("saturates amplitude to <= 1.0 under sustained strong input", () => {
    const state = createModalExcitationState(16);
    const fftLinearAmplitudes = makeFft([
      [110, 0.99],
      [220, 0.85],
      [330, 0.7],
    ]);
    const timeData = makeTimeData({ frequency: 110, amplitude: 0.95 });

    for (let frame = 0; frame < 300; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes,
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

  it("measures a quiet coherent tone without granting noise-floor render authority", () => {
    const state = createModalExcitationState(16);
    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([[110, 0.001]]),
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
    expect(state.activeModes.size).toBeGreaterThan(0);
    expect(structural.structuralMetrics.modalResponseEnergy).toBeGreaterThan(0);
  });

  it("applies only one common field scale to oscillator coefficients", () => {
    const state = createModalExcitationState(16);

    for (let frame = 0; frame < 20; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft([
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
      const ratios = [];
      for (
        let offset = 0;
        offset < state.sourceCoupledProposal.slots.length;
        offset += 4
      ) {
        const ownerAmplitude = state.sourceCoupledProposal.slots[offset + 3];
        const projectedAmplitude =
          structural.candidateForcingSlotsSource[offset + 3];
        if (ownerAmplitude > 0 && projectedAmplitude > 0) {
          ratios.push(projectedAmplitude / ownerAmplitude);
        }
      }

      expect(ratios.length).toBeGreaterThan(0);
      expect(Math.max(...ratios)).toBeLessThanOrEqual(1);
      expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1e-5);
    }
  });

  it("does not add release sustain from weak file meter-only fade residue", () => {
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
        fftLinearAmplitudes: activeFft,
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
        fftLinearAmplitudes: silentFft,
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
    ).toBe(false);
    expect(silenceFrames.at(-1).blended).toBeLessThanOrEqual(
      silenceFrames.at(-1).proposal + 1e-4,
    );
  });

  it("suppresses the rendered tail while the oscillator decays on true hard silence", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let activeProposalAmplitude = 0;
    let activeBlendedAmplitude = 0;
    let hardSilentStructural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: activeFft,
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
      activeProposalAmplitude = sumAmplitudes(
        structural.proposalSourceCoupledSlotsSource,
      );
    }

    for (let frame = 10; frame < 64; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: silentFft,
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
    ).toBeLessThan(activeProposalAmplitude);
    expect(
      sumAmplitudes(hardSilentStructural.candidateForcingSlotsSource),
    ).toBeLessThan(activeBlendedAmplitude * 0.08);
  });

  it("cuts render authority on residual line-feed meter floor without modal input", () => {
    const state = createModalExcitationState(16);
    const featureState = createAudioFeatureState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "system",
      }),
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
        fftLinearAmplitudes: activeFft,
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
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
    expect(structural.activeSourceCoupledModeCount).toBe(0);
    expect(structural.activeResonantModeCount).toBe(0);
    expect(structural.activeModeCount).toBe(0);
    const renderFacingSlotSources = [
      structural.candidateForcingSlotsSource,
      structural.candidateResponseSlotsSource,
      structural.sourceCoupledPhaseSlotsSource,
      structural.resonantPhaseSlotsSource,
      structural.referenceSourceCoupledSlotsSource,
      structural.referenceResonantSlotsSource,
      structural.sourceCoupledSpectralMomentSource,
      structural.resonantSpectralMomentSource,
    ];
    for (const slots of renderFacingSlotSources) {
      expect(slots).toBeInstanceOf(Float32Array);
      expect(slots.every((value) => value === 0)).toBe(true);
    }
  });

  it("cuts loopback transport silence without waiting for the file release hold", () => {
    const state = createModalExcitationState(16);
    const featureState = createAudioFeatureState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "system",
      }),
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
        fftLinearAmplitudes: activeFft,
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
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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

  it("does not add a second temporal envelope after the oscillator response", () => {
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
        fftLinearAmplitudes: makeFft([
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

    expect(average(blendedDeltas)).toBeCloseTo(average(rawDeltas), 8);
    expect(average(blendedDeltas.slice(-10))).toBeCloseTo(
      average(rawDeltas.slice(-10)),
      8,
    );
  });

  it("surfaces a physical detail response within two upper structural frames", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 2; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft([
          [2200, 0.92],
          [2700, 0.72],
          [3200, 0.58],
        ]),
        timeData: makeTimeData({ frequency: 2200, amplitude: 0.38 }),
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
    expectObservedConfidenceOnlyEntries(state);
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

  it("keeps meter-loud bass structure without stale resonant authority", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
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
        fftLinearAmplitudes: makeFft(isStrike ? partials : []),
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
    expectObservedConfidenceOnlyEntries(state);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource) +
        sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.035);
    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource) +
        countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(3);
    expect(
      structural.structuralMetrics.sourceCoupledObservedModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.sourceCoupledObservationConfidence,
    ).toBeGreaterThan(0.035);
    expect(structural.structuralMetrics.resonantObservedModeCount).toBe(0);
    expect(structural.structuralMetrics.resonantObservationConfidence).toBe(0);
    expect(structural.structuralMetrics.resonantRingSupport).toBe(0);
    expect(structural.structuralMetrics.projectionResonantProtection).toBe(0);
    expect(structural.structuralMetrics.modalResponseEnergy).toBeGreaterThan(
      0.1,
    );
    expect(
      structural.structuralMetrics.projectionRawEnergySourceCoupled,
    ).toBeGreaterThan(0);
    expect(
      Array.from(state.observedModes?.values?.() ?? []).filter(
        (entry) => entry.layer === "resonant",
      ).length,
    ).toBe(0);
    expectLegacyModalObserverAuthoritiesRemoved(state);
  });

  it("does not preserve unforced treble through a long periodic bass sustain", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
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
        fftLinearAmplitudes: makeFft(isStrike ? partials : []),
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

    expect(
      structural.structuralMetrics.sourceCoupledObservedModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.sourceCoupledObservationConfidence,
    ).toBeGreaterThan(0.035);
    expect(structural.structuralMetrics.resonantRingSupport).toBe(0);
    expect(structural.structuralMetrics.resonantObservedModeCount).toBe(0);
    expect(structural.structuralMetrics.resonantObservationConfidence).toBe(0);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource) +
        sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.035);
    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource) +
        countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps observer phase diagnostics separate from physical phase slots", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
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
        fftLinearAmplitudes: makeFft(partials),
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

    expectObservedConfidenceOnlyEntries(state);
    expect(
      structural.structuralMetrics.modalPhaseAuthority,
    ).toBeGreaterThanOrEqual(0);
    expect(
      structural.structuralMetrics.resonantPhaseAuthority,
    ).toBeGreaterThanOrEqual(0);
    expect(
      structural.structuralMetrics.sourceCoupledPhaseAuthority,
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
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 420; frame += 1) {
      const isStrike = frame < 2;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: isStrike
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

    expect(structural.structuralMetrics.resonantRingSupport).toBeGreaterThan(
      0.08,
    );
    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThanOrEqual(4);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0.004);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource) +
        sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(4);
  });

  it("keeps observed resonant detail through brief noisy observation dropouts", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 48; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: isStrike
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

    const supportedConfidence =
      structural.structuralMetrics.resonantObservationConfidence;
    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThan(0);
    expect(supportedConfidence).toBeGreaterThan(0.02);

    // Two 33 ms structural frames are a real short analysis dropout. The old
    // 24-frame fixture was 792 ms and encoded a long peak hold, not continuity.
    for (let frame = 48; frame < 50; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft([]),
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

    expect(structural.structuralMetrics.resonantRingSupport).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.resonantRingSupport,
    ).toBeLessThanOrEqual(1);
    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(supportedConfidence * 0.1);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource) +
        sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
  });

  it("keeps observed resonant detail when a ringing bowl tail alternates dominant partials", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 96; frame += 1) {
      const isStrike = frame < 8;
      const tailDominantFrequency = frame % 2 === 0 ? 196 : 282;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: isStrike
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
          structural.structuralMetrics.resonantObservedModeCount,
        ).toBeGreaterThan(0);
        expect(
          structural.structuralMetrics.resonantObservationConfidence,
        ).toBeGreaterThan(0.004);
      }
    }

    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.0025);
  });

  it("refreshes resonant detail from sustained upper bowl harmonics after the strike", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
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
        fftLinearAmplitudes: makeFft(partials),
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

    expect(structural.structuralMetrics.resonantObservedDrive).toBeGreaterThan(
      0.0025,
    );
    expect(freshlyObservedResonantModes.length).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0.003);
  });

  it("observes resonant detail from low-meter bowl strikes before the tail", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 180; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: isStrike
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

    expect(structural.structuralMetrics.resonantRingSupport).toBeGreaterThan(
      0.08,
    );
    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0.004);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("observes resonant detail from soft coherent bowl strikes before the tail", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: isStrike
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

    expect(structural.structuralMetrics.resonantRingSupport).toBeGreaterThan(
      0.08,
    );
    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0.003);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("observes resonant detail from a soft coherent bowl without a loud seed strike", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    const softResonantPartials = [
      [794.3, 0.0012],
      [820.3, 0.00095],
      [954.6, 0.00072],
    ];
    let structural = null;

    for (let frame = 0; frame < 240; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft(softResonantPartials),
        timeData: makeMixedTimeData({
          partials: softResonantPartials,
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
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0.003);
    expect(structural.structuralMetrics.resonantRingSupport).toBeGreaterThan(
      0.08,
    );
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

  it("observes resonant detail from an E2-range coherent bowl fundamental", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "system",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
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
        fftLinearAmplitudes: makeFft(e2BowlTone),
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
      structural.structuralMetrics.sourceCoupledObservedModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThanOrEqual(2);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0.003);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThanOrEqual(2);
  });

  it("lets aged resonant observation own periodic bowl tails", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 36; frame += 1) {
      const isStrike = frame < 8;
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: isStrike
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

    expect(
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThan(0);
    expect(structural.structuralMetrics.resonantRingSupport).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.resonantRingSupport,
    ).toBeLessThanOrEqual(1);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeGreaterThan(0);
    expectCanonicalObservedModeEntries(state);
  });

  it("keeps dense sustained music detail active without resonant observer authority", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "system",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 96; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeDenseFft({
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
    ).toBeGreaterThan(0);
    expect(structural.structuralMetrics.resonantProjectionLoad).toBeGreaterThan(
      0.1,
    );
    expect(
      structural.structuralMetrics.projectionConservationApplied,
    ).toBeUndefined();
    expect(structural.structuralMetrics).not.toHaveProperty(
      "projectionEnergyNormalizationApplied",
    );
    expect(structural.structuralMetrics).not.toHaveProperty(
      "projectionAllocatedEnergyResonant",
    );
    expect(
      structural.structuralMetrics.projectionOverlapPressureResonant,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.projectionRawEnergyResonant,
    ).toBeGreaterThan(0);
    expect(
      sumSquaredAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("clears resonant response and observer evidence after loaded ring-down", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 8; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft(INHARMONIC_BOWL_STRIKE_PARTIALS),
        timeData: makeMixedTimeData({
          partials: INHARMONIC_BOWL_STRIKE_PARTIALS,
          amplitudeScale: 1,
        }),
        avgAmplitude: 42,
        rms: 0.32,
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
      structural.structuralMetrics.resonantObservedModeCount,
    ).toBeGreaterThan(0);
    const preSilenceResonantAmplitude = sumAmplitudes(
      structural.candidateResponseSlotsSource,
    );
    const preSilenceProposalAmplitude = sumAmplitudes(
      structural.proposalResonantSlotsSource,
    );
    const preSilenceResonantEnergy =
      structural.structuralMetrics.resonantObservationConfidence;
    const preSilencePhysicalEnergy =
      structural.structuralMetrics.modalResponseResonantEnergy;

    for (let frame = 8; frame < 16; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
    expect(structural.structuralMetrics.resonantObservedModeCount).toBe(0);
    expect(structural.structuralMetrics.resonantObservationConfidence).toBe(0);
    expect(structural.structuralMetrics.resonantRingSupport).toBe(0);
    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeLessThanOrEqual(preSilenceResonantEnergy);
    expect(
      structural.structuralMetrics.modalResponseResonantEnergy,
    ).toBeLessThan(preSilencePhysicalEnergy * 0.01);
    expect(structural.structuralMetrics.modalResponseRenderEnergy).toBeLessThan(
      preSilenceResonantAmplitude,
    );
    expect(sumAmplitudes(structural.proposalResonantSlotsSource)).toBeLessThan(
      preSilenceProposalAmplitude,
    );
    expectLegacyModalObserverAuthoritiesRemoved(state);
  });

  it("keeps zero-input resonant ring-out diagnostic-only on the energy ledger", () => {
    const state = createModalExcitationState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 18; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft(LOUD_BOWL_TONE_PARTIALS),
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "live",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 18; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft(LOUD_BOWL_TONE_PARTIALS),
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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

  it("retains resonant detail after the strike seeds stable modes", () => {
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

    const opening = frames.get(7);
    const mature = frames.get(12);
    expect(opening.amplitude).toBeGreaterThan(0);
    expect(mature.amplitude).toBeGreaterThan(0);
    expect(mature.meaningfulResonantCount).toBeGreaterThanOrEqual(4);
  });

  it("admits resonant detail for low-level coherent routed input", () => {
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
    expectObservedConfidenceOnlyEntries(state);
    expect(structural.structuralMetrics.resonantModalEnergy).toBeGreaterThan(0);
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

  it("keeps a physically decaying quiet ring available while source fades", () => {
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
          resonantModalEnergy: structural.structuralMetrics.resonantModalEnergy,
        });
      }
    }

    const [earlyTail, midTail, lateTail] = snapshots;
    expect(earlyTail.proposalResonant).toBeGreaterThan(0);
    expect(midTail.proposalResonant).toBeGreaterThan(0);
    expect(lateTail.proposalResonant).toBeGreaterThan(0);
    expect(midTail.proposalResonant).toBeLessThan(earlyTail.proposalResonant);
    expect(lateTail.resonantModalEnergy).toBeLessThan(
      earlyTail.resonantModalEnergy,
    );
    expect(lateTail.resonantModalEnergy).toBeGreaterThan(0);
  });

  it("deblooms a coherent ring by shrinking retained modal structure", () => {
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
          resonantModalEnergy: structural.structuralMetrics.resonantModalEnergy,
        });
      }
    }

    const open = snapshots.get(12);
    const late = snapshots.get(36);
    const tail = snapshots.get(48);

    expect(sumModeAmplitudeMap(open.modeAmplitudes)).toBeGreaterThan(0);
    expect(late.amplitude).toBeGreaterThan(0);
    expect(
      sumSharedModeAmplitudes(late.modeAmplitudes, tail.modeAmplitudes),
    ).toBeLessThan(sumModeAmplitudeMap(late.modeAmplitudes));
    expect(tail.resonantModalEnergy).toBeLessThan(late.resonantModalEnergy);
    expect(tail.resonantModalEnergy).toBeGreaterThan(0);
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
    const preSilenceProposalAmplitude = sumAmplitudes(
      structural.proposalResonantSlotsSource,
    );
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);

    for (let frame = 40; frame < 94; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: silentFft,
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
    expect(sumAmplitudes(structural.proposalResonantSlotsSource)).toBeLessThan(
      preSilenceProposalAmplitude,
    );
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
    expect(structural.structuralMetrics.modalDriveEnergy).toBeGreaterThan(0);
    expect(structural.structuralMetrics.modalResponseEnergy).toBeGreaterThan(
      structural.structuralMetrics.modalDriveEnergy,
    );
    expect(structural.structuralMetrics.resonantModalEnergy).toBeGreaterThan(0);
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
    expectObservedConfidenceOnlyEntries(state);
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
    expectObservedConfidenceOnlyEntries(state);
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

    expectObservedConfidenceOnlyEntries(state);
    expect(
      countActiveSlotsLocal(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource),
    ).toBeGreaterThan(0.0015);
    expect(
      structural.structuralMetrics.modalResponseRenderEnergy,
    ).toBeGreaterThan(0);
  });

  it("does not blank resonant detail when a quiet bowl tail dominant bin jitters", () => {
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
        fftLinearAmplitudes: makeFft(
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
      if (
        (structural.structuralMetrics.resonantObservationConfidence ?? 0) > 0
      ) {
        if ((structural.structuralMetrics.resonantRingSupport ?? 0) <= 0) {
          unsupportedObserverFrames.push(frame);
        }
        if (
          countActiveSlotsLocal(structural.candidateResponseSlotsSource) === 0
        ) {
          blankResonantFrames.push(frame);
        }
      }
    }

    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0);
    expect(unsupportedObserverFrames).toEqual([]);
    expect(blankResonantFrames).toEqual([]);
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("does not leave observer authority after the oscillator response clears", () => {
    const state = createModalExcitationState(16);
    const featureState = createAudioFeatureState(16);
    const status = createStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "system",
      }),
      analysisSource: "live",
      isPlaying: false,
      isLiveInputActive: true,
      resolvedLiveInputAnalysisClass: "line-feed",
    });
    let structural = null;

    for (let frame = 0; frame < 128; frame += 1) {
      const isStrike = frame < 4;
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft(
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

    expect(
      structural.structuralMetrics.resonantObservationConfidence,
    ).toBeGreaterThan(0);
    const preGapModalResponseEnergy =
      structural.structuralMetrics.modalResponseEnergy;
    const preGapRenderAmplitude =
      sumAmplitudes(structural.candidateForcingSlotsSource) +
      sumAmplitudes(structural.candidateResponseSlotsSource);

    for (let frame = 128; frame < 158; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        featureState,
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
    }

    expect(structural.structuralMetrics.modalResponseCurrentSignalEnergy).toBe(
      0,
    );
    expect(structural.structuralMetrics.modalResponseEnergy).toBeLessThan(
      preGapModalResponseEnergy,
    );
    expect(
      sumAmplitudes(structural.candidateForcingSlotsSource) +
        sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeLessThan(preGapRenderAmplitude);
    expect(structural.structuralMetrics.resonantObservationConfidence).toBe(0);
    expect(structural.structuralMetrics.resonantRingSupport).toBe(0);
  });

  it("keeps low system hum from gaining resonant observer authority", () => {
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

    expect(structural.structuralMetrics.resonantModalEnergy).toBeGreaterThan(0);
    expect(structural.structuralMetrics.resonantModalEnergy).toBeLessThan(
      structural.structuralMetrics.sourceCoupledModalEnergy,
    );
    expect(structural.structuralMetrics.resonantObservedModeCount ?? 0).toBe(0);
    expect(
      structural.structuralMetrics.resonantObservationConfidence ?? 0,
    ).toBe(0);
    expect(structural.structuralMetrics.resonantRingSupport ?? 0).toBe(0);
    expect(structural.structuralMetrics.resonantPhaseAuthority ?? 0).toBe(0);
    expect(countActiveSlotsLocal(structural.candidateResponseSlotsSource)).toBe(
      countActiveSlotsLocal(structural.proposalResonantSlotsSource),
    );
  });

  it("retunes source-coupled topology within three structural frames", () => {
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

    for (let frame = 64; frame < 67; frame += 1) {
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
      structural.structuralMetrics.sourceCoupledObservedModeCount,
    ).toBeGreaterThan(0);
    expect(
      structural.structuralMetrics.modalPhaseCoherentFieldModeCount,
    ).toBeGreaterThan(0);
  });

  it("keeps dense sustained music within the bounded projection", () => {
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
      [1350, 0.22],
      [2100, 0.18],
      [2750, 0.16],
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
    for (let frame = 18; frame < 21; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials: [...densePartials.slice(0, 8), [3200, 0.92]],
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
  });

  it("bounds visible dense detail by response or release of a physical identity", () => {
    const state = createModalExcitationState(16);
    const physicalModeKeys = new Set();
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
      [1350, 0.22],
      [2100, 0.18],
      [2750, 0.16],
    ];

    for (let frame = 0; frame < 24; frame += 1) {
      structural = runModalFrame({
        state,
        frame,
        partials:
          frame < 18
            ? densePartials
            : [...densePartials.slice(0, 8), [3200, 0.92]],
        avgAmplitude: frame < 18 ? 32 : 34,
        rms: frame < 18 ? 0.2 : 0.22,
        amplitudeScale: frame < 18 ? 0.42 : 0.44,
      });
      for (const entry of state.activeModes.values()) {
        if ((entry.modalResponseEnergy ?? 0) > 0) {
          physicalModeKeys.add(entry.modeKey);
        }
      }
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
      expect(
        (activeMode?.modalResponseEnergy ?? 0) > 0 ||
          physicalModeKeys.has(modeKey),
      ).toBe(true);
      if (amplitude > 0.09) {
        strongResonantCount += 1;
      }
    }
    expect(strongResonantCount).toBeLessThanOrEqual(6);
    expect(
      structural.structuralMetrics.projectionRawEnergyResonant,
    ).toBeGreaterThan(0);
  });

  it("keeps dense published render candidates within the modal basis page budget", () => {
    const pageBudget = MODAL_SEMANTIC_DESCRIPTOR_CAPACITY;
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
      [1250, 0.22],
      [1500, 0.2],
      [1750, 0.22],
      [2000, 0.18],
      [2250, 0.16],
      [2500, 0.14],
      [2750, 0.12],
      [3000, 0.1],
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
            : [...densePartials.slice(0, 12), [2850, 0.92], [3200, 0.35]],
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
    ).toBeGreaterThan(0);
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
    // Previously this source overflowed the page budget, because the budget was
    // a small optical ceiling. The budget is now the full descriptor capacity,
    // so every proposal source is covered completely — no published candidate
    // has energy sitting outside what the renderer will draw.
    expect(
      computeTopModalEnergyCoverage(
        structural.proposalSourceCoupledSlotsSource,
        pageBudget,
      ),
    ).toBeCloseTo(1, 6);
  });

  it("redistributes bounded modal coefficients in the first shifted frame", () => {
    const featureState = createAudioFeatureState(16);
    const state = createModalExcitationState(16);
    let structural = null;

    const densePartials = [
      [794.3, 0.76],
      [803.0, 0.68],
      [820.3, 0.62],
      [828.8, 0.54],
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
    const sustainedEnergyWeightedOrder = computeModalEnergyWeightedOrder(
      sustainedDisplayAmplitudes,
    );

    for (let frame = 12; frame < 13; frame += 1) {
      structural = runModalFrame({
        state,
        featureState,
        frame,
        partials: [
          [954.6, 0.85],
          [961.9, 0.92],
        ],
        avgAmplitude: 34,
        rms: 0.22,
        amplitudeScale: 0.44,
      });
    }

    const switchedDisplayAmplitudes = readModeAmplitudeMap(
      structural.candidateResponseSlotsSource,
    );
    const switchedEnergyWeightedOrder = computeModalEnergyWeightedOrder(
      switchedDisplayAmplitudes,
    );

    // The complete physical registry is larger than the bake budget. A strong
    // spectral shift may replace shells, but material exact-shell identity
    // overlap remains through the first transition frame.
    expect(
      countRetainedModeShells(
        sustainedDisplayAmplitudes,
        switchedDisplayAmplitudes,
      ),
    ).toBeGreaterThanOrEqual(
      Math.floor(
        Math.min(
          readModeShellKeys(sustainedDisplayAmplitudes).size,
          readModeShellKeys(switchedDisplayAmplitudes).size,
        ) * 0.4,
      ),
    );
    expect(switchedEnergyWeightedOrder).toBeGreaterThan(
      sustainedEnergyWeightedOrder + 1,
    );
  });

  it("excites resonant-band modes from sustained weak polyphony within slot contract", () => {
    const state = createModalExcitationState(16);
    const random = createDeterministicRandom(174);
    let structural = null;

    for (let frame = 0; frame < 28; frame += 1) {
      const peaks = Array.from({ length: 18 }, (_, index) => [
        500 + index * 160,
        0.04 + random() * 0.03,
      ]);
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft(peaks),
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

    // The upper partials remain inside the apparatus tail while reaching the
    // high-order resonant layer. Sustained energy at those frequencies excites
    // those modes, so this asserts they appear rather than being suppressed.
    expect(
      countActiveSlotsLocal(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);
    expect(
      sumAmplitudes(structural.candidateResponseSlotsSource),
    ).toBeGreaterThan(0);

    // What is bounded is the slot contract, not the summed amplitude. Summed
    // Slot amplitude is a pre-normalization intermediate; the radiation-
    // potential packet owns the normalized modal-energy mixture.
    // divides the coefficient vector by its own RMS norm, so the shader always
    // receives unit-norm coefficients no matter how many modes are active, and
    // total brightness arrives separately as the saturating
    // sqrt(E / (E + reference)) pressure drive. A 13x change in this sum moves
    // rendered amplitude by about 1.27x. Bounding the sum therefore constrains
    // an internal scale the render is almost insensitive to, which is why the
    // previous < 0.08 bound here did not mean what it appeared to.
    for (const slots of [
      structural.candidateResponseSlotsSource,
      structural.proposalResonantSlotsSource,
    ]) {
      const slotCount = Math.floor(slots.length / 4);
      expect(countActiveSlotsLocal(slots)).toBeLessThanOrEqual(slotCount);
      for (let index = 0; index < slotCount; index += 1) {
        const amplitude = slots[index * 4 + 3];
        expect(Number.isFinite(amplitude)).toBe(true);
        expect(amplitude).toBeGreaterThanOrEqual(0);
        expect(amplitude).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reweights cache-supported detail within one frame", () => {
    const state = createModalExcitationState(16);
    const seededInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
        [794.3, 0.84],
        [803.0, 0.8],
        [820.3, 0.76],
      ]),
      timeData: makeTimeData({ frequency: 803.0, amplitude: 0.3 }),
    });
    seededInputs.modalExcitationState = state;
    const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
    const seededStructural = buildModalExcitationStructuralState({
      preparedInputs: seededInputs,
      fastSignalState: seededFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const seededVisibleAmplitudes = readModeAmplitudeMap(
      seededStructural.candidateResponseSlotsSource,
    );

    const freshInputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftLinearAmplitudes: makeFft([
        [794.3, 0.42],
        [820.3, 0.38],
        [954.6, 0.9],
        [961.9, 0.96],
      ]),
      timeData: makeTimeData({ frequency: 961.9, amplitude: 0.34 }),
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    const freshVisibleAmplitudes = readModeAmplitudeMap(
      freshStructural.candidateResponseSlotsSource,
    );
    expect(
      countRetainedModeShells(seededVisibleAmplitudes, freshVisibleAmplitudes),
    ).toBeGreaterThanOrEqual(
      Math.floor(
        Math.min(
          readModeShellKeys(seededVisibleAmplitudes).size,
          readModeShellKeys(freshVisibleAmplitudes).size,
        ) * 0.4,
      ),
    );
    expect(
      computeModalEnergyWeightedOrder(freshVisibleAmplitudes),
    ).toBeGreaterThan(
      computeModalEnergyWeightedOrder(seededVisibleAmplitudes) + 0.5,
    );
  });

  it("moves detail energy toward a strong cache-edge switch", () => {
    const state = createModalExcitationState(16);
    let seededStructural = null;

    for (let frame = 0; frame < 4; frame += 1) {
      const seededInputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft([
          [794.3, 0.9],
          [803.0, 0.86],
          [820.3, 0.82],
        ]),
        timeData: makeTimeData({ frequency: 803.0, amplitude: 0.36 }),
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
      fftLinearAmplitudes: makeFft([
        [794.3, 0.18],
        [820.3, 0.14],
        [954.6, 0.98],
        [961.9, 0.92],
      ]),
      timeData: makeTimeData({ frequency: 961.9, amplitude: 0.4 }),
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
    expect(
      countRetainedModeShells(seededVisibleAmplitudes, freshVisibleAmplitudes),
    ).toBeGreaterThanOrEqual(
      Math.floor(
        Math.min(
          readModeShellKeys(seededVisibleAmplitudes).size,
          readModeShellKeys(freshVisibleAmplitudes).size,
        ) * 0.4,
      ),
    );
    expect(
      computeModalEnergyWeightedOrder(freshVisibleAmplitudes),
    ).toBeGreaterThan(
      computeModalEnergyWeightedOrder(seededVisibleAmplitudes) + 0.5,
    );
  });

  it("keeps visible detail keys as a subset of the raw proposal shortlist", () => {
    const state = createModalExcitationState(16);
    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
        [794.3, 0.92],
        [820.3, 0.72],
        [954.6, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 794.3, amplitude: 0.38 }),
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

  it("keeps continuous detail identities inside the fresh proposal", () => {
    const state = createModalExcitationState(16);
    const seededInputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
        [794.3, 0.88],
        [803.0, 0.84],
        [820.3, 0.8],
      ]),
      timeData: makeTimeData({ frequency: 803.0, amplitude: 0.34 }),
    });
    seededInputs.modalExcitationState = state;
    const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
    const seededStructural = buildModalExcitationStructuralState({
      preparedInputs: seededInputs,
      fastSignalState: seededFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const seededVisibleAmplitudes = readModeAmplitudeMap(
      seededStructural.candidateResponseSlotsSource,
    );

    const freshInputs = createLineFeedPreparedInputs({
      frameTimeMs: 33,
      fftLinearAmplitudes: makeFft([
        [794.3, 0.42],
        [820.3, 0.48],
        [954.6, 0.92],
        [961.9, 0.98],
      ]),
      timeData: makeTimeData({ frequency: 961.9, amplitude: 0.34 }),
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });
    const freshVisibleAmplitudes = readModeAmplitudeMap(
      freshStructural.candidateResponseSlotsSource,
    );
    const freshVisibleKeys = [...freshVisibleAmplitudes.keys()];

    expect(
      countRetainedModeShells(seededVisibleAmplitudes, freshVisibleAmplitudes),
    ).toBeGreaterThanOrEqual(
      Math.floor(
        Math.min(
          readModeShellKeys(seededVisibleAmplitudes).size,
          readModeShellKeys(freshVisibleAmplitudes).size,
        ) * 0.4,
      ),
    );
    expect(
      freshVisibleKeys.every((key) =>
        readModeKeys(freshStructural.proposalResonantSlotsSource).includes(key),
      ),
    ).toBe(true);
    expect(
      computeModalEnergyWeightedOrder(freshVisibleAmplitudes),
    ).toBeGreaterThan(
      computeModalEnergyWeightedOrder(seededVisibleAmplitudes) + 0.5,
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
        fftLinearAmplitudes: activeFft,
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
        fftLinearAmplitudes: silentFft,
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

  it("publishes dense oscillator proposals without synthetic sparsification", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 12; frame += 1) {
      const inputs = createLineFeedPreparedInputs({
        frameTimeMs: frame * 33,
        fftLinearAmplitudes: makeFft([
          [90, 0.92],
          [110, 0.95],
          [220, 0.84],
          [330, 0.7],
          [440, 0.58],
          [660, 0.52],
          [1500, 0.44],
          [2100, 0.41],
          [2800, 0.38],
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

    expect(countActiveSlotsLocal(structural.candidateForcingSlotsSource)).toBe(
      countActiveSlotsLocal(structural.proposalSourceCoupledSlotsSource),
    );
    expect(sumAmplitudes(structural.candidateForcingSlotsSource)).toBeCloseTo(
      sumAmplitudes(structural.proposalSourceCoupledSlotsSource),
      8,
    );
    expect(readModeKeys(structural.candidateResponseSlotsSource)).toEqual(
      readModeKeys(structural.proposalResonantSlotsSource),
    );
  });

  it("admits complete source-projected shells within semantic capacity", () => {
    const state = createModalExcitationState(16);
    const inputs = createLineFeedPreparedInputs({
      frameTimeMs: 0,
      fftLinearAmplitudes: makeFft([
        [794.3, 0.96],
        [820.3, 0.88],
        [954.6, 0.72],
      ]),
      timeData: makeMixedTimeData({
        partials: [
          [794.3, 0.96],
          [820.3, 0.88],
          [954.6, 0.72],
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
    const atlas = buildModalExcitationAtlas({
      radius: inputs.radius,
      cavityGeometry: inputs.effectiveCavityGeometry,
      cavityAcousticScale: inputs.cavityAcousticScale,
      boundaryMode: inputs.boundaryMode,
    });
    const atlasByFamilyKey = new Map(
      atlas.map((entry) => [`${entry.u}:${entry.v}:${entry.w}`, entry]),
    );
    const visibleModeKeys = [
      ...readModeKeys(structural.candidateForcingSlotsSource),
      ...readModeKeys(structural.candidateResponseSlotsSource),
    ];
    const visibleKeySet = new Set(visibleModeKeys);
    const selectedShellKeys = new Set(
      visibleModeKeys.map((key) => atlasByFamilyKey.get(key)?.responseModeKey),
    );
    const selectedMultiMemberShell = Array.from(selectedShellKeys).some(
      (shellKey) =>
        atlas.filter((entry) => entry.responseModeKey === shellKey).length > 1,
    );

    expect(new Set(visibleModeKeys).size).toBe(visibleModeKeys.length);
    expect(visibleModeKeys.length).toBeLessThanOrEqual(
      MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    );
    expect(selectedMultiMemberShell).toBe(true);
    for (const shellKey of selectedShellKeys) {
      const members = atlas
        .filter((entry) => entry.responseModeKey === shellKey)
        .map((entry) => `${entry.u}:${entry.v}:${entry.w}`);
      expect(members.every((key) => visibleKeySet.has(key))).toBe(true);
    }
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
    fftLinearAmplitudes: fft,
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
        sideLengthMeters: 6,
      },
    });

    expect(
      readExcitationModeKeys(defaultResult.candidateForcingSlotsSource),
    ).not.toEqual(
      readExcitationModeKeys(compactAcousticResult.candidateForcingSlotsSource),
    );
  });
});
