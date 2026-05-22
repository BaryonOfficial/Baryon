const PROJECTION_COMPETITION_SIGMA_BACKBONE = 0.1;
const PROJECTION_COMPETITION_SIGMA_DETAIL = 0.035;
const PROJECTION_COMPETITION_LAMBDA_BACKBONE = 0.55;
const PROJECTION_COMPETITION_LAMBDA_DETAIL = 0.85;
const PROJECTION_EVIDENCE_COHERENCE_WEIGHT = 0.42;
const PROJECTION_EVIDENCE_SNR_WEIGHT = 0.24;
const PROJECTION_EVIDENCE_DRIVE_WEIGHT = 0.22;
const PROJECTION_EVIDENCE_PHASE_WEIGHT = 0.12;
const PROJECTION_EVIDENCE_MIN = 0.12;
const PROJECTION_HIGH_Q_PROTECTION_GAIN = 0.35;
const PROJECTION_HIGH_Q_RETAINED_AMPLITUDE_SCALE = 0.08;
const PROJECTION_BACKBONE_INCOHERENT_REDUCTION = 0.16;
const PROJECTION_DETAIL_INCOHERENT_REDUCTION = 0.28;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function createEmptyProjectionNormalizationMetrics() {
  return {
    projectionEnergyBudgetBackbone: 0,
    projectionEnergyBudgetDetail: 0,
    projectionEnergyUsedBackbone: 0,
    projectionEnergyUsedDetail: 0,
    projectionRawEnergyBackbone: 0,
    projectionRawEnergyDetail: 0,
    projectionAllocatedEnergyBackbone: 0,
    projectionAllocatedEnergyDetail: 0,
    projectionEnergyScaleBackbone: 0,
    projectionEnergyScaleDetail: 0,
    projectionOverlapPressureBackbone: 0,
    projectionOverlapPressureDetail: 0,
    projectionCompetitionReduction: 0,
    projectionDenseSpectrumPressure: 0,
    projectionHighQProtection: 0,
    projectionEnergyNormalizationApplied: false,
  };
}

function getProjectionLayerBudget({
  layer,
  denseSpectrumPressure,
  highQProtection,
  modeCoherence,
}) {
  if (layer === "backbone") {
    return Math.max(
      0.46,
      Math.min(
        0.88,
        0.62 - 0.22 * denseSpectrumPressure + 0.14 * modeCoherence,
      ),
    );
  }

  return Math.max(
    0.16,
    Math.min(0.58, 0.34 - 0.32 * denseSpectrumPressure + 0.3 * highQProtection),
  );
}

function getProjectionHighQProtection(
  entry,
  sparseHighQAuthority,
  denseSpectrumPressure,
) {
  void entry;
  void sparseHighQAuthority;
  void denseSpectrumPressure;
  return 0;
}

function computeProjectionProximity(left, right, layer) {
  const leftFrequency = left?.naturalFrequencyHz ?? 0;
  const rightFrequency = right?.naturalFrequencyHz ?? 0;
  if (leftFrequency <= 0 || rightFrequency <= 0) {
    return 0;
  }
  const sigma =
    layer === "backbone"
      ? PROJECTION_COMPETITION_SIGMA_BACKBONE
      : PROJECTION_COMPETITION_SIGMA_DETAIL;
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
  highQProtection,
  resolveDisplayAmplitude,
) {
  const baseAmplitude = clamp01(
    entry?.displayAmplitude ?? resolveDisplayAmplitude?.(entry, layer) ?? 0,
  );
  if (layer !== "detail" || highQProtection <= 0) {
    return baseAmplitude;
  }

  const retainedEnergy = clamp01(
    entry?.retainedEnergy ?? entry?.amplitude ?? 0,
  );
  const retainedAmplitude =
    Math.sqrt(retainedEnergy) *
    PROJECTION_HIGH_Q_RETAINED_AMPLITUDE_SCALE *
    (0.8 + 0.2 * highQProtection);
  return clamp01(Math.max(baseAmplitude, retainedAmplitude));
}

