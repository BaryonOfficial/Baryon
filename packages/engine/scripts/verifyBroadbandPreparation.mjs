import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { CAVITY_ACOUSTIC_DEFAULTS as apparatus } from "../src/defaults.js";
import { createWaterAcousticFrameTransform } from "../src/utils/audio/waterAcousticNonlinearity.js";
import {
  createAcousticDcBlocker,
  createStreamingAcousticDrive,
} from "../src/utils/audio/streamingAcousticDrive.js";
import { referenceStreamingAcousticDrive } from "../src/testing/streamingAcousticReference.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(process.argv[2] ?? "/tmp/baryon-broadband-preparation");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const size = 2048,
  hop = 512,
  cutoffHz = 5;
const rates = [8000, 44100, 48000, 96000, 192000];
const timeScale =
  ((1 + apparatus.equationOfStateNonlinearityBA / 2) *
    apparatus.sideLengthMeters *
    apparatus.incidentPeakPressurePascalAtFullScale) /
  (apparatus.mediumDensityKgPerM3 * apparatus.soundSpeedMetersPerSecond ** 3);
const energy = (channels) =>
  channels.reduce(
    (sum, c) => sum + c.reduce((total, x) => total + x * x, 0),
    0,
  );
function errorMetrics(actual, reference) {
  assert.equal(actual.length, reference.length);
  let difference = 0,
    norm = 0,
    peakError = 0;
  for (let n = 0; n < actual.length; n++) {
    assert.ok(Number.isFinite(actual[n]) && Number.isFinite(reference[n]));
    difference += (actual[n] - reference[n]) ** 2;
    norm += reference[n] ** 2;
    peakError = Math.max(peakError, Math.abs(actual[n] - reference[n]));
  }
  return {
    absoluteRms: Math.sqrt(difference / actual.length),
    referenceRms: Math.sqrt(norm / actual.length),
    relativeRms: norm === 0 ? null : Math.sqrt(difference / norm),
    peakError,
  };
}
function requireAgreement(metric, name, relative = 1e-10) {
  assert.ok(
    metric.absoluteRms <= 1e-9 + relative * metric.referenceRms,
    `${name}: ${JSON.stringify(metric)}`,
  );
}
function sinusoidCoefficient(samples, bin, period = samples.length) {
  let re = 0,
    im = 0;
  for (let n = 0; n < samples.length; n++) {
    const phase = (2 * Math.PI * bin * n) / period;
    re += samples[n] * Math.cos(phase);
    im -= samples[n] * Math.sin(phase);
  }
  return [(2 * re) / samples.length, (2 * im) / samples.length];
}

// Offline diagnostic inversion only. y[n]=x[n]-low[n] and
// low[n+1]=low[n]+(1-exp(-2*pi*5/fs))*y[n]. Recover raw OLA to distinguish
// frame-gain/overlap residual from the intended downstream high-pass response.
function recoverOverlap(prepared, sampleRate) {
  const fraction = -Math.expm1((-2 * Math.PI * cutoffHz) / sampleRate);
  return prepared.map((channel) => {
    let low = 0;
    return channel.map((y) => {
      const x = y + low;
      low += fraction * y;
      return x;
    });
  });
}
function prepare(channels, sampleRate, nonlinear = true, partition = 512) {
  const state = createStreamingAcousticDrive({
    sampleRate,
    channelCount: channels.length,
    cavityAcousticScale: {
      ...apparatus,
      incidentPeakPressurePascalAtFullScale: nonlinear
        ? apparatus.incidentPeakPressurePascalAtFullScale
        : 0,
    },
  });
  const delay = state.read().delayFrames;
  const result = channels.map((c) => new Float64Array(c.length));
  let cursor = 0;
  const consume = (block, interval) => {
    assert.equal(interval.startFrame, cursor);
    assert.equal(
      interval.availableAfterInputFrame,
      interval.startFrame + interval.frameCount + delay,
    );
    block.forEach((c, a) => result[a].set(c, cursor));
    cursor += interval.frameCount;
  };
  for (let start = 0; start < channels[0].length; start += partition)
    state.process(
      channels.map((c) => c.subarray(start, start + partition)),
      consume,
    );
  // This is an explicit fixed-duration comparison horizon, never a live flush.
  state.process(
    channels.map(() => new Float64Array(delay)),
    consume,
  );
  assert.equal(cursor, channels[0].length);
  assert.equal(state.read().inputFrames, cursor + delay);
  assert.equal(state.read().preparedFrames, cursor);
  return {
    prepared: result,
    overlap: recoverOverlap(result, sampleRate),
    delayFrames: delay,
  };
}

