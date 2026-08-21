import * as THREE from "three";
import { MeshBasicNodeMaterial, VolumeNodeMaterial } from "three/webgpu";
import { RAYMARCH_DEFAULTS, RENDER_DEFAULTS } from "../../defaults.js";
import {
  abs,
  clamp,
  dot,
  float,
  fract,
  max,
  mix,
  normalView,
  positionLocal,
  positionView,
  pow,
  sin,
  smoothstep,
  vec3,
} from "three/tsl";
import { createSafeVolumetricOutputNode } from "./SafeVolumetricLightingModel.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../modalBudgets.js";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { VOLUME_SHAPES, normalizeVolumeShape } from "../volumeShape.js";
import {
  deriveCymaticPlasmaTransferNode,
  prepareCymaticPlasmaTransferUniformsNode,
} from "./cymaticPlasmaTransferNode.js";
import {
  deriveCymaticPlasmaCarrierNode,
  deriveCymaticPlasmaProfileSampleNode,
} from "./cymaticPlasmaCarrierNode.js";
import { createFieldCacheSampler } from "./fieldCacheSampling.js";

/** @typedef {"dirichlet" | "neumann"} BoundaryMode */
/** @typedef {import("../volumeShape.js").VolumeShape} VolumeShape */

const DEFAULT_VOLUME_SHAPE = /** @type {VolumeShape} */ (VOLUME_SHAPES.sphere);

/**
 * @typedef {import("three/webgpu").VolumeNodeMaterial & {
 *   steps: number,
 *   radiusNode?: any,
 *   domainHalfExtentsNode?: any,
 *   createOpticalTransferRaySampler?: any,
 *   raymarchVolumeShape?: VolumeShape,
 *   fieldCache?: any,
 *   modalFieldCapacity?: number,
 *   plasmaProfileLookup?: any,
 * }} BaryonVolumeMaterial
 */

const LINEAR_RGB_LUMINANCE = Object.freeze([0.2126, 0.7152, 0.0722]);

function normalizeMaterialChromaticityNode(color) {
  const nonnegativeColor = max(color, vec3(0.0));
  const luminance = dot(
    nonnegativeColor,
    vec3(
      float(LINEAR_RGB_LUMINANCE[0]),
      float(LINEAR_RGB_LUMINANCE[1]),
      float(LINEAR_RGB_LUMINANCE[2]),
    ),
  );
  return nonnegativeColor.div(max(luminance, float(1e-6)));
}

/**
 * @param {{
 *   uniforms: any,
 *   fieldCache?: {
 *     observerGeometryTexture: any,
 *     observerOpticalPairTexture: any,
 *     observerOrganizationTexture: any,
 *   } | null,
 *   plasmaProfileLookup?: any,
 * }} options
 */
