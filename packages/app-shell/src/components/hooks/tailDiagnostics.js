import { hasRenderAuthority } from "@baryon/visualizer/core/renderAuthorityContract";

const DEFAULT_SAMPLE_INTERVAL_MS = 250;
const DEFAULT_MAX_DURATION_MS = 60_000;
const OBSERVER_MIN_RESONANCE_ENERGY = 1e-4;
const FRAME_MIN_VISIBILITY_ENERGY = 0.02;
const OBSERVATION_SAMPLED_MIN_DENSITY = 0.005;

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
  const debugSnapshot = runtimeState?.debugSnapshot ?? {};
  const raymarchDebug = debugSnapshot.raymarchDebug ?? {};
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
      modalResponseEnergy: readFiniteNumber(
        modalFreshness.modalResponseEnergy ??
          featureFrame?.modalResponseEnergy ??
          featureFrame?.modalResponseRenderEnergy ??
          featureFrame?.debug?.modalResponseEnergy,
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
      return {
        active: state.active,
        startedAtMs: state.startedAtMs,
        stoppedAtMs: state.stoppedAtMs,
        sampleIntervalMs,
        maxDurationMs,
        samples: state.samples.map((sample) => ({ ...sample })),
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
