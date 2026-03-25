import { describe, expect, it } from "vitest";
import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";
import {
  buildAudioFeatureAnalysisSnapshot,
  buildCurrentAudioFeatureAnalysisResult,
  composeAudioFeatureFrame,
  createAudioFeatureState,
  prepareAudioFeatureFrameInputs,
  runHeavyAudioFeatureAnalysis,
  updateAudioFeatureFastSignalState,
  updateAudioFeatureStructuralState,
} from "../audioFeatures.js";
import { buildAudioFeatureTransportFrame } from "./audioFeatureEngine.js";
import {
  buildLaneRunDecisions,
  createEngineState,
  deriveDirtyState,
  shouldPublishDirtySnapshot,
} from "./audioFeatureEngine.worker.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const LEGACY_PEAK = "legacy-peak";
const MODAL_EXCITATION = "modal-excitation";
const DUAL = "dual";

function buildLegacyTransportFrame(overrides = {}) {
  return buildAudioFeatureTransportFrame({
    structuralImplementation: LEGACY_PEAK,
    ...overrides,
  });
}

function createStatus(overrides = {}) {
  return {
    audioInputMode: "file",
    analysisSource: "file",
    pitchSourceMode: "spectral",
    fftSize: FFT_SIZE,
    capacity: AUDIO_SLOT_CAPACITY,
    sampleRate: SAMPLE_RATE,
    isAudioLoaded: true,
    isPlaying: true,
    isLiveInputActive: false,
    hasAnalysisSource: true,
    workerStatus: null,
    liveInputCalibrationVersion: 0,
    ...overrides,
  };
}

function createSnapshot(overrides = {}) {
  return {
    sourceMode: "file",
    avgAmplitude: 24,
    fftMagnitudes: new Float32Array(FFT_SIZE / 2),
    timeData: new Float32Array(FFT_SIZE),
    rms: 0.2,
    spectralCentroid: 0.3,
    spectralFlux: 0.1,
    ...overrides,
  };
}

function createPreparedInputs(frameTimeMs, overrides = {}) {
  return prepareAudioFeatureFrameInputs({
    analysisSnapshot: createSnapshot({
      fftMagnitudes: new Float32Array([0, 0.95, 0.6, 0.2]),
      ...overrides.analysisSnapshot,
    }),
    featureState: overrides.featureState ?? createAudioFeatureState(),
    radius: 3,
    status: createStatus(overrides.status),
    frameTimeMs,
    structuralImplementation: overrides.structuralImplementation ?? LEGACY_PEAK,
  });
}

function createLoopbackLiveStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "live",
    analysisSource: "live",
    isPlaying: false,
    isLiveInputActive: true,
    hasAnalysisSource: true,
    liveInputKind: "system",
    liveInputDeviceKind: "system",
    liveInputAnalysisClass: "line-feed",
    ...overrides,
  });
}

function createSystemStatus(overrides = {}) {
  return createStatus({
    audioInputMode: "system",
    analysisSource: "file",
    isPlaying: false,
    isLiveInputActive: true,
    hasAnalysisSource: true,
    liveInputKind: "system",
    liveInputDeviceKind: "system",
    liveInputAnalysisClass: "line-feed",
    ...overrides,
  });
}

