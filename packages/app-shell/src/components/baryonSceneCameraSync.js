/** @typedef {"preview-local" | "external-synced" | "spatial-session"} CameraControlMode */

export const CAMERA_CONTROL_MODES = Object.freeze({
  previewLocal: "preview-local",
  externalSynced: "external-synced",
  // XR runtime owns the camera pose; the scene must neither mount orbit
  // controls nor mirror camera poses back into app state.
  spatialSession: "spatial-session",
});

function resolveFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function resolveVector3(value, fallback) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    x: resolveFiniteNumber(value.x, fallback.x),
    y: resolveFiniteNumber(value.y, fallback.y),
    z: resolveFiniteNumber(value.z, fallback.z),
  };
}

function serializeCameraPoseForExport({ orbitControls, camera }) {
  return {
    position: resolveVector3(camera?.position, { x: 0, y: 0, z: 0 }),
    target: resolveVector3(orbitControls?.target, { x: 0, y: 0, z: 0 }),
    up: resolveVector3(camera?.up, { x: 0, y: 1, z: 0 }),
    fov: resolveFiniteNumber(camera?.fov, 65),
  };
}

function applyCameraPoseToCamera(cameraPose, camera) {
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
}

/**
 * @param {Record<string, unknown>} frameState
 * @param {{
 *   orbitControls: { target?: { x?: number, y?: number, z?: number } | null } | null,
 *   camera: {
 *     position?: { x?: number, y?: number, z?: number } | null,
 *     up?: { x?: number, y?: number, z?: number } | null,
 *     fov?: number | null,
 *   } | null,
 *   cameraControlMode?: CameraControlMode,
 * }} options
 */
export function augmentFrameStateWithCameraSync(
  frameState,
  {
    orbitControls,
    camera,
    cameraControlMode = CAMERA_CONTROL_MODES.previewLocal,
  },
) {
  if (!shouldMirrorCameraPose(cameraControlMode)) {
    return frameState;
  }

  return {
    ...frameState,
    cameraPose: serializeCameraPoseForExport({
      orbitControls,
      camera,
    }),
  };
}

export function shouldMountOrbitControls(cameraControlMode) {
  return cameraControlMode === CAMERA_CONTROL_MODES.previewLocal;
}

export function shouldMirrorCameraPose(cameraControlMode) {
  return cameraControlMode === CAMERA_CONTROL_MODES.previewLocal;
}

function commitOrbitControlsCameraPose(controls, applyPose) {
  if (!controls) {
    return;
  }

  const hasDampingToggle = "enableDamping" in controls;
  if (hasDampingToggle) {
    const previousEnableDamping = controls.enableDamping;

    // three-stdlib keeps damping deltas in closure state; one undamped update
    // drains that residue before the requested pose is saved as the new state.
    controls.enableDamping = false;
    try {
      controls.update?.();
    } finally {
      controls.enableDamping = previousEnableDamping;
    }
    applyPose?.();
  }

  controls.update?.();
  controls.saveState?.();
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
 * @param {{
 *   target?: { set?: ((x: number, y: number, z: number) => void) | undefined } | null,
 *   update?: (() => void) | undefined,
 *   saveState?: (() => void) | undefined,
 *   enableDamping?: boolean,
 * } | null} [controls]
 * @returns {boolean}
 */
export function applyExternalCameraPose(cameraPose, camera, controls = null) {
  if (!cameraPose || !camera) {
    return false;
  }

  if (controls?.target?.set) {
    const applyControlledPose = () => {
      applyCameraPoseToCamera(cameraPose, camera);
      controls.target.set(
        cameraPose.target?.x ?? 0,
        cameraPose.target?.y ?? 0,
        cameraPose.target?.z ?? 0,
      );
    };

    applyControlledPose();
    commitOrbitControlsCameraPose(controls, applyControlledPose);
  } else {
    applyCameraPoseToCamera(cameraPose, camera);
    camera.lookAt?.(
      cameraPose.target?.x ?? 0,
      cameraPose.target?.y ?? 0,
      cameraPose.target?.z ?? 0,
    );
  }
  camera.updateProjectionMatrix?.();
  camera.updateMatrixWorld?.(true);
  return true;
}
