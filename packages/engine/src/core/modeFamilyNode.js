import {
  abs,
  cos,
  float,
  fract,
  int,
  ivec2,
  max,
  mix,
  sin,
  smoothstep,
  sqrt,
  textureLoad,
  vec3,
} from "three/tsl";
import {
  BOUNDARY_MODES,
  PERMUTATION_ORDERS,
  normalizeBoundaryMode,
} from "./modeFamily.js";

const FAMILY_EPSILON = 1e-4;

function createIntegerModeParityNode(index) {
  // Canonical mode indices are nonnegative integers. fract(n/2) is therefore
  // 0 for even n and 0.5 for odd n, yielding cos(nπ) without a transcendental.
  return float(1).sub(fract(index.mul(float(0.5))).mul(float(4)));
}

function createDirichletBasisEnergyNormalizationNode() {
  return float(Math.SQRT2);
}

function createNeumannBasisEnergyNormalizationNode(index) {
  const nonzeroIndex = smoothstep(
    float(0.0),
    float(FAMILY_EPSILON),
    abs(index),
  );
  return float(1.0).add(nonzeroIndex.mul(float(Math.SQRT2 - 1.0)));
}

/**
 * Phase of axis mode `index` at centered cavity coordinate `q ∈ [-1, 1]`.
 *
 * The cavity spans the full coordinate range, so a mode carrying `index`
 * half-wavelengths across it has half-angular scale `index·scale/2` and a
 * `index·π/2` offset that puts the negative wall at phase zero and the
 * positive wall at `index·π`. Both boundary families share this argument:
 * Dirichlet takes its sine (zero at both walls), Neumann its cosine (zero
 * slope at both walls). Keeping one argument is what keeps the two families
 * on the same wavenumber, and therefore on the same
 * `f = c|n| / (2L)` atlas mapping.
 */
function createCenteredCavityArgumentNode(index, coordinate, scale) {
  return index.mul(coordinate.mul(scale).add(float(Math.PI)).mul(float(0.5)));
}

function createDirichletBasisValueNode(index, coordinate, scale) {
  return sin(createCenteredCavityArgumentNode(index, coordinate, scale)).mul(
    createDirichletBasisEnergyNormalizationNode(),
  );
}

function createDirichletBasisNode(index, coordinate, scale) {
  const angularScale = index.mul(scale);
  const centeredAngularScale = angularScale.mul(float(0.5));
  const centeredArgument = createCenteredCavityArgumentNode(
    index,
    coordinate,
    scale,
  );
  const energyNormalization = createDirichletBasisEnergyNormalizationNode();

  return {
    value: sin(centeredArgument).mul(energyNormalization),
    derivative: cos(centeredArgument)
      .mul(centeredAngularScale)
      .mul(energyNormalization),
    secondDerivative: sin(centeredArgument)
      .mul(centeredAngularScale.mul(centeredAngularScale))
      .mul(energyNormalization)
      .negate(),
    secondDerivativeScale: centeredAngularScale
      .mul(centeredAngularScale)
      .negate(),
  };
}

function createNeumannBasisValueNode(index, coordinate, scale) {
  return cos(createCenteredCavityArgumentNode(index, coordinate, scale)).mul(
    createNeumannBasisEnergyNormalizationNode(index),
  );
}

function createNeumannBasisNode(index, coordinate, scale) {
  const centeredAngularScale = index.mul(scale).mul(float(0.5));
  const centeredArgument = createCenteredCavityArgumentNode(
    index,
    coordinate,
    scale,
  );
  const energyNormalization = createNeumannBasisEnergyNormalizationNode(index);

  return {
    value: cos(centeredArgument).mul(energyNormalization),
    derivative: sin(centeredArgument)
      .mul(centeredAngularScale)
      .negate()
      .mul(energyNormalization),
    secondDerivative: cos(centeredArgument)
      .mul(centeredAngularScale.mul(centeredAngularScale))
      .mul(energyNormalization)
      .negate(),
    secondDerivativeScale: centeredAngularScale
      .mul(centeredAngularScale)
      .negate(),
  };
}

