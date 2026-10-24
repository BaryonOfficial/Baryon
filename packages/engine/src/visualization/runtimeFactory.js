import {
  setupRaymarch,
  tickRaymarch,
  prepareRaymarch,
  failClosedRaymarch,
  disposeRaymarch,
} from "../core/raymarchSetup.js";
import {
  queueRaymarchObservation,
  revokeRaymarchObservationHistory,
} from "../core/raymarch/runtime.js";
import { VISUALIZATION_METHODS } from "./types.js";

export function createVisualizationRuntime() {
  return {
    method: VISUALIZATION_METHODS.raymarch,
    setup({ baryonGeometry, parameters }) {
      return setupRaymarch(baryonGeometry, parameters);
    },
    enqueueObservation({ runtimeState, model }) {
      return queueRaymarchObservation(runtimeState, model);
    },
    revokeObservations({ runtimeState }) {
      revokeRaymarchObservationHistory(runtimeState);
    },
    invalidatePresentation({ runtimeState, error }) {
      runtimeState.presentationFailure =
        error instanceof Error ? error.message : String(error);
      runtimeState.volumeMesh.visible = false;
    },
    // The renderer is required again: the modal field cache is filled by a
    // render pass inside the tick, between the packet upload that feeds it and
    // the frame that reads it.
    tick({ renderer, runtimeState, featureFrame, time, deltaTime }) {
      tickRaymarch(runtimeState, featureFrame, time, deltaTime, renderer);
    },
    prepare({
      renderer,
      scene,
      camera,
      runtimeState,
      featureFrame,
      outputTarget = null,
      outputMrt = null,
    }) {
      return prepareRaymarch(runtimeState, featureFrame, renderer, {
        scene,
        camera,
        outputTarget,
        outputMrt,
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
