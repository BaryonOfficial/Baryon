const SOUND_SPEED = 340.0;
const TOLERANCE_HZ = 1.0;
const MAX_ITERATIONS = 24;
const MAX_MODE = 36;
const FAMILY_DIVERSITY_DISTANCE = 4;

function modalFrequencyFromMagnitude(magnitude, radius) {
  return (SOUND_SPEED * 0.5 * magnitude) / radius;
}

function objective(magnitude, pitch, radius) {
  return modalFrequencyFromMagnitude(magnitude, radius) - pitch;
}

function secantSolveMagnitude(pitch, radius) {
  let x0 = 1.0;
  let x1 = Math.max(2.0, (2.0 * pitch * radius) / SOUND_SPEED);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const f0 = objective(x0, pitch, radius);
    const f1 = objective(x1, pitch, radius);

    if (Math.abs(f1) < TOLERANCE_HZ) return x1;
    if (Math.abs(f1 - f0) < 1e-6) break;

    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    x0 = x1;
    x1 = Math.max(1.0, x2);
  }

  return null;
}

function bisectionSolveMagnitude(pitch, radius) {
  let lower = 1.0;
  let upper = Math.max(2.0, ((2.0 * pitch * radius) / SOUND_SPEED) * 1.5);

  while (objective(upper, pitch, radius) < 0) {
    upper *= 1.5;
    if (upper > 256) break;
  }

  for (let i = 0; i < MAX_ITERATIONS * 2; i++) {
    const midpoint = (lower + upper) * 0.5;
    const value = objective(midpoint, pitch, radius);

    if (Math.abs(value) < TOLERANCE_HZ) return midpoint;
    if (value > 0) upper = midpoint;
    else lower = midpoint;
  }

  return (lower + upper) * 0.5;
}

function rankTriplets(targetMagnitude, maxMode = MAX_MODE) {
  const candidates = [];

  for (let u = 1; u <= maxMode; u++) {
    for (let v = u; v <= maxMode; v++) {
      for (let w = v; w <= maxMode; w++) {
        const magnitude = Math.hypot(u, v, w);
        const magnitudeError = Math.abs(magnitude - targetMagnitude);
        const balancePenalty =
          Math.abs(u - v) + Math.abs(v - w) + Math.abs(u - w);

        candidates.push({
          u,
          v,
          w,
          magnitudeError,
          balancePenalty,
        });
      }
    }
  }

  candidates.sort((left, right) => {
    if (Math.abs(left.magnitudeError - right.magnitudeError) > 1e-6) {
      return left.magnitudeError - right.magnitudeError;
    }
    if (left.balancePenalty !== right.balancePenalty) {
      return left.balancePenalty - right.balancePenalty;
    }
    if (left.u !== right.u) return left.u - right.u;
    if (left.v !== right.v) return left.v - right.v;
    return left.w - right.w;
  });

  return candidates;
}

function resolveMagnitudeForPitch(pitch, radius) {
  const secantMagnitude = secantSolveMagnitude(pitch, radius);
  return Number.isFinite(secantMagnitude)
    ? secantMagnitude
    : bisectionSolveMagnitude(pitch, radius);
}

function modeDistance(left, right) {
  return (
    Math.abs(left.u - right.u) +
    Math.abs(left.v - right.v) +
    Math.abs(left.w - right.w)
  );
}

function pickModeFamily(candidates, count) {
  const family = [];

  for (const candidate of candidates) {
    if (
      family.length > 0 &&
      family.some(
        (selected) =>
          modeDistance(selected, candidate) < FAMILY_DIVERSITY_DISTANCE,
      )
    ) {
      continue;
    }

    family.push(candidate);
    if (family.length >= count) return family;
  }

  for (const candidate of candidates) {
    if (family.length >= count) break;
    if (
      family.some(
        (selected) =>
          selected.u === candidate.u &&
          selected.v === candidate.v &&
          selected.w === candidate.w,
      )
    ) {
      continue;
    }
    family.push(candidate);
  }

  return family;
}

export function solveNormalModesForPitch(pitch, radius) {
  if (!Number.isFinite(pitch) || pitch <= 0) return null;

  const magnitude = resolveMagnitudeForPitch(pitch, radius);
  const mode = rankTriplets(magnitude, MAX_MODE)[0];
  if (!mode) return null;

  return {
    u: mode.u,
    v: mode.v,
    w: mode.w,
  };
}

export function solveModeFamilyForPitch(pitch, radius, count = 1) {
  if (!Number.isFinite(pitch) || pitch <= 0 || count <= 0) {
    return [];
  }

  const magnitude = resolveMagnitudeForPitch(pitch, radius);
  const family = pickModeFamily(rankTriplets(magnitude, MAX_MODE), count).map(
    ({ u, v, w }) => ({ u, v, w }),
  );

  return family;
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
