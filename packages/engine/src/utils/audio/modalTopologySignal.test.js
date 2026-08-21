import { describe, expect, it } from "vitest";

import { getModalObserverProfile } from "./modalObservedState.js";
import { deriveCurrentResonantTopologySignal } from "./modalTopologySignal.js";

const RESONANT_PROFILE = getModalObserverProfile("resonant");

function derive({ firstObservedAtMs = 0, currentFrameAtMs = 200 } = {}) {
  return deriveCurrentResonantTopologySignal({
    state: {
      observedModes: new Map([
        [
          "resonant:1",
          {
            modeKey: "resonant:1",
            layer: "resonant",
            firstObservedAtMs,
          },
        ],
      ]),
    },
    currentFrameAtMs,
    modalObserverMetrics: {
      resonantObservedModeCount: 1,
      resonantObservationConfidence: 0.12,
      resonantRingSupport: 0.5,
      resonantObservedDrive: 0.2,
      resonantObservedSnr: 0.8,
      resonantObservedCoherence: 0.8,
    },
    resonantObserverProfile: RESONANT_PROFILE,
  });
}

describe("resonant topology signal", () => {
  it("reports supported, aged resonant topology without owning coefficients", () => {
    expect(derive()).toBeGreaterThan(0);
  });

  it("does not promote a newly observed mode before the age gate", () => {
    expect(derive({ firstObservedAtMs: 195 })).toBe(0);
  });
});
