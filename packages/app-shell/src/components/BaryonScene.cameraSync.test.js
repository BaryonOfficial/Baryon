import assert from "node:assert/strict";
import test from "node:test";
import {
  augmentFrameStateWithCameraSync,
  CAMERA_CONTROL_MODES,
  resolveAppliedCameraState,
  resolveCameraDistanceForExport,
  resolveRenderedCameraViewPreset,
  shouldMountOrbitControls,
} from "./baryonSceneCameraSync.js";

test("rendered preset follows cymatics override and otherwise preserves prop", () => {
  assert.equal(
    resolveRenderedCameraViewPreset("cymatics-2d", "top-down"),
    "side",
  );
  assert.equal(
    resolveRenderedCameraViewPreset("raymarch", "top-down"),
    "top-down",
  );
});

test("camera distance export uses controls distance, then camera length, then preset default", () => {
  assert.equal(
    resolveCameraDistanceForExport({
      orbitControls: { getDistance: () => 8.25 },
      camera: { position: { length: () => 12 } },
      cameraViewPreset: "top-down",
    }),
    8.25,
  );

  assert.equal(
    resolveCameraDistanceForExport({
      orbitControls: { getDistance: () => NaN },
      camera: { position: { length: () => 6.5 } },
      cameraViewPreset: "top-down",
    }),
    6.5,
  );

  assert.equal(
    resolveCameraDistanceForExport({
      orbitControls: { getDistance: () => 0 },
      camera: { position: { length: () => 0 } },
      cameraViewPreset: "side",
    }),
    9,
  );
});

test("frame state augmentation only appends synced preset and distance", () => {
  const augmented = augmentFrameStateWithCameraSync(
    { controlsVersion: 1, status: { isPlaying: true } },
    {
      visualizationMethod: "raymarch",
      cameraViewPreset: "top-down",
      orbitControls: { getDistance: () => 7.125 },
      camera: { position: { length: () => 10 } },
    },
  );

  assert.equal(augmented.cameraViewPreset, "top-down");
  assert.equal(augmented.cameraDistance, 7.125);
  assert.equal("quaternion" in augmented, false);
  assert.equal("target" in augmented, false);
  assert.equal("position" in augmented, false);
});

test("applied camera state respects external sync and cymatics override ordering", () => {
  assert.deepEqual(
    resolveAppliedCameraState({
      visualizationMethod: "raymarch",
      cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
      cameraViewPreset: "top-down",
      cameraDistance: 11,
    }),
    { preset: "top-down", distance: 11 },
  );

  assert.deepEqual(
    resolveAppliedCameraState({
      visualizationMethod: "cymatics-2d",
      cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
      cameraViewPreset: "top-down",
      cameraDistance: 11,
    }),
    { preset: "side", distance: 11 },
  );

  assert.deepEqual(
    resolveAppliedCameraState({
      visualizationMethod: "raymarch",
      cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
      cameraViewPreset: "side",
      cameraDistance: -2,
    }),
    { preset: "side", distance: 0.1 },
  );

  assert.equal(
    shouldMountOrbitControls("raymarch", CAMERA_CONTROL_MODES.previewLocal),
    true,
  );
  assert.equal(
    shouldMountOrbitControls("raymarch", CAMERA_CONTROL_MODES.externalSynced),
    false,
  );
});
