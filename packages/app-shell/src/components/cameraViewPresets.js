export const CAMERA_VIEW_PRESETS = Object.freeze({
  topDown: "top-down",
  side: "side",
});

/**
 * @param {string} preset
 * @returns {{ position: [number, number, number], up: [number, number, number] }}
 */
export function getCameraConfigForPreset(preset) {
  if (preset === CAMERA_VIEW_PRESETS.topDown) {
    return {
      position: [0, 9, 0.001],
      up: [0, 0, -1],
    };
  }

  return {
    position: [0, 0, 9],
    up: [0, 1, 0],
  };
}

export function resolveDefaultCameraViewPreset({
  liveInputUiState = "idle",
  fieldState = null,
} = {}) {
  if (fieldState === "idle") {
    return CAMERA_VIEW_PRESETS.side;
  }

  if (fieldState && fieldState !== "idle") {
    return CAMERA_VIEW_PRESETS.topDown;
  }

  return liveInputUiState === "idle"
    ? CAMERA_VIEW_PRESETS.side
    : CAMERA_VIEW_PRESETS.topDown;
}

export function applyCameraViewPreset(camera, controls, preset) {
  const { position, up } = getCameraConfigForPreset(preset);

  camera.position.set(...position);
  camera.up.set(...up);

  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  } else {
    camera.lookAt(0, 0, 0);
  }

  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
