import { clamp01, mix, smoothstep } from "../../utils/math.js";

const LOCAL_FIELD_DISTANCE_GRADIENT_EPSILON = 1e-8;

/**
 * Fixed reference medium for the flagship laser-cymatics apparatus.
 *
 * These values describe a display apparatus, not measured laboratory ground
 * truth. Widths are local/world lengths; the two non-negative energy weights
 * are normalized before use so their sum cannot create or remove carrier
 * energy. These are internal apparatus constants, not creative controls; none
 * may depend on pitch, audio features, frame state, the camera, or the selected
 * performance profile.
 */
export const CYMATIC_CARRIER_REFERENCE_PROFILE = Object.freeze({
  // A 0.024-world-unit core spans roughly one backing pixel at the reference
  // presentation scale and one quarter of a 64^3 cache cell across the
  // six-unit cavity. The analytic interval integral resolves it without
  // widening it to the ray step or cache spacing.
  coreFwhmWorld: 0.024,
  sheathWidthRatio: 2,
  coreEnergyWeight: 97,
  sheathEnergyWeight: 3,
  gradientEpsilon: 1e-8,
});

const BROAD_BAND_SCALE = 1.65;
export const CONTOUR_BLEND = 0.82;
export const BODY_DENSITY_GAIN = 0.12;
export const BODY_DENSITY_MIX = 0.5;
export const BODY_EXCITATION_VISIBILITY_POWER = 1.2;
const EMISSION_ROLLOFF_BASE = 0.42;
const EMISSION_ROLLOFF_TRANSIENT_GAIN = 0.18;
export const EMISSION_ROLLOFF_MIX = 0.68;
export const MODAL_CROWDING_BODY_COMPRESSION = 0.55;
const MODAL_CROWDING_ACCUMULATION_COMPRESSION = 0.7;
export const HOT_CORE_START = 0.56;
export const HOT_CORE_END = 0.94;
export const HOT_CORE_CROWDING_THRESHOLD_LIFT = 0.14;
export const HOT_CORE_SURFACE_CROWDING_REDUCTION = 0.34;
export const WHITE_EMISSION_CROWDING_REDUCTION = 0.72;
const WHITE_EMISSION_CROWDING_TRANSIENT_RELIEF = 0.08;
const STRUCTURE_AWARE_EMISSION_CROWDING_START = 0.04;
const STRUCTURE_AWARE_EMISSION_CROWDING_END = 0.34;
const STRUCTURE_AWARE_EMISSION_RIDGE_WEIGHT = 0.62;
const STRUCTURE_AWARE_EMISSION_CONTOUR_WEIGHT = 0.28;
const STRUCTURE_AWARE_EMISSION_HIGHLIGHT_WEIGHT = 0.18;
const STRUCTURE_AWARE_EMISSION_DETAIL_GATE_START = 0.28;
const STRUCTURE_AWARE_EMISSION_DETAIL_GATE_END = 0.76;
const STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_START = 0.82;
const STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_END = 0.94;
const STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_WEIGHT = 0.18;
export const STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION = 0.72;
const STRUCTURE_AWARE_EMISSION_TRANSIENT_RELIEF = 0.08;
export const STRUCTURE_AWARE_EMISSION_MIN_GAIN = 0.42;
export const BOUNDARY_CONTOUR_ACCENT_WEIGHT = 0.08;
export const HIGHLIGHT_CONTOUR_ACCENT_WEIGHT = 0.04;
const PROJECTED_CAUSTIC_RADIANCE_COMPRESSION = 0.6;
const PROJECTED_CAUSTIC_RADIANCE_MIN_SCALE = 0.48;
const PROJECTED_CAUSTIC_RADIANCE_RIDGE_AUTHORITY_FLOOR = 0.35;
const LATCHED_FOG_STRUCTURE_START = 0.55;
const LATCHED_FOG_STRUCTURE_RANGE = 0.25;
const LATCHED_FOG_CHANGE_END = 0.08;
const LATCHED_FOG_TRANSIENT_RELEASE_START = 0.12;
const LATCHED_FOG_TRANSIENT_RELEASE_END = 0.42;
export const LATCHED_FOG_BODY_REDUCTION = 0.18;
const CAUSTIC_FOG_REDUCTION = 0.12;
const SIGNED_INTERFERENCE_BODY_AUTHORITY_START = 0.015;
const SIGNED_INTERFERENCE_BODY_AUTHORITY_END = 0.12;
const SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER = 1.2;
const SIGNED_INTERFERENCE_RADIANCE_GATE_MIN = 0.24;
const SIGNED_INTERFERENCE_RADIANCE_CANCELLATION_POWER = 1.15;
export const LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE = 0.85;
const CAUSTIC_DENSITY_GAIN = 1.15;
const CAUSTIC_FOCUS_POWER = 1.15;
export const CAUSTIC_BODY_MIX_MAX = 0.35;
const CAUSTIC_OBSERVATION_ANCHOR_WEIGHT = 0.85;
const CAUSTIC_EMISSION_GAIN = 1.2;
export const CANCELLATION_LUMINANCE_DROP_MIN = 0.65;
export const CAUSTIC_BROAD_CONTOUR_LEAK_MAX = 0.015;
export const CAUSTIC_COLOR_DENSITY_DELTA_MAX = 1e-6;
const OPTICAL_SLOPE_POWER = 1.35;
const OPTICAL_FOCUS_POWER = 1.55;
const OPTICAL_SPACE_GATE_START = 0.035;
const OPTICAL_SPACE_GATE_END = 0.18;
export const OPTICAL_BODY_SUPPRESSION_MAX = 0.48;
const OPTICAL_LASER_GAIN = 1.55;
const OPTICAL_FRINGE_MIX_MAX = 0.18;
export const OPTICAL_COLOR_DENSITY_DELTA_MAX = 1e-6;
export const OPTICAL_RECTANGULAR_STARTUP_IMPORT_DELTA_MAX = 0;

function safeFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

const GAUSSIAN_FWHM_EXPONENT = 4 * Math.LN2;
const GAUSSIAN_UNIT_AREA_SCALE = 2 * Math.sqrt(Math.LN2 / Math.PI);
const GAUSSIAN_CDF_SCALE = 2 * Math.sqrt(Math.LN2);

