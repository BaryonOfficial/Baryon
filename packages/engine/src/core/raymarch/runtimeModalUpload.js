import { buildRaymarchFieldAnalysis } from "./fieldAnalysis.js";
import { deriveModalFieldCacheTransferAmplitude } from "./fieldCachePassband.js";
import {
  prepareRadiationPotentialStaticPacket,
  writeRadiationPotentialDriveFrame,
} from "./radiationPotentialPacket.js";
import {
  getModalResponseFrequencyKey,
  getRectangularModeShellKey,
  resolveModalResponseInverseWavenumber,
  resolveModalResponseFrequencyHz,
} from "../modalShell.js";
import { assertRendererFeatureUploadContract } from "../../contracts/audioFeatureProtocol.js";

const MODAL_IDENTITY_COMPONENTS_PER_MODE = 3;
const MODAL_DESCRIPTOR_COMPONENTS_PER_MODE = 4;

export function resetRaymarchUploadState(runtimeState) {
  if (runtimeState) {
    runtimeState.raymarchUploadState = null;
    runtimeState.radiationPotentialCoefficientFrame = null;
  }
}

function getRaymarchUploadState(runtimeState) {
  if (!runtimeState.raymarchUploadState) {
    runtimeState.raymarchUploadState = {
      basisPlan: null,
      driveFrame: null,
      observedAmplitudes: new Float64Array(0),
      observedPhases: new Float64Array(0),
      counters: {
        basisCompileCount: 0,
        driveUpdateCount: 0,
        coefficientUploadCount: 0,
      },
    };
  }

  return runtimeState.raymarchUploadState;
}

function markBufferForUpload(bufferNode) {
  if (bufferNode?.value) {
    bufferNode.value.needsUpdate = true;
  }
  bufferNode?.syncUniforms?.();
}

function getBufferArray(bufferNode) {
  return bufferNode?.value?.array ?? null;
}

function getBoundaryMode(runtimeState) {
  return runtimeState?.volumeMesh?.userData?.raymarchBoundaryMode ?? null;
}

function resolveBasisModeCount({ identitySlots, metadataSlots, capacity }) {
  return Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor(
      (identitySlots?.length ?? 0) / MODAL_IDENTITY_COMPONENTS_PER_MODE,
    ),
    Math.floor(
      (metadataSlots?.length ?? 0) / MODAL_DESCRIPTOR_COMPONENTS_PER_MODE,
    ),
  );
}

function readModeIdentity(identitySlots, modeIndex, componentIndex) {
  return (
    identitySlots?.[
      modeIndex * MODAL_IDENTITY_COMPONENTS_PER_MODE + componentIndex
    ] ?? 0
  );
}

function readModeMetadata(metadataSlots, modeIndex, componentIndex) {
  return (
    metadataSlots?.[
      modeIndex * MODAL_DESCRIPTOR_COMPONENTS_PER_MODE + componentIndex
    ] ?? 0
  );
}

function buildModalResponseUploadOrder({
  identitySlots,
  metadataSlots,
  modeCount,
}) {
  const order = Array.from({ length: modeCount }, (_, index) => index);
  order.sort((leftIndex, rightIndex) => {
    const leftResponseFrequencyHz = resolveModalResponseFrequencyHz({
      naturalFrequencyHz: readModeMetadata(metadataSlots, leftIndex, 0),
      responseFrequencyHz: readModeMetadata(metadataSlots, leftIndex, 2),
    });
    const rightResponseFrequencyHz = resolveModalResponseFrequencyHz({
      naturalFrequencyHz: readModeMetadata(metadataSlots, rightIndex, 0),
      responseFrequencyHz: readModeMetadata(metadataSlots, rightIndex, 2),
    });
    const frequencyDelta = leftResponseFrequencyHz - rightResponseFrequencyHz;
    if (frequencyDelta !== 0) {
      return frequencyDelta;
    }
    const shellDelta =
      Number.parseInt(
        getRectangularModeShellKey({
          u: readModeIdentity(identitySlots, leftIndex, 0),
          v: readModeIdentity(identitySlots, leftIndex, 1),
          w: readModeIdentity(identitySlots, leftIndex, 2),
        }).slice(5),
        10,
      ) -
      Number.parseInt(
        getRectangularModeShellKey({
          u: readModeIdentity(identitySlots, rightIndex, 0),
          v: readModeIdentity(identitySlots, rightIndex, 1),
          w: readModeIdentity(identitySlots, rightIndex, 2),
        }).slice(5),
        10,
      );
    return (
      shellDelta ||
      readModeIdentity(identitySlots, leftIndex, 0) -
        readModeIdentity(identitySlots, rightIndex, 0) ||
      readModeIdentity(identitySlots, leftIndex, 1) -
        readModeIdentity(identitySlots, rightIndex, 1) ||
      readModeIdentity(identitySlots, leftIndex, 2) -
        readModeIdentity(identitySlots, rightIndex, 2)
    );
  });
  return Uint32Array.from(order);
}

