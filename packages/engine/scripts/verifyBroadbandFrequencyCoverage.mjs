import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { buildModalExcitationAtlas } from "../src/utils/audio/modalExcitationAtlas.js";
import { createBroadbandModalResponse } from "../src/utils/audio/broadbandModalResponse.js";
import { createAcousticDcBlocker } from "../src/utils/audio/streamingAcousticDrive.js";
import {
  referenceBroadbandTransfer,
  referenceBroadbandBasis,
} from "../src/testing/broadbandModalReference.js";
import { referenceHeldHarmonicResponse } from "../src/testing/broadbandHarmonicReference.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(process.argv[2] ?? "/tmp/baryon-frequency-coverage");
const inputRms = 0.1;
const sourcePaths = [
  "packages/engine/scripts/verifyBroadbandFrequencyCoverage.mjs",
  "packages/engine/src/defaults.js",
  "packages/engine/src/core/modalSourceCoupling.js",
  "packages/engine/src/core/raymarch/fieldCacheGeometry.js",
  "packages/engine/src/core/raymarch/fieldCacheDomainGeometry.js",
  "packages/engine/src/core/raymarch/fieldCachePassband.js",
  "packages/engine/src/utils/audio/modalExcitationAtlas.js",
  "packages/engine/src/utils/audio/modalDamping.js",
  "packages/engine/src/utils/audio/broadbandModalResponse.js",
  "packages/engine/src/utils/audio/modalResponseMoments.js",
  "packages/engine/src/utils/audio/broadbandResponseSpectrum.js",
  "packages/engine/src/utils/audio/streamingAcousticDrive.js",
  "packages/engine/src/testing/broadbandModalReference.js",
  "packages/engine/src/testing/broadbandHarmonicReference.js",
];
const fingerprint = async () =>
  Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (p) => [
        p,
        createHash("sha256")
          .update(await readFile(resolve(root, p)))
          .digest("hex"),
      ]),
    ),
  );
