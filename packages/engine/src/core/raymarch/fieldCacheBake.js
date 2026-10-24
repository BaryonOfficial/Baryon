import { createFieldCacheDomainGeometry } from "./fieldCacheDomainGeometry.js";
import { compileRenderPass } from "./compileRenderPass.js";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  clamp,
  dot,
  exp,
  float,
  length,
  max,
  min,
  mrt,
  struct,
  texture,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { BOUNDARY_MODES } from "../modeFamily.js";
import { VOLUME_SHAPES } from "../volumeShape.js";
import {
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAINS,
  FIELD_CACHE_RESOLUTION,
} from "./fieldCacheGeometry.js";
import {
  createSparseResolvedFieldCacheFootprintNode,
  deriveFieldCacheFragmentVoxelIndexNode,
  sampleFieldCacheAtlasAtVoxelCenterNode,
  sampleSparseFieldCacheVectorLaneNode,
  sampleSparseResolvedFieldCacheLaneNode,
} from "./fieldCacheSampling.js";
import { fixedRenderTargetTexture } from "./fixedOrientationTextureNode.js";
import { createCymaticObserverMaterial } from "./cymaticObserverNode.js";
import {
  CYMATIC_OBSERVER_REFERENCE,
  createCymaticObserverClockState,
  deriveCymaticObserverBlend,
  resolveCymaticObserverFieldInterval,
  resolveCymaticObserverStep,
} from "./cymaticObserverReference.js";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";

/** Filtered spatial measurement before gradient inference or persistence.
 * Fine energy remains raw amplitude-squared energy; potential/support/color
 * carry their existing global normalization. The evaluator is a derived cache,
 * not an acoustic state owner. */
const ResolvedFieldCachePayload = struct(
  {
    topology: "vec4",
    source: "vec4",
    organization: "vec4",
  },
  "BaryonResolvedFieldCachePayload",
);
const SparseObserverExpansionPayload = struct(
  {
    geometry: "vec4",
    appearance: "vec4",
    organization: "vec4",
    availability: "float",
  },
  "BaryonSparseObserverExpansionPayload",
);

