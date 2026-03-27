import {
  CAMERA_VIEW_PRESETS,
  clampCameraDistance,
  getDefaultCameraDistanceForPreset,
  resolveCameraDistanceOverride,
} from "./cameraViewPresets.js";
import { VISUALIZATION_METHODS } from "@baryon/visualizer/visualization/types";

export const CAMERA_CONTROL_MODES = Object.freeze({
  previewLocal: "preview-local",
  externalSynced: "external-synced",
});

export function resolveRenderedCameraViewPreset(
  visualizationMethod,
  cameraViewPreset,
) {
  return visualizationMethod === VISUALIZATION_METHODS.cymatics2d
    ? CAMERA_VIEW_PRESETS.side
    : cameraViewPreset;
}

export function resolveCameraDistanceForExport({
  orbitControls,
  camera,
  cameraViewPreset,
}) {
  const rawControlsDistance =
    typeof orbitControls?.getDistance === "function"
      ? orbitControls.getDistance()
      : NaN;
  if (Number.isFinite(rawControlsDistance) && rawControlsDistance > 0) {
    return clampCameraDistance(rawControlsDistance);
  }

  const rawPositionLength = camera?.position?.length?.();
  if (Number.isFinite(rawPositionLength) && rawPositionLength > 0) {
    return clampCameraDistance(rawPositionLength);
  }

  return getDefaultCameraDistanceForPreset(cameraViewPreset);
}

export function augmentFrameStateWithCameraSync(
  frameState,
  { visualizationMethod, cameraViewPreset, orbitControls, camera },
) {
  const renderedCameraViewPreset = resolveRenderedCameraViewPreset(
    visualizationMethod,
    cameraViewPreset,
  );

  return {
    ...frameState,
    cameraViewPreset: renderedCameraViewPreset,
    cameraDistance: resolveCameraDistanceForExport({
      orbitControls,
      camera,
      cameraViewPreset: renderedCameraViewPreset,
    }),
  };
}

export function shouldMountOrbitControls(
  visualizationMethod,
  cameraControlMode,
) {
  return (
    visualizationMethod !== VISUALIZATION_METHODS.cymatics2d &&
    cameraControlMode !== CAMERA_CONTROL_MODES.externalSynced
  );
}

export function resolveAppliedCameraState({
  visualizationMethod,
  cameraControlMode,
  cameraViewPreset,
  cameraDistance,
}) {
  const resolvedPreset = resolveRenderedCameraViewPreset(
    visualizationMethod,
    cameraViewPreset,
  );

  if (visualizationMethod === VISUALIZATION_METHODS.cymatics2d) {
    return {
      preset: CAMERA_VIEW_PRESETS.side,
      distance: resolveCameraDistanceOverride(
        CAMERA_VIEW_PRESETS.side,
        cameraDistance,
      ),
    };
  }

  if (cameraControlMode === CAMERA_CONTROL_MODES.externalSynced) {
    return {
      preset: resolvedPreset,
      distance: resolveCameraDistanceOverride(resolvedPreset, cameraDistance),
    };
  }

  return {
    preset: resolvedPreset,
    distance: null,
  };
}
