import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { setupRaymarch, disposeRaymarch } from "../raymarchSetup.js";

function setup() {
  return setupRaymarch(new THREE.BoxGeometry(1, 1, 1), {
    radius: 3,
    volumeShape: "sphere",
  });
}

describe("full-moment renderer resource wiring", () => {
  it("binds one persistent field cache to volume optics with no phase/slot staging buffers", () => {
    const state = setup();
    try {
      expect(state.volumeMesh.material.fieldCache).toBe(state.fieldCache);
      expect(state.volumeMesh.material.plasmaProfileLookup).toBe(
        state.plasmaProfileLookup,
      );
      expect(state.fieldSource.read()).toMatchObject({
        basisCompileCount: 0,
        observationUploadCount: 0,
      });
      expect(state.fieldCache.observerGeometryAvailabilityTexture).toBeTruthy();
      expect(
        Object.keys(state).filter((key) => key.endsWith("Buffer")),
      ).toEqual([]);
      expect(state).not.toHaveProperty("modalFieldCapacity");
      expect(state).not.toHaveProperty("fftSize");
      expect(state.uniforms).not.toHaveProperty("uModalFieldModeCount");
    } finally {
      disposeRaymarch(state);
    }
  });
  it("prepares the exact source owner before an accepted cache draw, never on a repeated cached read", () => {
    const state = setup();
    const order = [],
      renderer = {
        setRenderTarget: vi.fn(),
        getRenderTarget: () => null,
        render: () => order.push("draw"),
      };
    const prepare = vi
      .spyOn(state.fieldSource, "prepare")
      .mockImplementation((activeRenderer) => {
        expect(activeRenderer).toBe(renderer);
        order.push("source");
      });
    const options = {
      boundaryMode: "neumann",
      volumeShape: "sphere",
      observationTimeSeconds: 0,
      observationAdvancing: true,
      geometryExposureSeconds: 0.4,
      observationResetToken: "epoch-1",
      observationCheckpointKey: null,
      modalFieldSpectralSeedDirection: [1, 0],
    };
    try {
      state.fieldCache.bake(renderer, options);
      expect(order[0]).toBe("source");
      expect(order).toContain("draw");
      expect(prepare).toHaveBeenCalledOnce();
      order.length = 0;
      state.fieldCache.bake(renderer, options);
      expect(order).toEqual([]);
      expect(prepare).toHaveBeenCalledOnce();
    } finally {
      disposeRaymarch(state);
    }
  });
});
