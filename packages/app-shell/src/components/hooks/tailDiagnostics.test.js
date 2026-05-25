import { expect, test, vi } from "vitest";
import {
  classifyTailDiagnosticSample,
  createTailDiagnosticsRecorder,
  installTailDiagnosticsWindowApi,
  recordTailDiagnosticsSample,
} from "./tailDiagnostics.js";

function createRuntimeDiagnostics(overrides = {}) {
  return {
    modalFreshness: {
      sourceMode: "system",
      fieldState: "active",
      avgAmplitude: 0.4,
      analyserRms: 0.004,
      periodicity: 0.9,
      liveInputHardSilenceActive: false,
      liveInputNoiseGateActive: false,
      observationEnergy: 0.32,
      observedResonanceModeCount: 8,
      observedResonanceEnergy: 1,
      highQRingSupport: 1,
      modeCoherence: 0.7,
      modalPhaseAuthority: 1,
      activeModeCount: 16,
      activeModalFieldModeCount: 16,
      ...overrides.modalFreshness,
    },
    render: {
      observationReferenceDensityFloor: 0.07,
      observationReferenceContourSupport: 0.012,
      observationSampledDensityFloor: 0.045,
      observationSampledContourSupport: 0.008,
      effectiveFieldReady: true,
      effectiveFieldSupportReady: true,
      effectiveFieldSupportSemantic: "effective-field-support",
      effectiveFieldUnsignedSupportMean: 0.52,
      effectiveFieldCancellationRatioMean: 0.33,
      effectiveFieldCancellationRatioMax: 0.88,
      effectiveFieldSupportDiagnosticSampleCount: 9,
      effectiveFieldSupportDiagnosticSupportedSampleCount: 5,
      effectiveFieldSupportDiagnosticCoverage: 5 / 9,
      effectiveFieldZeroAmplitudeSkippedModeCount: 1,
      effectiveFieldDescriptorStaleReason: "mode-count",
      effectiveFieldRebuildPending: false,
      effectiveFieldAuthority: 1,
      bloomEnabled: false,
      renderScale: 1,
      ...overrides.render,
    },
  };
}

test("tail diagnostics recorder is inert until explicitly started", () => {
  const recorder = createTailDiagnosticsRecorder();

  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics(),
    runtimeState: { debugSnapshot: { volumeVisible: true } },
    nowMs: 1000,
  });

  expect(recorder.dump()).toMatchObject({
    active: false,
    samples: [],
  });
});

test("tail diagnostics records compact samples on the configured interval", () => {
  const recorder = createTailDiagnosticsRecorder({
    sampleIntervalMs: 250,
    maxDurationMs: 1000,
  });
  recorder.start({ nowMs: 1000 });

  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics(),
    runtimeState: {
      debugSnapshot: {
        volumeVisible: true,
        idleOverlayVisible: false,
        raymarchDebug: {
          observationReferenceDensityFloor: 0.04,
          observationReferenceContourSupport: 0.03,
          observationSampledDensityFloor: 0.025,
          observationSampledContourSupport: 0.012,
        },
      },
    },
    nowMs: 1000,
  });
  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics({
      modalFreshness: { avgAmplitude: 0.35 },
    }),
    runtimeState: { debugSnapshot: { volumeVisible: true } },
    nowMs: 1100,
  });
  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics({
      modalFreshness: { avgAmplitude: 0.3 },
    }),
    runtimeState: { debugSnapshot: { volumeVisible: true } },
    nowMs: 1250,
  });

  const dump = recorder.dump();
  expect(dump.active).toBe(true);
  expect(dump.samples).toHaveLength(2);
  expect(dump.samples[0]).toMatchObject({
    tMs: 0,
    input: {
      avgAmplitude: 0.4,
      analyserRms: 0.004,
      sourceMode: "system",
    },
    observer: {
      observedResonanceModeCount: 8,
      observedResonanceEnergy: 1,
      highQRingSupport: 1,
    },
    frame: {
      fieldState: "active",
      activeModeCount: 16,
      observationEnergy: 0.32,
    },
    render: {
      volumeVisible: true,
      observationReferenceDensityFloor: 0.07,
      observationReferenceContourSupport: 0.012,
      observationSampledDensityFloor: 0.045,
      observationSampledContourSupport: 0.008,
      effectiveFieldSupportReady: true,
      effectiveFieldSupportSemantic: "effective-field-support",
      effectiveFieldUnsignedSupportMean: 0.52,
      effectiveFieldCancellationRatioMean: 0.33,
      effectiveFieldCancellationRatioMax: 0.88,
      effectiveFieldSupportDiagnosticSampleCount: 9,
      effectiveFieldSupportDiagnosticSupportedSampleCount: 5,
      effectiveFieldSupportDiagnosticCoverage: 5 / 9,
      effectiveFieldZeroAmplitudeSkippedModeCount: 1,
      effectiveFieldDescriptorStaleReason: "mode-count",
    },
    classification: "unknown",
  });
  expect(dump.samples[0]).not.toHaveProperty("modeSlots");
});

