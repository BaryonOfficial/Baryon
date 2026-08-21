import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  clamp,
  dot,
  float,
  length,
  max,
  mix,
  mrt,
  screenUV,
  smoothstep,
  sqrt,
  struct,
  texture as textureNode,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
} from "./fieldCacheGeometry.js";
import {
  createFieldCacheSamplingFootprintNode,
  createSparseResolvedFieldCacheFootprintNode,
  sampleFieldCacheAtlasAtFootprintNode,
  sampleSparseResolvedFieldCacheLaneNode,
  sampleSparseResolvedFieldCacheTopologyNode,
} from "./fieldCacheSampling.js";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";
import { resolveSpectralChromaticityNode } from "./spectralColorimetry.js";
import { CYMATIC_OBSERVER_REFERENCE } from "./cymaticObserverReference.js";

const CymaticObserverPayload = struct(
  { geometry: "vec4", appearance: "vec4", organization: "vec4" },
  "BaryonCymaticObserverPayload",
);

function deriveObserverVoxelIndexNode() {
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

function toObserverVoxelPositionNode(voxelIndex) {
  return voxelIndex
    .add(0.5)
    .mul(float(FIELD_CACHE_CELL_SIZE))
    .sub(float(FIELD_CACHE_DOMAIN_HALF_EXTENT));
}

function deriveCurrentObservationSource({
  currentTopologyField,
  currentSource,
  currentOrganization,
  radius,
}) {
  const safeRadius = max(radius, float(1e-4));
  const gradientNormalized = currentTopologyField.yzw;
  const gradientMagnitudeNormalized = length(gradientNormalized);
  const gradientMagnitudeWorld = gradientMagnitudeNormalized.div(safeRadius);
  const signedDistanceWorld = currentTopologyField.x.div(
    max(gradientMagnitudeWorld, float(1e-8)),
  );
  // The topology-aperture gradient is the sole structural normal. Its
  // continuous validity only removes the undefined zero-field case; fine
  // agreement and residual live in the material-only organization lane.
  const gradientMagnitudeSquared = dot(gradientNormalized, gradientNormalized);
  const gradientValidity = gradientMagnitudeSquared.div(
    gradientMagnitudeSquared.add(float(1e-16)),
  );
  const localEnergy = currentSource.w;
  const surfaceSupport = clamp(
    localEnergy.mul(gradientValidity),
    float(0),
    float(1),
  );
  const normal = gradientNormalized.div(
    max(gradientMagnitudeNormalized, float(1e-8)),
  );

  return {
    signedDistanceWorld,
    surfaceNormal: normal.mul(gradientValidity),
    firstMoment: currentSource.xy,
    secondMoment: vec2(currentSource.z, currentOrganization.z),
    spectralPresence: clamp(currentOrganization.w, float(0), float(1)),
    radiance: localEnergy,
    surfaceSupport,
    fineDetailAgreement: clamp(currentOrganization.x, float(0), float(1)),
    fineResidual: clamp(currentOrganization.y, float(-1), float(1)),
  };
}

/** @param {any} direction @param {any} fallback @returns {any} */
function normalizeSpectralDirectionNode(direction, fallback = vec2(1, 0)) {
  const magnitude = length(direction);
  return magnitude
    .greaterThanEqual(float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon))
    .select(
      direction.div(
        max(magnitude, float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon)),
      ),
      fallback,
    );
}

function orientSecondMomentAxisNode(
  secondMoment,
  secondMomentMagnitude,
  referenceDirection,
) {
  // Principal complex square root of the normalized second moment. This is
  // the same unoriented half-angle axis as halving the polar angle, without
  // issuing inverse-trig and trig operations for every voxel and step.
  const safeMagnitude = max(
    secondMomentMagnitude,
    float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon),
  );
  const normalizedX = clamp(
    secondMoment.x.div(safeMagnitude),
    float(-1),
    float(1),
  );
  const halfCos = sqrt(clamp(normalizedX.add(1).mul(0.5), float(0), float(1)));
  const halfSinMagnitude = sqrt(
    clamp(float(1).sub(normalizedX).mul(0.5), float(0), float(1)),
  );
  const halfSin = secondMoment.y
    .lessThan(0)
    .select(halfSinMagnitude.negate(), halfSinMagnitude);
  const axis = /** @type {any} */ (
    secondMomentMagnitude
      .greaterThanEqual(float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon))
      .select(vec2(halfCos, halfSin), vec2(1, 0))
  );
  return /** @type {any} */ (
    dot(axis, referenceDirection).lessThan(0).select(axis.negate(), axis)
  );
}

