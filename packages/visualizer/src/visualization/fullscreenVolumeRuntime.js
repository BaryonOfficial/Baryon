import {
  setupRaymarch,
  tickRaymarch,
  disposeRaymarch,
} from "../core/raymarchSetup.js";
import { VOLUME_BOUNDS_MODES } from "../core/raymarch/volumeBounds.js";
import { VISUALIZATION_METHODS } from "./types.js";

export function createFullscreenVolumeVisualizationRuntime() {
  return {
    method: VISUALIZATION_METHODS.fullscreenVolume,
    setup({ baryonGeometry, parameters, audioConfig }) {
      return setupRaymarch(baryonGeometry, parameters, audioConfig, {
        method: VISUALIZATION_METHODS.fullscreenVolume,
        volumeBounds: VOLUME_BOUNDS_MODES.fullscreenBox,
      });
    },
    tick({ renderer, runtimeState, featureFrame, time, deltaTime }) {
      tickRaymarch(renderer, runtimeState, featureFrame, time, deltaTime);
    },
    dispose(runtimeState) {
      disposeRaymarch(runtimeState);
    },
  };
}
