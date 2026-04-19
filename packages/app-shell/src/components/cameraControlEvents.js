import { resolvePresetCameraPose } from "./cameraPosePresets.js";

export const CAMERA_CONTROL_COMMAND_EVENT = "__baryon-camera-command";

export function createCameraControlCommand(command = {}) {
  if (command?.cameraPose && typeof command.cameraPose === "object") {
    return {
      cameraPose: command.cameraPose,
    };
  }

  if (
    command?.cameraViewPreset === "top-down" ||
    command?.cameraViewPreset === "side"
  ) {
    return {
      cameraPose: resolvePresetCameraPose(command.cameraViewPreset),
    };
  }

  return null;
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
