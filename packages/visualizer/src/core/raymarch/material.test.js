import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

function expectSourceIndex(source, needle) {
  const index = source.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("raymarch volume material", () => {
  it("uses observation transfer as the only shader density visibility lane", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const modalStructureAnchorStart = source.indexOf(
      "const modalStructureAnchor = beamCore",
    );
    const ridgeAnchorStart = source.indexOf("const ridgeAnchor =");
    const observationEnergyStart = source.indexOf(
      "const observationEnergy = clamp(",
    );
    const observationSupportStart = source.indexOf(
      "const observationSupport = clamp(",
    );
    const modalStructureAnchorBlock = source.slice(
      modalStructureAnchorStart,
      ridgeAnchorStart,
    );
    const observationEnergyBlock = source.slice(
      observationEnergyStart,
      observationSupportStart,
    );

    expect(modalStructureAnchorStart).toBeGreaterThanOrEqual(0);
    expect(ridgeAnchorStart).toBeGreaterThan(modalStructureAnchorStart);
    expect(observationEnergyStart).toBeGreaterThanOrEqual(0);
    expect(observationSupportStart).toBeGreaterThan(observationEnergyStart);
    expect(source).toContain("deriveObservationTransferNode");
    expect(source).toContain("uObservationDensityFadeStart");
    expect(source).toContain("uObservationDensityFadeEnd");
    expect(source).toContain("uObservationTransferGain");
    expect(source).toContain("uObservationDensityFloor");
    expect(source).toContain("uObservationContourSupportScale");
    expect(source).not.toContain("OBSERVATION_TRANSFER_DEFAULTS");
    expect(source).not.toContain("deriveVisibleDensityNode");
    expect(source).not.toContain("BASS_STRUCTURE_FLOOR");
    expect(source).not.toContain("lowQBackboneRidge");
    expect(source).not.toContain("lowQBackboneContourAccent");
    expect(source).not.toContain("retainedHighQRidge");
    expect(source).not.toContain("retainedHighQContourAccent");
    expect(modalStructureAnchorBlock).not.toContain("visibleStructure");
    expect(modalStructureAnchorBlock).not.toContain(".mul(structure)");
    expect(observationEnergyBlock).not.toContain("modalPhaseOverlayEnergy");
  });

  it("does not feed contour-only support into observation density authority", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("ridgeSupportAnchor");
    expect(source).not.toContain("max(contourShape, ridgeConcentration)");
    expect(source).toMatch(
      /const ridgePhysicalAnchor = max\(\s*ridgeAnchor,\s*fieldGradientMagnitude,?\s*\);/,
    );
  });

  it("gates broad body fill by signed field mass authority before observation", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const signedAuthorityStart = expectSourceIndex(
      source,
      "const signedBodyAuthority =",
    );
    const bodyDensityStart = expectSourceIndex(source, "const bodyDensity =");
    const observationTransferStart = expectSourceIndex(
      source,
      "const observationTransfer = deriveObservationTransferNode(",
    );

    expect(bodyDensityStart).toBeGreaterThan(signedAuthorityStart);
    expect(observationTransferStart).toBeGreaterThan(bodyDensityStart);
    expect(source).toContain("SIGNED_INTERFERENCE_BODY_AUTHORITY_START");
    expect(source).toContain("SIGNED_INTERFERENCE_BODY_AUTHORITY_END");
    expect(source).toContain("SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER");
    expect(source).toMatch(
      /const signedBodyAuthority = smoothstep\(\s*float\(SIGNED_INTERFERENCE_BODY_AUTHORITY_START\),\s*float\(SIGNED_INTERFERENCE_BODY_AUTHORITY_END\),\s*normalizedFieldAbs,?\s*\)\.pow\(\s*float\(SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER\),?\s*\);/,
    );
    expect(source).toMatch(/\.mul\(\s*signedBodyAuthority\s*\)/);
  });

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

  it("routes white emission through the adaptive highlight target", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { deriveHighlightTargetNode } from "../../render/displayRadiance.js";',
    );
    expect(source).toContain("STATIC_HIGHLIGHT_SURFACE_PULL_SCALE");
    expect(source).toContain("staticWhiteEmissionMix");
    expect(source).toContain("spectralLightWhiteEmissionMix");
    expect(source).toContain(`deriveHighlightTargetNode(
        staticHolographicColor,
        uSurfaceColor,
        staticWhiteEmissionMix,
        float(STATIC_HIGHLIGHT_SURFACE_PULL_SCALE),
      )`);
    expect(source).toContain(`deriveHighlightTargetNode(
            spectralLightHolographicColor,
            uSurfaceColor,
            spectralLightWhiteEmissionMix,
          )`);
    expect(source).not.toContain(`const staticHolographicLaserColor = mix(
        staticHolographicColor,
        vec3(1.0),`);
    expect(source).not.toContain(`const spectralLightHolographicLaserColor = mix(
            spectralLightHolographicColor,
        vec3(1.0),`);
  });

  it("scales broad surface-tint pulls in static color mode", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("STATIC_SURFACE_TINT_SCALE");
    expect(source).toContain(
      "spectralColorBias.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
    expect(source).toContain(
      "contourAccent.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
    expect(source).toContain(
      "boundarySurfacePull.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
    expect(source).toContain(
      "holographicColorMix.mul(float(STATIC_SURFACE_TINT_SCALE))",
    );
  });

  it("gates beam, observation, and highlight radiance by signed cancellation authority", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const cancellationStart = expectSourceIndex(
      source,
      "const signedCancellationAuthority =",
    );
    const radianceStart = expectSourceIndex(
      source,
      "const signedRadianceAuthority =",
    );
    const beamDensityStart = expectSourceIndex(source, "const beamDensity =");
    const modalStructureAnchorStart = expectSourceIndex(
      source,
      "const modalStructureAnchor = beamCore",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence =",
    );

    expect(radianceStart).toBeGreaterThan(cancellationStart);
    expect(beamDensityStart).toBeGreaterThan(radianceStart);
    expect(modalStructureAnchorStart).toBeGreaterThan(radianceStart);
    expect(spectralPresenceStart).toBeGreaterThan(radianceStart);
    expect(source).toContain("SIGNED_INTERFERENCE_RADIANCE_GATE_MIN");
    expect(source).toMatch(
      /const beamDensity =[\s\S]*?\.mul\(signedRadianceAuthority\)/,
    );
    expect(source).toMatch(
      /const modalStructureAnchor = beamCore[\s\S]*?\.mul\(signedRadianceAuthority\)/,
    );
    expect(source).toMatch(
      /const spectralLightPresence = smoothstep\([\s\S]*?\)\.mul\(signedRadianceAuthority\)/,
    );
    expect(source).toMatch(
      /const crowdedWhiteEmissionMix = holographicEmissionLift[\s\S]*?\.mul\(signedRadianceAuthority\)/,
    );
  });

  it("keeps broad body authority out of nodal radiance lanes", () => {
    const source = readFileSync(
      new URL("./material.js", import.meta.url),
      "utf8",
    );
    const signedBodyStart = expectSourceIndex(
      source,
      "const signedBodyAuthority =",
    );
    const beamDensityStart = expectSourceIndex(source, "const beamDensity =");
    const modalStructureAnchorStart = expectSourceIndex(
      source,
      "const modalStructureAnchor = beamCore",
    );
    const spectralPresenceStart = expectSourceIndex(
      source,
      "const spectralLightPresence =",
    );

    expect(beamDensityStart).toBeGreaterThan(signedBodyStart);
    expect(modalStructureAnchorStart).toBeGreaterThan(signedBodyStart);
    expect(spectralPresenceStart).toBeGreaterThan(signedBodyStart);
    expect(source).not.toContain("signedFieldRadianceAuthority");
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
    expect(uniforms.uObservationDensityFadeStart.value).toBeCloseTo(0.22);
    expect(uniforms.uObservationDensityFadeEnd.value).toBeCloseTo(0.34);
    expect(uniforms.uObservationTransferGain.value).toBeCloseTo(2.2);
    expect(uniforms.uObservationDensityFloor.value).toBeCloseTo(0.22);
    expect(uniforms.uObservationContourSupportScale.value).toBeCloseTo(0.035);
    expect(uniforms.uModalResponseBackboneEnergy.value).toBe(0);
    expect(uniforms.uModalResponseDetailEnergy.value).toBe(0);
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

  it("keeps Spectral Light material switching independent from field evaluation", () => {
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

    setRaymarchFieldEvaluationMode(mesh, "cached");
    const cachedFieldMaterial = mesh.material;
    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );

    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );
    expect(mesh.material).not.toBe(cachedFieldMaterial);
    expect(mesh.material.fieldEvaluationMode).toBe("cached");
    expect(mesh.material.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
    );

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );

    expect(mesh.userData.raymarchFieldEvaluationMode).toBe("cached");
    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(mesh.material.fieldEvaluationMode).toBe("cached");
    expect(mesh.material.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
  });
});
