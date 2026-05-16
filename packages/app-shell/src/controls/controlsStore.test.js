// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  PRESETS_KEY,
  SETTINGS_KEY,
} from "../components/hooks/baryonControlsState.js";
import { installLocalStorageMock } from "../test/installLocalStorageMock.js";
import * as localStorageMockModule from "../test/installLocalStorageMock.js";
import { createControlsStore } from "./controlsStore.js";

const CALIBRATED_CLARITY_NAME = "Calibrated Clarity";
const STAGE_CONTAINMENT_NAME = "Stage Containment";

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
      expect.objectContaining({
        name: CALIBRATED_CLARITY_NAME,
        builtIn: true,
      }),
      expect.objectContaining({
        name: STAGE_CONTAINMENT_NAME,
        builtIn: true,
      }),
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
    expect(
      store
        .getSnapshot()
        .presets.filter((preset) => preset.name === "Studio"),
    ).toHaveLength(1);

    store.deletePreset();

    expect(store.getSnapshot().selectedPresetName).toBe("");
    expect(
      store
        .getSnapshot()
        .presets.filter((preset) => preset.name === "Studio"),
    ).toHaveLength(0);
  });

  it("exposes the calibrated clarity preset without writing it to storage", () => {
    const store = createControlsStore();

    expect(store.getSnapshot().presets[0]?.name).toBe(CALIBRATED_CLARITY_NAME);

    store.loadPreset(CALIBRATED_CLARITY_NAME);

    expect(store.getSnapshot().selectedPresetName).toBe(CALIBRATED_CLARITY_NAME);
    expect(store.controlsRef.current.structureMin).toBe(0.36);
    expect(store.controlsRef.current.structureMax).toBe(0.48);
    expect(store.controlsRef.current.densityGain).toBe(2.85);
    expect(store.controlsRef.current.absorption).toBe(3.05);
    expect(store.controlsRef.current.opacityGain).toBe(2.05);
    expect(store.controlsRef.current.holographicIntensity).toBe(0.36);
    expect(store.controlsRef.current.holographicFresnelPower).toBe(5.1);
    expect(store.controlsRef.current.bloomStrength).toBe(0.94);
    expect(store.controlsRef.current.bloomThreshold).toBe(0.2);
    expect(store.controlsRef.current.bloomResponseBias).toBe(0.86);
    expect(store.controlsRef.current.rimBloomBias).toBe(0.2);
    expect(store.controlsRef.current.rimCompression).toBe(1.08);

    const storedPresets = window.localStorage.getItem(PRESETS_KEY);
    expect(storedPresets).toBeNull();
  });

  it("preserves non-visual controls when loading a built-in visual preset", () => {
    const store = createControlsStore();

    store.updateControl("renderQualityPreset", "max-quality", {
      persistMode: "immediate",
    });
    store.updateControl("customPerformanceTargetFps", 72, {
      persistMode: "immediate",
    });

    store.loadPreset(CALIBRATED_CLARITY_NAME);
    store.updateControl("bloomThreshold", 0.41, { persistMode: "immediate" });

    expect(store.controlsRef.current.renderQualityPreset).toBe("max-quality");
    expect(store.controlsRef.current.customPerformanceTargetFps).toBe(72);
    expect(store.controlsRef.current.bloomThreshold).toBe(0.41);
    expect(store.getSnapshot().selectedPresetName).toBe("");
  });

  it("exposes the stage containment preset without writing it to storage", () => {
    const store = createControlsStore();

    expect(store.getSnapshot().presets[1]?.name).toBe(STAGE_CONTAINMENT_NAME);

    store.loadPreset(STAGE_CONTAINMENT_NAME);

    expect(store.getSnapshot().selectedPresetName).toBe(STAGE_CONTAINMENT_NAME);
    expect(store.controlsRef.current.structureMin).toBe(0.36);
    expect(store.controlsRef.current.structureMax).toBe(0.42);
    expect(store.controlsRef.current.densityGain).toBe(2.85);
    expect(store.controlsRef.current.absorption).toBe(3.75);
    expect(store.controlsRef.current.opacityGain).toBe(2.85);
    expect(store.controlsRef.current.holographicIntensity).toBe(0.46);
    expect(store.controlsRef.current.holographicFresnelPower).toBe(4.2);
    expect(store.controlsRef.current.bloomStrength).toBe(0.82);
    expect(store.controlsRef.current.bloomThreshold).toBe(0.42);
    expect(store.controlsRef.current.bloomResponseBias).toBe(0.72);
    expect(store.controlsRef.current.rimBloomBias).toBe(0.22);
    expect(store.controlsRef.current.spectralMix).toBe(0.95);

    const storedPresets = window.localStorage.getItem(PRESETS_KEY);
    expect(storedPresets).toBeNull();
  });

  it("does not delete built-in visual presets", () => {
    const store = createControlsStore();

    store.loadPreset(CALIBRATED_CLARITY_NAME);
    store.deletePreset();

    expect(store.getSnapshot().selectedPresetName).toBe(
      CALIBRATED_CLARITY_NAME,
    );
    expect(
      store
        .getSnapshot()
        .presets.some((preset) => preset.name === CALIBRATED_CLARITY_NAME),
    ).toBe(true);
  });
});