function getProjectionEvidenceQuality(
  entry,
  layer,
  highQProtection,
  getModalObserverProfile,
) {
  const profile = getModalObserverProfile?.(layer) ?? { snrFull: 1 };
  const coherence = clamp01(entry?.coherence ?? 0);
  const observedSnr = Math.max(0, entry?.observedSnr ?? 0);
  const normalizedSnr = clamp01(observedSnr / Math.max(profile.snrFull, 1e-6));
  const snrEvidence = Math.max(normalizedSnr, clamp01(highQProtection));
  const driveEvidence = clamp01(
    Math.max(
      entry?.observedDrive ?? 0,
      entry?.currentDriveEnergy ?? 0,
      entry?.driveEnergy ?? 0,
      entry?.sourceAmplitude ?? 0,
      highQProtection,
    ),
  );
  const phaseAuthority = clamp01(entry?.phaseAuthority ?? 0);
  const evidenceQuality =
    PROJECTION_EVIDENCE_COHERENCE_WEIGHT * coherence +
    PROJECTION_EVIDENCE_SNR_WEIGHT * snrEvidence +
    PROJECTION_EVIDENCE_DRIVE_WEIGHT * driveEvidence +
    PROJECTION_EVIDENCE_PHASE_WEIGHT * phaseAuthority;

  return Math.max(PROJECTION_EVIDENCE_MIN, clamp01(evidenceQuality));
}

export function applyProjectionEnergyNormalization({
  entries,
  layer,
  modalObserverMetrics,
  hardSilentFrame,
  highQDetailTopologySignal = 0,
  resolveDisplayAmplitude,
  getModalObserverProfile,
}) {
  const emptyMetrics = createEmptyProjectionNormalizationMetrics();
  if (hardSilentFrame || entries.length === 0) {
    return { entries: [], metrics: emptyMetrics };
  }

  const denseSpectrumPressure = clamp01(
    modalObserverMetrics?.highQDenseSpectrumPressure ?? 0,
  );
  const ringDerivedHighQProtection =
    clamp01(modalObserverMetrics?.highQRingSupport ?? 0) *
    clamp01(modalObserverMetrics?.highQDetailEnergy ?? 0) *
    (1 - denseSpectrumPressure);
  const sparseHighQAuthority = clamp01(
    Math.max(
      modalObserverMetrics?.highQSparseResonatorAuthority ?? 0,
      highQDetailTopologySignal,
      ringDerivedHighQProtection,
    ),
  );
  const modeCoherence = clamp01(
    Math.max(
      modalObserverMetrics?.lowQObservedCoherence ?? 0,
      modalObserverMetrics?.highQObservedCoherence ?? 0,
    ),
  );
  const entryHighQProtection = entries.map((entry) =>
    getProjectionHighQProtection(
      entry,
      sparseHighQAuthority,
      denseSpectrumPressure,
    ),
  );
  const layerHighQProtection = Math.max(0, ...entryHighQProtection);
  const budget = getProjectionLayerBudget({
    layer,
    denseSpectrumPressure,
    highQProtection: layerHighQProtection,
    modeCoherence,
  });
  const lambda =
    layer === "backbone"
      ? PROJECTION_COMPETITION_LAMBDA_BACKBONE
      : PROJECTION_COMPETITION_LAMBDA_DETAIL;

  const projected = entries.map((entry, entryIndex) => {
    const highQProtection = entryHighQProtection[entryIndex] ?? 0;
    const rawDisplayAmplitude = getProjectionRawDisplayAmplitude(
      entry,
      layer,
      highQProtection,
      resolveDisplayAmplitude,
    );
    const evidenceQuality = getProjectionEvidenceQuality(
      entry,
      layer,
      highQProtection,
      getModalObserverProfile,
    );
    const rawEnergy =
      rawDisplayAmplitude * rawDisplayAmplitude * evidenceQuality;
    const protectedEnergy =
      rawEnergy *
      (1 +
        PROJECTION_HIGH_Q_PROTECTION_GAIN *
          highQProtection *
          (1 - denseSpectrumPressure));
    return {
      entry,
      rawDisplayAmplitude,
      highQProtection,
      evidenceQuality,
      rawEnergy,
      protectedEnergy,
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
        other.protectedEnergy *
        (1 - 0.35 * other.highQProtection) *
        (1 - 0.25 * clamp01(other.entry?.coherence ?? 0));
    }
    const competitionScale = 1 / (1 + lambda * competitorPressure);
    const maxIncoherentReduction =
      layer === "detail"
        ? PROJECTION_DETAIL_INCOHERENT_REDUCTION
        : PROJECTION_BACKBONE_INCOHERENT_REDUCTION;
    const incoherentQuality =
      1 -
      denseSpectrumPressure *
        maxIncoherentReduction *
        (1 - item.evidenceQuality);
    const projectedEnergy =
      item.protectedEnergy * competitionScale * incoherentQuality;
    return {
      ...item,
      competitorPressure,
      competitionScale,
      projectedEnergy,
    };
  });

  const rawEnergyTotal = competed.reduce(
    (total, item) => total + item.rawEnergy,
    0,
  );
  const projectedEnergyTotal = competed.reduce(
    (total, item) => total + item.projectedEnergy,
    0,
  );
  const energyScale =
    projectedEnergyTotal > budget
      ? budget / Math.max(projectedEnergyTotal, 1e-9)
      : 1;
  const conservedEntries = competed.map((item) => ({
    ...item.entry,
    displayAmplitude: Math.sqrt(
      Math.max(0, item.projectedEnergy * energyScale),
    ),
  }));
  const allocatedEnergy = competed.reduce(
    (total, item) => total + item.projectedEnergy * energyScale,
    0,
  );
  const used = Math.min(allocatedEnergy, budget);
  const maxOverlapPressure = competed.reduce(
    (maxPressure, item) => Math.max(maxPressure, item.competitorPressure),
    0,
  );
  const competitionReduction = Math.max(0, rawEnergyTotal - used);
  const normalizationApplied =
    energyScale < 0.999999 ||
    competitionReduction > 1e-6 ||
    maxOverlapPressure > 0;
  const metrics = {
    ...emptyMetrics,
    projectionDenseSpectrumPressure: denseSpectrumPressure,
    projectionHighQProtection: layerHighQProtection,
    projectionCompetitionReduction: competitionReduction,
    projectionEnergyNormalizationApplied: normalizationApplied,
  };
  if (layer === "backbone") {
    metrics.projectionEnergyBudgetBackbone = budget;
    metrics.projectionEnergyUsedBackbone = used;
    metrics.projectionRawEnergyBackbone = rawEnergyTotal;
    metrics.projectionAllocatedEnergyBackbone = used;
    metrics.projectionEnergyScaleBackbone = energyScale;
    metrics.projectionOverlapPressureBackbone = maxOverlapPressure;
  } else {
    metrics.projectionEnergyBudgetDetail = budget;
    metrics.projectionEnergyUsedDetail = used;
    metrics.projectionRawEnergyDetail = rawEnergyTotal;
    metrics.projectionAllocatedEnergyDetail = used;
    metrics.projectionEnergyScaleDetail = energyScale;
    metrics.projectionOverlapPressureDetail = maxOverlapPressure;
  }

  return { entries: conservedEntries, metrics };
}

