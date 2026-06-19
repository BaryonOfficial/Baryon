import { describe, expect, it } from "vitest";
import {
  getNoteNameForFrequency,
  getPitchClassForFrequency,
  pitchClassToHue,
} from "./pitch.js";

describe("neutral pitch helpers", () => {
  it("maps frequencies to stable pitch classes across octaves", () => {
    expect(getPitchClassForFrequency(110)).toBe(9);
    expect(getPitchClassForFrequency(220)).toBe(9);
    expect(getPitchClassForFrequency(440)).toBe(9);
    expect(getNoteNameForFrequency(440)).toBe("A");
  });

  it("keeps pitch-class hue as a neutral analysis phase helper", () => {
    expect(pitchClassToHue(0)).toBe(0);
    expect(pitchClassToHue(9)).toBeCloseTo(9 / 12);
    expect(pitchClassToHue(-1)).toBeCloseTo(11 / 12);
  });

  it("returns null for invalid acoustic frequencies", () => {
    expect(getPitchClassForFrequency(0)).toBeNull();
    expect(getPitchClassForFrequency(-440)).toBeNull();
    expect(getNoteNameForFrequency(Number.NaN)).toBeNull();
  });
});
