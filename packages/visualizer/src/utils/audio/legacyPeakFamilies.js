import { SPECTRAL_MODAL_POLICY } from "./policy.js";

const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;

const BACKBONE_PEAK_COUNT = 5;
const DETAIL_PEAK_COUNT = 8;
const BACKBONE_PEAK_MAX_HZ = 3200;
const BACKBONE_SALIENCE_WEIGHT = 1.2;
const BACKBONE_FAMILY_DECAY = 0.82;
const DETAIL_FAMILY_DECAY = 0.72;
const TONAL_RESERVE_COUNT = 2;
const TONAL_RESERVE_MIN_HZ = 1800;
const TONAL_RESERVE_MIN_SALIENCE = 0.08;
const LOW_BAND_BACKBONE_MIN_HZ = 55;
const LOW_BAND_BACKBONE_MAX_HZ = 260;
const LOW_BAND_BACKBONE_RESERVED_COUNT = 2;
const LOW_BAND_BACKBONE_MIN_SALIENCE = 0.14;
const FAMILY_ACTIVITY_EPSILON = 1e-4;
const HARMONIC_SPLIT_CONFIRM_FRAMES = 2;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getPeakSelectionDistanceHz(kind, frequency) {
  const baseDistance = kind === "detail" ? 55 : 70;
  const proportionalDistance =
    kind === "detail" ? frequency * 0.08 : frequency * 0.12;
  return Math.max(baseDistance, proportionalDistance);
}

function getLowBandBackboneReserveDistanceHz(frequency) {
  return Math.max(24, frequency * 0.045);
}

function isWithinLowBandBackboneReserveBand(frequency) {
  return (
    frequency >= LOW_BAND_BACKBONE_MIN_HZ &&
    frequency <= LOW_BAND_BACKBONE_MAX_HZ
  );
}

function isPeakHarmonicallyRelated(frequency, fundamental) {
  if (!(frequency > 0) || !(fundamental > 0)) {
    return false;
  }

  const ratio = frequency / fundamental;
  const nearest = Math.max(1, Math.round(ratio));
  return Math.abs(ratio - nearest) <= 0.14;
}

function averageArray(values) {
  if (!values?.length) return 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index] ?? 0;
  }
  return total / values.length;
}

function createFamilyMap() {
  return new Map();
}

export function createLegacyPeakFamilyState() {
  return {
    heavyFrameId: 0,
    nextFamilyId: 1,
    backboneFamilies: createFamilyMap(),
    detailFamilies: createFamilyMap(),
    pendingIndependentCandidates: new Map(),
  };
}

function createFamily({
  id,
  layer,
  frequency,
  amplitude,
  harmonicSupport,
  heavyFrameIndex,
}) {
  return {
    id,
    layer,
    centerHz: frequency,
    amplitude,
    harmonicSupport,
    ageFrames: 0,
    lastConfirmedHeavyFrame: heavyFrameIndex,
    disagreementCount: 0,
    confirmedFrames: 1,
  };
}

function scoreCandidatePeak(peak, analysisHints, kind) {
  const hints = analysisHints?.active ? analysisHints : null;
  const baseAmplitude = peak?.amplitude ?? 0;
  if (!(baseAmplitude > 0)) {
    return 0;
  }

  const changeBias =
    kind === "detail"
      ? 1 +
        (hints?.transientSalience ?? 0) * 0.55 +
        (hints?.novelty ?? 0) * 0.7 +
        (hints?.textureSpread ?? 0) * 0.35
      : 1 + (hints?.novelty ?? 0) * 0.18;

  if (kind === "detail") {
    const detailHarmonicBias =
      1 +
      (hints?.harmonicity ?? 0) * 0.22 +
      (hints?.pitchConfidence ?? 0) * 0.12 +
      (hints?.voicingProbability ?? 0) * 0.18;
    const detailTrebleLift =
      1 + clamp01(((peak.frequency ?? 0) - 1800) / 3200) * 0.22;
    const detailSalienceBias = 1 + (peak.salienceScore ?? 0) * 0.25;
    return (
      baseAmplitude *
      detailHarmonicBias *
      changeBias *
      detailTrebleLift *
      detailSalienceBias
    );
  }

  const normalizedFrequency = clamp01((peak.frequency ?? 0) / 5000);
  const bassBias =
    1 + (hints?.bassSalience ?? 0) * (1 - normalizedFrequency) * 0.55;
  const backboneHarmonicBias =
    1 +
    (hints?.harmonicity ?? 0) * 0.65 +
    (hints?.pitchConfidence ?? 0) * 0.4 +
    (hints?.voicingProbability ?? 0) * 0.3;
  const backboneSalienceBias =
    1 + (peak.salienceScore ?? 0) * BACKBONE_SALIENCE_WEIGHT;
  const lowBandBackboneBias =
    isWithinLowBandBackboneReserveBand(peak.frequency ?? 0) &&
    (peak.salienceScore ?? 0) >= LOW_BAND_BACKBONE_MIN_SALIENCE
      ? 1 + (hints?.bassSalience ?? 0) * 0.24
      : 1;

  return (
    baseAmplitude *
    bassBias *
    backboneHarmonicBias *
    changeBias *
    backboneSalienceBias *
    lowBandBackboneBias
  );
}

