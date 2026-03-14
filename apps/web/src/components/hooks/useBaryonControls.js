import { useEffect, useRef } from "react";
import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  DEFAULT_VISUALIZATION_METHOD,
  createControlState,
  getControlFolders,
  getControlsForFolder,
  serializeControls,
  deserializeControls,
  createPreset,
} from "@baryon/visualizer";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
import {
  markBaryonTestControlsReady,
  resetBaryonTestReady,
} from "../../devtools/testReady.js";

const SETTINGS_KEY = "baryon:settings";
const PRESETS_KEY = "baryon:presets";

/** @typedef {{ name: string, createdAt: number, controls: Record<string, unknown> }} ControlPreset */
/** @typedef {{ refresh(): void }} PaneBinding */
/** @typedef {{ on(event: string, cb: () => void): void }} PaneButton */
/** @typedef {{ dispose(): void, on(event: "change", cb: (ev: { value: string }) => void): void, controller?: { value?: { rawValue?: string } } }} PaneListBlade */
/** @typedef {{ addBinding(target: object, key: string, options?: Record<string, unknown>): PaneBinding, addButton(params: { title: string }): PaneButton, addBlade(params: Record<string, unknown>): unknown }} PaneFolder */

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-browsing restriction — silently ignore
  }
}

function isVisibleControl(definition) {
  return DEVTOOLS_ENABLED || definition.status !== CONTROL_STATUSES.debugOnly;
}

function getVisibleControls(folderTitle) {
  return getControlsForFolder(folderTitle, DEFAULT_VISUALIZATION_METHOD).filter(
    isVisibleControl,
  );
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
  const controlsRef = useRef(createControlState());

  useEffect(() => {
    const p = controlsRef.current;
    let disposed = false;
    /** @type {null | (import("tweakpane").Pane & {
     *   addFolder(params: { title: string; expanded?: boolean }): PaneFolder;
     *   refresh(): void;
     *   on(event: string, cb: (ev: unknown) => void): void;
     * })} */
    let pane = null;

    const initPane = async () => {
      const { Pane } = await import("tweakpane");
      if (disposed) {
        return;
      }

      // --- Restore auto-saved settings before pane binds to `p` ---
      const savedSettings = loadFromStorage(SETTINGS_KEY);
      if (savedSettings) {
        Object.assign(
          p,
          deserializeControls(savedSettings, CONTROL_DEFINITIONS),
        );
      }

      pane = /** @type {typeof pane} */ (
        new Pane({ title: "Baryon", expanded: false })
      );
      pane.element.style.position = "fixed";
      pane.element.style.top = "1rem";
      pane.element.style.right = "1rem";
      pane.element.style.zIndex = "10000";

      const visibleFolders = getControlFolders(
        DEFAULT_VISUALIZATION_METHOD,
      ).filter((folderTitle) => getVisibleControls(folderTitle).length > 0);

      for (const folderTitle of visibleFolders) {
        const visibleControls = getVisibleControls(folderTitle);
        const folder = pane.addFolder({
          title: folderTitle,
          expanded: visibleControls[0]?.groupExpanded ?? false,
        });

        for (const definition of visibleControls) {
          const binding = folder.addBinding(p, definition.key, {
            label: definition.label,
            ...(definition.binding ?? {}),
          });
          if (definition.title) {
            /** @type {any} */ (binding).element.setAttribute(
              "title",
              definition.title,
            );
          }
        }
      }

      // --- Auto-save on any control change (debounced 500 ms) ---
      // Also clears the active preset indicator when the user manually edits a control after loading.
      let saveTimer = null;
      pane.on("change", () => {
        emitControlsChanged(p);
        if (allowPresetReset && activePresetName) {
          activePresetName = null;
          rebuildLoadBlade(presetsFolder);
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveToStorage(
            SETTINGS_KEY,
            serializeControls(p, CONTROL_DEFINITIONS),
          );
        }, 500);
      });

      // --- Presets folder ---
      /** @type {ControlPreset[]} */
      let presets = loadFromStorage(PRESETS_KEY) ?? [];
      const presetNameState = { name: "" };
      /** @type {null | PaneListBlade} */
      let loadBlade = null;
      let activePresetName = null; // name shown in the Load dropdown; null = no preset / controls modified
      let allowPresetReset = false; // becomes true (via setTimeout) after a preset loads; next control change clears it

      function persistPresets() {
        saveToStorage(PRESETS_KEY, presets);
      }

      /** @param {PaneFolder} folder */
      function rebuildLoadBlade(folder) {
        loadBlade?.dispose();
        allowPresetReset = false;
        const options = [
          { text: "— Select a preset —", value: "" },
          ...presets.map((pr) => ({ text: pr.name, value: pr.name })),
        ];
        loadBlade = /** @type {typeof loadBlade} */ (
          folder.addBlade({
            view: "list",
            label: "Load",
            options,
            value: activePresetName ?? "",
          })
        );
        loadBlade.on("change", (ev) => {
          if (!ev.value) return; // placeholder — do nothing
          const preset = presets.find((pr) => pr.name === ev.value);
          if (preset) {
            Object.assign(
              p,
              deserializeControls(preset.controls, CONTROL_DEFINITIONS),
            );
            pane.refresh();
            activePresetName = ev.value;
            // Defer monitoring so the list's own change event doesn't immediately clear the selection
            setTimeout(() => {
              allowPresetReset = true;
            }, 0);
          }
        });
      }

      const presetsFolder = pane.addFolder({
        title: "Presets",
        expanded: false,
      });
      const nameBinding = presetsFolder.addBinding(presetNameState, "name", {
        label: "Name",
      });

      presetsFolder.addButton({ title: "Save" }).on("click", () => {
        const name = presetNameState.name.trim();
        if (!name) return;
        // Overwrite if a preset with the same name already exists
        presets = presets.filter((pr) => pr.name !== name);
        presets.unshift(createPreset(name, p, CONTROL_DEFINITIONS));
        persistPresets();
        activePresetName = null;
        rebuildLoadBlade(presetsFolder);
        // Clear the name field
        presetNameState.name = "";
        nameBinding.refresh();
      });

      presetsFolder
        .addButton({ title: "Reset to defaults" })
        .on("click", () => {
          Object.assign(p, createControlState());
          pane.refresh();
          activePresetName = null;
          rebuildLoadBlade(presetsFolder);
        });

      presetsFolder.addButton({ title: "Delete Selected" }).on("click", () => {
        const selected = loadBlade?.controller?.value?.rawValue;
        if (!selected) return; // placeholder — nothing to delete
        presets = presets.filter((pr) => pr.name !== selected);
        persistPresets();
        activePresetName = null;
        rebuildLoadBlade(presetsFolder);
        // Controls are intentionally left unchanged
      });

      // Populate list from saved presets on init
      rebuildLoadBlade(presetsFolder);

      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        window.__baryonControls = {
          getState() {
            return { ...p };
          },
          setControl(key, value) {
            if (!(key in p)) {
              throw new Error(`[Baryon controls] Unknown control key: ${key}`);
            }
            p[key] = value;
            pane.refresh();
            emitControlsChanged(p);
            return { ...p };
          },
        };
        markBaryonTestControlsReady();
      }

      emitControlsChanged(p);
    };

    void initPane();

    return () => {
      disposed = true;
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonControls;
      }
      resetBaryonTestReady();
      pane?.dispose();
    };
  }, [controlsRef]);

  return controlsRef;
}
