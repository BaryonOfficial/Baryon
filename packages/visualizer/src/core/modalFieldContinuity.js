export const TOPOLOGY_ADMIT_EVIDENCE = 0.08;
export const TOPOLOGY_PROMOTE_SECONDS = 0.05;
export const TOPOLOGY_RELEASE_EVIDENCE = 0.025;
export const TOPOLOGY_BOOTSTRAP_EVIDENCE = 0;
export const TOPOLOGY_RELEASE_SECONDS = 0.13;
export const BASIS_REASSIGN_MIN_SECONDS = 0.067;
export const IDENTITY_RETENTION_MIN = 0.72;
const TOPOLOGY_REPLACE_EVIDENCE_MARGIN = 0.08;
const TOPOLOGY_REPLACE_EVIDENCE_RATIO = 1.35;
const TOPOLOGY_REPLACE_MAX_FRACTION = 0.4;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeDeltaTimeSec(deltaTimeSec) {
  if (!Number.isFinite(deltaTimeSec) || deltaTimeSec <= 0) {
    return 0;
  }
  return deltaTimeSec;
}

function normalizeModeCoordinate(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function buildModeKey(u, v, w) {
  return `${normalizeModeCoordinate(u)}:${normalizeModeCoordinate(
    v,
  )}:${normalizeModeCoordinate(w)}`;
}

function getModeOrder(mode) {
  return Math.max(
    Math.abs(normalizeModeCoordinate(mode?.[0])),
    Math.abs(normalizeModeCoordinate(mode?.[1])),
    Math.abs(normalizeModeCoordinate(mode?.[2])),
  );
}

function normalizeMaxBasisModeOrder(maxBasisModeOrder) {
  return Number.isFinite(maxBasisModeOrder)
    ? Math.max(0, Math.floor(maxBasisModeOrder))
    : Infinity;
}

function cloneSlotQuad(source, offset) {
  return [
    source?.[offset] ?? 0,
    source?.[offset + 1] ?? 0,
    source?.[offset + 2] ?? 0,
    source?.[offset + 3] ?? 0,
  ];
}

function readActiveCount(descriptorSource) {
  if (Number.isFinite(descriptorSource?.activeModalFieldModeCount)) {
    return Math.max(0, Math.floor(descriptorSource.activeModalFieldModeCount));
  }
  return Math.floor((descriptorSource?.modalFieldSlots?.length ?? 0) / 4);
}

function readCandidateEntries(
  descriptorSource,
  { normalizeCandidateEvidence = false, maxBasisModeOrder = Infinity } = {},
) {
  const entries = [];
  const activeCount = readActiveCount(descriptorSource);
  const slotCount = Math.floor(
    (descriptorSource?.modalFieldSlots?.length ?? 0) / 4,
  );
  const count = Math.min(activeCount, slotCount);
  const normalizedMaxBasisModeOrder =
    normalizeMaxBasisModeOrder(maxBasisModeOrder);
  let maxCoefficient = 0;
  if (normalizeCandidateEvidence) {
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      maxCoefficient = Math.max(
        maxCoefficient,
        descriptorSource?.modalFieldSlots?.[offset + 3] ?? 0,
      );
    }
  }

  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const slot = cloneSlotQuad(descriptorSource.modalFieldSlots, offset);
    const phase = cloneSlotQuad(descriptorSource.modalFieldPhaseSlots, offset);
    const color = cloneSlotQuad(descriptorSource.modalFieldColorSlots, offset);
    const metadata = cloneSlotQuad(
      descriptorSource.modalFieldMetadataSlots,
      offset,
    );
    const modeKey = buildModeKey(slot[0], slot[1], slot[2]);
    const coefficient = Math.max(0, slot[3] ?? 0);
    const mode = [
      normalizeModeCoordinate(slot[0]),
      normalizeModeCoordinate(slot[1]),
      normalizeModeCoordinate(slot[2]),
    ];
    const observedSupport = clamp01(metadata[3] ?? 0);
    const relativeEvidence =
      normalizeCandidateEvidence && maxCoefficient > 0
        ? (coefficient / maxCoefficient) * TOPOLOGY_ADMIT_EVIDENCE
        : 0;
    const evidenceScore = clamp01(
      Math.max(coefficient, observedSupport, relativeEvidence),
    );

    entries.push({
      modeKey,
      mode,
      candidateIndex: index,
      basisRepresentable: getModeOrder(mode) <= normalizedMaxBasisModeOrder,
      evidenceScore,
      storedEnergySnapshot: coefficient * coefficient,
      payload: {
        slot: [
          normalizeModeCoordinate(slot[0]),
          normalizeModeCoordinate(slot[1]),
          normalizeModeCoordinate(slot[2]),
          slot[3] ?? 0,
        ],
        phase,
        color,
        metadata,
      },
    });
  }

  return entries;
}

