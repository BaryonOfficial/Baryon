import {
  binIndexToFrequencyHz,
  frequencyToBin,
  frequencyToBinIndex,
} from "./binFrequency.js";

const RAYLEIGH_ROBUST_STATISTIC_SCALE =
  (Math.sqrt(2 * Math.log(2)) + Math.sqrt(2 * Math.log(4))) / 2;

export const SPECTRAL_EVIDENCE_POLICY = Object.freeze({
  minFrequencyHz: 60,
  maxFrequencyHz: 12000,
  minPeakSeparationHz: 20,
  localNoiseWindowRadiusBins: 9,
  minLocalNoiseSamples: 8,
  analyserAmplitudeFloor: 1e-5,
  frameFalseAlarmProbability: 1e-4,
  rayleighRobustStatisticScale: RAYLEIGH_ROBUST_STATISTIC_SCALE,
});

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex] ?? 0;
  const upper = sortedValues[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function computeRobustAmplitudeStatistic(values) {
  const sorted = Array.from(values ?? [], (value) =>
    Number.isFinite(value) ? Math.max(0, value) : 0,
  ).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }
  return (quantile(sorted, 0.5) + quantile(sorted, 0.75)) / 2;
}

export function computeRayleighPeakThreshold({
  noiseStatistic,
  testedBinCount,
}) {
  const count = Math.max(1, Math.floor(testedBinCount ?? 0));
  const effectiveNoise = Math.max(
    SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor,
    Number.isFinite(noiseStatistic) ? Math.max(0, noiseStatistic) : 0,
  );
  const familyWiseMultiplier =
    Math.sqrt(
      2 * Math.log(count / SPECTRAL_EVIDENCE_POLICY.frameFalseAlarmProbability),
    ) / RAYLEIGH_ROBUST_STATISTIC_SCALE;
  return effectiveNoise * familyWiseMultiplier;
}

function resolveEvidenceBinRange(binCount, sampleRate) {
  if (!(binCount > 0) || !(sampleRate > 0)) {
    return { startBin: 0, endBin: -1, testedBinCount: 0 };
  }
  const nyquist = sampleRate * 0.5;
  const minFrequency = SPECTRAL_EVIDENCE_POLICY.minFrequencyHz;
  const maxFrequency = Math.min(
    nyquist,
    SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz,
  );
  const startBin = Math.max(
    1,
    Math.ceil(frequencyToBin(minFrequency, binCount, sampleRate)),
  );
  // Keep the continuous upper boundary inclusive on the discrete FFT lattice.
  const endBin = Math.min(
    binCount - 2,
    frequencyToBinIndex(maxFrequency, binCount, sampleRate),
  );
  return {
    startBin,
    endBin,
    testedBinCount: Math.max(0, endBin - startBin + 1),
  };
}

function buildSpectralEvidenceContext(fftLinearAmplitudes, sampleRate) {
  if (!(fftLinearAmplitudes instanceof Float32Array)) {
    return Object.freeze({
      startBin: 0,
      endBin: -1,
      testedBinCount: 0,
      noiseStatistic: 0,
      detectionThreshold: Infinity,
    });
  }
  const range = resolveEvidenceBinRange(fftLinearAmplitudes.length, sampleRate);
  const noiseSamples =
    range.testedBinCount > 0
      ? fftLinearAmplitudes.subarray(range.startBin, range.endBin + 1)
      : [];
  const noiseStatistic = computeRobustAmplitudeStatistic(noiseSamples);
  return Object.freeze({
    ...range,
    noiseStatistic,
    detectionThreshold:
      range.testedBinCount > 0
        ? computeRayleighPeakThreshold({
            noiseStatistic,
            testedBinCount: range.testedBinCount,
          })
        : Infinity,
  });
}

export function measureLocalSpectralEvidence(fftLinearAmplitudes, centerBin) {
  if (
    !(fftLinearAmplitudes instanceof Float32Array) ||
    fftLinearAmplitudes.length === 0 ||
    !Number.isFinite(centerBin)
  ) {
    return {
      peakAmplitude: 0,
      localNoiseFloor: 0,
      excessAmplitude: 0,
      snr: 0,
      noiseSampleCount: 0,
    };
  }
  const center = Math.max(
    1,
    Math.min(fftLinearAmplitudes.length - 1, Math.round(centerBin)),
  );
  const radius = SPECTRAL_EVIDENCE_POLICY.localNoiseWindowRadiusBins;
  const startBin = Math.max(1, center - radius);
  const endBin = Math.min(fftLinearAmplitudes.length - 1, center + radius);
  const noiseSamples = [];
  for (let bin = startBin; bin <= endBin; bin += 1) {
    if (Math.abs(bin - center) <= 1) {
      continue;
    }
    noiseSamples.push(Math.max(0, fftLinearAmplitudes[bin] ?? 0));
  }
  const peakAmplitude = Math.max(0, fftLinearAmplitudes[center] ?? 0);
  const localNoiseFloor = computeRobustAmplitudeStatistic(noiseSamples);
  return {
    peakAmplitude,
    localNoiseFloor,
    excessAmplitude: Math.max(0, peakAmplitude - localNoiseFloor),
    snr:
      peakAmplitude /
      Math.max(
        SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor,
        localNoiseFloor,
      ),
    noiseSampleCount: noiseSamples.length,
  };
}

