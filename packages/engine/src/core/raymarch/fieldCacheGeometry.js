import * as THREE from "three";

/**
 * Grid and atlas layout for the water radiation-potential cache.
 *
 * Direct analytic evaluation in the march would cost
 * `pixels x samples x modes`. The production path instead evaluates the
 * cycle-averaged Gor'kov potential once on a voxel grid at `voxels x modes`,
 * then lets the march read that sampled representation through a smooth
 * reconstruction filter.
 *
 * The cached scalar is quadratic in each source-projected exact-eigenvalue
 * shell, not independently in each degenerate family. Family pressure and
 * velocity fields sum coherently inside a shell; only then are their energies
 * formed and added across different response frequencies with the declared
 * tracer contrast. A fixed world-space aperture filters that complete scalar,
 * and one matched derivative pass supplies the U=0 surface motion consumed by
 * the persistent cymatic observer.
 */

export const FIELD_CACHE_RESOLUTION = 128;
// 16 x 8 tiles of 128 x 128 cover all 128 z slices in a 2048 x 1024 atlas.
export const FIELD_CACHE_TILES_X = 16;
export const FIELD_CACHE_TILES_Y = FIELD_CACHE_RESOLUTION / FIELD_CACHE_TILES_X;
export const FIELD_CACHE_ATLAS_WIDTH =
  FIELD_CACHE_RESOLUTION * FIELD_CACHE_TILES_X;
export const FIELD_CACHE_ATLAS_HEIGHT =
  FIELD_CACHE_RESOLUTION * FIELD_CACHE_TILES_Y;

/**
 * Exact stored support of each field-cache pass.
 *
 * These domains are a storage contract, not a quality setting. The analytic
 * field and every scalar payload lane are invariant under coordinate
 * permutations; topology gradients transform by that same permutation. The
 * aperture's axis order grows and contracts the smallest domain that contains
 * every value needed by the next pass without ever materializing redundant
 * texels.
 */
export const FIELD_CACHE_DOMAINS = Object.freeze({
  full: "full",
  fundamentalXyz: "fundamental-xyz",
  halfYz: "half-yz",
  halfXy: "half-xy",
});

const FIELD_CACHE_DOMAIN_VALUES = Object.freeze(
  Object.values(FIELD_CACHE_DOMAINS),
);

function assertFieldCacheDomain(domain) {
  if (!FIELD_CACHE_DOMAIN_VALUES.includes(domain)) {
    throw new TypeError(
      `field cache domain must be one of: ${FIELD_CACHE_DOMAIN_VALUES.join(", ")}`,
    );
  }
}

/** True when one integer voxel belongs to the named stored domain. */
export function isFieldCacheVoxelInDomain(domain, [i, j, k]) {
  assertFieldCacheDomain(domain);
  switch (domain) {
    case FIELD_CACHE_DOMAINS.fundamentalXyz:
      return i <= j && j <= k;
    case FIELD_CACHE_DOMAINS.halfYz:
      return j <= k;
    case FIELD_CACHE_DOMAINS.halfXy:
      return i <= j;
    default:
      return true;
  }
}

/**
 * Canonical representative of a voxel under the permutation symmetry a
 * stored domain guarantees. The input is assumed to have already crossed the
 * cache-boundary clamp when used for sparse texture addressing.
 */
export function canonicalizeFieldCacheVoxelIndex([i, j, k], domain) {
  assertFieldCacheDomain(domain);
  switch (domain) {
    case FIELD_CACHE_DOMAINS.fundamentalXyz:
      return sortFieldCacheVoxelIndex([i, j, k]);
    case FIELD_CACHE_DOMAINS.halfYz:
      return [i, Math.min(j, k), Math.max(j, k)];
    case FIELD_CACHE_DOMAINS.halfXy:
      return [Math.min(i, j), Math.max(i, j), k];
    default:
      return [i, j, k];
  }
}

/** Clamp to the valid atlas first, then select the domain representative. */
export function clampAndCanonicalizeFieldCacheVoxelIndex(voxelIndex, domain) {
  const bounded = voxelIndex.map((component) =>
    Math.max(0, Math.min(FIELD_CACHE_RESOLUTION - 1, component)),
  );
  return canonicalizeFieldCacheVoxelIndex(bounded, domain);
}

function toFieldCacheClipPosition(pixelX, pixelY) {
  return [
    (2 * pixelX) / FIELD_CACHE_ATLAS_WIDTH - 1,
    1 - (2 * pixelY) / FIELD_CACHE_ATLAS_HEIGHT,
    0,
  ];
}

