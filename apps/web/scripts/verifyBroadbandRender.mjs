import { prepareHistoricalEngine } from "../../../scripts/lib/historical-engine.mjs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import sharp from "sharp";
import { buildModalExcitationAtlas } from "../../../packages/engine/src/utils/audio/modalExcitationAtlas.js";
import { createBroadbandAudioState } from "../../../packages/engine/src/utils/audio/broadbandAudioState.js";
import { iterateAudioPcmBlocks } from "../../../packages/engine/src/core/audio/audioPcmStream.js";

import { CAVITY_ACOUSTIC_DEFAULTS } from "../../../packages/engine/src/defaults.js";
import { CYMATIC_OBSERVER_REFERENCE } from "../../../packages/engine/src/core/raymarch/cymaticObserverReference.js";
import {
  BROADBAND_MUSIC_CONTROL_NAMES,
  BROADBAND_MUSIC_CONTROL_REFERENCE,
  createBroadbandMusicControl,
} from "../../../packages/engine/src/testing/broadbandMusicControls.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const baseline = process.argv.includes("--baseline");
const asynchronous = process.argv.includes("--async");
assert(
  !process.argv.includes("--cosine") && !process.argv.includes("--reflection"),
  "field selection was retired: candidate rendering always uses the cosine field",
);
const spectral = process.argv.includes("--spectral");
const boundaryMode = process.argv.includes("--dirichlet")
  ? "dirichlet"
  : "neumann";
const channelCount = process.argv.includes("--stereo") ? 2 : 1;
const nonlinear = process.argv.includes("--nonlinear");
const coverageControls = process.argv.includes("--coverage-controls");
assert(
  !coverageControls || !asynchronous,
  "controlled image response uses the synchronized lane",
);
const rateArgument = process.argv.indexOf("--sample-rate");
const sampleRate =
  rateArgument < 0 ? 48000 : Number(process.argv[rateArgument + 1]);
assert(
  [44100, 48000].includes(sampleRate),
  "render qualification supports --sample-rate 44100 or 48000",
);
const coveragePolicyPath =
  "docs/internal/reference/broadband-musical-response-acceptance.json";
const coveragePolicy = coverageControls
  ? JSON.parse(await readFile(path.join(root, coveragePolicyPath), "utf8"))
  : null;
if (coveragePolicy) {
  assert.equal(
    channelCount,
    coveragePolicy.configuration.channelCount,
    "coverage policy requires stereo",
  );
  assert(coveragePolicy.configuration.sampleRates.includes(sampleRate));
  assert(coveragePolicy.configuration.boundaryModes.includes(boundaryMode));
}
const cavityAcousticScale = {
  ...CAVITY_ACOUSTIC_DEFAULTS,
  ...(!nonlinear ? { incidentPeakPressurePascalAtFullScale: 0 } : {}),
};
const baseReportName = baseline
  ? `current-modal-render${spectral ? "-spectral" : ""}`
  : `broadband-render-cosine${spectral ? "-spectral" : ""}`;
const reportName = `${baseReportName}${channelCount === 2 ? "-stereo" : ""}${nonlinear ? "-nonlinear" : ""}${boundaryMode === "dirichlet" ? "-dirichlet" : ""}${asynchronous ? "-async" : ""}${coverageControls ? "-coverage" : ""}${sampleRate !== 48000 ? `-${sampleRate}hz` : ""}`;
const output = path.resolve(
  process.argv[2] ?? "/tmp/baryon-broadband-implementation",
);
const frameCount = coverageControls
  ? BROADBAND_MUSIC_CONTROL_REFERENCE.durationSeconds * sampleRate + 13
  : Math.round(3 * sampleRate) + 13;
const corpusArgument = process.argv.indexOf("--corpus");
const corpusDirectory =
  corpusArgument < 0 ? null : path.resolve(process.argv[corpusArgument + 1]);
assert(
  !coverageControls || !corpusDirectory,
  "controlled signals and music corpus are separate qualification lanes",
);
const fixtureArgument = process.argv.indexOf("--fixture");
const fixtureId =
  fixtureArgument < 0 ? null : process.argv[fixtureArgument + 1];
