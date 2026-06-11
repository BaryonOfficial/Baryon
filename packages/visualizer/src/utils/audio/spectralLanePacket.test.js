import { describe, expect, it } from "vitest";
import { normalizeSpectralLanePacket } from "./spectralLanePacket.js";

describe("normalizeSpectralLanePacket", () => {
  it("normalizes finite nonnegative lane weights across both packed lanes", () => {
    const packet = normalizeSpectralLanePacket([2, 0, 1, 0], [0, 1, 0, 0]);

    expect(packet.laneA).toEqual([0.5, 0, 0.25, 0]);
    expect(packet.laneB).toEqual([0, 0.25, 0, 0]);
  });

  it("drops negative and nonfinite lane weights before normalization", () => {
    const packet = normalizeSpectralLanePacket(
      [2, -1, Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 1, 0, 0],
    );

    expect(packet.laneA).toEqual([2 / 3, 0, 0, 0]);
    expect(packet.laneB).toEqual([0, 1 / 3, 0, 0]);
  });
});
