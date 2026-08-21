import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODAL_SOURCE_PROFILE,
  computeRectangularModalSourceCoupling,
} from "./modalSourceCoupling.js";

// The basis is unit mean square, so a mode the contact fully resolves couples
// at 1.
const UNATTENUATED = 1;

const withWidth = (standardDeviationNormalized) => ({
  ...DEFAULT_MODAL_SOURCE_PROFILE,
  standardDeviationNormalized,
});

const energyOf = (u, v, w, sourceProfile = DEFAULT_MODAL_SOURCE_PROFILE) =>
  computeRectangularModalSourceCoupling({ u, v, w, sourceProfile })
    .couplingEnergy;

describe("rectangular modal source coupling", () => {
  it("applies the exact centered rigid-wall parity selection rule", () => {
    for (const supported of [
      [0, 0, 2],
      [0, 2, 4],
      [2, 4, 6],
      [8, 8, 8],
    ]) {
      expect(energyOf(...supported)).toBeGreaterThan(0);
    }
    for (const rejected of [
      [0, 0, 1],
      [0, 2, 3],
      [1, 2, 4],
      [2, 5, 8],
    ]) {
      const coupling = computeRectangularModalSourceCoupling({
        u: rejected[0],
        v: rejected[1],
        w: rejected[2],
        boundaryMode: "neumann",
      });
      expect(coupling.generalizedForce).toBe(0);
      expect(coupling.couplingEnergy).toBe(0);
      expect(coupling.sourceSupported).toBe(false);
    }
  });

  it("retains the coherent permutation-family generalized force", () => {
    const forceOf = (u, v, w) =>
      Math.abs(
        computeRectangularModalSourceCoupling({ u, v, w })
          .generalizedForce,
      );
    const axial = forceOf(0, 0, 2);
    const repeated = forceOf(0, 2, 2);
    const distinct = forceOf(2, 4, 6);

    expect(repeated).toBeGreaterThan(axial);
    expect(distinct).toBeGreaterThan(repeated);
  });

  it("attenuates equal centered-family forcing by mode magnitude", () => {
    const closedFormRatio = (leftMagnitude, rightMagnitude, sigma) =>
      Math.exp(
        -(((sigma * Math.PI) / 2) ** 2) *
          (leftMagnitude ** 2 - rightMagnitude ** 2),
      );
    for (const sigma of [0.001, 0.02, 0.2]) {
      const low = energyOf(2, 4, 6, withWidth(sigma));
      const high = energyOf(4, 6, 8, withWidth(sigma));
      expect(high / low).toBeCloseTo(
        closedFormRatio(Math.sqrt(116), Math.sqrt(56), sigma),
        12,
      );
    }
  });

  it("makes finite source width attenuate unresolved high-order structure", () => {
    const lowOrder = energyOf(2, 2, 2, withWidth(0.2));
    const highOrder = energyOf(10, 10, 10, withWidth(0.2));

    // A source far wider than the mode's own structure barely touches the
    // fundamental and effectively erases the tenth order.
    expect(lowOrder).toBeGreaterThan(UNATTENUATED * 0.01);
    expect(highOrder).toBeLessThan(lowOrder * 1e-6);
  });

  it("stays monotone in mode magnitude within one family class and in width", () => {
    let previousByOrder = Number.POSITIVE_INFINITY;
    for (const order of [2, 4, 8, 16, 32]) {
      const energy = energyOf(order, order + 2, order + 4, withWidth(0.05));
      expect(energy).toBeLessThan(previousByOrder);
      previousByOrder = energy;
    }

    let previousByWidth = Number.POSITIVE_INFINITY;
    for (const sigma of [0.001, 0.01, 0.05, 0.1, 0.2]) {
      const energy = energyOf(2, 4, 6, withWidth(sigma));
      expect(energy).toBeLessThan(previousByWidth);
      previousByWidth = energy;
    }
  });

  // The declared source is finite so the model stays physical, but resolved-band
  // washout belongs to the observation model. At the default footprint the
  // apparatus must therefore be indistinguishable from a point drive even for
  // high-order structure.
  it("keeps source extent separate from resolved-band optical filtering", () => {
    expect(DEFAULT_MODAL_SOURCE_PROFILE.standardDeviationNormalized).toBe(
      0.001,
    );

    for (const mode of [
      [2, 2, 4],
      [10, 10, 10],
      [0, 12, 14],
    ]) {
      expect(energyOf(...mode)).toBeGreaterThan(0);
      expect(energyOf(...mode, withWidth(0.2))).toBeLessThan(
        energyOf(...mode),
      );
    }
  });

  it("exposes a non-negative amplitude whose square is the energy", () => {
    for (const mode of [
      [2, 2, 2],
      [0, 4, 8],
      [12, 12, 12],
    ]) {
      const { couplingAmplitude, couplingEnergy } =
        computeRectangularModalSourceCoupling({
          u: mode[0],
          v: mode[1],
          w: mode[2],
          sourceProfile: withWidth(0.1),
        });
      expect(couplingAmplitude).toBeGreaterThanOrEqual(0);
      expect(couplingAmplitude ** 2).toBeCloseTo(couplingEnergy, 12);
    }
  });

  it("rejects source profiles it cannot interpret", () => {
    expect(() =>
      computeRectangularModalSourceCoupling({
        u: 1,
        v: 1,
        w: 1,
        sourceProfile: { kind: "point", normalization: "unit-integral" },
      }),
    ).toThrow(TypeError);
    expect(() =>
      computeRectangularModalSourceCoupling({
        u: 1,
        v: 1,
        w: 1,
        sourceProfile: withWidth(0),
      }),
    ).toThrow(TypeError);
    expect(() =>
      computeRectangularModalSourceCoupling({
        u: 2,
        v: 4,
        w: 6,
        sourceProfile: {
          ...DEFAULT_MODAL_SOURCE_PROFILE,
          centerNormalized: [0.1, 0, 0],
        },
      }),
    ).toThrow(TypeError);
  });
});
