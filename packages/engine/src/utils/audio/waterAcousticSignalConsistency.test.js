import { describe, expect, it } from "vitest";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import {
  createWaterAcousticDriveScratch,
  projectWaterAcousticDrive,
} from "./waterAcousticNonlinearity.js";

const SAMPLE_RATE = 48_000;

function sumSquares(samples) {
  return samples.reduce((total, value) => total + value * value, 0);
}

function makeSignal(tones, size, sampleRate = SAMPLE_RATE) {
  return Float32Array.from({ length: size }, (_, index) =>
    tones.reduce(
      (sample, { frequency, amplitude, phase = 0 }) =>
        sample +
        amplitude *
          Math.sin((2 * Math.PI * frequency * index) / sampleRate + phase),
      0,
    ),
  );
}

// Independent analytical first-order simple-wave products, retaining only
// frequencies below Nyquist. Unlike an FFT implementation this has no aliasing.
function analyticProjection(tones, size, scale = CAVITY_ACOUSTIC_DEFAULTS) {
  const beta = 1 + scale.equationOfStateNonlinearityBA / 2;
  const tau =
    (beta *
      scale.sideLengthMeters *
      scale.incidentPeakPressurePascalAtFullScale) /
    (scale.mediumDensityKgPerM3 * scale.soundSpeedMetersPerSecond ** 3);
  const input = makeSignal(tones, size);
  const projected = Float64Array.from(input, (sample, index) => {
    const time = index / SAMPLE_RATE;
    let quadratic = 0;
    for (let first = 0; first < tones.length; first += 1) {
      const a = tones[first];
      const omegaA = 2 * Math.PI * a.frequency;
      const phaseA = a.phase ?? 0;
      if (2 * a.frequency < SAMPLE_RATE / 2) {
        quadratic +=
          ((a.amplitude ** 2 * omegaA) / 2) *
          Math.sin(2 * omegaA * time + 2 * phaseA);
      }
      for (let second = first + 1; second < tones.length; second += 1) {
        const b = tones[second];
        const omegaB = 2 * Math.PI * b.frequency;
        const phaseB = b.phase ?? 0;
        const amplitude = (a.amplitude * b.amplitude) / 2;
        if (a.frequency + b.frequency < SAMPLE_RATE / 2) {
          quadratic +=
            amplitude *
            (omegaA + omegaB) *
            Math.sin((omegaA + omegaB) * time + phaseA + phaseB);
        }
        quadratic +=
          amplitude *
          (omegaB - omegaA) *
          Math.sin((omegaA - omegaB) * time + phaseA - phaseB);
      }
    }
    return sample + tau * quadratic;
  });
  const energyScale = Math.sqrt(sumSquares(input) / sumSquares(projected));
  return Float32Array.from(projected, (sample) => sample * energyScale);
}

// Direct DFT reference: deliberately independent of production FFT helpers.
function measureSpectrum(samples) {
  const size = samples.length;
  return Float32Array.from({ length: size / 2 }, (_, bin) => {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < size; index += 1) {
      const phase = (2 * Math.PI * index) / size;
      const window = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
      real += samples[index] * window * Math.cos(bin * phase);
      imaginary -= samples[index] * window * Math.sin(bin * phase);
    }
    const magnitude = Math.hypot(real, imaginary) / size;
    return magnitude <= 1e-5
      ? 0
      : Math.min(1, (magnitude * (bin === 0 ? 1 : 2)) / 0.42);
  });
}

function project(samples, options = {}) {
  return projectWaterAcousticDrive({
    timeDomainData: samples,
    fftLinearAmplitudes: new Float32Array(samples.length / 2),
    sampleRate: SAMPLE_RATE,
    cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
    ...options,
  });
}

