import { vec3 } from "three/tsl";

export const SPECTRAL_COLORIMETRY_REFERENCE = Object.freeze({
  referenceHueOffset: 0.92,
  harmonicOrder: 2,
  referenceRelativeChroma: 0.82,
  chromaticityBase: Object.freeze([
    1.2084912873873068, 0.9199340128364738, 1.1791959324212258,
  ]),
  cosineAxis: Object.freeze([
    0.9287534381828134, -0.3515448914639626, 0.7475335930382262,
  ]),
  sineAxis: Object.freeze([
    0.931821448822781, -0.16994322376052778, -1.0604133848503292,
  ]),
  secondCosineAxis: Object.freeze([
    0.04052905162636272, -0.01495270590886131, 0.028776992939790743,
  ]),
  secondSineAxis: Object.freeze([
    0.17894853445334638, -0.03314023391328511, -0.198650458864265,
  ]),
  targetOklabLightness: 0.7,
  targetLuminance: 0.7 ** 3,
  directionEpsilon: 2 ** -20,
});

const REC709_LUMINANCE = Object.freeze([0.2126, 0.7152, 0.0722]);

function readUnitDirection(direction, fallbackDirection = [1, 0]) {
  const x = Number(direction?.[0]);
  const y = Number(direction?.[1]);
  const magnitude = Math.hypot(x, y);
  if (
    !Number.isFinite(magnitude) ||
    magnitude < SPECTRAL_COLORIMETRY_REFERENCE.directionEpsilon
  ) {
    const fallbackX = Number(fallbackDirection?.[0]);
    const fallbackY = Number(fallbackDirection?.[1]);
    const fallbackMagnitude = Math.hypot(fallbackX, fallbackY);
    return Number.isFinite(fallbackMagnitude) &&
      fallbackMagnitude >= SPECTRAL_COLORIMETRY_REFERENCE.directionEpsilon
      ? [fallbackX / fallbackMagnitude, fallbackY / fallbackMagnitude]
      : [1, 0];
  }
  return [x / magnitude, y / magnitude];
}

export function deriveRec709Luminance(rgb) {
  return [0, 1, 2].reduce(
    (sum, index) => sum + Number(rgb?.[index] ?? 0) * REC709_LUMINANCE[index],
    0,
  );
}

/**
 * Map the persistent circular phase field to a seamless, unit-luminance
 * chromaticity. The two-harmonic opponent curve is the pinned
 * projection of the gamut-relative OKLab reference wheel. Every nonconstant
 * axis lies in the Rec.709 zero-luminance plane, so acoustic radiance remains
 * the sole brightness owner. Callers must interpolate circular phase before
 * invoking this mapping; interpolating its RGB result can still cross neutral.
 */
export function resolveSpectralChromaticity(
  direction,
  { fallbackDirection = [1, 0] } = {},
) {
  const [sourceX, sourceY] = readUnitDirection(direction, fallbackDirection);
  const {
    chromaticityBase,
    cosineAxis,
    sineAxis,
    secondCosineAxis,
    secondSineAxis,
  } = SPECTRAL_COLORIMETRY_REFERENCE;
  const secondCosine = sourceX * sourceX - sourceY * sourceY;
  const secondSine = 2 * sourceX * sourceY;
  return chromaticityBase.map(
    (base, channel) =>
      base +
      cosineAxis[channel] * sourceX +
      sineAxis[channel] * sourceY +
      secondCosineAxis[channel] * secondCosine +
      secondSineAxis[channel] * secondSine,
  );
}

export function resolveSpectralSourceRgb(direction) {
  return resolveSpectralChromaticity(direction).map(
    (component) => component * SPECTRAL_COLORIMETRY_REFERENCE.targetLuminance,
  );
}

/**
 * GPU projection used only when the observer advances. Its input is already a
 * resolved unit direction, so the raymarch never pays for normalization,
 * angle recovery, harmonic evaluation, or a palette lookup.
 */
export function resolveSpectralChromaticityNode(direction) {
  const {
    chromaticityBase,
    cosineAxis,
    sineAxis,
    secondCosineAxis,
    secondSineAxis,
  } = SPECTRAL_COLORIMETRY_REFERENCE;
  const secondCosine = direction.x
    .mul(direction.x)
    .sub(direction.y.mul(direction.y));
  const secondSine = direction.x.mul(direction.y).mul(2);
  return vec3(...chromaticityBase)
    .add(vec3(...cosineAxis).mul(direction.x))
    .add(vec3(...sineAxis).mul(direction.y))
    .add(vec3(...secondCosineAxis).mul(secondCosine))
    .add(vec3(...secondSineAxis).mul(secondSine));
}

export function generateSpectralColorimetrySamples(size = 256) {
  const sampleCount = Math.max(1, Math.floor(size));
  return Object.freeze(
    Array.from({ length: sampleCount }, (_, index) => {
      const phase = (index + 0.5) / sampleCount;
      const direction = Object.freeze([
        Math.cos(phase * 2 * Math.PI),
        Math.sin(phase * 2 * Math.PI),
      ]);
      return Object.freeze({
        phase,
        direction,
        chromaticity: Object.freeze(resolveSpectralChromaticity(direction)),
        sourceRgb: Object.freeze(resolveSpectralSourceRgb(direction)),
      });
    }),
  );
}
