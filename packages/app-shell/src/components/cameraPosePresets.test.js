import { expect, test } from "vitest";

import {
  CAMERA_VIEW_PRESETS,
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_PERFORMER_CAMERA_POSE,
  DEFAULT_LIVE_PERFORMER_CAMERA_POSE,
  MOBILE_DEMO_CAMERA_DISTANCE_SCALE,
  normalizeCameraCoordinateForDisplay,
  resolveCameraPresetMatchFromPose,
  resolvePresetCameraPose,
  scaleCameraPoseDistance,
} from "./cameraPosePresets.js";

function distanceOf(pose) {
  return Math.hypot(pose.position.x, pose.position.y, pose.position.z);
}

test("camera display coordinates stabilize values that round to zero", () => {
  expect(normalizeCameraCoordinateForDisplay(-0)).toBe(0);
  expect(normalizeCameraCoordinateForDisplay(-0.0049)).toBe(0);
  expect(normalizeCameraCoordinateForDisplay(0.0049)).toBe(0);
  expect(normalizeCameraCoordinateForDisplay(-0.0051)).toBe(-0.0051);
  expect(normalizeCameraCoordinateForDisplay(0.0051)).toBe(0.0051);
});

test("scaleCameraPoseDistance pulls every resolved pose back by one factor", () => {
  const scale = 1.4;
  // A surface that reframes for a small viewport must move the idle pose, the
  // active pose and both presets together: if any one keeps the canonical
  // distance, switching to it jumps the framing.
  const poses = [
    DEFAULT_IDLE_PERFORMER_CAMERA_POSE,
    DEFAULT_ACTIVE_CAMERA_POSE,
    resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side),
    resolvePresetCameraPose(CAMERA_VIEW_PRESETS.topDown),
  ];

  for (const pose of poses) {
    const scaled = scaleCameraPoseDistance(pose, scale);
    expect(distanceOf(scaled)).toBeCloseTo(distanceOf(pose) * scale, 10);
    // Pulling back must not rotate the view.
    expect(resolveCameraPresetMatchFromPose(scaled)).toBe(
      resolveCameraPresetMatchFromPose(pose),
    );
    expect(scaled.up).toEqual(pose.up);
    expect(scaled.target).toEqual(pose.target);
  }
});

test("scaleCameraPoseDistance is identity at unit scale", () => {
  const pose = resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side);
  expect(scaleCameraPoseDistance(pose, 1)).toBe(pose);
});

test("mobile framing preserves the calibrated compact-viewport distance", () => {
  const mobilePose = scaleCameraPoseDistance(
    DEFAULT_ACTIVE_CAMERA_POSE,
    MOBILE_DEMO_CAMERA_DISTANCE_SCALE,
  );

  expect(MOBILE_DEMO_CAMERA_DISTANCE_SCALE).toBeCloseTo(14 / 9, 10);
  expect(distanceOf(mobilePose)).toBeCloseTo(Math.hypot(7, 7, 7), 10);
});

test("resolvePresetCameraPose returns canonical top-down and side poses", () => {
  expect(CAMERA_VIEW_PRESETS).toStrictEqual({
    topDown: "top-down",
    side: "side",
  });

  expect(resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side)).toMatchObject({
    position: { x: 0, y: 0, z: Math.hypot(4.5, 4.5, 4.5) },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: 65,
  });

  expect(resolvePresetCameraPose(CAMERA_VIEW_PRESETS.topDown)).toMatchObject({
    position: {
      x: 0,
      y: Math.hypot(4.5, 4.5, 4.5),
      z: 0,
    },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    fov: 65,
  });
});

test("performer default poses stay aligned with shared scene defaults", () => {
  expect(DEFAULT_ACTIVE_CAMERA_POSE).toStrictEqual({
    position: { x: 4.5, y: 4.5, z: 4.5 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: 65,
  });
  expect(DEFAULT_IDLE_PERFORMER_CAMERA_POSE).toStrictEqual(
    resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side),
  );
  expect(DEFAULT_LIVE_PERFORMER_CAMERA_POSE).toStrictEqual(
    DEFAULT_ACTIVE_CAMERA_POSE,
  );
});

test("resolveCameraPresetMatchFromPose only returns exact preset views", () => {
  expect(
    resolveCameraPresetMatchFromPose(resolvePresetCameraPose("top-down")),
  ).toBe("top-down");
  expect(
    resolveCameraPresetMatchFromPose({
      ...resolvePresetCameraPose("top-down"),
      position: {
        x: 0,
        y: 12,
        z: 0,
      },
    }),
  ).toBe("top-down");
  expect(
    resolveCameraPresetMatchFromPose(resolvePresetCameraPose("side")),
  ).toBe("side");
  expect(
    resolveCameraPresetMatchFromPose({
      ...resolvePresetCameraPose("side"),
      position: {
        x: 1.5,
        y: 1,
        z: 8.8,
      },
    }),
  ).toBeNull();
});
