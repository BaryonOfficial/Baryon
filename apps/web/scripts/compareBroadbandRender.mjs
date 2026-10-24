import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Compare measured lanes, not overall product readiness. The render verifier's
// success means integration passed; timing has its own explicit gates here.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const boundaryMode = process.argv.includes("--dirichlet")
  ? "dirichlet"
  : "neumann";
const boundarySuffix = boundaryMode === "dirichlet" ? "-dirichlet" : "";
const asynchronous = process.argv.includes("--async");
const schedulingSuffix = asynchronous ? "-async" : "";
const music = process.argv.includes("--music");
const fixtureArgument = process.argv.indexOf("--fixture");
const fixtureId =
  fixtureArgument < 0 ? null : process.argv[fixtureArgument + 1];
assert(
  !fixtureId || (music && /^[A-Za-z0-9-]+$/.test(fixtureId)),
  "invalid music fixture",
);
const musicSuffix = music ? `-music${fixtureId ? `-${fixtureId}` : ""}` : "";
const musicManifest = music
  ? JSON.parse(
      await readFile(
        path.join(root, "docs/internal/reference/broadband-music-corpus.json"),
        "utf8",
      ),
    )
  : null;
const musicNames = music
  ? [
      ...musicManifest.tracks.map((track) => track.id),
      "transition-edm-trance",
      "transition-dance-cipher",
    ]
  : [];
