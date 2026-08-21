import { describe, expect, it } from "vitest";
import { applyRaymarchModalPacketUploads } from "./runtimeModalUpload.js";
import { deriveModalFieldCacheTransferAmplitude } from "./fieldCachePassband.js";
import { RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE } from "./radiationPotentialPacket.js";

function createBuffer(length = 8) {
  return {
    value: {
      array: new Float32Array(length),
      needsUpdate: false,
    },
  };
}

function createModalUploadHarness() {
  const runtimeState = {
    modalFieldModeBuffer: createBuffer(),
    modalFieldResponseBuffer: createBuffer(),
    modalFieldSpectralMomentBuffer: createBuffer(),
    modalFieldCoefficientBuffer: createBuffer(
      2 * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
    ),
    uniforms: {},
  };
  const modalIdentitySlots = new Float32Array([1, 2, 3, 4, 5, 6]);
  const modalCoefficientSlots = new Float32Array([0.25, 0.75]);
  const modalFieldPhaseSlots = new Float32Array(8);
  const modalDescriptor = {
    fieldAuthority: "complete",
    counts: {
      modalFieldModeCount: 2,
    },
    slotViews: {
      modalIdentitySlots,
      modalCoefficientSlots,
      modalFieldPhaseSlots,
      modalFieldSpectralMomentSlots: new Float32Array(8),
      modalFieldMetadataSlots: new Float32Array([
        100, 10, 100, 1, 200, 10, 200, 1,
      ]),
    },
  };
  const featureFrame = {
    frameId: 1,
    sourceGeneration: 1,
    workerGeneration: 1,
    topologyRevision: 1,
    basisIdentityHash: 123,
    observationTimelineRevision: 1,
    observationInputSignature: "fixture",
    activeModeCount: 2,
    activeModalFieldModeCount: 2,
    renderAuthority: true,
    modalIdentitySlots,
    modalCoefficientSlots,
    modalFieldPhaseSlots,
    modalDescriptor,
  };

  return { runtimeState, modalDescriptor, featureFrame };
}

function advanceDriveFrame(harness, coefficients = null) {
  const modalCoefficientSlots =
    coefficients ?? harness.featureFrame.modalCoefficientSlots;
  harness.modalDescriptor = {
    ...harness.modalDescriptor,
    slotViews: {
      ...harness.modalDescriptor.slotViews,
      modalCoefficientSlots,
    },
  };
  harness.featureFrame = {
    ...harness.featureFrame,
    frameId: harness.featureFrame.frameId + 1,
    modalCoefficientSlots,
    modalDescriptor: harness.modalDescriptor,
  };
  return harness.featureFrame;
}

function reviseBasis(harness, updates = {}) {
  harness.featureFrame = {
    ...harness.featureFrame,
    frameId: harness.featureFrame.frameId + 1,
    topologyRevision: harness.featureFrame.topologyRevision + 1,
    ...updates,
  };
  harness.modalDescriptor.slotViews.modalIdentitySlots =
    harness.featureFrame.modalIdentitySlots;
  harness.modalDescriptor.slotViews.modalCoefficientSlots =
    harness.featureFrame.modalCoefficientSlots;
  return harness.featureFrame;
}

function applyModalPacket(
  harness,
  featureFrame = harness.featureFrame,
  overrides = {},
) {
  return applyRaymarchModalPacketUploads({
    runtimeState: harness.runtimeState,
    featureFrame,
    modalDescriptor: harness.modalDescriptor,
    productUploadCapacity: 2,
    effectiveCavityGeometry: "rectangular",
    ...overrides,
  });
}

