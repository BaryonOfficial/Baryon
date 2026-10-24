import { describe, expect, it } from "vitest";
import {
  createBroadbandReference,
  referenceBroadbandTransfer,
  referenceMomentField,
  referenceBroadbandBasis,
} from "./broadbandModalReference.js";

const sampleRate = 48000;
const shells = [
  { naturalFrequencyHz: 118.4, qualityFactor: 15.45 },
  { naturalFrequencyHz: 167.44, qualityFactor: 21.5 },
];
const probe = {
  pressure: [0.8, -0.3],
  velocity: [
    [0.2, 0.7],
    [-0.4, 0.1],
    [0.6, -0.2],
  ],
};
const contrast = { pressureEnergyWeight: 0.7, velocityEnergyWeight: 0.3 };
function signal(count, shift = 0) {
  return Float64Array.from(
    { length: count },
    (_, n) =>
      0.3 * Math.cos((2 * Math.PI * 93.75 * (n + shift)) / sampleRate) +
      0.2 * Math.sin((2 * Math.PI * 140.625 * (n + shift)) / sampleRate),
  );
}
function relativeError(a, b) {
  let error = 0;
  let scale = 0;
  for (let i = 0; i < a.length; i++) {
    error += (a[i] - b[i]) ** 2;
    scale += b[i] ** 2;
  }
  return Math.sqrt(error / Math.max(scale, 1e-30));
}
function run(substeps, channels = [signal(2048)]) {
  const reference = createBroadbandReference({
    shells,
    sampleRate,
    channelCount: channels.length,
    substeps,
    probes: [probe],
  });
  reference.advance(channels);
  return reference.read();
}

