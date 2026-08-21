import { CAVITY_ACOUSTIC_DEFAULTS } from "../defaults.js";
import { frequencyToBinIndex } from "./audio/binFrequency.js";

// One owner for the water analogy. Both fallbacks below and the atlas cache
// key read it, so changing the analogy cannot leave a path on the old speed.
const SOUND_SPEED_WATER = CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond;
const MIN_CAVITY_INDEX = 1;
const MIN_CAVITY_MAGNITUDE = Math.sqrt(3);
const MIN_NEUMANN_MAGNITUDE = 1;
const INITIAL_SHELL_HALF_WIDTH = 0.5;
const SHELL_HALF_WIDTH_STEP = 0.5;
const MAX_SHELL_EXPANSIONS = 32;

function isOptionsObject(value) {
  return value != null && typeof value === "object";
}

function normalizeBoundaryMode(value, legacyNumericSideLength) {
  if (value === "neumann" || value === "dirichlet") {
    return value;
  }
  return legacyNumericSideLength ? "dirichlet" : "neumann";
}

function normalizeCavityOptions(sideLengthOrOptions) {
  const legacyNumericSideLength = typeof sideLengthOrOptions === "number";
  const acousticScale = isOptionsObject(sideLengthOrOptions?.acousticScale)
    ? sideLengthOrOptions.acousticScale
    : sideLengthOrOptions;
  const sideLengthMeters = legacyNumericSideLength
    ? sideLengthOrOptions
    : Number(acousticScale?.sideLengthMeters ?? 0);
  const soundSpeedMetersPerSecond = legacyNumericSideLength
    ? SOUND_SPEED_WATER
    : Number(acousticScale?.soundSpeedMetersPerSecond ?? SOUND_SPEED_WATER);
  const boundaryMode = normalizeBoundaryMode(
    sideLengthOrOptions?.boundaryMode,
    legacyNumericSideLength,
  );

  return {
    sideLengthMeters,
    soundSpeedMetersPerSecond,
    boundaryMode,
    legacyNumericSideLength,
  };
}

function isValidCavityOptions(options) {
  return (
    Number.isFinite(options.sideLengthMeters) &&
    options.sideLengthMeters > 0 &&
    Number.isFinite(options.soundSpeedMetersPerSecond) &&
    options.soundSpeedMetersPerSecond > 0
  );
}

function getTargetMagnitude(pitch, options) {
  return (
    (2 * pitch * options.sideLengthMeters) / options.soundSpeedMetersPerSecond
  );
}

function getFrequencyForMagnitude(magnitude, options) {
  return (
    (options.soundSpeedMetersPerSecond * 0.5 * magnitude) /
    options.sideLengthMeters
  );
}

function getMinimumMagnitudeForBoundary(boundaryMode) {
  return boundaryMode === "neumann"
    ? MIN_NEUMANN_MAGNITUDE
    : MIN_CAVITY_MAGNITUDE;
}

function getMinimumIndexForBoundary(boundaryMode) {
  return boundaryMode === "neumann" ? 0 : MIN_CAVITY_INDEX;
}

function hasValidModeIndices(u, v, w, boundaryMode) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(w)) {
    return false;
  }
  if (boundaryMode === "neumann") {
    return u >= 0 && v >= 0 && w >= 0 && u + v + w > 0;
  }
  return (
    u >= MIN_CAVITY_INDEX && v >= MIN_CAVITY_INDEX && w >= MIN_CAVITY_INDEX
  );
}

export function getCavityModeFrequency(u, v, w, sideLengthOrOptions) {
  const options = normalizeCavityOptions(sideLengthOrOptions);
  if (!hasValidModeIndices(u, v, w, options.boundaryMode)) {
    return 0;
  }
  if (!isValidCavityOptions(options)) {
    return 0;
  }

  return getFrequencyForMagnitude(Math.hypot(u, v, w), options);
}

export function getMinimumCavityFrequency(sideLengthOrOptions) {
  const options = normalizeCavityOptions(sideLengthOrOptions);
  if (!isValidCavityOptions(options)) return 0;
  return getFrequencyForMagnitude(
    getMinimumMagnitudeForBoundary(options.boundaryMode),
    options,
  );
}

