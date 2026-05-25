import { getModalGeometryBackend } from "../modalGeometryBackend.js";

export const MIN_COMPLEXITY_RENDER_SCALE = 0.84;

const STEP_COMPLEXITY_START = 0.45;
const RENDER_SCALE_COMPLEXITY_START = 0.58;
const BLOOM_GUARD_COMPLEXITY_START = 0.5;

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

export function deriveFieldExcitation(featureFrame) {
  const avgAmplitude = (featureFrame?.averageAmplitude ?? 0) / 255;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const modalDriver = Math.max(
    featureFrame?.modalVisibilityEnergy ?? 0,
    (featureFrame?.modeCoherence ?? 0) * 0.5,
  );

  return clamp01(
    avgAmplitude * 0.3 + structureSignal * 0.45 + modalDriver * 0.25,
  );
}

export function inferModalFieldCapacity(capacity, slots) {
  if (Number.isFinite(capacity) && capacity > 0) {
    return Math.max(1, Math.round(capacity));
  }

  return Math.max(1, Math.floor((slots?.length ?? 0) / 4));
}

export function analyzeModalField({
  slots,
  capacity,
  cavityGeometry = "rectangular",
}) {
  const resolvedCapacity = inferModalFieldCapacity(capacity, slots);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  let activeCount = 0;
  let totalAmplitude = 0;
  let weightedPermutationLoad = 0;

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
    activeCount += 1;
    totalAmplitude += amplitude;
    weightedPermutationLoad += amplitude * (permutationCount / 6);
  }

  return {
    capacity: resolvedCapacity,
    originalActiveCount: activeCount,
    uploadedActiveCount: activeCount,
    totalAmplitude,
    uploadedAmplitude: totalAmplitude,
    weightedPermutationLoad,
    averagePermutationCost:
      totalAmplitude > 0 ? weightedPermutationLoad / totalAmplitude : 0,
  };
}

export function copyModalField({
  sourceSlots,
  sourceColorSlots = null,
  targetSlots,
  targetColorSlots = null,
  capacity,
  includeColors = true,
}) {
  const resolvedCapacity = inferModalFieldCapacity(capacity, targetSlots);
  const targetLength = resolvedCapacity * 4;
  targetSlots.fill(0, 0, targetLength);
  if (targetColorSlots) {
    targetColorSlots.fill(0, 0, targetLength);
  }

  for (let slotIndex = 0; slotIndex < resolvedCapacity; slotIndex += 1) {
    const sourceOffset = slotIndex * 4;
    const targetOffset = slotIndex * 4;
    copySlot4(sourceSlots, sourceOffset, targetSlots, targetOffset);
    if (includeColors && targetColorSlots) {
      copySlot4(sourceColorSlots, sourceOffset, targetColorSlots, targetOffset);
    }
  }
}

export function deriveRaymarchComplexityGovernor({
  modalField,
  featureFrame,
  requestedStepBudget,
  requestedRenderScale = 1,
  qualityAdaptationEnabled = true,
}) {
  const totalCapacity = Math.max(1, modalField?.capacity ?? 0);
  const normalizedRequestedStepBudget = Math.max(
    16,
    Math.round(Number.isFinite(requestedStepBudget) ? requestedStepBudget : 16),
  );
  const normalizedRequestedRenderScale =
    Number.isFinite(requestedRenderScale) && requestedRenderScale > 0
      ? requestedRenderScale
      : 1;
  const uploadedModeCount = modalField?.uploadedActiveCount ?? 0;
  const originalModeCount = modalField?.originalActiveCount ?? 0;
  const countLoad = clamp01(uploadedModeCount / totalCapacity);
  const weightedPermutationLoad = clamp01(
    (modalField?.weightedPermutationLoad ?? 0) / totalCapacity,
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
  const qualityAdaptationActive = qualityAdaptationEnabled !== false;
  const proactiveStepBudget = qualityAdaptationActive
    ? Math.max(
        16,
        Math.round(normalizedRequestedStepBudget * (1 - stepPressure * 0.28)),
      )
    : normalizedRequestedStepBudget;
  const proactiveRenderScale = qualityAdaptationActive
    ? clamp(
        normalizedRequestedRenderScale * (1 - renderScalePressure * 0.16),
        Math.min(normalizedRequestedRenderScale, MIN_COMPLEXITY_RENDER_SCALE),
        normalizedRequestedRenderScale,
      )
    : normalizedRequestedRenderScale;
  const bloomStrengthScale = qualityAdaptationActive
    ? 1 - bloomPressure * 0.22
    : 1;
  const bloomThresholdOffset = qualityAdaptationActive
    ? bloomPressure * 0.08
    : 0;
  const bloomAllowed =
    !qualityAdaptationActive ||
    !(
      complexityScore > 0.95 &&
      proactiveStepBudget <= 32 &&
      proactiveRenderScale <= 0.84
    );

  return {
    complexityScore,
    qualityAdaptationActive,
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
  modalFieldSlots,
  modalFieldCapacity,
  featureFrame,
  requestedStepBudget,
  requestedRenderScale = 1,
  qualityAdaptationEnabled = true,
  cavityGeometry = "rectangular",
}) {
  const modalField = analyzeModalField({
    slots: modalFieldSlots,
    capacity: modalFieldCapacity,
    cavityGeometry,
  });

  return deriveRaymarchPerformanceGovernor({
    modalField,
    featureFrame,
    requestedStepBudget,
    requestedRenderScale,
    qualityAdaptationEnabled,
  });
}

export function deriveRaymarchPerformanceGovernor({
  modalField,
  featureFrame,
  requestedStepBudget,
  requestedRenderScale = 1,
  qualityAdaptationEnabled = true,
}) {
  return {
    ...deriveRaymarchComplexityGovernor({
      modalField,
      featureFrame,
      requestedStepBudget,
      requestedRenderScale,
      qualityAdaptationEnabled,
    }),
    modalField,
  };
}