function buildPreparedCandidatePool(candidates, analysisHints) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      backboneBaseScore: scoreCandidatePeak(
        candidate,
        analysisHints,
        "backbone",
      ),
      detailBaseScore: scoreCandidatePeak(candidate, analysisHints, "detail"),
    }))
    .filter(
      (candidate) =>
        candidate.backboneBaseScore > 0 || candidate.detailBaseScore > 0,
    );
}

function selectPreparedPeaks(preparedCandidates, limit, analysisHints, kind) {
  if (!Array.isArray(preparedCandidates) || limit <= 0) {
    return [];
  }

  const hints = analysisHints?.active ? analysisHints : null;
  const selected = [];
  const scoreKey =
    kind === "backbone" ? "backboneBaseScore" : "detailBaseScore";
  const remaining = preparedCandidates
    .filter((candidate) => (candidate?.[scoreKey] ?? 0) > 0)
    .map((candidate) => ({
      ...candidate,
      baseScore: candidate[scoreKey] ?? 0,
    }));

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const minDistanceHz =
        selected.length > 0
          ? Math.min(
              ...selected.map((entry) =>
                Math.abs((entry.frequency ?? 0) - (candidate.frequency ?? 0)),
              ),
            )
          : Number.POSITIVE_INFINITY;
      const diversityBoost =
        selected.length === 0
          ? 1
          : 1 +
            clamp01(minDistanceHz / Math.max(1, candidate.frequency ?? 1)) *
              0.45 +
            (hints?.textureSpread ?? 0) *
              clamp01(minDistanceHz / Math.max(1, candidate.frequency ?? 1));
      const candidateScore = candidate.baseScore * diversityBoost;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) {
      break;
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    const minDistance = getPeakSelectionDistanceHz(kind, chosen.frequency ?? 0);
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (
        Math.abs((remaining[index].frequency ?? 0) - (chosen.frequency ?? 0)) <
        minDistance
      ) {
        remaining.splice(index, 1);
      }
    }
  }

  return selected;
}

