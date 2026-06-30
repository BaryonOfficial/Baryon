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

const SHARED_TEXTURE_PREVIEW_DISABLED_REASON =
  "Preview shared-texture transfer is disabled while native output is active.";

export function resolvePreviewOverlayState(previewState = null) {
  if (previewState?.requested !== true || previewState.rendering) {
    return null;
  }

  if (!previewState.supported) {
    const reason = previewState.failureReason ?? previewState.lastError ?? null;
    if (reason === SHARED_TEXTURE_PREVIEW_DISABLED_REASON) {
      return {
        state: "preview-mirror-disabled",
        title: "In-app preview disabled",
        message:
          "Native output is publishing directly. The app mirror is disabled to keep the output path stable.",
      };
    }

    return {
      state: "unsupported",
      title: "Preview unavailable",
      message:
        reason ??
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
  const visualOutputActive = previewState?.programOutputActive === true;
  const hasAuthoritativeHudData =
    authoritativeStageTelemetry?.performanceHudSnapshot != null ||
    authoritativeOutputHudMetrics != null;

  return (
    authoritativeOutputActive && visualOutputActive && hasAuthoritativeHudData
  );
}

export function resolveCameraControlFieldState({
  frameFieldState = "idle",
  previewState = null,
  authoritativeStageStatus = null,
} = {}) {
  if (
    shouldUseAuthoritativeStageViewState(previewState) &&
    typeof authoritativeStageStatus?.lastRenderedFieldState === "string" &&
    authoritativeStageStatus.lastRenderedFieldState
  ) {
    return authoritativeStageStatus.lastRenderedFieldState;
  }

  return frameFieldState;
}

export function composeAuthoritativePerformanceHudMetrics(
  stageMetrics = null,
  outputMetrics = null,
) {
  if (!stageMetrics && !outputMetrics) {
    return null;
  }

  const requiredOutputMetricFields = [
    "outputTargetFps",
    "outputFps",
    "outputPaintFps",
    "renderCompletedToPaintMs",
  ];
  const optionalOutputMetricFields = [
    "lastInvalidateToPaintMs",
    "stageRenderLeadMs",
    "stageRenderCoalescedRequestCount",
    "outputPublishAttemptCount",
    "outputDeferredPublishCount",
    "outputCoalescedPublishCount",
    "outputDiscardedPendingPublishCount",
    "outputDiscardedPublishResultCount",
    "outputSuccessfulPublishCount",
    "outputDroppedPublishCount",
    "outputFailedPublishCount",
    "outputPaintWithoutPublishCount",
    "outputConsecutivePaintWithoutPublishCount",
    "outputLastPublishDropReason",
    "outputLastPublishDurationMs",
    "outputAveragePublishDurationMs",
  ];
  const outputMetricFields = [
    ...requiredOutputMetricFields,
    ...optionalOutputMetricFields,
  ];
  const hasOutputMetrics =
    outputMetrics &&
    outputMetricFields.some((field) => outputMetrics[field] != null);
  if (!hasOutputMetrics) {
    return stageMetrics ? { ...stageMetrics } : null;
  }

  const composedMetrics = { ...(stageMetrics ?? {}) };
  for (const field of requiredOutputMetricFields) {
    composedMetrics[field] = outputMetrics[field] ?? null;
  }
  for (const field of optionalOutputMetricFields) {
    if (outputMetrics[field] != null) {
      composedMetrics[field] = outputMetrics[field];
    }
  }
  return composedMetrics;
}
