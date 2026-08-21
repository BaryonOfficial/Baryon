import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "./modalBudgets.js";
import {
  analyzeModalRepresentation,
  analyzeStructuralAdmission,
  measureModalEntryEnergy,
  resolveCandidateConfidenceDiagnostics,
} from "./modalRepresentationAnalysis.js";
import { DEFAULT_EFFECTIVE_CAVITY_GEOMETRY } from "./cavityGeometry.js";
import { getModalGeometryBackend } from "./modalGeometryBackend.js";
import { buildModalTopologyModeKey } from "./modalTopology.js";
import {
  getModalResponseFrequencyKey,
  getRectangularResponseShellKey,
} from "./modalShell.js";
import { clamp01 } from "../utils/math.js";
import {
  HASH32_OFFSET_BASIS,
  hashFloat32,
  hashUint32,
} from "../utils/hash32.js";
import { assertCanonicalModalDescriptor } from "../contracts/audioFeatureProtocol.js";

function hashPackedQuad(values, hash) {
  let nextHash = hash;
  nextHash = hashFloat32(values?.[0] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[1] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[2] ?? 0, nextHash);
  return hashFloat32(values?.[3] ?? 0, nextHash);
}

function readFiniteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function resolveCapacity(value, slots) {
  if (Number.isFinite(value) && value >= 0) {
    return Math.max(0, Math.floor(value));
  }
  return Math.max(0, Math.floor((slots?.length ?? 0) / 4));
}

function countActiveModalSlots(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let activeCount = 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    if ((slots?.[slotIndex * 4 + 3] ?? 0) > 0) {
      activeCount += 1;
    }
  }
  return activeCount;
}

function resolveValidCount(activeCount, slots) {
  if (Number.isFinite(activeCount) && activeCount >= 0) {
    return Math.max(0, Math.floor(activeCount));
  }
  return countActiveModalSlots(slots);
}

function resolveTotalCapacity({ maxTotalModes, fallbackCapacity }) {
  if (Number.isFinite(maxTotalModes) && maxTotalModes >= 0) {
    return Math.max(0, Math.floor(maxTotalModes));
  }
  return Math.max(0, Math.floor(fallbackCapacity || 0));
}

function countPhaseAuthorityModes(phaseSlots, maxCount) {
  const slotCount = Math.min(
    Math.max(0, Math.floor(maxCount ?? 0)),
    Math.floor((phaseSlots?.length ?? 0) / 4),
  );
  let activeCount = 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const phaseAuthorityWeight =
      (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0);
    if (phaseAuthorityWeight > 1e-4) {
      activeCount += 1;
    }
  }
  return activeCount;
}

function buildAdmissionEntries({
  slots,
  phaseSlots,
  spectralMomentSlots,
  metadataSlots,
  validCount,
}) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  const limit = Math.min(Math.max(0, Math.floor(validCount ?? 0)), slotCount);
  const entries = [];

  for (let slotIndex = 0; slotIndex < limit; slotIndex += 1) {
    const offset = slotIndex * 4;
    const coefficient = Math.max(0, slots?.[offset + 3] ?? 0);
    const u = slots?.[offset] ?? 0;
    const v = slots?.[offset + 1] ?? 0;
    const w = slots?.[offset + 2] ?? 0;
    entries.push({
      modeKey: buildModalTopologyModeKey(u, v, w),
      u,
      v,
      w,
      coefficient,
      phaseOffsetRad: phaseSlots?.[offset] ?? 0,
      phaseVelocityRadPerSec: phaseSlots?.[offset + 1] ?? 0,
      phaseCoherence: phaseSlots?.[offset + 2] ?? 0,
      phaseAuthority: phaseSlots?.[offset + 3] ?? 0,
      spectralMomentX: spectralMomentSlots?.[offset] ?? 0,
      spectralMomentY: spectralMomentSlots?.[offset + 1] ?? 0,
      spectralSecondMomentX: spectralMomentSlots?.[offset + 2] ?? 0,
      spectralSecondMomentY: spectralMomentSlots?.[offset + 3] ?? 0,
      naturalFrequencyHz: readFiniteNonNegative(metadataSlots?.[offset]),
      qualityFactor: readFiniteNonNegative(metadataSlots?.[offset + 1]),
      responseFrequencyHz: readFiniteNonNegative(metadataSlots?.[offset + 2]),
      observedSupport: clamp01(metadataSlots?.[offset + 3] ?? 0),
    });
  }

  return entries;
}

