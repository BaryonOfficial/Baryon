import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_HAND_TRACKING_STALE_MS,
  CRADLE_SCALE_MAX,
  CRADLE_SCALE_MIN,
  HAND_ANCHOR_PHASES,
  HAND_ANCHOR_SOURCES,
  HAND_TRACKING_STALE_MS,
  createIdleHandAnchorState,
  deriveHandAnchorState,
  isCompleteHandSnapshot,
  isPinching,
  resolveCradleScale,
  resolvePalmHoldPosition,
  stepInteractionEnergy,
} from "../../src/ar-lab/handAnchor.js";

function createHand({
  handedness = "right",
  wrist = { x: 0, y: 1, z: -0.4 },
  indexMetacarpal = null,
  middleMetacarpal = { x: 0, y: 1.04, z: -0.46 },
  ringMetacarpal = null,
  pinkyMetacarpal = null,
  indexTip = { x: 0.02, y: 1.08, z: -0.5 },
  middleTip = null,
  thumbTip = { x: 0.06, y: 1.06, z: -0.48 },
  apparentHandSpan = null,
} = {}) {
  const joints = {
    wrist: { position: wrist, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
    "middle-finger-metacarpal": { position: middleMetacarpal },
    "index-finger-tip": { position: indexTip },
    "thumb-tip": { position: thumbTip },
  };
  if (indexMetacarpal) {
    joints["index-finger-metacarpal"] = { position: indexMetacarpal };
  }
  if (ringMetacarpal) {
    joints["ring-finger-metacarpal"] = { position: ringMetacarpal };
  }
  if (pinkyMetacarpal) {
    joints["pinky-finger-metacarpal"] = { position: pinkyMetacarpal };
  }
  if (middleTip) {
    joints["middle-finger-tip"] = { position: middleTip };
  }

  const hand = {
    handedness,
    joints,
  };
  if (Number.isFinite(apparentHandSpan) && apparentHandSpan > 0) {
    hand.metrics = { apparentHandSpan };
  }
  return hand;
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

test("idle state matches the documented shape", () => {
  assert.deepEqual(createIdleHandAnchorState(), {
    source: "none",
    phase: "unavailable",
    anchorPose: null,
    confidence: 0,
    handedness: null,
    interactionEnergy: 0,
    baseScale: 1,
    scaleReferenceSpan: null,
    cradleReferenceSeparation: null,
    staleAgeMs: 0,
    lastTrackedAtMs: null,
  });
});

test("missing hand joints fail closed", () => {
  const hand = createHand();
  delete hand.joints["thumb-tip"];
  assert.equal(isCompleteHandSnapshot(hand), false);

  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [hand],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
  });
  assert.equal(state.phase, HAND_ANCHOR_PHASES.ready);
  assert.equal(state.anchorPose, null);
});

test("one palm holds the orb above the palm center", () => {
  const hand = createHand();
  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [hand],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
  });

  assert.equal(state.source, HAND_ANCHOR_SOURCES.webxrHand);
  assert.equal(state.phase, HAND_ANCHOR_PHASES.holding);
  assert.equal(state.handedness, "right");
  assert.equal(state.confidence, 1);
  assert.equal(state.lastTrackedAtMs, 1000);
  assert.deepEqual(state.anchorPose.position, resolvePalmHoldPosition(hand));
  // Single palm never rescales the orb.
  assert.equal(state.anchorPose.scale, 1);
});

test("camera hand anchors keep the camera source", () => {
  const hand = createHand({
    apparentHandSpan: 0.18,
    thumbTip: { x: 0.16, y: 1.06, z: -0.48 },
  });
  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [hand],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(state.source, HAND_ANCHOR_SOURCES.cameraHand);
  assert.equal(state.phase, HAND_ANCHOR_PHASES.holding);
  assert.equal(state.anchorPose.position.x, 0);
  // Palm base lerps to y=1.0248; the orb latches 0.18m above it.
  assert.ok(Math.abs(state.anchorPose.position.y - 1.2048) < 1e-9);
  assert.ok(Math.abs(state.anchorPose.position.z - -0.4372) < 1e-9);
  assert.equal(state.anchorPose.scale, 1);
});