describe("one dealiased water-acoustic signal", () => {
  it("measures the published spectrum from the returned waveform, including off-bin leakage", () => {
    const input = makeSignal(
      [
        { frequency: 1513, amplitude: 0.5, phase: 0.4 },
        { frequency: 2731, amplitude: 0.2, phase: -0.8 },
      ],
      256,
    );
    const preserved = input.slice();
    const result = project(input);
    const expected = measureSpectrum(result.timeDomainData);
    for (let bin = 0; bin < expected.length; bin += 1) {
      expect(result.fftLinearAmplitudes[bin]).toBeCloseTo(expected[bin], 7);
    }
    expect(input).toEqual(preserved);
    expect(sumSquares(result.timeDomainData)).toBeCloseTo(sumSquares(input), 5);
  });

  it.each([
    [
      "sum and difference products",
      [
        { frequency: 375, amplitude: 0.5, phase: 0.35 },
        { frequency: 656.25, amplitude: 0.25, phase: -0.62 },
      ],
    ],
    [
      "in-band products of high-frequency notes",
      [
        { frequency: 15_000, amplitude: 0.3, phase: 0.21 },
        { frequency: 18_000, amplitude: 0.2, phase: -0.39 },
      ],
    ],
    [
      "phase interference with an existing harmonic",
      [
        { frequency: 1875, amplitude: 0.5, phase: 0.2 },
        { frequency: 3750, amplitude: 0.02, phase: 0.4 + Math.PI },
      ],
    ],
  ])("matches the analytical waveform for %s", (_name, tones) => {
    const size = 2048;
    const scale = {
      ...CAVITY_ACOUSTIC_DEFAULTS,
      incidentPeakPressurePascalAtFullScale: 300_000,
    };
    const result = project(makeSignal(tones, size), {
      cavityAcousticScale: scale,
    });
    const expected = analyticProjection(tones, size, scale);
    for (let index = 0; index < size; index += 1) {
      expect(result.timeDomainData[index]).toBeCloseTo(expected[index], 6);
    }
    expect(result.generatedEnergyFraction).toBeGreaterThan(0);
  });

  it("does not fold a 22.5 kHz tone's second harmonic into a false 3 kHz drive", () => {
    const input = makeSignal([{ frequency: 22_500, amplitude: 0.5 }], 2048);
    const result = project(input);
    for (let index = 0; index < input.length; index += 1) {
      expect(result.timeDomainData[index]).toBeCloseTo(input[index], 7);
    }
    expect(result.fftLinearAmplitudes[128]).toBe(0);
    expect(result.fftLinearAmplitudes[960]).toBeCloseTo(0.5, 6);
    expect(result.generatedEnergyFraction).toBeLessThan(1e-12);
  });

  it("ignores a contradictory magnitude spectrum when a waveform owns the drive", () => {
    const input = makeSignal([{ frequency: 1500, amplitude: 0.5 }], 256);
    const scratch = createWaterAcousticDriveScratch();
    const first = project(input, { scratch });
    const expected = first.fftLinearAmplitudes.slice();
    const second = project(input, {
      scratch,
      fftLinearAmplitudes: new Float32Array(128).fill(1),
    });
    expect(second.fftLinearAmplitudes).toEqual(expected);
    expect(second.timeDomainData).toBe(first.timeDomainData);
    expect(second.fftLinearAmplitudes).toBe(first.fftLinearAmplitudes);
  });

  it("preserves DC and source Nyquist samples without generating lower-frequency products", () => {
    for (const samples of [
      new Float32Array(256).fill(0.2),
      Float32Array.from({ length: 256 }, (_, index) => 0.5 * (-1) ** index),
    ]) {
      const result = project(samples);
      expect(result.timeDomainData).toEqual(samples);
      expect(result.generatedEnergyFraction).toBeLessThan(1e-12);
    }
  });

  it("keeps fast and structural aperture storage separate and reusable", () => {
    const scratch = createWaterAcousticDriveScratch();
    const fast = project(
      makeSignal([{ frequency: 1500, amplitude: 0.5 }], 256),
      { scratch },
    );
    const preserved = fast.timeDomainData.slice();
    const structural = project(
      makeSignal([{ frequency: 3000, amplitude: 0.3 }], 1024),
      { scratch },
    );
    expect(fast.timeDomainData).toEqual(preserved);
    expect(structural.timeDomainData).not.toBe(fast.timeDomainData);
    const nextFast = project(
      makeSignal([{ frequency: 2250, amplitude: 0.2 }], 256),
      { scratch },
    );
    expect(nextFast.timeDomainData).toBe(fast.timeDomainData);
    expect(nextFast.fftLinearAmplitudes).toBe(fast.fftLinearAmplitudes);
    expect(nextFast.timeDomainData).not.toEqual(preserved);
  });

  it.each([null, new Float32Array(0), new Float32Array(256)])(
    "keeps magnitude-only evidence linear with an absent or silent waveform",
    (timeDomainData) => {
      const spectrum = new Float32Array(128);
      spectrum[8] = 0.5;
      const result = projectWaterAcousticDrive({
        timeDomainData,
        fftLinearAmplitudes: spectrum,
        sampleRate: SAMPLE_RATE,
        cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
      });
      expect(result.timeDomainData).toBe(timeDomainData);
      expect(result.fftLinearAmplitudes).toBe(spectrum);
      expect(result.generatedEnergyFraction).toBe(0);
    },
  );
});
