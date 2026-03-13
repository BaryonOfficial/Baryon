export const VISUALIZATION_METHODS = Object.freeze({
  raymarch: "raymarch",
});

export const DEFAULT_VISUALIZATION_METHOD = VISUALIZATION_METHODS.raymarch;

export function isVisualizationMethod(method) {
  return method === VISUALIZATION_METHODS.raymarch;
}
