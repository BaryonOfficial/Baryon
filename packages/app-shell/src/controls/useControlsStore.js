import { useContext, useMemo, useSyncExternalStore } from "react";
import { ControlsContext } from "./ControlsContext.js";

const SELECT_CONTROLS_SNAPSHOT = (snapshot) => snapshot;

export function useControlsStore() {
  const store = useContext(ControlsContext);
  if (!store) {
    throw new Error("ControlsProvider is required for controls access.");
  }
  return store;
}

export function useControlsSnapshot(
  selector = SELECT_CONTROLS_SNAPSHOT,
  isEqual = Object.is,
) {
  const store = useControlsStore();
  const getSelectedSnapshot = useMemo(() => {
    let initialized = false;
    let cachedValue = null;

    return () => {
      const nextValue = selector(store.getSnapshot());
      if (initialized && isEqual(cachedValue, nextValue)) {
        return cachedValue;
      }

      initialized = true;
      cachedValue = nextValue;
      return nextValue;
    };
  }, [isEqual, selector, store]);

  return useSyncExternalStore(
    store.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot,
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
