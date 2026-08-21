import { DEFAULT_RENDER_ENERGY_EPSILON } from "./modalEnergyLedger.js";
import { clamp01 } from "../math.js";

// Display exposure is intentionally separate from modal energy. The renderer
// reaches roughly 63% visibility at this observable-energy reference point.
const DISPLAY_EXPOSURE_REFERENCE_ENERGY = 0.18;

const EMPTY_VISIBILITY = Object.freeze({
  activeModeCount: 0,
  totalProjectedSlotEnergy: 0,
  averageProjectedSlotEnergy: 0,
  peakProjectedSlotEnergy: 0,
  upperProjectedSlotEnergy: 0,
  projectedModalEnergy: 0,
  observationConfidence: 0,
  observableModalEnergy: 0,
  displayVisibility: 0,
});

function summarizeProjectedSlotEnergy(modeSlots, capacity) {
  const slotCount = Math.min(
    Math.max(0, capacity),
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  if (slotCount === 0) {
    return EMPTY_VISIBILITY;
  }

  const activeEnergies = [];
  let totalProjectedSlotEnergy = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const amplitude = clamp01(modeSlots[index * 4 + 3] ?? 0);
    if (amplitude <= 0) {
      continue;
    }

    const projectedEnergy = amplitude * amplitude;
    activeEnergies.push(projectedEnergy);
    totalProjectedSlotEnergy += projectedEnergy;
  }

  const activeModeCount = activeEnergies.length;
  if (activeModeCount === 0) {
    return EMPTY_VISIBILITY;
  }

  activeEnergies.sort((left, right) => right - left);
  const upperCount = Math.min(
    3,
    Math.max(1, Math.ceil(activeModeCount * 0.25)),
  );
  const upperProjectedSlotEnergy = activeEnergies
    .slice(0, upperCount)
    .reduce((total, energy) => total + energy, 0);

  return {
    activeModeCount,
    totalProjectedSlotEnergy: clamp01(totalProjectedSlotEnergy),
    averageProjectedSlotEnergy: clamp01(
      totalProjectedSlotEnergy / activeModeCount,
    ),
    peakProjectedSlotEnergy: activeEnergies[0] ?? 0,
    upperProjectedSlotEnergy: clamp01(upperProjectedSlotEnergy / upperCount),
  };
}

function mapObservableEnergyToDisplayVisibility(observableModalEnergy) {
  if (observableModalEnergy <= DEFAULT_RENDER_ENERGY_EPSILON) {
    return 0;
  }

  return clamp01(
    1 - Math.exp(-observableModalEnergy / DISPLAY_EXPOSURE_REFERENCE_ENERGY),
  );
}

/**
 * Converts the projected modal field into observer-qualified display exposure.
 *
 * Q is deliberately absent here. It already controls response bandwidth and
 * damping upstream; visibility depends only on current projected energy and
 * observation confidence.
 */
export function deriveModalVisibilityComponents({
  modeSlots,
  modeCapacity,
  projectedModalEnergy = 0,
  observationConfidence = 1,
  hardSilent = false,
}) {
  const slotEnergy = summarizeProjectedSlotEnergy(modeSlots, modeCapacity);
  if (hardSilent || slotEnergy.activeModeCount === 0) {
    return {
      ...EMPTY_VISIBILITY,
      ...slotEnergy,
    };
  }

  const normalizedProjectedModalEnergy = clamp01(projectedModalEnergy);
  if (normalizedProjectedModalEnergy <= DEFAULT_RENDER_ENERGY_EPSILON) {
    return {
      ...EMPTY_VISIBILITY,
      ...slotEnergy,
    };
  }

  const normalizedObservationConfidence = clamp01(observationConfidence);
  const observableModalEnergy = clamp01(
    normalizedProjectedModalEnergy * normalizedObservationConfidence,
  );
  const exposure = mapObservableEnergyToDisplayVisibility(
    observableModalEnergy,
  );

  return {
    ...slotEnergy,
    projectedModalEnergy: normalizedProjectedModalEnergy,
    observationConfidence: normalizedObservationConfidence,
    observableModalEnergy,
    displayVisibility: exposure,
  };
}
