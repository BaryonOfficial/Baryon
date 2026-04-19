import { resolveCameraViewState } from "./cameraViewPresets.js";

export const CAMERA_CONTROL_COMMAND_EVENT = "__baryon-camera-command";

export function createCameraControlCommand(command = {}) {
  return resolveCameraViewState(command);
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
