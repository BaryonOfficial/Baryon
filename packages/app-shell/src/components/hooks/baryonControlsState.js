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
const CONTROLS_PERSIST_DELAY_MS = 500;
const PRESETS_AREA_GROUP = "PresetsArea";
const PRESETS_AREA_CONTROL_ORDER = Object.freeze([
  "performanceHudEnabled",
  "renderQualityPreset",
  "customPerformanceTargetFps",
]);

function createOperatorControlKeySet(operatorControlKeys = []) {
  return new Set(
    Array.isArray(operatorControlKeys)
      ? operatorControlKeys.filter((key) => typeof key === "string")
      : [],
  );
}

function createVisibleFolderGroups({
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  const operatorControlKeySet =
    createOperatorControlKeySet(operatorControlKeys);
  return getControlFolders(method).flatMap((title) => {
    const controls = getControlsForFolder(title, method).filter(
      (definition) =>
        devtoolsEnabled ||
        operatorControlKeySet.has(definition.key) ||
        definition.status !== CONTROL_STATUSES.debugOnly,
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
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  return splitPresentationGroups(
    createVisibleFolderGroups({ devtoolsEnabled, method, operatorControlKeys }),
  );
}

export function persistControls(storage, controls) {
  const serializedControls = serializeControls(controls, CONTROL_DEFINITIONS);
  writeStoredJson(storage, SETTINGS_KEY, serializedControls);
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
