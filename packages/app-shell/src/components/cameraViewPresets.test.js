import { expect, test } from "vitest";
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
  expect(getDefaultCameraDistanceForPreset(CAMERA_VIEW_PRESETS.topDown)).toBe(
    9,
  );
  expect(getDefaultCameraDistanceForPreset(CAMERA_VIEW_PRESETS.side)).toBe(9);
});

test("camera distance clamp enforces stage frustum range", () => {
  expect(clampCameraDistance(0.01)).toBe(0.1);
  expect(clampCameraDistance(150)).toBe(99);
  expect(clampCameraDistance(9.25)).toBe(9.25);
  expect(clampCameraDistance(NaN)).toBeNaN();
});

test("camera override normalization keeps canonical presets and clamp semantics", () => {
  expect(normalizeCameraViewPreset("top-down")).toBe("top-down");
  expect(normalizeCameraViewPreset("invalid", CAMERA_VIEW_PRESETS.side)).toBe(
    "side",
  );
  expect(normalizeCameraDistanceOverride(-2)).toBe(0.1);
  expect(normalizeCameraDistanceOverride(NaN)).toBeNull();
  expect(resolveCameraDistanceOverride(CAMERA_VIEW_PRESETS.side, null)).toBe(9);
});

test("camera config preserves canonical orientation with custom distance", () => {
  const sideConfig = getCameraConfigForPreset(CAMERA_VIEW_PRESETS.side, 12.5);
  expect(sideConfig.up).toStrictEqual([0, 1, 0]);
  expect(sideConfig.position).toStrictEqual([0, 0, 12.5]);

  const topDownConfig = getCameraConfigForPreset(
    CAMERA_VIEW_PRESETS.topDown,
    12,
  );
  expect(topDownConfig.up[2]).toBe(-1);
  expect(Math.abs(topDownConfig.position[1] - 12) < 0.001).toBe(true);
  expect(topDownConfig.position[2] > 0).toBe(true);
});
