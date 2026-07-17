import {
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "../../core/audio/inputDeviceSemantics.js";

export function buildAnalysisSessionKey(status) {
  const liveInputDeviceKind = normalizeLiveInputDeviceKind(
    status?.liveInputDeviceKind ?? status?.liveInputKind,
  );
  const hasLoadedFileSource =
    status?.playbackSourceSessionId != null ||
    status?.isPlaying === true ||
    status?.isPlaybackPaused === true ||
    status?.isAudioLoaded === true;
  const inputMode = status?.isLiveInputActive
    ? isLoopbackLiveInputDeviceKind(liveInputDeviceKind)
      ? "system"
      : "live"
    : hasLoadedFileSource
      ? "file"
      : status?.audioInputMode === "file"
        ? "idle"
        : (status?.audioInputMode ?? "idle");

  if (inputMode === "file") {
    return `file:${
      status?.playbackSourceSessionId ?? status?.playbackSessionId ?? "none"
    }`;
  }

  if (inputMode === "live") {
    return `live:${status?.liveInputSessionId ?? "none"}`;
  }

  if (inputMode === "system") {
    return `system:${status?.liveInputSessionId ?? "none"}`;
  }

  return "idle";
}
