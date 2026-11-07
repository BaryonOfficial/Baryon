import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { buildModalExcitationAtlas } from "../src/utils/audio/modalExcitationAtlas.js";
import {
  referenceBroadbandBasis,
  referenceMomentField,
} from "../src/testing/broadbandModalReference.js";
import { referenceContinuousHarmonicResponse } from "../src/testing/broadbandHarmonicReference.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "../src/core/raymarch/fieldObservation.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../src/defaults.js";
import { createStreamingAcousticDrive } from "../src/utils/audio/streamingAcousticDrive.js";
import { referenceStreamingAcousticDrive } from "../src/testing/streamingAcousticReference.js";
import { createBroadbandModalResponse } from "../src/utils/audio/broadbandModalResponse.js";
import { expandBroadbandSpectralWindow } from "../src/testing/broadbandSpectralWindowReference.js";
import {
  referenceSpectralField,
  referenceSpectralSupport,
} from "../src/testing/broadbandSpectralReference.js";
import {
  CYMATIC_OBSERVER_REFERENCE,
  compressCymaticObserverEnergy,
  deriveCymaticObserverBlend,
  deriveCymaticObserverSurfaceSupport,
  deriveCymaticObserverGeometryAssimilation,
} from "../src/core/raymarch/cymaticObserverReference.js";

// Offline attribution only. All channels use the same linear pressure/velocity
// equations and signed basis; no production selector, compensation or state.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(
  process.argv[2] ?? "/tmp/baryon-observation-attribution",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const matrixKeys = ["pressureMoments", "velocityMoments"];
const gridSize = 21;
const positions = Array.from({ length: gridSize ** 2 }, (_, i) => [
  -0.8 + (1.6 * (i % gridSize)) / (gridSize - 1),
  -0.8 + (1.6 * Math.floor(i / gridSize)) / (gridSize - 1),
  0.31,
]);
const tone = (frequencyHz, amplitude = 0.3, phaseRad = 0.37) => ({
  frequencyHz,
  amplitude,
  phaseRad,
});
const scaleTones = (tones, gain) =>
  tones.map((value) => ({ ...value, amplitude: gain * value.amplitude }));
function downmixTones(left, right) {
  const phasors = new Map();
  for (const value of [...left, ...right]) {
    const phasor = phasors.get(value.frequencyHz) ?? [0, 0];
    phasor[0] += 0.5 * value.amplitude * Math.cos(value.phaseRad);
    phasor[1] += 0.5 * value.amplitude * Math.sin(value.phaseRad);
    phasors.set(value.frequencyHz, phasor);
  }
  return [...phasors].map(([frequencyHz, [real, imaginary]]) =>
    tone(frequencyHz, Math.hypot(real, imaginary), Math.atan2(imaginary, real)),
  );
}
function meanMoments(channels) {
  return Object.fromEntries(
    matrixKeys.map((key) => [
      key,
      Float64Array.from(
        channels[0][key],
        (_, i) =>
          channels.reduce((sum, value) => sum + value[key][i], 0) /
          channels.length,
      ),
    ]),
  );
}
function assertScaled(actual, reference, scale, label) {
  let maxAbsoluteError = 0;
  for (const key of matrixKeys)
    for (let i = 0; i < actual[key].length; i++) {
      const expected = scale * reference[key][i];
      const error = Math.abs(actual[key][i] - expected);
      assert.ok(Number.isFinite(error));
      assert.ok(error <= 1e-12 + 1e-10 * Math.abs(expected), label);
      maxAbsoluteError = Math.max(maxAbsoluteError, error);
    }
  return maxAbsoluteError;
}

