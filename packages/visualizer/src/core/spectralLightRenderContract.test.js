import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const visualizerSrc = resolve(currentDir, "..");
const repoRoot = resolve(currentDir, "../../../..");
const appShellSrc = resolve(repoRoot, "packages/app-shell/src");
const legacyColorTerm = "chrom" + "esthesia";

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

describe("Spectral Light render contract", () => {
  it("keeps renderer color sourced from modal color slots without global fallback tint", async () => {
    const raymarchMaterial = await readFile(
      resolve(currentDir, "raymarch/material.js"),
      "utf8",
    );
    for (const source of [raymarchMaterial]) {
      expect(source).toContain("colorWeight");
      expect(source).toContain("spectralLightWeight");
      expect(source).not.toContain("FallbackColor");
      expect(source).not.toContain("tonalFallback");
      expect(source).not.toContain("uKeyTint");
      expect(source).not.toContain(legacyColorTerm);
    }
  });

  it("confines legacy color-mode terminology to persistence migration", async () => {
    const files = [
      ...(await collectFiles(visualizerSrc)),
      ...(await collectFiles(appShellSrc)),
    ];
    const offenders = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (!source.includes(legacyColorTerm)) {
        continue;
      }
      const relativePath = relative(repoRoot, file);
      if (
        relativePath !== "packages/visualizer/src/controls/persistence.js" &&
        relativePath !== "packages/visualizer/src/controls/persistence.test.js"
      ) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
