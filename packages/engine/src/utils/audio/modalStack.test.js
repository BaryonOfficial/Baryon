import { describe, expect, it } from "vitest";
import {
  clearModalStack,
  countActiveSlots,
  projectModalStack,
  projectSpectralMomentStack,
  sumModalSlotAmplitudes,
  writeSlot,
} from "./modalStack.js";

function makeState(amplitudes) {
  const slots = new Float32Array(amplitudes.length * 4);
  const referenceSlots = new Float32Array(amplitudes.length * 4);
  for (let index = 0; index < amplitudes.length; index += 1) {
    slots[index * 4] = index + 1;
    slots[index * 4 + 1] = index + 1;
    slots[index * 4 + 2] = index + 1;
    slots[index * 4 + 3] = amplitudes[index];
    referenceSlots[index * 4 + 3] = amplitudes[index];
  }
  return {
    slots,
    referenceSlots,
    spectralMomentSlots: new Float32Array(amplitudes.length * 4),
    referenceSpectralMomentSlots: new Float32Array(amplitudes.length * 4),
    harmonicSupport: new Float32Array(4),
    fundamental: 0,
    fundamentalConfidence: 0,
    analysisEngine: "none",
    uniqueModeCount: 0,
  };
}

describe("countActiveSlots", () => {
  it("counts positive coefficient slots within capacity", () => {
    expect(countActiveSlots(makeState([1, 0, 0.5, 0]).slots, 4)).toBe(2);
    expect(countActiveSlots(makeState([1, 1, 1]).slots, 2)).toBe(2);
  });

  it("returns zero for an empty coefficient page", () => {
    expect(countActiveSlots(new Float32Array(16), 4)).toBe(0);
  });
});

describe("sumModalSlotAmplitudes", () => {
  it("sums nonnegative packed coefficients within capacity", () => {
    const { slots } = makeState([0.25, -0.5, 0.75]);
    expect(sumModalSlotAmplitudes(slots)).toBe(1);
    expect(sumModalSlotAmplitudes(slots, 2)).toBe(0.25);
  });

  it("returns zero for non-slot inputs", () => {
    expect(sumModalSlotAmplitudes(null)).toBe(0);
    expect(sumModalSlotAmplitudes([])).toBe(0);
  });
});

describe("canonical projections", () => {
  it("publishes owner-owned coefficients without cadence blending", () => {
    const state = makeState([0, 0]);
    state.slots.set([9, 9, 9, 0.95, 0, 0, 0, 0]);
    const target = new Float32Array([1, 2, 3, 0.42, 4, 5, 6, 0.17]);

    projectModalStack(state, target, 2);

    expect(Array.from(state.slots)).toEqual(Array.from(target));
    expect(Array.from(state.referenceSlots)).toEqual(Array.from(target));
  });

  it("projects the four-component pitch basis in coefficient-slot order", () => {
    const state = makeState([0, 0]);
    const targetSlots = new Float32Array([1, 2, 3, 0.4, 4, 5, 6, 0.2]);
    const moments = new Float32Array([
      1, 0, 1, 0,
      0, 1, -1, 0,
    ]);

    projectSpectralMomentStack(state, targetSlots, moments, 2);

    expect(Array.from(state.spectralMomentSlots)).toEqual(Array.from(moments));
    expect(Array.from(state.referenceSpectralMomentSlots)).toEqual(
      Array.from(moments),
    );
  });

  it("clears unused pitch basis capacity", () => {
    const state = makeState([0, 0]);
    state.spectralMomentSlots.fill(1);
    state.referenceSpectralMomentSlots.fill(1);

    projectSpectralMomentStack(
      state,
      new Float32Array([1, 2, 3, 0.4]),
      new Float32Array([0.5, 0.5, 0, -1]),
      1,
    );

    expect(Array.from(state.spectralMomentSlots)).toEqual([
      0.5, 0.5, 0, -1,
      0, 0, 0, 0,
    ]);
  });
});

describe("writeSlot", () => {
  it("writes modal identity and coefficient at stride four", () => {
    const target = new Float32Array(8);
    writeSlot(target, 1, { u: 3, v: 5, w: 7 }, 0.42);
    expect(Array.from(target.slice(4, 8))).toEqual([
      3,
      5,
      7,
      expect.closeTo(0.42),
    ]);
  });
});

describe("clearModalStack", () => {
  it("zeroes coefficient and pitch-basis fields and resets metadata", () => {
    const state = makeState([0.9, 0.5]);
    state.spectralMomentSlots.fill(0.7);
    state.referenceSpectralMomentSlots.fill(0.8);
    state.harmonicSupport.fill(0.6);
    state.fundamental = 440;
    state.fundamentalConfidence = 0.95;
    state.analysisEngine = "spectral";
    state.uniqueModeCount = 2;

    clearModalStack(state);

    expect(state.slots.every((value) => value === 0)).toBe(true);
    expect(state.referenceSlots.every((value) => value === 0)).toBe(true);
    expect(state.spectralMomentSlots.every((value) => value === 0)).toBe(true);
    expect(
      state.referenceSpectralMomentSlots.every((value) => value === 0),
    ).toBe(true);
    expect(state.harmonicSupport.every((value) => value === 0)).toBe(true);
    expect(state).toMatchObject({
      fundamental: 0,
      fundamentalConfidence: 0,
      analysisEngine: "none",
      uniqueModeCount: 0,
    });
  });
});
