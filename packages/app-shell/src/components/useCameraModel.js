import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AUTOMATIC_CAMERA_INTENT,
  createCameraIntentStore,
  normalizeCameraIntent,
  resolveCameraPolicyPose,
} from "./cameraPolicy.js";
import {
  DEFAULT_ACTIVE_CAMERA_POSE,
  resolvePresetCameraPose,
  resolveCameraPresetMatchFromPose,
  scaleCameraPoseDistance,
} from "./cameraPosePresets.js";

/** @param {{active?: boolean, enabled?: boolean, intentStore?: ReturnType<typeof createCameraIntentStore> | null,
 * activePose?: import("./cameraPosePresets.js").CameraPose, distanceScale?: number, onCommand?: ((command: any) => any) | null}} options */
export function useCameraModel({
  active = false,
  enabled = true,
  intentStore = null,
  activePose = DEFAULT_ACTIVE_CAMERA_POSE,
  distanceScale = 1,
  onCommand = null,
}) {
  const [store] = useState(() => intentStore ?? createCameraIntentStore());
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const previousActivity = useRef({ active, enabled });
  const commandRef = useRef(onCommand);
  useEffect(() => {
    commandRef.current = onCommand;
  }, [onCommand]);
  useEffect(() => {
    const previous = previousActivity.current;
    previousActivity.current = { active, enabled };
    // Changing render ownership is a handoff, not a Stop. Only activity lost
    // while this surface owns the camera may clear the shared choice.
    if (previous.enabled && enabled && previous.active && !active)
      store.setIntent(AUTOMATIC_CAMERA_INTENT);
  }, [active, enabled, store]);
  const desiredCameraPose = useMemo(
    () =>
      resolveCameraPolicyPose(
        { active, intent: snapshot.intent },
        { activePose, distanceScale },
      ),
    [active, snapshot.intent, activePose, distanceScale],
  );
  const selectPose = useCallback(
    (pose, { dispatch = true, reapply = true } = {}) => {
      const intent = normalizeCameraIntent({ mode: "explicit", pose });
      if (!intent) return null;
      store.setIntent(intent, { reapply });
      return dispatch
        ? (commandRef.current?.({ cameraIntent: store.getSnapshot().intent }) ??
            pose)
        : pose;
    },
    [store],
  );
  const selectPreset = useCallback(
    (preset) =>
      selectPose(
        scaleCameraPoseDistance(resolvePresetCameraPose(preset), distanceScale),
      ),
    [selectPose, distanceScale],
  );
  const recordCameraPose = useCallback(
    (pose) => selectPose(pose, { dispatch: false, reapply: false }),
    [selectPose],
  );
  const clearIntent = useCallback(
    ({ dispatch = false, reapply = false } = {}) => {
      store.setIntent(AUTOMATIC_CAMERA_INTENT, { reapply });
      return dispatch
        ? (commandRef.current?.({ cameraIntent: AUTOMATIC_CAMERA_INTENT }) ??
            null)
        : null;
    },
    [store],
  );
  const resetCamera = useCallback(
    () => clearIntent({ dispatch: true, reapply: true }),
    [clearIntent],
  );
  return {
    intent: snapshot.intent,
    desiredCameraPose,
    selectedPreset: resolveCameraPresetMatchFromPose(desiredCameraPose),
    resetNonce: snapshot.resetNonce,
    selectPose,
    selectPreset,
    recordCameraPose,
    clearIntent,
    resetCamera,
  };
}
