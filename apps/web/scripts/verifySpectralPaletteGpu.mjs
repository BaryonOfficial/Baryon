import { resolveSpectralChromaticity } from "../../../packages/engine/src/core/raymarch/spectralColorimetry.js";
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
  process.argv[2] ?? "/tmp/baryon-spectral-palette-gpu",
);
const fixtures = [];
for (let i = 0; i < 2048; i++) {
  const angle = (i / 2048) * 2 * Math.PI;
  fixtures.push({ direction: [Math.cos(angle), Math.sin(angle)] });
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
  response.end("<!doctype html><title>Spectral palette GPU regression</title>");
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
    const { runSpectralPaletteGpuProbe } =
      await import("/packages/engine/src/testing/spectralPaletteGpuProbe.js");
    return runSpectralPaletteGpuProbe(fixtures);
  }, fixtures);
  const checks = fixtures.map((fixture, index) => {
    const expected = resolveSpectralChromaticity(fixture.direction);
    const measured = actual[index].rgb;
    const error = Math.max(
      ...expected.map((v, i) => Math.abs(v - measured[i])),
    );
    return {
      ...fixture,
      expected,
      measured,
      error,
      passed: Number.isFinite(error) && error < 5e-6,
    };
  });
  const sourcePaths = [
    "packages/engine/src/core/raymarch/spectralColorimetry.js",
    "packages/engine/src/core/raymarch/spectralColorimetryCoefficients.js",
    "packages/engine/src/core/raymarch/cymaticObserverNode.js",
    "packages/engine/src/testing/spectralPaletteGpuProbe.js",
    "apps/web/scripts/verifySpectralPaletteGpu.mjs",
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
  const reportPath = path.join(output, "spectral-palette-gpu-report.json");
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
    "Spectral palette GPU regression failed; inspect saved report",
  );
} finally {
  await browser?.close();
  await server.close();
}
