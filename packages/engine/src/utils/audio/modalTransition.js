// Six entries encode F00,F01,F10,F11,B0,B1. Scaling/squaring avoids
// cancellation in B at low frequency and singular formulas at critical Q.
export function modalTransition(angular, damping, time) {
  const squarings = Math.max(
    0,
    Math.ceil(Math.log2(((2 * damping + angular) * time) / 0.5)),
  );
  const step = time / 2 ** squarings;
  const a = -damping * step;
  const b = -angular * step;
  const c = angular * step;
  const g = damping * step;
  let sum = [1, 0, 0, 1, 0, 0];
  let term = [a, b, c, 0, g, 0];
  for (let order = 1; order <= 32; order++) {
    for (let i = 0; i < 6; i++) sum[i] += term[i];
    if (Math.max(...term.map(Math.abs)) < 1e-18) break;
    const divisor = order + 1;
    term = [
      (a * term[0] + b * term[2]) / divisor,
      (a * term[1] + b * term[3]) / divisor,
      (c * term[0]) / divisor,
      (c * term[1]) / divisor,
      (a * term[4] + b * term[5]) / divisor,
      (c * term[4]) / divisor,
    ];
  }
  for (let i = 0; i < squarings; i++) {
    const [p, q, r, s, u, v] = sum;
    sum = [
      p * p + q * r,
      p * q + q * s,
      r * p + s * r,
      r * q + s * s,
      p * u + q * v + u,
      r * u + s * v + v,
    ];
  }
  return sum;
}
