import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioPcmCapture } from "./audioPcmCapture.js";

const configuration = {
  sourceGeneration: 1,
  timelineRevision: 0,
  processingRevision: 0,
  channelCount: 1,
};
let nodes;
beforeEach(() => {
  nodes = [];
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      constructor(context, name, options) {
        this.context = context;
        this.name = name;
        this.options = options;
        this.port = {
          onmessage: null,
          close: vi.fn(),
          postMessage: vi.fn((value, transfer = []) =>
            structuredClone(value, { transfer }),
          ),
        };
        this.connect = vi.fn();
        this.disconnect = vi.fn();
        nodes.push(this);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
function setup(overrides = {}) {
  return {
    context: {
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
    },
    source: { connect: vi.fn(), disconnect: vi.fn() },
    configuration,
    onBlock: vi.fn(),
    onEvent: vi.fn(),
    ...overrides,
  };
}
function packet() {
  return {
    ...configuration,
    type: "pcm",
    slot: 0,
    frameCount: 17,
    startSample: 0,
    contextFrame: 128,
    sequence: 0,
    buffers: [new Float32Array(512).fill(0.25).buffer],
  };
}

describe("session-owned PCM capture adapter", () => {
  it("attaches a silent branch once and removes only its edge on idempotent disposal", async () => {
    const args = setup();
    const capture = await createAudioPcmCapture(args);
    const node = nodes[0];
    expect(node.options).toMatchObject({
      channelCountMode: "max",
      channelInterpretation: "discrete",
      outputChannelCount: [1],
    });
    expect(args.source.connect).toHaveBeenCalledExactlyOnceWith(node);
    expect(node.connect).toHaveBeenCalledExactlyOnceWith(
      args.context.destination,
    );
    for (let i = 0; i < 20; i++) capture.read();
    expect(node.port.postMessage).not.toHaveBeenCalled();
    capture.dispose();
    capture.dispose();
    expect(args.source.disconnect).toHaveBeenCalledExactlyOnceWith(node);
    expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(() => capture.start()).toThrow("disposed");
  });

  it("transfers a direct endpoint before source commands and rejects competing consumers", async () => {
    const channel = new MessageChannel();
    const args = setup({
      configuration: {
        ...configuration,
        workerGeneration: 1,
        protocolVersion: 3,
      },
      onBlock: undefined,
      pcmPort: channel.port1,
    });
    const capture = await createAudioPcmCapture(args);
    expect(nodes[0].port.postMessage.mock.calls[0][0].type).toBe("connect-pcm");
    capture.start({ contextFrame: 512 });
    expect(nodes[0].port.postMessage.mock.calls[1][0]).toEqual({
      type: "start",
      contextFrame: 512,
    });
    capture.dispose();
    channel.port2.close();
    await expect(createAudioPcmCapture(setup({ pcmPort: {} }))).rejects.toThrow(
      "exactly one",
    );
    await expect(
      createAudioPcmCapture(setup({ onBlock: undefined, pcmPort: {} })),
    ).rejects.toThrow("worker epoch");
  });

  it("shares module installation without sharing capture state and cancels late attachment", async () => {
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const context = {
      destination: {},
      audioWorklet: { addModule: vi.fn(() => pending) },
    };
    const controller = new AbortController();
    const aborted = setup({ context, signal: controller.signal });
    const live = setup({ context });
    const first = createAudioPcmCapture(aborted);
    const second = createAudioPcmCapture(live);
    controller.abort();
    finish();
    await expect(first).rejects.toThrow();
    const capture = await second;
    expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(nodes).toHaveLength(1);
    expect(aborted.source.connect).not.toHaveBeenCalled();
    capture.dispose();
  });

  it("returns the same borrowed storage once and supports a worker transfer round trip", async () => {
    let borrowed, release;
    const args = setup({
      onBlock: (value, callback) => {
        borrowed = value;
        release = callback;
      },
    });
    const capture = await createAudioPcmCapture(args);
    const node = nodes[0];
    node.port.onmessage({ data: packet() });
    expect(borrowed.channels[0]).toHaveLength(17);
    expect(borrowed.channels[0][16]).toBe(0.25);
    expect(capture.read().inFlight).toBe(1);
    const returned = structuredClone(borrowed.buffers, {
      transfer: borrowed.buffers,
    });
    expect(borrowed.channels[0].byteLength).toBe(0);
    release(returned);
    release(returned);
    expect(node.port.postMessage).toHaveBeenCalledTimes(1);
    expect(capture.read().inFlight).toBe(0);
    expect(returned[0].byteLength).toBe(0);
    capture.dispose();
  });

  it("fails closed on consumer errors and never bootstraps from return or read", async () => {
    const args = setup({
      onBlock: () => {
        throw new Error("failed");
      },
    });
    const capture = await createAudioPcmCapture(args);
    nodes[0].port.onmessage({ data: packet() });
    expect(capture.read()).toMatchObject({
      disposed: true,
      phase: "faulted",
      inFlight: 0,
    });
    expect(args.onEvent).toHaveBeenCalledExactlyOnceWith({
      ...configuration,
      type: "fault",
      reason: "consumer-error: failed",
    });
    expect(() => capture.resume()).toThrow("disposed");
    expect(args.source.connect).toHaveBeenCalledTimes(1);
  });

  it("keeps the analysis clock and bounded loans alive after source completion", async () => {
    let release;
    const args = setup({
      onBlock: (_packet, callback) => {
        release = callback;
      },
    });
    const capture = await createAudioPcmCapture(args);
    nodes[0].port.onmessage({ data: packet() });
    nodes[0].port.onmessage({ data: { type: "ended", startSample: 17 } });
    expect(capture.read()).toMatchObject({
      disposed: false,
      phase: "draining",
      inFlight: 1,
    });
    release();
    expect(capture.read().inFlight).toBe(0);
    expect(nodes[0].port.postMessage).toHaveBeenCalledTimes(1);
    expect(nodes[0].port.postMessage.mock.calls[0][0].type).toBe("recycle");
    capture.dispose();
  });

  it("tears down a failed lifecycle consumer and rejects unobserved async dispatch", async () => {
    const events = setup({
      onEvent: () => {
        throw new Error("invalid transition");
      },
    });
    const first = await createAudioPcmCapture(events);
    nodes[0].port.onmessage({ data: { type: "resumed" } });
    expect(first.read()).toMatchObject({
      disposed: true,
      phase: "faulted",
      failure: "event-consumer-error: invalid transition",
    });
    const asynchronous = setup({ onBlock: async () => {} });
    const second = await createAudioPcmCapture(asynchronous);
    nodes[1].port.onmessage({ data: packet() });
    expect(second.read()).toMatchObject({
      disposed: true,
      phase: "faulted",
      inFlight: 0,
    });
    expect(second.read().failure).toContain("synchronously");
  });
});
