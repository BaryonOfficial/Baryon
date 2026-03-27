import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  createControlState,
  getControlFolders,
  getControlsForFolder,
} from "@baryon/visualizer/controls/schema";
import { AUDIT_DEFAULTS } from "@baryon/visualizer/defaults";
import {
  deserializeControls,
  serializeControls,
} from "@baryon/visualizer/controls/persistence";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";

export const SETTINGS_KEY = "baryon:settings";
export const PRESETS_KEY = "baryon:presets";
export const CONTROLS_PERSIST_DELAY_MS = 500;
const MODE_GROUP = "Mode";
const DIAGNOSTICS_GROUP = "Diagnostics";
export const ANALYSIS_MODE_BASE_KEY = "__analysisModeBase";
export const DUAL_COMPARE_TOGGLE_KEY = "__dualCompareEnabled";

function cloneControlDefinition(definition, overrides = {}) {
  return {
    ...definition,
    ...overrides,
    binding:
      Object.prototype.hasOwnProperty.call(overrides, "binding") &&
      overrides.binding !== undefined
        ? overrides.binding
        : definition.binding,
  };
}

function getControlDefinitionForMethod(key, method) {
  return (
    CONTROL_DEFINITIONS.find(
      (definition) =>
        definition.key === key && definition.methods.includes(method),
    ) ?? null
  );
}

function createPromotedModeControls(method) {
  const promotedControls = [];
  const structuralImplementation = getControlDefinitionForMethod(
    "structuralImplementation",
    method,
  );
  const fieldCacheOverride = getControlDefinitionForMethod(
    "fieldCacheOverride",
    method,
  );

  if (structuralImplementation) {
    promotedControls.push(
      cloneControlDefinition(structuralImplementation, {
        key: ANALYSIS_MODE_BASE_KEY,
        title:
          "Choose how Baryon reads the sound. Legacy Peak is a physics-artistic mix. Modal Excitation is true-to-nature.",
        binding: {
          ...(structuralImplementation.binding ?? {}),
          options: {
            "Legacy Peak (physics-artistic mix)": "legacy-peak",
            "Modal Excitation (true-to-nature)": "modal-excitation",
          },
        },
        group: MODE_GROUP,
        folder: MODE_GROUP,
        getValue(controlsState) {
          return (
            controlsState[ANALYSIS_MODE_BASE_KEY] ??
            AUDIT_DEFAULTS.structuralImplementation
          );
        },
        applyChange(nextValue, controlsState, updateControl) {
          updateControl(ANALYSIS_MODE_BASE_KEY, nextValue);
          if (controlsState.structuralImplementation !== "dual") {
            updateControl("structuralImplementation", nextValue);
          }
        },
      }),
    );
  }

  if (fieldCacheOverride) {
    promotedControls.push(
      cloneControlDefinition(fieldCacheOverride, {
        title:
          "Cached is faster, but loses precision. Direct is computationally expensive, but precise.",
        group: MODE_GROUP,
        folder: MODE_GROUP,
      }),
    );
  }

  return promotedControls;
}

function insertModeControlsAfterBoundary(controls, promotedControls) {
  if (promotedControls.length === 0) {
    return controls;
  }

  const boundaryIndex = controls.findIndex(
    (definition) => definition.key === "boundaryMode",
  );
  if (boundaryIndex === -1) {
    return [...controls, ...promotedControls];
  }

  return [
    ...controls.slice(0, boundaryIndex + 1),
    ...promotedControls,
    ...controls.slice(boundaryIndex + 1),
  ];
}

function createDiagnosticsControls(controls, method) {
  const filteredControls = controls.filter(
    (definition) =>
      definition.key !== "structuralImplementation" &&
      definition.key !== "fieldCacheOverride",
  );
  const structuralImplementation = getControlDefinitionForMethod(
    "structuralImplementation",
    method,
  );

  if (!structuralImplementation) {
    return filteredControls;
  }

  return [
    ...filteredControls,
    cloneControlDefinition(structuralImplementation, {
      key: DUAL_COMPARE_TOGGLE_KEY,
      label: "Dual Compare",
      title:
        "Temporarily run both analysis modes at the same time so you can compare them in diagnostics. Turn this off to go back to the analysis mode selected above.",
      binding: {
        view: "toggle",
      },
      defaultValue: false,
      group: DIAGNOSTICS_GROUP,
      folder: DIAGNOSTICS_GROUP,
      getValue(controlsState) {
        return controlsState.structuralImplementation === "dual";
      },
      applyChange(nextValue, controlsState, updateControl) {
        if (nextValue) {
          updateControl("structuralImplementation", "dual");
          return;
        }

        updateControl(
          "structuralImplementation",
          controlsState[ANALYSIS_MODE_BASE_KEY] ??
            AUDIT_DEFAULTS.structuralImplementation,
        );
      },
    }),
  ];
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
  controls[ANALYSIS_MODE_BASE_KEY] =
    controls.structuralImplementation === "legacy-peak"
      ? "legacy-peak"
      : AUDIT_DEFAULTS.structuralImplementation;

  if (!savedSettings) {
    return controls;
  }

  Object.assign(
    controls,
    deserializeControls(savedSettings, CONTROL_DEFINITIONS),
  );
  controls[ANALYSIS_MODE_BASE_KEY] =
    controls.structuralImplementation === "legacy-peak"
      ? "legacy-peak"
      : AUDIT_DEFAULTS.structuralImplementation;
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
      let controls = getControlsForFolder(title, method).filter(
        (definition) =>
          devtoolsEnabled || definition.status !== CONTROL_STATUSES.debugOnly,
      );

      if (title === MODE_GROUP) {
        controls = insertModeControlsAfterBoundary(
          controls,
          createPromotedModeControls(method),
        );
      } else if (title === DIAGNOSTICS_GROUP && devtoolsEnabled) {
        controls = createDiagnosticsControls(controls, method);
      }

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
