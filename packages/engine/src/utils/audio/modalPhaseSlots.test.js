import { describe, expect, it } from "vitest";
import {
  computePhaseAnchorAngularVelocityRadPerSec,
  getPhaseVelocityLimit,
  normalizePhaseRad,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";

function buildOscillatorEntry({
  modeKey,
  layer = "source-coupled",
  frequencyHz,
  phaseRad = 0,
  observedAtSec = 0,
  coherence = 0.8,
  authority = 0.9,
}) {
  return {
    modeKey,
    layer,
    modalOscillatorPhaseRad: phaseRad,
    modalOscillatorPhaseOffsetRad: 0,
    modalOscillatorAngularVelocityRadPerSec: 2 * Math.PI * frequencyHz,
    modalOscillatorPhaseObservedAtSec: observedAtSec,
    modalOscillatorPhaseCoherence: coherence,
    modalOscillatorPhaseAuthority: authority,
  };
}

describe("modal phase slots", () => {
  it("maps exact +π to -π in the canonical half-open range", () => {
    expect(normalizePhaseRad(Math.PI)).toBe(-Math.PI);
    expect(normalizePhaseRad(-Math.PI)).toBe(-Math.PI);
  });

  it("renders a single pure tone as a standing pattern in the rotating frame", () => {
    const target = new Float32Array(4);
    const visibleSlots = new Float32Array([0, 0, 1, 0.7]);
    const activeModes = new Map([
      [
        "0:0:1",
        buildOscillatorEntry({
          modeKey: "0:0:1",
          frequencyHz: 440,
          phaseRad: 1.1,
          observedAtSec: 2,
        }),
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
    // A lone mode is its own frame anchor: ν = ω − ω̄ = 0, so the standing
    // pattern does not spin, matching a physical single-tone cymatic figure.
    expect(target[1]).toBe(0);
    // Phase continuity at the observation instant is preserved.
    expect(normalizePhaseRad(target[0] + target[1] * 2)).toBeCloseTo(1.1);
    expect(target[2]).toBeCloseTo(0.8);
    expect(target[3]).toBeCloseTo(0.9);
  });

  it("preserves exact physical beat rates between near-degenerate modes", () => {
    const target = new Float32Array(8);
    const visibleSlots = new Float32Array([0, 0, 1, 0.5, 0, 1, 0, 0.5]);
    const detuneHz = 0.2;
    const activeModes = new Map([
      [
        "0:0:1",
        buildOscillatorEntry({ modeKey: "0:0:1", frequencyHz: 440 }),
      ],
      [
        "0:1:0",
        buildOscillatorEntry({
          modeKey: "0:1:0",
          frequencyHz: 440 + detuneHz,
        }),
      ],
    ]);

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots,
      capacity: 2,
      activeModes,
      observedModes: new Map(),
    });

    expect(count).toBe(2);
    // Relative phase velocity equals the true acoustic beat rate 2πΔf,
    // to Float32 slot-storage precision.
    expect(target[5] - target[1]).toBeCloseTo(2 * Math.PI * detuneHz, 6);
    // Both stay inside the alias-free render band.
    const limit = getPhaseVelocityLimit("source-coupled");
    expect(Math.abs(target[1])).toBeLessThanOrEqual(limit);
    expect(Math.abs(target[5])).toBeLessThanOrEqual(limit);
  });

  it("bounds far-from-anchor modes by the visible render layer limit", () => {
    const target = new Float32Array(8);
    const visibleSlots = new Float32Array([0, 0, 1, 0.9, 1, 2, 3, 0.1]);
    const activeModes = new Map([
      [
        "0:0:1",
        buildOscillatorEntry({ modeKey: "0:0:1", frequencyHz: 60 }),
      ],
      [
        "1:2:3",
        buildOscillatorEntry({
          modeKey: "1:2:3",
          layer: "source-coupled",
          frequencyHz: 4000,
          phaseRad: -0.8,
          observedAtSec: 1.5,
        }),
      ],
    ]);
    activeModes.get("1:2:3").renderLayer = "resonant";

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots,
      capacity: 2,
      activeModes,
      observedModes: new Map(),
    });

    expect(count).toBe(2);
    const resonantLimit = getPhaseVelocityLimit("resonant");
    // 4 kHz is far above the anchor: it saturates at the resonant layer
    // limit (fast relative motion time-averages out in nature too).
    expect(target[5]).toBeCloseTo(resonantLimit);
    expect(target[5]).toBeGreaterThan(getPhaseVelocityLimit("source-coupled"));
    // Phase continuity holds at the observation instant despite the clamp.
    expect(normalizePhaseRad(target[4] + target[5] * 1.5)).toBeCloseTo(-0.8);
  });

  it("computes an amplitude-and-authority-weighted anchor across slot sets", () => {
    const slotsA = new Float32Array([0, 0, 1, 1]);
    const slotsB = new Float32Array([0, 1, 0, 0.25]);
    const activeModes = new Map([
      [
        "0:0:1",
        buildOscillatorEntry({
          modeKey: "0:0:1",
          frequencyHz: 100,
          authority: 0.8,
        }),
      ],
      [
        "0:1:0",
        buildOscillatorEntry({
          modeKey: "0:1:0",
          frequencyHz: 300,
          authority: 0.8,
        }),
      ],
    ]);

    const anchor = computePhaseAnchorAngularVelocityRadPerSec({
      slotSets: [
        { visibleSlots: slotsA, capacity: 1 },
        { visibleSlots: slotsB, capacity: 1 },
      ],
      activeModes,
      observedModes: new Map(),
    });

    // Weights are amplitude·authority: (1·0.8·ω₁ + 0.25·0.8·ω₂) / (0.8 + 0.2)
    const omega1 = 2 * Math.PI * 100;
    const omega2 = 2 * Math.PI * 300;
    expect(anchor).toBeCloseTo((0.8 * omega1 + 0.2 * omega2) / 1.0, 9);
  });

  it("returns a zero anchor when no mode carries oscillator authority", () => {
    expect(
      computePhaseAnchorAngularVelocityRadPerSec({
        slotSets: [
          { visibleSlots: new Float32Array([0, 0, 1, 0.5]), capacity: 1 },
        ],
        activeModes: new Map(),
        observedModes: new Map(),
      }),
    ).toBe(0);
  });
});
