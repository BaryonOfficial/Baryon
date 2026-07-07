import { HAND_ANCHOR_PHASES, HAND_ANCHOR_SOURCES } from "./handAnchor.js";

// Where the orb rests when no hand holds it. Keep this at the regular app's
// scene origin so webcam mode starts at the same camera distance as Baryon.
export const DEFAULT_AR_ORB_POSE = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  quaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  scale: 1,
});

// Base world scale applied to the Baryon orb group; anchor scale multiplies it.
// Keep this at app scale so the AR Lab and regular web app read at the same
// camera distance with the shared 5,5,5 default camera.
export const AR_ORB_BASE_SCALE = 1;

export const DEFAULT_POSE_EASE_HALF_LIFE_SECONDS = 0.09;
export const CAMERA_HAND_POSE_EASE_HALF_LIFE_SECONDS = 0.035;

/**
 * @typedef {{
 *   position: { x: number, y: number, z: number },
 *   quaternion: { x: number, y: number, z: number, w: number },
 *   scale: number,
 * }} OrbPose
 */

/**
 * @param {import("./handAnchor.js").HandAnchorState | null | undefined} anchorState
 * @returns {OrbPose}
 */
export function resolveOrbTargetPose(anchorState) {
  const anchorPose =
    anchorState?.phase === HAND_ANCHOR_PHASES.holding ||
    anchorState?.phase === HAND_ANCHOR_PHASES.tracking
      ? anchorState.anchorPose
      : null;
  return anchorPose ?? DEFAULT_AR_ORB_POSE;
}

/**
 * Frame-rate-independent exponential smoothing factor.
 *
 * @param {number} deltaSeconds
 * @returns {number} blend weight toward the target in [0, 1]
 */
export function resolvePoseEaseAlpha(deltaSeconds) {
  return resolvePoseEaseAlphaForHalfLife(
    deltaSeconds,
    DEFAULT_POSE_EASE_HALF_LIFE_SECONDS,
  );
}

/**
 * @param {number} deltaSeconds
 * @param {number} halfLifeSeconds
 * @returns {number} blend weight toward the target in [0, 1]
 */
export function resolvePoseEaseAlphaForHalfLife(deltaSeconds, halfLifeSeconds) {
  const safeDelta =
    Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  const safeHalfLife =
    Number.isFinite(halfLifeSeconds) && halfLifeSeconds > 0
      ? halfLifeSeconds
      : DEFAULT_POSE_EASE_HALF_LIFE_SECONDS;
  return 1 - Math.pow(0.5, safeDelta / safeHalfLife);
}

/**
 * @param {import("./handAnchor.js").HandAnchorState | null | undefined} anchorState
 * @returns {number}
 */
export function resolveOrbPoseEaseHalfLifeSeconds(anchorState) {
  const handActive =
    anchorState?.phase === HAND_ANCHOR_PHASES.holding ||
    anchorState?.phase === HAND_ANCHOR_PHASES.tracking;
  return handActive && anchorState?.source === HAND_ANCHOR_SOURCES.cameraHand
    ? CAMERA_HAND_POSE_EASE_HALF_LIFE_SECONDS
    : DEFAULT_POSE_EASE_HALF_LIFE_SECONDS;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Ease a pose toward a target. Quaternion blending uses normalized lerp,
 * which is sufficient for the small per-frame steps this rig takes.
 *
 * @param {OrbPose} current
 * @param {OrbPose} target
 * @param {number} deltaSeconds
 * @returns {OrbPose}
 */
export function stepOrbPoseToward(
  current,
  target,
  deltaSeconds,
  { halfLifeSeconds = DEFAULT_POSE_EASE_HALF_LIFE_SECONDS } = {},
) {
  const alpha = resolvePoseEaseAlphaForHalfLife(deltaSeconds, halfLifeSeconds);

  const qCurrent = current.quaternion;
  const qTarget = target.quaternion;
  // Take the short way around: flip the target hemisphere when needed.
  const dot =
    qCurrent.x * qTarget.x +
    qCurrent.y * qTarget.y +
    qCurrent.z * qTarget.z +
    qCurrent.w * qTarget.w;
  const sign = dot < 0 ? -1 : 1;
  const blended = {
    x: lerp(qCurrent.x, sign * qTarget.x, alpha),
    y: lerp(qCurrent.y, sign * qTarget.y, alpha),
    z: lerp(qCurrent.z, sign * qTarget.z, alpha),
    w: lerp(qCurrent.w, sign * qTarget.w, alpha),
  };
  const length =
    Math.sqrt(
      blended.x * blended.x +
        blended.y * blended.y +
        blended.z * blended.z +
        blended.w * blended.w,
    ) || 1;

  return {
    position: {
      x: lerp(current.position.x, target.position.x, alpha),
      y: lerp(current.position.y, target.position.y, alpha),
      z: lerp(current.position.z, target.position.z, alpha),
    },
    quaternion: {
      x: blended.x / length,
      y: blended.y / length,
      z: blended.z / length,
      w: blended.w / length,
    },
    scale: lerp(current.scale, target.scale, alpha),
  };
}
