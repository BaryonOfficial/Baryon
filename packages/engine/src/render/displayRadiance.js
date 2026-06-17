import { float, max, min, vec3 } from "three/tsl";
import { clamp01 } from "../utils/math.js";

const DISPLAY_RADIANCE_DEFAULTS = Object.freeze({
  displayKneeStart: 0.72,
  displayCeiling: 0.96,
  displayShoulderSoftness: 0.28,
  displayEpsilon: 1e-5,
  displayChannelCeiling: 0.985,
  preShoulderMaxLuminance: 0.92,
  preShoulderMaxChannel: 0.98,
  maxBloomSceneRatio: 0.55,
  bloomSceneFloor: 0.08,
});

function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeRgb(rgb) {
  if (Array.isArray(rgb)) {
    return [finiteOr(rgb[0]), finiteOr(rgb[1]), finiteOr(rgb[2])];
  }

  return [
    finiteOr(rgb?.r ?? rgb?.x),
    finiteOr(rgb?.g ?? rgb?.y),
    finiteOr(rgb?.b ?? rgb?.z),
  ];
}

function resolveOptions(options = {}) {
  return { ...DISPLAY_RADIANCE_DEFAULTS, ...options };
}

export function computeLinearLuminance(rgb) {
  const [r, g, b] = normalizeRgb(rgb);
  // Linear sRGB / Rec.709 relative luminance coefficients.
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function compressDisplayLuminance(luminance, options = {}) {
  const { displayKneeStart, displayCeiling, displayShoulderSoftness } =
    resolveOptions(options);
  const y = Math.max(0, finiteOr(luminance));

  if (y <= displayKneeStart) {
    return y;
  }

  return (
    displayKneeStart +
    (displayCeiling - displayKneeStart) *
      (1 -
        Math.exp(
          -(y - displayKneeStart) /
            Math.max(displayShoulderSoftness, Number.EPSILON),
        ))
  );
}

export function compressDisplayRadiance(rgb, options = {}) {
  const resolvedOptions = resolveOptions(options);
  const inputRgb = normalizeRgb(rgb).map((channel) => Math.max(0, channel));
  const inputLuminance = computeLinearLuminance(inputRgb);

  if (inputLuminance <= resolvedOptions.displayEpsilon) {
    return [0, 0, 0];
  }

  const compressedLuminance = compressDisplayLuminance(
    inputLuminance,
    resolvedOptions,
  );
  const luminanceScale =
    compressedLuminance /
    Math.max(inputLuminance, resolvedOptions.displayEpsilon);
  const luminanceCompressedRgb = inputRgb.map(
    (channel) => channel * luminanceScale,
  );
  const maxChannel = Math.max(...luminanceCompressedRgb);
  const channelScale =
    maxChannel > resolvedOptions.displayChannelCeiling
      ? resolvedOptions.displayChannelCeiling /
        Math.max(maxChannel, resolvedOptions.displayEpsilon)
      : 1;

  return luminanceCompressedRgb.map((channel) => channel * channelScale);
}

export function deriveBloomRadianceScale(sceneRgb, bloomRgb, options = {}) {
  const resolvedOptions = resolveOptions(options);
  const scene = normalizeRgb(sceneRgb).map((channel) => Math.max(0, channel));
  const bloom = normalizeRgb(bloomRgb).map((channel) => Math.max(0, channel));
  const sceneLuminance = computeLinearLuminance(scene);
  const bloomLuminance = computeLinearLuminance(bloom);
  const bloomMaxChannel = Math.max(...bloom);

  if (
    bloomLuminance <= resolvedOptions.displayEpsilon &&
    bloomMaxChannel <= resolvedOptions.displayEpsilon
  ) {
    return {
      scale: 1,
      constraints: {
        headroom: 1,
        veil: 1,
        channel: 1,
      },
      sceneLuminance,
      bloomLuminance,
    };
  }

  const headroom = clamp01(
    (resolvedOptions.preShoulderMaxLuminance - sceneLuminance) /
      Math.max(bloomLuminance, resolvedOptions.displayEpsilon),
  );
  const veil = clamp01(
    (resolvedOptions.maxBloomSceneRatio *
      Math.max(sceneLuminance, resolvedOptions.bloomSceneFloor)) /
      Math.max(bloomLuminance, resolvedOptions.displayEpsilon),
  );
  const channel = clamp01(
    (resolvedOptions.preShoulderMaxChannel - Math.max(...scene)) /
      Math.max(bloomMaxChannel, resolvedOptions.displayEpsilon),
  );

  return {
    scale: Math.min(1, headroom, veil, channel),
    constraints: {
      headroom,
      veil,
      channel,
    },
    sceneLuminance,
    bloomLuminance,
  };
}

function computeLinearLuminanceNode(rgb) {
  return rgb.r
    .mul(float(0.2126))
    .add(rgb.g.mul(float(0.7152)))
    .add(rgb.b.mul(float(0.0722)));
}

function compressDisplayLuminanceNode(luminance) {
  const kneeStart = float(DISPLAY_RADIANCE_DEFAULTS.displayKneeStart);
  const ceiling = float(DISPLAY_RADIANCE_DEFAULTS.displayCeiling);
  const softness = float(DISPLAY_RADIANCE_DEFAULTS.displayShoulderSoftness);
  const aboveKnee = max(luminance.sub(kneeStart), 0.0);

  return min(luminance, kneeStart).add(
    ceiling
      .sub(kneeStart)
      .mul(float(1.0).sub(aboveKnee.div(softness).negate().exp())),
  );
}

export function deriveBloomRadianceScaleNode(sceneRgb, bloomRgb) {
  const epsilon = float(DISPLAY_RADIANCE_DEFAULTS.displayEpsilon);
  const sceneLuminance = computeLinearLuminanceNode(sceneRgb);
  const bloomLuminance = computeLinearLuminanceNode(bloomRgb);
  const sceneMaxChannel = max(max(sceneRgb.r, sceneRgb.g), sceneRgb.b);
  const bloomMaxChannel = max(max(bloomRgb.r, bloomRgb.g), bloomRgb.b);
  const headroom = float(DISPLAY_RADIANCE_DEFAULTS.preShoulderMaxLuminance)
    .sub(sceneLuminance)
    .div(max(bloomLuminance, epsilon))
    .clamp();
  const veil = float(DISPLAY_RADIANCE_DEFAULTS.maxBloomSceneRatio)
    .mul(max(sceneLuminance, float(DISPLAY_RADIANCE_DEFAULTS.bloomSceneFloor)))
    .div(max(bloomLuminance, epsilon))
    .clamp();
  const channel = float(DISPLAY_RADIANCE_DEFAULTS.preShoulderMaxChannel)
    .sub(sceneMaxChannel)
    .div(max(bloomMaxChannel, epsilon))
    .clamp();

  return min(min(float(1.0), headroom), min(veil, channel));
}

export function compressDisplayRadianceNode(rgb) {
  const epsilon = float(DISPLAY_RADIANCE_DEFAULTS.displayEpsilon);
  const luminance = computeLinearLuminanceNode(rgb);
  const compressedLuminance = compressDisplayLuminanceNode(luminance);
  const luminanceScale = compressedLuminance.div(max(luminance, epsilon));
  const luminanceCompressedRgb = rgb.mul(luminanceScale);
  const maxChannel = max(
    max(luminanceCompressedRgb.r, luminanceCompressedRgb.g),
    luminanceCompressedRgb.b,
  );
  const channelScale = min(
    float(1.0),
    float(DISPLAY_RADIANCE_DEFAULTS.displayChannelCeiling).div(
      max(maxChannel, epsilon),
    ),
  );

  return luminanceCompressedRgb.mul(channelScale);
}

export function deriveHighlightTargetNode(
  baseColor,
  surfaceColor,
  whiteMix,
  surfacePullScale = float(1.0),
) {
  const epsilon = float(DISPLAY_RADIANCE_DEFAULTS.displayEpsilon);
  const whiteColor = vec3(1.0);
  const directWhiteTarget = baseColor
    .mul(float(1.0).sub(whiteMix))
    .add(whiteColor.mul(whiteMix));
  const baseLuminance = computeLinearLuminanceNode(baseColor);
  const surfaceLuminance = computeLinearLuminanceNode(surfaceColor);
  const targetLuminance = computeLinearLuminanceNode(directWhiteTarget);
  const surfacePull = targetLuminance
    .sub(baseLuminance)
    .div(max(surfaceLuminance.sub(baseLuminance), epsilon))
    .mul(surfacePullScale)
    .clamp();
  const highlightTarget = baseColor
    .mul(float(1.0).sub(surfacePull))
    .add(surfaceColor.mul(surfacePull));
  const highlightTargetMax = max(
    max(highlightTarget.r, highlightTarget.g),
    highlightTarget.b,
  );
  const whiteSparkle = float(DISPLAY_RADIANCE_DEFAULTS.preShoulderMaxChannel)
    .sub(highlightTargetMax)
    .div(max(float(1.0).sub(highlightTargetMax), epsilon))
    .clamp();

  const sparkleMix = whiteMix.mul(whiteSparkle);
  return highlightTarget
    .mul(float(1.0).sub(sparkleMix))
    .add(whiteColor.mul(sparkleMix));
}
