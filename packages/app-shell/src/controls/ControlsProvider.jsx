import React, { useEffect } from "react";
import { DEVTOOLS_ENABLED } from "../devtools/config.js";
import {
  markBaryonTestControlsReady,
  resetBaryonTestReady,
} from "../devtools/testReady.js";
import { ControlsContext } from "./ControlsContext.js";
const EXTERNAL_CONTROL_COMMAND_EVENT = "__baryon-controls-command";

function emitControlsChanged(controlsState) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("__baryon-controls-change", {
      detail: { ...controlsState },
    }),
  );
}

function normalizeControlPersistMode(value) {
  if (value === "debounced" || value === "none") {
    return value;
  }
  return "immediate";
}

function ControlsEventBridge({ store }) {
  useEffect(() => {
    emitControlsChanged(store.getSnapshot().controlsState);

    const unsubscribe = store.subscribe(() => {
      emitControlsChanged(store.getSnapshot().controlsState);
    });

    const handleExternalControlCommand = (event) => {
      const key = event?.detail?.key;
      if (typeof key !== "string" || !(key in store.controlsRef.current)) {
        return;
      }

      const persistMode = normalizeControlPersistMode(
        event?.detail?.persistMode,
      );
      store.updateControl(key, event.detail.value, { persistMode });
    };

    window.addEventListener(
      EXTERNAL_CONTROL_COMMAND_EVENT,
      handleExternalControlCommand,
    );

    return () => {
      unsubscribe();
      window.removeEventListener(
        EXTERNAL_CONTROL_COMMAND_EVENT,
        handleExternalControlCommand,
      );
    };
  }, [store]);

  return null;
}

function ControlsDevtoolsBridge({ store }) {
  useEffect(() => {
    if (!DEVTOOLS_ENABLED || typeof window === "undefined") {
      return undefined;
    }

    window.__baryonControls = {
      getState() {
        return { ...store.controlsRef.current };
      },
      setControl(key, value) {
        store.updateControl(key, value, { persistMode: "immediate" });
        return { ...store.controlsRef.current };
      },
    };
    markBaryonTestControlsReady();

    return () => {
      delete window.__baryonControls;
      resetBaryonTestReady();
    };
  }, [store]);

  return null;
}

export function ControlsProvider({ children, store }) {
  return (
    <ControlsContext.Provider value={store}>
      <ControlsEventBridge store={store} />
      <ControlsDevtoolsBridge store={store} />
      {children}
    </ControlsContext.Provider>
  );
}
