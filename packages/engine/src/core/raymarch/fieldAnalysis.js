import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { deriveObservationVisibilityDrive } from "./observationTransfer.js";
import { clamp01 } from "../../utils/math.js";

function copySlot4(source, sourceOffset, target, targetOffset) {
  target[targetOffset] = source?.[sourceOffset] ?? 0;
  target[targetOffset + 1] = source?.[sourceOffset + 1] ?? 0;
  target[targetOffset + 2] = source?.[sourceOffset + 2] ?? 0;
  target[targetOffset + 3] = source?.[sourceOffset + 3] ?? 0;
}

export function deriveFieldExcitation(featureFrame) {
  return deriveObservationVisibilityDrive(featureFrame);
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
  let occupiedSlotSpan = 0;
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
  modalFieldSlots,
  modalFieldCapacity,
  featureFrame,
  cavityGeometry = "rectangular",
}) {
  const modalField = analyzeModalField({
    slots: modalFieldSlots,
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
