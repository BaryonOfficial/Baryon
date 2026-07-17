import { describe, expect, it, vi } from "vitest";
import {
  buildRaymarchAuditFixtureDescriptorFromSources,
  createRaymarchAuditFixtureController,
  hashRaymarchAuditNumericArray,
  validateRaymarchAuditFixtureDescriptor,
} from "./raymarchAuditFixture.js";

async function numericArray(values) {
  return {
    values,
    elementCount: values.length,
    sha256: await hashRaymarchAuditNumericArray(values),
  };
}

async function createDescriptor(overrides = {}) {
  const capacity = 2;
  const slots = [1, 2, 3, 0.8, 2, 3, 4, 0.4];
  const zeroSlots = new Array(capacity * 4).fill(0);
  const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const descriptor = {
    kind: "baryon-raymarch-audit-fixture/v1",
    descriptorId: "base-front-v1",
    checkpoint: {
      mode: "base",
      decisionManifestSha256: null,
    },
    modal: {
      fieldAuthority: "complete",
      activeModeCount: 2,
      capacity,
      slots: await numericArray(slots),
      phaseSlots: await numericArray(zeroSlots),
      colorSlots: await numericArray([1, 0.2, 0.1, 1, 0.1, 0.5, 1, 1]),
      spectralLaneA: await numericArray(zeroSlots),
      spectralLaneB: await numericArray(zeroSlots),
      spectralMeta: await numericArray(zeroSlots),
      metadataSlots: await numericArray(zeroSlots),
    },
    phase: {
      evaluationTimeSec: 2.5,
      authority: 1,
    },
    domain: {
      radius: 3,
      boundaryMode: "rigid",
      cavityGeometry: "sphere",
      volumeShape: "sphere",
    },
    transport: {
      mode: "off",
      apparatusIdentity: null,
      cacheIdentity: null,
      expectedDispatchCount: 0,
      prototype: null,
    },
    spectral: {
      enabled: true,
      colorMode: "spectral",
      spectralMix: 1,
    },
    camera: {
      viewPreset: "front",
      viewMatrix: await numericArray(identityMatrix),
      projectionMatrix: await numericArray(identityMatrix),
      viewport: { width: 640, height: 640, dpr: 1 },
    },
    material: {
      holographicBaseRadianceGain: 0.25,
      laserAccentAuthority: 0,
      densityGain: 1,
      absorption: 0.5,
      carrierCoreFwhmWorld: 0.024,
      contourSharpness: 1,
      deterministicSeed: 7,
    },
    output: {
      volumeKernelIdentity: "safe-volumetric-lighting-model/v1",
      stepControllerIdentity: "adaptive-raymarch/v1",
      attachmentFormat: "rgba16float",
      aovIdentities: ["baseRadiance", "transmittance", "coverage"],
      width: 640,
      height: 640,
      raymarchSteps: 96,
    },
    post: {
      toneMapping: "agx",
      exposure: 1,
      bloomEnabled: false,
      opticalPsfEnabled: false,
    },
  };
  return Object.assign(descriptor, overrides);
}

function createSeal(descriptorHash, overrides = {}) {
  return {
    descriptorHash,
    modalGeneration: 3,
    fieldGeneration: 4,
    spectralGeneration: 5,
    transportGeneration: null,
    aovGeneration: 6,
    kernelIdentity: "safe-volumetric-lighting-model/v1",
    transportDispatchCount: 0,
    producerEpoch: 9,
    phaseEvaluationTimeSec: 2.5,
    ...overrides,
  };
}

function createAdapter(events) {
  let seal = null;
  return {
    snapshotCanonicalState: vi.fn(async () => {
      events.push("snapshot");
      return { livePacketId: "live-12" };
    }),
    suspendProducers: vi.fn(async () => events.push("suspend")),
    installDescriptor: vi.fn(async ({ descriptorHash }) => {
      events.push("install");
      seal = createSeal(descriptorHash);
    }),
    awaitCheckpointReady: vi.fn(async () => {
      events.push("ready");
      return { ready: true };
    }),
    readSeal: vi.fn(async () => {
      events.push("seal");
      return seal;
    }),
    readCurrentSeal: vi.fn(async () => seal),
    exportBuffers: vi.fn(async () => ({ manifest: "buffers" })),
    clearFixtureState: vi.fn(async () => events.push("clear")),
    restoreCanonicalState: vi.fn(async () => events.push("restore")),
    awaitFreshAuthoritativePacket: vi.fn(async () => events.push("fresh")),
    drift(nextSeal) {
      seal = nextSeal;
    },
    currentSeal() {
      return seal;
    },
  };
}