const dc = [],
  aperture = [],
  streams = [],
  origin = [];
for (const sampleRate of rates) {
  const input = Float64Array.from({ length: 2 * sampleRate }, (_, n) =>
    Math.cos((2 * Math.PI * 20 * n) / sampleRate),
  );
  const filtered = new Float64Array(input.length);
  createAcousticDcBlocker({ sampleRate, channelCount: 1 }).process(
    [input],
    [filtered],
  );
  const measured = sinusoidCoefficient(
    filtered.subarray(sampleRate),
    20,
    sampleRate,
  );
  const angle = (2 * Math.PI * 20) / sampleRate;
  const pole = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  // H(z)=(z-1)/(z-pole), evaluated independently in complex arithmetic.
  const zr = Math.cos(angle),
    zi = Math.sin(angle);
  const denominator = (zr - pole) ** 2 + zi ** 2;
  const expected = [
    ((zr - 1) * (zr - pole) + zi ** 2) / denominator,
    (zi * (1 - pole)) / denominator,
  ];
  requireAgreement(errorMetrics(measured, expected), `DC-${sampleRate}`);
  const step = new Float64Array(sampleRate).fill(1);
  const stepOutput = new Float64Array(sampleRate);
  createAcousticDcBlocker({ sampleRate, channelCount: 1 }).process(
    [step],
    [stepOutput],
  );
  const expectedStep = step.map((_, n) =>
    Math.exp((-2 * Math.PI * cutoffHz * n) / sampleRate),
  );
  requireAgreement(
    errorMetrics(stepOutput, expectedStep),
    `DC-step-${sampleRate}`,
  );
  dc.push({
    sampleRate,
    pcmSha256: hash(new Uint8Array(input.buffer)),
    measured20Hz: measured,
    expected20Hz: expected,
    gainDb: 20 * Math.log10(Math.hypot(...measured)),
    phaseDegrees: (Math.atan2(measured[1], measured[0]) * 180) / Math.PI,
    stepOnePercentSeconds: stepOutput.findIndex((x) => x <= 0.01) / sampleRate,
    nonlinearDelaySeconds: size / sampleRate,
    linearDelayFrames: 0,
    weakModelNyquistParameter: timeScale * Math.PI * sampleRate,
  });

  const transform = createWaterAcousticFrameTransform({
    sampleRate,
    cavityAcousticScale: apparatus,
    size,
  });
  for (const bins of [[100], [800], [800, 900]]) {
    const amplitudes = [0.6, 0.2];
    const input = Float64Array.from({ length: size }, (_, n) =>
      bins.reduce(
        (sum, bin, i) =>
          sum + amplitudes[i] * Math.cos((2 * Math.PI * bin * n) / size),
        0,
      ),
    );
    const raw = new Float64Array(size);
    transform.transform(input, raw);
    // Explicit products of cosines, retaining only quadratic frequencies
    // strictly below Nyquist. This oracle uses no FFT/convolution helper.
    const expected = Float64Array.from(input);
    for (let n = 0; n < size; n++) {
      for (let i = 0; i < bins.length; i++) {
        const harmonic = 2 * bins[i];
        if (harmonic < size / 2)
          expected[n] -=
            ((timeScale * amplitudes[i] ** 2 * Math.PI * bins[i] * sampleRate) /
              size) *
            Math.sin((2 * Math.PI * harmonic * n) / size);
        for (let j = i + 1; j < bins.length; j++) {
          for (const bin of [bins[i] + bins[j], Math.abs(bins[i] - bins[j])])
            if (bin > 0 && bin < size / 2)
              expected[n] -=
                ((timeScale *
                  amplitudes[i] *
                  amplitudes[j] *
                  Math.PI *
                  bin *
                  sampleRate) /
                  size) *
                Math.sin((2 * Math.PI * bin * n) / size);
        }
      }
    }
    const metric = errorMetrics(raw, expected);
    requireAgreement(metric, `aperture-${sampleRate}-${bins}`);
    const forbiddenAliasBins =
      bins.length === 2 ? [248, 348, 448] : bins[0] === 800 ? [448] : [];
    const aliases = forbiddenAliasBins.map((bin) => ({
      bin,
      amplitude: Math.hypot(...sinusoidCoefficient(raw, bin)),
    }));
    for (const alias of aliases) assert.ok(alias.amplitude < 1e-10);
    aperture.push({
      sampleRate,
      bins,
      amplitudes,
      pcmSha256: hash(new Uint8Array(input.buffer)),
      metric,
      aliases,
    });
  }

  let seed = 0x78193;
  const noise = Float64Array.from({ length: 8195 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 0.8;
  });
  const fixtures = [
    {
      name: "off-bin-stereo",
      channels: [0.6, 0.2].map((gain, a) =>
        Float64Array.from(
          { length: noise.length },
          (_, n) =>
            gain *
            (0.7 * Math.cos((2 * Math.PI * 137.3 * n) / sampleRate + a) +
              0.3 *
                Math.sin(
                  (2 * Math.PI * sampleRate * 0.341 * n) / sampleRate + 0.3 * a,
                )),
        ),
      ),
    },
    {
      name: "noise-and-quiet-noise",
      channels: [
        noise,
        noise.map((x, n) => 0.2 * noise[(n + 71) % noise.length]),
      ],
    },
    {
      name: "kick-and-hats",
      channels: [0, 1].map((a) =>
        Float64Array.from(noise, (x, n) => {
          const t = n / sampleRate;
          return (
            0.6 *
              Math.exp(-t * 25) *
              Math.sin(2 * Math.PI * (55 * t + 0.5 * (1 - Math.exp(-t * 60)))) +
            x * Math.exp(-((n + a * 17) % 1024) / 100)
          );
        }),
      ),
    },
    {
      name: "final-impulse",
      channels: [0.8, -0.3].map((amplitude) =>
        Float64Array.from({ length: noise.length }, (_, n) =>
          n === noise.length - 1 ? amplitude : 0,
        ),
      ),
    },
  ];
  for (const fixture of fixtures) {
    const horizon = fixture.channels[0].length + 4096;
    const padded = fixture.channels.map((c) => {
      const p = new Float64Array(horizon);
      p.set(c);
      return p;
    });
    const baseline = prepare(padded, sampleRate);
    const inputEnergy = energy(padded);
    streams.push({
      name: fixture.name,
      sampleRate,
      sourceFrames: fixture.channels[0].length,
      horizon,
      pcmHashes: fixture.channels.map((c) => hash(new Uint8Array(c.buffer))),
      inputEnergy,
      rawOverlapEnergy: energy(baseline.overlap),
      rawGainResidualDb:
        10 * Math.log10(energy(baseline.overlap) / inputEnergy),
      preparedEnergy: energy(baseline.prepared),
      delayFrames: baseline.delayFrames,
    });
    for (const shift of [1, 127, 255, 511]) {
      const shifted = padded.map((c) => {
        const p = new Float64Array(c.length + shift);
        p.set(c, shift);
        return p;
      });
      const shiftedResult = prepare(shifted, sampleRate);
      origin.push({
        name: fixture.name,
        sampleRate,
        shift,
        metrics: baseline.prepared.map((c, a) =>
          errorMetrics(shiftedResult.prepared[a].subarray(shift), c),
        ),
        rawGainResidualDb:
          10 * Math.log10(energy(shiftedResult.overlap) / inputEnergy),
      });
    }
    // Block partitioning must be invariant even though moving the declared
    // frame lattice relative to a signal need not be. Keep these tests separate.
    const split = prepare(padded, sampleRate, true, 73);
    for (let a = 0; a < padded.length; a++)
      requireAgreement(
        errorMetrics(split.prepared[a], baseline.prepared[a]),
        `partition-${fixture.name}-${sampleRate}`,
      );
  }
  process.stdout.write(`characterized preparation at ${sampleRate} Hz\n`);
}

