import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  createControlState,
  getControlFolders,
  getControlsForFolder,
} from "@baryon/visualizer/controls/schema";
import {
  deserializeControls,
  serializeControls,
} from "@baryon/visualizer/controls/persistence";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";

export const SETTINGS_KEY = "baryon:settings";
export const PRESETS_KEY = "baryon:presets";
export const CONTROLS_PERSIST_DELAY_MS = 500;

export function readStoredJson(storage, key) {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredJson(storage, key, value) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-browsing restriction — silently ignore.
  }
}

export function createInitialControlState(storage) {
  const controls = createControlState();
  const savedSettings = readStoredJson(storage, SETTINGS_KEY);

  if (!savedSettings) {
    return controls;
  }

  Object.assign(
    controls,
    deserializeControls(savedSettings, CONTROL_DEFINITIONS),
  );
  return controls;
}

export function loadStoredPresets(storage) {
  const presets = readStoredJson(storage, PRESETS_KEY);
  return Array.isArray(presets) ? presets : [];
}

export function getVisibleControlGroups({
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
}) {
  return getControlFolders(method)
    .map((title) => {
      const controls = getControlsForFolder(title, method).filter(
        (definition) =>
          devtoolsEnabled || definition.status !== CONTROL_STATUSES.debugOnly,
      );

      if (controls.length === 0) {
        return null;
      }

      return {
        title,
        expanded: controls[0]?.groupExpanded ?? false,
        controls,
      };
    })
    .filter(Boolean);
}

export function persistControls(storage, controls) {
  const existingSettings = readStoredJson(storage, SETTINGS_KEY);
  const serializedControls = serializeControls(controls, CONTROL_DEFINITIONS);
  const knownControlKeys = new Set(
    CONTROL_DEFINITIONS.map((definition) => definition.key),
  );
  const persistedExtras =
    existingSettings && typeof existingSettings === "object"
      ? Object.fromEntries(
          Object.entries(existingSettings).filter(
            ([key]) => !knownControlKeys.has(key),
          ),
        )
      : {};

  writeStoredJson(storage, SETTINGS_KEY, {
    ...persistedExtras,
    ...serializedControls,
  });
}

export function savePresetCollection(
  presets,
  name,
  controls,
  now = Date.now(),
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return presets;
  }

  const nextPresets = presets.filter((preset) => preset.name !== trimmedName);
  nextPresets.unshift({
    name: trimmedName,
    createdAt: now,
    controls: serializeControls(controls, CONTROL_DEFINITIONS),
  });
  return nextPresets;
}

export function deletePresetFromCollection(presets, name) {
  return presets.filter((preset) => preset.name !== name);
}

export function createControlsPersistScheduler({
  persist,
  delay = CONTROLS_PERSIST_DELAY_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
}) {
  let timerId = null;

  function clearPendingTimer() {
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  }

  return {
    schedule(value) {
      clearPendingTimer();
      timerId = setTimeoutFn(() => {
        timerId = null;
        persist(value);
      }, delay);
    },
    flush(value) {
      clearPendingTimer();
      persist(value);
    },
    cancel() {
      clearPendingTimer();
    },
  };
}
