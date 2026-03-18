import { useCallback, useEffect, useRef, useState } from "react";
import { deserializeControls } from "@baryon/visualizer/controls/persistence";
import {
  CONTROL_DEFINITIONS,
  createControlState,
} from "@baryon/visualizer/controls/schema";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
import {
  markBaryonTestControlsReady,
  resetBaryonTestReady,
} from "../../devtools/testReady.js";
import {
  PRESETS_KEY,
  createControlsPersistScheduler,
  createInitialControlState,
  deletePresetFromCollection,
  getVisibleControlGroups,
  loadStoredPresets,
  persistControls,
  savePresetCollection,
  writeStoredJson,
} from "./baryonControlsState.js";

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function emitControlsChanged(state) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("__baryon-controls-change", {
      detail: { ...state },
    }),
  );
}

export function useBaryonControls() {
  const storage = getBrowserStorage();
  const controlsRef = useRef(createInitialControlState(storage));
  const persistSchedulerRef = useRef(null);
  const [controlsState, setControlsState] = useState(() => ({
    ...controlsRef.current,
  }));
  const [presets, setPresets] = useState(() => loadStoredPresets(storage));
  const [presetName, setPresetName] = useState("");
  const [selectedPresetName, setSelectedPresetName] = useState("");
  const [isControlsPanelLoaded, setIsControlsPanelLoaded] = useState(false);
  const [isControlsPanelOpen, setIsControlsPanelOpen] = useState(false);

  if (!persistSchedulerRef.current) {
    persistSchedulerRef.current = createControlsPersistScheduler({
      persist(nextControls) {
        persistControls(storage, nextControls);
      },
    });
  }

  const persistScheduler = persistSchedulerRef.current;
  const controlGroups = getVisibleControlGroups({
    devtoolsEnabled: DEVTOOLS_ENABLED,
    method: controlsState.visualizationMethod ?? DEFAULT_VISUALIZATION_METHOD,
  });

  const syncControlState = useCallback(
    (
      nextControls,
      { persistMode = "debounced", clearPresetSelection = true } = {},
    ) => {
      const snapshot = { ...nextControls };
      setControlsState(snapshot);
      if (clearPresetSelection) {
        setSelectedPresetName("");
      }
      emitControlsChanged(snapshot);
      if (persistMode === "immediate") {
        persistScheduler.flush(nextControls);
      } else {
        persistScheduler.schedule(nextControls);
      }
    },
    [persistScheduler],
  );

  const updateControl = useCallback(
    (key, value, options) => {
      if (!(key in controlsRef.current)) {
        throw new Error(`[Baryon controls] Unknown control key: ${key}`);
      }

      if (Object.is(controlsRef.current[key], value)) {
        return;
      }

      controlsRef.current[key] = value;
      syncControlState(controlsRef.current, options);
    },
    [syncControlState],
  );

  const resetControls = useCallback(() => {
    const defaults = createControlState();
    Object.assign(controlsRef.current, defaults);
    syncControlState(controlsRef.current, { persistMode: "immediate" });
  }, [syncControlState]);

  const savePreset = useCallback(() => {
    const nextPresets = savePresetCollection(
      presets,
      presetName,
      controlsRef.current,
    );

    if (nextPresets === presets) {
      return;
    }

    writeStoredJson(storage, PRESETS_KEY, nextPresets);
    setPresets(nextPresets);
    setSelectedPresetName(presetName.trim());
    setPresetName("");
  }, [presetName, presets, storage]);

  const loadPreset = useCallback(
    (name) => {
      const preset = presets.find((entry) => entry.name === name);
      if (!preset) {
        return;
      }

      Object.assign(
        controlsRef.current,
        deserializeControls(preset.controls, CONTROL_DEFINITIONS),
      );
      setSelectedPresetName(name);
      syncControlState(controlsRef.current, {
        persistMode: "immediate",
        clearPresetSelection: false,
      });
    },
    [presets, syncControlState],
  );

  const deletePreset = useCallback(
    (name = selectedPresetName) => {
      if (!name) {
        return;
      }

      const nextPresets = deletePresetFromCollection(presets, name);
      writeStoredJson(storage, PRESETS_KEY, nextPresets);
      setPresets(nextPresets);
      if (selectedPresetName === name) {
        setSelectedPresetName("");
      }
    },
    [presets, selectedPresetName, storage],
  );

  const openControlsPanel = useCallback(() => {
    setIsControlsPanelLoaded(true);
    setIsControlsPanelOpen(true);
  }, []);

  const closeControlsPanel = useCallback(() => {
    setIsControlsPanelOpen(false);
  }, []);

  const toggleControlsPanel = useCallback(() => {
    setIsControlsPanelLoaded(true);
    setIsControlsPanelOpen((current) => !current);
  }, []);

  useEffect(() => {
    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      window.__baryonControls = {
        getState() {
          return { ...controlsRef.current };
        },
        setControl(key, value) {
          updateControl(key, value, { persistMode: "immediate" });
          return { ...controlsRef.current };
        },
      };
      markBaryonTestControlsReady();
    }

    emitControlsChanged(controlsRef.current);

    return () => {
      persistScheduler.cancel();
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonControls;
      }
      resetBaryonTestReady();
    };
  }, [persistScheduler, updateControl]);

  return {
    controlsRef,
    controlsState,
    controlGroups,
    presets,
    presetName,
    selectedPresetName,
    isControlsPanelLoaded,
    isControlsPanelOpen,
    setPresetName,
    updateControl,
    resetControls,
    savePreset,
    loadPreset,
    deletePreset,
    openControlsPanel,
    closeControlsPanel,
    toggleControlsPanel,
  };
}
