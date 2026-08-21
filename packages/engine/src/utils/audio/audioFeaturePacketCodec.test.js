import { describe, expect, it } from "vitest";
import {
  buildDrivePacket,
  buildTopologyPacket,
  computeBasisIdentityHash,
  computeFeatureTopologyFingerprint,
  createRendererFeatureView,
  restoreTransportedRendererFeatureViewOwnership,
} from "./audioFeaturePacketCodec.js";
import { createAudioFeaturePacketJoiner } from "./audioFeaturePackets.js";
import { isRendererFeatureUploadContract } from "../../contracts/audioFeatureProtocol.js";

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
    modalFieldSpectralMomentSlots: new Float32Array([
      0.2, 0.3, -0.4, 0.5, 0.6, 0.7, -0.8, 0.9,
    ]),
    modalFieldSpectralSeedDirection: new Float32Array([0, 1]),
    modalFieldMetadataSlots: new Float32Array(8).fill(0.4),
    modalPhaseAnchorAngularVelocityRadPerSec: 2 * Math.PI * 400,
    bandEnergies: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    spectralBandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
    spectralCentroid: 0.25,
    spectralSpread: 0.35,
    spectralFlatness: 0.45,
    spectralFlux: 0.55,
    structureSignal: 0.7,
    energySignal: 0.6,
    diagnosticControlState: {
      auditEnabled: true,
      freezeModeSlots: false,
      injectTestTone: true,
      suppressPlaybackTelemetry: false,
    },
    modalDescriptor: {
      fieldAuthority: "complete",
      counts: {
        modalFieldModeCount: 2,
        sourceCoupledModeCount: 1,
        resonantModeCount: 1,
      },
      diagnostics: { directOpticalModeCapacity: 12 },
      slotViews: { modalFieldSlots: new Float32Array(8) },
    },
    debug: {
      spectralSpread: 0.35,
      spectralFlatness: 0.45,
      scalar: 1,
      forbiddenArray: new Float32Array([1, 2]),
    },
  };
}

