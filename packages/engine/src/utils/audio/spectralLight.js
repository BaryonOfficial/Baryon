import { clamp, clamp01, smoothstep } from "../math.js";

export const SPECTRAL_VISIBLE_RED_NM = 780;
export const SPECTRAL_VISIBLE_VIOLET_NM = 380;
export const SPECTRAL_CIE_STEP_NM = 5;
const SPECTRAL_REFERENCE_OCTAVES = 40;
const SPECTRAL_PHASE_DEFAULT = 0;
const SPECTRAL_EPSILON = 1e-6;
export const SPECTRAL_LIGHT_LANE_COUNT = 8;

const SPEED_OF_LIGHT_M_PER_S = 299_792_458;
const D65_WHITE = Object.freeze({ x: 0.95047, y: 1, z: 1.08883 });
const CIE_TABLE_MIN_NM = SPECTRAL_VISIBLE_VIOLET_NM;
const CIE_TABLE_MAX_NM = SPECTRAL_VISIBLE_RED_NM;
const SPECTRAL_LIGHT_LANE_DEFAULT_SPREAD =
  1 / (SPECTRAL_LIGHT_LANE_COUNT * 2.5);

export const SPECTRAL_CIE_1931_2DEG_5NM = Object.freeze([
  { x: 0.0014, y: 0.0, z: 0.0065 },
  { x: 0.0022, y: 0.0001, z: 0.0105 },
  { x: 0.0042, y: 0.0001, z: 0.0201 },
  { x: 0.0076, y: 0.0002, z: 0.0362 },
  { x: 0.0143, y: 0.0004, z: 0.0679 },
  { x: 0.0232, y: 0.0006, z: 0.1102 },
  { x: 0.0435, y: 0.0012, z: 0.2074 },
  { x: 0.0776, y: 0.0022, z: 0.3713 },
  { x: 0.1344, y: 0.004, z: 0.6456 },
  { x: 0.2148, y: 0.0073, z: 1.0391 },
  { x: 0.2839, y: 0.0116, z: 1.3856 },
  { x: 0.3285, y: 0.0168, z: 1.623 },
  { x: 0.3483, y: 0.023, z: 1.7471 },
  { x: 0.3481, y: 0.0298, z: 1.7826 },
  { x: 0.3362, y: 0.038, z: 1.7721 },
  { x: 0.3187, y: 0.048, z: 1.7441 },
  { x: 0.2908, y: 0.06, z: 1.6692 },
  { x: 0.2511, y: 0.0739, z: 1.5281 },
  { x: 0.1954, y: 0.091, z: 1.2876 },
  { x: 0.1421, y: 0.1126, z: 1.0419 },
  { x: 0.0956, y: 0.139, z: 0.813 },
  { x: 0.058, y: 0.1693, z: 0.6162 },
  { x: 0.032, y: 0.208, z: 0.4652 },
  { x: 0.0147, y: 0.2586, z: 0.3533 },
  { x: 0.0049, y: 0.323, z: 0.272 },
  { x: 0.0024, y: 0.4073, z: 0.2123 },
  { x: 0.0093, y: 0.503, z: 0.1582 },
  { x: 0.0291, y: 0.6082, z: 0.1117 },
  { x: 0.0633, y: 0.71, z: 0.0782 },
  { x: 0.1096, y: 0.7932, z: 0.0573 },
  { x: 0.1655, y: 0.862, z: 0.0422 },
  { x: 0.2257, y: 0.9149, z: 0.0298 },
  { x: 0.2904, y: 0.954, z: 0.0203 },
  { x: 0.3597, y: 0.9803, z: 0.0134 },
  { x: 0.4334, y: 0.995, z: 0.0087 },
  { x: 0.5121, y: 1.0, z: 0.0057 },
  { x: 0.5945, y: 0.995, z: 0.0039 },
  { x: 0.6784, y: 0.9786, z: 0.0027 },
  { x: 0.7621, y: 0.952, z: 0.0021 },
  { x: 0.8425, y: 0.9154, z: 0.0018 },
  { x: 0.9163, y: 0.87, z: 0.0017 },
  { x: 0.9786, y: 0.8163, z: 0.0014 },
  { x: 1.0263, y: 0.757, z: 0.0011 },
  { x: 1.0567, y: 0.6949, z: 0.001 },
  { x: 1.0622, y: 0.631, z: 0.0008 },
  { x: 1.0456, y: 0.5668, z: 0.0006 },
  { x: 1.0026, y: 0.503, z: 0.0003 },
  { x: 0.9384, y: 0.4412, z: 0.0002 },
  { x: 0.8544, y: 0.381, z: 0.0002 },
  { x: 0.7514, y: 0.321, z: 0.0001 },
  { x: 0.6424, y: 0.265, z: 0.0 },
  { x: 0.5419, y: 0.217, z: 0.0 },
  { x: 0.4479, y: 0.175, z: 0.0 },
  { x: 0.3608, y: 0.1382, z: 0.0 },
  { x: 0.2835, y: 0.107, z: 0.0 },
  { x: 0.2187, y: 0.0816, z: 0.0 },
  { x: 0.1649, y: 0.061, z: 0.0 },
  { x: 0.1212, y: 0.0446, z: 0.0 },
  { x: 0.0874, y: 0.032, z: 0.0 },
  { x: 0.0636, y: 0.0232, z: 0.0 },
  { x: 0.0468, y: 0.017, z: 0.0 },
  { x: 0.0329, y: 0.0119, z: 0.0 },
  { x: 0.0227, y: 0.0082, z: 0.0 },
  { x: 0.0158, y: 0.0057, z: 0.0 },
  { x: 0.0114, y: 0.0041, z: 0.0 },
  { x: 0.0081, y: 0.0029, z: 0.0 },
  { x: 0.0058, y: 0.0021, z: 0.0 },
  { x: 0.0041, y: 0.0015, z: 0.0 },
  { x: 0.0029, y: 0.001, z: 0.0 },
  { x: 0.002, y: 0.0007, z: 0.0 },
  { x: 0.0014, y: 0.0005, z: 0.0 },
  { x: 0.001, y: 0.0004, z: 0.0 },
  { x: 0.0007, y: 0.0002, z: 0.0 },
  { x: 0.0005, y: 0.0002, z: 0.0 },
  { x: 0.0003, y: 0.0001, z: 0.0 },
  { x: 0.0002, y: 0.0001, z: 0.0 },
  { x: 0.0002, y: 0.0001, z: 0.0 },
  { x: 0.0001, y: 0.0, z: 0.0 },
  { x: 0.0001, y: 0.0, z: 0.0 },
  { x: 0.0001, y: 0.0, z: 0.0 },
  { x: 0.0, y: 0.0, z: 0.0 },
]);

