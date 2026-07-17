import {
  MODAL_BASIS_CACHE_RESOLUTION,
  getModalBasisCacheMaxRepresentableModeIndex,
} from "./modalBudgets.js";
import { DEFAULT_EFFECTIVE_CAVITY_GEOMETRY } from "./cavityGeometry.js";
import { getModalGeometryBackend } from "./modalGeometryBackend.js";
import { normalizeModalTopologyCoordinate } from "./modalTopology.js";
import { clamp01 } from "../utils/math.js";

const TOPOLOGY_ADMIT_EVIDENCE = 0.08;
export const TOPOLOGY_PROMOTE_SECONDS = 0.05;
const TOPOLOGY_RELEASE_EVIDENCE = 0.025;
const TOPOLOGY_BOOTSTRAP_EVIDENCE = 0;
export const TOPOLOGY_RELEASE_SECONDS = 0.13;
// Crossfade windows for admission/eviction transitions. When a mode carries
// damping metadata the window derives from its own amplitude time constant
// (tau = 1 / (2 * pi * f * zeta), equivalently Q / (pi * f)). These
// constants are the fallback window and settle factor; the min/max clamps are
// bookkeeping bounds (frame quantization and visible-slot budget), not physics.
export const TOPOLOGY_ADMISSION_FADE_SECONDS = 0.08;
export const TOPOLOGY_EVICTION_FADE_SECONDS = 0.08;
const TOPOLOGY_FADE_SETTLE_FACTOR = 3;
const TOPOLOGY_FADE_MIN_SECONDS = 1 / 30;
const TOPOLOGY_FADE_MAX_SECONDS = 0.25;
export const BASIS_REASSIGN_MIN_SECONDS = 0.067;
const STRUCTURAL_ADMISSION_REFERENCE_MODE_ORDER_FRACTION = 0.25;
const TOPOLOGY_REPLACE_EVIDENCE_MARGIN = 0.08;
const TOPOLOGY_REPLACE_EVIDENCE_RATIO = 1.35;
const TOPOLOGY_REPLACE_MISSING_SHELL_SCORE_RATIO = 0.4;
const TOPOLOGY_REPLACE_MAX_FRACTION = 0.4;
const RETAINED_PAYLOAD_DROP_RATIO = 0.85;
const STRUCTURAL_ADMISSION_COMPLIANCE_EXPONENT = 2;
const STRUCTURAL_ADMISSION_MIN_COMPLIANCE = 0.12;
const DETAIL_ADMISSION_MAX_FRACTION = 0.25;
const DEFAULT_MAX_BASIS_MODE_ORDER =
  getModalBasisCacheMaxRepresentableModeIndex(MODAL_BASIS_CACHE_RESOLUTION);

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

function getModeSpatialWavenumber(mode) {
  const u = normalizeModeCoordinate(mode?.[0]);
  const v = normalizeModeCoordinate(mode?.[1]);
  const w = normalizeModeCoordinate(mode?.[2]);
  return Math.hypot(u, v, w);
}

function normalizeMaxBasisModeOrder(maxBasisModeOrder) {
  return Number.isFinite(maxBasisModeOrder)
    ? Math.max(0, Math.floor(maxBasisModeOrder))
    : DEFAULT_MAX_BASIS_MODE_ORDER;
}

function deriveStructuralAdmissionReferenceModeOrder(maxBasisModeOrder) {
  return Math.max(
    1,
    normalizeMaxBasisModeOrder(maxBasisModeOrder) *
      STRUCTURAL_ADMISSION_REFERENCE_MODE_ORDER_FRACTION,
  );
}

