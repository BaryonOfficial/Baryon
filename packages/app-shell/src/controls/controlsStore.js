import { deserializeControls } from "@baryon/visualizer/controls/persistence";
import {
  CONTROL_DEFINITIONS,
  createControlState,
} from "@baryon/visualizer/controls/schema";
import { BUILT_IN_VISUAL_PRESETS } from "@baryon/visualizer/controls/visualPresets";
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

const BUILT_IN_VISUAL_PRESET_NAMES = new Set(
  BUILT_IN_VISUAL_PRESETS.map((preset) => preset.name),
);

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
    presets: mergeSelectablePresets(presets),
    presetName,
    selectedPresetName,
  };
}

function mergeSelectablePresets(userPresets) {
  const selectableUserPresets = userPresets.filter(
    (preset) => !BUILT_IN_VISUAL_PRESET_NAMES.has(preset.name),
  );
  return [...BUILT_IN_VISUAL_PRESETS, ...selectableUserPresets];
}

function findPreset(userPresets, name) {
  return (
    BUILT_IN_VISUAL_PRESETS.find((preset) => preset.name === name) ??
    userPresets.find((preset) => preset.name === name) ??
    null
  );
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

      if (Object.is(controlsRef.current[key], value)) {
        return snapshot;
      }

      controlsRef.current[key] = value;
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
      if (BUILT_IN_VISUAL_PRESET_NAMES.has(state.presetName.trim())) {
        return snapshot;
      }

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

      const sourceControls = preset.builtIn
        ? {
            ...controlsRef.current,
            ...preset.controls,
          }
        : preset.controls;
      Object.assign(
        controlsRef.current,
        deserializeControls(sourceControls, CONTROL_DEFINITIONS),
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
      if (BUILT_IN_VISUAL_PRESET_NAMES.has(name)) {
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
