import { normalizeCameraIntent } from "./cameraPolicy.js";
import { createCameraPresetCommand } from "./cameraControlModel.js";
import { normalizeCameraOrbitCommand } from "./cameraOrbitModel.js";

export const CAMERA_CONTROL_COMMAND_EVENT = "__baryon-camera-command";

export function createCameraControlCommand(command = {}) {
  if (command?.cameraReset === true) {
    return { cameraReset: true };
  }
  const cameraOrbit = normalizeCameraOrbitCommand(command?.cameraOrbit);
  if (cameraOrbit) {
    return { cameraOrbit };
  }

  if (command?.cameraPose && typeof command.cameraPose === "object") {
    return {
      cameraPose: command.cameraPose,
    };
  }

  if (
    command?.cameraViewPreset === "top-down" ||
    command?.cameraViewPreset === "side"
  ) {
    return createCameraPresetCommand(command.cameraViewPreset);
  }

  return null;
}

export function dispatchCameraControlCommand(command = {}) {
  if (typeof window === "undefined") {
    return null;
  }

  // Public automation events retain their pose/reset contract. Translate the
  // canonical model intent here, without keeping those flags in camera state.
  const intent = normalizeCameraIntent(command?.cameraIntent);
  const detail = createCameraControlCommand(
    intent
      ? intent.mode === "automatic"
        ? { cameraReset: true }
        : { cameraPose: intent.pose }
      : command,
  );
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
