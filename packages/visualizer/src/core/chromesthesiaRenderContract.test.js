import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));

async function readCoreSource(path) {
  return readFile(new URL(path, `file://${SOURCE_ROOT}`), "utf8");
}

describe("chromesthesia render contract", () => {
  it("keeps low-presence 2D chromesthesia fallback pitch-colored", async () => {
    const source = await readCoreSource("./cymatics2d/material.js");

    expect(source).not.toContain(
      "const chromesthesiaNeutralColor = mix(\n      vec3",
    );
    expect(source).toContain("const chromesthesiaFallbackColor =");
    expect(source).toContain("spectralColor");
  });

  it("keeps low-presence raymarch chromesthesia fallback pitch-colored", async () => {
    const source = await readCoreSource("./raymarch/material.js");

    expect(source).not.toContain("const neutralBase = mix(vec3");
    expect(source).toContain("const chromesthesiaFallbackColor =");
    expect(source).toContain("spectralColor");
  });

  it("attenuates static raymarch white emission for Dirichlet boundaries", async () => {
    const source = await readCoreSource("./raymarch/material.js");

    expect(source).toContain(
      "holographicEmissionLift.mul(float(0.45)).mul(boundaryWhiteEmission)",
    );
  });
});
