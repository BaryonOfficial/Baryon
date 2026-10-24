import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createResponseHistorySpectrumProbe } from "../../../packages/engine/src/testing/responseHistorySpectrumProbe.js";
import { referenceSpectralMatrices } from "../../../packages/engine/src/testing/broadbandSpectralReference.js";
import { expandBroadbandSpectralWindow } from "../../../packages/engine/src/testing/broadbandSpectralWindowReference.js";
import { createBroadbandAudioState } from "../../../packages/engine/src/utils/audio/broadbandAudioState.js";
import { buildModalExcitationAtlas } from "../../../packages/engine/src/utils/audio/modalExcitationAtlas.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../../packages/engine/src/defaults.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.resolve(
  process.argv[2] ?? "/tmp/baryon-broadband-spectrum",
);
const cpuWarmupBlocks = 128;
const cpuMeasuredBlocks = 512;
await mkdir(output, { recursive: true });
const sources = [
  "packages/engine/src/utils/audio/broadbandResponseSpectrum.js",
  "packages/engine/src/utils/audio/broadbandModalResponse.js",
  "packages/engine/src/utils/audio/modalResponseMoments.js",
  "packages/engine/src/utils/audio/broadbandAudioState.js",
  "packages/engine/src/utils/audio/streamingAcousticDrive.js",
  "packages/engine/src/utils/audio/waterAcousticNonlinearity.js",
  "packages/engine/src/utils/audio/spectralPhase.js",
  "packages/engine/src/testing/broadbandSpectralReference.js",
  "packages/engine/src/testing/broadbandSpectralWindowReference.js",
  "packages/engine/src/core/raymarch/broadbandSpectralExpansion.js",
  "packages/engine/src/core/raymarch/fixedOrientationTextureNode.js",
  "packages/engine/src/testing/responseHistorySpectrumProbe.js",
  "packages/engine/src/core/raymarch/broadbandSpectralProjection.js",
  "packages/engine/src/testing/broadbandSpectralGpuProbe.js",
  "packages/engine/src/testing/gpuProbeTiming.js",
  "packages/engine/src/core/audio/fft.js",
  "packages/engine/src/core/audio/fftSpectrum.js",
  "packages/engine/src/core/audio/audioPcmStream.js",
  "packages/engine/src/utils/audio/modalExcitationAtlas.js",
  "packages/engine/src/utils/audio/modalDamping.js",
  "packages/engine/src/defaults.js",
  "apps/web/scripts/verifyBroadbandSpectrum.mjs",
];
const report = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  timestamp: new Date().toISOString(),
  runtime: process.version,
  machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  sourceHashes: Object.fromEntries(
    await Promise.all(
      sources.map(async (p) => [
        p,
        createHash("sha256")
          .update(await readFile(path.join(root, p)))
          .digest("hex"),
      ]),
    ),
  ),
  scope:
    "GPU finite-window expansion and complete spectral matrix projection versus Float64 reference; Node candidate CPU cost includes window publication, excluding transport, spatial field, observer, optics and physical display latency.",
  measurement: {
    framesPerBlock: 512,
    cpuWarmupBlocks,
    cpuMeasuredBlocks,
    gpuWarmupIterations: 2,
    gpuMeasuredIterations: 8,
  },
  cpu: [],
  results: [],
  passed: false,
  lanes: {
    numerical: "unverified",
    defaultAtlasCpu: "unverified",
    completeGpuPath: "unverified",
  },
};
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(0.5 * sorted.length)],
    p95: sorted[Math.floor(0.95 * sorted.length)],
    max: sorted.at(-1),
    count: sorted.length,
  };
};
const atlas = buildModalExcitationAtlas({ radius: 3 });
const shells = [...new Map(atlas.map((m) => [m.responseModeKey, m])).values()];
report.apparatus = {
  familyCount: atlas.length,
  shellCount: shells.length,
  shells: shells.map(
    ({ responseModeKey, naturalFrequencyHz, qualityFactor }) => ({
      responseModeKey,
      naturalFrequencyHz,
      qualityFactor,
    }),
  ),
  nonlinearConfiguration: CAVITY_ACOUSTIC_DEFAULTS,
  linearIncidentPeakPressurePascalAtFullScale: 0,
};
const cases = [];
for (const channelCount of [1, 2]) {
  for (const nonlinear of [false, true]) {
    const configuration = {
      sourceGeneration: 1,
      timelineRevision: 0,
      processingRevision: 0,
      channelCount,
      sampleRate: 48000,
    };
    const initializationStarted = performance.now();
    const state = createBroadbandAudioState({
      configuration,
      shells,
      cavityAcousticScale: {
        ...CAVITY_ACOUSTIC_DEFAULTS,
        incidentPeakPressurePascalAtFullScale: nonlinear
          ? CAVITY_ACOUSTIC_DEFAULTS.incidentPeakPressurePascalAtFullScale
          : 0,
      },
    });
    const initializationMs = performance.now() - initializationStarted;
    const times = [];
    const warmupTimes = [];
    const pcmHash = createHash("sha256");
    let observation;
    for (
      let sequence = 0;
      sequence < cpuWarmupBlocks + cpuMeasuredBlocks;
      sequence++
    ) {
      const channels = Array.from({ length: channelCount }, (_, a) =>
        Float64Array.from(
          { length: 512 },
          (_, n) =>
            0.2 * Math.sin((sequence * 512 + n) * 0.03 + a) +
            0.1 * Math.cos((sequence * 512 + n) * 1.31),
        ),
      );
      channels.forEach((c) => pcmHash.update(new Uint8Array(c.buffer)));
      const started = performance.now();
      const accepted = state.accept({
        ...configuration,
        sequence,
        startSample: sequence * 512,
        frameCount: 512,
        channels,
      });
      observation = state.read();
      (sequence >= cpuWarmupBlocks ? times : warmupTimes).push(
        performance.now() - started,
      );
      assert(
        accepted.accepted,
        `CPU fixture admission failed: ${accepted.reason}`,
      );
      assert.equal(observation.processedFrames, (sequence + 1) * 512);
    }
    const name = `${channelCount === 1 ? "mono" : "stereo"}-${nonlinear ? "nonlinear" : "linear"}`;
    report.cpu.push({
      name,
      configuration,
      shellCount: shells.length,
      frameSize: 2048,
      initializationMs,
      warmupMillisecondsPer512Samples: summarize(warmupTimes),
      millisecondsPer512Samples: summarize(times),
      spectralPublicationBytes: [
        "transitions",
        "inputSpectrum",
        "boundaryDelta",
      ].reduce(
        (sum, key) => sum + observation.response.spectral[key].byteLength,
        0,
      ),
      pcmSha256: pcmHash.digest("hex"),
    });
    assert.equal(
      observation.response.sampleIndex,
      (cpuWarmupBlocks + cpuMeasuredBlocks) * 512 - (nonlinear ? 2048 : 0),
    );
    cases.push({ name, frame: observation.response.spectral });
  }
}
report.lanes.defaultAtlasCpu = report.cpu.every(
  (c) => c.millisecondsPer512Samples.p95 <= 4,
)
  ? "passed"
  : "failed";
