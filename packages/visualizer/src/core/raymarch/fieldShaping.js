export const EDGE_FADE_START = 0.88;
export const EDGE_FADE_END = 1.0;
export const SHELL_WEIGHT_MIN = 0.62;
export const SHELL_WEIGHT_START = 0.16;
export const SHELL_WEIGHT_END = 0.96;
export const SHELL_WEIGHT_MAX = 0.78;
export const COLOR_BLEND_START = 0.42;
export const COLOR_BLEND_END = 0.94;
export const DENSITY_BOOST = 3.5;
export const DENSITY_MAX = 6.0;
export const LOW_DENSITY_FADE_START = 0.14;
export const LOW_DENSITY_FADE_END = 0.42;
export const WEAK_CONTOUR_START = 0.32;
export const WEAK_CONTOUR_END = 0.82;
export const SILHOUETTE_MIN_VISIBILITY = 0.28;
export const DETAIL_LAYER_WEIGHT = 0.35;
export const BROAD_BAND_SCALE = 1.65;
export const CONTOUR_BLEND = 0.72;
export const INTERIOR_MASK_START = 0.52;
export const INTERIOR_MASK_END = 0.96;
export const BODY_DENSITY_GAIN = 0.26;
export const BODY_BOUNDARY_REDUCTION = 0.35;
export const RIM_BLOOM_BIAS_BASE = 0.35;
export const RIM_BLOOM_BIAS_GAIN = 0.45;
export const INNER_BAND_WEIGHT = 0.18;
export const LOW_MID_BAND_WEIGHT = 0.08;
export const HIGH_MID_BAND_WEIGHT = 0.05;
export const AIR_BAND_WEIGHT = 0.08;
export const COLOR_BIAS_SCALE = 0.82;
export const HIGHLIGHT_MASK_START = 0.38;
export const HIGHLIGHT_MASK_END = 0.96;
export const BOUNDARY_CONTOUR_ACCENT_WEIGHT = 0.08;
export const HIGHLIGHT_CONTOUR_ACCENT_WEIGHT = 0.04;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(a, b, t) {
  return a * (1 - t) + b * t;
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
}) {
  const broadBand = deriveBroadBand(fieldAbs, threshold);
  const interiorMask = deriveInteriorMask(radialDistance);
  const bodyBoundaryAttenuation = 1 - boundaryMask * BODY_BOUNDARY_REDUCTION;
  const bodyDensity =
    broadBand *
    structure *
    edgeFade *
    activeMask *
    interiorMask *
    BODY_DENSITY_GAIN *
    bodyBoundaryAttenuation;

  return {
    broadBand,
    interiorMask,
    bodyDensity,
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
