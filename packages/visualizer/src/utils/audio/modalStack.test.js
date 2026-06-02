import { describe, expect, it } from "vitest";
import {
  BLEND_ATTACK,
  BLEND_DROP_THRESHOLD,
  BLEND_RELEASE,
  BLEND_TRACKING,
  blendColorStack,
  blendModalStack,
  clearModalStack,
  countActiveSlots,
  writeSlot,
} from "./modalStack.js";

// Slot layout: [u, v, w, amplitude] repeating at stride 4.
// Active-slot counting only reads amplitude (index 3 of each group).

function makeState(amplitudes) {
  const slots = new Float32Array(amplitudes.length * 4);
  const referenceSlots = new Float32Array(amplitudes.length * 4);
  for (let i = 0; i < amplitudes.length; i++) {
    slots[i * 4] = i + 1; // u (non-zero, distinct per slot)
    slots[i * 4 + 1] = i + 1; // v
    slots[i * 4 + 2] = i + 1; // w
    slots[i * 4 + 3] = amplitudes[i];
    referenceSlots[i * 4 + 3] = amplitudes[i];
  }
  return {
    slots,
    referenceSlots,
    colorSlots: new Float32Array(amplitudes.length * 4),
    referenceColorSlots: new Float32Array(amplitudes.length * 4),
    harmonicSupport: new Float32Array(4),
    fundamental: 0,
    fundamentalConfidence: 0,
    analysisEngine: "none",
    uniqueModeCount: 0,
    spectralLightComponents: [],
  };
}

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
    expect(target[4]).toBe(3); // u
    expect(target[5]).toBe(5); // v
    expect(target[6]).toBe(7); // w
    expect(target[7]).toBeCloseTo(0.42); // amplitude
  });
});