function createCommittedModes() {
  return [
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
  ];
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
    expect(topology).not.toHaveProperty(
      "modalPhaseAnchorAngularVelocityRadPerSec",
    );
    expect(
      drive.renderState.modalPhaseAnchorAngularVelocityRadPerSec,
    ).toBeCloseTo(2 * Math.PI * 400, 8);
    expect(
      computeFeatureTopologyFingerprint({
        ...frame,
        modalPhaseAnchorAngularVelocityRadPerSec: 2 * Math.PI * 528,
      }),
    ).toBe(computeFeatureTopologyFingerprint(frame));
    expect(drive).not.toHaveProperty("modalIdentitySlots");
    expect(drive.renderState).not.toHaveProperty("modalFieldSlots");
    expect(drive.renderState).toMatchObject({
      diagnosticControlState: {
        auditEnabled: true,
        freezeModeSlots: false,
        injectTestTone: true,
        suppressPlaybackTelemetry: false,
      },
      spectralCentroid: 0.25,
      spectralSpread: 0.35,
      spectralFlatness: 0.45,
      spectralFlux: 0.55,
      debug: {
        spectralSpread: 0.35,
        spectralFlatness: 0.45,
      },
    });
  });

  it("pauses observer evolution while pattern freeze is active", () => {
    const frame = createFeatureFrame();
    frame.diagnosticControlState.freezeModeSlots = true;

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
      captureTimestampMs: 1_000,
      observationTimeSeconds: 12.5,
      observationAdvancing: true,
      observationPaused: false,
    });
    const rendererView = createRendererFeatureView({ topology, drive });

    expect(drive.observationAdvancing).toBe(false);
    expect(drive.observationPaused).toBe(true);
    expect(rendererView).toMatchObject({
      observationTimeSeconds: 12.5,
      observationAdvancing: false,
      observationPaused: true,
    });
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

  it("publishes roles and probes in canonical topology order", () => {
    const frame = createFeatureFrame();
    const [sourceMode, resonantMode] = createCommittedModes();
    frame.modalFieldSlots = new Float32Array([4, 5, 6, 0.2, 1, 2, 3, 0.4]);
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      committedModes: [resonantMode, sourceMode],
      fastProbeModeIndices: new Uint16Array([0, 1]),
    });

    expect(Array.from(topology.modalRoleMetadata)).toEqual([2, 1]);
    expect(Array.from(topology.fastProbeModeIndices)).toEqual([0, 1]);
    expect(Array.from(topology.committedModeIdentitySlots)).toEqual([
      4, 5, 6, 1, 2, 3,
    ]);
    expect(Array.from(topology.committedModeFrequenciesHz)).toEqual([440, 220]);
    expect(Array.from(topology.committedModeRoleMetadata)).toEqual([2, 1]);
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
      committedModes: createCommittedModes(),
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

  it("pads missing committed phases to the full committed topology", () => {
    const frame = createFeatureFrame();
    const topology = buildTopologyPacket({
      featureFrame: frame,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      committedModes: createCommittedModes(),
    });
    const drive = buildDrivePacket({
      featureFrame: frame,
      topologyPacket: topology,
      committedDriveSlots: new Float32Array([
        1, 2, 3, 0.6, 4, 5, 6, 0.8, 7, 8, 9, 0.2,
      ]),
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      frameId: 1,
    });
    const joiner = createAudioFeaturePacketJoiner();

    expect(Array.from(drive.phaseSlots)).toEqual([
      ...frame.modalFieldPhaseSlots,
      0,
      0,
      0,
      0,
    ]);
    expect(joiner.acceptTopology(topology).accepted).toBe(true);
    expect(joiner.acceptDrive(drive).published).toBe(true);
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
    const momentChanged = createFeatureFrame();
    momentChanged.modalFieldSpectralMomentSlots[0] = 0.9;

    expect(computeFeatureTopologyFingerprint(identityChanged)).not.toBe(
      computeFeatureTopologyFingerprint(first),
    );
    expect(computeFeatureTopologyFingerprint(momentChanged)).not.toBe(
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
    frame.debug.sourceKind = "file";
    frame.debug.analysisInputMode = "file";
    frame.debug.analysisSourceUsed = "file";
    frame.debug.liveInputPolicy = "line-feed";

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
      analysisInputMode: "file",
      liveInputPolicy: "line-feed",
      modalResponseEnergy: 0.5,
      sourceKind: "file",
    });
    expect(JSON.stringify(drive.renderState).length).toBeLessThan(7_000);
  });

  it("keeps immutable basis data separate from the streamed drive frame", () => {
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
      captureTimestampMs: 1_000,
      observationTimeSeconds: 12.5,
      observationAdvancing: false,
      observationPaused: true,
      observationSourceKey: "file:track-a",
      observationSessionKey: "file:track-a",
      observationTimelineRevision: 4,
    });
    const view = createRendererFeatureView({ topology, drive });

    expect(view.modalIdentitySlots).toBe(topology.modalIdentitySlots);
    expect(view.modalCoefficientSlots).toBe(drive.modalCoefficients);
    expect(view).not.toHaveProperty("modalFieldSlots");
    expect(view.modalDescriptor.slotViews).not.toHaveProperty(
      "modalFieldSlots",
    );
    expect(view.modalDescriptor.slotViews.modalIdentitySlots).toBe(
      topology.modalIdentitySlots,
    );
    expect(view.modalDescriptor.slotViews.modalCoefficientSlots).toBe(
      drive.modalCoefficients,
    );
    expect(view.modalDescriptor.fieldAuthority).toBe("complete");
    expect(view.modalDescriptor.diagnostics).toEqual(
      topology.modalDescriptor.diagnostics,
    );
    expect(view.modalFieldPhaseSlots).toBe(drive.phaseSlots);
    expect(view.modalPhaseAnchorAngularVelocityRadPerSec).toBeCloseTo(
      2 * Math.PI * 400,
      8,
    );
    expect(view.modalDescriptor.slotViews).not.toHaveProperty(
      "modalPhaseAnchorAngularVelocityRadPerSec",
    );
    expect(view.modalDescriptor.slotViews.modalFieldPhaseSlots).toBe(
      drive.phaseSlots,
    );
    expect(view.modalDescriptor.slotViews.modalFieldSpectralMomentSlots).toBe(
      topology.modalFieldSpectralMomentSlots,
    );
    expect(view.bandEnergies).toBe(drive.bandEnergies);
    expect(view.renderAuthority).toBe(false);
    expect(view).toMatchObject({
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      observationTimeSeconds: 12.5,
      observationAdvancing: false,
      observationPaused: true,
      observationSourceKey: "file:track-a",
      observationSessionKey: "file:track-a",
      observationTimelineRevision: 4,
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.modalDescriptor)).toBe(true);
    expect(Object.isFrozen(view.modalDescriptor.slotViews)).toBe(true);
  });

  it("restores renderer slot ownership after transport clones shared views", () => {
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
    const transportedView = {
      ...view,
      modalIdentitySlots: new Float32Array(view.modalIdentitySlots),
      modalCoefficientSlots: new Float32Array(view.modalCoefficientSlots),
      modalFieldPhaseSlots: new Float32Array(view.modalFieldPhaseSlots),
      modalFieldSpectralMomentSlots: new Float32Array(
        view.modalFieldSpectralMomentSlots,
      ),
      modalFieldMetadataSlots: new Float32Array(view.modalFieldMetadataSlots),
      modalDescriptor: {
        ...view.modalDescriptor,
        slotViews: {
          ...view.modalDescriptor.slotViews,
          modalIdentitySlots: new Float32Array(
            view.modalDescriptor.slotViews.modalIdentitySlots,
          ),
          modalCoefficientSlots: new Float32Array(
            view.modalDescriptor.slotViews.modalCoefficientSlots,
          ),
          modalFieldPhaseSlots: new Float32Array(
            view.modalDescriptor.slotViews.modalFieldPhaseSlots,
          ),
          modalFieldSpectralMomentSlots: new Float32Array(
            view.modalDescriptor.slotViews.modalFieldSpectralMomentSlots,
          ),
          modalFieldMetadataSlots: new Float32Array(
            view.modalDescriptor.slotViews.modalFieldMetadataSlots,
          ),
        },
      },
    };

    expect(
      isRendererFeatureUploadContract(
        transportedView,
        transportedView.modalDescriptor,
      ),
    ).toBe(false);

    const restoredView =
      restoreTransportedRendererFeatureViewOwnership(transportedView);

    expect(
      isRendererFeatureUploadContract(
        restoredView,
        restoredView.modalDescriptor,
      ),
    ).toBe(true);
    expect(restoredView.modalDescriptor.slotViews.modalIdentitySlots).toBe(
      restoredView.modalIdentitySlots,
    );
    expect(restoredView.modalDescriptor.slotViews.modalCoefficientSlots).toBe(
      restoredView.modalCoefficientSlots,
    );
    expect(restoredView.modalDescriptor.slotViews.modalFieldPhaseSlots).toBe(
      restoredView.modalFieldPhaseSlots,
    );
    expect(
      restoredView.modalDescriptor.slotViews.modalFieldSpectralMomentSlots,
    ).toBe(restoredView.modalFieldSpectralMomentSlots);
    expect(restoredView.modalDescriptor.slotViews.modalFieldMetadataSlots).toBe(
      restoredView.modalFieldMetadataSlots,
    );
    expect(restoreTransportedRendererFeatureViewOwnership(view)).toBe(view);
  });
});
