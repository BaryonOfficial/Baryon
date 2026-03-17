import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";
import { createRaymarchVolumeMesh } from "./material.js";
import { createRaymarchUniforms } from "./uniforms.js";
import { raymarchOpacityNode } from "./SafeVolumetricLightingModel.js";

function makeMeshUniforms(overrides = {}) {
  const base = createRaymarchUniforms({
    radius: 3,
    steps: 64,
  });
  return { ...base, ...overrides };
}

describe("raymarch volume material", () => {
  it("binds volumetric opacity to the material alpha path", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      capacity: AUDIO_SLOT_CAPACITY,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.outputNode).toBeTruthy();
    expect(mesh.material.offsetNode).toBeTruthy();
    expect(raymarchOpacityNode.isPropertyNode).toBe(true);
  });

  it("keeps the raymarch material runtime bindings intact", () => {
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      capacity: AUDIO_SLOT_CAPACITY,
      uniforms,
    });

    expect(mesh.material.steps).toBe(64);
    expect(mesh.material.radiusNode).toBe(uniforms.uRadius);
    expect(mesh.material.opacityGainNode).toBe(uniforms.uOpacityGain);
  });
});
