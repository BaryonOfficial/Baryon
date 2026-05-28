import * as THREE from "three";

export const VOLUME_BOUNDS_MODES = Object.freeze({
  sphere: "sphere",
  fullscreenBox: "fullscreenBox",
});

const MAX_FULLSCREEN_ASPECT = 3;
const FULLSCREEN_MESH_BOUNDS_PADDING = 1.01;
const FULLSCREEN_VOLUME_SIZE_SCRATCH = new THREE.Vector2();

/**
 * @param {unknown} value
 * @returns {typeof VOLUME_BOUNDS_MODES[keyof typeof VOLUME_BOUNDS_MODES]}
 */
export function normalizeVolumeBoundsMode(value) {
  return value === VOLUME_BOUNDS_MODES.fullscreenBox
    ? VOLUME_BOUNDS_MODES.fullscreenBox
    : VOLUME_BOUNDS_MODES.sphere;
}

/**
 * Vertical half-extent for the canonical fullscreen side view at setup.
 * Uses the fixed side preset geometry (distance 9, 65° vertical FOV) only to
 * seed the volume domain — not as a per-frame camera zoom adjustment.
 *
 * @returns {number}
 */
export function resolveDefaultFullscreenVerticalHalfExtent() {
  const cameraDistance = 9;
  const verticalFovDeg = 65;
  const tanHalfFov = Math.tan((verticalFovDeg * Math.PI) / 360);
  return cameraDistance * tanHalfFov;
}

/**
 * @param {number} radius vertical half-extent of the aspect-filled volume box
 * @param {number} aspect viewport width / height
 * @returns {{ x: number, y: number, z: number }}
 */
export function deriveFullscreenVolumeHalfExtents(radius, aspect) {
  const safeRadius = Math.max(Number(radius) || 1, 1e-4);
  const safeAspect = clampAspect(aspect);
  return {
    x: safeRadius * safeAspect,
    y: safeRadius,
    z: safeRadius,
  };
}

/**
 * @param {number} aspect
 * @returns {number}
 */
export function clampAspect(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return 1;
  }
  return Math.min(
    Math.max(aspect, 1 / MAX_FULLSCREEN_ASPECT),
    MAX_FULLSCREEN_ASPECT,
  );
}

/**
 * @param {import("three").Mesh | null | undefined} volumeMesh
 * @param {{ x: number, y: number, z: number }} halfExtents
 */
export function syncFullscreenVolumeMeshBounds(volumeMesh, halfExtents) {
  if (!volumeMesh?.geometry || !halfExtents) {
    return;
  }

  const geometry = volumeMesh.geometry;
  if (!(geometry instanceof THREE.BoxGeometry)) {
    return;
  }

  const {
    width: baseWidth,
    height: baseHeight,
    depth: baseDepth,
  } = geometry.parameters;
  if (
    !Number.isFinite(baseWidth) ||
    !Number.isFinite(baseHeight) ||
    !Number.isFinite(baseDepth) ||
    baseWidth <= 0 ||
    baseHeight <= 0 ||
    baseDepth <= 0
  ) {
    return;
  }

  const padding = FULLSCREEN_MESH_BOUNDS_PADDING;
  const nextScaleX = (halfExtents.x * 2 * padding) / baseWidth;
  const nextScaleY = (halfExtents.y * 2 * padding) / baseHeight;
  const nextScaleZ = (halfExtents.z * 2 * padding) / baseDepth;
  if (
    volumeMesh.scale.x === nextScaleX &&
    volumeMesh.scale.y === nextScaleY &&
    volumeMesh.scale.z === nextScaleZ
  ) {
    return;
  }

  volumeMesh.scale.set(nextScaleX, nextScaleY, nextScaleZ);
}

/**
 * @param {{
 *   volumeBounds?: string,
 *   volumeMesh?: import("three").Mesh,
 *   uniforms?: {
 *     uRadius?: { value: number },
 *     uViewportAspect?: { value: number },
 *     uVolumeHalfExtents?: {
 *       value: {
 *         x?: number,
 *         y?: number,
 *         z?: number,
 *         set: (x: number, y: number, z: number) => void,
 *       },
 *     },
 *   },
 * }} runtimeState
 */
function resolveFullscreenVolumeBaseRadius(runtimeState) {
  const simulationRadius = Math.max(
    Number(runtimeState?.uniforms?.uRadius?.value) || 0,
    1e-4,
  );
  const establishedVerticalHalfExtent = Math.max(
    Number(runtimeState?.uniforms?.uVolumeHalfExtents?.value?.y) || 0,
    1e-4,
  );
  return Math.max(simulationRadius, establishedVerticalHalfExtent);
}

/**
 * @param {{
 *   volumeBounds?: string,
 *   volumeMesh?: import("three").Mesh,
 *   _fullscreenVolumeBoundsSync?: {
 *     width: number,
 *     height: number,
 *     baseRadius: number,
 *   },
 *   uniforms?: {
 *     uRadius?: { value: number },
 *     uViewportAspect?: { value: number },
 *     uVolumeHalfExtents?: {
 *       value: {
 *         x?: number,
 *         y?: number,
 *         z?: number,
 *         set: (x: number, y: number, z: number) => void,
 *       },
 *     },
 *   },
 * }} runtimeState
 */
function resolveFullscreenVolumeBoundsSyncCache(runtimeState) {
  if (!runtimeState._fullscreenVolumeBoundsSync) {
    runtimeState._fullscreenVolumeBoundsSync = {
      width: 0,
      height: 0,
      baseRadius: 0,
    };
  }

  return runtimeState._fullscreenVolumeBoundsSync;
}

export function syncFullscreenVolumeHalfExtents(runtimeState, renderer) {
  if (
    runtimeState?.volumeBounds !== VOLUME_BOUNDS_MODES.fullscreenBox ||
    !runtimeState?.uniforms?.uVolumeHalfExtents ||
    !renderer
  ) {
    return;
  }

  renderer.getSize(FULLSCREEN_VOLUME_SIZE_SCRATCH);
  const width =
    FULLSCREEN_VOLUME_SIZE_SCRATCH.x > 0 ? FULLSCREEN_VOLUME_SIZE_SCRATCH.x : 1;
  const height =
    FULLSCREEN_VOLUME_SIZE_SCRATCH.y > 0 ? FULLSCREEN_VOLUME_SIZE_SCRATCH.y : 1;
  const baseRadius = resolveFullscreenVolumeBaseRadius(runtimeState);
  const syncCache = resolveFullscreenVolumeBoundsSyncCache(runtimeState);
  if (
    syncCache.width === width &&
    syncCache.height === height &&
    syncCache.baseRadius === baseRadius
  ) {
    return;
  }

  syncCache.width = width;
  syncCache.height = height;
  syncCache.baseRadius = baseRadius;

  const aspect = clampAspect(width / height);
  const halfExtents = deriveFullscreenVolumeHalfExtents(baseRadius, aspect);
  const viewportAspectUniform = runtimeState.uniforms.uViewportAspect;
  if (viewportAspectUniform.value !== aspect) {
    viewportAspectUniform.value = aspect;
  }

  const halfExtentsUniform = runtimeState.uniforms.uVolumeHalfExtents.value;
  if (
    halfExtentsUniform.x !== halfExtents.x ||
    halfExtentsUniform.y !== halfExtents.y ||
    halfExtentsUniform.z !== halfExtents.z
  ) {
    halfExtentsUniform.set(halfExtents.x, halfExtents.y, halfExtents.z);
  }
  syncFullscreenVolumeMeshBounds(runtimeState.volumeMesh, halfExtents);
}