function createFieldCacheResolveMaterial({ evaluateAperture, radius }) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonFieldCacheResolveMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const payload = Fn(() => {
    const voxelIndex = deriveFieldCacheFragmentVoxelIndexNode();
    const sampleField = (index) => {
      const observed = evaluateAperture({ voxelIndex: index });
      return vec4(
        observed.finePotential,
        observed.fineEnergy,
        observed.fineSupport,
        observed.topologyPotential,
      );
    };
    const firstDerivative = (samples) =>
      samples.positiveThree
        .sub(samples.positiveTwo.mul(9))
        .add(samples.positiveOne.mul(45))
        .sub(samples.negativeOne.mul(45))
        .add(samples.negativeTwo.mul(9))
        .sub(samples.negativeThree)
        .mul(float(1 / (60 * FIELD_CACHE_CELL_SIZE)));
    // Reuse each physical cache read for the fine and topology derivatives.
    // The aperture evaluator reconstructs both scalar measurements before this
    // unchanged sixth-order stencil and the nonlinear geometry inference.
    const directions = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];
    const center = evaluateAperture({ voxelIndex });
    const centerField = vec4(
      center.finePotential,
      center.fineEnergy,
      center.fineSupport,
      center.topologyPotential,
    ).toVar();
    const axialDerivatives = directions.map((direction) =>
      firstDerivative({
        negativeThree: sampleField(voxelIndex.sub(direction.mul(3))).toVar(),
        negativeTwo: sampleField(voxelIndex.sub(direction.mul(2))).toVar(),
        negativeOne: sampleField(voxelIndex.sub(direction)).toVar(),
        positiveOne: sampleField(voxelIndex.add(direction)).toVar(),
        positiveTwo: sampleField(voxelIndex.add(direction.mul(2))).toVar(),
        positiveThree: sampleField(voxelIndex.add(direction.mul(3))).toVar(),
      }),
    );
    const fine = {
      potential: centerField.x,
      gradient: vec3(
        axialDerivatives[0].x,
        axialDerivatives[1].x,
        axialDerivatives[2].x,
      ),
    };
    const topology = {
      potential: centerField.w,
      gradient: vec3(
        axialDerivatives[0].w,
        axialDerivatives[1].w,
        axialDerivatives[2].w,
      ),
    };
    const safeRadius = max(radius, float(1e-4));
    const fineGradientMagnitude = length(fine.gradient);
    const topologyGradientMagnitude = length(topology.gradient);
    const fineGradientMagnitudeSquared = dot(fine.gradient, fine.gradient);
    const topologyGradientMagnitudeSquared = dot(
      topology.gradient,
      topology.gradient,
    );
    const fineDistanceWorld = fine.potential.div(
      max(fineGradientMagnitude.div(safeRadius), float(1e-8)),
    );
    const topologyDistanceWorld = topology.potential.div(
      max(topologyGradientMagnitude.div(safeRadius), float(1e-8)),
    );
    const normalizedScaleDisplacement = topologyDistanceWorld
      .sub(fineDistanceWorld)
      .div(float(CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld));
    const distanceAgreement = exp(
      normalizedScaleDisplacement
        .mul(normalizedScaleDisplacement)
        .mul(float(-4 * Math.LN2)),
    );
    const normalAgreement = clamp(
      dot(fine.gradient, topology.gradient).div(
        max(fineGradientMagnitude.mul(topologyGradientMagnitude), float(1e-16)),
      ),
      float(0),
      float(1),
    );
    const fineValidity = fineGradientMagnitudeSquared.div(
      fineGradientMagnitudeSquared.add(float(1e-16)),
    );
    const topologyValidity = topologyGradientMagnitudeSquared.div(
      topologyGradientMagnitudeSquared.add(float(1e-16)),
    );
    const fineDetailAgreement = clamp(
      fineValidity
        .mul(topologyValidity)
        .mul(distanceAgreement)
        .mul(normalAgreement),
      float(0),
      float(1),
    );
    const fineResidual = fineDistanceWorld
      .sub(topologyDistanceWorld)
      .div(
        float(CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld).add(
          fineDistanceWorld.sub(topologyDistanceWorld).abs(),
        ),
      );
    const localEnergy = max(centerField.y, float(0));
    // Optical transduction of raw energy, matching the CPU reference. Keep
    // this out of the normalized potential and its gradient above.
    const opticalExcitation = localEnergy
      .div(
        localEnergy.add(
          float(CYMATIC_OBSERVER_REFERENCE.opticalReferenceEnergy),
        ),
      )
      .sqrt();
    const spectral = center.fineSpectralFirstMoment
      ? vec4(center.fineSpectralFirstMoment, center.fineSpectralSecondMoment)
      : vec4(0);
    const spectralSupport = max(centerField.z, float(0));
    const spectralDenominator = max(
      spectralSupport,
      float(SPECTRAL_PHASE_FIELD_REFERENCE.supportEpsilon),
    );
    const clampMomentToUnitDisk = (moment) => {
      const ratio = moment.div(spectralDenominator);
      return ratio.div(max(float(1), length(ratio)));
    };
    // This resolve target is Float32-backed. Normalize and radially clamp here
    // before bounded moments cross into the half-float resolved cache.
    const spectralFirstMoment = clampMomentToUnitDisk(spectral.xy);
    const spectralSecondMoment = clampMomentToUnitDisk(spectral.zw);
    const spectralPresence = clamp(
      spectralSupport.div(
        spectralSupport.add(
          float(SPECTRAL_PHASE_FIELD_REFERENCE.supportEpsilon),
        ),
      ),
      float(0),
      float(1),
    );
    return ResolvedFieldCachePayload(
      vec4(topology.potential, topology.gradient),
      vec4(
        spectralFirstMoment.x,
        spectralFirstMoment.y,
        spectralSecondMoment.x,
        opticalExcitation,
      ),
      vec4(
        fineDetailAgreement,
        fineResidual,
        spectralSecondMoment.y,
        spectralPresence,
      ),
    );
  })();

  const topologyLane = /** @type {any} */ (payload.get("topology"));
  material.colorNode = topologyLane;
  material.mrtNode = mrt({
    topology: topologyLane,
    source: payload.get("source"),
    organization: payload.get("organization"),
  });
  return material;
}

