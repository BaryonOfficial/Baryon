import { describe, expect, it } from "vitest";
import {
  SPECTRAL_EVIDENCE_POLICY,
  computeRayleighPeakThreshold,
  computeRobustAmplitudeStatistic,
  findCredibleSpectralPeaks,
  measureLocalSpectralEvidence,
} from "./spectralEvidence.js";
import { frequencyToBinIndex } from "./binFrequency.js";

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const BIN_COUNT = FFT_SIZE / 2;

function makeSpectrum(floor = 0) {
  return new Float32Array(BIN_COUNT).fill(floor);
}

function writePeak(spectrum, frequencyHz, amplitude, shoulders = null) {
  const bin = frequencyToBinIndex(frequencyHz, spectrum.length, SAMPLE_RATE);
  spectrum[bin] = amplitude;
  if (shoulders) {
    spectrum[bin - 1] = shoulders[0];
    spectrum[bin + 1] = shoulders[1];
  }
  return bin;
}

function makeRayleighSpectrum(sigma, seed = 0xdecafbad) {
  const spectrum = new Float32Array(BIN_COUNT);
  let state = seed >>> 0;
  for (let index = 0; index < spectrum.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const uniform = Math.max(Number.EPSILON, state / 0x100000000);
    spectrum[index] = sigma * Math.sqrt(-2 * Math.log(uniform));
  }
  return spectrum;
}

describe("spectral evidence", () => {
  it("keeps the audio evidence window through 12 kHz independently of spatial modal support", () => {
    const spectrum = makeSpectrum(0);
    writePeak(spectrum, 11900, 0.8);
    writePeak(spectrum, 12000, 0.85);
    writePeak(spectrum, 12500, 0.9);
    const peaks = findCredibleSpectralPeaks(spectrum, SAMPLE_RATE, 8);

    expect(SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz).toBe(12000);
    expect(peaks.some((peak) => peak.frequency > 11800)).toBe(true);
    expect(peaks.some((peak) => peak.frequency === 12000)).toBe(true);
    expect(peaks.every((peak) => peak.frequency <= 12000)).toBe(true);
  });

  it("derives the Rayleigh family-wise threshold from the declared false-alarm budget", () => {
    const sigma = 0.0005;
    const robustStatistic =
      SPECTRAL_EVIDENCE_POLICY.rayleighRobustStatisticScale * sigma;
    const testedBinCount = 1109;
    const threshold = computeRayleighPeakThreshold({
      noiseStatistic: robustStatistic,
      testedBinCount,
    });
    const familyWiseUpperBound =
      testedBinCount * Math.exp(-(threshold ** 2) / (2 * sigma ** 2));

    expect(familyWiseUpperBound).toBeCloseTo(
      SPECTRAL_EVIDENCE_POLICY.frameFalseAlarmProbability,
      10,
    );
  });

  it("admits a quiet coherent tone above the analyser floor and rejects a sub-threshold fluctuation", () => {
    const accepted = makeSpectrum(0);
    const rejected = makeSpectrum(0);
    writePeak(accepted, 1318, 0.0001, [0.00005, 0.000045]);
    writePeak(rejected, 1318, 0.00003, [0.000015, 0.000012]);

    expect(findCredibleSpectralPeaks(accepted, SAMPLE_RATE, 8)).toHaveLength(1);
    expect(findCredibleSpectralPeaks(rejected, SAMPLE_RATE, 8)).toHaveLength(0);
  });

  it("rejects seeded Rayleigh broadband maxima at the frame false-alarm boundary", () => {
    const spectrum = makeRayleighSpectrum(0.0005);
    const peaks = findCredibleSpectralPeaks(spectrum, SAMPLE_RATE, 64);

    expect(peaks).toEqual([]);
  });

  it("keeps immediate spectral leakage out of the local noise statistic", () => {
    const spectrum = makeSpectrum(0.0001);
    const centerBin = writePeak(spectrum, 440, 0.002, [0.0012, 0.001]);
    const evidence = measureLocalSpectralEvidence(spectrum, centerBin);

    expect(evidence.noiseSampleCount).toBe(16);
    expect(evidence.localNoiseFloor).toBeCloseTo(0.0001, 8);
    expect(evidence.excessAmplitude).toBeCloseTo(0.0019, 8);
  });

  it("uses interpolated median and upper quartile statistics", () => {
    expect(computeRobustAmplitudeStatistic([0, 1, 2, 3])).toBeCloseTo(
      (1.5 + 2.25) / 2,
      8,
    );
  });

  it("keeps peak identities gain-invariant above the measurement floor", () => {
    const spectrum = makeSpectrum(0.00002);
    writePeak(spectrum, 220, 0.0012);
    writePeak(spectrum, 1318, 0.0008);
    const scaled = Float32Array.from(spectrum, (amplitude) => amplitude * 4);

    const originalFrequencies = findCredibleSpectralPeaks(
      spectrum,
      SAMPLE_RATE,
      8,
    ).map((peak) => peak.frequency);
    const scaledFrequencies = findCredibleSpectralPeaks(
      scaled,
      SAMPLE_RATE,
      8,
    ).map((peak) => peak.frequency);

    expect(scaledFrequencies).toEqual(originalFrequencies);
  });
});
