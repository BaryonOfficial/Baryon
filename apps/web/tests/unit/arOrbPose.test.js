import test from "node:test";
import assert from "node:assert/strict";
import {
  AR_ORB_BASE_SCALE,
  CAMERA_HAND_POSE_EASE_HALF_LIFE_SECONDS,
  DEFAULT_POSE_EASE_HALF_LIFE_SECONDS,
  DEFAULT_AR_ORB_POSE,
  resolveOrbPoseEaseHalfLifeSeconds,
  resolveOrbTargetPose,
  resolvePoseEaseAlpha,
  resolvePoseEaseAlphaForHalfLife,
  stepOrbPoseToward,
} from "../../src/ar-lab/arOrbPose.js";
import {
  HAND_ANCHOR_PHASES,
  HAND_ANCHOR_SOURCES,
  createIdleHandAnchorState,
} from "../../src/ar-lab/handAnchor.js";

const HELD_POSE = {
  position: { x: 0.1, y: 1.05, z: -0.42 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  scale: 1.4,
};

test("orb base scale matches the regular web app world scale", () => {
  assert.equal(AR_ORB_BASE_SCALE, 1);
});

test("webcam idle pose starts at the regular app scene origin", () => {
  assert.deepEqual(DEFAULT_AR_ORB_POSE.position, { x: 0, y: 0, z: 0 });
});

test("orb targets the anchor pose while holding or coasting", () => {
  const holding = {
    ...createIdleHandAnchorState(),
    phase: HAND_ANCHOR_PHASES.holding,
    anchorPose: HELD_POSE,
  };
  assert.equal(resolveOrbTargetPose(holding), HELD_POSE);

  const tracking = { ...holding, phase: HAND_ANCHOR_PHASES.tracking };
  assert.equal(resolveOrbTargetPose(tracking), HELD_POSE);
});

test("orb eases back to the default AR pose when the anchor releases", () => {
  assert.equal(
    resolveOrbTargetPose(createIdleHandAnchorState()),
    DEFAULT_AR_ORB_POSE,
  );
  assert.equal(
    resolveOrbTargetPose({
      ...createIdleHandAnchorState(),
      phase: HAND_ANCHOR_PHASES.ready,
    }),
    DEFAULT_AR_ORB_POSE,
  );
  assert.equal(resolveOrbTargetPose(null), DEFAULT_AR_ORB_POSE);
});

test("pose easing converges toward the target and stays normalized", () => {
  let pose = {
    position: { ...DEFAULT_AR_ORB_POSE.position },
    quaternion: { ...DEFAULT_AR_ORB_POSE.quaternion },
    scale: DEFAULT_AR_ORB_POSE.scale,
  };
  const target = {
    position: { x: 0.2, y: 1, z: -0.3 },
    quaternion: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
    scale: 2,
  };

  const initialDistance = Math.abs(pose.position.x - target.position.x);
  for (let step = 0; step < 120; step += 1) {
    pose = stepOrbPoseToward(pose, target, 1 / 60);
  }

  assert.ok(
    Math.abs(pose.position.x - target.position.x) < initialDistance / 100,
  );
  assert.ok(Math.abs(pose.scale - target.scale) < 0.01);
  const quaternionLength = Math.sqrt(
    pose.quaternion.x ** 2 +
      pose.quaternion.y ** 2 +
      pose.quaternion.z ** 2 +
      pose.quaternion.w ** 2,
  );
  assert.ok(Math.abs(quaternionLength - 1) < 1e-9);
});

test("pose easing is inert for zero or invalid deltas", () => {
  assert.equal(resolvePoseEaseAlpha(0), 0);
  assert.equal(resolvePoseEaseAlpha(Number.NaN), 0);

  const pose = {
    position: { x: 1, y: 2, z: 3 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    scale: 1,
  };
  const stepped = stepOrbPoseToward(pose, DEFAULT_AR_ORB_POSE, 0);
  assert.deepEqual(stepped.position, pose.position);
  assert.equal(stepped.scale, pose.scale);
});

test("camera hand pose easing uses a faster half-life than the default lane", () => {
  const cameraHolding = {
    ...createIdleHandAnchorState(),
    source: HAND_ANCHOR_SOURCES.cameraHand,
    phase: HAND_ANCHOR_PHASES.holding,
    anchorPose: HELD_POSE,
  };

  assert.equal(
    resolveOrbPoseEaseHalfLifeSeconds(cameraHolding),
    CAMERA_HAND_POSE_EASE_HALF_LIFE_SECONDS,
  );
  assert.equal(
    resolveOrbPoseEaseHalfLifeSeconds(createIdleHandAnchorState()),
    DEFAULT_POSE_EASE_HALF_LIFE_SECONDS,
  );
  assert.ok(
    resolvePoseEaseAlphaForHalfLife(
      1 / 60,
      CAMERA_HAND_POSE_EASE_HALF_LIFE_SECONDS,
    ) >
      resolvePoseEaseAlphaForHalfLife(
        1 / 60,
        DEFAULT_POSE_EASE_HALF_LIFE_SECONDS,
      ),
  );
});
