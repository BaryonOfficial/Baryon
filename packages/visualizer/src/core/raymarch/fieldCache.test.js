import { describe, expect, it } from "vitest";
import {
  buildRaymarchFieldCacheDescriptor,
  createRaymarchFieldCache,
  evaluateRaymarchFieldCachePoint,
  shouldRebuildRaymarchFieldCache,
} from "./fieldCache.js";

describe("fieldCache", () => {
  it("creates a compute-writable 3d storage texture", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });

    expect(fieldCache.texture.isStorageTexture).toBe(true);
    expect(fieldCache.texture.is3DTexture).toBe(true);
    expect(fieldCache.texture.image.width).toBe(8);
    expect(fieldCache.texture.image.height).toBe(8);
    expect(fieldCache.texture.image.depth).toBe(8);
    expect(fieldCache.ready).toBe(false);
    expect(fieldCache.backend).toBe("compute");
  });

  it("detects rebuilds only when the uploaded modal field changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const slots = new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.4]);
    const initialDescriptor = buildRaymarchFieldCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(8),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
    });
    const sameDescriptor = buildRaymarchFieldCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(8),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
    });
    const changedDescriptor = buildRaymarchFieldCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(8),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius: 3,
    });
    const first = shouldRebuildRaymarchFieldCache(
      fieldCache,
      initialDescriptor,
    );
    fieldCache.activeDescriptor = initialDescriptor;
    const second = shouldRebuildRaymarchFieldCache(fieldCache, sameDescriptor);
    const third = shouldRebuildRaymarchFieldCache(
      fieldCache,
      changedDescriptor,
    );

    expect(first.needsRebuild).toBe(true);
    expect(first.reason).toBe("initial");
    expect(second.needsRebuild).toBe(false);
    expect(second.reason).toBe("unchanged");
    expect(third.needsRebuild).toBe(true);
    expect(third.reason).toBe("boundary-mode");
  });

  it("detects rebuilds when the effective cavity geometry key changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const rectangularDescriptor = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array(4),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      cavityGeometry: "rectangular",
      radius: 3,
    });
    const sphericalDescriptor = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array(4),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      cavityGeometry: "spherical",
      radius: 3,
    });

    fieldCache.activeDescriptor = rectangularDescriptor;
    const rebuild = shouldRebuildRaymarchFieldCache(
      fieldCache,
      sphericalDescriptor,
    );

    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("cavity-geometry");
  });

  it("builds deterministic descriptors from the uploaded slot set", () => {
    const descriptorA = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const descriptorB = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.25]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(descriptorA.backboneHash).toBe(descriptorB.backboneHash);
    expect(descriptorA.detailHash).not.toBe(descriptorB.detailHash);
  });

  it("detects rebuilds when slot amplitudes change", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const first = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.6]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    fieldCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchFieldCache(fieldCache, second);

    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("mode-slots");
  });

  it("evaluates pointwise cpu field values for parity checks", () => {
    const sample = evaluateRaymarchFieldCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });

    expect(Number.isFinite(sample.field)).toBe(true);
    expect(Number.isFinite(sample.gradX)).toBe(true);
    expect(Number.isFinite(sample.gradY)).toBe(true);
    expect(Number.isFinite(sample.gradZ)).toBe(true);
  });

  it("keeps rectangular parity when spherical is requested but the effective backend stays rectangular", () => {
    const rectangularSample = evaluateRaymarchFieldCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      cavityGeometry: "rectangular",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });
    const sphericalRequestSample = evaluateRaymarchFieldCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      cavityGeometry: "spherical",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });

    expect(sphericalRequestSample).toEqual(rectangularSample);
  });
});
