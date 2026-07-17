import { MODAL_BASIS_ATLAS_PAGE_CAPACITY } from "../../core/modalBudgets.js";
import { clamp01, smoothstep } from "../math.js";

const SPECTRAL_PARTICIPATION_LOAD_START = MODAL_BASIS_ATLAS_PAGE_CAPACITY * 0.5;
const SPECTRAL_PARTICIPATION_LOAD_FULL = MODAL_BASIS_ATLAS_PAGE_CAPACITY * 1.5;
const SPECTRAL_PARTICIPATION_SPARSE_END = MODAL_BASIS_ATLAS_PAGE_CAPACITY * 2;

export function deriveHighQSparseResonatorEvidence({
  highQObservedSnr = 0,
  highQObservedCoherence = 0,
  highQObservedDrive = 0,
  highQRingSupport = 0,
  highQResonantEnergy = 0,
  distributedExcitation = 0,
  periodicity = 0,
  spectralEffectiveBinCount = 0,
  modeCoherence = 0,
} = {}) {
  const observedSnr = clamp01(highQObservedSnr);
  const observedCoherence = clamp01(highQObservedCoherence);
  const observedDrive = clamp01(highQObservedDrive);
  const ringSupport = clamp01(highQRingSupport);
  const retainedEnergy = clamp01(highQResonantEnergy);
  const distribution = clamp01(distributedExcitation);
  const periodic = clamp01(periodicity);
  const coherence = clamp01(Math.max(modeCoherence, observedCoherence));
  const binCount = Math.max(0, spectralEffectiveBinCount ?? 0);

  const projectionLoad = clamp01(
    smoothstep(
      SPECTRAL_PARTICIPATION_LOAD_START,
      SPECTRAL_PARTICIPATION_LOAD_FULL,
      binCount,
    ) *
      0.38 +
      smoothstep(0.38, 0.58, distribution) * 0.32 +
      (1 - smoothstep(0.26, 0.48, observedSnr)) * 0.14 +
      (1 - smoothstep(0.004, 0.018, observedDrive)) * 0.08 +
      (1 - smoothstep(0.42, 0.66, periodic)) * 0.08,
  );

  const sparseSpectrumEvidence =
    (1 -
      smoothstep(
        SPECTRAL_PARTICIPATION_LOAD_START,
        SPECTRAL_PARTICIPATION_SPARSE_END,
        binCount,
      )) *
    (1 - smoothstep(0.62, 0.9, distribution) * 0.32) *
    Math.max(
      smoothstep(0.3, 0.5, coherence) *
        smoothstep(0.006, 0.028, retainedEnergy),
      smoothstep(0.18, 0.5, ringSupport) *
        smoothstep(0.012, 0.04, retainedEnergy) *
        smoothstep(0.2, 0.44, coherence),
    );
  const perModeEvidence =
    smoothstep(0.46, 0.64, observedSnr) *
    smoothstep(0.56, 0.72, observedCoherence);
  const driveEvidence =
    smoothstep(0.006, 0.025, observedDrive) *
    smoothstep(0.16, 0.45, ringSupport) *
    smoothstep(0.42, 0.7, coherence);
  const ringEvidence =
    smoothstep(0.12, 0.36, ringSupport) *
    smoothstep(0.52, 0.74, coherence) *
    smoothstep(0.16, 0.52, periodic);
  const rawEvidence = Math.max(
    sparseSpectrumEvidence,
    perModeEvidence,
    driveEvidence,
    ringEvidence,
  );
  const energyGate = smoothstep(0.001, 0.014, retainedEnergy);
  const highQSparseResonatorEvidence = clamp01(rawEvidence * energyGate);

  return {
    highQSparseResonatorEvidence,
    highQProjectionLoad: projectionLoad,
  };
}
