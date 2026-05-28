import { describe, expect, it } from "vitest";
import {
  SPECTRAL_CIE_1931_2DEG_5NM,
  SPECTRAL_CIE_STEP_NM,
  SPECTRAL_VISIBLE_RED_NM,
  SPECTRAL_VISIBLE_VIOLET_NM,
  compressLinearSrgbToGamut,
  createEqualEnergySpectralLightColor,
  createSpectralLightColor,
  foldAudioFrequencyToSpectralPhase,
  sampleCie1931,
  spectralPhaseToWavelengthNm,
} from "./spectralLight.js";

function channelDelta(left, right) {
  return Math.max(
    Math.abs(left.r - right.r),
    Math.abs(left.g - right.g),
    Math.abs(left.b - right.b),
  );
}

describe("Spectral Light color science", () => {
  it("exports the expected 5 nm CIE 1931 observer table", () => {
    expect(SPECTRAL_VISIBLE_VIOLET_NM).toBe(380);
    expect(SPECTRAL_VISIBLE_RED_NM).toBe(780);
    expect(SPECTRAL_CIE_STEP_NM).toBe(5);
    expect(SPECTRAL_CIE_1931_2DEG_5NM).toHaveLength(81);
    expect(sampleCie1931(380)).toEqual(SPECTRAL_CIE_1931_2DEG_5NM[0]);
    expect(sampleCie1931(780)).toEqual(SPECTRAL_CIE_1931_2DEG_5NM[80]);
  });

  it("linearly interpolates between CIE table rows", () => {
    const left = sampleCie1931(440);
    const right = sampleCie1931(445);
    const middle = sampleCie1931(442.5);

    expect(middle.x).toBeCloseTo((left.x + right.x) / 2, 12);
    expect(middle.y).toBeCloseTo((left.y + right.y) / 2, 12);
    expect(middle.z).toBeCloseTo((left.z + right.z) / 2, 12);
  });

  it("folds octaves to the same spectral phase and visible color", () => {
    const lowA = createSpectralLightColor({
      frequency: 440,
      strength: 0.8,
      harmonicConfidence: 0.8,
    });
    const highA = createSpectralLightColor({
      frequency: 880,
      strength: 0.8,
      harmonicConfidence: 0.8,
    });

    expect(foldAudioFrequencyToSpectralPhase(440)).toBeCloseTo(
      foldAudioFrequencyToSpectralPhase(880),
      12,
    );
    expect(lowA.wavelengthNm).toBeCloseTo(highA.wavelengthNm, 10);
    expect(channelDelta(lowA.rgb, highA.rgb)).toBeLessThan(1e-9);
    expect(lowA.weight).toBeCloseTo(highA.weight, 12);
  });

  it("keeps common musical notes chromatic instead of compressing them to white", () => {
    for (const frequency of [220, 261.63, 329.63, 440, 523.25, 659.25]) {
      const color = createSpectralLightColor({
        frequency,
        strength: 0.8,
        harmonicConfidence: 0.8,
      });
      const spread =
        Math.max(color.rgb.r, color.rgb.g, color.rgb.b) -
        Math.min(color.rgb.r, color.rgb.g, color.rgb.b);

      expect(spread).toBeGreaterThan(0.45);
    }
  });

  it("maps phase endpoints onto the selected visible wavelength range", () => {
    expect(spectralPhaseToWavelengthNm(0)).toBeCloseTo(780, 12);
    expect(spectralPhaseToWavelengthNm(1)).toBeCloseTo(780, 12);
    expect(spectralPhaseToWavelengthNm(0.5)).toBeGreaterThan(380);
    expect(spectralPhaseToWavelengthNm(0.5)).toBeLessThan(780);
  });

  it("leaves already in-gamut linear sRGB unchanged", () => {
    const color = { r: 0.22, g: 0.48, b: 0.73 };

    expect(compressLinearSrgbToGamut(color)).toEqual(color);
  });

  it("compresses out-of-gamut spectral samples into finite linear sRGB", () => {
    const compressed = compressLinearSrgbToGamut({
      r: 1.32,
      g: -0.18,
      b: 0.42,
    });

    for (const channel of [compressed.r, compressed.g, compressed.b]) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it("keeps equal-energy reference color near neutral after normalization", () => {
    const reference = createEqualEnergySpectralLightColor();
    const spread =
      Math.max(reference.rgb.r, reference.rgb.g, reference.rgb.b) -
      Math.min(reference.rgb.r, reference.rgb.g, reference.rgb.b);

    expect(reference.weight).toBe(1);
    expect(spread).toBeLessThan(0.08);
  });

  it("gates weak composite strength before harmonic mixing", () => {
    const weak = createSpectralLightColor({
      frequency: 427.239,
      strength: 0.01,
      harmonicConfidence: 0.8,
    });
    const moderate = createSpectralLightColor({
      frequency: 427.239,
      strength: 0.2,
      harmonicConfidence: 0.8,
    });

    expect(weak.weight).toBeLessThan(moderate.weight);
    expect(weak.weight).toBeLessThan(0.2);
    expect(moderate.weight).toBeGreaterThan(0.45);
    expect(channelDelta(moderate.rgb, { r: 0, g: 0, b: 0 })).toBeGreaterThan(
      0.5,
    );
  });

  it("returns zero color weight for invalid or absent entries", () => {
    expect(createSpectralLightColor({ frequency: 0 }).weight).toBe(0);
    expect(
      createSpectralLightColor({ frequency: 440, strength: 0 }).weight,
    ).toBe(0);
  });
});
