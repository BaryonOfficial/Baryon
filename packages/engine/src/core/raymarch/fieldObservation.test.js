import { describe, expect, it } from "vitest";
import {
  RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST,
  computeGorkovContrastFactors,
} from "./fieldObservation.js";

describe("radiation material contrast", () => {
  it("derives Gor'kov contrast weights from the named tracer material properties", () => {
    const contrast = computeGorkovContrastFactors();
    // Alpha quartz in 20 C water, using the aggregate adiabatic bulk modulus
    // rather than the longitudinal solid-wave speed.
    expect(contrast.monopole).toBeCloseTo(0.9421688042, 9);
    expect(contrast.dipole).toBeCloseTo(0.5243088656, 9);
    expect(
      RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.pressureEnergyWeight,
    ).toBeCloseTo(contrast.monopole / 3, 12);
    expect(
      RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.velocityEnergyWeight,
    ).toBeCloseTo(contrast.dipole / 2, 12);
  });
});
