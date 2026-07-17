import { frequencyToBinIndex } from "./binFrequency.js";
import { clamp } from "../math.js";

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_FFT_SIZE = 4096;

function writeFftPeak(fftLinearAmplitudes, frequency, amplitude, sampleRate) {
  const bin = Math.max(
    1,
    frequencyToBinIndex(frequency, fftLinearAmplitudes.length, sampleRate),
  );
  fftLinearAmplitudes[bin] = Math.max(fftLinearAmplitudes[bin] ?? 0, amplitude);
}

function synthesizeTimeData(components, sampleRate, fftSize) {
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    let value = 0;
    for (const [frequency, amplitude] of components) {
      value +=
        Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
    }
    timeData[index] = clamp(value, -1, 1);
  }
  return timeData;
}

function createFixture(components, options = {}) {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  const fftLinearAmplitudes = new Float32Array(fftSize / 2);
  for (const [frequency, amplitude] of components) {
    writeFftPeak(fftLinearAmplitudes, frequency, amplitude, sampleRate);
  }
  return {
    sampleRate,
    fftSize,
    fftLinearAmplitudes,
    timeData: synthesizeTimeData(components, sampleRate, fftSize),
  };
}

export function createSineToneFixture(frequency, options = {}) {
  return createFixture([[frequency, options.amplitude ?? 0.9]], options);
}

export function createMajorTriadFixture(rootFrequency, options = {}) {
  return createFixture(
    [
      [rootFrequency, 0.88],
      [rootFrequency * 2 ** (4 / 12), 0.68],
      [rootFrequency * 2 ** (7 / 12), 0.62],
      [rootFrequency * 2, 0.38],
    ],
    options,
  );
}

export function createBassHatFixture(options = {}) {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  const fftLinearAmplitudes = new Float32Array(fftSize / 2);
  for (const [frequency, amplitude] of [
    [82.41, 0.95],
    [164.82, 0.52],
    [5200, 0.48],
    [6600, 0.42],
    [8100, 0.34],
  ]) {
    writeFftPeak(fftLinearAmplitudes, frequency, amplitude, sampleRate);
  }
  return {
    sampleRate,
    fftSize,
    fftLinearAmplitudes,
    timeData: synthesizeTimeData(
      [
        [82.41, 0.72],
        [164.82, 0.22],
        [5200, 0.08],
        [6600, 0.06],
      ],
      sampleRate,
      fftSize,
    ),
  };
}

export function createVocalLikeFixture(rootFrequency = 220, options = {}) {
  return createFixture(
    [
      [rootFrequency, 0.7],
      [rootFrequency * 2, 0.55],
      [rootFrequency * 3, 0.42],
      [rootFrequency * 4, 0.3],
      [rootFrequency * 5, 0.2],
    ],
    options,
  );
}

export function createBroadbandNoiseFixture(options = {}) {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  const fftLinearAmplitudes = new Float32Array(fftSize / 2);
  for (let frequency = 120; frequency <= 10000; frequency += 220) {
    writeFftPeak(fftLinearAmplitudes, frequency, 0.28, sampleRate);
  }
  const timeData = new Float32Array(fftSize);
  let seed = 123456789;
  for (let index = 0; index < fftSize; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    timeData[index] = (seed / 0x100000000) * 2 - 1;
  }
  return {
    sampleRate,
    fftSize,
    fftLinearAmplitudes,
    timeData,
  };
}
