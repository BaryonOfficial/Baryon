import { describe, expect, it } from "vitest";

import {
  buildModalTopologySlotKey,
  buildModalTopologyModeKey,
  collectActiveModalTopologyModeKeys,
  readModalTopologyMode,
} from "./modalTopology.js";

describe("modal topology identity", () => {
  it("normalizes topology coordinates before serializing a mode key", () => {
    expect(buildModalTopologyModeKey(1.2, 2.8, Number.NaN)).toBe("1:3:0");
  });

  it("gives equivalent topology representations the same identity", () => {
    const fromObject = readModalTopologyMode({ u: 1, v: 2, w: 3 });
    const fromSlots = readModalTopologyMode(new Float32Array([1, 2, 3, 0.75]));

    expect(buildModalTopologyModeKey(...fromObject)).toBe(
      buildModalTopologyModeKey(...fromSlots),
    );
  });

  it("reads a normalized topology identity from a packed modal slot", () => {
    const slots = new Float32Array([9, 9, 9, 0, 1.2, 2.8, Number.NaN, 0.5]);

    expect(buildModalTopologySlotKey(slots, 4)).toBe("1:3:0");
  });

  it("collects only active topology identities within capacity", () => {
    const slots = new Float32Array([1, 2, 3, 0.5, 4, 5, 6, 0, 7, 8, 9, 0.25]);

    expect([...collectActiveModalTopologyModeKeys(slots, 2)]).toEqual([
      "1:2:3",
    ]);
    expect(collectActiveModalTopologyModeKeys(null, 2).size).toBe(0);
  });
});
