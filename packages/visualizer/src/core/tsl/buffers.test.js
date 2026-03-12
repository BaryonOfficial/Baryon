import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createTSLBuffers } from "./buffers.js";
import {
  SHELL_COUNT,
  SHELL_JITTER_RATIO,
  getShellMinRadius,
  getShellSpacing,
} from "./shells.js";

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

function createSequenceRng(sequence) {
  let index = 0;
  return () => {
    const value = sequence[index % sequence.length];
    index += 1;
    return value;
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

    expect(buffers.basePositionBuffer.value.array[3]).toBe(
      buffers.baseShellRadii[0],
    );
    expect(buffers.basePositionBuffer.value.array[7]).toBe(
      buffers.baseShellRadii[1],
    );
    expect(buffers.zeroPointsBuffer.value.array[3]).toBe(2);
    expect(buffers.zeroPointsBuffer.value.array[7]).toBe(2);
  });

  it("quantizes shell anchors within the supported shell band range", () => {
    const sequence = Array.from(
      { length: 128 },
      (_, index) => (index + 1) / 129,
    );
    const buffers = createTSLBuffers(
      createGeometry([1, 2, 3]),
      createParameters({ count: 64 }),
      createAudioConfig(),
      { rng: createSequenceRng(sequence) },
    );

    const shellSpacing = getShellSpacing(1);
    const minRadius = getShellMinRadius(1);
    const shellIndices = Array.from(buffers.baseShellRadii, (shellRadius) =>
      Math.round((shellRadius - minRadius) / shellSpacing),
    );

    expect(Math.min(...buffers.baseShellRadii)).toBeGreaterThanOrEqual(
      minRadius,
    );
    expect(Math.max(...buffers.baseShellRadii)).toBeLessThanOrEqual(1);
    expect(new Set(shellIndices).size).toBeLessThanOrEqual(SHELL_COUNT);
    expect(new Set(shellIndices).size).toBeGreaterThan(1);

    for (let i = 0; i < buffers.baseShellRadii.length; i++) {
      const sourceOffset = i * 3;
      const sampledRadius = Math.hypot(
        buffers.basePositions[sourceOffset],
        buffers.basePositions[sourceOffset + 1],
        buffers.basePositions[sourceOffset + 2],
      );

      expect(
        Math.abs(sampledRadius - buffers.baseShellRadii[i]),
      ).toBeLessThanOrEqual(shellSpacing * SHELL_JITTER_RATIO + 1e-6);
    }
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

  it("produces deterministic packed data when given the same rng sequence", () => {
    const geometry = createGeometry([1, 2, 3, 4, 5, 6]);
    const sequence = [0.2, 0.4, 0.6, 0.8, 0.1];

    const first = createTSLBuffers(
      geometry,
      createParameters({ count: 3 }),
      createAudioConfig(),
      { rng: createSequenceRng(sequence) },
    );
    const second = createTSLBuffers(
      geometry,
      createParameters({ count: 3 }),
      createAudioConfig(),
      { rng: createSequenceRng(sequence) },
    );

    expect(Array.from(first.basePositions)).toEqual(
      Array.from(second.basePositions),
    );
    expect(Array.from(first.baseShellRadii)).toEqual(
      Array.from(second.baseShellRadii),
    );
    expect(Array.from(first.initialParticlePositions)).toEqual(
      Array.from(second.initialParticlePositions),
    );
    expect(Array.from(first.baryonBuffer.value.array)).toEqual(
      Array.from(second.baryonBuffer.value.array),
    );
  });

  it("uses injected rng values for logo weights and particle sampling", () => {
    const geometry = createGeometry([1, 2, 3, 4, 5, 6]);
    const sequence = [0.2, 0.4, 0.6, 0.8, 0.1];
    const buffers = createTSLBuffers(
      geometry,
      createParameters({ count: 3 }),
      createAudioConfig(),
      { rng: createSequenceRng(sequence) },
    );
    const repeatedBuffers = createTSLBuffers(
      geometry,
      createParameters({ count: 3 }),
      createAudioConfig(),
      { rng: createSequenceRng(sequence) },
    );

    const baryonWeights = Array.from(buffers.baryonBuffer.value.array).filter(
      (_, index) => index % 4 === 3,
    );
    const repeatedWeights = Array.from(
      repeatedBuffers.baryonBuffer.value.array,
    ).filter((_, index) => index % 4 === 3);

    expect(baryonWeights).toEqual(repeatedWeights);
    expect(Array.from(buffers.initialParticlePositions)).toEqual(
      Array.from(buffers.basePositions),
    );
    expect(Array.from(buffers.initialParticlePositions)).toEqual(
      Array.from(repeatedBuffers.initialParticlePositions),
    );
    expect(
      buffers.initialParticlePositions.some((value) => Math.abs(value) > 0),
    ).toBe(true);
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

  it("still supports the default constructor path without sampling options", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);

    const geometry = createGeometry([1, 2, 3]);
    const buffers = createTSLBuffers(
      geometry,
      createParameters({ count: 2 }),
      createAudioConfig(),
    );

    expect(buffers.count).toBe(2);
    expect(buffers.capacity).toBe(8);
    expect(buffers.fftHalfSize).toBe(8);
  });
});