/**
 * First-order distance from a scalar-field sample to its local zero set.
 *
 * `fieldValue` and `gradientMagnitude` must describe the same scalar field.
 * If the field has units P and its gradient has units P / worldLength, the
 * returned distance has units worldLength. `gradientEpsilon` is only a
 * numerical denominator guard; `gradientValid` remains false when it owns the
 * denominator so callers cannot turn a degenerate critical point into light.
 *
 * @param {{
 *   fieldValue?: number,
 *   gradientMagnitude?: number,
 *   gradientEpsilon?: number,
 * }} [options]
 */
export function deriveLocalFieldDistance({
  fieldValue = 0,
  gradientMagnitude = 0,
  gradientEpsilon = LOCAL_FIELD_DISTANCE_GRADIENT_EPSILON,
} = {}) {
  const fieldValid = Number.isFinite(fieldValue);
  const gradientFinite = Number.isFinite(gradientMagnitude);
  const fieldMagnitude = fieldValid ? Math.abs(fieldValue) : 0;
  const safeGradientMagnitude = gradientFinite
    ? Math.abs(gradientMagnitude)
    : 0;
  const safeGradientEpsilon = Math.max(
    Number.EPSILON,
    Math.abs(
      safeFinite(gradientEpsilon, LOCAL_FIELD_DISTANCE_GRADIENT_EPSILON),
    ),
  );
  const gradientValid =
    gradientFinite && safeGradientMagnitude > safeGradientEpsilon;
  const localFieldDistance = fieldValid
    ? fieldMagnitude / Math.max(safeGradientMagnitude, safeGradientEpsilon)
    : Number.MAX_VALUE;

  return {
    fieldMagnitude,
    gradientMagnitude: safeGradientMagnitude,
    gradientEpsilon: safeGradientEpsilon,
    localFieldDistance,
    fieldValid,
    gradientValid,
  };
}

function deriveUnitAreaGaussianProfile(localFieldDistance, fwhmWorld) {
  const safeFwhmWorld = safeFinite(fwhmWorld, 0);
  const widthValid = safeFwhmWorld > 0;
  const distanceValid = Number.isFinite(localFieldDistance);
  if (!widthValid || !distanceValid) {
    return {
      profile: 0,
      fwhmWorld: widthValid ? safeFwhmWorld : 0,
      widthValid,
    };
  }

  const normalizedDistance = Math.max(0, localFieldDistance) / safeFwhmWorld;
  const profile =
    (GAUSSIAN_UNIT_AREA_SCALE / safeFwhmWorld) *
    Math.exp(-GAUSSIAN_FWHM_EXPONENT * normalizedDistance ** 2);

  return {
    profile: safeFinite(profile, 0),
    fwhmWorld: safeFwhmWorld,
    widthValid,
  };
}

function approximateErrorFunction(value) {
  if (value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * magnitude);
  const approximation =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-magnitude * magnitude);
  return sign * approximation;
}

/**
 * Closed-form interval average of the same unit-area Gaussian used by the
 * point profile. The interval is centered at `localFieldDistance` and spans a
 * world-space distance along the local surface normal. `intervalEnergy` is
 * dimensionless; `intervalAverage` has units 1 / worldLength.
 *
 * @param {{
 *   localFieldDistance?: number,
 *   intervalWidthWorld?: number,
 *   fwhmWorld?: number,
 * }} [options]
 */
export function deriveNormalizedGaussianIntervalAverage({
  localFieldDistance = 0,
  intervalWidthWorld = 0,
  fwhmWorld,
} = {}) {
  const safeDistance = Number.isFinite(localFieldDistance)
    ? Math.abs(localFieldDistance)
    : Number.MAX_VALUE;
  const safeIntervalWidthWorld = safeFinite(intervalWidthWorld, -1);
  const pointProfile = deriveUnitAreaGaussianProfile(safeDistance, fwhmWorld);
  const intervalValid = pointProfile.widthValid && safeIntervalWidthWorld >= 0;
  if (!intervalValid) {
    return {
      intervalAverage: 0,
      intervalEnergy: 0,
      intervalWidthWorld: 0,
      fwhmWorld: pointProfile.fwhmWorld,
      intervalValid: false,
    };
  }
  if (safeIntervalWidthWorld === 0) {
    return {
      intervalAverage: pointProfile.profile,
      intervalEnergy: 0,
      intervalWidthWorld: 0,
      fwhmWorld: pointProfile.fwhmWorld,
      intervalValid: true,
    };
  }

  const halfWidthWorld = safeIntervalWidthWorld / 2;
  const lowerWorld = safeDistance - halfWidthWorld;
  const upperWorld = safeDistance + halfWidthWorld;
  const cdfScale = GAUSSIAN_CDF_SCALE / pointProfile.fwhmWorld;
  const intervalEnergy = clamp01(
    0.5 *
      (approximateErrorFunction(cdfScale * upperWorld) -
        approximateErrorFunction(cdfScale * lowerWorld)),
  );

  return {
    intervalAverage: intervalEnergy / safeIntervalWidthWorld,
    intervalEnergy,
    intervalWidthWorld: safeIntervalWidthWorld,
    fwhmWorld: pointProfile.fwhmWorld,
    intervalValid: true,
  };
}

/**
 * Unit-area core and sheath profiles around the same zero-set surface.
 *
 * Both FWHM values are fixed world-space lengths. Their profiles integrate to
 * one across the signed surface normal, so changing either width changes peak
 * density without changing the energy subsequently assigned to that lane.
 *
 * @param {{
 *   localFieldDistance?: number,
 *   coreFwhmWorld?: number,
 *   sheathFwhmWorld?: number,
 * }} [options]
 */
export function deriveFixedWorldSpaceCarrierProfiles({
  localFieldDistance = 0,
  coreFwhmWorld,
  sheathFwhmWorld,
} = {}) {
  const core = deriveUnitAreaGaussianProfile(localFieldDistance, coreFwhmWorld);
  const sheath = deriveUnitAreaGaussianProfile(
    localFieldDistance,
    sheathFwhmWorld,
  );

  return {
    coreProfile: core.profile,
    sheathProfile: sheath.profile,
    coreFwhmWorld: core.fwhmWorld,
    sheathFwhmWorld: sheath.fwhmWorld,
    profileWidthsValid: core.widthValid && sheath.widthValid,
  };
}

