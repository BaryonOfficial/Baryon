import { describe, expect, test } from "vitest";

import { DEFAULT_ACTIVE_CAMERA_POSE } from "./cameraPosePresets.js";
import {
  CAMERA_ORBIT_AXES,
  applyCameraOrbitAxisValue,
  interpolateCameraOrbitPose,
  normalizeCameraOrbitCommand,
  readCameraOrbitState,
} from "./cameraOrbitModel.js";

describe("cameraOrbitModel", () => {
  test("projects the active camera pose into semantic orbit coordinates", () => {
    expect(readCameraOrbitState(DEFAULT_ACTIVE_CAMERA_POSE)).toMatchObject({
      azimuth: 45,
      elevation: 35.264389682754654,
      distance: Math.hypot(4.5, 4.5, 4.5),
    });
  });

  test("changes one orbit axis without moving the target or changing the lens", () => {
    const pose = applyCameraOrbitAxisValue(
      DEFAULT_ACTIVE_CAMERA_POSE,
      CAMERA_ORBIT_AXES.azimuth,
      -90,
    );

    expect(pose).toMatchObject({
      target: DEFAULT_ACTIVE_CAMERA_POSE.target,
      up: DEFAULT_ACTIVE_CAMERA_POSE.up,
      fov: DEFAULT_ACTIVE_CAMERA_POSE.fov,
    });
    expect(readCameraOrbitState(pose)).toMatchObject({
      azimuth: -90,
      elevation: 35.264389682754654,
      distance: Math.hypot(4.5, 4.5, 4.5),
    });
  });

  test("clamps elevation and distance to safe performer ranges", () => {
    const elevated = applyCameraOrbitAxisValue(
      DEFAULT_ACTIVE_CAMERA_POSE,
      CAMERA_ORBIT_AXES.elevation,
      100,
    );
    const near = applyCameraOrbitAxisValue(
      DEFAULT_ACTIVE_CAMERA_POSE,
      CAMERA_ORBIT_AXES.distance,
      0,
    );

    expect(readCameraOrbitState(elevated).elevation).toBeCloseTo(85, 10);
    expect(readCameraOrbitState(near).distance).toBeCloseTo(2, 10);
  });

  test("normalizes one canonical orbit command shape", () => {
    expect(
      normalizeCameraOrbitCommand({
        axis: "elevation",
        value: 120,
        transport: "midi",
      }),
    ).toStrictEqual({ axis: "elevation", value: 85, transport: "midi" });
    expect(
      normalizeCameraOrbitCommand({ axis: "roll", value: 10 }),
    ).toBeNull();
  });

  test("interpolates azimuth across the shortest arc", () => {
    const start = applyCameraOrbitAxisValue(
      DEFAULT_ACTIVE_CAMERA_POSE,
      CAMERA_ORBIT_AXES.azimuth,
      170,
    );
    const end = applyCameraOrbitAxisValue(
      start,
      CAMERA_ORBIT_AXES.azimuth,
      -170,
    );

    const halfway = interpolateCameraOrbitPose(start, end, 0.5);
    expect(Math.abs(readCameraOrbitState(halfway).azimuth)).toBeCloseTo(
      180,
      10,
    );
  });
});
