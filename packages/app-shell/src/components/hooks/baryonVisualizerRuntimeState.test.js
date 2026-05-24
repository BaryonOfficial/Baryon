import { expect, test } from "vitest";
import {
  createRuntimeDiagnostics,
  maybePublishRuntimePerfSnapshot,
  shouldRenderExternalFrame,
  updateObservationTransferRenderDiagnostics,
} from "./baryonVisualizerRuntimeState.js";

test("renders duplicate external frames only when controls changed", () => {
  expect(
    shouldRenderExternalFrame({
      externalFrameState: { frameSequence: 10 },
      shouldAdvance: false,
      controlsChanged: false,
    }),
  ).toBe(false);
  expect(
    shouldRenderExternalFrame({
      externalFrameState: { frameSequence: 10 },
      shouldAdvance: false,
      controlsChanged: true,
    }),
  ).toBe(true);
});

test("renders duplicate external frames when a render is explicitly forced", () => {
  expect(
    shouldRenderExternalFrame({
      externalFrameState: { frameSequence: 10 },
      shouldAdvance: false,
      controlsChanged: false,
      forceRender: true,
    }),
  ).toBe(true);
});

test("publishes sanitized modal freshness diagnostics in runtime perf snapshots", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    runtimeDiagnostics.modalFreshness.structureSignal = 0.62;
    runtimeDiagnostics.modalFreshness.responseEnvelope = 0.47;
    runtimeDiagnostics.modalFreshness.modeSlotChangeCount = 5;
    runtimeDiagnostics.modalFreshness.detailSignalAuthoritative = true;
    runtimeDiagnostics.modalFreshness.detailSignalAuthoritativeReason =
      "fresh-signal";
    runtimeDiagnostics.modalFreshness.detailSignalAuthoritativeHighQ = true;
    runtimeDiagnostics.modalFreshness.detailShiftReleaseOverrideCount = 2;
    runtimeDiagnostics.modalFreshness.detailShiftTrackingOverrideCount = 3;
    runtimeDiagnostics.modalFreshness.fieldState = "active";
    runtimeDiagnostics.modalFreshness.avgAmplitude = 14.5;
    runtimeDiagnostics.modalFreshness.analyserRms = 0.048;
    runtimeDiagnostics.modalFreshness.periodicity = 0.79;
    runtimeDiagnostics.modalFreshness.modalObserverVisibilityEnergy = 0.36;
    runtimeDiagnostics.modalFreshness.modalPhaseAuthority = 0.27;
    runtimeDiagnostics.modalFreshness.highQPhaseAuthority = 0.41;
    runtimeDiagnostics.modalFreshness.lowQPhaseAuthority = 0.12;
    runtimeDiagnostics.modalFreshness.modalPhaseCoherentFieldModeCount = 5;
    runtimeDiagnostics.modalFreshness.highQDetailModeCount = 6;
    runtimeDiagnostics.modalFreshness.highQDetailEnergy = 0.42;
    runtimeDiagnostics.modalFreshness.highQRingSupport = 0.68;
    runtimeDiagnostics.modalFreshness.liveInputNoiseGateActive = false;
    runtimeDiagnostics.modalFreshness.liveInputHardSilenceActive = false;
    runtimeDiagnostics.modalFreshness._previousModeSlots = new Float32Array([
      0.1, 0.2,
    ]);

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.modalFreshness).toMatchObject({
      structureSignal: 0.62,
      responseEnvelope: 0.47,
      modeSlotChangeCount: 5,
      detailSignalAuthoritative: true,
      detailSignalAuthoritativeReason: "fresh-signal",
      detailSignalAuthoritativeHighQ: true,
      detailShiftReleaseOverrideCount: 2,
      detailShiftTrackingOverrideCount: 3,
      fieldState: "active",
      avgAmplitude: 14.5,
      analyserRms: 0.048,
      periodicity: 0.79,
      modalObserverVisibilityEnergy: 0.36,
      modalPhaseAuthority: 0.27,
      highQPhaseAuthority: 0.41,
      lowQPhaseAuthority: 0.12,
      modalPhaseCoherentFieldModeCount: 5,
      highQDetailModeCount: 6,
      highQDetailEnergy: 0.42,
      highQRingSupport: 0.68,
      liveInputNoiseGateActive: false,
      liveInputHardSilenceActive: false,
    });
    expect(snapshot.modalFreshness).not.toHaveProperty("_previousModeSlots");
    expect(globalThis.window.__baryonPerfMetrics.modalFreshness).toEqual(
      snapshot.modalFreshness,
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("publishes observation transfer raymarch diagnostics in render perf snapshots", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, {
      raymarchDebug: {
        observationEnergy: 0.28,
        observationAnchorMax: 0.64,
        observationSupportMax: 0.31,
        observedDensityFloorMax: 0.046,
        observedContourSupportMax: 0.012,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.observationEnergy).toBe(0.28);
    expect(snapshot.render.observationAnchorMax).toBe(0.64);
    expect(snapshot.render.observationSupportMax).toBe(0.31);
    expect(snapshot.render.observedDensityFloorMax).toBe(0.046);
    expect(snapshot.render.observedContourSupportMax).toBe(0.012);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("publishes effective field diagnostics in render perf snapshots", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, {
      raymarchDebug: {
        effectiveFieldActive: true,
        effectiveFieldReady: true,
        effectiveFieldSupportReady: true,
        effectiveFieldSupportSemantic: "effective-field-support",
        effectiveFieldUnsignedSupportMean: 0.57,
        effectiveFieldCancellationRatioMean: 0.36,
        effectiveFieldCancellationRatioMax: 0.91,
        effectiveFieldRebuildPending: false,
        effectiveFieldBackend: "compute",
        effectiveFieldResolution: 32,
        effectiveFieldRebuildCount: 7,
        effectiveFieldRebuildReason: "descriptor-change",
        effectiveFieldDescriptorFresh: true,
        effectiveFieldDescriptorStaleReason: null,
        effectiveFieldQueuedDescriptorPending: false,
        effectiveFieldLastError: null,
        effectiveFieldModeCount: 6,
        effectiveFieldAuthority: 0.42,
        effectiveFieldModeIdentityRetentionRatio: 0.73,
        effectiveFieldMaxRepresentableModeIndex: 27,
        effectiveFieldContributingModeCount: 5,
        effectiveFieldZeroAmplitudeSkippedModeCount: 1,
        effectiveFieldContributingModalEnergy: 0.64,
        effectiveFieldResolvedModalEnergyRatio: 0.77,
        effectiveFieldBandwidthRejectedModeCount: 2,
        effectiveFieldBandwidthRejectedModalEnergy: 0.19,
        effectiveFieldGradientEnvelope: 0.38,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.effectiveFieldActive).toBe(true);
    expect(snapshot.render.effectiveFieldReady).toBe(true);
    expect(snapshot.render.effectiveFieldSupportReady).toBe(true);
    expect(snapshot.render.effectiveFieldSupportSemantic).toBe(
      "effective-field-support",
    );
    expect(snapshot.render.effectiveFieldUnsignedSupportMean).toBe(0.57);
    expect(snapshot.render.effectiveFieldCancellationRatioMean).toBe(0.36);
    expect(snapshot.render.effectiveFieldCancellationRatioMax).toBe(0.91);
    expect(snapshot.render.effectiveFieldRebuildPending).toBe(false);
    expect(snapshot.render.effectiveFieldBackend).toBe("compute");
    expect(snapshot.render.effectiveFieldResolution).toBe(32);
    expect(snapshot.render.effectiveFieldRebuildCount).toBe(7);
    expect(snapshot.render.effectiveFieldRebuildReason).toBe(
      "descriptor-change",
    );
    expect(snapshot.render.effectiveFieldDescriptorFresh).toBe(true);
    expect(snapshot.render.effectiveFieldDescriptorStaleReason).toBeNull();
    expect(snapshot.render.effectiveFieldQueuedDescriptorPending).toBe(false);
    expect(snapshot.render.effectiveFieldLastError).toBeNull();
    expect(snapshot.render.effectiveFieldModeCount).toBe(6);
    expect(snapshot.render.effectiveFieldAuthority).toBe(0.42);
    expect(snapshot.render.effectiveFieldModeIdentityRetentionRatio).toBe(0.73);
    expect(snapshot.render.effectiveFieldMaxRepresentableModeIndex).toBe(27);
    expect(snapshot.render.effectiveFieldContributingModeCount).toBe(5);
    expect(snapshot.render.effectiveFieldZeroAmplitudeSkippedModeCount).toBe(1);
    expect(snapshot.render.effectiveFieldContributingModalEnergy).toBe(0.64);
    expect(snapshot.render.effectiveFieldResolvedModalEnergyRatio).toBe(0.77);
    expect(snapshot.render.effectiveFieldBandwidthRejectedModeCount).toBe(2);
    expect(snapshot.render.effectiveFieldBandwidthRejectedModalEnergy).toBe(
      0.19,
    );
    expect(snapshot.render.effectiveFieldGradientEnvelope).toBe(0.38);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("publishes effective field diagnostics from runtime state when audit is disabled", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null, {
      effectiveFieldCache: {
        active: true,
        ready: true,
        supportTexture: {},
        supportSemantic: "effective-field-support",
        effectiveFieldUnsignedSupportMean: 0.48,
        effectiveFieldCancellationRatioMean: 0.27,
        effectiveFieldCancellationRatioMax: 0.86,
        rebuildPending: false,
        backend: "compute",
        resolution: 32,
        rebuildCount: 9,
        lastRebuildReason: "modal-descriptor",
        descriptorStaleReason: "mode-count",
        lastError: null,
        activeEffectiveFieldModeCount: 6,
        effectiveFieldAuthority: 0.37,
        modeIdentityRetentionRatio: 0.61,
        effectiveFieldMaxRepresentableModeIndex: 31,
        contributingEffectiveFieldModeCount: 4,
        zeroAmplitudeSkippedModeCount: 2,
        contributingModalEnergy: 0.72,
        effectiveFieldResolvedModalEnergyRatio: 0.68,
        bandwidthRejectedModeCount: 3,
        bandwidthRejectedModalEnergy: 0.22,
        effectiveFieldGradientEnvelope: 0.45,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.effectiveFieldActive).toBe(true);
    expect(snapshot.render.effectiveFieldReady).toBe(true);
    expect(snapshot.render.effectiveFieldSupportReady).toBe(true);
    expect(snapshot.render.effectiveFieldSupportSemantic).toBe(
      "effective-field-support",
    );
    expect(snapshot.render.effectiveFieldUnsignedSupportMean).toBe(0.48);
    expect(snapshot.render.effectiveFieldCancellationRatioMean).toBe(0.27);
    expect(snapshot.render.effectiveFieldCancellationRatioMax).toBe(0.86);
    expect(snapshot.render.effectiveFieldRebuildPending).toBe(false);
    expect(snapshot.render.effectiveFieldBackend).toBe("compute");
    expect(snapshot.render.effectiveFieldResolution).toBe(32);
    expect(snapshot.render.effectiveFieldRebuildCount).toBe(9);
    expect(snapshot.render.effectiveFieldRebuildReason).toBe(
      "modal-descriptor",
    );
    expect(snapshot.render.effectiveFieldDescriptorStaleReason).toBe(
      "mode-count",
    );
    expect(snapshot.render.effectiveFieldLastError).toBeNull();
    expect(snapshot.render.effectiveFieldModeCount).toBe(6);
    expect(snapshot.render.effectiveFieldAuthority).toBe(0.37);
    expect(snapshot.render.effectiveFieldModeIdentityRetentionRatio).toBe(0.61);
    expect(snapshot.render.effectiveFieldMaxRepresentableModeIndex).toBe(31);
    expect(snapshot.render.effectiveFieldContributingModeCount).toBe(4);
    expect(snapshot.render.effectiveFieldZeroAmplitudeSkippedModeCount).toBe(2);
    expect(snapshot.render.effectiveFieldContributingModalEnergy).toBe(0.72);
    expect(snapshot.render.effectiveFieldResolvedModalEnergyRatio).toBe(0.68);
    expect(snapshot.render.effectiveFieldBandwidthRejectedModeCount).toBe(3);
    expect(snapshot.render.effectiveFieldBandwidthRejectedModalEnergy).toBe(
      0.22,
    );
    expect(snapshot.render.effectiveFieldGradientEnvelope).toBe(0.45);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("explains effective field descriptor staleness from runtime state when audit is disabled", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const activeDescriptor = {
    boundaryMode: "finite",
    cavityGeometry: "sphere",
    radius: 1,
    modalFieldCount: 3,
    modalFieldHash: 101,
    modalFieldPhaseHash: 303,
    phaseModeCount: 3,
    phaseAuthority: 0.75,
    descriptorOverflow: false,
    resolution: 32,
  };
  const currentDescriptor = {
    ...activeDescriptor,
    modalFieldPhaseHash: 405,
  };

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null, {
      currentEffectiveFieldDescriptor: currentDescriptor,
      effectiveFieldCache: {
        active: true,
        ready: true,
        supportTexture: {},
        activeDescriptor,
        rebuildPending: false,
        queuedDescriptor: null,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.effectiveFieldDescriptorFresh).toBe(false);
    expect(snapshot.render.effectiveFieldDescriptorStaleReason).toBe(
      "phase-slots",
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("keeps observation transfer render diagnostics non-authoritative without audit", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null);

  expect(runtimeDiagnostics.render.observationEnergy).toBe(0);
  expect(runtimeDiagnostics.render.observationAnchorMax).toBe(0);
  expect(runtimeDiagnostics.render.observationSupportMax).toBe(0);
  expect(runtimeDiagnostics.render.observedDensityFloorMax).toBe(0);
  expect(runtimeDiagnostics.render.observedContourSupportMax).toBe(0);
  expect(runtimeDiagnostics.render.effectiveFieldDescriptorStaleReason).toBe(
    null,
  );
});
