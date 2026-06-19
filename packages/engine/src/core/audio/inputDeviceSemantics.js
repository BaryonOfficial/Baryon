/**
 * Shared live-input device semantics used across the web and desktop apps.
 *
 * Important: the persisted/runtime values remain `"live"` and `"system"` for
 * compatibility, but those strings mean:
 * - `"live"`: an acoustic microphone style input
 * - `"system"`: a loopback / virtual / line-feed style input device
 *
 * `"system"` in Baryon is a device-classification term, not a privileged OS
 * capture API. BlackHole-style devices are represented as `"system"` even when
 * they are selected through `getUserMedia(...)`.
 */

export const LIVE_INPUT_DEVICE_KINDS = Object.freeze({
  acousticMic: "live",
  loopback: "system",
});

/**
 * @typedef {"live" | "system"} LiveInputDeviceKind
 */

/**
 * @param {unknown} value
 * @returns {LiveInputDeviceKind}
 */
export function normalizeLiveInputDeviceKind(value) {
  return value === LIVE_INPUT_DEVICE_KINDS.loopback
    ? LIVE_INPUT_DEVICE_KINDS.loopback
    : LIVE_INPUT_DEVICE_KINDS.acousticMic;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLoopbackLiveInputDeviceKind(value) {
  return (
    normalizeLiveInputDeviceKind(value) === LIVE_INPUT_DEVICE_KINDS.loopback
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAcousticLiveInputDeviceKind(value) {
  return (
    normalizeLiveInputDeviceKind(value) === LIVE_INPUT_DEVICE_KINDS.acousticMic
  );
}

/**
 * @param {unknown} value
 * @returns {"Loopback" | "Acoustic Mic"}
 */
export function getLiveInputDeviceKindLabel(value) {
  return isLoopbackLiveInputDeviceKind(value) ? "Loopback" : "Acoustic Mic";
}
