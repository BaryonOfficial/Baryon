import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_HAND_LANDMARK_INDICES,
  createCameraHandSnapshots,
} from "../../src/ar-lab/cameraHandLandmarks.js";
import {
  REQUIRED_HAND_JOINTS,
  isCompleteHandSnapshot,
} from "../../src/ar-lab/handAnchor.js";

function createLandmarks() {
  return Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

test("converts MediaPipe landmarks into a complete mirrored camera hand snapshot", () => {
  const landmarks = createLandmarks();
  landmarks[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.25,
    y: 0.5,
    z: 0,
  };
  landmarks[CAMERA_HAND_LANDMARK_INDICES["index-finger-tip"]] = {
    x: 0.48,
    y: 0.42,
    z: -0.02,
  };
  landmarks[CAMERA_HAND_LANDMARK_INDICES["thumb-tip"]] = {
    x: 0.49,
    y: 0.43,
    z: -0.02,
  };

  const [snapshot] = createCameraHandSnapshots({
    landmarks: [landmarks],
    handednesses: [[{ categoryName: "Left" }]],
  });

  assert.ok(snapshot);
  assert.equal(snapshot.handedness, "left");
  assert.equal(isCompleteHandSnapshot(snapshot), true);
  assert.ok(snapshot.metrics.apparentHandSpan > 0);
  assert.ok(snapshot.joints.wrist.position.x > 0);
  assert.ok(snapshot.joints.wrist.position.z < 0);
  for (const jointName of REQUIRED_HAND_JOINTS) {
    assert.ok(Number.isFinite(snapshot.joints[jointName].position.x));
    assert.ok(Number.isFinite(snapshot.joints[jointName].position.y));
    assert.ok(Number.isFinite(snapshot.joints[jointName].position.z));
  }
  for (const jointName of [
    "index-finger-metacarpal",
    "ring-finger-metacarpal",
    "pinky-finger-metacarpal",
    "middle-finger-tip",
  ]) {
    assert.ok(Number.isFinite(snapshot.joints[jointName].position.x));
    assert.ok(Number.isFinite(snapshot.joints[jointName].position.y));
    assert.ok(Number.isFinite(snapshot.joints[jointName].position.z));
  }
});

test("drops incomplete MediaPipe hands before they reach anchor math", () => {
  const landmarks = createLandmarks();
  landmarks[CAMERA_HAND_LANDMARK_INDICES["thumb-tip"]] = {
    x: 0.5,
    y: 0.5,
    z: Number.NaN,
  };

  assert.deepEqual(
    createCameraHandSnapshots({
      landmarks: [landmarks],
      handednesses: [[{ categoryName: "Right" }]],
    }),
    [],
  );
});

test("keeps noisy MediaPipe depth on a stable camera play plane", () => {
  const nearLandmarks = createLandmarks();
  nearLandmarks[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.5,
    y: 0.5,
    z: 20,
  };
  const farLandmarks = createLandmarks();
  farLandmarks[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.5,
    y: 0.5,
    z: -20,
  };

  const [nearSnapshot] = createCameraHandSnapshots({
    landmarks: [nearLandmarks],
    handednesses: [[{ categoryName: "Right" }]],
  });
  const [farSnapshot] = createCameraHandSnapshots({
    landmarks: [farLandmarks],
    handednesses: [[{ categoryName: "Right" }]],
  });

  const dx =
    nearSnapshot.joints.wrist.position.x - farSnapshot.joints.wrist.position.x;
  const dy =
    nearSnapshot.joints.wrist.position.y - farSnapshot.joints.wrist.position.y;
  const dz =
    nearSnapshot.joints.wrist.position.z - farSnapshot.joints.wrist.position.z;
  const depthRange = Math.hypot(dx, dy, dz);

  assert.ok(depthRange <= 0.061);
});

test("projects mirrored camera landmarks through the AR lab preview camera", () => {
  const leftSide = createLandmarks();
  leftSide[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.75,
    y: 0.5,
    z: 0,
  };
  const rightSide = createLandmarks();
  rightSide[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.25,
    y: 0.5,
    z: 0,
  };

  const [leftSnapshot] = createCameraHandSnapshots({ landmarks: [leftSide] });
  const [rightSnapshot] = createCameraHandSnapshots({ landmarks: [rightSide] });

  assert.ok(leftSnapshot.joints.wrist.position.x < 0);
  assert.ok(rightSnapshot.joints.wrist.position.x > 0);
});

test("derives camera hand roll from the wrist-to-finger axis", () => {
  const upright = createLandmarks();
  upright[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.5,
    y: 0.6,
    z: 0,
  };
  upright[CAMERA_HAND_LANDMARK_INDICES["middle-finger-metacarpal"]] = {
    x: 0.5,
    y: 0.4,
    z: 0,
  };

  const rolled = createLandmarks();
  rolled[CAMERA_HAND_LANDMARK_INDICES.wrist] = {
    x: 0.5,
    y: 0.6,
    z: 0,
  };
  rolled[CAMERA_HAND_LANDMARK_INDICES["middle-finger-metacarpal"]] = {
    x: 0.35,
    y: 0.45,
    z: 0,
  };

  const [uprightSnapshot] = createCameraHandSnapshots({
    landmarks: [upright],
  });
  const [rolledSnapshot] = createCameraHandSnapshots({
    landmarks: [rolled],
  });

  assert.ok(Math.abs(uprightSnapshot.joints.wrist.quaternion.z) < 1e-9);
  assert.ok(Math.abs(uprightSnapshot.joints.wrist.quaternion.w - 1) < 1e-9);
  assert.ok(Math.abs(rolledSnapshot.joints.wrist.quaternion.z) > 0.2);
  assert.ok(rolledSnapshot.joints.wrist.quaternion.w < 1);
});
