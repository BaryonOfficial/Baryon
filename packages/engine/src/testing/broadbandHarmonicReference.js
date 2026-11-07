import { referenceBroadbandTransfer } from "./broadbandModalReference.js";

// Independent settled-response oracle. The sampled solver uses a closed-form
// oscillator transition and a complex resolvent, not the candidate's matrix
// exponential, running state, Sylvester reconstruction or Gaussian quadrature.
// Composite Simpson refinement controls its within-hold moment integration.
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const multiply = (a, b) => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const conjugate = (a) => [a[0], -a[1]];
const cis = (angle) => [Math.cos(angle), Math.sin(angle)];
function divide(a, b) {
  const norm = b[0] ** 2 + b[1] ** 2;
  return scale(multiply(a, conjugate(b)), 1 / norm);
}

function validate({ shells, tones, exposureSeconds }) {
  if (
    !shells?.length ||
    !tones?.length ||
    !Number.isFinite(exposureSeconds) ||
    exposureSeconds <= 0 ||
    shells.some(
      (s) =>
        !Number.isFinite(s.naturalFrequencyHz) ||
        s.naturalFrequencyHz <= 0 ||
        !Number.isFinite(s.qualityFactor) ||
        s.qualityFactor < 0.5,
    ) ||
    tones.some(
      (t) =>
        !Number.isFinite(t.frequencyHz) ||
        t.frequencyHz <= 0 ||
        !Number.isFinite(t.amplitude) ||
        !Number.isFinite(t.phaseRad ?? 0),
    )
  )
    throw new RangeError("invalid harmonic reference configuration");
}

function transition(shell, time) {
  const w = 2 * Math.PI * shell.naturalFrequencyHz;
  const d = w / shell.qualityFactor;
  const nu = w * Math.sqrt(1 - 1 / (4 * shell.qualityFactor ** 2));
  const phase = nu * time;
  const sinOverNu =
    Math.abs(phase) < 1e-4
      ? time * (1 - phase ** 2 / 6 + phase ** 4 / 120)
      : Math.sin(phase) / nu;
  const envelope = Math.exp((-d * time) / 2);
  const cosine = Math.cos(phase);
  const f = [
    envelope * (cosine - (d * sinOverNu) / 2),
    -envelope * w * sinOverNu,
    envelope * w * sinOverNu,
    envelope * (cosine + (d * sinOverNu) / 2),
  ];
  // The constant-input equilibrium is (P,R)=(0,x/Q).
  return {
    f,
    b: [-f[1] / shell.qualityFactor, (1 - f[3]) / shell.qualityFactor],
  };
}

function sampledPhasor(shell, frequencyHz, sampleRate) {
  const { f, b } = transition(shell, 1 / sampleRate);
  const z = cis((2 * Math.PI * frequencyHz) / sampleRate);
  const a = add(z, [-f[0], 0]),
    d = add(z, [-f[3], 0]);
  const determinant = add(multiply(a, d), [-f[1] * f[2], 0]);
  return [
    divide(add(scale(d, b[0]), [f[1] * b[1], 0]), determinant),
    divide(add([f[2] * b[0], 0], scale(a, b[1])), determinant),
  ];
}

function outputState(coefficients, tones, timeSeconds) {
  return {
    pressure: Float64Array.from(coefficients, (modes) =>
      modes.reduce(
        (sum, mode, t) =>
          sum +
          multiply(
            mode[0],
            cis(2 * Math.PI * tones[t].frequencyHz * timeSeconds),
          )[0],
        0,
      ),
    ),
    velocity: Float64Array.from(coefficients, (modes) =>
      modes.reduce(
        (sum, mode, t) =>
          sum +
          multiply(
            mode[1],
            cis(2 * Math.PI * tones[t].frequencyHz * timeSeconds),
          )[0],
        0,
      ),
    ),
  };
}
function sourcePhasor(tone) {
  return scale(cis(tone.phaseRad ?? 0), tone.amplitude);
}

/**
 * Steady response to real tones present for all past time. In particular these
 * moments are not a zero-history onset reference. Includes both difference-
 * and sum-frequency terms, with continuous 1/(1+i*Omega*tau) observation.
 */
