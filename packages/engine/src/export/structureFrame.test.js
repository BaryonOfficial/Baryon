import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRUCTURE_EXPORT_MODE_CAP,
  MAX_STRUCTURE_EXPORT_MODE_CAP,
  STRUCTURE_EXPORT_OSC_SCHEMA,
  STRUCTURE_EXPORT_SCHEMA_VERSION,
  STRUCTURE_EXPORT_STATE_VECTOR_FIELDS,
  areStructureExportSampleIdentitiesEqual,
  createStructureExportProjector,
  createStructureExportSampleIdentity,
  normalizeStructureExportModeCap,
} from "./structureFrame.js";
import { createSpectralMomentBasis } from "../utils/audio/spectralPhase.js";

function createFeatureFrame(overrides = {}) {
  const modalIdentitySlots = new Float32Array([1, 2, 3, 4, 5, 6]);
  const modalCoefficientSlots = new Float32Array([0.25, -0.5]);
  const modalFieldPhaseSlots = new Float32Array([
    0.1, 2, 0.8, 0.9, 0.2, 3, 0.7, 0.6,
  ]);
  const modalFieldMetadataSlots = new Float32Array([
    220, 12, 218, 0.75, 440, 20, 437, 0.5,
  ]);
  const modalFieldSpectralMomentSlots = new Float32Array([
    0.1, 0.2, -0.3, 0.4, -0.5, 0.6, 0.7, -0.8,
  ]);
  const slotViews = {
    modalIdentitySlots,
    modalCoefficientSlots,
    modalFieldPhaseSlots,
    modalFieldMetadataSlots,
    modalFieldSpectralMomentSlots,
  };
  return {
    frameId: 41,
    sourceGeneration: 2 ** 31 + 5,
    workerGeneration: 7,
    topologyRevision: 11,
    basisIdentityHash: 0xf1234567,
    observationInputSignature: "input-a",
    observationTimeSeconds: 12.5,
    observationAdvancing: true,
    activeModeCount: 2,
    activeModalFieldModeCount: 2,
    ...slotViews,
    modalDescriptor: {
      fieldAuthority: "complete",
      counts: { modalFieldModeCount: 2, overflowModeCount: 1 },
      diagnostics: {
        descriptorCoverageSatisfied: false,
        modalVarietyAudit: {
          publishedModeCount: 2,
          descriptorRejectedModeCount: 1,
          modalDescriptorModeCapacity: 3,
          publishedModalEnergyRatio: 0.8,
          descriptorRejectedEnergyRatio: 0.2,
        },
      },
      slotViews,
    },
    rms: 0.2,
    dominantFrequencyHz: 220,
    spectralCentroidHz: 330,
    structureSignal: 0.3,
    energySignal: 0.4,
    changeSignal: 0.5,
    pulseSignal: 0.6,
    ...overrides,
  };
}

function createSample(overrides = {}) {
  return {
    producerSessionId: "producer-a",
    featureFrame: createFeatureFrame(),
    resolvedSemanticRevision: 3,
    appliedControls: {
      colorMode: "spectral",
      volumeColorRgb: [0.1, 0.2, 0.3],
      surfaceColorRgb: [0.7, 0.8, 0.9],
      effectiveGeometry: "rectangular",
    },
    appliedControlRevision: 2 ** 31 + 9,
    ...overrides,
  };
}

function createFeatureFrameWithModeCount(modeCount) {
  const modalIdentitySlots = new Float32Array(modeCount * 3);
  const modalCoefficientSlots = new Float32Array(modeCount);
  const modalFieldPhaseSlots = new Float32Array(modeCount * 4);
  const modalFieldMetadataSlots = new Float32Array(modeCount * 4);
  const modalFieldSpectralMomentSlots = new Float32Array(modeCount * 4);
  for (let index = 0; index < modeCount; index += 1) {
    modalIdentitySlots.set([index + 1, 1, 1], index * 3);
    modalCoefficientSlots[index] = 0.25;
    modalFieldPhaseSlots.set([0.1, 2, 0.8, 0.9], index * 4);
    modalFieldMetadataSlots.set(
      [220 + index, 12, 218 + index, 0.75],
      index * 4,
    );
    modalFieldSpectralMomentSlots.set([0.1, 0.2, -0.3, 0.4], index * 4);
  }
  const slotViews = {
    modalIdentitySlots,
    modalCoefficientSlots,
    modalFieldPhaseSlots,
    modalFieldMetadataSlots,
    modalFieldSpectralMomentSlots,
  };
  const base = createFeatureFrame();
  return {
    ...base,
    activeModeCount: modeCount,
    activeModalFieldModeCount: modeCount,
    ...slotViews,
    modalDescriptor: {
      ...base.modalDescriptor,
      counts: { modalFieldModeCount: modeCount, overflowModeCount: 0 },
      slotViews,
    },
  };
}

