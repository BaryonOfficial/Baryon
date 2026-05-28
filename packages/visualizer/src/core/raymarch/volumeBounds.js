import * as THREE from "three";

export const VOLUME_BOUNDS_MODES = Object.freeze({
  sphere: "sphere",
  fullscreenBox: "fullscreenBox",
});

const MAX_FULLSCREEN_ASPECT = 3;
const FULLSCREEN_MESH_BOUNDS_PADDING = 1.01;

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
  volumeMesh.scale.set(
    (halfExtents.x * 2 * padding) / baseWidth,
    (halfExtents.y * 2 * padding) / baseHeight,
    (halfExtents.z * 2 * padding) / baseDepth,
  );
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
 * @param {{ getSize: (target: import("three").Vector2) => import("three").Vector2 } | null | undefined} renderer
 */
export function syncFullscreenVolumeHalfExtents(runtimeState, renderer) {
  if (
    runtimeState?.volumeBounds !== VOLUME_BOUNDS_MODES.fullscreenBox ||
    !runtimeState?.uniforms?.uVolumeHalfExtents ||
    !renderer
  ) {
    return;
  }

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const width = size.x > 0 ? size.x : 1;
  const height = size.y > 0 ? size.y : 1;
  const aspect = clampAspect(width / height);
  const baseRadius = resolveFullscreenVolumeBaseRadius(runtimeState);
  const halfExtents = deriveFullscreenVolumeHalfExtents(baseRadius, aspect);

  runtimeState.uniforms.uViewportAspect.value = aspect;
  runtimeState.uniforms.uVolumeHalfExtents.value.set(
    halfExtents.x,
    halfExtents.y,
    halfExtents.z,
  );
  syncFullscreenVolumeMeshBounds(runtimeState.volumeMesh, halfExtents);
}