function createRecord(entry, nowSec) {
  return {
    modeKey: entry.modeKey,
    mode: entry.mode,
    state: "candidate",
    evidenceScore: entry.evidenceScore,
    qualifyingEvidenceSec: 0,
    lowEvidenceSec: 0,
    lastObservedAtSec: nowSec,
    activeSinceSec: null,
    basisEligibleSinceSec: null,
    releaseStartedAtSec: null,
    lastCoefficientSnapshot: entry.payload.slot[3] ?? 0,
    lastStoredEnergySnapshot: entry.storedEnergySnapshot,
    eligibilityEpoch: 0,
    basisEligible: false,
    basisRepresentable: entry.basisRepresentable,
    candidateIndex: entry.candidateIndex,
    payload: entry.payload,
  };
}

function clearState(state) {
  state.recordsByModeKey.clear();
  state.visibleModeKeys = [];
  state.lastBasisReassignAtSec = Number.NEGATIVE_INFINITY;
  state.eligibilityEpoch += 1;
}

export function createModalFieldContinuityState() {
  return {
    recordsByModeKey: new Map(),
    visibleModeKeys: [],
    currentTimeSec: 0,
    lastBasisReassignAtSec: Number.NEGATIVE_INFINITY,
    eligibilityEpoch: 0,
    lastResetToken: undefined,
    diagnostics: null,
  };
}

function canReassignBasis(state, nowSec) {
  return (
    state.visibleModeKeys.length === 0 ||
    nowSec - state.lastBasisReassignAtSec >= BASIS_REASSIGN_MIN_SECONDS
  );
}

function markBasisChanged(state, nowSec) {
  state.lastBasisReassignAtSec = nowSec;
  state.eligibilityEpoch += 1;
}

function activateRecord(record, state, nowSec) {
  record.state = "active";
  record.activeSinceSec = record.activeSinceSec ?? nowSec;
  record.basisEligibleSinceSec = record.basisEligibleSinceSec ?? nowSec;
  record.releaseStartedAtSec = null;
  record.lowEvidenceSec = 0;
  record.basisEligible = true;
  record.eligibilityEpoch = state.eligibilityEpoch + 1;
  if (!state.visibleModeKeys.includes(record.modeKey)) {
    state.visibleModeKeys.push(record.modeKey);
  }
}

function updateRecordSnapshot(record, entry, nowSec) {
  record.mode = entry.mode;
  record.evidenceScore = entry.evidenceScore;
  record.lastObservedAtSec = nowSec;
  record.lastCoefficientSnapshot = entry.payload.slot[3] ?? 0;
  record.lastStoredEnergySnapshot = entry.storedEnergySnapshot;
  record.basisRepresentable = entry.basisRepresentable;
  record.candidateIndex = entry.candidateIndex;
  record.payload = entry.payload;
}

