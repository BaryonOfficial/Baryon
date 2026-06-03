const PROJECTION_COMPETITION_SIGMA_SOURCE_COUPLED = 0.1;
const PROJECTION_COMPETITION_SIGMA_RESONANT = 0.035;
const PROJECTION_COMPETITION_LAMBDA_SOURCE_COUPLED = 0.55;
const PROJECTION_COMPETITION_LAMBDA_RESONANT = 0.85;
const PROJECTION_EVIDENCE_COHERENCE_WEIGHT = 0.42;
const PROJECTION_EVIDENCE_SNR_WEIGHT = 0.24;
const PROJECTION_EVIDENCE_DRIVE_WEIGHT = 0.22;
const PROJECTION_EVIDENCE_PHASE_WEIGHT = 0.12;
const PROJECTION_EVIDENCE_MIN = 0.12;
const PROJECTION_RESONANT_LAYER_BUDGET = 0.34;
const PROJECTION_HIGH_Q_PROTECTION_ENERGY_START = 0.00045;
const PROJECTION_HIGH_Q_PROTECTION_ENERGY_FULL = 0.018;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function createEmptyProjectionNormalizationMetrics() {
  return {
    projectionEnergyBudgetSourceCoupled: 0,
    projectionEnergyBudgetResonant: 0,
    projectionEnergyUsedSourceCoupled: 0,
    projectionEnergyUsedResonant: 0,
    projectionRawEnergySourceCoupled: 0,
    projectionRawEnergyResonant: 0,
    projectionAllocatedEnergySourceCoupled: 0,
    projectionAllocatedEnergyResonant: 0,
    projectionEnergyScaleSourceCoupled: 0,
    projectionEnergyScaleResonant: 0,
    projectionOverlapPressureSourceCoupled: 0,
    projectionOverlapPressureResonant: 0,
    projectionCompetitionReduction: 0,
    projectionLoad: 0,
    projectionHighQProtection: 0,
    projectionEnergyNormalizationApplied: false,
  };
}

function getProjectionLayerBudget({ layer, modeCoherence }) {
  if (layer === "source-coupled") {
    return Math.max(0.46, Math.min(0.88, 0.62 + 0.14 * modeCoherence));
  }

  return PROJECTION_RESONANT_LAYER_BUDGET;
}

function getProjectionHighQProtection({ layer, modalObserverMetrics }) {
  if (layer !== "resonant") {
    return 0;
  }

  const projectionLoad = clamp01(
    modalObserverMetrics?.highQProjectionLoad ?? 0,
  );
  const highQProtectionEvidence = clamp01(
    Math.max(
      modalObserverMetrics?.highQSparseResonatorEvidence ?? 0,
      modalObserverMetrics?.highQRingSupport ?? 0,
    ),
  );
  const highQEnergy = clamp01(modalObserverMetrics?.highQResonantEnergy ?? 0);
  const energySupport = smoothstep(
    PROJECTION_HIGH_Q_PROTECTION_ENERGY_START,
    PROJECTION_HIGH_Q_PROTECTION_ENERGY_FULL,
    highQEnergy,
  );

  return clamp01(projectionLoad * highQProtectionEvidence * energySupport);
}

function computeProjectionProximity(left, right, layer) {
  const leftFrequency = left?.naturalFrequencyHz ?? 0;
  const rightFrequency = right?.naturalFrequencyHz ?? 0;
  if (leftFrequency <= 0 || rightFrequency <= 0) {
    return 0;
  }
  const sigma =
    layer === "source-coupled"
      ? PROJECTION_COMPETITION_SIGMA_SOURCE_COUPLED
      : PROJECTION_COMPETITION_SIGMA_RESONANT;
  const distance = Math.log(leftFrequency / rightFrequency) / sigma;
  return Math.exp(-(distance * distance));
}

function computeProjectionBasisOverlap(left, right) {
  const leftIndices = [left?.u, left?.v, left?.w].map((value) =>
    Number.isFinite(value) ? Math.round(value) : null,
  );
  const rightIndices = [right?.u, right?.v, right?.w].map((value) =>
    Number.isFinite(value) ? Math.round(value) : null,
  );
  let sharedCount = 0;
  const unmatchedRight = [...rightIndices];

  for (const leftIndex of leftIndices) {
    if (leftIndex === null) {
      continue;
    }
    const matchIndex = unmatchedRight.indexOf(leftIndex);
    if (matchIndex < 0) {
      continue;
    }
    sharedCount += 1;
    unmatchedRight.splice(matchIndex, 1);
  }

  return sharedCount / 3;
}

function computeProjectionOverlap(left, right, layer) {
  return Math.max(
    computeProjectionProximity(left, right, layer),
    computeProjectionBasisOverlap(left, right),
  );
}

function getProjectionRawDisplayAmplitude(
  entry,
  layer,
  resolveDisplayAmplitude,
) {
  return clamp01(
    entry?.displayAmplitude ?? resolveDisplayAmplitude?.(entry, layer) ?? 0,
  );
}

