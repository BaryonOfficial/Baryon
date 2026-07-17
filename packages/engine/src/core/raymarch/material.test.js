import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import { createVisualizationUniforms } from "../visualizationUniforms.js";
import { VOLUME_SHAPES } from "../volumeShape.js";
import {
  createRaymarchLiveFieldProjectionCache,
  createRaymarchModalBasisCache,
} from "./fieldCache.js";
import { CYMATIC_CARRIER_REFERENCE_PROFILE } from "./fieldShaping.js";
import { HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN } from "./observationTransfer.js";
import {
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  createRaymarchVolumeMesh,
  getRaymarchMaterialCache,
  setRaymarchBoundaryMode,
  setRaymarchCavityGeometry,
  setRaymarchModalBasisAtlasTexture,
  setRaymarchSpectralLightEvaluationMode,
  setRaymarchVolumeShape,
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

function readCarrierDensitySource() {
  return readFileSync(
    new URL("./carrierDensityNode.js", import.meta.url),
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

function makeMeshUniforms(overrides = {}) {
  const base = createVisualizationUniforms({
    radius: 3,
    carrierCoreFwhmWorld: CYMATIC_CARRIER_REFERENCE_PROFILE.coreFwhmWorld,
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

  it("samples one matched pressure and gradient tuple from the live cache", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function sampleLiveFieldProjectionCacheNode",
      "function samplePhaseInterferenceCarrierNode",
    );

    expect(block).toContain("texture3D(modalLiveFieldTexture).sample(basisUv)");
    expect(block).toContain("field: fieldSample.x");
    expect(block).toContain(
      "gradient: vec3(fieldSample.y, fieldSample.z, fieldSample.w)",
    );
    expect(block).not.toContain("modalLiveSupportTexture");
    expect(block).not.toContain("modalPressureRadiationTexture");
    expect(block).not.toContain("normalizedPressure");
  });

  it("applies the same amplitude normalization to synthesized field and gradient", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function synthesizeLiveModalFieldNode",
      "/**\n * @param {{",
    );

    expect(block).toContain(
      "const normalizedField = field.div(modalEnergyAmplitude)",
    );
    expect(block).toContain(
      "const normalizedGradient = gradient.div(modalEnergyAmplitude)",
    );
    expect(block).not.toContain("unsignedSupport");
    expect(block).not.toContain("cancellationRatio");
  });

  it("constructs a fixed world-space core and linked sheath from local field distance", () => {
    const materialSource = readMaterialSource();
    const source = readCarrierDensitySource();
    const block = source.slice(
      source.indexOf("export function deriveFixedWorldSpaceCarrierDensityNode"),
    );

    expect(materialSource).toContain(
      'import { deriveFixedWorldSpaceCarrierDensityNode } from "./carrierDensityNode.js";',
    );
    expect(materialSource).not.toContain(
      "function deriveFixedWorldSpaceCarrierDensityNode",
    );
    expect(block).toContain("const localFieldDistance = abs(fieldValue).div(");
    expect(block).toContain("max(gradientMagnitude, gradientEpsilon)");
    expect(block).toContain("abs(dot(gradientNormal, rayDirLocal))");
    expect(block).toContain("normalDotRay");
    expect(block).toContain("deriveNormalizedGaussianIntervalAverageNode");
    expect(block).toContain(
      "CYMATIC_CARRIER_REFERENCE_PROFILE.sheathWidthRatio",
    );
    expect(block).toContain(
      "CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight",
    );
    expect(block).toContain(
      "CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight",
    );
    expect(block).toContain(".greaterThan(gradientEpsilon)");
  });

  it("uses a narrow reference core with a bounded optical sheath", () => {
    expect(CYMATIC_CARRIER_REFERENCE_PROFILE).toMatchObject({
      coreFwhmWorld: 0.024,
      sheathWidthRatio: 2,
      coreEnergyWeight: 97,
      sheathEnergyWeight: 3,
    });
  });

  it("keeps detector-windowed phase energy out of carrier topology", () => {
    const source = readMaterialSource();
    const carrierSampleBlock = expectSourceBlock(
      source,
      "function samplePhaseInterferenceCarrierNode",
      "const LINEAR_RGB_LUMINANCE",
    );
    const block = expectSourceBlock(
      source,
      "function createScatteringNode",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );
    const densityStart = block.indexOf(
      "const carrier = deriveFixedWorldSpaceCarrierDensityNode",
    );
    const energyStart = block.indexOf(
      "const detectorIntegratedAcousticEnergy =",
    );

    expect(energyStart).toBeGreaterThanOrEqual(0);
    expect(densityStart).toBeGreaterThan(energyStart);
    expect(carrierSampleBlock).toContain(
      "detectorIntegratedSpatialEnergy: clamp(\n      interferenceSample.y",
    );
    expect(carrierSampleBlock).toContain(
      "independentSpatialEnergy: clamp(\n      interferenceSample.w",
    );
    expect(block).toContain(
      "phaseInterferenceCarrier.independentSpatialEnergy",
    );
    expect(block).toContain(
      "phaseInterferenceCarrier.detectorIntegratedSpatialEnergy",
    );
    expect(block).not.toContain("detectorWindowedCoherenceScale");
    expect(block).not.toContain("phaseInterferenceCarrier.contrast");
    const densityBlock = block.slice(
      densityStart,
      block.indexOf("const staticMaterialColor", densityStart),
    );
    expect(densityBlock).not.toContain("phaseInterferenceCarrier");
    expect(densityBlock).not.toContain("detectorIntegratedAcousticEnergy");
  });

  it("uses the emission-extinction transfer exactly once per color branch", () => {
    const source = readMaterialSource();
    const scatteringBlock = expectSourceBlock(
      source,
      "function createScatteringNode",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );
    const calls =
      source.match(/deriveAcousticEnergyMaterialTransferNode\(\{/g) ?? [];

    expect(calls).toHaveLength(2);
    expect(source).toContain("coreDensity,");
    expect(source).toContain("sheathDensity,");
    expect(source).toContain("materialDensityScale,");
    expect(source).toContain(
      "scatteringCoefficient: float(REFERENCE_SCATTERING_COEFFICIENT)",
    );
    expect(source).toContain(
      "absorptionCoefficient: uMaterialAbsorptionCoefficient",
    );
    expect(source).not.toContain("uAbsorption");
    expect(source).toContain("laserExcitedEmissionCoefficient: float(");
    expect(source).toContain("REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,");
    expect(source).toContain(
      "holographicBaseRadianceGain: uHolographicBaseRadianceGain",
    );
    expect(source).toContain("laserAccentAuthority,");
    expect(source).toContain("normalDotRay: carrier.normalDotRay");
    expect(source).toContain("holographicIntensity: uHolographicIntensity");
    expect(source).not.toContain("uHolographicShift");
    expect(source).toContain(
      "holographicFresnelPower: uHolographicFresnelPower",
    );
    expect(source).toContain("baseRadiance: observationRadiance.baseRadiance");
    expect(source).toContain(
      "accentRadiance: observationRadiance.accentRadiance",
    );
    expect(source).toContain("extinction: observationRadiance.extinction");
    expect(scatteringBlock).not.toContain("laserTransportReady");
    expect(source).not.toContain("deriveObservationTransferNode");
    expect(source).not.toContain("extinctionDensity");
  });

  it("uses Color Mix as a continuous static-to-spectral material blend", () => {
    const source = readMaterialSource();

    expect(source).toContain("const spectralMaterialColor = mix(");
    expect(source).toContain("spectralLaneTransfer.rgb,");
    expect(source).toContain("spectralMix,");
    expect(source).toContain(
      "const spectralMix = clamp(uSpectralMix, float(0.0), float(1.0))",
    );
  });

  it("lets static and spectral modes change chromaticity without owning radiance", () => {
    const source = readMaterialSource();
    const chromaticityBlock = expectSourceBlock(
      source,
      "function normalizeMaterialChromaticityNode",
      "function projectSpectralLaneRadianceToRgbNode",
    );
    const spectralBlock = expectSourceBlock(
      source,
      "function projectSpectralLaneRadianceToRgbNode",
      "function sampleSpectralLaneCacheNode",
    );

    expect(chromaticityBlock).toContain("LINEAR_RGB_LUMINANCE");
    expect(chromaticityBlock).toContain(
      "return nonnegativeColor.div(max(luminance, float(1e-6)))",
    );
    expect(spectralBlock).toContain(".div(safeTotal)");
    expect(spectralBlock).toContain(
      "normalizeMaterialChromaticityNode(spectralRgb)",
    );
    expect(spectralBlock).toContain(
      "normalizeMaterialChromaticityNode(fallbackColor)",
    );
    expect(spectralBlock).not.toContain("dominance");
    expect(spectralBlock).not.toContain("entropy");
    expect(spectralBlock).not.toContain("exposure");
    expect(spectralBlock).not.toContain("brightness");
  });

  it("gates accent by readiness and the test-only selector without touching base", () => {
    const source = readMaterialSource();
    const block = expectSourceBlock(
      source,
      "function createScatteringNode",
      "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    );

    // The selected production accent consumes ready current transport;
    // readiness is its only gate and base radiance takes no transport input.
    expect(block).toContain("deriveBoundedCausticAccentAuthorityNode");
    expect(block).toContain("transportReady: uLaserCausticActive");
    expect(block).not.toContain("uLaserAccentEvaluationCurrent");
    expect(block).toContain(
      "LASER_REFERENCE_APPARATUS_PROFILE.zeroOrderPowerFraction",
    );
    // Base gain multiplies only in the shared transfer, which derives base
    // radiance without the accent authority (proven by the transfer's tests).
    expect(block).toContain(
      "holographicBaseRadianceGain: uHolographicBaseRadianceGain",
    );
  });

  it("uses deterministic midpoint integration rather than a stochastic ray offset", () => {
    const source = readMaterialSource();

    expect(source).not.toContain("screenCoordinate");
    expect(source).not.toContain("fract(");
    expect(source).not.toContain("offsetNode");
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
    expect(mesh.material.offsetNode).toBeNull();
    expect(raymarchLightNode.isPropertyNode).toBe(true);
    expect(raymarchOpacityNode.isPropertyNode).toBe(true);
  });

  it("keeps the canonical fixed-width uniform on every material variant", () => {
    const uniforms = makeMeshUniforms();
    const mesh = createRaymarchVolumeMesh({ radius: 3, uniforms });
    const cache = getRaymarchMaterialCache(mesh);

    expect(uniforms.uCarrierCoreFwhmWorld.value).toBe(
      CYMATIC_CARRIER_REFERENCE_PROFILE.coreFwhmWorld,
    );
    expect(uniforms.uHolographicBaseRadianceGain.value).toBe(
      HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN,
    );
    expect(uniforms).not.toHaveProperty("uThreshold");
    expect(cache.neumann.off.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
    expect(cache.dirichlet.off.steps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
    expect(cache.neumann.off.radiusNode).toBe(uniforms.uRadius);
    expect(cache.dirichlet.off.radiusNode).toBe(uniforms.uRadius);
  });

  it("retains cache textures as provenance bindings while material topology uses the matched field tuple", () => {
    const liveCache = createRaymarchLiveFieldProjectionCache({
      resolution: 8,
    });
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
      modalLiveFieldTexture: liveCache.fieldTexture,
      modalLiveSupportTexture: liveCache.supportTexture,
      modalPressureRadiationTexture: liveCache.pressureRadiationTexture,
      modalPhaseInterferenceTexture: liveCache.phaseInterferenceTexture,
    });

    expect(mesh.userData.raymarchModalLiveFieldTexture).toBe(
      liveCache.fieldTexture,
    );
    expect(mesh.userData.raymarchModalLiveSupportTexture).toBe(
      liveCache.supportTexture,
    );
    expect(mesh.userData.raymarchModalPressureRadiationTexture).toBe(
      liveCache.pressureRadiationTexture,
    );
    expect(mesh.userData.raymarchModalPhaseInterferenceTexture).toBe(
      liveCache.phaseInterferenceTexture,
    );
    expect(mesh.material.modalLiveFieldTexture).toBe(liveCache.fieldTexture);
    expect(mesh.material.modalPhaseInterferenceTexture).toBe(
      liveCache.phaseInterferenceTexture,
    );
    expect(mesh.material).not.toHaveProperty("modalFieldPhaseBuffer");
  });

  it("binds spectral lane textures only to the spectral material variant", () => {
    const spectralLaneTextureA = {};
    const spectralLaneTextureB = {};
    const spectralLaneStatsTexture = {};
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
      spectralLaneTextureA,
      spectralLaneTextureB,
      spectralLaneStatsTexture,
      spectralLightEvaluationMode:
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache,
    });

    expect(mesh.userData.raymarchSpectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache,
    );
    expect(mesh.material.spectralLaneTextureA).toBe(spectralLaneTextureA);
    expect(mesh.material.spectralLaneTextureB).toBe(spectralLaneTextureB);
    expect(mesh.material.spectralLaneStatsTexture).toBe(
      spectralLaneStatsTexture,
    );
  });

  it("retargets one shared modal-basis atlas node across variants", () => {
    const modalBasisCache = createRaymarchModalBasisCache({ resolution: 8 });
    const promotedTexture = modalBasisCache.pendingTexture;
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
      modalBasisAtlasTexture: modalBasisCache.texture,
      spectralLaneTextureA: {},
      spectralLaneTextureB: {},
      spectralLaneStatsTexture: {},
    });
    const materialCache = getRaymarchMaterialCache(mesh);
    const textureNode =
      mesh.userData.raymarchModalResourceBindings.modalBasisAtlasTextureNode;

    expect(textureNode.isTexture3DNode).toBe(true);
    setRaymarchModalBasisAtlasTexture(mesh, promotedTexture);
    expect(textureNode.value).toBe(promotedTexture);
    expect(materialCache.neumann.off.modalBasisAtlasTexture).toBe(
      promotedTexture,
    );
    expect(materialCache.dirichlet.off.modalBasisAtlasTexture).toBe(
      promotedTexture,
    );

    setRaymarchSpectralLightEvaluationMode(
      mesh,
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache,
    );
    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material.modalBasisAtlasTexture).toBe(promotedTexture);
  });

  it("constructs without modal buffers and switches canonical boundary variants", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });
    const materialCache = getRaymarchMaterialCache(mesh);

    expect(mesh.material).toBe(materialCache.neumann.off);
    setRaymarchBoundaryMode(mesh, "dirichlet");
    expect(mesh.material).toBe(materialCache.dirichlet.off);
    expect(mesh.userData.raymarchBoundaryMode).toBe("dirichlet");

    setRaymarchCavityGeometry(mesh, "spherical");
    expect(mesh.userData.raymarchCavityGeometry).toBe("spherical");
    expect(mesh.material).toBe(materialCache.dirichlet.off);
  });

  it("repairs a stale boundary material cache entry", () => {
    const mesh = createRaymarchVolumeMesh({
      radius: 3,
      uniforms: makeMeshUniforms(),
    });
    const cache = getRaymarchMaterialCache(mesh);

    setRaymarchBoundaryMode(mesh, "dirichlet");
    const stale = mesh.material;
    cache.neumann.off = stale;
    mesh.userData.raymarchBoundaryMode = "neumann";
    setRaymarchBoundaryMode(mesh, "neumann");

    expect(mesh.material).not.toBe(stale);
    expect(mesh.material.raymarchBoundaryMode).toBe("neumann");
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
  });
});
