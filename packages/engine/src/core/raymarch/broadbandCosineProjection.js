// For the centered source, Neumann orders are even and Dirichlet orders odd.
// Both pressure bases are reflection-even; a velocity component is odd only
// along its derivative axis. Reflect complete quadratic scalars, never vectors.
export function assertBroadbandReflectionSymmetry(families, boundaryMode) {
  if (!["neumann", "dirichlet"].includes(boundaryMode))
    throw new RangeError("unsupported broadband boundary");
  const dirichlet = boundaryMode === "dirichlet";
  if (
    !families?.length ||
    families.some(
      ({ u, v, w }) =>
        ![u, v, w].every(
          (n) =>
            Number.isSafeInteger(n) &&
            n >= (dirichlet ? 1 : 0) &&
            n % 2 === (dirichlet ? 1 : 0),
        ) || Math.hypot(u, v, w) === 0,
    )
  )
    throw new RangeError(
      dirichlet
        ? "reflection requires positive odd Dirichlet families"
        : "reflection requires even nonuniform Neumann families",
    );
}

/**
 * Immutable product-to-sum map for the centered rectangular apparatus.
 * It maps complete shell quadratic matrices to a tensor cosine polynomial.
 * Coefficients multiply cos(q*pi*(xi+1)); they are amplitude-squared spatial
 * coefficients, not new acoustic modes, source frequencies, or a rank reduction.
 */
export function createBroadbandCosineProjection({
  families,
  shellCount,
  boundaryMode = "neumann",
}) {
  assertBroadbandReflectionSymmetry(families, boundaryMode);
  if (!families?.length || !Number.isSafeInteger(shellCount) || shellCount < 1)
    throw new RangeError("cosine projection requires a finite topology");
  const identities = new Set();
  const waves = [];
  const normalizationWeights = new Float64Array(shellCount);
  let degree = 0;
  for (const { u, v, w, shellIndex, sourceAmplitudeOverlap } of families) {
    const orders = [u, v, w];
    if (
      !Number.isSafeInteger(shellIndex) ||
      shellIndex < 0 ||
      shellIndex >= shellCount ||
      !Number.isFinite(sourceAmplitudeOverlap)
    )
      throw new RangeError(
        "cosine projection requires valid shell mapping and overlap",
      );
    const key = [...orders].sort((a, b) => a - b).join(":");
    if (identities.has(key)) throw new RangeError("duplicate cosine family");
    identities.add(key);
    const permutations = [
      ...new Map(
        [
          [u, v, w],
          [u, w, v],
          [v, u, w],
          [v, w, u],
          [w, u, v],
          [w, v, u],
        ].map((order) => [order.join(":"), order]),
      ).values(),
    ];
    const amplitude =
      sourceAmplitudeOverlap *
      Math.sqrt(
        2 ** orders.filter((n) => n !== 0).length / permutations.length,
      );
    const norm = Math.hypot(...orders);
    for (const order of permutations)
      waves.push({
        order: order.map((n) => n / 2),
        direction: order.map((n) => n / norm),
        amplitude,
        shell: shellIndex,
      });
    degree = Math.max(degree, ...orders);
    normalizationWeights[shellIndex] += sourceAmplitudeOverlap ** 2;
  }
  const width = degree + 1;
  const coefficients = Array.from({ length: width ** 3 }, () => new Map());
  for (let i = 0; i < waves.length; i++) {
    const left = waves[i];
    for (let j = i; j < waves.length; j++) {
      const right = waves[j];
      const a = Math.min(left.shell, right.shell);
      const b = Math.max(left.shell, right.shell);
      const pair = a * shellCount + b;
      const product =
        (left.amplitude * right.amplitude * (i === j ? 1 : 2)) / 8;
      // cos(a)cos(b)=(cos(a-b)+cos(a+b))/2, whereas
      // sin(a)sin(b)=(cos(a-b)-cos(a+b))/2. Dirichlet pressure
      // has three sine pairs; a velocity component replaces one with cosines.
      for (let mask = 0; mask < 8; mask++) {
        const q = [];
        let velocity = 0;
        let pressureSign = 1;
        for (let axis = 0; axis < 3; axis++) {
          const sum = (mask & (1 << axis)) !== 0;
          if (boundaryMode === "dirichlet" && sum) pressureSign = -pressureSign;
          q.push(
            Math.abs(left.order[axis] + (sum ? 1 : -1) * right.order[axis]),
          );
          velocity +=
            (sum ? -1 : 1) * left.direction[axis] * right.direction[axis];
        }
        const index = q[0] + width * (q[1] + width * q[2]);
        const weights = coefficients[index].get(pair) ?? [0, 0];
        weights[0] += product * pressureSign;
        weights[1] += product * pressureSign * velocity;
        coefficients[index].set(pair, weights);
      }
    }
  }
  const offsets = new Uint32Array(width ** 3 + 1);
  const entries = [];
  for (let i = 0; i < coefficients.length; i++) {
    offsets[i] = entries.length / 4;
    for (const [pair, [p, v]] of coefficients[i]) {
      // Only identically zero algebraic contributions may disappear.
      if (p === 0 && v === 0) continue;
      entries.push(Math.floor(pair / shellCount), pair % shellCount, p, v);
    }
  }
  offsets[offsets.length - 1] = entries.length / 4;
  return {
    width,
    offsets,
    entries: Float64Array.from(entries),
    normalizationWeights,
  };
}
