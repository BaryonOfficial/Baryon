import { describe, expect, it } from "vitest";
import {
  normalizeReferenceCoefficients,
  referenceModalTransfer,
  referenceRadiationPotential,
  referenceSteadyModalResponse,
} from "./polyphonicModalReference.js";
import { buildModalExcitationAtlas } from "../utils/audio/modalExcitationAtlas.js";
import { evaluateHarmonicRadiationReference } from "./harmonicRadiationReference.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "../core/raymarch/fieldObservation.js";

const modes = buildModalExcitationAtlas({ radius: 3 }).slice(0, 3);
const tones = [
  { frequencyHz: 93.75, amplitude: 0.4, phaseRad: 0.31 },
  { frequencyHz: 140.625, amplitude: 0.2, phaseRad: -0.8 },
];

describe("independent polyphonic modal reference", () => {
  it("satisfies the forced second-order oscillator equation", () => {
    for (const driveHz of [73, 118.4, 164, 490]) {
      const naturalHz = 118.4;
      const quality = 15.45;
      const wn = 2 * Math.PI * naturalHz;
      const w = 2 * Math.PI * driveHz;
      const { real, imaginary } = referenceModalTransfer(
        naturalHz,
        quality,
        driveHz,
      );
      // q(t) = Re[G exp(i*w*t)], force = wn^2/Q*cos(w*t).
      for (const time of [0, 0.0031, 0.027]) {
        const q = real * Math.cos(w * time) - imaginary * Math.sin(w * time);
        const dq =
          -w * (real * Math.sin(w * time) + imaginary * Math.cos(w * time));
        const ddq = -w * w * q;
        const residual =
          (ddq + (wn / quality) * dq + wn * wn * q) / ((wn * wn) / quality);
        expect(residual).toBeCloseTo(Math.cos(w * time), 11);
      }
    }
  });

  it("has unit response and a quarter-cycle lag at resonance", () => {
    expect(referenceModalTransfer(118.4, 15.45, 118.4)).toEqual({
      real: 0,
      imaginary: -1,
    });
  });

  it("cancels equal-frequency opposite amplitudes before squaring", () => {
    const term = {
      ...modes[0],
      responseFrequencyHz: 100,
      coefficientRe: 0.4,
      coefficientIm: 0.2,
    };
    const opposite = { ...term, coefficientRe: -0.4, coefficientIm: -0.2 };
    const result = referenceRadiationPotential(
      [term, opposite],
      [0.2, -0.3, 0.4],
      contrast,
    );
    expect(result.pressureEnergy).toBe(0);
    expect(result.velocityEnergy).toBe(0);
    expect(result.gradient).toEqual([0, 0, 0]);
  });

  it("adds unequal-frequency energies regardless of relative source phase", () => {
    const original = referenceSteadyModalResponse(modes, tones).terms;
    const shifted = referenceSteadyModalResponse(
      modes,
      tones.map((tone, index) => ({
        ...tone,
        phaseRad: tone.phaseRad + index * 1.7,
      })),
    ).terms;
    const a = referenceRadiationPotential(original, [0.2, -0.3, 0.4], contrast);
    const b = referenceRadiationPotential(shifted, [0.2, -0.3, 0.4], contrast);
    expect(a.radiationPotential).toBeCloseTo(b.radiationPotential, 12);
    expect(a.pressureEnergy).toBeCloseTo(b.pressureEnergy, 12);
    expect(a.velocityEnergy).toBeCloseTo(b.velocityEnergy, 12);
  });

  it("adds both frequency groups without normalizing each group separately", () => {
    const terms = referenceSteadyModalResponse(modes, tones).terms;
    const position = [0.2, -0.3, 0.4];
    const combined = referenceRadiationPotential(terms, position, contrast);
    const groups = tones.map((tone) =>
      referenceRadiationPotential(
        terms.filter((term) => term.responseFrequencyHz === tone.frequencyHz),
        position,
        contrast,
      ),
    );
    for (const name of [
      "pressureEnergy",
      "velocityEnergy",
      "radiationPotential",
    ]) {
      expect(combined[name]).toBeCloseTo(
        groups.reduce((sum, group) => sum + group[name], 0),
        12,
      );
    }
    for (const group of groups) {
      expect(group.pressureEnergy + group.velocityEnergy).toBeGreaterThan(0);
    }
  });

  it("normalizes pressure coefficients with a single common scale", () => {
    const terms = [
      { coefficientRe: 3, coefficientIm: 4 },
      { coefficientRe: 0, coefficientIm: 12 },
    ];
    expect(normalizeReferenceCoefficients(terms)).toEqual([
      { coefficientRe: 3 / 13, coefficientIm: 4 / 13 },
      { coefficientRe: 0, coefficientIm: 12 / 13 },
    ]);
  });

  it("matches an independent finite-difference potential gradient", () => {
    const terms = referenceSteadyModalResponse(modes, tones).terms;
    const position = [0.17, -0.41, 0.63];
    const result = referenceRadiationPotential(terms, position, contrast);
    // Fourth-order differencing keeps truncation below the fixed gradient
    // tolerance as the apparatus frequencies change, without tiny-step loss.
    const h = 1e-4;
    for (let axis = 0; axis < 3; axis += 1) {
      const lo = [...position];
      const hi = [...position];
      const lo2 = [...position];
      const hi2 = [...position];
      lo[axis] -= h;
      hi[axis] += h;
      lo2[axis] -= 2 * h;
      hi2[axis] += 2 * h;
      const numerical =
        (referenceRadiationPotential(terms, lo2, contrast).radiationPotential -
          8 *
            referenceRadiationPotential(terms, lo, contrast)
              .radiationPotential +
          8 *
            referenceRadiationPotential(terms, hi, contrast)
              .radiationPotential -
          referenceRadiationPotential(terms, hi2, contrast)
            .radiationPotential) /
        (12 * h);
      expect(result.gradient[axis]).toBeCloseTo(numerical, 8);
    }
  });

  it("agrees with the production evaluator when every frequency is preserved", () => {
    const terms = referenceSteadyModalResponse(modes, tones).terms;
    for (const position of [
      [0.17, -0.41, 0.63],
      [-0.8, 0.22, 0.11],
      [0, 0, 0],
      [1, -1, 1],
    ]) {
      const expected = referenceRadiationPotential(terms, position, contrast);
      const actual = evaluateHarmonicRadiationReference({
        modes: terms,
        x: position[0],
        y: position[1],
        z: position[2],
      });
      expect(actual.pressureEnergy).toBeCloseTo(expected.pressureEnergy, 11);
      expect(actual.velocityEnergy).toBeCloseTo(expected.velocityEnergy, 11);
      expect(actual.radiationPotential).toBeCloseTo(
        expected.radiationPotential,
        11,
      );
      for (let axis = 0; axis < 3; axis += 1) {
        expect(actual.gradient[axis]).toBeCloseTo(expected.gradient[axis], 11);
      }
    }
  });
});