describe("blendModalStack", () => {
  function makeBlendState(capacity, entries) {
    // entries: [{u, v, w, amplitude}]
    const slots = new Float32Array(capacity * 4);
    const referenceSlots = new Float32Array(capacity * 4);
    for (let i = 0; i < entries.length && i < capacity; i++) {
      const e = entries[i];
      slots[i * 4] = e.u;
      slots[i * 4 + 1] = e.v;
      slots[i * 4 + 2] = e.w;
      slots[i * 4 + 3] = e.amplitude;
      referenceSlots[i * 4 + 3] = e.amplitude;
    }
    return {
      slots,
      referenceSlots,
      colorSlots: new Float32Array(capacity * 4),
      referenceColorSlots: new Float32Array(capacity * 4),
      harmonicSupport: new Float32Array(4),
      fundamental: 0,
      fundamentalConfidence: 0,
      analysisEngine: "none",
      uniqueModeCount: entries.length,
      lastStableAt: 0,
      spectralLightComponents: [],
      latchedFundamentalHz: 0,
      latchedFundamentalConfidence: 0,
      latchHoldFrames: 0,
      latchLowSupportFrames: 0,
      driverFrequency: 0,
      candidateFrequency: 0,
      candidateConfidence: 0,
      candidateFrames: 0,
    };
  }

  function makeTargetSlots(capacity, entries) {
    const slots = new Float32Array(capacity * 4);
    for (let i = 0; i < entries.length && i < capacity; i++) {
      const e = entries[i];
      slots[i * 4] = e.u;
      slots[i * 4 + 1] = e.v;
      slots[i * 4 + 2] = e.w;
      slots[i * 4 + 3] = e.amplitude;
    }
    return slots;
  }

  function readSlots(state, capacity) {
    const result = [];
    for (let i = 0; i < capacity; i++) {
      const amp = state.slots[i * 4 + 3];
      if (amp > 0) {
        result.push({
          u: state.slots[i * 4],
          v: state.slots[i * 4 + 1],
          w: state.slots[i * 4 + 2],
          amplitude: amp,
        });
      }
    }
    return result;
  }

  it("tracking: existing mode amplitude blends toward target using tracking rate", () => {
    const state = makeBlendState(4, [{ u: 1, v: 1, w: 1, amplitude: 0.5 }]);
    const target = makeTargetSlots(4, [{ u: 1, v: 1, w: 1, amplitude: 1.0 }]);
    blendModalStack(state, target, 4);
    const out = readSlots(state, 4);
    expect(out).toHaveLength(1);
    expect(out[0].amplitude).toBeCloseTo(0.5 + (1.0 - 0.5) * BLEND_TRACKING);
  });

  it("release: mode absent from target decays by BLEND_RELEASE", () => {
    const state = makeBlendState(4, [{ u: 2, v: 2, w: 2, amplitude: 0.5 }]);
    const target = makeTargetSlots(4, []); // empty target
    blendModalStack(state, target, 4);
    const out = readSlots(state, 4);
    expect(out).toHaveLength(1);
    expect(out[0].amplitude).toBeCloseTo(0.5 * BLEND_RELEASE);
  });

  it("drop: mode whose blended amplitude falls below threshold is removed", () => {
    // amplitude that after release (* 0.94) falls below BLEND_DROP_THRESHOLD (1e-4)
    const tiny = BLEND_DROP_THRESHOLD * 0.5; // 5e-5; after release: ~4.7e-5 < 1e-4
    const state = makeBlendState(4, [{ u: 3, v: 3, w: 3, amplitude: tiny }]);
    const target = makeTargetSlots(4, []);
    blendModalStack(state, target, 4);
    const out = readSlots(state, 4);
    expect(out).toHaveLength(0);
  });

  it("admits all fresh modes by default so topology admission stays downstream", () => {
    const state = makeBlendState(8, []); // empty current
    // 4 fresh modes in target
    const target = makeTargetSlots(8, [
      { u: 1, v: 1, w: 1, amplitude: 0.9 },
      { u: 2, v: 2, w: 2, amplitude: 0.8 },
      { u: 3, v: 3, w: 3, amplitude: 0.7 },
      { u: 4, v: 4, w: 4, amplitude: 0.6 },
    ]);
    blendModalStack(state, target, 8);
    const out = readSlots(state, 8);
    expect(out).toHaveLength(4);
  });

  it("an explicit helper fresh cap does not affect existing modes", () => {
    // 3 existing modes + 6 fresh modes; all 3 existing should survive + explicit cap fresh
    const state = makeBlendState(10, [
      { u: 1, v: 1, w: 1, amplitude: 0.8 },
      { u: 2, v: 2, w: 2, amplitude: 0.7 },
      { u: 3, v: 3, w: 3, amplitude: 0.6 },
    ]);
    const target = makeTargetSlots(10, [
      { u: 1, v: 1, w: 1, amplitude: 0.8 }, // existing
      { u: 2, v: 2, w: 2, amplitude: 0.7 }, // existing
      { u: 3, v: 3, w: 3, amplitude: 0.6 }, // existing
      { u: 4, v: 4, w: 4, amplitude: 0.5 }, // fresh
      { u: 5, v: 5, w: 5, amplitude: 0.4 }, // fresh
      { u: 6, v: 6, w: 6, amplitude: 0.3 }, // fresh
      { u: 7, v: 7, w: 7, amplitude: 0.2 }, // fresh
      { u: 8, v: 8, w: 8, amplitude: 0.15 }, // fresh
      { u: 9, v: 9, w: 9, amplitude: 0.1 }, // fresh
    ]);
    blendModalStack(state, target, 10, { freshCap: 2 });
    const out = readSlots(state, 10);
    expect(out).toHaveLength(5);
  });

  it("attack: fresh mode enters at attack rate (from zero)", () => {
    const state = makeBlendState(4, []); // empty current
    const target = makeTargetSlots(4, [{ u: 5, v: 5, w: 5, amplitude: 1.0 }]);
    blendModalStack(state, target, 4);
    const out = readSlots(state, 4);
    expect(out).toHaveLength(1);
    expect(out[0].amplitude).toBeCloseTo(1.0 * BLEND_ATTACK);
  });

  it("stores the raw target separately from the blended live stack", () => {
    const state = makeBlendState(4, []);
    const target = makeTargetSlots(4, [{ u: 5, v: 5, w: 5, amplitude: 1.0 }]);
    blendModalStack(state, target, 4);
    expect(state.slots[3]).toBeCloseTo(1.0 * BLEND_ATTACK);
    expect(state.referenceSlots[0]).toBe(5);
    expect(state.referenceSlots[1]).toBe(5);
    expect(state.referenceSlots[2]).toBe(5);
    expect(state.referenceSlots[3]).toBeCloseTo(1.0);
  });

  it("tracking option: custom tracking rate overrides default", () => {
    const state = makeBlendState(4, [{ u: 1, v: 1, w: 1, amplitude: 0.5 }]);
    const target = makeTargetSlots(4, [{ u: 1, v: 1, w: 1, amplitude: 1.0 }]);
    blendModalStack(state, target, 4, { tracking: 0.9 });
    const out = readSlots(state, 4);
    expect(out[0].amplitude).toBeCloseTo(0.5 + (1.0 - 0.5) * 0.9);
  });

  it("trackingOverrides accelerates retained modes toward weaker targets", () => {
    const state = makeBlendState(4, [{ u: 1, v: 1, w: 1, amplitude: 0.8 }]);
    const target = makeTargetSlots(4, [{ u: 1, v: 1, w: 1, amplitude: 0.2 }]);
    blendModalStack(state, target, 4, {
      tracking: 0.28,
      trackingOverrides: new Map([["1:1:1", 0.9]]),
    });
    const out = readSlots(state, 4);
    expect(out[0].amplitude).toBeCloseTo(0.8 + (0.2 - 0.8) * 0.9);
  });

  it("attack option: custom attack rate overrides default", () => {
    const state = makeBlendState(4, []);
    const target = makeTargetSlots(4, [{ u: 7, v: 7, w: 7, amplitude: 1.0 }]);
    blendModalStack(state, target, 4, { attack: 0.8 });
    const out = readSlots(state, 4);
    expect(out[0].amplitude).toBeCloseTo(1.0 * 0.8);
  });

  it("freshCap: 0 admits all fresh modes without limit", () => {
    const state = makeBlendState(8, []);
    const target = makeTargetSlots(8, [
      { u: 1, v: 1, w: 1, amplitude: 0.9 },
      { u: 2, v: 2, w: 2, amplitude: 0.8 },
      { u: 3, v: 3, w: 3, amplitude: 0.7 },
      { u: 4, v: 4, w: 4, amplitude: 0.6 },
      { u: 5, v: 5, w: 5, amplitude: 0.5 },
      { u: 6, v: 6, w: 6, amplitude: 0.4 },
    ]);
    blendModalStack(state, target, 8, { freshCap: 0 });
    const out = readSlots(state, 8);
    expect(out).toHaveLength(6); // all admitted
  });

  it("empty target: all current modes decay by release factor", () => {
    const state = makeBlendState(4, [
      { u: 1, v: 1, w: 1, amplitude: 0.8 },
      { u: 2, v: 2, w: 2, amplitude: 0.6 },
    ]);
    const target = makeTargetSlots(4, []);
    blendModalStack(state, target, 4);
    const out = readSlots(state, 4);
    expect(out).toHaveLength(2);
    expect(
      out.find((e) => e.u === 1 && e.v === 1 && e.w === 1).amplitude,
    ).toBeCloseTo(0.8 * BLEND_RELEASE);
    expect(
      out.find((e) => e.u === 2 && e.v === 2 && e.w === 2).amplitude,
    ).toBeCloseTo(0.6 * BLEND_RELEASE);
  });

  it("emptyTargetRelease accelerates silence tails", () => {
    const state = makeBlendState(4, [{ u: 2, v: 2, w: 2, amplitude: 0.5 }]);
    const target = makeTargetSlots(4, []);
    blendModalStack(state, target, 4, { emptyTargetRelease: 0.7 });
    const out = readSlots(state, 4);
    expect(out).toHaveLength(1);
    expect(out[0].amplitude).toBeCloseTo(0.5 * 0.7);
  });

  it("lowSignalRelease accelerates weak residual slots", () => {
    const state = makeBlendState(4, [{ u: 4, v: 4, w: 4, amplitude: 0.08 }]);
    const target = makeTargetSlots(4, [{ u: 1, v: 1, w: 1, amplitude: 0.4 }]);
    blendModalStack(state, target, 4, {
      lowSignalReleaseThreshold: 0.1,
      lowSignalRelease: 0.5,
    });
    const out = readSlots(state, 4);
    expect(out).toHaveLength(2);
    expect(
      out.find((entry) => entry.u === 4 && entry.v === 4 && entry.w === 4)
        .amplitude,
    ).toBeCloseTo(0.08 * 0.5);
  });
});