for (const name of ["noise", "quiet-noise", "silence"]) {
  let seed = 7183;
  const spectrum = createResponseHistorySpectrumProbe({
    shellCount: 7,
    channelCount: 2,
    sampleRate: 44100,
  });
  for (let n = 0; n < 4096; n++) {
    const state = () =>
      Float64Array.from({ length: 14 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (
          (seed / 2 ** 32 - 0.5) *
          (name === "silence" ? 0 : name === "quiet-noise" ? 1e-7 : 1)
        );
      });
    spectrum.advance(state(), state());
  }
  cases.push({ name, frame: spectrum.read() });
}
for (const name of [
  "high-q-startup",
  "high-q-ringdown",
  "critical-transient",
]) {
  const sampleRate = 48000;
  const configuration = {
    sourceGeneration: 1,
    timelineRevision: 0,
    processingRevision: 0,
    sampleRate,
    channelCount: 2,
  };
  const shells = (
    name === "critical-transient"
      ? [
          [20, 0.5],
          [118.4, 0.500001],
          [21600, 0.5],
          [24000, 30],
        ]
      : [
          [375, 50000],
          [375.001, 50000],
          [24000, 50000],
        ]
  ).map(([naturalFrequencyHz, qualityFactor]) => ({
    naturalFrequencyHz,
    qualityFactor,
  }));
  const state = createBroadbandAudioState({
    configuration,
    shells,
    cavityAcousticScale: { incidentPeakPressurePascalAtFullScale: 0 },
  });
  const blocks = name === "high-q-ringdown" ? 16 : 1;
  for (let sequence = 0; sequence < blocks; sequence++) {
    const channels = [1, -0.3].map((gain) =>
      Float64Array.from({ length: 512 }, (_, n) =>
        sequence >= 8
          ? 0
          : gain *
            (0.2 *
              Math.sin(
                (2 * Math.PI * 375 * (sequence * 512 + n)) / sampleRate,
              ) +
              0.1 * Math.cos(1.71 * n) +
              0.03 * (-1) ** n +
              (n === 73 ? 0.2 : 0)),
      ),
    );
    assert(
      state.accept({
        ...configuration,
        sequence,
        startSample: 512 * sequence,
        frameCount: 512,
        channels,
      }).accepted,
    );
  }
  cases.push({ name, frame: state.read().response.spectral });
}
const stereoWindow = cases.find((c) => c.name === "stereo-linear").frame;
for (const [name, gain] of [
  ["quiet-response", 1e-7],
  ["zero-response", 0],
])
  cases.push({
    name,
    frame: {
      ...stereoWindow,
      inputSpectrum: stereoWindow.inputSpectrum.map((value) => value * gain),
      boundaryDelta: stereoWindow.boundaryDelta.map((value) => value * gain),
    },
  });
