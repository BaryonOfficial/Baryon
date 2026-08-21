import { buildModalExcitationAtlas } from "../utils/audio/modalExcitationAtlas.js";
import { FAST_MODAL_DRIVE_PROBE_LIMIT } from "../utils/audio/fastModalDriveEstimator.js";
import { clamp01 } from "../utils/math.js";

/**
 * Build the committed topology used by the isolated fast-modal benchmark.
 *
 * Mode identity, frequency, source coupling, and loaded Q all come from the
 * production apparatus owner. Benchmark-only drive weights are projections of
 * those same source-coupling quantities, so the fixture cannot silently drift
 * behind a new committed-mode contract.
 */
export function createFastModalBenchmarkCommittedModes({
  radius = 3,
  modeCount = FAST_MODAL_DRIVE_PROBE_LIMIT,
} = {}) {
  const resolvedModeCount = Math.max(1, Math.floor(modeCount));
  const atlas = buildModalExcitationAtlas({ radius });
  if (atlas.length < resolvedModeCount) {
    throw new RangeError(
      `Fast-modal benchmark requires ${resolvedModeCount} apparatus modes; atlas supplied ${atlas.length}.`,
    );
  }

  return atlas.slice(0, resolvedModeCount).map((mode) => ({
    ...mode,
    targetEnergy: Math.max(0, mode.sourceCouplingEnergy ?? 0),
    physicalTransfer: clamp01(mode.sourceCouplingAmplitude),
  }));
}