function muteRecordLivePayload(record) {
  const [u, v, w] = record.mode ?? [0, 0, 0];
  const phase = record.payload?.phase ?? [0, 0, 0, 0];
  const color = record.payload?.color ?? [0, 0, 0, 0];
  const metadata = record.payload?.metadata ?? [0, 0, 0, 0];
  record.lastCoefficientSnapshot = 0;
  record.lastStoredEnergySnapshot = 0;
  record.payload = {
    slot: [u, v, w, 0],
    phase: [phase[0] ?? 0, phase[1] ?? 0, 0, 0],
    color: [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, 0],
    metadata: [metadata[0] ?? 0, metadata[1] ?? 0, metadata[2] ?? 0, 0],
  };
}

function updateLowEvidenceRecord(record, deltaTimeSec, nowSec) {
  record.lowEvidenceSec += deltaTimeSec;
  record.qualifyingEvidenceSec = 0;
  record.state = record.basisEligible ? "releasing" : "candidate";
  if (record.basisEligible && record.releaseStartedAtSec == null) {
    record.releaseStartedAtSec = nowSec;
  }
}

function removeRecord(state, modeKey) {
  state.recordsByModeKey.delete(modeKey);
  state.visibleModeKeys = state.visibleModeKeys.filter(
    (key) => key !== modeKey,
  );
}

function countBasisEligibleRecords(state) {
  return Array.from(state.recordsByModeKey.values()).filter(
    (record) => record.basisEligible,
  ).length;
}

function getBasisEligibleRecords(state) {
  return state.visibleModeKeys
    .map((modeKey) => state.recordsByModeKey.get(modeKey))
    .filter((record) => record?.basisEligible);
}