const references = cases.map((c) =>
  referenceSpectralMatrices(
    c.frame.representation ? expandBroadbandSpectralWindow(c.frame) : c.frame,
  ),
);
const server = await createServer({
  root: path.join(root, "apps/web"),
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  });
  report.browser = await browser.version();
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto(server.resolvedUrls.local[0]);
  const actual = await page.evaluate(
    async (fixtures) => {
      const { runBroadbandSpectralGpuProbe } =
        await import("/@fs/Users/light/Projects/baryon/packages/engine/src/testing/broadbandSpectralGpuProbe.js");
      return runBroadbandSpectralGpuProbe(fixtures);
    },
    cases.map((c, i) => ({
      ...c,
      expectedCoefficients: c.frame.representation
        ? Array.from(references[i].coefficients)
        : undefined,
      frame: Object.fromEntries(
        Object.entries(c.frame).map(([key, value]) => [
          key,
          ArrayBuffer.isView(value) ? Array.from(value) : value,
        ]),
      ),
    })),
  );
  assert.equal(actual.backend, "native-WebGPU");
  assert.equal(actual.results.length, cases.length);
  await writeFile(
    path.join(output, "spectral-projection-values.json"),
    JSON.stringify(actual),
  );
  for (let n = 0; n < actual.results.length; n++) {
    const result = actual.results[n],
      reference = references[n];
    assert.equal(result.name, cases[n].name);
    const errors = {};
    for (const key of ["pressure", "velocity"]) {
      assert.equal(result[key].length, 5 * cases[n].frame.shellCount ** 2);
      let error = 0,
        energy = 0;
      for (let i = 0; i < result[key].length; i++) {
        error += (result[key][i] - reference[key][i]) ** 2;
        energy += reference[key][i] ** 2;
      }
      const absoluteRms = Math.sqrt(error / result[key].length);
      const referenceRms = Math.sqrt(energy / result[key].length);
      errors[key] = {
        absoluteRms,
        referenceRms,
        relativeRms: referenceRms ? absoluteRms / referenceRms : null,
        firstValues: result[key].slice(0, 8),
        firstReferenceValues: Array.from(reference[key].slice(0, 8)),
      };
    }
    report.results.push({
      name: result.name,
      errors,
      spectralErrors: result.spectralErrors,
      initializationMs: result.initializationMs,
      precisionBinCount: result.precisionBinCount,
      correctionUploadBytes: result.correctionUploadBytes,
      warmup: result.warmup,
      submissionMs: summarize(result.submissionMs),
      gpuMs: summarize(result.gpuMs),
      submissionToCompletionMs: summarize(result.submissionToCompletionMs),
      expandedReferenceSha256: createHash("sha256")
        .update(new Uint8Array(references[n].coefficients.buffer))
        .digest("hex"),
      spectralPayloadSha256: [
        "transitions",
        "inputSpectrum",
        "boundaryDelta",
        "coefficients",
      ]
        .filter((key) => cases[n].frame[key])
        .reduce(
          (hash, key) =>
            hash.update(new Uint8Array(cases[n].frame[key].buffer)),
          createHash("sha256"),
        )
        .digest("hex"),
    });
    for (const [quantity, evidence] of Object.entries(errors)) {
      assert(
        evidence.absoluteRms <= 1e-6 + 1e-4 * evidence.referenceRms,
        `${result.name}: ${quantity} projection mismatch`,
      );
      if (evidence.referenceRms > 0)
        assert(
          evidence.relativeRms < 1e-4,
          `${result.name}: quiet ${quantity} relative error`,
        );
    }
    for (const evidence of result.spectralErrors) {
      assert(
        evidence.absoluteRms <= 1e-6 + 1e-4 * evidence.referenceRms,
        `${result.name}: spectral row ${evidence.row} absolute error`,
      );
      if (evidence.referenceRms > 0)
        assert(
          evidence.relativeRms < 1e-4,
          `${result.name}: spectral row ${evidence.row} relative error ${evidence.relativeRms}`,
        );
    }
  }
  assert.deepEqual(browserErrors, []);
  report.lanes.numerical = "passed";
  report.passed = report.lanes.defaultAtlasCpu === "passed";
  if (!report.passed) {
    report.failure =
      "Default-atlas CPU p95 exceeds the provisional 4 ms per 512 samples gate.";
    process.exitCode = 1;
  }
} catch (error) {
  if (error?.code === "ERR_ASSERTION") report.lanes.numerical = "failed";
  report.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(
    path.join(output, "broadband-spectrum-report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser?.close();
  await server.close();
  console.log(JSON.stringify(report, null, 2));
}
