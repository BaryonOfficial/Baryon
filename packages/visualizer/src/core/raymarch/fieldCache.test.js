import { describe, expect, it } from "vitest";
import {
  buildRaymarchSpectralLightCacheDescriptor,
  buildRaymarchFieldCacheDescriptor,
  createRaymarchSpectralLightCache,
  createRaymarchFieldCache,
  evaluateRaymarchFieldCachePoint,
  isRaymarchSpectralLightCacheReadyForDescriptor,
  shouldRebuildRaymarchSpectralLightCache,
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

  it("builds descriptors from topology and relative modal weights", () => {
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

    expect(descriptorA.backboneHash).not.toBe(descriptorB.backboneHash);
    expect(descriptorA.detailHash).not.toBe(descriptorB.detailHash);
  });

  it("does not rebuild when only the global modal amplitude scale changes", () => {
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
      backboneSlots: new Float32Array([1, 2, 3, 0.45]),
      detailSlots: new Float32Array([2, 2, 4, 0.1]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    fieldCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchFieldCache(fieldCache, second);

    expect(second).toEqual(first);
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("detects rebuilds when relative modal weights change", () => {
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

  it("keeps field descriptors unchanged when only color slots change", () => {
    const first = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(second).toEqual(first);
  });

  it("keeps field descriptors unchanged when only phase advisory slots change", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const phaseA = new Float32Array([0.1, 0.2, 0.7, 0.5]);
    const phaseB = new Float32Array([1.4, -0.3, 0.8, 0.7]);
    const first = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backbonePhaseSlots: phaseA,
      detailPhaseSlots: phaseA,
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backbonePhaseSlots: phaseB,
      detailPhaseSlots: phaseB,
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    fieldCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchFieldCache(fieldCache, second);

    expect(second).toEqual(first);
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("detects Spectral Light rebuilds when color slots change", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const first = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([0.8, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    spectralLightCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchSpectralLightCache(
      spectralLightCache,
      second,
    );

    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("color-slots");
  });

  it("detects Spectral Light rebuilds when modal geometry changes", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const first = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 3, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    spectralLightCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchSpectralLightCache(
      spectralLightCache,
      second,
    );

    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("mode-slots");
  });

  it("tracks Spectral Light readiness against the full Spectral Light descriptor", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    spectralLightCache.ready = true;
    spectralLightCache.activeDescriptor = descriptor;

    expect(
      isRaymarchSpectralLightCacheReadyForDescriptor(
        spectralLightCache,
        descriptor,
      ),
    ).toBe(true);
  });

  it("keeps field and Spectral Light compute-node maps separate", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });

    expect(fieldCache.computeNodesByKey).not.toBe(
      spectralLightCache.computeNodesByKey,
    );
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

  it("evaluates cached pointwise fields independent of global amplitude scale", () => {
    const quiet = evaluateRaymarchFieldCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.45]),
      detailSlots: new Float32Array([2, 2, 4, 0.1]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });
    const loud = evaluateRaymarchFieldCachePoint({
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

    expect(loud.field).toBeCloseTo(quiet.field, 6);
    expect(loud.gradX).toBeCloseTo(quiet.gradX, 6);
    expect(loud.gradY).toBeCloseTo(quiet.gradY, 6);
    expect(loud.gradZ).toBeCloseTo(quiet.gradZ, 6);
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