const MODAL_METADATA_ABSOLUTE_TOLERANCE = 1e-4;
const MODAL_METADATA_RELATIVE_TOLERANCE = 1e-4;
const MODAL_PHASE_VELOCITY_TOLERANCE = 1e-6;

function mergeCanonicalModeMetric(existing, next, label, modeKey) {
  if (!(existing > 0)) {
    return next;
  }
  if (!(next > 0)) {
    return existing;
  }
  const tolerance = Math.max(
    MODAL_METADATA_ABSOLUTE_TOLERANCE,
    Math.max(existing, next) * MODAL_METADATA_RELATIVE_TOLERANCE,
  );
  if (Math.abs(existing - next) > tolerance) {
    throw new TypeError(
      `Duplicate modal identity ${modeKey} has conflicting ${label}`,
    );
  }
  return existing;
}

function resolveCanonicalMetadataByMode(entries) {
  const metadataByMode = new Map();
  for (const entry of entries) {
    const existing = metadataByMode.get(entry.modeKey) ?? {
      naturalFrequencyHz: 0,
      qualityFactor: 0,
      responseFrequencyHz: 0,
    };
    metadataByMode.set(entry.modeKey, {
      naturalFrequencyHz: mergeCanonicalModeMetric(
        existing.naturalFrequencyHz,
        entry.naturalFrequencyHz,
        "naturalFrequencyHz",
        entry.modeKey,
      ),
      qualityFactor: mergeCanonicalModeMetric(
        existing.qualityFactor,
        entry.qualityFactor,
        "qualityFactor",
        entry.modeKey,
      ),
      responseFrequencyHz: mergeCanonicalModeMetric(
        existing.responseFrequencyHz,
        entry.responseFrequencyHz,
        "responseFrequencyHz",
        entry.modeKey,
      ),
    });
  }
  return metadataByMode;
}