const results = [];
const apparatusCases = [];
for (const boundaryMode of ["neumann", "dirichlet"]) {
  const atlas = buildModalExcitationAtlas({ radius: 3, boundaryMode });
  const shells = [
    ...new Map(atlas.map((m) => [m.responseModeKey, m])).values(),
  ];
  const shellIndex = new Map(shells.map((m, i) => [m.responseModeKey, i]));
  const families = atlas.map((m) => ({
    ...m,
    shellIndex: shellIndex.get(m.responseModeKey),
    sourceAmplitudeOverlap:
      m.sourceCouplingAmplitude * m.sourceProjectionWeight,
  }));
  const bases = positions.map((position) => {
    const { pressure, velocity, normalizationWeights } =
      referenceBroadbandBasis(families, position, shells.length, boundaryMode);
    return { pressure, velocity, normalizationWeights };
  });
  const weights = bases[0].normalizationWeights;
  function summarize(moments) {
    const pressureNormalization = weights.reduce(
      (sum, weight, i) =>
        sum + weight * moments.pressureMoments[i * shells.length + i],
      0,
    );
    const velocityNormalization = weights.reduce(
      (sum, weight, i) =>
        sum + weight * moments.velocityMoments[i * shells.length + i],
      0,
    );
    const totalNormalization = pressureNormalization + velocityNormalization;
    assert.ok(pressureNormalization >= 0 && velocityNormalization >= 0);
    const fields = bases.map((basis) => {
      const field = referenceMomentField(moments, basis, contrast);
      const rawPotential =
        contrast.pressureEnergyWeight * field.pressureEnergy -
        contrast.velocityEnergyWeight * field.velocityEnergy;
      // These are the same raw matrices, not two independently normalized
      // solves. Undefined denominators remain explicit in the report.
      const pressureNormalizedPotential =
        pressureNormalization > 0 ? rawPotential / pressureNormalization : null;
      const totalNormalizedPotential =
        totalNormalization > 0 ? rawPotential / totalNormalization : null;
      if (totalNormalization > 0)
        assert.ok(
          Math.abs(totalNormalizedPotential - field.radiationPotential) < 1e-12,
        );
      if (pressureNormalizedPotential !== null && totalNormalization > 0)
        assert.ok(
          Math.abs(
            totalNormalizedPotential -
              pressureNormalizedPotential *
                (pressureNormalization / totalNormalization),
          ) < 1e-12,
        );
      return {
        pressureEnergy: field.pressureEnergy,
        velocityEnergy: field.velocityEnergy,
        rawPotential,
        pressureNormalizedPotential,
        totalNormalizedPotential,
      };
    });
    return {
      meanPressureEnergy: pressureNormalization,
      meanVelocityEnergy: velocityNormalization,
      pressureNormalization,
      totalNormalization,
      totalToPressureNormalizedScale:
        totalNormalization > 0 && pressureNormalization > 0
          ? pressureNormalization / totalNormalization
          : null,
      fields,
    };
  }
  const observe = (tones, exposureSeconds = 0.05) =>
    referenceContinuousHarmonicResponse({
      shells,
      tones,
      timeSeconds: 1.137,
      exposureSeconds,
    });
  apparatusCases.push({ boundaryMode, shells, families, bases, summarize });
  const tones = [tone(shells[0].naturalFrequencyHz), tone(253.7, 0.13, -0.8)];
  const other = [tone(67.3, 0.2, -0.2), tone(593.1, 0.11, 1.7)];
  const mono = observe(tones);
  const channels = [
    {
      name: "duplicated-mono",
      left: tones,
      right: tones,
      independent: 1,
      downmix: 1,
    },
    {
      name: "opposite-polarity",
      left: tones,
      right: scaleTones(tones, -1),
      independent: 1,
      downmix: 0,
    },
    {
      name: "one-sided",
      left: tones,
      right: scaleTones(tones, 0),
      independent: 0.5,
      downmix: 0.25,
    },
    { name: "different-channel-content", left: tones, right: other },
    { name: "channel-swap", left: other, right: tones },
  ];
  const stereo = channels.map((fixture) => {
    const independent = meanMoments([
      observe(fixture.left),
      observe(fixture.right),
    ]);
    const downmix = observe(downmixTones(fixture.left, fixture.right));
    const checks =
      fixture.independent === undefined
        ? null
        : {
            independentMaxAbsoluteError: assertScaled(
              independent,
              mono,
              fixture.independent,
              fixture.name,
            ),
            downmixMaxAbsoluteError: assertScaled(
              downmix,
              mono,
              fixture.downmix,
              fixture.name,
            ),
          };
    return {
      name: fixture.name,
      left: fixture.left,
      right: fixture.right,
      expectedEnergyFactorsRelativeToMono: checks
        ? { independent: fixture.independent, downmix: fixture.downmix }
        : null,
      checks,
      independent: summarize(independent),
      downmix: summarize(downmix),
    };
  });
  assert.deepEqual(stereo[3].independent, stereo[4].independent);
  const normalization = [
    { name: "sub-bass", tones: [tone(20)] },
    { name: "first-resonance", tones: [tone(shells[0].naturalFrequencyHz)] },
    { name: "treble", tones: [tone(10000)] },
    { name: "close-tones", tones: [tone(119), tone(121.5, 0.2, -0.8)] },
  ].map((fixture) => ({
    ...fixture,
    exposureSeconds: 0.05,
    ...summarize(observe(fixture.tones)),
  }));
  const zero = Object.fromEntries(
    matrixKeys.map((key) => [key, new Float64Array(shells.length ** 2)]),
  );
  const silent = summarize(zero);
  assert.ok(
    silent.fields.every(
      (f) =>
        f.pressureNormalizedPotential === null &&
        f.totalNormalizedPotential === null,
    ),
  );
  // Algebraic PSD edge case, not a claim about a settled forced trajectory:
  // pressure-only normalization is undefined for a velocity-only matrix.
  const velocityOnly = summarize({
    pressureMoments: zero.pressureMoments,
    velocityMoments: mono.velocityMoments,
  });
  assert.ok(velocityOnly.totalNormalization > 0);
  assert.ok(
    velocityOnly.fields.every(
      (f) =>
        f.pressureNormalizedPotential === null &&
        Number.isFinite(f.totalNormalizedPotential),
    ),
  );
  results.push({
    boundaryMode,
    familyCount: families.length,
    shellCount: shells.length,
    stereo,
    normalization,
    edgeCases: { silent, velocityOnly },
  });
}

