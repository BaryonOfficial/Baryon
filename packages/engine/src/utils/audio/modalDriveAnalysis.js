import { findCredibleSpectralPeaks } from "./spectralEvidence.js";
import { clamp01, smoothstep } from "../math.js";

// This module measures source drive only; it does not own modal state,
// field admission, or render projection.
const DRIVE_BUFFER_LENGTH = 1024;
const MAX_SPECTRAL_PARTIALS = 14;
const MAX_RESONANT_HARMONIC = 64;
const MIN_RESONANT_HARMONIC = 2;
const RESONANT_HARMONIC_TOLERANCE = 0.045;
const MODE_RESPONSE_BASIS_CACHE_MAX_SIZE = 512;
const modeResponseBasisCache = new Map();

export function createModalDriveAnalysisScratch() {
  return {
    driveBuffer: new Float32Array(0),
    periodicityPrefixSumSq: new Float64Array(0),
  };
}

function resolveScratchFloat32(buffer, length) {
  return buffer instanceof Float32Array && buffer.length === length
    ? buffer
    : new Float32Array(length);
}

function resolveScratchFloat64(buffer, length) {
  return buffer instanceof Float64Array && buffer.length >= length
    ? buffer
    : new Float64Array(length);
}

function buildTimeDomainDrive(timeData, scratchBuffer) {
  if (!(timeData instanceof Float32Array) || timeData.length === 0) {
    return null;
  }

  const length = Math.min(DRIVE_BUFFER_LENGTH, timeData.length);
  const buffer = resolveScratchFloat32(scratchBuffer, length);
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = timeData[index] ?? 0;
    buffer[index] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak <= 1e-6) {
    return null;
  }

  for (let index = 0; index < length; index += 1) {
    buffer[index] /= peak;
  }
  return { buffer, peak, driveSource: "time-domain" };
}

function buildSpectralFallbackDrive(peaks, sampleRate, scratchBuffer) {
  const buffer = resolveScratchFloat32(scratchBuffer, DRIVE_BUFFER_LENGTH);
  buffer.fill(0);
  const amplitudeNorm = peaks[0]?.amplitude ?? 1;

  for (let index = 0; index < buffer.length; index += 1) {
    const timeSeconds = index / sampleRate;
    let sample = 0;
    for (let peakIndex = 0; peakIndex < peaks.length; peakIndex += 1) {
      const peak = peaks[peakIndex];
      const partialAmplitude = peak.amplitude / Math.max(amplitudeNorm, 1e-6);
      const phaseOffset = peakIndex * 0.41;
      sample +=
        Math.sin(2 * Math.PI * peak.frequency * timeSeconds + phaseOffset) *
        partialAmplitude;
    }
    buffer[index] = peaks.length > 0 ? sample / peaks.length : 0;
  }

  return { buffer, peak: 1, driveSource: "spectral-fallback" };
}

function resolveDriveSignal({ timeData, spectralPeaks, sampleRate, scratch }) {
  const drive =
    buildTimeDomainDrive(timeData, scratch?.driveBuffer) ??
    buildSpectralFallbackDrive(spectralPeaks, sampleRate, scratch?.driveBuffer);

  if (scratch && scratch.driveBuffer !== drive.buffer) {
    scratch.driveBuffer = drive.buffer;
  }
  return drive;
}

function computeSpectralFlatness(fftLinearAmplitudes) {
  if (
    !(fftLinearAmplitudes instanceof Float32Array) ||
    fftLinearAmplitudes.length === 0
  ) {
    return 1;
  }

  let totalPower = 0;
  for (let index = 1; index < fftLinearAmplitudes.length; index += 1) {
    const amplitude = Math.max(0, fftLinearAmplitudes[index] ?? 0);
    totalPower += amplitude * amplitude;
  }
  const count = Math.max(0, fftLinearAmplitudes.length - 1);
  if (count === 0 || totalPower <= 0) {
    return 1;
  }

  const meanPower = totalPower / count;
  const relativeFloor = Math.max(Number.MIN_VALUE, meanPower * 1e-12);
  let logPowerSum = 0;
  for (let index = 1; index < fftLinearAmplitudes.length; index += 1) {
    const amplitude = Math.max(0, fftLinearAmplitudes[index] ?? 0);
    logPowerSum += Math.log(Math.max(relativeFloor, amplitude * amplitude));
  }

  return clamp01(Math.exp(logPowerSum / count) / meanPower);
}

