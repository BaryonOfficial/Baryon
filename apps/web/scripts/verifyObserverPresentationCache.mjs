import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(
  process.argv[2] ?? "/tmp/baryon-presentation-cache",
);
const sources = new Set([
  "apps/web/scripts/verifyObserverPresentationCache.mjs",
  "pnpm-lock.yaml",
]);
const observations = Array.from({ length: 17 }, (_, index) => ({
  sample: index * 512,
  radiusSquared: 0.4 + 0.1 * Math.sin(index * 0.4),
  energy: 0.04 * (1 + 0.5 * Math.cos(index * 0.7)),
  phase: index * 0.25,
}));
const report = {
  scope:
    "Native WebGPU equivalence of all canonical observer and derived display atlas bytes. Identical ordered observations, packing each observation versus once after a retained batch. This is not throughput or whole-app GPU-cost acceptance.",
  passed: false,
};
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  plugins: [
    {
      name: "presentation-cache-provenance",
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
  response.end(
    '<!doctype html><link rel="icon" href="data:,"><title>Observer presentation cache regression</title>',
  );
});
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
  report.probe = await page.evaluate(async (observations) => {
    const { runBroadbandObserverTimelineProbe } =
      await import("/packages/engine/src/testing/broadbandObserverTimelineProbe.js");
    return runBroadbandObserverTimelineProbe(
      [
        {
          name: "dynamic-presentation-cache",
          observations,
          schedules: [
            {
              name: "every-observation",
              observations: observations.map((_, i) => i),
            },
            { name: "batch-retained", retained: true, observations: [0, 16] },
          ],
        },
      ],
      { checkpointSamples: [8192], verifyPresentationCache: true },
    );
  }, observations);
  assert.deepEqual(errors, []);
  const adapter = report.probe.gpuAdapter;
  assert(adapter.vendor, "The actual WebGPU device must report its adapter");
  assert(
    !/swiftshader|llvmpipe|software|warp|basic render driver/i.test(
      Object.values(adapter).join(" "),
    ),
    "Hardware WebGPU is required for this regression",
  );
  const [reference, batched] = report.probe.results;
  assert.equal(reference.steps.length, observations.length);
  assert.deepEqual(batched.steps, reference.steps);
  assert.equal(
    reference.presentationPacks,
    reference.steps.filter((step) => step.baked).length,
  );
  assert.equal(batched.presentationPacks, 2);
  assert(reference.presentationPacks > batched.presentationPacks);
  const expected = reference.checkpoints[0];
  const actual = batched.checkpoints[0];
  assert.equal(actual.history.consumed, 17);
  assert.equal(actual.history.queued, 0);
  assert.deepEqual(actual.observer, expected.observer);
  assert.equal(actual.fullAtlas.length, 6);
  assert(
    actual.fullAtlas.every((lane) => lane.bytes > 0 && lane.nonzeroBytes > 0),
  );
  assert.deepEqual(
    actual.fullAtlas,
    expected.fullAtlas,
    "Canonical observer and packed display atlases must be byte-exact",
  );
  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
  report.sourceHashes = Object.fromEntries(
    await Promise.all(
      [...sources].sort().map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(path.join(root, file)))
          .digest("hex"),
      ]),
    ),
  );
  const reportPath = path.join(
    output,
    "observer-presentation-cache-report.json",
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      { passed: report.passed, failure: report.failure, report: reportPath },
      null,
      2,
    ),
  );
}
