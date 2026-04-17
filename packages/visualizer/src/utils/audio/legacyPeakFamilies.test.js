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

  it("resets split counter on non-consecutive harmonic support", () => {
    const state = createLegacyPeakFamilyState();

    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95), makeCandidate(330, 0.46)],
      analysisHints: null,
      heavyFrameIndex: 1,
    });
    // Gap: 5 heavy frames with only the fundamental.
    for (let frame = 2; frame <= 6; frame += 1) {
      updateLegacyPeakSelection({
        state,
        candidatePool: [makeCandidate(110, 0.95)],
        analysisHints: null,
        heavyFrameIndex: frame,
      });
    }
    const reappeared = updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95), makeCandidate(330, 0.46)],
      analysisHints: null,
      heavyFrameIndex: 7,
    });

    // Only ONE harmonic sighting after the gap; split must not fire yet.
    expect(
      reappeared.backbonePeaks.some(
        (peak) => Math.abs((peak.frequency ?? 0) - 330) < 20,
      ),
    ).toBe(false);
  });

  it("prunes unused pending-split entries after their TTL expires", () => {
    const state = createLegacyPeakFamilyState();

    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95), makeCandidate(330, 0.46)],
      analysisHints: null,
      heavyFrameIndex: 1,
    });
    expect(state.pendingIndependentCandidates.size).toBeGreaterThan(0);

    // Drive forward past the TTL with fundamental only. Pruning runs per tick.
    for (let frame = 2; frame <= 10; frame += 1) {
      updateLegacyPeakSelection({
        state,
        candidatePool: [makeCandidate(110, 0.95)],
        analysisHints: null,
        heavyFrameIndex: frame,
      });
    }

    expect(state.pendingIndependentCandidates.size).toBe(0);
  });

  it("keeps nearby low-frequency detail candidates in separate families", () => {
    const state = createLegacyPeakFamilyState();

    const candidatePool = [
      // Both push into detail pool (below backbone max but detail accepts all).
      { frequency: 55, amplitude: 0.88, salienceScore: 0.88 },
      { frequency: 82, amplitude: 0.84, salienceScore: 0.84 },
    ];

    updateLegacyPeakSelection({
      state,
      candidatePool,
      analysisHints: null,
      heavyFrameIndex: 1,
    });

    // 55 Hz and 82 Hz are 27 Hz apart — must not collapse into a single
    // detail family even though both are below the old 36 Hz cap.
    expect(state.detailFamilies.size).toBeGreaterThanOrEqual(2);
  });

  it("increments disagreementCount when another family wins an expected candidate", () => {
    const state = createLegacyPeakFamilyState();

    // Establish a backbone fundamental at 110 Hz.
    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95)],
      analysisHints: null,
      heavyFrameIndex: 1,
    });
    // Present a ~330 Hz candidate twice: second sighting triggers split,
    // meaning the fundamental's lowerHarmonicMatch expectation lost.
    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95), makeCandidate(330, 0.48)],
      analysisHints: null,
      heavyFrameIndex: 2,
    });
    updateLegacyPeakSelection({
      state,
      candidatePool: [makeCandidate(110, 0.95), makeCandidate(330, 0.48)],
      analysisHints: null,
      heavyFrameIndex: 3,
    });

    const fundamental = Array.from(state.backboneFamilies.values()).find(
      (family) => Math.abs(family.centerHz - 110) < 8,
    );
    expect(fundamental).toBeTruthy();
    expect(fundamental.disagreementCount).toBeGreaterThan(0);
  });
});
