import { expect, test } from "vitest";
import {
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "@baryon/engine/core/raymarch/quantityLedger";
import { RENDER_PROBE_SCHEMA_VERSION } from "./renderProbeSnapshot.js";
import {
  createRuntimeDiagnostics,
  initializeAdaptiveRaymarchRuntimeState,
  maybePublishRuntimePerfSnapshot,
  resetAdaptiveRaymarchControllerState,
  shouldRenderExternalFrame,
  updateCymaticObserverRenderDiagnostics,
} from "./baryonEngineRuntimeState.js";

test("runtime state owns adaptive control independently from diagnostic snapshots", () => {
  const runtimeState = {};
  initializeAdaptiveRaymarchRuntimeState(runtimeState);
  const previousController = runtimeState.adaptiveRaymarchController;
  previousController.currentRung = 3;
  previousController.decisionFrameCount = 29;
  previousController.controllerLastFrameTimeMs = 40;
  previousController.controllerSmoothedFrameTimeMs = 32;
  runtimeState.adaptiveRaymarchInitializationInputs = {
    requestedStepBudget: 70,
    profileAllowsAdaptiveRaymarch: true,
    targetFps: 60,
    startupStepBudget: 32,
  };

  expect(createRuntimeDiagnostics().adaptiveRaymarch).not.toBe(
    previousController,
  );

  resetAdaptiveRaymarchControllerState(runtimeState);

  expect(runtimeState.adaptiveRaymarchController).not.toBe(previousController);
  expect(runtimeState.adaptiveRaymarchController).toMatchObject({
    currentRung: 0,
    decisionFrameCount: 0,
    controllerLastFrameTimeMs: 40,
    controllerSmoothedFrameTimeMs: 32,
  });
  expect(runtimeState.adaptiveRaymarchInitializationInputs).toBeNull();
});

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

test("missing external frames render only for explicit external hold updates", () => {
  expect(
    shouldRenderExternalFrame({
      externalFeatureAuthorityActive: true,
      externalFrameState: null,
      shouldAdvance: false,
      controlsChanged: false,
    }),
  ).toBe(false);
  expect(
    shouldRenderExternalFrame({
      externalFeatureAuthorityActive: true,
      externalFrameState: null,
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
        fftPeakAmplitude: 0.36,
        spectralEffectiveBinCount: 192,
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
    runtimeDiagnostics.modalFreshness.resonantPhaseAuthority = 0.41;
    runtimeDiagnostics.modalFreshness.sourceCoupledPhaseAuthority = 0.12;
    runtimeDiagnostics.modalFreshness.modalPhaseCoherentFieldModeCount = 5;
    runtimeDiagnostics.modalFreshness.resonantObservedModeCount = 6;
    runtimeDiagnostics.modalFreshness.resonantObservedEnergy = 0.42;
    runtimeDiagnostics.modalFreshness.resonantRingSupport = 0.68;
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
      sourceEvidence: {
        ownerVersion: "audio-source-evidence:v1",
        sourceKind: "system",
        analysisClass: "line-feed",
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
        sourceEnergy: 0.42,
      },
      fieldState: "active",
      avgAmplitude: 14.5,
      analyserRms: 0.048,
      periodicity: 0.79,
      modalObserverVisibilityEnergy: 0.36,
      modalPhaseAuthority: 0.27,
      resonantPhaseAuthority: 0.41,
      sourceCoupledPhaseAuthority: 0.12,
      modalPhaseCoherentFieldModeCount: 5,
      resonantObservedModeCount: 6,
      resonantObservedEnergy: 0.42,
      resonantRingSupport: 0.68,
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

test("publishes cymatic observer diagnostics in render perf snapshots", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateCymaticObserverRenderDiagnostics(runtimeDiagnostics, {
      raymarchDebug: {
        observerBakeExecuted: true,
        observerAdvanced: true,
        observerStepCount: 2,
        observerStepIndex: 751,
        observerCheckpointKeyActive: true,
        observerCheckpointSaved: false,
        observerCheckpointRestored: true,
        observerCheckpointStepIndex: 750,
        observerCheckpointSaveCount: 2,
        observerCheckpointRestoreCount: 1,
        observerCheckpointLastEvent: "restored",
        observerCheckpointBytes: 32 * 1024 * 1024,
        observerGeometryExposureSeconds: 0.3,
        observerRadianceExposureSeconds: 0.05,
        observerSpectralExposureSeconds: 0.1,
        plasmaProbeLocalRadiance: 0.28,
        plasmaProbePersistence: 0.64,
        plasmaProbeOrganizedDensity: 0.31,
        plasmaProbeExtinction: 0.046,
        plasmaProbePreBloomRadiance: 0.21,
        plasmaProbePostBloomRisk: 0.34,
        plasmaProbeBloomAmplification: 1.62,
        visibilityGateState: "visible",
        visibilityGateBlockedReason: null,
        spectralPresentationEnabled: true,
        opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
        radiationPotentialModeCapacity: 13,
        radiationPotentialObservedCoefficientEnergy: 0.36,
        radiationPotentialObservedCoefficientNorm: 0.6,
        radiationPotentialNormalizedEnergyNorm: 1,
        radiationPotentialBakeModeCount: 13,
        radiationPotentialExposureDrive: 0.72,
        materialOutputVisible: true,
        renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
        renderQuantityForbiddenConsumers: {
          observerAudioClock: ["camera", "bloom"],
        },
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render).toMatchObject({
      observerBakeExecuted: true,
      observerAdvanced: true,
      observerStepCount: 2,
      observerStepIndex: 751,
      observerCheckpointKeyActive: true,
      observerCheckpointSaved: false,
      observerCheckpointRestored: true,
      observerCheckpointStepIndex: 750,
      observerCheckpointSaveCount: 2,
      observerCheckpointRestoreCount: 1,
      observerCheckpointLastEvent: "restored",
      observerCheckpointBytes: 32 * 1024 * 1024,
      observerGeometryExposureSeconds: 0.3,
      observerRadianceExposureSeconds: 0.05,
      observerSpectralExposureSeconds: 0.1,
      plasmaProbeLocalRadiance: 0.28,
      plasmaProbePersistence: 0.64,
      plasmaProbeOrganizedDensity: 0.31,
      plasmaProbeExtinction: 0.046,
      plasmaProbePreBloomRadiance: 0.21,
      plasmaProbePostBloomRisk: 0.34,
      plasmaProbeBloomAmplification: 1.62,
      visibilityGateState: "visible",
      visibilityGateBlockedReason: null,
      spectralPresentationEnabled: true,
      opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      radiationPotentialModeCapacity: 13,
      radiationPotentialObservedCoefficientEnergy: 0.36,
      radiationPotentialObservedCoefficientNorm: 0.6,
      radiationPotentialNormalizedEnergyNorm: 1,
      radiationPotentialBakeModeCount: 13,
      radiationPotentialExposureDrive: 0.72,
      materialOutputVisible: true,
      renderProbeSchemaVersion: RENDER_PROBE_SCHEMA_VERSION,
      renderProbeAvailable: true,
      renderProbeStatus: "available",
      renderProbeUnavailableReason: null,
      renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
    });
    expect(snapshot.render.renderProbeSnapshot).toMatchObject({
      schemaVersion: RENDER_PROBE_SCHEMA_VERSION,
      lanes: ["state", "material", "visual"],
      health: {
        available: true,
        status: "available",
        unavailableReason: null,
      },
      state: {
        visibilityGateState: "visible",
        visibilityGateBlockedReason: null,
        spectralPresentationEnabled: true,
        opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
        radiationPotentialObservedCoefficientEnergy: 0.36,
        radiationPotentialObservedCoefficientNorm: 0.6,
        radiationPotentialNormalizedEnergyNorm: 1,
        radiationPotentialBakeModeCount: 13,
        radiationPotentialExposureDrive: 0.72,
      },
      material: {
        observerLocalRadiance: 0.28,
        observerGeometryExposureSeconds: 0.3,
        observerRadianceExposureSeconds: 0.05,
        observerSpectralExposureSeconds: 0.1,
        plasmaProbePersistence: 0.64,
        plasmaProbeOrganizedDensity: 0.31,
        plasmaProbeExtinction: 0.046,
        plasmaProbePreBloomRadiance: 0.21,
        plasmaProbePostBloomRisk: 0.34,
        plasmaProbeBloomAmplification: 1.62,
      },
    });
    expect(
      snapshot.render.renderQuantityForbiddenConsumers.observerAudioClock,
    ).toEqual(expect.arrayContaining(["camera", "bloom"]));
  } finally {
    globalThis.window = previousWindow;
  }
});

test("keeps observer diagnostics non-authoritative without a probe", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateCymaticObserverRenderDiagnostics(runtimeDiagnostics, null);

  expect(runtimeDiagnostics.render).toMatchObject({
    observerBakeExecuted: false,
    observerAdvanced: false,
    observerStepCount: 0,
    observerStepIndex: null,
    observerGeometryExposureSeconds: 0,
    observerRadianceExposureSeconds: 0,
    observerSpectralExposureSeconds: 0,
    plasmaProbeLocalRadiance: 0,
    plasmaProbePersistence: 0,
    plasmaProbeOrganizedDensity: 0,
    plasmaProbeExtinction: 0,
    plasmaProbePreBloomRadiance: 0,
    plasmaProbePostBloomRisk: 0,
    plasmaProbeBloomAmplification: 1,
    opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
    radiationPotentialModeCapacity: 0,
    radiationPotentialObservedCoefficientEnergy: 0,
    radiationPotentialObservedCoefficientNorm: 0,
    radiationPotentialNormalizedEnergyNorm: 0,
    radiationPotentialBakeModeCount: 0,
    radiationPotentialExposureDrive: 0,
    renderProbeSchemaVersion: RENDER_PROBE_SCHEMA_VERSION,
    renderProbeAvailable: false,
    renderProbeStatus: "unavailable",
    renderProbeUnavailableReason: "raymarch-debug-missing",
  });
  expect(runtimeDiagnostics.render.renderProbeSnapshot).toMatchObject({
    schemaVersion: RENDER_PROBE_SCHEMA_VERSION,
    health: {
      available: false,
      status: "unavailable",
      unavailableReason: "raymarch-debug-missing",
    },
  });
  expect(runtimeDiagnostics.render).not.toHaveProperty("modalBasisCache");
});

test("mirrors live cache quantities when the optional render probe is disabled", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateCymaticObserverRenderDiagnostics(runtimeDiagnostics, null, {
    modalFieldCapacity: 160,
    radiationPotentialCoefficientFrame: {
      observedCoefficientEnergy: 0.36,
      observedCoefficientNorm: 0.6,
      normalizedEnergySum: 1,
      observedPressureDrive: 0.72,
    },
    uniforms: {
      uModalFieldModeCount: { value: 33 },
      uSpectralPresentationEnabled: { value: 1 },
      uSpectralChroma: { value: 0.65 },
    },
    cymaticObserverBakeResult: {
      baked: true,
      advanced: true,
      stepCount: 1,
      stepIndex: 902,
    },
  });

  expect(runtimeDiagnostics.render).toMatchObject({
    observerBakeExecuted: true,
    observerAdvanced: true,
    observerStepCount: 1,
    observerStepIndex: 902,
    spectralPresentationEnabled: true,
    spectralChroma: 0.65,
    spectralColorFieldImplementationState:
      RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
    opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
    radiationPotentialModeCapacity: 160,
    radiationPotentialObservedCoefficientEnergy: 0.36,
    radiationPotentialObservedCoefficientNorm: 0.6,
    radiationPotentialNormalizedEnergyNorm: 1,
    radiationPotentialBakeModeCount: 33,
    radiationPotentialExposureDrive: 0.72,
    renderProbeAvailable: false,
    renderProbeUnavailableReason: "raymarch-debug-missing",
  });
});
