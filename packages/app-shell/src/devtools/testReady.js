import { DEVTOOLS_ENABLED } from "./config.js";

const baryonTestReadyState = {
  controlsReady: false,
  runtimeReady: false,
};

function syncBaryonTestReadyFlag() {
  if (!DEVTOOLS_ENABLED || typeof window === "undefined") {
    return;
  }

  window.__baryonTestReady =
    baryonTestReadyState.controlsReady && baryonTestReadyState.runtimeReady;
}

export function markBaryonTestControlsReady() {
  if (!DEVTOOLS_ENABLED || baryonTestReadyState.controlsReady) {
    return;
  }

  baryonTestReadyState.controlsReady = true;
  syncBaryonTestReadyFlag();
}

export function markBaryonTestRuntimeReady() {
  if (!DEVTOOLS_ENABLED || baryonTestReadyState.runtimeReady) {
    return;
  }

  baryonTestReadyState.runtimeReady = true;
  syncBaryonTestReadyFlag();
}

export function resetBaryonTestReady() {
  baryonTestReadyState.controlsReady = false;
  baryonTestReadyState.runtimeReady = false;

  if (!DEVTOOLS_ENABLED || typeof window === "undefined") {
    return;
  }

  delete window.__baryonTestReady;
}
