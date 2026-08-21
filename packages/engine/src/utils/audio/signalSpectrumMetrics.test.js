import { describe, expect, it } from "vitest";
import { computeSignalSpectrumMetrics } from "./signalSpectrumMetrics.js";
import { SPECTRAL_EVIDENCE_POLICY } from "./spectralEvidence.js";

const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;
const BIN_COUNT = FFT_SIZE / 2;

function frequencyToBin(frequencyHz) {
  return Math.round((frequencyHz / SAMPLE_RATE) * FFT_SIZE);
}

function compute(fftLinearAmplitudes, previousSpectrum = null) {
  return computeSignalSpectrumMetrics({
    fftLinearAmplitudes,
    previousSpectrum:
      previousSpectrum ?? new Float32Array(fftLinearAmplitudes.length),
    sampleRate: SAMPLE_RATE,
    fftSize: FFT_SIZE,
  });
}

describe("signal spectrum metrics", () => {
  it("normalizes positive magnitude flux against the current spectrum", () => {
    const attack = new Float32Array(BIN_COUNT);
    attack[frequencyToBin(440)] = 0.9;
    attack[frequencyToBin(880)] = 0.7;
    attack[frequencyToBin(1320)] = 0.5;

    const first = compute(attack);
    const repeated = compute(attack, attack);

    expect(first.spectralFlux).toBeCloseTo(1, 6);
    expect(repeated.spectralFlux).toBe(0);
  });

  it("separates a tone from band-limited broadband material", () => {
    const tone = new Float32Array(BIN_COUNT);
    tone[frequencyToBin(440)] = 0.2;
    const bandLimitedNoise = new Float32Array(BIN_COUNT);
    for (
      let bin = frequencyToBin(3200);
      bin <= frequencyToBin(10000);
      bin += 1
    ) {
      bandLimitedNoise[bin] = 0.2;
    }

    const tonal = compute(tone);
    const broadband = compute(bandLimitedNoise);

    expect(tonal.spectralFlatness).toBeLessThan(0.05);
    expect(broadband.spectralFlatness).toBeGreaterThan(0.75);
    expect(broadband.spectralFlatness).toBeGreaterThan(tonal.spectralFlatness);
  });

  it("keeps silence at zero flatness and spread", () => {
    const silent = compute(new Float32Array(BIN_COUNT));

    expect(silent.spectralFlatness).toBe(0);
    expect(silent.spectralSpread).toBe(0);
  });

  it("keeps color and transient analysis inside the 12 kHz evidence window", () => {
    const edge = new Float32Array(BIN_COUNT);
    edge[frequencyToBin(SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz)] = 0.8;
    const above = new Float32Array(BIN_COUNT);
    above[frequencyToBin(SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz + 3000)] = 0.8;

    const edgeMetrics = compute(edge);
    const aboveMetrics = compute(above);

    expect(edgeMetrics.spectralBandEnergies.at(-1)).toBeGreaterThan(0);
    expect(edgeMetrics.spectralFlux).toBeGreaterThan(0);
    expect(Array.from(aboveMetrics.spectralBandEnergies)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(aboveMetrics.spectralCentroid).toBe(0);
    expect(aboveMetrics.spectralFlux).toBe(0);
  });
});
