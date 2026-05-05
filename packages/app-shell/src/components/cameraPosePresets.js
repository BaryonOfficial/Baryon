export const CAMERA_VIEW_PRESETS = Object.freeze({
  topDown: "top-down",
  side: "side",
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
    distance: 9,
  },
  [CAMERA_VIEW_PRESETS.side]: {
    direction: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0]),
    distance: 9,
  },
});

function getCameraPresetDefinition(preset) {
  return (
    CAMERA_PRESET_DEFINITIONS[preset] ??
    CAMERA_PRESET_DEFINITIONS[CAMERA_VIEW_PRESETS.side]
  );
}

function createCanonicalCameraPose(preset) {
  const definition = getCameraPresetDefinition(preset);

  return {
    position: {
      x: definition.direction[0] * definition.distance,
      y: definition.direction[1] * definition.distance,
      z: definition.direction[2] * definition.distance,
    },
    target: {
      x: 0,
      y: 0,
      z: 0,
    },
    up: {
      x: definition.up[0],
      y: definition.up[1],
      z: definition.up[2],
    },
    fov: 65,
  };
}

export function resolvePresetCameraPose(preset) {
  return preset === CAMERA_VIEW_PRESETS.topDown
    ? createCanonicalCameraPose(CAMERA_VIEW_PRESETS.topDown)
    : createCanonicalCameraPose(CAMERA_VIEW_PRESETS.side);
}

export const DEFAULT_IDLE_PERFORMER_CAMERA_POSE = Object.freeze(
  resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side),
);

export const DEFAULT_LIVE_PERFORMER_CAMERA_POSE = Object.freeze(
  resolvePresetCameraPose(CAMERA_VIEW_PRESETS.topDown),
);
