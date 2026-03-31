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

export function resolveSharedPreviewOverlayState(sharedPreviewMode = null) {
  if (sharedPreviewMode?.requested !== true || sharedPreviewMode.rendering) {
    return null;
  }

  if (!sharedPreviewMode.supported) {
    return {
      state: "unsupported",
      title: "Preview unavailable",
      message:
        "Shared preview is not supported for this presented performer output.",
    };
  }

  if (!sharedPreviewMode.connected || !sharedPreviewMode.canvasAttached) {
    return {
      state: "attaching",
      title: "Attaching preview",
      message: "Connecting the shared preview surface to the desktop window.",
    };
  }

  if (sharedPreviewMode.stale) {
    return {
      state: "stale",
      title: "Preview recovering",
      message: "Waiting for fresh frames from the hidden output stage.",
    };
  }

  return {
    state: "waiting",
    title: "Waiting for frames",
    message: "The hidden output stage has not delivered preview frames yet.",
  };
}

function shouldUseAuthoritativeStageViewState(sharedPreviewMode = null) {
  return sharedPreviewMode?.omitLocalScene === true;
}

export function resolveCameraControlFieldState({
  frameFieldState = "idle",
  sharedPreviewMode = null,
  authoritativeStageStatus = null,
} = {}) {
  if (
    shouldUseAuthoritativeStageViewState(sharedPreviewMode) &&
    typeof authoritativeStageStatus?.renderedFieldState === "string" &&
    authoritativeStageStatus.renderedFieldState
  ) {
    return authoritativeStageStatus.renderedFieldState;
  }

  return frameFieldState;
}

/**
 * @param {{
 *   sharedPreviewMode?: {
 *     omitLocalScene?: boolean,
 *   } | null,
 *   authoritativeStageStatus?: {
 *     renderedCameraViewPreset?: "top-down" | "side" | null,
 *   } | null,
 *   fallbackCameraViewPreset?: "top-down" | "side",
 * }} [options]
 */
export function resolveActiveCameraControlPreset({
  sharedPreviewMode = null,
  authoritativeStageStatus = null,
  fallbackCameraViewPreset,
} = {}) {
  if (!shouldUseAuthoritativeStageViewState(sharedPreviewMode)) {
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
