import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { createFftPlan, executeFft } from "../../core/audio/fft.js";
import {
  computeBlackmanWindow,
  normalizeFftMagnitude,
} from "../../core/audio/fftSpectrum.js";

const WATER_MEDIUM = "water";

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
    // Acquisition uses a short and a long aperture. Keep their storage separate
    // so structural preparation cannot overwrite the prepared fast waveform.
    plans: new Map(),
  };
}

function prepareSignalScratch(cache, size) {
  const existing = cache.plans.get(size);
  if (existing) {
    return existing;
  }
  // Quadratic products can double the source bandwidth. Padding to 2N
  // evaluates those products before truncation, without wrapping them into
  // lower frequencies. Plans and output buffers belong only to this scratch.
  const window = Float64Array.from({ length: size }, (_, index) =>
    size === 2 ? 1 : computeBlackmanWindow(index, size),
  );
  const plan = {
    signalPlan: createFftPlan(size),
    oversampledPlan: createFftPlan(2 * size),
    timeDomainData: new Float32Array(size),
    fftLinearAmplitudes: new Float32Array(size / 2),
    window,
    coherentGain: window.reduce((total, sample) => total + sample, 0) / size,
  };
  // A changed acquisition size may replace a plan; historical apertures must
  // not retain unbounded storage across device or session changes.
  if (cache.plans.size === 2) {
    cache.plans.delete(cache.plans.keys().next().value);
  }
  cache.plans.set(size, plan);
  return plan;
}

function transformSignal({
  input,
  sampleRate,
  propagationTimeScaleSeconds,
  signal,
  padded,
}) {
  const size = input.length;
  const halfSize = size / 2;
  let inputEnergy = 0;
  for (let index = 0; index < size; index += 1) {
    const sample = Number.isFinite(input[index]) ? input[index] : 0;
    signal.real[index] = sample;
    signal.imaginary[index] = 0;
    inputEnergy += sample * sample;
  }
  executeFft(signal);

  padded.real.fill(0);
  padded.imaginary.fill(0);
  for (let bin = 0; bin < halfSize; bin += 1) {
    // Twice as many inverse-transform samples require twice the coefficients.
    padded.real[bin] = 2 * signal.real[bin];
    padded.imaginary[bin] = 2 * signal.imaginary[bin];
    if (bin > 0) {
      padded.real[padded.size - bin] = 2 * signal.real[size - bin];
      padded.imaginary[padded.size - bin] = 2 * signal.imaginary[size - bin];
    }
  }
  // The real source Nyquist coefficient splits into conjugate endpoints on
  // the interpolated grid. Preserve its linear samples in the final signal.
  padded.real[halfSize] = signal.real[halfSize];
  padded.real[padded.size - halfSize] = signal.real[halfSize];
  executeFft(padded, true);
  for (let index = 0; index < padded.size; index += 1) {
    padded.real[index] *= padded.real[index];
    padded.imaginary[index] = 0;
  }
  executeFft(padded);

  // x dx/dt = (1/2) d(x^2)/dt. Differentiating the dealiased product keeps
  // self-harmonics, sum/difference products, and their complex phases together.
  // Only nonlinear coefficients strictly below source Nyquist are retained.
  let correctionEnergy = 0;
  for (let bin = 1; bin < halfSize; bin += 1) {
    const derivativeScale =
      (propagationTimeScaleSeconds * Math.PI * bin * sampleRate) / (2 * size);
    const correctionReal = -padded.imaginary[bin] * derivativeScale;
    const correctionImaginary = padded.real[bin] * derivativeScale;
    correctionEnergy +=
      (2 * (correctionReal ** 2 + correctionImaginary ** 2)) / size;
    signal.real[bin] += correctionReal;
    signal.imaginary[bin] += correctionImaginary;
    signal.real[size - bin] = signal.real[bin];
    signal.imaginary[size - bin] = -signal.imaginary[bin];
  }
  executeFft(signal, true);
  let projectedEnergy = 0;
  for (let index = 0; index < size; index += 1) {
    projectedEnergy += signal.real[index] ** 2;
  }
  return { inputEnergy, projectedEnergy, correctionEnergy };
}

/**
 * Unnormalized periodic-aperture operator for continuous preparation.
 * The caller owns stereo gain and overlap-add; neither belongs in this kernel.
 * Output storage is supplied by the caller and survives the next transform.
 */
