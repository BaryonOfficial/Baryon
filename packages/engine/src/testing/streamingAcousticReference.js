// Independent finite-record oracle: direct DFT and linear spectral convolution,
// no production FFT, apparatus resolver, overlap implementation or DC helper.
export function referenceWaterFrame(input, sampleRate, timeScale) {
  const size = input.length;
  const half = size / 2;
  const cosine = Float64Array.from({ length: size }, (_, n) =>
    Math.cos((2 * Math.PI * n) / size),
  );
  const sine = Float64Array.from({ length: size }, (_, n) =>
    Math.sin((2 * Math.PI * n) / size),
  );
  const real = new Float64Array(size + 1);
  const imaginary = new Float64Array(size + 1);
  for (let k = 0; k <= half; k++) {
    let re = 0,
      im = 0,
      phase = 0;
    for (let n = 0; n < size; n++) {
      re += input[n] * cosine[phase];
      im -= input[n] * sine[phase];
      phase = (phase + k) % size;
    }
    re /= size;
    im /= size;
    if (k === half) {
      real[0] = real[size] = re / 2;
    } else {
      real[half + k] = real[half - k] = re;
      imaginary[half + k] = im;
      imaginary[half - k] = -im;
    }
  }
  const output = Float64Array.from(input);
  for (let b = 1; b < half; b++) {
    let re = 0,
      im = 0;
    for (let k = Math.max(-half, b - half); k <= half; k++) {
      const i = k + half,
        j = b - k + half;
      re += real[i] * real[j] - imaginary[i] * imaginary[j];
      im += real[i] * imaginary[j] + imaginary[i] * real[j];
    }
    const scale = (timeScale * Math.PI * b * sampleRate) / size;
    const correctionRe = -im * scale;
    const correctionIm = re * scale;
    let phase = 0;
    for (let n = 0; n < size; n++) {
      output[n] +=
        2 * (correctionRe * cosine[phase] - correctionIm * sine[phase]);
      phase = (phase + b) % size;
    }
  }
  return output;
}

export function referenceStreamingAcousticDrive(
  channels,
  { sampleRate, cavityAcousticScale },
) {
  const size = 2048,
    hop = 512;
  const length = channels[0].length;
  const scale = cavityAcousticScale;
  const pressure = scale.incidentPeakPressurePascalAtFullScale ?? 0;
  const timeScale =
    pressure === 0
      ? 0
      : ((1 + scale.equationOfStateNonlinearityBA / 2) *
          scale.sideLengthMeters *
          pressure) /
        (scale.mediumDensityKgPerM3 * scale.soundSpeedMetersPerSecond ** 3);
  const output = channels.map(() => new Float64Array(length));
  const normalization = new Float64Array(length);
  const frameGains = [];
  if (pressure === 0) channels.forEach((c, a) => output[a].set(c));
  else {
    for (let start = hop - size; start < length; start += hop) {
      const inputs = channels.map((c) =>
        Float64Array.from({ length: size }, (_, n) => c[start + n] ?? 0),
      );
      const raw = inputs.map((c) =>
        referenceWaterFrame(c, sampleRate, timeScale),
      );
      const energy = (cs) =>
        cs.reduce(
          (sum, c) => sum + c.reduce((total, x) => total + x * x, 0),
          0,
        );
      const inputEnergy = energy(inputs);
      const gain = inputEnergy === 0 ? 0 : Math.sqrt(inputEnergy / energy(raw));
      frameGains.push(gain);
      for (let n = Math.max(0, -start); n < size && start + n < length; n++) {
        const weight = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / size);
        normalization[start + n] += weight;
        for (let a = 0; a < channels.length; a++)
          output[a][start + n] += weight * gain * raw[a][n];
      }
    }
    for (const c of output)
      for (let n = 0; n < length; n++) c[n] /= normalization[n];
  }
  const pole = Math.exp((-2 * Math.PI * 5) / sampleRate);
  const prepared = output.map((c) => {
    let low = 0;
    return c.map((x) => {
      const y = x - low;
      low = pole * low + (1 - pole) * x;
      return y;
    });
  });
  return { prepared, overlapAdded: output, frameGains };
}
