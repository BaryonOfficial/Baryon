import { describe, expect, it } from "vitest";
import { writeBroadbandApertureBasis } from "./broadbandApertureBasis.js";
import {
  FIELD_CACHE_CELL_SIZE as cell,
  FIELD_CACHE_DOMAIN_HALF_EXTENT as extent,
  FIELD_CACHE_RESOLUTION as n,
} from "./fieldCacheGeometry.js";

const width = 19;
const cosine = (q, i) =>
  Math.cos(q * Math.PI * ((i + 0.5) * cell - extent + 1));

describe("finite spatial aperture in the cosine basis", () => {
  it.each([1.5, 3])(
    "matches literal clamped convolution at radius %s, including edges and reflection",
    (radius) => {
      const data = writeBroadbandApertureBasis(
        new Float32Array(((width * n) / 2) * 4),
        width,
        radius,
      );
      for (const [lane, fwhm, taps] of [
        [0, 0.104, 2],
        [1, 0.104, 6],
      ]) {
        const sigma = fwhm / (2 * Math.sqrt(2 * Math.LN2));
        const weights = Array.from({ length: taps * 2 + 1 }, (_, k) =>
          Math.exp(-(((k - taps) * radius * cell) ** 2) / (2 * sigma ** 2)),
        );
        const sum = weights.reduce((a, b) => a + b, 0);
        for (let q = 0; q < width; q++)
          for (let i = 0; i < n; i++) {
            const expected = weights.reduce(
              (value, weight, k) =>
                value +
                (weight / sum) *
                  cosine(q, Math.max(0, Math.min(n - 1, i + k - taps))),
              0,
            );
            const reflected = Math.max(i, n - 1 - i) - n / 2;
            expect(data[4 * (reflected * width + q) + lane]).toBeCloseTo(
              expected,
              7,
            );
          }
      }
    },
  );

  it("refreshes the same storage for continuous radius changes without retaining old weights", () => {
    const data = new Float32Array(((width * n) / 2) * 4);
    writeBroadbandApertureBasis(data, width, 1.5);
    const previous = data.slice();
    expect(writeBroadbandApertureBasis(data, width, 2.173)).toBe(data);
    expect(data).not.toEqual(previous);
    writeBroadbandApertureBasis(data, width, 1.5);
    expect(data).toEqual(previous);
    writeBroadbandApertureBasis(data, width);
    for (let i = 0; i < n / 2; i++)
      for (let q = 0; q < width; q++) {
        expect(data[4 * (i * width + q)]).toBe(
          Math.fround(cosine(q, i + n / 2)),
        );
        expect(data[4 * (i * width + q) + 1]).toBe(data[4 * (i * width + q)]);
      }
  });

  it.each([0, -1, NaN, Infinity])(
    "rejects an invalid physical radius %s before touching storage",
    (radius) => {
      const data = new Float32Array(((width * n) / 2) * 4).fill(7);
      expect(() => writeBroadbandApertureBasis(data, width, radius)).toThrow(
        /radius/,
      );
      expect(data.every((value) => value === 7)).toBe(true);
    },
  );
});