describe("blendColorStack", () => {
  it("tracks colors by modal key instead of slot index", () => {
    const state = {
      ...makeState([0.8, 0.5]),
      slots: new Float32Array([1, 1, 1, 0.8, 2, 2, 2, 0.5]),
      colorSlots: new Float32Array([1, 0, 0, 0.9, 0, 1, 0, 0.6]),
      referenceColorSlots: new Float32Array(8),
    };
    const targetSlots = new Float32Array([2, 2, 2, 0.7, 1, 1, 1, 0.6]);
    const targetColors = new Float32Array([0, 0, 1, 0.8, 1, 1, 0, 0.7]);

    blendColorStack(state, targetSlots, targetColors, 2, {
      attack: 1,
      tracking: 1,
      release: 1,
      maxActiveSlots: 2,
    });

    expect(Array.from(state.colorSlots)).toEqual([
      1,
      1,
      0,
      expect.closeTo(0.7, 6),
      0,
      0,
      1,
      expect.closeTo(0.8, 6),
    ]);
    expect(Array.from(state.referenceColorSlots)).toEqual([
      1,
      1,
      0,
      expect.closeTo(0.7, 6),
      0,
      0,
      1,
      expect.closeTo(0.8, 6),
    ]);
  });

  it("suppresses weaker color contributors beyond the active cap", () => {
    const state = {
      ...makeState([0.9, 0.8, 0.7]),
      slots: new Float32Array([1, 1, 1, 0.9, 2, 2, 2, 0.8, 3, 3, 3, 0.7]),
      colorSlots: new Float32Array(12),
      referenceColorSlots: new Float32Array(12),
    };
    const targetSlots = new Float32Array([
      1, 1, 1, 0.9, 2, 2, 2, 0.8, 3, 3, 3, 0.7,
    ]);
    const targetColors = new Float32Array([
      1, 0, 0, 0.9, 0, 1, 0, 0.7, 0, 0, 1, 0.4,
    ]);

    blendColorStack(state, targetSlots, targetColors, 3, {
      attack: 1,
      tracking: 1,
      release: 1,
      maxActiveSlots: 2,
    });

    expect(state.colorSlots[3]).toBeCloseTo(0.9);
    expect(state.colorSlots[7]).toBeCloseTo(0.7);
    expect(state.colorSlots[11]).toBe(0);
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
      lastStableAt: 123,
      latchedFundamentalHz: 440,
      latchedFundamentalConfidence: 0.9,
      latchHoldFrames: 4,
      latchLowSupportFrames: 2,
      driverFrequency: 440,
      candidateFrequency: 660,
      candidateConfidence: 0.7,
      candidateFrames: 3,
    };
    clearModalStack(state);
    expect(state.slots.every((v) => v === 0)).toBe(true);
    expect(state.referenceSlots.every((v) => v === 0)).toBe(true);
    expect(state.harmonicSupport.every((v) => v === 0)).toBe(true);
    expect(state.fundamental).toBe(0);
    expect(state.fundamentalConfidence).toBe(0);
    expect(state.analysisEngine).toBe("none");
    expect(state.uniqueModeCount).toBe(0);
    expect(state.lastStableAt).toBe(0);
    expect(state.latchedFundamentalHz).toBe(0);
    expect(state.latchedFundamentalConfidence).toBe(0);
    expect(state.latchHoldFrames).toBe(0);
    expect(state.latchLowSupportFrames).toBe(0);
    expect(state.driverFrequency).toBe(0);
    expect(state.candidateFrequency).toBe(0);
    expect(state.candidateConfidence).toBe(0);
    expect(state.candidateFrames).toBe(0);
  });
});
