import { createRaymarchVisualizationRuntime } from "./raymarchRuntime.js";
import { createFullscreenVolumeVisualizationRuntime } from "./fullscreenVolumeRuntime.js";
import {
  DEFAULT_VISUALIZATION_METHOD,
  normalizeVisualizationMethod,
  VISUALIZATION_METHODS,
} from "./types.js";

/**
 * @param {string} [method=DEFAULT_VISUALIZATION_METHOD]
 */
export function createVisualizationRuntime(
  method = DEFAULT_VISUALIZATION_METHOD,
) {
  const normalizedMethod = normalizeVisualizationMethod(method);

  if (normalizedMethod === VISUALIZATION_METHODS.fullscreenVolume) {
    return createFullscreenVolumeVisualizationRuntime();
  }

  return createRaymarchVisualizationRuntime();
}
