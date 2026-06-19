import { createRaymarchVisualizationRuntime } from "./raymarchRuntime.js";
import { DEFAULT_VISUALIZATION_METHOD } from "./types.js";

/**
 * @param {string} [method=DEFAULT_VISUALIZATION_METHOD]
 */
export function createVisualizationRuntime(
  method = DEFAULT_VISUALIZATION_METHOD,
) {
  void method;
  return createRaymarchVisualizationRuntime();
}
