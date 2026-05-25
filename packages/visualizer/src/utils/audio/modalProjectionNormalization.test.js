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
      highQSparseResonatorAuthority: 0.8,
      highQRingSupport: 0.8,
      highQResonantEnergy: 0.4,
      highQObservedCoherence: 0.92,
    },
    hardSilentFrame: false,
    getModalObserverProfile: () => ({ snrFull: 1 }),
  });

describe("projection energy normalization", () => {
  it("does not reduce supported modal projection budget because the spectrum is dense", () => {
    const sparse = normalizeWithDenseLoad(0);
    const dense = normalizeWithDenseLoad(1);

    expect(dense.metrics.projectionLoad).toBe(1);
    expect(dense.metrics.projectionAllocatedEnergyResonant).toBeCloseTo(
      sparse.metrics.projectionAllocatedEnergyResonant,
      6,
    );
    expect(dense.entries[0].displayAmplitude).toBeCloseTo(
      sparse.entries[0].displayAmplitude,
      6,
    );
  });
});
