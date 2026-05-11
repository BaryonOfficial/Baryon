const LIVE_INPUT_MODES = new Set(["live", "system"]);
const LIVE_SOURCE_MODES = new Set(["live", "line-feed", "system"]);

export function hasLiveInputStarted(featureFrame) {
  if (typeof featureFrame?.isLiveInputActive === "boolean") {
    return featureFrame.isLiveInputActive;
  }

  const audioInputMode = featureFrame?.debug?.audioInputMode;
  if (LIVE_INPUT_MODES.has(audioInputMode)) {
    return true;
  }

  return LIVE_SOURCE_MODES.has(featureFrame?.sourceMode);
}

export function resolveIdleOverlayVisible(
  runtimeState,
  featureFrame,
  fieldDriven,
) {
  runtimeState.idleLogoSuppressedForLive = hasLiveInputStarted(featureFrame);

  return !fieldDriven && runtimeState.idleLogoSuppressedForLive !== true;
}
