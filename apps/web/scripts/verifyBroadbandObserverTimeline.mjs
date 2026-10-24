import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(process.argv[2] ?? "/tmp/baryon-observer-timeline");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const samples = [
  ...new Set([
    ...Array.from({ length: Math.floor(48000 / 512) + 1 }, (_, i) => i * 512),
    24000,
    48000,
  ]),
].sort((a, b) => a - b);
const schedules = [
  { name: "every-observation", observations: samples.map((_, i) => i) },
];
for (const [rate, stall] of [
  [30, false],
  [60, false],
  [144, false],
  [60, true],
]) {
  const observations = [];
  for (let tick = 0; tick <= rate; tick++) {
    const time = tick / rate;
    if (stall && time >= 0.35 && time < 0.65) continue;
    const available = samples.findLastIndex(
      (sample) => sample <= time * 48000 + 1e-8,
    );
    if (observations.at(-1) !== available) observations.push(available);
  }
  assert.equal(observations[0], 0);
  assert.equal(observations.at(-1), samples.length - 1);
  schedules.push({
    name: `${rate}Hz${stall ? "-300ms-stall" : ""}`,
    observations,
  });
}
schedules.push(
  ...schedules.slice(1).map((schedule) => ({
    ...schedule,
    name: `${schedule.name}-retained`,
    retained: true,
  })),
);
const timelines = ["stationary", "smooth", "steps"].map((name) => ({
  name,
  observations: samples.map((sample) => {
    const t = sample / 48000;
    const signal =
      name === "stationary"
        ? 0
        : name === "smooth"
          ? Math.sin(4 * Math.PI * t)
          : t < 0.235
            ? 0
            : t < 0.625
              ? 1
              : -0.5;
    return {
      sample,
      radiusSquared: 0.4 + 0.12 * signal,
      energy: 0.04 * (1 + 0.5 * signal),
      phase: 0.4 + signal,
    };
  }),
  schedules,
}));
const sources = new Set([
  "apps/web/scripts/verifyBroadbandObserverTimeline.mjs",
  "pnpm-lock.yaml",
]);
const report = {
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Offline native observer replay of identical manufactured symmetric field timelines. Every observation versus 30/60/144 Hz and a 300 ms presentation stall; common checkpoints at 0.5 and 1 second. This isolates temporal coalescing; it is not an acoustic solver, music, image or latency qualification.",
  sampleRate: 48000,
  geometryExposureSeconds: 0.4,
  stationaryTolerance: { absolute: 1e-6, relative: 1e-3 },
  timelines,
  timelineSha256: hash(JSON.stringify(timelines)),
  controlsPassed: false,
  retainedHistoryPassed: false,
  coalescingQualified: false,
  qualificationGap:
    "Dynamic errors are measured separately from storage rounding. Product gap/error limits, actual response timelines and rendered-image comparisons remain required.",
  comparisons: [],
};
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  plugins: [
    {
      name: "observer-timeline-provenance",
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
  response.end("<!doctype html><title>Observer timeline qualification</title>");
});
function difference(actual, reference) {
  assert.equal(actual.length, reference.length);
  assert(actual.length > 0);
  assert(actual.every(Number.isFinite));
  assert(reference.every(Number.isFinite));
  const errors = actual.map((value, i) => value - reference[i]);
  return {
    absoluteRms: Math.sqrt(
      errors.reduce((s, v) => s + v * v, 0) / errors.length,
    ),
    referenceRms: Math.sqrt(
      reference.reduce((s, v) => s + v * v, 0) / reference.length,
    ),
    maximumAbsolute: Math.max(...errors.map(Math.abs)),
  };
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
  const probe = await page.evaluate(async (timelines) => {
    const { runBroadbandObserverTimelineProbe } =
      await import("/packages/engine/src/testing/broadbandObserverTimelineProbe.js");
    return runBroadbandObserverTimelineProbe(timelines);
  }, timelines);
  report.probe = probe;
  assert.equal(probe.results.length, timelines.length * schedules.length);
  assert(probe.points.length >= 100, "insufficient spatial samples");
  for (const result of probe.results) {
    const reference = probe.results.find(
      (r) => r.fixture === result.fixture && r.schedule === "every-observation",
    );
    assert.equal(result.steps.filter((s) => s.reset).length, 1);
    assert.equal(result.steps.at(-1).stepIndex, 60);
    if (result.schedule.endsWith("-retained")) {
      assert.deepEqual(
        result.steps.map((step) => step.sample),
        reference.steps.map((step) => step.sample),
      );
      assert.equal(result.checkpoints.at(-1).history.queued, 0);
      assert.equal(result.checkpoints.at(-1).history.consumed, samples.length);
    }
    for (const [i, actual] of result.checkpoints.entries()) {
      const expected = reference.checkpoints[i];
      assert.equal(actual.sample, expected.sample);
      assert(actual.representedSample <= actual.sample);
      const quantities = {
        distance: [
          actual.geometry.map((v) => v[0]),
          expected.geometry.map((v) => v[0]),
        ],
        normal: [
          actual.geometry.flatMap((v) => v.slice(1)),
          expected.geometry.flatMap((v) => v.slice(1)),
        ],
        phase: [
          actual.appearance.flatMap((v) => v.slice(0, 2)),
          expected.appearance.flatMap((v) => v.slice(0, 2)),
        ],
        radiance: [
          actual.appearance.map((v) => v[2]),
          expected.appearance.map((v) => v[2]),
        ],
        opticalSupport: [
          actual.appearance.map((v) => v[3]),
          expected.appearance.map((v) => v[3]),
        ],
        organization: [
          actual.organization.flat(),
          expected.organization.flat(),
        ],
        availability: [actual.availability, expected.availability],
      };
      const metrics = Object.fromEntries(
        Object.entries(quantities).map(([name, [a, b]]) => [
          name,
          difference(a, b),
        ]),
      );
      if (
        result.schedule.endsWith("-retained") &&
        actual.observer.stepIndex === expected.observer.stepIndex
      )
        for (const [quantity, [a, b]] of Object.entries(quantities))
          assert.deepEqual(
            a,
            b,
            `${result.fixture} ${result.schedule} ${quantity}: retained history must be exact`,
          );
      const nearSurfacePoints = expected.geometry.flatMap((value, point) =>
        expected.availability[point] === 1 &&
        Math.abs(value[0]) <= 4 * probe.cellSize
          ? [point]
          : [],
      );
      const nearSurfaceDistance = nearSurfacePoints.length
        ? difference(
            nearSurfacePoints.map((point) => actual.geometry[point][0]),
            nearSurfacePoints.map((point) => expected.geometry[point][0]),
          )
        : null;
      // During a stall even a stationary field's finite radiance/color exposure
      // can lag. Equality is a control at common completed observer steps only.
      if (
        (result.fixture === "stationary" ||
          result.schedule.endsWith("-retained")) &&
        actual.observer.stepIndex === expected.observer.stepIndex
      ) {
        for (const [quantity, metric] of Object.entries(metrics))
          assert(
            metric.absoluteRms <=
              report.stationaryTolerance.absolute +
                report.stationaryTolerance.relative * metric.referenceRms,
            `${result.fixture} ${result.schedule} ${actual.sample} ${quantity}`,
          );
      }
      report.comparisons.push({
        fixture: result.fixture,
        schedule: result.schedule,
        sample: actual.sample,
        representedSample: actual.representedSample,
        observerStep: actual.observer.stepIndex,
        referenceObserverStep: expected.observer.stepIndex,
        sourceAgeSeconds: (actual.sample - actual.representedSample) / 48000,
        metrics,
        distanceRmsVoxels: metrics.distance.absoluteRms / probe.cellSize,
        nearSurface: {
          referenceBandVoxels: 4,
          pointCount: nearSurfacePoints.length,
          distance: nearSurfaceDistance,
          distanceRmsVoxels:
            nearSurfaceDistance === null
              ? null
              : nearSurfaceDistance.absoluteRms / probe.cellSize,
          scope:
            "Signed-distance proxy samples in a fixed reference band, not measured contour displacement or pixel error.",
        },
        signMismatchCount: actual.geometry.filter(
          (value, point) =>
            actual.availability[point] === 1 &&
            expected.availability[point] === 1 &&
            value[0] * expected.geometry[point][0] < 0,
        ).length,
      });
    }
  }
  assert.deepEqual(errors, []);
  report.controlsPassed = true;
  report.retainedHistoryPassed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
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
  const reportPath = path.join(
    output,
    "broadband-observer-timeline-report.json",
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        controlsPassed: report.controlsPassed,
        coalescingQualified: report.coalescingQualified,
        failure: report.failure,
        comparisons: report.comparisons.length,
        report: reportPath,
      },
      null,
      2,
    ),
  );
}
