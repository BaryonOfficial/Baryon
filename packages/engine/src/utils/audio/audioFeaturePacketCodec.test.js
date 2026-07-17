import { describe, expect, it } from "vitest";
import {
  buildDrivePacket,
  buildTopologyPacket,
  computeBasisIdentityHash,
  computeFeatureTopologyFingerprint,
  createRendererFeatureView,
} from "./audioFeaturePacketCodec.js";

function createFeatureFrame() {
  return {
    fieldState: "active",
    renderAuthority: true,
    activeModeCount: 2,
    activeModalFieldModeCount: 2,
    modalFieldSlots: new Float32Array([1, 2, 3, 0.4, 4, 5, 6, 0.2]),
    modalFieldPhaseSlots: new Float32Array([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8,
    ]),
    modalFieldColorSlots: new Float32Array([
      0.2, 0.3, 0.4, 1, 0.5, 0.6, 0.7, 1,
    ]),
    modalFieldSpectralLaneA: new Float32Array(8).fill(0.1),
    modalFieldSpectralLaneB: new Float32Array(8).fill(0.2),
    modalFieldSpectralMeta: new Float32Array(8).fill(0.3),
    modalFieldMetadataSlots: new Float32Array(8).fill(0.4),
    bandEnergies: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    spectralBandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
    structureSignal: 0.7,
    energySignal: 0.6,
    modalDescriptor: {
      fieldAuthority: "complete",
      counts: {
        sourceCoupledModeCount: 1,
        resonantModeCount: 1,
      },
      diagnostics: { basisAtlasPageCapacity: 12 },
      slotViews: { modalFieldSlots: new Float32Array(8) },
    },
    debug: {
      scalar: 1,
      forbiddenArray: new Float32Array([1, 2]),
    },
  };
}

