import { createFftPlan, executeFft } from "../core/audio/fft.js";

/**
 * Full-history FFT probe for arbitrary response samples. This is deliberately
 * outside the production dependency graph: it qualifies the recurrence-based
 * spectrum against explicit histories and supplies arbitrary GPU stress input.
 * It shares the FFT helper, so direct-DFT tests provide independent evidence.
 * Sample-clocked complex spectra of unprojected response histories. Each texel
 * stores pressure real/imaginary then velocity real/imaginary, with rows in
 * channel-major shell order. Energy normalization and channel averaging are
 * applied in amplitude as square roots. DC is zero; Nyquist has weight one.
 * Spatial projection forms exact quadratic color evidence on the GPU; the
 * audio owner never assembles expensive shell-pair color matrices.
 */
export function createResponseHistorySpectrumProbe({
  shellCount,
  channelCount = 1,
  sampleRate,
  frameSize = 2048,
  hopSize = 512,
}) {
  if (
    !Number.isSafeInteger(shellCount) ||
    shellCount < 1 ||
    ![1, 2].includes(channelCount) ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(hopSize) ||
    hopSize < 1 ||
    !Number.isSafeInteger(frameSize) ||
    frameSize < hopSize ||
    frameSize % hopSize !== 0
  )
    throw new RangeError("invalid response spectrum dimensions or sample rate");
  const fft = createFftPlan(frameSize);
  const width = channelCount * shellCount;
  const binCount = frameSize / 2 + 1;
  const history = [
    new Float64Array(width * frameSize),
    new Float64Array(width * frameSize),
  ];
  const coefficients = new Float64Array(4 * width * binCount);
  const window = Float64Array.from(
    { length: frameSize },
    (_, n) =>
      0.42 -
      0.5 * Math.cos((2 * Math.PI * n) / frameSize) +
      0.08 * Math.cos((4 * Math.PI * n) / frameSize),
  );
  const windowEnergy = window.reduce((sum, value) => sum + value * value, 0);
  const binScale = Float64Array.from({ length: binCount }, (_, b) =>
    b === 0
      ? 0
      : Math.sqrt(
          (b === frameSize / 2 ? 1 : 2) /
            (channelCount * frameSize * windowEnergy),
        ),
  );
  let sampleIndex = 0;
  let frameEndSample = 0;

  function analyze() {
    // The write cursor is also the oldest sample in a full trailing window.
    // Unwritten startup storage remains zero; no partial-window gain boost.
    const oldest = sampleIndex % frameSize;
    for (let row = 0; row < width; row++) {
      // Two real signals share one complex FFT. Conjugate symmetry recovers
      // both spectra exactly; this does not merge their physical quantities.
      for (let n = 0; n < frameSize; n++) {
        const index = ((oldest + n) % frameSize) * width + row;
        fft.real[n] = history[0][index] * window[n];
        fft.imaginary[n] = history[1][index] * window[n];
      }
      executeFft(fft);
      for (let b = 0; b < binCount; b++) {
        const opposite = (frameSize - b) % frameSize;
        const scale = binScale[b] / 2;
        const offset = 4 * (row * binCount + b);
        const pReal = (fft.real[b] + fft.real[opposite]) * scale;
        const pImaginary = (fft.imaginary[b] - fft.imaginary[opposite]) * scale;
        const vReal = (fft.imaginary[b] + fft.imaginary[opposite]) * scale;
        const vImaginary = (fft.real[opposite] - fft.real[b]) * scale;
        if (
          !Number.isFinite(pReal) ||
          !Number.isFinite(pImaginary) ||
          !Number.isFinite(vReal) ||
          !Number.isFinite(vImaginary)
        )
          throw new RangeError(
            "response spectrum exceeds finite numerical range",
          );
        coefficients[offset] = pReal;
        coefficients[offset + 1] = pImaginary;
        coefficients[offset + 2] = vReal;
        coefficients[offset + 3] = vImaginary;
      }
    }
    frameEndSample = sampleIndex;
  }

  return {
    // P[n],R[n] at the start of sample hold n. Views are copied immediately.
    advance(pressure, velocity) {
      if (
        pressure?.length !== width ||
        velocity?.length !== width ||
        !Number.isSafeInteger(sampleIndex + 1)
      )
        throw new RangeError(
          "response spectrum requires complete finite shell state",
        );
      for (let row = 0; row < width; row++)
        if (!Number.isFinite(pressure[row]) || !Number.isFinite(velocity[row]))
          throw new RangeError(
            "response spectrum requires complete finite shell state",
          );
      const cursor = sampleIndex % frameSize;
      for (let row = 0; row < width; row++) {
        history[0][cursor * width + row] = pressure[row];
        history[1][cursor * width + row] = velocity[row];
      }
      sampleIndex++;
      if (sampleIndex % hopSize === 0) analyze();
    },
    read() {
      return {
        frameEndSample,
        frameSize,
        hopSize,
        sampleRate,
        channelCount,
        shellCount,
        coefficients: coefficients.slice(),
      };
    },
  };
}
