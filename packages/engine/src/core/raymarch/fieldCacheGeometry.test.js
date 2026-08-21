import { describe, expect, it } from "vitest";
import {
  CYMATIC_OBSERVER_CHECKPOINT_BYTES,
  FIELD_CACHE_DOMAINS,
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER,
  FIELD_CACHE_MIN_SAMPLES_PER_POTENTIAL_CYCLE,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_SAMPLED_HALF_EXTENT,
  FIELD_CACHE_TILES_X,
  FIELD_CACHE_TILES_Y,
  createFieldCacheDomainGeometry,
  isFieldCacheVoxelInDomain,
  isModalFamilyResolvedByFieldCache,
  toFieldCacheVoxelCoordinate,
} from "./fieldCacheGeometry.js";

const SPARSE_DOMAINS = Object.freeze([
  FIELD_CACHE_DOMAINS.fundamentalXyz,
  FIELD_CACHE_DOMAINS.halfYz,
  FIELD_CACHE_DOMAINS.halfXy,
]);

function toTopLeftPixel([clipX, clipY]) {
  return [
    ((clipX + 1) * FIELD_CACHE_ATLAS_WIDTH) / 2,
    ((1 - clipY) * FIELD_CACHE_ATLAS_HEIGHT) / 2,
  ];
}

function signedArea2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function triangleContainsPoint(point, a, b, c) {
  const ab = signedArea2(a, b, point);
  const bc = signedArea2(b, c, point);
  const ca = signedArea2(c, a, point);
  return (
    (ab >= -Number.EPSILON && bc >= -Number.EPSILON && ca >= -Number.EPSILON) ||
    (ab <= Number.EPSILON && bc <= Number.EPSILON && ca <= Number.EPSILON)
  );
}

describe("field cache atlas layout", () => {
  it("tiles every z slice exactly once", () => {
    expect(FIELD_CACHE_TILES_X * FIELD_CACHE_TILES_Y).toBe(
      FIELD_CACHE_RESOLUTION,
    );
    expect(FIELD_CACHE_ATLAS_WIDTH * FIELD_CACHE_ATLAS_HEIGHT).toBe(
      FIELD_CACHE_RESOLUTION ** 3,
    );
  });

  it("budgets one full observer checkpoint explicitly", () => {
    expect(CYMATIC_OBSERVER_CHECKPOINT_BYTES).toBe(48 * 1024 * 1024);
  });
});

