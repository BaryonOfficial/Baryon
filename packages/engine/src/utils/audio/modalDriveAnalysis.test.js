import { describe, expect, it } from "vitest";

import {
  analyzeModalDrive,
  createModalDriveAnalysisScratch,
  measureModalDriveResponse,
} from "./modalDriveAnalysis.js";

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const RESONANT_MIN_HZ = 200;
const RESONANT_MAX_HZ = 12000;

function buildSineWave(frequencyHz, amplitude = 1) {
  const samples = new Float32Array(1024);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE);
  }
  return samples;
}

function analyze({ timeData, fftLinearAmplitudes }) {
  return analyzeModalDrive({
    timeData,
    fftLinearAmplitudes,
    sampleRate: SAMPLE_RATE,
    trebleBroadbandEnergy: 0,
    resonantMinHz: RESONANT_MIN_HZ,
    resonantMaxHz: RESONANT_MAX_HZ,
    scratch: createModalDriveAnalysisScratch(),
  });
}

describe("modal drive analysis", () => {
  it("measures periodic time-domain drive and its modal response", () => {
    const drive = analyze({
      timeData: buildSineWave(220, 0.4),
      fftLinearAmplitudes: new Float32Array(FFT_SIZE / 2),
    });
    const response = measureModalDriveResponse(
      drive.driveBuffer,
      SAMPLE_RATE,
      220,
    );

    expect(drive.driveSource).toBe("time-domain");
    expect(drive.drivePeak).toBeCloseTo(0.4, 3);
    expect(drive.periodicity).toBeGreaterThan(0.5);
    expect(response.magnitude).toBeGreaterThan(0.9);
    expect(Number.isFinite(response.phase)).toBe(true);
  });

  it("builds a deterministic spectral fallback when samples are absent", () => {
    const fftLinearAmplitudes = new Float32Array(FFT_SIZE / 2);
    const frequencyBin = Math.round((440 * FFT_SIZE) / SAMPLE_RATE);
    fftLinearAmplitudes[frequencyBin] = 0.8;

    const first = analyze({ timeData: null, fftLinearAmplitudes });
    const second = analyze({ timeData: null, fftLinearAmplitudes });

    expect(first.driveSource).toBe("spectral-fallback");
    expect(first.drivePeak).toBe(1);
    expect(first.driveBuffer).toEqual(second.driveBuffer);
    expect(first.dominantDriveFrequencyHz).toBeGreaterThan(0);
  });

  it("returns a closed measurement for invalid modal probes", () => {
    expect(
      measureModalDriveResponse(new Float32Array(0), SAMPLE_RATE, 220),
    ).toEqual({ magnitude: 0, phase: 0 });
    expect(
      measureModalDriveResponse(buildSineWave(220), SAMPLE_RATE, 0),
    ).toEqual({ magnitude: 0, phase: 0 });
  });
});
