import { vec3 } from "three/tsl";
import { SPECTRAL_COLORIMETRY_COEFFICIENTS } from "./spectralColorimetryCoefficients.js";

export const SPECTRAL_COLORIMETRY_REFERENCE = Object.freeze({
  referenceHueOffset: 0.92,
  referenceRelativeChroma: 0.82,
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

export function resolveSpectralSourceRgb(direction) {
  return resolveSpectralChromaticity(direction).map(
    (component) => component * SPECTRAL_COLORIMETRY_REFERENCE.targetLuminance,
  );
}

/** Map resolved circular phase to unit-Rec.709-luminance chromaticity.
 * The single production palette uses approximately uniform OKLab arc length.
 * Its coefficients are fitted offline; scalar acoustic radiance owns brightness.
 * Resolve/interpolate circular phase before mapping, never infer phase from RGB.
 */
export function resolveSpectralChromaticity(
  direction,
  { fallbackDirection = [1, 0] } = {},
) {
  const [x, y] = readUnitDirection(direction, fallbackDirection);
  const { base, cosine, sine } = SPECTRAL_COLORIMETRY_COEFFICIENTS;
  const rgb = [...base];
  let hx = x,
    hy = y;
  for (let k = 0; k < cosine.length; k++) {
    for (let c = 0; c < 3; c++) rgb[c] += cosine[k][c] * hx + sine[k][c] * hy;
    [hx, hy] = [hx * x - hy * y, hx * y + hy * x];
  }
  return rgb;
}

/** Evaluated once per observer voxel, never per ray sample.
 * The input is the resolved unit phase; the observer caches the RGB companion.
 */
export function resolveSpectralChromaticityNode(direction) {
  const { base, cosine, sine } = SPECTRAL_COLORIMETRY_COEFFICIENTS;
  const rgb = vec3(...base).toVar();
  let hx = direction.x,
    hy = direction.y;
  for (let k = 0; k < cosine.length; k++) {
    rgb.addAssign(
      vec3(...cosine[k])
        .mul(hx)
        .add(vec3(...sine[k]).mul(hy)),
    );
    const nextX = hx.mul(direction.x).sub(hy.mul(direction.y)).toVar();
    hy = hx.mul(direction.y).add(hy.mul(direction.x)).toVar();
    hx = nextX;
  }
  return rgb;
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
