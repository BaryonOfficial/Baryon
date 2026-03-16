export const VISUALIZATION_METHODS = Object.freeze({
  raymarch: "raymarch",
  cymatics2d: "cymatics-2d",
});

export const DEFAULT_VISUALIZATION_METHOD = VISUALIZATION_METHODS.raymarch;

export function isVisualizationMethod(method) {
  return Object.values(VISUALIZATION_METHODS).includes(method);
}
