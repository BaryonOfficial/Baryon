import process from "node:process";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createFeatureWorkerState,
  initializeFeatureWorker,
  processFeatureWorkerPcm,
} from "../src/utils/audio/audioFeatureEngine.worker.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../src/defaults.js";

const sampleRate = 48000,
  frameCount = 512,
  warmup = 100,
  measured = 1000;
const percentile = (values, q) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(q * values.length))
  ];
const results = [];
for (const boundaryMode of ["neumann", "dirichlet"])
  for (const channelCount of [1, 2])
    for (const nonlinear of [false, true]) {
      const state = createFeatureWorkerState();
      const configuration = {
        sampleRate,
        channelCount,
        timelineRevision: 0,
        processingRevision: 0,
        boundaryMode,
        exposureSeconds: 0.05,
        cavityAcousticScale: {
          ...CAVITY_ACOUSTIC_DEFAULTS,
          incidentPeakPressurePascalAtFullScale: nonlinear
            ? CAVITY_ACOUSTIC_DEFAULTS.incidentPeakPressurePascalAtFullScale
            : 0,
        },
      };
      const topology = initializeFeatureWorker(state, {
        protocolVersion: 3,
        sourceGeneration: 1,
        workerGeneration: 1,
        configuration,
      });
      const channels = Array.from(
        { length: channelCount },
        () => new Float32Array(512),
      );
      const durations = [];
      let observations = 0;
      for (let sequence = 0; sequence < warmup + measured; sequence++) {
        const startSample = sequence * frameCount;
        for (let c = 0; c < channelCount; c++)
          for (let n = 0; n < frameCount; n++) {
            const time = (startSample + n) / sampleRate;
            channels[c][n] =
              0.12 * Math.sin(2 * Math.PI * (113 + c * 7) * time) +
              0.08 * Math.sin(2 * Math.PI * (331 + c * 19) * time) +
              0.05 * Math.sin(2 * Math.PI * 4500 * time);
          }
        const start = performance.now();
        const result = processFeatureWorkerPcm(state, {
          ...configuration,
          protocolVersion: 3,
          sourceGeneration: 1,
          workerGeneration: 1,
          sequence,
          startSample,
          frameCount,
          buffers: channels.map((c) => c.buffer),
        });
        if (!result.accepted) throw new Error(result.reason);
        if (sequence >= warmup) {
          durations.push(performance.now() - start);
          if (result.observation) observations++;
        }
      }
      results.push({
        boundaryMode,
        channelCount,
        nonlinear,
        familyCount: topology.familyCount,
        shellCount: topology.shellCount,
        measuredBlocks: measured,
        publishedObservations: observations,
        workerCpuMsPerAudioSecond:
          durations.reduce((a, b) => a + b, 0) /
          ((measured * frameCount) / sampleRate),
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        p99Ms: percentile(durations, 0.99),
        maxMs: Math.max(...durations),
      });
    }
const sourceHashes = Object.fromEntries(
  [
    "./benchmarkAudioFeatureWorker.mjs",
    "../src/defaults.js",
    "../src/utils/audio/modalResponseMoments.js",
    "../src/utils/audio/audioFeatureEngine.worker.js",
    "../src/utils/audio/broadbandAudioState.js",
    "../src/utils/audio/broadbandModalResponse.js",
    "../src/utils/audio/streamingAcousticDrive.js",
  ].map((path) => [
    path,
    createHash("sha256")
      .update(readFileSync(fileURLToPath(new URL(path, import.meta.url))))
      .digest("hex"),
  ]),
);
console.log(
  JSON.stringify(
    {
      scope:
        "production v3 CPU worker only; excludes capture, transfer, renderer, GPU and physical latency",
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      inputDefinition:
        "continuous deterministic three-sine PCM; generator and parameters pinned by this script hash",
      sampleRate,
      frameCount,
      warmup,
      measured,
      sourceHashes,
      results,
    },
    null,
    2,
  ),
);
