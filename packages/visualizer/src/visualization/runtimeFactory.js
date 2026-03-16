import { createRaymarchVisualizationRuntime } from "./raymarchRuntime.js";
import { createCymatics2dVisualizationRuntime } from "./cymatics2dRuntime.js";
import { DEFAULT_VISUALIZATION_METHOD } from "./types.js";
import { VISUALIZATION_METHODS } from "./types.js";

/**
 * @param {string} [method=DEFAULT_VISUALIZATION_METHOD]
 */
export function createVisualizationRuntime(
  method = DEFAULT_VISUALIZATION_METHOD,
) {
  if (method === VISUALIZATION_METHODS.cymatics2d) {
    return createCymatics2dVisualizationRuntime();
  }

  return createRaymarchVisualizationRuntime();
}
