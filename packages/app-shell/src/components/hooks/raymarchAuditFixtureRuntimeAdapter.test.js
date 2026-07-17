import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createRaymarchAuditFixtureRuntimeDriver } from "./raymarchAuditFixtureRuntimeAdapter.js";

function numericArray(values) {
  return { values, elementCount: values.length, sha256: "unused-by-adapter" };
}

function createDescriptor() {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const slots = [1, 2, 3, 0.8];
  const zero = [0, 0, 0, 0];
  return {
    descriptorId: "base-front-v1",
    checkpoint: { mode: "base" },
    modal: {
      fieldAuthority: "complete",
      activeModeCount: 1,
      capacity: 1,
      slots: numericArray(slots),
      phaseSlots: numericArray(zero),
      colorSlots: numericArray([0.2, 0.6, 1, 1]),
      spectralLaneA: numericArray(zero),
      spectralLaneB: numericArray(zero),
      spectralMeta: numericArray(zero),
      metadataSlots: numericArray(zero),
    },
    phase: { evaluationTimeSec: 2.5, authority: 1 },
    domain: {
      radius: 3,
      boundaryMode: "neumann",
      cavityGeometry: "rectangular",
      volumeShape: "sphere",
    },
    spectral: { enabled: false, colorMode: "static", spectralMix: 0 },
    camera: {
      viewMatrix: numericArray(identity),
      projectionMatrix: numericArray(identity),
    },
    material: {
      holographicBaseRadianceGain: 2 ** -8,
      densityGain: 1,
      absorption: 0.5,
      carrierCoreFwhmWorld: 0.024,
      contourSharpness: 8,
    },
    output: {
      width: 64,
      height: 64,
      raymarchSteps: 96,
      volumeKernelIdentity: "safe-volumetric-lighting-model/v1",
    },
    post: { exposure: 1 },
  };
}

function createHarness() {
  const camera = new THREE.PerspectiveCamera();
  const runtimeState = {
    modalFieldCapacity: 8,
    effectiveCavityGeometry: "rectangular",
    volumeMesh: {
      visible: false,
      material: { steps: 64 },
      userData: { raymarchVolumeShape: "sphere" },
    },
    uniforms: {
      uRadius: { value: 3 },
      uDensityGain: { value: 1 },
      uMaterialAbsorptionCoefficient: { value: 0.02 },
      uCarrierCoreFwhmWorld: { value: 0.024 },
      uContourSharpness: { value: 8 },
      uHolographicBaseRadianceGain: { value: 0 },
      uLaserCausticActive: { value: 1 },
      uSpectralMix: { value: 0 },
      uRaymarchSteps: { value: 64 },
    },
    modalBasisCache: { ready: false, generation: 3 },
    liveFieldProjectionCache: { ready: false, generation: 4 },
    spectralLaneCache: { ready: false, generation: 5 },
    laserTransportCache: { dispatchCount: 7 },
    spectralLight: { colorMode: "static", spectralMix: 0 },
    baseDensityGain: 1,
    baseCarrierCoreFwhmWorld: 0.024,
  };
  const runtime = {
    tick: vi.fn(({ runtimeState, time }) => {
      runtimeState.volumeMesh.visible = true;
      runtimeState.modalBasisCache.ready = true;
      runtimeState.liveFieldProjectionCache.ready = true;
      runtimeState.activeModalRenderPacket = { generationId: 8 };
      runtimeState.modalPhaseEvaluationEpochSec = time;
    }),
  };
  const captureSession = {
    renderFrame: vi.fn(),
    readPixelsAsync: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
    readCheckpointAovsAsync: vi.fn(async () => ({ baseRadiance: "aov" })),
    dispose: vi.fn(),
  };
  const pipeline = { render: vi.fn() };
  const gl = {
    toneMappingExposure: 1,
    setRenderTarget: vi.fn(),
    setMRT: vi.fn(),
  };
  const controlsRef = {
    current: { outputMode: "transparent", bloomEnabled: true },
  };
  const restoreControls = vi.fn();
  const driver = createRaymarchAuditFixtureRuntimeDriver({
    camera,
    scene: new THREE.Scene(),
    gl,
    runtimeRef: { current: runtime },
    runtimeStateRef: { current: runtimeState },
    controlsRef,
    renderProfileRef: { current: null },
    postNodesRef: { current: {} },
    ensurePipeline: () => pipeline,
    invalidate: vi.fn(),
    restoreControls,
    createCaptureSession: vi.fn(() => captureSession),
    syncOutputTopology: vi.fn(),
  });
  return {
    driver,
    runtime,
    runtimeState,
    captureSession,
    pipeline,
    restoreControls,
  };
}

describe("raymarch audit fixture runtime adapter", () => {
  it("pins the production runtime to a base-only descriptor and seals zero transport work", async () => {
    const harness = createHarness();
    const snapshot = await harness.driver.adapter.snapshotCanonicalState();
    await harness.driver.adapter.suspendProducers();
    await harness.driver.adapter.installDescriptor({
      descriptor: createDescriptor(),
      descriptorHash: "descriptor-hash",
    });

    expect(harness.driver.renderFixtureFrame()).toBe(true);
    await expect(
      harness.driver.adapter.awaitCheckpointReady(),
    ).resolves.toEqual({
      ready: true,
    });
    expect(harness.runtime.tick).toHaveBeenCalledWith(
      expect.objectContaining({ time: 2.5, deltaTime: 0 }),
    );
    expect(harness.runtimeState).toMatchObject({
      auditFixtureBaseOnly: true,
      baseDensityGain: 1,
    });
    expect(
      harness.runtimeState.uniforms.uHolographicBaseRadianceGain.value,
    ).toBe(2 ** -8);
    expect(await harness.driver.adapter.readSeal()).toMatchObject({
      descriptorHash: "descriptor-hash",
      transportDispatchCount: 7,
      phaseEvaluationTimeSec: 2.5,
      aovGeneration: 1,
    });

    const buffers = await harness.driver.adapter.exportBuffers();
    expect(buffers).toMatchObject({
      descriptorId: "base-front-v1",
      width: 64,
      height: 64,
      checkpointAovs: { baseRadiance: "aov" },
    });

    await harness.driver.adapter.clearFixtureState();
    await harness.driver.adapter.restoreCanonicalState(snapshot);
    expect(harness.restoreControls).toHaveBeenCalledWith(snapshot.controls);
  });

  it("does not consume ordinary authoritative frames while suspended", async () => {
    const harness = createHarness();
    harness.driver.observeAuthoritativeFrame({ renderAuthority: true });
    const snapshot = await harness.driver.adapter.snapshotCanonicalState();
    await harness.driver.adapter.suspendProducers();
    harness.driver.observeAuthoritativeFrame({ renderAuthority: true });
    await harness.driver.adapter.clearFixtureState();
    await harness.driver.adapter.restoreCanonicalState(snapshot);

    const waitForFresh = harness.driver.adapter.awaitFreshAuthoritativePacket();
    harness.driver.observeAuthoritativeFrame({ renderAuthority: true });
    await expect(waitForFresh).resolves.toBeUndefined();
  });
});
