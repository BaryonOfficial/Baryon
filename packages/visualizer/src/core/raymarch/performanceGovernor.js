import { getModalGeometryBackend } from "../modalGeometryBackend.js";

export const MIN_BACKBONE_RENDER_SLOTS = 4;
export const MIN_DETAIL_RENDER_SLOTS = 2;
export const BACKBONE_ENERGY_RETENTION = 0.86;
export const DETAIL_ENERGY_RETENTION = 0.72;
export const MIN_COMPLEXITY_RENDER_SCALE = 0.84;
export const RAYMARCH_LAYER_BUDGETS = Object.freeze({
  backbone: Object.freeze({
    minSlots: MIN_BACKBONE_RENDER_SLOTS,
    energyRetention: BACKBONE_ENERGY_RETENTION,
  }),
  detail: Object.freeze({
    minSlots: MIN_DETAIL_RENDER_SLOTS,
    energyRetention: DETAIL_ENERGY_RETENTION,
  }),
});
const STEP_COMPLEXITY_START = 0.45;
const RENDER_SCALE_COMPLEXITY_START = 0.58;
const BLOOM_GUARD_COMPLEXITY_START = 0.5;
const SALIENCE_AMPLITUDE_WEIGHT = 0.68;
const SALIENCE_COLOR_WEIGHT = 0.18;
const SALIENCE_TRANSIENT_WEIGHT = 0.08;
const SALIENCE_DETAIL_WEIGHT = 0.06;
const SALIENCE_NOISE_WEIGHT = 0.1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function copySlot4(source, sourceOffset, target, targetOffset) {
  target[targetOffset] = source?.[sourceOffset] ?? 0;
  target[targetOffset + 1] = source?.[sourceOffset + 1] ?? 0;
  target[targetOffset + 2] = source?.[sourceOffset + 2] ?? 0;
  target[targetOffset + 3] = source?.[sourceOffset + 3] ?? 0;
}

function deriveBroadbandNoisePenalty(featureFrame) {
  const harmonicity = clamp01(
    featureFrame?.harmonicity ?? featureFrame?.modeCoherence ?? 0,
  );
  const textureSpread = clamp01(featureFrame?.textureSpread ?? 0);
  const trebleBroadbandEnergy = clamp01(
    featureFrame?.trebleBroadbandEnergy ?? 0,
  );
  const flatnessLike = clamp01(
    textureSpread * 0.52 +
      trebleBroadbandEnergy * 0.34 +
      (1 - harmonicity) * 0.14,
  );
  return clamp01((flatnessLike - 0.55) / 0.45);
}

function deriveRenderSalience({
  amplitude,
  colorWeight,
  transientEnergy,
  detailBonus,
  noisePenalty,
}) {
  return (
    amplitude * SALIENCE_AMPLITUDE_WEIGHT +
    colorWeight * SALIENCE_COLOR_WEIGHT +
    transientEnergy * SALIENCE_TRANSIENT_WEIGHT +
    detailBonus * SALIENCE_DETAIL_WEIGHT -
    noisePenalty * SALIENCE_NOISE_WEIGHT
  );
}

export function deriveFieldExcitation(featureFrame) {
  const avgAmplitude = (featureFrame?.averageAmplitude ?? 0) / 255;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const harmonicity = featureFrame?.harmonicity ?? 0;

  return clamp01(
    avgAmplitude * 0.3 + structureSignal * 0.45 + harmonicity * 0.25,
  );
}

export function inferLayerCapacity(capacity, slots) {
  if (Number.isFinite(capacity) && capacity > 0) {
    return Math.max(1, Math.round(capacity));
  }

  return Math.max(1, Math.floor((slots?.length ?? 0) / 4));
}

