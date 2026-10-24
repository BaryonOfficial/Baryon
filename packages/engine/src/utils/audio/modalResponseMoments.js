/**
 * Exact continuous-time identity for an exponentially observed linear system:
 *   (A_i + lambda/2 I) C_ij + C_ij (A_j^T + lambda/2 I)
 *     = lambda mean(y_i y_j^T) - g_i W_j^T - W_i g_j^T,
 * where W_i = observation(x*y_i), y_i(0)=0 and C_ij(0)=0.
 *
 * Updating W costs O(channels*shells) per sample. Recover every dense pair at
 * publication; no source bands or interference terms are discarded. A singular
 * or ill-conditioned Sylvester operator cannot recover history this way.
 * Those pairs retain direct within-sample integrals instead.
 */
function pairInverse(wi, di, wj, dj, lambda) {
  const matrix = [
    [lambda - di - dj, -wj, -wi, 0],
    [wj, lambda - di, 0, -wi],
    [wi, 0, lambda - dj, -wj],
    [0, wi, wj, lambda],
  ];
  const norm = Math.max(
    ...matrix.map((row) => row.reduce((sum, v) => sum + Math.abs(v), 0)),
  );
  const rows = matrix.map((row, i) => [
    ...row,
    ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0)),
  ]);
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column]))
        pivot = row;
    }
    if (Math.abs(rows[pivot][column]) <= norm * Number.EPSILON) return null;
    [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    const divisor = rows[column][column];
    for (let j = 0; j < 8; j++) rows[column][j] /= divisor;
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const multiplier = rows[row][column];
      for (let j = 0; j < 8; j++) rows[row][j] -= multiplier * rows[column][j];
    }
  }
  const inverse = rows.flatMap((row) => row.slice(4));
  const inverseNorm = Math.max(
    ...rows.map((row) => row.slice(4).reduce((sum, v) => sum + Math.abs(v), 0)),
  );
  // A numerical conditioning threshold selects an equivalent integration
  // method, never an acoustic cutoff. Exact and near singular pairs keep
  // their own complete history. This bound limits roundoff amplification.
  return Number.isFinite(inverseNorm) && norm * inverseNorm <= 1e5
    ? new Float64Array(inverse)
    : null;
}

function directKernel(nodes, i, j, component) {
  const kernel = new Float64Array(9);
  const indices = component === 0 ? [0, 1, 4] : [2, 3, 5];
  for (const node of nodes) {
    const a = node.transitions[i];
    const b = node.transitions[j];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        kernel[3 * row + column] +=
          node.weight * a[indices[row]] * b[indices[column]];
      }
    }
  }
  return kernel;
}

function bilinear(kernel, pi, ri, pj, rj, input) {
  return (
    pi * (kernel[0] * pj + kernel[1] * rj + kernel[2] * input) +
    ri * (kernel[3] * pj + kernel[4] * rj + kernel[5] * input) +
    input * (kernel[6] * pj + kernel[7] * rj + kernel[8] * input)
  );
}

export function createModalResponseMoments({
  shells,
  channelCount,
  sampleRate,
  exposureSeconds,
  nodes,
}) {
  const count = shells.length;
  const lambda = 1 / exposureSeconds;
  const decay = Math.exp(-lambda / sampleRate);
  const angular = shells.map((shell) => 2 * Math.PI * shell.naturalFrequencyHz);
  const damping = shells.map((shell, i) => angular[i] / shell.qualityFactor);
  const inputPressure = new Float64Array(count);
  const inputVelocity = new Float64Array(count);
  const inputKernels = Array.from({ length: count }, (_, i) => {
    const kernel = new Float64Array(6);
    for (const node of nodes) {
      for (let k = 0; k < 6; k++)
        kernel[k] += node.weight * node.transitions[i][k];
    }
    return kernel;
  });
  const reconstructed = [];
  const direct = [];
  for (let i = 0; i < count; i++) {
    for (let j = i; j < count; j++) {
      const inverse = pairInverse(
        angular[i],
        damping[i],
        angular[j],
        damping[j],
        lambda,
      );
      if (inverse) reconstructed.push({ i, j, inverse });
      else
        direct.push({
          i,
          j,
          pressure: 0,
          velocity: 0,
          pressureKernel: directKernel(nodes, i, j, 0),
          velocityKernel: directKernel(nodes, i, j, 1),
        });
    }
  }
  return {
    advance(pressure, velocity, channels, sample) {
      for (let i = 0; i < count; i++) {
        inputPressure[i] *= decay;
        inputVelocity[i] *= decay;
      }
      for (const pair of direct) {
        pair.pressure *= decay;
        pair.velocity *= decay;
      }
      for (let a = 0; a < channelCount; a++) {
        const offset = a * count;
        const x = channels[a][sample];
        for (let i = 0; i < count; i++) {
          const k = inputKernels[i];
          const p = pressure[offset + i];
          const r = velocity[offset + i];
          inputPressure[i] += x * (k[0] * p + k[1] * r + k[4] * x);
          inputVelocity[i] += x * (k[2] * p + k[3] * r + k[5] * x);
        }
        for (const pair of direct) {
          const pi = pressure[offset + pair.i];
          const ri = velocity[offset + pair.i];
          const pj = pressure[offset + pair.j];
          const rj = velocity[offset + pair.j];
          pair.pressure += bilinear(pair.pressureKernel, pi, ri, pj, rj, x);
          pair.velocity += bilinear(pair.velocityKernel, pi, ri, pj, rj, x);
        }
      }
    },
    read(pressure, velocity) {
      const pressureMoments = new Float64Array(count * count);
      const velocityMoments = new Float64Array(count * count);
      for (const { i, j, inverse: k } of reconstructed) {
        let pp = 0,
          pr = 0,
          rp = 0,
          rr = 0;
        for (let a = 0; a < channelCount; a++) {
          const start = a * count;
          pp += (pressure[start + i] * pressure[start + j]) / channelCount;
          pr += (pressure[start + i] * velocity[start + j]) / channelCount;
          rp += (velocity[start + i] * pressure[start + j]) / channelCount;
          rr += (velocity[start + i] * velocity[start + j]) / channelCount;
        }
        const r0 =
          lambda * pp -
          damping[i] * inputPressure[j] -
          damping[j] * inputPressure[i];
        const r1 = lambda * pr - damping[i] * inputVelocity[j];
        const r2 = lambda * rp - damping[j] * inputVelocity[i];
        const r3 = lambda * rr;
        const p = k[0] * r0 + k[1] * r1 + k[2] * r2 + k[3] * r3;
        const v = k[12] * r0 + k[13] * r1 + k[14] * r2 + k[15] * r3;
        pressureMoments[i * count + j] = pressureMoments[j * count + i] = p;
        velocityMoments[i * count + j] = velocityMoments[j * count + i] = v;
      }
      for (const pair of direct) {
        pressureMoments[pair.i * count + pair.j] = pressureMoments[
          pair.j * count + pair.i
        ] = pair.pressure;
        velocityMoments[pair.i * count + pair.j] = velocityMoments[
          pair.j * count + pair.i
        ] = pair.velocity;
      }
      return {
        pressureMoments,
        velocityMoments,
        observationDiagnostics: {
          reconstructedPairs: reconstructed.length,
          directPairs: direct.length,
        },
      };
    },
  };
}
