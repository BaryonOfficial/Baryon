import { expect, test, vi } from "vitest";
import {
  augmentFrameStateWithCameraSync,
  applyExternalCameraPose,
  CAMERA_CONTROL_MODES,
  resolveAppliedCameraState,
  resolveCameraDistanceForExport,
  resolveRenderedCameraViewPreset,
  shouldMountOrbitControls,
} from "./baryonSceneCameraSync.js";

test("rendered preset follows cymatics override and otherwise preserves prop", () => {
  expect(resolveRenderedCameraViewPreset("cymatics-2d", "top-down")).toBe(
    "side",
  );
  expect(resolveRenderedCameraViewPreset("raymarch", "top-down")).toBe(
    "top-down",
  );
});

test("camera distance export uses controls distance, then camera length, then preset default", () => {
  expect(
    resolveCameraDistanceForExport({
      orbitControls: { getDistance: () => 8.25 },
      camera: { position: { length: () => 12 } },
      cameraViewPreset: "top-down",
    }),
  ).toBe(8.25);

  expect(
    resolveCameraDistanceForExport({
      orbitControls: { getDistance: () => NaN },
      camera: { position: { length: () => 6.5 } },
      cameraViewPreset: "top-down",
    }),
  ).toBe(6.5);

  expect(
    resolveCameraDistanceForExport({
      orbitControls: { getDistance: () => 0 },
      camera: { position: { length: () => 0 } },
      cameraViewPreset: "side",
    }),
  ).toBe(9);
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

  expect(augmented.cameraViewPreset).toBe("top-down");
  expect(augmented.cameraDistance).toBe(7.125);
  expect("quaternion" in augmented).toBe(false);
  expect("target" in augmented).toBe(false);
  expect("position" in augmented).toBe(false);
});

test("external-synced frame state augmentation preserves the original frame state", () => {
  const frameState = { controlsVersion: 1, status: { isPlaying: true } };
  const augmented = augmentFrameStateWithCameraSync(frameState, {
    visualizationMethod: "raymarch",
    cameraViewPreset: "top-down",
    orbitControls: { getDistance: () => 7.125 },
    camera: { position: { length: () => 10 } },
    cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
  });

  expect(augmented).toBe(frameState);
});

test("applied camera state respects external sync and cymatics override ordering", () => {
  expect(
    resolveAppliedCameraState({
      visualizationMethod: "raymarch",
      cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
      cameraViewPreset: "top-down",
      cameraDistance: 11,
    }),
  ).toStrictEqual({ preset: "top-down", distance: 11 });

  expect(
    resolveAppliedCameraState({
      visualizationMethod: "cymatics-2d",
      cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
      cameraViewPreset: "top-down",
      cameraDistance: 11,
    }),
  ).toStrictEqual({ preset: "side", distance: 11 });

  expect(
    resolveAppliedCameraState({
      visualizationMethod: "raymarch",
      cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
      cameraViewPreset: "side",
      cameraDistance: -2,
    }),
  ).toStrictEqual({ preset: "side", distance: 0.1 });

  expect(
    shouldMountOrbitControls("raymarch", CAMERA_CONTROL_MODES.previewLocal),
  ).toBe(true);
  expect(
    shouldMountOrbitControls("raymarch", CAMERA_CONTROL_MODES.externalSynced),
  ).toBe(false);
});

test("external camera pose application updates projection and world matrices", () => {
  const camera = {
    position: { set: vi.fn() },
    up: { set: vi.fn() },
    fov: 65,
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
    updateMatrixWorld: vi.fn(),
  };
  const cameraPose = {
    position: { x: 1, y: 2, z: 3 },
    target: { x: 4, y: 5, z: 6 },
    up: { x: 0, y: 1, z: 0 },
    fov: 42,
  };

  expect(applyExternalCameraPose(cameraPose, camera)).toBe(true);
  expect(camera.position.set).toHaveBeenCalledWith(1, 2, 3);
  expect(camera.up.set).toHaveBeenCalledWith(0, 1, 0);
  expect(camera.fov).toBe(42);
  expect(camera.lookAt).toHaveBeenCalledWith(4, 5, 6);
  expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
  expect(camera.updateMatrixWorld).toHaveBeenCalledWith(true);
});
