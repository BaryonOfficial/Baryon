import { describe, expect, it } from "vitest";

import { measureModalProjection } from "./modalProjectionDiagnostics.js";

const makeSupportedEntry = () => ({
  modeKey: "supported",
  u: 6,
  v: 7,
  w: 8,
  naturalFrequencyHz: 2200,
  displayAmplitude: 1,
  coherence: 0.92,
  observedSnr: 2,
  observedDrive: 0.24,
  phaseAuthority: 0.8,
});

const measureWithDenseLoad = (denseLoad) =>
  measureModalProjection({
    entries: [makeSupportedEntry()],
    layer: "resonant",
    modalObserverMetrics: {
      resonantProjectionLoad: denseLoad,
      resonantSparseEvidence: 0.8,
      resonantRingSupport: 0.8,
      resonantObservationConfidence: 0.4,
      resonantObservedCoherence: 0.92,
    },
  });

describe("modal projection diagnostics", () => {
  it("preserves oscillator coefficients through projection diagnostics", () => {
    const entry = {
      ...makeSupportedEntry(),
      displayAmplitude: 0.73,
    };
    const result = measureModalProjection({
      entries: [entry],
      layer: "resonant",
      modalObserverMetrics: {
        resonantProjectionLoad: 1,
        resonantSparseEvidence: 1,
        resonantRingSupport: 1,
        resonantObservationConfidence: 1,
        resonantObservedCoherence: 1,
      },
    });

    expect(result.entries[0].displayAmplitude).toBeCloseTo(0.73, 8);
  });

  it("does not grant structural budget because the resonant spectrum is dense", () => {
    const sparse = measureWithDenseLoad(0);
    const dense = measureWithDenseLoad(1);

    expect(dense.metrics.projectionLoad).toBe(1);
    expect(dense.metrics.projectionRawEnergyResonant).toBeCloseTo(
      sparse.metrics.projectionRawEnergyResonant,
    );
    expect(dense.entries[0].displayAmplitude).toBeCloseTo(
      sparse.entries[0].displayAmplitude,
    );
  });

  it("keeps resonant protection diagnostic from owning structural projection budget", () => {
    const unprotected = measureModalProjection({
      entries: [makeSupportedEntry()],
      layer: "resonant",
      modalObserverMetrics: {
        resonantProjectionLoad: 0,
        resonantSparseEvidence: 0,
        resonantRingSupport: 0,
        resonantObservationConfidence: 0.4,
        resonantObservedCoherence: 0.92,
      },
    });
    const protectedDetail = measureModalProjection({
      entries: [makeSupportedEntry()],
      layer: "resonant",
      modalObserverMetrics: {
        resonantProjectionLoad: 0.92,
        resonantSparseEvidence: 0.86,
        resonantRingSupport: 0.78,
        resonantObservationConfidence: 0.4,
        resonantObservedCoherence: 0.92,
      },
    });

    // Protection is telemetry: it must appear in metrics without changing the
    // measured projection energy or any published amplitude.
    expect(
      protectedDetail.metrics.projectionResonantProtection,
    ).toBeGreaterThan(0);
    expect(protectedDetail.metrics.projectionRawEnergyResonant).toBeCloseTo(
      unprotected.metrics.projectionRawEnergyResonant,
    );
    expect(protectedDetail.entries[0].displayAmplitude).toBeCloseTo(
      unprotected.entries[0].displayAmplitude,
    );
  });
});
