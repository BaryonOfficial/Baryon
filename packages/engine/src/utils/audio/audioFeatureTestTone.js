import { TEST_TONE_SIGNALS } from "../../defaults.js";
import { frequencyToBinIndex } from "./binFrequency.js";
import { SPECTRAL_MODAL_POLICY } from "./policy.js";

const TEST_TONE_HARMONIC_ATTENUATION =
  SPECTRAL_MODAL_POLICY.harmonicAttenuation;
const HARMONIC_ORDERS = SPECTRAL_MODAL_POLICY.harmonicOrders;

export function resolveAudioTestToneSignal(value) {
  return value === TEST_TONE_SIGNALS.harmonicSeries
    ? TEST_TONE_SIGNALS.harmonicSeries
    : TEST_TONE_SIGNALS.pureSine;
}

export function applyTestToneToSnapshot({
  analysisSnapshot,
  auditSettings,
  fftSize,
  sampleRate,
}) {
  const snapshot = analysisSnapshot ?? {
    sourceMode: "test",
    avgAmplitude: 0,
    fftLinearAmplitudes: new Float32Array(fftSize / 2),
    timeData: null,
    rms: 0,
  };
  const fftLinearAmplitudes = snapshot.fftLinearAmplitudes?.length
    ? snapshot.fftLinearAmplitudes
    : new Float32Array(fftSize / 2);

  fftLinearAmplitudes.fill(0);
  const testBinAmplitude = Math.max(
    0,
    Math.min(1, auditSettings.testToneAmplitude),
  );
  const testToneSignal = resolveAudioTestToneSignal(
    auditSettings.testToneSignal,
  );
  const injectHarmonicSeries =
    testToneSignal === TEST_TONE_SIGNALS.harmonicSeries;
  const nyquist = sampleRate * 0.5;
  const writeToneBin = (frequency, amplitude) => {
    const index = frequencyToBinIndex(
      frequency,
      fftLinearAmplitudes.length,
      sampleRate,
    );
    fftLinearAmplitudes[index] = Math.max(
      fftLinearAmplitudes[index] ?? 0,
      amplitude,
    );
    if (index > 0) {
      fftLinearAmplitudes[index - 1] = Math.max(
        fftLinearAmplitudes[index - 1] ?? 0,
        amplitude * 0.35,
      );
    }
    if (index < fftLinearAmplitudes.length - 1) {
      fftLinearAmplitudes[index + 1] = Math.max(
        fftLinearAmplitudes[index + 1] ?? 0,
        amplitude * 0.35,
      );
    }
  };
  const baseFrequency = Math.max(
    0,
    Math.min(nyquist, auditSettings.testToneHz),
  );

  writeToneBin(baseFrequency, testBinAmplitude);

  if (injectHarmonicSeries) {
    for (let i = 0; i < HARMONIC_ORDERS.length; i++) {
      const harmonicFrequency = baseFrequency * HARMONIC_ORDERS[i];
      if (i === 0 || harmonicFrequency <= 0 || harmonicFrequency > nyquist) {
        continue;
      }

      const attenuation =
        TEST_TONE_HARMONIC_ATTENUATION[i] ??
        TEST_TONE_HARMONIC_ATTENUATION[
          TEST_TONE_HARMONIC_ATTENUATION.length - 1
        ] ??
        1;
      writeToneBin(harmonicFrequency, testBinAmplitude * attenuation);
    }
  }

  const timeData = new Float32Array(fftSize);
  if (baseFrequency > 0 && testBinAmplitude > 0) {
    for (let index = 0; index < timeData.length; index += 1) {
      const t = index / sampleRate;
      let sample = 0;
      if (injectHarmonicSeries) {
        for (
          let harmonicIndex = 0;
          harmonicIndex < HARMONIC_ORDERS.length;
          harmonicIndex += 1
        ) {
          const harmonicOrder = HARMONIC_ORDERS[harmonicIndex];
          const harmonicFrequency = baseFrequency * harmonicOrder;
          if (harmonicFrequency <= 0 || harmonicFrequency > nyquist) {
            continue;
          }
          const attenuation =
            TEST_TONE_HARMONIC_ATTENUATION[harmonicIndex] ??
            TEST_TONE_HARMONIC_ATTENUATION[
              TEST_TONE_HARMONIC_ATTENUATION.length - 1
            ] ??
            1;
          sample +=
            Math.sin(
              2 * Math.PI * harmonicFrequency * t + harmonicIndex * 0.37,
            ) * attenuation;
        }
      } else {
        sample = Math.sin(2 * Math.PI * baseFrequency * t);
      }
      timeData[index] = sample;
    }

    let rmsAccumulator = 0;
    for (let index = 0; index < timeData.length; index += 1) {
      rmsAccumulator += timeData[index] * timeData[index];
    }
    const rawRms = Math.sqrt(rmsAccumulator / Math.max(1, timeData.length));
    const targetRms = testBinAmplitude / Math.SQRT2;
    const rmsScale = rawRms > 1e-6 ? targetRms / rawRms : 0;
    for (let index = 0; index < timeData.length; index += 1) {
      timeData[index] = Math.max(-1, Math.min(1, timeData[index] * rmsScale));
    }
  }

  // Pure sine RMS = amplitude / sqrt(2); scale to 0-255 range like real analyser output.
  const syntheticRms = testBinAmplitude / Math.SQRT2;
  const syntheticAvgAmplitude = syntheticRms * 255;

  return {
    ...snapshot,
    sourceMode: "test",
    avgAmplitude: syntheticAvgAmplitude,
    fftLinearAmplitudes,
    timeData,
    rms: syntheticRms,
  };
}
