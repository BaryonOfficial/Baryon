import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_FEATURE_AUTHORITY_ROLES,
  createAudioFeatureRuntime,
  DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS,
} from "./audioFeatureEngine.js";
import { AUDIO_FEATURE_PROTOCOL_VERSION } from "./audioFeaturePackets.js";
import {
  createFeatureWorkerState,
  processFeatureWorkerFrame,
} from "./audioFeatureEngine.worker.js";
import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((entry) => entry !== listener),
    );
  }

  postMessage(message, transferables = []) {
    this.messages.push({ message, transferables });
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

function createStatus(overrides = {}) {
  return {
    audioInputMode: "file",
    analysisSource: "file",
    pitchSourceMode: "spectral",
    fftSize: 8192,
    fastFftSize: 2048,
    capacity: AUDIO_SLOT_CAPACITY,
    sampleRate: 44100,
    isAudioLoaded: true,
    isPlaying: true,
    isPlaybackPaused: false,
    isLiveInputActive: false,
    hasAnalysisSource: true,
    playbackSourceSessionId: 1,
    playbackSessionId: 1,
    lastPlaybackEndReason: null,
    ...overrides,
  };
}

function createAnalysisSnapshot(fftSize, frequencyHz = 220) {
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < timeData.length; index += 1) {
    timeData[index] =
      Math.sin((2 * Math.PI * frequencyHz * index) / 44100) * 0.35;
  }
  const fftLinearAmplitudes = new Float32Array(fftSize / 2);
  const bin = Math.max(1, Math.round((frequencyHz * fftSize) / 44100));
  fftLinearAmplitudes[bin] = 0.8;
  return {
    sourceMode: "file",
    avgAmplitude: 32,
    rms: 0.24,
    spectralCentroid: 0.2,
    spectralFlux: 0.1,
    fftLinearAmplitudes,
    timeData,
  };
}

function createSilentAnalysisSnapshot(fftSize) {
  return {
    sourceMode: "file",
    // Keep transport/source evidence active while the exact 2048-sample
    // window itself carries no modal forcing.
    avgAmplitude: 32,
    rms: 0.24,
    spectralCentroid: 0,
    spectralFlux: 0,
    fftLinearAmplitudes: new Float32Array(fftSize / 2),
    timeData: new Float32Array(fftSize),
  };
}

function createRuntimeHarness(statusOverrides = {}, dependencyOverrides = {}) {
  let currentTimeMs = 0;
  let status = createStatus(statusOverrides);
  const captures = [];
  const scheduled = [];
  const workers = [];
  const audioSession = {
    getStatus: vi.fn(() => status),
    readFeatureAnalysisCapture: vi.fn(({ includeStructural }) => {
      captures.push(includeStructural);
      if (dependencyOverrides.readFeatureAnalysisCapture) {
        return dependencyOverrides.readFeatureAnalysisCapture({
          includeStructural,
          currentTimeMs,
        });
      }
      return {
        captureTimestampMs: currentTimeMs,
        fast: createAnalysisSnapshot(2048),
        structural: includeStructural ? createAnalysisSnapshot(8192) : null,
      };
    }),
  };
  const runtime = createAudioFeatureRuntime(
    {
      fastCadenceMs: 8,
      structuralCadenceMs: 16,
      staleDriveTimeoutMs: 96,
      workerRestartTimeoutMs: 288,
    },
    {
      audioSession,
      now: () => currentTimeMs,
      schedule(callback) {
        const handle = { callback, cancelled: false };
        scheduled.push(handle);
        return handle;
      },
      cancel(handle) {
        handle.cancelled = true;
      },
      createWorker() {
        const worker = dependencyOverrides.createWorker
          ? dependencyOverrides.createWorker()
          : new FakeWorker();
        workers.push(worker);
        return worker;
      },
    },
  );

  return {
    runtime,
    audioSession,
    captures,
    workers,
    setStatus(next) {
      status = { ...status, ...next };
    },
    setTime(next) {
      currentTimeMs = next;
    },
    runNextCapture() {
      const next = scheduled.find((entry) => !entry.cancelled);
      if (!next) {
        return false;
      }
      next.cancelled = true;
      next.callback();
      return true;
    },
  };
}

function findMessages(worker, type) {
  return worker.messages
    .map((entry) => entry.message)
    .filter((message) => message.type === type);
}

