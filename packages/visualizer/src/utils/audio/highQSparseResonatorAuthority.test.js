import { expect, test } from "vitest";

import {
  countNonZeroFftBins,
  deriveHighQSparseResonatorAuthority,
} from "./highQSparseResonatorAuthority.js";

test("countNonZeroFftBins returns zero for missing or empty FFT data", () => {
  expect(countNonZeroFftBins(null)).toBe(0);
  expect(countNonZeroFftBins(new Float32Array())).toBe(0);
});

test("countNonZeroFftBins counts only bins above the threshold", () => {
  const fftMagnitudes = Float32Array.from([0, 0.0009, 0.0011, 0.5]);

  expect(countNonZeroFftBins(fftMagnitudes)).toBe(2);
  expect(countNonZeroFftBins(fftMagnitudes, 0.1)).toBe(1);
});

test("current high-Q heuristic clamps invalid inputs without producing NaN", () => {
  const result = deriveHighQSparseResonatorAuthority({
    highQObservedSnr: Number.NaN,
    highQObservedCoherence: Number.POSITIVE_INFINITY,
    highQObservedDrive: -1,
    highQRingSupport: Number.NEGATIVE_INFINITY,
    highQDetailEnergy: Number.NaN,
    distributedExcitation: -0.5,
    periodicity: Number.NaN,
    nonZeroFFTBinCount: -20,
    modeCoherence: Number.NaN,
  });

  expect(result.highQSparseResonatorAuthority).toBe(0);
  expect(result.highQDenseSpectrumPressure).toBeGreaterThanOrEqual(0);
  expect(result.highQDenseSpectrumPressure).toBeLessThanOrEqual(1);
  expect(result.highQRetainedVisibilityRejected).toBe(false);
});

test("current high-Q heuristic gives sparse resonator evidence visible authority", () => {
  const result = deriveHighQSparseResonatorAuthority({
    highQObservedSnr: 0.82,
    highQObservedCoherence: 0.86,
    highQObservedDrive: 0.05,
    highQRingSupport: 0.72,
    highQDetailEnergy: 0.08,
    distributedExcitation: 0.12,
    periodicity: 0.82,
    nonZeroFFTBinCount: 48,
    modeCoherence: 0.8,
  });

  expect(result.highQSparseResonatorAuthority).toBeGreaterThan(0.75);
  expect(result.highQDenseSpectrumPressure).toBeLessThan(0.2);
  expect(result.highQRetainedVisibilityRejected).toBe(false);
});

test("current high-Q heuristic suppresses evidence below the retained-energy gate", () => {
  const result = deriveHighQSparseResonatorAuthority({
    highQObservedSnr: 0.82,
    highQObservedCoherence: 0.86,
    highQObservedDrive: 0.05,
    highQRingSupport: 0.72,
    highQDetailEnergy: 0.0002,
    distributedExcitation: 0.12,
    periodicity: 0.82,
    nonZeroFFTBinCount: 48,
    modeCoherence: 0.8,
  });

  expect(result.highQSparseResonatorAuthority).toBeLessThan(0.01);
  expect(result.highQRetainedVisibilityRejected).toBe(false);
});

test("current high-Q heuristic caps and rejects dense weak evidence", () => {
  const result = deriveHighQSparseResonatorAuthority({
    highQObservedSnr: 0.18,
    highQObservedCoherence: 0.86,
    highQObservedDrive: 0.006,
    highQRingSupport: 0.58,
    highQDetailEnergy: 0.035,
    distributedExcitation: 0.62,
    periodicity: 0.44,
    nonZeroFFTBinCount: 920,
    modeCoherence: 0.86,
  });

  expect(result.highQSparseResonatorAuthority).toBeLessThanOrEqual(0.035);
  expect(result.highQDenseSpectrumPressure).toBeGreaterThanOrEqual(0.72);
  expect(result.highQRetainedVisibilityRejected).toBe(true);
});

test("current high-Q heuristic does not reject dense spectra with strong evidence", () => {
  const result = deriveHighQSparseResonatorAuthority({
    highQObservedSnr: 0.74,
    highQObservedCoherence: 0.88,
    highQObservedDrive: 0.05,
    highQRingSupport: 0.7,
    highQDetailEnergy: 0.08,
    distributedExcitation: 0.62,
    periodicity: 0.72,
    nonZeroFFTBinCount: 920,
    modeCoherence: 0.9,
  });

  expect(result.highQSparseResonatorAuthority).toBeGreaterThan(0.12);
  expect(result.highQRetainedVisibilityRejected).toBe(false);
});

test("current high-Q heuristic authorizes sparse retained tails from ring support", () => {
  const result = deriveHighQSparseResonatorAuthority({
    highQObservedSnr: 0.34,
    highQObservedCoherence: 0.62,
    highQObservedDrive: 0.012,
    highQRingSupport: 0.78,
    highQDetailEnergy: 0.04,
    distributedExcitation: 0.16,
    periodicity: 0.86,
    nonZeroFFTBinCount: 120,
    modeCoherence: 0.76,
  });

  expect(result.highQSparseResonatorAuthority).toBeGreaterThan(0.2);
  expect(result.highQRetainedVisibilityRejected).toBe(false);
});
