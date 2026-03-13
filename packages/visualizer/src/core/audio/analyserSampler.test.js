import { describe, expect, it, vi } from "vitest";
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

  it("reads frequency data once per sample when using a reusable analyser reader", () => {
    const analyserNode = {
      fftSize: 4,
      frequencyBinCount: 4,
      getFloatTimeDomainData(data) {
        data.set([0.25, 0.25, 0.25, 0.25]);
      },
    };
    const readFrequencyData = vi.fn((data) => {
      data.set([0, 64, 128, 255]);
      return data;
    });
    const analyser = createAnalyserReader(analyserNode, readFrequencyData);

    const snapshot = sampleAnalyser(analyser);

    expect(readFrequencyData).toHaveBeenCalledTimes(1);
    expect(snapshot.avgAmplitude).toBeCloseTo((0 + 64 + 128 + 255) / 4);
  });

  it("reuses fft and time-domain buffers across analyser samples", () => {
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

    const first = sampleAnalyser(analyser);
    const second = sampleAnalyser(analyser);

    expect(second.fftMagnitudes).toBe(first.fftMagnitudes);
    expect(second.timeData).toBe(first.timeData);
  });

  it("computes rms defensively for empty input", () => {
    expect(computeRms(null)).toBe(0);
    expect(computeRms(new Float32Array(0))).toBe(0);
  });

  it("passes through already-normalised float values without dividing by 255", () => {
    // normaliseSpectrum uses value > 1 as the gate for byte-range data.
    // Float values in [0, 1] must not be scaled.
    const floatAnalyser = {
      analyser: {
        fftSize: 4,
        getFloatTimeDomainData(data) {
          data.set([0, 0, 0, 0]);
        },
      },
      getAverageFrequency() {
        return 0;
      },
      getFrequencyData() {
        // Return floats all ≤ 1 — should be passed through unchanged
        return new Float32Array([0, 0.5, 1.0, 0.25]);
      },
    };

    const snapshot = sampleAnalyser(floatAnalyser);
    expect(snapshot.fftMagnitudes[1]).toBeCloseTo(0.5);
    expect(snapshot.fftMagnitudes[2]).toBeCloseTo(1.0);
    expect(snapshot.fftMagnitudes[3]).toBeCloseTo(0.25);
  });

  it("computes rms correctly for a known uniform signal", () => {
    // RMS of a constant signal k is k
    const uniform = new Float32Array(8).fill(0.6);
    expect(computeRms(uniform)).toBeCloseTo(0.6);
  });
});
