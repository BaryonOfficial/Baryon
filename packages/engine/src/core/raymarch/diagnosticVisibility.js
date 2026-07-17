import { deriveObservationTransfer } from "./observationTransfer.js";
import { clamp01 } from "../../utils/math.js";

function readPositiveFinite(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function deriveRaymarchDiagnosticVisibility({
  rawDensityEstimate = 0,
  observationAnchor = 0,
  ridgeAnchor = observationAnchor,
  signedRadianceAuthority = 1,
  modalCoefficientEnergy = 0,
  stepBudget = 48,
  spectralFlux = 0,
  parameters = null,
} = {}) {
  const safeRawDensity = clamp01(rawDensityEstimate);
  const safeObservationAnchor = clamp01(observationAnchor);
  const safeSignedRadianceAuthority = clamp01(signedRadianceAuthority);
  const diagnosticSupport = safeObservationAnchor * safeSignedRadianceAuthority;
  const supportedPhysicalDensity = safeRawDensity * diagnosticSupport;
  const observationTransfer = deriveObservationTransfer({
    density: supportedPhysicalDensity,
    modalStructureAnchor: safeObservationAnchor,
    ridgeAnchor,
    signedRadianceAuthority: safeSignedRadianceAuthority,
    modalCoefficientEnergy,
    parameters,
  });
  const avgDensity = clamp01(observationTransfer.observationDensity);
  const safeStepBudget = readPositiveFinite(stepBudget, 48);
  const safeSpectralFlux = Math.max(
    0,
    Number.isFinite(spectralFlux) ? spectralFlux : 0,
  );
  const avgOpacity = clamp01(
    avgDensity * (safeStepBudget / 48) * (0.8 + safeSpectralFlux * 0.12),
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
