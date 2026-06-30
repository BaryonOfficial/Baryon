import {
  MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  MODAL_BASIS_CACHE_RESOLUTION,
  getModalBasisCacheMaxRepresentableModeIndex,
} from "./modalBudgets.js";
import {
  normalizeSpectralLanePacket,
  readPackedQuad,
} from "../utils/audio/spectralLanePacket.js";
import { DEFAULT_EFFECTIVE_CAVITY_GEOMETRY } from "./cavityGeometry.js";
import { getModalGeometryBackend } from "./modalGeometryBackend.js";
import { clamp01 } from "../utils/math.js";

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const FLOAT32_BITS_VALUE = new Float32Array(1);
const FLOAT32_BITS_VIEW = new Uint32Array(FLOAT32_BITS_VALUE.buffer);
const OVER_BANDWIDTH_DOMINANCE_EPSILON = 1e-9;
const OVER_BANDWIDTH_SEMANTIC_DOMINANCE_RATIO = 0.85;
const OVER_BANDWIDTH_AUTHORITY_ENTER_RATIO = 1.05;
const OVER_BANDWIDTH_AUTHORITY_EXIT_RATIO = 0.9;

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function hashFloat32(value, hash) {
  FLOAT32_BITS_VALUE[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return hashUint32(FLOAT32_BITS_VIEW[0], hash);
}

function hashPackedQuad(values, hash) {
  let nextHash = hash;
  nextHash = hashFloat32(values?.[0] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[1] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[2] ?? 0, nextHash);
  return hashFloat32(values?.[3] ?? 0, nextHash);
}

function deriveStructuralAdmissionDiagnostics(
  slotAssignments,
  {
    basisAtlasPageCapacity = MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    basisCacheResolution = MODAL_BASIS_CACHE_RESOLUTION,
  } = {},
) {
  const normalizedBasisCapacity = Math.max(
    0,
    Math.floor(basisAtlasPageCapacity),
  );
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(basisCacheResolution);
  let basisAtlasCapacityRejectedCount = 0;
  let basisAtlasCapacityRejectedEnergy = 0;
  let spatialBandwidthRejectedCount = 0;
  let spatialBandwidthRejectedEnergy = 0;

  for (let slotIndex = 0; slotIndex < slotAssignments.length; slotIndex += 1) {
    const entry = slotAssignments[slotIndex];
    if (!entry) {
      continue;
    }

    const modalEnergy = Math.max(0, entry.coefficient) ** 2;
    const maxModeIndex = Math.max(
      Math.abs(entry.u),
      Math.abs(entry.v),
      Math.abs(entry.w),
    );

    if (maxModeIndex > maxRepresentableModeIndex) {
      spatialBandwidthRejectedCount += 1;
      spatialBandwidthRejectedEnergy += modalEnergy;
      continue;
    }

    if (slotIndex >= normalizedBasisCapacity) {
      basisAtlasCapacityRejectedCount += 1;
      basisAtlasCapacityRejectedEnergy += modalEnergy;
    }
  }

  return {
    basisAtlasPageCapacity: normalizedBasisCapacity,
    maxRepresentableModeIndex,
    basisAtlasCapacityRejectedCount,
    basisAtlasCapacityRejectedEnergy,
    spatialBandwidthRejectedCount,
    spatialBandwidthRejectedEnergy,
    structuralCoverageSatisfied:
      basisAtlasCapacityRejectedCount === 0 &&
      spatialBandwidthRejectedCount === 0,
  };
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

function getEntryModalEnergy(entry) {
  return Math.max(0, entry?.coefficient ?? 0) ** 2;
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

function getEntryModeOrder(entry) {
  return Math.max(Math.abs(entry.u), Math.abs(entry.v), Math.abs(entry.w));
}

function getSpatialFamilyKey(entry, modalGeometryBackend) {
  return modalGeometryBackend.getModeFamilyKey(entry);
}

function getSpatialShellKey(entry, modalGeometryBackend) {
  return modalGeometryBackend.getModeShellKey(entry);
}

function divideOrFallback(numerator, denominator, fallback = 0) {
  return denominator > 0 ? numerator / denominator : fallback;
}

function normalizeFieldAuthority(value) {
  return value === "bandwidth-limited" ||
    value === "capacity-limited" ||
    value === "blocked" ||
    value === "complete"
    ? value
    : null;
}

function resolveOverBandwidthAuthorityDominant({
  rejectedModalEnergy,
  representedModalEnergy,
  representedEnergyRatio,
  semanticEnergyRatio,
  previousFieldAuthority,
}) {
  if (!(rejectedModalEnergy > OVER_BANDWIDTH_DOMINANCE_EPSILON)) {
    return false;
  }

  if (semanticEnergyRatio < OVER_BANDWIDTH_SEMANTIC_DOMINANCE_RATIO) {
    return false;
  }

  if (representedModalEnergy <= OVER_BANDWIDTH_DOMINANCE_EPSILON) {
    return true;
  }

  const previousAuthority = normalizeFieldAuthority(previousFieldAuthority);
  const threshold =
    previousAuthority === "bandwidth-limited"
      ? OVER_BANDWIDTH_AUTHORITY_EXIT_RATIO
      : OVER_BANDWIDTH_AUTHORITY_ENTER_RATIO;
  return representedEnergyRatio >= threshold;
}

function coverageRatio(numerator, denominator, fallback = 0) {
  return clamp01(divideOrFallback(numerator, denominator, fallback));
}

function resolveNonNegativeInteger(value, fallback = 0) {
  if (Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return Math.max(0, Math.floor(fallback ?? 0));
}

function resolveNonNegativeNumber(value, fallback = 0) {
  if (Number.isFinite(value)) {
    return Math.max(0, value);
  }
  return Math.max(0, fallback ?? 0);
}

/**
 * @param {{
 *   overBandwidthRejectedModeCount?: number,
 *   overBandwidthRejectedModalEnergy?: number,
 *   overBandwidthMaxRequestedModeIndex?: number,
 *   overBandwidthMaxRequestedMode?: [number, number, number] | number[],
 * }} [diagnostics]
 */
function resolveOverBandwidthDiagnostics({
  overBandwidthRejectedModeCount,
  overBandwidthRejectedModalEnergy,
  overBandwidthMaxRequestedModeIndex,
  overBandwidthMaxRequestedMode,
} = {}) {
  return {
    overBandwidthRejectedModeCount: resolveNonNegativeInteger(
      overBandwidthRejectedModeCount,
    ),
    overBandwidthRejectedModalEnergy: resolveNonNegativeNumber(
      overBandwidthRejectedModalEnergy,
    ),
    overBandwidthMaxRequestedModeIndex: resolveNonNegativeInteger(
      overBandwidthMaxRequestedModeIndex,
    ),
    overBandwidthMaxRequestedMode: Array.isArray(overBandwidthMaxRequestedMode)
      ? [
          overBandwidthMaxRequestedMode[0] ?? 0,
          overBandwidthMaxRequestedMode[1] ?? 0,
          overBandwidthMaxRequestedMode[2] ?? 0,
        ].map((coordinate) =>
          Number.isFinite(coordinate) ? Math.trunc(coordinate) : 0,
        )
      : [0, 0, 0],
  };
}

function resolveCandidateConfidenceDiagnostics({
  rawCandidateModeCount,
  confidenceQualifiedCandidateModeCount,
  lowConfidenceCandidateModeCount,
  rawCandidateModalEnergy,
  confidenceWeightedCandidateEnergy,
  modalObservationCoherence,
  modalObservationConfidence,
  fallbackRawCandidateModeCount = 0,
  fallbackConfidenceQualifiedCandidateModeCount = 0,
  fallbackRawCandidateModalEnergy = 0,
  fallbackConfidenceWeightedCandidateEnergy = 0,
}) {
  const resolvedRawCandidateModeCount = Math.max(
    resolveNonNegativeInteger(rawCandidateModeCount),
    resolveNonNegativeInteger(fallbackRawCandidateModeCount),
  );
  const resolvedConfidenceQualifiedCandidateModeCount = Math.min(
    resolvedRawCandidateModeCount,
    resolveNonNegativeInteger(
      confidenceQualifiedCandidateModeCount,
      fallbackConfidenceQualifiedCandidateModeCount,
    ),
  );
  const resolvedLowConfidenceCandidateModeCount = Math.min(
    resolvedRawCandidateModeCount,
    resolveNonNegativeInteger(
      lowConfidenceCandidateModeCount,
      Math.max(
        0,
        resolvedRawCandidateModeCount -
          resolvedConfidenceQualifiedCandidateModeCount,
      ),
    ),
  );

  return {
    rawCandidateModeCount: resolvedRawCandidateModeCount,
    confidenceQualifiedCandidateModeCount:
      resolvedConfidenceQualifiedCandidateModeCount,
    lowConfidenceCandidateModeCount: resolvedLowConfidenceCandidateModeCount,
    rawCandidateModalEnergy: Math.max(
      resolveNonNegativeNumber(rawCandidateModalEnergy),
      resolveNonNegativeNumber(fallbackRawCandidateModalEnergy),
    ),
    confidenceWeightedCandidateEnergy: resolveNonNegativeNumber(
      confidenceWeightedCandidateEnergy,
      fallbackConfidenceWeightedCandidateEnergy,
    ),
    modalObservationCoherence: clamp01(
      Number.isFinite(modalObservationCoherence)
        ? modalObservationCoherence
        : 1,
    ),
    modalObservationConfidence: clamp01(
      Number.isFinite(modalObservationConfidence)
        ? modalObservationConfidence
        : 1,
    ),
  };
}

function getSpectralLanePacketMass(laneA, laneB) {
  let mass = 0;
  for (let laneIndex = 0; laneIndex < 4; laneIndex += 1) {
    mass += Math.max(0, laneA?.[laneIndex] ?? 0);
    mass += Math.max(0, laneB?.[laneIndex] ?? 0);
  }
  return mass;
}

function buildModalVarietyAudit({
  slotAssignments,
  rejectedEntries,
  structuralAdmission,
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
  overBandwidthRejectedModeCount,
  overBandwidthRejectedModalEnergy,
  overBandwidthMaxRequestedModeIndex,
  overBandwidthMaxRequestedMode,
  previousFieldAuthority,
  modalGeometryBackend,
}) {
  const acceptedEntries = slotAssignments.filter(Boolean);
  const representedEntries = [];
  const shellKeys = new Set();
  const representedShellKeys = new Set();
  const familyKeys = new Set();
  const representedFamilyKeys = new Set();
  let acceptedModalEnergy = 0;
  let representedModalEnergy = 0;
  let modalEnergySquaredSum = 0;
  let minModeOrder = Infinity;
  let maxModeOrder = 0;
  let weightedModeOrderSum = 0;

  for (let slotIndex = 0; slotIndex < slotAssignments.length; slotIndex += 1) {
    const entry = slotAssignments[slotIndex];
    if (!entry) {
      continue;
    }

    const modalEnergy = Math.max(0, entry.coefficient) ** 2;
    const modeOrder = getEntryModeOrder(entry);
    acceptedModalEnergy += modalEnergy;
    modalEnergySquaredSum += modalEnergy * modalEnergy;
    minModeOrder = Math.min(minModeOrder, modeOrder);
    maxModeOrder = Math.max(maxModeOrder, modeOrder);
    weightedModeOrderSum += modalEnergy * modeOrder;
    shellKeys.add(getSpatialShellKey(entry, modalGeometryBackend));
    familyKeys.add(getSpatialFamilyKey(entry, modalGeometryBackend));

    if (
      modeOrder <= structuralAdmission.maxRepresentableModeIndex &&
      slotIndex < structuralAdmission.basisAtlasPageCapacity
    ) {
      representedEntries.push(entry);
      representedShellKeys.add(getSpatialShellKey(entry, modalGeometryBackend));
      representedFamilyKeys.add(
        getSpatialFamilyKey(entry, modalGeometryBackend),
      );
      representedModalEnergy += modalEnergy;
    }
  }

  const descriptorRejectedModalEnergy = rejectedEntries.reduce(
    (total, entry) => total + Math.max(0, entry.coefficient) ** 2,
    0,
  );
  const overBandwidthDiagnostics = resolveOverBandwidthDiagnostics({
    overBandwidthRejectedModeCount,
    overBandwidthRejectedModalEnergy,
    overBandwidthMaxRequestedModeIndex,
    overBandwidthMaxRequestedMode,
  });
  const {
    overBandwidthRejectedModeCount: resolvedOverBandwidthRejectedModeCount,
    overBandwidthRejectedModalEnergy: resolvedOverBandwidthRejectedModalEnergy,
    overBandwidthMaxRequestedModeIndex:
      resolvedOverBandwidthMaxRequestedModeIndex,
    overBandwidthMaxRequestedMode: resolvedOverBandwidthMaxRequestedMode,
  } = overBandwidthDiagnostics;
  const semanticModalEnergy =
    acceptedModalEnergy +
    descriptorRejectedModalEnergy +
    resolvedOverBandwidthRejectedModalEnergy;
  const resolvedObserverCandidateModeCount = resolveNonNegativeInteger(
    observerCandidateModeCount,
    acceptedEntries.length,
  );
  const resolvedObservedModalModeCount = resolveNonNegativeInteger(
    observedModalModeCount,
    acceptedEntries.length,
  );
  const resolvedPhaseAuthorityModeCount = resolveNonNegativeInteger(
    phaseAuthorityModeCount,
    acceptedEntries.length,
  );
  const resolvedUpstreamSourceCoupledModeCount = resolveNonNegativeInteger(
    upstreamSourceCoupledModeCount,
  );
  const resolvedUpstreamResonantModeCount = resolveNonNegativeInteger(
    upstreamResonantModeCount,
  );
  const summedUpstreamCandidateModeCount =
    resolvedUpstreamSourceCoupledModeCount + resolvedUpstreamResonantModeCount;
  const resolvedUpstreamCandidateModeCount = Math.max(
    resolveNonNegativeInteger(upstreamCandidateModeCount),
    summedUpstreamCandidateModeCount,
    acceptedEntries.length,
  );
  const resolvedUpstreamSourceCoupledShellCount = resolveNonNegativeInteger(
    upstreamSourceCoupledShellCount,
  );
  const resolvedUpstreamResonantShellCount = resolveNonNegativeInteger(
    upstreamResonantShellCount,
  );
  const summedUpstreamCandidateShellCount =
    resolvedUpstreamSourceCoupledShellCount +
    resolvedUpstreamResonantShellCount;
  const fallbackUpstreamCandidateShellCount = Math.max(
    summedUpstreamCandidateShellCount,
    shellKeys.size,
  );
  const resolvedUpstreamCandidateShellCount = Math.max(
    resolveNonNegativeInteger(
      upstreamCandidateShellCount,
      fallbackUpstreamCandidateShellCount,
    ),
    shellKeys.size,
  );
  const resolvedUpstreamSourceCoupledModalEnergy = resolveNonNegativeNumber(
    upstreamSourceCoupledModalEnergy,
  );
  const resolvedUpstreamResonantModalEnergy = resolveNonNegativeNumber(
    upstreamResonantModalEnergy,
  );
  const summedUpstreamCandidateModalEnergy =
    resolvedUpstreamSourceCoupledModalEnergy +
    resolvedUpstreamResonantModalEnergy;
  const resolvedUpstreamCandidateModalEnergy = Math.max(
    resolveNonNegativeNumber(upstreamCandidateModalEnergy),
    summedUpstreamCandidateModalEnergy,
    semanticModalEnergy,
  );
  const candidateConfidenceDiagnostics = resolveCandidateConfidenceDiagnostics({
    rawCandidateModeCount,
    confidenceQualifiedCandidateModeCount,
    lowConfidenceCandidateModeCount,
    rawCandidateModalEnergy,
    confidenceWeightedCandidateEnergy,
    modalObservationCoherence,
    modalObservationConfidence,
    fallbackRawCandidateModeCount: Math.max(
      resolvedUpstreamCandidateModeCount,
      acceptedEntries.length,
    ),
    fallbackConfidenceQualifiedCandidateModeCount: acceptedEntries.length,
    fallbackRawCandidateModalEnergy: resolvedUpstreamCandidateModalEnergy,
    fallbackConfidenceWeightedCandidateEnergy: acceptedModalEnergy,
  });
  const energyEffectiveModeCount =
    modalEnergySquaredSum > 0
      ? (acceptedModalEnergy * acceptedModalEnergy) / modalEnergySquaredSum
      : 0;
  const overBandwidthRejectedRepresentedEnergyRatio =
    representedModalEnergy > OVER_BANDWIDTH_DOMINANCE_EPSILON
      ? resolvedOverBandwidthRejectedModalEnergy / representedModalEnergy
      : resolvedOverBandwidthRejectedModalEnergy >
          OVER_BANDWIDTH_DOMINANCE_EPSILON
        ? Number.MAX_SAFE_INTEGER
        : 0;
  const overBandwidthRejectedEnergyRatio = divideOrFallback(
    resolvedOverBandwidthRejectedModalEnergy,
    semanticModalEnergy,
  );
  const overBandwidthDominant = resolveOverBandwidthAuthorityDominant({
    rejectedModalEnergy: resolvedOverBandwidthRejectedModalEnergy,
    representedModalEnergy,
    representedEnergyRatio: overBandwidthRejectedRepresentedEnergyRatio,
    semanticEnergyRatio: overBandwidthRejectedEnergyRatio,
    previousFieldAuthority,
  });

  return {
    modalTopologyGeometry: modalGeometryBackend.cavityGeometry,
    semanticModeCount: acceptedEntries.length,
    representedBasisPageModeCount: representedEntries.length,
    observerCandidateModeCount: resolvedObserverCandidateModeCount,
    observedModalModeCount: resolvedObservedModalModeCount,
    phaseAuthorityModeCount: resolvedPhaseAuthorityModeCount,
    ...candidateConfidenceDiagnostics,
    upstreamSourceCoupledModeCount: resolvedUpstreamSourceCoupledModeCount,
    upstreamResonantModeCount: resolvedUpstreamResonantModeCount,
    upstreamCandidateModeCount: resolvedUpstreamCandidateModeCount,
    upstreamSourceCoupledShellCount: resolvedUpstreamSourceCoupledShellCount,
    upstreamResonantShellCount: resolvedUpstreamResonantShellCount,
    upstreamCandidateShellCount: resolvedUpstreamCandidateShellCount,
    upstreamSourceCoupledModalEnergy: resolvedUpstreamSourceCoupledModalEnergy,
    upstreamResonantModalEnergy: resolvedUpstreamResonantModalEnergy,
    upstreamCandidateModalEnergy: resolvedUpstreamCandidateModalEnergy,
    publishedModeCoverageRatio: coverageRatio(
      acceptedEntries.length,
      resolvedUpstreamCandidateModeCount,
      resolvedUpstreamCandidateModeCount > 0 ? 0 : 1,
    ),
    publishedShellCoverageRatio: coverageRatio(
      shellKeys.size,
      resolvedUpstreamCandidateShellCount,
      resolvedUpstreamCandidateShellCount > 0 ? 0 : 1,
    ),
    publishedModalEnergyCoverageRatio: coverageRatio(
      semanticModalEnergy,
      resolvedUpstreamCandidateModalEnergy,
      resolvedUpstreamCandidateModalEnergy > 0 ? 0 : 1,
    ),
    observerCandidatePublishedModeCoverageRatio: coverageRatio(
      acceptedEntries.length,
      resolvedObserverCandidateModeCount,
      resolvedObserverCandidateModeCount > 0 ? 0 : 1,
    ),
    observedModalPublishedModeCoverageRatio: coverageRatio(
      acceptedEntries.length,
      resolvedObservedModalModeCount,
      resolvedObservedModalModeCount > 0 ? 0 : 1,
    ),
    phaseAuthorityPublishedModeCoverageRatio: coverageRatio(
      acceptedEntries.length,
      resolvedPhaseAuthorityModeCount,
      resolvedPhaseAuthorityModeCount > 0 ? 0 : 1,
    ),
    basisRepresentedUpstreamModeCoverageRatio: coverageRatio(
      representedEntries.length,
      resolvedUpstreamCandidateModeCount,
      resolvedUpstreamCandidateModeCount > 0 ? 0 : 1,
    ),
    basisRepresentedShellCoverageRatio: coverageRatio(
      representedShellKeys.size,
      resolvedUpstreamCandidateShellCount,
      resolvedUpstreamCandidateShellCount > 0 ? 0 : 1,
    ),
    basisRepresentedObservedModeCoverageRatio: coverageRatio(
      representedEntries.length,
      resolvedObservedModalModeCount,
      resolvedObservedModalModeCount > 0 ? 0 : 1,
    ),
    basisRepresentedPhaseAuthorityModeCoverageRatio: coverageRatio(
      representedEntries.length,
      resolvedPhaseAuthorityModeCount,
      resolvedPhaseAuthorityModeCount > 0 ? 0 : 1,
    ),
    basisAtlasPageCapacity: structuralAdmission.basisAtlasPageCapacity,
    basisAtlasPressure: divideOrFallback(
      representedEntries.length,
      structuralAdmission.basisAtlasPageCapacity,
    ),
    semanticShellCount: shellKeys.size,
    representedShellCount: representedShellKeys.size,
    duplicateShellPressure: divideOrFallback(
      acceptedEntries.length - shellKeys.size,
      acceptedEntries.length,
    ),
    representedDuplicateShellPressure: divideOrFallback(
      representedEntries.length - representedShellKeys.size,
      representedEntries.length,
    ),
    spatialFamilyCount: familyKeys.size,
    representedSpatialFamilyCount: representedFamilyKeys.size,
    energyEffectiveModeCount,
    modeOrderMin: Number.isFinite(minModeOrder) ? minModeOrder : 0,
    modeOrderMax: maxModeOrder,
    energyWeightedModeOrderMean: divideOrFallback(
      weightedModeOrderSum,
      acceptedModalEnergy,
    ),
    phaseAuthorityCoverage: divideOrFallback(
      phaseAuthorityModeCount,
      acceptedEntries.length,
    ),
    modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio ?? 1),
    semanticModalEnergy,
    representedModalEnergy,
    renderRepresentedEnergyRatio: divideOrFallback(
      representedModalEnergy,
      semanticModalEnergy,
      semanticModalEnergy > 0 ? 0 : 1,
    ),
    descriptorRejectedModeCount: rejectedEntries.length,
    descriptorRejectedEnergyRatio: divideOrFallback(
      descriptorRejectedModalEnergy,
      semanticModalEnergy,
    ),
    basisAtlasCapacityRejectedCount:
      structuralAdmission.basisAtlasCapacityRejectedCount,
    basisAtlasCapacityRejectedEnergyRatio: divideOrFallback(
      structuralAdmission.basisAtlasCapacityRejectedEnergy,
      semanticModalEnergy,
    ),
    spatialBandwidthRejectedCount:
      structuralAdmission.spatialBandwidthRejectedCount,
    spatialBandwidthRejectedEnergyRatio: divideOrFallback(
      structuralAdmission.spatialBandwidthRejectedEnergy,
      semanticModalEnergy,
    ),
    overBandwidthRejectedModeCount: resolvedOverBandwidthRejectedModeCount,
    overBandwidthRejectedModalEnergy: resolvedOverBandwidthRejectedModalEnergy,
    overBandwidthRejectedEnergyRatio,
    overBandwidthRejectedRepresentedEnergyRatio,
    overBandwidthDominant,
    overBandwidthSemanticDominanceRatio:
      OVER_BANDWIDTH_SEMANTIC_DOMINANCE_RATIO,
    overBandwidthAuthorityEnterRatio: OVER_BANDWIDTH_AUTHORITY_ENTER_RATIO,
    overBandwidthAuthorityExitRatio: OVER_BANDWIDTH_AUTHORITY_EXIT_RATIO,
    overBandwidthMaxRequestedModeIndex:
      resolvedOverBandwidthMaxRequestedModeIndex,
    overBandwidthMaxRequestedMode: resolvedOverBandwidthMaxRequestedMode,
    basisAtlasCapacitySweep: buildBasisAtlasCapacitySweep({
      slotAssignments,
      semanticModalEnergy,
      maxRepresentableModeIndex: structuralAdmission.maxRepresentableModeIndex,
      basisAtlasPageCapacity: structuralAdmission.basisAtlasPageCapacity,
      modalGeometryBackend,
    }),
  };
}

function resolveBasisAtlasSweepCapacities({
  basisAtlasPageCapacity,
  modalFieldCount,
}) {
  const capacities = new Set([
    basisAtlasPageCapacity,
    8,
    12,
    16,
    20,
    24,
    modalFieldCount,
  ]);
  return [...capacities]
    .filter((capacity) => Number.isFinite(capacity) && capacity > 0)
    .map((capacity) => Math.floor(capacity))
    .filter((capacity) => capacity <= Math.max(1, modalFieldCount))
    .sort((left, right) => left - right);
}

function buildBasisAtlasCapacitySweep({
  slotAssignments,
  semanticModalEnergy,
  maxRepresentableModeIndex,
  basisAtlasPageCapacity,
  modalGeometryBackend,
}) {
  return resolveBasisAtlasSweepCapacities({
    basisAtlasPageCapacity,
    modalFieldCount: slotAssignments.filter(Boolean).length,
  }).map((capacity) => {
    const representedShellKeys = new Set();
    const representedFamilyKeys = new Set();
    let representedModeCount = 0;
    let representedModalEnergy = 0;
    let basisAtlasCapacityRejectedCount = 0;
    let basisAtlasCapacityRejectedEnergy = 0;
    let spatialBandwidthRejectedCount = 0;
    let spatialBandwidthRejectedEnergy = 0;

    for (
      let slotIndex = 0;
      slotIndex < slotAssignments.length;
      slotIndex += 1
    ) {
      const entry = slotAssignments[slotIndex];
      if (!entry) {
        continue;
      }
      const modalEnergy = getEntryModalEnergy(entry);
      if (getEntryModeOrder(entry) > maxRepresentableModeIndex) {
        spatialBandwidthRejectedCount += 1;
        spatialBandwidthRejectedEnergy += modalEnergy;
        continue;
      }
      if (slotIndex >= capacity) {
        basisAtlasCapacityRejectedCount += 1;
        basisAtlasCapacityRejectedEnergy += modalEnergy;
        continue;
      }

      representedModeCount += 1;
      representedShellKeys.add(getSpatialShellKey(entry, modalGeometryBackend));
      representedFamilyKeys.add(
        getSpatialFamilyKey(entry, modalGeometryBackend),
      );
      representedModalEnergy += modalEnergy;
    }

    const rejectedEnergy = Math.max(
      0,
      semanticModalEnergy - representedModalEnergy,
    );
    return {
      basisAtlasPageCapacity: capacity,
      representedBasisPageModeCount: representedModeCount,
      representedShellCount: representedShellKeys.size,
      representedSpatialFamilyCount: representedFamilyKeys.size,
      representedModalEnergy,
      renderRepresentedEnergyRatio: divideOrFallback(
        representedModalEnergy,
        semanticModalEnergy,
        semanticModalEnergy > 0 ? 0 : 1,
      ),
      basisAtlasCapacityRejectedCount,
      basisAtlasCapacityRejectedEnergyRatio: divideOrFallback(
        basisAtlasCapacityRejectedEnergy,
        semanticModalEnergy,
      ),
      spatialBandwidthRejectedCount,
      spatialBandwidthRejectedEnergyRatio: divideOrFallback(
        spatialBandwidthRejectedEnergy,
        semanticModalEnergy,
      ),
      unrepresentedModalEnergyRatio: divideOrFallback(
        rejectedEnergy,
        semanticModalEnergy,
      ),
    };
  });
}

function buildAdmissionEntries({
  slots,
  phaseSlots,
  colorSlots,
  spectralLaneA,
  spectralLaneB,
  spectralMeta,
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
      modeKey: `${u}:${v}:${w}`,
      u,
      v,
      w,
      coefficient,
      phaseOffsetRad: phaseSlots?.[offset] ?? 0,
      phaseVelocityRadPerSec: phaseSlots?.[offset + 1] ?? 0,
      phaseCoherence: phaseSlots?.[offset + 2] ?? 0,
      phaseAuthority: phaseSlots?.[offset + 3] ?? 0,
      colorR: colorSlots?.[offset] ?? 0,
      colorG: colorSlots?.[offset + 1] ?? 0,
      colorB: colorSlots?.[offset + 2] ?? 0,
      colorWeight: colorSlots?.[offset + 3] ?? 0,
      spectralLaneA: readPackedQuad(spectralLaneA, offset),
      spectralLaneB: readPackedQuad(spectralLaneB, offset),
      spectralMeta: readPackedQuad(spectralMeta, offset),
      naturalFrequencyHz: readFiniteNonNegative(metadataSlots?.[offset]),
      qualityFactor: readFiniteNonNegative(metadataSlots?.[offset + 1]),
      dampingRatio: readFiniteNonNegative(metadataSlots?.[offset + 2]),
      observedSupport: clamp01(metadataSlots?.[offset + 3] ?? 0),
    });
  }

  return entries;
}

function mergeAdmissionEntries(entries) {
  const merged = new Map();

  for (const entry of entries) {
    const existing = merged.get(entry.modeKey);
    const spectralInfluence =
      Math.max(0, entry.colorWeight) * entry.coefficient;
    const spectralPacketInfluence =
      Math.max(0, entry.coefficient) *
      getSpectralLanePacketMass(entry.spectralLaneA, entry.spectralLaneB);
    if (!existing) {
      merged.set(entry.modeKey, {
        ...entry,
        coefficient: entry.coefficient,
        colorWeightNumerator: entry.colorWeight * entry.coefficient,
        spectralColorNumeratorR: entry.colorR * spectralInfluence,
        spectralColorNumeratorG: entry.colorG * spectralInfluence,
        spectralColorNumeratorB: entry.colorB * spectralInfluence,
        spectralColorInfluence: spectralInfluence,
        spectralOwnerInfluence: spectralInfluence,
        spectralOwnerColorR: entry.colorR,
        spectralOwnerColorG: entry.colorG,
        spectralOwnerColorB: entry.colorB,
        spectralPacketInfluence,
        spectralLaneNumeratorA: entry.spectralLaneA.map(
          (value) => value * spectralPacketInfluence,
        ),
        spectralLaneNumeratorB: entry.spectralLaneB.map(
          (value) => value * spectralPacketInfluence,
        ),
        spectralMetaOwnerInfluence: spectralPacketInfluence,
        spectralOwnerMeta: entry.spectralMeta,
        naturalFrequencyNumerator: entry.naturalFrequencyHz * entry.coefficient,
        qualityFactorNumerator: entry.qualityFactor * entry.coefficient,
        dampingRatioNumerator: entry.dampingRatio * entry.coefficient,
      });
      continue;
    }

    existing.coefficient += entry.coefficient;
    if (entry.phaseAuthority >= existing.phaseAuthority) {
      existing.phaseAuthority = entry.phaseAuthority;
      existing.phaseOffsetRad = entry.phaseOffsetRad;
      existing.phaseVelocityRadPerSec = entry.phaseVelocityRadPerSec;
      existing.phaseCoherence = entry.phaseCoherence;
    }
    existing.colorWeightNumerator += entry.colorWeight * entry.coefficient;
    existing.spectralColorNumeratorR += entry.colorR * spectralInfluence;
    existing.spectralColorNumeratorG += entry.colorG * spectralInfluence;
    existing.spectralColorNumeratorB += entry.colorB * spectralInfluence;
    existing.spectralColorInfluence += spectralInfluence;
    existing.spectralPacketInfluence += spectralPacketInfluence;
    for (let laneIndex = 0; laneIndex < 4; laneIndex += 1) {
      existing.spectralLaneNumeratorA[laneIndex] +=
        entry.spectralLaneA[laneIndex] * spectralPacketInfluence;
      existing.spectralLaneNumeratorB[laneIndex] +=
        entry.spectralLaneB[laneIndex] * spectralPacketInfluence;
    }
    if (spectralInfluence > existing.spectralOwnerInfluence) {
      existing.spectralOwnerInfluence = spectralInfluence;
      existing.spectralOwnerColorR = entry.colorR;
      existing.spectralOwnerColorG = entry.colorG;
      existing.spectralOwnerColorB = entry.colorB;
    }
    if (spectralPacketInfluence > existing.spectralMetaOwnerInfluence) {
      existing.spectralMetaOwnerInfluence = spectralPacketInfluence;
      existing.spectralOwnerMeta = entry.spectralMeta;
    }
    existing.naturalFrequencyNumerator +=
      entry.naturalFrequencyHz * entry.coefficient;
    existing.qualityFactorNumerator += entry.qualityFactor * entry.coefficient;
    existing.dampingRatioNumerator += entry.dampingRatio * entry.coefficient;
    existing.observedSupport = Math.max(
      existing.observedSupport,
      entry.observedSupport,
    );
  }

  return Array.from(merged.values()).map((entry) => {
    const coefficientDenom = Math.max(entry.coefficient, 1e-9);
    const colorWeight = entry.colorWeightNumerator / coefficientDenom;
    const spectralColorDenom = Math.max(entry.spectralColorInfluence, 1e-9);
    const spectralPacketDenom = Math.max(entry.spectralPacketInfluence, 1e-9);
    const normalizedLanes =
      entry.spectralPacketInfluence > 0
        ? normalizeSpectralLanePacket(
            entry.spectralLaneNumeratorA.map(
              (value) => value / spectralPacketDenom,
            ),
            entry.spectralLaneNumeratorB.map(
              (value) => value / spectralPacketDenom,
            ),
          )
        : {
            laneA: [0, 0, 0, 0],
            laneB: [0, 0, 0, 0],
          };
    return {
      ...entry,
      colorR: entry.spectralColorNumeratorR / spectralColorDenom,
      colorG: entry.spectralColorNumeratorG / spectralColorDenom,
      colorB: entry.spectralColorNumeratorB / spectralColorDenom,
      colorWeight,
      spectralLaneA: normalizedLanes.laneA,
      spectralLaneB: normalizedLanes.laneB,
      spectralMeta:
        entry.spectralPacketInfluence > 0
          ? entry.spectralOwnerMeta
          : [0, 0, 0, 0],
      naturalFrequencyHz: entry.naturalFrequencyNumerator / coefficientDenom,
      qualityFactor: entry.qualityFactorNumerator / coefficientDenom,
      dampingRatio: entry.dampingRatioNumerator / coefficientDenom,
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
  const colorSlots = new Float32Array(capacity * 4);
  const spectralLaneA = new Float32Array(capacity * 4);
  const spectralLaneB = new Float32Array(capacity * 4);
  const spectralMeta = new Float32Array(capacity * 4);
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

    colorSlots[offset] = entry.colorR;
    colorSlots[offset + 1] = entry.colorG;
    colorSlots[offset + 2] = entry.colorB;
    colorSlots[offset + 3] = entry.colorWeight;

    spectralLaneA[offset] = entry.spectralLaneA?.[0] ?? 0;
    spectralLaneA[offset + 1] = entry.spectralLaneA?.[1] ?? 0;
    spectralLaneA[offset + 2] = entry.spectralLaneA?.[2] ?? 0;
    spectralLaneA[offset + 3] = entry.spectralLaneA?.[3] ?? 0;

    spectralLaneB[offset] = entry.spectralLaneB?.[0] ?? 0;
    spectralLaneB[offset + 1] = entry.spectralLaneB?.[1] ?? 0;
    spectralLaneB[offset + 2] = entry.spectralLaneB?.[2] ?? 0;
    spectralLaneB[offset + 3] = entry.spectralLaneB?.[3] ?? 0;

    spectralMeta[offset] = entry.spectralMeta?.[0] ?? 0;
    spectralMeta[offset + 1] = entry.spectralMeta?.[1] ?? 0;
    spectralMeta[offset + 2] = entry.spectralMeta?.[2] ?? 0;
    spectralMeta[offset + 3] = entry.spectralMeta?.[3] ?? 0;

    metadataSlots[offset] = entry.naturalFrequencyHz;
    metadataSlots[offset + 1] = entry.qualityFactor;
    metadataSlots[offset + 2] = entry.dampingRatio;
    metadataSlots[offset + 3] = entry.observedSupport;
  }

  return {
    modalFieldSlots: slots,
    modalFieldPhaseSlots: phaseSlots,
    modalFieldColorSlots: colorSlots,
    modalFieldSpectralLaneA: spectralLaneA,
    modalFieldSpectralLaneB: spectralLaneB,
    modalFieldSpectralMeta: spectralMeta,
    modalFieldMetadataSlots: metadataSlots,
  };
}

function buildZeroedModalSlotViews(capacity) {
  const length = Math.max(0, Math.floor(capacity ?? 0)) * 4;

  return {
    modalFieldSlots: new Float32Array(length),
    modalFieldPhaseSlots: new Float32Array(length),
    modalFieldColorSlots: new Float32Array(length),
    modalFieldSpectralLaneA: new Float32Array(length),
    modalFieldSpectralLaneB: new Float32Array(length),
    modalFieldSpectralMeta: new Float32Array(length),
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

function buildSpectralLaneDescriptorHash(slotAssignments) {
  let hash = FNV_OFFSET_BASIS;
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
    hash = hashPackedQuad(entry.spectralLaneA, hash);
    hash = hashPackedQuad(entry.spectralLaneB, hash);
    hash = hashPackedQuad(entry.spectralMeta, hash);
  }
  return hash >>> 0;
}

/**
 * @param {{
 *   generation?: number,
 *   maxTotalModes?: number,
 *   modalFieldSlots?: Float32Array | number[],
 *   modalFieldPhaseSlots?: Float32Array | number[],
 *   modalFieldColorSlots?: Float32Array | number[] | null,
 *   modalFieldSpectralLaneA?: Float32Array | number[] | null,
 *   modalFieldSpectralLaneB?: Float32Array | number[] | null,
 *   modalFieldSpectralMeta?: Float32Array | number[] | null,
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
 *   overBandwidthRejectedModeCount?: number,
 *   overBandwidthRejectedModalEnergy?: number,
 *   overBandwidthMaxRequestedModeIndex?: number,
 *   overBandwidthMaxRequestedMode?: [number, number, number],
 *   previousFieldAuthority?: string | null,
 *   basisAtlasPageCapacity?: number,
 *   basisCacheResolution?: number,
 *   cavityGeometry?: import("./cavityGeometry.js").CavityGeometry,
 * }} [options]
 */
export function buildCanonicalFullModalDescriptor({
  generation = 0,
  maxTotalModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldColorSlots = null,
  modalFieldSpectralLaneA = null,
  modalFieldSpectralLaneB = null,
  modalFieldSpectralMeta = null,
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
  overBandwidthRejectedModeCount,
  overBandwidthRejectedModalEnergy,
  overBandwidthMaxRequestedModeIndex,
  overBandwidthMaxRequestedMode,
  previousFieldAuthority,
  basisAtlasPageCapacity = MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  basisCacheResolution = MODAL_BASIS_CACHE_RESOLUTION,
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
    colorSlots: modalFieldColorSlots,
    spectralLaneA: modalFieldSpectralLaneA,
    spectralLaneB: modalFieldSpectralLaneB,
    spectralMeta: modalFieldSpectralMeta,
    metadataSlots: modalFieldMetadataSlots,
    validCount: validModeCount,
  });
  const mergedEntries = mergeAdmissionEntries(admissionEntries);
  let admittedEntries;
  let rejectedEntries;
  if (mergedEntries.length <= totalCapacity) {
    admittedEntries = mergedEntries;
    rejectedEntries = [];
  } else {
    admittedEntries = mergedEntries.slice(0, totalCapacity);
    rejectedEntries = mergedEntries.slice(totalCapacity);
  }
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
  const structuralAdmission = deriveStructuralAdmissionDiagnostics(
    slotAssignments,
    {
      basisAtlasPageCapacity,
      basisCacheResolution,
    },
  );
  const rejectionReasons = {};
  if (overflowModeCount > 0) {
    rejectionReasons.descriptorCapacity = overflowModeCount;
  }
  if (structuralAdmission.basisAtlasCapacityRejectedCount > 0) {
    rejectionReasons.basisAtlasCapacity =
      structuralAdmission.basisAtlasCapacityRejectedCount;
  }
  if (structuralAdmission.spatialBandwidthRejectedCount > 0) {
    rejectionReasons.spatialBandwidth =
      structuralAdmission.spatialBandwidthRejectedCount;
  }
  const overBandwidthDiagnostics = resolveOverBandwidthDiagnostics({
    overBandwidthRejectedModeCount,
    overBandwidthRejectedModalEnergy,
    overBandwidthMaxRequestedModeIndex,
    overBandwidthMaxRequestedMode,
  });
  const {
    overBandwidthRejectedModeCount: resolvedOverBandwidthRejectedModeCount,
    overBandwidthRejectedModalEnergy: resolvedOverBandwidthRejectedModalEnergy,
    overBandwidthMaxRequestedModeIndex:
      resolvedOverBandwidthMaxRequestedModeIndex,
    overBandwidthMaxRequestedMode: resolvedOverBandwidthMaxRequestedMode,
  } = overBandwidthDiagnostics;
  if (resolvedOverBandwidthRejectedModeCount > 0) {
    rejectionReasons.overBandwidth = resolvedOverBandwidthRejectedModeCount;
  }
  const unifiedSlotViews = writeUnifiedModalSlotViewsFromAssignments(
    slotAssignments,
    totalCapacity,
  );
  const spectralLaneHash = buildSpectralLaneDescriptorHash(slotAssignments);
  const resolvedPhaseAuthorityModeCount = Number.isFinite(
    phaseAuthorityModeCount,
  )
    ? Math.max(0, Math.floor(phaseAuthorityModeCount))
    : countPhaseAuthorityModes(modalFieldPhaseSlots, validModeCount);
  const fallbackRawCandidateModalEnergy =
    acceptedEntries.reduce(
      (total, entry) => total + getEntryModalEnergy(entry),
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
  const modalVarietyAudit = buildModalVarietyAudit({
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
    ...overBandwidthDiagnostics,
    previousFieldAuthority,
    modalGeometryBackend,
  });
  const overBandwidthDominant =
    modalVarietyAudit.overBandwidthDominant === true;
  const fieldAuthority = overBandwidthDominant
    ? "bandwidth-limited"
    : descriptorOverflow
      ? "capacity-limited"
      : "complete";
  const renderAuthoritative =
    fieldAuthority === "complete" || fieldAuthority === "capacity-limited";
  const renderSlotViews = renderAuthoritative
    ? unifiedSlotViews
    : buildZeroedModalSlotViews(totalCapacity);
  const renderedEntries = renderAuthoritative ? acceptedEntries : [];
  const renderedValidModeCount = renderAuthoritative ? validModeCount : 0;
  const renderedOccupiedSlotSpan = renderAuthoritative ? occupiedSlotSpan : 0;

  return {
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
        dampingRatio: entry.dampingRatio,
        observedSupport: entry.observedSupport,
        material: {
          colorRgb: [entry.colorR, entry.colorG, entry.colorB],
          colorWeight: entry.colorWeight,
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
        !descriptorOverflow &&
        structuralAdmission.structuralCoverageSatisfied &&
        resolvedOverBandwidthRejectedModeCount === 0,
      rejectedModalEnergy:
        rejectedModalEnergy +
        structuralAdmission.basisAtlasCapacityRejectedEnergy +
        structuralAdmission.spatialBandwidthRejectedEnergy +
        resolvedOverBandwidthRejectedModalEnergy,
      descriptorRejectedModalEnergy: rejectedModalEnergy,
      basisAtlasRejectedModalEnergy:
        structuralAdmission.basisAtlasCapacityRejectedEnergy,
      spatialBandwidthRejectedModalEnergy:
        structuralAdmission.spatialBandwidthRejectedEnergy,
      overBandwidthRejectedModalEnergy:
        resolvedOverBandwidthRejectedModalEnergy,
      overBandwidthRejectedEnergyRatio:
        modalVarietyAudit.overBandwidthRejectedEnergyRatio,
      overBandwidthRejectedRepresentedEnergyRatio:
        modalVarietyAudit.overBandwidthRejectedRepresentedEnergyRatio,
      overBandwidthDominant,
      basisAtlasCapacityRejectedCount:
        structuralAdmission.basisAtlasCapacityRejectedCount,
      spatialBandwidthRejectedCount:
        structuralAdmission.spatialBandwidthRejectedCount,
      overBandwidthRejectedModeCount: resolvedOverBandwidthRejectedModeCount,
      overBandwidthMaxRequestedModeIndex:
        resolvedOverBandwidthMaxRequestedModeIndex,
      overBandwidthMaxRequestedMode: resolvedOverBandwidthMaxRequestedMode,
      basisAtlasPageCapacity: structuralAdmission.basisAtlasPageCapacity,
      maxRepresentableModeIndex: structuralAdmission.maxRepresentableModeIndex,
      spectralLaneHash,
      modalVarietyAudit,
      rejectionReasons,
    },
    slotViews: {
      ...renderSlotViews,
    },
  };
}
