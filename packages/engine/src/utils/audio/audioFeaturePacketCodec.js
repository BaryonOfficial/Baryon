import { AUDIO_FEATURE_PROTOCOL_VERSION } from "./audioFeaturePackets.js";
import { hasRenderAuthority } from "../../core/renderAuthorityContract.js";

const MODAL_SLOT_STRIDE = 4;
const MODAL_IDENTITY_STRIDE = 3;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const FLOAT32_BITS = new Float32Array(1);
const UINT32_BITS = new Uint32Array(FLOAT32_BITS.buffer);

const TOPOLOGY_ARRAY_KEYS = Object.freeze([
  "modalFieldColorSlots",
  "modalFieldSpectralLaneA",
  "modalFieldSpectralLaneB",
  "modalFieldSpectralMeta",
  "modalFieldMetadataSlots",
]);

const OMITTED_DIAGNOSTIC_KEY_PATTERN =
  /(candidate|reference.*slot|modeSlots|colorSlots|spectralLane|structuralFingerprint|structuralSummary)/i;

// The fast wire contract is intentionally explicit. Adding a new property to
// a composed feature frame cannot silently make it a 60 Hz transport field.
const DRIVE_RENDER_SCALAR_KEYS = Object.freeze([
  "activeModeCount",
  "activeModalFieldModeCount",
  "audioMotionAuthority",
  "averageAmplitude",
  "bassSalience",
  "beatConfidence",
  "beatDetected",
  "beatPhase",
  "beatPulseId",
  "beatStrength",
  "changeSignal",
  "createdAtMs",
  "energySignal",
  "estimatedTempo",
  "fieldState",
  "frameSequence",
  "frameTimeMs",
  "hasModalField",
  "highQPhaseAuthority",
  "isLiveInputActive",
  "keyConfidence",
  "keyMode",
  "keyTonicHue",
  "lowQPhaseAuthority",
  "modalObserverVisibilityEnergy",
  "modalPhaseAuthority",
  "modalPhaseCoherentFieldModeCount",
  "modalResponseAverageCouplingStrength",
  "modalResponseAverageDampingEnvelope",
  "modalResponseAveragePersistence",
  "modalResponseAveragePhaseConfidence",
  "modalResponseBudgetScale",
  "modalResponseEnergy",
  "modalResponseRawEnergy",
  "modalResponseRenderEnergy",
  "modalResponseRenderResonantEnergy",
  "modalResponseRenderSourceCoupledEnergy",
  "modalVisibilityEnergy",
  "modalVisibilityRetainedHighQEnergy",
  "modeCoherence",
  "observationEnergy",
  "pulseSignal",
  "renderAuthorityRevoked",
  "rhythmicDensity",
  "sourceMode",
  "spectralCentroid",
  "spectralFlux",
  "spectralNovelty",
  "structureSignal",
  "tempoConfidence",
  "timbreSpread",
  "transientEnergy",
  "trebleBroadbandEnergy",
  "trebleTonalEnergy",
]);

