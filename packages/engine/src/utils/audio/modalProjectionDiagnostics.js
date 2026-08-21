import { clamp01, smoothstep } from "../math.js";

const PROJECTION_COMPETITION_SIGMA_SOURCE_COUPLED = 0.1;
const PROJECTION_COMPETITION_SIGMA_RESONANT = 0.035;
const PROJECTION_RESONANT_PROTECTION_CONFIDENCE_START = 0.00045;
const PROJECTION_RESONANT_PROTECTION_CONFIDENCE_FULL = 0.018;

function createEmptyModalProjectionDiagnostics() {
  return {
    projectionRawEnergySourceCoupled: 0,
    projectionRawEnergyResonant: 0,
    projectionOverlapPressureSourceCoupled: 0,
    projectionOverlapPressureResonant: 0,
    projectionLoad: 0,
    projectionResonantProtection: 0,
  };
}

function getProjectionResonantProtection({ layer, modalObserverMetrics }) {
  if (layer !== "resonant") {
    return 0;
  }

  const projectionLoad = clamp01(
    modalObserverMetrics?.resonantProjectionLoad ?? 0,
  );
  const evidence = clamp01(
    Math.max(
      modalObserverMetrics?.resonantSparseEvidence ?? 0,
      modalObserverMetrics?.resonantRingSupport ?? 0,
    ),
  );
  const confidenceSupport = smoothstep(
    PROJECTION_RESONANT_PROTECTION_CONFIDENCE_START,
    PROJECTION_RESONANT_PROTECTION_CONFIDENCE_FULL,
    clamp01(modalObserverMetrics?.resonantObservationConfidence ?? 0),
  );

  return clamp01(projectionLoad * evidence * confidenceSupport);
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
  const unmatchedRight = [right?.u, right?.v, right?.w].map((value) =>
    Number.isFinite(value) ? Math.round(value) : null,
  );
  let sharedCount = 0;

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

function resolveProjectionAmplitude(entry, layer, fallback) {
  const amplitude = entry?.displayAmplitude ?? fallback?.(entry, layer) ?? 0;
  return Number.isFinite(amplitude) ? amplitude : 0;
}

function measureMaximumOverlapPressure(entries, layer) {
  let maximumPressure = 0;
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    let pressure = 0;
    for (let otherIndex = 0; otherIndex < entries.length; otherIndex += 1) {
      if (entryIndex === otherIndex) {
        continue;
      }
      const other = entries[otherIndex];
      pressure +=
        computeProjectionOverlap(entries[entryIndex], other, layer) *
        (other.displayAmplitude ?? 0) ** 2;
    }
    maximumPressure = Math.max(maximumPressure, pressure);
  }
  return maximumPressure;
}

/**
 * Preserves oscillator-owned coefficients while reporting projection load.
 *
 * The response integrator already applies the renderer's single global field
 * scale. Evidence quality, modal overlap, and physical layer labels may guide
 * which identities fit in the bounded topology, but they are diagnostics here
 * and cannot become a second amplitude model.
 */
export function measureModalProjection({
  entries,
  layer,
  modalObserverMetrics,
  resolveDisplayAmplitude: resolveDisplayAmplitudeFallback,
}) {
  const emptyMetrics = createEmptyModalProjectionDiagnostics();
  if (entries.length === 0) {
    return { entries: [], metrics: emptyMetrics };
  }

  const projectedEntries = entries.map((entry) => ({
    ...entry,
    displayAmplitude: resolveProjectionAmplitude(
      entry,
      layer,
      resolveDisplayAmplitudeFallback,
    ),
  }));
  const rawEnergy = projectedEntries.reduce(
    (total, entry) => total + entry.displayAmplitude ** 2,
    0,
  );
  const overlapPressure = measureMaximumOverlapPressure(
    projectedEntries,
    layer,
  );
  const metrics = {
    ...emptyMetrics,
    projectionLoad: clamp01(modalObserverMetrics?.resonantProjectionLoad ?? 0),
    projectionResonantProtection: getProjectionResonantProtection({
      layer,
      modalObserverMetrics,
    }),
  };

  if (layer === "source-coupled") {
    metrics.projectionRawEnergySourceCoupled = rawEnergy;
    metrics.projectionOverlapPressureSourceCoupled = overlapPressure;
  } else {
    metrics.projectionRawEnergyResonant = rawEnergy;
    metrics.projectionOverlapPressureResonant = overlapPressure;
  }

  return { entries: projectedEntries, metrics };
}

export function mergeModalProjectionDiagnostics(...metricSets) {
  const merged = createEmptyModalProjectionDiagnostics();
  for (const metrics of metricSets) {
    if (!metrics) {
      continue;
    }
    merged.projectionRawEnergySourceCoupled +=
      metrics.projectionRawEnergySourceCoupled ?? 0;
    merged.projectionRawEnergyResonant +=
      metrics.projectionRawEnergyResonant ?? 0;
    merged.projectionOverlapPressureSourceCoupled = Math.max(
      merged.projectionOverlapPressureSourceCoupled,
      metrics.projectionOverlapPressureSourceCoupled ?? 0,
    );
    merged.projectionOverlapPressureResonant = Math.max(
      merged.projectionOverlapPressureResonant,
      metrics.projectionOverlapPressureResonant ?? 0,
    );
    merged.projectionLoad = Math.max(
      merged.projectionLoad,
      metrics.projectionLoad ?? 0,
    );
    merged.projectionResonantProtection = Math.max(
      merged.projectionResonantProtection,
      metrics.projectionResonantProtection ?? 0,
    );
  }
  return merged;
}
