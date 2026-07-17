// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  createControlState,
} from "@baryon/engine/controls/schema";
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

function readStoredSettings() {
  return JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
}

const liveControlKeys = CONTROL_DEFINITIONS.filter(
  (definition) => definition.status === CONTROL_STATUSES.live,
).map((definition) => definition.key);

const debugOnlyControlKeys = CONTROL_DEFINITIONS.filter(
  (definition) => definition.status === CONTROL_STATUSES.debugOnly,
).map((definition) => definition.key);

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

  it("hydrates sparse v2 settings over current defaults", () => {
    seedStorage({
      controls: {
        version: 2,
        controls: {
          backgroundColor: "#102030",
        },
      },
    });

    const store = createControlsStore();

    expect(store.controlsRef.current.backgroundColor).toBe("#102030");
    expect(store.controlsRef.current.bloomStrength).toBe(
      createControlState().bloomStrength,
    );
  });

  it("strips legacy thickness controls from settings and presets", () => {
    seedStorage({
      controls: {
        version: 2,
        controls: { zeroPointPrecision: 0.106 },
      },
      presets: [
        {
          name: "Legacy carrier",
          controls: { zeroPointPrecision: 0.084 },
        },
      ],
    });

    const store = createControlsStore();

    expect(store.controlsRef.current).not.toHaveProperty("zeroPointPrecision");
    expect(store.controlsRef.current).not.toHaveProperty(
      "carrierCoreFwhmWorld",
    );
    expect(store.getSnapshot().presets[0].controls).not.toHaveProperty(
      "zeroPointPrecision",
    );
  });

  it("discards an interim v3 width on migration", () => {
    seedStorage({
      controls: {
        version: 3,
        controls: {
          carrierCoreFwhmWorld: 0.142,
          backgroundColor: "#102030",
        },
      },
    });

    const store = createControlsStore();

    expect(store.controlsRef.current).not.toHaveProperty(
      "carrierCoreFwhmWorld",
    );
    store.updateControl("backgroundColor", "#203040", {
      persistMode: "immediate",
    });
    expect(readStoredSettings()).toEqual({
      version: 6,
      controls: {
        backgroundColor: "#203040",
      },
    });
  });

  it("does not rewrite legacy raw settings until the next allowed persist", () => {
    const legacySettings = {
      bloomStrength: 1.02,
      bloomRadius: 0.04,
      bloomThreshold: 0.08,
      backgroundColor: "#102030",
    };
    seedStorage({ controls: legacySettings });
    const storedBeforeCreate = window.localStorage.getItem(SETTINGS_KEY);

    const store = createControlsStore();

    expect(store.controlsRef.current.bloomStrength).toBe(
      createControlState().bloomStrength,
    );
    expect(store.controlsRef.current.bloomRadius).toBe(
      createControlState().bloomRadius,
    );
    expect(store.controlsRef.current.bloomThreshold).toBe(
      createControlState().bloomThreshold,
    );
    expect(store.controlsRef.current.backgroundColor).toBe("#102030");
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(storedBeforeCreate);

    store.updateControl("backgroundColor", "#203040", {
      persistMode: "immediate",
    });

    expect(readStoredSettings()).toEqual({
      version: 6,
      controls: {
        backgroundColor: "#203040",
      },
    });
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

    store.updateControl("bloomStrength", 1.4, {
      persistMode: "debounced",
    });
    store.dispose();

    const restoredStore = createControlsStore();
    expect(restoredStore.controlsRef.current.bloomStrength).toBe(1.4);
  });

  it("persists unchanged non-default updates by adding explicit ownership", () => {
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#223344", {
      persistMode: "none",
    });
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();

    store.updateControl("backgroundColor", "#223344", {
      persistMode: "immediate",
    });

    expect(readStoredSettings()).toEqual({
      version: 6,
      controls: {
        backgroundColor: "#223344",
      },
    });
  });

  it("clears explicit ownership when directly updated to the default", () => {
    seedStorage({
      controls: {
        version: 5,
        controls: {
          backgroundColor: "#000000",
        },
      },
    });
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#000000", {
      persistMode: "immediate",
    });

    expect(readStoredSettings()).toEqual({ version: 6, controls: {} });
  });

  it("does not make derived Spectral Light mix explicit", () => {
    const store = createControlsStore();

    store.updateControl("colorMode", "static", {
      persistMode: "none",
    });
    store.updateControl("spectralMix", 0, {
      persistMode: "none",
    });
    store.updateControl("colorMode", "spectral", {
      persistMode: "immediate",
    });

    expect(store.controlsRef.current.spectralMix).toBe(0.96);
    // "spectral" is an explicit non-default choice under the static baseline;
    // the derived spectralMix repair must still stay out of storage.
    expect(readStoredSettings()).toEqual({
      version: 6,
      controls: { colorMode: "spectral" },
    });
  });

  it("keeps non-persistent updates out of storage and explicit ownership", () => {
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#445566", {
      persistMode: "none",
    });
    store.updateControl("bloomStrength", 1.4, {
      persistMode: "immediate",
    });

    expect(readStoredSettings()).toEqual({
      version: 6,
      controls: {
        bloomStrength: 1.4,
      },
    });
  });

  it("debounced persistence snapshots do not observe later non-persistent mutations", () => {
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#111111", {
      persistMode: "debounced",
    });
    store.updateControl("backgroundColor", "#222222", {
      persistMode: "none",
    });
    store.dispose();

    expect(store.controlsRef.current.backgroundColor).toBe("#222222");
    expect(readStoredSettings()).toEqual({
      version: 6,
      controls: {
        backgroundColor: "#111111",
      },
    });
  });

  it("seeds a positive Spectral Light mix when selecting Spectral mode", () => {
    const store = createControlsStore();

    store.updateControl("colorMode", "static");
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

  it("resetControls writes empty v6 settings", () => {
    const store = createControlsStore();

    store.updateControl("backgroundColor", "#223344", {
      persistMode: "immediate",
    });
    store.resetControls();

    expect(readStoredSettings()).toEqual({ version: 6, controls: {} });
    expect(store.controlsRef.current.backgroundColor).toBe(
      createControlState().backgroundColor,
    );
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

  it("loads presets as full explicit v6 settings", () => {
    seedStorage({
      presets: [
        {
          name: "Full Stage",
          controls: {
            backgroundColor: "#010203",
            structureMin: 0.12,
          },
        },
      ],
    });
    const store = createControlsStore();

    store.loadPreset("Full Stage");

    const settings = readStoredSettings();
    expect(settings.version).toBe(6);
    expect(Object.keys(settings.controls).sort()).toEqual(
      liveControlKeys.slice().sort(),
    );
    expect(settings.controls.backgroundColor).toBe("#010203");
    expect(settings.controls.liveInputAcousticIntent).toBe("ambient");
    for (const key of debugOnlyControlKeys) {
      expect(settings.controls).not.toHaveProperty(key);
    }
    expect(settings.controls).not.toHaveProperty("structureMin");
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
