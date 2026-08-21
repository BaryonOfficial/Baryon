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
  it("routes Spectral through the support-weighted field cache", async () => {
    const raymarchSetup = await readFile(
      resolve(currentDir, "raymarchSetup.js"),
      "utf8",
    );
    const raymarchRuntime = await readFile(
      resolve(currentDir, "raymarch/runtime.js"),
      "utf8",
    );
    const raymarchDiagnostics = await readFile(
      resolve(currentDir, "raymarch/runtimeDiagnostics.js"),
      "utf8",
    );
    const raymarchMaterial = await readFile(
      resolve(currentDir, "raymarch/material.js"),
      "utf8",
    );
    const raymarchBake = await readFile(
      resolve(currentDir, "raymarch/fieldCacheBake.js"),
      "utf8",
    );
    const raymarchObserver = await readFile(
      resolve(currentDir, "raymarch/cymaticObserverNode.js"),
      "utf8",
    );
    const raymarchSampling = await readFile(
      resolve(currentDir, "raymarch/fieldCacheSampling.js"),
      "utf8",
    );
    const radiationPotentialObservation = await readFile(
      resolve(currentDir, "raymarch/radiationPotentialObservation.js"),
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
    expect(raymarchDiagnostics).not.toContain("spectralLightCache");
    expect(raymarchDiagnostics).toContain(
      "RAYMARCH_SPECTRAL_PHASE_REPRESENTATION",
    );
    expect(raymarchDiagnostics).toContain(
      "RAYMARCH_OPTICAL_FIELD_REPRESENTATION",
    );

    expect(raymarchMaterial).not.toContain("RAYMARCH_SPECTRAL_LIGHT_TUNING");
    expect(raymarchMaterial).not.toContain("cachedSpectralLightEnabled");
    expect(raymarchMaterial).not.toContain("spectralLightCacheTexture");
    expect(raymarchMaterial).not.toContain("spectralLightCausticTexture");
    expect(raymarchMaterial).not.toContain("spectralLaneCache");
    expect(raymarchMaterial).not.toContain("spectralLaneTexture");
    // Spectral moments are measured once in the complete-field bake, resolved
    // as persistent phase, and projected once per observer voxel. The march
    // fetches the already-resolved chromaticity without interpolating RGB.
    expect(raymarchMaterial).toContain("sampleCymaticObserver");
    expect(raymarchMaterial).toContain("observer.localSpectralChromaticity");
    expect(raymarchMaterial).not.toContain("observer.localSpectralPhase");
    expect(raymarchMaterial).not.toContain(
      "resolveInterpolatedSpectralChromaticityNode",
    );
    expect(raymarchMaterial).toContain("localSpectralChromaticity");
    expect(raymarchObserver).toContain("resolveSpectralChromaticityNode");
    expect(raymarchSampling).toContain(
      "fixedRenderTargetTextureLoadAtKnownHeight",
    );
    expect(raymarchSampling).toContain("footprint.nearestTexel");
    expect(raymarchSampling).not.toContain(
      "sampleFieldCacheAtlasNearestAtFootprintNode",
    );
    expect(raymarchSampling).toContain("localSpectralChromaticity");
    expect(raymarchMaterial).not.toContain("uKeyTint");
    expect(raymarchBake).toContain(
      "evaluateAnalyticWaterRadiationPotentialNode",
    );
    expect(raymarchBake).not.toContain("spectralLightCacheTexture");
    expect(radiationPotentialObservation).toContain(
      "const spectralWeight = support.mul(support)",
    );
    expect(radiationPotentialObservation).toContain(
      "spectralSupport.addAssign(spectralWeight)",
    );
    expect(raymarchMaterial).toContain("deriveCymaticPlasmaCarrierNode");
    expect(raymarchMaterial).toContain("deriveCymaticPlasmaTransferNode");
    expect(raymarchMaterial).not.toContain(
      "evaluateAnalyticModalPathIntegralNode",
    );
    expect(raymarchMaterial).toContain("normalizeMaterialChromaticityNode");
    expect(raymarchMaterial).toContain("uSpectralChroma");
    expect(raymarchMaterial).toContain("presentedSpectralChromaticity");
    expect(raymarchMaterial).not.toContain("localSpectralAuthority");
    expect(raymarchMaterial).toContain("uSpectralPresentationEnabled");
    expect(raymarchMaterial).not.toContain("uSpectralMix");
    expect(raymarchMaterial).not.toContain("spectralMix");
    expect(raymarchMaterial).not.toContain("FallbackColor");
    expect(raymarchMaterial).not.toContain("tonalFallback");
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
