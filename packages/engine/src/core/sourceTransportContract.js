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
  return (
    hasLiveInputStarted(featureFrame) ||
    hasActiveFilePlaybackTransport(featureFrame)
  );
}

export function hasActiveFilePlaybackTransport(featureFrame) {
  const transport = featureFrame?.sourceEvidence?.transport;
  return transport?.playing === true && transport?.liveInputActive !== true;
}