function getProjectionEvidenceQuality(entry, getLayerObserverProfile) {
  const profile = getLayerObserverProfile() ?? { snrFull: 1 };
  const coherence = clamp01(entry?.coherence ?? 0);
  const observedSnr = Math.max(0, entry?.observedSnr ?? 0);
  const normalizedSnr = clamp01(observedSnr / Math.max(profile.snrFull, 1e-6));
  const driveEvidence = clamp01(
    Math.max(
      entry?.observedDrive ?? 0,
      entry?.currentDriveEnergy ?? 0,
      entry?.driveEnergy ?? 0,
      entry?.sourceAmplitude ?? 0,
    ),
  );
  const phaseAuthority = clamp01(entry?.phaseAuthority ?? 0);
  const evidenceQuality =
    PROJECTION_EVIDENCE_COHERENCE_WEIGHT * coherence +
    PROJECTION_EVIDENCE_SNR_WEIGHT * normalizedSnr +
    PROJECTION_EVIDENCE_DRIVE_WEIGHT * driveEvidence +
    PROJECTION_EVIDENCE_PHASE_WEIGHT * phaseAuthority;

  return Math.max(PROJECTION_EVIDENCE_MIN, clamp01(evidenceQuality));
}

export function applyProjectionEnergyNormalization({
  entries,
  layer,
  modalObserverMetrics,
  hardSilentFrame,
  resolveDisplayAmplitude,
  getModalObserverProfile,
}) {
  const emptyMetrics = createEmptyProjectionNormalizationMetrics();
  if (hardSilentFrame || entries.length === 0) {
    return { entries: [], metrics: emptyMetrics };
  }

  const projectionLoad = clamp01(
    modalObserverMetrics?.highQProjectionLoad ?? 0,
  );
  const modeCoherence = clamp01(
    Math.max(
      modalObserverMetrics?.lowQObservedCoherence ?? 0,
      modalObserverMetrics?.highQObservedCoherence ?? 0,
    ),
  );
  const budget = getProjectionLayerBudget({
    layer,
    modeCoherence,
  });
  const highQProtection = getProjectionHighQProtection({
    layer,
    modalObserverMetrics,
  });
  const structuralBudget = budget;
  const lambda =
    layer === "source-coupled"
      ? PROJECTION_COMPETITION_LAMBDA_SOURCE_COUPLED
      : PROJECTION_COMPETITION_LAMBDA_RESONANT;
  const getLayerObserverProfile = () =>
    getModalObserverProfile?.(layer) ?? { snrFull: 1 };

  const projected = entries.map((entry) => {
    const rawDisplayAmplitude = getProjectionRawDisplayAmplitude(
      entry,
      layer,
      resolveDisplayAmplitude,
    );
    const evidenceQuality = getProjectionEvidenceQuality(
      entry,
      getLayerObserverProfile,
    );
    const rawProjectedRenderEnergy =
      rawDisplayAmplitude * rawDisplayAmplitude * evidenceQuality;
    return {
      entry,
      rawDisplayAmplitude,
      evidenceQuality,
      rawProjectedRenderEnergy,
    };
  });

  const competed = projected.map((item, entryIndex) => {
    let competitorPressure = 0;
    for (let otherIndex = 0; otherIndex < projected.length; otherIndex += 1) {
      if (otherIndex === entryIndex) {
        continue;
      }
      const other = projected[otherIndex];
      const proximity = computeProjectionOverlap(
        item.entry,
        other.entry,
        layer,
      );
      competitorPressure +=
        proximity *
        other.rawProjectedRenderEnergy *
        (1 - 0.25 * clamp01(other.entry?.coherence ?? 0));
    }
    const competitionScale = 1 / (1 + lambda * competitorPressure);
    const competitionAdjustedProjectedRenderEnergy =
      item.rawProjectedRenderEnergy * competitionScale;
    return {
      ...item,
      competitorPressure,
      competitionScale,
      competitionAdjustedProjectedRenderEnergy,
    };
  });

  const rawProjectedRenderEnergyTotal = competed.reduce(
    (total, item) => total + item.rawProjectedRenderEnergy,
    0,
  );
  const competitionAdjustedProjectedRenderEnergyTotal = competed.reduce(
    (total, item) => total + item.competitionAdjustedProjectedRenderEnergy,
    0,
  );
  const energyScale =
    competitionAdjustedProjectedRenderEnergyTotal > structuralBudget
      ? structuralBudget /
        Math.max(competitionAdjustedProjectedRenderEnergyTotal, 1e-9)
      : 1;
  const conservedEntries = competed.map((item) => ({
    ...item.entry,
    displayAmplitude: Math.sqrt(
      Math.max(0, item.competitionAdjustedProjectedRenderEnergy * energyScale),
    ),
  }));
  const allocatedEnergy = competed.reduce(
    (total, item) =>
      total + item.competitionAdjustedProjectedRenderEnergy * energyScale,
    0,
  );
  const used = Math.min(allocatedEnergy, structuralBudget);
  const maxOverlapPressure = competed.reduce(
    (maxPressure, item) => Math.max(maxPressure, item.competitorPressure),
    0,
  );
  const competitionReduction = Math.max(
    0,
    rawProjectedRenderEnergyTotal - used,
  );
  const normalizationApplied =
    energyScale < 0.999999 ||
    competitionReduction > 1e-6 ||
    maxOverlapPressure > 0;
  const metrics = {
    ...emptyMetrics,
    projectionLoad,
    projectionHighQProtection: highQProtection,
    projectionCompetitionReduction: competitionReduction,
    projectionEnergyNormalizationApplied: normalizationApplied,
  };
  if (layer === "source-coupled") {
    metrics.projectionEnergyBudgetSourceCoupled = budget;
    metrics.projectionEnergyUsedSourceCoupled = used;
    metrics.projectionRawEnergySourceCoupled = rawProjectedRenderEnergyTotal;
    metrics.projectionAllocatedEnergySourceCoupled = used;
    metrics.projectionEnergyScaleSourceCoupled = energyScale;
    metrics.projectionOverlapPressureSourceCoupled = maxOverlapPressure;
  } else {
    metrics.projectionEnergyBudgetResonant = structuralBudget;
    metrics.projectionEnergyUsedResonant = used;
    metrics.projectionRawEnergyResonant = rawProjectedRenderEnergyTotal;
    metrics.projectionAllocatedEnergyResonant = used;
    metrics.projectionEnergyScaleResonant = energyScale;
    metrics.projectionOverlapPressureResonant = maxOverlapPressure;
  }

  return { entries: conservedEntries, metrics };
}

