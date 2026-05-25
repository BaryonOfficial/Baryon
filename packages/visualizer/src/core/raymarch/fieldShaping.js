import { deriveHighlightTarget } from "../../render/displayRadiance.js";

export const EDGE_FADE_START = 0.88;
export const EDGE_FADE_END = 1.0;
export const SHELL_WEIGHT_MIN = 0.54;
export const SHELL_WEIGHT_START = 0.16;
export const SHELL_WEIGHT_END = 0.96;
export const SHELL_WEIGHT_MAX = 0.7;
export const COLOR_BLEND_START = 0.42;
export const COLOR_BLEND_END = 0.94;
export const DENSITY_BOOST = 4.6;
export const DENSITY_MAX = 6.0;
export const BROAD_BAND_SCALE = 1.65;
export const CONTOUR_BLEND = 0.82;
export const INTERIOR_MASK_START = 0.52;
export const INTERIOR_MASK_END = 0.96;
export const BODY_DENSITY_GAIN = 0.12;
export const BODY_DENSITY_MIX = 0.5;
export const BODY_BOUNDARY_REDUCTION = 0.35;
export const BODY_EXCITATION_VISIBILITY_POWER = 1.2;
export const INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX = 0.45;
export const RIM_BLOOM_BIAS_BASE = 0.35;
export const RIM_BLOOM_BIAS_GAIN = 0.45;
export const RIM_COMPRESSION_BOUNDARY_GAIN = 0.45;
export const RIM_COMPRESSION_OUTER_GAIN = 0.12;
export const INNER_BAND_WEIGHT = 0.18;
export const LOW_MID_BAND_WEIGHT = 0.08;
export const HIGH_MID_BAND_WEIGHT = 0.035;
export const AIR_BAND_WEIGHT = 0.055;
export const COLOR_BIAS_SCALE = 0.82;
export const BEAM_POWER_BASE = 1.55;
export const BEAM_POWER_TRANSIENT_GAIN = 0.35;
export const BEAM_TRANSIENT_GAIN = 0.9;
export const BEAM_SPECTRAL_GAIN = 0.55;
export const EMISSION_ROLLOFF_BASE = 0.42;
export const EMISSION_ROLLOFF_TRANSIENT_GAIN = 0.18;
export const EMISSION_ROLLOFF_MIX = 0.68;
export const MODAL_CROWDING_BODY_COMPRESSION = 0.55;
export const MODAL_CROWDING_ACCUMULATION_COMPRESSION = 0.7;
export const HOT_CORE_START = 0.56;
export const HOT_CORE_END = 0.94;
export const HOT_CORE_CROWDING_THRESHOLD_LIFT = 0.14;
export const HOT_CORE_SURFACE_CROWDING_REDUCTION = 0.34;
export const WHITE_EMISSION_CROWDING_REDUCTION = 0.72;
export const WHITE_EMISSION_CROWDING_TRANSIENT_RELIEF = 0.08;
export const STRUCTURE_AWARE_EMISSION_CROWDING_START = 0.04;
export const STRUCTURE_AWARE_EMISSION_CROWDING_END = 0.34;
export const STRUCTURE_AWARE_EMISSION_RIDGE_WEIGHT = 0.62;
export const STRUCTURE_AWARE_EMISSION_CONTOUR_WEIGHT = 0.28;
export const STRUCTURE_AWARE_EMISSION_HIGHLIGHT_WEIGHT = 0.18;
export const STRUCTURE_AWARE_EMISSION_DETAIL_GATE_START = 0.28;
export const STRUCTURE_AWARE_EMISSION_DETAIL_GATE_END = 0.76;
export const STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_START = 0.82;
export const STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_END = 0.94;
export const STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_WEIGHT = 0.18;
export const STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION = 0.72;
export const STRUCTURE_AWARE_EMISSION_TRANSIENT_RELIEF = 0.08;
export const STRUCTURE_AWARE_EMISSION_MIN_GAIN = 0.34;
export const HIGHLIGHT_MASK_START = 0.38;
export const HIGHLIGHT_MASK_END = 0.96;
export const BOUNDARY_CONTOUR_ACCENT_WEIGHT = 0.08;
export const HIGHLIGHT_CONTOUR_ACCENT_WEIGHT = 0.04;
export const HOLOGRAPHIC_TINT_RED = 0.62;
export const HOLOGRAPHIC_TINT_GREEN = 0.94;
export const HOLOGRAPHIC_TINT_BLUE = 1.0;
export const LATCHED_FOG_STRUCTURE_START = 0.55;
export const LATCHED_FOG_STRUCTURE_RANGE = 0.25;
export const LATCHED_FOG_CHANGE_END = 0.08;
export const LATCHED_FOG_TRANSIENT_RELEASE_START = 0.12;
export const LATCHED_FOG_TRANSIENT_RELEASE_END = 0.42;
export const LATCHED_FOG_BODY_REDUCTION = 0.18;
export const LATCHED_FOG_BEAM_REDUCTION = 0.12;
export const EXCITATION_VISIBILITY_COHERENCE_WEIGHT = 0.42;
export const EXCITATION_VISIBILITY_MODAL_ENERGY_WEIGHT = 0.48;
export const EXCITATION_VISIBILITY_MAX_FLOOR = 0.52;
export const EXCITATION_VISIBILITY_SOURCE_AUTHORITY_START = 0.04;
export const EXCITATION_VISIBILITY_SOURCE_AUTHORITY_END = 0.24;
export const EXCITATION_VISIBILITY_MODAL_SOURCE_AUTHORITY_WEIGHT = 0.82;
export const SIGNED_INTERFERENCE_BODY_AUTHORITY_START = 0.015;
export const SIGNED_INTERFERENCE_BODY_AUTHORITY_END = 0.12;
export const SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER = 1.2;
export const SIGNED_INTERFERENCE_RADIANCE_GATE_MIN = 0.24;
export const SIGNED_INTERFERENCE_RADIANCE_CANCELLATION_POWER = 1.15;
export const EFFECTIVE_FIELD_CANCELLATION_SUPPRESSION_SCALE = 0.85;
export const CAUSTIC_DENSITY_GAIN = 1.15;
export const CAUSTIC_FOCUS_POWER = 1.15;
export const CAUSTIC_BODY_MIX_MAX = 0.35;
export const CAUSTIC_OBSERVATION_ANCHOR_WEIGHT = 0.85;
export const CAUSTIC_EMISSION_GAIN = 1.2;
export const CANCELLATION_LUMINANCE_DROP_MIN = 0.65;
export const CAUSTIC_BROAD_CONTOUR_LEAK_MAX = 0.015;
export const CAUSTIC_COLOR_DENSITY_DELTA_MAX = 1e-6;
export const OPTICAL_SLOPE_POWER = 1.35;
export const OPTICAL_FOCUS_POWER = 1.55;
export const OPTICAL_SPACE_GATE_START = 0.035;
export const OPTICAL_SPACE_GATE_END = 0.18;
export const OPTICAL_BODY_SUPPRESSION_MAX = 0.48;
export const OPTICAL_LASER_GAIN = 1.15;
export const OPTICAL_FRINGE_MIX_MAX = 0.18;
export const OPTICAL_COLOR_DENSITY_DELTA_MAX = 1e-6;
export const OPTICAL_RECTANGULAR_STARTUP_IMPORT_DELTA_MAX = 0;
export const PHOTOGRAPHIC_SHELL_INNER_START = 0.12;
export const PHOTOGRAPHIC_SHELL_INNER_END = 0.42;
export const PHOTOGRAPHIC_SHELL_INNER_FADE_START = 0.64;
export const PHOTOGRAPHIC_SHELL_INNER_FADE_END = 0.92;
export const PHOTOGRAPHIC_SHELL_RIM_START = 0.38;
export const PHOTOGRAPHIC_SHELL_RIM_END = 0.86;
export const PHOTOGRAPHIC_SHELL_RIM_FADE_START = 0.92;
export const PHOTOGRAPHIC_SHELL_RIM_FADE_END = 1.0;
export const PHOTOGRAPHIC_APERTURE_FADE_START = 0.08;
export const PHOTOGRAPHIC_APERTURE_FADE_END = 0.28;
export const PHOTOGRAPHIC_SHELL_SUPPRESSION_START = 0.94;
export const PHOTOGRAPHIC_SHELL_SUPPRESSION_END = 1.0;
export const PHOTOGRAPHIC_SHELL_FOCUS_GAIN = 0.55;
export const PHOTOGRAPHIC_FOCUS_POWER = 1.35;
export const PHOTOGRAPHIC_BLACKFIELD_GATE_START = 0.02;
export const PHOTOGRAPHIC_BLACKFIELD_GATE_END = 0.16;
export const PHOTOGRAPHIC_DARK_BODY_RATIO = 0.18;
export const PHOTOGRAPHIC_DARK_CAUSTIC_RATIO = 0.42;
export const PHOTOGRAPHIC_LASER_GAIN = 0.42;
export const PHOTOGRAPHIC_PEAK_WHITE_START = 0.28;
export const PHOTOGRAPHIC_PEAK_WHITE_END = 0.72;
export const PHOTOGRAPHIC_BLACKFIELD_BODY_REDUCTION_MIN = 0.6;
export const PHOTOGRAPHIC_COLOR_DENSITY_DELTA_MAX =
  OPTICAL_COLOR_DENSITY_DELTA_MAX;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(a, b, t) {
  return a * (1 - t) + b * t;
}

