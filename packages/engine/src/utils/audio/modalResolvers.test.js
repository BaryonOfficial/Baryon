import { describe, expect, it } from "vitest";
import { frequencyToBinIndex } from "./binFrequency.js";
import {
  findSpectralPeakFrequencies,
  HARMONIC_ORDERS,
} from "./modalResolvers.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;

function freqToBin(frequency) {
  return frequencyToBinIndex(frequency, BIN_COUNT, SAMPLE_RATE);
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    const bin = Math.max(1, Math.min(BIN_COUNT - 2, freqToBin(frequency)));
    fft[bin] = amplitude;
  }
  return fft;
}

describe("HARMONIC_ORDERS", () => {
  it("keeps the fundamental as the first supported order", () => {
    expect(HARMONIC_ORDERS[0]).toBe(1);
    expect(HARMONIC_ORDERS.length).toBeGreaterThan(1);
  });
});

describe("findSpectralPeakFrequencies", () => {
  it("returns isolated FFT peaks sorted by interpolated amplitude", () => {
    const peaks = findSpectralPeakFrequencies(
      makeFft([
        [220, 0.6],
        [440, 0.92],
        [1760, 0.7],
      ]),
      SAMPLE_RATE,
      FFT_SIZE,
      3,
      { minimumAmplitude: 0.1, minBinGapHz: 10 },
    );

    expect(peaks).toHaveLength(3);
    expect(peaks[0].frequency).toBeGreaterThan(430);
    expect(peaks[0].frequency).toBeLessThan(450);
    expect(peaks[1].frequency).toBeGreaterThan(1740);
    expect(peaks[1].frequency).toBeLessThan(1780);
    expect(peaks[2].frequency).toBeGreaterThan(200);
    expect(peaks[2].frequency).toBeLessThan(240);
    expect(peaks.map((peak) => peak.amplitude)).toEqual(
      [...peaks.map((peak) => peak.amplitude)].sort((a, b) => b - a),
    );
  });

  it("keeps separated regional peaks before filling remaining capacity", () => {
    const peaks = findSpectralPeakFrequencies(
      makeFft([
        [80, 0.9],
        [120, 0.88],
        [900, 0.4],
        [3200, 0.5],
      ]),
      SAMPLE_RATE,
      FFT_SIZE,
      3,
      {
        minimumAmplitude: 0.1,
        minBinGapHz: 10,
        regionRanges: [
          [40, 200],
          [800, 1200],
          [2800, 3600],
        ],
      },
    );

    expect(peaks[0].frequency).toBeGreaterThan(70);
    expect(peaks[0].frequency).toBeLessThan(90);
    expect(peaks[1].frequency).toBeGreaterThan(3180);
    expect(peaks[1].frequency).toBeLessThan(3220);
    expect(peaks[2].frequency).toBeGreaterThan(880);
    expect(peaks[2].frequency).toBeLessThan(920);
  });

  it("returns no peaks for invalid or silent inputs", () => {
    expect(findSpectralPeakFrequencies(null, SAMPLE_RATE, FFT_SIZE, 4)).toEqual(
      [],
    );
    expect(
      findSpectralPeakFrequencies(new Float32Array(BIN_COUNT), 0, FFT_SIZE, 4),
    ).toEqual([]);
    expect(
      findSpectralPeakFrequencies(
        new Float32Array(BIN_COUNT),
        SAMPLE_RATE,
        FFT_SIZE,
        0,
      ),
    ).toEqual([]);
  });
});
