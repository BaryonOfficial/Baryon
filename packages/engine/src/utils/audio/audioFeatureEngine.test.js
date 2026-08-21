import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_FEATURE_AUTHORITY_ROLES,
  createAudioFeatureRuntime,
  DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS,
} from "./audioFeatureEngine.js";
import { AUDIO_FEATURE_PROTOCOL_VERSION } from "../../contracts/audioFeatureProtocol.js";
import {
  createFeatureWorkerState,
  processFeatureWorkerFrame,
} from "./audioFeatureEngine.worker.js";
import {
  AUDIO_SLOT_CAPACITY,
  CAVITY_ACOUSTIC_DEFAULTS,
} from "../../defaults.js";
import { deriveCavityModalFieldCacheBandwidth } from "../../core/raymarch/fieldCachePassband.js";
import {
  AUDIO_SOURCE_KINDS,
  AUDIO_SOURCE_PHASES,
} from "../../core/audio/audioSourceSession.js";

const DEFAULT_MODAL_OBSERVATION_BAND = deriveCavityModalFieldCacheBandwidth({
  sideLengthMeters: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
  soundSpeedMetersPerSecond: CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond,
  boundaryMode: "neumann",
});

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

class LoopbackFeatureWorker extends FakeWorker {
  constructor() {
    super();
    this.messageCursor = 0;
    this.engineState = createFeatureWorkerState();
  }

  processPendingMessages() {
    while (this.messageCursor < this.messages.length) {
      const payload = this.messages[this.messageCursor]?.message ?? {};
      this.messageCursor += 1;
      if (payload.type === "init") {
        this.engineState = createFeatureWorkerState();
        this.engineState.settings = payload.settings;
        this.engineState.sourceGeneration = payload.sourceGeneration;
        this.engineState.workerGeneration = payload.workerGeneration;
        this.engineState.configuration = payload.configuration ?? {};
        continue;
      }
      if (payload.type === "configure") {
        this.engineState.configuration = payload.configuration ?? {};
        continue;
      }
      if (payload.type !== "analysis-input" || !payload.frame) {
        continue;
      }

      const { topologyPacket, drivePacket } = processFeatureWorkerFrame(
        this.engineState,
        payload.frame,
      );
      if (topologyPacket) {
        this.emit("message", {
          type: "topology-packet",
          packet: structuredClone(topologyPacket),
        });
      }
      this.emit("message", {
        type: "drive-packet",
        packet: structuredClone(drivePacket),
      });
      this.emit("message", {
        type: "analysis-input-ack",
        sourceGeneration: this.engineState.sourceGeneration,
        workerGeneration: this.engineState.workerGeneration,
        frameId: payload.frame.frameId,
      });
    }
  }
}

function createFileSourceSession(overrides = {}) {
  return {
    kind: AUDIO_SOURCE_KINDS.file,
    phase: AUDIO_SOURCE_PHASES.active,
    sessionId: 1,
    timelineRevision: 0,
    terminalReason: null,
    systemCapture: null,
    ...overrides,
  };
}

function createSystemSourceSession(overrides = {}) {
  return {
    kind: AUDIO_SOURCE_KINDS.system,
    phase: AUDIO_SOURCE_PHASES.active,
    sessionId: 2,
    timelineRevision: 0,
    terminalReason: null,
    systemCapture: {
      captureType: "loopback",
      deviceId: "system-default",
    },
    ...overrides,
  };
}

