// @vitest-environment jsdom

import { expect, test } from "vitest";
import {
  CAMERA_CONTROL_COMMAND_EVENT,
  createCameraControlCommand,
  dispatchCameraControlCommand,
} from "./cameraControlEvents.js";

test("camera control command normalizes preset and default distance", () => {
  expect(
    createCameraControlCommand({
      cameraViewPreset: "side",
    }),
  ).toStrictEqual({
    cameraViewPreset: "side",
    cameraDistance: 9,
  });
});

test("camera control command rejects invalid presets", () => {
  expect(
    createCameraControlCommand({
      cameraViewPreset: "invalid",
    }),
  ).toBeNull();
});

test("dispatchCameraControlCommand emits the normalized camera detail", () => {
  const received = [];
  const listener = (event) => {
    received.push(event.detail);
  };

  window.addEventListener(CAMERA_CONTROL_COMMAND_EVENT, listener);
  try {
    const detail = dispatchCameraControlCommand({
      cameraViewPreset: "top-down",
      cameraDistance: 11.25,
    });
    expect(detail).toStrictEqual({
      cameraViewPreset: "top-down",
      cameraDistance: 11.25,
    });
  } finally {
    window.removeEventListener(CAMERA_CONTROL_COMMAND_EVENT, listener);
  }

  expect(received).toStrictEqual([
    {
      cameraViewPreset: "top-down",
      cameraDistance: 11.25,
    },
  ]);
});
