import { abs, clamp, float, max, mix, pow, vec3 } from "three/tsl";
import {
  LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION,
  HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED,
  LASER_CAUSTIC_ACCENT_GAIN_SEED,
  LASER_CAUSTIC_COMPRESSION_KNEE_SEED,
  LASER_ENERGY_CORE_SATURATION_MIX,
  LASER_ENERGY_FRESNEL_EMISSION_GAIN,
  LASER_ENERGY_INTRINSIC_EMISSION_GAIN,
  REFERENCE_ABSORPTION_COEFFICIENT,
  REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
  REFERENCE_SCATTERING_COEFFICIENT,
} from "./observationTransfer.js";

/** GPU mirror of deriveBoundedCausticAccentAuthority. */
export function deriveBoundedCausticAccentAuthorityNode({
  totalIrradiance,
  zeroOrderIrradiance,
  zeroOrderPowerFraction,
  transportReady,
  compressionKnee = float(LASER_CAUSTIC_COMPRESSION_KNEE_SEED),
}) {
  const safeTotalIrradiance = max(totalIrradiance, float(0.0));
  const safeZeroOrderIrradiance = max(zeroOrderIrradiance, float(0.0));
  const safeZeroOrderPowerFraction = max(zeroOrderPowerFraction, float(1e-8));
  const safeCompressionKnee = max(compressionKnee, float(1e-8));
  const readiness = clamp(transportReady, float(0.0), float(1.0));
  const attenuatedStraightReference = safeZeroOrderIrradiance.div(
    safeZeroOrderPowerFraction,
  );
  const positiveCausticExcess = max(
    safeTotalIrradiance.sub(attenuatedStraightReference),
    float(0.0),
  );
  const compressedCausticExcess = positiveCausticExcess.div(
    positiveCausticExcess.add(safeCompressionKnee),
  );
  const connectedPeakResponse = compressedCausticExcess.mul(
    mix(
      float(LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION),
      float(1.0),
      compressedCausticExcess,
    ),
  );

  return {
    totalIrradiance: safeTotalIrradiance,
    zeroOrderIrradiance: safeZeroOrderIrradiance,
    zeroOrderPowerFraction: safeZeroOrderPowerFraction,
    attenuatedStraightReference,
    positiveCausticExcess,
    compressionKnee: safeCompressionKnee,
    compressedCausticExcess,
    connectedPeakResponse,
    readiness,
    accentAuthority: readiness.mul(connectedPeakResponse),
  };
}

/**
 * GPU mirror of deriveAcousticEnergyMaterialTransfer.
 * @param {{
 *   detectorIntegratedEnergy: any,
 *   coreDensity: any,
 *   sheathDensity: any,
 *   materialDensityScale?: any,
 *   carrierColumnDensityScale?: any,
 *   materialColor: any,
 *   surfaceColor?: any,
 *   scatteringCoefficient?: any,
 *   absorptionCoefficient?: any,
 *   laserExcitedEmissionCoefficient?: any,
 *   holographicIntensity?: any,
 *   holographicFresnelPower?: any,
 *   normalDotRay?: any,
 *   holographicBaseRadianceGain?: any,
 *   laserAccentAuthority?: any,
 *   laserAccentGain?: any,
 * }} args
 */