describe("raymarch modal coefficient uploads", () => {
  it("reuses an unchanged live coefficient packet", () => {
    const harness = createModalUploadHarness();
    const coefficientBuffer = harness.runtimeState.modalFieldCoefficientBuffer;
    const firstTransfer = deriveModalFieldCacheTransferAmplitude(
      Math.sqrt(1 ** 2 + 2 ** 2 + 3 ** 2),
    );
    const secondTransfer = deriveModalFieldCacheTransferAmplitude(
      Math.sqrt(4 ** 2 + 5 ** 2 + 6 ** 2),
    );
    const observedCoefficientNorm = Math.hypot(
      0.25 * firstTransfer,
      0.75 * secondTransfer,
    );

    expect(applyModalPacket(harness).modalFieldModeCount).toBe(2);
    expect(coefficientBuffer.value.needsUpdate).toBe(true);

    coefficientBuffer.value.needsUpdate = false;
    expect(applyModalPacket(harness).modalFieldModeCount).toBe(2);

    expect(coefficientBuffer.value.needsUpdate).toBe(false);
    expect(coefficientBuffer.value.array[0]).toBeCloseTo(
      (0.25 * firstTransfer) / observedCoefficientNorm,
    );
    expect(coefficientBuffer.value.array[4]).toBeCloseTo(
      (0.75 * secondTransfer) / observedCoefficientNorm,
    );
    expect(
      Math.hypot(
        coefficientBuffer.value.array[0],
        coefficientBuffer.value.array[4],
      ),
    ).toBeCloseTo(1);
    // Lanes y/z/w carry the mode's position-invariant family scalars: the
    // combined energy/permutation scale, and the two three-term masks. They
    // are a pure function of the index triple and the boundary.
    for (const slotIndex of [0, 1]) {
      const [familyScale, threeTermUVMask, threeTermVWMask] = Array.from(
        coefficientBuffer.value.array.slice(
          slotIndex * 4 + 1,
          slotIndex * 4 + 4,
        ),
      );
      expect(familyScale).toBeGreaterThan(0);
      expect([0, 1]).toContain(threeTermUVMask);
      expect([0, 1]).toContain(threeTermVWMask);
    }
    expect(
      harness.runtimeState.radiationPotentialCoefficientFrame.exposureDrive,
    ).toBeGreaterThan(0);
    expect(
      harness.runtimeState.radiationPotentialCoefficientFrame
        .analyticPotentialEvaluationCountPerSample,
    ).toBe(2);
  });

  it("updates common exposure without re-uploading normalized topology", () => {
    const harness = createModalUploadHarness();
    const coefficientBuffer = harness.runtimeState.modalFieldCoefficientBuffer;

    applyModalPacket(harness);
    const initialPacket = Array.from(coefficientBuffer.value.array);
    const initialExposureDrive =
      harness.runtimeState.radiationPotentialCoefficientFrame.exposureDrive;
    coefficientBuffer.value.needsUpdate = false;
    advanceDriveFrame(harness, new Float32Array([0.5, 1.5]));

    applyModalPacket(harness);

    expect(coefficientBuffer.value.needsUpdate).toBe(false);
    expect(Array.from(coefficientBuffer.value.array)).toEqual(initialPacket);
    expect(
      harness.runtimeState.radiationPotentialCoefficientFrame.exposureDrive,
    ).toBeGreaterThan(initialExposureDrive);
  });

  it("refreshes per-mode cache-passband transfer when identity changes at equal coefficient", () => {
    const harness = createModalUploadHarness();
    const coefficientBuffer = harness.runtimeState.modalFieldCoefficientBuffer;

    applyModalPacket(harness);
    coefficientBuffer.value.needsUpdate = false;
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([1, 2, 3, 0, 0, 14]),
    });

    applyModalPacket(harness);

    const firstTransfer = deriveModalFieldCacheTransferAmplitude(
      Math.sqrt(1 ** 2 + 2 ** 2 + 3 ** 2),
    );
    const secondTransfer = deriveModalFieldCacheTransferAmplitude(14);
    const observedCoefficientNorm = Math.hypot(
      0.25 * firstTransfer,
      0.75 * secondTransfer,
    );
    expect(coefficientBuffer.value.needsUpdate).toBe(true);
    expect(coefficientBuffer.value.array[4]).toBeCloseTo(
      (0.75 * secondTransfer) / observedCoefficientNorm,
    );
  });

  it("preserves phase opposition while keeping modal energy invariant", () => {
    const harness = createModalUploadHarness();
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([1, 2, 3, 1, 2, 3]),
      modalCoefficientSlots: new Float32Array([1, 1]),
    });
    const modalFieldPhaseSlots = new Float32Array([
      0,
      200,
      1,
      1,
      Math.PI,
      200,
      1,
      1,
    ]);
    harness.modalDescriptor.slotViews.modalFieldPhaseSlots =
      modalFieldPhaseSlots;
    harness.featureFrame.modalFieldPhaseSlots = modalFieldPhaseSlots;

    applyModalPacket(harness);

    const packet = harness.runtimeState.modalFieldCoefficientBuffer.value.array;
    const response = harness.runtimeState.modalFieldResponseBuffer.value.array;
    expect(packet[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(packet[4]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(response[2]).toBeCloseTo(0, 6);
    expect(response[6]).toBeCloseTo(0, 6);
    expect(
      harness.runtimeState.radiationPotentialCoefficientFrame
        .normalizedEnergySum,
    ).toBeCloseTo(1, 6);
  });

  it("marks coherent shell boundaries and carries inverse response wavenumber", () => {
    const harness = createModalUploadHarness();
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([0, 0, 6, 2, 4, 4]),
    });
    harness.modalDescriptor.slotViews.modalFieldMetadataSlots =
      new Float32Array([355.2, 10, 177.6, 1, 355.2, 10, 177.6, 1]);

    applyModalPacket(harness);

    const modes = harness.runtimeState.modalFieldModeBuffer.value.array;
    const response = harness.runtimeState.modalFieldResponseBuffer.value.array;
    expect(modes[3]).toBe(1);
    expect(modes[7]).toBe(1);
    expect(response[0]).toBe(0);
    expect(response[1]).toBe(0);
    expect(response[3]).toBeCloseTo(1 / (1.5 * Math.PI), 6);
    expect(response[4]).toBe(0);
    expect(response[5]).toBe(1);
    expect(response[7]).toBeCloseTo(1 / (1.5 * Math.PI), 6);
  });

  it("coheres distinct natural shells at one response frequency", () => {
    const harness = createModalUploadHarness();
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([0, 0, 4, 0, 0, 6]),
    });
    harness.modalDescriptor.slotViews.modalFieldMetadataSlots =
      new Float32Array([236.8, 10, 177.6, 1, 355.2, 10, 177.6, 1]);

    applyModalPacket(harness);

    const response = harness.runtimeState.modalFieldResponseBuffer.value.array;
    expect(response[0]).toBe(0);
    expect(response[1]).toBe(0);
    expect(response[3]).toBeCloseTo(1 / (1.5 * Math.PI), 6);
    expect(response[4]).toBe(0);
    expect(response[5]).toBe(1);
    expect(response[7]).toBeCloseTo(response[3], 7);
  });

  it("sorts the GPU packet by response frequency before marking groups", () => {
    const harness = createModalUploadHarness();
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([0, 0, 6, 0, 0, 4]),
      modalCoefficientSlots: new Float32Array([0.25, 0.75]),
    });
    harness.modalDescriptor.slotViews.modalFieldMetadataSlots =
      new Float32Array([355.2, 10, 300, 1, 236.8, 10, 200, 1]);
    applyModalPacket(harness);

    const modes = harness.runtimeState.modalFieldModeBuffer.value.array;
    const response = harness.runtimeState.modalFieldResponseBuffer.value.array;
    expect(Array.from(modes.slice(0, 3))).toEqual([0, 0, 4]);
    expect(Array.from(modes.slice(4, 7))).toEqual([0, 0, 6]);
    expect(response[1]).toBe(1);
    expect(response[5]).toBe(1);
  });

  it("preserves a partially occupied source prefix after GPU sorting", () => {
    const harness = createModalUploadHarness();
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([0, 0, 6, 0, 0, 4]),
      modalCoefficientSlots: new Float32Array([1]),
      activeModeCount: 1,
      activeModalFieldModeCount: 1,
    });
    harness.modalDescriptor.slotViews.modalFieldMetadataSlots =
      new Float32Array([355.2, 10, 300, 1, 236.8, 10, 200, 1]);

    expect(applyModalPacket(harness).modalFieldModeCount).toBe(2);

    const packet = harness.runtimeState.modalFieldCoefficientBuffer.value.array;
    expect(packet[0]).toBe(0);
    expect(packet[4]).toBeCloseTo(1, 6);
    expect(harness.runtimeState.raymarchFieldAnalysis.modalField).toMatchObject({
      originalActiveCount: 1,
      uploadedActiveCount: 2,
      occupiedSlotSpan: 2,
    });
  });

  it("uses the existing response lane for the imaginary quadrature", () => {
    const harness = createModalUploadHarness();
    const modalFieldPhaseSlots = new Float32Array([
      Math.PI / 2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    harness.modalDescriptor.slotViews.modalFieldPhaseSlots =
      modalFieldPhaseSlots;
    harness.featureFrame.modalFieldPhaseSlots = modalFieldPhaseSlots;

    applyModalPacket(harness);

    const packet = harness.runtimeState.modalFieldCoefficientBuffer.value.array;
    const response = harness.runtimeState.modalFieldResponseBuffer.value.array;
    expect(packet[0]).toBeCloseTo(0, 6);
    expect(response[2]).toBeGreaterThan(0);
    expect(
      Math.hypot(packet[0], response[2], packet[4], response[6]),
    ).toBeCloseTo(1, 6);
  });

  it("does not coherently merge distinct response frequencies in one eigenvalue shell", () => {
    const harness = createModalUploadHarness();
    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([0, 0, 6, 2, 4, 4]),
    });
    harness.modalDescriptor.slotViews.modalFieldMetadataSlots =
      new Float32Array([355.2, 10, 177.6, 1, 355.2, 10, 177.60005, 1]);

    applyModalPacket(harness);

    const response = harness.runtimeState.modalFieldResponseBuffer.value.array;
    expect(response[1]).toBe(1);
    expect(response[5]).toBe(1);
  });

  it("uploads a cleared buffer when the active coefficient count reaches zero", () => {
    const harness = createModalUploadHarness();
    const coefficientBuffer = harness.runtimeState.modalFieldCoefficientBuffer;

    applyModalPacket(harness);
    coefficientBuffer.value.needsUpdate = false;
    const clearedFrame = {
      ...harness.featureFrame,
      frameId: harness.featureFrame.frameId + 1,
      activeModeCount: 0,
      activeModalFieldModeCount: 0,
      modalCoefficientSlots: new Float32Array(0),
    };
    harness.modalDescriptor = {
      ...harness.modalDescriptor,
      slotViews: {
        ...harness.modalDescriptor.slotViews,
        modalCoefficientSlots: clearedFrame.modalCoefficientSlots,
      },
    };
    clearedFrame.modalDescriptor = harness.modalDescriptor;

    expect(applyModalPacket(harness, clearedFrame).modalFieldModeCount).toBe(0);
    expect(coefficientBuffer.value.needsUpdate).toBe(true);
    for (let modeIndex = 0; modeIndex < 2; modeIndex += 1) {
      expect(coefficientBuffer.value.array[modeIndex * 4]).toBe(0);
      expect(
        Array.from(
          coefficientBuffer.value.array.slice(
            modeIndex * 4 + 1,
            modeIndex * 4 + 4,
          ),
        ).some((value) => value !== 0),
      ).toBe(true);
    }
    expect(
      harness.runtimeState.radiationPotentialCoefficientFrame.exposureDrive,
    ).toBe(0);
  });

  it("compiles only on basis changes and streams only on new drive frames", () => {
    const harness = createModalUploadHarness();

    applyModalPacket(harness);
    expect(harness.runtimeState.raymarchUploadState.counters).toEqual({
      basisCompileCount: 1,
      driveUpdateCount: 1,
      coefficientUploadCount: 1,
    });

    for (const presentationOnlyChange of [
      { cameraRevision: 2 },
      { bloomEnabled: true, bloomStrength: 1.25 },
      { viewportWidth: 2560, viewportHeight: 1536 },
      { outputResolutionScale: 0.75 },
      { renderFrameId: 500, frameDeltaSeconds: 1 / 24 },
    ]) {
      applyModalPacket(harness, harness.featureFrame, presentationOnlyChange);
    }
    expect(harness.runtimeState.raymarchUploadState.counters).toEqual({
      basisCompileCount: 1,
      driveUpdateCount: 1,
      coefficientUploadCount: 1,
    });

    advanceDriveFrame(harness, new Float32Array([0.4, 0.6]));
    applyModalPacket(harness);
    expect(harness.runtimeState.raymarchUploadState.counters).toEqual({
      basisCompileCount: 1,
      driveUpdateCount: 2,
      coefficientUploadCount: 2,
    });

    reviseBasis(harness, {
      modalIdentitySlots: new Float32Array([1, 2, 3, 0, 0, 14]),
    });
    applyModalPacket(harness);
    expect(harness.runtimeState.raymarchUploadState.counters).toEqual({
      basisCompileCount: 2,
      driveUpdateCount: 3,
      coefficientUploadCount: 3,
    });

    applyModalPacket(harness, harness.featureFrame, {
      effectiveCavityGeometry: "cylindrical",
    });
    expect(
      harness.runtimeState.raymarchUploadState.counters.basisCompileCount,
    ).toBe(3);
  });

  it("scopes topology revisions to their source and worker generations", () => {
    const harness = createModalUploadHarness();

    applyModalPacket(harness);
    harness.featureFrame = {
      ...harness.featureFrame,
      frameId: harness.featureFrame.frameId + 1,
      sourceGeneration: harness.featureFrame.sourceGeneration + 1,
    };
    applyModalPacket(harness);
    harness.featureFrame = {
      ...harness.featureFrame,
      frameId: harness.featureFrame.frameId + 1,
      workerGeneration: harness.featureFrame.workerGeneration + 1,
    };
    applyModalPacket(harness);

    expect(harness.runtimeState.raymarchUploadState.counters).toEqual({
      basisCompileCount: 3,
      driveUpdateCount: 3,
      coefficientUploadCount: 3,
    });
  });

  it("treats topology revisions as authoritative across equivalent wrappers", () => {
    const harness = createModalUploadHarness();

    applyModalPacket(harness);
    const initialCounters = {
      ...harness.runtimeState.raymarchUploadState.counters,
    };
    const wrappedIdentitySlots = new Float32Array(
      harness.featureFrame.modalIdentitySlots,
    );
    const wrappedCoefficientSlots = new Float32Array(
      harness.featureFrame.modalCoefficientSlots,
    );
    const wrappedFrame = {
      ...harness.featureFrame,
      modalIdentitySlots: wrappedIdentitySlots,
      modalCoefficientSlots: wrappedCoefficientSlots,
    };
    harness.modalDescriptor = {
      ...harness.modalDescriptor,
      slotViews: {
        ...harness.modalDescriptor.slotViews,
        modalIdentitySlots: wrappedIdentitySlots,
        modalCoefficientSlots: wrappedCoefficientSlots,
        modalFieldSpectralMomentSlots: new Float32Array(
          harness.modalDescriptor.slotViews.modalFieldSpectralMomentSlots,
        ),
        modalFieldMetadataSlots: new Float32Array(
          harness.modalDescriptor.slotViews.modalFieldMetadataSlots,
        ),
      },
    };
    wrappedFrame.modalDescriptor = harness.modalDescriptor;

    applyModalPacket(harness, wrappedFrame);

    expect(harness.runtimeState.raymarchUploadState.counters).toEqual(
      initialCounters,
    );
  });

  it("treats frameId as authoritative across equivalent drive wrappers", () => {
    const harness = createModalUploadHarness();
    const phases = new Float32Array(8);
    harness.modalDescriptor.slotViews.modalFieldPhaseSlots = phases;
    harness.featureFrame.modalFieldPhaseSlots = phases;

    applyModalPacket(harness);
    const initialCounters = {
      ...harness.runtimeState.raymarchUploadState.counters,
    };
    const wrappedFrame = {
      ...harness.featureFrame,
      modalCoefficientSlots: new Float32Array(
        harness.featureFrame.modalCoefficientSlots,
      ),
      modalFieldPhaseSlots: new Float32Array(phases),
    };
    harness.modalDescriptor = {
      ...harness.modalDescriptor,
      slotViews: {
        ...harness.modalDescriptor.slotViews,
        modalCoefficientSlots: wrappedFrame.modalCoefficientSlots,
        modalFieldPhaseSlots: wrappedFrame.modalFieldPhaseSlots,
      },
    };
    wrappedFrame.modalDescriptor = harness.modalDescriptor;

    applyModalPacket(harness, wrappedFrame);

    expect(harness.runtimeState.raymarchUploadState.counters).toEqual(
      initialCounters,
    );
  });

  it("recompiles static payloads when GPU resources are replaced", () => {
    const harness = createModalUploadHarness();

    applyModalPacket(harness);
    harness.runtimeState.modalFieldModeBuffer = createBuffer();
    harness.runtimeState.modalFieldResponseBuffer = createBuffer();
    harness.runtimeState.modalFieldSpectralMomentBuffer = createBuffer();
    harness.runtimeState.modalFieldCoefficientBuffer = createBuffer(
      2 * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
    );

    expect(applyModalPacket(harness).modalFieldModeCount).toBe(2);
    expect(harness.runtimeState.raymarchUploadState.counters).toEqual({
      basisCompileCount: 2,
      driveUpdateCount: 2,
      coefficientUploadCount: 2,
    });
    expect(
      Array.from(
        harness.runtimeState.modalFieldModeBuffer.value.array.slice(0, 3),
      ),
    ).toEqual([1, 2, 3]);
    expect(
      harness.runtimeState.modalFieldCoefficientBuffer.value.array[0],
    ).not.toBe(0);
  });
});
