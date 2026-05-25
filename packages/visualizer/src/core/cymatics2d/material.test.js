import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function expectSourceIndex(source, pattern) {
  const index = source.indexOf(pattern);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("cymatics2d material", () => {
  it("does not expose a product-controlled structure gradient window", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    for (const identifier of [
      "uStructureMin",
      "uStructureMax",
      "structureMin",
      "structureMax",
      "gradientMin",
      "gradientMax",
      "structureFloor",
      "structureCeiling",
    ]) {
      expect(source).not.toContain(identifier);
    }
    expect(source).not.toMatch(/const\s+structure\s*=/);
    expect(source).toContain("localGradientEvidence");
  });

  it("bounds modal accumulation by active descriptor count before slot evaluation", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const activeCountPassStart = expectSourceIndex(
      source,
      "activeCount: int(uModalFieldModeCount),",
    );
    const loopStart = expectSourceIndex(
      source,
      '{ start: int(0), end: int(capacity), type: "int", condition: "<" }',
    );
    const activeBreakStart = expectSourceIndex(
      source,
      "If(i.greaterThanEqual(activeCount), () =>",
    );
    const slotEvaluationStart = expectSourceIndex(
      source,
      "const slot = buffer.element(i);",
    );
    const colorContributionStart = expectSourceIndex(
      source,
      "colorSum.addAssign(",
    );

    expect(loopStart).toBeLessThan(activeBreakStart);
    expect(activeBreakStart).toBeLessThan(slotEvaluationStart);
    expect(slotEvaluationStart).toBeLessThan(colorContributionStart);
    expect(activeCountPassStart).toBeGreaterThan(colorContributionStart);
  });

  it("derives 2D modal visibility from signed support or cymatic ridge authority", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const signedSupportStart = expectSourceIndex(
      source,
      "const signedFieldSupportAuthority = smoothstep(",
    );
    const ridgeAuthorityStart = expectSourceIndex(
      source,
      "const cymaticRidgeAuthority = clamp(",
    );
    const modalVisibilityStart = expectSourceIndex(
      source,
      "const modalVisibilityAuthority = clamp(",
    );
    const colorGateStart = expectSourceIndex(
      source,
      "const spectralLightColorGate = modalVisibilityAuthority;",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence = smoothstep(",
    );
    const spectralWeightStart = expectSourceIndex(
      source,
      "const spectralLightWeight = clamp(",
    );
    const signedSupportBlock = source.slice(
      signedSupportStart,
      ridgeAuthorityStart,
    );
    const ridgeAuthorityBlock = source.slice(
      ridgeAuthorityStart,
      modalVisibilityStart,
    );
    const modalVisibilityBlock = source.slice(
      modalVisibilityStart,
      colorGateStart,
    );
    const spectralWeightBlock = source.slice(
      spectralWeightStart,
      spectralWeightStart + 220,
    );

    expect(ridgeAuthorityStart).toBeGreaterThan(signedSupportStart);
    expect(modalVisibilityStart).toBeGreaterThan(ridgeAuthorityStart);
    expect(colorGateStart).toBeGreaterThan(modalVisibilityStart);
    expect(spectralWeightStart).toBeGreaterThan(spectralPresenceStart);
    expect(signedSupportBlock).toContain(
      "SIGNED_INTERFERENCE_BODY_AUTHORITY_START",
    );
    expect(signedSupportBlock).toContain(
      "SIGNED_INTERFERENCE_BODY_AUTHORITY_END",
    );
    expect(signedSupportBlock).toContain("fieldAbs");
    expect(signedSupportBlock).toContain(
      "SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER",
    );
    expect(ridgeAuthorityBlock).toContain(
      "localGradientEvidence.mul(contourCore).mul(activeMask)",
    );
    expect(modalVisibilityBlock).toContain(
      "max(signedFieldSupportAuthority.mul(activeMask), cymaticRidgeAuthority)",
    );
    expect(spectralWeightBlock).toContain(".mul(spectralLightColorGate)");
  });

  it("gates 2D density floor by modal visibility authority", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const modalVisibilityStart = expectSourceIndex(
      source,
      "const modalVisibilityAuthority = clamp(",
    );
    const densityStart = expectSourceIndex(source, "const density = clamp(");
    const visibleDensityStart = expectSourceIndex(
      source,
      "const visibleDensity = density.mul(",
    );
    const densityBlock = source.slice(densityStart, visibleDensityStart);

    expect(densityStart).toBeGreaterThan(modalVisibilityStart);
    expect(densityBlock).toContain("localGradientEvidence.add(");
    expect(densityBlock).toContain("modalVisibilityAuthority.mul(float(0.12))");
    expect(densityBlock).toContain(".mul(modalVisibilityAuthority)");
    expect(densityBlock).not.toContain("localGradientEvidence.add(float(0.12))");
  });

  it("applies Spectral Light projection weight once after modal color is formed", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const spectralWeightStart = expectSourceIndex(
      source,
      "const spectralLightWeight =",
    );
    const spectralColorStart = expectSourceIndex(
      source,
      "const spectralLightColor = mix(",
    );
    const finalColorStart = expectSourceIndex(
      source,
      "const color = mix(staticColor, spectralLightColor, spectralLightWeight)",
    );
    const spectralColorBlock = source.slice(spectralColorStart, finalColorStart);

    expect(spectralColorStart).toBeGreaterThan(spectralWeightStart);
    expect(spectralColorBlock).toContain("spectralColor.mul(float(0.9))");
    expect(spectralColorBlock).toContain("spectralColor,");
    expect(spectralColorBlock).not.toContain("spectralLightWeight");
    expect(source).not.toContain("spectralLightBaseColor");
    expect(finalColorStart).toBeGreaterThan(spectralColorStart);
  });
});
