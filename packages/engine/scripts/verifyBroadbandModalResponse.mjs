import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { cpus } from "node:os";
import { createBroadbandModalResponse } from "../src/utils/audio/broadbandModalResponse.js";
import { createAcousticDcBlocker } from "../src/utils/audio/streamingAcousticDrive.js";
import {
  createAudioPcmStream,
  iterateAudioPcmBlocks,
} from "../src/core/audio/audioPcmStream.js";
import {
  createBroadbandReference,
  referenceBroadbandTransfer,
  referenceBroadbandBasis,
  referenceMomentField,
} from "../src/testing/broadbandModalReference.js";
import {
  referenceHeldHarmonicResponse,
  referenceContinuousHarmonicResponse,
} from "../src/testing/broadbandHarmonicReference.js";
import { referenceModalTransfer } from "../src/testing/polyphonicModalReference.js";
import { buildModalExcitationAtlas } from "../src/utils/audio/modalExcitationAtlas.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "../src/core/raymarch/fieldObservation.js";

// Numerical G0/G1 evidence and a CPU-only cost probe. This does not qualify
// capture, GPU rendering, stereo/nonlinear production, real music or latency.
const output = process.argv[2] ? resolve(process.argv[2]) : null;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const sampleRate = 48000;
const frameCount = 2048;
const atlas = buildModalExcitationAtlas({ radius: 3 });
const uniqueShells = [
  ...new Map(atlas.map((m) => [m.responseModeKey, m])).values(),
];
const modes = atlas.slice(0, 3);
const families = modes.map((mode, shellIndex) => ({
  ...mode,
  shellIndex,
  // Atlas couplingAmplitude is shell gain; projectionWeight distributes it
  // over degenerate families. Their product is the dossier's signed s_j.
  sourceAmplitudeOverlap:
    mode.sourceCouplingAmplitude * mode.sourceProjectionWeight,
}));
const basis = referenceBroadbandBasis(
  families,
  [0.17, -0.41, 0.63],
  modes.length,
);
const hash = (data) => createHash("sha256").update(data).digest("hex");
function rmsError(a, b) {
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
    norm += b[i] ** 2;
  }
  return Math.sqrt(sum / Math.max(norm, 1e-30));
}
function makeSignal(tones) {
  return Float64Array.from({ length: frameCount }, (_, n) => {
    let value = 0;
    for (let t = 0; t < tones; t++) {
      value +=
        (0.2 / Math.sqrt(tones)) *
        Math.cos((2 * Math.PI * (31 + 43.31 * t) * n) / sampleRate + t * 0.731);
    }
    return value;
  });
}
let seed = 0x91721;
const noise = Float64Array.from({ length: frameCount }, () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return 0.4 * (seed / 2 ** 32 - 0.5);
});
const inputs = [1, 2, 16, 17, 64, 256].map((tones) => ({
  name: `${tones}-tones`,
  samples: makeSignal(tones),
}));
inputs.push({ name: "seeded-noise", samples: noise });
inputs.push({
  name: "impulse-and-silence",
  samples: Float64Array.from({ length: frameCount }, (_, n) =>
    n === 0 ? 1 : 0,
  ),
});
const results = [];
for (const { name, samples } of inputs) {
  const prepared = new Float64Array(frameCount);
  createAcousticDcBlocker({ sampleRate, channelCount: 1 }).process(
    [samples],
    [prepared],
  );
  const response = createBroadbandModalResponse({ shells: modes, sampleRate });
  const reference = [4, 8, 16].map((substeps) =>
    createBroadbandReference({
      shells: modes,
      sampleRate,
      substeps,
      probes: [basis],
    }),
  );
  const config = {
    sourceGeneration: 1,
    timelineRevision: 0,
    processingRevision: 0,
    sampleRate,
    channelCount: 1,
  };
  const stream = createAudioPcmStream(config);
  for (const block of iterateAudioPcmBlocks([prepared], config, 73)) {
    assert.equal(
      stream.accept(block, ({ channels }) => response.advance(channels))
        .accepted,
      true,
    );
  }
  reference.forEach((oracle) => oracle.advance([prepared]));
  const snapshots = reference.map((oracle) => oracle.read());
  const actual = response.read();
  const metrics = {};
  for (const key of [
    "pressure",
    "velocity",
    "pressureMoments",
    "velocityMoments",
  ]) {
    const refinements = [
      rmsError(snapshots[0][key], snapshots[1][key]),
      rmsError(snapshots[1][key], snapshots[2][key]),
    ];
    const relativeRms = rmsError(actual[key], snapshots[2][key]);
    assert.ok(
      refinements.every((value) => value < 1e-8),
      `${name}: reference convergence ${key}`,
    );
    assert.ok(relativeRms < 1e-6, `${name}: candidate ${key}`);
    metrics[key] = { relativeRms, refinements };
  }
  const field = referenceMomentField(actual, basis, contrast);
  assert.ok(
    Math.abs(field.pressureEnergy - snapshots[2].probePressureEnergy[0]) < 1e-9,
  );
  assert.ok(
    Math.abs(field.velocityEnergy - snapshots[2].probeVelocityEnergy[0]) < 1e-9,
  );
  results.push({
    name,
    pcmSha256: hash(Buffer.from(samples.buffer)),
    metrics,
    field,
  });
}