function createFieldCacheAtlasTarget({
  type = /** @type {any} */ (THREE.HalfFloatType),
  names = ["output", "spectral"],
  nearestNames = [],
} = {}) {
  const target = new THREE.RenderTarget(
    FIELD_CACHE_ATLAS_WIDTH,
    FIELD_CACHE_ATLAS_HEIGHT,
    {
      count: names.length,
      type,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    },
  );
  // MRT lanes bind to attachments by texture NAME, not by index. Unnamed
  // attachments fail to bind and take the whole pipeline down with them.
  target.textures.forEach((texture, index) => {
    texture.name = names[index];
    const filter = nearestNames.includes(texture.name)
      ? THREE.NearestFilter
      : THREE.LinearFilter;
    texture.minFilter = filter;
    texture.magFilter = filter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
  });
  return target;
}

function createObserverAtlasTarget() {
  const target = createFieldCacheAtlasTarget({
    names: ["geometry", "appearance", "organization", "availability"],
    nearestNames: ["organization"],
  });
  // One byte per voxel, exactly 0 or 1. Linear filtering is intentional:
  // backtracing and the ray reader need the available interpolation weight.
  target.textures[3].format = THREE.RedFormat;
  target.textures[3].type = THREE.UnsignedByteType;
  return target;
}

