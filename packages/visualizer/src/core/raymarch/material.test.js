import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createRaymarchVolumeMesh } from "./material.js";
import { raymarchOpacityNode } from "./SafeVolumetricLightingModel.js";

describe("raymarch volume material", () => {
  it("binds volumetric opacity to the material alpha path", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      capacity: 8,
      uniforms: {
        uRaymarchSteps: { value: 64 },
        uRadius: { value: 3 },
        uOpacityGain: { value: 1.35 },
      },
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.outputNode).toBeTruthy();
    expect(raymarchOpacityNode.isPropertyNode).toBe(true);
  });
});