function createVolumetricOpticalModel({
  uniforms,
  fieldCache = null,
  plasmaProfileLookup = null,
}) {
  const {
    uRadius,
    uColor,
    uCausticColor,
    uSpectralPresentationEnabled,
    uSpectralChroma,
    uDensityGain,
    uLaserDeflectionGain,
    uCausticStrength,
    uLaserFocus,
  } = uniforms;
  const tracerDensityScale = max(uDensityGain, float(0.0))
    .div(float(RAYMARCH_DEFAULTS.densityGain))
    .toVar();
  const spectralPresentationEnabled = clamp(
    uSpectralPresentationEnabled,
    float(0.0),
    float(1.0),
  ).toVar();
  const spectralChroma = clamp(uSpectralChroma, float(0.0), float(1.0)).toVar();
  const hasModalResources = Boolean(fieldCache);
  const fieldCacheSampler = hasModalResources
    ? createFieldCacheSampler(fieldCache)
    : null;
  const materialColor = normalizeMaterialChromaticityNode(uColor).toVar();
  const accentColor = normalizeMaterialChromaticityNode(uCausticColor).toVar();
  const reciprocalRadius = float(1)
    .div(max(uRadius, float(1e-4)))
    .toVar();
  const plasmaTransferUniforms = prepareCymaticPlasmaTransferUniformsNode({
    materialDensityScale: tracerDensityScale,
    tangentAuthority: uCausticStrength,
    tangentPower: uLaserFocus,
    audioAccentGain: uLaserDeflectionGain,
  });

  // The persistent observer owns topology, motion, local radiance, and local
  // phase. Presentation alone maps that phase into fixed optical
  // layers. Empty space contributes neither radiance nor parallel extinction.
  const createOpticalTransferRaySampler =
    /**
     * @param {{rayOriginLocal: any, unitRayDirLocal: any}} args
     */
    ({ rayOriginLocal, unitRayDirLocal }) => {
      if (!hasModalResources) {
        return () => ({
          baseRadiance: vec3(0.0),
          accentRadiance: vec3(0.0),
          extinction: float(0.0),
        });
      }

      const observerRaySampler =
        fieldCacheSampler.createCymaticObserverRaySampler({
          rayOriginLocal,
          unitRayDirLocal,
          reciprocalRadius,
        });

      return ({ sampleDistance, stepSize }) => {
        const observerGeometry =
          observerRaySampler.sampleCymaticObserverGeometry(sampleDistance);
        const profileSample = deriveCymaticPlasmaProfileSampleNode({
          signedDistanceWorld: observerGeometry.signedDistanceWorld,
          profileLookup: plasmaProfileLookup,
          surfaceNormalWorld: observerGeometry.surfaceNormalWorld,
          surfaceNormalSquaredMagnitude:
            observerGeometry.surfaceNormalSquaredMagnitude,
          unitRayDirLocal,
          stepSize,
        });

        const observer = fieldCacheSampler.sampleCymaticObserverOpticalState(
          observerGeometry.footprint,
        );
        const localSpectralChromaticity = observer.localSpectralChromaticity;
        // Chroma is an explicit operator choice over unit-luminance
        // presentation. Both endpoints have Rec.709 luminance 1, so this
        // cannot become a hidden brightness owner or reveal either configured
        // static color.
        const presentedSpectralChromaticity = mix(
          vec3(1.0),
          localSpectralChromaticity,
          spectralChroma,
        );
        // Color mode is the sole static-versus-spectral owner. This value is
        // binary at the runtime boundary; the branchless mix avoids shader
        // specialization without changing either presentation endpoint.
        const sampleMaterialColor = mix(
          materialColor,
          presentedSpectralChromaticity,
          spectralPresentationEnabled,
        );
        const sampleAccentColor = mix(
          accentColor,
          presentedSpectralChromaticity,
          spectralPresentationEnabled,
        );
        const carrier = deriveCymaticPlasmaCarrierNode({
          profileSample,
          surfaceSupport: observer.localSurfaceSupport,
          fineDetailAuthority: observer.localFineDetailAuthority,
        });
        const opticalTransfer = deriveCymaticPlasmaTransferNode({
          localRadiance: observer.localRadiance,
          continuitySpineDensity: carrier.continuitySpineDensity,
          detailSpineDensity: carrier.detailSpineDensity,
          coreDensity: carrier.coreDensity,
          sheathDensity: carrier.sheathDensity,
          materialColor: sampleMaterialColor,
          tangentColor: sampleAccentColor,
          normalDotRay: carrier.normalDotRay,
          preparedUniforms: plasmaTransferUniforms,
        });
        return {
          baseRadiance: opticalTransfer.baseRadiance,
          accentRadiance: opticalTransfer.accentRadiance,
          extinction: opticalTransfer.extinction,
        };
      };
    };
  return {
    createOpticalTransferRaySampler,
  };
}
const RAYMARCH_DOMAIN_GEOMETRY_MARGIN = 1.01;
function createVolumeDomainGeometry(radius, volumeShape) {
  const hullRadius = radius * RAYMARCH_DOMAIN_GEOMETRY_MARGIN;
  const geometry =
    normalizeVolumeShape(volumeShape) === VOLUME_SHAPES.cube
      ? new THREE.BoxGeometry(hullRadius * 2, hullRadius * 2, hullRadius * 2)
      : new THREE.SphereGeometry(hullRadius, 32, 32);
  geometry.computeBoundingSphere();
  return geometry;
}

