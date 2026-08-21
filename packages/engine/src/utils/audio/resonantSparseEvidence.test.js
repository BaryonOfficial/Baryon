import { expect, test } from "vitest";

import { deriveResonantSparseEvidence } from "./resonantSparseEvidence.js";

test("resonant sparse evidence clamps invalid inputs without producing NaN", () => {
  const result = deriveResonantSparseEvidence({
    resonantObservedSnr: Number.NaN,
    resonantObservedCoherence: Number.POSITIVE_INFINITY,
    resonantObservedDrive: -1,
    resonantRingSupport: Number.NEGATIVE_INFINITY,
    resonantObservationConfidence: Number.NaN,
    distributedExcitation: -0.5,
    periodicity: Number.NaN,
    spectralEffectiveBinCount: -20,
    modeCoherence: Number.NaN,
  });

  expect(result.resonantSparseEvidence).toBe(0);
  expect(result.resonantProjectionLoad).toBeGreaterThanOrEqual(0);
  expect(result.resonantProjectionLoad).toBeLessThanOrEqual(1);
});

test("resonant sparse evidence reports supported observations", () => {
  const result = deriveResonantSparseEvidence({
    resonantObservedSnr: 0.82,
    resonantObservedCoherence: 0.86,
    resonantObservedDrive: 0.05,
    resonantRingSupport: 0.72,
    resonantObservationConfidence: 0.08,
    distributedExcitation: 0.12,
    periodicity: 0.82,
    spectralEffectiveBinCount: 4,
    modeCoherence: 0.8,
  });

  expect(result.resonantSparseEvidence).toBeGreaterThan(0.75);
  expect(result.resonantProjectionLoad).toBeLessThan(0.2);
});

test("resonant sparse evidence stays gated by observation confidence", () => {
  const result = deriveResonantSparseEvidence({
    resonantObservedSnr: 0.82,
    resonantObservedCoherence: 0.86,
    resonantObservedDrive: 0.05,
    resonantRingSupport: 0.72,
    resonantObservationConfidence: 0.0002,
    distributedExcitation: 0.12,
    periodicity: 0.82,
    spectralEffectiveBinCount: 4,
    modeCoherence: 0.8,
  });

  expect(result.resonantSparseEvidence).toBeLessThan(0.01);
});

test("reports dense projection load without capping supported evidence", () => {
  const result = deriveResonantSparseEvidence({
    resonantObservedSnr: 0.18,
    resonantObservedCoherence: 0.86,
    resonantObservedDrive: 0.006,
    resonantRingSupport: 0.58,
    resonantObservationConfidence: 0.035,
    distributedExcitation: 0.62,
    periodicity: 0.44,
    spectralEffectiveBinCount: 24,
    modeCoherence: 0.86,
  });

  expect(result.resonantSparseEvidence).toBeGreaterThan(0.12);
  expect(result.resonantProjectionLoad).toBeGreaterThanOrEqual(0.72);
});

test("resonant sparse evidence survives dense spectra with strong evidence", () => {
  const result = deriveResonantSparseEvidence({
    resonantObservedSnr: 0.74,
    resonantObservedCoherence: 0.88,
    resonantObservedDrive: 0.05,
    resonantRingSupport: 0.7,
    resonantObservationConfidence: 0.08,
    distributedExcitation: 0.62,
    periodicity: 0.72,
    spectralEffectiveBinCount: 24,
    modeCoherence: 0.9,
  });

  expect(result.resonantSparseEvidence).toBeGreaterThan(0.12);
});

test("resonant sparse evidence reports sparse observed tails from ring support", () => {
  const result = deriveResonantSparseEvidence({
    resonantObservedSnr: 0.34,
    resonantObservedCoherence: 0.62,
    resonantObservedDrive: 0.012,
    resonantRingSupport: 0.78,
    resonantObservationConfidence: 0.04,
    distributedExcitation: 0.16,
    periodicity: 0.86,
    spectralEffectiveBinCount: 5,
    modeCoherence: 0.76,
  });

  expect(result.resonantSparseEvidence).toBeGreaterThan(0.2);
});
