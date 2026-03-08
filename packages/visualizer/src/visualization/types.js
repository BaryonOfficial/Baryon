export const VISUALIZATION_METHODS = Object.freeze({
  particle: "particle",
  raymarch: "raymarch",
});

export const DEFAULT_VISUALIZATION_METHOD = VISUALIZATION_METHODS.particle;

export function isVisualizationMethod(method) {
  return Object.values(VISUALIZATION_METHODS).includes(method);
}
