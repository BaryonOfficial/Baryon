import {
  AUDIO_FEATURE_PROTOCOL_VERSION,
  isCanonicalModalDescriptor,
  isCompleteAudioFeatureModel,
} from "../../contracts/audioFeatureProtocol.js";
import { hasRenderAuthority } from "../../core/renderAuthorityContract.js";
import { HASH32_OFFSET_BASIS, hashFloat32, hashUint32 } from "../hash32.js";

const MODAL_SLOT_STRIDE = 4;
const MODAL_IDENTITY_STRIDE = 3;

const TOPOLOGY_ARRAY_KEYS = Object.freeze([
  "modalFieldSpectralMomentSlots",
  "modalFieldMetadataSlots",
]);

const OMITTED_DIAGNOSTIC_KEY_PATTERN =
  /(candidate|reference.*slot|modeSlots|spectralMomentSlots|structuralFingerprint|structuralSummary)/i;

function toModeCount(value) {
  return Math.max(0, Math.floor(value ?? 0));
}

function readActiveModeCount(featureFrame) {
  return toModeCount(
    featureFrame?.activeModalFieldModeCount ?? featureFrame?.activeModeCount,
  );
}

function encodeModeRole(mode) {
  return mode?.layer === "resonant" ? 2 : 1;
}

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
  "isLiveInputActive",
  "keyConfidence",
  "keyMode",
  "keyTonicHue",
  "modalObserverVisibilityEnergy",
  "modalPhaseAuthority",
  "modalPhaseAnchorAngularVelocityRadPerSec",
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
  "modeCoherence",
  "observationEnergy",
  "pulseSignal",
  "renderAuthorityRevoked",
  "rhythmicDensity",
  "sourceMode",
  "spectralCentroid",
  "spectralFlatness",
  "spectralFlux",
  "spectralNovelty",
  "spectralSpread",
  "structureSignal",
  "tempoConfidence",
  "timbreSpread",
  "transientEnergy",
  "trebleBroadbandEnergy",
  "trebleTonalEnergy",
]);

const DRIVE_DEBUG_SCALAR_KEYS = Object.freeze([
  "analysisSourceUsed",
  "analysisInputMode",
  "analyserRms",
  "avgAmplitude",
  "dominantFrequency",
  "excitedModeCount",
  "fieldState",
  "fundamentalFrequency",
  "resonantPhaseAuthority",
  "resonantObservedEnergy",
  "resonantObservedModeCount",
  "resonantRingSupport",
  "liveInputCalibrationActive",
  "liveInputCalibrationInvalid",
  "liveInputCalibrationInvalidReason",
  "liveInputHardSilenceActive",
  "liveInputNoiseGateActive",
  "liveInputPolicy",
  "sourceCoupledPhaseAuthority",
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
  "projectionResonantProtection",
  "projectionLoad",
  "projectionOverlapPressureResonant",
  "projectionOverlapPressureSourceCoupled",
  "projectionRawEnergyResonant",
  "projectionRawEnergySourceCoupled",
  "sourceKind",
  "sourceBoundaryState",
  "spectralFlatness",
  "spectralSpread",
  "structuralProjectionConcentration",
  "structuralProjectionDrive",
  "totalSlotAmplitude",
]);

const DIAGNOSTIC_CONTROL_STATE_KEYS = Object.freeze([
  "auditEnabled",
  "freezeModeSlots",
  "injectTestTone",
  "suppressPlaybackTelemetry",
]);

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
    nextHash = hashFloat32(values[index], nextHash);
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
    toModeCount(layer?.activeModeCount),
    identities,
    targetIndex,
  );
}

function findTopologyDriveSource({
  featureFrame,
  topologyPacket,
  driveLayers,
  sourceActiveModeCount,
  targetIndex,
}) {
  if (Array.isArray(driveLayers)) {
    for (const layer of driveLayers) {
      const sourceIndex = findDriveLayerIdentityIndex(
        layer,
        topologyPacket?.modalIdentitySlots,
        targetIndex,
      );
      if (sourceIndex >= 0) {
        return {
          slots: layer.slots,
          phaseSlots: layer.phaseSlots,
          sourceIndex,
        };
      }
    }
    return null;
  }

  const sourceIndex = findModalIdentityIndex(
    featureFrame?.modalFieldSlots,
    sourceActiveModeCount,
    topologyPacket?.modalIdentitySlots,
    targetIndex,
  );
  return sourceIndex < 0
    ? null
    : {
        slots: featureFrame?.modalFieldSlots,
        phaseSlots: featureFrame?.modalFieldPhaseSlots,
        sourceIndex,
      };
}

