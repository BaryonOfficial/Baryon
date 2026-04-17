import {
  getDefaultCameraDistanceForPreset,
  normalizeCameraDistanceOverride,
  normalizeCameraViewPreset,
} from "./cameraViewPresets.js";

export const CAMERA_CONTROL_COMMAND_EVENT = "__baryon-camera-command";

export function createCameraControlCommand(command = {}) {
  const cameraViewPreset = normalizeCameraViewPreset(
    command?.cameraViewPreset,
    null,
  );
  if (!cameraViewPreset) {
    return null;
  }

  return {
    cameraViewPreset,
    cameraDistance:
      normalizeCameraDistanceOverride(
        command?.cameraDistance ??
          getDefaultCameraDistanceForPreset(cameraViewPreset),
      ) ?? getDefaultCameraDistanceForPreset(cameraViewPreset),
  };
}

export function dispatchCameraControlCommand(command = {}) {
  if (typeof window === "undefined") {
    return null;
  }

  const detail = createCameraControlCommand(command);
  if (!detail) {
    return null;
  }

  window.dispatchEvent(
    new CustomEvent(CAMERA_CONTROL_COMMAND_EVENT, {
      detail,
    }),
  );
  return detail;
}