function selectReservedLowBandBackbonePeaks(preparedCandidates, analysisHints) {
  if (!Array.isArray(preparedCandidates) || preparedCandidates.length === 0) {
    return [];
  }

  const hints = analysisHints?.active ? analysisHints : null;
  const selected = [];
  const remaining = preparedCandidates
    .filter(
      (candidate) =>
        (candidate?.backboneBaseScore ?? 0) > 0 &&
        isWithinLowBandBackboneReserveBand(candidate.frequency ?? 0) &&
        (candidate.salienceScore ?? 0) >= LOW_BAND_BACKBONE_MIN_SALIENCE,
    )
    .map((candidate) => ({
      ...candidate,
      baseScore: candidate.backboneBaseScore ?? 0,
    }));

  while (
    selected.length < LOW_BAND_BACKBONE_RESERVED_COUNT &&
    remaining.length > 0
  ) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const candidateFrequency = candidate.frequency ?? 0;
      const duplicatesLowerReserved = selected.some(
        (reservedPeak) =>
          (reservedPeak.frequency ?? 0) < candidateFrequency &&
          isPeakHarmonicallyRelated(
            candidateFrequency,
            reservedPeak.frequency ?? 0,
          ),
      );
      if (duplicatesLowerReserved) {
        continue;
      }

      const minDistanceHz =
        selected.length > 0
          ? Math.min(
              ...selected.map((entry) =>
                Math.abs((entry.frequency ?? 0) - candidateFrequency),
              ),
            )
          : Number.POSITIVE_INFINITY;
      const diversityBoost =
        selected.length === 0
          ? 1
          : 1 +
            clamp01(minDistanceHz / Math.max(1, candidateFrequency)) * 0.45 +
            (hints?.textureSpread ?? 0) *
              clamp01(minDistanceHz / Math.max(1, candidateFrequency));
      const candidateScore = candidate.baseScore * diversityBoost;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) {
      break;
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    const minDistance = getLowBandBackboneReserveDistanceHz(
      chosen.frequency ?? 0,
    );
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (
        Math.abs((remaining[index].frequency ?? 0) - (chosen.frequency ?? 0)) <
        minDistance
      ) {
        remaining.splice(index, 1);
      }
    }
  }

  return selected;
}

function deriveRawSelectedCandidatePeaks(candidatePool, analysisHints) {
  const preparedCandidatePool = buildPreparedCandidatePool(
    candidatePool,
    analysisHints,
  );
  const reserveEligibleCandidates = preparedCandidatePool.filter(
    (candidate) =>
      (candidate.frequency ?? 0) >= TONAL_RESERVE_MIN_HZ &&
      (candidate.salienceScore ?? 0) >= TONAL_RESERVE_MIN_SALIENCE,
  );
  const reservedDetailPeaks = selectPreparedPeaks(
    reserveEligibleCandidates,
    TONAL_RESERVE_COUNT,
    analysisHints,
    "detail",
  );
  const reserveOverlappingCandidates = new Set(
    preparedCandidatePool.filter((candidate) =>
      reservedDetailPeaks.some(
        (reservedPeak) =>
          Math.abs((candidate.frequency ?? 0) - (reservedPeak.frequency ?? 0)) <
          getPeakSelectionDistanceHz("detail", reservedPeak.frequency ?? 0),
      ),
    ),
  );
  const remainingDetailPool = preparedCandidatePool.filter(
    (candidate) => !reserveOverlappingCandidates.has(candidate),
  );
  const detailPeaks = [
    ...reservedDetailPeaks,
    ...selectPreparedPeaks(
      remainingDetailPool,
      DETAIL_PEAK_COUNT - reservedDetailPeaks.length,
      analysisHints,
      "detail",
    ),
  ];
  const backboneCandidates = preparedCandidatePool.filter(
    (candidate) => (candidate.frequency ?? 0) <= BACKBONE_PEAK_MAX_HZ,
  );
  const reservedBackbonePeaks = selectReservedLowBandBackbonePeaks(
    backboneCandidates,
    analysisHints,
  );
  const remainingBackbonePool = backboneCandidates.filter(
    (candidate) =>
      !reservedBackbonePeaks.some(
        (reservedPeak) =>
          Math.abs((candidate.frequency ?? 0) - (reservedPeak.frequency ?? 0)) <
          getPeakSelectionDistanceHz("backbone", reservedPeak.frequency ?? 0),
      ),
  );
  const backbonePeaks = [
    ...reservedBackbonePeaks,
    ...selectPreparedPeaks(
      remainingBackbonePool,
      BACKBONE_PEAK_COUNT - reservedBackbonePeaks.length,
      analysisHints,
      "backbone",
    ),
  ];

  return {
    preparedCandidatePool,
    detailPeaks,
    backbonePeaks,
    dominantPeak: backbonePeaks[0] ?? null,
  };
}

function familyBucketKey(layer, frequency) {
  return `${layer}:${Math.round(frequency * 10) / 10}`;
}

