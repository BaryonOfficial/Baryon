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

export function hasActiveSourceTransport(featureFrame) {
  if (hasLiveInputStarted(featureFrame)) {
    return true;
  }

  if (typeof featureFrame?.sourceEvidence?.transport?.playing === "boolean") {
    return featureFrame.sourceEvidence.transport.playing;
  }

  return false;
}

export function resolveIdleOverlayVisible(
  runtimeState,
  featureFrame,
  fieldDriven,
) {
  runtimeState.idleLogoSuppressedForLive = hasLiveInputStarted(featureFrame);
  runtimeState.idleLogoSuppressedForActiveTransport =
    hasActiveSourceTransport(featureFrame);

  return (
    !fieldDriven &&
    runtimeState.idleLogoSuppressedForActiveTransport !== true
  );
}
