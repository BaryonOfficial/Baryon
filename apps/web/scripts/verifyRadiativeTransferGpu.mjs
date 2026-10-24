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
  process.argv[2] ?? "/tmp/baryon-radiative-transfer-gpu",
);
// Values cross the old extinction cutoff, the small-optical-depth transition,
// and thin-to-opaque media. Float32 inputs make the CPU oracle compare exactly
// the values delivered to the shader, without reusing the production formula.
const fixtures = [];
for (const extinction of [
  0, 1e-10, 0.99e-8, 1e-8, 1.01e-8, 1e-7, 1e-6, 1e-5, 1e-3, 0.099999, 0.1,
  0.100001, 0.6, 10, 100,
]) {
  for (const distance of [0, 0.001, 0.1, 1, 6]) {
    for (const steps of [1, 2, 16, 70, 128]) {
      fixtures.push({
        extinction: Math.fround(extinction),
        distance: Math.fround(distance),
        steps,
      });
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
  response.end(
    "<!doctype html><title>Radiative transfer GPU regression</title>",
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
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const { adapter, samples: actual } = await page.evaluate(async (fixtures) => {
    const { runRadiativeTransferGpuProbe } =
      await import("/packages/engine/src/testing/radiativeTransferGpuProbe.js");
    return runRadiativeTransferGpuProbe(fixtures);
  }, fixtures);
  const checks = fixtures.map((fixture, index) => {
    const { extinction, distance, steps } = fixture;
    const tau = extinction * distance;
    const expectedRadiance =
      extinction === 0 ? distance : -Math.expm1(-tau) / extinction;
    const expectedTransmittance = Math.exp(-tau);
    const measured = actual[index];
    const radianceRelativeError =
      expectedRadiance === 0
        ? Math.abs(measured.radiance)
        : Math.abs(measured.radiance / expectedRadiance - 1);
    const transmittanceAbsoluteError = Math.abs(
      measured.transmittance - expectedTransmittance,
    );
    // Per-interval accuracy is separate from O(steps * Float32 epsilon)
    // accumulation/exp rounding in the existing transmittance recurrence.
    const tolerance = steps === 1 ? 4e-6 : 3e-5;
    return {
      ...fixture,
      ...measured,
      expectedRadiance,
      expectedTransmittance,
      radianceRelativeError,
      transmittanceAbsoluteError,
      tolerance,
      passed:
        Number.isFinite(radianceRelativeError) &&
        Number.isFinite(transmittanceAbsoluteError) &&
        radianceRelativeError <= tolerance &&
        transmittanceAbsoluteError <= tolerance &&
        (distance === 0 ? measured.radiance === 0 : measured.radiance > 0),
    };
  });
  const sourcePaths = [
    "packages/engine/src/core/raymarch/SafeVolumetricLightingModel.js",
    "packages/engine/src/testing/radiativeTransferGpuProbe.js",
    "apps/web/scripts/verifyRadiativeTransferGpu.mjs",
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
  const reportPath = path.join(output, "radiative-transfer-gpu-report.json");
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
  assert(report.passed, "Optical GPU regression failed; inspect saved report");
} finally {
  await browser?.close();
  await server.close();
}
