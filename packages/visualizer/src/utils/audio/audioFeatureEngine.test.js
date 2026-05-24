import { describe, expect, it } from "vitest";
import { AUDIO_SLOT_CAPACITY, CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
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
import * as audioFeatureEngine from "./audioFeatureEngine.js";
import { buildAudioFeatureTransportFrame } from "./audioFeatureEngine.js";
import * as audioFeatureWorker from "./audioFeatureEngine.worker.js";
import {
  buildLaneRunDecisions,
  buildEngineStatus,
  createEngineState,
  deriveDirtyState,
  shouldPublishDirtySnapshot,
  recordWorkerPerfSample,
} from "./audioFeatureEngine.worker.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;

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

function createFakeWorker() {
  const listeners = new Map();
  const worker = {
    messages: [],
    addEventListener(type, listener) {
      const typedListeners = listeners.get(type) ?? [];
      typedListeners.push(listener);
      listeners.set(type, typedListeners);
    },
    postMessage(message) {
      worker.messages.push(message);
    },
    terminate() {},
    emit(type, data) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ data });
      }
    },
  };
  return worker;
}

it("carries acoustic cavity scale and boundary mode in worker transport frames", () => {
  const frame = buildAudioFeatureTransportFrame({
    analysisSnapshot: createSnapshot(),
    status: createStatus(),
    frameTimeMs: 16,
    radius: 3,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode: "neumann",
  });

  expect(frame.radius).toBe(3);
  expect(frame.cavityAcousticScale).toEqual(CAVITY_ACOUSTIC_DEFAULTS);
  expect(frame.boundaryMode).toBe("neumann");
});

