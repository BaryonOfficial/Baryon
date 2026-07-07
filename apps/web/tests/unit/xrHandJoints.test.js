import test from "node:test";
import assert from "node:assert/strict";
import { readHandJointSnapshot } from "../../src/ar-lab/xrHandJoints.js";
import {
  REQUIRED_HAND_JOINTS,
  isCompleteHandSnapshot,
} from "../../src/ar-lab/handAnchor.js";

function createFakeXr({ missingJoint = null } = {}) {
  const referenceSpace = { kind: "local-floor" };
  const jointSpaces = new Map(
    REQUIRED_HAND_JOINTS.map((jointName) => [jointName, { jointName }]),
  );
  const frame = {
    getJointPose(jointSpace) {
      if (jointSpace.jointName === missingJoint) {
        return null;
      }
      return {
        transform: {
          position: { x: 0.1, y: 1.2, z: -0.4 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      };
    },
  };
  const inputSource = {
    handedness: "left",
    hand: { get: (jointName) => jointSpaces.get(jointName) ?? null },
  };
  return { frame, referenceSpace, inputSource };
}

test("reads a complete hand snapshot from XR joint poses", () => {
  const { frame, referenceSpace, inputSource } = createFakeXr();
  const snapshot = readHandJointSnapshot(frame, referenceSpace, inputSource);

  assert.ok(snapshot);
  assert.equal(snapshot.handedness, "left");
  assert.equal(isCompleteHandSnapshot(snapshot), true);
  for (const jointName of REQUIRED_HAND_JOINTS) {
    assert.deepEqual(snapshot.joints[jointName].position, {
      x: 0.1,
      y: 1.2,
      z: -0.4,
    });
  }
});

test("fails closed when any required joint pose is missing", () => {
  const { frame, referenceSpace, inputSource } = createFakeXr({
    missingJoint: "thumb-tip",
  });
  assert.equal(readHandJointSnapshot(frame, referenceSpace, inputSource), null);
});

test("fails closed without a frame, reference space, hand, or handedness", () => {
  const { frame, referenceSpace, inputSource } = createFakeXr();

  assert.equal(readHandJointSnapshot(null, referenceSpace, inputSource), null);
  assert.equal(readHandJointSnapshot(frame, null, inputSource), null);
  assert.equal(readHandJointSnapshot(frame, referenceSpace, null), null);
  assert.equal(
    readHandJointSnapshot(frame, referenceSpace, {
      ...inputSource,
      hand: null,
    }),
    null,
  );
  assert.equal(
    readHandJointSnapshot(frame, referenceSpace, {
      ...inputSource,
      handedness: "none",
    }),
    null,
  );
});
