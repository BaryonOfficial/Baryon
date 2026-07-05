import { clamp01 } from "../math.js";

export const DEFAULT_RENDER_ENERGY_EPSILON = 1e-6;
export const ENERGY_OWNER_VERSION = "av-energy-ledger:v1";

function shouldBoundarySuppressProjection(renderBoundaryState) {
  return renderBoundaryState === "absent" || renderBoundaryState === "muted";
}

function shouldBoundaryCapProjection(renderBoundaryState) {
  return renderBoundaryState === "zero";
}

function shouldSignalCapProjection({
  currentSignalAmplitude,
  renderEnergyEpsilon,
}) {
  return (
    Number.isFinite(currentSignalAmplitude) &&
    currentSignalAmplitude <= renderEnergyEpsilon
  );
}

export function sumProjectedSlotEnergy(slots, capacity = undefined) {
  if (!(slots instanceof Float32Array) || slots.length === 0) {
    return 0;
  }

  const slotCount = Math.min(
    Math.floor(slots.length / 4),
    Number.isFinite(capacity) ? Math.max(0, capacity) : slots.length / 4,
  );
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const amplitude = clamp01(slots[index * 4 + 3] ?? 0);
    total += amplitude * amplitude;
  }

  return clamp01(total);
}

export function hasProjectedRenderAuthority(
  ledger,
  { injectTestTone = false } = {},
) {
  if (injectTestTone || ledger?.injectTestTone === true) {
    return true;
  }

  return (
    clamp01(ledger?.projectedRenderEnergy ?? 0) >
    clamp01(ledger?.renderEnergyEpsilon ?? DEFAULT_RENDER_ENERGY_EPSILON)
  );
}

export function buildModalEnergyLedger({
  sourceEnergy = 0,
  sourceBoundaryState = undefined,
  renderBoundaryState = sourceBoundaryState ?? "live",
  modalResponse = null,
  candidateForcingSlots = null,
  candidateResponseSlots = null,
  capacity = undefined,
  currentSignalEnergy = undefined,
  currentSignalAmplitude = undefined,
  renderEnergyEpsilon = DEFAULT_RENDER_ENERGY_EPSILON,
  injectTestTone = false,
} = {}) {
  const rawProjectedSourceCoupledEnergy = sumProjectedSlotEnergy(
    candidateForcingSlots,
    capacity,
  );
  const rawProjectedResonantEnergy = sumProjectedSlotEnergy(
    candidateResponseSlots,
    capacity,
  );
  const rawProjectedLayerEnergyTotal = clamp01(
    rawProjectedSourceCoupledEnergy + rawProjectedResonantEnergy,
  );
  const rawProjectedEnergyScaleDenominator =
    rawProjectedSourceCoupledEnergy + rawProjectedResonantEnergy;
  const rawProjectedRenderEnergy = clamp01(rawProjectedLayerEnergyTotal);
  const normalizedSourceEnergy = clamp01(sourceEnergy);
  const resolvedRenderBoundaryState = renderBoundaryState ?? "live";
  const rawStoredModalEnergy = clamp01(modalResponse?.modalResponseEnergy ?? 0);
  const storedModalEnergy = Number.isFinite(
    modalResponse?.modalResponseRenderCapEnergy,
  )
    ? Math.min(
        rawStoredModalEnergy,
        clamp01(modalResponse.modalResponseRenderCapEnergy),
      )
    : rawStoredModalEnergy;
  const storedModalLayerScale =
    rawStoredModalEnergy > 0 && storedModalEnergy < rawStoredModalEnergy
      ? storedModalEnergy / rawStoredModalEnergy
      : 1;
  const normalizedCurrentSignalEnergy = Number.isFinite(currentSignalEnergy)
    ? clamp01(currentSignalEnergy)
    : rawProjectedRenderEnergy;
  const projectedRenderEnergy = shouldBoundarySuppressProjection(
    resolvedRenderBoundaryState,
  )
    ? 0
    : shouldBoundaryCapProjection(resolvedRenderBoundaryState) ||
        shouldSignalCapProjection({
          currentSignalAmplitude,
          renderEnergyEpsilon,
        })
      ? Math.min(rawProjectedRenderEnergy, storedModalEnergy)
      : rawProjectedRenderEnergy;
  const projectedEnergyScale =
    rawProjectedEnergyScaleDenominator > 0 &&
    projectedRenderEnergy < rawProjectedEnergyScaleDenominator
      ? Math.sqrt(projectedRenderEnergy / rawProjectedEnergyScaleDenominator)
      : 1;
  const projectedEnergyScaleSquared =
    projectedEnergyScale * projectedEnergyScale;
  const projectedSourceCoupledEnergy = clamp01(
    rawProjectedSourceCoupledEnergy * projectedEnergyScaleSquared,
  );
  const projectedResonantEnergy = clamp01(
    rawProjectedResonantEnergy * projectedEnergyScaleSquared,
  );
  const ledger = {
    energyOwnerVersion: ENERGY_OWNER_VERSION,
    sourceBoundaryState: resolvedRenderBoundaryState,
    renderBoundaryState: resolvedRenderBoundaryState,
    sourceEnergy: normalizedSourceEnergy,
    storedModalEnergy,
    storedModalSourceCoupledEnergy: clamp01(
      (modalResponse?.modalResponseSourceCoupledEnergy ?? 0) *
        storedModalLayerScale,
    ),
    storedModalResonantEnergy: clamp01(
      (modalResponse?.modalResponseResonantEnergy ?? 0) *
        storedModalLayerScale,
    ),
    projectedRenderEnergy,
    rawProjectedRenderEnergy,
    rawProjectedSourceCoupledEnergy,
    rawProjectedResonantEnergy,
    currentSignalEnergy: normalizedCurrentSignalEnergy,
    currentSignalAmplitude: Number.isFinite(currentSignalAmplitude)
      ? Math.max(0, currentSignalAmplitude)
      : rawProjectedRenderEnergy,
    projectedEnergyScale,
    projectedSourceCoupledEnergy,
    projectedResonantEnergy,
    renderEnergyEpsilon: clamp01(renderEnergyEpsilon),
    injectTestTone: injectTestTone === true,
  };

  return {
    ...ledger,
    renderAuthority: hasProjectedRenderAuthority(ledger),
  };
}
