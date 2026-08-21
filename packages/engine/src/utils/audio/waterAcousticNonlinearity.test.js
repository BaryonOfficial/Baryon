import { describe, expect, it } from "vitest";

import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import {
  createWaterAcousticDriveScratch,
  projectWaterAcousticDrive,
} from "./waterAcousticNonlinearity.js";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 4096;
const BIN_COUNT = FFT_SIZE / 2;
const FUNDAMENTAL_HZ = 375;

function makeSine(frequencyHz, amplitude = 0.5) {
  const samples = new Float32Array(FFT_SIZE);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE);
  }
  return samples;
}

function makeSinglePeakSpectrum(frequencyHz, amplitude = 0.5) {
  const spectrum = new Float32Array(BIN_COUNT);
  const bin = Math.round((frequencyHz * FFT_SIZE) / SAMPLE_RATE);
  spectrum[bin] = amplitude;
  return spectrum;
}

function measureAmplitude(samples, frequencyHz) {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const phase = (2 * Math.PI * frequencyHz * index) / SAMPLE_RATE;
    real += samples[index] * Math.cos(phase);
    imaginary -= samples[index] * Math.sin(phase);
  }
  return (2 * Math.hypot(real, imaginary)) / samples.length;
}

function sumSquares(values) {
  let total = 0;
  for (const value of values) {
    total += value * value;
  }
  return total;
}

describe("weakly nonlinear water-acoustic drive", () => {
  it.each([
    ["omitted", {}],
    ["null", { incidentPeakPressurePascalAtFullScale: null }],
    ["zero", { incidentPeakPressurePascalAtFullScale: 0 }],
  ])(
    "returns the exact linear inputs when incident pressure is %s",
    (_label, pressureDeclaration) => {
      const timeDomainData = makeSine(FUNDAMENTAL_HZ);
      const fftLinearAmplitudes = makeSinglePeakSpectrum(FUNDAMENTAL_HZ);
      const result = projectWaterAcousticDrive({
        timeDomainData,
        fftLinearAmplitudes,
        sampleRate: SAMPLE_RATE,
        cavityAcousticScale: {
          sideLengthMeters: CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters,
          soundSpeedMetersPerSecond:
            CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond,
          ...pressureDeclaration,
        },
        scratch: createWaterAcousticDriveScratch(),
      });

      expect(result.active).toBe(false);
      expect(result.timeDomainData).toBe(timeDomainData);
      expect(result.fftLinearAmplitudes).toBe(fftLinearAmplitudes);
      expect(result.generatedEnergyFraction).toBe(0);
    },
  );

  it("generates the predicted weak second harmonic without changing waveform energy", () => {
    const amplitude = 0.5;
    const timeDomainData = makeSine(FUNDAMENTAL_HZ, amplitude);
    const fftLinearAmplitudes = makeSinglePeakSpectrum(
      FUNDAMENTAL_HZ,
      amplitude,
    );
    const result = projectWaterAcousticDrive({
      timeDomainData,
      fftLinearAmplitudes,
      sampleRate: SAMPLE_RATE,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      scratch: createWaterAcousticDriveScratch(),
    });

    const beta = 1 + CAVITY_ACOUSTIC_DEFAULTS.equationOfStateNonlinearityBA / 2;
    const pressureAmplitude =
      CAVITY_ACOUSTIC_DEFAULTS.incidentPeakPressurePascalAtFullScale *
      amplitude;
    const expectedHarmonicRatio =
      (beta *
        2 *
        Math.PI *
        FUNDAMENTAL_HZ *
        CAVITY_ACOUSTIC_DEFAULTS.sideLengthMeters *
        pressureAmplitude) /
      (2 *
        CAVITY_ACOUSTIC_DEFAULTS.mediumDensityKgPerM3 *
        CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond ** 3);
    const measuredFundamental = measureAmplitude(
      result.timeDomainData,
      FUNDAMENTAL_HZ,
    );
    const measuredSecondHarmonic = measureAmplitude(
      result.timeDomainData,
      FUNDAMENTAL_HZ * 2,
    );

    expect(result.active).toBe(true);
    expect(measuredSecondHarmonic / measuredFundamental).toBeCloseTo(
      expectedHarmonicRatio,
      4,
    );
    expect(sumSquares(result.timeDomainData)).toBeCloseTo(
      sumSquares(timeDomainData),
      4,
    );
  });

  it("moves spectral energy from a fundamental into its second harmonic", () => {
    const amplitude = 0.5;
    const fundamentalBin = Math.round(
      (FUNDAMENTAL_HZ * FFT_SIZE) / SAMPLE_RATE,
    );
    const harmonicBin = fundamentalBin * 2;
    const fftLinearAmplitudes = makeSinglePeakSpectrum(
      FUNDAMENTAL_HZ,
      amplitude,
    );
    const result = projectWaterAcousticDrive({
      timeDomainData: makeSine(FUNDAMENTAL_HZ, amplitude),
      fftLinearAmplitudes,
      sampleRate: SAMPLE_RATE,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      scratch: createWaterAcousticDriveScratch(),
    });

    expect(result.fftLinearAmplitudes[fundamentalBin]).toBeLessThan(amplitude);
    expect(result.fftLinearAmplitudes[harmonicBin]).toBeGreaterThan(0);
    expect(sumSquares(result.fftLinearAmplitudes)).toBeCloseTo(
      sumSquares(fftLinearAmplitudes),
      7,
    );
    expect(result.generatedEnergyFraction).toBeGreaterThan(0);
  });

  it("reuses projection buffers without retaining prior frame data", () => {
    const scratch = createWaterAcousticDriveScratch();
    const first = projectWaterAcousticDrive({
      timeDomainData: makeSine(FUNDAMENTAL_HZ),
      fftLinearAmplitudes: makeSinglePeakSpectrum(FUNDAMENTAL_HZ),
      sampleRate: SAMPLE_RATE,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      scratch,
    });
    const second = projectWaterAcousticDrive({
      timeDomainData: makeSine(FUNDAMENTAL_HZ * 2),
      fftLinearAmplitudes: makeSinglePeakSpectrum(FUNDAMENTAL_HZ * 2),
      sampleRate: SAMPLE_RATE,
      cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      scratch,
    });

    expect(second.timeDomainData).toBe(first.timeDomainData);
    expect(second.fftLinearAmplitudes).toBe(first.fftLinearAmplitudes);
    expect(
      measureAmplitude(second.timeDomainData, FUNDAMENTAL_HZ * 2),
    ).toBeGreaterThan(measureAmplitude(second.timeDomainData, FUNDAMENTAL_HZ));
  });

  it("rejects a declared incident pressure beyond the pre-shock weak model", () => {
    expect(() =>
      projectWaterAcousticDrive({
        timeDomainData: makeSine(FUNDAMENTAL_HZ),
        fftLinearAmplitudes: makeSinglePeakSpectrum(FUNDAMENTAL_HZ),
        sampleRate: SAMPLE_RATE,
        cavityAcousticScale: {
          ...CAVITY_ACOUSTIC_DEFAULTS,
          incidentPeakPressurePascalAtFullScale: 10_000_000,
        },
        scratch: createWaterAcousticDriveScratch(),
      }),
    ).toThrow(/pre-shock weak model/);
  });
});
