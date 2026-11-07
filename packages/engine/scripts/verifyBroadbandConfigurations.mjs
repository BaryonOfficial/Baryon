import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../src/defaults.js";
import { CONTROL_DEFINITIONS } from "../src/controls/schema.js";
import { DEFAULT_MODAL_SOURCE_PROFILE } from "../src/core/modalSourceCoupling.js";
import { resolveEffectiveCavityGeometry } from "../src/core/cavityGeometry.js";
import {
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
} from "../src/core/raymarch/fieldCacheGeometry.js";
import {
  deriveCavityModalFieldCacheBandwidth,
  deriveModalFieldCacheTransferAmplitude,
} from "../src/core/raymarch/fieldCachePassband.js";
import { buildModalExcitationAtlas } from "../src/utils/audio/modalExcitationAtlas.js";
import { createBroadbandModalResponse } from "../src/utils/audio/broadbandModalResponse.js";
import { createBroadbandReference } from "../src/testing/broadbandModalReference.js";
import { createBroadbandCosineProjection } from "../src/core/raymarch/broadbandCosineProjection.js";

// This inventories the shipped product apparatus and qualifies numerical rates.
// It does not impose new restrictions on the public runtime API, certify custom
// apparatus/source profiles, or claim browser capture/GPU qualification at a rate.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(
  process.argv[2] ?? "/tmp/baryon-broadband-configurations",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const rates = [
  8000, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000,
];
const boundaries = Object.values(
  CONTROL_DEFINITIONS.find((control) => control.key === "boundaryMode").binding
    .options,
);
assert.deepEqual(boundaries.toSorted(), ["dirichlet", "neumann"]);
const quantities = [
  "pressure",
  "velocity",
  "pressureMoments",
  "velocityMoments",
];
const errorMetrics = (actual, reference, relativeTolerance) => {
  assert.equal(actual.length, reference.length);
  let difference = 0,
    norm = 0;
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Number.isFinite(actual[i]) && Number.isFinite(reference[i]));
    difference += (actual[i] - reference[i]) ** 2;
    norm += reference[i] ** 2;
  }
  const absoluteRms = Math.sqrt(difference / actual.length);
  const referenceRms = Math.sqrt(norm / actual.length);
  return {
    absoluteRms,
    referenceRms,
    relativeRms: referenceRms === 0 ? null : absoluteRms / referenceRms,
    limit: 1e-9 + relativeTolerance * referenceRms,
  };
};
const sourcePaths = [
  "packages/engine/scripts/verifyBroadbandConfigurations.mjs",
  "packages/app-shell/src/components/hooks/useVisualizationRuntimeLifecycle.js",
  "packages/engine/src/controls/schema.js",
  "packages/engine/src/defaults.js",
  "packages/engine/src/core/cavityGeometry.js",
  "packages/engine/src/core/modeFamily.js",
  "packages/engine/src/core/modalShell.js",
  "packages/engine/src/core/modalGeometryBackend.js",
  "packages/engine/src/core/modalSourceCoupling.js",
  "packages/engine/src/core/raymarch/fieldCacheGeometry.js",
  "packages/engine/src/core/raymarch/fieldCacheDomainGeometry.js",
  "packages/engine/src/core/raymarch/fieldCachePassband.js",
  "packages/engine/src/utils/cavityModes.js",
  "packages/engine/src/utils/math.js",
  "packages/engine/src/utils/audio/modalExcitationAtlas.js",
  "packages/engine/src/utils/audio/modalDamping.js",
  "packages/engine/src/utils/audio/broadbandModalResponse.js",
  "packages/engine/src/utils/audio/modalResponseMoments.js",
  "packages/engine/src/utils/audio/broadbandResponseSpectrum.js",
  "packages/engine/src/utils/audio/spectralPhase.js",
  "packages/engine/src/testing/broadbandModalReference.js",
  "packages/engine/src/core/raymarch/broadbandCosineProjection.js",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (path) => [
      path,
      hash(await readFile(resolve(root, path))),
    ]),
  ),
);

