import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  createAudioFeaturePacketJoiner,
  createBoundedAudioInputTransport,
} from "./audioFeaturePackets.js";

function topology(overrides = {}) {
  return {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: 1,
    workerGeneration: 1,
    topologyRevision: 1,
    activeModeCount: 1,
    committedModeCount: 1,
    modalIdentitySlots: new Float32Array([1, 2, 3]),
    committedModeIdentitySlots: new Float32Array([1, 2, 3]),
    committedModeFrequenciesHz: new Float32Array([220]),
    modalRoleMetadata: new Uint8Array([1]),
    committedModeRoleMetadata: new Uint8Array([1]),
    fastProbeModeIndices: new Uint16Array([0]),
    modalFieldColorSlots: new Float32Array(4),
    modalFieldSpectralLaneA: new Float32Array(4),
    modalFieldSpectralLaneB: new Float32Array(4),
    modalFieldSpectralMeta: new Float32Array(4),
    modalFieldMetadataSlots: new Float32Array(4),
    ...overrides,
  };
}

function drive(overrides = {}) {
  return {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration: 1,
    workerGeneration: 1,
    topologyRevision: 1,
    frameId: 1,
    activeModeCount: 1,
    committedModeCount: 1,
    modalCoefficients: new Float32Array([0.5]),
    phaseSlots: new Float32Array(4),
    bandEnergies: new Float32Array(4),
    spectralBandEnergies: new Float32Array(4),
    renderState: {},
    ...overrides,
  };
}

describe("audio feature packet join", () => {
  it("publishes only a matching topology and drive without copying arrays", () => {
    const joiner = createAudioFeaturePacketJoiner();
    const topologyPacket = topology();
    const drivePacket = drive();

    expect(joiner.acceptTopology(topologyPacket)).toMatchObject({
      accepted: true,
      published: false,
    });
    const result = joiner.acceptDrive(drivePacket);

    expect(result.published).toBe(true);
    expect(result.model).toBe(joiner.readLatestModel());
    expect(result.model.topology).toBe(topologyPacket);
    expect(result.model.drive).toBe(drivePacket);
    expect(result.model.topology.modalIdentitySlots).toBe(
      topologyPacket.modalIdentitySlots,
    );
    expect(result.model.drive.modalCoefficients).toBe(
      drivePacket.modalCoefficients,
    );
    expect(Object.isFrozen(result.model)).toBe(true);
  });

  it("holds only the newest drive for a future topology revision", () => {
    const joiner = createAudioFeaturePacketJoiner();
    joiner.acceptTopology(topology());
    joiner.acceptDrive(drive());

    joiner.acceptDrive(drive({ topologyRevision: 2, frameId: 2 }));
    joiner.acceptDrive(drive({ topologyRevision: 2, frameId: 4 }));
    const result = joiner.acceptTopology(topology({ topologyRevision: 2 }));

    expect(result.published).toBe(true);
    expect(result.model.drive.frameId).toBe(4);
  });

  it("rejects old revisions, non-monotonic frames, and stale generations", () => {
    const joiner = createAudioFeaturePacketJoiner();
    joiner.acceptTopology(topology({ topologyRevision: 2 }));
    joiner.acceptDrive(drive({ topologyRevision: 2, frameId: 5 }));

    expect(
      joiner.acceptDrive(drive({ topologyRevision: 1, frameId: 6 })),
    ).toMatchObject({ accepted: false, reason: "older-drive-revision" });
    expect(
      joiner.acceptDrive(drive({ topologyRevision: 2, frameId: 5 })),
    ).toMatchObject({ accepted: false, reason: "non-monotonic-frame" });
    expect(
      joiner.acceptDrive(
        drive({ sourceGeneration: 0, topologyRevision: 2, frameId: 7 }),
      ),
    ).toMatchObject({ accepted: false, reason: "generation-mismatch" });
  });

  it("rejects a second topology with the same revision", () => {
    const joiner = createAudioFeaturePacketJoiner();
    const first = topology();
    joiner.acceptTopology(first);
    joiner.acceptDrive(drive());

    const replacement = topology({
      modalIdentitySlots: new Float32Array([7, 8, 9]),
    });
    expect(joiner.acceptTopology(replacement)).toMatchObject({
      accepted: false,
      reason: "non-increasing-topology-revision",
    });
    expect(joiner.readLatestModel().topology).toBe(first);
  });

  it("fails closed across source or worker generation changes", () => {
    const joiner = createAudioFeaturePacketJoiner();
    joiner.acceptTopology(topology());
    joiner.acceptDrive(drive());
    expect(joiner.readLatestModel()).not.toBeNull();

    joiner.setGenerations(2, 1);
    expect(joiner.readLatestModel()).toBeNull();
    expect(
      joiner.acceptTopology(topology({ sourceGeneration: 1 })),
    ).toMatchObject({ accepted: false, reason: "generation-mismatch" });

    joiner.acceptTopology(topology({ sourceGeneration: 2 }));
    joiner.acceptDrive(drive({ sourceGeneration: 2 }));
    expect(joiner.readLatestModel()).not.toBeNull();

    joiner.setGenerations(2, 2);
    expect(joiner.readLatestModel()).toBeNull();
  });

  it("rejects modal drive shapes that do not match their topology", () => {
    const joiner = createAudioFeaturePacketJoiner();
    joiner.acceptTopology(topology());

    expect(
      joiner.acceptDrive(
        drive({
          committedModeCount: 2,
          modalCoefficients: new Float32Array([0.5, 0.25]),
          phaseSlots: new Float32Array(8),
        }),
      ),
    ).toMatchObject({
      accepted: false,
      reason: "drive-topology-shape-mismatch",
    });
    expect(
      joiner.acceptDrive(drive({ phaseSlots: new Float32Array(3) })),
    ).toMatchObject({ accepted: false, reason: "invalid-drive-shape" });
    expect(
      joiner.acceptDrive(drive({ bandEnergies: new Float32Array(3) })),
    ).toMatchObject({ accepted: false, reason: "invalid-drive-shape" });
    expect(
      joiner.acceptDrive(drive({ spectralBandEnergies: null })),
    ).toMatchObject({ accepted: false, reason: "invalid-drive-shape" });
    expect(joiner.acceptDrive(drive({ renderState: null }))).toMatchObject({
      accepted: false,
      reason: "invalid-drive-shape",
    });
    expect(joiner.readLatestModel()).toBeNull();
  });

  it("requires the visible topology identities to be the committed prefix", () => {
    const joiner = createAudioFeaturePacketJoiner();

    expect(
      joiner.acceptTopology(
        topology({
          committedModeIdentitySlots: new Float32Array([7, 8, 9]),
        }),
      ),
    ).toMatchObject({ accepted: false, reason: "invalid-topology-shape" });
  });

  it("discards a held future drive when its matching topology has another shape", () => {
    const joiner = createAudioFeaturePacketJoiner();
    joiner.acceptTopology(topology());
    joiner.acceptDrive(drive());
    joiner.acceptDrive(
      drive({
        topologyRevision: 2,
        frameId: 2,
        committedModeCount: 2,
        modalCoefficients: new Float32Array([0.5, 0.25]),
        phaseSlots: new Float32Array(8),
      }),
    );

    expect(
      joiner.acceptTopology(topology({ topologyRevision: 2 })),
    ).toMatchObject({
      accepted: true,
      published: false,
      reason: "discarded-mismatched-held-drive",
    });
    expect(joiner.readLatestModel().drive.frameId).toBe(1);
  });
});

