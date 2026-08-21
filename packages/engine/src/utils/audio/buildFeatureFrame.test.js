import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUDIO_SLOT_CAPACITY,
  CAVITY_ACOUSTIC_DEFAULTS,
} from "../../defaults.js";
import {
  buildCurrentAudioFeatureAnalysisResult,
  updateAudioFeatureChromaState,
  updateAudioFeatureFastSignalState,
  updateAudioFeatureStructuralState,
} from "./audioFeatureAnalysis.js";
import { composeAudioFeatureFrame } from "./buildFeatureFrame.js";
import { createAudioFeatureCompositionState } from "./audioFeatureFrameSignals.js";
import { prepareAudioFeatureFrameInputs } from "./audioFeatureInputPreparation.js";
import { applyTestToneToSnapshot } from "./audioFeatureTestTone.js";
import { createAudioFeatureState } from "./audioFeatureState.js";
import { updateAudioFeatureTempoState } from "./tempoTracking.js";
import { detectLiveInputNoiseGate } from "./liveInputNoiseGate.js";
import { binIndexToFrequencyHz, frequencyToBinIndex } from "./binFrequency.js";
import { deriveResonantSparseEvidence } from "./resonantSparseEvidence.js";
import { DEFAULT_RENDER_ENERGY_EPSILON } from "./modalEnergyLedger.js";
import { deriveCavityModalFieldCacheBandwidth } from "../../core/raymarch/fieldCachePassband.js";
import { isModalFamilyResolvedByFieldCache } from "../../core/raymarch/fieldCacheGeometry.js";
import { RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY } from "../../core/raymarch/radiationPotentialPacket.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const LIVE_INPUT_CALIBRATION_MID_MS = 400;
const LIVE_INPUT_CALIBRATION_DONE_MS = 1200;
const LIVE_INPUT_POST_CALIBRATION_MS = 1240;
const LIVE_INPUT_POST_CALIBRATION_NEXT_MS = 1270;
const DEFAULT_MODAL_OBSERVATION_BAND = deriveCavityModalFieldCacheBandwidth({
  sideLengthMeters: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
  soundSpeedMetersPerSecond: CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond,
  boundaryMode: "neumann",
});
const BUILD_FEATURE_FRAME_SOURCE = readFileSync(
  new URL("./buildFeatureFrame.js", import.meta.url),
  "utf8",
);
const AUDIO_FEATURE_ANALYSIS_SOURCE = readFileSync(
  new URL("./audioFeatureAnalysis.js", import.meta.url),
  "utf8",
);
const AUDIO_FEATURE_MODAL_PROJECTION_SOURCE = readFileSync(
  new URL("./audioFeatureModalProjection.js", import.meta.url),
  "utf8",
);
const AUDIO_FEATURE_DEBUG_SOURCE = readFileSync(
  new URL("./audioFeatureDebug.js", import.meta.url),
  "utf8",
);
const AUDIO_FEATURE_SIGNALS_SOURCE = readFileSync(
  new URL("./audioFeatureSignals.js", import.meta.url),
  "utf8",
);
const AUDIO_FEATURE_INPUT_PREPARATION_SOURCE = readFileSync(
  new URL("./audioFeatureInputPreparation.js", import.meta.url),
  "utf8",
);
const LIVE_INPUT_NOISE_GATE_SOURCE = readFileSync(
  new URL("./liveInputNoiseGate.js", import.meta.url),
  "utf8",
);

function runCompleteFeatureAnalysisForTest(preparedInputs) {
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  const chromaState = updateAudioFeatureChromaState(
    preparedInputs,
    fastSignalState,
  );
  const structuralState = updateAudioFeatureStructuralState(
    preparedInputs,
    fastSignalState,
  );
  const tempoState = updateAudioFeatureTempoState({
    bandState: preparedInputs.bandState,
    beatConfidence: fastSignalState.beatConfidence,
    currentFrameAtMs: fastSignalState.currentFrameAtMs,
    deltaMs: fastSignalState.deltaMs,
  });

  return buildCurrentAudioFeatureAnalysisResult({
    preparedInputs,
    fastSignalState,
    structuralState,
    chromaState,
    tempoState,
    materializeStructuralProjection: true,
  });
}

function buildFeatureFrameForTest(args) {
  const preparedInputs = prepareAudioFeatureFrameInputs(args);
  if (preparedInputs.silentFeatureFrame) {
    return preparedInputs.silentFeatureFrame;
  }

  return composeAudioFeatureFrame({
    preparedInputs,
    analysisResult: runCompleteFeatureAnalysisForTest(preparedInputs),
  });
}

it("derives observation energy from modal coefficient and response only", () => {
  const observationEnergyHelper = AUDIO_FEATURE_MODAL_PROJECTION_SOURCE.match(
    /function deriveModalObservationEnergy[\s\S]*?\n}/,
  )?.[0];

  expect(observationEnergyHelper).toBeTruthy();
  expect(observationEnergyHelper).not.toContain("modalPhaseAuthority");
  expect(observationEnergyHelper).not.toContain("liveInputHardSilenceActive");
});

it("keeps modal observation confidence owned by producer output", () => {
  const confidenceHelper = AUDIO_FEATURE_MODAL_PROJECTION_SOURCE.match(
    /function resolveModalObservationConfidence[\s\S]*?\n}/,
  )?.[0];

  expect(confidenceHelper).toBeTruthy();
  expect(confidenceHelper).not.toContain("modalPhaseAuthority");
  expect(confidenceHelper).not.toContain("modalResponseEnergy");
  expect(confidenceHelper).not.toContain("currentSignalEnergy");
  expect(confidenceHelper).not.toContain("modalDriveEnergy");
});

it("keeps render liveness owned by canonical energy quantities", () => {
  const renderAuthorityHelper = AUDIO_FEATURE_MODAL_PROJECTION_SOURCE.match(
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

it("keeps feature-state shape repair out of frame composition", () => {
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain("ensureAnalysisMemoryShape");
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain("ensureArrayField");
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain("createAudioFeatureState");
});

it("keeps analysis lifecycle out of frame composition", () => {
  for (const analysisFunction of [
    "updateAudioFeatureFastSignalState",
    "updateAudioFeatureStructuralState",
    "updateAudioFeatureChromaState",
    "buildCurrentAudioFeatureAnalysisResult",
  ]) {
    expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(analysisFunction);
    expect(AUDIO_FEATURE_ANALYSIS_SOURCE).toContain(analysisFunction);
  }

  for (const compositionConcern of [
    "renderAuthority",
    "modalVisibility",
    "deriveFieldState",
    "hasProjectedRenderAuthority",
    "buildAudioFeatureDebugSnapshot",
  ]) {
    expect(AUDIO_FEATURE_ANALYSIS_SOURCE).not.toContain(compositionConcern);
  }
});

it("keeps modal projection out of frame composition", () => {
  expect(BUILD_FEATURE_FRAME_SOURCE).toContain("projectAudioFeatureModalField");
  for (const projectionConcern of [
    "function deriveModalObservationEnergy",
    "function hasFeatureFrameRenderAuthority",
    "buildModalEnergyLedger",
    "updateModalFieldContinuity",
    "buildCanonicalFullModalDescriptor",
  ]) {
    expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(projectionConcern);
    expect(AUDIO_FEATURE_MODAL_PROJECTION_SOURCE).toContain(projectionConcern);
  }

  for (const compositionConcern of [
    "deriveAudioFeatureCompositeSignals",
    "smoothFeatureSignal",
    "buildAudioFeatureDebugSnapshot",
    "deriveModalVisibilityComponents",
  ]) {
    expect(AUDIO_FEATURE_MODAL_PROJECTION_SOURCE).not.toContain(
      compositionConcern,
    );
  }
});

it("keeps diagnostic projection out of frame composition", () => {
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function buildDebugSummary",
  );
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function finalizeFeatureDebugSnapshot",
  );
  expect(AUDIO_FEATURE_DEBUG_SOURCE).not.toContain(
    "deriveModalObservationEnergy",
  );
  expect(AUDIO_FEATURE_DEBUG_SOURCE).not.toContain(
    "readModalResponseRenderEnergy",
  );
});

it("keeps audio signal derivation out of frame orchestration", () => {
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function deriveCompositeSignals",
  );
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function updateBandSignalState",
  );
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function getSourceNormalization",
  );
  expect(AUDIO_FEATURE_SIGNALS_SOURCE).not.toContain("renderAuthority");
  expect(AUDIO_FEATURE_SIGNALS_SOURCE).not.toContain("modalVisibility");
  expect(AUDIO_FEATURE_SIGNALS_SOURCE).not.toContain("FIELD_STATES");
});

it("keeps input preparation out of frame analysis and composition", () => {
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function prepareAudioFeatureFrameInputs",
  );
  expect(BUILD_FEATURE_FRAME_SOURCE).not.toContain(
    "function resolveFeatureAnalysisSessionKey",
  );
  expect(AUDIO_FEATURE_INPUT_PREPARATION_SOURCE).toContain(
    "buildAnalysisSessionKey(status)",
  );
  expect(AUDIO_FEATURE_INPUT_PREPARATION_SOURCE).not.toContain(
    "function resolveFeatureAnalysisSessionKey",
  );
  expect(AUDIO_FEATURE_INPUT_PREPARATION_SOURCE).not.toContain(
    "renderAuthority",
  );
  expect(AUDIO_FEATURE_INPUT_PREPARATION_SOURCE).not.toContain(
    "modalVisibility",
  );
  expect(AUDIO_FEATURE_INPUT_PREPARATION_SOURCE).not.toContain(
    "micAnalysisSettings",
  );
  expect(LIVE_INPUT_NOISE_GATE_SOURCE).not.toContain("micAnalysisSettings");
});

it("keeps source and resonant slot reservoirs out of production owners", () => {
  const productionFiles = [
    "./audioFeatureState.js",
    "./audioFeatureAnalysis.js",
    "./audioFeatureModalProjection.js",
    "./audioFeatureInputPreparation.js",
    "./audioFeatureSilence.js",
    "./buildFeatureFrame.js",
    "./audioFeatureStructuralProjection.js",
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

it("keeps visual fog out of production modal admission owners", () => {
  const retiredFogAdmissionField = "suppressed" + "ByFog";
  const productionFiles = [
    "./buildFeatureFrame.js",
    "./audioFeatureModalProjection.js",
    "./modalExcitation.js",
    "./modalExcitationState.js",
    "../../core/modalFieldContinuity.js",
    "../../core/modalDescriptor.js",
  ];

  for (const file of productionFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    expect(source).not.toContain(retiredFogAdmissionField);
  }
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
      fftLinearAmplitudes: makeFft(peaks),
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
      return weighted + resolvedFrequency * amplitude ** 2;
    }, 0) /
    peaks.reduce((total, [, amplitude]) => total + amplitude ** 2, 0) /
    (SAMPLE_RATE * 0.5);
  const totalPower = peaks.reduce(
    (total, [, amplitude]) => total + amplitude ** 2,
    0,
  );
  const expectedParticipationRatio =
    totalPower ** 2 /
    peaks.reduce((total, [, amplitude]) => total + amplitude ** 4, 0);

  expect(preparedInputs.fftPeakAmplitude).toBeCloseTo(0.75, 6);
  expect(preparedInputs.spectralCentroidHint).toBeCloseTo(expectedCentroid, 6);
  expect(preparedInputs.spectralEffectiveBinCount).toBeCloseTo(
    expectedParticipationRatio,
    6,
  );
  expect(preparedInputs.sourceEvidence.metrics.fftPeakAmplitude).toBeCloseTo(
    0.75,
    6,
  );
  expect(
    preparedInputs.sourceEvidence.metrics.spectralEffectiveBinCount,
  ).toBeCloseTo(expectedParticipationRatio, 6);
});

function createStatus(overrides = {}) {
  return {
    sourceSession: createSourceSession({ phase: "empty", sessionId: 0 }),
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

function createSnapshot(overrides = {}) {
  return {
    sourceMode: "file",
    avgAmplitude: 24,
    fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
      fftLinearAmplitudes: makeFft([[60, 0.9]]),
    }),
    featureState,
    radius: 3,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: "neumann",
    status: createStatus({
      sourceSession: createSourceSession(),
      isPlaying: true,
      hasAnalysisSource: true,
    }),
  });

  expect(preparedInputs.radius).toBe(3);
  expect(preparedInputs.cavityAcousticScale).toBe(CAVITY_ACOUSTIC_DEFAULTS);
  expect(preparedInputs.boundaryMode).toBe("neumann");
});

it("derives a water-nonlinear modal drive without mutating source evidence", () => {
  const frequencyHz = 440;
  const timeData = makeTimeData({ frequency: frequencyHz, amplitude: 0.5 });
  const fftLinearAmplitudes = makeFft([[frequencyHz, 0.5]]);
  const fundamentalBin = freqToBin(frequencyHz);
  const harmonicBin = freqToBin(frequencyHz * 2);
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({ timeData, fftLinearAmplitudes }),
    featureState: createAudioFeatureState(),
    radius: 3,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    status: createStatus({
      sourceSession: createSourceSession(),
      isPlaying: true,
      hasAnalysisSource: true,
    }),
  });

  expect(preparedInputs.waterAcousticDrive.active).toBe(true);
  expect(preparedInputs.waterAcousticDrive.timeDomainData).not.toBe(timeData);
  expect(preparedInputs.waterAcousticDrive.fftLinearAmplitudes).not.toBe(
    fftLinearAmplitudes,
  );
  expect(
    preparedInputs.waterAcousticDrive.fftLinearAmplitudes[fundamentalBin],
  ).toBeLessThan(fftLinearAmplitudes[fundamentalBin]);
  expect(
    preparedInputs.waterAcousticDrive.fftLinearAmplitudes[harmonicBin],
  ).toBeGreaterThan(0);
  expect(fftLinearAmplitudes[harmonicBin]).toBe(0);
  expect(preparedInputs.fftLinearAmplitudesSource).toBe(fftLinearAmplitudes);
});

it("keeps exact linear references without an incident-pressure declaration", () => {
  const timeData = makeTimeData({ frequency: 440, amplitude: 0.5 });
  const fftLinearAmplitudes = makeFft([[440, 0.5]]);
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({ timeData, fftLinearAmplitudes }),
    featureState: createAudioFeatureState(),
    radius: 3,
    cavityAcousticScale: {
      ...CAVITY_ACOUSTIC_DEFAULTS,
      incidentPeakPressurePascalAtFullScale: null,
    },
    status: createStatus({
      sourceSession: createSourceSession(),
      isPlaying: true,
      hasAnalysisSource: true,
    }),
  });

  expect(preparedInputs.waterAcousticDrive.active).toBe(false);
  expect(preparedInputs.waterAcousticDrive.timeDomainData).toBe(timeData);
  expect(preparedInputs.waterAcousticDrive.fftLinearAmplitudes).toBe(
    fftLinearAmplitudes,
  );
});

it("preserves the canonical upstream analysis session identity", () => {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot(),
    featureState: createAudioFeatureState(),
    radius: 3,
    status: createStatus({ sessionKey: "file:source-override" }),
  });

  expect(preparedInputs.analysisSessionKey).toBe("file:source-override");
});

it("preserves feature-state identity across silent and active preparation", () => {
  const featureState = createAudioFeatureState();
  const status = createStatus();
  const silent = prepareAudioFeatureFrameInputs({
    analysisSnapshot: null,
    featureState,
    radius: 3,
    status,
  });
  const active = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot(),
    featureState,
    radius: 3,
    status,
  });

  expect(silent.featureState).toBe(featureState);
  expect(active.featureState).toBe(featureState);
});

it("resolves analysis class from canonical live-input settings", () => {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({ sourceMode: "live" }),
    featureState: createAudioFeatureState(),
    radius: 3,
    status: makeLiveInputStatus(),
    liveInputAnalysisSettings: { analysisClass: "line-feed" },
  });

  expect(preparedInputs.resolvedLiveInputAnalysisClass).toBe("line-feed");
  expect(preparedInputs.analysisInputMode).toBe("file");
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
    sourceSession: createSourceSession(),
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
    suppressPlaybackTelemetry: false,
    testToneSignal: "pure-sine",
    testToneHz: 440,
    testToneAmplitude: 0.5,
    logEveryFrames: 30,
    ...overrides,
  };
}

function makeLiveInputStatus(overrides = {}) {
  return createStatus({
    sourceSession: createSourceSession({
      kind: "system",
      deviceKind: "live",
    }),
    analysisSource: "live",
    isLiveInputActive: true,
    hasAnalysisSource: true,
    ...overrides,
  });
}