export function referenceContinuousHarmonicResponse({
  shells,
  tones,
  timeSeconds,
  exposureSeconds = 0.05,
}) {
  validate({ shells, tones, exposureSeconds });
  if (!Number.isFinite(timeSeconds)) throw new RangeError("invalid time");
  const coefficients = shells.map((shell) =>
    tones.map((tone) => {
      const h = referenceBroadbandTransfer(shell, tone.frequencyHz);
      return [h.pressure, h.velocity].map((value) =>
        multiply([value.real, value.imaginary], sourcePhasor(tone)),
      );
    }),
  );
  const matrices = [0, 1].map((component) => {
    const result = new Float64Array(shells.length ** 2);
    for (let i = 0; i < shells.length; i++)
      for (let j = 0; j < shells.length; j++) {
        for (let r = 0; r < tones.length; r++)
          for (let s = 0; s < tones.length; s++) {
            for (const sign of [-1, 1]) {
              const omega =
                2 *
                Math.PI *
                (tones[r].frequencyHz + sign * tones[s].frequencyHz);
              const product = multiply(
                coefficients[i][r][component],
                sign === -1
                  ? conjugate(coefficients[j][s][component])
                  : coefficients[j][s][component],
              );
              const observed = divide(cis(omega * timeSeconds), [
                1,
                omega * exposureSeconds,
              ]);
              result[i * shells.length + j] +=
                0.5 * multiply(product, observed)[0];
            }
          }
      }
    return result;
  });
  return {
    ...outputState(coefficients, tones, timeSeconds),
    pressureMoments: matrices[0],
    velocityMoments: matrices[1],
  };
}

/**
 * Exact sampled-hold stationary state, with independently refined numerical
 * integration of continuous moments within each hold. For a pair frequency
 * theta per sample, C[n+1]=alpha*C[n]+K*exp(i*theta*n), hence its stationary
 * phasor is K/(exp(i*theta)-alpha). This retains every hold image implicitly.
 */
export function referenceHeldHarmonicResponse({
  shells,
  tones,
  sampleRate,
  sampleIndex,
  exposureSeconds = 0.05,
  quadratureIntervals = 512,
}) {
  validate({ shells, tones, exposureSeconds });
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(sampleIndex) ||
    sampleIndex < 0 ||
    !Number.isSafeInteger(quadratureIntervals) ||
    quadratureIntervals < 2 ||
    quadratureIntervals % 2 ||
    tones.some((t) => t.frequencyHz > sampleRate / 2)
  )
    throw new RangeError("invalid sampled harmonic reference configuration");
  const h = 1 / sampleRate;
  const alpha = Math.exp(-h / exposureSeconds);
  const coefficients = shells.map((shell) =>
    tones.map((tone) =>
      sampledPhasor(shell, tone.frequencyHz, sampleRate).map((c) =>
        multiply(c, sourcePhasor(tone)),
      ),
    ),
  );
  const nodes = Array.from({ length: quadratureIntervals + 1 }, (_, n) => {
    const u = (n * h) / quadratureIntervals;
    const weight =
      (((n === 0 || n === quadratureIntervals ? 1 : n % 2 ? 4 : 2) * h) /
        (3 * quadratureIntervals * exposureSeconds)) *
      Math.exp(-(h - u) / exposureSeconds);
    const values = shells.map((shell, i) => {
      const { f, b } = transition(shell, u);
      return tones.map((tone, t) => {
        const [p, r] = coefficients[i][t];
        const x = sourcePhasor(tone);
        return [
          add(add(scale(p, f[0]), scale(r, f[1])), scale(x, b[0])),
          add(add(scale(p, f[2]), scale(r, f[3])), scale(x, b[1])),
        ];
      });
    });
    return { weight, values };
  });
  const matrices = [0, 1].map((component) => {
    const result = new Float64Array(shells.length ** 2);
    for (let i = 0; i < shells.length; i++)
      for (let j = 0; j < shells.length; j++) {
        for (let r = 0; r < tones.length; r++)
          for (let s = 0; s < tones.length; s++) {
            for (const sign of [-1, 1]) {
              const theta =
                2 *
                Math.PI *
                (tones[r].frequencyHz + sign * tones[s].frequencyHz) *
                h;
              let integral = [0, 0];
              for (const { weight, values } of nodes) {
                const a = values[i][r][component],
                  b = values[j][s][component];
                integral = add(
                  integral,
                  scale(multiply(a, sign === -1 ? conjugate(b) : b), weight),
                );
              }
              const phasor = divide(integral, add(cis(theta), [-alpha, 0]));
              result[i * shells.length + j] +=
                0.5 * multiply(phasor, cis(theta * sampleIndex))[0];
            }
          }
      }
    return result;
  });
  return {
    ...outputState(coefficients, tones, sampleIndex / sampleRate),
    pressureMoments: matrices[0],
    velocityMoments: matrices[1],
  };
}
