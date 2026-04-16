import { useContext, useMemo, useSyncExternalStore } from "react";
import { ControlsContext } from "./ControlsContext.js";

export function useControlsStore() {
  const store = useContext(ControlsContext);
  if (!store) {
    throw new Error("ControlsProvider is required for controls access.");
  }
  return store;
}

export function useControlsSnapshot(selector = (snapshot) => snapshot) {
  const store = useControlsStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

export function useControlsActions() {
  const store = useControlsStore();
  return useMemo(
    () => ({
      updateControl: store.updateControl,
      resetControls: store.resetControls,
      setPresetName: store.setPresetName,
      savePreset: store.savePreset,
      loadPreset: store.loadPreset,
      deletePreset: store.deletePreset,
    }),
    [store],
  );
}