describe("audio feature engine transport", () => {
  it("keeps explicit legacy-peak file transport lean and without time data", () => {
    const frame = buildLegacyTransportFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: new Float32Array([0, 1, 0.5]),
        timeData: new Float32Array([0, 0.1, -0.1]),
      }),
      status: createStatus({
        playbackSessionId: "file-session",
      }),
      frameTimeMs: 1000,
      analysisHints: { active: true, novelty: 0.6 },
      radius: 3,
    });

    expect(frame.sessionKey).toBe("file:file-session");
    expect(frame.audioInputMode).toBe("file");
    expect(frame.structuralImplementation).toBe(LEGACY_PEAK);
    expect(frame.status).toBeUndefined();
    expect(frame.analysisSnapshot).toBeUndefined();
    expect(frame.fftMagnitudes).toBeInstanceOf(Float32Array);
    expect(frame.timeData).toBeNull();
    expect(frame.analysisHints).toEqual({ active: true, novelty: 0.6 });
  });

  it("defaults file transport to modal excitation when structural implementation is omitted", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot({
        timeData: new Float32Array([0, 0.1, -0.1]),
      }),
      status: createStatus({
        playbackSessionId: "file-session",
      }),
      frameTimeMs: 1000,
      radius: 3,
    });

    expect(frame.structuralImplementation).toBe(MODAL_EXCITATION);
    expect(frame.timeData).toBeInstanceOf(Float32Array);
  });

  it("includes time data for explicit modal-excitation file transport", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot({
        timeData: new Float32Array([0, 0.1, -0.1]),
      }),
      status: createStatus({
        playbackSessionId: "file-session",
      }),
      frameTimeMs: 1000,
      radius: 3,
      structuralImplementation: MODAL_EXCITATION,
    });

    expect(frame.structuralImplementation).toBe(MODAL_EXCITATION);
    expect(frame.timeData).toBeInstanceOf(Float32Array);
  });

  it("includes time data for explicit dual file transport", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot({
        timeData: new Float32Array([0, 0.1, -0.1]),
      }),
      status: createStatus({
        playbackSessionId: "file-session",
      }),
      frameTimeMs: 1000,
      radius: 3,
      structuralImplementation: DUAL,
    });

    expect(frame.structuralImplementation).toBe(DUAL);
    expect(frame.timeData).toBeInstanceOf(Float32Array);
  });

  it("passes requested cavity geometry through the worker transport frame", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot(),
      status: createStatus({
        playbackSessionId: "file-session",
      }),
      frameTimeMs: 1000,
      radius: 3,
      cavityGeometry: "spherical",
    });

    expect(frame.cavityGeometry).toBe("spherical");
  });

  it("includes time data for acoustic live input transport in explicit legacy-peak mode", () => {
    const frame = buildLegacyTransportFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        fftMagnitudes: new Float32Array([0, 0.8, 0.4]),
        timeData: new Float32Array([0, 0.2, -0.2]),
      }),
      status: createStatus({
        audioInputMode: "live",
        analysisSource: "live",
        isLiveInputActive: true,
        liveInputDeviceKind: "live",
        liveInputAnalysisClass: "acoustic-mic",
      }),
      frameTimeMs: 1500,
      radius: 3,
    });

    expect(frame.audioInputMode).toBe("live");
    expect(frame.timeData).toBeInstanceOf(Float32Array);
  });

  it("includes time data for explicit modal-excitation system transport", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "system",
        timeData: new Float32Array([0, 0.2, -0.2]),
      }),
      status: createSystemStatus(),
      frameTimeMs: 1500,
      radius: 3,
      structuralImplementation: MODAL_EXCITATION,
    });

    expect(frame.audioInputMode).toBe("system");
    expect(frame.timeData).toBeInstanceOf(Float32Array);
  });
});