function basisPlanMatches(
  plan,
  {
    sourceGeneration,
    workerGeneration,
    topologyRevision,
    basisIdentityHash,
    apparatusIdentity,
    modeTarget,
    responseTarget,
    spectralMomentTarget,
    coefficientTarget,
    capacity,
  },
) {
  return (
    plan &&
    plan.sourceGeneration === sourceGeneration &&
    plan.workerGeneration === workerGeneration &&
    plan.topologyRevision === topologyRevision &&
    plan.basisIdentityHash === basisIdentityHash &&
    plan.apparatusIdentity === apparatusIdentity &&
    plan.modeTarget === modeTarget &&
    plan.responseTarget === responseTarget &&
    plan.spectralMomentTarget === spectralMomentTarget &&
    plan.coefficientTarget === coefficientTarget &&
    plan.capacity === capacity
  );
}

function copyCompiledStaticPayload({
  sourceIndices,
  identitySlots,
  metadataSlots,
  spectralMomentSlots,
  modeTarget,
  responseTarget,
  spectralMomentTarget,
  coefficientTarget,
  boundaryMode,
  modeCount,
}) {
  modeTarget?.fill?.(0);
  responseTarget?.fill?.(0);
  spectralMomentTarget?.fill?.(0);

  for (let uploadIndex = 0; uploadIndex < modeCount; uploadIndex += 1) {
    const sourceIndex = sourceIndices[uploadIndex];
    const identityOffset = sourceIndex * MODAL_IDENTITY_COMPONENTS_PER_MODE;
    const descriptorOffset = sourceIndex * MODAL_DESCRIPTOR_COMPONENTS_PER_MODE;
    const uploadOffset = uploadIndex * MODAL_DESCRIPTOR_COMPONENTS_PER_MODE;

    modeTarget[uploadOffset] = identitySlots?.[identityOffset] ?? 0;
    modeTarget[uploadOffset + 1] = identitySlots?.[identityOffset + 1] ?? 0;
    modeTarget[uploadOffset + 2] = identitySlots?.[identityOffset + 2] ?? 0;
    modeTarget[uploadOffset + 3] = 1;

    if (spectralMomentTarget) {
      spectralMomentTarget[uploadOffset] =
        spectralMomentSlots?.[descriptorOffset] ?? 0;
      spectralMomentTarget[uploadOffset + 1] =
        spectralMomentSlots?.[descriptorOffset + 1] ?? 0;
      spectralMomentTarget[uploadOffset + 2] =
        spectralMomentSlots?.[descriptorOffset + 2] ?? 0;
      spectralMomentTarget[uploadOffset + 3] =
        spectralMomentSlots?.[descriptorOffset + 3] ?? 0;
    }

    const naturalFrequencyHz = metadataSlots?.[descriptorOffset] ?? 0;
    const responseFrequencyHz = metadataSlots?.[descriptorOffset + 2] ?? 0;
    const resolvedResponseFrequencyHz = resolveModalResponseFrequencyHz({
      naturalFrequencyHz,
      responseFrequencyHz,
    });
    responseTarget[uploadOffset + 3] = resolveModalResponseInverseWavenumber({
      mode: {
        u: modeTarget[uploadOffset],
        v: modeTarget[uploadOffset + 1],
        w: modeTarget[uploadOffset + 2],
        naturalFrequencyHz,
        responseFrequencyHz: resolvedResponseFrequencyHz,
      },
    });

    let shellContinues = false;
    if (uploadIndex + 1 < modeCount) {
      const nextSourceIndex = sourceIndices[uploadIndex + 1];
      shellContinues =
        getModalResponseFrequencyKey({
          naturalFrequencyHz,
          responseFrequencyHz,
        }) ===
        getModalResponseFrequencyKey({
          naturalFrequencyHz: readModeMetadata(
            metadataSlots,
            nextSourceIndex,
            0,
          ),
          responseFrequencyHz: readModeMetadata(
            metadataSlots,
            nextSourceIndex,
            2,
          ),
        });
    }
    responseTarget[uploadOffset + 1] = shellContinues ? 0 : 1;
  }

  prepareRadiationPotentialStaticPacket({
    target: coefficientTarget,
    modeSlots: modeTarget,
    boundaryMode,
    activeCount: modeCount,
  });
}