// Qualify diagnostic DC inversion and complete frame gains against the existing
// independent direct-DFT/linear-convolution OLA oracle on one finite stereo record.
const referenceInput = [0.4, 0.17].map((gain, a) =>
  Float64Array.from(
    { length: 2061 },
    (_, n) => gain * (Math.cos(n * 0.37 + a) + 0.2 * Math.sin(n * 1.97)),
  ),
);
const independent = referenceStreamingAcousticDrive(referenceInput, {
  sampleRate: 48000,
  cavityAcousticScale: apparatus,
});
const candidate = prepare(referenceInput, 48000, true, 73);
const referenceMetrics = referenceInput.map((_, a) => ({
  prepared: errorMetrics(candidate.prepared[a], independent.prepared[a]),
  rawOverlap: errorMetrics(candidate.overlap[a], independent.overlapAdded[a]),
}));
for (const [a, metrics] of referenceMetrics.entries())
  for (const [quantity, metric] of Object.entries(metrics))
    requireAgreement(metric, `independent-${a}-${quantity}`);
const linear = prepare(referenceInput, 48000, false, 73);
assert.equal(linear.delayFrames, 0);
const linearExpected = referenceInput.map((c) => new Float64Array(c.length));
createAcousticDcBlocker({ sampleRate: 48000, channelCount: 2 }).process(
  referenceInput,
  linearExpected,
);
assert.deepEqual(linear.prepared, linearExpected);
const nonlinearSampleRateUpperBoundExclusiveHz = 1 / (Math.PI * timeScale);
assert.throws(
  () =>
    createStreamingAcousticDrive({
      sampleRate: nonlinearSampleRateUpperBoundExclusiveHz * 1.01,
      channelCount: 2,
      cavityAcousticScale: apparatus,
    }),
  /pre-shock weak model/,
);

