import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_CAMERA_POSE,
  scaleCameraPoseDistance,
} from "./cameraPosePresets.js";

/** @typedef {import("./cameraPosePresets.js").CameraPose} CameraPose
 * @typedef {{mode: "automatic"} | {mode: "explicit", pose: CameraPose}} CameraIntent */

export const AUTOMATIC_CAMERA_INTENT = Object.freeze({ mode: "automatic" });

/** @param {any} value @returns {CameraIntent | null} */
export function normalizeCameraIntent(value) {
  if (value?.mode === "automatic") return AUTOMATIC_CAMERA_INTENT;
  if (value?.mode !== "explicit") return null;
  const pose = value.pose;
  if (!Number.isFinite(pose?.fov)) return null;
  /** @type {Record<string, {x: number, y: number, z: number}>} */
  const vectors = {};
  for (const key of ["position", "target", "up"]) {
    const vector = pose?.[key];
    if (![vector?.x, vector?.y, vector?.z].every(Number.isFinite)) return null;
    vectors[key] = Object.freeze({ x: vector.x, y: vector.y, z: vector.z });
  }
  return Object.freeze({
    mode: "explicit",
    pose: Object.freeze({
      position: vectors.position,
      target: vectors.target,
      up: vectors.up,
      fov: pose.fov,
    }),
  });
}

// A surface-independent intent owner. Readouts and applied-pose feedback only
// read it; accepted user commands and the active surface's Stop/Reset write it.
export function createCameraIntentStore() {
  /** @type {{intent: CameraIntent, resetNonce: number}} */
  let snapshot = Object.freeze({
    intent: AUTOMATIC_CAMERA_INTENT,
    resetNonce: 0,
  });
  let intentKey = JSON.stringify(snapshot.intent);
  const listeners = new Set();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setIntent(value, { reapply = false } = {}) {
      const intent = normalizeCameraIntent(value);
      if (!intent) return false;
      const key = JSON.stringify(intent);
      if (key === intentKey && !reapply) return false;
      intentKey = key;
      snapshot = Object.freeze({
        intent,
        resetNonce: snapshot.resetNonce + (reapply ? 1 : 0),
      });
      for (const listener of listeners) listener();
      return true;
    },
  });
}

/** @param {boolean} active @param {import("./cameraPosePresets.js").CameraPose} activePose */
export function resolveDefaultCameraPose(
  active,
  activePose = DEFAULT_ACTIVE_CAMERA_POSE,
) {
  return active ? activePose : DEFAULT_IDLE_CAMERA_POSE;
}

/** @param {{intent: CameraIntent, active: boolean}} state
 * @param {{activePose?: import("./cameraPosePresets.js").CameraPose, distanceScale?: number}} options */
export function resolveCameraPolicyPose(
  { intent, active },
  { activePose = DEFAULT_ACTIVE_CAMERA_POSE, distanceScale = 1 } = {},
) {
  return intent.mode === "explicit"
    ? intent.pose
    : scaleCameraPoseDistance(
        resolveDefaultCameraPose(active, activePose),
        distanceScale,
      );
}
