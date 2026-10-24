/**
 * Independent broadband oracle for the dossier's normalized virtual cavity.
 * No production numerical helpers: RK4 integrates pressure, velocity, raw
 * second moments and optional direct point observations together. Refine
 * `substeps` to establish convergence; this is not a real-time implementation.
 *
 * x is held constant during each audio sample. P'=-dP-wR+dx, R'=wP.
 * Moments obey C'=(mean_channel(yy^T)-C)/tau without onset renormalization.
 */
function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
  return value;
}

function validateShell(shell) {
  positive(shell.naturalFrequencyHz, "naturalFrequencyHz");
  if (!Number.isFinite(shell.qualityFactor) || shell.qualityFactor < 0.5) {
    throw new RangeError("qualityFactor must be finite and at least 0.5");
  }
}

function finiteVector(values, length, name) {
  if (values?.length !== length || !Array.from(values).every(Number.isFinite)) {
    throw new RangeError(`${name} must contain ${length} finite values`);
  }
}

export function referenceBroadbandTransfer(shell, driveFrequencyHz) {
  validateShell(shell);
  positive(driveFrequencyHz, "driveFrequencyHz");
  const w = 2 * Math.PI * shell.naturalFrequencyHz;
  const drive = 2 * Math.PI * driveFrequencyHz;
  const d = w / shell.qualityFactor;
  const a = w * w - drive * drive;
  const b = d * drive;
  const denominator = a * a + b * b;
  return {
    pressure: {
      real: (d * drive * b) / denominator,
      imaginary: (d * drive * a) / denominator,
    },
    velocity: {
      real: (d * w * a) / denominator,
      imaginary: (-d * w * b) / denominator,
    },
  };
}

function validateProbe(probe, count) {
  finiteVector(probe.pressure, count, "probe pressure basis");
  if (probe.velocity?.length !== 3) {
    throw new RangeError("probe requires three velocity basis vectors");
  }
  for (const axis of probe.velocity)
    finiteVector(axis, count, "probe velocity basis");
}

