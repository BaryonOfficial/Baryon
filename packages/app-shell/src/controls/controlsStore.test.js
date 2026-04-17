// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  PRESETS_KEY,
  SETTINGS_KEY,
} from "../components/hooks/baryonControlsState.js";
import { installLocalStorageMock } from "../test/installLocalStorageMock.js";
import { createControlsStore } from "./controlsStore.js";

function seedStorage({ controls = null, presets = null } = {}) {
  window.localStorage.clear();
  if (controls) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(controls));
  }
  if (presets) {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }
}

describe("createControlsStore", () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.clear();
  });

  it("hydrates controls and presets from storage", () => {
    seedStorage({
      controls: {
        backgroundColor: "#102030",
        structuralImplementation: "legacy-peak",
      },
      presets: [
        {
          name: "Stage",
          controls: {
            backgroundColor: "#0f0f0f",
          },
        },
      ],
    });

    const store = createControlsStore();

    expect(store.controlsRef.current.backgroundColor).toBe("#102030");
    expect(store.controlsRef.current).not.toHaveProperty(
      "structuralImplementation",
    );
    expect(store.getSnapshot().presets).toStrictEqual([
      {
        name: "Stage",
        controls: {
          backgroundColor: "#0f0f0f",
        },
      },
    ]);
  });

  it("keeps controlsRef stable while publishing immutable snapshots", () => {
    const store = createControlsStore();
    const initialRef = store.controlsRef;
    const initialSnapshot = store.getSnapshot();

    store.updateControl("backgroundColor", "#223344");

    expect(store.controlsRef).toBe(initialRef);
    expect(store.getSnapshot()).not.toBe(initialSnapshot);
    expect(store.getSnapshot().controlsState.backgroundColor).toBe("#223344");
    expect(store.getSnapshot()).not.toHaveProperty("isOpen");
    expect(store.getSnapshot()).not.toHaveProperty("isLoaded");
  });

  it("notifies subscribers on state changes", () => {
    const store = createControlsStore();
    const snapshots = [];

    const unsubscribe = store.subscribe(() => {
      snapshots.push(store.getSnapshot());
    });

    store.updateControl("backgroundColor", "#334455");
    unsubscribe();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].controlsState.backgroundColor).toBe("#334455");
  });

  it("deletes the selected preset when deletePreset is called without a name", () => {
    const store = createControlsStore();

    store.setPresetName("Studio");
    store.savePreset();

    expect(store.getSnapshot().selectedPresetName).toBe("Studio");
    expect(store.getSnapshot().presets).toHaveLength(1);

    store.deletePreset();

    expect(store.getSnapshot().selectedPresetName).toBe("");
    expect(store.getSnapshot().presets).toHaveLength(0);
  });
});