test("camera conductor anchor leads from a rolled hand like a baton tip", () => {
  const hand = createHand({
    wrist: { x: -0.04, y: 1, z: -0.46 },
    indexMetacarpal: { x: -0.08, y: 1.08, z: -0.46 },
    middleMetacarpal: { x: -0.11, y: 1.04, z: -0.46 },
    ringMetacarpal: { x: -0.12, y: 1, z: -0.46 },
    pinkyMetacarpal: { x: -0.11, y: 0.96, z: -0.46 },
    indexTip: { x: -0.17, y: 1.08, z: -0.46 },
    thumbTip: { x: -0.06, y: 0.99, z: -0.46 },
  });

  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [hand],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(state.phase, HAND_ANCHOR_PHASES.holding);
  assert.ok(state.anchorPose.position.z > -0.46);
  assert.ok(
    state.anchorPose.position.x < hand.joints["index-finger-tip"].position.x,
  );
  assert.ok(
    distanceBetween(state.anchorPose.position, hand.joints.wrist.position) >
      distanceBetween(
        hand.joints["index-finger-tip"].position,
        hand.joints.wrist.position,
      ),
  );
});

test("camera conductor anchor uses the middle-finger tip while index pinches", () => {
  const steadyMiddleTip = { x: 0, y: 1.18, z: -0.48 };
  const relaxed = createHand({
    indexMetacarpal: { x: -0.04, y: 1.05, z: -0.46 },
    middleMetacarpal: { x: 0, y: 1.08, z: -0.46 },
    ringMetacarpal: { x: 0.04, y: 1.05, z: -0.46 },
    pinkyMetacarpal: { x: 0.06, y: 1.01, z: -0.46 },
    indexTip: { x: -0.04, y: 1.16, z: -0.49 },
    middleTip: steadyMiddleTip,
    thumbTip: { x: 0.08, y: 1.08, z: -0.48 },
  });
  const pinching = createHand({
    indexMetacarpal: { x: -0.04, y: 1.05, z: -0.46 },
    middleMetacarpal: { x: 0, y: 1.08, z: -0.46 },
    ringMetacarpal: { x: 0.04, y: 1.05, z: -0.46 },
    pinkyMetacarpal: { x: 0.06, y: 1.01, z: -0.46 },
    indexTip: { x: 0.025, y: 1.09, z: -0.48 },
    middleTip: steadyMiddleTip,
    thumbTip: { x: 0.03, y: 1.09, z: -0.48 },
  });

  const relaxedState = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [relaxed],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });
  const pinchingState = deriveHandAnchorState({
    previous: relaxedState,
    hands: [pinching],
    nowMs: 1016,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.deepEqual(
    pinchingState.anchorPose.position,
    relaxedState.anchorPose.position,
  );
  assert.equal(pinchingState.anchorPose.scale, relaxedState.anchorPose.scale);
});

test("camera pinch drives interaction energy without owning scale", () => {
  const relaxedCameraPinch = createHand({
    apparentHandSpan: 0.18,
    indexTip: { x: 0.02, y: 1.08, z: -0.5 },
    thumbTip: { x: 0.075, y: 1.08, z: -0.5 },
  });
  assert.equal(isPinching(relaxedCameraPinch), false);

  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [relaxedCameraPinch],
    nowMs: 1000,
    dtMs: 60,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(state.phase, HAND_ANCHOR_PHASES.holding);
  assert.ok(state.interactionEnergy > 0);
  assert.equal(state.anchorPose.scale, 1);
});

test("camera hand distance adjusts the orb scale from apparent hand size", () => {
  const farHand = createHand({
    apparentHandSpan: 0.12,
    thumbTip: { x: 0.14, y: 1.06, z: -0.48 },
  });
  const nearHand = createHand({
    apparentHandSpan: 0.3,
    thumbTip: { x: 0.14, y: 1.06, z: -0.48 },
  });

  const farState = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [farHand],
    nowMs: 1000,
    dtMs: 120,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });
  const nearState = deriveHandAnchorState({
    previous: farState,
    hands: [nearHand],
    nowMs: 1120,
    dtMs: 120,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(farState.phase, HAND_ANCHOR_PHASES.holding);
  assert.ok(farState.anchorPose.scale < 1);
  assert.ok(Math.abs(farState.anchorPose.scale - 0.7666666667) < 1e-9);
  assert.ok(nearState.anchorPose.scale > farState.anchorPose.scale);
  assert.ok(nearState.anchorPose.scale > 1);
  assert.ok(Math.abs(nearState.anchorPose.scale - 2.0666666667) < 1e-9);
  assert.ok(nearState.anchorPose.scale <= 2.4);
});

// A left/right pair whose palm centers sit `halfSeparation` from the midline,
// so the cradle separation is exactly `2 * halfSeparation` along x.
function createCradlePair(halfSeparation) {
  return [
    createHand({
      handedness: "left",
      apparentHandSpan: 0.18,
      wrist: { x: -halfSeparation, y: 1, z: -0.4 },
      middleMetacarpal: { x: -halfSeparation, y: 1.04, z: -0.46 },
    }),
    createHand({
      handedness: "right",
      apparentHandSpan: 0.18,
      wrist: { x: halfSeparation, y: 1, z: -0.4 },
      middleMetacarpal: { x: halfSeparation, y: 1.04, z: -0.46 },
    }),
  ];
}

