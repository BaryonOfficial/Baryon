import { describe, expect, it } from "vitest";
import { createFftPlan, executeFft } from "./fft.js";

describe("shared complex FFT", () => {
  it.each([2, 4, 8, 32])(
    "matches a direct complex DFT and round-trips %i samples",
    (size) => {
      const real = Float64Array.from(
        { length: size },
        (_, index) => Math.sin(index * 0.73) + 0.2,
      );
      const imaginary = Float64Array.from(
        { length: size },
        (_, index) => 0.3 * Math.cos(index * 0.41),
      );
      const plan = createFftPlan(size);
      plan.real.set(real);
      plan.imaginary.set(imaginary);
      executeFft(plan);
      for (let bin = 0; bin < size; bin += 1) {
        let expectedReal = 0;
        let expectedImaginary = 0;
        for (let index = 0; index < size; index += 1) {
          const angle = (-2 * Math.PI * bin * index) / size;
          expectedReal +=
            real[index] * Math.cos(angle) - imaginary[index] * Math.sin(angle);
          expectedImaginary +=
            real[index] * Math.sin(angle) + imaginary[index] * Math.cos(angle);
        }
        expect(plan.real[bin]).toBeCloseTo(expectedReal, 10);
        expect(plan.imaginary[bin]).toBeCloseTo(expectedImaginary, 10);
      }
      executeFft(plan, true);
      for (let index = 0; index < size; index += 1) {
        expect(plan.real[index]).toBeCloseTo(real[index], 12);
        expect(plan.imaginary[index]).toBeCloseTo(imaginary[index], 12);
      }
    },
  );

  it.each([2048, 4096])(
    "reuses a production-size plan for forward and inverse transforms (%i)",
    (size) => {
      const plan = createFftPlan(size);
      for (const impulseIndex of [0, 1, size - 1]) {
        plan.real.fill(0);
        plan.imaginary.fill(0);
        plan.real[impulseIndex] = 0.75;
        plan.imaginary[impulseIndex] = -0.25;
        executeFft(plan);
        for (let bin = 0; bin < size; bin++) {
          const angle = (-2 * Math.PI * bin * impulseIndex) / size;
          expect(plan.real[bin]).toBeCloseTo(
            0.75 * Math.cos(angle) + 0.25 * Math.sin(angle),
            10,
          );
          expect(plan.imaginary[bin]).toBeCloseTo(
            0.75 * Math.sin(angle) - 0.25 * Math.cos(angle),
            10,
          );
        }
        executeFft(plan, true);
        for (let index = 0; index < size; index++) {
          expect(plan.real[index]).toBeCloseTo(
            index === impulseIndex ? 0.75 : 0,
            12,
          );
          expect(plan.imaginary[index]).toBeCloseTo(
            index === impulseIndex ? -0.25 : 0,
            12,
          );
        }
      }
    },
  );
});
