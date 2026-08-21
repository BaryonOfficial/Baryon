import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import { createVisualizationUniforms } from "../visualizationUniforms.js";
import { VOLUME_SHAPES } from "../volumeShape.js";
import {
  createIdleOverlay,
  createRaymarchVolumeMesh,
  getRaymarchMaterialCache,
  setRaymarchBoundaryMode,
  setRaymarchCavityGeometry,
  setRaymarchVolumeShape,
  syncIdleOverlayMaterial,
} from "./material.js";
import {
  raymarchLightNode,
  raymarchOpacityNode,
} from "./SafeVolumetricLightingModel.js";

function readMaterialSource() {
  return readFileSync(
    new URL("./material.js", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

function readFieldCacheSamplingSource() {
  return readFileSync(
    new URL("./fieldCacheSampling.js", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

function readCymaticObserverNodeSource() {
  return readFileSync(
    new URL("./cymaticObserverNode.js", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

function expectSourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

// A cache stands in for the baked atlases; building a real render target would
// drag a GPU context into this ownership test.
function makeStubFieldCache() {
  const makeTexture = (name) => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    texture.name = name;
    return texture;
  };
  return {
    observerGeometryTexture: makeTexture("geometry"),
    observerOpticalPairTexture: makeTexture("optical-pair"),
    observerOrganizationTexture: makeTexture("organization"),
  };
}

function makeStubProfileLookup() {
  return {
    texture: new THREE.DataTexture(new Uint16Array(4), 1, 1),
    maximumIntervalWidthWorld: 3,
    maximumSignedDistanceWorld: 2,
    dispose() {},
  };
}

function makeMeshUniforms(overrides = {}) {
  const base = createVisualizationUniforms({
    radius: 3,
  });
  return { ...base, ...overrides };
}

describe("raymarch volume material", () => {
  it("keeps visibility-reactive heuristics out of the material owner", () => {
    const source = readMaterialSource();
    const forbidden = [
      "uThreshold",
      "nodeBand",
      "broadBand",
      "contourCore",
      "bodyDensity",
      "ridgeDensity",
      "boundaryMask",
      "outerShellAccent",
      "radialDistance",
      "centerCompensation",
      "opticalHotCore",
      "hotCoreMix",
      "whiteEmission",
      "observationDensityFloor",
      "projectedCausticRadianceDensity",
      "uBeatPulse",
      "uSpectralCentroid",
      "uSpectralFlux",
      "uTransientEnergy",
      "screenCoordinate",
      "createRaymarchOffsetNode",
    ];

    for (const identifier of forbidden) {
      expect(source).not.toContain(identifier);
    }
  });

  it("renders the persistent cymatic observer without modal work in the march", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toContain("sampleCymaticObserverGeometry");
    expect(block).toContain("sampleCymaticObserverOpticalState");
    expect(block).not.toContain("samplePotentialAndGradient");
    expect(block).not.toContain("evaluateAnalyticWaterRadiationPotentialNode");
    expect(block).toContain("deriveCymaticPlasmaCarrierNode");
    expect(block).toContain("deriveCymaticPlasmaTransferNode");
    expect(block).toContain(
      "signedDistanceWorld: observerGeometry.signedDistanceWorld",
    );
    expect(block).toContain(
      "surfaceNormalWorld: observerGeometry.surfaceNormalWorld",
    );
    expect(block).toContain("surfaceSupport: observer.localSurfaceSupport");
    expect(block).toContain("stepSize,");
    expect(block).toContain("localRadiance: observer.localRadiance");
    expect(block).toContain(
      "fineDetailAuthority: observer.localFineDetailAuthority",
    );
    expect(block).not.toContain("fieldValue:");
    expect(block).not.toContain("gradient:");

    for (const forbiddenCacheOwner of [
      "deriveBoundedCausticAccentAuthorityNode",
      "modalPhaseInterferenceTexture",
      "laserIrradianceTexture",
      "modalObservedFieldTexture",
      "texture3D(",
      "evaluateAnalyticModalPathIntegralNode",
      "deriveDirectOpticalIrradianceNode",
      "integratedHessianQuadrature",
      "quadratureWeightGroups",
    ]) {
      expect(block).not.toContain(forbiddenCacheOwner);
    }
  });

  it("does not expose the retired fine-field topology sampler", () => {
    const source = readFieldCacheSamplingSource();

    expect(source).not.toContain("samplePotentialAndGradient");
    expect(source).not.toContain("fineFieldTexture");
  });

  it("uses canonical sparse field reads and one full history footprint", () => {
    const samplingSource = readFieldCacheSamplingSource();
    const observerSource = readCymaticObserverNodeSource();
    const samplerBlock = expectSourceBlock(
      samplingSource,
      "export function createFieldCacheSampler",
      "// Field cache sampling owner end.",
    );
    const observerPayloadBlock = expectSourceBlock(
      observerSource,
      "const payload = Fn(() => {",
      "const geometryLane",
    );

    expect(
      samplerBlock.match(/createFieldCacheSamplingFootprintFromVoxelNode/g),
    ).toHaveLength(1);
    expect(
      samplerBlock.match(/sampleFieldCacheAtlasAtFootprintNode/g),
    ).toHaveLength(1);
    expect(samplerBlock.match(/fixedRenderTargetTexture\(/g)).toHaveLength(1);
    expect(samplerBlock).toContain(
      "fixedRenderTargetTextureLoadAtKnownHeight(",
    );
    expect(samplerBlock).toContain("footprint.nearestTexel");
    expect(samplerBlock).not.toContain(
      "sampleFieldCacheAtlasNearestAtFootprintNode(",
    );
    expect(samplerBlock).toContain(
      "sampleCymaticObserverOpticalState(footprint)",
    );
    expect(samplerBlock).toContain(").toVar();\n      const organization =");
    expect(
      observerPayloadBlock.match(/createFieldCacheSamplingFootprintNode/g),
    ).toHaveLength(1);
    expect(
      observerPayloadBlock.match(/sampleFieldCacheAtlasAtFootprintNode/g),
    ).toHaveLength(3);
    expect(
      observerPayloadBlock.match(
        /createSparseResolvedFieldCacheFootprintNode/g,
      ),
    ).toHaveLength(1);
    expect(
      observerPayloadBlock.match(/sampleSparseResolvedFieldCacheTopologyNode/g),
    ).toHaveLength(2);
    expect(
      observerPayloadBlock.match(/sampleSparseResolvedFieldCacheLaneNode/g),
    ).toHaveLength(4);
    expect(observerPayloadBlock).not.toContain(
      "sampleFieldCacheAtlasAtVoxelCenterNode",
    );
    expect(samplingSource).toContain(
      "clampAndCanonicalizeFieldCacheVoxelIndexNode(",
    );
    expect(samplingSource).toContain("deriveFieldCacheVoxelRankNode(");
  });

  it("uses observed acoustic energy for radiance without changing carrier topology", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toContain("localRadiance: observer.localRadiance");
    expect(block).toContain(
      "signedDistanceWorld: observerGeometry.signedDistanceWorld",
    );
    expect(block).not.toContain("uRadiationPotentialExposureDrive");
    expect(block).not.toContain("fieldValue: analyticField.field.mul(");
    expect(block).not.toContain("uStructuralProjectionDrive");
  });

  it("fails closed when either portable modal packet is unavailable", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toContain("const hasModalResources = Boolean(fieldCache)");
    expect(block).toContain("if (!hasModalResources)");
    expect(block).toContain("baseRadiance: vec3(0.0)");
    expect(block).toContain("accentRadiance: vec3(0.0)");
    expect(block).toContain("extinction: float(0.0)");
    expect(block).not.toContain("glowing-pressure fallback");
  });

  it("lets the cache-resolved carrier alone own emission and extinction", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toMatch(
      /const tracerDensityScale = max\(uDensityGain, float\(0\.0\)\)\s+\.div\(float\(RAYMARCH_DEFAULTS\.densityGain\)\)\s+\.toVar\(\)/,
    );
    expect(block).toContain("materialDensityScale: tracerDensityScale");
    expect(block).not.toContain("carrierExtinctionCoefficient:");
    expect(block).not.toContain("laserExcitedEmissionCoefficient:");
    expect(block).not.toContain("laserAccentGain:");
    expect(block).toContain("deriveCymaticPlasmaCarrierNode");
    expect(block).toContain(
      "continuitySpineDensity: carrier.continuitySpineDensity",
    );
    expect(block).toContain("detailSpineDensity: carrier.detailSpineDensity");
    expect(block).not.toContain("trapSalience");
    expect(block).toContain("coreDensity: carrier.coreDensity");
    expect(block).toContain("sheathDensity: carrier.sheathDensity");
    expect(block).not.toContain("deriveUniformVolumetricTracerMediumNode");
    expect(block).not.toContain("constantExtinctionNode");
  });

  it("uses carrier-contained laser emission without a presentation-owned diffraction split", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toContain("deriveCymaticPlasmaTransferNode");
    expect(block).toContain("tangentAuthority: uCausticStrength");
    expect(block).toContain("tangentPower: uLaserFocus");
    expect(block).not.toContain("darkFieldReferenceTransmission");
    expect(block).not.toContain("straightReferenceIrradiance");
    expect(block).not.toContain("zeroOrderPowerFraction");
    expect(block).not.toContain("diffractedPowerFraction");
    expect(block).not.toContain("transportedIrradiance");
  });

  it("exposes carrier-owned local extinction beside its emitted radiance", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toContain("const opticalTransfer =");
    expect(block).not.toContain("scatteringNode");
    expect(block).toContain("baseRadiance: opticalTransfer.baseRadiance");
    expect(block).toContain("accentRadiance: opticalTransfer.accentRadiance");
    expect(block).toContain("extinction: opticalTransfer.extinction");
  });

  it("gives observer-resolved chromaticity sole ownership of spectral hue", () => {
    const source = readMaterialSource();

    expect(source).toContain(
      "const materialColor = normalizeMaterialChromaticityNode(uColor)",
    );
    expect(source).toContain(
      "const accentColor = normalizeMaterialChromaticityNode(uCausticColor)",
    );
    expect(source).not.toContain("uKeyTint");
    expect(source).toContain("const spectralPresentationEnabled = clamp(");
    expect(source).toContain("uSpectralPresentationEnabled,");
    expect(source).toMatch(
      /const spectralChroma = clamp\(\s*uSpectralChroma,\s*float\(0\.0\),\s*float\(1\.0\),?\s*\)\.toVar\(\)/,
    );
    expect(source).not.toContain("observer.localSpectralPhase");
    expect(source).toContain("observer.localSpectralChromaticity");
    expect(source).toContain("const presentedSpectralChromaticity = mix(");
    expect(source).toContain("vec3(1.0),");
    expect(source).toContain("localSpectralChromaticity,");
    expect(source).toContain("spectralChroma,");
    expect(source).toMatch(
      /mix\(\s*materialColor,\s*presentedSpectralChromaticity,\s*spectralPresentationEnabled,?\s*\)/,
    );
    expect(source).toMatch(
      /mix\(\s*accentColor,\s*presentedSpectralChromaticity,\s*spectralPresentationEnabled,?\s*\)/,
    );
    expect(source).not.toMatch(/\batan\(/);
    expect(source).not.toContain("texture(");
    expect(source).not.toContain(
      "resolveInterpolatedSpectralChromaticityNode(",
    );
    expect(source).not.toContain("spectralColorimetryTexture");
    expect(source).not.toContain("spectralSeedChromaticityNode");
    expect(source).not.toContain("If(");
    expect(source).not.toContain(
      "mix(\n        materialColor,\n        localSpectralChromaticity,\n        spectralPresentationEnabled",
    );
    expect(source).not.toContain("localSpectralAuthority");
    expect(source).not.toContain("uSpectralMix");
    expect(source).not.toContain("spectralMix");
  });

  it("normalizes static and spectral colors to the same luminance convention", () => {
    const source = readMaterialSource();
    const chromaticityBlock = expectSourceBlock(
      source,
      "function normalizeMaterialChromaticityNode",
      "/**\n * @param {{",
    );

    expect(chromaticityBlock).toContain("LINEAR_RGB_LUMINANCE");
    expect(chromaticityBlock).toContain(
      "return nonnegativeColor.div(max(luminance, float(1e-6)))",
    );
    expect(source).not.toContain("spectralLaneTexture");
    expect(source).not.toContain("sampleSpectralLaneCacheNode");
    expect(source).not.toContain("normalizeRgbPeak");
    expect(source).toContain("observer.localSpectralChromaticity");
  });

  it("keeps per-sample optical work fixed while failing closed without observer resources", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createVolumetricOpticalModel",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    expect(block).toContain("deriveCymaticPlasmaTransferNode");
    expect(block).toContain("if (!hasModalResources)");
    expect(block).toContain("localRadiance: observer.localRadiance");
    expect(block).toContain("sampleCymaticObserverGeometry(sampleDistance)");
    expect(block).toContain("sampleCymaticObserverOpticalState(");
    expect(block).not.toContain("hasProfileSupport");
    expect(block).not.toContain("localRadiance.greaterThan");
    expect(block).not.toContain("uRadiationPotentialExposureDrive");
    expect(block).not.toContain("uModalFieldModeCount");
    expect(block).not.toContain("const transportReady");
    expect(block).not.toContain("uLaserAccentEvaluationCurrent");
    expect(block).not.toContain("holographicBaseRadianceGain");
    expect(block).not.toContain("deriveUniformVolumetricTracerMediumNode");
    expect(block).not.toContain("constantExtinctionNode");
    expect(block).not.toContain("deriveBoundedCausticAccentAuthorityNode");
    expect(block).not.toContain("deriveVolumetricCausticMaterialTransferNode");
  });

  it("uses deterministic quadrature rather than a stochastic ray offset", () => {
    const source = readMaterialSource();
    const raymarchBlock = expectSourceBlock(
      source,
      "export function createRaymarchVolumeMesh",
      "const IDLE_LOGO_CORE_LAYER",
    );

    expect(raymarchBlock).not.toContain("screenCoordinate");
    expect(raymarchBlock).not.toContain("fract(");
    expect(raymarchBlock).not.toContain("offsetNode");
  });

  it("composites premultiplied integrated radiance without multiplying alpha twice", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.premultipliedAlpha).toBe(false);
    expect(mesh.material.blending).toBe(THREE.CustomBlending);
    expect(mesh.material.blendSrc).toBe(THREE.OneFactor);
    expect(mesh.material.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(mesh.material.blendSrcAlpha).toBe(THREE.OneFactor);
    expect(mesh.material.blendDstAlpha).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(mesh.material.outputNode).toBeDefined();
    expect(mesh.material.createOpticalTransferRaySampler).toBeDefined();
    expect(mesh.material.scatteringNode).toBeNull();
    expect(mesh.material.constantExtinctionNode).toBeUndefined();
    expect(mesh.material.offsetNode).toBeNull();
    expect(raymarchLightNode.isPropertyNode).toBe(true);
    expect(raymarchOpacityNode.isPropertyNode).toBe(true);
  });

  it("renders the authoritative idle mesh as a layered hologram", () => {
    const uniforms = makeMeshUniforms();
    const baryonGeometry = new THREE.BoxGeometry(1, 1, 0.2);
    const idleOverlay = createIdleOverlay({
      baryonGeometry,
      uniforms,
    });
    const core = idleOverlay.children.find(
      (child) => child.userData.idleLogoLayer === "core",
    );
    const energyShell = idleOverlay.children.find(
      (child) => child.userData.idleLogoLayer === "energy-shell",
    );

    expect(idleOverlay).toBeInstanceOf(THREE.Group);
    expect(idleOverlay.userData.holographicIdleLogo).toBe(true);
    expect(core).toBeInstanceOf(THREE.Mesh);
    expect(energyShell).toBeInstanceOf(THREE.Mesh);
    expect(core.geometry).not.toBe(baryonGeometry);
    expect(energyShell.geometry).not.toBe(baryonGeometry);
    expect(core.geometry).not.toBe(energyShell.geometry);
    expect(core.geometry.attributes.position.count).toBe(
      baryonGeometry.attributes.position.count,
    );
    expect(energyShell.geometry.attributes.position.count).toBe(
      baryonGeometry.attributes.position.count,
    );
    expect(core.material.isMeshBasicNodeMaterial).toBe(true);
    expect(core.material.colorNode).toBeDefined();
    expect(core.material.opacityNode).toBeDefined();
    expect(core.material.transparent).toBe(true);
    expect(core.material.depthWrite).toBe(false);
    expect(core.material.side).toBe(THREE.DoubleSide);
    expect(core.material.toneMapped).toBe(false);
    expect(energyShell.material.isMeshBasicNodeMaterial).toBe(true);
    expect(energyShell.material.colorNode).toBeDefined();
    expect(energyShell.material.opacityNode).toBeDefined();
    expect(energyShell.material.blending).toBe(THREE.AdditiveBlending);
    expect(energyShell.material.transparent).toBe(true);
    expect(energyShell.material.depthWrite).toBe(false);
    expect(energyShell.material.toneMapped).toBe(false);
    expect(energyShell.scale.x).toBeCloseTo(1.018);

    syncIdleOverlayMaterial(idleOverlay, {
      color: "#d9b878",
      intensity: 0,
    });
    expect(uniforms.uIdleLogoColor.value.getHexString()).toBe("d9b878");
    expect(uniforms.uIdleLogoIntensity.value).toBe(0);
  });

  it("keeps the idle hologram rim-led with a low-contrast view-aligned raster", () => {
    const source = readMaterialSource();
    const shellBlock = expectSourceBlock(
      source,
      "function createIdleLogoEnergyShellMaterial",
      "export function createIdleOverlay",
    );
    const overlayBlock = source.slice(
      source.indexOf("export function createIdleOverlay"),
    );

    // The raster lives in view space and only modulates brightness — it is
    // never added into color as bright bands.
    expect(shellBlock).toContain("positionView.y");
    expect(shellBlock).toContain("scanShade");
    expect(shellBlock).not.toContain("warmScan");
    expect(shellBlock).not.toContain("interference");
    // The refresh sweep normalizes by geometry height so any loaded logo
    // mesh gets the same scan cadence.
    expect(shellBlock).toContain("normalizedHeight");
    expect(overlayBlock).toContain(
      "resolveIdleLogoHeightExtents(baryonGeometry)",
    );
  });

  it("preserves the schema-owned idle logo intensity range in the material projection", () => {
    const source = readMaterialSource();
    const visibilityBlock = expectSourceBlock(
      source,
      "function deriveIdleLogoVisibilityNodes",
      "function deriveIdleLogoNormalizedHeightNode",
    );

    expect(visibilityBlock).toContain("max(");
    expect(visibilityBlock).not.toContain("clamp(");
    expect(visibilityBlock).not.toContain("float(3.5)");
  });

  it("keeps fixed plasma width out of runtime uniforms", () => {
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({ radius: 3, uniforms });
    const cache = getRaymarchMaterialCache(mesh);

    expect(uniforms).not.toHaveProperty("uCarrierCoreFwhmWorld");
    expect(uniforms).not.toHaveProperty("uHolographicBaseRadianceGain");
    expect(uniforms).not.toHaveProperty("uContourSharpness");
    expect(uniforms).not.toHaveProperty("uThreshold");
    for (const material of Object.values(cache)) {
      expect(material.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
      expect(material.radiusNode).toBe(uniforms.uRadius);
    }
  });

  it("binds the field cache the bake fills, without spatial textures", () => {
    const fieldCache = makeStubFieldCache();
    const plasmaProfileLookup = makeStubProfileLookup();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
      fieldCache,
      plasmaProfileLookup,
      modalFieldCapacity: 4,
    });

    expect(mesh.userData.raymarchFieldCache).toBe(fieldCache);
    expect(mesh.material.fieldCache).toBe(fieldCache);
    expect(mesh.material.plasmaProfileLookup).toBe(plasmaProfileLookup);
    expect(mesh.material.modalFieldCapacity).toBe(4);
    expect(mesh.material).not.toHaveProperty("modalObservedFieldTexture");
    expect(mesh.material).not.toHaveProperty("laserIrradianceTexture");
  });

  it("requires the runtime-owned profile lookup with a field cache", () => {
    expect(() =>
      createRaymarchVolumeMesh({
        radius: 3,
        uniforms: makeMeshUniforms(),
        fieldCache: makeStubFieldCache(),
      }),
    ).toThrow("plasmaProfileLookup is required when fieldCache is present");
  });

  it("keeps spectral presentation portable without lane textures", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });

    expect(mesh.userData).not.toHaveProperty(
      "raymarchSpectralLightEvaluationMode",
    );
    expect(mesh.material).not.toHaveProperty("spectralLaneTextureA");
    expect(mesh.material).not.toHaveProperty("spectralLaneTextureB");
    expect(mesh.material).not.toHaveProperty("spectralLaneStatsTexture");
  });

  it("shares one field cache across material variants", () => {
    const fieldCache = makeStubFieldCache();
    const plasmaProfileLookup = makeStubProfileLookup();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
      fieldCache,
      plasmaProfileLookup,
      modalFieldCapacity: 4,
    });

    // Boundary family selects what the bake writes, not what the march reads,
    // so every variant must sample the same cache rather than fork one.
    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material.fieldCache).toBe(fieldCache);
  });

  it("records boundary and cavity without forking a material", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    // Boundary family selects which field the bake writes; cavity geometry
    // selects the atlas on the CPU. Neither reaches this shader, so both are
    // recorded state and the march keeps sampling one material.
    expect(mesh.material).toBe(materialCache.sphere);

    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");
    expect(mesh.material).toBe(materialCache.sphere);

    setRaymarchCavityGeometry(mesh, "spherical");
    expect(mesh.userData.raymarchCavityGeometry).toBe("spherical");
    expect(mesh.material).toBe(materialCache.sphere);

    expect(Object.keys(materialCache)).toEqual(["sphere"]);
  });

  it("compiles one material per volume shape and no more", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);
    const sphereMaterial = mesh.material;

    setRaymarchVolumeShape(mesh, "cube");
    expect(mesh.material).not.toBe(sphereMaterial);
    expect(mesh.material.raymarchVolumeShape).toBe("cube");

    // Returning to a shape must reuse its material rather than recompile.
    setRaymarchVolumeShape(mesh, "sphere");
    expect(mesh.material).toBe(sphereMaterial);
    expect(Object.keys(materialCache).sort()).toEqual(["cube", "sphere"]);
  });

  it("changes only the finite observation hull when switching volume shape", () => {
    const source = readMaterialSource();
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({ radius: 3, uniforms });
    const sphereMaterial = mesh.material;

    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.geometry.parameters.radius).toBeCloseTo(3 * 1.01);

    setRaymarchVolumeShape(mesh, VOLUME_SHAPES.cube);
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(mesh.geometry.parameters.width).toBeCloseTo(3 * 2 * 1.01);
    expect(mesh.material).not.toBe(sphereMaterial);
    expect(mesh.material.radiusNode).toBe(uniforms.uRadius);
    expect(mesh.material.domainHalfExtentsNode).toBeDefined();

    setRaymarchVolumeShape(mesh, VOLUME_SHAPES.sphere);
    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.material).toBe(sphereMaterial);

    const setter = expectSourceBlock(
      source,
      "export function setRaymarchVolumeShape",
      "export function setRaymarchCavityGeometry",
    );
    expect(setter).not.toContain("modalBasis");
    expect(setter).not.toContain("uRadius.value");

    const domainBuilder = expectSourceBlock(
      source,
      "function createVolumeDomainGeometry",
      "function resolveMaterialStepBudget",
    );
    for (const forbiddenCarrierOwner of [
      "deriveTrapWeightedSurfaceCarrierDensityNode",
      "coreDensity",
      "sheathDensity",
      "sourceRadiance",
      "modalObservedFieldTexture",
      "modalPhaseInterferenceTexture",
    ]) {
      expect(domainBuilder).not.toContain(forbiddenCarrierOwner);
    }
  });
});