export function deriveAcousticEnergyMaterialTransferNode({
  detectorIntegratedEnergy,
  coreDensity,
  sheathDensity,
  materialDensityScale = float(1.0),
  carrierColumnDensityScale = float(1.0),
  materialColor,
  surfaceColor = vec3(1.0),
  scatteringCoefficient = float(REFERENCE_SCATTERING_COEFFICIENT),
  absorptionCoefficient = float(REFERENCE_ABSORPTION_COEFFICIENT),
  laserExcitedEmissionCoefficient = float(
    REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
  ),
  holographicIntensity = float(0.0),
  holographicFresnelPower = float(1.0),
  normalDotRay = float(1.0),
  holographicBaseRadianceGain = float(
    HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED,
  ),
  laserAccentAuthority = float(0.0),
  laserAccentGain = float(LASER_CAUSTIC_ACCENT_GAIN_SEED),
}) {
  const safeEnergy = max(detectorIntegratedEnergy, float(0.0));
  const safeCoreDensity = max(coreDensity, float(0.0));
  const safeSheathDensity = max(sheathDensity, float(0.0));
  const safeMaterialDensityScale = max(materialDensityScale, float(0.0));
  const safeCarrierColumnDensityScale = clamp(
    carrierColumnDensityScale,
    float(0.0),
    float(1.0),
  );
  const safeScatteringCoefficient = max(scatteringCoefficient, float(0.0));
  const safeAbsorptionCoefficient = max(absorptionCoefficient, float(0.0));
  const safeLaserExcitedEmissionCoefficient = max(
    laserExcitedEmissionCoefficient,
    float(0.0),
  );
  const organizedCoreDensity = safeCoreDensity
    .mul(safeEnergy)
    .mul(safeMaterialDensityScale)
    .mul(safeCarrierColumnDensityScale);
  const organizedSheathDensity = safeSheathDensity
    .mul(safeEnergy)
    .mul(safeMaterialDensityScale)
    .mul(safeCarrierColumnDensityScale);
  const organizedDensity = organizedCoreDensity.add(organizedSheathDensity);
  const sigmaS = organizedDensity.mul(safeScatteringCoefficient);
  const sigmaA = organizedDensity.mul(safeAbsorptionCoefficient);
  const extinction = sigmaS.add(sigmaA);
  const emissionSourceStrength = organizedDensity.mul(
    safeLaserExcitedEmissionCoefficient,
  );
  const coreEmissionSourceStrength = organizedCoreDensity.mul(
    safeLaserExcitedEmissionCoefficient,
  );
  const sheathEmissionSourceStrength = organizedSheathDensity.mul(
    safeLaserExcitedEmissionCoefficient,
  );
  const safeMaterialColor = max(materialColor, vec3(0.0));
  const safeSurfaceColor = max(surfaceColor, vec3(0.0));
  const safeHolographicBaseRadianceGain = max(
    holographicBaseRadianceGain,
    float(0.0),
  );
  const safeLaserAccentAuthority = clamp(
    laserAccentAuthority,
    float(0.0),
    float(1.0),
  );
  const safeLaserAccentGain = max(laserAccentGain, float(0.0));
  const safeNormalDotRay = clamp(abs(normalDotRay), float(0.0), float(1.0));
  const safeHolographicIntensity = clamp(
    holographicIntensity,
    float(0.0),
    float(1.0),
  );
  const safeHolographicFresnelPower = max(holographicFresnelPower, float(0.01));
  const fresnelBase = clamp(
    pow(float(1.0).sub(safeNormalDotRay), safeHolographicFresnelPower),
    float(0.0),
    float(1.0),
  );
  const holographicFresnel = fresnelBase.mul(safeHolographicIntensity);
  const coreEmissionColor = mix(
    safeMaterialColor,
    vec3(1.0),
    float(LASER_ENERGY_CORE_SATURATION_MIX),
  );
  const fresnelEmissionColor = safeSurfaceColor;
  const intrinsicEmissionRadiance = coreEmissionColor
    .mul(coreEmissionSourceStrength)
    .add(safeMaterialColor.mul(sheathEmissionSourceStrength));
  const fresnelEmissionSourceStrength = emissionSourceStrength
    .mul(holographicFresnel)
    .mul(float(LASER_ENERGY_FRESNEL_EMISSION_GAIN));
  const fresnelEmissionRadiance = fresnelEmissionColor.mul(
    fresnelEmissionSourceStrength,
  );
  const baseRadiance = intrinsicEmissionRadiance
    .mul(float(LASER_ENERGY_INTRINSIC_EMISSION_GAIN))
    .add(fresnelEmissionRadiance)
    .mul(safeHolographicBaseRadianceGain);
  const accentRadiance = baseRadiance
    .mul(safeLaserAccentGain)
    .mul(safeLaserAccentAuthority);

  return {
    detectorIntegratedEnergy: safeEnergy,
    coreDensity: safeCoreDensity,
    sheathDensity: safeSheathDensity,
    materialDensityScale: safeMaterialDensityScale,
    carrierColumnDensityScale: safeCarrierColumnDensityScale,
    organizedCoreDensity,
    organizedSheathDensity,
    organizedDensity,
    scatteringCoefficient: safeScatteringCoefficient,
    absorptionCoefficient: safeAbsorptionCoefficient,
    laserExcitedEmissionCoefficient: safeLaserExcitedEmissionCoefficient,
    sigmaS,
    sigmaA,
    extinction,
    emissionSourceStrength,
    coreEmissionSourceStrength,
    sheathEmissionSourceStrength,
    normalDotRay: safeNormalDotRay,
    holographicIntensity: safeHolographicIntensity,
    holographicFresnelPower: safeHolographicFresnelPower,
    fresnelBase,
    holographicFresnel,
    coreEmissionColor,
    fresnelEmissionColor,
    intrinsicEmissionRadiance,
    fresnelEmissionSourceStrength,
    fresnelEmissionRadiance,
    holographicBaseRadianceGain: safeHolographicBaseRadianceGain,
    laserAccentAuthority: safeLaserAccentAuthority,
    laserAccentGain: safeLaserAccentGain,
    baseRadiance,
    accentRadiance,
    sourceRadiance: baseRadiance.add(accentRadiance),
  };
}

// Acoustic energy material transfer node owner end.