function inventory(boundaryMode) {
  const options = {
    radius: 3,
    boundaryMode,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
  };
  const atlas = buildModalExcitationAtlas(options);
  const shells = [
    ...new Map(
      atlas.map((family) => [family.responseModeKey, family]),
    ).values(),
  ];
  const families = atlas.map((family) => ({
    ...family,
    shellIndex: shells.findIndex(
      (shell) => shell.responseModeKey === family.responseModeKey,
    ),
    sourceAmplitudeOverlap:
      family.sourceCouplingAmplitude * family.sourceProjectionWeight,
  }));
  const band = deriveCavityModalFieldCacheBandwidth({
    ...CAVITY_ACOUSTIC_DEFAULTS,
    boundaryMode,
  });
  // Independently enumerate the complete parity-supported shells, including
  // out-of-cache members. Filtering by the axis bound before forming shells
  // would incorrectly retain partially resolved degenerate eigenspaces.
  const expectedShells = new Map();
  const first = boundaryMode === "dirichlet" ? 1 : 0;
  for (let u = first; u <= Math.ceil(band.tailMaxWavenumber); u += 2)
    for (let v = u; v <= Math.ceil(band.tailMaxWavenumber); v += 2)
      for (let w = v; w <= Math.ceil(band.tailMaxWavenumber); w += 2) {
        const squared = u * u + v * v + w * w;
        if (
          squared === 0 ||
          deriveModalFieldCacheTransferAmplitude(Math.sqrt(squared)) <
            band.tailTransferAmplitude
        )
          continue;
        const members = expectedShells.get(squared) ?? [];
        members.push([u, v, w]);
        expectedShells.set(squared, members);
      }
  const complete = [...expectedShells.values()]
    .filter((members) =>
      members.every(
        (orders) => orders[2] <= FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
      ),
    )
    .flat()
    .map((orders) => orders.join(":"))
    .sort();
  assert.deepEqual(atlas.map((family) => family.modeKey).sort(), complete);
  // The product's requested spherical geometry is explicitly diagnostic.
  // Neither it nor visual radius may silently change the acoustic atlas.
  for (const radius of [0.1, 3, 20]) {
    for (const cavityGeometry of ["rectangular", "spherical"]) {
      assert.equal(
        resolveEffectiveCavityGeometry(cavityGeometry),
        "rectangular",
      );
      assert.deepEqual(
        buildModalExcitationAtlas({ ...options, radius, cavityGeometry }),
        atlas,
      );
    }
  }
  const projection = createBroadbandCosineProjection({
    families,
    shellCount: shells.length,
    boundaryMode,
  });
  return {
    boundaryMode,
    families: families.map(
      ({
        modeKey,
        responseModeKey,
        naturalFrequencyHz,
        qualityFactor,
        sourceAmplitudeOverlap,
      }) => ({
        modeKey,
        responseModeKey,
        naturalFrequencyHz,
        qualityFactor,
        sourceAmplitudeOverlap,
      }),
    ),
    familyCount: families.length,
    shellCount: shells.length,
    largestAxisOrder: projection.width - 1,
    cosineCoefficientCount: projection.width ** 3,
    cosineProjectionTermCount: projection.entries.length / 4,
    projectionCpuArrayBytes:
      projection.entries.byteLength +
      projection.offsets.byteLength +
      projection.normalizationWeights.byteLength,
    rawMomentFloat64Bytes: 2 * shells.length ** 2 * 8,
    stereoStateFloat64Bytes: 2 * 2 * shells.length * 8,
    naturalFrequencyRangeHz: [
      Math.min(...shells.map((s) => s.naturalFrequencyHz)),
      Math.max(...shells.map((s) => s.naturalFrequencyHz)),
    ],
    observationBand: band,
    shells,
  };
}

function compare({
  name,
  shells,
  sampleRate,
  exposureSeconds,
  channelCount,
  substeps,
  frameCount,
}) {
  const options = { shells, sampleRate, exposureSeconds, channelCount };
  const channels = Array.from({ length: channelCount }, (_, channel) =>
    Float64Array.from({ length: frameCount }, (_, n) =>
      n >= frameCount * 0.75
        ? 0
        : 0.23 * Math.sin(n * 0.17 + channel) +
          0.19 * Math.cos(n * 2.97 + channel * 0.37) +
          (n % 29 === 0 ? 0.4 : 0),
    ),
  );
  const candidate = createBroadbandModalResponse(options);
  const coarse = createBroadbandReference({ ...options, substeps });
  const fine = createBroadbandReference({ ...options, substeps: substeps * 2 });
  const finest = createBroadbandReference({
    ...options,
    substeps: substeps * 4,
  });
  candidate.advance(channels);
  coarse.advance(channels);
  fine.advance(channels);
  finest.advance(channels);
  const actual = candidate.read(),
    low = coarse.read(),
    high = fine.read(),
    highest = finest.read();
  const metrics = Object.fromEntries(
    quantities.map((key) => {
      const refinements = [
        errorMetrics(low[key], high[key], 1e-8),
        errorMetrics(high[key], highest[key], 1e-8),
      ];
      const candidate = errorMetrics(actual[key], highest[key], 1e-6);
      for (const refinement of refinements)
        assert.ok(
          refinement.absoluteRms <= refinement.limit,
          `${name} ${key}: reference convergence ${JSON.stringify(refinement)}`,
        );
      assert.ok(
        candidate.absoluteRms <= candidate.limit,
        `${name} ${key}: candidate error ${JSON.stringify(candidate)}`,
      );
      return [key, { refinements, candidate }];
    }),
  );
  return {
    name,
    sampleRate,
    exposureSeconds,
    channelCount,
    frameCount,
    referenceSubsteps: [substeps, substeps * 2, substeps * 4],
    shellCount: shells.length,
    pcmHashes: channels.map((samples) => hash(new Uint8Array(samples.buffer))),
    metrics,
  };
}