// A second independent route checks settled transfer and beat observation.
// These fixtures bypass DC preparation to isolate the response equations.
const harmonicCases = [];
for (const rate of [44100, 48000]) {
  for (const frequencyHz of [20, 118.4, 1000, 20000, 0.45 * rate]) {
    harmonicCases.push({
      name: `held-transfer-${rate}-${frequencyHz}`,
      sampleRate: rate,
      sampleIndex: Math.round(1.5 * rate),
      exposureSeconds: 0.05,
      tones: [{ frequencyHz, amplitude: 0.3, phaseRad: 0.37 }],
    });
  }
}
for (const separationHz of [0, 1e-8, 0.5, 5, 40]) {
  for (const exposureSeconds of [0.02, 0.05, 0.1]) {
    harmonicCases.push({
      name: `held-beats-${separationHz}-${exposureSeconds}`,
      sampleRate: 48000,
      sampleIndex: 192000,
      exposureSeconds,
      tones: [
        { frequencyHz: 119, amplitude: 0.3, phaseRad: 0.7 },
        { frequencyHz: 119 + separationHz, amplitude: 0.2, phaseRad: -0.2 },
      ],
    });
  }
}
const harmonicResults = harmonicCases.map((fixture) => {
  const configuration = { ...fixture, shells: modes };
  const samples = Float64Array.from({ length: fixture.sampleIndex }, (_, n) =>
    fixture.tones.reduce(
      (sum, tone) =>
        sum +
        tone.amplitude *
          Math.cos(
            (2 * Math.PI * tone.frequencyHz * n) / fixture.sampleRate +
              tone.phaseRad,
          ),
      0,
    ),
  );
  const candidate = createBroadbandModalResponse(configuration);
  candidate.advance([samples]);
  const actual = candidate.read();
  const references = [256, 512, 1024].map((quadratureIntervals) =>
    referenceHeldHarmonicResponse({ ...configuration, quadratureIntervals }),
  );
  const continuous = referenceContinuousHarmonicResponse({
    ...configuration,
    timeSeconds: fixture.sampleIndex / fixture.sampleRate,
  });
  const metrics = {};
  for (const key of [
    "pressure",
    "velocity",
    "pressureMoments",
    "velocityMoments",
  ]) {
    const refinements = [
      rmsError(references[0][key], references[1][key]),
      rmsError(references[1][key], references[2][key]),
    ];
    const relativeRms = rmsError(actual[key], references[2][key]);
    assert.ok(
      refinements.every((value) => value < 1e-8),
      `${fixture.name}: unconverged ${key}: ${refinements}`,
    );
    assert.ok(relativeRms < 1e-6, `${fixture.name}: ${key}: ${relativeRms}`);
    metrics[key] = {
      relativeRms,
      refinements,
      heldVersusContinuousRelativeRms: rmsError(
        references[2][key],
        continuous[key],
      ),
    };
  }
  return { ...fixture, pcmSha256: hash(Buffer.from(samples.buffer)), metrics };
});

