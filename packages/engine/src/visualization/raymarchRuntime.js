import {
  setupRaymarch,
  tickRaymarch,
  prepareRaymarch,
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
    // The renderer is required again: the modal field cache is filled by a
    // render pass inside the tick, between the packet upload that feeds it and
    // the frame that reads it.
    tick({ renderer, runtimeState, featureFrame, time, deltaTime }) {
      tickRaymarch(runtimeState, featureFrame, time, deltaTime, renderer);
    },
    prepare({ renderer, scene, camera, runtimeState, featureFrame }) {
      return prepareRaymarch(runtimeState, featureFrame, renderer, {
        scene,
        camera,
      });
    },
    failClosed({ runtimeState, status, time, deltaTime }) {
      failClosedRaymarch(runtimeState, {
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