function compileModalBasisPlan({
  runtimeState,
  uploadState,
  featureFrame,
  descriptorSlots,
  productUploadCapacity,
  effectiveCavityGeometry,
}) {
  const identitySlots = descriptorSlots.modalIdentitySlots;
  const metadataSlots = descriptorSlots.modalFieldMetadataSlots;
  const spectralMomentSlots =
    descriptorSlots.modalFieldSpectralMomentSlots;
  const modeTarget = getBufferArray(runtimeState.modalFieldModeBuffer);
  const responseTarget = getBufferArray(runtimeState.modalFieldResponseBuffer);
  const spectralMomentTarget = getBufferArray(
    runtimeState.modalFieldSpectralMomentBuffer,
  );
  const coefficientTarget = getBufferArray(
    runtimeState.modalFieldCoefficientBuffer,
  );
  const capacity = Math.min(
    Math.max(0, Math.floor(productUploadCapacity ?? 0)),
    Math.floor((modeTarget?.length ?? 0) / 4),
    Math.floor((responseTarget?.length ?? 0) / 4),
    Math.floor((coefficientTarget?.length ?? 0) / 4),
  );
  const boundaryMode = getBoundaryMode(runtimeState);
  const apparatusIdentity = `${featureFrame.observationInputSignature ?? ""}|${effectiveCavityGeometry ?? "rectangular"}|${boundaryMode ?? ""}`;
  const topologyRevision = Math.max(
    0,
    Math.floor(featureFrame.topologyRevision ?? 0),
  );
  const basisIdentityHash = featureFrame.basisIdentityHash ?? null;
  const basisInputs = {
    sourceGeneration: featureFrame.sourceGeneration ?? null,
    workerGeneration: featureFrame.workerGeneration ?? null,
    topologyRevision,
    basisIdentityHash,
    apparatusIdentity,
    identitySlots,
    metadataSlots,
    spectralMomentSlots,
    modeTarget,
    responseTarget,
    spectralMomentTarget,
    coefficientTarget,
    capacity,
  };
  if (basisPlanMatches(uploadState.basisPlan, basisInputs)) {
    return uploadState.basisPlan;
  }

  const modeCount = resolveBasisModeCount({
    identitySlots,
    metadataSlots,
    capacity,
  });
  const sourceIndices = buildModalResponseUploadOrder({
    identitySlots,
    metadataSlots,
    modeCount,
  });
  const apertureTransfers = new Float64Array(modeCount);
  for (let uploadIndex = 0; uploadIndex < modeCount; uploadIndex += 1) {
    const sourceIndex = sourceIndices[uploadIndex];
    apertureTransfers[uploadIndex] = deriveModalFieldCacheTransferAmplitude(
      Math.hypot(
        readModeIdentity(identitySlots, sourceIndex, 0),
        readModeIdentity(identitySlots, sourceIndex, 1),
        readModeIdentity(identitySlots, sourceIndex, 2),
      ),
    );
  }

  copyCompiledStaticPayload({
    sourceIndices,
    identitySlots,
    metadataSlots,
    spectralMomentSlots,
    modeTarget,
    responseTarget,
    spectralMomentTarget,
    coefficientTarget,
    boundaryMode,
    modeCount,
  });
  markBufferForUpload(runtimeState.modalFieldModeBuffer);
  markBufferForUpload(runtimeState.modalFieldResponseBuffer);
  markBufferForUpload(runtimeState.modalFieldSpectralMomentBuffer);
  markBufferForUpload(runtimeState.modalFieldCoefficientBuffer);

  uploadState.counters.basisCompileCount += 1;
  uploadState.basisPlan = Object.freeze({
    ...basisInputs,
    boundaryMode,
    modeCount,
    sourceIndices,
    apertureTransfers,
    revision: uploadState.counters.basisCompileCount,
  });
  uploadState.driveFrame = null;
  return uploadState.basisPlan;
}