describe("field cache render domains", () => {
  it.each(SPARSE_DOMAINS)(
    "%s covers exactly its voxel predicate with one indexed draw",
    (domain) => {
      const geometry = createFieldCacheDomainGeometry(domain);
      try {
        const position = geometry.getAttribute("position");
        const index = geometry.getIndex();
        expect(position.count).toBe(FIELD_CACHE_RESOLUTION * 4);
        expect(index?.count).toBe(FIELD_CACHE_RESOLUTION * 6);
        expect(geometry.groups).toHaveLength(0);
        expect(geometry.userData.fieldCacheDomain).toBe(domain);

        let coveredCount = 0;
        let expectedCount = 0;
        let mismatchCount = 0;
        let firstMismatch = null;
        for (let k = 0; k < FIELD_CACHE_RESOLUTION; k += 1) {
          const vertexOffset = k * 4;
          const vertices = Array.from({ length: 4 }, (_, vertex) =>
            toTopLeftPixel([
              position.getX(vertexOffset + vertex),
              position.getY(vertexOffset + vertex),
            ]),
          );
          const [a, b, c, d] = vertices;
          const tileOriginX =
            (k % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION;
          const tileOriginY =
            Math.floor(k / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION;
          // Include a one-pixel ring around the tile so the half-pixel sloped
          // edge cannot silently write a neighbouring slice.
          for (let localJ = -1; localJ <= FIELD_CACHE_RESOLUTION; localJ += 1) {
            for (
              let localI = -1;
              localI <= FIELD_CACHE_RESOLUTION;
              localI += 1
            ) {
              const atlasI = tileOriginX + localI;
              const atlasJ = tileOriginY + localJ;
              if (
                atlasI < 0 ||
                atlasI >= FIELD_CACHE_ATLAS_WIDTH ||
                atlasJ < 0 ||
                atlasJ >= FIELD_CACHE_ATLAS_HEIGHT
              ) {
                continue;
              }
              const point = [atlasI + 0.5, atlasJ + 0.5];
              const covered =
                triangleContainsPoint(point, a, c, b) ||
                triangleContainsPoint(point, a, d, c);
              const sampledI = atlasI % FIELD_CACHE_RESOLUTION;
              const sampledJ = atlasJ % FIELD_CACHE_RESOLUTION;
              const sampledK =
                Math.floor(atlasJ / FIELD_CACHE_RESOLUTION) *
                  FIELD_CACHE_TILES_X +
                Math.floor(atlasI / FIELD_CACHE_RESOLUTION);
              const expected =
                sampledK === k &&
                isFieldCacheVoxelInDomain(domain, [sampledI, sampledJ, k]);
              coveredCount += covered ? 1 : 0;
              expectedCount += expected ? 1 : 0;
              if (covered !== expected) {
                mismatchCount += 1;
                firstMismatch ??= {
                  producerSlice: k,
                  sampledVoxel: [sampledI, sampledJ, sampledK],
                  covered,
                  expected,
                };
              }
            }
          }
        }
        expect({ mismatchCount, firstMismatch }).toEqual({
          mismatchCount: 0,
          firstMismatch: null,
        });
        expect(coveredCount).toBe(expectedCount);
      } finally {
        geometry.dispose();
      }
    },
  );

  it.each([FIELD_CACHE_DOMAINS.full, ...SPARSE_DOMAINS])(
    "%s maps top-left pixel edges to clip space with front-facing winding",
    (domain) => {
      const geometry = createFieldCacheDomainGeometry(domain);
      try {
        const position = geometry.getAttribute("position");
        const uv = geometry.getAttribute("uv");
        const index = geometry.getIndex();
        expect(position.getX(0)).toBe(-1);
        expect(position.getY(0)).toBe(1);
        expect(uv.getX(0)).toBe(0);
        expect(uv.getY(0)).toBe(1);
        for (let triangle = 0; triangle < index.count; triangle += 3) {
          const vertices = Array.from({ length: 3 }, (_, offset) => {
            const vertex = index.getX(triangle + offset);
            return [position.getX(vertex), position.getY(vertex)];
          });
          expect(
            signedArea2(vertices[0], vertices[1], vertices[2]),
          ).toBeGreaterThan(0);
        }
      } finally {
        geometry.dispose();
      }
    },
  );
});

describe("field cache stencil containment", () => {
  // Trilinear reads base/base+1, and the matched gradient depends on a
  // sixth-order source difference reaching three cells farther.
  const dependencyRange = (coordinate) => {
    const base = Math.floor(toFieldCacheVoxelCoordinate(coordinate));
    return { lowest: base - 3, highest: base + 4 };
  };

  it("keeps every interpolation and derivative dependency inside the grid", () => {
    for (const sign of [-1, 1]) {
      const { lowest, highest } = dependencyRange(
        sign * FIELD_CACHE_SAMPLED_HALF_EXTENT,
      );
      expect(lowest).toBeGreaterThanOrEqual(0);
      expect(highest).toBeLessThanOrEqual(FIELD_CACHE_RESOLUTION - 1);
    }
  });

  it("leaves at least one cell of slack, so rounding cannot push a tap out", () => {
    expect(
      dependencyRange(-FIELD_CACHE_SAMPLED_HALF_EXTENT).lowest,
    ).toBeGreaterThanOrEqual(1);
    expect(
      dependencyRange(FIELD_CACHE_SAMPLED_HALF_EXTENT).highest,
    ).toBeLessThanOrEqual(FIELD_CACHE_RESOLUTION - 2);
  });

  it("places voxel centres half a cell in from the domain edge", () => {
    expect(
      toFieldCacheVoxelCoordinate(
        -FIELD_CACHE_DOMAIN_HALF_EXTENT + FIELD_CACHE_CELL_SIZE / 2,
      ),
    ).toBeCloseTo(0, 10);
    expect(
      toFieldCacheVoxelCoordinate(
        FIELD_CACHE_DOMAIN_HALF_EXTENT - FIELD_CACHE_CELL_SIZE / 2,
      ),
    ).toBeCloseTo(FIELD_CACHE_RESOLUTION - 1, 10);
  });
});

describe("field cache modal accuracy boundary", () => {
  it("requires the shortest quadratic potential cycle to span eight cells", () => {
    expect(FIELD_CACHE_MIN_SAMPLES_PER_POTENTIAL_CYCLE).toBe(8);
    expect(
      2 / (FIELD_CACHE_MAX_ACCURATE_MODAL_AXIS_ORDER * FIELD_CACHE_CELL_SIZE),
    ).toBeCloseTo(FIELD_CACHE_MIN_SAMPLES_PER_POTENTIAL_CYCLE, 12);
    expect(isModalFamilyResolvedByFieldCache({ u: 0, v: 0, w: 14 })).toBe(true);
    expect(isModalFamilyResolvedByFieldCache({ u: 0, v: 0, w: 16 })).toBe(
      false,
    );
  });
});
