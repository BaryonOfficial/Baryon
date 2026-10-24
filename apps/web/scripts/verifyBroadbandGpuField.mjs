import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { cpus, platform, arch } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { buildModalExcitationAtlas } from "../../../packages/engine/src/utils/audio/modalExcitationAtlas.js";
import { createBroadbandModalResponse } from "../../../packages/engine/src/utils/audio/broadbandModalResponse.js";
import { expandBroadbandSpectralWindow } from "../../../packages/engine/src/testing/broadbandSpectralWindowReference.js";
import { referenceSpectralField } from "../../../packages/engine/src/testing/broadbandSpectralReference.js";
import {
  referenceBroadbandBasis,
  referenceMomentField,
} from "../../../packages/engine/src/testing/broadbandModalReference.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "../../../packages/engine/src/core/raymarch/fieldObservation.js";
import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
} from "../../../packages/engine/src/core/raymarch/fieldCacheGeometry.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(
  process.argv[2] ?? "/tmp/baryon-broadband-implementation",
);
const boundaryMode = process.argv.includes("--dirichlet")
  ? "dirichlet"
  : "neumann";
const cosine = process.argv.includes("--cosine");
assert(
  !process.argv.includes("--reflection"),
  "reflection experiment retired; use --cosine or the direct reference",
);
const spectral = process.argv.includes("--spectral");
const aperture = process.argv.includes("--aperture");
assert(
  !aperture || (cosine && spectral),
  "--aperture requires --cosine --spectral",
);
const reportName = aperture
  ? "broadband-gpu-aperture-field-report.json"
  : cosine
    ? `broadband-gpu-cosine${spectral ? "-spectral" : ""}-field-report.json`
    : spectral
      ? "broadband-gpu-spectral-field-report.json"
      : "broadband-gpu-field-report.json";
const reportPath = path.join(
  output,
  reportName.replace(
    "-report.json",
    `${boundaryMode === "dirichlet" ? "-dirichlet" : ""}-report.json`,
  ),
);
const atlas = buildModalExcitationAtlas({ radius: 3, boundaryMode });
const shells = [...new Map(atlas.map((m) => [m.responseModeKey, m])).values()];
const families = atlas.map((family) => ({
  u: family.u,
  v: family.v,
  w: family.w,
  shellIndex: shells.findIndex(
    (shell) => shell.responseModeKey === family.responseModeKey,
  ),
  sourceAmplitudeOverlap:
    family.sourceCouplingAmplitude * family.sourceProjectionWeight,
}));
let seed = 78321;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
// Explicitly cover domain edges, both sides of reflection planes and equal-axis
// permutation seams in addition to the deterministic random interior sample.
const voxels = [];
const edges = [0, 1, 63, 64, 126, 127];
for (let i = 0; i < edges.length; i++)
  for (let j = i; j < edges.length; j++)
    for (let k = j; k < edges.length; k++)
      voxels.push([edges[i], edges[j], edges[k]]);
for (let i = 0; i < 252; i++)
  voxels.push(
    Array.from({ length: 3 }, () => Math.floor(random() * 128)).sort(
      (a, b) => a - b,
    ),
  );
