import { describe, expect, it } from "vitest";
import {
  DECAY_PER_FRAME,
  clearModalStack,
  countActiveSlots,
  decayModalStack,
  writeSlot,
} from "./modalStack.js";

// Slot layout: [u, v, w, amplitude] repeating at stride 4.
// Only amplitude (index 3 of each group) is touched by decay and active-slot counting.

function makeState(amplitudes) {
  const slots = new Float32Array(amplitudes.length * 4);
  const referenceSlots = new Float32Array(amplitudes.length * 4);
  for (let i = 0; i < amplitudes.length; i++) {
    slots[i * 4] = i + 1;       // u (non-zero, distinct per slot)
    slots[i * 4 + 1] = i + 1;   // v
    slots[i * 4 + 2] = i + 1;   // w
    slots[i * 4 + 3] = amplitudes[i];
    referenceSlots[i * 4 + 3] = amplitudes[i];
  }
  return { slots, referenceSlots };
}

describe("DECAY_PER_FRAME", () => {
  it("is 0.9 — changing this affects how long patterns persist after audio stops", () => {
    expect(DECAY_PER_FRAME).toBe(0.9);
  });
});

describe("decayModalStack", () => {
  it("multiplies each slot amplitude by DECAY_PER_FRAME once per call", () => {
    const state = makeState([1.0, 0.5]);
    decayModalStack(state);
    expect(state.slots[3]).toBeCloseTo(1.0 * DECAY_PER_FRAME);
    expect(state.slots[7]).toBeCloseTo(0.5 * DECAY_PER_FRAME);
  });

  it("applies geometric decay — amplitude after N calls equals initial * DECAY_PER_FRAME^N", () => {
    const initial = 1.0;
    const N = 10;
    const state = makeState([initial]);
    for (let i = 0; i < N; i++) decayModalStack(state);
    expect(state.slots[3]).toBeCloseTo(initial * Math.pow(DECAY_PER_FRAME, N));
  });

  it("converges toward zero after many calls", () => {
    const state = makeState([1.0]);
    for (let i = 0; i < 200; i++) decayModalStack(state);
    expect(state.slots[3]).toBeLessThan(1e-8);
  });

  it("does not touch mode coordinates (u, v, w) — only amplitude", () => {
    const state = makeState([0.8]);
    state.slots[0] = 3; // u
    state.slots[1] = 5; // v
    state.slots[2] = 7; // w
    decayModalStack(state);
    expect(state.slots[0]).toBe(3);
    expect(state.slots[1]).toBe(5);
    expect(state.slots[2]).toBe(7);
    expect(state.slots[3]).toBeCloseTo(0.8 * DECAY_PER_FRAME);
  });

  it("decays referenceSlots in parallel with slots", () => {
    const state = makeState([1.0]);
    state.referenceSlots[3] = 0.6;
    decayModalStack(state);
    expect(state.referenceSlots[3]).toBeCloseTo(0.6 * DECAY_PER_FRAME);
  });
});

describe("countActiveSlots", () => {
  it("counts slots where amplitude is greater than zero", () => {
    const { slots } = makeState([1.0, 0, 0.5, 0]);
    expect(countActiveSlots(slots, 4)).toBe(2);
  });

  it("returns 0 when all amplitudes are zero", () => {
    expect(countActiveSlots(new Float32Array(16), 4)).toBe(0);
  });

  it("returns capacity when all slots are active", () => {
    const { slots } = makeState([0.1, 0.2, 0.3, 0.4]);
    expect(countActiveSlots(slots, 4)).toBe(4);
  });

  it("respects capacity — does not count slots beyond the capacity limit", () => {
    // 3 slots in the buffer, but capacity restricts counting to the first 2
    const { slots } = makeState([1.0, 1.0, 1.0]);
    expect(countActiveSlots(slots, 2)).toBe(2);
  });
});

describe("writeSlot", () => {
  it("writes u, v, w, amplitude at the correct stride-4 offset", () => {
    const target = new Float32Array(8);
    writeSlot(target, 1, { u: 3, v: 5, w: 7 }, 0.42);
    expect(target[4]).toBe(3);    // u
    expect(target[5]).toBe(5);    // v
    expect(target[6]).toBe(7);    // w
    expect(target[7]).toBeCloseTo(0.42); // amplitude
  });
});

describe("clearModalStack", () => {
  it("zeroes all fields and resets metadata", () => {
    const state = {
      slots: new Float32Array([1, 2, 3, 0.9, 4, 5, 6, 0.5]),
      referenceSlots: new Float32Array([1, 2, 3, 0.8, 4, 5, 6, 0.4]),
      harmonicSupport: new Float32Array([0.9, 0.8, 0.7, 0.6]),
      fundamental: 440,
      fundamentalConfidence: 0.95,
      analysisEngine: "spectral",
      uniqueModeCount: 2,
    };
    clearModalStack(state);
    expect(state.slots.every((v) => v === 0)).toBe(true);
    expect(state.referenceSlots.every((v) => v === 0)).toBe(true);
    expect(state.harmonicSupport.every((v) => v === 0)).toBe(true);
    expect(state.fundamental).toBe(0);
    expect(state.fundamentalConfidence).toBe(0);
    expect(state.analysisEngine).toBe("none");
    expect(state.uniqueModeCount).toBe(0);
  });
});
