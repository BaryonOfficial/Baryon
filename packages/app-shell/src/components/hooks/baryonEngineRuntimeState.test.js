import { expect, test } from "vitest";
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

test("publishes only scalar v3 freshness diagnostics without copying acoustic arrays", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    Object.assign(runtimeDiagnostics.modalFreshness, {
      frameId: 19,
      sourcePhase: "running",
      familyCount: 85,
      shellCount: 59,
      endSample: 1024,
      normalizationEnergy: 1e-12,
      responseEnvelope: 0.47,
      observationAgeMs: 8,
      pressureMoments: new Float64Array(3481),
      _previousModeSlots: new Float32Array(16),
    });
    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });
    expect(snapshot.modalFreshness).toMatchObject({
      frameId: 19,
      familyCount: 85,
      shellCount: 59,
      endSample: 1024,
      normalizationEnergy: 1e-12,
      responseEnvelope: 0.47,
      observationAgeMs: 8,
    });
    expect(snapshot.modalFreshness).not.toHaveProperty("_previousModeSlots");
    expect(snapshot.modalFreshness).not.toHaveProperty("pressureMoments");
    expect(globalThis.window.__baryonPerfMetrics.modalFreshness).toEqual(
      snapshot.modalFreshness,
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("mirrors actual uploaded resources and observer consumption separately from accepted audio", () => {
  const diagnostics = createRuntimeDiagnostics();
  const source = {
    topology: { familyCount: 85, shellCount: 59 },
    basisCompileCount: 1,
    observationUploadCount: 22,
    textureBytes: 80052416,
  };
  const runtimeState = {
    fieldSource: { read: () => source },
    fieldCache: {
      getObserverState: () => ({ hasHistory: true, stepIndex: 12 }),
    },
    volumeMesh: { visible: true },
    idleOverlay: { visible: false },
    uniforms: { uSpectralPresentationEnabled: { value: 1 } },
    lastBakedFeatureFrame: { observation: { endSample: 1024 } },
    cymaticObserverBakeResult: { baked: true, advanced: true, stepCount: 1 },
  };
  updateCymaticObserverRenderDiagnostics(
    diagnostics,
    {
      renderAuthority: true,
      latestAcceptedEndSample: 1536,
      observer: { hasHistory: true, stepIndex: 12 },
    },
    runtimeState,
  );
  expect(diagnostics.render).toMatchObject({
    renderAuthority: true,
    materialOutputVisible: true,
    uploadedFamilyCount: 85,
    uploadedShellCount: 59,
    basisCompileCount: 1,
    observationUploadCount: 22,
    derivedTextureBytes: 80052416,
    latestAcceptedEndSample: 1536,
    observerConsumedEndSample: 1024,
    observerStepIndex: 12,
    observerHasHistory: true,
    observerBakeExecuted: true,
    observerAdvanced: true,
    observerStepCount: 1,
    spectralPresentationEnabled: true,
  });
  expect(diagnostics.render.renderProbeSnapshot.health.available).toBe(false);
  expect(diagnostics.render).not.toHaveProperty(
    "radiationPotentialModeCapacity",
  );
});

test("missing metadata clears diagnostic authority and never invents material measurements", () => {
  const diagnostics = createRuntimeDiagnostics();
  updateCymaticObserverRenderDiagnostics(diagnostics, null, null);
  expect(diagnostics.render).toMatchObject({
    renderAuthority: false,
    materialOutputVisible: false,
    observerHasHistory: false,
    observerConsumedEndSample: null,
  });
  expect(diagnostics.render.renderProbeSnapshot.health).toMatchObject({
    available: false,
    activeCandidate: false,
    unavailableReason: "material-readback-unavailable",
  });
});

test("repeated diagnostic reads neither compile resources nor advance an observer", () => {
  const diagnostics = createRuntimeDiagnostics();
  let compileCount = 1,
    stepIndex = 9;
  const runtime = {
    fieldSource: {
      read: () => ({
        basisCompileCount: compileCount,
        observationUploadCount: 12,
      }),
    },
    fieldCache: { getObserverState: () => ({ hasHistory: true, stepIndex }) },
    volumeMesh: { visible: true },
  };
  for (let n = 0; n < 10; n++)
    updateCymaticObserverRenderDiagnostics(
      diagnostics,
      { renderAuthority: true, latestAcceptedEndSample: 2048 },
      runtime,
    );
  expect(compileCount).toBe(1);
  expect(stepIndex).toBe(9);
  expect(diagnostics.render).toMatchObject({
    basisCompileCount: 1,
    observationUploadCount: 12,
    observerStepIndex: 9,
    observerConsumedEndSample: null,
  });
});
