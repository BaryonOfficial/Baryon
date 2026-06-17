import {
  setupRaymarch,
  tickRaymarch,
  disposeRaymarch,
} from "../core/raymarchSetup.js";
import { VISUALIZATION_METHODS } from "./types.js";

export function createRaymarchVisualizationRuntime() {
  return {
    method: VISUALIZATION_METHODS.raymarch,
    setup({ baryonGeometry, parameters, audioConfig }) {
      return setupRaymarch(baryonGeometry, parameters, audioConfig);
    },
    tick({ renderer, runtimeState, featureFrame, time, deltaTime }) {
      tickRaymarch(renderer, runtimeState, featureFrame, time, deltaTime);
    },
    dispose(runtimeState) {
      disposeRaymarch(runtimeState);
    },
  };
}
