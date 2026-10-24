import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import {
  initializeFeatureWorker,
  processFeatureWorkerPcm,
  processFeatureWorkerLifecycle,
} from "./audioFeatureEngine.worker.js";
import { isCompleteAudioFeatureModel } from "../../contracts/audioFeatureProtocol.js";
import { createControlledMessageChannel } from "../../testing/controlledMessageChannel.js";
import { createBroadbandAudioState } from "./broadbandAudioState.js";

function event(f, type, values = {}) {
  return { ...f.topology, type, ...values };
}
function independentState(f) {
  return createBroadbandAudioState({
    configuration: {
      ...f.initialization.configuration,
      sourceGeneration: f.topology.sourceGeneration,
    },
    shells: Array.from(
      f.topology.naturalFrequenciesHz,
      (naturalFrequencyHz, i) => ({
        naturalFrequencyHz,
        qualityFactor: f.topology.qualityFactors[i],
      }),
    ),
    exposureSeconds: f.topology.exposureSeconds,
    cavityAcousticScale: f.initialization.configuration.cavityAcousticScale,
  });
}

describe("production broadband worker", () => {
  it.each(["neumann", "dirichlet"])(
    "publishes every eligible %s family and full raw moments",
    (boundaryMode) => {
      const f = createAudioFeaturePacketFixture({
        configuration: { boundaryMode },
      });
      expect(f.topology.familyCount).toBe(boundaryMode === "neumann" ? 85 : 55);
      expect(f.topology.shellCount).toBe(boundaryMode === "neumann" ? 59 : 29);
      const reference = independentState(f);
      for (let n = 0; n < 3; n++) {
        const packet = f.pcm();
        reference.accept({
          ...packet,
          channels: packet.buffers.map((buffer) => new Float32Array(buffer)),
        });
        const result = processFeatureWorkerPcm(f.state, packet);
        expect(result.accepted).toBe(true);
        expect(
          isCompleteAudioFeatureModel({
            topology: f.topology,
            observation: result.observation,
          }),
        ).toBe(true);
        const expected = reference.read().response;
        for (const key of [
          "pressure",
          "velocity",
          "pressureMoments",
          "velocityMoments",
        ])
          expect(result.observation[key]).toEqual(expected[key]);
      }
      expect(f.state.acceptedBlocks).toBe(3);
      expect(f.state.topologyPublishCount).toBe(1);
    },
  );
  it("transfers independent publications without detaching live solver state", () => {
    const f = createAudioFeaturePacketFixture(),
      first = f.advance();
    structuredClone(first, {
      transfer: [
        first.pressure.buffer,
        first.velocity.buffer,
        first.pressureMoments.buffer,
        first.velocityMoments.buffer,
        first.spectrum.inputSpectrum.buffer,
        first.spectrum.boundaryDelta.buffer,
      ],
    });
    expect(first.pressure.length).toBe(0);
    expect(
      isCompleteAudioFeatureModel({
        topology: f.topology,
        observation: f.advance(),
      }),
    ).toBe(true);
    expect(f.state.frameId).toBe(2);
  });
  it("does not advance on pause/end/read and drains only accepted clocked silence", () => {
    const f = createAudioFeaturePacketFixture();
    const first = f.advance();
    const paused = processFeatureWorkerLifecycle(f.state, event(f, "paused"));
    expect(paused.sourcePhase).toBe("paused");
    expect(paused.endSample).toBe(first.endSample);
    expect(paused.pressureMoments).toEqual(first.pressureMoments);
    processFeatureWorkerLifecycle(
      f.state,
      event(f, "ended", { startSample: 512, nextSequence: 1 }),
    );
    expect(f.state.acoustic.read().response.sampleIndex).toBe(512);
    processFeatureWorkerLifecycle(
      f.state,
      event(f, "resumed", { startSample: 512, nextSequence: 1 }),
    );
    const drained = f.advance({ postSourceSilence: true });
    expect(drained.sourcePhase).toBe("draining");
    expect(drained.endSample).toBe(1024);
    expect(drained.pressure).not.toEqual(first.pressure);
  });
  it("represents nonlinear preparation delay once and never publishes unprepared input", () => {
    const f = createAudioFeaturePacketFixture({
      configuration: {
        cavityAcousticScale: {
          ...createAudioFeaturePacketFixture().initialization.configuration
            .cavityAcousticScale,
          incidentPeakPressurePascalAtFullScale: 100000,
        },
      },
    });
    for (let n = 0; n < 4; n++) expect(f.advance()).toBe(null);
    const observation = f.advance();
    expect(observation.endSample).toBe(512);
    expect(observation.inputEndSample).toBe(2560);
    expect(observation.preparationDelayFrames).toBe(2048);
  });
  it("rejects duplicates/stale epochs without consumption and gaps revoke the active response", () => {
    const f = createAudioFeaturePacketFixture(),
      packet = f.pcm();
    processFeatureWorkerPcm(f.state, packet);
    expect(processFeatureWorkerPcm(f.state, packet).accepted).toBe(false);
    expect(
      processFeatureWorkerPcm(f.state, { ...f.pcm(), sourceGeneration: 99 })
        .reason,
    ).toBe("generation-mismatch");
    expect(f.state.acoustic.read().response.sampleIndex).toBe(512);
    const gap = f.pcm();
    expect(processFeatureWorkerPcm(f.state, gap).discontinuity).toBe(true);
    expect(f.state.acoustic.read().response).toBe(null);
    expect(f.state.frameId).toBe(1);
  });
  it("fails closed for malformed current loans without harming state for stale loans", () => {
    const f = createAudioFeaturePacketFixture(),
      packet = f.pcm();
    expect(
      processFeatureWorkerPcm(f.state, {
        ...packet,
        workerGeneration: 99,
        buffers: [],
      }).accepted,
    ).toBe(false);
    expect(f.state.acoustic.read().phase).toBe("running");
    expect(() =>
      processFeatureWorkerPcm(f.state, { ...packet, buffers: [] }),
    ).toThrow(/loan/);
    expect(f.state.acoustic.read().response).toBe(null);
    expect(f.state.frameId).toBe(0);
  });
  it("only a newer explicit init can replace an epoch; invalid init is atomic", () => {
    const f = createAudioFeaturePacketFixture();
    f.advance();
    expect(initializeFeatureWorker(f.state, f.initialization)).toBe(null);
    expect(() =>
      initializeFeatureWorker(f.state, {
        ...f.initialization,
        workerGeneration: 2,
        configuration: { ...f.initialization.configuration, sampleRate: -1 },
      }),
    ).toThrow();
    expect(f.state.acoustic.read().response.sampleIndex).toBe(512);
    expect(
      initializeFeatureWorker(f.state, {
        ...f.initialization,
        workerGeneration: 2,
      }).workerGeneration,
    ).toBe(2);
    expect(f.state.acoustic.read().response.sampleIndex).toBe(0);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("worker entrypoint ownership", () => {
  it("does not install an audio message handler when numerical helpers are imported on a document host", async () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("document", {});
    vi.stubGlobal("self", { addEventListener });
    vi.resetModules();
    await import("./audioFeatureEngine.worker.js");
    expect(addEventListener).not.toHaveBeenCalled();
  });
  it("clones topology and returns each loan before transferring independent observations in the worker host", async () => {
    const f = createAudioFeaturePacketFixture();
    let handle;
    const messages = [];
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("self", {
      addEventListener: (type, listener) => {
        expect(type).toBe("message");
        handle = listener;
      },
      postMessage: (message, options = {}) =>
        messages.push(
          structuredClone(message, { transfer: options.transfer ?? [] }),
        ),
    });
    vi.resetModules();
    await import("./audioFeatureEngine.worker.js");
    handle({ data: { ...f.initialization, type: "init" } });
    const channel = createControlledMessageChannel();
    const returns = [];
    channel.port1.onmessage = ({ data }) => returns.push(data);
    handle({
      data: { ...f.topology, type: "connect-pcm", port: channel.port2 },
    });
    for (let i = 0; i < 2; i++) {
      const packet = { ...f.pcm(), type: "pcm", slot: i };
      channel.port1.postMessage(packet, packet.buffers);
    }
    channel.port2.flush();
    channel.port1.flush();
    expect(messages.map((m) => m.type)).toEqual([
      "topology-packet",
      "observation-packet",
      "observation-packet",
    ]);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toMatchObject({
      type: "recycle",
      slot: 0,
      sequence: 0,
      accepted: { accepted: true },
    });
    expect(returns[0].buffers[0].byteLength).toBe(2048);
    expect(
      isCompleteAudioFeatureModel({
        topology: messages[0].packet,
        observation: messages[2].packet,
      }),
    ).toBe(true);
    expect(messages[2].packet.endSample).toBe(1024);
  });
});
