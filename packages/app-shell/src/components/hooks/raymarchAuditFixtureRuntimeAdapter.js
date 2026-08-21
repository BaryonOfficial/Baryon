import * as THREE from "three";
import {
  CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_EMISSION_COEFFICIENT,
  CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
  CYMATIC_PLASMA_RADIANCE_GAIN,
} from "@baryon/engine/core/raymarch/cymaticPlasmaTransfer";
import { CYMATIC_OBSERVER_REFERENCE } from "@baryon/engine/core/raymarch/cymaticObserverReference";
import {
  deriveSpectralSeedDirection,
} from "@baryon/engine/utils/audio/spectralPhase";
import {
  CHECKPOINT_AOV_MODES,
  CHECKPOINT_PRODUCTION_IDENTITIES,
  createCaptureOutputSession,
  syncRenderOutputBloomUniforms,
  syncRenderOutputNodeTopology,
} from "@baryon/engine/render/outputPipeline";

export const RAYMARCH_AUDIT_FIXTURE_RUNTIME_ADAPTER_KEY =
  "__baryonRaymarchAuditFixtureRuntimeAdapter";

const FIXTURE_READY_TIMEOUT_MS = 12_000;
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

function createFixtureFeatureFrame(
  descriptor,
  { frameId, topologyRevision, basisIdentityHash },
) {
  const identitySlots = toFloat32(descriptor.modal.identitySlots);
  const coefficientSlots = toFloat32(descriptor.modal.coefficientSlots);
  const phaseSlots = toFloat32(descriptor.modal.phaseSlots);
  const spectralMomentSlots = toFloat32(descriptor.modal.spectralMomentSlots);
  const metadataSlots = toFloat32(descriptor.modal.metadataSlots);
  let projectedRenderEnergy = 0;
  let amplitudeTotal = 0;
  for (let index = 0; index < descriptor.modal.activeModeCount; index += 1) {
    const amplitude = Math.max(0, coefficientSlots[index] ?? 0);
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
    },
    diagnostics: {
      descriptorOverflow: false,
      modeIdentityRetentionRatio: 1,
      phaseAuthorityModeCount: activeModeCount,
      modalVarietyAudit: null,
    },
    slotViews: {
      modalIdentitySlots: identitySlots,
      modalCoefficientSlots: coefficientSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldSpectralMomentSlots: spectralMomentSlots,
      modalFieldMetadataSlots: metadataSlots,
    },
  };

  return Object.freeze({
    frameId,
    topologyRevision,
    basisIdentityHash,
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
    modalIdentitySlots: identitySlots,
    modalCoefficientSlots: coefficientSlots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldSpectralMomentSlots: spectralMomentSlots,
    modalFieldSpectralSeedDirection: new Float32Array(
      deriveSpectralSeedDirection(
        Array.from({ length: activeModeCount }, (_, index) => {
          const offset = index * 4;
          return {
            naturalFrequencyHz: metadataSlots[offset],
            responseFrequencyHz: metadataSlots[offset + 2],
          };
        }),
      ),
    ),
    modalFieldMetadataSlots: metadataSlots,
    activeModeCount,
    activeModalFieldModeCount: activeModeCount,
    modalPhaseAuthority: descriptor.phase.authority,
    observationTimeSeconds: descriptor.phase.evaluationTimeSec,
    observationAdvancing: false,
    observationPaused: true,
    observationSessionKey: `fixture:${descriptor.descriptorId}`,
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
  const uploadState = runtimeState.raymarchUploadState;
  return {
    descriptorHash: state.descriptorHash,
    modalGeneration: uploadState?.basisPlan?.revision ?? 0,
    fieldGeneration: uploadState?.counters?.driveUpdateCount ?? 0,
    spectralGeneration: uploadState?.basisPlan?.revision ?? 0,
    transportGeneration: null,
    aovGeneration: state.aovGeneration,
    kernelIdentity: state.descriptor.output.volumeKernelIdentity,
    transportDispatchCount: 0,
    producerEpoch: state.producerEpoch,
    phaseEvaluationTimeSec:
      runtimeState.modalPhaseEvaluationEpochSec ??
      state.descriptor.phase.evaluationTimeSec,
  };
}

function fixtureIsReady(state, runtimeState) {
  if (
    !runtimeState.volumeMesh?.visible ||
    !(runtimeState.uniforms?.uModalFieldModeCount?.value > 0) ||
    !runtimeState.raymarchUploadState?.basisPlan ||
    !runtimeState.raymarchUploadState?.driveFrame ||
    state.aovGeneration <= 0
  ) {
    return false;
  }
  return true;
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
  runtimeState.auditFixtureBaseOnly = descriptor.checkpoint.mode === "base";
  runtimeState.baseDensityGain = descriptor.material.densityGain;
  uniforms.uDensityGain.value = descriptor.material.densityGain;
  if (
    Math.abs(
      descriptor.material.plasmaExtinctionCoefficient -
        CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
    ) > 1e-12
  ) {
    throw new Error(
      "Fixture plasma extinction does not match the production kernel.",
    );
  }
  if (
    Math.abs(
      descriptor.material.plasmaEmissionCoefficient -
        CYMATIC_PLASMA_EMISSION_COEFFICIENT,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.plasmaRadianceGain - CYMATIC_PLASMA_RADIANCE_GAIN,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.plasmaContinuitySpineRadiancePerExtinctionLimit -
        CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.plasmaDetailSpineRadiancePerExtinctionLimit -
        CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.plasmaBodyRadiancePerExtinctionLimit -
        CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.observerFineApertureFwhmWorld -
        CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.observerTopologyApertureFwhmWorld -
        CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.observerFineResidualScaleWorld -
        CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.observerFineResidualDetailLimit -
        CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit,
    ) > 1e-12 ||
    Math.abs(
      descriptor.material.observerSheetFwhmWorld -
        CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld,
    ) > 1e-12
  ) {
    throw new Error(
      "Fixture observer or plasma calibration does not match production.",
    );
  }
  // Base checkpoints isolate the canonical plasma base lane through the
  // baseRadiance AOV. No presentation gain or alternate material is installed.
  uniforms.uSpectralPresentationEnabled.value =
    descriptor.spectral.colorMode === "spectral" ? 1 : 0;
  uniforms.uSpectralChroma.value = descriptor.spectral.spectralChroma;
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
  syncBloomUniforms = syncRenderOutputBloomUniforms,
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
    fixtureFrameRevision: 0,
    producerEpoch: 0,
    authoritativeFrameSerial: 0,
    restoreRequiresFrameAfter: null,
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
      state.fixtureFrameRevision += 1;
      state.featureFrame = createFixtureFeatureFrame(descriptor, {
        frameId: state.fixtureFrameRevision,
        topologyRevision: state.fixtureFrameRevision,
        basisIdentityHash: descriptorHash,
      });
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
      // The authoritative descriptor carries immutable mode identities and
      // the current drive coefficients as separate canonical lanes.
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
        identitySlots: slotViews.modalIdentitySlots,
        coefficientSlots: slotViews.modalCoefficientSlots,
        phaseSlots: slotViews.modalFieldPhaseSlots,
        spectralMomentSlots: slotViews.modalFieldSpectralMomentSlots,
        metadataSlots: slotViews.modalFieldMetadataSlots,
      };
      const slotStrides = {
        identitySlots: 3,
        coefficientSlots: 1,
        phaseSlots: 4,
        spectralMomentSlots: 4,
        metadataSlots: 4,
      };
      // The shortest complete lane is the whole-set capacity this descriptor
      // can pin.
      let frameCapacity = runtimeCapacity;
      for (const [name, stride] of Object.entries(slotStrides)) {
        const values = modalArrays[name];
        if (!values || values.length < stride) {
          throw new Error(`The live modal descriptor has no ${name} view.`);
        }
        frameCapacity = Math.min(
          frameCapacity,
          Math.floor(values.length / stride),
        );
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
      const spectralPresentationEnabled =
        (uniforms.uSpectralPresentationEnabled?.value ?? 0) > 0;
      const spectralColorMode = spectralPresentationEnabled
        ? "spectral"
        : "static";
      const spectralChroma = uniforms.uSpectralChroma?.value ?? 1;
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
          identitySlots: Array.from(
            modalArrays.identitySlots.subarray(0, capacity * 3),
          ),
          coefficientSlots: Array.from(
            modalArrays.coefficientSlots.subarray(0, capacity),
          ),
          phaseSlots: sliceModalArray(modalArrays.phaseSlots),
          spectralMomentSlots: sliceModalArray(
            modalArrays.spectralMomentSlots,
          ),
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
          densityGain: uniforms.uDensityGain?.value,
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
        },
        spectral: {
          colorMode: spectralColorMode,
          spectralChroma,
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
          apparatusIdentity: "analytic-weak-deflection-volumetric-cymascope",
          cacheIdentity: null,
          expectedDispatchCount: 0,
        },
        transportDispatchCount: 0,
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
        syncBloomUniforms(postNodesRef.current, { enabled: false });
        syncOutputTopology(pipeline, postNodesRef.current, {
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
