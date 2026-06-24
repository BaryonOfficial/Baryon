import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const visualizerSrc = resolve(currentDir, "..");
const repoRoot = resolve(currentDir, "../../../..");
const appShellSrc = resolve(repoRoot, "packages/app-shell/src");
const legacyColorTerm = "chrom" + "esthesia";

function toRepoPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

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
  it("routes Spectral through lane radiance instead of the removed RGB cache", async () => {
    const raymarchSetup = await readFile(
      resolve(currentDir, "raymarchSetup.js"),
      "utf8",
    );
    const raymarchRuntime = await readFile(
      resolve(currentDir, "raymarch/runtime.js"),
      "utf8",
    );
    const raymarchMaterial = await readFile(
      resolve(currentDir, "raymarch/material.js"),
      "utf8",
    );

    expect(raymarchSetup).not.toContain("createRaymarchSpectralLightCache");
    expect(raymarchSetup).not.toContain("spectralLightCache:");
    expect(raymarchSetup).not.toContain("spectralLightCacheTexture");
    expect(raymarchSetup).not.toContain("spectralLightCausticTexture");

    expect(raymarchRuntime).not.toContain(
      "buildRaymarchSpectralLightCacheDescriptor",
    );
    expect(raymarchRuntime).not.toContain(
      "enqueueRaymarchSpectralLightCacheRebuild",
    );
    expect(raymarchRuntime).not.toContain("spectralLightCache");
    expect(raymarchRuntime).toContain("computeRaymarchSpectralLaneCache");
    expect(raymarchRuntime).toContain("spectralLaneCache");
    expect(raymarchRuntime).toContain('"lane-cache-radiance"');

    expect(raymarchMaterial).not.toContain("RAYMARCH_SPECTRAL_LIGHT_TUNING");
    expect(raymarchMaterial).not.toContain("cachedSpectralLightEnabled");
    expect(raymarchMaterial).not.toContain("spectralLightCacheTexture");
    expect(raymarchMaterial).not.toContain("spectralLightCausticTexture");
    expect(raymarchMaterial).toContain("sampleSpectralLaneCacheNode");
    expect(raymarchMaterial).toContain("projectSpectralLaneRadianceToRgbNode");
    expect(raymarchMaterial).toContain("spectralLaneTextureA");
    expect(raymarchMaterial).toContain("spectralLaneStatsTexture");
    expect(raymarchMaterial).not.toContain("colorSum.div");
    expect(raymarchMaterial).not.toContain("FallbackColor");
    expect(raymarchMaterial).not.toContain("tonalFallback");
    expect(raymarchMaterial).not.toContain("uKeyTint");
    expect(raymarchMaterial).not.toContain("spectralFilm");
    expect(raymarchMaterial).not.toContain(legacyColorTerm);
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
      const relativePath = toRepoPath(relative(repoRoot, file));
      if (
        relativePath !== "packages/engine/src/controls/persistence.js" &&
        relativePath !== "packages/engine/src/controls/persistence.test.js"
      ) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
