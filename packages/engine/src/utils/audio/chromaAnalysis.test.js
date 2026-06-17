import { describe, expect, it } from "vitest";
import {
  buildChromaVector,
  smoothChromaInPlace,
  detectKeyFromChroma,
} from "./chromaAnalysis.js";

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

describe("buildChromaVector", () => {
  it("returns a Float32Array of length 12", () => {
    const fft = makeFFT([[440, 0.8]]);
    const chroma = buildChromaVector(fft, SAMPLE_RATE, FFT_SIZE);
    expect(chroma).toBeInstanceOf(Float32Array);
    expect(chroma.length).toBe(12);
  });

  it("returns all zeros when fftMagnitudes is all-zero", () => {
    const fft = new Float32Array(FFT_SIZE / 2);
    const chroma = buildChromaVector(fft, SAMPLE_RATE, FFT_SIZE);
    expect(Array.from(chroma).every((v) => v === 0)).toBe(true);
  });

  it("returns all zeros when fftMagnitudes is null", () => {
    const chroma = buildChromaVector(null, SAMPLE_RATE, FFT_SIZE);
    expect(Array.from(chroma).every((v) => v === 0)).toBe(true);
  });

  it("output sums to approximately 1.0 when signal is present", () => {
    const fft = makeFFT([
      [261.6, 0.9], // C4
      [329.6, 0.7], // E4
      [392.0, 0.6], // G4
    ]);
    const chroma = buildChromaVector(fft, SAMPLE_RATE, FFT_SIZE);
    const sum = Array.from(chroma).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("excludes bins below CHROMA_MIN_HZ (65 Hz)", () => {
    // 40 Hz is below the floor — should not contribute
    const fft = makeFFT([[40, 1.0]]);
    const chroma = buildChromaVector(fft, SAMPLE_RATE, FFT_SIZE);
    expect(Array.from(chroma).every((v) => v === 0)).toBe(true);
  });

  it("excludes bins above CHROMA_MAX_HZ (2100 Hz)", () => {
    // 3000 Hz is above the ceiling
    const fft = makeFFT([[3000, 1.0]]);
    const chroma = buildChromaVector(fft, SAMPLE_RATE, FFT_SIZE);
    expect(Array.from(chroma).every((v) => v === 0)).toBe(true);
  });

  it("accumulates C2, C3, C4 all into pitch class 0 (C)", () => {
    // C2 ≈ 65.4 Hz, C3 ≈ 130.8 Hz, C4 ≈ 261.6 Hz
    const fft = makeFFT([
      [65.4, 0.5],
      [130.8, 0.5],
      [261.6, 0.5],
    ]);
    const chroma = buildChromaVector(fft, SAMPLE_RATE, FFT_SIZE);
    // Pitch class 0 should have the highest energy
    const maxIdx = Array.from(chroma).indexOf(Math.max(...chroma));
    expect(maxIdx).toBe(0);
    // And it should hold nearly all the energy
    expect(chroma[0]).toBeCloseTo(1.0, 1);
  });
});

describe("smoothChromaInPlace", () => {
  it("moves slowly toward target with alpha=0.1", () => {
    const smoothed = new Float32Array(12);
    const incoming = new Float32Array(12).fill(1 / 12);
    smoothChromaInPlace(smoothed, incoming, 0.1);
    // After one step: each bin should be 0.1 * (1/12) ≈ 0.00833
    expect(smoothed[0]).toBeCloseTo(0.1 / 12, 4);
    // Not yet converged
    expect(smoothed[0]).toBeLessThan(1 / 12);
  });

  it("converges to target after many calls", () => {
    const smoothed = new Float32Array(12);
    const target = new Float32Array(12);
    target[3] = 0.6;
    target[7] = 0.4;
    const incoming = target;
    for (let i = 0; i < 200; i++) {
      smoothChromaInPlace(smoothed, incoming, 0.1);
    }
    // Should be very close to target after 200 steps with alpha=0.1
    expect(smoothed[3]).toBeCloseTo(0.6, 2);
    expect(smoothed[7]).toBeCloseTo(0.4, 2);
  });
});

describe("detectKeyFromChroma", () => {
  it("returns an object with tonic, mode, and confidence", () => {
    const chroma = new Float32Array(12).fill(1 / 12);
    const result = detectKeyFromChroma(chroma);
    expect(result).toHaveProperty("tonic");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("confidence");
    expect(typeof result.tonic).toBe("number");
    expect(["major", "minor"]).toContain(result.mode);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("returns confidence 0 for a flat (uniform) chroma vector", () => {
    // Uniform chroma has zero variance; Pearson r is undefined → 0
    const chroma = new Float32Array(12).fill(1 / 12);
    const result = detectKeyFromChroma(chroma);
    expect(result.confidence).toBe(0);
  });

  it("detects C major when chroma matches the C major profile shape", () => {
    // Feed the C major profile directly (root=0, major)
    const MAJOR_PROFILE = [
      6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const total = MAJOR_PROFILE.reduce((a, b) => a + b, 0);
    const chroma = new Float32Array(MAJOR_PROFILE.map((v) => v / total));
    const result = detectKeyFromChroma(chroma);
    expect(result.tonic).toBe(0); // C
    expect(result.mode).toBe("major");
  });

  it("returns high confidence for a clearly peaked chroma matching a key", () => {
    const MAJOR_PROFILE = [
      6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const total = MAJOR_PROFILE.reduce((a, b) => a + b, 0);
    const chroma = new Float32Array(MAJOR_PROFILE.map((v) => v / total));
    const result = detectKeyFromChroma(chroma);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects G major (tonic=7) when chroma is rotated by 7 semitones", () => {
    const MAJOR_PROFILE = [
      6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const total = MAJOR_PROFILE.reduce((a, b) => a + b, 0);
    // Rotate profile by 7 to simulate G major
    const chroma = new Float32Array(12);
    for (let i = 0; i < 12; i++) {
      chroma[(i + 7) % 12] = MAJOR_PROFILE[i] / total;
    }
    const result = detectKeyFromChroma(chroma);
    expect(result.tonic).toBe(7); // G
    expect(result.mode).toBe("major");
  });
});