function mixColor(left, right, t) {
  return left.map((channel, index) => mix(channel, right[index] ?? channel, t));
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function safeFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function deriveEffectiveFieldCancellationSuppression({
  effectiveCancellationRatio = 0,
  effectiveUnsignedSupport = 0,
  suppressionScale = EFFECTIVE_FIELD_CANCELLATION_SUPPRESSION_SCALE,
} = {}) {
  return clamp01(
    1 -
      clamp01(safeFinite(effectiveCancellationRatio, 0)) *
        clamp01(safeFinite(effectiveUnsignedSupport, 0)) *
        clamp01(safeFinite(suppressionScale, 0)),
  );
}

export function deriveSpectralLightColorGate({
  localFieldSupportAuthority = 0,
  signedRadianceAuthority = 1,
  causticVisibility = 0,
} = {}) {
  const signedSupport =
    clamp01(safeFinite(localFieldSupportAuthority, 0)) *
    clamp01(safeFinite(signedRadianceAuthority, 0));

  return clamp01(
    Math.max(signedSupport, clamp01(safeFinite(causticVisibility, 0))),
  );
}

export function deriveSpectralLightProjectionWeight({
  spectralMix = 1,
  spectralLightPresence = 0,
  colorGate = 1,
} = {}) {
  return clamp01(
    clamp01(safeFinite(spectralMix, 0)) *
      clamp01(safeFinite(spectralLightPresence, 0)) *
      clamp01(safeFinite(colorGate, 0)),
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

function deriveInteriorMask(radialDistance) {
  return 1 - smoothstep(INTERIOR_MASK_START, INTERIOR_MASK_END, radialDistance);
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

export function deriveShellFocus({ shellWeight = SHELL_WEIGHT_MIN } = {}) {
  const safeShellWeight = Math.max(
    0,
    Number.isFinite(shellWeight) ? shellWeight : SHELL_WEIGHT_MIN,
  );

  return clamp01(
    (safeShellWeight - SHELL_WEIGHT_MIN) /
      Math.max(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN, 1e-4),
  );
}

export function deriveLocalFieldSupportAuthority({
  effectiveUnsignedSupport = 1,
} = {}) {
  return clamp01(safeFinite(effectiveUnsignedSupport, 0));
}

export function deriveLocalGradientEvidence({
  gradientMagnitude = 0,
  amplitudeNorm = 1,
  effectiveFieldCacheActive = false,
  cachedGradientMagnitude = 0,
} = {}) {
  const safeGradientMagnitude = Math.max(0, safeFinite(gradientMagnitude, 0));
  const safeCachedGradientMagnitude = Math.max(
    0,
    safeFinite(cachedGradientMagnitude, 0),
  );
  const safeAmplitudeNorm = Math.max(1e-4, safeFinite(amplitudeNorm, 1));
  const localGradientEvidence = effectiveFieldCacheActive
    ? clamp01(safeCachedGradientMagnitude)
    : clamp01(safeGradientMagnitude / safeAmplitudeNorm);

  return { localGradientEvidence };
}

export function deriveCausticRidgeAuthority({
  modalStructureSupport = 0,
  localGradientEvidence = 0,
  shellFocus = 0,
  edgeFade = 1,
  activeMask = 1,
  effectiveUnsignedSupport = 1,
  signedBodyAuthority = 0,
} = {}) {
  const safeModalStructureSupport = clamp01(modalStructureSupport);
  const safeLocalGradientEvidence = clamp01(localGradientEvidence);
  const safeShellFocus = clamp01(shellFocus);
  const safeSignedBodyAuthority = clamp01(signedBodyAuthority);
  const localFieldSupportAuthority = deriveLocalFieldSupportAuthority({
    effectiveUnsignedSupport,
  });
  const gradientFieldAuthority =
    safeLocalGradientEvidence * localFieldSupportAuthority;
  const shellFieldAuthority =
    localFieldSupportAuthority *
    Math.max(safeLocalGradientEvidence, safeSignedBodyAuthority);
  const causticFocusAuthority = clamp01(
    Math.max(
      gradientFieldAuthority * safeModalStructureSupport,
      safeShellFocus * safeModalStructureSupport * shellFieldAuthority,
    ),
  );
  const causticRidgeAuthority =
    causticFocusAuthority * clamp01(edgeFade) * clamp01(activeMask);

  return {
    causticFocusAuthority,
    causticRidgeAuthority,
  };
}

export function deriveCausticVisibility({
  causticRidgeAuthority = 0,
  signedRadianceAuthority = 1,
} = {}) {
  return (
    clamp01(causticRidgeAuthority) *
    clamp01(signedRadianceAuthority)
  );
}

export function deriveIncoherentTrebleBodySuppression({
  trebleBroadbandEnergy = 0,
  modeCoherence = 1,
} = {}) {
  return (
    1 -
    clamp01(trebleBroadbandEnergy) *
      (1 - clamp01(modeCoherence)) *
      INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX
  );
}

export function deriveCausticDensity({
  causticFocusAuthority = 0,
  causticVisibility = 0,
  shellWeight = 1,
  transientBoost = 1,
  boundaryDensity = 1,
  latchedFogMask = 0,
} = {}) {
  return (
    CAUSTIC_DENSITY_GAIN *
    Math.pow(clamp01(causticFocusAuthority), CAUSTIC_FOCUS_POWER) *
    clamp01(causticVisibility) *
    Math.max(0, Number.isFinite(shellWeight) ? shellWeight : 0) *
    Math.max(0, Number.isFinite(transientBoost) ? transientBoost : 0) *
    clamp01(boundaryDensity) *
    (1 - clamp01(latchedFogMask) * LATCHED_FOG_BEAM_REDUCTION)
  );
}

export function deriveCausticMaterialTransferProbe({
  fieldAbs = 0,
  threshold = 0.02,
  modalStructureSupport = null,
  broadBand = null,
  localGradientEvidence = 0,
  shellFocus = 0,
  edgeFade = 1,
  activeMask = 1,
  effectiveUnsignedSupport = 1,
  effectiveCancellationRatio = null,
  excitationVisibility = 1,
  signedRadianceAuthority = 1,
  colorWeight = 0,
  transientBoost = 1,
  shellWeight = 1,
  boundaryDensity = 1,
  latchedFogMask = 0,
  trebleBroadbandEnergy = 0,
  modeCoherence = 1,
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
      shellFocus,
      edgeFade,
      activeMask,
      effectiveUnsignedSupport,
      signedBodyAuthority,
    });
  const cancellationSuppression = deriveEffectiveFieldCancellationSuppression({
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
    shellWeight,
    transientBoost,
    boundaryDensity,
    latchedFogMask,
  });
  const resolvedBroadBand =
    broadBand == null
      ? deriveBroadBand(safeFieldAbs, safeThreshold)
      : broadBand;
  const incoherentTrebleSuppression = deriveIncoherentTrebleBodySuppression({
    trebleBroadbandEnergy,
    modeCoherence,
  });
  const bodyDensity =
    clamp01(resolvedBroadBand) *
    clamp01(edgeFade) *
    clamp01(activeMask) *
    BODY_DENSITY_GAIN *
    signedBodyAuthority *
    resolvedSignedRadianceAuthority *
    Math.pow(clamp01(excitationVisibility), BODY_EXCITATION_VISIBILITY_POWER) *
    incoherentTrebleSuppression;
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
    incoherentTrebleSuppression,
    observationAnchor,
    signedRadianceAuthority: resolvedSignedRadianceAuthority,
    colorConfidence,
    emissionGain,
    localLuminance,
  };
}

export function deriveOpticalSlopeAuthority({
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
  normalPositiveT1 = [0, 0, 0],
  normalNegativeT1 = [0, 0, 0],
  normalPositiveT2 = [0, 0, 0],
  normalNegativeT2 = [0, 0, 0],
} = {}) {
  const t1 = normalizeVector3(tangent1, [1, 0, 0]);
  const t2 = normalizeVector3(tangent2, [0, 1, 0]);
  const nPositiveT1 = normalizeVector3(normalPositiveT1, [0, 0, 0]);
  const nNegativeT1 = normalizeVector3(normalNegativeT1, [0, 0, 0]);
  const nPositiveT2 = normalizeVector3(normalPositiveT2, [0, 0, 0]);
  const nNegativeT2 = normalizeVector3(normalNegativeT2, [0, 0, 0]);
  const viewPlaneNormalConvergence =
    -0.5 *
    (dotVector3(
      [
        nPositiveT1[0] - nNegativeT1[0],
        nPositiveT1[1] - nNegativeT1[1],
        nPositiveT1[2] - nNegativeT1[2],
      ],
      t1,
    ) +
      dotVector3(
        [
          nPositiveT2[0] - nNegativeT2[0],
          nPositiveT2[1] - nNegativeT2[1],
          nPositiveT2[2] - nNegativeT2[2],
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

export function deriveOpticalFocusAuthority({
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

export function deriveOpticalNegativeSpaceGate({
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

export function deriveLaserCausticRadiance({
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

export function derivePhotographicShellAuthority({
  radialDistance = 0,
  shellFocus = 0,
  shellWeight = SHELL_WEIGHT_MIN,
  contourCore = 0,
  edgeFade = 1,
  activeMask = 1,
} = {}) {
  const safeRadialDistance = clamp01(safeFinite(radialDistance, 0));
  const safeShellFocus =
    shellFocus == null
      ? deriveShellFocus({ shellWeight })
      : clamp01(safeFinite(shellFocus, 0));
  const safeContourCore = clamp01(safeFinite(contourCore, 0));
  const shellPresence = Math.max(
    safeShellFocus,
    deriveShellFocus({ shellWeight }),
  );
  const innerLensAuthority =
    smoothstep(
      PHOTOGRAPHIC_SHELL_INNER_START,
      PHOTOGRAPHIC_SHELL_INNER_END,
      safeRadialDistance,
    ) *
    (1 -
      smoothstep(
        PHOTOGRAPHIC_SHELL_INNER_FADE_START,
        PHOTOGRAPHIC_SHELL_INNER_FADE_END,
        safeRadialDistance,
      )) *
    shellPresence;
  const rimShellAuthority =
    smoothstep(
      PHOTOGRAPHIC_SHELL_RIM_START,
      PHOTOGRAPHIC_SHELL_RIM_END,
      safeRadialDistance,
    ) *
    (1 -
      smoothstep(
        PHOTOGRAPHIC_SHELL_RIM_FADE_START,
        PHOTOGRAPHIC_SHELL_RIM_FADE_END,
        safeRadialDistance,
      )) *
    Math.max(safeContourCore, shellPresence * 0.5);
  const apertureAuthority =
    (1 -
      smoothstep(
        PHOTOGRAPHIC_APERTURE_FADE_START,
        PHOTOGRAPHIC_APERTURE_FADE_END,
        safeRadialDistance,
      )) *
    safeContourCore;
  const shellSuppression = smoothstep(
    PHOTOGRAPHIC_SHELL_SUPPRESSION_START,
    PHOTOGRAPHIC_SHELL_SUPPRESSION_END,
    safeRadialDistance,
  );
  const photographicShellAuthority =
    clamp01(
      innerLensAuthority * 0.46 +
        rimShellAuthority * 0.36 +
        apertureAuthority * 0.24,
    ) *
    (1 - shellSuppression) *
    clamp01(edgeFade) *
    clamp01(activeMask);

  return {
    innerLensAuthority,
    rimShellAuthority,
    apertureAuthority,
    shellSuppression,
    photographicShellAuthority,
  };
}

export function deriveBlackfieldGate({
  photographicFocus = 0,
  causticRidgeAuthority = 0,
  gateStart = PHOTOGRAPHIC_BLACKFIELD_GATE_START,
  gateEnd = PHOTOGRAPHIC_BLACKFIELD_GATE_END,
} = {}) {
  return smoothstep(
    safeFinite(gateStart, PHOTOGRAPHIC_BLACKFIELD_GATE_START),
    safeFinite(gateEnd, PHOTOGRAPHIC_BLACKFIELD_GATE_END),
    clamp01(photographicFocus) * clamp01(causticRidgeAuthority),
  );
}

export function derivePhotographicBodyContribution({
  opticalBodyContribution = 0,
  blackfieldGate = 0,
} = {}) {
  const gate = clamp01(blackfieldGate);
  const bodyAttenuation = mix(PHOTOGRAPHIC_DARK_BODY_RATIO, 1, gate);
  const photographicBodyContribution =
    Math.max(0, safeFinite(opticalBodyContribution, 0)) * bodyAttenuation;

  return {
    bodyAttenuation,
    photographicBodyContribution,
  };
}

export function derivePhotographicRadianceScale({
  photographicFocus = 0,
  blackfieldGate = 0,
} = {}) {
  const focusedRadianceScale =
    1 + clamp01(photographicFocus) * PHOTOGRAPHIC_LASER_GAIN;

  return mix(
    PHOTOGRAPHIC_DARK_CAUSTIC_RATIO,
    focusedRadianceScale,
    clamp01(blackfieldGate),
  );
}

export function derivePhotographicColorMix({
  colorWeight = 0,
  photographicFocus = 0,
  opticalFringeWeight = 0,
  signedRadianceAuthority = 1,
  causticRidgeAuthority = 0,
  causticVisibility = 0,
} = {}) {
  const focus = clamp01(photographicFocus);
  const radianceAuthority = clamp01(signedRadianceAuthority);
  const ridgeAuthority = clamp01(causticRidgeAuthority);
  const visibility = clamp01(causticVisibility);
  const photographicSpectralWeight =
    clamp01(colorWeight) * focus * radianceAuthority;
  const photographicFringeWeight = clamp01(
    opticalFringeWeight + focus * ridgeAuthority * 0.035,
  );
  const peakWhiteSignal = focus * visibility;
  const peakWhiteMix = smoothstep(
    PHOTOGRAPHIC_PEAK_WHITE_START,
    PHOTOGRAPHIC_PEAK_WHITE_END,
    peakWhiteSignal,
  );

  return {
    photographicSpectralWeight,
    photographicFringeWeight,
    peakWhiteSignal,
    peakWhiteMix,
  };
}

export function derivePhotographicCymaticProbe({
  radialDistance = 0,
  shellWeight = SHELL_WEIGHT_MIN,
  shellFocus = null,
  contourCore = 0,
  localGradientEvidence = 0,
  edgeFade = 1,
  activeMask = 1,
  colorWeight = 0,
  signedRadianceAuthority = 1,
  ...opticalInputs
} = {}) {
  const passthroughInputs = /** @type {any} */ (opticalInputs);
  const resolvedShellFocus = shellFocus ?? passthroughInputs.shellFocus;
  const opticalProbeInputs = {
    ...opticalInputs,
    contourCore,
    localGradientEvidence,
    shellWeight,
    shellFocus: resolvedShellFocus,
    edgeFade,
    activeMask,
    colorWeight,
    signedRadianceAuthority,
  };
  const optical = deriveLaserCymaticOpticalProbe(
    /** @type {any} */ (opticalProbeInputs),
  );
  const shell = derivePhotographicShellAuthority({
    radialDistance,
    shellWeight,
    shellFocus: resolvedShellFocus,
    contourCore,
    edgeFade,
    activeMask,
  });
  const photographicFocusAuthority = clamp01(
    optical.opticalFocusAuthority *
      (1 + shell.photographicShellAuthority * PHOTOGRAPHIC_SHELL_FOCUS_GAIN),
  );
  const photographicFocus = Math.pow(
    photographicFocusAuthority,
    PHOTOGRAPHIC_FOCUS_POWER,
  );
  const blackfieldGate = deriveBlackfieldGate({
    photographicFocus,
    causticRidgeAuthority: optical.causticRidgeAuthority,
  });
  const body = derivePhotographicBodyContribution({
    opticalBodyContribution: optical.opticalBodyContribution,
    blackfieldGate,
  });
  const photographicRadianceScale = derivePhotographicRadianceScale({
    photographicFocus,
    blackfieldGate,
  });
  const photographicLaserCausticRadiance =
    optical.laserCausticRadiance * photographicRadianceScale;
  const physicalDensity =
    photographicLaserCausticRadiance + body.photographicBodyContribution;
  const color = derivePhotographicColorMix({
    colorWeight,
    photographicFocus,
    opticalFringeWeight: optical.opticalFringeWeight,
    signedRadianceAuthority: optical.signedRadianceAuthority,
    causticRidgeAuthority: optical.causticRidgeAuthority,
    causticVisibility: optical.causticVisibility,
  });
  const localLuminance =
    physicalDensity *
    optical.emissionGain *
    (0.72 + color.photographicSpectralWeight * 0.08);

  return {
    ...optical,
    ...shell,
    ...body,
    ...color,
    photographicFocusAuthority,
    photographicFocus,
    blackfieldGate,
    photographicRadianceScale,
    photographicLaserCausticRadiance,
    physicalDensity,
    localDensity: physicalDensity,
    localLuminance,
  };
}

export function deriveShellWeight({
  radialDistance,
  rimBloomBias,
  bandEnergies,
}) {
  const [sub = 0, lowMid = 0, highMid = 0, air = 0] = bandEnergies ?? [];
  const innerShellAccent = smoothstep(0, 0.45, radialDistance);
  const outerShellAccent = smoothstep(0.35, 1.0, radialDistance);
  const rimBandBias = RIM_BLOOM_BIAS_BASE + rimBloomBias * RIM_BLOOM_BIAS_GAIN;
  const shellBandMod =
    1 +
    sub * INNER_BAND_WEIGHT * (1 - innerShellAccent) +
    lowMid * LOW_MID_BAND_WEIGHT +
    highMid * HIGH_MID_BAND_WEIGHT * rimBandBias * outerShellAccent +
    air * AIR_BAND_WEIGHT * rimBandBias * outerShellAccent;

  const shellWeight =
    mix(
      SHELL_WEIGHT_MIN,
      SHELL_WEIGHT_MAX,
      smoothstep(SHELL_WEIGHT_START, SHELL_WEIGHT_END, radialDistance),
    ) * shellBandMod;

  return {
    innerShellAccent,
    outerShellAccent,
    rimBandBias,
    shellBandMod,
    shellWeight,
  };
}

export function deriveBodyDensity({
  fieldAbs,
  threshold,
  edgeFade,
  activeMask,
  radialDistance,
  boundaryMask,
  signedRadianceAuthority = 1,
  excitationVisibility = 1,
  trebleBroadbandEnergy = 0,
  modeCoherence = 1,
  structureSignal = 0,
  changeSignal = 1,
  transientEnergy = 0,
}) {
  const broadBand = deriveBroadBand(fieldAbs, threshold);
  const interiorMask = deriveInteriorMask(radialDistance);
  const bodyBoundaryAttenuation = 1 - boundaryMask * BODY_BOUNDARY_REDUCTION;
  const signedBodyAuthority = deriveSignedInterferenceBodyAuthority(fieldAbs);
  const latchedFogMask = deriveLatchedFogMask({
    structureSignal,
    changeSignal,
    transientEnergy,
  });
  const incoherentTrebleSuppression = deriveIncoherentTrebleBodySuppression({
    trebleBroadbandEnergy,
    modeCoherence,
  });
  const bodyDensity =
    broadBand *
    edgeFade *
    activeMask *
    interiorMask *
    BODY_DENSITY_GAIN *
    bodyBoundaryAttenuation *
    signedBodyAuthority *
    clamp01(signedRadianceAuthority) *
    Math.pow(clamp01(excitationVisibility), BODY_EXCITATION_VISIBILITY_POWER) *
    incoherentTrebleSuppression *
    (1 - latchedFogMask * LATCHED_FOG_BODY_REDUCTION);

  return {
    broadBand,
    interiorMask,
    signedBodyAuthority,
    signedRadianceAuthority: clamp01(signedRadianceAuthority),
    excitationVisibility: clamp01(excitationVisibility),
    incoherentTrebleSuppression,
    latchedFogMask,
    bodyDensity,
  };
}

export function deriveBeamMask({
  contourShape,
  shellWeight,
  localGradientEvidence,
  transientEnergy,
  spectralFlux,
  radialDistance,
  rimCompression,
  boundaryMask,
  structureSignal = 0,
  changeSignal = 1,
  signedRadianceAuthority = 1,
}) {
  const outerShellAccent = smoothstep(0.35, 1.0, radialDistance);
  const transientBoost =
    1 +
    transientEnergy * BEAM_TRANSIENT_GAIN +
    spectralFlux * BEAM_SPECTRAL_GAIN;
  const rimCompressionMix = clamp01(
    boundaryMask * rimCompression * RIM_COMPRESSION_BOUNDARY_GAIN +
      outerShellAccent * rimCompression * RIM_COMPRESSION_OUTER_GAIN,
  );
  const compressedShellWeight = shellWeight * (1 - rimCompressionMix);
  const beamCore = Math.pow(
    contourShape,
    BEAM_POWER_BASE + transientEnergy * BEAM_POWER_TRANSIENT_GAIN,
  );
  const latchedFogMask = deriveLatchedFogMask({
    structureSignal,
    changeSignal,
    transientEnergy,
  });
  const beamMask =
    beamCore *
    clamp01(localGradientEvidence) *
    compressedShellWeight *
    transientBoost *
    clamp01(signedRadianceAuthority) *
    (1 - latchedFogMask * LATCHED_FOG_BEAM_REDUCTION);

  return {
    outerShellAccent,
    transientBoost,
    rimCompressionMix,
    compressedShellWeight,
    beamCore,
    latchedFogMask,
    beamMask,
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

export function deriveHolographicColorMix({
  baseColor,
  surfaceColor,
  holographicShift,
  holographicFresnel,
}) {
  const tintTarget = [
    HOLOGRAPHIC_TINT_RED,
    HOLOGRAPHIC_TINT_GREEN,
    HOLOGRAPHIC_TINT_BLUE,
  ];
  const tintBlend = clamp01(0.25 + (holographicShift ?? 0) * 0.75);
  const accentColor = mixColor(surfaceColor, tintTarget, tintBlend);
  const colorMix = clamp01(
    (holographicFresnel ?? 0) * (0.35 + (holographicShift ?? 0) * 0.65),
  );
  const emissiveLift = clamp01(
    (holographicFresnel ?? 0) * (0.12 + (holographicShift ?? 0) * 0.18),
  );

  return {
    accentColor,
    colorMix,
    emissiveLift,
    holographicColor: mixColor(baseColor, accentColor, colorMix),
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

export function deriveHuePreservingHighlightTarget({
  baseColor,
  surfaceColor,
  targetLuminance,
  whiteEmissionMix = 0,
}) {
  const highlight = deriveHighlightTarget(baseColor, surfaceColor, {
    targetLuminance,
    whiteMix: whiteEmissionMix,
  });

  return {
    ...highlight,
    targetColor: highlight.targetRgb,
    finalColor: highlight.finalRgb,
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
