import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  createFieldCacheBasisLookup,
  FIELD_CACHE_BASIS_LOOKUP_HEIGHT,
  FIELD_CACHE_BASIS_MAX_MODE_ORDER,
} from "./fieldCacheBasisLookup.js";
import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_RESOLUTION,
} from "./fieldCacheGeometry.js";

describe("field-cache basis lookup", () => {
  it("stores both boundary families on the exact admitted voxel grid", () => {
    const lookup = createFieldCacheBasisLookup();
    try {
      expect(FIELD_CACHE_BASIS_MAX_MODE_ORDER).toBe(14);
      expect(FIELD_CACHE_BASIS_LOOKUP_HEIGHT).toBe(15);
      expect(lookup.texture.type).toBe(THREE.FloatType);
      expect(lookup.texture.format).toBe(THREE.RGBAFormat);
      expect(lookup.texture.minFilter).toBe(THREE.NearestFilter);
      expect(lookup.texture.generateMipmaps).toBe(false);

      for (const modeOrder of [0, 1, 7, FIELD_CACHE_BASIS_MAX_MODE_ORDER]) {
        const centeredAngularScale = modeOrder * Math.PI * 0.5;
        for (const voxelIndex of [0, 1, 63, 64, 126, 127]) {
          const coordinate =
            (voxelIndex + 0.5) * FIELD_CACHE_CELL_SIZE -
            FIELD_CACHE_DOMAIN_HALF_EXTENT;
          const argument = modeOrder * (coordinate * Math.PI + Math.PI) * 0.5;
          const offset = (modeOrder * FIELD_CACHE_RESOLUTION + voxelIndex) * 4;
          expect(lookup.data[offset]).toBe(Math.fround(Math.cos(argument)));
          expect(lookup.data[offset + 1]).toBe(
            Math.fround(-Math.sin(argument) * centeredAngularScale),
          );
          expect(lookup.data[offset + 2]).toBe(Math.fround(Math.sin(argument)));
          expect(lookup.data[offset + 3]).toBe(
            Math.fround(Math.cos(argument) * centeredAngularScale),
          );
        }
      }
    } finally {
      lookup.dispose();
    }
  });

  it("disposes its GPU texture exactly once", () => {
    const lookup = createFieldCacheBasisLookup();
    const dispose = vi.spyOn(lookup.texture, "dispose");
    lookup.dispose();
    lookup.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
