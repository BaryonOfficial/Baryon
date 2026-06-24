export const CAMERA_VIEW_PRESETS = Object.freeze({
  topDown: "top-down",
  side: "side",
});

function normalizeDirection([x, y, z]) {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= 0) {
    return /** @type {[number, number, number]} */ ([0, 0, 1]);
  }
  return /** @type {[number, number, number]} */ ([
    x / length,
    y / length,
    z / length,
  ]);
}

const CAMERA_PRESET_DEFINITIONS = Object.freeze({
  [CAMERA_VIEW_PRESETS.topDown]: {
    direction: Object.freeze([0, 1, 0]),
    up: Object.freeze([0, 0, -1]),
    distance: 9,
  },
  [CAMERA_VIEW_PRESETS.side]: {
    direction: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0]),
    distance: 9,
  },
});

export const DEFAULT_ACTIVE_CAMERA_POSE = Object.freeze({
  position: Object.freeze({
    x: 5,
    y: 5,
    z: 5,
  }),
  target: Object.freeze({
    x: 0,
    y: 0,
    z: 0,
  }),
  up: Object.freeze({
    x: 0,
    y: 1,
    z: 0,
  }),
  fov: 65,
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

/**
 * @param {unknown} preset
 * @returns {"top-down" | "side"}
 */
function normalizePreset(preset) {
  return preset === CAMERA_VIEW_PRESETS.topDown
    ? CAMERA_VIEW_PRESETS.topDown
    : CAMERA_VIEW_PRESETS.side;
}

function vectorFromPose(value, fallback) {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    return fallback;
  }

  return /** @type {[number, number, number]} */ ([
    Number(value.x),
    Number(value.y),
    Number(value.z),
  ]);
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function measurePoseAgainstPreset(cameraPose, preset) {
  const canonicalPose = resolvePresetCameraPose(preset);
  const position = vectorFromPose(cameraPose?.position, [
    canonicalPose.position.x,
    canonicalPose.position.y,
    canonicalPose.position.z,
  ]);
  const target = vectorFromPose(cameraPose?.target, [
    canonicalPose.target.x,
    canonicalPose.target.y,
    canonicalPose.target.z,
  ]);
  const up = normalizeDirection(
    vectorFromPose(cameraPose?.up, [
      canonicalPose.up.x,
      canonicalPose.up.y,
      canonicalPose.up.z,
    ]),
  );
  const canonicalDirection = normalizeDirection([
    canonicalPose.position.x - canonicalPose.target.x,
    canonicalPose.position.y - canonicalPose.target.y,
    canonicalPose.position.z - canonicalPose.target.z,
  ]);
  const poseDirection = normalizeDirection([
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  ]);
  const canonicalUp = normalizeDirection([
    canonicalPose.up.x,
    canonicalPose.up.y,
    canonicalPose.up.z,
  ]);

  return {
    directionDot: dot3(poseDirection, canonicalDirection),
    upDot: dot3(up, canonicalUp),
  };
}

function scorePoseAgainstPreset(cameraPose, preset) {
  const alignment = measurePoseAgainstPreset(cameraPose, preset);
  return alignment.directionDot + alignment.upDot;
}

/**
 * @param {any} cameraPose
 * @param {"top-down" | "side"} [fallbackPreset]
 * @returns {"top-down" | "side"}
 */
export function resolveCameraPresetFromPose(
  cameraPose,
  fallbackPreset = CAMERA_VIEW_PRESETS.side,
) {
  if (!cameraPose || typeof cameraPose !== "object") {
    return normalizePreset(fallbackPreset);
  }

  const topDownScore = scorePoseAgainstPreset(
    cameraPose,
    CAMERA_VIEW_PRESETS.topDown,
  );
  const sideScore = scorePoseAgainstPreset(
    cameraPose,
    CAMERA_VIEW_PRESETS.side,
  );

  return topDownScore > sideScore
    ? CAMERA_VIEW_PRESETS.topDown
    : CAMERA_VIEW_PRESETS.side;
}

const CAMERA_PRESET_MATCH_DOT_THRESHOLD = 0.995;

/**
 * @param {any} cameraPose
 * @returns {"top-down" | "side" | null}
 */
export function resolveCameraPresetMatchFromPose(cameraPose) {
  if (!cameraPose || typeof cameraPose !== "object") {
    return null;
  }

  for (const preset of [
    CAMERA_VIEW_PRESETS.topDown,
    CAMERA_VIEW_PRESETS.side,
  ]) {
    const alignment = measurePoseAgainstPreset(cameraPose, preset);
    if (
      alignment.directionDot >= CAMERA_PRESET_MATCH_DOT_THRESHOLD &&
      alignment.upDot >= CAMERA_PRESET_MATCH_DOT_THRESHOLD
    ) {
      return preset;
    }
  }

  return null;
}

export const DEFAULT_IDLE_PERFORMER_CAMERA_POSE = Object.freeze(
  resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side),
);

export const DEFAULT_LIVE_PERFORMER_CAMERA_POSE = DEFAULT_ACTIVE_CAMERA_POSE;