/**
 * Normalize fixed, non-negative lane energies without any scene/audio input.
 *
 * @param {{
 *   coreEnergyWeight?: number,
 *   sheathEnergyWeight?: number,
 * }} [options]
 */
function deriveNormalizedCarrierEnergyFractions({
  coreEnergyWeight = 0,
  sheathEnergyWeight = 0,
} = {}) {
  const safeCoreEnergyWeight = Math.max(0, safeFinite(coreEnergyWeight, 0));
  const safeSheathEnergyWeight = Math.max(0, safeFinite(sheathEnergyWeight, 0));
  const totalEnergyWeight = safeCoreEnergyWeight + safeSheathEnergyWeight;
  const energyWeightsValid = totalEnergyWeight > Number.EPSILON;

  return {
    coreEnergyFraction: energyWeightsValid
      ? safeCoreEnergyWeight / totalEnergyWeight
      : 0,
    sheathEnergyFraction: energyWeightsValid
      ? safeSheathEnergyWeight / totalEnergyWeight
      : 0,
    totalEnergyFraction: energyWeightsValid ? 1 : 0,
    energyWeightsValid,
  };
}

/**
 * CPU/reference carrier contract for a thin zero-set core and its co-located
 * wider sheath. The returned energy densities have units 1 / worldLength and
 * integrate to the normalized fixed fractions across the surface normal.
 *
 * @param {{
 *   fieldValue?: number,
 *   gradientMagnitude?: number,
 *   gradientEpsilon?: number,
 *   coreFwhmWorld?: number,
 *   sheathFwhmWorld?: number,
 *   coreEnergyWeight?: number,
 *   sheathEnergyWeight?: number,
 * }} [options]
 */
export function deriveCoreAndLinkedSheathCarrier({
  fieldValue = 0,
  gradientMagnitude = 0,
  gradientEpsilon = LOCAL_FIELD_DISTANCE_GRADIENT_EPSILON,
  coreFwhmWorld,
  sheathFwhmWorld,
  coreEnergyWeight = 0,
  sheathEnergyWeight = 0,
} = {}) {
  const distance = deriveLocalFieldDistance({
    fieldValue,
    gradientMagnitude,
    gradientEpsilon,
  });
  const profiles = deriveFixedWorldSpaceCarrierProfiles({
    localFieldDistance: distance.localFieldDistance,
    coreFwhmWorld,
    sheathFwhmWorld,
  });
  const energy = deriveNormalizedCarrierEnergyFractions({
    coreEnergyWeight,
    sheathEnergyWeight,
  });
  const carrierValid =
    distance.fieldValid &&
    distance.gradientValid &&
    profiles.profileWidthsValid &&
    energy.energyWeightsValid;
  const coreProfile = carrierValid ? profiles.coreProfile : 0;
  const sheathProfile = carrierValid ? profiles.sheathProfile : 0;
  const coreEnergyDensity = coreProfile * energy.coreEnergyFraction;
  const sheathEnergyDensity = sheathProfile * energy.sheathEnergyFraction;

  return {
    ...distance,
    ...energy,
    coreFwhmWorld: profiles.coreFwhmWorld,
    sheathFwhmWorld: profiles.sheathFwhmWorld,
    profileWidthsValid: profiles.profileWidthsValid,
    carrierValid,
    coreProfile,
    sheathProfile,
    coreEnergyDensity,
    sheathEnergyDensity,
    carrierEnergyDensity: coreEnergyDensity + sheathEnergyDensity,
  };
}

/**
 * CPU mirror of the production TSL interval carrier. The scalar-field value
 * and gradient are one matched linear sample; `rayDirLocal` is the normalized
 * local ray direction and `stepSize` is a world-space segment length.
 *
 * @param {{
 *   fieldValue?: number,
 *   gradient?: ArrayLike<number>,
 *   rayDirLocal?: ArrayLike<number>,
 *   stepSize?: number,
 *   coreFwhmWorld?: number,
 * }} [options]
 */
export function deriveFixedWorldSpaceCarrierDensity({
  fieldValue = 0,
  gradient = [0, 0, 0],
  rayDirLocal = [0, 0, 1],
  stepSize = 0,
  coreFwhmWorld = CYMATIC_CARRIER_REFERENCE_PROFILE.coreFwhmWorld,
} = {}) {
  const safeGradient = readVector3(gradient, [0, 0, 0]);
  const safeRayDirection = readVector3(rayDirLocal, [0, 0, 1]);
  const gradientMagnitude = Math.hypot(...safeGradient);
  const distance = deriveLocalFieldDistance({
    fieldValue,
    gradientMagnitude,
    gradientEpsilon: CYMATIC_CARRIER_REFERENCE_PROFILE.gradientEpsilon,
  });
  const inverseGradientMagnitude = distance.gradientValid
    ? 1 / gradientMagnitude
    : 0;
  const normalDotRay = Math.abs(
    dotVector3(
      safeGradient.map((component) => component * inverseGradientMagnitude),
      safeRayDirection,
    ),
  );
  const intervalWidthWorld =
    Math.max(0, safeFinite(stepSize, 0)) * normalDotRay;
  const sheathFwhmWorld =
    coreFwhmWorld * CYMATIC_CARRIER_REFERENCE_PROFILE.sheathWidthRatio;
  const energy = deriveNormalizedCarrierEnergyFractions({
    coreEnergyWeight: CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight,
    sheathEnergyWeight: CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight,
  });
  const core = deriveNormalizedGaussianIntervalAverage({
    localFieldDistance: distance.localFieldDistance,
    intervalWidthWorld,
    fwhmWorld: coreFwhmWorld,
  });
  const sheath = deriveNormalizedGaussianIntervalAverage({
    localFieldDistance: distance.localFieldDistance,
    intervalWidthWorld,
    fwhmWorld: sheathFwhmWorld,
  });
  const carrierValid =
    distance.fieldValid &&
    distance.gradientValid &&
    core.intervalValid &&
    sheath.intervalValid &&
    energy.energyWeightsValid;
  const coreDensity = carrierValid
    ? core.intervalAverage * energy.coreEnergyFraction
    : 0;
  const sheathDensity = carrierValid
    ? sheath.intervalAverage * energy.sheathEnergyFraction
    : 0;

  return {
    ...distance,
    ...energy,
    coreFwhmWorld,
    sheathFwhmWorld,
    intervalWidthWorld,
    normalDotRay,
    carrierValid,
    coreDensity,
    sheathDensity,
    carrierDensity: coreDensity + sheathDensity,
  };
}

