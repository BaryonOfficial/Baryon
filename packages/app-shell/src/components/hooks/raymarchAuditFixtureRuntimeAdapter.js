import * as THREE from "three";
import { REFERENCE_ABSORPTION_COEFFICIENT } from "@baryon/engine/core/raymarch/observationTransfer";
import {
  CHECKPOINT_AOV_MODES,
  CHECKPOINT_PRODUCTION_IDENTITIES,
  createCaptureOutputSession,
  syncRenderOutputNodeTopology,
} from "@baryon/engine/render/outputPipeline";

export const RAYMARCH_AUDIT_FIXTURE_RUNTIME_ADAPTER_KEY =
  "__baryonRaymarchAuditFixtureRuntimeAdapter";

const FIXTURE_READY_TIMEOUT_MS = 12_000;
// v1 frozen descriptors stored the former public Absorption setting, whose
// shipped value 4 mapped linearly to the physical reference coefficient.
const LEGACY_FIXTURE_ABSORPTION_REFERENCE = 4;

function legacyFixtureAbsorptionToCoefficient(value) {
  return (
    Math.max(0, value) *
    (REFERENCE_ABSORPTION_COEFFICIENT / LEGACY_FIXTURE_ABSORPTION_REFERENCE)
  );
}

function coefficientToLegacyFixtureAbsorption(value) {
  return (
    Math.max(0, value) *
    (LEGACY_FIXTURE_ABSORPTION_REFERENCE / REFERENCE_ABSORPTION_COEFFICIENT)
  );
}

function cloneCameraState(camera) {
  return {
    matrixAutoUpdate: camera.matrixAutoUpdate,
    matrix: camera.matrix.clone(),
    matrixWorld: camera.matrixWorld.clone(),
    matrixWorldInverse: camera.matrixWorldInverse.clone(),
    projectionMatrix: camera.projectionMatrix.clone(),
    projectionMatrixInverse: camera.projectionMatrixInverse.clone(),
  };
}

function restoreCameraState(camera, snapshot) {
  camera.matrixAutoUpdate = snapshot.matrixAutoUpdate;
  camera.matrix.copy(snapshot.matrix);
  camera.matrixWorld.copy(snapshot.matrixWorld);
  camera.matrixWorldInverse.copy(snapshot.matrixWorldInverse);
  camera.projectionMatrix.copy(snapshot.projectionMatrix);
  camera.projectionMatrixInverse.copy(snapshot.projectionMatrixInverse);
  camera.matrixWorld.decompose(
    camera.position,
    camera.quaternion,
    camera.scale,
  );
  camera.updateMatrixWorld(true);
}

function applyFixtureCamera(camera, descriptor) {
  const viewMatrix = new THREE.Matrix4().fromArray(
    descriptor.camera.viewMatrix.values,
  );
  const worldMatrix = viewMatrix.clone().invert();
  camera.matrixAutoUpdate = false;
  camera.matrixWorld.copy(worldMatrix);
  camera.matrix.copy(worldMatrix);
  camera.matrixWorldInverse.copy(viewMatrix);
  camera.projectionMatrix.fromArray(descriptor.camera.projectionMatrix.values);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  worldMatrix.decompose(camera.position, camera.quaternion, camera.scale);
}

function toFloat32(numericArray) {
  return new Float32Array(numericArray.values);
}

