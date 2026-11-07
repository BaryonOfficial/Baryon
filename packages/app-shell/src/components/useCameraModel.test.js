// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { createCameraIntentStore } from "./cameraPolicy.js";
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
      cameraIntent: { mode: "automatic" },
    });
    expect(camera.intent).toEqual({ mode: "automatic" });
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

test("surface switches share intent while inactive adapters and readouts cannot clear or send it", async () => {
  const root = createRoot(document.createElement("div"));
  const intentStore = createCameraIntentStore();
  const onCommand = vi.fn();
  let listener, performer;
  function Harness({ performerActive, listenerLive, performerLive }) {
    listener = useCameraModel({
      intentStore,
      active: listenerLive,
      enabled: !performerActive,
      onCommand,
    });
    performer = useCameraModel({
      intentStore,
      active: performerLive,
      enabled: performerActive,
      onCommand,
    });
    return null;
  }
  const render = (props) =>
    act(async () => root.render(React.createElement(Harness, props)));
  try {
    await render({
      performerActive: false,
      listenerLive: true,
      performerLive: true,
    });
    await act(async () => listener.selectPreset("top-down"));
    onCommand.mockClear();
    await render({
      performerActive: false,
      listenerLive: true,
      performerLive: false,
    });
    expect(listener.intent).toEqual({
      mode: "explicit",
      pose: resolvePresetCameraPose("top-down"),
    });
    // The outgoing Listener can be live while the incoming Performer is idle.
    await render({
      performerActive: false,
      listenerLive: true,
      performerLive: true,
    });
    await render({
      performerActive: true,
      listenerLive: false,
      performerLive: false,
    });
    expect(performer.desiredCameraPose).toEqual(
      resolvePresetCameraPose("top-down"),
    );
    await render({
      performerActive: true,
      listenerLive: false,
      performerLive: true,
    });
    expect(performer.desiredCameraPose).toEqual(
      resolvePresetCameraPose("top-down"),
    );
    expect(onCommand).not.toHaveBeenCalled();
    await render({
      performerActive: true,
      listenerLive: false,
      performerLive: false,
    });
    expect(performer.intent).toEqual({ mode: "automatic" });
    await render({
      performerActive: false,
      listenerLive: false,
      performerLive: false,
    });
    expect(listener.desiredCameraPose).toEqual(resolvePresetCameraPose("side"));
    expect(onCommand).not.toHaveBeenCalled();
    await act(async () => listener.selectPose({}));
    expect(onCommand).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