const configurations = boundaries.map(inventory);
const comparisons = [];
for (const configuration of configurations) {
  for (const sampleRate of rates) {
    comparisons.push(
      compare({
        name: `${configuration.boundaryMode}-${sampleRate}`,
        shells: configuration.shells,
        sampleRate,
        exposureSeconds: 0.05,
        channelCount: 2,
        // The 6.25 m instrument doubles the highest natural frequency. Refine
        // the independent RK4 oracle, retaining both convergence checks and
        // the original error bounds at the lowest supported numerical rate.
        substeps: 64,
        frameCount: 96,
      }),
    );
    process.stdout.write(
      `passed ${configuration.boundaryMode} ${sampleRate} Hz\n`,
    );
  }
}
// Lower-level solver bounds, distinct from the shipped fixed water apparatus.
// Near-Nyquist/critical and weakly damped pairs stress intra-sample quadrature
// and the full cross-shell moment reconstruction at all proposed exposures.
for (const sampleRate of [8000, 48000, 192000]) {
  for (const exposureSeconds of [0.02, 0.05, 0.1]) {
    comparisons.push(
      compare({
        name: `solver-extreme-${sampleRate}-${exposureSeconds}`,
        shells: [
          { naturalFrequencyHz: sampleRate / 2, qualityFactor: 0.5 },
          {
            naturalFrequencyHz: (sampleRate / 2) * (1 - 1e-9),
            qualityFactor: 0.500001,
          },
          { naturalFrequencyHz: sampleRate * 0.499, qualityFactor: 50000 },
          { naturalFrequencyHz: 20, qualityFactor: 50000 },
        ],
        sampleRate,
        exposureSeconds,
        channelCount: 2,
        substeps: 512,
        frameCount: 256,
      }),
    );
  }
}
const extrema = Object.fromEntries(
  [
    "familyCount",
    "shellCount",
    "largestAxisOrder",
    "cosineCoefficientCount",
    "cosineProjectionTermCount",
    "projectionCpuArrayBytes",
    "rawMomentFloat64Bytes",
    "stereoStateFloat64Bytes",
  ].map((key) => {
    const maximum = Math.max(...configurations.map((c) => c[key]));
    return [
      key,
      {
        maximum,
        boundaries: configurations
          .filter((c) => c[key] === maximum)
          .map((c) => c.boundaryMode),
      },
    ];
  }),
);
const report = {
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  node: process.version,
  sourceHashes,
  scope:
    "Product-configuration inventory and CPU numerical qualification, not production promotion",
  product: {
    apparatus: CAVITY_ACOUSTIC_DEFAULTS,
    sourceProfile: DEFAULT_MODAL_SOURCE_PROFILE,
    effectiveGeometry: "rectangular",
    boundaries,
    cacheResolution: FIELD_CACHE_RESOLUTION,
    maximumAccurateAxisOrder: FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
    topologyTruncated: false,
    channelCounts: [1, 2],
    preparation: {
      productIncidentPressurePascal:
        CAVITY_ACOUSTIC_DEFAULTS.incidentPeakPressurePascalAtFullScale,
      linearComparisonIncidentPressurePascal: 0,
      dcCutoffHz: 5,
      nonlinearFrameSamples: 2048,
      nonlinearHopSamples: 512,
    },
    numericallyExercisedSampleRates: rates,
    nativeCompleteRenderSampleRates: [48000],
    sampleRatePolicy:
      "The source AudioContext supplies the actual rate; this report does not add a rate whitelist. Numerical coverage at listed rates is not capture/device support.",
    extensionPolicy:
      "Custom apparatus/source profiles remain lower-level API inputs; not covered by these product extrema. Solver requires every natural frequency at or below Nyquist and Q >= 0.5; parity-optimized field requires centered-source symmetry.",
  },
  configurations: configurations.map(({ shells, ...configuration }) => ({
    ...configuration,
    shellIdentities: shells.map((shell) => shell.responseModeKey),
  })),
  extrema,
  comparisons,
  exclusions: [
    "Custom source widths, apparatus materials/scales, passbands or cache resolutions",
    "Complete GPU/worker cost, browser capture and nonlinear preparation at rates other than the separately recorded native lanes",
    "Music, live/file resampling parity, physical latency, soak and native stage outputs",
    "Final production configuration boundary and representation freeze",
  ],
  passed: true,
};
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "broadband-configurations-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(
  `passed ${comparisons.length} numerical comparisons; report: ${output}\n`,
);
