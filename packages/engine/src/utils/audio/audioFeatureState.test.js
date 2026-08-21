import { describe, expect, it } from "vitest";
import { createAudioFeatureState } from "./audioFeatureState.js";

describe("audio feature state", () => {
  it("creates complete analysis memory for its declared capacity", () => {
    const capacity = 3;
    const analysis = createAudioFeatureState(capacity).analysis;
    const capacityOwnedBuffers = [
      "candidateForcingSlots",
      "candidateResponseSlots",
      "sourceCoupledPhaseSlots",
      "resonantPhaseSlots",
      "modeSlots",
      "signalModeSlots",
      "sourceCoupledSpectralMoment",
      "resonantSpectralMoment",
      "referenceSourceCoupledSlots",
      "referenceResonantSlots",
      "referenceModeSlots",
      "signalReferenceModeSlots",
      "zeroSourceCoupledTargetSlots",
      "zeroResonantTargetSlots",
    ];

    for (const key of capacityOwnedBuffers) {
      expect(analysis[key], key).toBeInstanceOf(Float32Array);
      expect(analysis[key].length, key).toBe(capacity * 4);
    }
  });
});