function createFixedBoundaryBasisNode(
  index,
  coordinate,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  if (normalizedBoundaryMode === BOUNDARY_MODES.dirichlet) {
    return createDirichletBasisNode(index, coordinate, scale);
  }

  return createNeumannBasisNode(index, coordinate, scale);
}

// When the caller supplies a precomputed family scale, the per-axis energy
// normalizations are already folded into it, so the basis is built raw and the
// scale is applied once to the summed family instead of per axis per sample.
function createDirichletBasisVectorNode(
  index,
  coordinates,
  scale,
  { normalizeEnergy = true } = {},
) {
  const angularScale = index.mul(scale);
  const centeredAngularScale = angularScale.mul(float(0.5));
  const centeredArgument = index.mul(
    coordinates.mul(scale).add(float(Math.PI)).mul(float(0.5)),
  );

  if (!normalizeEnergy) {
    return {
      value: sin(centeredArgument).toVar(),
      derivative: cos(centeredArgument).mul(centeredAngularScale).toVar(),
      secondDerivativeScale: centeredAngularScale
        .mul(centeredAngularScale)
        .negate(),
    };
  }

  const energyNormalization = createDirichletBasisEnergyNormalizationNode();

  return {
    value: sin(centeredArgument).mul(energyNormalization).toVar(),
    derivative: cos(centeredArgument)
      .mul(centeredAngularScale)
      .mul(energyNormalization)
      .toVar(),
    secondDerivativeScale: centeredAngularScale
      .mul(centeredAngularScale)
      .negate(),
  };
}

function createNeumannBasisVectorNode(
  index,
  coordinates,
  scale,
  { normalizeEnergy = true } = {},
) {
  const centeredAngularScale = index.mul(scale).mul(float(0.5));
  const centeredArgument = index.mul(
    coordinates.mul(scale).add(float(Math.PI)).mul(float(0.5)),
  );

  if (!normalizeEnergy) {
    return {
      value: cos(centeredArgument).toVar(),
      derivative: sin(centeredArgument)
        .mul(centeredAngularScale)
        .negate()
        .toVar(),
      secondDerivativeScale: centeredAngularScale
        .mul(centeredAngularScale)
        .negate(),
    };
  }

  const energyNormalization = createNeumannBasisEnergyNormalizationNode(index);

  return {
    value: cos(centeredArgument).mul(energyNormalization).toVar(),
    derivative: sin(centeredArgument)
      .mul(centeredAngularScale)
      .negate()
      .mul(energyNormalization)
      .toVar(),
    secondDerivativeScale: centeredAngularScale
      .mul(centeredAngularScale)
      .negate(),
  };
}

function createDirichletPathBasisVectorNode(index, coordinates, scale) {
  const basis = createDirichletBasisVectorNode(index, coordinates, scale);
  const angularScale = index.mul(scale).mul(float(0.5));
  const safeAngularScale = max(abs(angularScale), float(FAMILY_EPSILON));
  const inverseAngularScale = safeAngularScale.reciprocal();
  const inverseAngularScaleSquared =
    inverseAngularScale.mul(inverseAngularScale);
  const negativeDistance = coordinates.add(float(1));
  const positiveDistance = float(1).sub(coordinates);
  const normalization = createDirichletBasisEnergyNormalizationNode();
  const targetSine = basis.value.div(normalization);
  // At q=-1 the centered Dirichlet phase is zero. At q=+1 it is
  // index*π, whose cosine is exactly the integer-mode parity.
  const positiveBoundaryParity = createIntegerModeParityNode(index);

  return {
    ...basis,
    negativePathIntegral: targetSine
      .negate()
      .mul(inverseAngularScaleSquared)
      .add(negativeDistance.mul(inverseAngularScale))
      .mul(normalization),
    positivePathIntegral: targetSine
      .negate()
      .mul(inverseAngularScaleSquared)
      .sub(
        positiveDistance.mul(positiveBoundaryParity).mul(inverseAngularScale),
      )
      .mul(normalization),
  };
}