export function deriveLiveSynthesisCancellationSuppression({
  effectiveCancellationRatio = 0,
  effectiveUnsignedSupport = 0,
  suppressionScale = LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE,
} = {}) {
  return clamp01(
    1 -
      clamp01(safeFinite(effectiveCancellationRatio, 0)) *
        clamp01(safeFinite(effectiveUnsignedSupport, 0)) *
        clamp01(safeFinite(suppressionScale, 0)),
  );
}

export function deriveSpectralLightProjectionWeight({
  spectralMix = 1,
  spectralLightPresence = 0,
} = {}) {
  return clamp01(
    clamp01(safeFinite(spectralMix, 0)) *
      clamp01(safeFinite(spectralLightPresence, 0)),
  );
}

function readVector3(value, fallback) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : [];
  return [
    safeFinite(source[0], fallback[0]),
    safeFinite(source[1], fallback[1]),
    safeFinite(source[2], fallback[2]),
  ];
}

function dotVector3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeVector3(value, fallback) {
  const vector = readVector3(value, fallback);
  const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(magnitude > 1e-6)) {
    return [...fallback];
  }
  return vector.map((component) => component / magnitude);
}

function deriveNodeBand(fieldAbs, threshold) {
  return 1 - smoothstep(0, threshold, fieldAbs);
}

function deriveBroadBand(fieldAbs, threshold) {
  return 1 - smoothstep(0, threshold * BROAD_BAND_SCALE, fieldAbs);
}

export function deriveSignedInterferenceBodyAuthority(fieldAbs) {
  return Math.pow(
    smoothstep(
      SIGNED_INTERFERENCE_BODY_AUTHORITY_START,
      SIGNED_INTERFERENCE_BODY_AUTHORITY_END,
      Math.max(0, Number.isFinite(fieldAbs) ? fieldAbs : 0),
    ),
    SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER,
  );
}

export function deriveLatchedFogMask({
  structureSignal = 0,
  changeSignal = 1,
  transientEnergy = 0,
}) {
  return (
    clamp01(
      (structureSignal - LATCHED_FOG_STRUCTURE_START) /
        LATCHED_FOG_STRUCTURE_RANGE,
    ) *
    clamp01((LATCHED_FOG_CHANGE_END - changeSignal) / LATCHED_FOG_CHANGE_END) *
    (1 -
      smoothstep(
        LATCHED_FOG_TRANSIENT_RELEASE_START,
        LATCHED_FOG_TRANSIENT_RELEASE_END,
        transientEnergy,
      ))
  );
}

export function deriveContourShape({
  fieldAbs,
  threshold,
  contourSharpness,
  transientEnergy,
}) {
  const nodeBand = deriveNodeBand(fieldAbs, threshold);
  const broadBand = deriveBroadBand(fieldAbs, threshold);
  const contourCore = Math.pow(
    nodeBand,
    contourSharpness * (1 + transientEnergy * 0.25),
  );
  const contourShape = mix(broadBand, contourCore, CONTOUR_BLEND);

  return {
    nodeBand,
    broadBand,
    contourCore,
    contourShape,
  };
}

function deriveLocalFieldSupportAuthority({
  effectiveUnsignedSupport = 1,
} = {}) {
  return clamp01(safeFinite(effectiveUnsignedSupport, 0));
}

export function deriveLocalGradientEvidence({
  gradientMagnitude = 0,
  amplitudeNorm = 1,
  modalBasisCacheActive = false,
  cachedGradientMagnitude = 0,
} = {}) {
  const safeGradientMagnitude = Math.max(0, safeFinite(gradientMagnitude, 0));
  const safeCachedGradientMagnitude = Math.max(
    0,
    safeFinite(cachedGradientMagnitude, 0),
  );
  const safeAmplitudeNorm = Math.max(1e-4, safeFinite(amplitudeNorm, 1));
  const localGradientEvidence = modalBasisCacheActive
    ? clamp01(safeCachedGradientMagnitude)
    : clamp01(safeGradientMagnitude / safeAmplitudeNorm);

  return { localGradientEvidence };
}

export function deriveCausticRidgeAuthority({
  modalStructureSupport = 0,
  localGradientEvidence = 0,
  activeMask = 1,
  effectiveUnsignedSupport = 1,
} = {}) {
  const safeModalStructureSupport = clamp01(modalStructureSupport);
  const safeLocalGradientEvidence = clamp01(localGradientEvidence);
  const localFieldSupportAuthority = deriveLocalFieldSupportAuthority({
    effectiveUnsignedSupport,
  });
  const gradientFieldAuthority =
    safeLocalGradientEvidence * localFieldSupportAuthority;
  const causticFocusAuthority = clamp01(
    gradientFieldAuthority * safeModalStructureSupport,
  );
  const causticRidgeAuthority = causticFocusAuthority * clamp01(activeMask);

  return {
    causticFocusAuthority,
    causticRidgeAuthority,
  };
}

function deriveCausticVisibility({
  causticRidgeAuthority = 0,
  signedRadianceAuthority = 1,
} = {}) {
  return clamp01(causticRidgeAuthority) * clamp01(signedRadianceAuthority);
}

function deriveCausticDensity({
  causticFocusAuthority = 0,
  causticVisibility = 0,
  transientBoost = 1,
  boundaryDensity = 1,
  latchedFogMask = 0,
} = {}) {
  return (
    CAUSTIC_DENSITY_GAIN *
    Math.pow(clamp01(causticFocusAuthority), CAUSTIC_FOCUS_POWER) *
    clamp01(causticVisibility) *
    Math.max(0, Number.isFinite(transientBoost) ? transientBoost : 0) *
    clamp01(boundaryDensity) *
    (1 - clamp01(latchedFogMask) * CAUSTIC_FOG_REDUCTION)
  );
}

