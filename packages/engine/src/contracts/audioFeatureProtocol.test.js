import { describe, expect, it } from "vitest";
import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  assertCanonicalModalDescriptor,
  assertRendererFeatureUploadContract,
  isAudioFeatureDrivePacket,
  isAudioFeatureTopologyPacket,
  isCompleteAudioFeatureModel,
} from "./audioFeatureProtocol.js";

function createTopology(overrides = {}) {
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
    modalFieldSpectralMomentSlots: new Float32Array(4),
    modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
    modalFieldMetadataSlots: new Float32Array([220, 20, 220, 1]),
    ...overrides,
  };
}

function createDrive(overrides = {}) {
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
    renderState: { renderAuthority: true },
    ...overrides,
  };
}

function createRendererDescriptor(overrides = {}) {
  return {
    fieldAuthority: "complete",
    counts: { modalFieldModeCount: 1 },
    slotViews: {
      modalIdentitySlots: new Float32Array([1, 2, 3]),
      modalCoefficientSlots: new Float32Array([0.5]),
      modalFieldPhaseSlots: new Float32Array(4),
      modalFieldSpectralMomentSlots: new Float32Array(4),
      modalFieldMetadataSlots: new Float32Array([220, 20, 220, 1]),
    },
    ...overrides,
  };
}

describe("strict audio-feature protocol contract", () => {
  it("accepts one matching complete packet model", () => {
    const topology = createTopology();
    const drive = createDrive();

    expect(isAudioFeatureTopologyPacket(topology)).toBe(true);
    expect(isAudioFeatureDrivePacket(drive)).toBe(true);
    expect(isCompleteAudioFeatureModel({ topology, drive })).toBe(true);
  });

  it("rejects cross-generation and cross-revision packet joins", () => {
    const topology = createTopology();

    expect(
      isCompleteAudioFeatureModel({
        topology,
        drive: createDrive({ workerGeneration: 2 }),
      }),
    ).toBe(false);
    expect(
      isCompleteAudioFeatureModel({
        topology,
        drive: createDrive({ topologyRevision: 2 }),
      }),
    ).toBe(false);
  });

  it("requires complete descriptor lanes before renderer upload", () => {
    const modalDescriptor = createRendererDescriptor();
    const featureFrame = {
      frameId: 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      activeModeCount: 1,
      activeModalFieldModeCount: 1,
      modalIdentitySlots: modalDescriptor.slotViews.modalIdentitySlots,
      modalCoefficientSlots: modalDescriptor.slotViews.modalCoefficientSlots,
      modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
      modalDescriptor,
      renderAuthority: true,
    };

    expect(() => assertCanonicalModalDescriptor(modalDescriptor)).not.toThrow();
    expect(() =>
      assertRendererFeatureUploadContract(featureFrame, modalDescriptor),
    ).not.toThrow();
    expect(() =>
      assertRendererFeatureUploadContract(
        { ...featureFrame, modalIdentitySlots: new Float32Array(2) },
        modalDescriptor,
      ),
    ).toThrow("Invalid renderer feature upload contract");
    expect(() =>
      assertRendererFeatureUploadContract(
        {
          ...featureFrame,
          modalIdentitySlots: new Float32Array(
            featureFrame.modalIdentitySlots,
          ),
        },
        modalDescriptor,
      ),
    ).toThrow("Invalid renderer feature upload contract");
    expect(() =>
      assertRendererFeatureUploadContract(featureFrame, {
        ...modalDescriptor,
      }),
    ).toThrow("Invalid renderer feature upload contract");
    expect(() =>
      assertRendererFeatureUploadContract(
        { ...featureFrame, renderAuthority: undefined },
        modalDescriptor,
      ),
    ).toThrow("Invalid renderer feature upload contract");
  });

  it("keeps topology capacity distinct from the live coefficient prefix", () => {
    const modalDescriptor = createRendererDescriptor({
      counts: { modalFieldModeCount: 2 },
      slotViews: {
        modalIdentitySlots: new Float32Array([1, 2, 3, 4, 5, 6]),
        modalCoefficientSlots: new Float32Array([0.5]),
        modalFieldPhaseSlots: new Float32Array(8),
        modalFieldSpectralMomentSlots: new Float32Array(8),
        modalFieldMetadataSlots: new Float32Array(8),
      },
    });
    const featureFrame = {
      frameId: 2,
      sourceGeneration: 1,
      workerGeneration: 1,
      topologyRevision: 1,
      activeModeCount: 1,
      activeModalFieldModeCount: 1,
      modalIdentitySlots: modalDescriptor.slotViews.modalIdentitySlots,
      modalCoefficientSlots: modalDescriptor.slotViews.modalCoefficientSlots,
      modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
      modalDescriptor,
      renderAuthority: false,
    };

    expect(() =>
      assertRendererFeatureUploadContract(featureFrame, modalDescriptor),
    ).not.toThrow();
    expect(() =>
      assertRendererFeatureUploadContract(
        { ...featureFrame, activeModeCount: 3, activeModalFieldModeCount: 3 },
        modalDescriptor,
      ),
    ).toThrow("Invalid renderer feature upload contract");
  });
});
