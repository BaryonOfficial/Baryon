import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySoftKneeCompression,
  composeEmissionContribution,
  DIRECT_LIGHT_RESPONSE_GAIN,
  EMISSION_SAMPLE_GAIN,
  SOFT_KNEE_START,
} from "./SafeVolumetricLightingModel.js";

function normalizeSource(source) {
  return source.replace(/\r\n/g, "\n");
}

describe("volumetric lighting soft-knee compression", () => {
  it("leaves values below the knee effectively unchanged", () => {
    expect(applySoftKneeCompression(0.4)).toBeCloseTo(0.4);
    expect(applySoftKneeCompression(SOFT_KNEE_START)).toBeCloseTo(
      SOFT_KNEE_START,
    );
  });

  it("compresses highlight peaks smoothly above the knee", () => {
    const moderate = applySoftKneeCompression(0.9);
    const extreme = applySoftKneeCompression(2.4);

    expect(moderate).toBeLessThan(0.9);
    expect(extreme).toBeLessThan(2.4);
    expect(extreme - moderate).toBeLessThan(2.4 - 0.9);
  });

  it("keeps the volume emissive even when no direct lights contribute", () => {
    expect(composeEmissionContribution(0.45, 0)).toBeCloseTo(
      0.45 * EMISSION_SAMPLE_GAIN,
    );
  });

  it("treats direct lights as a small modulation instead of the primary source", () => {
    const unlit = composeEmissionContribution(0.45, 0);
    const lit = composeEmissionContribution(0.45, 1.2);

    expect(lit).toBeGreaterThan(unlit);
    expect(lit - unlit).toBeCloseTo(0.45 * 1.2 * DIRECT_LIGHT_RESPONSE_GAIN);
    expect(lit / unlit).toBeLessThan(1.2);
  });

  it("keeps the march domain a single analytic sphere bound", () => {
    const source = normalizeSource(
      readFileSync(
        new URL("./SafeVolumetricLightingModel.js", import.meta.url),
        "utf8",
      ),
    );

    // The unbounded field extent scales the sphere radius with the camera
    // observation volume — it must never reintroduce a box or any other
    // hard-edged domain shape.
    expect(source).toContain("const intersectSphereDomain = () => {");
    expect(source).toContain("intersectSphereDomain();");
    expect(source).not.toContain("intersectBoxDomain");
    expect(source).not.toContain("domainShape");
    expect(source).not.toContain("domainHalfExtentsNode");
  });

  it("supports opt-in radial-adaptive stepping without touching the uniform path", () => {
    const source = normalizeSource(
      readFileSync(
        new URL("./SafeVolumetricLightingModel.js", import.meta.url),
        "utf8",
      ),
    );

    // Materials that set coreStepRadiusNode march at fine density inside
    // the core radius and stretched steps outside; materials that don't
    // (the flagship sphere) keep the uniform stepping graph unchanged.
    expect(source).toContain(
      "const coreStepRadiusNode = material.coreStepRadiusNode ?? null;",
    );
    expect(source).toContain("if (coreStepRadiusNode) {");
    expect(source).toContain(
      ".select(adaptiveFineStep, adaptiveCoarseStep)",
    );
    // Fine-step budget: worst chord = core diameter fine + remainder
    // stretched, fitting the step count.
    expect(source).toContain(
      "diameter.sub(coreDiameter).div(float(outerStepStretch))",
    );
  });
});
