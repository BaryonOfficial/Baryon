import { hasRenderAuthority } from "@baryon/visualizer/core/renderAuthorityContract";
import {
  RENDER_PROBE_MATERIAL_FIELDS,
  buildRenderProbeSnapshot,
} from "./renderProbeSnapshot.js";
import { readRenderFacingModalResponseEnergy } from "./modalResponseDiagnostics.js";

const DEFAULT_SAMPLE_INTERVAL_MS = 250;
const DEFAULT_MAX_DURATION_MS = 60_000;
const OBSERVER_MIN_RESONANCE_ENERGY = 1e-4;
const FRAME_MIN_VISIBILITY_ENERGY = 0.02;
const OBSERVATION_SAMPLED_MIN_DENSITY = 0.005;
const MATERIAL_PROBE_SPIKE_MIN_DELTA = 0.05;
const MATERIAL_PROBE_SPIKE_RELATIVE_DELTA = 0.35;
const SUPPORT_DOMINANCE_RATIO = 2;
const SUPPORT_DOMINANCE_MIN_DELTA = 0.05;
const CAUSTIC_COLLAPSE_RATIO = 0.5;

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

function readBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value, fallback = null) {
  return typeof value === "string" ? value : fallback;
}

function readStringArrayMap(value, fallback = null) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entries]) => [
      key,
      Array.isArray(entries) ? [...entries] : [],
    ]),
  );
}

function hasLiveSourceEvidence(sourceEvidence = null) {
  return (
    sourceEvidence?.currentSourceEvidence === true &&
    sourceEvidence?.sourceBoundaryState === "live" &&
    readFiniteNumber(sourceEvidence?.sourceEnergy) > 0
  );
}

function hasCurrentInput(input = {}) {
  return hasLiveSourceEvidence(input.sourceEvidence);
}

function hasObservedModalResponse(observer = {}, frame = {}) {
  return (
    readFiniteNumber(frame.observationEnergy) >= FRAME_MIN_VISIBILITY_ENERGY ||
    readFiniteNumber(frame.modalResponseEnergy) >=
      FRAME_MIN_VISIBILITY_ENERGY ||
    (readFiniteNumber(observer.observedResonanceModeCount) > 0 &&
      readFiniteNumber(observer.observedResonanceEnergy) >
        OBSERVER_MIN_RESONANCE_ENERGY)
  );
}

function hasFrameVisibility(frame = {}) {
  return (
    frame.renderAuthority === true &&
    readFiniteNumber(frame.observationEnergy) >= FRAME_MIN_VISIBILITY_ENERGY
  );
}