describe("OSC structure export v4", () => {
  it("exposes only the v4 grouped OSC contract", () => {
    expect(STRUCTURE_EXPORT_SCHEMA_VERSION).toBe(4);
    expect(STRUCTURE_EXPORT_OSC_SCHEMA.addresses).toEqual({
      hello: "/baryon/hello",
      topologyBegin: "/baryon/v4/topology/begin",
      topologyMode: "/baryon/v4/topology/mode",
      topologyEnd: "/baryon/v4/topology/end",
      stateContext: "/baryon/v4/state/context",
      stateCoefficients: "/baryon/v4/state/coefficients",
      statePhaseOffsets: "/baryon/v4/state/phase/offsets",
      statePhaseVelocities: "/baryon/v4/state/phase/velocities",
      statePhaseQuality: "/baryon/v4/state/phase/quality",
      stateResponseMetadata: "/baryon/v4/state/response-metadata",
      stateSpectralFirstMoments: "/baryon/v4/state/spectral/first-moments",
      stateSpectralSecondMoments: "/baryon/v4/state/spectral/second-moments",
      stateEnd: "/baryon/v4/state/end",
      clear: "/baryon/v4/clear",
    });
    expect(STRUCTURE_EXPORT_STATE_VECTOR_FIELDS).toEqual([
      {
        stateKey: "coefficients",
        oscAddress: "/baryon/v4/state/coefficients",
        valuesPerMode: 1,
      },
      {
        stateKey: "phaseOffsets",
        oscAddress: "/baryon/v4/state/phase/offsets",
        valuesPerMode: 1,
      },
      {
        stateKey: "phaseVelocities",
        oscAddress: "/baryon/v4/state/phase/velocities",
        valuesPerMode: 1,
      },
      {
        stateKey: "phaseQuality",
        oscAddress: "/baryon/v4/state/phase/quality",
        valuesPerMode: 2,
      },
      {
        stateKey: "responseMetadata",
        oscAddress: "/baryon/v4/state/response-metadata",
        valuesPerMode: 2,
      },
      {
        stateKey: "spectralFirstMoments",
        oscAddress: "/baryon/v4/state/spectral/first-moments",
        valuesPerMode: 2,
      },
      {
        stateKey: "spectralSecondMoments",
        oscAddress: "/baryon/v4/state/spectral/second-moments",
        valuesPerMode: 2,
      },
    ]);
  });

  it("projects canonical metadata and circular moments without mutating slots", async () => {
    const projector = createStructureExportProjector();
    const sample = createSample();
    const metadataBefore = Array.from(
      sample.featureFrame.modalFieldMetadataSlots,
    );
    const momentsBefore = Array.from(
      sample.featureFrame.modalFieldSpectralMomentSlots,
    );
    const projected = await projector.project(sample);

    expect(projected.topology.modeCount).toBe(2);
    expect(projected.topology.modes[0]).toEqual({
      index: 0,
      u: 1,
      v: 2,
      w: 3,
      naturalFrequencyHz: 220,
      qualityFactor: 12,
    });
    expect(projected.state.coefficients).toEqual(
      new Float32Array([0.25, -0.5]),
    );
    expect(projected.state.phaseOffsets).toEqual(new Float32Array([0.1, 0.2]));
    expect(projected.state.phaseVelocities).toEqual(new Float32Array([2, 3]));
    expect(projected.state.responseMetadata).toEqual(
      new Float32Array([218, 0.75, 437, 0.5]),
    );
    expect(projected.state.spectralFirstMoments).toEqual(
      new Float32Array([0.1, 0.2, -0.5, 0.6]),
    );
    expect(projected.state.spectralSecondMoments).toEqual(
      new Float32Array([-0.3, 0.4, 0.7, -0.8]),
    );
    expect(projected.state.coefficients.buffer).toBe(
      projected.state.phaseOffsets.buffer,
    );
    expect(projected.state.coefficients.buffer).toBe(
      projected.state.phaseVelocities.buffer,
    );
    expect(projected.state.coefficients.buffer).toBe(
      projected.state.phaseQuality.buffer,
    );
    expect(projected.state.coefficients.buffer).toBe(
      projected.state.responseMetadata.buffer,
    );
    expect(projected.state.coefficients.buffer).toBe(
      projected.state.spectralFirstMoments.buffer,
    );
    expect(projected.state.coefficients.buffer).toBe(
      projected.state.spectralSecondMoments.buffer,
    );
    expect(projected.state.observationAdvancing).toBe(true);
    expect(projected.state.appliedControlRevision).toBe(2 ** 31 + 9);
    expect(
      projected.state.coverage.modalDescriptorCapacityPressure,
    ).toBeCloseTo(2 / 3);
    expect(
      Number.isFinite(projected.state.coverage.modalDescriptorCapacityPressure),
    ).toBe(true);
    expect(projected.topology.sourceGeneration).toBe(2 ** 31 + 5);
    expect(projected.topology.basisIdentityHash).toBe(0xf1234567);
    expect(projected.topologyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(projected.topology).not.toHaveProperty("canonicalBytes");
    expect(Array.from(sample.featureFrame.modalFieldMetadataSlots)).toEqual(
      metadataBefore,
    );
    expect(
      Array.from(sample.featureFrame.modalFieldSpectralMomentSlots),
    ).toEqual(momentsBefore);
  });

  it("derives OSC response frequency and moments from the absolute oscillator phase", async () => {
    const projector = createStructureExportProjector();
    const sample = createSample();
    const phaseSlots = new Float32Array(
      sample.featureFrame.modalFieldPhaseSlots,
    );
    const anchorAngularVelocityRadPerSec = 2 * Math.PI * 400;
    phaseSlots[1] = 2 * Math.PI * 40;
    phaseSlots[5] = 2 * Math.PI * 128;
    const featureFrame = {
      ...sample.featureFrame,
      modalFieldPhaseSlots: phaseSlots,
      modalPhaseAnchorAngularVelocityRadPerSec:
        anchorAngularVelocityRadPerSec,
    };
    const metadataBefore = Array.from(featureFrame.modalFieldMetadataSlots);
    const momentsBefore = Array.from(
      featureFrame.modalFieldSpectralMomentSlots,
    );

    const projected = await projector.project({ ...sample, featureFrame });
    const firstBasis = createSpectralMomentBasis({ frequencyHz: 440 });
    const secondBasis = createSpectralMomentBasis({ frequencyHz: 528 });

    expect(Array.from(projected.state.responseMetadata)).toEqual([
      expect.closeTo(440, 5),
      expect.closeTo(0.75, 6),
      expect.closeTo(528, 5),
      expect.closeTo(0.5, 6),
    ]);
    expect(Array.from(projected.state.spectralFirstMoments)).toEqual([
      expect.closeTo(firstBasis[0], 6),
      expect.closeTo(firstBasis[1], 6),
      expect.closeTo(secondBasis[0], 6),
      expect.closeTo(secondBasis[1], 6),
    ]);
    expect(Array.from(projected.state.spectralSecondMoments)).toEqual([
      expect.closeTo(firstBasis[2], 6),
      expect.closeTo(firstBasis[3], 6),
      expect.closeTo(secondBasis[2], 6),
      expect.closeTo(secondBasis[3], 6),
    ]);
    expect(Array.from(featureFrame.modalFieldMetadataSlots)).toEqual(
      metadataBefore,
    );
    expect(Array.from(featureFrame.modalFieldSpectralMomentSlots)).toEqual(
      momentsBefore,
    );
  });

  it("does not manufacture OSC response frequency from an unauthoritative phase", async () => {
    const projector = createStructureExportProjector();
    const sample = createSample();
    const phaseSlots = new Float32Array(
      sample.featureFrame.modalFieldPhaseSlots,
    );
    phaseSlots[3] = 0;
    phaseSlots[7] = 0;
    const projected = await projector.project({
      ...sample,
      featureFrame: {
        ...sample.featureFrame,
        modalFieldPhaseSlots: phaseSlots,
        modalPhaseAnchorAngularVelocityRadPerSec: 2 * Math.PI * 400,
      },
    });

    expect(projected.state.responseMetadata).toEqual(
      new Float32Array([218, 0.75, 437, 0.5]),
    );
    expect(projected.state.spectralFirstMoments).toEqual(
      new Float32Array([0.1, 0.2, -0.5, 0.6]),
    );
    expect(projected.state.spectralSecondMoments).toEqual(
      new Float32Array([-0.3, 0.4, 0.7, -0.8]),
    );
  });

  it("omits topology when the receiver already knows its exact key", async () => {
    const projector = createStructureExportProjector();
    const first = await projector.project(createSample());
    const second = await projector.project(createSample(), {
      knownTopologyKey: first.topologyKey,
    });
    expect(second.topologyKey).toBe(first.topologyKey);
    expect(second.topology).toBeNull();
    expect(second.state.coefficients).toHaveLength(2);
  });

  it("includes geometry and mode cap in topology identity", async () => {
    const projector = createStructureExportProjector();
    const sample = createSample();
    const full = await projector.project(sample, { modeCap: 2 });
    const capped = await projector.project(sample, { modeCap: 1 });
    const spherical = await projector.project(
      {
        ...sample,
        appliedControls: {
          ...sample.appliedControls,
          effectiveGeometry: "spherical",
        },
      },
      { modeCap: 2 },
    );
    expect(capped.topology.modeCount).toBe(1);
    expect(capped.topologyKey).not.toBe(full.topologyKey);
    expect(spherical.topologyKey).not.toBe(full.topologyKey);
  });

  it("uses the complete observation input signature in topology identity", async () => {
    const projector = createStructureExportProjector();
    const sharedPrefix = "x".repeat(128);
    const first = await projector.project(
      createSample({
        featureFrame: createFeatureFrame({
          observationInputSignature: `${sharedPrefix}:a`,
        }),
      }),
    );
    const second = await projector.project(
      createSample({
        featureFrame: createFeatureFrame({
          observationInputSignature: `${sharedPrefix}:b`,
        }),
      }),
    );

    expect(first.topologyKey).not.toBe(second.topologyKey);
  });

  it("deduplicates only complete state identities", () => {
    const base = createStructureExportSampleIdentity(createSample());
    expect(
      areStructureExportSampleIdentitiesEqual(
        base,
        createStructureExportSampleIdentity(createSample()),
      ),
    ).toBe(true);
    expect(
      areStructureExportSampleIdentitiesEqual(
        base,
        createStructureExportSampleIdentity(
          createSample({ resolvedSemanticRevision: 4 }),
        ),
      ),
    ).toBe(false);
    expect(
      areStructureExportSampleIdentitiesEqual(
        base,
        createStructureExportSampleIdentity(
          createSample({
            featureFrame: createFeatureFrame({ observationAdvancing: false }),
          }),
        ),
      ),
    ).toBe(false);
  });

  it("projects exact zero, thirty-two, sixty-four, and full-capacity boundaries", async () => {
    const projector = createStructureExportProjector();
    expect(normalizeStructureExportModeCap(-1)).toBe(0);
    expect(normalizeStructureExportModeCap(undefined)).toBe(
      DEFAULT_STRUCTURE_EXPORT_MODE_CAP,
    );
    expect(normalizeStructureExportModeCap(999)).toBe(
      MAX_STRUCTURE_EXPORT_MODE_CAP,
    );
    const sample = createSample({
      featureFrame: createFeatureFrameWithModeCount(160),
    });
    for (const modeCap of [0, 32, 64, 160]) {
      const projected = await projector.project(sample, { modeCap });
      expect(projected.topology.modeCount).toBe(modeCap);
      expect(projected.state.coefficients).toHaveLength(modeCap);
      expect(projected.state.phaseQuality).toHaveLength(modeCap * 2);
    }
  });

  it("reuses normalized topology while projecting new dynamic state", async () => {
    const projector = createStructureExportProjector();
    const firstSample = createSample();
    const first = await projector.project(firstSample, { modeCap: 2 });
    const secondFrame = {
      ...firstSample.featureFrame,
      frameId: firstSample.featureFrame.frameId + 1,
      modalCoefficientSlots: new Float32Array([0.9, 0.1]),
    };
    Object.defineProperty(secondFrame, "modalFieldIdentitySlots", {
      get() {
        throw new Error("topology should come from the projector cache");
      },
    });
    const second = await projector.project(
      { ...firstSample, featureFrame: secondFrame },
      { modeCap: 2, knownTopologyKey: first.topologyKey },
    );

    expect(second.topologyKey).toBe(first.topologyKey);
    expect(second.topology).toBeNull();
    expect(second.state.coefficients[0]).toBeCloseTo(0.9);
  });

  it("does not invalidate structural topology for observation-only descriptor changes", async () => {
    const projector = createStructureExportProjector();
    const sample = createSample();
    const first = await projector.project(sample, { modeCap: 2 });
    const metadata = new Float32Array(
      sample.featureFrame.modalFieldMetadataSlots,
    );
    metadata.set([220, 12, 219, 0.2], 0);
    const moments = new Float32Array(
      sample.featureFrame.modalFieldSpectralMomentSlots,
    );
    moments.set([0.9, -0.1, 0.4, -0.7], 0);
    const second = await projector.project(
      {
        ...sample,
        featureFrame: {
          ...sample.featureFrame,
          topologyRevision: sample.featureFrame.topologyRevision + 1,
          frameId: sample.featureFrame.frameId + 1,
          modalFieldMetadataSlots: metadata,
          modalFieldSpectralMomentSlots: moments,
        },
      },
      { modeCap: 2, knownTopologyKey: first.topologyKey },
    );

    expect(second.topologyKey).toBe(first.topologyKey);
    expect(second.topology).toBeNull();
    expect(second.state.responseMetadata[0]).toBeCloseTo(219);
    expect(second.state.responseMetadata[1]).toBeCloseTo(0.2);
    expect(second.state.spectralFirstMoments[0]).toBeCloseTo(0.9);
    expect(second.state.spectralSecondMoments[1]).toBeCloseTo(-0.7);
  });
});