export function findCredibleSpectralPeaks(
  fftLinearAmplitudes,
  sampleRate,
  limit,
) {
  if (
    !(fftLinearAmplitudes instanceof Float32Array) ||
    fftLinearAmplitudes.length === 0 ||
    !(sampleRate > 0) ||
    !(limit > 0)
  ) {
    return [];
  }
  const context = buildSpectralEvidenceContext(fftLinearAmplitudes, sampleRate);
  if (context.testedBinCount === 0) {
    return [];
  }
  const effectiveNoise = Math.max(
    SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor,
    context.noiseStatistic,
  );
  const rayleighSigma =
    effectiveNoise / SPECTRAL_EVIDENCE_POLICY.rayleighRobustStatisticScale;
  const candidates = [];
  for (let bin = context.startBin; bin <= context.endBin; bin += 1) {
    const amplitude = Math.max(0, fftLinearAmplitudes[bin] ?? 0);
    if (
      amplitude < context.detectionThreshold ||
      amplitude < (fftLinearAmplitudes[bin - 1] ?? 0) ||
      amplitude <= (fftLinearAmplitudes[bin + 1] ?? 0)
    ) {
      continue;
    }
    const localEvidence = measureLocalSpectralEvidence(
      fftLinearAmplitudes,
      bin,
    );
    if (
      localEvidence.noiseSampleCount <
      SPECTRAL_EVIDENCE_POLICY.minLocalNoiseSamples
    ) {
      continue;
    }
    const previous = fftLinearAmplitudes[bin - 1] ?? 0;
    const next = fftLinearAmplitudes[bin + 1] ?? 0;
    const denominator = previous - 2 * amplitude + next;
    const delta =
      Math.abs(denominator) > 1e-12
        ? (0.5 * (previous - next)) / denominator
        : 0;
    const interpolatedBin = bin + Math.max(-0.5, Math.min(0.5, delta));
    const interpolatedAmplitude = amplitude - 0.25 * delta * (previous - next);
    const frequency = Math.min(
      SPECTRAL_EVIDENCE_POLICY.maxFrequencyHz,
      binIndexToFrequencyHz(
        interpolatedBin,
        fftLinearAmplitudes.length,
        sampleRate,
      ),
    );
    const singleBinTailProbability = Math.exp(
      -(amplitude ** 2) / (2 * rayleighSigma ** 2),
    );
    candidates.push({
      bin,
      frequency,
      amplitude: interpolatedAmplitude,
      globalNoiseFloor: context.noiseStatistic,
      detectionThreshold: context.detectionThreshold,
      falseAlarmProbability: Math.min(
        1,
        context.testedBinCount * singleBinTailProbability,
      ),
      ...localEvidence,
    });
  }

  candidates.sort(
    (left, right) =>
      left.falseAlarmProbability - right.falseAlarmProbability ||
      right.excessAmplitude - left.excessAmplitude ||
      right.amplitude - left.amplitude ||
      left.bin - right.bin,
  );
  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= limit) {
      break;
    }
    if (
      selected.some(
        (existing) =>
          Math.abs(existing.frequency - candidate.frequency) <
          SPECTRAL_EVIDENCE_POLICY.minPeakSeparationHz,
      )
    ) {
      continue;
    }
    selected.push(candidate);
  }
  return selected;
}

export function computeSpectralEffectiveBinCount(fftLinearAmplitudes) {
  if (!(fftLinearAmplitudes instanceof Float32Array)) {
    return 0;
  }
  let totalPower = 0;
  let squaredPowerTotal = 0;
  for (let bin = 1; bin < fftLinearAmplitudes.length; bin += 1) {
    const amplitude = Math.max(0, fftLinearAmplitudes[bin] ?? 0);
    const power = amplitude * amplitude;
    totalPower += power;
    squaredPowerTotal += power * power;
  }
  return squaredPowerTotal > 0
    ? (totalPower * totalPower) / squaredPowerTotal
    : 0;
}
