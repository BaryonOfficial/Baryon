import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(
  process.argv[2] ?? "/tmp/baryon-spectral-phase-gpu",
);
// Float32 inputs and an independent closed-form angular-decay oracle.
const fixtures = [];
for (const phase of [0, 0.7, -2.1]) {
  for (const offset of [
    0,
    0.4,
    -0.4,
    Math.PI,
    Math.PI - 0.001,
    -Math.PI + 0.001,
  ]) {
    for (const assimilation of [0, 1 - Math.exp(-1 / 6), 0.01, 1]) {
      for (const steps of [1, 6, 60, 120]) {
        const prior = [Math.cos(phase), Math.sin(phase)].map(Math.fround);
        const evidence = (
          offset === Math.PI
            ? prior.map((v) => -v)
            : [Math.cos(phase + offset), Math.sin(phase + offset)]
        ).map(Math.fround);
        fixtures.push({
          prior,
          evidence,
          assimilation: Math.fround(assimilation),
          steps,
        });
      }
    }
  }
}
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  appType: "custom",
});
server.middlewares.use((request, response, next) => {
  if (request.url !== "/") return next();
  response.setHeader("Content-Type", "text/html");
  response.end("<!doctype html><title>Spectral phase GPU regression</title>");
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
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const { adapter, samples: actual } = await page.evaluate(async (fixtures) => {
    const { runSpectralPhaseGpuProbe } =
      await import("/packages/engine/src/testing/spectralPhaseGpuProbe.js");
    return runSpectralPhaseGpuProbe(fixtures);
  }, fixtures);
  const checks = fixtures.map((fixture, index) => {
    const { prior, evidence, assimilation, steps } = fixture;
    const cross = prior[0] * evidence[1] - prior[1] * evidence[0];
    const agreement = prior[0] * evidence[0] + prior[1] * evidence[1];
    const delta =
      agreement < 0 && Math.abs(cross) <= 2 ** -20
        ? Math.PI
        : Math.atan2(cross, agreement);
    const angle =
      Math.atan2(prior[1], prior[0]) +
      delta * (1 - (1 - assimilation) ** steps);
    const expected =
      assimilation === 0 ? prior : [Math.cos(angle), Math.sin(angle)];
    const measured = actual[index].direction;
    const error = Math.hypot(
      measured[0] - expected[0],
      measured[1] - expected[1],
    );
    return {
      ...fixture,
      expected,
      measured,
      error,
      passed: Number.isFinite(error) && error <= 3e-5,
    };
  });
  const sourcePaths = [
    "packages/engine/src/core/raymarch/spectralPhaseFieldNode.js",
    "packages/engine/src/core/raymarch/spectralPhaseFieldReference.js",
    "packages/engine/src/core/raymarch/cymaticObserverNode.js",
    "packages/engine/src/testing/spectralPhaseGpuProbe.js",
    "apps/web/scripts/verifySpectralPhaseGpu.mjs",
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(path.join(root, file)))
          .digest("hex"),
      ]),
    ),
  );
  const report = {
    createdAt: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceHashes,
    adapter,
    errors,
    checks,
    passed: errors.length === 0 && checks.every((check) => check.passed),
  };
  await mkdir(output, { recursive: true });
  const reportPath = path.join(output, "spectral-phase-gpu-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        cases: checks.length,
        failures: checks.filter((check) => !check.passed).slice(0, 8),
        errors,
        reportPath,
      },
      null,
      2,
    ),
  );
  assert(
    report.passed,
    "Spectral phase GPU regression failed; inspect saved report",
  );
} finally {
  await browser?.close();
  await server.close();
}