function copyDriveSlotsForTopology(
  featureFrame,
  topologyPacket,
  driveLayers = null,
) {
  const activeModeCount = toModeCount(topologyPacket?.activeModeCount);
  const sourceActiveModeCount = readActiveModeCount(featureFrame);
  const modalCoefficients = new Float32Array(activeModeCount);
  const phaseSlots = new Float32Array(activeModeCount * MODAL_SLOT_STRIDE);
  for (let targetIndex = 0; targetIndex < activeModeCount; targetIndex += 1) {
    const source = findTopologyDriveSource({
      featureFrame,
      topologyPacket,
      driveLayers,
      sourceActiveModeCount,
      targetIndex,
    });
    if (!source) {
      continue;
    }
    modalCoefficients[targetIndex] =
      source.slots?.[source.sourceIndex * MODAL_SLOT_STRIDE + 3] ?? 0;
    const sourcePhaseOffset = source.sourceIndex * MODAL_SLOT_STRIDE;
    const targetPhaseOffset = targetIndex * MODAL_SLOT_STRIDE;
    for (let component = 0; component < MODAL_SLOT_STRIDE; component += 1) {
      phaseSlots[targetPhaseOffset + component] =
        source.phaseSlots?.[sourcePhaseOffset + component] ?? 0;
    }
  }
  return { modalCoefficients, phaseSlots };
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
  renderState.diagnosticControlState = copyScalarFields(
    featureFrame?.diagnosticControlState,
    DIAGNOSTIC_CONTROL_STATE_KEYS,
  );
  renderState.debug = copyScalarFields(
    featureFrame?.debug,
    DRIVE_DEBUG_SCALAR_KEYS,
  );
  renderState.renderAuthority = hasRenderAuthority(featureFrame);
  return renderState;
}

function buildVisibleModeRoleMetadata(
  featureFrame,
  activeModeCount,
  committedModes,
) {
  const roles = new Uint8Array(activeModeCount);
  if (committedModes) {
    const visibleCommittedModeCount = Math.min(
      activeModeCount,
      committedModes.length,
    );
    for (let index = 0; index < visibleCommittedModeCount; index += 1) {
      roles[index] = encodeModeRole(committedModes[index]);
    }
    return roles;
  }

  const diagnostics = featureFrame?.modalDescriptor?.diagnostics;
  const sourceCount = Math.min(
    activeModeCount,
    toModeCount(diagnostics?.upstreamSourceCoupledModeCount),
  );
  const resonantCount = Math.min(
    activeModeCount - sourceCount,
    toModeCount(diagnostics?.upstreamResonantModeCount),
  );
  roles.fill(1, 0, sourceCount);
  roles.fill(2, sourceCount, sourceCount + resonantCount);
  return roles;
}

function countModeRole(roles, expectedRole) {
  let count = 0;
  for (const role of roles) {
    count += Number(role === expectedRole);
  }
  return count;
}

function buildCommittedModeMetadata({
  activeModeCount,
  committedModes,
  modalIdentitySlots,
  modalRoleMetadata,
}) {
  const committedModeCount = committedModes?.length ?? activeModeCount;
  const committedModeIdentitySlots = new Float32Array(
    committedModeCount * MODAL_IDENTITY_STRIDE,
  );
  const committedModeFrequenciesHz = new Float32Array(committedModeCount);
  const committedModeRoleMetadata = new Uint8Array(committedModeCount);

  if (committedModes) {
    for (let index = 0; index < committedModeCount; index += 1) {
      const mode = committedModes[index];
      const offset = index * MODAL_IDENTITY_STRIDE;
      if (!mode) {
        committedModeIdentitySlots[offset] = modalIdentitySlots[offset] ?? 0;
        committedModeIdentitySlots[offset + 1] =
          modalIdentitySlots[offset + 1] ?? 0;
        committedModeIdentitySlots[offset + 2] =
          modalIdentitySlots[offset + 2] ?? 0;
        committedModeRoleMetadata[index] = modalRoleMetadata[index] ?? 0;
        continue;
      }
      committedModeIdentitySlots[offset] = mode.u ?? 0;
      committedModeIdentitySlots[offset + 1] = mode.v ?? 0;
      committedModeIdentitySlots[offset + 2] = mode.w ?? 0;
      committedModeFrequenciesHz[index] = mode.naturalFrequencyHz ?? 0;
      committedModeRoleMetadata[index] = encodeModeRole(mode);
    }
  } else {
    committedModeIdentitySlots.set(modalIdentitySlots);
    committedModeRoleMetadata.set(modalRoleMetadata);
  }
  return {
    committedModeCount,
    committedModeIdentitySlots,
    committedModeFrequenciesHz,
    committedModeRoleMetadata,
  };
}