const SPECTRAL_LIGHT_STRENGTH_GATE_START = 0.04;
const SPECTRAL_LIGHT_STRENGTH_GATE_END = 0.32;
const SPECTRAL_OBSERVER_LUMINANCE_TARGET = 0.42;
const SPECTRAL_OBSERVER_LUMINANCE_MIN_SCALE = 0.62;

function fract(value) {
  return value - Math.floor(value);
}

function circularPhaseDistance(left, right) {
  const delta = Math.abs(fract(left) - fract(right));
  return Math.min(delta, 1 - delta);
}

function getSpectralLightLaneCenterPhase(lane) {
  return (lane + 0.5) / SPECTRAL_LIGHT_LANE_COUNT;
}

function addXyz(left, right) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

const EQUAL_ENERGY_WHITE = SPECTRAL_CIE_1931_2DEG_5NM.reduce(
  (sum, row) => addXyz(sum, row),
  { x: 0, y: 0, z: 0 },
);

function multiplyMatrixVector(matrix, vector) {
  return {
    x:
      matrix[0][0] * vector.x +
      matrix[0][1] * vector.y +
      matrix[0][2] * vector.z,
    y:
      matrix[1][0] * vector.x +
      matrix[1][1] * vector.y +
      matrix[1][2] * vector.z,
    z:
      matrix[2][0] * vector.x +
      matrix[2][1] * vector.y +
      matrix[2][2] * vector.z,
  };
}

function normalizeWhite(white) {
  if (!Number.isFinite(white?.y) || Math.abs(white.y) < SPECTRAL_EPSILON) {
    return { x: 1, y: 1, z: 1 };
  }
  return {
    x: white.x / white.y,
    y: 1,
    z: white.z / white.y,
  };
}

