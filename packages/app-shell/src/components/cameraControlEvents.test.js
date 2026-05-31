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
  ).toMatchObject({
    cameraPose: {
      position: { x: 0, y: 0, z: 9 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 65,
    },
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
    });
    expect(detail).toMatchObject({
      cameraPose: {
        position: {
          x: 0,
          y: 9,
          z: 0,
        },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: -1 },
        fov: 65,
      },
    });
  } finally {
    window.removeEventListener(CAMERA_CONTROL_COMMAND_EVENT, listener);
  }

  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({
    cameraPose: {
      position: {
        x: 0,
        y: 9,
        z: 0,
      },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
      fov: 65,
    },
  });
});
