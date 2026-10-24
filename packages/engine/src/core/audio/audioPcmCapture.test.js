import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { createControlledMessageChannel } from "../../testing/controlledMessageChannel.js";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import { installFeatureWorkerHost } from "../../utils/audio/audioFeatureEngine.worker.js";

let CaptureProcessor;
class TestProcessor {
  constructor() {
    this.messages = [];
    this.port = {
      onmessage: null,
      postMessage: (value, transfer = []) =>
        this.messages.push(structuredClone(value, { transfer })),
    };
  }
}
const config = {
  sourceGeneration: 1,
  timelineRevision: 0,
  processingRevision: 0,
  channelCount: 2,
  startSample: 100,
};
beforeAll(async () => {
  vi.stubGlobal("AudioWorkletProcessor", TestProcessor);
  vi.stubGlobal("sampleRate", 48000);
  vi.stubGlobal("currentFrame", 0);
  vi.stubGlobal("registerProcessor", (_name, processor) => {
    CaptureProcessor = processor;
  });
  await import("./audioPcmCapture.worklet.js");
});
afterAll(() => vi.unstubAllGlobals());

function create(options = {}) {
  vi.stubGlobal("currentFrame", 0);
  return new CaptureProcessor({
    processorOptions: { ...config, ...options },
  });
}
function command(p, message) {
  p.port.onmessage({ data: message });
}
function process(p, frame, count, input = null) {
  vi.stubGlobal("currentFrame", frame);
  const channels =
    input ??
    [1, -1].map((sign) =>
      Float32Array.from({ length: count }, (_, i) => sign * (frame + i)),
    );
  const output = [new Float32Array(count)];
  p.process([channels], [output]);
  expect(output[0].every((value) => value === 0)).toBe(true);
}
function blocks(p) {
  return p.messages.filter((m) => m.type === "pcm");
}
function returnBlock(p, packet) {
  command(p, {
    type: "recycle",
    slot: packet.slot,
    sequence: packet.sequence,
    buffers: packet.buffers,
  });
}
function samples(p, channel) {
  return blocks(p).flatMap((m) =>
    Array.from(new Float32Array(m.buffers[channel], 0, m.frameCount)),
  );
}

