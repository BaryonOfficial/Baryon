import { describe, expect, it } from "vitest";
import {
  getPhaseVelocityLimit,
  normalizePhaseRad,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";

describe("modal phase slots", () => {
  it("maps oscillator phase into bounded render phase slots", () => {
    const target = new Float32Array(4);
    const visibleSlots = new Float32Array([0, 0, 1, 0.7]);
    const activeModes = new Map([
      [
        "0:0:1",
        {
          modeKey: "0:0:1",
          layer: "source-coupled",
          modalOscillatorPhaseRad: 1.1,
          modalOscillatorPhaseOffsetRad: 0.25,
          modalOscillatorAngularVelocityRadPerSec: 2 * Math.PI * 440,
          modalOscillatorPhaseObservedAtSec: 2,
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
    const renderPhaseVelocity = getPhaseVelocityLimit("source-coupled");
    expect(target[0]).toBeCloseTo(
      normalizePhaseRad(1.1 - renderPhaseVelocity * 2),
    );
    expect(target[1]).toBeCloseTo(renderPhaseVelocity);
    expect(normalizePhaseRad(target[0] + target[1] * 2)).toBeCloseTo(1.1);
    expect(target[1]).toBeLessThan(2 * Math.PI * 440);
    expect(target[2]).toBeCloseTo(0.8);
    expect(target[3]).toBeCloseTo(0.9);
  });

  it("bounds oscillator phase by the visible render layer", () => {
    const target = new Float32Array(4);
    const visibleSlots = new Float32Array([1, 2, 3, 0.7]);
    const activeModes = new Map([
      [
        "1:2:3",
        {
          modeKey: "1:2:3",
          layer: "source-coupled",
          renderLayer: "resonant",
          modalOscillatorPhaseRad: -0.8,
          modalOscillatorPhaseOffsetRad: 0.15,
          modalOscillatorAngularVelocityRadPerSec: 2 * Math.PI * 196,
          modalOscillatorPhaseObservedAtSec: 1.5,
          modalOscillatorPhaseCoherence: 0.7,
          modalOscillatorPhaseAuthority: 0.85,
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

    const resonantVelocity = getPhaseVelocityLimit("resonant");
    expect(count).toBe(1);
    expect(target[1]).toBeCloseTo(resonantVelocity);
    expect(target[1]).toBeGreaterThan(getPhaseVelocityLimit("source-coupled"));
    expect(normalizePhaseRad(target[0] + target[1] * 1.5)).toBeCloseTo(-0.8);
  });
});
