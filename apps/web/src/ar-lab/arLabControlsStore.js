import { createControlsStore } from "@baryon/app-shell/controls-store";

const AR_LAB_OUTPUT_BASELINE = Object.freeze({
  outputMode: "transparent",
  outputBackgroundColor: "#000000",
});

export function createArLabControlsStore() {
  const store = createControlsStore({ storage: null });

  for (const [key, value] of Object.entries(AR_LAB_OUTPUT_BASELINE)) {
    store.updateControl(key, value, {
      persistMode: "none",
      clearPresetSelection: false,
    });
  }

  return store;
}
