import { describe, expect, it } from "vitest";
import { buildCanonicalFullModalDescriptor } from "./modalDescriptor.js";

function makeSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([u, v, w, amplitude], index) => {
    const offset = index * 4;
    slots[offset] = u;
    slots[offset + 1] = v;
    slots[offset + 2] = w;
    slots[offset + 3] = amplitude;
  });
  return slots;
}

function makeMetadataSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(
    (
      [naturalFrequencyHz, qualityFactor, dampingRatio, observedSupport],
      index,
    ) => {
      const offset = index * 4;
      slots[offset] = naturalFrequencyHz;
      slots[offset + 1] = qualityFactor;
      slots[offset + 2] = dampingRatio;
      slots[offset + 3] = observedSupport;
    },
  );
  return slots;
}

function makeColorSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([r, g, b, weight], index) => {
    const offset = index * 4;
    slots[offset] = r;
    slots[offset + 1] = g;
    slots[offset + 2] = b;
    slots[offset + 3] = weight;
  });
  return slots;
}

function makePackedSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([x, y, z, w], index) => {
    const offset = index * 4;
    slots[offset] = x;
    slots[offset + 1] = y;
    slots[offset + 2] = z;
    slots[offset + 3] = w;
  });
  return slots;
}

function readModeKeys(slots, count) {
  const keys = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    keys.push(`${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`);
  }
  return keys;
}

