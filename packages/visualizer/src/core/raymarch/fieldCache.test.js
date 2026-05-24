import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as raymarchFieldCache from "./fieldCache.js";
import {
  buildRaymarchSpectralLightCacheDescriptor,
  buildRaymarchFieldCacheDescriptor,
  createRaymarchSpectralLightCache,
  createRaymarchFieldCache,
  enqueueRaymarchFieldCacheRebuild,
  enqueueRaymarchSpectralLightCacheRebuild,
  evaluateRaymarchFieldCachePoint,
  evaluateRaymarchSpectralLightCachePoint,
  evaluateRaymarchSignedPotentialAtPoint,
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
    expect(fieldCache.mode).toBe("cached");
    expect(fieldCache.queuedDescriptor).toBeNull();
    expect(fieldCache.pendingDescriptor).toBeNull();
  });

  it("creates the canonical effective field cache without fixed phase cadence", () => {
    expect(raymarchFieldCache.createRaymarchEffectiveFieldCache).toBeTypeOf(
      "function",
    );
    const effectiveFieldCache =
      raymarchFieldCache.createRaymarchEffectiveFieldCache({ resolution: 8 });

    expect(effectiveFieldCache.texture.isStorageTexture).toBe(true);
    expect(effectiveFieldCache.texture.is3DTexture).toBe(true);
    expect(effectiveFieldCache.texture.image.width).toBe(8);
    expect(effectiveFieldCache.ready).toBe(false);
    expect(effectiveFieldCache.backend).toBe("compute");
    expect(effectiveFieldCache.mode).toBe("effective-cached");
    expect(effectiveFieldCache.semantic).toBe("canonical-effective-field");
    expect(effectiveFieldCache).not.toHaveProperty("updateIntervalMs");
  });

  it("creates companion effective-field support metadata without a second field authority", () => {
    const effectiveFieldCache =
      raymarchFieldCache.createRaymarchEffectiveFieldCache({ resolution: 8 });

    expect(effectiveFieldCache.supportTexture.isStorageTexture).toBe(true);
    expect(effectiveFieldCache.supportTexture.is3DTexture).toBe(true);
    expect(effectiveFieldCache.supportTexture.image.width).toBe(8);
    expect(effectiveFieldCache.supportTexture).not.toBe(
      effectiveFieldCache.texture,
    );
    expect(effectiveFieldCache.semantic).toBe("canonical-effective-field");
    expect(effectiveFieldCache.supportSemantic).toBe("effective-field-support");
  });

  it("keeps compute support and cancellation semantics paired with the CPU helper", () => {
    const source = readFileSync(
      new URL("./fieldCache.js", import.meta.url),
      "utf8",
    );
    const cpuSupportStart = source.indexOf(
      "unsignedSupport += Math.abs(coefficient * family.field);",
    );
    const computeContributionStart = source.indexOf(
      "const contribution = coefficient.mul(family.field).toVar();",
    );
    const supportTextureStoreStart = source.indexOf(
      "textureStore(\n        supportTexture",
    );

    expect(cpuSupportStart).toBeGreaterThan(-1);
    expect(computeContributionStart).toBeGreaterThan(-1);
    expect(source).toContain("unsignedSupport.addAssign(abs(contribution))");
    expect(source).toContain("const cancellationRatio = clamp(");
    expect(supportTextureStoreStart).toBeGreaterThan(computeContributionStart);
  });

  it("ignores carrier phase offsets but rebuilds on stable phase parameter changes", () => {
    expect(raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor).toBeTypeOf(
      "function",
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchEffectiveFieldCache,
    ).toBeTypeOf("function");
    const effectiveFieldCache =
      raymarchFieldCache.createRaymarchEffectiveFieldCache({ resolution: 8 });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialDescriptor =
      raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor({
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
    const carrierAdvancedDescriptor =
      raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor({
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
      raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor({
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

    effectiveFieldCache.activeDescriptor = initialDescriptor;

    expect(
      raymarchFieldCache.shouldRebuildRaymarchEffectiveFieldCache(
        effectiveFieldCache,
        initialDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.shouldRebuildRaymarchEffectiveFieldCache(
        effectiveFieldCache,
        carrierAdvancedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.shouldRebuildRaymarchEffectiveFieldCache(
        effectiveFieldCache,
        phaseParameterChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "phase-slots" });
    expect(
      raymarchFieldCache.getRaymarchEffectiveFieldDescriptorStaleReason({
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("phase-slots");
    expect(
      raymarchFieldCache.getRaymarchEffectiveFieldDescriptorStaleReason({
        descriptorFresh: true,
        activeDescriptor: phaseParameterChangedDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBeNull();
    expect(
      raymarchFieldCache.getRaymarchEffectiveFieldDescriptorStaleReason({
        rebuildPending: true,
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("rebuild-pending");
    expect(
      raymarchFieldCache.getRaymarchEffectiveFieldDescriptorStaleReason({
        queuedDescriptor: phaseParameterChangedDescriptor,
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("queued-descriptor");
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
      backboneModeBuffer: { value: { array: new Float32Array(4) } },
      detailModeBuffer: { value: { array: new Float32Array(4) } },
      backboneCapacity: 1,
      detailCapacity: 0,
      uniforms: {
        uRadius: { value: 3 },
        uBackboneModeCount: { value: 1 },
        uDetailModeCount: { value: 0 },
      },
    };
    fieldCache.computeNodesByKey["rectangular:neumann"] = { id: "field" };

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
    const descriptor1 = { ...descriptor0, backboneColorHash: 1 };
    const descriptor2 = { ...descriptor0, backboneColorHash: 2 };
    const descriptor3 = { ...descriptor0, backboneColorHash: 3 };
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
      backboneModeBuffer: { value: { array: new Float32Array(4) } },
      detailModeBuffer: { value: { array: new Float32Array(4) } },
      backboneColorBuffer: { value: { array: new Float32Array(4) } },
      detailColorBuffer: { value: { array: new Float32Array(4) } },
      backboneCapacity: 1,
      detailCapacity: 0,
      uniforms: {
        uRadius: { value: 3 },
        uBackboneModeCount: { value: 1 },
        uDetailModeCount: { value: 0 },
      },
    };
    spectralLightCache.computeNodesByKey["rectangular:neumann"] = {
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

  it("coalesces effective field rebuild requests to the newest pending descriptor", async () => {
    expect(raymarchFieldCache.enqueueRaymarchEffectiveFieldRebuild).toBeTypeOf(
      "function",
    );
    const effectiveFieldCache =
      raymarchFieldCache.createRaymarchEffectiveFieldCache({ resolution: 8 });
    const slots = new Float32Array([1, 2, 3, 0.5]);
    const descriptor0 =
      raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor({
        backboneSlots: slots,
        detailSlots: new Float32Array(4),
        backbonePhaseSlots: new Float32Array([0, 0.1, 0.6, 0.7]),
        detailPhaseSlots: new Float32Array(4),
        backboneCount: 1,
        detailCount: 0,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 0.42,
      });
    const descriptor1 = { ...descriptor0, phaseAuthority: 0.43 };
    const descriptor2 = { ...descriptor0, phaseAuthority: 0.44 };
    const descriptor3 = { ...descriptor0, phaseAuthority: 0.45 };
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
      backboneModeBuffer: { value: { array: new Float32Array(4) } },
      detailModeBuffer: { value: { array: new Float32Array(4) } },
      backbonePhaseBuffer: { value: { array: new Float32Array(4) } },
      detailPhaseBuffer: { value: { array: new Float32Array(4) } },
      backboneCapacity: 1,
      detailCapacity: 0,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uBackboneModeCount: { value: 1 },
        uDetailModeCount: { value: 0 },
      },
    };
    effectiveFieldCache.computeNodesByKey["rectangular:neumann"] = {
      id: "effective",
    };

    const first = raymarchFieldCache.enqueueRaymarchEffectiveFieldRebuild(
      effectiveFieldCache,
      renderer,
      descriptor0,
      "initial",
      options,
    );
    raymarchFieldCache.enqueueRaymarchEffectiveFieldRebuild(
      effectiveFieldCache,
      renderer,
      descriptor1,
      "phase-authority",
      options,
    );
    raymarchFieldCache.enqueueRaymarchEffectiveFieldRebuild(
      effectiveFieldCache,
      renderer,
      descriptor2,
      "phase-authority",
      options,
    );
    const pending = raymarchFieldCache.enqueueRaymarchEffectiveFieldRebuild(
      effectiveFieldCache,
      renderer,
      descriptor3,
      "phase-authority",
      options,
    );

    expect(first.enqueued).toBe(true);
    expect(pending.enqueued).toBe(false);
    expect(pending.reason).toBe("pending");
    expect(effectiveFieldCache.pendingDescriptor).toEqual(descriptor0);
    expect(effectiveFieldCache.queuedDescriptor).toEqual(descriptor3);
    expect(effectiveFieldCache.queuedRebuildReason).toBe("phase-authority");

    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(effectiveFieldCache.activeDescriptor).toEqual(descriptor0);
    expect(effectiveFieldCache.pendingDescriptor).toEqual(descriptor3);
    expect(effectiveFieldCache.queuedDescriptor).toBeNull();
    expect(effectiveFieldCache.rebuildPending).toBe(true);
    expect(computeCalls).toBe(2);
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

  it("evaluates zero-phase effective field as the static field", () => {
    expect(raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint).toBeTypeOf(
      "function",
    );
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
    const effectiveSample =
      raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint({
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
    expect(effectiveSample.effectiveFieldAuthority).toBe(0);
  });

  it("applies one effective phase coefficient to scalar and gradient", () => {
    expect(raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint).toBeTypeOf(
      "function",
    );
    const slots = new Float32Array([1, 1, 1, 1]);
    const zeroPhase = raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint({
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
    const invertedPhase =
      raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint({
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
    expect(invertedPhase.effectiveFieldAuthority).toBe(1);
  });

  it("reports effective field bandwidth rejection separately from descriptor overflow", () => {
    const descriptor = raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor(
      {
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
      },
    );

    expect(descriptor.descriptorOverflow).toBe(false);
    expect(descriptor.bandwidthRejectedModeCount).toBe(1);
    expect(descriptor.bandwidthRejectedModalEnergy).toBeCloseTo(0.25, 6);
    expect(descriptor.contributingEffectiveFieldModeCount).toBe(1);
    expect(descriptor.contributingModalEnergy).toBeCloseTo(0.5, 6);
    expect(descriptor.effectiveFieldResolvedModalEnergyRatio).toBeCloseTo(
      0.5 / 0.75,
      6,
    );
    expect(descriptor.effectiveFieldGradientEnvelope).toBeGreaterThan(0);
  });

  it("normalizes effective field values from the representable contributing set", () => {
    const lowModeSlots = new Float32Array([1, 1, 1, 1]);
    const mixedSlots = new Float32Array([1, 1, 1, 1, 8, 8, 8, 1]);
    const lowOnly = raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint({
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
    const mixed = raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint({
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
    expect(mixed.bandwidthRejectedModalEnergy).toBeCloseTo(1, 6);
  });

  it("reports effective-field unsigned support when signed modes cancel", () => {
    const sample = raymarchFieldCache.evaluateRaymarchEffectiveFieldPoint({
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

  it("summarizes effective-field support and cancellation diagnostics", () => {
    const descriptor = raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor(
      {
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
      },
    );

    expect(descriptor.effectiveFieldUnsignedSupportMean).toBeGreaterThan(0.1);
    expect(descriptor.effectiveFieldCancellationRatioMean).toBeGreaterThan(
      0.95,
    );
    expect(descriptor.effectiveFieldCancellationRatioMax).toBeGreaterThan(0.95);
  });

  it("reports zero-amplitude effective-field slots skipped before representability", () => {
    const descriptor = raymarchFieldCache.buildRaymarchEffectiveFieldDescriptor(
      {
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
      },
    );

    expect(descriptor.zeroAmplitudeSkippedModeCount).toBe(2);
    expect(descriptor.contributingEffectiveFieldModeCount).toBe(3);
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

  it("suppresses cached Spectral Light support when signed modal fields cancel", () => {
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
    expect(canceling.colorWeight).toBeLessThan(reinforcing.colorWeight * 0.1);
    expect(canceling.r + canceling.g + canceling.b).toBeLessThan(
      (reinforcing.r + reinforcing.g + reinforcing.b) * 0.1,
    );
  });

  it("keeps dense Spectral Light cache color keyed to the dominant local mode", () => {
    const sample = evaluateRaymarchSpectralLightCachePoint({
      backboneSlots: new Float32Array([
        1, 1, 1, 0.45,
        2, 2, 2, 0.35,
        3, 3, 3, 0.32,
      ]),
      detailSlots: new Float32Array(0),
      backboneColorSlots: new Float32Array([
        1, 0, 0, 1,
        0, 1, 0, 1,
        0, 0, 1, 1,
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

    expect(sample.colorWeight).toBeGreaterThan(0.9);
    expect(spectralColor.r).toBeGreaterThan(0.45);
    expect(
      spectralColor.r - Math.max(spectralColor.g, spectralColor.b),
    ).toBeGreaterThan(0.16);
  });

  it("keeps partially cancelled Spectral Light support visibly above the floor", () => {
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

    expect(partial.colorWeight).toBeGreaterThan(reinforcing.colorWeight * 0.75);
    expect(partial.r + partial.g + partial.b).toBeGreaterThan(
      (reinforcing.r + reinforcing.g + reinforcing.b) * 0.75,
    );
  });

  it("preserves mild signed residuals so old presets stay visible", () => {
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

    expect(mildResidual.colorWeight).toBeGreaterThan(
      reinforcing.colorWeight * 0.7,
    );
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

  it("evaluates cached Spectral Light support independent of global amplitude scale", () => {
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

    expect(quiet.colorWeight).toBeGreaterThan(0.06);
    expect(loud.colorWeight).toBeCloseTo(quiet.colorWeight, 6);
    expect(loud.r).toBeCloseTo(quiet.r, 6);
    expect(loud.g).toBeCloseTo(quiet.g, 6);
    expect(loud.b).toBeCloseTo(quiet.b, 6);
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
