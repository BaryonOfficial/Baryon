import { describe, expect, it } from "vitest";
import { createFftPlan, executeFft } from "./fft.js";
import { createRealFftPlan, executeRealFft } from "./realFft.js";

describe("real-signal FFT", () => {
  it.each([2, 4, 8, 64, 2048, 4096])(
    "matches the complete complex FFT and round-trips %i samples",
    (size) => {
      const plan = createRealFftPlan(size);
      const complex = createFftPlan(size);
      let seed = 1927;
      const noise = Float64Array.from({ length: size }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32 - 0.5;
      });
      for (const input of [
        new Float64Array(size),
        new Float64Array(size).fill(0.3),
        Float64Array.from({ length: size }, (_, n) => (-1) ** n),
        Float64Array.from({ length: size }, (_, n) => +(n === size - 1)),
        noise,
        noise.map((x) => x * 1e-12),
      ]) {
        plan.real.set(input);
        complex.real.set(input);
        complex.imaginary.fill(0);
        executeFft(complex);
        executeRealFft(plan);
        const scale = Math.max(...input.map(Math.abs));
        const spectralTolerance = Math.max(scale * size * 2e-14, 1e-300);
        for (let n = 0; n < size; n++) {
          expect(Math.abs(plan.real[n] - complex.real[n])).toBeLessThan(
            spectralTolerance,
          );
          expect(
            Math.abs(plan.imaginary[n] - complex.imaginary[n]),
          ).toBeLessThan(spectralTolerance);
        }
        expect(plan.imaginary[0]).toBe(0);
        expect(plan.imaginary[size / 2]).toBe(0);
        // Supply the independently computed Hermitian spectrum to the inverse.
        // A mutually wrong forward/inverse pair cannot pass on round-trip alone.
        plan.real.set(complex.real);
        plan.imaginary.set(complex.imaginary);
        executeRealFft(plan, true);
        for (let n = 0; n < size; n++) {
          expect(Math.abs(plan.real[n] - input[n])).toBeLessThan(
            Math.max(scale * 2e-14, 1e-300),
          );
          expect(plan.imaginary[n]).toBe(0);
        }
      }
    },
  );

  it.each([0, 1, 3, 12, NaN, Infinity])("rejects invalid size %s", (size) => {
    expect(() => createRealFftPlan(size)).toThrow(RangeError);
  });
});
