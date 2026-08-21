export const CAMERA_ORBIT_AXES = Object.freeze({
  azimuth: "azimuth",
  elevation: "elevation",
  distance: "distance",
});

export const CAMERA_ORBIT_RANGES = Object.freeze({
  [CAMERA_ORBIT_AXES.azimuth]: Object.freeze({ min: -180, max: 180 }),
  [CAMERA_ORBIT_AXES.elevation]: Object.freeze({ min: -85, max: 85 }),
  [CAMERA_ORBIT_AXES.distance]: Object.freeze({ min: 2, max: 32 }),
});

const CAMERA_ORBIT_AXIS_SET = new Set(Object.values(CAMERA_ORBIT_AXES));
const RADIANS_TO_DEGREES = 180 / Math.PI;
const DEGREES_TO_RADIANS = Math.PI / 180;
const MIN_CAMERA_DISTANCE = 1e-6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readVector(vector, fallback) {
  return {
    x: Number.isFinite(vector?.x) ? Number(vector.x) : fallback.x,
    y: Number.isFinite(vector?.y) ? Number(vector.y) : fallback.y,
    z: Number.isFinite(vector?.z) ? Number(vector.z) : fallback.z,
  };
}

function wrapDegrees(value) {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

function shortestAngleDeltaDegrees(start, end) {
  return wrapDegrees(end - start);
}

function interpolateNumber(start, end, amount) {
  return start + (end - start) * amount;
}

export function isCameraOrbitAxis(value) {
  return CAMERA_ORBIT_AXIS_SET.has(value);
}

export function normalizeCameraOrbitAxisValue(axis, value) {
  if (!isCameraOrbitAxis(axis) || !Number.isFinite(Number(value))) {
    return null;
  }
  const range = CAMERA_ORBIT_RANGES[axis];
  const numericValue = Number(value);
  return clamp(numericValue, range.min, range.max);
}

export function normalizeCameraOrbitCommand(cameraOrbit) {
  const value = normalizeCameraOrbitAxisValue(
    cameraOrbit?.axis,
    cameraOrbit?.value,
  );
  if (value == null) {
    return null;
  }
  return {
    axis: cameraOrbit.axis,
    value,
    transport:
      cameraOrbit.transport === "midi" || cameraOrbit.transport === "osc"
        ? cameraOrbit.transport
        : null,
  };
}

export function readCameraOrbitState(cameraPose) {
  const target = readVector(cameraPose?.target, { x: 0, y: 0, z: 0 });
  const position = readVector(cameraPose?.position, { x: 0, y: 0, z: 1 });
  const offset = {
    x: position.x - target.x,
    y: position.y - target.y,
    z: position.z - target.z,
  };
  const distance = Math.max(
    MIN_CAMERA_DISTANCE,
    Math.hypot(offset.x, offset.y, offset.z),
  );
  return {
    azimuth: Math.atan2(offset.x, offset.z) * RADIANS_TO_DEGREES,
    elevation:
      Math.asin(clamp(offset.y / distance, -1, 1)) * RADIANS_TO_DEGREES,
    distance,
  };
}

function createCameraPoseFromOrbit(cameraPose, orbit) {
  const target = readVector(cameraPose?.target, { x: 0, y: 0, z: 0 });
  const up = readVector(cameraPose?.up, { x: 0, y: 1, z: 0 });
  const azimuthRadians = orbit.azimuth * DEGREES_TO_RADIANS;
  const elevationRadians = orbit.elevation * DEGREES_TO_RADIANS;
  const horizontalDistance = orbit.distance * Math.cos(elevationRadians);
  return {
    position: {
      x: target.x + horizontalDistance * Math.sin(azimuthRadians),
      y: target.y + orbit.distance * Math.sin(elevationRadians),
      z: target.z + horizontalDistance * Math.cos(azimuthRadians),
    },
    target,
    up,
    fov: Number.isFinite(cameraPose?.fov) ? Number(cameraPose.fov) : 65,
  };
}

export function applyCameraOrbitAxisValue(cameraPose, axis, value) {
  const normalizedValue = normalizeCameraOrbitAxisValue(axis, value);
  if (normalizedValue == null || !cameraPose) {
    return null;
  }
  const orbit = readCameraOrbitState(cameraPose);
  return createCameraPoseFromOrbit(cameraPose, {
    ...orbit,
    [axis]: normalizedValue,
  });
}

export function interpolateCameraOrbitPose(startPose, endPose, amount) {
  if (!startPose || !endPose) {
    return null;
  }
  const boundedAmount = clamp(Number(amount), 0, 1);
  const startOrbit = readCameraOrbitState(startPose);
  const endOrbit = readCameraOrbitState(endPose);
  const startTarget = readVector(startPose.target, { x: 0, y: 0, z: 0 });
  const endTarget = readVector(endPose.target, startTarget);
  const startUp = readVector(startPose.up, { x: 0, y: 1, z: 0 });
  const endUp = readVector(endPose.up, startUp);
  return createCameraPoseFromOrbit(
    {
      target: {
        x: interpolateNumber(startTarget.x, endTarget.x, boundedAmount),
        y: interpolateNumber(startTarget.y, endTarget.y, boundedAmount),
        z: interpolateNumber(startTarget.z, endTarget.z, boundedAmount),
      },
      up: {
        x: interpolateNumber(startUp.x, endUp.x, boundedAmount),
        y: interpolateNumber(startUp.y, endUp.y, boundedAmount),
        z: interpolateNumber(startUp.z, endUp.z, boundedAmount),
      },
      fov: interpolateNumber(
        Number(startPose.fov ?? 65),
        Number(endPose.fov ?? 65),
        boundedAmount,
      ),
    },
    {
      azimuth:
        startOrbit.azimuth +
        shortestAngleDeltaDegrees(startOrbit.azimuth, endOrbit.azimuth) *
          boundedAmount,
      elevation: interpolateNumber(
        startOrbit.elevation,
        endOrbit.elevation,
        boundedAmount,
      ),
      distance: interpolateNumber(
        startOrbit.distance,
        endOrbit.distance,
        boundedAmount,
      ),
    },
  );
}
