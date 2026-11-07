import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const positional = process.argv
  .slice(2)
  .filter((argument) => argument !== "--require-byte-exact");
const output = path.resolve(
  positional[0] ?? "/tmp/baryon-parallel-spectral-projection",
);
// Frozen pre-change baseline is served only by this qualification harness.
const baselineRevision =
  positional[1] ?? "fa46be4f704a08bbbb060c0f40c9f93a428e6844";
const requireByteExact = process.argv.includes("--require-byte-exact");
const sourcePath =
  "packages/engine/src/core/raymarch/broadbandSpectralProjection.js";
const baseline = execFileSync(
  "git",
  ["show", `${baselineRevision}:${sourcePath}`],
  { cwd: root, encoding: "utf8" },
);
const sources = new Set([
  sourcePath,
  "apps/web/scripts/verifyParallelSpectralProjection.mjs",
  "pnpm-lock.yaml",
]);
const report = {
  passed: false,
  baselineRevision,
  requireByteExact,
  baselineSha256: createHash("sha256").update(baseline).digest("hex"),
  scope:
    "Matched native GPU spectral projection pass only. Same Float32 inputs, alternating order, fifty warmup pairs and two hundred measured pairs. Excludes spectral expansion, observer, raymarch, output sinks and whole-app FPS.",
};
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  plugins: [
    {
      name: "spectral-baseline",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = decodeURIComponent((request.url ?? "").split("?")[0]);
          if (url.startsWith("/packages/engine/src/") && url.endsWith(".js"))
            sources.add(url.slice(1));
          if (url === "/") {
            response.setHeader("Content-Type", "text/html");
            response.end(
              '<!doctype html><link rel="icon" href="data:,"><title>Spectral projection regression</title>',
            );
          } else next();
        });
      },
      resolveId(id) {
        if (id === "/__spectral_baseline.js") return "\0spectral-baseline";
      },
      load(id) {
        if (id === "\0spectral-baseline")
          return baseline
            .replace(
              '"../../utils/audio/spectralPhase.js"',
              '"/packages/engine/src/utils/audio/spectralPhase.js"',
            )
            .replace(
              '"./fixedOrientationTextureNode.js"',
              '"/packages/engine/src/core/raymarch/fixedOrientationTextureNode.js"',
            );
      },
    },
  ],
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
  report.probe = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.webgpu.js");
    const { createBroadbandSpectralProjection: before } =
      await import("/__spectral_baseline.js");
    const { createBroadbandSpectralProjection: after } =
      await import("/packages/engine/src/core/raymarch/broadbandSpectralProjection.js");
    const { referenceSpectralMatrices } =
      await import("/packages/engine/src/testing/broadbandSpectralReference.js");
    const { installGpuProbeTiming, resolveGpuProbeTiming } =
      await import("/packages/engine/src/testing/gpuProbeTiming.js");
    const renderer = new THREE.WebGPURenderer({
      antialias: false,
      trackTimestamp: true,
    });
    await renderer.init();
    const device = renderer.backend.device;
    if (
      !renderer.backend.isWebGPUBackend ||
      !device.features.has("timestamp-query")
    )
      throw Error("Hardware WebGPU with timestamps required");
    const uncapturedErrors = [];
    const onError = (event) => uncapturedErrors.push(event.error.message);
    device.addEventListener("uncapturederror", onError);
    const restoreTiming = installGpuProbeTiming(renderer);
    const adapter = Object.fromEntries(
      ["vendor", "architecture", "device", "description"].map((k) => [
        k,
        device.adapterInfo[k],
      ]),
    );
    const results = [];
    try {
      const fixtures = [
        ...[59, 29].flatMap((shellCount) =>
          [1, 2].map((channelCount) => ({
            name: `${shellCount}-shell-${channelCount}-channel`,
            shellCount,
            channelCount,
            frameSize: 2048,
            gain: 1,
          })),
        ),
        ...[1e-7, 0, 100].map((gain) => ({
          name: `gain-${gain}`,
          shellCount: 7,
          channelCount: 2,
          frameSize: 2048,
          gain,
        })),
        {
          name: "short-window-inactive-lanes",
          shellCount: 3,
          channelCount: 1,
          frameSize: 8,
          gain: 1,
        },
        {
          name: "cancellation",
          shellCount: 7,
          channelCount: 2,
          frameSize: 2048,
          gain: 1,
          cancellation: true,
        },
        {
          name: "nyquist-only",
          shellCount: 7,
          channelCount: 2,
          frameSize: 2048,
          gain: 1,
          nyquist: true,
        },
        ...[1, 2, 4, 8, 16, 32, 60, 64].map((shellCount) => ({
          name: `pair-coverage-${shellCount}-shell`,
          shellCount,
          channelCount: 2,
          frameSize: 8,
          gain: 1,
        })),
      ];
      for (const fixture of fixtures) {
        const { shellCount, channelCount, frameSize, gain } = fixture;
        const bins = frameSize / 2 + 1;
        let seed = 7183;
        const data = new Float32Array(4 * bins * shellCount * channelCount);
        for (let row = 0; row < shellCount * channelCount; row++)
          for (let b = 0; b < bins; b++)
            for (let lane = 0; lane < 4; lane++) {
              seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
              let value = seed / 2 ** 32 - 0.5;
              if (fixture.cancellation)
                value = (row % 2 ? (b % 2 ? 1 : -1) : 1) * (lane + 1);
              if (fixture.nyquist && b !== bins - 1) value = 0;
              // Nonzero DC detects accidental inclusion of the excluded bin.
              data[4 * (row * bins + b) + lane] =
                gain * (b === 0 ? 100 : value);
            }
        const frame = {
          shellCount,
          channelCount,
          frameSize,
          sampleRate: 48000,
          coefficients: data,
        };
        const expected = referenceSpectralMatrices(frame);
        const source = new THREE.DataTexture(
          data,
          bins,
          shellCount * channelCount,
          THREE.RGBAFormat,
          THREE.FloatType,
        );
        source.minFilter = source.magFilter = THREE.NearestFilter;
        source.colorSpace = THREE.NoColorSpace;
        source.generateMipmaps = false;
        source.needsUpdate = true;
        // Match the production expansion's immutable render-target source.
        const sourceTarget = new THREE.RenderTarget(
          bins,
          shellCount * channelCount,
          {
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            depthBuffer: false,
          },
        );
        sourceTarget.texture.colorSpace = THREE.NoColorSpace;
        renderer.initRenderTarget(sourceTarget);
        renderer.copyTextureToTexture(source, sourceTarget.texture);
        await device.queue.onSubmittedWorkDone();
        const projections = {
          before: before({ ...frame, sourceTexture: sourceTarget.texture }),
          after: after({ ...frame, sourceTexture: sourceTarget.texture }),
        };
        const samples = { before: [], after: [] };
        try {
          const callsBeforeCompile = renderer.info.compute.calls;
          await projections.after.compile(renderer);
          if (renderer.info.compute.calls !== callsBeforeCompile)
            throw new Error(
              "Compute precompilation must not dispatch the projection",
            );
          for (let iteration = 0; iteration < 250; iteration++)
            for (const key of iteration % 2
              ? ["after", "before"]
              : ["before", "after"]) {
              const started = performance.now();
              projections[key].render(renderer);
              const submitted = performance.now();
              const timing = await resolveGpuProbeTiming(renderer);
              if (iteration >= 50)
                samples[key].push({
                  gpuMs: timing.elapsedMs,
                  submissionMs: submitted - started,
                  completionMs: performance.now() - started,
                });
            }
          const numerical = {};
          const bitPatterns = {};
          for (const key of ["before", "after"]) {
            const pixels = await renderer.backend.copyTextureToBuffer(
              projections[key].texture,
              0,
              0,
              shellCount,
              3 * shellCount,
              0,
            );
            const stride = Math.ceil((shellCount * 16) / 256) * 64;
            const pixel = (tile, i, j, lane) =>
              pixels[(tile * shellCount + i) * stride + 4 * j + lane];
            const metrics = [];
            for (const [quantity, tile] of [
              ["pressure", 0],
              ["velocity", 1],
            ])
              for (let k = 0; k < 5; k++) {
                let error = 0,
                  energy = 0,
                  maxError = 0;
                for (let i = 0; i < shellCount; i++)
                  for (let j = 0; j < shellCount; j++) {
                    const value =
                      k < 4 ? pixel(tile, i, j, k) : pixel(2, i, j, tile);
                    const mirror =
                      k < 4 ? pixel(tile, j, i, k) : pixel(2, j, i, tile);
                    if (!Number.isFinite(value) || value !== mirror)
                      throw Error(
                        `${fixture.name}: nonfinite or asymmetric ${key} matrix`,
                      );
                    const reference =
                      expected[quantity][
                        k * shellCount ** 2 + i * shellCount + j
                      ];
                    error += (value - reference) ** 2;
                    energy += reference ** 2;
                    maxError = Math.max(maxError, Math.abs(value - reference));
                  }
                metrics.push({
                  quantity,
                  moment: k,
                  absoluteRms: Math.sqrt(error / shellCount ** 2),
                  referenceRms: Math.sqrt(energy / shellCount ** 2),
                  relativeRms: energy ? Math.sqrt(error / energy) : null,
                  maxError,
                });
              }
            numerical[key] = metrics;
            // Ignore readback row padding; compare every written matrix lane.
            const bits = new Uint32Array(
              pixels.buffer,
              pixels.byteOffset,
              pixels.length,
            );
            const values = [];
            for (let tile = 0; tile < 3; tile++)
              for (let row = 0; row < shellCount; row++)
                for (let column = 0; column < shellCount; column++)
                  for (let lane = 0; lane < 4; lane++)
                    values.push(
                      bits[
                        (tile * shellCount + row) * stride + 4 * column + lane
                      ],
                    );
            bitPatterns[key] = values;
          }
          results.push({
            ...fixture,
            samples,
            numerical,
            byteExact: bitPatterns.before.every(
              (value, index) => value === bitPatterns.after[index],
            ),
            textureBytes: projections.after.textureBytes,
          });
        } finally {
          projections.before.dispose();
          projections.after.dispose();
          sourceTarget.dispose();
          source.dispose();
        }
      }
      if (uncapturedErrors.length) throw Error(uncapturedErrors.join("\n"));
      return { adapter, results };
    } finally {
      device.removeEventListener("uncapturederror", onError);
      restoreTiming();
      await renderer.dispose();
    }
  });
  assert.deepEqual(errors, []);
  assert(
    report.probe.adapter.vendor,
    "Actual WebGPU device must identify its adapter",
  );
  assert(
    !/swiftshader|llvmpipe|software|warp/i.test(
      Object.values(report.probe.adapter).join(" "),
    ),
    "Software adapter is not performance evidence",
  );
  const median = (values) => {
    const s = [...values].sort((a, b) => a - b);
    return (
      (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2
    );
  };
  for (const result of report.probe.results) {
    if (requireByteExact)
      assert(result.byteExact, `${result.name}: matrix bytes changed`);
    for (const metrics of Object.values(result.numerical))
      for (const m of metrics) {
        assert(
          m.absoluteRms <= 1e-6 + 1e-4 * m.referenceRms,
          `${result.name}: absolute error ${m.quantity}/${m.moment}`,
        );
        if (m.referenceRms > 0)
          assert(
            m.relativeRms < 1e-4,
            `${result.name}: relative error ${m.quantity}/${m.moment}`,
          );
      }
    const before = median(result.samples.before.map((s) => s.gpuMs));
    const after = median(result.samples.after.map((s) => s.gpuMs));
    result.performance = {
      beforeMedianGpuMs: before,
      afterMedianGpuMs: after,
      reductionPercent: (100 * (before - after)) / before,
    };
  }
  report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  report.sourceHashes = Object.fromEntries(
    await Promise.all(
      [...sources].sort().map(async (p) => [
        p,
        createHash("sha256")
          .update(await readFile(path.join(root, p)))
          .digest("hex"),
      ]),
    ),
  );
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser?.close();
  await server.close();
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        failure: report.failure,
        adapter: report.probe?.adapter,
        performance: report.probe?.results.map(({ name, performance }) => ({
          name,
          ...performance,
        })),
        output,
      },
      null,
      2,
    ),
  );
}