function computeCandidateHarmonicSupport(candidate, sortedCandidates) {
  const frequency = candidate.frequency ?? 0;
  if (!(frequency > 0)) {
    return 0;
  }

  const support = sortedCandidates.reduce((maxSupport, other) => {
    if (other === candidate) {
      return maxSupport;
    }
    const otherFrequency = other.frequency ?? 0;
    if (!isPeakHarmonicallyRelated(otherFrequency, frequency)) {
      return maxSupport;
    }
    return Math.max(maxSupport, other.amplitude ?? 0);
  }, 0);

  return clamp01(
    (candidate.salienceScore ?? candidate.amplitude ?? 0) * 0.6 + support * 0.4,
  );
}

function decayFamily(family, heavyFrameDelta) {
  const decayFactor =
    family.layer === "detail" ? DETAIL_FAMILY_DECAY : BACKBONE_FAMILY_DECAY;
  const amplitude = family.amplitude * decayFactor ** heavyFrameDelta;
  return {
    ...family,
    amplitude,
    ageFrames: family.ageFrames + heavyFrameDelta,
    disagreementCount: family.disagreementCount + heavyFrameDelta,
  };
}

function buildFamilyConfidence(family) {
  const disagreementPenalty = clamp01(1 - family.disagreementCount / 4);
  const recency = clamp01(1 - family.ageFrames / 4);
  return clamp01(
    (0.45 + family.harmonicSupport * 0.55) *
      disagreementPenalty *
      (0.6 + recency * 0.4),
  );
}

function buildFamilyPersistence(family) {
  return clamp01(
    clamp01(family.confirmedFrames / 4) * clamp01(1 - family.ageFrames / 3),
  );
}

function matchExistingFamily(families, candidate, layer) {
  const candidateFrequency = candidate.frequency ?? 0;
  let directMatch = null;
  let lowerHarmonicMatch = null;
  let nearestMatch = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const family of families.values()) {
    if (family.layer !== layer) continue;
    const familyFrequency = family.centerHz ?? 0;
    const distance = Math.abs(familyFrequency - candidateFrequency);
    const threshold = getPeakSelectionDistanceHz(layer, candidateFrequency);
    const neighborhoodThreshold = Math.min(36, threshold * 0.55);
    if (distance <= Math.min(18, threshold * 0.18)) {
      directMatch = family;
      break;
    }
    if (
      layer === "backbone" &&
      familyFrequency < candidateFrequency &&
      isPeakHarmonicallyRelated(candidateFrequency, familyFrequency)
    ) {
      if (
        !lowerHarmonicMatch ||
        familyFrequency > (lowerHarmonicMatch.centerHz ?? 0)
      ) {
        lowerHarmonicMatch = family;
      }
    }
    if (distance < nearestDistance && distance <= neighborhoodThreshold) {
      nearestDistance = distance;
      nearestMatch = family;
    }
  }

  return {
    directMatch,
    lowerHarmonicMatch,
    nearestMatch,
  };
}

function selectFamilyForCandidate({ state, layer, candidate, families }) {
  const matches = matchExistingFamily(families, candidate, layer);
  if (matches.directMatch) {
    return matches.directMatch;
  }

  if (layer === "backbone" && matches.lowerHarmonicMatch) {
    const key = familyBucketKey(layer, candidate.frequency ?? 0);
    const pendingFrames =
      (state.pendingIndependentCandidates.get(key) ?? 0) + 1;
    state.pendingIndependentCandidates.set(key, pendingFrames);
    if (pendingFrames >= HARMONIC_SPLIT_CONFIRM_FRAMES) {
      state.pendingIndependentCandidates.delete(key);
      return null;
    }
    return matches.lowerHarmonicMatch;
  }

  return matches.nearestMatch;
}

