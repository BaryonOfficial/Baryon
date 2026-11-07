import { float, int, ivec2, textureLoad, vec3 } from "three/tsl";
import {
  BOUNDARY_MODES,
  PERMUTATION_ORDERS,
  normalizeBoundaryMode,
} from "./modeFamily.js";

function createPermutationBasisGridFromVectors(basisVectors) {
  return ["x", "y", "z"].map((axis) =>
    basisVectors.map((basis) => ({
      value: basis.value[axis],
      derivative: basis.derivative[axis],
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

function evaluatePermutationFamilyFieldGradientFromBasisGrid({
  basisGrid,
  termWeights,
  normalization,
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
  };
}

/**
 * Evaluate one cache-grid mode from the precomputed separable basis table.
 *
 * The moment-field qualification probe supplies coordinates that are
 * exact voxel indices and mode orders that are exact integers, so
 * textureLoad is the canonical operation on both WebGPU and WebGL2. Float32
 * table entries replace eighteen scalar transcendental evaluations per mode.
 */
export function evaluatePermutationFamilyFieldGradientFromBasisLookupNode({
  u,
  v,
  w,
  voxelIndex,
  boundaryMode = /** @type {string} */ (BOUNDARY_MODES.neumann),
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
    if (normalizedBoundaryMode === BOUNDARY_MODES.dirichlet) {
      return {
        value: vec3(xBasis.z, yBasis.z, zBasis.z),
        derivative: vec3(xBasis.w, yBasis.w, zBasis.w),
      };
    }
    return {
      value: vec3(xBasis.x, yBasis.x, zBasis.x),
      derivative: vec3(xBasis.y, yBasis.y, zBasis.y),
    };
  };
  const basisVectors = [u, v, w].map(createBasisVector);
  return evaluatePermutationFamilyFieldGradientFromBasisGrid({
    basisGrid: createPermutationBasisGridFromVectors(basisVectors),
    ...createPreparedPermutationFamilySignature(familyScalars),
  });
}
