export const CAMERA_VIEW_PRESETS = Object.freeze({
  topDown: "top-down",
  side: "side",
});

export const CAMERA_DISTANCE_LIMITS = Object.freeze({
  min: 0.1,
  max: 99,
});

function normalizeDirection([x, y, z]) {
  const length = Math.hypot(x, y, z);
  return /** @type {[number, number, number]} */ ([
    x / length,
    y / length,
    z / length,
  ]);
}

const CAMERA_PRESET_DEFINITIONS = Object.freeze({
  [CAMERA_VIEW_PRESETS.topDown]: {
    direction: Object.freeze(normalizeDirection([0, 9, 0.001])),
    up: Object.freeze([0, 0, -1]),
    defaultDistance: 9,
  },
  [CAMERA_VIEW_PRESETS.side]: {
    direction: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0]),
    defaultDistance: 9,
  },
});

function getCameraPresetDefinition(preset) {
  return (
    CAMERA_PRESET_DEFINITIONS[preset] ??
    CAMERA_PRESET_DEFINITIONS[CAMERA_VIEW_PRESETS.side]
  );
}

/**
 * @param {number | null | undefined} distance
 * @returns {number}
 */
export function clampCameraDistance(distance) {
  if (!Number.isFinite(distance)) {
    return NaN;
  }

  return Math.min(
    CAMERA_DISTANCE_LIMITS.max,
    Math.max(CAMERA_DISTANCE_LIMITS.min, distance),
  );
}

/**
 * @param {string | null | undefined} preset
 * @param {string | null} [fallback]
 * @returns {string | null}
 */
export function normalizeCameraViewPreset(preset, fallback = null) {
  return preset === CAMERA_VIEW_PRESETS.topDown ||
    preset === CAMERA_VIEW_PRESETS.side
    ? preset
    : fallback;
}

/**
 * Explicit camera distance overrides are clamped into range. Missing or
 * non-finite values stay unset so callers can preserve current state or fall
 * back to a preset default.
 *
 * @param {number | null | undefined} distance
 * @returns {number | null}
 */
export function normalizeCameraDistanceOverride(distance) {
  const clampedDistance = clampCameraDistance(distance);
  return Number.isFinite(clampedDistance) ? clampedDistance : null;
}

/**
 * @param {string} preset
 * @returns {number}
 */
export function getDefaultCameraDistanceForPreset(preset) {
  return getCameraPresetDefinition(preset).defaultDistance;
}

/**
 * @param {string} preset
 * @param {number | null | undefined} distanceOverride
 * @returns {number}
 */
export function resolveCameraDistanceOverride(preset, distanceOverride) {
  return (
    normalizeCameraDistanceOverride(distanceOverride) ??
    getDefaultCameraDistanceForPreset(preset)
  );
}

/**
 * @param {string} preset
 * @param {number | null | undefined} [distanceOverride]
 * @returns {{ position: [number, number, number], up: [number, number, number] }}
 */
export function getCameraConfigForPreset(preset, distanceOverride = null) {
  const definition = getCameraPresetDefinition(preset);
  const distance = resolveCameraDistanceOverride(preset, distanceOverride);

  return {
    position: /** @type {[number, number, number]} */ ([
      definition.direction[0] * distance,
      definition.direction[1] * distance,
      definition.direction[2] * distance,
    ]),
    up: /** @type {[number, number, number]} */ ([...definition.up]),
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

export function applyCameraViewPreset(
  camera,
  controls,
  preset,
  distanceOverride = null,
) {
  const { position, up } = getCameraConfigForPreset(preset, distanceOverride);

  camera.position.set(...position);
  camera.up.set(...up);

  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  } else {
    camera.lookAt(0, 0, 0);
  }
  camera.updateProjectionMatrix();
}
