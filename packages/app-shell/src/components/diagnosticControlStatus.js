import {
  RUNTIME_RENDERER_BACKENDS,
  RUNTIME_SESSION_PHASES,
} from "./hooks/runtimeSessionController.js";

const DIAGNOSTIC_CONTROL_STATUS_STATES = Object.freeze({
  active: "active",
  inactive: "inactive",
  applying: "applying",
  armed: "armed",
  required: "required",
  failed: "failed",
});

const FRAME_APPLIED_CONTROL_KEYS = Object.freeze([
  "auditEnabled",
  "freezeModeSlots",
  "injectTestTone",
  "suppressPlaybackTelemetry",
]);

function createControlStatus({ requested, applied, generation, state, label }) {
  return {
    requested,
    applied,
    generation,
    state,
    label,
  };
}

export function createAppliedDiagnosticControlState(frameState) {
  const diagnosticState = frameState?.featureFrame?.diagnosticControlState;
  const generation = frameState?.runtimeGeneration;
  if (!diagnosticState || !Number.isInteger(generation)) {
    return null;
  }

  const renderControls = frameState?.controls ?? {};
  const suppressPlaybackTelemetry =
    diagnosticState.suppressPlaybackTelemetry === true &&
    renderControls.suppressPlaybackTelemetry === true;

  return {
    generation,
    auditEnabled:
      diagnosticState.auditEnabled === true &&
      renderControls.auditEnabled === true,
    freezeModeSlots: diagnosticState.freezeModeSlots === true,
    injectTestTone: diagnosticState.injectTestTone === true,
    suppressPlaybackTelemetry,
    suppressPlaybackTelemetryActive:
      suppressPlaybackTelemetry && frameState?.status?.isPlaying === true,
  };
}

export function areAppliedDiagnosticControlStatesEqual(previous, next) {
  if (previous === next) {
    return true;
  }
  if (!previous || !next || previous.generation !== next.generation) {
    return false;
  }
  return [
    ...FRAME_APPLIED_CONTROL_KEYS,
    "suppressPlaybackTelemetryActive",
  ].every((key) => Object.is(previous[key], next[key]));
}

function deriveFrameControlStatus({
  key,
  controlsState,
  appliedState,
  generation,
}) {
  const requested = controlsState?.[key] === true;
  const hasCurrentEvidence = appliedState?.generation === generation;
  const applied = hasCurrentEvidence ? appliedState[key] === true : null;

  if (!hasCurrentEvidence || applied !== requested) {
    return createControlStatus({
      requested,
      applied,
      generation,
      state: DIAGNOSTIC_CONTROL_STATUS_STATES.applying,
      label: "Applying",
    });
  }

  if (
    key === "suppressPlaybackTelemetry" &&
    requested &&
    appliedState.suppressPlaybackTelemetryActive !== true
  ) {
    return createControlStatus({
      requested,
      applied,
      generation,
      state: DIAGNOSTIC_CONTROL_STATUS_STATES.armed,
      label: "Armed",
    });
  }

  return createControlStatus({
    requested,
    applied,
    generation,
    state: requested
      ? DIAGNOSTIC_CONTROL_STATUS_STATES.active
      : DIAGNOSTIC_CONTROL_STATUS_STATES.inactive,
    label: requested ? "Active" : "Off",
  });
}

function deriveRendererControlStatus(controlsState, runtimeSession) {
  const requested = controlsState?.forceWebGLFallbackTest === true;
  const generation = runtimeSession.generation;
  const applied =
    runtimeSession.observedBackend === null
      ? null
      : runtimeSession.observedBackend === RUNTIME_RENDERER_BACKENDS.webgl2;

  if (runtimeSession.phase === RUNTIME_SESSION_PHASES.failed) {
    return createControlStatus({
      requested,
      applied,
      generation,
      state: DIAGNOSTIC_CONTROL_STATUS_STATES.failed,
      label: "Failed",
    });
  }

  if (runtimeSession.phase !== RUNTIME_SESSION_PHASES.ready) {
    return createControlStatus({
      requested,
      applied,
      generation,
      state: DIAGNOSTIC_CONTROL_STATUS_STATES.applying,
      label: "Restarting",
    });
  }

  if (runtimeSession.rendererRequiredWebGL && !requested) {
    return createControlStatus({
      requested,
      applied: true,
      generation,
      state: DIAGNOSTIC_CONTROL_STATUS_STATES.required,
      label: "Required",
    });
  }

  const expectedWebGL = requested;
  if (applied !== expectedWebGL) {
    return createControlStatus({
      requested,
      applied,
      generation,
      state: DIAGNOSTIC_CONTROL_STATUS_STATES.failed,
      label: "Mismatch",
    });
  }

  return createControlStatus({
    requested,
    applied,
    generation,
    state: requested
      ? DIAGNOSTIC_CONTROL_STATUS_STATES.active
      : DIAGNOSTIC_CONTROL_STATUS_STATES.inactive,
    label: requested ? "Active" : "Off",
  });
}

export function deriveDiagnosticControlStatuses({
  controlsState,
  appliedState,
  runtimeSession,
  authoritativeAuditEnabled,
}) {
  const generation = runtimeSession.generation;
  const statuses = Object.fromEntries(
    FRAME_APPLIED_CONTROL_KEYS.map((key) => [
      key,
      deriveFrameControlStatus({
        key,
        controlsState,
        appliedState,
        generation,
      }),
    ]),
  );

  if (typeof authoritativeAuditEnabled === "boolean") {
    const requested = controlsState?.auditEnabled === true;
    statuses.auditEnabled = createControlStatus({
      requested,
      applied: authoritativeAuditEnabled,
      generation: null,
      state:
        requested === authoritativeAuditEnabled
          ? requested
            ? DIAGNOSTIC_CONTROL_STATUS_STATES.active
            : DIAGNOSTIC_CONTROL_STATUS_STATES.inactive
          : DIAGNOSTIC_CONTROL_STATUS_STATES.applying,
      label:
        requested === authoritativeAuditEnabled
          ? requested
            ? "Active"
            : "Off"
          : "Applying",
    });
  }

  statuses.forceWebGLFallbackTest = deriveRendererControlStatus(
    controlsState,
    runtimeSession,
  );
  return statuses;
}
