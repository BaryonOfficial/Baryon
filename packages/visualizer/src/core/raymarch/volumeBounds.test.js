import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  clampAspect,
  deriveFullscreenVolumeHalfExtents,
  normalizeVolumeBoundsMode,
  resolveDefaultFullscreenVerticalHalfExtent,
  syncFullscreenVolumeHalfExtents,
  syncFullscreenVolumeMeshBounds,
  VOLUME_BOUNDS_MODES,
} from "./volumeBounds.js";

describe("volumeBounds", () => {
  it("normalizes unknown bounds modes to sphere", () => {
    expect(normalizeVolumeBoundsMode("fullscreenBox")).toBe(
      VOLUME_BOUNDS_MODES.fullscreenBox,
    );
    expect(normalizeVolumeBoundsMode("sphere")).toBe(
      VOLUME_BOUNDS_MODES.sphere,
    );
    expect(normalizeVolumeBoundsMode("legacy")).toBe(
      VOLUME_BOUNDS_MODES.sphere,
    );
  });

  it("derives aspect-filled half extents from radius", () => {
    expect(deriveFullscreenVolumeHalfExtents(2, 2)).toEqual({
      x: 4,
      y: 2,
      z: 2,
    });
    expect(deriveFullscreenVolumeHalfExtents(2, 0.5)).toEqual({
      x: 1,
      y: 2,
      z: 2,
    });
  });

  it("seeds the default fullscreen vertical half extent from the side preset", () => {
    const verticalHalfExtent = resolveDefaultFullscreenVerticalHalfExtent();
    const halfExtents = deriveFullscreenVolumeHalfExtents(
      verticalHalfExtent,
      16 / 9,
    );

    expect(verticalHalfExtent).toBeGreaterThan(3);
    expect(halfExtents.y).toBeCloseTo(verticalHalfExtent, 5);
    expect(halfExtents.x).toBeCloseTo(verticalHalfExtent * (16 / 9), 5);
    expect(halfExtents.z).toBeCloseTo(verticalHalfExtent, 5);
    expect(halfExtents.x).toBeGreaterThan(halfExtents.y);
  });

  it("clamps extreme viewport aspects", () => {
    expect(clampAspect(0)).toBe(1);
    expect(clampAspect(100)).toBe(3);
    expect(clampAspect(1 / 100)).toBeCloseTo(1 / 3, 5);
  });

  it("syncs fullscreen half extents and mesh scale from renderer size", () => {
    const geometry = new THREE.BoxGeometry(6, 6, 6);
    const volumeMesh = new THREE.Mesh(geometry);
    const halfExtentsUniform = new THREE.Vector3(1, 1, 1);
    const verticalHalfExtent = resolveDefaultFullscreenVerticalHalfExtent();
    halfExtentsUniform.set(
      verticalHalfExtent,
      verticalHalfExtent,
      verticalHalfExtent,
    );
    const runtimeState = {
      volumeBounds: VOLUME_BOUNDS_MODES.fullscreenBox,
      volumeMesh,
      uniforms: {
        uRadius: { value: 3 },
        uViewportAspect: { value: 1 },
        uVolumeHalfExtents: {
          value: halfExtentsUniform,
        },
      },
    };
    const renderer = {
      getSize(target) {
        target.set(1920, 1080);
        return target;
      },
    };

    syncFullscreenVolumeHalfExtents(runtimeState, renderer);

    const expected = deriveFullscreenVolumeHalfExtents(
      verticalHalfExtent,
      1920 / 1080,
    );
    expect(runtimeState.uniforms.uViewportAspect.value).toBeCloseTo(
      1920 / 1080,
      5,
    );
    expect(halfExtentsUniform.x).toBeCloseTo(expected.x, 5);
    expect(halfExtentsUniform.y).toBeCloseTo(expected.y, 5);
    expect(halfExtentsUniform.z).toBeCloseTo(expected.z, 5);
    expect(volumeMesh.scale.x).toBeCloseTo((expected.x * 2 * 1.01) / 6, 5);
    expect(volumeMesh.scale.y).toBeCloseTo((expected.y * 2 * 1.01) / 6, 5);
    expect(volumeMesh.scale.z).toBeCloseTo((expected.z * 2 * 1.01) / 6, 5);
  });

  it("skips redundant fullscreen bounds sync when viewport and radius are unchanged", () => {
    const geometry = new THREE.BoxGeometry(6, 6, 6);
    const volumeMesh = new THREE.Mesh(geometry);
    const halfExtentsUniform = new THREE.Vector3(1, 1, 1);
    const verticalHalfExtent = resolveDefaultFullscreenVerticalHalfExtent();
    halfExtentsUniform.set(
      verticalHalfExtent,
      verticalHalfExtent,
      verticalHalfExtent,
    );
    const runtimeState = {
      volumeBounds: VOLUME_BOUNDS_MODES.fullscreenBox,
      volumeMesh,
      uniforms: {
        uRadius: { value: 3 },
        uViewportAspect: { value: 1 },
        uVolumeHalfExtents: {
          value: halfExtentsUniform,
        },
      },
    };
    let getSizeCalls = 0;
    const renderer = {
      getSize(target) {
        getSizeCalls += 1;
        target.set(1920, 1080);
        return target;
      },
    };

    syncFullscreenVolumeHalfExtents(runtimeState, renderer);
    const firstScaleX = volumeMesh.scale.x;
    const firstAspect = runtimeState.uniforms.uViewportAspect.value;
    syncFullscreenVolumeHalfExtents(runtimeState, renderer);

    expect(getSizeCalls).toBe(2);
    expect(runtimeState.uniforms.uViewportAspect.value).toBe(firstAspect);
    expect(volumeMesh.scale.x).toBe(firstScaleX);
  });

  it("scales the proxy mesh to the runtime half extents", () => {
    const geometry = new THREE.BoxGeometry(18, 6, 6);
    const volumeMesh = new THREE.Mesh(geometry);
    const halfExtents = { x: 9, y: 5, z: 5 };

    syncFullscreenVolumeMeshBounds(volumeMesh, halfExtents);

    expect(volumeMesh.scale.x).toBeCloseTo((9 * 2 * 1.01) / 18, 5);
    expect(volumeMesh.scale.y).toBeCloseTo((5 * 2 * 1.01) / 6, 5);
    expect(volumeMesh.scale.z).toBeCloseTo((5 * 2 * 1.01) / 6, 5);
  });
});
