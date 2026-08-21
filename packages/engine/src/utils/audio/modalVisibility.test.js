import { describe, expect, it } from "vitest";

import { deriveModalVisibilityComponents } from "./modalVisibility.js";

function buildModeSlots(...amplitudes) {
  const slots = new Float32Array(amplitudes.length * 4);
  amplitudes.forEach((amplitude, index) => {
    slots[index * 4] = index + 1;
    slots[index * 4 + 3] = amplitude;
  });
  return slots;
}

function deriveVisibility({
  amplitudes = [0.5, 0.25],
  renderEnergy = 0.3125,
  observationConfidence = 0.8,
  hardSilent = false,
} = {}) {
  return deriveModalVisibilityComponents({
    modeSlots: buildModeSlots(...amplitudes),
    modeCapacity: amplitudes.length,
    projectedModalEnergy: renderEnergy,
    observationConfidence,
    hardSilent,
  });
}

describe("modal visibility", () => {
  it("consumes owner-provided projected energy and observation confidence", () => {
    const visibility = deriveModalVisibilityComponents({
      modeSlots: buildModeSlots(0.5, 0.25),
      modeCapacity: 2,
      projectedModalEnergy: 0.04,
      observationConfidence: 0.5,
    });

    expect(visibility.projectedModalEnergy).toBe(0.04);
    expect(visibility.observationConfidence).toBe(0.5);
    expect(visibility.observableModalEnergy).toBe(0.02);
  });

  it("summarizes projected slot energy instead of mislabeling amplitude", () => {
    const visibility = deriveVisibility();

    expect(visibility.activeModeCount).toBe(2);
    expect(visibility.totalProjectedSlotEnergy).toBeCloseTo(0.3125);
    expect(visibility.averageProjectedSlotEnergy).toBeCloseTo(0.15625);
    expect(visibility.peakProjectedSlotEnergy).toBeCloseTo(0.25);
    expect(visibility.upperProjectedSlotEnergy).toBeCloseTo(0.25);
  });

  it("changes continuously with projected energy and observation confidence", () => {
    const weak = deriveVisibility({
      renderEnergy: 0.1,
      observationConfidence: 0.25,
    });
    const strongerEvidence = deriveVisibility({
      renderEnergy: 0.1,
      observationConfidence: 0.5,
    });
    const strongerResponse = deriveVisibility({
      renderEnergy: 0.2,
      observationConfidence: 0.5,
    });

    expect(weak.observableModalEnergy).toBeCloseTo(0.025);
    expect(strongerEvidence.observableModalEnergy).toBeCloseTo(0.05);
    expect(strongerResponse.observableModalEnergy).toBeCloseTo(0.1);
    expect(weak.displayVisibility).toBeLessThan(
      strongerEvidence.displayVisibility,
    );
    expect(strongerEvidence.displayVisibility).toBeLessThan(
      strongerResponse.displayVisibility,
    );
  });

  it("does not let modal Q alter equal field energy", () => {
    const field = {
      modeSlots: buildModeSlots(0.5, 0.25),
      modeCapacity: 2,
      projectedModalEnergy: 0.12,
      observationConfidence: 0.7,
    };

    expect(
      deriveModalVisibilityComponents({ ...field, qualityFactor: 3 }),
    ).toEqual(deriveModalVisibilityComponents({ ...field, qualityFactor: 64 }));
  });

  it("does not let source forcing alter equal field energy", () => {
    const field = {
      modeSlots: buildModeSlots(0.5, 0.25),
      modeCapacity: 2,
      projectedModalEnergy: 0.12,
      observationConfidence: 0.7,
    };
    const driven = deriveModalVisibilityComponents({
      ...field,
      currentSignalAmplitude: 0.4,
    });
    const freelyRinging = deriveModalVisibilityComponents({
      ...field,
      currentSignalAmplitude: 0,
    });

    expect(freelyRinging.observableModalEnergy).toBeCloseTo(0.084);
    expect(freelyRinging.displayVisibility).toBe(driven.displayVisibility);
  });

  it("fails closed for a closed boundary or absent projected field", () => {
    expect(deriveVisibility({ hardSilent: true }).displayVisibility).toBe(0);
    expect(deriveVisibility({ renderEnergy: 0 }).displayVisibility).toBe(0);
    expect(
      deriveVisibility({ amplitudes: [], renderEnergy: 0.4 }).displayVisibility,
    ).toBe(0);
  });
});
