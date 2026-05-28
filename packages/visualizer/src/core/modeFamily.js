export const BOUNDARY_MODES = Object.freeze({
  dirichlet: "dirichlet",
  neumann: "neumann",
});

const BOUNDARY_MODE_VALUES = Object.freeze({
  [BOUNDARY_MODES.dirichlet]: 0,
  [BOUNDARY_MODES.neumann]: 1,
});

export const PERMUTATION_ORDERS = Object.freeze({
  allEqual: Object.freeze([[0, 1, 2]]),
  repeatedHead: Object.freeze([
    [0, 1, 2],
    [0, 2, 1],
    [2, 0, 1],
  ]),
  repeatedTail: Object.freeze([
    [0, 1, 2],
    [1, 0, 2],
    [1, 2, 0],
  ]),
  distinct: Object.freeze([
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [2, 0, 1],
    [1, 2, 0],
    [2, 1, 0],
  ]),
});

export function normalizeBoundaryMode(mode) {
  return mode === BOUNDARY_MODES.dirichlet
    ? BOUNDARY_MODES.dirichlet
    : BOUNDARY_MODES.neumann;
}

export function getBoundaryModeValue(mode) {
  return BOUNDARY_MODE_VALUES[normalizeBoundaryMode(mode)];
}

export function getBoundaryModeFromValue(value) {
  return value >= 0.5 ? BOUNDARY_MODES.neumann : BOUNDARY_MODES.dirichlet;
}

function canonicalTriple(u, v, w) {
  // Sort (u, v, w) ascending without allocating an array. The classifier
  // below assumes the canonical order `a ≤ b ≤ c`; sorting at the API
  // boundary lets it stay branch-pure for the canonical case while making
  // unsorted callers safe instead of silently misclassifying them.
  let a = u;
  let b = v;
  let c = w;
  if (a > b) [a, b] = [b, a];
  if (b > c) [b, c] = [c, b];
  if (a > b) [a, b] = [b, a];
  return [a, b, c];
}

/**
 * Count the unique permutations of a cavity-mode triple.
 *
 * Inputs are canonicalized to `u ≤ v ≤ w` internally; callers do not need
 * to sort first. The classifier inspects only the (u,v) and (v,w) pairs,
 * which is sound under canonical order.
 *
 * @param {number} u
 * @param {number} v
 * @param {number} w
 * @returns {1 | 3 | 6}
 */
export function getUniquePermutationCount(u, v, w) {
  const [a, b, c] = canonicalTriple(u, v, w);
  if (a === c) return 1;
  if (a === b || b === c) return 3;
  return 6;
}

/**
 * Expand a cavity-mode triple into its unique permutation set.
 *
 * Inputs are canonicalized to `u ≤ v ≤ w` internally; the returned
 * permutations are over the canonical order.
 *
 * @param {number} u
 * @param {number} v
 * @param {number} w
 * @returns {Array<[number, number, number]>}
 */
export function getPermutationFamily(u, v, w) {
  const indices = canonicalTriple(u, v, w);
  const [a, b, c] = indices;
  const orders =
    a === c
      ? PERMUTATION_ORDERS.allEqual
      : a === b
        ? PERMUTATION_ORDERS.repeatedHead
        : b === c
          ? PERMUTATION_ORDERS.repeatedTail
          : PERMUTATION_ORDERS.distinct;

  return orders.map(([xIndex, yIndex, zIndex]) => [
    indices[xIndex],
    indices[yIndex],
    indices[zIndex],
  ]);
}

function evaluateCenteredDirichletBasis(index, coordinate, scale) {
  const angularScale = index * scale;
  const centeredAngularScale = angularScale * 0.5;
  const centeredArgument = index * (coordinate * scale + Math.PI) * 0.5;
  return {
    value: Math.sin(centeredArgument),
    derivative: Math.cos(centeredArgument) * centeredAngularScale,
  };
}

function evaluateNeumannBasis(index, coordinate, scale) {
  const angularScale = index * scale;
  const argument = angularScale * coordinate;
  return {
    value: Math.cos(argument),
    derivative: -Math.sin(argument) * angularScale,
  };
}

function evaluateBoundaryBasis(
  index,
  coordinate,
  scale,
  normalizedBoundaryMode,
) {
  if (normalizedBoundaryMode === BOUNDARY_MODES.dirichlet) {
    return evaluateCenteredDirichletBasis(index, coordinate, scale);
  }
  return evaluateNeumannBasis(index, coordinate, scale);
}

export function evaluateSinglePermutationMode({
  u,
  v,
  w,
  x,
  y,
  z,
  scale = Math.PI,
  boundaryMode,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const basisX = evaluateBoundaryBasis(u, x, scale, normalizedBoundaryMode);
  const basisY = evaluateBoundaryBasis(v, y, scale, normalizedBoundaryMode);
  const basisZ = evaluateBoundaryBasis(w, z, scale, normalizedBoundaryMode);

  return {
    field: basisX.value * basisY.value * basisZ.value,
    gradX: basisX.derivative * basisY.value * basisZ.value,
    gradY: basisX.value * basisY.derivative * basisZ.value,
    gradZ: basisX.value * basisY.value * basisZ.derivative,
  };
}

export function evaluatePermutationFamilyMode({
  u,
  v,
  w,
  x,
  y,
  z,
  scale = Math.PI,
  boundaryMode,
}) {
  const permutations = getPermutationFamily(u, v, w);
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalization = 1 / Math.sqrt(permutations.length);
  let field = 0;
  let gradX = 0;
  let gradY = 0;
  let gradZ = 0;

  for (const [px, py, pz] of permutations) {
    const value = evaluateSinglePermutationMode({
      u: px,
      v: py,
      w: pz,
      x,
      y,
      z,
      scale,
      boundaryMode: normalizedBoundaryMode,
    });
    field += value.field;
    gradX += value.gradX;
    gradY += value.gradY;
    gradZ += value.gradZ;
  }

  return {
    field: field * normalization,
    gradX: gradX * normalization,
    gradY: gradY * normalization,
    gradZ: gradZ * normalization,
    normalization,
    permutationCount: permutations.length,
  };
}
