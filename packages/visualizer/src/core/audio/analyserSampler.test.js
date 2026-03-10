import { describe, expect, it } from "vitest";
import {
  computeRms,
  createAnalyserReader,
  sampleAnalyser,
} from "./analyserSampler.js";

function createAnalyserHarness() {
  return {
    analyser: {
      fftSize: 4,
      getFloatTimeDomainData(data) {
        data.set([0.5, -0.5, 0.5, -0.5]);
      },
    },
    getAverageFrequency() {
      return 128;
    },
    getFrequencyData() {
      return new Uint8Array([0, 128, 255, 64]);
    },
  };
}

describe("analyser sampler", () => {
  it("normalizes fft data and computes rms from time-domain samples", () => {
    const snapshot = sampleAnalyser(createAnalyserHarness());

    expect(snapshot.avgAmplitude).toBe(128);
    expect(snapshot.fftMagnitudes[0]).toBe(0);
    expect(snapshot.fftMagnitudes[1]).toBeCloseTo(128 / 255);
    expect(snapshot.fftMagnitudes[2]).toBe(1);
    expect(snapshot.fftMagnitudes[3]).toBeCloseTo(64 / 255);
    expect(snapshot.rms).toBeCloseTo(0.5);
  });

  it("returns null when no analyser is available", () => {
    expect(sampleAnalyser(null)).toBeNull();
  });

  it("builds a reusable analyser reader around a shared node", () => {
    const analyserNode = {
      fftSize: 4,
      frequencyBinCount: 4,
      getFloatTimeDomainData(data) {
        data.set([0.25, 0.25, 0.25, 0.25]);
      },
    };

    const analyser = createAnalyserReader(analyserNode, (data) => {
      data.set([0, 64, 128, 255]);
      return data;
    });
    const snapshot = sampleAnalyser(analyser);

    expect(snapshot.avgAmplitude).toBeCloseTo((0 + 64 + 128 + 255) / 4);
    expect(snapshot.fftMagnitudes[1]).toBeCloseTo(64 / 255);
    expect(snapshot.rms).toBeCloseTo(0.25);
  });

  it("computes rms defensively for empty input", () => {
    expect(computeRms(null)).toBe(0);
    expect(computeRms(new Float32Array(0))).toBe(0);
  });
});