test("camera cradle engages without jumping the current orb size", () => {
  const engaged = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: createCradlePair(0.18),
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(engaged.phase, HAND_ANCHOR_PHASES.holding);
  assert.equal(engaged.handedness, "both");
  // The orb targets the midpoint between both palm centers.
  assert.ok(Math.abs(engaged.anchorPose.position.x) < 1e-9);
  assert.ok(Math.abs(engaged.anchorPose.position.y - 1.0248) < 1e-9);
  // Engaging holds the incoming base size rather than snapping to any absolute
  // separation-to-scale mapping.
  assert.equal(engaged.anchorPose.scale, 1);
  assert.equal(engaged.baseScale, 1);
  // The engagement separation (0.36) is latched as the relative reference.
  assert.ok(Math.abs(engaged.cradleReferenceSeparation - 0.36) < 1e-9);
});

test("camera cradle grows when hands widen and shrinks when they close", () => {
  const engaged = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: createCradlePair(0.18),
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  // Separation doubles from 0.36 to 0.72: scale = base(1) * (0.72 / 0.36) = 2.
  const widened = deriveHandAnchorState({
    previous: engaged,
    hands: createCradlePair(0.36),
    nowMs: 1016,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });
  assert.equal(widened.handedness, "both");
  assert.ok(widened.anchorPose.scale > engaged.anchorPose.scale);
  assert.ok(Math.abs(widened.anchorPose.scale - 2) < 1e-9);
  assert.ok(Math.abs(widened.cradleReferenceSeparation - 0.72) < 1e-9);

  // Closing back to 0.36 halves the ratio: scale = base(2) * (0.36 / 0.72) = 1.
  const closed = deriveHandAnchorState({
    previous: widened,
    hands: createCradlePair(0.18),
    nowMs: 1032,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });
  assert.ok(closed.anchorPose.scale < widened.anchorPose.scale);
  assert.ok(Math.abs(closed.anchorPose.scale - 1) < 1e-9);
});

test("camera cradle size becomes the base when returning to one hand", () => {
  const engaged = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: createCradlePair(0.18),
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });
  const widened = deriveHandAnchorState({
    previous: engaged,
    hands: createCradlePair(0.36),
    nowMs: 1016,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  const oneHand = deriveHandAnchorState({
    previous: widened,
    hands: [
      createHand({
        apparentHandSpan: 0.18,
        thumbTip: { x: 0.14, y: 1.06, z: -0.48 },
      }),
    ],
    nowMs: 1032,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(oneHand.handedness, "right");
  // The size the cradle settled on carries over as the one-hand base, and the
  // orb holds that size the instant the second hand leaves.
  assert.ok(Math.abs(oneHand.baseScale - widened.anchorPose.scale) < 1e-9);
  assert.ok(Math.abs(oneHand.anchorPose.scale - widened.anchorPose.scale) < 1e-9);
  assert.equal(oneHand.cradleReferenceSeparation, null);
});

test("camera cradle scale clamps to its bounds when hands fling wide", () => {
  let state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: createCradlePair(0.18),
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });
  // Each step widens the hands relative to the previous frame, so the relative
  // cradle keeps growing until it saturates at the shared clamp.
  for (let step = 1; step <= 6; step += 1) {
    state = deriveHandAnchorState({
      previous: state,
      hands: createCradlePair(0.18 * (step + 1)),
      nowMs: 1000 + step * 16,
      dtMs: 16,
      handSourceAvailable: true,
      source: HAND_ANCHOR_SOURCES.cameraHand,
    });
  }
  assert.equal(state.anchorPose.scale, CRADLE_SCALE_MAX);
});

test("two palms cradle the orb and scale it by separation", () => {
  const left = createHand({
    handedness: "left",
    wrist: { x: -0.18, y: 1, z: -0.4 },
    middleMetacarpal: { x: -0.18, y: 1.04, z: -0.46 },
    indexTip: { x: -0.16, y: 1.08, z: -0.5 },
    thumbTip: { x: -0.1, y: 1.06, z: -0.48 },
  });
  const right = createHand({
    handedness: "right",
    wrist: { x: 0.18, y: 1, z: -0.4 },
    middleMetacarpal: { x: 0.18, y: 1.04, z: -0.46 },
    indexTip: { x: 0.16, y: 1.08, z: -0.5 },
    thumbTip: { x: 0.1, y: 1.06, z: -0.48 },
  });

  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [left, right],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
  });

  assert.equal(state.phase, HAND_ANCHOR_PHASES.holding);
  assert.equal(state.handedness, "both");
  // Palms are 0.36m apart: cradle scale = 0.36 / 0.18 = 2.
  assert.ok(Math.abs(state.anchorPose.scale - 2) < 1e-9);
  assert.ok(Math.abs(state.anchorPose.position.x) < 1e-9);
});

