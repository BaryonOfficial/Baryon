export const BOUNDARY_MODES = Object.freeze({
  dirichlet: "dirichlet",
  neumann: "neumann",
});

const BOUNDARY_MODE_VALUES = Object.freeze({
  [BOUNDARY_MODES.dirichlet]: 0,
  [BOUNDARY_MODES.neumann]: 1,
});

const UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE = Math.SQRT2;

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

function getAxisEnergyNormalization(index, boundaryMode) {
  if (normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet) {
    return UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE;
  }
  // The zero-index Neumann eigenfunction is the constant 1 and already has
  // unit mean-square energy; every oscillatory cosine needs sqrt(2).
  return index === 0 ? 1 : UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE;
}

/**
 * Per-mode scalars the analytic field evaluation needs but that do not vary
 * with position.
 *
 * Two quantities factor cleanly out of the permutation sum. The family
 * normalization 1/sqrt(uniquePermutationCount) multiplies the summed field and
 * every gradient component once. The axis energy normalizations multiply each
 * term by N(u)N(v)N(w) — identical for all six terms, because a permutation
 * only changes which axis an index lands on, never which indices are present.
 * Their product is therefore a single scale on the whole family.
 *
 * The term weights reduce just as far. Writing A for the three-term mask on
 * (u,v) and B for the mask on (v,w), the six weights are [1, A, B, A, B, A*B],
 * so the shader only needs A and B.
 *
 * Evaluating these per volume sample costs five smoothsteps, a sqrt and a
 * divide inside the innermost loop, for values that change only when the
 * topology commits. They are computed here once per mode instead.
 *
 * @param {number} u
 * @param {number} v
 * @param {number} w
 * @param {string} [boundaryMode]
 * @returns {{ familyScale: number, threeTermUVMask: number, threeTermVWMask: number }}
 */
