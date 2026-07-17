import {
  RAYMARCH_AVERAGE_AMPLITUDE_SHADER_REFERENCE,
  RAYMARCH_DEFAULTS,
} from "../../defaults.js";
import { deriveStepCompensation } from "./stepStability.js";
import { clamp, clamp01, smoothstep } from "../../utils/math.js";

/** Search seed only. The accepted base gain is evidence-selected. */
export const HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED = 2 ** -8;
// Live 528 Hz sweep on 2026-07-16 (headless capture fixed by use-angle=metal):
// steps 14-19 all pass the promoted anti-black/anti-wash/near-white gates;
// step 20 (gain 4) fails the near-white share and steps >=22 wash out and
// fail scene-linear headroom. Step 17 remains inside the passing bracket and
// shifts radiance into the continuous base so the selected caustic lane can
// remain a quiet modulation.
export const HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_STEP_INDEX = 17;
export const HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN =
  HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED *
  2 ** (HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_STEP_INDEX / 2);

/**
 * A bounded excitation modulation over the continuous emissive field. At
 * maximum authority it contributes twenty percent of calibrated base
 * emission, so transport can articulate the field without becoming
 * a second spotted-lighting owner. Not a public control.
 */
export const LASER_CAUSTIC_ACCENT_GAIN_SEED = 0.2;

/** Relative-irradiance excess at which the compressed response reaches one half. */
export const LASER_CAUSTIC_COMPRESSION_KNEE_SEED = 0.1;

/**
 * Fraction of first-order response retained as compressed excess approaches
 * zero. This is not an additive floor: authority still reaches exactly zero
 * with caustic excess. Blending toward the full response as excess rises
 * keeps neighboring mid-energy transport connected while avoiding the
 * isolated, overdriven peaks produced by a squared response.
 */
export const LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION = 0.75;

/**
 * Dimensionless reference volume-scattering interaction coefficient.
 * Together with absorption this gives a reference extinction of 0.18 per
 * normalized cavity length when organizedDensity is one.
 */
export const REFERENCE_SCATTERING_COEFFICIENT = 0.16;

/** Dimensionless reference absorption interaction coefficient. */
export const REFERENCE_ABSORPTION_COEFFICIENT = 0.02;

/**
 * Scene-linear radiance emitted per unit organized carrier density and per
 * normalized path length. This is the first-class laser-excited emission
 * coefficient; it is intentionally independent of scattering and view angle.
 */
export const REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT = 0.05;

/** Fixed white-point mix for the narrow, high-energy carrier core. */
export const LASER_ENERGY_CORE_SATURATION_MIX = 0.04;

/** Keeps face-on carrier support present but subordinate to grazing energy. */
export const LASER_ENERGY_INTRINSIC_EMISSION_GAIN = 0.45;

/** Maximum additive grazing-angle emission relative to intrinsic emission. */
export const LASER_ENERGY_FRESNEL_EMISSION_GAIN = 3.2;

/**
 * Relative scene-linear irradiance of the fixed unit-flood laser field.
 * Transport samples use the same relative irradiance unit.
 */
export const REFERENCE_INCIDENT_LASER_IRRADIANCE = 1;

/**
 * Energy-weighted RMS spatial wavenumber (mode-index units) at which the
 * carrier column density matches the calibrated reference apparatus. A ray
 * through the cavity crosses nodal sheets at a rate proportional to the RMS
 * wavenumber (Rice's formula), and each crossing deposits a fixed unit-area
 * carrier integral, so total optical depth per ray grows linearly with RMS
 * wavenumber unless normalized here.
 */
export const CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER = 8;

/**
 * Lower bound of the column-density normalization. Guards against degenerate
 * wavenumber statistics crushing the medium to invisibility; the reference
 * cavity's representable bandwidth stays above this bound.
 */
export const CARRIER_COLUMN_DENSITY_MIN_SCALE = 0.15;

/**
 * Derive the bounded column-density normalization from the committed
 * descriptor's energy-weighted RMS spatial wavenumber. Content at or below
 * the reference wavenumber keeps the calibrated apparatus look (scale one);
 * denser spectral content is attenuated as referenceWavenumber / rmsWavenumber
 * so expected optical depth per ray stays at the reference level instead of
 * saturating the emission-absorption medium into a washed-out volume.
 * Non-finite or empty statistics fail closed to one (current behavior).
 */
export function deriveCarrierColumnDensityScale(rmsSpatialWavenumber) {
  const safeWavenumber = readFinite(rmsSpatialWavenumber, 0);
  if (!(safeWavenumber > CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER)) {
    return 1;
  }
  return Math.max(
    CARRIER_COLUMN_DENSITY_MIN_SCALE,
    CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER / safeWavenumber,
  );
}

