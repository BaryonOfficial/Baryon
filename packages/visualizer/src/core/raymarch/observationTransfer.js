export const OBSERVATION_TRANSFER_DEFAULTS = Object.freeze({
  lowDensityFadeStart: 0.22,
  lowDensityFadeEnd: 0.34,
  transferGain: 2.2,
  densityFloor: 0.22,
  contourSupportScale: 0.035,
});

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function deriveObservationTransfer({
  density = 0,
  fieldGradientMagnitude = 0,
  modalStructureAnchor = 0,
  ridgeAnchor = 0,
  ridgeSupportAnchor = 0,
  modalCoefficientEnergy = 0,
  modalResponseBackboneEnergy = 0,
  modalResponseDetailEnergy = 0,
  hardSilence = false,
} = {}) {
  const safeDensity = Math.max(0, Number.isFinite(density) ? density : 0);
  const physicalVisibilityGate = smoothstep(
    OBSERVATION_TRANSFER_DEFAULTS.lowDensityFadeStart,
    OBSERVATION_TRANSFER_DEFAULTS.lowDensityFadeEnd,
    safeDensity,
  );
  const physicalVisibleDensity = safeDensity * physicalVisibilityGate;
  const ridgePhysicalAnchor = Math.max(
    clamp01(ridgeAnchor),
    clamp01(ridgeSupportAnchor),
    clamp01(fieldGradientMagnitude),
  );
  const observationAnchor = clamp01(
    clamp01(modalStructureAnchor) * ridgePhysicalAnchor,
  );
  const observationEnergy = hardSilence
    ? 0
    : clamp01(
        Math.max(
          modalCoefficientEnergy,
          modalResponseBackboneEnergy,
          modalResponseDetailEnergy,
        ),
      );
  const observationSupport = clamp01(
    1 -
      Math.exp(
        -OBSERVATION_TRANSFER_DEFAULTS.transferGain *
          observationEnergy *
          observationAnchor,
      ),
  );
  const observedDensityFloor =
    OBSERVATION_TRANSFER_DEFAULTS.densityFloor *
    observationSupport *
    observationAnchor;
  const observedContourSupport =
    OBSERVATION_TRANSFER_DEFAULTS.contourSupportScale *
    observationSupport *
    clamp01(ridgeAnchor);

  return {
    physicalVisibilityGate,
    physicalVisibleDensity,
    observationAnchor,
    observationEnergy,
    observationSupport,
    observedDensityFloor,
    observedContourSupport,
    visibleDensity: Math.max(physicalVisibleDensity, observedDensityFloor),
  };
}