const bases = voxels.map((voxel) =>
  referenceBroadbandBasis(
    families,
    voxel.map(
      (v) => (v + 0.5) * FIELD_CACHE_CELL_SIZE - FIELD_CACHE_DOMAIN_HALF_EXTENT,
    ),
    shells.length,
    boundaryMode,
  ),
);
const cases = [];
for (const name of [
  "two-tones",
  "256-tones",
  "noise",
  "quiet-noise",
  "silence",
]) {
  const pcm = Float64Array.from({ length: 24000 }, (_, n) => {
    if (name === "silence") return 0;
    if (name.includes("noise"))
      return (random() - 0.5) * (name === "quiet-noise" ? 1e-7 : 0.3);
    const count = name === "two-tones" ? 2 : 256;
    let value = 0;
    for (let t = 0; t < count; t++)
      value +=
        (0.2 / Math.sqrt(count)) *
        Math.cos((2 * Math.PI * (119 + t * 67.31) * n) / 48000 + t * 0.731);
    return value;
  });
  const response = createBroadbandModalResponse({ shells, sampleRate: 48000 });
  response.advance([pcm]);
  const observation = response.read();
  const spectrum = spectral
    ? expandBroadbandSpectralWindow(observation.spectral)
    : null;
  cases.push({
    name,
    inputSha256: createHash("sha256")
      .update(new Uint8Array(pcm.buffer))
      .digest("hex"),
    observation: {
      pressureMoments: Array.from(observation.pressureMoments),
      velocityMoments: Array.from(observation.velocityMoments),
    },
    spectral: spectral
      ? Object.fromEntries(
          Object.entries(observation.spectral).map(([key, value]) => [
            key,
            ArrayBuffer.isView(value) ? Array.from(value) : value,
          ]),
        )
      : null,
    expected: bases.map((basis) => {
      const field = referenceMomentField(observation, basis, contrast);
      return [
        field.pressureEnergy,
        field.velocityEnergy,
        field.radiationPotential,
        field.pressureEnergy + field.velocityEnergy,
        ...(spectrum
          ? referenceSpectralField(spectrum, basis, contrast).map((value) =>
              field.normalizationEnergy > 0
                ? value / field.normalizationEnergy
                : 0,
            )
          : []),
      ];
    }),
  });
}
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
server.middlewares.use((request, response, next) => {
  if (request.url !== "/") return next();
  response.setHeader("Content-Type", "text/html");
  response.end(
    "<!doctype html><title>Baryon broadband GPU field probe</title>",
  );
});
await server.listen();
let browser;
const errors = [];
try {
  browser = await chromium.launch({
    args: [
      "--enable-unsafe-webgpu",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(
    async (fixtures) => {
      if (fixtures.aperture) {
        const { runBroadbandGpuApertureProbe } =
          await import("/packages/engine/src/testing/broadbandGpuApertureProbe.js");
        return runBroadbandGpuApertureProbe(fixtures);
      }
      const { runBroadbandGpuFieldProbe } =
        await import("/packages/engine/src/testing/broadbandGpuFieldProbe.js");
      return runBroadbandGpuFieldProbe(fixtures);
    },
    {
      families,
      boundaryMode,
      shellCount: shells.length,
      cases,
      voxels,
      spectral,
      cosine,
      aperture,
    },
  );
  if (aperture) {
    assert.equal(
      result.results.length,
      cases.length * 4,
      "all radius transitions are required",
    );
    for (const value of result.results) {
      assert.equal(
        value.quantities.length,
        9,
        "all aperture and gradient lanes are required",
      );
      assert(
        value.quantities.slice(0, 8).every((q) => q.count === 357760),
        "every fundamental-domain voxel is required",
      );
      assert.equal(
        value.quantities[8].count,
        voxels.length * 6,
        "all sampled gradient axes are required",
      );
    }
  }
  const checks = aperture
    ? result.results
    : result.results.map((actual, i) => {
        const expected = cases[i].expected;
        const quantities = [
          "pressureEnergy",
          "velocityEnergy",
          "potential",
          "totalEnergy",
          ...(spectral
            ? [
                "spectralSupport",
                "firstReal",
                "firstImaginary",
                "secondReal",
                "secondImaginary",
              ]
            : []),
        ].map((name, k) => {
          const absoluteRms = Math.sqrt(
            actual.fields.reduce(
              (sum, p, n) => sum + (p[k] - expected[n][k]) ** 2,
              0,
            ) / voxels.length,
          );
          const referenceRms = Math.sqrt(
            expected.reduce((sum, p) => sum + p[k] ** 2, 0) / voxels.length,
          );
          return {
            name,
            absoluteRms,
            referenceRms,
            relativeRms: referenceRms > 0 ? absoluteRms / referenceRms : null,
            passed:
              absoluteRms <= 1e-6 + 1e-4 * referenceRms &&
              (referenceRms === 0
                ? absoluteRms === 0
                : absoluteRms / referenceRms <= 1e-4),
          };
        });
        return { ...actual, inputSha256: cases[i].inputSha256, quantities };
      });
  const paths = [
    "packages/engine/src/testing/broadbandGpuApertureProbe.js",
    "packages/engine/src/testing/spatialApertureReference.js",
    "packages/engine/src/core/raymarch/broadbandApertureBasis.js",
    "packages/engine/src/core/raymarch/fieldCacheBake.js",
    "packages/engine/src/core/raymarch/cymaticObserverReference.js",
    "packages/engine/src/core/raymarch/fieldCacheSampling.js",
    "packages/engine/src/testing/broadbandMomentFieldProbe.js",
    "packages/engine/src/core/raymarch/broadbandMomentField.js",
    "packages/engine/src/core/raymarch/fieldCachePositiveOctantGeometry.js",
    "packages/engine/src/core/raymarch/broadbandCosineProjection.js",
    "packages/engine/src/testing/broadbandGpuFieldProbe.js",
    "packages/engine/src/testing/gpuProbeTiming.js",
    "packages/engine/src/core/modeFamilyNode.js",
    "packages/engine/src/core/modeFamily.js",
    "packages/engine/src/utils/audio/modalExcitationAtlas.js",
    "packages/engine/src/core/modalSourceCoupling.js",
    "packages/engine/src/core/raymarch/fieldCacheBasisLookup.js",
    "packages/engine/src/testing/broadbandModalReference.js",
    "packages/engine/src/utils/audio/broadbandModalResponse.js",
    "packages/engine/src/utils/audio/modalResponseMoments.js",
    "packages/engine/src/utils/audio/broadbandResponseSpectrum.js",
    "packages/engine/src/core/raymarch/broadbandSpectralExpansion.js",
    "packages/engine/src/core/raymarch/broadbandSpectralProjection.js",
    "packages/engine/src/testing/broadbandSpectralWindowReference.js",
    "packages/engine/src/testing/broadbandSpectralReference.js",
    "packages/engine/src/core/raymarch/fixedOrientationTextureNode.js",
    "packages/engine/src/utils/audio/spectralPhase.js",
    "packages/engine/src/core/audio/fft.js",
    "apps/web/scripts/verifyBroadbandGpuField.mjs",
  ];
  const report = {
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => [
          p,
          createHash("sha256")
            .update(await readFile(path.join(root, p)))
            .digest("hex"),
        ]),
      ),
    ),
    browser: browser.version(),
    machine: {
      cpu: cpus()[0]?.model,
      platform: platform(),
      architecture: arch(),
    },
    scope: aperture
      ? "Native Float32 aperture equivalence against the unchanged production three-pass finite Gaussian shader, at every stored voxel and sampled sixth-order gradients. Five full-matrix/spectral cases, radii 1.5, 3, 2.173 and return to 1.5. Shared previously independently validated cosine projection; this isolates spatial operator order, not raw projection physics. No observer, optics, image, capture, latency or performance acceptance."
      : `Unfiltered full-moment Float32 GPU field at the existing 128-cubed cache grid${spectral ? " including all five spatial color moments" : ", excluding color"}. Timings cover field evaluation after spectral matrix construction. No capture, preparation, worker, aperture, persistent observer, optics or display-latency qualification.`,
    familyCount: families.length,
    shellCount: shells.length,
    ...result,
    results: checks,
    errors,
    passed:
      errors.length === 0 &&
      checks.every((c) => c.quantities.every((q) => q.passed)),
  };
  await mkdir(output, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        errors,
        results: checks.map(({ name, quantities, gpuMs }) => ({
          name,
          quantities,
          gpuMs,
        })),
        report: reportPath,
      },
      null,
      2,
    ),
  );
  assert(report.passed, "GPU field comparison failed; inspect saved report");
} catch (error) {
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "gpu-field-failure.json"),
    JSON.stringify(
      {
        passed: false,
        errors,
        failure: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    ),
  );
  console.error(JSON.stringify({ errors }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
