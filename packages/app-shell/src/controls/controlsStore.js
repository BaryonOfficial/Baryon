import {
  deserializeControls,
  normalizeSpectralLightActivationControls,
} from "@baryon/visualizer/controls/persistence";
import {
  CONTROL_DEFINITIONS,
  createControlState,
} from "@baryon/visualizer/controls/schema";
import {
  PRESETS_KEY,
  createControlsPersistScheduler,
  createInitialControlState,
  deletePresetFromCollection,
  loadStoredPresets,
  persistControls,
  savePresetCollection,
  writeStoredJson,
} from "../components/hooks/baryonControlsState.js";

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function createSnapshot({
  controlsRef,
  presets,
  presetName,
  selectedPresetName,
}) {
  return {
    controlsState: { ...controlsRef.current },
    presets,
    presetName,
    selectedPresetName,
  };
}

function findPreset(userPresets, name) {
  return userPresets.find((preset) => preset.name === name) ?? null;
}

function applyControlUpdate(controls, key, value) {
  let changed = false;
  if (!Object.is(controls[key], value)) {
    controls[key] = value;
    changed = true;
  }

  const normalizedControls = normalizeSpectralLightActivationControls(
    controls,
    CONTROL_DEFINITIONS,
  );
  if (normalizedControls !== controls) {
    Object.assign(controls, normalizedControls);
    changed = true;
  }

  return changed;
}

export function createControlsStore({ storage = getBrowserStorage() } = {}) {
  const controlsRef = {
    current: createInitialControlState(storage),
  };
  const listeners = new Set();
  const state = {
    presets: loadStoredPresets(storage),
    presetName: "",
    selectedPresetName: "",
  };
  let snapshot = createSnapshot({
    controlsRef,
    presets: state.presets,
    presetName: state.presetName,
    selectedPresetName: state.selectedPresetName,
  });

  const persistScheduler = createControlsPersistScheduler({
    persist(nextControls) {
      persistControls(storage, nextControls);
    },
  });

  function emit() {
    snapshot = createSnapshot({
      controlsRef,
      presets: state.presets,
      presetName: state.presetName,
      selectedPresetName: state.selectedPresetName,
    });
    for (const listener of listeners) {
      listener();
    }
    return snapshot;
  }

  function syncControls(
    nextControls,
    { persistMode = "debounced", clearPresetSelection = true } = {},
  ) {
    if (clearPresetSelection) {
      state.selectedPresetName = "";
    }
    if (persistMode === "none") {
      return emit();
    }
    if (persistMode === "immediate") {
      persistScheduler.flush(nextControls);
    } else {
      persistScheduler.schedule(nextControls);
    }
    return emit();
  }

  const store = {
    controlsRef,
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateControl(key, value, options) {
      if (!(key in controlsRef.current)) {
        throw new Error(`[Baryon controls] Unknown control key: ${key}`);
      }

      if (!applyControlUpdate(controlsRef.current, key, value)) {
        return snapshot;
      }
      return syncControls(controlsRef.current, options);
    },
    resetControls() {
      const defaults = createControlState();
      Object.assign(controlsRef.current, defaults);
      return syncControls(controlsRef.current, { persistMode: "immediate" });
    },
    setPresetName(name) {
      const nextPresetName = typeof name === "string" ? name : "";
      if (state.presetName === nextPresetName) {
        return snapshot;
      }
      state.presetName = nextPresetName;
      return emit();
    },
    savePreset() {
      const nextPresets = savePresetCollection(
        state.presets,
        state.presetName,
        controlsRef.current,
      );

      if (nextPresets === state.presets) {
        return snapshot;
      }

      writeStoredJson(storage, PRESETS_KEY, nextPresets);
      state.presets = nextPresets;
      state.selectedPresetName = state.presetName.trim();
      state.presetName = "";
      return emit();
    },
    loadPreset(name) {
      const preset = findPreset(state.presets, name);
      if (!preset) {
        return snapshot;
      }

      Object.assign(
        controlsRef.current,
        deserializeControls(preset.controls, CONTROL_DEFINITIONS),
      );
      state.selectedPresetName = name;
      return syncControls(controlsRef.current, {
        persistMode: "immediate",
        clearPresetSelection: false,
      });
    },
    deletePreset(name = state.selectedPresetName) {
      if (!name) {
        return snapshot;
      }

      const nextPresets = deletePresetFromCollection(state.presets, name);
      writeStoredJson(storage, PRESETS_KEY, nextPresets);
      state.presets = nextPresets;
      if (state.selectedPresetName === name) {
        state.selectedPresetName = "";
      }
      return emit();
    },
    dispose() {
      persistScheduler.cancel();
      listeners.clear();
    },
  };
  return store;
}
