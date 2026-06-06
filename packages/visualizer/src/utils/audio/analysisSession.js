import {
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "../../core/audio/inputDeviceSemantics.js";

export function buildAnalysisSessionKey(status) {
  const liveInputDeviceKind = normalizeLiveInputDeviceKind(
    status?.liveInputDeviceKind ?? status?.liveInputKind,
  );
  const inputMode = status?.isLiveInputActive
    ? isLoopbackLiveInputDeviceKind(liveInputDeviceKind)
      ? "system"
      : "live"
    : status?.isPlaying
      ? "file"
      : (status?.audioInputMode ?? "idle");

  if (inputMode === "file") {
    return `file:${status?.playbackSessionId ?? "none"}`;
  }

  if (inputMode === "live") {
    return "live";
  }

  if (inputMode === "system") {
    return "system";
  }

  return "idle";
}
