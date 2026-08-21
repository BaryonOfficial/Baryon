import { describe, expect, it } from "vitest";
import {
  MODAL_FIELD_NORMALIZATION_FLOOR,
  RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST,
  computeGorkovContrastFactors,
  deriveLiveSynthesisCancellationRatio,
  deriveNormalizedPressureRadiationFields,
  deriveStructuralProjectionDrive,
} from "./fieldObservation.js";
import { deriveModalFieldCacheTransferAmplitude } from "./fieldCachePassband.js";

function splitModalFieldSlots(modalFieldSlots) {
  const modeCount = Math.floor((modalFieldSlots?.length ?? 0) / 4);
  const modalIdentitySlots = new Float32Array(modeCount * 3);
  const modalCoefficientSlots = new Float32Array(modeCount);

  for (let slotIndex = 0; slotIndex < modeCount; slotIndex += 1) {
    const sourceOffset = slotIndex * 4;
    const identityOffset = slotIndex * 3;
    modalIdentitySlots[identityOffset] = modalFieldSlots[sourceOffset];
    modalIdentitySlots[identityOffset + 1] = modalFieldSlots[sourceOffset + 1];
    modalIdentitySlots[identityOffset + 2] = modalFieldSlots[sourceOffset + 2];
    modalCoefficientSlots[slotIndex] = modalFieldSlots[sourceOffset + 3];
  }

  return { modalIdentitySlots, modalCoefficientSlots };
}

describe("live synthesis cancellation ratio", () => {
  it("fails closed without meaningful unsigned support", () => {
    expect(deriveLiveSynthesisCancellationRatio(0, 0)).toBe(0);
    expect(
      deriveLiveSynthesisCancellationRatio(
        0,
        MODAL_FIELD_NORMALIZATION_FLOOR / 10,
      ),
    ).toBe(0);
  });

  it("reports destructive interference against supported field energy", () => {
    expect(deriveLiveSynthesisCancellationRatio(0.01, 1)).toBeCloseTo(0.99);
  });
});

