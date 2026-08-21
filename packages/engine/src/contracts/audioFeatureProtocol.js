// v2 is a hard cutover from renderer-ready RGB/lane payloads to the canonical
// spectral first/second-moment basis. Mixed generations or protocol versions
// are rejected before a renderer-facing model can publish.
export const AUDIO_FEATURE_PROTOCOL_VERSION = 2;

/** @typedef {"complete" | "capacity-limited" | "bandwidth-limited" | "blocked"} ModalFieldAuthority */

/**
 * @typedef {object} AudioFeatureTopologyPacket
 * @property {number} protocolVersion
 * @property {number} sourceGeneration
 * @property {number} workerGeneration
 * @property {number} topologyRevision
 * @property {number} activeModeCount
 * @property {number} committedModeCount
 * @property {Float32Array} modalIdentitySlots
 * @property {Float32Array} committedModeIdentitySlots
 * @property {Float32Array} committedModeFrequenciesHz
 * @property {Uint8Array} modalRoleMetadata
 * @property {Uint8Array} committedModeRoleMetadata
 * @property {Uint16Array} fastProbeModeIndices
 * @property {Float32Array} modalFieldSpectralMomentSlots
 * @property {Float32Array} modalFieldSpectralSeedDirection
 * @property {Float32Array} modalFieldMetadataSlots
 * @property {string | null} [inputSignature]
 * @property {number} [basisIdentityHash]
 * @property {unknown} [modalDescriptor]
 */

/**
 * @typedef {object} AudioFeatureDrivePacket
 * @property {number} protocolVersion
 * @property {number} sourceGeneration
 * @property {number} workerGeneration
 * @property {number} topologyRevision
 * @property {number} frameId
 * @property {number} activeModeCount
 * @property {number} committedModeCount
 * @property {Float32Array} modalCoefficients
 * @property {Float32Array} phaseSlots
 * @property {Float32Array} bandEnergies
 * @property {Float32Array} spectralBandEnergies
 * @property {Record<string, unknown> & {renderAuthority: boolean}} renderState
 * @property {number} [captureTimestampMs]
 * @property {number} [processingTimestampMs]
 * @property {number} [observationTimeSeconds]
 * @property {boolean} [observationAdvancing]
 * @property {boolean} [observationPaused]
 * @property {string | null} [observationSourceKey]
 * @property {string | null} [observationSessionKey]
 * @property {number} [observationTimelineRevision]
 */

/**
 * @typedef {object} CompleteAudioFeatureModel
 * @property {AudioFeatureTopologyPacket} topology
 * @property {AudioFeatureDrivePacket} drive
 */

/**
 * @typedef {object} CanonicalModalDescriptor
 * @property {ModalFieldAuthority} fieldAuthority
 * @property {{ modalFieldModeCount: number }} counts
 * @property {Record<string, unknown>} slotViews
 */

/**
 * @typedef {object} RendererFeatureFrame
 * @property {number} frameId
 * @property {number} sourceGeneration
 * @property {number} workerGeneration
 * @property {number} topologyRevision
 * @property {number} activeModeCount
 * @property {number} activeModalFieldModeCount
 * @property {Float32Array} modalIdentitySlots
 * @property {Float32Array} modalCoefficientSlots
 * @property {Float32Array} modalFieldPhaseSlots
 * @property {number} [modalPhaseAnchorAngularVelocityRadPerSec]
 * @property {CanonicalModalDescriptor} modalDescriptor
 * @property {boolean} renderAuthority
 * @property {boolean} [renderAuthorityRevoked]
 * @property {boolean} [audioMotionAuthority]
 * @property {string} [fieldState]
 * @property {Record<string, unknown>} [energyLedger]
 * @property {Record<string, unknown>} [sourceEvidence]
 */

const TOPOLOGY_SLOT_ARRAY_KEYS = Object.freeze([
  "modalFieldSpectralMomentSlots",
  "modalFieldMetadataSlots",
]);

const MODAL_FIELD_AUTHORITIES = new Set([
  "complete",
  "capacity-limited",
  "bandwidth-limited",
  "blocked",
]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value */
export function isPositiveProtocolInteger(value) {
  return Number.isInteger(value) && Number(value) > 0;
}

/** @param {unknown} value */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && Number(value) >= 0;
}

/**
 * @param {unknown} value
 * @param {number} length
 * @returns {value is Float32Array}
 */
function isFloat32ArrayOfLength(value, length) {
  return value instanceof Float32Array && value.length === length;
}

/**
 * @param {Record<string, unknown>} packet
 * @returns {packet is Record<string, unknown> & {activeModeCount: number, committedModeCount: number}}
 */
function hasValidModeCounts(packet) {
  const activeModeCount = packet.activeModeCount;
  const committedModeCount = packet.committedModeCount;
  return (
    isNonNegativeInteger(activeModeCount) &&
    isNonNegativeInteger(committedModeCount) &&
    Number(activeModeCount) <= Number(committedModeCount)
  );
}