function mergeAdmissionEntries(entries) {
  const canonicalMetadataByMode = resolveCanonicalMetadataByMode(entries);
  const groupsByMode = new Map();
  const merged = [];

  for (const entry of entries) {
    const modeGroups = groupsByMode.get(entry.modeKey) ?? [];
    const existing = modeGroups.find(
      (candidate) =>
        Math.abs(
          candidate.phaseVelocityRadPerSec - entry.phaseVelocityRadPerSec,
        ) <= MODAL_PHASE_VELOCITY_TOLERANCE,
    );
    const spectralMomentInfluence = Math.max(0, entry.coefficient);
    // Physical complex phase is part of the acoustic coefficient. Confidence
    // controls diagnostics only; multiplying the phasor by confidence would
    // silently rotate every low-authority response onto the positive real axis.
    const phaseCoefficient = entry.coefficient;
    if (!existing) {
      const canonicalMetadata = canonicalMetadataByMode.get(entry.modeKey);
      const created = {
        ...entry,
        coefficientInputTotal: entry.coefficient,
        phasePhasorRe: phaseCoefficient * Math.cos(entry.phaseOffsetRad),
        phasePhasorIm: phaseCoefficient * Math.sin(entry.phaseOffsetRad),
        phaseAuthorityMax: clamp01(entry.phaseAuthority),
        spectralMomentNumeratorX:
          entry.spectralMomentX * spectralMomentInfluence,
        spectralMomentNumeratorY:
          entry.spectralMomentY * spectralMomentInfluence,
        spectralSecondMomentNumeratorX:
          entry.spectralSecondMomentX * spectralMomentInfluence,
        spectralSecondMomentNumeratorY:
          entry.spectralSecondMomentY * spectralMomentInfluence,
        spectralMomentInfluence,
        naturalFrequencyHz: canonicalMetadata.naturalFrequencyHz,
        qualityFactor: canonicalMetadata.qualityFactor,
        responseFrequencyHz: canonicalMetadata.responseFrequencyHz,
      };
      modeGroups.push(created);
      groupsByMode.set(entry.modeKey, modeGroups);
      merged.push(created);
      continue;
    }

    existing.coefficientInputTotal += entry.coefficient;
    existing.phasePhasorRe += phaseCoefficient * Math.cos(entry.phaseOffsetRad);
    existing.phasePhasorIm += phaseCoefficient * Math.sin(entry.phaseOffsetRad);
    existing.phaseAuthorityMax = Math.max(
      existing.phaseAuthorityMax,
      clamp01(entry.phaseAuthority),
    );
    existing.spectralMomentNumeratorX +=
      entry.spectralMomentX * spectralMomentInfluence;
    existing.spectralMomentNumeratorY +=
      entry.spectralMomentY * spectralMomentInfluence;
    existing.spectralSecondMomentNumeratorX +=
      entry.spectralSecondMomentX * spectralMomentInfluence;
    existing.spectralSecondMomentNumeratorY +=
      entry.spectralSecondMomentY * spectralMomentInfluence;
    existing.spectralMomentInfluence += spectralMomentInfluence;
    existing.observedSupport = Math.max(
      existing.observedSupport,
      entry.observedSupport,
    );
  }

  return merged.map((entry) => {
    const {
      coefficientInputTotal,
      phasePhasorRe,
      phasePhasorIm,
      phaseAuthorityMax,
      spectralMomentNumeratorX,
      spectralMomentNumeratorY,
      spectralSecondMomentNumeratorX,
      spectralSecondMomentNumeratorY,
      spectralMomentInfluence,
      ...canonicalEntry
    } = entry;
    const phaseCoefficient = Math.hypot(phasePhasorRe, phasePhasorIm);
    // Duplicate contributions to one physical response mode add as complex
    // amplitudes. The descriptor stores their magnitude plus phase so the
    // renderer can reconstruct the same phasor without duplicate identities.
    const coefficient = phaseCoefficient;
    const effectivePhaseWeight =
      coefficientInputTotal > 1e-9
        ? phaseCoefficient / coefficientInputTotal
        : 0;
    const spectralMomentDenominator = Math.max(spectralMomentInfluence, 1e-9);
    return {
      ...canonicalEntry,
      coefficient,
      phaseOffsetRad:
        phaseCoefficient > 1e-9 ? Math.atan2(phasePhasorIm, phasePhasorRe) : 0,
      phaseCoherence:
        phaseAuthorityMax > 0
          ? clamp01(effectivePhaseWeight / phaseAuthorityMax)
          : 0,
      phaseAuthority: phaseAuthorityMax,
      spectralMomentX: spectralMomentNumeratorX / spectralMomentDenominator,
      spectralMomentY: spectralMomentNumeratorY / spectralMomentDenominator,
      spectralSecondMomentX:
        spectralSecondMomentNumeratorX / spectralMomentDenominator,
      spectralSecondMomentY:
        spectralSecondMomentNumeratorY / spectralMomentDenominator,
    };
  });
}

function groupCoherentShellEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = getRectangularResponseShellKey(entry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return Array.from(groups.values(), (group) =>
    group.sort(
      (left, right) => left.u - right.u || left.v - right.v || left.w - right.w,
    ),
  );
}

function admitCoherentShellEntries(entries, capacity) {
  const groups = groupCoherentShellEntries(entries);
  const admittedEntries = [];
  const rejectedEntries = [];
  for (const group of groups) {
    if (admittedEntries.length + group.length <= capacity) {
      admittedEntries.push(...group);
    } else {
      rejectedEntries.push(...group);
    }
  }
  return { admittedEntries, rejectedEntries };
}