function deriveSpectralEvidenceNode({
  firstMoment,
  secondMoment,
  priorDirection,
}) {
  const rho1 = clamp(length(firstMoment), float(0), float(1));
  const secondMomentMagnitude = length(secondMoment);
  const rho2 = clamp(secondMomentMagnitude, float(0), float(1));
  const directDirection = normalizeSpectralDirectionNode(firstMoment);
  const secondMomentAxis = orientSecondMomentAxisNode(
    secondMoment,
    secondMomentMagnitude,
    priorDirection,
  );
  const firstGate = smoothstep(
    float(SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateStart),
    float(SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateEnd),
    rho1,
  );
  const secondGate = float(1)
    .sub(firstGate)
    .mul(
      smoothstep(
        float(SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateStart),
        float(SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateEnd),
        rho2,
      ),
    );
  const nominalGate = clamp(
    firstGate.add(
      secondGate.mul(SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentWeight),
    ),
    float(0),
    float(1),
  );
  const numerator = directDirection
    .mul(firstGate)
    .add(
      secondMomentAxis.mul(
        secondGate.mul(SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentWeight),
      ),
    );
  const numeratorMagnitude = length(numerator);
  const valid = numeratorMagnitude.greaterThanEqual(
    float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon),
  );

  return {
    rho1,
    rho2,
    directDirection,
    secondMomentAxis,
    gate: valid.select(nominalGate, float(0)),
    direction: valid.select(
      numerator.div(
        max(
          numeratorMagnitude,
          float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon),
        ),
      ),
      priorDirection,
    ),
  };
}

function seedSpectralDirectionNode({
  firstMoment,
  secondMoment,
  spectralPresence,
  seedDirection,
}) {
  const seed = normalizeSpectralDirectionNode(seedDirection);
  const evidence = deriveSpectralEvidenceNode({
    firstMoment,
    secondMoment,
    priorDirection: seed,
  });
  const zeroSupportDirection = spectralPresence
    .greaterThan(0)
    .select(seed, vec2(1, 0));
  const secondMomentDirection = evidence.rho2
    .greaterThan(SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateStart)
    .select(evidence.secondMomentAxis, zeroSupportDirection);
  return {
    direction: /** @type {any} */ (
      evidence.rho1
        .greaterThan(SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateStart)
        .select(evidence.directDirection, secondMomentDirection)
    ),
  };
}

function deriveFineDetailAuthorityNode(fineDetailAgreement, fineResidual) {
  return clamp(
    fineDetailAgreement.mul(
      float(1).add(
        fineResidual.mul(
          float(CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit),
        ),
      ),
    ),
    float(0),
    float(1),
  );
}

/**
 * Stateful world-space observation pass.
 *
 * The seed material has no history inputs, guaranteeing deterministic first
 * paint. The evolution material backtraces history with the minimum-norm
 * velocity of the implicit U=0 field, then integrates geometry, radiance, and
 * the spectral phase direction with separate fixed observer exposures.
 */