function hasObservationSampledDensity(render = {}) {
  return (
    readFiniteNumber(render.observationSampledDensityFloor) >=
    OBSERVATION_SAMPLED_MIN_DENSITY
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
      mean: 0,
      variance: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      spikeThreshold: 0,
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
  return samples.map((sample) => readFiniteNumber(sample?.render?.[field]));
}

function summarizeMaterialProbeDominance(samples) {
  const causticValues = readMaterialProbeValues(
    samples,
    "materialProbeCausticVisibleDensity",
  );
  const supportValues = readMaterialProbeValues(
    samples,
    "materialProbeSupportVisibleDensity",
  );
  const causticMedian = median(causticValues);
  const supportMedian = median(supportValues);
  let supportDominantSampleCount = 0;
  let causticCollapseSampleCount = 0;

  samples.forEach((sample) => {
    const caustic = readFiniteNumber(
      sample?.render?.materialProbeCausticVisibleDensity,
    );
    const support = readFiniteNumber(
      sample?.render?.materialProbeSupportVisibleDensity,
    );
    if (
      support > caustic * SUPPORT_DOMINANCE_RATIO &&
      support - caustic >= SUPPORT_DOMINANCE_MIN_DELTA
    ) {
      supportDominantSampleCount += 1;
    }
    if (
      causticMedian > 0 &&
      supportMedian > 0 &&
      caustic <= causticMedian * CAUSTIC_COLLAPSE_RATIO &&
      support >= supportMedian
    ) {
      causticCollapseSampleCount += 1;
    }
  });

  return {
    supportToCausticMean:
      summarizeNumericWindow(supportValues).mean /
      Math.max(1e-6, summarizeNumericWindow(causticValues).mean),
    supportDominantSampleCount,
    causticCollapseSampleCount,
  };
}

function countSampleClassifications(samples) {
  return samples.reduce((counts, sample) => {
    const classification = readString(sample?.classification, "unclassified");
    counts[classification] = (counts[classification] ?? 0) + 1;
    return counts;
  }, {});
}

function hasMaterialProbeSignal(sample) {
  const probe = sample?.probe ?? sample?.render?.renderProbeSnapshot ?? null;
  if (probe?.health?.available === true) {
    return true;
  }
  const render = sample?.render ?? {};
  return (
    readFiniteNumber(render.materialProbePhysicalDensity) > 0 ||
    readFiniteNumber(render.materialProbeCausticVisibleDensity) > 0 ||
    readFiniteNumber(render.materialProbeSupportVisibleDensity) > 0 ||
    readFiniteNumber(render.materialProbePreBloomRadiance) > 0 ||
    readFiniteNumber(render.materialProbePostBloomRisk) > 0 ||
    readFiniteNumber(render.materialProbeBloomAmplification, 1) !== 1
  );
}

function hasActiveProbeCandidate(sample) {
  const probe = sample?.probe ?? sample?.render?.renderProbeSnapshot ?? null;
  if (typeof probe?.health?.activeCandidate === "boolean") {
    return probe.health.activeCandidate;
  }
  return (
    sample?.render?.volumeVisible === true &&
    sample?.frame?.renderAuthority === true &&
    (readFiniteNumber(sample?.frame?.projectedRenderEnergy) > 0 ||
      readFiniteNumber(sample?.frame?.observationEnergy) > 0)
  );
}

function classifyMaterialProbeWindow({
  metrics,
  dominance,
  sampleCount,
  probeSampleCount,
  activeProbeCandidateCount,
}) {
  if (sampleCount === 0) {
    return "empty";
  }
  if (probeSampleCount === 0 && activeProbeCandidateCount > 0) {
    return "probe-unavailable";
  }
  if (metrics.materialProbePreBloomRadiance.spikeCount > 0) {
    return "material-transfer";
  }
  if (
    metrics.materialProbePostBloomRisk.spikeCount > 0 ||
    metrics.materialProbeBloomAmplification.spikeCount > 0
  ) {
    return "bloom-output";
  }
  if (dominance.causticCollapseSampleCount > 0) {
    return "caustic-collapse";
  }
  if (dominance.supportDominantSampleCount >= Math.ceil(sampleCount / 2)) {
    return "support-fill";
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
  const dominance = summarizeMaterialProbeDominance(safeSamples);

  return {
    sampleCount: safeSamples.length,
    probeSampleCount,
    activeProbeCandidateCount,
    sampleClassifications,
    classification: classifyMaterialProbeWindow({
      metrics,
      dominance,
      sampleCount: safeSamples.length,
      probeSampleCount,
      activeProbeCandidateCount,
    }),
    metrics,
    dominance,
  };
}

export function classifyTailDiagnosticSample(sample = {}) {
  const inputPresent = hasCurrentInput(sample.input);
  if (!inputPresent) {
    return "input-drop";
  }

  const observerPresent = hasObservedModalResponse(
    sample.observer,
    sample.frame,
  );
  if (!observerPresent) {
    return "observer-drop";
  }

  const frameVisible = hasFrameVisibility(sample.frame);
  if (!frameVisible) {
    return "frame-visibility-drop";
  }

  if (sample.render?.volumeVisible === false) {
    return "render-hidden";
  }

  if (!hasObservationSampledDensity(sample.render)) {
    return "observation-transfer-drop";
  }

  return "unknown";
}

function buildTailDiagnosticSample({
  runtimeDiagnostics,
  featureFrame = null,
  runtimeState = null,
  tMs,
}) {
  const modalFreshness = runtimeDiagnostics?.modalFreshness ?? {};
  const render = runtimeDiagnostics?.render ?? {};
  const debugSnapshot = runtimeState?.debugSnapshot ?? null;
  const raymarchDebug = debugSnapshot?.raymarchDebug ?? {};
  const sourceEvidence =
    modalFreshness.sourceEvidence ?? featureFrame?.sourceEvidence ?? null;
  const renderAuthority =
    featureFrame != null
      ? hasRenderAuthority(featureFrame)
      : readBoolean(raymarchDebug.renderAuthority);

  const sample = {
    tMs: readFiniteNumber(tMs),
    input: {
      sourceEvidence,
      avgAmplitude: readFiniteNumber(modalFreshness.avgAmplitude),
      analyserRms: readFiniteNumber(modalFreshness.analyserRms),
      periodicity: readFiniteNumber(modalFreshness.periodicity),
      hardSilence: readBoolean(modalFreshness.liveInputHardSilenceActive),
      noiseGate: readBoolean(modalFreshness.liveInputNoiseGateActive),
      sourceMode: modalFreshness.sourceMode ?? featureFrame?.sourceMode ?? null,
    },
    observer: {
      observedResonanceModeCount: readFiniteNumber(
        modalFreshness.observedResonanceModeCount,
      ),
      observedResonanceEnergy: readFiniteNumber(
        modalFreshness.observedResonanceEnergy,
      ),
      highQRingSupport: readFiniteNumber(modalFreshness.highQRingSupport),
      modeCoherence: readFiniteNumber(modalFreshness.modeCoherence),
      modalPhaseAuthority: readFiniteNumber(modalFreshness.modalPhaseAuthority),
    },
    frame: {
      fieldState:
        modalFreshness.fieldState ?? featureFrame?.fieldState ?? "idle",
      renderAuthority,
      projectedRenderEnergy: readFiniteNumber(
        featureFrame?.energyLedger?.projectedRenderEnergy ??
          raymarchDebug.projectedRenderEnergy,
      ),
      activeModeCount: readFiniteNumber(
        modalFreshness.uploadedModeCount ??
          render.activeModeCount ??
          modalFreshness.activeModeCount,
      ),
      activeModalFieldModeCount: readFiniteNumber(
        modalFreshness.uploadedModeCount ??
          modalFreshness.activeModalFieldModeCount ??
          modalFreshness.activeModeCount,
      ),
      totalSlotAmplitude: readFiniteNumber(
        runtimeState?.uniforms?.uTotalSlotAmplitude?.value ??
          raymarchDebug.totalSlotAmplitude ??
          render.totalSlotAmplitude ??
          modalFreshness.totalSlotAmplitude ??
          featureFrame?.debug?.totalSlotAmplitude,
      ),
      structuralProjectionDrive: readFiniteNumber(
        runtimeState?.uniforms?.uStructuralProjectionDrive?.value ??
          raymarchDebug.structuralProjectionDrive ??
          render.structuralProjectionDrive ??
          modalFreshness.structuralProjectionDrive ??
          featureFrame?.debug?.structuralProjectionDrive,
      ),
      structuralProjectionConcentration: readFiniteNumber(
        runtimeState?.uniforms?.uStructuralProjectionConcentration?.value ??
          raymarchDebug.structuralProjectionConcentration ??
          render.structuralProjectionConcentration ??
          modalFreshness.structuralProjectionConcentration ??
          featureFrame?.debug?.structuralProjectionConcentration,
      ),
      observationEnergy: readFiniteNumber(
        modalFreshness.observationEnergy ?? featureFrame?.observationEnergy,
      ),
      modalResponseEnergy: Math.max(
        readFiniteNumber(modalFreshness.modalResponseEnergy),
        readRenderFacingModalResponseEnergy(featureFrame),
      ),
      modalResponseBudgetScale: readFiniteNumber(
        modalFreshness.modalResponseBudgetScale ??
          featureFrame?.modalResponseBudgetScale ??
          featureFrame?.debug?.modalResponseBudgetScale,
      ),
      modalResponseRawEnergy: readFiniteNumber(
        modalFreshness.modalResponseRawEnergy ??
          featureFrame?.modalResponseRawEnergy ??
          featureFrame?.debug?.modalResponseRawEnergy,
      ),
      modalResponseAverageDampingEnvelope: readFiniteNumber(
        modalFreshness.modalResponseAverageDampingEnvelope ??
          featureFrame?.modalResponseAverageDampingEnvelope ??
          featureFrame?.debug?.modalResponseAverageDampingEnvelope,
      ),
      modalResponseAverageCouplingStrength: readFiniteNumber(
        modalFreshness.modalResponseAverageCouplingStrength ??
          featureFrame?.modalResponseAverageCouplingStrength ??
          featureFrame?.debug?.modalResponseAverageCouplingStrength,
      ),
      modalResponseAveragePhaseConfidence: readFiniteNumber(
        modalFreshness.modalResponseAveragePhaseConfidence ??
          featureFrame?.modalResponseAveragePhaseConfidence ??
          featureFrame?.debug?.modalResponseAveragePhaseConfidence,
      ),
      modalResponseAveragePersistence: readFiniteNumber(
        modalFreshness.modalResponseAveragePersistence ??
          featureFrame?.modalResponseAveragePersistence ??
          featureFrame?.debug?.modalResponseAveragePersistence,
      ),
    },
    render: {
      volumeVisible: readBoolean(debugSnapshot.volumeVisible, true),
      idleOverlayVisible: readBoolean(debugSnapshot.idleOverlayVisible),
      observationEnergy: readFiniteNumber(
        render.observationEnergy ?? raymarchDebug.observationEnergy,
      ),
      observationReferenceAnchor: readFiniteNumber(
        render.observationReferenceAnchor ??
          raymarchDebug.observationReferenceAnchor,
      ),
      observationReferenceSupport: readFiniteNumber(
        render.observationReferenceSupport ??
          raymarchDebug.observationReferenceSupport,
      ),
      observationReferenceDensityFloor: readFiniteNumber(
        render.observationReferenceDensityFloor ??
          raymarchDebug.observationReferenceDensityFloor,
      ),
      observationReferenceContourSupport: readFiniteNumber(
        render.observationReferenceContourSupport ??
          raymarchDebug.observationReferenceContourSupport,
      ),
      observationSampledAnchor: readFiniteNumber(
        render.observationSampledAnchor ??
          raymarchDebug.observationSampledAnchor,
      ),
      observationSampledSignedAuthority: readFiniteNumber(
        render.observationSampledSignedAuthority ??
          raymarchDebug.observationSampledSignedAuthority,
      ),
      observationSampledSupport: readFiniteNumber(
        render.observationSampledSupport ??
          raymarchDebug.observationSampledSupport,
      ),
      observationSampledDensityFloor: readFiniteNumber(
        render.observationSampledDensityFloor ??
          raymarchDebug.observationSampledDensityFloor,
      ),
      observationSampledContourSupport: readFiniteNumber(
        render.observationSampledContourSupport ??
          raymarchDebug.observationSampledContourSupport,
      ),
      materialProbePhysicalDensity: readFiniteNumber(
        render.materialProbePhysicalDensity ??
          raymarchDebug.materialProbePhysicalDensity,
      ),
      materialProbeCausticVisibleDensity: readFiniteNumber(
        render.materialProbeCausticVisibleDensity ??
          raymarchDebug.materialProbeCausticVisibleDensity,
      ),
      materialProbeSupportVisibleDensity: readFiniteNumber(
        render.materialProbeSupportVisibleDensity ??
          raymarchDebug.materialProbeSupportVisibleDensity,
      ),
      materialProbePreBloomRadiance: readFiniteNumber(
        render.materialProbePreBloomRadiance ??
          raymarchDebug.materialProbePreBloomRadiance,
      ),
      materialProbePostBloomRisk: readFiniteNumber(
        render.materialProbePostBloomRisk ??
          raymarchDebug.materialProbePostBloomRisk,
      ),
      materialProbeBloomAmplification: readFiniteNumber(
        render.materialProbeBloomAmplification ??
          raymarchDebug.materialProbeBloomAmplification,
        1,
      ),
      renderQuantityLedgerVersion: readString(
        render.renderQuantityLedgerVersion ??
          raymarchDebug.renderQuantityLedgerVersion,
      ),
      renderQuantityForbiddenConsumers: readStringArrayMap(
        render.renderQuantityForbiddenConsumers ??
          raymarchDebug.renderQuantityForbiddenConsumers,
      ),
      totalSlotAmplitude: readFiniteNumber(
        runtimeState?.uniforms?.uTotalSlotAmplitude?.value ??
          raymarchDebug.totalSlotAmplitude ??
          render.totalSlotAmplitude ??
          modalFreshness.totalSlotAmplitude ??
          featureFrame?.debug?.totalSlotAmplitude,
      ),
      structuralProjectionDrive: readFiniteNumber(
        runtimeState?.uniforms?.uStructuralProjectionDrive?.value ??
          raymarchDebug.structuralProjectionDrive ??
          render.structuralProjectionDrive ??
          modalFreshness.structuralProjectionDrive ??
          featureFrame?.debug?.structuralProjectionDrive,
      ),
      structuralProjectionConcentration: readFiniteNumber(
        runtimeState?.uniforms?.uStructuralProjectionConcentration?.value ??
          raymarchDebug.structuralProjectionConcentration ??
          render.structuralProjectionConcentration ??
          modalFreshness.structuralProjectionConcentration ??
          featureFrame?.debug?.structuralProjectionConcentration,
      ),
      modalBasisCacheReady: readBoolean(render.modalBasisCacheReady),
      modalBasisCacheSupportReady: readBoolean(
        render.modalBasisCacheSupportReady ??
          raymarchDebug.modalBasisCacheSupportReady,
      ),
      modalBasisCacheSupportSemantic: readString(
        render.modalBasisCacheSupportSemantic ??
          raymarchDebug.modalBasisCacheSupportSemantic,
        "coefficient-invariant-basis-support",
      ),
      liveSynthesisUnsignedSupportMean: readFiniteNumber(
        render.liveSynthesisUnsignedSupportMean ??
          raymarchDebug.liveSynthesisUnsignedSupportMean,
      ),
      liveSynthesisCancellationRatioMean: readFiniteNumber(
        render.liveSynthesisCancellationRatioMean ??
          raymarchDebug.liveSynthesisCancellationRatioMean,
      ),
      liveSynthesisCancellationRatioMax: readFiniteNumber(
        render.liveSynthesisCancellationRatioMax ??
          raymarchDebug.liveSynthesisCancellationRatioMax,
      ),
      liveSynthesisSupportDiagnosticSampleCount: readFiniteNumber(
        render.liveSynthesisSupportDiagnosticSampleCount ??
          raymarchDebug.liveSynthesisSupportDiagnosticSampleCount,
      ),
      liveSynthesisSupportDiagnosticSupportedSampleCount: readFiniteNumber(
        render.liveSynthesisSupportDiagnosticSupportedSampleCount ??
          raymarchDebug.liveSynthesisSupportDiagnosticSupportedSampleCount,
      ),
      liveSynthesisSupportDiagnosticCoverage: readFiniteNumber(
        render.liveSynthesisSupportDiagnosticCoverage ??
          raymarchDebug.liveSynthesisSupportDiagnosticCoverage,
      ),
      modalBasisCacheZeroAmplitudeSkippedModeCount: readFiniteNumber(
        render.modalBasisCacheZeroAmplitudeSkippedModeCount ??
          raymarchDebug.modalBasisCacheZeroAmplitudeSkippedModeCount,
      ),
      modalBasisCacheDescriptorStaleReason: readString(
        render.modalBasisCacheDescriptorStaleReason ??
          raymarchDebug.modalBasisCacheDescriptorStaleReason,
      ),
      modalBasisCacheRebuildPending: readBoolean(
        render.modalBasisCacheRebuildPending,
      ),
      modalBasisCachePhaseAuthority: readFiniteNumber(
        render.modalBasisCachePhaseAuthority,
      ),
      bloomEnabled: readBoolean(render.bloomEnabled),
      bloomResponseSignal: readFiniteNumber(modalFreshness.bloomResponseSignal),
      scaleSignal: readFiniteNumber(modalFreshness.scaleSignal),
      renderScale: readFiniteNumber(render.renderScale, 1),
    },
  };
  const probe = buildRenderProbeSnapshot({
    renderDiagnostics: {
      ...sample.render,
      observationEnergy: sample.frame.observationEnergy,
      activeModeCount: sample.frame.activeModeCount,
    },
    debugSnapshot,
    runtimeState,
    featureFrame,
    nowMs: tMs,
  });
  sample.probe = probe;
  sample.render.renderProbeSnapshot = probe;
  sample.render.renderProbeSchemaVersion = probe.schemaVersion;
  sample.render.renderProbeAvailable = probe.health.available;
  sample.render.renderProbeActiveCandidate = probe.health.activeCandidate;
  sample.render.renderProbeStatus = probe.health.status;
  sample.render.renderProbeUnavailableReason = probe.health.unavailableReason;
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
      return this.dump();
    },
    stop({ nowMs = 0 } = {}) {
      state.active = false;
      state.stoppedAtMs = nowMs;
      return this.dump();
    },
    reset() {
      state.active = false;
      state.startedAtMs = null;
      state.stoppedAtMs = null;
      state.lastSampleAtMs = Number.NEGATIVE_INFINITY;
      state.samples = [];
      return this.dump();
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
    dump() {
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
    },
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