describe("audio feature packet codec", () => {
  it("separates stable topology identities from live coefficients", () => {
    const frame = createFeatureFrame();
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 2,
      topologyRevision: 3,
      captureTimestampMs: 10,
      fastProbeModeIndices: [1, 0],
    });
    const drive = buildDrivePacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 2,
      topologyRevision: 3,
      frameId: 4,
      captureTimestampMs: 10,
      processingTimestampMs: 12,
    });

    expect(Array.from(topology.modalIdentitySlots)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(drive.modalCoefficients)).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.2),
    ]);
    expect(topology).not.toHaveProperty("modalCoefficients");
    expect(drive).not.toHaveProperty("modalIdentitySlots");
    expect(drive.renderState).not.toHaveProperty("modalFieldSlots");
    expect(drive.renderState.debug).toEqual({});
  });

  it("does not change topology or basis identity hashes for coefficient-only changes", () => {
    const first = createFeatureFrame();
    const second = createFeatureFrame();
    second.modalFieldSlots[3] = 0.9;
    second.modalFieldSlots[7] = 0.05;

    expect(computeFeatureTopologyFingerprint(second)).toBe(
      computeFeatureTopologyFingerprint(first),
    );
    expect(computeBasisIdentityHash(second)).toBe(
      computeBasisIdentityHash(first),
    );
  });

  it("orders live drive slots against the committed topology identities", () => {
    const topologyFrame = createFeatureFrame();
    const topology = buildTopologyPacket({
      featureFrame: topologyFrame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
    });
    const reorderedFrame = createFeatureFrame();
    reorderedFrame.modalFieldSlots = new Float32Array([
      4, 5, 6, 0.75, 1, 2, 3, 0.25,
    ]);
    reorderedFrame.modalFieldPhaseSlots = new Float32Array([
      0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
    ]);

    const drive = buildDrivePacket({
      featureFrame: reorderedFrame,
      topologyPacket: topology,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 2,
    });

    expect(Array.from(drive.modalCoefficients)).toEqual([0.25, 0.75]);
    expect(Array.from(drive.phaseSlots)).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.3),
      expect.closeTo(0.2),
      expect.closeTo(0.1),
      expect.closeTo(0.8),
      expect.closeTo(0.7),
      expect.closeTo(0.6),
      expect.closeTo(0.5),
    ]);
  });

  it("maps per-slot roles and probes into canonical topology order", () => {
    const frame = createFeatureFrame();
    frame.modalFieldSlots = new Float32Array([4, 5, 6, 0.2, 1, 2, 3, 0.4]);
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      committedModes: [
        {
          modeKey: "1:2:3",
          u: 1,
          v: 2,
          w: 3,
          naturalFrequencyHz: 220,
          layer: "source-coupled",
        },
        {
          modeKey: "4:5:6",
          u: 4,
          v: 5,
          w: 6,
          naturalFrequencyHz: 440,
          layer: "resonant",
        },
      ],
      fastProbeModeIndices: new Uint16Array([0, 1]),
    });

    expect(Array.from(topology.modalRoleMetadata)).toEqual([2, 1]);
    expect(Array.from(topology.fastProbeModeIndices)).toEqual([0, 1]);
    expect(Array.from(topology.committedModeIdentitySlots)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(Array.from(topology.committedModeFrequenciesHz)).toEqual([220, 440]);
    expect(Array.from(topology.committedModeRoleMetadata)).toEqual([1, 2]);
    expect(topology.activeSourceCoupledModeCount).toBe(1);
    expect(topology.activeResonantModeCount).toBe(1);
  });

  it("publishes full committed drive state while rendering the visible prefix", () => {
    const frame = createFeatureFrame();
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      committedModes: [
        {
          modeKey: "1:2:3",
          u: 1,
          v: 2,
          w: 3,
          naturalFrequencyHz: 220,
          layer: "source-coupled",
        },
        {
          modeKey: "4:5:6",
          u: 4,
          v: 5,
          w: 6,
          naturalFrequencyHz: 440,
          layer: "resonant",
        },
        {
          modeKey: "7:8:9",
          u: 7,
          v: 8,
          w: 9,
          naturalFrequencyHz: 660,
          layer: "resonant",
        },
      ],
    });
    const committedDriveSlots = new Float32Array([
      1, 2, 3, 0.6, 4, 5, 6, 0.8, 7, 8, 9, 0.2,
    ]);
    const committedPhaseSlots = new Float32Array(12).fill(0.25);
    const drive = buildDrivePacket({
      featureFrame: frame,
      topologyPacket: topology,
      committedDriveSlots,
      committedPhaseSlots,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 1,
    });
    const view = createRendererFeatureView({ topology, drive });

    expect(drive.activeModeCount).toBe(2);
    expect(drive.committedModeCount).toBe(3);
    expect(Array.from(drive.modalCoefficients)).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(0.8),
      expect.closeTo(0.2),
    ]);
    expect(view.modalCoefficientSlots).toBe(drive.modalCoefficients);
    expect(view.activeModalFieldModeCount).toBe(2);
    expect(view.committedModeCount).toBe(3);
  });

  it("reuses caller-owned fast packet buffers for a 48-mode drive", () => {
    const frame = createFeatureFrame();
    const committedModeCount = 48;
    const committedDriveSlots = new Float32Array(committedModeCount * 4);
    const committedPhaseSlots = new Float32Array(committedModeCount * 4);
    for (let index = 0; index < committedModeCount; index += 1) {
      committedDriveSlots[index * 4 + 3] = (index + 1) / committedModeCount;
      committedPhaseSlots[index * 4 + 3] = index * 0.01;
    }
    const buffers = {
      modalCoefficients: new Float32Array(committedModeCount),
      phaseSlots: new Float32Array(committedModeCount * 4),
      bandEnergies: new Float32Array(4),
      spectralBandEnergies: new Float32Array(4),
    };
    const first = buildDrivePacket({
      featureFrame: frame,
      committedDriveSlots,
      committedPhaseSlots,
      buffers,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 1,
    });
    committedDriveSlots[3] = 0.25;
    const second = buildDrivePacket({
      featureFrame: frame,
      committedDriveSlots,
      committedPhaseSlots,
      buffers,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 2,
    });

    expect(second.modalCoefficients).toBe(first.modalCoefficients);
    expect(second.phaseSlots).toBe(first.phaseSlots);
    expect(second.bandEnergies).toBe(first.bandEnergies);
    expect(second.spectralBandEnergies).toBe(first.spectralBandEnergies);
    expect(second.modalCoefficients[0]).toBeCloseTo(0.25);
  });

  it("builds live coefficients from structural layers without rebuilding topology arrays", () => {
    const frame = createFeatureFrame();
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
    });
    const drive = buildDrivePacket({
      featureFrame: frame,
      topologyPacket: topology,
      driveLayers: [
        {
          slots: new Float32Array([4, 5, 6, 0.8]),
          phaseSlots: new Float32Array([0.8, 0.7, 0.6, 0.5]),
          activeModeCount: 1,
        },
        {
          slots: new Float32Array([1, 2, 3, 0.6]),
          phaseSlots: new Float32Array([0.4, 0.3, 0.2, 0.1]),
          activeModeCount: 1,
        },
      ],
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 1,
    });

    expect(Array.from(drive.modalCoefficients)).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(0.8),
    ]);
    expect(Array.from(drive.phaseSlots)).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.3),
      expect.closeTo(0.2),
      expect.closeTo(0.1),
      expect.closeTo(0.8),
      expect.closeTo(0.7),
      expect.closeTo(0.6),
      expect.closeTo(0.5),
    ]);
  });

  it("changes the topology hash when an interpretation array changes", () => {
    const first = createFeatureFrame();
    const identityChanged = createFeatureFrame();
    identityChanged.modalFieldSlots[0] = 7;
    const colorChanged = createFeatureFrame();
    colorChanged.modalFieldColorSlots[0] = 0.9;

    expect(computeFeatureTopologyFingerprint(identityChanged)).not.toBe(
      computeFeatureTopologyFingerprint(first),
    );
    expect(computeFeatureTopologyFingerprint(colorChanged)).not.toBe(
      computeFeatureTopologyFingerprint(first),
    );
  });

  it("changes the topology hash when probe interpretation or role metadata changes", () => {
    const first = createFeatureFrame();
    first.modalDescriptor.diagnostics.upstreamSourceCoupledModeCount = 1;
    first.modalDescriptor.diagnostics.upstreamResonantModeCount = 1;
    const rolesChanged = createFeatureFrame();
    rolesChanged.modalDescriptor.diagnostics.upstreamSourceCoupledModeCount = 2;
    rolesChanged.modalDescriptor.diagnostics.upstreamResonantModeCount = 0;

    expect(
      computeFeatureTopologyFingerprint(first, {
        fastProbeModeIndices: new Uint16Array([0, 1]),
      }),
    ).not.toBe(
      computeFeatureTopologyFingerprint(first, {
        fastProbeModeIndices: new Uint16Array([1, 0]),
      }),
    );
    expect(computeFeatureTopologyFingerprint(rolesChanged)).not.toBe(
      computeFeatureTopologyFingerprint(first),
    );
  });

  it("keeps the fast render state compact and drops unowned frame objects", () => {
    const frame = createFeatureFrame();
    frame.changeBreakdown = { hit: 0.4, flux: 0.2 };
    frame.energyLedger = { projectedRenderEnergy: 0.3, renderAuthority: true };
    frame.sourceEvidence = {
      currentSourceEvidence: true,
      sourceBoundaryState: "live",
    };
    frame.audit = {
      enormous: Array.from({ length: 500 }, (_, index) => index),
    };
    frame.modalFieldContinuity = {
      history: Array.from({ length: 500 }, (_, index) => index),
    };
    frame.debug = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`unowned${index}`, index]),
    );
    frame.debug.modalResponseEnergy = 0.5;
    frame.debug.audioInputMode = "file";
    frame.debug.analysisSourceUsed = "file";

    const drive = buildDrivePacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 1,
    });

    expect(drive.renderState).not.toHaveProperty("audit");
    expect(drive.renderState).not.toHaveProperty("modalFieldContinuity");
    expect(drive.renderState.debug).toEqual({
      analysisSourceUsed: "file",
      audioInputMode: "file",
      modalResponseEnergy: 0.5,
    });
    expect(JSON.stringify(drive.renderState).length).toBeLessThan(7_000);
  });

  it("joins packets into a renderer view without copying packet arrays", () => {
    const frame = createFeatureFrame();
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
    });
    const drive = buildDrivePacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 1,
    });
    const view = createRendererFeatureView({ topology, drive });

    expect(view.modalIdentitySlots).toBe(topology.modalIdentitySlots);
    expect(view.modalCoefficientSlots).toBe(drive.modalCoefficients);
    expect(view.modalFieldPhaseSlots).toBe(drive.phaseSlots);
    expect(view.bandEnergies).toBe(drive.bandEnergies);
    expect(Object.isFrozen(view)).toBe(true);
  });
});