function resolveMaterialStepBudget(steps) {
  return Math.max(1, Math.round(Number.isFinite(steps) ? steps : 1));
}

export function createRaymarchVolumeMesh({
  radius,
  fieldCache = null,
  plasmaProfileLookup = null,
  modalFieldCapacity = MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
  uniforms,
  cavityGeometry = "rectangular",
  volumeShape = DEFAULT_VOLUME_SHAPE,
}) {
  if (fieldCache && !plasmaProfileLookup) {
    throw new TypeError(
      "plasmaProfileLookup is required when fieldCache is present",
    );
  }
  const initialVolumeShape = normalizeVolumeShape(volumeShape);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const geometry = createVolumeDomainGeometry(radius, initialVolumeShape);
  const modalResourceBindings = {
    fieldCache,
    modalFieldCapacity,
  };
  // Volume shape is the only thing that still specializes this shader: the cube
  // variant carries domainHalfExtentsNode. Boundary family selects which field
  // the BAKE writes and the march reads whatever is in the cache; cavity
  // geometry never reached the shader at all, even before the cache. Both are
  // recorded as runtime state instead of compiled into duplicate materials.
  const createMaterialForVolumeShape = (volumeShape = DEFAULT_VOLUME_SHAPE) => {
    const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
    const material = /** @type {BaryonVolumeMaterial} */ (
      new VolumeNodeMaterial()
    );
    material.transparent = true;
    // The emission-absorption integrator already returns premultiplied scene
    // radiance (L) and coverage (1 - T). Straight-alpha NormalBlending would
    // multiply L by coverage a second time, suppressing thin outer structure
    // quadratically and favoring long central chords. Use premultiplied blend
    // factors directly while leaving premultipliedAlpha false: enabling that
    // flag would make NodeMaterial multiply output RGB by alpha in the shader.
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    // The field radiance is self-emission, not a response to scene lights.
    // Build the production traversal as the explicit fragment output so its
    // execution cannot be gated by Three's optional scene-light lifecycle.
    material.lights = false;
    material.steps = resolveMaterialStepBudget(uniforms.uRaymarchSteps.value);
    material.radiusNode = uniforms.uRadius;
    if (normalizedVolumeShape === VOLUME_SHAPES.cube) {
      material.domainHalfExtentsNode = vec3(uniforms.uRadius);
    }
    const opticalModel = createVolumetricOpticalModel({
      uniforms,
      fieldCache: modalResourceBindings.fieldCache,
      plasmaProfileLookup,
    });
    material.createOpticalTransferRaySampler =
      opticalModel.createOpticalTransferRaySampler;
    material.outputNode = createSafeVolumetricOutputNode(material);
    material.raymarchVolumeShape = normalizedVolumeShape;
    material.fieldCache = modalResourceBindings.fieldCache;
    material.modalFieldCapacity = modalResourceBindings.modalFieldCapacity;
    material.plasmaProfileLookup = plasmaProfileLookup;
    return material;
  };
  const materialCache = {
    [initialVolumeShape]: createMaterialForVolumeShape(initialVolumeShape),
  };
  const mesh = new THREE.Mesh(geometry, materialCache[initialVolumeShape]);
  mesh.userData.raymarchMaterialCache = materialCache;
  mesh.userData.raymarchCreateMaterialVariant = createMaterialForVolumeShape;
  mesh.userData.raymarchBoundaryMode = BOUNDARY_MODES.neumann;
  mesh.userData.raymarchVolumeShape = initialVolumeShape;
  mesh.userData.raymarchFieldCache = fieldCache;
  mesh.userData.raymarchModalFieldCapacity = modalFieldCapacity;
  mesh.userData.raymarchModalResourceBindings = modalResourceBindings;
  mesh.userData.raymarchCavityGeometry = normalizedCavityGeometry;
  mesh.userData.raymarchBaseRadius = radius;
  mesh.userData.raymarchRequestedSteps = Math.round(
    uniforms.uRaymarchSteps.value,
  );
  mesh.frustumCulled = false;

  return mesh;
}

