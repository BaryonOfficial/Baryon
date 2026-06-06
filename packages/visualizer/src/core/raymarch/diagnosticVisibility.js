import { deriveObservationTransfer } from "./observationTransfer.js";

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function readPositiveFinite(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function deriveRaymarchDiagnosticVisibility({
  rawDensityEstimate = 0,
  observationAnchor = 0,
  ridgeAnchor = observationAnchor,
  signedRadianceAuthority = 1,
  modalCoefficientEnergy = 0,
  modalResponseEnergy = 0,
  opacityGain = 1,
  stepBudget = 48,
  spectralFlux = 0,
  parameters = null,
} = {}) {
  const safeRawDensity = clamp01(rawDensityEstimate);
  const safeObservationAnchor = clamp01(observationAnchor);
  const safeSignedRadianceAuthority = clamp01(signedRadianceAuthority);
  const diagnosticSupport =
    safeObservationAnchor * safeSignedRadianceAuthority;
  const supportedPhysicalDensity = safeRawDensity * diagnosticSupport;
  const observationTransfer = deriveObservationTransfer({
    density: supportedPhysicalDensity,
    modalStructureAnchor: safeObservationAnchor,
    ridgeAnchor,
    signedRadianceAuthority: safeSignedRadianceAuthority,
    modalCoefficientEnergy,
    modalResponseEnergy,
    parameters,
  });
  const avgDensity = clamp01(observationTransfer.observationDensity);
  const safeOpacityGain = readPositiveFinite(opacityGain, 1);
  const safeStepBudget = readPositiveFinite(stepBudget, 48);
  const safeSpectralFlux = Math.max(
    0,
    Number.isFinite(spectralFlux) ? spectralFlux : 0,
  );
  const avgOpacity = clamp01(
    avgDensity *
      safeOpacityGain *
      (safeStepBudget / 48) *
      (0.8 + safeSpectralFlux * 0.12),
  );

  return {
    avgDensity,
    avgOpacity,
    rawDensityEstimate: safeRawDensity,
    diagnosticSupport,
    supportedPhysicalDensity,
    observationTransfer,
  };
}
