import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createTSLBuffers } from "./buffers.js";

function createGeometry(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

function createParameters(overrides = {}) {
  return {
    count: 4,
    radius: 1,
    surfaceRatio: 0.5,
    ...overrides,
  };
}

function createAudioConfig(overrides = {}) {
  return {
    capacity: 8,
    fftSize: 16,
    ...overrides,
  };
}

describe("createTSLBuffers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("packs vec3 position sources into vec4 buffers with the expected w lanes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const geometry = createGeometry([1, 2, 3, 4, 5, 6]);
    const buffers = createTSLBuffers(
      geometry,
      createParameters({ count: 3 }),
      createAudioConfig(),
    );

    expect(buffers.basePositionBuffer.value.array[3]).toBe(1);
    expect(buffers.basePositionBuffer.value.array[7]).toBe(1);
    expect(buffers.zeroPointsBuffer.value.array[3]).toBe(2);
    expect(buffers.zeroPointsBuffer.value.array[7]).toBe(2);
  });

  it("repeats logo positions across particle count and seeds random logo weights", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const geometry = createGeometry([1, 2, 3, 4, 5, 6]);
    const buffers = createTSLBuffers(
      geometry,
      createParameters({ count: 3 }),
      createAudioConfig(),
    );

    expect(Array.from(buffers.baryonBuffer.value.array.slice(0, 12))).toEqual([
      1, 2, 3, 0.5, 4, 5, 6, 0.5, 1, 2, 3, 0.5,
    ]);
  });

  it("initializes particle velocity lanes to zero", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const geometry = createGeometry([1, 2, 3]);
    const buffers = createTSLBuffers(
      geometry,
      createParameters({ count: 2 }),
      createAudioConfig(),
    );

    expect(Array.from(buffers.velocityBuffer.value.array)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("fails fast for invalid geometry and config inputs", () => {
    const invalidGeometry = new THREE.BufferGeometry();
    const validGeometry = createGeometry([1, 2, 3]);

    expect(() =>
      createTSLBuffers(
        invalidGeometry,
        createParameters(),
        createAudioConfig(),
      ),
    ).toThrow(/non-empty position attribute/);

    expect(() =>
      createTSLBuffers(
        validGeometry,
        createParameters({ count: 0 }),
        createAudioConfig(),
      ),
    ).toThrow(/parameters\.count must be a positive integer/);

    expect(() =>
      createTSLBuffers(validGeometry, createParameters(), {
        ...createAudioConfig(),
        fftSize: 0,
      }),
    ).toThrow(/audioConfig\.fftSize must be a positive integer/);
  });
});
