import { describe, expect, it } from "vitest";
import { createDecodedAudioAnalysisSource } from "./decodedAudioAnalysis.js";

function createBuffer({
  sampleRate = 48_000,
  durationSeconds = 1,
  channels = 1,
  sample = () => 0,
} = {}) {
  const length = Math.round(sampleRate * durationSeconds);
  const channelData = Array.from({ length: channels }, (_, channel) => {
    const data = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      data[index] = sample(index / sampleRate, channel);
    }
    return data;
  });
  return {
    sampleRate,
    length,
    numberOfChannels: channels,
    getChannelData(channel) {
      return channelData[channel];
    },
  };
}

describe("decoded audio analysis", () => {
  it("resolves a file spectrum before playback begins", () => {
    const source = createDecodedAudioAnalysisSource(
      createBuffer({
        sample: (time) => Math.sin(2 * Math.PI * 750 * time),
      }),
      { fastFftSize: 2048, structuralFftSize: 8192 },
    );
    const capture = source.sample(0, { includeStructural: true });
    const binHz = 48_000 / 8192;
    const targetBin = Math.round(750 / binHz);

    expect(capture.fast.rms).toBeGreaterThan(0);
    expect(capture.structural.fftLinearAmplitudes[targetBin]).toBeGreaterThan(
      0.7,
    );
  });

  it("downmixes all channels deterministically", () => {
    const source = createDecodedAudioAnalysisSource(
      createBuffer({
        channels: 2,
        sample: (time, channel) =>
          channel === 0
            ? Math.sin(2 * Math.PI * 375 * time)
            : Math.sin(2 * Math.PI * 1125 * time),
      }),
      { fastFftSize: 2048, structuralFftSize: 4096 },
    );
    const capture = source.sample(0.5, { includeStructural: true });
    const binHz = 48_000 / 4096;

    expect(
      capture.structural.fftLinearAmplitudes[Math.round(375 / binHz)],
    ).toBeGreaterThan(0.35);
    expect(
      capture.structural.fftLinearAmplitudes[Math.round(1125 / binHz)],
    ).toBeGreaterThan(0.35);
  });

  it("returns bit-identical captures for the same audio timestamp", () => {
    const source = createDecodedAudioAnalysisSource(
      createBuffer({
        sample: (time) =>
          0.6 * Math.sin(2 * Math.PI * 440 * time) +
          0.2 * Math.sin(2 * Math.PI * 880 * time),
      }),
      { fastFftSize: 2048, structuralFftSize: 8192 },
    );
    const first = source.sample(0.375, { includeStructural: true });
    const second = source.sample(0.375, { includeStructural: true });

    expect(second.fast.timeData).toEqual(first.fast.timeData);
    expect(second.fast.fftLinearAmplitudes).toEqual(
      first.fast.fftLinearAmplitudes,
    );
    expect(second.structural.fftLinearAmplitudes).toEqual(
      first.structural.fftLinearAmplitudes,
    );
  });

  it("clamps the complete observation aperture at the file boundary", () => {
    const source = createDecodedAudioAnalysisSource(
      createBuffer({ sample: () => 0.5 }),
      { fastFftSize: 8, structuralFftSize: 16 },
    );
    const start = source.sample(0, { includeStructural: false });
    const later = source.sample(8 / 48_000, { includeStructural: false });

    expect(Array.from(start.fast.timeData)).toEqual([
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
    expect(Array.from(later.fast.timeData)).toEqual([
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
  });
});