export function mergeProjectionNormalizationMetrics(...metricSets) {
  const merged = createEmptyProjectionNormalizationMetrics();
  for (const metrics of metricSets) {
    if (!metrics) {
      continue;
    }
    merged.projectionEnergyBudgetSourceCoupled = Math.max(
      merged.projectionEnergyBudgetSourceCoupled,
      metrics.projectionEnergyBudgetSourceCoupled ?? 0,
    );
    merged.projectionEnergyBudgetResonant = Math.max(
      merged.projectionEnergyBudgetResonant,
      metrics.projectionEnergyBudgetResonant ?? 0,
    );
    merged.projectionEnergyUsedSourceCoupled +=
      metrics.projectionEnergyUsedSourceCoupled ?? 0;
    merged.projectionEnergyUsedResonant +=
      metrics.projectionEnergyUsedResonant ?? 0;
    merged.projectionRawEnergySourceCoupled +=
      metrics.projectionRawEnergySourceCoupled ?? 0;
    merged.projectionRawEnergyResonant +=
      metrics.projectionRawEnergyResonant ?? 0;
    merged.projectionAllocatedEnergySourceCoupled +=
      metrics.projectionAllocatedEnergySourceCoupled ?? 0;
    merged.projectionAllocatedEnergyResonant +=
      metrics.projectionAllocatedEnergyResonant ?? 0;
    if ((metrics.projectionEnergyScaleSourceCoupled ?? 0) > 0) {
      merged.projectionEnergyScaleSourceCoupled =
        merged.projectionEnergyScaleSourceCoupled > 0
          ? Math.min(
              merged.projectionEnergyScaleSourceCoupled,
              metrics.projectionEnergyScaleSourceCoupled,
            )
          : metrics.projectionEnergyScaleSourceCoupled;
    }
    if ((metrics.projectionEnergyScaleResonant ?? 0) > 0) {
      merged.projectionEnergyScaleResonant =
        merged.projectionEnergyScaleResonant > 0
          ? Math.min(
              merged.projectionEnergyScaleResonant,
              metrics.projectionEnergyScaleResonant,
            )
          : metrics.projectionEnergyScaleResonant;
    }
    merged.projectionOverlapPressureSourceCoupled = Math.max(
      merged.projectionOverlapPressureSourceCoupled,
      metrics.projectionOverlapPressureSourceCoupled ?? 0,
    );
    merged.projectionOverlapPressureResonant = Math.max(
      merged.projectionOverlapPressureResonant,
      metrics.projectionOverlapPressureResonant ?? 0,
    );
    merged.projectionCompetitionReduction +=
      metrics.projectionCompetitionReduction ?? 0;
    merged.projectionLoad = Math.max(
      merged.projectionLoad,
      metrics.projectionLoad ?? 0,
    );
    merged.projectionHighQProtection = Math.max(
      merged.projectionHighQProtection,
      metrics.projectionHighQProtection ?? 0,
    );
    merged.projectionEnergyNormalizationApplied =
      merged.projectionEnergyNormalizationApplied ||
      metrics.projectionEnergyNormalizationApplied === true;
  }
  return merged;
}
