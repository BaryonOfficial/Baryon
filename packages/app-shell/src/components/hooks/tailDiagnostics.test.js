import { expect, test, vi } from "vitest";
import { createAudioFeaturePacketFixture } from "../../../../engine/src/testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "@baryon/engine/audio-features";
import {
  classifyTailDiagnosticSample,
  createTailDiagnosticsRecorder,
  installTailDiagnosticsWindowApi,
  recordTailDiagnosticsSample,
  summarizeTailDiagnosticWindow,
} from "./tailDiagnostics.js";
import {
  buildRenderProbeSnapshot,
  RENDER_PROBE_MATERIAL_FIELDS,
} from "./renderProbeSnapshot.js";
const frame = createRendererFeatureView(
  createAudioFeaturePacketFixture().model(),
);
const state = {
  volumeMesh: { visible: true },
  idleOverlay: { visible: false },
  debugSnapshot: {
    renderAuthority: true,
    observer: { hasHistory: true, stepIndex: 3 },
    observationEndSample: 256,
  },
};
const measurement = (overrides = {}) => ({
  available: true,
  ...Object.fromEntries(RENDER_PROBE_MATERIAL_FIELDS.map((key) => [key, 0])),
  ...overrides,
});
const input = (nowMs = 0) => ({
  featureFrame: frame,
  runtimeState: state,
  nowMs,
});

test("tail recorder is inert until started and enforces interval/bounded retention", () => {
  const recorder = createTailDiagnosticsRecorder({
    sampleIntervalMs: 10,
    maxDurationMs: 20,
  });
  expect(recorder.record(input())).toBe(null);
  recorder.start({ nowMs: 100 });
  expect(recorder.record(input(100))).not.toBe(null);
  expect(recorder.record(input(105))).toBe(null);
  recorder.record(input(110));
  recorder.record(input(120));
  expect(recorder.dump().samples.map((s) => s.tMs)).toEqual([10, 20]);
  const { stop, reset } = recorder;
  expect(stop({ nowMs: 130 }).active).toBe(false);
  expect(reset().samples).toEqual([]);
});
test("records raw response energy and distinct accepted/observer cursors without legacy phase state", () => {
  const recorder = createTailDiagnosticsRecorder();
  recorder.start();
  const sample = recorder.record(input());
  expect(sample.frame).toMatchObject({
    familyCount: 85,
    shellCount: 59,
    normalizationEnergy: frame.observation.normalizationEnergy,
    latestAcceptedEndSample: 512,
    observerConsumedEndSample: 256,
  });
  expect(sample.classification).toBe("active");
  expect(sample.frame).not.toHaveProperty("modalResponseEnergy");
  expect(sample.input).not.toHaveProperty("sourceEvidence");
  expect(JSON.stringify(sample)).not.toContain("pressureMoments");
});
test("valid model metadata cannot claim that material readback was measured", () => {
  const probe = buildRenderProbeSnapshot({
    featureFrame: frame,
    runtimeState: state,
  });
  expect(probe.health).toMatchObject({
    available: false,
    activeCandidate: true,
    unavailableReason: "material-readback-unavailable",
  });
  expect(Object.values(probe.material).every((v) => v === null)).toBe(true);
  const recorder = createTailDiagnosticsRecorder();
  recorder.start();
  recorder.record(input());
  expect(recorder.dump().windowSummary).toMatchObject({
    classification: "probe-unavailable",
    probeSampleCount: 0,
    metrics: { plasmaProbePreBloomRadiance: { count: 0, mean: null } },
  });
});
test("an explicit complete zero-valued readback remains a real measurement", () => {
  const recorder = createTailDiagnosticsRecorder();
  recorder.start();
  recorder.record({
    ...input(),
    runtimeDiagnostics: { render: { materialProbe: measurement() } },
  });
  expect(recorder.dump().windowSummary).toMatchObject({
    classification: "stable",
    probeSampleCount: 1,
    metrics: { plasmaProbePreBloomRadiance: { count: 1, mean: 0 } },
  });
  const incomplete = measurement();
  delete incomplete.plasmaProbeExtinction;
  expect(
    buildRenderProbeSnapshot({
      featureFrame: frame,
      runtimeState: state,
      renderDiagnostics: { materialProbe: incomplete },
    }).health.available,
  ).toBe(false);
});
test("material windows detect measured spikes without filling absent measurements with zero", () => {
  const recorder = createTailDiagnosticsRecorder({ sampleIntervalMs: 1 });
  recorder.start();
  [0.2, 0.21, 0.8].forEach((radiance, n) =>
    recorder.record({
      ...input(n),
      runtimeDiagnostics: {
        render: {
          materialProbe: measurement({ plasmaProbePreBloomRadiance: radiance }),
        },
      },
    }),
  );
  expect(recorder.dump().windowSummary).toMatchObject({
    classification: "plasma-transfer",
    metrics: {
      plasmaProbePreBloomRadiance: { count: 3, max: 0.8, spikeCount: 1 },
    },
  });
  expect(summarizeTailDiagnosticWindow([]).classification).toBe("empty");
});
test("classification reports observable lifecycle seams without inferring input loss from raw energy", () => {
  const base = {
    frame: {
      renderAuthority: true,
      latestAcceptedEndSample: 512,
      normalizationEnergy: 0,
      sourcePhase: "running",
    },
    observer: { hasHistory: true },
    render: { volumeVisible: true },
  };
  expect(classifyTailDiagnosticSample(base)).toBe("active");
  expect(
    classifyTailDiagnosticSample({
      ...base,
      frame: { ...base.frame, sourcePhase: "paused" },
    }),
  ).toBe("source-held");
  expect(
    classifyTailDiagnosticSample({
      ...base,
      frame: { ...base.frame, sourcePhase: "draining" },
    }),
  ).toBe("source-draining");
  expect(
    classifyTailDiagnosticSample({
      ...base,
      frame: { ...base.frame, presentationFailure: "queue-overflow" },
    }),
  ).toBe("presentation-failed");
  expect(classifyTailDiagnosticSample({ ...base, frame: null })).toBe(
    "model-unavailable",
  );
  expect(
    classifyTailDiagnosticSample({ ...base, observer: { hasHistory: false } }),
  ).toBe("observer-pending");
  expect(
    classifyTailDiagnosticSample({ ...base, render: { volumeVisible: false } }),
  ).toBe("render-hidden");
});
test("window API copies a capture and returns evidence when clipboard access fails", async () => {
  const writeText = vi.fn(async () => {}),
    targetWindow = { navigator: { clipboard: { writeText } } },
    recorder = createTailDiagnosticsRecorder();
  const cleanup = installTailDiagnosticsWindowApi({
    targetWindow,
    recorder,
    getNowMs: () => 500,
  });
  targetWindow.__baryonTailDiagnostics.start();
  recordTailDiagnosticsSample(recorder, input(500));
  await targetWindow.__baryonTailDiagnostics.copy();
  expect(writeText).toHaveBeenCalledWith(
    JSON.stringify(recorder.dump(), null, 2),
  );
  writeText.mockRejectedValue(
    new DOMException("Not focused", "NotAllowedError"),
  );
  await expect(
    targetWindow.__baryonTailDiagnostics.copy(),
  ).resolves.toMatchObject({
    copied: false,
    copyError: { name: "NotAllowedError" },
    samples: [{ classification: "active" }],
  });
  cleanup();
  expect(targetWindow.__baryonTailDiagnostics).toBeUndefined();
});