// Characterize the existing observer separately from acoustic normalization.
// This scalar control holds a valid unit gradient, raw energy and target
// distance constant. It is not a measured whole-volume settling time.
const observerEnergyResponse = [0, 1e-6, 1e-4, 4e-4, 1e-3, 0.01, 0.08, 1].map(
  (rawEnergy) => {
    const { fixedStepSeconds, geometryExposureSeconds } =
      CYMATIC_OBSERVER_REFERENCE;
    const compressedEnergy = compressCymaticObserverEnergy(rawEnergy);
    const support = deriveCymaticObserverSurfaceSupport({
      localEnergy: compressedEnergy,
      topologyGradientNormalized: [1, 0, 0],
    });
    const assimilation = deriveCymaticObserverGeometryAssimilation(
      deriveCymaticObserverBlend(fixedStepSeconds, geometryExposureSeconds),
      support,
    );
    const logarithm = Math.log1p(-assimilation);
    const timeConstantSeconds =
      assimilation > 0 ? -fixedStepSeconds / logarithm : null;
    const fractionOfDistanceStepAfterOneSecond = -Math.expm1(
      logarithm / fixedStepSeconds,
    );
    assert(Number.isFinite(fractionOfDistanceStepAfterOneSecond));
    assert(fractionOfDistanceStepAfterOneSecond >= 0);
    assert(fractionOfDistanceStepAfterOneSecond < 1);
    assert(rawEnergy > 0 || assimilation === 0);
    return {
      rawEnergy,
      compressedEnergy,
      support,
      assimilation,
      declaredGeometryExposureSeconds: geometryExposureSeconds,
      timeConstantSeconds,
      fractionOfDistanceStepAfterOneSecond,
    };
  },
);
assert(
  observerEnergyResponse
    .slice(1)
    .every(
      (value, i, values) =>
        i === 0 ||
        value.timeConstantSeconds < values[i - 1].timeConstantSeconds,
    ),
);

function compareVectors(actual, expected, name) {
  assert.equal(actual.length, expected.length, name);
  const absoluteRms = Math.sqrt(
    actual.reduce((sum, x, i) => sum + (x - expected[i]) ** 2, 0) /
      actual.length,
  );
  const referenceRms = Math.sqrt(
    expected.reduce((sum, x) => sum + x * x, 0) / expected.length,
  );
  assert(
    Number.isFinite(absoluteRms) && absoluteRms <= 1e-12 + 1e-9 * referenceRms,
    `${name}: ${absoluteRms}`,
  );
  return { absoluteRms, referenceRms };
}

