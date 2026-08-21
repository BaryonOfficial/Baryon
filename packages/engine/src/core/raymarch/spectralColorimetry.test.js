import { describe, expect, it } from "vitest";
import {
  SPECTRAL_COLORIMETRY_REFERENCE,
  deriveRec709Luminance,
  generateSpectralColorimetrySamples,
  resolveSpectralChromaticity,
  resolveSpectralSourceRgb,
} from "./spectralColorimetry.js";

function linearRgbToOklab([red, green, blue]) {
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

describe("analytic spectral colorimetry", () => {
  it("uses the pinned two-harmonic presentation curve", () => {
    expect(SPECTRAL_COLORIMETRY_REFERENCE.harmonicOrder).toBe(2);
  });

  it("maps the whole phase circle to finite unit-luminance chromaticity", () => {
    let maximumLuminanceError = 0;
    for (const sample of generateSpectralColorimetrySamples(4096)) {
      expect(sample.chromaticity.every(Number.isFinite)).toBe(true);
      maximumLuminanceError = Math.max(
        maximumLuminanceError,
        Math.abs(deriveRec709Luminance(sample.chromaticity) - 1),
      );
    }
    expect(maximumLuminanceError).toBeLessThan(1e-12);
  });

  it("keeps the reference-luminance source wheel inside linear sRGB", () => {
    let minimumComponent = Number.POSITIVE_INFINITY;
    let maximumComponent = Number.NEGATIVE_INFINITY;
    let maximumLuminanceError = 0;
    for (const sample of generateSpectralColorimetrySamples(65536)) {
      minimumComponent = Math.min(minimumComponent, ...sample.sourceRgb);
      maximumComponent = Math.max(maximumComponent, ...sample.sourceRgb);
      maximumLuminanceError = Math.max(
        maximumLuminanceError,
        Math.abs(
          deriveRec709Luminance(sample.sourceRgb) -
            SPECTRAL_COLORIMETRY_REFERENCE.targetLuminance,
        ),
      );
    }
    expect(minimumComponent).toBeGreaterThanOrEqual(-1e-9);
    expect(maximumComponent).toBeLessThanOrEqual(1);
    expect(maximumLuminanceError).toBeLessThan(1e-12);
  });

  it("has a perceptual chroma floor without a neutral phase", () => {
    let minimumFixedLightnessChroma = Number.POSITIVE_INFINITY;
    let minimumLinearSaturation = Number.POSITIVE_INFINITY;
    for (const sample of generateSpectralColorimetrySamples(65536)) {
      const [lightness, a, b] = linearRgbToOklab(sample.chromaticity);
      const fixedLightnessChroma =
        (Math.hypot(a, b) *
          SPECTRAL_COLORIMETRY_REFERENCE.targetOklabLightness) /
        lightness;
      minimumFixedLightnessChroma = Math.min(
        minimumFixedLightnessChroma,
        fixedLightnessChroma,
      );
      const maximum = Math.max(...sample.sourceRgb);
      minimumLinearSaturation = Math.min(
        minimumLinearSaturation,
        (maximum - Math.min(...sample.sourceRgb)) / maximum,
      );
    }
    expect(minimumFixedLightnessChroma).toBeGreaterThanOrEqual(0.1);
    expect(minimumLinearSaturation).toBeGreaterThanOrEqual(0.61);
  });

  it("is cyclic, scale invariant, and deterministic for invalid input", () => {
    const reference = resolveSpectralChromaticity([1, 0]);
    expect(resolveSpectralChromaticity([10, 0])).toEqual(reference);
    const wrapped = resolveSpectralChromaticity([
      Math.cos(2 * Math.PI),
      Math.sin(2 * Math.PI),
    ]);
    for (let index = 0; index < 3; index += 1) {
      expect(wrapped[index]).toBeCloseTo(reference[index], 14);
    }
    expect(resolveSpectralChromaticity([Number.NaN, 0])).toEqual(reference);
    expect(resolveSpectralSourceRgb([0, 0]).every(Number.isFinite)).toBe(true);
  });

  it("proves RGB interpolation can turn two saturated phases grey", () => {
    const knownGreyPair = [100.5, 258.5].map((degrees) => {
      const radians = (degrees / 180) * Math.PI;
      return [Math.cos(radians), Math.sin(radians)];
    });
    const premixedRgb = resolveSpectralChromaticity(knownGreyPair[0]).map(
      (component, index) =>
        (component + resolveSpectralChromaticity(knownGreyPair[1])[index]) *
        0.5,
    );
    const premixedMaximum = Math.max(...premixedRgb);
    expect(
      (premixedMaximum - Math.min(...premixedRgb)) / premixedMaximum,
    ).toBeLessThan(0.01);

    for (const direction of knownGreyPair) {
      const chromaticity = resolveSpectralChromaticity(direction);
      const maximum = Math.max(...chromaticity);
      expect(
        (maximum - Math.min(...chromaticity)) / maximum,
      ).toBeGreaterThanOrEqual(0.61);
    }
  });

  it("keeps twelve equal phase classes perceptually multicolored", () => {
    const hueBins = new Set();
    for (let index = 0; index < 12; index += 1) {
      const radians = (index / 12) * 2 * Math.PI;
      const [, a, b] = linearRgbToOklab(
        resolveSpectralChromaticity([Math.cos(radians), Math.sin(radians)]),
      );
      const hue = (Math.atan2(b, a) / (2 * Math.PI) + 1) % 1;
      hueBins.add(Math.floor(hue * 12));
    }
    expect(hueBins.size).toBeGreaterThanOrEqual(9);
  });
});
