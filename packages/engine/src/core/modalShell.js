import { readModalTopologyMode } from "./modalTopology.js";

export const MODAL_RESPONSE_WAVENUMBER_SQUARED_EPSILON = 1e-8;

/**
 * Exact rectangular-cavity eigenvalue index.
 *
 * In the declared isotropic cube, natural frequency is proportional to
 * sqrt(u² + v² + w²). Families with the same integer sum therefore span one
 * degenerate eigenspace and must share one temporal oscillator.
 */
function getRectangularModeShellIndex(source) {
  const [u, v, w] = readModalTopologyMode(source).map((value) =>
    Math.max(0, Math.round(Math.abs(value))),
  );
  return u * u + v * v + w * w;
}

export function getRectangularModeShellKey(source) {
  return `rect:${getRectangularModeShellIndex(source)}`;
}

/**
 * Physical frequency carried by one modal-response oscillator.
 *
 * Zero or missing response metadata means the oscillator is evaluated at its
 * natural frequency. Keeping that fallback here prevents descriptor packing,
 * CPU reference evaluation, and GPU shell closure from assigning different
 * coherence identities to the same physical response.
 */
export function resolveModalResponseFrequencyHz(mode) {
  for (const candidate of [
    mode?.responseFrequencyHz,
    mode?.modalResponseDriveFrequencyHz,
    mode?.naturalFrequencyHz,
  ]) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return 0;
}

/** Position-invariant response wavenumber for one modal identity. */
export function resolveModalResponseWavenumber({ mode, scale = Math.PI }) {
  const u = mode?.u ?? 0;
  const v = mode?.v ?? 0;
  const w = mode?.w ?? 0;
  const naturalWavenumberSquared = Math.max(
    (scale * scale * (u * u + v * v + w * w)) / 4,
    MODAL_RESPONSE_WAVENUMBER_SQUARED_EPSILON,
  );
  const naturalFrequencyHz = Number.isFinite(mode?.naturalFrequencyHz)
    ? Math.max(0, mode.naturalFrequencyHz)
    : 0;
  const responseFrequencyHz = resolveModalResponseFrequencyHz(mode);
  const responseRatio =
    naturalFrequencyHz > 0 && responseFrequencyHz > 0
      ? responseFrequencyHz / naturalFrequencyHz
      : 1;
  return Math.max(
    Math.sqrt(naturalWavenumberSquared) * responseRatio,
    Math.sqrt(MODAL_RESPONSE_WAVENUMBER_SQUARED_EPSILON),
  );
}

/**
 * Reciprocal response wavenumber serialized by modal packet upload so field
 * observation does not rebuild mode/frequency math for every voxel.
 */
export function resolveModalResponseInverseWavenumber(options) {
  return 1 / resolveModalResponseWavenumber(options);
}

export function getRectangularResponseShellKey(mode) {
  return `${getRectangularModeShellKey(mode)}:${Math.fround(
    resolveModalResponseFrequencyHz(mode),
  )}`;
}

/**
 * Coherence identity of the physical harmonic response.
 *
 * Natural eigenvalue shells remain the oscillator/admission owner, but every
 * shell forced at the same response frequency belongs to one complex pressure
 * field and must interfere before pressure or velocity is squared.
 */
export function getModalResponseFrequencyKey(mode) {
  const responseFrequencyHz = resolveModalResponseFrequencyHz(mode);
  return responseFrequencyHz > 0
    ? `response:${Math.fround(responseFrequencyHz)}`
    : `response-unknown:${getRectangularModeShellKey(mode)}`;
}

export function getModalResponseModeKey(mode) {
  return (
    mode?.responseModeKey ?? mode?.modeKey ?? getRectangularModeShellKey(mode)
  );
}