assert(!fixtureId || musicNames.includes(fixtureId), "unknown music fixture");
const directory = path.resolve(process.argv[2]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const comparison = {
  scope: music
    ? "Stereo nonlinear music timing at the measured atlas; the selected corpus scope is explicit"
    : "Four mono/stereo and linear/nonlinear configurations at the measured atlas and sample rate",
  music,
  fixtureSelection: fixtureId,
  scheduling: asynchronous ? "animation-frame-single-flight" : "synchronized",
  latencyReference: "observer-consumed-source-v1",
  boundaryMode,
  createdAt: new Date().toISOString(),
  comparisonScriptSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  limits: {
    gpuP95BaselineRatio: asynchronous ? null : 1.2,
    workerP95Ms: 4,
    completionAgeP95SecondsBeyondPreparation: 0.033,
  },
  exclusions: [
    "total CPU utilization and capture callback deadline",
    "all supported apparatus, boundary and sample-rate configurations",
    ...(!asynchronous ? ["asynchronous rendering"] : ["GPU elapsed timing"]),
    "app-shell scheduling and integration",
    "physical display and audible-onset timing",
    music
      ? "musical-response acceptance, soak and native stage outputs"
      : "real-mix corpus, soak and native stage outputs",
    ...(fixtureId ? ["remaining corpus fixtures"] : []),
    "production integration",
  ],
  results: [],
  passed: false,
};
try {
  for (const suffix of music
    ? ["-stereo-nonlinear"]
    : ["", "-stereo", "-nonlinear", "-stereo-nonlinear"]) {
    const reports = await Promise.all(
      ["current-modal-render-spectral", "broadband-render-cosine-spectral"].map(
        async (prefix) => {
          const filename = `${prefix}${suffix}${boundarySuffix}${schedulingSuffix}${musicSuffix}-report.json`;
          const bytes = await readFile(path.join(directory, filename));
          return { filename, sha256: hash(bytes), data: JSON.parse(bytes) };
        },
      ),
    );
    const [baseline, candidate] = reports.map((r) => r.data);
    assert(baseline.passed && candidate.passed, "integration lane failed");
    for (const key of [
      "boundaryMode",
      "revision",
      "sourceHashes",
      "machine",
      "browser",
      "sampleRate",
      "frameCount",
      "tailFrames",
      "channelCount",
      "nonlinear",
      "cavityAcousticScale",
      "familyCount",
      "shellCount",
      "spectral",
      "corpus",
      "scheduling",
      "latencyReference",
    ])
      assert.deepEqual(candidate[key], baseline[key], `unmatched ${key}`);
    for (const [filename, expected] of Object.entries(candidate.sourceHashes))
      assert.equal(
        hash(await readFile(path.join(root, filename))),
        expected,
        `stale measured source: ${filename}`,
      );
    assert.equal(candidate.spectral, true);
    assert.equal(candidate.scheduling, comparison.scheduling);
    assert.equal(candidate.latencyReference, comparison.latencyReference);
    assert.equal(candidate.boundaryMode, boundaryMode);
    assert.equal(candidate.channelCount, suffix.includes("stereo") ? 2 : 1);
    assert.equal(candidate.nonlinear, suffix.includes("nonlinear"));
    assert.deepEqual(
      candidate.results.map((r) => r.name),
      music
        ? fixtureId
          ? [fixtureId]
          : musicNames
        : ["two-tones", "256-tones", "noise", "end-transient"],
    );
    assert.deepEqual(
      baseline.results.map((r) => r.name),
      candidate.results.map((r) => r.name),
    );
    const results = candidate.results.map((r, i) => {
      const before = baseline.results[i];
      assert.equal(r.pcmSha256, before.pcmSha256, "unmatched source samples");
      assert.equal(r.frameCount, before.frameCount);
      assert.deepEqual(r.corpusEntry, before.corpusEntry);
      assert.deepEqual(r.dimensions, before.dimensions);
      for (const metric of [
        ...(!asynchronous ? [before.gpuMs, r.gpuMs] : []),
        r.workerCpuMs,
        r.completionAgeSeconds,
        r.rendererSubmitCpuMs,
        r.responseAgeSeconds,
        r.submissionAgeSeconds,
        before.submissionAgeSeconds,
      ]) {
        assert(
          metric.count > 0 && Number.isFinite(metric.p95) && metric.p95 >= 0,
          "missing or invalid timing evidence",
        );
      }
      if (!asynchronous) assert(before.gpuMs.p95 > 0);
      else {
        assert.equal(r.gpuMs.count, 0);
        assert.equal(before.gpuMs.count, 0);
      }
      const ratio = asynchronous ? null : r.gpuMs.p95 / before.gpuMs.p95;
      const completeCompletionEvidence = r.completionCoverage.fraction === 1;
      return {
        name: r.name,
        baselineGpuP95Ms: before.gpuMs.p95,
        candidateGpuP95Ms: r.gpuMs.p95,
        gpuRatio: ratio,
        gpuPassed: asynchronous
          ? null
          : ratio <= comparison.limits.gpuP95BaselineRatio,
        workerP95Ms: r.workerCpuMs.p95,
        workerPassed: r.workerCpuMs.p95 <= comparison.limits.workerP95Ms,
        rendererSubmitP95Ms: r.rendererSubmitCpuMs.p95,
        preparationDelayFrames: r.preparationDelayFrames,
        completionAgeP95Seconds: r.completionAgeSeconds.p95,
        completionAgePassed: completeCompletionEvidence
          ? r.completionAgeSeconds.p95 <=
            comparison.limits.completionAgeP95SecondsBeyondPreparation
          : null,
        completionCoverage: r.completionCoverage,
        baselineCompletionCoverage: before.completionCoverage,
        candidateSubmissionAgeP95Seconds: r.submissionAgeSeconds.p95,
        baselineSubmissionAgeP95Seconds: before.submissionAgeSeconds.p95,
        candidateObservationGapSeconds: r.observationGapSeconds,
        baselineObservationGapSeconds: before.observationGapSeconds,
        candidateRenderCount: r.renderRecords.length,
        baselineRenderCount: before.renderRecords.length,
        candidateSubmissionSpanSeconds: r.submissionSpanSeconds,
        baselineSubmissionSpanSeconds: before.submissionSpanSeconds,
        responseAgeP95Seconds: r.responseAgeSeconds.p95,
        snapshotCaptureMs:
          r.visualSnapshots?.map((snapshot) => snapshot.captureMs) ?? [],
      };
    });
    comparison.results.push({
      channelCount: candidate.channelCount,
      nonlinear: candidate.nonlinear,
      sampleRate: candidate.sampleRate,
      familyCount: candidate.familyCount,
      shellCount: candidate.shellCount,
      reports: reports.map(({ filename, sha256 }) => ({ filename, sha256 })),
      results,
    });
  }
  comparison.passed = comparison.results.every((configuration) =>
    configuration.results.every(
      (r) =>
        (asynchronous || r.gpuPassed) &&
        r.workerPassed &&
        r.completionAgePassed === true,
    ),
  );
} catch (error) {
  comparison.failure = error instanceof Error ? error.message : String(error);
} finally {
  const filename = path.join(
    directory,
    `render-resource-comparison${boundarySuffix}${schedulingSuffix}${musicSuffix}.json`,
  );
  await writeFile(filename, JSON.stringify(comparison, null, 2));
  console.log(JSON.stringify(comparison, null, 2));
  if (!comparison.passed) process.exitCode = 1;
}