export function analyzeBudgetedModeLayer({
  slots,
  colorSlots,
  capacity,
  minSlots = 0,
  energyRetention = 1,
  cavityGeometry = "rectangular",
  layerType = "backbone",
  chromesthesiaEnabled = false,
  featureFrame = null,
}) {
  const resolvedCapacity = inferLayerCapacity(capacity, slots);
  const candidates = [];
  let totalAmplitude = 0;
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const useRenderSalience = Boolean(chromesthesiaEnabled && colorSlots);
  const transientEnergy = clamp01(featureFrame?.transientEnergy ?? 0);
  const noisePenalty = deriveBroadbandNoisePenalty(featureFrame);
  const detailBonus = layerType === "detail" ? 1 : 0;

  for (let slotIndex = 0; slotIndex < resolvedCapacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = slots?.[offset + 3] ?? 0;
    if (!(amplitude > 0)) {
      continue;
    }

    const permutationCount = geometryBackend.getSlotEvaluationCost(
      slots,
      offset,
    );
    const rawColorWeight = useRenderSalience
      ? clamp01(colorSlots[offset + 3])
      : 0;
    const colorWeight = rawColorWeight * (1 - noisePenalty);
    totalAmplitude += amplitude;
    candidates.push({
      slotIndex,
      amplitude,
      permutationCount,
      colorWeight,
      renderSalience: useRenderSalience
        ? deriveRenderSalience({
            amplitude,
            colorWeight,
            transientEnergy: transientEnergy * (1 - noisePenalty),
            detailBonus,
            noisePenalty,
          })
        : amplitude,
    });
  }

  const originalActiveCount = candidates.length;
  if (originalActiveCount === 0) {
    return {
      capacity: resolvedCapacity,
      originalActiveCount,
      uploadedActiveCount: 0,
      totalAmplitude: 0,
      uploadedAmplitude: 0,
      retainedEnergyRatio: 0,
      weightedPermutationLoad: 0,
      averagePermutationCost: 0,
      selectedIndices: [],
    };
  }

  const normalizedRetention = clamp01(energyRetention);
  const ranked = candidates.toSorted((left, right) => {
    if (right.renderSalience !== left.renderSalience) {
      return right.renderSalience - left.renderSalience;
    }
    if (right.amplitude !== left.amplitude) {
      return right.amplitude - left.amplitude;
    }
    return left.slotIndex - right.slotIndex;
  });
  const requiredCount = Math.min(
    originalActiveCount,
    Math.max(0, Math.round(minSlots)),
  );
  const selected = [];
  let uploadedAmplitude = 0;

  for (let index = 0; index < ranked.length; index += 1) {
    const candidate = ranked[index];
    const shouldRetain =
      index < requiredCount ||
      uploadedAmplitude / Math.max(totalAmplitude, 1e-4) < normalizedRetention;
    if (!shouldRetain) {
      continue;
    }
    uploadedAmplitude += candidate.amplitude;
    selected.push(candidate);
  }

  if (selected.length === 0) {
    selected.push(ranked[0]);
    uploadedAmplitude = ranked[0].amplitude;
  }

  selected.sort((left, right) => left.slotIndex - right.slotIndex);
  const uploadedPermutationLoad = selected.reduce(
    (sum, candidate) =>
      sum + candidate.amplitude * (candidate.permutationCount / 6),
    0,
  );

  return {
    capacity: resolvedCapacity,
    originalActiveCount,
    uploadedActiveCount: selected.length,
    totalAmplitude,
    uploadedAmplitude,
    retainedEnergyRatio: clamp01(
      uploadedAmplitude / Math.max(totalAmplitude, 1e-4),
    ),
    weightedPermutationLoad: uploadedPermutationLoad,
    averagePermutationCost:
      uploadedAmplitude > 0 ? uploadedPermutationLoad / uploadedAmplitude : 0,
    selectedIndices: selected.map((candidate) => candidate.slotIndex),
    chromesthesiaAware: useRenderSalience,
    maxColorWeight: selected.reduce(
      (max, candidate) => Math.max(max, candidate.colorWeight ?? 0),
      0,
    ),
    noisePenalty: useRenderSalience ? noisePenalty : 0,
  };
}

export function buildBudgetedModeLayer({
  slots,
  colorSlots,
  capacity,
  layerType = "backbone",
  cavityGeometry = "rectangular",
  chromesthesiaEnabled = false,
  featureFrame = null,
}) {
  const layerBudget =
    RAYMARCH_LAYER_BUDGETS[layerType] ?? RAYMARCH_LAYER_BUDGETS.backbone;
  return analyzeBudgetedModeLayer({
    slots,
    colorSlots,
    capacity,
    minSlots: layerBudget.minSlots,
    energyRetention: layerBudget.energyRetention,
    cavityGeometry,
    layerType,
    chromesthesiaEnabled,
    featureFrame,
  });
}

