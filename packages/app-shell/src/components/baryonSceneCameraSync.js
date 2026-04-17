import {
  CAMERA_VIEW_PRESETS,
  clampCameraDistance,
  getDefaultCameraDistanceForPreset,
  resolveCameraDistanceOverride,
} from "./cameraViewPresets.js";
import { VISUALIZATION_METHODS } from "@baryon/visualizer/visualization/types";

/** @typedef {"preview-local" | "external-synced"} CameraControlMode */

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

/**
 * @param {Record<string, unknown>} frameState
 * @param {{
 *   visualizationMethod: string,
 *   cameraViewPreset: "top-down" | "side",
 *   orbitControls: { getDistance?: (() => number) | undefined } | null,
 *   camera: { position?: { length?: (() => number) | undefined } | null } | null,
 *   cameraControlMode?: CameraControlMode,
 * }} options
 */
export function augmentFrameStateWithCameraSync(
  frameState,
  {
    visualizationMethod,
    cameraViewPreset,
    orbitControls,
    camera,
    cameraControlMode = CAMERA_CONTROL_MODES.previewLocal,
  },
) {
  if (cameraControlMode === CAMERA_CONTROL_MODES.externalSynced) {
    return frameState;
  }

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

/**
 * @param {{
 *   position?: { x?: number, y?: number, z?: number } | null,
 *   target?: { x?: number, y?: number, z?: number } | null,
 *   up?: { x?: number, y?: number, z?: number } | null,
 *   fov?: number | null,
 * } | null} cameraPose
 * @param {{
 *   position?: { set?: ((x: number, y: number, z: number) => void) | undefined } | null,
 *   up?: { set?: ((x: number, y: number, z: number) => void) | undefined } | null,
 *   lookAt?: ((x: number, y: number, z: number) => void) | undefined,
 *   updateProjectionMatrix?: (() => void) | undefined,
 *   updateMatrixWorld?: ((force?: boolean) => void) | undefined,
 *   fov?: number,
 * } | null} camera
 * @returns {boolean}
 */
export function applyExternalCameraPose(cameraPose, camera) {
  if (!cameraPose || !camera) {
    return false;
  }

  camera.position?.set?.(
    cameraPose.position?.x ?? 0,
    cameraPose.position?.y ?? 0,
    cameraPose.position?.z ?? 0,
  );
  camera.up?.set?.(
    cameraPose.up?.x ?? 0,
    cameraPose.up?.y ?? 1,
    cameraPose.up?.z ?? 0,
  );
  if ("fov" in camera && Number.isFinite(cameraPose.fov)) {
    camera.fov = /** @type {number} */ (cameraPose.fov);
  }
  camera.lookAt?.(
    cameraPose.target?.x ?? 0,
    cameraPose.target?.y ?? 0,
    cameraPose.target?.z ?? 0,
  );
  camera.updateProjectionMatrix?.();
  camera.updateMatrixWorld?.(true);
  return true;
}

/**
 * @param {{
 *   visualizationMethod: string,
 *   cameraControlMode: CameraControlMode,
 *   cameraViewPreset: "top-down" | "side",
 *   cameraDistance: number | null,
 * }} options
 */
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

  return {
    preset: resolvedPreset,
    distance:
      cameraControlMode === CAMERA_CONTROL_MODES.externalSynced
        ? resolveCameraDistanceOverride(resolvedPreset, cameraDistance)
        : null,
  };
}