// Fixed-duration zero-extended comparison, not a live end/flush operation.
// Prepared intervals are copied once; delay only governs their availability.
function prepare(channels, sampleRate, nonlinear) {
  const cavityAcousticScale = {
    ...CAVITY_ACOUSTIC_DEFAULTS,
    incidentPeakPressurePascalAtFullScale: nonlinear
      ? CAVITY_ACOUSTIC_DEFAULTS.incidentPeakPressurePascalAtFullScale
      : 0,
  };
  const state = createStreamingAcousticDrive({
    channelCount: channels.length,
    sampleRate,
    cavityAcousticScale,
  });
  const prepared = channels.map((c) => new Float64Array(c.length));
  let end = 0;
  const consume = (block, interval) => {
    assert.equal(interval.startFrame, end);
    block.forEach((c, a) => prepared[a].set(c, end));
    end += interval.frameCount;
  };
  for (let start = 0; start < channels[0].length; start += 137)
    state.process(
      channels.map((c) => c.subarray(start, start + 137)),
      consume,
    );
  state.process(
    channels.map(() => new Float64Array(state.read().delayFrames)),
    consume,
  );
  assert.equal(end, channels[0].length);
  return {
    prepared,
    cavityAcousticScale,
    delayFrames: state.read().delayFrames,
  };
}
function solve(prepared, sampleRate, apparatus, exposureSeconds = 0.05) {
  const state = createBroadbandModalResponse({
    sampleRate,
    channelCount: prepared.length,
    shells: apparatus.shells,
    exposureSeconds,
  });
  state.advance(prepared);
  return state.read();
}
const pcmHashes = (channels) =>
  channels.map((c) => hash(new Uint8Array(c.buffer)));
const rms = (values) =>
  Math.sqrt(values.reduce((sum, x) => sum + x * x, 0) / values.length);
const compactEnergy = (apparatus, state) => {
  const summary = apparatus.summarize(state);
  return {
    pressure: summary.meanPressureEnergy,
    velocity: summary.meanVelocityEnergy,
    total: summary.totalNormalization,
  };
};

