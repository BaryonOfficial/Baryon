import { expect, test } from "vitest";

import {
  CAMERA_VIEW_PRESETS,
  DEFAULT_IDLE_PERFORMER_CAMERA_POSE,
  DEFAULT_LIVE_PERFORMER_CAMERA_POSE,
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
      y: expect.closeTo(9, 6),
      z: expect.closeTo(0.001, 6),
    },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    fov: 65,
  });
});

test("performer default poses stay aligned with idle and live presets", () => {
  expect(DEFAULT_IDLE_PERFORMER_CAMERA_POSE).toStrictEqual(
    resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side),
  );
  expect(DEFAULT_LIVE_PERFORMER_CAMERA_POSE).toStrictEqual(
    resolvePresetCameraPose(CAMERA_VIEW_PRESETS.topDown),
  );
});