function createTopologyPacket(runtimeStatus, overrides = {}) {
  return {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: runtimeStatus.sourceGeneration,
    workerGeneration: runtimeStatus.workerGeneration,
    topologyRevision: 1,
    activeModeCount: 1,
    committedModeCount: 1,
    modalIdentitySlots: new Float32Array([1, 2, 3]),
    committedModeIdentitySlots: new Float32Array([1, 2, 3]),
    committedModeFrequenciesHz: new Float32Array([220]),
    modalRoleMetadata: new Uint8Array([1]),
    committedModeRoleMetadata: new Uint8Array([1]),
    fastProbeModeIndices: new Uint16Array([0]),
    modalFieldColorSlots: new Float32Array(4),
    modalFieldSpectralLaneA: new Float32Array(4),
    modalFieldSpectralLaneB: new Float32Array(4),
    modalFieldSpectralMeta: new Float32Array(4),
    modalFieldMetadataSlots: new Float32Array(4),
    ...overrides,
  };
}

function createDrivePacket(runtimeStatus, overrides = {}) {
  return {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: runtimeStatus.sourceGeneration,
    workerGeneration: runtimeStatus.workerGeneration,
    topologyRevision: 1,
    frameId: 1,
    captureTimestampMs: 0,
    processingTimestampMs: 1,
    activeModeCount: 1,
    committedModeCount: 1,
    modalCoefficients: new Float32Array([0.5]),
    phaseSlots: new Float32Array(4),
    bandEnergies: new Float32Array(4),
    spectralBandEnergies: new Float32Array(4),
    renderState: {},
    ...overrides,
  };
}

function publishModel(harness, overrides = {}) {
  const runtimeStatus = harness.runtime.getStatus();
  const worker = harness.workers.at(-1);
  const topology = createTopologyPacket(runtimeStatus, overrides.topology);
  const drive = createDrivePacket(runtimeStatus, overrides.drive);
  worker.emit("message", { type: "topology-packet", packet: topology });
  worker.emit("message", { type: "drive-packet", packet: drive });
  return { topology, drive };
}