describe("audio feature engine transport", () => {
  it("always includes time data for file transport because modal excitation owns structural analysis", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot({
        fftMagnitudes: new Float32Array([0, 1, 0.5]),
        timeData: new Float32Array([0, 0.1, -0.1]),
      }),
      status: createStatus({
        playbackSessionId: "file-session",
      }),
      frameTimeMs: 1000,
      radius: 3,
    });

    expect(frame.sessionKey).toBe("file:file-session");
    expect(frame.audioInputMode).toBe("file");
    expect(frame.status).toBeUndefined();
    expect(frame.analysisSnapshot).toBeUndefined();
    expect(frame.fftMagnitudes).toBeInstanceOf(Float32Array);
    expect(frame.timeData).toBeInstanceOf(Float32Array);
    expect(frame).not.toHaveProperty("analysisHints");
  });

  it("does not expose structural implementation on transport frames", () => {
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

    expect(frame).not.toHaveProperty("structuralImplementation");
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

  it("includes time data for acoustic live input transport", () => {
    const frame = buildAudioFeatureTransportFrame({
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

  it("includes time data for system transport", () => {
    const frame = buildAudioFeatureTransportFrame({
      analysisSnapshot: createSnapshot({
        sourceMode: "system",
        timeData: new Float32Array([0, 0.2, -0.2]),
      }),
      status: createSystemStatus(),
      frameTimeMs: 1500,
      radius: 3,
    });

    expect(frame.audioInputMode).toBe("system");
    expect(frame.timeData).toBeInstanceOf(Float32Array);
  });
});

describe("audio feature engine worker lanes", () => {
  it("reports averaged worker lane timings instead of the last sample", () => {
    const engineState = createEngineState();
    recordWorkerPerfSample(engineState, "structuralMs", 10);
    recordWorkerPerfSample(engineState, "structuralMs", 20);
    recordWorkerPerfSample(engineState, "projectionMs", 0.5);

    const status = buildEngineStatus(engineState);

    expect(status.workerStructuralMs).toBe(15);
    expect(status.workerProjectionMs).toBe(0.5);
  });

  it("resets wrapper and worker metrics without clearing the latest snapshot", () => {
    const worker = createFakeWorker();
    const engine = audioFeatureEngine.createAudioFeatureEngine(
      { runtime: "worker" },
      { createWorker: () => worker },
    );
    worker.emit("message", {
      type: "status",
      status: {
        state: "ready",
        reason: "published",
        publishCount: 5,
        droppedFrameCount: 2,
        workerStructuralMs: 7,
      },
    });
    const latestSnapshot = {
      frameTimeMs: 2000,
      publishCount: 5,
      analysisSessionKey: "file:test",
      analysisInputsSignature: "baseline",
      analysisResult: {},
    };
    worker.emit("message", {
      type: "snapshot",
      snapshot: latestSnapshot,
    });
    engine.resetMetrics("probe-reset");

    expect(worker.messages.at(-1)).toEqual({
      type: "reset-metrics",
      reason: "probe-reset",
    });
    expect(engine.getStatus()).toMatchObject({
      state: "ready",
      reason: "probe-reset",
      publishCount: 0,
      droppedFrameCount: 0,
      workerStructuralMs: 0,
    });
    expect(engine.readLatestSnapshot()).toBe(latestSnapshot);
    engine.dispose();
  });

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

  it("allows fast-only patch emission before the full publish cadence after the first structural snapshot", () => {
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
      bandEnergies: new Float32Array([0.1, 0.8, 0.3, 0.2]),
      transientEnergy: (analysisResult.transientEnergy ?? 0) + 0.2,
      beatPulseId: (analysisResult.beatPulseId ?? 0) + 1,
    };
    const dirtyState = {
      fastSignal: true,
      structural: false,
      chroma: false,
      tempo: false,
    };
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

    expect(
      shouldPublishDirtySnapshot(engineState, dirtyState, false, 2010),
    ).toBe(false);
    expect(typeof audioFeatureWorker.shouldEmitFastSignalPatch).toBe(
      "function",
    );
    expect(
      audioFeatureWorker.shouldEmitFastSignalPatch({
        engineState,
        dirtyState,
        forced: false,
      }),
    ).toBe(true);

    const patch = audioFeatureWorker.buildFastSignalPatch({
      preparedInputs: {
        currentFrameAtMs: 2010,
        analysisSessionKey: previousSnapshot.analysisSessionKey,
        analysisInputsSignature: previousSnapshot.analysisInputsSignature,
      },
      analysisResult: nextAnalysisResult,
      patchCount: 1,
    });

    expect(patch).toMatchObject({
      frameTimeMs: 2010,
      analysisSessionKey: previousSnapshot.analysisSessionKey,
      analysisInputsSignature: previousSnapshot.analysisInputsSignature,
      fastSignalPatchCount: 1,
    });
    expect(patch.analysisResult.bandEnergies).toBeInstanceOf(Float32Array);
    expect(patch.analysisResult.beatPulseId).toBe(
      nextAnalysisResult.beatPulseId,
    );
    expect(patch.analysisResult).not.toHaveProperty("modeSlots");
    expect(patch.analysisResult).not.toHaveProperty("structuralMetrics");
  });

  it("does not emit fast-only patches before the first full structural snapshot or during forced refreshes", () => {
    const engineState = createEngineState();
    const dirtyState = {
      fastSignal: true,
      structural: false,
      chroma: false,
      tempo: false,
    };

    expect(typeof audioFeatureWorker.shouldEmitFastSignalPatch).toBe(
      "function",
    );
    expect(
      audioFeatureWorker.shouldEmitFastSignalPatch({
        engineState,
        dirtyState,
        forced: false,
      }),
    ).toBe(false);

    engineState.latestSnapshot = { analysisResult: {} };
    expect(
      audioFeatureWorker.shouldEmitFastSignalPatch({
        engineState,
        dirtyState,
        forced: true,
      }),
    ).toBe(false);
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
      nextStructuralState.backboneSlotsSource,
    );
  });

  it("skips signal projections only for lean dirty-check analysis results", () => {
    const featureState = createAudioFeatureState();
    const firstPreparedInputs = createPreparedInputs(2000, { featureState });
    const firstAnalysisResult =
      runHeavyAudioFeatureAnalysis(firstPreparedInputs);
    const previousSignalModeSlots = firstAnalysisResult.signalModeSlots.slice();
    const previousSignalReferenceModeSlots =
      firstAnalysisResult.signalReferenceModeSlots.slice();
    const previousAnalysisResult = {
      ...firstAnalysisResult,
      signalModeSlots: previousSignalModeSlots,
      signalReferenceModeSlots: previousSignalReferenceModeSlots,
    };
    const nextPreparedInputs = createPreparedInputs(2040, {
      featureState,
      analysisSnapshot: {
        fftMagnitudes: new Float32Array([0, 0.25, 0.95, 0.4]),
        spectralFlux: 0.2,
      },
    });
    nextPreparedInputs.signalModeSlots.fill(123);
    nextPreparedInputs.signalReferenceModeSlots.fill(456);
    const nextFastSignalState =
      updateAudioFeatureFastSignalState(nextPreparedInputs);
    const nextStructuralState = updateAudioFeatureStructuralState(
      nextPreparedInputs,
      nextFastSignalState,
    );
    const leanAnalysisResult = buildCurrentAudioFeatureAnalysisResult({
      preparedInputs: nextPreparedInputs,
      previousAnalysisResult,
      fastSignalState: nextFastSignalState,
      structuralState: nextStructuralState,
      materializeStructuralProjection: false,
      materializeSignalProjection: false,
    });

    expect(leanAnalysisResult.signalModeSlots).toBe(previousSignalModeSlots);
    expect(leanAnalysisResult.signalReferenceModeSlots).toBe(
      previousSignalReferenceModeSlots,
    );
    expect(nextPreparedInputs.signalModeSlots[0]).toBe(123);
    expect(nextPreparedInputs.signalReferenceModeSlots[0]).toBe(456);
    expect(leanAnalysisResult.structuralFingerprint).toEqual(
      nextStructuralState.structuralFingerprint,
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

  it("merges fast-signal patches without replacing structural arrays", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = createPreparedInputs(2000, { featureState });
    const analysisResult = runHeavyAudioFeatureAnalysis(preparedInputs);
    const previousSnapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult,
      publishCount: 1,
    });
    const patch = {
      frameTimeMs: 2010,
      analysisSessionKey: previousSnapshot.analysisSessionKey,
      analysisInputsSignature: previousSnapshot.analysisInputsSignature,
      fastSignalPatchCount: 1,
      analysisResult: {
        avgAmplitude: 48,
        analyserRms: 0.42,
        bandEnergies: new Float32Array([0.2, 0.7, 0.4, 0.1]),
        transientEnergy: 0.91,
        beatPulseId: (analysisResult.beatPulseId ?? 0) + 1,
      },
    };

    expect(typeof audioFeatureEngine.mergeFastSignalPatchIntoSnapshot).toBe(
      "function",
    );
    const merged = audioFeatureEngine.mergeFastSignalPatchIntoSnapshot(
      previousSnapshot,
      patch,
    );

    expect(merged).not.toBe(previousSnapshot);
    expect(merged.frameTimeMs).toBe(2010);
    expect(merged.fastSignalPatchCount).toBe(1);
    expect(merged.analysisResult.avgAmplitude).toBe(48);
    expect(merged.analysisResult.transientEnergy).toBe(0.91);
    expect(merged.analysisResult.bandEnergies).toEqual(
      patch.analysisResult.bandEnergies,
    );
    expect(merged.analysisResult.bandEnergies).not.toBe(
      patch.analysisResult.bandEnergies,
    );
    expect(merged.analysisResult.modeSlots).toBe(
      previousSnapshot.analysisResult.modeSlots,
    );
    expect(merged.analysisResult.backboneSlots).toBe(
      previousSnapshot.analysisResult.backboneSlots,
    );
    expect(merged.analysisResult.detailSlots).toBe(
      previousSnapshot.analysisResult.detailSlots,
    );
  });

  it("ignores stale fast-signal patches from a different analysis signature", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = createPreparedInputs(2000, { featureState });
    const analysisResult = runHeavyAudioFeatureAnalysis(preparedInputs);
    const previousSnapshot = buildAudioFeatureAnalysisSnapshot({
      preparedInputs,
      analysisResult,
      publishCount: 1,
    });

    const merged = audioFeatureEngine.mergeFastSignalPatchIntoSnapshot(
      previousSnapshot,
      {
        frameTimeMs: 2010,
        analysisSessionKey: previousSnapshot.analysisSessionKey,
        analysisInputsSignature: '"stale"',
        fastSignalPatchCount: 1,
        analysisResult: {
          transientEnergy: 1,
        },
      },
    );

    expect(merged).toBe(previousSnapshot);
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
      liveInputAnalysisSettings: { acousticIntent: "vocal" },
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

  it("keeps worker snapshots free of analysis hint payloads", () => {
    const featureState = createAudioFeatureState();
    const preparedInputs = prepareAudioFeatureFrameInputs({
      analysisSnapshot: createSnapshot({
        sourceMode: "file",
        avgAmplitude: 48,
        rms: 0.28,
        fftMagnitudes: new Float32Array([0, 0.9, 0.55, 0.2, 0.08]),
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
      publishCount: 2,
    });

    expect(snapshot.analysisResult).not.toHaveProperty("analysisHints");
    expect(snapshot.analysisResult).not.toHaveProperty("baseAnalysisHints");
    expect(snapshot.analysisResult).not.toHaveProperty("lastAnalysisHints");
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
