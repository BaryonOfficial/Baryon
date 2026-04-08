import { normalizeCameraViewPreset } from "./cameraViewPresets.js";

export function resolveLiveInputPanelConfig({ liveInputPanel = null } = {}) {
  return {
    forceVisible: Boolean(liveInputPanel?.forceVisible),
    showAction: Boolean(liveInputPanel?.showAction),
    deviceSelectTestId:
      typeof liveInputPanel?.deviceSelectTestId === "string" &&
      liveInputPanel.deviceSelectTestId
        ? liveInputPanel.deviceSelectTestId
        : "live-input-device-select",
  };
}

export function resolveOutputMirrorOverlayState(outputMirrorState = null) {
  if (outputMirrorState?.requested !== true || outputMirrorState.rendering) {
    return null;
  }

  if (!outputMirrorState.supported) {
    return {
      state: "unsupported",
      title: "Mirror unavailable",
      message:
        "Perform requires the authoritative output mirror on this platform and backend.",
    };
  }

  if (outputMirrorState.startupFailed) {
    return {
      state: "startup-failed",
      title: "Performer startup failed",
      message:
        outputMirrorState.failureReason ??
        "The authoritative output stage did not become healthy in time.",
    };
  }

  if (outputMirrorState.recovering) {
    return {
      state: "recovering",
      title: "Mirror recovering",
      message: "Restoring the authoritative output stage and mirror delivery.",
    };
  }

  if (!outputMirrorState.connected || !outputMirrorState.canvasAttached) {
    return {
      state: "connecting",
      title: "Connecting mirror",
      message:
        "Connecting the authoritative output mirror to the desktop window.",
    };
  }

  return {
    state: "connecting",
    title: "Waiting for mirror frames",
    message:
      "The authoritative output stage has not delivered mirror frames yet.",
  };
}

function shouldUseAuthoritativeStageViewState(outputMirrorState = null) {
  return outputMirrorState?.omitLocalScene === true;
}

export function shouldUseAuthoritativePerformanceHud({
  outputMirrorState = null,
  authoritativeStageTelemetry = null,
  authoritativeOutputHudMetrics = null,
} = {}) {
  const authoritativeOutputActive =
    outputMirrorState?.authorityMode === "output-stage-authoritative";
  const hasAuthoritativeHudData =
    authoritativeStageTelemetry?.performanceHudSnapshot != null ||
    authoritativeOutputHudMetrics != null;

  return authoritativeOutputActive && hasAuthoritativeHudData;
}

export function resolveCameraControlFieldState({
  frameFieldState = "idle",
  outputMirrorState = null,
  authoritativeStageStatus = null,
} = {}) {
  if (
    shouldUseAuthoritativeStageViewState(outputMirrorState) &&
    typeof authoritativeStageStatus?.renderedFieldState === "string" &&
    authoritativeStageStatus.renderedFieldState
  ) {
    return authoritativeStageStatus.renderedFieldState;
  }

  return frameFieldState;
}

/**
 * @param {{
 *   outputMirrorState?: {
 *     omitLocalScene?: boolean,
 *   } | null,
 *   authoritativeStageStatus?: {
 *     renderedCameraViewPreset?: "top-down" | "side" | null,
 *   } | null,
 *   fallbackCameraViewPreset?: "top-down" | "side",
 * }} [options]
 */
export function resolveActiveCameraControlPreset({
  outputMirrorState = null,
  authoritativeStageStatus = null,
  fallbackCameraViewPreset,
} = {}) {
  if (!shouldUseAuthoritativeStageViewState(outputMirrorState)) {
    return fallbackCameraViewPreset;
  }

  return (
    normalizeCameraViewPreset(
      authoritativeStageStatus?.renderedCameraViewPreset,
      fallbackCameraViewPreset,
    ) ?? fallbackCameraViewPreset
  );
}

export function composeAuthoritativePerformanceHudMetrics(
  stageMetrics = null,
  outputMetrics = null,
) {
  if (!stageMetrics && !outputMetrics) {
    return null;
  }

  return {
    ...(stageMetrics ?? {}),
    outputTargetFps: outputMetrics?.outputTargetFps ?? null,
    outputFps: outputMetrics?.outputFps ?? null,
    outputPaintFps: outputMetrics?.outputPaintFps ?? null,
    renderCompletedToPaintMs: outputMetrics?.renderCompletedToPaintMs ?? null,
  };
}
