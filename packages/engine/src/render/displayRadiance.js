import {
  Fn,
  convertToTexture,
  float,
  max,
  min,
  textureSize,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

const DISPLAY_RADIANCE_DEFAULTS = Object.freeze({
  displayKneeStart: 0.72,
  displayCeiling: 0.96,
  displayShoulderSoftness: 1.2,
  displayEpsilon: 1e-5,
  displayChannelCeiling: 0.985,
  // Localized chromatic HDR is the energy source for bloom. Admit one stop
  // above display white while the luminance knee guards broad wash and the
  // final gamut fit bounds every displayed channel at displayChannelCeiling.
  preShoulderMaxChannel: 2,
});

export const DISPLAY_RADIANCE_HEADROOM_CONTRACT = Object.freeze({
  coverageEpsilon: DISPLAY_RADIANCE_DEFAULTS.displayEpsilon,
  luminanceP99Max: DISPLAY_RADIANCE_DEFAULTS.displayKneeStart,
  maxChannelP99Max: DISPLAY_RADIANCE_DEFAULTS.preShoulderMaxChannel,
  overloadThreshold: DISPLAY_RADIANCE_DEFAULTS.preShoulderMaxChannel,
  overloadShareMax: 0.01,
});

export const FIXED_OPTICAL_PSF_CORE_FRACTION = 0.95;
export const FIXED_OPTICAL_PSF_HALO_FRACTION =
  1 - FIXED_OPTICAL_PSF_CORE_FRACTION;
export const FIXED_OPTICAL_PSF_RADIUS_PIXELS = 1;
export const FIXED_OPTICAL_PSF_KERNEL_WEIGHTS = Object.freeze([
  1 / 16,
  2 / 16,
  1 / 16,
  2 / 16,
  4 / 16,
  2 / 16,
  1 / 16,
  2 / 16,
  1 / 16,
]);

const FIXED_OPTICAL_PSF_BILINEAR_OFFSETS = Object.freeze([
  Object.freeze({ x: -0.5, y: -0.5 }),
  Object.freeze({ x: 0.5, y: -0.5 }),
  Object.freeze({ x: -0.5, y: 0.5 }),
  Object.freeze({ x: 0.5, y: 0.5 }),
]);

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

function percentileNearestRank(values, percentile) {
  if (!values.length) {
    return Number.NaN;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1),
  );
  return sorted[rank];
}

/**
 * Evaluates the integrated scene-linear radiance consumed by the display
 * shoulder. Volume radiance already includes Beer-Lambert path length and must
 * not be divided by coverage as though it were a straight-alpha surface.
 * Coverage only excludes inactive samples from the evidence set.
 */
export function evaluateIntegratedSceneLinearHeadroom({
  premultipliedRadiance = [],
  coverage = [],
  channelStride = 4,
  coverageChannel = 0,
} = {}) {
  const contract = DISPLAY_RADIANCE_HEADROOM_CONTRACT;
  const stride = Math.max(3, Math.floor(finiteOr(channelStride, 4)));
  const safeCoverageChannel = Math.max(
    0,
    Math.min(stride - 1, Math.floor(finiteOr(coverageChannel, 0))),
  );
  const radianceLength = premultipliedRadiance?.length ?? 0;
  const coverageLength = coverage?.length ?? 0;
  const sampleCount = Math.floor(radianceLength / stride);
  const validShape =
    sampleCount > 0 &&
    radianceLength === sampleCount * stride &&
    coverageLength === sampleCount * stride;
  const fail = (reason, details = {}) =>
    Object.freeze({
      achieved: false,
      reason,
      sampleCount,
      activeSampleCount: 0,
      integratedRadianceLuminanceP99: Number.NaN,
      integratedRadianceMaxChannelP99: Number.NaN,
      overloadShare: Number.NaN,
      ...details,
    });

  if (!validShape) {
    return fail("invalid-shape");
  }

  const luminances = [];
  const maxChannels = [];
  let overloadCount = 0;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const offset = sampleIndex * stride;
    const sampleCoverage = coverage[offset + safeCoverageChannel];
    if (!Number.isFinite(sampleCoverage)) {
      return fail("nonfinite");
    }
    if (!(sampleCoverage > contract.coverageEpsilon)) {
      continue;
    }

    const integratedRgb = [0, 1, 2].map(
      (channel) => premultipliedRadiance[offset + channel],
    );
    if (integratedRgb.some((channel) => !Number.isFinite(channel))) {
      return fail("nonfinite");
    }
    const nonnegativeRgb = integratedRgb.map((channel) => Math.max(0, channel));
    const luminance = computeLinearLuminance(nonnegativeRgb);
    const maxChannel = Math.max(...nonnegativeRgb);
    luminances.push(luminance);
    maxChannels.push(maxChannel);
    if (maxChannel > contract.overloadThreshold) {
      overloadCount += 1;
    }
  }

  if (!luminances.length) {
    return fail("no-active-samples");
  }

  const integratedRadianceLuminanceP99 = percentileNearestRank(
    luminances,
    0.99,
  );
  const integratedRadianceMaxChannelP99 = percentileNearestRank(
    maxChannels,
    0.99,
  );
  const overloadShare = overloadCount / luminances.length;
  const passesLuminance =
    integratedRadianceLuminanceP99 <= contract.luminanceP99Max;
  const passesMaxChannel =
    integratedRadianceMaxChannelP99 <= contract.maxChannelP99Max;
  const passesOverloadShare = overloadShare <= contract.overloadShareMax;
  const achieved = passesLuminance && passesMaxChannel && passesOverloadShare;

  return Object.freeze({
    achieved,
    reason: achieved ? "headroom-pass" : "headroom-fail",
    sampleCount,
    activeSampleCount: luminances.length,
    integratedRadianceLuminanceP99,
    integratedRadianceMaxChannelP99,
    overloadShare,
    passesLuminance,
    passesMaxChannel,
    passesOverloadShare,
  });
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
  // Preserve the source chromaticity after the fixed luminance shoulder. If
  // that result exceeds the display gamut, a single scalar fits every channel
  // beneath the fixed channel ceiling. This can reduce displayed luminance,
  // but it cannot pull a saturated source toward equal-luminance gray.
  const gamutFitScale = Math.min(
    1,
    Math.max(0, resolvedOptions.displayChannelCeiling) /
      Math.max(maxChannel, resolvedOptions.displayEpsilon),
  );

  return luminanceCompressedRgb.map((channel) => channel * gamutFitScale);
}

