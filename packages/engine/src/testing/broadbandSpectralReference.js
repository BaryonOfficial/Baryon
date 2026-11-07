/**
 * Independent color oracle: reconstruct signed fields in time, then direct DFT
 * and additive bin power. No production FFT, hue helper or matrix accumulator.
 * Histories are sample-major vectors in channel-major shell order.
 */
export function referenceBroadbandSpectralEvidence({
  pressure,
  velocity,
  frameEndSample,
  frameSize = 2048,
  sampleRate,
  channelCount,
  pressureBasis,
  velocityBasis,
  pressureWeight = 1,
  velocityWeight = 1,
}) {
  const count = pressureBasis.length;
  const window = Array.from({ length: frameSize }, (_, n) => {
    const angle = (2 * Math.PI * n) / frameSize;
    return 0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle);
  });
  const normalization =
    frameSize * window.reduce((s, x) => s + x * x, 0) * channelCount;
  const moments = [0, 0, 0, 0, 0];
  for (let a = 0; a < channelCount; a++) {
    const fields = [pressureBasis, ...velocityBasis].map((basis, axis) =>
      window.map((weight, n) => {
        const index = frameEndSample - frameSize + n;
        const state = (axis === 0 ? pressure : velocity)[index];
        let value = 0;
        if (state)
          for (let m = 0; m < count; m++)
            value += basis[m] * state[a * count + m];
        return weight * value;
      }),
    );
    for (let b = 1; b <= frameSize / 2; b++) {
      let power = 0;
      for (let axis = 0; axis < 4; axis++) {
        let re = 0,
          im = 0;
        for (let n = 0; n < frameSize; n++) {
          const angle = (2 * Math.PI * b * n) / frameSize;
          re += fields[axis][n] * Math.cos(angle);
          im -= fields[axis][n] * Math.sin(angle);
        }
        power +=
          (axis === 0 ? pressureWeight : velocityWeight) * (re * re + im * im);
      }
      power *= (b === frameSize / 2 ? 1 : 2) / normalization;
      const phase = Math.log2((b * sampleRate) / frameSize / 440);
      const theta = 2 * Math.PI * (phase - Math.floor(phase));
      moments[0] += power;
      moments[1] += power * Math.cos(theta);
      moments[2] += power * Math.sin(theta);
      moments[3] += power * Math.cos(2 * theta);
      moments[4] += power * Math.sin(2 * theta);
    }
  }
  return moments;
}

// Slow qualification oracle for the GPU projection. Production stores complex
// spectra and derives these matrices on-device; this is not a CPU fallback.
export function referenceSpectralMatrices(frame) {
  const {
    shellCount: count,
    channelCount,
    frameSize,
    sampleRate,
    coefficients,
  } = frame;
  const bins = frameSize / 2 + 1,
    size = count * count;
  const pressure = new Float64Array(5 * size);
  const velocity = new Float64Array(5 * size);
  for (let b = 1; b < bins; b++) {
    const turns = Math.log2((b * sampleRate) / frameSize / 440);
    const angle = 2 * Math.PI * (turns - Math.floor(turns));
    const weights = [
      1,
      Math.cos(angle),
      Math.sin(angle),
      Math.cos(2 * angle),
      Math.sin(2 * angle),
    ];
    for (let a = 0; a < channelCount; a++)
      for (let i = 0; i < count; i++)
        for (let j = 0; j < count; j++) {
          const x = 4 * ((a * count + i) * bins + b);
          const y = 4 * ((a * count + j) * bins + b);
          const p =
            coefficients[x] * coefficients[y] +
            coefficients[x + 1] * coefficients[y + 1];
          const v =
            coefficients[x + 2] * coefficients[y + 2] +
            coefficients[x + 3] * coefficients[y + 3];
          for (let k = 0; k < 5; k++) {
            pressure[k * size + i * count + j] += weights[k] * p;
            velocity[k * size + i * count + j] += weights[k] * v;
          }
        }
  }
  return { ...frame, pressure, velocity };
}

// Spatial qualification oracle: sum complex fields first, then square each
// bin. Does not consume the GPU's quadratic matrices or triangular evaluator.
export function referenceSpectralSupport(frame, basis, contrast) {
  const { shellCount, channelCount, frameSize, coefficients } = frame;
  const bins = frameSize / 2 + 1;
  const result = new Float64Array(bins);
  for (let b = 1; b < bins; b++) {
    let support = 0;
    for (let a = 0; a < channelCount; a++) {
      for (let axis = 0; axis < 4; axis++) {
        const shape = axis === 0 ? basis.pressure : basis.velocity[axis - 1];
        let re = 0,
          im = 0;
        for (let m = 0; m < shellCount; m++) {
          const offset =
            4 * ((a * shellCount + m) * bins + b) + (axis === 0 ? 0 : 2);
          re += shape[m] * coefficients[offset];
          im += shape[m] * coefficients[offset + 1];
        }
        support +=
          (re * re + im * im) *
          (axis === 0
            ? contrast.pressureEnergyWeight
            : contrast.velocityEnergyWeight);
      }
    }
    result[b] = support;
  }
  return result;
}

export function referenceSpectralField(frame, basis, contrast) {
  const support = referenceSpectralSupport(frame, basis, contrast);
  const result = [0, 0, 0, 0, 0];
  for (let b = 1; b < support.length; b++) {
    const angle =
      2 * Math.PI * Math.log2((b * frame.sampleRate) / frame.frameSize / 440);
    const weights = [
      1,
      Math.cos(angle),
      Math.sin(angle),
      Math.cos(2 * angle),
      Math.sin(2 * angle),
    ];
    weights.forEach((weight, i) => {
      result[i] += support[b] * weight;
    });
  }
  return result;
}