describe("raymarch audit fixture", () => {
  it("validates and hashes every typed array before runtime mutation", async () => {
    const descriptor = await createDescriptor();
    const validated = await validateRaymarchAuditFixtureDescriptor(descriptor);
    expect(validated.descriptorHash).toMatch(/^[a-f0-9]{64}$/);

    descriptor.modal.slots.values[0] = 99;
    await expect(
      validateRaymarchAuditFixtureDescriptor(descriptor),
    ).rejects.toThrow("modal.slots.sha256 does not match values");
  });

  it("installs atomically in owner order and seals the checkpoint", async () => {
    const events = [];
    const adapter = createAdapter(events);
    const controller = createRaymarchAuditFixtureController({ adapter });

    const installed = await controller.install(await createDescriptor());

    expect(events).toEqual(["snapshot", "suspend", "install", "ready", "seal"]);
    expect(installed).toMatchObject({
      phase: "installed",
      checkpointMode: "base",
      captureAllowed: true,
      invalidReason: null,
    });
    await expect(controller.assertSealed()).resolves.toMatchObject({
      captureAllowed: true,
    });
  });

  it("rejects invalid input without touching the adapter", async () => {
    const events = [];
    const adapter = createAdapter(events);
    const controller = createRaymarchAuditFixtureController({ adapter });
    const descriptor = await createDescriptor();
    descriptor.extra = true;

    await expect(controller.install(descriptor)).rejects.toThrow(
      "descriptor keys must be exactly",
    );
    expect(events).toEqual([]);
    expect(controller.status().phase).toBe("idle");
  });

  it("rolls back partial installation and requires a fresh live packet", async () => {
    const events = [];
    const adapter = createAdapter(events);
    adapter.awaitCheckpointReady.mockRejectedValueOnce(
      new Error("cache failed"),
    );
    const controller = createRaymarchAuditFixtureController({ adapter });

    await expect(controller.install(await createDescriptor())).rejects.toThrow(
      "cache failed",
    );
    expect(events).toEqual([
      "snapshot",
      "suspend",
      "install",
      "clear",
      "restore",
      "fresh",
    ]);
    expect(controller.status()).toMatchObject({
      phase: "idle",
      captureAllowed: false,
    });
  });

  it("fails capture closed when any sealed generation drifts", async () => {
    const events = [];
    const adapter = createAdapter(events);
    const controller = createRaymarchAuditFixtureController({ adapter });
    const installed = await controller.install(await createDescriptor());
    adapter.drift(
      createSeal(installed.descriptorHash, {
        fieldGeneration: adapter.currentSeal().fieldGeneration + 1,
      }),
    );

    await expect(controller.exportBuffers()).rejects.toThrow("seal drifted");
    expect(controller.status()).toMatchObject({
      phase: "installed",
      captureAllowed: false,
      invalidReason: "Installed raymarch audit fixture seal drifted",
    });
  });

  it("tears down before restoring producers and waits for a fresh packet", async () => {
    const events = [];
    const adapter = createAdapter(events);
    const controller = createRaymarchAuditFixtureController({ adapter });
    await controller.install(await createDescriptor());
    events.length = 0;

    const result = await controller.teardown();

    expect(events).toEqual(["clear", "restore", "fresh"]);
    expect(result).toMatchObject({ phase: "idle", captureAllowed: false });
  });

  it("rejects current and integrated modes before any producer mutation", async () => {
    const events = [];
    const adapter = createAdapter(events);
    const controller = createRaymarchAuditFixtureController({ adapter });
    const base = await createDescriptor();
    const current = await createDescriptor({
      checkpoint: { mode: "current", decisionManifestSha256: null },
      transport: {
        mode: "current",
        apparatusIdentity: "apparatus-v1",
        cacheIdentity: "cache-v1",
        expectedDispatchCount: 1,
        prototype: null,
      },
      output: {
        ...base.output,
        aovIdentities: [
          "baseRadiance",
          "transmittance",
          "coverage",
          "accentRadiance",
        ],
      },
    });

    await expect(controller.install(current)).rejects.toThrow(
      "current checkpoint is not enabled",
    );
    expect(events).toEqual([]);
  });

  it("builds a valid, install-ready base descriptor from plain runtime sources", async () => {
    const capacity = 2;
    const zeroSlots = new Array(capacity * 4).fill(0);
    const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const sources = {
      modal: {
        capacity,
        activeModeCount: 2,
        slots: new Float32Array([1, 2, 3, 0.8, 2, 3, 4, 0.4]),
        phaseSlots: zeroSlots,
        colorSlots: [1, 0.2, 0.1, 1, 0.1, 0.5, 1, 1],
        spectralLaneA: zeroSlots,
        spectralLaneB: zeroSlots,
        spectralMeta: zeroSlots,
        metadataSlots: zeroSlots,
      },
      phase: { evaluationTimeSec: 4.25, authority: 1 },
      domain: {
        radius: 3,
        boundaryMode: "rigid",
        cavityGeometry: "sphere",
        volumeShape: "sphere",
      },
      spectral: { enabled: true, colorMode: "spectral", spectralMix: 0.92 },
      camera: {
        viewMatrix: identityMatrix,
        projectionMatrix: identityMatrix,
        viewport: { width: 640, height: 480, dpr: 1 },
      },
      material: {
        holographicBaseRadianceGain: 0.25,
        densityGain: 1,
        absorption: 0.5,
        carrierCoreFwhmWorld: 0.024,
        contourSharpness: 1,
      },
      output: {
        volumeKernelIdentity: "safe-volumetric-emission-absorption/v1",
        stepControllerIdentity: "adaptive-error-half-step/v1",
        attachmentFormat: "rgba16float",
        aovIdentities: ["baseRadiance", "transmittance", "coverage"],
        width: 640,
        height: 480,
        raymarchSteps: 96,
      },
      post: {
        toneMapping: "agx",
        exposure: 1,
        bloomEnabled: false,
        opticalPsfEnabled: false,
      },
    };

    const built = await buildRaymarchAuditFixtureDescriptorFromSources(
      sources,
      { descriptorId: "front-frozen-v1", viewPreset: "front" },
    );

    expect(built.descriptor.kind).toBe("baryon-raymarch-audit-fixture/v1");
    expect(built.descriptor.checkpoint).toEqual({
      mode: "base",
      decisionManifestSha256: null,
    });
    expect(built.descriptor.transport.mode).toBe("off");
    expect(built.descriptor.material.laserAccentAuthority).toBe(0);
    expect(built.descriptor.modal.slots.sha256).toBe(
      await hashRaymarchAuditNumericArray([1, 2, 3, 0.8, 2, 3, 4, 0.4]),
    );
    const revalidated = await validateRaymarchAuditFixtureDescriptor(
      built.descriptor,
    );
    expect(revalidated.descriptorHash).toBe(built.descriptorHash);
  });

  it("builds a current-accent descriptor with transport identity and accent AOV", async () => {
    const capacity = 2;
    const zeroSlots = new Array(capacity * 4).fill(0);
    const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const sources = {
      modal: {
        capacity,
        activeModeCount: 2,
        slots: [1, 2, 3, 0.8, 2, 3, 4, 0.4],
        phaseSlots: zeroSlots,
        colorSlots: zeroSlots,
        spectralLaneA: zeroSlots,
        spectralLaneB: zeroSlots,
        spectralMeta: zeroSlots,
        metadataSlots: zeroSlots,
      },
      phase: { evaluationTimeSec: 4.25, authority: 1 },
      domain: {
        radius: 3,
        boundaryMode: "rigid",
        cavityGeometry: "sphere",
        volumeShape: "sphere",
      },
      transport: {
        apparatusIdentity: "acousto-optic-order-resolved-laser-irradiance",
        cacheIdentity: "acousto-optic/res64/rays48/sphere",
        expectedDispatchCount: 1,
      },
      spectral: { enabled: false, colorMode: "static", spectralMix: 0 },
      camera: {
        viewMatrix: identityMatrix,
        projectionMatrix: identityMatrix,
        viewport: { width: 640, height: 480, dpr: 1 },
      },
      material: {
        holographicBaseRadianceGain: 1,
        densityGain: 1,
        absorption: 0.5,
        carrierCoreFwhmWorld: 0.024,
        contourSharpness: 1,
      },
      output: {
        volumeKernelIdentity: "safe-volumetric-emission-absorption/v1",
        stepControllerIdentity: "adaptive-error-half-step/v1",
        attachmentFormat: "rgba16float",
        aovIdentities: ["baseRadiance", "transmittance", "coverage"],
        width: 640,
        height: 480,
        raymarchSteps: 96,
      },
      post: {
        toneMapping: "agx",
        exposure: 1,
        bloomEnabled: false,
        opticalPsfEnabled: false,
      },
    };

    const built = await buildRaymarchAuditFixtureDescriptorFromSources(
      sources,
      { descriptorId: "current-front-v1", checkpointMode: "current" },
    );

    expect(built.descriptor.checkpoint.mode).toBe("current");
    expect(built.descriptor.transport).toEqual({
      mode: "current",
      apparatusIdentity: "acousto-optic-order-resolved-laser-irradiance",
      cacheIdentity: "acousto-optic/res64/rays48/sphere",
      expectedDispatchCount: 1,
      prototype: null,
    });
    expect(built.descriptor.material.laserAccentAuthority).toBe(1);
    expect(built.descriptor.output.aovIdentities).toEqual([
      "baseRadiance",
      "transmittance",
      "coverage",
      "accentRadiance",
    ]);
  });

  it("rejects source records that cannot produce a legal base descriptor", async () => {
    await expect(
      buildRaymarchAuditFixtureDescriptorFromSources(
        { modal: {} },
        { descriptorId: "front-frozen-v1" },
      ),
    ).rejects.toThrow("must be an array of numbers");
    await expect(
      buildRaymarchAuditFixtureDescriptorFromSources(null, {
        descriptorId: "front-frozen-v1",
      }),
    ).rejects.toThrow("sources must be a plain object");
  });
});
