import { expect, test, vi } from "vitest";
import {
  augmentFrameStateWithCameraSync,
  applyExternalCameraPose,
  CAMERA_CONTROL_MODES,
  shouldMountOrbitControls,
} from "./baryonSceneCameraSync.js";
import { resolvePresetCameraPose } from "./cameraPosePresets.js";

test("frame state augmentation only appends the canonical camera pose", () => {
  const augmented = augmentFrameStateWithCameraSync(
    { controlsVersion: 1, status: { isPlaying: true } },
    {
      orbitControls: {
        target: { x: 4, y: 5, z: 6 },
      },
      camera: {
        position: { x: 1, y: 2, z: 3 },
        up: { x: 0, y: 1, z: 0 },
        fov: 42,
      },
    },
  );

  expect(augmented.cameraPose).toStrictEqual({
    position: { x: 1, y: 2, z: 3 },
    target: { x: 4, y: 5, z: 6 },
    up: { x: 0, y: 1, z: 0 },
    fov: 42,
  });
});

test("external-synced frame state augmentation preserves the original frame state", () => {
  const frameState = { controlsVersion: 1, status: { isPlaying: true } };
  const augmented = augmentFrameStateWithCameraSync(frameState, {
    orbitControls: { target: { x: 0, y: 0, z: 0 } },
    camera: {
      position: { x: 0, y: 9, z: 0.001 },
      up: { x: 0, y: 0, z: -1 },
      fov: 65,
    },
    cameraControlMode: CAMERA_CONTROL_MODES.externalSynced,
  });

  expect(augmented).toBe(frameState);
});

test("orbit controls only mount for preview-local camera control", () => {
  expect(shouldMountOrbitControls(CAMERA_CONTROL_MODES.previewLocal)).toBe(
    true,
  );
  expect(shouldMountOrbitControls(CAMERA_CONTROL_MODES.externalSynced)).toBe(
    false,
  );
});

test("external camera pose application updates projection and world matrices", () => {
  const controls = {
    target: { set: vi.fn() },
    update: vi.fn(),
  };
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

  expect(applyExternalCameraPose(cameraPose, camera, controls)).toBe(true);
  expect(camera.position.set).toHaveBeenCalledWith(1, 2, 3);
  expect(camera.up.set).toHaveBeenCalledWith(0, 1, 0);
  expect(camera.fov).toBe(42);
  expect(camera.lookAt).not.toHaveBeenCalled();
  expect(controls.target.set).toHaveBeenCalledWith(4, 5, 6);
  expect(controls.update).toHaveBeenCalledTimes(1);
  expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
  expect(camera.updateMatrixWorld).toHaveBeenCalledWith(true);
});

test("camera pose preset helper still produces canonical side and top-down poses", () => {
  expect(resolvePresetCameraPose("side")).toMatchObject({
    position: { x: 0, y: 0, z: 9 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: 65,
  });
  expect(resolvePresetCameraPose("top-down")).toMatchObject({
    position: {
      x: 0,
      y: expect.closeTo(9, 6),
      z: expect.closeTo(0.001, 6),
    },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    fov: 65,
  });
});
