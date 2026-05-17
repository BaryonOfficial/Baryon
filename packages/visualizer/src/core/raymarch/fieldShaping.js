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
export const LOW_DENSITY_FADE_START = 0.22;
export const LOW_DENSITY_FADE_END = 0.34;
export const DETAIL_LAYER_WEIGHT = 0.45;
export const BROAD_BAND_SCALE = 1.65;
export const CONTOUR_BLEND = 0.82;
export const INTERIOR_MASK_START = 0.52;
export const INTERIOR_MASK_END = 0.96;
export const BODY_DENSITY_GAIN = 0.12;
export const BODY_DENSITY_MIX = 0.5;
export const BODY_BOUNDARY_REDUCTION = 0.35;
export const RIM_BLOOM_BIAS_BASE = 0.35;
export const RIM_BLOOM_BIAS_GAIN = 0.45;
export const RIM_COMPRESSION_BOUNDARY_GAIN = 0.45;
export const RIM_COMPRESSION_OUTER_GAIN = 0.12;
export const INNER_BAND_WEIGHT = 0.18;
export const LOW_MID_BAND_WEIGHT = 0.08;
export const HIGH_MID_BAND_WEIGHT = 0.035;
export const AIR_BAND_WEIGHT = 0.055;
export const BASS_STRUCTURE_FLOOR_MAX = 0.24;
export const BASS_STRUCTURE_FLOOR_BAND_WEIGHT = 0.22;
export const BASS_STRUCTURE_FLOOR_SALIENCE_WEIGHT = 0.18;
export const BASS_STRUCTURE_FLOOR_OUTER_REDUCTION = 0.35;
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
export const MODAL_VISIBILITY_DENSITY_LIFT = 0.3;
export const MODAL_VISIBILITY_DENSITY_FLOOR = 0.22;
export const RETAINED_HIGH_Q_RIDGE_DENSITY_FLOOR = 0.24;
export const RETAINED_HIGH_Q_RIDGE_DENSITY_LIFT = 0.18;
export const RETAINED_HIGH_Q_RIDGE_CONTOUR_ACCENT = 0.08;
export const RETAINED_HIGH_Q_RIDGE_SUPPORT_WEIGHT = 0.72;

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

function deriveNodeBand(fieldAbs, threshold) {
  return 1 - smoothstep(0, threshold, fieldAbs);
}