export function deriveCausticMaterialTransferProbe({
  fieldAbs = 0,
  threshold = 0.02,
  modalStructureSupport = null,
  broadBand = null,
  localGradientEvidence = 0,
  activeMask = 1,
  effectiveUnsignedSupport = 1,
  effectiveCancellationRatio = null,
  excitationVisibility = 1,
  signedRadianceAuthority = 1,
  colorWeight = 0,
  transientBoost = 1,
  boundaryDensity = 1,
  latchedFogMask = 0,
} = {}) {
  const safeFieldAbs = Math.max(0, Number.isFinite(fieldAbs) ? fieldAbs : 0);
  const safeThreshold = Math.max(
    1e-4,
    Number.isFinite(threshold) ? threshold : 0.02,
  );
  const resolvedModalStructureSupport =
    modalStructureSupport == null
      ? deriveNodeBand(safeFieldAbs, safeThreshold)
      : modalStructureSupport;
  const signedBodyAuthority =
    deriveSignedInterferenceBodyAuthority(safeFieldAbs);
  const { causticFocusAuthority, causticRidgeAuthority } =
    deriveCausticRidgeAuthority({
      modalStructureSupport: resolvedModalStructureSupport,
      localGradientEvidence,
      activeMask,
      effectiveUnsignedSupport,
    });
  const cancellationSuppression = deriveLiveSynthesisCancellationSuppression({
    effectiveCancellationRatio:
      effectiveCancellationRatio == null ? 0 : effectiveCancellationRatio,
    effectiveUnsignedSupport,
  });
  const resolvedSignedRadianceAuthority =
    effectiveCancellationRatio == null
      ? clamp01(signedRadianceAuthority)
      : cancellationSuppression;
  const causticVisibility = deriveCausticVisibility({
    causticRidgeAuthority,
    signedRadianceAuthority: resolvedSignedRadianceAuthority,
  });
  const causticDensity = deriveCausticDensity({
    causticFocusAuthority,
    causticVisibility,
    transientBoost,
    boundaryDensity,
    latchedFogMask,
  });
  const resolvedBroadBand =
    broadBand == null
      ? deriveBroadBand(safeFieldAbs, safeThreshold)
      : broadBand;
  const bodyDensity =
    clamp01(resolvedBroadBand) *
    clamp01(activeMask) *
    BODY_DENSITY_GAIN *
    signedBodyAuthority *
    resolvedSignedRadianceAuthority *
    Math.pow(clamp01(excitationVisibility), BODY_EXCITATION_VISIBILITY_POWER);
  const bodyContribution = Math.min(
    bodyDensity * CAUSTIC_BODY_MIX_MAX,
    causticDensity * CAUSTIC_BODY_MIX_MAX,
  );
  const localDensity = causticDensity + bodyContribution;
  const ridgeConcentration =
    causticDensity / (causticDensity + bodyDensity + 1e-4);
  const observationAnchor =
    causticRidgeAuthority *
    CAUSTIC_OBSERVATION_ANCHOR_WEIGHT *
    resolvedSignedRadianceAuthority;
  const colorConfidence = clamp01(colorWeight) * causticVisibility;
  const emissionGain = 1 + causticVisibility * (CAUSTIC_EMISSION_GAIN - 1);
  const localLuminance =
    localDensity * emissionGain * (0.72 + colorConfidence * 0.08);

  return {
    causticFocusAuthority,
    causticRidgeAuthority,
    modalStructureSupport: clamp01(resolvedModalStructureSupport),
    causticVisibility,
    cancellationSuppression,
    causticDensity,
    bodyDensity,
    bodyContribution,
    localDensity,
    ridgeConcentration,
    observationAnchor,
    signedRadianceAuthority: resolvedSignedRadianceAuthority,
    colorConfidence,
    emissionGain,
    localLuminance,
  };
}

function deriveOpticalSlopeAuthority({
  normalDotMeasurement = 1,
  gradientPresence = 0,
  slopePower = OPTICAL_SLOPE_POWER,
} = {}) {
  const alignment = clamp01(Math.abs(safeFinite(normalDotMeasurement, 1)));
  const presence = clamp01(gradientPresence);
  const power = Math.max(0.01, safeFinite(slopePower, OPTICAL_SLOPE_POWER));

  return presence * Math.pow(1 - alignment, power);
}

export function deriveOpticalConvergenceAuthority({
  tangent1 = [1, 0, 0],
  tangent2 = [0, 1, 0],
  centerGradientNormal = [0, 0, 0],
  normalPositiveT1 = [0, 0, 0],
  normalPositiveT2 = [0, 0, 0],
} = {}) {
  const t1 = normalizeVector3(tangent1, [1, 0, 0]);
  const t2 = normalizeVector3(tangent2, [0, 1, 0]);
  const nCenter = normalizeVector3(centerGradientNormal, [0, 0, 0]);
  const nPositiveT1 = normalizeVector3(normalPositiveT1, [0, 0, 0]);
  const nPositiveT2 = normalizeVector3(normalPositiveT2, [0, 0, 0]);
  // Forward difference reusing the center normal N0 as baseline:
  // -[(N(+t1) - N0)·t1 + (N(+t2) - N0)·t2] mirrors the GPU estimator and
  // tracks the same negative divergence as the prior 4-sample central form.
  const viewPlaneNormalConvergence =
    -1 *
    (dotVector3(
      [
        nPositiveT1[0] - nCenter[0],
        nPositiveT1[1] - nCenter[1],
        nPositiveT1[2] - nCenter[2],
      ],
      t1,
    ) +
      dotVector3(
        [
          nPositiveT2[0] - nCenter[0],
          nPositiveT2[1] - nCenter[1],
          nPositiveT2[2] - nCenter[2],
        ],
        t2,
      ));

  return {
    viewPlaneNormalConvergence,
    opticalConvergenceAuthority: clamp01(
      Math.max(0, viewPlaneNormalConvergence),
    ),
  };
}

