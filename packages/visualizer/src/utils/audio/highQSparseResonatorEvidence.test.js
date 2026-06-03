import { expect, test } from "vitest";

import {
  countNonZeroFftBins,
  deriveHighQSparseResonatorEvidence,
} from "./highQSparseResonatorEvidence.js";

test("countNonZeroFftBins returns zero for missing or empty FFT data", () => {
  expect(countNonZeroFftBins(null)).toBe(0);
  expect(countNonZeroFftBins(new Float32Array())).toBe(0);
});

test("countNonZeroFftBins counts only bins above the threshold", () => {
  const fftMagnitudes = Float32Array.from([0, 0.0009, 0.0011, 0.5]);

  expect(countNonZeroFftBins(fftMagnitudes)).toBe(2);
  expect(countNonZeroFftBins(fftMagnitudes, 0.1)).toBe(1);
});

test("high-Q sparse resonator evidence clamps invalid inputs without producing NaN", () => {
  const result = deriveHighQSparseResonatorEvidence({
    highQObservedSnr: Number.NaN,
    highQObservedCoherence: Number.POSITIVE_INFINITY,
    highQObservedDrive: -1,
    highQRingSupport: Number.NEGATIVE_INFINITY,
    highQResonantEnergy: Number.NaN,
    distributedExcitation: -0.5,
    periodicity: Number.NaN,
    nonZeroFFTBinCount: -20,
    modeCoherence: Number.NaN,
  });

  expect(result.highQSparseResonatorEvidence).toBe(0);
  expect(result.highQProjectionLoad).toBeGreaterThanOrEqual(0);
  expect(result.highQProjectionLoad).toBeLessThanOrEqual(1);
});

test("high-Q sparse resonator evidence reports supported retained resonators", () => {
  const result = deriveHighQSparseResonatorEvidence({
    highQObservedSnr: 0.82,
    highQObservedCoherence: 0.86,
    highQObservedDrive: 0.05,
    highQRingSupport: 0.72,
    highQResonantEnergy: 0.08,
    distributedExcitation: 0.12,
    periodicity: 0.82,
    nonZeroFFTBinCount: 48,
    modeCoherence: 0.8,
  });

  expect(result.highQSparseResonatorEvidence).toBeGreaterThan(0.75);
  expect(result.highQProjectionLoad).toBeLessThan(0.2);
});

test("high-Q sparse resonator evidence stays gated by retained energy", () => {
  const result = deriveHighQSparseResonatorEvidence({
    highQObservedSnr: 0.82,
    highQObservedCoherence: 0.86,
    highQObservedDrive: 0.05,
    highQRingSupport: 0.72,
    highQResonantEnergy: 0.0002,
    distributedExcitation: 0.12,
    periodicity: 0.82,
    nonZeroFFTBinCount: 48,
    modeCoherence: 0.8,
  });

  expect(result.highQSparseResonatorEvidence).toBeLessThan(0.01);
});

test("reports dense projection load without capping supported retained evidence", () => {
  const result = deriveHighQSparseResonatorEvidence({
    highQObservedSnr: 0.18,
    highQObservedCoherence: 0.86,
    highQObservedDrive: 0.006,
    highQRingSupport: 0.58,
    highQResonantEnergy: 0.035,
    distributedExcitation: 0.62,
    periodicity: 0.44,
    nonZeroFFTBinCount: 920,
    modeCoherence: 0.86,
  });

  expect(result.highQSparseResonatorEvidence).toBeGreaterThan(0.12);
  expect(result.highQProjectionLoad).toBeGreaterThanOrEqual(0.72);
});

test("high-Q sparse resonator evidence survives dense spectra with strong evidence", () => {
  const result = deriveHighQSparseResonatorEvidence({
    highQObservedSnr: 0.74,
    highQObservedCoherence: 0.88,
    highQObservedDrive: 0.05,
    highQRingSupport: 0.7,
    highQResonantEnergy: 0.08,
    distributedExcitation: 0.62,
    periodicity: 0.72,
    nonZeroFFTBinCount: 920,
    modeCoherence: 0.9,
  });

  expect(result.highQSparseResonatorEvidence).toBeGreaterThan(0.12);
});

test("high-Q sparse resonator evidence reports sparse retained tails from ring support", () => {
  const result = deriveHighQSparseResonatorEvidence({
    highQObservedSnr: 0.34,
    highQObservedCoherence: 0.62,
    highQObservedDrive: 0.012,
    highQRingSupport: 0.78,
    highQResonantEnergy: 0.04,
    distributedExcitation: 0.16,
    periodicity: 0.86,
    nonZeroFFTBinCount: 120,
    modeCoherence: 0.76,
  });

  expect(result.highQSparseResonatorEvidence).toBeGreaterThan(0.2);
});
