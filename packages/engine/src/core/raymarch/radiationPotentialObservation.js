import { If, Loop, float, int, max, vec2, vec3, vec4 } from "three/tsl";
import { evaluatePermutationFamilyMode } from "../modeFamily.js";
import { evaluatePermutationFamilyFieldGradientFromBasisLookupNode } from "../modeFamilyNode.js";
import {
  getModalResponseFrequencyKey,
  MODAL_RESPONSE_WAVENUMBER_SQUARED_EPSILON,
  resolveModalResponseWavenumber,
} from "../modalShell.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST } from "./fieldObservation.js";
import { RAYMARCH_OPTICAL_FIELD_REPRESENTATION } from "./quantityLedger.js";

const NORMALIZED_WAVENUMBER_SCALE_SQUARED = (Math.PI * Math.PI) / 4;
export const SPECTRAL_MOMENT_SUPPORT_EPSILON = 2 ** -16;

function readFiniteComponent(values, index) {
  return Number.isFinite(values?.[index]) ? values[index] : 0;
}

/** CPU reference for q=S^2 additive circular evidence. */
export function accumulateSpectralMomentEvidence(samples = []) {
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

/** Linear aperture reference: filter additive values before normalization. */
export function filterAdditiveSpectralMomentEvidence(samples = []) {
  const filtered = { firstMoment: [0, 0], secondMoment: [0, 0], support: 0 };
  let totalWeight = 0;
  for (const sample of samples) {
    const weight = Math.max(
      0,
      Number.isFinite(sample?.weight) ? sample.weight : 0,
    );
    filtered.firstMoment[0] +=
      readFiniteComponent(sample?.firstMoment, 0) * weight;
    filtered.firstMoment[1] +=
      readFiniteComponent(sample?.firstMoment, 1) * weight;
    filtered.secondMoment[0] +=
      readFiniteComponent(sample?.secondMoment, 0) * weight;
    filtered.secondMoment[1] +=
      readFiniteComponent(sample?.secondMoment, 1) * weight;
    filtered.support +=
      Math.max(0, Number.isFinite(sample?.support) ? sample.support : 0) *
      weight;
    totalWeight += weight;
  }
  if (!(totalWeight > 0)) return filtered;
  filtered.firstMoment = filtered.firstMoment.map(
    (value) => value / totalWeight,
  );
  filtered.secondMoment = filtered.secondMoment.map(
    (value) => value / totalWeight,
  );
  filtered.support /= totalWeight;
  return filtered;
}

function normalizeSpectralMoment(moment, denominator) {
  const ratio = [
    readFiniteComponent(moment, 0) / denominator,
    readFiniteComponent(moment, 1) / denominator,
  ];
  const radius = Math.hypot(...ratio);
  const radialScale = 1 / Math.max(1, radius);
  return ratio.map((value) => value * radialScale);
}

/** Float32-resolve reference for bounded m1, m2, and compressed presence. */
export function resolveSpectralMomentEvidence({
  firstMoment = [0, 0],
  secondMoment = [0, 0],
  support = 0,
  epsilon = SPECTRAL_MOMENT_SUPPORT_EPSILON,
} = {}) {
  const finiteSupport = Math.max(0, Number.isFinite(support) ? support : 0);
  const finiteEpsilon =
    Number.isFinite(epsilon) && epsilon > 0
      ? epsilon
      : SPECTRAL_MOMENT_SUPPORT_EPSILON;
  const denominator = Math.max(finiteSupport, finiteEpsilon);
  return {
    firstMoment: normalizeSpectralMoment(firstMoment, denominator),
    secondMoment: normalizeSpectralMoment(secondMoment, denominator),
    presence: Math.min(1, finiteSupport / (finiteSupport + finiteEpsilon)),
  };
}

export const WATER_CYMATIC_APPARATUS = Object.freeze({
  semantic: "cycle-averaged-gorkov-tracer-cymascope",
  sourceTopology: "centered-zero-mean-finite-volume-drive",
  acousticMedium: "water",
  tracer: "subwavelength-alpha-quartz-spheres",
  transportApproximation:
    "cycle-averaged-modal-radiation-potential-normal-confinement-manifolds",
  coherence:
    "complex-coherent-at-equal-response-frequency-ensemble-averaged-between-distinct-response-frequencies",
  detectorExposure: "separate-bandlimited-pressure-energy-drive",
  opticalDomain: "sealed-rigid-cubical-acoustic-cavity",
  representation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  presentation:
    "camera-ordered-beer-lambert-integration-of-persistent-u0-plasma",
});

/**
 * CPU reference for the normalized Gor'kov potential and its exact gradient.
 *
 * Coefficients are complex pressure amplitudes. Every natural eigenvalue shell
 * driven at the same physical response frequency belongs to one harmonic
 * field. Pressure and acoustic velocity are squared only after that complete
 * coherent sum; unequal response frequencies add as long-time/ensemble
 * averaged energies.
 */
export function evaluateWaterRadiationPotentialSample({
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

/**
 * Evaluate the cycle-averaged normalized Gor'kov potential from the live modal
 * energy packet. This runs once per cache voxel, not per ray sample.
 */
export function evaluateAnalyticWaterRadiationPotentialNode({
  voxelIndex,
  basisLookup,
  modalFieldModeUniforms,
  modalFieldCoefficientUniforms,
  modalFieldResponseUniforms = null,
  modalFieldSpectralMomentUniforms = null,
  modalFieldActiveCount,
  boundaryMode,
}) {
  const normalizedScale = float(Math.PI);
  const pressureWeight = float(
    RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.pressureEnergyWeight,
  );
  const velocityWeight = float(
    RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.velocityEnergyWeight,
  );
  const pressureEnergy = float(0).toVar();
  const velocityEnergy = float(0).toVar();
  const shellPressureRe = float(0).toVar();
  const shellPressureIm = float(0).toVar();
  const shellVelocityRe = vec3(0).toVar();
  const shellVelocityIm = vec3(0).toVar();
  const spectralFirstMoment = vec2(0).toVar();
  const spectralSecondMoment = vec2(0).toVar();
  const spectralSupport = float(0).toVar();

  Loop(
    {
      start: int(0),
      end: int(modalFieldActiveCount),
      type: "int",
      condition: "<",
    },
    ({ i }) => {
      const mode = modalFieldModeUniforms.element(i);
      const packet = modalFieldCoefficientUniforms.element(i);
      const response = modalFieldResponseUniforms
        ? modalFieldResponseUniforms.element(i)
        : vec4(1, 1, 0, 0);
      const family = evaluatePermutationFamilyFieldGradientFromBasisLookupNode({
        u: mode.x,
        v: mode.y,
        w: mode.z,
        voxelIndex,
        scale: normalizedScale,
        boundaryMode,
        basisLookup,
        familyScalars: {
          familyScale: packet.y,
          threeTermUVMask: packet.z,
          threeTermVWMask: packet.w,
        },
      });
      const inverseResponseWavenumber = modalFieldResponseUniforms
        ? response.w
        : float(1).div(
            max(
              max(
                mode.x
                  .mul(mode.x)
                  .add(mode.y.mul(mode.y))
                  .add(mode.z.mul(mode.z))
                  .mul(float(NORMALIZED_WAVENUMBER_SCALE_SQUARED)),
                float(MODAL_RESPONSE_WAVENUMBER_SQUARED_EPSILON),
              )
                .sqrt()
                .mul(max(response.x, float(1e-6))),
              float(Math.sqrt(MODAL_RESPONSE_WAVENUMBER_SQUARED_EPSILON)),
            ),
          );
      shellPressureRe.addAssign(family.field.mul(packet.x));
      shellPressureIm.addAssign(family.field.mul(response.z));
      shellVelocityRe.addAssign(
        family.gradient.mul(packet.x).mul(inverseResponseWavenumber),
      );
      shellVelocityIm.addAssign(
        family.gradient.mul(response.z).mul(inverseResponseWavenumber),
      );

      const shellEnds = response.y
        .greaterThanEqual(0.5)
        .or(i.add(1).greaterThanEqual(modalFieldActiveCount));
      If(shellEnds, () => {
        const shellPressureEnergy = shellPressureRe
          .mul(shellPressureRe)
          .add(shellPressureIm.mul(shellPressureIm));
        const shellVelocityEnergy = shellVelocityRe.x
          .mul(shellVelocityRe.x)
          .add(shellVelocityRe.y.mul(shellVelocityRe.y))
          .add(shellVelocityRe.z.mul(shellVelocityRe.z))
          .add(shellVelocityIm.x.mul(shellVelocityIm.x))
          .add(shellVelocityIm.y.mul(shellVelocityIm.y))
          .add(shellVelocityIm.z.mul(shellVelocityIm.z));
        pressureEnergy.addAssign(shellPressureEnergy);
        velocityEnergy.addAssign(shellVelocityEnergy);
        if (modalFieldSpectralMomentUniforms) {
          // Every member of one source-projected shell has one response
          // frequency and therefore one spectral owner. Different-frequency
          // shells remain nonnegative cycle-averaged contributors. Squaring
          // the already-formed local support is an artistic chroma-preserving
          // projection. It preserves the established local shell emphasis but
          // carries additive circular evidence instead of premixed RGB. It
          // never feeds signed potential, admission, or acoustic normalization.
          const support = shellPressureEnergy
            .mul(pressureWeight)
            .add(shellVelocityEnergy.mul(velocityWeight));
          const spectralWeight = support.mul(support);
          const spectralBasis = modalFieldSpectralMomentUniforms.element(i);
          spectralFirstMoment.addAssign(spectralBasis.xy.mul(spectralWeight));
          spectralSecondMoment.addAssign(spectralBasis.zw.mul(spectralWeight));
          spectralSupport.addAssign(spectralWeight);
        }
        shellPressureRe.assign(float(0));
        shellPressureIm.assign(float(0));
        shellVelocityRe.assign(vec3(0));
        shellVelocityIm.assign(vec3(0));
      });
    },
  );

  return {
    radiationPotential: pressureEnergy
      .mul(pressureWeight)
      .sub(velocityEnergy.mul(velocityWeight)),
    pressureEnergy,
    velocityEnergy,
    totalEnergy: pressureEnergy.add(velocityEnergy),
    spectralFirstMoment: modalFieldSpectralMomentUniforms
      ? spectralFirstMoment
      : null,
    spectralSecondMoment: modalFieldSpectralMomentUniforms
      ? spectralSecondMoment
      : null,
    spectralSupport: modalFieldSpectralMomentUniforms ? spectralSupport : null,
  };
}

// Water radiation potential owner end.