function createNeumannPathBasisVectorNode(index, coordinates, scale) {
  const basis = createNeumannBasisVectorNode(index, coordinates, scale);
  const centeredAngularScale = index.mul(scale).mul(float(0.5));
  const safeAngularScale = max(
    abs(centeredAngularScale),
    float(FAMILY_EPSILON),
  );
  const inverseAngularScale = safeAngularScale.reciprocal();
  const inverseAngularScaleSquared =
    inverseAngularScale.mul(inverseAngularScale);
  const negativeDistance = coordinates.add(float(1));
  const positiveDistance = float(1).sub(coordinates);
  const normalization = createNeumannBasisEnergyNormalizationNode(index);
  const nonzeroIndex = smoothstep(float(0), float(FAMILY_EPSILON), abs(index));
  const targetCosine = basis.value.div(normalization);
  // Neumann eigenfunctions have zero slope at both cavity faces, so a
  // wall-sourced kernel loses its source-end sine term and collapses to
  // (B_wall - B_target) / b². The two walls no longer agree once the basis
  // carries the centered phase offset: the negative face sits at phase zero
  // (cos = 1) and the positive face at index·π (cos = the integer parity).
  const negativeBoundaryCosine = float(1);
  const positiveBoundaryCosine = createIntegerModeParityNode(index);
  const pathIntegralFor = (boundaryCosine) =>
    boundaryCosine
      .sub(targetCosine)
      .mul(inverseAngularScaleSquared)
      .mul(normalization);

  return {
    ...basis,
    negativePathIntegral: mix(
      negativeDistance.mul(negativeDistance).mul(float(0.5)),
      pathIntegralFor(negativeBoundaryCosine),
      nonzeroIndex,
    ),
    positivePathIntegral: mix(
      positiveDistance.mul(positiveDistance).mul(float(0.5)),
      pathIntegralFor(positiveBoundaryCosine),
      nonzeroIndex,
    ),
  };
}

function createFixedBoundaryPathBasisVectorNode(
  index,
  coordinates,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
) {
  return normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet
    ? createDirichletPathBasisVectorNode(index, coordinates, scale)
    : createNeumannPathBasisVectorNode(index, coordinates, scale);
}

function createPermutationBasisGridFromVectors(basisVectors) {
  return ["x", "y", "z"].map((axis) =>
    basisVectors.map((basis) => ({
      value: basis.value[axis],
      derivative: basis.derivative[axis],
      secondDerivativeScale: basis.secondDerivativeScale,
      negativePathIntegral: basis.negativePathIntegral?.[axis],
      positivePathIntegral: basis.positivePathIntegral?.[axis],
    })),
  );
}

function createPreparedPermutationFamilySignature(familyScalars) {
  return {
    // [1, A, B, A, B, A*B] — the only distinct weights the six ordered
    // permutations can take.
    termWeights: [
      float(1.0),
      familyScalars.threeTermUVMask,
      familyScalars.threeTermVWMask,
      familyScalars.threeTermUVMask,
      familyScalars.threeTermVWMask,
      familyScalars.threeTermUVMask.mul(familyScalars.threeTermVWMask),
    ],
    normalization: familyScalars.familyScale,
    uniquePermutationCount: null,
  };
}

function createFixedBoundaryBasisValueNode(
  index,
  coordinate,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  if (normalizedBoundaryMode === BOUNDARY_MODES.dirichlet) {
    return createDirichletBasisValueNode(index, coordinate, scale);
  }

  return createNeumannBasisValueNode(index, coordinate, scale);
}

function createPermutationTermNode({ basisX, basisY, basisZ }) {
  const field = basisX.value.mul(basisY.value).mul(basisZ.value).toVar();
  return {
    field,
    gradX: basisX.derivative.mul(basisY.value).mul(basisZ.value),
    gradY: basisX.value.mul(basisY.derivative).mul(basisZ.value),
    gradZ: basisX.value.mul(basisY.value).mul(basisZ.derivative),
    hessianXX: field.mul(basisX.secondDerivativeScale),
    hessianYY: field.mul(basisY.secondDerivativeScale),
    hessianZZ: field.mul(basisZ.secondDerivativeScale),
    hessianXY: basisX.derivative.mul(basisY.derivative).mul(basisZ.value),
    hessianXZ: basisX.derivative.mul(basisY.value).mul(basisZ.derivative),
    hessianYZ: basisX.value.mul(basisY.derivative).mul(basisZ.derivative),
  };
}

