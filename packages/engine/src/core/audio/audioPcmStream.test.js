import { describe, expect, it } from "vitest";
import {
  createAudioPcmStream,
  iterateAudioPcmBlocks,
} from "./audioPcmStream.js";

const configuration = {
  sourceGeneration: 1,
  timelineRevision: 0,
  processingRevision: 0,
  sampleRate: 48000,
  channelCount: 1,
};
function block(startSample = 0, sequence = 0, frames = 128) {
  return {
    ...configuration,
    startSample,
    sequence,
    frameCount: frames,
    channels: [new Float32Array(frames).fill(0.25)],
  };
}

describe("consecutive PCM owner", () => {
  it("consumes each sample once; duplicate packets and cached reads cannot replay it", () => {
    const stream = createAudioPcmStream(configuration);
    const consumed = [];
    const consume = (packet) => consumed.push(packet.startSample);
    expect(stream.accept(block(), consume).accepted).toBe(true);
    expect(stream.accept(block(), consume).reason).toBe("duplicate");
    for (let i = 0; i < 10; i++) stream.read();
    expect(stream.accept(block(128, 1, 64), consume).accepted).toBe(true);
    expect(consumed).toEqual([0, 128]);
    expect(stream.read().processedFrames).toBe(192);
  });

  it("faults on missing samples and requires an explicit new revision to recover", () => {
    const stream = createAudioPcmStream(configuration);
    stream.accept(block(), () => {});
    expect(stream.accept(block(256, 2), () => {}).discontinuity).toBe(true);
    expect(stream.accept(block(128, 1), () => {}).accepted).toBe(false);
    expect(() => stream.reset(configuration)).toThrow();
    stream.reset({ ...configuration, timelineRevision: 1, startSample: 256 });
    expect(
      stream.accept({ ...block(256), timelineRevision: 1 }, () => {}).accepted,
    ).toBe(true);
    expect(stream.accept(block(128, 1), () => {}).reason).toBe(
      "generation-mismatch",
    );
    expect(stream.read().processedFrames).toBe(128);
  });

  it("holds state on pause and rebases capture time without inventing silent samples", () => {
    const stream = createAudioPcmStream(configuration);
    let processed = 0;
    const consume = (packet) => {
      processed += packet.frameCount;
    };
    stream.accept(block(), consume);
    stream.pause();
    expect(stream.accept(block(128, 1), consume).reason).toBe("paused");
    stream.resume({ startSample: 48000, nextSequence: 1 });
    expect(stream.accept(block(128, 1), consume).reason).toBe("stale-block");
    expect(stream.accept(block(48000, 1), consume).accepted).toBe(true);
    expect(processed).toBe(256);
  });

  it("does not allow stale, malformed or failed processing to continue an asserted history", () => {
    const stream = createAudioPcmStream(configuration);
    expect(
      stream.accept({ ...block(), sourceGeneration: 2 }, () => {}).accepted,
    ).toBe(false);
    expect(stream.read().phase).toBe("running");
    const invalid = block();
    invalid.channels[0][8] = NaN;
    expect(
      stream.accept(invalid, () => {
        throw new Error("must not run");
      }).reason,
    ).toBe("invalid-pcm");
    stream.reset({ ...configuration, timelineRevision: 1 });
    expect(() =>
      stream.accept({ ...block(), timelineRevision: 1 }, () => {
        throw new Error("processor failed");
      }),
    ).toThrow("processor failed");
    expect(stream.read().phase).toBe("discontinuous");
  });

  it("iterates all decoded channels and the exact tail without overlap, padding or downmix", () => {
    const channels = [
      Float32Array.from({ length: 1003 }, (_, n) => n),
      Float32Array.from({ length: 1003 }, (_, n) => -n),
    ];
    const packets = [
      ...iterateAudioPcmBlocks(
        channels,
        { ...configuration, channelCount: 2 },
        256,
      ),
    ];
    expect(packets.map((packet) => packet.frameCount)).toEqual([
      256, 256, 256, 235,
    ]);
    expect(packets.map((packet) => packet.startSample)).toEqual([
      0, 256, 512, 768,
    ]);
    expect(packets.map((packet) => packet.sequence)).toEqual([0, 1, 2, 3]);
    expect(packets[3].channels[1][234]).toBe(-1002);
  });

  it("marks source completion once without advancing a paused stream", () => {
    const stream = createAudioPcmStream(configuration);
    stream.accept(block(), () => {});
    const marker = { ...configuration, startSample: 128, nextSequence: 1 };
    stream.pause();
    expect(stream.end({ ...marker, timelineRevision: 1 }).accepted).toBe(false);
    expect(stream.end(marker).accepted).toBe(true);
    expect(stream.read().phase).toBe("paused");
    expect(stream.end(marker).reason).toBe("source-ended");
    stream.resume({ startSample: 128, nextSequence: 1 });
    expect(stream.accept(block(128, 1), () => {}).reason).toBe("source-ended");
    const silent = { ...block(128, 1), postSourceSilence: true };
    silent.channels[0].fill(0);
    expect(stream.accept(silent, () => {}).accepted).toBe(true);
    expect(stream.read()).toMatchObject({
      phase: "draining",
      sourceFrames: 128,
      postSourceFrames: 128,
    });
    stream.reset({ ...configuration, timelineRevision: 1 });
    expect(stream.end({ ...marker, timelineRevision: 1 }).reason).toBe(
      "end-cursor-mismatch",
    );
    expect(stream.read().phase).toBe("discontinuous");
  });

  it("rejects fabricated silence and nonzero post-source packets", () => {
    const stream = createAudioPcmStream(configuration);
    expect(
      stream.accept({ ...block(), postSourceSilence: true }, () => {}).reason,
    ).toBe("invalid-post-source-silence");
    stream.reset({ ...configuration, timelineRevision: 1 });
    stream.end({
      ...configuration,
      timelineRevision: 1,
      startSample: 0,
      nextSequence: 0,
    });
    expect(
      stream.accept(
        { ...block(), timelineRevision: 1, postSourceSilence: true },
        () => {},
      ).reason,
    ).toBe("invalid-post-source-silence");
    expect(stream.read().processedFrames).toBe(0);
  });
});
