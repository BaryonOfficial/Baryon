/** @typedef {"rectangular" | "spherical"} CavityGeometry */

const CAVITY_GEOMETRIES = Object.freeze({
  rectangular: "rectangular",
  spherical: "spherical",
});

export const DEFAULT_REQUESTED_CAVITY_GEOMETRY = CAVITY_GEOMETRIES.rectangular;
export const DEFAULT_EFFECTIVE_CAVITY_GEOMETRY = CAVITY_GEOMETRIES.rectangular;

/**
 * @param {unknown} value
 * @returns {CavityGeometry}
 */
export function normalizeCavityGeometry(value) {
  return value === CAVITY_GEOMETRIES.spherical
    ? CAVITY_GEOMETRIES.spherical
    : CAVITY_GEOMETRIES.rectangular;
}

/**
 * The requested geometry is already threaded through the pipeline for
 * diagnostics and future backend work, but today the effective solver stays
 * rectangular.
 *
 * @param {CavityGeometry} [_requestedGeometry]
 * @returns {CavityGeometry}
 */
export function resolveEffectiveCavityGeometry(_requestedGeometry) {
  void _requestedGeometry;
  return DEFAULT_EFFECTIVE_CAVITY_GEOMETRY;
}