// Preparation is common to both boundary settings. Its reference uses direct
// DFT/convolution and offline overlap-add, not candidate streaming helpers.
const nonlinearStereo = [];
for (const sampleRate of [44100, 48000]) {
  const length = 4096,
    sourceLength = 1025;
  const left = Float64Array.from({ length }, (_, n) =>
    n >= sourceLength
      ? 0
      : 0.42 * Math.sin((2 * Math.PI * 281.25 * n) / sampleRate + 0.3) +
        0.12 * Math.cos((2 * Math.PI * 1500 * n) / sampleRate),
  );
  const right = Float64Array.from({ length }, (_, n) =>
    n >= sourceLength
      ? 0
      : 0.24 * Math.sin((2 * Math.PI * 417.3 * n) / sampleRate - 0.7) +
        (n === 777 ? 0.15 : 0),
  );
  const zero = new Float64Array(length);
  const fixtures = [
    { name: "mono", channels: [left] },
    { name: "duplicated-mono", channels: [left, left] },
    { name: "one-sided", channels: [left, zero] },
    { name: "opposite-polarity", channels: [left, left.map((x) => -x)] },
    { name: "different-channels", channels: [left, right] },
    { name: "channel-swap", channels: [right, left] },
  ];
  const prepared = new Map(
    fixtures.map((f) => [f.name, prepare(f.channels, sampleRate, true)]),
  );
  const referenceChecks = {};
  for (const name of ["mono", "opposite-polarity", "different-channels"]) {
    const fixture = fixtures.find((f) => f.name === name);
    const actual = prepared.get(name);
    const reference = referenceStreamingAcousticDrive(fixture.channels, {
      sampleRate,
      cavityAcousticScale: actual.cavityAcousticScale,
    });
    referenceChecks[name] = actual.prepared.map((c, a) =>
      compareVectors(c, reference.prepared[a], `${sampleRate}-${name}-${a}`),
    );
  }
  const mono = prepared.get("mono").prepared[0];
  for (const c of prepared.get("duplicated-mono").prepared)
    compareVectors(c, mono, "duplicated preparation");
  compareVectors(
    prepared.get("one-sided").prepared[0],
    mono,
    "one-sided preparation",
  );
  assert(prepared.get("one-sided").prepared[1].every((x) => x === 0));
  prepared
    .get("channel-swap")
    .prepared.forEach((c, a) =>
      compareVectors(
        c,
        prepared.get("different-channels").prepared[1 - a],
        "swap preparation",
      ),
    );
  const observations = [];
  for (const apparatus of apparatusCases) {
    const responses = new Map(
      fixtures.map((f) => [
        f.name,
        solve(prepared.get(f.name).prepared, sampleRate, apparatus),
      ]),
    );
    assertScaled(
      responses.get("duplicated-mono"),
      responses.get("mono"),
      1,
      "nonlinear duplicated mono",
    );
    assertScaled(
      responses.get("one-sided"),
      responses.get("mono"),
      0.5,
      "nonlinear one-sided",
    );
    assertScaled(
      responses.get("channel-swap"),
      responses.get("different-channels"),
      1,
      "nonlinear swap",
    );
    for (const fixture of fixtures) {
      if (fixture.channels.length === 1) continue;
      const downmixedInput = fixture.channels[0].map(
        (x, n) => (x + fixture.channels[1][n]) / 2,
      );
      const before = prepare([downmixedInput], sampleRate, true);
      const channels = prepared.get(fixture.name).prepared;
      const middle = channels[0].map((x, n) => (x + channels[1][n]) / 2);
      const side = channels[0].map((x, n) => (x - channels[1][n]) / 2);
      const midResponse = solve([middle], sampleRate, apparatus);
      const sideResponse = solve([side], sampleRate, apparatus);
      const independent = responses.get(fixture.name);
      const identityError = assertScaled(
        independent,
        {
          pressureMoments: midResponse.pressureMoments.map(
            (x, i) => x + sideResponse.pressureMoments[i],
          ),
          velocityMoments: midResponse.velocityMoments.map(
            (x, i) => x + sideResponse.velocityMoments[i],
          ),
        },
        1,
        "prepared mid/side quadratic identity",
      );
      const downmixed = solve(before.prepared, sampleRate, apparatus);
      const record = {
        boundaryMode: apparatus.boundaryMode,
        name: fixture.name,
        inputPcmSha256: pcmHashes(fixture.channels),
        preparedPcmSha256: pcmHashes(channels),
        preparedRms: channels.map(rms),
        independent: compactEnergy(apparatus, independent),
        downmixBeforePreparation: compactEnergy(apparatus, downmixed),
        middleAfterPreparation: compactEnergy(apparatus, midResponse),
        sideAfterPreparation: compactEnergy(apparatus, sideResponse),
        midSideIdentityMaxAbsoluteError: identityError,
      };
      if (fixture.name === "opposite-polarity") {
        assert.equal(record.downmixBeforePreparation.total, 0);
        assert(record.independent.total > 0);
        assert(
          record.middleAfterPreparation.total > 0,
          "quadratic correction disappeared from opposite-polarity pair",
        );
      }
      observations.push(record);
    }
  }
  nonlinearStereo.push({
    sampleRate,
    sourceLength,
    comparisonFrames: length,
    delayFrames: prepared.get("mono").delayFrames,
    scope:
      "Shared-gain nonlinear/DC preparation; fixed zero-extended horizon. No complete acoustic ring-down or visual acceptance claim.",
    referenceChecks,
    observations,
  });
}

function circularEvidence(support, sampleRate, frameSize, power = 1) {
  const raw = [0, 0, 0, 0, 0];
  for (let b = 1; b < support.length; b++) {
    const theta = 2 * Math.PI * Math.log2((b * sampleRate) / frameSize / 440);
    const value = support[b] ** power;
    [
      1,
      Math.cos(theta),
      Math.sin(theta),
      Math.cos(2 * theta),
      Math.sin(2 * theta),
    ].forEach((weight, k) => {
      raw[k] += value * weight;
    });
  }
  const normalized =
    raw[0] > 0 ? raw.slice(1).map((x) => x / raw[0]) : [0, 0, 0, 0];
  assert(Math.hypot(...normalized.slice(0, 2)) <= 1 + 1e-12);
  assert(Math.hypot(...normalized.slice(2)) <= 1 + 1e-12);
  return { raw, normalized };
}
let noiseState = 0x1907;
const noise = () => {
  noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
  return noiseState / 2 ** 32 - 0.5;
};
const spectralRate = 48000,
  spectralLength = 4096;
