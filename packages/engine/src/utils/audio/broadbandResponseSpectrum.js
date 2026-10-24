import { createFftPlan, executeFft } from "../../core/audio/fft.js";

/**
 * Audio-owned finite response window. For y[n+1] = F y[n] + B x[n],
 * (z I - F) Y = B X - z (y[end] - y[start]). The complete input DFT and
 * boundary difference therefore encode the exact start-of-hold response DFT.
 * A derived GPU pass expands it and applies the periodic Blackman window.
 * This owner retains sample history; rendering never advances it.
 */
export function createBroadbandResponseSpectrum({
  transitions,
  channelCount = 1,
  sampleRate,
  frameSize = 2048,
  hopSize = 512,
}) {
  if (
    !Array.isArray(transitions) ||
    transitions.length === 0 ||
    transitions.some((f) => f.length !== 6 || !f.every(Number.isFinite)) ||
    ![1, 2].includes(channelCount) ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(hopSize) ||
    hopSize < 1 ||
    !Number.isSafeInteger(frameSize) ||
    frameSize < Math.max(8, hopSize) ||
    frameSize % hopSize !== 0
  )
    throw new RangeError("invalid response spectrum configuration");
  // The selected damped apparatus has strictly stable discrete poles. Reject
  // a numerically singular or lossless configuration before owning history.
  for (const [a, b, c, d] of transitions) {
    const determinant = a * d - b * c;
    if (
      !(
        1 - determinant > 0 &&
        (1 - a) * (1 - d) - b * c > 0 &&
        (1 + a) * (1 + d) - b * c > 0
      )
    )
      throw new RangeError(
        "response spectral recurrence is unstable or singular",
      );
  }
  const fft = createFftPlan(frameSize);
  const shellCount = transitions.length;
  const poles = new Float64Array(6 * shellCount);
  transitions.forEach((f, m) => poles.set(f, 6 * m));
  const bins = frameSize / 2 + 1;
  const width = shellCount * channelCount;
  const boundaryCount = frameSize / hopSize;
  const input = new Float64Array(channelCount * frameSize);
  const boundaryPressure = new Float64Array(boundaryCount * width);
  const boundaryVelocity = new Float64Array(boundaryCount * width);
  const inputSpectrum = new Float64Array(2 * channelCount * bins);
  const boundaryDelta = new Float64Array(2 * width);
  let sampleIndex = 0;
  let frameEndSample = 0;

  function analyze(pressure, velocity) {
    const oldest = sampleIndex % frameSize;
    const slot = (sampleIndex / hopSize) % boundaryCount;
    for (let a = 0; a < channelCount; a++) {
      for (let n = 0; n < frameSize; n++) {
        fft.real[n] = input[a * frameSize + ((oldest + n) % frameSize)];
        fft.imaginary[n] = 0;
      }
      executeFft(fft);
      for (let b = 0; b < bins; b++) {
        if (!Number.isFinite(fft.real[b]) || !Number.isFinite(fft.imaginary[b]))
          throw new RangeError("input spectrum exceeds finite numerical range");
        inputSpectrum[2 * (a * bins + b)] = fft.real[b];
        inputSpectrum[2 * (a * bins + b) + 1] = fft.imaginary[b];
      }
      for (let m = 0; m < shellCount; m++) {
        const row = a * shellCount + m;
        const boundary = slot * width + row;
        const dp = pressure[row] - boundaryPressure[boundary];
        const dv = velocity[row] - boundaryVelocity[boundary];
        if (!Number.isFinite(dp) || !Number.isFinite(dv))
          throw new RangeError(
            "response boundary exceeds finite numerical range",
          );
        boundaryDelta[2 * row] = dp;
        boundaryDelta[2 * row + 1] = dv;
        boundaryPressure[boundary] = pressure[row];
        boundaryVelocity[boundary] = velocity[row];
      }
    }
    frameEndSample = sampleIndex;
  }
  return {
    advance(pressure, velocity, channels, sample) {
      if (
        pressure.length !== width ||
        velocity.length !== width ||
        channels.length !== channelCount ||
        !Number.isSafeInteger(sampleIndex + 1)
      )
        throw new RangeError("response spectrum requires complete state");
      for (let a = 0; a < channelCount; a++)
        if (!Number.isFinite(channels[a][sample]))
          throw new RangeError("response spectrum requires finite input");
      for (let row = 0; row < width; row++)
        if (!Number.isFinite(pressure[row]) || !Number.isFinite(velocity[row]))
          throw new RangeError("response spectrum requires finite state");
      const cursor = sampleIndex % frameSize;
      for (let a = 0; a < channelCount; a++)
        input[a * frameSize + cursor] = channels[a][sample];
      sampleIndex++;
      if (sampleIndex % hopSize === 0) analyze(pressure, velocity);
    },
    read() {
      return {
        representation: "finite-response-window-v1",
        frameEndSample,
        frameSize,
        hopSize,
        sampleRate,
        channelCount,
        shellCount,
        transitions: poles.slice(),
        inputSpectrum: inputSpectrum.slice(),
        boundaryDelta: boundaryDelta.slice(),
      };
    },
  };
}
