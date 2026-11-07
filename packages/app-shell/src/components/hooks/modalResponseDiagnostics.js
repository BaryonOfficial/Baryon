// Raw amplitude-squared observation; presentation summaries cannot replace it.
export function readObservedResponseEnergy(frame = null) {
  const energy = frame?.observation?.normalizationEnergy;
  return Number.isFinite(energy) && energy >= 0 ? energy : 0;
}
