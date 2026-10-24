import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCameraPolicyState,
  reduceCameraPolicy,
  resolveCameraPolicyPose,
} from "./cameraPolicy.js";
import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  resolveCameraPresetMatchFromPose,
  scaleCameraPoseDistance,
} from "./cameraPosePresets.js";
import { createCameraPresetCommand } from "./cameraControlModel.js";

/**
 * @param {{ active?: boolean,
 * activePose?: import("./cameraPosePresets.js").CameraPose,
 * distanceScale?: number, onCommand?: ((command: any) => any) | null }} options
 */
export function useCameraModel({
  active = false,
  activePose = DEFAULT_ACTIVE_CAMERA_POSE,
  distanceScale = 1,
  onCommand = null,
}) {
  const [state, setState] = useState(() => createCameraPolicyState(active));
  const stateRef = useRef(state);
  const observedActiveRef = useRef(active);
  const commandRef = useRef(onCommand);
  useEffect(() => {
    commandRef.current = onCommand;
  }, [onCommand]);
  const framing = useMemo(
    () => ({ activePose, distanceScale }),
    [activePose, distanceScale],
  );
  const apply = useCallback((event) => {
    const next = reduceCameraPolicy(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);
  useEffect(() => {
    if (observedActiveRef.current === active) return;
    observedActiveRef.current = active;
    apply({ type: "activity", active });
  }, [active, apply]);

  const desiredCameraPose = useMemo(
    () => resolveCameraPolicyPose(state, framing),
    [state, framing],
  );
  const selectPose = useCallback(
    (pose, { dispatch = true, reapply = true } = {}) => {
      if (!pose) return null;
      apply({ type: "pose", pose, reapply });
      return dispatch
        ? (commandRef.current?.({ cameraPose: pose }) ?? null)
        : pose;
    },
    [apply],
  );
  const selectPreset = useCallback(
    (preset) =>
      selectPose(
        scaleCameraPoseDistance(
          createCameraPresetCommand(preset).cameraPose,
          distanceScale,
        ),
      ),
    [selectPose, distanceScale],
  );
  const recordCameraPose = useCallback(
    (pose) => selectPose(pose, { dispatch: false, reapply: false }),
    [selectPose],
  );
  const syncDefaultCameraPose = useCallback(
    (nextActive, { dispatch = false, forceReapply = false } = {}) => {
      const next = apply({
        type: "reset",
        active: nextActive,
        reapply: forceReapply,
      });
      const cameraPose = resolveCameraPolicyPose(next, framing);
      return dispatch
        ? (commandRef.current?.({ cameraPose, cameraReset: true }) ?? null)
        : null;
    },
    [apply, framing],
  );
  const resetCamera = useCallback(
    () =>
      syncDefaultCameraPose(stateRef.current.active, {
        dispatch: true,
        forceReapply: true,
      }),
    [syncDefaultCameraPose],
  );

  return {
    desiredCameraPose,
    explicitPose: state.explicitPose,
    selectedPreset: resolveCameraPresetMatchFromPose(desiredCameraPose),
    resetNonce: state.resetNonce,
    selectPose,
    selectPreset,
    recordCameraPose,
    syncDefaultCameraPose,
    resetCamera,
  };
}
