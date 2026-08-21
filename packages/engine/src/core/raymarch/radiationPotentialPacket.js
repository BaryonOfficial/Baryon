import { deriveModeFamilyEvaluationScalars } from "../modeFamily.js";

export const RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE = 4;

// Fixed detector-exposure knee for cache-passband modal energy. This
// controls only the common laser excitation drive; normalized spatial energy
// fractions below remain invariant to input gain.
export const RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY = 5e-4;

const PACKET_ENERGY_EPSILON = 1e-12;

export function prepareRadiationPotentialStaticPacket(
  { target, modeSlots, boundaryMode, activeCount } = /** @type {any} */ ({}),
) {
  target?.fill?.(0);
  const capacity = Math.floor(
    (target?.length ?? 0) / RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
  );
  const count = Math.min(
    capacity,
    Math.max(0, Math.floor(activeCount ?? capacity)),
  );
  for (let modeIndex = 0; modeIndex < count; modeIndex += 1) {
    const offset = modeIndex * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE;
    const scalars = deriveModeFamilyEvaluationScalars(
      modeSlots?.[offset] ?? 0,
      modeSlots?.[offset + 1] ?? 0,
      modeSlots?.[offset + 2] ?? 0,
      boundaryMode,
    );
    target[offset + 1] = Math.fround(scalars.familyScale);
    target[offset + 2] = scalars.threeTermUVMask;
    target[offset + 3] = scalars.threeTermVWMask;
  }
  return count;
}

export function writeRadiationPotentialDriveFrame(
  {
    target,
    imaginaryTarget,
    imaginaryComponentOffset = 0,
    amplitudes,
    phases,
    activeCount,
  } = /** @type {any} */ ({}),
) {
  const capacity = Math.floor(
    (target?.length ?? 0) / RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
  );
  const sourceCount = amplitudes?.length ?? 0;
  const count = Math.min(
    capacity,
    sourceCount,
    Math.max(0, Math.floor(activeCount ?? sourceCount)),
  );

  let observedCoefficientEnergy = 0;
  for (let modeIndex = 0; modeIndex < count; modeIndex += 1) {
    const amplitude = Number.isFinite(amplitudes?.[modeIndex])
      ? amplitudes[modeIndex]
      : 0;
    observedCoefficientEnergy += amplitude * amplitude;
  }
  const observedCoefficientNorm = Math.sqrt(observedCoefficientEnergy);
  const inverseEnergyNorm =
    observedCoefficientNorm > PACKET_ENERGY_EPSILON
      ? 1 / observedCoefficientNorm
      : 0;

  let changed = false;
  let normalizedEnergySum = 0;
  for (let modeIndex = 0; modeIndex < capacity; modeIndex += 1) {
    const offset = modeIndex * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE;
    let nextReal = 0;
    let nextImaginary = 0;
    if (modeIndex < count) {
      const amplitude = Number.isFinite(amplitudes?.[modeIndex])
        ? amplitudes[modeIndex]
        : 0;
      const normalizedAmplitude = amplitude * inverseEnergyNorm;
      const phaseRad = Number.isFinite(phases?.[modeIndex])
        ? phases[modeIndex]
        : 0;
      nextReal = Math.fround(normalizedAmplitude * Math.cos(phaseRad));
      nextImaginary = Math.fround(normalizedAmplitude * Math.sin(phaseRad));
      normalizedEnergySum += normalizedAmplitude * normalizedAmplitude;
    }
    if (target[offset] !== nextReal) {
      target[offset] = nextReal;
      changed = true;
    }
    if (imaginaryTarget) {
      const imaginaryOffset = offset + imaginaryComponentOffset;
      if (imaginaryTarget[imaginaryOffset] !== nextImaginary) {
        imaginaryTarget[imaginaryOffset] = nextImaginary;
        changed = true;
      }
    }
  }

  const exposureDrive =
    observedCoefficientEnergy > PACKET_ENERGY_EPSILON
      ? Math.sqrt(
          observedCoefficientEnergy /
            (observedCoefficientEnergy +
              RADIATION_POTENTIAL_EXPOSURE_REFERENCE_ENERGY),
        )
      : 0;

  return {
    activeCount: count,
    observedCoefficientEnergy,
    observedCoefficientNorm,
    normalizedEnergySum,
    exposureDrive,
    analyticPotentialEvaluationCountPerSample: count,
    changed,
  };
}

/**
 * Pack normalized source-projected family amplitudes for the cycle-averaged
 * water radiation-potential evaluator.
 *
 * The x lane is the real quadrature of one normalized family coefficient.
 * `imaginaryTarget` receives its imaginary quadrature. Every natural shell
 * driven at one response frequency is then summed as one complex harmonic
 * field before squaring; unequal response frequencies add as long-time
 * cycle-averaged energies. A phase rotation changes neither coefficient
 * energy nor exposure.
 *
 * Lanes y/z/w carry the position-invariant permutation-family scalars.
 *
 * @param {{
 *   target?: Float32Array,
 *   imaginaryTarget?: Float32Array,
 *   imaginaryComponentOffset?: number,
 *   amplitudes?: ArrayLike<number>,
 *   phases?: ArrayLike<number>,
 *   modeSlots?: ArrayLike<number>,
 *   boundaryMode?: string,
 *   activeCount?: number,
 * }} options
 */
export function writeRadiationPotentialPacket(
  {
    target,
    imaginaryTarget,
    imaginaryComponentOffset = 0,
    amplitudes,
    phases,
    modeSlots,
    boundaryMode,
    activeCount,
  } = /** @type {any} */ ({}),
) {
  if (imaginaryTarget) {
    const capacity = Math.floor(
      (target?.length ?? 0) / RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE,
    );
    for (let modeIndex = 0; modeIndex < capacity; modeIndex += 1) {
      imaginaryTarget[
        modeIndex * RADIATION_POTENTIAL_PACKET_COMPONENTS_PER_MODE +
          imaginaryComponentOffset
      ] = 0;
    }
  }
  prepareRadiationPotentialStaticPacket({
    target,
    modeSlots,
    boundaryMode,
    activeCount,
  });
  const frame = writeRadiationPotentialDriveFrame({
    target,
    imaginaryTarget,
    imaginaryComponentOffset,
    amplitudes,
    phases,
    activeCount,
  });
  return {
    activeCount: frame.activeCount,
    observedCoefficientEnergy: frame.observedCoefficientEnergy,
    observedCoefficientNorm: frame.observedCoefficientNorm,
    normalizedEnergySum: frame.normalizedEnergySum,
    exposureDrive: frame.exposureDrive,
    analyticPotentialEvaluationCountPerSample:
      frame.analyticPotentialEvaluationCountPerSample,
  };
}
