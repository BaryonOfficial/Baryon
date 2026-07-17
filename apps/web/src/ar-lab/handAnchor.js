import { AR_LAB_PREVIEW_CAMERA_POSE } from "./arLabPreviewCamera.js";

export const HAND_ANCHOR_SOURCES = Object.freeze({
  cameraHand: "camera-hand",
  webxrHand: "webxr-hand",
  none: "none",
});

export const HAND_ANCHOR_PHASES = Object.freeze({
  unavailable: "unavailable",
  ready: "ready",
  tracking: "tracking",
  holding: "holding",
});

export const HAND_TRACKING_STALE_MS = 300;

// Fail-closed joint set: a hand snapshot missing any of these joints is
// treated as not tracked rather than partially trusted.
export const REQUIRED_HAND_JOINTS = Object.freeze([
  "wrist",
  "middle-finger-metacarpal",
  "index-finger-tip",
  "thumb-tip",
]);

const PINCH_DISTANCE_M = 0.025;
const CAMERA_PINCH_DISTANCE_M = 0.075;
// Camera hand landmarks jitter more than XR joints, so pinch uses a wide
// release threshold for visual emphasis hysteresis only.
const CAMERA_PINCH_RELEASE_DISTANCE_M = 0.16;
const WEBXR_PINCH_RELEASE_DISTANCE_M = 0.04;
const CRADLE_REFERENCE_SEPARATION_M = 0.18;
export const CRADLE_SCALE_MIN = 0.5;
export const CRADLE_SCALE_MAX = 2.5;
export const CAMERA_HAND_TRACKING_STALE_MS = 650;

const PALM_HOLD_LIFT_M = 0.06;
// Fallback for camera snapshots that do not expose palm-width landmarks.
const CAMERA_PALM_HOLD_LIFT_M = 0.18;
const CAMERA_PALM_HOLD_FINGER_AXIS_FRACTION = 0.62;
const CAMERA_PALM_SURFACE_LIFT_M = 0.055;
const CAMERA_CONDUCTOR_REACH_EXTENSION_M = 0.03;
const CAMERA_CONDUCTOR_REACH_MIN_M = 0.09;
const CAMERA_CONDUCTOR_REACH_MAX_M = 0.18;
const CAMERA_SINGLE_HAND_SCALE = 1;
const CAMERA_APPARENT_HAND_REFERENCE_SPAN = 0.18;
const CAMERA_FALLBACK_HAND_REFERENCE_SPAN_M = 0.1;
const CAMERA_DISTANCE_SCALE_MIN = 0.55;
const CAMERA_DISTANCE_SCALE_MAX = 2.4;
const CAMERA_DISTANCE_SCALE_FAR_GAIN = 0.7;
const CAMERA_DISTANCE_SCALE_NEAR_GAIN = 1.6;
const PINCH_ATTACK_MS = 120;
const PINCH_RELEASE_MS = 280;
const PINCH_HYSTERESIS_ENERGY = 0.08;
const DEFAULT_HAND_TARGET_POSITION = Object.freeze({ x: 0, y: 0, z: 0 });
const IDENTITY_QUATERNION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

/**
 * @typedef {{ x: number, y: number, z: number }} Vector3Like
 * @typedef {{ x: number, y: number, z: number, w: number }} QuaternionLike
 * @typedef {{
 *   handedness: "left" | "right",
 *   joints: Record<string, { position: Vector3Like, quaternion?: QuaternionLike }>,
 *   metrics?: { apparentHandSpan?: number },
 * }} HandJointSnapshot
 * @typedef {{
 *   source: "camera-hand" | "webxr-hand" | "none",
 *   phase: "unavailable" | "ready" | "tracking" | "holding",
 *   anchorPose: { position: Vector3Like, quaternion: QuaternionLike, scale: number } | null,
 *   confidence: number,
 *   handedness: "left" | "right" | "both" | null,
 *   interactionEnergy: number,
 *   baseScale: number,
 *   scaleReferenceSpan: number | null,
 *   cradleReferenceSeparation: number | null,
 *   staleAgeMs: number,
 *   lastTrackedAtMs: number | null,
 * }} HandAnchorState
 */

/** @returns {HandAnchorState} */
export function createIdleHandAnchorState() {
  return {
    source: HAND_ANCHOR_SOURCES.none,
    phase: HAND_ANCHOR_PHASES.unavailable,
    anchorPose: null,
    confidence: 0,
    handedness: null,
    interactionEnergy: 0,
    baseScale: 1,
    scaleReferenceSpan: null,
    cradleReferenceSeparation: null,
    staleAgeMs: 0,
    lastTrackedAtMs: null,
  };
}

