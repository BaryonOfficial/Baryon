import {
  hasActiveSourceTransport,
  hasLiveInputStarted,
} from "./sourceTransportContract.js";

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