export function getRaymarchMaterialCache(mesh) {
  return mesh?.userData?.raymarchMaterialCache ?? null;
}

function getOrCreateRaymarchMaterial(mesh, volumeShape = DEFAULT_VOLUME_SHAPE) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return null;
  }

  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const cachedMaterial = materialCache[normalizedVolumeShape];
  if (
    normalizeVolumeShape(cachedMaterial?.raymarchVolumeShape) ===
    normalizedVolumeShape
  ) {
    return cachedMaterial;
  }

  const createMaterialVariant = mesh?.userData?.raymarchCreateMaterialVariant;
  if (typeof createMaterialVariant !== "function") {
    return null;
  }

  const material = createMaterialVariant(normalizedVolumeShape);
  materialCache[normalizedVolumeShape] = material;
  return material;
}

/**
 * Record which boundary family the cache should be filled from.
 *
 * This no longer swaps materials. The march reads the baked field, so the
 * family is a property of what the bake writes, and the bake reads it from
 * here on the frame it runs.
 */
export function setRaymarchBoundaryMode(mesh, boundaryMode) {
  if (!mesh?.userData) {
    return;
  }
  mesh.userData.raymarchBoundaryMode = normalizeBoundaryMode(boundaryMode);
}

export function setRaymarchVolumeShape(mesh, volumeShape) {
  if (!mesh?.userData) {
    return;
  }

  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const previousVolumeShape = normalizeVolumeShape(
    mesh.userData.raymarchVolumeShape,
  );
  const activeMaterialShape = normalizeVolumeShape(
    mesh.material?.raymarchVolumeShape,
  );
  if (
    previousVolumeShape === normalizedVolumeShape &&
    activeMaterialShape === normalizedVolumeShape
  ) {
    return;
  }

  const nextMaterial = getOrCreateRaymarchMaterial(mesh, normalizedVolumeShape);
  if (!nextMaterial) {
    return;
  }

  nextMaterial.steps = resolveMaterialStepBudget(
    mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
  );
  mesh.material = nextMaterial;
  mesh.userData.raymarchVolumeShape = normalizedVolumeShape;

  if (previousVolumeShape === normalizedVolumeShape) {
    return;
  }

  const baseRadius = mesh.userData.raymarchBaseRadius;
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) {
    return;
  }

  const previousGeometry = mesh.geometry;
  mesh.geometry = createVolumeDomainGeometry(baseRadius, normalizedVolumeShape);
  previousGeometry?.dispose?.();
}

/**
 * Record which cavity geometry the mode atlas was resolved against.
 *
 * Cavity geometry has never reached the shader — it selects the atlas on the
 * CPU — so this was already only ever bookkeeping.
 */
export function setRaymarchCavityGeometry(mesh, cavityGeometry) {
  if (!mesh?.userData) {
    return;
  }
  mesh.userData.raymarchCavityGeometry =
    normalizeCavityGeometry(cavityGeometry);
}

export function syncRaymarchMaterialSteps(mesh, steps) {
  if (mesh?.userData) {
    mesh.userData.raymarchRequestedSteps = Math.round(steps);
  }
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    if (mesh?.material) {
      mesh.material.steps = resolveMaterialStepBudget(steps);
    }
    return;
  }

  Object.values(materialCache).forEach((material) => {
    if (material) {
      material.steps = resolveMaterialStepBudget(steps);
    }
  });
}

