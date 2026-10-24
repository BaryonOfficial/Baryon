import { prepareHistoricalEngine } from "../../../scripts/lib/historical-engine.mjs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../../packages/engine/src/defaults.js";
import { buildModalExcitationAtlas } from "../../../packages/engine/src/utils/audio/modalExcitationAtlas.js";

// Browser-wide CPU accounting complements, but cannot replace, callback
// deadlines and per-stage timings. Run alone, after other native measurements.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(process.argv[2] ?? "/tmp/baryon-broadband-cpu");
const sampleRate = 48000;
const durationSeconds = 30;
const frameCount = durationSeconds * sampleRate;
const boundaryMode = "neumann";
const atlas = buildModalExcitationAtlas({ radius: 3, boundaryMode });
const shells = [...new Map(atlas.map((m) => [m.responseModeKey, m])).values()];
const families = atlas.map((m) => ({
  u: m.u,
  v: m.v,
  w: m.w,
  shellIndex: shells.findIndex((s) => s.responseModeKey === m.responseModeKey),
  sourceAmplitudeOverlap: m.sourceCouplingAmplitude * m.sourceProjectionWeight,
}));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const pcm = Buffer.alloc(frameCount * 2 * 4);
let seed = 0x91721;
for (let n = 0; n < frameCount; n++)
  for (let a = 0; a < 2; a++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pcm.writeFloatLE(0.4 * (seed / 2 ** 32 - 0.5), 4 * (2 * n + a));
  }
const report = {
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  runtime: process.version,
  dependencyVersions: Object.fromEntries(
    await Promise.all(
      ["three", "@playwright/test", "vite"].map(async (name) => [
        name,
        JSON.parse(
          await readFile(
            path.join(root, "node_modules", name, "package.json"),
            "utf8",
          ),
        ).version,
      ]),
    ),
  ),
  scope:
    "Browser-process CPU deltas for an isolated complete render probe, including initialization, compilation, warm-up, audio, rendering, final readback, disposal and result transport.",
  exclusions: [
    "steady-state CPU separated from startup and disposal",
    "per-callback capture deadline and audible underruns",
    "normal asynchronous product scheduling",
    "OS audio/display work outside Chromium child processes",
    "verification Node/Vite process from browser totals; measured separately",
    "physical presentation latency",
  ],
  method:
    "CDP SystemInfo.getProcessInfo: cumulative CPU seconds across all threads of each browser process. Sum positive deltas by stable process id. Reject disappeared processes and decreasing counters.",
  sourceHashes: {},
  machine: {
    cpu: cpus()[0]?.model,
    logicalCpuCount: cpus().length,
    platform: process.platform,
    architecture: process.arch,
  },
  fixture: {
    name: "seeded-decorrelated-stereo-noise",
    sampleRate,
    frameCount,
    durationSeconds,
    channelCount: 2,
    pcmSha256: hash(pcm),
    boundaryMode,
    familyCount: families.length,
    shellCount: shells.length,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    spectral: true,
    nonlinear: true,
    tailFrames: 4096,
    width: 1920,
    height: 1080,
  },
  results: [],
  resourceAcceptance: "unverified; accounting alone sets no total-CPU budget",
  passed: false,
};
const servedSources = new Set();
const historicalEngine = prepareHistoricalEngine(root);
report.historicalEngine = historicalEngine.provenance;
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [root, historicalEngine.directory] },
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  plugins: [
    historicalEngine.plugin,
    {
      name: "cpu-profile-source-provenance",
      configureServer(server) {
        // Install before Vite's transform middleware, which consumes module
        // requests before the later HTML/PCM handler can observe them.
        server.middlewares.use((request, _response, next) => {
          const pathname = decodeURIComponent(
            (request.url ?? "").split("?")[0],
          );
          if (
            pathname.startsWith("/packages/engine/src/") &&
            pathname.endsWith(".js")
          )
            servedSources.add(pathname.slice(1));
          next();
        });
      },
    },
  ],
});
server.middlewares.use((request, response, next) => {
  const pathname = decodeURIComponent((request.url ?? "").split("?")[0]);
  if (pathname === "/pcm") {
    response.setHeader("Content-Type", "application/octet-stream");
    response.end(pcm);
  } else if (pathname === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Baryon CPU accounting</title>");
  } else next();
});

function processDelta(before, after) {
  assert(before.length && after.length, "missing CPU process inventory");
  assert.equal(new Set(before.map((p) => p.id)).size, before.length);
  assert.equal(new Set(after.map((p) => p.id)).size, after.length);
  const previous = new Map(before.map((p) => [p.id, p]));
  const current = new Set(after.map((p) => p.id));
  for (const p of before)
    assert(current.has(p.id), `unaccounted exited process ${p.id}`);
  return after.map((p) => {
    const prior = previous.get(p.id);
    assert(!prior || prior.type === p.type, "CPU process identity changed");
    assert(Number.isFinite(p.cpuTime) && p.cpuTime >= 0);
    const deltaSeconds = p.cpuTime - (prior?.cpuTime ?? 0);
    assert(
      Number.isFinite(deltaSeconds) && deltaSeconds >= 0,
      "CPU counter decreased",
    );
    return {
      id: p.id,
      type: p.type,
      startedDuringMeasurement: !prior,
      beforeSeconds: prior?.cpuTime ?? 0,
      afterSeconds: p.cpuTime,
      deltaSeconds,
    };
  });
}
// Accounting must not hide loss of a process or an impossible counter reset.
assert.throws(() =>
  processDelta(
    [{ id: 1, type: "renderer", cpuTime: 1 }],
    [{ id: 2, type: "renderer", cpuTime: 2 }],
  ),
);
assert.throws(() =>
  processDelta(
    [{ id: 1, type: "renderer", cpuTime: 2 }],
    [{ id: 1, type: "renderer", cpuTime: 1 }],
  ),
);
assert.equal(
  processDelta(
    [{ id: 1, type: "browser", cpuTime: 2 }],
    [
      { id: 1, type: "browser", cpuTime: 2.5 },
      { id: 2, type: "renderer", cpuTime: 0.25 },
    ],
  ).reduce((sum, p) => sum + p.deltaSeconds, 0),
  0.75,
);

