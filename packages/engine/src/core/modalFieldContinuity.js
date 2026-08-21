import { DEFAULT_EFFECTIVE_CAVITY_GEOMETRY } from "./cavityGeometry.js";
import { getModalGeometryBackend } from "./modalGeometryBackend.js";
import {
  buildModalTopologyModeKey,
  normalizeModalTopologyCoordinate,
} from "./modalTopology.js";
import { clamp01 } from "../utils/math.js";

const TOPOLOGY_CONFIDENCE_EVIDENCE = 0.08;
export const TOPOLOGY_PROMOTE_SECONDS = 1 / 30;
export const TOPOLOGY_RELEASE_SECONDS = 0.13;
// Modal coefficients arrive here after modalResponse has resolved the current
// forced response and the Q-dependent stored residue. These
// one-structural-frame ramps are numerical page-swap protection only; deriving
// them from Q would damp the same coefficient twice and turn bass handoffs into
// hundreds of milliseconds.
export const TOPOLOGY_ADMISSION_FADE_SECONDS = 1 / 30;
export const TOPOLOGY_EVICTION_FADE_SECONDS = 1 / 30;
const TOPOLOGY_FADE_SETTLE_FACTOR = 3;
export const BASIS_REASSIGN_MIN_SECONDS = 1 / 30;
const CONTINUITY_TIME_EPSILON_SEC = 1e-6;
const TOPOLOGY_REPLACE_EVIDENCE_MARGIN = 0.08;
const TOPOLOGY_REPLACE_EVIDENCE_RATIO = 1.35;
const TOPOLOGY_REPLACE_MISSING_SHELL_SCORE_RATIO = 0.4;
const TOPOLOGY_REPLACE_MAX_FRACTION = 0.4;

function normalizeDeltaTimeSec(deltaTimeSec) {
  if (!Number.isFinite(deltaTimeSec) || deltaTimeSec <= 0) {
    return 0;
  }
  return deltaTimeSec;
}

function normalizeReleaseSeconds(releaseSeconds) {
  if (!Number.isFinite(releaseSeconds) || releaseSeconds <= 0) {
    return TOPOLOGY_RELEASE_SECONDS;
  }
  return releaseSeconds;
}

function normalizeModeCoordinate(value) {
  return normalizeModalTopologyCoordinate(value);
}

function getModeOrder(mode) {
  return Math.max(
    Math.abs(normalizeModeCoordinate(mode?.[0])),
    Math.abs(normalizeModeCoordinate(mode?.[1])),
    Math.abs(normalizeModeCoordinate(mode?.[2])),
  );
}

function normalizeMaxVisibleModeCount(maxVisibleModeCount) {
  return Number.isFinite(maxVisibleModeCount)
    ? Math.max(0, Math.floor(maxVisibleModeCount))
    : Infinity;
}