export function copyBudgetedModeLayer({
  sourceSlots,
  sourceColorSlots,
  targetSlots,
  targetColorSlots,
  selectedIndices,
  capacity,
  includeColors = true,
}) {
  const resolvedCapacity = inferLayerCapacity(capacity, targetSlots);
  const targetLength = resolvedCapacity * 4;
  targetSlots.fill(0, 0, targetLength);
  if (targetColorSlots) {
    targetColorSlots.fill(0, 0, targetLength);
  }

  for (
    let selectedIndex = 0;
    selectedIndex < selectedIndices.length && selectedIndex < resolvedCapacity;
    selectedIndex += 1
  ) {
    const sourceSlotIndex = selectedIndices[selectedIndex] * 4;
    const targetSlotIndex = selectedIndex * 4;
    copySlot4(sourceSlots, sourceSlotIndex, targetSlots, targetSlotIndex);
    if (includeColors && targetColorSlots) {
      copySlot4(
        sourceColorSlots,
        sourceSlotIndex,
        targetColorSlots,
        targetSlotIndex,
      );
    }
  }
}

export function deriveRaymarchComplexityGovernor({
  backbone,
  detail,
  featureFrame,
  requestedStepBudget,
  requestedRenderScale = 1,
}) {
  const totalCapacity = Math.max(
    1,
    (backbone?.capacity ?? 0) + (detail?.capacity ?? 0),
  );
  const uploadedModeCount =
    (backbone?.uploadedActiveCount ?? 0) + (detail?.uploadedActiveCount ?? 0);
  const originalModeCount =
    (backbone?.originalActiveCount ?? 0) + (detail?.originalActiveCount ?? 0);
  const countLoad = clamp01(uploadedModeCount / totalCapacity);
  const weightedPermutationLoad = clamp01(
    ((backbone?.weightedPermutationLoad ?? 0) +
      (detail?.weightedPermutationLoad ?? 0) * 0.85) /
      Math.max(1, (backbone?.capacity ?? 0) + (detail?.capacity ?? 0) * 0.85),
  );
  const excitation = deriveFieldExcitation(featureFrame);
  const complexityScore = clamp01(
    countLoad * 0.34 + weightedPermutationLoad * 0.38 + excitation * 0.28,
  );
  const stepPressure = smoothstep(STEP_COMPLEXITY_START, 1, complexityScore);
  const renderScalePressure = smoothstep(
    RENDER_SCALE_COMPLEXITY_START,
    1,
    complexityScore,
  );
  const bloomPressure = smoothstep(
    BLOOM_GUARD_COMPLEXITY_START,
    1,
    complexityScore,
  );
  const proactiveStepBudget = Math.max(
    16,
    Math.round(requestedStepBudget * (1 - stepPressure * 0.28)),
  );
  const proactiveRenderScale = clamp(
    requestedRenderScale * (1 - renderScalePressure * 0.16),
    Math.min(requestedRenderScale, MIN_COMPLEXITY_RENDER_SCALE),
    requestedRenderScale,
  );
  const bloomStrengthScale = 1 - bloomPressure * 0.22;
  const bloomThresholdOffset = bloomPressure * 0.08;
  const bloomAllowed = !(
    complexityScore > 0.95 &&
    proactiveStepBudget <= 32 &&
    proactiveRenderScale <= 0.84
  );

  return {
    complexityScore,
    excitation,
    originalModeCount,
    uploadedModeCount,
    countLoad,
    weightedPermutationLoad,
    proactiveStepBudget,
    proactiveRenderScale,
    bloomStrengthScale,
    bloomThresholdOffset,
    bloomAllowed,
  };
}

export function buildRaymarchPerformanceGovernor({
  backboneSlots,
  detailSlots,
  backboneColorSlots = null,
  detailColorSlots = null,
  backboneCapacity,
  detailCapacity,
  featureFrame,
  requestedStepBudget,
  requestedRenderScale = 1,
  cavityGeometry = "rectangular",
  chromesthesiaEnabled = false,
}) {
  const backbone = buildBudgetedModeLayer({
    slots: backboneSlots,
    colorSlots: backboneColorSlots,
    capacity: backboneCapacity,
    layerType: "backbone",
    cavityGeometry,
    chromesthesiaEnabled,
    featureFrame,
  });
  const detail = buildBudgetedModeLayer({
    slots: detailSlots,
    colorSlots: detailColorSlots,
    capacity: detailCapacity,
    layerType: "detail",
    cavityGeometry,
    chromesthesiaEnabled,
    featureFrame,
  });

  return {
    ...deriveRaymarchComplexityGovernor({
      backbone,
      detail,
      featureFrame,
      requestedStepBudget,
      requestedRenderScale,
    }),
    backbone,
    detail,
  };
}