export function createCymaticObserverMaterial({
  currentTopologyFieldTexture,
  currentSourceTexture,
  currentOrganizationTexture,
  previousTopologyFieldTexture = null,
  previousSourceTexture = null,
  previousOrganizationTexture = null,
  previousGeometryTexture = null,
  previousAppearanceTexture = null,
  previousObserverOrganizationTexture = null,
  spectralSeedDirectionNode,
  radius,
  seed = false,
  currentFieldEndpoint = false,
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = seed
    ? "BaryonCymaticObserverSeedMaterial"
    : currentFieldEndpoint
      ? "BaryonCymaticObserverFinalEvolutionMaterial"
      : "BaryonCymaticObserverEvolutionMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const currentTopologyFieldNode = textureNode(currentTopologyFieldTexture);
  const currentSourceNode = textureNode(currentSourceTexture);
  const currentOrganizationNode = textureNode(currentOrganizationTexture);
  const previousTopologyFieldNode = previousTopologyFieldTexture
    ? textureNode(previousTopologyFieldTexture)
    : null;
  const previousSourceNode =
    previousSourceTexture && !currentFieldEndpoint
      ? textureNode(previousSourceTexture)
      : null;
  const previousOrganizationNode =
    previousOrganizationTexture && !currentFieldEndpoint
      ? textureNode(previousOrganizationTexture)
      : null;
  const previousGeometryNode = previousGeometryTexture
    ? textureNode(previousGeometryTexture)
    : null;
  const previousAppearanceNode = previousAppearanceTexture
    ? textureNode(previousAppearanceTexture)
    : null;
  const previousObserverOrganizationNode = previousObserverOrganizationTexture
    ? textureNode(previousObserverOrganizationTexture)
    : null;
  const geometryBlend = uniform(1);
  const radianceBlend = uniform(1);
  const spectralAssimilation = uniform(1);
  const previousFieldMix = uniform(0);
  const currentFieldMix = currentFieldEndpoint ? null : uniform(1);

  const payload = Fn(() => {
    const voxelIndex = deriveObserverVoxelIndexNode().toVar();
    const position = toObserverVoxelPositionNode(voxelIndex);
    const sparseResolvedFootprint =
      createSparseResolvedFieldCacheFootprintNode(voxelIndex);
    const resolvedCurrentTopologyField =
      sampleSparseResolvedFieldCacheTopologyNode(
        currentTopologyFieldNode,
        sparseResolvedFootprint,
      );
    const resolvedCurrentSource = sampleSparseResolvedFieldCacheLaneNode(
      currentSourceNode,
      sparseResolvedFootprint,
    );
    const resolvedCurrentOrganization = sampleSparseResolvedFieldCacheLaneNode(
      currentOrganizationNode,
      sparseResolvedFootprint,
    );

    if (seed) {
      const source = deriveCurrentObservationSource({
        currentTopologyField: resolvedCurrentTopologyField,
        currentSource: resolvedCurrentSource,
        currentOrganization: resolvedCurrentOrganization,
        radius,
      });
      const spectralSeed = seedSpectralDirectionNode({
        firstMoment: source.firstMoment,
        secondMoment: source.secondMoment,
        spectralPresence: source.spectralPresence,
        seedDirection: spectralSeedDirectionNode,
      });
      const spectralChromaticity = resolveSpectralChromaticityNode(
        spectralSeed.direction,
      );
      const fineDetailAuthority = deriveFineDetailAuthorityNode(
        source.fineDetailAgreement,
        source.fineResidual,
      );
      return CymaticObserverPayload(
        vec4(
          /** @type {any} */ (source.signedDistanceWorld),
          source.surfaceNormal.x,
          source.surfaceNormal.y,
          source.surfaceNormal.z,
        ),
        vec4(
          spectralSeed.direction.x,
          spectralSeed.direction.y,
          source.radiance,
          source.surfaceSupport,
        ),
        vec4(
          spectralChromaticity.r,
          spectralChromaticity.g,
          spectralChromaticity.b,
          fineDetailAuthority,
        ),
      );
    }

    const resolvedPreviousTopologyField =
      sampleSparseResolvedFieldCacheTopologyNode(
        previousTopologyFieldNode,
        sparseResolvedFootprint,
      );
    const resolvedPreviousSource = currentFieldEndpoint
      ? null
      : sampleSparseResolvedFieldCacheLaneNode(
          previousSourceNode,
          sparseResolvedFootprint,
        );
    const resolvedPreviousOrganization = currentFieldEndpoint
      ? null
      : sampleSparseResolvedFieldCacheLaneNode(
          previousOrganizationNode,
          sparseResolvedFootprint,
        );
    const previousTopologyField = mix(
      resolvedPreviousTopologyField,
      resolvedCurrentTopologyField,
      previousFieldMix,
    );
    const currentTopologyField = currentFieldEndpoint
      ? resolvedCurrentTopologyField
      : mix(
          resolvedPreviousTopologyField,
          resolvedCurrentTopologyField,
          currentFieldMix,
        );
    const currentSource = currentFieldEndpoint
      ? resolvedCurrentSource
      : mix(resolvedPreviousSource, resolvedCurrentSource, currentFieldMix);
    const currentOrganization = currentFieldEndpoint
      ? resolvedCurrentOrganization
      : mix(
          resolvedPreviousOrganization,
          resolvedCurrentOrganization,
          currentFieldMix,
        );
    const source = deriveCurrentObservationSource({
      currentTopologyField,
      currentSource,
      currentOrganization,
      radius,
    });
    const gradient = currentTopologyField.yzw;
    const gradientMagnitudeSquared = dot(gradient, gradient);
    const backtraceDisplacement = gradient
      .mul(currentTopologyField.x.sub(previousTopologyField.x))
      .div(gradientMagnitudeSquared.add(float(1e-10)));
    const historyPosition = position.add(backtraceDisplacement);
    const historyFootprint =
      createFieldCacheSamplingFootprintNode(historyPosition);
    const previousGeometry = sampleFieldCacheAtlasAtFootprintNode(
      previousGeometryNode,
      historyFootprint,
    );
    const previousAppearance = sampleFieldCacheAtlasAtFootprintNode(
      previousAppearanceNode,
      historyFootprint,
    );
    const previousObserverOrganization = sampleFieldCacheAtlasAtFootprintNode(
      previousObserverOrganizationNode,
      historyFootprint,
    );
    const geometryAssimilation = geometryBlend.mul(source.surfaceSupport);
    const signedDistanceWorld = /** @type {any} */ (
      mix(previousGeometry.x, source.signedDistanceWorld, geometryAssimilation)
    );
    const surfaceNormal = mix(
      previousGeometry.yzw,
      source.surfaceNormal,
      geometryAssimilation,
    );
    const priorDirection = normalizeSpectralDirectionNode(
      previousAppearance.xy,
      normalizeSpectralDirectionNode(spectralSeedDirectionNode),
    );
    const evidence = deriveSpectralEvidenceNode({
      firstMoment: source.firstMoment,
      secondMoment: source.secondMoment,
      priorDirection,
    });
    // The modal moments have already crossed the fixed world-space resolving
    // aperture before this pass. That is the canonical spatial regularizer.
    // Keeping the phase update local avoids a second, categorical smoothing
    // owner and removes twelve history-texture reads from every observer voxel.
    // Weak evidence therefore preserves transported unit-vector history; strong
    // evidence assimilates the aperture-resolved M1/M2 direction.
    const priorMix = max(
      float(0),
      float(1).sub(spectralAssimilation.mul(evidence.gate)),
    );
    const spectralNumerator = priorDirection
      .mul(priorMix)
      .add(evidence.direction.mul(spectralAssimilation.mul(evidence.gate)));
    const spectralNumeratorMagnitude = length(spectralNumerator);
    const spectralDirection = /** @type {any} */ (
      spectralNumeratorMagnitude
        .greaterThanEqual(
          float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon),
        )
        .select(
          spectralNumerator.div(
            max(
              spectralNumeratorMagnitude,
              float(SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon),
            ),
          ),
          priorDirection,
        )
    );
    const radiance = mix(previousAppearance.z, source.radiance, radianceBlend);
    const fineDetailAuthority = mix(
      previousObserverOrganization.w,
      deriveFineDetailAuthorityNode(
        source.fineDetailAgreement,
        source.fineResidual,
      ),
      geometryAssimilation,
    );
    const surfaceSupport = mix(
      previousAppearance.w,
      source.surfaceSupport,
      radianceBlend,
    );
    const spectralChromaticity =
      resolveSpectralChromaticityNode(spectralDirection);
    return CymaticObserverPayload(
      vec4(
        signedDistanceWorld,
        surfaceNormal.x,
        surfaceNormal.y,
        surfaceNormal.z,
      ),
      vec4(spectralDirection.x, spectralDirection.y, radiance, surfaceSupport),
      vec4(
        spectralChromaticity.r,
        spectralChromaticity.g,
        spectralChromaticity.b,
        fineDetailAuthority,
      ),
    );
  })();

  const geometryLane = /** @type {any} */ (payload.get("geometry"));
  const appearanceLane = /** @type {any} */ (payload.get("appearance"));
  const organizationLane = /** @type {any} */ (payload.get("organization"));
  material.colorNode = geometryLane;
  material.mrtNode = mrt({
    geometry: geometryLane,
    appearance: appearanceLane,
    organization: organizationLane,
  });

  return {
    material,
    setTextures({
      currentTopologyField,
      currentSource,
      currentOrganization = null,
      previousTopologyField = null,
      previousSource = null,
      previousOrganization = null,
      previousGeometry = null,
      previousAppearance = null,
      previousObserverOrganization = null,
    }) {
      currentTopologyFieldNode.value = currentTopologyField;
      currentSourceNode.value = currentSource;
      if (currentOrganization) {
        currentOrganizationNode.value = currentOrganization;
      }
      if (previousTopologyFieldNode && previousTopologyField) {
        previousTopologyFieldNode.value = previousTopologyField;
      }
      if (previousSourceNode && previousSource) {
        previousSourceNode.value = previousSource;
      }
      if (previousOrganizationNode && previousOrganization) {
        previousOrganizationNode.value = previousOrganization;
      }
      if (previousGeometryNode && previousGeometry) {
        previousGeometryNode.value = previousGeometry;
      }
      if (previousAppearanceNode && previousAppearance) {
        previousAppearanceNode.value = previousAppearance;
      }
      if (previousObserverOrganizationNode && previousObserverOrganization) {
        previousObserverOrganizationNode.value = previousObserverOrganization;
      }
    },
    setBlends({ geometry, radiance, phase }) {
      geometryBlend.value = geometry;
      radianceBlend.value = radiance;
      spectralAssimilation.value = phase;
    },
    setFieldInterval({
      previousFieldMix: nextPreviousFieldMix,
      currentFieldMix: nextCurrentFieldMix,
    }) {
      previousFieldMix.value = nextPreviousFieldMix;
      if (currentFieldMix) {
        currentFieldMix.value = nextCurrentFieldMix;
      }
    },
    dispose() {
      material.dispose?.();
    },
  };
}

// Stateful cymatic observer GPU owner end.
