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

export function resolvePreviewOverlayState(previewState = null) {
  if (previewState?.requested !== true || previewState.rendering) {
    return null;
  }

  if (!previewState.supported) {
    return {
      state: "unsupported",
      title: "Preview unavailable",
      message:
        "Perform requires the authoritative preview path on this platform and backend.",
    };
  }

  if (previewState.startupFailed) {
    return {
      state: "startup-failed",
      title: "Performer startup failed",
      message:
        previewState.failureReason ??
        "The authoritative output stage did not become healthy in time.",
    };
  }

  if (previewState.recovering) {
    return {
      state: "recovering",
      title: "Preview recovering",
      message: "Restoring the authoritative output stage and preview delivery.",
    };
  }

  if (!previewState.connected || !previewState.canvasAttached) {
    return {
      state: "connecting",
      title: "Connecting preview",
      message:
        "Connecting the authoritative performer preview to the desktop window.",
    };
  }

  return {
    state: "connecting",
    title: "Waiting for preview frames",
    message:
      "The authoritative output stage has not delivered preview frames yet.",
  };
}

function shouldUseAuthoritativeStageViewState(previewState = null) {
  return previewState?.omitLocalScene === true;
}

export function shouldUseAuthoritativePerformanceHud({
  previewState = null,
  authoritativeStageTelemetry = null,
  authoritativeOutputHudMetrics = null,
} = {}) {
  const authoritativeOutputActive =
    previewState?.authorityMode === "output-stage-authoritative";
  const hasAuthoritativeHudData =
    authoritativeStageTelemetry?.performanceHudSnapshot != null ||
    authoritativeOutputHudMetrics != null;

  return authoritativeOutputActive && hasAuthoritativeHudData;
}

export function resolveCameraControlFieldState({
  frameFieldState = "idle",
  previewState = null,
  authoritativeStageStatus = null,
} = {}) {
  if (
    shouldUseAuthoritativeStageViewState(previewState) &&
    typeof authoritativeStageStatus?.renderedFieldState === "string" &&
    authoritativeStageStatus.renderedFieldState
  ) {
    return authoritativeStageStatus.renderedFieldState;
  }

  return frameFieldState;
}

/**
 * @param {{
 *   previewState?: {
 *     omitLocalScene?: boolean,
 *   } | null,
 *   authoritativeStageStatus?: {
 *     renderedCameraViewPreset?: "top-down" | "side" | null,
 *   } | null,
 *   fallbackCameraViewPreset?: "top-down" | "side",
 * }} [options]
 */
export function resolveActiveCameraControlPreset({
  previewState = null,
  authoritativeStageStatus = null,
  fallbackCameraViewPreset,
} = {}) {
  if (!shouldUseAuthoritativeStageViewState(previewState)) {
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