function deriveOpticalFocusAuthority({
  causticRidgeAuthority = 0,
  opticalSlopeAuthority = 0,
  ridgeConcentration = 0,
  opticalConvergenceAuthority = 0,
} = {}) {
  const convergence = clamp01(opticalConvergenceAuthority);

  return clamp01(
    clamp01(causticRidgeAuthority) *
      (1 + clamp01(opticalSlopeAuthority) * convergence) *
      (1 + clamp01(ridgeConcentration) * convergence),
  );
}

function deriveOpticalNegativeSpaceGate({
  opticalFocus = 0,
  causticRidgeAuthority = 0,
  gateStart = OPTICAL_SPACE_GATE_START,
  gateEnd = OPTICAL_SPACE_GATE_END,
} = {}) {
  return smoothstep(
    safeFinite(gateStart, OPTICAL_SPACE_GATE_START),
    safeFinite(gateEnd, OPTICAL_SPACE_GATE_END),
    clamp01(opticalFocus) * clamp01(causticRidgeAuthority),
  );
}

function deriveLaserCausticRadiance({
  signedCausticDensity = 0,
  opticalFocus = 0,
  laserGain = OPTICAL_LASER_GAIN,
} = {}) {
  return (
    Math.max(0, safeFinite(signedCausticDensity, 0)) *
    (1 +
      Math.max(0, safeFinite(laserGain, OPTICAL_LASER_GAIN)) *
        clamp01(opticalFocus))
  );
}

export function deriveLaserCymaticOpticalProbe({
  normalDotMeasurement = 1,
  gradientPresence = null,
  ridgeConcentration: ridgeConcentrationOverride = null,
  signedCausticDensity: signedCausticDensityOverride = null,
  bodyContribution: bodyContributionOverride = null,
  localGradientEvidence = 0,
  opticalConvergenceAuthority = 0,
  ...causticInputs
} = {}) {
  const caustic = deriveCausticMaterialTransferProbe({
    ...causticInputs,
    localGradientEvidence,
  });
  const signedCausticDensity =
    signedCausticDensityOverride == null
      ? caustic.causticDensity
      : Math.max(0, safeFinite(signedCausticDensityOverride, 0));
  const bodyContribution =
    bodyContributionOverride == null
      ? caustic.bodyContribution
      : Math.max(0, safeFinite(bodyContributionOverride, 0));
  const ridgeConcentration =
    ridgeConcentrationOverride == null
      ? caustic.ridgeConcentration
      : clamp01(ridgeConcentrationOverride);
  const gradientPresenceGate =
    gradientPresence == null
      ? clamp01(localGradientEvidence)
      : clamp01(gradientPresence);
  const opticalSlopeAuthority = deriveOpticalSlopeAuthority({
    normalDotMeasurement,
    gradientPresence: gradientPresenceGate,
  });
  const opticalFocusAuthority = deriveOpticalFocusAuthority({
    causticRidgeAuthority: caustic.causticRidgeAuthority,
    opticalSlopeAuthority,
    ridgeConcentration,
    opticalConvergenceAuthority,
  });
  const opticalFocus = Math.pow(opticalFocusAuthority, OPTICAL_FOCUS_POWER);
  const opticalNegativeSpaceGate = deriveOpticalNegativeSpaceGate({
    opticalFocus,
    causticRidgeAuthority: caustic.causticRidgeAuthority,
  });
  const bodyAttenuation =
    1 - OPTICAL_BODY_SUPPRESSION_MAX * (1 - opticalNegativeSpaceGate);
  const opticalBodyContribution = bodyContribution * bodyAttenuation;
  const laserCausticRadiance = deriveLaserCausticRadiance({
    signedCausticDensity,
    opticalFocus,
  });
  const physicalDensity = laserCausticRadiance + opticalBodyContribution;
  const opticalFringeWeight = clamp01(
    opticalFocus * opticalSlopeAuthority * OPTICAL_FRINGE_MIX_MAX,
  );
  const localLuminance =
    physicalDensity *
    caustic.emissionGain *
    (0.72 + caustic.colorConfidence * 0.08);

  return {
    ...caustic,
    baseLocalDensity: caustic.localDensity,
    baseLocalLuminance: caustic.localLuminance,
    signedCausticDensity,
    bodyContribution,
    ridgeConcentration,
    opticalSlopeAuthority,
    opticalConvergenceAuthority: clamp01(opticalConvergenceAuthority),
    opticalFocusAuthority,
    opticalFocus,
    opticalNegativeSpaceGate,
    opticalBodyContribution,
    laserCausticRadiance,
    opticalFringeWeight,
    physicalDensity,
    localDensity: physicalDensity,
    localLuminance,
  };
}

export function deriveBodyDensity({
  fieldAbs,
  threshold,
  activeMask,
  signedRadianceAuthority = 1,
  excitationVisibility = 1,
  structureSignal = 0,
  changeSignal = 1,
  transientEnergy = 0,
}) {
  const broadBand = deriveBroadBand(fieldAbs, threshold);
  const signedBodyAuthority = deriveSignedInterferenceBodyAuthority(fieldAbs);
  const latchedFogMask = deriveLatchedFogMask({
    structureSignal,
    changeSignal,
    transientEnergy,
  });
  const bodyDensity =
    broadBand *
    activeMask *
    BODY_DENSITY_GAIN *
    signedBodyAuthority *
    clamp01(signedRadianceAuthority) *
    Math.pow(clamp01(excitationVisibility), BODY_EXCITATION_VISIBILITY_POWER) *
    (1 - latchedFogMask * LATCHED_FOG_BODY_REDUCTION);

  return {
    broadBand,
    signedBodyAuthority,
    signedRadianceAuthority: clamp01(signedRadianceAuthority),
    excitationVisibility: clamp01(excitationVisibility),
    latchedFogMask,
    bodyDensity,
  };
}