function canonicalizeResponseShellSpectralMoments(entries) {
  // One response shell is squared coherently by the renderer, so all shell
  // members must carry the same pitch basis. This makes slot order irrelevant
  // without turning confidence or presentation state into spectral authority.
  const momentsByShell = new Map();
  for (const entry of entries) {
    const key = getModalResponseFrequencyKey(entry);
    const weight = Math.max(0, entry.coefficient);
    const moment = momentsByShell.get(key) ?? {
      m1x: 0,
      m1y: 0,
      m2x: 0,
      m2y: 0,
      weight: 0,
    };
    moment.m1x += entry.spectralMomentX * weight;
    moment.m1y += entry.spectralMomentY * weight;
    moment.m2x += entry.spectralSecondMomentX * weight;
    moment.m2y += entry.spectralSecondMomentY * weight;
    moment.weight += weight;
    momentsByShell.set(key, moment);
  }

  return entries.map((entry) => {
    const moment = momentsByShell.get(getModalResponseFrequencyKey(entry));
    const inverseWeight = moment.weight > 1e-9 ? 1 / moment.weight : 0;
    return {
      ...entry,
      spectralMomentX: moment.m1x * inverseWeight,
      spectralMomentY: moment.m1y * inverseWeight,
      spectralSecondMomentX: moment.m2x * inverseWeight,
      spectralSecondMomentY: moment.m2y * inverseWeight,
    };
  });
}

function assignEntriesToStableSlotIndices(entries, totalCapacity) {
  const assignments = new Array(totalCapacity).fill(null);
  const orderedEntries = entries.slice(0, totalCapacity);

  for (
    let index = 0;
    index < orderedEntries.length && index < totalCapacity;
    index += 1
  ) {
    assignments[index] = orderedEntries[index];
  }

  return assignments;
}

function writeUnifiedModalSlotViewsFromAssignments(assignments, capacity) {
  const slots = new Float32Array(capacity * 4);
  const phaseSlots = new Float32Array(capacity * 4);
  const spectralMomentSlots = new Float32Array(capacity * 4);
  const metadataSlots = new Float32Array(capacity * 4);

  for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
    const entry = assignments[slotIndex];
    if (!entry) {
      continue;
    }
    const offset = slotIndex * 4;
    slots[offset] = entry.u;
    slots[offset + 1] = entry.v;
    slots[offset + 2] = entry.w;
    slots[offset + 3] = entry.coefficient;

    phaseSlots[offset] = entry.phaseOffsetRad;
    phaseSlots[offset + 1] = entry.phaseVelocityRadPerSec;
    phaseSlots[offset + 2] = entry.phaseCoherence;
    phaseSlots[offset + 3] = entry.phaseAuthority;

    spectralMomentSlots[offset] = entry.spectralMomentX;
    spectralMomentSlots[offset + 1] = entry.spectralMomentY;
    spectralMomentSlots[offset + 2] = entry.spectralSecondMomentX;
    spectralMomentSlots[offset + 3] = entry.spectralSecondMomentY;

    metadataSlots[offset] = entry.naturalFrequencyHz;
    metadataSlots[offset + 1] = entry.qualityFactor;
    metadataSlots[offset + 2] = entry.responseFrequencyHz;
    metadataSlots[offset + 3] = entry.observedSupport;
  }

  return {
    modalFieldSlots: slots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldSpectralMomentSlots: spectralMomentSlots,
    modalFieldMetadataSlots: metadataSlots,
  };
}

function buildZeroedModalSlotViews(capacity) {
  const length = Math.max(0, Math.floor(capacity ?? 0)) * 4;

  return {
    modalFieldSlots: new Float32Array(length),
    modalFieldPhaseSlots: new Float32Array(length),
    modalFieldSpectralMomentSlots: new Float32Array(length),
    modalFieldMetadataSlots: new Float32Array(length),
  };
}

