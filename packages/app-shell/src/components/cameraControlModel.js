import {
  CAMERA_VIEW_PRESETS,
  resolveCameraPresetMatchFromPose,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";

/**
 * @typedef {"top-down" | "side"} CameraControlPreset
 */

/**
 * @param {unknown} preset
 * @returns {CameraControlPreset}
 */
export function normalizeCameraControlPreset(preset) {
  return preset === CAMERA_VIEW_PRESETS.topDown
    ? CAMERA_VIEW_PRESETS.topDown
    : CAMERA_VIEW_PRESETS.side;
}

/**
 * @param {unknown} preset
 * @returns {{ cameraPose: ReturnType<typeof resolvePresetCameraPose> }}
 */
export function createCameraPresetCommand(preset) {
  return {
    cameraPose: resolvePresetCameraPose(normalizeCameraControlPreset(preset)),
  };
}

/**
 * @param {ReturnType<typeof resolvePresetCameraPose> | null | undefined} appliedCameraPose
 * @param {CameraControlPreset} [fallbackPreset]
 * @returns {{ cameraPose: ReturnType<typeof resolvePresetCameraPose> }}
 */
export function createCameraResetCommand(
  appliedCameraPose,
  fallbackPreset = CAMERA_VIEW_PRESETS.topDown,
) {
  return {
    cameraPose:
      appliedCameraPose ??
      resolvePresetCameraPose(normalizeCameraControlPreset(fallbackPreset)),
  };
}

/**
 * @param {{
 *   available?: boolean,
 *   appliedCameraPose?: any,
 *   fallbackPreset?: CameraControlPreset,
 * }} [options]
 * @returns {{ visible: boolean, activePreset: CameraControlPreset | null }}
 */
export function deriveCameraControlState({
  available = false,
  appliedCameraPose = null,
  fallbackPreset = CAMERA_VIEW_PRESETS.topDown,
} = {}) {
  if (!available) {
    return {
      visible: false,
      activePreset: null,
    };
  }

  return {
    visible: true,
    activePreset:
      resolveCameraPresetMatchFromPose(appliedCameraPose) ??
      (appliedCameraPose ? null : normalizeCameraControlPreset(fallbackPreset)),
  };
}
