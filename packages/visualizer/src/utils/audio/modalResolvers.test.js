import { describe, expect, it } from "vitest";
import { createModalTargetBuild } from "./modalStack.js";
import {
  buildModalSlotsFromFundamental,
  buildModalSlotsFromPeakDrivers,
  buildModalSlotsFromSpectralPeaks,
  writeModalSlotsFromFundamental,
  writeModalSlotsFromPeakDrivers,
  writeModalSlotsFromSpectralPeaks,
} from "./modalResolvers.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const NYQUIST = SAMPLE_RATE / 2;

function freqToBin(frequency) {
  return Math.round((frequency / NYQUIST) * (BIN_COUNT - 1));
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    fft[Math.max(1, freqToBin(frequency))] = amplitude;
  }
  return fft;
}

function expectTargetBuildToMatch(actual, expected) {
  expect(Array.from(actual.slots)).toEqual(Array.from(expected.slots));
  expect(Array.from(actual.referenceSlots)).toEqual(
    Array.from(expected.referenceSlots),
  );
  expect(Array.from(actual.colorSlots)).toEqual(
    Array.from(expected.colorSlots),
  );
  expect(Array.from(actual.harmonicSupport)).toEqual(
    Array.from(expected.harmonicSupport),
  );
  expect(actual.uniqueModeCount).toBe(expected.uniqueModeCount);
  expect(actual.components).toEqual(expected.components);
  expect(actual.peaks).toEqual(expected.peaks);
}

describe("modal resolver writers", () => {
  it("matches the allocating fundamental resolver", () => {
    const fftMagnitudes = makeFft([
      [110, 0.86],
      [220, 0.44],
      [330, 0.23],
    ]);
    const expected = buildModalSlotsFromFundamental({
      frequency: 110,
      confidence: 0.9,
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 5,
      spectralCentroid: 0.24,
      includeChromesthesia: true,
    });
    const actual = writeModalSlotsFromFundamental(createModalTargetBuild(5), {
      frequency: 110,
      confidence: 0.9,
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 5,
      spectralCentroid: 0.24,
      includeChromesthesia: true,
    });

    expectTargetBuildToMatch(actual, expected);
  });

  it("matches the allocating spectral resolver", () => {
    const fftMagnitudes = makeFft([
      [110, 0.92],
      [220, 0.51],
      [330, 0.3],
      [440, 0.18],
    ]);
    const peaks = [
      { frequency: 110, amplitude: 0.92 },
      { frequency: 220, amplitude: 0.51 },
      { frequency: 330, amplitude: 0.3 },
    ];
    const expected = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.28,
      includeChromesthesia: true,
      peaks,
    });
    const actual = writeModalSlotsFromSpectralPeaks(createModalTargetBuild(6), {
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.28,
      includeChromesthesia: true,
      peaks,
    });

    expectTargetBuildToMatch(actual, expected);
  });

  it("matches the allocating peak-driver resolver", () => {
    const fftMagnitudes = makeFft([
      [110, 0.94],
      [220, 0.56],
      [330, 0.32],
      [440, 0.24],
    ]);
    const peaks = [
      { frequency: 110, amplitude: 0.94 },
      { frequency: 220, amplitude: 0.56 },
      { frequency: 330, amplitude: 0.32 },
    ];
    const expected = buildModalSlotsFromPeakDrivers({
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.31,
      includeChromesthesia: true,
      peaks,
    });
    const actual = writeModalSlotsFromPeakDrivers(createModalTargetBuild(6), {
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.31,
      includeChromesthesia: true,
      peaks,
      scratchTarget: createModalTargetBuild(6),
    });

    expectTargetBuildToMatch(actual, expected);
  });
});
