import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeLinearLuminance,
  compressDisplayLuminance,
  compressDisplayRadiance,
  composeFixedOpticalPsfRadiance,
  DISPLAY_RADIANCE_HEADROOM_CONTRACT,
  evaluateIntegratedSceneLinearHeadroom,
  FIXED_OPTICAL_PSF_CORE_FRACTION,
  FIXED_OPTICAL_PSF_HALO_FRACTION,
  FIXED_OPTICAL_PSF_KERNEL_WEIGHTS,
  FIXED_OPTICAL_PSF_RADIUS_PIXELS,
} from "./displayRadiance.js";

function channelRatio(rgb) {
  return [rgb[1] / rgb[0], rgb[2] / rgb[0]];
}

function peakNormalized(rgb) {
  const peak = Math.max(...rgb);
  return rgb.map((channel) => channel / peak);
}

describe("display radiance", () => {
  it("exports the exact pre-shoulder scene-linear headroom contract", () => {
    expect(DISPLAY_RADIANCE_HEADROOM_CONTRACT).toEqual({
      coverageEpsilon: 1e-5,
      luminanceP99Max: 0.72,
      maxChannelP99Max: 2,
      overloadThreshold: 2,
      overloadShareMax: 0.01,
    });
  });

  it("evaluates the integrated volume radiance without dividing by coverage", () => {
    const result = evaluateIntegratedSceneLinearHeadroom({
      premultipliedRadiance: new Float32Array([
        0.06, 0.12, 0.18, 1, 0.1, 0.2, 0.3, 1,
      ]),
      coverage: new Float32Array([0.2, 0, 0, 1, 0.5, 0, 0, 1]),
    });

    expect(result.achieved).toBe(true);
    expect(result.activeSampleCount).toBe(2);
    expect(result.integratedRadianceMaxChannelP99).toBeCloseTo(0.3);
    expect(result.overloadShare).toBe(0);
  });

  it("admits bounded chromatic HDR as a bloom source", () => {
    const result = evaluateIntegratedSceneLinearHeadroom({
      premultipliedRadiance: new Float32Array([1.8, 0, 0, 1]),
      coverage: new Float32Array([1, 0, 0, 1]),
    });

    expect(result.achieved).toBe(true);
    expect(result.integratedRadianceMaxChannelP99).toBeCloseTo(1.8);
    expect(result.overloadShare).toBe(0);
  });

  it.each([[[2.2, 0, 0]], [[0, 2.2, 0]], [[0, 0, 2.2]]])(
    "rejects saturated channel overload at rgb %j even without near-white pixels",
    (rgb) => {
      const result = evaluateIntegratedSceneLinearHeadroom({
        premultipliedRadiance: new Float32Array([...rgb, 1]),
        coverage: new Float32Array([1, 0, 0, 1]),
      });

      expect(result.achieved).toBe(false);
      expect(result.integratedRadianceMaxChannelP99).toBeGreaterThan(2);
      expect(result.overloadShare).toBe(1);
    },
  );

  it("fails closed on nonfinite or empty active evidence", () => {
    const nonfinite = evaluateIntegratedSceneLinearHeadroom({
      premultipliedRadiance: [Number.NaN, 0.1, 0.1, 1],
      coverage: [1, 0, 0, 1],
    });
    const empty = evaluateIntegratedSceneLinearHeadroom({
      premultipliedRadiance: [0, 0, 0, 1],
      coverage: [0, 0, 0, 1],
    });

    expect(nonfinite).toMatchObject({ achieved: false, reason: "nonfinite" });
    expect(empty).toMatchObject({
      achieved: false,
      reason: "no-active-samples",
    });
  });

  it("uses a normalized fixed PSF that preserves a constant radiance field", () => {
    const radiance = [0.42, 0.31, 0.18];

    expect(composeFixedOpticalPsfRadiance(radiance, radiance)).toEqual([
      expect.closeTo(radiance[0]),
      expect.closeTo(radiance[1]),
      expect.closeTo(radiance[2]),
    ]);
  });

  it("keeps 95 percent sharp radiance and a normalized one-pixel wing", () => {
    const kernelEnergy = FIXED_OPTICAL_PSF_KERNEL_WEIGHTS.reduce(
      (sum, weight) => sum + weight,
      0,
    );

    expect(FIXED_OPTICAL_PSF_CORE_FRACTION).toBeCloseTo(0.95);
    expect(FIXED_OPTICAL_PSF_HALO_FRACTION).toBeCloseTo(0.05);
    expect(FIXED_OPTICAL_PSF_RADIUS_PIXELS).toBe(1);
    expect(FIXED_OPTICAL_PSF_KERNEL_WEIGHTS).toHaveLength(9);
    expect(kernelEnergy).toBeCloseTo(1);
    expect(
      FIXED_OPTICAL_PSF_CORE_FRACTION +
        FIXED_OPTICAL_PSF_HALO_FRACTION * kernelEnergy,
    ).toBeCloseTo(1);
  });

  it("packs the 3x3 binomial PSF into four exact bilinear reads", () => {
    const source = readFileSync(
      new URL("./displayRadiance.js", import.meta.url),
      "utf8",
    );
    const block = source.slice(
      source.indexOf("const FIXED_OPTICAL_PSF_BILINEAR_OFFSETS"),
      source.indexOf("function finiteOr"),
    );

    expect(block.match(/Object\.freeze\(\{ x:/g)).toHaveLength(4);
    for (const offset of [
      "{ x: -0.5, y: -0.5 }",
      "{ x: 0.5, y: -0.5 }",
      "{ x: -0.5, y: 0.5 }",
      "{ x: 0.5, y: 0.5 }",
    ]) {
      expect(block).toContain(offset);
    }
    expect(source).toContain(
      "radianceTexture.sample(sampleUv).mul(float(0.25))",
    );

    const width = 5;
    const height = 4;
    const pixels = Array.from(
      { length: width * height },
      (_, index) => ((index * 17 + 3) % 29) / 28,
    );
    const read = (x, y) =>
      pixels[
        Math.max(0, Math.min(height - 1, y)) * width +
          Math.max(0, Math.min(width - 1, x))
      ];
    const bilinear = (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const tx = x - x0;
      const ty = y - y0;
      return (
        read(x0, y0) * (1 - tx) * (1 - ty) +
        read(x0 + 1, y0) * tx * (1 - ty) +
        read(x0, y0 + 1) * (1 - tx) * ty +
        read(x0 + 1, y0 + 1) * tx * ty
      );
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let reference = 0;
        let weightIndex = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            reference +=
              read(x + dx, y + dy) *
              FIXED_OPTICAL_PSF_KERNEL_WEIGHTS[weightIndex];
            weightIndex += 1;
          }
        }
        const packed =
          0.25 *
          (bilinear(x - 0.5, y - 0.5) +
            bilinear(x + 0.5, y - 0.5) +
            bilinear(x - 0.5, y + 0.5) +
            bilinear(x + 0.5, y + 0.5));
        expect(packed).toBeCloseTo(reference, 15);
      }
    }
  });

  it("uses linear sRGB relative luminance", () => {
    expect(computeLinearLuminance([1, 1, 1])).toBeCloseTo(1);
    expect(computeLinearLuminance([1, 0, 0])).toBeCloseTo(0.2126);
    expect(computeLinearLuminance([0, 1, 0])).toBeCloseTo(0.7152);
    expect(computeLinearLuminance([0, 0, 1])).toBeCloseTo(0.0722);
  });

  it("leaves midtone luminance unchanged and compresses highlights", () => {
    expect(compressDisplayLuminance(0.5)).toBeCloseTo(0.5);

    const compressed = compressDisplayLuminance(1.2);
    const expected = 0.72 + (0.96 - 0.72) * (1 - Math.exp(-(1.2 - 0.72) / 1.2));

    expect(compressed).toBeCloseTo(expected);
    expect(compressed).toBeGreaterThan(0.72);
    expect(compressed).toBeLessThan(0.96);
  });

  it("preserves luminance separation across the caustic highlight range", () => {
    const referenceHighlight = compressDisplayLuminance(1.1);
    const focusedHighlight = compressDisplayLuminance(2.2);
    const strongHighlight = compressDisplayLuminance(4.4);

    expect(focusedHighlight - referenceHighlight).toBeGreaterThan(0.08);
    expect(strongHighlight - focusedHighlight).toBeGreaterThan(0.04);
    expect(strongHighlight).toBeLessThan(0.96);
  });

  it("keeps flagship cyan chromatic across the caustic highlight range", () => {
    const flagshipCyanLinear = [
      0.10461648408208657, 0.7681511472425809, 0.9046611743890203,
    ];
    const renderAtIntensity = (intensity) =>
      compressDisplayRadiance(
        flagshipCyanLinear.map((channel) => channel * intensity),
      );
    const moderate = renderAtIntensity(1.25);
    const focused = renderAtIntensity(1.5);
    const strong = renderAtIntensity(3);
    const sourceChromaticity = peakNormalized(flagshipCyanLinear);

    for (const rendered of [moderate, focused, strong]) {
      const renderedChromaticity = peakNormalized(rendered);
      expect(renderedChromaticity[0]).toBeCloseTo(sourceChromaticity[0]);
      expect(renderedChromaticity[1]).toBeCloseTo(sourceChromaticity[1]);
      expect(renderedChromaticity[2]).toBeCloseTo(sourceChromaticity[2]);
      expect(Math.max(...rendered) - Math.min(...rendered)).toBeGreaterThan(
        0.7,
      );
    }
    expect(Math.max(...strong)).toBeLessThanOrEqual(0.985);
  });

  it("preserves representative spectral chromaticities at high radiance", () => {
    const spectralColors = [
      [1, 0.08, 0.02],
      [0.05, 1, 0.12],
      [0.08, 0.2, 1],
      [0.72, 0.06, 1],
    ];

    for (const spectralColor of spectralColors) {
      const highRadiance = spectralColor.map((channel) => channel * 8);
      const compressed = compressDisplayRadiance(highRadiance);
      const sourceChromaticity = peakNormalized(spectralColor);
      const outputChromaticity = peakNormalized(compressed);

      expect(Math.max(...compressed)).toBeLessThanOrEqual(0.985 + 1e-12);
      expect(outputChromaticity[0]).toBeCloseTo(sourceChromaticity[0]);
      expect(outputChromaticity[1]).toBeCloseTo(sourceChromaticity[1]);
      expect(outputChromaticity[2]).toBeCloseTo(sourceChromaticity[2]);
      expect(Math.max(...compressed) - Math.min(...compressed)).toBeGreaterThan(
        0.8,
      );
    }
  });

  it("preserves hue ratios for in-gamut radiance", () => {
    const rgb = [0.7, 0.35, 0.175];
    const compressed = compressDisplayRadiance(rgb);

    expect(Math.max(...compressed)).toBeLessThanOrEqual(0.985);
    expect(computeLinearLuminance(compressed)).toBeCloseTo(
      computeLinearLuminance(rgb),
    );
    expect(channelRatio(compressed)[0]).toBeCloseTo(channelRatio(rgb)[0]);
    expect(channelRatio(compressed)[1]).toBeCloseTo(channelRatio(rgb)[1]);
  });

  it("preserves channel ratios while fitting highlights into gamut", () => {
    const rgb = [2, 1, 0.5];
    const compressed = compressDisplayRadiance(rgb);
    const shoulderLuminance = compressDisplayLuminance(
      computeLinearLuminance(rgb),
    );

    expect(Math.max(...compressed)).toBeLessThanOrEqual(0.985);
    expect(channelRatio(compressed)[0]).toBeCloseTo(channelRatio(rgb)[0]);
    expect(channelRatio(compressed)[1]).toBeCloseTo(channelRatio(rgb)[1]);
    // A chromaticity-preserving gamut fit is allowed to reduce luminance when
    // the shouldered RGB triplet still exceeds the fixed channel ceiling.
    expect(computeLinearLuminance(compressed)).toBeLessThan(shoulderLuminance);
  });
});
