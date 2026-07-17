import { abs, clamp, dot, float, length, max } from "three/tsl";
import { CYMATIC_CARRIER_REFERENCE_PROFILE } from "./fieldShaping.js";

const GAUSSIAN_FWHM_EXPONENT = 4 * Math.LN2;
const GAUSSIAN_UNIT_AREA_SCALE = 2 * Math.sqrt(Math.LN2 / Math.PI);
const GAUSSIAN_CDF_SCALE = 2 * Math.sqrt(Math.LN2);
const ERROR_FUNCTION_P = 0.3275911;
const ERROR_FUNCTION_COEFFICIENTS = Object.freeze([
  1.061405429, -1.453152027, 1.421413741, -0.284496736, 0.254829592,
]);

function approximateErrorFunctionNode(value) {
  const magnitude = abs(value);
  const t = float(1.0).div(
    float(1.0).add(magnitude.mul(float(ERROR_FUNCTION_P))),
  );
  const polynomial = t
    .mul(float(ERROR_FUNCTION_COEFFICIENTS[0]))
    .add(float(ERROR_FUNCTION_COEFFICIENTS[1]))
    .mul(t)
    .add(float(ERROR_FUNCTION_COEFFICIENTS[2]))
    .mul(t)
    .add(float(ERROR_FUNCTION_COEFFICIENTS[3]))
    .mul(t)
    .add(float(ERROR_FUNCTION_COEFFICIENTS[4]))
    .mul(t);
  const approximation = float(1.0).sub(
    polynomial.mul(magnitude.mul(magnitude).negate().exp()),
  );
  const sign = value.lessThan(float(0.0)).select(float(-1.0), float(1.0));
  return sign.mul(approximation);
}

function deriveNormalizedGaussianIntervalAverageNode({
  localFieldDistance,
  intervalWidthWorld,
  fwhmWorld,
}) {
  const safeFwhmWorld = max(fwhmWorld, float(1e-6));
  const halfInterval = intervalWidthWorld.mul(float(0.5));
  const cdfScale = float(GAUSSIAN_CDF_SCALE).div(safeFwhmWorld);
  const upper = localFieldDistance.add(halfInterval).mul(cdfScale);
  const lower = localFieldDistance.sub(halfInterval).mul(cdfScale);
  const intervalEnergy = clamp(
    approximateErrorFunctionNode(upper)
      .sub(approximateErrorFunctionNode(lower))
      .mul(float(0.5)),
    float(0.0),
    float(1.0),
  );
  const normalizedDistance = localFieldDistance.div(safeFwhmWorld);
  const pointProfile = float(GAUSSIAN_UNIT_AREA_SCALE)
    .div(safeFwhmWorld)
    .mul(
      normalizedDistance
        .mul(normalizedDistance)
        .mul(float(-GAUSSIAN_FWHM_EXPONENT))
        .exp(),
    );

  return intervalWidthWorld
    .greaterThan(float(1e-6))
    .select(intervalEnergy.div(intervalWidthWorld), pointProfile);
}

/**
 * GPU mirror of deriveFixedWorldSpaceCarrierDensity.
 *
 * The field value and gradient must be the matched linear tuple. The returned
 * core, sheath, and summed densities have inverse-world-length semantics.
 * The absolute view cosine integrates each fixed world-space profile over the
 * current ray interval and is also returned for the separate Fresnel-emission
 * lane. It never changes carrier density or extinction after sampling.
 */
export function deriveFixedWorldSpaceCarrierDensityNode({
  fieldValue,
  gradient,
  rayDirLocal,
  stepSize,
  coreFwhmWorld,
}) {
  const gradientMagnitude = length(gradient);
  const gradientEpsilon = float(
    CYMATIC_CARRIER_REFERENCE_PROFILE.gradientEpsilon,
  );
  const gradientNormal = gradient.div(max(gradientMagnitude, gradientEpsilon));
  const localFieldDistance = abs(fieldValue).div(
    max(gradientMagnitude, gradientEpsilon),
  );
  const normalDotRay = abs(dot(gradientNormal, rayDirLocal));
  const intervalWidthWorld = max(stepSize, float(0.0)).mul(normalDotRay);
  const safeCoreFwhmWorld = max(coreFwhmWorld, float(1e-6));
  const sheathFwhmWorld = safeCoreFwhmWorld.mul(
    float(CYMATIC_CARRIER_REFERENCE_PROFILE.sheathWidthRatio),
  );
  const totalEnergyWeight =
    CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight +
    CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight;
  const coreEnergyFraction =
    CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight / totalEnergyWeight;
  const sheathEnergyFraction =
    CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight / totalEnergyWeight;
  const coreDensity = deriveNormalizedGaussianIntervalAverageNode({
    localFieldDistance,
    intervalWidthWorld,
    fwhmWorld: safeCoreFwhmWorld,
  }).mul(float(coreEnergyFraction));
  const sheathDensity = deriveNormalizedGaussianIntervalAverageNode({
    localFieldDistance,
    intervalWidthWorld,
    fwhmWorld: sheathFwhmWorld,
  }).mul(float(sheathEnergyFraction));
  const carrierDensity = coreDensity.add(sheathDensity);

  // The epsilon is solely a denominator guard. Degenerate critical points do
  // not gain a synthetic luminous surface from the guard value.
  const carrierValid = gradientMagnitude.greaterThan(gradientEpsilon);
  const validCoreDensity = carrierValid.select(coreDensity, float(0.0));
  const validSheathDensity = carrierValid.select(sheathDensity, float(0.0));
  const validCarrierDensity = carrierValid.select(carrierDensity, float(0.0));

  return {
    coreDensity: validCoreDensity,
    sheathDensity: validSheathDensity,
    carrierDensity: validCarrierDensity,
    normalDotRay,
  };
}

// Fixed world-space carrier density node owner end.
