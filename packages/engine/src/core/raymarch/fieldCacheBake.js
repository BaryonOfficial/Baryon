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
  screenUV,
  struct,
  texture,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { VOLUME_SHAPES, normalizeVolumeShape } from "../volumeShape.js";
import {
  SPECTRAL_MOMENT_SUPPORT_EPSILON,
  evaluateAnalyticWaterRadiationPotentialNode,
} from "./radiationPotentialObservation.js";
import {
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_BAKE_GATE_HALF_EXTENT,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAINS,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
  createFieldCacheDomainGeometry,
} from "./fieldCacheGeometry.js";
import {
  createSparseResolvedFieldCacheFootprintNode,
  sampleFieldCacheAtlasAtVoxelCenterNode,
  sampleSparseFieldCacheVectorLaneNode,
  sampleSparseResolvedFieldCacheLaneNode,
  toSparseFieldCacheAtlasTexelNode,
} from "./fieldCacheSampling.js";
import {
  fixedRenderTargetTexture,
  fixedRenderTargetTextureLoad,
} from "./fixedOrientationTextureNode.js";
import { createCymaticObserverMaterial } from "./cymaticObserverNode.js";
import { createFieldCacheBasisLookup } from "./fieldCacheBasisLookup.js";
import {
  CYMATIC_OBSERVER_APERTURE_PASSES,
  CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS,
  CYMATIC_OBSERVER_REFERENCE,
  CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS,
  createCymaticObserverClockState,
  deriveCymaticObserverBlend,
  resolveCymaticObserverFieldInterval,
  resolveCymaticObserverStep,
} from "./cymaticObserverReference.js";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";

/**
 * Bakes the complete live modal packet and advances the virtual observer.
 *
 * This is where the acoustic radiation potential is evaluated. The march would
 * otherwise run the mode loop at every ray sample: `pixels x samples x modes`.
 * The same cycle-averaged potential on the cache grid is `voxels x modes`.
 *
 * The first pass evaluates scalar potential only over the permutation
 * fundamental domain. A fixed world-space aperture then reconstructs and
 * filters the full symmetric volume. The resolve pass takes a sixth-order
 * derivative of that same filtered scalar. Finally, the stateful observer
 * advects and integrates the U=0 sheet on the authoritative audio clock.
 */

const SourceFieldCachePayload = struct(
  { field: "vec4", spectral: "vec4" },
  "BaryonSourceFieldCachePayload",
);
const ResolvedFieldCachePayload = struct(
  {
    topology: "vec4",
    source: "vec4",
    organization: "vec4",
  },
  "BaryonResolvedFieldCachePayload",
);
const SparseObserverExpansionPayload = struct(
  { geometry: "vec4", appearance: "vec4", organization: "vec4" },
  "BaryonSparseObserverExpansionPayload",
);

/**
 * Integer voxel index this fragment owns.
 *
 * The atlas lays the z slices out as a grid of tiles, so the tile a fragment
 * falls in IS its slice index. A fragment centre sits at pixel + 0.5, so the
 * floor of the in-tile pixel coordinate is the voxel index exactly.
 */
function deriveBakedVoxelIndexNode() {
  const pixelX = screenUV.x.mul(float(FIELD_CACHE_ATLAS_WIDTH));
  const pixelY = screenUV.y.mul(float(FIELD_CACHE_ATLAS_HEIGHT));
  const tileSpan = float(FIELD_CACHE_RESOLUTION);
  const tileX = pixelX.div(tileSpan).floor();
  const tileY = pixelY.div(tileSpan).floor();
  return vec3(
    pixelX.sub(tileX.mul(tileSpan)).floor(),
    pixelY.sub(tileY.mul(tileSpan)).floor(),
    tileY.mul(float(FIELD_CACHE_TILES_X)).add(tileX),
  );
}

