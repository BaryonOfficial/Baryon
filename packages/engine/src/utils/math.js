// Shared scalar math helpers for the engine's CPU-side analysis and transfer
// code. These were previously duplicated per module, which let edge-case
// semantics drift (including non-finite input handling). This module is
// the single owner of those semantics:
//
// - `clamp` and `clamp01` fail closed: non-finite input clamps to `min`
//   (0 for `clamp01`), matching the engine-wide convention that invalid
//   evidence carries no authority.
// - `damp` is a frame-rate-independent exponential approach whose smoothing
//   rate and time step both fail closed at zero.
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

export function damp(current, target, smoothing, deltaTime) {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
  return current + (target - current) * factor;
}
