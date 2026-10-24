/**
 * Float64 expansion of a finite response window, for qualification only.
 * Solve the two complex state equations directly, then apply the five shifted
 * Blackman terms. The GPU uses precomputed resolvents, not these helpers.
 * Independent time integration + direct field DFT provides the separate
 * physical/numerical oracle; this reference isolates GPU roundoff.
 */
export function expandBroadbandSpectralWindow(frame) {
  const {
    frameSize: size,
    shellCount,
    channelCount,
    transitions,
    inputSpectrum,
    boundaryDelta,
  } = frame;
  const bins = size / 2 + 1;
  /** @type {(a: number[], b: number[]) => number[]} */
  const multiply = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  /** @type {(a: number[], b: number[]) => number[]} */
  const add = ([a, b], [c, d]) => [a + c, b + d];
  /** @type {(a: number[], s: number) => number[]} */
  const scale = ([a, b], s) => [a * s, b * s];
  /** @type {(a: number[], b: number[]) => number[]} */
  const divide = ([a, b], [c, d]) => {
    const norm = c * c + d * d;
    if (!(norm > 0)) throw new RangeError("singular reference resolvent");
    return [(a * c + b * d) / norm, (b * c - a * d) / norm];
  };
  const coefficients = new Float64Array(4 * shellCount * channelCount * bins);
  const rectangular = new Float64Array(4 * bins);
  let windowEnergy = 0;
  for (let n = 0; n < size; n++) {
    const t = (2 * Math.PI * n) / size;
    windowEnergy += (0.42 - 0.5 * Math.cos(t) + 0.08 * Math.cos(2 * t)) ** 2;
  }
  for (let a = 0; a < channelCount; a++)
    for (let m = 0; m < shellCount; m++) {
      const [f00, f01, f10, f11, b0, b1] = transitions.slice(6 * m, 6 * m + 6);
      const row = a * shellCount + m;
      for (let b = 0; b < bins; b++) {
        const angle = (2 * Math.PI * b) / size;
        const z = [
          Math.cos(angle),
          b === 0 || b === size / 2 ? 0 : Math.sin(angle),
        ];
        const x = [
          inputSpectrum[2 * (a * bins + b)],
          inputSpectrum[2 * (a * bins + b) + 1],
        ];
        const p = add(scale(x, b0), scale(z, -boundaryDelta[2 * row]));
        const v = add(scale(x, b1), scale(z, -boundaryDelta[2 * row + 1]));
        const u = [z[0] - f00, z[1]],
          w = [z[0] - f11, z[1]];
        const determinant = add(multiply(u, w), [-f01 * f10, 0]);
        rectangular.set(
          [
            ...divide(add(multiply(w, p), scale(v, f01)), determinant),
            ...divide(add(multiply(u, v), scale(p, f10)), determinant),
          ],
          4 * b,
        );
      }
      for (let b = 1; b < bins; b++) {
        const factor = Math.sqrt(
          (b === size / 2 ? 1 : 2) / (channelCount * size * windowEnergy),
        );
        for (let lane = 0; lane < 4; lane++) {
          let value = 0;
          for (let shift = -2; shift <= 2; shift++) {
            const wrapped = (b + shift + size) % size;
            const folded = Math.min(wrapped, size - wrapped);
            const sign = wrapped > size / 2 && lane % 2 === 1 ? -1 : 1;
            const weight =
              shift === 0 ? 0.42 : Math.abs(shift) === 1 ? -0.25 : 0.04;
            value += weight * sign * rectangular[4 * folded + lane];
          }
          coefficients[4 * (row * bins + b) + lane] = factor * value;
        }
      }
    }
  return { ...frame, coefficients };
}