await mkdir(output, { recursive: true });
try {
  await server.listen();
  for (const baseline of [true, false]) {
    const browser = await chromium.launch({
      args: [
        "--enable-unsafe-webgpu",
        "--autoplay-policy=no-user-gesture-required",
        ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      ],
    });
    try {
      report.browser = browser.version();
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(server.resolvedUrls.local[0]);
      // Load modules and source bytes outside the interval. Renderer creation,
      // shader compilation and the probe's warm-up remain inside it.
      await page.evaluate(
        async ({ baseline, frameCount }) => {
          const bytes = await (await fetch("/pcm")).arrayBuffer();
          const view = new DataView(bytes);
          globalThis.cpuProbeChannels = Array.from({ length: 2 }, (_, a) =>
            Float32Array.from({ length: frameCount }, (_, n) =>
              view.getFloat32(4 * (2 * n + a), true),
            ),
          );
          globalThis.cpuProbeRun = baseline
            ? (
                await import("/packages/engine/src/testing/currentModalRenderProbe.js")
              ).runCurrentModalRenderProbe
            : (
                await import("/packages/engine/src/testing/broadbandRenderProbe.js")
              ).runBroadbandRenderProbe;
        },
        { baseline, frameCount },
      );
      const cdp = await browser.newBrowserCDPSession();
      const before = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
      const harnessCpuBefore = process.cpuUsage();
      const started = performance.now();
      const result = await page.evaluate(
        async (fixture) => {
          const result = await globalThis.cpuProbeRun({
            ...fixture,
            channels: globalThis.cpuProbeChannels,
          });
          return {
            renderFrameCount: result.renderRecords.length,
            pcmAccounting: result.pcmAccounting ?? null,
            workerCalls: result.workerMs?.length ?? null,
            // Keep full timing samples, but omit the final encoded image.
            renderRecords: result.renderRecords,
            workerMs: result.workerMs ?? null,
          };
        },
        {
          families,
          shells,
          sampleRate,
          boundaryMode,
          cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
          tailFrames: 4096,
          spectral: true,
        },
      );
      const after = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
      const wallSeconds = (performance.now() - started) / 1000;
      const harnessCpu = process.cpuUsage(harnessCpuBefore);
      const processes = processDelta(before, after);
      const totalCpuSeconds = processes.reduce(
        (sum, p) => sum + p.deltaSeconds,
        0,
      );
      assert(totalCpuSeconds > 0 && result.renderFrameCount > 0);
      assert.deepEqual(errors, []);
      report.results.push({
        implementation: baseline ? "current" : "candidate",
        processes,
        before,
        after,
        wallSeconds,
        totalCpuSeconds,
        cpuSecondsPerSourceAudioSecond: totalCpuSeconds / durationSeconds,
        averageLogicalCores: totalCpuSeconds / wallSeconds,
        fractionOfMachineCpu: totalCpuSeconds / wallSeconds / cpus().length,
        verificationHarnessCpuSeconds:
          (harnessCpu.user + harnessCpu.system) / 1e6,
        ...result,
      });
      console.log(
        `completed CPU accounting: ${baseline ? "current" : "candidate"}`,
      );
    } finally {
      await browser.close();
    }
  }
  for (const source of [
    "packages/engine/src/testing/currentModalRenderProbe.js",
    "packages/engine/src/testing/broadbandRenderProbe.js",
    "packages/engine/src/testing/broadbandCaptureProbe.worker.js",
    "packages/engine/src/core/audio/audioPcmCapture.worklet.js",
  ])
    assert(
      servedSources.has(source),
      `missing measured source provenance: ${source}`,
    );
  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  await server.close();
  historicalEngine.dispose();
  servedSources.add("apps/web/scripts/profileBroadbandCpu.mjs");
  servedSources.add("pnpm-lock.yaml");
  servedSources.add("scripts/lib/historical-engine.mjs");
  report.sourceHashes = Object.fromEntries(
    await Promise.all(
      [...servedSources]
        .sort()
        .map(async (file) => [
          file,
          hash(await readFile(path.join(root, file))),
        ]),
    ),
  );
  const reportPath = path.join(output, "broadband-cpu-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        failure: report.failure,
        report: reportPath,
        results: report.results.map(
          ({
            implementation,
            totalCpuSeconds,
            cpuSecondsPerSourceAudioSecond,
            averageLogicalCores,
          }) => ({
            implementation,
            totalCpuSeconds,
            cpuSecondsPerSourceAudioSecond,
            averageLogicalCores,
          }),
        ),
      },
      null,
      2,
    ),
  );
}
