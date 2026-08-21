import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import { clamp01 } from "../math.js";
import { requireModalQualityFactor } from "./modalDamping.js";

function readCandidateForcingEnergy(entry) {
  return clamp01(
    entry.forcingEnergy ??
      entry.currentDriveEnergy ??
      entry.observedDrive ??
      entry.driveEnergy ??
      0,
  );
}

function readCandidateObservedSupport(entry, forcingEnergy) {
  const phaseAuthority =
    entry.modalOscillatorPhaseAuthority ?? entry.phaseAuthority ?? 0;
  const phaseCoherence =
    entry.modalOscillatorPhaseCoherence ?? entry.phaseCoherence ?? 0;

  return clamp01(
    Math.max(
      entry.observedSupport ?? 0,
      entry.coherence ?? 0,
      phaseAuthority,
      phaseCoherence,
      forcingEnergy,
    ),
  );
}

function createModalCandidate(entry) {
  const source = entry ?? {};
  const modeKey =
    source.modeKey ?? buildModalTopologyModeKey(source.u, source.v, source.w);
  const qualityFactor = requireModalQualityFactor(
    source.qualityFactor,
    `Modal candidate ${modeKey}`,
  );
  const forcingEnergy = readCandidateForcingEnergy(source);

  return {
    modeKey,
    u: source.u ?? 0,
    v: source.v ?? 0,
    w: source.w ?? 0,
    naturalFrequencyHz: source.naturalFrequencyHz ?? 0,
    qualityFactor,
    dampingRatio: 1 / (2 * qualityFactor),
    forcingEnergy,
    observedSupport: readCandidateObservedSupport(source, forcingEnergy),
  };
}

/**
 * Translate current and retained modal entries into the canonical candidate
 * metadata state consumed by continuity and exact-drive projection.
 */
export function buildModalCandidateState(...entryGroups) {
  const candidateState = new Map();
  for (const entries of entryGroups) {
    for (const entry of entries ?? []) {
      const candidate = createModalCandidate(entry);
      candidateState.set(candidate.modeKey, candidate);
    }
  }
  return candidateState;
}
