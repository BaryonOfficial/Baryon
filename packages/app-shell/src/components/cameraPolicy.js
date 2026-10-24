import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_CAMERA_POSE,
  scaleCameraPoseDistance,
} from "./cameraPosePresets.js";

// Camera state controls presentation only. Audio owners supply activity;
// rendered frames and transport acknowledgements never establish user intent.
export function createCameraPolicyState(active = false) {
  return { active, explicitPose: null, resetNonce: 0 };
}

export function reduceCameraPolicy(state, event) {
  switch (event.type) {
    case "activity":
      if (state.active === event.active) return state;
      return {
        ...state,
        active: event.active,
        explicitPose: event.active ? state.explicitPose : null,
      };
    case "pose":
      return {
        ...state,
        explicitPose: event.pose,
        resetNonce: state.resetNonce + (event.reapply ? 1 : 0),
      };
    case "reset":
      return {
        active: event.active ?? state.active,
        explicitPose: null,
        resetNonce: state.resetNonce + (event.reapply ? 1 : 0),
      };
    default:
      return state;
  }
}

/** @param {boolean} active @param {import("./cameraPosePresets.js").CameraPose} activePose */
export function resolveDefaultCameraPose(
  active,
  activePose = DEFAULT_ACTIVE_CAMERA_POSE,
) {
  return active ? activePose : DEFAULT_IDLE_CAMERA_POSE;
}

/**
 * @param {{ active: boolean, explicitPose: import("./cameraPosePresets.js").CameraPose | null }} state
 * @param {{ activePose?: import("./cameraPosePresets.js").CameraPose, distanceScale?: number }} options
 */
export function resolveCameraPolicyPose(
  state,
  { activePose = DEFAULT_ACTIVE_CAMERA_POSE, distanceScale = 1 } = {},
) {
  return (
    state.explicitPose ??
    scaleCameraPoseDistance(
      resolveDefaultCameraPose(state.active, activePose),
      distanceScale,
    )
  );
}
