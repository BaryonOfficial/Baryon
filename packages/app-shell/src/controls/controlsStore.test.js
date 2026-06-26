// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  PRESETS_KEY,
  SETTINGS_KEY,
} from "../components/hooks/baryonControlsState.js";
import { installLocalStorageMock } from "../test/installLocalStorageMock.js";
import * as localStorageMockModule from "../test/installLocalStorageMock.js";
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

  it("installLocalStorageMock keeps raw storage constructors internal", () => {
    expect("createLocalStorageMock" in localStorageMockModule).toBe(false);
  });

  it("hydrates controls and presets from storage", () => {
    seedStorage({
      controls: {
        backgroundColor: "#102030",
        structuralImplementation: "legacy-peak",
        structureMin: 0.12,
        structureMax: 0.48,
      },
      presets: [
        {
          name: "Stage",
          createdAt: 42,
          staleMetadata: "legacy",
          controls: {
            backgroundColor: "#0f0f0f",
            structureMin: 0.2,
            structureMax: 0.4,
          },
        },
      ],
    });

    const store = createControlsStore();

    expect(store.controlsRef.current.backgroundColor).toBe("#102030");
    expect(store.controlsRef.current).not.toHaveProperty(
      "structuralImplementation",
    );
    expect(store.controlsRef.current).not.toHaveProperty("structureMin");
    expect(store.controlsRef.current).not.toHaveProperty("structureMax");
    expect(store.getSnapshot().presets).toEqual([
      expect.objectContaining({
        name: "Stage",
        controls: expect.objectContaining({
          backgroundColor: "#0f0f0f",
        }),
      }),
    ]);
    const userPreset = store
      .getSnapshot()
      .presets.find((preset) => preset.name === "Stage");
    expect(userPreset?.createdAt).toBe(42);
    expect(userPreset).not.toHaveProperty("staleMetadata");
    expect(userPreset?.controls).not.toHaveProperty("structureMin");
    expect(userPreset?.controls).not.toHaveProperty("structureMax");
  });

  it("starts without selectable presets when storage is empty", () => {
    const store = createControlsStore();

    expect(store.getSnapshot().presets).toEqual([]);
    expect(store.getSnapshot().selectedPresetName).toBe("");
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

  it("flushes pending remembered control changes when disposed", () => {
    const store = createControlsStore();

    store.updateControl("zeroPointPrecision", 0.106, {
      persistMode: "debounced",
    });
    store.dispose();

    const restoredStore = createControlsStore();
    expect(restoredStore.controlsRef.current.zeroPointPrecision).toBe(0.106);
  });

  it("seeds a positive Spectral Light mix when selecting Spectral mode", () => {
    const store = createControlsStore();

    store.updateControl("spectralMix", 0);
    expect(store.controlsRef.current.colorMode).toBe("static");
    expect(store.controlsRef.current.spectralMix).toBe(0);

    store.updateControl("colorMode", "spectral");

    expect(store.controlsRef.current.colorMode).toBe("spectral");
    expect(store.controlsRef.current.spectralMix).toBe(0.96);
    expect(store.getSnapshot().controlsState).toMatchObject({
      colorMode: "spectral",
      spectralMix: 0.96,
    });
  });

  it("deletes the selected preset when deletePreset is called without a name", () => {
    const store = createControlsStore();

    store.setPresetName("Studio");
    store.savePreset();

    expect(store.getSnapshot().selectedPresetName).toBe("Studio");
    expect(
      store.getSnapshot().presets.filter((preset) => preset.name === "Studio"),
    ).toHaveLength(1);

    store.deletePreset();

    expect(store.getSnapshot().selectedPresetName).toBe("");
    expect(
      store.getSnapshot().presets.filter((preset) => preset.name === "Studio"),
    ).toHaveLength(0);
  });

  it("ignores preset loads for names absent from user storage", () => {
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#223344", {
      persistMode: "none",
    });
    const before = store.getSnapshot();

    store.loadPreset("Missing Stage");

    expect(store.getSnapshot()).toBe(before);
    expect(store.controlsRef.current.backgroundColor).toBe("#223344");
    expect(store.getSnapshot().selectedPresetName).toBe("");
  });

  it("loads only user-saved presets", () => {
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#445566", {
      persistMode: "none",
    });
    store.updateControl("renderQualityPreset", "max-quality", {
      persistMode: "none",
    });
    store.setPresetName("Saved Stage");
    store.savePreset();
    store.updateControl("backgroundColor", "#000000", {
      persistMode: "none",
    });

    store.loadPreset("Saved Stage");

    expect(store.getSnapshot().selectedPresetName).toBe("Saved Stage");
    expect(store.controlsRef.current.backgroundColor).toBe("#445566");
    expect(store.controlsRef.current.renderQualityPreset).toBe("max-quality");
  });

  it("drops legacy structure-window fields from user presets and saved presets", () => {
    seedStorage({
      presets: [
        {
          name: "Legacy Stage",
          controls: {
            backgroundColor: "#010203",
            structureMin: 0.12,
            structureMax: 0.48,
          },
        },
      ],
    });
    const store = createControlsStore();

    store.loadPreset("Legacy Stage");

    expect(store.controlsRef.current.backgroundColor).toBe("#010203");
    expect(store.controlsRef.current).not.toHaveProperty("structureMin");
    expect(store.controlsRef.current).not.toHaveProperty("structureMax");

    store.setPresetName("Round Trip");
    store.savePreset();

    const savedPresets = JSON.parse(window.localStorage.getItem(PRESETS_KEY));
    expect(savedPresets[0].name).toBe("Round Trip");
    expect(savedPresets[0].controls).not.toHaveProperty("structureMin");
    expect(savedPresets[0].controls).not.toHaveProperty("structureMax");
  });
});