const DRIVE_DEBUG_SCALAR_KEYS = Object.freeze([
  "analysisSourceUsed",
  "analyserRms",
  "audioInputMode",
  "avgAmplitude",
  "dominantFrequency",
  "excitedModeCount",
  "fieldState",
  "fundamentalFrequency",
  "highQPhaseAuthority",
  "highQResonantEnergy",
  "highQResonantModeCount",
  "highQRingSupport",
  "liveInputCalibrationActive",
  "liveInputCalibrationInvalid",
  "liveInputCalibrationInvalidReason",
  "liveInputHardSilenceActive",
  "liveInputNoiseGateActive",
  "lowQPhaseAuthority",
  "modalPersistence",
  "modalPhaseCoherentFieldModeCount",
  "modalResponseAverageCouplingStrength",
  "modalResponseAverageDampingEnvelope",
  "modalResponseAveragePersistence",
  "modalResponseAveragePhaseConfidence",
  "modalResponseBudgetScale",
  "modalResponseEnergy",
  "modalResponseRawEnergy",
  "modalResponseRenderEnergy",
  "observedModalModeCount",
  "periodicity",
  "projectionAllocatedEnergyResonant",
  "projectionAllocatedEnergySourceCoupled",
  "projectionCompetitionReduction",
  "projectionEnergyBudgetResonant",
  "projectionEnergyBudgetSourceCoupled",
  "projectionEnergyNormalizationApplied",
  "projectionEnergyScaleResonant",
  "projectionEnergyScaleSourceCoupled",
  "projectionEnergyUsedResonant",
  "projectionEnergyUsedSourceCoupled",
  "projectionHighQProtection",
  "projectionLoad",
  "projectionOverlapPressureResonant",
  "projectionOverlapPressureSourceCoupled",
  "projectionRawEnergyResonant",
  "projectionRawEnergySourceCoupled",
  "resonantShiftReleaseOverrideCount",
  "resonantShiftTrackingOverrideCount",
  "resonantSignalAuthoritative",
  "resonantSignalAuthoritativeCoverage",
  "resonantSignalAuthoritativeFastAssist",
  "resonantSignalAuthoritativeFreshSignal",
  "resonantSignalAuthoritativeHighQ",
  "resonantSignalAuthoritativeReason",
  "sourceBoundaryState",
  "structuralProjectionConcentration",
  "structuralProjectionDrive",
  "totalSlotAmplitude",
]);

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function hashNumber(value, hash) {
  FLOAT32_BITS[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return hashUint32(UINT32_BITS[0], hash);
}

function hashString(value, hash) {
  const text = String(value ?? "");
  let nextHash = hashUint32(text.length, hash);
  for (let index = 0; index < text.length; index += 1) {
    nextHash = hashUint32(text.charCodeAt(index), nextHash);
  }
  return nextHash;
}

function hashArray(values, length, hash) {
  const resolvedLength = Math.max(
    0,
    Math.min(values?.length ?? 0, Math.floor(length ?? values?.length ?? 0)),
  );
  let nextHash = hashUint32(resolvedLength, hash);
  for (let index = 0; index < resolvedLength; index += 1) {
    nextHash = hashNumber(values[index], nextHash);
  }
  return nextHash;
}

function cloneActivePrefix(
  values,
  activeModeCount,
  stride = MODAL_SLOT_STRIDE,
  target = null,
) {
  const length = Math.max(
    0,
    Math.min(
      values?.length ?? 0,
      Math.max(0, Math.floor(activeModeCount ?? 0)) * stride,
    ),
  );
  const result =
    target instanceof Float32Array && target.length === length
      ? target
      : new Float32Array(length);
  result.fill(0);
  if (length > 0) {
    result.set(
      values.subarray ? values.subarray(0, length) : values.slice(0, length),
    );
  }
  return result;
}

function copyFixedFloat32(values, length, target = null) {
  const resolvedLength = Math.max(0, Math.floor(length ?? 0));
  const result =
    target instanceof Float32Array && target.length === resolvedLength
      ? target
      : new Float32Array(resolvedLength);
  result.fill(0);
  const sourceLength = Math.min(values?.length ?? 0, resolvedLength);
  if (sourceLength > 0) {
    result.set(
      values.subarray
        ? values.subarray(0, sourceLength)
        : values.slice(0, sourceLength),
    );
  }
  return result;
}

function copyModalIdentities(slots, activeModeCount) {
  const count = Math.max(0, Math.floor(activeModeCount ?? 0));
  const identities = new Float32Array(count * MODAL_IDENTITY_STRIDE);
  for (let modeIndex = 0; modeIndex < count; modeIndex += 1) {
    const sourceOffset = modeIndex * MODAL_SLOT_STRIDE;
    const targetOffset = modeIndex * MODAL_IDENTITY_STRIDE;
    identities[targetOffset] = slots?.[sourceOffset] ?? 0;
    identities[targetOffset + 1] = slots?.[sourceOffset + 1] ?? 0;
    identities[targetOffset + 2] = slots?.[sourceOffset + 2] ?? 0;
  }
  return identities;
}

function copyModalCoefficients(slots, activeModeCount, target = null) {
  const count = Math.max(0, Math.floor(activeModeCount ?? 0));
  const coefficients =
    target instanceof Float32Array && target.length === count
      ? target
      : new Float32Array(count);
  for (let modeIndex = 0; modeIndex < count; modeIndex += 1) {
    coefficients[modeIndex] = slots?.[modeIndex * MODAL_SLOT_STRIDE + 3] ?? 0;
  }
  return coefficients;
}

function findModalIdentityIndex(
  slots,
  activeModeCount,
  identities,
  targetIndex,
) {
  const identityOffset = targetIndex * MODAL_IDENTITY_STRIDE;
  const x = identities?.[identityOffset];
  const y = identities?.[identityOffset + 1];
  const z = identities?.[identityOffset + 2];
  for (let modeIndex = 0; modeIndex < activeModeCount; modeIndex += 1) {
    const slotOffset = modeIndex * MODAL_SLOT_STRIDE;
    if (
      slots?.[slotOffset] === x &&
      slots?.[slotOffset + 1] === y &&
      slots?.[slotOffset + 2] === z
    ) {
      return modeIndex;
    }
  }
  return -1;
}

function findDriveLayerIdentityIndex(layer, identities, targetIndex) {
  return findModalIdentityIndex(
    layer?.slots,
    Math.max(0, Math.floor(layer?.activeModeCount ?? 0)),
    identities,
    targetIndex,
  );
}

function copyDriveSlotsForTopology(
  featureFrame,
  topologyPacket,
  driveLayers = null,
) {
  const activeModeCount = Math.max(
    0,
    Math.floor(topologyPacket?.activeModeCount ?? 0),
  );
  const sourceActiveModeCount = Math.max(
    0,
    Math.floor(
      featureFrame?.activeModalFieldModeCount ??
        featureFrame?.activeModeCount ??
        0,
    ),
  );
  const modalCoefficients = new Float32Array(activeModeCount);
  const phaseSlots = new Float32Array(activeModeCount * MODAL_SLOT_STRIDE);
  for (let targetIndex = 0; targetIndex < activeModeCount; targetIndex += 1) {
    let sourceSlots = featureFrame?.modalFieldSlots;
    let sourcePhaseSlots = featureFrame?.modalFieldPhaseSlots;
    let sourceIndex = -1;
    if (Array.isArray(driveLayers)) {
      for (const layer of driveLayers) {
        sourceIndex = findDriveLayerIdentityIndex(
          layer,
          topologyPacket?.modalIdentitySlots,
          targetIndex,
        );
        if (sourceIndex >= 0) {
          sourceSlots = layer.slots;
          sourcePhaseSlots = layer.phaseSlots;
          break;
        }
      }
    } else {
      sourceIndex = findModalIdentityIndex(
        sourceSlots,
        sourceActiveModeCount,
        topologyPacket?.modalIdentitySlots,
        targetIndex,
      );
    }
    if (sourceIndex < 0) {
      continue;
    }
    modalCoefficients[targetIndex] =
      sourceSlots?.[sourceIndex * MODAL_SLOT_STRIDE + 3] ?? 0;
    const sourcePhaseOffset = sourceIndex * MODAL_SLOT_STRIDE;
    const targetPhaseOffset = targetIndex * MODAL_SLOT_STRIDE;
    for (let component = 0; component < MODAL_SLOT_STRIDE; component += 1) {
      phaseSlots[targetPhaseOffset + component] =
        sourcePhaseSlots?.[sourcePhaseOffset + component] ?? 0;
    }
  }
  return { activeModeCount, modalCoefficients, phaseSlots };
}

function cloneObjectWithoutTypedArrays(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map(cloneObjectWithoutTypedArrays)
      .filter((entry) => entry !== undefined);
  }

  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (OMITTED_DIAGNOSTIC_KEY_PATTERN.test(key)) {
      continue;
    }
    const cloned = cloneObjectWithoutTypedArrays(nested);
    if (cloned !== undefined) {
      result[key] = cloned;
    }
  }
  return result;
}