function normalizeMaxHandoffModeCount(maxHandoffModeCount) {
  return Number.isFinite(maxHandoffModeCount)
    ? Math.max(0, Math.floor(maxHandoffModeCount))
    : 0;
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

function computeCandidateEvidenceScore({
  coefficient,
  observedSupport,
  relativeEvidence,
}) {
  const amplitudeEvidence = Math.max(coefficient, relativeEvidence);
  return clamp01(observedSupport * amplitudeEvidence);
}

function readCandidateEntries(
  descriptorSource,
  {
    normalizeCandidateEvidence = false,
    modalGeometryBackend = getModalGeometryBackend(
      DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
    ),
  } = {},
) {
  const entries = [];
  const activeCount = readActiveCount(descriptorSource);
  const slotCount = Math.floor(
    (descriptorSource?.modalFieldSlots?.length ?? 0) / 4,
  );
  const count = Math.min(activeCount, slotCount);
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
    const spectralMoment = cloneSlotQuad(
      descriptorSource.modalFieldSpectralMomentSlots,
      offset,
    );
    const metadata = cloneSlotQuad(
      descriptorSource.modalFieldMetadataSlots,
      offset,
    );
    const modeKey = buildModalTopologyModeKey(slot[0], slot[1], slot[2]);
    const coefficient = Math.max(0, slot[3] ?? 0);
    if (!(coefficient > 0)) {
      continue;
    }
    const mode = [
      normalizeModeCoordinate(slot[0]),
      normalizeModeCoordinate(slot[1]),
      normalizeModeCoordinate(slot[2]),
    ];
    const observedSupport = clamp01(metadata[3] ?? 0);
    const relativeEvidence =
      normalizeCandidateEvidence && maxCoefficient > 0
        ? coefficient / maxCoefficient
        : 0;
    const evidenceScore = computeCandidateEvidenceScore({
      coefficient,
      observedSupport,
      relativeEvidence,
    });
    const topologySource = { mode };

    entries.push({
      modeKey,
      mode,
      topologyGeometry: modalGeometryBackend.cavityGeometry,
      topologyShellKey: modalGeometryBackend.getModeShellKey(topologySource),
      topologyFamilyKey: modalGeometryBackend.getModeFamilyKey(topologySource),
      candidateIndex: index,
      evidenceScore,
      storedEnergySnapshot: coefficient * coefficient,
      observedSupport,
      payload: {
        slot: [
          normalizeModeCoordinate(slot[0]),
          normalizeModeCoordinate(slot[1]),
          normalizeModeCoordinate(slot[2]),
          slot[3] ?? 0,
        ],
        phase,
        spectralMoment,
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
    fadeInStartedAtSec: null,
    fadeInWindowSec: null,
    evictionStartedAtSec: null,
    evictionWindowSec: null,
    lastCoefficientSnapshot: entry.payload.slot[3] ?? 0,
    lastStoredEnergySnapshot: entry.storedEnergySnapshot,
    topologyGeometry: entry.topologyGeometry,
    topologyShellKey: entry.topologyShellKey,
    topologyFamilyKey: entry.topologyFamilyKey,
    eligibilityEpoch: 0,
    basisEligible: false,
    candidateIndex: entry.candidateIndex,
    payload: entry.payload,
    lastRenderablePayload: entry.payload,
  };
}

function clearState(state) {
  state.recordsByModeKey.clear();
  state.visibleModeKeys = [];
  state.lastBasisReassignAtSec = Number.NEGATIVE_INFINITY;
}

export function createModalFieldContinuityState() {
  return {
    recordsByModeKey: new Map(),
    visibleModeKeys: [],
    currentTimeSec: 0,
    lastBasisReassignAtSec: Number.NEGATIVE_INFINITY,
    eligibilityEpoch: 0,
    lastResetToken: undefined,
  };
}

export function hasVisibleModalFieldContinuityPayload(state) {
  if (!state?.visibleModeKeys?.length || !state?.recordsByModeKey) {
    return false;
  }

  return state.visibleModeKeys.some((modeKey) => {
    const record = state.recordsByModeKey.get(modeKey);
    const coefficient =
      record?.lastRenderablePayload?.slot?.[3] ??
      record?.payload?.slot?.[3] ??
      record?.lastCoefficientSnapshot ??
      0;
    return record?.basisEligible === true && coefficient > 0;
  });
}

function canReassignBasis(state, nowSec) {
  return (
    state.visibleModeKeys.length === 0 ||
    nowSec - state.lastBasisReassignAtSec >=
      BASIS_REASSIGN_MIN_SECONDS - CONTINUITY_TIME_EPSILON_SEC
  );
}

function markBasisChanged(state, nowSec) {
  state.lastBasisReassignAtSec = nowSec;
  state.eligibilityEpoch += 1;
}

function activateRecord(record, state, nowSec, { fadeIn = false } = {}) {
  record.state = "active";
  record.activeSinceSec = record.activeSinceSec ?? nowSec;
  record.basisEligibleSinceSec = record.basisEligibleSinceSec ?? nowSec;
  record.releaseStartedAtSec = null;
  record.lowEvidenceSec = 0;
  record.basisEligible = true;
  record.eligibilityEpoch = state.eligibilityEpoch + 1;
  record.fadeInStartedAtSec = fadeIn ? nowSec : null;
  record.fadeInWindowSec = fadeIn ? TOPOLOGY_ADMISSION_FADE_SECONDS : null;
  record.evictionStartedAtSec = null;
  record.evictionWindowSec = null;
  if (!state.visibleModeKeys.includes(record.modeKey)) {
    state.visibleModeKeys.push(record.modeKey);
  }
}

function beginRecordEviction(record, nowSec) {
  if (record.evictionStartedAtSec == null) {
    record.evictionStartedAtSec = nowSec;
    record.evictionWindowSec = TOPOLOGY_EVICTION_FADE_SECONDS;
  }
}

function isRecordEvictionComplete(record, nowSec) {
  return (
    record.evictionStartedAtSec != null &&
    nowSec - record.evictionStartedAtSec >=
      (record.evictionWindowSec ?? TOPOLOGY_EVICTION_FADE_SECONDS) -
        CONTINUITY_TIME_EPSILON_SEC
  );
}

function countEvictingRecords(state) {
  let count = 0;
  for (const record of state.recordsByModeKey.values()) {
    if (record.basisEligible && record.evictionStartedAtSec != null) {
      count += 1;
    }
  }
  return count;
}

// Bookkeeping floor, not physics: keeps a fully faded evicting mode barely
// nonzero so its atlas page still counts as contributing until the reassign
// window allows the removal.
const EVICTION_OUTPUT_SCALE_FLOOR = 1e-4;

function getRecordOutputEnvelopeScale(record, nowSec, deltaTimeSec) {
  let scale = 1;
  if (record.fadeInStartedAtSec != null) {
    // One-frame numerical ramp. The present forced response is already in the
    // coefficient; the added delta spans the current frame so the admission
    // tick is nonzero without adding another response delay.
    const windowSec = record.fadeInWindowSec ?? TOPOLOGY_ADMISSION_FADE_SECONDS;
    const elapsedSec = nowSec - record.fadeInStartedAtSec + deltaTimeSec;
    scale *=
      elapsedSec >= windowSec - CONTINUITY_TIME_EPSILON_SEC
        ? 1
        : 1 - Math.exp((-TOPOLOGY_FADE_SETTLE_FACTOR * elapsedSec) / windowSec);
  }
  if (record.evictionStartedAtSec != null) {
    // Numerical page retirement only; physical ring-down stays in the source
    // coefficient and is never re-derived from metadata here.
    const windowSec =
      record.evictionWindowSec ?? TOPOLOGY_EVICTION_FADE_SECONDS;
    const elapsedSec = nowSec - record.evictionStartedAtSec;
    scale *= Math.max(
      EVICTION_OUTPUT_SCALE_FLOOR,
      Math.exp((-TOPOLOGY_FADE_SETTLE_FACTOR * elapsedSec) / windowSec),
    );
  }
  return scale;
}

function updateRecordSnapshot(record, entry, nowSec) {
  record.mode = entry.mode;
  record.evidenceScore = entry.evidenceScore;
  record.lastObservedAtSec = nowSec;
  record.lastCoefficientSnapshot = entry.payload.slot[3] ?? 0;
  record.lastStoredEnergySnapshot = entry.storedEnergySnapshot;
  record.topologyGeometry = entry.topologyGeometry;
  record.topologyShellKey = entry.topologyShellKey;
  record.topologyFamilyKey = entry.topologyFamilyKey;
  record.candidateIndex = entry.candidateIndex;
  record.payload = entry.payload;
  record.lastRenderablePayload = entry.payload;
}

function scalePayloadValue(value, scale) {
  return Math.max(0, (Number.isFinite(value) ? value : 0) * scale);
}

function decayRecordLivePayload(
  record,
  releaseSeconds = TOPOLOGY_RELEASE_SECONDS,
) {
  const resolvedReleaseSeconds = normalizeReleaseSeconds(releaseSeconds);
  const releaseScale = clamp01(
    1 -
      record.lowEvidenceSec / Math.max(resolvedReleaseSeconds, Number.EPSILON),
  );
  const sourcePayload = record.lastRenderablePayload ?? record.payload ?? {};
  const [u, v, w] = record.mode ?? [0, 0, 0];
  const slot = cloneSlotQuad(sourcePayload.slot, 0);
  const phase = cloneSlotQuad(sourcePayload.phase, 0);
  const spectralMoment = cloneSlotQuad(sourcePayload.spectralMoment, 0);
  const metadata = cloneSlotQuad(sourcePayload.metadata, 0);
  const coefficientSource = sourcePayload.slot
    ? slot[3]
    : (record.lastCoefficientSnapshot ?? 0);
  const coefficient = scalePayloadValue(coefficientSource, releaseScale);
  record.lastCoefficientSnapshot = coefficient;
  record.lastStoredEnergySnapshot = coefficient * coefficient;
  record.payload = {
    slot: [u, v, w, coefficient],
    // Phase coherence and authority describe the retained coefficient; they
    // are not amplitude. Keep that evidence intact while the coefficient
    // rings down so the analytic field does not drift toward an invented
    // all-positive phase state during release.
    phase,
    // Pitch basis is a categorical descriptor of the retained response, not
    // amplitude or confidence. It survives release unchanged.
    spectralMoment,
    metadata: [
      metadata[0],
      metadata[1],
      metadata[2],
      scalePayloadValue(metadata[3], releaseScale),
    ],
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

function removeRecords(state, modeKeys) {
  if (modeKeys.length === 0) {
    return;
  }

  const removedModeKeys = new Set(modeKeys);
  for (const modeKey of removedModeKeys) {
    state.recordsByModeKey.delete(modeKey);
  }
  state.visibleModeKeys = state.visibleModeKeys.filter(
    (modeKey) => !removedModeKeys.has(modeKey),
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

function canUseStoredTopologyKey(record, modalGeometryBackend) {
  return (
    record?.topologyGeometry === modalGeometryBackend.cavityGeometry &&
    typeof record?.topologyShellKey === "string" &&
    typeof record?.topologyFamilyKey === "string"
  );
}

function getRecordShellKey(record, modalGeometryBackend) {
  return canUseStoredTopologyKey(record, modalGeometryBackend)
    ? record.topologyShellKey
    : modalGeometryBackend.getModeShellKey(record);
}

function getRecordFamilyKey(record, modalGeometryBackend) {
  return canUseStoredTopologyKey(record, modalGeometryBackend)
    ? record.topologyFamilyKey
    : modalGeometryBackend.getModeFamilyKey(record);
}

function summarizeRecords(records, modalGeometryBackend) {
  return modalGeometryBackend.summarizeModalTopology(records, {
    getShellKey: (record) => getRecordShellKey(record, modalGeometryBackend),
    getFamilyKey: (record) => getRecordFamilyKey(record, modalGeometryBackend),
  });
}

function buildRecordShellCountMap(records, modalGeometryBackend) {
  const shellCounts = new Map();
  for (const record of records ?? []) {
    const shellKey = getRecordShellKey(record, modalGeometryBackend);
    shellCounts.set(shellKey, (shellCounts.get(shellKey) ?? 0) + 1);
  }
  return shellCounts;
}

function buildRecordShellKeySet(records, modalGeometryBackend) {
  return new Set(
    (records ?? []).map((record) =>
      getRecordShellKey(record, modalGeometryBackend),
    ),
  );
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

function selectAdmissionRecords({
  records,
  availableVisibleSlots,
  currentShellKeys = new Set(),
  modalGeometryBackend,
}) {
  if (availableVisibleSlots <= 0) {
    return [];
  }
  const shellsByKey = new Map();
  for (const record of records) {
    const shellKey = getRecordShellKey(record, modalGeometryBackend);
    if (currentShellKeys.has(shellKey)) {
      continue;
    }
    const members = shellsByKey.get(shellKey) ?? [];
    members.push(record);
    shellsByKey.set(shellKey, members);
  }
  const orderedShells = Array.from(shellsByKey, ([shellKey, members]) => ({
    shellKey,
    members: members.sort(
      (left, right) =>
        (left.candidateIndex ?? 0) - (right.candidateIndex ?? 0) ||
        compareModeTuple(left, right),
    ),
    evidenceScore: members.reduce(
      (total, member) => total + member.evidenceScore ** 2,
      0,
    ),
    storedEnergy: members.reduce(
      (total, member) => total + member.lastStoredEnergySnapshot,
      0,
    ),
    strongestMember: [...members].sort(compareAdmissionRecords)[0],
  })).sort(
    (left, right) =>
      right.evidenceScore - left.evidenceScore ||
      right.storedEnergy - left.storedEnergy ||
      compareAdmissionRecords(left.strongestMember, right.strongestMember) ||
      left.shellKey.localeCompare(right.shellKey),
  );

  const selectedRecords = [];
  for (const shell of orderedShells) {
    if (
      Number.isFinite(availableVisibleSlots) &&
      selectedRecords.length + shell.members.length > availableVisibleSlots
    ) {
      continue;
    }
    selectedRecords.push(...shell.members);
  }

  return selectedRecords;
}

function selectReplacementPairs({
  state,
  candidateRecords,
  maxVisibleModeCount,
  maxHandoffModeCount,
  alreadyAdmittedCount,
  modalGeometryBackend,
}) {
  if (
    !Number.isFinite(maxVisibleModeCount) ||
    maxVisibleModeCount <= 0 ||
    candidateRecords.length <= 0
  ) {
    return [];
  }
  const replacementBudget = Math.min(
    Math.max(
      0,
      Math.ceil(maxVisibleModeCount * TOPOLOGY_REPLACE_MAX_FRACTION) -
        alreadyAdmittedCount,
    ),
    Math.max(0, maxHandoffModeCount - countEvictingRecords(state)),
  );
  if (replacementBudget <= 0) {
    return [];
  }
  const targets = getBasisEligibleRecords(state)
    .filter((record) => record.evictionStartedAtSec == null)
    .sort(compareReplacementTargets);
  const candidates = [...candidateRecords].sort(compareAdmissionRecords);
  const pairs = [];
  const usedTargetKeys = new Set();
  const visibleShellCounts = buildRecordShellCountMap(
    targets,
    modalGeometryBackend,
  );
  const coveredShellKeys = buildRecordShellKeySet(
    targets,
    modalGeometryBackend,
  );

  for (const candidate of candidates) {
    const candidateShellKey = getRecordShellKey(
      candidate,
      modalGeometryBackend,
    );
    const target = targets.find((record) => {
      if (usedTargetKeys.has(record.modeKey)) {
        return false;
      }

      const evidenceReplacement =
        candidate.evidenceScore >
        Math.max(
          record.evidenceScore + TOPOLOGY_REPLACE_EVIDENCE_MARGIN,
          record.evidenceScore * TOPOLOGY_REPLACE_EVIDENCE_RATIO,
        );

      const coverageReplacement =
        candidate.evidenceScore >= TOPOLOGY_CONFIDENCE_EVIDENCE &&
        !coveredShellKeys.has(candidateShellKey) &&
        (visibleShellCounts.get(
          getRecordShellKey(record, modalGeometryBackend),
        ) ?? 0) > 1 &&
        candidate.evidenceScore >=
          record.evidenceScore * TOPOLOGY_REPLACE_MISSING_SHELL_SCORE_RATIO;

      const structuralReplacement =
        candidate.evidenceScore >
        Math.max(
          record.evidenceScore + TOPOLOGY_REPLACE_EVIDENCE_MARGIN,
          record.evidenceScore * TOPOLOGY_REPLACE_EVIDENCE_RATIO,
        );
      return (
        structuralReplacement || evidenceReplacement || coverageReplacement
      );
    });
    if (!target) {
      continue;
    }
    pairs.push({ candidate, target });
    usedTargetKeys.add(target.modeKey);
    const targetShellKey = getRecordShellKey(target, modalGeometryBackend);
    const nextTargetShellCount = Math.max(
      0,
      (visibleShellCounts.get(targetShellKey) ?? 0) - 1,
    );
    if (nextTargetShellCount > 0) {
      visibleShellCounts.set(targetShellKey, nextTargetShellCount);
    } else {
      visibleShellCounts.delete(targetShellKey);
      coveredShellKeys.delete(targetShellKey);
    }
    visibleShellCounts.set(
      candidateShellKey,
      (visibleShellCounts.get(candidateShellKey) ?? 0) + 1,
    );
    coveredShellKeys.add(candidateShellKey);
    if (pairs.length >= replacementBudget) {
      break;
    }
  }

  return pairs;
}

function writeDescriptorSource(records, { nowSec = 0, deltaTimeSec = 0 } = {}) {
  const modalFieldSlots = new Float32Array(records.length * 4);
  const modalFieldPhaseSlots = new Float32Array(records.length * 4);
  const modalFieldSpectralMomentSlots = new Float32Array(records.length * 4);
  const modalFieldMetadataSlots = new Float32Array(records.length * 4);

  records.forEach((record, index) => {
    const offset = index * 4;
    modalFieldSlots.set(record.payload.slot, offset);
    modalFieldPhaseSlots.set(record.payload.phase, offset);
    modalFieldSpectralMomentSlots.set(
      record.payload.spectralMoment ?? [0, 0, 0, 0],
      offset,
    );
    modalFieldMetadataSlots.set(record.payload.metadata, offset);

    // The crossfade is an amplitude envelope. Phase coherence and authority
    // stay attached to the mode until its basis identity leaves the handoff.
    const envelopeScale = getRecordOutputEnvelopeScale(
      record,
      nowSec,
      deltaTimeSec,
    );
    if (envelopeScale !== 1) {
      modalFieldSlots[offset + 3] *= envelopeScale;
      modalFieldMetadataSlots[offset + 3] *= envelopeScale;
    }
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldSpectralMomentSlots,
    modalFieldMetadataSlots,
    activeModalFieldModeCount: records.length,
  };
}

function summarizeCandidateConfidence(candidateEntries) {
  let rawCandidateModalEnergy = 0;
  let confidenceWeightedCandidateEnergy = 0;
  let confidenceQualifiedCandidateModeCount = 0;

  for (const entry of candidateEntries) {
    const coefficient = Math.max(0, entry?.payload?.slot?.[3] ?? 0);
    const support = clamp01(entry?.observedSupport ?? 0);
    rawCandidateModalEnergy += coefficient * coefficient;
    confidenceWeightedCandidateEnergy += (support * coefficient) ** 2;
    if ((entry?.evidenceScore ?? 0) >= TOPOLOGY_CONFIDENCE_EVIDENCE) {
      confidenceQualifiedCandidateModeCount += 1;
    }
  }

  const rawCandidateModeCount = candidateEntries.length;
  return {
    rawCandidateModeCount,
    confidenceQualifiedCandidateModeCount,
    lowConfidenceCandidateModeCount: Math.max(
      0,
      rawCandidateModeCount - confidenceQualifiedCandidateModeCount,
    ),
    rawCandidateModalEnergy,
    confidenceWeightedCandidateEnergy,
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
  modalGeometryBackend,
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
  const evictingModeKeys = outputRecords
    .filter((record) => record.evictionStartedAtSec != null)
    .map((record) => record.modeKey);
  const tailEntries = candidateEntries.filter(
    (entry) => !outputModeKeySet.has(entry.modeKey),
  );
  const tailModeKeys = tailEntries.map((entry) => entry.modeKey);
  const activeModeCount = countBasisEligibleRecords(state);
  const previousVisibleCount = previousVisibleKeys.length;
  const modeIdentityRetentionRatio =
    previousVisibleCount > 0
      ? retainedModeKeys.length / previousVisibleCount
      : outputModeKeys.length > 0
        ? 1
        : 0;
  const candidateTopology = summarizeRecords(
    candidateEntries,
    modalGeometryBackend,
  );
  const visibleTopology = summarizeRecords(outputRecords, modalGeometryBackend);
  const tailTopology = summarizeRecords(tailEntries, modalGeometryBackend);
  const candidateConfidence = summarizeCandidateConfidence(candidateEntries);

  return {
    reset,
    dormant: false,
    modalTopologyGeometry: modalGeometryBackend.cavityGeometry,
    eligibilityEpoch: state.eligibilityEpoch,
    candidateModeCount: candidateEntries.length,
    ...candidateConfidence,
    candidateShellCount: candidateTopology.shellCount,
    candidateSpatialFamilyCount: candidateTopology.familyCount,
    candidateDuplicateShellPressure: candidateTopology.duplicateShellPressure,
    activeModeCount,
    visibleModeCount: outputRecords.length,
    visibleShellCount: visibleTopology.shellCount,
    visibleSpatialFamilyCount: visibleTopology.familyCount,
    duplicateShellPressure: visibleTopology.duplicateShellPressure,
    admittedModeKeys,
    retainedModeKeys,
    releasingModeKeys,
    evictingModeKeys,
    removedModeKeys,
    tailModeKeys,
    tailShellCount: tailTopology.shellCount,
    tailSpatialFamilyCount: tailTopology.familyCount,
    tailDuplicateShellPressure: tailTopology.duplicateShellPressure,
    basisEligibleModeKeys: outputModeKeys,
    modeIdentityRetentionRatio,
  };
}

function buildDormantResult({
  state,
  candidateEntries,
  previousVisibleKeys,
  reset,
  modalGeometryBackend,
}) {
  const activeModeCount = countBasisEligibleRecords(state);
  const candidateTopology = summarizeRecords(
    candidateEntries,
    modalGeometryBackend,
  );
  const candidateConfidence = summarizeCandidateConfidence(candidateEntries);
  const diagnostics = {
    reset,
    dormant: true,
    modalTopologyGeometry: modalGeometryBackend.cavityGeometry,
    eligibilityEpoch: state.eligibilityEpoch,
    candidateModeCount: candidateEntries.length,
    ...candidateConfidence,
    candidateShellCount: candidateTopology.shellCount,
    candidateSpatialFamilyCount: candidateTopology.familyCount,
    candidateDuplicateShellPressure: candidateTopology.duplicateShellPressure,
    activeModeCount,
    visibleModeCount: 0,
    visibleShellCount: 0,
    visibleSpatialFamilyCount: 0,
    duplicateShellPressure: 0,
    admittedModeKeys: [],
    retainedModeKeys: previousVisibleKeys.filter((modeKey) =>
      state.recordsByModeKey.has(modeKey),
    ),
    releasingModeKeys: [],
    evictingModeKeys: [],
    removedModeKeys: [],
    tailModeKeys: candidateEntries.map((entry) => entry.modeKey),
    tailShellCount: candidateTopology.shellCount,
    tailSpatialFamilyCount: candidateTopology.familyCount,
    tailDuplicateShellPressure: candidateTopology.duplicateShellPressure,
    basisEligibleModeKeys: [],
    modeIdentityRetentionRatio: activeModeCount > 0 ? 1 : 0,
  };
  return {
    descriptorSource: writeDescriptorSource([]),
    diagnostics,
  };
}

function beginModalFieldContinuityFrame(
  state,
  {
    descriptorSource,
    deltaTimeSec,
    resetToken,
    normalizeCandidateEvidence,
    modalGeometryBackend,
  },
) {
  const resolvedDeltaTimeSec = normalizeDeltaTimeSec(deltaTimeSec);
  const hadResetToken = state.lastResetToken !== undefined;
  const reset = hadResetToken && state.lastResetToken !== resetToken;
  if (reset) {
    clearState(state);
  }

  state.lastResetToken = resetToken;
  state.currentTimeSec += resolvedDeltaTimeSec;
  return {
    allowBootstrapAdmission: !hadResetToken || reset,
    candidateEntries: readCandidateEntries(descriptorSource, {
      normalizeCandidateEvidence,
      modalGeometryBackend,
    }),
    nowSec: state.currentTimeSec,
    previousVisibleKeys: [...state.visibleModeKeys],
    reset,
    resolvedDeltaTimeSec,
  };
}

function advanceCurrentCandidateRecords({
  state,
  candidateEntries,
  nowSec,
  deltaTimeSec,
}) {
  const currentEntryByModeKey = new Map();
  for (const entry of candidateEntries) {
    currentEntryByModeKey.set(entry.modeKey, entry);
    let record = state.recordsByModeKey.get(entry.modeKey);
    if (!record) {
      record = createRecord(entry, nowSec);
      state.recordsByModeKey.set(entry.modeKey, record);
    }

    updateRecordSnapshot(record, entry, nowSec);
    record.lowEvidenceSec = 0;
    record.releaseStartedAtSec = null;
    if (record.basisEligible) {
      record.state = "active";
    }

    if (!record.basisEligible) {
      record.qualifyingEvidenceSec += deltaTimeSec;
    }
  }
  return currentEntryByModeKey;
}

function collectCompletedEvictionKeys(state, nowSec) {
  const modeKeys = [];
  for (const [modeKey, record] of state.recordsByModeKey.entries()) {
    if (record.basisEligible && isRecordEvictionComplete(record, nowSec)) {
      modeKeys.push(modeKey);
    }
  }
  return modeKeys;
}

function collectAdmissionEligibleRecords(state, allowBootstrapAdmission) {
  const records = [];
  for (const record of state.recordsByModeKey.values()) {
    const hasQualifyingEvidence =
      record.qualifyingEvidenceSec >= TOPOLOGY_PROMOTE_SECONDS ||
      allowBootstrapAdmission;
    if (!record.basisEligible && hasQualifyingEvidence) {
      records.push(record);
    }
  }
  return records;
}

function selectFrameAdmissions({
  state,
  eligibleRecords,
  maxVisibleModeCount,
  maxHandoffModeCount,
  completedEviction,
  modalGeometryBackend,
}) {
  const availableVisibleSlots = Number.isFinite(maxVisibleModeCount)
    ? Math.max(0, maxVisibleModeCount - countBasisEligibleRecords(state))
    : Infinity;
  const selectedRecords = selectAdmissionRecords({
    records: eligibleRecords,
    availableVisibleSlots,
    currentShellKeys: buildRecordShellKeySet(
      getBasisEligibleRecords(state),
      modalGeometryBackend,
    ),
    modalGeometryBackend,
  });
  const selectedRecordKeys = new Set(
    selectedRecords.map((record) => record.modeKey),
  );
  const replacementPairs = completedEviction
    ? []
    : selectReplacementPairs({
        state,
        candidateRecords: eligibleRecords.filter(
          (record) => !selectedRecordKeys.has(record.modeKey),
        ),
        maxVisibleModeCount,
        maxHandoffModeCount,
        alreadyAdmittedCount: selectedRecords.length,
        modalGeometryBackend,
      });
  return { replacementPairs, selectedRecords };
}

function commitFrameAdmissions({
  state,
  selectedRecords,
  replacementPairs,
  previousVisibleKeys,
  nowSec,
}) {
  const admittedModeKeys = [];
  const fadeIn = previousVisibleKeys.length > 0;
  for (const record of selectedRecords) {
    activateRecord(record, state, nowSec, { fadeIn });
    admittedModeKeys.push(record.modeKey);
  }
  // A provisioned handoff page keeps both signed modal contributions in the
  // descriptor. The raymarch carrier therefore sums them coherently before
  // any magnitude, density, or radiance transform.
  for (const pair of replacementPairs) {
    beginRecordEviction(pair.target, nowSec);
    activateRecord(pair.candidate, state, nowSec, { fadeIn: true });
    admittedModeKeys.push(pair.candidate.modeKey);
  }
  return admittedModeKeys;
}

function reassignVisibleModalBasis({
  state,
  nowSec,
  previousVisibleKeys,
  maxVisibleModeCount,
  maxHandoffModeCount,
  allowBootstrapAdmission,
  modalGeometryBackend,
}) {
  if (!canReassignBasis(state, nowSec)) {
    return { admittedModeKeys: [], removedModeKeys: [], basisChanged: false };
  }

  const removedModeKeys = collectCompletedEvictionKeys(state, nowSec);
  removeRecords(state, removedModeKeys);
  const eligibleRecords = collectAdmissionEligibleRecords(
    state,
    allowBootstrapAdmission && previousVisibleKeys.length === 0,
  );
  const { selectedRecords, replacementPairs } = selectFrameAdmissions({
    state,
    eligibleRecords,
    maxVisibleModeCount,
    maxHandoffModeCount,
    completedEviction: removedModeKeys.length > 0,
    modalGeometryBackend,
  });
  const admittedModeKeys = commitFrameAdmissions({
    state,
    selectedRecords,
    replacementPairs,
    previousVisibleKeys,
    nowSec,
  });
  const basisChanged =
    removedModeKeys.length > 0 || admittedModeKeys.length > 0;
  return { admittedModeKeys, removedModeKeys, basisChanged };
}

function releaseExpiredModalRecords({
  state,
  currentEntryByModeKey,
  deltaTimeSec,
  nowSec,
  releaseSeconds,
  canReleaseVisibleBasis,
}) {
  const expiredVisibleModeKeys = [];
  for (const [modeKey, record] of Array.from(
    state.recordsByModeKey.entries(),
  )) {
    if (currentEntryByModeKey.has(modeKey)) {
      continue;
    }

    if (!record.basisEligible) {
      state.recordsByModeKey.delete(modeKey);
      continue;
    }

    updateLowEvidenceRecord(record, deltaTimeSec, nowSec);
    decayRecordLivePayload(record, releaseSeconds);
    if (canReleaseVisibleBasis && record.lowEvidenceSec >= releaseSeconds) {
      expiredVisibleModeKeys.push(modeKey);
    }
  }

  if (expiredVisibleModeKeys.length > 0) {
    removeRecords(state, expiredVisibleModeKeys);
  }
  return expiredVisibleModeKeys;
}

function buildActiveModalFieldContinuityResult({
  state,
  candidateEntries,
  previousVisibleKeys,
  admittedModeKeys,
  removedModeKeys,
  reset,
  maxVisibleModeCount,
  maxHandoffModeCount,
  modalGeometryBackend,
  nowSec,
  deltaTimeSec,
}) {
  const outputRecords = getBasisEligibleRecords(state).slice(
    0,
    Number.isFinite(maxVisibleModeCount)
      ? maxVisibleModeCount + maxHandoffModeCount
      : undefined,
  );
  const descriptorSource = writeDescriptorSource(outputRecords, {
    nowSec,
    deltaTimeSec,
  });
  const diagnostics = buildDiagnostics({
    state,
    candidateEntries,
    outputRecords,
    previousVisibleKeys,
    admittedModeKeys,
    removedModeKeys,
    reset,
    modalGeometryBackend,
  });
  return { descriptorSource, diagnostics };
}

/**
 * @param {ReturnType<typeof createModalFieldContinuityState>} state
 * @param {{
 *   descriptorSource?: {
 *     modalFieldSlots?: Float32Array | number[],
 *     modalFieldPhaseSlots?: Float32Array | number[],
 *     modalFieldSpectralMomentSlots?: Float32Array | number[],
 *     modalFieldMetadataSlots?: Float32Array | number[],
 *     activeModalFieldModeCount?: number,
 *   },
 *   deltaTimeSec?: number,
 *   resetToken?: unknown,
 *   renderAuthority?: boolean,
 *   maxVisibleModeCount?: number,
 *   maxHandoffModeCount?: number,
 *   releaseSeconds?: number,
 *   normalizeCandidateEvidence?: boolean,
 *   cavityGeometry?: import("./cavityGeometry.js").CavityGeometry,
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
    maxHandoffModeCount = 0,
    releaseSeconds = TOPOLOGY_RELEASE_SECONDS,
    normalizeCandidateEvidence = false,
    cavityGeometry = DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  } = {},
) {
  const modalGeometryBackend = getModalGeometryBackend(cavityGeometry);
  const normalizedMaxVisibleModeCount =
    normalizeMaxVisibleModeCount(maxVisibleModeCount);
  const normalizedMaxHandoffModeCount =
    normalizeMaxHandoffModeCount(maxHandoffModeCount);
  const resolvedReleaseSeconds = normalizeReleaseSeconds(releaseSeconds);
  const frame = beginModalFieldContinuityFrame(state, {
    descriptorSource,
    deltaTimeSec,
    resetToken,
    normalizeCandidateEvidence,
    modalGeometryBackend,
  });

  if (!renderAuthority) {
    if (frame.reset) {
      markBasisChanged(state, frame.nowSec);
    }
    return buildDormantResult({
      state,
      candidateEntries: frame.candidateEntries,
      previousVisibleKeys: frame.previousVisibleKeys,
      reset: frame.reset,
      modalGeometryBackend,
    });
  }

  const currentEntryByModeKey = advanceCurrentCandidateRecords({
    state,
    candidateEntries: frame.candidateEntries,
    nowSec: frame.nowSec,
    deltaTimeSec: frame.resolvedDeltaTimeSec,
  });
  const basisTransition = reassignVisibleModalBasis({
    state,
    nowSec: frame.nowSec,
    previousVisibleKeys: frame.previousVisibleKeys,
    maxVisibleModeCount: normalizedMaxVisibleModeCount,
    maxHandoffModeCount: normalizedMaxHandoffModeCount,
    allowBootstrapAdmission: frame.allowBootstrapAdmission,
    modalGeometryBackend,
  });
  const releasedModeKeys = releaseExpiredModalRecords({
    state,
    currentEntryByModeKey,
    deltaTimeSec: frame.resolvedDeltaTimeSec,
    nowSec: frame.nowSec,
    releaseSeconds: resolvedReleaseSeconds,
    canReleaseVisibleBasis:
      !frame.reset &&
      !basisTransition.basisChanged &&
      canReassignBasis(state, frame.nowSec),
  });
  const basisChanged =
    frame.reset || basisTransition.basisChanged || releasedModeKeys.length > 0;
  if (basisChanged) {
    markBasisChanged(state, frame.nowSec);
  }

  return buildActiveModalFieldContinuityResult({
    state,
    candidateEntries: frame.candidateEntries,
    previousVisibleKeys: frame.previousVisibleKeys,
    admittedModeKeys: basisTransition.admittedModeKeys,
    removedModeKeys: [...basisTransition.removedModeKeys, ...releasedModeKeys],
    reset: frame.reset,
    maxVisibleModeCount: normalizedMaxVisibleModeCount,
    maxHandoffModeCount: normalizedMaxHandoffModeCount,
    modalGeometryBackend,
    nowSec: frame.nowSec,
    deltaTimeSec: frame.resolvedDeltaTimeSec,
  });
}
