import { expect, test } from "vitest";
import {
  AUTOMATIC_CAMERA_INTENT,
  resolveCameraPolicyPose,
} from "./cameraPolicy.js";
import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_CAMERA_POSE,
  resolvePresetCameraPose,
} from "./cameraPosePresets.js";

test.each([false, true])(
  "automatic intent follows current activity (active: %s)",
  (active) => {
    expect(
      resolveCameraPolicyPose({ intent: AUTOMATIC_CAMERA_INTENT, active }),
    ).toEqual(active ? DEFAULT_ACTIVE_CAMERA_POSE : DEFAULT_IDLE_CAMERA_POSE);
  },
);
test.each([false, true])(
  "explicit intent overrides activity and automatic framing (active: %s)",
  (active) => {
    const pose = resolvePresetCameraPose("top-down");
    expect(
      resolveCameraPolicyPose(
        { intent: { mode: "explicit", pose }, active },
        { distanceScale: 2 },
      ),
    ).toBe(pose);
  },
);
test("automatic framing scales distance without changing direction", () => {
  for (const active of [false, true]) {
    const state = { intent: AUTOMATIC_CAMERA_INTENT, active };
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