function driveFrameMatches(previous, featureFrame, basisPlan) {
  return (
    previous &&
    previous.basisPlan === basisPlan &&
    previous.frameId === featureFrame.frameId &&
    previous.timelineRevision === featureFrame.observationTimelineRevision &&
    previous.sourceGeneration === featureFrame.sourceGeneration &&
    previous.workerGeneration === featureFrame.workerGeneration
  );
}

function ensureDriveScratchCapacity(uploadState, modeCount) {
  if (uploadState.observedAmplitudes.length !== modeCount) {
    uploadState.observedAmplitudes = new Float64Array(modeCount);
    uploadState.observedPhases = new Float64Array(modeCount);
  }
}

function resolveDriveActiveModeCount(featureFrame, basisPlan, coefficients) {
  const declaredCount =
    featureFrame.activeModalFieldModeCount ??
    featureFrame.activeModeCount ??
    basisPlan.modeCount;
  return Math.min(
    basisPlan.modeCount,
    coefficients?.length ?? 0,
    Math.max(0, Math.floor(declaredCount)),
  );
}

function updateRaymarchFieldAnalysis({
  runtimeState,
  featureFrame,
  basisPlan,
  coefficients,
  sourceActiveCount,
  occupiedSlotSpan,
  effectiveCavityGeometry,
}) {
  const raymarchFieldAnalysis = buildRaymarchFieldAnalysis({
    modalIdentitySlots: basisPlan.identitySlots,
    modalCoefficientSlots: coefficients,
    activeModeCount: sourceActiveCount,
    modalFieldCapacity: basisPlan.capacity,
    featureFrame,
    cavityGeometry: effectiveCavityGeometry,
  });
  const modalFieldAnalysis = raymarchFieldAnalysis.modalField;
  modalFieldAnalysis.originalActiveCount = sourceActiveCount;
  modalFieldAnalysis.uploadedActiveCount = occupiedSlotSpan;
  modalFieldAnalysis.occupiedSlotSpan = occupiedSlotSpan;
  runtimeState.raymarchFieldAnalysis = raymarchFieldAnalysis;
  return modalFieldAnalysis;
}