export function deriveEmissionRolloff({ beamDensity, transientEnergy }) {
  const rolloffStrength =
    EMISSION_ROLLOFF_BASE + transientEnergy * EMISSION_ROLLOFF_TRANSIENT_GAIN;
  const softCappedBeamDensity =
    beamDensity / (1 + beamDensity * rolloffStrength);
  const rolledBeamDensity = mix(
    beamDensity,
    softCappedBeamDensity,
    EMISSION_ROLLOFF_MIX,
  );

  return {
    rolloffStrength,
    softCappedBeamDensity,
    rolledBeamDensity,
  };
}

export function deriveModalCrowdingDensity({
  rolledBeamDensity,
  dampedBodyDensity,
}) {
  const beamDensity = Math.max(
    0,
    Number.isFinite(rolledBeamDensity) ? rolledBeamDensity : 0,
  );
  const bodyDensity = Math.max(
    0,
    Number.isFinite(dampedBodyDensity) ? dampedBodyDensity : 0,
  );
  const additiveDensity = beamDensity + bodyDensity * BODY_DENSITY_MIX;
  const ridgeConcentration = beamDensity / (beamDensity + bodyDensity + 1e-4);
  const bodyCrowding = additiveDensity * (1 - ridgeConcentration);
  const bodyCompression =
    1 / (1 + bodyCrowding * MODAL_CROWDING_BODY_COMPRESSION);
  const adjustedBodyDensity = bodyDensity * bodyCompression;
  const accumulationCompression =
    1 /
    (1 +
      bodyCrowding *
        MODAL_CROWDING_ACCUMULATION_COMPRESSION *
        (1 - ridgeConcentration));
  const adjustedBodyContribution =
    adjustedBodyDensity * BODY_DENSITY_MIX * accumulationCompression;

  return {
    rolledBeamDensity: beamDensity,
    dampedBodyDensity: bodyDensity,
    additiveDensity,
    ridgeConcentration,
    bodyCrowding,
    bodyCompression,
    adjustedBodyDensity,
    accumulationCompression,
    adjustedBodyContribution,
    localDensity: beamDensity + adjustedBodyContribution,
  };
}

export function deriveHolographicFresnel({
  normalViewDot,
  holographicIntensity,
  holographicFresnelPower,
}) {
  const fresnelBase = clamp01(
    Math.pow(
      1 - Math.abs(normalViewDot),
      Math.max(0.01, holographicFresnelPower ?? 1),
    ),
  );
  const holographicFresnel = fresnelBase * clamp01(holographicIntensity ?? 0);

  return {
    fresnelBase,
    holographicFresnel,
  };
}

export function deriveHotCoreCrowding({
  ridgeConcentration = 1,
  bodyCrowding = 0,
  transientEnergy = 0,
}) {
  const bodyCrowdingGate = smoothstep(0.28, 1.1, bodyCrowding);
  const ridgeRelief = 1 - smoothstep(0.76, 0.94, ridgeConcentration);
  const transientRelief = 1 - clamp01(transientEnergy) * 0.55;
  const whiteEmissionTransientRelief =
    1 - clamp01(transientEnergy) * WHITE_EMISSION_CROWDING_TRANSIENT_RELIEF;
  const hotCoreCrowding =
    bodyCrowdingGate * (0.35 + ridgeRelief * 0.65) * transientRelief;
  const whiteEmissionCrowding =
    bodyCrowdingGate *
    (0.35 + ridgeRelief * 0.65) *
    whiteEmissionTransientRelief;
  const thresholdLift = hotCoreCrowding * HOT_CORE_CROWDING_THRESHOLD_LIFT;

  return {
    bodyCrowdingGate,
    ridgeRelief,
    transientRelief,
    whiteEmissionTransientRelief,
    hotCoreCrowding,
    whiteEmissionCrowding,
    thresholdLift,
    hotCoreStart: HOT_CORE_START + thresholdLift,
  };
}

export function deriveHotCoreMix({
  beamMask,
  highlightMask,
  contourMix,
  transientEnergy,
  hotCoreStart = HOT_CORE_START,
}) {
  const hotCoreSignal =
    beamMask * (0.76 + contourMix * 0.14) +
    highlightMask * 0.12 +
    transientEnergy * 0.08;
  const compressedHotCoreSignal = hotCoreSignal / (1 + hotCoreSignal * 0.22);

  return smoothstep(hotCoreStart, HOT_CORE_END, compressedHotCoreSignal);
}

export function deriveCrowdedHighlightMix({
  hotCoreMix = 0,
  whiteEmissionMix = 0,
  hotCoreCrowding = 0,
  whiteEmissionCrowding = hotCoreCrowding,
  signedRadianceAuthority = 1,
}) {
  const crowding = clamp01(hotCoreCrowding);
  const emissionCrowding = clamp01(whiteEmissionCrowding);
  const radianceAuthority = clamp01(signedRadianceAuthority);
  const hotCoreReduction = 1 - crowding * HOT_CORE_SURFACE_CROWDING_REDUCTION;
  const whiteEmissionReduction =
    1 - emissionCrowding * WHITE_EMISSION_CROWDING_REDUCTION;

  return {
    hotCoreReduction,
    whiteEmissionReduction,
    crowdedHotCoreMix: clamp01(hotCoreMix) * hotCoreReduction,
    crowdedWhiteEmissionMix:
      clamp01(whiteEmissionMix) * whiteEmissionReduction * radianceAuthority,
  };
}

export function deriveWhiteEmissionFieldAuthority({
  ridgeConcentration = 0,
  causticRidgeAuthority = 0,
  opticalFocusEvidence = 0,
  structuralConcentration = 0,
  modalCoefficientEnergy = 0,
} = {}) {
  const whiteEmissionRidgeEvidence = clamp01(
    Math.max(ridgeConcentration, causticRidgeAuthority),
  );
  const whiteEmissionLocalEvidence = clamp01(
    Math.max(
      ridgeConcentration,
      clamp01(opticalFocusEvidence) * whiteEmissionRidgeEvidence,
    ),
  );
  const whiteEmissionStructuralDrive = clamp01(
    Math.max(structuralConcentration, modalCoefficientEnergy),
  );
  const whiteEmissionFieldAuthority = clamp01(
    whiteEmissionLocalEvidence * whiteEmissionStructuralDrive,
  );

  return {
    whiteEmissionRidgeEvidence,
    whiteEmissionLocalEvidence,
    whiteEmissionStructuralDrive,
    whiteEmissionFieldAuthority,
  };
}

