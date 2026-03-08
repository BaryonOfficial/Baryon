const SOUND_SPEED = 340.0;
const TOLERANCE_HZ = 1.0;
const MAX_ITERATIONS = 24;

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
  let upper = Math.max(2.0, (2.0 * pitch * radius) / SOUND_SPEED * 1.5);

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

function nearestTriplet(targetMagnitude, maxMode = 24) {
  let best = null;
  let bestMagnitudeError = Number.POSITIVE_INFINITY;
  let bestBalancePenalty = Number.POSITIVE_INFINITY;

  for (let u = 1; u <= maxMode; u++) {
    for (let v = 1; v <= maxMode; v++) {
      for (let w = 1; w <= maxMode; w++) {
        const magnitude = Math.hypot(u, v, w);
        const magnitudeError = Math.abs(magnitude - targetMagnitude);
        const balancePenalty = Math.abs(u - v) + Math.abs(v - w) + Math.abs(u - w);

        if (
          magnitudeError < bestMagnitudeError - 1e-6 ||
          (Math.abs(magnitudeError - bestMagnitudeError) <= 1e-6 && balancePenalty < bestBalancePenalty)
        ) {
          bestMagnitudeError = magnitudeError;
          bestBalancePenalty = balancePenalty;
          best = { u, v, w };
        }
      }
    }
  }

  return best;
}

export function solveNormalModesForPitch(pitch, radius) {
  if (!Number.isFinite(pitch) || pitch <= 0) return null;

  const secantMagnitude = secantSolveMagnitude(pitch, radius);
  const magnitude = Number.isFinite(secantMagnitude)
    ? secantMagnitude
    : bisectionSolveMagnitude(pitch, radius);

  const mode = nearestTriplet(magnitude);
  if (!mode) return null;

  return mode;
}

export function resolvePitchHistoryToModes(pitchHistory, radius) {
  const slots = new Float32Array(pitchHistory.length * 4);

  for (let i = 0; i < pitchHistory.length; i++) {
    const item = pitchHistory[i];
    if (!item || item.amplitude <= 0 || item.frequency <= 0) continue;

    const mode = solveNormalModesForPitch(item.frequency, radius);
    if (!mode) continue;

    slots[i * 4] = mode.u;
    slots[i * 4 + 1] = mode.v;
    slots[i * 4 + 2] = mode.w;
    slots[i * 4 + 3] = item.amplitude;
  }

  return slots;
}