const IDLE_LOGO_CORE_LAYER = "core";
const IDLE_LOGO_ENERGY_SHELL_LAYER = "energy-shell";
const IDLE_LOGO_SHELL_SCALE = 1.018;
// View-space raster pitch in radians per world unit: ~36 lines across the
// default 1.2-unit logo span, fine enough to read as projection texture
// rather than stripes.
const IDLE_LOGO_SCAN_FREQUENCY = 190;

export function syncIdleOverlayMaterial(overlay, { color, intensity }) {
  const colorUniform = overlay?.userData?.idleLogoColorUniform;
  const intensityUniform = overlay?.userData?.idleLogoIntensityUniform;
  if (!colorUniform?.value?.isColor || !intensityUniform) {
    return;
  }

  colorUniform.value.set(color);
  intensityUniform.value = Math.max(0, intensity);
}

function resolveIdleLogoHeightExtents(geometry) {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const minY = geometry.boundingBox.min.y;
  const spanY = Math.max(geometry.boundingBox.max.y - minY, 1e-6);
  return { minY, spanY };
}

function deriveIdleLogoVisibilityNodes(uniforms) {
  // The control schema owns the upper bound; the material only closes negative
  // input so the full accepted brightness range remains visually meaningful.
  const normalizedIntensity = max(
    uniforms.uIdleLogoIntensity.div(float(RENDER_DEFAULTS.idleLogoIntensity)),
    float(0),
  );
  return {
    normalizedIntensity,
    visibility: pow(normalizedIntensity, float(0.5)),
  };
}

function deriveIdleLogoNormalizedHeightNode({ minY, spanY }) {
  return clamp(
    positionLocal.y.sub(float(minY)).div(float(spanY)),
    float(0),
    float(1),
  );
}

function createIdleLogoCoreMaterial(uniforms, heightExtents) {
  const { normalizedIntensity, visibility } =
    deriveIdleLogoVisibilityNodes(uniforms);
  const grazing = float(1).sub(abs(normalView.z));
  const silhouette = pow(grazing, float(1.6));
  const normalizedHeight = deriveIdleLogoNormalizedHeightNode(heightExtents);
  const pulse = sin(uniforms.uTime.mul(float(0.55)))
    .mul(float(0.025))
    .add(float(0.975));
  // Cool cast is a per-channel filter so saturated user colors keep their hue.
  const bodyColor = uniforms.uIdleLogoColor.mul(vec3(0.82, 0.93, 1.05));
  const projectorGrade = float(1.12).sub(normalizedHeight.mul(float(0.22)));

  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonIdleLogoCoreMaterial";
  material.colorNode = bodyColor.mul(
    pulse
      .mul(projectorGrade)
      .mul(float(0.34).add(normalizedIntensity.mul(float(0.05)))),
  );
  material.opacityNode = clamp(
    float(0.12)
      .add(silhouette.mul(float(0.3)))
      .mul(visibility),
    float(0),
    float(0.55),
  );
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.toneMapped = false;
  return material;
}

