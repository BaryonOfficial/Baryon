import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_VIEW_PRESETS,
  clampCameraDistance,
  getCameraConfigForPreset,
  getDefaultCameraDistanceForPreset,
  normalizeCameraDistanceOverride,
  normalizeCameraViewPreset,
  resolveCameraDistanceOverride,
} from "./cameraViewPresets.js";

test("default camera distance remains 9 for current presets", () => {
  assert.equal(
    getDefaultCameraDistanceForPreset(CAMERA_VIEW_PRESETS.topDown),
    9,
  );
  assert.equal(getDefaultCameraDistanceForPreset(CAMERA_VIEW_PRESETS.side), 9);
});

test("camera distance clamp enforces stage frustum range", () => {
  assert.equal(clampCameraDistance(0.01), 0.1);
  assert.equal(clampCameraDistance(150), 99);
  assert.equal(clampCameraDistance(9.25), 9.25);
  assert.equal(Number.isNaN(clampCameraDistance(NaN)), true);
});

test("camera override normalization keeps canonical presets and clamp semantics", () => {
  assert.equal(normalizeCameraViewPreset("top-down"), "top-down");
  assert.equal(
    normalizeCameraViewPreset("invalid", CAMERA_VIEW_PRESETS.side),
    "side",
  );
  assert.equal(normalizeCameraDistanceOverride(-2), 0.1);
  assert.equal(normalizeCameraDistanceOverride(NaN), null);
  assert.equal(
    resolveCameraDistanceOverride(CAMERA_VIEW_PRESETS.side, null),
    9,
  );
});

test("camera config preserves canonical orientation with custom distance", () => {
  const sideConfig = getCameraConfigForPreset(CAMERA_VIEW_PRESETS.side, 12.5);
  assert.deepEqual(sideConfig.up, [0, 1, 0]);
  assert.deepEqual(sideConfig.position, [0, 0, 12.5]);

  const topDownConfig = getCameraConfigForPreset(
    CAMERA_VIEW_PRESETS.topDown,
    12,
  );
  assert.equal(topDownConfig.up[2], -1);
  assert.equal(Math.abs(topDownConfig.position[1] - 12) < 0.001, true);
  assert.equal(topDownConfig.position[2] > 0, true);
});
