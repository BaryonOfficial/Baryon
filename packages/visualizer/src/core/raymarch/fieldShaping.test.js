import { describe, expect, it } from "vitest";
import {
  BODY_DENSITY_GAIN,
  CONTOUR_BLEND,
  SHELL_WEIGHT_MAX,
  SHELL_WEIGHT_MIN,
  deriveBodyDensity,
  deriveContourShape,
  deriveShellWeight,
} from "./fieldShaping.js";

describe("field shaping", () => {
  it("uses a flatter shell-weight range than the prior shell-heavy look", () => {
    expect(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN).toBeCloseTo(0.16);
    expect(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN).toBeLessThan(0.36);
  });

  it("adds non-zero interior body density away from the boundary", () => {
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.8,
      edgeFade: 0.9,
      activeMask: 1,
      radialDistance: 0.45,
      boundaryMask: 0.05,
    });

    expect(BODY_DENSITY_GAIN).toBeCloseTo(0.26);
    expect(body.interiorMask).toBeGreaterThan(0);
    expect(body.bodyDensity).toBeGreaterThan(0);
  });

  it("keeps contour shaping dominant without remaining purely contour-driven", () => {
    const contour = deriveContourShape({
      fieldAbs: 0.02,
      threshold: 0.15,
      contourSharpness: 4,
      transientEnergy: 0.5,
    });
    const body = deriveBodyDensity({
      fieldAbs: 0.02,
      threshold: 0.15,
      structure: 0.7,
      edgeFade: 0.92,
      activeMask: 1,
      radialDistance: 0.42,
      boundaryMask: 0.04,
    });
    const shell = deriveShellWeight({
      radialDistance: 0.42,
      rimBloomBias: 0.5,
      bandEnergies: [0.4, 0.3, 0.2, 0.1],
    });
    const coreDensity = contour.contourShape * 0.7 * shell.shellWeight;

    expect(CONTOUR_BLEND).toBeCloseTo(0.72);
    expect(contour.contourShape).toBeGreaterThan(contour.contourCore);
    expect(coreDensity).toBeGreaterThan(body.bodyDensity);
    expect(body.bodyDensity / coreDensity).toBeGreaterThan(0.1);
  });
});
