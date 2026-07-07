import { REQUIRED_HAND_JOINTS } from "./handAnchor.js";

/**
 * Read one WebXR hand into a plain joint snapshot for the anchor math.
 * Fails closed: any missing joint pose yields `null` (hand not tracked)
 * instead of a partial snapshot.
 *
 * @param {XRFrame | null | undefined} frame
 * @param {XRReferenceSpace | null | undefined} referenceSpace
 * @param {XRInputSource | null | undefined} inputSource
 * @returns {{
 *   handedness: "left" | "right",
 *   joints: Record<string, {
 *     position: { x: number, y: number, z: number },
 *     quaternion: { x: number, y: number, z: number, w: number },
 *   }>,
 * } | null}
 */
export function readHandJointSnapshot(frame, referenceSpace, inputSource) {
  const hand = inputSource?.hand;
  const handedness = inputSource?.handedness;
  if (
    !hand ||
    typeof hand.get !== "function" ||
    typeof frame?.getJointPose !== "function" ||
    !referenceSpace ||
    (handedness !== "left" && handedness !== "right")
  ) {
    return null;
  }

  /** @type {Record<string, any>} */
  const joints = {};
  for (const jointName of REQUIRED_HAND_JOINTS) {
    const jointSpace = hand.get(/** @type {XRHandJoint} */ (jointName));
    const jointPose = jointSpace
      ? frame.getJointPose(jointSpace, referenceSpace)
      : null;
    const position = jointPose?.transform?.position;
    const orientation = jointPose?.transform?.orientation;
    if (!position) {
      return null;
    }

    joints[jointName] = {
      position: { x: position.x, y: position.y, z: position.z },
      quaternion: orientation
        ? {
            x: orientation.x,
            y: orientation.y,
            z: orientation.z,
            w: orientation.w,
          }
        : { x: 0, y: 0, z: 0, w: 1 },
    };
  }

  return { handedness, joints };
}
