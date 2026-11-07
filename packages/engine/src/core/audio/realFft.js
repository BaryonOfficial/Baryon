import { createFftPlan, executeFft } from "./fft.js";

/** Reusable real-signal transform storage with a half-sized complex FFT. */
export function createRealFftPlan(size) {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0)
    throw new RangeError("FFT size must be a power of two");
  const half = size / 2;
  const cosine = new Float64Array(half);
  const sine = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    const angle = (2 * Math.PI * k) / size;
    cosine[k] = Math.cos(angle);
    sine[k] = Math.sin(angle);
  }
  return {
    size,
    packed: size > 2 ? createFftPlan(half) : null,
    cosine,
    sine,
    real: new Float64Array(size),
    imaginary: new Float64Array(size),
  };
}

/**
 * Forward: real input -> complete, unscaled Hermitian DFT.
 * Inverse: Hermitian DFT -> real input, scaled by 1/N. Only the nonnegative
 * frequency bins are read; arbitrary complex spectra require executeFft.
 * The plan owns all scratch storage; execution allocates nothing.
 */
export function executeRealFft(plan, inverse = false) {
  const { size, packed, cosine, sine, real, imaginary } = plan;
  if (size === 2) {
    const first = real[0];
    const second = real[1];
    real[0] = inverse ? (first + second) / 2 : first + second;
    real[1] = inverse ? (first - second) / 2 : first - second;
    imaginary.fill(0);
    return;
  }
  const half = size / 2;
  if (inverse) {
    packed.real[0] = (real[0] + real[half]) / 2;
    packed.imaginary[0] = (real[0] - real[half]) / 2;
    for (let k = 1; k < half; k++) {
      const mirror = half - k;
      const evenReal = (real[k] + real[mirror]) / 2;
      const evenImaginary = (imaginary[k] - imaginary[mirror]) / 2;
      const differenceReal = (real[k] - real[mirror]) / 2;
      const differenceImaginary = (imaginary[k] + imaginary[mirror]) / 2;
      packed.real[k] =
        evenReal - sine[k] * differenceReal - cosine[k] * differenceImaginary;
      packed.imaginary[k] =
        evenImaginary +
        cosine[k] * differenceReal -
        sine[k] * differenceImaginary;
    }
    executeFft(packed, true);
    for (let n = 0; n < half; n++) {
      real[2 * n] = packed.real[n];
      real[2 * n + 1] = packed.imaginary[n];
    }
    imaginary.fill(0);
    return;
  }

  // Pack even samples as real and odd samples as imaginary. Their two real
  // DFTs can be recovered from Z[k] and conjugate(Z[-k]), then interleaved.
  for (let n = 0; n < half; n++) {
    packed.real[n] = real[2 * n];
    packed.imaginary[n] = real[2 * n + 1];
  }
  executeFft(packed);
  real[0] = packed.real[0] + packed.imaginary[0];
  real[half] = packed.real[0] - packed.imaginary[0];
  imaginary[0] = imaginary[half] = 0;
  for (let k = 1; k < half; k++) {
    const mirror = half - k;
    const evenReal = (packed.real[k] + packed.real[mirror]) / 2;
    const evenImaginary = (packed.imaginary[k] - packed.imaginary[mirror]) / 2;
    const oddReal = (packed.imaginary[k] + packed.imaginary[mirror]) / 2;
    const oddImaginary = (packed.real[mirror] - packed.real[k]) / 2;
    const re = evenReal + cosine[k] * oddReal + sine[k] * oddImaginary;
    const im = evenImaginary + cosine[k] * oddImaginary - sine[k] * oddReal;
    real[k] = real[size - k] = re;
    imaginary[k] = im;
    imaginary[size - k] = -im;
  }
}