function adaptXyzBradford(xyz, sourceWhite, targetWhite) {
  const bradford = [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
  ];
  const bradfordInverse = [
    [0.9869929, -0.1470543, 0.1599627],
    [0.4323053, 0.5183603, 0.0492912],
    [-0.0085287, 0.0400428, 0.9684867],
  ];
  const sourceCone = multiplyMatrixVector(
    bradford,
    normalizeWhite(sourceWhite),
  );
  const targetCone = multiplyMatrixVector(
    bradford,
    normalizeWhite(targetWhite),
  );
  const cone = multiplyMatrixVector(bradford, xyz);
  return multiplyMatrixVector(bradfordInverse, {
    x: cone.x * (targetCone.x / Math.max(sourceCone.x, SPECTRAL_EPSILON)),
    y: cone.y * (targetCone.y / Math.max(sourceCone.y, SPECTRAL_EPSILON)),
    z: cone.z * (targetCone.z / Math.max(sourceCone.z, SPECTRAL_EPSILON)),
  });
}

function normalizeChromaticXyz(xyz) {
  const sum = xyz.x + xyz.y + xyz.z;
  if (!Number.isFinite(sum) || sum <= SPECTRAL_EPSILON) {
    return { x: 0, y: 0, z: 0 };
  }
  const chromaticX = xyz.x / sum;
  const chromaticY = xyz.y / sum;
  if (chromaticY <= SPECTRAL_EPSILON) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: chromaticX / chromaticY,
    y: 1,
    z: (1 - chromaticX - chromaticY) / chromaticY,
  };
}

function maxChannel(rgb) {
  return Math.max(rgb.r, rgb.g, rgb.b);
}

function linearRgbLuminance(rgb) {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

function normalizeRgbPeak(rgb) {
  const peak = maxChannel(rgb);
  if (!Number.isFinite(peak) || peak <= SPECTRAL_EPSILON) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: rgb.r / peak,
    g: rgb.g / peak,
    b: rgb.b / peak,
  };
}

function isInGamut(rgb, tolerance = 0) {
  return (
    Number.isFinite(rgb.r) &&
    Number.isFinite(rgb.g) &&
    Number.isFinite(rgb.b) &&
    rgb.r >= -tolerance &&
    rgb.g >= -tolerance &&
    rgb.b >= -tolerance &&
    rgb.r <= 1 + tolerance &&
    rgb.g <= 1 + tolerance &&
    rgb.b <= 1 + tolerance
  );
}

