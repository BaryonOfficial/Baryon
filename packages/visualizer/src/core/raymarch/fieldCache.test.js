import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCanonicalFullModalDescriptor } from "../modalDescriptor.js";
import * as raymarchFieldCache from "./fieldCache.js";
import {
  buildRaymarchSpectralLightCacheDescriptor as buildUnifiedRaymarchSpectralLightCacheDescriptor,
  buildRaymarchFieldCacheDescriptor as buildUnifiedRaymarchFieldCacheDescriptor,
  createRaymarchSpectralLightCache,
  createRaymarchFieldCache,
  enqueueRaymarchFieldCacheRebuild as enqueueUnifiedRaymarchFieldCacheRebuild,
  enqueueRaymarchSpectralLightCacheRebuild as enqueueUnifiedRaymarchSpectralLightCacheRebuild,
  evaluateRaymarchFieldCachePoint as evaluateUnifiedRaymarchFieldCachePoint,
  evaluateRaymarchSpectralLightCachePoint as evaluateUnifiedRaymarchSpectralLightCachePoint,
  evaluateRaymarchSignedPotentialAtPoint as evaluateUnifiedRaymarchSignedPotentialAtPoint,
  isRaymarchSpectralLightCacheReadyForDescriptor,
  shouldRebuildRaymarchSpectralLightCache,
  shouldRebuildRaymarchFieldCache,
} from "./fieldCache.js";

function copySlotPrefix(slots, count) {
  const slotCount = Math.max(0, Math.round(count || 0));
  return Array.from(slots ?? new Float32Array(0)).slice(0, slotCount * 4);
}

function resolveModalFieldSlots(options) {
  if (options.modalFieldSlots) {
    return {
      modalFieldSlots: options.modalFieldSlots,
      modalFieldCount: options.modalFieldCount,
    };
  }

  return {
    modalFieldSlots: new Float32Array([
      ...copySlotPrefix(options.backboneSlots, options.backboneCount),
      ...copySlotPrefix(options.detailSlots, options.detailCount),
    ]),
    modalFieldCount:
      Math.max(0, Math.round(options.backboneCount || 0)) +
      Math.max(0, Math.round(options.detailCount || 0)),
  };
}

function resolveModalFieldPhaseSlots(options) {
  if (options.modalFieldPhaseSlots) {
    return options.modalFieldPhaseSlots;
  }

  return new Float32Array([
    ...copySlotPrefix(options.backbonePhaseSlots, options.backboneCount),
    ...copySlotPrefix(options.detailPhaseSlots, options.detailCount),
  ]);
}

function resolveModalFieldColorSlots(options) {
  if (options.modalFieldColorSlots) {
    return options.modalFieldColorSlots;
  }

  return new Float32Array([
    ...copySlotPrefix(options.backboneColorSlots, options.backboneCount),
    ...copySlotPrefix(options.detailColorSlots, options.detailCount),
  ]);
}

function buildRaymarchFieldCacheDescriptor(options) {
  return buildUnifiedRaymarchFieldCacheDescriptor({
    ...options,
    ...resolveModalFieldSlots(options),
  });
}

function buildRaymarchSpectralLightCacheDescriptor(options) {
  return buildUnifiedRaymarchSpectralLightCacheDescriptor({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldColorSlots: resolveModalFieldColorSlots(options),
  });
}

function evaluateRaymarchFieldCachePoint(options) {
  return evaluateUnifiedRaymarchFieldCachePoint({
    ...options,
    ...resolveModalFieldSlots(options),
  });
}

function evaluateRaymarchSpectralLightCachePoint(options) {
  return evaluateUnifiedRaymarchSpectralLightCachePoint({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldColorSlots: resolveModalFieldColorSlots(options),
  });
}

function evaluateRaymarchSignedPotentialAtPoint(options) {
  return evaluateUnifiedRaymarchSignedPotentialAtPoint({
    ...options,
    ...resolveModalFieldSlots(options),
  });
}

function buildRaymarchModalBasisCacheDescriptor(options) {
  return raymarchFieldCache.buildRaymarchModalBasisCacheDescriptor({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldPhaseSlots: resolveModalFieldPhaseSlots(options),
  });
}

function evaluateRaymarchLiveSynthesisFieldPoint(options) {
  return raymarchFieldCache.evaluateRaymarchLiveSynthesisFieldPoint({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldPhaseSlots: resolveModalFieldPhaseSlots(options),
  });
}

function resolveModalFieldRebuildOptions(options) {
  const modeBuffer =
    options.modalFieldModeBuffer ?? options.backboneModeBuffer ?? null;
  return {
    ...options,
    modalFieldModeBuffer: modeBuffer,
    modalFieldColorBuffer:
      options.modalFieldColorBuffer ?? options.backboneColorBuffer ?? null,
    modalFieldPhaseBuffer:
      options.modalFieldPhaseBuffer ?? options.backbonePhaseBuffer ?? null,
    modalFieldCapacity: options.modalFieldCapacity ?? 0,
    uniforms: {
      ...options.uniforms,
      uModalFieldModeCount: options.uniforms?.uModalFieldModeCount ??
        options.uniforms?.uBackboneModeCount ?? { value: 0 },
    },
  };
}

function getTestComputeNodeKey(capacity, cavityGeometry = "rectangular") {
  return `${cavityGeometry}:neumann:capacity=${Math.max(
    1,
    Math.round(capacity || 0),
  )}`;
}

async function flushCacheMicrotasks(count = 5) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

function enqueueRaymarchFieldCacheRebuild(
  fieldCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  return enqueueUnifiedRaymarchFieldCacheRebuild(
    fieldCache,
    renderer,
    descriptor,
    rebuildReason,
    resolveModalFieldRebuildOptions(options),
  );
}

function enqueueRaymarchSpectralLightCacheRebuild(
  spectralLightCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  return enqueueUnifiedRaymarchSpectralLightCacheRebuild(
    spectralLightCache,
    renderer,
    descriptor,
    rebuildReason,
    resolveModalFieldRebuildOptions(options),
  );
}

