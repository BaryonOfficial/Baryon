import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { BROADBAND_MUSIC_CONTROL_NAMES as names } from "../../../packages/engine/src/testing/broadbandMusicControls.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const prefix = path.resolve(process.argv[2] ?? "/tmp/baryon-music-controls-v3");
const output = path.resolve(process.argv[3] ?? prefix + "-comparison.json");
// The historical lane remains a paired Neumann comparison. The complete
// current-instrument lane also qualifies the other supported boundary.
const candidateOnly = process.argv.includes("--candidate-only");
const policyPath = path.join(
  root,
  "docs/internal/reference/broadband-musical-response-acceptance.json",
);
const policyBytes = await readFile(policyPath),
  policy = JSON.parse(policyBytes);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const results = [];
let commonSources = null;
let commonInstrument = null;
const imageCache = new Map();
async function pixels(file) {
  if (!imageCache.has(file)) {
    const { data, info } = await sharp(await readFile(file))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, policy.configuration.imageWidth);
    assert.equal(info.height, policy.configuration.imageHeight);
    assert.equal(info.channels, 3);
    imageCache.set(file, data);
  }
  return imageCache.get(file);
}
async function difference(a, b) {
  const [A, B] = await Promise.all([pixels(a), pixels(b)]);
  assert.equal(A.length, B.length);
  let sum = 0,
    changed = 0,
    absolute = 0;
  for (let i = 0; i < A.length; i += 3) {
    let max = 0;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(A[i + k] - B[i + k]);
      sum += d;
      max = Math.max(max, d);
      absolute += A[i + k];
    }
    if (max > policy.responseDetector.changedPixelMaxChannelByteDifference)
      changed++;
  }
  const meanAbsoluteRgbByteDifference = sum / A.length,
    changedPixelFraction = changed / (A.length / 3);
  return {
    meanAbsoluteRgbByteDifference,
    changedPixelFraction,
    absoluteMeanRgbByteValue: absolute / A.length,
    detected:
      meanAbsoluteRgbByteDifference >=
        policy.responseDetector.meanAbsoluteRgbByteDifferenceMinimum &&
      changedPixelFraction >=
        policy.responseDetector.changedPixelFractionMinimum,
  };
}
for (const engine of candidateOnly ? ["candidate"] : ["baseline", "candidate"])
  for (const boundaryMode of candidateOnly
    ? policy.configuration.boundaryModes
    : ["neumann"])
    for (const sampleRate of policy.configuration.sampleRates)
      for (const nonlinear of policy.configuration.nonlinearSettings) {
        const label = `${engine}-${sampleRate}-${nonlinear ? "nonlinear" : "linear"}`,
          directory = candidateOnly
            ? path.join(
                prefix,
                `${boundaryMode}-${sampleRate}-${nonlinear ? "nonlinear" : "linear"}`,
              )
            : prefix + "-" + label;
        const files = (await readdir(directory)).filter((n) =>
          n.endsWith("-report.json"),
        );
        assert.equal(files.length, 1, label);
        const reportPath = path.join(directory, files[0]),
          bytes = await readFile(reportPath),
          report = JSON.parse(bytes);
        assert.equal(report.passed, true, label + " technical measurement");
        assert.equal(report.sampleRate, sampleRate);
        assert.equal(report.channelCount, 2);
        assert.equal(report.boundaryMode, boundaryMode);
        assert.equal(report.nonlinear, nonlinear);
        if (candidateOnly) {
          const { incidentPeakPressurePascalAtFullScale, ...apparatus } =
            report.cavityAcousticScale;
          assert(
            nonlinear
              ? incidentPeakPressurePascalAtFullScale > 0
              : incidentPeakPressurePascalAtFullScale === 0,
            "preparation setting does not match the measured apparatus",
          );
          const instrument = {
            apparatus,
            experiment: report.apertureExperiment ?? null,
          };
          if (commonInstrument)
            assert.deepEqual(
              instrument,
              commonInstrument,
              "mixed instrument calibrations",
            );
          else commonInstrument = instrument;
        }
        assert.deepEqual(report.coveragePolicy, policy);
        assert.deepEqual(
          report.results.map((r) => r.name),
          names,
        );
        if (commonSources)
          assert.deepEqual(
            report.sourceHashes,
            commonSources,
            "unmatched source snapshot",
          );
        else commonSources = report.sourceHashes;
        const byName = new Map(report.results.map((r) => [r.name, r]));
        const events = [];
        for (const fixture of report.results) {
          assert.equal(
            fixture.visualSnapshots.length,
            policy.snapshotTimesSeconds.length,
          );
          const pre = fixture.visualSnapshots.find(
            (s) => s.requestedTimeSeconds === 0.25,
          );
          const beforeTime =
            pre.contextSourceTimeSeconds ?? pre.sourceTimeSeconds;
          const validPre = typeof beforeTime === "number" && beforeTime < 0.5;
          const base = byName.get("kick-bass");
          const added =
            fixture.name === "kick-bass-hats" ||
            fixture.name === "kick-bass-riser";
          const checkpoints = [];
          for (const actual of fixture.visualSnapshots.filter((s) =>
            [1, 2, 3, 4].includes(s.requestedTimeSeconds),
          )) {
            const reference = added
              ? base.visualSnapshots.find(
                  (s) => s.requestedTimeSeconds === actual.requestedTimeSeconds,
                )
              : pre;
            const equalTimes =
              typeof actual.sourceTimeSeconds === "number" &&
              typeof reference.sourceTimeSeconds === "number" &&
              Math.round(actual.sourceTimeSeconds * sampleRate) ===
                Math.round(reference.sourceTimeSeconds * sampleRate);
            const comparable = added ? equalTimes : validPre;
            checkpoints.push({
              requestedTimeSeconds: actual.requestedTimeSeconds,
              sourceTimeSeconds: actual.sourceTimeSeconds,
              referenceSourceTimeSeconds: reference.sourceTimeSeconds,
              comparable,
              ...(await difference(actual.imagePath, reference.imagePath)),
              rawSpatialMeanEnergy: actual.rawSpatialMeanEnergy ?? null,
            });
          }
          const comparable = checkpoints.filter((p) => p.comparable),
            detected = comparable.filter((p) => p.detected).length;
          events.push({
            name: added
              ? (fixture.name === "kick-bass-riser" ? "noise riser" : "hats") +
                " added to kick-bass"
              : fixture.name + " onset",
            inputMeasurements: fixture.inputMeasurements,
            comparableCheckpoints: comparable.length,
            detectedCheckpoints: detected,
            detectorPassed: comparable.length >= 2 ? detected >= 2 : null,
            checkpoints,
          });
        }
        assert.deepEqual(
          events.map((event) => event.name),
          policy.requiredEvents,
        );
        results.push({
          engine,
          boundaryMode,
          sampleRate,
          nonlinear,
          instrumentExperiment: report.apertureExperiment ?? null,
          reportPath,
          reportSha256: hash(bytes),
          events,
        });
        imageCache.clear();
      }
