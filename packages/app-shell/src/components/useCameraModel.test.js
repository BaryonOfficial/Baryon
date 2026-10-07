// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { useCameraModel } from "./useCameraModel.js";
import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";

test("shared camera lifecycle never turns activity or rerenders into outgoing commands", async () => {
  const root = createRoot(document.createElement("div"));
  const onCommand = vi.fn();
  let camera;
  function Harness({ active }) {
    camera = useCameraModel({ active, onCommand });
    return null;
  }
  const render = (active) =>
    act(async () => root.render(React.createElement(Harness, { active })));
  try {
    await render(false);
    expect(camera.desiredCameraPose).toEqual(resolvePresetCameraPose("side"));
    await act(async () => camera.resetCamera());
    expect(onCommand).toHaveBeenLastCalledWith({
      cameraPose: resolvePresetCameraPose("side"),
      cameraReset: true,
    });
    expect(camera.explicitPose).toBeNull();
    onCommand.mockClear();
    await render(true);
    await render(true);
    expect(camera.desiredCameraPose).toEqual(DEFAULT_ACTIVE_CAMERA_POSE);
    expect(onCommand).not.toHaveBeenCalled();
    await act(async () => camera.selectPreset("top-down"));
    await render(true);
    expect(camera.desiredCameraPose).toEqual(
      resolvePresetCameraPose("top-down"),
    );
    onCommand.mockClear();
    await render(false);
    expect(camera.desiredCameraPose).toEqual(resolvePresetCameraPose("side"));
    await render(true);
    expect(camera.desiredCameraPose).toEqual(DEFAULT_ACTIVE_CAMERA_POSE);
    expect(onCommand).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