describe("audio feature runtime", () => {
  it("publishes structural analysis at a realtime 30 Hz cadence", () => {
    expect(DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.fastCadenceMs).toBe(16);
    expect(DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.structuralCadenceMs).toBe(33);
  });

  it("starts one worker and captures synchronized structural bootstrap data", () => {
    const harness = createRuntimeHarness();
    expect(harness.runtime.start()).toBe(true);

    expect(harness.workers).toHaveLength(1);
    expect(findMessages(harness.workers[0], "init")).toHaveLength(1);
    const inputs = findMessages(harness.workers[0], "analysis-input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0].frame.fastPayload.timeData).toHaveLength(2048);
    expect(inputs[0].frame.structuralPayload.timeData).toHaveLength(8192);
    expect(inputs[0].frame).not.toHaveProperty("configuration");
    expect(harness.captures).toEqual([true]);
    expect(harness.runtime.start()).toBe(false);
  });

  it("requests a worker-owned test-tone topology when no audio capture exists", () => {
    const harness = createRuntimeHarness(
      {
        audioInputMode: "idle",
        analysisSource: "idle",
        isAudioLoaded: false,
        isPlaying: false,
        hasAnalysisSource: false,
        playbackSessionId: null,
      },
      { readFeatureAnalysisCapture: () => null },
    );
    harness.runtime.configure({
      radius: 1,
      includeSpectralLight: true,
      auditSettings: {
        injectTestTone: true,
        testToneHz: 528,
        testToneAmplitude: 0.8,
      },
    });
    harness.runtime.start();

    const worker = harness.workers[0];
    const input = findMessages(worker, "analysis-input")[0].frame;
    expect(input).toMatchObject({
      fastPayload: null,
      structuralPayload: null,
      structuralRequested: true,
    });

    const state = createFeatureWorkerState();
    state.sourceGeneration = input.sourceGeneration;
    state.workerGeneration = input.workerGeneration;
    state.configuration = findMessages(worker, "init")[0].configuration;
    const result = processFeatureWorkerFrame(state, input);

    expect(result.topologyPacket.activeModeCount).toBeGreaterThan(0);
    expect(result.drivePacket.renderState).toMatchObject({
      fieldState: "test",
      renderAuthority: true,
    });
    expect(state.latestAnalysisResult.preparedInputs.fftSize).toBe(2048);
  });

  it("keeps one input in flight and one newest coalesced pending input", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    harness.setTime(8);
    harness.runNextCapture();
    harness.setTime(16);
    harness.runNextCapture();

    const worker = harness.workers[0];
    expect(findMessages(worker, "analysis-input")).toHaveLength(1);
    expect(harness.runtime.getStatus()).toMatchObject({
      queueDepth: 2,
      inputReplacementCount: 1,
    });

    const firstFrame = findMessages(worker, "analysis-input")[0].frame;
    worker.emit("message", {
      type: "analysis-input-ack",
      sourceGeneration: firstFrame.sourceGeneration,
      workerGeneration: firstFrame.workerGeneration,
      frameId: firstFrame.frameId,
    });

    const sent = findMessages(worker, "analysis-input");
    expect(sent).toHaveLength(2);
    expect(sent[1].frame.captureTimestampMs).toBe(16);
    expect(sent[1].frame.structuralPayload).not.toBeNull();
  });

  it("publishes only a matching immutable topology and drive model", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const { topology, drive } = publishModel(harness);
    const model = harness.runtime.readLatestFeatureModel();

    expect(model.topology).toBe(topology);
    expect(model.drive).toBe(drive);
    expect(model.topology.modalIdentitySlots).toBe(topology.modalIdentitySlots);
    expect(model.drive.modalCoefficients).toBe(drive.modalCoefficients);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it("treats authority role as the only local start and suspend command", () => {
    const harness = createRuntimeHarness();
    harness.runtime.setAuthorityRole(
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    );
    harness.runtime.start();

    expect(harness.workers).toHaveLength(0);
    expect(
      harness.audioSession.readFeatureAnalysisCapture,
    ).not.toHaveBeenCalled();
    expect(harness.runtime.readLatestFeatureModel()).toBeNull();

    harness.runtime.setAuthorityRole(
      AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    );
    expect(harness.workers).toHaveLength(1);
    expect(
      harness.audioSession.readFeatureAnalysisCapture,
    ).toHaveBeenCalledTimes(1);
  });

  it("forces structural capture for config changes without changing authority", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const worker = harness.workers[0];
    const firstFrame = findMessages(worker, "analysis-input")[0].frame;
    worker.emit("message", {
      type: "analysis-input-ack",
      sourceGeneration: firstFrame.sourceGeneration,
      workerGeneration: firstFrame.workerGeneration,
      frameId: firstFrame.frameId,
    });

    expect(harness.runtime.configure({ radius: 2 })).toBe(true);
    expect(harness.runtime.configure({ radius: 2 })).toBe(false);
    harness.setTime(8);
    harness.runNextCapture();

    expect(harness.captures.at(-1)).toBe(true);
    expect(findMessages(worker, "configure")).toHaveLength(1);
    expect(harness.runtime.getStatus().authorityRole).toBe(
      AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    );
  });

  it("increments the source generation exactly once for one session change", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const initialGeneration = harness.runtime.getStatus().sourceGeneration;
    harness.setStatus({ playbackSourceSessionId: 2, playbackSessionId: 2 });
    harness.setTime(8);
    harness.runNextCapture();

    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: initialGeneration + 1,
      sourceBootstrapCount: 1,
    });
    harness.setTime(16);
    harness.runNextCapture();
    expect(harness.runtime.getStatus().sourceGeneration).toBe(
      initialGeneration + 1,
    );
  });

  it("does not rebootstrap when playback restarts within one loaded source", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const initialStatus = harness.runtime.getStatus();

    harness.setStatus({ playbackSessionId: 2 });
    harness.setTime(8);
    harness.runNextCapture();

    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: initialStatus.sourceGeneration,
      sourceBootstrapCount: initialStatus.sourceBootstrapCount,
    });
  });

  it("keeps structural bootstrap pending until file playback analysis activates", () => {
    let analysisReady = false;
    const harness = createRuntimeHarness(
      {
        analysisSource: "idle",
        isPlaying: false,
        hasAnalysisSource: false,
        hasPlaybackAnalysisSource: false,
        playbackSessionId: null,
      },
      {
        readFeatureAnalysisCapture: ({ includeStructural, currentTimeMs }) =>
          analysisReady
            ? {
                captureTimestampMs: currentTimeMs,
                fast: createAnalysisSnapshot(2048),
                structural: includeStructural
                  ? createAnalysisSnapshot(8192)
                  : null,
              }
            : null,
      },
    );

    harness.runtime.start();
    const worker = harness.workers[0];
    const acknowledgeLatestInput = () => {
      const frame = findMessages(worker, "analysis-input").at(-1).frame;
      worker.emit("message", {
        type: "analysis-input-ack",
        sourceGeneration: frame.sourceGeneration,
        workerGeneration: frame.workerGeneration,
        frameId: frame.frameId,
      });
    };

    expect(harness.captures).toEqual([true]);
    acknowledgeLatestInput();

    harness.setTime(8);
    harness.runNextCapture();
    expect(harness.captures.at(-1)).toBe(false);
    acknowledgeLatestInput();

    analysisReady = true;
    harness.setStatus({
      analysisSource: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      hasPlaybackAnalysisSource: true,
      playbackSessionId: 1,
    });
    harness.setTime(9);
    harness.runNextCapture();

    const activeInput = findMessages(worker, "analysis-input").at(-1).frame;
    expect(activeInput.structuralPayload).not.toBeNull();
    expect(harness.runtime.getStatus().playbackAnalysisPending).toBe(true);

    publishModel(harness, {
      drive: {
        captureTimestampMs: activeInput.captureTimestampMs - 1,
      },
    });
    expect(harness.runtime.getStatus().playbackAnalysisPending).toBe(true);

    worker.emit("message", {
      type: "drive-packet",
      packet: createDrivePacket(harness.runtime.getStatus(), {
        frameId: 2,
        captureTimestampMs: activeInput.captureTimestampMs,
      }),
    });

    expect(harness.runtime.getStatus().playbackAnalysisPending).toBe(false);
  });

  it("restarts a stalled worker at most once per source generation", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    harness.setTime(288);
    harness.runNextCapture();
    expect(harness.workers).toHaveLength(2);
    expect(harness.runtime.getStatus()).toMatchObject({
      workerRestartCount: 1,
      configurationReplayCount: 1,
    });

    harness.setTime(600);
    harness.runNextCapture();
    expect(harness.workers).toHaveLength(2);
  });

  it("fails closed after 96 ms only for an advancing active local source", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    harness.setTime(97);

    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
    expect(harness.runtime.getStatus().renderAuthorityRevoked).toBe(true);
  });

  it("exempts explicit paused-file hold from stale revocation", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: true,
      audioInputMode: "idle",
    });
    harness.setTime(500);
    harness.runNextCapture();

    expect(harness.runtime.readLatestFeatureModel()).not.toBeNull();
    expect(harness.runtime.getStatus().renderAuthorityRevoked).toBe(false);
  });

  it.each(["premature", "interrupted"])(
    "does not classify a %s playback end as an explicit pause",
    (lastPlaybackEndReason) => {
      const harness = createRuntimeHarness();
      harness.runtime.start();
      harness.setStatus({
        isPlaying: false,
        isPlaybackPaused: false,
        audioInputMode: "idle",
        lastPlaybackEndReason,
      });
      harness.setTime(500);
      harness.runNextCapture();

      expect(harness.runtime.getStatus().sourceGeneration).toBe(1);
      expect(harness.runtime.getStatus().reason).not.toBe("paused-file-hold");
    },
  );

  it("rejects delayed worker status from a stale generation", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const worker = harness.workers[0];
    const staleGeneration = harness.runtime.getStatus();
    harness.setStatus({ playbackSourceSessionId: 2, playbackSessionId: 2 });
    harness.setTime(8);
    harness.runNextCapture();

    worker.emit("message", {
      type: "status",
      status: {
        sourceGeneration: staleGeneration.sourceGeneration,
        workerGeneration: staleGeneration.workerGeneration,
        state: "failed",
        reason: "stale-worker-failure",
      },
    });

    expect(harness.runtime.getStatus()).toMatchObject({
      state: "loading",
      reason: "source-session-changed",
      staleWorkerStatusCount: 1,
    });
  });

  it("does not retry an initial worker creation failure before timeout", () => {
    const createWorker = vi.fn(() => {
      throw new Error("worker unavailable");
    });
    const harness = createRuntimeHarness({}, { createWorker });

    harness.runtime.start();
    for (let index = 1; index <= 35; index += 1) {
      harness.setTime(index * 8);
      harness.runNextCapture();
    }

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(harness.runtime.getStatus()).toMatchObject({
      state: "failed",
      reason: "worker-create-failed",
      workerRestartCount: 0,
    });
  });

  it("automatically recovers once after an initial creation timeout", () => {
    const recoveredWorker = new FakeWorker();
    const createWorker = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("worker unavailable");
      })
      .mockReturnValueOnce(recoveredWorker);
    const harness = createRuntimeHarness({}, { createWorker });
    harness.runtime.start();

    for (let index = 1; index <= 35; index += 1) {
      harness.setTime(index * 8);
      harness.runNextCapture();
    }
    expect(createWorker).toHaveBeenCalledTimes(1);

    harness.setTime(288);
    harness.runNextCapture();

    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(harness.workers).toEqual([recoveredWorker]);
    expect(findMessages(recoveredWorker, "init")).toHaveLength(1);
    expect(findMessages(recoveredWorker, "analysis-input")).toHaveLength(1);
    expect(harness.runtime.getStatus()).toMatchObject({
      state: "loading",
      workerRestartCount: 1,
      configurationReplayCount: 1,
    });
  });

  it("bounds a failed automatic retry after initial creation failure", () => {
    const createWorker = vi.fn(() => {
      throw new Error("worker unavailable");
    });
    const harness = createRuntimeHarness({}, { createWorker });
    harness.runtime.start();

    for (let index = 1; index <= 80; index += 1) {
      harness.setTime(index * 8);
      harness.runNextCapture();
    }

    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(harness.runtime.getStatus()).toMatchObject({
      state: "failed",
      reason: "worker-create-failed",
      workerRestartCount: 0,
    });
  });

  it("allows one fresh worker creation attempt after the source changes", () => {
    const recoveredWorker = new FakeWorker();
    const createWorker = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("worker unavailable");
      })
      .mockReturnValueOnce(recoveredWorker);
    const harness = createRuntimeHarness({}, { createWorker });
    harness.runtime.start();
    harness.setStatus({ playbackSourceSessionId: 2, playbackSessionId: 2 });

    harness.setTime(8);
    harness.runNextCapture();
    harness.setTime(16);
    harness.runNextCapture();

    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(harness.workers).toEqual([recoveredWorker]);
    expect(findMessages(recoveredWorker, "init")).toHaveLength(1);
    expect(findMessages(recoveredWorker, "analysis-input")).toHaveLength(1);
  });

  it("does not retry after the one automatic restart fails to create", () => {
    const initialWorker = new FakeWorker();
    const createWorker = vi
      .fn()
      .mockReturnValueOnce(initialWorker)
      .mockImplementationOnce(() => {
        throw new Error("restart unavailable");
      });
    const harness = createRuntimeHarness({}, { createWorker });
    harness.runtime.start();

    initialWorker.emit("error", new Error("worker failed"));
    for (let index = 1; index <= 12; index += 1) {
      harness.setTime(index * 8);
      harness.runNextCapture();
    }

    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(harness.runtime.getStatus()).toMatchObject({
      state: "failed",
      reason: "worker-create-failed",
      workerRestartCount: 0,
    });
  });

  it("absorbs the current source when external authority returns local", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    harness.runtime.setAuthorityRole(
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    );
    harness.setStatus({ playbackSourceSessionId: 2, playbackSessionId: 2 });
    const beforeLocal = harness.runtime.getStatus();

    harness.runtime.setAuthorityRole(
      AUDIO_FEATURE_AUTHORITY_ROLES.localProducer,
    );
    const afterLocal = harness.runtime.getStatus();
    harness.setTime(8);
    harness.runNextCapture();

    expect(afterLocal.sourceGeneration).toBe(beforeLocal.sourceGeneration + 1);
    expect(afterLocal.sourceBootstrapCount).toBe(
      beforeLocal.sourceBootstrapCount + 1,
    );
    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: afterLocal.sourceGeneration,
      sourceBootstrapCount: afterLocal.sourceBootstrapCount,
    });
  });

  it("does not restart a failed local worker while externally suspended", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const worker = harness.workers[0];
    harness.runtime.setAuthorityRole(
      AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
    );

    worker.emit("error", new Error("worker failed while suspended"));

    expect(worker.terminated).toBe(true);
    expect(harness.workers).toHaveLength(1);
    expect(harness.runtime.getStatus()).toMatchObject({
      state: "suspended",
      reason: "worker-error-suspended",
      workerRestartCount: 0,
    });
  });

  it("applies cached configuration before releasing a pending input", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const worker = harness.workers[0];
    harness.setTime(8);
    harness.runNextCapture();

    harness.runtime.configure({ radius: 2 });
    const firstFrame = findMessages(worker, "analysis-input")[0].frame;
    worker.emit("message", {
      type: "analysis-input-ack",
      sourceGeneration: firstFrame.sourceGeneration,
      workerGeneration: firstFrame.workerGeneration,
      frameId: firstFrame.frameId,
    });

    const messages = worker.messages.map((entry) => entry.message);
    const configureIndex = messages.findIndex(
      (message) => message.type === "configure",
    );
    const pendingInputIndex = messages.findLastIndex(
      (message) => message.type === "analysis-input",
    );
    expect(configureIndex).toBeGreaterThan(-1);
    expect(pendingInputIndex).toBeGreaterThan(configureIndex);
    expect(messages[pendingInputIndex].frame).not.toHaveProperty(
      "configuration",
    );
  });

  it("accepts advancing silent drive packets as valid progress", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    harness.setTime(80);
    const runtimeStatus = harness.runtime.getStatus();
    harness.workers[0].emit("message", {
      type: "drive-packet",
      packet: createDrivePacket(runtimeStatus, {
        frameId: 2,
        captureTimestampMs: 80,
        modalCoefficients: new Float32Array([0]),
      }),
    });
    harness.setTime(150);

    expect(harness.runtime.readLatestFeatureModel()).not.toBeNull();
  });

  it("does not clear stale authority until a future drive has matching topology", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    harness.setTime(97);
    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
    expect(harness.runtime.getStatus().renderAuthorityRevoked).toBe(true);

    const runtimeStatus = harness.runtime.getStatus();
    harness.workers[0].emit("message", {
      type: "drive-packet",
      packet: createDrivePacket(runtimeStatus, {
        topologyRevision: 2,
        frameId: 2,
        captureTimestampMs: 97,
        processingTimestampMs: 98,
      }),
    });
    expect(harness.runtime.getStatus().renderAuthorityRevoked).toBe(true);

    harness.workers[0].emit("message", {
      type: "topology-packet",
      packet: createTopologyPacket(runtimeStatus, { topologyRevision: 2 }),
    });
    expect(harness.runtime.getStatus()).toMatchObject({
      latestAcceptedFrameId: 2,
      latestDriveCaptureTimestampMs: 97,
      latestDriveProcessingTimestampMs: 98,
      renderAuthorityRevoked: false,
    });
    expect(harness.runtime.readLatestFeatureModel()).not.toBeNull();
  });
});

