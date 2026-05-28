import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import { deriveStepCompensation } from "./stepStability.js";

export const OBSERVATION_TRANSFER_REFERENCE = Object.freeze({
  referenceRaymarchSteps: RAYMARCH_DEFAULTS.raymarchSteps,
  referenceOpacityGain: RAYMARCH_DEFAULTS.opacityGain,
  referenceContourSharpness: RAYMARCH_DEFAULTS.contourSharpness,
  referenceStepCompensation: deriveStepCompensation(
    RAYMARCH_DEFAULTS.raymarchSteps,
  ),
  densityFadeStart: 0.22,
  densityFadeEnd: 0.34,
  transferGain: 2.2,
  densityFloor: 0.22,
  contourSupportScale: 0.035,
  minExposureScale: 0.45,
  maxExposureScale: 2.25,
  maxFieldNoiseFloor: 0.12,
  minDensityFadeStart: 0.04,
  maxDensityFadeStart: 0.42,
  minDensityFadeWidth: 0.03,
  maxDensityFadeEnd: 0.62,
  minDensityFloor: 0.035,
  maxDensityFloor: 0.36,
  minContourSupportScale: 0.006,
  maxContourSupportScale: 0.06,
  modalResponseUnitEnergy: 1,
  epsilon: 1e-4,
});

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

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function deriveObservationTransferParameters({
  opacityGain = OBSERVATION_TRANSFER_REFERENCE.referenceOpacityGain,
  stepCompensation = OBSERVATION_TRANSFER_REFERENCE.referenceStepCompensation,
  contourSharpness = OBSERVATION_TRANSFER_REFERENCE.referenceContourSharpness,
  fieldNoiseFloor = 0,
  modalResponseUnitEnergy = OBSERVATION_TRANSFER_REFERENCE.modalResponseUnitEnergy,
} = {}) {
  const safeOpacityGain = readPositiveFinite(
    opacityGain,
    OBSERVATION_TRANSFER_REFERENCE.referenceOpacityGain,
  );
  const safeStepCompensation = readPositiveFinite(
    stepCompensation,
    OBSERVATION_TRANSFER_REFERENCE.referenceStepCompensation,
  );
  const safeContourSharpness = readPositiveFinite(
    contourSharpness,
    OBSERVATION_TRANSFER_REFERENCE.referenceContourSharpness,
  );
  const safeModalResponseUnitEnergy = readPositiveFinite(
    modalResponseUnitEnergy,
    OBSERVATION_TRANSFER_REFERENCE.modalResponseUnitEnergy,
  );
  const safeFieldNoiseFloor = clamp(
    Math.max(0, Number.isFinite(fieldNoiseFloor) ? fieldNoiseFloor : 0),
    0,
    OBSERVATION_TRANSFER_REFERENCE.maxFieldNoiseFloor,
  );
  const exposureScale = clamp(
    (safeOpacityGain / OBSERVATION_TRANSFER_REFERENCE.referenceOpacityGain) *
      (safeStepCompensation /
        OBSERVATION_TRANSFER_REFERENCE.referenceStepCompensation),
    OBSERVATION_TRANSFER_REFERENCE.minExposureScale,
    OBSERVATION_TRANSFER_REFERENCE.maxExposureScale,
  );
  const densityFadeStart = clamp(
    Math.max(
      OBSERVATION_TRANSFER_REFERENCE.densityFadeStart / exposureScale,
      safeFieldNoiseFloor * 1.8,
    ),
    OBSERVATION_TRANSFER_REFERENCE.minDensityFadeStart,
    OBSERVATION_TRANSFER_REFERENCE.maxDensityFadeStart,
  );
  const densityFadeEnd = clamp(
    Math.max(
      OBSERVATION_TRANSFER_REFERENCE.densityFadeEnd / exposureScale,
      densityFadeStart + safeFieldNoiseFloor * 1.4 + 0.04,
    ),
    densityFadeStart + OBSERVATION_TRANSFER_REFERENCE.minDensityFadeWidth,
    OBSERVATION_TRANSFER_REFERENCE.maxDensityFadeEnd,
  );
  const targetUnitSupport =
    1 - Math.exp(-OBSERVATION_TRANSFER_REFERENCE.transferGain);
  const transferGain =
    -Math.log(1 - targetUnitSupport) /
    Math.max(
      safeModalResponseUnitEnergy,
      OBSERVATION_TRANSFER_REFERENCE.epsilon,
    );
  const densityFloor = clamp(
    Math.max(
      OBSERVATION_TRANSFER_REFERENCE.densityFloor,
      safeFieldNoiseFloor * 2.2,
    ),
    OBSERVATION_TRANSFER_REFERENCE.minDensityFloor,
    OBSERVATION_TRANSFER_REFERENCE.maxDensityFloor,
  );
  const contourSupportScale = clamp(
    densityFloor *
      (OBSERVATION_TRANSFER_REFERENCE.contourSupportScale /
        OBSERVATION_TRANSFER_REFERENCE.densityFloor) *
      Math.sqrt(
        OBSERVATION_TRANSFER_REFERENCE.referenceContourSharpness /
          Math.max(safeContourSharpness, 1),
      ),
    OBSERVATION_TRANSFER_REFERENCE.minContourSupportScale,
    OBSERVATION_TRANSFER_REFERENCE.maxContourSupportScale,
  );

  return {
    densityFadeStart,
    densityFadeEnd,
    transferGain,
    densityFloor,
    contourSupportScale,
    exposureScale,
    fieldNoiseFloor: safeFieldNoiseFloor,
  };
}