function countOccupiedSlotSpan(assignments) {
  for (let slotIndex = assignments.length - 1; slotIndex >= 0; slotIndex -= 1) {
    if (assignments[slotIndex] != null) {
      return slotIndex + 1;
    }
  }
  return 0;
}

function buildSpectralMomentDescriptorHash(slotAssignments) {
  let hash = HASH32_OFFSET_BASIS;
  hash = hashUint32(slotAssignments.length, hash);
  for (let slotIndex = 0; slotIndex < slotAssignments.length; slotIndex += 1) {
    const entry = slotAssignments[slotIndex];
    hash = hashUint32(slotIndex, hash);
    if (!entry) {
      hash = hashUint32(0, hash);
      continue;
    }
    hash = hashUint32(1, hash);
    hash = hashFloat32(entry.u, hash);
    hash = hashFloat32(entry.v, hash);
    hash = hashFloat32(entry.w, hash);
    hash = hashPackedQuad(
      [
        entry.spectralMomentX,
        entry.spectralMomentY,
        entry.spectralSecondMomentX,
        entry.spectralSecondMomentY,
      ],
      hash,
    );
  }
  return hash >>> 0;
}

/**
 * @param {{
 *   generation?: number,
 *   maxTotalModes?: number,
 *   modalFieldSlots?: Float32Array | number[],
 *   modalFieldPhaseSlots?: Float32Array | number[],
 *   modalFieldSpectralMomentSlots?: Float32Array | number[] | null,
 *   modalFieldMetadataSlots?: Float32Array | number[] | null,
 *   activeModalFieldModeCount?: number,
 *   observerCandidateModeCount?: number,
 *   observedModalModeCount?: number,
 *   phaseAuthorityModeCount?: number,
 *   rawCandidateModeCount?: number,
 *   confidenceQualifiedCandidateModeCount?: number,
 *   lowConfidenceCandidateModeCount?: number,
 *   rawCandidateModalEnergy?: number,
 *   confidenceWeightedCandidateEnergy?: number,
 *   modalObservationCoherence?: number,
 *   modalObservationConfidence?: number,
 *   modeIdentityRetentionRatio?: number,
 *   upstreamSourceCoupledModeCount?: number,
 *   upstreamResonantModeCount?: number,
 *   upstreamCandidateModeCount?: number,
 *   upstreamSourceCoupledShellCount?: number,
 *   upstreamResonantShellCount?: number,
 *   upstreamCandidateShellCount?: number,
 *   upstreamSourceCoupledModalEnergy?: number,
 *   upstreamResonantModalEnergy?: number,
 *   upstreamCandidateModalEnergy?: number,
 *   previousFieldAuthority?: string | null,
 *   directOpticalModeCapacity?: number,
 *   cavityGeometry?: import("./cavityGeometry.js").CavityGeometry,
 * }} [options]
 */
