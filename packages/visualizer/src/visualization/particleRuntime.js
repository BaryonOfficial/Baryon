import { setupTSL, tickTSL, disposeTSL } from "../core/tslSetup.js";
import { VISUALIZATION_METHODS } from "./types.js";

export function createParticleVisualizationRuntime() {
  return {
    method: VISUALIZATION_METHODS.particle,
    setup({ baryonGeometry, parameters, audioConfig }) {
      return setupTSL(baryonGeometry, parameters, audioConfig);
    },
    tick({ renderer, runtimeState, featureFrame, time, deltaTime }) {
      tickTSL(renderer, runtimeState, featureFrame, time, deltaTime);
    },
    dispose(runtimeState) {
      disposeTSL(runtimeState);
    },
  };
}