function deriveBroadBand(fieldAbs, threshold) {
  return 1 - smoothstep(0, threshold * BROAD_BAND_SCALE, fieldAbs);
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

export function deriveExcitationVisibility({
  excitationGate = 0,
  modeCoherence = 0,
  modalVisibilityEnergy = 0,
  sourceAuthority = 1,
}) {
  const effectiveSourceAuthority = Math.max(
    sourceAuthority,
    modalVisibilityEnergy * EXCITATION_VISIBILITY_MODAL_SOURCE_AUTHORITY_WEIGHT,
  );
  const sourceAuthorityGate = smoothstep(
    EXCITATION_VISIBILITY_SOURCE_AUTHORITY_START,
    EXCITATION_VISIBILITY_SOURCE_AUTHORITY_END,
    effectiveSourceAuthority,
  );
  const excitationFloor =
    Math.min(
      EXCITATION_VISIBILITY_MAX_FLOOR,
      clamp01(
        modeCoherence * EXCITATION_VISIBILITY_COHERENCE_WEIGHT +
          modalVisibilityEnergy * EXCITATION_VISIBILITY_MODAL_ENERGY_WEIGHT,
      ),
    ) * sourceAuthorityGate;

  return Math.max(excitationGate, excitationFloor);
}

export function deriveContourGainBase({
  structureSignal = 0,
  modeCoherence = 0,
  modalVisibilityEnergy = 0,
  beatPhaseDecay = 0,
}) {
  return (
    clamp01(structureSignal) * 0.3 +
    clamp01(modeCoherence) * 0.08 +
    clamp01(modalVisibilityEnergy) * 0.12 +
    clamp01(beatPhaseDecay) * 0.18
  );
}

export function deriveSpectralColorBiasOffset({
  modeCoherence = 0,
  modalVisibilityEnergy = 0,
  changeSignal = 0,
}) {
  return (
    clamp01(modeCoherence) * 0.05 +
    clamp01(modalVisibilityEnergy) * 0.08 -
    clamp01(changeSignal) * 0.08
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
  structure,
  edgeFade,
  activeMask,
  radialDistance,
  boundaryMask,
  structureSignal = 0,
  changeSignal = 1,
  transientEnergy = 0,
}) {
  const broadBand = deriveBroadBand(fieldAbs, threshold);
  const interiorMask = deriveInteriorMask(radialDistance);
  const bodyBoundaryAttenuation = 1 - boundaryMask * BODY_BOUNDARY_REDUCTION;
  const latchedFogMask = deriveLatchedFogMask({
    structureSignal,
    changeSignal,
    transientEnergy,
  });
  const bodyDensity =
    broadBand *
    structure *
    edgeFade *
    activeMask *
    interiorMask *
    BODY_DENSITY_GAIN *
    bodyBoundaryAttenuation *
    (1 - latchedFogMask * LATCHED_FOG_BODY_REDUCTION);

  return {
    broadBand,
    interiorMask,
    latchedFogMask,
    bodyDensity,
  };
}

export function deriveVisibleStructure({
  structure,
  nodeBand,
  bassSalience = 0,
  bandEnergies,
  radialDistance,
}) {
  const [sub = 0, lowMid = 0] = bandEnergies ?? [];
  const outerShellAccent = smoothstep(0.35, 1.0, radialDistance);
  const bassEnvelope = clamp01(
    sub * BASS_STRUCTURE_FLOOR_BAND_WEIGHT +
      lowMid * LOW_MID_BAND_WEIGHT +
      bassSalience * BASS_STRUCTURE_FLOOR_SALIENCE_WEIGHT,
  );
  const bassStructureFloor =
    bassEnvelope *
    nodeBand *
    (1 - outerShellAccent * BASS_STRUCTURE_FLOOR_OUTER_REDUCTION) *
    BASS_STRUCTURE_FLOOR_MAX;

  return {
    outerShellAccent,
    bassEnvelope,
    bassStructureFloor,
    visibleStructure: Math.max(structure, bassStructureFloor),
  };
}

export function deriveBeamMask({
  contourShape,
  shellWeight,
  structure,
  transientEnergy,
  spectralFlux,
  radialDistance,
  rimCompression,
  boundaryMask,
  structureSignal = 0,
  changeSignal = 1,
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
    structure *
    compressedShellWeight *
    transientBoost *
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

export function deriveVisibleDensity({
  density,
  modalVisibilityEnergy = 0,
  modalVisibilityRetainedHighQEnergy = 0,
  modalStructureAnchor = 0,
  ridgeAnchor = 0,
  ridgeSupportAnchor = 0,
}) {
  const retainedHighQSpatialAnchor = Math.max(
    clamp01(ridgeAnchor),
    clamp01(ridgeSupportAnchor) * RETAINED_HIGH_Q_RIDGE_SUPPORT_WEIGHT,
  );
  const retainedHighQRidgeAnchor =
    clamp01(modalVisibilityRetainedHighQEnergy) *
    clamp01(modalStructureAnchor) *
    retainedHighQSpatialAnchor;
  const physicalVisibilityGate = smoothstep(
    LOW_DENSITY_FADE_START,
    LOW_DENSITY_FADE_END,
    density,
  );
  const modalLift =
    clamp01(modalVisibilityEnergy) *
    clamp01(modalStructureAnchor) *
    MODAL_VISIBILITY_DENSITY_LIFT;
  const retainedHighQRidgeLift =
    retainedHighQRidgeAnchor * RETAINED_HIGH_Q_RIDGE_DENSITY_LIFT;
  const visibilityGate = smoothstep(
    LOW_DENSITY_FADE_START,
    LOW_DENSITY_FADE_END,
    density + modalLift + retainedHighQRidgeLift,
  );
  const modalVisibleDensity =
    clamp01(modalVisibilityEnergy) *
    clamp01(modalStructureAnchor) *
    MODAL_VISIBILITY_DENSITY_FLOOR;
  const retainedHighQRidgeVisibleDensity = Math.min(
    RETAINED_HIGH_Q_RIDGE_DENSITY_FLOOR,
    retainedHighQRidgeAnchor * RETAINED_HIGH_Q_RIDGE_DENSITY_FLOOR,
  );
  const retainedHighQContourAccent =
    retainedHighQRidgeAnchor * RETAINED_HIGH_Q_RIDGE_CONTOUR_ACCENT;

  return {
    physicalVisibilityGate,
    physicalVisibleDensity: density * physicalVisibilityGate,
    modalLift,
    modalVisibleDensity,
    retainedHighQRidgeAnchor,
    retainedHighQRidgeLift,
    retainedHighQRidgeVisibleDensity,
    retainedHighQContourAccent,
    visibilityGate,
    visibleDensity: Math.max(
      density * visibilityGate,
      modalVisibleDensity,
      retainedHighQRidgeVisibleDensity,
    ),
  };
}

export function deriveRetainedHighQVisibilityDiagnostics({
  modalVisibilityEnergy = 0,
  modalVisibilityRetainedHighQEnergy = 0,
} = {}) {
  const densityVisibility = deriveVisibleDensity({
    density: 0,
    modalVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    modalStructureAnchor: 1,
    ridgeAnchor: 1,
  });
  const retainedHighQEnergy = clamp01(modalVisibilityRetainedHighQEnergy);

  return {
    retainedHighQRidgeAnchorMax: densityVisibility.retainedHighQRidgeAnchor,
    retainedHighQRidgeLiftMax: densityVisibility.retainedHighQRidgeLift,
    retainedHighQRidgeVisibleDensityMax:
      densityVisibility.retainedHighQRidgeVisibleDensity,
    retainedHighQContourAccentMax: densityVisibility.retainedHighQContourAccent,
    retainedHighQPhysicalVisibleDensityMax:
      densityVisibility.physicalVisibleDensity,
    retainedHighQRidgeToRetainedEnergyRatio:
      retainedHighQEnergy > 1e-6
        ? densityVisibility.retainedHighQRidgeVisibleDensity /
          retainedHighQEnergy
        : 0,
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
}) {
  const crowding = clamp01(hotCoreCrowding);
  const emissionCrowding = clamp01(whiteEmissionCrowding);
  const hotCoreReduction = 1 - crowding * HOT_CORE_SURFACE_CROWDING_REDUCTION;
  const whiteEmissionReduction =
    1 - emissionCrowding * WHITE_EMISSION_CROWDING_REDUCTION;

  return {
    hotCoreReduction,
    whiteEmissionReduction,
    crowdedHotCoreMix: clamp01(hotCoreMix) * hotCoreReduction,
    crowdedWhiteEmissionMix: clamp01(whiteEmissionMix) * whiteEmissionReduction,
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
    1 -
    clamp01(transientEnergy) * STRUCTURE_AWARE_EMISSION_TRANSIENT_RELIEF;
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
