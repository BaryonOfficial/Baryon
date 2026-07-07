import { getDefaultAudioSession } from "@baryon/engine/audio";

/**
 * Boundary for recording features that need the app's audible audio.
 * The engine owns the audio graph; this module only exposes the capture tap
 * and the status facts a recorder needs to pick an audio mode.
 */

/**
 * @returns {{ stream: MediaStream, stop: () => void } | null}
 */
export function createPlaybackAudioCaptureStream() {
  return getDefaultAudioSession().createCaptureStream();
}

/**
 * @returns {{ isLiveInputActive: boolean, hasPlaybackAudio: boolean }}
 */
export function readPlaybackAudioCaptureStatus() {
  const status = getDefaultAudioSession().getStatus();
  return {
    // Live input is analysis-only room audio; it is never app-audible and
    // cannot be legally treated as app-owned recording audio.
    isLiveInputActive: status.isLiveInputActive === true,
    hasPlaybackAudio: status.isPlaying === true,
  };
}
