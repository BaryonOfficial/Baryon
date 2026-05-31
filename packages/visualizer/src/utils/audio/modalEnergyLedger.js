export const DEFAULT_RENDER_ENERGY_EPSILON = 1e-6;
export const ENERGY_OWNER_VERSION = "av-energy-ledger:v1";

function shouldBoundarySuppressProjection(sourceBoundaryState) {
  return (
    sourceBoundaryState === "absent" || sourceBoundaryState === "muted"
  );
}

function shouldBoundaryCapProjection(sourceBoundaryState) {
  return sourceBoundaryState === "zero";
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
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
  sourceBoundaryState = "live",
  modalResponse = null,
  candidateForcingSlots = null,
  candidateResponseSlots = null,
  capacity = undefined,
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
  const rawProjectedRenderEnergy = clamp01(
    rawProjectedLayerEnergyTotal,
  );
  const normalizedSourceEnergy = clamp01(sourceEnergy);
  const storedModalEnergy = clamp01(modalResponse?.modalResponseEnergy ?? 0);
  const projectedRenderEnergy = shouldBoundarySuppressProjection(
    sourceBoundaryState,
  )
    ? 0
    : shouldBoundaryCapProjection(sourceBoundaryState)
      ? Math.min(rawProjectedRenderEnergy, storedModalEnergy)
      : rawProjectedRenderEnergy;
  const projectedEnergyScale =
    rawProjectedEnergyScaleDenominator > 0 &&
    projectedRenderEnergy < rawProjectedEnergyScaleDenominator
      ? Math.sqrt(projectedRenderEnergy / rawProjectedEnergyScaleDenominator)
      : 1;
  const projectedEnergyScaleSquared = projectedEnergyScale * projectedEnergyScale;
  const projectedSourceCoupledEnergy = clamp01(
    rawProjectedSourceCoupledEnergy * projectedEnergyScaleSquared,
  );
  const projectedResonantEnergy = clamp01(
    rawProjectedResonantEnergy * projectedEnergyScaleSquared,
  );
  const ledger = {
    energyOwnerVersion: ENERGY_OWNER_VERSION,
    sourceBoundaryState,
    sourceEnergy: normalizedSourceEnergy,
    storedModalEnergy,
    storedModalSourceCoupledEnergy: clamp01(
      modalResponse?.modalResponseSourceCoupledEnergy ?? 0,
    ),
    storedModalResonantEnergy: clamp01(
      modalResponse?.modalResponseResonantEnergy ?? 0,
    ),
    projectedRenderEnergy,
    rawProjectedRenderEnergy,
    rawProjectedSourceCoupledEnergy,
    rawProjectedResonantEnergy,
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
