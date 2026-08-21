import {
  clamp,
  float,
  int,
  ivec2,
  dot,
  max,
  min,
  mix,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAINS,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
} from "./fieldCacheGeometry.js";
import {
  fixedRenderTargetTexture,
  fixedRenderTargetTextureLoad,
  fixedRenderTargetTextureLoadAtKnownHeight,
} from "./fixedOrientationTextureNode.js";

/** Samples the persistent cymatic observer atlases in normalized world space. */

const ATLAS_WIDTH = float(FIELD_CACHE_ATLAS_WIDTH);
const ATLAS_HEIGHT = float(FIELD_CACHE_ATLAS_HEIGHT);
const TILE_SPAN = float(FIELD_CACHE_RESOLUTION);
const TILE_SPAN_INT = int(FIELD_CACHE_RESOLUTION);
const TILE_SHIFT = int(Math.log2(FIELD_CACHE_TILES_X));
const TILE_MASK = int(FIELD_CACHE_TILES_X - 1);

/**
 * Normalized cavity coordinate to continuous voxel coordinate. Voxel centres
 * sit half a cell in from the domain edge, which is exactly where a sampler
 * places a texel centre, so the two agree without a fudge term.
 */
function toVoxelCoordinateNode(position) {
  return position
    .add(float(FIELD_CACHE_DOMAIN_HALF_EXTENT))
    .div(float(FIELD_CACHE_CELL_SIZE))
    .sub(0.5);
}

function atlasUvNode(slice, voxelX, voxelY) {
  const integerSlice = int(slice);
  const tileY = integerSlice.shiftRight(TILE_SHIFT).toVar();
  const tileX = integerSlice.bitAnd(TILE_MASK).toVar();
  return vec2(
    float(tileX).mul(TILE_SPAN).add(voxelX).add(0.5).div(ATLAS_WIDTH),
    float(tileY).mul(TILE_SPAN).add(voxelY).add(0.5).div(ATLAS_HEIGHT),
  );
}

/** Exact integer atlas address for one cache voxel. */
export function toFieldCacheAtlasTexelNode(voxelIndex) {
  const integerSlice = int(voxelIndex.z);
  const tileY = integerSlice.shiftRight(TILE_SHIFT);
  const tileX = integerSlice.bitAnd(TILE_MASK);
  return ivec2(
    tileX.mul(TILE_SPAN_INT).add(int(voxelIndex.x)),
    tileY.mul(TILE_SPAN_INT).add(int(voxelIndex.y)),
  );
}

/** Canonical representative of one voxel for a sparse stored domain. */
export function canonicalizeFieldCacheVoxelIndexNode(voxelIndex, domain) {
  switch (domain) {
    case FIELD_CACHE_DOMAINS.fundamentalXyz: {
      const low = min(voxelIndex.x, min(voxelIndex.y, voxelIndex.z));
      const high = max(voxelIndex.x, max(voxelIndex.y, voxelIndex.z));
      const middle = voxelIndex.x
        .add(voxelIndex.y)
        .add(voxelIndex.z)
        .sub(low)
        .sub(high);
      return vec3(low, middle, high);
    }
    case FIELD_CACHE_DOMAINS.halfYz:
      return vec3(
        voxelIndex.x,
        min(voxelIndex.y, voxelIndex.z),
        max(voxelIndex.y, voxelIndex.z),
      );
    case FIELD_CACHE_DOMAINS.halfXy:
      return vec3(
        min(voxelIndex.x, voxelIndex.y),
        max(voxelIndex.x, voxelIndex.y),
        voxelIndex.z,
      );
    case FIELD_CACHE_DOMAINS.full:
      return voxelIndex;
    default:
      throw new TypeError(`unsupported field cache domain: ${domain}`);
  }
}

/** Clamp first so permutation canonicalization cannot remap an invalid tap. */
export function clampAndCanonicalizeFieldCacheVoxelIndexNode(
  voxelIndex,
  domain,
) {
  const maximumIndex = float(FIELD_CACHE_RESOLUTION - 1);
  const bounded = clamp(voxelIndex, vec3(0), vec3(maximumIndex)).toVar();
  return canonicalizeFieldCacheVoxelIndexNode(bounded, domain);
}

/** Exact atlas address for a sparse read, with its required boundary order. */
export function toSparseFieldCacheAtlasTexelNode(voxelIndex, domain) {
  return toFieldCacheAtlasTexelNode(
    clampAndCanonicalizeFieldCacheVoxelIndexNode(voxelIndex, domain),
  );
}

