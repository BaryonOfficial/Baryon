// Independent steady harmonic/ensemble comparator; never a production field owner.
import { evaluatePermutationFamilyMode } from "../core/modeFamily.js";
import {
  getModalResponseFrequencyKey,
  resolveModalResponseWavenumber,
} from "../core/modalShell.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST } from "../core/raymarch/fieldObservation.js";

function readFiniteComponent(values, index) {
  return Number.isFinite(values?.[index]) ? values[index] : 0;
}

/** CPU reference for q=S^2 additive circular evidence. */
function accumulateSpectralMomentEvidence(samples = []) {
  const firstMoment = [0, 0];
  const secondMoment = [0, 0];
  let support = 0;
  for (const sample of samples) {
    const shellSupport = Math.max(
      0,
      Number.isFinite(sample?.support) ? sample.support : 0,
    );
    const weight = shellSupport * shellSupport;
    firstMoment[0] += readFiniteComponent(sample?.basis, 0) * weight;
    firstMoment[1] += readFiniteComponent(sample?.basis, 1) * weight;
    secondMoment[0] += readFiniteComponent(sample?.basis, 2) * weight;
    secondMoment[1] += readFiniteComponent(sample?.basis, 3) * weight;
    support += weight;
  }
  return { firstMoment, secondMoment, support };
}

/**
 * CPU reference for the normalized Gor'kov potential and its exact gradient.
 *
 * Coefficients are complex pressure amplitudes. Every natural eigenvalue shell
 * driven at the same physical response frequency belongs to one harmonic
 * field. Pressure and acoustic velocity are squared only after that complete
 * coherent sum; unequal response frequencies add as long-time/ensemble
 * averaged energies.
 */
