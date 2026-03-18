import { describe, expect, it } from "vitest";
import {
  solveModeFamilyForPitch,
  solveNormalModesForPitch,
  sampleFFTAmplitudeForFrequency,
} from "./normalModes.js";

// Modal frequency formula: f = (340 * 0.5 * magnitude) / radius
// Inverted: magnitude = (2 * pitch * radius) / 340
// Exact mode frequencies at radius=1:
//   (1,1,1) → magnitude=sqrt(3)  → f = 170*sqrt(3) ≈ 294.45 Hz
//   (1,1,2) → magnitude=sqrt(6)  → f = 170*sqrt(6) ≈ 416.33 Hz
//   (1,2,2) → magnitude=3        → f = 510 Hz

const RADIUS = 1;

describe("solveNormalModesForPitch", () => {
  it("returns null for zero or negative pitch", () => {
    expect(solveNormalModesForPitch(0, RADIUS)).toBeNull();
    expect(solveNormalModesForPitch(-100, RADIUS)).toBeNull();
  });

  it("returns null for non-finite pitch", () => {
    expect(solveNormalModesForPitch(NaN, RADIUS)).toBeNull();
    expect(solveNormalModesForPitch(Infinity, RADIUS)).toBeNull();
  });

  it("maps the fundamental frequency to the (1,1,1) mode", () => {
    // This is the lowest possible cymatics mode — the most symmetric
    const fundamentalFreq = 170 * Math.sqrt(3); // ≈ 294.45 Hz at radius=1
    const mode = solveNormalModesForPitch(fundamentalFreq, RADIUS);
    expect(mode).toEqual({ u: 1, v: 1, w: 1 });
  });

  it("maps 510 Hz to a permutation of the (1,2,2) mode", () => {
    // (1,2,2): magnitude = sqrt(1+4+4) = 3.0, f = 170*3 = 510 Hz exactly
    const mode = solveNormalModesForPitch(510, RADIUS);
    expect(mode).not.toBeNull();
    const components = [mode.u, mode.v, mode.w].sort((a, b) => a - b);
    expect(components).toEqual([1, 2, 2]);
  });

  it("maps the (1,1,2) frequency to a permutation of that mode", () => {
    // magnitude = sqrt(6), f = 170*sqrt(6) ≈ 416.33 Hz
    const freq = 170 * Math.sqrt(6);
    const mode = solveNormalModesForPitch(freq, RADIUS);
    expect(mode).not.toBeNull();
    const components = [mode.u, mode.v, mode.w].sort((a, b) => a - b);
    expect(components).toEqual([1, 1, 2]);
  });

  it("always returns positive integer triplets for typical audio frequencies", () => {
    for (const pitch of [110, 220, 440, 880, 1760, 3520]) {
      const mode = solveNormalModesForPitch(pitch, RADIUS);
      expect(mode, `pitch=${pitch}`).not.toBeNull();
      expect(Number.isInteger(mode.u), "u is integer").toBe(true);
      expect(Number.isInteger(mode.v), "v is integer").toBe(true);
      expect(Number.isInteger(mode.w), "w is integer").toBe(true);
      expect(mode.u).toBeGreaterThan(0);
      expect(mode.v).toBeGreaterThan(0);
      expect(mode.w).toBeGreaterThan(0);
    }
  });

  it("produces the same mode when pitch and radius scale together", () => {
    // Doubling radius and halving pitch yields the same target magnitude,
    // so the solver should return the same triplet.
    const mode1 = solveNormalModesForPitch(440, 1);
    const mode2 = solveNormalModesForPitch(220, 2);
    expect(mode1).toEqual(mode2);
  });

  it("returns different modes for clearly different frequencies", () => {
    const low = solveNormalModesForPitch(170 * Math.sqrt(3), RADIUS); // (1,1,1)
    const high = solveNormalModesForPitch(510, RADIUS); // (1,2,2)
    expect(low).not.toEqual(high);
  });
});

describe("sampleFFTAmplitudeForFrequency", () => {
  const sampleRate = 44100;
  const fftSize = 32;
  // Bin stride: nyquist / (fftSize/2 - 1) = 22050 / 15 = 1470 Hz per bin
  // bin for frequency f ≈ round(f / 22050 * 15)

  it("returns the amplitude at the nearest FFT bin", () => {
    const fftMagnitudes = new Float32Array(16);
    fftMagnitudes[2] = 0.75; // bin 2 ≈ 2/15 * 22050 = 2940 Hz
    const result = sampleFFTAmplitudeForFrequency(
      2940,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    expect(result).toBeCloseTo(0.75);
  });

  it("returns 0 for frequency 0", () => {
    const fftMagnitudes = new Float32Array(16).fill(0.5);
    expect(
      sampleFFTAmplitudeForFrequency(0, fftMagnitudes, sampleRate, fftSize),
    ).toBe(0);
  });

  it("clamps above-Nyquist frequencies to the last bin", () => {
    const fftMagnitudes = new Float32Array(16);
    fftMagnitudes[15] = 0.9;
    const result = sampleFFTAmplitudeForFrequency(
      99999,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    expect(result).toBeCloseTo(0.9);
  });

  it("returns 0 for null or empty fftMagnitudes", () => {
    expect(sampleFFTAmplitudeForFrequency(440, null, sampleRate, fftSize)).toBe(
      0,
    );
    expect(
      sampleFFTAmplitudeForFrequency(
        440,
        new Float32Array(0),
        sampleRate,
        fftSize,
      ),
    ).toBe(0);
  });
});

describe("solveModeFamilyForPitch", () => {
  it("returns multiple unique mode triplets for the same pitch", () => {
    const family = solveModeFamilyForPitch(440, RADIUS, 4);

    expect(family).toHaveLength(4);
    expect(
      new Set(family.map((mode) => `${mode.u}:${mode.v}:${mode.w}`)).size,
    ).toBe(4);
  });

  it("keeps the best single-mode solution as the first family entry", () => {
    const primary = solveNormalModesForPitch(440, RADIUS);
    const family = solveModeFamilyForPitch(440, RADIUS, 4);

    expect(family[0]).toMatchObject(primary);
  });

  it("spreads the returned family across distinct triplets", () => {
    const family = solveModeFamilyForPitch(440, RADIUS, 4);
    const distances = [];

    for (let i = 1; i < family.length; i++) {
      const previous = family[i - 1];
      const current = family[i];
      distances.push(
        Math.abs(previous.u - current.u) +
          Math.abs(previous.v - current.v) +
          Math.abs(previous.w - current.w),
      );
    }

    expect(Math.max(...distances)).toBeGreaterThanOrEqual(3);
  });
});