function computeRelativePeakInRange(
  spectralPeaks,
  minFrequencyHz,
  maxFrequencyHz,
  referenceAmplitude,
) {
  if (!(referenceAmplitude > 0)) {
    return 0;
  }

  let peakAmplitude = 0;
  for (const peak of spectralPeaks) {
    if (peak.frequency >= minFrequencyHz && peak.frequency <= maxFrequencyHz) {
      peakAmplitude = Math.max(peakAmplitude, peak.amplitude ?? 0);
    }
  }
  return clamp01(peakAmplitude / referenceAmplitude);
}

function computeResonantHarmonicSupport({
  spectralPeaks,
  dominantFrequencyHz,
  referenceAmplitude,
  resonantMinHz,
  resonantMaxHz,
}) {
  if (dominantFrequencyHz <= 0 || !(referenceAmplitude > 0)) {
    return 0;
  }

  let support = 0;
  let harmonicCount = 0;
  let supportedHarmonics = 0;
  let supportedLowHarmonics = 0;
  const maxHarmonic = Math.min(
    MAX_RESONANT_HARMONIC,
    Math.floor(resonantMaxHz / dominantFrequencyHz),
  );
  for (
    let harmonic = MIN_RESONANT_HARMONIC;
    harmonic <= maxHarmonic;
    harmonic += 1
  ) {
    const frequencyHz = dominantFrequencyHz * harmonic;
    if (frequencyHz < resonantMinHz) {
      continue;
    }
    harmonicCount += 1;
    const matchedPeak = spectralPeaks.find(
      (peak) =>
        Math.abs((peak.frequency ?? 0) - frequencyHz) / frequencyHz <=
        RESONANT_HARMONIC_TOLERANCE,
    );
    const relativeAmplitude = matchedPeak
      ? (matchedPeak.amplitude ?? 0) / referenceAmplitude
      : 0;
    support = Math.max(support, relativeAmplitude);
    if (matchedPeak) {
      supportedHarmonics += 1;
      if (harmonic <= 5) {
        supportedLowHarmonics += 1;
      }
    }
  }

  if (supportedLowHarmonics < 2) {
    return 0;
  }

  return harmonicCount > 0
    ? clamp01(support * smoothstep(1, 3, supportedHarmonics))
    : 0;
}

function computeDrivePeriodicity(buffer, sampleRate, scratch) {
  if (!(buffer instanceof Float32Array) || buffer.length < 32) {
    return 0;
  }

  const minLag = Math.max(2, Math.floor(sampleRate / 1200));
  const maxLag = Math.min(buffer.length - 2, Math.floor(sampleRate / 60));
  if (maxLag <= minLag) {
    return 0;
  }

  const prefixSumSq = resolveScratchFloat64(
    scratch?.periodicityPrefixSumSq,
    buffer.length + 1,
  );
  if (scratch && scratch.periodicityPrefixSumSq !== prefixSumSq) {
    scratch.periodicityPrefixSumSq = prefixSumSq;
  }
  prefixSumSq[0] = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    prefixSumSq[index + 1] = prefixSumSq[index] + buffer[index] * buffer[index];
  }
  const totalEnergy = prefixSumSq[buffer.length];
  if (totalEnergy <= 1e-6) {
    return 0;
  }

  let best = 0;
  let bestLag = minLag;
  const lagStep = maxLag - minLag > 192 ? 3 : 1;
  const scanLag = (lag) => {
    let correlation = 0;
    const overlapLength = buffer.length - lag;
    for (let index = 0; index < overlapLength; index += 1) {
      correlation += buffer[index] * buffer[index + lag];
    }
    const overlapEnergy = prefixSumSq[overlapLength];
    if (overlapEnergy > 1e-6) {
      const score = correlation / overlapEnergy;
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
  };

  for (let lag = minLag; lag <= maxLag; lag += lagStep) {
    scanLag(lag);
  }

  if (lagStep > 1) {
    const refineStart = Math.max(minLag, bestLag - lagStep + 1);
    const refineEnd = Math.min(maxLag, bestLag + lagStep - 1);
    for (let lag = refineStart; lag <= refineEnd; lag += 1) {
      scanLag(lag);
    }
  }

  return clamp01(best);
}