export function getCavityAcousticFloorHz(sideLengthOrOptions) {
  return getMinimumCavityFrequency(sideLengthOrOptions);
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
  options,
) {
  const minimumMagnitude = getMinimumMagnitudeForBoundary(options.boundaryMode);
  const minimumIndex = getMinimumIndexForBoundary(options.boundaryMode);
  const lowerMagnitude = Math.max(
    minimumMagnitude,
    targetMagnitude - shellHalfWidth,
  );
  const upperMagnitude = Math.max(
    minimumMagnitude,
    targetMagnitude + shellHalfWidth,
  );
  const lowerSquared = lowerMagnitude * lowerMagnitude;
  const upperSquared = upperMagnitude * upperMagnitude;
  const candidates = [];
  const maxU = Math.max(minimumIndex, Math.floor(Math.sqrt(upperSquared / 3)));

  for (let u = minimumIndex; u <= maxU; u++) {
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
        if (!hasValidModeIndices(u, v, w, options.boundaryMode)) continue;
        const magnitude = Math.hypot(u, v, w);
        const frequency = getFrequencyForMagnitude(magnitude, options);
        candidates.push({
          u,
          v,
          w,
          naturalFrequencyHz: frequency,
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

function resolveNearestCavityModes(pitch, sideLengthOrOptions, count) {
  const options = normalizeCavityOptions(sideLengthOrOptions);
  if (!Number.isFinite(pitch) || pitch <= 0) return [];
  if (!isValidCavityOptions(options)) return [];
  if (!Number.isFinite(count) || count <= 0) return [];

  const targetMagnitude = getTargetMagnitude(pitch, options);
  const targetFrequency = pitch;
  let shellHalfWidth = INITIAL_SHELL_HALF_WIDTH;
  let candidates = [];

  for (let expansion = 0; expansion < MAX_SHELL_EXPANSIONS; expansion++) {
    candidates = enumerateCanonicalCavityModes(
      targetMagnitude,
      targetFrequency,
      shellHalfWidth,
      options,
    );
    if (candidates.length >= count) {
      return candidates.slice(0, count).map((candidate) => ({
        ...candidate,
        acousticSideLengthMeters: options.sideLengthMeters,
        soundSpeedMetersPerSecond: options.soundSpeedMetersPerSecond,
        boundaryMode: options.boundaryMode,
      }));
    }
    shellHalfWidth += SHELL_HALF_WIDTH_STEP;
  }

  return candidates.slice(0, count).map((candidate) => ({
    ...candidate,
    acousticSideLengthMeters: options.sideLengthMeters,
    soundSpeedMetersPerSecond: options.soundSpeedMetersPerSecond,
    boundaryMode: options.boundaryMode,
  }));
}

export function solveCavityModeForPitch(pitch, sideLength) {
  const mode = resolveNearestCavityModes(pitch, sideLength, 1)[0];
  if (!mode) return null;

  return {
    u: mode.u,
    v: mode.v,
    w: mode.w,
  };
}

export function resolveCavityModeFamilyForPitch(
  pitch,
  sideLengthOrOptions,
  count = 1,
) {
  return resolveNearestCavityModes(pitch, sideLengthOrOptions, count);
}

export function solveCavityModeFamilyForPitch(pitch, sideLength, count = 1) {
  return resolveNearestCavityModes(pitch, sideLength, count).map(
    ({ u, v, w, magnitudeError, frequencyError }) => ({
      u,
      v,
      w,
      magnitudeError,
      frequencyError,
    }),
  );
}

export function sampleFFTAmplitudeForFrequency(
  frequency,
  fftLinearAmplitudes,
  sampleRate,
  fftSize,
) {
  if (
    !fftLinearAmplitudes?.length ||
    !sampleRate ||
    !fftSize ||
    frequency <= 0
  ) {
    return 0;
  }

  const index = frequencyToBinIndex(
    frequency,
    fftLinearAmplitudes.length,
    sampleRate,
  );
  return fftLinearAmplitudes[index] ?? 0;
}