function createIdleLogoEnergyShellMaterial(uniforms, heightExtents) {
  const { normalizedIntensity, visibility } =
    deriveIdleLogoVisibilityNodes(uniforms);
  const grazing = float(1).sub(abs(normalView.z));
  const rim = pow(grazing, float(2.6));
  const normalizedHeight = deriveIdleLogoNormalizedHeightNode(heightExtents);

  const scan = sin(
    positionView.y
      .mul(float(IDLE_LOGO_SCAN_FREQUENCY))
      .add(uniforms.uTime.mul(float(1.4))),
  )
    .mul(float(0.5))
    .add(float(0.5));
  const scanShade = mix(float(0.9), float(1.06), scan);

  const sweepPhase = fract(
    normalizedHeight.mul(float(0.42)).sub(uniforms.uTime.mul(float(0.06))),
  );
  const sweep = smoothstep(float(0.3), float(0.46), sweepPhase).mul(
    float(1).sub(smoothstep(float(0.46), float(0.66), sweepPhase)),
  );

  const shimmer = float(1).sub(
    sin(uniforms.uTime.mul(float(9.3)))
      .mul(float(0.5))
      .add(float(0.5))
      .mul(
        sin(uniforms.uTime.mul(float(17.1)))
          .mul(float(0.5))
          .add(float(0.5)),
      )
      .mul(float(0.05)),
  );

  // Hue-preserving palette: facing surfaces get a deep cool filter over the
  // user color, the rim lifts toward white, and extreme grazing whitens like
  // a hot edge — no fixed hue is ever mixed in.
  const facingTint = uniforms.uIdleLogoColor.mul(vec3(0.55, 0.75, 1.08));
  const rimTint = mix(
    uniforms.uIdleLogoColor,
    vec3(1.0, 1.0, 1.0),
    float(0.45),
  );
  const grazeTint = mix(
    mix(facingTint, rimTint, rim),
    vec3(0.95, 0.97, 1.05),
    pow(rim, float(3)).mul(float(0.3)),
  );

  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonIdleLogoEnergyShellMaterial";
  material.colorNode = grazeTint
    .mul(
      float(0.35)
        .add(rim.mul(float(1.6)))
        .add(sweep.mul(float(0.5))),
    )
    .mul(shimmer)
    .mul(scanShade)
    .mul(float(0.75).add(normalizedIntensity.mul(float(0.25))));
  material.opacityNode = clamp(
    float(0.03)
      .add(rim.mul(float(0.42)))
      .add(sweep.mul(float(0.07)))
      .mul(mix(float(0.94), float(1.06), scan))
      .mul(visibility),
    float(0),
    float(0.7),
  );
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.side = THREE.DoubleSide;
  material.toneMapped = false;
  return material;
}

export function createIdleOverlay({ baryonGeometry, uniforms }) {
  if (!baryonGeometry?.attributes?.position?.count) {
    throw new Error("Idle logo requires mesh geometry");
  }

  const heightExtents = resolveIdleLogoHeightExtents(baryonGeometry);
  const overlay = new THREE.Group();
  overlay.name = "BaryonIdleLogoHologram";
  overlay.scale.setScalar(uniforms.uIdleLogoSize.value);
  overlay.userData.holographicIdleLogo = true;
  overlay.userData.idleLogoColorUniform = uniforms.uIdleLogoColor;
  overlay.userData.idleLogoIntensityUniform = uniforms.uIdleLogoIntensity;

  const core = new THREE.Mesh(
    baryonGeometry.clone(),
    createIdleLogoCoreMaterial(uniforms, heightExtents),
  );
  core.name = "BaryonIdleLogoCore";
  core.frustumCulled = false;
  core.renderOrder = 1;
  core.userData.idleLogoLayer = IDLE_LOGO_CORE_LAYER;
  overlay.add(core);

  const energyShell = new THREE.Mesh(
    baryonGeometry.clone(),
    createIdleLogoEnergyShellMaterial(uniforms, heightExtents),
  );
  energyShell.name = "BaryonIdleLogoEnergyShell";
  energyShell.scale.setScalar(IDLE_LOGO_SHELL_SCALE);
  energyShell.frustumCulled = false;
  energyShell.renderOrder = 2;
  energyShell.userData.idleLogoLayer = IDLE_LOGO_ENERGY_SHELL_LAYER;
  overlay.add(energyShell);

  syncIdleOverlayMaterial(overlay, {
    color: uniforms.uIdleLogoColor.value,
    intensity: uniforms.uIdleLogoIntensity.value,
  });

  return overlay;
}
