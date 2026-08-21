import {
  deserializeControls,
  isDefaultControlSettingValue,
} from "@baryon/engine/controls/persistence";
import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  createControlState,
} from "@baryon/engine/controls/schema";
import {
  PRESETS_KEY,
  createControlsPersistScheduler,
  createInitialControlsSettingsState,
  deletePresetFromCollection,
  loadStoredPresets,
  persistControls,
  savePresetCollection,
  writeStoredJson,
} from "../components/hooks/baryonControlsState.js";

function getBrowserStorage() {
  const browserWindow = globalThis.window;
  const browserDocument = browserWindow?.document;
  if (browserDocument == null) {
    return null;
  }
  const storageWindow = browserDocument.defaultView ?? browserWindow;
  if (
    globalThis.process?.versions?.node != null &&
    storageWindow === globalThis
  ) {
    const storageDescriptor = Object.getOwnPropertyDescriptor(
      storageWindow,
      "localStorage",
    );
    return storageDescriptor != null && "value" in storageDescriptor
      ? (storageDescriptor.value ?? null)
      : null;
  }

  try {
    return storageWindow.localStorage ?? null;
  } catch {
    return null;
  }
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
  if (!Object.is(controls[key], value)) {
    controls[key] = value;
    return true;
  }
  return false;
}

const LIVE_CONTROL_SETTING_KEYS = new Set(
  CONTROL_DEFINITIONS.filter(
    (definition) => definition.status === CONTROL_STATUSES.live,
  ).map((definition) => definition.key),
);

export function createControlsStore({ storage = getBrowserStorage() } = {}) {
  const initialSettingsState = createInitialControlsSettingsState(storage);
  const controlsRef = {
    current: initialSettingsState.controls,
  };
  let explicitSettingsKeys = new Set(initialSettingsState.explicitKeys);
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
    persist(nextSettings) {
      persistControls(
        storage,
        nextSettings.controls,
        nextSettings.explicitKeys,
      );
    },
  });

  function createSettingsPersistSnapshot() {
    return {
      controls: { ...controlsRef.current },
      explicitKeys: new Set(explicitSettingsKeys),
    };
  }

  function updateExplicitSettingsOwnership(key, value) {
    if (!LIVE_CONTROL_SETTING_KEYS.has(key)) {
      return false;
    }

    const hadExplicitOwnership = explicitSettingsKeys.has(key);
    if (isDefaultControlSettingValue(key, value, CONTROL_DEFINITIONS)) {
      explicitSettingsKeys.delete(key);
    } else {
      explicitSettingsKeys.add(key);
    }
    return hadExplicitOwnership !== explicitSettingsKeys.has(key);
  }

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

  function syncControls({
    persistMode = "debounced",
    clearPresetSelection = true,
  } = {}) {
    if (clearPresetSelection) {
      state.selectedPresetName = "";
    }
    if (persistMode === "none") {
      return emit();
    }
    const settingsPersistSnapshot = createSettingsPersistSnapshot();
    if (persistMode === "immediate") {
      persistScheduler.flush(settingsPersistSnapshot);
    } else {
      persistScheduler.schedule(settingsPersistSnapshot);
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

      const persistMode = options?.persistMode ?? "debounced";
      const ownershipChanged =
        persistMode === "none"
          ? false
          : updateExplicitSettingsOwnership(key, value);
      const activeControlsChanged = applyControlUpdate(
        controlsRef.current,
        key,
        value,
      );

      if (!activeControlsChanged && !ownershipChanged) {
        return snapshot;
      }
      return syncControls(options);
    },
    resetControls() {
      const defaults = createControlState();
      Object.assign(controlsRef.current, defaults);
      explicitSettingsKeys = new Set();
      return syncControls({ persistMode: "immediate" });
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
      explicitSettingsKeys = new Set(LIVE_CONTROL_SETTING_KEYS);
      state.selectedPresetName = name;
      return syncControls({
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
      persistScheduler.flushPending();
      listeners.clear();
    },
  };
  return store;
}