describe("independent broadband modal reference", () => {
  it("obeys Dirichlet walls, the analytic (1,1,1) shape, and unit mean-square norms", () => {
    const families = [
      { u: 1, v: 1, w: 1, shellIndex: 0, sourceAmplitudeOverlap: 1 },
      { u: 1, v: 1, w: 3, shellIndex: 1, sourceAmplitudeOverlap: 1 },
      { u: 1, v: 3, w: 5, shellIndex: 2, sourceAmplitudeOverlap: 1 },
    ];
    const position = [0.17, -0.41, 0.63];
    const basis = referenceBroadbandBasis(families, position, 3, "dirichlet");
    const cosine = position.map((x) => Math.cos((Math.PI * x) / 2));
    expect(basis.pressure[0]).toBeCloseTo(
      2 * Math.SQRT2 * cosine.reduce((a, b) => a * b),
      14,
    );
    for (let axis = 0; axis < 3; axis++) {
      const derivative =
        -Math.SQRT2 *
        Math.PI *
        Math.sin((Math.PI * position[axis]) / 2) *
        cosine.reduce((value, c, i) => (i === axis ? value : value * c), 1);
      expect(basis.pressureGradient[axis][0]).toBeCloseTo(derivative, 14);
      for (const wall of [-1, 1]) {
        const point = [...position];
        point[axis] = wall;
        const boundary = referenceBroadbandBasis(
          families,
          point,
          3,
          "dirichlet",
        );
        for (let m = 0; m < 3; m++) {
          expect(boundary.pressure[m]).toBeCloseTo(0, 13);
          for (let tangent = 0; tangent < 3; tangent++)
            if (tangent !== axis)
              expect(boundary.velocity[tangent][m]).toBeCloseTo(0, 13);
        }
      }
    }
    // Midpoint cubature resolves these finite trigonometric products exactly.
    // This checks the actual volume norm, independently of stored trace weights.
    const pressure = new Float64Array(9),
      velocity = new Float64Array(9);
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 16; y++)
        for (let z = 0; z < 16; z++) {
          const sample = referenceBroadbandBasis(
            families,
            [x, y, z].map((n) => (n + 0.5) / 8 - 1),
            3,
            "dirichlet",
          );
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++) {
              pressure[i * 3 + j] +=
                (sample.pressure[i] * sample.pressure[j]) / 4096;
              for (let a = 0; a < 3; a++)
                velocity[i * 3 + j] +=
                  (sample.velocity[a][i] * sample.velocity[a][j]) / 4096;
            }
        }
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        expect(pressure[i * 3 + j]).toBeCloseTo(i === j ? 1 : 0, 12);
        expect(velocity[i * 3 + j]).toBeCloseTo(i === j ? 1 : 0, 12);
      }
  });

  it("projects signed family overlap once and differentiates the normalized field", () => {
    const families = [
      { u: 0, v: 0, w: 2, shellIndex: 0, sourceAmplitudeOverlap: -0.25 },
      { u: 0, v: 2, w: 2, shellIndex: 1, sourceAmplitudeOverlap: 0.4 },
    ];
    const state = run(8);
    const position = [0.17, -0.41, 0.63];
    const basis = referenceBroadbandBasis(families, position, 2);
    const field = referenceMomentField(state, basis, contrast);
    expect(field.normalizationEnergy).toBeCloseTo(
      0.25 ** 2 * (state.pressureMoments[0] + state.velocityMoments[0]) +
        0.4 ** 2 * (state.pressureMoments[3] + state.velocityMoments[3]),
      14,
    );
    for (let axis = 0; axis < 3; axis++) {
      const lo = [...position];
      const hi = [...position];
      lo[axis] -= 1e-5;
      hi[axis] += 1e-5;
      const evaluate = (p) =>
        referenceMomentField(
          state,
          referenceBroadbandBasis(families, p, 2),
          contrast,
        ).radiationPotential;
      expect(field.gradient[axis]).toBeCloseTo(
        (evaluate(hi) - evaluate(lo)) / 2e-5,
        8,
      );
    }
  });

  it("shares a degenerate shell without erasing spatial interference or changing the norm", () => {
    const families = [
      { u: 0, v: 0, w: 3, shellIndex: 0, sourceAmplitudeOverlap: -0.3 },
      { u: 1, v: 2, w: 2, shellIndex: 0, sourceAmplitudeOverlap: 0.4 },
    ];
    const position = [0.2, -0.4, 0.5];
    const folded = referenceBroadbandBasis(families, position, 1);
    const expanded = referenceBroadbandBasis(
      families.map((family, i) => ({ ...family, shellIndex: i })),
      position,
      2,
    );
    const a = referenceMomentField(
      {
        pressureMoments: new Float64Array([2]),
        velocityMoments: new Float64Array([3]),
      },
      folded,
      contrast,
    );
    const b = referenceMomentField(
      {
        pressureMoments: new Float64Array(4).fill(2),
        velocityMoments: new Float64Array(4).fill(3),
      },
      expanded,
      contrast,
    );
    expect(a.radiationPotential).toBeCloseTo(b.radiationPotential, 13);
    expect(a.normalizationEnergy).toBeCloseTo(5 * (0.3 ** 2 + 0.4 ** 2), 13);
    for (let axis = 0; axis < 3; axis++)
      expect(a.gradient[axis]).toBeCloseTo(b.gradient[axis], 13);
    const wall = referenceBroadbandBasis(families, [1, -0.4, 0.5], 1);
    expect(wall.velocity[0][0]).toBeCloseTo(0, 13);
  });
  it("satisfies both frequency-domain pressure/velocity equations", () => {
    for (const frequencyHz of [20, 118.4, 333, 20000]) {
      const omega = 2 * Math.PI * frequencyHz;
      const natural = 2 * Math.PI * shells[0].naturalFrequencyHz;
      const damping = natural / shells[0].qualityFactor;
      const { pressure: p, velocity: r } = referenceBroadbandTransfer(
        shells[0],
        frequencyHz,
      );
      expect(
        damping * p.real - omega * p.imaginary + natural * r.real,
      ).toBeCloseTo(damping, 10);
      expect(
        damping * p.imaginary + omega * p.real + natural * r.imaginary,
      ).toBeCloseTo(0, 10);
      expect(-omega * r.imaginary).toBeCloseTo(natural * p.real, 10);
      expect(omega * r.real).toBeCloseTo(natural * p.imaginary, 10);
    }
    expect(referenceBroadbandTransfer(shells[0], 118.4).pressure).toEqual({
      real: 1,
      imaginary: 0,
    });
  });

  it("converges twice and directly verifies moment-based field observation", () => {
    const a = run(2);
    const b = run(4);
    const c = run(8);
    for (const key of [
      "pressure",
      "velocity",
      "pressureMoments",
      "velocityMoments",
    ]) {
      expect(relativeError(a[key], b[key])).toBeLessThan(1e-8);
      expect(relativeError(b[key], c[key])).toBeLessThan(1e-8);
    }
    const field = referenceMomentField(c, probe, contrast);
    expect(field.pressureEnergy).toBeCloseTo(c.probePressureEnergy[0], 13);
    expect(field.velocityEnergy).toBeCloseTo(c.probeVelocityEnergy[0], 13);
    expect(Math.abs(c.pressureMoments[1])).toBeGreaterThan(1e-5);
  });

  it("is independent of delivery partitions and reads never advance state", () => {
    const samples = signal(1024);
    const reference = createBroadbandReference({ shells, sampleRate });
    for (const [start, end] of [
      [0, 64],
      [64, 192],
      [192, 705],
      [705, 1024],
    ]) {
      reference.advance([samples.subarray(start, end)]);
      reference.read();
    }
    const whole = createBroadbandReference({ shells, sampleRate });
    whole.advance([samples]);
    expect(reference.read()).toEqual(whole.read());
    const snapshot = reference.read();
    snapshot.pressure.fill(100);
    expect(reference.read()).toEqual(whole.read());
  });

  it("obeys the declared stereo ensemble identities without downmix cancellation", () => {
    const x = signal(1024);
    const mono = run(4, [x]);
    const duplicate = run(4, [x, x]);
    const opposite = run(4, [x, x.map((v) => -v)]);
    const oneSided = run(4, [x, new Float64Array(x.length)]);
    const swapped = run(4, [new Float64Array(x.length), x]);
    for (const key of ["pressureMoments", "velocityMoments"]) {
      expect(relativeError(duplicate[key], mono[key])).toBeLessThan(1e-13);
      expect(relativeError(opposite[key], mono[key])).toBeLessThan(1e-13);
      expect(
        relativeError(
          oneSided[key],
          mono[key].map((v) => v / 2),
        ),
      ).toBeLessThan(1e-13);
      expect(oneSided[key]).toEqual(swapped[key]);
    }
  });

  it.each([0.5, 0.500001, 15.45, 1000])(
    "cannot inject energy during free decay at Q=%s",
    (qualityFactor) => {
      const ref = createBroadbandReference({
        shells: [{ ...shells[0], qualityFactor }],
        sampleRate,
        initialPressure: [0.3],
        initialVelocity: [-0.7],
      });
      let previousEnergy = (0.3 ** 2 + 0.7 ** 2) / 2;
      for (let block = 0; block < 40; block++) {
        ref.advance([new Float64Array(64)]);
        const state = ref.read();
        const energy = (state.pressure[0] ** 2 + state.velocity[0] ** 2) / 2;
        expect(energy).toBeLessThanOrEqual(previousEnergy + 1e-14);
        previousEnergy = energy;
      }
    },
  );

  it("starts with zero observation history and retains motion after input stops", () => {
    const ref = createBroadbandReference({ shells, sampleRate });
    expect(ref.read().pressureMoments.every((v) => v === 0)).toBe(true);
    ref.advance([signal(512)]);
    ref.advance([new Float64Array(512)]);
    const state = ref.read();
    expect(state.pressureMoments[0]).toBeGreaterThan(0);
    expect(Math.hypot(...state.pressure, ...state.velocity)).toBeGreaterThan(0);
  });

  it("rejects invalid input atomically instead of poisoning retained state", () => {
    const ref = createBroadbandReference({ shells, sampleRate });
    const before = ref.read();
    expect(() => ref.advance([new Float64Array([1, NaN])])).toThrow();
    expect(ref.read()).toEqual(before);
    expect(() => createBroadbandReference({ shells, sampleRate: 0 })).toThrow();
    expect(() =>
      createBroadbandReference({
        shells: [{ naturalFrequencyHz: 100, qualityFactor: 0.49 }],
        sampleRate,
      }),
    ).toThrow();
  });
});
