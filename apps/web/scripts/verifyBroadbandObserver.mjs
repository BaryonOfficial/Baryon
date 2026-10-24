import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { prepareHistoricalEngine } from "../../../scripts/lib/historical-engine.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(
  process.argv[2] ?? "/tmp/baryon-broadband-observer",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixtures = [];
for (const endpoint of [false, true]) {
  for (const seconds of [1 / 60, 0.05, 0.2, 0.4, 1])
    for (const energy of [1e-8, 1e-6, 0.0004, 0.08, 1]) {
      fixtures.push({
        name: `step-${endpoint}-${seconds}-${energy}`,
        endpoint,
        seconds,
        energy,
        kind: "step",
        compressedEnergy: energy / (energy + 0.08),
        potential: 0.5,
        gradient: [1, 0, 0],
        previousDistance: -0.75,
        previousNormal: [1, 0, 0],
        historyAvailable: true,
        geometryBlend: -Math.expm1(-seconds / 0.4),
        radianceBlend: -Math.expm1(-seconds / 0.05),
      });
    }
  for (const kind of [
    "first-valid",
    "silence",
    "no-history-silence",
    "paused",
    "cancelled-normal-history",
  ]) {
    const silent = kind.includes("silence");
    fixtures.push({
      name: `${kind}-${endpoint}`,
      kind,
      endpoint,
      potential: silent ? 0 : 0.5,
      gradient: silent ? [0, 0, 0] : [1, 0, 0],
      compressedEnergy: silent ? 0 : 0.0004 / 0.0804,
      previousDistance:
        kind === "silence" || kind === "cancelled-normal-history" ? -0.75 : 0,
      previousNormal: kind === "silence" ? [1, 0, 0] : [0, 0, 0],
      historyAvailable:
        kind === "silence" || kind === "cancelled-normal-history",
      geometryBlend: kind === "paused" ? 0 : -Math.expm1(-1 / 60 / 0.4),
      radianceBlend: kind === "paused" ? 0 : -Math.expm1(-1 / 60 / 0.05),
    });
  }
  for (const samplingOrigin of [0, 63]) {
    for (const kind of ["opposing", "mixed", "mixed-opposing", "empty"]) {
      const historyCorners = Array.from({ length: 8 }, (_, i) => {
        const available =
          kind === "opposing" ||
          (kind === "mixed" && i < 3) ||
          (kind === "mixed-opposing" && i < 2);
        return {
          available,
          distance: available ? -0.75 : 0,
          normal: available
            ? [kind.includes("opposing") && i % 2 ? -1 : 1, 0, 0]
            : [0, 0, 0],
        };
      });
      const available = historyCorners.filter((corner) => corner.available);
      const previousNormal = [0, 1, 2].map(
        (axis) =>
          available.reduce((sum, c) => sum + c.normal[axis], 0) /
          (available.length || 1),
      );
      fixtures.push({
        name: `spatial-${kind}-${samplingOrigin}-${endpoint}`,
        kind,
        endpoint,
        samplingOrigin,
        historyCorners,
        historyAvailable: available.length > 0,
        previousDistance: available.length ? -0.75 : 0,
        previousNormal,
        compressedEnergy: 0.0004 / 0.0804,
        potential: 0.5,
        gradient: [1, 1, 1],
        geometryBlend: 0.5,
        radianceBlend: 0.25,
      });
    }
  }
}
const sources = new Set([
  "scripts/lib/historical-engine.mjs",
  "packages/engine/src/testing/historicalObserverProbe.js",
  "apps/web/scripts/verifyBroadbandObserver.mjs",
  "pnpm-lock.yaml",
]);
const report = {
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Native constant-field and eight-corner spatial-history observer comparisons, both temporal interval variants; RGBA16F geometry and R8 availability output. Actual cache transitions cover seed, sparse expansion, silence, checkpoint copy/recovery, reset and cached reads. No corpus or full pipeline acceptance.",
  tolerance: {
    absolute: 1e-6,
    relative: 1e-3,
    reason:
      "Half-float observer storage; separate from the Float32 source-field gate.",
  },
  fixtures,
  results: [],
  passed: false,
};
const historical = prepareHistoricalEngine(root);
report.historicalEngine = historical.provenance;
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [root, historical.directory] },
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  plugins: [
    historical.plugin,
    {
      name: "observer-source-provenance",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const url = decodeURIComponent((request.url ?? "").split("?")[0]);
          if (url.startsWith("/packages/engine/src/") && url.endsWith(".js"))
            sources.add(url.slice(1));
          next();
        });
      },
    },
  ],
});
server.middlewares.use((request, response, next) => {
  if (request.url !== "/") return next();
  response.setHeader("Content-Type", "text/html");
  response.end("<!doctype html><title>Baryon observer qualification</title>");
});
function check(actual, expected, name) {
  assert.equal(actual.length, expected.length, name);
  const absoluteRms = Math.sqrt(
    actual.reduce((sum, value, i) => sum + (value - expected[i]) ** 2, 0) /
      actual.length,
  );
  const referenceRms = Math.sqrt(
    expected.reduce((sum, value) => sum + value ** 2, 0) / expected.length,
  );
  const limit =
    report.tolerance.absolute + report.tolerance.relative * referenceRms;
  assert(
    Number.isFinite(absoluteRms) && absoluteRms <= limit,
    `${name}: ${absoluteRms} > ${limit}`,
  );
  return { absoluteRms, referenceRms, limit };
}
await mkdir(output, { recursive: true });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    args: [
      "--enable-unsafe-webgpu",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  });
  report.browser = browser.version();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const probe = await page.evaluate(async (fixtures) => {
    const { runBroadbandObserverProbe } =
      await import("/packages/engine/src/testing/broadbandObserverProbe.js");
    return runBroadbandObserverProbe(fixtures);
  }, fixtures);
  const results = probe.fixtures;
  let existingConventionMismatchCount = 0;
  for (const [i, result] of results.entries()) {
    const f = fixtures[i];
    assert.equal(result.name, f.name);
    const gradientLength = Math.hypot(...f.gradient);
    const validity = gradientLength ** 2 / (gradientLength ** 2 + 1e-16);
    const sourceDistance = f.potential / Math.max(gradientLength, 1e-8);
    const sourceNormal = f.gradient.map(
      (value) => (value / Math.max(gradientLength, 1e-8)) * validity,
    );
    const amount =
      !validity || f.geometryBlend === 0
        ? 0
        : !f.historyAvailable
          ? 1
          : f.geometryBlend * validity;
    const expectedDistance =
      f.previousDistance * (1 - amount) + sourceDistance * amount;
    const expectedNormal = f.previousNormal.map(
      (value, axis) => value * (1 - amount) + sourceNormal[axis] * amount,
    );
    const previousExpectedAmount =
      f.geometryBlend * validity * f.compressedEnergy;
    const unmaskedDistance = f.historyCorners
      ? f.historyCorners.reduce((sum, c) => sum + c.distance, 0) / 8
      : f.previousDistance;
    const unmaskedNormal = f.historyCorners
      ? [0, 1, 2].map(
          (axis) =>
            f.historyCorners.reduce((sum, c) => sum + c.normal[axis], 0) / 8,
        )
      : f.previousNormal;
    const previousExpectedGeometry = [
      unmaskedDistance * (1 - previousExpectedAmount) +
        sourceDistance * previousExpectedAmount,
      ...unmaskedNormal.map(
        (value, axis) =>
          value * (1 - previousExpectedAmount) +
          sourceNormal[axis] * previousExpectedAmount,
      ),
    ];
    const expectedAppearance = [
      1,
      0,
      0.25 * (1 - f.radianceBlend) + f.compressedEnergy * f.radianceBlend,
      0.5 * (1 - f.radianceBlend) +
        f.compressedEnergy * validity * f.radianceBlend,
    ];
    // Do not aggregate distance with normal: unit normals must not hide a
    // wrong distance or an invented zero-surface during silence.
    const metrics = {
      distance: check(
        [result.candidate.geometry[0]],
        [expectedDistance],
        `${f.name} distance`,
      ),
      normal: check(
        result.candidate.geometry.slice(1),
        expectedNormal,
        `${f.name} normal`,
      ),
      phase: check(
        result.candidate.appearance.slice(0, 2),
        expectedAppearance.slice(0, 2),
        `${f.name} phase`,
      ),
      radiance: check(
        [result.candidate.appearance[2]],
        [expectedAppearance[2]],
        `${f.name} radiance`,
      ),
      opticalSupport: check(
        [result.candidate.appearance[3]],
        [expectedAppearance[3]],
        `${f.name} optical support`,
      ),
      existingDistance: check(
        [result.existing.geometry[0]],
        [previousExpectedGeometry[0]],
        `${f.name} existing distance`,
      ),
      existingNormal: check(
        result.existing.geometry.slice(1),
        previousExpectedGeometry.slice(1),
        `${f.name} existing normal`,
      ),
    };
    assert.deepEqual(
      result.candidate.appearance,
      result.existing.appearance,
      `${f.name}: optical history changed`,
    );
    assert.equal(
      result.candidate.historyAvailable,
      f.historyAvailable || amount > 0,
      `${f.name}: history availability`,
    );
    if (
      Math.abs(result.existing.geometry[0] - expectedDistance) >
      metrics.distance.limit
    )
      existingConventionMismatchCount++;
    report.results.push({
      ...result,
      expectedDistance,
      expectedNormal,
      metrics,
    });
  }
  assert.equal(results.length, fixtures.length);
  assert(
    existingConventionMismatchCount > 0,
    "comparison did not reproduce the old geometric-rate defect",
  );
  report.existingConventionMismatchCount = existingConventionMismatchCount;
  report.cache = probe.cache;
  // Read the actual production presentation target, including silence and
  // checkpoint recovery. An opaque color output silently writes alpha=1;
  // that is invalid because opticalPair.w stores upper-slice support.
  for (const state of probe.cache.states) {
    for (const pixel of state.presentation) {
      assert.deepEqual(
        pixel.opticalPair,
        pixel.expectedOpticalPair,
        `${state.name}: corrupted optical pair`,
      );
      assert.deepEqual(
        pixel.organization,
        pixel.expectedOrganization,
        `${state.name}: corrupted presentation organization`,
      );
    }
  }
  const states = Object.fromEntries(
    probe.cache.states.map((state) => [state.name, state]),
  );
  for (const name of [
    "initial-silence",
    "new-source-clears-history",
    "cached-read",
  ]) {
    assert(
      states[name].availability.every((value) => value === 0),
      `${name}: stale availability`,
    );
    assert(
      states[name].geometry.flat().every((value) => value === 0),
      `${name}: undefined geometry`,
    );
  }
  for (const name of [
    "quiet-onset",
    "checkpoint-seed",
    "silence-retains-history",
    "checkpoint-recovery",
  ]) {
    assert(
      states[name].availability.every((value) => value === 255),
      `${name}: lost history`,
    );
    assert(states[name].geometry.flat().every(Number.isFinite));
  }
  for (const [i, geometry] of states["checkpoint-seed"].geometry.entries()) {
    const retained = states["silence-retains-history"].geometry[i];
    check([retained[0]], [geometry[0]], `silence point ${i} distance`);
    check(retained.slice(1), geometry.slice(1), `silence point ${i} normal`);
  }
  assert.deepEqual(
    states["checkpoint-recovery"].geometry,
    states["checkpoint-seed"].geometry,
  );
  assert.equal(states["checkpoint-recovery"].result.checkpointRestored, true);
  assert.equal(
    states["new-source-clears-history"].result.checkpointRestored,
    false,
  );
  assert.equal(states["cached-read"].draws, 0);
  assert.deepEqual(
    states["cached-read"].state,
    states["new-source-clears-history"].state,
  );
  assert.equal(states["initial-silence"].availabilityBytes, 2 * 128 ** 3);
  assert.equal(states["checkpoint-seed"].availabilityBytes, 3 * 128 ** 3);
  const seeded = states["checkpoint-seed"].geometry;
  for (let i = 0; i < 6; i++) {
    check([seeded[i][0]], [seeded[0][0]], `permutation ${i} distance`);
    const expectedNormal = probe.cache.points[i].map(
      (axis) => seeded[0][1 + probe.cache.points[0].indexOf(axis)],
    );
    check(seeded[i].slice(1), expectedNormal, `permutation ${i} normal`);
  }
  report.cache.passed = true;
  assert.deepEqual(errors, []);
  assert(
    sources.has(
      "packages/engine/src/core/raymarch/cymaticGeometryObservation.js",
    ),
  );
  assert(
    sources.has("packages/engine/src/core/raymarch/cymaticObserverNode.js"),
  );
  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
  historical.dispose();
  report.sourceHashes = Object.fromEntries(
    await Promise.all(
      [...sources]
        .sort()
        .map(async (file) => [
          file,
          hash(await readFile(path.join(root, file))),
        ]),
    ),
  );
  const reportPath = path.join(output, "broadband-observer-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        failure: report.failure,
        cases: report.results.length,
        existingConventionMismatchCount: report.existingConventionMismatchCount,
        report: reportPath,
      },
      null,
      2,
    ),
  );
}