describe("bounded audio input transport", () => {
  it("allows exactly one in flight and one coalesced pending input", () => {
    const send = vi.fn();
    const transport = createBoundedAudioInputTransport({ send });

    transport.offer({ captureTimestampMs: 1 });
    transport.offer({ captureTimestampMs: 2 });
    transport.offer({ captureTimestampMs: 3 });

    expect(send).toHaveBeenCalledTimes(1);
    expect(transport.getStatus()).toMatchObject({
      queueDepth: 2,
      pending: true,
      replacementCount: 1,
    });

    const first = send.mock.calls[0][0];
    expect(transport.acknowledge(first)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ captureTimestampMs: 3 });
    expect(transport.getStatus().queueDepth).toBe(1);
  });

  it("retains the newest unsent structural payload while fast data coalesces", () => {
    const sent = [];
    const transport = createBoundedAudioInputTransport({
      send(frame) {
        sent.push(frame);
      },
    });

    transport.offer({ fastPayload: "fast-1" });
    transport.offer({
      fastPayload: "fast-2",
      structuralPayload: "structural-2",
    });
    transport.offer({ fastPayload: "fast-3" });
    transport.acknowledge(sent[0]);

    expect(sent[1]).toMatchObject({
      fastPayload: "fast-3",
      structuralPayload: "structural-2",
    });
  });

  it("retains a structural request even when the audio capture is null", () => {
    const sent = [];
    const transport = createBoundedAudioInputTransport({
      send(frame) {
        sent.push(frame);
      },
    });

    transport.offer({ fastPayload: "fast-1" });
    transport.offer({
      fastPayload: null,
      structuralPayload: null,
      structuralRequested: true,
    });
    transport.offer({ fastPayload: "fast-3", structuralRequested: false });
    transport.acknowledge(sent[0]);

    expect(sent[1]).toMatchObject({
      fastPayload: "fast-3",
      structuralPayload: null,
      structuralRequested: true,
    });
  });

  it("does not let stale acknowledgements release current work", () => {
    const send = vi.fn();
    const transport = createBoundedAudioInputTransport({ send });
    transport.offer({ captureTimestampMs: 1 });
    transport.offer({ captureTimestampMs: 2 });

    expect(
      transport.acknowledge({
        sourceGeneration: 0,
        workerGeneration: 1,
        frameId: 1,
      }),
    ).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(transport.getStatus()).toMatchObject({
      queueDepth: 2,
      staleAcknowledgementCount: 1,
    });
  });
});
