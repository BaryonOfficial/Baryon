import { describe, expect, it, vi } from "vitest";
import {
  createAudioFeatureRuntime,
  AUDIO_FEATURE_AUTHORITY_ROLES,
} from "./audioFeatureEngine.js";
import { installFeatureWorkerHost } from "./audioFeatureEngine.worker.js";
import { createControlledMessageChannel } from "../../testing/controlledMessageChannel.js";

class LoopbackWorker {
  constructor() {
    this.queue = [];
    this.messages = [];
    this.terminated = false;
    this.state = installFeatureWorkerHost({
      addEventListener: (_type, handle) => {
        this.handle = handle;
      },
      postMessage: (data, options = {}) => {
        this.onmessage?.({
          data: structuredClone(data, { transfer: options.transfer ?? [] }),
        });
      },
    });
  }
  postMessage(message, transfer = []) {
    this.messages.push(message.type);
    if (message.type === "connect-pcm") {
      this.pcmPort = message.port;
      this.queue.push(message);
    } else this.queue.push(structuredClone(message, { transfer }));
  }
  flush() {
    while (this.queue.length && !this.terminated)
      this.handle({ data: this.queue.shift() });
    if (!this.terminated) {
      this.pcmPort?.flush();
      this.capturePort?.flush();
    }
  }
  terminate() {
    this.terminated = true;
  }
}
function harness() {
  let consumer,
    time = 0,
    snapshot = null;
  const context = { sampleRate: 48000, currentTime: 1, state: "running" };
  const workers = [],
    captures = [];
  const audioSession = {
    bindPcmConsumer: vi.fn((value) => {
      consumer = value;
      return () => {
        consumer = null;
      };
    }),
    readPcmSource: () => snapshot,
  };
  const createCapture = vi.fn(async (options) => {
    let sequence = 0,
      startSample = 0;
    const loans = new Map();
    const port = options.pcmPort;
    port.onmessage = ({ data }) => {
      const release = loans.get(data.sequence);
      loans.delete(data.sequence);
      release(data.buffers);
    };
    const capture = {
      dispose: vi.fn(() => {
        port.close();
        for (const release of loans.values()) release(null);
        loans.clear();
      }),
      start: vi.fn(() => capture.event("started")),
      pause: vi.fn(),
      resume: vi.fn(() => capture.event("resumed")),
      end: vi.fn(),
      event(type, values = {}) {
        const event = {
          ...options.configuration,
          type,
          startSample,
          nextSequence: sequence,
          ...values,
        };
        port.postMessage(event);
        options.onEvent(event);
      },
      block(postSourceSilence = false) {
        const channels = [0.017, 0.031].map((f) =>
          Float32Array.from({ length: 512 }, (_, n) =>
            postSourceSilence ? 0 : Math.sin((startSample + n) * f),
          ),
        );
        const packet = {
          ...options.configuration,
          sequence: sequence++,
          startSample,
          frameCount: 512,
          buffers: channels.map((channel) => channel.buffer),
          channels,
          postSourceSilence,
        };
        startSample += 512;
        const release = vi.fn();
        if (port.closed) release(null);
        else {
          loans.set(packet.sequence, release);
          port.postMessage({ ...packet, type: "pcm" }, packet.buffers);
        }
        return { release, packet };
      },
    };
    captures.push(capture);
    return capture;
  });
  const runtime = createAudioFeatureRuntime(
    {},
    {
      audioSession,
      now: () => time,
      createCapture,
      createPcmChannel: () => {
        const channel = createControlledMessageChannel();
        workers.at(-1).capturePort = channel.port1;
        return channel;
      },
      createWorker: () => {
        const worker = new LoopbackWorker();
        workers.push(worker);
        return worker;
      },
    },
  );
  runtime.configure({
    cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
  });
  const makeSnapshot = (revision = 0) => ({
    context,
    source: {},
    sourceSession: { kind: "file", sessionId: 1, timelineRevision: revision },
    active: true,
  });
  return {
    runtime,
    workers,
    captures,
    createCapture,
    makeSnapshot,
    consumer: () => consumer,
    context,
    setTime: (value) => {
      if (context.state === "running")
        context.currentTime += (value - time) / 1000;
      time = value;
    },
    async prepare(value = makeSnapshot()) {
      snapshot = value;
      const pending = consumer.prepare(value);
      workers.at(-1)?.flush();
      return pending;
    },
    async begin() {
      await this.prepare();
      consumer.begin({ startFrame: 512 });
      workers.at(-1).flush();
    },
  };
}
async function settle() {
  for (let n = 0; n < 8; n++) await Promise.resolve();
}