export function deriveModeFamilyEvaluationScalars(u, v, w, boundaryMode) {
  const distinctUV = u === v ? 0 : 1;
  const distinctVW = v === w ? 0 : 1;
  const twoEqualUV = (1 - distinctUV) * distinctVW;
  const twoEqualVW = distinctUV * (1 - distinctVW);
  const allDistinct = distinctUV * distinctVW;
  const uniquePermutationCount =
    1 + (twoEqualUV + twoEqualVW) * 2 + allDistinct * 5;
  const energyProduct =
    getAxisEnergyNormalization(u, boundaryMode) *
    getAxisEnergyNormalization(v, boundaryMode) *
    getAxisEnergyNormalization(w, boundaryMode);

  return {
    familyScale: energyProduct / Math.sqrt(uniquePermutationCount),
    threeTermUVMask: twoEqualUV + allDistinct,
    threeTermVWMask: twoEqualVW + allDistinct,
  };
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

/**
 * Phase of axis mode `index` at centered cavity coordinate `coordinate`.
 *
 * Shared by both boundary families so they stay on one wavenumber: `index`
 * half-wavelengths across the cavity, matching the `f = c|n| / (2L)` atlas.
 * The offset puts the negative wall at phase 0 and the positive wall at
 * `index·π`.
 */
function centeredCavityArgument(index, coordinate, scale) {
  return index * (coordinate * scale + Math.PI) * 0.5;
}

function evaluateCenteredDirichletBasis(index, coordinate, scale) {
  const centeredAngularScale = index * scale * 0.5;
  const centeredArgument = centeredCavityArgument(index, coordinate, scale);
  const energyNormalization = UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE;
  return {
    value: Math.sin(centeredArgument) * energyNormalization,
    derivative:
      Math.cos(centeredArgument) * centeredAngularScale * energyNormalization,
    secondDerivative:
      -Math.sin(centeredArgument) *
      centeredAngularScale *
      centeredAngularScale *
      energyNormalization,
  };
}

function evaluateNeumannBasis(index, coordinate, scale) {
  const centeredAngularScale = index * scale * 0.5;
  const centeredArgument = centeredCavityArgument(index, coordinate, scale);
  // The zero-index Neumann eigenfunction is the constant 1 and already has
  // unit mean-square energy. Every oscillatory cosine has mean square 1/2 on
  // the cavity domain and therefore needs sqrt(2). Applying the same factor
  // to the derivative preserves the analytic field-gradient relationship.
  const energyNormalization =
    index === 0 ? 1 : UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE;
  return {
    value: Math.cos(centeredArgument) * energyNormalization,
    derivative:
      -Math.sin(centeredArgument) * centeredAngularScale * energyNormalization,
    secondDerivative:
      -Math.cos(centeredArgument) *
      centeredAngularScale *
      centeredAngularScale *
      energyNormalization,
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

export function evaluateBoundaryAxisBasis({
  index,
  coordinate,
  scale = Math.PI,
  boundaryMode,
}) {
  return evaluateBoundaryBasis(
    index,
    coordinate,
    scale,
    normalizeBoundaryMode(boundaryMode),
  );
}

/**
 * Integrate one boundary basis along a laser trajectory with the paraxial
 * propagation kernel:
 *
 *   K = ∫₀ᴸ (L - s) B(a + d s) ds
 *
 * `a` is the source coordinate, `d` points from the source to the observation
 * point, and `L = |coordinate - sourceCoordinate|`. This is the exact
 * first-order geometric-optics weighting for how refractive curvature at each
 * point changes the ray-map Jacobian at the observation point.
 */
export function integrateBoundaryAxisBasisPropagationKernel({
  index,
  coordinate,
  sourceCoordinate,
  scale = Math.PI,
  boundaryMode,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const target = Number.isFinite(coordinate) ? coordinate : 0;
  const source = Number.isFinite(sourceCoordinate) ? sourceCoordinate : target;
  const distance = Math.abs(target - source);
  if (!(distance > 0)) {
    return 0;
  }
  const direction = target >= source ? 1 : -1;

  const angularScale = index * scale * 0.5;
  const sourcePhase = centeredCavityArgument(index, source, scale);
  const targetPhase = centeredCavityArgument(index, target, scale);

  if (normalizedBoundaryMode === BOUNDARY_MODES.dirichlet) {
    if (!(Math.abs(angularScale) > Number.EPSILON)) {
      return 0;
    }
    return (
      UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE *
      ((Math.sin(sourcePhase) - Math.sin(targetPhase)) /
        (angularScale * angularScale) +
        (direction * distance * Math.cos(sourcePhase)) / angularScale)
    );
  }

  // The zero-index Neumann eigenfunction is the constant 1, so the kernel
  // reduces to the pure geometric weight integral (L - s) ds = L²/2.
  if (!(Math.abs(angularScale) > Number.EPSILON)) {
    return 0.5 * distance * distance;
  }
  return (
    UNIT_MEAN_SQUARE_OSCILLATORY_BASIS_SCALE *
    ((Math.cos(sourcePhase) - Math.cos(targetPhase)) /
      (angularScale * angularScale) -
      (direction * distance * Math.sin(sourcePhase)) / angularScale)
  );
}

/**
 * Axis path-integrated Hessian of one permutation term.
 *
 * `boundaryMode` is optional: an unset boundary normalizes to Neumann, which
 * is the cavity default.
 *
 * @param {{
 *   u: number,
 *   v: number,
 *   w: number,
 *   x: number,
 *   y: number,
 *   z: number,
 *   sourceCoordinate: number,
 *   propagationAxis: number,
 *   scale?: number,
 *   boundaryMode?: string,
 * }} args
 */
export function evaluateSinglePermutationAxisPathIntegratedHessian({
  u,
  v,
  w,
  x,
  y,
  z,
  sourceCoordinate,
  propagationAxis,
  scale = Math.PI,
  boundaryMode,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const indices = [u, v, w];
  const coordinates = [x, y, z];
  const longitudinalAxis = Math.max(
    0,
    Math.min(2, Math.floor(propagationAxis ?? 0)),
  );
  const transverseAxes =
    longitudinalAxis === 0 ? [1, 2] : longitudinalAxis === 1 ? [0, 2] : [0, 1];
  const bases = indices.map((index, axis) =>
    evaluateBoundaryAxisBasis({
      index,
      coordinate: coordinates[axis],
      scale,
      boundaryMode: normalizedBoundaryMode,
    }),
  );
  const longitudinalIntegral = integrateBoundaryAxisBasisPropagationKernel({
    index: indices[longitudinalAxis],
    coordinate: coordinates[longitudinalAxis],
    sourceCoordinate,
    scale,
    boundaryMode: normalizedBoundaryMode,
  });
  const [firstAxis, secondAxis] = transverseAxes;
  const firstBasis = bases[firstAxis];
  const secondBasis = bases[secondAxis];

  return {
    h11: longitudinalIntegral * firstBasis.secondDerivative * secondBasis.value,
    h22: longitudinalIntegral * firstBasis.value * secondBasis.secondDerivative,
    h12: longitudinalIntegral * firstBasis.derivative * secondBasis.derivative,
  };
}

/**
 * Sum the axis path-integrated Hessian over one mode's permutation family.
 *
 * Only the indices permute; the sample point, propagation axis, and boundary
 * are shared by every term, so they pass through untouched.
 *
 * @param {{
 *   u: number,
 *   v: number,
 *   w: number,
 *   x: number,
 *   y: number,
 *   z: number,
 *   sourceCoordinate: number,
 *   propagationAxis: number,
 *   scale?: number,
 *   boundaryMode?: string,
 * }} args
 */
export function evaluatePermutationFamilyAxisPathIntegratedHessian({
  u,
  v,
  w,
  ...options
}) {
  const permutations = getPermutationFamily(u, v, w);
  const normalization = 1 / Math.sqrt(permutations.length);
  let h11 = 0;
  let h22 = 0;
  let h12 = 0;

  for (const [px, py, pz] of permutations) {
    const tensor = evaluateSinglePermutationAxisPathIntegratedHessian({
      u: px,
      v: py,
      w: pz,
      ...options,
    });
    h11 += tensor.h11;
    h22 += tensor.h22;
    h12 += tensor.h12;
  }

  return {
    h11: h11 * normalization,
    h22: h22 * normalization,
    h12: h12 * normalization,
    normalization,
    permutationCount: permutations.length,
  };
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
  const basisX = evaluateBoundaryAxisBasis({
    index: u,
    coordinate: x,
    scale,
    boundaryMode: normalizedBoundaryMode,
  });
  const basisY = evaluateBoundaryAxisBasis({
    index: v,
    coordinate: y,
    scale,
    boundaryMode: normalizedBoundaryMode,
  });
  const basisZ = evaluateBoundaryAxisBasis({
    index: w,
    coordinate: z,
    scale,
    boundaryMode: normalizedBoundaryMode,
  });

  return {
    field: basisX.value * basisY.value * basisZ.value,
    gradX: basisX.derivative * basisY.value * basisZ.value,
    gradY: basisX.value * basisY.derivative * basisZ.value,
    gradZ: basisX.value * basisY.value * basisZ.derivative,
    hessianXX: basisX.secondDerivative * basisY.value * basisZ.value,
    hessianYY: basisX.value * basisY.secondDerivative * basisZ.value,
    hessianZZ: basisX.value * basisY.value * basisZ.secondDerivative,
    hessianXY: basisX.derivative * basisY.derivative * basisZ.value,
    hessianXZ: basisX.derivative * basisY.value * basisZ.derivative,
    hessianYZ: basisX.value * basisY.derivative * basisZ.derivative,
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
  // Each separable permutation has unit mean-square basis energy after the
  // one-dimensional normalization above. Distinct permutations are mutually
  // orthogonal on the cavity domain, so 1/sqrt(N) gives their family sum unit
  // mean-square energy as well. A modal coefficient squared can therefore be
  // interpreted consistently as represented modal energy for every family.
  const normalization = 1 / Math.sqrt(permutations.length);
  let field = 0;
  let gradX = 0;
  let gradY = 0;
  let gradZ = 0;
  let hessianXX = 0;
  let hessianYY = 0;
  let hessianZZ = 0;
  let hessianXY = 0;
  let hessianXZ = 0;
  let hessianYZ = 0;

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
    hessianXX += value.hessianXX;
    hessianYY += value.hessianYY;
    hessianZZ += value.hessianZZ;
    hessianXY += value.hessianXY;
    hessianXZ += value.hessianXZ;
    hessianYZ += value.hessianYZ;
  }

  return {
    field: field * normalization,
    gradX: gradX * normalization,
    gradY: gradY * normalization,
    gradZ: gradZ * normalization,
    hessianXX: hessianXX * normalization,
    hessianYY: hessianYY * normalization,
    hessianZZ: hessianZZ * normalization,
    hessianXY: hessianXY * normalization,
    hessianXZ: hessianXZ * normalization,
    hessianYZ: hessianYZ * normalization,
    normalization,
    permutationCount: permutations.length,
  };
}
