import { describe, expect, it } from "vitest";

import { getRelativeFrequencyDistance } from "./frequencyDistance.js";

describe("getRelativeFrequencyDistance", () => {
  it("is symmetric and scale relative", () => {
    expect(getRelativeFrequencyDistance(440, 484)).toBeCloseTo(1 / 11);
    expect(getRelativeFrequencyDistance(484, 440)).toBeCloseTo(1 / 11);
    expect(getRelativeFrequencyDistance(880, 968)).toBeCloseTo(1 / 11);
  });

  it("stays finite for zero-valued boundary inputs", () => {
    expect(getRelativeFrequencyDistance(0, 0)).toBe(0);
    expect(getRelativeFrequencyDistance(0, 440)).toBeLessThanOrEqual(1);
  });
});
