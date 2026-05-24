import { describe, expect, it } from "vitest";
import { writePhaseSlotsForVisibleModes } from "./modalPhaseSlots.js";

describe("modal phase slots", () => {
  it("uploads oscillator phase and physical angular velocity when available", () => {
    const target = new Float32Array(4);
    const visibleSlots = new Float32Array([0, 0, 1, 0.7]);
    const activeModes = new Map([
      [
        "0:0:1",
        {
          modeKey: "0:0:1",
          layer: "backbone",
          modalOscillatorPhaseOffsetRad: 0.25,
          modalOscillatorAngularVelocityRadPerSec: 2 * Math.PI * 440,
          modalOscillatorPhaseCoherence: 0.8,
          modalOscillatorPhaseAuthority: 0.9,
        },
      ],
    ]);

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots,
      capacity: 1,
      activeModes,
      observedModes: new Map(),
    });

    expect(count).toBe(1);
    expect(target[0]).toBeCloseTo(0.25);
    expect(target[1]).toBeCloseTo(2 * Math.PI * 440);
    expect(target[2]).toBeCloseTo(0.8);
    expect(target[3]).toBeCloseTo(0.9);
  });
});
