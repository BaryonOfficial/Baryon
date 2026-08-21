import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUDIO_DEFAULTS, SIMULATION_DEFAULTS } from "../../defaults.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../modalBudgets.js";
import { setupRaymarch } from "../raymarchSetup.js";
import {
  createPortableModalUniformBuffer,
  syncPortableModalUniformBuffer,
} from "./portableModalUniforms.js";

describe("portable modal uniforms", () => {
  it("keeps semantic packet staging separate from its portable GPU view", () => {
    const buffer = createPortableModalUniformBuffer(2);

    expect(buffer.representation).toBe("portable-uniform-array");
    expect(buffer.uniforms.isArrayBufferNode).toBe(true);
    expect(buffer.uniforms.isStorageBufferNode).not.toBe(true);
    expect(buffer.value.array).toBeInstanceOf(Float32Array);

    buffer.value.array.set([1, 2, 3, 4, 5, 6, 7, 8]);
    syncPortableModalUniformBuffer(buffer);

    expect(buffer.uniforms.array[0].toArray()).toEqual([1, 2, 3, 4]);
    expect(buffer.uniforms.array[1].toArray()).toEqual([5, 6, 7, 8]);
    expect(buffer.value.needsUpdate).toBe(false);
  });

  it("keeps the modal packet portable and adds only the reconstruction cache", () => {
    const state = setupRaymarch(
      new THREE.BoxGeometry(1, 1, 1),
      { radius: 3, cavityGeometry: "rectangular", volumeShape: "sphere" },
      { capacity: 4, fftSize: 2048 },
    );
    const setupSource = readFileSync(
      new URL("../raymarchSetup.js", import.meta.url),
      "utf8",
    );

    expect(state).not.toHaveProperty("modalBasisCache");
    expect(state).not.toHaveProperty("liveFieldProjectionCache");
    expect(state).not.toHaveProperty("spectralLaneCache");
    expect(state).not.toHaveProperty("laserTransportCache");
    expect(state.uniforms).not.toHaveProperty("uLiveFieldCacheActive");
    expect(state.modalFieldModeBuffer.representation).toBe(
      "portable-uniform-array",
    );
    // The field cache is a reconstruction of the analytic potential: the
    // packet stays a portable uniform array and the bake is what samples it.
    expect(state.fieldCache.modalResourceBindings.modalFieldModeUniforms).toBe(
      state.modalFieldModeBuffer.uniforms,
    );
    expect(
      state.fieldCache.modalResourceBindings.modalFieldResponseUniforms,
    ).toBe(state.modalFieldResponseBuffer.uniforms);
    expect(state.volumeMesh.material.fieldCache).toBe(state.fieldCache);
    expect(state.volumeMesh.material.plasmaProfileLookup).toBe(
      state.plasmaProfileLookup,
    );
    expect(state.plasmaProfileLookup.maximumIntervalWidthWorld).toBe(3);
    expect(setupSource).not.toContain("createRaymarchModalBasisCache");
    expect(setupSource).not.toContain("createRaymarchLaserTransportCache");
    expect(setupSource).not.toContain("instancedArray");
  });

  it("compiles the optical packet against the full semantic descriptor", () => {
    const state = setupRaymarch(
      new THREE.BoxGeometry(1, 1, 1),
      {
        radius: SIMULATION_DEFAULTS.radius,
        cavityGeometry: "rectangular",
        volumeShape: "sphere",
      },
      {
        capacity: AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
        fftSize: 8192,
      },
    );

    expect(state.modalFieldCapacity).toBe(
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    );
    expect(state.volumeMesh.material.modalFieldCapacity).toBe(
      MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    );
    expect(state.modalFieldCoefficientBuffer.uniforms.array).toHaveLength(
      MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    );
    expect(state.modalFieldResponseBuffer.uniforms.array).toHaveLength(
      MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    );
    // No render-side ceiling: every mode the descriptor can admit has a slot to
    // enter the cache bake. The march samples the cache, so this headroom costs
    // buffer bytes and bake work rather than per-ray modal traversal.
    expect(state.modalFieldCoefficientBuffer.uniforms.array).toHaveLength(
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    );
  });
});