// Observation thresholds were calibrated against the former material-density
// representation, which multiplied solved structure density by 4.6 before the
// detector gate. Structure density is now kept in its canonical unboosted
// unit, so convert the fixed detector calibration once instead of applying a
// radiance or opacity gain to every sample.
export const OBSERVATION_DENSITY_CALIBRATION_SCALE = 4.6;
const toStructureDensityUnit = (value) =>
  value / OBSERVATION_DENSITY_CALIBRATION_SCALE;

export const OBSERVATION_TRANSFER_REFERENCE = Object.freeze({
  referenceRaymarchSteps: RAYMARCH_DEFAULTS.raymarchSteps,
  referenceContourSharpness: RAYMARCH_DEFAULTS.contourSharpness,
  referenceStepCompensation: deriveStepCompensation(
    RAYMARCH_DEFAULTS.raymarchSteps,
  ),
  densityFadeStart: toStructureDensityUnit(0.22),
  densityFadeEnd: toStructureDensityUnit(0.34),
  transferGain: 2.2,
  densityFloor: toStructureDensityUnit(0.22),
  contourSupportScale: toStructureDensityUnit(0.035),
  minExposureScale: 0.45,
  maxExposureScale: 2.25,
  maxFieldNoiseFloor: toStructureDensityUnit(0.12),
  minDensityFadeStart: toStructureDensityUnit(0.04),
  maxDensityFadeStart: toStructureDensityUnit(0.42),
  minDensityFadeWidth: toStructureDensityUnit(0.03),
  maxDensityFadeEnd: toStructureDensityUnit(0.62),
  minDensityFloor: toStructureDensityUnit(0.035),
  maxDensityFloor: toStructureDensityUnit(0.36),
  minContourSupportScale: toStructureDensityUnit(0.006),
  maxContourSupportScale: toStructureDensityUnit(0.06),
  densityNoiseClearance: toStructureDensityUnit(0.04),
});

function readPositiveFinite(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readVector3(value, fallback) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : [];
  return [
    readFinite(source[0], fallback[0]),
    readFinite(source[1], fallback[1]),
    readFinite(source[2], fallback[2]),
  ];
}

function multiplyColor(color, scalar) {
  return color.map((channel) => channel * scalar);
}

function addColor(left, right) {
  return left.map((channel, index) => channel + (right[index] ?? 0));
}

function mixColor(left, right, t) {
  return left.map(
    (channel, index) => channel + ((right[index] ?? channel) - channel) * t,
  );
}

/**
 * Resolve bounded laser-accent authority from a ready order-resolved transport
 * candidate. The stored zero order already includes path attenuation, so its
 * local straight reference is recovered by dividing by the apparatus power
 * fraction instead of substituting a global value of one.
 */
export function deriveBoundedCausticAccentAuthority({
  totalIrradiance = 0,
  zeroOrderIrradiance = 0,
  zeroOrderPowerFraction = 1,
  transportReady = 0,
  compressionKnee = LASER_CAUSTIC_COMPRESSION_KNEE_SEED,
} = {}) {
  const safeTotalIrradiance = Math.max(0, readFinite(totalIrradiance, 0));
  const safeZeroOrderIrradiance = Math.max(
    0,
    readFinite(zeroOrderIrradiance, 0),
  );
  const safeZeroOrderPowerFraction = Math.max(
    Number.EPSILON,
    readFinite(zeroOrderPowerFraction, 1),
  );
  const safeCompressionKnee = Math.max(
    Number.EPSILON,
    readFinite(compressionKnee, LASER_CAUSTIC_COMPRESSION_KNEE_SEED),
  );
  const readiness = clamp01(readFinite(Number(transportReady), 0));
  const attenuatedStraightReference =
    safeZeroOrderIrradiance / safeZeroOrderPowerFraction;
  const positiveCausticExcess = Math.max(
    safeTotalIrradiance - attenuatedStraightReference,
    0,
  );
  const compressedCausticExcess =
    positiveCausticExcess / (positiveCausticExcess + safeCompressionKnee);
  const connectedPeakResponse =
    compressedCausticExcess *
    (LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION +
      (1 - LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION) *
        compressedCausticExcess);

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
    accentAuthority: readiness * connectedPeakResponse,
  };
}

