import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("2D cymatic material", () => {
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
});
