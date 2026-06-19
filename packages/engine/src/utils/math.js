// Shared scalar math helpers for the engine's CPU-side analysis and transfer
// code. These were previously duplicated per module, which let edge-case
// semantics drift (NaN handling, degenerate smoothstep edges). This module is
// the single owner of those semantics:
//
// - `clamp` and `clamp01` fail closed: non-finite input clamps to `min`
//   (0 for `clamp01`), matching the engine-wide convention that invalid
//   evidence carries no authority.
// - `smoothstep` degenerates to a step at `edge1` when the edges are equal
//   (or inverted, which no call site uses).
//
// TSL/shader code uses the `three/tsl` node equivalents, not these.

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 >= edge1) {
    return value < edge1 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function mix(a, b, t) {
  return a * (1 - t) + b * t;
}
