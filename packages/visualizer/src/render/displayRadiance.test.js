import { describe, expect, it } from "vitest";
import {
  computeLinearLuminance,
  compressDisplayLuminance,
  compressDisplayRadiance,
  deriveBloomRadianceScale,
  deriveHighlightTarget,
} from "./displayRadiance.js";

function channelRatio(rgb) {
  return [rgb[1] / rgb[0], rgb[2] / rgb[0]];
}

function mixRgb(left, right, t) {
  return left.map((channel, index) => channel * (1 - t) + right[index] * t);
}

function saturationOf(rgb) {
  const maxChannel = Math.max(...rgb);
  if (maxChannel <= 1e-6) return 0;
  return (maxChannel - Math.min(...rgb)) / maxChannel;
}

describe("display radiance", () => {
  it("uses linear sRGB relative luminance", () => {
    expect(computeLinearLuminance([1, 1, 1])).toBeCloseTo(1);
    expect(computeLinearLuminance([1, 0, 0])).toBeCloseTo(0.2126);
    expect(computeLinearLuminance([0, 1, 0])).toBeCloseTo(0.7152);
    expect(computeLinearLuminance([0, 0, 1])).toBeCloseTo(0.0722);
  });

  it("leaves midtone luminance unchanged and compresses highlights", () => {
    expect(compressDisplayLuminance(0.5)).toBeCloseTo(0.5);

    const compressed = compressDisplayLuminance(1.2);
    const expected =
      0.72 + (0.96 - 0.72) * (1 - Math.exp(-(1.2 - 0.72) / 0.28));

    expect(compressed).toBeCloseTo(expected);
    expect(compressed).toBeGreaterThan(0.72);
    expect(compressed).toBeLessThan(0.96);
  });

  it("compresses radiance with one scalar so hue ratios survive", () => {
    const rgb = [1.4, 0.7, 0.35];
    const compressed = compressDisplayRadiance(rgb);

    expect(Math.max(...compressed)).toBeLessThanOrEqual(0.985);
    expect(computeLinearLuminance(compressed)).toBeLessThan(
      computeLinearLuminance(rgb),
    );
    expect(channelRatio(compressed)[0]).toBeCloseTo(channelRatio(rgb)[0]);
    expect(channelRatio(compressed)[1]).toBeCloseTo(channelRatio(rgb)[1]);
  });

  it("keeps bloom at full strength when scene-referred headroom exists", () => {
    expect(
      deriveBloomRadianceScale([0.3, 0.28, 0.26], [0.04, 0.04, 0.04]).scale,
    ).toBe(1);
  });

  it("reduces bloom when it would exceed luminance, channel, or veil bounds", () => {
    const result = deriveBloomRadianceScale(
      [0.9, 0.86, 0.82],
      [0.35, 0.3, 0.25],
    );

    expect(result.scale).toBeGreaterThan(0);
    expect(result.scale).toBeLessThan(1);
    expect(result.constraints.headroom).toBeLessThan(1);
    expect(result.constraints.channel).toBeLessThan(1);
  });

  it("derives the surface pull needed for a target highlight luminance", () => {
    const result = deriveHighlightTarget([0.24, 0.08, 0.18], [0.9, 0.78, 0.7], {
      targetLuminance: 0.52,
      whiteMix: 0,
    });

    expect(result.surfacePull).toBeGreaterThan(0);
    expect(result.surfacePull).toBeLessThan(1);
    expect(computeLinearLuminance(result.targetRgb)).toBeCloseTo(0.52);
    expect(result.finalRgb).toEqual(result.targetRgb);
  });

  it("removes white sparkle when the highlight target has no channel headroom", () => {
    const result = deriveHighlightTarget([0.92, 0.91, 0.9], [1, 1, 1], {
      targetLuminance: 0.99,
      whiteMix: 1,
    });

    expect(Math.max(...result.targetRgb)).toBeGreaterThan(0.98);
    expect(result.whiteSparkle).toBe(0);
    expect(result.finalRgb).toEqual(result.targetRgb);
  });

  it("can preserve saturated static color while only nudging toward the surface tint", () => {
    const staticColor = [0.92, 0.24, 0.7];
    const surfaceTint = [0.97, 0.99, 1];
    const whiteMix = 0.3;
    const directWhite = mixRgb(staticColor, [1, 1, 1], whiteMix);
    const result = deriveHighlightTarget(staticColor, surfaceTint, {
      targetLuminance: computeLinearLuminance(directWhite),
      whiteMix,
      surfacePullScale: 0.2,
    });

    expect(result.surfacePull).toBeGreaterThan(0);
    expect(saturationOf(result.finalRgb)).toBeGreaterThan(
      saturationOf(directWhite),
    );
  });
});
