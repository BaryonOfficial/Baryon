import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENDER_ENERGY_EPSILON,
  buildModalEnergyLedger,
  hasProjectedRenderAuthority,
  sumProjectedSlotEnergy,
} from "./modalEnergyLedger.js";

function makeSlots(entries) {
  const slots = new Float32Array(16);
  entries.forEach(([u, v, w, amplitude], index) => {
    const offset = index * 4;
    slots[offset] = u;
    slots[offset + 1] = v;
    slots[offset + 2] = w;
    slots[offset + 3] = amplitude;
  });
  return slots;
}

describe("modal energy ledger", () => {
  it("treats projected slot energy as squared amplitude", () => {
    const slots = makeSlots([
      [1, 1, 1, 0.5],
      [1, 2, 1, 0.25],
    ]);

    expect(sumProjectedSlotEnergy(slots)).toBeCloseTo(0.3125, 6);
  });

  it("publishes one render authority from projected render energy", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0,
      sourceBoundaryState: "zero",
      modalResponse: {
        modalResponseEnergy: 0.4,
        modalResponseSourceCoupledEnergy: 0.25,
        modalResponseResonantEnergy: 0.15,
      },
      candidateForcingSlots: makeSlots([[1, 1, 1, 0]]),
      candidateResponseSlots: makeSlots([[2, 3, 5, 0]]),
    });

    expect(ledger.sourceEnergy).toBe(0);
    expect(ledger.renderBoundaryState).toBe("zero");
    expect(ledger.sourceBoundaryState).toBe("zero");
    expect(ledger.storedModalEnergy).toBeCloseTo(0.4, 6);
    expect(ledger.projectedRenderEnergy).toBe(0);
    expect(ledger.renderEnergyEpsilon).toBe(DEFAULT_RENDER_ENERGY_EPSILON);
    expect(hasProjectedRenderAuthority(ledger)).toBe(false);
  });

  it("allows explicit test-tone injection without changing ledger energy", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0,
      sourceBoundaryState: "test",
      modalResponse: { modalResponseEnergy: 0 },
      candidateForcingSlots: makeSlots([]),
      candidateResponseSlots: makeSlots([]),
      injectTestTone: true,
    });

    expect(ledger.projectedRenderEnergy).toBe(0);
    expect(hasProjectedRenderAuthority(ledger)).toBe(true);
  });

  it("keeps retained modal energy diagnostic when the source boundary is muted", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0,
      sourceBoundaryState: "muted",
      modalResponse: {
        modalResponseEnergy: 0.72,
        modalResponseSourceCoupledEnergy: 0.22,
        modalResponseResonantEnergy: 0.5,
      },
      candidateForcingSlots: makeSlots([[1, 1, 1, 0.45]]),
      candidateResponseSlots: makeSlots([[2, 3, 5, 0.6]]),
    });

    expect(ledger.storedModalEnergy).toBeCloseTo(0.72, 6);
    expect(ledger.rawProjectedRenderEnergy).toBeGreaterThan(0);
    expect(ledger.projectedRenderEnergy).toBe(0);
    expect(ledger.projectedEnergyScale).toBe(0);
    expect(ledger.renderAuthority).toBe(false);
  });

  it("caps literal-zero projection by stored modal energy", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0,
      sourceBoundaryState: "zero",
      modalResponse: {
        modalResponseEnergy: 0.25,
        modalResponseSourceCoupledEnergy: 0.1,
        modalResponseResonantEnergy: 0.15,
      },
      candidateForcingSlots: makeSlots([[1, 1, 1, 0.8]]),
      candidateResponseSlots: makeSlots([[2, 3, 5, 0.8]]),
    });

    expect(ledger.rawProjectedRenderEnergy).toBe(1);
    expect(ledger.projectedRenderEnergy).toBeCloseTo(0.25, 6);
    expect(ledger.projectedEnergyScale).toBeLessThan(0.5);
    expect(
      ledger.projectedSourceCoupledEnergy + ledger.projectedResonantEnergy,
    ).toBeCloseTo(0.25, 6);
  });

  it("caps retained display cache by stored modal energy without current signal authority", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0.35,
      sourceBoundaryState: "live",
      currentSignalAmplitude: 0,
      modalResponse: {
        modalResponseEnergy: 0.02,
        modalResponseSourceCoupledEnergy: 0.02,
        modalResponseResonantEnergy: 0,
      },
      candidateForcingSlots: makeSlots([
        [1, 1, 1, 0.8],
        [2, 2, 2, 0.6],
      ]),
      candidateResponseSlots: makeSlots([[3, 3, 3, 0.5]]),
    });

    expect(ledger.rawProjectedRenderEnergy).toBeGreaterThan(0.02);
    expect(ledger.projectedRenderEnergy).toBeCloseTo(0.02, 6);
    expect(ledger.projectedEnergyScale).toBeLessThan(1);
    expect(ledger.renderAuthority).toBe(true);
  });

  it("uses an explicit modal response render cap for weak residual projection", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0.35,
      sourceBoundaryState: "live",
      currentSignalAmplitude: 0,
      modalResponse: {
        modalResponseEnergy: 1,
        modalResponseSourceCoupledEnergy: 0.8,
        modalResponseResonantEnergy: 0.2,
        modalResponseRenderCapEnergy: 0.01,
      },
      candidateForcingSlots: makeSlots([[1, 1, 1, 0.8]]),
      candidateResponseSlots: makeSlots([[3, 3, 3, 0.5]]),
    });

    expect(ledger.storedModalEnergy).toBeCloseTo(0.01, 6);
    expect(ledger.storedModalSourceCoupledEnergy).toBeCloseTo(0.008, 6);
    expect(ledger.storedModalResonantEnergy).toBeCloseTo(0.002, 6);
    expect(ledger.projectedRenderEnergy).toBeCloseTo(0.01, 6);
    expect(ledger.projectedEnergyScale).toBeLessThan(1);
  });

  it("does not cap live projection when current signal authority is present", () => {
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 0.35,
      sourceBoundaryState: "live",
      currentSignalAmplitude: 0.12,
      modalResponse: {
        modalResponseEnergy: 0.02,
        modalResponseSourceCoupledEnergy: 0.02,
        modalResponseResonantEnergy: 0,
      },
      candidateForcingSlots: makeSlots([
        [1, 1, 1, 0.8],
        [2, 2, 2, 0.6],
      ]),
      candidateResponseSlots: makeSlots([[3, 3, 3, 0.5]]),
    });

    expect(ledger.projectedRenderEnergy).toBeCloseTo(
      ledger.rawProjectedRenderEnergy,
      6,
    );
    expect(ledger.projectedRenderEnergy).toBeGreaterThan(
      ledger.storedModalEnergy,
    );
  });

  it("projects decaying slot amplitude monotonically to zero", () => {
    const energies = [0.6, 0.3, 0.1, 0].map((amplitude) => {
      return buildModalEnergyLedger({
        sourceEnergy: amplitude,
        sourceBoundaryState: amplitude > 0 ? "live" : "zero",
        modalResponse: { modalResponseEnergy: amplitude * amplitude },
        candidateForcingSlots: makeSlots([[1, 1, 1, amplitude]]),
        candidateResponseSlots: makeSlots([]),
      });
    });

    expect(energies[0].projectedRenderEnergy).toBeGreaterThan(
      energies[1].projectedRenderEnergy,
    );
    expect(energies[1].projectedRenderEnergy).toBeGreaterThan(
      energies[2].projectedRenderEnergy,
    );
    expect(energies[2].projectedRenderEnergy).toBeGreaterThan(
      energies[3].projectedRenderEnergy,
    );
    expect(energies[3].projectedRenderEnergy).toBe(0);
    expect(energies[3].renderAuthority).toBe(false);
  });

  it("clamps dense projected spectra to normalized energy", () => {
    const denseSlots = makeSlots(
      Array.from({ length: 8 }, (_, index) => [index + 1, 1, 1, 1]),
    );
    const ledger = buildModalEnergyLedger({
      sourceEnergy: 1,
      sourceBoundaryState: "live",
      modalResponse: { modalResponseEnergy: 1 },
      candidateForcingSlots: denseSlots,
      candidateResponseSlots: denseSlots,
    });

    expect(ledger.rawProjectedRenderEnergy).toBe(1);
    expect(ledger.projectedRenderEnergy).toBe(1);
    expect(ledger.renderAuthority).toBe(true);
  });
});