for (const [file, expected] of Object.entries(commonSources))
  assert.equal(
    hash(await readFile(path.join(root, file))),
    expected,
    "stale source " + file,
  );
const result = {
  scope: candidateOnly
    ? "Frozen engineering detector for both supported boundaries, sample rates and nonlinear settings. Explicit instrument experiments, if present, are recorded per run; they do not certify current production defaults. This is not corpus, perceptual or latency acceptance."
    : "Frozen engineering image detector for controlled Neumann stereo inputs. Historical and candidate source/normalization/stereo/observer changes are coupled here; this is not isolated physics attribution, onset/rise-time timing, corpus acceptance or physical latency.",
  policySha256: hash(policyBytes),
  sourceHashes: commonSources,
  instrument: commonInstrument,
  results,
  measurementCompared: true,
  detectorPassed: results.every((r) =>
    r.events.every((e) => e.detectorPassed === true),
  ),
  musicalResponseQualified: false,
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      output,
      detectorPassed: result.detectorPassed,
      results: results.map((r) => ({
        engine: r.engine,
        boundaryMode: r.boundaryMode,
        sampleRate: r.sampleRate,
        nonlinear: r.nonlinear,
        events: r.events.map((e) => ({
          name: e.name,
          detectorPassed: e.detectorPassed,
          comparable: e.comparableCheckpoints,
          detected: e.detectedCheckpoints,
        })),
      })),
    },
    null,
    2,
  ),
);

if (!result.detectorPassed) process.exitCode = 1;
