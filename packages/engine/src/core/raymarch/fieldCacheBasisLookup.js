import * as THREE from "three";
import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
  FIELD_CACHE_RESOLUTION,
} from "./fieldCacheGeometry.js";

export const FIELD_CACHE_BASIS_MAX_MODE_ORDER = Math.floor(
  FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
);
export const FIELD_CACHE_BASIS_LOOKUP_HEIGHT =
  FIELD_CACHE_BASIS_MAX_MODE_ORDER + 1;

function buildFieldCacheBasisLookupData() {
  const data = new Float32Array(
    FIELD_CACHE_RESOLUTION * FIELD_CACHE_BASIS_LOOKUP_HEIGHT * 4,
  );
  for (
    let modeOrder = 0;
    modeOrder <= FIELD_CACHE_BASIS_MAX_MODE_ORDER;
    modeOrder += 1
  ) {
    const centeredAngularScale = modeOrder * Math.PI * 0.5;
    for (
      let voxelIndex = 0;
      voxelIndex < FIELD_CACHE_RESOLUTION;
      voxelIndex += 1
    ) {
      const coordinate =
        (voxelIndex + 0.5) * FIELD_CACHE_CELL_SIZE -
        FIELD_CACHE_DOMAIN_HALF_EXTENT;
      const centeredArgument =
        modeOrder * (coordinate * Math.PI + Math.PI) * 0.5;
      const sine = Math.sin(centeredArgument);
      const cosine = Math.cos(centeredArgument);
      const offset = (modeOrder * FIELD_CACHE_RESOLUTION + voxelIndex) * 4;
      data[offset] = cosine;
      data[offset + 1] = -sine * centeredAngularScale;
      data[offset + 2] = sine;
      data[offset + 3] = cosine * centeredAngularScale;
    }
  }
  return data;
}

/**
 * Exact-grid separable cavity basis used by the modal field-cache bake.
 *
 * The bake only evaluates integer modes at the 128 canonical voxel centres,
 * yet the former shader recomputed sine and cosine for all three coordinates
 * of every mode and voxel. This 30 KiB Float32 table performs those invariant
 * evaluations once on the CPU. RG stores raw Neumann value/derivative and BA
 * stores raw Dirichlet value/derivative; family normalization remains in the
 * existing modal packet.
 */
export function createFieldCacheBasisLookup() {
  const data = buildFieldCacheBasisLookupData();
  const texture = new THREE.DataTexture(
    data,
    FIELD_CACHE_RESOLUTION,
    FIELD_CACHE_BASIS_LOOKUP_HEIGHT,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.name = "BaryonFieldCacheBasisLookup";
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  let disposed = false;

  return {
    data,
    texture,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      texture.dispose();
    },
  };
}

// Fixed-grid modal basis lookup owner end.