function deriveStructuralAdmissionCompliance(mode, maxBasisModeOrder) {
  const spatialWavenumber = getModeSpatialWavenumber(mode);
  if (!(spatialWavenumber > 0)) {
    return 1;
  }
  const referenceModeOrder =
    deriveStructuralAdmissionReferenceModeOrder(maxBasisModeOrder);
  return clamp01(
    1 /
      (1 +
        Math.pow(
          spatialWavenumber / referenceModeOrder,
          STRUCTURAL_ADMISSION_COMPLIANCE_EXPONENT,
        )),
  );
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
    maxBasisModeOrder = Infinity,
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
    const spectralLaneA = cloneSlotQuad(
      descriptorSource.modalFieldSpectralLaneA,
      offset,
    );
    const spectralLaneB = cloneSlotQuad(
      descriptorSource.modalFieldSpectralLaneB,
      offset,
    );
    const spectralMeta = cloneSlotQuad(
      descriptorSource.modalFieldSpectralMeta,
      offset,
    );
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
    const evidenceScore = computeCandidateEvidenceScore({
      coefficient,
      observedSupport,
      relativeEvidence,
    });
    const basisRepresentable =
      getModeOrder(mode) <= normalizedMaxBasisModeOrder;
    const structuralAdmissionCompliance = deriveStructuralAdmissionCompliance(
      mode,
      normalizedMaxBasisModeOrder,
    );
    const structuralAdmissionScore = basisRepresentable
      ? clamp01(evidenceScore * structuralAdmissionCompliance)
      : 0;
    const topologySource = { mode };

    entries.push({
      modeKey,
      mode,
      topologyGeometry: modalGeometryBackend.cavityGeometry,
      topologyShellKey: modalGeometryBackend.getModeShellKey(topologySource),
      topologyFamilyKey: modalGeometryBackend.getModeFamilyKey(topologySource),
      candidateIndex: index,
      basisRepresentable,
      evidenceScore,
      structuralAdmissionScore,
      structuralAdmissionCompliance,
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
        color,
        spectralLaneA,
        spectralLaneB,
        spectralMeta,
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
    structuralAdmissionScore: entry.structuralAdmissionScore,
    structuralAdmissionCompliance: entry.structuralAdmissionCompliance,
    topologyGeometry: entry.topologyGeometry,
    topologyShellKey: entry.topologyShellKey,
    topologyFamilyKey: entry.topologyFamilyKey,
    eligibilityEpoch: 0,
    basisEligible: false,
    basisRepresentable: entry.basisRepresentable,
    candidateIndex: entry.candidateIndex,
    payload: entry.payload,
    lastRenderablePayload: entry.payload,
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
    nowSec - state.lastBasisReassignAtSec >= BASIS_REASSIGN_MIN_SECONDS
  );
}

function markBasisChanged(state, nowSec) {
  state.lastBasisReassignAtSec = nowSec;
  state.eligibilityEpoch += 1;
}

/**
 * Fade window for a mode's admission/eviction envelope, derived from its own
 * damped-oscillator amplitude time constant when the descriptor carries
 * damping metadata: tau = 1 / (2 * pi * f * zeta), equivalently
 * Q / (pi * f) with zeta = 1 / (2 * Q). The window is
 * TOPOLOGY_FADE_SETTLE_FACTOR * tau, so e^(-t * settle / window) matches the
 * physical ring-down e^(-t / tau) whenever the clamp does not engage. The
 * clamp and fallback are bookkeeping (frame quantization and visible-slot
 * budget), not physics.
 *
 * @param {ArrayLike<number>|undefined} metadata
 *   [naturalFrequencyHz, qualityFactor, dampingRatio, observedSupport]
 * @param {number} fallbackSeconds Window when no usable damping metadata.
 */
function deriveModalFadeWindowSeconds(metadata, fallbackSeconds) {
  const naturalFrequencyHz = metadata?.[0] ?? 0;
  const qualityFactor = metadata?.[1] ?? 0;
  const dampingRatio = metadata?.[2] ?? 0;
  let amplitudeTimeConstantSec = null;
  if (naturalFrequencyHz > 0 && dampingRatio > 0) {
    amplitudeTimeConstantSec =
      1 / (2 * Math.PI * naturalFrequencyHz * dampingRatio);
  } else if (naturalFrequencyHz > 0 && qualityFactor > 0) {
    amplitudeTimeConstantSec = qualityFactor / (Math.PI * naturalFrequencyHz);
  }
  if (!Number.isFinite(amplitudeTimeConstantSec)) {
    return fallbackSeconds;
  }

  return Math.min(
    TOPOLOGY_FADE_MAX_SECONDS,
    Math.max(
      TOPOLOGY_FADE_MIN_SECONDS,
      TOPOLOGY_FADE_SETTLE_FACTOR * amplitudeTimeConstantSec,
    ),
  );
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
  record.fadeInWindowSec = fadeIn
    ? deriveModalFadeWindowSeconds(
        record.payload?.metadata,
        TOPOLOGY_ADMISSION_FADE_SECONDS,
      )
    : null;
  record.evictionStartedAtSec = null;
  record.evictionWindowSec = null;
  if (!state.visibleModeKeys.includes(record.modeKey)) {
    state.visibleModeKeys.push(record.modeKey);
  }
}

function beginRecordEviction(record, nowSec) {
  if (record.evictionStartedAtSec == null) {
    record.evictionStartedAtSec = nowSec;
    record.evictionWindowSec = deriveModalFadeWindowSeconds(
      record.payload?.metadata,
      TOPOLOGY_EVICTION_FADE_SECONDS,
    );
  }
}

const FADE_WINDOW_EPSILON_SEC = 1e-6;

function isRecordEvictionComplete(record, nowSec) {
  return (
    record.evictionStartedAtSec != null &&
    nowSec - record.evictionStartedAtSec >=
      (record.evictionWindowSec ?? TOPOLOGY_EVICTION_FADE_SECONDS) -
        FADE_WINDOW_EPSILON_SEC
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
    // Driven-resonator rise toward steady state. The added
    // deltaTimeSec spans the current frame so the admission tick is nonzero.
    const windowSec = record.fadeInWindowSec ?? TOPOLOGY_ADMISSION_FADE_SECONDS;
    const elapsedSec = nowSec - record.fadeInStartedAtSec + deltaTimeSec;
    scale *=
      elapsedSec >= windowSec - FADE_WINDOW_EPSILON_SEC
        ? 1
        : 1 - Math.exp((-TOPOLOGY_FADE_SETTLE_FACTOR * elapsedSec) / windowSec);
  }
  if (record.evictionStartedAtSec != null) {
    // Ring-down truncated at the settle window.
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
  record.structuralAdmissionScore = entry.structuralAdmissionScore;
  record.structuralAdmissionCompliance = entry.structuralAdmissionCompliance;
  record.topologyGeometry = entry.topologyGeometry;
  record.topologyShellKey = entry.topologyShellKey;
  record.topologyFamilyKey = entry.topologyFamilyKey;
  record.basisRepresentable = entry.basisRepresentable;
  record.candidateIndex = entry.candidateIndex;
  record.payload = entry.payload;
  record.lastRenderablePayload = entry.payload;
}

function updateRecordEvidence(record, entry, nowSec) {
  record.mode = entry.mode;
  record.evidenceScore = entry.evidenceScore;
  record.lastObservedAtSec = nowSec;
  record.structuralAdmissionScore = entry.structuralAdmissionScore;
  record.structuralAdmissionCompliance = entry.structuralAdmissionCompliance;
  record.topologyGeometry = entry.topologyGeometry;
  record.topologyShellKey = entry.topologyShellKey;
  record.topologyFamilyKey = entry.topologyFamilyKey;
  record.basisRepresentable = entry.basisRepresentable;
  record.candidateIndex = entry.candidateIndex;
}

function scalePayloadValue(value, scale) {
  return Math.max(0, (Number.isFinite(value) ? value : 0) * scale);
}

function shouldRetainRenderablePayloadForRelease(record, entry) {
  if (
    !record?.basisEligible ||
    entry.evidenceScore >= TOPOLOGY_RELEASE_EVIDENCE
  ) {
    return false;
  }

  const previousCoefficient = Math.max(
    0,
    record.lastRenderablePayload?.slot?.[3] ??
      record.payload?.slot?.[3] ??
      record.lastCoefficientSnapshot ??
      0,
  );
  const currentCoefficient = Math.max(0, entry.payload?.slot?.[3] ?? 0);
  return (
    previousCoefficient > 0 &&
    currentCoefficient < previousCoefficient * RETAINED_PAYLOAD_DROP_RATIO
  );
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
  const sourcePayload = record.lastRenderablePayload ??
    record.payload ?? {
      slot: [
        record.mode?.[0] ?? 0,
        record.mode?.[1] ?? 0,
        record.mode?.[2] ?? 0,
        0,
      ],
    };
  const [u, v, w] = record.mode ?? [0, 0, 0];
  const slot = sourcePayload.slot ?? [
    u,
    v,
    w,
    record.lastCoefficientSnapshot ?? 0,
  ];
  const phase = sourcePayload.phase ?? [0, 0, 0, 0];
  const color = sourcePayload.color ?? [0, 0, 0, 0];
  const spectral = sourcePayload.spectral ?? [0, 0, 0, 0];
  const spectralLaneA = sourcePayload.spectralLaneA ?? [0, 0, 0, 0];
  const spectralLaneB = sourcePayload.spectralLaneB ?? [0, 0, 0, 0];
  const spectralMeta = sourcePayload.spectralMeta ?? [0, 0, 0, 0];
  const metadata = sourcePayload.metadata ?? [0, 0, 0, 0];
  const coefficient = scalePayloadValue(slot[3], releaseScale);
  record.lastCoefficientSnapshot = coefficient;
  record.lastStoredEnergySnapshot = coefficient * coefficient;
  record.payload = {
    slot: [u, v, w, coefficient],
    phase: [
      phase[0] ?? 0,
      phase[1] ?? 0,
      scalePayloadValue(phase[2], releaseScale),
      scalePayloadValue(phase[3], releaseScale),
    ],
    color: [
      color[0] ?? 0,
      color[1] ?? 0,
      color[2] ?? 0,
      scalePayloadValue(color[3], releaseScale),
    ],
    spectral: [
      spectral[0] ?? 0,
      spectral[1] ?? 0,
      spectral[2] ?? 0,
      scalePayloadValue(spectral[3], releaseScale),
    ],
    spectralLaneA,
    spectralLaneB,
    spectralMeta: [
      spectralMeta[0] ?? 0,
      spectralMeta[1] ?? 0,
      scalePayloadValue(spectralMeta[2], releaseScale),
      scalePayloadValue(spectralMeta[3], releaseScale),
    ],
    metadata: [
      metadata[0] ?? 0,
      metadata[1] ?? 0,
      metadata[2] ?? 0,
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

function getStructuralAdmissionScore(record) {
  return Number.isFinite(record?.structuralAdmissionScore)
    ? record.structuralAdmissionScore
    : (record?.evidenceScore ?? 0);
}

function getAdmissionRole(record) {
  return record?.basisRepresentable &&
    (record?.structuralAdmissionCompliance ?? 0) >=
      STRUCTURAL_ADMISSION_MIN_COMPLIANCE
    ? "structural"
    : "detail";
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

function getDetailAdmissionBudget(maxVisibleModeCount) {
  if (!Number.isFinite(maxVisibleModeCount)) {
    return Infinity;
  }
  return Math.max(
    0,
    Math.floor(maxVisibleModeCount * DETAIL_ADMISSION_MAX_FRACTION),
  );
}

function countVisibleDetailRecords(state) {
  return getBasisEligibleRecords(state).filter(
    (record) => getAdmissionRole(record) === "detail",
  ).length;
}

function compareAdmissionRecords(left, right) {
  const roleDelta =
    (getAdmissionRole(left) === "structural" ? 0 : 1) -
    (getAdmissionRole(right) === "structural" ? 0 : 1);
  if (roleDelta !== 0) {
    return roleDelta;
  }
  const admissionDelta =
    getStructuralAdmissionScore(right) - getStructuralAdmissionScore(left);
  if (admissionDelta !== 0) {
    return admissionDelta;
  }
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
  const roleDelta =
    (getAdmissionRole(left) === "detail" ? 0 : 1) -
    (getAdmissionRole(right) === "detail" ? 0 : 1);
  if (roleDelta !== 0) {
    return roleDelta;
  }
  const admissionDelta =
    getStructuralAdmissionScore(left) - getStructuralAdmissionScore(right);
  if (admissionDelta !== 0) {
    return admissionDelta;
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
  maxDetailVisibleCount,
  currentDetailVisibleCount,
  currentShellKeys = new Set(),
  modalGeometryBackend,
}) {
  if (availableVisibleSlots <= 0) {
    return [];
  }
  const orderedRecords = [...records].sort(compareAdmissionRecords);
  const selectedRecords = [];
  const selectedRecordKeys = new Set();
  const coveredShellKeys = new Set(currentShellKeys);
  let selectedDetailCount = 0;
  const remainingDetailSlots =
    Number.isFinite(maxDetailVisibleCount) ||
    Number.isFinite(currentDetailVisibleCount)
      ? Math.max(
          0,
          maxDetailVisibleCount - Math.max(0, currentDetailVisibleCount),
        )
      : Infinity;

  const canSelectRecord = (record) => {
    if (selectedRecordKeys.has(record.modeKey)) {
      return false;
    }
    const isDetail = getAdmissionRole(record) === "detail";
    if (isDetail && selectedDetailCount >= remainingDetailSlots) {
      return false;
    }
    return true;
  };
  const selectRecord = (record) => {
    selectedRecords.push(record);
    selectedRecordKeys.add(record.modeKey);
    coveredShellKeys.add(getRecordShellKey(record, modalGeometryBackend));
    if (getAdmissionRole(record) === "detail") {
      selectedDetailCount += 1;
    }
  };
  const selectionFull = () =>
    Number.isFinite(availableVisibleSlots) &&
    selectedRecords.length >= availableVisibleSlots;

  for (const record of orderedRecords) {
    if (getAdmissionRole(record) !== "structural" || !canSelectRecord(record)) {
      continue;
    }
    const shellKey = getRecordShellKey(record, modalGeometryBackend);
    if (coveredShellKeys.has(shellKey)) {
      continue;
    }
    selectRecord(record);
    if (selectionFull()) {
      break;
    }
  }

  if (selectionFull()) {
    return selectedRecords;
  }

  for (const record of orderedRecords) {
    if (!canSelectRecord(record)) {
      continue;
    }
    selectRecord(record);
    if (
      Number.isFinite(availableVisibleSlots) &&
      selectedRecords.length >= availableVisibleSlots
    ) {
      break;
    }
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

      const candidateRole = getAdmissionRole(candidate);
      const targetRole = getAdmissionRole(record);

      const evidenceReplacement =
        candidate.evidenceScore >
        Math.max(
          record.evidenceScore + TOPOLOGY_REPLACE_EVIDENCE_MARGIN,
          record.evidenceScore * TOPOLOGY_REPLACE_EVIDENCE_RATIO,
        );

      const coverageReplacement =
        candidateRole === "structural" &&
        targetRole === "structural" &&
        candidate.evidenceScore >= TOPOLOGY_ADMIT_EVIDENCE &&
        !coveredShellKeys.has(candidateShellKey) &&
        (visibleShellCounts.get(
          getRecordShellKey(record, modalGeometryBackend),
        ) ?? 0) > 1 &&
        getStructuralAdmissionScore(candidate) >=
          getStructuralAdmissionScore(record) *
            TOPOLOGY_REPLACE_MISSING_SHELL_SCORE_RATIO;

      if (candidateRole === "detail" && targetRole === "detail") {
        return evidenceReplacement;
      }

      const structuralReplacement =
        getStructuralAdmissionScore(candidate) >
        Math.max(
          getStructuralAdmissionScore(record) +
            TOPOLOGY_REPLACE_EVIDENCE_MARGIN,
          getStructuralAdmissionScore(record) * TOPOLOGY_REPLACE_EVIDENCE_RATIO,
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
  const modalFieldColorSlots = new Float32Array(records.length * 4);
  const modalFieldSpectralLaneA = new Float32Array(records.length * 4);
  const modalFieldSpectralLaneB = new Float32Array(records.length * 4);
  const modalFieldSpectralMeta = new Float32Array(records.length * 4);
  const modalFieldMetadataSlots = new Float32Array(records.length * 4);

  records.forEach((record, index) => {
    const offset = index * 4;
    modalFieldSlots.set(record.payload.slot, offset);
    modalFieldPhaseSlots.set(record.payload.phase, offset);
    modalFieldColorSlots.set(record.payload.color, offset);
    modalFieldSpectralLaneA.set(
      record.payload.spectralLaneA ?? [0, 0, 0, 0],
      offset,
    );
    modalFieldSpectralLaneB.set(
      record.payload.spectralLaneB ?? [0, 0, 0, 0],
      offset,
    );
    modalFieldSpectralMeta.set(
      record.payload.spectralMeta ?? [0, 0, 0, 0],
      offset,
    );
    modalFieldMetadataSlots.set(record.payload.metadata, offset);

    // Crossfade envelope: same components the release path decays.
    const envelopeScale = getRecordOutputEnvelopeScale(
      record,
      nowSec,
      deltaTimeSec,
    );
    if (envelopeScale !== 1) {
      modalFieldSlots[offset + 3] *= envelopeScale;
      modalFieldPhaseSlots[offset + 2] *= envelopeScale;
      modalFieldPhaseSlots[offset + 3] *= envelopeScale;
      modalFieldColorSlots[offset + 3] *= envelopeScale;
      modalFieldSpectralMeta[offset + 2] *= envelopeScale;
      modalFieldSpectralMeta[offset + 3] *= envelopeScale;
      modalFieldMetadataSlots[offset + 3] *= envelopeScale;
    }
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldColorSlots,
    modalFieldSpectralLaneA,
    modalFieldSpectralLaneB,
    modalFieldSpectralMeta,
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
    if ((entry?.evidenceScore ?? 0) >= TOPOLOGY_ADMIT_EVIDENCE) {
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

function summarizeOverBandwidthCandidates(candidateEntries, maxBasisModeOrder) {
  const maxRepresentableModeIndex =
    normalizeMaxBasisModeOrder(maxBasisModeOrder);
  let overBandwidthRejectedModeCount = 0;
  let overBandwidthRejectedModalEnergy = 0;
  let overBandwidthMaxRequestedModeIndex = 0;
  let overBandwidthMaxRequestedMode = [0, 0, 0];

  for (const entry of candidateEntries) {
    const modeOrder = getModeOrder(entry?.mode);
    if (modeOrder <= maxRepresentableModeIndex) {
      continue;
    }

    overBandwidthRejectedModeCount += 1;
    overBandwidthRejectedModalEnergy += Math.max(
      0,
      entry?.storedEnergySnapshot ?? 0,
    );
    if (modeOrder > overBandwidthMaxRequestedModeIndex) {
      overBandwidthMaxRequestedModeIndex = modeOrder;
      overBandwidthMaxRequestedMode = [
        normalizeModeCoordinate(entry?.mode?.[0]),
        normalizeModeCoordinate(entry?.mode?.[1]),
        normalizeModeCoordinate(entry?.mode?.[2]),
      ];
    }
  }

  return {
    maxRepresentableModeIndex,
    overBandwidthRejectedModeCount,
    overBandwidthRejectedModalEnergy,
    overBandwidthMaxRequestedModeIndex,
    overBandwidthMaxRequestedMode,
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
  maxBasisModeOrder,
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
  const overBandwidthCandidates = summarizeOverBandwidthCandidates(
    candidateEntries,
    maxBasisModeOrder,
  );

  return {
    reset,
    dormant: false,
    modalTopologyGeometry: modalGeometryBackend.cavityGeometry,
    eligibilityEpoch: state.eligibilityEpoch,
    candidateModeCount: candidateEntries.length,
    ...candidateConfidence,
    ...overBandwidthCandidates,
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
  maxBasisModeOrder,
  modalGeometryBackend,
}) {
  const activeModeCount = countBasisEligibleRecords(state);
  const candidateTopology = summarizeRecords(
    candidateEntries,
    modalGeometryBackend,
  );
  const candidateConfidence = summarizeCandidateConfidence(candidateEntries);
  const overBandwidthCandidates = summarizeOverBandwidthCandidates(
    candidateEntries,
    maxBasisModeOrder,
  );
  const diagnostics = {
    reset,
    dormant: true,
    modalTopologyGeometry: modalGeometryBackend.cavityGeometry,
    eligibilityEpoch: state.eligibilityEpoch,
    candidateModeCount: candidateEntries.length,
    ...candidateConfidence,
    ...overBandwidthCandidates,
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
 *     modalFieldSpectralLaneA?: Float32Array | number[],
 *     modalFieldSpectralLaneB?: Float32Array | number[],
 *     modalFieldSpectralMeta?: Float32Array | number[],
 *     modalFieldMetadataSlots?: Float32Array | number[],
 *     activeModalFieldModeCount?: number,
 *   },
 *   deltaTimeSec?: number,
 *   resetToken?: unknown,
 *   renderAuthority?: boolean,
 *   maxVisibleModeCount?: number,
 *   maxHandoffModeCount?: number,
 *   maxBasisModeOrder?: number,
 *   releaseSeconds?: number,
 *   allowImmediateBootstrap?: boolean,
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
    maxBasisModeOrder = Infinity,
    releaseSeconds = TOPOLOGY_RELEASE_SECONDS,
    allowImmediateBootstrap = false,
    normalizeCandidateEvidence = false,
    cavityGeometry = DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  } = {},
) {
  const modalGeometryBackend = getModalGeometryBackend(cavityGeometry);
  const resolvedDeltaTimeSec = normalizeDeltaTimeSec(deltaTimeSec);
  const normalizedMaxVisibleModeCount = Number.isFinite(maxVisibleModeCount)
    ? Math.max(0, Math.floor(maxVisibleModeCount))
    : Infinity;
  const normalizedMaxHandoffModeCount = Number.isFinite(maxHandoffModeCount)
    ? Math.max(0, Math.floor(maxHandoffModeCount))
    : 0;
  const resolvedReleaseSeconds = normalizeReleaseSeconds(releaseSeconds);
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
    modalGeometryBackend,
  });

  if (!renderAuthority) {
    return buildDormantResult({
      state,
      candidateEntries,
      previousVisibleKeys,
      reset,
      maxBasisModeOrder,
      modalGeometryBackend,
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

    const retainRenderablePayloadForRelease =
      shouldRetainRenderablePayloadForRelease(record, entry);
    if (retainRenderablePayloadForRelease) {
      updateRecordEvidence(record, entry, nowSec);
    } else {
      updateRecordSnapshot(record, entry, nowSec);
    }

    if (entry.evidenceScore >= TOPOLOGY_RELEASE_EVIDENCE) {
      record.lowEvidenceSec = 0;
      record.releaseStartedAtSec = null;
      if (record.basisEligible) {
        record.state = "active";
      }
    } else {
      updateLowEvidenceRecord(record, resolvedDeltaTimeSec, nowSec);
      if (retainRenderablePayloadForRelease) {
        decayRecordLivePayload(record, resolvedReleaseSeconds);
      }
    }

    if (!record.basisEligible) {
      if (entry.evidenceScore >= TOPOLOGY_ADMIT_EVIDENCE) {
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
    let basisChanged = false;
    let completedEviction = false;
    // Complete evictions whose fade has elapsed before selecting admissions,
    // so the freed slots are available to this same reassign event.
    for (const [modeKey, record] of Array.from(
      state.recordsByModeKey.entries(),
    )) {
      if (record.basisEligible && isRecordEvictionComplete(record, nowSec)) {
        removeRecord(state, modeKey);
        removedModeKeys.push(modeKey);
        basisChanged = true;
        completedEviction = true;
      }
    }

    const eligibleRecords = [];
    for (const record of state.recordsByModeKey.values()) {
      if (
        record.basisRepresentable &&
        !record.basisEligible &&
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
    const selectedRecords = selectAdmissionRecords({
      records: eligibleRecords,
      availableVisibleSlots,
      maxDetailVisibleCount: getDetailAdmissionBudget(
        normalizedMaxVisibleModeCount,
      ),
      currentDetailVisibleCount: countVisibleDetailRecords(state),
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
          maxVisibleModeCount: normalizedMaxVisibleModeCount,
          maxHandoffModeCount: normalizedMaxHandoffModeCount,
          alreadyAdmittedCount: selectedRecords.length,
          modalGeometryBackend,
        });
    if (selectedRecords.length > 0 || replacementPairs.length > 0) {
      // Fade admissions in unless the field was empty: modes appearing out of
      // silence pop in at full strength by design.
      const fadeIn = previousVisibleKeys.length > 0;
      for (const record of selectedRecords) {
        activateRecord(record, state, nowSec, { fadeIn });
        admittedModeKeys.push(record.modeKey);
      }
      // A provisioned handoff page keeps both signed modal contributions in
      // the descriptor. The raymarch carrier therefore sums them coherently
      // before any magnitude, density, or radiance transform.
      for (const pair of replacementPairs) {
        beginRecordEviction(pair.target, nowSec);
        activateRecord(pair.candidate, state, nowSec, { fadeIn: true });
        admittedModeKeys.push(pair.candidate.modeKey);
      }
      basisChanged = true;
    }
    if (basisChanged) {
      markBasisChanged(state, nowSec);
    }
  }

  for (const [modeKey, record] of Array.from(
    state.recordsByModeKey.entries(),
  )) {
    if (currentEntryByModeKey.has(modeKey)) {
      if (
        record.basisEligible &&
        record.lowEvidenceSec >= resolvedReleaseSeconds &&
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

    updateLowEvidenceRecord(record, resolvedDeltaTimeSec, nowSec);
    decayRecordLivePayload(record, resolvedReleaseSeconds);
    if (
      record.lowEvidenceSec >= resolvedReleaseSeconds &&
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
    .slice(
      0,
      Number.isFinite(normalizedMaxVisibleModeCount)
        ? normalizedMaxVisibleModeCount + normalizedMaxHandoffModeCount
        : undefined,
    );
  const descriptorSourceOutput = writeDescriptorSource(outputRecords, {
    nowSec,
    deltaTimeSec: resolvedDeltaTimeSec,
  });
  const diagnostics = buildDiagnostics({
    state,
    candidateEntries,
    outputRecords,
    previousVisibleKeys,
    admittedModeKeys,
    removedModeKeys,
    reset,
    maxBasisModeOrder,
    modalGeometryBackend,
  });
  state.diagnostics = diagnostics;

  return {
    descriptorSource: descriptorSourceOutput,
    diagnostics,
  };
}
