import { createParticleVisualizationRuntime } from "./particleRuntime.js";
import {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "./types.js";

/**
 * @param {string} [method=DEFAULT_VISUALIZATION_METHOD]
 */
export function createVisualizationRuntime(method = DEFAULT_VISUALIZATION_METHOD) {
  if (method === VISUALIZATION_METHODS.raymarch) {
    throw new Error(
      "[visualization] Raymarch runtime is scaffolded but not implemented yet."
    );
  }

  return createParticleVisualizationRuntime();
}