function isFiniteVector3(value) {
  return (
    Number.isFinite(value?.x) &&
    Number.isFinite(value?.y) &&
    Number.isFinite(value?.z)
  );
}

/**
 * @param {unknown} hand
 * @returns {hand is HandJointSnapshot}
 */
export function isCompleteHandSnapshot(hand) {
  const candidate = /** @type {HandJointSnapshot | null | undefined} */ (hand);
  if (candidate?.handedness !== "left" && candidate?.handedness !== "right") {
    return false;
  }

  return REQUIRED_HAND_JOINTS.every((jointName) =>
    isFiniteVector3(candidate.joints?.[jointName]?.position),
  );
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function lerpVector(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function addVector(a, b) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

function subtractVector(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function scaleVector(vector, scale) {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale,
  };
}

function dotVector(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVector(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 1e-6) {
    return null;
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function averageVectors(vectors) {
  const total = vectors.reduce((sum, vector) => addVector(sum, vector), {
    x: 0,
    y: 0,
    z: 0,
  });
  return scaleVector(total, 1 / vectors.length);
}

function resolveJointPosition(hand, jointName) {
  const position = hand.joints?.[jointName]?.position;
  return isFiniteVector3(position) ? position : null;
}

function resolveCameraPalmCenter(hand) {
  const wrist = hand.joints.wrist.position;
  const metacarpals = [
    resolveJointPosition(hand, "index-finger-metacarpal"),
    hand.joints["middle-finger-metacarpal"].position,
    resolveJointPosition(hand, "ring-finger-metacarpal"),
    resolveJointPosition(hand, "pinky-finger-metacarpal"),
  ].filter(Boolean);

  return lerpVector(
    wrist,
    averageVectors(metacarpals),
    CAMERA_PALM_HOLD_FINGER_AXIS_FRACTION,
  );
}

function resolveCameraPalmSurfaceNormal(hand, palmCenter) {
  const wrist = hand.joints.wrist.position;
  const middleMetacarpal = hand.joints["middle-finger-metacarpal"].position;
  const indexMetacarpal = resolveJointPosition(hand, "index-finger-metacarpal");
  const outerMetacarpal =
    resolveJointPosition(hand, "pinky-finger-metacarpal") ??
    resolveJointPosition(hand, "ring-finger-metacarpal");

  if (!indexMetacarpal || !outerMetacarpal) {
    return null;
  }

  const fingerAxis = subtractVector(middleMetacarpal, wrist);
  const palmWidthAxis = subtractVector(indexMetacarpal, outerMetacarpal);
  const normal = normalizeVector(crossVector(fingerAxis, palmWidthAxis));
  if (!normal) {
    return null;
  }

  const cameraVector = subtractVector(
    AR_LAB_PREVIEW_CAMERA_POSE.position,
    palmCenter,
  );
  return dotVector(normal, cameraVector) >= 0
    ? normal
    : scaleVector(normal, -1);
}

function resolveCameraPalmSurfaceHoldPosition(hand) {
  const palmCenter = resolveCameraPalmCenter(hand);
  const normal = resolveCameraPalmSurfaceNormal(hand, palmCenter);
  if (!normal) {
    const palm = lerpVector(
      hand.joints.wrist.position,
      hand.joints["middle-finger-metacarpal"].position,
      CAMERA_PALM_HOLD_FINGER_AXIS_FRACTION,
    );
    return { ...palm, y: palm.y + CAMERA_PALM_HOLD_LIFT_M };
  }

  return addVector(palmCenter, scaleVector(normal, CAMERA_PALM_SURFACE_LIFT_M));
}

function resolveCameraConductorTip(hand) {
  return (
    resolveJointPosition(hand, "middle-finger-tip") ??
    resolveJointPosition(hand, "index-finger-tip")
  );
}

function resolveCameraWorldHandSpan(hand) {
  const wrist = hand.joints.wrist.position;
  const tip = resolveCameraConductorTip(hand);
  const indexMetacarpal = resolveJointPosition(hand, "index-finger-metacarpal");
  const pinkyMetacarpal = resolveJointPosition(hand, "pinky-finger-metacarpal");
  const spans = [
    tip ? distanceBetween(wrist, tip) : null,
    indexMetacarpal && pinkyMetacarpal
      ? distanceBetween(indexMetacarpal, pinkyMetacarpal)
      : null,
  ].filter((span) => Number.isFinite(span) && span > 0);

  return spans.length > 0 ? Math.max(...spans) : null;
}

function resolveCameraScaleSpan(hand) {
  const apparentHandSpan = hand.metrics?.apparentHandSpan;
  const usingApparentSpan =
    Number.isFinite(apparentHandSpan) && apparentHandSpan > 0;
  return {
    span: usingApparentSpan
      ? apparentHandSpan
      : resolveCameraWorldHandSpan(hand),
    fallbackReferenceSpan: usingApparentSpan
      ? CAMERA_APPARENT_HAND_REFERENCE_SPAN
      : CAMERA_FALLBACK_HAND_REFERENCE_SPAN_M,
  };
}

function resolveCameraDistanceScaleMultiplier(span, referenceSpan) {
  if (
    !Number.isFinite(span) ||
    span <= 0 ||
    !Number.isFinite(referenceSpan) ||
    referenceSpan <= 0
  ) {
    return CAMERA_SINGLE_HAND_SCALE;
  }

  const normalizedSpan = span / referenceSpan;
  const distanceScale =
    normalizedSpan >= 1
      ? 1 + (normalizedSpan - 1) * CAMERA_DISTANCE_SCALE_NEAR_GAIN
      : 1 - (1 - normalizedSpan) * CAMERA_DISTANCE_SCALE_FAR_GAIN;
  return clamp(
    distanceScale,
    CAMERA_DISTANCE_SCALE_MIN,
    CAMERA_DISTANCE_SCALE_MAX,
  );
}

function resolveCameraConductorHoldPosition(hand) {
  const palmCenter = resolveCameraPalmCenter(hand);
  const tip = resolveCameraConductorTip(hand);
  const normal = resolveCameraPalmSurfaceNormal(hand, palmCenter);
  const direction = tip
    ? normalizeVector(subtractVector(tip, hand.joints.wrist.position))
    : null;

  if (!tip || !normal || !direction) {
    return resolveCameraPalmSurfaceHoldPosition(hand);
  }

  const reach = clamp(
    distanceBetween(palmCenter, tip) + CAMERA_CONDUCTOR_REACH_EXTENSION_M,
    CAMERA_CONDUCTOR_REACH_MIN_M,
    CAMERA_CONDUCTOR_REACH_MAX_M,
  );
  return addVector(
    addVector(palmCenter, scaleVector(direction, reach)),
    scaleVector(normal, CAMERA_PALM_SURFACE_LIFT_M),
  );
}

/**
 * The palm center sits between the wrist and the middle-finger metacarpal; the
 * hold point floats above it so the orb hovers over the palm rather than resting
 * on the hand. Webcam mode uses a conductor-tip anchor: the hand is the grip,
 * and the orb rides just past the finger axis like an expressive baton point.
 *
 * @param {HandJointSnapshot} hand
 * @returns {Vector3Like}
 */
export function resolvePalmHoldPosition(hand) {
  return resolvePalmHoldPositionForSource(hand, HAND_ANCHOR_SOURCES.webxrHand);
}

function resolvePalmHoldPositionForSource(hand, source) {
  if (source === HAND_ANCHOR_SOURCES.cameraHand) {
    return resolveCameraConductorHoldPosition(hand);
  }

  const palmCenter = midpoint(
    hand.joints.wrist.position,
    hand.joints["middle-finger-metacarpal"].position,
  );
  return { ...palmCenter, y: palmCenter.y + PALM_HOLD_LIFT_M };
}

function resolveCradlePointForSource(hand, source) {
  return source === HAND_ANCHOR_SOURCES.cameraHand
    ? resolveCameraPalmCenter(hand)
    : resolvePalmHoldPositionForSource(hand, source);
}

/**
 * @param {HandJointSnapshot} hand
 * @returns {boolean}
 */
export function isPinching(hand) {
  return isPinchingForSource(hand, HAND_ANCHOR_SOURCES.webxrHand, false);
}

function isPinchingForSource(hand, source, wasPinching) {
  const startDistance =
    source === HAND_ANCHOR_SOURCES.cameraHand
      ? CAMERA_PINCH_DISTANCE_M
      : PINCH_DISTANCE_M;
  const releaseDistance =
    source === HAND_ANCHOR_SOURCES.cameraHand
      ? CAMERA_PINCH_RELEASE_DISTANCE_M
      : WEBXR_PINCH_RELEASE_DISTANCE_M;
  const threshold = wasPinching ? releaseDistance : startDistance;
  return (
    distanceBetween(
      hand.joints["index-finger-tip"].position,
      hand.joints["thumb-tip"].position,
    ) < threshold
  );
}

/**
 * @param {number} palmSeparationMeters
 * @returns {number}
 */
export function resolveCradleScale(palmSeparationMeters) {
  const rawScale = palmSeparationMeters / CRADLE_REFERENCE_SEPARATION_M;
  return Math.min(CRADLE_SCALE_MAX, Math.max(CRADLE_SCALE_MIN, rawScale));
}

/**
 * @typedef {{ scale: number, baseScale: number, referenceSeparation: number | null }} CradleEngagement
 */

/**
 * Pinch energy rises fast while pinching and releases slowly. The energy is
 * used for visual emphasis and gesture hysteresis; scale is owned by camera
 * apparent hand distance or the two-palm cradle, never by a one-hand pinch.
 *
 * @param {number} current
 * @param {boolean} pinchActive
 * @param {number} dtMs
 * @returns {number}
 */
export function stepInteractionEnergy(current, pinchActive, dtMs) {
  const clamped = Math.min(
    1,
    Math.max(0, Number.isFinite(current) ? current : 0),
  );
  const safeDtMs = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (pinchActive) {
    return Math.min(
      1,
      clamped + (1 - clamped) * Math.min(1, safeDtMs / PINCH_ATTACK_MS),
    );
  }
  return clamped * Math.max(0, 1 - safeDtMs / PINCH_RELEASE_MS);
}

function resolveWristQuaternion(hand) {
  const quaternion = hand.joints.wrist.quaternion;
  if (
    Number.isFinite(quaternion?.x) &&
    Number.isFinite(quaternion?.y) &&
    Number.isFinite(quaternion?.z) &&
    Number.isFinite(quaternion?.w)
  ) {
    return {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w,
    };
  }
  return { ...IDENTITY_QUATERNION };
}

function resolveTrackedSource(source) {
  return source === HAND_ANCHOR_SOURCES.cameraHand ||
    source === HAND_ANCHOR_SOURCES.webxrHand
    ? source
    : HAND_ANCHOR_SOURCES.webxrHand;
}

function resolveTrackingStaleMs(source) {
  return source === HAND_ANCHOR_SOURCES.cameraHand
    ? CAMERA_HAND_TRACKING_STALE_MS
    : HAND_TRACKING_STALE_MS;
}

function canUseTwoHandCradle(validHands) {
  return validHands.length >= 2;
}

function selectPrimaryHand(validHands, previous, source, pinchingHands) {
  const pinchingSet = new Set(pinchingHands);
  const target = previous.anchorPose?.position ?? DEFAULT_HAND_TARGET_POSITION;
  const previousHandedness =
    previous.handedness === "left" || previous.handedness === "right"
      ? previous.handedness
      : null;

  return validHands.reduce(
    (best, hand) => {
      const palm = resolvePalmHoldPositionForSource(hand, source);
      let score = distanceBetween(palm, target);
      if (hand.handedness === previousHandedness) {
        score -= 0.28;
      }
      if (pinchingSet.has(hand)) {
        score -= 0.18;
      }
      return score < best.score ? { hand, score } : best;
    },
    { hand: validHands[0], score: Number.POSITIVE_INFINITY },
  ).hand;
}

function resolvePreviousScale(previous, fallback) {
  const scale = previous.anchorPose?.scale;
  return Number.isFinite(scale) ? scale : fallback;
}

function resolveBaseScale(previous, fallback = CAMERA_SINGLE_HAND_SCALE) {
  const baseScale = previous.baseScale;
  if (Number.isFinite(baseScale) && baseScale > 0) {
    return baseScale;
  }
  return resolvePreviousScale(previous, fallback);
}

/**
 * Two-palm cradle sizing. WebXR joints are real-world metric, so the orb scales
 * off the absolute palm separation. Camera palm centers live on a fixed
 * projection plane whose stage units are ~50x the real hand separation, so an
 * absolute reference would pin the scale at its clamp. Instead the camera cradle
 * is relative: it grows/shrinks off the frame-to-frame ratio of palm separation,
 * which is invariant to the projection. The reached size persists as `baseScale`
 * so dropping to one hand keeps whatever size the cradle settled on.
 *
 * @param {HandAnchorState} previous
 * @param {"camera-hand" | "webxr-hand"} source
 * @param {number} separation current palm-center separation
 * @returns {CradleEngagement}
 */
function resolveCradleEngagement(previous, source, separation) {
  if (source !== HAND_ANCHOR_SOURCES.cameraHand) {
    const scale = resolveCradleScale(separation);
    return { scale, baseScale: scale, referenceSeparation: null };
  }

  const base = resolveBaseScale(previous);
  const validSeparation = Number.isFinite(separation) && separation > 0;
  const wasCradling =
    previous.handedness === "both" &&
    Number.isFinite(previous.cradleReferenceSeparation) &&
    previous.cradleReferenceSeparation > 0;

  if (!wasCradling || !validSeparation) {
    // First frame of a cradle: latch the current separation as the reference
    // and hold the incoming size so the orb never jumps on engagement.
    return {
      scale: base,
      baseScale: base,
      referenceSeparation: validSeparation ? separation : null,
    };
  }

  const scale = clamp(
    base * (separation / previous.cradleReferenceSeparation),
    CRADLE_SCALE_MIN,
    CRADLE_SCALE_MAX,
  );
  return { scale, baseScale: scale, referenceSeparation: separation };
}

function resolveCameraScaleReferenceSpan(previous, currentSpan, fallbackSpan) {
  if (previous.source === HAND_ANCHOR_SOURCES.cameraHand) {
    if (
      previous.handedness === "both" &&
      Number.isFinite(currentSpan) &&
      currentSpan > 0
    ) {
      return currentSpan;
    }
    if (
      Number.isFinite(previous.scaleReferenceSpan) &&
      previous.scaleReferenceSpan > 0
    ) {
      return previous.scaleReferenceSpan;
    }
  }
  return fallbackSpan;
}

function resolveSingleHandScale(previous, source, hand) {
  const fallback =
    source === HAND_ANCHOR_SOURCES.cameraHand ? CAMERA_SINGLE_HAND_SCALE : 1;
  if (source === HAND_ANCHOR_SOURCES.cameraHand) {
    const { span, fallbackReferenceSpan } = resolveCameraScaleSpan(hand);
    const scaleReferenceSpan = resolveCameraScaleReferenceSpan(
      previous,
      span,
      fallbackReferenceSpan,
    );
    return clamp(
      resolveBaseScale(previous, fallback) *
        resolveCameraDistanceScaleMultiplier(span, scaleReferenceSpan),
      CRADLE_SCALE_MIN,
      CRADLE_SCALE_MAX,
    );
  }
  return resolvePreviousScale(previous, fallback);
}

/**
 * @param {HandJointSnapshot[]} validHands
 * @param {HandAnchorState} previous
 * @param {number} nowMs
 * @param {number} dtMs
 * @param {"camera-hand" | "webxr-hand"} source
 * @returns {HandAnchorState}
 */
function deriveHeldAnchor(validHands, previous, nowMs, dtMs, source) {
  const wasPinching = previous.interactionEnergy > PINCH_HYSTERESIS_ENERGY;
  const pinchingHands = validHands.filter((hand) =>
    isPinchingForSource(hand, source, wasPinching),
  );
  const pinchActive = pinchingHands.length > 0;
  const interactionEnergy = stepInteractionEnergy(
    previous.interactionEnergy,
    pinchActive,
    dtMs,
  );

  if (canUseTwoHandCradle(validHands)) {
    const [first, second] = validHands;
    const firstPalm = resolveCradlePointForSource(first, source);
    const secondPalm = resolveCradlePointForSource(second, source);
    const cradle = resolveCradleEngagement(
      previous,
      source,
      distanceBetween(firstPalm, secondPalm),
    );
    return {
      source,
      phase: HAND_ANCHOR_PHASES.holding,
      anchorPose: {
        position: midpoint(firstPalm, secondPalm),
        quaternion: { ...IDENTITY_QUATERNION },
        scale: cradle.scale,
      },
      confidence: 1,
      handedness: "both",
      interactionEnergy,
      baseScale: cradle.baseScale,
      scaleReferenceSpan: previous.scaleReferenceSpan ?? null,
      cradleReferenceSeparation: cradle.referenceSeparation,
      staleAgeMs: 0,
      lastTrackedAtMs: nowMs,
    };
  }

  const hand =
    validHands.length === 1
      ? validHands[0]
      : selectPrimaryHand(validHands, previous, source, pinchingHands);
  const { span, fallbackReferenceSpan } =
    source === HAND_ANCHOR_SOURCES.cameraHand
      ? resolveCameraScaleSpan(hand)
      : { span: null, fallbackReferenceSpan: null };
  const scaleReferenceSpan =
    source === HAND_ANCHOR_SOURCES.cameraHand
      ? resolveCameraScaleReferenceSpan(previous, span, fallbackReferenceSpan)
      : (previous.scaleReferenceSpan ?? null);
  return {
    source,
    phase: HAND_ANCHOR_PHASES.holding,
    anchorPose: {
      position: resolvePalmHoldPositionForSource(hand, source),
      quaternion: resolveWristQuaternion(hand),
      scale: resolveSingleHandScale(previous, source, hand),
    },
    confidence: 1,
    handedness: hand.handedness,
    interactionEnergy,
    baseScale: resolveBaseScale(previous),
    scaleReferenceSpan,
    cradleReferenceSeparation: null,
    staleAgeMs: 0,
    lastTrackedAtMs: nowMs,
  };
}

function deriveUntrackedAnchor(previous, nowMs, dtMs, source) {
  const interactionEnergy = stepInteractionEnergy(
    previous.interactionEnergy,
    false,
    dtMs,
  );

  if (previous.lastTrackedAtMs == null) {
    return {
      source,
      phase: HAND_ANCHOR_PHASES.ready,
      anchorPose: null,
      confidence: 0,
      handedness: null,
      interactionEnergy,
      baseScale: resolveBaseScale(previous),
      scaleReferenceSpan: previous.scaleReferenceSpan ?? null,
      cradleReferenceSeparation: null,
      staleAgeMs: 0,
      lastTrackedAtMs: null,
    };
  }

  const staleAgeMs = Math.max(0, nowMs - previous.lastTrackedAtMs);
  const staleWindowMs = resolveTrackingStaleMs(source);
  if (staleAgeMs < staleWindowMs) {
    // Coast on the last anchor while tracking is briefly lost.
    return {
      source,
      phase: HAND_ANCHOR_PHASES.tracking,
      anchorPose: previous.anchorPose,
      confidence: Math.max(0, 1 - staleAgeMs / staleWindowMs),
      handedness: previous.handedness,
      interactionEnergy,
      baseScale: resolveBaseScale(previous),
      scaleReferenceSpan: previous.scaleReferenceSpan ?? null,
      cradleReferenceSeparation: previous.cradleReferenceSeparation ?? null,
      staleAgeMs,
      lastTrackedAtMs: previous.lastTrackedAtMs,
    };
  }

  // Past the stale window the anchor releases; the rig eases the orb back to
  // its default AR pose.
  return {
    source,
    phase: HAND_ANCHOR_PHASES.ready,
    anchorPose: null,
    confidence: 0,
    handedness: null,
    interactionEnergy,
    baseScale: resolveBaseScale(previous),
    scaleReferenceSpan: previous.scaleReferenceSpan ?? null,
    cradleReferenceSeparation: null,
    staleAgeMs,
    lastTrackedAtMs: previous.lastTrackedAtMs,
  };
}

/**
 * Frame-local hand anchor derivation. This is pure state math: it never
 * touches the XR session, the control store, or rendering.
 *
 * @param {{
 *   previous?: HandAnchorState | null,
 *   hands?: unknown[],
 *   nowMs: number,
 *   dtMs?: number,
 *   handSourceAvailable?: boolean,
 *   source?: "camera-hand" | "webxr-hand",
 * }} input
 * @returns {HandAnchorState}
 */
export function deriveHandAnchorState({
  previous = null,
  hands = [],
  nowMs,
  dtMs = 0,
  handSourceAvailable = false,
  source = HAND_ANCHOR_SOURCES.webxrHand,
}) {
  const previousState = previous ?? createIdleHandAnchorState();
  const resolvedSource = resolveTrackedSource(source);

  if (!handSourceAvailable) {
    return createIdleHandAnchorState();
  }

  const validHands = hands.filter(isCompleteHandSnapshot);
  if (validHands.length === 0) {
    return deriveUntrackedAnchor(previousState, nowMs, dtMs, resolvedSource);
  }

  return deriveHeldAnchor(
    validHands,
    previousState,
    nowMs,
    dtMs,
    resolvedSource,
  );
}
