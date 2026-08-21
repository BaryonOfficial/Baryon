import { describe, expect, it } from "vitest";
import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import {
  buildModalCandidateMetadataSlots,
  buildModalFieldDescriptorSource,
  mergeModalCandidateSources,
} from "./modalFieldDescriptorSource.js";

function buildCandidates({
  slots,
  phaseSlots,
  spectralMomentSlots,
  metadataSlots,
}) {
  const slotLength = slots.length;
  return {
    slots: new Float32Array(slots),
    phaseSlots: new Float32Array(phaseSlots ?? slotLength),
    spectralMomentSlots: new Float32Array(
      spectralMomentSlots ?? slotLength,
    ),
    metadataSlots: metadataSlots ? new Float32Array(metadataSlots) : undefined,
    activeModeCount: slotLength / 4,
  };
}

describe("modal field descriptor candidate sources", () => {
  it("deduplicates modes while preserving the strongest aligned payloads", () => {
    const renderCandidates = buildCandidates({
      slots: [2, 1, 1, 0.4],
      phaseSlots: [0.1, 0.2, 0.1, 0.1],
      spectralMomentSlots: [0.1, 0.1, 0.1, 0.1],
    });
    const proposalCandidates = buildCandidates({
      slots: [2, 1, 1, 0.6, 3, 1, 1, 0.5],
      phaseSlots: [1.2, 2.4, 0.8, 0.9, 0.4, 0.5, 0.6, 0.7],
      spectralMomentSlots: [
        0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
      ],
    });

    const merged = mergeModalCandidateSources({
      renderCandidates,
      proposalCandidates,
      capacity: 2,
      proposalScale: 0.5,
    });

    expect(merged.activeModeCount).toBe(2);
    expect(Array.from(merged.slots)).toEqual([
      2,
      1,
      1,
      expect.closeTo(0.4, 6),
      3,
      1,
      1,
      expect.closeTo(0.25, 6),
    ]);
    expect(Array.from(merged.phaseSlots.slice(0, 4))).toEqual([
      expect.closeTo(1.2, 6),
      expect.closeTo(2.4, 6),
      expect.closeTo(0.8, 6),
      expect.closeTo(0.9, 6),
    ]);
    expect(Array.from(merged.spectralMomentSlots.slice(0, 4))).toEqual([
      expect.closeTo(0.4, 6),
      expect.closeTo(0.35714286, 6),
      expect.closeTo(0.31428571, 6),
      expect.closeTo(0.27142857, 6),
    ]);
  });

  it("deduplicates equivalent topology coordinates after normalization", () => {
    const renderCandidates = buildCandidates({
      slots: [1.0001, 2, 3, 0.4],
    });
    const proposalCandidates = buildCandidates({
      slots: [1, 2, 3, 0.6],
    });

    const merged = mergeModalCandidateSources({
      renderCandidates,
      proposalCandidates,
      capacity: 2,
    });

    expect(merged.activeModeCount).toBe(1);
    expect(Array.from(merged.slots)).toEqual([1, 2, 3, expect.closeTo(0.6, 6)]);
  });

  it("preserves physical mode metadata without requiring observer support", () => {
    const slots = new Float32Array([2, 1, 1, 0.4]);
    const qualityFactor = 17;
    const metadata = buildModalCandidateMetadataSlots({
      slots,
      activeModeCount: 1,
      capacity: 1,
      candidateState: new Map([
        [
          buildModalTopologyModeKey(2, 1, 1),
          {
            naturalFrequencyHz: 440,
            modalResponseDriveFrequencyHz: 430,
            qualityFactor,
          },
        ],
      ]),
    });

    expect(metadata).toBeInstanceOf(Float32Array);
    expect(metadata?.[0]).toBeCloseTo(440);
    expect(metadata?.[1]).toBeCloseTo(qualityFactor);
    expect(metadata?.[2]).toBeCloseTo(430);
    expect(metadata?.[3]).toBeNaN();

    const descriptor = buildModalFieldDescriptorSource({
      sourceCoupledCandidates: buildCandidates({
        slots,
        metadataSlots: metadata,
      }),
      resonantCandidates: buildCandidates({ slots: [] }),
      radius: 3,
      cavityAcousticScale: {
        sideLengthMeters: 3,
        soundSpeedMetersPerSecond: 1480,
      },
      boundaryMode: "neumann",
    });
    expect(descriptor.modalFieldMetadataSlots[0]).toBeCloseTo(440);
    expect(descriptor.modalFieldMetadataSlots[1]).toBeCloseTo(qualityFactor);
    expect(descriptor.modalFieldMetadataSlots[2]).toBeCloseTo(430);
  });

  it("derives candidate Q from the declared apparatus when metadata is unavailable", () => {
    const descriptor = buildModalFieldDescriptorSource({
      sourceCoupledCandidates: buildCandidates({
        slots: [1, 1, 1, 0.4, 18, 21, 24, 0.3],
      }),
      resonantCandidates: buildCandidates({ slots: [] }),
      radius: 3,
      cavityAcousticScale: {
        sideLengthMeters: 3,
        soundSpeedMetersPerSecond: 1480,
      },
      boundaryMode: "neumann",
    });

    const metadata = descriptor.modalFieldMetadataSlots;
    expect(metadata[0]).not.toBeCloseTo(metadata[4]);
    expect(metadata[1]).toBeGreaterThan(10);
    expect(metadata[5]).toBeGreaterThan(metadata[1]);
    expect(metadata[2]).toBeCloseTo(metadata[0]);
    expect(metadata[6]).toBeCloseTo(metadata[4]);
  });
});
