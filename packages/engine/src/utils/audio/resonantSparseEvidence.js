import { clamp01, smoothstep } from "../math.js";

// Thresholds on `spectralEffectiveBinCount`, the participation-style count of
// FFT bins actually carrying energy. That is a property of the incoming signal:
// a solo voice occupies a handful of bins, a full mix occupies dozens, and
// neither fact depends on how many modes this machine can afford to render.
// These were previously derived from a render-side modal budget,
// which made buying GPU headroom silently redefine what counts as dense music —
// raising that budget alone shifted dense mixes back toward "sparse" and
// weakened resonant evidence. Absolute bin counts, calibrated against the
// synthesized-signal cases in buildFeatureFrame.test.js.
const SPECTRAL_PARTICIPATION_LOAD_START = 6;
const SPECTRAL_PARTICIPATION_LOAD_FULL = 18;
const SPECTRAL_PARTICIPATION_SPARSE_END = 24;

export function deriveResonantSparseEvidence({
  resonantObservedSnr = 0,
  resonantObservedCoherence = 0,
  resonantObservedDrive = 0,
  resonantRingSupport = 0,
  resonantObservationConfidence = 0,
  distributedExcitation = 0,
  periodicity = 0,
  spectralEffectiveBinCount = 0,
  modeCoherence = 0,
} = {}) {
  const observedSnr = clamp01(resonantObservedSnr);
  const observedCoherence = clamp01(resonantObservedCoherence);
  const observedDrive = clamp01(resonantObservedDrive);
  const ringSupport = clamp01(resonantRingSupport);
  const observationConfidence = clamp01(resonantObservationConfidence);
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
        smoothstep(0.006, 0.028, observationConfidence),
      smoothstep(0.18, 0.5, ringSupport) *
        smoothstep(0.012, 0.04, observationConfidence) *
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
  const confidenceGate = smoothstep(0.001, 0.014, observationConfidence);
  const resonantSparseEvidence = clamp01(rawEvidence * confidenceGate);

  return {
    resonantSparseEvidence,
    resonantProjectionLoad: projectionLoad,
  };
}