describe("audio feature engine worker lanes", () => {
  it("runs structural, chroma, and tempo lanes at separate cadences", () => {
    const engineState = createEngineState({
      runtime: "worker",
      structuralCadenceMs: 33,
      snapshotPublishCadenceMs: 33,
      chromaCadenceMs: 66,
      tempoCadenceMs: 120,
      maxSnapshotAgeMs: 96,
    });
    engineState.latestSnapshot = {
      frameTimeMs: 1000,
      analysisSessionKey: "file:file-session",
      analysisInputsSignature: '"baseline"',
      analysisResult: {},
    };
    engineState.latestAnalysisResult = {};
    engineState.lastPublishedAtMs = 1000;
    engineState.lastAnalysisSessionKey = "file:file-session";
    engineState.lastAnalysisInputsSignature = '"baseline"';
    engineState.lastStructuralUpdateAtMs = 1000;
    engineState.lastChromaUpdateAtMs = 1000;
    engineState.lastTempoUpdateAtMs = 1000;

    const earlyDecisions = buildLaneRunDecisions(engineState, {
      currentFrameAtMs: 1020,
      analysisSessionKey: "file:file-session",
      analysisInputsSignature: '"baseline"',
    });
    expect(earlyDecisions.fastSignal).toBe(true);
    expect(earlyDecisions.structural).toBe(false);
    expect(earlyDecisions.chroma).toBe(false);
    expect(earlyDecisions.tempo).toBe(false);

    const structuralDecisions = buildLaneRunDecisions(engineState, {
      currentFrameAtMs: 1040,
      analysisSessionKey: "file:file-session",
      analysisInputsSignature: '"baseline"',
    });
    expect(structuralDecisions.structural).toBe(true);
    expect(structuralDecisions.chroma).toBe(false);
    expect(structuralDecisions.tempo).toBe(false);

    const chromaDecisions = buildLaneRunDecisions(engineState, {
      currentFrameAtMs: 1070,
      analysisSessionKey: "file:file-session",
      analysisInputsSignature: '"baseline"',
    });
    expect(chromaDecisions.structural).toBe(true);
    expect(chromaDecisions.chroma).toBe(true);
    expect(chromaDecisions.tempo).toBe(false);

    const tempoDecisions = buildLaneRunDecisions(engineState, {
      currentFrameAtMs: 1130,
      analysisSessionKey: "file:file-session",
      analysisInputsSignature: '"baseline"',
    });
    expect(tempoDecisions.structural).toBe(true);
    expect(tempoDecisions.chroma).toBe(true);
    expect(tempoDecisions.tempo).toBe(true);
  });

  it("forces all lanes when the session signature changes", () => {
    const engineState = createEngineState();
    engineState.latestSnapshot = {
      frameTimeMs: 1000,
      analysisSessionKey: "file:old-session",
      analysisInputsSignature: '"sig-a"',
      analysisResult: {},
    };
    engineState.latestAnalysisResult = {};
    engineState.lastPublishedAtMs = 1000;
    engineState.lastAnalysisSessionKey = "file:old-session";
    engineState.lastAnalysisInputsSignature = '"sig-a"';
    engineState.lastStructuralUpdateAtMs = 1000;
    engineState.lastChromaUpdateAtMs = 1000;
    engineState.lastTempoUpdateAtMs = 1000;

    const decisions = buildLaneRunDecisions(engineState, {
      currentFrameAtMs: 1010,
      analysisSessionKey: "file:new-session",
      analysisInputsSignature: '"sig-b"',
    });

    expect(decisions.forced).toBe(true);
    expect(decisions.structural).toBe(true);
    expect(decisions.chroma).toBe(true);
    expect(decisions.tempo).toBe(true);
  });

  it("suppresses publishes until a dirty lane crosses the publish cadence", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = createPreparedInputs(2000, { featureState });
    const analysisResult = runHeavyAudioFeatureAnalysis(preparedInputs);
    const previousSnapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult,
      publishCount: 1,
    });
    const nextAnalysisResult = {
      ...analysisResult,
      beatPulseId: (analysisResult.beatPulseId ?? 0) + 1,
    };
    const dirtyState = deriveDirtyState(previousSnapshot, nextAnalysisResult, {
      fastSignal: true,
      structural: false,
      chroma: false,
      tempo: false,
    });
    const engineState = createEngineState({
      runtime: "worker",
      structuralCadenceMs: 33,
      snapshotPublishCadenceMs: 33,
      chromaCadenceMs: 66,
      tempoCadenceMs: 120,
      maxSnapshotAgeMs: 96,
    });
    engineState.latestSnapshot = previousSnapshot;
    engineState.lastPublishedAtMs = 2000;

    expect(dirtyState.fastSignal).toBe(true);
    expect(
      shouldPublishDirtySnapshot(engineState, dirtyState, false, 2010),
    ).toBe(false);
    expect(
      shouldPublishDirtySnapshot(engineState, dirtyState, false, 2040),
    ).toBe(true);
  });

  it("marks structural changes from fingerprints even when projected arrays are reused", () => {
    const previousSnapshot = {
      analysisResult: {
        activeBackboneModeCount: 1,
        activeDetailModeCount: 0,
        activeModeCount: 1,
        dominantFrequency: 220,
        dominantAmplitude: 0.4,
        analysisEngine: "spectral",
        pitchSource: "fft",
        usedDecay: false,
        sourceMode: "file",
        structuralFingerprint: {
          activeBackboneModeCount: 1,
          activeDetailModeCount: 0,
          activeModeCount: 1,
          dominantFrequency: 220,
          dominantAmplitude: 0.4,
          analysisEngine: "spectral",
          pitchSource: "fft",
          usedDecay: false,
          sourceMode: "file",
          backboneSignature: 1.2,
          detailSignature: 0,
          referenceBackboneSignature: 1.2,
          referenceDetailSignature: 0,
          backboneColorSignature: 0.8,
          detailColorSignature: 0,
        },
      },
    };
    const nextAnalysisResult = {
      ...previousSnapshot.analysisResult,
      structuralFingerprint: {
        ...previousSnapshot.analysisResult.structuralFingerprint,
        dominantFrequency: 330,
        backboneSignature: 2.4,
      },
    };

    const dirtyState = deriveDirtyState(previousSnapshot, nextAnalysisResult, {
      fastSignal: false,
      structural: true,
      chroma: false,
      tempo: false,
    });

    expect(dirtyState.structural).toBe(true);
  });
});