/**
 * Canonical acoustic-energy to optical-material transfer for a laser-excited
 * emissive medium with independent scattering and absorption extinction.
 *
 * Quantity contract:
 * - detectorIntegratedEnergy is a nonnegative normalized acoustic-energy
 *   measure after detector integration; it remains linear here.
 * - coreDensity and sheathDensity are nonnegative carrier concentrations per
 *   normalized cavity length. Their separate products with acoustic energy,
 *   materialDensityScale, and carrierColumnDensityScale remain observable;
 *   only their sum owns optical interaction.
 * - carrierColumnDensityScale is the bounded [0, 1] column-density
 *   normalization derived once per descriptor commit from the admitted
 *   modes' energy-weighted RMS spatial wavenumber. It scales emission and
 *   extinction together, so the saturated source function is unchanged.
 * - scatteringCoefficient and absorptionCoefficient are dimensionless fixed
 *   interaction coefficients; sigmaS, sigmaA, and extinction are inverse
 *   normalized cavity lengths.
 * - laserExcitedEmissionCoefficient converts organized carrier density into
 *   scene-linear source radiance per normalized path length. It is isotropic
 *   and independent of the scattering coefficient.
 * - normalDotRay and the two holographic controls own only an additive
 *   Fresnel emission lane. They never change carrier density or extinction.
 * - the narrow core mixes toward the fixed display white point while the
 *   linked sheath retains material chromaticity.
 * - holographicBaseRadianceGain is a nonnegative dimensionless calibration
 *   gain. It is not incident laser power and is not unit-clamped.
 * - laserAccentAuthority is a bounded presentation authority derived from a
 *   ready transport candidate outside this transfer. It never gates the base.
 *
 * These reference units define a fixed display-optics profile, not an SI
 * material measurement. Pitch, beat, visibility, and projected-caustic
 * classifications are intentionally outside this transfer.
 */
export function deriveAcousticEnergyMaterialTransfer({
  detectorIntegratedEnergy = 0,
  coreDensity = 0,
  sheathDensity = 0,
  materialDensityScale = 1,
  carrierColumnDensityScale = 1,
  materialColor = [1, 1, 1],
  surfaceColor = [1, 1, 1],
  scatteringCoefficient = REFERENCE_SCATTERING_COEFFICIENT,
  absorptionCoefficient = REFERENCE_ABSORPTION_COEFFICIENT,
  laserExcitedEmissionCoefficient = REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
  holographicIntensity = 0,
  holographicFresnelPower = 1,
  normalDotRay = 1,
  holographicBaseRadianceGain = HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED,
  laserAccentAuthority = 0,
  laserAccentGain = LASER_CAUSTIC_ACCENT_GAIN_SEED,
} = {}) {
  const safeEnergy = Math.max(0, readFinite(detectorIntegratedEnergy, 0));
  const safeCoreDensity = Math.max(0, readFinite(coreDensity, 0));
  const safeSheathDensity = Math.max(0, readFinite(sheathDensity, 0));
  const safeMaterialDensityScale = Math.max(
    0,
    readFinite(materialDensityScale, 1),
  );
  const safeCarrierColumnDensityScale = clamp(
    readFinite(carrierColumnDensityScale, 1),
    0,
    1,
  );
  const safeScatteringCoefficient = Math.max(
    0,
    readFinite(scatteringCoefficient, REFERENCE_SCATTERING_COEFFICIENT),
  );
  const safeAbsorptionCoefficient = Math.max(
    0,
    readFinite(absorptionCoefficient, REFERENCE_ABSORPTION_COEFFICIENT),
  );
  const safeLaserExcitedEmissionCoefficient = Math.max(
    0,
    readFinite(
      laserExcitedEmissionCoefficient,
      REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
    ),
  );
  const organizedCoreDensity =
    safeCoreDensity *
    safeEnergy *
    safeMaterialDensityScale *
    safeCarrierColumnDensityScale;
  const organizedSheathDensity =
    safeSheathDensity *
    safeEnergy *
    safeMaterialDensityScale *
    safeCarrierColumnDensityScale;
  const organizedDensity = organizedCoreDensity + organizedSheathDensity;
  const sigmaS = organizedDensity * safeScatteringCoefficient;
  const sigmaA = organizedDensity * safeAbsorptionCoefficient;
  const extinction = sigmaS + sigmaA;
  const emissionSourceStrength =
    organizedDensity * safeLaserExcitedEmissionCoefficient;
  const coreEmissionSourceStrength =
    organizedCoreDensity * safeLaserExcitedEmissionCoefficient;
  const sheathEmissionSourceStrength =
    organizedSheathDensity * safeLaserExcitedEmissionCoefficient;
  const safeHolographicBaseRadianceGain = Math.max(
    0,
    readFinite(
      holographicBaseRadianceGain,
      HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED,
    ),
  );
  const safeLaserAccentAuthority = clamp01(readFinite(laserAccentAuthority, 0));
  const safeLaserAccentGain = Math.max(
    0,
    readFinite(laserAccentGain, LASER_CAUSTIC_ACCENT_GAIN_SEED),
  );
  const resolvedMaterialColor = readVector3(materialColor, [1, 1, 1]).map(
    (channel) => Math.max(0, channel),
  );
  const resolvedSurfaceColor = readVector3(surfaceColor, [1, 1, 1]).map(
    (channel) => Math.max(0, channel),
  );
  const safeNormalDotRay = clamp01(Math.abs(readFinite(normalDotRay, 1)));
  const safeHolographicIntensity = clamp01(readFinite(holographicIntensity, 0));
  const safeHolographicFresnelPower = Math.max(
    0.01,
    readFinite(holographicFresnelPower, 1),
  );
  const fresnelBase = clamp01(
    (1 - safeNormalDotRay) ** safeHolographicFresnelPower,
  );
  const holographicFresnel = fresnelBase * safeHolographicIntensity;
  const coreEmissionColor = mixColor(
    resolvedMaterialColor,
    [1, 1, 1],
    LASER_ENERGY_CORE_SATURATION_MIX,
  );
  const fresnelEmissionColor = resolvedSurfaceColor;
  const intrinsicEmissionRadiance = addColor(
    multiplyColor(coreEmissionColor, coreEmissionSourceStrength),
    multiplyColor(resolvedMaterialColor, sheathEmissionSourceStrength),
  );
  const fresnelEmissionSourceStrength =
    emissionSourceStrength *
    holographicFresnel *
    LASER_ENERGY_FRESNEL_EMISSION_GAIN;
  const fresnelEmissionRadiance = multiplyColor(
    fresnelEmissionColor,
    fresnelEmissionSourceStrength,
  );
  const baseRadiance = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicEmissionRadiance,
        LASER_ENERGY_INTRINSIC_EMISSION_GAIN,
      ),
      fresnelEmissionRadiance,
    ),
    safeHolographicBaseRadianceGain,
  );
  const accentRadiance = multiplyColor(
    baseRadiance,
    safeLaserAccentGain * safeLaserAccentAuthority,
  );
  const sourceRadiance = addColor(baseRadiance, accentRadiance);

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
    sourceRadiance,
  };
}