/** Normalized cavity coordinate of a voxel centre. */
function toBakedVoxelPositionNode(voxelIndex) {
  return voxelIndex
    .add(0.5)
    .mul(float(FIELD_CACHE_CELL_SIZE))
    .sub(float(FIELD_CACHE_DOMAIN_HALF_EXTENT));
}

/**
 * Zero the mode loop outside the region any ray can reach, plus the stencil
 * slack. Exact rather than approximate: those voxels are neither sampled nor
 * read, so not evaluating them changes nothing but the bill.
 */
function deriveBakeGateNode(position, volumeShape) {
  const gate = float(FIELD_CACHE_BAKE_GATE_HALF_EXTENT);
  if (normalizeVolumeShape(volumeShape) === VOLUME_SHAPES.cube) {
    return position.abs().greaterThan(gate).any().select(float(0), float(1));
  }
  return dot(position, position)
    .greaterThan(gate.mul(gate))
    .select(float(0), float(1));
}

/**
 * @typedef {import("three/webgpu").MeshBasicNodeMaterial & {
 *   raymarchBoundaryMode?: string,
 *   raymarchVolumeShape?: string,
 * }} FieldCacheBakeMaterial
 */

function createFieldCacheBakeMaterial({
  modalFieldModeUniforms,
  modalFieldCoefficientUniforms,
  modalFieldResponseUniforms,
  modalFieldSpectralMomentUniforms,
  modalFieldModeCount,
  basisLookup,
  boundaryMode,
  volumeShape,
}) {
  const material = /** @type {FieldCacheBakeMaterial} */ (
    new MeshBasicNodeMaterial()
  );
  material.name = "BaryonFieldCacheBakeMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  // The whole payload is built inside one function body. A TSL Loop and its
  // accumulators only exist on a function stack — assembled at material
  // construction time they are silently dropped, leaving a shader that writes
  // its initial values and costs nothing.
  const payload = Fn(() => {
    const voxelIndex = deriveBakedVoxelIndexNode();
    const position = toBakedVoxelPositionNode(voxelIndex);
    const observed = evaluateAnalyticWaterRadiationPotentialNode({
      voxelIndex,
      basisLookup,
      modalFieldModeUniforms,
      modalFieldCoefficientUniforms,
      modalFieldResponseUniforms,
      modalFieldSpectralMomentUniforms,
      // The mesh owns the exact fundamental-domain support, so the shader only
      // needs the permutation-invariant shape gate for voxels no ray can reach.
      modalFieldActiveCount: modalFieldModeCount.mul(
        deriveBakeGateNode(position, volumeShape),
      ),
      boundaryMode,
    });

    const spectral = observed.spectralFirstMoment
      ? vec4(observed.spectralFirstMoment, observed.spectralSecondMoment)
      : vec4(0, 0, 0, 0);

    // Lane x carries the fine-aperture potential, lane y carries the
    // cycle-averaged energy used by local radiance, and lane w feeds the wider
    // topology aperture. No component-ranking statistic participates in the
    // observation.
    return SourceFieldCachePayload(
      vec4(
        observed.radiationPotential,
        observed.totalEnergy,
        observed.spectralSupport ?? float(0),
        observed.radiationPotential,
      ),
      spectral,
    );
  })();

  // Struct members are untyped at the node level; both lanes are vec4 by
  // construction above.
  const fieldLane = /** @type {any} */ (payload.get("field"));
  material.colorNode = fieldLane;
  material.mrtNode = mrt({
    output: fieldLane,
    spectral: payload.get("spectral"),
  });
  material.raymarchBoundaryMode = normalizeBoundaryMode(boundaryMode);
  material.raymarchVolumeShape = normalizeVolumeShape(volumeShape);
  return material;
}

function createApertureKernelWeightNode(radius, apertureFwhmWorld, offset) {
  const sigmaWorld = float(apertureFwhmWorld / (2 * Math.sqrt(2 * Math.LN2)));
  const offsetWorld = radius
    .mul(float(FIELD_CACHE_CELL_SIZE))
    .mul(float(offset));
  return exp(
    offsetWorld.mul(offsetWorld).div(sigmaWorld.mul(sigmaWorld).mul(-2)),
  );
}