/**
 * Rank of each full-domain coordinate in its sorted representative. Ties use
 * asymmetric comparisons so the result always remains a permutation.
 */
export function deriveFieldCacheVoxelRankNode(voxelIndex) {
  const rankOf = (self, first, second) =>
    self
      .greaterThan(first)
      .select(float(1), float(0))
      .add(self.greaterThan(second).select(float(1), float(0)));
  const rankOfLater = (self, earlier, other) =>
    self
      .greaterThanEqual(earlier)
      .select(float(1), float(0))
      .add(self.greaterThan(other).select(float(1), float(0)));
  return vec3(
    rankOf(voxelIndex.x, voxelIndex.y, voxelIndex.z),
    rankOfLater(voxelIndex.y, voxelIndex.x, voxelIndex.z),
    voxelIndex.z
      .greaterThanEqual(voxelIndex.x)
      .select(float(1), float(0))
      .add(
        voxelIndex.z.greaterThanEqual(voxelIndex.y).select(float(1), float(0)),
      ),
  );
}

/** Select one vector component by a statically branchless permutation rank. */
function selectFieldCacheComponentByRankNode(source, rank) {
  return rank
    .lessThan(float(0.5))
    .select(source.x, rank.lessThan(float(1.5)).select(source.y, source.z));
}

/** Shared exact address and tie-safe permutation for sparse resolved lanes. */
export function createSparseResolvedFieldCacheFootprintNode(voxelIndex) {
  return {
    texel: toSparseFieldCacheAtlasTexelNode(
      voxelIndex,
      FIELD_CACHE_DOMAINS.fundamentalXyz,
    ).toVar(),
    rank: deriveFieldCacheVoxelRankNode(voxelIndex).toVar(),
  };
}

/** Exact sparse-resolved scalar payload read; its lanes are permutation invariant. */
export function sampleSparseResolvedFieldCacheLaneNode(
  atlasTexture,
  footprint,
) {
  return fixedRenderTargetTextureLoad(atlasTexture, footprint.texel);
}

/** Expand one scalar-plus-vector lane from sorted-axis into full-axis order. */
export function sampleSparseFieldCacheVectorLaneNode(atlasTexture, footprint) {
  const topology = sampleSparseResolvedFieldCacheLaneNode(
    atlasTexture,
    footprint,
  ).toVar();
  return vec4(
    topology.x,
    selectFieldCacheComponentByRankNode(topology.yzw, footprint.rank.x),
    selectFieldCacheComponentByRankNode(topology.yzw, footprint.rank.y),
    selectFieldCacheComponentByRankNode(topology.yzw, footprint.rank.z),
  );
}

/** Expand the resolved topology gradient from sorted-axis order. */
export function sampleSparseResolvedFieldCacheTopologyNode(
  atlasTexture,
  footprint,
) {
  return sampleSparseFieldCacheVectorLaneNode(atlasTexture, footprint);
}

/**
 * Resolve one normalized position into the two atlas coordinates and z weight
 * needed for trilinear cache sampling.
 *
 * Co-located cache lanes must share this footprint. It is cache-address state,
 * not a physical field quantity, so reusing it preserves the exact sampled
 * values while avoiding duplicate coordinate arithmetic in the shader.
 */
export function createFieldCacheSamplingFootprintNode(position) {
  return createFieldCacheSamplingFootprintFromVoxelNode(
    toVoxelCoordinateNode(position),
  );
}

function createFieldCacheSamplingFootprintFromVoxelNode(voxelCoordinate) {
  const maximumVoxel = float(FIELD_CACHE_RESOLUTION - 1.001);
  const voxel = clamp(voxelCoordinate, vec3(0), vec3(maximumVoxel)).toVar();
  const lowerSlice = int(voxel.z.floor()).toVar();
  return {
    lowerUv: atlasUvNode(lowerSlice, voxel.x, voxel.y).toVar(),
    upperUv: atlasUvNode(lowerSlice.add(int(1)), voxel.x, voxel.y).toVar(),
    zMix: voxel.z.sub(float(lowerSlice)).toVar(),
    nearestTexel: toFieldCacheAtlasTexelNode(
      vec3(
        voxel.x.add(0.5).floor(),
        voxel.y.add(0.5).floor(),
        voxel.z.add(0.5).floor(),
      ),
    ).toVar(),
  };
}

