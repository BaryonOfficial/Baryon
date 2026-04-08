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
        "The output mirror is not supported for this presented performer output.",
    };
  }

  if (!outputMirrorState.connected || !outputMirrorState.canvasAttached) {
    return {
      state: "attaching",
      title: "Attaching mirror",
      message: "Connecting the output mirror surface to the desktop window.",
    };
  }

  if (outputMirrorState.stale) {
    return {
      state: "stale",
      title: "Mirror recovering",
      message: "Waiting for fresh frames from the hidden output stage.",
    };
  }

  return {
    state: "waiting",
    title: "Waiting for frames",
    message: "The hidden output stage has not delivered mirror frames yet.",
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
    outputMirrorState?.authorityMode === "performer-output-authoritative";
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
