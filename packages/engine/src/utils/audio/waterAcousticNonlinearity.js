import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { frequencyToBinIndex } from "./binFrequency.js";
import { findCredibleSpectralPeaks } from "./spectralEvidence.js";

const WATER_MEDIUM = "water";
const SPECTRAL_HARMONIC_LIMIT = 16;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function readPositiveApparatusValue(scale, key) {
  const value = hasOwn(scale, key) ? scale[key] : CAVITY_ACOUSTIC_DEFAULTS[key];
  if (!(Number.isFinite(value) && value > 0)) {
    throw new TypeError(`Water acoustic apparatus ${key} must be positive`);
  }
  return value;
}

function resolveIncidentPeakPressurePascalAtFullScale(scale) {
  const value = hasOwn(scale, "incidentPeakPressurePascalAtFullScale")
    ? scale.incidentPeakPressurePascalAtFullScale
    : 0;
  if (value == null || value === 0) {
    return 0;
  }
  if (!(Number.isFinite(value) && value > 0)) {
    throw new TypeError(
      "Water acoustic apparatus incidentPeakPressurePascalAtFullScale must be positive, zero, or null",
    );
  }
  return value;
}

/**
 * Resolve the one declared weakly nonlinear water apparatus.
 *
 * The pressure declaration maps captured full scale to incident peak pressure
 * at the virtual drive plane; it is not source level at 1 m, a hardware
 * measurement, or inferred from normalized render energy. Explicit null/zero
 * pressure is the hard linear boundary.
 */
function resolveWaterAcousticNonlinearityApparatus(cavityAcousticScale) {
  const scale = cavityAcousticScale ?? CAVITY_ACOUSTIC_DEFAULTS;
  const acousticMedium = hasOwn(scale, "acousticMedium")
    ? scale.acousticMedium
    : CAVITY_ACOUSTIC_DEFAULTS.acousticMedium;
  const incidentPeakPressurePascalAtFullScale =
    resolveIncidentPeakPressurePascalAtFullScale(scale);
  if (incidentPeakPressurePascalAtFullScale === 0) {
    return {
      active: false,
      acousticMedium,
      incidentPeakPressurePascalAtFullScale: 0,
      nonlinearCoefficientBeta: 0,
      propagationTimeScaleSeconds: 0,
    };
  }
  if (acousticMedium !== WATER_MEDIUM) {
    throw new TypeError(
      `Finite-amplitude acoustic drive supports water, received ${String(acousticMedium)}`,
    );
  }

  const sideLengthMeters = readPositiveApparatusValue(
    scale,
    "sideLengthMeters",
  );
  const soundSpeedMetersPerSecond = readPositiveApparatusValue(
    scale,
    "soundSpeedMetersPerSecond",
  );
  const mediumDensityKgPerM3 = readPositiveApparatusValue(
    scale,
    "mediumDensityKgPerM3",
  );
  const equationOfStateNonlinearityBA = readPositiveApparatusValue(
    scale,
    "equationOfStateNonlinearityBA",
  );
  const nonlinearCoefficientBeta = 1 + equationOfStateNonlinearityBA / 2;
  const propagationTimeScaleSeconds =
    (nonlinearCoefficientBeta *
      sideLengthMeters *
      incidentPeakPressurePascalAtFullScale) /
    (mediumDensityKgPerM3 * soundSpeedMetersPerSecond ** 3);

  return {
    active: true,
    acousticMedium,
    sideLengthMeters,
    soundSpeedMetersPerSecond,
    mediumDensityKgPerM3,
    equationOfStateNonlinearityBA,
    nonlinearCoefficientBeta,
    incidentPeakPressurePascalAtFullScale,
    propagationTimeScaleSeconds,
  };
}

export function createWaterAcousticDriveScratch() {
  return {
    timeDomainData: new Float32Array(0),
    fftLinearAmplitudes: new Float32Array(0),
    spectralEnergyDelta: new Float64Array(0),
  };
}

function ensureFloat32(buffer, length) {
  return buffer instanceof Float32Array && buffer.length === length
    ? buffer
    : new Float32Array(length);
}

function ensureFloat64(buffer, length) {
  return buffer instanceof Float64Array && buffer.length === length
    ? buffer
    : new Float64Array(length);
}

function readSpectralAmplitude(input, index) {
  const value = input[index];
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function projectTimeDomainDrive({
  input,
  sampleRate,
  propagationTimeScaleSeconds,
  scratch,
}) {
  if (!(input instanceof Float32Array) || input.length === 0) {
    return input;
  }
  const output = ensureFloat32(scratch.timeDomainData, input.length);
  scratch.timeDomainData = output;

  let inputEnergy = 0;
  let projectedEnergy = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = Number.isFinite(input[index]) ? input[index] : 0;
    const previous = Number.isFinite(input[Math.max(0, index - 1)])
      ? input[Math.max(0, index - 1)]
      : sample;
    const next = Number.isFinite(input[Math.min(input.length - 1, index + 1)])
      ? input[Math.min(input.length - 1, index + 1)]
      : sample;
    const divisor = index === 0 || index === input.length - 1 ? 1 : 2;
    const derivative = ((next - previous) * sampleRate) / divisor;
    const projected =
      sample + propagationTimeScaleSeconds * sample * derivative;
    output[index] = projected;
    inputEnergy += sample * sample;
    projectedEnergy += projected * projected;
  }

  const energyScale =
    inputEnergy > 0 && projectedEnergy > 0
      ? Math.sqrt(inputEnergy / projectedEnergy)
      : 1;
  for (let index = 0; index < output.length; index += 1) {
    output[index] *= energyScale;
  }
  return output;
}