/**
 * Gaussian aperture weights vary with apparatus radius but never with voxel.
 * Evaluate the ten non-negative half-kernel entries in the vertex stage and carry
 * three packed constants across the full-screen pass. The fragment stage keeps
 * the original accumulation and normalization order, so this removes repeated
 * transcendental work without changing the fixed world-space aperture.
 */
function createApertureKernelWeightNodes(radius) {
  const topology = Array.from({ length: 7 }, (_, offset) =>
    createApertureKernelWeightNode(
      radius,
      CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
      offset,
    ),
  );
  const fine = Array.from({ length: 3 }, (_, offset) =>
    createApertureKernelWeightNode(
      radius,
      CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
      offset,
    ),
  );
  const topologyTotal =
    CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS.reduce(
      (total, offset) => total.add(topology[Math.abs(offset)]),
      float(0),
    );
  const fineTotal = CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS.reduce(
    (total, offset) => total.add(fine[Math.abs(offset)]),
    float(0),
  );
  const packedA = vec4(
    topology[0],
    topology[1],
    topology[2],
    topology[3],
  ).toVertexStage();
  const packedB = vec4(
    topology[4],
    topology[5],
    topology[6],
    fine[0],
  ).toVertexStage();
  const packedC = vec4(
    fine[1],
    fine[2],
    topologyTotal,
    fineTotal,
  ).toVertexStage();

  return {
    topology: [
      packedA.x,
      packedA.y,
      packedA.z,
      packedA.w,
      packedB.x,
      packedB.y,
      packedB.z,
    ],
    fine: [packedB.w, packedC.x, packedC.y],
    topologyTotal: packedC.z,
    fineTotal: packedC.w,
  };
}

/**
 * Apply the instrument's fixed world-space resolving aperture while carrying
 * permutation symmetry through the smallest exact stored domain at each axis.
 */
function createFieldCacheApertureMaterial({
  sourceField,
  sourceSpectral,
  radius,
  direction,
  inputDomain,
}) {
  const material = new MeshBasicNodeMaterial();
  const axis = direction.findIndex((component) => component !== 0);
  material.name = `BaryonFieldCacheAperture${"XYZ"[axis]}Material`;
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;
  const apertureWeights = createApertureKernelWeightNodes(radius);

  const payload = Fn(() => {
    const voxelIndex = deriveBakedVoxelIndexNode();
    const directionNode = vec3(...direction);
    const fineFieldSum = vec3(0).toVar();
    const topologyPotentialSum = float(0).toVar();
    const spectralMomentSum = vec4(0).toVar();
    const accumulateFine = (field, spectral, weight) => {
      fineFieldSum.addAssign(field.xyz.mul(weight));
      spectralMomentSum.addAssign(spectral.mul(weight));
    };

    for (const offset of CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS) {
      const sourceTexel = toSparseFieldCacheAtlasTexelNode(
        voxelIndex.add(directionNode.mul(float(offset))),
        inputDomain,
      ).toVar();
      const field = fixedRenderTargetTextureLoad(sourceField, sourceTexel);
      const topologyWeight = apertureWeights.topology[Math.abs(offset)];
      topologyPotentialSum.addAssign(field.w.mul(topologyWeight));

      if (CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS.includes(offset)) {
        const fineWeight = apertureWeights.fine[Math.abs(offset)];
        accumulateFine(
          field,
          fixedRenderTargetTextureLoad(sourceSpectral, sourceTexel),
          fineWeight,
        );
      }
    }

    const filteredFineField = fineFieldSum.div(apertureWeights.fineTotal);
    const filteredTopologyPotential = topologyPotentialSum.div(
      apertureWeights.topologyTotal,
    );
    return SourceFieldCachePayload(
      vec4(filteredFineField, filteredTopologyPotential),
      spectralMomentSum.div(apertureWeights.fineTotal),
    );
  })();

  const fieldLane = /** @type {any} */ (payload.get("field"));
  material.colorNode = fieldLane;
  material.mrtNode = mrt({
    output: fieldLane,
    spectral: payload.get("spectral"),
  });
  return material;
}

