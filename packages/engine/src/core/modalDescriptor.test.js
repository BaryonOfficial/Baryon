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
      [naturalFrequencyHz, qualityFactor, responseFrequencyHz, observedSupport],
      index,
    ) => {
      const offset = index * 4;
      slots[offset] = naturalFrequencyHz;
      slots[offset + 1] = qualityFactor;
      slots[offset + 2] = responseFrequencyHz;
      slots[offset + 3] = observedSupport;
    },
  );
  return slots;
}

function makeSpectralMomentSlots(entries) {
  const slots = new Float32Array(entries.length * 4);
  entries.forEach(([m1x, m1y, m2x, m2y], index) => {
    const offset = index * 4;
    slots[offset] = m1x;
    slots[offset + 1] = m1y;
    slots[offset + 2] = m2x;
    slots[offset + 3] = m2y;
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
        [440, 8, 435, 0.7],
        [880, 22, 870, 0.4],
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
    expect(metadata[2]).toBeCloseTo(435, 6);
    expect(metadata[3]).toBeCloseTo(0.7, 6);
    expect(metadata[4]).toBeCloseTo(880, 6);
    expect(metadata[5]).toBeCloseTo(22, 6);
    expect(metadata[6]).toBeCloseTo(870, 6);
    expect(metadata[7]).toBeCloseTo(0.4, 6);
    expect(descriptor.slotViews).not.toHaveProperty("modalFieldRoleSlots");
    expect(descriptor.diagnostics).not.toHaveProperty("roleHistogram");
  });

  it("keeps field slots independent from metadata when final coefficients are equal", () => {
    const lowFrequency = buildCanonicalFullModalDescriptor({
      maxTotalModes: 1,
      modalFieldSlots: makeSlots([[2, 2, 4, 0.5]]),
      modalFieldMetadataSlots: makeMetadataSlots([[220, 6, 215, 0.8]]),
      activeModalFieldModeCount: 1,
    });
    const highFrequency = buildCanonicalFullModalDescriptor({
      maxTotalModes: 1,
      modalFieldSlots: makeSlots([[2, 2, 4, 0.5]]),
      modalFieldMetadataSlots: makeMetadataSlots([[1760, 28, 1740, 0.8]]),
      activeModalFieldModeCount: 1,
    });

    expect(Array.from(lowFrequency.slotViews.modalFieldSlots)).toEqual(
      Array.from(highFrequency.slotViews.modalFieldSlots),
    );
    expect(lowFrequency.slotViews).not.toHaveProperty("modalFieldRoleSlots");
    expect(highFrequency.slotViews).not.toHaveProperty("modalFieldRoleSlots");
  });

  it("publishes a bounded capacity-limited descriptor on overflow", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.25],
        [3, 3, 3, 0.15],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [110, 5, 108, 0.9],
        [220, 10, 217, 0.7],
        [330, 20, 325, 0.2],
      ]),
      activeModalFieldModeCount: 3,
    });

    expect(descriptor.fieldAuthority).toBe("capacity-limited");
    expect(descriptor.diagnostics.descriptorOverflow).toBe(true);
    expect(descriptor.counts.validModeCount).toBe(3);
    expect(descriptor.counts.modalFieldModeCount).toBe(2);
    expect(descriptor.counts.overflowModeCount).toBe(1);
    expect(readModeKeys(descriptor.slotViews.modalFieldSlots, 2)).toEqual([
      "1:1:1",
      "2:2:2",
    ]);
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

  it("reports direct optical capacity rejection separately from descriptor overflow", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 16,
      directOpticalModeCapacity: 2,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.5],
        [3, 3, 3, 0.4],
      ]),
      activeModalFieldModeCount: 3,
    });

    expect(descriptor.fieldAuthority).toBe("complete");
    expect(descriptor.diagnostics.descriptorOverflow).toBe(false);
    expect(descriptor.diagnostics.directOpticalCapacityRejectedCount).toBe(1);
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(false);
    expect(descriptor.diagnostics.rejectionReasons).toEqual({
      directOpticalCapacity: 1,
    });
    expect(
      descriptor.diagnostics.directOpticalCapacityRejectedModalEnergy,
    ).toBeCloseTo(0.4 ** 2, 4);
    expect(descriptor.diagnostics.modalVarietyAudit).toMatchObject({
      modalTopologyGeometry: "rectangular",
      semanticModeCount: 3,
      directOpticalRepresentedModeCount: 2,
      directOpticalModeCapacity: 2,
      directOpticalCapacityPressure: 1,
      semanticShellCount: 3,
      representedShellCount: 2,
      spatialFamilyCount: 3,
      representedSpatialFamilyCount: 2,
      descriptorRejectedModeCount: 0,
      directOpticalCapacityRejectedCount: 1,
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
      descriptor.diagnostics.modalVarietyAudit.directOpticalCapacitySweep,
    ).toEqual([
      expect.objectContaining({
        directOpticalModeCapacity: 2,
        directOpticalRepresentedModeCount: 2,
      }),
      expect.objectContaining({
        directOpticalModeCapacity: 3,
        directOpticalRepresentedModeCount: 3,
        renderRepresentedEnergyRatio: 1,
      }),
    ]);
  });

  it("reports upstream publication coverage separately from descriptor rejection", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 8,
      directOpticalModeCapacity: 8,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.5],
        [2, 1, 1, 0.25],
      ]),
      activeModalFieldModeCount: 2,
      observerCandidateModeCount: 7,
      observedModalModeCount: 5,
      phaseAuthorityModeCount: 6,
      upstreamSourceCoupledModeCount: 2,
      upstreamResonantModeCount: 4,
      upstreamSourceCoupledModalEnergy: 0.3,
      upstreamResonantModalEnergy: 0.7,
      upstreamCandidateShellCount: 5,
    });

    const audit = descriptor.diagnostics.modalVarietyAudit;

    expect(descriptor.diagnostics.descriptorOverflow).toBe(false);
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(true);
    expect(descriptor.diagnostics.rejectedModalEnergy).toBe(0);
    expect(audit).toMatchObject({
      semanticModeCount: 2,
      directOpticalRepresentedModeCount: 2,
      upstreamSourceCoupledModeCount: 2,
      upstreamResonantModeCount: 4,
      upstreamCandidateModeCount: 6,
      upstreamCandidateShellCount: 5,
      observerCandidateModeCount: 7,
      observedModalModeCount: 5,
      phaseAuthorityModeCount: 6,
      upstreamSourceCoupledModalEnergy: 0.3,
      upstreamResonantModalEnergy: 0.7,
      upstreamCandidateModalEnergy: 1,
    });
    expect(audit.publishedModeCoverageRatio).toBeCloseTo(2 / 6, 6);
    expect(audit.publishedShellCoverageRatio).toBeCloseTo(2 / 5, 6);
    expect(audit.publishedModalEnergyCoverageRatio).toBeCloseTo(
      (0.5 ** 2 + 0.25 ** 2) / 1,
      6,
    );
    expect(audit.observerCandidatePublishedModeCoverageRatio).toBeCloseTo(
      2 / 7,
      6,
    );
    expect(audit.observedModalPublishedModeCoverageRatio).toBeCloseTo(2 / 5, 6);
    expect(audit.phaseAuthorityPublishedModeCoverageRatio).toBeCloseTo(
      2 / 6,
      6,
    );
    expect(audit.basisRepresentedUpstreamModeCoverageRatio).toBeCloseTo(
      2 / 6,
      6,
    );
    expect(audit.basisRepresentedShellCoverageRatio).toBeCloseTo(2 / 5, 6);
  });

  it("reports raw and confidence-qualified reservoir diagnostics separately", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 8,
      directOpticalModeCapacity: 8,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 1, 1, 0.5],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [110, 5, 108, 0.8],
        [220, 10, 217, 0.02],
      ]),
      activeModalFieldModeCount: 2,
      rawCandidateModeCount: 5,
      confidenceQualifiedCandidateModeCount: 2,
      lowConfidenceCandidateModeCount: 3,
      rawCandidateModalEnergy: 0.72,
      confidenceWeightedCandidateEnergy: 0.24,
      modalObservationCoherence: 0.42,
      modalObservationConfidence: 0.35,
    });

    expect(descriptor.diagnostics).toMatchObject({
      rawCandidateModeCount: 5,
      confidenceQualifiedCandidateModeCount: 2,
      lowConfidenceCandidateModeCount: 3,
      rawCandidateModalEnergy: 0.72,
      confidenceWeightedCandidateEnergy: 0.24,
      modalObservationCoherence: 0.42,
      modalObservationConfidence: 0.35,
    });
    expect(descriptor.diagnostics.modalVarietyAudit).toMatchObject({
      rawCandidateModeCount: 5,
      confidenceQualifiedCandidateModeCount: 2,
      lowConfidenceCandidateModeCount: 3,
      rawCandidateModalEnergy: 0.72,
      confidenceWeightedCandidateEnergy: 0.24,
      modalObservationCoherence: 0.42,
      modalObservationConfidence: 0.35,
    });
  });

  it("preserves continuity order when direct optical capacity is saturated", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 8,
      directOpticalModeCapacity: 4,
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
      directOpticalRepresentedModeCount: 4,
      representedSpatialFamilyCount: 2,
      directOpticalCapacityRejectedCount: 4,
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
      directOpticalModeCapacity: 3,
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
    expect(descriptor.diagnostics.directOpticalCapacityRejectedCount).toBe(3);
  });

  it("does not reapply upstream spatial admission at the descriptor boundary", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      directOpticalModeCapacity: 4,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.7],
        [8, 0, 0, 0.5],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.fieldAuthority).toBe("complete");
    expect(descriptor.counts.modalFieldModeCount).toBe(2);
    expect(descriptor.diagnostics.rejectionReasons).toEqual({});
    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(true);
    expect(descriptor.diagnostics.modalVarietyAudit.modeOrderMax).toBe(8);
  });

  it("marks structural coverage satisfied when admitted modes fit direct optical capacity", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 4,
      directOpticalModeCapacity: 4,
      modalFieldSlots: makeSlots([
        [1, 1, 1, 0.6],
        [2, 2, 2, 0.4],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.diagnostics.structuralCoverageSatisfied).toBe(true);
    expect(descriptor.diagnostics.rejectionReasons).toEqual({});
  });

  it("combines coherent duplicate mode keys without averaging eigenmode metadata", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.4],
        [2, 2, 2, 0.15],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [440, 10, 438, 0.2],
        [440, 10, 438, 0.9],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.counts.validModeCount).toBe(2);
    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(
      Array.from(descriptor.slotViews.modalFieldSlots.slice(0, 3)),
    ).toEqual([2, 2, 2]);
    expect(descriptor.slotViews.modalFieldSlots[3]).toBeCloseTo(0.55, 6);
    expect(descriptor.slotViews.modalFieldMetadataSlots[0]).toBeCloseTo(440, 6);
    expect(descriptor.slotViews.modalFieldMetadataSlots[1]).toBeCloseTo(10, 6);
    expect(descriptor.slotViews.modalFieldMetadataSlots[2]).toBeCloseTo(438, 6);
    expect(descriptor.slotViews.modalFieldMetadataSlots[3]).toBeCloseTo(0.9, 6);
  });

  it("rejects conflicting eigenmode metadata for one modal identity", () => {
    expect(() =>
      buildCanonicalFullModalDescriptor({
        maxTotalModes: 3,
        modalFieldSlots: makeSlots([
          [2, 2, 2, 0.4],
          [2, 2, 2, 0.15],
        ]),
        modalFieldMetadataSlots: makeMetadataSlots([
          [440, 10, 438, 0.2],
          [450, 10, 438, 0.9],
        ]),
        activeModalFieldModeCount: 2,
      }),
    ).toThrow(
      "Duplicate modal identity 2:2:2 has conflicting naturalFrequencyHz",
    );
  });

  it("combines duplicate acoustic coefficients as physical complex phasors", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.3],
        [2, 2, 2, 0.3],
      ]),
      modalFieldPhaseSlots: makePackedSlots([
        [0, 0, 1, 1],
        [Math.PI, 0, 1, 1],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(descriptor.slotViews.modalFieldSlots[3]).toBeCloseTo(0, 6);
    expect(descriptor.slotViews.modalFieldPhaseSlots[2]).toBeCloseTo(0, 6);
  });

  it("keeps distinct temporal response components for one spatial mode", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.3],
        [2, 2, 2, 0.2],
      ]),
      modalFieldPhaseSlots: makePackedSlots([
        [0, 0.4, 1, 1],
        [0, -0.6, 1, 1],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [440, 10, 438, 0.9],
        [440, 10, 438, 0.9],
      ]),
      activeModalFieldModeCount: 2,
    });

    expect(descriptor.counts.modalFieldModeCount).toBe(2);
    expect(descriptor.slotViews.modalFieldPhaseSlots[1]).toBeCloseTo(0.4, 6);
    expect(descriptor.slotViews.modalFieldPhaseSlots[5]).toBeCloseTo(-0.6, 6);
  });

  it("mixes duplicate spectral moments by coefficient", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: makeSlots([
        [2, 2, 2, 0.4],
        [2, 2, 2, 0.3],
      ]),
      modalFieldSpectralMomentSlots: makeSpectralMomentSlots([
        [1, 0, 0, 0.5],
        [0, 1, 1, 1],
      ]),
      activeModalFieldModeCount: 2,
    });

    const spectralMomentSlots =
      descriptor.slotViews.modalFieldSpectralMomentSlots;

    expect(descriptor.counts.modalFieldModeCount).toBe(1);
    expect(spectralMomentSlots[0]).toBeCloseTo((1 * 0.4) / 0.7, 6);
    expect(spectralMomentSlots[1]).toBeCloseTo((1 * 0.3) / 0.7, 6);
    expect(spectralMomentSlots[2]).toBeCloseTo((1 * 0.3) / 0.7, 6);
    expect(spectralMomentSlots[3]).toBeCloseTo(
      (0.5 * 0.4 + 1 * 0.3) / 0.7,
      6,
    );
  });

  it("gives one coefficient-weighted spectral basis to a response shell", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([
        [0, 0, 2, 0.25],
        [0, 0, 4, 0.75],
      ]),
      modalFieldSpectralMomentSlots: makeSpectralMomentSlots([
        [0.2, 0, 0.4, 0],
        [0.8, 0, -0.4, 0],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([
        [200, 10, 300, 0.5],
        [400, 10, 300, 0.5],
      ]),
      activeModalFieldModeCount: 2,
    });

    const spectralMomentSlots =
      descriptor.slotViews.modalFieldSpectralMomentSlots;
    expect(Array.from(spectralMomentSlots.slice(0, 4))).toEqual([
      expect.closeTo(0.2 * 0.25 + 0.8 * 0.75, 6),
      0,
      expect.closeTo(0.4 * 0.25 - 0.4 * 0.75, 6),
      0,
    ]);
    expect(Array.from(spectralMomentSlots.slice(4, 8))).toEqual(
      Array.from(spectralMomentSlots.slice(0, 4)),
    );
  });

  it("promotes the canonical pitch moment onto modal entries", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([[2, 3, 5, 0.7]]),
      modalFieldSpectralMomentSlots: makeSpectralMomentSlots([
        [0.25, 0.5, 0.75, 0.8],
      ]),
      activeModalFieldModeCount: 1,
    });

    expect(descriptor.modes.modalField[0].material).toEqual({
      spectralMoment: [
        expect.closeTo(0.25, 6),
        expect.closeTo(0.5, 6),
        expect.closeTo(0.75, 6),
        expect.closeTo(0.8, 6),
      ],
    });
    expect(
      descriptor.slotViews.modalFieldSpectralMomentSlots[0],
    ).toBeCloseTo(0.25, 6);
  });

  it("hashes the canonical spectral moment without legacy lane views", () => {
    const base = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([[2, 2, 2, 0.7]]),
      modalFieldSpectralMomentSlots: makeSpectralMomentSlots([[1, 0, 1, 0]]),
      activeModalFieldModeCount: 1,
    });
    const shifted = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([[2, 2, 2, 0.7]]),
      modalFieldSpectralMomentSlots: makeSpectralMomentSlots([[0, 1, -1, 0]]),
      activeModalFieldModeCount: 1,
    });

    expect(Array.from(base.slotViews.modalFieldSpectralMomentSlots)).not.toEqual(
      Array.from(shifted.slotViews.modalFieldSpectralMomentSlots),
    );
    expect(base.diagnostics.spectralMomentHash).toBeTypeOf("number");
    expect(base.diagnostics.spectralMomentHash).not.toBe(
      shifted.diagnostics.spectralMomentHash,
    );
    expect(base.slotViews).not.toHaveProperty("modalFieldSpectralLaneA");
    expect(base.diagnostics).not.toHaveProperty("spectralLaneHash");
  });

  it("preserves spectral moments when quality metadata is zero", () => {
    const descriptor = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: makeSlots([[2, 2, 2, 0.7]]),
      modalFieldSpectralMomentSlots: makeSpectralMomentSlots([
        [0.25, 0.75, -0.8, 0.6],
      ]),
      modalFieldMetadataSlots: makeMetadataSlots([[0, 0, 0, 0]]),
      activeModalFieldModeCount: 1,
    });

    expect(
      Array.from(descriptor.slotViews.modalFieldSpectralMomentSlots),
    ).toEqual([
      expect.closeTo(0.25, 6),
      expect.closeTo(0.75, 6),
      expect.closeTo(-0.8, 6),
      expect.closeTo(0.6, 6),
      0,
      0,
      0,
      0,
    ]);
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