function cloneModalDescriptorMetadata(descriptor) {
  if (!descriptor) {
    return null;
  }
  const metadata = { ...descriptor };
  delete metadata.slotViews;
  delete metadata.modes;
  return cloneObjectWithoutTypedArrays(metadata);
}

function copyScalarFields(source, keys) {
  const result = {};
  for (const key of keys) {
    const value = source?.[key];
    if (
      value !== undefined &&
      (value === null ||
        (typeof value !== "object" && typeof value !== "function"))
    ) {
      result[key] = value;
    }
  }
  return result;
}

function buildRenderState(featureFrame) {
  const renderState = copyScalarFields(featureFrame, DRIVE_RENDER_SCALAR_KEYS);
  for (const key of ["changeBreakdown", "energyLedger", "sourceEvidence"]) {
    if (featureFrame?.[key]) {
      renderState[key] = cloneObjectWithoutTypedArrays(featureFrame[key]);
    }
  }
  renderState.debug = copyScalarFields(
    featureFrame?.debug,
    DRIVE_DEBUG_SCALAR_KEYS,
  );
  renderState.renderAuthority = hasRenderAuthority(featureFrame);
  return renderState;
}

export function computeFeatureTopologyFingerprint(
  featureFrame,
  {
    fastProbeModeIndices = null,
    modalRoleMetadata = null,
    committedModeIdentitySlots = null,
    committedModeFrequenciesHz = null,
    committedModeRoleMetadata = null,
  } = {},
) {
  const activeModeCount = Math.max(
    0,
    Math.floor(
      featureFrame?.activeModalFieldModeCount ??
        featureFrame?.activeModeCount ??
        0,
    ),
  );
  let hash = hashUint32(activeModeCount, FNV_OFFSET_BASIS);
  const slots = featureFrame?.modalFieldSlots;
  for (let modeIndex = 0; modeIndex < activeModeCount; modeIndex += 1) {
    const offset = modeIndex * MODAL_SLOT_STRIDE;
    hash = hashNumber(slots?.[offset], hash);
    hash = hashNumber(slots?.[offset + 1], hash);
    hash = hashNumber(slots?.[offset + 2], hash);
  }
  for (const key of TOPOLOGY_ARRAY_KEYS) {
    hash = hashArray(
      featureFrame?.[key],
      activeModeCount * MODAL_SLOT_STRIDE,
      hash,
    );
  }
  const descriptorDiagnostics = featureFrame?.modalDescriptor?.diagnostics;
  hash = hashUint32(
    descriptorDiagnostics?.upstreamSourceCoupledModeCount ?? 0,
    hash,
  );
  hash = hashUint32(
    descriptorDiagnostics?.upstreamResonantModeCount ?? 0,
    hash,
  );
  hash = hashArray(
    fastProbeModeIndices,
    fastProbeModeIndices?.length ?? 0,
    hash,
  );
  hash = hashArray(modalRoleMetadata, modalRoleMetadata?.length ?? 0, hash);
  hash = hashArray(
    committedModeIdentitySlots,
    committedModeIdentitySlots?.length ?? 0,
    hash,
  );
  hash = hashArray(
    committedModeFrequenciesHz,
    committedModeFrequenciesHz?.length ?? 0,
    hash,
  );
  hash = hashArray(
    committedModeRoleMetadata,
    committedModeRoleMetadata?.length ?? 0,
    hash,
  );
  hash = hashString(featureFrame?.modalDescriptor?.fieldAuthority, hash);
  return hash >>> 0;
}