function enqueueRaymarchModalBasisCacheRebuild(
  modalBasisCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  return raymarchFieldCache.enqueueRaymarchModalBasisCacheRebuild(
    modalBasisCache,
    renderer,
    descriptor,
    rebuildReason,
    resolveModalFieldRebuildOptions(options),
  );
}

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
    expect(fieldCache.mode).toBe("cached");
    expect(fieldCache.queuedDescriptor).toBeNull();
    expect(fieldCache.pendingDescriptor).toBeNull();
  });

  it("creates the canonical modal-basis cache without fixed phase cadence", () => {
    expect(raymarchFieldCache.createRaymarchModalBasisCache).toBeTypeOf(
      "function",
    );
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });

    expect(modalBasisCache.texture.isStorageTexture).toBe(true);
    expect(modalBasisCache.texture.is3DTexture).toBe(true);
    expect(modalBasisCache.texture.image.width).toBe(8);
    expect(modalBasisCache.texture.image.depth).toBe(
      8 * raymarchFieldCache.RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
    );
    expect(modalBasisCache.ready).toBe(false);
    expect(modalBasisCache.backend).toBe("compute");
    expect(modalBasisCache.mode).toBe("modal-basis-cached");
    expect(modalBasisCache.semantic).toBe("modal-basis-cache");
    expect(modalBasisCache.basisPacking).toBe("z-slice-pages-v1");
    expect(modalBasisCache.liveSynthesisModeCount).toBe(
      raymarchFieldCache.RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
    );
    expect(modalBasisCache.liveSynthesisSupportDiagnosticSampleCount).toBe(0);
    expect(
      modalBasisCache.liveSynthesisSupportDiagnosticSupportedSampleCount,
    ).toBe(0);
    expect(modalBasisCache.liveSynthesisSupportDiagnosticCoverage).toBe(0);
    expect(modalBasisCache).not.toHaveProperty("updateIntervalMs");
  });

  it("creates companion modal-basis support metadata without a second field authority", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });

    expect(modalBasisCache.supportTexture.isStorageTexture).toBe(true);
    expect(modalBasisCache.supportTexture.is3DTexture).toBe(true);
    expect(modalBasisCache.supportTexture.image.width).toBe(8);
    expect(modalBasisCache.supportTexture.image.depth).toBe(
      modalBasisCache.texture.image.depth,
    );
    expect(modalBasisCache.supportTexture).not.toBe(modalBasisCache.texture);
    expect(modalBasisCache.semantic).toBe("modal-basis-cache");
    expect(modalBasisCache.supportSemantic).toBe(
      "coefficient-invariant-basis-support",
    );
  });

  it("marks all-rejected modal-basis descriptors as non-drawable", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([99, 99, 99, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });

    expect(descriptor.modalFieldCount).toBe(1);
    expect(descriptor.contributingBasisPageModeCount).toBe(0);
    expect(descriptor.bandwidthRejectedModeCount).toBe(1);
    expect(descriptor.modalBasisCacheDrawable).toBe(false);
    expect(descriptor.modalBasisCacheBlockedReason).toBe(
      "no-contributing-basis-pages",
    );
  });

  it("marks representable modal-basis descriptors as drawable candidates", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });

    expect(descriptor.contributingBasisPageModeCount).toBe(1);
    expect(descriptor.modalBasisCacheDrawable).toBe(true);
    expect(descriptor.modalBasisCacheBlockedReason).toBeNull();
  });

  it("resolves modal-basis cache drawable states", () => {
    const cache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0.2, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });
    const phaseDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0.4, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
      time: 1,
    });
    const structuralDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 2, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0.4, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });
    const blockedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([99, 99, 99, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });

    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        null,
        descriptor,
      ),
    ).toMatchObject({
      drawable: false,
      state: "modal-basis-cache-absent",
      blockedReason: "cache-unavailable",
    });

    cache.rebuildPending = true;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        descriptor,
      ),
    ).toMatchObject({
      drawable: false,
      state: "modal-basis-cache-building",
      blockedReason: "cache-rebuild-pending",
    });

    cache.ready = true;
    cache.activeDescriptor = descriptor;
    cache.rebuildPending = true;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        structuralDescriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-stale",
    });

    cache.rebuildPending = false;
    cache.activeDescriptor = descriptor;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        descriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
      blockedReason: null,
    });

    cache.lastRebuildSubmittedAtSec = 1;
    cache.activePhaseSampleTimeSec = 0.4;
    const phaseCurrentAuthority =
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        phaseDescriptor,
      );
    expect(phaseCurrentAuthority).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
      blockedReason: null,
      staleReason: null,
    });

    cache.rebuildPending = true;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        structuralDescriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-stale",
      blockedReason: null,
      staleReason: "modal-identity",
    });

    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        blockedDescriptor,
      ),
    ).toMatchObject({
      drawable: false,
      state: "modal-basis-cache-blocked",
      blockedReason: "no-contributing-basis-pages",
    });
  });

  it("builds modal-basis compute as a coefficient-invariant basis atlas", () => {
    const source = readFileSync(
      new URL("./fieldCache.js", import.meta.url),
      "utf8",
    );
    const computeStart = source.indexOf(
      "function createModalBasisCacheComputeKernel",
    );
    const computeEnd = source.indexOf(
      "function getOrCreateRaymarchFieldCacheComputeNode",
      computeStart,
    );
    const computeSource = source.slice(computeStart, computeEnd);
    const supportTextureStoreStart = computeSource.indexOf("supportTexture");

    expect(computeStart).toBeGreaterThan(-1);
    expect(computeEnd).toBeGreaterThan(computeStart);
    expect(computeSource).toContain("const pageIndex = voxelCoord.z.div");
    expect(computeSource).toContain("const localZ = voxelCoord.z.mod");
    expect(computeSource).toContain(
      "const slot = modalFieldModeBuffer.element(pageIndexInt);",
    );
    expect(computeSource).toContain("basisField.addAssign(family.field);");
    expect(computeSource).toContain(
      "vec4(basisField, basisGradX, basisGradY, basisGradZ)",
    );
    expect(computeSource).toContain("vec4(abs(basisField), float(1.0)");
    expect(computeSource).not.toContain("modalFieldPhaseBuffer");
    expect(computeSource).not.toContain("phaseCurrentContribution");
    expect(computeSource).not.toContain("totalAmplitude");
    expect(supportTextureStoreStart).toBeGreaterThan(-1);
  });

  it("keeps Spectral Light cache compute as raw color metadata", () => {
    const source = readFileSync(
      new URL("./fieldCache.js", import.meta.url),
      "utf8",
    );
    const spectralComputeStart = source.indexOf(
      "function createSpectralLightComputeKernel",
    );
    const spectralComputeEnd = source.indexOf(
      "function createModalBasisCacheComputeKernel",
      spectralComputeStart,
    );
    const spectralComputeSource = source.slice(
      spectralComputeStart,
      spectralComputeEnd,
    );

    expect(spectralComputeStart).toBeGreaterThan(-1);
    expect(spectralComputeEnd).toBeGreaterThan(spectralComputeStart);
    expect(spectralComputeSource).not.toContain("signedVisibility");
    expect(spectralComputeSource).not.toContain("normalizedColorWeight");
    expect(spectralComputeSource).not.toContain("totalAmplitude");
    expect(spectralComputeSource).not.toContain("localChromaInfluence");
    expect(spectralComputeSource).not.toContain("chromaNormalizer");
    expect(spectralComputeSource).toContain("const colorSumX = zero.toVar();");
    expect(spectralComputeSource).toContain(
      "colorSumX.addAssign(localInfluence.mul(colorSlot.x));",
    );
    expect(spectralComputeSource).toContain(
      "vec4(colorSumX, colorSumY, colorSumZ, colorWeight)",
    );
  });

  it("treats phase offsets as live-synthesis state", () => {
    expect(buildRaymarchModalBasisCacheDescriptor).toBeTypeOf("function");
    expect(raymarchFieldCache.shouldRebuildRaymarchModalBasisCache).toBeTypeOf(
      "function",
    );
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.3,
    });
    const carrierAdvancedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0.7, 0.2, 0.5, 0.6]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.3,
    });
    const phaseParameterChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        backboneSlots: slots,
        detailSlots: new Float32Array(0),
        backbonePhaseSlots: new Float32Array([0.7, 0.32, 0.5, 0.6]),
        detailPhaseSlots: new Float32Array(0),
        backboneCount: 1,
        detailCount: 0,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 0.3,
      });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const carrierAdvancedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.7, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(carrierAdvancedSample.field).not.toBeCloseTo(initialSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        initialDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        carrierAdvancedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        phaseParameterChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        activeDescriptor: initialDescriptor,
        nextDescriptor: carrierAdvancedDescriptor,
      }),
    ).toBeNull();
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        descriptorFresh: true,
        activeDescriptor: phaseParameterChangedDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBeNull();
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        rebuildPending: true,
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("rebuild-pending");
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        queuedDescriptor: phaseParameterChangedDescriptor,
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("queued-descriptor");
  });

  it("keeps sampled phase-current time out of modal-basis cache identity", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const phaseSlots = new Float32Array([0.1, 0.6, 0.8, 0.9]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const timeAdvancedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0.5,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const timeAdvancedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0.5,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(timeAdvancedSample.field).not.toBeCloseTo(initialSample.field, 6);
    expect(timeAdvancedDescriptor.liveModalPhaseHash).not.toBe(
      initialDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        timeAdvancedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps basis-cache drawable authority on clock-only phase advance", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const phaseSlots = new Float32Array([0.1, 0.6, 0.8, 0.9]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const timeAdvancedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0.5,
    });

    modalBasisCache.ready = true;
    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(timeAdvancedDescriptor.liveModalPhaseHash).not.toBe(
      initialDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.isRaymarchModalBasisCacheReadyForDescriptor(
        modalBasisCache,
        timeAdvancedDescriptor,
      ),
    ).toBe(true);
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        timeAdvancedDescriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
    });
  });

  it("ignores inactive phase metadata when resolving modal-basis freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const inactivePhaseSlots = new Float32Array([0.1, 0.6, 0.8, 0]);
    const changedInactivePhaseSlots = new Float32Array([2.4, -1.7, 0.1, 0]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: inactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 0,
      phaseAuthority: 0,
      time: 0,
    });
    const changedInactiveDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: changedInactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 0,
      phaseAuthority: 0,
      time: 0.5,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: inactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const changedInactiveSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: changedInactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0.5,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(changedInactiveSample.field).toBeCloseTo(initialSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        changedInactiveDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("uses sampled phase-current coefficients for live-synthesis diagnostics", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialPhaseSlots = new Float32Array([0.1, 0.6, 0.8, 0.9]);
    const sameCurrentPhaseSlots = new Float32Array([0.35, 0.1, 0.8, 0.9]);
    const time = 0.5;
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time,
    });
    const sameCurrentPhaseDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: sameCurrentPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time,
      resolution: 8,
    });
    const sameCurrentPhaseSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: sameCurrentPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(sameCurrentPhaseSample.field).toBeCloseTo(initialSample.field, 6);
    expect(sameCurrentPhaseDescriptor.liveModalPhaseHash).toBe(
      initialDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        sameCurrentPhaseDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps phase freshness attached to modal tuples across upload order", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const phaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);
    const reorderedSlots = new Float32Array([2, 2, 4, 0.4, 1, 2, 3, 0.6]);
    const reorderedPhaseSlots = new Float32Array([
      Math.PI,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ]);
    const reassignedPhaseSlots = new Float32Array([
      Math.PI,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ]);
    const sampleOptions = {
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    };
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });
    const reassignedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: reassignedPhaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
    });
    const reorderedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: reorderedSlots,
      modalFieldPhaseSlots: reorderedPhaseSlots,
    });
    const reassignedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: slots,
      modalFieldPhaseSlots: reassignedPhaseSlots,
    });

    modalBasisCache.activeDescriptor = descriptor;
    const stableSlotByModeKey = new Map([
      ["1:2:3", 0],
      ["2:2:4", 1],
    ]);
    const stableReorderedSlots = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: reorderedSlots,
      modalFieldPhaseSlots: reorderedPhaseSlots,
      activeModalFieldModeCount: 2,
      stableSlotByModeKey,
    }).slotViews;
    const stableReorderedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: stableReorderedSlots.modalFieldSlots,
      modalFieldPhaseSlots: stableReorderedSlots.modalFieldPhaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });

    expect(reorderedSample.field).toBeCloseTo(sample.field, 6);
    expect(reorderedSample.gradX).toBeCloseTo(sample.gradX, 6);
    expect(reorderedSample.gradY).toBeCloseTo(sample.gradY, 6);
    expect(reorderedSample.gradZ).toBeCloseTo(sample.gradZ, 6);
    expect(stableReorderedDescriptor.liveModalPhaseHash).toBe(
      descriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        stableReorderedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(reassignedSample.field).not.toBeCloseTo(sample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        reassignedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("canonicalizes duplicate modal tuples before resolving phase freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const compactSlots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const compactPhaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);
    const splitSlots = new Float32Array([
      1, 2, 3, 0.35, 1, 2, 3, 0.25, 2, 2, 4, 0.4,
    ]);
    const splitEquivalentPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const splitChangedPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    };
    const compactCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      activeModalFieldModeCount: 2,
    });
    const splitEquivalentCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitEquivalentPhaseSlots,
      activeModalFieldModeCount: 3,
      stableSlotByModeKey: new Map([
        ["1:2:3", 0],
        ["2:2:4", 1],
      ]),
    });
    const compactDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: compactCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots: compactCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: compactCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
      resolution: 8,
    });
    const splitEquivalentDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: splitEquivalentCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots:
        splitEquivalentCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: splitEquivalentCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
      resolution: 8,
    });
    const splitChangedCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      activeModalFieldModeCount: 3,
      stableSlotByModeKey: new Map([
        ["1:2:3", 0],
        ["2:2:4", 1],
      ]),
    });
    const splitChangedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: splitChangedCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots:
        splitChangedCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: splitChangedCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
      resolution: 8,
    });
    const compactSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 2,
    });
    const splitEquivalentSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitEquivalentPhaseSlots,
      modalFieldCount: 3,
    });
    const splitChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      modalFieldCount: 3,
    });

    modalBasisCache.activeDescriptor = compactDescriptor;

    expect(splitEquivalentSample.field).toBeCloseTo(compactSample.field, 6);
    expect(splitEquivalentSample.gradX).toBeCloseTo(compactSample.gradX, 6);
    expect(splitEquivalentSample.gradY).toBeCloseTo(compactSample.gradY, 6);
    expect(splitEquivalentSample.gradZ).toBeCloseTo(compactSample.gradZ, 6);
    expect(splitEquivalentDescriptor.liveModalPhaseHash).toBe(
      compactDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitEquivalentDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(splitChangedSample.field).not.toBeCloseTo(compactSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("hashes aggregate phase-current coefficients for duplicate modal tuples", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const compactSlots = new Float32Array([1, 2, 3, 0.6]);
    const compactPhaseSlots = new Float32Array([Math.PI / 2, 0, 1, 1]);
    const splitSlots = new Float32Array([1, 2, 3, 0.3, 1, 2, 3, 0.3]);
    const splitAggregateEquivalentPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const splitChangedPhaseSlots = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    };
    const compactCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      activeModalFieldModeCount: 1,
    });
    const splitAggregateEquivalentCanonical = buildCanonicalFullModalDescriptor(
      {
        maxTotalModes: 2,
        modalFieldSlots: splitSlots,
        modalFieldPhaseSlots: splitAggregateEquivalentPhaseSlots,
        activeModalFieldModeCount: 2,
        stableSlotByModeKey: new Map([["1:2:3", 0]]),
      },
    );
    const compactDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: compactCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots: compactCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: compactCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
      resolution: 8,
    });
    const splitAggregateEquivalentDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots:
          splitAggregateEquivalentCanonical.slotViews.modalFieldSlots,
        modalFieldPhaseSlots:
          splitAggregateEquivalentCanonical.slotViews.modalFieldPhaseSlots,
        modalFieldCount:
          splitAggregateEquivalentCanonical.counts.modalFieldModeCount,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 1,
        time: 0,
        resolution: 8,
      });
    const splitChangedCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      activeModalFieldModeCount: 2,
      stableSlotByModeKey: new Map([["1:2:3", 0]]),
    });
    const splitChangedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: splitChangedCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots:
        splitChangedCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: splitChangedCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
      resolution: 8,
    });
    const compactSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 1,
    });
    const splitAggregateEquivalentSample =
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        modalFieldSlots: splitSlots,
        modalFieldPhaseSlots: splitAggregateEquivalentPhaseSlots,
        modalFieldCount: 2,
      });
    const splitChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      modalFieldCount: 2,
    });

    modalBasisCache.activeDescriptor = compactDescriptor;

    expect(splitAggregateEquivalentSample.field).toBeCloseTo(
      compactSample.field,
      6,
    );
    expect(splitAggregateEquivalentSample.gradX).toBeCloseTo(
      compactSample.gradX,
      6,
    );
    expect(splitAggregateEquivalentSample.gradY).toBeCloseTo(
      compactSample.gradY,
      6,
    );
    expect(splitAggregateEquivalentSample.gradZ).toBeCloseTo(
      compactSample.gradZ,
      6,
    );
    expect(splitAggregateEquivalentDescriptor.identityPageAssignmentHash).toBe(
      compactDescriptor.identityPageAssignmentHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitAggregateEquivalentDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(splitChangedSample.field).not.toBeCloseTo(compactSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("ignores zero-amplitude modal slots when resolving phase freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9, 2, 2, 2, 0]);
    const initialPhaseSlots = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]);
    const zeroAmplitudePhaseChangedSlots = new Float32Array([
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const contributingPhaseChangedSlots = new Float32Array([
      Math.PI,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ]);
    const sampleOptions = {
      modalFieldSlots: slots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    };
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });
    const zeroAmplitudePhaseChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: zeroAmplitudePhaseChangedSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 2,
        phaseAuthority: 1,
        time: 0,
      });
    const contributingPhaseChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: contributingPhaseChangedSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 2,
        phaseAuthority: 1,
        time: 0,
      });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: initialPhaseSlots,
    });
    const zeroAmplitudePhaseChangedSample =
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        modalFieldPhaseSlots: zeroAmplitudePhaseChangedSlots,
      });
    const contributingPhaseChangedSample =
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        modalFieldPhaseSlots: contributingPhaseChangedSlots,
      });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(zeroAmplitudePhaseChangedSample.field).toBeCloseTo(
      initialSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        zeroAmplitudePhaseChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(contributingPhaseChangedSample.field).not.toBeCloseTo(
      initialSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        contributingPhaseChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps live-synthesis phase diagnostics at finite coefficient precision", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialPhaseSlots = new Float32Array([1, 0, 1, 1]);
    const subBucketPhaseSlots = new Float32Array([1.002, 0, 1, 1]);
    const visiblePhaseSlots = new Float32Array([1.02, 0, 1, 1]);
    const sampleOptions = {
      modalFieldSlots: slots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    };
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
    });
    const subBucketDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: subBucketPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
    });
    const visibleDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: visiblePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: initialPhaseSlots,
    });
    const subBucketSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: subBucketPhaseSlots,
    });
    const visibleSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: visiblePhaseSlots,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(Math.abs(subBucketSample.field - initialSample.field)).toBeLessThan(
      0.005,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        subBucketDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(Math.abs(visibleSample.field - initialSample.field)).toBeGreaterThan(
      0.01,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        visibleDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("weights live-synthesis phase diagnostics by normalized modal contribution", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const initialPhaseSlots = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1]);
    const flippedPhaseSlots = new Float32Array([0, 0, 0, 0, Math.PI, 0, 1, 1]);
    const buildSlots = (secondaryAmplitude) =>
      new Float32Array([1, 1, 1, 1, 2, 2, 2, secondaryAmplitude]);
    const buildDescriptor = ({ slots, phaseSlots }) =>
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: phaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 1,
        time: 0,
        resolution: 8,
      });
    const sample = ({ slots, phaseSlots }) =>
      evaluateRaymarchLiveSynthesisFieldPoint({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: phaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        x: 0,
        y: 0,
        z: 0,
        time: 0,
        resolution: 8,
      });

    const quietSlots = buildSlots(0.001);
    const quietInitialDescriptor = buildDescriptor({
      slots: quietSlots,
      phaseSlots: initialPhaseSlots,
    });
    const quietFlippedDescriptor = buildDescriptor({
      slots: quietSlots,
      phaseSlots: flippedPhaseSlots,
    });
    const quietInitialSample = sample({
      slots: quietSlots,
      phaseSlots: initialPhaseSlots,
    });
    const quietFlippedSample = sample({
      slots: quietSlots,
      phaseSlots: flippedPhaseSlots,
    });

    modalBasisCache.activeDescriptor = quietInitialDescriptor;

    expect(
      Math.abs(quietFlippedSample.field - quietInitialSample.field),
    ).toBeLessThan(0.005);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        quietFlippedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });

    const visibleSlots = buildSlots(0.03);
    const visibleInitialDescriptor = buildDescriptor({
      slots: visibleSlots,
      phaseSlots: initialPhaseSlots,
    });
    const visibleFlippedDescriptor = buildDescriptor({
      slots: visibleSlots,
      phaseSlots: flippedPhaseSlots,
    });
    const visibleInitialSample = sample({
      slots: visibleSlots,
      phaseSlots: initialPhaseSlots,
    });
    const visibleFlippedSample = sample({
      slots: visibleSlots,
      phaseSlots: flippedPhaseSlots,
    });

    modalBasisCache.activeDescriptor = visibleInitialDescriptor;

    expect(
      Math.abs(visibleFlippedSample.field - visibleInitialSample.field),
    ).toBeGreaterThan(0.01);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        visibleFlippedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("does not rebuild for sine-equivalent phase carriers", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const positivePhaseSlots = new Float32Array([0.4, 0, 0.8, 0.9]);
    const negativePhaseSlots = new Float32Array([-0.4, 0, 0.8, 0.9]);
    const positiveDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: positivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const negativeDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: negativePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const positiveSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: positivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const negativeSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: negativePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = positiveDescriptor;

    expect(negativeSample.field).toBeCloseTo(positiveSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        negativeDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps phase mode count diagnostic-only for cache freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const phaseSlots = new Float32Array([0.25, 0, 0.8, 0.9]);
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const diagnosticCountDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.72,
      time: 0,
    });
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const diagnosticCountSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = descriptor;

    expect(diagnosticCountSample.field).toBeCloseTo(sample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        diagnosticCountDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("does not rebuild basis caches for relative coefficient envelope changes", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const firstSlots = new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]);
    const changedSlots = new Float32Array([1, 2, 3, 0.94, 2, 2, 4, 0.2]);
    const phaseSlots = new Float32Array([
      0.1, 0.2, 0.5, 0.6, 0.3, 0.1, 0.4, 0.5,
    ]);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const changed = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const firstSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 8,
    });
    const changedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = first;
    const rebuild = raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
      modalBasisCache,
      changed,
    );

    expect(changedSample.field).not.toBe(firstSample.field);
    expect(first).toHaveProperty("modalBasisCacheTopologyHash");
    expect(first.modalBasisCacheTopologyHash).toBe(
      changed.modalBasisCacheTopologyHash,
    );
    expect(first.modalBasisCacheSupportDiagnosticHash).not.toBe(
      changed.modalBasisCacheSupportDiagnosticHash,
    );
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("does not rebuild basis caches for coefficient redistribution", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const firstSlots = new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]);
    const changedSlots = new Float32Array([1, 2, 3, 0.3, 2, 2, 4, 0.8]);
    const phaseSlots = new Float32Array([
      0.1, 0.2, 0.5, 0.6, 0.3, 0.1, 0.4, 0.5,
    ]);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const changed = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const firstSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 8,
    });
    const changedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = first;
    const rebuild = raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
      modalBasisCache,
      changed,
    );

    expect(changedSample.field).not.toBeCloseTo(firstSample.field, 6);
    expect(first.modalBasisCacheTopologyHash).toBe(
      changed.modalBasisCacheTopologyHash,
    );
    expect(first.modalBasisCacheSupportDiagnosticHash).not.toBe(
      changed.modalBasisCacheSupportDiagnosticHash,
    );
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("does not rebuild modal-basis caches for aggregate phase authority changes", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.5]);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.2,
    });
    const second = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.8,
    });

    modalBasisCache.activeDescriptor = first;
    const rebuild = raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
      modalBasisCache,
      second,
    );

    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
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

  it("coalesces field rebuild requests to the newest pending descriptor", async () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const baseSlots = new Float32Array([1, 2, 3, 0.5]);
    const descriptor0 = buildRaymarchFieldCacheDescriptor({
      backboneSlots: baseSlots,
      detailSlots: new Float32Array(4),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
    });
    const descriptor1 = { ...descriptor0, radius: 3.1 };
    const descriptor2 = { ...descriptor0, radius: 3.2 };
    const descriptor3 = { ...descriptor0, radius: 3.3 };
    let resolveFirst;
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    };
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(4) } },
      modalFieldCapacity: 1,
      uniforms: {
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    fieldCache.computeNodesByKey[getTestComputeNodeKey(1)] = { id: "field" };

    const first = enqueueRaymarchFieldCacheRebuild(
      fieldCache,
      renderer,
      descriptor0,
      "initial",
      options,
    );
    enqueueRaymarchFieldCacheRebuild(
      fieldCache,
      renderer,
      descriptor1,
      "radius",
      options,
    );
    enqueueRaymarchFieldCacheRebuild(
      fieldCache,
      renderer,
      descriptor2,
      "radius",
      options,
    );
    const pending = enqueueRaymarchFieldCacheRebuild(
      fieldCache,
      renderer,
      descriptor3,
      "radius",
      options,
    );

    expect(first.enqueued).toBe(true);
    expect(pending.enqueued).toBe(false);
    expect(pending.reason).toBe("pending");
    expect(fieldCache.pendingDescriptor).toEqual(descriptor0);
    expect(fieldCache.queuedDescriptor).toEqual(descriptor3);
    expect(fieldCache.queuedRebuildReason).toBe("radius");

    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fieldCache.activeDescriptor).toEqual(descriptor0);
    expect(fieldCache.pendingDescriptor).toEqual(descriptor3);
    expect(fieldCache.queuedDescriptor).toBeNull();
    expect(fieldCache.rebuildPending).toBe(true);
    expect(computeCalls).toBe(2);
  });

  it("coalesces Spectral Light rebuild requests to the newest pending descriptor", async () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const baseSlots = new Float32Array([1, 2, 3, 0.5]);
    const baseColors = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const descriptor0 = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: baseSlots,
      detailSlots: new Float32Array(4),
      backboneColorSlots: baseColors,
      detailColorSlots: new Float32Array(4),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
    });
    const descriptor1 = { ...descriptor0, modalFieldColorHash: 1 };
    const descriptor2 = { ...descriptor0, modalFieldColorHash: 2 };
    const descriptor3 = { ...descriptor0, modalFieldColorHash: 3 };
    let resolveFirst;
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    };
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(4) } },
      modalFieldColorBuffer: { value: { array: new Float32Array(4) } },
      modalFieldCapacity: 1,
      uniforms: {
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    spectralLightCache.computeNodesByKey[getTestComputeNodeKey(1)] = {
      id: "spectral",
    };

    const first = enqueueRaymarchSpectralLightCacheRebuild(
      spectralLightCache,
      renderer,
      descriptor0,
      "initial",
      options,
    );
    enqueueRaymarchSpectralLightCacheRebuild(
      spectralLightCache,
      renderer,
      descriptor1,
      "color-slots",
      options,
    );
    enqueueRaymarchSpectralLightCacheRebuild(
      spectralLightCache,
      renderer,
      descriptor2,
      "color-slots",
      options,
    );
    const pending = enqueueRaymarchSpectralLightCacheRebuild(
      spectralLightCache,
      renderer,
      descriptor3,
      "color-slots",
      options,
    );

    expect(first.enqueued).toBe(true);
    expect(pending.enqueued).toBe(false);
    expect(pending.reason).toBe("pending");
    expect(spectralLightCache.pendingDescriptor).toEqual(descriptor0);
    expect(spectralLightCache.queuedDescriptor).toEqual(descriptor3);
    expect(spectralLightCache.queuedRebuildReason).toBe("color-slots");

    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(spectralLightCache.activeDescriptor).toEqual(descriptor0);
    expect(spectralLightCache.pendingDescriptor).toEqual(descriptor3);
    expect(spectralLightCache.queuedDescriptor).toBeNull();
    expect(spectralLightCache.rebuildPending).toBe(true);
    expect(computeCalls).toBe(2);
  });

  it("submits modal-basis compute before live uniforms can advance", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(4) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(4) } },
      modalFieldCapacity: 1,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    const observedTimes = [];
    const renderer = {
      computeAsync: async () => {
        observedTimes.push(options.uniforms.uTime.value);
      },
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(1)] = {
      id: "effective",
    };

    const result = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor,
      "modal-identity",
      options,
    );
    options.uniforms.uTime.value = 2;

    expect(result.enqueued).toBe(true);
    expect(observedTimes).toEqual([1]);

    await flushCacheMicrotasks();

    expect(modalBasisCache.activeDescriptor).toEqual(descriptor);
    expect(modalBasisCache.activePhaseSampleTimeSec).toBe(1);
  });

  it("submits semantic topology rebuilds immediately during rebuild bursts", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const activeDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 2, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.1, 0.6, 0.7,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.42,
    });
    const changedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 3, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.1, 0.6, 0.7,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.42,
    });
    const newestDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 4, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.1, 0.6, 0.7,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.42,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
      modalFieldCapacity: 2,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 2 },
      },
      schedulerTimeSec: 10.05,
    };
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
      },
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(2)] = {
      id: "effective",
    };
    modalBasisCache.ready = true;
    modalBasisCache.activeDescriptor = activeDescriptor;
    modalBasisCache.lastRebuildSubmittedAtSec = 10;

    const burst = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      changedDescriptor,
      "modal-identity",
      options,
    );
    expect(burst.enqueued).toBe(true);
    expect(computeCalls).toBe(1);
    await flushCacheMicrotasks();

    const secondSubmission = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      newestDescriptor,
      "modal-identity",
      {
        ...options,
        schedulerTimeSec: 10.06,
      },
    );
    const authority =
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        newestDescriptor,
      );

    expect(secondSubmission.enqueued).toBe(true);
    expect(secondSubmission.reason).toBe("modal-identity");
    expect(computeCalls).toBe(2);
    expect(modalBasisCache.rebuildPending).toBe(true);
    expect(modalBasisCache.queuedDescriptor).toBeNull();
    expect(authority).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-stale",
      staleReason: "modal-identity",
    });

    const submitted = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      newestDescriptor,
      "modal-identity",
      {
        ...options,
        schedulerTimeSec: 10.16,
      },
    );

    expect(submitted.enqueued).toBe(false);
    expect(submitted.reason).toBe("pending");
    expect(modalBasisCache.queuedDescriptor).toBeNull();
    expect(modalBasisCache.rebuildPending).toBe(true);
    expect(computeCalls).toBe(2);
  });

  it("mirrors active modal-basis mode count from contributing modal terms", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]),
      modalFieldPhaseSlots: new Float32Array(8),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 0,
      phaseAuthority: 0,
      resolution: 8,
    });
    const renderer = {
      computeAsync: async () => {},
    };
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
      modalFieldCapacity: 2,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 2 },
      },
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(2)] = {
      id: "effective",
    };

    const result = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor,
      "initial",
      options,
    );

    expect(descriptor.phaseModeCount).toBe(0);
    expect(descriptor.contributingBasisPageModeCount).toBe(2);
    expect(result.enqueued).toBe(true);

    await flushCacheMicrotasks();

    expect(modalBasisCache.activeDescriptor).toEqual(descriptor);
    expect(modalBasisCache.activeBasisPageModeCount).toBe(2);
  });

  it("freezes modal-basis compute inputs at rebuild submission", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const modeArray = new Float32Array([1, 2, 3, 0.5]);
    const phaseArray = new Float32Array([0.1, 0.2, 0.6, 0.7]);
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: modeArray,
      modalFieldPhaseSlots: phaseArray,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: modeArray } },
      modalFieldPhaseBuffer: { value: { array: phaseArray } },
      modalFieldCapacity: 1,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    let resolveCompute;
    const renderer = {
      computeAsync: async () =>
        new Promise((resolve) => {
          resolveCompute = resolve;
        }),
    };
    const computeNodeKey = getTestComputeNodeKey(1);
    modalBasisCache.computeNodesByKey[computeNodeKey] = {
      id: "effective",
    };

    const result = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor,
      "initial",
      options,
    );
    modeArray.set([9, 9, 9, 0.05]);
    phaseArray.set([Math.PI, 4, 0.1, 0.2]);
    options.uniforms.uTime.value = 2;
    options.uniforms.uRadius.value = 4;
    options.uniforms.uModalFieldModeCount.value = 0;

    const inputSnapshot = modalBasisCache.computeInputsByKey?.[computeNodeKey];
    expect(result.enqueued).toBe(true);
    expect(inputSnapshot).toBeTruthy();
    expect(
      Array.from(inputSnapshot.modalFieldModeBuffer.value.array.slice(0, 4)),
    ).toEqual([1, 2, 3, 0.5]);
    expect(inputSnapshot.modalFieldPhaseBuffer).toBeNull();
    expect(inputSnapshot.uniforms.uTime.value).toBe(1);
    expect(inputSnapshot.uniforms.uRadius.value).toBe(3);
    expect(inputSnapshot.uniforms.uModalFieldModeCount.value).toBe(1);

    resolveCompute();
    await flushCacheMicrotasks();

    expect(modalBasisCache.activeDescriptor).toEqual(descriptor);
  });

  it("freezes queued modal-basis compute inputs when queued behind a pending rebuild", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.25]),
      modalFieldPhaseSlots: new Float32Array([0.05, 0.1, 0.2, 0.3]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.4,
      basisCapacity: 1,
    });
    const queuedModeArray = new Float32Array([4, 5, 6, 0.7]);
    const queuedPhaseArray = new Float32Array([0.2, 0.3, 0.8, 0.9]);
    const queuedUniforms = {
      uTime: { value: 4 },
      uRadius: { value: 5 },
      uModalFieldModeCount: { value: 1 },
    };
    const queuedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: queuedModeArray,
      modalFieldPhaseSlots: queuedPhaseArray,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 5,
      time: 4,
      phaseModeCount: 1,
      phaseAuthority: 0.6,
      basisCapacity: 1,
    });
    const computeNodeKey = getTestComputeNodeKey(1);
    modalBasisCache.computeNodesByKey[computeNodeKey] = {
      id: "effective",
    };

    let resolveInitialCompute;
    const dispatchedNodes = [];
    const renderer = {
      computeAsync: async (node) => {
        dispatchedNodes.push(node);
        if (dispatchedNodes.length === 1) {
          return new Promise((resolve) => {
            resolveInitialCompute = resolve;
          });
        }
      },
    };

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      initialDescriptor,
      "initial",
      {
        modalFieldModeBuffer: {
          value: { array: new Float32Array([1, 2, 3, 0.25]) },
        },
        modalFieldPhaseBuffer: {
          value: { array: new Float32Array([0.05, 0.1, 0.2, 0.3]) },
        },
        modalFieldCapacity: 1,
        uniforms: {
          uTime: { value: 1 },
          uRadius: { value: 3 },
          uModalFieldModeCount: { value: 1 },
        },
      },
    );

    const queuedResult = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      queuedDescriptor,
      "modal-identity",
      {
        modalFieldModeBuffer: { value: { array: queuedModeArray } },
        modalFieldPhaseBuffer: { value: { array: queuedPhaseArray } },
        modalFieldCapacity: 1,
        uniforms: queuedUniforms,
      },
    );
    queuedModeArray.set([9, 9, 9, 0.05]);
    queuedPhaseArray.set([Math.PI, 4, 0.1, 0.2]);
    queuedUniforms.uTime.value = 8;
    queuedUniforms.uRadius.value = 2;
    queuedUniforms.uModalFieldModeCount.value = 0;

    expect(queuedResult.enqueued).toBe(false);
    expect(queuedResult.reason).toBe("pending");
    expect(modalBasisCache.queuedDescriptor).toEqual(queuedDescriptor);
    expect(modalBasisCache.queuedDescriptorAtSec).toBe(4);

    resolveInitialCompute();
    await flushCacheMicrotasks();

    const inputSnapshot = modalBasisCache.computeInputsByKey?.[computeNodeKey];
    expect(dispatchedNodes).toHaveLength(2);
    expect(modalBasisCache.activeDescriptor).toEqual(queuedDescriptor);
    const modeSnapshot = Array.from(
      inputSnapshot.modalFieldModeBuffer.value.array.slice(0, 4),
    );
    expect(modeSnapshot[0]).toBe(4);
    expect(modeSnapshot[1]).toBe(5);
    expect(modeSnapshot[2]).toBe(6);
    expect(modeSnapshot[3]).toBeCloseTo(0.7, 6);
    expect(inputSnapshot.modalFieldPhaseBuffer).toBeNull();
    expect(inputSnapshot.uniforms.uTime.value).toBe(4);
    expect(inputSnapshot.uniforms.uRadius.value).toBe(5);
    expect(inputSnapshot.uniforms.uModalFieldModeCount.value).toBe(1);
  });

  it("uses basis capacity as modal-basis compute-kernel identity", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor1 = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const descriptor2 = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 2, 3, 4, 0.35]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.2, 0.7, 0.8,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.49,
      basisCapacity: 2,
    });
    const dispatchedNodeIds = [];
    const renderer = {
      computeAsync: async (node) => {
        dispatchedNodeIds.push(node?.id ?? "unknown");
      },
    };

    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(1)] = {
      id: "effective-capacity-1",
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(2)] = {
      id: "effective-capacity-2",
    };

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor1,
      "initial",
      {
        modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
        modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
        modalFieldCapacity: 1,
        uniforms: {
          uTime: { value: 1 },
          uRadius: { value: 3 },
          uModalFieldModeCount: { value: 1 },
        },
      },
    );
    await flushCacheMicrotasks();

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor2,
      "modal-identity",
      {
        modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
        modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
        modalFieldCapacity: 2,
        uniforms: {
          uTime: { value: 1 },
          uRadius: { value: 3 },
          uModalFieldModeCount: { value: 2 },
        },
      },
    );
    await flushCacheMicrotasks();

    expect(dispatchedNodeIds).toEqual([
      "effective-capacity-1",
      "effective-capacity-2",
    ]);
    expect(modalBasisCache.activeDescriptor).toEqual(descriptor2);
    expect(Object.keys(modalBasisCache.computeNodesByKey)).toContain(
      getTestComputeNodeKey(1),
    );
    expect(Object.keys(modalBasisCache.computeNodesByKey)).toContain(
      getTestComputeNodeKey(2),
    );
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

  it("builds descriptors from topology and relative coefficient support", () => {
    const descriptorA = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const globalScaleDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.45, 2, 2, 4, 0.1]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const relativeSupportDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.94, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const relativeEnvelopeDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.25]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(globalScaleDescriptor.modalFieldHash).toBe(
      descriptorA.modalFieldHash,
    );
    expect(relativeSupportDescriptor.modalFieldHash).not.toBe(
      descriptorA.modalFieldHash,
    );
    expect(relativeEnvelopeDescriptor.modalFieldHash).not.toBe(
      descriptorA.modalFieldHash,
    );
  });

  it("ignores zero-amplitude modal topology when resolving field freshness", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const slots = new Float32Array([1, 2, 3, 0.9, 2, 2, 2, 0]);
    const zeroAmplitudeTopologyChangedSlots = new Float32Array([
      1, 2, 3, 0.9, 4, 5, 6, 0,
    ]);
    const contributingTopologyChangedSlots = new Float32Array([
      4, 5, 6, 0.9, 2, 2, 2, 0,
    ]);
    const sampleOptions = {
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const descriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const zeroAmplitudeTopologyChangedDescriptor =
      buildRaymarchFieldCacheDescriptor({
        modalFieldSlots: zeroAmplitudeTopologyChangedSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
      });
    const contributingTopologyChangedDescriptor =
      buildRaymarchFieldCacheDescriptor({
        modalFieldSlots: contributingTopologyChangedSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
      });
    const sample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: slots,
    });
    const zeroAmplitudeTopologyChangedSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: zeroAmplitudeTopologyChangedSlots,
    });
    const contributingTopologyChangedSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: contributingTopologyChangedSlots,
    });

    fieldCache.activeDescriptor = descriptor;

    expect(zeroAmplitudeTopologyChangedSample.field).toBeCloseTo(
      sample.field,
      6,
    );
    expect(
      shouldRebuildRaymarchFieldCache(
        fieldCache,
        zeroAmplitudeTopologyChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(contributingTopologyChangedSample.field).not.toBeCloseTo(
      sample.field,
      6,
    );
    expect(
      shouldRebuildRaymarchFieldCache(
        fieldCache,
        contributingTopologyChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("canonicalizes trailing zero-amplitude slots out of modal count freshness", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const baseSlots = new Float32Array([1, 2, 3, 0.9]);
    const trailingZeroSlots = new Float32Array([1, 2, 3, 0.9, 4, 5, 6, 0]);
    const trailingPositiveSlots = new Float32Array([
      1, 2, 3, 0.9, 4, 5, 6, 0.2,
    ]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const baseDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: baseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const trailingZeroDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: trailingZeroSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const trailingPositiveDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: trailingPositiveSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const baseSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: baseSlots,
      modalFieldCount: 1,
    });
    const trailingZeroSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: trailingZeroSlots,
      modalFieldCount: 2,
    });
    const trailingPositiveSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: trailingPositiveSlots,
      modalFieldCount: 2,
    });

    fieldCache.activeDescriptor = baseDescriptor;

    expect(trailingZeroSample.field).toBeCloseTo(baseSample.field, 6);
    expect(trailingZeroDescriptor.modalFieldCount).toBe(1);
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, trailingZeroDescriptor),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(trailingPositiveSample.field).not.toBeCloseTo(baseSample.field, 6);
    expect(trailingPositiveDescriptor.modalFieldCount).toBe(2);
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, trailingPositiveDescriptor),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("canonicalizes interior zero-amplitude modal gaps out of field freshness", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const compactSlots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const sparseSlots = new Float32Array([
      1, 2, 3, 0.6, 9, 9, 9, 0, 2, 2, 4, 0.4,
    ]);
    const positiveGapSlots = new Float32Array([
      1, 2, 3, 0.6, 9, 9, 9, 0.2, 2, 2, 4, 0.4,
    ]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const compactDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: compactSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const sparseDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: sparseSlots,
      modalFieldCount: 3,
      boundaryMode: "neumann",
      radius: 3,
    });
    const positiveGapDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: positiveGapSlots,
      modalFieldCount: 3,
      boundaryMode: "neumann",
      radius: 3,
    });
    const compactSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldCount: 2,
    });
    const sparseSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: sparseSlots,
      modalFieldCount: 3,
    });
    const positiveGapSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: positiveGapSlots,
      modalFieldCount: 3,
    });

    fieldCache.activeDescriptor = compactDescriptor;

    expect(sparseSample.field).toBeCloseTo(compactSample.field, 6);
    expect(sparseSample.gradX).toBeCloseTo(compactSample.gradX, 6);
    expect(sparseSample.gradY).toBeCloseTo(compactSample.gradY, 6);
    expect(sparseSample.gradZ).toBeCloseTo(compactSample.gradZ, 6);
    expect(sparseDescriptor.modalFieldCount).toBe(2);
    expect(sparseDescriptor.modalFieldHash).toBe(
      compactDescriptor.modalFieldHash,
    );
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, sparseDescriptor),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(positiveGapSample.field).not.toBeCloseTo(compactSample.field, 6);
    expect(positiveGapDescriptor.modalFieldCount).toBe(3);
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, positiveGapDescriptor),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("builds unified modal field descriptors without role-layer hashes", () => {
    const descriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(descriptor.modalFieldCount).toBe(2);
    expect(descriptor.modalFieldHash).toBeTypeOf("number");
    expect(descriptor).not.toHaveProperty("backboneHash");
    expect(descriptor).not.toHaveProperty("detailHash");
    expect(descriptor).not.toHaveProperty("backboneCount");
    expect(descriptor).not.toHaveProperty("detailCount");
  });

  it("evaluates unified modal field points independent of role placement", () => {
    const unified = evaluateRaymarchFieldCachePoint({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 2, 2, 4, 0.5]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    });
    const legacySplit = evaluateRaymarchFieldCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.5, 2, 2, 4, 0.5]),
      detailSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    });

    expect(unified.field).toBeCloseTo(legacySplit.field, 6);
    expect(unified.gradX).toBeCloseTo(legacySplit.gradX, 6);
    expect(unified.gradY).toBeCloseTo(legacySplit.gradY, 6);
    expect(unified.gradZ).toBeCloseTo(legacySplit.gradZ, 6);
  });

  it("keeps modal field freshness independent of contributing slot order", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const slots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const reorderedSlots = new Float32Array([2, 2, 4, 0.4, 1, 2, 3, 0.6]);
    const changedSlots = new Float32Array([1, 2, 3, 0.6, 4, 5, 6, 0.4]);
    const sampleOptions = {
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const descriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const reorderedDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: reorderedSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const changedDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const sample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: slots,
    });
    const reorderedSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: reorderedSlots,
    });
    const changedSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: changedSlots,
    });

    fieldCache.activeDescriptor = descriptor;

    expect(reorderedSample.field).toBeCloseTo(sample.field, 6);
    expect(reorderedSample.gradX).toBeCloseTo(sample.gradX, 6);
    expect(reorderedSample.gradY).toBeCloseTo(sample.gradY, 6);
    expect(reorderedSample.gradZ).toBeCloseTo(sample.gradZ, 6);
    expect(reorderedDescriptor.modalFieldHash).toBe(descriptor.modalFieldHash);
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, reorderedDescriptor),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(changedSample.field).not.toBeCloseTo(sample.field, 6);
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, changedDescriptor),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("canonicalizes duplicate modal tuples before resolving field freshness", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const compactSlots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const splitSlots = new Float32Array([
      1, 2, 3, 0.35, 1, 2, 3, 0.25, 2, 2, 4, 0.4,
    ]);
    const distinctSlots = new Float32Array([
      1, 2, 3, 0.35, 1, 3, 3, 0.25, 2, 2, 4, 0.4,
    ]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    };
    const compactDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: compactSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const splitDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: splitSlots,
      modalFieldCount: 3,
      boundaryMode: "neumann",
      radius: 3,
    });
    const distinctDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: distinctSlots,
      modalFieldCount: 3,
      boundaryMode: "neumann",
      radius: 3,
    });
    const compactSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldCount: 2,
    });
    const splitSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldCount: 3,
    });
    const distinctSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: distinctSlots,
      modalFieldCount: 3,
    });

    fieldCache.activeDescriptor = compactDescriptor;

    expect(splitSample.field).toBeCloseTo(compactSample.field, 6);
    expect(splitSample.gradX).toBeCloseTo(compactSample.gradX, 6);
    expect(splitSample.gradY).toBeCloseTo(compactSample.gradY, 6);
    expect(splitSample.gradZ).toBeCloseTo(compactSample.gradZ, 6);
    expect(splitDescriptor.modalFieldCount).toBe(2);
    expect(splitDescriptor.modalFieldHash).toBe(
      compactDescriptor.modalFieldHash,
    );
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, splitDescriptor),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(distinctSample.field).not.toBeCloseTo(compactSample.field, 6);
    expect(distinctDescriptor.modalFieldCount).toBe(3);
    expect(
      shouldRebuildRaymarchFieldCache(fieldCache, distinctDescriptor),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("does not rebuild when only the global modal amplitude scale changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const first = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.45, 2, 2, 4, 0.1]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    fieldCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchFieldCache(fieldCache, second);

    expect(second).toEqual(first);
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("rebuilds when relative modal coefficient envelopes change", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const firstSlots = new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]);
    const changedSlots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.2]);
    const first = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: firstSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const firstSample = evaluateRaymarchFieldCachePoint({
      modalFieldSlots: firstSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });
    const changedSample = evaluateRaymarchFieldCachePoint({
      modalFieldSlots: changedSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });
    fieldCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchFieldCache(fieldCache, second);

    expect(changedSample.field).not.toBeCloseTo(firstSample.field, 6);
    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("modal-identity");
  });

  it("rebuilds for visible relative modal coefficient changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const balancedSlots = new Float32Array([1, 1, 1, 0.5, 3, 2, 1, 0.5]);
    const shiftedSlots = new Float32Array([1, 1, 1, 0.55, 3, 2, 1, 0.45]);
    const sampleOptions = {
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.35,
      y: -0.2,
      z: 0.15,
    };
    const balancedDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: balancedSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const shiftedDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: shiftedSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const balancedSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: balancedSlots,
    });
    const shiftedSample = evaluateRaymarchFieldCachePoint({
      ...sampleOptions,
      modalFieldSlots: shiftedSlots,
    });

    fieldCache.activeDescriptor = balancedDescriptor;
    const rebuild = shouldRebuildRaymarchFieldCache(
      fieldCache,
      shiftedDescriptor,
    );

    expect(
      Math.abs(shiftedSample.field - balancedSample.field),
    ).toBeGreaterThan(0.01);
    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("modal-identity");
  });

  it("detects rebuilds when modal geometry changes", () => {
    const fieldCache = createRaymarchFieldCache({ resolution: 8 });
    const first = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 3, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    fieldCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchFieldCache(fieldCache, second);

    expect(rebuild.needsRebuild).toBe(true);
    expect(rebuild.reason).toBe("modal-identity");
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

  it("keeps Spectral Light freshness attached to modal tuples across upload order", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const colors = new Float32Array([1, 0.2, 0.1, 0.9, 0.2, 0.6, 1, 0.4]);
    const reorderedSlots = new Float32Array([2, 2, 4, 0.4, 1, 2, 3, 0.6]);
    const reorderedColors = new Float32Array([
      0.2, 0.6, 1, 0.4, 1, 0.2, 0.1, 0.9,
    ]);
    const reassignedColors = new Float32Array([
      0.2, 0.6, 1, 0.4, 1, 0.2, 0.1, 0.9,
    ]);
    const sampleOptions = {
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const descriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldColorSlots: colors,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const reorderedDescriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: reorderedSlots,
      modalFieldColorSlots: reorderedColors,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const reassignedDescriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldColorSlots: reassignedColors,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const sample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: slots,
      modalFieldColorSlots: colors,
    });
    const reorderedSample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: reorderedSlots,
      modalFieldColorSlots: reorderedColors,
    });
    const reassignedSample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: slots,
      modalFieldColorSlots: reassignedColors,
    });

    spectralLightCache.activeDescriptor = descriptor;

    expect(reorderedSample.colorWeight).toBeCloseTo(sample.colorWeight, 6);
    expect(reorderedSample.r).toBeCloseTo(sample.r, 6);
    expect(reorderedSample.g).toBeCloseTo(sample.g, 6);
    expect(reorderedSample.b).toBeCloseTo(sample.b, 6);
    expect(reorderedDescriptor.modalFieldColorHash).toBe(
      descriptor.modalFieldColorHash,
    );
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        reorderedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(reassignedSample.r).not.toBeCloseTo(sample.r, 6);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        reassignedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "color-slots" });
  });

  it("canonicalizes duplicate modal tuples before resolving Spectral Light freshness", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const compactSlots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const compactColors = new Float32Array([
      1, 0.2, 0.1, 0.9, 0.2, 0.6, 1, 0.4,
    ]);
    const splitSlots = new Float32Array([
      1, 2, 3, 0.35, 1, 2, 3, 0.25, 2, 2, 4, 0.4,
    ]);
    const splitEquivalentColors = new Float32Array([
      1, 0.2, 0.1, 0.9, 1, 0.2, 0.1, 0.9, 0.2, 0.6, 1, 0.4,
    ]);
    const splitChangedColors = new Float32Array([
      1, 0.2, 0.1, 0.9, 0.1, 0.7, 1, 0.9, 0.2, 0.6, 1, 0.4,
    ]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const compactDescriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: compactSlots,
      modalFieldColorSlots: compactColors,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const splitEquivalentDescriptor = buildRaymarchSpectralLightCacheDescriptor(
      {
        modalFieldSlots: splitSlots,
        modalFieldColorSlots: splitEquivalentColors,
        modalFieldCount: 3,
        boundaryMode: "neumann",
        radius: 3,
      },
    );
    const splitChangedDescriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: splitSlots,
      modalFieldColorSlots: splitChangedColors,
      modalFieldCount: 3,
      boundaryMode: "neumann",
      radius: 3,
    });
    const compactSample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldColorSlots: compactColors,
      modalFieldCount: 2,
    });
    const splitEquivalentSample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldColorSlots: splitEquivalentColors,
      modalFieldCount: 3,
    });
    const splitChangedSample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldColorSlots: splitChangedColors,
      modalFieldCount: 3,
    });

    spectralLightCache.activeDescriptor = compactDescriptor;

    expect(splitEquivalentSample.colorWeight).toBeCloseTo(
      compactSample.colorWeight,
      6,
    );
    expect(splitEquivalentSample.r).toBeCloseTo(compactSample.r, 6);
    expect(splitEquivalentSample.g).toBeCloseTo(compactSample.g, 6);
    expect(splitEquivalentSample.b).toBeCloseTo(compactSample.b, 6);
    expect(splitEquivalentDescriptor.modalFieldColorHash).toBe(
      compactDescriptor.modalFieldColorHash,
    );
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        splitEquivalentDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(splitChangedSample.r).not.toBeCloseTo(compactSample.r, 6);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        splitChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "color-slots" });
  });

  it("does not rebuild Spectral Light caches for small color coefficient jitter", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const first = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldColorSlots: new Float32Array([
        1, 0.2, 0.1, 0.9, 0.2, 0.6, 1, 0.4,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.13333334]),
      modalFieldColorSlots: new Float32Array([
        0.985, 0.201, 0.105, 0.895, 0.201, 0.599, 0.985, 0.401,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });

    spectralLightCache.activeDescriptor = first;
    const rebuild = shouldRebuildRaymarchSpectralLightCache(
      spectralLightCache,
      second,
    );

    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("ignores zero-amplitude modal colors when resolving Spectral Light freshness", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9, 2, 2, 2, 0]);
    const colors = new Float32Array([1, 0.2, 0.1, 0.9, 0.2, 0.6, 1, 0.4]);
    const zeroAmplitudeColorChanged = new Float32Array([
      1, 0.2, 0.1, 0.9, 0.95, 0.05, 0.4, 1,
    ]);
    const contributingColorChanged = new Float32Array([
      0.1, 0.7, 1, 0.9, 0.2, 0.6, 1, 0.4,
    ]);
    const sampleOptions = {
      modalFieldSlots: slots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const descriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldColorSlots: colors,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const zeroAmplitudeColorChangedDescriptor =
      buildRaymarchSpectralLightCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldColorSlots: zeroAmplitudeColorChanged,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
      });
    const contributingColorChangedDescriptor =
      buildRaymarchSpectralLightCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldColorSlots: contributingColorChanged,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
      });
    const sample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldColorSlots: colors,
    });
    const zeroAmplitudeColorChangedSample =
      evaluateRaymarchSpectralLightCachePoint({
        ...sampleOptions,
        modalFieldColorSlots: zeroAmplitudeColorChanged,
      });
    const contributingColorChangedSample =
      evaluateRaymarchSpectralLightCachePoint({
        ...sampleOptions,
        modalFieldColorSlots: contributingColorChanged,
      });

    spectralLightCache.activeDescriptor = descriptor;

    expect(zeroAmplitudeColorChangedSample.colorWeight).toBeCloseTo(
      sample.colorWeight,
      6,
    );
    expect(zeroAmplitudeColorChangedSample.r).toBeCloseTo(sample.r, 6);
    expect(zeroAmplitudeColorChangedSample.g).toBeCloseTo(sample.g, 6);
    expect(zeroAmplitudeColorChangedSample.b).toBeCloseTo(sample.b, 6);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        zeroAmplitudeColorChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(contributingColorChangedSample.r).not.toBeCloseTo(sample.r, 6);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        contributingColorChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "color-slots" });
  });

  it("ignores zero-weight Spectral Light chroma when resolving color freshness", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const inactiveColor = new Float32Array([1, 0.2, 0.1, 0]);
    const inactiveChromaChanged = new Float32Array([0.1, 0.7, 1, 0]);
    const activeColor = new Float32Array([0.1, 0.7, 1, 0.9]);
    const sampleOptions = {
      modalFieldSlots: slots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
    };
    const descriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldColorSlots: inactiveColor,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const inactiveChromaChangedDescriptor =
      buildRaymarchSpectralLightCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldColorSlots: inactiveChromaChanged,
        modalFieldCount: 1,
        boundaryMode: "neumann",
        radius: 3,
      });
    const activeColorDescriptor = buildRaymarchSpectralLightCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldColorSlots: activeColor,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const sample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldColorSlots: inactiveColor,
    });
    const inactiveChromaChangedSample = evaluateRaymarchSpectralLightCachePoint(
      {
        ...sampleOptions,
        modalFieldColorSlots: inactiveChromaChanged,
      },
    );
    const activeColorSample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldColorSlots: activeColor,
    });

    spectralLightCache.activeDescriptor = descriptor;

    expect(sample.colorWeight).toBe(0);
    expect(inactiveChromaChangedSample.colorWeight).toBe(0);
    expect(inactiveChromaChangedSample.r).toBe(sample.r);
    expect(inactiveChromaChangedSample.g).toBe(sample.g);
    expect(inactiveChromaChangedSample.b).toBe(sample.b);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        inactiveChromaChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(activeColorSample.colorWeight).toBeGreaterThan(0);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        activeColorDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "color-slots" });
  });

  it("keeps zero-weight Spectral Light modes out of cache freshness", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9, 4, 5, 6, 0.5]);
    const colors = new Float32Array([1, 0.2, 0.1, 0.9, 0.2, 0.6, 1, 0]);
    const inactiveTopologyChangedSlots = new Float32Array([
      1, 2, 3, 0.9, 7, 1, 2, 0.1,
    ]);
    const activeTopologyChangedSlots = new Float32Array([
      1, 3, 3, 0.9, 4, 5, 6, 0.5,
    ]);
    const sampleOptions = {
      modalFieldColorSlots: colors,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.31,
      y: -0.22,
      z: 0.17,
    };
    const descriptor = buildRaymarchSpectralLightCacheDescriptor({
      ...sampleOptions,
      modalFieldSlots: slots,
    });
    const inactiveTopologyChangedDescriptor =
      buildRaymarchSpectralLightCacheDescriptor({
        ...sampleOptions,
        modalFieldSlots: inactiveTopologyChangedSlots,
      });
    const activeTopologyChangedDescriptor =
      buildRaymarchSpectralLightCacheDescriptor({
        ...sampleOptions,
        modalFieldSlots: activeTopologyChangedSlots,
      });
    const sample = evaluateRaymarchSpectralLightCachePoint({
      ...sampleOptions,
      modalFieldSlots: slots,
    });
    const inactiveTopologyChangedSample =
      evaluateRaymarchSpectralLightCachePoint({
        ...sampleOptions,
        modalFieldSlots: inactiveTopologyChangedSlots,
      });

    spectralLightCache.activeDescriptor = descriptor;

    expect(inactiveTopologyChangedDescriptor.modalFieldHash).not.toBe(
      descriptor.modalFieldHash,
    );
    expect(inactiveTopologyChangedDescriptor.spectralLightModeHash).toBe(
      descriptor.spectralLightModeHash,
    );
    expect(inactiveTopologyChangedDescriptor.modalFieldColorHash).toBe(
      descriptor.modalFieldColorHash,
    );
    expect(inactiveTopologyChangedSample.colorWeight).toBeCloseTo(
      sample.colorWeight,
      6,
    );
    expect(inactiveTopologyChangedSample.r).toBeCloseTo(sample.r, 6);
    expect(inactiveTopologyChangedSample.g).toBeCloseTo(sample.g, 6);
    expect(inactiveTopologyChangedSample.b).toBeCloseTo(sample.b, 6);
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        inactiveTopologyChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      shouldRebuildRaymarchSpectralLightCache(
        spectralLightCache,
        activeTopologyChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("keeps Spectral Light descriptors unchanged when only phase advisory slots change", () => {
    const spectralLightCache = createRaymarchSpectralLightCache({
      resolution: 8,
    });
    const phaseA = new Float32Array([0.1, 0.2, 0.7, 0.5]);
    const phaseB = new Float32Array([1.4, -0.3, 0.8, 0.7]);
    const first = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backbonePhaseSlots: phaseA,
      detailPhaseSlots: phaseA,
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchSpectralLightCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([1, 0.2, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.6, 1, 0.4]),
      backbonePhaseSlots: phaseB,
      detailPhaseSlots: phaseB,
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

    expect(second).toEqual(first);
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
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
    expect(rebuild.reason).toBe("modal-identity");
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

  it("evaluates zero-phase live field as the static field", () => {
    expect(evaluateRaymarchLiveSynthesisFieldPoint).toBeTypeOf("function");
    const backboneSlots = new Float32Array([1, 2, 3, 0.9]);
    const detailSlots = new Float32Array([2, 2, 4, 0.2]);
    const staticSample = evaluateRaymarchFieldCachePoint({
      backboneSlots,
      detailSlots,
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });
    const effectiveSample = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots,
      detailSlots,
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array([Math.PI, 1, 1, 0]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
      time: 2,
    });

    expect(effectiveSample.field).toBeCloseTo(staticSample.field, 6);
    expect(effectiveSample.gradX).toBeCloseTo(staticSample.gradX, 6);
    expect(effectiveSample.gradY).toBeCloseTo(staticSample.gradY, 6);
    expect(effectiveSample.gradZ).toBeCloseTo(staticSample.gradZ, 6);
    expect(effectiveSample.modalBasisCachePhaseAuthority).toBe(0);
  });

  it("evaluates direct and effective normal convergence from the same normalized gradient representation", () => {
    expect(
      raymarchFieldCache.evaluateRaymarchNormalConvergencePoint,
    ).toBeTypeOf("function");

    const modalFieldSlots = new Float32Array([1, 1, 1, 1, 2, 1, 1, 0.35]);
    const common = {
      modalFieldSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.42,
      y: -0.31,
      z: 0.27,
      viewDirection: [0.25, -0.15, -1],
      sampleStep: (2 * 3) / 16,
    };
    const direct = raymarchFieldCache.evaluateRaymarchNormalConvergencePoint({
      ...common,
      evaluateFieldPoint: raymarchFieldCache.evaluateRaymarchFieldCachePoint,
    });
    const effective = raymarchFieldCache.evaluateRaymarchNormalConvergencePoint(
      {
        ...common,
        modalFieldPhaseSlots: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
        resolution: 16,
        time: 0,
        evaluateFieldPoint:
          raymarchFieldCache.evaluateRaymarchLiveSynthesisFieldPoint,
      },
    );

    expect(Number.isFinite(direct.viewPlaneNormalConvergence)).toBe(true);
    expect(direct.opticalConvergenceAuthority).toBeGreaterThanOrEqual(0);
    expect(effective.viewPlaneNormalConvergence).toBeCloseTo(
      direct.viewPlaneNormalConvergence,
      6,
    );
    expect(effective.opticalConvergenceAuthority).toBeCloseTo(
      direct.opticalConvergenceAuthority,
      6,
    );
  });

  it("applies one effective phase coefficient to scalar and gradient", () => {
    expect(evaluateRaymarchLiveSynthesisFieldPoint).toBeTypeOf("function");
    const slots = new Float32Array([1, 1, 1, 1]);
    const zeroPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
    });
    const invertedPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
    });

    expect(invertedPhase.field).toBeCloseTo(-zeroPhase.field, 6);
    expect(invertedPhase.gradX).toBeCloseTo(-zeroPhase.gradX, 6);
    expect(invertedPhase.gradY).toBeCloseTo(-zeroPhase.gradY, 6);
    expect(invertedPhase.gradZ).toBeCloseTo(-zeroPhase.gradZ, 6);
    expect(invertedPhase.modalBasisCachePhaseAuthority).toBe(1);
  });

  it("reports modal-basis bandwidth rejection separately from descriptor overflow", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 8, 8, 8, 0.25]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      descriptorOverflow: false,
      resolution: 8,
    });

    expect(descriptor.descriptorOverflow).toBe(false);
    expect(descriptor.bandwidthRejectedModeCount).toBe(1);
    expect(descriptor.bandwidthRejectedRawModalEnergy).toBeCloseTo(
      0.25 ** 2,
      6,
    );
    expect(descriptor.contributingBasisPageModeCount).toBe(1);
    expect(descriptor.contributingRawModalEnergy).toBeCloseTo(0.5 ** 2, 6);
    expect(descriptor.liveSynthesisResolvedRawModalEnergyRatio).toBeCloseTo(
      0.5 ** 2 / (0.5 ** 2 + 0.25 ** 2),
      6,
    );
    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeGreaterThan(0);
  });

  it("keeps bandwidth-rejected modes out of modal-basis freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const baseSlots = new Float32Array([1, 1, 1, 0.7, 9, 9, 9, 0.2]);
    const rejectedChangedSlots = new Float32Array([
      1, 1, 1, 0.7, 12, 12, 12, 0.9,
    ]);
    const representableChangedSlots = new Float32Array([
      2, 2, 2, 0.7, 9, 9, 9, 0.2,
    ]);
    const phaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);
    const sampleOptions = {
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
      time: 0,
      resolution: 8,
    };
    const baseDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...sampleOptions,
      modalFieldSlots: baseSlots,
    });
    const rejectedChangedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...sampleOptions,
      modalFieldSlots: rejectedChangedSlots,
    });
    const representableChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        ...sampleOptions,
        modalFieldSlots: representableChangedSlots,
      });
    const baseSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: baseSlots,
    });
    const rejectedChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: rejectedChangedSlots,
    });
    const representableChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: representableChangedSlots,
    });

    modalBasisCache.activeDescriptor = baseDescriptor;

    expect(baseDescriptor.modalBasisCacheSupportDiagnosticHash).toBe(
      rejectedChangedDescriptor.modalBasisCacheSupportDiagnosticHash,
    );
    expect(rejectedChangedDescriptor.modalBasisCacheTopologyHash).toBe(
      baseDescriptor.modalBasisCacheTopologyHash,
    );
    expect(rejectedChangedSample.field).toBeCloseTo(baseSample.field, 6);
    expect(rejectedChangedSample.unsignedSupport).toBeCloseTo(
      baseSample.unsignedSupport,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        rejectedChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
    expect(representableChangedSample.field).not.toBeCloseTo(
      baseSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        representableChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("separates raw modal energy from phase-current effective energy", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([Math.PI / 2, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(descriptor.contributingRawModalEnergy).toBeCloseTo(1, 6);
    expect(descriptor.contributingPhaseCurrentModalEnergy).toBeCloseTo(0, 6);
  });

  it("uses phase-current modal support when the field is quadrature", () => {
    const slots = new Float32Array([1, 1, 1, 1]);
    const samplePoint = {
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
      resolution: 8,
    };
    const inPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      ...samplePoint,
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
    });
    const quadrature = evaluateRaymarchLiveSynthesisFieldPoint({
      ...samplePoint,
      backbonePhaseSlots: new Float32Array([Math.PI / 2, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
    });

    expect(Math.abs(quadrature.field)).toBeLessThan(1e-6);
    expect(Math.abs(quadrature.gradX)).toBeLessThan(1e-6);
    expect(Math.abs(quadrature.gradY)).toBeLessThan(1e-6);
    expect(Math.abs(quadrature.gradZ)).toBeLessThan(1e-6);
    expect(inPhase.unsignedSupport).toBeGreaterThan(0);
    expect(quadrature.unsignedSupport).toBeLessThan(1e-6);
    expect(quadrature.cancellationRatio).toBeGreaterThan(0.95);
  });

  it("separates raw gradient envelope from phase-current effective gradient", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([Math.PI / 2, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeGreaterThan(0);
    expect(descriptor.liveSynthesisPhaseCurrentGradientEnvelope).toBeCloseTo(
      0,
      6,
    );
  });

  it("uses the shifted Dirichlet half-domain gradient scale in diagnostics", () => {
    const radius = 3;
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeCloseTo(
      (Math.hypot(1, 1, 1) * Math.PI) / (2 * radius),
      6,
    );
  });

  it("weights live-synthesis gradient diagnostics by modal energy", () => {
    const radius = 3;
    const primaryCoefficient = 1;
    const quietCoefficient = 0.25;
    const primaryGradientBound = (Math.hypot(1, 1, 1) * Math.PI) / radius;
    const quietGradientBound = (Math.hypot(2, 2, 2) * Math.PI) / radius;
    const expectedEnergyWeightedEnvelope =
      (primaryCoefficient ** 2 * primaryGradientBound +
        quietCoefficient ** 2 * quietGradientBound) /
      (primaryCoefficient ** 2 + quietCoefficient ** 2);
    const staleAmplitudeWeightedEnvelope =
      (primaryCoefficient * primaryGradientBound +
        quietCoefficient * quietGradientBound) /
      (primaryCoefficient + quietCoefficient);

    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([
        1,
        1,
        1,
        primaryCoefficient,
        2,
        2,
        2,
        quietCoefficient,
      ]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeCloseTo(
      expectedEnergyWeightedEnvelope,
      6,
    );
    expect(descriptor.liveSynthesisRawGradientEnvelope).not.toBeCloseTo(
      staleAmplitudeWeightedEnvelope,
      6,
    );
  });

  it("reports duplicate modal-basis diagnostics as canonical modal terms", () => {
    const compactSlots = new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]);
    const splitSlots = new Float32Array([
      1, 1, 1, 0.35, 1, 1, 1, 0.25, 2, 2, 2, 0.4,
    ]);
    const compactPhaseSlots = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
    const splitPhaseSlots = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    const descriptorOptions = {
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    };
    const compactDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...descriptorOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 2,
    });
    const splitDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...descriptorOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitPhaseSlots,
      modalFieldCount: 3,
    });
    const compactSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...descriptorOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 2,
      x: 0.2,
      y: 0.1,
      z: -0.15,
    });
    const splitSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...descriptorOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitPhaseSlots,
      modalFieldCount: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
    });

    expect(splitSample.field).toBeCloseTo(compactSample.field, 6);
    expect(splitDescriptor.modalFieldCount).toBe(
      compactDescriptor.modalFieldCount,
    );
    expect(splitDescriptor.contributingBasisPageModeCount).toBe(
      compactDescriptor.contributingBasisPageModeCount,
    );
    expect(splitDescriptor.contributingRawModalEnergy).toBeCloseTo(
      compactDescriptor.contributingRawModalEnergy,
      6,
    );
    expect(splitDescriptor.liveSynthesisRawGradientEnvelope).toBeCloseTo(
      compactDescriptor.liveSynthesisRawGradientEnvelope,
      6,
    );
    expect(splitSample.contributingBasisPageModeCount).toBe(
      compactSample.contributingBasisPageModeCount,
    );
    expect(splitSample.contributingRawModalEnergy).toBeCloseTo(
      compactSample.contributingRawModalEnergy,
      6,
    );
  });

  it("normalizes live field values from the representable contributing set", () => {
    const lowModeSlots = new Float32Array([1, 1, 1, 1]);
    const mixedSlots = new Float32Array([1, 1, 1, 1, 8, 8, 8, 1]);
    const lowOnly = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: lowModeSlots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    });
    const mixed = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: mixedSlots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    });

    expect(mixed.field).toBeCloseTo(lowOnly.field, 6);
    expect(mixed.gradX).toBeCloseTo(lowOnly.gradX, 6);
    expect(mixed.gradY).toBeCloseTo(lowOnly.gradY, 6);
    expect(mixed.gradZ).toBeCloseTo(lowOnly.gradZ, 6);
    expect(mixed.bandwidthRejectedModeCount).toBe(1);
    expect(mixed.bandwidthRejectedRawModalEnergy).toBeCloseTo(1, 6);
  });

  it("reports live-synthesis unsigned support when signed modes cancel", () => {
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    });

    expect(Math.abs(sample.field)).toBeLessThan(0.001);
    expect(sample.unsignedSupport).toBeGreaterThan(0.9);
    expect(sample.cancellationRatio).toBeGreaterThan(0.95);
  });

  it("summarizes live-synthesis support and cancellation diagnostics", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisUnsignedSupportMean).toBeGreaterThan(0.1);
    expect(descriptor.liveSynthesisCancellationRatioMean).toBeGreaterThan(0.95);
    expect(descriptor.liveSynthesisCancellationRatioMax).toBeGreaterThan(0.95);
    expect(descriptor.liveSynthesisSupportDiagnosticSampleCount).toBe(9);
    expect(descriptor.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(
      7,
    );
    expect(descriptor.liveSynthesisSupportDiagnosticCoverage).toBeCloseTo(
      7 / 9,
      6,
    );
    expect(descriptor.liveSynthesisUnsignedSupportMean).toBeCloseTo(7 / 9, 6);
  });

  it("keeps descriptor support diagnostics equivalent to public field samples", () => {
    const radius = 3;
    const samplePoints = [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ];
    const sampleOptions = {
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius,
      phaseModeCount: 2,
      phaseAuthority: 1,
      resolution: 8,
    };
    const descriptor = buildRaymarchModalBasisCacheDescriptor(sampleOptions);
    const samples = samplePoints.map(([x, y, z]) =>
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        x: x * radius,
        y: y * radius,
        z: z * radius,
      }),
    );
    const supportedSamples = samples.filter(
      (sample) => sample.unsignedSupport > 0.01,
    );
    const expectedSupportMean =
      samples.reduce((sum, sample) => sum + sample.unsignedSupport, 0) /
      samples.length;
    const expectedCancellationMean =
      supportedSamples.reduce(
        (sum, sample) => sum + sample.cancellationRatio,
        0,
      ) / supportedSamples.length;
    const expectedCancellationMax = Math.max(
      ...supportedSamples.map((sample) => sample.cancellationRatio),
    );

    expect(descriptor.liveSynthesisSupportDiagnosticSampleCount).toBe(
      samplePoints.length,
    );
    expect(descriptor.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(
      supportedSamples.length,
    );
    expect(descriptor.liveSynthesisUnsignedSupportMean).toBeCloseTo(
      expectedSupportMean,
      6,
    );
    expect(descriptor.liveSynthesisCancellationRatioMean).toBeCloseTo(
      expectedCancellationMean,
      6,
    );
    expect(descriptor.liveSynthesisCancellationRatioMax).toBeCloseTo(
      expectedCancellationMax,
      6,
    );
  });

  it("includes unsupported diagnostic points in unsigned support mean", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisSupportDiagnosticSampleCount).toBe(9);
    expect(descriptor.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(
      3,
    );
    expect(descriptor.liveSynthesisSupportDiagnosticCoverage).toBeCloseTo(
      1 / 3,
      6,
    );
    expect(descriptor.liveSynthesisUnsignedSupportMean).toBeLessThan(0.2);
  });

  it("samples modal-basis support antinodes when fixed points are modal nodes", () => {
    const radius = 3;
    const slots = new Float32Array([4, 4, 4, 1]);
    const phaseSlots = new Float32Array([0, 0, 1, 1]);
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: phaseSlots,
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 16,
    });
    const antinodeSample = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: phaseSlots,
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius,
      x: radius * 0.25,
      y: radius * 0.25,
      z: radius * 0.25,
      time: 0,
      resolution: 16,
    });

    expect(antinodeSample.unsignedSupport).toBeGreaterThan(0.95);
    expect(
      descriptor.liveSynthesisSupportDiagnosticSampleCount,
    ).toBeGreaterThan(9);
    expect(descriptor.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(
      1,
    );
    expect(descriptor.liveSynthesisUnsignedSupportMean).toBeGreaterThan(0);
  });

  it("reports zero-amplitude modal-basis slots skipped before representability", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([
        1, 1, 1, 0.5, 2, 2, 2, 0, 3, 3, 3, 0.25,
      ]),
      detailSlots: new Float32Array([4, 4, 4, 0, 5, 5, 5, 0.1]),
      backbonePhaseSlots: new Float32Array(12),
      detailPhaseSlots: new Float32Array(8),
      backboneCount: 3,
      detailCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 3,
      phaseAuthority: 1,
      resolution: 16,
    });

    expect(descriptor.zeroAmplitudeSkippedModeCount).toBe(2);
    expect(descriptor.contributingBasisPageModeCount).toBe(3);
    expect(descriptor.bandwidthRejectedModeCount).toBe(0);
  });

  it("keeps the cached modal field signed rather than absolute-valued", () => {
    const slots = new Float32Array([1, 1, 1, 1]);
    const positiveLobe = evaluateRaymarchFieldCachePoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
    });
    const negativeLobe = evaluateRaymarchFieldCachePoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });

    expect(positiveLobe.field).toBeGreaterThan(0);
    expect(negativeLobe.field).toBeLessThan(0);
  });

  it("reports destructive interference against unsigned modal potential", () => {
    const sample = evaluateRaymarchSignedPotentialAtPoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      detailSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });

    expect(Math.abs(sample.signedPotential)).toBeLessThan(0.001);
    expect(sample.unsignedPotential).toBeGreaterThan(0.9);
    expect(sample.cancellation).toBeGreaterThan(0.95);
  });

  it("keeps cached Spectral Light metadata independent from signed cancellation", () => {
    const slots = new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]);
    const colors = new Float32Array([1, 0.15, 0.2, 1, 0.1, 0.35, 1, 1]);
    const reinforcing = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backboneColorSlots: colors,
      detailColorSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
    });
    const canceling = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backboneColorSlots: colors,
      detailColorSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });

    expect(reinforcing.colorWeight).toBeGreaterThan(0.9);
    expect(canceling.colorWeight).toBeCloseTo(reinforcing.colorWeight, 6);
    expect(canceling.r).toBeCloseTo(reinforcing.r, 6);
    expect(canceling.g).toBeCloseTo(reinforcing.g, 6);
    expect(canceling.b).toBeCloseTo(reinforcing.b, 6);
  });

  it("evaluates cached Spectral Light color as whitepaper linear modal-local mixing", () => {
    const sample = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([
        1, 1, 1, 0.45, 2, 2, 2, 0.35, 3, 3, 3, 0.32,
      ]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array([
        1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1,
      ]),
      detailColorSlots: new Float32Array(0),
      backboneCount: 3,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
    });
    const spectralColor = {
      r: sample.r / sample.colorWeight,
      g: sample.g / sample.colorWeight,
      b: sample.b / sample.colorWeight,
    };
    const expectedColorWeight = 0.45 + 0.35 + 0.32;

    expect(sample.colorWeight).toBeCloseTo(expectedColorWeight, 6);
    expect(spectralColor.r).toBeCloseTo(0.45 / expectedColorWeight, 6);
    expect(spectralColor.g).toBeCloseTo(0.35 / expectedColorWeight, 6);
    expect(spectralColor.b).toBeCloseTo(0.32 / expectedColorWeight, 6);
  });

  it("preserves partially cancelled Spectral Light color metadata without signed damping", () => {
    const colors = new Float32Array([1, 0.15, 0.2, 1, 0.1, 0.35, 1, 1]);
    const reinforcing = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: colors,
      detailColorSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
    });
    const partial = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.625, 2, 2, 2, 0.375]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: colors,
      detailColorSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });

    expect(reinforcing.colorWeight).toBeCloseTo(1, 6);
    expect(partial.colorWeight).toBeCloseTo(reinforcing.colorWeight, 6);
    expect(partial.r + partial.g + partial.b).toBeGreaterThan(1);
  });

  it("preserves mild residual Spectral Light color metadata as local support", () => {
    const colors = new Float32Array([1, 0.15, 0.2, 1, 0.1, 0.35, 1, 1]);
    const reinforcing = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: colors,
      detailColorSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
    });
    const mildResidual = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.55, 2, 2, 2, 0.45]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: colors,
      detailColorSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });

    expect(reinforcing.colorWeight).toBeCloseTo(1, 6);
    expect(mildResidual.colorWeight).toBeCloseTo(reinforcing.colorWeight, 6);
    expect(mildResidual.r + mildResidual.g + mildResidual.b).toBeGreaterThan(1);
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

  it("evaluates cached Spectral Light support as raw local amplitude scale", () => {
    const quiet = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.045]),
      detailSlots: new Float32Array([2, 2, 4, 0.01]),
      backboneColorSlots: new Float32Array([0.9, 0.25, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });
    const loud = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneColorSlots: new Float32Array([0.9, 0.25, 0.1, 0.9]),
      detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.4]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.25,
      y: -0.5,
      z: 1.1,
    });

    const expectedAmplitudeScale = 20;

    expect(quiet.colorWeight).toBeGreaterThan(0);
    expect(loud.colorWeight / quiet.colorWeight).toBeCloseTo(
      expectedAmplitudeScale,
      5,
    );
    expect(loud.r / quiet.r).toBeCloseTo(expectedAmplitudeScale, 5);
    expect(loud.g / quiet.g).toBeCloseTo(expectedAmplitudeScale, 5);
    expect(loud.b / quiet.b).toBeCloseTo(expectedAmplitudeScale, 5);
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