function projectSpectralDrive({ input, sampleRate, apparatus, scratch }) {
  if (!(input instanceof Float32Array) || input.length === 0) {
    return { output: input, generatedEnergy: 0, inputEnergy: 0 };
  }
  const output = ensureFloat32(scratch.fftLinearAmplitudes, input.length);
  const energyDelta = ensureFloat64(scratch.spectralEnergyDelta, input.length);
  scratch.fftLinearAmplitudes = output;
  scratch.spectralEnergyDelta = energyDelta;
  output.set(input);
  energyDelta.fill(0);

  let inputEnergy = 0;
  for (let index = 0; index < input.length; index += 1) {
    const amplitude = readSpectralAmplitude(input, index);
    inputEnergy += amplitude * amplitude;
  }
  if (!(inputEnergy > 0)) {
    return { output, generatedEnergy: 0, inputEnergy: 0 };
  }

  let generatedEnergy = 0;
  const peaks = findCredibleSpectralPeaks(
    input,
    sampleRate,
    SPECTRAL_HARMONIC_LIMIT,
  );
  for (const peak of peaks) {
    const frequencyHz = peak?.frequency ?? 0;
    const harmonicFrequencyHz = frequencyHz * 2;
    if (!(frequencyHz > 0) || harmonicFrequencyHz >= sampleRate / 2) {
      continue;
    }
    const sourceBin = frequencyToBinIndex(
      frequencyHz,
      input.length,
      sampleRate,
    );
    const harmonicBin = frequencyToBinIndex(
      harmonicFrequencyHz,
      input.length,
      sampleRate,
    );
    if (sourceBin === harmonicBin) {
      continue;
    }
    const sourceAmplitude = readSpectralAmplitude(input, sourceBin);
    const sourceEnergy = sourceAmplitude * sourceAmplitude;
    if (!(sourceEnergy > 0)) {
      continue;
    }

    // Lossless pre-shock plane-wave perturbation:
    // p2/p1 = beta * omega * L * p1 / (2 rho c^3).
    const pressureAmplitude =
      apparatus.incidentPeakPressurePascalAtFullScale * sourceAmplitude;
    const harmonicAmplitudeRatio =
      (apparatus.nonlinearCoefficientBeta *
        2 *
        Math.PI *
        frequencyHz *
        apparatus.sideLengthMeters *
        pressureAmplitude) /
      (2 *
        apparatus.mediumDensityKgPerM3 *
        apparatus.soundSpeedMetersPerSecond ** 3);
    const transferredEnergy =
      sourceEnergy *
      (harmonicAmplitudeRatio ** 2 / (1 + harmonicAmplitudeRatio ** 2));
    energyDelta[sourceBin] -= transferredEnergy;
    energyDelta[harmonicBin] += transferredEnergy;
    generatedEnergy += transferredEnergy;
  }

  for (let index = 0; index < output.length; index += 1) {
    const sourceAmplitude = readSpectralAmplitude(input, index);
    output[index] = Math.sqrt(
      Math.max(0, sourceAmplitude * sourceAmplitude + energyDelta[index]),
    );
  }
  return { output, generatedEnergy, inputEnergy };
}

/**
 * First-order, lossless finite-amplitude propagation for the virtual water
 * cavity. The source waveform is not mutated. Time-domain steepening preserves
 * total mean-square amplitude; the modal-only magnitude spectrum transfers
 * corresponding weak self-harmonic energy from each credible parent to 2f.
 *
 * No render, topology, observer, or transport state may call this as a trigger.
 * One captured source frame plus the declared apparatus are the complete input.
 */
export function projectWaterAcousticDrive({
  timeDomainData,
  fftLinearAmplitudes,
  sampleRate,
  cavityAcousticScale,
  scratch = createWaterAcousticDriveScratch(),
}) {
  const apparatus =
    resolveWaterAcousticNonlinearityApparatus(cavityAcousticScale);
  if (!apparatus.active) {
    return {
      ...apparatus,
      timeDomainData,
      fftLinearAmplitudes,
      generatedEnergyFraction: 0,
      fullScaleCharacteristicDistortion: 0,
    };
  }
  if (!(Number.isFinite(sampleRate) && sampleRate > 0)) {
    throw new TypeError(
      "Weakly nonlinear water drive requires a positive sampleRate",
    );
  }
  const fullScaleCharacteristicDistortion =
    apparatus.propagationTimeScaleSeconds * Math.PI * sampleRate;
  if (fullScaleCharacteristicDistortion >= 1) {
    throw new RangeError(
      "Water acoustic apparatus exceeds the pre-shock weak model at Nyquist",
    );
  }

  const projectedTimeDomainData = projectTimeDomainDrive({
    input: timeDomainData,
    sampleRate,
    propagationTimeScaleSeconds: apparatus.propagationTimeScaleSeconds,
    scratch,
  });
  const spectralProjection = projectSpectralDrive({
    input: fftLinearAmplitudes,
    sampleRate,
    apparatus,
    scratch,
  });
  return {
    ...apparatus,
    timeDomainData: projectedTimeDomainData,
    fftLinearAmplitudes: spectralProjection.output,
    generatedEnergyFraction:
      spectralProjection.inputEnergy > 0
        ? spectralProjection.generatedEnergy / spectralProjection.inputEnergy
        : 0,
    fullScaleCharacteristicDistortion,
  };
}
