import { describe, expect, it } from "vitest";
import {
  binIndexToFrequencyHz,
  frequencyToBin,
  frequencyToBinIndex,
} from "./binFrequency.js";

describe("binFrequency helpers", () => {
  describe("frequencyToBin", () => {
    it("maps 0 Hz to bin 0", () => {
      expect(frequencyToBin(0, 1024, 44100)).toBe(0);
    });

    it("maps nyquist to binCount (out of bounds, deliberately)", () => {
      expect(frequencyToBin(22050, 1024, 44100)).toBeCloseTo(1024);
    });

    it("recovers the Web Audio centre frequency of an arbitrary bin", () => {
      const binCount = 1024;
      const sampleRate = 44100;
      const fftSize = binCount * 2;
      // Web Audio: bin k centred on k * sampleRate / fftSize.
      const targetBin = 712;
      const webAudioFrequency = (targetBin * sampleRate) / fftSize;
      expect(
        frequencyToBin(webAudioFrequency, binCount, sampleRate),
      ).toBeCloseTo(targetBin);
    });

    it("returns 0 for invalid binCount or sampleRate", () => {
      expect(frequencyToBin(1000, 0, 44100)).toBe(0);
      expect(frequencyToBin(1000, 1024, 0)).toBe(0);
      expect(frequencyToBin(1000, -1, 44100)).toBe(0);
      expect(frequencyToBin(1000, 1024, Number.NaN)).toBe(0);
    });
  });

  describe("frequencyToBinIndex", () => {
    it("rounds to the nearest integer bin", () => {
      // Bin 100 of a 2048-pt FFT @ 44.1 kHz lives at 100 * 44100 / 2048
      // ≈ 2153.32 Hz. Asking for that frequency must return bin 100.
      expect(frequencyToBinIndex(2153.32, 1024, 44100)).toBe(100);
      expect(frequencyToBinIndex(2160, 1024, 44100)).toBe(100);
      expect(frequencyToBinIndex(2175, 1024, 44100)).toBe(101);
    });

    it("clamps frequencies at or above nyquist to the last bin", () => {
      expect(frequencyToBinIndex(22050, 1024, 44100)).toBe(1023);
      expect(frequencyToBinIndex(99999, 1024, 44100)).toBe(1023);
    });

    it("clamps negative frequencies to bin 0", () => {
      expect(frequencyToBinIndex(-1, 1024, 44100)).toBe(0);
    });

    it("returns 0 for invalid input", () => {
      expect(frequencyToBinIndex(Number.NaN, 1024, 44100)).toBe(0);
      expect(frequencyToBinIndex(1000, 0, 44100)).toBe(0);
      expect(frequencyToBinIndex(1000, 1024, 0)).toBe(0);
    });

    it("inverts cleanly for Web Audio centre frequencies", () => {
      const binCount = 512;
      const sampleRate = 48000;
      const fftSize = binCount * 2;
      for (const bin of [0, 1, 7, 100, 256, 400, 511]) {
        const f = (bin * sampleRate) / fftSize;
        expect(frequencyToBinIndex(f, binCount, sampleRate)).toBe(bin);
      }
    });
  });

  describe("binIndexToFrequencyHz", () => {
    it("returns 0 at bin 0", () => {
      expect(binIndexToFrequencyHz(0, 1024, 44100)).toBe(0);
    });

    it("matches the Web Audio bin centre formula", () => {
      const binCount = 1024;
      const sampleRate = 44100;
      const fftSize = binCount * 2;
      for (const bin of [1, 17, 256, 800, 1023]) {
        const expected = (bin * sampleRate) / fftSize;
        expect(binIndexToFrequencyHz(bin, binCount, sampleRate)).toBeCloseTo(
          expected,
          6,
        );
      }
    });

    it("handles fractional indices for peak interpolation", () => {
      const binCount = 1024;
      const sampleRate = 44100;
      const midwayFreq = (100.5 * sampleRate) / (binCount * 2);
      expect(binIndexToFrequencyHz(100.5, binCount, sampleRate)).toBeCloseTo(
        midwayFreq,
      );
    });

    it("returns 0 for invalid input", () => {
      expect(binIndexToFrequencyHz(Number.NaN, 1024, 44100)).toBe(0);
      expect(binIndexToFrequencyHz(10, 0, 44100)).toBe(0);
      expect(binIndexToFrequencyHz(10, 1024, 0)).toBe(0);
    });
  });

  describe("regression: high-frequency lookup is exact", () => {
    // This is the empirical bug from the bin-mapping audit: a peak placed at
    // the exact Web Audio centre of bin 950 must read back amplitude 1.0.
    it("locates a real Web Audio bin 950 peak", () => {
      const binCount = 1024;
      const sampleRate = 44100;
      const fftSize = binCount * 2;
      const targetFrequency = (950 * sampleRate) / fftSize; // ≈ 20456.54 Hz
      expect(frequencyToBinIndex(targetFrequency, binCount, sampleRate)).toBe(
        950,
      );
    });
  });
});
