const DEFAULT_SAMPLE_INTERVAL_MS = 250;
const DEFAULT_MAX_DURATION_MS = 60_000;
const INPUT_MIN_AVG_AMPLITUDE = 1e-4;
const INPUT_MIN_RMS = 1e-5;
const OBSERVER_MIN_HIGH_Q_ENERGY = 1e-4;
const FRAME_MIN_VISIBILITY_ENERGY = 0.02;
const SHADER_MIN_RIDGE_DENSITY = 0.005;

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

function hasCurrentInput(input = {}) {
  return (
    input.sourceMode !== "silent" &&
    input.hardSilence !== true &&
    input.noiseGate !== true &&
    (readFiniteNumber(input.avgAmplitude) > INPUT_MIN_AVG_AMPLITUDE ||
      readFiniteNumber(input.analyserRms) > INPUT_MIN_RMS)
  );
}

function hasObservedModalResponse(observer = {}, frame = {}) {
  return (
    readFiniteNumber(frame.observationEnergy) >= FRAME_MIN_VISIBILITY_ENERGY ||
    readFiniteNumber(frame.modalResponseBackboneEnergy) >=
      FRAME_MIN_VISIBILITY_ENERGY ||
    readFiniteNumber(frame.modalResponseDetailEnergy) >=
      FRAME_MIN_VISIBILITY_ENERGY ||
    (readFiniteNumber(observer.highQDetailModeCount) > 0 &&
      readFiniteNumber(observer.highQDetailEnergy) > OBSERVER_MIN_HIGH_Q_ENERGY)
  );
}

function hasFrameVisibility(frame = {}) {
  return (
    frame.fieldState !== "idle" &&
    readFiniteNumber(frame.observationEnergy) >= FRAME_MIN_VISIBILITY_ENERGY
  );
}

function hasShaderVisibleDensity(render = {}) {
  return (
    readFiniteNumber(render.observedDensityFloorMax) >= SHADER_MIN_RIDGE_DENSITY
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

  if (!hasShaderVisibleDensity(sample.render)) {
    return "shader-density-drop";
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

  const sample = {
    tMs: readFiniteNumber(tMs),
    input: {
      avgAmplitude: readFiniteNumber(modalFreshness.avgAmplitude),
      analyserRms: readFiniteNumber(modalFreshness.analyserRms),
      periodicity: readFiniteNumber(modalFreshness.periodicity),
      hardSilence: readBoolean(modalFreshness.liveInputHardSilenceActive),
      noiseGate: readBoolean(modalFreshness.liveInputNoiseGateActive),
      sourceMode: modalFreshness.sourceMode ?? featureFrame?.sourceMode ?? null,
    },
    observer: {
      highQDetailModeCount: readFiniteNumber(
        modalFreshness.highQDetailModeCount,
      ),
      highQDetailEnergy: readFiniteNumber(modalFreshness.highQDetailEnergy),
      highQRingSupport: readFiniteNumber(modalFreshness.highQRingSupport),
      modeCoherence: readFiniteNumber(modalFreshness.modeCoherence),
      modalPhaseAuthority: readFiniteNumber(modalFreshness.modalPhaseAuthority),
    },
    frame: {
      fieldState:
        modalFreshness.fieldState ?? featureFrame?.fieldState ?? "idle",
      activeBackboneModeCount: readFiniteNumber(
        modalFreshness.activeBackboneModeCount,
      ),
      activeDetailModeCount: readFiniteNumber(
        modalFreshness.activeDetailModeCount,
      ),
      activeModeCount: readFiniteNumber(modalFreshness.activeModeCount),
      totalSlotAmplitude: readFiniteNumber(
        featureFrame?.debug?.totalSlotAmplitude,
      ),
      observationEnergy: readFiniteNumber(
        modalFreshness.observationEnergy ?? featureFrame?.observationEnergy,
      ),
      modalResponseBackboneEnergy: readFiniteNumber(
        modalFreshness.modalResponseBackboneEnergy ??
          featureFrame?.modalResponseBackboneEnergy ??
          featureFrame?.debug?.modalResponseBackboneEnergy,
      ),
      modalResponseDetailEnergy: readFiniteNumber(
        modalFreshness.modalResponseDetailEnergy ??
          featureFrame?.modalResponseDetailEnergy ??
          featureFrame?.debug?.modalResponseDetailEnergy,
      ),
    },
    render: {
      volumeVisible: readBoolean(debugSnapshot.volumeVisible, true),
      idleOverlayVisible: readBoolean(debugSnapshot.idleOverlayVisible),
      observationEnergy: readFiniteNumber(
        render.observationEnergy ?? raymarchDebug.observationEnergy,
      ),
      observationAnchorMax: readFiniteNumber(
        render.observationAnchorMax ?? raymarchDebug.observationAnchorMax,
      ),
      observationSupportMax: readFiniteNumber(
        render.observationSupportMax ?? raymarchDebug.observationSupportMax,
      ),
      observedDensityFloorMax: readFiniteNumber(
        render.observedDensityFloorMax ?? raymarchDebug.observedDensityFloorMax,
      ),
      observedContourSupportMax: readFiniteNumber(
        render.observedContourSupportMax ??
          raymarchDebug.observedContourSupportMax,
      ),
      effectiveFieldReady: readBoolean(render.effectiveFieldReady),
      effectiveFieldRebuildPending: readBoolean(
        render.effectiveFieldRebuildPending,
      ),
      effectiveFieldAuthority: readFiniteNumber(render.effectiveFieldAuthority),
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
