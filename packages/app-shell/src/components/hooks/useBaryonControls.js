import { useMemo } from "react";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
import {
  useControlsActions,
  useControlsSnapshot,
  useControlsStore,
} from "../../controls/useControlsStore.js";
import { getVisibleControlLayout } from "./baryonControlsState.js";

const noop = () => {};

export function useBaryonControls({ operatorControlKeys = [] } = {}) {
  const store = useControlsStore();
  const controlsState = useControlsSnapshot(
    (snapshot) => snapshot.controlsState,
  );
  const presets = useControlsSnapshot((snapshot) => snapshot.presets);
  const presetName = useControlsSnapshot((snapshot) => snapshot.presetName);
  const selectedPresetName = useControlsSnapshot(
    (snapshot) => snapshot.selectedPresetName,
  );
  const {
    updateControl,
    resetControls,
    setPresetName,
    savePreset,
    loadPreset,
    deletePreset,
  } = useControlsActions();
  const { folderGroups, presetsAreaControls } = useMemo(
    () =>
      getVisibleControlLayout({
        devtoolsEnabled: DEVTOOLS_ENABLED,
        method:
          controlsState.visualizationMethod ?? DEFAULT_VISUALIZATION_METHOD,
        operatorControlKeys,
      }),
    [controlsState.visualizationMethod, operatorControlKeys],
  );

  return {
    controlsRef: store.controlsRef,
    controlsState,
    folderGroups,
    presetsAreaControls,
    presets,
    presetName,
    selectedPresetName,
    isControlsPanelLoaded: false,
    isControlsPanelOpen: false,
    setPresetName,
    updateControl,
    resetControls,
    savePreset,
    loadPreset,
    deletePreset,
    openControlsPanel: noop,
    closeControlsPanel: noop,
    toggleControlsPanel: noop,
  };
}
