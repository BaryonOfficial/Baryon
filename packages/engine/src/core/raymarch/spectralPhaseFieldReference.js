import { clamp01 } from "../../utils/math.js";

export const SPECTRAL_PHASE_FIELD_REFERENCE = Object.freeze({
  supportEpsilon: 2 ** -16,
  directionEpsilon: 2 ** -20,
  firstMomentGateStart: 0.06,
  firstMomentGateEnd: 0.28,
  secondMomentGateStart: 0.18,
  secondMomentGateEnd: 0.5,
  secondMomentWeight: 0.65,
  spectralExposureSeconds: 0.1,
});

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function readFiniteVector(value, length) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    return null;
  }
  const vector = Array.from(/** @type {ArrayLike<number>} */ (value)).slice(
    0,
    length,
  );
  return vector.length === length && vector.every(Number.isFinite)
    ? vector
    : null;
}

function normalizeDirection(value, fallback = [1, 0]) {
  const vector = readFiniteVector(value, 2);
  const magnitude = vector ? Math.hypot(...vector) : 0;
  if (magnitude < SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon) {
    return [...fallback];
  }
  return vector.map((component) => component / magnitude);
}

function orientDirection(axis, reference) {
  const normalizedAxis = normalizeDirection(axis);
  const normalizedReference = normalizeDirection(reference);
  const agreement =
    normalizedAxis[0] * normalizedReference[0] +
    normalizedAxis[1] * normalizedReference[1];
  return agreement < 0
    ? [-normalizedAxis[0], -normalizedAxis[1]]
    : normalizedAxis;
}

export function deriveSpectralPhaseEvidence({
  firstMoment = [0, 0],
  secondMoment = [0, 0],
  priorDirection = [1, 0],
} = {}) {
  const m1 = readFiniteVector(firstMoment, 2) ?? [0, 0];
  const m2 = readFiniteVector(secondMoment, 2) ?? [0, 0];
  const firstMomentMagnitude = Math.hypot(...m1);
  const secondMomentMagnitude = Math.hypot(...m2);
  const rho1 = Math.min(1, firstMomentMagnitude);
  const rho2 = Math.min(1, secondMomentMagnitude);
  const directDirection =
    firstMomentMagnitude > 0
      ? m1.map((component) => component / firstMomentMagnitude)
      : [1, 0];
  const halfAngle = 0.5 * Math.atan2(m2[1], m2[0]);
  const secondMomentAxis = orientDirection(
    [Math.cos(halfAngle), Math.sin(halfAngle)],
    priorDirection,
  );
  const firstGate = smoothstep(
    SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateStart,
    SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateEnd,
    rho1,
  );
  const secondGate =
    (1 - firstGate) *
    smoothstep(
      SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateStart,
      SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateEnd,
      rho2,
    );
  const nominalGate = clamp01(
    firstGate + SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentWeight * secondGate,
  );
  const numerator = [
    firstGate * directDirection[0] +
      SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentWeight *
        secondGate *
        secondMomentAxis[0],
    firstGate * directDirection[1] +
      SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentWeight *
        secondGate *
        secondMomentAxis[1],
  ];
  const numeratorMagnitude = Math.hypot(...numerator);
  const valid =
    numeratorMagnitude >= SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon;

  return {
    rho1,
    rho2,
    diagnosticConcentration: Math.max(rho1, rho2),
    directDirection,
    secondMomentAxis,
    firstGate,
    secondGate,
    gate: valid ? nominalGate : 0,
    direction: valid
      ? numerator.map((component) => component / numeratorMagnitude)
      : normalizeDirection(priorDirection),
    valid,
  };
}

export function seedSpectralPhaseField({
  firstMoment = [0, 0],
  secondMoment = [0, 0],
  seedDirection = [1, 0],
  presence = 0,
} = {}) {
  const seed = normalizeDirection(seedDirection);
  const evidence = deriveSpectralPhaseEvidence({
    firstMoment,
    secondMoment,
    priorDirection: seed,
  });
  let direction = seed;
  let source = "response-seed";

  if (evidence.rho1 > SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateStart) {
    direction = evidence.directDirection;
    source = "first-moment";
  } else if (
    evidence.rho2 > SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateStart
  ) {
    direction = orientDirection(evidence.secondMomentAxis, seed);
    source = "second-moment";
  } else if (!(Number.isFinite(presence) && presence > 0)) {
    direction = [1, 0];
    source = "zero-support";
  }

  return {
    direction: normalizeDirection(direction),
    presence: clamp01(Number.isFinite(presence) ? presence : 0),
    diagnosticConcentration: evidence.diagnosticConcentration,
    source,
  };
}

export function resolveSpectralPhaseField({
  firstMoment = [0, 0],
  secondMoment = [0, 0],
  presence = 0,
  priorDirection = [1, 0],
  seedDirection = [1, 0],
  historyValid = true,
  deltaTimeSeconds = 0,
} = {}) {
  if (historyValid !== true) {
    return seedSpectralPhaseField({
      firstMoment,
      secondMoment,
      seedDirection,
      presence,
    });
  }

  const prior = normalizeDirection(priorDirection);
  const evidence = deriveSpectralPhaseEvidence({
    firstMoment,
    secondMoment,
    priorDirection: prior,
  });
  const safeDeltaTime = Number.isFinite(deltaTimeSeconds)
    ? Math.max(0, deltaTimeSeconds)
    : 0;
  if (safeDeltaTime === 0) {
    return {
      direction: prior,
      presence: clamp01(Number.isFinite(presence) ? presence : 0),
      diagnosticConcentration: evidence.diagnosticConcentration,
      evidenceGate: evidence.gate,
      evidenceDirection: evidence.direction,
      beta: 0,
      source: "history",
    };
  }
  const beta =
    1 -
    Math.exp(
      -safeDeltaTime / SPECTRAL_PHASE_FIELD_REFERENCE.spectralExposureSeconds,
    );
  // Hue is a direction on S1, not a vector amplitude. Normalized linear
  // blending cannot leave an antipode with a sub-half assimilation weight.
  const cross =
    prior[0] * evidence.direction[1] - prior[1] * evidence.direction[0];
  const agreement =
    prior[0] * evidence.direction[0] + prior[1] * evidence.direction[1];
  // Resolve the ambiguous half-turn consistently, including signed zero and
  // Float32 roundoff. Outside this angular tolerance, use the shorter arc.
  const delta =
    agreement < 0 &&
    Math.abs(cross) <= SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon
      ? Math.PI
      : Math.atan2(cross, agreement);
  const rotation = beta * evidence.gate * delta;
  const cosine = Math.cos(rotation),
    sine = Math.sin(rotation);
  const direction =
    rotation === 0
      ? prior
      : normalizeDirection(
          [
            prior[0] * cosine - prior[1] * sine,
            prior[0] * sine + prior[1] * cosine,
          ],
          prior,
        );

  return {
    direction,
    presence: clamp01(Number.isFinite(presence) ? presence : 0),
    diagnosticConcentration: evidence.diagnosticConcentration,
    evidenceGate: evidence.gate,
    evidenceDirection: evidence.direction,
    beta,
    source: "history",
  };
}