function createObserverCheckpointCopyMaterial({
  geometryTexture,
  appearanceTexture,
  organizationTexture,
  availabilityTexture,
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonObserverCheckpointCopyMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const geometryNode = fixedRenderTargetTexture(geometryTexture);
  const appearanceNode = fixedRenderTargetTexture(appearanceTexture);
  const organizationNode = fixedRenderTargetTexture(organizationTexture);
  const availabilityNode = fixedRenderTargetTexture(availabilityTexture);
  material.colorNode = geometryNode;
  material.mrtNode = mrt({
    geometry: geometryNode,
    appearance: appearanceNode,
    organization: organizationNode,
    availability: availabilityNode,
  });

  return {
    material,
    setTextures({ geometry, appearance, organization, availability }) {
      geometryNode.value = geometry;
      appearanceNode.value = appearance;
      organizationNode.value = organization;
      availabilityNode.value = availability;
    },
    dispose() {
      material.dispose?.();
    },
  };
}

/**
 * Expand one S3-canonical observer generation into its ray-visible full atlas.
 *
 * Geometry is a scalar signed distance followed by a spatial vector, so only
 * its normal is unpermuted. Appearance and organization are spatial scalars:
 * spectral phase/chromaticity, radiance, support, and fine-detail authority do
 * not acquire an axis when the cavity coordinates are permuted.
 */
function createObserverSparseExpansionMaterial({
  geometryTexture,
  appearanceTexture,
  organizationTexture,
  availabilityTexture,
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonObserverSparseExpansionMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const geometryNode = texture(geometryTexture);
  const appearanceNode = texture(appearanceTexture);
  const organizationNode = texture(organizationTexture);
  const availabilityNode = texture(availabilityTexture);
  const payload = Fn(() => {
    const footprint = createSparseResolvedFieldCacheFootprintNode(
      deriveFieldCacheFragmentVoxelIndexNode(),
    );
    const geometry = sampleSparseFieldCacheVectorLaneNode(
      geometryNode,
      footprint,
    );
    const appearance = sampleSparseResolvedFieldCacheLaneNode(
      appearanceNode,
      footprint,
    );
    const organization = sampleSparseResolvedFieldCacheLaneNode(
      organizationNode,
      footprint,
    );
    return SparseObserverExpansionPayload(
      geometry,
      appearance,
      organization,
      sampleSparseResolvedFieldCacheLaneNode(availabilityNode, footprint).x,
    );
  })();

  const geometryLane = /** @type {any} */ (payload.get("geometry"));
  material.colorNode = geometryLane;
  material.mrtNode = mrt({
    geometry: geometryLane,
    appearance: payload.get("appearance"),
    organization: payload.get("organization"),
    availability: vec4(
      /** @type {import("three/webgpu").Node<"float">} */ (
        payload.get("availability")
      ),
    ),
  });
  return material;
}

/**
 * Project observer history into filterable, ray-visible presentation atlases.
 *
 * Observer appearance remains the canonical history. This derived material
 * cache stores radiance/support for z and z+1 in one RGBA16F texel so the ray
 * march can reconstruct the same trilinear value with one bilinear sample.
 * Organization is copied losslessly into a separate linear-filtered attachment:
 * continuous chromaticity and detail must not jump at observer voxel boundaries.
 * Keeping that sampler separate preserves the observer's history/backtrace.
 */
function createObserverOpticalPairMaterial(
  appearanceTexture,
  organizationTexture,
) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonObserverOpticalPairMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const appearanceNode = fixedRenderTargetTexture(appearanceTexture);
  const organizationNode = fixedRenderTargetTexture(organizationTexture);
  material.colorNode = Fn(() => {
    const voxelIndex = deriveFieldCacheFragmentVoxelIndexNode().toVar();
    const upperVoxelIndex = vec3(
      voxelIndex.xy,
      min(voxelIndex.z.add(float(1)), float(FIELD_CACHE_RESOLUTION - 1)),
    );
    const lowerAppearance = sampleFieldCacheAtlasAtVoxelCenterNode(
      appearanceNode,
      voxelIndex,
    );
    const upperAppearance = sampleFieldCacheAtlasAtVoxelCenterNode(
      appearanceNode,
      upperVoxelIndex,
    );
    return vec4(lowerAppearance.zw, upperAppearance.zw);
  })();
  // These are four data channels, not RGB plus opacity. The ordinary opaque
  // color output forces alpha to one, corrupting the upper slice's support.
  // Named MRT outputs write the raw nodes, preserving every channel.
  material.mrtNode = mrt({
    opticalPair: material.colorNode,
    organization: Fn(() =>
      sampleFieldCacheAtlasAtVoxelCenterNode(
        organizationNode,
        deriveFieldCacheFragmentVoxelIndexNode(),
      ),
    )(),
  });

  return {
    material,
    dispose() {
      material.dispose?.();
    },
  };
}

function assertCymaticObserverBakeOptions(options) {
  if (!Object.values(BOUNDARY_MODES).includes(options?.boundaryMode)) {
    throw new TypeError(
      `boundaryMode must be one of: ${Object.values(BOUNDARY_MODES).join(", ")}`,
    );
  }
  if (!Object.values(VOLUME_SHAPES).includes(options?.volumeShape)) {
    throw new TypeError(
      `volumeShape must be one of: ${Object.values(VOLUME_SHAPES).join(", ")}`,
    );
  }
  if (
    !Number.isFinite(options?.observationTimeSeconds) ||
    options.observationTimeSeconds < 0
  ) {
    throw new TypeError(
      "observationTimeSeconds must be a nonnegative finite number",
    );
  }
  if (typeof options?.observationAdvancing !== "boolean") {
    throw new TypeError("observationAdvancing must be a boolean");
  }
  if (
    !Number.isFinite(options?.geometryExposureSeconds) ||
    options.geometryExposureSeconds <= 0
  ) {
    throw new TypeError(
      "geometryExposureSeconds must be a positive finite number",
    );
  }
  if (
    typeof options?.observationResetToken !== "string" ||
    options.observationResetToken.trim().length === 0
  ) {
    throw new TypeError("observationResetToken must be a nonempty string");
  }
  if (
    options?.observationCheckpointKey !== null &&
    (typeof options?.observationCheckpointKey !== "string" ||
      options.observationCheckpointKey.trim().length === 0)
  ) {
    throw new TypeError(
      "observationCheckpointKey must be null or a nonempty string",
    );
  }
  if (
    (!Array.isArray(options?.modalFieldSpectralSeedDirection) &&
      !ArrayBuffer.isView(options?.modalFieldSpectralSeedDirection)) ||
    options.modalFieldSpectralSeedDirection.length !== 2 ||
    !Array.from(options.modalFieldSpectralSeedDirection).every(
      Number.isFinite,
    ) ||
    Math.hypot(
      options.modalFieldSpectralSeedDirection[0],
      options.modalFieldSpectralSeedDirection[1],
    ) < SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon
  ) {
    throw new TypeError(
      "modalFieldSpectralSeedDirection must contain a nonzero finite direction",
    );
  }
}

/**
 * Owns the complete-field cache and the single persistent observer.
 *
 * Modal bake materials are cached per boundary/shape variant because those are
 * compile-time specializations. Observer history stays in one full-domain
 * target; each fixed audio-timestamp step evaluates the canonical sixth into a
 * sparse target, then expands that generation back into the full target.
 * The aperture evaluator supplies already filtered signed potential, raw local
 * energy and spectral moments. It does not own observer history or advance audio.
 * No source-copy or Gaussian raster passes are retained in production.
 */
export function createModalFieldCache({
  radius,
  evaluateAperture,
  prepareAperture = undefined,
  getApertureRevision = () => 0,
}) {
  if (typeof evaluateAperture !== "function")
    throw new TypeError(
      "The field cache requires a complete aperture-field evaluator",
    );
  const resolvedTargets = Array.from({ length: 2 }, () =>
    createFieldCacheAtlasTarget({
      // Fine potential and gradient are consumed entirely by the resolve pass;
      // only their bounded material authority crosses this boundary. Avoid a
      // dead fourth MRT attachment and its full-atlas write.
      names: ["topology", "source", "organization"],
      nearestNames: ["topology", "source", "organization"],
    }),
  );
  const observerTargets = Array.from({ length: 2 }, () =>
    createObserverAtlasTarget(),
  );
  const fullObserverTarget = observerTargets[0];
  const sparseObserverTarget = observerTargets[1];
  const observerOpticalPairTarget = createFieldCacheAtlasTarget({
    names: ["opticalPair", "organization"],
  });
  // Live input and generated-tone sessions never request a file checkpoint.
  // Defer its three full RGBA16F atlases (48 MiB at 128 cubed) until a keyed
  // observer seed actually needs persistence.
  let observerCheckpointTarget = null;
  const ensureObserverCheckpointTarget = () => {
    if (!observerCheckpointTarget) {
      observerCheckpointTarget = createObserverAtlasTarget();
    }
    return observerCheckpointTarget;
  };
  const spectralSeedDirectionNode = uniform(new THREE.Vector2(1, 0));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const domainGeometries = new Map(
    [FIELD_CACHE_DOMAINS.full, FIELD_CACHE_DOMAINS.fundamentalXyz].map(
      (domain) => [domain, createFieldCacheDomainGeometry(domain)],
    ),
  );
  const fullDomainGeometry = domainGeometries.get(FIELD_CACHE_DOMAINS.full);
  const fundamentalDomainGeometry = domainGeometries.get(
    FIELD_CACHE_DOMAINS.fundamentalXyz,
  );
  const quad = new THREE.Mesh(fullDomainGeometry, null);
  quad.position.z = -1;
  quad.frustumCulled = false;
  scene.add(quad);

  const observerSeed = createCymaticObserverMaterial({
    currentTopologyFieldTexture: resolvedTargets[0].textures[0],
    currentSourceTexture: resolvedTargets[0].textures[1],
    currentOrganizationTexture: resolvedTargets[0].textures[2],
    spectralSeedDirectionNode,
    radius,
    seed: true,
  });
  const observerEvolution = createCymaticObserverMaterial({
    currentTopologyFieldTexture: resolvedTargets[0].textures[0],
    currentSourceTexture: resolvedTargets[0].textures[1],
    currentOrganizationTexture: resolvedTargets[0].textures[2],
    previousTopologyFieldTexture: resolvedTargets[1].textures[0],
    previousSourceTexture: resolvedTargets[1].textures[1],
    previousOrganizationTexture: resolvedTargets[1].textures[2],
    previousGeometryTexture: fullObserverTarget.textures[0],
    previousGeometryAvailabilityTexture: fullObserverTarget.textures[3],
    previousAppearanceTexture: fullObserverTarget.textures[1],
    previousObserverOrganizationTexture: fullObserverTarget.textures[2],
    spectralSeedDirectionNode,
    radius,
  });
  const observerFinalEvolution = createCymaticObserverMaterial({
    currentTopologyFieldTexture: resolvedTargets[0].textures[0],
    currentSourceTexture: resolvedTargets[0].textures[1],
    currentOrganizationTexture: resolvedTargets[0].textures[2],
    previousTopologyFieldTexture: resolvedTargets[1].textures[0],
    previousGeometryTexture: fullObserverTarget.textures[0],
    previousGeometryAvailabilityTexture: fullObserverTarget.textures[3],
    previousAppearanceTexture: fullObserverTarget.textures[1],
    previousObserverOrganizationTexture: fullObserverTarget.textures[2],
    spectralSeedDirectionNode,
    radius,
    currentFieldEndpoint: true,
  });
  const observerCheckpointCopy = createObserverCheckpointCopyMaterial({
    geometryTexture: fullObserverTarget.textures[0],
    appearanceTexture: fullObserverTarget.textures[1],
    organizationTexture: fullObserverTarget.textures[2],
    availabilityTexture: fullObserverTarget.textures[3],
  });
  const observerSparseExpansion = createObserverSparseExpansionMaterial({
    geometryTexture: sparseObserverTarget.textures[0],
    appearanceTexture: sparseObserverTarget.textures[1],
    organizationTexture: sparseObserverTarget.textures[2],
    availabilityTexture: sparseObserverTarget.textures[3],
  });
  const observerOpticalPair = createObserverOpticalPairMaterial(
    fullObserverTarget.textures[1],
    fullObserverTarget.textures[2],
  );
  const observerGeometryTexture = texture(fullObserverTarget.textures[0]);
  const observerGeometryAvailabilityTexture = texture(
    fullObserverTarget.textures[3],
  );
  const observerOpticalPairTexture = texture(
    observerOpticalPairTarget.textures[0],
  );
  const observerOrganizationTexture = texture(
    observerOpticalPairTarget.textures[1],
  );
  const observerClockState = createCymaticObserverClockState();
  let resolvedReadIndex = 0;
  let resolvedWriteIndex = 1;
  let hasObserverHistory = false;
  let observerCheckpointKey = null;
  let observerCheckpointStepIndex = null;

  let disposed = false;
  let compiledApertureRevision = null;
  let fieldResolveMaterial = null;
  const resolveApertureMaterial = () => {
    const revision = getApertureRevision();
    if (!fieldResolveMaterial || revision !== compiledApertureRevision) {
      fieldResolveMaterial?.dispose();
      fieldResolveMaterial = createFieldCacheResolveMaterial({
        evaluateAperture,
        radius,
      });
      compiledApertureRevision = revision;
    }
    return fieldResolveMaterial;
  };

  const renderSparseObserverUpdate = (renderer, observerMaterial) => {
    const previousAutoClear = renderer.autoClear;
    try {
      // Only the canonical sixth is evaluated. The following full draw reads
      // exclusively through canonicalized addresses, so stale redundant
      // texels in the sparse target are neither observed nor published.
      renderer.autoClear = false;
      quad.geometry = fundamentalDomainGeometry;
      quad.material = observerMaterial;
      renderer.setRenderTarget(sparseObserverTarget);
      renderer.render(scene, camera);

      // Publish a complete observer generation before another evolution step,
      // the ray march, optical pairing, or checkpoint persistence can read it.
      quad.geometry = fullDomainGeometry;
      quad.material = observerSparseExpansion;
      renderer.setRenderTarget(fullObserverTarget);
      renderer.render(scene, camera);
    } finally {
      renderer.autoClear = previousAutoClear;
      quad.geometry = fullDomainGeometry;
    }
  };

  return {
    observerGeometryTexture,
    observerGeometryAvailabilityTexture,
    observerOpticalPairTexture,
    observerOrganizationTexture,
    spectralSeedDirectionNode,
    async compile(renderer) {
      if (disposed) return;
      const passes = [
        {
          geometry: fundamentalDomainGeometry,
          material: resolveApertureMaterial(),
          target: resolvedTargets[0],
        },
        ...[
          observerSeed.material,
          observerEvolution.material,
          observerFinalEvolution.material,
        ].map((material) => ({
          geometry: fundamentalDomainGeometry,
          material,
          target: sparseObserverTarget,
        })),
        {
          geometry: fullDomainGeometry,
          material: observerSparseExpansion,
          target: fullObserverTarget,
        },
        {
          geometry: fullDomainGeometry,
          material: observerOpticalPair.material,
          target: observerOpticalPairTarget,
        },
      ];
      for (const pass of passes) {
        if (disposed) return;
        const object = quad.clone();
        object.geometry = pass.geometry;
        object.material = pass.material;
        await compileRenderPass(renderer, {
          scene,
          camera,
          object,
          target: pass.target,
        });
      }
    },
    get geometryAvailabilityBytes() {
      return (
        FIELD_CACHE_ATLAS_WIDTH *
        FIELD_CACHE_ATLAS_HEIGHT *
        (2 + Number(observerCheckpointTarget !== null))
      );
    },
    /**
     * Advance the observer from the current modal packet.
     *
     * Packet upload happens before this call and the volume samples the mutable
     * presentation texture nodes after it. Repeated camera/render frames at the
     * same audio timestamp do no cache or observer work.
     *
     * @param {any} renderer
     * @param {{
     *   boundaryMode: string,
     *   volumeShape: string,
     *   observationTimeSeconds: number,
     *   observationAdvancing: boolean,
     *   geometryExposureSeconds: number,
     *   observationResetToken: string,
     *   observationCheckpointKey: string | null,
     *   modalFieldSpectralSeedDirection: ArrayLike<number>,
     * }} options
     */
    bake(renderer, options) {
      assertCymaticObserverBakeOptions(options);
      if (!renderer?.setRenderTarget) {
        return {
          baked: false,
          reset: false,
          advanced: false,
          stepCount: 0,
        };
      }
      const {
        boundaryMode,
        volumeShape,
        observationTimeSeconds,
        observationAdvancing,
        geometryExposureSeconds,
        observationResetToken,
        observationCheckpointKey,
        modalFieldSpectralSeedDirection,
      } = options;
      const observerStep = resolveCymaticObserverStep(observerClockState, {
        resetToken: observationResetToken,
        observationTimeSeconds,
        advancing: observationAdvancing,
      });
      if (
        hasObserverHistory &&
        observerStep.reset !== true &&
        observerStep.stepCount === 0
      ) {
        return {
          baked: false,
          reset: false,
          advanced: false,
          stepCount: 0,
          stepIndex: observerStep.stepIndex,
        };
      }
      const spectralSeedMagnitude = Math.hypot(
        modalFieldSpectralSeedDirection[0],
        modalFieldSpectralSeedDirection[1],
      );
      spectralSeedDirectionNode.value.set(
        modalFieldSpectralSeedDirection[0] / spectralSeedMagnitude,
        modalFieldSpectralSeedDirection[1] / spectralSeedMagnitude,
      );

      const previousTarget = renderer.getRenderTarget?.() ?? null;
      const currentResolvedTarget = resolvedTargets[resolvedWriteIndex];
      const previousResolvedTarget = resolvedTargets[resolvedReadIndex];
      const seedObserver =
        observerStep.reset === true || hasObserverHistory !== true;
      const restoreObserverCheckpoint =
        seedObserver &&
        typeof observationCheckpointKey === "string" &&
        observationCheckpointKey.length > 0 &&
        observationCheckpointKey === observerCheckpointKey &&
        observerCheckpointStepIndex === observerStep.stepIndex;
      let checkpointSaved = false;

      try {
        // Derived source textures are consumed only by an admitted bake.
        // Validation/upload precedes this call; preparation cannot own audio
        // time or run merely because a cached observation is read again.
        prepareAperture?.(renderer, { boundaryMode, volumeShape });
        const previousAutoClear = renderer.autoClear;
        try {
          // Resolve the already measured linear field. Gradients, distance,
          // validity, observer history and optics retain their original order.
          renderer.autoClear = false;
          quad.geometry = fundamentalDomainGeometry;
          quad.material = resolveApertureMaterial();
          renderer.setRenderTarget(currentResolvedTarget);
          renderer.render(scene, camera);
        } finally {
          renderer.autoClear = previousAutoClear;
          quad.geometry = fullDomainGeometry;
        }

        if (restoreObserverCheckpoint) {
          observerCheckpointCopy.setTextures({
            geometry: observerCheckpointTarget.textures[0],
            appearance: observerCheckpointTarget.textures[1],
            organization: observerCheckpointTarget.textures[2],
            availability: observerCheckpointTarget.textures[3],
          });
          quad.material = observerCheckpointCopy.material;
          renderer.setRenderTarget(fullObserverTarget);
          renderer.render(scene, camera);
        } else if (seedObserver) {
          observerSeed.setTextures({
            currentTopologyField: currentResolvedTarget.textures[0],
            currentSource: currentResolvedTarget.textures[1],
            currentOrganization: currentResolvedTarget.textures[2],
          });
          renderSparseObserverUpdate(renderer, observerSeed.material);
          if (
            typeof observationCheckpointKey === "string" &&
            observationCheckpointKey.length > 0
          ) {
            const checkpointTarget = ensureObserverCheckpointTarget();
            observerCheckpointCopy.setTextures({
              geometry: fullObserverTarget.textures[0],
              appearance: fullObserverTarget.textures[1],
              organization: fullObserverTarget.textures[2],
              availability: fullObserverTarget.textures[3],
            });
            quad.material = observerCheckpointCopy.material;
            renderer.setRenderTarget(checkpointTarget);
            renderer.render(scene, camera);
            observerCheckpointKey = observationCheckpointKey;
            observerCheckpointStepIndex = observerStep.stepIndex;
            checkpointSaved = true;
          }
        } else {
          const observerBlends = {
            geometry: deriveCymaticObserverBlend(
              CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
              geometryExposureSeconds,
            ),
            radiance: deriveCymaticObserverBlend(
              CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
              CYMATIC_OBSERVER_REFERENCE.radianceExposureSeconds,
            ),
            phase: deriveCymaticObserverBlend(
              CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
              SPECTRAL_PHASE_FIELD_REFERENCE.spectralExposureSeconds,
            ),
          };
          observerEvolution.setBlends(observerBlends);
          observerFinalEvolution.setBlends(observerBlends);
          for (
            let substepIndex = 0;
            substepIndex < observerStep.stepCount;
            substepIndex += 1
          ) {
            const fieldInterval = resolveCymaticObserverFieldInterval(
              substepIndex,
              observerStep.stepCount,
            );
            const finalSubstep = fieldInterval.currentFieldMix === 1;
            const activeObserverEvolution = finalSubstep
              ? observerFinalEvolution
              : observerEvolution;
            const evolutionTextures = {
              currentTopologyField: currentResolvedTarget.textures[0],
              currentSource: currentResolvedTarget.textures[1],
              currentOrganization: currentResolvedTarget.textures[2],
              previousTopologyField: previousResolvedTarget.textures[0],
            };
            if (!finalSubstep) {
              evolutionTextures.previousSource =
                previousResolvedTarget.textures[1];
              evolutionTextures.previousOrganization =
                previousResolvedTarget.textures[2];
            }
            activeObserverEvolution.setTextures(evolutionTextures);
            activeObserverEvolution.setFieldInterval(fieldInterval);
            renderSparseObserverUpdate(
              renderer,
              activeObserverEvolution.material,
            );
          }
        }

        // This presentation cache is derived exactly once from the final
        // observer generation. It is never checkpointed or updated by the
        // material/render loop, so geometry, organization, and optical lanes
        // cannot cross generations.
        quad.material = observerOpticalPair.material;
        renderer.setRenderTarget(observerOpticalPairTarget);
        renderer.render(scene, camera);
      } finally {
        quad.geometry = fullDomainGeometry;
        renderer.setRenderTarget(previousTarget);
      }

      resolvedReadIndex = resolvedWriteIndex;
      resolvedWriteIndex = 1 - resolvedWriteIndex;
      hasObserverHistory = true;

      return {
        baked: true,
        reset: seedObserver,
        advanced: seedObserver !== true,
        checkpointRestored: restoreObserverCheckpoint,
        checkpointSaved,
        checkpointKey: observationCheckpointKey,
        stepCount: observerStep.stepCount,
        stepIndex: observerStep.stepIndex,
      };
    },
    getObserverState() {
      return {
        hasHistory: hasObserverHistory,
        stepIndex: observerClockState.stepIndex,
        checkpointKey: observerCheckpointKey,
        checkpointStepIndex: observerCheckpointStepIndex,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fieldResolveMaterial?.dispose();
      observerSeed.dispose();
      observerEvolution.dispose();
      observerFinalEvolution.dispose();
      observerCheckpointCopy.dispose();
      observerSparseExpansion.dispose?.();
      observerOpticalPair.dispose();
      domainGeometries.forEach((geometry) => geometry.dispose?.());
      domainGeometries.clear();
      resolvedTargets.forEach((target) => target.dispose?.());
      observerTargets.forEach((target) => target.dispose?.());
      observerOpticalPairTarget.dispose?.();
      observerCheckpointTarget?.dispose?.();
    },
  };
}

// Modal field cache bake owner end.
