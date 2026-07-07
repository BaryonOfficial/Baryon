import { DEFAULT_ACTIVE_CAMERA_POSE } from "@baryon/app-shell/camera-pose-presets";

export const AR_LAB_PREVIEW_CAMERA_POSE = DEFAULT_ACTIVE_CAMERA_POSE;

export const AR_LAB_PREVIEW_CAMERA = Object.freeze({
  position: /** @type {[number, number, number]} */ ([
    AR_LAB_PREVIEW_CAMERA_POSE.position.x,
    AR_LAB_PREVIEW_CAMERA_POSE.position.y,
    AR_LAB_PREVIEW_CAMERA_POSE.position.z,
  ]),
  fov: AR_LAB_PREVIEW_CAMERA_POSE.fov,
  near: 0.05,
  far: 100,
});

export const AR_LAB_PREVIEW_CAMERA_TARGET = Object.freeze(
  /** @type {[number, number, number]} */ ([
    AR_LAB_PREVIEW_CAMERA_POSE.target.x,
    AR_LAB_PREVIEW_CAMERA_POSE.target.y,
    AR_LAB_PREVIEW_CAMERA_POSE.target.z,
  ]),
);
