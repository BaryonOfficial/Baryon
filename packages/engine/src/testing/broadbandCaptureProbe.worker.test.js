import { afterEach, describe, expect, it, vi } from "vitest";
import { createBroadbandAudioState } from "../utils/audio/broadbandAudioState.js";
import { iterateAudioPcmBlocks } from "../core/audio/audioPcmStream.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../defaults.js";

afterEach(() => vi.unstubAllGlobals());

async function workerHarness(options, publishObservations = true) {
  vi.resetModules();
  const messages = [];
  const transfers = [];
  const scope = {
    onmessage: null,
    postMessage(message, { transfer = [] } = {}) {
      messages.push(structuredClone(message, { transfer }));
      transfers.push(transfer);
    },
  };
  vi.stubGlobal("self", scope);
  await import("./broadbandCaptureProbe.worker.js");
  const send = (data) => scope.onmessage({ data });
  send({ type: "initialize", options, publishObservations });
  expect(messages.at(-1)).toEqual({ type: "ready" });
  return { send, messages, transfers };
}

const snapshotArrays = (response) => [
  response.pressure,
  response.velocity,
  response.pressureMoments,
  response.velocityMoments,
  response.spectral.transitions,
  response.spectral.inputSpectrum,
  response.spectral.boundaryDelta,
];

describe("broadband worker publication ownership", () => {
  it.each([
    [1, false],
    [2, false],
    [1, true],
    [2, true],
  ])(
    "transfers complete snapshots without detaching live state (%i channels, nonlinear %s)",
    async (channelCount, nonlinear) => {
      const configuration = {
        sourceGeneration: 1,
        timelineRevision: 0,
        processingRevision: 0,
        sampleRate: 48000,
        channelCount,
      };
      const options = {
        configuration,
        shells: [
          { naturalFrequencyHz: 118.4, qualityFactor: 15 },
          { naturalFrequencyHz: 237.1, qualityFactor: 30 },
        ],
        cavityAcousticScale: {
          ...CAVITY_ACOUSTIC_DEFAULTS,
          ...(!nonlinear ? { incidentPeakPressurePascalAtFullScale: 0 } : {}),
        },
      };
      const h = await workerHarness(options);
      const reference = createBroadbandAudioState(options);
      const channels = Array.from({ length: channelCount }, (_, a) =>
        Float32Array.from(
          { length: 4099 },
          (_, n) => 0.2 * Math.sin(n * (0.017 + a * 0.003)),
        ),
      );
      let firstSnapshot;
      for (const packet of iterateAudioPcmBlocks(channels, configuration)) {
        reference.accept(packet);
        const buffers = packet.channels.map(
          (channel) => channel.slice().buffer,
        );
        const { channels: input, ...metadata } = packet;
        expect(input).toHaveLength(channelCount);
        h.send({ type: "pcm", packet: { ...metadata, buffers } });
        const message = h.messages.at(-1);
        expect(message.type).toBe("consumed");
        expect(message.accepted.accepted).toBe(true);
        expect(message.observation).toEqual(reference.read());
        expect(message.buffers.map((b) => new Float32Array(b))).toEqual(
          packet.channels,
        );
        // PCM loans and every independent snapshot array cross by transfer.
        expect(h.transfers.at(-1)).toHaveLength(channelCount + 7);
        expect(h.transfers.at(-1).every((b) => b.byteLength === 0)).toBe(true);
        expect(
          snapshotArrays(message.observation.response).every(
            (a) => a.length > 0,
          ),
        ).toBe(true);
        firstSnapshot ??= structuredClone(message.observation);
      }
      expect(h.messages[1].observation).toEqual(firstSnapshot);
      h.send({ type: "paused" });
      reference.pause();
      for (let i = 0; i < 3; i++) {
        h.send({ type: "read" });
        expect(h.messages.at(-1).observation).toEqual(reference.read());
        expect(h.transfers.at(-1)).toHaveLength(7);
      }
      const reset = {
        ...options,
        configuration: { ...configuration, sourceGeneration: 2 },
      };
      h.send({ type: "reset", options: reset });
      reference.reset(reset);
      h.send({ type: "read" });
      expect(h.messages.at(-1).observation).toEqual(reference.read());
      h.send({ type: "fault", reason: "lost-pcm" });
      h.send({ type: "read" });
      expect(h.messages.at(-1).observation.response).toBeNull();
      expect(h.transfers.at(-1)).toHaveLength(0);
    },
  );

  it("returns PCM loans without creating an unsolicited observation", async () => {
    const configuration = {
      sourceGeneration: 1,
      timelineRevision: 0,
      processingRevision: 0,
      sampleRate: 48000,
      channelCount: 1,
    };
    const h = await workerHarness(
      {
        configuration,
        shells: [{ naturalFrequencyHz: 118.4, qualityFactor: 15 }],
        cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
      },
      false,
    );
    h.send({
      type: "pcm",
      packet: {
        ...configuration,
        sequence: 0,
        startSample: 0,
        frameCount: 512,
        buffers: [new Float32Array(512).buffer],
      },
    });
    expect(h.messages.at(-1).observation).toBeUndefined();
    expect(h.transfers.at(-1)).toHaveLength(1);
    h.send({ type: "read" });
    expect(h.messages.at(-1).observation.response.sampleIndex).toBe(512);
    expect(h.transfers.at(-1)).toHaveLength(7);
  });
});