export function mergeProjectionNormalizationMetrics(...metricSets) {
  const merged = createEmptyProjectionNormalizationMetrics();
  for (const metrics of metricSets) {
    if (!metrics) {
      continue;
    }
    merged.projectionEnergyBudgetBackbone = Math.max(
      merged.projectionEnergyBudgetBackbone,
      metrics.projectionEnergyBudgetBackbone ?? 0,
    );
    merged.projectionEnergyBudgetDetail = Math.max(
      merged.projectionEnergyBudgetDetail,
      metrics.projectionEnergyBudgetDetail ?? 0,
    );
    merged.projectionEnergyUsedBackbone +=
      metrics.projectionEnergyUsedBackbone ?? 0;
    merged.projectionEnergyUsedDetail +=
      metrics.projectionEnergyUsedDetail ?? 0;
    merged.projectionRawEnergyBackbone +=
      metrics.projectionRawEnergyBackbone ?? 0;
    merged.projectionRawEnergyDetail += metrics.projectionRawEnergyDetail ?? 0;
    merged.projectionAllocatedEnergyBackbone +=
      metrics.projectionAllocatedEnergyBackbone ?? 0;
    merged.projectionAllocatedEnergyDetail +=
      metrics.projectionAllocatedEnergyDetail ?? 0;
    if ((metrics.projectionEnergyScaleBackbone ?? 0) > 0) {
      merged.projectionEnergyScaleBackbone =
        merged.projectionEnergyScaleBackbone > 0
          ? Math.min(
              merged.projectionEnergyScaleBackbone,
              metrics.projectionEnergyScaleBackbone,
            )
          : metrics.projectionEnergyScaleBackbone;
    }
    if ((metrics.projectionEnergyScaleDetail ?? 0) > 0) {
      merged.projectionEnergyScaleDetail =
        merged.projectionEnergyScaleDetail > 0
          ? Math.min(
              merged.projectionEnergyScaleDetail,
              metrics.projectionEnergyScaleDetail,
            )
          : metrics.projectionEnergyScaleDetail;
    }
    merged.projectionOverlapPressureBackbone = Math.max(
      merged.projectionOverlapPressureBackbone,
      metrics.projectionOverlapPressureBackbone ?? 0,
    );
    merged.projectionOverlapPressureDetail = Math.max(
      merged.projectionOverlapPressureDetail,
      metrics.projectionOverlapPressureDetail ?? 0,
    );
    merged.projectionCompetitionReduction +=
      metrics.projectionCompetitionReduction ?? 0;
    merged.projectionDenseSpectrumPressure = Math.max(
      merged.projectionDenseSpectrumPressure,
      metrics.projectionDenseSpectrumPressure ?? 0,
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
