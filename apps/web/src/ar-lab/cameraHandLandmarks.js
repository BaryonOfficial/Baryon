import { REQUIRED_HAND_JOINTS } from "./handAnchor.js";
import {
  AR_LAB_PREVIEW_CAMERA,
  AR_LAB_PREVIEW_CAMERA_POSE,
} from "./arLabPreviewCamera.js";

export const CAMERA_HAND_LANDMARK_INDICES = Object.freeze({
  wrist: 0,
  "index-finger-metacarpal": 5,
  "middle-finger-metacarpal": 9,
  "ring-finger-metacarpal": 13,
  "pinky-finger-metacarpal": 17,
  "index-finger-tip": 8,
  "middle-finger-tip": 12,
  "thumb-tip": 4,
});

const CAMERA_OPTIONAL_HAND_JOINTS = Object.freeze([
  "index-finger-metacarpal",
  "ring-finger-metacarpal",
  "pinky-finger-metacarpal",
  "middle-finger-tip",
]);
const CAMERA_HAND_DEPTH_M = 0.12;
const CAMERA_HAND_MIN_NORMALIZED_Z = -0.25;
const CAMERA_HAND_MAX_NORMALIZED_Z = 0.25;
const IDENTITY_QUATERNION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const DEFAULT_DISPLAY_ASPECT = 16 / 9;

function isFiniteLandmark(landmark) {
  return (
    Number.isFinite(landmark?.x) &&
    Number.isFinite(landmark?.y) &&
    Number.isFinite(landmark?.z)
  );
}