/** Sample one atlas through an already resolved trilinear footprint. */
export function sampleFieldCacheAtlasAtFootprintNode(atlasTexture, footprint) {
  return mix(
    fixedRenderTargetTexture(atlasTexture, footprint.lowerUv).level(float(0)),
    fixedRenderTargetTexture(atlasTexture, footprint.upperUv).level(float(0)),
    footprint.zMix,
  );
}

/**
 * Sample an atlas at the exact centre of a cache voxel.
 *
 * Observer evolution writes one output pixel for the same voxel represented by
 * each resolved-field input. That co-located path needs neither a second z
 * slice nor interpolation; retaining the trilinear reader there doubled the
 * field-texture traffic without changing the sampled value.
 */
export function sampleFieldCacheAtlasAtVoxelCenterNode(
  atlasTexture,
  voxelIndex,
) {
  return fixedRenderTargetTextureLoad(
    atlasTexture,
    toFieldCacheAtlasTexelNode(voxelIndex),
  );
}

/**
 * Build the production reader for the persistent observer payload.
 *
 * Returned as plain factories rather than TSL functions because they are only
 * ever called from inside the volume material's own function body, where
 * `toVar` has a stack to live on.
 */
export function createFieldCacheSampler({
  observerGeometryTexture,
  observerOpticalPairTexture,
  observerOrganizationTexture,
}) {
  const sampleGeometryAtFootprint = (footprint) => {
    const geometry = sampleFieldCacheAtlasAtFootprintNode(
      observerGeometryTexture,
      footprint,
    );
    const surfaceNormalSquaredMagnitude = dot(geometry.yzw, geometry.yzw);
    return {
      footprint,
      signedDistanceWorld: geometry.x,
      surfaceNormalSquaredMagnitude,
      surfaceNormalWorld: geometry.yzw,
    };
  };

  return {
    /**
     * Resolve the affine camera ray into cache-voxel coordinates once.
     * Every quadrature point then needs only one multiply-add before the
     * shared atlas footprint logic. This is algebraically the same mapping as
     * `(rayOrigin + rayDirection * distance) / radius` followed by
     * `toVoxelCoordinateNode`, with only floating-point reassociation.
     */
    createCymaticObserverRaySampler({
      rayOriginLocal,
      unitRayDirLocal,
      reciprocalRadius,
    }) {
      const rayToVoxelScale = reciprocalRadius
        .div(float(FIELD_CACHE_CELL_SIZE))
        .toVar();
      const voxelOffset = float(
        FIELD_CACHE_DOMAIN_HALF_EXTENT / FIELD_CACHE_CELL_SIZE - 0.5,
      );
      const voxelOrigin = rayOriginLocal
        .mul(rayToVoxelScale)
        .add(vec3(voxelOffset))
        .toVar();
      const voxelDirection = unitRayDirLocal.mul(rayToVoxelScale).toVar();
      return {
        sampleCymaticObserverGeometry(sampleDistance) {
          const voxel = voxelOrigin.add(voxelDirection.mul(sampleDistance));
          return sampleGeometryAtFootprint(
            createFieldCacheSamplingFootprintFromVoxelNode(voxel),
          );
        },
      };
    },

    /**
     * Read the appearance payload through the geometry stage's shared
     * footprint. The production march deliberately performs this fixed work
     * for every sample so content cannot change its shader cost.
     *
     * The optical-pair presentation cache carries local radiance and acoustic
     * surface support for the lower/upper z slices in XY/ZW. Organization
     * carries derived unit-luminance chromaticity RGB followed by bounded
     * fine-detail authority. The material fetches organization from one
     * nearest observer voxel so cache interpolation cannot pull saturated
     * endpoints through grey. Geometry and the paired radiance/support lanes
     * remain trilinear. Spectral phase remains canonical observer history but
     * is not part of this ray-visible presentation cache.
     * None can alter the canonical signed distance.
     */
    sampleCymaticObserverOpticalState(footprint) {
      const opticalPair = fixedRenderTargetTexture(
        observerOpticalPairTexture,
        footprint.lowerUv,
      )
        .level(float(0))
        .toVar();
      const optical = mix(
        opticalPair.xy,
        opticalPair.zw,
        footprint.zMix,
      ).toVar();
      const organization = fixedRenderTargetTextureLoadAtKnownHeight(
        observerOrganizationTexture,
        footprint.nearestTexel,
        FIELD_CACHE_ATLAS_HEIGHT,
      ).toVar();
      return {
        localSpectralChromaticity: organization.rgb,
        localRadiance: optical.x,
        localFineDetailAuthority: organization.w,
        localSurfaceSupport: optical.y,
      };
    },
  };
}

// Field cache sampling owner end.