function getModeResponseBasis(sampleRate, length, frequencyHz) {
  const key = `${sampleRate}:${length}:${frequencyHz.toFixed(3)}`;
  const cached = modeResponseBasisCache.get(key);
  if (cached) {
    return cached;
  }

  const cos = new Float32Array(length);
  const sin = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const theta = (2 * Math.PI * frequencyHz * index) / sampleRate;
    cos[index] = Math.cos(theta);
    sin[index] = Math.sin(theta);
  }

  const basis = { cos, sin };
  modeResponseBasisCache.set(key, basis);
  if (modeResponseBasisCache.size > MODE_RESPONSE_BASIS_CACHE_MAX_SIZE) {
    const oldestKey = modeResponseBasisCache.keys().next().value;
    modeResponseBasisCache.delete(oldestKey);
  }
  return basis;
}

export function analyzeModalDrive({
  timeData,
  fftLinearAmplitudes,
  sampleRate,
  trebleBroadbandEnergy,
  resonantMinHz,
  resonantMaxHz,
  scratch = null,
}) {
  const spectralPeaks = findCredibleSpectralPeaks(
    fftLinearAmplitudes,
    sampleRate,
    MAX_SPECTRAL_PARTIALS,
  );
  const drive = resolveDriveSignal({
    timeData,
    spectralPeaks,
    sampleRate,
    scratch,
  });
  const flatness = computeSpectralFlatness(fftLinearAmplitudes);
  const dominantSpectralPeak = spectralPeaks[0] ?? null;
  const dominantFrequencyHz = dominantSpectralPeak?.frequency ?? 0;
  const dominantSpectralSupport = dominantSpectralPeak?.amplitude ?? 0;

  return {
    driveBuffer: drive.buffer,
    drivePeak: drive.peak,
    driveSource: drive.driveSource,
    periodicity: computeDrivePeriodicity(drive.buffer, sampleRate, scratch),
    tonalness: clamp01(1 - flatness * 1.1),
    distributedExcitation: clamp01(
      trebleBroadbandEnergy * 0.62 + flatness * 0.38,
    ),
    dominantDriveFrequencyHz: dominantFrequencyHz,
    dominantDriveSpectralSupport: dominantSpectralSupport,
    resonantBandPeak: computeRelativePeakInRange(
      spectralPeaks,
      resonantMinHz,
      resonantMaxHz,
      dominantSpectralSupport,
    ),
    resonantBandHarmonicSupport: computeResonantHarmonicSupport({
      spectralPeaks,
      dominantFrequencyHz,
      referenceAmplitude: dominantSpectralSupport,
      resonantMinHz,
      resonantMaxHz,
    }),
  };
}

export function measureModalDriveResponse(buffer, sampleRate, frequencyHz) {
  if (
    !(buffer instanceof Float32Array) ||
    buffer.length === 0 ||
    frequencyHz <= 0
  ) {
    return { magnitude: 0, phase: 0 };
  }

  const basis = getModeResponseBasis(sampleRate, buffer.length, frequencyHz);
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = buffer[index] ?? 0;
    real += sample * basis.cos[index];
    imaginary -= sample * basis.sin[index];
  }

  const magnitude = Math.hypot(real, imaginary) / Math.max(1, buffer.length);
  return {
    magnitude: clamp01(magnitude * 2.6),
    phase: Math.atan2(imaginary, real),
  };
}