test("cradle scale clamps to its bounds", () => {
  assert.equal(resolveCradleScale(0.001), CRADLE_SCALE_MIN);
  assert.equal(resolveCradleScale(10), CRADLE_SCALE_MAX);
});

test("pinch drives interaction energy without one-hand scale", () => {
  const pinchingHand = createHand({
    indexTip: { x: 0.02, y: 1.08, z: -0.5 },
    thumbTip: { x: 0.021, y: 1.081, z: -0.5 },
  });
  const widerPinchingHand = createHand({
    indexTip: { x: 0.02, y: 1.08, z: -0.5 },
    thumbTip: { x: 0.035, y: 1.081, z: -0.5 },
  });
  assert.equal(isPinching(pinchingHand), true);

  const heldState = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [pinchingHand],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
  });
  const pinchedState = deriveHandAnchorState({
    previous: heldState,
    hands: [widerPinchingHand],
    nowMs: 1016,
    dtMs: 16,
    handSourceAvailable: true,
  });

  assert.ok(pinchedState.interactionEnergy > heldState.interactionEnergy);
  assert.deepEqual(
    pinchedState.anchorPose.position,
    heldState.anchorPose.position,
  );
  assert.equal(pinchedState.anchorPose.scale, heldState.anchorPose.scale);
});

test("interaction energy rises while pinching and decays after release", () => {
  let energy = 0;
  energy = stepInteractionEnergy(energy, true, 100);
  const risen = energy;
  assert.ok(risen > 0);

  energy = stepInteractionEnergy(energy, false, 100);
  assert.ok(energy < risen);

  energy = stepInteractionEnergy(energy, false, 10000);
  assert.equal(energy, 0);
});

test("tracking coasts on the last anchor inside the 300ms stale window", () => {
  const held = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [createHand()],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
  });

  const coasting = deriveHandAnchorState({
    previous: held,
    hands: [],
    nowMs: 1000 + HAND_TRACKING_STALE_MS - 1,
    dtMs: 16,
    handSourceAvailable: true,
  });

  assert.equal(coasting.phase, HAND_ANCHOR_PHASES.tracking);
  assert.deepEqual(coasting.anchorPose, held.anchorPose);
  assert.ok(coasting.confidence > 0 && coasting.confidence < 1);
  assert.equal(coasting.staleAgeMs, HAND_TRACKING_STALE_MS - 1);
});

test("camera tracking coasts longer through brief MediaPipe dropouts", () => {
  const held = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [createHand()],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  const coasting = deriveHandAnchorState({
    previous: held,
    hands: [],
    nowMs: 1000 + HAND_TRACKING_STALE_MS + 100,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(coasting.phase, HAND_ANCHOR_PHASES.tracking);
  assert.deepEqual(coasting.anchorPose, held.anchorPose);

  const released = deriveHandAnchorState({
    previous: held,
    hands: [],
    nowMs: 1000 + CAMERA_HAND_TRACKING_STALE_MS,
    dtMs: 16,
    handSourceAvailable: true,
    source: HAND_ANCHOR_SOURCES.cameraHand,
  });

  assert.equal(released.phase, HAND_ANCHOR_PHASES.ready);
  assert.equal(released.anchorPose, null);
});

test("after 300ms without tracking the anchor releases for the default pose", () => {
  const held = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [createHand()],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: true,
  });

  const released = deriveHandAnchorState({
    previous: held,
    hands: [],
    nowMs: 1000 + HAND_TRACKING_STALE_MS,
    dtMs: 16,
    handSourceAvailable: true,
  });

  assert.equal(released.phase, HAND_ANCHOR_PHASES.ready);
  assert.equal(released.anchorPose, null);
  assert.equal(released.confidence, 0);
  assert.equal(released.staleAgeMs, HAND_TRACKING_STALE_MS);
});

test("no hand source yields the unavailable state", () => {
  const state = deriveHandAnchorState({
    previous: createIdleHandAnchorState(),
    hands: [],
    nowMs: 1000,
    dtMs: 16,
    handSourceAvailable: false,
  });

  assert.equal(state.phase, HAND_ANCHOR_PHASES.unavailable);
  assert.equal(state.source, HAND_ANCHOR_SOURCES.none);
});