export function createBroadbandReference({
  shells,
  sampleRate,
  channelCount = 1,
  exposureSeconds = 0.05,
  substeps = 8,
  probes = [],
  initialPressure = null,
  initialVelocity = null,
}) {
  positive(sampleRate, "sampleRate");
  positive(exposureSeconds, "exposureSeconds");
  if (!Array.isArray(shells) || shells.length === 0) {
    throw new RangeError("at least one shell is required");
  }
  shells.forEach(validateShell);
  if (![1, 2].includes(channelCount)) {
    throw new RangeError("the reference supports mono or stereo");
  }
  if (!Number.isSafeInteger(substeps) || substeps < 1) {
    throw new RangeError("substeps must be a positive integer");
  }
  const count = shells.length;
  probes.forEach((probe) => validateProbe(probe, count));
  // Copy configuration: callers cannot change equations during integration.
  const angular = shells.map((shell) => 2 * Math.PI * shell.naturalFrequencyHz);
  const loss = shells.map((shell, m) => angular[m] / shell.qualityFactor);
  const pointBases = probes.map((probe) => ({
    pressure: [...probe.pressure],
    velocity: probe.velocity.map((axis) => [...axis]),
  }));
  const stateWidth = 2 * count * channelCount;
  const momentWidth = count * count;
  const velocityMomentOffset = stateWidth + momentWidth;
  const inputMomentOffset = stateWidth + 2 * momentWidth;
  const probeOffset = inputMomentOffset + 2 * count;
  const state = new Float64Array(probeOffset + 2 * probes.length);
  for (const [values, offset] of [
    [initialPressure, 0],
    [initialVelocity, 1],
  ]) {
    if (values !== null) {
      finiteVector(values, count * channelCount, "initial coefficients");
      for (let i = 0; i < values.length; i++) state[2 * i + offset] = values[i];
    }
  }
  const stages = Array.from(
    { length: 4 },
    () => new Float64Array(state.length),
  );
  const temporary = new Float64Array(state.length);
  const forcing = new Float64Array(channelCount);
  const h = 1 / (sampleRate * substeps);
  let sampleIndex = 0;

  function derivative(y, output) {
    output.fill(0);
    for (let a = 0; a < channelCount; a++) {
      const start = 2 * a * count;
      for (let m = 0; m < count; m++) {
        const index = start + 2 * m;
        output[index] =
          -loss[m] * y[index] -
          angular[m] * y[index + 1] +
          loss[m] * forcing[a];
        output[index + 1] = angular[m] * y[index];
        output[inputMomentOffset + 2 * m] +=
          (forcing[a] * y[index]) / channelCount;
        output[inputMomentOffset + 2 * m + 1] +=
          (forcing[a] * y[index + 1]) / channelCount;
      }
      for (let m = 0; m < count; m++) {
        for (let n = 0; n < count; n++) {
          const pair = m * count + n;
          output[stateWidth + pair] +=
            (y[start + 2 * m] * y[start + 2 * n]) / channelCount;
          output[velocityMomentOffset + pair] +=
            (y[start + 2 * m + 1] * y[start + 2 * n + 1]) / channelCount;
        }
      }
      // Squaring spatial sums here is independent of the matrix evaluator.
      for (let p = 0; p < pointBases.length; p++) {
        const basis = pointBases[p];
        let pressure = 0;
        const velocity = [0, 0, 0];
        for (let m = 0; m < count; m++) {
          pressure += basis.pressure[m] * y[start + 2 * m];
          for (let axis = 0; axis < 3; axis++) {
            velocity[axis] -= basis.velocity[axis][m] * y[start + 2 * m + 1];
          }
        }
        output[probeOffset + 2 * p] += (pressure * pressure) / channelCount;
        output[probeOffset + 2 * p + 1] +=
          velocity.reduce((sum, v) => sum + v * v, 0) / channelCount;
      }
    }
    for (let i = stateWidth; i < y.length; i++) {
      output[i] = (output[i] - y[i]) / exposureSeconds;
    }
  }

  function step() {
    derivative(state, stages[0]);
    for (let s = 1; s < 4; s++) {
      const scale = s === 3 ? h : h / 2;
      for (let i = 0; i < state.length; i++) {
        temporary[i] = state[i] + scale * stages[s - 1][i];
      }
      derivative(temporary, stages[s]);
    }
    for (let i = 0; i < state.length; i++) {
      state[i] +=
        (h / 6) *
        (stages[0][i] + 2 * stages[1][i] + 2 * stages[2][i] + stages[3][i]);
    }
  }

  return {
    advance(channels) {
      if (channels?.length !== channelCount)
        throw new RangeError("channel layout changed");
      const length = channels[0].length;
      for (const channel of channels)
        finiteVector(channel, length, "audio channel");
      if (!Number.isSafeInteger(sampleIndex + length))
        throw new RangeError("sample cursor overflow");
      for (let n = 0; n < length; n++) {
        for (let a = 0; a < channelCount; a++) forcing[a] = channels[a][n];
        for (let s = 0; s < substeps; s++) step();
      }
      sampleIndex += length;
    },
    read() {
      return {
        sampleIndex,
        pressure: Float64Array.from(
          { length: count * channelCount },
          (_, i) => state[2 * i],
        ),
        velocity: Float64Array.from(
          { length: count * channelCount },
          (_, i) => state[2 * i + 1],
        ),
        pressureMoments: state.slice(stateWidth, velocityMomentOffset),
        velocityMoments: state.slice(velocityMomentOffset, inputMomentOffset),
        inputPressureMoments: Float64Array.from(
          { length: count },
          (_, i) => state[inputMomentOffset + 2 * i],
        ),
        inputVelocityMoments: Float64Array.from(
          { length: count },
          (_, i) => state[inputMomentOffset + 2 * i + 1],
        ),
        probePressureEnergy: Float64Array.from(
          { length: probes.length },
          (_, i) => state[probeOffset + 2 * i],
        ),
        probeVelocityEnergy: Float64Array.from(
          { length: probes.length },
          (_, i) => state[probeOffset + 2 * i + 1],
        ),
      };
    },
  };
}

/**
 * Independent rectangular permutation-family basis, folded onto shell columns.
 * sourceAmplitudeOverlap is s_j (signed amplitude, including coupling once).
 * The trace weights retain sum_j(s_j^2), even for several families per shell.
 */