function createPermutationFieldGradientTermNode({ basisX, basisY, basisZ }) {
  return {
    field: basisX.value.mul(basisY.value).mul(basisZ.value),
    gradX: basisX.derivative.mul(basisY.value).mul(basisZ.value),
    gradY: basisX.value.mul(basisY.derivative).mul(basisZ.value),
    gradZ: basisX.value.mul(basisY.value).mul(basisZ.derivative),
  };
}

function createPermutationTransverseHessianTermNode({
  basisX,
  basisY,
  basisZ,
  propagationAxis,
}) {
  const bases = [basisX, basisY, basisZ];
  const transverseAxes =
    propagationAxis === 0 ? [1, 2] : propagationAxis === 1 ? [0, 2] : [0, 1];
  const firstBasis = bases[transverseAxes[0]];
  const secondBasis = bases[transverseAxes[1]];

  return {
    h11: firstBasis.value
      .mul(firstBasis.secondDerivativeScale)
      .mul(secondBasis.value),
    h22: firstBasis.value
      .mul(secondBasis.value)
      .mul(secondBasis.secondDerivativeScale),
    h12: firstBasis.derivative.mul(secondBasis.derivative),
  };
}

function createAxisPathIntegratedTensorTarget() {
  return {
    h11: float(0).toVar(),
    h22: float(0).toVar(),
    h12: float(0).toVar(),
  };
}

function createAxisPathIntegratedFamilyTargets() {
  return {
    xNegative: createAxisPathIntegratedTensorTarget(),
    xPositive: createAxisPathIntegratedTensorTarget(),
    yNegative: createAxisPathIntegratedTensorTarget(),
    yPositive: createAxisPathIntegratedTensorTarget(),
    zNegative: createAxisPathIntegratedTensorTarget(),
    zPositive: createAxisPathIntegratedTensorTarget(),
  };
}

function accumulateAxisPathIntegratedTensor(
  target,
  transverseHessian,
  longitudinalIntegral,
  weight,
) {
  const weightedIntegral = longitudinalIntegral.mul(weight);
  target.h11.addAssign(transverseHessian.h11.mul(weightedIntegral));
  target.h22.addAssign(transverseHessian.h22.mul(weightedIntegral));
  target.h12.addAssign(transverseHessian.h12.mul(weightedIntegral));
}

function evaluatePermutationFamilyAxisPathIntegratedHessians({
  basisGrid,
  termWeights,
  normalization,
}) {
  const targets = createAxisPathIntegratedFamilyTargets();
  const axisSpecs = [
    [0, "xNegative", "xPositive"],
    [1, "yNegative", "yPositive"],
    [2, "zNegative", "zPositive"],
  ];

  for (let index = 0; index < PERMUTATION_ORDERS.distinct.length; index += 1) {
    const [xIndex, yIndex, zIndex] = PERMUTATION_ORDERS.distinct[index];
    const basis = {
      basisX: basisGrid[0][xIndex],
      basisY: basisGrid[1][yIndex],
      basisZ: basisGrid[2][zIndex],
    };
    const weight = termWeights[index].mul(normalization);
    const bases = [basis.basisX, basis.basisY, basis.basisZ];
    for (const [
      propagationAxis,
      negativeTargetKey,
      positiveTargetKey,
    ] of axisSpecs) {
      const transverseHessian = createPermutationTransverseHessianTermNode({
        ...basis,
        propagationAxis,
      });
      const longitudinalBasis = bases[propagationAxis];
      accumulateAxisPathIntegratedTensor(
        targets[negativeTargetKey],
        transverseHessian,
        longitudinalBasis.negativePathIntegral,
        weight,
      );
      accumulateAxisPathIntegratedTensor(
        targets[positiveTargetKey],
        transverseHessian,
        longitudinalBasis.positivePathIntegral,
        weight,
      );
    }
  }

  return targets;
}

function createPermutationFieldTermNode({ basisX, basisY, basisZ }) {
  return basisX.mul(basisY).mul(basisZ);
}