/**
 * @param {unknown} value
 * @returns {value is AudioFeatureTopologyPacket}
 */
export function isAudioFeatureTopologyPacket(value) {
  if (!isRecord(value) || !hasValidModeCounts(value)) {
    return false;
  }
  const activeModeCount = value.activeModeCount;
  const committedModeCount = value.committedModeCount;
  if (
    value.protocolVersion !== AUDIO_FEATURE_PROTOCOL_VERSION ||
    !isPositiveProtocolInteger(value.sourceGeneration) ||
    !isPositiveProtocolInteger(value.workerGeneration) ||
    !isPositiveProtocolInteger(value.topologyRevision) ||
    !isFloat32ArrayOfLength(value.modalIdentitySlots, activeModeCount * 3) ||
    !isFloat32ArrayOfLength(
      value.committedModeIdentitySlots,
      committedModeCount * 3,
    ) ||
    !isFloat32ArrayOfLength(
      value.committedModeFrequenciesHz,
      committedModeCount,
    ) ||
    !(value.modalRoleMetadata instanceof Uint8Array) ||
    value.modalRoleMetadata.length !== activeModeCount ||
    !(value.committedModeRoleMetadata instanceof Uint8Array) ||
    value.committedModeRoleMetadata.length !== committedModeCount ||
    !(value.fastProbeModeIndices instanceof Uint16Array) ||
    !isFloat32ArrayOfLength(value.modalFieldSpectralSeedDirection, 2) ||
    !TOPOLOGY_SLOT_ARRAY_KEYS.every((key) =>
      isFloat32ArrayOfLength(value[key], activeModeCount * 4),
    )
  ) {
    return false;
  }

  for (let index = 0; index < activeModeCount * 3; index += 1) {
    if (
      value.modalIdentitySlots[index] !==
      value.committedModeIdentitySlots[index]
    ) {
      return false;
    }
  }

  return value.fastProbeModeIndices.every(
    (probeModeIndex) => probeModeIndex < committedModeCount,
  );
}

/**
 * @param {unknown} value
 * @returns {value is AudioFeatureDrivePacket}
 */
export function isAudioFeatureDrivePacket(value) {
  if (!isRecord(value) || !hasValidModeCounts(value)) {
    return false;
  }
  const committedModeCount = value.committedModeCount;
  return (
    value.protocolVersion === AUDIO_FEATURE_PROTOCOL_VERSION &&
    isPositiveProtocolInteger(value.sourceGeneration) &&
    isPositiveProtocolInteger(value.workerGeneration) &&
    isPositiveProtocolInteger(value.topologyRevision) &&
    isPositiveProtocolInteger(value.frameId) &&
    isFloat32ArrayOfLength(value.modalCoefficients, committedModeCount) &&
    isFloat32ArrayOfLength(value.phaseSlots, committedModeCount * 4) &&
    isFloat32ArrayOfLength(value.bandEnergies, 4) &&
    isFloat32ArrayOfLength(value.spectralBandEnergies, 4) &&
    isRecord(value.renderState) &&
    typeof value.renderState.renderAuthority === "boolean"
  );
}

/**
 * @param {unknown} drive
 * @param {unknown} topology
 * @returns {drive is AudioFeatureDrivePacket}
 */
export function audioFeatureDriveMatchesTopology(drive, topology) {
  return (
    isAudioFeatureDrivePacket(drive) &&
    isAudioFeatureTopologyPacket(topology) &&
    drive.sourceGeneration === topology.sourceGeneration &&
    drive.workerGeneration === topology.workerGeneration &&
    drive.topologyRevision === topology.topologyRevision &&
    drive.activeModeCount === topology.activeModeCount &&
    drive.committedModeCount === topology.committedModeCount
  );
}

/**
 * @param {unknown} value
 * @returns {value is CompleteAudioFeatureModel}
 */
export function isCompleteAudioFeatureModel(value) {
  return (
    isRecord(value) &&
    isAudioFeatureTopologyPacket(value.topology) &&
    audioFeatureDriveMatchesTopology(value.drive, value.topology)
  );
}

/** @param {unknown} value */
function isModalFieldAuthority(value) {
  return typeof value === "string" && MODAL_FIELD_AUTHORITIES.has(value);
}

/**
 * @param {Record<string, unknown>} slotViews
 * @returns {boolean}
 */
function hasSemanticDescriptorSlots(slotViews) {
  const fieldSlots = slotViews.modalFieldSlots;
  return (
    fieldSlots instanceof Float32Array &&
    fieldSlots.length % 4 === 0 &&
    isFloat32ArrayOfLength(slotViews.modalFieldPhaseSlots, fieldSlots.length) &&
    isFloat32ArrayOfLength(
      slotViews.modalFieldSpectralMomentSlots,
      fieldSlots.length,
    ) &&
    isFloat32ArrayOfLength(slotViews.modalFieldMetadataSlots, fieldSlots.length)
  );
}

/**
 * @param {Record<string, unknown>} slotViews
 * @returns {boolean}
 */
