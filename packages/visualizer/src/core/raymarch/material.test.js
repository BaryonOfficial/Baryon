import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUDIO_DEFAULTS } from "../../defaults.js";
import {
  createRaymarchVolumeMesh,
  getRaymarchMaterialCache,
  setRaymarchBoundaryMode,
  setRaymarchCavityGeometry,
  setRaymarchFieldEvaluationMode,
} from "./material.js";
import { createRaymarchUniforms } from "./uniforms.js";
import { raymarchOpacityNode } from "./SafeVolumetricLightingModel.js";
import { createRaymarchFieldCache } from "./fieldCache.js";

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
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
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
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
      uniforms,
    });

    expect(mesh.material.steps).toBe(64);
    expect(mesh.material.radiusNode).toBe(uniforms.uRadius);
    expect(mesh.material.opacityGainNode).toBe(uniforms.uOpacityGain);
  });

  it("supports separate backbone and detail capacities", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      backboneCapacity: 8,
      detailCapacity: 4,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material.steps).toBe(64);
  });

  it("caches analytic and field-cache material variants per boundary mode", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      fieldCacheTexture: fieldCache.texture,
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    expect(materialCache.neumann.analytic.rectangular).toBeTruthy();
    expect(materialCache.neumann.cached).toEqual({});
    expect(materialCache.dirichlet.analytic.rectangular).toBeTruthy();
    expect(materialCache.dirichlet.cached).toEqual({});
    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("analytic");
    expect(mesh.userData.raymarchCavityGeometry).toBe("rectangular");

    setRaymarchFieldEvaluationMode(mesh, "cached");
    expect(mesh.material).toBe(materialCache.neumann.cached.rectangular);
    expect(materialCache.neumann.cached.rectangular).toBeTruthy();
    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.cached.rectangular);
    expect(materialCache.dirichlet.cached.rectangular).toBeTruthy();
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
  });

  it("keeps geometry-aware material switching compatible with boundary and cache mode changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      fieldCacheTexture: fieldCache.texture,
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    setRaymarchFieldEvaluationMode(mesh, "cached");
    setRaymarchCavityGeometry(mesh, "spherical");
    setRaymarchBoundaryMode(mesh, "dirichlet");

    expect(mesh.userData.raymarchCavityGeometry).toBe("spherical");
    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.cached.spherical);
    expect(materialCache.neumann.cached.spherical).toBeTruthy();
    expect(materialCache.dirichlet.cached.spherical).toBeTruthy();
  });
});