export function computeBasisIdentityHash(featureFrame) {
  const activeModeCount = Math.max(
    0,
    Math.floor(
      featureFrame?.activeModalFieldModeCount ??
        featureFrame?.activeModeCount ??
        0,
    ),
  );
  let hash = hashUint32(activeModeCount, FNV_OFFSET_BASIS);
  const slots = featureFrame?.modalFieldSlots;
  for (let modeIndex = 0; modeIndex < activeModeCount; modeIndex += 1) {
    const offset = modeIndex * MODAL_SLOT_STRIDE;
    hash = hashNumber(slots?.[offset], hash);
    hash = hashNumber(slots?.[offset + 1], hash);
    hash = hashNumber(slots?.[offset + 2], hash);
  }
  return hash >>> 0;
}

export function buildTopologyPacket({
  featureFrame,
  sourceGeneration,
  workerGeneration,
  topologyRevision,
  sessionKey,
  inputSignature,
  captureTimestampMs,
  fastProbeModeIndices = new Uint16Array(0),
  committedModes = null,
  structuralFingerprint = null,
  structuralDiagnostics = null,
}) {
  const activeModeCount = Math.max(
    0,
    Math.floor(
      featureFrame?.activeModalFieldModeCount ??
        featureFrame?.activeModeCount ??
        0,
    ),
  );
  const descriptorDiagnostics = featureFrame?.modalDescriptor?.diagnostics;
  const modalRoleMetadata = new Uint8Array(activeModeCount);
  const committedModeIndexByKey = new Map();
  for (let index = 0; index < (committedModes?.length ?? 0); index += 1) {
    committedModeIndexByKey.set(committedModes[index]?.modeKey, index);
  }
  const modalIdentitySlots = copyModalIdentities(
    featureFrame?.modalFieldSlots,
    activeModeCount,
  );
  for (
    let topologyIndex = 0;
    topologyIndex < activeModeCount;
    topologyIndex += 1
  ) {
    const identityOffset = topologyIndex * MODAL_IDENTITY_STRIDE;
    const modeKey = `${modalIdentitySlots[identityOffset]}:${modalIdentitySlots[identityOffset + 1]}:${modalIdentitySlots[identityOffset + 2]}`;
    const committedModeIndex = committedModeIndexByKey.get(modeKey);
    if (committedModeIndex === undefined) {
      continue;
    }
    modalRoleMetadata[topologyIndex] =
      committedModes[committedModeIndex]?.layer === "resonant" ? 2 : 1;
  }
  if (!committedModes) {
    const sourceCount = Math.min(
      activeModeCount,
      Math.max(
        0,
        Math.floor(descriptorDiagnostics?.upstreamSourceCoupledModeCount ?? 0),
      ),
    );
    const resonantCount = Math.min(
      Math.max(0, activeModeCount - sourceCount),
      Math.max(
        0,
        Math.floor(descriptorDiagnostics?.upstreamResonantModeCount ?? 0),
      ),
    );
    modalRoleMetadata.fill(1, 0, sourceCount);
    modalRoleMetadata.fill(2, sourceCount, sourceCount + resonantCount);
  }
  const activeSourceCoupledModeCount = modalRoleMetadata.reduce(
    (count, role) => count + Number(role === 1),
    0,
  );
  const activeResonantModeCount = modalRoleMetadata.reduce(
    (count, role) => count + Number(role === 2),
    0,
  );
  const committedModeCount = committedModes?.length ?? activeModeCount;
  const committedModeIdentitySlots = new Float32Array(committedModeCount * 3);
  const committedModeFrequenciesHz = new Float32Array(committedModeCount);
  const committedModeRoleMetadata = new Uint8Array(committedModeCount);
  for (let index = 0; index < committedModeCount; index += 1) {
    const mode = committedModes?.[index];
    const offset = index * 3;
    if (mode) {
      committedModeIdentitySlots[offset] = mode.u ?? 0;
      committedModeIdentitySlots[offset + 1] = mode.v ?? 0;
      committedModeIdentitySlots[offset + 2] = mode.w ?? 0;
      committedModeFrequenciesHz[index] = mode.naturalFrequencyHz ?? 0;
      committedModeRoleMetadata[index] = mode.layer === "resonant" ? 2 : 1;
    } else {
      committedModeIdentitySlots[offset] = modalIdentitySlots[offset] ?? 0;
      committedModeIdentitySlots[offset + 1] =
        modalIdentitySlots[offset + 1] ?? 0;
      committedModeIdentitySlots[offset + 2] =
        modalIdentitySlots[offset + 2] ?? 0;
      committedModeRoleMetadata[index] = modalRoleMetadata[index] ?? 0;
    }
  }
  const topologyProbeIndices =
    fastProbeModeIndices instanceof Uint16Array
      ? new Uint16Array(fastProbeModeIndices)
      : Uint16Array.from(fastProbeModeIndices ?? []);
  const packet = {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration,
    workerGeneration,
    topologyRevision,
    sessionKey: sessionKey ?? null,
    inputSignature: inputSignature ?? null,
    captureTimestampMs,
    activeModeCount,
    committedModeCount,
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    modalRoleMetadata,
    modalIdentitySlots,
    committedModeIdentitySlots,
    committedModeFrequenciesHz,
    committedModeRoleMetadata,
    modalFieldColorSlots: cloneActivePrefix(
      featureFrame?.modalFieldColorSlots,
      activeModeCount,
    ),
    modalFieldSpectralLaneA: cloneActivePrefix(
      featureFrame?.modalFieldSpectralLaneA,
      activeModeCount,
    ),
    modalFieldSpectralLaneB: cloneActivePrefix(
      featureFrame?.modalFieldSpectralLaneB,
      activeModeCount,
    ),
    modalFieldSpectralMeta: cloneActivePrefix(
      featureFrame?.modalFieldSpectralMeta,
      activeModeCount,
    ),
    modalFieldMetadataSlots: cloneActivePrefix(
      featureFrame?.modalFieldMetadataSlots,
      activeModeCount,
    ),
    fastProbeModeIndices: topologyProbeIndices,
    basisIdentityHash: computeBasisIdentityHash(featureFrame),
    structuralFingerprint: cloneObjectWithoutTypedArrays(structuralFingerprint),
    structuralDiagnostics: cloneObjectWithoutTypedArrays(structuralDiagnostics),
    modalDescriptor: cloneModalDescriptorMetadata(
      featureFrame?.modalDescriptor,
    ),
  };
  packet.topologyFingerprint = computeFeatureTopologyFingerprint(featureFrame, {
    fastProbeModeIndices: packet.fastProbeModeIndices,
    modalRoleMetadata: packet.modalRoleMetadata,
    committedModeIdentitySlots: packet.committedModeIdentitySlots,
    committedModeFrequenciesHz: packet.committedModeFrequenciesHz,
    committedModeRoleMetadata: packet.committedModeRoleMetadata,
  });
  return packet;
}