function createFixtureFeatureFrame(descriptor) {
  const slots = toFloat32(descriptor.modal.slots);
  const phaseSlots = toFloat32(descriptor.modal.phaseSlots);
  const colorSlots = toFloat32(descriptor.modal.colorSlots);
  const spectralLaneA = toFloat32(descriptor.modal.spectralLaneA);
  const spectralLaneB = toFloat32(descriptor.modal.spectralLaneB);
  const spectralMeta = toFloat32(descriptor.modal.spectralMeta);
  const metadataSlots = toFloat32(descriptor.modal.metadataSlots);
  let projectedRenderEnergy = 0;
  let amplitudeTotal = 0;
  for (let index = 0; index < descriptor.modal.activeModeCount; index += 1) {
    const amplitude = Math.max(0, slots[index * 4 + 3] ?? 0);
    amplitudeTotal += amplitude;
    projectedRenderEnergy += amplitude * amplitude;
  }
  const capacity = descriptor.modal.capacity;
  const activeModeCount = descriptor.modal.activeModeCount;
  const modalDescriptor = {
    fieldAuthority: descriptor.modal.fieldAuthority,
    counts: {
      modalFieldModeCount: activeModeCount,
      validModeCount: activeModeCount,
      overflowModeCount: 0,
    },
    capacity: {
      maxTotalModes: capacity,
      basisAtlasPageCapacity: capacity,
    },
    diagnostics: {
      descriptorOverflow: false,
      modeIdentityRetentionRatio: 1,
      phaseAuthorityModeCount: activeModeCount,
      modalVarietyAudit: null,
    },
    slotViews: {
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldColorSlots: colorSlots,
      modalFieldSpectralLaneA: spectralLaneA,
      modalFieldSpectralLaneB: spectralLaneB,
      modalFieldSpectralMeta: spectralMeta,
      modalFieldMetadataSlots: metadataSlots,
    },
  };

  return Object.freeze({
    fieldState: "active",
    renderAuthority: true,
    sourceEvidence: {
      currentSourceEvidence: false,
      sourceBoundaryState: "fixture",
    },
    energyLedger: {
      projectedRenderEnergy,
      renderEnergyEpsilon: 1e-6,
    },
    modalDescriptor,
    modalFieldSlots: slots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldColorSlots: colorSlots,
    modalFieldSpectralLaneA: spectralLaneA,
    modalFieldSpectralLaneB: spectralLaneB,
    modalFieldSpectralMeta: spectralMeta,
    modalFieldMetadataSlots: metadataSlots,
    activeModeCount,
    activeModalFieldModeCount: activeModeCount,
    modalPhaseAuthority: descriptor.phase.authority,
    averageAmplitude: amplitudeTotal / Math.max(1, activeModeCount),
    modalResponseEnergy: Math.max(projectedRenderEnergy, 1e-5),
    observationEnergy: projectedRenderEnergy,
    structureSignal: 1,
    energySignal: 1,
    changeSignal: 0,
    pulseSignal: 0,
    bandEnergies: new Float32Array([1, 0, 0, 0]),
  });
}