function createStatus(overrides = {}) {
  return {
    analysisSource: "file",
    sourceSession: createFileSourceSession(),
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
    getTransportState: vi.fn(
      () => dependencyOverrides.getTransportState?.({ currentTimeMs }) ?? null,
    ),
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
    modalFieldSpectralMomentSlots: new Float32Array([1, 0, 1, 0]),
    modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
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
    renderState: { renderAuthority: true },
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

  it("prepares a decoded file's structural frame before playback starts", () => {
    const harness = createRuntimeHarness(
      {
        analysisSource: "idle",
        sourceSession: createFileSourceSession({
          phase: AUDIO_SOURCE_PHASES.ready,
        }),
        isPlaying: false,
        hasAnalysisSource: false,
        hasPlaybackAnalysisSource: false,
        hasPreparedFileAnalysisSource: true,
        playbackSessionId: null,
      },
      {
        createWorker: () => new LoopbackFeatureWorker(),
        readFeatureAnalysisCapture: ({ includeStructural, currentTimeMs }) => ({
          captureTimestampMs: currentTimeMs,
          fast: {
            ...createSilentAnalysisSnapshot(2048),
            avgAmplitude: 19,
            rms: 0.00047,
          },
          structural: includeStructural ? createAnalysisSnapshot(8192) : null,
        }),
      },
    );

    expect(harness.runtime.start()).toBe(true);

    const [input] = findMessages(harness.workers[0], "analysis-input");
    expect(input.frame.structuralRequested).toBe(true);
    expect(input.frame.structuralPayload).not.toBeNull();
    expect(input.frame.status.observationTimeSeconds).toBe(0);
    expect(input.frame.status.observationAdvancing).toBe(false);

    harness.workers[0].processPendingMessages();
    const model = harness.runtime.readLatestFeatureModel();
    expect(model).not.toBeNull();
    expect(model.topology.activeModeCount).toBeGreaterThan(0);
    expect(
      Array.from(model.drive.modalCoefficients).some(
        (coefficient) => Math.abs(coefficient) > 0,
      ),
    ).toBe(true);
    expect(model.drive.renderState.renderAuthority).toBe(false);
    expect(model.drive.renderState.sourceEvidence).toMatchObject({
      sourceKind: "file",
      sourceBoundaryState: "prepared",
      currentSourceEvidence: false,
      transport: {
        playing: false,
        preparationOnly: true,
      },
    });

    expect(harness.runNextCapture()).toBe(true);
    expect(findMessages(harness.workers[0], "analysis-input")).toHaveLength(1);
    expect(harness.runtime.getStatus().reason).toBe("prepared-file-hold");

    harness.setTime(1_000);
    harness.setStatus({
      analysisSource: "file",
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.active,
      }),
      isPlaying: true,
      hasAnalysisSource: true,
      hasPlaybackAnalysisSource: true,
      playbackSessionId: 1,
    });
    expect(harness.runNextCapture()).toBe(true);
    expect(harness.workers).toHaveLength(1);
    expect(findMessages(harness.workers[0], "analysis-input")).toHaveLength(2);
    const playbackInput = findMessages(
      harness.workers[0],
      "analysis-input",
    ).at(-1);
    expect(playbackInput.frame.structuralRequested).toBe(false);
    expect(playbackInput.frame.structuralPayload).toBeNull();
  });

  it("requests a worker-owned test-tone topology when no audio capture exists", () => {
    const harness = createRuntimeHarness(
      {
        analysisSource: "idle",
        sourceSession: createFileSourceSession({
          phase: AUDIO_SOURCE_PHASES.empty,
          sessionId: 0,
        }),
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
      status: {
        observationAdvancing: true,
        observationPaused: false,
      },
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

  it("advances injected tone time independently of a stopped loaded file", () => {
    const harness = createRuntimeHarness(
      { isPlaying: false, isAudioLoaded: true },
      { getTransportState: () => ({ currentTimeSeconds: 12 }) },
    );
    harness.runtime.configure({
      auditSettings: {
        injectTestTone: true,
        testToneHz: 528,
        testToneAmplitude: 0.8,
      },
    });
    harness.runtime.start();

    const worker = harness.workers[0];
    const firstInput = findMessages(worker, "analysis-input")[0].frame;
    worker.emit("message", {
      type: "analysis-input-ack",
      sourceGeneration: firstInput.sourceGeneration,
      workerGeneration: firstInput.workerGeneration,
      frameId: firstInput.frameId,
    });
    harness.setTime(1000);
    harness.runNextCapture();

    expect(
      findMessages(worker, "analysis-input").at(-1).frame.status,
    ).toMatchObject({
      observationTimeSeconds: 1,
      observationAdvancing: true,
      observationPaused: false,
    });
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
    harness.setStatus({
      sourceSession: createFileSourceSession({ sessionId: 2 }),
      playbackSessionId: 2,
    });
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

  it("keeps the prepared file model available when playback activates", () => {
    const harness = createRuntimeHarness({
      analysisSource: "idle",
      isPlaying: false,
      hasAnalysisSource: false,
      hasPlaybackAnalysisSource: false,
      hasPreparedFileAnalysisSource: true,
      playbackSessionId: null,
    });

    harness.runtime.start();
    publishModel(harness);
    expect(harness.runtime.readLatestFeatureModel()).not.toBeNull();

    harness.setStatus({
      analysisSource: "file",
      isPlaying: true,
      hasAnalysisSource: true,
      playbackSessionId: 1,
    });
    harness.setTime(8);
    harness.runNextCapture();

    expect(harness.runtime.readLatestFeatureModel()).not.toBeNull();
    expect(harness.runtime.getStatus()).not.toHaveProperty(
      "playbackAnalysisPending",
    );
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

  it("retains the last valid model while the same file playback remains active", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    const published = harness.runtime.readLatestFeatureModel();
    harness.setTime(97);

    expect(harness.runtime.readLatestFeatureModel()).toBe(published);
    expect(harness.runtime.getStatus()).toMatchObject({
      latestDriveAgeMs: 97,
      latestDriveStale: true,
      renderAuthorityRevoked: false,
    });
  });

  it("retains the last valid file model across an internal worker restart", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    const published = harness.runtime.readLatestFeatureModel();
    const initialSourceGeneration =
      harness.runtime.getStatus().sourceGeneration;

    harness.setTime(288);
    harness.runNextCapture();

    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: initialSourceGeneration,
      workerRestartCount: 1,
      renderAuthorityRevoked: false,
    });
    expect(harness.runtime.readLatestFeatureModel()).toBe(published);
  });

  it("invalidates a retained file model when the source session changes", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);

    harness.setStatus({
      sourceSession: createFileSourceSession({ sessionId: 2 }),
      playbackSessionId: 2,
    });
    harness.setTime(8);
    harness.runNextCapture();

    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
  });

  it("fails closed after 96 ms for an advancing live input", () => {
    const harness = createRuntimeHarness({
      analysisSource: "live",
      sourceSession: createSystemSourceSession(),
      isAudioLoaded: false,
      isPlaying: false,
      isLiveInputActive: true,
      playbackSessionId: null,
    });
    harness.runtime.start();
    publishModel(harness);
    harness.setTime(97);

    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
    expect(harness.runtime.getStatus()).toMatchObject({
      latestDriveAgeMs: 97,
      latestDriveStale: true,
      renderAuthorityRevoked: true,
    });
  });

  it("does not treat a cached File as advancing while System is idle", () => {
    const harness = createRuntimeHarness({
      analysisSource: "idle",
      sourceSession: createSystemSourceSession({
        phase: AUDIO_SOURCE_PHASES.ready,
        systemCapture: null,
      }),
      isPlaying: false,
      isLiveInputActive: false,
      hasAnalysisSource: false,
      hasPreparedFileAnalysisSource: true,
      playbackSessionId: null,
    });
    harness.runtime.start();
    expect(harness.workers).toHaveLength(1);
    harness.setTime(288);
    harness.runNextCapture();

    expect(harness.workers).toHaveLength(1);
    expect(harness.runtime.getStatus().renderAuthorityRevoked).toBe(false);
  });

  it("exempts explicit paused-file hold from stale revocation", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness);
    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: true,
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.paused,
      }),
    });
    harness.setTime(500);
    harness.runNextCapture();

    expect(harness.runtime.readLatestFeatureModel()).not.toBeNull();
    expect(harness.runtime.getStatus().renderAuthorityRevoked).toBe(false);
  });

  it("rebuilds analysis and captures the decoded target once after a paused seek", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const initialGeneration = harness.runtime.getStatus().sourceGeneration;

    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: true,
      hasPreparedFileAnalysisSource: true,
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.paused,
        timelineRevision: 1,
      }),
    });
    harness.setTime(8);
    harness.runNextCapture();
    expect(harness.runtime.getStatus().sourceGeneration).toBe(
      initialGeneration + 1,
    );

    harness.setTime(16);
    harness.runNextCapture();
    const inputs = harness.workers.flatMap((worker) =>
      findMessages(worker, "analysis-input"),
    );
    expect(inputs).toHaveLength(2);
    expect(inputs.at(-1).frame.status).toMatchObject({
      sessionKey: "file:1:timeline:1",
      observationAdvancing: false,
      observationPaused: true,
      sourceSession: {
        kind: AUDIO_SOURCE_KINDS.file,
        timelineRevision: 1,
      },
    });
    expect(
      harness.audioSession.readFeatureAnalysisCapture,
    ).toHaveBeenCalledTimes(2);

    harness.setTime(24);
    harness.runNextCapture();
    expect(
      harness.audioSession.readFeatureAnalysisCapture,
    ).toHaveBeenCalledTimes(2);
  });

  it.each(["premature", "interrupted"])(
    "does not classify a %s playback end as an explicit pause",
    (lastPlaybackEndReason) => {
      const harness = createRuntimeHarness();
      harness.runtime.start();
      harness.setStatus({
        isPlaying: false,
        isPlaybackPaused: false,
        sourceSession: createFileSourceSession({
          phase: AUDIO_SOURCE_PHASES.ended,
          terminalReason: lastPlaybackEndReason,
        }),
        lastPlaybackEndReason,
      });
      harness.setTime(500);
      harness.runNextCapture();

      expect(harness.runtime.getStatus().sourceGeneration).toBe(1);
      expect(harness.runtime.getStatus().reason).not.toBe("paused-file-hold");
    },
  );

  it("advances deterministic zero-input frames through natural modal ring-down", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness, {
      drive: {
        renderState: {
          fieldState: "active",
          renderAuthority: true,
        },
      },
    });
    const worker = harness.workers[0];
    const firstInput = findMessages(worker, "analysis-input")[0].frame;

    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: false,
      analysisSource: "idle",
      hasAnalysisSource: false,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: { playbackSessionId: 1 },
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.ended,
        terminalReason: "natural",
      }),
    });
    harness.setTime(8);
    harness.runNextCapture();

    expect(
      harness.audioSession.readFeatureAnalysisCapture,
    ).toHaveBeenCalledTimes(1);
    expect(harness.runtime.getStatus()).toMatchObject({
      naturalRingdownActive: true,
      naturalRingdownSessionId: 1,
    });

    worker.emit("message", {
      type: "analysis-input-ack",
      sourceGeneration: firstInput.sourceGeneration,
      workerGeneration: firstInput.workerGeneration,
      frameId: firstInput.frameId,
    });
    const ringdownInput = findMessages(worker, "analysis-input")[1].frame;
    expect(ringdownInput).toMatchObject({
      captureTimestampMs: 8,
      fastPayload: {
        sourceMode: "file",
        avgAmplitude: 0,
        rms: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
      },
      structuralPayload: null,
      structuralRequested: false,
      status: {
        naturalRingdownActive: true,
        observationTimeSeconds: 0.008,
        observationAdvancing: true,
        observationPaused: false,
        sourceSession: {
          kind: AUDIO_SOURCE_KINDS.file,
          phase: AUDIO_SOURCE_PHASES.ended,
          sessionId: 1,
        },
      },
    });
    expect(Array.from(ringdownInput.fastPayload.timeData)).toEqual(
      Array.from(new Float32Array(2048)),
    );
    expect(Array.from(ringdownInput.fastPayload.fftLinearAmplitudes)).toEqual(
      Array.from(new Float32Array(1024)),
    );

    worker.emit("message", {
      type: "drive-packet",
      packet: createDrivePacket(harness.runtime.getStatus(), {
        frameId: ringdownInput.frameId,
        captureTimestampMs: ringdownInput.captureTimestampMs,
        renderState: {
          fieldState: "idle",
          renderAuthority: false,
        },
      }),
    });
    expect(harness.runtime.getStatus()).toMatchObject({
      naturalRingdownActive: false,
      naturalRingdownSessionId: null,
      reason: "natural-ringdown-complete",
    });
  });

  it("clears an already-idle model when natural playback completes", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const initialGeneration = harness.runtime.getStatus().sourceGeneration;
    publishModel(harness, {
      drive: {
        renderState: {
          fieldState: "idle",
          renderAuthority: false,
        },
      },
    });

    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: false,
      analysisSource: "idle",
      hasAnalysisSource: false,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: { playbackSessionId: 1 },
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.ended,
        terminalReason: "natural",
      }),
    });
    harness.setTime(8);
    harness.runNextCapture();

    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: initialGeneration + 1,
      naturalRingdownActive: false,
      naturalRingdownSessionId: null,
      renderAuthorityRevoked: true,
      reason: "natural-ringdown-empty",
    });
  });

  it("releases render authority after the real worker completes natural modal ring-down", () => {
    const worker = new LoopbackFeatureWorker();
    const harness = createRuntimeHarness({}, { createWorker: () => worker });
    harness.runtime.configure({ radius: 1, includeSpectralLight: true });
    const initialSourceGeneration =
      harness.runtime.getStatus().sourceGeneration;
    harness.runtime.start();

    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      worker.processPendingMessages();
      harness.setTime((frameIndex + 1) * 8);
      harness.runNextCapture();
    }
    worker.processPendingMessages();
    expect(
      harness.runtime.readLatestFeatureModel()?.drive?.renderState
        ?.renderAuthority,
    ).toBe(true);

    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: false,
      analysisSource: "idle",
      hasAnalysisSource: false,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: { playbackSessionId: 1 },
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.ended,
        terminalReason: "natural",
      }),
    });

    let completionFrameCount = null;
    for (let frameIndex = 0; frameIndex < 120; frameIndex += 1) {
      harness.setTime((13 + frameIndex) * 8);
      harness.runNextCapture();
      worker.processPendingMessages();
      if (!harness.runtime.getStatus().naturalRingdownActive) {
        completionFrameCount = frameIndex + 1;
        break;
      }
    }

    expect(completionFrameCount).not.toBeNull();
    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: initialSourceGeneration + 1,
      naturalRingdownActive: false,
      naturalRingdownSessionId: null,
      renderAuthorityRevoked: true,
      reason: "natural-ringdown-complete",
    });

    const completedSourceGeneration =
      harness.runtime.getStatus().sourceGeneration;
    for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
      harness.setTime((133 + frameIndex) * 8);
      harness.runNextCapture();
      worker.processPendingMessages();
    }
    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: completedSourceGeneration,
      naturalRingdownActive: false,
      renderAuthorityRevoked: true,
      reason: "natural-ringdown-complete",
    });
  });

  it("recovers a stalled worker while natural modal ring-down advances", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    publishModel(harness, {
      drive: {
        renderState: {
          fieldState: "active",
          renderAuthority: true,
        },
      },
    });

    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: false,
      analysisSource: "idle",
      hasAnalysisSource: false,
      lastPlaybackEndReason: "natural",
      lastPlaybackDiagnostics: { playbackSessionId: 1 },
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.ended,
        terminalReason: "natural",
      }),
    });
    harness.setTime(8);
    harness.runNextCapture();
    expect(harness.runtime.getStatus().naturalRingdownActive).toBe(true);

    harness.setTime(289);
    harness.runNextCapture();

    expect(harness.workers).toHaveLength(2);
    expect(harness.workers[0].terminated).toBe(true);
    expect(harness.runtime.getStatus()).toMatchObject({
      naturalRingdownActive: true,
      naturalRingdownSessionId: 1,
      workerRestartCount: 1,
      configurationReplayCount: 1,
      reason: "worker-advancement-timeout",
    });
  });

  it("does not start modal ring-down after an explicit stop", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const initialGeneration = harness.runtime.getStatus().sourceGeneration;
    publishModel(harness, {
      drive: {
        renderState: {
          fieldState: "active",
          renderAuthority: true,
        },
      },
    });

    harness.setStatus({
      isPlaying: false,
      isPlaybackPaused: false,
      analysisSource: "idle",
      hasAnalysisSource: false,
      lastPlaybackEndReason: "stopped",
      lastPlaybackDiagnostics: { playbackSessionId: 1 },
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.stopped,
        terminalReason: "stopped",
      }),
    });
    harness.setTime(8);
    harness.runNextCapture();

    expect(
      harness.audioSession.readFeatureAnalysisCapture,
    ).toHaveBeenCalledTimes(1);
    expect(harness.runtime.getStatus()).toMatchObject({
      sourceGeneration: initialGeneration + 1,
      naturalRingdownActive: false,
      naturalRingdownSessionId: null,
      reason: "explicit-stop-hold",
    });
    expect(harness.runtime.readLatestFeatureModel()).toBeNull();
  });

  it.each(["stopped", "natural"])(
    "lets active system input supersede a stale %s file marker",
    (lastPlaybackEndReason) => {
      const harness = createRuntimeHarness({
        analysisSource: "live",
        sourceSession: createSystemSourceSession(),
        isPlaying: false,
        isPlaybackPaused: false,
        isLiveInputActive: true,
        hasAnalysisSource: true,
        lastPlaybackEndReason,
        lastPlaybackDiagnostics: { playbackSessionId: 1 },
      });

      harness.runtime.start();

      expect(
        harness.audioSession.readFeatureAnalysisCapture,
      ).toHaveBeenCalledTimes(1);
      expect(findMessages(harness.workers[0], "analysis-input")).toHaveLength(
        1,
      );
      expect(harness.runtime.getStatus()).toMatchObject({
        naturalRingdownActive: false,
        reason: "input-sent",
      });
    },
  );

  it("rejects delayed worker status from a stale generation", () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();
    const worker = harness.workers[0];
    const staleGeneration = harness.runtime.getStatus();
    harness.setStatus({
      sourceSession: createFileSourceSession({ sessionId: 2 }),
      playbackSessionId: 2,
    });
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
    harness.setStatus({
      sourceSession: createFileSourceSession({ sessionId: 2 }),
      playbackSessionId: 2,
    });

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
    harness.setStatus({
      sourceSession: createFileSourceSession({ sessionId: 2 }),
      playbackSessionId: 2,
    });
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
    const harness = createRuntimeHarness({
      analysisSource: "live",
      sourceSession: createSystemSourceSession(),
      isAudioLoaded: false,
      isPlaying: false,
      isLiveInputActive: true,
      playbackSessionId: null,
    });
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
  it("projects retained modal energy during natural zero-force ring-down", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = { radius: 1, includeSpectralLight: true };
    const activeStatus = createStatus({ sessionKey: "file:1" });
    let active = null;

    for (let frameId = 1; frameId <= 12; frameId += 1) {
      active = processFeatureWorkerFrame(state, {
        frameId,
        sourceGeneration: 1,
        workerGeneration: 1,
        captureTimestampMs: frameId * 8,
        fastPayload: createAnalysisSnapshot(2048, 220),
        structuralPayload:
          frameId === 1 ? createAnalysisSnapshot(8192, 220) : null,
        structuralRequested: frameId === 1,
        status: activeStatus,
      });
    }

    expect(active.drivePacket.renderState.renderAuthority).toBe(true);
    const activeStoredEnergy =
      active.drivePacket.renderState.energyLedger.storedModalEnergy;
    expect(activeStoredEnergy).toBeGreaterThan(0);

    const ringdown = processFeatureWorkerFrame(state, {
      frameId: 13,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 13 * 8,
      fastPayload: {
        sourceMode: "file",
        avgAmplitude: 0,
        rms: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        fftLinearAmplitudes: new Float32Array(1024),
        timeData: new Float32Array(2048),
      },
      structuralPayload: null,
      structuralRequested: false,
      status: createStatus({
        sessionKey: "file:1",
        isPlaying: false,
        naturalRingdownActive: true,
        lastPlaybackEndReason: "natural",
        lastPlaybackDiagnostics: { playbackSessionId: 1 },
      }),
    });

    expect(ringdown.drivePacket.renderState).toMatchObject({
      renderAuthority: true,
      sourceEvidence: {
        sourceBoundaryState: "zero",
      },
      energyLedger: {
        sourceBoundaryState: "zero",
        renderBoundaryState: "zero",
      },
    });
    expect(
      ringdown.drivePacket.renderState.energyLedger.storedModalEnergy,
    ).toBeGreaterThan(0);
    expect(
      ringdown.drivePacket.renderState.energyLedger.storedModalEnergy,
    ).toBeLessThan(activeStoredEnergy);
    expect(
      ringdown.drivePacket.renderState.energyLedger.projectedRenderEnergy,
    ).toBeGreaterThan(0);
    expect(
      Array.from(ringdown.drivePacket.modalCoefficients).some(Boolean),
    ).toBe(true);
  });

  it("does not feed published frame scalars back into current semantics", () => {
    const runSequence = (tamperPublishedFrame) => {
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
      expect(state).not.toHaveProperty("latestFeatureFrame");
      if (tamperPublishedFrame) {
        Object.assign(first.drivePacket.renderState, {
          structureSignal: 1,
          energySignal: 1,
          changeSignal: 1,
          pulseSignal: 1,
          modalVisibilityEnergy: 1,
        });
      }
      return processFeatureWorkerFrame(state, {
        ...base,
        frameId: 2,
        captureTimestampMs: 26,
        fastPayload: createAnalysisSnapshot(2048, 220),
        structuralPayload: null,
      }).drivePacket.renderState;
    };

    const expected = runSequence(false);
    const afterPublishedFrameTamper = runSequence(true);

    expect(afterPublishedFrameTamper).toMatchObject({
      structureSignal: expected.structureSignal,
      energySignal: expected.energySignal,
      changeSignal: expected.changeSignal,
      pulseSignal: expected.pulseSignal,
      modalVisibilityEnergy: expected.modalVisibilityEnergy,
    });
  });

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

  it("pauses renderer observer evolution while pattern freeze is active", () => {
    const state = createFeatureWorkerState();
    state.sourceGeneration = 1;
    state.workerGeneration = 1;
    state.configuration = {
      radius: 1,
      includeSpectralLight: true,
      auditSettings: { freezeModeSlots: true },
    };

    const { drivePacket } = processFeatureWorkerFrame(state, {
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 1_000,
      fastPayload: createAnalysisSnapshot(2048, 220),
      structuralPayload: createAnalysisSnapshot(8192, 220),
      structuralRequested: true,
      status: createStatus({
        sessionKey: "file:1",
        observationTimeSeconds: 12.5,
        observationAdvancing: true,
        observationPaused: false,
      }),
    });

    expect(drivePacket.renderState.diagnosticControlState.freezeModeSlots).toBe(
      true,
    );
    expect(drivePacket).toMatchObject({
      observationTimeSeconds: 12.5,
      observationAdvancing: false,
      observationPaused: true,
    });
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

  it("leaves no committed mode outside the render window", () => {
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
    // This used to guard a leak path that only existed because a small optical
    // mode ceiling left committed modes sitting outside the render window,
    // where retained decay energy could accumulate unseen. With no ceiling that
    // region cannot exist, which is the stronger guarantee: the render window
    // covers the committed set exactly, so there is nowhere for a mode to hide.
    expect(first.topologyPacket.committedModeCount).toBeGreaterThan(0);
    expect(first.topologyPacket.activeModeCount).toBe(
      first.topologyPacket.committedModeCount,
    );
    expect(state.committedModes).toHaveLength(
      first.topologyPacket.committedModeCount,
    );

    const second = processFeatureWorkerFrame(state, {
      ...base,
      frameId: 2,
      captureTimestampMs: 26,
      fastPayload: createSilentAnalysisSnapshot(2048),
      structuralPayload: null,
      structuralRequested: false,
    });

    // Silence still clears the field, so nothing survives in the render window
    // on its own once drive stops.
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

  it("rebuilds same-source test-tone topology when frequency changes", () => {
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
      analysisSource: "idle",
      sourceSession: createFileSourceSession({
        phase: AUDIO_SOURCE_PHASES.empty,
        sessionId: 0,
      }),
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

    // This is the live slider path: configuration changes in place while the
    // worker and source session remain stable. No private continuity reset is
    // permitted here; the input identity owns that transition.
    state.configuration = {
      ...state.configuration,
      auditSettings: {
        injectTestTone: true,
        testToneHz: 6000,
        testToneAmplitude: 0.8,
      },
    };

    let switchedTopologyPacket = processFeatureWorkerFrame(state, {
      frameId: 2,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: 76,
      fastPayload: null,
      structuralPayload: null,
      structuralRequested: true,
      status,
    }).topologyPacket;
    for (let frameId = 3; frameId <= 5; frameId += 1) {
      const result = processFeatureWorkerFrame(state, {
        frameId,
        sourceGeneration: 1,
        workerGeneration: 1,
        captureTimestampMs: 76 + (frameId - 2) * 33,
        fastPayload: null,
        structuralPayload: null,
        structuralRequested: true,
        status,
      });
      switchedTopologyPacket = result.topologyPacket ?? switchedTopologyPacket;
    }

    // Upper-band audio remains a valid source frame. Any spatial identities it
    // drives off resonance must still come from the apparatus-supported atlas,
    // rather than mapping the 6 kHz peak to an unsupported high-order tuple.
    expect(switchedTopologyPacket).not.toBeNull();
    expect(switchedTopologyPacket.modalDescriptor.fieldAuthority).toBe(
      "complete",
    );
    expect(state.topologyRevision).toBeGreaterThan(committedTopologyRevision);
    expect(state.latestTopologyFrame).not.toBe(committedTopologyFrame);
    expect(state.fastEstimator).not.toBe(committedEstimator);
    expect(state.committedModes.map((mode) => mode.modeKey)).not.toEqual(
      committedModeKeys,
    );
    // Every newly admitted mode must arrive with its cavity frequency resolved
    // and probeable; an unresolved one used to reach the Goertzel and abort the
    // whole frame.
    expect(state.fastEstimator).not.toBeNull();
    expect(state.committedModes.length).toBeGreaterThan(0);
    for (const mode of state.committedModes) {
      expect(mode.naturalFrequencyHz).toBeGreaterThan(0);
      expect(mode.naturalFrequencyHz).toBeLessThanOrEqual(
        DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz,
      );
    }
  });

  it("keeps a fresh high-only bootstrap authoritative without over-tail topology", () => {
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
        analysisSource: "idle",
        sourceSession: createFileSourceSession({
          phase: AUDIO_SOURCE_PHASES.empty,
          sessionId: 0,
        }),
        isAudioLoaded: false,
        isPlaying: false,
        hasAnalysisSource: false,
        playbackSessionId: null,
        sessionKey: "idle",
      }),
    });

    // The source remains authoritative, but the spatial representation stays
    // within the observation-derived atlas support.
    expect(result.topologyPacket.modalDescriptor.fieldAuthority).toBe(
      "complete",
    );
    expect(result.topologyPacket.activeModeCount).toBeGreaterThan(0);
    expect(
      state.committedModes.every(
        (mode) =>
          mode.naturalFrequencyHz <=
          DEFAULT_MODAL_OBSERVATION_BAND.tailMaxFrequencyHz,
      ),
    ).toBe(true);
  });
});