function resolveObservationTransferParameters(parameters) {
  if (parameters) {
    return {
      ...deriveObservationTransferParameters(),
      ...parameters,
    };
  }
  return deriveObservationTransferParameters();
}

/**
 * Map modal field evidence into visible density and contour support.
 *
 * Contract (see whitepaper Observation Transfer):
 * - Density anchor = modalStructureAnchor × signedRadianceAuthority only.
 *   Ridge does not enter the anchor so support-only caustics cannot bypass
 *   signed cancellation.
 * - Ridge scales observedContourSupport only.
 * - Support uses sqrt(max(coefficient, response)) inside exp(−G·R), not
 *   linear energy × anchor in the exponent.
 */
export function deriveObservationTransfer({
  density = 0,
  modalStructureAnchor = 0,
  ridgeAnchor = 0,
  signedRadianceAuthority = 1,
  modalCoefficientEnergy = 0,
  modalResponseEnergy = 0,
  parameters = null,
} = {}) {
  const observationParameters =
    resolveObservationTransferParameters(parameters);
  const safeDensity = Math.max(0, Number.isFinite(density) ? density : 0);
  const physicalVisibilityGate = smoothstep(
    observationParameters.densityFadeStart,
    observationParameters.densityFadeEnd,
    safeDensity,
  );
  const physicalVisibleDensity = safeDensity * physicalVisibilityGate;
  const contourRidgeAnchor = clamp01(ridgeAnchor);
  const observationAnchor = clamp01(
    clamp01(modalStructureAnchor) * clamp01(signedRadianceAuthority),
  );
  const observationEnergy = clamp01(
    Math.max(modalCoefficientEnergy, modalResponseEnergy),
  );
  const observationResponse =
    observationEnergy > 0 ? Math.sqrt(observationEnergy) : 0;
  const observationSupport = clamp01(
    1 - Math.exp(-observationParameters.transferGain * observationResponse),
  );
  const observedDensityFloor =
    observationParameters.densityFloor * observationSupport * observationAnchor;
  const observedContourSupport =
    observationParameters.contourSupportScale *
    observationSupport *
    observationAnchor *
    contourRidgeAnchor;

  return {
    physicalVisibilityGate,
    physicalVisibleDensity,
    observationAnchor,
    observationEnergy,
    observationResponse,
    observationSupport,
    observedDensityFloor,
    observedContourSupport,
    visibleDensity: Math.max(physicalVisibleDensity, observedDensityFloor),
  };
}
