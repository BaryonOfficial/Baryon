import { abs, clamp, cos, float, sin, smoothstep, sqrt } from "three/tsl";
import {
  BOUNDARY_MODES,
  PERMUTATION_ORDERS,
  normalizeBoundaryMode,
} from "./modeFamily.js";

const FAMILY_EPSILON = 1e-4;

function createCenteredDirichletArgumentNode(index, coordinate, scale) {
  return index.mul(coordinate.mul(scale).add(float(Math.PI)).mul(float(0.5)));
}

function createDirichletBasisNode(index, coordinate, scale) {
  const angularScale = index.mul(scale);
  const centeredAngularScale = angularScale.mul(float(0.5));
  const centeredArgument = createCenteredDirichletArgumentNode(
    index,
    coordinate,
    scale,
  );

  return {
    value: sin(centeredArgument),
    derivative: cos(centeredArgument).mul(centeredAngularScale),
  };
}

function createNeumannBasisNode(index, coordinate, scale) {
  const angularScale = index.mul(scale);
  const argument = angularScale.mul(coordinate);

  return {
    value: cos(argument),
    derivative: sin(argument).mul(angularScale).negate(),
  };
}

function createBoundaryBasisNode(index, coordinate, scale, boundaryBlend) {
  const boundaryComplement = float(1.0).sub(boundaryBlend);
  const dirichletBasis = createDirichletBasisNode(index, coordinate, scale);
  const neumannBasis = createNeumannBasisNode(index, coordinate, scale);

  return {
    value: dirichletBasis.value
      .mul(boundaryComplement)
      .add(neumannBasis.value.mul(boundaryBlend)),
    derivative: dirichletBasis.derivative
      .mul(boundaryComplement)
      .add(neumannBasis.derivative.mul(boundaryBlend)),
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

function createPermutationTermNode({ basisX, basisY, basisZ }) {
  return {
    field: basisX.value.mul(basisY.value).mul(basisZ.value),
    gradX: basisX.derivative.mul(basisY.value).mul(basisZ.value),
    gradY: basisX.value.mul(basisY.derivative).mul(basisZ.value),
    gradZ: basisX.value.mul(basisY.value).mul(basisZ.derivative),
  };
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
    basisGrid: [
      [
        createBasisNode(u, xCoord, scale),
        createBasisNode(v, xCoord, scale),
        createBasisNode(w, xCoord, scale),
      ],
      [
        createBasisNode(u, yCoord, scale),
        createBasisNode(v, yCoord, scale),
        createBasisNode(w, yCoord, scale),
      ],
      [
        createBasisNode(u, zCoord, scale),
        createBasisNode(v, zCoord, scale),
        createBasisNode(w, zCoord, scale),
      ],
    ],
  };
}

function evaluatePermutationFamilyFromBasisGrid({
  basisGrid,
  termWeights,
  normalization,
  uniquePermutationCount,
}) {
  const terms = PERMUTATION_ORDERS.distinct.map(([xIndex, yIndex, zIndex]) =>
    createPermutationTermNode({
      basisX: basisGrid[0][xIndex],
      basisY: basisGrid[1][yIndex],
      basisZ: basisGrid[2][zIndex],
    }),
  );
  const fieldSum = float(0.0).toVar();
  const gradXSum = float(0.0).toVar();
  const gradYSum = float(0.0).toVar();
  const gradZSum = float(0.0).toVar();

  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
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

export function evaluatePermutationFamilyNode({
  u,
  v,
  w,
  xCoord,
  yCoord,
  zCoord,
  scale,
  boundaryMode,
}) {
  const boundaryBlend = clamp(boundaryMode, float(0.0), float(1.0));
  const family = createPermutationFamilyTerms({
    u,
    v,
    w,
    xCoord,
    yCoord,
    zCoord,
    scale,
    createBasisNode: (index, coordinate, basisScale) =>
      createBoundaryBasisNode(index, coordinate, basisScale, boundaryBlend),
  });

  return evaluatePermutationFamilyFromBasisGrid(family);
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
