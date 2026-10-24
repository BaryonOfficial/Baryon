/** Reusable radix-2 transform storage; forward DFT is unscaled, inverse is 1/N. */
export function createFftPlan(size) {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
    throw new RangeError("FFT size must be a power of two");
  }
  const bitReversal = new Uint32Array(size);
  const bitCount = Math.log2(size);
  for (let index = 0; index < size; index += 1) {
    let value = index;
    let reversed = 0;
    for (let bit = 0; bit < bitCount; bit += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>>= 1;
    }
    bitReversal[index] = reversed;
  }
  const cosine = new Float64Array(size / 2);
  const sine = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    const angle = (2 * Math.PI * index) / size;
    cosine[index] = Math.cos(angle);
    sine[index] = Math.sin(angle);
  }
  return {
    size,
    bitReversal,
    cosine,
    sine,
    real: new Float64Array(size),
    imaginary: new Float64Array(size),
  };
}

/** Transform natural-order complex samples in place. No per-call allocations. */
export function executeFft(plan, inverse = false) {
  const { size, bitReversal, cosine, sine, real, imaginary } = plan;
  for (let index = 0; index < size; index += 1) {
    const reversed = bitReversal[index];
    if (index < reversed) {
      const previousReal = real[index];
      const previousImaginary = imaginary[index];
      real[index] = real[reversed];
      imaginary[index] = imaginary[reversed];
      real[reversed] = previousReal;
      imaginary[reversed] = previousImaginary;
    }
  }
  for (let width = 2; width <= size; width *= 2) {
    const halfWidth = width / 2;
    const stride = size / width;
    for (let start = 0; start < size; start += width) {
      for (let offset = 0; offset < halfWidth; offset += 1) {
        const twiddle = offset * stride;
        const cos = cosine[twiddle];
        const sin = inverse ? sine[twiddle] : -sine[twiddle];
        const even = start + offset;
        const odd = even + halfWidth;
        const oddReal = real[odd] * cos - imaginary[odd] * sin;
        const oddImaginary = real[odd] * sin + imaginary[odd] * cos;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < size; index += 1) {
      real[index] /= size;
      imaginary[index] /= size;
    }
  }
}