const spectralFixtures = [
  {
    name: "off-bin-tone",
    channels: [
      Float64Array.from(
        { length: spectralLength },
        (_, n) => 0.4 * Math.cos((2 * Math.PI * 123.45 * n) / spectralRate),
      ),
    ],
  },
  {
    name: "256-tones",
    channels: [
      Float64Array.from({ length: spectralLength }, (_, n) =>
        Array.from(
          { length: 256 },
          (_, i) =>
            (0.4 / 256) *
            Math.cos(
              (2 * Math.PI * (20 + (18000 * i) / 255) * n) / spectralRate +
                i * 0.371,
            ),
        ).reduce((a, b) => a + b, 0),
      ),
    ],
  },
  {
    name: "decorrelated-noise",
    channels: [0, 1].map(() =>
      Float64Array.from({ length: spectralLength }, () => 0.4 * noise()),
    ),
  },
  {
    name: "kick-and-hat",
    channels: [
      Float64Array.from(
        { length: spectralLength },
        (_, n) =>
          0.5 *
            Math.exp(-n / 900) *
            Math.sin((2 * Math.PI * 60 * n) / spectralRate) +
          (n >= 1536 && n < 2560 ? 0.2 * noise() : 0),
      ),
    ],
  },
];
const spectralWeighting = [];
const exposureComparison = [];
for (const apparatus of apparatusCases) {
  for (const fixture of spectralFixtures) {
    const prepared = prepare(fixture.channels, spectralRate, false).prepared;
    const states = [0.02, 0.05, 0.1].map((exposureSeconds) => ({
      exposureSeconds,
      response: solve(prepared, spectralRate, apparatus, exposureSeconds),
    }));
    for (const state of states) {
      assert.deepEqual(state.response.pressure, states[0].response.pressure);
      assert.deepEqual(state.response.velocity, states[0].response.velocity);
      assert.deepEqual(state.response.spectral, states[0].response.spectral);
    }
    exposureComparison.push({
      boundaryMode: apparatus.boundaryMode,
      name: fixture.name,
      preparedPcmSha256: pcmHashes(prepared),
      comparisonFrames: spectralLength,
      observations: states.map(({ exposureSeconds, response }) => ({
        exposureSeconds,
        ...compactEnergy(apparatus, response),
        fields: [0, 220, 440].map((i) => ({
          position: positions[i],
          ...referenceMomentField(response, apparatus.bases[i], contrast),
        })),
      })),
    });
    const frame = expandBroadbandSpectralWindow(states[1].response.spectral);
    const fields = [0, 220, 440].map((i) => {
      const basis = apparatus.bases[i];
      const support = referenceSpectralSupport(frame, basis, contrast);
      assert.equal(support[0], 0);
      assert(support.every((x) => Number.isFinite(x) && x >= 0));
      const additive = circularEvidence(
        support,
        frame.sampleRate,
        frame.frameSize,
      );
      compareVectors(
        additive.raw,
        referenceSpectralField(frame, basis, contrast),
        "additive field",
      );
      return {
        position: positions[i],
        support: Array.from(support),
        additive,
        squared: circularEvidence(
          support,
          frame.sampleRate,
          frame.frameSize,
          2,
        ),
      };
    });
    spectralWeighting.push({
      boundaryMode: apparatus.boundaryMode,
      name: fixture.name,
      inputPcmSha256: pcmHashes(fixture.channels),
      preparedPcmSha256: pcmHashes(prepared),
      frameSize: frame.frameSize,
      frameEndSample: frame.frameEndSample,
      channelCount: frame.channelCount,
      fields,
    });
  }
}