export function referenceBroadbandBasis(
  families,
  position,
  shellCount,
  boundaryMode = "neumann",
) {
  if (!["neumann", "dirichlet"].includes(boundaryMode))
    throw new RangeError("unsupported reference boundary");
  finiteVector(position, 3, "position");
  if (!Number.isSafeInteger(shellCount) || shellCount < 1) {
    throw new RangeError("a positive shell count is required");
  }
  const vector = () => new Float64Array(shellCount);
  const basis = {
    pressure: vector(),
    velocity: Array.from({ length: 3 }, vector),
    pressureGradient: Array.from({ length: 3 }, vector),
    velocityGradient: Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, vector),
    ),
    normalizationWeights: vector(),
  };
  const identities = new Set();
  for (const family of families) {
    const { shellIndex, sourceAmplitudeOverlap } = family;
    const indices = [family.u, family.v, family.w];
    if (
      !indices.every(
        (n) =>
          Number.isSafeInteger(n) &&
          n >= (boundaryMode === "dirichlet" ? 1 : 0),
      ) ||
      !Number.isSafeInteger(shellIndex) ||
      shellIndex < 0 ||
      shellIndex >= shellCount ||
      !Number.isFinite(sourceAmplitudeOverlap) ||
      Math.hypot(...indices) === 0
    ) {
      throw new RangeError("invalid nonuniform cavity family");
    }
    const key = [...indices].sort((a, b) => a - b).join(":");
    if (identities.has(key))
      throw new RangeError("duplicate permutation family");
    identities.add(key);
    const permutations = new Map();
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        if (a === b) continue;
        const order = [indices[a], indices[b], indices[3 - a - b]];
        permutations.set(order.join(":"), order);
      }
    }
    const k = (Math.PI * Math.hypot(...indices)) / 2;
    basis.normalizationWeights[shellIndex] += sourceAmplitudeOverlap ** 2;
    const amplitude = sourceAmplitudeOverlap / Math.sqrt(permutations.size);
    for (const order of permutations.values()) {
      const axisValues = order.map((n, axis) => {
        const wave = (Math.PI * n) / 2;
        const scale = n === 0 ? 1 : Math.SQRT2;
        const phase = wave * (position[axis] + 1);
        return boundaryMode === "dirichlet"
          ? [
              scale * Math.sin(phase),
              scale * wave * Math.cos(phase),
              -scale * wave * wave * Math.sin(phase),
            ]
          : [
              scale * Math.cos(phase),
              -scale * wave * Math.sin(phase),
              -scale * wave * wave * Math.cos(phase),
            ];
      });
      const product = (orders) =>
        axisValues.reduce(
          (value, axis, i) => value * axis[orders[i]],
          amplitude,
        );
      basis.pressure[shellIndex] += product([0, 0, 0]);
      for (let a = 0; a < 3; a++) {
        const first = [0, 0, 0];
        first[a] = 1;
        const derivative = product(first);
        basis.pressureGradient[a][shellIndex] += derivative;
        basis.velocity[a][shellIndex] += derivative / k;
        for (let b = 0; b < 3; b++) {
          const second = [...first];
          second[b]++;
          basis.velocityGradient[a][b][shellIndex] += product(second) / k;
        }
      }
    }
  }
  return basis;
}

/**
 * Evaluate moments with a shell-folded basis, or unprojected unit-weight basis.
 * grad(phi)/k is spatial only; pressure/velocity timing is already integrated.
 */
export function referenceMomentField(observation, basis, contrast) {
  const count = basis.pressure.length;
  validateProbe(basis, count);
  finiteVector(observation.pressureMoments, count * count, "pressure moments");
  finiteVector(observation.velocityMoments, count * count, "velocity moments");
  const quadratic = (matrix, left, right) => {
    let result = 0;
    for (let m = 0; m < count; m++) {
      for (let n = 0; n < count; n++)
        result += left[m] * matrix[m * count + n] * right[n];
    }
    return result;
  };
  const pressureEnergy = quadratic(
    observation.pressureMoments,
    basis.pressure,
    basis.pressure,
  );
  const velocityEnergy = basis.velocity.reduce(
    (sum, axis) => sum + quadratic(observation.velocityMoments, axis, axis),
    0,
  );
  let normalizationEnergy = 0;
  for (let m = 0; m < count; m++) {
    normalizationEnergy +=
      (basis.normalizationWeights?.[m] ?? 1) *
      (observation.pressureMoments[m * count + m] +
        observation.velocityMoments[m * count + m]);
  }
  const gradient =
    basis.pressureGradient && basis.velocityGradient
      ? [0, 1, 2].map((axis) =>
          normalizationEnergy > 0
            ? (2 *
                contrast.pressureEnergyWeight *
                quadratic(
                  observation.pressureMoments,
                  basis.pressureGradient[axis],
                  basis.pressure,
                ) -
                2 *
                  contrast.velocityEnergyWeight *
                  basis.velocity.reduce(
                    (sum, component, a) =>
                      sum +
                      quadratic(
                        observation.velocityMoments,
                        basis.velocityGradient[a][axis],
                        component,
                      ),
                    0,
                  )) /
              normalizationEnergy
            : 0,
        )
      : null;
  return {
    pressureEnergy,
    velocityEnergy,
    normalizationEnergy,
    gradient,
    radiationPotential:
      normalizationEnergy > 0
        ? (contrast.pressureEnergyWeight * pressureEnergy -
            contrast.velocityEnergyWeight * velocityEnergy) /
          normalizationEnergy
        : 0,
  };
}
