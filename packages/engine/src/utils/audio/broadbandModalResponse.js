import { createModalResponseMoments } from "./modalResponseMoments.js";
import { createBroadbandResponseSpectrum } from "./broadbandResponseSpectrum.js";

/**
 * Source-owned continuous broadband response for the declared virtual apparatus.
 * Shell state is raw dimensionless pressure P and velocity-basis amplitude R.
 * Sample-hold propagation uses a precomputed affine matrix exponential.
 * Within-sample Gaussian integrals feed the moment owner, which reconstructs
 * every dense shell pair at publication, independent of display admission.
 */
const QUADRATURE = [
  [-0.9602898564975363, 0.1012285362903763],
  [-0.7966664774136267, 0.2223810344533745],
  [-0.525532409916329, 0.3137066458778873],
  [-0.1834346424956498, 0.362683783378362],
  [0.1834346424956498, 0.362683783378362],
  [0.525532409916329, 0.3137066458778873],
  [0.7966664774136267, 0.2223810344533745],
  [0.9602898564975363, 0.1012285362903763],
];

// Six entries encode F00,F01,F10,F11,B0,B1. Scaling/squaring avoids
// cancellation in B at low frequency and singular formulas at critical Q.
function transition(angular, damping, time) {
  const squarings = Math.max(
    0,
    Math.ceil(Math.log2(((2 * damping + angular) * time) / 0.5)),
  );
  const step = time / 2 ** squarings;
  const a = -damping * step;
  const b = -angular * step;
  const c = angular * step;
  const g = damping * step;
  let sum = [1, 0, 0, 1, 0, 0];
  let term = [a, b, c, 0, g, 0];
  for (let order = 1; order <= 32; order++) {
    for (let i = 0; i < 6; i++) sum[i] += term[i];
    if (Math.max(...term.map(Math.abs)) < 1e-18) break;
    const divisor = order + 1;
    term = [
      (a * term[0] + b * term[2]) / divisor,
      (a * term[1] + b * term[3]) / divisor,
      (c * term[0]) / divisor,
      (c * term[1]) / divisor,
      (a * term[4] + b * term[5]) / divisor,
      (c * term[4]) / divisor,
    ];
  }
  for (let i = 0; i < squarings; i++) {
    const [p, q, r, s, u, v] = sum;
    sum = [
      p * p + q * r,
      p * q + q * s,
      r * p + s * r,
      r * q + s * s,
      p * u + q * v + u,
      r * u + s * v + v,
    ];
  }
  return sum;
}

export function createBroadbandModalResponse({
  shells,
  sampleRate,
  channelCount = 1,
  exposureSeconds = 0.05,
}) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(exposureSeconds) ||
    exposureSeconds < 1 / sampleRate
  ) {
    throw new RangeError(
      "sample rate must be positive and exposure must span at least one sample",
    );
  }
  if (
    !Array.isArray(shells) ||
    shells.length === 0 ||
    ![1, 2].includes(channelCount)
  ) {
    throw new RangeError(
      "a nonempty shell atlas and mono/stereo layout are required",
    );
  }
  for (const shell of shells) {
    // The within-sample quadrature is qualified up to Nyquist, not for an
    // arbitrarily high-frequency hidden apparatus. Reject unsupported atlases.
    if (
      !Number.isFinite(shell.naturalFrequencyHz) ||
      shell.naturalFrequencyHz <= 0 ||
      shell.naturalFrequencyHz > sampleRate / 2 ||
      !Number.isFinite(shell.qualityFactor) ||
      shell.qualityFactor < 0.5
    ) {
      throw new RangeError(
        "shell frequency must be within Nyquist and Q at least 0.5",
      );
    }
  }
  const count = shells.length;
  const pressure = new Float64Array(count * channelCount);
  const velocity = new Float64Array(count * channelCount);
  const dt = 1 / sampleRate;
  const makeTransitions = (time) =>
    shells.map((shell) => {
      const angular = 2 * Math.PI * shell.naturalFrequencyHz;
      return transition(angular, angular / shell.qualityFactor, time);
    });
  const fullStep = makeTransitions(dt);
  const nodes = QUADRATURE.map(([position, weight]) => {
    const time = ((position + 1) * dt) / 2;
    return {
      transitions: makeTransitions(time),
      weight:
        ((weight * dt) / (2 * exposureSeconds * channelCount)) *
        Math.exp(-(dt - time) / exposureSeconds),
    };
  });
  const observation = createModalResponseMoments({
    shells,
    channelCount,
    sampleRate,
    exposureSeconds,
    nodes,
  });
  const spectrum = createBroadbandResponseSpectrum({
    transitions: fullStep,
    channelCount,
    sampleRate,
  });
  let sampleIndex = 0;

  return {
    advance(channels) {
      if (channels?.length !== channelCount)
        throw new RangeError("channel layout changed");
      const length = channels[0]?.length;
      if (
        !Number.isSafeInteger(length) ||
        !Number.isSafeInteger(sampleIndex + length)
      ) {
        throw new RangeError("invalid sample count");
      }
      // Validate the entire incoming block before mutating retained state.
      for (const channel of channels) {
        if (
          !(
            channel instanceof Float32Array || channel instanceof Float64Array
          ) ||
          channel.length !== length ||
          !channel.every(Number.isFinite)
        ) {
          throw new RangeError(
            "audio channels must be equal-length finite PCM",
          );
        }
      }
      for (let sample = 0; sample < length; sample++) {
        observation.advance(pressure, velocity, channels, sample);
        for (let a = 0; a < channelCount; a++) {
          const start = a * count;
          const input = channels[a][sample];
          for (let m = 0; m < count; m++) {
            const f = fullStep[m];
            const p = pressure[start + m];
            const r = velocity[start + m];
            pressure[start + m] = f[0] * p + f[1] * r + f[4] * input;
            velocity[start + m] = f[2] * p + f[3] * r + f[5] * input;
          }
        }
        // The end boundary reconstructs the exact start-of-hold history.
        // This derived observer never advances acoustic state.
        spectrum.advance(pressure, velocity, channels, sample);
      }
      sampleIndex += length;
    },
    read() {
      return {
        sampleIndex,
        pressure: pressure.slice(),
        velocity: velocity.slice(),
        ...observation.read(pressure, velocity),
        spectral: spectrum.read(),
      };
    },
  };
}
