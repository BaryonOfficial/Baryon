import { expect, test } from "vitest";
import {
  createRuntimeDiagnostics,
  maybePublishRuntimePerfSnapshot,
  shouldRenderExternalFrame,
  updateRetainedHighQRenderVisibilityDiagnostics,
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

test("publishes retained high-Q raymarch visibility diagnostics in render perf snapshots", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    const runtimeDiagnostics = createRuntimeDiagnostics();
    updateRetainedHighQRenderVisibilityDiagnostics(runtimeDiagnostics, {
      raymarchDebug: {
        retainedHighQRidgeVisibleDensityMax: 0.046,
        retainedHighQRidgeToRetainedEnergyRatio: 0.24,
        retainedHighQPhysicalVisibleDensityMax: 0,
      },
    });

    const snapshot = maybePublishRuntimePerfSnapshot(runtimeDiagnostics, {
      force: true,
    });

    expect(snapshot.render.retainedHighQRidgeVisibleDensityMax).toBe(0.046);
    expect(snapshot.render.retainedHighQRidgeToRetainedEnergyRatio).toBe(0.24);
    expect(snapshot.render.retainedHighQPhysicalVisibleDensityMax).toBe(0);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("derives retained high-Q render visibility diagnostics when raymarch audit is disabled", () => {
  const runtimeDiagnostics = createRuntimeDiagnostics();

  updateRetainedHighQRenderVisibilityDiagnostics(runtimeDiagnostics, null, {
    modalVisibilityEnergy: 0.32,
    modalVisibilityRetainedHighQEnergy: 0.19,
  });

  expect(
    runtimeDiagnostics.render.retainedHighQRidgeVisibleDensityMax,
  ).toBeGreaterThan(0);
  expect(
    runtimeDiagnostics.render.retainedHighQRidgeToRetainedEnergyRatio,
  ).toBeGreaterThan(0.1);
  expect(runtimeDiagnostics.render.retainedHighQPhysicalVisibleDensityMax).toBe(
    0,
  );
});