describe("structural projection drive", () => {
  it("keeps equal structural energy independent of retained mode count", () => {
    const sparse = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 1])),
      activeCount: 1,
      resolution: 8,
    });
    const dense = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(
        new Float32Array([
          1, 1, 1, 0.5, 1, 2, 1, 0.5, 2, 1, 1, 0.5, 1, 1, 2, 0.5,
        ]),
      ),
      activeCount: 4,
      resolution: 8,
    });

    expect(sparse.amplitudeSum).toBeCloseTo(1, 6);
    expect(dense.amplitudeSum).toBeCloseTo(2, 6);
    expect(sparse.structuralEnergy).toBeCloseTo(1, 6);
    expect(dense.structuralEnergy).toBeCloseTo(1, 6);
    expect(dense.projectionEnergyDrive).toBeCloseTo(
      sparse.projectionEnergyDrive,
      6,
    );
    expect(sparse.structuralConcentration).toBeCloseTo(1, 6);
    expect(dense.structuralConcentration).toBeCloseTo(0.25, 6);
    expect(sparse.effectiveModeCount).toBeCloseTo(1, 6);
    expect(dense.effectiveModeCount).toBeCloseTo(4, 6);
    expect(sparse.rmsStructuralAmplitude).toBeCloseTo(1, 6);
    expect(dense.rmsStructuralAmplitude).toBeCloseTo(0.5, 6);
  });

  it("aggregates duplicate modal identities before deriving energy", () => {
    const projection = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 2, 3, 0.5, 1, 2, 3, 0.5])),
      activeCount: 2,
      resolution: 16,
    });

    expect(projection.amplitudeSum).toBeCloseTo(1, 6);
    expect(projection.structuralEnergy).toBeCloseTo(1, 6);
    expect(projection.effectiveModeCount).toBeCloseTo(1, 6);
  });

  it("reads scalar-per-mode coefficients from the live drive packet", () => {
    const projection = deriveStructuralProjectionDrive({
      modalIdentitySlots: new Float32Array([1, 2, 3, 2, 3, 4]),
      modalCoefficientSlots: new Float32Array([0.25, 0.75]),
      activeCount: 2,
    });

    expect(projection.amplitudeSum).toBeCloseTo(1, 6);
    expect(projection.structuralEnergy).toBeCloseTo(0.625, 6);
    expect(projection.effectiveModeCount).toBeCloseTo(1.6, 6);
  });

  it("preserves structural projection after the renderer boundary compiles an upstream packet", () => {
    const compiledPacket = splitModalFieldSlots(
      new Float32Array([1, 2, 3, 0.25, 1, 2, 3, 0.5, 2, 3, 4, 0.75]),
    );
    const compiledProjection = deriveStructuralProjectionDrive({
      ...compiledPacket,
      activeCount: 3,
    });

    expect(compiledProjection.amplitudeSum).toBeCloseTo(1.5, 6);
    expect(compiledProjection.structuralEnergy).toBeCloseTo(1.125, 6);
    expect(compiledProjection.effectiveModeCount).toBeCloseTo(2, 6);
  });

  it("raises projection drive with energy without replacing it by concentration", () => {
    const quiet = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 0.25, 1, 2, 1, 0.25])),
      activeCount: 2,
      resolution: 8,
    });
    const loud = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 0.5, 1, 2, 1, 0.5])),
      activeCount: 2,
      resolution: 8,
    });

    expect(loud.structuralEnergy).toBeGreaterThan(quiet.structuralEnergy);
    expect(loud.projectionEnergyDrive).toBeGreaterThan(
      quiet.projectionEnergyDrive,
    );
    expect(loud.structuralConcentration).toBeCloseTo(
      quiet.structuralConcentration,
      6,
    );
    expect(quiet.effectiveModeCount).toBeCloseTo(2, 6);
    expect(loud.effectiveModeCount).toBeCloseTo(2, 6);
  });

  it("keeps every admitted mode in direct analytic projection authority", () => {
    const projection = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 0.5, 9, 1, 1, 1])),
      activeCount: 2,
    });

    expect(projection.amplitudeSum).toBeCloseTo(1.5, 6);
    expect(projection.structuralEnergy).toBeCloseTo(1.25, 6);
    expect(projection.effectiveModeCount).toBeCloseTo(1.8, 6);
    expect(projection.structuralConcentration).toBeCloseTo(5 / 9, 6);
  });

  it("keeps quiet coherent modes visible above numerical energy epsilon", () => {
    const projection = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 0.006])),
      activeCount: 1,
      resolution: 8,
    });

    expect(projection.structuralEnergy).toBeLessThan(0.0001);
    expect(projection.projectionEnergyDrive).toBeGreaterThan(0.003);
    expect(projection.structuralConcentration).toBeCloseTo(1, 6);
    expect(projection.effectiveModeCount).toBeCloseTo(1, 6);
  });

  it("derives energy-weighted RMS spatial wavenumber for all admitted modes", () => {
    const single = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 1])),
      activeCount: 1,
      resolution: 8,
    });
    const weighted = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 0, 0, 1, 3, 4, 0, 1])),
      activeCount: 2,
      resolution: 32,
    });
    const highOrder = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 0.5, 9, 0, 0, 1])),
      activeCount: 2,
    });
    const empty = deriveStructuralProjectionDrive({
      modalIdentitySlots: null,
      modalCoefficientSlots: null,
      activeCount: 0,
      resolution: 8,
    });

    expect(single.rmsSpatialWavenumber).toBeCloseTo(Math.sqrt(3), 6);
    expect(weighted.rmsSpatialWavenumber).toBeCloseTo(Math.sqrt(13), 5);
    expect(highOrder.structuralEnergy).toBeCloseTo(1.25, 6);
    expect(highOrder.rmsSpatialWavenumber).toBeCloseTo(
      Math.sqrt((0.25 * 3 + 81) / 1.25),
      5,
    );
    expect(empty.rmsSpatialWavenumber).toBe(0);
  });

  it("derives cached spectral statistics from per-mode passband transfer", () => {
    const lowWavenumber = Math.sqrt(3);
    const highWavenumber = 14;
    const highTransfer = deriveModalFieldCacheTransferAmplitude(highWavenumber);
    const projection = deriveStructuralProjectionDrive({
      ...splitModalFieldSlots(new Float32Array([1, 1, 1, 1, 0, 0, 14, 1])),
      activeCount: 2,
      resolution: 64,
    });
    const expectedObservedEnergy = 1 + highTransfer ** 2;

    expect(projection.rmsSpatialWavenumber).toBeCloseTo(
      Math.sqrt((lowWavenumber ** 2 + highWavenumber ** 2) / 2),
      6,
    );
    expect(projection.observedStructuralEnergy).toBeCloseTo(
      expectedObservedEnergy,
      6,
    );
    expect(projection.observedRmsSpatialWavenumber).toBeCloseTo(
      Math.sqrt(
        (lowWavenumber ** 2 + highTransfer ** 2 * highWavenumber ** 2) /
          expectedObservedEnergy,
      ),
      6,
    );
    expect(projection.observedRmsSpatialWavenumber).toBeLessThan(
      projection.rmsSpatialWavenumber,
    );
    expect(projection.resolvedObservationEnergyFraction).toBeCloseTo(
      expectedObservedEnergy / 2,
      6,
    );
  });
});

describe("normalized pressure and radiation potential", () => {
  it("fails closed until a material contrast is available", () => {
    expect(
      deriveNormalizedPressureRadiationFields({
        normalizedPressure: 0.8,
        velocityX: 0.2,
        velocityY: 0.1,
        velocityZ: 0,
      }),
    ).toMatchObject({
      normalizedPressure: 0.8,
      normalizedRadiationPotential: 0,
      radiationPotentialReady: false,
      radiationMaterialContrastSemantic: "unavailable-no-material-contrast",
    });
  });

  it("derives Gor'kov contrast weights from the named tracer material properties", () => {
    const contrast = computeGorkovContrastFactors();
    // Alpha quartz in 20 C water, using the aggregate adiabatic bulk modulus
    // rather than the longitudinal solid-wave speed.
    expect(contrast.monopole).toBeCloseTo(0.9421688042, 9);
    expect(contrast.dipole).toBeCloseTo(0.5243088656, 9);
    expect(
      RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.pressureEnergyWeight,
    ).toBeCloseTo(contrast.monopole / 3, 12);
    expect(
      RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.velocityEnergyWeight,
    ).toBeCloseTo(contrast.dipole / 2, 12);
  });
});