// Subdivide equal-hue energy without changing its measure. This is an
// algebraic weighting control, not a claim about FFT window-length equivalence.
function subdivisionEvidence(parts, power) {
  const entries = [
    ...Array.from({ length: parts }, () => ({ support: 1 / parts, phase: 0 })),
    { support: 0.5, phase: Math.PI / 2 },
  ];
  const total = entries.reduce((sum, e) => sum + e.support ** power, 0);
  return [1, 2].flatMap((harmonic) => [
    entries.reduce(
      (sum, e) => sum + e.support ** power * Math.cos(harmonic * e.phase),
      0,
    ) / total,
    entries.reduce(
      (sum, e) => sum + e.support ** power * Math.sin(harmonic * e.phase),
      0,
    ) / total,
  ]);
}
const subdivision = { additive: [], squared: [] };
for (const parts of [1, 2, 16, 64]) {
  const additive = subdivisionEvidence(parts, 1);
  compareVectors(additive, subdivisionEvidence(1, 1), "additive subdivision");
  subdivision.additive.push({ parts, normalized: additive });
  subdivision.squared.push({
    parts,
    normalized: subdivisionEvidence(parts, 2),
  });
}
assert(
  Math.abs(
    subdivision.squared[0].normalized[0] - subdivision.squared[3].normalized[0],
  ) > 0.5,
);
const exposureKernel = [0.02, 0.05, 0.1].map((seconds) => ({
  seconds,
  step10Seconds: -Math.log(0.9) * seconds,
  step90Seconds: Math.log(10) * seconds,
  beatResponse: [0.5, 2, 5, 10, 20, 40].map((hz) => ({
    hz,
    amplitude: 1 / Math.hypot(1, 2 * Math.PI * hz * seconds),
    phaseRadians: -Math.atan(2 * Math.PI * hz * seconds),
  })),
}));

const sourcePaths = [
  "packages/engine/scripts/verifyBroadbandObservationAttribution.mjs",
  "packages/engine/src/testing/broadbandModalReference.js",
  "packages/engine/src/testing/broadbandHarmonicReference.js",
  "packages/engine/src/core/raymarch/fieldObservation.js",
  "packages/engine/src/core/raymarch/cymaticObserverReference.js",
  "packages/engine/src/core/raymarch/cymaticObserverNode.js",
  "packages/engine/src/core/raymarch/fieldCacheBake.js",
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
  "packages/engine/src/utils/audio/streamingAcousticDrive.js",
  "packages/engine/src/utils/audio/waterAcousticNonlinearity.js",
  "packages/engine/src/testing/streamingAcousticReference.js",
  "packages/engine/src/utils/audio/broadbandModalResponse.js",
  "packages/engine/src/utils/audio/modalResponseMoments.js",
  "packages/engine/src/utils/audio/broadbandResponseSpectrum.js",
  "packages/engine/src/testing/broadbandSpectralWindowReference.js",
  "packages/engine/src/testing/broadbandSpectralReference.js",
  "packages/engine/src/core/audio/fft.js",
  "packages/engine/src/core/audio/fftSpectrum.js",
  "pnpm-lock.yaml",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (path) => [
      path,
      hash(await readFile(resolve(root, path))),
    ]),
  ),
);
const report = {
  generatedAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceHashes,
  numericalControlsPassed: true,
  scope:
    "Offline source/observation attribution: continuous settled linear controls, independently checked nonlinear stereo preparation, complete-bin color weighting and finite-record exposure comparisons. Not production render or product acceptance.",
  units:
    "Dimensionless model pressure and velocity; energies are their quadratic spatial means. Potentials use the fixed material contrast.",
  timeSeconds: 1.137,
  settledResponseHistory:
    "Tones present for all past time; no startup, DC filter, nonlinear preparation or sample hold.",
  contrast,
  positions,
  gridSize,
  results,
  observerEnergyResponse,
  nonlinearStereo,
  spectralWeighting,
  subdivision,
  exposureComparison,
  exposureKernel,
  spectralScope:
    "Same complete response-bin evidence and hue mapping; additive versus squared weighting only. This does not reproduce the old engine's source-frequency selection or its final persistent color.",
  exposureScope:
    "Finite records start from zero; changing acoustic exposure leaves pressure/velocity and color spectra identical, while raw moments change. Analytic step/beat values describe only this observation kernel, not complete visual latency.",
  remaining: [
    "musical/latency acceptance and final exposure selection",
    "full-path attribution including nonlinear stereo and spectral appearance",
    "matched production appearance and real-mix acceptance",
  ],
};
await mkdir(output, { recursive: true });
const reportPath = resolve(output, "observation-attribution-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      numericalControlsPassed: true,
      report: reportPath,
      boundaries: results.map((result) => ({
        boundaryMode: result.boundaryMode,
        normalizationScales: result.normalization.map((fixture) => ({
          name: fixture.name,
          scale: fixture.totalToPressureNormalizedScale,
        })),
      })),
    },
    null,
    2,
  ),
);
