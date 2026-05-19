import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AUDIO_DEFAULTS } from "../../defaults.js";
import {
  RAYMARCH_BOUNDARY_TUNING,
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  RAYMARCH_SPECTRAL_LIGHT_TUNING,
  createRaymarchVolumeMesh,
  getRaymarchMaterialCache,
  setRaymarchBoundaryMode,
  setRaymarchCavityGeometry,
  setRaymarchSpectralLightEvaluationMode,
  setRaymarchFieldEvaluationMode,
} from "./material.js";
import { createRaymarchUniforms } from "./uniforms.js";
import { raymarchOpacityNode } from "./SafeVolumetricLightingModel.js";
import {
  createRaymarchPhaseOverlayCache,
  createRaymarchSpectralLightCache,
  createRaymarchFieldCache,
} from "./fieldCache.js";

function makeMeshUniforms(overrides = {}) {
  const base = createRaymarchUniforms({
    radius: 3,
    steps: 64,
  });
  return { ...base, ...overrides };
}

describe("raymarch volume material", () => {
  it("keeps Spectral Light shader tuning vivid instead of neutralizing color", () => {
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING.contourShadow).toBeGreaterThan(0.95);
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING.hotCoreSurfacePull).toBeLessThan(0.2);
    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.holographicAccentMix,
    ).toBeLessThanOrEqual(0.03);
    expect(RAYMARCH_SPECTRAL_LIGHT_TUNING.holographicAccentColorPull).toBe(0);
    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.whiteEmissionLift,
    ).toBeLessThanOrEqual(0.015);
    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.directPresenceEnd,
    ).toBeLessThanOrEqual(0.05);
    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.cachedPresenceEnd,
    ).toBeLessThanOrEqual(0.07);
    expect(
      RAYMARCH_SPECTRAL_LIGHT_TUNING.uncoloredNeutralLift,
    ).toBeLessThanOrEqual(0.04);
  });

  it("softens Dirichlet beam lighting so nodal planes do not dominate", () => {
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletBeamDensity).toBeGreaterThan(0.55);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletBeamDensity).toBeLessThan(0.75);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletHotCore).toBeLessThan(0.15);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletSurfacePull).toBeLessThan(0.12);
    expect(RAYMARCH_BOUNDARY_TUNING.dirichletWhiteEmission).toBeLessThan(0.1);
  });

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

    expect(mesh.material.steps).toBe(88);
    expect(mesh.material.radiusNode).toBe(uniforms.uRadius);
    expect(mesh.material.opacityGainNode).toBe(uniforms.uOpacityGain);
    expect(uniforms.uModalObserverVisibilityEnergy.value).toBe(0);
    expect(uniforms.uModalVisibilityRetainedHighQEnergy.value).toBe(0);
    expect(uniforms.uLowQBackboneVisibilityEnergy.value).toBe(0);
    expect(mesh.userData).not.toHaveProperty("raymarchBackbonePhaseBuffer");
    expect(mesh.userData).not.toHaveProperty("raymarchDetailPhaseBuffer");
  });

  it("binds phase overlay texture only on cached material variants", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const phaseOverlayCache = createRaymarchPhaseOverlayCache({
      resolution: 8,
    });
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      fieldCacheTexture: fieldCache.texture,
      phaseOverlayTexture: phaseOverlayCache.texture,
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
      uniforms,
    });

    expect(mesh.userData.raymarchPhaseOverlayTexture).toBe(
      phaseOverlayCache.texture,
    );
    expect(mesh.material.phaseOverlayTexture).toBe(phaseOverlayCache.texture);
    expect(uniforms.uModalPhaseOverlayStrength.value).toBe(0);
    expect(mesh.userData).not.toHaveProperty("raymarchBackbonePhaseBuffer");
    expect(mesh.userData).not.toHaveProperty("raymarchDetailPhaseBuffer");

    setRaymarchFieldEvaluationMode(mesh, "cached");

    expect(mesh.material.phaseOverlayTexture).toBe(phaseOverlayCache.texture);

    setRaymarchFieldEvaluationMode(mesh, "direct");

    expect(mesh.material.phaseOverlayTexture).toBeNull();
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
    expect(mesh.material.steps).toBe(88);
  });

  it("starts cached/off and creates direct variants only on explicit request", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      fieldCacheTexture: fieldCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    expect(materialCache.neumann.direct).toEqual({});
    expect(materialCache.dirichlet.direct).toEqual({});
    expect(materialCache.neumann.cached.off.rectangular).toBeTruthy();
    expect(materialCache.dirichlet.cached.off.rectangular).toBeTruthy();
    expect(materialCache.neumann.cached.cached).toBeUndefined();
    expect(mesh.material).toBe(materialCache.neumann.cached.off.rectangular);
    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(mesh.userData.raymarchCavityGeometry).toBe("rectangular");

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(mesh.material).toBe(materialCache.neumann.cached.cached.rectangular);
    expect(materialCache.neumann.cached.cached.rectangular).toBeTruthy();
    expect(materialCache.neumann.direct).toEqual({});
    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material).toBe(
      materialCache.dirichlet.cached.cached.rectangular,
    );
    expect(materialCache.dirichlet.cached.cached.rectangular).toBeTruthy();
    expect(materialCache.dirichlet.direct).toEqual({});
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");

    setRaymarchFieldEvaluationMode(mesh, "direct");
    expect(mesh.material).toBe(
      materialCache.dirichlet.direct.cached.rectangular,
    );
    expect(materialCache.dirichlet.direct.cached.rectangular).toBeTruthy();
  });

  it("keeps geometry-aware material switching compatible with boundary and cache mode changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      backboneModeBuffer: {},
      detailModeBuffer: {},
      backboneColorBuffer: {},
      detailColorBuffer: {},
      fieldCacheTexture: fieldCache.texture,
      spectralLightCacheTexture: spectralLightCache.texture,
      backboneCapacity: AUDIO_DEFAULTS.backboneStackSlots,
      detailCapacity: AUDIO_DEFAULTS.detailStackSlots,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    setRaymarchFieldEvaluationMode(mesh, "cached");
    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    setRaymarchCavityGeometry(mesh, "spherical");
    setRaymarchBoundaryMode(mesh, "dirichlet");

    expect(mesh.userData.raymarchCavityGeometry).toBe("spherical");
    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.cached.cached.spherical);
    expect(materialCache.neumann.cached.cached.spherical).toBeTruthy();
    expect(materialCache.dirichlet.cached.cached.spherical).toBeTruthy();
  });
});
