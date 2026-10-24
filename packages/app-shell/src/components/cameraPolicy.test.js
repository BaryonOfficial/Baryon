import { expect, test } from "vitest";
import {
  createCameraPolicyState,
  reduceCameraPolicy,
  resolveCameraPolicyPose,
} from "./cameraPolicy.js";
import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";

test.each([false, true])(
  "reset restores the current default and clears intent (active: %s)",
  (active) => {
    let state = createCameraPolicyState(active);
    state = reduceCameraPolicy(state, {
      type: "pose",
      pose: resolvePresetCameraPose("top-down"),
      reapply: true,
    });
    state = reduceCameraPolicy(state, { type: "reset", reapply: true });
    expect(state.explicitPose).toBeNull();
    expect(resolveCameraPolicyPose(state)).toEqual(
      active ? DEFAULT_ACTIVE_CAMERA_POSE : resolvePresetCameraPose("side"),
    );
  },
);

test("idle to active to idle follows shared defaults without inventing intent", () => {
  let state = createCameraPolicyState();
  expect(resolveCameraPolicyPose(state)).toEqual(
    resolvePresetCameraPose("side"),
  );
  state = reduceCameraPolicy(state, { type: "activity", active: true });
  expect(resolveCameraPolicyPose(state)).toEqual(DEFAULT_ACTIVE_CAMERA_POSE);
  state = reduceCameraPolicy(state, { type: "activity", active: false });
  expect(resolveCameraPolicyPose(state)).toEqual(
    resolvePresetCameraPose("side"),
  );
  expect(state.explicitPose).toBeNull();
});

test("explicit choices survive activation but stopping clears them for the next session", () => {
  const pose = resolvePresetCameraPose("top-down");
  let state = reduceCameraPolicy(createCameraPolicyState(), {
    type: "pose",
    pose,
  });
  state = reduceCameraPolicy(state, { type: "activity", active: true });
  expect(resolveCameraPolicyPose(state)).toBe(pose);
  expect(reduceCameraPolicy(state, { type: "activity", active: true })).toBe(
    state,
  );
  state = reduceCameraPolicy(state, { type: "activity", active: false });
  state = reduceCameraPolicy(state, { type: "activity", active: true });
  expect(resolveCameraPolicyPose(state)).toEqual(DEFAULT_ACTIVE_CAMERA_POSE);
});

test("resetting the idle camera does not pin the next active view to side", () => {
  let state = reduceCameraPolicy(createCameraPolicyState(), {
    type: "reset",
    reapply: true,
  });
  state = reduceCameraPolicy(state, { type: "activity", active: true });
  expect(resolveCameraPolicyPose(state)).toEqual(DEFAULT_ACTIVE_CAMERA_POSE);
});

test("framing changes distance without changing the idle or active direction", () => {
  for (const active of [false, true]) {
    const state = createCameraPolicyState(active);
    const canonical = resolveCameraPolicyPose(state);
    const scaled = resolveCameraPolicyPose(state, { distanceScale: 2 });
    expect(scaled.position).toEqual(
      Object.fromEntries(
        Object.entries(canonical.position).map(([key, value]) => [
          key,
          value * 2,
        ]),
      ),
    );
    expect(scaled.up).toEqual(canonical.up);
    expect(scaled.target).toEqual(canonical.target);
  }
});