describe("raymarch volume mesh disposal", () => {
  it("shares and disposes one fixed-profile lookup across material variants", async () => {
    const { disposeRaymarchRuntime } = await import("./runtime.js");
    const lookup = makeStubProfileLookup();
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
      fieldCache: makeStubFieldCache(),
      plasmaProfileLookup: lookup,
    });
    expect(mesh.userData).not.toHaveProperty("raymarchPlasmaProfileLookup");
    expect(mesh.material.plasmaProfileLookup).toBe(lookup);

    setRaymarchVolumeShape(mesh, "cube");
    expect(mesh.material.plasmaProfileLookup).toBe(lookup);

    let disposeCalls = 0;
    lookup.dispose = () => {
      disposeCalls += 1;
    };
    const group = new THREE.Group();
    group.add(mesh);
    disposeRaymarchRuntime({ points: group, plasmaProfileLookup: lookup });

    expect(disposeCalls).toBe(1);
  });

  it("disposes every cached material through the flat shape cache", async () => {
    // The cache used to be nested a level deeper, keyed by boundary family as
    // well. Walking it as if it still were reaches the materials' own
    // properties instead of the materials, which throws on teardown — and
    // teardown only runs on canvas remount, so nothing else notices.
    const { disposeRaymarchRuntime } = await import("./runtime.js");
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });
    setRaymarchVolumeShape(mesh, "cube");
    const cache = getRaymarchMaterialCache(mesh);
    const materials = Object.values(cache);
    expect(materials.length).toBeGreaterThan(1);
    const disposed = materials.map((material) => {
      let calls = 0;
      material.dispose = () => {
        calls += 1;
      };
      return () => calls;
    });

    const group = new THREE.Group();
    group.add(mesh);
    expect(() => disposeRaymarchRuntime({ points: group })).not.toThrow();

    for (const readCalls of disposed) {
      expect(readCalls()).toBe(1);
    }
  });
});
