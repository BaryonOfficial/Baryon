import { expect, test, vi } from "vitest";
import {
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
} from "@baryon/engine/core/raymarch/quantityLedger";
import {
  classifyTailDiagnosticSample,
  createTailDiagnosticsRecorder,
  installTailDiagnosticsWindowApi,
  recordTailDiagnosticsSample,
  summarizeTailDiagnosticWindow,
} from "./tailDiagnostics.js";
import { RENDER_PROBE_SCHEMA_VERSION } from "./renderProbeSnapshot.js";

function createLiveSourceEvidence(overrides = {}) {
  return {
    sourceBoundaryState: "live",
    currentSourceEvidence: true,
    sourceEnergy: 0.4,
    ...overrides,
  };
}

function createRuntimeDiagnostics(overrides = {}) {
  return {
    modalFreshness: {
      sourceMode: "system",
      sourceEvidence: createLiveSourceEvidence(),
      fieldState: "active",
      avgAmplitude: 0.4,
      analyserRms: 0.004,
      periodicity: 0.9,
      liveInputHardSilenceActive: false,
      liveInputNoiseGateActive: false,
      observationEnergy: 0.32,
      resonantObservedModeCount: 8,
      resonantObservedEnergy: 1,
      resonantRingSupport: 1,
      modeCoherence: 0.7,
      modalPhaseAuthority: 1,
      activeModeCount: 16,
      activeModalFieldModeCount: 16,
      ...overrides.modalFreshness,
    },
    render: {
      observerGeometryExposureSeconds: 0.3,
      observerRadianceExposureSeconds: 0.05,
      observerSpectralExposureSeconds: 0.1,
      renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
      renderQuantityForbiddenConsumers: {
        observedDensityFloor: ["highlightMask", "whiteEmissionFieldAuthority"],
        cancellationSuppression: ["whiteEmissionFieldAuthority"],
      },
      totalSlotAmplitude: 0.9,
      structuralProjectionDrive: 0.45,
      structuralProjectionConcentration: 0.25,
      plasmaProbeLocalRadiance: 0.42,
      plasmaProbePersistence: 0.74,
      plasmaProbeOrganizedDensity: 0.18,
      plasmaProbeExtinction: 0.07,
      plasmaProbePreBloomRadiance: 0.21,
      plasmaProbePostBloomRisk: 0.34,
      plasmaProbeBloomAmplification: 1.62,
      opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      radiationPotentialModeCapacity: 13,
      radiationPotentialObservedCoefficientEnergy: 0.36,
      radiationPotentialObservedCoefficientNorm: 0.6,
      radiationPotentialNormalizedEnergyNorm: 1,
      radiationPotentialBakeModeCount: 13,
      radiationPotentialExposureDrive: 0.72,
      bloomEnabled: false,
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

test("tail diagnostics recorder lifecycle methods own snapshots when detached", () => {
  const recorder = createTailDiagnosticsRecorder();
  const { start, stop, reset } = recorder;

  expect(start({ nowMs: 100 })).toMatchObject({
    active: true,
    startedAtMs: 100,
    stoppedAtMs: null,
  });
  expect(stop({ nowMs: 150 })).toMatchObject({
    active: false,
    startedAtMs: 100,
    stoppedAtMs: 150,
  });
  expect(reset()).toMatchObject({
    active: false,
    startedAtMs: null,
    stoppedAtMs: null,
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
          renderAuthority: true,
          observerGeometryExposureSeconds: 0.3,
          observerRadianceExposureSeconds: 0.05,
          observerSpectralExposureSeconds: 0.1,
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
      sourceEvidence: createLiveSourceEvidence(),
      avgAmplitude: 0.4,
      analyserRms: 0.004,
      sourceMode: "system",
    },
    observer: {
      resonantObservedModeCount: 8,
      resonantObservedEnergy: 1,
      resonantRingSupport: 1,
    },
    frame: {
      fieldState: "active",
      renderAuthority: true,
      activeModeCount: 16,
      observationEnergy: 0.32,
    },
    render: {
      volumeVisible: true,
      observerGeometryExposureSeconds: 0.3,
      observerRadianceExposureSeconds: 0.05,
      observerSpectralExposureSeconds: 0.1,
      totalSlotAmplitude: 0.9,
      structuralProjectionDrive: 0.45,
      structuralProjectionConcentration: 0.25,
      plasmaProbeLocalRadiance: 0.42,
      plasmaProbePersistence: 0.74,
      plasmaProbeOrganizedDensity: 0.18,
      plasmaProbeExtinction: 0.07,
      plasmaProbePreBloomRadiance: 0.21,
      plasmaProbePostBloomRisk: 0.34,
      plasmaProbeBloomAmplification: 1.62,
      opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
      radiationPotentialModeCapacity: 13,
      radiationPotentialObservedCoefficientEnergy: 0.36,
      radiationPotentialObservedCoefficientNorm: 0.6,
      radiationPotentialNormalizedEnergyNorm: 1,
      radiationPotentialBakeModeCount: 13,
      radiationPotentialExposureDrive: 0.72,
      renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
      renderQuantityForbiddenConsumers: {
        observedDensityFloor: ["highlightMask", "whiteEmissionFieldAuthority"],
        cancellationSuppression: ["whiteEmissionFieldAuthority"],
      },
    },
    probe: {
      health: {
        available: true,
      },
    },
    classification: "unknown",
  });
  expect(dump.samples[0].probe).toMatchObject({
    schemaVersion: RENDER_PROBE_SCHEMA_VERSION,
    health: {
      available: true,
      activeCandidate: true,
      status: "available",
      unavailableReason: null,
    },
    lanes: ["state", "material", "visual"],
  });
  expect(dump.samples[0]).not.toHaveProperty("modeSlots");
});

test("tail diagnostics records render-facing modal response energy", () => {
  const recorder = createTailDiagnosticsRecorder({
    sampleIntervalMs: 1,
    maxDurationMs: 1000,
  });
  recorder.start({ nowMs: 1000 });

  recordTailDiagnosticsSample(recorder, {
    runtimeDiagnostics: createRuntimeDiagnostics({
      modalFreshness: {
        modalResponseEnergy: 0.03,
      },
    }),
    featureFrame: {
      modalResponseEnergy: 0.03,
      modalResponseRenderEnergy: 0.31,
      modalResponseRenderSourceCoupledEnergy: 0.24,
      modalResponseRenderResonantEnergy: 0.19,
      debug: {
        modalResponseEnergy: 0.04,
      },
    },
    runtimeState: {
      debugSnapshot: {
        volumeVisible: true,
        raymarchDebug: { renderAuthority: true },
      },
    },
    nowMs: 1000,
  });

  expect(recorder.dump().samples[0].frame.modalResponseEnergy).toBe(0.31);
});

test("tail diagnostics summarizes material probe windows", () => {
  const recorder = createTailDiagnosticsRecorder({
    sampleIntervalMs: 1,
    maxDurationMs: 1000,
  });
  recorder.start({ nowMs: 1000 });

  [
    {
      plasmaProbePreBloomRadiance: 0.2,
      plasmaProbePostBloomRisk: 0.22,
      plasmaProbeBloomAmplification: 1.1,
    },
    {
      plasmaProbePreBloomRadiance: 0.21,
      plasmaProbePostBloomRisk: 0.23,
      plasmaProbeBloomAmplification: 1.1,
    },
    {
      plasmaProbePreBloomRadiance: 0.2,
      plasmaProbePostBloomRisk: 0.82,
      plasmaProbeBloomAmplification: 4.1,
    },
  ].forEach((render, index) => {
    recordTailDiagnosticsSample(recorder, {
      runtimeDiagnostics: createRuntimeDiagnostics({ render }),
      runtimeState: {
        debugSnapshot: {
          volumeVisible: true,
          raymarchDebug: { renderAuthority: true },
        },
      },
      nowMs: 1000 + index,
    });
  });

  const { windowSummary } = recorder.dump();
  expect(windowSummary).toMatchObject({
    sampleCount: 3,
    classification: "bloom-output",
    metrics: {
      plasmaProbePreBloomRadiance: {
        max: 0.21,
        p95: 0.21,
        spikeCount: 0,
      },
      plasmaProbePostBloomRisk: {
        max: 0.82,
        p95: 0.82,
        spikeCount: 1,
      },
      plasmaProbeBloomAmplification: {
        max: 4.1,
        spikeCount: 1,
      },
    },
  });
  expect(windowSummary.metrics.plasmaProbePreBloomRadiance.mean).toBeCloseTo(
    0.20333333333333334,
  );
});

test("tail diagnostics classifies plasma transfer spikes across a window", () => {
  expect(
    summarizeTailDiagnosticWindow([
      { render: { plasmaProbePreBloomRadiance: 0.18 } },
      { render: { plasmaProbePreBloomRadiance: 0.19 } },
      { render: { plasmaProbePreBloomRadiance: 0.74 } },
    ]),
  ).toMatchObject({ classification: "plasma-transfer" });
});

test("tail diagnostics does not call an unavailable material probe stable", () => {
  expect(
    summarizeTailDiagnosticWindow([
      {
        classification: "plasma-transfer-drop",
        frame: {
          renderAuthority: true,
          projectedRenderEnergy: 0.4,
          observationEnergy: 1,
        },
        render: {
          volumeVisible: true,
          plasmaProbeLocalRadiance: 0,
          plasmaProbePersistence: 0,
          plasmaProbeOrganizedDensity: 0,
          plasmaProbeExtinction: 0,
          plasmaProbePreBloomRadiance: 0,
          plasmaProbePostBloomRisk: 0,
          plasmaProbeBloomAmplification: 1,
        },
      },
      {
        classification: "input-drop",
        frame: {
          renderAuthority: true,
          projectedRenderEnergy: 0.2,
          observationEnergy: 1,
        },
        render: {
          volumeVisible: true,
          plasmaProbeLocalRadiance: 0,
          plasmaProbePersistence: 0,
          plasmaProbeOrganizedDensity: 0,
          plasmaProbeExtinction: 0,
          plasmaProbePreBloomRadiance: 0,
          plasmaProbePostBloomRisk: 0,
          plasmaProbeBloomAmplification: 1,
        },
      },
    ]),
  ).toMatchObject({
    classification: "probe-unavailable",
    probeSampleCount: 0,
    sampleClassifications: {
      "input-drop": 1,
      "plasma-transfer-drop": 1,
    },
  });
});

test("tail diagnostics accepts a healthy zero-valued render probe", () => {
  expect(
    summarizeTailDiagnosticWindow([
      {
        frame: {
          renderAuthority: true,
          projectedRenderEnergy: 0.4,
          observationEnergy: 1,
        },
        render: {
          volumeVisible: true,
          plasmaProbeLocalRadiance: 0,
          plasmaProbePersistence: 0,
          plasmaProbeOrganizedDensity: 0,
          plasmaProbeExtinction: 0,
          plasmaProbePreBloomRadiance: 0,
          plasmaProbePostBloomRisk: 0,
          plasmaProbeBloomAmplification: 1,
        },
        probe: {
          health: {
            available: true,
            activeCandidate: true,
          },
        },
      },
    ]),
  ).toMatchObject({
    classification: "stable",
    probeSampleCount: 1,
    activeProbeCandidateCount: 1,
  });
});

test("tail diagnostics classifies black-tail failure seams", () => {
  expect(
    classifyTailDiagnosticSample({
      input: {
        sourceEvidence: createLiveSourceEvidence({
          sourceBoundaryState: "muted",
          currentSourceEvidence: false,
          sourceEnergy: 0,
        }),
        avgAmplitude: 0,
        analyserRms: 0,
        hardSilence: true,
        noiseGate: false,
        sourceMode: "silent",
      },
      observer: { resonantObservedModeCount: 0, resonantObservedEnergy: 0 },
      frame: { fieldState: "idle" },
      render: { volumeVisible: false },
    }),
  ).toBe("input-drop");

  expect(
    classifyTailDiagnosticSample({
      input: {
        sourceEvidence: createLiveSourceEvidence(),
        avgAmplitude: 0.3,
        analyserRms: 0.004,
        sourceMode: "system",
      },
      observer: { resonantObservedModeCount: 0, resonantObservedEnergy: 0 },
      frame: { fieldState: "active", renderAuthority: true },
      render: { volumeVisible: true },
    }),
  ).toBe("observer-drop");

  expect(
    classifyTailDiagnosticSample({
      input: {
        sourceEvidence: createLiveSourceEvidence(),
        avgAmplitude: 0.3,
        analyserRms: 0.004,
        sourceMode: "system",
      },
      observer: { resonantObservedModeCount: 8, resonantObservedEnergy: 1 },
      frame: {
        fieldState: "active",
        renderAuthority: true,
        observationEnergy: 0,
      },
      render: { volumeVisible: true },
    }),
  ).toBe("frame-visibility-drop");

  expect(
    classifyTailDiagnosticSample({
      input: {
        sourceEvidence: createLiveSourceEvidence(),
        avgAmplitude: 0.3,
        analyserRms: 0.004,
        sourceMode: "system",
      },
      observer: { resonantObservedModeCount: 8, resonantObservedEnergy: 1 },
      frame: {
        fieldState: "active",
        renderAuthority: true,
        observationEnergy: 0.3,
      },
      render: {
        volumeVisible: true,
        plasmaProbeOrganizedDensity: 0,
      },
    }),
  ).toBe("plasma-transfer-drop");

  expect(
    classifyTailDiagnosticSample({
      input: {
        sourceEvidence: createLiveSourceEvidence(),
        avgAmplitude: 0.3,
        analyserRms: 0.004,
        sourceMode: "system",
      },
      observer: { resonantObservedModeCount: 8, resonantObservedEnergy: 1 },
      frame: {
        fieldState: "active",
        renderAuthority: true,
        observationEnergy: 0.3,
      },
      render: {
        volumeVisible: false,
        plasmaProbeOrganizedDensity: 0.05,
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
    runtimeState: {
      debugSnapshot: {
        volumeVisible: true,
        raymarchDebug: { renderAuthority: true },
      },
    },
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
    runtimeState: {
      debugSnapshot: {
        volumeVisible: true,
        raymarchDebug: { renderAuthority: true },
      },
    },
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