export function buildDrivePacket({
  featureFrame,
  topologyPacket = null,
  driveLayers = null,
  committedDriveSlots = null,
  committedPhaseSlots = null,
  buffers = null,
  sourceGeneration,
  workerGeneration,
  topologyRevision,
  frameId,
  captureTimestampMs,
  processingTimestampMs,
}) {
  // The worker-owned committed projection is already ordered against the
  // packet topology. Avoid constructing a second visible coefficient/phase
  // projection when that canonical full-width drive is present.
  const topologyDrive =
    topologyPacket && !committedDriveSlots
      ? copyDriveSlotsForTopology(featureFrame, topologyPacket, driveLayers)
      : null;
  const activeModeCount = topologyPacket
    ? Math.max(0, Math.floor(topologyPacket.activeModeCount ?? 0))
    : topologyDrive
      ? topologyDrive.activeModeCount
      : Math.max(
          0,
          Math.floor(
            featureFrame?.activeModalFieldModeCount ??
              featureFrame?.activeModeCount ??
              0,
          ),
        );
  const committedModeCount = committedDriveSlots
    ? Math.floor(committedDriveSlots.length / MODAL_SLOT_STRIDE)
    : activeModeCount;
  return {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration,
    workerGeneration,
    topologyRevision,
    frameId,
    captureTimestampMs,
    processingTimestampMs,
    activeModeCount,
    committedModeCount,
    modalCoefficients: committedDriveSlots
      ? copyModalCoefficients(
          committedDriveSlots,
          committedModeCount,
          buffers?.modalCoefficients,
        )
      : (topologyDrive?.modalCoefficients ??
        copyModalCoefficients(
          featureFrame?.modalFieldSlots,
          activeModeCount,
          buffers?.modalCoefficients,
        )),
    phaseSlots: committedPhaseSlots
      ? copyFixedFloat32(
          committedPhaseSlots,
          committedModeCount * MODAL_SLOT_STRIDE,
          buffers?.phaseSlots,
        )
      : (topologyDrive?.phaseSlots ??
        copyFixedFloat32(
          featureFrame?.modalFieldPhaseSlots,
          activeModeCount * MODAL_SLOT_STRIDE,
          buffers?.phaseSlots,
        )),
    bandEnergies: copyFixedFloat32(
      featureFrame?.bandEnergies,
      4,
      buffers?.bandEnergies,
    ),
    spectralBandEnergies: copyFixedFloat32(
      featureFrame?.spectralBandEnergies,
      4,
      buffers?.spectralBandEnergies,
    ),
    renderState: buildRenderState(featureFrame),
  };
}

