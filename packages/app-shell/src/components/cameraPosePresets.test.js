import { expect, test } from "vitest";

import {
  CAMERA_VIEW_PRESETS,
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_PERFORMER_CAMERA_POSE,
  DEFAULT_LIVE_PERFORMER_CAMERA_POSE,
  resolveCameraPresetMatchFromPose,
  resolveCameraPresetFromPose,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";

test("resolvePresetCameraPose returns canonical top-down and side poses", () => {
  expect(CAMERA_VIEW_PRESETS).toStrictEqual({
    topDown: "top-down",
    side: "side",
  });

  expect(resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side)).toMatchObject({
    position: { x: 0, y: 0, z: 9 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fov: 65,
  });

  expect(resolvePresetCameraPose(CAMERA_VIEW_PRESETS.topDown)).toMatchObject({
    position: {
      x: 0,
      y: 9,
      z: 0,
    },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    fov: 65,
  });
});

test("performer default poses stay aligned with shared scene defaults", () => {
  expect(DEFAULT_ACTIVE_CAMERA_POSE).toStrictEqual({
    position: { x: 5, y: 5, z: 5 },
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

test("resolveCameraPresetFromPose derives the nearest preset from the applied pose", () => {
  expect(resolveCameraPresetFromPose(resolvePresetCameraPose("top-down"))).toBe(
    "top-down",
  );
  expect(resolveCameraPresetFromPose(resolvePresetCameraPose("side"))).toBe(
    "side",
  );
  expect(
    resolveCameraPresetFromPose({
      ...resolvePresetCameraPose("top-down"),
      position: {
        x: 0,
        y: 12,
        z: 0,
      },
    }),
  ).toBe("top-down");
  expect(resolveCameraPresetFromPose(null, "side")).toBe("side");
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
