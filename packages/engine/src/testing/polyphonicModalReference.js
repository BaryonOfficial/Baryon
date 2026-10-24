/**
 * Independent, steady-state reference for the declared linear modal apparatus.
 *
 * This module intentionally imports no production numerical helpers. Frequencies
 * are Hz; coefficients are normalized pressure amplitudes. The field is on the
 * centered [-1, 1]^3 Neumann domain. Different frequencies are long-time averaged,
 * while contributions at exactly the same frequency are summed before squaring.
 * It does not model transients, source estimation, cache filtering, or particles.
 *
 * G = (1/Q) / (1 - r^2 + i*r/Q), r = driveHz / naturalHz.
 * This is the resonant-normalized forced oscillator, not an absolute-force
 * calibration. See MIT 8.03, Forced Oscillation and Resonance, chapter 2.
 */
export function referenceModalTransfer(naturalHz, qualityFactor, driveHz) {
  const ratio = driveHz / naturalHz;
  const realDenominator = 1 - ratio * ratio;
  const imaginaryDenominator = ratio / qualityFactor;
  const denominator =
    qualityFactor *
    (realDenominator * realDenominator +
      imaginaryDenominator * imaginaryDenominator);
  return {
    real: realDenominator / denominator,
    imaginary: -imaginaryDenominator / denominator,
  };
}

export function normalizeReferenceCoefficients(terms) {
  const norm = Math.sqrt(
    terms.reduce(
      (sum, term) => sum + term.coefficientRe ** 2 + term.coefficientIm ** 2,
      0,
    ),
  );
  return terms.map((term) => ({
    ...term,
    coefficientRe: norm > 0 ? term.coefficientRe / norm : 0,
    coefficientIm: norm > 0 ? term.coefficientIm / norm : 0,
  }));
}

/**
 * The input fixture supplies distinct resolved tone frequencies. Energy shares
 * use squared sinusoidal amplitudes; the common 1/2 mean-square factor cancels.
 * Spatial source weights and energy coupling are declared apparatus inputs.
 */
export function referenceSteadyModalResponse(modes, tones) {
  const inputEnergy = tones.reduce((sum, tone) => sum + tone.amplitude ** 2, 0);
  const responseEnergyByMode = [];
  const terms = [];
  for (const mode of modes) {
    let responseEnergy = 0;
    for (const tone of tones) {
      const transfer = referenceModalTransfer(
        mode.naturalFrequencyHz,
        mode.qualityFactor,
        tone.frequencyHz,
      );
      const share = inputEnergy > 0 ? tone.amplitude ** 2 / inputEnergy : 0;
      responseEnergy += share * (transfer.real ** 2 + transfer.imaginary ** 2);
      const amplitude =
        Math.sqrt(share * mode.sourceCouplingEnergy) *
        mode.sourceProjectionWeight;
      const phase = tone.phaseRad ?? 0;
      terms.push({
        ...mode,
        responseFrequencyHz: tone.frequencyHz,
        coefficientRe:
          amplitude *
          (transfer.real * Math.cos(phase) -
            transfer.imaginary * Math.sin(phase)),
        coefficientIm:
          amplitude *
          (transfer.real * Math.sin(phase) +
            transfer.imaginary * Math.cos(phase)),
      });
    }
    responseEnergyByMode.push(responseEnergy);
  }
  return {
    responseEnergyByMode,
    terms: normalizeReferenceCoefficients(terms),
  };
}

function permutations([a, b, c]) {
  return Array.from(
    new Map(
      [
        [a, b, c],
        [a, c, b],
        [b, a, c],
        [b, c, a],
        [c, a, b],
        [c, b, a],
      ].map((indices) => [indices.join(":"), indices]),
    ).values(),
  );
}

function referenceFamily(mode, position) {
  const family = permutations([mode.u, mode.v, mode.w]);
  let value = 0;
  const gradient = [0, 0, 0];
  const hessian = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const indices of family) {
    const basis = indices.map((index, axis) => {
      const k = (Math.PI * index) / 2;
      const scale = index === 0 ? 1 : Math.SQRT2;
      const phase = k * (position[axis] + 1);
      return [
        scale * Math.cos(phase),
        -scale * k * Math.sin(phase),
        -scale * k * k * Math.cos(phase),
      ];
    });
    const product = (derivativeOrders) =>
      basis.reduce(
        (result, axis, index) => result * axis[derivativeOrders[index]],
        1 / Math.sqrt(family.length),
      );
    value += product([0, 0, 0]);
    for (let a = 0; a < 3; a += 1) {
      const first = [0, 0, 0];
      first[a] += 1;
      gradient[a] += product(first);
      for (let b = 0; b < 3; b += 1) {
        const second = [...first];
        second[b] += 1;
        hessian[a][b] += product(second);
      }
    }
  }
  return { value, gradient, hessian };
}

/**
 * Independent pressure/velocity sum and exact spatial derivative.
 * The common velocity quadrature -i disappears when forming squared magnitudes.
 * Material weights are input parameters so the comparison uses one apparatus.
 */
export function referenceRadiationPotential(terms, position, contrast) {
  const groups = new Map();
  for (const term of terms) {
    const frequency = term.responseFrequencyHz;
    if (!groups.has(frequency)) groups.set(frequency, []);
    groups.get(frequency).push(term);
  }
  let pressureEnergy = 0;
  let velocityEnergy = 0;
  const pressureGradient = [0, 0, 0];
  const velocityGradient = [0, 0, 0];
  for (const group of groups.values()) {
    for (const quadrature of ["coefficientRe", "coefficientIm"]) {
      let pressure = 0;
      const dp = [0, 0, 0];
      const velocity = [0, 0, 0];
      const dv = Array.from({ length: 3 }, () => [0, 0, 0]);
      for (const mode of group) {
        const basis = referenceFamily(mode, position);
        const coefficient = mode[quadrature];
        const wavenumber =
          ((Math.PI * Math.hypot(mode.u, mode.v, mode.w)) / 2) *
          (mode.responseFrequencyHz / mode.naturalFrequencyHz);
        pressure += coefficient * basis.value;
        for (let a = 0; a < 3; a += 1) {
          dp[a] += coefficient * basis.gradient[a];
          velocity[a] += (coefficient * basis.gradient[a]) / wavenumber;
          for (let b = 0; b < 3; b += 1) {
            dv[a][b] += (coefficient * basis.hessian[a][b]) / wavenumber;
          }
        }
      }
      pressureEnergy += pressure * pressure;
      velocityEnergy += velocity.reduce((sum, value) => sum + value * value, 0);
      for (let a = 0; a < 3; a += 1) {
        pressureGradient[a] += 2 * pressure * dp[a];
        velocityGradient[a] +=
          2 * velocity.reduce((sum, value, b) => sum + value * dv[b][a], 0);
      }
    }
  }
  return {
    pressureEnergy,
    velocityEnergy,
    radiationPotential:
      contrast.pressureEnergyWeight * pressureEnergy -
      contrast.velocityEnergyWeight * velocityEnergy,
    gradient: pressureGradient.map(
      (value, axis) =>
        contrast.pressureEnergyWeight * value -
        contrast.velocityEnergyWeight * velocityGradient[axis],
    ),
  };
}
