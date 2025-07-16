import FFT from "fft.js";

const THRESHOLD = 0.05; // Amplitude threshold for peak picking
const MAX_PEAKS = 16; // Limit number of peaks per frame

function hannWindow(N) {
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return win;
}

function findPeaks(mags, threshold) {
  const peaks = [];
  for (let i = 1; i < mags.length - 1; i++) {
    if (mags[i] > threshold && mags[i] > mags[i - 1] && mags[i] > mags[i + 1]) {
      peaks.push(i);
    }
  }
  return peaks;
}

function parabolicInterp(mags, i) {
  const alpha = mags[i - 1];
  const beta = mags[i];
  const gamma = mags[i + 1];
  const p = (0.5 * (alpha - gamma)) / (alpha - 2 * beta + gamma);
  return i + p;
}

function binToFreq(bin, sampleRate, fftSize) {
  return (bin * sampleRate) / fftSize;
}

class PitchDetectProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.fftSize = opts.fftSize || 1024;
    this.sampleRate = opts.sampleRate || 44100;
    this.buffer = new Float32Array(this.fftSize);
    this.writeIndex = 0;
    this.fft = new FFT(this.fftSize);
    this.fftInput = new Array(this.fftSize).fill(0);
    this.fftOutput = new Array(this.fftSize).fill(0);
    this.mags = new Float32Array(this.fftSize / 2);
    this.windowFunc = hannWindow(this.fftSize);
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writeIndex++] = input[i];
      if (this.writeIndex === this.fftSize) {
        // Apply window
        for (let j = 0; j < this.fftSize; j++) {
          this.fftInput[j] = this.buffer[j] * this.windowFunc[j];
        }
        // FFT
        this.fftOutput = this.fft.createComplexArray();
        this.fft.realTransform(this.fftOutput, this.fftInput);
        this.fft.completeSpectrum(this.fftOutput);
        // Magnitude spectrum
        for (let k = 0; k < this.fftSize / 2; k++) {
          const re = this.fftOutput[2 * k];
          const im = this.fftOutput[2 * k + 1];
          this.mags[k] = Math.sqrt(re * re + im * im) / this.fftSize;
        }
        // Peak picking
        const peaks = findPeaks(this.mags, THRESHOLD);
        // Parabolic interpolation and collect results
        const pitches = [];
        const amplitudes = [];
        for (let idx = 0; idx < Math.min(peaks.length, MAX_PEAKS); idx++) {
          const i = peaks[idx];
          if (i <= 0 || i >= this.mags.length - 1) continue;
          const interpBin = parabolicInterp(this.mags, i);
          const freq = binToFreq(interpBin, this.sampleRate, this.fftSize);
          const amp = this.mags[i];
          pitches.push(freq);
          amplitudes.push(amp);
        }
        // Post to main thread
        this.port.postMessage({ pitches, amplitudes });
        this.writeIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("pitch-detect-processor", PitchDetectProcessor);
