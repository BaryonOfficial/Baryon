import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CYMATIC_OBSERVER_REFERENCE } from "@baryon/engine/core/raymarch/cymaticObserverReference";
import {
  CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_EMISSION_COEFFICIENT,
  CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
  CYMATIC_PLASMA_RADIANCE_GAIN,
} from "@baryon/engine/core/raymarch/cymaticPlasmaTransfer";
import { createRaymarchAuditFixtureRuntimeDriver } from "./raymarchAuditFixtureRuntimeAdapter.js";

function numericArray(values) {
  return { values, elementCount: values.length, sha256: "unused-by-adapter" };
}

function createDescriptor() {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const identitySlots = [1, 2, 3];
  const coefficientSlots = [0.8];
  const zero = [0, 0, 0, 0];
  return {
    descriptorId: "base-front-v1",
    checkpoint: { mode: "base" },
    modal: {
      fieldAuthority: "complete",
      activeModeCount: 1,
      capacity: 1,
      identitySlots: numericArray(identitySlots),
      coefficientSlots: numericArray(coefficientSlots),
      phaseSlots: numericArray(zero),
      spectralMomentSlots: numericArray([0.2, 0.6, 1, 1]),
      metadataSlots: numericArray(zero),
    },
    phase: { evaluationTimeSec: 2.5, authority: 1 },
    domain: {
      radius: 3,
      boundaryMode: "neumann",
      cavityGeometry: "rectangular",
      volumeShape: "sphere",
    },
    spectral: {
      colorMode: "static",
      spectralChroma: 0.42,
    },
    camera: {
      viewMatrix: numericArray(identity),
      projectionMatrix: numericArray(identity),
    },
    material: {
      densityGain: 1,
      plasmaRadianceGain: CYMATIC_PLASMA_RADIANCE_GAIN,
      plasmaExtinctionCoefficient: CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
      plasmaEmissionCoefficient: CYMATIC_PLASMA_EMISSION_COEFFICIENT,
      plasmaContinuitySpineRadiancePerExtinctionLimit:
        CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
      plasmaDetailSpineRadiancePerExtinctionLimit:
        CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
      plasmaBodyRadiancePerExtinctionLimit:
        CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
      observerFineApertureFwhmWorld:
        CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
      observerTopologyApertureFwhmWorld:
        CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
      observerFineResidualScaleWorld:
        CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld,
      observerFineResidualDetailLimit:
        CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit,
      observerSheetFwhmWorld: CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld,
      deterministicSeed: 0,
    },
    output: {
      width: 64,
      height: 64,
      raymarchSteps: 96,
      volumeKernelIdentity: "safe-volumetric-carrier-emission-extinction/v2",
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
      uSpectralPresentationEnabled: { value: 0 },
      uSpectralChroma: { value: 1 },
      uRaymarchSteps: { value: 64 },
      uModalFieldModeCount: { value: 0 },
    },
    baseDensityGain: 1,
  };
  const runtime = {
    // Mirrors what tickRaymarchRuntime + applyRaymarchModalPacketUploads leave
    // behind: a visible mesh, a phase epoch, a live analytic mode count, and a
    // committed basis and drive frames. fixtureIsReady gates the checkpoint on all
    // four, so a tick that sets only the first two never becomes ready.
    tick: vi.fn(({ runtimeState, time }) => {
      runtimeState.volumeMesh.visible = true;
      runtimeState.modalPhaseEvaluationEpochSec = time;
      runtimeState.uniforms.uModalFieldModeCount.value = 1;
      runtimeState.raymarchUploadState = {
        basisPlan: { revision: 1 },
        driveFrame: { activeCount: 1 },
        counters: { driveUpdateCount: 1 },
      };
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
    syncBloomUniforms: vi.fn(),
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
      expect.objectContaining({
        time: 2.5,
        deltaTime: 0,
        featureFrame: expect.objectContaining({
          observationTimeSeconds: 2.5,
          observationAdvancing: false,
          observationPaused: true,
          observationSessionKey: "fixture:base-front-v1",
          frameId: 1,
          topologyRevision: 1,
          basisIdentityHash: "descriptor-hash",
        }),
      }),
    );
    expect(harness.runtimeState).toMatchObject({
      auditFixtureBaseOnly: true,
      baseDensityGain: 1,
      uniforms: {
        uSpectralPresentationEnabled: { value: 0 },
        uSpectralChroma: { value: 0.42 },
      },
    });
    expect(harness.runtimeState).not.toHaveProperty("spectralPresentation");
    expect(harness.runtimeState.uniforms).not.toHaveProperty(
      "uHolographicBaseRadianceGain",
    );
    expect(await harness.driver.adapter.readSeal()).toMatchObject({
      descriptorHash: "descriptor-hash",
      // The analytic path dispatches no transport work at all.
      transportDispatchCount: 0,
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

  it("publishes fresh basis and drive revisions for every installed descriptor", async () => {
    const harness = createHarness();
    const firstDescriptor = createDescriptor();
    const secondDescriptor = createDescriptor();
    secondDescriptor.descriptorId = "base-side-v1";
    secondDescriptor.modal.identitySlots = numericArray([4, 5, 6]);

    await harness.driver.adapter.suspendProducers();
    await harness.driver.adapter.installDescriptor({
      descriptor: firstDescriptor,
      descriptorHash: "first-descriptor-hash",
    });
    harness.driver.renderFixtureFrame();
    const firstFrame = harness.runtime.tick.mock.calls.at(-1)[0].featureFrame;

    await harness.driver.adapter.installDescriptor({
      descriptor: secondDescriptor,
      descriptorHash: "second-descriptor-hash",
    });
    harness.driver.renderFixtureFrame();
    const secondFrame = harness.runtime.tick.mock.calls.at(-1)[0].featureFrame;

    expect(firstFrame).toMatchObject({
      frameId: 1,
      topologyRevision: 1,
      basisIdentityHash: "first-descriptor-hash",
    });
    expect(secondFrame).toMatchObject({
      frameId: 2,
      topologyRevision: 2,
      basisIdentityHash: "second-descriptor-hash",
    });
    expect(secondFrame.modalIdentitySlots).toEqual(new Float32Array([4, 5, 6]));
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