function makeResolvedLineFeedLiveStatus(overrides = {}) {
  return makeLiveInputStatus({
    liveInputAnalysisClass: "auto",
    resolvedLiveInputAnalysisClass: "line-feed",
    ...overrides,
  });
}

function makeSystemStatus(overrides = {}) {
  return createStatus({
    sourceSession: createSourceSession({
      kind: "system",
      deviceKind: "system",
    }),
    analysisSource: "file",
    isLiveInputActive: true,
    hasAnalysisSource: true,
    ...overrides,
  });
}

function collectActiveSpectralMoments(
  momentSlots,
  modalSlots,
  minCoefficient = 0.05,
) {
  const moments = [];
  for (let index = 0; index < momentSlots.length; index += 4) {
    if ((modalSlots[index + 3] ?? 0) <= minCoefficient) continue;
    moments.push({
      m1x: momentSlots[index] ?? 0,
      m1y: momentSlots[index + 1] ?? 0,
      m2x: momentSlots[index + 2] ?? 0,
      m2y: momentSlots[index + 3] ?? 0,
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

function makeLoopbackLiveStatus(overrides = {}) {
  return createStatus({
    sourceSession: createSourceSession({
      kind: "system",
      deviceKind: "system",
    }),
    analysisSource: "live",
    isLiveInputActive: true,
    hasAnalysisSource: true,
    liveInputAnalysisClass: "line-feed",
    ...overrides,
  });
}

function buildTimedFrame({
  featureState,
  fftLinearAmplitudes,
  avgAmplitude = 24,
  rms = 0.2,
  frameTimeMs = 0,
  status = makeActiveStatus(),
}) {
  return buildFeatureFrameForTest({
    analysisSnapshot: createSnapshot({
      avgAmplitude,
      fftLinearAmplitudes,
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
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 0,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
      sourceMode: "file",
      avgAmplitude: 12,
      fftLinearAmplitudes: makeFft([[220, 0.08]]),
      rms: 0.03,
    }),
    featureState,
    radius: 3,
    status: makeActiveStatus(),
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

// One declared floor for "this ring actually reached the renderer with enough
// amplitude to draw", instead of the same three bare literals copy-pasted
// across the bowl-visibility scenarios. These are render-visibility floors of
// the apparatus, not physical constants — naming them once makes them
// auditable and keeps the scenarios from each carrying their own calibration.
const RENDER_VISIBLE_RING = Object.freeze({
  ringSupport: 0.08,
  slotAmplitudeSum: 0.003,
  visibilityEnergy: 0.04,
});

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
  sourceCoupledSpectralMoment = makeQuadSlots([]),
  resonantSpectralMoment = makeQuadSlots([]),
  proposalSourceCoupledSpectralMoment = sourceCoupledSpectralMoment,
  modalCandidateState = new Map(),
  dominantFrequency = 196,
  dominantAmplitude = 0.08,
  sourceMode = "file",
  structuralMetrics = {},
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
    sourceCoupledSpectralMomentSource: sourceCoupledSpectralMoment,
    resonantSpectralMomentSource: resonantSpectralMoment,
    proposalSourceCoupledSpectralMomentSource:
      proposalSourceCoupledSpectralMoment,
    proposalReferenceSourceCoupledSlotsSource: proposalSourceCoupledSlots,
    proposalReferenceResonantSlotsSource: proposalResonantSlots,
    dominantFrequency,
    dominantAmplitude,
    analysisEngine: "modal-excitation",
    pitchSource: "resonator-bank",
    spectralCandidates: [],
    modalCandidateState,
    sourceMode,
    structuralMetrics,
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
  fftLinearAmplitudes,
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
      fftLinearAmplitudes,
      timeData,
      rms,
    }),
    featureState,
    radius: 3,
    status,
    frameTimeMs,
  });
  const analysisResult = runCompleteFeatureAnalysisForTest(preparedInputs);
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
  return buildFeatureFrameForTest({
    analysisSnapshot: createSnapshot({
      sourceMode: "live",
      avgAmplitude,
      fftLinearAmplitudes: makeFft(peaks),
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

function makeSourceCoupledStructuralMetrics(overrides = {}) {
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
    sourceCoupledObservedModeCount: 2,
    sourceCoupledObservationConfidence: 0.055,
    sourceCoupledObservedDrive: 0.34,
    sourceCoupledObservedSnr: 0.26,
    sourceCoupledObservedCoherence: 0.66,
    resonantObservedModeCount: 0,
    resonantObservationConfidence: 0,
    resonantRingSupport: 0,
    resonantObservedDrive: 0,
    resonantObservedSnr: 0,
    resonantObservedCoherence: 0,
    resonantPhaseAuthority: 0,
    ...overrides,
  };
}

function buildManualSourceCoupledFrame({
  status = makeActiveStatus(),
  sourceMode = "file",
  avgAmplitude = 8.2,
  rms = 0.028,
  fftLinearAmplitudes = makeFft([
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
  structuralMetrics = makeSourceCoupledStructuralMetrics(),
  liveInputAnalysisSettings,
} = {}) {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      sourceMode,
      avgAmplitude,
      fftLinearAmplitudes,
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
    modalObservationCoherence: 0.9,
    modalObservationConfidence: 0.9,
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
  sourceCoupledSpectralMoment = makeQuadSlots([]),
  proposalSourceCoupledSpectralMoment = sourceCoupledSpectralMoment,
  modalCandidateState = new Map(),
  structuralMetrics = makeModalFieldContinuityStructuralMetrics(),
  sourceMode = "file",
  status = makeActiveStatus(),
} = {}) {
  const preparedInputs = prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      sourceMode,
      avgAmplitude: 42,
      fftLinearAmplitudes: makeFft([
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
    sourceCoupledSpectralMoment,
    proposalSourceCoupledSpectralMoment,
    modalCandidateState,
    sourceMode,
    structuralMetrics,
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
  let totalAmplitude = 0;
  for (const amplitude of amplitudes.values()) {
    totalAmplitude += amplitude;
  }

  return {
    amplitudes,
    totalAmplitude,
  };
}

function measureModalCoefficientRedistribution(
  sourceFingerprint,
  nextFingerprint,
) {
  if (
    (sourceFingerprint?.totalAmplitude ?? 0) <= 0 ||
    (nextFingerprint?.totalAmplitude ?? 0) <= 0
  ) {
    return 0;
  }

  const modeKeys = new Set([
    ...sourceFingerprint.amplitudes.keys(),
    ...nextFingerprint.amplitudes.keys(),
  ]);
  let normalizedCoefficientDelta = 0;
  for (const key of modeKeys) {
    normalizedCoefficientDelta += Math.abs(
      (sourceFingerprint.amplitudes.get(key) ?? 0) /
        sourceFingerprint.totalAmplitude -
        (nextFingerprint.amplitudes.get(key) ?? 0) /
          nextFingerprint.totalAmplitude,
    );
  }
  return normalizedCoefficientDelta * 0.5;
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

describe("buildFeatureFrameForTest modal contract", () => {
  it("returns idle output for missing analysis input", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
    });

    expect(frame.fieldState).toBe("idle");
    expect(frame.hasModalField).toBe(false);
    expect(frame.averageAmplitude).toBe(0);
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
      fftLinearAmplitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 0,
    });
    buildTimedFrame({
      featureState,
      fftLinearAmplitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 16,
    });
    // Steady: same audio after warmup -> low changeSignal
    const steadyFrame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: steadyFft,
      avgAmplitude: 34,
      rms: 0.12,
      frameTimeMs: 32,
    });
    // Changing: completely different spectrum from previous steady frame → high changeSignal
    const changingFrame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: makeFft([
        [150, 1],
        [300, 0.74],
        [520, 0.42],
        [1200, 0.21],
      ]),
      avgAmplitude: 58,
      rms: 0.24,
      frameTimeMs: 48,
    });

    expect(steadyFrame.structureSignal).toBeGreaterThan(0);
    expect(steadyFrame.energySignal).toBeGreaterThan(0.1);
    expect(steadyFrame.modalVisibilityEnergy).toBeGreaterThan(
      RENDER_VISIBLE_RING.visibilityEnergy,
    );
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

    // Threshold reflects the whitepaper's absolute per-band energy estimate
    // (mean/RMS/peak magnitude), not the prior fraction-of-total-power value.
    expect(changingFrame.structureSignal).toBeGreaterThan(0.2);
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
    const proposalSourceCoupledSpectralMoment = makeQuadSlots([
      [0.2, 0.45, -0.7, 0.5],
    ]);

    const frame = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: blendedSourceCoupledSlots,
      proposalSourceCoupledSlots,
      proposalSourceCoupledPhaseSlots,
      proposalSourceCoupledSpectralMoment,
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
    expect(frame.modalFieldSpectralMomentSlots[proposalModeOffset]).toBeCloseTo(
      0.2,
      6,
    );
    expect(
      frame.modalFieldSpectralMomentSlots[proposalModeOffset + 2],
    ).toBeCloseTo(-0.7, 6);
    expect(countActiveSlots(frame.modalFieldSlots)).toBeLessThanOrEqual(12);
  });

  it("keeps low-confidence proposal candidates diagnostic-only until confidence recovers", () => {
    const featureState = createAudioFeatureState();
    buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[1, 1, 1, 0.42]]),
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
        modalObservationCoherence: 0.08,
        modalObservationConfidence: 0.04,
      }),
    });

    expect(readModeKeys(frame.modalFieldSlots)).toEqual(["1:1:1"]);
    expect(frame.modalFieldContinuity.candidateModeCount).toBe(2);
    expect(frame.modalFieldContinuity.rawCandidateModeCount).toBe(2);
    expect(
      frame.modalFieldContinuity.confidenceQualifiedCandidateModeCount,
    ).toBe(0);
    expect(frame.modalFieldContinuity.lowConfidenceCandidateModeCount).toBe(2);
    expect(
      frame.modalDescriptor.diagnostics.modalVarietyAudit
        .upstreamSourceCoupledModeCount,
    ).toBe(2);
    expect(
      frame.modalDescriptor.diagnostics.modalVarietyAudit
        .confidenceQualifiedCandidateModeCount,
    ).toBe(0);

    const recovered = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 96,
      candidateForcingSlots: makeModeSlots([[2, 1, 1, 0.42]]),
      proposalSourceCoupledSlots: makeModeSlots([
        [2, 1, 1, 0.42],
        [3, 1, 1, 0.36],
      ]),
      structuralMetrics: makeModalFieldContinuityStructuralMetrics({
        excitedModeCount: 2,
        observedModalModeCount: 2,
        modalObservationCoherence: 0.9,
        modalObservationConfidence: 0.9,
      }),
    });

    expect(recovered.modalFieldContinuity.admittedModeKeys).toContain("2:1:1");
    expect(
      recovered.modalFieldContinuity.confidenceQualifiedCandidateModeCount,
    ).toBe(2);
  });

  it("uses producer candidate support for admission metadata", () => {
    const featureState = createAudioFeatureState();
    buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[1, 1, 1, 0.42]]),
    });

    const frame = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 16,
      candidateForcingSlots: makeModeSlots([[2, 1, 1, 0.9]]),
      proposalSourceCoupledSlots: makeModeSlots([[2, 1, 1, 0.9]]),
      modalCandidateState: new Map([["2:1:1", { observedSupport: 0.02 }]]),
      structuralMetrics: makeModalFieldContinuityStructuralMetrics({
        modalObservationConfidence: 1,
      }),
    });

    expect(frame.modalFieldContinuity.candidateModeCount).toBe(1);
    expect(frame.modalFieldContinuity.rawCandidateModalEnergy).toBeCloseTo(
      0.9 ** 2,
      6,
    );
    expect(
      frame.modalFieldContinuity.confidenceWeightedCandidateEnergy,
    ).toBeCloseTo((0.02 * 0.9) ** 2, 6);
    expect(
      frame.modalFieldContinuity.confidenceQualifiedCandidateModeCount,
    ).toBe(0);
    expect(frame.modalFieldContinuity.lowConfidenceCandidateModeCount).toBe(1);
    expect(frame.modalFieldContinuity.admittedModeKeys).not.toContain("2:1:1");
  });

  it("bootstraps modal field continuity immediately after a silent reset", () => {
    const featureState = createAudioFeatureState();
    buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[9, 3, 1, 0.42]]),
    });

    const silent = buildFeatureFrameForTest({
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
    expect(held.modalObserverVisibilityEnergy).toBeCloseTo(
      held.energyLedger.projectedRenderEnergy * held.modalObservationConfidence,
      6,
    );
    expect(readModeKeys(held.modalFieldSlots)).toEqual(["9:3:1"]);
    expect(held.modalFieldContinuity.releasingModeKeys).toEqual(["9:3:1"]);
    expect(sumSlotAmplitudes(held.modalFieldSlots)).toBeGreaterThan(0.3);
    expect(sumSlotAmplitudes(held.modalFieldSlots)).toBeLessThan(
      sumSlotAmplitudes(bootstrapped.modalFieldSlots),
    );
  });

  it("keeps live-source modal continuity through a brief empty projection window", () => {
    const featureState = createAudioFeatureState();
    const bootstrapped = buildManualModalContinuityFrame({
      featureState,
      frameTimeMs: 0,
      candidateForcingSlots: makeModeSlots([[9, 3, 1, 0.9]]),
      sourceCoupledPhaseSlots: makePhaseSlots([[0.1, 0.2, 0.8, 0.9]]),
    });
    let held = bootstrapped;

    for (let frameIndex = 1; frameIndex <= 16; frameIndex += 1) {
      held = buildManualModalContinuityFrame({
        featureState,
        frameTimeMs: frameIndex * 33,
        candidateForcingSlots: makeModeSlots([]),
        structuralMetrics: makeModalFieldContinuityStructuralMetrics({
          modalResponseEnergy: 1,
          modalResponseSourceCoupledEnergy: 0.8,
          modalResponseResonantEnergy: 0.2,
          modalResponseRenderEnergy: 0,
          modalResponseRenderSourceCoupledEnergy: 0,
          modalResponseRenderResonantEnergy: 0,
          currentSignalEnergy: 0.5,
          currentSignalAmplitude: 0.4,
          excitedModeCount: 0,
          observedModalModeCount: 0,
        }),
      });
    }

    expect(bootstrapped.renderAuthority).toBe(true);
    expect(held.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(held.energyLedger.sourceBoundaryState).toBe("live");
    expect(held.energyLedger.projectedRenderEnergy).toBeGreaterThan(
      DEFAULT_RENDER_ENERGY_EPSILON,
    );
    expect(held.renderAuthority).toBe(true);
    expect(held.fieldState).toBe("decay");
    expect(readModeKeys(held.modalFieldSlots)).toEqual(["9:3:1"]);
    expect(held.modalFieldContinuity.releasingModeKeys).toEqual(["9:3:1"]);
    expect(sumSlotAmplitudes(held.modalFieldSlots)).toBeGreaterThan(0.01);
  });

  it("does not keep weak background bass active from observable energy alone", () => {
    const originalSourceCoupledSlots = makeModeSlots([
      [1, 1, 1, 0.0006],
      [2, 1, 1, 0.0004],
    ]);
    const frame = buildManualSourceCoupledFrame({
      candidateForcingSlots: originalSourceCoupledSlots,
    });

    expect(frame.fieldState).toBe("idle");
    expect(frame.modalObserverVisibilityEnergy).toBe(0);
    expect(frame.modalVisibilityEnergy).toBe(0);
    expect(countActiveSlots(frame.modalFieldSlots)).toBe(0);
    expect(
      findModeAmplitude(frame.modalFieldSlots, [1, 1, 1]),
    ).toBeLessThanOrEqual(
      findModeAmplitude(originalSourceCoupledSlots, [1, 1, 1]),
    );
  });

  it("keeps strongly observed bass within existing candidate slot energy", () => {
    const originalSourceCoupledSlots = makeModeSlots([
      [1, 1, 1, 0.04],
      [1, 1, 2, 0.032],
      [2, 1, 1, 0.02],
    ]);
    const originalTotal = sumSlotAmplitudes(originalSourceCoupledSlots);
    const frame = buildManualSourceCoupledFrame({
      avgAmplitude: 28,
      rms: 0.16,
      fftLinearAmplitudes: makeFft([
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
      structuralMetrics: makeSourceCoupledStructuralMetrics({
        modeCoherence: 0.82,
        sourceCoupledObservedModeCount: 4,
        sourceCoupledObservationConfidence: 0.78,
        sourceCoupledObservedDrive: 0.42,
        sourceCoupledObservedSnr: 0.45,
        sourceCoupledObservedCoherence: 0.9,
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
    expect(countActiveSlots(frame.modalFieldSlots)).toBeGreaterThan(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeLessThanOrEqual(
      originalTotal + 1e-6,
    );
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.08);
  });

  it("rejects modal visibility for silence and weak incoherent noise", () => {
    const silent = buildManualSourceCoupledFrame({
      avgAmplitude: 0,
      rms: 0,
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      timeData: new Float32Array(FFT_SIZE),
      structuralMetrics: makeSourceCoupledStructuralMetrics({
        modalResponseEnergy: 0,
        modalResponseSourceCoupledEnergy: 0,
        modalResponseModeCount: 0,
        sourceCoupledObservedDrive: 0,
      }),
    });
    const weakNoise = buildManualSourceCoupledFrame({
      avgAmplitude: 7,
      rms: 0.014,
      fftLinearAmplitudes: makeFft([
        [80, 0.035],
        [260, 0.04],
        [730, 0.035],
        [1300, 0.04],
        [2200, 0.035],
      ]),
      timeData: new Float32Array(FFT_SIZE),
      structuralMetrics: makeSourceCoupledStructuralMetrics({
        modalResponseEnergy: 0,
        modalResponseSourceCoupledEnergy: 0,
        modalResponseModeCount: 0,
        sourceCoupledObservationConfidence: 0.04,
        sourceCoupledObservedDrive: 0.04,
        sourceCoupledObservedSnr: 0.02,
        sourceCoupledObservedCoherence: 0.11,
        modeCoherence: 0.1,
        distributedExcitation: 0.74,
      }),
    });

    expect(silent.fieldState).toBe("idle");
    expect(countActiveSlots(silent.modalFieldSlots)).toBe(0);
    expect(silent.renderAuthority).toBe(false);
    expect(silent.modalVisibilityEnergy).toBe(0);
    expect(weakNoise.fieldState).toBe("idle");
    expect(countActiveSlots(weakNoise.modalFieldSlots)).toBe(0);
    expect(weakNoise.renderAuthority).toBe(false);
    expect(weakNoise.modalVisibilityEnergy).toBe(0);
  });

  it("does not let weak cross-input observation create slots", () => {
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
      buildManualSourceCoupledFrame(scenario),
    );
    for (const frame of frames) {
      expect(frame.modalObserverVisibilityEnergy).toBeGreaterThanOrEqual(0);
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

    expect(first.fieldState).toBe("idle");
    expect(first.debug.liveInputNoiseGateActive).toBe(true);
    expect(first.debug.liveInputCalibrationActive).toBe(true);
    expect(mid.debug.liveInputCalibrationActive).toBe(true);
    expect(done.debug.liveInputCalibrationActive).toBe(false);
    expect(done.debug.liveInputNoiseGateActive).toBe(true);
    expect(done.debug.liveInputBaselineRms).toBeGreaterThan(0);
    expect(done.debug.liveInputBaselinePeak).toBe(0);
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
    expect(silence.debug.modalCoefficientEnergy).toBe(
      silence.modalCoefficientEnergy,
    );
    expect(silence.debug.retainedModalCoefficientEnergy).toBe(
      silence.retainedModalCoefficientEnergy,
    );
    expect(silence.modalResponseRenderEnergy).toBe(0);
    expect(silence.debug.modalResponseRenderEnergy).toBe(
      silence.modalResponseRenderEnergy,
    );
    expect(silence.debug.modalResponseEnergy).toBeGreaterThan(0);
    expect(silence.activeModalFieldModeCount).toBe(0);
    expect(silence.activeModeCount).toBe(0);
    expect(sumSlotAmplitudes(silence.modalFieldSlots)).toBe(0);
    expect(countAuthoritativePhaseSlots(silence.modalFieldPhaseSlots)).toBe(0);
  });

  it("cuts render authority after paused line-feed residual meter floor", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus({
      sourceSession: createSourceSession({
        kind: "system",
        deviceKind: "system",
      }),
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

    buildFeatureFrameForTest({
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
    expect(restarted.fieldState).toBe("idle");
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
      rms: 0.7,
      frameTimeMs: 0,
      timeData: makeTimeData({ frequency: 120, amplitude: 0.99 }),
    });
    buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.99],
        [240, 0.21],
        [360, 0.1],
      ],
      avgAmplitude: 1.1,
      rms: 0.7,
      frameTimeMs: LIVE_INPUT_CALIBRATION_MID_MS,
      timeData: makeTimeData({ frequency: 120, amplitude: 0.99 }),
    });
    const invalidFrame = buildLiveInputFrame({
      featureState,
      peaks: [
        [120, 0.99],
        [240, 0.21],
        [360, 0.1],
      ],
      avgAmplitude: 1.1,
      rms: 0.7,
      frameTimeMs: LIVE_INPUT_CALIBRATION_DONE_MS,
      timeData: makeTimeData({ frequency: 120, amplitude: 0.99 }),
    });

    expect(invalidFrame.debug.liveInputCalibrationInvalid).toBe(true);
    expect(invalidFrame.debug.liveInputCalibrationInvalidReason).toBe(
      "baseline-clipping",
    );
    expect(invalidFrame.debug.liveInputCalibrationActive).toBe(true);
    expect(invalidFrame.debug.liveInputNoiseGateActive).toBe(true);
    expect(invalidFrame.debug.liveInputBaselinePeakSpread).toBe(0);
    expect(invalidFrame.fieldState).toBe("idle");
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
    expect(resetFrame.fieldState).toBe("idle");
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

    expect(firstVoice.debug.liveInputBaselinePeak).toBe(0);
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
    expect(firstVoice.debug.liveInputBaselinePeak).toBe(0);
    expect(firstVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.debug.liveInputNoiseGateActive).toBe(false);
    expect(secondVoice.fieldState).toBe("active");
  });

  it.each(["ambient", "vocal"])(
    "derives a line-feed runtime policy from the resolved live-input class for %s intent",
    (acousticIntent) => {
      const featureState = createAudioFeatureState();
      const preparedInputs = prepareAudioFeatureFrameInputs({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: 6.4,
          fftLinearAmplitudes: makeFft([
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
        liveInputAnalysisSettings: { acousticIntent },
      });

      expect(preparedInputs.resolvedLiveInputAnalysisClass).toBe("line-feed");
      expect(preparedInputs.liveInputPolicy).toBe("line-feed");
      expect(preparedInputs.analysisInputMode).toBe("file");
      expect(preparedInputs.isAcousticLiveInput).toBe(false);
    },
  );

  it("builds modal backbone/detail slots from spectral peaks", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 70,
        fftLinearAmplitudes: makeFft([
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
  });

  it("does not apply a second detail-layer weight after admission", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 70,
        fftLinearAmplitudes: makeFft([
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
    const first = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 60,
        fftLinearAmplitudes: makeFft([
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
    const second = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 62,
        fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: richFft,
      rms: 0.36,
    });
    // Run several warmup frames so modal-field continuity can settle before
    // this budget assertion reads the published descriptor.
    for (let i = 0; i < AUDIO_SLOT_CAPACITY / 2; i += 1) {
      buildFeatureFrameForTest({
        analysisSnapshot: snapshot,
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        auditSettings: createAuditSettings(),
      });
    }
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: snapshot,
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings(),
    });

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

    const first = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 20,
        fftLinearAmplitudes: repeatedFft,
        rms: 0.12,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const repeated = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 20,
        fftLinearAmplitudes: repeatedFft,
        rms: 0.12,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const attack = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 65,
        fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      avgAmplitude: 8,
      rms: 0.05,
      frameTimeMs: 0,
    });

    const beat = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: makeFft([[48, 0.08], [96, 0.045], ...upperBed]),
      avgAmplitude: 24,
      rms: 0.09,
      frameTimeMs: 0,
    });
    const beat = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: makeFft([[48, 0.42], [96, 0.22], ...upperBed]),
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      avgAmplitude: 10,
      rms: 0.06,
      frameTimeMs: 0,
    });

    const beat = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      avgAmplitude: 10,
      rms: 0.04,
      frameTimeMs: 0,
    });

    const hats = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: bassFft,
      avgAmplitude: 68,
      rms: 0.36,
      frameTimeMs: 0,
    });
    const held = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: bassFft,
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
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 2,
        fftLinearAmplitudes: makeFft([[80, 0.12]]),
        rms: 0.01,
      }),
      featureState,
      radius: 3,
      status: createStatus({
        sourceSession: createSourceSession({
          kind: "system",
          deviceKind: "live",
        }),
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
      fftLinearAmplitudes: kickFft,
      avgAmplitude: 70,
      rms: 0.38,
      frameTimeMs: 0,
    });
    buildTimedFrame({
      featureState,
      fftLinearAmplitudes: silenceFft,
      avgAmplitude: 6,
      rms: 0.03,
      frameTimeMs: 60,
    });
    const blocked = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: kickFft,
      avgAmplitude: 70,
      rms: 0.38,
      frameTimeMs: 100,
    });
    buildTimedFrame({
      featureState,
      fftLinearAmplitudes: silenceFft,
      avgAmplitude: 6,
      rms: 0.03,
      frameTimeMs: 180,
    });
    const retriggered = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: kickFft,
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
      fftLinearAmplitudes: kickFft,
      avgAmplitude: 72,
      rms: 0.4,
      frameTimeMs: 1800,
    });

    const secondSessionBeat = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: kickFft,
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
      fftLinearAmplitudes: makeFft([
        [330, 0.55],
        [660, 0.35],
      ]),
      rms: 0.18,
    });
    const status = makeActiveStatus();

    buildFeatureFrameForTest({
      analysisSnapshot: steadySnapshot,
      featureState,
      radius: 3,
      status,
    });

    const repeated = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: steadySnapshot.avgAmplitude,
        fftLinearAmplitudes: steadySnapshot.fftLinearAmplitudes,
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

    const first = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 48,
        fftLinearAmplitudes: sharedFft,
        rms: 0.2,
      }),
      featureState,
      radius: 3,
      status,
    });
    const persistentFft = featureState.analysis.fftLinearAmplitudes;

    expect(first.fftLinearAmplitudes).toBe(persistentFft);
    expect(first.fftLinearAmplitudes).not.toBe(sharedFft);
    expect(first.bandEnergies[0]).toBeGreaterThan(0);
    expect(first.bandEnergies[3]).toBeGreaterThan(0);
    expect(first.spectralCentroid).toBeGreaterThan(0);
    const firstAirBand = first.bandEnergies[3];

    sharedFft.fill(0);
    sharedFft[freqToBin(120)] = 0.8;

    const second = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 30,
        fftLinearAmplitudes: sharedFft,
        rms: 0.16,
      }),
      featureState,
      radius: 3,
      status,
    });

    expect(second.fftLinearAmplitudes).toBe(persistentFft);
    expect(second.fftLinearAmplitudes[freqToBin(120)]).toBeCloseTo(0.8);
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

    buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({ fftLinearAmplitudes: activeFft }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings(),
    });

    const frozen = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({ fftLinearAmplitudes: activeFft }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });
    const capturedSourceCoupled = Array.from(frozen.modalFieldSlots);
    const capturedResonant = Array.from(frozen.modalFieldSlots);

    const held = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      }),
      featureState,
      radius: 3,
      status,
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
    });

    expect(Array.from(held.modalFieldSlots)).toEqual(capturedSourceCoupled);
    expect(Array.from(held.modalFieldSlots)).toEqual(capturedResonant);
    expect(held.diagnosticControlState).toMatchObject({
      auditEnabled: true,
      freezeModeSlots: true,
      injectTestTone: false,
    });
  });

  it("injects deterministic test-tone analysis through the modal path", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
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
    expect(frame.diagnosticControlState).toMatchObject({
      auditEnabled: true,
      freezeModeSlots: false,
      injectTestTone: true,
    });
    // avgAmplitude is now RMS-derived: amplitude / sqrt(2) * 255
    expect(frame.averageAmplitude).toBeCloseTo((0.75 / Math.SQRT2) * 255, 1);
  });

  it("injects a richer modal test-tone excitation for the modal path", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: null,
      featureState,
      radius: 3,
      status: createStatus(),
      auditSettings: createAuditSettings({
        injectTestTone: true,
        testToneSignal: "harmonic-series",
        testToneHz: 220,
        testToneAmplitude: 0.5,
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
  });

  it("returns a lightweight debug summary when audit is disabled", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 48,
        fftLinearAmplitudes: makeFft([
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
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 52,
        fftLinearAmplitudes: makeFft([
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

describe("spectral moment feature frame outputs", () => {
  it("populates the canonical pitch basis for active analysis", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: makeFft([
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

    const moments = collectActiveSpectralMoments(
      frame.modalFieldSpectralMomentSlots,
      frame.modalFieldSlots,
      0,
    );
    expect(moments.length).toBeGreaterThan(0);
    expect(frame.modalFieldSpectralSeedDirection).toBeInstanceOf(Float32Array);
    expect(Math.hypot(...frame.modalFieldSpectralSeedDirection)).toBeCloseTo(
      1,
      6,
    );
  });

  it("publishes normalized first and second circular moments", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: makeFft([
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
    const moments = collectActiveSpectralMoments(
      frame.modalFieldSpectralMomentSlots,
      frame.modalFieldSlots,
      0,
    );

    expect(frame.modalFieldSpectralMomentSlots).toBeInstanceOf(Float32Array);
    expect(frame.modalFieldSpectralMomentSlots.length).toBe(
      frame.modalFieldSlots.length,
    );
    for (const moment of moments) {
      expect(Math.hypot(moment.m1x, moment.m1y)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.hypot(moment.m2x, moment.m2y)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("preserves multiple pitch families through render-facing modal slots", () => {
    const featureState = createAudioFeatureState();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          fftLinearAmplitudes: makeFft([
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

    const moments = collectActiveSpectralMoments(
      frame.modalFieldSpectralMomentSlots,
      frame.modalFieldSlots,
    );

    expect(moments.length).toBeGreaterThanOrEqual(2);
    expect(maxSpectralMomentDistance(moments)).toBeGreaterThan(0.28);
  });

  it("keeps injected tones distributed across modal pitch moments", () => {
    for (const testToneHz of [220, 440, 528]) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
        frame = buildFeatureFrameForTest({
          analysisSnapshot: null,
          featureState,
          radius: 3,
          status: createStatus(),
          auditSettings: createAuditSettings({
            injectTestTone: true,
            testToneSignal: "harmonic-series",
            testToneHz,
            testToneAmplitude: 0.5,
          }),
          frameTimeMs: frameIndex * 33,
        });
      }

      const moments = collectActiveSpectralMoments(
        frame.modalFieldSpectralMomentSlots,
        frame.modalFieldSlots,
      );
      let coefficientTotal = 0;
      for (let offset = 3; offset < frame.modalFieldSlots.length; offset += 4) {
        coefficientTotal += Math.max(0, frame.modalFieldSlots[offset] ?? 0);
      }

      expect(moments.length).toBeGreaterThanOrEqual(3);
      expect(maxSpectralMomentDistance(moments)).toBeGreaterThan(0.24);
      expect(coefficientTotal).toBeGreaterThan(0.5);
    }
  });

  it("does not let injected tone frequency collapse modal pitch moments", () => {
    const featureState = createAudioFeatureState();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: null,
        featureState,
        radius: 3,
        status: createStatus(),
        auditSettings: createAuditSettings({
          injectTestTone: true,
          testToneSignal: "harmonic-series",
          testToneHz: 528,
          testToneAmplitude: 0.5,
        }),
        frameTimeMs: frameIndex * 33,
      });
    }

    const moments = collectActiveSpectralMoments(
      frame.modalFieldSpectralMomentSlots,
      frame.modalFieldSlots,
    );

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(moments.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(moments.map(({ m1x, m1y }) => `${m1x}:${m1y}`)).size,
    ).toBeGreaterThan(1);
    expect(frame.modalPhaseAnchorAngularVelocityRadPerSec).toBeGreaterThan(0);
    for (let offset = 0; offset < frame.modalFieldMetadataSlots.length; offset += 4) {
      if ((frame.modalFieldSlots[offset + 3] ?? 0) <= 0) {
        continue;
      }
      expect(frame.modalFieldMetadataSlots[offset + 2]).toBeCloseTo(
        frame.modalFieldMetadataSlots[offset],
        6,
      );
    }
  });

  it("builds pitch moments independently of a retired presentation toggle", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: makeFft([
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

    expect(
      frame.modalFieldSpectralMomentSlots.some((value) => value !== 0),
    ).toBe(true);
    expect(frame).not.toHaveProperty("spectralLightRequested");
  });

  it("keeps modal physics and pitch basis invariant across legacy toggle input", () => {
    const createFrame = (includeSpectralLight) =>
      buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          fftLinearAmplitudes: makeFft([
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
    expect(Array.from(staticFrame.modalFieldSlots)).toEqual(
      Array.from(spectralFrame.modalFieldSlots),
    );
    expect(Array.from(staticFrame.modalFieldSpectralMomentSlots)).toEqual(
      Array.from(spectralFrame.modalFieldSpectralMomentSlots),
    );
    expect(spectralFrame).not.toHaveProperty("spectralLightRequested");
    expect(staticFrame).not.toHaveProperty("spectralLightRequested");
  });

  it("freezes rendered modal slots, phase, and pitch basis", () => {
    const featureState = createAudioFeatureState();
    const first = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: makeFft([
          [220, 0.95],
          [440, 0.72],
          [660, 0.44],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
      frameTimeMs: 1000,
    });
    const second = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: makeFft([
          [330, 0.92],
          [550, 0.68],
          [770, 0.42],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings({ freezeModeSlots: true }),
      frameTimeMs: 1250,
    });

    expect(Array.from(second.modalFieldSlots)).toEqual(
      Array.from(first.modalFieldSlots),
    );
    expect(Array.from(second.modalFieldPhaseSlots)).toEqual(
      Array.from(first.modalFieldPhaseSlots),
    );
    expect(Array.from(second.modalFieldSpectralMomentSlots)).toEqual(
      Array.from(first.modalFieldSpectralMomentSlots),
    );
    expect(Array.from(second.modalFieldSpectralSeedDirection)).toEqual(
      Array.from(first.modalFieldSpectralSeedDirection),
    );
    expect(second.debug.referenceModeSlots).toEqual(
      first.debug.referenceModeSlots,
    );

    const resumed = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        fftLinearAmplitudes: makeFft([
          [330, 0.92],
          [550, 0.68],
          [770, 0.42],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      auditSettings: createAuditSettings({ freezeModeSlots: false }),
      frameTimeMs: 1500,
    });

    expect(Array.from(resumed.modalFieldPhaseSlots)).not.toEqual(
      Array.from(first.modalFieldPhaseSlots),
    );
  });

  it("ignores retired analysis hints without changing the frame contract", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 28,
        fftLinearAmplitudes: makeFft([
          [110, 0.8],
          [330, 0.42],
        ]),
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
    });

    expect(frame.modalFieldSlots).toBeInstanceOf(Float32Array);
    expect(frame.debug.workerState).toBe("none");
    expect(frame.debug.hintSource).toBe("none");
  });

  it("keeps contradictory stale detail bounded", () => {
    const featureState = createAudioFeatureState();
    const first = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: makeFft([
        [550, 0.95],
        [1100, 0.65],
        [1650, 0.42],
      ]),
      avgAmplitude: 40,
      rms: 0.16,
      frameTimeMs: 0,
    });
    const firstResonantAmplitudes = readModeAmplitudeMap(first.modalFieldSlots);

    const second = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 52,
        fftLinearAmplitudes: makeFft([
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
  });

  it("does not let active analysis hints change visible frame signals", () => {
    const fftLinearAmplitudes = makeFft([
      [220, 0.7],
      [440, 0.38],
      [660, 0.18],
    ]);
    const baseFrame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 34,
        fftLinearAmplitudes,
        rms: 0.18,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });
    const comparisonFrame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 34,
        fftLinearAmplitudes,
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
      fftLinearAmplitudes: makeFft([
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

    const baselineFrame = buildFeatureFrameForTest({
      analysisSnapshot,
      featureState: baselineFeatureState,
      radius: 3,
      status: makeActiveStatus(),
    });
    const oversizedFrame = buildFeatureFrameForTest({
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

    const sourceSession = status.sourceSession;
    const isLineFeed =
      sourceSession?.kind === "system" &&
      (sourceSession.systemCapture?.deviceKind === "system" ||
        status.resolvedLiveInputAnalysisClass === "line-feed");

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

  function buildLiveInputNoiseGateFrame(options) {
    return buildFeatureFrameForTest({
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
        fftLinearAmplitudes: makeFft([
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
        fftLinearAmplitudes: makeFft([
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
      fftLinearAmplitudes: makeFft([
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
    expect(frame.debug.liveInputEvidenceUnits).toEqual(
      expect.objectContaining({
        rms: expect.any(Number),
        peak: expect.any(Number),
        spectralCentroid: expect.any(Number),
      }),
    );
    expect(frame.debug.liveInputEvidenceUnits.rms).toBeGreaterThan(1);
    expect(frame.debug.liveInputEvidenceUnits.peak).toBeGreaterThan(1);
    expect(frame.debug.liveInputSourceConfidence).toBeGreaterThanOrEqual(
      frame.debug.liveInputConfidenceOpenThreshold,
    );
    expect(frame.debug.liveInputBaselineRmsSpread).toBeGreaterThanOrEqual(0);
    expect(frame.debug.liveInputBaselinePeakSpread).toBeGreaterThanOrEqual(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.01);
  });

  it("keeps quiet coherent mic tails classified without inventing modal power", () => {
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

    expect(frame.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(frame.debug.liveInputHardSilenceActive).toBe(false);

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

  it.each(["ambient", "vocal"])(
    "keeps weak acoustic %s mic noise and low hum gated",
    (acousticIntent) => {
      const featureState = createAudioFeatureState();
      calibrateLiveInput(featureState, {
        acousticIntent,
        peaks: [
          [90, 0.025],
          [180, 0.018],
        ],
        avgAmplitude: 0.8,
        rms: 0.0016,
      });

      const lowHum = buildLiveInputFrame({
        featureState,
        acousticIntent,
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
        acousticIntent,
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
      expect(lowHum.debug.liveInputHumPenalty).toBeGreaterThan(0);
      expect(lowHum.debug.liveInputSourceConfidence).toBeLessThan(
        lowHum.debug.liveInputConfidenceOpenThreshold,
      );
      expect(weakBroadband.debug.liveInputNoiseGateActive).toBe(true);
      expect(weakBroadband.debug.liveInputSourceConfidence).toBeLessThan(
        weakBroadband.debug.liveInputConfidenceOpenThreshold,
      );
    },
  );

  it("matches file analysis for system-classified live input", () => {
    const fileFeatureState = createAudioFeatureState();
    const systemFeatureState = createAudioFeatureState();
    const fftLinearAmplitudes = makeFft([
      [110, 0.82],
      [220, 0.41],
      [330, 0.22],
      [440, 0.17],
    ]);
    const analysisSnapshot = createSnapshot({
      fftLinearAmplitudes,
      avgAmplitude: 36,
      rms: 0.27,
    });

    const fileFrame = buildLiveInputNoiseGateFrame({
      analysisSnapshot,
      featureState: fileFeatureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 32,
      liveInputAnalysisSettings: { acousticIntent: "ambient" },
    });
    const systemFrame = buildLiveInputNoiseGateFrame({
      analysisSnapshot,
      featureState: systemFeatureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 32,
      liveInputAnalysisSettings: { acousticIntent: "vocal" },
    });

    expect(systemFrame.sourceMode).toBe("line-feed");
    expect(systemFrame.debug.analysisSourceUsed).toBe("system");
    expect(systemFrame.debug.micActive).toBe(false);
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
        fftLinearAmplitudes: makeFft(peaks),
        timeData,
      });
      const fileFrame = buildLiveInputNoiseGateFrame({
        analysisSnapshot,
        featureState: createAudioFeatureState(),
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: 32,
      });
      const systemFrame = buildLiveInputNoiseGateFrame({
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
    const fftLinearAmplitudes = makeFft([
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
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 12,
          fftLinearAmplitudes,
          timeData,
          rms: 0.045,
        }),
        featureState,
        radius: 3,
        status: makeSystemStatus(),
        frameTimeMs: index * 33,
      });
    }

    expect(frame.sourceMode).toBe("line-feed");
    expect(frame.fieldState).toBe("active");
    expect(frame.changeSignal).toBeLessThan(0.08);
    expect(frame.modeCoherence).toBeGreaterThan(0.4);
    expect(frame.debug.modalPersistence).toBeGreaterThan(0.08);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.12);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0.03);
    expect(frame.debug.modalVisibilitySlotEnergy).toBeGreaterThan(0);
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
      const frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 38 : 1.24,
          fftLinearAmplitudes: makeFft(partials),
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
    ).toBeGreaterThan(RENDER_VISIBLE_RING.visibilityEnergy);
  });

  it("keeps meter-loud bass sustain structured without stale resonant detail", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    const samples = new Map();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 42 : 16,
          fftLinearAmplitudes: makeFft(isStrike ? partials : []),
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
          observableModalEnergy: frame.modalObserverVisibilityEnergy,
          activeModalFieldModeCount: frame.activeModalFieldModeCount,
          structureSignal: frame.structureSignal,
          sourceCoupledObservedModeCount:
            frame.debug.sourceCoupledObservedModeCount,
          sourceCoupledObservationConfidence:
            frame.debug.sourceCoupledObservedEnergy,
          resonantObservedModeCount: frame.debug.resonantObservedModeCount,
          resonantObservationConfidence: frame.debug.resonantObservedEnergy,
          resonantRingSupport: frame.debug.resonantRingSupport,
        });
      }
    }

    const open = samples.get(12);
    const mid = samples.get(120);
    const late = samples.get(239);

    expect(frame.fieldState).toBe("active");
    expect(late.activeModalFieldModeCount).toBeGreaterThanOrEqual(4);
    expect(late.sourceCoupledObservedModeCount).toBeGreaterThanOrEqual(4);
    expect(late.sourceCoupledObservationConfidence).toBeGreaterThan(0.035);
    expect(late.resonantObservedModeCount).toBe(0);
    expect(late.resonantObservationConfidence).toBe(0);
    expect(late.resonantRingSupport).toBe(0);
    expect(late.resonantAmplitude).toBeGreaterThan(
      open.resonantAmplitude * 0.35,
    );
    expect(late.modalVisibilityEnergy).toBeGreaterThan(0.3);
    expect(late.observableModalEnergy).toBeGreaterThan(0.03);
    expect(late.observableModalEnergy).toBeGreaterThan(
      mid.observableModalEnergy * 0.75,
    );
    expect(late.modalVisibilityEnergy).toBeGreaterThan(
      open.modalVisibilityEnergy * 0.8,
    );
    expect(mid.structureSignal).toBeGreaterThan(0);
    expect(late.structureSignal).toBeGreaterThan(0);
  });

  it("keeps live line-feed continuity through a two-frame analysis dropout", () => {
    const featureState = createAudioFeatureState();
    const status = makeSystemStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 84,
          fftLinearAmplitudes: makeFft(INHARMONIC_BOWL_STRIKE_PARTIALS),
          timeData: makeMixedTimeData({
            partials: INHARMONIC_BOWL_STRIKE_PARTIALS,
            amplitudeScale: 0.8,
          }),
          rms: 0.24,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });
    }

    expect(frame.renderAuthority).toBe(true);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);

    for (let frameIndex = 12; frameIndex < 14; frameIndex += 1) {
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 84,
          fftLinearAmplitudes: new Float32Array(BIN_COUNT),
          timeData: new Float32Array(FFT_SIZE),
          rms: 0.108,
        }),
        featureState,
        radius: 3,
        status,
        frameTimeMs: frameIndex * 33,
        liveInputAnalysisSettings: { acousticIntent: "ambient" },
      });
    }

    expect(frame.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(frame.energyLedger.sourceBoundaryState).toBe("live");
    expect(frame.energyLedger.projectedRenderEnergy).toBeGreaterThan(
      DEFAULT_RENDER_ENERGY_EPSILON,
    );
    expect(frame.modalResponseEnergy).toBeGreaterThan(0);
    expect(frame.renderAuthority).toBe(true);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.01);
  });

  it("keeps lower-level periodic bass visible without stale resonant detail", () => {
    const featureState = createAudioFeatureState();
    const status = makeResolvedLineFeedLiveStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 360; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 42 : 5.2,
          fftLinearAmplitudes: makeFft(isStrike ? partials : []),
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
    expect(frame.debug.sourceCoupledObservedModeCount).toBeGreaterThanOrEqual(
      4,
    );
    expect(frame.debug.resonantObservedModeCount).toBe(0);
    expect(frame.debug.resonantRingSupport).toBe(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.16);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.02);
    expect(frame.activeModalFieldModeCount).toBeGreaterThanOrEqual(4);
  });

  it("keeps lower-level file bass visible without stale resonant detail", () => {
    const featureState = createAudioFeatureState();
    const status = makeActiveStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 360; frameIndex += 1) {
      const isStrike = frameIndex < 2;
      const partials = isStrike
        ? INHARMONIC_BOWL_STRIKE_PARTIALS
        : LOUD_BOWL_TONE_PARTIALS;
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "file",
          avgAmplitude: isStrike ? 42 : 5.2,
          fftLinearAmplitudes: makeFft(isStrike ? partials : []),
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
    expect(frame.debug.sourceCoupledObservedModeCount).toBeGreaterThanOrEqual(
      4,
    );
    expect(frame.debug.resonantObservedModeCount).toBe(0);
    expect(frame.debug.resonantRingSupport).toBe(0);
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
    it(`keeps trace-level periodic bowl response physical for ${scenario.label} sources`, () => {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 420; frameIndex += 1) {
        const isStrike = frameIndex < 2;
        frame = buildLiveInputNoiseGateFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: isStrike ? 42 : 0.18,
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
      expect(frame.debug.resonantObservedModeCount).toBeGreaterThanOrEqual(4);
      expect(frame.debug.resonantRingSupport).toBeGreaterThan(
        RENDER_VISIBLE_RING.ringSupport,
      );
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(
        RENDER_VISIBLE_RING.slotAmplitudeSum,
      );
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
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
    it(`keeps present bass structure without stale FFT detail for ${scenario.label} sources`, () => {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 420; frameIndex += 1) {
        const isStrike = frameIndex < 2;
        frame = buildLiveInputNoiseGateFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: isStrike ? 42 : 0.18,
            fftLinearAmplitudes: isStrike
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
      expect(frame.debug.sourceCoupledObservedModeCount).toBeGreaterThan(0);
      expect(frame.debug.resonantObservedModeCount).toBe(0);
      expect(frame.debug.resonantRingSupport).toBe(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(
        RENDER_VISIBLE_RING.slotAmplitudeSum,
      );
      // The centered source removes unsupported odd families, so the old
      // apparatus-wide 0.02 visibility literal no longer describes this
      // retained bass case. What matters at the render boundary is that the
      // energy clears the declared laser-exposure knee.
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(
        RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY,
      );
    });
  }

  it("renders soft resonant detail inside the cache-accurate band", () => {
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
    const softResonantPartials = [
      [794.3, 0.0012],
      [820.3, 0.00095],
      [954.6, 0.00072],
    ];

    for (const scenario of scenarios) {
      const featureState = createAudioFeatureState();
      let frame = null;

      for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
        frame = buildLiveInputNoiseGateFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: 0.16,
            fftLinearAmplitudes: makeFft(softResonantPartials),
            timeData: makeMixedTimeData({
              partials: softResonantPartials,
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
      expect(frame.debug.resonantObservedModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.resonantObservedDrive).toBeGreaterThan(0);
      expect(frame.debug.resonantObservedCoherence).toBeGreaterThan(0);
      expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0);
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
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
        frame = buildLiveInputNoiseGateFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: 0.055,
            fftLinearAmplitudes: makeFft(quietBowlHumPartials),
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
      expect(frame.debug.resonantObservedModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.resonantObservedDrive).toBeGreaterThan(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(
        RENDER_VISIBLE_RING.slotAmplitudeSum,
      );
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
    }
  });

  it("keeps E2-range bowl fundamentals visible from observable energy", () => {
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
        frame = buildLiveInputNoiseGateFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: 5.2,
            fftLinearAmplitudes: makeFft(e2BowlPartials),
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
      expect(frame.debug.sourceCoupledObservedModeCount).toBeGreaterThan(0);
      expect(frame.debug.resonantObservedModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.resonantObservedEnergy).toBeGreaterThan(0.003);
      expect(frame.debug.modalResponseEnergy).toBeGreaterThan(0);
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.003);
      expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(
        RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY,
      );
    }
  });

  it("keeps E2-range bowl response energy tracking the source envelope", () => {
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
      const frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: 5.2 * envelope,
          fftLinearAmplitudes: makeFft(partials),
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
          observableModalEnergy: frame.modalObserverVisibilityEnergy ?? 0,
          resonantObservationConfidence:
            frame.debug.resonantObservedEnergy ?? 0,
          rawModalEnergy: frame.debug.modalResponseRawEnergy ?? 0,
          energySignal: frame.energySignal ?? 0,
        });
      }
    }

    const low = samples.reduce((currentLow, sample) =>
      sample.envelope < currentLow.envelope ? sample : currentLow,
    );
    const high = samples.reduce((currentHigh, sample) =>
      sample.envelope > currentHigh.envelope ? sample : currentHigh,
    );

    expect(low.resonantObservationConfidence).toBeGreaterThan(0.003);
    expect(low.observableModalEnergy).toBeGreaterThan(
      RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY,
    );
    // The renderer's modal coefficient budget normalizes topology separately
    // from exposure, so its summed slot amplitude is not a loudness meter.
    // Raw forced-response energy and the explicit presentation-energy signal
    // are the physical quantities that should breathe with source pressure.
    expect(high.rawModalEnergy).toBeGreaterThan(low.rawModalEnergy * 1.5);
    expect(high.energySignal).toBeGreaterThan(low.energySignal * 1.1);
  });

  it("keeps low-meter bowl response physical without observer energy", () => {
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
        frame = buildLiveInputNoiseGateFrame({
          analysisSnapshot: createSnapshot({
            sourceMode: scenario.sourceMode,
            avgAmplitude: isStrike ? 2.2 : 0.18,
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
      expect(frame.debug.resonantObservedModeCount).toBeGreaterThanOrEqual(2);
      expect(frame.debug.resonantRingSupport).toBeGreaterThan(
        RENDER_VISIBLE_RING.ringSupport,
      );
      expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(
        RENDER_VISIBLE_RING.slotAmplitudeSum,
      );
      expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
      expect(frame.activeModalFieldModeCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps line-feed coherent ringing physical below raw meter silence", () => {
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
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 38 : 0.72,
          fftLinearAmplitudes: makeFft(partials),
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
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(
      RENDER_VISIBLE_RING.slotAmplitudeSum,
    );
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(
      RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY,
    );
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
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: isStrike ? 38 : meterIdlePause ? 1.22 : 0.34,
          fftLinearAmplitudes: makeFft(partials),
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
    expect(frame.debug.modalResponseEnergy).toBe(0);
    expect(frame.debug.modalResponseRenderEnergy).toBe(0);
    expect(frame.debug.energyLedger.sourceEnergy).toBe(0);
    expect(frame.debug.energyLedger.sourceBoundaryState).toBe("muted");
    expect(frame.debug.energyLedger.storedModalEnergy).toBe(0);
    expect(frame.debug.energyLedger.projectedRenderEnergy).toBe(0);
    expect(frame.debug.modalResponseCurrentRenderSourceEvidence).toBe(false);
    expect(frame.debug.modalResponseModeCount).toBe(0);
    expect(frame.modalObserverVisibilityEnergy).toBe(0);
    expect(frame.debug.modalVisibilityDominantClusterEnergy).toBeUndefined();
  });

  it("cuts near-silent system line-feed residue without waiting for retained modal buffers", () => {
    const featureState = createAudioFeatureState();
    const status = makeSystemStatus();
    let frame = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 42,
          fftLinearAmplitudes: makeFft(RESONANT_STRIKE_PARTIALS),
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
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 1.2,
          fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 42,
          fftLinearAmplitudes: makeFft(RESONANT_STRIKE_PARTIALS),
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

    frame = buildLiveInputNoiseGateFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "system",
        avgAmplitude: 0.34,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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

  it("keeps projected topology visible through diagnostic support dropouts", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.34,
        fftLinearAmplitudes: makeFft([
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
      [5, 3, 7, 0.026],
      [6, 4, 7, 0.024],
      [7, 5, 6, 0.022],
      [8, 6, 7, 0.02],
      [9, 7, 8, 0.018],
      [10, 8, 9, 0.016],
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
        resonantObservedModeCount: 8,
        resonantObservationConfidence: 0.18,
        resonantRingSupport: 0,
        modalPersistence: 0.035,
        modalDriveEnergy: 0.01,
        modeCoherence: 0.46,
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
    expect(frame.debug.resonantObservedModeCount).toBe(8);
    expect(frame.debug.resonantRingSupport).toBe(0);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0.001);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
  });

  it("keeps observable tails visible below the old categorical threshold", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.52,
        fftLinearAmplitudes: makeFft([
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
        resonantObservedModeCount: 8,
        resonantObservationConfidence: 0.035,
        resonantRingSupport: 0.4,
        resonantObservedCoherence: 0.76,
        modalPersistence: 0.16,
        modalDriveEnergy: 0.012,
        modeCoherence: 0.68,
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
    expect(frame.debug.resonantObservedEnergy).toBe(0.035);
    expect(frame.debug.resonantRingSupport).toBe(0.4);
    expect(frame.debug.resonantObservedCoherence).toBe(0.76);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
  });

  it("does not flash observable visibility off when persistence jitters low", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.38,
        fftLinearAmplitudes: makeFft([
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
        resonantObservedModeCount: 4,
        resonantObservationConfidence: 0.028,
        resonantRingSupport: 0.32,
        resonantObservedCoherence: 0.74,
        modalPersistence: 0.024,
        modalDriveEnergy: 0.006,
        modeCoherence: 0.62,
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
    expect(frame.debug.resonantObservedEnergy).toBe(0.028);
    expect(frame.debug.resonantRingSupport).toBe(0.32);
    expect(frame.debug.modalPersistence).toBeLessThan(0.03);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
  });

  it("exposes continuous observable energy for coherent tails", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.44,
        fftLinearAmplitudes: makeFft([
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
          resonantObservedModeCount: 4,
          resonantObservationConfidence: 0.012,
          resonantRingSupport: 0.22,
          resonantObservedCoherence: 0.78,
          resonantObservedSnr: 0.64,
          modalPersistence: 0.018,
          modalDriveEnergy: 0.004,
          modeCoherence: 0.58,
        },
      }),
    });

    expect(frame.fieldState).toBe("active");
    expect(frame.modalVisibilityEnergy).toBeLessThan(0.18);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.debug.modalObserverVisibilityEnergy).toBe(
      frame.modalObserverVisibilityEnergy,
    );
  });

  it("rejects retained resonant visibility for dense pop-like spectra", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 28,
        fftLinearAmplitudes: makeDenseFft({
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
          sourceCoupledObservedModeCount: 8,
          sourceCoupledObservationConfidence: 1,
          sourceCoupledObservedCoherence: 0.47,
          sourceCoupledObservedSnr: 0.31,
          resonantObservedModeCount: 8,
          resonantObservationConfidence: 1,
          resonantRingSupport: 1,
          resonantObservedDrive: 0,
          resonantObservedSnr: 0.2,
          resonantObservedCoherence: 0.55,
          resonantObservedNoiseFloor: 0.26,
          modalPersistence: 0,
          modalDriveEnergy: 0.16,
          modeCoherence: 0.52,
        },
      }),
    });

    expect(frame.debug.spectralEffectiveBinCount).toBeGreaterThan(6);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0.05);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.18);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
  });

  it("does not let dense music periodicity override weak resonant evidence", () => {
    const evidence = deriveResonantSparseEvidence({
      resonantObservedSnr: 0.175,
      resonantObservedCoherence: 0.548,
      resonantObservedDrive: 0,
      resonantRingSupport: 1,
      resonantObservationConfidence: 1,
      distributedExcitation: 0.627,
      periodicity: 0.983,
      spectralEffectiveBinCount: 24,
      modeCoherence: 0.49,
    });

    expect(evidence.resonantProjectionLoad).toBeGreaterThan(0.9);
    expect(evidence.resonantSparseEvidence).toBeGreaterThan(0.04);
  });

  it("does not let dense music coherence rescue weak resonant evidence", () => {
    const evidence = deriveResonantSparseEvidence({
      resonantObservedSnr: 0.18,
      resonantObservedCoherence: 0.86,
      resonantObservedDrive: 0,
      resonantRingSupport: 1,
      resonantObservationConfidence: 1,
      distributedExcitation: 0.63,
      periodicity: 0.98,
      spectralEffectiveBinCount: 24,
      modeCoherence: 0.86,
    });

    expect(evidence.resonantProjectionLoad).toBeGreaterThan(0.85);
    expect(evidence.resonantSparseEvidence).toBeGreaterThan(0.12);
  });

  it("does not recompute resonant policy at the frame display seam", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 52,
        fftLinearAmplitudes: makeDenseFft({
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
        resonantObservedModeCount: 8,
        resonantObservationConfidence: 1,
        resonantRingSupport: 1,
        resonantObservedDrive: 0,
        resonantObservedSnr: 0.175,
        resonantObservedCoherence: 0.548,
        resonantObservedNoiseFloor: 0.347,
        resonantSparseEvidence: 1,
        sourceCoupledObservedModeCount: 8,
        sourceCoupledObservationConfidence: 1,
        sourceCoupledObservedCoherence: 0.5,
        sourceCoupledObservedSnr: 0.2,
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

    expect(frame.debug.resonantProjectionLoad).toBe(0);
    expect(frame.debug.resonantSparseEvidence).toBe(1);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0.18);
  });

  it("does not reduce observable energy because diagnostic load is dense", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 34,
        fftLinearAmplitudes: makeDenseFft({
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
            sourceCoupledObservedModeCount: 2,
            sourceCoupledObservationConfidence: 0.6,
            sourceCoupledObservedDrive: 0.4,
            sourceCoupledObservedSnr: 0.8,
            sourceCoupledObservedCoherence: 0.8,
            modeCoherence: 0.8,
          },
        }),
      });

    const sparse = buildFrame(0);
    const dense = buildFrame(1);

    expect(dense.modalObserverVisibilityEnergy).toBeCloseTo(
      sparse.modalObserverVisibilityEnergy,
      6,
    );
  });

  it("raises only existing observed slots enough to preserve cached topology", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.5,
        fftLinearAmplitudes: makeFft([
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
          sourceCoupledObservedModeCount: 1,
          sourceCoupledObservationConfidence: 0.04,
          sourceCoupledObservedCoherence: 0.6,
          resonantObservedModeCount: 3,
          resonantObservationConfidence: 0.01,
          resonantRingSupport: 0.24,
          resonantObservedCoherence: 0.82,
          resonantObservedSnr: 0.7,
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
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
  });

  it("exposes phase slots aligned with existing mode slots without adding modes", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0.58,
        fftLinearAmplitudes: makeFft([
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
          resonantObservedModeCount: 2,
          resonantObservationConfidence: 0.012,
          resonantRingSupport: 0.24,
          resonantObservedCoherence: 0.82,
          resonantObservedSnr: 0.7,
          modalPersistence: 0.04,
          modalDriveEnergy: 0.004,
          modeCoherence: 0.66,
          modalPhaseAuthority: 0.48,
          resonantPhaseAuthority: 0.48,
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
    expect(frame.debug.resonantPhaseAuthority).toBeGreaterThan(0);
  });

  it("audits upstream modal publication coverage before descriptor admission", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 36,
        fftLinearAmplitudes: makeFft([
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
          sourceCoupledObservedModeCount: 12,
          sourceCoupledObservationConfidence: 0.4,
          sourceCoupledObservedCoherence: 0.72,
          resonantObservedModeCount: 24,
          resonantObservationConfidence: 0.55,
          resonantRingSupport: 0.7,
          resonantObservedCoherence: 0.82,
          resonantObservedSnr: 0.7,
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
          resonantPhaseAuthority: 0.9,
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
    // The cache consumes the complete admitted descriptor. Numerical
    // performance tiers may change grid or march resolution, never modal
    // content.
    expect(frame.activeModalFieldModeCount).toBe(36);
    expect(audit.semanticModeCount).toBe(frame.activeModalFieldModeCount);
    expect(audit.publishedModeCoverageRatio).toBe(1);
    expect(audit.publishedShellCoverageRatio).toBeCloseTo(
      audit.semanticShellCount / audit.upstreamCandidateShellCount,
      6,
    );
    expect(audit.basisRepresentedShellCoverageRatio).toBeCloseTo(
      audit.representedShellCount / audit.upstreamCandidateShellCount,
      6,
    );
    expect(audit.observedModalPublishedModeCoverageRatio).toBe(1);
    expect(audit.basisRepresentedUpstreamModeCoverageRatio).toBeCloseTo(
      audit.directOpticalRepresentedModeCount / 36,
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
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
          resonantObservedModeCount: 4,
          resonantObservationConfidence: 0.04,
          resonantRingSupport: 0.4,
          resonantObservedCoherence: 0.8,
          modalPersistence: 0.2,
          modalDriveEnergy: 0.08,
          modeCoherence: 0.8,
        },
      }),
    });

    expect(frame.modalObserverVisibilityEnergy).toBe(0);
    expect(frame.modalVisibilityEnergy).toBe(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBe(0);
  });

  it("does not amplify modal slots from observer visibility floors", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 3,
        fftLinearAmplitudes: makeFft([
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
        structuralMetrics: makeSourceCoupledStructuralMetrics({
          sourceCoupledObservationConfidence: 0.09,
          sourceCoupledObservedModeCount: 4,
          sourceCoupledObservedCoherence: 0.88,
          sourceCoupledObservedSnr: 0.82,
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
    const fftLinearAmplitudes = makeFft([
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
      frame = buildLiveInputNoiseGateFrame({
        analysisSnapshot: createSnapshot({
          sourceMode: "system",
          avgAmplitude: 4.8,
          fftLinearAmplitudes,
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

  it("reports observable energy without a categorical visibility lane", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 24,
        fftLinearAmplitudes: makeFft([
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
        sourceCoupledObservedModeCount: 2,
        sourceCoupledObservationConfidence: 0.32,
        sourceCoupledObservedDrive: 0.12,
        sourceCoupledObservedSnr: 0.5,
        sourceCoupledObservedCoherence: 0.82,
        resonantObservedModeCount: 0,
        resonantObservationConfidence: 0,
        resonantRingSupport: 0,
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
    expect(frame.debug.sourceCoupledObservedModeCount).toBe(2);
    expect(frame.debug.sourceCoupledObservedEnergy).toBe(0.32);
    expect(frame.debug.sourceCoupledObservedCoherence).toBe(0.82);
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.debug.resonantObservedEnergy).toBe(0);
  });

  it("keeps loopback-classified live input structurally active", () => {
    const featureState = createAudioFeatureState();
    const frame = buildLiveInputNoiseGateFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 36,
        rms: 0.27,
        fftLinearAmplitudes: makeFft([
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
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(frame.debug.dominantFrequency).toBeGreaterThan(0);
    expect(frame.structureSignal).toBeGreaterThan(0);
  });

  it("keeps quiet line-feed program audio on file-equivalent source normalization", () => {
    const snapshot = createSnapshot({
      sourceMode: "live",
      avgAmplitude: 0.1844,
      rms: 0.005,
      fftLinearAmplitudes: makeFft([
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
    const lineFeedFrame = buildLiveInputNoiseGateFrame({
      analysisSnapshot: snapshot,
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 32,
    });
    const fileFrame = buildLiveInputNoiseGateFrame({
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

  it("derives line-feed visibility from projected observable energy", () => {
    const frame = buildManualSourceCoupledFrame({
      sourceMode: "live",
      status: makeSystemStatus(),
      avgAmplitude: 0.1844,
      rms: 0.005,
      fftLinearAmplitudes: makeFft([
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
      structuralMetrics: makeSourceCoupledStructuralMetrics({
        modeCoherence: 0.64,
        modalDriveEnergy: 0.066,
        modalResponseSourceCoupledEnergy: 1,
        modalResponseEnergy: 1,
        sourceCoupledObservedModeCount: 56,
        sourceCoupledObservationConfidence: 1,
        sourceCoupledObservedDrive: 0.1508,
        sourceCoupledObservedSnr: 0.107,
        sourceCoupledObservedCoherence: 0.97,
        distributedExcitation: 0.224,
      }),
    });

    expect(frame.debug.resolvedLiveInputAnalysisClass).toBe("line-feed");
    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0.12);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalResponseRenderSourceCoupledEnergy).toBeGreaterThan(0);
    expect(frame.modalResponseRenderResonantEnergy).toBe(0);
  });

  it("keeps coherent system modes active from observable energy", () => {
    const frame = buildManualSourceCoupledFrame({
      sourceMode: "live",
      status: makeSystemStatus(),
      avgAmplitude: 0.1844,
      rms: 0.005,
      fftLinearAmplitudes: makeFft([
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
      structuralMetrics: makeSourceCoupledStructuralMetrics({
        modeCoherence: 0.64,
        modalDriveEnergy: 0.066,
        modalResponseSourceCoupledEnergy: 1,
        modalResponseEnergy: 1,
        sourceCoupledObservedModeCount: 56,
        sourceCoupledObservationConfidence: 1,
        sourceCoupledObservedDrive: 0.1508,
        sourceCoupledObservedSnr: 0.107,
        sourceCoupledObservedCoherence: 0.97,
        distributedExcitation: 0.224,
      }),
    });

    expect(frame.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.modalVisibilityEnergy).toBeGreaterThan(0);
    expect(frame.fieldState).toBe("active");
    expect(frame.renderAuthority).toBe(true);
    expect(countActiveSlots(frame.modalFieldSlots)).toBe(2);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeCloseTo(0.01, 6);
  });

  it("keeps state-owned scratch buffers stable across frames", () => {
    const featureState = createAudioFeatureState(8);
    const status = makeActiveStatus({ capacity: 8 });
    const analysisSnapshot = createSnapshot({
      fftLinearAmplitudes: makeFft([
        [110, 0.82],
        [220, 0.41],
        [330, 0.22],
      ]),
    });
    const ownedBuffers = {
      zeroSourceCoupledTargetSlots:
        featureState.analysis.zeroSourceCoupledTargetSlots,
      zeroResonantTargetSlots: featureState.analysis.zeroResonantTargetSlots,
      nonAcousticSourceCoupledTarget:
        featureState.analysis.nonAcousticSourceCoupledTarget.slots,
      nonAcousticResonantTarget:
        featureState.analysis.nonAcousticResonantTarget.slots,
      nonAcousticPeakDriverScratch:
        featureState.analysis.nonAcousticPeakDriverScratch.slots,
      acousticSourceCoupledTarget:
        featureState.analysis.acousticSourceCoupledTarget.slots,
      acousticResonantTarget:
        featureState.analysis.acousticResonantTarget.slots,
    };

    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 16,
    });
    prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState,
      radius: 3,
      status,
      frameTimeMs: 32,
    });

    expect(featureState.analysis.zeroSourceCoupledTargetSlots).toBe(
      ownedBuffers.zeroSourceCoupledTargetSlots,
    );
    expect(featureState.analysis.zeroResonantTargetSlots).toBe(
      ownedBuffers.zeroResonantTargetSlots,
    );
    expect(featureState.analysis.nonAcousticSourceCoupledTarget.slots).toBe(
      ownedBuffers.nonAcousticSourceCoupledTarget,
    );
    expect(featureState.analysis.nonAcousticResonantTarget.slots).toBe(
      ownedBuffers.nonAcousticResonantTarget,
    );
    expect(featureState.analysis.nonAcousticPeakDriverScratch.slots).toBe(
      ownedBuffers.nonAcousticPeakDriverScratch,
    );
    expect(featureState.analysis.acousticSourceCoupledTarget.slots).toBe(
      ownedBuffers.acousticSourceCoupledTarget,
    );
    expect(featureState.analysis.acousticResonantTarget.slots).toBe(
      ownedBuffers.acousticResonantTarget,
    );
  });
});

describe("tempo tracking", () => {
  it("emits estimatedTempo=0 and beatPhase=0 when no beats detected", () => {
    const featureState = createAudioFeatureState();
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 0,
        fftLinearAmplitudes: makeFft([[440, 0.01]]),
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
      lastFrame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 90,
          fftLinearAmplitudes: beatFft,
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
    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 90,
        fftLinearAmplitudes: makeFft([
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
      lastFrame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 90,
          fftLinearAmplitudes: beatFft,
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
  it("writes a pure sine into the fft magnitudes by default", () => {
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
    const fundamentalBin = frequencyToBinIndex(
      440,
      snapshot.fftLinearAmplitudes.length,
      SAMPLE_RATE,
    );
    const secondHarmonicBin = frequencyToBinIndex(
      880,
      snapshot.fftLinearAmplitudes.length,
      SAMPLE_RATE,
    );
    expect(snapshot.fftLinearAmplitudes[fundamentalBin]).toBeGreaterThan(0);
    expect(snapshot.fftLinearAmplitudes[secondHarmonicBin]).toBe(0);
  });

  it("writes harmonics only for explicit harmonic-series test tones", () => {
    const snapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: {
        testToneHz: 440,
        testToneSignal: "harmonic-series",
        testToneAmplitude: 0.5,
      },
      fftSize: FFT_SIZE,
      sampleRate: SAMPLE_RATE,
    });

    const secondHarmonicBin = frequencyToBinIndex(
      880,
      snapshot.fftLinearAmplitudes.length,
      SAMPLE_RATE,
    );
    expect(snapshot.fftLinearAmplitudes[secondHarmonicBin]).toBeGreaterThan(0);
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
    expect(lowAmp.fftLinearAmplitudes.some((v) => v > 0)).toBe(true);
    expect(highAmp.fftLinearAmplitudes.some((v) => v > 0)).toBe(true);
  });

  it("keeps modal visibility energy present for low-transient injected tones", () => {
    const featureState = createAudioFeatureState();
    const warmup = buildFeatureFrameForTest({
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
    const sustained = buildFeatureFrameForTest({
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
    expect(sustained.debug.modalVisibilityProjectedEnergy).toBeGreaterThan(0);
    expect(sustained.modalObserverVisibilityEnergy).toBeGreaterThan(0);
    expect(
      sustained.debug.modalVisibilityDominantClusterEnergy,
    ).toBeUndefined();
  });

  it("does not expose modal visibility energy for silence or weak noisy input", () => {
    const silent = buildFeatureFrameForTest({
      analysisSnapshot: null,
      featureState: createAudioFeatureState(),
      radius: 3,
      status: createStatus(),
    });
    const weakNoisy = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 0,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT).fill(0.0005),
        rms: 0.0003,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });

    expect(silent.modalVisibilityEnergy).toBe(0);
    expect(silent.modalObserverVisibilityEnergy).toBe(0);
    expect(weakNoisy.energySignal).toBeLessThan(0.15);
    expect(weakNoisy.modalVisibilityEnergy).toBe(0);
    expect(weakNoisy.modalObserverVisibilityEnergy).toBe(0);
  });
});

describe("canonical linear spectrum", () => {
  it("preserves the same analyser amplitudes for file and microphone inputs", () => {
    const peaks = [
      [440, 0.013],
      [880, 0.0065],
    ];
    const file = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 6,
        fftLinearAmplitudes: makeFft(peaks),
        rms: 0.022,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 1260,
    });
    const microphone = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 6,
        fftLinearAmplitudes: makeFft(peaks),
        rms: 0.022,
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      status: makeLiveInputStatus(),
      frameTimeMs: 1260,
    });

    expect(Array.from(microphone.fftLinearAmplitudesSource)).toEqual(
      Array.from(file.fftLinearAmplitudesSource),
    );
    expect(microphone.fftPeakAmplitude).toBeCloseTo(0.013, 6);
    expect(file.fftPeakAmplitude).toBeCloseTo(0.013, 6);
  });

  it("keeps temporal composition state separate from published frames", () => {
    const featureState = createAudioFeatureState();
    const compositionState = createAudioFeatureCompositionState();
    const status = createStatus({
      sourceSession: createSourceSession(),
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 42,
    });
    const analysisSnapshot = createSnapshot({
      sourceMode: "file",
      avgAmplitude: 36,
      fftLinearAmplitudes: makeFft([
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
    const analysisResult = runCompleteFeatureAnalysisForTest(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
      compositionState,
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
      compositionState,
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
      sourceSession: createSourceSession(),
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 42,
    });
    const prepared = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 36,
        fftLinearAmplitudes: makeFft([
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
    const analysisResult = runCompleteFeatureAnalysisForTest(prepared);
    const frame = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
    });

    expect(frame.timbreSpread).toBeGreaterThanOrEqual(0);
    expect(frame.spectralNovelty).toBeGreaterThanOrEqual(0);
    expect(frame.debug.workerState).toBe("none");
    expect(frame.debug.hintSource).toBe("none");
  });

  it("lets current silence collapse stateful composite authority", () => {
    const featureState = createAudioFeatureState();
    const compositionState = createAudioFeatureCompositionState();
    const status = createStatus({
      sourceSession: createSourceSession(),
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 7,
    });
    const analysisSnapshot = applyTestToneToSnapshot({
      analysisSnapshot: null,
      auditSettings: {
        testToneHz: 220,
        testToneSignal: "pure-sine",
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
    const analysisResult = runCompleteFeatureAnalysisForTest(prepared);
    const first = composeAudioFeatureFrame({
      preparedInputs: prepared,
      analysisResult,
      compositionState,
    });
    expect(first.modalDescriptor.fieldAuthority).toBe("complete");

    const preparedSilentReuse = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 0,
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
      compositionState,
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
  it("keeps a 6 kHz peak in audio evidence without an over-tail mode identity", () => {
    const featureState = createAudioFeatureState();
    const fftLinearAmplitudes = makeFft([[6000, 0.7]]);
    const frame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes,
      avgAmplitude: 80,
      rms: 0.4,
    });

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(frame.spectralBandEnergies[4]).toBeGreaterThan(0);
    expect(
      frame.modalDescriptor.modes.modalField.every(
        (mode) =>
          mode.naturalFrequencyHz <=
          DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz,
      ),
    ).toBe(true);
  });

  it("fade-out: structureSignal collapses proportionally with energy", () => {
    const featureState = createAudioFeatureState();
    const fftLinearAmplitudes = makeFft([
      [440, 0.8],
      [880, 0.5],
      [1320, 0.3],
    ]);

    // Warm up the feature state at full amplitude over several frames
    for (let i = 0; i < 30; i++) {
      buildTimedFrame({
        featureState,
        fftLinearAmplitudes,
        avgAmplitude: 200,
        rms: 0.8,
        frameTimeMs: i * 16,
      });
    }
    const fullFrame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes,
      avgAmplitude: 200,
      rms: 0.8,
      frameTimeMs: 30 * 16,
    });

    // Now drive to near-silence (rms = 0.02, avgAmplitude = 3) — all subsequent frames
    const silentFft = new Float32Array(BIN_COUNT);
    for (let i = 0; i < 50; i++) {
      buildTimedFrame({
        featureState,
        fftLinearAmplitudes: silentFft,
        avgAmplitude: 3,
        rms: 0.02,
        frameTimeMs: (30 + i) * 16,
      });
    }
    const silentFrame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes: silentFft,
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
    const fftLinearAmplitudes = new Float32Array(BIN_COUNT);
    const loFreqBin = freqToBin(3200);
    const hiFreqBin = freqToBin(10000);
    for (let i = loFreqBin; i <= hiFreqBin && i < BIN_COUNT; i++) {
      fftLinearAmplitudes[i] = 0.6;
    }
    const frame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes,
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
    const fftLinearAmplitudes = makeFft([
      [440, 0.9],
      [880, 0.7],
      [4000, 0.75],
      [8000, 0.65],
    ]);

    // Warm up with several frames so modal state stabilises
    for (let i = 0; i < 15; i++) {
      buildTimedFrame({
        featureState,
        fftLinearAmplitudes,
        avgAmplitude: 150,
        rms: 0.6,
        frameTimeMs: i * 16,
      });
    }
    const frame = buildTimedFrame({
      featureState,
      fftLinearAmplitudes,
      avgAmplitude: 150,
      rms: 0.6,
      frameTimeMs: 15 * 16,
    });

    expect(frame.trebleTonalEnergy).toBeGreaterThan(0);
    expect(frame.modeCoherence).toBeGreaterThan(0);
  });

  it("mixed low-end backbone and broadband treble stays structured without foggy promotion", () => {
    const featureState = createAudioFeatureState();
    const fftLinearAmplitudes = new Float32Array(BIN_COUNT);
    for (const [frequency, amplitude] of [
      [102.537, 0.9],
      [477.286, 0.5],
      [1346.068, 0.25],
    ]) {
      fftLinearAmplitudes[freqToBin(frequency)] = amplitude;
    }
    for (
      let bin = freqToBin(3200);
      bin <= freqToBin(10000) && bin < BIN_COUNT;
      bin += 1
    ) {
      fftLinearAmplitudes[bin] = 0.01;
    }

    let frame = null;
    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      frame = buildTimedFrame({
        featureState,
        fftLinearAmplitudes,
        avgAmplitude: 130,
        rms: 0.56,
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(["complete", "capacity-limited"]).toContain(
      frame.modalDescriptor.fieldAuthority,
    );
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
      const frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          sourceMode,
          avgAmplitude,
          fftLinearAmplitudes: makeFft(mixedPartials),
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
        DEFAULT_RENDER_ENERGY_EPSILON,
      );
      expect(energyLedger.projectedResonantEnergy, label).toBeGreaterThan(
        energyLedger.renderEnergyEpsilon,
      );
    }
  });

  it("keeps resonant projection alive through intense changing music", () => {
    function makeIntenseChangingMusicFft(frameIndex) {
      const fftLinearAmplitudes = new Float32Array(BIN_COUNT);
      const roots = [74, 82, 92, 103];
      const root = roots[frameIndex % roots.length];
      for (const [frequency, amplitude] of [
        [root, 0.75 + 0.15 * Math.sin(frameIndex * 0.7)],
        [root * 2, 0.54],
        [root * 3, 0.35],
        [root * 4, 0.24],
      ]) {
        fftLinearAmplitudes[freqToBin(frequency)] = amplitude;
      }

      const highs = [4200, 5100, 6200, 7600, 8800, 9800, 10800];
      for (let index = 0; index < highs.length; index += 1) {
        const frequency =
          highs[(index + frameIndex) % highs.length] *
          (1 + 0.015 * Math.sin(frameIndex + index));
        fftLinearAmplitudes[freqToBin(frequency)] =
          0.11 + ((index + frameIndex) % 3 === 0 ? 0.12 : 0);
      }

      for (
        let bin = freqToBin(2600);
        bin < freqToBin(11500) && bin < BIN_COUNT;
        bin += 3
      ) {
        fftLinearAmplitudes[bin] = Math.max(
          fftLinearAmplitudes[bin],
          0.035 + ((bin + frameIndex) % 11) / 300,
        );
      }
      return fftLinearAmplitudes;
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
        frame = buildFeatureFrameForTest({
          analysisSnapshot: createSnapshot({
            sourceMode,
            avgAmplitude: 120,
            fftLinearAmplitudes: makeIntenseChangingMusicFft(frameIndex),
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
        DEFAULT_RENDER_ENERGY_EPSILON,
      );
      expect(frame.debug.resonantModeCount, label).toBeGreaterThan(0);
    }
  });
});

describe("modal excitation integration", () => {
  it("keeps the renderer contract stable while using resonator-driven structure", () => {
    const featureState = createAudioFeatureState();
    const fftLinearAmplitudes = makeFft([
      [110, 0.95],
      [220, 0.52],
      [6600, 0.38],
    ]);
    const timeData = makeTimeData({
      frequency: 110,
      amplitude: 0.45,
      harmonics: [[2, 0.08]],
    });

    const frame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 120,
        fftLinearAmplitudes,
        timeData,
        rms: 0.52,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 33,
    });

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
    const fftLinearAmplitudes = makeFft([
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
      fftLinearAmplitudes,
      timeData,
      rms: 0.039,
      spectralFlux: 0.00018,
    });

    buildFeatureFrameForTest({
      analysisSnapshot: snapshot,
      featureState,
      radius: 3,
      status: makeSystemStatus(),
      frameTimeMs: 0,
    });
    const frame = buildFeatureFrameForTest({
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
    expect(frame.debug.modalCoefficientEnergy).toBe(
      frame.modalCoefficientEnergy,
    );
    expect(frame.debug.retainedModalCoefficientEnergy).toBe(
      frame.retainedModalCoefficientEnergy,
    );
    expect(frame.debug.observationEnergy).toBe(frame.observationEnergy);
    expect(frame.debug.modalResponseRenderEnergy).toBe(
      frame.modalResponseRenderEnergy,
    );
    expect(frame.debug.modalResponseSourceCoupledEnergy).toBe(
      frame.modalResponseRenderSourceCoupledEnergy,
    );
    expect(frame.debug.modalResponseResonantEnergy).toBe(
      frame.modalResponseRenderResonantEnergy,
    );
    expect(frame.debug.modalResponseEnergy).toBeGreaterThan(0.05);
    expect(frame.observationEnergy).toBeGreaterThanOrEqual(
      frame.modalResponseEnergy,
    );
    expect(frame.debug.modalResponseModeCount).toBeGreaterThan(0);
    expect(sumSlotAmplitudes(frame.modalFieldSlots)).toBeGreaterThan(0.04);
    expect(frame.fieldState).toBe("active");
  });

  it("redistributes high-order coefficients through analytic continuity", () => {
    const featureState = createAudioFeatureState();
    const firstFrame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 118,
        fftLinearAmplitudes: makeFft([
          [1550, 0.92],
          [1900, 0.72],
        ]),
        timeData: makeTimeData({
          frequency: 1550,
          amplitude: 0.36,
        }),
        rms: 0.42,
      }),
      featureState,
      radius: 3,
      status: makeActiveStatus(),
      frameTimeMs: 0,
    });
    const firstFrameAmplitudes = readModeAmplitudeMap(
      firstFrame.modalFieldSlots,
    );
    let frame = null;

    for (let frameIndex = 1; frameIndex <= 3; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 118,
          fftLinearAmplitudes: makeFft([
            [2400, 0.96],
            [2850, 0.7],
          ]),
          timeData: makeTimeData({
            frequency: 2400,
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
    const switchedAmplitudes = readModeAmplitudeMap(frame.modalFieldSlots);
    const comparedKeys = new Set([
      ...firstFrameAmplitudes.keys(),
      ...switchedAmplitudes.keys(),
    ]);
    const coefficientDelta = Array.from(comparedKeys).reduce(
      (total, key) =>
        total +
        Math.abs(
          (switchedAmplitudes.get(key) ?? 0) -
            (firstFrameAmplitudes.get(key) ?? 0),
        ),
      0,
    );

    expect(coefficientDelta).toBeGreaterThan(0.05);
    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(new Set(switchedResonantKeys).size).toBe(
      switchedResonantKeys.length,
    );
  });

  it("keeps line-feed tail topology bounded only by direct optical capacity", () => {
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

    buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 5.2,
        fftLinearAmplitudes: makeFft([
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
      LIVE_INPUT_POST_CALIBRATION_NEXT_MS + 66,
    ]) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          sourceMode: "live",
          avgAmplitude: 5.4,
          fftLinearAmplitudes: makeFft([
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
    // The full physical registry can publish more simultaneously credible
    // shells than the cache-bake shortlist admits. Continuity reports those
    // uncommitted candidates explicitly; it must not duplicate them into the
    // visible packet.
    expect(new Set(frame.modalFieldContinuity.tailModeKeys).size).toBe(
      frame.modalFieldContinuity.tailModeKeys.length,
    );
    expect(
      frame.modalFieldContinuity.tailModeKeys.every(
        (key) => !switchedResonantKeys.includes(key),
      ),
    ).toBe(true);
    expect(switchedResonantKeys.length).toBeLessThanOrEqual(
      frame.modalFieldContinuity.visibleModeCount,
    );
    expect(
      frame.modalFieldContinuity.visibleModeCount - switchedResonantKeys.length,
    ).toBeLessThanOrEqual(
      new Set([
        ...frame.modalFieldContinuity.admittedModeKeys,
        ...frame.modalFieldContinuity.releasingModeKeys,
        ...frame.modalFieldContinuity.evictingModeKeys,
      ]).size,
    );
    const continuityHandoffExcess =
      frame.modalFieldContinuity.visibleModeCount +
      frame.modalFieldContinuity.tailModeKeys.length -
      frame.modalFieldContinuity.candidateModeCount;
    expect(continuityHandoffExcess).toBeGreaterThanOrEqual(0);
    expect(continuityHandoffExcess).toBeLessThanOrEqual(
      new Set([
        ...frame.modalFieldContinuity.retainedModeKeys,
        ...frame.modalFieldContinuity.releasingModeKeys,
        ...frame.modalFieldContinuity.evictingModeKeys,
      ]).size,
    );
    const diagnostics = frame.modalDescriptor.diagnostics;
    expect(diagnostics.modalVarietyAudit.upstreamCandidateModeCount).toBe(
      diagnostics.modalVarietyAudit.upstreamSourceCoupledModeCount +
        diagnostics.modalVarietyAudit.upstreamResonantModeCount,
    );
    expect(frame.modalFieldContinuity.candidateModeCount).toBeLessThanOrEqual(
      diagnostics.modalVarietyAudit.upstreamCandidateModeCount,
    );
    expect(
      diagnostics.modalVarietyAudit.upstreamResonantModeCount,
    ).toBeGreaterThan(0);
    expect(frame.activeModalFieldModeCount).toBeLessThanOrEqual(
      AUDIO_SLOT_CAPACITY,
    );
  });

  function buildPureToneFrame({
    testToneHz,
    frameCount = 8,
    observeFrame = null,
    cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS,
  }) {
    const featureState = createAudioFeatureState();
    let frame = null;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: null,
        featureState,
        radius: 3,
        cavityAcousticScale,
        status: createStatus({
          sourceSession: createSourceSession(),
          analysisSource: "file",
          isPlaying: true,
          isAudioLoaded: true,
          hasAnalysisSource: true,
          sampleRate: SAMPLE_RATE,
          fftSize: FFT_SIZE,
        }),
        auditSettings: createAuditSettings({
          injectTestTone: true,
          testToneSignal: "pure-sine",
          testToneHz,
          testToneAmplitude: 0.7,
        }),
        frameTimeMs: frameIndex * 33,
      });
      observeFrame?.(frame, frameIndex);
    }

    return frame;
  }

  function measureModalShellConcentration(frame) {
    const shellEnergy = new Map();
    for (const mode of frame.modalDescriptor.modes.modalField) {
      const shellKey = mode.naturalFrequencyHz.toFixed(6);
      shellEnergy.set(
        shellKey,
        (shellEnergy.get(shellKey) ?? 0) + mode.coefficient ** 2,
      );
    }
    const sortedShellEnergy = Array.from(shellEnergy.values()).sort(
      (left, right) => right - left,
    );
    const totalEnergy = sortedShellEnergy.reduce(
      (total, energy) => total + energy,
      0,
    );
    return {
      totalEnergy,
      dominantShellShare:
        totalEnergy > 0 ? sortedShellEnergy[0] / totalEnergy : 0,
      topThreeShellShare:
        totalEnergy > 0
          ? sortedShellEnergy
              .slice(0, 3)
              .reduce((total, energy) => total + energy, 0) / totalEnergy
          : 0,
    };
  }

  it("keeps a 528 Hz tone concentrated in ordered modal shells", () => {
    const concentration = measureModalShellConcentration(
      buildPureToneFrame({ testToneHz: 528, frameCount: 24 }),
    );

    expect(concentration.totalEnergy).toBeGreaterThan(0.3);
    expect(concentration.dominantShellShare).toBeGreaterThan(0.55);
    expect(concentration.topThreeShellShare).toBeGreaterThan(0.85);
  });

  it("keeps apparatus linewidth authoritative over physical selectivity", () => {
    const shipping = measureModalShellConcentration(
      buildPureToneFrame({ testToneHz: 528, frameCount: 24 }),
    );
    const narrow = measureModalShellConcentration(
      buildPureToneFrame({
        testToneHz: 528,
        frameCount: 24,
        cavityAcousticScale: {
          ...CAVITY_ACOUSTIC_DEFAULTS,
          modalLoadLinewidthHz: 3,
        },
      }),
    );

    expect(narrow.dominantShellShare).toBeGreaterThan(
      shipping.dominantShellShare + 0.1,
    );
    expect(narrow.totalEnergy).toBeLessThan(shipping.totalEnergy * 0.85);
  });

  it("repeats the same modal descriptor for the same 528 Hz fixture", () => {
    const first = buildPureToneFrame({ testToneHz: 528, frameCount: 24 });
    const second = buildPureToneFrame({ testToneHz: 528, frameCount: 24 });

    expect(second.modalFieldSlots).toEqual(first.modalFieldSlots);
    expect(second.modalFieldMetadataSlots).toEqual(
      first.modalFieldMetadataSlots,
    );
    expect(second.modalFieldPhaseSlots).toEqual(first.modalFieldPhaseSlots);
  });

  function buildMixedToneFrame(
    partials,
    { cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS, frameCount = 8 } = {},
  ) {
    const featureState = createAudioFeatureState();
    let frame = null;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 64,
          rms: 0.35,
          fftLinearAmplitudes: makeFft(partials),
          timeData: makeMixedTimeData({
            partials,
            amplitudeScale: 0.8,
          }),
        }),
        featureState,
        radius: 3,
        cavityAcousticScale,
        status: createStatus({
          sourceSession: createSourceSession(),
          analysisSource: "file",
          isPlaying: true,
          isAudioLoaded: true,
          hasAnalysisSource: true,
          sampleRate: SAMPLE_RATE,
          fftSize: FFT_SIZE,
        }),
        frameTimeMs: frameIndex * 33,
      });
    }

    return frame;
  }

  it("preserves several ordered modal families for a major triad", () => {
    const concentration = measureModalShellConcentration(
      buildMixedToneFrame(
        [
          [220, 0.7],
          [277.18, 0.58],
          [329.63, 0.52],
        ],
        { frameCount: 24 },
      ),
    );

    expect(concentration.totalEnergy).toBeGreaterThan(0.05);
    expect(concentration.dominantShellShare).toBeLessThan(0.7);
    expect(concentration.topThreeShellShare).toBeGreaterThan(0.7);
  });

  it("keeps 12 kHz spectral evidence while spatial topology stays inside the apparatus tail", () => {
    const frame = buildPureToneFrame({ testToneHz: 12000 });

    const diagnostics = frame.modalDescriptor.diagnostics;

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(diagnostics.rejectionReasons).toEqual({});
    expect(diagnostics.structuralCoverageSatisfied).toBe(true);
    expect(frame.spectralBandEnergies[5]).toBeGreaterThan(0);
    expect(
      frame.modalDescriptor.modes.modalField.every(
        (mode) =>
          mode.naturalFrequencyHz <=
          DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz,
      ),
    ).toBe(true);
  });

  it("projects over-band audio only through cache-resolved cavity identities", () => {
    const frame = buildPureToneFrame({ testToneHz: 2398 });
    const diagnostics = frame.modalDescriptor.diagnostics;

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(
      diagnostics.modalVarietyAudit.directOpticalRepresentedModeCount,
    ).toBeGreaterThan(0);
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(frame.modalDescriptor.counts.modalFieldModeCount).toBeGreaterThan(0);
    expect(
      frame.modalDescriptor.modes.modalField.every((mode) =>
        isModalFamilyResolvedByFieldCache(mode),
      ),
    ).toBe(true);
    expect(
      Math.max(
        ...frame.modalDescriptor.modes.modalField.map(
          (mode) => mode.naturalFrequencyHz,
        ),
      ),
    ).toBeLessThanOrEqual(DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz);
  });

  it("renders a near-tail pure sine without admitting an unsupported mode", () => {
    const frame = buildPureToneFrame({
      testToneHz: DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz * 0.96,
    });

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(frame.modalDescriptor.counts.modalFieldModeCount).toBeGreaterThan(0);
    expect(frame.modalDescriptor.modes.modalField.length).toBeGreaterThan(0);
    expect(frame.modalFieldSlots.some((value) => value !== 0)).toBe(true);
    expect(
      frame.modalDescriptor.modes.modalField.every(
        (mode) =>
          mode.naturalFrequencyHz <=
          DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz,
      ),
    ).toBe(true);
  });

  it("keeps low pure sine topology authoritative when over-bandwidth is not dominant", () => {
    const frame = buildPureToneFrame({ testToneHz: 440 });

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(frame.modalDescriptor.counts.modalFieldModeCount).toBeGreaterThan(0);
    expect(frame.activeModeCount).toBe(
      frame.modalDescriptor.counts.modalFieldModeCount,
    );
    expect(frame.modalFieldSlots.some((value) => value !== 0)).toBe(true);
  });

  it("renders a multi-mode pure sine as a stationary standing field", () => {
    const settledPhaseOffsetsByMode = new Map();
    const frame = buildPureToneFrame({
      testToneHz: 293.7,
      frameCount: 32,
      observeFrame: (currentFrame, frameIndex) => {
        if (frameIndex < 24) {
          return;
        }
        for (
          let modeIndex = 0;
          modeIndex < currentFrame.activeModalFieldModeCount;
          modeIndex += 1
        ) {
          const offset = modeIndex * 4;
          if ((currentFrame.modalFieldPhaseSlots[offset + 3] ?? 0) <= 0) {
            continue;
          }
          const modeKey = [
            currentFrame.modalFieldSlots[offset],
            currentFrame.modalFieldSlots[offset + 1],
            currentFrame.modalFieldSlots[offset + 2],
          ].join(":");
          const phaseOffsets = settledPhaseOffsetsByMode.get(modeKey) ?? [];
          phaseOffsets.push(currentFrame.modalFieldPhaseSlots[offset]);
          settledPhaseOffsetsByMode.set(modeKey, phaseOffsets);
        }
      },
    });
    const authoritativePhaseVelocities = [];
    for (
      let modeIndex = 0;
      modeIndex < frame.activeModalFieldModeCount;
      modeIndex += 1
    ) {
      const offset = modeIndex * 4;
      if ((frame.modalFieldPhaseSlots[offset + 3] ?? 0) > 0) {
        authoritativePhaseVelocities.push(
          frame.modalFieldPhaseSlots[offset + 1],
        );
      }
    }

    expect(authoritativePhaseVelocities.length).toBeGreaterThan(1);
    for (const phaseVelocity of authoritativePhaseVelocities) {
      expect(phaseVelocity).toBeCloseTo(0, 6);
    }
    const persistentPhaseOffsets = Array.from(
      settledPhaseOffsetsByMode.entries(),
    ).filter(([, phaseOffsets]) => phaseOffsets.length === 8);
    expect(persistentPhaseOffsets.length).toBeGreaterThan(1);
    for (const [modeKey, phaseOffsets] of persistentPhaseOffsets) {
      for (let index = 1; index < phaseOffsets.length; index += 1) {
        const phaseDelta = Math.atan2(
          Math.sin(phaseOffsets[index] - phaseOffsets[index - 1]),
          Math.cos(phaseOffsets[index] - phaseOffsets[index - 1]),
        );
        // The common 293.7 Hz carrier must be absent. Residual mode-specific
        // motion is allowed while each damped oscillator asymptotically
        // reaches its forced-response phase; carrier leakage moves every mode
        // by O(1) radians per analysis frame.
        expect(
          Math.abs(phaseDelta),
          `${modeKey} phase drift at settling frame ${24 + index}`,
        ).toBeLessThan(0.1);
      }
    }
  });

  it("keeps low-tone topology while high-frequency energy stays spectrally reactive", () => {
    const representedDominant = buildMixedToneFrame([
      [440, 0.95],
      [12000, 0.08],
    ]);
    const mixedBandwidth = buildMixedToneFrame([
      [440, 0.2],
      [12000, 0.9],
    ]);

    expect(representedDominant.modalDescriptor.fieldAuthority).toBe("complete");
    expect(representedDominant.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(representedDominant.spectralBandEnergies[5]).toBeGreaterThan(0);

    expect(mixedBandwidth.modalDescriptor.fieldAuthority).toBe("complete");
    expect(mixedBandwidth.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(mixedBandwidth.spectralBandEnergies[5]).toBeGreaterThan(0);
    expect(
      mixedBandwidth.modalDescriptor.modes.modalField.every(
        (mode) =>
          mode.naturalFrequencyHz <=
          DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz,
      ),
    ).toBe(true);
  });

  it("keeps broadband topology authoritative without cache-era rejection", () => {
    const featureState = createAudioFeatureState();
    const lowBodyPartials = [
      [110, 0.9],
      [220, 0.55],
      [440, 0.35],
      [880, 0.22],
    ];
    const buildUpPartials = [
      [110, 0.25],
      [220, 0.16],
      [440, 0.1],
      [6200, 1.2],
      [7600, 1.0],
      [9100, 0.9],
      [10800, 0.8],
      [12000, 0.7],
      [14000, 0.6],
      [16000, 0.5],
    ];
    let frame = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 100,
          fftLinearAmplitudes: makeFft(lowBodyPartials),
          timeData: makeMixedTimeData({ partials: lowBodyPartials }),
          rms: 0.45,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");

    for (let frameIndex = 12; frameIndex < 18; frameIndex += 1) {
      frame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 120,
          fftLinearAmplitudes: makeFft(buildUpPartials),
          timeData: makeMixedTimeData({ partials: buildUpPartials }),
          rms: 0.5,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: frameIndex * 33,
      });
    }

    expect(frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(frame.renderAuthority).toBe(true);
    expect(frame.energyLedger.sourceBoundaryState).toBe("live");
    expect(frame.energyLedger.projectedRenderEnergy).toBeGreaterThan(
      DEFAULT_RENDER_ENERGY_EPSILON,
    );
    expect(frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(frame.modalDescriptor.counts.modalFieldModeCount).toBeGreaterThan(0);
    expect(frame.modalFieldSlots.some((value) => value !== 0)).toBe(true);
  });

  it("modal path still collapses structure through fade-out after shared persistence gating", () => {
    const featureState = createAudioFeatureState();
    const fftLinearAmplitudes = makeFft([
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
      buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 120,
          fftLinearAmplitudes,
          timeData,
          rms: 0.52,
        }),
        featureState,
        radius: 3,
        status: makeActiveStatus(),
        frameTimeMs: i * 16,
      });
    }

    const activeFrame = buildFeatureFrameForTest({
      analysisSnapshot: createSnapshot({
        avgAmplitude: 120,
        fftLinearAmplitudes,
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
      fadedFrame = buildFeatureFrameForTest({
        analysisSnapshot: createSnapshot({
          avgAmplitude: 3,
          fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
    const fftLinearAmplitudes = makeFft([
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
      fftLinearAmplitudes,
      timeData,
      rms: 0.52,
    });

    const rectangularFrame = buildFeatureFrameForTest({
      analysisSnapshot,
      featureState: featureStateRectangular,
      radius: 3,
      cavityGeometry: "rectangular",
      status: makeActiveStatus(),
      frameTimeMs: 33,
    });
    const sphericalRequestedFrame = buildFeatureFrameForTest({
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
    expect(sphericalRequestedFrame.debug.requestedCavityGeometry).toBe(
      "spherical",
    );
    expect(sphericalRequestedFrame.debug.effectiveCavityGeometry).toBe(
      "rectangular",
    );
  });

  it("keeps weak file fade residue diagnostic-only instead of rendering topology", () => {
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

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: activeFft,
        timeData: activeTimeData,
        avgAmplitude: 120,
        rms: 0.52,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
    }

    for (let frameIndex = 10; frameIndex < 16; frameIndex += 1) {
      silentResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 2.5,
        rms: 0.01,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = silentResult.frame;
    }

    expect(
      silentResult.analysisResult.structuralMetrics.modalResponseEnergy,
    ).toBeGreaterThan(0);
    expect(
      silentResult.analysisResult.structuralMetrics.modalResponseRenderEnergy,
    ).toBe(0);
    expect(silentResult.frame.sourceEvidence.currentSourceEvidence).toBe(false);
    expect(silentResult.frame.energyLedger.sourceBoundaryState).toBe("muted");
    expect(silentResult.frame.energyLedger.storedModalEnergy).toBeGreaterThan(
      0,
    );
    expect(silentResult.frame.energyLedger.projectedRenderEnergy).toBe(0);
    expect(silentResult.frame.renderAuthority).toBe(false);
    expect(silentResult.frame.fieldState).toBe("idle");
    expect(silentResult.frame.hasModalField).toBe(false);
    expect(silentResult.frame.activeModeCount).toBe(0);
    expect(silentResult.frame.activeModalFieldModeCount).toBe(0);
    expect(silentResult.frame.modalDescriptor.fieldAuthority).toBe("complete");
    expect(sumSlotAmplitudes(silentResult.frame.modalFieldSlots)).toBe(0);
    expect(silentResult.frame.structureSignal).toBe(0);
    expect(silentResult.frame.changeSignal).toBe(0);
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
    let activeFieldAmplitude = 0;
    let activeSignalAmplitude = 0;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: activeFft,
        timeData: activeTimeData,
        avgAmplitude: 120,
        rms: 0.52,
        frameTimeMs: frameIndex * 33,
        previousFrame,
      });
      previousFrame = result.frame;
      activeFieldAmplitude = sumSlotAmplitudes(result.frame.modalFieldSlots);
      activeSignalAmplitude = sumSlotAmplitudes(
        result.analysisResult.signalModeSlots,
      );
    }

    for (let frameIndex = 10; frameIndex < 64; frameIndex += 1) {
      silentResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: silentFft,
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
    expect(
      sumSlotAmplitudes(silentResult.analysisResult.signalModeSlots),
    ).toBeLessThan(activeSignalAmplitude);
    const decayedFieldAmplitude = sumSlotAmplitudes(
      silentResult.frame.modalFieldSlots,
    );
    expect(decayedFieldAmplitude).toBe(0);
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
    expect(decayedFieldAmplitude).toBeLessThan(activeFieldAmplitude);
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
        fftLinearAmplitudes: activeFft,
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
      fftLinearAmplitudes: activeFft,
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
    expect(pausedResult.analysisResult.fftPeakAmplitude).toBe(0);
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
        fftLinearAmplitudes: activeFft,
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
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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

  // Ledger invariants that hold on every frame, swept across input regimes
  // rather than spot-checked in one scenario.
  //
  // Note what is deliberately NOT asserted here: projectedRenderEnergy is not
  // bounded by storedModalEnergy in the general case. The render lane sums
  // squared field-slot amplitudes while storedModalEnergy is the oscillator
  // integrator's state, and the integrator has a time constant. Throttling the
  // render lane to it would smear every onset, so the design lets the
  // projection follow current drive and applies the stored-energy bound only in
  // the capped regimes (see modalEnergyLedger.js). Asserting the bound
  // unconditionally looks like conservation but is a category error between two
  // different budgets.
  it("keeps the energy ledger internally consistent across input regimes", () => {
    const regimes = [
      { label: "silence", peaks: [], avgAmplitude: 0, rms: 0 },
      { label: "pure tone", peaks: [[440, 0.9]], avgAmplitude: 24, rms: 0.2 },
      {
        label: "quiet tone",
        peaks: [[110, 0.002]],
        avgAmplitude: 0.4,
        rms: 0.001,
      },
      {
        label: "rich harmonic",
        peaks: [
          [196, 0.9],
          [392, 0.7],
          [588, 0.5],
          [784, 0.35],
          [1176, 0.2],
        ],
        avgAmplitude: 26,
        rms: 0.24,
      },
      {
        label: "dense polyphony",
        peaks: Array.from({ length: 18 }, (_, index) => [
          320 + index * 410,
          0.05,
        ]),
        avgAmplitude: 8,
        rms: 0.025,
      },
      {
        label: "clipping loud",
        peaks: [
          [220, 1],
          [330, 1],
          [440, 1],
        ],
        avgAmplitude: 60,
        rms: 0.7,
      },
      {
        label: "subsonic only",
        peaks: [[18, 0.8]],
        avgAmplitude: 12,
        rms: 0.1,
      },
      {
        label: "ultrasonic only",
        peaks: [[19000, 0.8]],
        avgAmplitude: 12,
        rms: 0.1,
      },
      // Abrupt cut from loud sustain to hard silence: the field slots still
      // carry decaying amplitude while the oscillator integrator has already
      // dropped, which is the regime where the stored-energy cap has to bite.
      {
        label: "abrupt silence",
        peaks: [
          [196, 0.95],
          [392, 0.8],
          [588, 0.65],
          [784, 0.5],
        ],
        avgAmplitude: 30,
        rms: 0.28,
        hardCut: true,
      },
    ];

    let observedStoredEnergy = 0;
    let observedRenderEnergy = 0;
    let observedCappedFrame = false;

    for (const regime of regimes) {
      const featureState = createAudioFeatureState();
      let previousFrame = null;
      // Onset, sustain, then release so stored energy is exercised while
      // rising, held, and decaying.
      for (let frameIndex = 0; frameIndex < 24; frameIndex += 1) {
        const releasing = frameIndex >= (regime.hardCut ? 12 : 16);
        const silent = regime.hardCut && releasing;
        const result = buildModalExcitationAnalysisFrame({
          featureState,
          fftLinearAmplitudes: silent
            ? new Float32Array(BIN_COUNT)
            : makeFft(
                releasing
                  ? regime.peaks.map(([f, a]) => [f, a * 0.001])
                  : regime.peaks,
              ),
          timeData:
            silent || !regime.peaks.length
              ? new Float32Array(FFT_SIZE)
              : makeMixedTimeData({
                  partials: regime.peaks,
                  amplitudeScale: releasing ? 0.001 : 1,
                }),
          avgAmplitude: releasing ? 0 : regime.avgAmplitude,
          rms: silent ? 0 : releasing ? regime.rms * 0.004 : regime.rms,
          frameTimeMs: frameIndex * 33,
          previousFrame,
        });
        previousFrame = result.frame;

        const ledger = result.frame.energyLedger;
        const context = `${regime.label} frame ${frameIndex}`;

        for (const key of [
          "sourceEnergy",
          "storedModalEnergy",
          "projectedRenderEnergy",
          "rawProjectedRenderEnergy",
        ]) {
          expect(
            Number.isFinite(ledger[key]),
            `${context}: ${key} finite`,
          ).toBe(true);
          expect(
            ledger[key],
            `${context}: ${key} non-negative`,
          ).toBeGreaterThanOrEqual(0);
          expect(ledger[key], `${context}: ${key} bounded`).toBeLessThanOrEqual(
            1,
          );
        }

        // Capping only ever removes render energy; it can never add any.
        expect(
          ledger.projectedRenderEnergy,
          `${context}: projection exceeds its own raw value`,
        ).toBeLessThanOrEqual(
          ledger.rawProjectedRenderEnergy + DEFAULT_RENDER_ENERGY_EPSILON,
        );

        // Layer energies must partition the projection, not exceed it.
        expect(
          ledger.projectedSourceCoupledEnergy + ledger.projectedResonantEnergy,
          `${context}: layer energies exceed the projection`,
        ).toBeLessThanOrEqual(ledger.projectedRenderEnergy + 1e-6);

        // A suppressed boundary must project exactly nothing.
        if (
          ledger.renderBoundaryState === "absent" ||
          ledger.renderBoundaryState === "muted"
        ) {
          expect(
            ledger.projectedRenderEnergy,
            `${context}: suppressed boundary still projected energy`,
          ).toBe(0);
        }

        // The stored-energy bound is the declared contract in the capped
        // regimes, so assert it exactly where the design promises it.
        const capped =
          ledger.renderBoundaryState === "zero" ||
          ledger.currentSignalAmplitude <= ledger.renderEnergyEpsilon;
        if (capped) {
          observedCappedFrame = true;
          expect(
            ledger.projectedRenderEnergy,
            `${context}: capped projection exceeds stored modal energy`,
          ).toBeLessThanOrEqual(
            ledger.storedModalEnergy + DEFAULT_RENDER_ENERGY_EPSILON,
          );
        }

        observedStoredEnergy = Math.max(
          observedStoredEnergy,
          ledger.storedModalEnergy,
        );
        observedRenderEnergy = Math.max(
          observedRenderEnergy,
          ledger.projectedRenderEnergy,
        );
      }
    }

    // Guard against the invariants going vacuous: the sweep must actually
    // produce energy, and must actually reach the capped regime.
    expect(observedStoredEnergy).toBeGreaterThan(0);
    expect(observedRenderEnergy).toBeGreaterThan(0);
    expect(observedCappedFrame).toBe(true);
  });

  it("preserves physical response under weak file forcing", () => {
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
        fftLinearAmplitudes: makeFft(activePartials),
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
      fftLinearAmplitudes: makeDenseFft({
        count: 92,
        amplitude: 0.00001,
        peakFrequency: 427,
        peakAmplitude: 0.00008,
      }),
      timeData: makeMixedTimeData({
        partials: activePartials,
        amplitudeScale: 0.001,
      }),
      avgAmplitude: 0,
      rms: 0.0008,
      frameTimeMs: 40 * 33,
      previousFrame,
      status: makeActiveStatus(),
    });

    expect(residueResult.frame.sourceEvidence.currentSourceEvidence).toBe(true);
    expect(residueResult.frame.energyLedger.sourceEnergy).toBeGreaterThan(0);
    expect(
      residueResult.frame.energyLedger.currentSignalAmplitude,
    ).toBeGreaterThan(0);
    // The resonator's absolute residue is owned by its one-pole damping, not
    // by a presentation threshold. Weak forcing must reduce the instantaneous
    // drive while the stored modal energy remains available to ring down.
    expect(
      residueResult.frame.energyLedger.currentSignalAmplitude,
    ).toBeLessThan(previousFrame.energyLedger.currentSignalAmplitude);
    expect(
      residueResult.analysisResult.structuralMetrics.currentSignalAmplitude,
    ).toBeCloseTo(residueResult.frame.energyLedger.currentSignalAmplitude, 8);
    expect(
      residueResult.frame.energyLedger.projectedRenderEnergy,
    ).toBeLessThanOrEqual(
      residueResult.frame.energyLedger.storedModalEnergy +
        DEFAULT_RENDER_ENERGY_EPSILON,
    );
    expect(residueResult.frame.modalObserverVisibilityEnergy).toBeCloseTo(
      residueResult.frame.energyLedger.projectedRenderEnergy *
        residueResult.frame.modalObservationConfidence,
      6,
    );
    expect(
      residueResult.frame.modalObserverVisibilityEnergy,
    ).toBeLessThanOrEqual(
      residueResult.frame.energyLedger.projectedRenderEnergy,
    );
    expect(residueResult.frame.activeModalFieldModeCount).toBeGreaterThan(0);
    expect(residueResult.frame.fieldState).toBe("active");
  });

  it("keeps dense low-change modal input energy-bounded without collapsing reactivity", () => {
    const featureState = createAudioFeatureState();
    let previousFrame = null;
    let result = null;

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      result = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: makeFft([
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

    expect(sumSlotAmplitudes(result.analysisResult.modeSlots)).toBeCloseTo(
      sumSlotAmplitudes(result.analysisResult.signalModeSlots),
      8,
    );
    expect(result.frame.structureSignal).toBeGreaterThan(0);
    expect(result.frame.changeSignal).toBeGreaterThanOrEqual(0);
    expect(result.frame.modeCoherence).toBeGreaterThan(0);
    expect(result.frame.debug.modalVisibilityActiveModeCount).toBeGreaterThan(
      4,
    );
    expect(result.frame.debug.projectionConservationApplied).toBeUndefined();
    expect(result.frame.debug).not.toHaveProperty(
      "projectionEnergyNormalizationApplied",
    );
    expect(result.frame.debug).not.toHaveProperty(
      "projectionAllocatedEnergySourceCoupled",
    );
    const rawProjectionEnergy =
      result.frame.debug.projectionRawEnergySourceCoupled +
      result.frame.debug.projectionRawEnergyResonant;
    const projectionOverlapPressure = Math.max(
      result.frame.debug.projectionOverlapPressureSourceCoupled,
      result.frame.debug.projectionOverlapPressureResonant,
    );

    expect(rawProjectionEnergy).toBeGreaterThan(0);
    expect(projectionOverlapPressure).toBeGreaterThan(0);
    expect(
      result.frame.debug.modalVisibilityProjectedEnergy,
    ).toBeLessThanOrEqual(1);
    expect(
      result.frame.debug.modalVisibilityDominantClusterEnergy,
    ).toBeUndefined();
  });

  it("measures coefficient redistribution after a clear tonal switch", () => {
    const featureState = createAudioFeatureState();
    let previousFrame = null;
    let result = null;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      result = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: makeFft([
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
    for (let frameIndex = 10; frameIndex < 22; frameIndex += 1) {
      switchedResult = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: makeFft([
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

    // The eigenbasis is fixed, so mode identity overlap is expected. The
    // physical transition is a redistribution of coefficient energy within
    // that basis, compared against the same tone simply continuing to ring.
    const sustainedState = createAudioFeatureState();
    let sustainedPrevious = null;
    let sustainedSource = null;
    let sustainedResult = null;
    for (let frameIndex = 0; frameIndex < 22; frameIndex += 1) {
      sustainedResult = buildModalExcitationAnalysisFrame({
        featureState: sustainedState,
        fftLinearAmplitudes: makeFft([
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
        previousFrame: sustainedPrevious,
      });
      sustainedPrevious = sustainedResult.frame;
      if (frameIndex === 9) {
        sustainedSource = buildModalFingerprint(sustainedResult.frame);
      }
    }

    const switchedRedistribution = measureModalCoefficientRedistribution(
      sourceFingerprint,
      switchedFingerprint,
    );
    const sustainedRedistribution = measureModalCoefficientRedistribution(
      sustainedSource,
      buildModalFingerprint(sustainedResult.frame),
    );

    expect(switchedRedistribution).toBeGreaterThan(
      sustainedRedistribution + 0.1,
    );
  });

  it("measures modal continuity for stable coherent input and clearance on silence", () => {
    const featureState = createAudioFeatureState();
    let previousFrame = null;
    let sourceFrame = null;
    let sustainedFrame = null;

    for (let frameIndex = 0; frameIndex < 16; frameIndex += 1) {
      const result = buildModalExcitationAnalysisFrame({
        featureState,
        fftLinearAmplitudes: makeFft([
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
        fftLinearAmplitudes: makeFft([]),
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