function waitFor(predicate, timeoutMessage) {
  const startedAt = performance.now();
  const schedulePoll =
    globalThis.requestAnimationFrame ??
    ((callback) => globalThis.setTimeout(callback, 0));
  return new Promise((resolve, reject) => {
    const poll = () => {
      try {
        const result = predicate();
        if (result) {
          resolve(result);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (performance.now() - startedAt >= FIXTURE_READY_TIMEOUT_MS) {
        reject(new Error(timeoutMessage));
        return;
      }
      schedulePoll(poll);
    };
    poll();
  });
}

function snapshotFixtureSeal(state, runtimeState) {
  return {
    descriptorHash: state.descriptorHash,
    modalGeneration: Math.max(
      0,
      Math.floor(runtimeState.activeModalRenderPacket?.generationId ?? 0),
    ),
    fieldGeneration: Math.max(
      0,
      Math.floor(runtimeState.liveFieldProjectionCache?.generation ?? 0),
    ),
    spectralGeneration: Math.max(
      0,
      Math.floor(runtimeState.spectralLaneCache?.generation ?? 0),
    ),
    transportGeneration: null,
    aovGeneration: state.aovGeneration,
    kernelIdentity: state.descriptor.output.volumeKernelIdentity,
    transportDispatchCount: Math.max(
      0,
      Math.floor(runtimeState.laserTransportCache?.dispatchCount ?? 0),
    ),
    producerEpoch: state.producerEpoch,
    phaseEvaluationTimeSec:
      runtimeState.modalPhaseEvaluationEpochSec ??
      state.descriptor.phase.evaluationTimeSec,
  };
}

function fixtureIsReady(state, runtimeState) {
  if (
    !runtimeState.volumeMesh?.visible ||
    runtimeState.modalBasisCache?.ready !== true ||
    runtimeState.liveFieldProjectionCache?.ready !== true ||
    !runtimeState.activeModalRenderPacket ||
    state.aovGeneration <= 0
  ) {
    return false;
  }
  if (
    state.descriptor.spectral.enabled &&
    runtimeState.spectralLaneCache?.ready !== true
  ) {
    return false;
  }
  if (state.descriptor.checkpoint.mode === "current") {
    // The current-accent checkpoint uses the existing transport owner; the
    // fixture field commit may dispatch it once, after which the seal pins
    // the count.
    return (
      runtimeState.laserTransportCache?.active === true &&
      runtimeState.laserTransportCache?.ready === true
    );
  }
  return (
    (runtimeState.laserTransportCache?.dispatchCount ?? 0) ===
    state.transportDispatchCountAtInstall
  );
}

function applyFixtureMaterial(runtimeState, descriptor) {
  const uniforms = runtimeState.uniforms;
  const radius = uniforms.uRadius?.value;
  if (Math.abs(radius - descriptor.domain.radius) > 1e-9) {
    throw new Error("Fixture domain radius does not match the active runtime.");
  }
  if (
    runtimeState.effectiveCavityGeometry !== descriptor.domain.cavityGeometry
  ) {
    throw new Error(
      "Fixture cavity geometry does not match the active runtime.",
    );
  }
  if (
    runtimeState.volumeMesh?.userData?.raymarchVolumeShape !==
    descriptor.domain.volumeShape
  ) {
    throw new Error("Fixture volume shape does not match the active runtime.");
  }
  const baseOnlyCheckpoint = descriptor.checkpoint.mode === "base";
  runtimeState.auditFixtureBaseOnly = baseOnlyCheckpoint;
  runtimeState.baseDensityGain = descriptor.material.densityGain;
  uniforms.uDensityGain.value = descriptor.material.densityGain;
  uniforms.uMaterialAbsorptionCoefficient.value =
    legacyFixtureAbsorptionToCoefficient(descriptor.material.absorption);
  uniforms.uCarrierCoreFwhmWorld.value =
    descriptor.material.carrierCoreFwhmWorld;
  uniforms.uContourSharpness.value = descriptor.material.contourSharpness;
  uniforms.uHolographicBaseRadianceGain.value =
    descriptor.material.holographicBaseRadianceGain;
  if (baseOnlyCheckpoint) {
    uniforms.uLaserCausticActive.value = 0;
  }
  uniforms.uSpectralMix.value = descriptor.spectral.spectralMix;
  runtimeState.spectralLight.colorMode = descriptor.spectral.colorMode;
  runtimeState.spectralLight.spectralMix = descriptor.spectral.spectralMix;
  runtimeState.requestedRaymarchSteps = descriptor.output.raymarchSteps;
  runtimeState.effectiveRaymarchSteps = descriptor.output.raymarchSteps;
  runtimeState.volumeMesh.material.steps = descriptor.output.raymarchSteps;
  uniforms.uRaymarchSteps.value = descriptor.output.raymarchSteps;
}

export function createRaymarchAuditFixtureRuntimeDriver({
  camera,
  scene,
  gl,
  runtimeRef,
  runtimeStateRef,
  controlsRef,
  renderProfileRef,
  postNodesRef,
  ensurePipeline,
  invalidate,
  restoreControls,
  createCaptureSession = createCaptureOutputSession,
  syncOutputTopology = syncRenderOutputNodeTopology,
}) {
  const state = {
    suspended: false,
    descriptor: null,
    descriptorHash: null,
    featureFrame: null,
    ready: false,
    installError: null,
    captureSession: null,
    aovGeneration: 0,
    producerEpoch: 0,
    authoritativeFrameSerial: 0,
    restoreRequiresFrameAfter: null,
    transportDispatchCountAtInstall: 0,
    lastAuthoritativeFeatureFrame: null,
  };

  function disposeCaptureSession() {
    state.captureSession?.dispose?.();
    state.captureSession = null;
    state.aovGeneration = 0;
  }

  const adapter = {
    async snapshotCanonicalState() {
      const runtimeState = runtimeStateRef.current;
      if (!runtimeState)
        throw new Error("The active raymarch runtime is unavailable.");
      return {
        controls: { ...controlsRef.current },
        camera: cloneCameraState(camera),
        authoritativeFrameSerial: state.authoritativeFrameSerial,
        baseDensityGain: runtimeState.baseDensityGain,
        baseCarrierCoreFwhmWorld: runtimeState.baseCarrierCoreFwhmWorld,
        spectralLight: { ...runtimeState.spectralLight },
        rendererExposure: gl.toneMappingExposure,
      };
    },
    async suspendProducers() {
      state.suspended = true;
      state.producerEpoch += 1;
    },
    async installDescriptor({ descriptor, descriptorHash }) {
      const runtimeState = runtimeStateRef.current;
      if (!runtimeState)
        throw new Error("The active raymarch runtime is unavailable.");
      if (descriptor.modal.capacity > runtimeState.modalFieldCapacity) {
        throw new Error(
          "Fixture modal capacity exceeds the active runtime capacity.",
        );
      }
      state.descriptor = descriptor;
      state.descriptorHash = descriptorHash;
      state.featureFrame = createFixtureFeatureFrame(descriptor);
      state.transportDispatchCountAtInstall = Math.max(
        0,
        Math.floor(runtimeState.laserTransportCache?.dispatchCount ?? 0),
      );
      applyFixtureCamera(camera, descriptor);
      gl.toneMappingExposure = descriptor.post.exposure;
      state.ready = false;
      state.installError = null;
      invalidate();
    },
    async awaitCheckpointReady() {
      await waitFor(() => {
        if (state.installError) throw state.installError;
        return state.ready;
      }, "Timed out waiting for the production base checkpoint and AOVs.");
      return { ready: true };
    },
    async readSeal() {
      return snapshotFixtureSeal(state, runtimeStateRef.current);
    },
    async readCurrentSeal() {
      return snapshotFixtureSeal(state, runtimeStateRef.current);
    },
    async exportBuffers() {
      if (!state.captureSession) {
        throw new Error("Fixture capture session is unavailable.");
      }
      state.captureSession.renderFrame();
      const [displayRgba, checkpointAovs] = await Promise.all([
        state.captureSession.readPixelsAsync(),
        state.captureSession.readCheckpointAovsAsync(),
      ]);
      return {
        descriptorId: state.descriptor.descriptorId,
        descriptorHash: state.descriptorHash,
        width: state.descriptor.output.width,
        height: state.descriptor.output.height,
        displayRgba,
        checkpointAovs,
      };
    },
    async clearFixtureState() {
      disposeCaptureSession();
      const runtimeState = runtimeStateRef.current;
      if (runtimeState) {
        runtimeState.auditFixtureBaseOnly = false;
      }
      state.descriptor = null;
      state.descriptorHash = null;
      state.featureFrame = null;
      state.ready = false;
      state.installError = null;
    },
    async restoreCanonicalState(snapshot) {
      restoreCameraState(camera, snapshot.camera);
      restoreControls(snapshot.controls);
      const runtimeState = runtimeStateRef.current;
      if (runtimeState) {
        runtimeState.baseDensityGain = snapshot.baseDensityGain;
        runtimeState.baseCarrierCoreFwhmWorld =
          snapshot.baseCarrierCoreFwhmWorld;
        runtimeState.spectralLight = { ...snapshot.spectralLight };
      }
      gl.toneMappingExposure = snapshot.rendererExposure;
      state.restoreRequiresFrameAfter = snapshot.authoritativeFrameSerial;
      state.suspended = false;
      state.producerEpoch += 1;
      invalidate();
    },
    async awaitFreshAuthoritativePacket() {
      await waitFor(
        () =>
          state.restoreRequiresFrameAfter === null ||
          state.authoritativeFrameSerial > state.restoreRequiresFrameAfter,
        "Timed out waiting for a fresh authoritative live packet after teardown.",
      );
      state.restoreRequiresFrameAfter = null;
    },
    // Plain-data record of the current live state for frozen-descriptor
    // assembly. Read-only: carries no fixture schema strings and mutates
    // nothing, so the DEV-only bridge owns descriptor semantics.
    async readFrozenDescriptorSources() {
      const runtimeState = runtimeStateRef.current;
      if (!runtimeState) {
        throw new Error("The active raymarch runtime is unavailable.");
      }
      const frame = state.lastAuthoritativeFeatureFrame;
      if (!frame) {
        throw new Error(
          "No authoritative live feature frame has been observed yet.",
        );
      }
      // The runtime's resolved descriptor carries the canonical joined slot
      // views regardless of whether the frame arrived pre-joined or as
      // separate identity and coefficient lanes.
      const currentModalDescriptor = runtimeState.currentModalDescriptor;
      if (currentModalDescriptor?.fieldAuthority !== "complete") {
        throw new Error(
          "The live modal field authority is not complete; a frozen descriptor cannot pin partial state.",
        );
      }
      const runtimeCapacity = Math.max(
        1,
        Math.floor(runtimeState.modalFieldCapacity ?? 0),
      );
      const slotViews = currentModalDescriptor.slotViews ?? {};
      const modalArrays = {
        slots: slotViews.modalFieldSlots,
        phaseSlots: slotViews.modalFieldPhaseSlots,
        colorSlots: slotViews.modalFieldColorSlots,
        spectralLaneA: slotViews.modalFieldSpectralLaneA,
        spectralLaneB: slotViews.modalFieldSpectralLaneB,
        spectralMeta: slotViews.modalFieldSpectralMeta,
        metadataSlots: slotViews.modalFieldMetadataSlots,
      };
      // Live views can carry arrays shorter than the runtime capacity; the
      // shortest array is the whole-set capacity this descriptor can pin.
      let frameCapacity = runtimeCapacity;
      for (const [name, values] of Object.entries(modalArrays)) {
        if (!values || values.length < 4) {
          throw new Error(
            `The live modal descriptor has no ${name} slot view.`,
          );
        }
        frameCapacity = Math.min(frameCapacity, Math.floor(values.length / 4));
      }
      const capacity = Math.max(1, frameCapacity);
      const elementCount = capacity * 4;
      const sliceModalArray = (values) =>
        Array.from(values.subarray(0, elementCount));
      const uniforms = runtimeState.uniforms;
      const volumeMesh = runtimeState.volumeMesh;
      // The display phase clock uniform is the authoritative evaluation time;
      // the rebase epoch is null whenever no phase layer upload is active.
      const phaseEvaluationTimeSec = Number.isFinite(
        uniforms.uPhaseEvaluationTime?.value,
      )
        ? uniforms.uPhaseEvaluationTime.value
        : (runtimeState.modalPhaseEvaluationEpochSec ?? 0);
      if (!Number.isFinite(phaseEvaluationTimeSec)) {
        throw new Error("The live modal phase evaluation time is unavailable.");
      }
      const spectralColorMode = runtimeState.spectralLight?.colorMode ?? "";
      const spectralMix = uniforms.uSpectralMix?.value ?? 0;
      const spectralEnabled =
        spectralColorMode === "spectral" && spectralMix > 0;
      const outputWidth = Math.max(1, Math.round(gl.domElement?.width ?? 0));
      const outputHeight = Math.max(1, Math.round(gl.domElement?.height ?? 0));

      return {
        modal: {
          capacity,
          activeModeCount: Math.min(
            capacity,
            Math.max(
              0,
              Math.floor(
                frame.activeModalFieldModeCount ?? frame.activeModeCount ?? 0,
              ),
            ),
          ),
          slots: sliceModalArray(modalArrays.slots),
          phaseSlots: sliceModalArray(modalArrays.phaseSlots),
          colorSlots: sliceModalArray(modalArrays.colorSlots),
          spectralLaneA: sliceModalArray(modalArrays.spectralLaneA),
          spectralLaneB: sliceModalArray(modalArrays.spectralLaneB),
          spectralMeta: sliceModalArray(modalArrays.spectralMeta),
          metadataSlots: sliceModalArray(modalArrays.metadataSlots),
        },
        phase: {
          evaluationTimeSec: phaseEvaluationTimeSec,
          authority: Math.min(1, Math.max(0, frame.modalPhaseAuthority ?? 0)),
        },
        domain: {
          radius: uniforms.uRadius?.value,
          boundaryMode: volumeMesh?.userData?.raymarchBoundaryMode,
          cavityGeometry: runtimeState.effectiveCavityGeometry,
          volumeShape: volumeMesh?.userData?.raymarchVolumeShape,
        },
        camera: {
          viewMatrix: Array.from(camera.matrixWorldInverse.elements),
          projectionMatrix: Array.from(camera.projectionMatrix.elements),
          viewport: {
            width: outputWidth,
            height: outputHeight,
            dpr: gl.getPixelRatio?.() ?? 1,
          },
        },
        material: {
          holographicBaseRadianceGain:
            uniforms.uHolographicBaseRadianceGain?.value,
          densityGain: uniforms.uDensityGain?.value,
          // Preserve the v1 descriptor boundary while production uses the
          // physical coefficient directly and exposes no Absorption control.
          absorption: coefficientToLegacyFixtureAbsorption(
            uniforms.uMaterialAbsorptionCoefficient?.value ??
              REFERENCE_ABSORPTION_COEFFICIENT,
          ),
          carrierCoreFwhmWorld: uniforms.uCarrierCoreFwhmWorld?.value,
          contourSharpness: uniforms.uContourSharpness?.value,
        },
        spectral: {
          enabled: spectralEnabled,
          colorMode: spectralColorMode,
          spectralMix: spectralEnabled ? spectralMix : 0,
        },
        output: {
          volumeKernelIdentity:
            CHECKPOINT_PRODUCTION_IDENTITIES.volumeKernelIdentity,
          stepControllerIdentity:
            CHECKPOINT_PRODUCTION_IDENTITIES.stepControllerIdentity,
          attachmentFormat: CHECKPOINT_PRODUCTION_IDENTITIES.attachmentFormat,
          aovIdentities: [
            ...CHECKPOINT_PRODUCTION_IDENTITIES.baseAovIdentities,
          ],
          width: outputWidth,
          height: outputHeight,
          raymarchSteps: Math.max(
            1,
            Math.round(runtimeState.effectiveRaymarchSteps ?? 1),
          ),
        },
        post: {
          toneMapping: String(gl.toneMapping),
          exposure: gl.toneMappingExposure,
          bloomEnabled: controlsRef.current?.bloomEnabled === true,
          opticalPsfEnabled: Boolean(postNodesRef.current?.opticalPsfPass),
        },
        transport: {
          apparatusIdentity: runtimeState.laserTransportCache?.semantic ?? null,
          cacheIdentity: runtimeState.laserTransportCache
            ? [
                runtimeState.laserTransportCache.semantic,
                `res${runtimeState.laserTransportCache.resolution}`,
                `rays${runtimeState.laserTransportCache.rayGridSize}`,
                runtimeState.laserTransportCache.volumeShape,
              ].join("/")
            : null,
          // Refracting the pinned fixture field permits exactly one
          // dispatch during install; the seal pins the count afterwards.
          expectedDispatchCount: 1,
        },
        transportDispatchCount: Math.max(
          0,
          Math.floor(runtimeState.laserTransportCache?.dispatchCount ?? 0),
        ),
      };
    },
  };

  function renderFixtureFrame() {
    if (!state.suspended) return false;
    if (!state.descriptor || !state.featureFrame) return true;
    const runtime = runtimeRef.current;
    const runtimeState = runtimeStateRef.current;
    if (!runtime || !runtimeState) return true;
    try {
      if (!state.ready) {
        applyFixtureMaterial(runtimeState, state.descriptor);
        runtime.tick({
          renderer: gl,
          runtimeState,
          featureFrame: state.featureFrame,
          time: state.descriptor.phase.evaluationTimeSec,
          deltaTime: 0,
        });
        if (!state.captureSession && runtimeState.volumeMesh?.visible) {
          state.captureSession = createCaptureSession(
            gl,
            scene,
            camera,
            state.descriptor.output.width,
            state.descriptor.output.height,
            {
              renderProfile: renderProfileRef.current,
              checkpointAovMode:
                state.descriptor.checkpoint.mode === "current"
                  ? CHECKPOINT_AOV_MODES.current
                  : CHECKPOINT_AOV_MODES.base,
            },
          );
          if (state.captureSession) {
            state.aovGeneration += 1;
            state.captureSession.renderFrame();
          }
        }
        state.ready = fixtureIsReady(state, runtimeState);
      }
      const pipeline = ensurePipeline();
      if (pipeline) {
        syncOutputTopology(pipeline, postNodesRef.current, {
          bloomEnabled: false,
          outputMode: controlsRef.current.outputMode,
          temporalHistoryEnabled: false,
          smaaEnabled: false,
        });
        gl.setRenderTarget?.(null);
        gl.setMRT?.(null);
        pipeline.render();
      }
      if (!state.ready) invalidate();
    } catch (error) {
      state.installError = error;
    }
    return true;
  }

  function observeAuthoritativeFrame(featureFrame) {
    if (!state.suspended && featureFrame?.renderAuthority !== false) {
      state.authoritativeFrameSerial += 1;
      if (featureFrame) {
        state.lastAuthoritativeFeatureFrame = featureFrame;
      }
    }
  }

  function dispose() {
    disposeCaptureSession();
    state.suspended = false;
  }

  return Object.freeze({
    adapter,
    renderFixtureFrame,
    observeAuthoritativeFrame,
    dispose,
  });
}