// Attribute source/loss semantics separately from normalization and temporal
// exposure: unit-amplitude continuous sinusoid, long-time mean, same full atlas.
const shellIndexByKey = new Map(
  uniqueShells.map((m, i) => [m.responseModeKey, i]),
);
const fullFamilies = atlas.map((mode) => ({
  ...mode,
  shellIndex: shellIndexByKey.get(mode.responseModeKey),
  sourceAmplitudeOverlap:
    mode.sourceCouplingAmplitude * mode.sourceProjectionWeight,
}));
const gridSize = 65;
const gridStep = 1.6 / (gridSize - 1);
const grid = Array.from({ length: gridSize ** 2 }, (_, i) => [
  -0.8 + gridStep * (i % gridSize),
  -0.8 + gridStep * Math.floor(i / gridSize),
  0.31,
]);
const gridBases = grid.map((position) =>
  referenceBroadbandBasis(fullFamilies, position, uniqueShells.length),
);
function stationaryMoments(coefficients) {
  const matrices = ["pressure", "velocity"].map((component) =>
    Float64Array.from({ length: uniqueShells.length ** 2 }, (_, i) => {
      const a = coefficients[Math.floor(i / uniqueShells.length)][component];
      const b = coefficients[i % uniqueShells.length][component];
      return 0.5 * (a.real * b.real + a.imaginary * b.imaginary);
    }),
  );
  return { pressureMoments: matrices[0], velocityMoments: matrices[1] };
}
const sourceModelAttribution = [
  20, 40, 80, 118.4, 237.1, 1000, 10000, 20000,
].map((frequencyHz) => {
  const oldCoefficients = uniqueShells.map((shell) => {
    const pressure = referenceModalTransfer(
      shell.naturalFrequencyHz,
      shell.qualityFactor,
      frequencyHz,
    );
    const ratio = shell.naturalFrequencyHz / frequencyHz;
    return {
      pressure,
      velocity: {
        real: ratio * pressure.imaginary,
        imaginary: -ratio * pressure.real,
      },
    };
  });
  const newCoefficients = uniqueShells.map((shell) =>
    referenceBroadbandTransfer(shell, frequencyHz),
  );
  const observed = [oldCoefficients, newCoefficients].map((coefficients) => {
    const moments = stationaryMoments(coefficients);
    const fields = gridBases.map((basis) => {
      const field = referenceMomentField(moments, basis, contrast);
      return {
        pressureEnergy: field.pressureEnergy,
        velocityEnergy: field.velocityEnergy,
        rawPotential:
          contrast.pressureEnergyWeight * field.pressureEnergy -
          contrast.velocityEnergyWeight * field.velocityEnergy,
        rawGradient: field.gradient.map(
          (value) => value * field.normalizationEnergy,
        ),
      };
    });
    const weights = gridBases[0].normalizationWeights;
    const meanPressureEnergy = weights.reduce(
      (sum, weight, i) =>
        sum + weight * moments.pressureMoments[i * uniqueShells.length + i],
      0,
    );
    const meanVelocityEnergy = weights.reduce(
      (sum, weight, i) =>
        sum + weight * moments.velocityMoments[i * uniqueShells.length + i],
      0,
    );
    return { meanPressureEnergy, meanVelocityEnergy, fields };
  });
  return { frequencyHz, old: observed[0], selected: observed[1] };
});
const costResponse = createBroadbandModalResponse({
  shells: uniqueShells,
  sampleRate,
});
const block = [noise.subarray(0, 512)];
for (let i = 0; i < 5; i++) costResponse.advance(block);
const durations = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  costResponse.advance(block);
  costResponse.read();
  durations.push(performance.now() - start);
}
durations.sort((a, b) => a - b);
const p95 = durations[Math.ceil(0.95 * durations.length) - 1];
const sourcePaths = [
  "packages/engine/scripts/verifyBroadbandModalResponse.mjs",
  "packages/engine/src/testing/broadbandModalReference.js",
  "packages/engine/src/testing/broadbandHarmonicReference.js",
  "packages/engine/src/testing/polyphonicModalReference.js",
  "packages/engine/src/utils/audio/broadbandModalResponse.js",
  "packages/engine/src/utils/audio/modalResponseMoments.js",
  "packages/engine/src/core/audio/audioPcmStream.js",
  "packages/engine/src/utils/audio/streamingAcousticDrive.js",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (path) => [
      path,
      hash(await readFile(join(root, path))),
    ]),
  ),
);
const report = {
  scope:
    "independent linear numerical comparison; CPU response/moment probe only",
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceHashes,
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model,
  sampleRate,
  frameCount,
  exposureSeconds: 0.05,
  channelCount: 1,
  inputHold: "zero-order",
  dcCutoffHz: 5,
  numericalControlsPassed: true,
  results,
  harmonicResults,
  sourceModelAttribution: {
    scope:
      "Unnormalized continuous unit-tone response; same full atlas, no DC preparation, long-time averaging. These deliberate model differences are not solver errors.",
    familyCount: atlas.length,
    shellCount: uniqueShells.length,
    positions: grid,
    results: sourceModelAttribution,
  },
  cpuProbe: {
    shellCount: uniqueShells.length,
    familyCount: atlas.length,
    framesPerCall: 512,
    includesMomentPublication: true,
    observationDiagnostics: costResponse.read().observationDiagnostics,
    iterations: durations.length,
    p50Ms: durations[Math.floor(durations.length / 2)],
    p95Ms: p95,
    provisionalCeilingMs: 4,
    meetsResponseOnlyCeiling: p95 <= 4,
    exclusions: [
      "capture",
      "preparation",
      "spectral color",
      "GPU",
      "transport",
      "display",
    ],
  },
  remaining: [
    "production capture/worker integration",
    "full G1b attribution and exposure selection",
    "G2a complete path and baseline",
    "G0b/G1b/G2b",
    "production cutover",
    "retirement",
    "native and real-mix acceptance",
  ],
};
if (output) {
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "broadband-numerical-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(
  JSON.stringify(
    {
      numericalControlsPassed: report.numericalControlsPassed,
      cases: results.length,
      harmonicCases: harmonicResults.length,
      sourceModelComparisons: sourceModelAttribution.length,
      cpuProbe: report.cpuProbe,
      report: output ? join(output, "broadband-numerical-report.json") : null,
    },
    null,
    2,
  ),
);