describe("bounded AudioWorklet PCM capture", () => {
  it.each([
    [44100, "worker"],
    [48000, "worker"],
    [44100, "return"],
    [48000, "return"],
  ])(
    "preserves PCM at %i Hz through repeated 500 ms %s delivery stalls",
    (rate, stalledEndpoint) => {
      vi.stubGlobal("sampleRate", rate);
      try {
        const p = create({ workerGeneration: 1, protocolVersion: 3 });
        const channel = createControlledMessageChannel();
        let receivedFrames = 0;
        let receivedPackets = 0;
        channel.port2.onmessage = ({ data }) => {
          if (data.type !== "pcm") return;
          expect(data.sequence).toBe(receivedPackets++);
          expect(data.startSample).toBe(config.startSample + receivedFrames);
          for (let a = 0; a < 2; a++)
            expect(
              new Float32Array(data.buffers[a], 0, data.frameCount),
            ).toEqual(
              Float32Array.from(
                { length: data.frameCount },
                (_, n) => (a === 0 ? 1 : -1) * (receivedFrames + n),
              ),
            );
          receivedFrames += data.frameCount;
          channel.port2.postMessage(
            { ...data, type: "recycle", accepted: { accepted: true } },
            data.buffers,
          );
        };
        command(p, { type: "connect-pcm", port: channel.port1 });
        command(p, { type: "start", contextFrame: 0 });
        let frame = 0;
        const pump = () => {
          process(p, frame, 128);
          frame += 128;
        };
        // Begin with a partially filled packet, not an empty-pool alignment.
        for (let n = 0; n < 3; n++) pump();
        for (let cycle = 0; cycle < 3; cycle++) {
          const end = frame + rate * 0.5;
          while (frame < end) {
            pump();
            if (stalledEndpoint === "return") channel.port2.flush();
          }
          expect(p.phase).toBe("running");
          channel.port2.flush();
          channel.port1.flush();
        }
        command(p, { type: "pause", contextFrame: frame });
        pump();
        channel.port2.flush();
        channel.port1.flush();
        expect(receivedFrames).toBe(frame - 128);
        expect(p.messages.map((m) => m.type)).toEqual(["started", "paused"]);
        expect(p.freeSlots).toHaveLength(p.slots.length);
      } finally {
        vi.stubGlobal("sampleRate", 48000);
      }
    },
  );

  it("integrates and recycles beyond pool capacity without servicing the display host", () => {
    const f = createAudioFeaturePacketFixture();
    const publications = [];
    let handle;
    const state = installFeatureWorkerHost({
      addEventListener: (_type, callback) => {
        handle = callback;
      },
      postMessage: (data, options = {}) =>
        publications.push(
          structuredClone(data, { transfer: options.transfer ?? [] }),
        ),
    });
    handle({ data: { ...f.initialization, type: "init" } });
    const channel = createControlledMessageChannel();
    handle({
      data: { ...f.topology, type: "connect-pcm", port: channel.port2 },
    });
    const p = create({ ...f.topology, startSample: 0 });
    command(p, { type: "connect-pcm", port: channel.port1 });
    command(p, { type: "start", contextFrame: 0 });
    const pump = (frame, count) =>
      process(
        p,
        frame,
        count,
        [0.017, 0.031].map((rate) =>
          Float32Array.from({ length: count }, (_, n) =>
            Math.sin((frame + n) * rate),
          ),
        ),
      );
    for (let n = 0; n < 100; n++) {
      pump(n * 512, 512);
      channel.port2.flush();
      channel.port1.flush();
    }
    expect(p.messages.filter((m) => m.type === "fault")).toEqual([]);
    expect(publications.filter((m) => m.type === "status")).toEqual([]);
    expect(p.phase).toBe("running");
    expect(state.acceptedBlocks).toBe(100);
    expect(state.acoustic.read().response.sampleIndex).toBe(51200);
    expect(p.messages.map((m) => m.type)).toEqual(["started"]);
    expect(publications.filter((m) => m.type === "status")).toHaveLength(0);
    // Real source edges share the same ordered stream as partial PCM.
    command(p, { type: "pause", contextFrame: 51273 });
    pump(51200, 128);
    channel.port2.flush();
    channel.port1.flush();
    expect(state.acoustic.read().phase).toBe("paused");
    expect(state.acoustic.read().response.sampleIndex).toBe(51273);
    const acceptedBlocks = state.acceptedBlocks;
    process(p, 51328, 512, []);
    expect(state.acceptedBlocks).toBe(acceptedBlocks);
    expect(p.freeSlots).toHaveLength(p.slots.length);
    command(p, { type: "resume", contextFrame: 52000 });
    command(p, { type: "end", contextFrame: 52073 });
    pump(51840, 256);
    channel.port2.flush();
    channel.port1.flush();
    expect(state.acoustic.read().phase).toBe("draining");
    expect(state.acoustic.read().response.sampleIndex).toBe(51346);
    expect(publications.at(-1).packet.sourcePhase).toBe("draining");
    expect(p.messages.every((m) => m.type !== "pcm")).toBe(true);
  });

  it("worker returns cannot command source startup or recover a fault", () => {
    const p = create({ workerGeneration: 1, protocolVersion: 3 });
    const channel = createControlledMessageChannel();
    command(p, { type: "connect-pcm", port: channel.port1 });
    channel.port2.postMessage({ type: "start", contextFrame: 0 });
    channel.port1.flush();
    expect(p.phase).toBe("faulted");
    command(p, { type: "start", contextFrame: 0 });
    process(p, 0, 512);
    expect(p.nextSample).toBe(config.startSample);
    expect(p.messages.at(-1).reason).toBe("invalid-pcm-return");
  });

  it("expands mono into identical stereo ensemble members without downmixing", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    const mono = Float32Array.from({ length: 512 }, (_, n) =>
      Math.sin(n * 0.17),
    );
    process(p, 0, 512, [mono]);
    expect(samples(p, 0)).toEqual(Array.from(mono));
    expect(samples(p, 1)).toEqual(Array.from(mono));
  });
  it("accounts for source and post-source samples at every packet boundary phase", () => {
    for (let phase = 0; phase < 512; phase++) {
      const end = 512 + phase;
      const p = create();
      command(p, { type: "start", contextFrame: 0 });
      command(p, { type: "end", contextFrame: end });
      command(p, { type: "pause", contextFrame: end + 513 });
      for (let frame = 0; frame < end + 513; frame += 256)
        process(p, frame, 256);
      const recorded = blocks(p).filter((b) => !b.postSourceSilence);
      const silent = blocks(p).filter((b) => b.postSourceSilence);
      expect(recorded.reduce((n, b) => n + b.frameCount, 0)).toBe(end);
      expect(silent.reduce((n, b) => n + b.frameCount, 0)).toBe(513);
      expect(
        silent.every((b) =>
          new Float32Array(b.buffers[0], 0, b.frameCount).every((x) => x === 0),
        ),
      ).toBe(true);
      expect(p.messages.filter((m) => m.type === "ended")).toHaveLength(1);
      expect(p.phase).toBe("paused");
    }
  });

  it("handles an empty source and a paused end without creating samples or duplicate tails", () => {
    const p = create({
      initialInterval: { startFrame: 0, endFrame: 0, pauseFrame: 0 },
    });
    process(p, 0, 128, []);
    expect(blocks(p)).toHaveLength(0);
    expect(p.messages.map((m) => m.type)).toEqual([
      "started",
      "ended",
      "paused",
    ]);
    command(p, { type: "end", contextFrame: 0 });
    expect(p.messages.filter((m) => m.type === "ended")).toHaveLength(1);
    const paused = create();
    command(paused, { type: "start", contextFrame: 0 });
    command(paused, { type: "pause", contextFrame: 73 });
    process(paused, 0, 128);
    command(paused, { type: "end" });
    expect(paused.phase).toBe("paused");
    command(paused, { type: "resume", contextFrame: 128 });
    command(paused, { type: "pause", contextFrame: 129 });
    process(paused, 128, 128, []);
    expect(blocks(paused)[1]).toMatchObject({
      postSourceSilence: true,
      frameCount: 1,
    });
  });
  it("splits source completion from clocked silence and holds a draining pause", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    command(p, { type: "end", contextFrame: 73 });
    command(p, { type: "pause", contextFrame: 190 });
    process(p, 0, 256);
    expect(p.messages.map((m) => m.type)).toEqual([
      "started",
      "pcm",
      "ended",
      "pcm",
      "paused",
    ]);
    expect(blocks(p)[0]).toMatchObject({
      frameCount: 73,
      postSourceSilence: false,
    });
    expect(blocks(p)[1]).toMatchObject({
      frameCount: 117,
      postSourceSilence: true,
      contextFrame: 73,
      startSample: 173,
    });
    expect(
      Array.from(new Float32Array(blocks(p)[1].buffers[0], 0, 117)),
    ).toEqual(Array(117).fill(0));
    process(p, 256, 128, []);
    expect(blocks(p)).toHaveLength(2);
    command(p, { type: "resume", contextFrame: 384 });
    command(p, { type: "pause", contextFrame: 897 });
    process(p, 384, 512, []);
    process(p, 896, 128, []);
    expect(
      blocks(p)
        .slice(2)
        .every((b) => b.postSourceSilence),
    ).toBe(true);
    expect(
      blocks(p)
        .slice(2)
        .reduce((s, b) => s + b.frameCount, 0),
    ).toBe(513);
    expect(p.messages.filter((m) => m.type === "ended")).toHaveLength(1);
  });
  it("arms a known offline interval before the rendering clock starts", () => {
    const p = create({ initialInterval: { startFrame: 31, endFrame: 127 } });
    process(p, 0, 128);
    expect(samples(p, 0)).toEqual(Array.from({ length: 96 }, (_, i) => 31 + i));
    expect(p.messages.map((m) => m.type)).toEqual(["started", "pcm", "ended"]);
    expect(() => create({ sampleRate: 44100 })).toThrow("configuration");
  });

  it("captures the exact scheduled interval across variable quanta without downmix", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 17 });
    command(p, { type: "end", contextFrame: 1103 });
    let cursor = 0;
    for (const length of [64, 128, 256, 512, 143, 64]) {
      process(p, cursor, length);
      cursor += length;
    }
    expect(blocks(p).map((m) => m.frameCount)).toEqual([512, 512, 62]);
    expect(blocks(p).map((m) => m.startSample)).toEqual([100, 612, 1124]);
    expect(blocks(p).map((m) => m.contextFrame)).toEqual([17, 529, 1041]);
    expect(blocks(p).map((m) => m.sequence)).toEqual([0, 1, 2]);
    const expected = Array.from({ length: 1086 }, (_, i) => i + 17);
    expect(samples(p, 0)).toEqual(expected);
    expect(samples(p, 1)).toEqual(expected.map((v) => -v));
    expect(p.messages.at(-1)).toMatchObject({
      type: "ended",
      startSample: 1186,
      nextSequence: 3,
      contextFrame: 1103,
    });
  });

  it("holds on pause, flushes its real partial block and resumes with an explicit cursor", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    command(p, { type: "pause", contextFrame: 73 });
    process(p, 0, 128);
    expect(p.messages.map((m) => m.type)).toEqual(["started", "pcm", "paused"]);
    process(p, 128, 512, []);
    expect(blocks(p)).toHaveLength(1);
    command(p, { type: "resume", contextFrame: 700, startSample: 1000 });
    command(p, { type: "end", contextFrame: 820 });
    process(p, 640, 256);
    expect(blocks(p)[1]).toMatchObject({
      startSample: 1000,
      contextFrame: 700,
      frameCount: 120,
      sequence: 1,
    });
    expect(samples(p, 0)).toEqual([
      ...Array.from({ length: 73 }, (_, i) => i),
      ...Array.from({ length: 120 }, (_, i) => i + 700),
    ]);
    expect(p.messages.filter((m) => m.type === "resumed")).toHaveLength(1);
  });

  it("accepts source disconnection at the scheduled pause edge without padding or a missing-input fault", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    command(p, { type: "pause", contextFrame: 512 });
    for (let frame = 0; frame < 512; frame += 128) process(p, frame, 128);
    process(p, 512, 128, []);
    expect(p.phase).toBe("paused");
    expect(
      p.messages.filter((message) => message.type === "fault"),
    ).toHaveLength(0);
    expect(samples(p, 0)).toEqual(Array.from({ length: 512 }, (_, i) => i));
    expect(p.messages.at(-1)).toMatchObject({
      type: "paused",
      contextFrame: 512,
      startSample: 612,
    });
  });

  it("cancels a pending source-end edge on pause and reschedules it after resume", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    command(p, { type: "end", contextFrame: 512 });
    command(p, { type: "pause", contextFrame: 73 });
    process(p, 0, 128);
    expect(p.sourceEndFrame).toBe(null);
    command(p, { type: "resume", contextFrame: 700 });
    command(p, { type: "end", contextFrame: 1139 });
    process(p, 640, 256);
    process(p, 896, 256);
    expect(
      p.messages.filter((message) => message.type === "fault"),
    ).toHaveLength(0);
    expect(
      p.messages.filter((message) => message.type === "ended"),
    ).toHaveLength(1);
    expect(
      blocks(p)
        .filter((block) => !block.postSourceSilence)
        .reduce((sum, block) => sum + block.frameCount, 0),
    ).toBe(512);
  });
  it("reuses the bounded pool; overrun faults once and recycling cannot restart it", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    const capacity = p.slots.length;
    for (let i = 0; i < capacity; i++) process(p, i * 512, 512);
    expect(blocks(p)).toHaveLength(capacity);
    returnBlock(p, blocks(p)[0]);
    process(p, capacity * 512, 512);
    expect(blocks(p)).toHaveLength(capacity + 1);
    expect(blocks(p).at(-1).slot).toBe(blocks(p)[0].slot);
    process(p, (capacity + 1) * 512, 512);
    expect(p.messages.at(-1)).toMatchObject({
      type: "fault",
      reason: "pool-exhausted",
      startSample: 100 + (capacity + 1) * 512,
    });
    returnBlock(p, blocks(p)[1]);
    process(p, (capacity + 2) * 512, 512);
    command(p, { type: "resume", contextFrame: (capacity + 3) * 512 });
    process(p, (capacity + 3) * 512, 512);
    expect(blocks(p)).toHaveLength(capacity + 1);
    expect(p.messages.filter((m) => m.type === "fault")).toHaveLength(1);
  });

  it.each([
    ["missing-input", []],
    [
      "channel-layout",
      [new Float32Array(128), new Float32Array(128), new Float32Array(128)],
    ],
    ["invalid-pcm", [new Float32Array(128).fill(NaN), new Float32Array(128)]],
  ])(
    "fails closed for %s without publishing a partial corrupt block",
    (reason, input) => {
      const p = create();
      command(p, { type: "start", contextFrame: 0 });
      process(p, 0, 128, input);
      expect(p.messages.at(-1)).toMatchObject({ type: "fault", reason });
      expect(blocks(p)).toHaveLength(0);
    },
  );

  it("rejects skipped callbacks and late scheduling instead of concealing a gap", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    process(p, 0, 128);
    process(p, 256, 128);
    expect(p.messages.at(-1)).toMatchObject({
      type: "fault",
      reason: "context-frame-gap",
    });
    const late = create();
    command(late, { type: "start", contextFrame: 17 });
    process(late, 128, 128);
    expect(late.messages.at(-1)).toMatchObject({
      type: "fault",
      reason: "late-start",
    });
  });

  it("accepts real zero samples and prevents duplicate buffer ownership", () => {
    const p = create({ channelCount: 1 });
    command(p, { type: "start", contextFrame: 0 });
    process(p, 0, 512, [new Float32Array(512)]);
    expect(samples(p, 0)).toEqual(Array(512).fill(0));
    const packet = blocks(p)[0];
    returnBlock(p, packet);
    returnBlock(p, packet);
    expect(p.messages.at(-1)).toMatchObject({
      type: "fault",
      reason: "invalid-recycle",
    });
  });

  it("rejects a stale return after the same pool slot has been loaned again", () => {
    const p = create();
    command(p, { type: "start", contextFrame: 0 });
    process(p, 0, 512);
    const old = blocks(p)[0];
    returnBlock(p, old);
    process(p, 512, 512);
    expect(blocks(p)[1].slot).toBe(old.slot);
    returnBlock(p, old);
    expect(p.messages.at(-1)).toMatchObject({
      type: "fault",
      reason: "invalid-recycle",
    });
  });
});