/**
 * Build the GPU-side equivalent of {@link getUniquePermutationCount} +
 * {@link getPermutationFamily} as TSL term-weight masks.
 *
 * **Precondition:** the (u, v, w) buffer values must be in canonical order
 * `u ≤ v ≤ w`. The signature only inspects adjacent-pair equalities, so an
 * unsorted triple with `u === w` but `u !== v` would be misclassified as
 * fully distinct (count 6 instead of 3) and produce wrong basis
 * normalization. Mode buffers are populated from canonical descriptors in
 * `modalDescriptor.js`, which preserves the cavity-resolver ordering — the
 * GPU has no cheap sort, so it relies on this upstream guarantee. The
 * CPU-side helpers in `modeFamily.js` canonicalize defensively for any
 * unsorted callers reaching them directly.
 */
function createPermutationFamilySignature({ u, v, w }) {
  const zero = float(0.0);
  const one = float(1.0);
  const neqUV = smoothstep(zero, float(FAMILY_EPSILON), abs(u.sub(v)));
  const neqVW = smoothstep(zero, float(FAMILY_EPSILON), abs(v.sub(w)));
  const twoEqualUV = one.sub(neqUV).mul(neqVW);
  const twoEqualVW = neqUV.mul(one.sub(neqVW));
  const allDistinct = neqUV.mul(neqVW);
  const threeTermUVMask = twoEqualUV.add(allDistinct);
  const threeTermVWMask = twoEqualVW.add(allDistinct);
  const termWeights = [
    one,
    threeTermUVMask,
    threeTermVWMask,
    threeTermUVMask,
    threeTermVWMask,
    allDistinct,
  ];
  const uniquePermutationCount = one
    .add(twoEqualUV.add(twoEqualVW).mul(float(2.0)))
    .add(allDistinct.mul(float(5.0)));
  const normalization = one.div(sqrt(uniquePermutationCount));

  return {
    termWeights,
    uniquePermutationCount,
    normalization,
  };
}

function createPermutationBasisGrid({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  createBasis,
}) {
  return [
    [
      createBasis(u, xCoord, scale),
      createBasis(v, xCoord, scale),
      createBasis(w, xCoord, scale),
    ],
    [
      createBasis(u, yCoord, scale),
      createBasis(v, yCoord, scale),
      createBasis(w, yCoord, scale),
    ],
    [
      createBasis(u, zCoord, scale),
      createBasis(v, zCoord, scale),
      createBasis(w, zCoord, scale),
    ],
  ];
}

function createPermutationFamilyTerms({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  createBasisNode,
}) {
  return {
    ...createPermutationFamilySignature({ u, v, w }),
    basisGrid: createPermutationBasisGrid({
      u,
      v,
      w,
      xCoord,
      yCoord,
      zCoord,
      scale,
      createBasis: createBasisNode,
    }),
  };
}

function createPermutationFamilyValueTerms({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  createBasisValueNode,
}) {
  return {
    ...createPermutationFamilySignature({ u, v, w }),
    basisGrid: createPermutationBasisGrid({
      u,
      v,
      w,
      xCoord,
      yCoord,
      zCoord,
      scale,
      createBasis: createBasisValueNode,
    }),
  };
}

function evaluatePermutationFamilyFromBasisGrid({
  basisGrid,
  termWeights,
  normalization,
  uniquePermutationCount,
}) {
  const fieldSum = float(0.0).toVar();
  const gradXSum = float(0.0).toVar();
  const gradYSum = float(0.0).toVar();
  const gradZSum = float(0.0).toVar();
  const hessianXXSum = float(0.0).toVar();
  const hessianYYSum = float(0.0).toVar();
  const hessianZZSum = float(0.0).toVar();
  const hessianXYSum = float(0.0).toVar();
  const hessianXZSum = float(0.0).toVar();
  const hessianYZSum = float(0.0).toVar();

  for (let i = 0; i < PERMUTATION_ORDERS.distinct.length; i += 1) {
    const [xIndex, yIndex, zIndex] = PERMUTATION_ORDERS.distinct[i];
    const term = createPermutationTermNode({
      basisX: basisGrid[0][xIndex],
      basisY: basisGrid[1][yIndex],
      basisZ: basisGrid[2][zIndex],
    });
    const weight = termWeights[i];
    fieldSum.addAssign(term.field.mul(weight));
    gradXSum.addAssign(term.gradX.mul(weight));
    gradYSum.addAssign(term.gradY.mul(weight));
    gradZSum.addAssign(term.gradZ.mul(weight));
    hessianXXSum.addAssign(term.hessianXX.mul(weight));
    hessianYYSum.addAssign(term.hessianYY.mul(weight));
    hessianZZSum.addAssign(term.hessianZZ.mul(weight));
    hessianXYSum.addAssign(term.hessianXY.mul(weight));
    hessianXZSum.addAssign(term.hessianXZ.mul(weight));
    hessianYZSum.addAssign(term.hessianYZ.mul(weight));
  }

  return {
    field: fieldSum.mul(normalization),
    gradX: gradXSum.mul(normalization),
    gradY: gradYSum.mul(normalization),
    gradZ: gradZSum.mul(normalization),
    hessianXX: hessianXXSum.mul(normalization),
    hessianYY: hessianYYSum.mul(normalization),
    hessianZZ: hessianZZSum.mul(normalization),
    hessianXY: hessianXYSum.mul(normalization),
    hessianXZ: hessianXZSum.mul(normalization),
    hessianYZ: hessianYZSum.mul(normalization),
    permutationCount: uniquePermutationCount,
  };
}

