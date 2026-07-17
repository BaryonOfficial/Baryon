import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  createControlState,
  getControlFolders,
  getControlsForFolder,
} from "@baryon/engine/controls/schema";
import {
  deserializeControlSettings,
  deserializeControls,
  serializeControlSettings,
  serializeControls,
} from "@baryon/engine/controls/persistence";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/engine/visualization/types";

export const SETTINGS_KEY = "baryon:settings";
export const PRESETS_KEY = "baryon:presets";
const CONTROLS_PERSIST_DELAY_MS = 500;
const PRESETS_AREA_GROUP = "PresetsArea";
const PRESETS_AREA_CONTROL_ORDER = Object.freeze([]);

function createOperatorControlKeySet(operatorControlKeys = []) {
  return new Set(
    Array.isArray(operatorControlKeys)
      ? operatorControlKeys.filter((key) => typeof key === "string")
      : [],
  );
}

function controlMatchesVisibleWhen(definition, controlsState) {
  const condition = definition.visibleWhen;
  if (!condition) {
    return true;
  }

  const expectedValues = Array.isArray(condition.value)
    ? condition.value
    : [condition.value];
  return expectedValues.includes(controlsState?.[condition.key]);
}

function createVisibleFolderGroups({
  controlsState,
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  const resolvedControlsState = controlsState ?? createControlState();
  const operatorControlKeySet =
    createOperatorControlKeySet(operatorControlKeys);
  return getControlFolders(method).flatMap((title) => {
    const controls = getControlsForFolder(title, method).filter(
      (definition) =>
        controlMatchesVisibleWhen(definition, resolvedControlsState) &&
        (devtoolsEnabled ||
          operatorControlKeySet.has(definition.key) ||
          definition.status !== CONTROL_STATUSES.debugOnly),
    );

    if (controls.length === 0) {
      return [];
    }

    return [
      {
        title,
        expanded: controls[0]?.groupExpanded ?? false,
        controls,
      },
    ];
  });
}

function splitPresentationGroups(folderGroups) {
  const controlByKey = new Map();
  for (const group of folderGroups) {
    for (const definition of group.controls) {
      controlByKey.set(definition.key, definition);
    }
  }

  const presetsAreaControls = PRESETS_AREA_CONTROL_ORDER.flatMap((key) => {
    const control = controlByKey.get(key);
    return control ? [control] : [];
  });
  const presetsAreaControlKeys = new Set(PRESETS_AREA_CONTROL_ORDER);
  const visibleGroups = folderGroups.flatMap((group) => {
    const controls = group.controls.filter(
      (definition) => !presetsAreaControlKeys.has(definition.key),
    );
    if (group.title === PRESETS_AREA_GROUP || controls.length === 0) {
      return [];
    }
    return [{ ...group, controls }];
  });

  return {
    folderGroups: visibleGroups,
    presetsAreaControls,
  };
}

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

export function createInitialControlsSettingsState(storage) {
  const controls = createControlState();
  const savedSettings = readStoredJson(storage, SETTINGS_KEY);

  if (!savedSettings) {
    return { controls, explicitKeys: new Set() };
  }

  const savedControlSettings = deserializeControlSettings(
    savedSettings,
    CONTROL_DEFINITIONS,
  );
  Object.assign(controls, savedControlSettings.controls);
  return {
    controls,
    explicitKeys: savedControlSettings.explicitKeys,
  };
}

function sanitizeStoredPreset(preset) {
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
    return null;
  }

  const record = /** @type {Record<string, unknown>} */ (preset);
  if (typeof record.name !== "string" || record.name.trim() === "") {
    return null;
  }

  const controls = serializeControls(
    deserializeControls(record.controls, CONTROL_DEFINITIONS),
    CONTROL_DEFINITIONS,
  );

  if (
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt)
  ) {
    return {
      name: record.name,
      createdAt: record.createdAt,
      controls,
    };
  }

  return {
    name: record.name,
    controls,
  };
}

export function loadStoredPresets(storage) {
  const presets = readStoredJson(storage, PRESETS_KEY);
  if (!Array.isArray(presets)) {
    return [];
  }

  return presets.flatMap((preset) => {
    const sanitized = sanitizeStoredPreset(preset);
    return sanitized ? [sanitized] : [];
  });
}

export function getVisibleControlLayout({
  controlsState = null,
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  return splitPresentationGroups(
    createVisibleFolderGroups({
      controlsState,
      devtoolsEnabled,
      method,
      operatorControlKeys,
    }),
  );
}

export function persistControls(storage, controls, explicitKeys = new Set()) {
  const serializedSettings = serializeControlSettings(
    controls,
    CONTROL_DEFINITIONS,
    { explicitKeys },
  );
  writeStoredJson(storage, SETTINGS_KEY, serializedSettings);
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
  let pendingValue = null;

  function clearPendingTimer() {
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  }

  return {
    schedule(value) {
      clearPendingTimer();
      pendingValue = value;
      timerId = setTimeoutFn(() => {
        timerId = null;
        const valueToPersist = pendingValue;
        pendingValue = null;
        persist(valueToPersist);
      }, delay);
    },
    flush(value) {
      clearPendingTimer();
      pendingValue = null;
      persist(value);
    },
    flushPending() {
      if (pendingValue == null) {
        return;
      }
      const valueToPersist = pendingValue;
      clearPendingTimer();
      pendingValue = null;
      persist(valueToPersist);
    },
    cancel() {
      clearPendingTimer();
      pendingValue = null;
    },
  };
}