/**
 * Creates the renderer-facing immutable view from a complete packet model.
 * Typed arrays remain owned by their packets and are never copied here.
 */
export function createRendererFeatureView(model) {
  if (!model?.topology || !model?.drive) {
    return null;
  }
  const topology = model.topology;
  const drive = model.drive;
  return Object.freeze({
    ...drive.renderState,
    frameTimeMs: drive.captureTimestampMs,
    captureTimestampMs: drive.captureTimestampMs,
    processingTimestampMs: drive.processingTimestampMs,
    topologyRevision: topology.topologyRevision,
    basisIdentityHash: topology.basisIdentityHash,
    modalIdentitySlots: topology.modalIdentitySlots,
    modalCoefficientSlots: drive.modalCoefficients,
    modalFieldPhaseSlots: drive.phaseSlots,
    modalFieldColorSlots: topology.modalFieldColorSlots,
    modalFieldSpectralLaneA: topology.modalFieldSpectralLaneA,
    modalFieldSpectralLaneB: topology.modalFieldSpectralLaneB,
    modalFieldSpectralMeta: topology.modalFieldSpectralMeta,
    modalFieldMetadataSlots: topology.modalFieldMetadataSlots,
    bandEnergies: drive.bandEnergies,
    spectralBandEnergies: drive.spectralBandEnergies,
    activeModeCount: drive.activeModeCount,
    activeModalFieldModeCount: drive.activeModeCount,
    committedModeCount: drive.committedModeCount,
    modalDescriptor: topology.modalDescriptor,
  });
}
