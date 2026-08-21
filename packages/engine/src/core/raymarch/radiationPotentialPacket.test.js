import { describe, expect, it } from "vitest";
import {
  RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY,
  RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
  prepareRadiationPotentialStaticPacket,
  writeRadiationPotentialDriveFrame,
  writeRadiationPotentialPacket,
} from "./radiationPotentialPacket.js";

function writePacket(amplitudes, modeSlots = null, phases = null) {
  const target = new Float32Array(
    amplitudes.length * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
  );
  const imaginaryTarget = new Float32Array(target.length);
  const diagnostics = writeRadiationPotentialPacket({
    target,
    imaginaryTarget,
    amplitudes,
    phases,
    modeSlots,
    boundaryMode: "neumann",
    activeCount: amplitudes.length,
  });
  return {
    target,
    coefficients: Array.from(
      { length: amplitudes.length },
      (_, index) =>
        target[index * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE],
    ),
    imaginaryCoefficients: Array.from(
      { length: amplitudes.length },
      (_, index) =>
        imaginaryTarget[index * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE],
    ),
    diagnostics,
  };
}

describe("water radiation-potential packet", () => {
  it("publishes signed quadratures whose squares sum to represented energy", () => {
    const packet = writePacket([0.25, -0.75]);

    expect(packet.coefficients[0]).toBeCloseTo(0.31622776, 6);
    expect(packet.coefficients[1]).toBeCloseTo(-0.9486833, 6);
    expect(packet.diagnostics.normalizedEnergySum).toBeCloseTo(1, 12);
  });

  it("packs signed complex coefficients without letting phase change energy", () => {
    const packet = writePacket([1, 1], null, [0, Math.PI / 2]);

    expect(packet.coefficients[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(packet.coefficients[1]).toBeCloseTo(0, 6);
    expect(packet.imaginaryCoefficients[0]).toBeCloseTo(0, 6);
    expect(packet.imaginaryCoefficients[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(packet.diagnostics.normalizedEnergySum).toBeCloseTo(1, 12);
  });

  it("separates common acoustic amplitude from normalized topology", () => {
    const base = writePacket([0.2, 0.8]);
    const scaled = writePacket([2, 8]);

    expect(scaled.coefficients).toEqual(base.coefficients);
    expect(scaled.diagnostics.exposureDrive).toBeGreaterThan(
      base.diagnostics.exposureDrive,
    );
    expect(scaled.diagnostics.observedCoefficientNorm).toBeCloseTo(
      base.diagnostics.observedCoefficientNorm * 10,
      6,
    );
  });

  it("makes a crossing a continuous convex energy transfer", () => {
    const before = writePacket([1, 0.99]);
    const after = writePacket([0.99, 1]);

    expect(
      Math.max(
        ...before.coefficients.map((coefficient, index) =>
          Math.abs(coefficient - after.coefficients[index]),
        ),
      ),
    ).toBeLessThan(0.01);
  });

  it("packs the family scalars beside each energy coefficient", () => {
    const packet = writePacket(
      [1, 0.5],
      new Float32Array([0, 2, 4, 1, 2, 4, 6, 1]),
    );
    for (const slotIndex of [0, 1]) {
      expect(packet.target[slotIndex * 4 + 1]).toBeGreaterThan(0);
      expect([0, 1]).toContain(packet.target[slotIndex * 4 + 2]);
      expect([0, 1]).toContain(packet.target[slotIndex * 4 + 3]);
    }
  });

  it("compresses common exposure without inventing an energy floor", () => {
    const observedEnergy = 0.000128;
    const packet = writePacket([Math.sqrt(observedEnergy)]);

    expect(RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY).toBe(5e-4);
    expect(packet.diagnostics.exposureDrive ** 2).toBeCloseTo(
      observedEnergy /
        (observedEnergy + RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY),
      12,
    );
    expect(packet.coefficients).toEqual([1]);
  });

  it("preserves the exact packet when static basis and drive updates are split", () => {
    const amplitudes = new Float32Array([0.25, -0.75]);
    const phases = new Float32Array([Math.PI / 4, -Math.PI / 3]);
    const modeSlots = new Float32Array([0, 2, 4, 1, 2, 4, 6, 1]);
    const joinedTarget = new Float32Array(8);
    const joinedImaginaryTarget = new Float32Array(8);
    const splitTarget = new Float32Array(8);
    const splitImaginaryTarget = new Float32Array(8);

    const joinedDiagnostics = writeRadiationPotentialPacket({
      target: joinedTarget,
      imaginaryTarget: joinedImaginaryTarget,
      amplitudes,
      phases,
      modeSlots,
      boundaryMode: "neumann",
      activeCount: 2,
    });
    prepareRadiationPotentialStaticPacket({
      target: splitTarget,
      modeSlots,
      boundaryMode: "neumann",
      activeCount: 2,
    });
    const { changed, ...splitDiagnostics } = writeRadiationPotentialDriveFrame({
      target: splitTarget,
      imaginaryTarget: splitImaginaryTarget,
      amplitudes,
      phases,
      activeCount: 2,
    });

    expect(changed).toBe(true);
    expect(splitTarget).toEqual(joinedTarget);
    expect(splitImaginaryTarget).toEqual(joinedImaginaryTarget);
    expect(splitDiagnostics).toEqual(joinedDiagnostics);
  });
});