function evaluatePermutationFamilyFieldFromBasisGrid({
  basisGrid,
  termWeights,
  normalization,
  uniquePermutationCount,
}) {
  const fieldSum = float(0.0).toVar();

  for (let i = 0; i < PERMUTATION_ORDERS.distinct.length; i += 1) {
    const [xIndex, yIndex, zIndex] = PERMUTATION_ORDERS.distinct[i];
    const term = createPermutationFieldTermNode({
      basisX: basisGrid[0][xIndex],
      basisY: basisGrid[1][yIndex],
      basisZ: basisGrid[2][zIndex],
    });
    fieldSum.addAssign(term.mul(termWeights[i]));
  }

  return {
    field: fieldSum.mul(normalization),
    permutationCount: uniquePermutationCount,
  };
}

function evaluatePermutationFamilyFieldGradientFromBasisGrid({
  basisGrid,
  termWeights,
  normalization,
  uniquePermutationCount,
}) {
  const fieldSum = float(0.0).toVar();
  const gradientSum = vec3(0.0).toVar();

  for (let i = 0; i < PERMUTATION_ORDERS.distinct.length; i += 1) {
    const [xIndex, yIndex, zIndex] = PERMUTATION_ORDERS.distinct[i];
    const term = createPermutationFieldGradientTermNode({
      basisX: basisGrid[0][xIndex],
      basisY: basisGrid[1][yIndex],
      basisZ: basisGrid[2][zIndex],
    });
    const weight = termWeights[i];
    fieldSum.addAssign(term.field.mul(weight));
    gradientSum.x.addAssign(term.gradX.mul(weight));
    gradientSum.y.addAssign(term.gradY.mul(weight));
    gradientSum.z.addAssign(term.gradZ.mul(weight));
  }

  return {
    field: fieldSum.mul(normalization),
    gradient: gradientSum.mul(normalization),
    gradX: gradientSum.x.mul(normalization),
    gradY: gradientSum.y.mul(normalization),
    gradZ: gradientSum.z.mul(normalization),
    permutationCount: uniquePermutationCount,
  };
}

/**
 * Evaluate one mode's permutation family and its gradient.
 *
 * `familyScalars` carries the position-invariant part of the evaluation —
 * see deriveModeFamilyEvaluationScalars in modeFamily.js. Supplying it skips
 * the per-sample signature derivation (two smoothsteps, a sqrt and a divide)
 * and the three per-axis energy normalizations (a smoothstep each), which are
 * otherwise recomputed for every mode at every volume sample.
 */
export function evaluatePermutationFamilyFieldGradientVectorNodeForBoundary({
  u,
  v,
  w,
  coordinates,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
  familyScalars = null,
}) {
  const basisOptions = familyScalars ? { normalizeEnergy: false } : undefined;
  const basisVectors = [u, v, w].map((index) =>
    normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet
      ? createDirichletBasisVectorNode(index, coordinates, scale, basisOptions)
      : createNeumannBasisVectorNode(index, coordinates, scale, basisOptions),
  );
  const signature = familyScalars
    ? createPreparedPermutationFamilySignature(familyScalars)
    : createPermutationFamilySignature({ u, v, w });

  return evaluatePermutationFamilyFieldGradientFromBasisGrid({
    basisGrid: createPermutationBasisGridFromVectors(basisVectors),
    ...signature,
  });
}