const sourceFiles = [
  "packages/engine/scripts/verifyBroadbandPreparation.mjs",
  "packages/engine/src/defaults.js",
  "packages/engine/src/utils/audio/streamingAcousticDrive.js",
  "packages/engine/src/utils/audio/waterAcousticNonlinearity.js",
  "packages/engine/src/core/audio/fft.js",
  "packages/engine/src/core/audio/fftSpectrum.js",
  "packages/engine/src/testing/streamingAcousticReference.js",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (path) => [
      path,
      hash(await readFile(resolve(root, path))),
    ]),
  ),
);
const report = {
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  node: process.version,
  sourceHashes,
  apparatus,
  configuration: {
    frameSize: size,
    hopSize: hop,
    cutoffHz,
    timeScale,
    rates,
    nonlinearSampleRateUpperBoundExclusiveHz,
  },
  scope:
    "Synthetic preparation characterization; numerical agreement/partition/alias checks pass independently of product acceptance of gain, origin dependence and delay",
  dc,
  aperture,
  streams,
  origin,
  referenceMetrics,
  referencePcmHashes: referenceInput.map((c) => hash(new Uint8Array(c.buffer))),
  numericalChecksPassed: true,
  productAcceptance: "unverified",
  exclusions: [
    "Real music",
    "Perceptual tolerance for window-origin dependence and stream gain residual",
    "Physical audio/display latency",
    "Production integration",
  ],
};
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "broadband-preparation-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(`preparation characterization recorded: ${output}\n`);