// Fixed scale-space aperture owner end.

function createFieldCacheResolveMaterial({
  apertureField,
  apertureSpectral,
  radius,
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonFieldCacheResolveMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const payload = Fn(() => {
    const voxelIndex = deriveBakedVoxelIndexNode();
    const sampleField = (index) => {
      const texel = toSparseFieldCacheAtlasTexelNode(
        index,
        FIELD_CACHE_DOMAINS.fundamentalXyz,
      );
      return fixedRenderTargetTextureLoad(apertureField, texel);
    };
    const firstDerivative = (samples) =>
      samples.positiveThree
        .sub(samples.positiveTwo.mul(9))
        .add(samples.positiveOne.mul(45))
        .sub(samples.negativeOne.mul(45))
        .add(samples.negativeTwo.mul(9))
        .sub(samples.negativeThree)
        .mul(float(1 / (60 * FIELD_CACHE_CELL_SIZE)));
    // Fine and topology potential share one RGBA field atlas. Fetch every
    // stencil point once, then take both derivatives from the same vec4. This
    // preserves the exact sixth-order result while halving resolve-pass field
    // reads on both renderer backends.
    const directions = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];
    const centerTexel = toSparseFieldCacheAtlasTexelNode(
      voxelIndex,
      FIELD_CACHE_DOMAINS.fundamentalXyz,
    ).toVar();
    const centerField = fixedRenderTargetTextureLoad(
      apertureField,
      centerTexel,
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
    const compressedEnergy = localEnergy.div(
      localEnergy.add(
        float(CYMATIC_OBSERVER_REFERENCE.localEnergyHalfResponse),
      ),
    );
    const spectral = fixedRenderTargetTextureLoad(
      apertureSpectral,
      centerTexel,
    );
    const spectralSupport = max(centerField.z, float(0));
    const spectralDenominator = max(
      spectralSupport,
      float(SPECTRAL_MOMENT_SUPPORT_EPSILON),
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
        spectralSupport.add(float(SPECTRAL_MOMENT_SUPPORT_EPSILON)),
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
        compressedEnergy,
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

function createObserverCheckpointCopyMaterial({
  geometryTexture,
  appearanceTexture,
  organizationTexture,
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonObserverCheckpointCopyMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const geometryNode = fixedRenderTargetTexture(geometryTexture);
  const appearanceNode = fixedRenderTargetTexture(appearanceTexture);
  const organizationNode = fixedRenderTargetTexture(organizationTexture);
  material.colorNode = geometryNode;
  material.mrtNode = mrt({
    geometry: geometryNode,
    appearance: appearanceNode,
    organization: organizationNode,
  });

  return {
    material,
    setTextures({ geometry, appearance, organization }) {
      geometryNode.value = geometry;
      appearanceNode.value = appearance;
      organizationNode.value = organization;
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
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonObserverSparseExpansionMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const geometryNode = texture(geometryTexture);
  const appearanceNode = texture(appearanceTexture);
  const organizationNode = texture(organizationTexture);
  const payload = Fn(() => {
    const footprint = createSparseResolvedFieldCacheFootprintNode(
      deriveBakedVoxelIndexNode(),
    );
    return SparseObserverExpansionPayload(
      sampleSparseFieldCacheVectorLaneNode(geometryNode, footprint),
      sampleSparseResolvedFieldCacheLaneNode(appearanceNode, footprint),
      sampleSparseResolvedFieldCacheLaneNode(organizationNode, footprint),
    );
  })();

  const geometryLane = /** @type {any} */ (payload.get("geometry"));
  material.colorNode = geometryLane;
  material.mrtNode = mrt({
    geometry: geometryLane,
    appearance: payload.get("appearance"),
    organization: payload.get("organization"),
  });
  return material;
}

/**
 * Project the two ray-visible appearance lanes into one z-paired atlas.
 *
 * Observer appearance remains the canonical history. This derived material
 * cache stores radiance/support for z and z+1 in one RGBA16F texel so the ray
 * march can reconstruct the same trilinear value with one bilinear sample.
 */
function createObserverOpticalPairMaterial(appearanceTexture) {
  const material = new MeshBasicNodeMaterial();
  material.name = "BaryonObserverOpticalPairMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const appearanceNode = fixedRenderTargetTexture(appearanceTexture);
  material.colorNode = Fn(() => {
    const voxelIndex = deriveBakedVoxelIndexNode().toVar();
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
 */
export function createModalFieldCache({
  modalFieldModeUniforms,
  modalFieldCoefficientUniforms,
  modalFieldResponseUniforms,
  modalFieldSpectralMomentUniforms = null,
  modalFieldModeCount,
  radius,
}) {
  const basisLookup = createFieldCacheBasisLookup();
  const source = createFieldCacheAtlasTarget({
    type: THREE.FloatType,
    // Every source/aperture read lands on an exact voxel centre. Linear
    // filtering cannot change the ideal value there, but it can force a much
    // slower float-filtering path on Windows WebGL2 drivers.
    nearestNames: ["output", "spectral"],
  });
  const aperture = createFieldCacheAtlasTarget({
    type: THREE.FloatType,
    nearestNames: ["output", "spectral"],
  });
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
    createFieldCacheAtlasTarget({
      names: ["geometry", "appearance", "organization"],
      nearestNames: ["organization"],
    }),
  );
  const fullObserverTarget = observerTargets[0];
  const sparseObserverTarget = observerTargets[1];
  const observerOpticalPairTarget = createFieldCacheAtlasTarget({
    names: ["opticalPair"],
  });
  // Live input and generated-tone sessions never request a file checkpoint.
  // Defer its three full RGBA16F atlases (48 MiB at 128 cubed) until a keyed
  // observer seed actually needs persistence.
  let observerCheckpointTarget = null;
  const ensureObserverCheckpointTarget = () => {
    if (!observerCheckpointTarget) {
      observerCheckpointTarget = createFieldCacheAtlasTarget({
        names: ["geometry", "appearance", "organization"],
        nearestNames: ["organization"],
      });
    }
    return observerCheckpointTarget;
  };
  const spectralSeedDirectionNode = uniform(new THREE.Vector2(1, 0));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const domainGeometries = new Map(
    Object.values(FIELD_CACHE_DOMAINS).map((domain) => [
      domain,
      createFieldCacheDomainGeometry(domain),
    ]),
  );
  const fullDomainGeometry = domainGeometries.get(FIELD_CACHE_DOMAINS.full);
  const fundamentalDomainGeometry = domainGeometries.get(
    FIELD_CACHE_DOMAINS.fundamentalXyz,
  );
  const quad = new THREE.Mesh(fullDomainGeometry, null);
  quad.position.z = -1;
  quad.frustumCulled = false;
  scene.add(quad);

  const aperturePasses = CYMATIC_OBSERVER_APERTURE_PASSES.map((pass, index) => {
    const input = index % 2 === 0 ? source : aperture;
    const output = index % 2 === 0 ? aperture : source;
    return {
      material: createFieldCacheApertureMaterial({
        sourceField: input.textures[0],
        sourceSpectral: input.textures[1],
        radius,
        direction: pass.direction,
        inputDomain: pass.inputDomain,
      }),
      output,
      geometry: domainGeometries.get(pass.outputDomain),
    };
  });
  const fieldResolveMaterial = createFieldCacheResolveMaterial({
    apertureField: aperture.textures[0],
    apertureSpectral: aperture.textures[1],
    radius,
  });
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
  });
  const observerSparseExpansion = createObserverSparseExpansionMaterial({
    geometryTexture: sparseObserverTarget.textures[0],
    appearanceTexture: sparseObserverTarget.textures[1],
    organizationTexture: sparseObserverTarget.textures[2],
  });
  const observerOpticalPair = createObserverOpticalPairMaterial(
    fullObserverTarget.textures[1],
  );
  const observerGeometryTexture = texture(fullObserverTarget.textures[0]);
  const observerOpticalPairTexture = texture(
    observerOpticalPairTarget.textures[0],
  );
  const observerOrganizationTexture = texture(fullObserverTarget.textures[2]);
  const observerClockState = createCymaticObserverClockState();
  let resolvedReadIndex = 0;
  let resolvedWriteIndex = 1;
  let hasObserverHistory = false;
  let observerCheckpointKey = null;
  let observerCheckpointStepIndex = null;

  const materials = new Map();
  const resolveBakeMaterial = (boundaryMode, volumeShape) => {
    const key = `${normalizeBoundaryMode(boundaryMode)}:${normalizeVolumeShape(volumeShape)}`;
    const cached = materials.get(key);
    if (cached) {
      return cached;
    }
    const material = createFieldCacheBakeMaterial({
      modalFieldModeUniforms,
      modalFieldCoefficientUniforms,
      modalFieldResponseUniforms,
      modalFieldSpectralMomentUniforms,
      modalFieldModeCount,
      basisLookup: basisLookup.texture,
      boundaryMode,
      volumeShape,
    });
    materials.set(key, material);
    return material;
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
    observerOpticalPairTexture,
    observerOrganizationTexture,
    spectralSeedDirectionNode,
    // Named so the wiring audit can prove the buffers the runtime uploads are
    // the same objects this bake compiled against, rather than trusting that
    // two things with matching names refer to one another.
    modalResourceBindings: {
      modalFieldModeUniforms,
      modalFieldCoefficientUniforms,
      modalFieldResponseUniforms,
      modalFieldSpectralMomentUniforms,
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
        const previousAutoClear = renderer.autoClear;
        try {
          // Every downstream sparse read clamps and canonicalizes into the
          // region its producer writes. Clearing the redundant texels would
          // turn five small fixed draws back into five full-atlas operations.
          renderer.autoClear = false;
          quad.geometry = fundamentalDomainGeometry;
          quad.material = resolveBakeMaterial(boundaryMode, volumeShape);
          renderer.setRenderTarget(source);
          renderer.render(scene, camera);

          for (const aperturePass of aperturePasses) {
            quad.geometry = aperturePass.geometry;
            quad.material = aperturePass.material;
            renderer.setRenderTarget(aperturePass.output);
            renderer.render(scene, camera);
          }

          quad.geometry = fundamentalDomainGeometry;
          quad.material = fieldResolveMaterial;
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
      materials.forEach((material) => material.dispose?.());
      materials.clear();
      aperturePasses.forEach((pass) => pass.material.dispose?.());
      fieldResolveMaterial.dispose?.();
      observerSeed.dispose();
      observerEvolution.dispose();
      observerFinalEvolution.dispose();
      observerCheckpointCopy.dispose();
      observerSparseExpansion.dispose?.();
      observerOpticalPair.dispose();
      domainGeometries.forEach((geometry) => geometry.dispose?.());
      domainGeometries.clear();
      source.dispose?.();
      aperture.dispose?.();
      resolvedTargets.forEach((target) => target.dispose?.());
      observerTargets.forEach((target) => target.dispose?.());
      observerOpticalPairTarget.dispose?.();
      observerCheckpointTarget?.dispose?.();
      basisLookup.dispose();
    },
  };
}

// Modal field cache bake owner end.
