/** @typedef {"sphere" | "cube"} VolumeShape */

/** @type {{ sphere: VolumeShape, cube: VolumeShape }} */
export const VOLUME_SHAPES = Object.freeze({
  sphere: "sphere",
  cube: "cube",
});

/** @returns {VolumeShape} */
export function normalizeVolumeShape(value) {
  return value === VOLUME_SHAPES.cube
    ? VOLUME_SHAPES.cube
    : VOLUME_SHAPES.sphere;
}