// Acoustic energy material transfer CPU owner end.

export function deriveObservationVisibilityDrive(featureFrame) {
  const avgAmplitude =
    (featureFrame?.averageAmplitude ?? 0) /
    RAYMARCH_AVERAGE_AMPLITUDE_SHADER_REFERENCE;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const modalDriver = Math.max(
    featureFrame?.modalVisibilityEnergy ?? 0,
    (featureFrame?.modeCoherence ?? 0) * 0.5,
  );

  return clamp01(
    avgAmplitude * 0.3 + structureSignal * 0.45 + modalDriver * 0.25,
  );
}

export function deriveObservationTransferParameters({
  stepCompensation = OBSERVATION_TRANSFER_REFERENCE.referenceStepCompensation,
  contourSharpness = OBSERVATION_TRANSFER_REFERENCE.referenceContourSharpness,
  fieldNoiseFloor = 0,
} = {}) {
  const safeStepCompensation = readPositiveFinite(
    stepCompensation,
    OBSERVATION_TRANSFER_REFERENCE.referenceStepCompensation,
  );
  const safeContourSharpness = readPositiveFinite(
    contourSharpness,
    OBSERVATION_TRANSFER_REFERENCE.referenceContourSharpness,
  );
  const safeFieldNoiseFloor = clamp(
    Math.max(0, Number.isFinite(fieldNoiseFloor) ? fieldNoiseFloor : 0),
    0,
    OBSERVATION_TRANSFER_REFERENCE.maxFieldNoiseFloor,
  );
  const exposureScale = clamp(
    safeStepCompensation /
      OBSERVATION_TRANSFER_REFERENCE.referenceStepCompensation,
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
      densityFadeStart +
        safeFieldNoiseFloor * 1.4 +
        OBSERVATION_TRANSFER_REFERENCE.densityNoiseClearance,
    ),
    densityFadeStart + OBSERVATION_TRANSFER_REFERENCE.minDensityFadeWidth,
    OBSERVATION_TRANSFER_REFERENCE.maxDensityFadeEnd,
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
    transferGain: OBSERVATION_TRANSFER_REFERENCE.transferGain,
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
 * - Support uses sqrt(detector-integrated coefficient energy) inside
 *   exp(−G·R), not linear energy × anchor in the exponent. Stored modal
 *   response energy is not a second observation-energy authority.
 */
export function deriveObservationTransfer({
  density = 0,
  modalStructureAnchor = 0,
  ridgeAnchor = 0,
  signedRadianceAuthority = 1,
  modalCoefficientEnergy = 0,
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
  const observationEnergy = clamp01(modalCoefficientEnergy);
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
  const observationDensity = Math.max(
    physicalVisibleDensity,
    observedDensityFloor,
  );

  return {
    physicalVisibilityGate,
    physicalVisibleDensity,
    observationAnchor,
    observationEnergy,
    observationResponse,
    observationSupport,
    observedDensityFloor,
    observedContourSupport,
    observationDensity,
  };
}
