import { describe, expect, it } from "vitest";
import { isFinitePcmChannel } from "./pcmValidation.js";

describe("finite PCM channel validation", () => {
  it.each([Float32Array, Float64Array])(
    "accepts finite %s views without reading outside the channel",
    (ArrayType) => {
      const storage = new ArrayType([NaN, -2, -0, 0.5, Infinity]);
      const channel = storage.subarray(1, 4);
      expect(isFinitePcmChannel(channel, 3)).toBe(true);
      expect(isFinitePcmChannel(channel, 2)).toBe(false);
      expect(isFinitePcmChannel(channel, 4)).toBe(false);
      expect(isFinitePcmChannel(new ArrayType(0), 0)).toBe(true);
      expect(Array.from(channel)).toEqual([-2, -0, 0.5]);
    },
  );

  it.each([Float32Array, Float64Array])(
    "rejects nonfinite samples at every position in a %s channel",
    (ArrayType) => {
      for (const index of [0, 256, 511]) {
        for (const value of [NaN, Infinity, -Infinity]) {
          const channel = new ArrayType(512);
          channel[index] = value;
          expect(isFinitePcmChannel(channel, 512)).toBe(false);
          expect(channel[index]).toBe(value);
        }
      }
    },
  );

  it("rejects non-PCM storage and invalid lengths", () => {
    for (const value of [
      null,
      undefined,
      [0],
      new Int16Array(1),
      { length: 1 },
    ])
      expect(isFinitePcmChannel(value, 1)).toBe(false);
    for (const length of [-1, NaN, Infinity, 1.5, "1"])
      expect(isFinitePcmChannel(new Float64Array(1), length)).toBe(false);
  });
});