function updateLayerFamilies({ state, layer, candidates, heavyFrameIndex }) {
  const families =
    layer === "backbone" ? state.backboneFamilies : state.detailFamilies;
  const decayedFamilies = new Map();
  const heavyFrameDelta = Math.max(
    1,
    heavyFrameIndex - Math.max(0, state.heavyFrameId),
  );

  for (const family of families.values()) {
    const decayed = decayFamily(family, heavyFrameDelta);
    if (decayed.amplitude >= FAMILY_ACTIVITY_EPSILON) {
      decayedFamilies.set(decayed.id, decayed);
    }
  }

  const sortedCandidates = [...candidates].sort(
    (left, right) =>
      (right.amplitude ?? 0) - (left.amplitude ?? 0) ||
      (left.frequency ?? 0) - (right.frequency ?? 0),
  );
  for (const candidate of sortedCandidates) {
    const matchedFamily = selectFamilyForCandidate({
      state,
      layer,
      candidate,
      families: decayedFamilies,
    });
    if (matchedFamily) {
      const candidateFrequency = candidate.frequency ?? 0;
      const harmonicMerge =
        layer === "backbone" &&
        (matchedFamily.centerHz ?? 0) < candidateFrequency &&
        isPeakHarmonicallyRelated(
          candidateFrequency,
          matchedFamily.centerHz ?? 0,
        );
      if (!harmonicMerge) {
        matchedFamily.centerHz =
          matchedFamily.centerHz * 0.72 + candidateFrequency * 0.28;
      }
      matchedFamily.amplitude = Math.max(
        matchedFamily.amplitude,
        (candidate.amplitude ?? 0) * 0.96,
      );
      matchedFamily.harmonicSupport = Math.max(
        matchedFamily.harmonicSupport,
        candidate.harmonicSupport ?? 0,
      );
      matchedFamily.ageFrames = 0;
      matchedFamily.lastConfirmedHeavyFrame = heavyFrameIndex;
      matchedFamily.disagreementCount = 0;
      matchedFamily.confirmedFrames += 1;
      continue;
    }

    const family = createFamily({
      id: state.nextFamilyId,
      layer,
      frequency: candidate.frequency ?? 0,
      amplitude: candidate.amplitude ?? 0,
      harmonicSupport: candidate.harmonicSupport ?? 0,
      heavyFrameIndex,
    });
    state.nextFamilyId += 1;
    decayedFamilies.set(family.id, family);
  }

  if (layer === "backbone") {
    state.backboneFamilies = decayedFamilies;
  } else {
    state.detailFamilies = decayedFamilies;
  }
}

function buildFamilyCandidates(families, layer) {
  return Array.from(families.values())
    .filter((family) => family.amplitude >= FAMILY_ACTIVITY_EPSILON)
    .map((family) => {
      const confidence = buildFamilyConfidence(family);
      const baseScore =
        family.amplitude *
        (0.5 + confidence * 0.3 + family.harmonicSupport * 0.2);
      return {
        familyId: family.id,
        layer,
        frequency: family.centerHz,
        amplitude: family.amplitude,
        harmonicSupport: family.harmonicSupport,
        salienceScore: clamp01(confidence * 0.6 + family.harmonicSupport * 0.4),
        backboneBaseScore: layer === "backbone" ? baseScore : 0,
        detailBaseScore: layer === "detail" ? baseScore : 0,
      };
    });
}

function selectFamiliesByLayer({ state, analysisHints }) {
  const backboneCandidates = buildFamilyCandidates(
    state.backboneFamilies,
    "backbone",
  );
  const detailCandidates = buildFamilyCandidates(
    state.detailFamilies,
    "detail",
  ).filter((candidate) => (candidate.frequency ?? 0) > BACKBONE_PEAK_MAX_HZ);
  const rawBackboneSelection = deriveRawSelectedCandidatePeaks(
    backboneCandidates,
    analysisHints,
  );
  const rawDetailSelection = deriveRawSelectedCandidatePeaks(
    detailCandidates,
    analysisHints,
  );

  return {
    detailPeaks: rawDetailSelection.detailPeaks,
    backbonePeaks: rawBackboneSelection.backbonePeaks,
    dominantPeak:
      rawBackboneSelection.dominantPeak ??
      rawDetailSelection.dominantPeak ??
      null,
  };
}