export function buildCanonicalFullModalDescriptor({
  generation = 0,
  maxTotalModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldSpectralMomentSlots = null,
  modalFieldMetadataSlots = null,
  activeModalFieldModeCount,
  observerCandidateModeCount,
  observedModalModeCount,
  phaseAuthorityModeCount,
  rawCandidateModeCount,
  confidenceQualifiedCandidateModeCount,
  lowConfidenceCandidateModeCount,
  rawCandidateModalEnergy,
  confidenceWeightedCandidateEnergy,
  modalObservationCoherence,
  modalObservationConfidence,
  modeIdentityRetentionRatio = 1,
  upstreamSourceCoupledModeCount,
  upstreamResonantModeCount,
  upstreamCandidateModeCount,
  upstreamSourceCoupledShellCount,
  upstreamResonantShellCount,
  upstreamCandidateShellCount,
  upstreamSourceCoupledModalEnergy,
  upstreamResonantModalEnergy,
  upstreamCandidateModalEnergy,
  directOpticalModeCapacity = MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
  cavityGeometry = DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
} = {}) {
  const modalGeometryBackend = getModalGeometryBackend(cavityGeometry);
  const fallbackCapacity = resolveCapacity(undefined, modalFieldSlots);
  const totalCapacity = resolveTotalCapacity({
    maxTotalModes,
    fallbackCapacity,
  });
  const validModeCount = resolveValidCount(
    activeModalFieldModeCount,
    modalFieldSlots,
  );
  const admissionEntries = buildAdmissionEntries({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    spectralMomentSlots: modalFieldSpectralMomentSlots,
    metadataSlots: modalFieldMetadataSlots,
    validCount: validModeCount,
  });
  const mergedEntries = canonicalizeResponseShellSpectralMoments(
    mergeAdmissionEntries(admissionEntries),
  );
  const { admittedEntries, rejectedEntries } = admitCoherentShellEntries(
    mergedEntries,
    totalCapacity,
  );
  const slotAssignments = assignEntriesToStableSlotIndices(
    admittedEntries,
    totalCapacity,
  );
  const acceptedEntries = slotAssignments.filter((entry) => entry != null);
  const occupiedSlotSpan = countOccupiedSlotSpan(slotAssignments);
  const overflowModeCount = rejectedEntries.length;
  const rejectedModalEnergy = rejectedEntries.reduce(
    (total, entry) => total + Math.max(0, entry.coefficient) ** 2,
    0,
  );
  const descriptorOverflow = overflowModeCount > 0;
  const structuralAdmission = analyzeStructuralAdmission(slotAssignments, {
    directOpticalModeCapacity,
  });
  const rejectionReasons = {};
  if (overflowModeCount > 0) {
    rejectionReasons.descriptorCapacity = overflowModeCount;
  }
  if (structuralAdmission.directOpticalCapacityRejectedCount > 0) {
    rejectionReasons.directOpticalCapacity =
      structuralAdmission.directOpticalCapacityRejectedCount;
  }
  const unifiedSlotViews = writeUnifiedModalSlotViewsFromAssignments(
    slotAssignments,
    totalCapacity,
  );
  const spectralMomentHash =
    buildSpectralMomentDescriptorHash(slotAssignments);
  const resolvedPhaseAuthorityModeCount = Number.isFinite(
    phaseAuthorityModeCount,
  )
    ? Math.max(0, Math.floor(phaseAuthorityModeCount))
    : countPhaseAuthorityModes(modalFieldPhaseSlots, validModeCount);
  const fallbackRawCandidateModalEnergy =
    acceptedEntries.reduce(
      (total, entry) => total + measureModalEntryEnergy(entry),
      0,
    ) + rejectedModalEnergy;
  const fallbackConfidenceWeightedCandidateEnergy = acceptedEntries.reduce(
    (total, entry) => {
      const support = clamp01(entry.observedSupport ?? 0);
      return total + (support * Math.max(0, entry.coefficient ?? 0)) ** 2;
    },
    0,
  );
  const candidateConfidenceDiagnostics = resolveCandidateConfidenceDiagnostics({
    rawCandidateModeCount,
    confidenceQualifiedCandidateModeCount,
    lowConfidenceCandidateModeCount,
    rawCandidateModalEnergy,
    confidenceWeightedCandidateEnergy,
    modalObservationCoherence,
    modalObservationConfidence,
    fallbackRawCandidateModeCount: validModeCount,
    fallbackConfidenceQualifiedCandidateModeCount: acceptedEntries.length,
    fallbackRawCandidateModalEnergy,
    fallbackConfidenceWeightedCandidateEnergy,
  });
  const representationAnalysis = analyzeModalRepresentation({
    slotAssignments,
    rejectedEntries,
    structuralAdmission,
    observerCandidateModeCount,
    observedModalModeCount,
    phaseAuthorityModeCount: resolvedPhaseAuthorityModeCount,
    ...candidateConfidenceDiagnostics,
    modeIdentityRetentionRatio,
    upstreamSourceCoupledModeCount,
    upstreamResonantModeCount,
    upstreamCandidateModeCount,
    upstreamSourceCoupledShellCount,
    upstreamResonantShellCount,
    upstreamCandidateShellCount,
    upstreamSourceCoupledModalEnergy,
    upstreamResonantModalEnergy,
    upstreamCandidateModalEnergy,
    modalGeometryBackend,
  });
  // Spatial support is already decided by the apparatus-derived atlas before
  // a mode reaches this descriptor. The descriptor must not reinterpret that
  // physical boundary; only its own finite packet capacity can still limit the
  // admitted field.
  const fieldAuthority = descriptorOverflow ? "capacity-limited" : "complete";
  const renderAuthoritative =
    fieldAuthority === "complete" || fieldAuthority === "capacity-limited";
  const renderSlotViews = renderAuthoritative
    ? unifiedSlotViews
    : buildZeroedModalSlotViews(totalCapacity);
  const renderedEntries = renderAuthoritative ? acceptedEntries : [];
  const renderedValidModeCount = renderAuthoritative ? validModeCount : 0;
  const renderedOccupiedSlotSpan = renderAuthoritative ? occupiedSlotSpan : 0;

  const descriptor = {
    generation: Math.max(0, Math.floor(generation ?? 0)),
    fieldAuthority,
    capacity: {
      maxTotalModes: totalCapacity,
    },
    modes: {
      modalField: renderedEntries.map((entry) => ({
        modeKey: entry.modeKey,
        u: entry.u,
        v: entry.v,
        w: entry.w,
        coefficient: entry.coefficient,
        referenceAmplitude: entry.coefficient,
        phaseOffsetRad: entry.phaseOffsetRad,
        phaseVelocityRadPerSec: entry.phaseVelocityRadPerSec,
        phaseCoherence: entry.phaseCoherence,
        phaseAuthority: entry.phaseAuthority,
        coherence: entry.phaseCoherence,
        persistence: entry.phaseAuthority,
        naturalFrequencyHz: entry.naturalFrequencyHz,
        qualityFactor: entry.qualityFactor,
        dampingRatio:
          entry.qualityFactor > 0 ? 1 / (2 * entry.qualityFactor) : 0,
        responseFrequencyHz: entry.responseFrequencyHz,
        observedSupport: entry.observedSupport,
        material: {
          spectralMoment: [
            entry.spectralMomentX,
            entry.spectralMomentY,
            entry.spectralSecondMomentX,
            entry.spectralSecondMomentY,
          ],
        },
      })),
    },
    counts: {
      validModeCount: renderedValidModeCount,
      modalFieldModeCount: renderedOccupiedSlotSpan,
      overflowModeCount,
    },
    diagnostics: {
      observerCandidateModeCount: Number.isFinite(observerCandidateModeCount)
        ? Math.max(0, Math.floor(observerCandidateModeCount))
        : validModeCount,
      observedModalModeCount: Number.isFinite(observedModalModeCount)
        ? Math.max(0, Math.floor(observedModalModeCount))
        : validModeCount,
      phaseAuthorityModeCount: resolvedPhaseAuthorityModeCount,
      ...candidateConfidenceDiagnostics,
      modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio ?? 1),
      descriptorOverflow,
      structuralCoverageSatisfied:
        !descriptorOverflow && structuralAdmission.structuralCoverageSatisfied,
      rejectedModalEnergy:
        rejectedModalEnergy +
        structuralAdmission.directOpticalCapacityRejectedEnergy,
      descriptorRejectedModalEnergy: rejectedModalEnergy,
      directOpticalCapacityRejectedModalEnergy:
        structuralAdmission.directOpticalCapacityRejectedEnergy,
      directOpticalCapacityRejectedCount:
        structuralAdmission.directOpticalCapacityRejectedCount,
      directOpticalModeCapacity: structuralAdmission.directOpticalModeCapacity,
      spectralMomentHash,
      modalVarietyAudit: representationAnalysis,
      rejectionReasons,
    },
    slotViews: {
      ...renderSlotViews,
    },
  };
  assertCanonicalModalDescriptor(descriptor);
  return descriptor;
}