/**
 * Evaluate one cache-grid mode from the precomputed separable basis table.
 *
 * The field-cache bake is the only production caller. Its coordinates are
 * exact voxel indices and its admitted mode orders are exact integers, so
 * textureLoad is the canonical operation on both WebGPU and WebGL2. Float32
 * table entries replace eighteen scalar transcendental evaluations per mode.
 */
export function evaluatePermutationFamilyFieldGradientFromBasisLookupNode({
  u,
  v,
  w,
  voxelIndex,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
  familyScalars,
  basisLookup,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const createBasisVector = (index) => {
    const xBasis = textureLoad(
      basisLookup,
      ivec2(int(voxelIndex.x), int(index)),
    ).toVar();
    const yBasis = textureLoad(
      basisLookup,
      ivec2(int(voxelIndex.y), int(index)),
    ).toVar();
    const zBasis = textureLoad(
      basisLookup,
      ivec2(int(voxelIndex.z), int(index)),
    ).toVar();
    const centeredAngularScale = index.mul(scale).mul(float(0.5));
    const secondDerivativeScale = centeredAngularScale
      .mul(centeredAngularScale)
      .negate();
    if (normalizedBoundaryMode === BOUNDARY_MODES.dirichlet) {
      return {
        value: vec3(xBasis.z, yBasis.z, zBasis.z),
        derivative: vec3(xBasis.w, yBasis.w, zBasis.w),
        secondDerivativeScale,
      };
    }
    return {
      value: vec3(xBasis.x, yBasis.x, zBasis.x),
      derivative: vec3(xBasis.y, yBasis.y, zBasis.y),
      secondDerivativeScale,
    };
  };
  const basisVectors = [u, v, w].map(createBasisVector);
  return evaluatePermutationFamilyFieldGradientFromBasisGrid({
    basisGrid: createPermutationBasisGridFromVectors(basisVectors),
    ...createPreparedPermutationFamilySignature(familyScalars),
  });
}

export function evaluatePermutationFamilyNodeForBoundary({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
}) {
  const family = createPermutationFamilyTerms({
    u,
    v,
    w,
    xCoord,
    yCoord,
    zCoord,
    scale,
    createBasisNode: (index, coordinate, basisScale) =>
      createFixedBoundaryBasisNode(index, coordinate, basisScale, boundaryMode),
  });

  return evaluatePermutationFamilyFromBasisGrid(family);
}

/**
 * Exact weak-deflection curvature transport for six axis-aligned collimated
 * laser sources. Each returned 2x2 tensor is
 *
 *   ∫₀ᴸ (L - s) H_perp[p](r_source + s f) ds
 *
 * in normalized cavity coordinates. The R² from the path kernel cancels the
 * R⁻² physical Hessian conversion, so no radius scaling belongs here.
 */
export function evaluatePermutationFamilyAxisPathIntegratedHessiansNodeForBoundary({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
}) {
  const coordinates = vec3(xCoord, yCoord, zCoord);
  const basisVectors = [u, v, w].map((index) =>
    createFixedBoundaryPathBasisVectorNode(
      index,
      coordinates,
      scale,
      boundaryMode,
    ),
  );
  const signature = createPermutationFamilySignature({ u, v, w });

  return evaluatePermutationFamilyAxisPathIntegratedHessians({
    basisGrid: createPermutationBasisGridFromVectors(basisVectors),
    termWeights: signature.termWeights,
    normalization: signature.normalization,
  });
}

export function evaluatePermutationFamilyFieldNodeForBoundary({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  boundaryMode = BOUNDARY_MODES.neumann,
}) {
  const family = createPermutationFamilyValueTerms({
    u,
    v,
    w,
    xCoord,
    yCoord,
    zCoord,
    scale,
    createBasisValueNode: (index, coordinate, basisScale) =>
      createFixedBoundaryBasisValueNode(
        index,
        coordinate,
        basisScale,
        boundaryMode,
      ),
  });

  return evaluatePermutationFamilyFieldFromBasisGrid(family);
}