export function composeFixedOpticalPsfRadiance(sceneRgb, blurredRgb) {
  const scene = normalizeRgb(sceneRgb).map((channel) => Math.max(0, channel));
  const blurred = normalizeRgb(blurredRgb).map((channel) =>
    Math.max(0, channel),
  );

  return scene.map(
    (channel, index) =>
      channel * FIXED_OPTICAL_PSF_CORE_FRACTION +
      blurred[index] * FIXED_OPTICAL_PSF_HALO_FRACTION,
  );
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

export function composeFixedOpticalPsfRadianceNode(sceneRgb, blurredRgb) {
  return sceneRgb
    .mul(float(FIXED_OPTICAL_PSF_CORE_FRACTION))
    .add(blurredRgb.mul(float(FIXED_OPTICAL_PSF_HALO_FRACTION)));
}

/**
 * Full-resolution, normalized 3x3 binomial display-optics profile. It samples
 * scene-referred HDR radiance before exposure/display compression; no
 * luminance threshold or time-varying parameter participates in the kernel.
 */
export const sampleFixedOpticalPsfNode = /** @type {any} */ (
  /*#__PURE__*/ Fn(
    /** @type {any} */ (
      ([radianceNode]) => {
        const radianceTexture = convertToTexture(radianceNode);
        const targetUv = radianceTexture.uvNode || uv();
        const pixelStep = vec2(1).div(
          /** @type {any} */ (textureSize(radianceTexture)),
        );
        const filteredRadiance = vec4(0).toVar();

        // Four half-texel bilinear reads reproduce the separable 1-2-1 kernel
        // exactly: corners receive 1/16, edges 2/16, and the centre 4/16.
        // Clamp-to-edge also combines the same duplicated boundary weights.
        for (const sample of FIXED_OPTICAL_PSF_BILINEAR_OFFSETS) {
          const sampleUv = targetUv.add(
            vec2(sample.x, sample.y).mul(pixelStep),
          );
          filteredRadiance.addAssign(
            radianceTexture.sample(sampleUv).mul(float(0.25)),
          );
        }

        return filteredRadiance;
      }
    ),
  )
);

export function compressDisplayRadianceNode(rgb) {
  const epsilon = float(DISPLAY_RADIANCE_DEFAULTS.displayEpsilon);
  const nonnegativeRgb = max(rgb, vec3(0.0));
  const luminance = computeLinearLuminanceNode(nonnegativeRgb);
  const compressedLuminance = compressDisplayLuminanceNode(luminance);
  const luminanceScale = compressedLuminance.div(max(luminance, epsilon));
  const luminanceCompressedRgb = nonnegativeRgb.mul(luminanceScale);
  const maxChannel = max(
    max(luminanceCompressedRgb.r, luminanceCompressedRgb.g),
    luminanceCompressedRgb.b,
  );
  // GPU mirror of the fixed chromaticity-preserving gamut fit above.
  const gamutFitScale = min(
    float(1.0),
    float(DISPLAY_RADIANCE_DEFAULTS.displayChannelCeiling).div(
      max(maxChannel, epsilon),
    ),
  );

  return luminanceCompressedRgb.mul(gamutFitScale);
}
