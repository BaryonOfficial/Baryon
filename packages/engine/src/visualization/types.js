export const VISUALIZATION_METHODS = Object.freeze({
  raymarch: "raymarch",
});

export const DEFAULT_VISUALIZATION_METHOD = VISUALIZATION_METHODS.raymarch;

/**
 * @param {unknown} method
 * @returns {method is typeof VISUALIZATION_METHODS.raymarch}
 */
export function isVisualizationMethod(method) {
  return method === VISUALIZATION_METHODS.raymarch;
}

/**
 * Collapses any persisted/legacy value (including the removed fullscreen-volume
 * and cymatics-2d ids) onto the single supported method.
 *
 * @param {unknown} method
 * @returns {typeof VISUALIZATION_METHODS[keyof typeof VISUALIZATION_METHODS]}
 */
export function normalizeVisualizationMethod(method) {
  return isVisualizationMethod(method) ? method : DEFAULT_VISUALIZATION_METHOD;
}
