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
const PRESETS_AREA_GROUP = "PresetsArea";
export const ANALYSIS_MODE_BASE_KEY = "__analysisModeBase";
export const DUAL_COMPARE_TOGGLE_KEY = "__dualCompareEnabled";
const PRESETS_AREA_CONTROL_ORDER = Object.freeze([
  "performanceHudEnabled",
  "renderQualityPreset",
  "customPerformanceTargetFps",
]);
const DIAGNOSTICS_CONTROL_ORDER = Object.freeze([
  DUAL_COMPARE_TOGGLE_KEY,
  "freezeModeSlots",
  "injectTestTone",
  "testToneHz",
  "testToneAmplitude",
  "cavityGeometry",
  "auditEnabled",
  "logEveryFrames",
  "lowLoadPlaybackDiagnostics",
  "bloomResponseBias",
  "rimBloomBias",
  "rimCompression",
  "forceWebGLFallbackTest",
]);

function createOperatorControlKeySet(operatorControlKeys = []) {
  return new Set(
    Array.isArray(operatorControlKeys)
      ? operatorControlKeys.filter((key) => typeof key === "string")
      : [],
  );
}

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
          "Choose which analysis model drives the visuals. Modal Excitation is the true-to-nature resonant-mode model, and Legacy Peak keeps the older peak-driven behavior.",
        binding: {
          ...(structuralImplementation.binding ?? {}),
          options: {
            "Legacy Peak": "legacy-peak",
            "Modal Excitation": "modal-excitation",
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
          "Cached is faster and usually looks the same. Direct recomputes the field live instead of using the 3D cache, so it costs more.",
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

function orderControlsByKey(controls, orderedKeys) {
  const keyOrder = new Map(orderedKeys.map((key, index) => [key, index]));

  return controls.slice().sort((left, right) => {
    const leftOrder = keyOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = keyOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return 0;
  });
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

  return orderControlsByKey(
    [
      ...filteredControls,
      cloneControlDefinition(structuralImplementation, {
        key: DUAL_COMPARE_TOGGLE_KEY,
        label: "Dual Compare",
        title:
          "Run both analysis modes at the same time so you can compare them in Diagnostics. Turn this off to go back to the selected mode above.",
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
    ],
    DIAGNOSTICS_CONTROL_ORDER,
  );
}

function createVisibleFolderGroups({
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  const operatorControlKeySet =
    createOperatorControlKeySet(operatorControlKeys);
  return getControlFolders(method)
    .map((title) => {
      let controls = getControlsForFolder(title, method).filter(
        (definition) =>
          devtoolsEnabled ||
          operatorControlKeySet.has(definition.key) ||
          definition.status !== CONTROL_STATUSES.debugOnly,
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

function splitPresentationGroups(folderGroups) {
  const controlByKey = new Map();
  for (const group of folderGroups) {
    for (const definition of group.controls) {
      controlByKey.set(definition.key, definition);
    }
  }

  const presetsAreaControls = PRESETS_AREA_CONTROL_ORDER.map((key) =>
    controlByKey.get(key),
  ).filter(Boolean);
  const presetsAreaControlKeys = new Set(PRESETS_AREA_CONTROL_ORDER);
  const visibleGroups = folderGroups
    .map((group) => ({
      ...group,
      controls: group.controls.filter(
        (definition) => !presetsAreaControlKeys.has(definition.key),
      ),
    }))
    .filter(
      (group) => group.title !== PRESETS_AREA_GROUP && group.controls.length,
    );

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

export function getVisibleControlLayout({
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  return splitPresentationGroups(
    createVisibleFolderGroups({ devtoolsEnabled, method, operatorControlKeys }),
  );
}

export function getVisibleControlGroups({
  devtoolsEnabled,
  method = DEFAULT_VISUALIZATION_METHOD,
  operatorControlKeys = [],
}) {
  return getVisibleControlLayout({
    devtoolsEnabled,
    method,
    operatorControlKeys,
  }).folderGroups;
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
