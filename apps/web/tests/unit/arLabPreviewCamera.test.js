import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ACTIVE_CAMERA_POSE } from "@baryon/app-shell/camera-pose-presets";
import {
  AR_LAB_PREVIEW_CAMERA,
  AR_LAB_PREVIEW_CAMERA_POSE,
  AR_LAB_PREVIEW_CAMERA_TARGET,
} from "../../src/ar-lab/arLabPreviewCamera.js";

test("AR lab preview camera uses the regular app default camera pose", () => {
  assert.equal(AR_LAB_PREVIEW_CAMERA_POSE, DEFAULT_ACTIVE_CAMERA_POSE);
  assert.deepEqual(AR_LAB_PREVIEW_CAMERA.position, [
    DEFAULT_ACTIVE_CAMERA_POSE.position.x,
    DEFAULT_ACTIVE_CAMERA_POSE.position.y,
    DEFAULT_ACTIVE_CAMERA_POSE.position.z,
  ]);
  assert.deepEqual(AR_LAB_PREVIEW_CAMERA_TARGET, [
    DEFAULT_ACTIVE_CAMERA_POSE.target.x,
    DEFAULT_ACTIVE_CAMERA_POSE.target.y,
    DEFAULT_ACTIVE_CAMERA_POSE.target.z,
  ]);
  assert.equal(AR_LAB_PREVIEW_CAMERA.fov, DEFAULT_ACTIVE_CAMERA_POSE.fov);
});
