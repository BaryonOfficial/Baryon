import { describe, expect, it } from "vitest";
import {
  scoreHarmonicSalience,
  annotatePeakSalience,
} from "./harmonicSalience.js";

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE; // ~10.77 Hz per bin

function makeFFT(peaks) {
  // peaks: [[frequencyHz, magnitude], ...]
  const bins = FFT_SIZE / 2;
  const fft = new Float32Array(bins);
  for (const [freq, mag] of peaks) {
    const bin = Math.round(freq / BIN_HZ);
    if (bin >= 0 && bin < bins) fft[bin] = mag;
  }
  return fft;
}

describe("scoreHarmonicSalience", () => {
  it("returns 0 when fftMagnitudes is null", () => {
    expect(scoreHarmonicSalience(200, null, SAMPLE_RATE, FFT_SIZE)).toBe(0);
  });

  it("returns 0 when fftMagnitudes is all-zero", () => {
    const fft = new Float32Array(FFT_SIZE / 2);
    expect(scoreHarmonicSalience(200, fft, SAMPLE_RATE, FFT_SIZE)).toBe(0);
  });

  it("returns 0 for zero frequency", () => {
    const fft = makeFFT([[200, 0.8]]);
    expect(scoreHarmonicSalience(0, fft, SAMPLE_RATE, FFT_SIZE)).toBe(0);
  });

  it("returns 0 for negative frequency", () => {
    const fft = makeFFT([[200, 0.8]]);
    expect(scoreHarmonicSalience(-100, fft, SAMPLE_RATE, FFT_SIZE)).toBe(0);
  });

  it("returns 0 when sampleRate is 0", () => {
    const fft = makeFFT([[200, 0.8]]);
    expect(scoreHarmonicSalience(200, fft, 0, FFT_SIZE)).toBe(0);
  });

  it("returns > 0 when fundamental and several harmonics are present", () => {
    // 200 Hz with harmonics at 200, 400, 600, 800, 1000, 1200
    const fft = makeFFT([
      [200, 0.9],
      [400, 0.7],
      [600, 0.5],
      [800, 0.35],
      [1000, 0.25],
      [1200, 0.15],
    ]);
    const score = scoreHarmonicSalience(200, fft, SAMPLE_RATE, FFT_SIZE);
    expect(score).toBeGreaterThan(0);
  });

  it("result is in [0, 1] range", () => {
    const fft = makeFFT([
      [200, 1.0],
      [400, 1.0],
      [600, 1.0],
      [800, 1.0],
      [1000, 1.0],
      [1200, 1.0],
    ]);
    const score = scoreHarmonicSalience(200, fft, SAMPLE_RATE, FFT_SIZE);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores a genuine fundamental higher than an isolated overtone at the same amplitude", () => {
    // 200 Hz fundamental with full harmonic series
    const fundamentalFFT = makeFFT([
      [200, 0.8],
      [400, 0.7],
      [600, 0.5],
      [800, 0.35],
      [1000, 0.25],
      [1200, 0.15],
    ]);
    const fundamentalScore = scoreHarmonicSalience(
      200,
      fundamentalFFT,
      SAMPLE_RATE,
      FFT_SIZE,
    );

    // 400 Hz overtone (2nd harmonic of 200 Hz) — same amplitude at 400 Hz,
    // but no independent odd harmonics at 1200 Hz, 2000 Hz (600 Hz overlaps 200's 3rd)
    // To simulate an isolated overtone, only place energy at 400 Hz
    const overtoneFFT = makeFFT([[400, 0.8]]);
    const overtoneScore = scoreHarmonicSalience(
      400,
      overtoneFFT,
      SAMPLE_RATE,
      FFT_SIZE,
    );

    expect(fundamentalScore).toBeGreaterThan(overtoneScore);
  });
});

describe("annotatePeakSalience", () => {
  it("adds salienceScore property to each peak object", () => {
    const fft = makeFFT([
      [200, 0.8],
      [400, 0.6],
    ]);
    const peaks = [{ frequency: 200, amplitude: 0.8 }];
    annotatePeakSalience(peaks, fft, SAMPLE_RATE, FFT_SIZE);
    expect(peaks[0]).toHaveProperty("salienceScore");
    expect(typeof peaks[0].salienceScore).toBe("number");
  });

  it("does not throw on empty peaks array", () => {
    const fft = makeFFT([[200, 0.8]]);
    expect(() =>
      annotatePeakSalience([], fft, SAMPLE_RATE, FFT_SIZE),
    ).not.toThrow();
  });

  it("does not throw when peaks is null", () => {
    const fft = makeFFT([[200, 0.8]]);
    expect(() =>
      annotatePeakSalience(null, fft, SAMPLE_RATE, FFT_SIZE),
    ).not.toThrow();
  });

  it("salienceScore is in [0, 1] for all peaks", () => {
    const fft = makeFFT([
      [200, 0.8],
      [400, 0.6],
      [600, 0.4],
    ]);
    const peaks = [
      { frequency: 200, amplitude: 0.8 },
      { frequency: 400, amplitude: 0.6 },
      { frequency: 600, amplitude: 0.4 },
    ];
    annotatePeakSalience(peaks, fft, SAMPLE_RATE, FFT_SIZE);
    for (const peak of peaks) {
      expect(peak.salienceScore).toBeGreaterThanOrEqual(0);
      expect(peak.salienceScore).toBeLessThanOrEqual(1);
    }
  });

  it("a peak with strong harmonic series scores higher than an isolated peak", () => {
    // Build FFT: 200 Hz has full harmonic series, 550 Hz is isolated
    const fft = makeFFT([
      [200, 0.7],
      [400, 0.6],
      [600, 0.45],
      [800, 0.3],
      [1000, 0.2],
      [1200, 0.1],
      [550, 0.7], // same amplitude as 200 Hz, but no harmonics
    ]);
    const peaks = [
      { frequency: 200, amplitude: 0.7 },
      { frequency: 550, amplitude: 0.7 },
    ];
    annotatePeakSalience(peaks, fft, SAMPLE_RATE, FFT_SIZE);
    expect(peaks[0].salienceScore).toBeGreaterThan(peaks[1].salienceScore);
  });
});
