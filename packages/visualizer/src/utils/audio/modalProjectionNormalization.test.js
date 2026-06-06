import { describe, expect, it } from "vitest";

import { applyProjectionEnergyNormalization } from "./modalProjectionNormalization.js";

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

const normalizeWithDenseLoad = (denseLoad) =>
  applyProjectionEnergyNormalization({
    entries: [makeSupportedEntry()],
    layer: "resonant",
    modalObserverMetrics: {
      highQProjectionLoad: denseLoad,
      highQSparseResonatorEvidence: 0.8,
      highQRingSupport: 0.8,
      highQResonantEnergy: 0.4,
      highQObservedCoherence: 0.92,
    },
    hardSilentFrame: false,
    getModalObserverProfile: () => ({ snrFull: 1 }),
  });

describe("projection energy normalization", () => {
  it("does not grant structural budget because the high-Q spectrum is dense", () => {
    const sparse = normalizeWithDenseLoad(0);
    const dense = normalizeWithDenseLoad(1);

    expect(dense.metrics.projectionLoad).toBe(1);
    expect(
      dense.metrics.projectionAllocatedEnergyResonant,
    ).toBeCloseTo(sparse.metrics.projectionAllocatedEnergyResonant);
    expect(dense.entries[0].displayAmplitude).toBeCloseTo(
      sparse.entries[0].displayAmplitude,
    );
  });

  it("keeps high-Q protection diagnostic from owning structural projection budget", () => {
    const unprotected = applyProjectionEnergyNormalization({
      entries: [makeSupportedEntry()],
      layer: "resonant",
      modalObserverMetrics: {
        highQProjectionLoad: 0,
        highQSparseResonatorEvidence: 0,
        highQRingSupport: 0,
        highQResonantEnergy: 0.4,
        highQObservedCoherence: 0.92,
      },
      hardSilentFrame: false,
      getModalObserverProfile: () => ({ snrFull: 1 }),
    });
    const protectedDetail = applyProjectionEnergyNormalization({
      entries: [makeSupportedEntry()],
      layer: "resonant",
      modalObserverMetrics: {
        highQProjectionLoad: 0.92,
        highQSparseResonatorEvidence: 0.86,
        highQRingSupport: 0.78,
        highQResonantEnergy: 0.4,
        highQObservedCoherence: 0.92,
      },
      hardSilentFrame: false,
      getModalObserverProfile: () => ({ snrFull: 1 }),
    });

    expect(protectedDetail.metrics.projectionHighQProtection).toBeGreaterThan(
      0,
    );
    expect(
      protectedDetail.metrics.projectionAllocatedEnergyResonant,
    ).toBeCloseTo(unprotected.metrics.projectionAllocatedEnergyResonant);
    expect(protectedDetail.entries[0].displayAmplitude).toBeCloseTo(
      unprotected.entries[0].displayAmplitude,
    );
  });
});
