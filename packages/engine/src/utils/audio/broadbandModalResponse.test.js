import { describe, expect, it } from "vitest";
import { createBroadbandModalResponse } from "./broadbandModalResponse.js";
import { createBroadbandReference } from "../../testing/broadbandModalReference.js";

const sampleRate = 48000;
const shells = [
  { naturalFrequencyHz: 118.4, qualityFactor: 0.5 },
  { naturalFrequencyHz: 167.44, qualityFactor: 0.500001 },
  { naturalFrequencyHz: 1110.69, qualityFactor: 30 },
];
function error(actual, expected) {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < actual.length; i++) {
    numerator += (actual[i] - expected[i]) ** 2;
    denominator += expected[i] ** 2;
  }
  return Math.sqrt(numerator / Math.max(denominator, 1e-30));
}
function fixture(count) {
  return Float64Array.from(
    { length: count },
    (_, n) =>
      0.3 * Math.sin(n * 0.017) +
      0.2 * Math.cos(n * 0.127) +
      (n % 41 === 0 ? 0.15 : 0),
  );
}

describe("broadband pressure/velocity integration", () => {
  it.each([0.5, 0.500001, 15, 1000])(
    "never adds stored energy during free decay at Q=%s",
    (qualityFactor) => {
      const response = createBroadbandModalResponse({
        sampleRate,
        shells: [{ naturalFrequencyHz: 118.4, qualityFactor }],
      });
      const initial = response.read();
      expect(
        [...initial.pressureMoments, ...initial.velocityMoments].every(
          (value) => value === 0,
        ),
      ).toBe(true);
      response.advance([Float64Array.of(0.3)]);
      const energy = () => {
        const { pressure, velocity } = response.read();
        return (pressure[0] ** 2 + velocity[0] ** 2) / 2;
      };
      let previous = energy();
      const silence = new Float64Array(128);
      for (let i = 0; i < 64; i++) {
        response.advance([silence]);
        const next = energy();
        expect(next).toBeLessThanOrEqual(previous * (1 + 1e-12));
        previous = next;
      }
      const observation = response.read();
      expect(
        observation.pressureMoments[0] + observation.velocityMoments[0],
      ).toBeGreaterThan(0);
    },
  );
  it.each([1, 1 - 1e-10, 1 + 1e-10])(
    "preserves history when loss and observation rates coincide (factor=%s)",
    (factor) => {
      const exposureSeconds = 0.05;
      const naturalFrequencyHz = 118.4;
      const options = {
        shells: [
          {
            naturalFrequencyHz,
            qualityFactor:
              2 * Math.PI * naturalFrequencyHz * exposureSeconds * factor,
          },
          {
            naturalFrequencyHz: 118.4001,
            qualityFactor: 2 * Math.PI * 118.4001 * exposureSeconds,
          },
        ],
        sampleRate,
        exposureSeconds,
      };
      const response = createBroadbandModalResponse(options);
      const oracle = createBroadbandReference({ ...options, substeps: 16 });
      for (const samples of [
        fixture(512),
        new Float64Array(512),
        fixture(512),
      ]) {
        response.advance([samples]);
        oracle.advance([samples]);
        for (const key of ["pressureMoments", "velocityMoments"]) {
          expect(error(response.read()[key], oracle.read()[key])).toBeLessThan(
            1e-7,
          );
        }
      }
    },
  );
  it("matches an independently refined solver for transient state and all interference moments", () => {
    const channels = [fixture(2048), fixture(2048).reverse()];
    const options = { shells, sampleRate, channelCount: 2 };
    const response = createBroadbandModalResponse(options);
    const coarse = createBroadbandReference({ ...options, substeps: 8 });
    const fine = createBroadbandReference({ ...options, substeps: 16 });
    response.advance(channels);
    coarse.advance(channels);
    fine.advance(channels);
    for (const key of [
      "pressure",
      "velocity",
      "pressureMoments",
      "velocityMoments",
    ]) {
      expect(error(coarse.read()[key], fine.read()[key])).toBeLessThan(1e-8);
      expect(error(response.read()[key], fine.read()[key])).toBeLessThan(1e-8);
    }
  });

  it("integrates high-frequency quadratic evidence inside each sample instead of sampling it once", () => {
    const options = {
      shells: [{ naturalFrequencyHz: 21600, qualityFactor: 0.5 }],
      sampleRate,
    };
    const samples = fixture(80);
    const response = createBroadbandModalResponse(options);
    const reference = createBroadbandReference({ ...options, substeps: 256 });
    response.advance([samples]);
    reference.advance([samples]);
    for (const key of [
      "pressure",
      "velocity",
      "pressureMoments",
      "velocityMoments",
    ]) {
      expect(error(response.read()[key], reference.read()[key])).toBeLessThan(
        1e-7,
      );
    }
  });

  it("is partition independent and admits 256 tones without source slots", () => {
    const samples = Float64Array.from({ length: 1537 }, (_, n) => {
      let sum = 0;
      for (let t = 1; t <= 256; t++) sum += Math.sin(n * t * 0.001) / 256;
      return sum;
    });
    const one = createBroadbandModalResponse({ shells, sampleRate });
    const many = createBroadbandModalResponse({ shells, sampleRate });
    one.advance([samples]);
    for (let n = 0; n < samples.length; n += 73) {
      many.advance([samples.subarray(n, n + 73)]);
      many.read();
    }
    expect(many.read()).toEqual(one.read());
    expect(one.read().pressureMoments[0]).toBeGreaterThan(0);
  });

  it("preserves raw level scaling, silence decay and positive semidefinite moments", () => {
    const a = createBroadbandModalResponse({ shells, sampleRate });
    const b = createBroadbandModalResponse({ shells, sampleRate });
    const samples = fixture(1024);
    a.advance([samples]);
    b.advance([samples.map((v) => 3 * v)]);
    for (const key of ["pressureMoments", "velocityMoments"]) {
      expect(
        error(
          b.read()[key],
          a.read()[key].map((v) => 9 * v),
        ),
      ).toBeLessThan(1e-12);
      const matrix = a.read()[key];
      for (const vector of [
        [1, -1, 0],
        [0.3, 0.2, -0.9],
        [1, 1, 1],
      ]) {
        let energy = 0;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++)
            energy += vector[i] * matrix[i * 3 + j] * vector[j];
        }
        expect(energy).toBeGreaterThanOrEqual(0);
      }
    }
    const before = a.read();
    a.advance([new Float64Array(512)]);
    const after = a.read();
    expect(Math.hypot(...after.pressure, ...after.velocity)).toBeLessThan(
      Math.hypot(...before.pressure, ...before.velocity),
    );
  });
});
