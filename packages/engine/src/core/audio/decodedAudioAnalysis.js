import { computeRms } from "./analyserSampler.js";

const MIN_DECIBELS = -100;
const MAX_DECIBELS = -30;

function assertFftSize(value, label) {
  const size = Math.round(Number(value));
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new RangeError(`${label} must be a power of two`);
  }
  return size;
}

function createFftPlan(size) {
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

  const window = new Float64Array(size);
  let windowSum = 0;
  for (let index = 0; index < size; index += 1) {
    const value =
      size === 2 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
    window[index] = value;
    windowSum += value;
  }

  return {
    size,
    bitReversal,
    window,
    windowSum,
    real: new Float64Array(size),
    imaginary: new Float64Array(size),
    timeData: new Float32Array(size),
    spectrum: new Float32Array(size / 2),
  };
}

function fillCausalDownmix(audioBuffer, endTimeSeconds, target) {
  const sampleRate = audioBuffer.sampleRate;
  const channelCount = Math.max(1, audioBuffer.numberOfChannels ?? 1);
  const channels = Array.from({ length: channelCount }, (_, channel) =>
    audioBuffer.getChannelData(channel),
  );
  const requestedEndIndex =
    Math.max(0, Math.floor(endTimeSeconds * sampleRate)) + 1;
  const latestStartIndex = Math.max(0, audioBuffer.length - target.length);
  const startIndex = Math.min(
    latestStartIndex,
    Math.max(0, requestedEndIndex - target.length),
  );

  for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
    const sourceIndex = startIndex + targetIndex;
    if (sourceIndex >= audioBuffer.length) {
      target[targetIndex] = 0;
      continue;
    }
    let sum = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      sum += channels[channel][sourceIndex] ?? 0;
    }
    target[targetIndex] = sum / channelCount;
  }
}

function executeRealFft(plan) {
  const { size, bitReversal, window, real, imaginary, timeData } = plan;
  for (let index = 0; index < size; index += 1) {
    const destination = bitReversal[index];
    real[destination] = timeData[index] * window[index];
    imaginary[destination] = 0;
  }

  for (let width = 2; width <= size; width *= 2) {
    const halfWidth = width / 2;
    const angleStep = (-2 * Math.PI) / width;
    for (let start = 0; start < size; start += width) {
      for (let offset = 0; offset < halfWidth; offset += 1) {
        const angle = angleStep * offset;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const evenIndex = start + offset;
        const oddIndex = evenIndex + halfWidth;
        const oddReal = real[oddIndex] * cosine - imaginary[oddIndex] * sine;
        const oddImaginary =
          real[oddIndex] * sine + imaginary[oddIndex] * cosine;
        const evenReal = real[evenIndex];
        const evenImaginary = imaginary[evenIndex];
        real[evenIndex] = evenReal + oddReal;
        imaginary[evenIndex] = evenImaginary + oddImaginary;
        real[oddIndex] = evenReal - oddReal;
        imaginary[oddIndex] = evenImaginary - oddImaginary;
      }
    }
  }
}

function buildSnapshot(audioBuffer, timeSeconds, plan) {
  fillCausalDownmix(audioBuffer, timeSeconds, plan.timeData);
  executeRealFft(plan);

  let meterTotal = 0;
  const decibelSpan = MAX_DECIBELS - MIN_DECIBELS;
  for (let bin = 0; bin < plan.spectrum.length; bin += 1) {
    const amplitudeScale = bin === 0 ? 1 : 2;
    const amplitude =
      (amplitudeScale * Math.hypot(plan.real[bin], plan.imaginary[bin])) /
      Math.max(1e-12, plan.windowSum);
    const boundedAmplitude = Math.max(0, Math.min(1, amplitude));
    plan.spectrum[bin] = boundedAmplitude;
    const decibels =
      boundedAmplitude > 0
        ? Math.max(MIN_DECIBELS, 20 * Math.log10(boundedAmplitude))
        : MIN_DECIBELS;
    meterTotal += Math.max(
      0,
      Math.min(1, (decibels - MIN_DECIBELS) / decibelSpan),
    );
  }

  return {
    avgAmplitude:
      plan.spectrum.length > 0 ? (meterTotal / plan.spectrum.length) * 255 : 0,
    fftLinearAmplitudes: new Float32Array(plan.spectrum),
    timeData: new Float32Array(plan.timeData),
    rms: computeRms(plan.timeData),
  };
}

/**
 * Deterministic file-analysis owner.
 *
 * Decoded samples are downmixed and observed through fixed Hann apertures.
 * Inside the file the aperture is causal; at either boundary it is clamped to
 * the first or last complete signal window instead of manufacturing silence.
 * The same audio timestamp therefore yields the same capture before playback,
 * during playback, after a seek, and at every render frame rate.
 */
export function createDecodedAudioAnalysisSource(
  audioBuffer,
  { fastFftSize, structuralFftSize },
) {
  if (
    !audioBuffer ||
    !Number.isFinite(audioBuffer.sampleRate) ||
    typeof audioBuffer.getChannelData !== "function"
  ) {
    throw new TypeError("A decoded AudioBuffer-compatible source is required");
  }
  const fastPlan = createFftPlan(assertFftSize(fastFftSize, "fastFftSize"));
  const structuralPlan = createFftPlan(
    assertFftSize(structuralFftSize, "structuralFftSize"),
  );

  return {
    sample(timeSeconds, { includeStructural = false } = {}) {
      const observationTimeSeconds = Number.isFinite(timeSeconds)
        ? Math.max(0, timeSeconds)
        : 0;
      return {
        observationTimeSeconds,
        fast: buildSnapshot(audioBuffer, observationTimeSeconds, fastPlan),
        structural: includeStructural
          ? buildSnapshot(audioBuffer, observationTimeSeconds, structuralPlan)
          : null,
      };
    },
  };
}
