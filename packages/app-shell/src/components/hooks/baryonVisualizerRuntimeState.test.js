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
    runtimeDiagnostics.modalFreshness.resonantSignalAuthoritative = true;
    runtimeDiagnostics.modalFreshness.resonantSignalAuthoritativeReason =
      "fresh-signal";
    runtimeDiagnostics.modalFreshness.resonantSignalAuthoritativeHighQ = true;
    runtimeDiagnostics.modalFreshness.resonantShiftReleaseOverrideCount = 2;
    runtimeDiagnostics.modalFreshness.resonantShiftTrackingOverrideCount = 3;
    runtimeDiagnostics.modalFreshness.sourceEvidence = {
      ownerVersion: "audio-source-evidence:v1",
      sourceKind: "system",
      analysisClass: "line-feed",
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
      sourceEnergy: 0.42,
      metrics: {
        avgAmplitude: 16,
        analyserRms: 0.04,
        preModalFftPeak: 0.36,
        nonZeroFftBinCount: 192,
      },
      transport: {
        playing: false,
        liveInputActive: true,
        fileMuted: false,
        lineFeedProgramActive: true,
        micHardSilence: false,
      },
    };
    runtimeDiagnostics.modalFreshness.fieldState = "active";
    runtimeDiagnostics.modalFreshness.avgAmplitude = 14.5;
    runtimeDiagnostics.modalFreshness.analyserRms = 0.048;
    runtimeDiagnostics.modalFreshness.periodicity = 0.79;
    runtimeDiagnostics.modalFreshness.modalObserverVisibilityEnergy = 0.36;
    runtimeDiagnostics.modalFreshness.modalPhaseAuthority = 0.27;
    runtimeDiagnostics.modalFreshness.highQPhaseAuthority = 0.41;
    runtimeDiagnostics.modalFreshness.lowQPhaseAuthority = 0.12;
    runtimeDiagnostics.modalFreshness.modalPhaseCoherentFieldModeCount = 5;
    runtimeDiagnostics.modalFreshness.observedResonanceModeCount = 6;
    runtimeDiagnostics.modalFreshness.observedResonanceEnergy = 0.42;
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
      resonantSignalAuthoritative: true,
      resonantSignalAuthoritativeReason: "fresh-signal",
      resonantSignalAuthoritativeHighQ: true,
      resonantShiftReleaseOverrideCount: 2,
      resonantShiftTrackingOverrideCount: 3,
      sourceEvidence: {
        ownerVersion: "audio-source-evidence:v1",
        sourceKind: "system",
        analysisClass: "line-feed",
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        sourceEnergy: 0.42,
        metrics: {
          avgAmplitude: 16,
          analyserRms: 0.04,
          preModalFftPeak: 0.36,
          nonZeroFftBinCount: 192,
        },
        transport: {
          playing: false,
          liveInputActive: true,
          fileMuted: false,
          lineFeedProgramActive: true,
          micHardSilence: false,
        },
      },
      fieldState: "active",
      avgAmplitude: 14.5,
      analyserRms: 0.048,
      periodicity: 0.79,
      modalObserverVisibilityEnergy: 0.36,
      modalPhaseAuthority: 0.27,
      highQPhaseAuthority: 0.41,
      lowQPhaseAuthority: 0.12,
      modalPhaseCoherentFieldModeCount: 5,
      observedResonanceModeCount: 6,
      observedResonanceEnergy: 0.42,
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
        observationReferenceAnchor: 0.64,
        observationReferenceSupport: 0.31,
        observationReferenceDensityFloor: 0.046,
        observationReferenceContourSupport: 0.012,
        observationSampledAnchor: 0.24,
        observationSampledSignedAuthority: 0.91,
        observationSampledSupport: 0.18,
        observationSampledDensityFloor: 0.011,
        observationSampledContourSupport: 0.003,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.observationEnergy).toBe(0.28);
    expect(snapshot.render.observationReferenceAnchor).toBe(0.64);
    expect(snapshot.render.observationReferenceSupport).toBe(0.31);
    expect(snapshot.render.observationReferenceDensityFloor).toBe(0.046);
    expect(snapshot.render.observationReferenceContourSupport).toBe(0.012);
    expect(snapshot.render.observationSampledAnchor).toBe(0.24);
    expect(snapshot.render.observationSampledSignedAuthority).toBe(0.91);
    expect(snapshot.render.observationSampledSupport).toBe(0.18);
    expect(snapshot.render.observationSampledDensityFloor).toBe(0.011);
    expect(snapshot.render.observationSampledContourSupport).toBe(0.003);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("publishes modal basis cache diagnostics in render perf snapshots", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    const modalVarietyAudit = {
      semanticModeCount: 9,
      representedBasisPageModeCount: 5,
      basisAtlasPageCapacity: 12,
      basisAtlasPressure: 5 / 12,
      energyEffectiveModeCount: 4.2,
      renderRepresentedEnergyRatio: 0.77,
      basisAtlasCapacitySweep: [
        {
          basisAtlasPageCapacity: 12,
          renderRepresentedEnergyRatio: 0.77,
        },
      ],
    };
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, {
      raymarchDebug: {
        modalBasisCacheActive: true,
        modalBasisCacheReady: true,
        modalBasisCacheSupportReady: true,
        modalBasisCacheSupportSemantic: "coefficient-invariant-basis-support",
        liveSynthesisUnsignedSupportMean: 0.57,
        liveSynthesisCancellationRatioMean: 0.36,
        liveSynthesisCancellationRatioMax: 0.91,
        liveSynthesisSupportDiagnosticSampleCount: 9,
        liveSynthesisSupportDiagnosticSupportedSampleCount: 5,
        liveSynthesisSupportDiagnosticCoverage: 5 / 9,
        modalBasisCacheRebuildPending: false,
        modalBasisCacheBackend: "compute",
        modalBasisCacheResolution: 32,
        modalBasisCacheRebuildCount: 7,
        modalBasisCacheRebuildReason: "descriptor-change",
        modalBasisCacheGeneration: 12,
        modalBasisCacheAgeMs: 34,
        liveModalFrameAgeMs: 5,
        modalBasisCacheDiagnosticReason: "modal-identity",
        modalBasisAtlasDepth: 192,
        liveSynthesisModeCount: 12,
        modalBasisCacheDescriptorFresh: true,
        modalBasisCacheDescriptorStaleReason: null,
        modalBasisCacheQueuedDescriptorPending: false,
        modalBasisCacheLastError: null,
        modalBasisCacheModeCount: 6,
        modalBasisCachePhaseAuthority: 0.42,
        modalBasisCacheModeIdentityRetentionRatio: 0.73,
        modalBasisCacheMaxRepresentableModeIndex: 27,
        modalBasisCacheContributingModeCount: 5,
        modalBasisCacheZeroAmplitudeSkippedModeCount: 1,
        modalBasisCacheContributingRawModalEnergy: 0.64,
        modalBasisCacheContributingStructuralModalEnergy: 0.52,
        liveSynthesisResolvedRawModalEnergyRatio: 0.77,
        liveSynthesisResolvedStructuralModalEnergyRatio: 0.8,
        modalBasisCacheBandwidthRejectedModeCount: 2,
        modalBasisCacheBandwidthRejectedRawModalEnergy: 0.19,
        modalBasisCacheBandwidthRejectedStructuralModalEnergy: 0.13,
        liveSynthesisRawGradientEnvelope: 0.38,
        liveSynthesisStructuralGradientEnvelope: 0.24,
        modalVarietyAudit,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.modalBasisCacheActive).toBe(true);
    expect(snapshot.render.modalBasisCacheReady).toBe(true);
    expect(snapshot.render.modalBasisCacheSupportReady).toBe(true);
    expect(snapshot.render.modalBasisCacheSupportSemantic).toBe(
      "coefficient-invariant-basis-support",
    );
    expect(snapshot.render.liveSynthesisUnsignedSupportMean).toBe(0.57);
    expect(snapshot.render.liveSynthesisCancellationRatioMean).toBe(0.36);
    expect(snapshot.render.liveSynthesisCancellationRatioMax).toBe(0.91);
    expect(snapshot.render.liveSynthesisSupportDiagnosticSampleCount).toBe(9);
    expect(
      snapshot.render.liveSynthesisSupportDiagnosticSupportedSampleCount,
    ).toBe(5);
    expect(snapshot.render.liveSynthesisSupportDiagnosticCoverage).toBe(5 / 9);
    expect(snapshot.render.modalBasisCacheRebuildPending).toBe(false);
    expect(snapshot.render.modalBasisCacheBackend).toBe("compute");
    expect(snapshot.render.modalBasisCacheResolution).toBe(32);
    expect(snapshot.render.modalBasisCacheRebuildCount).toBe(7);
    expect(snapshot.render.modalBasisCacheRebuildReason).toBe(
      "descriptor-change",
    );
    expect(snapshot.render.modalBasisCacheGeneration).toBe(12);
    expect(snapshot.render.modalBasisCacheRebuildCount).toBe(7);
    expect(snapshot.render.modalBasisCacheAgeMs).toBe(34);
    expect(snapshot.render.liveModalFrameAgeMs).toBe(5);
    expect(snapshot.render.modalBasisCacheDiagnosticReason).toBe(
      "modal-identity",
    );
    expect(snapshot.render.modalBasisAtlasDepth).toBe(192);
    expect(snapshot.render.liveSynthesisModeCount).toBe(12);
    expect(snapshot.render.modalBasisCacheDescriptorFresh).toBe(true);
    expect(snapshot.render.modalBasisCacheDescriptorStaleReason).toBeNull();
    expect(snapshot.render.modalBasisCacheQueuedDescriptorPending).toBe(false);
    expect(snapshot.render.modalBasisCacheLastError).toBeNull();
    expect(snapshot.render.modalBasisCacheModeCount).toBe(6);
    expect(snapshot.render.modalBasisCachePhaseAuthority).toBe(0.42);
    expect(snapshot.render.modalBasisCacheModeIdentityRetentionRatio).toBe(
      0.73,
    );
    expect(snapshot.render.modalBasisCacheMaxRepresentableModeIndex).toBe(27);
    expect(snapshot.render.modalBasisCacheContributingModeCount).toBe(5);
    expect(snapshot.render.modalBasisCacheZeroAmplitudeSkippedModeCount).toBe(
      1,
    );
    expect(snapshot.render.modalBasisCacheContributingRawModalEnergy).toBe(
      0.64,
    );
    expect(
      snapshot.render.modalBasisCacheContributingStructuralModalEnergy,
    ).toBe(0.52);
    expect(snapshot.render.liveSynthesisResolvedRawModalEnergyRatio).toBe(0.77);
    expect(
      snapshot.render.liveSynthesisResolvedStructuralModalEnergyRatio,
    ).toBe(0.8);
    expect(snapshot.render.modalBasisCacheBandwidthRejectedModeCount).toBe(2);
    expect(snapshot.render.modalBasisCacheBandwidthRejectedRawModalEnergy).toBe(
      0.19,
    );
    expect(
      snapshot.render.modalBasisCacheBandwidthRejectedStructuralModalEnergy,
    ).toBe(0.13);
    expect(snapshot.render.liveSynthesisRawGradientEnvelope).toBe(0.38);
    expect(snapshot.render.liveSynthesisStructuralGradientEnvelope).toBe(0.24);
    expect(snapshot.render.modalVarietyAudit).toEqual({
      semanticModeCount: 9,
      representedBasisPageModeCount: 5,
      basisAtlasPageCapacity: 12,
      basisAtlasPressure: 5 / 12,
      energyEffectiveModeCount: 4.2,
      renderRepresentedEnergyRatio: 0.77,
      basisAtlasCapacitySweep: [
        {
          basisAtlasPageCapacity: 12,
          renderRepresentedEnergyRatio: 0.77,
        },
      ],
    });
    expect(snapshot.render.modalVarietyAudit).not.toBe(modalVarietyAudit);
    expect(snapshot.render.modalVarietyAudit.basisAtlasCapacitySweep).not.toBe(
      modalVarietyAudit.basisAtlasCapacitySweep,
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("publishes modal basis cache diagnostics from runtime state when audit is disabled", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    runtimeDiagnostics.render.featureFrameAgeAtRenderMs = 8;
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null, {
      modalBasisCache: {
        active: true,
        ready: true,
        liveSynthesisUnsignedSupportMean: 0.48,
        liveSynthesisCancellationRatioMean: 0.27,
        liveSynthesisCancellationRatioMax: 0.86,
        liveSynthesisSupportDiagnosticSampleCount: 9,
        liveSynthesisSupportDiagnosticSupportedSampleCount: 4,
        liveSynthesisSupportDiagnosticCoverage: 4 / 9,
        rebuildPending: false,
        backend: "compute",
        resolution: 32,
        generation: 21,
        rebuildCount: 9,
        lastRebuildReason: "modal-descriptor",
        descriptorStaleReason: "modal-identity",
        lastError: null,
        activeBasisPageModeCount: 6,
        modalBasisCachePhaseAuthority: 0.37,
        modeIdentityRetentionRatio: 0.61,
        modalBasisCacheMaxRepresentableModeIndex: 31,
        contributingBasisPageModeCount: 4,
        zeroAmplitudeSkippedModeCount: 2,
        contributingRawModalEnergy: 0.72,
        contributingStructuralModalEnergy: 0.51,
        liveSynthesisResolvedRawModalEnergyRatio: 0.68,
        liveSynthesisResolvedStructuralModalEnergyRatio: 0.74,
        bandwidthRejectedModeCount: 3,
        bandwidthRejectedRawModalEnergy: 0.22,
        bandwidthRejectedStructuralModalEnergy: 0.18,
        liveSynthesisRawGradientEnvelope: 0.45,
        liveSynthesisStructuralGradientEnvelope: 0.31,
        basisAtlasDepth: 384,
        liveSynthesisModeCount: 12,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.modalBasisCacheActive).toBe(true);
    expect(snapshot.render.modalBasisCacheReady).toBe(true);
    expect(snapshot.render.modalBasisCacheSupportReady).toBe(true);
    expect(snapshot.render.modalBasisCacheSupportSemantic).toBe(
      "coefficient-invariant-basis-support",
    );
    expect(snapshot.render.liveSynthesisUnsignedSupportMean).toBe(0.48);
    expect(snapshot.render.liveSynthesisCancellationRatioMean).toBe(0.27);
    expect(snapshot.render.liveSynthesisCancellationRatioMax).toBe(0.86);
    expect(snapshot.render.liveSynthesisSupportDiagnosticSampleCount).toBe(9);
    expect(
      snapshot.render.liveSynthesisSupportDiagnosticSupportedSampleCount,
    ).toBe(4);
    expect(snapshot.render.liveSynthesisSupportDiagnosticCoverage).toBe(4 / 9);
    expect(snapshot.render.modalBasisCacheRebuildPending).toBe(false);
    expect(snapshot.render.modalBasisCacheBackend).toBe("compute");
    expect(snapshot.render.modalBasisCacheResolution).toBe(32);
    expect(snapshot.render.modalBasisCacheRebuildCount).toBe(9);
    expect(snapshot.render.modalBasisCacheRebuildReason).toBe(
      "modal-descriptor",
    );
    expect(snapshot.render.modalBasisCacheGeneration).toBe(21);
    expect(snapshot.render.modalBasisCacheRebuildCount).toBe(9);
    expect(snapshot.render.liveModalFrameAgeMs).toBe(8);
    expect(snapshot.render.modalBasisCacheDiagnosticReason).toBe(
      "modal-identity",
    );
    expect(snapshot.render.modalBasisAtlasDepth).toBe(384);
    expect(snapshot.render.liveSynthesisModeCount).toBe(12);
    expect(snapshot.render.modalBasisCacheDescriptorStaleReason).toBe(
      "modal-identity",
    );
    expect(snapshot.render.modalBasisCacheLastError).toBeNull();
    expect(snapshot.render.modalBasisCacheModeCount).toBe(6);
    expect(snapshot.render.modalBasisCachePhaseAuthority).toBe(0.37);
    expect(snapshot.render.modalBasisCacheModeIdentityRetentionRatio).toBe(
      0.61,
    );
    expect(snapshot.render.modalBasisCacheMaxRepresentableModeIndex).toBe(31);
    expect(snapshot.render.modalBasisCacheContributingModeCount).toBe(4);
    expect(snapshot.render.modalBasisCacheZeroAmplitudeSkippedModeCount).toBe(
      2,
    );
    expect(snapshot.render.modalBasisCacheContributingRawModalEnergy).toBe(
      0.72,
    );
    expect(
      snapshot.render.modalBasisCacheContributingStructuralModalEnergy,
    ).toBe(0.51);
    expect(snapshot.render.liveSynthesisResolvedRawModalEnergyRatio).toBe(0.68);
    expect(
      snapshot.render.liveSynthesisResolvedStructuralModalEnergyRatio,
    ).toBe(0.74);
    expect(snapshot.render.modalBasisCacheBandwidthRejectedModeCount).toBe(3);
    expect(snapshot.render.modalBasisCacheBandwidthRejectedRawModalEnergy).toBe(
      0.22,
    );
    expect(
      snapshot.render.modalBasisCacheBandwidthRejectedStructuralModalEnergy,
    ).toBe(0.18);
    expect(snapshot.render.liveSynthesisRawGradientEnvelope).toBe(0.45);
    expect(snapshot.render.liveSynthesisStructuralGradientEnvelope).toBe(0.31);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("keeps phase-only modal basis cache descriptor changes fresh when audit is disabled", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const activeDescriptor = {
    boundaryMode: "finite",
    cavityGeometry: "sphere",
    radius: 1,
    modalFieldCount: 3,
    modalFieldHash: 101,
    liveModalPhaseHash: 303,
    phaseModeCount: 3,
    phaseAuthority: 0.75,
    descriptorOverflow: false,
    resolution: 32,
  };
  const currentDescriptor = {
    ...activeDescriptor,
    liveModalPhaseHash: 405,
  };

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null, {
      currentModalBasisCacheDescriptor: currentDescriptor,
      modalBasisCache: {
        active: true,
        ready: true,
        activeDescriptor,
        rebuildPending: false,
        queuedDescriptor: null,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.modalBasisCacheDescriptorFresh).toBe(true);
    expect(snapshot.render.modalBasisCacheDescriptorStaleReason).toBeNull();
  } finally {
    globalThis.window = previousWindow;
  }
});

test("does not let legacy phase counts own modal basis cache mode diagnostics", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null, {
      modalBasisCacheModeCount: 1,
      currentModalBasisCacheDescriptor: {
        contributingBasisPageModeCount: 3,
        phaseModeCount: 0,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.modalBasisCacheModeCount).toBe(3);
    expect(snapshot.render.modalBasisCacheContributingModeCount).toBe(3);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("does not treat legacy cache authority diagnostics as cache ownership", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    const legacyCacheAuthorityKey = ["modalBasisCache", "Authority"].join("");
    const legacyDescriptorReasonKey = ["modalBasis", "DescriptorReason"].join(
      "",
    );
    updateObservationTransferRenderDiagnostics(runtimeDiagnostics, {
      raymarchDebug: {
        modalBasisCacheReady: true,
        [legacyCacheAuthorityKey]: 0.91,
        modalBasisCachePhaseAuthority: 0.37,
        [legacyDescriptorReasonKey]: "legacy-owner-name",
        modalBasisCacheDiagnosticReason: "phase-authority",
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.modalBasisCachePhaseAuthority).toBe(0.37);
    expect(snapshot.render.modalBasisCacheDiagnosticReason).toBe(
      "phase-authority",
    );
    expect(snapshot.render).not.toHaveProperty(legacyCacheAuthorityKey);
    expect(snapshot.render).not.toHaveProperty(legacyDescriptorReasonKey);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("keeps observation transfer render diagnostics non-authoritative without audit", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateObservationTransferRenderDiagnostics(runtimeDiagnostics, null);

  expect(runtimeDiagnostics.render.observationEnergy).toBe(0);
  expect(runtimeDiagnostics.render.observationReferenceAnchor).toBe(0);
  expect(runtimeDiagnostics.render.observationReferenceSupport).toBe(0);
  expect(runtimeDiagnostics.render.observationReferenceDensityFloor).toBe(0);
  expect(runtimeDiagnostics.render.observationReferenceContourSupport).toBe(0);
  expect(runtimeDiagnostics.render.observationSampledAnchor).toBe(0);
  expect(runtimeDiagnostics.render.observationSampledSignedAuthority).toBe(0);
  expect(runtimeDiagnostics.render.observationSampledSupport).toBe(0);
  expect(runtimeDiagnostics.render.observationSampledDensityFloor).toBe(0);
  expect(runtimeDiagnostics.render.observationSampledContourSupport).toBe(0);
  expect(
    runtimeDiagnostics.render.liveSynthesisSupportDiagnosticSampleCount,
  ).toBe(0);
  expect(
    runtimeDiagnostics.render
      .liveSynthesisSupportDiagnosticSupportedSampleCount,
  ).toBe(0);
  expect(runtimeDiagnostics.render.liveSynthesisSupportDiagnosticCoverage).toBe(
    0,
  );
  expect(runtimeDiagnostics.render.modalBasisCacheDescriptorStaleReason).toBe(
    null,
  );
});