function createFieldCacheSliceDomainPixelVertices(domain, slice) {
  const tileOriginX = (slice % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION;
  const tileOriginY =
    Math.floor(slice / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION;
  const height = slice + 1;
  let localVertices;
  switch (domain) {
    case FIELD_CACHE_DOMAINS.fundamentalXyz:
      localVertices = [
        [0, 0],
        [0.5, 0],
        [height + 0.5, height],
        [0, height],
      ];
      break;
    case FIELD_CACHE_DOMAINS.halfYz:
      localVertices = [
        [0, 0],
        [FIELD_CACHE_RESOLUTION, 0],
        [FIELD_CACHE_RESOLUTION, height],
        [0, height],
      ];
      break;
    case FIELD_CACHE_DOMAINS.halfXy:
      localVertices = [
        [0, 0],
        [0.5, 0],
        [FIELD_CACHE_RESOLUTION + 0.5, FIELD_CACHE_RESOLUTION],
        [0, FIELD_CACHE_RESOLUTION],
      ];
      break;
    default:
      throw new TypeError(`cannot build per-slice geometry for ${domain}`);
  }
  return localVertices.map(([x, y]) => [tileOriginX + x, tileOriginY + y]);
}

/**
 * One indexed draw for an exact cache support domain.
 *
 * Positions are built from top-left atlas pixel edges because `screenUV` uses
 * that convention on both WebGPU and WebGL2. The Y conversion reverses the
 * source winding, so `[A,C,B, A,D,C]` restores positive clip-space winding for
 * Three's default FrontSide material.
 */
export function createFieldCacheDomainGeometry(domain) {
  assertFieldCacheDomain(domain);
  const pixelQuads =
    domain === FIELD_CACHE_DOMAINS.full
      ? [
          [
            [0, 0],
            [FIELD_CACHE_ATLAS_WIDTH, 0],
            [FIELD_CACHE_ATLAS_WIDTH, FIELD_CACHE_ATLAS_HEIGHT],
            [0, FIELD_CACHE_ATLAS_HEIGHT],
          ],
        ]
      : Array.from({ length: FIELD_CACHE_RESOLUTION }, (_, slice) =>
          createFieldCacheSliceDomainPixelVertices(domain, slice),
        );
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const pixelQuad of pixelQuads) {
    const vertexOffset = positions.length / 3;
    for (const [pixelX, pixelY] of pixelQuad) {
      positions.push(...toFieldCacheClipPosition(pixelX, pixelY));
      // Match PlaneGeometry's bottom-left UV convention for the full-domain
      // checkpoint copy material, which samples its render-target inputs
      // without an explicit atlas coordinate.
      uvs.push(
        pixelX / FIELD_CACHE_ATLAS_WIDTH,
        1 - pixelY / FIELD_CACHE_ATLAS_HEIGHT,
      );
    }
    indices.push(
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset,
      vertexOffset + 3,
      vertexOffset + 2,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = `BaryonFieldCache${domain
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")}Geometry`;
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
  geometry.userData.fieldCacheDomain = domain;
  return geometry;
}
const HALF_FLOAT_BYTES = 2;
// Three persisted observer lanes: geometry, appearance, organization.
export const CYMATIC_OBSERVER_CHECKPOINT_BYTES =
  FIELD_CACHE_ATLAS_WIDTH * FIELD_CACHE_ATLAS_HEIGHT * 3 * 4 * HALF_FLOAT_BYTES;

// The grid is laid out as a tiled 2D atlas rather than a 3D texture. A 3D
// render target can only be filled one z slice per pass, and a pass per slice
// costs ~40 us of overhead alone — measured with a shader that does nothing.
// The same voxels as ONE draw into this tile atlas cost ~0.17 ms. The atlas
// gives up hardware interpolation across z, which the sampler pays back with a
// manual lerp between two slices.
//
// Field resolve reads axial neighbours three source cells away for its
// sixth-order gradient. Extending the cached domain by four cells keeps every
// dependency inside the texture for every point the observer and march can
// sample: no edge clamp, wrap-mode assumption, boundary special case, or
// mirrored-parity mismatch.
// Margin cells buy half their count in slack past the sampled hull -- the
// domain scales by 1/(1 - m/RESOLUTION), so m = 10 delivers the four cells this
// dependency needs plus one full cell of float headroom. A dependency landing
// exactly on the domain boundary can round outward and dim the corners and face
// shells instead of erroring.
const STENCIL_MARGIN_CELLS = 10;
/**
 * The march samples the volume hull, not the unit cavity: the domain geometry
 * carries a 1% margin so rays enter cleanly, and the cube shape reaches that
 * margin on every axis. The cache has to cover it, or the outermost samples
 * would read a clamped stencil.
 */
export const FIELD_CACHE_SAMPLED_HALF_EXTENT = 1.01;
export const FIELD_CACHE_DOMAIN_HALF_EXTENT =
  FIELD_CACHE_SAMPLED_HALF_EXTENT /
  (1 - STENCIL_MARGIN_CELLS / FIELD_CACHE_RESOLUTION);
export const FIELD_CACHE_CELL_SIZE =
  (2 * FIELD_CACHE_DOMAIN_HALF_EXTENT) / FIELD_CACHE_RESOLUTION;

/**
 * Accuracy boundary for a modal family entering the quadratic potential.
 *
 * Squaring an axis basis of order n creates structure at order 2n, whose
 * shortest normalized-domain cycle is 2/n. The cache admits an axis only when
 * that cycle spans at least eight cells. This is intentionally stricter than
 * Nyquist: two cells merely avoid aliasing, while the matched gradient and
 * fixed-aperture observer need eight to preserve U=0 surface displacement
 * within the declared sheet width.
 */
export const FIELD_CACHE_MIN_SAMPLES_PER_POTENTIAL_CYCLE = 8;
export const FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER =
  2 / (FIELD_CACHE_CELL_SIZE * FIELD_CACHE_MIN_SAMPLES_PER_POTENTIAL_CYCLE);

/** @param {{ u?: number, v?: number, w?: number }} [mode] */
export function isModalFamilyResolvedByFieldCache({ u, v, w } = {}) {
  return (
    Math.max(
      Number.isFinite(u) ? Math.abs(u) : Number.POSITIVE_INFINITY,
      Number.isFinite(v) ? Math.abs(v) : Number.POSITIVE_INFINITY,
      Number.isFinite(w) ? Math.abs(w) : Number.POSITIVE_INFINITY,
    ) <= FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER
  );
}

/**
 * How far past the sampled hull the bake must still evaluate modes.
 *
 * Voxels outside the marched volume are never sampled directly, so skipping
 * their mode loop is exact and buys ~1.6x on the bake. But they are still READ:
 * an observer voxel near the hull still owns a sixth-order derivative whose
 * source stencil reaches three cells farther. A zeroed source tap there would
 * displace the outer U=0 sheet instead of raising an error. Four cells of slack
 * cover that reach plus the sampled corner itself.
 */
export const FIELD_CACHE_BAKE_GATE_HALF_EXTENT =
  FIELD_CACHE_SAMPLED_HALF_EXTENT + 4 * FIELD_CACHE_CELL_SIZE;

/**
 * Continuous voxel coordinate of a normalized cavity coordinate.
 *
 * Voxel centres sit at `-D + (j + 0.5) h`, matching how a sampler maps a
 * texture coordinate to a texel centre, so this is the inverse of that map.
 */
export function toFieldCacheVoxelCoordinate(normalizedCoordinate) {
  return (
    (normalizedCoordinate + FIELD_CACHE_DOMAIN_HALF_EXTENT) /
      FIELD_CACHE_CELL_SIZE -
    0.5
  );
}

/**
 * Ascending sort of a voxel index triple.
 *
 * CPU mirror of `canonicalizeFieldCacheVoxelIndexNode`. Sorting happens in
 * INDEX space rather than position space so every sparse reader addresses an
 * exact texel centre without interpolation error.
 */
export function sortFieldCacheVoxelIndex([i, j, k]) {
  const low = Math.min(i, Math.min(j, k));
  const high = Math.max(i, Math.max(j, k));
  return [low, i + j + k - low - high, high];
}

/**
 * Where each axis of a voxel lands in its sorted twin.
 *
 * CPU mirror of `deriveFieldCacheVoxelRankNode`. The asymmetric comparison
 * against earlier components is what keeps the result a valid permutation
 * when indices are equal — with plain `>` on both sides, a tie would give two
 * axes the same rank and observer reconstruction would drop a gradient
 * component.
 */
export function deriveFieldCacheVoxelRank([i, j, k]) {
  return [
    (i > j ? 1 : 0) + (i > k ? 1 : 0),
    (j >= i ? 1 : 0) + (j > k ? 1 : 0),
    (k >= i ? 1 : 0) + (k >= j ? 1 : 0),
  ];
}

// Field cache geometry owner end.
