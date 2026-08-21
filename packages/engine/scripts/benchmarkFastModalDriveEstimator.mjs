import { performance } from "node:perf_hooks";
import process from "node:process";
import {
  FAST_MODAL_DRIVE_PROBE_LIMIT,
  FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  createFastModalDriveEstimator,
} from "../src/utils/audio/fastModalDriveEstimator.js";
import { createFastModalBenchmarkCommittedModes } from "../src/testing/fastModalBenchmarkFixture.js";

const SAMPLE_RATES = [44100, 48000];
const WARMUP_FRAMES = 100;
const MEASURED_FRAMES = 1000;
const P95_GATE_MS = 2.5;

function percentile(sortedValues, proportion) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * proportion) - 1),
  );
  return sortedValues[index];
}

function buildFixture(sampleRate) {
  const modes = createFastModalBenchmarkCommittedModes();
  const samples = new Float32Array(FAST_MODAL_DRIVE_WINDOW_SAMPLES);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    let value = 0;
    for (let componentIndex = 0; componentIndex < 8; componentIndex += 1) {
      const mode = modes[componentIndex * 5];
      value +=
        (0.16 / (componentIndex + 1)) *
        Math.cos(
          (2 * Math.PI * mode.naturalFrequencyHz * sampleIndex) / sampleRate +
            componentIndex * 0.31,
        );
    }
    samples[sampleIndex] = value;
  }
  return {
    estimator: createFastModalDriveEstimator({
      committedModes: modes,
      sampleRate,
    }),
    samples,
  };
}

let failed = false;
console.log(
  `Fast modal Goertzel benchmark: ${FAST_MODAL_DRIVE_PROBE_LIMIT} modes × ${FAST_MODAL_DRIVE_WINDOW_SAMPLES} samples`,
);
for (const sampleRate of SAMPLE_RATES) {
  const { estimator, samples } = buildFixture(sampleRate);
  const stableTargetBuffer = estimator.result.targetEnergyByMode;
  for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) {
    estimator.evaluate(samples, 0.8);
  }

  const durationsMs = new Float64Array(MEASURED_FRAMES);
  for (let frame = 0; frame < MEASURED_FRAMES; frame += 1) {
    const startedAt = performance.now();
    estimator.evaluate(samples, 0.8);
    durationsMs[frame] = performance.now() - startedAt;
  }
  if (estimator.result.targetEnergyByMode !== stableTargetBuffer) {
    throw new Error("Estimator replaced a steady-state typed output buffer.");
  }

  const sortedDurations = Array.from(durationsMs).sort(
    (left, right) => left - right,
  );
  const p50Ms = percentile(sortedDurations, 0.5);
  const p95Ms = percentile(sortedDurations, 0.95);
  const maximumMs = sortedDurations.at(-1);
  const passed = p95Ms <= P95_GATE_MS;
  failed ||= !passed;
  console.log(
    `${sampleRate} Hz: p50=${p50Ms.toFixed(3)} ms p95=${p95Ms.toFixed(3)} ms max=${maximumMs.toFixed(3)} ms gate=${P95_GATE_MS.toFixed(1)} ms ${passed ? "PASS" : "FAIL"}`,
  );
}

if (failed) {
  process.exitCode = 1;
}