function cloneTopologySlotArrays(featureFrame, activeModeCount) {
  return Object.fromEntries(
    TOPOLOGY_ARRAY_KEYS.map((key) => [
      key,
      cloneActivePrefix(featureFrame?.[key], activeModeCount),
    ]),
  );
}

function copyProbeModeIndices(indices) {
  return indices instanceof Uint16Array
    ? new Uint16Array(indices)
    : Uint16Array.from(indices ?? []);
}

function hashModalIdentityPrefix(featureFrame) {
  const activeModeCount = readActiveModeCount(featureFrame);
  const slots = featureFrame?.modalFieldSlots;
  let hash = hashUint32(activeModeCount, HASH32_OFFSET_BASIS);
  for (let modeIndex = 0; modeIndex < activeModeCount; modeIndex += 1) {
    const offset = modeIndex * MODAL_SLOT_STRIDE;
    hash = hashFloat32(slots?.[offset], hash);
    hash = hashFloat32(slots?.[offset + 1], hash);
    hash = hashFloat32(slots?.[offset + 2], hash);
  }
  return { activeModeCount, hash };
}

function hashTopologySlotArrays(featureFrame, activeModeCount, initialHash) {
  let hash = initialHash;
  for (const key of TOPOLOGY_ARRAY_KEYS) {
    hash = hashArray(
      featureFrame?.[key],
      activeModeCount * MODAL_SLOT_STRIDE,
      hash,
    );
  }
  return hashArray(featureFrame?.modalFieldSpectralSeedDirection, 2, hash);
}

function hashTopologyInterpretation(
  featureFrame,
  interpretationArrays,
  initialHash,
) {
  const diagnostics = featureFrame?.modalDescriptor?.diagnostics;
  let hash = hashUint32(
    diagnostics?.upstreamSourceCoupledModeCount ?? 0,
    initialHash,
  );
  hash = hashUint32(diagnostics?.upstreamResonantModeCount ?? 0, hash);
  for (const values of interpretationArrays) {
    hash = hashArray(values, values?.length, hash);
  }
  return hashString(featureFrame?.modalDescriptor?.fieldAuthority, hash);
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
  const identity = hashModalIdentityPrefix(featureFrame);
  const topologyHash = hashTopologySlotArrays(
    featureFrame,
    identity.activeModeCount,
    identity.hash,
  );
  return (
    hashTopologyInterpretation(
      featureFrame,
      [
        fastProbeModeIndices,
        modalRoleMetadata,
        committedModeIdentitySlots,
        committedModeFrequenciesHz,
        committedModeRoleMetadata,
      ],
      topologyHash,
    ) >>> 0
  );
}

export function computeBasisIdentityHash(featureFrame) {
  return hashModalIdentityPrefix(featureFrame).hash >>> 0;
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
  const activeModeCount = readActiveModeCount(featureFrame);
  const modalIdentitySlots = copyModalIdentities(
    featureFrame?.modalFieldSlots,
    activeModeCount,
  );
  const modalRoleMetadata = buildVisibleModeRoleMetadata(
    featureFrame,
    activeModeCount,
    committedModes,
  );
  const committedModeMetadata = buildCommittedModeMetadata({
    activeModeCount,
    committedModes,
    modalIdentitySlots,
    modalRoleMetadata,
  });
  const packet = {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration,
    workerGeneration,
    topologyRevision,
    sessionKey: sessionKey ?? null,
    inputSignature: inputSignature ?? null,
    captureTimestampMs,
    activeModeCount,
    activeSourceCoupledModeCount: countModeRole(modalRoleMetadata, 1),
    activeResonantModeCount: countModeRole(modalRoleMetadata, 2),
    modalRoleMetadata,
    modalIdentitySlots,
    ...committedModeMetadata,
    ...cloneTopologySlotArrays(featureFrame, activeModeCount),
    modalFieldSpectralSeedDirection: copyFixedFloat32(
      featureFrame?.modalFieldSpectralSeedDirection ?? [1, 0],
      2,
    ),
    fastProbeModeIndices: copyProbeModeIndices(fastProbeModeIndices),
    basisIdentityHash: computeBasisIdentityHash(featureFrame),
    structuralFingerprint: cloneObjectWithoutTypedArrays(structuralFingerprint),
    structuralDiagnostics: cloneObjectWithoutTypedArrays(structuralDiagnostics),
    modalDescriptor: cloneModalDescriptorMetadata(
      featureFrame?.modalDescriptor,
    ),
  };
  return {
    ...packet,
    topologyFingerprint: computeFeatureTopologyFingerprint(featureFrame, {
      fastProbeModeIndices: packet.fastProbeModeIndices,
      modalRoleMetadata: packet.modalRoleMetadata,
      committedModeIdentitySlots: packet.committedModeIdentitySlots,
      committedModeFrequenciesHz: packet.committedModeFrequenciesHz,
      committedModeRoleMetadata: packet.committedModeRoleMetadata,
    }),
  };
}