const before = await fingerprint();
function dcPowerGain(frequencyHz, sampleRate) {
  const rho = Math.exp((-2 * Math.PI * 5) / sampleRate),
    theta = (2 * Math.PI * frequencyHz) / sampleRate;
  return (
    (2 - 2 * Math.cos(theta)) / (1 + rho * rho - 2 * rho * Math.cos(theta))
  );
}
function energy(observation, weights) {
  let pressure = 0,
    velocity = 0;
  for (let s = 0; s < weights.length; s++) {
    pressure +=
      weights[s] * observation.pressureMoments[s * weights.length + s];
    velocity +=
      weights[s] * observation.velocityMoments[s * weights.length + s];
  }
  return { pressure, velocity, normalization: pressure + velocity };
}
const results = [];
for (const sampleRate of [44100, 48000])
  for (const boundaryMode of ["neumann", "dirichlet"]) {
    const atlas = buildModalExcitationAtlas({ radius: 3, boundaryMode });
    const shells = [
      ...new Map(atlas.map((f) => [f.responseModeKey, f])).values(),
    ];
    const families = atlas.map((f) => ({
      ...f,
      shellIndex: shells.findIndex(
        (s) => s.responseModeKey === f.responseModeKey,
      ),
      sourceAmplitudeOverlap:
        f.sourceCouplingAmplitude * f.sourceProjectionWeight,
    }));
    const weights = referenceBroadbandBasis(
      families,
      [0, 0, 0],
      shells.length,
      boundaryMode,
    ).normalizationWeights;
    const low = Math.min(...shells.map((s) => s.naturalFrequencyHz)),
      high = Math.max(...shells.map((s) => s.naturalFrequencyHz));
    const maximum = Math.min(20000, 0.45 * sampleRate);
    const frequencies = [
      ...new Set([
        ...Array.from(
          { length: 161 },
          (_, i) => 20 * (maximum / 20) ** (i / 160),
        ),
        ...shells.map((s) => s.naturalFrequencyHz),
      ]),
    ].sort((a, b) => a - b);
    const curve = frequencies.map((frequencyHz) => {
      let pressure = 0,
        velocity = 0;
      for (let s = 0; s < shells.length; s++) {
        const h = referenceBroadbandTransfer(shells[s], frequencyHz);
        pressure +=
          weights[s] * (h.pressure.real ** 2 + h.pressure.imaginary ** 2);
        velocity +=
          weights[s] * (h.velocity.real ** 2 + h.velocity.imaginary ** 2);
      }
      const gain = dcPowerGain(frequencyHz, sampleRate) * inputRms ** 2;
      return {
        frequencyHz,
        pressure: pressure * gain,
        velocity: velocity * gain,
        normalization: (pressure + velocity) * gain,
        withinEligibleNaturalRange: frequencyHz >= low && frequencyHz <= high,
      };
    });
    const anchors = [];
    for (const frequencyHz of [20, 60, low, 200, 1000, 3000, 10000, 18000]) {
      const frameCount = 2 * sampleRate;
      const input = Array.from({ length: 2 }, (_, a) =>
        Float64Array.from(
          { length: frameCount },
          (_, n) =>
            Math.SQRT2 *
            inputRms *
            Math.cos(
              (2 * Math.PI * frequencyHz * n) / sampleRate + (a * Math.PI) / 2,
            ),
        ),
      );
      const prepared = input.map((c) => new Float64Array(c.length));
      createAcousticDcBlocker({ sampleRate, channelCount: 2 }).process(
        input,
        prepared,
      );
      const state = createBroadbandModalResponse({
        shells,
        sampleRate,
        channelCount: 2,
      });
      state.advance(prepared);
      const actual = state.read();
      function oracle(intervals) {
        const p = new Float64Array(shells.length),
          v = new Float64Array(shells.length);
        for (let s = 0; s < shells.length; s++)
          for (const phaseRad of [0, Math.PI / 2]) {
            const ref = referenceHeldHarmonicResponse({
              shells: [shells[s]],
              tones: [
                {
                  frequencyHz,
                  amplitude:
                    Math.SQRT2 *
                    inputRms *
                    Math.sqrt(dcPowerGain(frequencyHz, sampleRate)),
                  phaseRad,
                },
              ],
              sampleRate,
              sampleIndex: frameCount,
              quadratureIntervals: intervals,
            });
            p[s] += ref.pressureMoments[0] / 2;
            v[s] += ref.velocityMoments[0] / 2;
          }
        return { pressure: p, velocity: v };
      }
      const refs = [oracle(16), oracle(32), oracle(64)];
      const quantities = ["pressure", "velocity"].map((name, k) => {
        const matrix =
          k === 0 ? actual.pressureMoments : actual.velocityMoments;
        let error = 0,
          norm = 0;
        const refinements = [0, 0];
        for (let s = 0; s < shells.length; s++) {
          error += (matrix[s * shells.length + s] - refs[2][name][s]) ** 2;
          norm += refs[2][name][s] ** 2;
          for (let j = 0; j < 2; j++)
            refinements[j] += (refs[j + 1][name][s] - refs[j][name][s]) ** 2;
        }
        const absoluteRms = Math.sqrt(error / shells.length),
          referenceRms = Math.sqrt(norm / shells.length);
        const refinementRms = refinements.map((value) =>
          Math.sqrt(value / shells.length),
        );
        return {
          name,
          absoluteRms,
          referenceRms,
          relativeRms: absoluteRms / referenceRms,
          refinementRms,
          passed:
            absoluteRms <= 1e-9 + 1e-6 * referenceRms &&
            refinementRms.every((value) => value <= 1e-9 + 1e-8 * referenceRms),
        };
      });
      assert(
        quantities.every((q) => q.passed),
        JSON.stringify({ sampleRate, boundaryMode, frequencyHz, quantities }),
      );
      anchors.push({
        frequencyHz,
        rawSpatialMeanEnergy: energy(actual, weights),
        quantities,
      });
    }
    assert(
      curve.every((p) =>
        [p.pressure, p.velocity, p.normalization].every(
          (v) => Number.isFinite(v) && v > 0,
        ),
      ),
    );
    results.push({
      sampleRate,
      boundaryMode,
      familyCount: families.length,
      shellCount: shells.length,
      naturalFrequencyRangeHz: [low, high],
      inputRms,
      curve,
      anchors,
    });
    console.log(
      JSON.stringify({ sampleRate, boundaryMode, anchors: anchors.length }),
    );
  }
assert.deepEqual(
  await fingerprint(),
  before,
  "source changed during measurement",
);
const report = {
  scope:
    "Dense continuous settled-transfer characterization after the declared linear DC filter, at equal input RMS. Streaming anchors separately check the actual zero-order-held solver against independently refined per-shell harmonic moments. Spatial means use signed source overlap squared once. No nonlinear transfer, render visibility, actual device-rate, corpus or product acceptance is implied.",
  sourceHashes: before,
  results,
  measurementCompleted: true,
  musicalResponseQualified: false,
};
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "broadband-frequency-coverage-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    measurementCompleted: true,
    musicalResponseQualified: false,
    report: resolve(output, "broadband-frequency-coverage-report.json"),
  }),
);