export function deriveCrowdedWhiteEmissionMix({
  holographicEmissionLift = 0,
  whiteEmissionFieldAuthority = 0,
  whiteEmissionCrowding = 0,
  whiteEmissionFieldCrowding = null,
  crowdingReduction = WHITE_EMISSION_CROWDING_REDUCTION,
} = {}) {
  const fieldAuthority = clamp01(whiteEmissionFieldAuthority);
  const fieldCrowding =
    whiteEmissionFieldCrowding == null
      ? 1 - fieldAuthority
      : clamp01(whiteEmissionFieldCrowding);
  const crowding = Math.max(clamp01(whiteEmissionCrowding), fieldCrowding);
  const crowdingRelief =
    1 - crowding * clamp01(safeFinite(crowdingReduction, 0));
  const crowdedWhiteEmissionMix =
    clamp01(holographicEmissionLift) * fieldAuthority * crowdingRelief;

  return {
    whiteEmissionFieldCrowding: fieldCrowding,
    crowdingRelief,
    crowdedWhiteEmissionMix,
  };
}

export function deriveProjectedCausticRadianceDensity({
  causticVisibleDensity = 0,
  ridgeConcentration = 0,
  causticRidgeAuthority = 0,
  opticalFocusEvidence = 0,
  structuralConcentration = 0,
  modalCoefficientEnergy = 0,
  compression = PROJECTED_CAUSTIC_RADIANCE_COMPRESSION,
} = {}) {
  const physicalDensity = Math.max(0, safeFinite(causticVisibleDensity, 0));
  const ridgeEvidence = clamp01(
    Math.max(ridgeConcentration, causticRidgeAuthority),
  );
  const focusEvidence = clamp01(
    clamp01(opticalFocusEvidence) * mix(0.35, 1, ridgeEvidence),
  );
  const localEvidence = clamp01(Math.max(ridgeEvidence, focusEvidence));
  const structuralDrive = clamp01(
    Math.max(structuralConcentration, modalCoefficientEnergy),
  );
  const radianceAuthority = clamp01(
    Math.max(
      localEvidence * structuralDrive,
      ridgeEvidence * PROJECTED_CAUSTIC_RADIANCE_RIDGE_AUTHORITY_FLOOR,
    ),
  );
  // Authority is already a bounded physical-evidence fraction. Expanding it
  // with a square root turns weak, broad support into bright caustic readout.
  const authorityResponse = radianceAuthority;
  const compressionGate = (1 - radianceAuthority) ** 2;
  const compressedDensity =
    physicalDensity /
    (1 +
      physicalDensity *
        Math.max(0, safeFinite(compression, 0)) *
        compressionGate);
  const radianceScale = mix(
    PROJECTED_CAUSTIC_RADIANCE_MIN_SCALE,
    1,
    authorityResponse,
  );
  const projectedCausticRadianceDensity = compressedDensity * radianceScale;

  return {
    projectedCausticRadianceDensity,
    projectedCausticRadianceAuthority: radianceAuthority,
    projectedCausticAuthorityResponse: authorityResponse,
    projectedCausticLocalEvidence: localEvidence,
    projectedCausticCompressedDensity: compressedDensity,
    projectedCausticRadianceScale: radianceScale,
  };
}

export function deriveSignedInterferenceRadianceAuthority({
  cancellation = 0,
  authority = 1,
  strength = 1,
} = {}) {
  const signedCancellationAuthority =
    clamp01(cancellation) * clamp01(authority) * clamp01(strength);
  const cancellationGate = Math.pow(
    signedCancellationAuthority,
    SIGNED_INTERFERENCE_RADIANCE_CANCELLATION_POWER,
  );

  return {
    signedCancellationAuthority,
    signedRadianceAuthority: mix(
      1,
      SIGNED_INTERFERENCE_RADIANCE_GATE_MIN,
      cancellationGate,
    ),
  };
}

export function deriveStructureAwareEmissionGain({
  ridgeConcentration = 1,
  bodyCrowding = 0,
  contourMix = 0,
  highlightMask = 0,
  transientEnergy = 0,
}) {
  const ridge = clamp01(ridgeConcentration);
  const detailGate = smoothstep(
    STRUCTURE_AWARE_EMISSION_DETAIL_GATE_START,
    STRUCTURE_AWARE_EMISSION_DETAIL_GATE_END,
    ridge,
  );
  const ridgeLock = smoothstep(
    STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_START,
    STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_END,
    ridge,
  );
  const filamentEligibility = clamp01(
    ridge * STRUCTURE_AWARE_EMISSION_RIDGE_WEIGHT +
      clamp01(contourMix) *
        STRUCTURE_AWARE_EMISSION_CONTOUR_WEIGHT *
        detailGate +
      clamp01(highlightMask) *
        STRUCTURE_AWARE_EMISSION_HIGHLIGHT_WEIGHT *
        detailGate +
      ridgeLock * STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_WEIGHT,
  );
  const bodyCrowdingGate = smoothstep(
    STRUCTURE_AWARE_EMISSION_CROWDING_START,
    STRUCTURE_AWARE_EMISSION_CROWDING_END,
    bodyCrowding,
  );
  const transientRelief =
    1 - clamp01(transientEnergy) * STRUCTURE_AWARE_EMISSION_TRANSIENT_RELIEF;
  const bodySuppression =
    bodyCrowdingGate * (1 - filamentEligibility) * transientRelief;
  const emissionGain = Math.max(
    STRUCTURE_AWARE_EMISSION_MIN_GAIN,
    1 - bodySuppression * STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION,
  );

  return {
    detailGate,
    ridgeLock,
    filamentEligibility,
    bodyCrowdingGate,
    transientRelief,
    bodySuppression,
    emissionGain,
  };
}

export function deriveStableContourAccent({
  contourMix,
  boundaryMask,
  highlightMask,
}) {
  return (
    contourMix * 0.18 +
    boundaryMask * BOUNDARY_CONTOUR_ACCENT_WEIGHT +
    highlightMask * HIGHLIGHT_CONTOUR_ACCENT_WEIGHT
  );
}