export function evaluateHarmonicRadiationReference({
  modes = [],
  x = 0,
  y = 0,
  z = 0,
  scale = Math.PI,
  boundaryMode = "neumann",
  radiationMaterialContrast = RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST,
} = {}) {
  const pressureWeight = Math.max(
    0,
    radiationMaterialContrast?.pressureEnergyWeight ?? 0,
  );
  const velocityWeight = Math.max(
    0,
    radiationMaterialContrast?.velocityEnergyWeight ?? 0,
  );
  let pressureEnergy = 0;
  let velocityEnergy = 0;
  const pressureEnergyGradient = [0, 0, 0];
  const velocityEnergyGradient = [0, 0, 0];
  const spectralShellEvidence = [];
  const shells = new Map();

  for (const mode of modes) {
    const coefficientRe = Number.isFinite(mode?.coefficientRe)
      ? mode.coefficientRe
      : Number.isFinite(mode?.coefficient)
        ? mode.coefficient
        : 0;
    const coefficientIm = Number.isFinite(mode?.coefficientIm)
      ? mode.coefficientIm
      : 0;
    if (!(Math.hypot(coefficientRe, coefficientIm) > 0)) {
      continue;
    }
    const family = evaluatePermutationFamilyMode({
      u: mode.u,
      v: mode.v,
      w: mode.w,
      x,
      y,
      z,
      scale,
      boundaryMode,
    });
    const responseWavenumber = resolveModalResponseWavenumber({ mode, scale });
    const gradient = [family.gradX, family.gradY, family.gradZ];
    const shellKey = getModalResponseFrequencyKey(mode);
    const shell = shells.get(shellKey) ?? {
      pressureRe: 0,
      pressureIm: 0,
      pressureGradientRe: [0, 0, 0],
      pressureGradientIm: [0, 0, 0],
      velocityRe: [0, 0, 0],
      velocityIm: [0, 0, 0],
      velocityJacobianRe: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      velocityJacobianIm: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      spectralMoment: [0, 0, 0, 0],
    };
    shell.pressureRe += coefficientRe * family.field;
    shell.pressureIm += coefficientIm * family.field;
    for (let axis = 0; axis < 3; axis += 1) {
      shell.pressureGradientRe[axis] += coefficientRe * gradient[axis];
      shell.pressureGradientIm[axis] += coefficientIm * gradient[axis];
      shell.velocityRe[axis] +=
        (coefficientRe * gradient[axis]) / responseWavenumber;
      shell.velocityIm[axis] +=
        (coefficientIm * gradient[axis]) / responseWavenumber;
    }
    const hessian = [
      [family.hessianXX, family.hessianXY, family.hessianXZ],
      [family.hessianXY, family.hessianYY, family.hessianYZ],
      [family.hessianXZ, family.hessianYZ, family.hessianZZ],
    ];
    for (let velocityAxis = 0; velocityAxis < 3; velocityAxis += 1) {
      for (let derivativeAxis = 0; derivativeAxis < 3; derivativeAxis += 1) {
        shell.velocityJacobianRe[velocityAxis][derivativeAxis] +=
          (coefficientRe * hessian[velocityAxis][derivativeAxis]) /
          responseWavenumber;
        shell.velocityJacobianIm[velocityAxis][derivativeAxis] +=
          (coefficientIm * hessian[velocityAxis][derivativeAxis]) /
          responseWavenumber;
      }
    }
    const spectralMoment =
      mode?.spectralMoment ?? mode?.material?.spectralMoment;
    if (spectralMoment?.length >= 4) {
      for (let component = 0; component < 4; component += 1) {
        shell.spectralMoment[component] = Number.isFinite(
          spectralMoment[component],
        )
          ? spectralMoment[component]
          : 0;
      }
    }
    shells.set(shellKey, shell);
  }

  for (const shell of shells.values()) {
    const shellPressureEnergy =
      shell.pressureRe * shell.pressureRe + shell.pressureIm * shell.pressureIm;
    let shellVelocityEnergy = 0;
    pressureEnergy += shellPressureEnergy;
    for (let velocityAxis = 0; velocityAxis < 3; velocityAxis += 1) {
      shellVelocityEnergy +=
        shell.velocityRe[velocityAxis] * shell.velocityRe[velocityAxis] +
        shell.velocityIm[velocityAxis] * shell.velocityIm[velocityAxis];
    }
    velocityEnergy += shellVelocityEnergy;
    const shellSupport =
      pressureWeight * shellPressureEnergy +
      velocityWeight * shellVelocityEnergy;
    spectralShellEvidence.push({
      support: shellSupport,
      basis: shell.spectralMoment,
    });
    for (let axis = 0; axis < 3; axis += 1) {
      pressureEnergyGradient[axis] +=
        2 *
        (shell.pressureRe * shell.pressureGradientRe[axis] +
          shell.pressureIm * shell.pressureGradientIm[axis]);
      for (let velocityAxis = 0; velocityAxis < 3; velocityAxis += 1) {
        velocityEnergyGradient[axis] +=
          2 *
          (shell.velocityRe[velocityAxis] *
            shell.velocityJacobianRe[velocityAxis][axis] +
            shell.velocityIm[velocityAxis] *
              shell.velocityJacobianIm[velocityAxis][axis]);
      }
    }
  }

  const radiationPotential =
    pressureWeight * pressureEnergy - velocityWeight * velocityEnergy;
  const gradient = pressureEnergyGradient.map(
    (component, axis) =>
      pressureWeight * component -
      velocityWeight * velocityEnergyGradient[axis],
  );
  const totalEnergy = pressureEnergy + velocityEnergy;
  const spectralEvidence = accumulateSpectralMomentEvidence(
    spectralShellEvidence,
  );

  return {
    pressureEnergy,
    velocityEnergy,
    totalEnergy,
    radiationPotential,
    gradient,
    pressureEnergyGradient,
    velocityEnergyGradient,
    spectralFirstMoment: spectralEvidence.firstMoment,
    spectralSecondMoment: spectralEvidence.secondMoment,
    spectralSupport: spectralEvidence.support,
  };
}