function applyModalDriveFrame({
  runtimeState,
  uploadState,
  featureFrame,
  descriptorSlots,
  basisPlan,
  effectiveCavityGeometry,
}) {
  const coefficients =
    featureFrame.modalCoefficientSlots ??
    descriptorSlots.modalCoefficientSlots ??
    null;
  const phases =
    featureFrame.modalFieldPhaseSlots ??
    descriptorSlots.modalFieldPhaseSlots ??
    null;
  if (driveFrameMatches(uploadState.driveFrame, featureFrame, basisPlan)) {
    return uploadState.driveFrame;
  }

  ensureDriveScratchCapacity(uploadState, basisPlan.modeCount);
  const sourceActiveCount = resolveDriveActiveModeCount(
    featureFrame,
    basisPlan,
    coefficients,
  );
  let occupiedSlotSpan = 0;
  for (
    let uploadIndex = 0;
    uploadIndex < basisPlan.modeCount;
    uploadIndex += 1
  ) {
    const sourceIndex = basisPlan.sourceIndices[uploadIndex];
    const sourceIsActive = sourceIndex < sourceActiveCount;
    if (sourceIsActive) {
      occupiedSlotSpan = uploadIndex + 1;
    }
    uploadState.observedAmplitudes[uploadIndex] =
      sourceIsActive
        ? (coefficients?.[sourceIndex] ?? 0) *
          basisPlan.apertureTransfers[uploadIndex]
        : 0;
    uploadState.observedPhases[uploadIndex] =
      sourceIsActive
        ? (phases?.[sourceIndex * MODAL_DESCRIPTOR_COMPONENTS_PER_MODE] ?? 0)
        : 0;
  }

  const potentialFrame = writeRadiationPotentialDriveFrame({
    target: basisPlan.coefficientTarget,
    imaginaryTarget: basisPlan.responseTarget,
    imaginaryComponentOffset: 2,
    amplitudes: uploadState.observedAmplitudes,
    phases: uploadState.observedPhases,
    activeCount: occupiedSlotSpan,
  });
  runtimeState.radiationPotentialCoefficientFrame = Object.freeze({
    activeCount: potentialFrame.activeCount,
    observedCoefficientEnergy: potentialFrame.observedCoefficientEnergy,
    observedCoefficientNorm: potentialFrame.observedCoefficientNorm,
    normalizedEnergySum: potentialFrame.normalizedEnergySum,
    exposureDrive: potentialFrame.exposureDrive,
    analyticPotentialEvaluationCountPerSample:
      potentialFrame.analyticPotentialEvaluationCountPerSample,
  });

  uploadState.counters.driveUpdateCount += 1;
  if (potentialFrame.changed) {
    markBufferForUpload(runtimeState.modalFieldCoefficientBuffer);
    markBufferForUpload(runtimeState.modalFieldResponseBuffer);
    uploadState.counters.coefficientUploadCount += 1;
  }

  const modalFieldAnalysis = updateRaymarchFieldAnalysis({
    runtimeState,
    featureFrame,
    basisPlan,
    coefficients,
    sourceActiveCount,
    occupiedSlotSpan,
    effectiveCavityGeometry,
  });
  uploadState.driveFrame = Object.freeze({
    basisPlan,
    frameId: featureFrame.frameId,
    timelineRevision: featureFrame.observationTimelineRevision,
    sourceGeneration: featureFrame.sourceGeneration,
    workerGeneration: featureFrame.workerGeneration,
    coefficients,
    phases,
    activeCount: modalFieldAnalysis.uploadedActiveCount,
    sourceActiveCount,
  });
  return uploadState.driveFrame;
}

/**
 * Compiles immutable modal topology into static GPU payloads and streams only
 * the coefficient quadratures owned by advancing audio frames.
 */
export function applyRaymarchModalPacketUploads({
  runtimeState,
  featureFrame,
  modalDescriptor,
  productUploadCapacity,
  effectiveCavityGeometry,
}) {
  assertRendererFeatureUploadContract(featureFrame, modalDescriptor);
  const currentFeatureFrame = featureFrame;
  const descriptorSlots = modalDescriptor.slotViews;
  const uploadState = getRaymarchUploadState(runtimeState);
  const basisPlan = compileModalBasisPlan({
    runtimeState,
    uploadState,
    featureFrame: currentFeatureFrame,
    descriptorSlots,
    productUploadCapacity,
    effectiveCavityGeometry,
  });
  const driveFrame = applyModalDriveFrame({
    runtimeState,
    uploadState,
    featureFrame: currentFeatureFrame,
    descriptorSlots,
    basisPlan,
    effectiveCavityGeometry,
  });

  return {
    modalFieldModeCount: driveFrame.activeCount,
    productUploadCapacity,
  };
}