describe("audio feature engine snapshots", () => {
  it("carries requested geometry through prepared inputs while resolving the effective backend once", () => {
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: new Float32Array([0, 0.95, 0.6, 0.2]),
      }),
      featureState: createAudioFeatureState(),
      radius: 3,
      cavityGeometry: "spherical",
      status: createStatus(),
      frameTimeMs: 2000,
    });

    expect(preparedInputs.requestedCavityGeometry).toBe("spherical");
    expect(preparedInputs.effectiveCavityGeometry).toBe("rectangular");
    expect(preparedInputs.analysisInputsSignature).toContain(
      '"requestedCavityGeometry":"spherical"',
    );
    expect(preparedInputs.analysisInputsSignature).toContain(
      '"effectiveCavityGeometry":"rectangular"',
    );
  });

  it("reuses the previous projected structural arrays on non-publish updates", () => {
    const featureState = createAudioFeatureState();
    const firstPreparedInputs = createPreparedInputs(2000, { featureState });
    const firstAnalysisResult =
      runHeavyAudioFeatureAnalysis(firstPreparedInputs);
    const nextPreparedInputs = createPreparedInputs(2040, {
      featureState,
      analysisSnapshot: {
        fftMagnitudes: new Float32Array([0, 0.25, 0.95, 0.4]),
        spectralFlux: 0.2,
      },
    });
    const nextFastSignalState =
      updateAudioFeatureFastSignalState(nextPreparedInputs);
    const nextStructuralState = updateAudioFeatureStructuralState(
      nextPreparedInputs,
      nextFastSignalState,
    );
    const leanAnalysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs: nextPreparedInputs,
      previousAnalysisResult: firstAnalysisResult,
      fastSignalState: nextFastSignalState,
      structuralState: nextStructuralState,
      materializeStructuralProjection: false,
    });

    expect(leanAnalysisResult.backboneSlots).toBe(
      firstAnalysisResult.backboneSlots,
    );
    expect(leanAnalysisResult.detailSlots).toBe(
      firstAnalysisResult.detailSlots,
    );
    expect(leanAnalysisResult.modeSlots).toBe(firstAnalysisResult.modeSlots);
    expect(leanAnalysisResult.referenceModeSlots).toBe(
      firstAnalysisResult.referenceModeSlots,
    );
    expect(leanAnalysisResult.backboneColorSlots).toBe(
      firstAnalysisResult.backboneColorSlots,
    );
    expect(leanAnalysisResult.detailColorSlots).toBe(
      firstAnalysisResult.detailColorSlots,
    );
    expect(leanAnalysisResult.structuralState.backboneSlotsSource).toBe(
      nextPreparedInputs.backboneState.slots,
    );
  });

  it("builds a lean structural snapshot without heavy debug payloads", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: new Float32Array([0, 0.95, 0.6, 0.2]),
      }),
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 2000,
    });
    const analysisResult = runHeavyAudioFeatureAnalysis(preparedInputs);
    const snapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult,
      publishCount: 3,
    });

    expect(snapshot.publishCount).toBe(3);
    expect(snapshot.analysisResult.modeSlots).toBeInstanceOf(Float32Array);
    expect(snapshot.analysisResult.backboneSlots).toBeInstanceOf(Float32Array);
    expect(snapshot.analysisResult.bandEnergies).toBeInstanceOf(Float32Array);
    expect(snapshot.analysisResult.fftMagnitudes).toBeUndefined();
    expect(snapshot.analysisResult.spectralCandidates).toBeUndefined();
    expect(snapshot.analysisResult.bandState).toBeUndefined();
    expect(snapshot.analysisResult.backboneStateSummary).toMatchObject({
      uniqueModeCount: expect.any(Number),
    });
    expect(snapshot.analysisResult.detailStateSummary).toMatchObject({
      uniqueModeCount: expect.any(Number),
    });
    expect(snapshot.analysisResult.nonZeroFFTBinCount).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      snapshot.analysisResult.referencePitchBinAmplitude,
    ).toBeGreaterThanOrEqual(0);
  });

  it("publishes an active structural snapshot for loopback live input", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "live",
        avgAmplitude: 36,
        rms: 0.27,
        fftMagnitudes: new Float32Array([0, 0.82, 0.41, 0.22, 0.17]),
      }),
      featureState,
      radius: 3,
      status: createLoopbackLiveStatus(),
      frameTimeMs: 2000,
      liveInputAnalysisSettings: { profile: "voice-tone" },
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = updateAudioFeatureStructuralState(
      preparedInputs,
      fastSignalState,
    );
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const snapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult,
      publishCount: 1,
    });
    const frame = composeAudioFeatureFrame({
      preparedInputs,
      analysisResult: snapshot.analysisResult,
    });

    expect(snapshot.analysisResult.sourceMode).toBe("line-feed");
    expect(snapshot.analysisResult.activeModeCount).toBeGreaterThan(0);
    expect(snapshot.analysisResult.dominantFrequency).toBeGreaterThan(0);
    expect(frame.fieldState).not.toBe("idle");
    expect(frame.sourceMode).toBe("line-feed");
    expect(frame.structureSignal).toBeGreaterThan(0);
  });

  it("includes modal-excitation comparison diagnostics when dual structural mode is enabled", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 48,
        rms: 0.28,
        fftMagnitudes: new Float32Array([0, 0.9, 0.55, 0.2, 0.08]),
        timeData: new Float32Array(FFT_SIZE).map(
          (_, index) =>
            Math.sin((2 * Math.PI * 110 * index) / SAMPLE_RATE) * 0.4,
        ),
      }),
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 2000,
      structuralImplementation: "dual",
    });
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = updateAudioFeatureStructuralState(
      preparedInputs,
      fastSignalState,
    );
    const analysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs,
      fastSignalState,
      structuralState,
      materializeStructuralProjection: true,
    });
    const snapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult,
      publishCount: 2,
    });

    expect(structuralState.comparisonState?.analysisEngine).toBe(
      "modal-excitation",
    );
    expect(snapshot.analysisResult.structuralMetrics).toMatchObject({
      excitedModeCount: expect.any(Number),
      modalPersistence: expect.any(Number),
    });
    expect(snapshot.analysisResult.structuralComparison).toMatchObject({
      activeModeCountDelta: expect.any(Number),
      dominantFrequencyRatio: expect.any(Number),
    });
    expect(snapshot.analysisResult.comparisonDebug).toMatchObject({
      analysisEngine: "modal-excitation",
      pitchSource: "resonator-bank",
      structureSignal: expect.any(Number),
      changeSignal: expect.any(Number),
      modeCoherence: expect.any(Number),
    });
  });

  it("uses time-domain modal drive for both file and system-classified input", () => {
    const fileFeatureState = createAudioFeatureState();
    const systemFeatureState = createAudioFeatureState();
    const timeData = new Float32Array(FFT_SIZE).map(
      (_, index) => Math.sin((2 * Math.PI * 110 * index) / SAMPLE_RATE) * 0.4,
    );
    const analysisSnapshot = createSnapshot({
      sourceMode: "file",
      avgAmplitude: 48,
      rms: 0.28,
      fftMagnitudes: new Float32Array([0, 0.9, 0.55, 0.2, 0.08]),
      timeData,
    });
    const filePreparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot,
      featureState: fileFeatureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: 2000,
      structuralImplementation: "modal-excitation",
    });
    const systemPreparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: {
        ...analysisSnapshot,
        sourceMode: "system",
      },
      featureState: systemFeatureState,
      radius: 3,
      status: createSystemStatus(),
      frameTimeMs: 2000,
      structuralImplementation: "modal-excitation",
    });

    const fileFastSignal =
      updateAudioFeatureFastSignalState(filePreparedInputs);
    const fileStructural = updateAudioFeatureStructuralState(
      filePreparedInputs,
      fileFastSignal,
    );
    const fileAnalysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs: filePreparedInputs,
      fastSignalState: fileFastSignal,
      structuralState: fileStructural,
      materializeStructuralProjection: true,
    });
    const systemFastSignal =
      updateAudioFeatureFastSignalState(systemPreparedInputs);
    const systemStructural = updateAudioFeatureStructuralState(
      systemPreparedInputs,
      systemFastSignal,
    );
    const systemAnalysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs: systemPreparedInputs,
      fastSignalState: systemFastSignal,
      structuralState: systemStructural,
      materializeStructuralProjection: true,
    });

    expect(fileAnalysisResult.structuralMetrics?.driveSource).toBe(
      "time-domain",
    );
    expect(systemAnalysisResult.structuralMetrics?.driveSource).toBe(
      "time-domain",
    );
    expect(fileAnalysisResult.activeModeCount).toBeGreaterThan(0);
    expect(systemAnalysisResult.activeModeCount).toBeGreaterThan(0);
  });
});
