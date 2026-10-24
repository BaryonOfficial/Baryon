import * as THREE from "three";
import {
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_ATLAS_HEIGHT,
} from "./fieldCacheGeometry.js";

// Exact positive-octant permutation domain shared by spatial qualification paths.
export function createPositiveOctantGeometry() {
  const positions = [];
  const indices = [];
  const half = FIELD_CACHE_RESOLUTION / 2;
  for (let z = half; z < FIELD_CACHE_RESOLUTION; z++) {
    const start = positions.length / 3;
    const originX = (z % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION;
    const originY =
      Math.floor(z / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION;
    for (const [x, y] of [
      [half, half],
      [half + 0.5, half],
      [z + 1.5, z + 1],
      [half, z + 1],
    ]) {
      positions.push(
        (2 * (originX + x)) / FIELD_CACHE_ATLAS_WIDTH - 1,
        1 - (2 * (originY + y)) / FIELD_CACHE_ATLAS_HEIGHT,
        0,
      );
    }
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  return geometry;
}
