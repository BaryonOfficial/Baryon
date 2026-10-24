import { describe, expect, it } from "vitest";
import { createBroadbandAudioState } from "./broadbandAudioState.js";
import { createBroadbandModalResponse } from "./broadbandModalResponse.js";
import { createAcousticDcBlocker } from "./streamingAcousticDrive.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { iterateAudioPcmBlocks } from "../../core/audio/audioPcmStream.js";

const configuration = {
  sourceGeneration: 1,
  timelineRevision: 0,
  processingRevision: 0,
  sampleRate: 48000,
  channelCount: 2,
};
const shells = [
  { naturalFrequencyHz: 118.4, qualityFactor: 15 },
  { naturalFrequencyHz: 237.1, qualityFactor: 30 },
];
const options = {
  configuration,
  shells,
  exposureSeconds: 0.05,
  cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
};
function fixture(frames) {
  return [1, -0.7].map((gain) =>
    Float32Array.from(
      { length: frames },
      (_, n) => gain * (0.2 + Math.sin(n * 0.017)),
    ),
  );
}

describe("single-writer broadband audio state", () => {
  it("continues the complete nonlinear tail on known silence without advancing at end or during pause", () => {
    const nonlinear = {
      ...options,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    };
    const state = createBroadbandAudioState(nonlinear);
    const input = fixture(1027);
    const packets = [...iterateAudioPcmBlocks(input, configuration)];
    packets.forEach((p) => state.accept(p));
    const before = state.read().response;
    const marker = {
      ...configuration,
      startSample: 1027,
      nextSequence: packets.length,
    };
    expect(state.end(marker).accepted).toBe(true);
    expect(state.read().response).toEqual(before);
    expect(state.read().phase).toBe("draining");
    expect(state.end(marker).accepted).toBe(false);
    state.pause();
    const silenceConfiguration = {
      ...configuration,
      startSample: 1027,
      nextSequence: packets.length,
    };
    const silence = [
      ...iterateAudioPcmBlocks(
        [new Float32Array(8192), new Float32Array(8192)],
        silenceConfiguration,
      ),
    ];
    expect(
      state.accept({ ...silence[0], postSourceSilence: true }).accepted,
    ).toBe(false);
    expect(state.read().response).toEqual(before);
    state.resume({ startSample: 1027, nextSequence: packets.length });
    for (const p of silence)
      expect(state.accept({ ...p, postSourceSilence: true }).accepted).toBe(
        true,
      );
    const continuous = createBroadbandAudioState(nonlinear);
    [...packets, ...silence].forEach((p) => continuous.accept(p));
    expect(state.read().response).toEqual(continuous.read().response);
    expect(state.read()).toMatchObject({
      sourceFrames: 1027,
      postSourceFrames: 8192,
    });
    expect(state.read().response.sampleIndex).toBe(1027 + 8192 - 2048);
    const held = state.read();
    for (let i = 0; i < 10; i++) expect(state.read()).toEqual(held);
    state.reset({
      ...nonlinear,
      configuration: { ...configuration, sourceGeneration: 2 },
    });
    expect(
      state.accept({ ...silence[0], postSourceSilence: true }).reason,
    ).toBe("generation-mismatch");
    expect(state.read().response.sampleIndex).toBe(0);
    expect(state.read().response.spectral.frameEndSample).toBe(0);
    expect(
      state.read().response.spectral.inputSpectrum.every((x) => x === 0) &&
        state.read().response.spectral.boundaryDelta.every((x) => x === 0),
    ).toBe(true);
  });
  it("revokes observations immediately when capture reports a lost interval", () => {
    const state = createBroadbandAudioState(options);
    const packet = [...iterateAudioPcmBlocks(fixture(512), configuration)][0];
    state.accept(packet);
    state.invalidate("pool-exhausted");
    expect(state.read()).toMatchObject({
      phase: "discontinuous",
      fault: "pool-exhausted",
      response: null,
    });
    expect(
      state.accept({ ...packet, sequence: 1, startSample: 512 }).accepted,
    ).toBe(false);
  });
  it("matches complete PCM preparation and response regardless of delivery partitions", () => {
    const input = fixture(2051);
    const prepared = input.map((channel) => new Float64Array(channel.length));
    createAcousticDcBlocker(configuration).process(input, prepared);
    const reference = createBroadbandModalResponse({
      ...configuration,
      shells,
    });
    reference.advance(prepared);
    for (const blockFrames of [64, 128, 256, 512, 73, 2051]) {
      const state = createBroadbandAudioState(options);
      for (const packet of iterateAudioPcmBlocks(
        input,
        configuration,
        blockFrames,
      ))
        expect(state.accept(packet).accepted).toBe(true);
      expect(state.read().response).toEqual(reference.read());
      expect(state.read().processedFrames).toBe(2051);
    }
  });

  it("holds preparation and response during pause and never reprocesses a publication", () => {
    const state = createBroadbandAudioState(options);
    const packets = [...iterateAudioPcmBlocks(fixture(1024), configuration)];
    state.accept(packets[0]);
    const before = state.read().response;
    state.pause();
    expect(state.accept(packets[1]).accepted).toBe(false);
    for (let i = 0; i < 10; i++) expect(state.read().response).toEqual(before);
    state.resume({ startSample: 10000, nextSequence: 1 });
    state.accept({ ...packets[1], startSample: 10000 });
    const continuous = createBroadbandAudioState(options);
    packets.forEach((packet) => continuous.accept(packet));
    expect(state.read().response).toEqual(continuous.read().response);
    expect(state.read().nextSample).toBe(10512);
  });

  it("revokes faulted history and resets all dependent state atomically on seek/replacement", () => {
    const state = createBroadbandAudioState(options);
    const packet = [...iterateAudioPcmBlocks(fixture(512), configuration)][0];
    state.accept(packet);
    expect(
      state.accept({ ...packet, sequence: 2, startSample: 1024 }).discontinuity,
    ).toBe(true);
    expect(state.read().response).toBe(null);
    const next = { ...configuration, timelineRevision: 1, startSample: 24000 };
    expect(() =>
      state.reset({ ...options, configuration: next, shells: [] }),
    ).toThrow();
    expect(state.read().timelineRevision).toBe(0);
    state.reset({ ...options, configuration: next });
    expect(state.read().response.pressure.every((value) => value === 0)).toBe(
      true,
    );
    expect(state.accept(packet).reason).toBe("generation-mismatch");
    const first = { ...packet, ...next };
    expect(state.accept(first).accepted).toBe(true);
    const fresh = createBroadbandAudioState({
      ...options,
      configuration: next,
    });
    fresh.accept(first);
    expect(state.read()).toEqual(fresh.read());
    expect(() => state.reset(options)).toThrow("newer");
  });

  it("holds nonlinear overlap across a pause and resets it on a processing revision", () => {
    const nonlinear = {
      ...options,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    };
    const packets = [...iterateAudioPcmBlocks(fixture(4096), configuration)];
    const state = createBroadbandAudioState(nonlinear);
    packets.slice(0, 3).forEach((p) => state.accept(p));
    state.pause();
    state.resume({ startSample: 10000, nextSequence: 3 });
    packets.slice(3).forEach((p) =>
      state.accept({
        ...p,
        startSample: 10000 + p.startSample - 1536,
      }),
    );
    const whole = createBroadbandAudioState(nonlinear);
    packets.forEach((p) => whole.accept(p));
    expect(state.read().response).toEqual(whole.read().response);
    expect(state.read().preparation).toEqual(whole.read().preparation);
    const next = { ...configuration, processingRevision: 1 };
    state.reset({ ...options, configuration: next });
    expect(state.read().preparation).toMatchObject({
      active: false,
      inputFrames: 0,
      delayFrames: 0,
    });
    state.accept({ ...packets[0], processingRevision: 1 });
    expect(state.read().response.sampleIndex).toBe(512);
  });
});