describe("feature worker packets", () => {
  it("composes semantics in the worker and separates topology from drive", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };
    const frame = {
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 10,
      fastPayload: createAnalysisSnapshot(2048),
      structuralPayload: createAnalysisSnapshot(8192),
      status: createStatus({ sessionKey: "file:1" }),
    };

    const { topologyPacket, drivePacket } = processFeatureWorkerFrame(
      state,
      frame,
    );

    expect(topologyPacket).not.toBeNull();
    expect(topologyPacket).not.toHaveProperty("modalCoefficients");
    expect(drivePacket).not.toHaveProperty("modalIdentitySlots");
    expect(drivePacket).not.toHaveProperty("candidateForcingSlots");
    expect(drivePacket.renderState).not.toHaveProperty("fftLinearAmplitudes");
    expect(drivePacket.frameId).toBe(1);
    expect(drivePacket.topologyRevision).toBe(topologyPacket.topologyRevision);
    expect(state.latestAnalysisResult.preparedInputs.radius).toBe(1);
    expect(topologyPacket.committedModeCount).toBe(state.committedModes.length);
    expect(drivePacket.committedModeCount).toBe(state.committedModes.length);
    expect(drivePacket.modalCoefficients).toHaveLength(
      state.committedModes.length,
    );
    expect(
      Array.from(topologyPacket.modalRoleMetadata).every((role) => role > 0),
    ).toBe(true);
    expect(
      Array.from(topologyPacket.fastProbeModeIndices).every(
        (index) => index < topologyPacket.committedModeCount,
      ),
    ).toBe(true);
    expect(
      Array.from(topologyPacket.committedModeIdentitySlots).slice(
        0,
        topologyPacket.modalIdentitySlots.length,
      ),
    ).toEqual(Array.from(topologyPacket.modalIdentitySlots));
  });

  it("does not republish topology for a fast-only coefficient update", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };
    const base = {
      sourceGeneration: 1,
      workerGeneration: 1,
      structuralPayload: createAnalysisSnapshot(8192),
      status: createStatus({ sessionKey: "file:1" }),
    };
    const first = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 1,
      captureTimestampMs: 10,
      fastPayload: createAnalysisSnapshot(2048, 220),
    });
    const cachedTopologySlots = state.latestTopologyFrame.modalFieldSlots;
    const fastOnlyResults = Array.from({ length: 24 }, (_, index) =>
      processFeatureWorkerFrame(state, {
        ...base,
        frameId: index + 2,
        captureTimestampMs: 26 + index * 16,
        fastPayload: createAnalysisSnapshot(2048, 240 + index * 17),
        structuralPayload: null,
      }),
    );

    expect(first.topologyPacket).not.toBeNull();
    expect(fastOnlyResults.every(({ topologyPacket }) => !topologyPacket)).toBe(
      true,
    );
    expect(
      new Set(
        fastOnlyResults.map(({ drivePacket }) => drivePacket.topologyRevision),
      ),
    ).toEqual(new Set([first.topologyPacket.topologyRevision]));
    expect(fastOnlyResults.at(-1).drivePacket.frameId).toBe(25);
    expect(state.topologyPublishCount).toBe(1);
    expect(state.latestTopologyFrame.modalFieldSlots).toBe(cachedTopologySlots);
  });

  it("keeps fast drive ordering after the published topology buffer transfers", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };
    const base = {
      sourceGeneration: 1,
      workerGeneration: 1,
      status: createStatus({ sessionKey: "file:1" }),
    };
    const first = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 1,
      captureTimestampMs: 10,
      fastPayload: createAnalysisSnapshot(2048, 220),
      structuralPayload: createAnalysisSnapshot(8192, 220),
    });
    const activeModeCount = first.topologyPacket.activeModeCount;
    structuredClone(first.topologyPacket.modalIdentitySlots, {
      transfer: [first.topologyPacket.modalIdentitySlots.buffer],
    });
    expect(first.topologyPacket.modalIdentitySlots.byteLength).toBe(0);

    const second = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 2,
      captureTimestampMs: 26,
      fastPayload: createAnalysisSnapshot(2048, 220),
      structuralPayload: null,
    });

    expect(second.topologyPacket).toBeNull();
    expect(second.drivePacket.activeModeCount).toBe(activeModeCount);
    expect(second.drivePacket.committedModeCount).toBe(
      state.committedModes.length,
    );
    expect(second.drivePacket.modalCoefficients).toHaveLength(
      state.committedModes.length,
    );
    expect(
      Array.from(second.drivePacket.modalCoefficients).some(
        (coefficient) => coefficient > 0,
      ),
    ).toBe(true);
  });

  it("does not let structural FFT analysis seed live modal coefficients", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };

    const result = processFeatureWorkerFrame(state, {
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 10,
      fastPayload: createSilentAnalysisSnapshot(2048),
      structuralPayload: createAnalysisSnapshot(8192, 220),
      status: createStatus({ sessionKey: "file:1" }),
    });

    expect(result.topologyPacket.activeModeCount).toBeGreaterThan(0);
    expect(
      Array.from(result.drivePacket.modalCoefficients).every(
        (coefficient) => coefficient === 0,
      ),
    ).toBe(true);
    expect(result.drivePacket.renderState.modalResponseEnergy).toBe(0);
    expect(result.drivePacket.renderState.renderAuthority).toBe(false);
  });

  it("keeps hidden committed decay out of visible render semantics", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };
    const base = {
      sourceGeneration: 1,
      workerGeneration: 1,
      status: createStatus({ sessionKey: "file:1" }),
    };
    const first = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 1,
      captureTimestampMs: 10,
      fastPayload: createSilentAnalysisSnapshot(2048),
      structuralPayload: createAnalysisSnapshot(8192, 220),
      structuralRequested: true,
    });
    const hiddenModeIndex = first.topologyPacket.activeModeCount;
    expect(first.topologyPacket.committedModeCount).toBeGreaterThan(
      hiddenModeIndex,
    );
    const hiddenMode = state.committedModes[hiddenModeIndex];
    const modalExcitationState =
      state.featureState.analysis.modalExcitationState;
    const previous =
      modalExcitationState.activeModes.get(hiddenMode.modeKey) ??
      modalExcitationState.modalCandidateState.get(hiddenMode.modeKey) ??
      hiddenMode;
    const retainedEnergy = 0.8;
    const hiddenEntry = {
      ...previous,
      modalResponseEnergy: retainedEnergy,
      amplitude: Math.sqrt(retainedEnergy),
      displayAmplitude: Math.sqrt(retainedEnergy),
      modalResponseDrive: 0,
      currentDriveEnergy: 0,
      forcingEnergy: 0,
      modalOscillatorEnvelopeRe: Math.sqrt(retainedEnergy),
      modalOscillatorEnvelopeIm: 0,
      modalOscillatorRotationRad: 0,
      fastModalOscillatorOwned: true,
    };
    modalExcitationState.activeModes.set(hiddenMode.modeKey, hiddenEntry);
    modalExcitationState.modalCandidateState.set(
      hiddenMode.modeKey,
      hiddenEntry,
    );
    if (modalExcitationState.observedModes.has(hiddenMode.modeKey)) {
      modalExcitationState.observedModes.set(hiddenMode.modeKey, hiddenEntry);
    }

    const second = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 2,
      captureTimestampMs: 26,
      fastPayload: createSilentAnalysisSnapshot(2048),
      structuralPayload: null,
      structuralRequested: false,
    });
    const visibleCoefficients = second.drivePacket.modalCoefficients.subarray(
      0,
      second.drivePacket.activeModeCount,
    );

    expect(
      second.drivePacket.modalCoefficients[hiddenModeIndex],
    ).toBeGreaterThan(0);
    expect(Array.from(visibleCoefficients).every((value) => value === 0)).toBe(
      true,
    );
    expect(second.drivePacket.renderState).toMatchObject({
      fieldState: "idle",
      modalResponseEnergy: 0,
      renderAuthority: false,
    });
    expect(second.drivePacket.renderState.energyLedger).toMatchObject({
      projectedRenderEnergy: 0,
      renderAuthority: false,
    });
  });

  it("reuses fast packet typed buffers after topology setup", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };
    const base = {
      sourceGeneration: 1,
      workerGeneration: 1,
      status: createStatus({ sessionKey: "file:1" }),
    };
    const first = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 1,
      captureTimestampMs: 10,
      fastPayload: createAnalysisSnapshot(2048, 220),
      structuralPayload: createAnalysisSnapshot(8192, 220),
      structuralRequested: true,
    });
    const second = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 2,
      captureTimestampMs: 26,
      fastPayload: createAnalysisSnapshot(2048, 240),
      structuralPayload: null,
      structuralRequested: false,
    });

    expect(second.drivePacket.modalCoefficients).toBe(
      first.drivePacket.modalCoefficients,
    );
    expect(second.drivePacket.phaseSlots).toBe(first.drivePacket.phaseSlots);
    expect(second.drivePacket.bandEnergies).toBe(
      first.drivePacket.bandEnergies,
    );
    expect(second.drivePacket.spectralBandEnergies).toBe(
      first.drivePacket.spectralBandEnergies,
    );
    expect(state.drivePacketBufferAllocationCount).toBe(1);
  });

  it("retains a render-authoritative committed topology across a same-source bandwidth-limited candidate", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = {
      radius: 1,
      includeSpectralLight: true,
      auditSettings: {
        injectTestTone: true,
        testToneHz: 528,
        testToneAmplitude: 0.8,
      },
    };
    const status = createStatus({
      audioInputMode: "idle",
      analysisSource: "idle",
      isAudioLoaded: false,
      isPlaying: false,
      hasAnalysisSource: false,
      playbackSessionId: null,
      sessionKey: "idle",
    });
    const first = processFeatureWorkerFrame(state, {
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 10,
      fastPayload: null,
      structuralPayload: null,
      structuralRequested: true,
      status,
    });
    state.latestTopologyFrame = {
      ...state.latestTopologyFrame,
      modalDescriptor: {
        ...state.latestTopologyFrame.modalDescriptor,
        fieldAuthority: "capacity-limited",
      },
    };
    const committedTopologyFrame = state.latestTopologyFrame;
    const committedEstimator = state.fastEstimator;
    const committedModeKeys = state.committedModes.map((mode) => mode.modeKey);
    const committedTopologyRevision = state.topologyRevision;
    expect(first.topologyPacket.modalDescriptor.fieldAuthority).toBe(
      "complete",
    );

    // Remove continuity payload so the next structural result exposes the
    // high-only candidate's own bandwidth authority instead of retaining the
    // prior modes inside the structural compositor itself.
    const continuityState =
      state.featureState.analysis.modalFieldContinuityState;
    continuityState.recordsByModeKey.clear();
    continuityState.visibleModeKeys = [];
    continuityState.lastBasisReassignAtSec = Number.NEGATIVE_INFINITY;
    state.featureState.analysis.lastModalFieldContinuityFrameAtMs = undefined;
    state.featureState.analysis.modalExcitationState = null;
    state.configuration = {
      ...state.configuration,
      auditSettings: {
        injectTestTone: true,
        testToneHz: 6000,
        testToneAmplitude: 0.8,
      },
    };

    const second = processFeatureWorkerFrame(state, {
      frameId: 2,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 76,
      fastPayload: null,
      structuralPayload: null,
      structuralRequested: true,
      status,
    });

    expect(second.topologyPacket).toBeNull();
    expect(state.bandwidthLimitedTopologyRetentionCount).toBe(1);
    expect(state.topologyRevision).toBe(committedTopologyRevision);
    expect(state.latestTopologyFrame).toBe(committedTopologyFrame);
    expect(state.fastEstimator).toBe(committedEstimator);
    expect(state.committedModes.map((mode) => mode.modeKey)).toEqual(
      committedModeKeys,
    );
    expect(second.drivePacket.activeModeCount).toBe(
      first.topologyPacket.activeModeCount,
    );
    expect(
      Array.from(second.drivePacket.modalCoefficients).some(
        (coefficient) => coefficient > 0,
      ),
    ).toBe(true);
  });

  it("keeps a fresh high-only bandwidth-limited bootstrap fail-closed", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = {
      radius: 1,
      includeSpectralLight: true,
      auditSettings: {
        injectTestTone: true,
        testToneHz: 6000,
        testToneAmplitude: 0.8,
      },
    };

    const result = processFeatureWorkerFrame(state, {
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 10,
      fastPayload: null,
      structuralPayload: null,
      structuralRequested: true,
      status: createStatus({
        audioInputMode: "idle",
        analysisSource: "idle",
        isAudioLoaded: false,
        isPlaying: false,
        hasAnalysisSource: false,
        playbackSessionId: null,
        sessionKey: "idle",
      }),
    });

    expect(result.topologyPacket.modalDescriptor.fieldAuthority).toBe(
      "bandwidth-limited",
    );
    expect(result.topologyPacket.activeModeCount).toBe(0);
    expect(result.drivePacket.renderState.renderAuthority).toBe(false);
    expect(state.bandwidthLimitedTopologyRetentionCount).toBe(0);
  });
});
