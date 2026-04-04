const SOUND_SPEED_WATER = 1480;
const MIN_CAVITY_INDEX = 1;
const MIN_CAVITY_MAGNITUDE = Math.sqrt(3);
const INITIAL_SHELL_HALF_WIDTH = 0.5;
const SHELL_HALF_WIDTH_STEP = 0.5;
const MAX_SHELL_EXPANSIONS = 32;

function getTargetMagnitude(pitch, radius) {
  return (2 * pitch * radius) / SOUND_SPEED_WATER;
}

function getFrequencyForMagnitude(magnitude, radius) {
  return (SOUND_SPEED_WATER * 0.5 * magnitude) / radius;
}

export function getCavityModeFrequency(u, v, w, radius) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(w)) {
    return 0;
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    return 0;
  }

  return getFrequencyForMagnitude(Math.hypot(u, v, w), radius);
}

export function getMinimumCavityFrequency(radius) {
  return getCavityModeFrequency(1, 1, 1, radius);
}

function compareCavityCandidates(left, right) {
  if (Math.abs(left.frequencyError - right.frequencyError) > 1e-9) {
    return left.frequencyError - right.frequencyError;
  }
  if (Math.abs(left.magnitudeError - right.magnitudeError) > 1e-9) {
    return left.magnitudeError - right.magnitudeError;
  }
  if (left.modeIndexSum !== right.modeIndexSum) {
    return left.modeIndexSum - right.modeIndexSum;
  }
  if (left.u !== right.u) return left.u - right.u;
  if (left.v !== right.v) return left.v - right.v;
  return left.w - right.w;
}

function enumerateCanonicalCavityModes(
  targetMagnitude,
  targetFrequency,
  shellHalfWidth,
  radius,
) {
  const lowerMagnitude = Math.max(
    MIN_CAVITY_MAGNITUDE,
    targetMagnitude - shellHalfWidth,
  );
  const upperMagnitude = Math.max(
    MIN_CAVITY_MAGNITUDE,
    targetMagnitude + shellHalfWidth,
  );
  const lowerSquared = lowerMagnitude * lowerMagnitude;
  const upperSquared = upperMagnitude * upperMagnitude;
  const candidates = [];
  const maxU = Math.max(
    MIN_CAVITY_INDEX,
    Math.floor(Math.sqrt(upperSquared / 3)),
  );

  for (let u = MIN_CAVITY_INDEX; u <= maxU; u++) {
    const uSquared = u * u;
    const maxV = Math.floor(Math.sqrt((upperSquared - uSquared) / 2));
    for (let v = u; v <= maxV; v++) {
      const baseSquared = uSquared + v * v;
      const minW = Math.max(
        v,
        Math.ceil(Math.sqrt(Math.max(0, lowerSquared - baseSquared))),
      );
      const maxW = Math.floor(
        Math.sqrt(Math.max(0, upperSquared - baseSquared)),
      );

      for (let w = minW; w <= maxW; w++) {
        const magnitude = Math.hypot(u, v, w);
        const frequency = getFrequencyForMagnitude(magnitude, radius);
        candidates.push({
          u,
          v,
          w,
          magnitudeError: Math.abs(magnitude - targetMagnitude),
          frequencyError: Math.abs(frequency - targetFrequency),
          modeIndexSum: u + v + w,
        });
      }
    }
  }

  candidates.sort(compareCavityCandidates);
  return candidates;
}

function resolveNearestCavityModes(pitch, radius, count) {
  if (!Number.isFinite(pitch) || pitch <= 0) return [];
  if (!Number.isFinite(radius) || radius <= 0) return [];
  if (!Number.isFinite(count) || count <= 0) return [];

  const targetMagnitude = getTargetMagnitude(pitch, radius);
  const targetFrequency = getFrequencyForMagnitude(targetMagnitude, radius);
  let shellHalfWidth = INITIAL_SHELL_HALF_WIDTH;
  let candidates = [];

  for (let expansion = 0; expansion < MAX_SHELL_EXPANSIONS; expansion++) {
    candidates = enumerateCanonicalCavityModes(
      targetMagnitude,
      targetFrequency,
      shellHalfWidth,
      radius,
    );
    if (candidates.length >= count) {
      return candidates.slice(0, count);
    }
    shellHalfWidth += SHELL_HALF_WIDTH_STEP;
  }

  return candidates.slice(0, count);
}

export function solveCavityModeForPitch(pitch, radius) {
  const mode = resolveNearestCavityModes(pitch, radius, 1)[0];
  if (!mode) return null;

  return {
    u: mode.u,
    v: mode.v,
    w: mode.w,
  };
}

export function solveCavityModeFamilyForPitch(pitch, radius, count = 1) {
  return resolveNearestCavityModes(pitch, radius, count).map(
    ({ u, v, w, magnitudeError, frequencyError }) => ({
      u,
      v,
      w,
      magnitudeError,
      frequencyError,
    }),
  );
}

export const LEGACY_PEAK_ANALYSIS_MAX_FLOOR_HZ = 180;
const LEGACY_PEAK_ANALYSIS_MIN_RADIUS =
  (SOUND_SPEED_WATER * Math.sqrt(3)) / (2 * LEGACY_PEAK_ANALYSIS_MAX_FLOOR_HZ);

/**
 * Returns the minimum cavity radius such that the physical floor frequency
 * does not exceed LEGACY_PEAK_ANALYSIS_MAX_FLOOR_HZ. Used exclusively by the
 * legacy peak-to-family mapping paths — must not leak into renderer or
 * modal-excitation code.
 */
export function getLegacyAnalysisRadius(radius) {
  return Math.max(radius, LEGACY_PEAK_ANALYSIS_MIN_RADIUS);
}

export function getLegacyAnalysisFloorHz(radius) {
  return getMinimumCavityFrequency(getLegacyAnalysisRadius(radius));
}

export function sampleFFTAmplitudeForFrequency(
  frequency,
  fftMagnitudes,
  sampleRate,
  fftSize,
) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize || frequency <= 0) {
    return 0;
  }

  const nyquist = sampleRate * 0.5;
  const bin = Math.round((frequency / nyquist) * (fftSize * 0.5 - 1));
  const index = Math.max(0, Math.min(fftMagnitudes.length - 1, bin));
  return fftMagnitudes[index] ?? 0;
}
