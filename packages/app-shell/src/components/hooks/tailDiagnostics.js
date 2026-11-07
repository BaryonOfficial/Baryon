import {
  RENDER_PROBE_MATERIAL_FIELDS,
  buildRenderProbeSnapshot,
} from "./renderProbeSnapshot.js";

const DEFAULT_SAMPLE_INTERVAL_MS = 250;
const DEFAULT_MAX_DURATION_MS = 60_000;
const MATERIAL_PROBE_SPIKE_MIN_DELTA = 0.05;
const MATERIAL_PROBE_SPIKE_RELATIVE_DELTA = 0.35;

/**
 * @typedef {{
 *   runtimeDiagnostics?: Record<string, any> | null;
 *   featureFrame?: Record<string, any> | null;
 *   runtimeState?: Record<string, any> | null;
 *   nowMs?: number;
 * }} TailDiagnosticRecordInput
 */

/**
 * @typedef {{
 *   isActive(): boolean;
 *   start(input?: { nowMs?: number }): Record<string, any>;
 *   stop(input?: { nowMs?: number }): Record<string, any>;
 *   reset(): Record<string, any>;
 *   record(input?: TailDiagnosticRecordInput): Record<string, any> | null;
 *   dump(): Record<string, any>;
 * }} TailDiagnosticsRecorder
 */

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readString(value, fallback = null) {
  return typeof value === "string" ? value : fallback;
}

function hasCurrentObservation(frame = {}) {
  return (
    frame?.renderAuthority === true &&
    Number.isSafeInteger(frame.latestAcceptedEndSample)
  );
}