function buildBackboneHarmonicSupport(backbonePeaks) {
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const dominantPeak = backbonePeaks[0] ?? null;
  if (
    !dominantPeak ||
    !(dominantPeak.frequency > 0) ||
    !(dominantPeak.amplitude > 0)
  ) {
    return harmonicSupport;
  }

  if (
    backbonePeaks.some((peak) =>
      Number.isFinite(peak?.harmonicSupport ?? Number.NaN),
    )
  ) {
    harmonicSupport[0] = clamp01(dominantPeak.harmonicSupport ?? 0);
    for (
      let index = 1;
      index < HARMONIC_ORDERS.length && index < backbonePeaks.length;
      index += 1
    ) {
      harmonicSupport[index] = clamp01(
        backbonePeaks[index]?.harmonicSupport ?? 0,
      );
    }
    return harmonicSupport;
  }

  harmonicSupport[0] = 1;
  for (let index = 1; index < HARMONIC_ORDERS.length; index += 1) {
    const harmonicFrequency = dominantPeak.frequency * HARMONIC_ORDERS[index];
    const matchingPeak = backbonePeaks.find((peak) => {
      const frequency = peak.frequency ?? 0;
      if (!(frequency > 0)) return false;
      return (
        Math.abs(frequency - harmonicFrequency) /
          Math.max(frequency, harmonicFrequency) <=
        0.14
      );
    });
    if (!matchingPeak) {
      harmonicSupport[index] = 0;
      continue;
    }
    harmonicSupport[index] = clamp01(
      (matchingPeak.amplitude ?? 0) /
        Math.max(dominantPeak.amplitude, FAMILY_ACTIVITY_EPSILON),
    );
  }

  return harmonicSupport;
}

function buildDistributedExcitation(selectedFamilies) {
  const amplitudes = selectedFamilies
    .map((family) => family.amplitude ?? 0)
    .filter((amplitude) => amplitude > 0);
  const totalAmplitude = amplitudes.reduce(
    (total, amplitude) => total + amplitude,
    0,
  );
  if (totalAmplitude < FAMILY_ACTIVITY_EPSILON) {
    return 0;
  }
  const entropy = amplitudes.reduce((total, amplitude) => {
    const probability = amplitude / totalAmplitude;
    if (!(probability > 0)) {
      return total;
    }
    return total - probability * Math.log(probability);
  }, 0);
  return clamp01(entropy / Math.log(Math.max(2, amplitudes.length)));
}

function buildStructuralMetrics({ state, backbonePeaks, detailPeaks }) {
  const selectedFamilies = [
    ...backbonePeaks
      .map((peak) => state.backboneFamilies.get(peak.familyId))
      .filter(Boolean),
    ...detailPeaks
      .map((peak) => state.detailFamilies.get(peak.familyId))
      .filter(Boolean),
  ];
  const totalAmplitude = selectedFamilies.reduce(
    (total, family) => total + (family.amplitude ?? 0),
    0,
  );
  const distributedExcitation = buildDistributedExcitation(selectedFamilies);
  const weightedPersistence =
    totalAmplitude > FAMILY_ACTIVITY_EPSILON
      ? selectedFamilies.reduce(
          (total, family) =>
            total + buildFamilyPersistence(family) * (family.amplitude ?? 0),
          0,
        ) / totalAmplitude
      : 0;
  const weightedConfidence =
    totalAmplitude > FAMILY_ACTIVITY_EPSILON
      ? selectedFamilies.reduce(
          (total, family) =>
            total + buildFamilyConfidence(family) * (family.amplitude ?? 0),
          0,
        ) / totalAmplitude
      : 0;
  const weightedHarmonicSupport =
    totalAmplitude > FAMILY_ACTIVITY_EPSILON
      ? selectedFamilies.reduce(
          (total, family) =>
            total + (family.harmonicSupport ?? 0) * (family.amplitude ?? 0),
          0,
        ) / totalAmplitude
      : 0;
  const modalPersistence = clamp01(weightedPersistence * 0.28);
  const lowOrderModalEnergy = selectedFamilies.reduce((total, family) => {
    if ((family.centerHz ?? 0) <= BACKBONE_PEAK_MAX_HZ) {
      return total + (family.amplitude ?? 0);
    }
    return total;
  }, 0);
  const highOrderModalEnergy = selectedFamilies.reduce((total, family) => {
    if ((family.centerHz ?? 0) > BACKBONE_PEAK_MAX_HZ) {
      return total + (family.amplitude ?? 0);
    }
    return total;
  }, 0);
  const normalizedLowOrderModalEnergy = clamp01(lowOrderModalEnergy / 2.5);
  const normalizedHighOrderModalEnergy = clamp01(highOrderModalEnergy / 2.5);
  const modalDriveEnergy =
    selectedFamilies.length > 0
      ? clamp01(totalAmplitude / selectedFamilies.length)
      : 0;
  const modeCoherence = clamp01(
    0.38 +
      weightedConfidence * 0.34 +
      weightedHarmonicSupport * 0.28 +
      modalPersistence * 0.08 -
      distributedExcitation * 0.06,
  );

  return {
    excitedModeCount: selectedFamilies.length,
    distributedExcitation,
    lowOrderModalEnergy: normalizedLowOrderModalEnergy,
    highOrderModalEnergy: normalizedHighOrderModalEnergy,
    modalPersistence,
    modalDriveEnergy,
    modeCoherence,
    driveSource: "spectral-family",
  };
}