function resolveHandedness(handedness, index) {
  const category = Array.isArray(handedness) ? handedness[0] : handedness;
  const name =
    typeof category?.categoryName === "string"
      ? category.categoryName
      : typeof category?.displayName === "string"
        ? category.displayName
        : "";
  const normalized = name.toLowerCase();
  if (normalized === "left" || normalized === "right") {
    return normalized;
  }
  return index === 0 ? "right" : "left";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function resolveCameraBasis() {
  const position = AR_LAB_PREVIEW_CAMERA_POSE.position;
  const target = AR_LAB_PREVIEW_CAMERA_POSE.target;
  const up = normalizeVector(AR_LAB_PREVIEW_CAMERA_POSE.up);
  const forward = normalizeVector({
    x: target.x - position.x,
    y: target.y - position.y,
    z: target.z - position.z,
  });
  const right = normalizeVector(cross(forward, up));
  const trueUp = normalizeVector(cross(right, forward));
  const distance = Math.hypot(
    position.x - target.x,
    position.y - target.y,
    position.z - target.z,
  );

  return { position, target, forward, right, trueUp, distance };
}

function resolveDisplayedLandmark(landmark, frame) {
  const sourceAspect =
    frame.videoWidth > 0 && frame.videoHeight > 0
      ? frame.videoWidth / frame.videoHeight
      : DEFAULT_DISPLAY_ASPECT;
  const displayAspect =
    frame.displayWidth > 0 && frame.displayHeight > 0
      ? frame.displayWidth / frame.displayHeight
      : DEFAULT_DISPLAY_ASPECT;

  let x = landmark.x;
  let y = landmark.y;
  if (sourceAspect > displayAspect) {
    const visibleFraction = displayAspect / sourceAspect;
    x = (x - (1 - visibleFraction) / 2) / visibleFraction;
  } else if (sourceAspect < displayAspect) {
    const visibleFraction = sourceAspect / displayAspect;
    y = (y - (1 - visibleFraction) / 2) / visibleFraction;
  }

  return {
    // The video element is mirrored as a selfie feed. Mirror the landmark into
    // the same displayed coordinate system before projecting to world space.
    x: clamp(1 - x, 0, 1),
    y: clamp(y, 0, 1),
  };
}

function displayedLandmarkToStagePosition(displayedLandmark, landmark, frame) {
  const { target, forward, right, trueUp, distance } = resolveCameraBasis();
  const fovRadians = (AR_LAB_PREVIEW_CAMERA.fov * Math.PI) / 180;
  const displayAspect =
    frame.displayWidth > 0 && frame.displayHeight > 0
      ? frame.displayWidth / frame.displayHeight
      : DEFAULT_DISPLAY_ASPECT;
  const planeHeight = 2 * distance * Math.tan(fovRadians / 2);
  const planeWidth = planeHeight * displayAspect;
  const ndcX = displayedLandmark.x * 2 - 1;
  const ndcY = 1 - displayedLandmark.y * 2;
  const depthOffset =
    clamp(
      landmark.z,
      CAMERA_HAND_MIN_NORMALIZED_Z,
      CAMERA_HAND_MAX_NORMALIZED_Z,
    ) * CAMERA_HAND_DEPTH_M;

  return {
    x:
      target.x +
      right.x * ndcX * (planeWidth / 2) +
      trueUp.x * ndcY * (planeHeight / 2) +
      forward.x * depthOffset,
    y:
      target.y +
      right.y * ndcX * (planeWidth / 2) +
      trueUp.y * ndcY * (planeHeight / 2) +
      forward.y * depthOffset,
    z:
      target.z +
      right.z * ndcX * (planeWidth / 2) +
      trueUp.z * ndcY * (planeHeight / 2) +
      forward.z * depthOffset,
  };
}

function landmarkToStagePosition(landmark, frame) {
  const displayedLandmark = resolveDisplayedLandmark(landmark, frame);
  return displayedLandmarkToStagePosition(displayedLandmark, landmark, frame);
}

function landmarkToDisplayedPosition(landmark, frame) {
  const displayed = resolveDisplayedLandmark(landmark, frame);
  return {
    x: displayed.x,
    y: displayed.y,
    z: 0,
  };
}

function distanceBetweenDisplayedJoints(displayJoints, firstJoint, secondJoint) {
  const first = displayJoints[firstJoint]?.position;
  const second = displayJoints[secondJoint]?.position;
  if (!first || !second) {
    return null;
  }
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function resolveApparentHandSpan(displayJoints) {
  const spans = [
    distanceBetweenDisplayedJoints(
      displayJoints,
      "wrist",
      "middle-finger-tip",
    ),
    distanceBetweenDisplayedJoints(
      displayJoints,
      "wrist",
      "index-finger-tip",
    ),
    distanceBetweenDisplayedJoints(
      displayJoints,
      "index-finger-metacarpal",
      "pinky-finger-metacarpal",
    ),
  ].filter((span) => Number.isFinite(span) && span > 0);

  return spans.length > 0 ? Math.max(...spans) : null;
}

function resolvePalmRollQuaternion(displayJoints) {
  const wrist = displayJoints.wrist?.position;
  const middle = displayJoints["middle-finger-metacarpal"]?.position;
  const dx = middle.x - wrist.x;
  const dy = middle.y - wrist.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6) {
    return { ...IDENTITY_QUATERNION };
  }

  // Camera mode only has reliable screen-plane orientation. Treat an upright
  // palm as identity and map wrist-to-finger roll to orb roll around z.
  const rollRadians = Math.atan2(dx, -dy);
  const halfRoll = rollRadians / 2;
  return {
    x: 0,
    y: 0,
    z: Math.sin(halfRoll),
    w: Math.cos(halfRoll),
  };
}

/**
 * Converts MediaPipe HandLandmarker normalized landmarks into the small joint
 * set consumed by the AR Lab hand-anchor math.
 *
 * @param {{
 *   landmarks?: Array<Array<{ x: number, y: number, z: number }>>,
 *   handednesses?: Array<Array<{ categoryName?: string, displayName?: string }>>,
 * }} result
 * @param {{
 *   videoWidth?: number,
 *   videoHeight?: number,
 *   displayWidth?: number,
 *   displayHeight?: number,
 * }} frame
 * @returns {import("./handAnchor.js").HandJointSnapshot[]}
 */
export function createCameraHandSnapshots({
  landmarks = [],
  handednesses = [],
} = {}, frame = {}) {
  const resolvedFrame = {
    videoWidth: Number.isFinite(frame.videoWidth) ? frame.videoWidth : 0,
    videoHeight: Number.isFinite(frame.videoHeight) ? frame.videoHeight : 0,
    displayWidth: Number.isFinite(frame.displayWidth) ? frame.displayWidth : 0,
    displayHeight: Number.isFinite(frame.displayHeight) ? frame.displayHeight : 0,
  };

  return landmarks
    .map((handLandmarks, index) => {
      if (!Array.isArray(handLandmarks)) {
        return null;
      }

      /** @type {Record<string, { position: { x: number, y: number, z: number }, quaternion: { x: number, y: number, z: number, w: number } }>} */
      const joints = {};
      /** @type {Record<string, { position: { x: number, y: number, z: number } }>} */
      const displayJoints = {};
      for (const jointName of REQUIRED_HAND_JOINTS) {
        const landmark =
          handLandmarks[CAMERA_HAND_LANDMARK_INDICES[jointName]];
        if (!isFiniteLandmark(landmark)) {
          return null;
        }
        joints[jointName] = {
          position: landmarkToStagePosition(landmark, resolvedFrame),
          quaternion: { ...IDENTITY_QUATERNION },
        };
        displayJoints[jointName] = {
          position: landmarkToDisplayedPosition(landmark, resolvedFrame),
        };
      }
      for (const jointName of CAMERA_OPTIONAL_HAND_JOINTS) {
        const landmark =
          handLandmarks[CAMERA_HAND_LANDMARK_INDICES[jointName]];
        if (!isFiniteLandmark(landmark)) {
          continue;
        }
        joints[jointName] = {
          position: landmarkToStagePosition(landmark, resolvedFrame),
          quaternion: { ...IDENTITY_QUATERNION },
        };
        displayJoints[jointName] = {
          position: landmarkToDisplayedPosition(landmark, resolvedFrame),
        };
      }
      const wristQuaternion = resolvePalmRollQuaternion(displayJoints);
      joints.wrist.quaternion = wristQuaternion;
      const apparentHandSpan = resolveApparentHandSpan(displayJoints);

      return {
        handedness: resolveHandedness(handednesses[index], index),
        joints,
        metrics: apparentHandSpan
          ? {
              apparentHandSpan,
            }
          : undefined,
      };
    })
    .filter(Boolean);
}