function buildDriveArrays({
  featureFrame,
  topologyDrive,
  committedDriveSlots,
  committedPhaseSlots,
  activeModeCount,
  committedModeCount,
  buffers,
}) {
  const modalCoefficients = committedDriveSlots
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
      ));
  const phaseSlots = committedPhaseSlots
    ? copyFixedFloat32(
        committedPhaseSlots,
        committedModeCount * MODAL_SLOT_STRIDE,
        buffers?.phaseSlots,
      )
    : (topologyDrive?.phaseSlots ??
      copyFixedFloat32(
        featureFrame?.modalFieldPhaseSlots,
        committedModeCount * MODAL_SLOT_STRIDE,
        buffers?.phaseSlots,
      ));
  return { modalCoefficients, phaseSlots };
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
  observationTimeSeconds = captureTimestampMs / 1000,
  observationAdvancing = true,
  observationPaused = false,
  observationSourceKey = null,
  observationSessionKey = null,
  observationTimelineRevision = 0,
}) {
  // The worker-owned committed projection is already ordered against the
  // packet topology. Avoid constructing a second visible coefficient/phase
  // projection when that canonical full-width drive is present.
  const topologyDrive =
    topologyPacket && !committedDriveSlots
      ? copyDriveSlotsForTopology(featureFrame, topologyPacket, driveLayers)
      : null;
  const activeModeCount = topologyPacket
    ? toModeCount(topologyPacket.activeModeCount)
    : readActiveModeCount(featureFrame);
  const committedModeCount = committedDriveSlots
    ? Math.floor(committedDriveSlots.length / MODAL_SLOT_STRIDE)
    : activeModeCount;
  const driveArrays = buildDriveArrays({
    featureFrame,
    topologyDrive,
    committedDriveSlots,
    committedPhaseSlots,
    activeModeCount,
    committedModeCount,
    buffers,
  });
  const patternFrozen =
    featureFrame?.diagnosticControlState?.freezeModeSlots === true;
  return {
    protocolVersion: AUDIO_FEATURE_PROTOCOL_VERSION,
    sourceGeneration,
    workerGeneration,
    topologyRevision,
    frameId,
    captureTimestampMs,
    processingTimestampMs,
    observationTimeSeconds,
    observationAdvancing:
      patternFrozen !== true && observationAdvancing === true,
    observationPaused: patternFrozen || observationPaused === true,
    observationSourceKey,
    observationSessionKey,
    observationTimelineRevision: Math.max(
      0,
      Math.floor(observationTimelineRevision ?? 0),
    ),
    activeModeCount,
    committedModeCount,
    ...driveArrays,
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

function createRendererModalDescriptor(topology, drive) {
  if (!topology.modalDescriptor) {
    return null;
  }
  return Object.freeze({
    ...topology.modalDescriptor,
    slotViews: Object.freeze({
      modalIdentitySlots: topology.modalIdentitySlots,
      modalCoefficientSlots: drive.modalCoefficients,
      modalFieldPhaseSlots: drive.phaseSlots,
      modalFieldSpectralMomentSlots: topology.modalFieldSpectralMomentSlots,
      modalFieldMetadataSlots: topology.modalFieldMetadataSlots,
    }),
  });
}

/**
 * Creates the renderer-facing immutable view from a complete packet model.
 * Packet arrays retain their topology or drive ownership through the renderer
 * boundary. The raymarch modal compiler is the sole owner of the packed GPU
 * projection.
 * @returns {(import("../../contracts/audioFeatureProtocol.js").RendererFeatureFrame & Record<string, unknown>) | null}
 */
export function createRendererFeatureView(model) {
  if (!isCompleteAudioFeatureModel(model)) {
    return null;
  }
  const topology = model.topology;
  const drive = model.drive;
  const modalDescriptor = createRendererModalDescriptor(topology, drive);
  if (!isCanonicalModalDescriptor(modalDescriptor)) {
    return null;
  }
  return Object.freeze({
    ...drive.renderState,
    frameId: drive.frameId,
    sourceGeneration: drive.sourceGeneration,
    workerGeneration: drive.workerGeneration,
    frameTimeMs: drive.captureTimestampMs,
    captureTimestampMs: drive.captureTimestampMs,
    processingTimestampMs: drive.processingTimestampMs,
    observationTimeSeconds: drive.observationTimeSeconds,
    observationAdvancing: drive.observationAdvancing === true,
    observationPaused: drive.observationPaused === true,
    observationSourceKey: drive.observationSourceKey ?? null,
    observationSessionKey: drive.observationSessionKey ?? null,
    observationTimelineRevision: Math.max(
      0,
      Math.floor(drive.observationTimelineRevision ?? 0),
    ),
    observationInputSignature: topology.inputSignature ?? null,
    topologyRevision: topology.topologyRevision,
    basisIdentityHash: topology.basisIdentityHash,
    modalIdentitySlots: topology.modalIdentitySlots,
    modalCoefficientSlots: drive.modalCoefficients,
    modalFieldPhaseSlots: drive.phaseSlots,
    modalFieldSpectralMomentSlots: topology.modalFieldSpectralMomentSlots,
    modalFieldSpectralSeedDirection: topology.modalFieldSpectralSeedDirection,
    modalFieldMetadataSlots: topology.modalFieldMetadataSlots,
    bandEnergies: drive.bandEnergies,
    spectralBandEnergies: drive.spectralBandEnergies,
    activeModeCount: drive.activeModeCount,
    activeModalFieldModeCount: drive.activeModeCount,
    committedModeCount: drive.committedModeCount,
    modalDescriptor,
  });
}

/**
 * Restores the renderer view's single-owner slot aliases after a process
 * transport clones repeated typed-array references independently. The packet
 * values remain authoritative; this boundary only reconnects the descriptor's
 * slot views to the transported top-level renderer arrays.
 *
 * @template T
 * @param {T} featureFrame
 * @returns {T}
 */
export function restoreTransportedRendererFeatureViewOwnership(featureFrame) {
  if (!featureFrame || typeof featureFrame !== "object") {
    return featureFrame;
  }
  const transportedFrame = /** @type {Record<string, any>} */ (featureFrame);
  const modalDescriptor = transportedFrame.modalDescriptor;
  const descriptorSlots = modalDescriptor?.slotViews;
  if (
    !isCanonicalModalDescriptor(modalDescriptor) ||
    !(transportedFrame.modalIdentitySlots instanceof Float32Array) ||
    !(transportedFrame.modalCoefficientSlots instanceof Float32Array) ||
    !(transportedFrame.modalFieldPhaseSlots instanceof Float32Array)
  ) {
    return featureFrame;
  }

  const restoredSlots = {
    ...descriptorSlots,
    modalIdentitySlots: transportedFrame.modalIdentitySlots,
    modalCoefficientSlots: transportedFrame.modalCoefficientSlots,
    modalFieldPhaseSlots: transportedFrame.modalFieldPhaseSlots,
    modalFieldSpectralMomentSlots:
      transportedFrame.modalFieldSpectralMomentSlots ??
      descriptorSlots.modalFieldSpectralMomentSlots,
    modalFieldMetadataSlots:
      transportedFrame.modalFieldMetadataSlots ??
      descriptorSlots.modalFieldMetadataSlots,
  };
  const ownershipAlreadyCanonical = Object.keys(restoredSlots).every(
    (key) => restoredSlots[key] === descriptorSlots[key],
  );
  if (ownershipAlreadyCanonical) {
    return featureFrame;
  }

  const restoredDescriptor = Object.freeze({
    ...modalDescriptor,
    slotViews: Object.freeze(restoredSlots),
  });
  return /** @type {T} */ (
    Object.freeze({
      ...transportedFrame,
      modalDescriptor: restoredDescriptor,
    })
  );
}