function hasRendererDescriptorSlots(slotViews) {
  const identities = slotViews.modalIdentitySlots;
  if (!(identities instanceof Float32Array) || identities.length % 3 !== 0) {
    return false;
  }
  const modeCount = identities.length / 3;
  return (
    slotViews.modalCoefficientSlots instanceof Float32Array &&
    slotViews.modalFieldPhaseSlots instanceof Float32Array &&
    slotViews.modalFieldPhaseSlots.length >= modeCount * 4 &&
    isFloat32ArrayOfLength(
      slotViews.modalFieldSpectralMomentSlots,
      modeCount * 4,
    ) &&
    isFloat32ArrayOfLength(slotViews.modalFieldMetadataSlots, modeCount * 4)
  );
}

/**
 * @param {unknown} value
 * @returns {value is CanonicalModalDescriptor}
 */
export function isCanonicalModalDescriptor(value) {
  if (
    !isRecord(value) ||
    !isModalFieldAuthority(value.fieldAuthority) ||
    !isRecord(value.counts) ||
    !isNonNegativeInteger(value.counts.modalFieldModeCount) ||
    !isRecord(value.slotViews)
  ) {
    return false;
  }
  return (
    hasSemanticDescriptorSlots(value.slotViews) ||
    hasRendererDescriptorSlots(value.slotViews)
  );
}

/**
 * @param {unknown} value
 * @returns {asserts value is CanonicalModalDescriptor}
 */
export function assertCanonicalModalDescriptor(value) {
  if (!isCanonicalModalDescriptor(value)) {
    throw new TypeError("Invalid canonical modal descriptor contract.");
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isRenderAuthorityFrame(value) {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.audioMotionAuthority != null &&
    typeof value.audioMotionAuthority !== "boolean"
  ) {
    return false;
  }
  if (value.energyLedger != null && !isRecord(value.energyLedger)) {
    return false;
  }
  if (value.sourceEvidence != null && !isRecord(value.sourceEvidence)) {
    return false;
  }
  if (value.modalDescriptor != null) {
    if (!isRecord(value.modalDescriptor)) {
      return false;
    }
    const fieldAuthority = value.modalDescriptor.fieldAuthority;
    if (fieldAuthority != null && !isModalFieldAuthority(fieldAuthority)) {
      return false;
    }
  }
  return true;
}

/**
 * @param {unknown} featureFrame
 * @param {unknown} modalDescriptor
 * @returns {featureFrame is RendererFeatureFrame}
 */
export function isRendererFeatureUploadContract(featureFrame, modalDescriptor) {
  if (
    !isRecord(featureFrame) ||
    !isCanonicalModalDescriptor(modalDescriptor) ||
    !isPositiveProtocolInteger(featureFrame.frameId) ||
    !isPositiveProtocolInteger(featureFrame.sourceGeneration) ||
    !isPositiveProtocolInteger(featureFrame.workerGeneration) ||
    !isPositiveProtocolInteger(featureFrame.topologyRevision) ||
    !isNonNegativeInteger(featureFrame.activeModeCount) ||
    !isNonNegativeInteger(featureFrame.activeModalFieldModeCount) ||
    typeof featureFrame.renderAuthority !== "boolean" ||
    !(featureFrame.modalIdentitySlots instanceof Float32Array) ||
    !(featureFrame.modalCoefficientSlots instanceof Float32Array) ||
    !(featureFrame.modalFieldPhaseSlots instanceof Float32Array)
  ) {
    return false;
  }
  const topologyModeCount = featureFrame.modalIdentitySlots.length / 3;
  const activeModeCount = Number(featureFrame.activeModalFieldModeCount);
  const descriptorSlots = modalDescriptor.slotViews;
  return (
    Number.isInteger(topologyModeCount) &&
    activeModeCount === Number(featureFrame.activeModeCount) &&
    activeModeCount <= topologyModeCount &&
    featureFrame.modalCoefficientSlots.length >= activeModeCount &&
    featureFrame.modalFieldPhaseSlots.length >= topologyModeCount * 4 &&
    Number(modalDescriptor.counts.modalFieldModeCount) === topologyModeCount &&
    descriptorSlots.modalIdentitySlots === featureFrame.modalIdentitySlots &&
    descriptorSlots.modalCoefficientSlots ===
      featureFrame.modalCoefficientSlots &&
    descriptorSlots.modalFieldPhaseSlots === featureFrame.modalFieldPhaseSlots &&
    modalDescriptor === featureFrame.modalDescriptor
  );
}

/**
 * @param {unknown} featureFrame
 * @param {unknown} modalDescriptor
 * @returns {asserts featureFrame is RendererFeatureFrame}
 */
export function assertRendererFeatureUploadContract(
  featureFrame,
  modalDescriptor,
) {
  if (!isRendererFeatureUploadContract(featureFrame, modalDescriptor)) {
    throw new TypeError("Invalid renderer feature upload contract.");
  }
}
