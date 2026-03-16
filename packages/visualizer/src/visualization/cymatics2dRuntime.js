import {
  setupCymatics2d,
  tickCymatics2d,
  disposeCymatics2d,
} from "../core/cymatics2dSetup.js";
import { VISUALIZATION_METHODS } from "./types.js";

export function createCymatics2dVisualizationRuntime() {
  return {
    method: VISUALIZATION_METHODS.cymatics2d,
    setup({ baryonGeometry, parameters, audioConfig }) {
      return setupCymatics2d(baryonGeometry, parameters, audioConfig);
    },
    tick({ renderer, runtimeState, featureFrame, time, deltaTime }) {
      tickCymatics2d(renderer, runtimeState, featureFrame, time, deltaTime);
    },
    dispose(runtimeState) {
      disposeCymatics2d(runtimeState);
    },
  };
}
