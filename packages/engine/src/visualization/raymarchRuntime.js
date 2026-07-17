import {
  setupRaymarch,
  tickRaymarch,
  failClosedRaymarch,
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
    failClosed({ renderer, runtimeState, status, time, deltaTime }) {
      failClosedRaymarch(runtimeState, {
        renderer,
        status,
        time,
        deltaTime,
      });
    },
    dispose(runtimeState) {
      disposeRaymarch(runtimeState);
    },
  };
}
