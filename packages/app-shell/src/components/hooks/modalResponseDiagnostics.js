function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function readRenderFacingModalResponseEnergy(featureFrame = null) {
  return clamp01(
    Math.max(
      readFiniteNumber(featureFrame?.modalResponseEnergy, 0),
      readFiniteNumber(featureFrame?.modalResponseRenderEnergy, 0),
      readFiniteNumber(featureFrame?.modalResponseRenderSourceCoupledEnergy, 0),
      readFiniteNumber(featureFrame?.modalResponseRenderResonantEnergy, 0),
      readFiniteNumber(featureFrame?.debug?.modalResponseEnergy, 0),
      readFiniteNumber(featureFrame?.debug?.modalResponseRenderEnergy, 0),
    ),
  );
}