export function createWaterAcousticFrameTransform({
  sampleRate,
  cavityAcousticScale,
  size = 2048,
}) {
  const apparatus =
    resolveWaterAcousticNonlinearityApparatus(cavityAcousticScale);
  if (!(Number.isFinite(sampleRate) && sampleRate > 0))
    throw new TypeError("Water acoustic drive requires a positive sampleRate");
  if (apparatus.propagationTimeScaleSeconds * Math.PI * sampleRate >= 1)
    throw new RangeError(
      "Water acoustic apparatus exceeds the pre-shock weak model at Nyquist",
    );
  const signal = createFftPlan(size);
  const padded = createFftPlan(2 * size);
  return {
    active: apparatus.active,
    transform(input, output) {
      if (
        !(input instanceof Float32Array || input instanceof Float64Array) ||
        input.length !== size ||
        !input.every(Number.isFinite) ||
        !(output instanceof Float64Array) ||
        output.length !== size ||
        input.buffer === output.buffer
      )
        throw new TypeError(
          "Water frame requires finite PCM and distinct Float64 output",
        );
      if (!apparatus.active) {
        let inputEnergy = 0;
        for (const value of input) inputEnergy += value * value;
        if (!Number.isFinite(inputEnergy))
          throw new RangeError(
            "Water frame overflowed its finite numerical range",
          );
        output.set(input);
        return {
          inputEnergy,
          projectedEnergy: inputEnergy,
          correctionEnergy: 0,
        };
      }
      const energies = transformSignal({
        input,
        sampleRate,
        propagationTimeScaleSeconds: apparatus.propagationTimeScaleSeconds,
        signal,
        padded,
      });
      if (
        !Object.values(energies).every(Number.isFinite) ||
        !signal.real.every(Number.isFinite)
      )
        throw new RangeError(
          "Water frame overflowed its finite numerical range",
        );
      output.set(signal.real);
      return energies;
    },
  };
}

function projectSignal({
  input,
  sampleRate,
  propagationTimeScaleSeconds,
  scratch: cache,
}) {
  const size = input.length;
  const scratch = prepareSignalScratch(cache, size);
  const signal = scratch.signalPlan;
  const halfSize = size / 2;
  const { inputEnergy, projectedEnergy, correctionEnergy } = transformSignal({
    input,
    sampleRate,
    propagationTimeScaleSeconds,
    signal,
    padded: scratch.oversampledPlan,
  });
  // Retain the existing lossless, first-order model's mean-square constraint
  // in the represented band, after discarding unrepresentable frequencies.
  const energyScale =
    inputEnergy > 0 && projectedEnergy > 0
      ? Math.sqrt(inputEnergy / projectedEnergy)
      : 1;
  const output = scratch.timeDomainData;
  for (let index = 0; index < size; index += 1) {
    output[index] = signal.real[index] * energyScale;
  }

  // The published modal spectrum is measured from that exact Float32 waveform
  // with the shared acquisition aperture and amplitude convention, not from
  // parent-peak magnitudes or a separately normalized energy ledger.
  for (let index = 0; index < size; index += 1) {
    signal.real[index] = output[index] * scratch.window[index];
    signal.imaginary[index] = 0;
  }
  executeFft(signal);
  for (let bin = 0; bin < halfSize; bin += 1) {
    scratch.fftLinearAmplitudes[bin] = normalizeFftMagnitude(
      Math.hypot(signal.real[bin], signal.imaginary[bin]) / size,
      bin,
      scratch.coherentGain,
    );
  }
  return {
    timeDomainData: output,
    fftLinearAmplitudes: scratch.fftLinearAmplitudes,
    // Diagnostic quadratic-correction share before lossless normalization.
    generatedEnergyFraction:
      inputEnergy > 0 ? correctionEnergy / (inputEnergy + correctionEnergy) : 0,
  };
}

/**
 * First-order, lossless finite-amplitude propagation for the virtual water
 * cavity. A periodic, band-limited reconstruction of the captured aperture
 * supplies one dealiased waveform; its measured spectrum describes that same
 * waveform. Mean-square amplitude is preserved in the represented band.
 * Source evidence is not mutated. This is a finite-aperture approximation.
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

  const hasWaveformSignal =
    timeDomainData instanceof Float32Array &&
    timeDomainData.some((sample) => Number.isFinite(sample) && sample !== 0);
  if (!hasWaveformSignal) {
    // Magnitudes alone cannot recover phase-dependent nonlinear products.
    // An absent/empty/silent time buffer can accompany spectral-only evidence.
    // Preserve that linear fallback instead of manufacturing a second signal.
    return {
      ...apparatus,
      timeDomainData,
      fftLinearAmplitudes,
      generatedEnergyFraction: 0,
      fullScaleCharacteristicDistortion,
    };
  }
  return {
    ...apparatus,
    ...projectSignal({
      input: timeDomainData,
      sampleRate,
      propagationTimeScaleSeconds: apparatus.propagationTimeScaleSeconds,
      scratch,
    }),
    fullScaleCharacteristicDistortion,
  };
}
