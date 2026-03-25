import {
  areLiveInputRuntimeStatusesEqual,
  buildLiveInputRuntimeStatus,
  createLiveInputRuntimeStatus,
} from "../../context/liveInputRuntimeStatus.js";

export function syncLiveInputRuntimeStatus({
  status,
  featureFrame,
  liveInputUiState,
  liveInputErrorCode,
  setLiveInputRuntimeStatus,
  renderLoopRefs,
}) {
  const nextLiveInputRuntimeStatus =
    status.isLiveInputActive ||
    liveInputUiState === "starting" ||
    liveInputUiState === "stopping" ||
    liveInputUiState === "error"
      ? buildLiveInputRuntimeStatus({
          status,
          featureFrame,
          liveInputUiState,
          liveInputErrorCode,
        })
      : createLiveInputRuntimeStatus();
  const previousLiveInputRuntimeStatus =
    renderLoopRefs.lastLiveInputRuntimeStatusRef.current;

  if (
    !previousLiveInputRuntimeStatus ||
    !areLiveInputRuntimeStatusesEqual(
      previousLiveInputRuntimeStatus,
      nextLiveInputRuntimeStatus,
    )
  ) {
    renderLoopRefs.lastLiveInputRuntimeStatusRef.current =
      nextLiveInputRuntimeStatus;
    setLiveInputRuntimeStatus?.((currentStatus) => ({
      ...(currentStatus ?? {}),
      ...nextLiveInputRuntimeStatus,
    }));
  }

  return nextLiveInputRuntimeStatus;
}
