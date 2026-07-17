import { describe, expect, it, vi } from "vitest";
import {
  computeRms,
  createNodeAnalyser,
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
    expect(snapshot.fftLinearAmplitudes[0]).toBe(0);
    expect(snapshot.fftLinearAmplitudes[1]).toBeCloseTo(128 / 255);
    expect(snapshot.fftLinearAmplitudes[2]).toBe(1);
    expect(snapshot.fftLinearAmplitudes[3]).toBeCloseTo(64 / 255);
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
    expect(snapshot.fftLinearAmplitudes[1]).toBeCloseTo(64 / 255);
    expect(snapshot.rms).toBeCloseTo(0.25);
  });

  it("disables native analyser smoothing so decay stays owned by the visualizer", () => {
    const analyserNode = {
      fftSize: 0,
      frequencyBinCount: 4,
      smoothingTimeConstant: 0.8,
      getFloatFrequencyData(data) {
        data.fill(-100);
      },
      getFloatTimeDomainData(data) {
        data.fill(0);
      },
    };
    const audioCtx = {
      createAnalyser: vi.fn(() => analyserNode),
    };
    const sourceNode = {
      connect: vi.fn(),
    };

    createNodeAnalyser(audioCtx, sourceNode, 8);

    expect(analyserNode.fftSize).toBe(8);
    expect(analyserNode.smoothingTimeConstant).toBe(0);
    expect(sourceNode.connect).toHaveBeenCalledWith(analyserNode);
  });

  it("publishes Web Audio decibels as linear FFT amplitude while preserving the legacy meter", () => {
    const analyserNode = {
      fftSize: 0,
      frequencyBinCount: 4,
      smoothingTimeConstant: 0.8,
      minDecibels: -100,
      maxDecibels: -30,
      getFloatFrequencyData(data) {
        data.set([-100, -60, -40, -30]);
      },
      getFloatTimeDomainData(data) {
        data.fill(0);
      },
    };
    const analyser = createNodeAnalyser(
      { createAnalyser: () => analyserNode },
      { connect: vi.fn() },
      8,
    );

    const snapshot = sampleAnalyser(analyser);

    expect(snapshot.fftLinearAmplitudes[0]).toBe(0);
    expect(snapshot.fftLinearAmplitudes[1]).toBeCloseTo(0.001, 8);
    expect(snapshot.fftLinearAmplitudes[2]).toBeCloseTo(0.01, 8);
    expect(snapshot.fftLinearAmplitudes[3]).toBeCloseTo(10 ** (-30 / 20), 8);
    expect(snapshot.avgAmplitude).toBeCloseTo(
      ((0 + 40 / 70 + 60 / 70 + 1) / 4) * 255,
      5,
    );
  });

  it("keeps the legacy meter owned by raw decibels when linear amplitude clips", () => {
    const analyserNode = {
      fftSize: 0,
      frequencyBinCount: 1,
      minDecibels: -100,
      maxDecibels: 10,
      getFloatFrequencyData(data) {
        data[0] = 10;
      },
      getFloatTimeDomainData(data) {
        data.fill(0);
      },
    };
    const snapshot = sampleAnalyser(
      createNodeAnalyser(
        { createAnalyser: () => analyserNode },
        { connect: vi.fn() },
        8,
      ),
    );

    expect(snapshot.fftLinearAmplitudes[0]).toBe(1);
    expect(snapshot.avgAmplitude).toBe(255);
  });

  it("matches float and byte analyser amplitude at the acquisition boundary", () => {
    const makeNode = (useFloat) => ({
      fftSize: 0,
      frequencyBinCount: 3,
      minDecibels: -100,
      maxDecibels: -30,
      ...(useFloat
        ? {
            getFloatFrequencyData(data) {
              data.set([-100, -65, -30]);
            },
          }
        : {
            getByteFrequencyData(data) {
              data.set([0, 128, 255]);
            },
          }),
      getFloatTimeDomainData(data) {
        data.fill(0);
      },
    });
    const sample = (node) =>
      sampleAnalyser(
        createNodeAnalyser(
          { createAnalyser: () => node },
          { connect: vi.fn() },
          8,
        ),
      );

    const floatSnapshot = sample(makeNode(true));
    const byteSnapshot = sample(makeNode(false));

    expect(byteSnapshot.fftLinearAmplitudes[0]).toBe(0);
    expect(byteSnapshot.fftLinearAmplitudes[1]).toBeCloseTo(
      floatSnapshot.fftLinearAmplitudes[1],
      3,
    );
    expect(byteSnapshot.fftLinearAmplitudes[2]).toBeCloseTo(
      floatSnapshot.fftLinearAmplitudes[2],
      8,
    );
    expect(byteSnapshot.avgAmplitude).toBeCloseTo(127.67, 1);
  });

  it("treats unresolved and non-finite analyser bins as zero amplitude", () => {
    const analyserNode = {
      fftSize: 0,
      frequencyBinCount: 4,
      minDecibels: -100,
      maxDecibels: -30,
      getFloatFrequencyData(data) {
        data.set([Number.NEGATIVE_INFINITY, Number.NaN, -101, -100]);
      },
      getFloatTimeDomainData(data) {
        data.fill(0);
      },
    };
    const snapshot = sampleAnalyser(
      createNodeAnalyser(
        { createAnalyser: () => analyserNode },
        { connect: vi.fn() },
        8,
      ),
    );

    expect(Array.from(snapshot.fftLinearAmplitudes)).toEqual([0, 0, 0, 0]);
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

    expect(second.fftLinearAmplitudes).toBe(first.fftLinearAmplitudes);
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
    expect(snapshot.fftLinearAmplitudes[1]).toBeCloseTo(0.5);
    expect(snapshot.fftLinearAmplitudes[2]).toBeCloseTo(1.0);
    expect(snapshot.fftLinearAmplitudes[3]).toBeCloseTo(0.25);
  });

  it("computes rms correctly for a known uniform signal", () => {
    // RMS of a constant signal k is k
    const uniform = new Float32Array(8).fill(0.6);
    expect(computeRms(uniform)).toBeCloseTo(0.6);
  });
});