assert(!fixtureId || /^[A-Za-z0-9-]+$/.test(fixtureId), "invalid fixture id");
assert(!fixtureId || corpusDirectory, "--fixture requires --corpus");
const corpusBytes = corpusDirectory
  ? await readFile(path.join(corpusDirectory, "prepared-corpus.json"))
  : null;
const corpus = corpusBytes ? JSON.parse(corpusBytes) : null;
if (corpus) {
  assert.equal(
    corpus.entries.length,
    14,
    "expected twelve excerpts and two transitions",
  );
  assert.equal(
    new Set(corpus.entries.map((entry) => entry.id)).size,
    14,
    "duplicate corpus identities",
  );
  assert(
    corpus.entries.every(
      (entry) =>
        /^[A-Za-z0-9-]+$/.test(entry.id) &&
        Number.isSafeInteger(entry.frameCount) &&
        entry.frameCount > 0,
    ),
    "invalid corpus entry",
  );
  assert.equal(channelCount, 2, "music corpus requires --stereo");
  assert.equal(corpus.sampleRate, sampleRate);
  assert.equal(corpus.channelCount, channelCount);
  assert.equal(
    corpus.manifestSha256,
    createHash("sha256")
      .update(
        await readFile(
          path.join(
            root,
            "docs/internal/reference/broadband-music-corpus.json",
          ),
        ),
      )
      .digest("hex"),
    "stale corpus source manifest",
  );
  assert.equal(
    corpus.builderSha256,
    createHash("sha256")
      .update(
        await readFile(
          path.join(root, "packages/engine/scripts/prepareBroadbandMusic.mjs"),
        ),
      )
      .digest("hex"),
    "stale corpus builder",
  );
  assert(
    !fixtureId || corpus.entries.some((entry) => entry.id === fixtureId),
    "unknown corpus fixture",
  );
}
const measuredReportName = `${reportName}${corpus ? `-music${fixtureId ? `-${fixtureId}` : ""}` : ""}`;
// Enough clocked zeros to expose the complete finite nonlinear frame tail.
// Modal/DC decay continues beyond this finite measurement horizon.
const tailFrames = 4096;
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
const configuration = {
  sourceGeneration: 1,
  timelineRevision: 0,
  processingRevision: 0,
  channelCount,
  sampleRate,
  startSample: 0,
};
const summarize = (values) => {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    count: ordered.length,
    p50: ordered[Math.floor(ordered.length / 2)] ?? null,
    p95:
      ordered[
        Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)
      ] ?? null,
    maximum: ordered.at(-1) ?? null,
  };
};
const sourcePaths = [
  "scripts/lib/historical-engine.mjs",
  "pnpm-lock.yaml",
  "apps/web/scripts/verifyBroadbandRender.mjs",
  "packages/engine/src/testing/broadbandRenderProbe.js",
  "packages/engine/src/testing/broadbandMusicControls.js",
  ...(coverageControls ? [coveragePolicyPath] : []),
  "packages/engine/src/core/raymarch/cymaticGeometryObservation.js",
  "packages/engine/src/testing/currentModalRenderProbe.js",
  "packages/engine/src/testing/gpuProbeTiming.js",
  "packages/engine/src/testing/renderedObservationTiming.js",
  "packages/engine/src/render/gpuSubmissionGate.js",
  "packages/engine/src/render/observationHistory.js",
  "packages/engine/src/core/raymarch/broadbandMomentField.js",
  "packages/engine/src/core/raymarch/broadbandApertureBasis.js",
  "packages/engine/src/core/raymarch/fieldCachePositiveOctantGeometry.js",
  "packages/engine/src/core/raymarch/broadbandCosineProjection.js",
  "packages/engine/src/testing/broadbandCaptureProbe.worker.js",
  "packages/engine/src/core/audio/audioPcmCapture.js",
  "packages/engine/src/core/audio/audioPcmCapture.worklet.js",
  "packages/engine/src/core/audio/audioPcmStream.js",
  "packages/engine/src/utils/audio/broadbandAudioState.js",
  "packages/engine/src/utils/audio/streamingAcousticDrive.js",
  "packages/engine/src/utils/audio/waterAcousticNonlinearity.js",
  "packages/engine/src/core/audio/fft.js",
  "packages/engine/src/core/audio/fftSpectrum.js",
  "packages/engine/src/utils/audio/broadbandModalResponse.js",
  "packages/engine/src/utils/audio/broadbandResponseSpectrum.js",
  "packages/engine/src/core/raymarch/broadbandSpectralExpansion.js",
  "packages/engine/src/core/raymarch/broadbandSpectralProjection.js",
  "packages/engine/src/core/raymarch/fixedOrientationTextureNode.js",
  "packages/engine/src/utils/audio/spectralPhase.js",
  "packages/engine/src/utils/audio/modalResponseMoments.js",
  "packages/engine/src/core/raymarch/fieldCacheBake.js",
  "packages/engine/src/core/raymarch/fieldCacheSampling.js",
  "packages/engine/src/core/raymarch/fieldCacheGeometry.js",
  "packages/engine/src/core/raymarch/fieldCacheDomainGeometry.js",
  "packages/engine/src/core/raymarch/cymaticObserverNode.js",
  "packages/engine/src/core/raymarch/cymaticObserverReference.js",
  "packages/engine/src/core/modeFamily.js",
  "packages/engine/src/core/modeFamilyNode.js",
  "packages/engine/src/utils/audio/modalExcitationAtlas.js",
  "packages/engine/src/core/modalSourceCoupling.js",
  "packages/engine/src/core/raymarch/material.js",
  "packages/engine/src/defaults.js",
  "packages/engine/src/core/audio/analyserSampler.js",
  "packages/engine/src/core/raymarchSetup.js",
  "packages/engine/src/core/raymarch/runtime.js",
  "packages/engine/src/utils/audio/audioFeatureEngine.js",
  "packages/engine/src/utils/audio/audioFeatureEngine.worker.js",
  "packages/engine/src/utils/audio/audioFeaturePacketCodec.js",
  ...(corpus
    ? [
        "packages/engine/scripts/prepareBroadbandMusic.mjs",
        "docs/internal/reference/broadband-music-corpus.json",
      ]
    : []),
];
const report = {
  coverageControls: coverageControls ? BROADBAND_MUSIC_CONTROL_REFERENCE : null,
  coveragePolicy,
  scheduling: asynchronous ? "animation-frame-single-flight" : "synchronized",
  latencyReference: "observer-consumed-source-v1",
  boundaryMode,
  reflectionReuse: !baseline,
  spectral,
  cosine: !baseline,
  implementation: baseline
    ? "historical production owners at pinned revision"
    : "broadband candidate",
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceHashScope:
    "Current comparison checkout snapshot, including files not necessarily executed in this branch. Historical runtime execution is separately pinned by historicalEngine.revision and archiveSha256.",
  sourceHashes: Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (p) => [
        p,
        createHash("sha256")
          .update(await readFile(path.join(root, p)))
          .digest("hex"),
      ]),
    ),
  ),
  machine: {
    cpu: cpus()[0]?.model,
    platform: platform(),
    architecture: arch(),
  },
  sampleRate,
  frameCount: corpus ? null : frameCount,
  corpus: corpus
    ? {
        sha256: createHash("sha256").update(corpusBytes).digest("hex"),
        commonGain: corpus.commonGain,
        fixtureSelection: fixtureId,
        inputFormat: corpus.sampleFormat,
      }
    : null,
  tailFrames,
  channelCount,
  nonlinear,
  cavityAcousticScale,
  familyCount: families.length,
  shellCount: shells.length,
  numericalScope: baseline
    ? "Pinned historical production pipeline; no claim of correct polyphonic physics."
    : "Live-capture final state versus identical offline candidate integration. Independent solver and GPU-field evidence are separate reports.",
  imageScope:
    corpus && !asynchronous
      ? "Timed PNG readbacks are diagnostic work outside the submitted render timing; their capture costs are recorded separately and can affect subsequent scheduling. Image code values are not acoustic energy or calibrated radiance."
      : "Final frame only.",
  exclusions: [
    ...(!spectral ? ["spectral color"] : []),
    ...(!nonlinear ? ["active nonlinearity"] : []),
    ...(channelCount === 1 ? ["stereo"] : []),
    "bloom",
    "native stage outputs",
    ...(!asynchronous ? ["asynchronous rendering"] : ["GPU elapsed timing"]),
    "app-shell scheduling and integration",
    "physical display and audible-onset measurement",
    "soak qualification",
  ],
  results: [],
  passed: false,
};
await mkdir(output, { recursive: true });
const historicalEngine = prepareHistoricalEngine(root);
report.historicalEngine = historicalEngine.provenance;
const server = await createServer({
  plugins: [historicalEngine.plugin],
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
});
server.middlewares.use((request, response, next) => {
  if (request.url === "/__corpus_pcm" && currentCorpusPcm) {
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(currentCorpusPcm);
    return;
  }
  if (request.url !== "/") return next();
  response.setHeader("Content-Type", "text/html");
  response.end("<!doctype html><title>Baryon broadband render probe</title>");
});
let currentCorpusPcm = null;
async function saveImage(image, suffix) {
  const png = Buffer.from(image.split(",")[1], "base64");
  const imagePath = path.join(output, `${measuredReportName}-${suffix}.png`);
  await writeFile(imagePath, png);
  const pixels = await sharp(png).removeAlpha().raw().toBuffer();
  let nonzeroPixels = 0,
    maximum = 0,
    sum = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    const value = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (value > 2) nonzeroPixels++;
    maximum = Math.max(maximum, value);
    sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
  }
  return {
    imagePath,
    image: { nonzeroPixels, maximum, meanRgbCodeValue: sum / pixels.length },
  };
}
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    args: [
      "--enable-unsafe-webgpu",
      "--autoplay-policy=no-user-gesture-required",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  });
  report.browser = browser.version();
  const names = corpus
    ? corpus.entries
        .filter((entry) => !fixtureId || entry.id === fixtureId)
        .map((entry) => entry.id)
    : coverageControls
      ? BROADBAND_MUSIC_CONTROL_NAMES
      : ["two-tones", "256-tones", "noise", "end-transient"];
  for (const name of names) {
    const corpusEntry = corpus?.entries.find((entry) => entry.id === name);
    let channels;
    if (corpusEntry) {
      const pcmPath = path.resolve(corpusDirectory, corpusEntry.relativePath);
      assert(
        pcmPath.startsWith(corpusDirectory + path.sep),
        "PCM escapes corpus directory",
      );
      currentCorpusPcm = await readFile(pcmPath);
      assert.equal(
        createHash("sha256").update(currentCorpusPcm).digest("hex"),
        corpusEntry.pcmSha256,
      );
      assert.equal(corpusEntry.sampleRate, sampleRate);
      assert.equal(corpusEntry.channelCount, channelCount);
      assert.equal(
        currentCorpusPcm.length,
        corpusEntry.frameCount * channelCount * 4,
      );
      channels = Array.from({ length: channelCount }, (_, channel) =>
        Float32Array.from({ length: corpusEntry.frameCount }, (_, n) =>
          currentCorpusPcm.readFloatLE(4 * (n * channelCount + channel)),
        ),
      );
    } else if (coverageControls)
      channels = createBroadbandMusicControl(name, sampleRate, channelCount);
    else
      channels = Array.from({ length: channelCount }, (_, channel) => {
        let seed = 72135 + channel * 3871;
        return Float32Array.from({ length: frameCount }, (_, n) => {
          if (name === "end-transient" && n === frameCount - 1)
            return channel ? -0.7 : 0.8;
          const silenceFrames = Math.round(sampleRate / 4);
          if (n < silenceFrames || n >= frameCount - silenceFrames) return 0;
          if (name === "noise") {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return 0.3 * (seed / 2 ** 32 - 0.5);
          }
          let value = 0;
          const tones = name === "256-tones" ? 256 : 2;
          for (let t = 0; t < tones; t++)
            value +=
              (0.2 / Math.sqrt(tones)) *
              Math.cos(
                (2 * Math.PI * (119 + t * 67.31 + channel * 37.7) * n) /
                  sampleRate +
                  t * 0.731 +
                  channel * 0.41,
              );
          return value;
        });
      });
    const sourceFrameCount = channels[0].length;
    const captureFrames = sourceFrameCount + tailFrames;
    const snapshotTimes =
      coverageControls && !asynchronous
        ? coveragePolicy.snapshotTimesSeconds
        : corpus && !asynchronous
          ? [0.5, 5, 15, 30, 45, 59].filter(
              (time) => time < sourceFrameCount / sampleRate,
            )
          : [];
    let expected;
    if (!baseline) {
      const offline = createBroadbandAudioState({
        configuration,
        shells,
        cavityAcousticScale,
      });
      for (const block of iterateAudioPcmBlocks(channels, configuration))
        assert(offline.accept(block).accepted);
      const cursor = offline.read();
      assert(
        offline.end({
          ...configuration,
          startSample: cursor.nextSample,
          nextSequence: cursor.nextSequence,
        }).accepted,
      );
      const zeros = channels.map(() => new Float32Array(tailFrames));
      for (const block of iterateAudioPcmBlocks(zeros, {
        ...configuration,
        startSample: cursor.nextSample,
        nextSequence: cursor.nextSequence,
      }))
        assert(offline.accept({ ...block, postSourceSilence: true }).accepted);
      offline.pause();
      expected = offline.read();
    }
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    try {
      await page.goto(server.resolvedUrls.local[0]);
      const result = await page.evaluate(
        async (fixture) => {
          if (fixture.audioUrl) {
            const response = await fetch(fixture.audioUrl);
            if (!response.ok) throw new Error("corpus PCM fetch failed");
            const bytes = await response.arrayBuffer();
            const view = new DataView(bytes);
            if (
              bytes.byteLength !==
              fixture.sourceFrameCount * fixture.channelCount * 4
            )
              throw new Error("corpus PCM length mismatch");
            fixture.channels = Array.from(
              { length: fixture.channelCount },
              (_, a) =>
                Float32Array.from(
                  { length: fixture.sourceFrameCount },
                  (_, n) =>
                    view.getFloat32(4 * (n * fixture.channelCount + a), true),
                ),
            );
          }
          if (fixture.baseline) {
            const { runCurrentModalRenderProbe } =
              await import("/packages/engine/src/testing/currentModalRenderProbe.js");
            return runCurrentModalRenderProbe(fixture);
          }
          const { runBroadbandRenderProbe } =
            await import("/packages/engine/src/testing/broadbandRenderProbe.js");
          return runBroadbandRenderProbe(fixture);
        },
        {
          families,
          shells,
          boundaryMode,
          channels: corpus
            ? null
            : channels.map((samples) => Array.from(samples)),
          audioUrl: corpus ? "/__corpus_pcm" : null,
          channelCount,
          sourceFrameCount,
          snapshotTimes,
          measureWeakResponse: coverageControls && baseline,
          cavityAcousticScale,
          tailFrames,
          sampleRate,
          baseline,
          spectral,
          asynchronous,
        },
      );
      const {
        image,
        finalObservation,
        snapshots = [],
        ...measurements
      } = result;
      const finalImage = await saveImage(image, name);
      const visualSnapshots = [];
      for (const { image: snapshotImage, ...metadata } of snapshots)
        visualSnapshots.push({
          ...metadata,
          ...(await saveImage(
            snapshotImage,
            `${name}-at-${metadata.requestedTimeSeconds}`,
          )),
        });
      const differences = {};
      for (const key of baseline
        ? []
        : ["pressure", "velocity", "pressureMoments", "velocityMoments"]) {
        const actual = result.finalObservation.response[key];
        assert.equal(actual.length, expected.response[key].length);
        differences[key] = Math.max(
          ...actual.map((v, i) => Math.abs(v - expected.response[key][i])),
        );
      }
      if (!baseline) {
        for (const key of ["inputSpectrum", "boundaryDelta"]) {
          const actual = finalObservation.response.spectral[key];
          assert.equal(actual.length, expected.response.spectral[key].length);
          differences[key] = Math.max(
            ...actual.map((v, i) =>
              Math.abs(v - expected.response.spectral[key][i]),
            ),
          );
        }
      }
      assert.equal(result.asynchronous, asynchronous);
      assert(result.renderRecords.length > 0, "no measured render submissions");
      let representedTime = null;
      for (const record of result.renderRecords) {
        const previousTime = representedTime ?? 0;
        if (record.observationUpdates) {
          for (const update of record.observationUpdates)
            if (update.baked) representedTime = update.sample / sampleRate;
        } else if (record.observerBaked)
          representedTime = record.sourceTimeSeconds;
        assert.notEqual(representedTime, null, "unseeded measured observer");
        assert.equal(record.renderedSourceTimeSeconds, representedTime);
        assert.equal(
          record.renderedAvailabilityTimeSeconds,
          representedTime + (result.preparationDelayFrames ?? 0) / sampleRate,
        );
        assert.equal(
          record.observationGapSeconds,
          representedTime - previousTime,
        );
        assert(record.sourceTimeSeconds >= representedTime);
      }
      if (!baseline) {
        const observations = result.renderRecords.flatMap(
          (record) => record.observationUpdates,
        );
        const bakedCount = observations.filter(
          (observation) => observation.baked,
        ).length;
        assert.equal(result.observationHistory.queued, 0);
        assert.equal(result.observationHistory.fault, null);
        assert.equal(result.observationHistory.accepted, observations.length);
        assert.equal(result.observationHistory.consumed, observations.length);
        assert(
          observations.every(
            (value, i) => i === 0 || value.sample > observations[i - 1].sample,
          ),
        );
        assert(
          result.renderRecords.every(
            (record) =>
              record.observationUpdates.filter((value) => value.baked).length <=
              2,
          ),
        );
        assert(bakedCount > 0, "no measured observer updates");
        assert.equal(
          result.sourceProjectionCount,
          bakedCount,
          "derived source preparation must run once per accepted observer bake",
        );
      }
      const completionRecords = result.renderRecords.filter(
        (r) => !asynchronous || r.completionSampling === "submission-fence",
      );
      if (asynchronous) {
        assert.equal(result.completionSampling.drained, true);
        assert.equal(result.completionSampling.pending, false);
        assert.equal(
          result.completionSampling.submitted,
          result.renderRecords.length,
        );
        assert.equal(
          result.completionSampling.sampled,
          completionRecords.length +
            result.completionSampling.terminalDrainSamples,
        );
        assert(result.renderRecords.every((r) => r.gpuMs === null));
      }
      report.results.push({
        name,
        ...(coverageControls
          ? {
              inputMeasurements: channels.map((samples) => {
                const active = samples.subarray(
                  BROADBAND_MUSIC_CONTROL_REFERENCE.onsetSeconds * sampleRate,
                  BROADBAND_MUSIC_CONTROL_REFERENCE.offsetSeconds * sampleRate,
                );
                return {
                  activeRms: Math.sqrt(
                    active.reduce((s, x) => s + x * x, 0) / active.length,
                  ),
                  peak: active.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
                };
              }),
            }
          : {}),
        frameCount: sourceFrameCount,
        corpusEntry: corpusEntry ?? null,
        pcmSha256: createHash("sha256")
          .update(
            Buffer.concat(
              channels.map((samples) => Buffer.from(samples.buffer)),
            ),
          )
          .digest("hex"),
        ...measurements,
        finalProcessedFrames: finalObservation?.processedFrames,
        finalPreparedFrames: finalObservation?.response.sampleIndex,
        finalSpectralSample: finalObservation?.response.spectral.frameEndSample,
        maximumStateDifferences: differences,
        ...finalImage,
        visualSnapshots,
        workerCpuMs: result.workerMs ? summarize(result.workerMs) : null,
        gpuMs: summarize(result.renderRecords.map((r) => r.gpuMs)),
        completionAgeSeconds: summarize(
          completionRecords.map((r) => r.completionAgeSeconds),
        ),
        completionCoverage: {
          measured: completionRecords.length,
          submitted: result.renderRecords.length,
          fraction: completionRecords.length / result.renderRecords.length,
          scope: asynchronous
            ? "Queue-fence samples issued at submission; terminal drain excluded. Missing samples cannot establish full-run completion percentiles."
            : "Every synchronized frame.",
          sampledSubmissionGapsMs: summarize(
            completionRecords
              .slice(1)
              .map(
                (r, i) => r.submittedAtMs - completionRecords[i].submittedAtMs,
              ),
          ),
        },
        responseAgeSeconds: baseline
          ? null
          : summarize(completionRecords.map((r) => r.responseAgeSeconds)),
        submissionAgeSeconds: summarize(
          result.renderRecords.map((r) => r.submissionAgeSeconds),
        ),
        observationGapSeconds: summarize(
          result.renderRecords.map((r) => r.observationGapSeconds),
        ),
        publicationGapSeconds: summarize(
          result.renderRecords.map((r) => r.publicationGapSeconds),
        ),
        heldObservationAgeSeconds: summarize(
          result.renderRecords.map(
            (r) => r.sourceTimeSeconds - r.renderedSourceTimeSeconds,
          ),
        ),
        queueCompletionMs: summarize(
          completionRecords.map((r) => r.queueCompletionMs),
        ),
        submissionSpanSeconds:
          (result.renderRecords.at(-1).submittedAtMs -
            result.renderRecords[0].submittedAtMs) /
          1000,
        rendererSubmitCpuMs: summarize(
          result.renderRecords.map((r) => r.submitCpuMs),
        ),
        errors,
      });
      if (!baseline) {
        assert.equal(result.pcmAccounting.frames, captureFrames);
        assert.equal(result.pcmAccounting.sourceFrames, sourceFrameCount);
        assert.equal(result.pcmAccounting.postSourceFrames, tailFrames);
        assert.equal(
          result.pcmAccounting.packets,
          result.pcmAccounting.returned,
        );
        assert.equal(result.submittedSample, expected.response.sampleIndex);
        assert.equal(
          result.renderedSample,
          Math.round(representedTime * sampleRate),
        );
        assert(result.renderedSample <= result.submittedSample);
        assert.equal(result.preparationDelayFrames, nonlinear ? 2048 : 0);
        assert.equal(finalObservation.processedFrames, captureFrames);
        assert.equal(finalObservation.sourceEndSample, sourceFrameCount);
        assert.equal(finalObservation.postSourceFrames, tailFrames);
        assert.deepEqual(finalObservation.preparation, expected.preparation);
        assert.equal(
          finalObservation.response.spectral.frameEndSample,
          expected.response.spectral.frameEndSample,
        );
        for (const record of result.renderRecords) {
          assert.equal(
            record.capturedSample,
            record.sample + result.preparationDelayFrames,
          );
          assert.equal(record.sourceTimeSeconds, record.sample / sampleRate);
          assert(
            record.submissionAgeSeconds >= -1 / sampleRate,
            "published prepared response ahead of audio clock",
          );
          if (record.completionAgeSeconds !== null)
            assert(record.completionAgeSeconds >= -1 / sampleRate);
        }
        assert(Object.values(differences).every((v) => v <= 1e-12));
        assert.deepEqual(result.observerBeforeReads, result.observerAfterReads);
        assert.equal(
          result.observerAfterReads.stepIndex,
          Math.floor(
            expected.response.sampleIndex /
              sampleRate /
              CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
          ),
          "observer must end on prepared audio time, not the capture cursor",
        );
      }
      // Coverage controls have a separate frozen event-response detector.
      // Music may end in silence after visible active checkpoints. This smoke
      // gate rejects an entirely dark recording, not legitimate ring-down;
      // it does not qualify musical events or waive the controlled detector.
      if (!coverageControls)
        assert(
          finalImage.image.nonzeroPixels > 0 ||
            (corpus &&
              visualSnapshots.some(
                (snapshot) => snapshot.image.nonzeroPixels > 0,
              )),
          "output is completely dark throughout recorded checkpoints",
        );
      assert.equal(
        visualSnapshots.length,
        snapshotTimes.length,
        "missing timed images",
      );
      assert.equal(errors.length, 0);
      process.stdout.write(`completed ${measuredReportName}: ${name}\n`);
      await writeFile(
        path.join(output, `${measuredReportName}-report.json`),
        JSON.stringify(report, null, 2),
      );
    } finally {
      await page.close();
    }
  }
  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(
    path.join(output, `${measuredReportName}-report.json`),
    JSON.stringify(report, null, 2),
  );
  await browser?.close();
  await server.close();
  historicalEngine.dispose();
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        failure: report.failure,
        results: report.results.map(
          ({
            name,
            finalProcessedFrames,
            maximumStateDifferences,
            workerCpuMs,
            gpuMs,
            completionAgeSeconds,
            image,
          }) => ({
            name,
            finalProcessedFrames,
            maximumStateDifferences,
            workerCpuMs,
            gpuMs,
            completionAgeSeconds,
            image,
          }),
        ),
        report: path.join(output, `${measuredReportName}-report.json`),
      },
      null,
      2,
    ),
  );
}
