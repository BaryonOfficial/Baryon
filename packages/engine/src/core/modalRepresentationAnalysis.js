import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "./modalBudgets.js";
import { clamp01 } from "../utils/math.js";

/**
 * Analyze how canonical modal coefficients map into the renderer's finite
 * basis representation. Energy values are squared coefficients; the caller
 * remains the sole owner of the final categorical field authority.
 */

export function analyzeStructuralAdmission(
  slotAssignments,
  {
    directOpticalModeCapacity = MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
  } = {},
) {
  const normalizedDirectOpticalCapacity = Math.max(
    0,
    Math.floor(directOpticalModeCapacity),
  );
  let directOpticalCapacityRejectedCount = 0;
  let directOpticalCapacityRejectedEnergy = 0;

  for (let slotIndex = 0; slotIndex < slotAssignments.length; slotIndex += 1) {
    const entry = slotAssignments[slotIndex];
    if (!entry) {
      continue;
    }

    const modalEnergy = Math.max(0, entry.coefficient) ** 2;
    if (slotIndex >= normalizedDirectOpticalCapacity) {
      directOpticalCapacityRejectedCount += 1;
      directOpticalCapacityRejectedEnergy += modalEnergy;
    }
  }

  return {
    directOpticalModeCapacity: normalizedDirectOpticalCapacity,
    directOpticalCapacityRejectedCount,
    directOpticalCapacityRejectedEnergy,
    structuralCoverageSatisfied: directOpticalCapacityRejectedCount === 0,
  };
}

export function measureModalEntryEnergy(entry) {
  return Math.max(0, entry?.coefficient ?? 0) ** 2;
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


export function resolveCandidateConfidenceDiagnostics({
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

export function analyzeModalRepresentation({
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

    if (slotIndex < structuralAdmission.directOpticalModeCapacity) {
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
  const semanticModalEnergy =
    acceptedModalEnergy + descriptorRejectedModalEnergy;
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

  return {
    modalTopologyGeometry: modalGeometryBackend.cavityGeometry,
    semanticModeCount: acceptedEntries.length,
    directOpticalRepresentedModeCount: representedEntries.length,
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
    directOpticalModeCapacity: structuralAdmission.directOpticalModeCapacity,
    directOpticalCapacityPressure: divideOrFallback(
      representedEntries.length,
      structuralAdmission.directOpticalModeCapacity,
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
    directOpticalCapacityRejectedCount:
      structuralAdmission.directOpticalCapacityRejectedCount,
    directOpticalCapacityRejectedEnergyRatio: divideOrFallback(
      structuralAdmission.directOpticalCapacityRejectedEnergy,
      semanticModalEnergy,
    ),
    directOpticalCapacitySweep: buildDirectOpticalCapacitySweep({
      slotAssignments,
      semanticModalEnergy,
      directOpticalModeCapacity: structuralAdmission.directOpticalModeCapacity,
      modalGeometryBackend,
    }),
  };
}

function resolveDirectOpticalSweepCapacities({
  directOpticalModeCapacity,
  modalFieldCount,
}) {
  const capacities = new Set([
    directOpticalModeCapacity,
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

function buildDirectOpticalCapacitySweep({
  slotAssignments,
  semanticModalEnergy,
  directOpticalModeCapacity,
  modalGeometryBackend,
}) {
  return resolveDirectOpticalSweepCapacities({
    directOpticalModeCapacity,
    modalFieldCount: slotAssignments.filter(Boolean).length,
  }).map((capacity) => {
    const representedShellKeys = new Set();
    const representedFamilyKeys = new Set();
    let representedModeCount = 0;
    let representedModalEnergy = 0;
    let directOpticalCapacityRejectedCount = 0;
    let directOpticalCapacityRejectedEnergy = 0;

    for (
      let slotIndex = 0;
      slotIndex < slotAssignments.length;
      slotIndex += 1
    ) {
      const entry = slotAssignments[slotIndex];
      if (!entry) {
        continue;
      }
      const modalEnergy = measureModalEntryEnergy(entry);
      if (slotIndex >= capacity) {
        directOpticalCapacityRejectedCount += 1;
        directOpticalCapacityRejectedEnergy += modalEnergy;
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
      directOpticalModeCapacity: capacity,
      directOpticalRepresentedModeCount: representedModeCount,
      representedShellCount: representedShellKeys.size,
      representedSpatialFamilyCount: representedFamilyKeys.size,
      representedModalEnergy,
      renderRepresentedEnergyRatio: divideOrFallback(
        representedModalEnergy,
        semanticModalEnergy,
        semanticModalEnergy > 0 ? 0 : 1,
      ),
      directOpticalCapacityRejectedCount,
      directOpticalCapacityRejectedEnergyRatio: divideOrFallback(
        directOpticalCapacityRejectedEnergy,
        semanticModalEnergy,
      ),
      unrepresentedModalEnergyRatio: divideOrFallback(
        rejectedEnergy,
        semanticModalEnergy,
      ),
    };
  });
}
