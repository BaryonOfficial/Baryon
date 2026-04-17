import { describe, expect, it } from "vitest";
import {
  createLegacyPeakFamilyState,
  updateLegacyPeakSelection,
} from "./legacyPeakFamilies.js";

function makeCandidate(
  frequency,
  amplitude,
  { salienceScore = amplitude, backboneBaseScore = amplitude } = {},
) {
  return {
    frequency,
    amplitude,
    salienceScore,
    backboneBaseScore,
    detailBaseScore: amplitude * 0.75,
  };
}

describe("legacy peak families", () => {
  it("merges octave duplicates into the lower-frequency backbone family", () => {
    const state = createLegacyPeakFamilyState();

    const result = updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.92), makeCandidate(220, 0.7)],
      analysisHints: null,
      heavyFrameIndex: 1,
    });

    expect(state.backboneFamilies.size).toBe(1);
    expect(result.backbonePeaks).toHaveLength(1);
    expect(result.backbonePeaks[0].frequency).toBeCloseTo(110, 0);
  });

  it("splits sustained harmonically related support into its own family after two heavy updates", () => {
    const state = createLegacyPeakFamilyState();

    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95), makeCandidate(330, 0.46)],
      analysisHints: null,
      heavyFrameIndex: 1,
    });
    const second = updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.94), makeCandidate(330, 0.48)],
      analysisHints: null,
      heavyFrameIndex: 2,
    });

    expect(state.backboneFamilies.size).toBeGreaterThanOrEqual(2);
    expect(
      second.backbonePeaks.some(
        (peak) => Math.abs((peak.frequency ?? 0) - 330) < 20,
      ),
    ).toBe(true);
  });

  it("ages and decays families only on heavy-analysis updates", () => {
    const state = createLegacyPeakFamilyState();

    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(82, 0.96)],
      analysisHints: null,
      heavyFrameIndex: 1,
    });
    const familyBeforeDecay = Array.from(state.backboneFamilies.values())[0];
    const amplitudeBeforeDecay = familyBeforeDecay.amplitude;

    updateLegacyPeakSelection({
      state,
      candidatePool: [],
      analysisHints: null,
      heavyFrameIndex: 2,
    });
    const decayedFamily = Array.from(state.backboneFamilies.values())[0];

    expect(decayedFamily.ageFrames).toBe(1);
    expect(decayedFamily.amplitude).toBeLessThan(amplitudeBeforeDecay);
    expect(decayedFamily.lastConfirmedHeavyFrame).toBe(1);
  });
});