function compareModeTuple(left, right) {
  const leftMode = left.mode ?? [0, 0, 0];
  const rightMode = right.mode ?? [0, 0, 0];
  for (let index = 0; index < 3; index += 1) {
    const delta =
      normalizeModeCoordinate(leftMode[index]) -
      normalizeModeCoordinate(rightMode[index]);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function compareAdmissionRecords(left, right) {
  const evidenceDelta = right.evidenceScore - left.evidenceScore;
  if (evidenceDelta !== 0) {
    return evidenceDelta;
  }
  const energyDelta =
    right.lastStoredEnergySnapshot - left.lastStoredEnergySnapshot;
  if (energyDelta !== 0) {
    return energyDelta;
  }
  const orderDelta = getModeOrder(left.mode) - getModeOrder(right.mode);
  if (orderDelta !== 0) {
    return orderDelta;
  }
  const candidateIndexDelta =
    (left.candidateIndex ?? 0) - (right.candidateIndex ?? 0);
  if (candidateIndexDelta !== 0) {
    return candidateIndexDelta;
  }
  return compareModeTuple(left, right);
}

function compareReplacementTargets(left, right) {
  const stateDelta =
    (left.state === "releasing" ? 0 : 1) -
    (right.state === "releasing" ? 0 : 1);
  if (stateDelta !== 0) {
    return stateDelta;
  }
  const evidenceDelta = left.evidenceScore - right.evidenceScore;
  if (evidenceDelta !== 0) {
    return evidenceDelta;
  }
  const energyDelta =
    left.lastStoredEnergySnapshot - right.lastStoredEnergySnapshot;
  if (energyDelta !== 0) {
    return energyDelta;
  }
  return compareModeTuple(left, right);
}

function selectAdmissionRecords(records, availableVisibleSlots) {
  if (availableVisibleSlots <= 0) {
    return [];
  }
  const orderedRecords = [...records].sort(compareAdmissionRecords);
  if (!Number.isFinite(availableVisibleSlots)) {
    return orderedRecords;
  }
  return orderedRecords.slice(0, availableVisibleSlots);
}

function selectReplacementPairs({
  state,
  candidateRecords,
  maxVisibleModeCount,
  alreadyAdmittedCount,
}) {
  if (
    !Number.isFinite(maxVisibleModeCount) ||
    maxVisibleModeCount <= 0 ||
    candidateRecords.length <= 0
  ) {
    return [];
  }
  const replacementBudget = Math.max(
    0,
    Math.ceil(maxVisibleModeCount * TOPOLOGY_REPLACE_MAX_FRACTION) -
      alreadyAdmittedCount,
  );
  if (replacementBudget <= 0) {
    return [];
  }
  const targets = getBasisEligibleRecords(state).sort(
    compareReplacementTargets,
  );
  const candidates = [...candidateRecords].sort(compareAdmissionRecords);
  const pairs = [];
  const usedTargetKeys = new Set();

  for (const candidate of candidates) {
    const target = targets.find(
      (record) =>
        !usedTargetKeys.has(record.modeKey) &&
        candidate.evidenceScore >
          Math.max(
            record.evidenceScore + TOPOLOGY_REPLACE_EVIDENCE_MARGIN,
            record.evidenceScore * TOPOLOGY_REPLACE_EVIDENCE_RATIO,
          ),
    );
    if (!target) {
      continue;
    }
    pairs.push({ candidate, target });
    usedTargetKeys.add(target.modeKey);
    if (pairs.length >= replacementBudget) {
      break;
    }
  }

  return pairs;
}

function writeDescriptorSource(records) {
  const modalFieldSlots = new Float32Array(records.length * 4);
  const modalFieldPhaseSlots = new Float32Array(records.length * 4);
  const modalFieldColorSlots = new Float32Array(records.length * 4);
  const modalFieldMetadataSlots = new Float32Array(records.length * 4);

  records.forEach((record, index) => {
    const offset = index * 4;
    modalFieldSlots.set(record.payload.slot, offset);
    modalFieldPhaseSlots.set(record.payload.phase, offset);
    modalFieldColorSlots.set(record.payload.color, offset);
    modalFieldMetadataSlots.set(record.payload.metadata, offset);
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldColorSlots,
    modalFieldMetadataSlots,
    activeModalFieldModeCount: records.length,
  };
}

function buildDiagnostics({
  state,
  candidateEntries,
  outputRecords,
  previousVisibleKeys,
  admittedModeKeys,
  removedModeKeys,
  reset,
}) {
  const outputModeKeys = outputRecords.map((record) => record.modeKey);
  const outputModeKeySet = new Set(outputModeKeys);
  const previousVisibleSet = new Set(previousVisibleKeys);
  const admittedSet = new Set(admittedModeKeys);
  const retainedModeKeys = outputModeKeys.filter(
    (modeKey) => previousVisibleSet.has(modeKey) && !admittedSet.has(modeKey),
  );
  const releasingModeKeys = outputRecords
    .filter((record) => record.state === "releasing")
    .map((record) => record.modeKey);
  const tailModeKeys = candidateEntries
    .map((entry) => entry.modeKey)
    .filter((modeKey) => !outputModeKeySet.has(modeKey));
  const activeModeCount = countBasisEligibleRecords(state);
  const previousVisibleCount = previousVisibleKeys.length;
  const modeIdentityRetentionRatio =
    previousVisibleCount > 0
      ? retainedModeKeys.length / previousVisibleCount
      : outputModeKeys.length > 0
        ? 1
        : 0;

  return {
    reset,
    dormant: false,
    eligibilityEpoch: state.eligibilityEpoch,
    candidateModeCount: candidateEntries.length,
    activeModeCount,
    visibleModeCount: outputRecords.length,
    admittedModeKeys,
    retainedModeKeys,
    releasingModeKeys,
    removedModeKeys,
    tailModeKeys,
    basisEligibleModeKeys: outputModeKeys,
    modeIdentityRetentionRatio,
  };
}

function buildDormantResult({
  state,
  candidateEntries,
  previousVisibleKeys,
  reset,
}) {
  const activeModeCount = countBasisEligibleRecords(state);
  const diagnostics = {
    reset,
    dormant: true,
    eligibilityEpoch: state.eligibilityEpoch,
    candidateModeCount: candidateEntries.length,
    activeModeCount,
    visibleModeCount: 0,
    admittedModeKeys: [],
    retainedModeKeys: previousVisibleKeys.filter((modeKey) =>
      state.recordsByModeKey.has(modeKey),
    ),
    releasingModeKeys: [],
    removedModeKeys: [],
    tailModeKeys: candidateEntries.map((entry) => entry.modeKey),
    basisEligibleModeKeys: [],
    modeIdentityRetentionRatio: activeModeCount > 0 ? 1 : 0,
  };
  state.diagnostics = diagnostics;
  return {
    descriptorSource: writeDescriptorSource([]),
    diagnostics,
  };
}

/**
 * @param {ReturnType<typeof createModalFieldContinuityState>} state
 * @param {{
 *   descriptorSource?: {
 *     modalFieldSlots?: Float32Array | number[],
 *     modalFieldPhaseSlots?: Float32Array | number[],
 *     modalFieldColorSlots?: Float32Array | number[],
 *     modalFieldMetadataSlots?: Float32Array | number[],
 *     activeModalFieldModeCount?: number,
 *   },
 *   deltaTimeSec?: number,
 *   resetToken?: unknown,
 *   renderAuthority?: boolean,
 *   maxVisibleModeCount?: number,
 *   maxBasisModeOrder?: number,
 *   allowImmediateBootstrap?: boolean,
 *   normalizeCandidateEvidence?: boolean,
 * }} options
 */
export function updateModalFieldContinuity(
  state = createModalFieldContinuityState(),
  {
    descriptorSource,
    deltaTimeSec = 0,
    resetToken = null,
    renderAuthority = true,
    maxVisibleModeCount = Infinity,
    maxBasisModeOrder = Infinity,
    allowImmediateBootstrap = false,
    normalizeCandidateEvidence = false,
  } = {},
) {
  const resolvedDeltaTimeSec = normalizeDeltaTimeSec(deltaTimeSec);
  const normalizedMaxVisibleModeCount = Number.isFinite(maxVisibleModeCount)
    ? Math.max(0, Math.floor(maxVisibleModeCount))
    : Infinity;
  const hadResetToken = state.lastResetToken !== undefined;
  const reset = hadResetToken && state.lastResetToken !== resetToken;
  if (reset) {
    clearState(state);
  }
  state.lastResetToken = resetToken;
  state.currentTimeSec += resolvedDeltaTimeSec;
  const nowSec = state.currentTimeSec;
  const previousVisibleKeys = [...state.visibleModeKeys];
  const candidateEntries = readCandidateEntries(descriptorSource, {
    normalizeCandidateEvidence,
    maxBasisModeOrder,
  });

  if (!renderAuthority) {
    return buildDormantResult({
      state,
      candidateEntries,
      previousVisibleKeys,
      reset,
    });
  }

  const currentEntryByModeKey = new Map();
  for (const entry of candidateEntries) {
    currentEntryByModeKey.set(entry.modeKey, entry);
    let record = state.recordsByModeKey.get(entry.modeKey);
    if (!record) {
      record = createRecord(entry, nowSec);
      state.recordsByModeKey.set(entry.modeKey, record);
    }

    updateRecordSnapshot(record, entry, nowSec);

    if (entry.evidenceScore >= TOPOLOGY_RELEASE_EVIDENCE) {
      record.lowEvidenceSec = 0;
      record.releaseStartedAtSec = null;
      if (record.basisEligible) {
        record.state = "active";
      }
    } else {
      updateLowEvidenceRecord(record, resolvedDeltaTimeSec, nowSec);
    }

    if (!record.basisEligible) {
      if (
        entry.basisRepresentable &&
        entry.evidenceScore >= TOPOLOGY_ADMIT_EVIDENCE
      ) {
        record.qualifyingEvidenceSec += resolvedDeltaTimeSec;
      } else {
        record.qualifyingEvidenceSec = 0;
      }
    }
  }

  const admittedModeKeys = [];
  const removedModeKeys = [];
  const allowBootstrapAdmission =
    allowImmediateBootstrap && previousVisibleKeys.length === 0;
  if (canReassignBasis(state, nowSec)) {
    const eligibleRecords = [];
    for (const record of state.recordsByModeKey.values()) {
      if (
        !record.basisEligible &&
        record.basisRepresentable &&
        (record.qualifyingEvidenceSec >= TOPOLOGY_PROMOTE_SECONDS ||
          (allowBootstrapAdmission &&
            record.evidenceScore > TOPOLOGY_BOOTSTRAP_EVIDENCE))
      ) {
        eligibleRecords.push(record);
      }
    }

    const availableVisibleSlots = Number.isFinite(normalizedMaxVisibleModeCount)
      ? Math.max(
          0,
          normalizedMaxVisibleModeCount - countBasisEligibleRecords(state),
        )
      : Infinity;
    const selectedRecords = selectAdmissionRecords(
      eligibleRecords,
      availableVisibleSlots,
    );
    const selectedRecordKeys = new Set(
      selectedRecords.map((record) => record.modeKey),
    );
    const replacementPairs = selectReplacementPairs({
      state,
      candidateRecords: eligibleRecords.filter(
        (record) => !selectedRecordKeys.has(record.modeKey),
      ),
      maxVisibleModeCount: normalizedMaxVisibleModeCount,
      alreadyAdmittedCount: selectedRecords.length,
    });
    if (selectedRecords.length > 0 || replacementPairs.length > 0) {
      for (const record of selectedRecords) {
        activateRecord(record, state, nowSec);
        admittedModeKeys.push(record.modeKey);
      }
      for (const { candidate, target } of replacementPairs) {
        removeRecord(state, target.modeKey);
        removedModeKeys.push(target.modeKey);
        activateRecord(candidate, state, nowSec);
        admittedModeKeys.push(candidate.modeKey);
      }
      markBasisChanged(state, nowSec);
    }
  }

  for (const [modeKey, record] of Array.from(
    state.recordsByModeKey.entries(),
  )) {
    if (currentEntryByModeKey.has(modeKey)) {
      if (
        record.basisEligible &&
        record.lowEvidenceSec >= TOPOLOGY_RELEASE_SECONDS &&
        canReassignBasis(state, nowSec)
      ) {
        removeRecord(state, modeKey);
        removedModeKeys.push(modeKey);
        markBasisChanged(state, nowSec);
      }
      continue;
    }

    if (!record.basisEligible) {
      state.recordsByModeKey.delete(modeKey);
      continue;
    }

    muteRecordLivePayload(record);
    updateLowEvidenceRecord(record, resolvedDeltaTimeSec, nowSec);
    if (
      record.lowEvidenceSec >= TOPOLOGY_RELEASE_SECONDS &&
      canReassignBasis(state, nowSec)
    ) {
      removeRecord(state, modeKey);
      removedModeKeys.push(modeKey);
      markBasisChanged(state, nowSec);
    }
  }

  const outputRecords = state.visibleModeKeys
    .map((modeKey) => state.recordsByModeKey.get(modeKey))
    .filter((record) => record?.basisEligible)
    .slice(0, normalizedMaxVisibleModeCount);
  const descriptorSourceOutput = writeDescriptorSource(outputRecords);
  const diagnostics = buildDiagnostics({
    state,
    candidateEntries,
    outputRecords,
    previousVisibleKeys,
    admittedModeKeys,
    removedModeKeys,
    reset,
  });
  state.diagnostics = diagnostics;

  return {
    descriptorSource: descriptorSourceOutput,
    diagnostics,
  };
}
