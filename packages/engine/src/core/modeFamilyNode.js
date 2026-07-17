import { abs, cos, float, sin, smoothstep, sqrt } from "three/tsl";
import {
  BOUNDARY_MODES,
  PERMUTATION_ORDERS,
  normalizeBoundaryMode,
} from "./modeFamily.js";

const FAMILY_EPSILON = 1e-4;

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

function createCenteredDirichletArgumentNode(index, coordinate, scale) {
  return index.mul(coordinate.mul(scale).add(float(Math.PI)).mul(float(0.5)));
}

function createDirichletBasisValueNode(index, coordinate, scale) {
  return sin(createCenteredDirichletArgumentNode(index, coordinate, scale)).mul(
    createDirichletBasisEnergyNormalizationNode(),
  );
}

function createDirichletBasisNode(index, coordinate, scale) {
  const angularScale = index.mul(scale);
  const centeredAngularScale = angularScale.mul(float(0.5));
  const centeredArgument = createCenteredDirichletArgumentNode(
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
  };
}

function createNeumannBasisValueNode(index, coordinate, scale) {
  return cos(index.mul(scale).mul(coordinate)).mul(
    createNeumannBasisEnergyNormalizationNode(index),
  );
}

function createNeumannBasisNode(index, coordinate, scale) {
  const angularScale = index.mul(scale);
  const argument = angularScale.mul(coordinate);
  const energyNormalization = createNeumannBasisEnergyNormalizationNode(index);

  return {
    value: cos(argument).mul(energyNormalization),
    derivative: sin(argument)
      .mul(angularScale)
      .negate()
      .mul(energyNormalization),
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
  return {
    field: basisX.value.mul(basisY.value).mul(basisZ.value),
    gradX: basisX.derivative.mul(basisY.value).mul(basisZ.value),
    gradY: basisX.value.mul(basisY.derivative).mul(basisZ.value),
    gradZ: basisX.value.mul(basisY.value).mul(basisZ.derivative),
  };
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
  }

  return {
    field: fieldSum.mul(normalization),
    gradX: gradXSum.mul(normalization),
    gradY: gradYSum.mul(normalization),
    gradZ: gradZSum.mul(normalization),
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
