import * as THREE from "three";
import {
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_DOMAINS,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
  assertFieldCacheDomain,
} from "./fieldCacheGeometry.js";

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
