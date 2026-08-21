import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { clamp01 } from "../../utils/math.js";
import { RAYMARCH_AVERAGE_AMPLITUDE_SHADER_REFERENCE } from "../../defaults.js";

export function deriveFieldExcitation(featureFrame) {
  const averageAmplitude = clamp01(
    (featureFrame?.averageAmplitude ?? 0) /
      RAYMARCH_AVERAGE_AMPLITUDE_SHADER_REFERENCE,
  );
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const modalDriver = Math.max(
    clamp01(featureFrame?.modalVisibilityEnergy ?? 0),
    clamp01(featureFrame?.modeCoherence ?? 0) * 0.5,
  );
  return clamp01(
    averageAmplitude * 0.3 + structureSignal * 0.45 + modalDriver * 0.25,
  );
}

export function inferModalFieldCapacity(capacity, modalIdentitySlots = null) {
  if (Number.isFinite(capacity) && capacity > 0) {
    return Math.max(1, Math.round(capacity));
  }

  return Math.max(1, Math.floor((modalIdentitySlots?.length ?? 0) / 3));
}

function resolveModalAnalysisModeCount({
  activeModeCount,
  capacity,
  modalIdentitySlots,
  modalCoefficientSlots,
}) {
  const declaredModeCount = Number.isFinite(activeModeCount)
    ? Math.max(0, Math.floor(activeModeCount))
    : capacity;
  return Math.min(
    capacity,
    declaredModeCount,
    Math.floor((modalIdentitySlots?.length ?? 0) / 3),
    modalCoefficientSlots?.length ?? 0,
  );
}

export function analyzeModalField({
  modalIdentitySlots,
  modalCoefficientSlots,
  activeModeCount,
  capacity,
  cavityGeometry = "rectangular",
}) {
  const resolvedCapacity = inferModalFieldCapacity(
    capacity,
    modalIdentitySlots,
  );
  const analyzedModeCount = resolveModalAnalysisModeCount({
    activeModeCount,
    capacity: resolvedCapacity,
    modalIdentitySlots,
    modalCoefficientSlots,
  });
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  let activeCount = 0;
  let occupiedSlotSpan = 0;
  let totalAmplitude = 0;
  let weightedPermutationLoad = 0;

  for (let slotIndex = 0; slotIndex < analyzedModeCount; slotIndex += 1) {
    const offset = slotIndex * 3;
    const amplitude = modalCoefficientSlots?.[slotIndex] ?? 0;
    if (!(amplitude > 0)) {
      continue;
    }

    const permutationCount = geometryBackend.getSlotEvaluationCost(
      modalIdentitySlots,
      offset,
    );
    activeCount += 1;
    occupiedSlotSpan = slotIndex + 1;
    totalAmplitude += amplitude;
    weightedPermutationLoad += amplitude * (permutationCount / 6);
  }

  return {
    capacity: resolvedCapacity,
    originalActiveCount: activeCount,
    uploadedActiveCount: occupiedSlotSpan,
    totalAmplitude,
    uploadedAmplitude: totalAmplitude,
    weightedPermutationLoad,
    averagePermutationCost:
      totalAmplitude > 0 ? weightedPermutationLoad / totalAmplitude : 0,
  };
}

export function deriveRaymarchFieldComplexity({ modalField, featureFrame }) {
  const totalCapacity = Math.max(1, modalField?.capacity ?? 0);
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

  return {
    complexityScore,
    excitation,
    originalModeCount,
    uploadedModeCount,
    countLoad,
    weightedPermutationLoad,
  };
}

export function buildRaymarchFieldAnalysis({
  modalIdentitySlots,
  modalCoefficientSlots,
  activeModeCount,
  modalFieldCapacity,
  featureFrame,
  cavityGeometry = "rectangular",
}) {
  const modalField = analyzeModalField({
    modalIdentitySlots,
    modalCoefficientSlots,
    activeModeCount,
    capacity: modalFieldCapacity,
    cavityGeometry,
  });

  return deriveRaymarchFieldAnalysis({
    modalField,
    featureFrame,
  });
}

function deriveRaymarchFieldAnalysis({ modalField, featureFrame }) {
  return {
    ...deriveRaymarchFieldComplexity({
      modalField,
      featureFrame,
    }),
    modalField,
  };
}