function quantileSorted(sortedValues, percentile) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(percentile * sortedValues.length) - 1),
  );
  return sortedValues[index];
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function summarizeNumericWindow(values) {
  if (values.length === 0) {
    return {
      count: 0,
      mean: null,
      variance: null,
      min: null,
      max: null,
      p50: null,
      p95: null,
      spikeThreshold: null,
      spikeCount: 0,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  const p50 = median(values);
  const spikeThreshold =
    p50 +
    Math.max(
      MATERIAL_PROBE_SPIKE_MIN_DELTA,
      Math.abs(p50) * MATERIAL_PROBE_SPIKE_RELATIVE_DELTA,
    );

  return {
    count: values.length,
    mean,
    variance,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50,
    p95: quantileSorted(sorted, 0.95),
    spikeThreshold,
    spikeCount: values.filter((value) => value > spikeThreshold).length,
  };
}

function readMaterialProbeValues(samples, field) {
  return samples
    .filter((sample) => sample?.probe?.health?.available === true)
    .map((sample) => sample?.render?.[field])
    .filter(Number.isFinite);
}

function countSampleClassifications(samples) {
  return samples.reduce((counts, sample) => {
    const classification = readString(sample?.classification, "unclassified");
    counts[classification] = (counts[classification] ?? 0) + 1;
    return counts;
  }, {});
}

function hasMaterialProbeSignal(sample) {
  return sample?.probe?.health?.available === true;
}
function hasActiveProbeCandidate(sample) {
  return sample?.probe?.health?.activeCandidate === true;
}

function classifyMaterialProbeWindow({
  metrics,
  sampleCount,
  probeSampleCount,
  activeProbeCandidateCount,
}) {
  if (sampleCount === 0) {
    return "empty";
  }
  if (probeSampleCount < activeProbeCandidateCount || probeSampleCount === 0) {
    return "probe-unavailable";
  }
  if (metrics.plasmaProbePreBloomRadiance.spikeCount > 0) {
    return "plasma-transfer";
  }
  if (
    metrics.plasmaProbePostBloomRisk.spikeCount > 0 ||
    metrics.plasmaProbeBloomAmplification.spikeCount > 0
  ) {
    return "bloom-output";
  }
  return "stable";
}

export function summarizeTailDiagnosticWindow(samples = []) {
  const safeSamples = Array.isArray(samples) ? samples : [];
  const sampleClassifications = countSampleClassifications(safeSamples);
  const probeSampleCount = safeSamples.filter(hasMaterialProbeSignal).length;
  const activeProbeCandidateCount = safeSamples.filter(
    hasActiveProbeCandidate,
  ).length;
  const metrics = Object.fromEntries(
    RENDER_PROBE_MATERIAL_FIELDS.map((field) => [
      field,
      summarizeNumericWindow(readMaterialProbeValues(safeSamples, field)),
    ]),
  );
  return {
    sampleCount: safeSamples.length,
    probeSampleCount,
    activeProbeCandidateCount,
    sampleClassifications,
    classification: classifyMaterialProbeWindow({
      metrics,
      sampleCount: safeSamples.length,
      probeSampleCount,
      activeProbeCandidateCount,
    }),
    metrics,
  };
}

export function classifyTailDiagnosticSample(sample = {}) {
  if (sample.frame?.presentationFailure) return "presentation-failed";
  if (!hasCurrentObservation(sample.frame)) return "model-unavailable";
  if (sample.observer?.hasHistory !== true) return "observer-pending";
  if (sample.render?.volumeVisible !== true) return "render-hidden";
  if (sample.frame.sourcePhase === "paused") return "source-held";
  if (sample.frame.sourcePhase === "draining") return "source-draining";
  return "active";
}

function buildTailDiagnosticSample({
  runtimeDiagnostics,
  featureFrame = null,
  runtimeState = null,
  tMs,
}) {
  const debugSnapshot = runtimeState?.debugSnapshot ?? null;
  const probe = buildRenderProbeSnapshot({
    renderDiagnostics: runtimeDiagnostics?.render,
    debugSnapshot,
    runtimeState,
    featureFrame,
    nowMs: tMs,
  });
  const sample = {
    tMs: readFiniteNumber(tMs),
    input: {
      sourceGeneration: featureFrame?.observation.sourceGeneration ?? null,
      inputEndSample: featureFrame?.observation.inputEndSample ?? null,
      preparationDelayFrames:
        featureFrame?.observation.preparationDelayFrames ?? null,
    },
    frame: probe.state,
    observer: debugSnapshot?.observer
      ? { ...debugSnapshot.observer }
      : { hasHistory: false, stepIndex: null },
    render: { ...probe.visual, ...probe.material },
    probe,
  };
  sample.classification = classifyTailDiagnosticSample(sample);
  return sample;
}

/** @returns {TailDiagnosticsRecorder} */
export function createTailDiagnosticsRecorder({
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
} = {}) {
  const maxSamples = Math.max(
    1,
    Math.ceil(maxDurationMs / Math.max(1, sampleIntervalMs)),
  );
  const state = {
    active: false,
    startedAtMs: null,
    stoppedAtMs: null,
    lastSampleAtMs: Number.NEGATIVE_INFINITY,
    samples: [],
  };

  const dump = () => {
    const samples = state.samples.map((sample) => ({ ...sample }));
    return {
      active: state.active,
      startedAtMs: state.startedAtMs,
      stoppedAtMs: state.stoppedAtMs,
      sampleIntervalMs,
      maxDurationMs,
      windowSummary: summarizeTailDiagnosticWindow(samples),
      samples,
    };
  };

  return {
    isActive() {
      return state.active;
    },
    start({ nowMs = 0 } = {}) {
      state.active = true;
      state.startedAtMs = nowMs;
      state.stoppedAtMs = null;
      state.lastSampleAtMs = Number.NEGATIVE_INFINITY;
      state.samples = [];
      return dump();
    },
    stop({ nowMs = 0 } = {}) {
      state.active = false;
      state.stoppedAtMs = nowMs;
      return dump();
    },
    reset() {
      state.active = false;
      state.startedAtMs = null;
      state.stoppedAtMs = null;
      state.lastSampleAtMs = Number.NEGATIVE_INFINITY;
      state.samples = [];
      return dump();
    },
    record({ runtimeDiagnostics, featureFrame, runtimeState, nowMs = 0 } = {}) {
      if (!state.active) {
        return null;
      }
      if (nowMs - state.lastSampleAtMs < sampleIntervalMs) {
        return null;
      }

      const sample = buildTailDiagnosticSample({
        runtimeDiagnostics,
        featureFrame,
        runtimeState,
        tMs: Math.max(0, nowMs - (state.startedAtMs ?? nowMs)),
      });
      state.samples.push(sample);
      if (state.samples.length > maxSamples) {
        state.samples.splice(0, state.samples.length - maxSamples);
      }
      state.lastSampleAtMs = nowMs;
      return sample;
    },
    dump,
  };
}

/**
 * @param {TailDiagnosticsRecorder | null | undefined} recorder
 * @param {TailDiagnosticRecordInput} sampleInput
 */
export function recordTailDiagnosticsSample(recorder, sampleInput) {
  return recorder?.record?.(sampleInput) ?? null;
}

/** @param {TailDiagnosticsRecorder | null | undefined} recorder */
export function isTailDiagnosticsRecorderActive(recorder) {
  return recorder?.isActive?.() === true;
}

/**
 * @param {{
 *   targetWindow?: (Window & typeof globalThis) | null;
 *   recorder?: TailDiagnosticsRecorder | null;
 *   getNowMs?: () => number;
 * }} [options]
 */
export function installTailDiagnosticsWindowApi({
  targetWindow = typeof window !== "undefined" ? window : null,
  recorder,
  getNowMs = () =>
    typeof globalThis.performance?.now === "function"
      ? globalThis.performance.now()
      : Date.now(),
} = {}) {
  if (!targetWindow || !recorder) {
    return () => {};
  }

  const api = {
    start() {
      return recorder.start({ nowMs: getNowMs() });
    },
    stop() {
      return recorder.stop({ nowMs: getNowMs() });
    },
    reset() {
      return recorder.reset();
    },
    dump() {
      return recorder.dump();
    },
    async copy() {
      const dump = recorder.dump();
      const text = JSON.stringify(dump, null, 2);
      try {
        await targetWindow.navigator?.clipboard?.writeText?.(text);
        return {
          ...dump,
          copied: true,
        };
      } catch (error) {
        return {
          ...dump,
          copied: false,
          copyError: {
            name:
              typeof error?.name === "string" && error.name
                ? error.name
                : "Error",
            message:
              typeof error?.message === "string" && error.message
                ? error.message
                : "Clipboard write failed.",
          },
        };
      }
    },
  };

  targetWindow.__baryonTailDiagnostics = api;
  return () => {
    if (targetWindow.__baryonTailDiagnostics === api) {
      delete targetWindow.__baryonTailDiagnostics;
    }
  };
}