function linearSrgbToOklab(rgb) {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToLinearSrgb(oklab) {
  const lPrime = oklab.l + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b;
  const mPrime = oklab.l - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b;
  const sPrime = oklab.l - 0.0894841775 * oklab.a - 1.291485548 * oklab.b;
  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function clampRgb(rgb) {
  return {
    r: clamp01(rgb.r),
    g: clamp01(rgb.g),
    b: clamp01(rgb.b),
  };
}

function deriveObserverLuminanceScale(rgb) {
  const luminance = linearRgbLuminance(rgb);
  if (!Number.isFinite(luminance) || luminance <= 0) {
    return 0;
  }
  return clamp(
    SPECTRAL_OBSERVER_LUMINANCE_TARGET /
      Math.max(SPECTRAL_OBSERVER_LUMINANCE_TARGET, luminance),
    SPECTRAL_OBSERVER_LUMINANCE_MIN_SCALE,
    1,
  );
}

export function foldAudioFrequencyToSpectralPhase(
  frequencyHz,
  {
    referenceOctaves = SPECTRAL_REFERENCE_OCTAVES,
    phase = SPECTRAL_PHASE_DEFAULT,
  } = {},
) {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return 0;
  }
  const redFrequency =
    SPEED_OF_LIGHT_M_PER_S / (SPECTRAL_VISIBLE_RED_NM * 1e-9);
  return fract(
    Math.log2((frequencyHz * 2 ** referenceOctaves) / redFrequency) + phase,
  );
}

export function spectralPhaseToWavelengthNm(phase) {
  const foldedPhase = fract(Number.isFinite(phase) ? phase : 0);
  const redFrequency =
    SPEED_OF_LIGHT_M_PER_S / (SPECTRAL_VISIBLE_RED_NM * 1e-9);
  const violetFrequency =
    SPEED_OF_LIGHT_M_PER_S / (SPECTRAL_VISIBLE_VIOLET_NM * 1e-9);
  const visibleFrequency =
    redFrequency * (violetFrequency / redFrequency) ** foldedPhase;
  return (SPEED_OF_LIGHT_M_PER_S / visibleFrequency) * 1e9;
}

export function createSpectralLightLaneDistribution({
  phase = SPECTRAL_PHASE_DEFAULT,
  spread = SPECTRAL_LIGHT_LANE_DEFAULT_SPREAD,
} = {}) {
  const laneCount = SPECTRAL_LIGHT_LANE_COUNT;
  const lanes = new Float32Array(laneCount);
  const safePhase = fract(
    Number.isFinite(phase) ? phase : SPECTRAL_PHASE_DEFAULT,
  );
  const safeSpread = Number.isFinite(spread) ? Math.max(0, spread) : 0;

  if (safeSpread <= SPECTRAL_EPSILON) {
    let nearestLane = 0;
    let nearestDistance = Infinity;
    for (let lane = 0; lane < laneCount; lane += 1) {
      const lanePhase = getSpectralLightLaneCenterPhase(lane);
      const distance = circularPhaseDistance(safePhase, lanePhase);
      if (distance < nearestDistance) {
        nearestLane = lane;
        nearestDistance = distance;
      }
    }
    lanes[nearestLane] = 1;
    return lanes;
  }

  let total = 0;
  for (let lane = 0; lane < laneCount; lane += 1) {
    const lanePhase = getSpectralLightLaneCenterPhase(lane);
    const distance = circularPhaseDistance(safePhase, lanePhase);
    const weight = Math.exp(-0.5 * (distance / safeSpread) ** 2);
    lanes[lane] = weight;
    total += weight;
  }

  if (total <= SPECTRAL_EPSILON) {
    return createSpectralLightLaneDistribution({ phase: safePhase, spread: 0 });
  }

  for (let lane = 0; lane < laneCount; lane += 1) {
    lanes[lane] /= total;
  }
  return lanes;
}

export function sampleCie1931(wavelengthNm) {
  const clampedNm = clamp(
    Number.isFinite(wavelengthNm) ? wavelengthNm : CIE_TABLE_MIN_NM,
    CIE_TABLE_MIN_NM,
    CIE_TABLE_MAX_NM,
  );
  const index = (clampedNm - CIE_TABLE_MIN_NM) / SPECTRAL_CIE_STEP_NM;
  const leftIndex = Math.floor(index);
  const rightIndex = Math.min(
    SPECTRAL_CIE_1931_2DEG_5NM.length - 1,
    Math.ceil(index),
  );
  if (leftIndex === rightIndex) {
    return SPECTRAL_CIE_1931_2DEG_5NM[leftIndex];
  }
  const t = index - leftIndex;
  const left = SPECTRAL_CIE_1931_2DEG_5NM[leftIndex];
  const right = SPECTRAL_CIE_1931_2DEG_5NM[rightIndex];
  return {
    x: left.x + (right.x - left.x) * t,
    y: left.y + (right.y - left.y) * t,
    z: left.z + (right.z - left.z) * t,
  };
}

function xyzToLinearSrgb(xyz) {
  const adapted = adaptXyzBradford(
    normalizeChromaticXyz(xyz),
    EQUAL_ENERGY_WHITE,
    D65_WHITE,
  );
  return {
    r: 3.2406 * adapted.x - 1.5372 * adapted.y - 0.4986 * adapted.z,
    g: -0.9689 * adapted.x + 1.8758 * adapted.y + 0.0415 * adapted.z,
    b: 0.0557 * adapted.x - 0.204 * adapted.y + 1.057 * adapted.z,
  };
}

export function compressLinearSrgbToGamut(rgb) {
  if (isInGamut(rgb)) {
    return rgb;
  }

  const lab = linearSrgbToOklab(rgb);
  const chroma = Math.hypot(lab.a, lab.b);
  if (!Number.isFinite(chroma) || chroma <= SPECTRAL_EPSILON) {
    return clampRgb(rgb);
  }

  const hueA = lab.a / chroma;
  const hueB = lab.b / chroma;
  const l = clamp01(lab.l);
  let low = 0;
  let high = chroma;
  let best = oklabToLinearSrgb({ l, a: 0, b: 0 });

  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    const candidate = oklabToLinearSrgb({
      l,
      a: hueA * mid,
      b: hueB * mid,
    });
    if (isInGamut(candidate, 1e-5)) {
      best = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }

  return clampRgb(best);
}

function createSpectralLightLaneCenter(lane) {
  const phase = getSpectralLightLaneCenterPhase(lane);
  const wavelengthNm = spectralPhaseToWavelengthNm(phase);
  const xyz = sampleCie1931(wavelengthNm);
  const rgb = normalizeRgbPeak(
    compressLinearSrgbToGamut(normalizeRgbPeak(xyzToLinearSrgb(xyz))),
  );

  return Object.freeze({
    lane,
    phase,
    wavelengthNm,
    xyz: Object.freeze({ ...xyz }),
    rgb: Object.freeze({ ...rgb }),
  });
}

export const SPECTRAL_LIGHT_LANE_CENTERS = Object.freeze(
  Array.from({ length: SPECTRAL_LIGHT_LANE_COUNT }, (_, lane) =>
    createSpectralLightLaneCenter(lane),
  ),
);

export const SPECTRAL_LIGHT_LANE_DISPLAY_RGB = Object.freeze(
  SPECTRAL_LIGHT_LANE_CENTERS.map((center) => center.rgb),
);

export function createSpectralLightLaneDisplayMatrix() {
  return SPECTRAL_LIGHT_LANE_DISPLAY_RGB;
}

export function createEqualEnergySpectralLightColor() {
  const rgb = compressLinearSrgbToGamut(xyzToLinearSrgb(EQUAL_ENERGY_WHITE));
  return {
    rgb: normalizeRgbPeak(rgb),
    weight: 1,
    xyz: { ...EQUAL_ENERGY_WHITE },
  };
}

export function createSpectralLightColor({
  frequency = 0,
  strength = 0,
  harmonicConfidence = 0,
  accentEnergy = 0,
  transientEnergy = accentEnergy,
  spectralPhase = SPECTRAL_PHASE_DEFAULT,
} = {}) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return {
      rgb: { r: 0, g: 0, b: 0 },
      weight: 0,
      phase: 0,
      wavelengthNm: SPECTRAL_VISIBLE_RED_NM,
      xyz: { x: 0, y: 0, z: 0 },
      harmonicConfidence: 0,
      accentEnergy: 0,
      observerLuminance: 0,
      observerLuminanceScale: 0,
    };
  }

  const phase = foldAudioFrequencyToSpectralPhase(frequency, {
    phase: spectralPhase,
  });
  const wavelengthNm = spectralPhaseToWavelengthNm(phase);
  const xyz = sampleCie1931(wavelengthNm);
  const displayScaledRgb = normalizeRgbPeak(xyzToLinearSrgb(xyz));
  const rgb = normalizeRgbPeak(compressLinearSrgbToGamut(displayScaledRgb));
  const observerLuminance = linearRgbLuminance(rgb);
  const observerLuminanceScale = deriveObserverLuminanceScale(rgb);
  const strengthSignal = clamp01(strength);
  const harmonicSignal = clamp01(harmonicConfidence);
  const transientSignal = clamp01(transientEnergy);
  const strengthGate = smoothstep(
    SPECTRAL_LIGHT_STRENGTH_GATE_START,
    SPECTRAL_LIGHT_STRENGTH_GATE_END,
    strengthSignal,
  );
  const baseWeight =
    strengthSignal > 0
      ? strengthGate *
        clamp01(0.55 + 0.35 * harmonicSignal + 0.1 * transientSignal)
      : 0;
  const weight = baseWeight * observerLuminanceScale;

  return {
    rgb,
    weight,
    phase,
    wavelengthNm,
    xyz,
    harmonicConfidence: harmonicSignal,
    accentEnergy: transientSignal,
    observerLuminance,
    observerLuminanceScale,
  };
}
