export const LEGACY_CYMATICS_2D_METHOD = "cymatics-2d";

export const VISUALIZATION_METHODS = Object.freeze({
  raymarch: "raymarch",
  fullscreenVolume: "fullscreen-volume",
});

export const DEFAULT_VISUALIZATION_METHOD = VISUALIZATION_METHODS.raymarch;

/**
 * @param {unknown} method
 * @returns {method is typeof VISUALIZATION_METHODS.raymarch | typeof VISUALIZATION_METHODS.fullscreenVolume}
 */
export function isVisualizationMethod(method) {
  return (
    method === VISUALIZATION_METHODS.raymarch ||
    method === VISUALIZATION_METHODS.fullscreenVolume
  );
}

/**
 * Both visualization methods share the raymarch volume pipeline
 * (performance governor, adaptive steps, HUD diagnostics).
 *
 * @param {unknown} method
 * @returns {boolean}
 */
export function usesRaymarchVolumePipeline(method) {
  return isVisualizationMethod(method);
}

/**
 * @param {unknown} method
 * @returns {typeof VISUALIZATION_METHODS[keyof typeof VISUALIZATION_METHODS]}
 */
export function normalizeVisualizationMethod(method) {
  if (method === LEGACY_CYMATICS_2D_METHOD) {
    return VISUALIZATION_METHODS.fullscreenVolume;
  }
  if (isVisualizationMethod(method)) {
    return method;
  }
  return DEFAULT_VISUALIZATION_METHOD;
}
