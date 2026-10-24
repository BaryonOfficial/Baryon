import { describe, expect, it } from "vitest";
import { createBroadbandCosineProjection } from "../core/raymarch/broadbandCosineProjection.js";
import {
  referenceBroadbandBasis,
  referenceMomentField,
} from "./broadbandModalReference.js";

const families = [
  { u: 0, v: 0, w: 2, shellIndex: 0, sourceAmplitudeOverlap: -0.25 },
  { u: 0, v: 2, w: 2, shellIndex: 1, sourceAmplitudeOverlap: 0.4 },
  { u: 2, v: 2, w: 2, shellIndex: 2, sourceAmplitudeOverlap: -0.2 },
  { u: 0, v: 0, w: 6, shellIndex: 3, sourceAmplitudeOverlap: 0.3 },
  { u: 2, v: 4, w: 4, shellIndex: 3, sourceAmplitudeOverlap: -0.17 },
];
const count = 4;
const contrast = { pressureEnergyWeight: 0.7, velocityEnergyWeight: 0.3 };
const dirichletFamilies = [
  { u: 1, v: 1, w: 1, shellIndex: 0, sourceAmplitudeOverlap: -0.25 },
  { u: 1, v: 1, w: 3, shellIndex: 1, sourceAmplitudeOverlap: 0.4 },
  { u: 1, v: 3, w: 3, shellIndex: 2, sourceAmplitudeOverlap: -0.2 },
  { u: 1, v: 1, w: 7, shellIndex: 3, sourceAmplitudeOverlap: 0.3 },
  { u: 1, v: 5, w: 5, shellIndex: 3, sourceAmplitudeOverlap: -0.17 },
];

describe("exact spatial cosine projection", () => {
  it.each([
    { boundaryMode: "neumann", families },
    { boundaryMode: "dirichlet", families: dirichletFamilies },
  ])(
    "$boundaryMode retains signed cross terms, degenerate families, gradients and normalization",
    ({ boundaryMode, families }) => {
      const map = createBroadbandCosineProjection({
        families,
        shellCount: count,
        boundaryMode,
      });
      // Signed symmetric matrices also exercise indefinite color moments.
      const observation = {
        pressureMoments: Float64Array.from(
          { length: count * count },
          (_, n) =>
            Math.cos(Math.floor(n / count) + (n % count)) +
            (Math.floor(n / count) === n % count ? 2 : 0),
        ),
        velocityMoments: Float64Array.from(
          { length: count * count },
          (_, n) =>
            Math.sin(Math.floor(n / count) + (n % count)) +
            (Math.floor(n / count) === n % count ? 2 : 0),
        ),
      };
      const p = new Float64Array(map.width ** 3),
        v = p.slice();
      for (let q = 0; q < p.length; q++)
        for (let t = map.offsets[q]; t < map.offsets[q + 1]; t++) {
          const [i, j, wp, wv] = map.entries.slice(4 * t, 4 * t + 4);
          p[q] += wp * observation.pressureMoments[i * count + j];
          v[q] += wv * observation.velocityMoments[i * count + j];
        }
      const norm = map.normalizationWeights.reduce(
        (s, w, i) =>
          s +
          w *
            (observation.pressureMoments[i * count + i] +
              observation.velocityMoments[i * count + i]),
        0,
      );
      for (const position of [
        [-1, -1, -1],
        [0, 0, 0],
        [1, 1, 1],
        [0.17, -0.41, 0.63],
        [-0.91, 0.93, 0.1],
        [1.1, -1.1, 0.3],
      ]) {
        const expected = referenceMomentField(
          observation,
          referenceBroadbandBasis(families, position, count, boundaryMode),
          contrast,
        );
        const actual = [0, 0],
          gradient = [0, 0, 0];
        for (let z = 0; z < map.width; z++)
          for (let y = 0; y < map.width; y++)
            for (let x = 0; x < map.width; x++) {
              const q = [x, y, z],
                index = x + map.width * (y + map.width * z);
              const basis = q.map((n, a) =>
                Math.cos(n * Math.PI * (position[a] + 1)),
              );
              const product = basis[0] * basis[1] * basis[2];
              actual[0] += p[index] * product;
              actual[1] += v[index] * product;
              for (let a = 0; a < 3; a++) {
                let derivative =
                  -q[a] *
                  Math.PI *
                  Math.sin(q[a] * Math.PI * (position[a] + 1));
                for (let b = 0; b < 3; b++) if (b !== a) derivative *= basis[b];
                gradient[a] +=
                  ((contrast.pressureEnergyWeight * p[index] -
                    contrast.velocityEnergyWeight * v[index]) *
                    derivative) /
                  norm;
              }
            }
        expect(actual[0]).toBeCloseTo(expected.pressureEnergy, 11);
        expect(actual[1]).toBeCloseTo(expected.velocityEnergy, 11);
        expect(norm).toBeCloseTo(expected.normalizationEnergy, 14);
        gradient.forEach((value, a) =>
          expect(value).toBeCloseTo(expected.gradient[a], 10),
        );
      }
    },
  );
  it("rejects incompatible symmetry and duplicate family identities", () => {
    expect(() =>
      createBroadbandCosineProjection({
        families: [{ ...families[0], w: 1 }],
        shellCount: count,
      }),
    ).toThrow(/even/);
    expect(() =>
      createBroadbandCosineProjection({
        families: [families[0], families[0]],
        shellCount: count,
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      createBroadbandCosineProjection({
        families: [{ ...dirichletFamilies[0], w: 2 }],
        shellCount: count,
        boundaryMode: "dirichlet",
      }),
    ).toThrow(/odd/);
    expect(() =>
      createBroadbandCosineProjection({
        families,
        shellCount: count,
        boundaryMode: "unknown",
      }),
    ).toThrow(/boundary/);
  });
});