describe("sample-owned feature runtime", () => {
  it("waits for a source command; reads and repeated start cannot bootstrap or advance state", async () => {
    const h = harness();
    h.runtime.start();
    for (let n = 0; n < 10; n++) {
      h.runtime.readLatestFeatureModel();
      h.runtime.getStatus();
      h.runtime.start();
    }
    expect(h.workers).toHaveLength(0);
    await h.begin();
    const worker = h.workers[0],
      capture = h.captures[0];
    expect(worker.state.acoustic.read().response.sampleIndex).toBe(0);
    capture.block();
    worker.flush();
    const model = h.runtime.readLatestFeatureModel();
    expect(model.observation.endSample).toBe(512);
    expect(model.topology.familyCount).toBe(85);
    for (let n = 0; n < 10; n++)
      expect(h.runtime.readLatestFeatureModel()).toBe(model);
    expect(worker.messages).toEqual(["init", "connect-pcm"]);
    expect(h.createCapture).toHaveBeenCalledOnce();
  });
  it("waits for validated worker topology before installing capture; readiness cannot start it", async () => {
    const h = harness();
    h.runtime.start();
    const preparing = h.consumer().prepare(h.makeSnapshot());
    await settle();
    expect(h.createCapture).not.toHaveBeenCalled();
    expect(h.workers[0].messages).toEqual(["init"]);
    h.workers[0].flush();
    await preparing;
    expect(h.createCapture).toHaveBeenCalledOnce();
    expect(h.captures[0].start).not.toHaveBeenCalled();
    expect(h.workers[0].messages).toEqual(["init", "connect-pcm"]);
    expect(h.createCapture.mock.calls[0][0].onBlock).toBeUndefined();
    h.runtime.dispose();
  });
  it("relays every consecutive loan and returns its transferred buffers exactly once", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    const loans = [
      h.captures[0].block(),
      h.captures[0].block(),
      h.captures[0].block(),
    ];
    expect(
      h.workers[0].pcmPort.queue.filter((p) => p.type === "pcm"),
    ).toHaveLength(3);
    expect(loans[0].packet.buffers[0].byteLength).toBe(0);
    h.workers[0].flush();
    expect(h.workers[0].pcmPort.queue).toHaveLength(0);
    expect(h.workers[0].state.acceptedBlocks).toBe(3);
    for (const { release } of loans) {
      expect(release).toHaveBeenCalledOnce();
      expect(release.mock.calls[0][0][0].byteLength).toBe(2048);
    }
    expect(h.runtime.readLatestFeatureModel().observation.endSample).toBe(1536);
    expect(h.workers[0].messages).toEqual(["init", "connect-pcm"]);
  });
  it("waits for the actual pause edge, holds state and resumes without rebuilding it", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    const capture = h.captures[0],
      worker = h.workers[0];
    capture.block();
    worker.flush();
    h.consumer().pause({ contextFrame: 512 });
    expect(capture.pause).toHaveBeenCalledExactlyOnceWith({
      contextFrame: 512,
    });
    let prepared = false;
    const preparation = h.prepare().then(() => {
      prepared = true;
    });
    await Promise.resolve();
    expect(prepared).toBe(false);
    capture.event("paused");
    worker.flush();
    await preparation;
    h.setTime(10000);
    expect(h.runtime.readLatestFeatureModel().observation).toMatchObject({
      sourcePhase: "paused",
      endSample: 512,
    });
    expect(h.runtime.getStatus().renderAuthorityRevoked).toBe(false);
    h.consumer().begin({ startFrame: 1024 });
    worker.flush();
    capture.block();
    worker.flush();
    expect(h.runtime.readLatestFeatureModel().observation.endSample).toBe(1024);
    expect(h.workers).toHaveLength(1);
    expect(capture.resume).toHaveBeenCalledOnce();
  });
  it("an end notification cannot invent samples; only clocked silence advances the tail", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    const c = h.captures[0],
      w = h.workers[0];
    c.block();
    w.flush();
    c.event("ended");
    w.flush();
    expect(w.state.acoustic.read().response.sampleIndex).toBe(512);
    expect(h.runtime.getStatus().naturalRingdownActive).toBe(true);
    c.block(true);
    w.flush();
    expect(h.runtime.readLatestFeatureModel().observation).toMatchObject({
      endSample: 1024,
      sourcePhase: "draining",
    });
  });
  it("replay after natural completion starts a new acoustic generation", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    h.captures[0].block();
    h.workers[0].flush();
    h.captures[0].event("ended");
    h.workers[0].flush();
    const replay = h.makeSnapshot();
    replay.sourceSession.phase = "ended";
    await h.prepare(replay);
    expect(h.workers[0].terminated).toBe(true);
    h.consumer().begin({ startFrame: 2048 });
    h.workers[1].flush();
    h.captures[1].block();
    h.workers[1].flush();
    expect(h.runtime.readLatestFeatureModel().observation).toMatchObject({
      endSample: 512,
      sourcePhase: "running",
    });
    expect(h.captures[1].start).toHaveBeenCalledOnce();
    expect(h.captures[1].resume).not.toHaveBeenCalled();
  });

  it("stale observations revoke authority without reads restarting a stalled worker", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    h.captures[0].block();
    h.workers[0].flush();
    h.setTime(200);
    for (let n = 0; n < 5; n++)
      expect(h.runtime.readLatestFeatureModel()).toBe(null);
    expect(h.runtime.getStatus().latestObservationStale).toBe(true);
    expect(h.workers).toHaveLength(1);
    expect(h.workers[0].messages).toEqual(["init", "connect-pcm"]);
  });
  it("holds authority during context suspension and resumes the same consecutive state without a bootstrap", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    h.captures[0].block();
    h.workers[0].flush();
    const model = h.runtime.readLatestFeatureModel();
    h.context.state = "suspended";
    h.setTime(10000);
    expect(h.runtime.readLatestFeatureModel()).toBe(model);
    expect(h.runtime.getStatus().latestObservationStale).toBe(false);
    h.context.state = "running";
    h.setTime(10010);
    expect(h.runtime.readLatestFeatureModel()).toBe(model);
    h.captures[0].block();
    h.workers[0].flush();
    expect(h.runtime.readLatestFeatureModel().observation.endSample).toBe(1024);
    expect(h.workers).toHaveLength(1);
    expect(h.captures[0].resume).not.toHaveBeenCalled();
  });

  it("rejects stale worker callbacks and capture loans after an explicit timeline reset", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    const w = h.workers[0],
      c = h.captures[0],
      late = w.onmessage;
    c.block();
    w.flush();
    const model = h.runtime.readLatestFeatureModel();
    await h.prepare(h.makeSnapshot(1));
    expect(w.terminated).toBe(true);
    expect(c.dispose).toHaveBeenCalled();
    late({ data: { type: "observation-packet", packet: model.observation } });
    expect(c.block().release).toHaveBeenCalledExactlyOnceWith(null);
    expect(h.runtime.readLatestFeatureModel()).toBe(null);
    h.consumer().begin({ startFrame: 2048 });
    h.workers[1].flush();
    h.captures[1].block();
    h.workers[1].flush();
    expect(
      h.runtime.readLatestFeatureModel().observation.timelineRevision,
    ).toBe(1);
  });
  it("faults revoke the epoch; cached settings and reads cannot recover it", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    h.captures[0].block();
    h.workers[0].flush();
    h.workers[0].onerror();
    expect(h.runtime.getStatus().state).toBe("failed");
    expect(h.runtime.readLatestFeatureModel()).toBe(null);
    expect(
      h.runtime.configure({
        cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
      }),
    ).toBe(false);
    expect(h.workers).toHaveLength(1);
    await h.prepare();
    expect(h.workers).toHaveLength(2);
  });
  it("external consumers cannot create workers; explicit local ownership attaches an active source", async () => {
    const h = harness();
    h.runtime.setAuthorityRole(AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer);
    h.runtime.start();
    await h.prepare();
    expect(h.workers).toHaveLength(0);
    h.runtime.setAuthorityRole(AUDIO_FEATURE_AUTHORITY_ROLES.localProducer);
    h.workers.at(-1).flush();
    await settle();
    expect(h.workers).toHaveLength(1);
    expect(h.captures[0].start).toHaveBeenCalledOnce();
    h.runtime.setAuthorityRole(AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer);
    expect(h.workers[0].terminated).toBe(true);
    expect(h.runtime.readLatestFeatureModel()).toBe(null);
  });
  it("resets for changed apparatus settings, never for render radius or diagnostic controls", async () => {
    const h = harness();
    h.runtime.start();
    await h.begin();
    expect(
      h.runtime.configure({
        radius: 4,
        auditSettings: { enabled: true },
        cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
      }),
    ).toBe(false);
    expect(h.workers).toHaveLength(1);
    h.runtime.configure({
      boundaryMode: "dirichlet",
      cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
    });
    h.workers[1].flush();
    await settle();
    expect(h.workers).toHaveLength(2);
    h.captures[1].block();
    h.workers[1].flush();
    expect(h.runtime.readLatestFeatureModel().topology.familyCount).toBe(55);
  });
  it("presentation failures cannot reset the source or drop further PCM processing", async () => {
    const h = harness(),
      listener = vi.fn(),
      onError = vi.fn();
    h.runtime.start();
    await h.begin();
    h.runtime.subscribeObservations(listener);
    h.runtime.subscribeObservations(() => {
      throw new Error("observer overflow");
    }, onError);
    h.captures[0].block();
    h.captures[0].block();
    h.workers[0].flush();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
    expect(h.runtime.getStatus().state).toBe("ready");
    expect(h.workers[0].terminated).toBe(false);
    expect(h.workers[0].state.acceptedBlocks).toBe(2);
    expect(h.runtime.getStatus().observerNotificationFailure).toBe(
      "observer overflow",
    );
  });
  it("notifies normal revocation once without replay, bootstrap or dropping the next generation", async () => {
    const h = harness(),
      listener = vi.fn(),
      revoked = vi.fn();
    h.runtime.start();
    await h.begin();
    const unsubscribe = h.runtime.subscribeObservations(
      listener,
      undefined,
      revoked,
    );
    h.captures[0].block();
    h.workers[0].flush();
    const before = h.runtime.getStatus();
    h.consumer().invalidate("stopped");
    expect(revoked).toHaveBeenCalledExactlyOnceWith({
      reason: "stopped",
      sourceGeneration: before.sourceGeneration + 1,
    });
    expect(h.runtime.readLatestFeatureModel()).toBeNull();
    for (let n = 0; n < 5; n++) h.runtime.getStatus();
    expect(h.workers).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
    await h.prepare(h.makeSnapshot(1));
    h.consumer().begin({ startFrame: 2048 });
    h.workers[1].flush();
    h.captures[1].block();
    h.workers[1].flush();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0].observation.timelineRevision).toBe(1);
    unsubscribe();
    const count = revoked.mock.calls.length;
    h.consumer().invalidate("stopped-again");
    expect(revoked).toHaveBeenCalledTimes(count);
  });
  it("isolates a failed revocation subscriber from the source and other subscribers", async () => {
    const h = harness(),
      revoked = vi.fn(),
      onError = vi.fn();
    h.runtime.start();
    await h.begin();
    h.runtime.subscribeObservations(vi.fn(), onError, () => {
      throw Error("mirror-revoke-failed");
    });
    h.runtime.subscribeObservations(vi.fn(), undefined, revoked);
    h.consumer().invalidate("stopped");
    expect(onError).toHaveBeenCalledOnce();
    expect(revoked).toHaveBeenCalledOnce();
    expect(h.runtime.getStatus()).toMatchObject({
      state: "idle",
      reason: "stopped",
      observerNotificationFailure: "mirror-revoke-failed",
      sourceBootstrapCount: 1,
    });
    expect(h.workers).toHaveLength(1);
  });

  it("cancels installation without adopting or restarting a late capture", async () => {
    const h = harness();
    let finish;
    h.createCapture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    h.runtime.start();
    const pending = h.prepare();
    await settle();
    h.runtime.dispose();
    const late = { dispose: vi.fn() };
    finish(late);
    await pending;
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(h.workers[0].terminated).toBe(true);
    expect(h.runtime.getStatus().state).toBe("terminated");
    expect(h.runtime.readLatestFeatureModel()).toBe(null);
  });
});
