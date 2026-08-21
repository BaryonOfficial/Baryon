// @vitest-environment jsdom

import { expect, test } from "vitest";
import {
  CAMERA_CONTROL_COMMAND_EVENT,
  createCameraControlCommand,
  dispatchCameraControlCommand,
} from "./cameraControlEvents.js";
import {
  CAMERA_VIEW_PRESETS,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";

test("camera control command normalizes preset and default distance", () => {
  expect(
    createCameraControlCommand({
      cameraViewPreset: "side",
    }),
  ).toStrictEqual({
    cameraPose: resolvePresetCameraPose(CAMERA_VIEW_PRESETS.side),
  });
});

test("camera control command rejects invalid presets", () => {
  expect(
    createCameraControlCommand({
      cameraViewPreset: "invalid",
    }),
  ).toBeNull();
});

test("camera control command accepts a semantic orbit axis", () => {
  expect(
    createCameraControlCommand({
      cameraOrbit: { axis: "elevation", value: 120, transport: "midi" },
    }),
  ).toEqual({
    cameraOrbit: { axis: "elevation", value: 85, transport: "midi" },
  });
  expect(
    createCameraControlCommand({
      cameraOrbit: { axis: "roll", value: 10 },
    }),
  ).toBeNull();
});

test("dispatchCameraControlCommand emits the normalized camera detail", () => {
  const received = [];
  const expectedDetail = {
    cameraPose: resolvePresetCameraPose(CAMERA_VIEW_PRESETS.topDown),
  };
  const listener = (event) => {
    received.push(event.detail);
  };

  window.addEventListener(CAMERA_CONTROL_COMMAND_EVENT, listener);
  try {
    const detail = dispatchCameraControlCommand({
      cameraViewPreset: "top-down",
    });
    expect(detail).toStrictEqual(expectedDetail);
  } finally {
    window.removeEventListener(CAMERA_CONTROL_COMMAND_EVENT, listener);
  }

  expect(received).toHaveLength(1);
  expect(received[0]).toStrictEqual(expectedDetail);
});