export function updateLegacyPeakSelection({
  state,
  candidatePool,
  analysisHints,
  heavyFrameIndex,
  selectionMode = "families",
}) {
  if (selectionMode === "raw") {
    const rawSelection = deriveRawSelectedCandidatePeaks(
      candidatePool,
      analysisHints,
    );
    return {
      ...rawSelection,
      backboneHarmonicSupport: buildBackboneHarmonicSupport(
        rawSelection.backbonePeaks,
      ),
      structuralMetrics: {
        excitedModeCount:
          rawSelection.backbonePeaks.length + rawSelection.detailPeaks.length,
        distributedExcitation: 0,
        lowOrderModalEnergy: rawSelection.backbonePeaks.reduce(
          (total, peak) => total + (peak.amplitude ?? 0),
          0,
        ),
        highOrderModalEnergy: rawSelection.detailPeaks.reduce(
          (total, peak) => total + (peak.amplitude ?? 0),
          0,
        ),
        modalPersistence: 0,
        modalDriveEnergy: rawSelection.backbonePeaks.length
          ? clamp01(
              rawSelection.backbonePeaks.reduce(
                (total, peak) => total + (peak.amplitude ?? 0),
                0,
              ) / rawSelection.backbonePeaks.length,
            )
          : 0,
        modeCoherence: averageArray(
          buildBackboneHarmonicSupport(rawSelection.backbonePeaks),
        ),
        driveSource: "spectral-raw",
      },
    };
  }

  const nextState = state ?? createLegacyPeakFamilyState();
  const rawSelection = deriveRawSelectedCandidatePeaks(
    candidatePool,
    analysisHints,
  );
  const sortedCandidates = [...rawSelection.preparedCandidatePool].sort(
    (left, right) =>
      (right.backboneBaseScore ?? right.detailBaseScore ?? 0) -
      (left.backboneBaseScore ?? left.detailBaseScore ?? 0),
  );
  const backboneCandidates = sortedCandidates
    .filter((candidate) => (candidate.frequency ?? 0) <= BACKBONE_PEAK_MAX_HZ)
    .map((candidate) => ({
      ...candidate,
      harmonicSupport: computeCandidateHarmonicSupport(
        candidate,
        sortedCandidates,
      ),
    }));
  const detailCandidates = sortedCandidates.map((candidate) => ({
    ...candidate,
    harmonicSupport: computeCandidateHarmonicSupport(
      candidate,
      sortedCandidates,
    ),
  }));

  updateLayerFamilies({
    state: nextState,
    layer: "backbone",
    candidates: backboneCandidates,
    heavyFrameIndex,
  });
  updateLayerFamilies({
    state: nextState,
    layer: "detail",
    candidates: detailCandidates,
    heavyFrameIndex,
  });
  nextState.heavyFrameId = heavyFrameIndex;

  const { detailPeaks, backbonePeaks, dominantPeak } = selectFamiliesByLayer({
    state: nextState,
    analysisHints,
  });

  return {
    detailPeaks,
    backbonePeaks,
    dominantPeak,
    backboneHarmonicSupport: buildBackboneHarmonicSupport(backbonePeaks),
    structuralMetrics: buildStructuralMetrics({
      state: nextState,
      backbonePeaks,
      detailPeaks,
    }),
  };
}
