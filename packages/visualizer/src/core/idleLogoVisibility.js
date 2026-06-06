export function hasLiveInputStarted(featureFrame) {
  if (typeof featureFrame?.isLiveInputActive === "boolean") {
    return featureFrame.isLiveInputActive;
  }

  if (
    typeof featureFrame?.sourceEvidence?.transport?.liveInputActive ===
    "boolean"
  ) {
    return featureFrame.sourceEvidence.transport.liveInputActive;
  }

  return false;
}

export function resolveIdleOverlayVisible(
  runtimeState,
  featureFrame,
  fieldDriven,
) {
  runtimeState.idleLogoSuppressedForLive = hasLiveInputStarted(featureFrame);

  return !fieldDriven && runtimeState.idleLogoSuppressedForLive !== true;
}