test("tail diagnostics classifies black-tail failure seams", () => {
  expect(
    classifyTailDiagnosticSample({
      input: {
        avgAmplitude: 0,
        analyserRms: 0,
        hardSilence: true,
        noiseGate: false,
        sourceMode: "silent",
      },
      observer: { observedResonanceModeCount: 0, observedResonanceEnergy: 0 },
      frame: { fieldState: "idle" },
      render: { volumeVisible: false },
    }),
  ).toBe("input-drop");

  expect(
    classifyTailDiagnosticSample({
      input: { avgAmplitude: 0.3, analyserRms: 0.004, sourceMode: "system" },
      observer: { observedResonanceModeCount: 0, observedResonanceEnergy: 0 },
      frame: { fieldState: "active" },
      render: { volumeVisible: true },
    }),
  ).toBe("observer-drop");

  expect(
    classifyTailDiagnosticSample({
      input: { avgAmplitude: 0.3, analyserRms: 0.004, sourceMode: "system" },
      observer: { observedResonanceModeCount: 8, observedResonanceEnergy: 1 },
      frame: {
        fieldState: "active",
        observationEnergy: 0,
      },
      render: { volumeVisible: true },
    }),
  ).toBe("frame-visibility-drop");

  expect(
    classifyTailDiagnosticSample({
      input: { avgAmplitude: 0.3, analyserRms: 0.004, sourceMode: "system" },
      observer: { observedResonanceModeCount: 8, observedResonanceEnergy: 1 },
      frame: {
        fieldState: "active",
        observationEnergy: 0.3,
      },
      render: {
        volumeVisible: true,
        observationReferenceDensityFloor: 0.05,
        observationReferenceContourSupport: 0.02,
        observationSampledDensityFloor: 0,
        observationSampledContourSupport: 0,
      },
    }),
  ).toBe("observation-transfer-drop");

  expect(
    classifyTailDiagnosticSample({
      input: { avgAmplitude: 0.3, analyserRms: 0.004, sourceMode: "system" },
      observer: { observedResonanceModeCount: 8, observedResonanceEnergy: 1 },
      frame: {
        fieldState: "active",
        observationEnergy: 0.3,
      },
      render: {
        volumeVisible: false,
        observationReferenceDensityFloor: 0.05,
        observationSampledDensityFloor: 0.05,
      },
    }),
  ).toBe("render-hidden");
});

test("tail diagnostics window api dumps and copies pasteable JSON", async () => {
  const writeText = vi.fn(async () => undefined);
  const targetWindow = {
    navigator: {
      clipboard: {
        writeText,
      },
    },
  };
  const recorder = createTailDiagnosticsRecorder();

  installTailDiagnosticsWindowApi({
    targetWindow,
    recorder,
    getNowMs: () => 500,
  });

  targetWindow.__baryonTailDiagnostics.start();
  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics(),
    runtimeState: { debugSnapshot: { volumeVisible: true } },
    nowMs: 500,
  });

  const dump = targetWindow.__baryonTailDiagnostics.dump();
  expect(dump.samples).toHaveLength(1);
  await targetWindow.__baryonTailDiagnostics.copy();
  expect(writeText).toHaveBeenCalledWith(JSON.stringify(dump, null, 2));
});

test("tail diagnostics copy returns the capture when clipboard permission fails", async () => {
  const clipboardError = new DOMException(
    "Document is not focused.",
    "NotAllowedError",
  );
  const writeText = vi.fn(async () => {
    throw clipboardError;
  });
  const targetWindow = {
    navigator: {
      clipboard: {
        writeText,
      },
    },
  };
  const recorder = createTailDiagnosticsRecorder();

  installTailDiagnosticsWindowApi({
    targetWindow,
    recorder,
    getNowMs: () => 500,
  });

  targetWindow.__baryonTailDiagnostics.start();
  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics(),
    runtimeState: { debugSnapshot: { volumeVisible: true } },
    nowMs: 500,
  });

  await expect(
    targetWindow.__baryonTailDiagnostics.copy(),
  ).resolves.toMatchObject({
    copied: false,
    copyError: {
      name: "NotAllowedError",
      message: "Document is not focused.",
    },
    samples: [{ classification: "unknown" }],
  });
});