describe("buildCanonicalFullModalDescriptor", () => {
  it("shares descriptor capacity across one canonical modal field", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [3, 2, 5, 0.34],
        [4, 3, 6, 0.22],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [440, 8, 1 / 16, 0.7],
        [880, 22, 1 / 44, 0.4],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.fieldAuthority).toBe("complete");
    expect(descriptor.capacity.maxTotalModes).toBe(2);
    expect(descriptor.counts.validModeCount).toBe(2);
    expect(descriptor.counts.modalFieldModeCount).toBe(2);
    expect(descriptor.diagnostics.descriptorOverflow).toBe(false);
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(true);
    expect(readModeKeys(descriptor.slotViews.modalFieldSlots, 2)).toEqual([
      "3:2:5",
      "4:3:6",
    ]);
    const metadata = descriptor.slotViews.modalFieldMetadataSlots;
    expect(metadata[0]).toBeCloseTo(440, 6);
    expect(metadata[1]).toBeCloseTo(8, 6);
    expect(metadata[2]).toBeCloseTo(1 / 16, 6);
    expect(metadata[3]).toBeCloseTo(0.7, 6);
    expect(metadata[4]).toBeCloseTo(880, 6);
    expect(metadata[5]).toBeCloseTo(22, 6);
    expect(metadata[6]).toBeCloseTo(1 / 44, 6);
    expect(metadata[7]).toBeCloseTo(0.4, 6);
    expect(descriptor.slotViews).not.toHaveProperty("modalFieldRoleSlots");
    expect(descriptor.diagnostics).not.toHaveProperty("roleHistogram");
  });

  it("keeps field slots independent from metadata when final coefficients are equal", () => {
    const lowFrequency = buildCanonicalFullModalDescriptor({
      maxTotalModes: 1,
      modalFieldSlots: makeSlots([[2, 2, 4, 0.5]]),
      modalFieldMetadataSlots: makeMetadataSlots([[220, 6, 1 / 12, 0.8]]),
      activeModalFieldModeCount: 1,
    });
    const highFrequency = buildCanonicalFullModalDescriptor({
      maxTotalModes: 1,
      modalFieldSlots: makeSlots([[2, 2, 4, 0.5]]),
      modalFieldMetadataSlots: makeMetadataSlots([[1760, 28, 1 / 56, 0.8]]),
      activeModalFieldModeCount: 1,
    });

    expect(Array.from(lowFrequency.slotViews.modalFieldSlots)).toEqual(
      Array.from(highFrequency.slotViews.modalFieldSlots),
    );
    expect(lowFrequency.slotViews).not.toHaveProperty("modalFieldRoleSlots");
    expect(highFrequency.slotViews).not.toHaveProperty("modalFieldRoleSlots");
  });

  it("records overflow count, rejected energy, and rejection reasons", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.25],
        [3, 3, 3, 0.15],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [110, 5, 0.1, 0.9],
        [220, 10, 0.05, 0.7],
        [330, 20, 0.025, 0.2],
      ]),
      activeModalFieldModeCount: 3,
    });

    expect(descriptor.fieldAuthority).toBe("blocked");
    expect(descriptor.diagnostics.descriptorOverflow).toBe(true);
    expect(descriptor.counts.overflowModeCount).toBe(1);
    expect(descriptor.diagnostics.rejectedModalEnergy).toBeCloseTo(
      0.15 ** 2,
      4,
    );
    expect(descriptor.diagnostics.rejectionReasons).toEqual({
      descriptorCapacity: 1,
    });
    expect(descriptor.diagnostics.descriptorRejectedModalEnergy).toBeCloseTo(
      0.15 ** 2,
      4,
    );
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(false);
  });

  it("reports basis-atlas capacity rejection separately from descriptor overflow", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 16,
      basisAtlasPageCapacity: 2,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.5],
        [3, 3, 3, 0.4],
      ]),
      activeModalFieldModeCount: 3,
    });

    expect(descriptor.fieldAuthority).toBe("complete");
    expect(descriptor.diagnostics.descriptorOverflow).toBe(false);
    expect(descriptor.diagnostics.basisAtlasCapacityRejectedCount).toBe(1);
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(false);
    expect(descriptor.diagnostics.rejectionReasons).toEqual({
      basisAtlasCapacity: 1,
    });
    expect(descriptor.diagnostics.basisAtlasRejectedModalEnergy).toBeCloseTo(
      0.4 ** 2,
      4,
    );
    expect(descriptor.diagnostics.modalVarietyAudit).toMatchObject({
      semanticModeCount: 3,
      representedBasisPageModeCount: 2,
      basisAtlasPageCapacity: 2,
      basisAtlasPressure: 1,
      spatialFamilyCount: 3,
      representedSpatialFamilyCount: 2,
      descriptorRejectedModeCount: 0,
      basisAtlasCapacityRejectedCount: 1,
      spatialBandwidthRejectedCount: 0,
    });
    expect(
      descriptor.diagnostics.modalVarietyAudit.renderRepresentedEnergyRatio,
    ).toBeCloseTo((0.6 ** 2 + 0.5 ** 2) / (0.6 ** 2 + 0.5 ** 2 + 0.4 ** 2), 6);
    expect(
      descriptor.diagnostics.modalVarietyAudit.energyEffectiveModeCount,
    ).toBeCloseTo(
      (0.6 ** 2 + 0.5 ** 2 + 0.4 ** 2) ** 2 / (0.6 ** 4 + 0.5 ** 4 + 0.4 ** 4),
      6,
    );
    expect(
      descriptor.diagnostics.modalVarietyAudit.basisAtlasCapacitySweep,
    ).toEqual([
      expect.objectContaining({
        basisAtlasPageCapacity: 2,
        representedBasisPageModeCount: 2,
      }),
      expect.objectContaining({
        basisAtlasPageCapacity: 3,
        representedBasisPageModeCount: 3,
        renderRepresentedEnergyRatio: 1,
      }),
    ]);
  });

  it("preserves continuity order when atlas pages are saturated", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 8,
      basisAtlasPageCapacity: 4,
      basisCacheResolution: 64,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.95],
        [1, 1, 2, 0.9],
        [1, 2, 1, 0.88],
        [2, 1, 1, 0.86],
        [5, 4, 3, 0.5],
        [9, 4, 2, 0.48],
        [12, 2, 1, 0.46],
        [14, 3, 2, 0.44],
      ]),
      activeModalFieldModeCount: 8,
    });

    expect(readModeKeys(descriptor.slotViews.modalFieldSlots, 4)).toEqual([
      "1:1:1",
      "1:1:2",
      "1:2:1",
      "2:1:1",
    ]);
    expect(descriptor.diagnostics.modalVarietyAudit).toMatchObject({
      representedBasisPageModeCount: 4,
      representedSpatialFamilyCount: 2,
      basisAtlasCapacityRejectedCount: 4,
      spatialBandwidthRejectedCount: 0,
    });
    expect(
      descriptor.diagnostics.modalVarietyAudit.renderRepresentedEnergyRatio,
    ).toBeCloseTo(
      (0.95 ** 2 + 0.9 ** 2 + 0.88 ** 2 + 0.86 ** 2) /
        (0.95 ** 2 +
          0.9 ** 2 +
          0.88 ** 2 +
          0.86 ** 2 +
          0.5 ** 2 +
          0.48 ** 2 +
          0.46 ** 2 +
          0.44 ** 2),
      6,
    );
  });

  it("does not let stronger candidates override upstream continuity order", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 6,
      basisAtlasPageCapacity: 3,
      basisCacheResolution: 64,
      modalFieldSlots: makeSlots([
        [8, 8, 8, 0.1],
        [9, 9, 9, 0.09],
        [1, 1, 1, 0.95],
        [1, 1, 2, 0.9],
        [6, 5, 4, 0.42],
        [10, 4, 2, 0.4],
      ]),
      activeModalFieldModeCount: 6,
    });

    expect(readModeKeys(descriptor.slotViews.modalFieldSlots, 3)).toEqual([
      "8:8:8",
      "9:9:9",
      "1:1:1",
    ]);
    expect(descriptor.diagnostics.basisAtlasCapacityRejectedCount).toBe(3);
  });

  it("reports spatial-bandwidth rejection separately from atlas capacity", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      basisAtlasPageCapacity: 4,
      basisCacheResolution: 8,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.7],
        [8, 0, 0, 0.5],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.diagnostics.spatialBandwidthRejectedCount).toBe(1);
    expect(descriptor.diagnostics.rejectionReasons).toEqual({
      spatialBandwidth: 1,
    });
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(false);
  });

  it("marks structural coverage satisfied when admitted modes fit atlas and bandwidth", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      basisAtlasPageCapacity: 4,
      basisCacheResolution: 64,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.4],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(true);
    expect(descriptor.diagnostics.rejectionReasons).toEqual({});
  });

  it("combines duplicate mode keys and preserves continuous metadata", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.4],
        [2, 2, 2, 0.15],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [440, 10, 0.05, 0.2],
        [450, 14, 1 / 28, 0.9],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.counts.validModeCount).toBe(2);
    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(
      Array.from(descriptor.slotViews.modalFieldSlots.slice(0, 3)),
    ).toEqual([2, 2, 2]);
    expect(descriptor.slotViews.modalFieldSlots[3]).toBeCloseTo(0.55, 6);
    expect(descriptor.slotViews.modalFieldMetadataSlots[0]).toBeCloseTo(
      (440 * 0.4 + 450 * 0.15) / 0.55,
      4,
    );
    expect(descriptor.slotViews.modalFieldMetadataSlots[1]).toBeCloseTo(
      (10 * 0.4 + 14 * 0.15) / 0.55,
      5,
    );
    expect(descriptor.slotViews.modalFieldMetadataSlots[2]).toBeCloseTo(
      (0.05 * 0.4 + (1 / 28) * 0.15) / 0.55,
      6,
    );
    expect(descriptor.slotViews.modalFieldMetadataSlots[3]).toBeCloseTo(0.9, 6);
  });

  it("mixes duplicate Spectral mode key colors without legacy spectral slots", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.4],
        [2, 2, 2, 0.3],
      ]),
      modalFieldColorSlots: makeColorSlots([
        [1, 0, 0, 0.5],
        [0, 1, 1, 1],
      ]),
      activeModalFieldModeCount: 2,
    });

    const colorSlots = descriptor.slotViews.modalFieldColorSlots;

    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(colorSlots[0]).toBeCloseTo((1 * 0.5 * 0.4) / 0.5, 6);
    expect(colorSlots[1]).toBeCloseTo((1 * 1 * 0.3) / 0.5, 6);
    expect(colorSlots[2]).toBeCloseTo((1 * 1 * 0.3) / 0.5, 6);
    expect(colorSlots[3]).toBeCloseTo((0.5 * 0.4 + 1 * 0.3) / 0.7, 6);
  });

  it("hashes Spectral lane identity and preserves lane slot views independent of RGB", () => {
    const base = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([[2, 2, 2, 0.7]]),
      modalFieldColorSlots: makeColorSlots([[0.5, 0.5, 0.5, 1]]),
      modalFieldSpectralLaneA: makePackedSlots([[1, 0, 0, 0]]),
      modalFieldSpectralLaneB: makePackedSlots([[0, 0, 0, 0]]),
      modalFieldSpectralMeta: makePackedSlots([[0.1, 0.04, 0.8, 0.5]]),
      activeModalFieldModeCount: 1,
    });
    const shifted = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([[2, 2, 2, 0.7]]),
      modalFieldColorSlots: makeColorSlots([[0.5, 0.5, 0.5, 1]]),
      modalFieldSpectralLaneA: makePackedSlots([[0, 1, 0, 0]]),
      modalFieldSpectralLaneB: makePackedSlots([[0, 0, 0, 0]]),
      modalFieldSpectralMeta: makePackedSlots([[0.6, 0.04, 0.8, 0.5]]),
      activeModalFieldModeCount: 1,
    });

    expect(Array.from(base.slotViews.modalFieldColorSlots)).toEqual(
      Array.from(shifted.slotViews.modalFieldColorSlots),
    );
    expect(Array.from(base.slotViews.modalFieldSpectralLaneA)).toEqual([
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(Array.from(shifted.slotViews.modalFieldSpectralLaneA)).toEqual([
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(base.diagnostics.spectralLaneHash).toBeTypeOf("number");
    expect(shifted.diagnostics.spectralLaneHash).toBeTypeOf("number");
    expect(base.diagnostics.spectralLaneHash).not.toBe(
      shifted.diagnostics.spectralLaneHash,
    );
  });

  it("compacts when upstream continuity releases an earlier mode", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      modalFieldSlots: makeSlots([[2, 2, 2, 0.7]]),
      activeModalFieldModeCount: 1,
    });

    expect(descriptor.counts.validModeCount).toBe(1);
    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(
      Array.from(descriptor.slotViews.modalFieldSlots.slice(0, 4)),
    ).toEqual([2, 2, 2, expect.closeTo(0.7, 6)]);
  });

  it("preserves zero-coefficient retained topology until upstream release", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0],
        [2, 2, 2, 0.7],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.counts.validModeCount).toBe(2);
    expect(descriptor.counts.modalFieldModeCount).toBe(2);
    expect(
      Array.from(descriptor.slotViews.modalFieldSlots.slice(0, 8)),
    ).toEqual([1, 1, 1, 0, 2, 2, 2, expect.closeTo(0.7, 6)]);
  });
});
